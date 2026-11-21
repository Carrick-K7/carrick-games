import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createVillaTerrainGeometry } from '../src/villaTerrainModel.js';
import { VillaVisibleRanges } from '../src/villaVisibleRanges.js';

const attributes = ['position', 'normal', 'uv'] as const;

describe('shared render storage for the authored villa lawn', () => {
  let raw: THREE.BufferGeometry, shared: THREE.BufferGeometry;
  beforeAll(() => { raw = createVillaTerrainGeometry(); shared = createVillaTerrainGeometry('shared'); });
  afterAll(() => { raw.dispose(); shared.dispose(); });

  it('reproduces every original triangle corner in order, including clipped vertices and signed normal bits', () => {
    const reference = raw.index!, index = shared.index!;
    expect(reference.count).toBeGreaterThan(100_000);
    expect(reference.array.every((id, i) => id === i)).toBe(true);
    expect(index.count).toBe(reference.count);
    expect(shared.boundingBox!.equals(raw.boundingBox!)).toBe(true);
    expect(shared.boundingSphere!.equals(raw.boundingSphere!)).toBe(true);
    expect(shared.groups).toEqual(raw.groups); expect(shared.drawRange).toEqual(raw.drawRange);
    for (const name of attributes) {
      const a = raw.getAttribute(name), b = shared.getAttribute(name);
      expect(a.array).toBeInstanceOf(Float32Array); expect(b.array).toBeInstanceOf(Float32Array);
      expect(b.itemSize).toBe(a.itemSize);
      const expected = new Uint32Array(a.array.buffer, a.array.byteOffset, a.array.length);
      const actual = new Uint32Array(b.array.buffer, b.array.byteOffset, b.array.length);
      for (let i = 0; i < index.count; i++) {
        const source = reference.getX(i) * a.itemSize, compact = index.getX(i) * b.itemSize;
        for (let k = 0; k < a.itemSize; k++) if (actual[compact + k] !== expected[source + k]) {
          throw new Error(`${name} changed at triangle ${Math.floor(i / 3)}, corner ${i % 3}, component ${k}`);
        }
      }
    }
  });

  it('saves at least three quarters of the vertex and index storage and fits a 16-bit index', () => {
    const bytes = (g: THREE.BufferGeometry) => attributes.reduce((n, k) => n + g.getAttribute(k).array.byteLength, g.index!.array.byteLength);
    expect(shared.index!.array).toBeInstanceOf(Uint16Array);
    expect(shared.getAttribute('position').count).toBeLessThan(raw.getAttribute('position').count / 5);
    expect(bytes(shared)).toBeLessThan(bytes(raw) / 4);
  });

  it('submits only in-frustum terrain ranges at the front door and ultrawide spawn', () => {
    const material = new THREE.MeshStandardMaterial();
    const ranges = VillaVisibleRanges.forMesh(new THREE.Mesh(shared, material));
    try {
      expect(ranges).not.toBeNull();
      for (const [x, z, yaw, pitch, aspect] of [[0, 11.5, 0, .04, 16 / 9], [-17, 19.5, -.74, .14, 2560 / 1080]]) {
        const camera = new THREE.PerspectiveCamera(64, aspect, .065, 650);
        camera.position.set(x, 1.65, z); camera.rotation.set(pitch, yaw, 0, 'YXZ'); camera.updateMatrixWorld();
        const clip = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        const selected = ranges!.select(new THREE.Frustum().setFromProjectionMatrix(clip, camera.coordinateSystem));
        expect(selected?.drawRange.count).toBeGreaterThan(0);
        expect(selected?.drawRange.count).toBeLessThan(shared.index!.count * .65);
        expect(selected?.getAttribute('position')).toBe(shared.getAttribute('position'));
        expect(shared.drawRange).toEqual({ start: 0, count: Infinity });
      }
    } finally { ranges?.dispose(); material.dispose(); }
  });
});
