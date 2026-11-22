import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createVillaEstateModel } from '../src/villaEstateModel.js';
import { createVillaStreamModel } from '../src/villaStreamModel.js';
import { VILLA_STREAM } from '../src/villaStream.js';

/** Bilinear magnification of the actual scene-owned normal map. A changing
 * clock on a flat texture would give zero displaced signal and fail. */
function sampler(atlas: THREE.DataTexture) {
  const bytes = atlas.image.data, n = atlas.image.width;
  if (!(bytes instanceof Uint8Array)) throw Error('Missing riparian slope bytes');
  const texel = (i: number, j: number) => bytes[4 * (((j + n) % n) * n + (i + n) % n)];
  return (u: number, v: number) => {
    const x = (u - Math.floor(u)) * n - .5, y = (v - Math.floor(v)) * n - .5, i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    return (1 - fy) * ((1 - fx) * texel(i, j) + fx * texel(i + 1, j)) + fy * ((1 - fx) * texel(i, j + 1) + fx * texel(i + 1, j + 1));
  };
}

describe('Outdoor water clocks transport slopes, not the shore, bed or lighting', () => {
  const root = new THREE.Group(); let estate: ReturnType<typeof createVillaEstateModel>, brook: ReturnType<typeof createVillaStreamModel>;
  beforeAll(() => { estate = createVillaEstateModel(root); brook = createVillaStreamModel(root); });
  afterAll(() => {
    const materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    root.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m); } });
    for (const m of materials) { for (const v of Object.values(m)) if (v instanceof THREE.Texture) textures.add(v); m.dispose(); }
    textures.forEach(t => t.dispose());
  });
  it.each(['stream', 'pond'])('tracks both %s layers through complete tile wraps with a long-running, rewindable clock', kind => {
    const pond = kind === 'pond', water = root.getObjectByName(pond ? 'estate-pond-water' : 'villa-stream-water') as THREE.Mesh;
    const m = water.material as THREE.MeshStandardMaterial, uv = water.geometry.getAttribute('uv');
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    m.onBeforeCompile(shader as Parameters<typeof m.onBeforeCompile>[0], null as unknown as THREE.WebGLRenderer);
    expect(shader.vertexShader).not.toContain('villaWaterPhase');
    const phase = (shader.uniforms as Record<string, { value: THREE.Vector4 }>).villaWaterPhase.value, atlas = m.normalMap as THREE.DataTexture;
    const red = sampler(atlas), set = pond ? estate.updatePond : brook.update, key = m.customProgramCacheKey(), upload = atlas.version;
    const start = 24 * 16 * 1e5 + (pond ? 23.75 : 15.75), dt = .5;
    set(start, .3); const a = phase.toArray(); set(start + dt, .3); const b = phase.toArray();
    expect(b[0]).toBeLessThan(a[0]); // primary layer crossed the wrapping boundary
    const layers = pond ? [[4.32, .8, .6, .18], [1.92, -.28, .96, .12]] : [[3.84, 1, 0, VILLA_STREAM.flowMetresPerSecond], [2.16, 1, 0, .108]];
    for (const [k, [tile, axisX, axisZ, speed]] of layers.entries()) {
      expect(shader.fragmentShader).toContain(`/ ${tile}`);
      expect(shader.fragmentShader).toMatch(k ? /- villaWaterPhase\.y/ : /- vec2\(villaWaterPhase\.x/);
      const error = (dx: number, dz: number) => {
        let squared = 0, count = 0;
        for (let i = 0; i < uv.count; i += 3) {
          const x = uv.getX(i), z = uv.getY(i), u = (x * axisX + z * axisZ) / tile, v = (-x * axisZ + z * axisX) / tile;
          const moved = red(u + (dx * axisX + dz * axisZ) / tile - b[k], v + (-dx * axisZ + dz * axisX) / tile);
          squared += (moved - red(u - a[k], v)) ** 2; count++;
        }
        return Math.sqrt(squared / count);
      };
      expect(error(0, 0)).toBeGreaterThan(3);
      expect(error(dt * speed * axisX, dt * speed * axisZ)).toBeLessThan(.001);
      const [, otherX, otherZ, otherSpeed] = layers[1 - k];
      expect(error(dt * otherSpeed * otherX, dt * otherSpeed * otherZ)).toBeGreaterThan(2); // neither field carries the other
    }
    if (pond) {
      expect(shader.vertexShader).toContain('villaWind = waterBreeze'); expect(shader.fragmentShader).toContain('villaAlong(villaSlopes(shortWave), crosswind)');
      expect(shader.fragmentShader).toContain('villaAlong(villaSlopes(swell), wind)');
    }
    set(start, .3); expect(phase.toArray()).toEqual(a); set(NaN, 1); expect(phase.toArray()).toEqual(a);
    set(start, .8); expect(phase.toArray().slice(0, 3)).toEqual(a.slice(0, 3)); expect(phase.w).toBe(.8);
    expect(shader.fragmentShader).toContain('roughnessFactor += 0.095 * villaWaterPhase.w');
    expect(m.customProgramCacheKey()).toBe(key); expect(atlas.version).toBe(upload);
  });
});
