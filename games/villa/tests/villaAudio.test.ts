import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VillaAudio, type VillaAudioEngineKind, type VillaAudioSnapshot } from '../src/villaAudio.js';

// Control-plane WebAudio mock: record graph ownership, automation and scheduled
// starts/stops. It intentionally does not pretend to verify the resulting DSP.
class Param {
  value = 0;
  cancelScheduledValues = vi.fn((_time: number) => this);
  setValueAtTime = vi.fn((value: number, time: number) => this.set(value, time));
  setTargetAtTime = vi.fn((value: number, time: number, seconds: number) => {
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('Invalid time constant');
    return this.set(value, time);
  });
  exponentialRampToValueAtTime = vi.fn((value: number, time: number) => this.set(value, time));
  private set(value: number, time: number) {
    if (!Number.isFinite(value) || !Number.isFinite(time)) throw new Error('Non-finite automation');
    this.value = value; return this;
  }
}
class Node {
  connections = new Set<Node>();
  connect = vi.fn((destination: Node) => { this.connections.add(destination); return destination; });
  disconnect = vi.fn(() => this.connections.clear());
}
class Gain extends Node {
  gain = new Param();
  constructor() { super(); this.gain.value = 1; }
}
class Filter extends Node { type = 'lowpass'; frequency = new Param(); Q = new Param(); }
class Source extends Node {
  type = 'sine'; frequency = new Param(); loop = false; buffer: unknown = null;
  pitchAtStart: number | null = null;
  constructor() { super(); this.frequency.value = 440; }
  onended: (() => void) | null = null;
  start = vi.fn((_time?: number, _offset?: number) => { this.pitchAtStart = this.frequency.value; });
  stop = vi.fn((_time?: number) => {});
  end() { this.onended?.(); }
}
let initialState: AudioContextState;
let resumeBehavior: (ctx: Context) => Promise<void>;
let failBuffer: boolean;
class Context {
  static instances: Context[] = [];
  state: AudioContextState = initialState;
  currentTime = 10;
  sampleRate = 8000;
  destination = new Node();
  onstatechange: (() => void) | null = null;
  nodes: Node[] = [];
  gains: Gain[] = [];
  sources: Source[] = [];
  oscillators: Source[] = [];
  buffers: Source[] = [];
  constructor() { Context.instances.push(this); }
  createGain = vi.fn(() => { const n = new Gain(); this.gains.push(n); this.nodes.push(n); return n; });
  createBiquadFilter = vi.fn(() => { const n = new Filter(); this.nodes.push(n); return n; });
  createBufferSource = vi.fn(() => { const n = new Source(); this.buffers.push(n); this.sources.push(n); this.nodes.push(n); return n; });
  createOscillator = vi.fn(() => { const n = new Source(); this.oscillators.push(n); this.sources.push(n); this.nodes.push(n); return n; });
  createBuffer = vi.fn((_channels: number, length: number, rate: number) => {
    if (failBuffer) throw new Error('No audio buffer');
    const data = new Float32Array(length);
    return { duration: length / rate, getChannelData: () => data };
  });
  resume = vi.fn(() => resumeBehavior(this));
  close = vi.fn(() => { this.state = 'closed'; return Promise.resolve(); });
  changeState(state: AudioContextState) { this.state = state; this.onstatechange?.(); }
}
const gesture = (type = 'mousedown', extra: Record<string, unknown> = {}) => ({ type, isTrusted: true, ...extra }) as unknown as Event;
const scene = (engine: VillaAudioSnapshot['engine'] = null): VillaAudioSnapshot => ({
  roomId: 'garden', rain: 0.8, poolDistance: 2, fireDistance: 100, fireplace: false, engine,
});
const allEffects = (audio: VillaAudio) => {
  audio.footstep(false); audio.vehicleDoor(true); audio.vehicleDoor(false);
  audio.elevatorMove(); audio.elevatorArrive(); audio.lightClick();
  audio.snookerHit(0.6); audio.splash(); audio.uiSelect();
};
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
function deferred() {
  let resolve!: () => void, reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
let audios: VillaAudio[];
let activation: { isActive: boolean; hasBeenActive: boolean };
let constructor: ReturnType<typeof vi.fn>;
function audio() { const value = new VillaAudio(); audios.push(value); return value; }
function input(value: VillaAudio, event = gesture()) {
  const wasActive = activation.isActive;
  activation.isActive = true;
  try { value.prime(event); } finally { activation.isActive = wasActive; }
}
function prime(value: VillaAudio) { input(value); return Context.instances.at(-1)!; }
function expectStopped(sources: Source[]) {
  for (const source of sources) {
    expect(source.stop).toHaveBeenLastCalledWith();
    expect(source.disconnect).toHaveBeenCalled();
    expect(source.connections.size).toBe(0);
    expect(source.onended).toBeNull();
  }
}

beforeEach(() => {
  audios = []; Context.instances = []; initialState = 'running'; failBuffer = false;
  resumeBehavior = ctx => { ctx.state = 'running'; return Promise.resolve(); };
  activation = { isActive: false, hasBeenActive: false };
  constructor = vi.fn(function () { return new Context(); });
  vi.stubGlobal('window', { AudioContext: constructor });
  vi.stubGlobal('navigator', { userActivation: activation });
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
});
afterEach(() => {
  for (const value of audios) value.close();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('Villa audio gesture boundary', () => {
  it('does not construct or resume during autoplay, updates, SFX or passive enable/unpause', () => {
    const value = audio();
    for (let i = 0; i < 100; i++) { value.update(scene({ speed: 5, throttle: 1 })); allEffects(value); }
    value.setEnabled(true); value.setPaused(false); value.prime();
    activation.hasBeenActive = true; value.prime();
    activation.isActive = true; // Even current activation cannot bless synthetic/unrelated events.
    for (const type of ['mousedown', 'keydown', 'touchend', 'click']) value.prime(gesture(type, { isTrusted: false }));
    for (const type of ['mousemove', 'touchmove', 'focus', 'visibilitychange', 'keyup']) value.prime(gesture(type));
    for (const extra of [{ repeat: true }, { key: 'Escape' }, { ctrlKey: true }, { metaKey: true }, { altKey: true }]) value.prime(gesture('keydown', extra));
    expect(constructor).not.toHaveBeenCalled();
  });

  it.each(['mousedown', 'keydown', 'touchstart', 'touchend', 'click'])('accepts a trusted %s without requiring userActivation support', type => {
    vi.stubGlobal('navigator', {});
    const value = audio(); value.prime(gesture(type));
    const ctx = Context.instances[0];
    expect(constructor).toHaveBeenCalledTimes(1);
    expect(ctx.resume).not.toHaveBeenCalled();
    expect(ctx.sources).toHaveLength(0); // Mixers are lazy too.
    value.update(scene()); value.prime(gesture(type));
    expect(ctx.sources).toHaveLength(5);
    expect(ctx.createBuffer).toHaveBeenCalledTimes(1);
    expect(constructor).toHaveBeenCalledTimes(1);
  });

  it('supports eventless native control callbacks only with current, not historical, activation', () => {
    const value = audio(); activation.hasBeenActive = true; value.prime();
    expect(constructor).not.toHaveBeenCalled();
    activation.isActive = true;
    value.prime(gesture('click', { isTrusted: false }));
    expect(constructor).not.toHaveBeenCalled();
    value.prime(); expect(constructor).toHaveBeenCalledTimes(1);
  });

  it('waits for modern touchend activation instead of stranding a policy-blocked touchstart resume', async () => {
    initialState = 'suspended';
    const blocked = deferred(); let policyBlockedCalls = 0;
    resumeBehavior = ctx => {
      // Chromium may leave resume() pending, not rejected, when invoked without
      // transient activation. A later gesture must never inherit this trap.
      if (!activation.isActive) { policyBlockedCalls++; return blocked.promise; }
      ctx.state = 'running'; return Promise.resolve();
    };
    const value = audio(); activation.hasBeenActive = true;
    value.prime(gesture('pointerdown', { pointerType: 'touch' }));
    value.prime(gesture('touchstart'));
    for (let i = 0; i < 100; i++) { value.update(scene()); allEffects(value); }
    expect(constructor).not.toHaveBeenCalled(); expect(policyBlockedCalls).toBe(0);
    input(value, gesture('touchend')); await flush(); value.update(scene());
    const ctx = Context.instances[0];
    expect(constructor).toHaveBeenCalledTimes(1); expect(ctx.resume).toHaveBeenCalledTimes(1);
    expect(ctx.state).toBe('running'); expect(ctx.sources).toHaveLength(5);
    expect(ctx.gains[0].gain.value).toBe(0.55); expect(policyBlockedCalls).toBe(0);
  });

  it('does not resume an existing suspended context from expired modern activation either', async () => {
    const value = audio(), ctx = prime(value); value.update(scene()); ctx.changeState('suspended');
    activation.hasBeenActive = true;
    for (const type of ['touchstart', 'pointerdown', 'touchend', 'mousedown', 'keydown', 'click']) value.prime(gesture(type));
    value.update(scene()); expect(ctx.resume).not.toHaveBeenCalled(); expect(ctx.gains[0].gain.value).toBe(0);
    input(value, gesture('touchend')); await flush();
    expect(ctx.resume).toHaveBeenCalledTimes(1); expect(ctx.gains[0].gain.value).toBe(0.55);
  });

  it('does not initialize when muted or paused, even from trusted gestures', () => {
    const value = audio();
    value.setEnabled(false); input(value);
    value.setPaused(true); value.setEnabled(true); input(value);
    expect(constructor).not.toHaveBeenCalled();
    value.setPaused(false); value.update(scene()); expect(constructor).not.toHaveBeenCalled();
    input(value); expect(constructor).toHaveBeenCalledTimes(1);
  });

  it('deduplicates pending resume and drops pre-resume effects without revoking the gesture', async () => {
    initialState = 'suspended'; const pending = deferred(); resumeBehavior = () => pending.promise;
    const value = audio(), ctx = prime(value);
    for (let i = 0; i < 100; i++) { value.update(scene()); allEffects(value); input(value); }
    expect(ctx.resume).toHaveBeenCalledTimes(1); expect(ctx.sources).toHaveLength(0);
    ctx.state = 'running'; pending.resolve(); await flush();
    expect(ctx.gains[0].gain.value).toBe(0.55);
    value.update(scene()); expect(ctx.sources).toHaveLength(5); // No queued SFX replay.
    value.lightClick(); expect(ctx.sources).toHaveLength(6);
  });

  it('catches rejected resume, never retries in update, and permits a new gesture retry', async () => {
    initialState = 'suspended'; resumeBehavior = () => Promise.reject(new Error('NotAllowedError'));
    const value = audio(), ctx = prime(value); await flush();
    for (let i = 0; i < 100; i++) { value.update(scene()); allEffects(value); }
    value.prime(); expect(ctx.resume).toHaveBeenCalledTimes(1); expect(ctx.sources).toHaveLength(0);
    resumeBehavior = ctx => { ctx.state = 'running'; return Promise.resolve(); };
    input(value); await flush(); value.update(scene());
    expect(ctx.resume).toHaveBeenCalledTimes(2); expect(ctx.sources).toHaveLength(5);
  });

  it('contains synchronous resume errors and allows a later gesture retry', async () => {
    initialState = 'suspended'; resumeBehavior = () => { throw new Error('Device lost'); };
    const value = audio(); expect(() => prime(value)).not.toThrow();
    const ctx = Context.instances[0]; value.update(scene()); expect(ctx.resume).toHaveBeenCalledTimes(1);
    resumeBehavior = ctx => { ctx.state = 'running'; return Promise.resolve(); };
    input(value); await flush(); value.update(scene()); expect(ctx.sources).toHaveLength(5);
  });
});

describe('Villa audio immediate silence and lifecycle', () => {
  it.each(['mute', 'pause'] as const)('%s silences all loops and future chimes, and requires a fresh gesture to return', mode => {
    const value = audio(), ctx = prime(value);
    value.update(scene({ kind: 'suv', speed: 5, throttle: 1 })); value.elevatorArrive();
    const before = [...ctx.sources], owned = ctx.nodes.slice(1), master = ctx.gains[0].gain;
    expect(before).toHaveLength(10); // Five ambience, three engine/road, two chimes.
    expect(ctx.oscillators.at(-1)!.start).toHaveBeenCalledWith(ctx.currentTime + 0.18);
    if (mode === 'mute') value.setEnabled(false); else value.setPaused(true);
    expect(master.cancelScheduledValues).toHaveBeenLastCalledWith(0);
    expect(master.setValueAtTime).toHaveBeenLastCalledWith(0, ctx.currentTime);
    expect(master.value).toBe(0); expectStopped(before);
    expect(owned.every(node => node.connections.size === 0)).toBe(true);
    for (let i = 0; i < 20; i++) { value.update(scene({ speed: 5, throttle: 1 })); allEffects(value); input(value); }
    expect(ctx.sources).toHaveLength(before.length);
    if (mode === 'mute') value.setEnabled(true); else value.setPaused(false);
    activation.isActive = true; value.update(scene()); allEffects(value);
    expect(master.value).toBe(0); expect(ctx.sources).toHaveLength(before.length);
    value.prime(gesture('click', { isTrusted: false })); expect(master.value).toBe(0);
    input(value); value.update(scene());
    expect(master.value).toBe(0.55); expect(ctx.sources).toHaveLength(before.length + 5);
    expect(ctx.resume).not.toHaveBeenCalled(); expectStopped(before);
  });

  it.each(['mute', 'pause', 'close'] as const)('%s clears past automation and the native cached value before the next audio quantum', mode => {
    const value = audio(), ctx = prime(value); value.update(scene({ kind: 'suv', speed: 4, throttle: 1 })); value.elevatorArrive();
    const master = ctx.gains[0].gain, before = [...ctx.sources];
    let events = master.setTargetAtTime.mock.calls.map(([level, time]) => ({ type: 'target', level, time }));
    expect(events).toHaveLength(1); expect(master.value).toBe(0.55);
    ctx.currentTime += 0.2; // The fade-in target began in the past, not at mute time.
    master.cancelScheduledValues.mockImplementation(time => { events = events.filter(event => event.time < time); return master; });
    master.setValueAtTime.mockImplementation((level, time) => {
      events.push({ type: 'value', level, time });
      // Native Chromium retains the previously rendered .value until the next
      // quantum when only this automation method is used. An explicit property
      // assignment, unlike a scheduled event, must clear that cached value now.
      return master;
    });
    if (mode === 'mute') value.setEnabled(false);
    else if (mode === 'pause') value.setPaused(true);
    else value.close();
    expect(master.value).toBe(0);
    expect(events).toEqual([{ type: 'value', level: 0, time: ctx.currentTime }]);
    expect(master.cancelScheduledValues).toHaveBeenLastCalledWith(0);
    expectStopped(before);
  });

  it.each(['cancel', 'schedule'] as const)('still zeros the intrinsic gain and cleans sources if master %s fails', operation => {
    const value = audio(), ctx = prime(value); value.update(scene({ speed: 4, throttle: 1 }));
    const master = ctx.gains[0].gain;
    if (operation === 'cancel') master.cancelScheduledValues.mockImplementationOnce(() => { throw new Error('Unavailable automation'); });
    else master.setValueAtTime.mockImplementationOnce(() => { throw new Error('Unavailable automation'); });
    expect(() => value.setEnabled(false)).not.toThrow();
    expect(master.value).toBe(0); expectStopped(ctx.sources);
  });

  it('makes repeated pause/mute notifications idempotent without scheduling more audio work', () => {
    const value = audio(), ctx = prime(value); value.update(scene());
    value.setEnabled(false); value.setPaused(true);
    const master = ctx.gains[0].gain, count = master.setValueAtTime.mock.calls.length;
    for (let i = 0; i < 1000; i++) { value.setEnabled(false); value.setPaused(true); }
    expect(master.setValueAtTime).toHaveBeenCalledTimes(count);
    for (const source of ctx.sources) expect(source.stop).toHaveBeenCalledTimes(1);
  });

  it('keeps pause and sound preference independent', () => {
    const value = audio(), ctx = prime(value); value.update(scene());
    value.setPaused(true); value.setEnabled(false); value.setPaused(false); input(value);
    expect(value.enabled).toBe(false); expect(ctx.gains[0].gain.value).toBe(0);
    value.setPaused(true); value.setEnabled(true); input(value);
    expect(value.enabled).toBe(true); expect(ctx.gains[0].gain.value).toBe(0);
    value.setPaused(false); input(value); expect(ctx.gains[0].gain.value).toBe(0.55);
  });

  it.each(['mute', 'pause', 'close'] as const)('a pending resume cannot undo %s, including a later passive unpause/unmute', async mode => {
    initialState = 'suspended'; const pending = deferred(); resumeBehavior = () => pending.promise;
    const value = audio(), ctx = prime(value);
    if (mode === 'mute') { value.setEnabled(false); value.setEnabled(true); }
    if (mode === 'pause') { value.setPaused(true); value.setPaused(false); }
    if (mode === 'close') value.close();
    ctx.state = 'running'; pending.resolve(); await flush(); value.update(scene()); allEffects(value);
    expect(ctx.gains[0].gain.value).toBe(0); expect(ctx.sources).toHaveLength(0);
    input(value); value.update(scene());
    expect(ctx.sources).toHaveLength(mode === 'close' ? 0 : 5);
    expect(constructor).toHaveBeenCalledTimes(1);
  });

  it('honors a newer trusted enable gesture without duplicating an already pending resume', async () => {
    initialState = 'suspended'; const pending = deferred(); resumeBehavior = () => pending.promise;
    const value = audio(), ctx = prime(value);
    value.setEnabled(false); value.setEnabled(true); input(value);
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    ctx.state = 'running'; pending.resolve(); await flush(); value.update(scene()); expect(ctx.sources).toHaveLength(5);
  });

  it('silences an interrupted context and never recovers it from simulation or statechange alone', () => {
    const value = audio(), ctx = prime(value); value.update(scene({ speed: 3, throttle: 1 })); value.elevatorArrive();
    const before = [...ctx.sources]; ctx.changeState('suspended');
    expectStopped(before); expect(ctx.gains[0].gain.value).toBe(0);
    for (let i = 0; i < 100; i++) { value.update(scene()); allEffects(value); }
    expect(ctx.resume).not.toHaveBeenCalled();
    ctx.changeState('running'); value.update(scene()); expect(ctx.sources).toHaveLength(before.length);
    input(value); value.update(scene()); expect(ctx.sources).toHaveLength(before.length + 5);
  });

  it('also detects suspension before a browser statechange notification arrives', () => {
    const value = audio(), ctx = prime(value); value.update(scene()); const before = [...ctx.sources];
    ctx.state = 'suspended'; value.update(scene()); expectStopped(before);
    expect(ctx.gains[0].gain.value).toBe(0); expect(ctx.resume).not.toHaveBeenCalled();
  });

  it('drops old scheduled sources when a gesture resumes before the interruption notification arrives', async () => {
    const value = audio(), ctx = prime(value); value.update(scene()); value.elevatorArrive();
    const before = [...ctx.sources]; ctx.state = 'suspended'; input(value);
    expectStopped(before); expect(ctx.resume).toHaveBeenCalledTimes(1);
    await flush(); value.update(scene()); expect(ctx.sources).toHaveLength(before.length + 5);
  });

  it.each(['reject', 'throw'] as const)('close is permanent/idempotent and disconnects everything even when context close will %s', async failure => {
    const value = audio(), ctx = prime(value); value.update(scene({ kind: 'pickup', speed: 4, throttle: 0.6 })); allEffects(value);
    if (failure === 'reject') ctx.close.mockImplementationOnce(() => Promise.reject(new Error('Close failed')));
    else ctx.close.mockImplementationOnce(() => { throw new Error('Close failed'); });
    expect(() => value.close()).not.toThrow(); await flush();
    expectStopped(ctx.sources); expect(ctx.nodes.every(node => node.connections.size === 0)).toBe(true);
    expect(ctx.onstatechange).toBeNull(); expect(ctx.gains[0].gain.value).toBe(0);
    value.close(); value.setEnabled(true); value.setPaused(false); input(value); value.update(scene()); allEffects(value);
    expect(ctx.close).toHaveBeenCalledTimes(1); expect(constructor).toHaveBeenCalledTimes(1);
  });

  it('keeps cleaning up other nodes after an individual stop or disconnect throws', () => {
    const value = audio(), ctx = prime(value); value.update(scene({ speed: 4, throttle: 1 }));
    ctx.sources[0].stop.mockImplementationOnce(() => { throw new Error('Already ended'); });
    ctx.nodes[1].disconnect.mockImplementationOnce(() => { throw new Error('Already disconnected'); });
    expect(() => value.close()).not.toThrow();
    for (const source of ctx.sources) expect(source.stop).toHaveBeenCalled();
    for (const node of ctx.nodes) expect(node.disconnect).toHaveBeenCalled();
    expect(ctx.close).toHaveBeenCalledTimes(1);
  });
});

describe('Villa audio bounded ownership and synthesis', () => {
  it('caps simultaneous one-shots and releases naturally ended or expired voices', () => {
    const value = audio(), ctx = prime(value); value.update(scene({ speed: 4, throttle: 1 }));
    for (let i = 0; i < 1000; i++) value.uiSelect();
    expect(ctx.sources).toHaveLength(8 + 24);
    const first = ctx.oscillators[2]; first.end();
    expect(first.connections.size).toBe(0); expect(first.onended).toBeNull();
    value.uiSelect(); expect(ctx.sources).toHaveLength(8 + 25);
    const oldVoices = ctx.sources.slice(8); ctx.currentTime += 1;
    value.update(scene()); value.uiSelect(); // Reaps even when onended never fires.
    for (const voice of oldVoices) expect(voice.connections.size).toBe(0);
    expect(ctx.sources).toHaveLength(8 + 26);
  });

  it('uses bounded 20 Hz mixer automation, skips unchanged targets, and never catches up a stalled frame', () => {
    const value = audio(), ctx = prime(value); value.update(scene({ kind: 'suv', speed: 4, throttle: 1 }));
    const pitch = ctx.oscillators[0].frequency, master = ctx.gains[0].gain;
    for (let i = 0; i < 1000; i++) { value.update(scene({ kind: 'suv', speed: 4, throttle: 1 })); input(value); }
    expect(pitch.setTargetAtTime).toHaveBeenCalledTimes(1); expect(master.setTargetAtTime).toHaveBeenCalledTimes(1);
    for (let frame = 1; frame <= 120; frame++) {
      ctx.currentTime = 10 + frame / 60;
      value.update(scene({ kind: 'suv', speed: 4 + frame / 20, throttle: 1 }));
    }
    expect(pitch.setTargetAtTime.mock.calls.length).toBeLessThanOrEqual(41);
    const count = pitch.setTargetAtTime.mock.calls.length;
    ctx.currentTime += 3600; value.update(scene({ kind: 'suv', speed: 1, throttle: 0 }));
    expect(pitch.setTargetAtTime).toHaveBeenCalledTimes(count + 1);
    expect(pitch.cancelScheduledValues.mock.calls.length).toBe(pitch.setTargetAtTime.mock.calls.length);
    expect(ctx.sources).toHaveLength(8);
  });

  it('bounds footstep/crackle scheduling by audio time, not render frequency', () => {
    const value = audio(), ctx = prime(value);
    const fireplace = { ...scene(), roomId: 'living', fireplace: true, fireDistance: 0 };
    for (let i = 0; i < 1000; i++) { value.update(fireplace); value.footstep(true); }
    expect(ctx.sources).toHaveLength(7); // Five loops, one crackle, one footstep.
    ctx.currentTime += 0.1; value.update(fireplace); value.footstep(true); expect(ctx.sources).toHaveLength(7);
    ctx.currentTime += 0.21; value.update(fireplace); value.footstep(true); expect(ctx.sources).toHaveLength(9);
  });

  it('gives every effect a short scheduled stop and disconnects its graph onended', () => {
    const value = audio(), ctx = prime(value); allEffects(value);
    expect(ctx.sources.length).toBeGreaterThan(10);
    for (const source of ctx.sources) {
      expect(source.stop).toHaveBeenCalledTimes(1);
      expect(source.stop.mock.calls[0][0]).toBeLessThanOrEqual(ctx.currentTime + 0.43);
      expect(source.stop.mock.calls[0][0]).toBeGreaterThan(ctx.currentTime);
      source.end(); expect(source.connections.size).toBe(0);
    }
    expect(ctx.nodes.slice(1).every(node => node.connections.size === 0)).toBe(true);
  });

  it.each([
    ['car', 'sine', 150, 0], ['scooter', 'sine', 230, 0],
    ['suv', 'sawtooth', 40, 0.08], ['pickup', 'sawtooth', 30, 0.1],
  ] as const)('distinguishes %s motor timbre and idle level', (kind: VillaAudioEngineKind, type, frequency, idle) => {
    const value = audio(), ctx = prime(value); value.update(scene({ kind, speed: 0, throttle: 0 }));
    expect(ctx.oscillators[0].type).toBe(type); expect(ctx.oscillators[0].frequency.value).toBe(frequency);
    expect(ctx.oscillators[0].pitchAtStart).toBe(frequency); // Never starts at default 440 Hz.
    expect(ctx.gains.at(-2)!.gain.value).toBe(idle); expect(ctx.gains.at(-1)!.gain.value).toBe(0);
    ctx.currentTime += 0.1; value.update(scene({ kind, speed: 4, throttle: 1 }));
    expect(ctx.oscillators[0].frequency.value).toBeGreaterThan(frequency);
    expect(ctx.gains.at(-2)!.gain.value).toBeGreaterThan(idle); expect(ctx.gains.at(-1)!.gain.value).toBeGreaterThan(0);
  });

  it('defaults to the electric sedan and stops old vehicle/road sources immediately on change or dismount', () => {
    const value = audio(), ctx = prime(value); value.update(scene({ speed: 4, throttle: 1 }));
    const sedan = ctx.sources.slice(5); expect(ctx.oscillators[0].type).toBe('sine');
    value.update(scene({ kind: 'pickup', speed: 4, throttle: 1 }));
    expectStopped(sedan); expect(ctx.sources).toHaveLength(11);
    const pickup = ctx.sources.slice(8); value.update(scene()); expectStopped(pickup);
    expect(ctx.sources).toHaveLength(11); // No time advance needed for dismount.
  });

  it('clamps non-finite/out-of-range snapshots and snooker strength before WebAudio automation', () => {
    const value = audio(), ctx = prime(value);
    for (const invalid of [NaN, Infinity, -Infinity, -1000, 1000]) {
      ctx.currentTime += 0.1;
      value.update({ ...scene({ kind: 'suv', speed: invalid, throttle: invalid }), rain: invalid, poolDistance: invalid, fireplace: true, fireDistance: invalid });
      value.snookerHit(invalid);
    }
    expect(ctx.gains[0].gain.value).toBe(0.55); // Invalid automation would silence the graph.
    expect(ctx.oscillators[0].frequency.value).toBeLessThanOrEqual(336);
    for (const gain of ctx.gains) for (const [level] of gain.gain.setValueAtTime.mock.calls) {
      expect(Number.isFinite(level)).toBe(true); expect(level).toBeGreaterThanOrEqual(0); expect(level).toBeLessThanOrEqual(0.3 + Number.EPSILON);
    }
  });

  it('attenuates pool and fireplace leakage into unrelated indoor rooms', () => {
    const value = audio(), ctx = prime(value);
    value.update({ ...scene(), roomId: 'living', fireDistance: 0, fireplace: true });
    const indoorWater = ctx.gains[3].gain.value, livingFire = ctx.gains[4].gain.value;
    ctx.currentTime += 0.1; value.update({ ...scene(), roomId: 'master', fireDistance: 0, fireplace: true });
    expect(ctx.gains[4].gain.value).toBeLessThan(livingFire / 10);
    ctx.currentTime += 0.1; value.update(scene()); expect(ctx.gains[3].gain.value).toBeGreaterThan(indoorWater * 4);
  });
});

describe('Villa audio optional-browser and graph failures', () => {
  it('is harmless without WebAudio and supports the WebKit constructor fallback', () => {
    vi.stubGlobal('window', {}); const value = audio(); expect(() => prime(value)).not.toThrow();
    expect(constructor).not.toHaveBeenCalled();
    vi.stubGlobal('window', { webkitAudioContext: constructor }); prime(value); value.update(scene());
    expect(Context.instances[0].sources).toHaveLength(5);
  });

  it('contains constructor failure and never retries outside a fresh gesture', () => {
    constructor.mockImplementationOnce(() => { throw new Error('Too many contexts'); });
    const value = audio(); expect(() => input(value)).not.toThrow();
    value.update(scene()); allEffects(value); expect(constructor).toHaveBeenCalledTimes(1);
    prime(value); value.update(scene()); expect(constructor).toHaveBeenCalledTimes(2);
  });

  it('closes and disconnects a partially initialized context, allowing a later gesture to retry', () => {
    failBuffer = true; const value = audio(); input(value); const failed = Context.instances[0];
    expect(failed.close).toHaveBeenCalledTimes(1); expect(failed.gains[0].connections.size).toBe(0);
    value.update(scene()); expect(constructor).toHaveBeenCalledTimes(1);
    failBuffer = false; const ctx = prime(value); value.update(scene());
    expect(constructor).toHaveBeenCalledTimes(2); expect(ctx.sources).toHaveLength(5);
  });

  it.each(['ambience', 'engine', 'effect'] as const)('stops and disconnects a partially constructed %s graph without a render retry loop', kind => {
    const value = audio(), ctx = prime(value);
    if (kind === 'ambience') ctx.createBiquadFilter.mockImplementationOnce(() => { throw new Error('Filter unavailable'); });
    if (kind === 'engine') {
      value.update(scene()); ctx.currentTime += 0.1;
      ctx.createOscillator.mockImplementationOnce(() => { throw new Error('Oscillator unavailable'); });
    }
    if (kind === 'effect') {
      ctx.createGain.mockImplementationOnce(() => { throw new Error('Gain unavailable'); }); value.uiSelect();
    } else value.update(scene({ speed: 4, throttle: 1 }));
    expect(ctx.gains[0].gain.value).toBe(0);
    expect(ctx.nodes.slice(1).every(node => node.connections.size === 0)).toBe(true); expectStopped(ctx.sources);
    const count = ctx.nodes.length;
    for (let i = 0; i < 100; i++) { value.update(scene({ speed: 4, throttle: 1 })); allEffects(value); }
    expect(ctx.nodes).toHaveLength(count);
    input(value); value.update(scene()); expect(ctx.sources.length).toBeGreaterThan(0);
    expect(ctx.gains[0].gain.value).toBe(0.55);
  });
});
