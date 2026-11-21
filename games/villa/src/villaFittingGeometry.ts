import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { VillaModelBuilder } from './villaModel.js';

/** Preserve radial/cloth vertex sharing through the material merge. The general builder flattens
 * all triangles; these fittings have many smooth shared vertices. Keep the general builder's
 * collision transform contract and its conventional scene ownership/shadow semantics. */
export class IndexedFittingBuilder extends VillaModelBuilder {
  private transform = new THREE.Matrix4();
  private readonly byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
  override at(x: number, y: number, z: number, yaw: number, build: () => void) {
    const prev = this.transform;
    this.transform = prev.clone().multiply(new THREE.Matrix4().makeTranslation(x, y, z)).multiply(new THREE.Matrix4().makeRotationY(yaw));
    super.at(x, y, z, yaw, build); this.transform = prev;
  }
  override geometry(g: THREE.BufferGeometry, mat: THREE.Material, pos: XYZ = [0, 0, 0], rot: XYZ = [0, 0, 0]) {
    if (!g.hasAttribute('normal')) g.computeVertexNormals();
    const count = g.getAttribute('position').count;
    if (!g.hasAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    if (!g.index) g.setIndex(new THREE.BufferAttribute(Uint32Array.from({ length: count }, (_, i) => i), 1));
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot)).setPosition(...pos);
    g.applyMatrix4(m.premultiply(this.transform));
    const parts = this.byMaterial.get(mat); if (parts) parts.push(g); else this.byMaterial.set(mat, [g]);
  }
  override finish() {
    for (const [material, parts] of this.byMaterial) {
      const g = mergeGeometries(parts)!; g.userData.villaRigidBatch = true;
      // Long narrow guide tracks can have a room-sized sphere. Preserve the exact
      // local AABB so ordinary Three raycasting rejects their whole batch at eye level.
      g.computeBoundingBox();
      const mesh = new THREE.Mesh(g, material); mesh.name = `${this.root.name}/surface`;
      mesh.castShadow = !material.transparent && !(material instanceof THREE.MeshBasicMaterial); mesh.receiveShadow = true; this.root.add(mesh);
      parts.forEach(part => part.dispose());
    }
    this.byMaterial.clear(); return this.root;
  }
}

export type XYZ = [number, number, number];
export type Section = readonly [radiusX: number, y: number, radiusZ?: number, x?: number, z?: number];

/** Independent rings also admit a single-vertex pole. No zero-area triangles at the centre of a bowl. */
export class FittingSkin {
  private readonly positions: number[] = [];
  private readonly indices: number[] = [];
  point(x: number, y: number, z: number) {
    this.positions.push(x, y, z); return this.positions.length / 3 - 1;
  }
  face(a: number, b: number, c: number) { this.indices.push(a, b, c); }
  join(a: number[], b: number[], reverse = false) {
    if (reverse) { this.join(b, a); return; }
    const n = Math.max(a.length, b.length);
    for (let j = 0; j < n; j++) {
      const k = (j + 1) % n, p = a[j % a.length], q = b[j % b.length];
      if (b.length > 1) this.face(p, q, b[k]);
      if (a.length > 1) this.face(p, b[k % b.length], a[k]);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setIndex(this.indices); g.computeVertexNormals(); return g;
  }
}

/** Profiles run from the underside out/up, across the lip, then back into the cavity.
 * exponent < 1 makes a softly squared plan (e.g. a bath), not a stretched sphere. */
export function vessel(sections: readonly Section[], sides = 28, exponent = 1) {
  const skin = new FittingSkin(); let last: number[] | undefined;
  for (const [rx, y, rz = rx, x = 0, z = 0] of sections) {
    const ring = rx === 0 && rz === 0 ? [skin.point(x, y, z)] : Array.from({ length: sides }, (_, j) => {
      const a = 2 * Math.PI * j / sides, c = Math.cos(a), s = Math.sin(a);
      return skin.point(x + rx * Math.sign(c) * Math.abs(c) ** exponent, y, z + rz * Math.sign(s) * Math.abs(s) ** exponent);
    });
    if (last) skin.join(last, ring); last = ring;
  }
  return skin.geometry();
}

export type PathStation = readonly [x: number, y: number, z: number, radius: number, breadth?: number];
/** Sweep elliptical tool/pipe sections perpendicular to a path. The supplied side vector is
 * projected into each section. `wall` returns a two-sided tube with annular cut ends, not disk caps. */
export function formedTube(path: readonly PathStation[], sides = 12, wall = 0, side: XYZ = [0, 0, 1]) {
  const skin = new FittingSkin(), u = new THREE.Vector3(), v = new THREE.Vector3(), t = new THREE.Vector3();
  const layers = path.map(([x, y, z, radius, breadth = radius], i) => {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
    t.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    u.set(...side); u.addScaledVector(t, -u.dot(t)).normalize(); v.crossVectors(u, t);
    const ring = (r: number, w: number) => Array.from({ length: sides }, (_, j) => {
      const angle = j * Math.PI * 2 / sides, c = Math.cos(angle) * w, s = Math.sin(angle) * r;
      return skin.point(x + u.x * c + v.x * s, y + u.y * c + v.y * s, z + u.z * c + v.z * s);
    });
    return { outer: ring(radius, breadth), inner: wall > 0 ? ring(radius - wall, breadth - wall) : [skin.point(x, y, z)] };
  });
  for (let i = 1; i < layers.length; i++) {
    skin.join(layers[i - 1].outer, layers[i].outer);
    if (wall) skin.join(layers[i].inner, layers[i - 1].inner);
  }
  const first = layers[0], last = layers[layers.length - 1];
  skin.join(first.inner, first.outer); skin.join(last.outer, last.inner);
  return skin.geometry();
}

/** A folded length of cloth, not stacked slabs. The continuous fabric turns back at
 * alternating ends; small gaps and the free selvedges can be seen side-on. Origin is its base. */
export function foldedLinen(width: number, depth: number, height: number) {
  const skin = new FittingSkin(), path = [[-.43, .105], [.39, .105], [.452, .125], [.477, .187], [.477, .290], [.448, .361],
    [.385, .40], [-.390, .40], [-.449, .435], [-.474, .515], [-.470, .632], [-.438, .70], [-.377, .738], [.392, .762], [.438, .746]];
  let last: number[] | undefined;
  for (let i = 0; i < path.length; i++) {
    const [z, y] = path[i], a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
    const dz = (b[0] - a[0]) * depth, dy = (b[1] - a[1]) * height, l = Math.hypot(dz, dy);
    const loop = [[1, -.67], [.88, -1], [0, -1], [-.88, -1], [-1, -.67], [-1, .67], [-.88, 1], [0, 1], [.88, 1], [1, .67]];
    const ring = loop.map(([x, t]) => skin.point(x * width / 2, (y + (1 - x * x) * .04 * y) * height + t * height * .103 * dz / l,
      z * depth - t * height * .103 * dy / l));
    if (last) skin.join(last, ring); else skin.join([skin.point(0, y * height, z * depth)], ring);
    last = ring;
    if (i === path.length - 1) skin.join(ring, [skin.point(0, y * height, z * depth)]);
  }
  return skin.geometry();
}

/** Horizontal bent pull, backed by the front at z=0; the user's fingers pass underneath. */
export function cabinetPull(span: number, projection: number, r: number) {
  const x = span / 2, k = Math.min(projection * .52, span * .10);
  return formedTube([[-x, 0, 0, r * 1.24], [-x, 0, projection - k, r], [-x + .26 * k, 0, projection - .30 * k, r],
    [-x + k, 0, projection, r], [x - k, 0, projection, r], [x - .26 * k, 0, projection - .30 * k, r],
    [x, 0, projection - k, r], [x, 0, 0, r * 1.24]], 10, 0, [0, 1, 0]);
}

/** Sectioned moulding around a rounded rectangle, in its own XY plane (normal +Z).
 * Width/height are *outer* sizes; each stop is an inset from that perimeter and an axial depth. */
export function surround(width: number, height: number, radius: number, profile: readonly (readonly [inset: number, depth: number])[], corners = 5) {
  const skin = new FittingSkin(); let last: number[] | undefined;
  for (const [inset, depth] of profile) {
    const w = width / 2 - inset, h = height / 2 - inset, r = Math.min(w, h, Math.max(.0003, radius - inset)), ring: number[] = [];
    for (let corner = 0; corner < 4; corner++) {
      const cx = (corner === 0 || corner === 3 ? 1 : -1) * (w - r), cy = (corner < 2 ? 1 : -1) * (h - r);
      for (let i = 0; i <= corners; i++) {
        const a = Math.PI / 2 * (corner + i / corners);
        ring.push(skin.point(cx + r * Math.cos(a), cy + r * Math.sin(a), depth));
      }
    }
    if (last) skin.join(ring, last); last = ring;
  }
  return skin.geometry();
}

/** Flat stock milled right through. A fan over an apparent hole would be visible as soon
 * as a door is viewed obliquely or light reaches the waste fitting below a basin. */
export function piercedPanel(width: number, height: number, thickness: number,
  holes: readonly (readonly [x: number, y: number, rx: number, ry: number])[]) {
  const s = new THREE.Shape(), w = width / 2, h = height / 2;
  s.moveTo(-w, -h); s.lineTo(w, -h); s.lineTo(w, h); s.lineTo(-w, h); s.closePath();
  for (const [x, y, rx, ry] of holes) {
    const hole = new THREE.Path(); hole.absellipse(x, y, rx, ry, 0, Math.PI * 2, true, 0); s.holes.push(hole);
  }
  return new THREE.ExtrudeGeometry(s, { depth: thickness, bevelEnabled: false, curveSegments: 12 }).translate(0, 0, -thickness / 2);
}

/** Rounded rectangular glass/panel from a physical outline, not thickness-limited box rounding. */
export function panel(width: number, height: number, radius: number, depth: number, bevel = 0) {
  const w = width / 2 - bevel, h = height / 2 - bevel, r = Math.max(.0001, Math.min(radius, w, h) - bevel);
  const s = new THREE.Shape(); s.moveTo(w - r, -h); s.quadraticCurveTo(w, -h, w, -h + r);
  s.lineTo(w, h - r); s.quadraticCurveTo(w, h, w - r, h); s.lineTo(-w + r, h); s.quadraticCurveTo(-w, h, -w, h - r);
  s.lineTo(-w, -h + r); s.quadraticCurveTo(-w, -h, -w + r, -h); s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: depth - 2 * bevel, bevelEnabled: bevel > 0, bevelSegments: 1, bevelSize: bevel, bevelThickness: bevel, curveSegments: 5 }).translate(0, 0, bevel - depth / 2);
}
