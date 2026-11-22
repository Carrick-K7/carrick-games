import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createVillaPeripheralLandscape, createVillaStreamModel } from '../src/villaStreamModel.js';
import { VILLA_LANDSCAPE_RENDER_BUDGET, VILLA_LANDSCAPE_TREES, VILLA_STREAM, VILLA_STREAM_BRIDGE, VILLA_STREAM_RENDER_BUDGET, VILLA_STREAM_SECTIONS, villaStreamBridgeHeight, villaStreamContains, villaStreamSectionAt, villaStreamTerrainHeight } from '../src/villaStream.js';
import { fitStreamSurfaceChart } from '../src/villaStreamSurfaceChart.js';

const meshesIn = (root: THREE.Object3D) => { const meshes: THREE.Mesh[] = []; root.traverse(n => { if (n instanceof THREE.Mesh) meshes.push(n); }); return meshes; };
function dispose(root: THREE.Object3D) {
  const materials = new Set<THREE.Material>();
  meshesIn(root).forEach(m => { m.geometry.dispose(); (Array.isArray(m.material) ? m.material : [m.material]).forEach(material => materials.add(material)); });
  materials.forEach(m => m.dispose());
}
const triangles = (meshes: THREE.Mesh[]) => meshes.reduce((sum, m) => sum + (m.geometry.index?.count ?? m.geometry.getAttribute('position').count) / 3, 0);

describe('Villa stream model geometry, resources and support fidelity', () => {
  const root = new THREE.Group(); let stream: ReturnType<typeof createVillaStreamModel>, meshes: THREE.Mesh[];
  beforeAll(() => { stream = createVillaStreamModel(root); root.updateMatrixWorld(true); meshes = meshesIn(root); });
  afterAll(() => dispose(root));
  it('uses bounded static batches, finite geometry and no external textures or render targets', () => {
    expect(meshes.length).toBeLessThanOrEqual(VILLA_STREAM_RENDER_BUDGET.maxMeshes);
    expect(triangles(meshes)).toBeLessThanOrEqual(VILLA_STREAM_RENDER_BUDGET.maxTriangles);
    for (const m of meshes) {
      for (const name of Object.keys(m.geometry.attributes)) expect(Array.from(m.geometry.getAttribute(name).array).every(Number.isFinite), `${m.name}/${name}`).toBe(true);
      m.geometry.computeBoundingBox(); expect(m.geometry.boundingBox!.isEmpty()).toBe(false);
      for (const material of Array.isArray(m.material) ? m.material : [m.material]) expect((material as THREE.MeshStandardMaterial).map).toBeNull();
    }
  });
  it('selects the stock cedar shader only when the real swatch is bound', () => {
    const m=meshes.map(o=>o.material as THREE.MeshStandardMaterial).find(m=>m.name==='stream-bridge-timber')!, stock=new THREE.MeshStandardMaterial(), image=new THREE.Texture();
    const compile=()=>{const x={...THREE.ShaderLib.standard, uniforms:{}};m.onBeforeCompile(x as Parameters<typeof m.onBeforeCompile>[0],{} as THREE.WebGLRenderer);return x;};
    try { const fallback=compile();expect(fallback.fragmentShader).not.toBe(THREE.ShaderLib.standard.fragmentShader);expect(m.customProgramCacheKey()).not.toBe(stock.customProgramCacheKey());
      m.map=image;expect(m.customProgramCacheKey()).toBe(stock.customProgramCacheKey());expect(compile().fragmentShader).toBe(THREE.ShaderLib.standard.fragmentShader);
      expect(compile().vertexShader).toBe(THREE.ShaderLib.standard.vertexShader);
    } finally {m.map=null;stock.dispose();image.dispose();}
  });
  it('renders precisely the tested shoreline, not a wider water texture over grass', () => {
    const water = root.getObjectByName('villa-stream-water') as THREE.Mesh, p = water.geometry.getAttribute('position');
    expect((water.material as THREE.Material).transparent).toBe(true);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), section = villaStreamSectionAt(x)!;
      expect(p.getY(i)).toBeCloseTo(VILLA_STREAM.waterY, 6);
      expect(Math.abs(z - section.z)).toBeCloseTo(section.halfWidth, 4);
      expect(villaStreamContains(x, z, .00001, true)).toBe(true);
      // The opaque ground under water is the depressed, rendered silt basin.
      expect(villaStreamTerrainHeight(x, section.z)!).toBeLessThan(VILLA_STREAM.waterY - .3);
    }
  });
  it('matches rendered bank and basin heights including points between authored samples', () => {
    const basin = root.getObjectByName('villa-stream-basin-and-banks') as THREE.Mesh, ray = new THREE.Raycaster();
    let worst = 0;
    for (let x = -43.8; x < 65.7; x += 1.237) {
      const s = villaStreamSectionAt(x)!;
      for (const offset of [-2.5, -1.75, -1.15, -.4, 0, .73, 1.62, 2.51]) {
        const z = s.z + offset, y = villaStreamTerrainHeight(x, z); if (y == null) continue;
        ray.set(new THREE.Vector3(x, 3, z), new THREE.Vector3(0, -1, 0));
        const hit = ray.intersectObject(basin)[0]; expect(hit, `${x},${z}`).toBeDefined();
        worst = Math.max(worst, Math.abs(hit.point.y - y));
      }
    }
    expect(worst).toBeLessThan(.00001);
  });
  it('provides grounded deck, continuous ramps and rail-only collider envelopes', () => {
    const ray = new THREE.Raycaster();
    for (const x of [-1.8, 0, 1.8]) for (const z of [-44, -43.8, -42.3, -41.3, -40.8, -39.91, -38.11, -35.2, -34.7, -33.2, -32.2, -32]) {
      ray.set(new THREE.Vector3(x, 2, z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObjects(meshes)[0]; expect(hit).toBeDefined();
      // A 6mm plank seam may expose the real continuous underdeck 6cm lower.
      expect(Math.abs(hit.point.y - villaStreamBridgeHeight(x, z)!)).toBeLessThan(.065);
    }
    // Three-metre ramps use the exact same affine height as the support API.
    // Avoid the 2mm decorative seams and the gravel join at the outer endpoint.
    const bridge = VILLA_STREAM_BRIDGE;
    for (const [a, b] of [[bridge.approachMinZ, bridge.minZ], [bridge.maxZ, bridge.approachMaxZ]]) {
      expect(b - a).toBe(3);
      for (const x of [-1.8, 0, 1.8]) for (const t of [.031, .213, .627, .977]) {
        const z = a + (b - a) * t;
        ray.set(new THREE.Vector3(x, 2, z), new THREE.Vector3(0, -1, 0));
        const hit = ray.intersectObjects(meshes)[0]; expect(hit).toBeDefined();
        expect(hit.point.y).toBeCloseTo(villaStreamBridgeHeight(x, z)!, 6);
      }
    }
    expect(stream.colliders).toHaveLength(2);
    for (const c of stream.colliders) {
      expect(Object.values(c).every(Number.isFinite)).toBe(true);
      expect(c.maxX - c.minX).toBeCloseTo(.12); expect(c.maxY).toBe(VILLA_STREAM_BRIDGE.railTopY);
      expect(Math.min(Math.abs(c.minX), Math.abs(c.maxX))).toBeGreaterThan(2.2);
      ray.set(new THREE.Vector3((c.minX + c.maxX) / 2, 2, (c.minZ + c.maxZ) / 2), new THREE.Vector3(0, -1, 0));
      expect(ray.intersectObjects(meshes)[0]!.point.y).toBeCloseTo(c.maxY, 5);
    }
    expect(root.getObjectByName('villa-stream-timber-footbridge')!.userData).toMatchObject({ abutments: 2, stringers: 3 });
  });
  it('charts every original shore pair in metres along and across the bent +X channel, without restarting at a station', () => {
    const g = (root.getObjectByName('villa-stream-water') as THREE.Mesh).geometry, uv = g.getAttribute('uv'), frame = g.getAttribute('waterSection');
    expect(uv.count).toBe(VILLA_STREAM_SECTIONS.length * 2); expect(frame.count).toBe(uv.count);
    let arc = 0, minTz = 0, maxTz = 0;
    VILLA_STREAM_SECTIONS.forEach((s, i, rows) => {
      const a = rows[Math.max(0, i - 1)], b = rows[Math.min(rows.length - 1, i + 1)], t = new THREE.Vector2(b.x - a.x, b.z - a.z).normalize();
      arc += Math.hypot(s.x - a.x, s.z - a.z); minTz = Math.min(minTz, t.y); maxTz = Math.max(maxTz, t.y);
      for (const side of [-1, 1]) {
        const k = 2 * i + (side > 0 ? 1 : 0), dz = side * s.halfWidth;
        expect(frame.getX(k)).toBeCloseTo(t.x, 6); expect(frame.getY(k)).toBeCloseTo(t.y, 6); expect(frame.getZ(k)).toBe(side);
        expect(uv.getX(k)).toBeCloseTo(arc + t.y * dz, 4); expect(uv.getY(k)).toBeCloseTo(t.x * dz, 6);
      }
    });
    expect(arc).toBeGreaterThan(VILLA_STREAM.maxX - VILLA_STREAM.minX + .8); expect(minTz).toBeLessThan(-.12); expect(maxTz).toBeGreaterThan(.20);
  });
  it('ties lee ripples to the real wet stones, not to dry ground or a line of nonexistent bridge piers', () => {
    const g = (root.getObjectByName('villa-stream-water') as THREE.Mesh).geometry, wakes = g.getAttribute('waterSection');
    const at = (frame: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, x: number, side: number) => frame.getW(2 * VILLA_STREAM_SECTIONS.findIndex(s => s.x === x) + side);
    const bare = new THREE.BufferGeometry(), bank = new THREE.Group(); fitStreamSurfaceChart(bare, bank);
    const noStone = bare.getAttribute('waterSection');
    // The south shingle beside the crossing is actually rough; the opposite bank is clear here.
    expect(at(wakes, 9, 1)).toBeGreaterThan(.5); expect(at(wakes, 9, 0)).toBe(0); expect(at(noStone, 9, 1)).toBe(0);
    expect(at(noStone, 3, 1)).toBeGreaterThan(.3); expect(at(noStone, 0, 1)).toBe(0);
    const x = 18, s = villaStreamSectionAt(x)!, material = new THREE.MeshStandardMaterial(), stone = new THREE.BufferGeometry();
    stone.setAttribute('position', new THREE.Float32BufferAttribute([x, VILLA_STREAM.waterY + .1, s.z - s.halfWidth + .42, x, .05, s.z + s.halfWidth + .3], 3));
    material.name = 'stream/eroded-bars-and-stone'; bank.add(new THREE.Mesh(stone, material)); fitStreamSurfaceChart(bare, bank);
    const wet = bare.getAttribute('waterSection');
    expect(at(wet, x + .5, 0)).toBeGreaterThan(.75); expect(at(wet, x - .5, 0)).toBe(0); expect(at(wet, x + 2.5, 0)).toBe(0); expect(at(wet, x + .5, 1)).toBe(0);
    bare.dispose(); stone.dispose(); material.dispose();
  });
  it('updates one existing uniform at absolute time, preserving geometry, texture uploads and cache identity', () => {
    const water = root.getObjectByName('villa-stream-water') as THREE.Mesh, material = water.material as THREE.MeshStandardMaterial;
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    material.onBeforeCompile(shader as Parameters<typeof material.onBeforeCompile>[0], null as unknown as THREE.WebGLRenderer);
    expect(Object.keys(shader.uniforms)).toEqual(['villaWaterPhase']);
    const uniform = (shader.uniforms as Record<string, { value: THREE.Vector4 }>).villaWaterPhase, phase = uniform.value;
    const p = water.geometry.getAttribute('position') as THREE.BufferAttribute, values = Array.from(p.array), version = p.version, key = material.customProgramCacheKey();
    const map = material.normalMap!, upload = map.version, program = material.version;
    stream.update(12.25, .6); const a = phase.toArray(); stream.update(NaN, 1); expect(phase.toArray()).toEqual(a);
    stream.update(14, 4); expect(phase.toArray().slice(0, 3)).not.toEqual(a.slice(0, 3)); expect(phase.w).toBe(1);
    stream.update(1e9); const atLongTime = phase.x; stream.update(1e9 + .125); expect(phase.x).not.toBe(atLongTime);
    expect(phase.toArray().every(x => x >= 0 && x < 1)).toBe(true); stream.update(12.25, .6); expect(phase.toArray()).toEqual(a);
    expect(uniform.value).toBe(phase); expect(material.customProgramCacheKey()).toBe(key); expect(material.version).toBe(program); expect(map.version).toBe(upload);
    expect(Array.from(p.array)).toEqual(values); expect(p.version).toBe(version);
    expect(shader.vertexShader).toContain('villaSection = waterSection'); expect(shader.fragmentShader).toContain('villaAlong(ripple, normalize(villaSection.xy))');
  });
});

describe('Villa regional peripheral scenery batches', () => {
  it('makes mixed, grounded all-sides views with four cullable batches and no gameplay obstacles', () => {
    const scene = new THREE.Group(), scenery = createVillaPeripheralLandscape(scene), meshes = meshesIn(scene);
    try {
      expect(scenery.colliders).toEqual([]); expect(meshes).toHaveLength(4);
      expect(meshes.length).toBeLessThanOrEqual(VILLA_LANDSCAPE_RENDER_BUDGET.maxMeshes);
      expect(triangles(meshes)).toBeLessThanOrEqual(VILLA_LANDSCAPE_RENDER_BUDGET.maxTriangles);
      let trees = 0;
      scene.traverse(n => { if (n.userData.sceneryOnly && n.userData.kind) { trees++; expect(n.position.y).toBe(-1.14); } });
      expect(trees).toBe(VILLA_LANDSCAPE_TREES.length);
      for (const mesh of meshes) {
        expect(mesh.castShadow).toBe(false); expect(mesh.frustumCulled).toBe(true);
        const p = mesh.geometry.getAttribute('position'), c = mesh.geometry.getAttribute('color'); expect(c.count).toBe(p.count);
        expect(Array.from(p.array).every(Number.isFinite)).toBe(true);
        for (let i = 0; i < p.count; i++) expect(p.getX(i) < -42 || p.getX(i) > 64 || p.getZ(i) < -60 || p.getZ(i) > 164).toBe(true);
        mesh.geometry.computeBoundingBox(); expect(mesh.geometry.boundingBox!.min.y).toBeLessThan(-1.14);
      }
    } finally { dispose(scene); }
  });
});
