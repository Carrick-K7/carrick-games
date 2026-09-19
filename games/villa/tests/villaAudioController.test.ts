import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameHost } from '@carrick/game-sdk/game';
import { VillaGame } from '../src/villa.js';
import { VILLA_HOTSPOTS } from '../src/villaWorld.js';
import { VILLA_RELAX_SEATS } from '../src/villaSeating.js';
import { VILLA_WARDROBES } from '../src/villaWardrobe.js';
import { VILLA_ELEVATOR } from '../src/villaElevator.js';
import { VILLA_TEA_BAR } from '../src/villaTeaBar.js';
import { VILLA_FAUCET } from '../src/villaFaucet.js';
import { VILLA_CAR_LIMITS } from '../src/villaDriving.js';
import { VILLA_SCOOTER_LIMITS } from '../src/villaScooter.js';
import { VILLA_RACE_MAX_SPEED } from '../src/villaRacing.js';
import { villaStreamDistance, VILLA_STREAM } from '../src/villaStream.js';
import type { VillaInteractionCue } from '../src/villaInteractionAudio.js';

// Actual controller, terminal callbacks, native Use and physics; only rendering
// and the DOM are doubled. All private access stays inside this game-owned test.
class ElementDouble {
  children: ElementDouble[] = []; parentElement: ElementDouble | null = null;
  dataset: Record<string, string> = {}; attributes = new Map<string, string>();
  listeners = new Map<string, { callback: (event: any) => void; capture: boolean }[]>();
  style: any = { setProperty: vi.fn() }; hidden = false; isConnected = true; disabled = false;
  width = 1120; height = 700; textContent = ''; className = '';
  constructor(readonly tagName: string) {}
  get ownerDocument() { return document; } get parentNode() { return this.parentElement; }
  get clientWidth() { return this.width; }
  getContext(kind: string) { if (kind !== '2d') throw Error('GPU forbidden'); return { setTransform: vi.fn() }; }
  getBoundingClientRect() { return { left: 0, top: 0, width: this.width, height: this.height }; }
  setAttribute(k: string, v: string) { this.attributes.set(k, v); }
  getAttribute(k: string) { return this.attributes.get(k) ?? null; }
  removeAttribute(k: string) { this.attributes.delete(k); }
  append(...nodes: ElementDouble[]) { for (const n of nodes) { n.parentElement = this; this.children.push(n); } }
  appendChild(n: ElementDouble) { this.append(n); return n; }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(n => n !== this); }
  closest(selector: string): ElementDouble | null {
    if (selector === '#gameApp') return document.body as unknown as ElementDouble;
    if (selector.includes('[data-villa-terminal-tab]') && this.dataset.villaTerminalTab != null) return this;
    if (selector.includes('[data-villa-camera]') && this.dataset.villaCamera != null) return this;
    if (selector.includes('[data-villa-use]') && this.attributes.has('data-villa-use')) return this;
    if (selector.includes('[data-villa-terminal]') && this.dataset.villaTerminal != null) return this;
    return this.parentElement?.closest(selector) ?? null;
  }
  addEventListener(type: string, callback: (e: any) => void, options?: boolean | { capture?: boolean }) {
    this.listeners.set(type, [...this.listeners.get(type) ?? [], { callback, capture: typeof options === 'boolean' ? options : !!options?.capture }]);
  }
  removeEventListener(type: string, callback: (e: any) => void) { this.listeners.set(type, (this.listeners.get(type) ?? []).filter(l => l.callback !== callback)); }
  focus() { Object.assign(document, { activeElement: this }); }
  requestPointerLock = vi.fn();
  emit(type: string, extra: Record<string, unknown> = {}) {
    let stopped = false;
    const event = { target: this, type, detail: 0, isTrusted: false, preventDefault() {}, stopPropagation() { stopped = true; }, ...extra };
    const chain: ElementDouble[] = []; for (let n: ElementDouble | null = this; n; n = n.parentElement) chain.push(n);
    for (const node of [...chain].reverse()) for (const l of node.listeners.get(type) ?? []) if (l.capture) l.callback(event);
    for (const node of chain) {
      for (const l of node.listeners.get(type) ?? []) if (!l.capture) l.callback(event);
      if (stopped) break;
    }
  }
  click() { if (!this.disabled) this.emit('click'); }
}
class KeyboardDouble {
  type = 'keydown'; repeat = false; target = null; isTrusted = false; ctrlKey = false; altKey = false; metaKey = false;
  preventDefault = vi.fn(); constructor(readonly key: string) {}
}
let games: any[], windowListeners: Map<string, (() => void)[]>, documentListeners: Map<string, (() => void)[]>;
beforeEach(() => {
  games = []; windowListeners = new Map(); documentListeners = new Map();
  const listener = (map: Map<string, (() => void)[]>) => (type: string, fn: () => void) => map.set(type, [...map.get(type) ?? [], fn]);
  const view = { matchMedia: () => ({ matches: true }), devicePixelRatio: 1, localStorage: { getItem: () => null, setItem: vi.fn() },
    addEventListener: listener(windowListeners), removeEventListener: vi.fn(), getComputedStyle: () => ({ zIndex: '0' }) };
  vi.stubGlobal('window', view); vi.stubGlobal('document', { hidden: false, pointerLockElement: null, activeElement: null, defaultView: view,
    body: new ElementDouble('body'), createElement: (tag: string) => new ElementDouble(tag),
    addEventListener: listener(documentListeners), removeEventListener: vi.fn() });
  vi.stubGlobal('navigator', { userActivation: { isActive: false } });
  vi.stubGlobal('Element', ElementDouble); vi.stubGlobal('KeyboardEvent', KeyboardDouble);
  vi.stubGlobal('MouseEvent', class {}); vi.stubGlobal('TouchEvent', class {});
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1)); vi.stubGlobal('cancelAnimationFrame', vi.fn());
});
afterEach(() => { for (const game of games) game.destroy(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function elements(root: ElementDouble): ElementDouble[] { return [root, ...root.children.flatMap(elements)]; }
function fixture() {
  const canvas = new ElementDouble('canvas');
  (document.body as unknown as ElementDouble).append(canvas);
  const host: GameHost = { canvas: canvas as unknown as HTMLCanvasElement, logicalWidth: 1120, logicalHeight: 700,
    isDarkTheme: () => false, isZhLang: () => false, isPixelMode: () => false, getRecord: () => null, reportScore: vi.fn(), requestShellRender: vi.fn() };
  const game: any = new VillaGame(host); games.push(game);
  game.scene = { colliders: [], drivingObstacles: [], pickupObstacles: [], suvObstacles: [], scooterObstacles: [],
    carDoorProgress: 0, pickupDoorProgress: 0, suvDoorProgress: 0, updateActivities: vi.fn(), updatePets: vi.fn(), dispose: vi.fn() };
  game.init(); game.running = true; game.onStart();
  const cue = vi.spyOn(game.audio, 'cue'), light = vi.spyOn(game.audio, 'lightClick'), door = vi.spyOn(game.audio, 'vehicleDoor');
  const footstep = vi.spyOn(game.audio, 'footstep'), mix = vi.spyOn(game.audio, 'update'), hit = vi.spyOn(game.audio, 'snookerHit');
  const hotspot = vi.spyOn(game, 'hotspot').mockReturnValue(null);
  game.syncUseButton();
  const at = (id: string) => {
    const p = VILLA_HOTSPOTS.find(h => h.id === id) ?? VILLA_RELAX_SEATS.find(s => s.id === id)?.approach ?? VILLA_WARDROBES.find(w => w.id === id)?.approach ?? { x: 0, y: 0, z: 20 };
    game.position = { x: p.x, y: p.y, z: p.z }; game.eyeY = p.y;
    hotspot.mockReturnValue({ ...p, id, name: id, zh: id }); game.syncUseButton();
  };
  const native = () => elements(document.body as unknown as ElementDouble).find(n => n.getAttribute('data-villa-use') === 'true')!;
  const key = (k: string, repeat = false) => game.handleInput(Object.assign(new KeyboardDouble(k), { repeat }));
  const use = (route: string) => route === 'E' ? key('e') : route === 'native' ? native().click() : route === 'activate' ? game.activate('interact') : game.interact();
  const resetCalls = () => { cue.mockClear(); light.mockClear(); door.mockClear(); footstep.mockClear(); hit.mockClear(); };
  return { game, canvas, cue, light, door, footstep, hit, mix, hotspot, at, key, use, native, resetCalls,
    target: (key: string, value = '') => elements(game.terminal.element).find(n => n.dataset[key] === value)! };
}
const ids = (cue: ReturnType<typeof vi.spyOn>) => cue.mock.calls.map(call => call[0]);
const routes = ['interact', 'activate', 'E', 'native'];
const toggles: { id: string; cues: [VillaInteractionCue, VillaInteractionCue]; value: (g: any) => unknown }[] = [
  ...VILLA_WARDROBES.map(w => ({ id: w.id, cues: (w.id === 'fridge-freezer' ? ['fridge-open', 'fridge-close'] : ['wardrobe-open', 'wardrobe-close']) as [VillaInteractionCue, VillaInteractionCue], value: (g: any) => g.state.wardrobes.wardrobes[w.id].open })),
  ...['west', 'east'].map(which => ({ id: `bath-door-${which}`, cues: ['slide-open', 'slide-close'] as [VillaInteractionCue, VillaInteractionCue], value: (g: any) => g.state.bathDoors[which] })),
  ...['west', 'centre', 'east'].map((which, i) => ({ id: `grill-${which}`, cues: ['grill-open', 'grill-close'] as [VillaInteractionCue, VillaInteractionCue], value: (g: any) => g.state.grillLids[i] })),
  { id: 'faucet', cues: ['faucet-on', 'faucet-off'], value: g => g.state.faucetOn },
  { id: 'fireplace', cues: ['fire-off', 'fire-on'], value: g => g.state.fireplace },
  { id: 'gaming', cues: ['device-off', 'device-on'], value: g => g.state.gaming },
];

describe('actual actionable inventory and shared dispatch', () => {
  it('accounts for every current world hotspot plus dynamic seats/openables/pets', () => {
    const { game } = fixture();
    const covered = new Set([...toggles.map(t => t.id), ...VILLA_RELAX_SEATS.map(s => s.id),
      'elevator', 'car', 'pickup', 'suv', 'scooter', 'racing', 'aquarium', 'tea-bar', 'snooker', 'media', 'figures', 'replicas', 'tea', 'roof']);
    expect(VILLA_HOTSPOTS.filter(h => !covered.has(h.id)).map(h => h.id)).toEqual([]);
    expect(VILLA_WARDROBES.every(w => covered.has(w.id))).toBe(true);
    expect(game.state.pets.pets.map((p: any) => p.id).sort()).toEqual(['cat', 'dog', 'parrot', 'parrot-blue', 'rabbit', 'rabbit-female']);
  });
  for (const route of routes) it.each(toggles)(`${route}: $id changes state and emits only its material/device cue`, ({ id, cues, value }) => {
    const f = fixture(); f.at(id); const before = value(f.game);
    f.use(route); expect(value(f.game)).not.toEqual(before); expect(ids(f.cue)).toEqual([cues[0]]);
    f.resetCalls(); f.use(route); expect(value(f.game)).toEqual(before); expect(ids(f.cue)).toEqual([cues[1]]);
    expect(f.light).not.toHaveBeenCalled(); expect(f.door).not.toHaveBeenCalled();
  });
  it.each(['bath-door-west', 'bath-door-east', 'grill-west', 'grill-centre', 'grill-east'])('direct %s activation shares one hook with Use', id => {
    const f = fixture(); f.at(id); f.game.activate(id); expect(f.cue).toHaveBeenCalledTimes(1);
    if (id.startsWith('bath-')) { expect(f.game.toast).toMatch(/Sliding/); expect(f.game.toast).not.toMatch(/swing/); }
  });
  it('native touch plus compatibility click cannot toggle or sound twice; keyboard native click remains usable', () => {
    const f = fixture(); f.at('faucet'); const button = f.native();
    button.emit('touchstart', { changedTouches: [{ identifier: 1 }] });
    button.emit('touchend', { changedTouches: [{ identifier: 1 }] });
    button.emit('click', { detail: 1 });
    expect(f.game.state.faucetOn).toBe(true); expect(ids(f.cue)).toEqual(['faucet-on']);
    button.emit('click', { detail: 0 }); expect(ids(f.cue)).toEqual(['faucet-on', 'faucet-off']);
  });
  it('empty-space use and keyboard auto-repeat have no fake success or error', () => {
    const f = fixture(); f.use('E'); f.use('native'); f.at('faucet'); f.key('e', true);
    expect(f.cue).not.toHaveBeenCalled(); expect(f.game.state.faucetOn).toBe(false);
  });
});

describe('seats, tea, pets and small home interactions', () => {
  it.each(VILLA_RELAX_SEATS.map(s => [s.id, s.kind] as const))('%s has committed seating, blocked exit and successful exit cues', (id, kind) => {
    const f = fixture(); f.at(id); vi.spyOn(f.game, 'approachClear').mockReturnValue(true);
    const fit = vi.spyOn(f.game, 'canFit').mockReturnValue(true);
    f.use('native'); expect(f.game.state.relaxSeatId).toBe(id); expect(ids(f.cue)).toEqual([kind === 'bed' ? 'bed' : 'sit']);
    f.game.transition = null; f.resetCalls(); fit.mockReturnValue(false); f.use('E');
    expect(f.game.state.relaxSeatId).toBe(id); expect(ids(f.cue)).toEqual(['reject']);
    fit.mockReturnValue(true); f.resetCalls(); f.use('activate'); expect(f.game.state.seated).toBeNull(); expect(ids(f.cue)).toEqual(['stand']);
  });
  it('rejects obstructed seating without a fabric/seat cue', () => {
    const f = fixture(); f.at('sofa-living'); vi.spyOn(f.game, 'approachClear').mockReturnValue(false);
    f.use('E'); expect(ids(f.cue)).toEqual(['reject']); expect(f.game.state.seated).toBeNull();
  });
  it.each(['dog', 'cat', 'parrot', 'parrot-blue', 'rabbit', 'rabbit-female'])('%s feeds once with species timbre, then refuses a cooldown attempt', id => {
    const f = fixture(), pet = f.game.state.pets.pets.find((p: any) => p.id === id); f.at(`pet-${id}`);
    pet.y = 0; f.game.position = { x: pet.x + .5, y: 0, z: pet.z }; f.game.state.pets.visitor = { ...f.game.position };
    f.use('E'); expect(pet.feedCount).toBe(1); expect(ids(f.cue)).toEqual([`feed-${pet.kind}`]);
    f.resetCalls(); f.use('native'); expect(pet.feedCount).toBe(1); expect(ids(f.cue)).toEqual(['reject']);
  });
  it('brews, refuses a busy restart, announces ready once, drinks and sets down once', () => {
    const f = fixture(); f.at('tea-bar'); f.use('E'); expect(ids(f.cue)).toEqual(['tea-brew']);
    expect(f.game.state.tea.phase).toBe('brewing'); f.resetCalls(); f.use('native'); expect(ids(f.cue)).toEqual(['busy']);
    f.game.state.tea.elapsed = 9.99; f.resetCalls(); f.game.update(.02); f.game.update(.02);
    expect(f.game.state.tea.phase).toBe('ready'); expect(ids(f.cue)).toEqual(['tea-ready']);
    f.resetCalls(); f.use('activate'); expect(ids(f.cue)).toEqual(['tea-drink']); expect(f.game.state.tea.phase).toBe('drinking');
    f.game.state.tea.elapsed = 2.79; f.resetCalls(); f.game.update(.02); f.game.update(.02); expect(ids(f.cue)).toEqual(['tea-set-down']);
  });
  it('aquarium feeds, media changes, PC secondary switches and collector lights sound at their state changes', () => {
    const f = fixture(); f.at('aquarium'); f.use('native'); expect(f.game.state.fedUntil).toBe(8); expect(ids(f.cue)).toEqual(['feed-fish']);
    f.at('media'); f.resetCalls(); const source = f.game.state.screenSource; f.use('E'); expect(f.game.state.screenSource).not.toBe(source); expect(ids(f.cue)).toEqual(['media']);
    f.at('chair-pc'); f.resetCalls(); f.key('q'); expect(f.game.state.gaming).toBe(false); expect(ids(f.cue)).toEqual(['device-off']);
    for (const id of ['figures', 'replicas']) { f.at(id); f.resetCalls(); const before = f.game.state.displayLights; f.use('E'); expect(f.game.state.displayLights).toBe(!before); expect(f.light).toHaveBeenCalledTimes(1); expect(f.cue).not.toHaveBeenCalled(); }
  });
  it('camping pickup/place/reject and a real swing reversal have separate cues', () => {
    const f = fixture(); f.at('camping-chair'); f.game.position = { ...f.game.state.outdoor.camping }; vi.spyOn(f.game, 'approachClear').mockReturnValue(true);
    f.key('q'); expect(f.game.state.outdoor.camping.carried).toBe(true); expect(ids(f.cue)).toEqual(['carry-chair']);
    f.resetCalls(); f.game.position = { x: 200, y: 0, z: 200 }; f.use('E'); expect(ids(f.cue)).toEqual(['reject']); expect(f.game.state.outdoor.camping.carried).toBe(true);
    f.game.position = { x: -18, y: 0, z: 24 }; f.resetCalls(); f.use('E'); expect(ids(f.cue)).toEqual(['place-chair']); expect(f.game.state.outdoor.camping.carried).toBe(false);
    f.at('swing'); f.resetCalls(); f.use('E'); expect(ids(f.cue)).toEqual(['swing']);
    f.game.transition = null; f.game.state.outdoor.swingPhase = Math.PI / 2 - .01; f.resetCalls();
    f.game.update(.02); f.game.update(.02); expect(ids(f.cue)).toEqual(['swing']);
  });
  it('legacy tea/roof moments acknowledge information rather than pretending to brew, and utilities confirm changes', () => {
    const f = fixture(); f.at('tea'); f.use('E'); expect(ids(f.cue)).toEqual(['moment']); expect(f.game.state.tea.phase).toBe('empty');
    f.at('roof'); f.resetCalls(); f.use('native'); expect(ids(f.cue)).toEqual(['moment']);
    f.game.state.home.timeOfDay = 'day'; f.resetCalls(); f.use('E'); expect(ids(f.cue)).toEqual(['setting']); expect(f.game.state.home.timeOfDay).toBe('evening');
    f.resetCalls(); f.key('t'); expect(ids(f.cue)).toEqual(['setting']);
    f.resetCalls(); f.key('i'); expect(ids(f.cue)).toEqual(['setting']);
    f.resetCalls(); f.key('h'); expect(ids(f.cue)).toEqual(['home']);
  });
  it('snooker entry, shot, busy rejection and reset all follow actual action results', () => {
    const f = fixture(); f.at('snooker'); f.use('E'); expect(ids(f.cue)).toEqual(['snooker-enter']);
    f.game.transition = null; f.resetCalls(); f.game.activate('shoot'); expect(f.hit).toHaveBeenCalledTimes(1); expect(f.game.state.snooker.shots).toBe(1);
    f.game.activate('shoot'); expect(f.hit).toHaveBeenCalledTimes(1); expect(ids(f.cue)).toEqual(['busy']);
    f.resetCalls(); f.key('r'); expect(ids(f.cue)).toEqual(['reset']); f.resetCalls(); f.use('native'); expect(ids(f.cue)).toEqual(['stand']);
  });
});

describe('state-transition-only movement and lift sound', () => {
  it('crouches, rejects low headroom, rises, jumps once and lands without phantom footfalls', () => {
    const f = fixture(); f.game.position = { x: 0, y: 0, z: 20 }; f.game.eyeY = 0;
    const fit = vi.spyOn(f.game, 'canFit').mockReturnValue(true);
    f.key('c'); expect(ids(f.cue)).toEqual(['crouch']); fit.mockReturnValue(false); f.resetCalls(); f.key('c'); expect(ids(f.cue)).toEqual(['reject']);
    fit.mockReturnValue(true); f.resetCalls(); f.key('c'); expect(ids(f.cue)).toEqual(['rise']);
    f.resetCalls(); f.game.stepDistance = 2; f.key(' '); f.key(' ', true); expect(ids(f.cue)).toEqual(['jump']);
    for (let i = 0; i < 100; i++) f.game.update(.02);
    expect(ids(f.cue)).toEqual(['jump', 'land']); expect(f.footstep).not.toHaveBeenCalled();
    f.game.stepDistance = 2; for (let i = 0; i < 10; i++) f.game.update(.02); expect(f.footstep).not.toHaveBeenCalled();
    f.game.keys.add('w'); for (let i = 0; i < 20; i++) f.game.update(.02); expect(f.footstep).toHaveBeenCalled();
  });
  it.each(routes)('%s lift call is acknowledged once, starts doors once, and rejects a busy repeat', route => {
    const f = fixture(); f.at('elevator'); f.use(route);
    expect(f.game.state.elevator.phase).toBe('opening'); expect(ids(f.cue)).toEqual(['elevator-call', 'elevator-open']);
    f.resetCalls(); f.game.update(.02); expect(f.cue).not.toHaveBeenCalled();
    f.use(route); expect(ids(f.cue)).toEqual(['reject']);
  });
  it('aimed E/native/direct panel routes share selection, motion, arrival and door transitions without per-frame chimes', () => {
    const f = fixture(), lift = f.game.state.elevator;
    f.game.position = { x: VILLA_ELEVATOR.centerX, y: 0, z: VILLA_ELEVATOR.centerZ }; f.game.eyeY = 0;
    lift.phase = 'open'; lift.door = 1; f.game.elevatorAudioPhase = 'open';
    f.hotspot.mockReturnValue({ id: 'elevator-floor-1' }); f.use('native');
    expect(ids(f.cue)).toEqual(['elevator-select', 'elevator-close']); expect(lift.target).toBe(1);
    f.resetCalls(); for (let i = 0; i < 300; i++) f.game.update(.02);
    expect(lift.floor).toBe(1); expect(ids(f.cue)).toEqual(['elevator-arrive', 'elevator-open']);
    const snapshots = f.mix.mock.calls.map(([s]) => s); expect(snapshots.some(s => s.elevator.moving)).toBe(true);
    expect(snapshots.at(-1).elevator.moving).toBe(false);
    f.resetCalls(); f.game.activate('elevator-floor-0'); expect(ids(f.cue)).toEqual(['elevator-select', 'elevator-close']);
    f.resetCalls(); f.key('3'); expect(ids(f.cue)).toEqual(['reject']);
  });
  it('an empty lift also chimes on actual arrival, not only when riding', () => {
    const f = fixture(), lift = f.game.state.elevator; Object.assign(lift, { phase: 'moving', fromY: 0, y: 3.59, target: 1, travel: 3.79 });
    f.game.elevatorAudioPhase = 'moving'; f.game.position = { x: 4.55, y: 3.6, z: -3.7 }; f.game.eyeY = 3.6;
    f.game.update(.02); f.game.update(.02); expect(ids(f.cue)).toEqual(['elevator-arrive', 'elevator-open']);
  });
});

describe('vehicles, rally, parking and spatial snapshots', () => {
  it.each(['car', 'pickup', 'suv'])('%s door only sounds on real changes, never closed reset or rejected moving entry', id => {
    const f = fixture(); f.game.setRoadDoor(id, false); expect(f.door).not.toHaveBeenCalled();
    f.game.setRoadDoor(id, true); f.game.setRoadDoor(id, true); f.game.setRoadDoor(id, false); expect(f.door.mock.calls).toEqual([[true], [false]]);
    f.at(id); f.game.roadState(id).speed = 2; f.resetCalls(); f.use('E'); expect(ids(f.cue)).toEqual(['reject']); expect(f.door).not.toHaveBeenCalled();
  });
  it.each(['car', 'pickup', 'suv'])('%s accepted timed entry separates one door latch from one committed seat rustle', id => {
    const f = fixture(); f.at(id); vi.spyOn(f.game, 'atDriverDoor').mockReturnValue(true); vi.spyOn(f.game, 'roadExitClear').mockReturnValue(true);
    f.use('native'); expect(f.door.mock.calls).toEqual([[true]]); expect(f.cue).not.toHaveBeenCalled(); expect(f.game.state.seated).toBeNull();
    f.game.scene[`${id}DoorProgress`] = 1; f.game.time = f.game.enterCarAt; f.game.update(0);
    expect(f.game.state.seated).toBe(id); expect(ids(f.cue)).toEqual(['sit']);
    f.game.time = f.game.closeCarAt; f.game.update(0); f.game.update(0); expect(f.door.mock.calls).toEqual([[true], [false]]);
  });
  it.each(['scooter', 'racing'])('%s boards through actual clear-route action once, but rejects blocked approach', id => {
    const f = fixture(); f.at(id); const approach = vi.spyOn(f.game, 'approachClear').mockReturnValue(false); vi.spyOn(f.game, 'canFit').mockReturnValue(true);
    f.use('E'); expect(ids(f.cue)).toEqual(['reject']); expect(f.game.state.seated).toBeNull();
    approach.mockReturnValue(true); f.resetCalls(); f.use('native'); expect(ids(f.cue)).toEqual(['sit']); expect(f.game.state.seated).toBe(id);
  });
  it('a real road collision counter edge emits one impact, never repeatedly while contact remains', () => {
    const f = fixture(), car = f.game.state.driving; f.game.state.seated = 'car'; f.game.safetyBrake = false;
    Object.assign(car, { x: 6, z: 38, speed: 3, yaw: 0 });
    f.game.scene.drivingObstacles = [{ minX: 4, maxX: 8, minZ: 40.45, maxZ: 41, minY: -2, maxY: 3 }];
    f.game.update(.05); expect(car.collisions).toBe(1); expect(ids(f.cue)).toEqual(['collision']);
    f.game.update(.05); expect(car.collisions).toBe(1); expect(ids(f.cue)).toEqual(['collision']);
  });
  it('road and scooter snapshots use real new envelopes, transition-only gear and handbrake, and collision counters', () => {
    const f = fixture(); f.game.state.seated = 'car'; f.game.safetyBrake = false; f.game.state.driving.x = 6; f.game.state.driving.z = 38;
    f.game.state.driving.speed = 3; f.game.update(.02); expect(f.mix.mock.calls.at(-1)![0].engine.maxSpeed).toBe(VILLA_CAR_LIMITS.maxSpeed);
    expect(ids(f.cue).filter(id => id === 'gear')).toHaveLength(1); f.resetCalls(); f.game.update(.02); expect(ids(f.cue)).not.toContain('gear');
    f.game.keys.add(' '); f.game.update(.02); f.game.update(.02); expect(ids(f.cue).filter(id => id === 'handbrake-on')).toHaveLength(1);
    f.game.keys.delete(' '); f.game.update(.02); expect(ids(f.cue).filter(id => id === 'handbrake-off')).toHaveLength(1);
    f.resetCalls(); f.game.state.seated = 'scooter'; f.game.state.scooter.x = 6; f.game.state.scooter.z = 38; f.game.state.scooter.speed = 3;
    f.game.update(.02); expect(f.mix.mock.calls.at(-1)![0].engine.maxSpeed).toBe(VILLA_SCOOTER_LIMITS.maxSpeed);
    f.resetCalls(); f.game.driveFeedback('scooter', { collisions: 0, handbrake: false }, { collisions: 1, speed: 0, handbrake: false });
    f.game.driveFeedback('scooter', { collisions: 1, handbrake: false }, { collisions: 1, speed: 0, handbrake: false }); expect(ids(f.cue)).toEqual(['collision']);
    f.game.mapOpen = true; f.game.update(.02); expect(f.mix.mock.calls.at(-1)![0].engine).toBeNull();
  });
  it('rally has its own engine, split/finish and collision edges, and shuts up on another input source', () => {
    const f = fixture(), race = f.game.state.race; f.game.state.seated = 'racing'; f.game.state.screenSource = 'pc'; f.game.safetyBrake = false;
    race.distance = 599.9; race.speed = 40; race.lane = 0; race.obstacles = [];
    f.game.update(.02); expect(ids(f.cue)).toContain('rally-split'); expect(f.mix.mock.calls.at(-1)![0].engine).toMatchObject({ kind: 'rally', maxSpeed: VILLA_RACE_MAX_SPEED });
    f.resetCalls(); race.distance = 2399.9; race.checkpoint = 3; race.lane = 0; f.game.update(.02); expect(ids(f.cue)).toEqual(['rally-finish']);
    f.resetCalls(); race.lane = 1.3; race.speed = 20; race.crashTimer = 0; f.game.update(.02); f.game.update(.02); expect(ids(f.cue).filter(id => id === 'collision')).toHaveLength(1);
    f.game.state.screenSource = 'ps'; f.game.update(.02); expect(f.mix.mock.calls.at(-1)![0].engine).toBeNull();
  });
  it('parking already home rejects, an active cancellation confirms, and blocked reset never claims success', () => {
    const f = fixture(); f.game.parkVehicleHome('car'); expect(ids(f.cue)).toEqual(['reject']);
    f.resetCalls(); f.game.state.park.car.active = true; f.game.parkVehicleHome('car'); expect(ids(f.cue)).toEqual(['park-cancel']);
    f.resetCalls(); f.game.state.seated = 'car'; const c = f.game.state.driving;
    f.game.scene.drivingObstacles = [{ minX: c.x - 5, maxX: c.x + 5, minZ: c.z - 5, maxZ: c.z + 5, minY: 0, maxY: 3 }];
    f.game.activate('reset-activity'); expect(ids(f.cue)).toEqual(['reject']);
  });
  it.each(['car', 'pickup', 'suv'])('%s parking start, actual arrival and failure announce once without a frame loop', id => {
    const f = fixture(), state = f.game.roadState(id), bay = { ...state };
    state.z += 20; f.game.parkVehicleHome(id);
    expect(f.game.state.park[id].active).toBe(true); expect(ids(f.cue)).toEqual(['park-start']);
    Object.assign(state, bay); f.resetCalls(); f.game.update(.02); f.game.update(.02);
    expect(f.game.state.park[id].active).toBe(false); expect(ids(f.cue)).toEqual(['park-arrive']);
    state.z += 20; f.game.parkVehicleHome(id); f.game.state.park[id].elapsed = 301;
    f.resetCalls(); f.game.update(.02); f.game.update(.02); expect(ids(f.cue)).toEqual(['reject']);
  });
  it('listener ear height and source datums produce instance-local water/fire snapshots', () => {
    const a = fixture(), b = fixture(); a.game.position = { x: 0, y: 0, z: -38 }; a.game.eyeY = 0;
    b.game.position = { x: 0, y: 7.2, z: -38 }; b.game.eyeY = 7.2;
    a.game.update(0); b.game.update(0);
    const low = a.mix.mock.calls.at(-1)![0], high = b.mix.mock.calls.at(-1)![0];
    expect(low.streamDistance).toBeCloseTo(Math.hypot(villaStreamDistance(0, -38), 1.65 - VILLA_STREAM.waterY));
    expect(high.streamDistance).toBeGreaterThan(low.streamDistance + 6);
    a.game.position = { x: VILLA_FAUCET.outlet.x, y: 0, z: VILLA_FAUCET.outlet.z }; a.game.eyeY = 0; a.game.state.faucetOn = true; a.game.update(0);
    expect(a.mix.mock.calls.at(-1)![0].faucetDistance).toBeCloseTo(1.65 - VILLA_FAUCET.outlet.y);
    expect(b.mix.mock.calls.at(-1)![0].faucetOn).toBe(false);
    a.game.position = { x: VILLA_TEA_BAR.x, y: 7.2, z: VILLA_TEA_BAR.z }; a.game.eyeY = 7.2;
    a.game.state.tea.phase = 'brewing'; a.game.state.tea.elapsed = 9.99; a.resetCalls(); a.game.update(.02);
    expect(a.cue.mock.calls[0][0]).toBe('tea-ready'); expect(a.cue.mock.calls[0][1]).toBeGreaterThan(7);
  });
});

describe('native terminal, settings, UI and controller silence boundaries', () => {
  it('map/terminal open and close, map keyboard tabs, native terminal tabs and cameras sound once only when changed', () => {
    const f = fixture(); f.key('m'); expect(ids(f.cue)).toEqual(['panel-open']); f.resetCalls(); f.key('2'); f.key('2'); expect(ids(f.cue)).toEqual(['ui-tab']);
    f.resetCalls(); f.key('Escape'); expect(ids(f.cue)).toEqual(['panel-close']);
    f.resetCalls(); f.key('p'); expect(ids(f.cue)).toEqual(['panel-open']); f.resetCalls();
    f.target('villaTerminalTab', 'settings').click(); f.target('villaTerminalTab', 'settings').click(); expect(ids(f.cue)).toEqual(['ui-tab']);
    f.resetCalls(); f.target('villaTerminalTab', 'cameras').click(); const camera = elements(f.game.terminal.element).find(n => n.dataset.villaCamera && n.getAttribute('aria-pressed') !== 'true')!;
    f.resetCalls(); camera.click(); camera.click(); expect(ids(f.cue)).toEqual(['ui-tab']);
    f.resetCalls(); f.target('villaTerminalClose').click(); expect(ids(f.cue)).toEqual(['panel-close']);
  });
  it('terminal callbacks use semantic device/setting cues and ignore unchanged settings', () => {
    const f = fixture(); f.game.setTerminal(true); f.resetCalls();
    f.target('villaTime', 'night').click(); f.target('villaTime', 'night').click(); expect(ids(f.cue)).toEqual(['setting']);
    f.resetCalls(); f.target('villaWeather', 'rain').click(); f.target('villaWeather', 'rain').click(); expect(ids(f.cue)).toEqual(['setting']);
    f.resetCalls(); f.target('villaAimGuide').click(); expect(ids(f.cue)).toEqual(['setting']);
    f.resetCalls(); const slider = f.target('villaSensitivity'); (slider as any).value = '1.5'; slider.emit('input'); slider.emit('input'); expect(ids(f.cue)).toEqual(['setting']);
    f.resetCalls(); f.target('villaAquariumLight').click(); expect(f.light).toHaveBeenCalledTimes(1); expect(f.cue).not.toHaveBeenCalled();
    f.resetCalls(); f.target('villaFireplace').click(); expect(ids(f.cue)).toEqual(['setting', 'fire-off']);
    f.resetCalls(); f.target('villaSound').click(); expect(f.game.audio.enabled).toBe(false); expect(f.cue).not.toHaveBeenCalled();
  });
  it('blur, hidden, shell pause, stop and destroy silence synchronously and do not prime from update', () => {
    const f = fixture(), pause = vi.spyOn(f.game.audio, 'setPaused'), prime = vi.spyOn(f.game.audio, 'prime'), close = vi.spyOn(f.game.audio, 'close');
    f.game.setPresentationPaused(true); expect(pause).toHaveBeenLastCalledWith(true);
    f.game.setPresentationPaused(false); f.game.onShellOverlayChange(true); expect(pause).toHaveBeenLastCalledWith(true);
    f.game.onShellOverlayChange(false); for (const callback of windowListeners.get('blur') ?? []) callback(); expect(pause).toHaveBeenLastCalledWith(true);
    Object.assign(document, { hidden: true }); for (const callback of documentListeners.get('visibilitychange') ?? []) callback(); expect(pause).toHaveBeenLastCalledWith(true);
    f.game.update(.02); expect(prime).not.toHaveBeenCalled();
    f.game.stop(); expect(pause).toHaveBeenLastCalledWith(true); f.game.destroy(); expect(close).toHaveBeenCalledTimes(1); games = [];
  });
});
