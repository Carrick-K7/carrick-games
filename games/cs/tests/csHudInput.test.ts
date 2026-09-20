import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameHost } from '@carrick/game-sdk/game';
import { CsGame } from '../src/cs';
import type { CsHud, HudRegion } from '../src/csHud';
import { computeHudLayout, HudScroll } from '../src/csHudLayout';

// Keep the real BaseGame coordinate/lifecycle adapter and real HUD hit-testing;
// only the WebGL engine and browser event/canvas boundary are mocked.
const engineRef = vi.hoisted(() => ({ current: null as any }));
vi.mock('../src/csEngine.js', () => ({
  CsEngine: class { constructor() { return engineRef.current; } },
}));

class MockMouseEvent extends Event {
  readonly clientX: number;
  readonly clientY: number;
  readonly button: number;
  constructor(type: string, options: { clientX?: number; clientY?: number; button?: number } = {}) {
    super(type, { cancelable: true });
    this.clientX = options.clientX ?? 0;
    this.clientY = options.clientY ?? 0;
    this.button = options.button ?? 0;
  }
}
class MockKeyboardEvent extends Event {
  readonly key: string;
  readonly code: string;
  readonly repeat = false;
  constructor(type: string, key: string) { super(type); this.key = this.code = key; }
}
class MockTouchEvent extends Event {
  constructor(type: string, readonly changedTouches: { identifier: number; clientX: number; clientY: number }[]) {
    super(type, { cancelable: true });
  }
}

let game: CsGame;
let hud: CsHud;
let engine: ReturnType<typeof makeEngine>;
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let windowEvents: EventTarget;

function makeEngine() {
  return {
    phase: 'menu', matchActive: false, settingsOpen: false, buyOpen: false, mapOpen: false, buyCategory: 'pistol',
    selectedMap: 'fy_snow', selectedMode: 'elimination', bootLoading: false, mapLoading: false,
    hud: { matchEnd: null, scoreboardOpen: false }, ready: true, touchMode: true,
    controlSettings: { sensitivity: .8, scopeSensitivity: 1, knifeModel: 'classic', hitFeedback: 'full' },
    selectedPistol: 'default', quality: 'low', audio: { enabled: true }, settingsNote: '',
    isZh: () => false, startMatch: vi.fn(), init: vi.fn(), dispose: vi.fn(), toMenu: vi.fn(),
    clearHeldInput: vi.fn(() => { engine.hud.scoreboardOpen = false; }),
    onWindowBlur: vi.fn(), onWindowFocus: vi.fn(), onVisibilityChange: vi.fn(),
    onMouseDown: vi.fn(), onMouseMove: vi.fn(), onMouseUp: vi.fn(), onKeyDown: vi.fn(), onKeyUp: vi.fn(),
    onWheel: vi.fn(), touchLook: vi.fn(), resize: vi.fn(), update: vi.fn(),
    closeSettings: vi.fn(), resetSettings: vi.fn(), setSensitivity: vi.fn(), setScopeSensitivity: vi.fn(),
    setKnifeModel: vi.fn(), setPistol: vi.fn(), setHitFeedback: vi.fn(), setQuality: vi.fn(), toggleSound: vi.fn(),
    pauseGame: vi.fn(() => { engine.phase = 'paused'; }),
    resumeGame: vi.fn(() => { engine.phase = 'active'; }),
  };
}

beforeEach(() => {
  windowEvents = Object.assign(new EventTarget(), { devicePixelRatio: 2 });
  vi.stubGlobal('window', windowEvents);
  vi.stubGlobal('document', Object.assign(new EventTarget(), {
    hidden: false, pointerLockElement: null,
    createElement: () => ({ getContext: () => null }),
  }));
  vi.stubGlobal('KeyboardEvent', MockKeyboardEvent);
  vi.stubGlobal('MouseEvent', MockMouseEvent);
  vi.stubGlobal('TouchEvent', MockTouchEvent);
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  ctx = new Proxy({ measureText: (text: string) => ({ width: text.length * 6 }) }, {
    get: (target, key) => (target as any)[key] ?? (() => undefined),
  }) as unknown as CanvasRenderingContext2D;
  canvas = Object.assign(new EventTarget(), {
    width: 0, height: 0, dataset: {}, style: {}, getContext: () => ctx,
    // Deliberately use a display scale, nonzero origin and DPR=2. The adapter
    // must use BaseGame.canvasPoint, not the backing-store pixel dimensions.
    getBoundingClientRect: () => ({ left: 20, top: 30, width: 640, height: 360 }),
  }) as unknown as HTMLCanvasElement;
  engine = makeEngine();
  engineRef.current = engine;
  game = new CsGame({
    canvas, logicalWidth: 1280, logicalHeight: 720,
    isDarkTheme: () => true, isZhLang: () => false, isPixelMode: () => false,
    getRecord: () => null, reportScore: vi.fn(), requestShellRender: vi.fn(),
  } satisfies GameHost);
  hud = (game as unknown as { hudView: CsHud }).hudView;
});

afterEach(() => { game.destroy(); vi.unstubAllGlobals(); });

function clientPoint(x: number, y: number) {
  return { clientX: 20 + x / Number(canvas.dataset.logicalWidth) * 640, clientY: 30 + y / Number(canvas.dataset.logicalHeight) * 360 };
}
function touch(type: string, x: number, y: number, identifier = 1) {
  game.handleInput(new MockTouchEvent(type, [{ identifier, ...clientPoint(x, y) }]) as unknown as TouchEvent);
}
function mouse(type: string, x: number, y: number, button = 0) {
  game.handleInput(new MockMouseEvent(type, { ...clientPoint(x, y), button }) as unknown as MouseEvent);
}
function control(extra: Partial<HudRegion> = {}) {
  const scroll = new HudScroll();
  scroll.setMax(500);
  const region: HudRegion = {
    id: 'settings-sensitivity', x: 100, y: 100, w: 300, h: 44,
    deferTap: true, dragAxis: 'x', scroll, down: vi.fn(), drag: vi.fn(), up: vi.fn(), ...extra,
  };
  hud.regions = [region];
  return region;
}

// No real WebGL context, DOM test environment, or private scene is required.
describe('CS HUD input capture', () => {
  it('resolves horizontal slider intent and keeps capture outside the hit rect at HiDPI', () => {
    const region = control();
    touch('touchstart', 160, 120);
    expect(region.down).not.toHaveBeenCalled();
    touch('touchmove', 166, 125);
    expect(region.drag).not.toHaveBeenCalled();
    touch('touchmove', 210, 124);
    expect(region.down).toHaveBeenCalledExactlyOnceWith(160, 120);
    expect(region.drag).toHaveBeenLastCalledWith(210, 124);
    touch('touchmove', 600, 200);
    expect(region.drag).toHaveBeenLastCalledWith(600, 200);
    expect(region.scroll!.offset).toBe(0);
    touch('touchend', 600, 200);
    expect(region.up).toHaveBeenCalledTimes(1);
    expect(region.down).toHaveBeenCalledTimes(1);
    expect(canvas.width).toBe(2560);
    touch('touchmove', 700, 200);
    expect(region.drag).not.toHaveBeenLastCalledWith(700, 200);
  });

  it('yields vertical slider drags to panel scroll without changing the setting', () => {
    const region = control();
    const end = vi.spyOn(region.scroll!, 'endDrag');
    touch('touchstart', 160, 120);
    touch('touchmove', 164, 70);
    expect(region.scroll!.offset).toBe(50);
    touch('touchmove', 380, 50); // Once vertical intent wins, it stays scrolling.
    touch('touchend', 380, 50);
    expect(region.scroll!.offset).toBe(70);
    expect(region.down).not.toHaveBeenCalled();
    expect(region.drag).not.toHaveBeenCalled();
    expect(region.up).not.toHaveBeenCalled();
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('resolves a deferred tap through the latest same-ID callback after redraw', () => {
    const initial = control({ dragAxis: undefined, drag: undefined });
    touch('touchstart', 160, 120);
    const current = { ...initial, down: vi.fn(), up: vi.fn() };
    hud.regions = [current];
    touch('touchend', 164, 124);
    expect(initial.down).not.toHaveBeenCalled();
    expect(current.down).toHaveBeenCalledExactlyOnceWith(164, 124);
    expect(current.up).toHaveBeenCalledTimes(1);
  });

  it.each(['disabled', 'removed', 'moved', 'covered'] as const)('does not activate a %s deferred choice', reason => {
    const region = control({ dragAxis: undefined, drag: undefined });
    touch('touchstart', 160, 120);
    if (reason === 'disabled') hud.regions = [{ ...region, disabled: true }];
    if (reason === 'removed') hud.regions = [];
    if (reason === 'moved') hud.regions = [{ ...region, y: 90 }];
    if (reason === 'covered') hud.regions.push({ x: 0, y: 0, w: 1000, h: 500 });
    touch('touchend', 160, 120);
    expect(region.down).not.toHaveBeenCalled();
    expect(region.up).not.toHaveBeenCalled();
  });

  it('does not turn horizontal choice swipes or out-of-bounds releases into taps', () => {
    const region = control({ dragAxis: undefined, drag: undefined });
    touch('touchstart', 160, 120);
    touch('touchmove', 250, 121);
    touch('touchend', 160, 120);
    touch('touchstart', 101, 120);
    touch('touchend', 98, 120);
    expect(region.down).not.toHaveBeenCalled();
  });

  it('handles coalesced final touch movement as a drag rather than a tap', () => {
    const region = control();
    touch('touchstart', 160, 120);
    touch('touchend', 260, 124);
    expect(region.down).toHaveBeenCalledExactlyOnceWith(160, 120);
    expect(region.drag).toHaveBeenCalledExactlyOnceWith(260, 124);
    expect(region.up).toHaveBeenCalledTimes(1);
  });

  it('touch cancellation ends scrolling and mouse captures without applying pending choices', () => {
    const region = control();
    const end = vi.spyOn(region.scroll!, 'endDrag');
    touch('touchstart', 160, 120);
    touch('touchmove', 164, 70);
    touch('touchcancel', 164, 70);
    expect(end).toHaveBeenCalledTimes(1);
    touch('touchstart', 160, 120);
    touch('touchcancel', 160, 120);
    expect(region.down).not.toHaveBeenCalled();
    mouse('mousedown', 160, 120);
    touch('touchcancel', 160, 120);
    mouse('mouseup', 160, 120);
    expect(region.up).toHaveBeenCalledTimes(1);
    expect(engine.clearHeldInput).toHaveBeenCalled();
  });

  it('cancels held input before release and releases anonymous gameplay regions', () => {
    const order: string[] = [];
    engine.clearHeldInput.mockImplementation(() => { order.push('clear'); });
    const region = control({ id: undefined, deferTap: false, up: vi.fn(() => { order.push('up'); }) });
    touch('touchstart', 160, 120);
    touch('touchcancel', 160, 120);
    touch('touchend', 160, 120);
    expect(order).toEqual(['clear', 'up']);
    expect(region.up).toHaveBeenCalledTimes(1);
  });

  it('gives a scroll container only one finger owner', () => {
    const region = control();
    touch('touchstart', 160, 120, 1);
    touch('touchstart', 170, 120, 2);
    touch('touchmove', 170, 70, 2);
    touch('touchend', 170, 70, 2);
    expect(region.scroll!.offset).toBe(0);
    touch('touchmove', 160, 80, 1);
    touch('touchend', 160, 80, 1);
    expect(region.scroll!.offset).toBe(40);
    expect(region.down).not.toHaveBeenCalled();
  });

  it('releases horizontal captures and ignores late input while shell UI is open', () => {
    const region = control();
    touch('touchstart', 160, 120);
    touch('touchmove', 200, 120);
    game.onShellOverlayChange(true);
    touch('touchend', 200, 120);
    mouse('mousedown', 160, 120);
    game.handleInput(new MockKeyboardEvent('keydown', 'KeyW') as unknown as KeyboardEvent);
    expect(region.up).toHaveBeenCalledTimes(1);
    expect(region.down).toHaveBeenCalledTimes(1);
    expect(engine.onMouseDown).not.toHaveBeenCalled();
    expect(engine.onKeyDown).not.toHaveBeenCalled();
    game.onShellOverlayChange(false);
    touch('touchend', 200, 120);
    expect(region.down).toHaveBeenCalledTimes(1);
  });

  it('preserves a preexisting manual pause through a shell overlay', () => {
    engine.matchActive = true;
    engine.phase = 'paused';
    game.onShellOverlayChange(true);
    game.onShellOverlayChange(false);
    expect(engine.pauseGame).not.toHaveBeenCalled();
    expect(engine.resumeGame).not.toHaveBeenCalled();
    engine.phase = 'active';
    game.onShellOverlayChange(true);
    game.onShellOverlayChange(false);
    expect(engine.resumeGame).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('invalidates menu actions when a panel changes before another frame', () => {
    const region = control();
    touch('touchstart', 160, 120);
    engine.settingsOpen = true;
    touch('touchend', 160, 120);
    mouse('mousedown', 160, 120);
    expect(region.down).not.toHaveBeenCalled();
    expect(hud.regions).toEqual([]);
  });

  it.each(['mode', 'map', 'loading'] as const)('invalidates menu actions on %s transitions before redraw', change => {
    const region = control();
    touch('touchstart', 160, 120);
    if (change === 'mode') engine.selectedMode = 'tdm';
    if (change === 'map') engine.selectedMap = 'de_dust2';
    if (change === 'loading') engine.mapLoading = true;
    touch('touchend', 160, 120);
    expect(region.down).not.toHaveBeenCalled();
    expect(hud.regions).toEqual([]);
  });

  it('invalidates sibling touches immediately when an action transitions panels', () => {
    const pending = control({ scroll: undefined, dragAxis: undefined, drag: undefined });
    const close: HudRegion = {
      id: 'menu-settings', x: 500, y: 100, w: 100, h: 44,
      down: vi.fn(() => { engine.settingsOpen = true; }),
    };
    hud.regions.push(close);
    touch('touchstart', 160, 120, 1);
    touch('touchstart', 550, 120, 2);
    touch('touchend', 160, 120, 1);
    expect(close.down).toHaveBeenCalledTimes(1);
    expect(pending.down).not.toHaveBeenCalled();
    expect(hud.regions).toEqual([]);
  });

  it('resize, presentation pause and blur cancel pending actions', () => {
    const region = control();
    touch('touchstart', 160, 120);
    // Avoid unrelated menu rendering; the real viewport/HiDPI path still runs.
    vi.spyOn(hud, 'draw').mockImplementation(() => {});
    game.setViewport({ width: 1280, height: 720, dpr: 2, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } });
    touch('touchend', 160, 120);
    touch('touchstart', 160, 120);
    game.setPresentationPaused(true);
    game.setPresentationPaused(false);
    touch('touchend', 160, 120);
    touch('touchstart', 160, 120);
    windowEvents.dispatchEvent(new Event('blur'));
    touch('touchend', 160, 120);
    expect(region.down).not.toHaveBeenCalled();
    expect(engine.onWindowBlur).toHaveBeenCalledTimes(1);
  });

  it('lets mouse buttons reach gameplay through touch-only look bands on hybrid devices', () => {
    engine.phase = 'active';
    hud.regions = [{ id: 'look', x: 100, y: 100, w: 300, h: 200 }];
    for (const button of [0, 2]) {
      mouse('mousedown', 160, 120, button);
      mouse('mouseup', 160, 120, button);
      expect(engine.onMouseDown).toHaveBeenLastCalledWith(button, 100, 90);
      expect(engine.onMouseUp).toHaveBeenLastCalledWith(button);
    }
    mouse('mousemove', 180, 130);
    expect(engine.onMouseMove).toHaveBeenCalledTimes(1);
    expect(engine.onMouseDown).toHaveBeenCalledTimes(2);
    touch('touchstart', 160, 120);
    touch('touchmove', 180, 130);
    touch('touchend', 180, 130);
    expect(engine.touchLook).toHaveBeenCalledExactlyOnceWith(10, 5);
    expect(engine.onMouseDown).toHaveBeenCalledTimes(2);

    // Other HUD surfaces still consume mouse presses, including passive
    // modal blockers layered above the look band.
    hud.regions.push({ x: 100, y: 100, w: 300, h: 200 });
    mouse('mousedown', 160, 120);
    expect(engine.onMouseDown).toHaveBeenCalledTimes(2);
  });

  it('captures mouse drags outside the canvas and releases on window mouseup only once', () => {
    const region = control();
    (game as any).bindInput();
    mouse('mousedown', 160, 120);
    windowEvents.dispatchEvent(new MockMouseEvent('mousemove', { clientX: 420, clientY: 230 }));
    expect(region.drag).toHaveBeenLastCalledWith(800, 400);
    windowEvents.dispatchEvent(new MockMouseEvent('mouseup'));
    windowEvents.dispatchEvent(new MockMouseEvent('mouseup'));
    expect(region.up).toHaveBeenCalledTimes(1);
    expect(region.down).toHaveBeenCalledExactlyOnceWith(160, 120);
    windowEvents.dispatchEvent(new MockMouseEvent('mousemove', { clientX: 470, clientY: 230 }));
    expect(region.drag).not.toHaveBeenLastCalledWith(900, 400);
  });

  it('maps real scrolled settings-slider hits to logical x for touch and mouse', () => {
    engine.settingsOpen = true;
    vi.spyOn(hud, 'draw').mockImplementation((context, width, height) => {
      (hud as any).drawSettings(context, computeHudLayout(width, height));
    });
    game.setViewport({ width: 844, height: 390, dpr: 2, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } });
    hud.onWheel(60);
    game.draw(ctx);
    // Scoped sensitivity is the second slider; its visible screen-space hit
    // rectangle has moved, while the setting still depends on logical x only.
    const slider = hud.regions.filter(region => region.deferTap && region.drag).at(-1)!;
    expect(slider).toBeDefined();
    expect(slider.dragAxis).toBe('x');
    const y = slider.y + slider.h / 2;
    const x = slider.x + slider.w * .65;
    // The hit target may extend past the visual rail. Compare against the
    // HUD's own logical-coordinate callback, not an assumed rail inset.
    slider.down!(x, y);
    const expected = engine.setScopeSensitivity.mock.calls.at(-1)![0];
    engine.setScopeSensitivity.mockClear();
    touch('touchstart', x, y);
    game.draw(ctx); // immediate-mode redraw must not lose the stable capture.
    touch('touchend', x, y);
    expect(engine.setScopeSensitivity).toHaveBeenCalledTimes(1);
    expect(engine.setScopeSensitivity.mock.calls[0][0]).toBeCloseTo(expected);
    mouse('mousedown', x, y);
    mouse('mouseup', x, y);
    expect(engine.setScopeSensitivity.mock.calls.at(-1)![0]).toBeCloseTo(expected);
    touch('touchstart', slider.x + slider.w * .25, y);
    touch('touchmove', x, y + 3);
    touch('touchend', x, y + 3);
    expect(engine.setScopeSensitivity.mock.calls.at(-1)![0]).toBeCloseTo(expected);
  });

  it('keeps a capture across identical viewport notifications', () => {
    vi.spyOn(hud, 'draw').mockImplementation(() => {});
    const viewport = { width: 1280, height: 720, dpr: 2, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } };
    game.setViewport(viewport);
    const region = control();
    touch('touchstart', 160, 120);
    game.setViewport({ ...viewport });
    touch('touchend', 160, 120);
    expect(region.down).toHaveBeenCalledTimes(1);
  });

  it('ends shell-interrupted scroll capture and clears stale wheel hit regions', () => {
    const region = control();
    const end = vi.spyOn(region.scroll!, 'endDrag');
    touch('touchstart', 160, 120);
    touch('touchmove', 160, 70);
    game.onShellOverlayChange(true);
    expect(end).toHaveBeenCalledTimes(1);
    game.onShellOverlayChange(false);
    hud.regions = [region];
    engine.settingsOpen = true;
    // Set the context before this capture, as a settings draw would do.
    game.update(0);
    hud.regions = [region];
    touch('touchstart', 160, 120);
    (game as any).bindInput();
    canvas.dispatchEvent(Object.assign(new Event('wheel', { cancelable: true }), { deltaY: 40 }));
    touch('touchend', 160, 120);
    expect(region.down).not.toHaveBeenCalled();
    expect(hud.regions).toEqual([]);
  });

  it('treats scoreboard visibility as a panel transition without closing it during scrolling', () => {
    engine.phase = 'active';
    const region = control({ deferTap: false });
    touch('touchstart', 160, 120);
    engine.hud.scoreboardOpen = true;
    touch('touchmove', 180, 120);
    expect(region.up).toHaveBeenCalledTimes(1);
    expect(region.drag).not.toHaveBeenCalled();
    expect(engine.hud.scoreboardOpen).toBe(true);
    expect(hud.regions).toEqual([]);
    (game as any).bindInput();
    canvas.dispatchEvent(Object.assign(new Event('wheel', { cancelable: true }), { deltaY: 40 }));
    expect(engine.hud.scoreboardOpen).toBe(true);
    vi.spyOn(hud, 'draw').mockImplementation(() => {});
    game.setViewport({ width: 1200, height: 600, dpr: 2, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } });
    expect(engine.hud.scoreboardOpen).toBe(true);
    game.onShellOverlayChange(true);
    expect(engine.hud.scoreboardOpen).toBe(false);
  });

  it('exposes only JSON-safe current HUD rectangles through the game-owned debug hook', () => {
    game.init();
    control();
    hud.regions.push({ x: 0, y: 0, w: 50, h: 50, disabled: true, down: vi.fn() });
    const debug = (window as any).__CSX_DEBUG__;
    const data = debug.ui();
    expect(data).toEqual({ width: 1280, height: 720, regions: [
      { id: 'settings-sensitivity', x: 100, y: 100, w: 300, h: 44, disabled: false },
      { id: null, x: 0, y: 0, w: 50, h: 50, disabled: true },
    ] });
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
    data.regions[0].x = -999;
    expect(debug.ui().regions[0].x).toBe(100);
    game.onShellOverlayChange(true);
    expect(debug.ui().regions).toEqual([]);
    game.destroy();
    expect(debug.ui()).toBeUndefined();
  });
});
