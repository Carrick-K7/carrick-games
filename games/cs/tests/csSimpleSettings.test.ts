import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CsGame } from '../src/cs';
import type { CsHud, HudRegion } from '../src/csHud';

// Real engine, HUD and adapter; only browser boundaries are emulated. Never
// initialize WebGL, load maps, or substitute fake pause/settings implementations.
class MouseInput extends Event {
  button = 0;
  constructor(type: string, readonly clientX: number, readonly clientY: number) { super(type); }
}
class KeyInput extends Event {
  key = 'Escape'; code = 'Escape';
  constructor(readonly repeat = false) { super('keydown', { cancelable: true }); }
}
class TouchInput extends Event {
  constructor(type: string, readonly changedTouches: { identifier: number; clientX: number; clientY: number }[]) {
    super(type, { cancelable: true });
  }
}
let game: CsGame, e: any, hud: CsHud, ctx: CanvasRenderingContext2D;
let canvas: HTMLCanvasElement, capture: ReturnType<typeof vi.fn>, labels: string[];
const BASIC = ['settings-close', 'settings-sensitivity', 'settings-sound-on', 'settings-sound-off',
  'settings-quality-high', 'settings-quality-low', 'settings-more', 'settings-done'];
const ADVANCED = ['settings-scope', 'settings-knife-classic', 'settings-knife-karambit', 'settings-knife-butterfly',
  'settings-pistol-default', 'settings-pistol-deagle', 'settings-hit-off', 'settings-hit-visual', 'settings-hit-full', 'settings-reset'];
const MATCH = ['settings-scoreboard', 'settings-radio', 'settings-restart'];

beforeEach(() => {
  labels = []; capture = vi.fn();
  ctx = new Proxy({ measureText: (text: string) => ({ width: text.length * 6 }),
    fillText: (text: string) => labels.push(text),
  }, { get: (target, key) => (target as any)[key] ?? (() => undefined) }) as unknown as CanvasRenderingContext2D;
  canvas = Object.assign(new EventTarget(), { width: 0, height: 0, dataset: {}, style: {},
    getContext: () => ctx, focus: vi.fn(), requestPointerLock: capture,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
  }) as unknown as HTMLCanvasElement;
  vi.stubGlobal('window', Object.assign(new EventTarget(), { devicePixelRatio: 1 }));
  vi.stubGlobal('document', Object.assign(new EventTarget(), {
    hidden: false, pointerLockElement: null, hasFocus: () => true, createElement: () => new EventTarget(), exitPointerLock: vi.fn(),
  }));
  vi.stubGlobal('MouseEvent', MouseInput); vi.stubGlobal('KeyboardEvent', KeyInput); vi.stubGlobal('TouchEvent', TouchInput);
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  game = new CsGame({ canvas, logicalWidth: 1280, logicalHeight: 720,
    isDarkTheme: () => true, isZhLang: () => false, isPixelMode: () => false,
    getRecord: () => null, reportScore: vi.fn(), requestShellRender: vi.fn() });
  e = (game as any).engine; hud = (game as any).hudView;
  vi.spyOn(e.audio, 'init').mockImplementation(() => {});
  vi.spyOn(e.audio, 'mechanic').mockReturnValue(false);
  vi.spyOn(e, 'drawRadarContent').mockImplementation(() => {});
  e.player = e.makeActor('ct', 'Player', true); e.all = [e.player];
  e.ready = true; e.matchActive = true; e.phase = 'active'; e.computeHud();
});
afterEach(() => { game?.destroy(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const draw = () => { labels.length = 0; game.draw(ctx); };
const ids = () => hud.regions.flatMap(r => r.id ? [r.id] : []);
function key(repeat = false) { game.handleInput(new KeyInput(repeat) as unknown as KeyboardEvent); }
function mouse(type: string, r: HudRegion) {
  game.handleInput(new MouseInput(type, r.x + r.w / 2, r.y + r.h / 2) as unknown as MouseEvent);
}
function touch(type: string, r: HudRegion, identifier = 1) {
  game.handleInput(new TouchInput(type, [{ identifier, clientX: r.x + r.w / 2, clientY: r.y + r.h / 2 }]) as unknown as TouchEvent);
}
function reveal(id: string) {
  hud.onWheel(-10000);
  for (let n = 0; n < 400; n++) {
    draw(); const r = hud.regions.find(r => r.id === id && r.w >= 44 && r.h >= 44);
    if (r) return r;
    hud.onWheel(4);
  }
  throw new Error(`No full target ${id}`);
}
function activate(id: string) { const r = reveal(id); mouse('mousedown', r); mouse('mouseup', r); draw(); }
function collect() {
  const seen = new Set<string>(); hud.onWheel(-10000);
  for (let n = 0; n < 400; n++) {
    draw(); ids().forEach(id => seen.add(id));
    const scroll = hud.regions.find(r => r.scroll)?.scroll;
    if (!scroll || scroll.offset >= scroll.max) break;
    hud.onWheel(4);
  }
  return [...seen].sort();
}

describe('CS simple settings ownership', () => {
  it('Escape opens only compact basic settings with no intermediate pause surface or hidden advanced targets', () => {
    const frame = vi.spyOn(hud as any, 'frame');
    key(); draw();
    expect(frame.mock.calls[0].slice(2, 5)).toEqual([480, 440, 'Settings']);
    expect(e.phase).toBe('paused'); expect(e.settingsOpen).toBe(false);
    expect(ids().sort()).toEqual([...BASIC, 'settings-menu'].sort());
    expect(labels).toContain('Continue'); expect(labels).not.toContain('Reset settings');
    expect(ids().some(id => id.startsWith('pause-'))).toBe(false);
    expect(collect()).toEqual([...BASIC, 'settings-menu'].sort());
    for (const id of [...ADVANCED, ...MATCH]) expect(ids()).not.toContain(id);
    expect(capture).not.toHaveBeenCalled();
  });

  it('native Escape repeats and pointer-release ordering never double-toggle or request capture', () => {
    const pause = vi.spyOn(e, 'pauseGame'), resume = vi.spyOn(e, 'resumeGame');
    e.onPointerLockChange(true);
    key(); e.onPointerLockChange(false); draw();
    key(true); expect(e.phase).toBe('paused');
    expect(pause).toHaveBeenCalledTimes(1); expect(resume).not.toHaveBeenCalled();
    expect(ids()).toContain('settings-done');
    key(); expect(e.phase).toBe('active');
    expect(resume).toHaveBeenCalledExactlyOnceWith(false);
    expect(capture).not.toHaveBeenCalled();
  });

  it('browser-owned pointer release exposes the same settings without a settings engine hook', () => {
    e.onPointerLockChange(true); e.onPointerLockChange(false); draw();
    expect(e.phase).toBe('paused'); expect(e.settingsOpen).toBe(false);
    expect(ids().sort()).toEqual([...BASIC, 'settings-menu'].sort());
    expect(capture).not.toHaveBeenCalled();
  });

  it('touch Pause opens the same basic UI and Continue resumes the original match', () => {
    e.touchMode = true; draw();
    const pause = reveal('touch-pause'); touch('touchstart', pause); touch('touchend', pause); draw();
    expect(e.phase).toBe('paused'); expect(ids().sort()).toEqual([...BASIC, 'settings-menu'].sort());
    const player = e.player;
    const done = reveal('settings-done'); touch('touchstart', done); touch('touchend', done);
    expect(e.phase).toBe('active'); expect(e.player).toBe(player);
  });

  it.each(['settings-close', 'settings-done', 'Escape'])('settings from arena menu closes via %s without resuming or capturing', close => {
    e.phase = 'menu'; e.matchActive = false; e.openSettings(); draw();
    expect(collect()).toEqual([...BASIC].sort());
    activate('settings-more');
    expect(collect()).toEqual([...BASIC, ...ADVANCED].sort());
    expect(labels).not.toContain('Continue');
    const resume = vi.spyOn(e, 'resumeGame');
    if (close === 'Escape') key(); else activate(close);
    expect(e.phase).toBe('menu'); expect(e.settingsOpen).toBe(false);
    expect(resume).not.toHaveBeenCalled(); expect(capture).not.toHaveBeenCalled();
  });

  it.each(['active', 'freeze', 'round-end', 'spectate'])('explicit settings from %s restores its origin exactly once through either close action', phase => {
    for (const action of ['settings-close', 'settings-done']) {
      e.phase = phase; e.openSettings(); draw();
      const resume = vi.spyOn(e, 'resumeGame');
      activate(action);
      expect(e.phase).toBe(phase); expect(e.settingsOpen).toBe(false);
      expect(resume).toHaveBeenCalledTimes(1);
      resume.mockRestore();
    }
  });

  it('collapse retires hidden advanced hitboxes and a captured touch even after identical re-expansion', () => {
    e.openSettings(); draw(); activate('settings-more');
    const knife = reveal('settings-knife-butterfly'), setKnife = vi.spyOn(e, 'setKnifeModel');
    touch('touchstart', knife);
    const revision = hud.inputRevision;
    activate('settings-more');
    expect(hud.inputRevision).toBeGreaterThan(revision);
    expect(collect()).toEqual([...BASIC, 'settings-menu'].sort());
    expect(ids().some(id => ADVANCED.includes(id))).toBe(false);
    activate('settings-more'); reveal('settings-knife-butterfly');
    touch('touchend', knife);
    expect(setKnife).not.toHaveBeenCalled();
    const current = reveal('settings-knife-butterfly'); touch('touchstart', current); touch('touchend', current);
    expect(setKnife).toHaveBeenCalledExactlyOnceWith('butterfly');
  });

  it.each(['scoreboard', 'radio'])('advanced %s child clears explicit settings while preserving manual pause and returns to simple settings', child => {
    e.openSettings(); draw();
    expect(e.settingsOrigin).toBe('active');
    activate('settings-more'); activate(`settings-${child}`);
    expect(e.settingsOpen).toBe(false); expect(e.phase).toBe('paused');
    expect(ids()).toContain(`${child}-close`);
    expect(ids().some(id => id.startsWith('settings-'))).toBe(false);
    key(); draw();
    expect(e.phase).toBe('paused'); expect(e.radioMenu).toBeNull(); expect(e.hud.scoreboardOpen).toBe(false);
    expect(ids().sort()).toEqual([...BASIC, 'settings-menu'].sort());
    expect(capture).not.toHaveBeenCalled();
  });

  it('advanced restart invokes the real existing restart entry and menu footer retains toMenu', () => {
    key(); draw();
    const restart = vi.spyOn(e, 'startMatch').mockImplementation(() => {});
    const menu = vi.spyOn(e, 'toMenu').mockImplementation(() => {});
    expect(collect()).not.toContain('settings-restart');
    activate('settings-more'); activate('settings-restart');
    expect(restart).toHaveBeenCalledOnce(); expect(menu).not.toHaveBeenCalled();
    activate('settings-menu'); expect(menu).toHaveBeenCalledOnce();
  });
});
