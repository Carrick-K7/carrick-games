import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { furnishVilla } from '../src/villaFurnishings.js';
import { VILLA_BEDS, villaRelaxSeat } from '../src/villaSeating.js';
import { VILLA_FAUCET } from '../src/villaFaucet.js';
import { VILLA_WEST_WALL } from '../src/villaEstateLayout.js';
import { plantRay, plantSection } from './villaHedgeProbes.js';

type XYZ = [number, number, number];
const scene = new THREE.Scene(), staticSurfaces: THREE.Mesh[] = [];
let furniture: ReturnType<typeof furnishVilla>;
beforeAll(() => {
  const context = new Proxy({}, { get: () => () => undefined, set: () => true });
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => context }) });
  try { furniture = furnishVilla(scene); } finally { vi.unstubAllGlobals(); }
  scene.updateMatrixWorld(true);
  scene.traverse(o => { if (o instanceof THREE.Mesh && o.name === 'Batched villa details') staticSurfaces.push(o); });
});
afterAll(() => {
  const geo = new Set<THREE.BufferGeometry>(), mat = new Set<THREE.Material>(), maps = new Set<THREE.Texture>();
  scene.traverse(o => { if (o instanceof THREE.Mesh) { geo.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) mat.add(m); } });
  mat.forEach(m => { for (const v of Object.values(m)) if (v instanceof THREE.Texture) maps.add(v); m.dispose(); });
  maps.forEach(t => t.dispose()); geo.forEach(g => g.dispose()); scene.clear();
});
const caster = new THREE.Raycaster();
function cast(p: XYZ, dir: XYZ, far: number, list: THREE.Object3D[] = staticSurfaces) {
  caster.set(new THREE.Vector3(...p), new THREE.Vector3(...dir).normalize()); caster.far = far;
  return caster.intersectObjects(list, true)[0];
}
const down = (x: number, y: number, z: number, distance = 1.5, list?: THREE.Object3D[]) => cast([x, y, z], [0, -1, 0], distance, list)?.point.y;
const front = (x: number, y: number, z: number, distance: number, list?: THREE.Object3D[]) => cast([x, y, z], [0, 0, -1], distance, list)?.point.z;
const opaque = () => staticSurfaces.filter(n => !(n.material as THREE.Material).transparent);
const fireOff = { evening: false, fireplace: false, gaming: false, fedUntil: 0 };

describe('atelier furniture: completed, placed surfaces rather than semantic markers', () => {
  it('spends no more than the pre-redesign 321,056 static triangles / 41 material batches', () => {
    const tris = staticSurfaces.reduce((n, mesh) => n + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3, 0);
    expect(staticSurfaces.length).toBeGreaterThan(0); expect(staticSurfaces.length).toBeLessThanOrEqual(41);
    expect(tris).toBeLessThanOrEqual(321056);
    expect(staticSurfaces.every(mesh => mesh.geometry.userData.villaRigidBatch)).toBe(true);
  });
  it.each(VILLA_BEDS)('$id actually has one centred, pinched pillow and exposed ticking', bed => {
    const y = bed.origin.y, c = Math.cos(bed.yaw), s = Math.sin(bed.yaw);
    const top = (x: number, z: number) => down(bed.origin.x + x * c + z * s, y + 1.40, bed.origin.z - x * s + z * c, 1.2)! - y;
    // Sample the full width of the head end: one connected raised region,
    // symmetrical about the rest pose, not two pillows below a count marker.
    const profile = Array.from({ length: 41 }, (_, i) => top((i - 20) * bed.width / 42, 1.25));
    const raised = profile.map(h => h > .889); let runs = 0;
    raised.forEach((r, i) => { if (r && !raised[i - 1]) runs++; });
    expect(runs).toBe(1); expect(raised[0]).toBe(false); expect(raised.at(-1)).toBe(false);
    expect(raised).toEqual(raised.slice().reverse());
    expect(profile[20]).toBeGreaterThan(1.034);
    expect(top(0, 1.25) - top(bed.pillowWidth * .46, 1.25)).toBeGreaterThan(.060);
    expect(top(.02, .73)).toBeCloseTo(.807, 2);
  });
  it.each(VILLA_BEDS)('$id bears on actual ticking, including a fully supported foot runner', bed => {
    const color = (n: THREE.Mesh) => (n.material as THREE.MeshStandardMaterial).color.getHex();
    const ticking = staticSurfaces.filter(n => color(n) === 0xffffff && (n.material as THREE.MeshStandardMaterial).roughness === .93);
    const duvet = staticSurfaces.filter(n => color(n) === 0xede6d4), runner = staticSurfaces.filter(n => color(n) === 0xbb7358);
    const yc = bed.origin.y, c = Math.cos(bed.yaw), s = Math.sin(bed.yaw);
    const world = (u: number, v: number) => [bed.origin.x + u * c + v * s, bed.origin.z - u * s + v * c];
    for (const [u, v] of [[0, -.45], [-bed.width * .24, -.71], [bed.width * .28, .26]]) {
      const [x, z] = world(u, v), mattress = down(x, yc + 1.1, z, .5, ticking)!;
      const underside = cast([x, yc + .55, z], [0, 1, 0], .40, duvet)!.point.y;
      expect(underside - mattress).toBeGreaterThan(-.0008); expect(underside - mattress).toBeLessThan(.006);
      expect(down(x, yc + 1.11, z, .5, duvet)! - underside).toBeGreaterThan(.019);
    }
    for (const u of [-bed.width * .34, -.08, bed.width * .34]) {
      const [x, z] = world(u, -1.203), support = down(x, yc + 1.13, z, .65, duvet)!;
      const underside = cast([x, yc + .466, z], [0, 1, 0], .62, runner)!.point.y;
      expect(underside - support).toBeGreaterThan(.00025); expect(underside - support).toBeLessThan(.0015);
    }
    // Below the upper bead, thickness is horizontal. Send one ray out from
    // the bed's centre to the underside, and another back in to the support.
    const section = (u: number, v: number, du: number, dv: number, cover: THREE.Mesh[], support: THREE.Mesh[]) => {
      const [x, z] = world(u, v), dx = du * c + dv * s, dz = -du * s + dv * c, reach = 2.02;
      const base = cast([x + dx * reach, yc + .668, z + dz * reach], [-dx, 0, -dz], reach, support)!;
      const inner = cast([x, yc + .668, z], [dx, 0, dz], reach, cover)!;
      const outer = cast([x + dx * reach, yc + .668, z + dz * reach], [-dx, 0, -dz], reach, cover)!;
      expect(inner).toBeDefined(); expect(base).toBeDefined(); expect(outer).toBeDefined();
      const separation = base.distance + inner.distance - reach;
      expect(separation).toBeGreaterThan(-.001); expect(separation).toBeLessThan(.008);
      expect(base.distance - outer.distance).toBeGreaterThan(.008);
    };
    section(0, -.52, -1, 0, duvet, ticking); section(0, -.52, 1, 0, duvet, ticking);
    section(0, 0, 0, -1, duvet, ticking);
    section(0, -1.20, -1, 0, runner, duvet); section(0, -1.20, 1, 0, runner, duvet);
  });
  it('puts seat wells below their shoulders, wraps the back and leaves the sofa underside open', () => {
    const xc = -8 + (4.2 - .50) / 8, z = 5.8 - .12;
    const well = down(xc, .79, z)!, shoulder = down(xc + .329, .79, z)!;
    expect(well).toBeGreaterThan(.60); expect(shoulder - well).toBeGreaterThan(.022);
    expect(front(-8, 1.01, 6.64, .59)).toBeGreaterThan(6.38);
    expect(cast([-8, .102, 4.99], [0, 0, 1], 1.51)).toBeUndefined();
    const crown = cast([xc, .79, z], [0, -1, 0], .25)!, dx = cast([xc + .09, .79, z], [0, -1, 0], .25)!;
    expect(dx.uv!.x - crown.uv!.x).toBeCloseTo(.09 * .80, 4); expect(dx.uv!.y).toBeCloseTo(crown.uv!.y, 5);
  });
  it('bends the dining back around the sitter and preserves sightlines between its splats', () => {
    const x = -9.33, z = -1.72;
    const center = cast([x, .926, z - .13], [0, 0, 1], .60)!, wing = cast([x + .232, .926, z - .13], [0, 0, 1], .60)!;
    expect(center.point.z - wing.point.z).toBeGreaterThan(.044);
    expect(cast([x, .617, z], [0, 0, 1], .39)).toBeUndefined();
    expect(down(x, .63, z - .04, .31)).toBeGreaterThan(.49);
  });
  it('leaves the cup mouth, handle loop and saucer distinct, not one solid cylinder', () => {
    const x = -7, z = 3.68, level = down(x, .67, z, .24)!, lip = down(x + .073, .67, z, .24)!;
    expect(lip - level).toBeGreaterThan(.032);
    expect(cast([x + .097, .525, z - .10], [0, 0, 1], .21)).toBeUndefined();
    expect(down(x - .13, .67, z, .25)).toBeLessThan(level - .045);
  });
  it('recedes behind a real masonry arch and keeps its mantel above the opening', () => {
    const chamber = front(-10, 1.225, 1.02, 1.5)!, spring = front(-10 + .89, 1.225, 1.02, 1.5)!;
    expect(chamber).toBeLessThan(-.16); expect(spring - chamber).toBeGreaterThan(.70);
    expect(cast([-10, 1.333, .66], [0, 1, 0], .33)?.point.y).toBeGreaterThan(1.40);
  });
  it('keeps a drawn sink under the live outlet and a deep opaque oven liner behind the glazing', () => {
    const o = VILLA_FAUCET.outlet;
    expect(down(o.x, 1.12, o.z, .38)).toBeCloseTo(VILLA_FAUCET.impactY, 2);
    const rim = down(-5.67 + .390, 1.12, -8.35)!;
    expect(rim).toBeGreaterThan(.986); expect(rim - down(-5.67, 1.12, -8.35)!).toBeGreaterThan(.060);
    const glass = front(-8.11 + .148, .43, -7.59, .67)!, liner = front(-8.11 + .148, .43, -7.59, .67, opaque())!;
    expect(glass - liner).toBeGreaterThan(.19);
    expect(front(-8.11 + .495, .43, -7.59, .5, opaque())! - liner).toBeGreaterThan(.20);
  });
  it.each([[-10.1, 0, -16.9, .64, .70, .94], [-9.0, 0, -16.9, .64, .70, .94], [9.4, 3.6, -8.08, 1.09, .991, .946]])('draws a deep drum and separate projecting gasket at loader x=%s', (x, floor, z, w, d, h) => {
    const y = floor + h * .46, r = Math.min(w * .337, h * .31), start = z + d / 2 + .151;
    const center = front(x, y, start, d + .16, opaque())!, lip = front(x + r * .908, y, start, .4, opaque())!;
    expect(lip - center).toBeGreaterThan(d * .42);
    expect(front(x, y, start, .34)! - center).toBeGreaterThan(d * .40);
  });
  it('slopes the inner tub into a floor beneath the independently visible water', () => {
    const x = 11.4, y = 4.61, z = -4.4, basin = down(x, y, z, 1.2, opaque())!;
    const slope = down(x + .929, y, z, 1.2, opaque())!, rolledLip = down(x + 1.136, y, z, 1.2, opaque())!;
    expect(down(x, y, z)).toBeCloseTo(3.9225, 4);
    expect(slope - basin).toBeGreaterThan(.20); expect(rolledLip - slope).toBeGreaterThan(.20);
    expect(cast([x + 1.16, 3.72, z - .40], [0, 0, 1], .80, opaque())).toBeUndefined();
  });
  it('seats real cones and a deep reflex port in the cinema tower baffle', () => {
    const x = 19.1, z = -17.09, y = .414;
    const center = front(x, y, z, .65)!, roll = front(x + .094, y, z, .65)!;
    expect(roll - center).toBeGreaterThan(.026);
    const mouth = front(x, .16, z, .86)!, baffle = front(x + .082, .16, z, .86)!;
    expect(baffle - mouth).toBeGreaterThan(.115);
  });
  it('passes through the kettlebell handle but not its shoulder; hits the treadmill on the running surface', () => {
    const x = 10.9, y = .213, z = -14.75;
    expect(cast([x, y, z - .17], [0, 0, 1], .34)).toBeUndefined();
    expect(cast([x + .076, y, z - .17], [0, 0, 1], .34)).toBeDefined();
    expect(down(14, .45, -15.52, .36)).toBeGreaterThan(.205);
  });
  it('opens a double-skinned grill dome to expose separate bars over a low firebox', () => {
    const lid = scene.getObjectByName('roof-grill-lid-1')!, z = -6.32;
    const outer = down(10.4, 8.69, z, .72, [lid])!, inner = cast([10.4, 8.095, z], [0, 1, 0], .35, [lid])!.point.y;
    expect(outer - inner).toBeGreaterThan(.008); expect(inner).toBeGreaterThan(8.22);
    furniture.update(0, { ...fireOff, grillLids: [true, false, false] }); scene.updateMatrixWorld(true);
    try {
      expect(down(10.4, 8.69, z, .72, [lid])).toBeUndefined();
      const bar = down(10.4, 8.54, z, 1.05)!, gap = down(10.455, 8.54, z, 1.05)!;
      expect(bar).toBeGreaterThan(8.107); expect(bar - gap).toBeGreaterThan(.18);
    } finally { furniture.update(0, fireOff); scene.updateMatrixWorld(true); }
  });
  it('exposes negative space in the vise throat and the scoop-front stores', () => {
    const x = 33.30, z = -11.24 + .124;
    const jaw1 = down(x, 1.29, z + .024)!, jaw2 = down(x, 1.29, z + .184)!, throat = down(x, 1.29, z + .105)!;
    expect(Math.min(jaw1, jaw2) - throat).toBeGreaterThan(.065);
    const bin = 40.2 + .419, y = .465, frontZ = -10.78;
    // The back wall has its own pierced hand slot in the middle.
    expect(front(bin, y, frontZ, .68)).toBeUndefined();
    const rear = front(bin + .121, y, frontZ, .68)!, cheek = front(bin + .30, y, frontZ, .40)!;
    expect(cheek - rear).toBeGreaterThan(.31);
  });
  it('wraps a cover around recessed page edges and leaves room beneath the trestle', () => {
    const x = -8.05, z = 3.61;
    const pages = cast([x, .4725, z - .27], [0, 0, 1], .40)!, board = cast([x, .503, z - .27], [0, 0, 1], .40)!;
    expect(pages.point.z - board.point.z).toBeGreaterThan(.008);
    expect((pages.object as THREE.Mesh).material).not.toBe((board.object as THREE.Mesh).material);
    expect(cast([-7.6, .135, 2.825], [0, 0, 1], 1.49)).toBeUndefined();
  });
  it('binds the living rug to separated warp knots and sculpts a crested sling across each pool runner', () => {
    const knotX = -8 + 6.1 * (20.5 / 42 - .5), z = 3.9 - 4.15 / 2 + .040;
    expect(down(knotX, .083, z, .076)).toBeGreaterThan(.009);
    expect(down(knotX + .046, .083, z, .076)).toBeUndefined();
    for (const id of ['lounger-west', 'lounger-east']) {
      const { origin: o } = villaRelaxSeat(id)!;
      const center = down(o.x, .69, o.z + .18, .55)!, rail = down(o.x + .393, .69, o.z + .18, .55)!;
      expect(rail - center).toBeGreaterThan(.027);
      expect(down(o.x, 1.09, o.z + 1.03, .50)! - center).toBeGreaterThan(.38);
    }
  });
  it('opens the robot wash bay behind its ramp and sets rolling tyres lower than the underbody', () => {
    furniture.update(0, fireOff); scene.updateMatrixWorld(true);
    const robot = scene.getObjectByName('robot-vacuum')!, x = robot.position.x, z = robot.position.z;
    const wheel = cast([x + .119, -.036, z - .024], [0, 1, 0], .13, [robot])!.point.y;
    const belly = cast([x + .077, -.036, z + .025], [0, 1, 0], .13, [robot])!.point.y;
    expect(wheel).toBeLessThan(.002); expect(belly - wheel).toBeGreaterThan(.008);
    const rear = cast([4.45, .101, -7.71], [0, 0, 1], .61)!, cheek = cast([4.45 + .192, .101, -7.71], [0, 0, 1], .61)!;
    expect(rear.point.z - cheek.point.z).toBeGreaterThan(.22);
  });
  it('grows paired leaflets on the floor specimen, broad cane blades in the suite and low flowering tips over the tabletop rim', () => {
    // Connected components are found from the actual triangles in the material
    // batches, not counts supplied by the plant maker. Normalize by pot size.
    const plant = (x: number, y: number, z: number, s: number, colors: number[]) => {
      const parents = new Map<string, string>(), points = new Map<string, THREE.Vector3>();
      const key = (p: THREE.Vector3) => [p.x, p.y, p.z].map(n => Math.round(n * 1e5)).join('/');
      const root = (k: string): string => { const p = parents.get(k); if (!p || p === k) return k; const r = root(p); parents.set(k, r); return r; };
      for (const mesh of staticSurfaces.filter(n => colors.includes((n.material as THREE.MeshStandardMaterial).color.getHex()))) {
        const a = mesh.geometry.getAttribute('position');
        for (let i = 0; i < a.count; i += 3) {
          const dy = (a.getY(i) - y) / s;
          if (dy < .31 || dy > 1.38 || Math.hypot(a.getX(i) - x, a.getZ(i) - z) > .57 * s) continue;
          const keys: string[] = [];
          for (let j = i; j < i + 3; j++) {
            const p = new THREE.Vector3((a.getX(j) - x) / s, (a.getY(j) - y) / s, (a.getZ(j) - z) / s), k = key(p);
            if (!points.has(k)) { parents.set(k, k); points.set(k, p); } keys.push(k);
          }
          for (const k of keys.slice(1)) parents.set(root(k), root(keys[0]));
        }
      }
      const parts = new Map<string, THREE.Box3>();
      for (const [k, p] of points) { const r = root(k), b = parts.get(r) ?? new THREE.Box3(); b.expandByPoint(p); parts.set(r, b); }
      return [...parts.values()];
    };
    const green = [0x41684b, 0x7d9854], compound = plant(-3, 0, 7.9, 1.45, green), cane = plant(-14.2, 3.6, 7, 1.30, green);
    const leaflets = compound.filter(b => { const size = b.getSize(new THREE.Vector3()); return Math.max(size.x, size.z) > .09 && size.y < .15; });
    expect(leaflets.length).toBeGreaterThanOrEqual(32);
    expect(cane.filter(b => b.getSize(new THREE.Vector3()).length() > .175).length).toBeGreaterThanOrEqual(6);
    expect(cane.length).toBeLessThan(compound.length * .65);
    const blooms = plant(-7.55, .44, 3.30, .46, [0xe1aa83, 0xede6d4]);
    expect(blooms.length).toBeGreaterThan(5);
    expect(Math.max(...blooms.map(b => b.max.y))).toBeLessThan(.74);
    expect(Math.max(...blooms.map(b => Math.hypot(b.max.x, b.max.z)))).toBeGreaterThan(.32);
    expect(Math.max(...compound.map(b => b.max.y))).toBeGreaterThan(1.09);
  });
  it('provides a swept floor-lamp foot, open shade and undercut privet rather than closed cones or spheres', () => {
    const x = -10.8, z = 6.8;
    expect(down(x + .107, 1.89, z + .02, .60)).toBeUndefined();
    expect(down(x + .264, 1.89, z, .60)).toBeGreaterThan(1.45);
    const hedgeX = VILLA_WEST_WALL.outer - .55, z0 = -12;
    const section = plantSection(staticSurfaces.filter(s => [0x73503b,0x41684b,0x7d9854].includes((s.material as THREE.MeshStandardMaterial).color.getHex())),hedgeX,z0);
    try {
      // Not a single stick below a solid cap: across the heel of the hedge
      // some ankle-height rays see actual stems/shoots, others see daylight.
      let lowHits = 0, crown = 0;
      for (const y of [.097,.140,.203]) for (let j=-6;j<=6;j++) if (plantRay(section,[hedgeX-.70,y,z0+j*.12],[1,0,0],1.4)) lowHits++;
      for (const dx of [-.27,-.13,.012,.16,.29]) for (const dz of [-.59,-.29,.013,.28,.59])
        crown = Math.max(crown,plantRay(section,[hedgeX+dx,1.6,z0+dz],[0,-1,0],1.14)?.point.y ?? 0);
      expect(lowHits).toBeGreaterThanOrEqual(5); expect(lowHits).toBeLessThan(20); expect(crown).toBeGreaterThan(.95);
    } finally { section.forEach(mesh=>mesh.geometry.dispose()); }
  });
});
