import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as T from 'three';
import { SnowWorld } from '../src/csWorld.js';
import { AuthoredWorld } from '../src/csAuthoredWorld.js';
import { MAPS } from '../src/csMaps.js';
import { upgradeWorldMaterials } from '../src/csMapPresentation.js';

const assetUrl = (path: string) => `https://example.test/games/cs/1.5.0/progressive-fixture/${path}`;
function deferredPhotos(fail = false) {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const loadTexture = async () => {
    await gate;
    if (fail) throw new Error('Optional photo unavailable');
    return { texture: new T.Texture({ width: 512, height: 512 } as any) };
  };
  return { loadTexture, release };
}
function snow() {
  const world = new SnowWorld(new T.Scene(), MAPS.fy_snow, assetUrl);
  const bytes = readFileSync('games/cs/public/assets/fy_snow.bsp');
  world.parseBSP(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  world.makeAtmosphere();
  return world;
}
const triangles = (world: any) => world.solids.reduce((n: number, mesh: T.Mesh<T.BufferGeometry>) =>
  n + (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3, 0);

describe('CS optional photographic loading contract', () => {
  it('prepares BSP fallback batching and UVs synchronously, then upgrades the same materials in place', async () => {
    const world = snow(), photos = deferredPhotos();
    const before = triangles(world), spawn = world.spawns.ct[0].pos;
    const floor = world.ground(spawn.x, spawn.z, spawn.y + 2), radar = JSON.stringify(world.radarTriangles);
    try {
      const immediate = upgradeWorldMaterials(world, assetUrl, { awaitTextures: false, detail: false, loadTexture: photos.loadTexture });
      // Inspect before yielding: none of this mandatory preparation may live
      // behind an optional-photo await, even when the public function is async.
      expect(world.materialPalette).toBeDefined();
      expect(world.materialsReady).toBeInstanceOf(Promise);
      expect(world.solids.length).toBeLessThanOrEqual(9);
      expect(triangles(world)).toBe(before);
      expect(world.solids.every((mesh: any) => mesh.userData.materialUVScaled && mesh.geometry.getAttribute('uv').count > 0)).toBe(true);
      const materials = world.solids.map((mesh: any) => mesh.material);
      expect(materials.every((m: any) => m.map === null && m.color.getHex() !== 0)).toBe(true);
      const fallback = await immediate;
      expect(fallback.textureCount).toBe(0);
      let finished = false; void world.materialsReady.then(() => { finished = true; });
      await Promise.resolve(); expect(finished).toBe(false);
      const uv = world.solids.map((mesh: any) => mesh.geometry.attributes.uv.array.slice());
      await upgradeWorldMaterials(world, assetUrl, { awaitTextures: false });
      expect(world.solids.map((mesh: any) => mesh.geometry.attributes.uv.array)).toEqual(uv);
      photos.release();
      const loaded = await world.materialsReady;
      expect(loaded.status).toBe('loaded'); expect(loaded.textureCount).toBe(9);
      expect(world.solids.map((mesh: any) => mesh.material)).toEqual(materials);
      expect(materials.every((m: any) => m.map?.isTexture)).toBe(true);
      expect(world.ground(spawn.x, spawn.z, spawn.y + 2)).toBeCloseTo(floor!, 8);
      expect(JSON.stringify(world.radarTriangles)).toBe(radar);
    } finally { photos.release(); world.dispose(); await world.materialsReady; }
  });

  it('retains default awaited completion for explicit offline/capture callers', async () => {
    const world = new AuthoredWorld(new T.Scene(), MAPS.de_inferno, assetUrl), photos = deferredPhotos();
    await world.load();
    try {
      let completed = false;
      const pending = upgradeWorldMaterials(world, assetUrl, { detail: false, loadTexture: photos.loadTexture }).then(stats => { completed = true; return stats; });
      expect(world.materialsReady).toBeInstanceOf(Promise);
      await Promise.resolve(); await Promise.resolve();
      expect(completed).toBe(false);
      expect(world.materialPalette.stats().textureCount).toBe(0);
      photos.release();
      expect((await pending).status).toBe('loaded');
      expect(completed).toBe(true);
      expect((await upgradeWorldMaterials(world, assetUrl)).textureCount).toBe(9);
    } finally { photos.release(); world.dispose(); await world.materialsReady; }
  });

  it('optional image rejection resolves materialsReady with colored fallback and failed-kind diagnostics', async () => {
    const world = snow(), photos = deferredPhotos(true);
    try {
      await upgradeWorldMaterials(world, assetUrl, { awaitTextures: false, detail: false, loadTexture: photos.loadTexture });
      const materials = world.solids.map((mesh: any) => mesh.material);
      photos.release();
      const failed = await world.materialsReady;
      expect(failed.status).toBe('degraded'); expect(failed.failedTextures).toBe(9);
      expect(failed.textureCount).toBe(0); expect(world.missingTextures.length).toBe(9);
      expect(world.solids.map((mesh: any) => mesh.material)).toEqual(materials);
      expect(materials.every((m: any) => m.map === null && m.color.getHex() !== 0)).toBe(true);
      expect(world.mapGroup.parent).not.toBeNull();
      world.dispose();
      expect(world.materialPalette.stats().status).toBe('disposed');
    } finally { photos.release(); world.dispose(); await world.materialsReady; }
  });
});
