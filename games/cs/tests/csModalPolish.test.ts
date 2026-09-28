import { afterEach, describe, expect, it, vi } from 'vitest';
import * as T from 'three';
import { CsEngine } from '../src/csEngine.js';
import { CsHud } from '../src/csHud';
import { computeHudLayout, overlayBounds, rectsOverlap, type HudRect } from '../src/csHudLayout';

// CPU-only paint/economy/input audit. The real engine is never initialized:
// its renderer stays null and its small deterministic world is test-owned.
const engines: any[] = [];
afterEach(() => { engines.splice(0).forEach(e => e.dispose()); vi.restoreAllMocks(); });
const DEEP_SAFE = { top: 44, right: 20, bottom: 34, left: 47 };
const ZERO_SAFE = { top: 0, right: 0, bottom: 0, left: 0 };
const SHAPES = [[1280, 720], [1100, 640], [320, 568], [390, 844], [568, 320], [844, 390]];
type Surface = 'menu' | 'settings' | 'pause' | 'result' | 'shop' | 'scoreboard' | 'radio' | 'map';
type TextPaint = { text: string; font: string; raw: HudRect; visible: HudRect | null; clip: HudRect | null };
function intersection(a: HudRect, b: HudRect): HudRect | null {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.w, b.x + b.w) - x, h = Math.min(a.y + a.h, b.y + b.h) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}
function paintRecorder() {
  const text: TextPaint[] = [], radar: HudRect[] = [];
  let state = { font: '14px sans-serif', textAlign: 'left', textBaseline: 'middle', fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1, dx: 0, dy: 0, clip: null as HudRect | null };
  const stack: typeof state[] = [];
  let pathRect: HudRect | null = null;
  const ctx: any = new Proxy({}, {
    get: (_target, key) => methods[key as string] ?? (key in state ? state[key as keyof typeof state] : (() => {})),
    set: (_target, key, value) => { (state as any)[key] = value; return true; },
  });
  const methods: Record<string, (...args: any[]) => any> = {
    save: () => stack.push({ ...state }), restore: () => { state = stack.pop()!; },
    translate: (x, y) => { state.dx += x; state.dy += y; },
    beginPath: () => { pathRect = null; },
    rect: (x, y, w, h) => { pathRect = { x: x + state.dx, y: y + state.dy, w, h }; },
    clip: () => { if (pathRect) state.clip = state.clip ? intersection(state.clip, pathRect) ?? { x: 0, y: 0, w: 0, h: 0 } : pathRect; },
    measureText: (value: string) => {
      const size = Number(state.font.match(/([\d.]+)px/)?.[1] || 14);
      return { width: Array.from(String(value)).reduce((sum, c) => sum + size * (/[^\u0000-\u024f]/u.test(c) ? 1 : .55), 0) };
    },
    fillText: (value, x, y) => {
      const size = Number(state.font.match(/([\d.]+)px/)?.[1] || 14), w = methods.measureText(String(value)).width;
      const raw = { x: x + state.dx - (state.textAlign === 'center' ? w / 2 : state.textAlign === 'right' ? w : 0), y: y + state.dy - size / 2, w, h: size };
      if (String(value).trim()) text.push({ text: String(value), font: state.font, raw, clip: state.clip && { ...state.clip }, visible: state.clip ? intersection(raw, state.clip) : raw });
    },
  };
  return { ctx: ctx as CanvasRenderingContext2D, text, radar, clear: () => { text.length = radar.length = 0; } };
}
function fixture(zh = false) {
  const capture = vi.fn(), release = vi.fn();
  const e: any = new CsEngine({ canvas: {} as any, isZh: () => zh, hooks: { requestCapture: capture, releaseCapture: release } });
  engines.push(e);
  vi.spyOn(e.audio, 'init').mockImplementation(() => {});
  vi.spyOn(e.audio, 'mechanic').mockReturnValue(false);
  e.player = e.makeActor('ct', zh ? '名称很长的本地玩家' : 'LONG LOCAL PLAYER NAME', true);
  e.player.money = 16000;
  e.all = [e.player, ...Array.from({ length: 9 }, (_, i) => Object.assign(e.makeActor(i < 4 ? 'ct' : 't', zh ? `队员名称很长${i}` : `LONG BOT NAME ${i}`), { kills: 100 - i, deaths: i + 10, alive: i % 3 !== 0 }))];
  e.player.kills = 123;
  e.world = { theme: 'desert', size: 100, center: new T.Vector3(), bombSites: [], pickups: [],
    spawns: { ct: [{ pos: new T.Vector3() }], t: [{ pos: new T.Vector3(40, 0, 40) }] },
    buyZones: [{ team: 'ct', box: new T.Box3(new T.Vector3(-4, -4, -4), new T.Vector3(4, 4, 4)) }], dispose: vi.fn() };
  e.ready = true; e.matchActive = true; e.mode = 'elimination'; e.selectedMap = 'de_dust2'; e.selectedMode = 'tdm'; e.phase = 'active';
  e.scores = { ct: 12, t: 9 }; e.hud.timerText = '1:05'; e.computeHud();
  const recorder = paintRecorder();
  vi.spyOn(e, 'drawRadarContent').mockImplementation((_ctx: any, x: number, y: number, size: number) => recorder.radar.push({ x, y, w: size, h: size }));
  const hud = new CsHud(e);
  const select = (surface: Surface) => {
    e.settingsOpen = e.buyOpen = e.mapOpen = e.hud.scoreboardOpen = false;
    e.radioMenu = null; e.hud.matchEnd = null; e.phase = 'active';
    if (surface === 'menu') e.phase = 'menu';
    if (surface === 'settings') { e.phase = 'menu'; e.settingsOpen = true; }
    if (surface === 'pause') e.pauseGame();
    if (surface === 'result') { e.phase = 'match-end'; e.hud.matchEnd = { won: true, title: zh ? '反恐精英获胜' : 'Counter-terrorists win', score: '12 : 9', stats: zh ? '击杀 123 · 阵亡 19 · 爆头 45' : 'Kills 123 · Deaths 19 · Headshots 45' }; }
    if (surface === 'shop') { e.buyOpen = true; e.buyCategory = 'pistol'; }
    if (surface === 'scoreboard') e.hud.scoreboardOpen = true;
    if (surface === 'radio') e.openRadio('radio3');
    if (surface === 'map') e.mapOpen = true;
    e.computeHud();
  };
  const draw = (width: number, height: number, safe = ZERO_SAFE) => {
    recorder.clear(); hud.setSafeArea(safe); hud.draw(recorder.ctx, width, height);
    return computeHudLayout(width, height, safe);
  };
  return { e, hud, capture, release, recorder, select, draw };
}
function inside(rect: HudRect, bounds: HudRect, label = '') {
  expect(rect.x, label).toBeGreaterThanOrEqual(bounds.x - .001);
  expect(rect.y, label).toBeGreaterThanOrEqual(bounds.y - .001);
  expect(rect.x + rect.w, label).toBeLessThanOrEqual(bounds.x + bounds.w + .001);
  expect(rect.y + rect.h, label).toBeLessThanOrEqual(bounds.y + bounds.h + .001);
}
function assertPaint(f: ReturnType<typeof fixture>, bounds: HudRect) {
  const visible = f.recorder.text.filter(t => t.visible && t.visible.w > .01 && t.visible.h > .01);
  for (const [i, p] of visible.entries()) {
    inside(p.visible!, bounds, p.text);
    for (const previous of visible.slice(0, i)) {
      expect(rectsOverlap(p.visible!, previous.visible!), `${p.text} overlaps ${previous.text}`).toBe(false);
    }
  }
  for (const region of f.hud.regions.filter(r => r.id)) {
    inside(region, bounds, region.id);
    expect(region.w, region.id).toBeGreaterThanOrEqual(44);
    expect(region.h, region.id).toBeGreaterThanOrEqual(44);
  }
}

describe('CS modal paint and hit-region audit', () => {
  for (const [W, H] of SHAPES) for (const safe of [ZERO_SAFE, DEEP_SAFE]) for (const zh of [false, true]) {
    it(`${W}x${H} ${safe === DEEP_SAFE ? 'deep-safe' : 'plain'} ${zh ? 'ZH' : 'EN'}: painted modal text, chrome and real targets remain disjoint`, () => {
      const f = fixture(zh);
      for (const surface of ['menu', 'settings', 'pause', 'result', 'shop', 'scoreboard', 'radio', 'map'] as Surface[]) {
        f.select(surface);
        const L = f.draw(W, H, safe), bounds = overlayBounds(L);
        assertPaint(f, bounds);
        const scroll = f.hud.regions.find(r => r.scroll)?.scroll;
        if (scroll?.max) {
          f.hud.onWheel(scroll.max / 2); f.draw(W, H, safe); assertPaint(f, bounds);
          f.hud.onWheel(scroll.max); f.draw(W, H, safe); assertPaint(f, bounds);
        }
        if (surface === 'map') expect(f.recorder.radar[0].w).toBeGreaterThanOrEqual(90);
        if (surface === 'radio') expect(f.hud.regions.some(r => r.id?.startsWith('touch-'))).toBe(false);
      }
    });
  }
  it.each([false, true])('deep-safe 166px panels expose every option as a full 44px target, zh=%s', zh => {
    const f = fixture(zh);
    const required: Partial<Record<Surface, string[]>> = {
      menu: ['menu-map-fy_snow', 'menu-map-de_dust2', 'menu-mode-defusal', 'menu-mode-tdm', 'menu-limit-100', 'menu-team-ct', 'menu-team-t', 'menu-skill-hard', 'menu-pistol-deagle'],
      settings: ['settings-sensitivity', 'settings-scope', 'settings-knife-butterfly', 'settings-pistol-deagle', 'settings-hit-full', 'settings-quality-low', 'settings-sound-off'],
      pause: ['pause-settings', 'pause-scoreboard', 'pause-radio', 'pause-restart', 'pause-menu'],
      result: ['result-menu'], radio: Array.from({ length: 8 }, (_, i) => `radio-choice-${i + 1}`),
    };
    for (const [surface, ids] of Object.entries(required)) {
      f.select(surface as Surface); f.draw(568, 320, DEEP_SAFE);
      const fixed = f.hud.regions.filter(r => r.id && !r.deferTap).map(r => ({ id: r.id, x: r.x, y: r.y, w: r.w, h: r.h }));
      const seen = new Set<string>(), scroll = f.hud.regions.find(r => r.scroll)!.scroll!;
      for (let step = 0; step <= Math.ceil(scroll.max / 4); step++) {
        f.draw(568, 320, DEEP_SAFE);
        for (const r of f.hud.regions) if (r.id && r.w >= 44 && r.h >= 44) seen.add(r.id);
        for (const r of fixed) expect(f.hud.regions.find(current => current.id === r.id)).toMatchObject(r);
        f.hud.onWheel(4);
      }
      expect(ids.filter(id => !seen.has(id)), surface).toEqual([]);
    }
  });
  it('keeps shop navigation fixed, prices separate and notifications painted after a real equipment purchase', () => {
    const f = fixture(); f.select('shop'); f.e.setBuyCategory('equipment');
    f.draw(568, 320, DEEP_SAFE);
    const before = f.hud.regions.filter(r => r.id?.startsWith('shop-category-')).map(r => ({ id: r.id, x: r.x, y: r.y, w: r.w, h: r.h }));
    f.hud.onWheel(100); f.draw(568, 320, DEEP_SAFE);
    for (const r of before) expect(f.hud.regions.find(current => current.id === r.id)).toMatchObject(r);
    f.e.player.armor = 100; f.e.player.helmet = false; f.e.player.money = 400;
    expect(f.e.shopView().items.find((i: any) => i.id === 'armor')).toMatchObject({ priceText: '$ 350', disabled: false });
    f.e.buy('armor');
    expect(f.e.player.money).toBe(50);
    expect(f.e.shopView().items.find((i: any) => i.id === 'armor')).toMatchObject({ priceText: 'Owned', status: 'owned', disabled: true });
    expect(f.e.shopView().items.find((i: any) => i.id === 'he')).toMatchObject({ status: 'funds', disabled: true, statusText: 'Insufficient funds' });
    f.draw(568, 320, DEEP_SAFE);
    expect(f.recorder.text.some(t => t.visible && t.text.includes('Purchased'))).toBe(true);
    f.e.buy('he'); f.draw(568, 320, DEEP_SAFE);
    expect(f.recorder.text.some(t => t.visible && t.text.includes('Cannot buy'))).toBe(true);
    f.e.setBuyCategory('rifle');
    expect(f.e.shopView().items.every((i: any) => !/[\u3400-\u9fff]/u.test(i.detail))).toBe(true);
  });
  it('pause → scoreboard close returns to the same manual pause without capture', () => {
    const f = fixture(); f.select('pause'); f.draw(1280, 720);
    f.hud.regions.find(r => r.id === 'pause-scoreboard')!.down!(0, 0);
    f.draw(1280, 720);
    expect(f.e.phase).toBe('paused'); expect(f.e.hud.scoreboardOpen).toBe(true);
    f.hud.regions.find(r => r.id === 'scoreboard-close')!.down!(0, 0);
    expect(f.e.phase).toBe('paused'); expect(f.e.hud.scoreboardOpen).toBe(false);
    expect(f.capture).not.toHaveBeenCalled();
  });
  it('radio blocks blank mouse presses, preserves live/manual clock ownership and Escape never recaptures', () => {
    const f = fixture(); f.select('radio');
    expect(f.e.phase).toBe('active'); expect(f.e.overlayOpen()).toBe(true);
    const ammo = f.e.weaponOf(f.e.player).ammo;
    f.e.onMouseDown(0, 2, 2); f.e.onMouseDown(2, 2, 2);
    expect(f.e.fireHeld).toBe(false); expect(f.e.shotPressed).toBe(false);
    expect(f.e.weaponOf(f.e.player).ammo).toBe(ammo); expect(f.capture).not.toHaveBeenCalled();
    // Clock branch is real; omitting the world avoids claiming a CPU combat simulation.
    const world = f.e.world; f.e.world = null;
    const clock = f.e.clock; f.e.update(.04); expect(f.e.clock).toBeCloseTo(clock + .04);
    f.e.world = world;
    f.e.onKeyDown({ code: 'Escape', repeat: false, preventDefault() {} });
    expect(f.e.radioMenu).toBeNull(); expect(f.capture).not.toHaveBeenCalled();
    f.e.pauseGame(); f.e.openRadio('radio3');
    f.e.world = null; const paused = f.e.clock; f.e.update(.04); expect(f.e.clock).toBe(paused); f.e.world = world;
    f.e.onKeyDown({ code: 'Digit8', repeat: false, preventDefault() {} });
    expect(f.e.phase).toBe('paused'); expect(f.e.radioMenu).toBeNull();
    expect(f.e.hud.notice.text).toBe('Radio · Enemy down'); expect(f.capture).not.toHaveBeenCalled();
    f.e.resumeGame(false); f.e.openRadio('radio1'); f.draw(1280, 720);
    f.hud.regions.find(r => r.id === 'radio-choice-1')!.down!(0, 0);
    expect(f.e.phase).toBe('active'); expect(f.e.hud.notice.text).toBe('Radio · Cover me');
    expect(f.capture).toHaveBeenCalledTimes(1); // Explicit active selection may request trusted capture.
    f.e.toggleBuy(); f.e.onMouseDown(0, 2, 2);
    expect(f.e.fireHeld).toBe(false); expect(f.capture).toHaveBeenCalledTimes(1);
  });
});
