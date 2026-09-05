/*
 * Synthesized Gacha sound kit, voiced after the CS:GO case opening:
 * a dry ratcheting tick while the strip runs, a mechanical latch clunk on
 * unlock, a decisive stop with a beat of silence, then a tier-scaled chime
 * arpeggio — gold earns a brass swell with a long sparkle tail.
 * All sounds are generated with WebAudio and failures are intentionally
 * ignored so audio policy never breaks gameplay.
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

  /** Fast-attack, exponential-decay envelope into the master bus. */
  private env(t0: number, peak: number, attack: number, decay: number): GainNode | null {
    const ctx = this.ctx;
    if (!ctx || !this.master) return null;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
    gain.connect(this.master);
    return gain;
  }

  /** Pitched voice with a soft onset and natural decay. */
  private ping(freq: number, opts: { vol: number; dur: number; delay?: number; type?: OscillatorType; slideTo?: number }) {
    const ctx = this.ensure();
    if (!ctx) return;
    try {
      const t0 = ctx.currentTime + (opts.delay ?? 0);
      const dest = this.env(t0, opts.vol, 0.008, opts.dur);
      if (!dest) return;
      const osc = ctx.createOscillator();
      osc.type = opts.type ?? 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.slideTo), t0 + opts.dur);
      osc.connect(dest);
      osc.start(t0);
      osc.stop(t0 + opts.dur + 0.05);
    } catch {
      // Audio is best-effort; never break gameplay over it.
    }
  }

  /** Filtered noise voice; optional frequency sweep for whooshes. */
  private hush(opts: { vol: number; dur: number; from: number; to?: number; type?: BiquadFilterType; delay?: number; q?: number }) {
    const ctx = this.ensure();
    if (!ctx || !this.noiseBuffer) return;
    try {
      const t0 = ctx.currentTime + (opts.delay ?? 0);
      const dest = this.env(t0, opts.vol, 0.006, opts.dur);
      if (!dest) return;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = opts.type ?? 'bandpass';
      filter.frequency.setValueAtTime(opts.from, t0);
      if (opts.to) filter.frequency.exponentialRampToValueAtTime(opts.to, t0 + opts.dur);
      filter.Q.value = opts.q ?? 1;
      src.connect(filter);
      filter.connect(dest);
      src.start(t0);
      src.stop(t0 + opts.dur + 0.05);
    } catch {
      // best-effort
    }
  }

  /** A premium chime note: fundamental + octave + fifth partials, staggered. */
  private chime(freq: number, vol: number, dur: number, delay: number) {
    this.ping(freq, { vol, dur, delay, type: 'sine' });
    this.ping(freq * 2, { vol: vol * 0.4, dur: dur * 0.8, delay: delay + 0.012, type: 'triangle' });
    this.ping(freq * 3, { vol: vol * 0.12, dur: dur * 0.55, delay: delay + 0.02, type: 'sine' });
  }

  /**
   * Reel ratchet — dry and clicky like the CS:GO strip. Intensity 0..1
   * follows strip speed; a small pitch jitter keeps it organic.
   */
  tick(intensity = 1) {
    const v = Math.min(1, Math.max(0, intensity));
    const jitter = 0.96 + Math.random() * 0.08;
    this.hush({ vol: 0.1 + 0.1 * v, dur: 0.024, from: (2400 + 900 * v) * jitter, q: 6 });
    this.ping((1450 + 550 * v) * jitter, { vol: 0.05 + 0.07 * v, dur: 0.018, type: 'triangle' });
  }

  /** Case latch: low thunk, metallic click, then the air release. */
  caseOpen() {
    this.ping(130, { vol: 0.42, dur: 0.13, slideTo: 52 });
    this.hush({ vol: 0.24, dur: 0.035, from: 6200, type: 'highpass', delay: 0.015 });
    this.ping(2350, { vol: 0.07, dur: 0.07, delay: 0.02 });
    this.hush({ vol: 0.16, dur: 0.3, from: 750, to: 2600, delay: 0.05, q: 1.4 });
  }

  /** Strip stop: heavy settle with a muted final clack. */
  land() {
    this.ping(150, { vol: 0.44, dur: 0.16, slideTo: 46 });
    this.hush({ vol: 0.2, dur: 0.05, from: 1300, delay: 0.055, q: 2.5 });
    this.ping(210, { vol: 0.13, dur: 0.07, slideTo: 85, delay: 0.085 });
  }

  /**
   * Prize fanfare after a beat of silence (the CS:GO pause), scaled by
   * tier 0..4 (blue → gold). Higher tiers: longer rising arpeggios, a low
   * boom, and a shimmer tail. Gold adds the brass knife-sting swell.
   */
  reveal(tierIndex: number) {
    const i = Math.min(4, Math.max(0, tierIndex));
    const t0 = 0.16; // the held breath after the strip stops
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5]; // C5 E5 G5 C6 E6
    const count = [1, 2, 3, 4, 5][i];
    for (let n = 0; n < count; n++) {
      this.chime(notes[n], 0.15 + 0.02 * i, 0.55 + 0.08 * i, t0 + n * 0.085);
    }
    if (i >= 2) this.hush({ vol: 0.07 + 0.03 * i, dur: 0.4 + 0.1 * i, from: 5200, to: 8400, type: 'highpass', delay: t0 + 0.1 });
    if (i >= 3) {
      this.ping(88, { vol: 0.3, dur: 0.5, slideTo: 42, delay: t0 });
      this.chime(notes[0] / 2, 0.12, 0.7, t0); // low octave foundation
    }
    if (i >= 4) {
      // Brass swell: sawtooth opening through a lowpass, then sparkle tail.
      const ctx = this.ensure();
      if (ctx && this.master) {
        try {
          const s = ctx.currentTime + t0;
          const dest = this.env(s, 0.16, 0.09, 0.6);
          if (dest) {
            const osc = ctx.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(130.8, s); // C3
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.setValueAtTime(380, s);
            lp.frequency.exponentialRampToValueAtTime(2600, s + 0.5);
            osc.connect(lp);
            lp.connect(dest);
            osc.start(s);
            osc.stop(s + 0.75);
          }
        } catch {
          // best-effort
        }
      }
      this.ping(2093, { vol: 0.06, dur: 1.3, delay: t0 + 0.42 });
      this.ping(2637, { vol: 0.045, dur: 1.4, delay: t0 + 0.55 });
    }
  }

  click() {
    this.ping(880, { vol: 0.1, dur: 0.045, type: 'triangle' });
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
