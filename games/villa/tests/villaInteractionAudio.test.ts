import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VillaAudio, type VillaAudioSnapshot } from '../src/villaAudio.js';
import { VILLA_INTERACTION_CUES, villaAudioDriveDirection, villaAudioProximity, type VillaInteractionCue } from '../src/villaInteractionAudio.js';

// Deliberately only a WebAudio control-plane double: no claims about listening
// quality or a real browser's autoplay policy are made by these unit tests.
class Param {
  value = 0;
  cancelScheduledValues = vi.fn();
  setValueAtTime = vi.fn((v: number) => { if (!Number.isFinite(v)) throw Error('Non-finite'); this.value = v; });
  setTargetAtTime = vi.fn((v: number) => { if (!Number.isFinite(v)) throw Error('Non-finite'); this.value = v; });
  exponentialRampToValueAtTime = vi.fn((v: number) => { if (!Number.isFinite(v)) throw Error('Non-finite'); this.value = v; });
}
class Node {
  connected = false;
  connect = vi.fn(() => { this.connected = true; });
  disconnect = vi.fn(() => { this.connected = false; });
}
class Gain extends Node { gain = new Param(); }
class Filter extends Node { frequency = new Param(); Q = new Param(); type = 'lowpass'; }
class Source extends Node {
  frequency = new Param(); type = 'sine'; buffer: unknown; loop = false; onended: (() => void) | null = null;
  start = vi.fn(); stop = vi.fn();
}
class Context {
  static instances: Context[] = [];
  currentTime = 5; sampleRate = 1000; state: AudioContextState = 'running'; destination = new Node(); onstatechange: (() => void) | null = null;
  sources: Source[] = []; oscillators: Source[] = []; gains: Gain[] = []; nodes: Node[] = [];
  constructor() { Context.instances.push(this); }
  createGain() { const n = new Gain(); this.gains.push(n); this.nodes.push(n); return n; }
  createBiquadFilter() { const n = new Filter(); this.nodes.push(n); return n; }
  createBufferSource() { const n = new Source(); this.sources.push(n); this.nodes.push(n); return n; }
  createOscillator() { const n = this.createBufferSource(); this.oscillators.push(n); return n; }
  createBuffer(_channels: number, length: number) { return { getChannelData: () => new Float32Array(length) }; }
  resume = vi.fn(async () => { this.state = 'running'; });
  close = vi.fn(async () => { this.state = 'closed'; });
}
let audios: VillaAudio[], activation: { isActive: boolean; hasBeenActive: boolean };
const gesture = (trusted = true) => ({ type: 'click', isTrusted: trusted }) as Event;
const scene = (extra: Partial<VillaAudioSnapshot> = {}): VillaAudioSnapshot => ({
  roomId: 'garden', poolDistance: 100, fireDistance: 100, fireplace: false, rain: 0, engine: null, ...extra,
});
function audio(prime = true) {
  const value = new VillaAudio(); audios.push(value);
  if (prime) { activation.isActive = true; value.prime(gesture()); activation.isActive = false; }
  return value;
}
function local(value: VillaAudio) { return value as unknown as { localLoops: Map<string, { gain: Gain; sources: Source[] }> }; }
function voices(value: VillaAudio) { return (value as unknown as { voices: Set<unknown> }).voices.size; }
const cues = Object.keys(VILLA_INTERACTION_CUES) as VillaInteractionCue[];
beforeEach(() => {
  audios = []; Context.instances = []; activation = { isActive: false, hasBeenActive: true };
  vi.stubGlobal('window', { AudioContext: Context }); vi.stubGlobal('navigator', { userActivation: activation });
});
afterEach(() => { for (const value of audios) value.close(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('semantic Villa cue score', () => {
  it.each(cues)('%s is short, quiet, bounded and releases every source on ended', id => {
    const value = audio(), ctx = Context.instances[0]; value.cue(id);
    expect(ctx.sources.length).toBeGreaterThan(0); expect(ctx.sources.length).toBeLessThanOrEqual(2);
    for (const part of VILLA_INTERACTION_CUES[id]) { expect(part.gain).toBeLessThanOrEqual(.1); expect(part.seconds).toBeLessThanOrEqual(.4); }
    for (const source of ctx.sources) {
      expect(source.stop).toHaveBeenCalledTimes(1);
      expect(source.stop.mock.calls[0][0]).toBeLessThanOrEqual(ctx.currentTime + .5);
      source.onended?.(); expect(source.connected).toBe(false); expect(source.onended).toBeNull();
    }
    expect(voices(value)).toBe(0);
    expect(ctx.nodes.slice(1).every(node => !node.connected)).toBe(true);
  });

  it('has different signatures for material, species, result and device families', () => {
    for (const family of [
      ['wardrobe-open', 'fridge-open', 'slide-open', 'grill-open'],
      ['feed-dog', 'feed-cat', 'feed-parrot', 'feed-rabbit', 'feed-fish'],
      ['tea-brew', 'tea-drink', 'tea-ready', 'tea-set-down'],
      ['sit', 'bed', 'stand', 'swing'], ['fire-on', 'fire-off', 'faucet-on', 'faucet-off'],
      ['reject', 'busy', 'elevator-call', 'elevator-select', 'park-arrive'],
    ] as VillaInteractionCue[][]) expect(new Set(family.map(id => JSON.stringify(VILLA_INTERACTION_CUES[id]))).size).toBe(family.length);
  });

  it('all new cues and local loops remain passive before trusted transient activation', () => {
    const value = audio(false);
    for (let i = 0; i < 50; i++) {
      for (const id of cues) value.cue(id);
      value.update(scene({ streamDistance: 0, faucetOn: true, faucetDistance: 0, elevator: { moving: true, distance: 0 }, engine: { kind: 'rally', speed: 60, throttle: 1 } }));
      value.prime(gesture()); // Trusted but expired activation is insufficient.
    }
    expect(Context.instances).toHaveLength(0);
    activation.isActive = true; value.prime(gesture(false)); expect(Context.instances).toHaveLength(0);
    value.prime(gesture()); expect(Context.instances).toHaveLength(1); expect(Context.instances[0].sources).toHaveLength(0);
  });

  it('drops new cues during pending resume and never replays them when it resolves', async () => {
    const value = audio(), ctx = Context.instances[0]; ctx.state = 'suspended'; ctx.onstatechange?.();
    let finish!: () => void;
    ctx.resume.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    activation.isActive = true; value.prime(gesture()); activation.isActive = false;
    for (const id of cues) value.cue(id);
    value.update(scene({ streamDistance: 0, faucetOn: true, faucetDistance: 0 }));
    expect(ctx.sources).toHaveLength(0); expect(ctx.resume).toHaveBeenCalledTimes(1);
    ctx.state = 'running'; finish(); await Promise.resolve(); await Promise.resolve();
    expect(ctx.sources).toHaveLength(0); value.update(scene()); expect(ctx.sources).toHaveLength(5);
  });

  it('keeps all families within the unchanged 24-source one-shot budget', () => {
    const value = audio(), ctx = Context.instances[0];
    for (let i = 0; i < 100; i++) for (const id of cues) value.cue(id);
    expect(voices(value)).toBe(24); expect(ctx.sources).toHaveLength(24);
    ctx.currentTime += 2; value.cue('tea-ready'); expect(voices(value)).toBe(2);
    expect(ctx.sources.slice(0, 24).every(source => !source.connected)).toBe(true);
  });

  it('attenuates spatial one-shots and never allocates inaudible/nonfinite cues', () => {
    const value = audio(), ctx = Context.instances[0];
    for (const d of [8, 100, Infinity, NaN]) value.cue('tea-ready', d, 8);
    expect(ctx.sources).toHaveLength(0);
    value.cue('tea-ready', 0, 8); const near = ctx.gains[1].gain.setValueAtTime.mock.calls[0][0];
    value.cue('tea-ready', 4, 8); const far = ctx.gains[3].gain.setValueAtTime.mock.calls[0][0];
    expect(far).toBeCloseTo(near / 4);
  });
});

describe('local stream, faucet, elevator and rally ownership', () => {
  it('allocates local loops lazily and stops them immediately inside the mix interval', () => {
    const value = audio(), ctx = Context.instances[0]; value.update(scene());
    expect(ctx.sources).toHaveLength(5); expect(local(value).localLoops.size).toBe(0);
    ctx.currentTime += .1; value.update(scene({ roomId: 'stream', streamDistance: 0, faucetOn: true, faucetDistance: 0, elevator: { moving: true, distance: 0 } }));
    expect(ctx.sources).toHaveLength(8); expect(local(value).localLoops.size).toBe(3);
    const added = ctx.sources.slice(5);
    expect(added.map(source => source.loop)).toEqual([true, true, false]);
    for (let i = 0; i < 200; i++) value.update(scene({ streamDistance: 0, faucetOn: true, faucetDistance: 0, elevator: { moving: true, distance: 0 } }));
    expect(ctx.sources).toHaveLength(8);
    value.update(scene()); expect(local(value).localLoops.size).toBe(0);
    for (const source of added) { expect(source.stop).toHaveBeenLastCalledWith(); expect(source.connected).toBe(false); }
  });

  it('uses 3D range and room attenuation, with independent stream and faucet gains', () => {
    const value = audio(), ctx = Context.instances[0];
    value.update(scene({ roomId: 'stream', streamDistance: 1 }));
    const near = local(value).localLoops.get('stream')!.gain.gain.value;
    ctx.currentTime += .1; value.update(scene({ roomId: 'master', streamDistance: Math.hypot(1, 5.25), faucetOn: true, faucetDistance: Math.hypot(1, 4) }));
    const distant = local(value).localLoops.get('stream')!.gain.gain.value;
    expect(distant).toBeLessThan(near / 10);
    const upstairsTap = local(value).localLoops.get('faucet')!.gain.gain.value;
    ctx.currentTime += .1; value.update(scene({ roomId: 'kitchen', faucetOn: true, faucetDistance: 1 }));
    expect(local(value).localLoops.has('stream')).toBe(false);
    expect(local(value).localLoops.get('faucet')!.gain.gain.value).toBeGreaterThan(upstairsTap * 20);
  });

  it.each(['mute', 'pause', 'close', 'interruption'] as const)('%s zeros the master and removes local loops, rally, and future semantic tones', action => {
    const value = audio(), ctx = Context.instances[0];
    value.update(scene({ roomId: 'stream', streamDistance: 0, faucetOn: true, faucetDistance: 0, elevator: { moving: true, distance: 0 }, engine: { kind: 'rally', speed: 50, throttle: 1 } }));
    value.cue('elevator-arrive'); const old = [...ctx.sources];
    expect(old).toHaveLength(13); // 5 ambience + 3 local + 3 rally + 2 bounded chime sources.
    if (action === 'mute') value.setEnabled(false);
    if (action === 'pause') value.setPaused(true);
    if (action === 'close') value.close();
    if (action === 'interruption') { ctx.state = 'suspended'; ctx.onstatechange?.(); }
    expect(ctx.gains[0].gain.value).toBe(0); expect(ctx.gains[0].gain.cancelScheduledValues).toHaveBeenLastCalledWith(0);
    expect(local(value).localLoops.size).toBe(0); expect(voices(value)).toBe(0);
    for (const source of old) { expect(source.stop).toHaveBeenLastCalledWith(); expect(source.connected).toBe(false); expect(source.onended).toBeNull(); }
    value.setEnabled(true); value.setPaused(false); ctx.state = 'running';
    value.update(scene({ streamDistance: 0 })); value.cue('tea-ready');
    expect(ctx.sources).toHaveLength(old.length); expect(ctx.resume).not.toHaveBeenCalled();
  });

  it.each(['car', 'pickup', 'suv', 'scooter', 'rally'] as const)('%s pitch progresses over the new speed envelope without runaway pitch', kind => {
    const value = audio(), ctx = Context.instances[0], pitch: number[] = [];
    for (const speed of [0, 7, 25, 45, 50, 500, NaN]) {
      ctx.currentTime += .1; value.update(scene({ engine: { kind, speed, throttle: .5, maxSpeed: 50 } }));
      pitch.push(ctx.oscillators[0].frequency.value);
    }
    expect(pitch[1]).toBeGreaterThan(pitch[0]); expect(pitch[2]).toBeGreaterThan(pitch[1]); expect(pitch[3]).toBeGreaterThan(pitch[2]);
    expect(pitch[4]).toBeGreaterThan(pitch[3]); expect(pitch[5]).toBe(pitch[4]); expect(pitch[6]).toBe(pitch[0]);
    expect(Math.max(...pitch)).toBeLessThan(1100);
  });

  it.each(['stream', 'faucet', 'elevator'] as const)('a partial %s loop failure cleans its nodes and does not retry on frames', id => {
    const value = audio(), ctx = Context.instances[0]; value.update(scene()); ctx.currentTime += .1;
    vi.spyOn(ctx, 'createBiquadFilter').mockImplementationOnce(() => { throw Error('Device unavailable'); });
    const snapshot = scene(id === 'stream' ? { streamDistance: 0 } : id === 'faucet' ? { faucetOn: true, faucetDistance: 0 } : { elevator: { moving: true, distance: 0 } });
    value.update(snapshot); expect(ctx.gains[0].gain.value).toBe(0);
    expect(ctx.nodes.slice(1).every(node => !node.connected)).toBe(true); expect(local(value).localLoops.size).toBe(0);
    const count = ctx.nodes.length; for (let i = 0; i < 100; i++) value.update(snapshot);
    expect(ctx.nodes).toHaveLength(count); expect(ctx.resume).not.toHaveBeenCalled();
  });

  it('keeps the maximum at 35 live sources and 104 nodes with every layer active', () => {
    const value = audio(), ctx = Context.instances[0];
    value.update(scene({ streamDistance: 0, faucetOn: true, faucetDistance: 0, elevator: { moving: true, distance: 0 }, engine: { kind: 'rally', speed: 50, throttle: 1 } }));
    for (let i = 0; i < 100; i++) value.cue('bed');
    expect(ctx.sources.filter(source => source.connected)).toHaveLength(35);
    expect(ctx.nodes.filter(node => node.connected)).toHaveLength(104);
  });
});

it('pure proximity/direction helpers clamp invalid snapshots and do not call stopped neutral a gearshift', () => {
  expect(villaAudioProximity(-1, 8)).toBe(1); expect(villaAudioProximity(NaN, 8)).toBe(0); expect(villaAudioProximity(1, 0)).toBe(0);
  expect([NaN, Infinity, -.1, 0, .1, -1, 1].map(villaAudioDriveDirection)).toEqual([0, 0, 0, 0, 0, -1, 1]);
});
