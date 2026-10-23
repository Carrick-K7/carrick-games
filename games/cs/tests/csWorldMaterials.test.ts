import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import * as T from 'three';
import { WorldMaterialPalette, WORLD_MATERIAL_MANIFEST as manifest, WORLD_MATERIAL_KINDS as kinds, WORLD_MATERIAL_BUDGET as budget, classifyWorldMaterial } from '../src/csWorldMaterials.js';

const slots = ['map', 'normalMap', 'roughnessMap'] as const;
const palettes: WorldMaterialPalette[] = [];
const assets = Object.values(manifest).flatMap(f => Object.values(f.maps));
const encoded = assets.reduce((sum, m) => sum + m.encodedBytes, 0);
const baseEncoded = Object.values(manifest).reduce((sum, f) => sum + f.maps.map.encodedBytes, 0);
const makeTexture = () => new T.Texture({ width: 512, height: 512 });
const loader = vi.fn(async () => ({ texture: makeTexture() }));
function palette(options: Record<string, unknown> = {}, base = '/games/cs/1.2.3/immutable-sha/') {
  const p = new WorldMaterialPalette((path: string) => base + path, options);
  palettes.push(p);
  return p;
}
afterEach(() => { palettes.splice(0).forEach(p => p.dispose()); loader.mockClear(); vi.useRealTimers(); vi.unstubAllGlobals(); });

// Decode the RIFF lossy VP8 frame header without adding a test/runtime image dependency.
function webpSize(bytes: Buffer) {
  expect(bytes.toString('ascii', 0, 4)).toBe('RIFF');
  expect(bytes.toString('ascii', 8, 12)).toBe('WEBP');
  expect(bytes.toString('ascii', 12, 16)).toBe('VP8 ');
  expect([...bytes.subarray(23, 26)]).toEqual([0x9d, 1, 0x2a]);
  return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff];
}

describe('world photographic material manifest', () => {
  it('has nine CC0 source families, exact on-disk hashes/dimensions and bounded downloads', () => {
    const provenance = JSON.parse(readFileSync(new URL('../public/assets/materials/provenance.json', import.meta.url), 'utf8'));
    expect(provenance.license).toBe('CC0-1.0');
    expect(provenance.licenseUrl).toBe('https://polyhaven.com/license');
    expect(kinds).toHaveLength(9);
    expect(new Set(Object.values(manifest).map(f => f.sourceId)).size).toBe(9);
    expect(Object.isFrozen(manifest.plaster.maps.map)).toBe(true);
    const expectedFiles: string[] = [];
    for (const kind of kinds) {
      const family = manifest[kind as keyof typeof manifest];
      const source = provenance.families[kind];
      expect(source.sourceId).toBe(family.sourceId);
      expect(source.repeatMeters).toBe(family.repeatMeters);
      expect(family.repeatMeters).toBeGreaterThan(0);
      expect(Object.keys(source.authors).length).toBeGreaterThan(0);
      for (const slot of slots) {
        const metadata = family.maps[slot];
        const bytes = readFileSync(new URL('../public/' + metadata.path, import.meta.url));
        expect(bytes.length).toBe(metadata.encodedBytes);
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(metadata.sha256);
        expect(webpSize(bytes)).toEqual([metadata.width, metadata.height]);
        expect(metadata.width).toBe(512); expect(metadata.height).toBe(512);
        expect(source.maps[slot]).toMatchObject(metadata);
        expect(source.maps[slot].sourceUrl).toContain('https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/' + family.sourceId + '/');
        expect(source.maps[slot].sourceSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(source.maps[slot].sourceMd5).toMatch(/^[0-9a-f]{32}$/);
        expectedFiles.push(metadata.path.split('/').pop()!);
      }
    }
    expect(readdirSync(new URL('../public/assets/materials/', import.meta.url)).filter(n => n.endsWith('.webp')).sort()).toEqual(expectedFiles.sort());
    expect(encoded).toBeLessThan(2 * 1024 * 1024);
    expect(encoded).toBeLessThan(budget.maxDownloadBytes);
  });

  it.each([
    ['1-teks', 'snow'], ['2-teks', 'sandstone'], ['3-teks', 'sandstone'], ['4-teks', 'plaster'], ['5-teks', 'plaster'], ['6-teks', 'wood'], ['trrm_wood', 'wood'],
    ['-0SandRock2', 'sandstone'], ['-1csSandWall', 'plaster'], ['csSandWallGH1b', 'plaster'], ['SandCCrete2', 'concrete'], ['SandWllDoorDJ1', 'wood'],
    ['MltryCrteSd2', 'wood'], ['SandCrtSmTp', 'wood'], ['SandRoadTgtA', 'cobble'], ['SandTrim', 'sandstone'], ['generic011', 'metal'], ['+a~fifties_lgt2', 'metal'],
    ['{chainlink', 'metal'], ['{wooddoor', 'wood'], ['brick_wall', 'brick'], ['clay_roof', 'roof'], ['frost', 'snow'],
  ])('classifies retained/semantic name %s as %s', (name, expected) => expect(classifyWorldMaterial(name, 'desert')).toBe(expected));

  it('covers every retained BSP name without using the name as an asset URL', () => {
    for (const map of ['fy_snow', 'de_dust2']) {
      const bsp = readFileSync(new URL('../public/assets/' + map + '.bsp', import.meta.url));
      const start = bsp.readInt32LE(20), count = bsp.readInt32LE(start);
      for (let i = 0; i < count; i++) {
        const offset = bsp.readInt32LE(start + 4 + i * 4);
        if (offset < 0) continue;
        const name = bsp.subarray(start + offset, start + offset + 16).toString().replace(/\0.*$/, '');
        expect(kinds).toContain(classifyWorldMaterial(name, map === 'de_dust2' ? 'desert' : 'snow'));
      }
    }
  });
});

describe('per-world material palette lifecycle', () => {
  it('provides synchronous shared sensible materials without pretending CPU fallback loaded photos', async () => {
    vi.stubGlobal('Image', undefined);
    const p = palette();
    expect(p.material('stone')).toBe(p.material('sandstone'));
    for (const kind of kinds) {
      expect(p.material(kind).isMeshStandardMaterial).toBe(true);
      expect(p.material(kind).map).toBeNull();
      expect(p.material(kind).userData.materialKind).toBe(kind);
    }
    expect(await p.load()).toMatchObject({ status: 'cpu-fallback', photographicTexturesLoaded: 0, downloadedBytes: 0, decodedBytes: 0, gpuBytes: 0, textureCount: 0 });
  });

  it('resolves every slot through its immutable instance URL, with no retargeting or cross-world cache', async () => {
    const callsA: string[] = [], callsB: string[] = [];
    const a = palette({ loadTexture: async (url: string) => { callsA.push(url); return { texture: makeTexture() }; } }, '/release-A/');
    const b = palette({ loadTexture: async (url: string) => { callsB.push(url); return { texture: makeTexture() }; } }, '/release-B/');
    await Promise.all([a.load(), b.load()]);
    expect(callsA.sort()).toEqual(assets.map(m => '/release-A/' + m.path).sort());
    expect(callsB.sort()).toEqual(assets.map(m => '/release-B/' + m.path).sort());
    expect(a.material('wood')).not.toBe(b.material('wood'));
    expect(a.material('wood').map).not.toBe(b.material('wood').map);
    a.dispose(); expect(b.stats().textureCount).toBe(27);
  });

  it('uses correct data color spaces, tiled mipmaps, bounded anisotropy and exact GPU accounting', async () => {
    const p = palette({ loadTexture: loader, anisotropy: 99 });
    await p.load();
    for (const kind of kinds) {
      const material = p.material(kind);
      expect(material.map.colorSpace).toBe(T.SRGBColorSpace);
      expect(material.normalMap.colorSpace).toBe(T.NoColorSpace);
      expect(material.roughnessMap.colorSpace).toBe(T.NoColorSpace);
      for (const slot of slots) {
        expect(material[slot].anisotropy).toBe(4);
        expect(material[slot].generateMipmaps).toBe(true);
        expect(material[slot].minFilter).toBe(T.LinearMipmapLinearFilter);
        expect(material[slot].wrapS).toBe(T.RepeatWrapping);
        expect(material[slot].wrapT).toBe(T.RepeatWrapping);
        expect(material[slot].repeat.toArray()).toEqual([1, 1]);
      }
    }
    expect(p.stats()).toMatchObject({ status: 'loaded', encodedBytes: encoded, downloadedBytes: encoded, decodedBytes: 27 * 512 * 512 * 4, gpuBytes: 37748700, budgetGpuBytes: 37748700 });
    expect(p.stats().gpuBytes).toBeLessThan(budget.maxGpuBytes);
  });

  it('starts base-only for mobile and reuses every texture when quality changes repeatedly', async () => {
    const p = palette({ loadTexture: loader, detail: false });
    await p.load();
    const wood = p.material('wood'), original = wood.map;
    expect(wood.normalMap).toBeNull(); expect(wood.roughnessMap).toBeNull();
    expect(p.stats()).toMatchObject({ textureCount: 9, downloadedBytes: baseEncoded, gpuBytes: 12582900 });
    p.applyQuality({ detail: true, anisotropy: 2 }); await p.load();
    const normal = wood.normalMap, rough = wood.roughnessMap;
    for (let i = 0; i < 5; i++) {
      p.applyQuality({ detail: false, anisotropy: 0 }); expect(wood.normalMap).toBeNull();
      p.applyQuality({ detail: true, anisotropy: 99 }); await p.load();
      expect(wood.map).toBe(original); expect(wood.normalMap).toBe(normal); expect(wood.roughnessMap).toBe(rough);
    }
    expect(loader).toHaveBeenCalledTimes(27);
  });

  it('limits concurrency to four and coalesces overlapping load calls', async () => {
    let active = 0, maximum = 0;
    const pending: (() => void)[] = [];
    const p = palette({ loadTexture: () => new Promise(resolve => {
      active++; maximum = Math.max(maximum, active);
      pending.push(() => { active--; resolve({ texture: makeTexture() }); });
    }) });
    const first = p.load(); expect(p.load()).toBe(first);
    for (let i = 0; i < 100 && p.stats().photographicTexturesLoaded < 27; i++) {
      await Promise.resolve(); pending.splice(0).forEach(resolve => resolve());
    }
    await first;
    expect(maximum).toBe(4); expect(active).toBe(0);
    expect(p.stats().textureCount).toBe(27);
  });

  it('keeps playable fallbacks and diagnostics on failures, never retrying endlessly', async () => {
    const failedLoader = vi.fn(async (url: string) => {
      if (url.includes('plaster-') || url.includes('-normal')) throw new Error('optional file unavailable');
      return { texture: makeTexture() };
    });
    const p = palette({ loadTexture: failedLoader });
    await p.load(); await p.load();
    expect(p.stats().status).toBe('degraded'); expect(p.stats().failedTextures).toBe(11);
    expect(p.material('plaster').map).toBeNull();
    expect(p.material('wood').map).not.toBeNull(); expect(p.material('wood').normalMap).toBeNull();
    expect(p.stats().assets.some(a => a.error === 'optional file unavailable')).toBe(true);
    expect(failedLoader).toHaveBeenCalledTimes(27);
  });

  it('times out hung loaders and disposes late results without installing them', async () => {
    vi.useFakeTimers();
    const pending: ((value: {texture: T.Texture}) => void)[] = [];
    const p = palette({ loadTexture: () => new Promise(resolve => pending.push(resolve)), timeoutMs: 10, detail: false });
    const loading = p.load();
    await vi.runAllTimersAsync();
    expect((await loading).failedTextures).toBe(9);
    const late = makeTexture(), release = vi.spyOn(late, 'dispose');
    pending[0]({ texture: late }); await Promise.resolve(); await Promise.resolve();
    expect(release).toHaveBeenCalledTimes(1); expect(p.stats().textureCount).toBe(0);
  });

  it('aborts disposal in flight and safely drops late callbacks', async () => {
    const signals: AbortSignal[] = [], pending: ((value: {texture: T.Texture}) => void)[] = [];
    const p = palette({ loadTexture: (_url: string, context: {signal: AbortSignal}) => new Promise(resolve => { signals.push(context.signal); pending.push(resolve); }) });
    const loading = p.load(); await Promise.resolve();
    p.dispose(); p.dispose();
    expect(signals).toHaveLength(4); expect(signals.every(s => s.aborted)).toBe(true);
    expect((await loading).status).toBe('disposed');
    for (const resolve of pending) {
      const texture = makeTexture(), release = vi.spyOn(texture, 'dispose');
      resolve({ texture }); await Promise.resolve(); await Promise.resolve();
      expect(release).toHaveBeenCalledTimes(1);
    }
    expect(p.stats().gpuBytes).toBe(0); expect(() => p.material('wood')).toThrow('disposed');
  });

  it('disposes each shared texture and material only once across all slots', async () => {
    const shared = makeTexture(), release = vi.spyOn(shared, 'dispose');
    const p = palette({ loadTexture: async () => ({ texture: shared }) });
    const materials = kinds.map(k => p.material(k)), disposals = materials.map(m => vi.spyOn(m, 'dispose'));
    await p.load();
    expect(p.stats().textureCount).toBe(1);
    p.applyQuality({ detail: false }); p.dispose(); p.dispose();
    expect(release).toHaveBeenCalledTimes(1);
    disposals.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
    materials.forEach(m => slots.forEach(slot => expect(m[slot]).toBeNull()));
  });

  it('uses the production browser loader with release-local fetch and releases all object URLs', async () => {
    class FakeImage {
      width = 512; height = 512;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(value: string) { if (value) queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal('Image', FakeImage);
    const fetchMock = vi.fn(async (_url: string) => new Response(new Uint8Array(100)));
    vi.stubGlobal('fetch', fetchMock);
    const create = vi.spyOn(URL, 'createObjectURL');
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    try {
      const p = palette();
      expect((await p.load()).downloadedBytes).toBe(2700);
      expect(fetchMock).toHaveBeenCalledTimes(27);
      expect(fetchMock.mock.calls.every(call => String(call[0]).startsWith('/games/cs/1.2.3/immutable-sha/assets/materials/'))).toBe(true);
      expect(create).toHaveBeenCalledTimes(27); expect(revoke).toHaveBeenCalledTimes(27);
      expect(p.stats().status).toBe('loaded');
    } finally { create.mockRestore(); revoke.mockRestore(); }
  });

  it('reports HTTP failures through the production loader without creating image URLs', async () => {
    vi.stubGlobal('Image', class {});
    const fetchMock = vi.fn(async () => new Response('not found', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    const p = palette({ detail: false });
    expect((await p.load()).failedTextures).toBe(9);
    expect(p.stats().downloadedBytes).toBe(0);
    expect(p.stats().assets.filter(a => a.error).every(a => a.error === 'Texture HTTP 404')).toBe(true);
    await p.load(); expect(fetchMock).toHaveBeenCalledTimes(9);
  });

  it('rejects mismatched dimensions before a malicious or corrupt file can exceed its GPU budget', async () => {
    const textures: T.Texture[] = [];
    const p = palette({ loadTexture: async () => { const texture = new T.Texture({ width: 4096, height: 4096 }); textures.push(texture); return { texture }; } });
    expect((await p.load()).failedTextures).toBe(27);
    expect(p.stats().textureCount).toBe(0); expect(p.stats().gpuBytes).toBe(0);
    expect(p.stats().assets.every(a => a.error?.includes('dimensions'))).toBe(true);
  });
});
