import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { GameHost, GameMenuAction, GameViewport } from '@carrick/game-sdk/game';
import { parseGameMeta } from '@carrick/game-sdk/catalog';
import { GachaGame } from '../src/gacha';
import type { GachaSfx } from '../src/gachaAudio';
import { GachaProgressHud, gachaProgress } from '../src/gachaProgress';
import { GACHA_TIERS } from '../src/gachaData';
import { GACHA_STATS_STORAGE_KEY, defaultGachaStats } from '../src/gachaStorage';
import metadata from '../game.json';

// Only browser primitives are faked. The real game, BaseGame fit/lifecycle,
// native navigation HUD, input, opening mode, RNG, and persistence all run.
function context() {
  const gradient = { addColorStop: vi.fn() };
  return new Proxy<Record<string, unknown>>({
    globalAlpha: 1,
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    measureText: (text: string) => ({ width: text.length * 7 }),
  }, {
    get(target, key: string) { return target[key] ??= vi.fn(); },
  }) as unknown as CanvasRenderingContext2D;
}

class Element {
  className = '';
  id = '';
  type = '';
  textContent = '';
  disabled = false;
  width = 0;
  height = 0;
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  attributes = new Map<string, string>();
  listeners = new Map<string, Array<(event: Event) => void>>();
  children: Element[] = [];
  parent: Element | null = null;
  onclick: (() => void) | null = null;
  readonly ctx = context();
  constructor(readonly tagName: string) {}
  getContext() { return this.ctx; }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  append(child: Element) { child.remove(); child.parent = this; this.children.push(child); }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
    this.parent = null;
  }
  closest(selector: string): Element | null {
    if (selector === '#gameApp' && this.id === 'gameApp') return this;
    return this.parent?.closest(selector) ?? null;
  }
  addEventListener(type: string, callback: (event: Event) => void) {
    this.listeners.set(type, [...this.listeners.get(type) ?? [], callback]);
  }
  removeEventListener(type: string, callback: (event: Event) => void) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter(listener => listener !== callback));
  }
  click() { if (!this.disabled) this.onclick?.(); }
  // Pointer coordinates are mapped by the REAL SDK, not a game-owned mapper.
  getBoundingClientRect() {
    return { left: parseFloat(this.style.left) || 0, top: parseFloat(this.style.top) || 0, width: parseFloat(this.style.width), height: parseFloat(this.style.height) };
  }
}

class Key extends Event {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly repeat: boolean;
  constructor(type: string, options: KeyboardEventInit) {
    super(type, { bubbles: true });
    this.key = options.key ?? '';
    this.shiftKey = options.shiftKey ?? false;
    this.repeat = options.repeat ?? false;
  }
}
class Mouse extends Event {
  readonly clientX: number;
  readonly clientY: number;
  constructor(type: string, options: MouseEventInit) {
    super(type, { bubbles: true });
    this.clientX = options.clientX ?? 0;
    this.clientY = options.clientY ?? 0;
  }
}
class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const viewport = (width: number, height: number, dpr = 1): GameViewport => ({ width, height, dpr, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } });
let clock = 1000;
const games: GachaGame[] = [];
beforeEach(() => {
  clock = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  vi.stubGlobal('window', { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('document', { documentElement: new Element('html'), createElement: (tag: string) => new Element(tag) });
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('KeyboardEvent', Key);
  vi.stubGlobal('MouseEvent', Mouse);
  vi.stubGlobal('localStorage', new MemoryStorage());
  vi.stubGlobal('Image', class { src = ''; complete = false; naturalWidth = 0; });
  vi.stubGlobal('Path2D', class {});
  // Progress metrics already have dedicated tests; no fake HTML parser is needed.
  vi.spyOn(GachaProgressHud.prototype, 'update').mockImplementation(() => undefined);
});
afterEach(() => {
  for (const game of games.splice(0)) game.destroy();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function fixture(options: { actions?: boolean; root?: boolean; zh?: boolean } = {}) {
  const root = new Element('main');
  root.id = 'gameApp';
  const canvas = new Element('canvas');
  if (options.root !== false) root.append(canvas);
  let zh = options.zh ?? false;
  let actions: readonly GameMenuAction[] = [];
  const publish = vi.fn((next: readonly GameMenuAction[]) => { actions = next; });
  const host: GameHost = {
    canvas: canvas as unknown as HTMLCanvasElement, logicalWidth: 640, logicalHeight: 480,
    isDarkTheme: () => true, isZhLang: () => zh, isPixelMode: () => false,
    getRecord: () => null, reportScore: vi.fn(), requestShellRender: vi.fn(),
    assetUrl: vi.fn(path => `/games/gacha/1.0.0/${'a'.repeat(40)}/${path}`),
    presentation: options.actions === false ? {} : { setActions: publish },
  };
  const game = new GachaGame(host);
  games.push(game);
  const navigation = () => root.children.filter(child => child.className === 'gacha-navigation');
  const buttons = () => navigation().flatMap(nav => nav.children);
  return {
    game, canvas, host, publish, navigation, buttons,
    button: (id: string) => buttons().find(button => button.dataset.gachaAction === id)!,
    action: (id: string) => actions.find(action => action.id === id)!,
    actions: () => actions,
    locale: (next: boolean) => { zh = next; game.renderFrame(); },
  };
}
const key = (game: GachaGame, key: string, shiftKey = false) => game.handleInput(new Key('keydown', { key, shiftKey }) as KeyboardEvent);
const internals = (game: GachaGame) => game as unknown as {
  unlockT: number; roll: unknown; animMode: unknown; isNewItem: boolean;
  galleryTier: string; sfx: GachaSfx; loop(now: number): void;
};
function finish(game: GachaGame, canvas: Element) {
  for (let step = 0; step < 160 && canvas.dataset.gachaScreen !== 'result'; step++) game.update(.05);
  expect(canvas.dataset.gachaScreen).toBe('result');
  game.renderFrame();
}
function cssBox(button: Element) {
  return { x: parseFloat(button.style.left), y: parseFloat(button.style.top), w: parseFloat(button.style.width), h: parseFloat(button.style.height) };
}
function expectContained(f: ReturnType<typeof fixture>, v: GameViewport) {
  const nav = f.navigation()[0];
  const box = cssBox(nav);
  for (const button of f.buttons()) {
    const b = cssBox(button);
    expect(b.w).toBeGreaterThanOrEqual(44);
    expect(b.h).toBeGreaterThanOrEqual(44);
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.x + b.w).toBeLessThanOrEqual(box.w);
    expect(b.y + b.h).toBeLessThanOrEqual(box.h);
    expect(box.x + b.x).toBeGreaterThanOrEqual(v.safeArea.left);
    expect(box.y + b.y).toBeGreaterThanOrEqual(v.safeArea.top + (v.width - v.safeArea.left - v.safeArea.right < 360 ? 112 : 80));
    expect(box.x + b.x + b.w).toBeLessThanOrEqual(v.width - v.safeArea.right);
    expect(box.y + b.y + b.h).toBeLessThanOrEqual(v.height - v.safeArea.bottom);
  }
  if (f.buttons().length === 2) {
    const [a, b] = f.buttons().map(cssBox);
    expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
  }
}

if (!process.env.GAME_ID || process.env.GAME_ID === 'gacha') describe('Gacha approved controls', () => {
  it.each([
    viewport(320, 568), viewport(390, 844, 3), viewport(844, 390, 2),
    viewport(667, 240, 2), viewport(390, 240), viewport(320, 240),
    { ...viewport(390, 844, 2), safeArea: { top: 47, right: 0, bottom: 34, left: 20 } },
  ])('keeps exactly one labeled Collection at least 44 actual CSS px at $width × $height', v => {
    const f = fixture(); f.game.init(); f.game.setViewport(v);
    const button = f.button('collection');
    expect(f.buttons().map(button => button.dataset.gachaAction)).toEqual(['collection']);
    expect(button.type).toBe('button');
    expect(button.textContent).toBe('Collection');
    expect(button.getAttribute('aria-label')).toBe('Collection');
    expect(button.dataset.testid).toBe('gacha-collection');
    expect(cssBox(button)).toMatchObject({ w: 104, h: 44 });
    expectContained(f, v);
    expect(f.navigation()[0].style.transform).toBeUndefined();
    expect(button.style.transform).toBeUndefined();
    if (v.height === 240) {
      // This is the regression case: 44 LOGICAL pixels would be less than 44 CSS.
      expect(Number(f.canvas.dataset.logicalWidth)).toBe(300);
      expect(parseFloat(f.canvas.style.width) / 300).toBeLessThan(1);
    }
    key(f.game, ' ');
    expect(f.buttons().filter(button => button.dataset.gachaAction === 'collection')).toHaveLength(1);
    expectContained(f, v);
    f.game.update(1.1); f.game.renderFrame();
    expect(f.canvas.dataset.gachaScreen).toBe('opening');
    expectContained(f, v);
    finish(f.game, f.canvas);
    expect(f.buttons().map(button => button.dataset.gachaAction)).toEqual(['collection']);
    expectContained(f, v);
  });

  it('retains the instance aspect before BaseGame fits and never reinitializes on resize', () => {
    const f = fixture(); f.game.prepare();
    const prepared = f.canvas.dataset.gamePrepareCount;
    key(f.game, ' ');
    const stats = JSON.stringify(f.game.stats), roll = internals(f.game).roll;
    for (const [v, aspect] of [[viewport(320, 568), .8], [viewport(667, 240), 4 / 3], [viewport(390, 844), .8]] as const) {
      f.game.setViewport(v);
      const width = parseFloat(f.canvas.style.width), height = parseFloat(f.canvas.style.height);
      expect(width / height).toBeCloseTo(aspect, 2);
      expect(width).toBeLessThanOrEqual(v.width);
      expect(height).toBeLessThanOrEqual(v.height - (v.width < 360 ? 112 : 80) + .01);
      expect(JSON.stringify(f.game.stats)).toBe(stats);
      expect(internals(f.game).roll).toBe(roll);
      expect(f.canvas.dataset.gachaScreen).toBe('unlock');
      expect(f.canvas.dataset.gamePrepareCount).toBe(prepared);
    }
  });

  it('publishes bilingual stable actions in init/start and republishes checked Sound while paused', () => {
    const f = fixture({ zh: true });
    expect(f.actions()).toEqual([]);
    f.game.init();
    expect(f.publish).toHaveBeenCalledOnce();
    expect(f.actions().map(({ id, label, labelZh }) => ({ id, label, labelZh }))).toEqual([
      { id: 'gacha-stats', label: 'Stats', labelZh: '抽取统计' },
      { id: 'gacha-sound', label: 'Sound', labelZh: '音效' },
    ]);
    expect(f.action('gacha-sound').checked).toBe(true);
    f.game.start();
    expect(f.publish.mock.calls.length).toBeGreaterThanOrEqual(3); // prepare/init + onStart
    const count = f.publish.mock.calls.length;
    f.game.setPresentationPaused(true);
    const priorAction = f.action('gacha-sound'); priorAction.run();
    expect(f.publish).toHaveBeenCalledTimes(count + 1);
    expect(f.action('gacha-sound')).not.toBe(priorAction);
    expect(f.action('gacha-sound').checked).toBe(false);
    expect(internals(f.game).sfx.enabled).toBe(false);
    expect(f.canvas.dataset.gamePresentation).toBe('paused');
    f.action('gacha-sound').run();
    expect(f.action('gacha-sound').checked).toBe(true);
    expect(f.canvas.dataset.gamePresentation).toBe('paused');
    f.game.setPresentationPaused(false); key(f.game, 'm');
    expect(f.action('gacha-sound').checked).toBe(false);
    expect(f.buttons().some(button => ['stats', 'sound'].includes(button.dataset.gachaAction))).toBe(false);
  });

  it.each([false, true])('routes Collection and menu Stats through explicit localized Back to Gacha (zh=%s)', zh => {
    const f = fixture({ zh }); f.game.init(); f.game.setViewport(viewport(390, 844));
    for (const route of ['collection', 'stats']) {
      if (route === 'collection') f.button('collection').click();
      else f.action('gacha-stats').run();
      expect(f.canvas.dataset.gachaScreen).toBe(route === 'collection' ? 'gallery' : 'stats');
      expect(f.buttons()).toHaveLength(1);
      expect(f.button('back').textContent).toBe(zh ? '返回抽卡' : 'Back to Gacha');
      expect(f.button('back').getAttribute('aria-label')).toBe(f.button('back').textContent);
      expect(f.button('back').dataset.testid).toBe('gacha-back');
      f.button('back').click();
      expect(f.canvas.dataset.gachaScreen).toBe('menu');
      expect(f.button('collection').textContent).toBe(zh ? '收藏册' : 'Collection');
      expect(f.game.stats.totalPulls).toBe(0);
    }
  });

  it('guards active reveals from stale Stats callbacks, then enables Stats without changing the roll', () => {
    const f = fixture(); f.game.init();
    const statsAction = f.action('gacha-stats');
    const random = vi.fn().mockReturnValueOnce(.9999).mockReturnValue(0);
    f.game.random = random; key(f.game, ' ');
    const roll = internals(f.game).roll, stats = JSON.stringify(f.game.stats);
    expect(f.action('gacha-stats').disabled).toBe(true);
    statsAction.run();
    expect(f.canvas.dataset.gachaScreen).toBe('unlock');
    f.game.update(1.1); f.game.renderFrame();
    const animation = internals(f.game).animMode;
    f.action('gacha-stats').run(); key(f.game, 's');
    expect(internals(f.game).animMode).toBe(animation);
    expect(f.canvas.dataset.gachaScreen).toBe('opening');
    finish(f.game, f.canvas);
    expect(f.action('gacha-stats').disabled).toBe(false);
    f.action('gacha-stats').run();
    expect(f.canvas.dataset.gachaScreen).toBe('stats');
    expect(internals(f.game).roll).toBe(roll);
    expect(JSON.stringify(f.game.stats)).toBe(stats);
    expect(random).toHaveBeenCalledTimes(2);
  });

  it.each([[0, 'milspec'], [.8, 'restricted'], [.96, 'classified'], [.992, 'covert'], [.9999, 'rarespecial']] as const)(
    'uses the original tier interval %s → %s through the primary Draw input', (roll, tier) => {
      const f = fixture(); f.game.init();
      const random = vi.fn().mockReturnValueOnce(roll).mockReturnValue(0);
      f.game.random = random; key(f.game, ' ');
      expect(f.canvas.dataset.gachaTier).toBe(tier);
      expect(f.game.stats.tierCounts[tier]).toBe(1);
      expect(f.game.stats.totalPulls).toBe(1);
      expect(random).toHaveBeenCalledTimes(2);
    },
  );

  it('mutes the live reel on menu pause or Sound off, without restarting audio behind the overlay', () => {
    const f = fixture(); f.game.start(); key(f.game, ' '); f.game.update(1.1); f.game.renderFrame();
    const stop = vi.spyOn(internals(f.game).sfx, 'spinStop');
    const start = vi.spyOn(internals(f.game).sfx, 'spinStart');
    f.game.setPresentationPaused(true);
    expect(stop).toHaveBeenCalledOnce();
    f.action('gacha-sound').run();
    expect(f.action('gacha-sound').checked).toBe(false);
    expect(stop).toHaveBeenCalledTimes(2);
    f.action('gacha-sound').run();
    expect(start).not.toHaveBeenCalled();
    f.game.setPresentationPaused(false);
    expect(start).toHaveBeenCalledOnce();
    f.action('gacha-sound').run();
    expect(stop).toHaveBeenCalledTimes(3);
    f.button('collection').click();
    expect(stop).toHaveBeenCalledTimes(4);
    expect(f.game.stats.totalPulls).toBe(1);
  });

  it('retains Draw, official odds, duplicate metrics and persisted progression through routes and restarts', () => {
    const f = fixture(); f.game.start(); f.game.setViewport(viewport(320, 568));
    expect(GACHA_TIERS.map(tier => tier.odds)).toEqual([.7992, .1598, .032, .0064, .0026]);
    const random = vi.fn().mockReturnValueOnce(.9999).mockReturnValue(0);
    f.game.random = random;
    const rect = f.canvas.getBoundingClientRect();
    f.game.handleInput(new Mouse('mousedown', { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }) as MouseEvent);
    expect(f.game.stats.tierCounts.rarespecial).toBe(1);
    expect(internals(f.game).isNewItem).toBe(true);
    expect(f.game.stats.totalPulls).toBe(1);
    expect(random).toHaveBeenCalledTimes(2);
    // Collection deliberately bails a committed draw, never rolls another one.
    f.button('collection').click();
    expect(f.canvas.dataset.gachaScreen).toBe('gallery');
    f.button('back').click();
    f.action('gacha-stats').run(); f.button('back').click();
    expect(f.game.stats.totalPulls).toBe(1);
    f.game.random = vi.fn().mockReturnValueOnce(.9999).mockReturnValue(0);
    key(f.game, ' '); finish(f.game, f.canvas);
    expect(internals(f.game).isNewItem).toBe(false);
    expect(gachaProgress(f.game.stats)).toEqual({ pulls: 2, collected: 1, total: 16, percent: 6.2 });
    expect(JSON.parse(localStorage.getItem(GACHA_STATS_STORAGE_KEY)!)).toEqual(f.game.stats);
    const progress = JSON.stringify(f.game.stats);
    f.game.restart();
    expect(JSON.stringify(f.game.stats)).toBe(progress);
    expect(f.navigation()).toHaveLength(1);
    expect(f.buttons().map(button => button.dataset.gachaAction)).toEqual(['collection']);
    f.locale(true); expect(f.button('collection').textContent).toBe('收藏册');
    f.game.destroy();
    expect(f.navigation()).toEqual([]);
    expect(f.actions()).toEqual([]);
  });

  it('keeps legacy keyboard Collection, tier browsing, Stats, Sound, return, and explicit reset functional', () => {
    const f = fixture({ actions: false, root: false }); f.game.init();
    expect(f.publish).not.toHaveBeenCalled();
    key(f.game, 'c'); expect(f.canvas.dataset.gachaScreen).toBe('gallery');
    const tier = internals(f.game).galleryTier;
    key(f.game, 'ArrowRight'); expect(internals(f.game).galleryTier).not.toBe(tier);
    key(f.game, 'r'); expect(f.canvas.dataset.gachaScreen).toBe('menu');
    key(f.game, 's'); expect(f.canvas.dataset.gachaScreen).toBe('stats');
    key(f.game, 'm'); expect(internals(f.game).sfx.enabled).toBe(false);
    key(f.game, 'Escape'); key(f.game, ' ');
    key(f.game, 'R', true); expect(f.game.stats.totalPulls).toBe(1); // no reset during reveal
    key(f.game, 'r'); expect(f.game.stats.totalPulls).toBe(1);
    key(f.game, 'R', true);
    expect(f.game.stats).toEqual(defaultGachaStats());
    expect(localStorage.getItem(GACHA_STATS_STORAGE_KEY)).toBeNull();
  });

  it('isolates native navigation keys/pointers so Space does not Draw while activating Collection', () => {
    const f = fixture(); f.game.start();
    const button = f.button('collection');
    const space = new Key('keydown', { key: ' ' });
    Object.defineProperty(space, 'target', { value: button });
    f.game.handleInput(space as KeyboardEvent);
    expect(f.game.stats.totalPulls).toBe(0);
    for (const type of ['keydown', 'keyup', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click']) {
      const event = type.startsWith('key') ? new Key(type, { key: ' ' }) : new Event(type, { bubbles: true });
      const stop = vi.spyOn(event, 'stopPropagation');
      for (const listener of f.navigation()[0].listeners.get(type) ?? []) listener(event);
      expect(stop).toHaveBeenCalledOnce();
    }
    for (const key of ['Escape', 'ArrowRight', '?']) {
      const event = new Key('keydown', { key });
      const stop = vi.spyOn(event, 'stopPropagation');
      for (const listener of f.navigation()[0].listeners.get('keydown') ?? []) listener(event);
      expect(stop).not.toHaveBeenCalled();
    }
    button.click();
    expect(f.canvas.dataset.gachaScreen).toBe('gallery');
    expect(f.game.stats.totalPulls).toBe(0);
    const escape = new Key('keydown', { key: 'Escape' });
    Object.defineProperty(escape, 'target', { value: f.button('back') });
    f.game.handleInput(escape as KeyboardEvent);
    expect(f.canvas.dataset.gachaScreen).toBe('menu');
  });

  it('pauses real BaseGame simulation and direct input without restarting or resuming a stopped game', () => {
    const f = fixture(); f.game.start(); key(f.game, ' ');
    const prepared = f.canvas.dataset.gamePrepareCount;
    f.game.setPresentationPaused(true);
    const unlock = internals(f.game).unlockT;
    clock += 10_000; internals(f.game).loop(clock);
    expect(internals(f.game).unlockT).toBe(unlock);
    expect(f.buttons().every(button => button.disabled)).toBe(true);
    f.button('collection').click();
    for (const k of [' ', 'c', 's', 'r', 'Escape']) key(f.game, k);
    expect(f.canvas.dataset.gachaScreen).toBe('unlock');
    f.action('gacha-sound').run();
    expect(f.canvas.dataset.gamePresentation).toBe('paused');
    expect(f.game.stats.totalPulls).toBe(1);
    f.game.setPresentationPaused(false);
    clock += 16; internals(f.game).loop(clock);
    expect(internals(f.game).unlockT).toBeCloseTo(unlock + .016);
    expect(f.canvas.dataset.gamePrepareCount).toBe(prepared);
    expect(f.buttons().every(button => !button.disabled)).toBe(true);
    f.game.stop();
    const stopped = internals(f.game).unlockT;
    f.game.setPresentationPaused(true); f.game.setPresentationPaused(false);
    clock += 1000; internals(f.game).loop(clock);
    expect(internals(f.game).unlockT).toBe(stopped);
    expect(f.canvas.dataset.gamePrepareCount).toBe(prepared);
  });

  it('uses supported grouped metadata, audience-specific reset help and native unscaled focusable CSS', () => {
    const meta = parseGameMeta(metadata);
    expect(meta.controls.keyboard?.map(row => row.keys)).toEqual([['Space']]);
    expect(meta.controls.sections?.map(section => section.id)).toEqual(['collection', 'stats-sound', 'return-reset']);
    const keys = meta.controls.sections!.flatMap(section => section.keyboard ?? []).flatMap(row => row.keys);
    expect(keys).toEqual(expect.arrayContaining(['C', 'S', 'M', 'Escape', 'R', 'Shift', '←', '→', '↑', '↓']));
    for (const section of meta.controls.sections!) {
      expect(section.title).toBeTruthy(); expect(section.titleZh).toBeTruthy();
      for (const note of section.notes ?? []) {
        expect(['all', 'keyboard', 'touch']).toContain(note.audience);
        if (note.audience !== 'keyboard') expect(`${note.text} ${note.textZh}`).not.toMatch(/Shift\+R|Escape|F11|\b[EQPSM]\b|mouse/i);
      }
    }
    const css = readFileSync(new URL('../src/gachaProgress.css', import.meta.url), 'utf8');
    const native = css.slice(css.indexOf('.gacha-navigation'));
    expect(native).toContain('min-width: 44px'); expect(native).toContain('min-height: 44px');
    expect(native).toContain('box-sizing: border-box'); expect(native).toContain(':focus-visible');
    expect(native).not.toMatch(/transform\s*:|zoom\s*:/);
    const source = readFileSync(new URL('../src/gacha.ts', import.meta.url), 'utf8');
    expect(source).not.toContain('getBoundingClientRect(');
    expect(source).not.toMatch(/querySelector\(|navButtonAt\(/);
    expect(source).toContain('this.canvasPoint(clientX, clientY)');
    expect(source).toContain('assetUrl: this.host.assetUrl');
  });
});
