import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createVillaPeripheralLandscape, createVillaStreamModel } from '../src/villaStreamModel.js';
import { VILLA_LANDSCAPE_RENDER_BUDGET, VILLA_LANDSCAPE_TREES, VILLA_STREAM, VILLA_STREAM_BRIDGE, VILLA_STREAM_RENDER_BUDGET, villaStreamBridgeHeight, villaStreamContains, villaStreamSectionAt, villaStreamTerrainHeight } from '../src/villaStream.js';

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
  it('animates only one shader uniform, preserving shoreline geometry and stable cache identity', () => {
    const water = root.getObjectByName('villa-stream-water') as THREE.Mesh, material = water.material as THREE.MeshStandardMaterial;
    const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>' };
    material.onBeforeCompile(shader as Parameters<typeof material.onBeforeCompile>[0], null as unknown as THREE.WebGLRenderer);
    const uniform = (shader.uniforms as Record<string, { value: number }>).villaStreamTime!, positions = water.geometry.getAttribute('position');
    const values = Array.from(positions.array), version = (positions as THREE.BufferAttribute).version, cacheKey = material.customProgramCacheKey();
    stream.update(12.25); expect(uniform.value).toBe(12.25); stream.update(NaN); expect(uniform.value).toBe(12.25);
    stream.update(14); expect(uniform.value).toBe(14); expect(material.customProgramCacheKey()).toBe(cacheKey);
    expect(Array.from(positions.array)).toEqual(values); expect((positions as THREE.BufferAttribute).version).toBe(version);
    expect(shader.fragmentShader).toContain('villaStreamTime * 0.24'); expect(shader.vertexShader).toContain('villaStreamUV = uv');
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
