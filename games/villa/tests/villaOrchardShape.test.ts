import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createVillaGarden, VILLA_FRUIT_SPECIES, VILLA_GARDEN_TREES, VILLA_ROOF_POTS } from '../src/villaGarden.js';
import { orchardFruitSkin } from '../src/villaOrchardArt.js';
import { villaTerrainGroundHeight } from '../src/villaEstateLayout.js';

const meshes: THREE.Mesh[] = [], root = new THREE.Group();
beforeAll(() => { createVillaGarden(root); root.traverse(n => { if (n instanceof THREE.Mesh) meshes.push(n); }); });
afterAll(() => { for (const m of meshes) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } root.clear(); });
const byColor = (color: string) => meshes.find(m => (m.material as THREE.MeshStandardMaterial).color.getHexString() === color.replace('#', ''))!;
const key = (p: THREE.Vector3) => p.toArray().map(v => Math.round(v * 1e5)).join(':');
function triangles(mesh: THREE.Mesh, region: THREE.Box3) {
  const p = mesh.geometry.getAttribute('position'), i = mesh.geometry.index, result: THREE.Triangle[] = [];
  for (let n = 0; n < (i?.count ?? p.count); n += 3) {
    const av = new THREE.Vector3().fromBufferAttribute(p, i ? i.getX(n) : n); if (!region.containsPoint(av)) continue;
    result.push(new THREE.Triangle(av, new THREE.Vector3().fromBufferAttribute(p, i ? i.getX(n + 1) : n + 1), new THREE.Vector3().fromBufferAttribute(p, i ? i.getX(n + 2) : n + 2)));
  }
  return result;
}
/** Reconstruct physically connected pieces of a material after the artwork was
 * batched; no leaf, petal or fruit tags are part of this test. */
function islands(tris: THREE.Triangle[]) {
  const points = new Map<string, THREE.Vector3>(), edges = new Map<string, Set<string>>();
  for (const tri of tris) {
    const ps = [tri.a, tri.b, tri.c], ks = ps.map(key);
    ps.forEach((p, j) => { const k = ks[j]; if (!points.has(k)) { points.set(k, p); edges.set(k, new Set()); } edges.get(k)!.add(ks[(j + 1) % 3]); edges.get(k)!.add(ks[(j + 2) % 3]); });
  }
  const seen = new Set<string>(), parts: THREE.Vector3[][] = [];
  for (const k of points.keys()) {
    if (seen.has(k)) continue; const stack = [k], part: THREE.Vector3[] = [];
    while (stack.length) { const q = stack.pop()!; if (seen.has(q)) continue; seen.add(q); part.push(points.get(q)!); for (const n of edges.get(q)!) if (!seen.has(n)) stack.push(n); }
    parts.push(part);
  }
  return parts;
}
function contact(part: THREE.Vector3[], tris: THREE.Triangle[], tolerance: number) {
  const local = new THREE.Box3().setFromPoints(part).expandByScalar(tolerance), q = new THREE.Vector3();
  return tris.some(t => (local.containsPoint(t.a) || local.containsPoint(t.b) || local.containsPoint(t.c) || local.intersectsTriangle(t)) &&
    part.some(p => t.closestPointToPoint(p, q).distanceToSquared(p) < tolerance * tolerance));
}

describe('actual orchard surfaces, branch contact and cultivar sections', () => {
  it('constructs each cultivar crown out of individually curved, borne leaves (not enclosing green hulls)', () => {
    for (const species of Object.keys(VILLA_FRUIT_SPECIES) as (keyof typeof VILLA_FRUIT_SPECIES)[]) {
      const tree = VILLA_GARDEN_TREES.find(t => t.species === species)!, s = tree.scale;
      const region = new THREE.Box3(new THREE.Vector3(tree.x - 3*s, 0, tree.z - 3*s), new THREE.Vector3(tree.x + 3*s, 6*s, tree.z + 3*s));
      const leaves = islands(triangles(byColor(VILLA_FRUIT_SPECIES[species].leaf), region));
      expect(leaves.length, species).toBeGreaterThan(190);
      const twigs = triangles(byColor('486644'), region);
      for (const [i, leaf] of leaves.entries()) {
        const box = new THREE.Box3().setFromPoints(leaf), size = box.getSize(new THREE.Vector3());
        expect(size.length(), species).toBeLessThan(.77 * s); // rejects crown blobs
        expect(size.y, species).toBeGreaterThan(.009 * s);
        if (i % 9 === 0) expect(contact(leaf, twigs, .018 * s), `${species} leaf ${i}`).toBe(true);
      }
    }
  });
  it('connects all actual fruit tips to their stalks, including the tilted mango/lemon and apple stem well', () => {
    for (const species of Object.keys(VILLA_FRUIT_SPECIES) as (keyof typeof VILLA_FRUIT_SPECIES)[]) {
      const tree = VILLA_GARDEN_TREES.find(t => t.species === species)!, s = tree.scale;
      const region = new THREE.Box3(new THREE.Vector3(tree.x - 2*s, 1.5*s, tree.z - 2*s), new THREE.Vector3(tree.x + 2*s, 3.2*s, tree.z + 2*s));
      const pieces = islands(triangles(byColor(VILLA_FRUIT_SPECIES[species].fruit), region)), stalks = triangles(byColor('486644'), region);
      expect(pieces).toHaveLength(24);
      for (const fruit of pieces) {
        const box = new THREE.Box3().setFromPoints(fruit), middle = box.getCenter(new THREE.Vector3());
        expect(contact(fruit.filter(p => p.y > middle.y), stalks, .012 * s), species).toBe(true);
      }
    }
  });
  it('puts the neck on the pear, the stem depression on the apple and the curved belly on the mango', () => {
    const profile = (kind: keyof typeof VILLA_FRUIT_SPECIES) => {
      const g = orchardFruitSkin(kind, 0), p = g.getAttribute('position'), bands = new Map<string, THREE.Vector3[]>();
      for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i), k = v.y.toFixed(5); (bands.get(k) ?? bands.set(k, []).get(k)!).push(v); }
      g.dispose(); return [...bands.values()].map(ps => ({ y: ps[0].y, n: ps.length, box: new THREE.Box3().setFromPoints(ps) })).sort((a, b) => a.y - b.y);
    };
    const pear = profile('pear'), shoulders = pear.filter(r => r.y > .18), belly = pear.filter(r => r.y < .04 && r.y > -.15);
    expect(Math.max(...shoulders.map(r => r.box.max.x - r.box.min.x))).toBeLessThan(Math.max(...belly.map(r => r.box.max.x - r.box.min.x)) * .45);
    const apple = profile('apple'), well = apple.find(r => r.n === 1 && r.y > 0)!;
    expect(apple.at(-1)!.y - well.y).toBeGreaterThan(.034);
    const mango = profile('mango'), equator = mango.reduce((a, b) => Math.abs(a.y) < Math.abs(b.y) ? a : b);
    expect(equator.box.getCenter(new THREE.Vector3()).x - mango.at(-1)!.box.min.x).toBeGreaterThan(.045);
  });
  it('brings flared rootstocks to the actual rolling roadside turf', () => {
    const tree = VILLA_GARDEN_TREES.find(t => t.z > 100)!, y = villaTerrainGroundHeight(tree.x, tree.z);
    const region = new THREE.Box3(new THREE.Vector3(tree.x - .58, -2, tree.z - .58), new THREE.Vector3(tree.x + .58, y + .8, tree.z + .58));
    const ps = triangles(byColor('74604a'), region).flatMap(t => [t.a, t.b, t.c]), floor = ps.filter(p => p.y < y + .052);
    expect(y).toBeGreaterThan(.65); expect(Math.min(...ps.map(p => p.y))).toBeGreaterThan(y - .11); expect(Math.min(...floor.map(p => p.y))).toBeLessThan(y);
    expect(floor.filter(p => Math.hypot(p.x - tree.x, p.z - tree.z) > .31).length).toBeGreaterThan(40);
  });
  it('presents distinct open ray flowers, upright cups and clusters of actual small florets in the terrace pots', () => {
    const petals = (species: typeof VILLA_ROOF_POTS[number]['species'], colors: string[]) => {
      const pot = VILLA_ROOF_POTS.find(p => p.species === species)!;
      const region = new THREE.Box3(new THREE.Vector3(pot.x - .32, pot.y + .34, pot.z - .31), new THREE.Vector3(pot.x + .32, pot.y + 1.5, pot.z + .31));
      return colors.flatMap(c => triangles(byColor(c), region));
    };
    const size = (ts: THREE.Triangle[]) => new THREE.Box3().setFromPoints(ts.flatMap(t => [t.a, t.b, t.c])).getSize(new THREE.Vector3());
    const sky = size(petals('daisy', ['f5e8cf'])), terrace = size(petals('sunflower', ['e6bd55']));
    expect(sky.z).toBeGreaterThan(sky.y * 3.5); expect(terrace.y).toBeGreaterThan(terrace.z * 2.2);
    const cups = islands(petals('tulip', ['bf6578', 'e6bd55']));
    expect(cups.length).toBeGreaterThanOrEqual(5); expect(cups.every(c => new THREE.Box3().setFromPoints(c).getSize(new THREE.Vector3()).y > .09)).toBe(true);
    const florets = islands(petals('hydrangea', ['a5b5d9', '9079a9']));
    expect(florets.length).toBeGreaterThanOrEqual(8); expect(florets.every(f => new THREE.Box3().setFromPoints(f).getSize(new THREE.Vector3()).length() < .14)).toBe(true);
  });
});
