// Small WebAudio sound kit for Iceberg Strike. All sounds are synthesized and
// failures are intentionally ignored so audio policy never breaks gameplay.

export class Sfx {
  enabled = true;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private lastStep = 0;

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

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo = 0) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start();
      osc.stop(ctx.currentTime + dur + 0.02);
    } catch {
      // Audio is best-effort; never break gameplay over it.
    }
  }

  private noise(dur: number, vol: number, cutoff: number, type: BiquadFilterType = 'lowpass') {
    const ctx = this.ensure();
    if (!ctx || !this.master || !this.noiseBuffer) return;
    try {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = cutoff;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      src.start();
      src.stop(ctx.currentTime + dur + 0.02);
    } catch {
      // best-effort
    }
  }

  shoot() {
    this.noise(0.09, 0.5, 2600);
    this.tone(170, 0.1, 'square', 0.25, 55);
  }

  awpShoot() {
    this.noise(0.22, 0.6, 1200);
    this.tone(90, 0.24, 'sawtooth', 0.3, 40);
  }

  enemyShot() {
    this.noise(0.06, 0.22, 1800);
    this.tone(300, 0.06, 'square', 0.1, 120);
  }

  knife() {
    this.noise(0.08, 0.3, 5200, 'highpass');
  }

  hit() {
    this.tone(1150, 0.04, 'square', 0.18);
  }

  headshot() {
    this.tone(1500, 0.05, 'square', 0.22);
    this.tone(2100, 0.07, 'sine', 0.16);
  }

  kill() {
    this.tone(150, 0.18, 'sine', 0.4, 55);
    this.tone(900, 0.05, 'square', 0.15);
  }

  hurt() {
    this.tone(120, 0.2, 'sine', 0.45, 60);
  }

  reload() {
    this.tone(750, 0.03, 'square', 0.2);
    this.tone(560, 0.03, 'square', 0.2);
  }

  empty() {
    this.tone(420, 0.03, 'square', 0.15);
  }

  buy() {
    this.tone(620, 0.07, 'sine', 0.22, 930);
  }

  denied() {
    this.tone(210, 0.09, 'square', 0.18, 130);
  }

  plant() {
    this.tone(980, 0.06, 'square', 0.18);
    this.tone(760, 0.08, 'square', 0.16);
  }

  bombBeep() {
    this.tone(1180, 0.055, 'square', 0.2);
  }

  defuse() {
    this.tone(660, 0.1, 'sine', 0.3, 990);
  }

  defuseTick() {
    this.tone(520, 0.03, 'square', 0.14);
  }

  explosion() {
    this.noise(0.7, 0.7, 420);
    this.tone(55, 0.6, 'sawtooth', 0.42, 28);
  }

  throwPin() {
    this.tone(880, 0.03, 'square', 0.14);
  }

  scope() {
    this.tone(340, 0.04, 'square', 0.14);
  }

  footstep() {
    const now = performance.now();
    if (now - this.lastStep < 240) return;
    this.lastStep = now;
    this.noise(0.035, 0.07, 900);
  }

  roundWon() {
    this.tone(440, 0.12, 'square', 0.2);
    this.tone(660, 0.16, 'square', 0.2);
  }

  roundLost() {
    this.tone(220, 0.18, 'sine', 0.32, 110);
  }

  switchWeapon() {
    this.tone(320, 0.04, 'square', 0.15);
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
