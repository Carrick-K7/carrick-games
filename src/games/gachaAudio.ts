/*
 * Synthesized Gacha sound kit. All sounds are generated with WebAudio and
 * failures are intentionally ignored so audio policy never breaks gameplay.
 */

export class GachaSfx {
  enabled = true;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  /** Call from a user gesture so autoplay policy allows playback. */
  prime() {
    this.ensure();
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
        this.master.gain.value = 0.3;
        this.master.connect(this.ctx.destination);
        const len = Math.floor(this.ctx.sampleRate * 0.5);
        this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo = 0, delay = 0) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    try {
      const t0 = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch {
      // Audio is best-effort; never break gameplay over it.
    }
  }

  private noise(dur: number, vol: number, cutoff: number, type: BiquadFilterType = 'lowpass', delay = 0) {
    const ctx = this.ensure();
    if (!ctx || !this.master || !this.noiseBuffer) return;
    try {
      const t0 = ctx.currentTime + delay;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = cutoff;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      src.start(t0);
      src.stop(t0 + dur + 0.02);
    } catch {
      // best-effort
    }
  }

  /** Reel tick; intensity 0..1 scales pitch and loudness with strip speed. */
  tick(intensity = 1) {
    const v = Math.min(1, Math.max(0, intensity));
    const f = 600 + 900 * v;
    this.tone(f, 0.03, 'square', 0.05 + 0.09 * v);
    this.noise(0.02, 0.03 + 0.05 * v, 3000 + 3000 * v, 'highpass');
  }

  /** Case latch opening: metallic clack + air whoosh. */
  caseOpen() {
    this.tone(520, 0.05, 'square', 0.18, 300);
    this.noise(0.18, 0.22, 900, 'bandpass');
    this.noise(0.3, 0.12, 4200, 'highpass', 0.05);
  }

  /** Strip lands on the prize: heavy clunk with a trailing knock. */
  land() {
    this.tone(180, 0.14, 'sine', 0.4, 60);
    this.noise(0.1, 0.2, 700);
    // Rear knock: the reel settles into its slot.
    this.tone(140, 0.08, 'sine', 0.22, 55, 0.1);
    this.noise(0.05, 0.12, 520, 'lowpass', 0.1);
  }

  /**
   * Rarity reveal fanfare; tierIndex 0..4 (blue → gold).
   * Higher tiers get longer, brighter chords.
   */
  reveal(tierIndex: number) {
    const i = Math.min(4, Math.max(0, tierIndex));
    const base = [440, 523, 587, 659, 784][i];
    this.tone(base, 0.35, 'sine', 0.24);
    if (i >= 1) this.tone(base * 1.25, 0.4, 'sine', 0.2, 0, 0.08);
    if (i >= 2) this.tone(base * 1.5, 0.5, 'triangle', 0.18, 0, 0.16);
    if (i >= 3) this.noise(0.5, 0.2, 3000, 'highpass', 0.1);
    if (i >= 4) {
      this.tone(base * 2, 0.7, 'sine', 0.2, 0, 0.26);
      this.tone(base * 2.5, 0.7, 'triangle', 0.14, 0, 0.34);
    }
  }

  click() {
    this.tone(760, 0.04, 'square', 0.12);
  }

  close() {
    try {
      if (this.ctx && this.ctx.state !== 'closed') void this.ctx.close();
    } catch {
      // best-effort
    }
    this.ctx = null;
    this.master = null;
  }
}
