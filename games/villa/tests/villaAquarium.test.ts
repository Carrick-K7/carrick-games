import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createVillaAquariumLife, VILLA_AQUARIUM_LIFE } from '../src/villaAquarium';
import { VILLA_AQUARIUM } from '../src/villaLivingLayout';
const scenes: THREE.Group[] = [];
function make() { const root = new THREE.Group(); scenes.push(root); return { root, life: createVillaAquariumLife(root) }; }
afterEach(() => scenes.splice(0).forEach(root => { const gs = new Set<THREE.BufferGeometry>(), ms = new Set<THREE.Material>(); root.traverse(o => { if (o instanceof THREE.Mesh) { gs.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) ms.add(m); } }); gs.forEach(g => g.dispose()); ms.forEach(m => m.dispose()); root.clear(); }));
describe('locally authored top-view medaka and dwarf shrimp', () => {
  it('records real slender medaka proportions, reflective dorsal stripe and translucent rear fins, not goldfish bodies', () => {
    const { root } = make(); expect(VILLA_AQUARIUM_LIFE.fish).toMatchObject({ count: 10, species: 'Oryzias latipes' });
    const fish = root.getObjectByName('Aquarium fish 1')!;
    expect(fish.userData.bodyLength / fish.userData.bodyHeight).toBeGreaterThan(5);
    expect(fish.userData.bodyLength / fish.userData.bodyWidth).toBeGreaterThan(7);
    expect(VILLA_AQUARIUM_LIFE.fish.displayLength).toBeLessThan(0.15);
    expect(fish.userData.features).toContain('small upturned mouth'); expect(fish.userData.features).toContain('rear-set dorsal and anal fins');
    const materials: THREE.MeshStandardMaterial[] = [];
    root.traverse(o => { if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) materials.push(o.material); });
    expect(materials.some(m => m.metalness > 0.7 && m.roughness < 0.2)).toBe(true);
    expect(materials.some(m => m.transparent && m.opacity < 0.5 && m.side === THREE.DoubleSide)).toBe(true);
  });
  it('keeps ten fish, six grazing shrimp and bubbles inside the tank, even when fed/reset or given nonfinite clocks', () => {
    const { root, life } = make(), initial = root.getObjectByName('Aquarium fish 1')!.position.clone();
    for (let tick = 0; tick < 180; tick++) {
      life.update(tick / 4, 0.25, tick > 40);
      for (let i = 0; i < 10; i++) {
        const fish = root.getObjectByName(`Aquarium fish ${i + 1}`)!;
        expect(Math.abs(fish.position.x - VILLA_AQUARIUM.x)).toBeLessThan(1.3);
        expect(Math.abs(fish.position.z - VILLA_AQUARIUM.z)).toBeLessThan(0.31);
        expect(fish.position.y).toBeGreaterThan(1.05); expect(fish.position.y).toBeLessThan(1.95);
      }
      for (let i = 0; i < 6; i++) {
        const shrimp = root.getObjectByName(`aquarium/shrimp-${i + 1}`)!;
        expect(Math.abs(shrimp.position.x - VILLA_AQUARIUM.x)).toBeLessThan(1.4);
        expect(Math.abs(shrimp.position.z - VILLA_AQUARIUM.z)).toBeLessThan(0.3);
        expect(shrimp.position.y).toBeGreaterThanOrEqual(0.85); expect(shrimp.position.y).toBeLessThanOrEqual(1.08);
        expect(shrimp.userData.features).toContain('segmented abdomen'); expect(shrimp.userData.colour).toContain('dark-brown');
      }
    }
    life.update(0, 0, false); expect(root.getObjectByName('Aquarium fish 1')!.position.equals(initial)).toBe(true);
    for (const time of [Infinity, NaN, -1, 1e90]) { life.update(time, 0.1, false); root.traverse(o => { if (o instanceof THREE.InstancedMesh) expect(Array.from(o.instanceMatrix.array).every(Number.isFinite)).toBe(true); }); }
  });
  it('batches animated parts conservatively and preserves scene-owned resources across updates', () => {
    const { root, life } = make(), meshes: THREE.Mesh[] = []; root.traverse(o => { if (o instanceof THREE.Mesh) meshes.push(o); });
    expect(meshes.length).toBeLessThanOrEqual(12); expect(meshes.every(m => m instanceof THREE.InstancedMesh)).toBe(true);
    const geometries = meshes.map(m => m.geometry), materials = meshes.map(m => m.material);
    const vertices = geometries.reduce((n, g) => n + g.getAttribute('position').count, 0); expect(vertices).toBeLessThan(20_000);
    for (const g of geometries) expect(g.getAttribute('position').array.every(Number.isFinite)).toBe(true);
    const initial = (root.getObjectByName('aquarium/shrimp-grazing-legs') as THREE.InstancedMesh).instanceMatrix.array.slice();
    life.update(2.3, 0.1, false); expect((root.getObjectByName('aquarium/shrimp-grazing-legs') as THREE.InstancedMesh).instanceMatrix.array).not.toEqual(initial);
    expect(meshes.map(m => m.geometry)).toEqual(geometries); expect(meshes.map(m => m.material)).toEqual(materials);
    expect(root.children.some(o => o instanceof THREE.Light)).toBe(false);
  });
});
