import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { CsEngine } from '../src/csEngine.js';
import { MAPS } from '../src/csMaps.js';
let engine: any;
afterEach(() => { engine?.dispose(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('uses map-specific reference light without leaking into legacy maps or weapon lights', async () => {
  vi.stubGlobal('Image', undefined);
  vi.stubGlobal('fetch', async (input: string | URL) => {
    const path = new URL(String(input)).pathname.replace(/^\//, '');
    const file = resolve('games/cs/public', path);
    if (!file.startsWith(resolve('games/cs/public') + '/')) throw new Error('Invalid fixture asset');
    return new Response(new Uint8Array(await readFile(file)));
  });
  engine = new CsEngine({ canvas: {}, isZh: () => false, assetUrl: (p: string) => `https://assets.example.test/${p}` });
  vi.spyOn(engine, 'populatePickups').mockImplementation(() => {});
  vi.spyOn(engine, 'makeRadarBase').mockImplementation(() => {});
  const gunLights = engine.gunScene.children.filter((o: any) => o.isLight);
  const before = gunLights.map((o: any) => ({ color: o.color.getHex(), intensity: o.intensity }));
  for (const id of ['de_inferno', 'de_mirage']) {
    expect(await engine.loadMap(id)).toBe(true);
    const a = (MAPS as any)[id].atmosphere;
    expect(engine.ambient.color.getHex()).toBe(a.ambient);
    expect(engine.ambient.groundColor.getHex()).toBe(a.ground);
    expect(engine.ambient.intensity).toBe(a.ambientIntensity);
    expect(engine.sun.intensity).toBe(a.sunIntensity);
    expect(engine.sun.position.clone().sub(engine.world.center).toArray()).toEqual(a.sunOffset);
    expect(gunLights.map((o: any) => ({ color: o.color.getHex(), intensity: o.intensity }))).toEqual(before);
  }
  expect(await engine.loadMap('fy_snow')).toBe(true);
  expect(engine.ambient.color.getHex()).toBe(0xe1f0ff);
  expect(engine.ambient.groundColor.getHex()).toBe(0x687d8d);
  expect(engine.ambient.intensity).toBe(2.3);
  expect(engine.sun.intensity).toBe(2.7);
  expect(engine.sun.position.clone().sub(engine.world.center).toArray()).toEqual([-35, 70, 25]);
  expect(gunLights.map((o: any) => ({ color: o.color.getHex(), intensity: o.intensity }))).toEqual(before);
}, 30000);
