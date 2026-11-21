import * as THREE from 'three';

const MIN_CORNERS = 900; // As for VillaStaticView: leave the little fittings alone.
const MAX_CORNERS = 2 ** 21; // At most two 8 MiB scratch arrays, reused across material batches.
const MAX_UINT16_VERTICES = 65535; // 0xffff is WebGL2's fixed primitive-restart index, not a vertex.

type Plane = { name: string; attr: THREE.BufferAttribute; size: number; words: Uint32Array };
type Scratch = { slots: Uint32Array; remap: Uint32Array };

function ordinaryMaterial(m: THREE.Material) {
  // A custom vertex shader can depend on gl_VertexID even with identical vertex attributes.
  return (m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshBasicMaterial || m instanceof THREE.MeshPhongMaterial) &&
    m.onBeforeCompile === THREE.Material.prototype.onBeforeCompile && m.onBeforeRender === THREE.Material.prototype.onBeforeRender;
}

function rigidOwner(object: THREE.Object3D) {
  // Only the ordinary triangle Mesh, not a subclass (including skinned, instanced or batched meshes).
  if (!(object instanceof THREE.Mesh) || Object.getPrototypeOf(object) !== THREE.Mesh.prototype || object.count !== 1 ||
      object.morphTargetInfluences || object.morphTargetDictionary || object.getVertexPosition !== THREE.Mesh.prototype.getVertexPosition ||
      object.raycast !== THREE.Mesh.prototype.raycast || object.customDepthMaterial || object.customDistanceMaterial ||
      object.onBeforeRender !== THREE.Mesh.prototype.onBeforeRender || object.onAfterRender !== THREE.Mesh.prototype.onAfterRender ||
      object.onBeforeShadow !== THREE.Mesh.prototype.onBeforeShadow || object.onAfterShadow !== THREE.Mesh.prototype.onAfterShadow) return false;
  for (let p: THREE.Object3D | null = object; p; p = p.parent) {
    if (p.animations.length || p.userData.animated === true || (p instanceof THREE.Scene && p.overrideMaterial)) return false;
  }
  return Array.isArray(object.material) ? object.material.every(ordinaryMaterial) : ordinaryMaterial(object.material);
}

function readPlanes(g: THREE.BufferGeometry, count: number): Plane[] | undefined {
  const planes: Plane[] = [];
  for (const [name, attr] of Object.entries(g.attributes)) {
    // Accept Villa's separate static Float32 streams, not instance data, skin weights, custom
    // semantics, interleaved/packed/normalized values, upload callbacks or pending partial writes.
    if (!(attr instanceof THREE.BufferAttribute) ||
        (attr.constructor !== THREE.BufferAttribute && attr.constructor !== THREE.Float32BufferAttribute) ||
        attr.usage !== THREE.StaticDrawUsage || attr.updateRanges.length || attr.normalized || attr.gpuType !== THREE.FloatType ||
        attr.onUploadCallback !== THREE.BufferAttribute.prototype.onUploadCallback) return;
    const { array, itemSize: size } = attr;
    if (!(array instanceof Float32Array) || !(array.buffer instanceof ArrayBuffer) || attr.count !== count || array.length !== size * count) return;
    switch (name) {
      case 'position': case 'normal': if (size !== 3) return; break;
      case 'uv': case 'uv1': case 'uv2': case 'uv3': if (size !== 2) return; break;
      case 'color': if (size !== 3 && size !== 4) return; break;
      case 'tangent': if (size !== 4) return; break;
      default: return;
    }
    planes.push({ name, attr, size, words: new Uint32Array(array.buffer, array.byteOffset, array.length) });
  }
  return planes;
}

function hashVertex(planes: Plane[], vertex: number) {
  let hash = 0x811c9dc5;
  for (let p = 0; p < planes.length; p++) {
    const { words, size } = planes[p], begin = vertex * size;
    for (let i = begin; i < begin + size; i++) {
      // Fold high bits into low ones between words: grid coordinates often have identical low mantissas.
      hash = Math.imul(hash ^ (hash >>> 16) ^ words[i], 0x9e3779b1);
    }
  }
  return hash ^ (hash >>> 16);
}

function sameVertex(planes: Plane[], a: number, b: number) {
  for (let p = 0; p < planes.length; p++) {
    const { words, size } = planes[p], x = a * size, y = b * size;
    for (let k = 0; k < size; k++) if (words[x + k] !== words[y + k]) return false;
  }
  return true;
}

/** A zero result leaves the geometry and all its original buffers untouched. */
function indexGeometry(g: THREE.BufferGeometry, count: number, scratch: Scratch): number {
  const draw = g.drawRange;
  if (g.userData.animated === true || g.indirect || g.morphTargetsRelative || Object.keys(g.morphAttributes).length ||
      !Number.isSafeInteger(draw.start) || draw.start < 0 || (draw.count !== Infinity && (!Number.isSafeInteger(draw.count) || draw.count < 0))) return 0;
  const planes = readPlanes(g, count);
  if (!planes) return 0;
  // Three groups partition the triangle stream. Do not weld vertices across slots, even if a
  // complete tuple matches. Preserve nonstandard group layouts verbatim by not indexing them.
  let end = 0;
  for (const group of g.groups) {
    if (group.start !== end || !Number.isInteger(group.count) || group.count <= 0 || group.count % 3) return 0;
    end += group.count;
  }
  if (g.groups.length && end !== count) return 0;

  const capacity = 2 ** Math.ceil(Math.log2(count)), mask = capacity - 1;
  if (scratch.slots.length < capacity) {
    scratch.slots = new Uint32Array(capacity);
    scratch.remap = new Uint32Array(capacity);
  } else scratch.slots.fill(0, 0, capacity);
  const { slots, remap } = scratch;
  const stride = planes.reduce((bytes, p) => bytes + 4 * p.size, 0);
  // Require at least 1/8 net buffer savings INCLUDING the indices. Once this many distinct
  // tuples have been exceeded, no suffix can make conversion worthwhile, even if all repeats.
  const limit16 = Math.min(MAX_UINT16_VERTICES, Math.floor(count * (.875 - 2 / stride)));
  const limit32 = Math.floor(count * (.875 - 4 / stride));
  const limit = Math.max(limit16, limit32);
  let unique = 0, collisionBudget = count * 8;
  for (let group = 0; group < (g.groups.length || 1); group++) {
    const range = g.groups[group], start = range?.start ?? 0, stop = start + (range?.count ?? count);
    for (let i = start; i < stop; i++) {
      let slot = hashVertex(planes, i) & mask;
      for (;;) {
        const source = slots[slot] - 1;
        // Zero (or an entry in an earlier group) denotes an empty slot in this group.
        if (source < start) {
          if (unique === limit) return 0;
          slots[slot] = i + 1; remap[i] = unique++;
          break;
        }
        if (sameVertex(planes, i, source)) { remap[i] = remap[source]; break; }
        if (--collisionBudget === 0) return 0; // Bound even a pathological chain, without a partial edit.
        slot = (slot + 1) & mask;
      }
    }
  }

  // Remap IDs are assigned on first use. Re-purpose the hash table as a compact-ID -> source
  // list for the gather. No expanded attribute copies, per-vertex JS objects, or float conversions.
  for (let i = 0, next = 0; next < unique; i++) if (remap[i] === next) slots[next++] = i;
  const compact = planes.map(({ attr, words, size }) => {
    const length = unique * size;
    const packed = attr instanceof THREE.Float32BufferAttribute ? new THREE.Float32BufferAttribute(length, size) :
      new THREE.BufferAttribute(new Float32Array(length), size);
    packed.name = attr.name;
    const out = new Uint32Array(packed.array.buffer);
    for (let v = 0; v < unique; v++) {
      const src = slots[v] * size, dest = v * size;
      for (let k = 0; k < size; k++) out[dest + k] = words[src + k];
    }
    return packed;
  });
  const index = new THREE.BufferAttribute(unique <= MAX_UINT16_VERTICES ? new Uint16Array(remap.subarray(0, count)) : remap.slice(0, count), 1);
  for (let i = 0; i < planes.length; i++) g.setAttribute(planes[i].name, compact[i]);
  g.setIndex(index);
  return unique;
}

/** Call once on the complete owning scene AFTER authoring/rig setup and BEFORE first upload.
 * Only explicitly owned rigid batches are eligible. Count vertex records of converted geometries
 * once each (not faces, indices, skipped geometries or measured vertex-shader invocations).
 * Material slots, bounds, draw ranges and geometry identities remain owned by the scene. */
export function indexVillaRigidSurfaces(root: THREE.Object3D): { before: number; after: number } {
  const candidates = new Map<THREE.BufferGeometry, boolean>();
  root.traverse(object => {
    const g = (object as THREE.Mesh).geometry;
    if (!g || Object.getPrototypeOf(g) !== THREE.BufferGeometry.prototype || g.userData.villaRigidBatch !== true || g.index !== null) return;
    const count = g.getAttribute('position')?.count;
    if (!(count >= MIN_CORNERS && count <= MAX_CORNERS && count % 3 === 0)) return;
    // An ordinary mesh can share its geometry with a protected owner encountered later (even
    // a Line or Points). Decide on the entire set of owners before replacing any attributes.
    if (candidates.get(g) !== false) candidates.set(g, rigidOwner(object));
  });
  const scratch: Scratch = { slots: new Uint32Array(0), remap: new Uint32Array(0) };
  let before = 0, after = 0;
  for (const [g, safe] of candidates) if (safe) {
    const count = g.getAttribute('position').count, unique = indexGeometry(g, count, scratch);
    if (unique) { before += count; after += unique; }
  }
  return { before, after };
}
