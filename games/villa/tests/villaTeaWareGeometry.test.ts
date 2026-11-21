import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createVillaTeaBar } from '../src/villaTeaBar.js';
import { TEA_SPOUT_TIP, teaPotBody, teaPotHandle, teaPotLid } from '../src/villaTeaWare.js';
import { villaKitchenSpoutGeometry } from '../src/villaFaucet.js';
import { createVillaTea, advanceVillaTea, interactVillaTea } from '../src/villaTea.js';

const roots: THREE.Object3D[] = [];
function scene() { const s = new THREE.Group(); roots.push(s); return s; }
function part(build: () => THREE.BufferGeometry) { const m = new THREE.Mesh(build(), new THREE.MeshBasicMaterial()); scene().add(m); return m; }
const v = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);
function between(root: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3) {
  return new THREE.Raycaster(from, to.clone().sub(from).normalize(), 0, from.distanceTo(to)).intersectObject(root, true);
}
function hitsY(root: THREE.Object3D, x: number, z: number, from: number, to: number) {
  return between(root, v(x, from, z), v(x, to, z))[0]?.point.y;
}
afterEach(() => {
  const gs = new Set<THREE.BufferGeometry>(), ms = new Set<THREE.Material>();
  for (const root of roots.splice(0)) { root.traverse(o => { if (o instanceof THREE.Mesh) { gs.add(o.geometry); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => ms.add(m)); } }); root.clear(); }
  gs.forEach(g => g.dispose()); ms.forEach(m => m.dispose());
});

describe('potter’s sections and the actual drinking interface', () => {
  it('joins the inner and outer bellies to the spout as ONE manifold with a clear bore all the way to the interior', () => {
    const body = part(teaPotBody), index = body.geometry.index!, edges = new Map<string, [number, number]>();
    // Every edge has exactly two incident triangles, in opposite orientations.
    // Connectedness rules out a sealed lathe with a separate capped tube soldered over it.
    const graph = new Map<number, Set<number>>();
    for (let i = 0; i < index.count; i += 3) for (let j = 0; j < 3; j++) {
      const a = index.getX(i + j), b = index.getX(i + (j + 1) % 3), key = `${Math.min(a, b)},${Math.max(a, b)}`;
      const edge = edges.get(key) ?? [0, 0]; edge[0]++; edge[1] += a < b ? 1 : -1; edges.set(key, edge);
      if (!graph.has(a)) graph.set(a, new Set()); graph.get(a)!.add(b);
    }
    expect([...edges.values()].every(([n, signed]) => n === 2 && signed === 0)).toBe(true);
    const seen = new Set<number>(), stack = [index.getX(0)];
    while (stack.length) { const a = stack.pop()!; if (!seen.has(a)) { seen.add(a); stack.push(...graph.get(a)!); } }
    expect(seen.size).toBe(graph.size);
    const points = [v(-.048, .084), v(.135, .084), v(.157, .095), v(.192, .135), v(.214, .155), v(.234, .166), v(.277, .173)];
    for (let i = 1; i < points.length; i++) for (const z of [-.003, .003]) {
      const a = points[i - 1].clone(), b = points[i].clone(); a.z = b.z = z;
      expect(between(body, a, b)).toHaveLength(0); expect(between(body, b, a)).toHaveLength(0);
    }
    // Outside-to-inside at the final flare: both the outer wall and its inner return are physical surfaces.
    const outside = between(body, v(.259, .1705, .03), v(.259, .1705, 0))[0];
    const inside = between(body, v(.259, .1705), v(.259, .1705, .03))[0];
    expect(outside.point.z).toBeGreaterThan(.016); expect(inside.point.z).toBeGreaterThan(.012);
    expect(outside.point.z - inside.point.z).toBeCloseTo(.0033, 3);
  });

  it('rests the lid skirt in the annular seat, leaves the finial vent open, and supports the pot on a trimmed foot', () => {
    const body = part(teaPotBody), lid = part(teaPotLid), handle = part(teaPotHandle);
    expect(hitsY(body, .004, .001, .3, 0)).toBeCloseTo(.012, 4); // through open mouth to cavity floor
    expect(hitsY(body, .077, .001, .3, 0)).toBeCloseTo(.171, 4);
    expect(hitsY(lid, .077, .001, .160, .22)).toBeCloseTo(.171, 4); // mating flange, same ledge
    expect(hitsY(lid, .0675, .001, .140, .22)).toBeCloseTo(.1526, 3); // rounded nose lies 18mm below bearing face
    expect(hitsY(lid, 0, 0, .26, .14)).toBeUndefined();
    expect(hitsY(lid, .008, .001, .26, .14)).toBeGreaterThan(.210);
    expect(hitsY(body, .002, .001, -.02, .03)).toBeCloseTo(.007, 4);
    expect(hitsY(body, .055, .001, -.02, .03)).toBeCloseTo(0, 5);
    expect(between(handle, v(-.164, .110, .04), v(-.164, .110, -.04))).toHaveLength(0);
    for (const [x, y] of [[-.199, .112], [-.112, .150], [-.122, .045]]) expect(between(handle, v(x, y, .035), v(x, y, -.035)).length).toBeGreaterThan(0);
  });

  it('pours from the MOVING bored lip to the liquid, and keeps a gravity-level, wall-fitting free surface during the sip', () => {
    const g = scene(), bar = createVillaTeaBar(g), state = createVillaTea();
    const pot = g.getObjectByName('tea-bar/teapot')!, cup = g.getObjectByName('tea-bar/drinking-cup')!,
      liquid = g.getObjectByName('tea-bar/liquid') as THREE.Mesh, pour = g.getObjectByName('tea-bar/pour') as THREE.Mesh;
    const shell = cup.children.find(o => o instanceof THREE.Mesh && o !== liquid)!;
    const at = (m: THREE.Mesh, i: number) => new THREE.Vector3().fromBufferAttribute(m.geometry.getAttribute('position'), i).applyMatrix4(m.matrixWorld);
    const rest = pot.position.clone(); interactVillaTea(state); advanceVillaTea(state, 5); bar.update(5, state); g.updateMatrixWorld(true);
    expect(pot.position.y - rest.y).toBeGreaterThan(.10); expect(pour.visible).toBe(true);
    const center = (slice: number) => { const o = v(0, 0); for (let i = 0; i < 8; i++) o.add(at(pour, slice * 8 + i)); return o.multiplyScalar(1 / 8); };
    expect(center(0).distanceTo(pot.localToWorld(v(TEA_SPOUT_TIP.x, TEA_SPOUT_TIP.y)))).toBeLessThan(.0001);
    expect(center(12).distanceTo(at(liquid, 0))).toBeLessThan(.0001);
    expect(center(6).y).toBeGreaterThan((center(0).y + center(12).y) / 2 + .01); // ballistic sag, not a diagonal rod
    advanceVillaTea(state, 5); bar.update(10, state); g.updateMatrixWorld(true);
    expect(pour.visible).toBe(false); expect(pot.position.distanceTo(rest)).toBeLessThan(.0001);
    const boundary = (angle: number) => {
      const origin = at(liquid, 0), dir = v(Math.cos(angle), 0, Math.sin(angle));
      const inner = new THREE.Raycaster(origin, dir, 0, .06).intersectObject(shell)[0];
      const p = liquid.geometry.getAttribute('position'), range = liquid.geometry.drawRange.count / 9;
      const local = new THREE.Vector3(); let maxRad = 0;
      for (let j = 0; j < range; j++) maxRad = Math.max(maxRad, local.fromBufferAttribute(p, 1 + range + j).dot(dir));
      expect(Math.abs(maxRad - inner.distance)).toBeLessThan(.00025);
    };
    for (let j = 0; j < 28; j += 3) boundary(j * 2 * Math.PI / 28);
    interactVillaTea(state); advanceVillaTea(state, 1.42); bar.update(11.42, state); g.updateMatrixWorld(true);
    const pts: THREE.Vector3[] = []; for (let i = 0; i < liquid.geometry.drawRange.count; i++) pts.push(at(liquid, liquid.geometry.index!.getX(i)));
    expect(pts.length).toBeGreaterThan(40); expect(cup.rotation.x).toBeGreaterThan(.89);
    expect(Math.max(...pts.map(p => p.y)) - Math.min(...pts.map(p => p.y))).toBeLessThan(.00026);
    expect(at(liquid, 0).z).toBeGreaterThan(cup.position.z + .007); // tilted fill really pools on the low side
    advanceVillaTea(state, 3); bar.update(15, state); expect(liquid.visible).toBe(false);
  });

  it('leaves the real kitchen aerator bore clear, while a ray just outside the bore strikes the rolled lip', () => {
    const tap = part(villaKitchenSpoutGeometry);
    expect(hitsY(tap, 0, .27, .255, .325)).toBeUndefined();
    expect(hitsY(tap, .021, .27, .255, .325)).toBeCloseTo(.275, 3);
  });
});
