/*
 * Synthesized Gacha sound kit, voiced after the CS:GO case opening.
 *
 * What makes it feel premium rather than toy-like:
 *  - a synthesized convolution reverb bus gives every voice real space,
 *  - a master compressor glues layers and absorbs stacked peaks,
 *  - voices carry low-end body, stereo width, and staggered partials,
 *  - a continuous friction whoosh follows strip speed under the ratchet.
 *
 * All sounds are generated with WebAudio and failures are intentionally
 * ignored so audio policy never breaks gameplay.
 */

export class GachaSfx {
  enabled = true;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private whoosh: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null = null;

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

        // Master bus → gentle glue compressor → out.
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -20;
        comp.knee.value = 14;
        comp.ratio.value = 3.5;
        comp.attack.value = 0.004;
        comp.release.value = 0.12;
        comp.connect(this.ctx.destination);
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.34;
        this.master.connect(comp);

        // Reverb send bus: exponentially decaying stereo noise impulse,
        // channels decorrelated for natural width.
        const irSeconds = 1.7;
        const irLen = Math.floor(this.ctx.sampleRate * irSeconds);
        const ir = this.ctx.createBuffer(2, irLen, this.ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
          const data = ir.getChannelData(ch);
          let seed = ch * 7919 + 13;
          for (let i = 0; i < irLen; i++) {
            seed = (seed * 16807) % 2147483647;
            const rand = (seed / 2147483647) * 2 - 1;
            data[i] = rand * Math.pow(1 - i / irLen, 2.6);
          }
        }
        this.reverb = this.ctx.createConvolver();
        this.reverb.buffer = ir;
        const wetOut = this.ctx.createGain();
        wetOut.gain.value = 0.8;
        this.reverb.connect(wetOut);
        wetOut.connect(this.master);

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

  /** Fast-attack, exponential-decay voice: env → pan → dry master + wet send. */
  private voice(t0: number, peak: number, attack: number, decay: number, pan = 0, wet = 0): AudioNode | null {
    const ctx = this.ctx;
    if (!ctx || !this.master) return null;
    try {
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
      let out: AudioNode = gain;
      if (pan !== 0) {
        const panner = ctx.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, pan));
        gain.connect(panner);
        out = panner;
      }
      out.connect(this.master);
      if (wet > 0 && this.reverb) {
        const send = ctx.createGain();
        send.gain.value = wet;
        out.connect(send);
        send.connect(this.reverb);
      }
      return gain;
    } catch {
      return null;
    }
  }

  /** Pitched voice with a soft onset and natural decay. */
  private ping(
    freq: number,
    opts: { vol: number; dur: number; delay?: number; type?: OscillatorType; slideTo?: number; pan?: number; wet?: number },
  ) {
    const ctx = this.ensure();
    if (!ctx) return;
    try {
      const t0 = ctx.currentTime + (opts.delay ?? 0);
      const dest = this.voice(t0, opts.vol, 0.008, opts.dur, opts.pan ?? 0, opts.wet ?? 0);
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
  private hush(opts: {
    vol: number; dur: number; from: number; to?: number;
    type?: BiquadFilterType; delay?: number; q?: number; pan?: number; wet?: number;
  }) {
    const ctx = this.ensure();
    if (!ctx || !this.noiseBuffer) return;
    try {
      const t0 = ctx.currentTime + (opts.delay ?? 0);
      const dest = this.voice(t0, opts.vol, 0.006, opts.dur, opts.pan ?? 0, opts.wet ?? 0);
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
  private chime(freq: number, vol: number, dur: number, delay: number, pan = 0, wet = 0.35) {
    this.ping(freq, { vol, dur, delay, type: 'sine', pan, wet });
    this.ping(freq * 2, { vol: vol * 0.42, dur: dur * 0.85, delay: delay + 0.012, type: 'triangle', pan: -pan * 0.6, wet });
    this.ping(freq * 3, { vol: vol * 0.13, dur: dur * 0.6, delay: delay + 0.02, type: 'sine', pan: pan * 0.5, wet: wet * 1.1 });
  }

  /**
   * Reel ratchet — dry, snappy, with a woody body knock. Intensity 0..1
   * follows strip speed; pitch and stereo jitter keep it organic.
   */
  tick(intensity = 1) {
    const v = Math.min(1, Math.max(0, intensity));
    const j = 0.96 + Math.random() * 0.08;
    const pan = (Math.random() * 2 - 1) * 0.12;
    this.hush({ vol: 0.13 + 0.12 * v, dur: 0.016, from: (3000 + 900 * v) * j, q: 7, pan, wet: 0.04 });
    this.ping((1650 + 650 * v) * j, { vol: 0.075 + 0.07 * v, dur: 0.02, type: 'triangle', pan, wet: 0.04 });
    this.ping(330 * j, { vol: 0.045 + 0.035 * v, dur: 0.016, pan, wet: 0.03 });
  }

  /** Case latch, two-stage like a real key turn: catch → heavy latch → air. */
  caseOpen() {
    // Stage 1: the key catch
    this.hush({ vol: 0.2, dur: 0.02, from: 7000, type: 'highpass', wet: 0.06 });
    this.ping(4600, { vol: 0.055, dur: 0.028, pan: 0.15 });
    // Stage 2: the heavy latch giving way
    this.ping(118, { vol: 0.5, dur: 0.17, slideTo: 46, delay: 0.07, wet: 0.12 });
    this.hush({ vol: 0.24, dur: 0.055, from: 950, q: 2, delay: 0.07, wet: 0.08 });
    // Air release as the lid breathes open
    this.hush({ vol: 0.15, dur: 0.38, from: 700, to: 2400, delay: 0.1, q: 1.3, wet: 0.18 });
  }

  /** Continuous friction whoosh under the ratchet; follows strip speed. */
  spinStart() {
    const ctx = this.ensure();
    if (!ctx || !this.noiseBuffer || !this.master) return;
    this.spinStop();
    try {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 480;
      filter.Q.value = 0.7;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      src.start();
      this.whoosh = { src, gain, filter };
    } catch {
      this.whoosh = null;
    }
  }

  /** Speed 0..1 → whoosh loudness and brightness, smoothed per frame. */
  spinSet(speed: number) {
    if (!this.whoosh || !this.ctx) return;
    try {
      const v = Math.min(1, Math.max(0, speed));
      const t = this.ctx.currentTime;
      this.whoosh.gain.gain.setTargetAtTime(0.015 + 0.11 * v, t, 0.03);
      this.whoosh.filter.frequency.setTargetAtTime(380 + 2100 * v, t, 0.05);
    } catch {
      // best-effort
    }
  }

  spinStop() {
    if (!this.whoosh) return;
    try {
      if (this.ctx) {
        const t = this.ctx.currentTime;
        this.whoosh.gain.gain.setTargetAtTime(0, t, 0.09);
        this.whoosh.src.stop(t + 0.4);
      }
    } catch {
      // best-effort
    }
    this.whoosh = null;
  }

  /** Strip stop: heavy settle with a muted final clack. */
  land() {
    this.spinStop();
    this.ping(150, { vol: 0.5, dur: 0.18, slideTo: 44, wet: 0.15 });
    this.hush({ vol: 0.22, dur: 0.05, from: 1300, q: 2.5, delay: 0.05, wet: 0.1 });
    this.ping(210, { vol: 0.13, dur: 0.07, slideTo: 85, delay: 0.085 });
  }

  /**
   * Prize fanfare after a beat of silence (the CS:GO pause), scaled by
   * tier 0..4 (blue → gold). Higher tiers: longer rising arpeggios over a
   * cinematic boom with wide shimmer tails. Gold earns a reverse riser and
   * a detuned brass sting.
   */
  reveal(tierIndex: number) {
    const i = Math.min(4, Math.max(0, tierIndex));
    const t0 = 0.16; // the held breath after the strip stops
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5]; // C5 E5 G5 C6 E6
    const count = [1, 2, 3, 4, 5][i];
    for (let n = 0; n < count; n++) {
      const pan = n % 2 === 0 ? 0.18 : -0.18;
      this.chime(notes[n], 0.15 + 0.02 * i, 0.6 + 0.09 * i, t0 + n * 0.085, pan);
    }
    if (i >= 2) this.hush({ vol: 0.06 + 0.03 * i, dur: 0.45 + 0.1 * i, from: 5200, to: 8600, type: 'highpass', delay: t0 + 0.1, wet: 0.4 });
    if (i >= 3) {
      // Cinematic foundation boom + low octave root.
      this.ping(62, { vol: 0.34, dur: 0.85, slideTo: 30, delay: t0, wet: 0.45 });
      this.hush({ vol: 0.12, dur: 0.3, from: 220, q: 1.2, delay: t0, wet: 0.3 });
      this.chime(notes[0] / 2, 0.12, 0.8, t0, 0, 0.4);
    }
    if (i >= 4) {
      // Reverse riser cresting into the arpeggio.
      this.hush({ vol: 0.13, dur: 0.55, from: 320, to: 4200, delay: 0.03, q: 1.6, wet: 0.3 });
      // Brass sting: three detuned saws + fifth through an opening lowpass,
      // spread across the stereo field.
      const ctx = this.ensure();
      if (ctx && this.master) {
        try {
          const s = ctx.currentTime + t0;
          for (const [detune, pan] of [[-4, -0.3], [0, 0], [4, 0.3]] as const) {
            const dest = this.voice(s, 0.055, 0.09, 0.7, pan, 0.3);
            if (!dest) continue;
            const osc = ctx.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(130.8, s); // C3
            osc.detune.value = detune;
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.setValueAtTime(360, s);
            lp.frequency.exponentialRampToValueAtTime(2800, s + 0.55);
            osc.connect(lp);
            lp.connect(dest);
            osc.start(s);
            osc.stop(s + 0.85);
          }
          const fifth = this.voice(s, 0.04, 0.09, 0.6, 0, 0.3);
          if (fifth) {
            const osc = ctx.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(196, s); // G3
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.setValueAtTime(500, s);
            lp.frequency.exponentialRampToValueAtTime(2200, s + 0.5);
            osc.connect(lp);
            lp.connect(fifth);
            osc.start(s);
            osc.stop(s + 0.8);
          }
        } catch {
          // best-effort
        }
      }
      // Long sparkle tail, alternating across the field.
      this.ping(2093, { vol: 0.06, dur: 1.4, delay: t0 + 0.42, pan: 0.35, wet: 0.5 });
      this.ping(2637, { vol: 0.045, dur: 1.5, delay: t0 + 0.55, pan: -0.35, wet: 0.55 });
      this.ping(3136, { vol: 0.035, dur: 1.6, delay: t0 + 0.7, pan: 0.25, wet: 0.6 });
    }
  }

  click() {
    this.ping(880, { vol: 0.1, dur: 0.045, type: 'triangle' });
  }

  close() {
    this.spinStop();
    try {
      if (this.ctx && this.ctx.state !== 'closed') void this.ctx.close();
    } catch {
      // best-effort
    }
    this.ctx = null;
    this.master = null;
    this.reverb = null;
  }
}
