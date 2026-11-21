import { Buffer } from 'node:buffer';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { indexVillaRigidSurfaces } from '../src/villaIndexedSurface.js';
import { createVillaPeripheralLandscape } from '../src/villaStreamModel.js';
import { VILLA_LANDSCAPE_RENDER_BUDGET } from '../src/villaStream.js';
import { createVillaPetModel } from '../src/villaPetModel.js';
import { createVillaPets } from '../src/villaPets.js';
import { createVillaAquariumLife } from '../src/villaAquarium.js';
import { createVillaWardrobe, createVillaWardrobes, VILLA_MASTER_WARDROBE } from '../src/villaWardrobe.js';
import { flameTongue } from '../src/villaInteriorHearth.js';

const noChange = { before: 0, after: 0 };
function soup(count = 1800, distinct = 3) {
  const p = new Float32Array(count * 3), n = new Float32Array(count * 3), uv = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const key = i % distinct;
    p[3 * i] = key === 2 ? 0 : key; p[3 * i + 1] = key === 2 ? 1 : 0;
    n[3 * i + 2] = 1; uv[2 * i] = p[3 * i] + .25; uv[2 * i + 1] = p[3 * i + 1] - .125;
  }
  const g = new THREE.BufferGeometry(); g.userData.villaRigidBatch = true;
  g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g;
}
const bytes = (a: THREE.TypedArray) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
function snapshot(g: THREE.BufferGeometry) {
  return Object.entries(g.attributes).map(([name, a]) => {
    const attr = a as THREE.BufferAttribute;
    // Own the expected bytes: an in-place overwrite of the source array must not fool the oracle.
    return { name, attr, original: Buffer.from(bytes(attr.array)) };
  });
}
function expectExactExpansion(g: THREE.BufferGeometry, saved: ReturnType<typeof snapshot>) {
  expect(Object.keys(g.attributes)).toEqual(saved.map(s => s.name));
  const index = g.getIndex()!;
  for (const { name, attr, original } of saved) {
    const compact = g.getAttribute(name) as THREE.BufferAttribute, packed = bytes(compact.array);
    const size = compact.itemSize * compact.array.BYTES_PER_ELEMENT;
    const expanded = Buffer.alloc(index.count * size);
    for (let i = 0; i < index.count; i++) {
      const src = index.array[i] * size;
      for (let k = 0; k < size; k++) expanded[i * size + k] = packed[src + k];
    }
    expect(expanded.equals(original), `expanded ${name}`).toBe(true);
    expect(bytes(attr.array).equals(original), `unmodified old ${name}`).toBe(true);
    expect(compact.constructor).toBe(attr.constructor); expect(compact.name).toBe(attr.name);
    expect(compact.itemSize).toBe(attr.itemSize); expect(compact.normalized).toBe(attr.normalized); expect(compact.gpuType).toBe(attr.gpuType);
    expect(compact.array.buffer).not.toBe(attr.array.buffer);
    expect(compact.array.buffer.byteLength).toBe(compact.array.byteLength); // No retained expanded backing store.
  }
}
const mesh = (g = soup()) => new THREE.Mesh(g, new THREE.MeshStandardMaterial());
const meshes = (root: THREE.Object3D) => {
  const result: THREE.Mesh[] = []; root.traverse(o => { if (o instanceof THREE.Mesh) result.push(o); }); return result;
};
function dispose(root: THREE.Object3D) {
  const gs = new Set<THREE.BufferGeometry>(), ms = new Set<THREE.Material>();
  for (const m of meshes(root)) { gs.add(m.geometry); for (const mat of Array.isArray(m.material) ? m.material : [m.material]) ms.add(mat); }
  gs.forEach(g => g.dispose()); ms.forEach(m => m.dispose()); root.clear();
}

describe('lossless, scene-owned rigid batch indexing', () => {
  it('retains every attribute bit, including seams, signed zero, one ULP, RGBA alpha and distinct NaN payloads', () => {
    const g = soup(), count = g.getAttribute('position').count;
    // Offset views occur in imported/shared storage; hashing from the backing store origin is incorrect.
    const backing = new Float32Array(count * 2 + 8).fill(12345), offset = backing.subarray(5, 5 + count * 2);
    offset.set(g.getAttribute('uv').array); g.setAttribute('uv', new THREE.BufferAttribute(offset, 2));
    for (const [key, size] of [['color', 4], ['uv1', 2], ['tangent', 4]] as const) {
      g.setAttribute(key, new THREE.Float32BufferAttribute(new Float32Array(count * size).fill(1), size));
    }
    const words = (key: string) => { const a = g.getAttribute(key).array; return new Uint32Array(a.buffer, a.byteOffset, a.length); };
    const p = words('position'), n = words('normal'), uv = words('uv'), uv1 = words('uv1'), color = words('color'), tangent = words('tangent');
    for (let i = 0; i < count; i += 3) switch ((i / 3) % 12) {
      case 0: break; // Unchanged corner (uv=.25,-.125).
      case 1: p[3 * i] = 0x80000000; break;
      case 2: n[3 * i + 1] = 0x3f800000; break;
      case 3: uv[2 * i] = 0x3e800001; break; // One ULP, not a tolerance weld.
      case 4: uv[2 * i] = 0x3e800001; uv[2 * i + 1] = 0x204b10fa; break; // Same entire 32-bit hash as case 0; distinct tuple.
      case 5: uv[2 * i] = 0x7fc000ab; break;
      case 6: uv[2 * i] = 0x7fa000ab; break; // Signalling vs quiet NaN, not JS-number equality.
      case 7: uv[2 * i + 1] = 1; break; // Smallest positive subnormal.
      case 8: uv[2 * i + 1] = 0xc4960800; break; // Tiled/world-space UV outside [0,1].
      case 9: uv1[2 * i] = 0x3f000001; break;
      case 10: color[4 * i + 3] = 0x3f7fffff; break;
      case 11: tangent[4 * i + 3] = 0xbf800000; break;
    }
    g.getAttribute('uv').name = 'oak metres'; const saved = snapshot(g), m = mesh(g);
    expect(indexVillaRigidSurfaces(m)).toEqual({ before: count, after: 14 }); // 12 versions of A; B,C unchanged.
    expectExactExpansion(g, saved);
    expect(g.boundingBox).toBeNull(); expect(g.boundingSphere).toBeNull();
    expect(backing[0]).toBe(12345); expect(backing.at(-1)).toBe(12345);
    expect(g.index!.array).toBeInstanceOf(Uint16Array);
    dispose(m);
  });

  it('retains the same material slots, group boundaries, winding, draw range, face IDs, ray hits and cached bounds', () => {
    const g = soup(); g.addGroup(0, 900, 1); g.addGroup(900, 900, 0); g.setDrawRange(897, 6);
    g.computeBoundingBox(); g.computeBoundingSphere(); g.boundingSphere!.radius += .125; // Deliberately conservative authored bound.
    const slots = [new THREE.MeshStandardMaterial(), new THREE.MeshBasicMaterial()], m = new THREE.Mesh(g, slots);
    const ray = new THREE.Raycaster(new THREE.Vector3(.2, .1, 1), new THREE.Vector3(0, 0, -1));
    const hits = () => ray.intersectObject(m).map(h => [h.faceIndex, h.face!.materialIndex, h.point.toArray(), h.normal!.toArray(), h.uv!.toArray()]);
    const result = hits(), saved = snapshot(g), { groups, boundingBox, boundingSphere, drawRange, userData } = g, radius = boundingSphere!.radius;
    expect(result.map(h => h.slice(0, 2))).toEqual([[299, 1], [300, 0]]);
    expect(indexVillaRigidSurfaces(m)).toEqual({ before: 1800, after: 6 });
    expect(hits()).toEqual(result); expectExactExpansion(g, saved);
    expect(g.index!.getX(900)).not.toBe(g.index!.getX(0));
    expect(m.material).toBe(slots); expect(m.geometry).toBe(g); expect(g.groups).toBe(groups); expect(g.drawRange).toBe(drawRange);
    expect(g.userData).toBe(userData); expect(g.boundingBox).toBe(boundingBox); expect(g.boundingSphere).toBe(boundingSphere);
    expect(g.boundingSphere!.radius).toBe(radius); dispose(m);
  });

  it('converts a shared ordinary geometry once without mutating another geometry’s aliased attribute or disposing shared resources', () => {
    const g = soup(), m = mesh(g), other = new THREE.BufferGeometry(), old = g.getAttribute('position');
    other.setAttribute('position', old);
    const root = new THREE.Group().add(m, new THREE.Mesh(g, m.material), new THREE.Mesh(other, m.material));
    const onGeometry = vi.fn(), onMaterial = vi.fn(); g.addEventListener('dispose', onGeometry); m.material.addEventListener('dispose', onMaterial);
    expect(indexVillaRigidSurfaces(root)).toEqual({ before: 1800, after: 3 });
    expect((root.children[1] as THREE.Mesh).geometry).toBe(g); expect(g.getAttribute('position')).not.toBe(old);
    expect(other.getAttribute('position')).toBe(old); expect(old.count).toBe(1800); expect(other.index).toBeNull();
    const packed = g.getAttribute('position'), index = g.index;
    expect(indexVillaRigidSurfaces(root)).toEqual(noChange); expect(g.index).toBe(index); expect(g.getAttribute('position')).toBe(packed);
    expect(onGeometry).not.toHaveBeenCalled(); expect(onMaterial).not.toHaveBeenCalled();
    dispose(root); expect(onGeometry).toHaveBeenCalledOnce(); expect(onMaterial).toHaveBeenCalledOnce();
  });

  it.each(['ordinary first', 'protected first'])('vetoes mixed ownership before mutation (%s)', order => {
    const root = new THREE.Group();
    for (const owner of [
      (g: THREE.BufferGeometry) => new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial(), 2),
      (g: THREE.BufferGeometry) => new THREE.SkinnedMesh(g),
      (g: THREE.BufferGeometry) => new THREE.Points(g),
      (g: THREE.BufferGeometry) => new THREE.LineSegments(g),
      (g: THREE.BufferGeometry) => { const m = mesh(g); m.getVertexPosition = (i, v) => v.set(i, 0, 0); return m; },
      (g: THREE.BufferGeometry) => { const m = mesh(g); m.morphTargetInfluences = [0]; return m; },
      (g: THREE.BufferGeometry) => new THREE.Group().add(mesh(g)),
    ]) {
      const g = soup(), m = mesh(g), second = owner(g); second.visible = false;
      if (second instanceof THREE.Group) second.userData.animated = true;
      root.add(...(order === 'ordinary first' ? [m, second] : [second, m]));
    }
    const originals = meshes(root).map(m => [m, m.geometry.getAttribute('position')] as const);
    expect(indexVillaRigidSurfaces(root)).toEqual(noChange);
    for (const [m, p] of originals) { expect(m.geometry.index).toBeNull(); expect(m.geometry.getAttribute('position')).toBe(p); }
    dispose(root);
  });

  it('fails closed on old Geometry, untagged/private shaders, malformed, morphed, and unsupported buffer layouts', () => {
    const unchanged = [
      (g: THREE.BufferGeometry) => { delete g.userData.villaRigidBatch; },
      (g: THREE.BufferGeometry) => { g.userData.animated = true; },
      (g: THREE.BufferGeometry) => { g.setDrawRange(.5, 180); },
      (g: THREE.BufferGeometry) => { g.deleteAttribute('position'); },
      (g: THREE.BufferGeometry) => { (g.getAttribute('normal') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage); },
      (g: THREE.BufferGeometry) => { (g.getAttribute('uv') as THREE.BufferAttribute).addUpdateRange(0, 4); },
      (g: THREE.BufferGeometry) => { (g.getAttribute('normal') as THREE.BufferAttribute).onUpload(() => {}); },
      (g: THREE.BufferGeometry) => { g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(300), 2)); },
      (g: THREE.BufferGeometry) => { g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(1800 * 4), 4)); },
      (g: THREE.BufferGeometry) => { g.setAttribute('color', new THREE.Uint8BufferAttribute(1800 * 4, 4, true)); },
      (g: THREE.BufferGeometry) => { g.setAttribute('uv', new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(new Float32Array(1800 * 4), 4), 2, 1)); },
      (g: THREE.BufferGeometry) => { g.setAttribute('color', new THREE.InstancedBufferAttribute(new Float32Array(1800 * 3), 3)); },
      (g: THREE.BufferGeometry) => { g.setAttribute('skinIndex', new THREE.Float32BufferAttribute(1800 * 4, 4)); },
      (g: THREE.BufferGeometry) => { g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(1800 * 4, 4)); },
      (g: THREE.BufferGeometry) => { g.setAttribute('privatePose', new THREE.Float32BufferAttribute(1800 * 3, 3)); },
      (g: THREE.BufferGeometry) => { g.morphAttributes.normal = [g.getAttribute('normal')]; },
      (g: THREE.BufferGeometry) => { g.morphTargetsRelative = true; },
      (g: THREE.BufferGeometry) => { g.addGroup(0, 90, 0); g.addGroup(87, 1713, 1); },
      (g: THREE.BufferGeometry) => { g.setIndex([2, 1, 0]); },
    ];
    for (const change of unchanged) {
      const g = soup(); change(g);
      const index = g.index, attributes = { ...g.attributes }, m = mesh(g);
      expect(indexVillaRigidSurfaces(m)).toEqual(noChange); expect(g.index).toBe(index);
      for (const [name, attr] of Object.entries(attributes)) expect(g.getAttribute(name)).toBe(attr);
    }
    const legacy = { isGeometry: true, vertices: [], faces: [], userData: { villaRigidBatch: true } };
    const old = new THREE.Mesh(), placeholder = old.geometry;
    Object.assign(old, { geometry: legacy }); // Attach after construction, as current Three only constructs meshes from BufferGeometry.
    const instanced = new THREE.InstancedBufferGeometry(); instanced.userData.villaRigidBatch = true;
    instanced.setAttribute('position', soup().getAttribute('position'));
    const privateShader = new THREE.Mesh(soup(), [new THREE.MeshStandardMaterial(), new THREE.ShaderMaterial()]);
    const withHook = mesh(); withHook.material.onBeforeCompile = shader => { shader.vertexShader += '/* gl_VertexID */'; };
    const instanceLayout = mesh(instanced), root = new THREE.Group().add(old, privateShader, withHook, instanceLayout);
    expect(indexVillaRigidSurfaces(root)).toEqual(noChange); expect(old.geometry).toBe(legacy);
    old.geometry = placeholder; for (const m of meshes(root)) expect(m.geometry.index).toBeNull(); dispose(root);
  });

  it.each([
    [897, 3, false], [900, 3, true], [901, 3, false], // Size and triangle-list guards.
    [960, 780, true], [960, 781, false], [1800, 1800, false], // 32-byte stride plus 2-byte indices: save at least 12.5%.
  ] as const)('only commits worthwhile batches (corners=%i, distinct=%i)', (n, u, converts) => {
    const g = soup(n, u), old = g.getAttribute('position'), m = mesh(g);
    expect(indexVillaRigidSurfaces(m)).toEqual(converts ? { before: n, after: u } : noChange);
    if (converts) expect(g.index!.count).toBe(n);
    else { expect(g.index).toBeNull(); expect(g.getAttribute('position')).toBe(old); }
  });

  it.each([65535, 65536])('selects the narrowest WebGL2-safe index array at %i distinct tuples', u => {
    const n = Math.ceil(u * 2 / 3) * 3, g = soup(n, u), m = mesh(g), saved = snapshot(g);
    expect(indexVillaRigidSurfaces(m)).toEqual({ before: n, after: u });
    expect(g.index!.array).toBeInstanceOf(u === 65535 ? Uint16Array : Uint32Array);
    expect(g.index!.array.byteLength).toBe(n * (u === 65535 ? 2 : 4)); expect(g.index!.getX(u - 1)).toBe(u - 1);
    expect(g.index!.getX(u)).toBe(0); expectExactExpansion(g, saved); dispose(m);
  });

  it('keeps the actual private gait buffers, aquarium/wardrobe instance updates and fire surfaces intact', () => {
    const root = new THREE.Group(), pets = createVillaPetModel(root), state = createVillaPets();
    const fish = createVillaAquariumLife(root), wardrobe = createVillaWardrobe(root), doors = createVillaWardrobes();
    const fire = mesh(flameTongue(3)); root.add(fire);
    try {
      const limb = root.getObjectByName('dog/legs-0/surface') as THREE.Mesh, p = limb.geometry.getAttribute('position');
      const protectedMeshes = [limb, fire, ...meshes(root).filter(m => m instanceof THREE.InstancedMesh)];
      const saved = protectedMeshes.map(m => [m, m.geometry, m.geometry.index, m.geometry.getAttribute('position')] as const);
      const influences = limb.morphTargetInfluences!, morphs = limb.geometry.morphAttributes.position;
      expect(indexVillaRigidSurfaces(root).before).toBeGreaterThan(0); // The rigid neighbor surfaces really were processed.
      let paw = 0; for (let i = 1; i < p.count; i++) if (p.getY(i) < p.getY(paw)) paw = i;
      const rest = limb.getVertexPosition(paw, new THREE.Vector3());
      const dog = state.pets.find(a => a.id === 'dog')!; dog.speed = .5; dog.gait = Math.PI / 2; pets.update(.2, state);
      expect(limb.getVertexPosition(paw, new THREE.Vector3()).distanceTo(rest)).toBeGreaterThan(.01);
      expect(limb.morphTargetInfluences).toBe(influences); expect(limb.geometry.morphAttributes.position).toBe(morphs);
      const instances = protectedMeshes.filter((m): m is THREE.InstancedMesh => m instanceof THREE.InstancedMesh);
      const matrices = instances.map(m => m.instanceMatrix.array.slice());
      doors.wardrobes[VILLA_MASTER_WARDROBE.id].progress = 1; wardrobe.update(doors); fish.update(.7, .2, true);
      expect(instances.filter(m => m.name === 'wardrobe/hinged-doors')).toHaveLength(3);
      expect(instances.some(m => m.name === 'aquarium/medaka-tail')).toBe(true);
      instances.forEach((m, i) => expect(bytes(m.instanceMatrix.array).equals(bytes(matrices[i]))).toBe(false));
      for (const [m, g, index, attr] of saved) { expect(m.geometry).toBe(g); expect(g.index).toBe(index); expect(g.getAttribute('position')).toBe(attr); }
    } finally { dispose(root); }
  });

  it('reduces retained bytes and short-range vertex work on all four real regional landscape draws, not triangle count', () => {
    const root = new THREE.Group(); createVillaPeripheralLandscape(root);
    try {
      const parts = meshes(root), geometries = parts.map(m => m.geometry), originals = geometries.map(snapshot);
      const corners = geometries.map(g => g.getAttribute('position').count), before = corners.reduce((n, v) => n + v, 0);
      const storage = () => geometries.reduce((n, g) => n + (g.index?.array.byteLength ?? 0) + Object.values(g.attributes).reduce((s, a) => s + a.array.byteLength, 0), 0);
      const oldBytes = storage(), t = performance.now(), stats = indexVillaRigidSurfaces(root), ms = performance.now() - t, newBytes = storage();
      expect(parts).toHaveLength(4); expect(stats.before).toBe(before); expect(before).toBeGreaterThan(60_000);
      expect(before / 3).toBeLessThanOrEqual(VILLA_LANDSCAPE_RENDER_BUDGET.maxTriangles);
      let misses = 0;
      for (let i = 0; i < geometries.length; i++) {
        const g = geometries[i]; expect(parts[i].geometry).toBe(g); expect(g.index!.count).toBe(corners[i]); expectExactExpansion(g, originals[i]);
        // FIFO-16 is a CPU locality proxy, not a claim about WebKit's actual shader or frame timing.
        const cache = new Int32Array(16).fill(-1); let next = 0;
        for (const v of g.index!.array) if (!cache.includes(v)) { cache[next++ % 16] = v; misses++; }
      }
      expect(stats.after).toBeLessThan(before * .65); expect(newBytes).toBeLessThan(oldBytes * .72); expect(misses).toBeLessThan(before * .75);
      // Opt-in reporting instead of a flaky wall-clock assertion shared with browser/GPU jobs.
      if (process.env.VILLA_INDEX_PROFILE) console.info('Villa landscape index:', { ...stats, triangles: before / 3, draws: parts.length, missesFIFO16: misses,
        oldBytes, newBytes, scratchBytes: 8 * 2 ** Math.ceil(Math.log2(Math.max(...corners))), ms: +ms.toFixed(2) });
    } finally { dispose(root); }
  });
});
