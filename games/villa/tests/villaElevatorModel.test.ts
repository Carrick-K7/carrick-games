import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createVillaElevatorModel } from '../src/villaElevatorModel';
import { VILLA_ELEVATOR as e } from '../src/villaElevator';

let scene: THREE.Scene;
beforeAll(() => {
  const paint = new Proxy({}, { get: () => () => undefined, set: () => true });
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => paint, width: 256, height: 256 }) });
  try { scene = new THREE.Scene(); createVillaElevatorModel(scene); } finally { vi.unstubAllGlobals(); }
  scene.updateMatrixWorld(true);
});

describe('Villa elevator car floor', () => {
  it('keeps every cabin floor surface inside the car footprint', () => {
    const surfaces: Array<{ name: string; box: THREE.Box3; hex: number }> = [];
    scene.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      const material = Array.isArray(node.material) ? node.material[0] : node.material;
      const hex = (material as THREE.MeshStandardMaterial).color?.getHex?.();
      if (hex !== 0xd8cfc0 && hex !== 0xbfb5a6) return;
      const box = new THREE.Box3().setFromObject(node);
      if (box.max.y > .05 || box.min.y < -.12) return;
      surfaces.push({ name: node.name, box, hex });
    });
    expect(surfaces.length).toBeGreaterThan(0);
    for (const { name, box, hex } of surfaces) {
      expect(box.min.x, `${name} minX`).toBeGreaterThanOrEqual(e.carMinX - .02);
      expect(box.max.x, `${name} maxX`).toBeLessThanOrEqual(e.carMaxX + .02);
      expect(box.min.z, `${name} minZ`).toBeGreaterThanOrEqual(e.carMinZ - .02);
      expect(box.max.z, `${name} maxZ`).toBeLessThanOrEqual(e.carMaxZ + .02);
      expect(hex, name).toBeDefined();
    }
  });
});
