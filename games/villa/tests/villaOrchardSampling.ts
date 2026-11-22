import * as THREE from 'three';
import { VILLA_FRUIT_SPECIES, VILLA_GARDEN_TREES, type VillaFruitSpecies } from '../src/villaGarden.js';
import { villaTerrainGroundHeight } from '../src/villaEstateLayout.js';

export type OrchardTree = (typeof VILLA_GARDEN_TREES)[number];
export interface OrchardPart { points: THREE.Vector3[]; boundary: THREE.Vector3[]; box: THREE.Box3; manifold: boolean }
export const cultivarList = Object.keys(VILLA_FRUIT_SPECIES) as VillaFruitSpecies[];
export const treeBox = (t: OrchardTree, radius: number) => new THREE.Box3(
  new THREE.Vector3(t.x - radius * t.scale, villaTerrainGroundHeight(t.x, t.z) - .1, t.z - radius * t.scale),
  new THREE.Vector3(t.x + radius * t.scale, villaTerrainGroundHeight(t.x, t.z) + 6 * t.scale, t.z + radius * t.scale));
export const surfaceOf = (meshes: THREE.Mesh[], color: string) => meshes.find(m => (m.material as THREE.MeshStandardMaterial).color.getHexString() === color.replace('#', ''))!;
/** Topological islands of the real triangle surface (incl. duplicated seam
 * vertices), not assumptions about a quads-per-fruit count or original order. */
export function pieces(mesh: THREE.Mesh, region: THREE.Box3): OrchardPart[] {
  const p = mesh.geometry.getAttribute('position'), ix = mesh.geometry.index, n = ix?.count ?? p.count;
  const ids = new Map<string, number>(), points: THREE.Vector3[] = [], parent: number[] = [], tris: number[][] = [];
  const root = (i: number) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const id = (v: THREE.Vector3) => { const key = `${Math.round(v.x * 1e5)}:${Math.round(v.y * 1e5)}:${Math.round(v.z * 1e5)}`; let id = ids.get(key);
    if (id === undefined) { id = points.length; points.push(v); parent.push(id); ids.set(key, id); } return id; };
  const probe = new THREE.Vector3();
  for (let i = 0; i < n; i += 3) {
    probe.fromBufferAttribute(p, ix ? ix.getX(i) : i); if (!region.containsPoint(probe)) continue;
    const f = [0, 1, 2].map(j => id(new THREE.Vector3().fromBufferAttribute(p, ix ? ix.getX(i + j) : i + j)));
    parent[root(f[1])] = root(f[0]); parent[root(f[2])] = root(f[0]); tris.push(f);
  }
  const clusters = new Map<number, { ids: Set<number>; edges: Map<string, [number, number, number]> }>();
  for (const f of tris) {
    const k = root(f[0]); let c = clusters.get(k); if (!c) { c = { ids: new Set(), edges: new Map() }; clusters.set(k, c); }
    for (let j = 0; j < 3; j++) {
      const a = f[j], b = f[(j + 1) % 3], key = a < b ? `${a},${b}` : `${b},${a}`; c.ids.add(a);
      const edge = c.edges.get(key); if (edge) edge[2]++; else c.edges.set(key, [a, b, 1]);
    }
  }
  return [...clusters.values()].map(c => { const vertices = [...c.ids].map(i => points[i]), boundary = new Set<number>(); let manifold = true;
    for (const [a, b, count] of c.edges.values()) { if (count !== 2) manifold = false; if (count === 1) { boundary.add(a); boundary.add(b); } }
    return { points: vertices, boundary: [...boundary].map(i => points[i]), manifold, box: new THREE.Box3().setFromPoints(vertices) }; });
}
export function fruitOf(meshes: THREE.Mesh[], tree: OrchardTree) {
  // Two roadside oranges grow just 5.3 m apart. A rectangle wide enough for
  // the broader trees can graze a whole fruit on the neighbour's near branch.
  return pieces(surfaceOf(meshes, VILLA_FRUIT_SPECIES[tree.species].fruit), treeBox(tree, 2.75)).filter(part => {
    const p = part.box.getCenter(new THREE.Vector3()), d = Math.hypot(p.x - tree.x, p.z - tree.z);
    return !VILLA_GARDEN_TREES.some(other => other !== tree && other.species === tree.species && Math.hypot(p.x - other.x, p.z - other.z) < d);
  });
}
export function percentile(values: number[], q: number) { const a = [...values].sort((a, b) => a - b); return a[Math.floor(q * (a.length - 1))]; }

/** Find the metre-scale base edge and midrib through their atlas coordinates,
 * not via a magic number of consecutive vertex records. */
export function budSites(mesh: THREE.Mesh, region: THREE.Box3) {
  const p = mesh.geometry.getAttribute('position'), uv = mesh.geometry.getAttribute('uv'), ix = mesh.geometry.index;
  const v = new THREE.Vector3(), buds: { at: THREE.Vector3; direction: THREE.Vector3; width: number; tile: number }[] = [];
  for (let i = 0; i < (ix?.count ?? p.count); i += 3) {
    const ids = [0, 1, 2].map(j => ix ? ix.getX(i + j) : i + j);
    if (!region.containsPoint(v.fromBufferAttribute(p, ids[0]))) continue;
    const bottom = ids.filter(k => (2 * uv.getY(k)) % 1 < .045); if (bottom.length !== 2) continue;
    const left = new THREE.Vector3().fromBufferAttribute(p, bottom[0]), right = new THREE.Vector3().fromBufferAttribute(p, bottom[1]);
    const mid = new THREE.Vector3().fromBufferAttribute(p, ids.find(k => !bottom.includes(k))!);
    const origin = left.clone().lerp(right, .5), tile = Math.floor(uv.getX(bottom[0]) * 2) + 2 * Math.floor(uv.getY(bottom[0]) * 2);
    buds.push({ at: origin, tile, direction: mid.sub(origin), width: left.distanceTo(right) });
  }
  return buds;
}

/** Project only real alpha-tested pixels, from a standing cross-section of the
 * cultivar (roughly 100 screen pixels). A crown can have many triangles and
 * still be a bare set of sticks, or an opaque card. Reject both readings. */
export function canopyProfile(mesh: THREE.Mesh, region: THREE.Box3, yaw: number) {
  const p = mesh.geometry.getAttribute('position'), uv = mesh.geometry.getAttribute('uv'), ix = mesh.geometry.index;
  const faces: number[][] = [], pt = new THREE.Vector3(), mat = mesh.material as THREE.MeshStandardMaterial, im = mat.map!.image;
  const project = (k: number) => p.getX(k) * Math.cos(yaw) + p.getZ(k) * Math.sin(yaw);
  let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity;
  for (let i = 0; i < (ix?.count ?? p.count); i += 3) {
    const f = [0, 1, 2].map(j => ix ? ix.getX(i + j) : i + j); if (!region.containsPoint(pt.fromBufferAttribute(p, f[0]))) continue;
    faces.push(f); for (const k of f) { const x = project(k), y = p.getY(k); left = Math.min(left, x); right = Math.max(right, x); bottom = Math.min(bottom, y); top = Math.max(top, y); }
  }
  const n = 100, mask = new Uint8Array(n * n);
  for (const [a, b, c] of faces) {
    const [ax, bx, cx] = [a, b, c].map(k => (project(k) - left) * (n - 1) / (right - left));
    const [ay, by, cy] = [a, b, c].map(k => (p.getY(k) - bottom) * (n - 1) / (top - bottom));
    const det = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax); if (Math.abs(det) < 1e-6) continue;
    for (let y = Math.ceil(Math.min(ay, by, cy)); y <= Math.max(ay, by, cy); y++) for (let x = Math.ceil(Math.min(ax, bx, cx)); x <= Math.max(ax, bx, cx); x++) {
      const j = ((x - ax) * (cy - ay) - (y - ay) * (cx - ax)) / det, k = ((y - ay) * (bx - ax) - (x - ax) * (by - ay)) / det, i = 1 - j - k;
      if (i < 0 || j < 0 || k < 0) continue;
      const u = Math.floor(im.width * (i * uv.getX(a) + j * uv.getX(b) + k * uv.getX(c))), v = Math.floor(im.height * (i * uv.getY(a) + j * uv.getY(b) + k * uv.getY(c)));
      if (im.data[4 * (v * im.width + u) + 3] >= mat.alphaTest * 255) mask[y * n + x] = 1;
    }
  }
  let envelope = 0, ink = 0, skySlots = 0;
  for (let y = 0; y < n; y++) {
    const row = mask.subarray(y * n, (y + 1) * n), a = row.indexOf(1), b = row.lastIndexOf(1); if (a === -1) continue;
    envelope += b - a + 1; for (let x = a; x <= b; x++) { ink += row[x]; if (x > a && !row[x] && row[x - 1]) skySlots++; }
  }
  return { fill: ink / envelope, skySlots };
}
