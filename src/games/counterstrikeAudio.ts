// Synthesized CS-style sound kit for the fy_iceworld port. All sounds are
// generated with WebAudio and failures are intentionally ignored so audio
// policy never breaks gameplay.

import type { WeaponSound } from './counterstrikeRules.js';

export class Sfx {
  enabled = true;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private lastStep = 0;

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
        this.master.gain.value = 0.32;
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

  shoot(kind: WeaponSound, silenced = false) {
    if (silenced) {
      this.noise(0.05, 0.16, 2200, 'highpass');
      this.tone(200, 0.04, 'square', 0.08, 90);
      return;
    }
    switch (kind) {
      case 'pistol':
        this.noise(0.08, 0.42, 3200);
        this.tone(240, 0.09, 'square', 0.2, 80);
        break;
      case 'smg':
        this.noise(0.07, 0.36, 2800);
        this.tone(210, 0.07, 'square', 0.16, 90);
        break;
      case 'rifle':
        this.noise(0.1, 0.5, 2400);
        this.tone(160, 0.11, 'square', 0.24, 55);
        break;
      case 'sniper':
        this.noise(0.24, 0.6, 1100);
        this.tone(85, 0.26, 'sawtooth', 0.3, 35);
        break;
      case 'shotgun':
        this.noise(0.16, 0.6, 900);
        this.tone(110, 0.15, 'square', 0.3, 40);
        break;
      case 'mg':
        this.noise(0.09, 0.44, 2000);
        this.tone(150, 0.09, 'square', 0.2, 60);
        break;
    }
  }

  knife() {
    this.noise(0.08, 0.28, 5200, 'highpass');
  }

  hit() {
    this.tone(1150, 0.04, 'square', 0.16);
  }

  headshot() {
    this.tone(1500, 0.05, 'square', 0.2);
    this.tone(2100, 0.08, 'sine', 0.14);
  }

  kill() {
    this.tone(150, 0.18, 'sine', 0.35, 55);
    this.tone(900, 0.05, 'square', 0.12);
  }

  hurt() {
    this.tone(120, 0.2, 'sine', 0.4, 60);
  }

  reload() {
    this.tone(750, 0.03, 'square', 0.18);
    this.tone(560, 0.03, 'square', 0.18, 0, 0.12);
  }

  reloadEnd() {
    this.tone(880, 0.04, 'square', 0.2);
  }

  empty() {
    this.tone(420, 0.03, 'square', 0.14);
  }

  switchWeapon() {
    this.tone(320, 0.04, 'square', 0.14);
  }

  buy() {
    this.tone(620, 0.07, 'sine', 0.2, 930);
  }

  denied() {
    this.tone(210, 0.09, 'square', 0.16, 130);
  }

  pickup() {
    this.tone(520, 0.05, 'sine', 0.14, 720);
  }

  dropWeapon() {
    this.tone(380, 0.05, 'square', 0.12, 240);
  }

  throwPin() {
    this.tone(880, 0.03, 'square', 0.13);
  }

  explosion() {
    this.noise(0.7, 0.7, 420);
    this.tone(55, 0.6, 'sawtooth', 0.4, 28);
  }

  flashPop() {
    this.noise(0.2, 0.4, 3800);
    this.tone(1400, 0.2, 'sine', 0.25, 400);
  }

  smokePop() {
    this.noise(0.3, 0.3, 600);
  }

  footstep(crouch = false) {
    const now = performance.now();
    if (now - this.lastStep < (crouch ? 300 : 230)) return;
    this.lastStep = now;
    this.noise(0.03, crouch ? 0.04 : 0.07, 950);
  }

  roundStart() {
    // "Go, go, go!" radio bleeps.
    this.tone(740, 0.07, 'square', 0.2, 0, 0);
    this.tone(740, 0.07, 'square', 0.2, 0, 0.16);
    this.tone(940, 0.09, 'square', 0.22, 0, 0.32);
  }

  roundWon() {
    this.tone(440, 0.12, 'square', 0.2);
    this.tone(660, 0.16, 'square', 0.2, 0, 0.14);
  }

  roundLost() {
    this.tone(220, 0.18, 'sine', 0.3, 110);
  }

  roundDraw() {
    this.tone(300, 0.14, 'square', 0.18, 260);
  }

  matchEnd(win: boolean) {
    if (win) {
      this.tone(523, 0.16, 'square', 0.22);
      this.tone(659, 0.16, 'square', 0.22, 0, 0.18);
      this.tone(784, 0.3, 'square', 0.24, 0, 0.36);
    } else {
      this.tone(330, 0.2, 'sine', 0.3, 160);
      this.tone(220, 0.32, 'sine', 0.3, 110, 0.24);
    }
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
