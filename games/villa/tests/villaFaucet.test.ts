import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createVillaFaucet, VILLA_FAUCET } from '../src/villaFaucet';
import { nearestVillaHotspot, VILLA_HOTSPOTS } from '../src/villaWorld';

describe('villa kitchen tap', () => {
  it('places its action on the actual accessible sink approach, not upstairs or remotely', () => {
    const h = VILLA_HOTSPOTS.find(h => h.id === 'faucet');
    expect(h).toMatchObject(VILLA_FAUCET.approach);
    expect(nearestVillaHotspot(VILLA_FAUCET.approach)?.id).toBe('faucet');
    expect(nearestVillaHotspot({ ...VILLA_FAUCET.approach, y: 3.6 })?.id).not.toBe('faucet');
    expect(nearestVillaHotspot({ ...VILLA_FAUCET.approach, z: -4 })?.id).not.toBe('faucet');
  });
  it('starts shut, raises the handle when open and immediately stops all water when shut', () => {
    const scene = new THREE.Group(), faucet = createVillaFaucet(scene);
    const water = scene.getObjectByName('kitchen-tap-water')!, handle = scene.getObjectByName('kitchen-tap-handle')!;
    expect(water.visible).toBe(false); expect(handle.rotation.z).toBe(0);
    faucet.update(1, true); expect(water.visible).toBe(true); expect(handle.rotation.z).toBeLessThan(0);
    faucet.update(1.1, false); expect(water.visible).toBe(false); expect(handle.rotation.z).toBe(0);
    expect(scene.getObjectByName('kitchen-interactive-faucet')!.userData.on).toBe(false);
  });
  it('keeps the falling stream, animated drops and ripples inside the recessed basin', () => {
    const scene = new THREE.Group(), faucet = createVillaFaucet(scene);
    const stream = scene.getObjectByName('kitchen-tap-stream')!, ripple = scene.getObjectByName('kitchen-tap-ripple')!;
    const drops = scene.getObjectByName('kitchen-tap-drops') as THREE.InstancedMesh;
    let first: number[] = [];
    for (const t of [0, .17, .61, 99, NaN]) {
      faucet.update(t, true); scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(stream);
      expect(box.max.y).toBeCloseTo(VILLA_FAUCET.outlet.y, 5); expect(box.min.y).toBeCloseTo(VILLA_FAUCET.impactY, 5);
      const ring = new THREE.Box3().setFromObject(ripple), basin = VILLA_FAUCET.basin;
      expect(ring.min.x).toBeGreaterThan(basin.minX); expect(ring.max.x).toBeLessThan(basin.maxX);
      expect(ring.min.z).toBeGreaterThan(basin.minZ); expect(ring.max.z).toBeLessThan(basin.maxZ);
      const matrix = new THREE.Matrix4();
      for (let i = 0; i < drops.count; i++) {
        drops.getMatrixAt(i, matrix); expect(matrix.elements.every(Number.isFinite)).toBe(true);
        expect(matrix.elements[13]).toBeGreaterThanOrEqual(VILLA_FAUCET.impactY - 1e-6);
        expect(matrix.elements[13]).toBeLessThanOrEqual(VILLA_FAUCET.outlet.y + 1e-6);
      }
      if (!first.length) first = Array.from(drops.instanceMatrix.array);
      else if (Number.isFinite(t)) expect(Array.from(drops.instanceMatrix.array)).not.toEqual(first);
    }
  });
  it('shares a small finite set of scene-owned resources without lights or shadow casters', () => {
    const scene = new THREE.Group(), faucet = createVillaFaucet(scene);
    const materials = new Set<THREE.Material>(), geometry = new Set<THREE.BufferGeometry>();
    scene.traverse(o => {
      expect(o instanceof THREE.Light).toBe(false);
      if (o instanceof THREE.Mesh) { expect(o.castShadow).toBe(false); geometry.add(o.geometry); materials.add(o.material as THREE.Material); }
    });
    expect(materials.size).toBe(3); expect(geometry.size).toBe(5);
    for (let i = 0; i < 100; i++) faucet.update(i / 10, i % 2 === 0);
    expect(scene.getObjectByName('kitchen-tap-water')!.visible).toBe(false);
    geometry.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
  });
});
