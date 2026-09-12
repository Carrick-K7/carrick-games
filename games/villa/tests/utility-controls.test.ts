import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameHost, GameMenuAction, GameViewport } from '@carrick/game-sdk/game';
import { parseGameMeta } from '@carrick/game-sdk/catalog';
import { VillaGame } from '../src/villa.js';
import { VILLA_ENTRANCE } from '../src/villaWorld.js';
import metadata from '../game.json';

// A small native-element double lets the actual Villa constructor, terminal,
// lifecycle, drawing and input paths run in Node. No renderer/WebGL is created.
class ElementDouble {
  children: ElementDouble[] = [];
  parentElement: ElementDouble | null = null;
  dataset: Record<string, string> = {};
  style = { setProperty: vi.fn() } as unknown as CSSStyleDeclaration;
  attributes = new Map<string, string>();
  listeners = new Map<string, ((event: any) => void)[]>();
  hidden = false;
  textContent = '';
  className = '';
  width = 0;
  height = 0;
  isConnected = true;
  constructor(readonly tagName: string) {}
  get ownerDocument() { return document; }
  get parentNode() { return this.parentElement; }
  get clientWidth() { return parseFloat(this.style.width) || this.width; }
  getContext(kind: string) { if (kind !== '2d') throw new Error('GPU forbidden in this suite'); return context; }
  getBoundingClientRect() { return { left: 31, top: 19, width: this.clientWidth, height: parseFloat(this.style.height) || this.height }; }
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
  getAttribute(key: string) { return this.attributes.get(key) ?? null; }
  removeAttribute(key: string) { this.attributes.delete(key); }
  append(...children: ElementDouble[]) { for (const child of children) { child.parentElement = this; this.children.push(child); } }
  appendChild(child: ElementDouble) { this.append(child); return child; }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); }
  closest(selector: string) { return selector === '#gameApp' ? document.body : null; }
  addEventListener(type: string, listener: (event: any) => void) { this.listeners.set(type, [...this.listeners.get(type) ?? [], listener]); }
  removeEventListener(type: string, listener: (event: any) => void) { this.listeners.set(type, (this.listeners.get(type) ?? []).filter(item => item !== listener)); }
  focus() { Object.assign(document, { activeElement: this }); }
  click() { for (const listener of this.listeners.get('click') ?? []) listener({ target: this, detail: 0, preventDefault() {}, stopPropagation() {} }); }
  requestPointerLock = vi.fn();
}
class KeyboardDouble {
  type = 'keydown'; target = null; repeat = false; ctrlKey = false; metaKey = false; altKey = false;
  preventDefault = vi.fn();
  constructor(readonly key: string) {}
}
class MouseDouble {
  type = 'mousedown'; button = 0;
  constructor(readonly clientX: number, readonly clientY: number) {}
}
class TouchDouble {
  type = 'touchstart'; preventDefault = vi.fn();
  constructor(readonly changedTouches: { identifier: number; clientX: number; clientY: number }[]) {}
}
let context: any;
beforeEach(() => {
  const calls = new Map<PropertyKey, unknown>();
  context = new Proxy({}, {
    get(_target, key) {
      if (!calls.has(key)) calls.set(key, key === 'measureText' ? vi.fn((text: string) => ({ width: text.length * 7 }))
        : key === 'createRadialGradient' ? vi.fn(() => ({ addColorStop: vi.fn() })) : vi.fn());
      return calls.get(key);
    },
    set(_target, key, value) { calls.set(key, value); return true; },
  });
  const view = { devicePixelRatio: 3, matchMedia: () => ({ matches: true }), localStorage: { getItem: () => null, setItem: vi.fn() },
    addEventListener: vi.fn(), removeEventListener: vi.fn(), getComputedStyle: () => ({ zIndex: '0' }) };
  vi.stubGlobal('window', view);
  vi.stubGlobal('document', { hidden: false, pointerLockElement: null, activeElement: null, defaultView: view, body: new ElementDouble('body'),
    createElement: (tag: string) => new ElementDouble(tag), addEventListener: vi.fn(), removeEventListener: vi.fn(),
    // Villa must never derive overlay state from the shell's DOM.
    querySelector: () => { throw new Error('Shell DOM inspection forbidden'); },
  });
  vi.stubGlobal('navigator', { userActivation: { isActive: false } });
  vi.stubGlobal('KeyboardEvent', KeyboardDouble); vi.stubGlobal('MouseEvent', MouseDouble);
  vi.stubGlobal('TouchEvent', TouchDouble); vi.stubGlobal('Element', ElementDouble);
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1)); vi.stubGlobal('cancelAnimationFrame', vi.fn());
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

type Button = { id: string; label: string; x: number; y: number; w: number; h: number };
// Private access is confined to this focused test; the implementation is never copied.
type TestVilla = Omit<VillaGame, 'draw'> & {
  running: boolean; presentationPaused: boolean; time: number; state: any; position: any; motion: any;
  immersive: boolean; mapOpen: boolean; touchMode: boolean; mouseLookEnabled: boolean;
  keys: Set<string>; touchActions: Map<number, string>; joystick: unknown; lookTouch: unknown;
  scene: any; terminal: { element: ElementDouble; visible: boolean }; visited: Set<string>;
  utilityButtons(): Button[]; buttons(): Button[]; activate(id: string): void; onStart(): void;
  draw(ctx: any): void; drawHud(ctx: any): void; clickUi(point: { x: number; y: number }): boolean;
  closeButton(): Button; mapTabs(): Button[]; panelRect(): Button;
};
const zeroSafe = { top: 0, right: 0, bottom: 0, left: 0 };
function fixture(legacy = false) {
  const canvas = new ElementDouble('canvas'), batches: GameMenuAction[][] = [];
  const setActions = vi.fn((actions: readonly GameMenuAction[]) => batches.push([...actions]));
  const host: GameHost = { canvas: canvas as unknown as HTMLCanvasElement, logicalWidth: 1120, logicalHeight: 700,
    isDarkTheme: () => false, isZhLang: () => false, isPixelMode: () => false, getRecord: () => null,
    reportScore: vi.fn(), requestShellRender: vi.fn(), presentation: legacy ? undefined : { setActions, isControlsOpen: () => false } };
  const game = new VillaGame(host) as unknown as TestVilla;
  game.scene = { updateActivities: vi.fn(), render: vi.fn(() => true), renderSecurityFeed: vi.fn(() => null), dispose: vi.fn(), colliders: [] };
  game.init(); game.running = true;
  game.setViewport({ width: 320, height: 568, dpr: 3, safeArea: zeroSafe });
  return { game, canvas, host, setActions, batches, action: (id: string) => batches.at(-1)!.find(action => action.id === id)! };
}
function elements(root: ElementDouble): ElementDouble[] { return [root, ...root.children.flatMap(elements)]; }
function target(root: ElementDouble, key: string, value = '') { return elements(root).find(item => item.dataset[key] === value)!; }
function tap(game: TestVilla, button: Button) { return game.clickUi({ x: button.x + button.w / 2, y: button.y + button.h / 2 }); }

describe('Villa host menu actions', () => {
  it('registers bilingual stable actions before scene initialization work and republishes on start', () => {
    const { game, setActions, batches } = fixture();
    expect(batches[0]).toMatchObject([
      { id: 'villa-home', label: 'Return to entrance', labelZh: '回到门口' },
      { id: 'villa-immersive', label: 'Immersive mode', labelZh: '沉浸模式', checked: false },
    ]);
    expect(setActions.mock.invocationCallOrder[0]).toBeLessThan(game.scene.updateActivities.mock.invocationCallOrder[0]);
    expect(batches).toHaveLength(1);
    game.onStart(); expect(batches).toHaveLength(2);
    expect(elements(game.terminal.element).some(node => node.dataset.villaFallbackAction)).toBe(false);
  });

  it('runs Home without restarting, starting a stopped game, or clearing a manual presentation pause', () => {
    const { game, canvas, action } = fixture();
    const home = game.state.home, tea = game.state.tea, snooker = game.state.snooker;
    game.time = 54; game.state.home.timeOfDay = 'night'; game.state.home.weather = 'rain';
    snooker.score = 23; game.state.seated = 'car'; game.state.driving.speed = 8;
    game.position = { x: 12, y: 4, z: 100 };
    game.setPresentationPaused(true); game.onShellOverlayChange(true);
    const prepareCount = canvas.dataset.gamePrepareCount;
    action('villa-home').run();
    expect(game.position).toEqual(VILLA_ENTRANCE);
    expect(game.state).toMatchObject({ seated: null, driving: { speed: 0 }, pickup: { speed: 0 }, scooter: { speed: 0 } });
    expect(game.running).toBe(true); expect(game.presentationPaused).toBe(true);
    expect(game.time).toBe(54); expect(game.state.home).toBe(home); expect(game.state.tea).toBe(tea);
    expect(game.state.snooker).toBe(snooker); expect(snooker.score).toBe(23);
    expect(game.state.home).toMatchObject({ timeOfDay: 'night', weather: 'rain' });
    game.onShellOverlayChange(false);
    expect(game.presentationPaused).toBe(true); expect(canvas.dataset.gamePresentation).toBe('paused');
    game.stop(); action('villa-home').run();
    expect(game.running).toBe(false); expect(game.presentationPaused).toBe(true);
    expect(canvas.dataset.gamePrepareCount).toBe(prepareCount);
    expect(requestAnimationFrame).not.toHaveBeenCalled(); expect(canvas.requestPointerLock).not.toHaveBeenCalled();
  });

  it('republishes checked state while the host keeps the menu open, without pointer capture', () => {
    const { game, canvas, action, batches } = fixture();
    game.setPresentationPaused(true); game.onShellOverlayChange(true);
    game.keys.add('w'); game.touchActions.set(1, 'brake');
    action('villa-immersive').run();
    expect(game.immersive).toBe(true); expect(action('villa-immersive').checked).toBe(true);
    expect(game.keys.size).toBe(0); expect(game.touchActions.size).toBe(0);
    expect(game.mouseLookEnabled).toBe(false); expect(game.presentationPaused).toBe(true);
    expect(canvas.requestPointerLock).not.toHaveBeenCalled();
    action('villa-immersive').run();
    expect(game.immersive).toBe(false); expect(action('villa-immersive').checked).toBe(false);
    expect(batches).toHaveLength(3);
    game.onShellOverlayChange(false);
    expect(game.presentationPaused).toBe(true); expect(canvas.requestPointerLock).not.toHaveBeenCalled();
  });
});

describe('Villa direct utility routes and native fallback', () => {
  it('draws and publishes exactly the same two utility targets, with no separate map/time/home/immersive buttons', () => {
    const { game, canvas } = fixture();
    expect(game.utilityButtons().map(button => button.id)).toEqual(['map', 'terminal']);
    expect(JSON.parse(canvas.dataset.villaUtilities)).toEqual(game.utilityButtons());
    expect(JSON.parse(canvas.dataset.villaButtons)).toEqual(game.buttons());
    const before = context.roundRect.mock.calls.length;
    game.immersive = true; game.drawHud(context);
    expect(context.roundRect.mock.calls.slice(before).map((call: number[]) => call.slice(0, 4)))
      .toEqual(game.utilityButtons().map(({ x, y, w, h }) => [x, y, w, h]));
  });

  it('opens the map from the location badge, exits immersive, and leaves pause/progression/capture ownership alone', () => {
    const { game, canvas, action } = fixture();
    action('villa-immersive').run();
    game.setPresentationPaused(true);
    const position = { ...game.position }, time = game.time;
    expect(tap(game, game.utilityButtons()[0])).toBe(true);
    expect(game.mapOpen).toBe(true); expect(game.immersive).toBe(false); expect(action('villa-immersive').checked).toBe(false);
    expect(game.position).toEqual(position); expect(game.time).toBe(time); expect(game.presentationPaused).toBe(true);
    expect(tap(game, game.closeButton())).toBe(true);
    expect(game.mapOpen).toBe(false); expect(game.presentationPaused).toBe(true);
    expect(canvas.requestPointerLock).not.toHaveBeenCalled();
  });

  it('keeps terminal Time and Weather routes functional and its close does not release presentation pause', () => {
    const { game, action } = fixture();
    action('villa-immersive').run();
    expect(tap(game, game.utilityButtons()[1])).toBe(true);
    expect(game.terminal.visible).toBe(true); expect(game.immersive).toBe(false); expect(action('villa-immersive').checked).toBe(false);
    const root = game.terminal.element;
    target(root, 'villaTerminalTab', 'weather').click();
    expect(target(root, 'villaTerminalPage', 'weather').hidden).toBe(false);
    target(root, 'villaTime', 'night').click(); target(root, 'villaWeather', 'rain').click();
    expect(game.state.home).toMatchObject({ timeOfDay: 'night', weather: 'rain' });
    expect(target(root, 'villaTime', 'night').getAttribute('aria-pressed')).toBe('true');
    expect(target(root, 'villaWeather', 'rain').getAttribute('aria-pressed')).toBe('true');
    game.setPresentationPaused(true); target(root, 'villaTerminalClose').click();
    expect(game.terminal.visible).toBe(false); expect(game.presentationPaused).toBe(true);
    expect(elements(root).find(node => node.tagName === 'style')?.textContent).toContain('min-width:44px;min-height:44px');
  });

  it('retains Home and immersive touch access only in Terminal Settings for hosts without setActions', () => {
    const { game, canvas } = fixture(true);
    expect(game.utilityButtons().map(button => button.id)).toEqual(['map', 'terminal']);
    tap(game, game.utilityButtons()[1]);
    const root = game.terminal.element;
    target(root, 'villaTerminalTab', 'settings').click();
    const home = target(root, 'villaFallbackAction', 'villa-home');
    expect(home.parentElement?.parentElement).toBe(target(root, 'villaTerminalPage', 'settings'));
    game.setPresentationPaused(true); home.click();
    expect(game.position).toEqual(VILLA_ENTRANCE); expect(game.terminal.visible).toBe(false); expect(game.presentationPaused).toBe(true);
    tap(game, game.utilityButtons()[1]); target(root, 'villaFallbackAction', 'villa-immersive').click();
    expect(game.immersive).toBe(true); expect(game.terminal.visible).toBe(false); expect(game.presentationPaused).toBe(true);
    tap(game, game.utilityButtons()[0]); expect(game.mapOpen).toBe(true); expect(game.immersive).toBe(false);
    expect(canvas.requestPointerLock).not.toHaveBeenCalled();
  });

  it('keeps existing H/I/M/P/T shortcuts and releases held input through the SDK-only overlay flag', () => {
    const { game, action } = fixture();
    const key = (value: string) => game.handleInput(new KeyboardDouble(value) as unknown as KeyboardEvent);
    key('i'); expect(game.immersive).toBe(true); expect(action('villa-immersive').checked).toBe(true);
    key('m'); expect(game.mapOpen).toBe(true); expect(game.immersive).toBe(false);
    key('m'); key('p'); expect(game.terminal.visible).toBe(true);
    key('p'); expect(game.terminal.visible).toBe(false);
    const previous = game.state.home.timeOfDay; key('t'); expect(game.state.home.timeOfDay).not.toBe(previous);
    key('h'); expect(game.position).toEqual(VILLA_ENTRANCE);
    key('w'); expect(game.keys.has('w')).toBe(true);
    game.onShellOverlayChange(true); expect(game.keys.size).toBe(0);
    key('i'); expect(game.immersive).toBe(false);
    game.onShellOverlayChange(false); key('i'); expect(game.immersive).toBe(true);
  });
});

describe('Villa responsive input and contextual targets', () => {
  it('maps client coordinates through the real HiDPI canvas path after resizing, without reinitializing', () => {
    const { game, canvas } = fixture();
    const state = game.state, position = { ...game.position }, time = game.time;
    for (const viewport of [
      { width: 320, height: 568, dpr: 3, safeArea: { top: 20, left: 20, right: 20, bottom: 20 } },
      { width: 390, height: 844, dpr: 3, safeArea: { ...zeroSafe, top: 47, bottom: 34 } },
      { width: 844, height: 390, dpr: 2, safeArea: { ...zeroSafe, left: 47, right: 47, bottom: 21 } },
    ] satisfies GameViewport[]) {
      game.setViewport(viewport);
      expect(JSON.parse(canvas.dataset.villaUtilities)).toEqual(game.utilityButtons());
      const map = game.utilityButtons()[0], terminal = game.utilityButtons()[1];
      game.handleInput(new MouseDouble(31 + map.x + map.w / 2, 19 + map.y + map.h / 2) as unknown as MouseEvent);
      expect(game.mapOpen).toBe(true); tap(game, game.closeButton());
      game.handleInput(new TouchDouble([{ identifier: 8, clientX: 31 + terminal.x + terminal.w / 2, clientY: 19 + terminal.y + terminal.h / 2 }]) as unknown as TouchEvent);
      expect(game.terminal.visible).toBe(true); expect(game.joystick).toBeNull(); expect(game.lookTouch).toBeNull();
      target(game.terminal.element, 'villaTerminalClose').click();
      expect(game.state).toBe(state); expect(game.position).toEqual(position); expect(game.time).toBe(time);
      for (const target of [...game.mapTabs(), game.closeButton()]) { expect(target.w).toBeGreaterThanOrEqual(44); expect(target.h).toBeGreaterThanOrEqual(44); }
    }
  });

  it('preserves direct walking, vehicle, elevator and snooker interaction targets', () => {
    const { game, canvas } = fixture();
    expect(game.buttons().filter(button => ['crouch', 'jump'].includes(button.id))).toMatchObject([
      { id: 'crouch', x: 150, y: 475, w: 44, h: 44 }, { id: 'jump', x: 202, y: 475, w: 44, h: 44 },
    ]);
    const use = elements(document.body as unknown as ElementDouble).find(node => node.getAttribute('data-villa-use') === 'true')!;
    expect(use.hidden).toBe(false); expect(parseFloat(use.style.width)).toBe(62); expect(parseFloat(use.style.height)).toBe(62);
    for (const seated of ['car', 'pickup', 'scooter', 'racing']) {
      game.state.seated = seated;
      expect(game.buttons().filter(button => ['brake', 'reset-activity'].includes(button.id))).toMatchObject([
        { id: 'brake', x: 152, y: 417, w: 44, h: 44 }, { id: 'reset-activity', x: 206, y: 417, w: 44, h: 44 },
      ]);
    }
    game.state.seated = null; game.state.elevator.riding = true;
    expect(game.buttons().filter(button => button.id.startsWith('elevator-'))).toMatchObject([
      { id: 'elevator-2', x: 83, y: 120, w: 46, h: 44 }, { id: 'elevator-1', x: 137, y: 120, w: 46, h: 44 },
      { id: 'elevator-0', x: 191, y: 120, w: 46, h: 44 }, { id: 'elevator-open', x: 110, y: 170, w: 46, h: 44 },
      { id: 'elevator-close', x: 164, y: 170, w: 46, h: 44 },
    ]);
    game.state.elevator.riding = false; game.state.snookerActive = true;
    const ids = game.buttons().map(button => button.id);
    expect(ids).toEqual(['map', 'terminal', 'aim-left', 'aim-right', 'power-down', 'power-up', 'reset-activity', 'shoot']);
    game.draw(context);
    expect(parseFloat(use.style.left) - 31 + parseFloat(use.style.width) / 2).toBe(282);
    expect(parseFloat(use.style.top) - 19 + parseFloat(use.style.height) / 2).toBe(530);
    expect(canvas.getAttribute('aria-label')).toContain('Left stick');
  });

  it('updates the canvas assistive description for touch without keyboard prose', () => {
    const { game, canvas } = fixture();
    expect(canvas.getAttribute('aria-label')).toContain('Tap the location');
    expect(canvas.getAttribute('aria-label')).not.toMatch(/WASD|\b[EQP]\b|F11/);
    game.touchMode = false; game.draw(context); expect(canvas.getAttribute('aria-label')).toContain('WASD');
    game.touchMode = true; game.draw(context); expect(canvas.getAttribute('aria-label')).not.toMatch(/WASD|\b[EQP]\b|F11/);
  });
});

describe('Villa device-specific expanded help metadata', () => {
  it('passes the real SDK parser and groups every secondary control without touch keyboard-only notes', () => {
    const controls = parseGameMeta(metadata).controls;
    expect(controls.keyboard).toHaveLength(3); expect(controls.touch).toHaveLength(2);
    expect(controls.sections?.map(section => section.id)).toEqual(['movement', 'utilities', 'interactions', 'driving', 'elevator', 'snooker']);
    const sections = controls.sections!;
    for (const section of sections) { expect(section.title).toBeTruthy(); expect(section.titleZh).toBeTruthy(); expect(section.touch?.length).toBeGreaterThan(0); }
    const notes = [...controls.notes ?? [], ...sections.flatMap(section => section.notes ?? [])];
    expect(notes.every(note => ['all', 'keyboard', 'touch'].includes(note.audience!))).toBe(true);
    const touchText = [...controls.touch ?? [], ...sections.flatMap(section => section.touch ?? [])].flatMap(row => [row.action, row.actionZh])
      .concat(notes.filter(note => note.audience !== 'keyboard').flatMap(note => [note.text, note.textZh])).join(' ');
    expect(touchText).not.toMatch(/\b[EQP]\b|WASD|F11/);
    expect(touchText).toContain('Terminal'); expect(touchText).toContain('Return to entrance'); expect(touchText).toContain('Immersive mode');
    const keys = [...controls.keyboard ?? [], ...sections.flatMap(section => section.keyboard ?? [])].flatMap(row => row.keys);
    for (const key of ['W', 'A', 'S', 'D', 'Mouse', 'Shift', 'C', 'Space', 'Esc', 'E', 'Q', 'P', '?', '/', '↑', '↓', '←', '→', '1', '2', '3', 'O', 'K', 'I', 'M', 'T', 'R', 'H', 'L']) expect(keys).toContain(key);
  });
});
