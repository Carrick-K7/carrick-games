/*
 * Gacha sound engine: recorded CC0 case-opening kit played through a WebAudio
 * graph — master bus → glue compressor, with a convolution reverb send so the
 * metal and bells sit in a real space. Continuous strip friction is a looped
 * rattle recording plus a speed-tracked noise whoosh.
 *
 * The recorded kit is loaded from the game's own release assets through the
 * host's assetUrl; until it arrives (or if it never does) the engine falls
 * back to synthesized voices so a pull is never silent. Every failure path is
 * swallowed: audio policy must never break gameplay.
 *
 * Sample provenance: games/gacha/public/CREDITS.md
 */

import {
  GACHA_AUDIO_SAMPLES,
  GACHA_CASE_OPEN,
  GACHA_SPIN_RATTLE,
  GACHA_STRIP_LAND,
  GACHA_UI_CLICK,
  revealLayers,
  samplePath,
  tickLayers,
  type GachaSample,
  type GachaSampleLayer,
} from './gachaAudioKit.js';

type AssetUrl = (relativePath: string) => string;

export class GachaSfx {
  enabled = true;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private whoosh: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
  private rattle: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private assetUrl: AssetUrl | null = null;
  private readonly buffers = new Map<GachaSample, AudioBuffer>();
  private readonly reversed = new Map<GachaSample, AudioBuffer>();
  private loadPromise: Promise<void> | null = null;
  private tickStep = 0;

  /** Host asset resolution; wire this once from the game instance. */
  setAssetUrl(assetUrl: AssetUrl) {
    this.assetUrl = assetUrl;
  }

  /** Call from a user gesture so autoplay policy allows playback. */
  prime() {
    this.ensure();
    this.preload();
  }

  /** Fetch and decode the recorded kit once; safe to call repeatedly. */
  preload() {
    const ctx = this.ensure();
    if (!ctx || !this.assetUrl || this.loadPromise || this.buffers.size > 0) return;
    const url = this.assetUrl;
    this.loadPromise = Promise.all(GACHA_AUDIO_SAMPLES.map(async (sample) => {
      try {
        const response = await fetch(url(samplePath(sample)));
        if (!response.ok) return;
        const bytes = await response.arrayBuffer();
        const buffer = await ctx.decodeAudioData(bytes);
        this.buffers.set(sample, buffer);
      } catch {
        // Missing sample: this voice keeps its synthesized fallback.
      }
    })).then(() => {
      // Nothing decoded (offline, or every request failed): allow a later retry
      // instead of staying on the fallback voices for the whole session.
      if (this.buffers.size === 0) this.loadPromise = null;
    });
  }

  private ensure(): AudioContext | null {
    if (!this.enabled) return null;
    try {
      if (!this.ctx) {
        const AC: typeof AudioContext | undefined =
          window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return null;
        this.ctx = new AC();

        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.knee.value = 12;
        comp.ratio.value = 3;
        comp.attack.value = 0.004;
        comp.release.value = 0.15;
        comp.connect(this.ctx.destination);
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(comp);

        // Reverb send: exponentially decaying, decorrelated stereo noise.
        const seconds = 1.7;
        const length = Math.floor(this.ctx.sampleRate * seconds);
        const ir = this.ctx.createBuffer(2, length, this.ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
          const data = ir.getChannelData(ch);
          let seed = ch * 7919 + 13;
          for (let i = 0; i < length; i++) {
            seed = (seed * 16807) % 2147483647;
            data[i] = (seed / 2147483647 * 2 - 1) * Math.pow(1 - i / length, 2.6);
          }
        }
        this.reverb = this.ctx.createConvolver();
        this.reverb.buffer = ir;
        const wetOut = this.ctx.createGain();
        wetOut.gain.value = 0.8;
        this.reverb.connect(wetOut);
        wetOut.connect(this.master);

        const noiseLength = Math.floor(this.ctx.sampleRate * 0.5);
        this.noiseBuffer = this.ctx.createBuffer(1, noiseLength, this.ctx.sampleRate);
        const noise = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < noiseLength; i++) noise[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  /** Reversed copy of a decoded sample, built once and cached. */
  private reversedBuffer(sample: GachaSample): AudioBuffer | null {
    const ctx = this.ctx;
    const source = this.buffers.get(sample);
    if (!ctx || !source) return null;
    const cached = this.reversed.get(sample);
    if (cached) return cached;
    try {
      const buffer = ctx.createBuffer(source.numberOfChannels, source.length, source.sampleRate);
      for (let ch = 0; ch < source.numberOfChannels; ch++) {
        const from = source.getChannelData(ch);
        const to = buffer.getChannelData(ch);
        for (let i = 0, n = source.length; i < n; i++) to[i] = from[n - 1 - i];
      }
      this.reversed.set(sample, buffer);
      return buffer;
    } catch {
      return null;
    }
  }

  /** Schedule one recorded layer; the fallback covers an unavailable sample. */
  private playLayer(layer: GachaSampleLayer, fallback: () => void) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const buffer = layer.reverse ? this.reversedBuffer(layer.sample) : this.buffers.get(layer.sample);
    if (!buffer) {
      fallback();
      return;
    }
    try {
      const rate = layer.rate ?? 1;
      // A reversed layer leads into its moment: its nominal delay marks when it
      // *ends*, so a reverse-riser swell crests exactly on the reveal hit.
      const offset = (layer.delay ?? 0) - (layer.reverse ? buffer.duration / rate : 0);
      const t0 = ctx.currentTime + Math.max(0, offset);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = rate;
      const gain = ctx.createGain();
      gain.gain.value = layer.gain;
      let out: AudioNode = gain;
      const pan = layer.pan ?? 0;
      if (pan !== 0) {
        const panner = ctx.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, pan));
        gain.connect(panner);
        out = panner;
      }
      out.connect(this.master);
      const wet = layer.wet ?? 0;
      if (wet > 0 && this.reverb) {
        const send = ctx.createGain();
        send.gain.value = wet;
        out.connect(send);
        send.connect(this.reverb);
      }
      src.connect(gain);
      src.start(t0);
    } catch {
      // best-effort
    }
  }

  /** Play a recorded arrangement, falling back only when nothing was available. */
  private playLayers(layers: GachaSampleLayer[], fallback: () => void) {
    if (!this.enabled) return;
    if (this.buffers.size === 0) {
      fallback();
      return;
    }
    let played = false;
    for (const layer of layers) {
      if (!this.buffers.has(layer.sample)) continue;
      played = true;
      this.playLayer(layer, fallback);
    }
    if (!played) fallback();
  }

  /* ── synthesized fallback voices ── */

  private ping(freq: number, opts: { vol: number; dur: number; delay?: number; type?: OscillatorType; slideTo?: number; wet?: number }) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    try {
      const t0 = ctx.currentTime + (opts.delay ?? 0);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(opts.vol, t0 + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.008 + opts.dur);
      gain.connect(this.master);
      if (opts.wet && this.reverb) {
        const send = ctx.createGain();
        send.gain.value = opts.wet;
        gain.connect(send);
        send.connect(this.reverb);
      }
      const osc = ctx.createOscillator();
      osc.type = opts.type ?? 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.slideTo), t0 + opts.dur);
      osc.connect(gain);
      osc.start(t0);
      osc.stop(t0 + opts.dur + 0.08);
    } catch {
      // best-effort
    }
  }

  private hush(opts: { vol: number; dur: number; from: number; to?: number; type?: BiquadFilterType; delay?: number; q?: number; wet?: number }) {
    const ctx = this.ensure();
    if (!ctx || !this.noiseBuffer || !this.master) return;
    try {
      const t0 = ctx.currentTime + (opts.delay ?? 0);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(opts.vol, t0 + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.006 + opts.dur);
      gain.connect(this.master);
      if (opts.wet && this.reverb) {
        const send = ctx.createGain();
        send.gain.value = opts.wet;
        gain.connect(send);
        send.connect(this.reverb);
      }
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = opts.type ?? 'bandpass';
      filter.frequency.setValueAtTime(opts.from, t0);
      if (opts.to) filter.frequency.exponentialRampToValueAtTime(opts.to, t0 + opts.dur);
      filter.Q.value = opts.q ?? 1;
      src.connect(filter);
      filter.connect(gain);
      src.start(t0);
      src.stop(t0 + opts.dur + 0.08);
    } catch {
      // best-effort
    }
  }

  private fallbackTick(intensity: number) {
    const v = Math.min(1, Math.max(0, intensity));
    const jitter = 0.96 + Math.random() * 0.08;
    this.hush({ vol: 0.1 + 0.08 * v, dur: 0.016, from: (3000 + 900 * v) * jitter, q: 7, wet: 0.04 });
    this.ping((1650 + 650 * v) * jitter, { vol: 0.05 + 0.05 * v, dur: 0.02, type: 'triangle', wet: 0.04 });
  }

  private fallbackLatch() {
    this.ping(118, { vol: 0.3, dur: 0.17, slideTo: 46, wet: 0.12 });
    this.hush({ vol: 0.14, dur: 0.055, from: 950, q: 2, delay: 0.05, wet: 0.08 });
    this.hush({ vol: 0.09, dur: 0.34, from: 700, to: 2400, delay: 0.08, q: 1.3, wet: 0.18 });
  }

  private fallbackLand() {
    this.ping(150, { vol: 0.3, dur: 0.18, slideTo: 44, wet: 0.15 });
    this.hush({ vol: 0.13, dur: 0.05, from: 1300, q: 2.5, delay: 0.05, wet: 0.1 });
  }

  private fallbackReveal(tier: number) {
    const i = Math.min(4, Math.max(0, tier));
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    for (let n = 0; n <= i; n++) {
      this.ping(notes[n], { vol: 0.13, dur: 0.6 + 0.08 * i, delay: 0.16 + n * 0.085, wet: 0.36 });
    }
    if (i >= 3) this.ping(62, { vol: 0.26, dur: 0.85, slideTo: 30, delay: 0.16, wet: 0.4 });
  }

  /* ── public voices ── */

  /**
   * Reel ratchet: dry recorded ticks, round-robined with a little pitch and
   * stereo jitter; intensity follows strip speed.
   */
  tick(intensity = 1) {
    if (!this.enabled) return;
    const v = Math.min(1, Math.max(0, intensity));
    const layers = tickLayers(this.tickStep++).map((layer) => ({
      ...layer,
      gain: layer.gain * (0.55 + 0.45 * v),
      rate: (layer.rate ?? 1) * (0.94 + Math.random() * 0.12),
      pan: (Math.random() * 2 - 1) * 0.12,
    }));
    this.playLayers(layers, () => this.fallbackTick(v));
  }

  /** Case latch: mechanism hit, latch release, then the lid swinging open. */
  caseOpen() {
    if (!this.enabled) return;
    this.playLayers(GACHA_CASE_OPEN, () => this.fallbackLatch());
  }

  /** Continuous friction under the strip: looped rattle plus a noise whoosh. */
  spinStart() {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    this.spinStop();
    try {
      const buffer = this.buffers.get(GACHA_SPIN_RATTLE.sample);
      if (buffer) {
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        src.playbackRate.value = GACHA_SPIN_RATTLE.rate;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        src.connect(gain);
        gain.connect(this.master);
        src.start();
        this.rattle = { src, gain };
      }
      if (!this.noiseBuffer) return;
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
      // best-effort
    }
  }

  /** Strip speed 0..1 drives rattle loudness/rate and whoosh brightness. */
  spinSet(speed: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const v = Math.min(1, Math.max(0, speed));
    const t = ctx.currentTime;
    try {
      if (this.rattle) {
        this.rattle.src.playbackRate.setTargetAtTime(GACHA_SPIN_RATTLE.rate * (0.72 + 0.5 * v), t, 0.05);
        this.rattle.gain.gain.setTargetAtTime(this.enabled ? GACHA_SPIN_RATTLE.gain * (0.3 + 0.7 * v) : 0, t, 0.04);
      }
      if (this.whoosh) {
        this.whoosh.gain.gain.setTargetAtTime(this.enabled ? 0.012 + 0.06 * v : 0, t, 0.03);
        this.whoosh.filter.frequency.setTargetAtTime(380 + 2100 * v, t, 0.05);
      }
    } catch {
      // best-effort
    }
  }

  spinStop() {
    try {
      if (this.ctx) {
        const t = this.ctx.currentTime;
        for (const node of [this.rattle, this.whoosh]) {
          if (!node) continue;
          node.gain.gain.setTargetAtTime(0, t, 0.08);
          node.src.stop(t + 0.4);
        }
      }
    } catch {
      // best-effort
    }
    this.rattle = null;
    this.whoosh = null;
  }

  /** Strip stop: heavy settle with a wooden knock. */
  land() {
    if (!this.enabled) return;
    this.spinStop();
    this.playLayers(GACHA_STRIP_LAND, () => this.fallbackLand());
  }

  /**
   * Prize fanfare scaled by tier 0..4, after a short held breath — the pause
   * before the reveal.
   */
  reveal(tierIndex: number) {
    if (!this.enabled) return;
    const tier = Math.min(4, Math.max(0, Math.floor(tierIndex) || 0));
    const breath = 0.16;
    const layers = revealLayers(tier).map((layer) => ({ ...layer, delay: (layer.delay ?? 0) + breath }));
    this.playLayers(layers, () => this.fallbackReveal(tier));
  }

  click() {
    if (!this.enabled) return;
    this.playLayers(GACHA_UI_CLICK, () => this.ping(880, { vol: 0.08, dur: 0.045, type: 'triangle' }));
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
    this.buffers.clear();
    this.reversed.clear();
    this.loadPromise = null;
  }
}
