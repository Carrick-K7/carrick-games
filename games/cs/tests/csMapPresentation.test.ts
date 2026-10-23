import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import * as T from 'three';
import { SnowWorld } from '../src/csWorld.js';
import { AuthoredWorld } from '../src/csAuthoredWorld.js';
import { MAPS } from '../src/csMaps.js';
import { upgradeWorldMaterials } from '../src/csMapPresentation.js';

function bytes(path: string) { const b = readFileSync(`games/cs/public/${path}`); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); }
const resolver = (path: string) => `https://example.test/games/cs/1.5.0/fixture/${path}`;
const loader = async () => ({ texture: new T.Texture({ width: 512, height: 512 } as any) });
const triangles = (w: any) => w.solids.reduce((n: number, m: T.Mesh<T.BufferGeometry>) => n + (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3, 0);

describe('CS photographic map integration', () => {
  it.each(['fy_snow', 'de_dust2'])('%s replaces all BSP surface families and batches without changing collisions', async id => {
    const config = (MAPS as any)[id], world = new SnowWorld(new T.Scene(), config, resolver);
    for (const wad of config.wads ?? []) world.parseWAD(bytes(wad));
    world.parseBSP(bytes(config.asset)); world.makeAtmosphere();
    const before = triangles(world), spawn = world.spawns.ct[0].pos;
    const floor = world.ground(spawn.x, spawn.z, spawn.y + 2), stand = world.canStand(spawn.x, spawn.y + .04, spawn.z);
    const radar = JSON.stringify(world.radarTriangles), oldTextures = world.materials.map(m => m.map).filter(Boolean);
    const disposals = oldTextures.map(t => vi.spyOn(t, 'dispose'));
    try {
      const s = await upgradeWorldMaterials(world, resolver, { detail: true, loadTexture: loader });
      expect(s.status).toBe('loaded'); expect(s.photographicTexturesLoaded).toBe(27);
      expect(s.gpuBytes).toBeLessThan(48 * 1024 * 1024);
      expect(triangles(world)).toBe(before); expect(world.solids.length).toBeLessThanOrEqual(9);
      expect(world.ground(spawn.x, spawn.z, spawn.y + 2)).toBeCloseTo(floor!, 8);
      expect(world.canStand(spawn.x, spawn.y + .04, spawn.z)).toBe(stand);
      expect(JSON.stringify(world.radarTriangles)).toBe(radar);
      expect(world.solids.every(m => m.material.userData.worldMaterialPalette && m.material.map)).toBe(true);
      expect(disposals.every(d => d.mock.calls.length === 1)).toBe(true);
      const uv = world.solids[0].geometry.attributes.uv.array.slice();
      await upgradeWorldMaterials(world, resolver, { detail: true, loadTexture: loader });
      expect(world.solids[0].geometry.attributes.uv.array).toEqual(uv); // Never rescale twice.
      const paletteMaterials = [...new Set(world.solids.map(m => m.material))];
      const paletteDisposals = paletteMaterials.map(m => vi.spyOn(m, 'dispose'));
      world.dispose(); world.dispose();
      expect(paletteDisposals.every(d => d.mock.calls.length === 1)).toBe(true);
      expect(world.materialPalette.stats().status).toBe('disposed');
    } finally { world.dispose(); vi.restoreAllMocks(); }
  });

  it.each(['de_inferno', 'de_mirage'])('%s borrows palette materials, retains tint and uses only base maps at low detail', async id => {
    const world = new AuthoredWorld(new T.Scene(), (MAPS as any)[id], resolver);
    await world.load(); const calls = world.mapGroup.children.length, before = triangles(world);
    try {
      const s = await upgradeWorldMaterials(world, resolver, { detail: false, loadTexture: loader });
      expect(s.textureCount).toBe(9); expect(s.gpuBytes).toBeLessThan(13 * 1024 * 1024);
      expect(world.mapGroup.children.length).toBe(calls); expect(triangles(world)).toBe(before);
      for (const mesh of world.mapGroup.children as T.Mesh<T.BufferGeometry, T.MeshStandardMaterial>[]) {
        expect(mesh.material.map).not.toBeNull(); expect(mesh.material.normalMap).toBeNull();
        expect(mesh.material.vertexColors).toBe(true);
      }
      const disposals = [...new Set(world.mapGroup.children.map((m: any) => m.material))].map(m => vi.spyOn(m, 'dispose'));
      world.dispose(); world.dispose(); expect(disposals.every(d => d.mock.calls.length === 1)).toBe(true);
    } finally { world.dispose(); vi.restoreAllMocks(); }
  });
});
