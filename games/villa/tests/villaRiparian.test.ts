import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createVillaEstateModel } from '../src/villaEstateModel.js';
import { createVillaStreamModel } from '../src/villaStreamModel.js';
import { VILLA_ESTATE_FIELDS, VILLA_POND, villaPondContains, villaTerrainGroundHeight } from '../src/villaEstateLayout.js';
import { VILLA_STREAM, VILLA_STREAM_BRIDGE, villaStreamTerrainHeight } from '../src/villaStream.js';
import { villaDistanceToRoad } from '../src/villaDrivingCourse.js';
import { VILLA_SCENIC_ROAD } from '../src/villaDriving.js';

function meshes(root: THREE.Object3D) { const m: THREE.Mesh[] = []; root.traverse(n => { if (n instanceof THREE.Mesh) m.push(n); }); return m; }
const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
function hit(m: THREE.Mesh, x: number, z: number) { ray.set(new THREE.Vector3(x, 3, z), down); return ray.intersectObject(m)[0]; }
function range(xs: number[]) { return Math.max(...xs) - Math.min(...xs); }
/** Recover real connected chips, folded blades, clods or culms from triangle
 * winding. Do NOT count authored markers or trust advertised root positions. */
function pieces(mesh: THREE.Mesh) {
  const p = mesh.geometry.getAttribute('position'), indices = mesh.geometry.index, keys = new Map<string, number>(), parent: number[] = [], points: THREE.Vector3[] = [];
  const root = (i: number): number => parent[i] === i ? i : (parent[i] = root(parent[i]));
  const id = (i: number) => {
    const q = new THREE.Vector3().fromBufferAttribute(p, indices ? indices.getX(i) : i), key = q.toArray().join('/'), seen = keys.get(key);
    if (seen !== undefined) return seen; const n = points.push(q) - 1; parent.push(n); keys.set(key, n); return n;
  };
  for (let k = 0; k < (indices?.count ?? p.count); k += 3) { const a = root(id(k)), b = root(id(k + 1)), c = root(id(k + 2)); parent[b] = a; parent[c] = a; }
  const groups = new Map<number, THREE.Vector3[]>(); points.forEach((v, i) => { const k = root(i); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(v); });
  return [...groups.values()];
}

describe('Villa riparian surface, roots, gravel and tilth', () => {
  const scene = new THREE.Group(); let all: THREE.Mesh[], pondWater: THREE.Mesh, bed: THREE.Mesh;
  const finish = (name: string) => all.find(m => (m.material as THREE.Material).name === name)!;
  beforeAll(() => { createVillaEstateModel(scene); createVillaStreamModel(scene); scene.updateMatrixWorld(true); all = meshes(scene);
    pondWater = scene.getObjectByName('estate-pond-water') as THREE.Mesh; bed = scene.getObjectByName('estate-pond-bed') as THREE.Mesh;
  });
  afterAll(() => {
    const textures = new Set<THREE.Texture>(), materials = new Set<THREE.Material>();
    for (const m of all) { m.geometry.dispose(); for (const mat of Array.isArray(m.material) ? m.material : [m.material]) materials.add(mat); }
    for (const m of materials) { for (const t of Object.values(m)) if (t instanceof THREE.Texture) textures.add(t); m.dispose(); }
    textures.forEach(t => t.dispose()); scene.clear();
  });
  it('matches optical depth to the actual sloped basin between nodes, with an asymmetric shoal and no exposed hazard overflow', () => {
    const attr = pondWater.geometry.getAttribute('waterColumn'), p = pondWater.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) { expect(villaPondContains(p.getX(i), p.getZ(i))).toBe(true); expect(p.getY(i)).toBeCloseTo(VILLA_POND.waterY, 6); }
    const depths: number[] = [], cove: number[] = []; let worst = 0;
    for (const r of [.18, .49, .72, .84, .903]) for (let i = 0; i < 29; i++) {
      const t = (i + .123) / 29 * Math.PI * 2, x = VILLA_POND.x + r * VILLA_POND.radiusX * Math.cos(t), z = VILLA_POND.z + r * VILLA_POND.radiusZ * Math.sin(t);
      const surface = hit(pondWater, x, z); if (!surface) continue;
      const a = surface.face!, b = surface.barycoord!, optical = attr.getX(a.a) * b.x + attr.getX(a.b) * b.y + attr.getX(a.c) * b.z;
      const depth = surface.point.y - hit(bed, x, z)!.point.y; depths.push(depth); if (r === .72) cove.push(depth);
      worst = Math.max(worst, Math.abs(optical - depth));
    }
    expect(depths.length).toBeGreaterThan(120); expect(worst).toBeLessThan(.00002); expect(Math.max(...depths)).toBeGreaterThan(.82);
    expect(Math.min(...depths)).toBeLessThan(.01); expect(range(cove)).toBeGreaterThan(.24);
    // A handful of cobbles may break the water, but the earthen shoals may
    // NOT cut large pointy sand islands into the open rendered surface.
    const bars = finish('pond/eroded-bars-and-stone'), barParts = pieces(bars).filter(v => range(v.map(p => p.x)) + range(v.map(p => p.z)) > 1.8);
    expect(barParts.length).toBeGreaterThan(2);
    for (const fan of barParts) if (fan.every(v => hit(pondWater, v.x, v.z))) expect(Math.max(...fan.map(v => v.y))).toBeLessThan(VILLA_POND.waterY);
  });
  it('uses mip-filtered slope normals for both sunlit waters, not white lines painted into diffuse or a reflected scene', () => {
    for (const name of ['estate-pond-water', 'villa-stream-water']) {
      const m = (scene.getObjectByName(name) as THREE.Mesh).material as THREE.MeshStandardMaterial, t = m.normalMap as THREE.DataTexture;
      expect(t.isDataTexture).toBe(true); expect(t.isRenderTargetTexture).toBe(false); expect(t.generateMipmaps).toBe(true);
      expect(t.image.width * t.image.height).toBeLessThanOrEqual(128 * 128); expect(m.envMap).toBeNull(); expect(m.emissive.getHex()).toBe(0);
      const data = t.image.data, slopes: number[] = []; for (let k = 0; k < data.length; k += 4) slopes.push(data[k]);
      expect(Math.min(...slopes)).toBeLessThan(111); expect(Math.max(...slopes)).toBeGreaterThan(144);
      const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
      m.onBeforeCompile(shader as Parameters<typeof m.onBeforeCompile>[0], null as unknown as THREE.WebGLRenderer);
      expect(shader.fragmentShader).toContain('normalMatrix * slope'); expect(shader.fragmentShader).toContain('hemisphereLights[0].skyColor');
      expect(shader.fragmentShader).not.toMatch(/diffuseColor\.rgb\s*\+=/); expect(shader.fragmentShader).toContain('#include <lights_fragment_begin>');
    }
  });
  it('grounds broad overlapping blades and rush stands in both moist and submerged soils, with actual shingle gaps', () => {
    for (const pond of [true, false]) {
      const plant = finish(`${pond ? 'pond' : 'stream'}/sedge-flags-and-rush`), roots = pieces(plant).map(v => v.reduce((a, b) => a.y < b.y ? a : b));
      const level = pond ? VILLA_POND.waterY : VILLA_STREAM.waterY, offsets: number[] = [], columns: number[] = [], bins = new Map<number, number>();
      for (const p of roots) {
        const lawn = villaTerrainGroundHeight(p.x, p.z) - .022;
        // The rim's outer few centimetres tuck UNDER the actual uncut lawn.
        const onLawn = !villaPondContains(p.x, p.z, .004);
        const ground = pond ? Math.max(hit(bed, p.x, p.z)?.point.y ?? lawn, onLawn ? lawn : -Infinity) : villaStreamTerrainHeight(p.x, p.z) ?? 0;
        offsets.push(p.y - ground); columns.push(level - ground);
        if (!pond) expect(Math.abs(p.x)).toBeGreaterThan(VILLA_STREAM_BRIDGE.maxX + .5);
        const station = pond ? 24 * Math.atan2((p.z - VILLA_POND.z) / VILLA_POND.radiusZ, (p.x - VILLA_POND.x) / VILLA_POND.radiusX) / Math.PI : p.x / 2;
        const k = Math.floor(station); bins.set(k, (bins.get(k) ?? 0) + 1);
      }
      expect(roots.length).toBeGreaterThan(200); expect(Math.min(...offsets)).toBeGreaterThan(-.065); expect(Math.max(...offsets)).toBeLessThan(.009);
      expect(Math.min(...columns)).toBeLessThan(-.05); expect(Math.max(...columns)).toBeGreaterThan(.06);
      expect(Math.max(...bins.values())).toBeGreaterThan(30); expect(bins.size).toBeLessThan(44);
    }
  });
  it('beds millimetre-to-centimetre chips into metre-charted, irregular walk margins instead of floating a second flat path', () => {
    for (const name of ['estate-walking-gravel', 'stream-walking-gravel']) {
      const path = finish(name), chips = pieces(finish(`${name}/loose-stone`)); expect(chips.length).toBeGreaterThan(100);
      const p = path.geometry.getAttribute('position'), uv = path.geometry.getAttribute('uv');
      for (let i = 0; i < p.count; i += 53) { expect(uv.getX(i)).toBe(p.getX(i)); expect(uv.getY(i)).toBe(p.getZ(i)); }
      let sampled = 0, visible = 0;
      for (const v of chips.filter((_, i) => i % 7 === 0)) {
        const cap = v.reduce((a, b) => a.y > b.y ? a : b); ray.set(new THREE.Vector3(cap.x, 3, cap.z), down);
        const surfaces = ray.intersectObject(path), span = Math.hypot(range(v.map(p => p.x)), range(v.map(p => p.z)));
        expect(span).toBeGreaterThan(.005); expect(span).toBeLessThan(.055);
        // The hill landing laps the path only at its entrance. Test actual
        // seating against either face there AND that almost all crowns show.
        expect(surfaces.some(hit => cap.y - hit.point.y > -.002 && cap.y - hit.point.y < .016)).toBe(true);
        if (cap.y - surfaces[0].point.y > -.002) visible++; sampled++;
      }
      expect(sampled).toBeGreaterThan(15); expect(visible / sampled).toBeGreaterThan(.97);
      if (name.startsWith('stream')) {
        const margin: number[] = []; for (let i = 0; i < p.count; i++) if (p.getX(i) > .90 && p.getZ(i) < -46) margin.push(p.getX(i));
        expect(range(margin)).toBeGreaterThan(.12); expect(hit(path, 0, VILLA_STREAM_BRIDGE.approachMinZ - .02)).toBeDefined();
      }
    }
  });
  it('keeps actual worked soil inside the beds and soft headland shrubs outside the driving shoulder', () => {
    const soil = finish('cultivated-soil'), p = soil.geometry.getAttribute('position'), c = soil.geometry.getAttribute('color'), relief: number[] = [], shades = new Set<number>();
    for (let i = 0; i < p.count; i += 5) {
      const x = p.getX(i), z = p.getZ(i); expect(VILLA_ESTATE_FIELDS.some(f => x >= f.minX - .001 && x <= f.maxX + .001 && z >= f.minZ - .001 && z <= f.maxZ + .001)).toBe(true);
      relief.push(p.getY(i) - villaTerrainGroundHeight(x, z)); shades.add(Math.round(c.getX(i) * 256));
    }
    expect(range(relief)).toBeGreaterThan(.085); expect(shades.size).toBeGreaterThan(24);
    const leaves = all.find(m => m.parent.name === 'estate-landscape' && (m.material as THREE.MeshStandardMaterial).color.getHex() === 0x637c46)!.geometry.getAttribute('position');
    let headland = 0, clearance = Infinity;
    for (let i = 0; i < leaves.count; i += 17) {
      const x = leaves.getX(i), z = leaves.getZ(i); if (z < 29 || z > 64 || VILLA_ESTATE_FIELDS.some(f => x >= f.minX && x <= f.maxX && z >= f.minZ && z <= f.maxZ)) continue;
      headland++; clearance = Math.min(clearance, villaDistanceToRoad(x, z));
    }
    expect(headland).toBeGreaterThan(50); expect(clearance).toBeGreaterThan(VILLA_SCENIC_ROAD.width / 2 + .45);
  });
});
