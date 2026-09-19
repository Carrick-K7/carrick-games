/** Asset-free WebAudio sound kit. Only prime() may create/resume a context;
 * simulation and sound effects must remain safe before any user interaction. */

export type VillaAudioEngineKind = 'car' | 'scooter' | 'suv' | 'pickup';
export interface VillaAudioEngine {
  speed: number;
  throttle: number;
  /** The sedan and scooter are electric. Omitted kinds retain the sedan default. */
  kind?: VillaAudioEngineKind;
}
export interface VillaAudioSnapshot {
  /** Room id from villaRoomAt for the listener's ground position. */
  roomId: string;
  /** Metres from the pool centre (large when far away). */
  poolDistance: number;
  /** Metres from the living-room fireplace, including floor height. */
  fireDistance: number;
  fireplace: boolean;
  /** 0..1 rain level from the home state. */
  rain: number;
  /** Current vehicle; null on foot. */
  engine: VillaAudioEngine | null;
}

interface AudioGraph { sources: AudioScheduledSourceNode[]; nodes: AudioNode[] }
interface Voice extends AudioGraph { endsAt: number }
interface Engine extends AudioGraph {
  kind: VillaAudioEngineKind;
  gain: GainNode;
  osc: OscillatorNode;
  sub: OscillatorNode;
  road: GainNode;
  filter: BiquadFilterNode;
}
const OUTDOOR_ROOMS = new Set(['garden', 'fields', 'driving-course', 'pond', 'terrace', 'balcony']);
const GESTURES = new Set(['keydown', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'click']);
const MAX_VOICES = 24;
const MIX_INTERVAL = 1 / 20;
const clamp01 = (v: number) => Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
const proximity = (distance: number, radius: number) => Number.isFinite(distance) ? clamp01(1 - Math.max(0, distance) / radius) : 0;
const graph = (): AudioGraph => ({ sources: [], nodes: [] });
function own<T extends AudioNode>(owner: AudioGraph, node: T): T { owner.nodes.push(node); return node; }
function source<T extends AudioScheduledSourceNode>(owner: AudioGraph, node: T): T {
  owner.sources.push(node); return own(owner, node);
}
function disposeGraph(owner: AudioGraph, stop = true) {
  for (const node of owner.sources) {
    node.onended = null;
    if (stop) try { node.stop(); } catch { /* May already have ended. */ }
  }
  for (const node of owner.nodes) try { node.disconnect(); } catch { /* Best effort even after device loss. */ }
  owner.sources.length = owner.nodes.length = 0;
}
function trustedGesture(event?: Event): boolean {
  const activation = typeof navigator !== 'undefined' ? navigator.userActivation : undefined;
  if (!event) return activation?.isActive === true;
  if (!event.isTrusted || !GESTURES.has(event.type)) return false;
  // Modern touchstart / non-mouse pointerdown are trusted but do not grant
  // transient activation. Resuming there can leave a policy-blocked promise
  // pending forever, preventing the later touchend from unlocking the context.
  // Older WebKit has no userActivation API; retain its native-event fallback.
  if (activation && activation.isActive !== true) return false;
  if (event.type === 'keydown') {
    const key = event as KeyboardEvent;
    if (key.repeat || key.key === 'Escape' || key.ctrlKey || key.metaKey || key.altKey) return false;
  }
  return true;
}

export class VillaAudio {
  private soundEnabled = true;
  private paused = false;
  private disposed = false;
  private playbackRequested = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private ambience: AudioGraph | null = null;
  private layers = new Map<string, GainNode>();
  private engine: Engine | null = null;
  private voices = new Set<Voice>();
  private targets = new WeakMap<AudioParam, number>();
  private resumePending: AudioContext | null = null;
  private lastMix = -Infinity;
  private lastStep = -Infinity;
  private nextCrackle = 0;

  get enabled() { return this.soundEnabled; }

  /** Call synchronously from a trusted input handler. Pass its native event for
   * browsers without userActivation (including older WebKit). Synthetic events,
   * autoplay/start/update calls and historical activation do not unlock audio. */
  prime(event?: Event) {
    if (this.disposed || !this.enabled || this.paused || !trustedGesture(event)) return;
    try {
      if (this.ctx?.state === 'closed') this.releaseContext();
      const ctx = this.ctx ?? this.createContext();
      if (!ctx) return;
      // An interruption may precede its statechange event; don't resume any
      // sources/envelopes left over from that earlier playback session.
      if (ctx.state !== 'running' && this.resumePending !== ctx) this.silence();
      this.playbackRequested = true;
      if (ctx.state === 'running') { this.openMaster(); return; }
      // One in-flight policy request, never a per-frame retry. A rejected
      // request can be retried by a later gesture, not by update or a sound.
      if (this.resumePending === ctx) return;
      this.resumePending = ctx;
      void ctx.resume().then(() => {
        if (this.resumePending === ctx) this.resumePending = null;
        if (this.ctx === ctx) this.openMaster();
      }).catch(() => {
        if (this.resumePending === ctx) this.resumePending = null;
        if (this.ctx === ctx) this.silence();
      });
    } catch {
      this.resumePending = null;
      this.silence();
    }
  }

  /** Enabling is passive: call prime() afterwards in the enabling gesture. */
  setEnabled(on: boolean) {
    if (this.soundEnabled === on) return;
    this.soundEnabled = on;
    if (!on) this.silence();
  }

  /** Use for shell/presentation pause, blur, hidden documents and game stop.
   * Clearing pause does not revive stale loops or queued effects; the next
   * trusted prime() and fresh update() restore the current scene's mix. */
  setPaused(paused: boolean) {
    if (this.paused === paused) return;
    this.paused = paused;
    if (paused) this.silence();
  }

  private createContext(): AudioContext | null {
    try {
      if (typeof window === 'undefined') return null;
      const AC: typeof AudioContext | undefined = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      const ctx = this.ctx = new AC();
      this.master = ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(ctx.destination);
      const len = Math.floor(ctx.sampleRate * 1.5);
      this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      // Pink-ish noise reads as wind/water better than white noise.
      let average = 0;
      for (let i = 0; i < len; i++) {
        average = average * 0.985 + (Math.random() * 2 - 1) * 0.015;
        data[i] = average * 8;
      }
      ctx.onstatechange = () => {
        // Device/interruption recovery must not replay pre-interruption sounds.
        if (this.ctx === ctx && ctx.state !== 'running') this.silence();
      };
      return ctx;
    } catch {
      this.releaseContext();
      return null;
    }
  }

  private activeContext(): AudioContext | null {
    if (this.disposed || !this.enabled || this.paused || !this.playbackRequested) return null;
    if (this.ctx?.state !== 'running') {
      // Updates during the gesture's pending resume must neither retry it nor
      // revoke that gesture. Unexpected suspension still tears down old work.
      if (!this.resumePending) this.silence();
      return null;
    }
    return this.ctx;
  }

  private openMaster() {
    const ctx = this.activeContext();
    if (!ctx || !this.master) return;
    try { this.target(this.master.gain, 0.55, ctx.currentTime, 0.02); }
    catch { this.silence(); }
  }

  private target(param: AudioParam, value: number, time: number, seconds: number, tolerance = 0.001) {
    if (Math.abs((this.targets.get(param) ?? Infinity) - value) < tolerance) return;
    // Replace future automation rather than accumulating a render-frame queue.
    param.cancelScheduledValues(time);
    param.setTargetAtTime(value, time, seconds);
    this.targets.set(param, value);
  }

  private silence() {
    this.playbackRequested = false;
    if (this.master) {
      const time = this.ctx?.currentTime ?? 0;
      try {
        // A previous setTargetAtTime may have started BEFORE currentTime. Clear
        // its whole timeline, then also reset the intrinsic value: scheduling
        // zero alone leaves Chromium's .value at the last rendered gain until
        // the next audio quantum (even though the zero event is already queued).
        this.master.gain.cancelScheduledValues(0);
        this.master.gain.value = 0;
        this.master.gain.setValueAtTime(0, time);
      } catch { try { this.master.gain.value = 0; } catch { /* Device already gone. */ } }
    }
    // Master zero is immediate, including the delayed second elevator chime.
    // Also stop/disconnect all work so unmuting cannot resurrect that queue.
    if (this.ambience) disposeGraph(this.ambience);
    this.ambience = null; this.layers.clear();
    if (this.engine) disposeGraph(this.engine);
    this.engine = null;
    for (const voice of this.voices) this.releaseVoice(voice);
    this.targets = new WeakMap();
    this.lastMix = this.lastStep = -Infinity; this.nextCrackle = 0;
  }

  private ensureAmbience(ctx: AudioContext) {
    if (this.ambience || !this.master || !this.noiseBuffer) return;
    const owner = this.ambience = graph();
    for (const [id, cutoff, q] of [['wind', 420, 0.6], ['rain', 2600, 0.5], ['water', 900, 1.6], ['fire', 340, 0.8], ['room', 190, 0.5]] as const) {
      const noise = source(owner, ctx.createBufferSource()); noise.buffer = this.noiseBuffer; noise.loop = true;
      const filter = own(owner, ctx.createBiquadFilter()); filter.type = 'lowpass'; filter.frequency.value = cutoff; filter.Q.value = q;
      const gain = own(owner, ctx.createGain()); gain.gain.value = 0;
      noise.connect(filter); filter.connect(gain); gain.connect(this.master);
      this.layers.set(id, gain); noise.start();
    }
  }

  /** Per-frame caller, with at most 20 Hz of mixer automation and no timers,
   * context creation/resume, effect backlog, or catch-up after a long stall. */
  update(s: VillaAudioSnapshot) {
    const ctx = this.activeContext();
    if (!ctx || !this.master) return;
    try {
      const kind = s.engine?.kind ?? 'car';
      // Leaving/changing a vehicle stops its loops even inside the mix interval.
      if (this.engine && (!s.engine || this.engine.kind !== kind)) {
        disposeGraph(this.engine); this.engine = null; this.lastMix = -Infinity;
      }
      const t = ctx.currentTime;
      this.pruneVoices(t);
      if (t - this.lastMix < MIX_INTERVAL) return;
      this.lastMix = t;
      this.ensureAmbience(ctx);
      const outdoor = OUTDOOR_ROOMS.has(s.roomId), rain = clamp01(s.rain);
      const fade = (id: string, value: number) => this.target(this.layers.get(id)!.gain, value, t, 0.45, 0.004);
      const breeze = 0.05 + 0.02 * Math.sin(t * 0.23) + 0.015 * Math.sin(t * 0.71 + 1.3);
      fade('wind', outdoor ? breeze * (1 - rain * 0.4) : breeze * 0.25);
      fade('rain', rain * (outdoor ? 0.16 : 0.05));
      const pool = proximity(s.poolDistance, 14);
      fade('water', pool * pool * 0.14 * (outdoor ? 1 : 0.2) * (0.85 + 0.15 * Math.sin(t * 0.9)));
      const fireNear = s.fireplace ? proximity(s.fireDistance, 7) * (s.roomId === 'living' ? 1 : 0.2) : 0;
      fade('fire', fireNear * fireNear * 0.2);
      if (t >= this.nextCrackle) {
        this.nextCrackle = t + 0.12 + Math.random() * 0.35;
        if (fireNear > 0.15) this.pop(600 + Math.random() * 1400, 0.03 + Math.random() * 0.05, fireNear * 0.12);
      }
      fade('room', !outdoor && s.roomId !== 'garage' ? 0.028 : 0.012);
      this.engineMix(s.engine, ctx);
    } catch { this.silence(); }
  }

  private createEngine(ctx: AudioContext, kind: VillaAudioEngineKind): Engine {
    const owner = graph(), electric = kind === 'car' || kind === 'scooter';
    try {
      const gain = own(owner, ctx.createGain()); gain.gain.value = 0;
      const filter = own(owner, ctx.createBiquadFilter()); filter.type = 'lowpass'; filter.frequency.value = electric ? 1800 : 320;
      const osc = source(owner, ctx.createOscillator()); osc.type = electric ? 'sine' : 'sawtooth';
      const sub = source(owner, ctx.createOscillator()); sub.type = electric ? 'sine' : 'triangle';
      // Set idle pitch before start: a default 440 Hz oscillator must not chirp
      // before the first speed target reaches the audio rendering thread.
      osc.frequency.value = electric ? (kind === 'scooter' ? 230 : 150) : (kind === 'pickup' ? 30 : 40);
      sub.frequency.value = osc.frequency.value * (electric ? 2 : 0.5);
      const road = own(owner, ctx.createGain()); road.gain.value = 0;
      const noise = source(owner, ctx.createBufferSource()); noise.buffer = this.noiseBuffer; noise.loop = true;
      const roadFilter = own(owner, ctx.createBiquadFilter()); roadFilter.type = 'bandpass'; roadFilter.frequency.value = electric ? 480 : 260; roadFilter.Q.value = 0.7;
      osc.connect(filter); sub.connect(filter); filter.connect(gain); gain.connect(this.master!);
      noise.connect(roadFilter); roadFilter.connect(road); road.connect(this.master!);
      osc.start(); sub.start(); noise.start();
      return { ...owner, kind, gain, filter, osc, sub, road };
    } catch (error) { disposeGraph(owner); throw error; }
  }

  private engineMix(drive: VillaAudioEngine | null, ctx: AudioContext) {
    if (!drive) return;
    const kind = drive.kind ?? 'car';
    const engine = this.engine ??= this.createEngine(ctx, kind);
    const speed = Number.isFinite(drive.speed) ? Math.min(40, Math.abs(drive.speed)) : 0;
    const throttle = clamp01(Math.abs(drive.throttle)), electric = kind === 'car' || kind === 'scooter';
    const scooter = kind === 'scooter', pickup = kind === 'pickup', t = ctx.currentTime;
    // Electric vehicles have a quiet speed-dependent motor whine, no combustion
    // idle. The pickup has a lower growl than the SUV. Tyre noise is independent.
    const frequency = electric ? (scooter ? 230 : 150) + speed * 24 + throttle * 45 : (pickup ? 30 : 40) + speed * 7 + throttle * 16;
    const motion = clamp01(speed / (scooter ? 4 : 8));
    this.target(engine.osc.frequency, frequency, t, 0.12, 0.5);
    this.target(engine.sub.frequency, frequency * (electric ? 2 : 0.5), t, 0.12, 0.5);
    this.target(engine.filter.frequency, electric ? 1300 + speed * 45 : 220 + speed * 26 + throttle * 160, t, 0.15, 1);
    this.target(engine.road.gain, clamp01(speed / 9) * (scooter ? 0.035 : 0.1), t, 0.2);
    this.target(engine.gain.gain, electric ? (motion * 0.045 + throttle * 0.02) * (scooter ? 0.75 : 1)
      : (pickup ? 0.1 : 0.08) + throttle * 0.08 + motion * 0.04, t, 0.15);
  }

  private releaseVoice(voice: Voice, stop = true) { this.voices.delete(voice); disposeGraph(voice, stop); }
  private pruneVoices(time: number) {
    for (const voice of this.voices) if (voice.endsAt <= time) this.releaseVoice(voice);
  }
  private newVoice(ctx: AudioContext, endsAt: number): Voice | null {
    this.pruneVoices(ctx.currentTime);
    if (this.voices.size >= MAX_VOICES) return null;
    const voice = { ...graph(), endsAt }; this.voices.add(voice); return voice;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo = 0, delay = 0) {
    const ctx = this.activeContext();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + delay, voice = this.newVoice(ctx, t0 + dur + 0.02);
    if (!voice) return;
    try {
      const osc = source(voice, ctx.createOscillator()), gain = own(voice, ctx.createGain());
      osc.type = type; osc.frequency.setValueAtTime(freq, t0);
      if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
      gain.gain.value = 0; gain.gain.setValueAtTime(vol, t0); gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain); gain.connect(this.master);
      osc.onended = () => this.releaseVoice(voice, false);
      osc.start(t0); osc.stop(voice.endsAt);
    } catch { this.releaseVoice(voice); this.silence(); }
  }

  private pop(cutoff: number, dur: number, vol: number) {
    const ctx = this.activeContext();
    if (!ctx || !this.master || !this.noiseBuffer) return;
    const t0 = ctx.currentTime, voice = this.newVoice(ctx, t0 + dur + 0.02);
    if (!voice) return;
    try {
      const noise = source(voice, ctx.createBufferSource()); noise.buffer = this.noiseBuffer;
      const filter = own(voice, ctx.createBiquadFilter()); filter.type = 'bandpass'; filter.frequency.value = cutoff; filter.Q.value = 2.2;
      const gain = own(voice, ctx.createGain()); gain.gain.setValueAtTime(vol, t0); gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      noise.connect(filter); filter.connect(gain); gain.connect(this.master);
      noise.onended = () => this.releaseVoice(voice, false);
      noise.start(t0, Math.random()); noise.stop(voice.endsAt);
    } catch { this.releaseVoice(voice); this.silence(); }
  }

  footstep(running: boolean) {
    const ctx = this.activeContext();
    if (!ctx || ctx.currentTime - this.lastStep < (running ? 0.26 : 0.38)) return;
    this.lastStep = ctx.currentTime;
    this.pop(running ? 900 : 640, 0.045, running ? 0.09 : 0.05);
  }

  /** Heavy vehicle door: latch clack plus the seal thud. */
  vehicleDoor(open: boolean) {
    this.pop(open ? 1500 : 900, 0.06, 0.16);
    this.tone(open ? 190 : 120, 0.09, 'square', 0.1, open ? 120 : 70, 0.02);
  }
  elevatorArrive() {
    this.tone(880, 0.16, 'sine', 0.16);
    this.tone(1320, 0.22, 'sine', 0.12, 0, 0.18);
  }
  elevatorMove() { this.pop(240, 0.3, 0.06); }
  lightClick() { this.pop(2600, 0.025, 0.12); }
  snookerHit(power: number) {
    const strength = clamp01(power);
    this.pop(3200, 0.05, 0.1 + strength * 0.2);
    this.tone(1200, 0.04, 'triangle', 0.08 + strength * 0.08);
  }
  splash() { this.pop(1200, 0.25, 0.22); this.pop(700, 0.4, 0.14); }
  uiSelect() { this.tone(620, 0.05, 'sine', 0.1, 820); }

  private releaseContext() {
    this.silence();
    const ctx = this.ctx;
    if (ctx) ctx.onstatechange = null;
    try { this.master?.disconnect(); } catch { /* Already disconnected. */ }
    this.ctx = null; this.master = null; this.noiseBuffer = null; this.resumePending = null;
    if (ctx && ctx.state !== 'closed') try { void ctx.close().catch(() => {}); } catch { /* Browser/device failure. */ }
  }

  /** Final disposal; stopped games should use setPaused(true) instead. */
  close() { this.disposed = true; this.releaseContext(); }
}
