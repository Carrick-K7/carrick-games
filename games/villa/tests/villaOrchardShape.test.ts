import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createVillaGarden, VILLA_FRUIT_SPECIES, VILLA_GARDEN_TREES, VILLA_ROOF_POTS } from '../src/villaGarden.js';
import { orchardFruitSkin } from '../src/villaOrchardArt.js';
import { villaTerrainGroundHeight } from '../src/villaEstateLayout.js';
import { budSites, canopyProfile, cultivarList, fruitOf, percentile, pieces, treeBox } from './villaOrchardSampling.js';

const meshes: THREE.Mesh[] = [], root = new THREE.Group();
beforeAll(() => { createVillaGarden(root); root.traverse(n => { if (n instanceof THREE.Mesh) meshes.push(n); }); });
afterAll(() => {
  const maps = new Set<THREE.Texture>();
  for (const m of meshes) { m.geometry.dispose(); for (const value of Object.values(m.material)) if (value instanceof THREE.Texture) maps.add(value); (m.material as THREE.Material).dispose(); }
  maps.forEach(t => t.dispose()); root.clear();
});
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
  it('carries perforated shoots and individual turning leaves all through the three-dimensional crown', () => {
    for (const species of cultivarList) {
      const t = VILLA_GARDEN_TREES.find(t => t.species === species)!, region = treeBox(t, 3), mesh = byColor(VILLA_FRUIT_SPECIES[species].leaf);
      const mat = mesh.material as THREE.MeshStandardMaterial, image = mat.map!.image, n = image.width / 2;
      expect(mat.transparent).toBe(false); expect(mat.alphaTest).toBeGreaterThan(.2); expect(mat.map!.generateMipmaps).toBe(true);
      const relief = mat.normalMap!.image; expect([relief.width, relief.height]).toEqual([128, 128]);
      let minTilt = 255, maxTilt = 0;
      for (let i = 0; i < relief.data.length; i += 4) { minTilt = Math.min(minTilt, relief.data[i]); maxTilt = Math.max(maxTilt, relief.data[i]); }
      expect(maxTilt - minTilt).toBeGreaterThan(90); // different leaf facing within one shoot's UV chart
      for (const yaw of [.29, 1.76]) {
        const profile = canopyProfile(mesh, region, yaw);
        expect(profile.fill, `${species} projected foliage`).toBeGreaterThan(.44); expect(profile.fill).toBeLessThan(.81);
        expect(profile.skySlots, species).toBeGreaterThan(390);
      }
      // Count actual separate cuts across a strip of the atlas; painting a
      // broad green quad with a token hole must not pass as a spray of blades.
      const counts = [0, 1, 2, 3].map(tile => {
        const ox = tile % 2 * n, oy = (tile >> 1) * n, cuts: number[] = []; let ink = 0;
        // Inclined as well as axial transects: a naturally angled lateral
        // needn't present its intervals along the chart's vertical axis.
        for (const slope of [-.45, 0, .45]) for (let x = 0; x < n; x++) {
          let runs = 0, len = 0;
          for (let y = 0; y < n; y++) {
            const u = x + Math.round(slope * (y - n * .5));
            const filled = u >= 0 && u < n && image.data[4 * ((y + oy) * image.width + u + ox) + 3] >= mat.alphaTest * 255;
            if (filled) { len++; if (!slope) ink++; } else { if (len >= 2) runs++; len = 0; }
          }
          cuts.push(runs);
        }
        expect(ink / (n * n)).toBeGreaterThan(.18); expect(ink / (n * n)).toBeLessThan(.53);
        return Math.max(...cuts);
      });
      const buds = budSites(mesh, region), twigs = triangles(byColor('486644'), region);
      expect(buds.filter(b => b.tile === 3).length).toBeGreaterThan(135); // actual separated blade surfaces, not only sprays
      expect(Math.min(...counts.slice(0, 3))).toBeGreaterThanOrEqual(6);
      expect(buds.reduce((n, b) => n + (b.tile === 3 ? 1 : counts[b.tile]), 0), species).toBeGreaterThan(2500);
      const radii = buds.map(b => Math.hypot(b.at.x - t.x, b.at.z - t.z) / t.scale);
      expect(percentile(radii, .20)).toBeLessThan(.75); expect(percentile(radii, .90)).toBeGreaterThan(.9);
      const heights = buds.map(b => b.at.y / t.scale); expect(percentile(heights, .9) - percentile(heights, .1)).toBeGreaterThan(.98);
      expect(new Set(buds.map(b => Math.floor((Math.atan2(b.direction.z, b.direction.x) + Math.PI) * 6 / Math.PI))).size).toBeGreaterThanOrEqual(11);
      const slopes = buds.map(b => b.direction.y / b.direction.length()); expect(percentile(slopes, .9) - percentile(slopes, .1)).toBeGreaterThan(.69);
      for (const [i, bud] of buds.entries()) {
        expect(bud.width).toBeLessThan(.54 * t.scale); expect(bud.direction.length()).toBeLessThan(.34 * t.scale);
        if (i % 9 === 0) expect(contact([bud.at], twigs, .012 * t.scale), `${species} bud ${i}`).toBe(true);
      }
    }
  });
  it('connects every actual fruit seat to a physical stalk, and counts the spurs rather than a radial wreath', () => {
    for (const t of VILLA_GARDEN_TREES) {
      const fruit = fruitOf(meshes, t), region = treeBox(t, 2.65), axes = pieces(byColor('486644'), region);
      const marker = root.getObjectByName('Villa garden')!.children.find(n => n.userData.kind === 'fruit-tree' && n.position.x === t.x && n.position.z === t.z)!;
      const spurCenters: THREE.Vector3[] = [];
      for (const f of fruit) {
        expect(f.manifold).toBe(true);
        const mid = f.box.getCenter(new THREE.Vector3()), top = f.points.filter(p => p.y > mid.y);
        // A taper ends in the actual cap vertex; a millimetre, not the legacy
        // two-centimetre near-miss, is already a generous contact tolerance.
        const stalk = axes.find(a => a.boundary.length && a.box.intersectsBox(f.box.clone().expandByScalar(.001)) && top.some(q => a.points.some(p => p.distanceToSquared(q) < .000001)));
        expect(stalk, `${t.species} stalk at ${mid.toArray()}`).toBeDefined();
        const bud = new THREE.Vector3(); for (const p of stalk!.boundary) bud.add(p); bud.divideScalar(stalk!.boundary.length);
        if (!spurCenters.some(p => p.distanceToSquared(bud) < .000001)) spurCenters.push(bud);
      }
      expect(spurCenters, t.species).toHaveLength(marker.userData.fruitClusters);
    }
  });
  it('puts the neck on the pear, the stem depression on the apple and the curved belly on the mango', () => {
    const profile = (kind: keyof typeof VILLA_FRUIT_SPECIES) => {
      const g = orchardFruitSkin(kind, 0), p = g.getAttribute('position'), bands = new Map<string, THREE.Vector3[]>();
      for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i), k = v.y.toFixed(5); (bands.get(k) ?? bands.set(k, []).get(k)!).push(v); }
      g.dispose(); return [...bands.values()].map(ps => ({ y: ps[0].y, n: ps.length, box: new THREE.Box3().setFromPoints(ps) })).sort((a, b) => a.y - b.y);
    };
    const pear = profile('pear'), shoulders = pear.filter(r => r.y > .036), belly = pear.filter(r => r.y < .011 && r.y > -.040);
    expect(Math.max(...shoulders.map(r => r.box.max.x - r.box.min.x))).toBeLessThan(Math.max(...belly.map(r => r.box.max.x - r.box.min.x)) * .36);
    const apple = profile('apple'), well = apple.find(r => r.n === 1 && r.y > 0)!;
    expect((apple.at(-1)!.y - well.y) / (apple.at(-1)!.y - apple[0].y)).toBeGreaterThan(.12);
    const mango = profile('mango'), equator = mango.reduce((a, b) => Math.abs(a.y) < Math.abs(b.y) ? a : b);
    expect((equator.box.getCenter(new THREE.Vector3()).x - mango.at(-1)!.box.min.x) / (equator.box.max.x - equator.box.min.x)).toBeGreaterThan(.20);
  });
  it('wraps distinct cherry lenticels, citrus mottling and pome/mango fissures along metre-scaled bark, not a cap projection', () => {
    const bark = byColor('74604a'), uv = bark.geometry.getAttribute('uv'), p = bark.geometry.getAttribute('position'), map = (bark.material as THREE.MeshStandardMaterial).map!;
    expect(map.wrapT).toBe(THREE.RepeatWrapping); const im = map.image, strip = im.width / cultivarList.length;
    for (const [k, species] of cultivarList.entries()) {
      const t = VILLA_GARDEN_TREES.find(t => t.species === species)!, floor = villaTerrainGroundHeight(t.x, t.z), Vs: number[] = [], Us: number[] = [];
      for (let i = 0; i < p.count; i++) if (Math.hypot(p.getX(i) - t.x, p.getZ(i) - t.z) < .45 && p.getY(i) - floor < 1.20 * t.scale) {
        Us.push(uv.getX(i)); Vs.push(uv.getY(i));
      }
      expect(Math.min(...Us)).toBeGreaterThan(k / 6); expect(Math.max(...Us)).toBeLessThan((k + 1) / 6);
      expect(Math.max(...Us) - Math.min(...Us)).toBeGreaterThan(.14); expect(Math.max(...Vs) - Math.min(...Vs)).toBeGreaterThan(1.3);
      let across = 0, along = 0;
      for (let y = 0; y < im.height - 1; y++) for (let x = 0; x < strip - 1; x++) {
        const i = 4 * (y * im.width + k * strip + x); across += Math.abs(im.data[i] - im.data[i + 4]); along += Math.abs(im.data[i] - im.data[i + 4 * im.width]);
      }
      if (species === 'cherry') expect(across / along).toBeLessThan(.76);
      else if (species === 'orange' || species === 'lemon') { expect(across / along).toBeGreaterThan(.88); expect(across / along).toBeLessThan(1.40); }
      else expect(across / along).toBeGreaterThan(1.58);
    }
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
