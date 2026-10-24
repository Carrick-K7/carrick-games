import { afterEach, describe, expect, it, vi } from 'vitest';
import { CsEngine } from '../src/csEngine.js';
import { CsGame } from '../src/cs';

const engines: any[] = [], games: CsGame[] = [];
afterEach(() => { games.splice(0).forEach(g => g.destroy()); engines.splice(0).forEach(e => e.dispose()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function engine() { const e: any = new CsEngine({ canvas: {}, isZh: () => false }); engines.push(e); return e; }

describe('CS truthful loading status', () => {
  it('distinguishes character preparation, mandatory map work and failure/retry', () => {
    const e = engine(); e.bootLoading = true;
    expect(e.loadingView()).toMatchObject({ stage: 'characters', canPlay: false });
    e.mapLoading = true; e.pendingWorld = { config: { id: 'de_dust2' } };
    expect(e.loadingView()).toMatchObject({ stage: 'map', detail: 'Dust II', canPlay: false });
    e.bootLoading = e.mapLoading = false; e.mapLoadError = 'Map failed';
    expect(e.loadingView()).toMatchObject({ stage: 'error', detail: 'Map failed', canPlay: false });
    e.ready = true;
    expect(e.loadingView()).toMatchObject({ stage: 'fallback', detail: 'Map failed', canPlay: true });
    e.mapLoadError = ''; e.mapLoading = true;
    expect(e.loadingView()).toMatchObject({ stage: 'map', canPlay: false });
  });

  it('counts only requested texture slots, does not mislabel failures as loaded, and permits play', () => {
    const e = engine(); e.ready = true;
    const assets = [{ slot: 'map', state: 'loaded' }, { slot: 'map', state: 'loading' }, { slot: 'normalMap', state: 'idle' }];
    const stats = { status: 'loading', quality: { detail: false }, assets };
    e.world = { materialPalette: { stats: () => stats } };
    expect(e.loadingView()).toMatchObject({ stage: 'materials', loaded: 1, total: 2, failed: 0, canPlay: true });
    assets[1].state = 'failed'; stats.status = 'degraded';
    expect(e.loadingView()).toMatchObject({ stage: 'fallback', loaded: 1, total: 2, failed: 1, canPlay: true });
    assets[1].state = 'loaded'; stats.status = 'loaded';
    expect(e.loadingView()).toMatchObject({ stage: 'ready', loaded: 2, total: 2, failed: 0, canPlay: true });
    stats.quality.detail = true;
    expect(e.loadingView()).toMatchObject({ stage: 'materials', loaded: 2, total: 3, canPlay: true });
  });

  it('does not invent photograph progress for CPU fallback or after disposal', () => {
    const e = engine(); e.ready = true; e.world = { materialPalette: { stats: () => ({ status: 'cpu-fallback' }) } };
    expect(e.loadingView()).toMatchObject({ stage: 'ready', loaded: 0, total: 0 });
    e.dispose(); expect(e.loadingView().canPlay).toBe(false);
  });
});

function game() {
  const ctx = new Proxy({ measureText: (s: string) => ({ width: s.length * 6 }) }, { get: (t, k) => (t as any)[k] ?? (() => undefined) }) as unknown as CanvasRenderingContext2D;
  const canvas = Object.assign(new EventTarget(), { width: 0, height: 0, dataset: {}, style: {}, getContext: () => ctx, focus: vi.fn(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }) });
  vi.stubGlobal('window', Object.assign(new EventTarget(), { devicePixelRatio: 1 }));
  vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false, pointerLockElement: null, hasFocus: () => true,
    createElement: () => new EventTarget(), exitPointerLock: vi.fn() }));
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1)); vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const g = new CsGame({ canvas: canvas as any, logicalWidth: 1280, logicalHeight: 720, isDarkTheme: () => true, isZhLang: () => false,
    isPixelMode: () => false, getRecord: () => null, reportScore: vi.fn(), requestShellRender: vi.fn() });
  games.push(g); return { g, e: (g as any).engine };
}

describe('CS shell restart during mandatory loading', () => {
  it('keeps the pending boot instead of dereferencing a missing world or duplicating initialization', () => {
    const { g, e } = game();
    const init = vi.spyOn(e, 'init').mockImplementation(() => { e.bootLoading = true; return Promise.resolve(); });
    g.prepare(); expect(e.world).toBeNull();
    expect(() => g.restart()).not.toThrow();
    expect(init).toHaveBeenCalledOnce(); expect(e.loadingView().stage).toBe('characters'); expect(e.player).toBeNull();
  });

  it('retries a failed initial map through the existing primary action without starting a match', () => {
    const { g, e } = game(), init = vi.spyOn(e, 'init').mockResolvedValue(undefined);
    g.prepare(); e.mapLoadError = 'Map failed'; e.renderer = { dispose: vi.fn() };
    const load = vi.spyOn(e, 'loadMap').mockResolvedValue(false), start = vi.spyOn(e, 'startMatch');
    expect(() => g.restart()).not.toThrow();
    expect(init).toHaveBeenCalledOnce(); expect(load).toHaveBeenCalledExactlyOnceWith('fy_snow'); expect(start).not.toHaveBeenCalled();
  });

  it('retries renderer/character failure without touching absent world resources', () => {
    const { g, e } = game(), init = vi.spyOn(e, 'init').mockResolvedValue(undefined);
    g.prepare(); e.bootError = 'WebGL failed';
    expect(() => g.restart()).not.toThrow();
    expect(init).toHaveBeenCalledTimes(2); expect(e.pickupItems).toEqual([]); expect(e.player).toBeNull();
  });
});
