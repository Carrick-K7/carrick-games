/** Synthesised villa sound kit. Every sound is generated with WebAudio from
 * noise/oscillator sources, so the release ships no audio assets and no
 * licensing questions. All failures are swallowed: audio policy, missing
 * browsers or suspended contexts must never break gameplay. */

export interface VillaAudioSnapshot {
  /** Room id from villaRoomAt for the listener's ground position. */
  roomId: string;
  /** Metres from the pool centre (large when far away). */
  poolDistance: number;
  /** Metres from the living-room fireplace. */
  fireDistance: number;
  fireplace: boolean;
  /** 0..1 rain level from the home state. */
  rain: number;
  /** True while driving (or riding) a vehicle; null on foot. */
  engine: { speed: number; throttle: number } | null;
}

const OUTDOOR_ROOMS = new Set(['garden', 'fields', 'driving-course', 'pond', 'terrace', 'balcony']);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export class VillaAudio {
  enabled = true;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private layers = new Map<string, { gain: GainNode; target: number }>();
  private engine: { gain: GainNode; osc: OscillatorNode; sub: OscillatorNode; road: GainNode; filter: BiquadFilterNode } | null = null;
  private lastStep = 0;
  private lastCrackle = 0;

  /** Call from a user gesture so autoplay policy allows playback. */
  prime() {
    this.ensure();
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!on) {
      for (const layer of this.layers.values()) this.fade(layer, 0);
      if (this.engine && this.master) this.engine.gain.gain.setTargetAtTime(0, this.ctx?.currentTime ?? 0, 0.08);
    }
  }

  private ensure(): AudioContext | null {
    if (!this.enabled) return null;
    try {
      if (!this.ctx) {
        const AC: typeof AudioContext | undefined =
          window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return null;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.55;
        this.master.connect(this.ctx.destination);
        const len = Math.floor(this.ctx.sampleRate * 1.5);
        this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = this.noiseBuffer.getChannelData(0);
        // Pink-ish noise (running average) reads as wind/water better than white.
        let average = 0;
        for (let i = 0; i < len; i++) {
          average = average * 0.985 + (Math.random() * 2 - 1) * 0.015;
          data[i] = average * 8;
        }
        for (const [id, cutoff, q] of [['wind', 420, 0.6], ['rain', 2600, 0.5], ['water', 900, 1.6], ['fire', 340, 0.8], ['room', 190, 0.5]] as const) {
          const source = this.ctx.createBufferSource();
          source.buffer = this.noiseBuffer;
          source.loop = true;
          const filter = this.ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = cutoff;
          filter.Q.value = q;
          const gain = this.ctx.createGain();
          gain.gain.value = 0;
          source.connect(filter); filter.connect(gain); gain.connect(this.master);
          source.start();
          this.layers.set(id, { gain, target: 0 });
        }
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  private fade(layer: { gain: GainNode; target: number }, value: number) {
    if (Math.abs(layer.target - value) < 0.004) return;
    layer.target = value;
    try { layer.gain.gain.setTargetAtTime(value, this.ctx?.currentTime ?? 0, 0.45); } catch { /* best-effort */ }
  }

  /** Per-frame ambience mix. Safe to call before prime() and every frame. */
  update(s: VillaAudioSnapshot) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    try {
      const outdoor = OUTDOOR_ROOMS.has(s.roomId);
      const t = ctx.currentTime;
      const breeze = 0.05 + 0.02 * Math.sin(t * 0.23) + 0.015 * Math.sin(t * 0.71 + 1.3);
      this.fade(this.layers.get('wind')!, outdoor ? breeze * (1 - s.rain * 0.4) : breeze * 0.25);
      this.fade(this.layers.get('rain')!, s.rain * (outdoor ? 0.16 : 0.05));
      const pool = clamp01(1 - s.poolDistance / 14);
      this.fade(this.layers.get('water')!, pool * pool * 0.14 * (0.85 + 0.15 * Math.sin(t * 0.9)));
      const fireNear = s.fireplace ? clamp01(1 - s.fireDistance / 7) : 0;
      this.fade(this.layers.get('fire')!, fireNear * fireNear * 0.2);
      if (fireNear > 0.15) {
        // Random crackle pops over the steady burn.
        if (t - this.lastCrackle > 0.06 && Math.random() < fireNear * 0.35) {
          this.lastCrackle = t;
          this.pop(600 + Math.random() * 1400, 0.03 + Math.random() * 0.05, fireNear * 0.12);
        }
      }
      this.fade(this.layers.get('room')!, !outdoor && s.roomId !== 'garage' ? 0.028 : 0.012);
      this.engineMix(s.engine);
    } catch {
      // best-effort
    }
  }

  private engineMix(drive: { speed: number; throttle: number } | null) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    try {
      if (!drive) {
        if (this.engine) this.engine.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
        return;
      }
      if (!this.engine) {
        const gain = ctx.createGain(); gain.gain.value = 0;
        const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 320;
        const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 42;
        const sub = ctx.createOscillator(); sub.type = 'triangle'; sub.frequency.value = 21;
        const road = ctx.createGain(); road.gain.value = 0;
        osc.connect(filter); sub.connect(filter); filter.connect(gain);
        const roadSource = ctx.createBufferSource(); roadSource.buffer = this.noiseBuffer; roadSource.loop = true;
        const roadFilter = ctx.createBiquadFilter(); roadFilter.type = 'bandpass'; roadFilter.frequency.value = 260; roadFilter.Q.value = 0.7;
        roadSource.connect(roadFilter); roadFilter.connect(road); road.connect(gain);
        gain.connect(this.master);
        osc.start(); sub.start(); roadSource.start();
        this.engine = { gain, osc, sub, road, filter };
      }
      const speed = Math.abs(drive.speed), throttle = clamp01(Math.abs(drive.throttle));
      const rpm = 38 + speed * 7 + throttle * 16;
      this.engine.osc.frequency.setTargetAtTime(rpm, ctx.currentTime, 0.12);
      this.engine.sub.frequency.setTargetAtTime(rpm / 2, ctx.currentTime, 0.12);
      this.engine.filter.frequency.setTargetAtTime(220 + speed * 26 + throttle * 160, ctx.currentTime, 0.15);
      this.engine.road.gain.setTargetAtTime(clamp01(speed / 9) * 0.5, ctx.currentTime, 0.2);
      this.engine.gain.gain.setTargetAtTime(0.1 + throttle * 0.1 + clamp01(speed / 12) * 0.06, ctx.currentTime, 0.15);
    } catch {
      // best-effort
    }
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo = 0, delay = 0) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    try {
      const t0 = ctx.currentTime + delay;
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain); gain.connect(this.master);
      osc.start(t0); osc.stop(t0 + dur + 0.02);
    } catch { /* best-effort */ }
  }

  private pop(cutoff: number, dur: number, vol: number) {
    const ctx = this.ensure();
    if (!ctx || !this.master || !this.noiseBuffer) return;
    try {
      const t0 = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = cutoff; filter.Q.value = 2.2;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filter); filter.connect(gain); gain.connect(this.master);
      src.start(t0, Math.random()); src.stop(t0 + dur + 0.02);
    } catch { /* best-effort */ }
  }

  footstep(running: boolean) {
    const now = performance.now();
    if (now - this.lastStep < (running ? 260 : 380)) return;
    this.lastStep = now;
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

  elevatorMove() {
    this.pop(240, 0.3, 0.06);
  }

  lightClick() {
    this.pop(2600, 0.025, 0.12);
  }

  snookerHit(power: number) {
    this.pop(3200, 0.05, 0.1 + power * 0.2);
    this.tone(1200, 0.04, 'triangle', 0.08 + power * 0.08);
  }

  splash() {
    this.pop(1200, 0.25, 0.22);
    this.pop(700, 0.4, 0.14);
  }

  uiSelect() {
    this.tone(620, 0.05, 'sine', 0.1, 820);
  }

  close() {
    try {
      if (this.ctx && this.ctx.state !== 'closed') void this.ctx.close();
    } catch { /* best-effort */ }
    this.ctx = null; this.master = null; this.layers.clear(); this.engine = null;
  }
}
