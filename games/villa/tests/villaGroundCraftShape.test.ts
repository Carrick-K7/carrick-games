import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { addVillaDistantRidges } from '../src/villaDistantRidges.js';
import { addVillaFenceRail, addVillaFencePost } from '../src/villaEstateCraft.js';
import { VillaModelBuilder, villaMaterial } from '../src/villaModel.js';
import { fieldStone } from '../src/villaNatureGeometry.js';
import { createVillaOutdoorModel } from '../src/villaOutdoorModel.js';
import { VILLA_SWING } from '../src/villaOutdoor.js';
import { createVillaEstateModel } from '../src/villaEstateModel.js';
import { VILLA_ESTATE_FIELDS, villaTerrainHeight, VILLA_POND } from '../src/villaEstateLayout.js';
import { addVillaWoodlandTree } from '../src/villaWoodlandArt.js';
import { createVillaStreamModel } from '../src/villaStreamModel.js';
import { VILLA_STREAM_BRIDGE, villaStreamBridgeHeight } from '../src/villaStream.js';

const roots: THREE.Group[] = [];
function fixture() { const scene = new THREE.Group(); roots.push(scene); return scene; }
function meshes(root: THREE.Object3D) { const out: THREE.Mesh[] = []; root.traverse(n => { if (n instanceof THREE.Mesh) out.push(n); }); return out; }
afterEach(() => { for (const r of roots.splice(0)) { const mats = new Set<THREE.Material>(); for (const m of meshes(r)) { m.geometry.dispose(); for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mats.add(mat); } mats.forEach(m => m.dispose()); r.clear(); } });
function top(mesh: THREE.Object3D, x: number, z: number, from = 80) {
  const hit = new THREE.Raycaster(new THREE.Vector3(x, from, z), new THREE.Vector3(0, -1, 0)).intersectObject(mesh)[0]; return hit?.point.y;
}
describe('folded terrain, timber joints, rocks and canvas sections', () => {
  it('crosses two folded watersheds and a lower basin on every side of the horizon', () => {
    const r = fixture(), cx = 11, cz = 52, hill = addVillaDistantRidges(r, cx, cz); r.updateMatrixWorld(true);
    for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const radius = dx ? 151 : 190;
      const heights = Array.from({ length: 100 }, (_, i) => top(hill, cx + (radius - 10 + i) * dx, cz + (radius - 10 + i) * dz));
      const local = heights.filter((y): y is number => y !== undefined);
      expect(local.length).toBeGreaterThan(96);
      const near = Math.max(...local.slice(5, 40)), valley = Math.min(...local.slice(41, 56)), high = Math.max(...local.slice(66, 98));
      expect(near - valley).toBeGreaterThan(3); expect(high - valley).toBeGreaterThan(8);
    }
    expect(top(hill, cx, cz)).toBeUndefined(); expect(meshes(r)).toHaveLength(1);
  });
  it('uses differing non-radial stone bedding planes, rather than rotating the same icosahedron', () => {
    const signatures = new Set<string>();
    for (const seed of [.47, 1.8, 3.67, 6.28]) {
      const g = fieldStone(seed, 1, .49, .76), p = g.getAttribute('position');
      const heights = new Set<number>(), crown = new THREE.Vector3(), shoulder = new THREE.Box3();
      for (let i = 0; i < p.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(p, i); heights.add(Math.round(v.y * 1e4));
        if (v.y > crown.y) crown.copy(v); if (Math.abs(v.y) < .16) shoulder.expandByPoint(v);
      }
      expect(heights.size).toBeGreaterThan(18); expect(shoulder.getSize(new THREE.Vector3()).x).toBeGreaterThan(1.4);
      signatures.add([p.count, crown.x.toFixed(3), shoulder.max.z.toFixed(3)].join(':')); g.dispose();
    }
    expect(signatures.size).toBe(4);
  });
  it('cuts real below-surface V joints across ramp boards without replacing the sloping support', () => {
    const scene = fixture(); createVillaStreamModel(scene); scene.updateMatrixWorld(true);
    const seam = VILLA_STREAM_BRIDGE.approachMinZ + (VILLA_STREAM_BRIDGE.minZ - VILLA_STREAM_BRIDGE.approachMinZ) / 2;
    const radius = .023;
    for (const x of [-1.7, 0, 1.7]) {
      const centre = top(scene, x, seam)!, before = top(scene, x, seam - radius)!, after = top(scene, x, seam + radius)!;
      expect(centre).toBeCloseTo(villaStreamBridgeHeight(x, seam)! - .004, 5);
      expect((before + after) / 2 - centre).toBeCloseTo(.004, 5);
    }
  });
  it('fits narrowed rail ends into capped posts on a slope, leaving air between the rails', () => {
    const scene = fixture(), b = new VillaModelBuilder(scene, 'cut'), wood = villaMaterial(0xa48364);
    addVillaFencePost(b, 0, 0, 0, false, wood); addVillaFencePost(b, 0, .18, 2, false, wood);
    for (const y of [.35, .9]) addVillaFenceRail(b, [0, y, 0], [0, y + .18, 2], wood);
    b.finish(); scene.updateMatrixWorld(true);
    const target = meshes(scene)[0], through = (z: number, y: number) => new THREE.Raycaster(new THREE.Vector3(.4,y,z), new THREE.Vector3(-1,0,0)).intersectObject(target);
    expect(top(target, 0, 0)).toBeCloseTo(1.20, 5); expect(top(target, .047, 0)!).toBeLessThan(1.19);
    expect(through(1, .58)).toHaveLength(0); expect(through(1, .9+.09)[0].point.x).toBeCloseTo(.032, 5);
    // Isolate the rail's own triangles. Its tenon gets narrower inside the post,
    // rather than leaving a daylight seam or putting another full board on top.
    const ends = new Set<number>(), p = target.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) if (p.getZ(i) < .002 && p.getZ(i) > -.002 && p.getY(i) > .91 && p.getY(i) < .945) ends.add(Math.round(Math.abs(p.getX(i)) * 1000));
    expect(ends.has(23)).toBe(true); expect(ends.has(32)).toBe(false);
  });
  it('has visible downhill faces and daylight between individual evergreen boughs', () => {
    const scene = fixture(), b = new VillaModelBuilder(scene, 'pine'), bark = villaMaterial('#765e45'), pine = villaMaterial('#497055'); pine.side = THREE.DoubleSide;
    addVillaWoodlandTree(b, 'pine', 1, 0, { bark, birch: bark, dark: pine, oak: pine, lime: pine, pine }); b.finish(); scene.updateMatrixWorld(true);
    const foliage = meshes(scene).find(m => m.material === pine)!, p = foliage.geometry.getAttribute('position');
    // Side-view projected area of the lowest whorl: rejects edge-on horizontal
    // disks/sticks, while the fixed upper silhouette remains tapered.
    let sideArea = 0, broadLow = 0, broadHigh = 0;
    for (let i = 0; i < p.count; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(p, i), v = new THREE.Vector3().fromBufferAttribute(p, i+1).sub(a), w = new THREE.Vector3().fromBufferAttribute(p, i+2).sub(a);
      if (a.y < 2.2) { sideArea += Math.abs(v.cross(w).z) / 2; broadLow = Math.max(broadLow, Math.hypot(a.x,a.z)); }
      if (a.y > 5.4) broadHigh = Math.max(broadHigh, Math.hypot(a.x,a.z));
    }
    expect(sideArea).toBeGreaterThan(1.4); expect(broadLow).toBeGreaterThan(broadHigh * 2);
    const air = new THREE.Raycaster(new THREE.Vector3(1.45, 2.91, -5), new THREE.Vector3(0, 0, 1)); expect(air.intersectObject(foliage)).toHaveLength(0);
  });
  it('slings camping fabric between its side rails and rounds the swing cushion between sewn welts', () => {
    const scene = fixture(); createVillaOutdoorModel(scene); scene.updateMatrixWorld(true);
    const sling = meshes(scene.getObjectByName('camping-chair-frame')!).find(m => (m.material as THREE.MeshStandardMaterial).color.getHexString() === '81916e')!;
    const side = top(sling, .356, -.015)!, centre = top(sling, 0, -.015)!;
    expect(side - centre).toBeGreaterThan(.042); expect(side).toBeLessThan(.51);
    const rails = meshes(scene.getObjectByName('camping-chair-frame')!).find(m => (m.material as THREE.MeshStandardMaterial).color.getHexString() === '373d36')!;
    for (const z of [-.279, .274]) for (const x of [-.28, 0, .28]) {
      // Start just over the seat so the tilted back (same sage batch) does not mask its rear hem.
      const gap = top(sling, x, z, .511)! - top(rails, x, z, .511)!;
      expect(gap).toBeGreaterThan(-.001); expect(gap).toBeLessThan(.010); // sewn cover contacts the tube across its full width
    }
    const backDepth = (x: number) => new THREE.Raycaster(new THREE.Vector3(x,.79,-1),new THREE.Vector3(0,0,1)).intersectObject(sling)[0].point.z;
    expect(backDepth(0)-backDepth(.35)).toBeGreaterThan(.032);
    const cushion = meshes(scene.getObjectByName('villa-swing-seat')!).find(m => (m.material as THREE.MeshStandardMaterial).color.getHexString() === '81916e')!;
    expect(top(cushion,VILLA_SWING.x,VILLA_SWING.z)! - top(cushion,VILLA_SWING.x+.61,VILLA_SWING.z)!).toBeGreaterThan(.025);
  });
  it('builds raised planted furrows but leaves the field aisles and recessed lily coves open', () => {
    const scene = fixture(); createVillaEstateModel(scene); scene.updateMatrixWorld(true);
    const field = VILLA_ESTATE_FIELDS[0], x = field.minX + .55, z = field.minZ + 2.24;
    const soil = meshes(scene).find(m => (m.material as THREE.Material).name === 'cultivated-soil')!;
    expect(top(soil, x, z)! - top(soil, x+.42, z)!).toBeGreaterThan(.022);
    expect(top(soil, x+.42, z)! - villaTerrainHeight(x+.42,z)).toBeCloseTo(.037, 4);
    // A pad is a notched, radially raised disk attached to a submerged stem,
    // not opaque green coverage over the rest of the pond opening.
    const pad = meshes(scene).find(m => (m.material as THREE.MeshStandardMaterial).color.getHexString()==='87a16e')!, sector = 2.31;
    const px = VILLA_POND.x + Math.cos(sector)*VILLA_POND.radiusX*.67, pz = VILLA_POND.z + Math.sin(sector)*VILLA_POND.radiusZ*.67;
    expect(top(pad, px-.055*Math.cos(sector),pz-.055*Math.sin(sector))!).toBeGreaterThan(VILLA_POND.waterY+.01);
    expect(top(pad, px+.055*Math.cos(sector),pz+.055*Math.sin(sector))).toBeUndefined();
    expect(top(pad,VILLA_POND.x,VILLA_POND.z)).toBeUndefined();
  });
});
