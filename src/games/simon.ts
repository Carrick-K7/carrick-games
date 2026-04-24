import { BaseGame, getStoredRecord } from '../core/game.js';

const W = 400;
const H = 500;
const OUTER = 24;
const GAP = 14;
const GRID_TOP = 130;
const PAD_W = (W - OUTER * 2 - GAP) / 2;
const PAD_H = (H - GRID_TOP - 18 - GAP) / 2;
const GAME_ID = 'simon';

type SimonColor = 'red' | 'blue' | 'green' | 'yellow';
type Phase = 'ready' | 'showing' | 'waiting' | 'round-clear' | 'gameover';

interface SimonPad {
  color: SimonColor;
  label: string;
  labelZh: string;
  keyLabel: string;
  altKey: string;
  freq: number;
  base: string;
  active: string;
  border: string;
  glow: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ThemePalette {
  bgTop: string;
  bgBottom: string;
  surface: string;
  panelBorder: string;
  line: string;
  accent: string;
  text: string;
  muted: string;
  overlay: string;
}

const PAD_LAYOUT: SimonPad[] = [
  {
    color: 'red',
    label: 'RED',
    labelZh: '红色',
    keyLabel: '1',
    altKey: 'R',
    freq: 329.63,
    base: '#7f1d36',
    active: '#fb7185',
    border: '#fecdd3',
    glow: 'rgba(251, 113, 133, 0.45)',
    x: OUTER,
    y: GRID_TOP,
    w: PAD_W,
    h: PAD_H,
  },
  {
    color: 'blue',
    label: 'BLUE',
    labelZh: '蓝色',
    keyLabel: '2',
    altKey: 'B',
    freq: 392.0,
    base: '#1d4f91',
    active: '#60a5fa',
    border: '#bfdbfe',
    glow: 'rgba(96, 165, 250, 0.45)',
    x: OUTER + PAD_W + GAP,
    y: GRID_TOP,
    w: PAD_W,
    h: PAD_H,
  },
  {
    color: 'green',
    label: 'GREEN',
    labelZh: '绿色',
    keyLabel: '3',
    altKey: 'G',
    freq: 261.63,
    base: '#0f766e',
    active: '#5eead4',
    border: '#99f6e4',
    glow: 'rgba(94, 234, 212, 0.45)',
    x: OUTER,
    y: GRID_TOP + PAD_H + GAP,
    w: PAD_W,
    h: PAD_H,
  },
  {
    color: 'yellow',
    label: 'YELLOW',
    labelZh: '黄色',
    keyLabel: '4',
    altKey: 'Y',
    freq: 523.25,
    base: '#946200',
    active: '#facc15',
    border: '#fde68a',
    glow: 'rgba(250, 204, 21, 0.45)',
    x: OUTER + PAD_W + GAP,
    y: GRID_TOP + PAD_H + GAP,
    w: PAD_W,
    h: PAD_H,
  },
];

export class SimonGame extends BaseGame {
  private readonly pads = PAD_LAYOUT;
  private phase: Phase = 'ready';
  private sequence: SimonColor[] = [];
  private inputIndex = 0;
  private level = 0;
  private score = 0;
  private flashColor: SimonColor | null = null;
  private flashTimerMs = 0;
  private showIndex = 0;
  private showTimerMs = 0;
  private roundTimerMs = 0;
  private lastInputAt = 0;
  private lastBonus = 0;
  private lastBonusTimerMs = 0;
  private reportedScore = false;
  private audioContext: AudioContext | null = null;

  constructor() {
    super('gameCanvas', W, H);
  }

  override start() {
    super.start();
    this.beginGame();
  }

  override destroy() {
    super.destroy();
    if (this.audioContext) {
      void this.audioContext.close().catch(() => undefined);
      this.audioContext = null;
    }
  }

  init() {
    this.phase = 'ready';
    this.sequence = [];
    this.inputIndex = 0;
    this.level = 0;
    this.score = 0;
    this.flashColor = null;
    this.flashTimerMs = 0;
    this.showIndex = 0;
    this.showTimerMs = 0;
    this.roundTimerMs = 0;
    this.lastInputAt = 0;
    this.lastBonus = 0;
    this.lastBonusTimerMs = 0;
    this.reportedScore = false;
  }

  update(dt: number) {
    const deltaMs = dt * 1000;

    if (this.flashTimerMs > 0) {
      this.flashTimerMs -= deltaMs;
      if (this.flashTimerMs <= 0) {
        this.flashTimerMs = 0;
        this.flashColor = null;
      }
    }

    if (this.lastBonusTimerMs > 0) {
      this.lastBonusTimerMs -= deltaMs;
      if (this.lastBonusTimerMs <= 0) {
        this.lastBonusTimerMs = 0;
        this.lastBonus = 0;
      }
    }

    if (this.phase === 'showing') {
      this.showTimerMs -= deltaMs;
      if (this.showTimerMs <= 0) {
        if (this.showIndex < this.sequence.length) {
          this.flashPad(this.sequence[this.showIndex], this.getCueDuration());
          this.showIndex += 1;
          this.showTimerMs += this.getCueDuration() + this.getGapDuration();
        } else {
          this.phase = 'waiting';
          this.inputIndex = 0;
          this.showTimerMs = 0;
          this.lastInputAt = performance.now();
        }
      }
    }

    if (this.phase === 'round-clear') {
      this.roundTimerMs -= deltaMs;
      if (this.roundTimerMs <= 0) {
        this.roundTimerMs = 0;
        this.beginNextRound();
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const theme = this.getTheme();
    const zh = this.isZh();

    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, theme.bgTop);
    gradient.addColorStop(1, theme.bgBottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);

    this.drawBackdrop(ctx, theme);
    this.drawHud(ctx, theme, zh);

    for (const pad of this.pads) {
      const active = pad.color === this.flashColor;
      this.drawPad(ctx, pad, active, zh);
    }

    if (this.phase === 'ready' || this.phase === 'gameover') {
      this.drawOverlay(ctx, theme, zh);
    }
  }

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    if (e instanceof KeyboardEvent) {
      if (e.type !== 'keydown' || e.repeat) return;
      if (this.phase === 'gameover' && e.key === ' ') {
        this.init();
        this.beginGame();
        return;
      }
      const color = this.getColorFromKey(e.key);
      if (color) this.handlePlayerChoice(color);
      return;
    }

    if (e instanceof TouchEvent) {
      if (e.type !== 'touchstart') return;
      e.preventDefault();
      if (this.phase === 'gameover') {
        this.init();
        this.beginGame();
        return;
      }
      const touch = e.touches[0] || e.changedTouches[0];
      if (!touch) return;
      const color = this.getColorFromPoint(touch.clientX, touch.clientY);
      if (color) this.handlePlayerChoice(color);
      return;
    }

    if (e instanceof MouseEvent) {
      if (e.type !== 'mousedown') return;
      if (this.phase === 'gameover') {
        this.init();
        this.beginGame();
        return;
      }
      const color = this.getColorFromPoint(e.clientX, e.clientY);
      if (color) this.handlePlayerChoice(color);
    }
  }

  private beginGame() {
    this.sequence = [];
    this.score = 0;
    this.level = 0;
    this.inputIndex = 0;
    this.lastBonus = 0;
    this.lastBonusTimerMs = 0;
    this.reportedScore = false;
    this.beginNextRound();
  }

  private beginNextRound() {
    this.sequence.push(this.randomColor());
    this.level = this.sequence.length;
    this.inputIndex = 0;
    this.showIndex = 0;
    this.flashColor = null;
    this.flashTimerMs = 0;
    this.phase = 'showing';
    this.showTimerMs = 650;
  }

  private handlePlayerChoice(color: SimonColor) {
    if (this.phase !== 'waiting') return;

    const now = performance.now();
    const reactionMs = now - this.lastInputAt;
    this.flashPad(color, 220);

    if (color !== this.sequence[this.inputIndex]) {
      this.endGame();
      return;
    }

    const bonus = this.computeBonus(reactionMs);
    this.lastBonus = bonus;
    this.lastBonusTimerMs = bonus > 0 ? 900 : 0;
    this.score += 10 + bonus;
    this.inputIndex += 1;
    this.lastInputAt = now;

    if (this.inputIndex >= this.sequence.length) {
      this.phase = 'round-clear';
      this.roundTimerMs = 720;
    }
  }

  private endGame() {
    this.phase = 'gameover';
    this.roundTimerMs = 0;
    this.showTimerMs = 0;
    this.playErrorTone();

    if (!this.reportedScore) {
      this.reportedScore = true;
      window.reportScore?.(this.score);
    }
  }

  private randomColor(): SimonColor {
    const colors: SimonColor[] = ['red', 'blue', 'green', 'yellow'];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  private getCueDuration(): number {
    return Math.max(150, 460 - (this.level - 1) * 18);
  }

  private getGapDuration(): number {
    return Math.max(100, 220 - (this.level - 1) * 8);
  }

  private computeBonus(reactionMs: number): number {
    const target = Math.max(360, 980 - (this.level - 1) * 35);
    return Math.max(0, Math.round((target - reactionMs) / 100));
  }

  private flashPad(color: SimonColor, durationMs: number) {
    this.flashColor = color;
    this.flashTimerMs = durationMs;
    this.playTone(color, durationMs * 0.75);
  }

  private ensureAudioContext() {
    if (!this.audioContext) {
      const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return null;
      this.audioContext = new AudioCtor();
    }
    if (this.audioContext.state === 'suspended') {
      void this.audioContext.resume().catch(() => undefined);
    }
    return this.audioContext;
  }

  private playTone(color: SimonColor, durationMs: number) {
    const ctx = this.ensureAudioContext();
    if (!ctx) return;

    const pad = this.pads.find((item) => item.color === color);
    if (!pad) return;

    const duration = durationMs / 1000;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.value = pad.freq;

    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  }

  private playErrorTone() {
    const ctx = this.ensureAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(70, ctx.currentTime + 0.4);

    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.22, ctx.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  }

  private getColorFromKey(key: string): SimonColor | null {
    switch (key.toLowerCase()) {
      case '1':
      case 'r':
        return 'red';
      case '2':
      case 'b':
        return 'blue';
      case '3':
      case 'g':
        return 'green';
      case '4':
      case 'y':
        return 'yellow';
      default:
        return null;
    }
  }

  private getColorFromPoint(clientX: number, clientY: number): SimonColor | null {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.width / rect.width;
    const scaleY = this.height / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    for (const pad of this.pads) {
      if (x >= pad.x && x <= pad.x + pad.w && y >= pad.y && y <= pad.y + pad.h) {
        return pad.color;
      }
    }

    return null;
  }

  private drawBackdrop(ctx: CanvasRenderingContext2D, theme: ThemePalette) {
    ctx.strokeStyle = theme.line;
    ctx.lineWidth = 1;
    for (let y = 0; y < H; y += 28) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(W, y + 0.5);
      ctx.stroke();
    }
  }

  private drawHud(ctx: CanvasRenderingContext2D, theme: ThemePalette, zh: boolean) {
    this.drawCard(ctx, 18, 18, W - 36, 92, 16, theme.surface, theme.panelBorder);

    ctx.textBaseline = 'top';
    this.drawStat(ctx, 36, 34, zh ? '关卡' : 'LEVEL', this.level, theme, 'left');
    this.drawStat(ctx, W / 2, 34, zh ? '分数' : 'SCORE', this.score, theme, 'center');
    this.drawStat(ctx, W - 36, 34, zh ? '最佳' : 'BEST', this.getBestScore(), theme, 'right');

    ctx.strokeStyle = theme.line;
    ctx.beginPath();
    ctx.moveTo(34, 72.5);
    ctx.lineTo(W - 34, 72.5);
    ctx.stroke();

    ctx.fillStyle = theme.accent;
    ctx.font = '8px "Press Start 2P", "Noto Sans SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.getStatusText(zh), W / 2, 82);

    if (this.lastBonusTimerMs > 0 && this.lastBonus > 0) {
      ctx.fillStyle = theme.text;
      ctx.textAlign = 'right';
      ctx.fillText(`+${this.lastBonus}`, W - 34, 82);
    }
  }

  private drawStat(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    label: string,
    value: number,
    theme: ThemePalette,
    align: CanvasTextAlign
  ) {
    ctx.textAlign = align;
    ctx.fillStyle = theme.muted;
    ctx.font = '8px "Press Start 2P", "Noto Sans SC", sans-serif';
    ctx.fillText(label, x, y);
    ctx.fillStyle = theme.text;
    ctx.font = '12px "Press Start 2P", "Noto Sans SC", sans-serif';
    ctx.fillText(String(value), x, y + 20);
  }

  private drawPad(ctx: CanvasRenderingContext2D, pad: SimonPad, active: boolean, zh: boolean) {
    const fill = active ? pad.active : pad.base;

    if (active) {
      ctx.shadowColor = pad.glow;
      ctx.shadowBlur = 20;
    } else {
      ctx.shadowBlur = 0;
    }

    this.drawCard(ctx, pad.x, pad.y, pad.w, pad.h, 18, fill, active ? pad.border : 'rgba(255,255,255,0.10)');
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.roundRect(pad.x + 1, pad.y + 1, pad.w - 2, pad.h * 0.45, 18);
    ctx.fill();

    this.drawCard(ctx, pad.x + 12, pad.y + 12, 56, 26, 8, 'rgba(15,23,42,0.24)', 'rgba(255,255,255,0.22)');
    ctx.fillStyle = '#ffffff';
    ctx.font = '8px "Press Start 2P", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${pad.keyLabel}/${pad.altKey}`, pad.x + 40, pad.y + 26);

    ctx.fillStyle = active ? '#0f172a' : '#ffffff';
    ctx.font = '11px "Press Start 2P", "Noto Sans SC", sans-serif';
    ctx.fillText(zh ? pad.labelZh : pad.label, pad.x + pad.w / 2, pad.y + pad.h / 2 + 18);
  }

  private drawOverlay(ctx: CanvasRenderingContext2D, theme: ThemePalette, zh: boolean) {
    this.drawCard(ctx, 44, 184, W - 88, 128, 16, theme.overlay, theme.panelBorder);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = theme.text;
    ctx.font = '16px "Press Start 2P", "Noto Sans SC", sans-serif';
    ctx.fillText(
      this.phase === 'ready' ? (zh ? '记忆游戏' : 'SIMON SAYS') : (zh ? '游戏结束' : 'GAME OVER'),
      W / 2,
      222
    );

    ctx.fillStyle = theme.muted;
    ctx.font = '8px "Press Start 2P", "Noto Sans SC", sans-serif';

    if (this.phase === 'ready') {
      ctx.fillText(zh ? '点击下方开始按钮' : 'PRESS START BELOW', W / 2, 258);
      ctx.fillText(zh ? '按 1 2 3 4 或 R B G Y' : 'USE 1 2 3 4 OR R B G Y', W / 2, 282);
      return;
    }

    ctx.fillText(`${zh ? '关卡' : 'LEVEL'} ${this.level}`, W / 2, 258);
    ctx.fillText(`${zh ? '分数' : 'SCORE'} ${this.score}`, W / 2, 282);
  }

  private drawCard(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    radius: number,
    fill: string,
    stroke: string
  ) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  private getStatusText(zh: boolean): string {
    if (this.phase === 'ready') {
      return zh ? '点击下方开始' : 'CLICK START BELOW';
    }
    if (this.phase === 'showing') {
      return zh ? '先看序列' : 'WATCH THE SEQUENCE';
    }
    if (this.phase === 'waiting') {
      return zh ? '重复顺序 10分加速奖励' : 'REPEAT FOR 10 + BONUS';
    }
    if (this.phase === 'round-clear') {
      return zh ? '下一轮更快' : 'PACE UP NEXT ROUND';
    }
    return zh ? '按错颜色 游戏结束' : 'WRONG COLOR  GAME OVER';
  }

  private getBestScore(): number {
    return Math.max(getStoredRecord(GAME_ID) ?? 0, this.score);
  }

  private getTheme(): ThemePalette {
    if (this.isLightTheme()) {
      return {
        bgTop: '#f6fbfb',
        bgBottom: '#e4f4f3',
        surface: 'rgba(255,255,255,0.92)',
        panelBorder: 'rgba(13,148,136,0.28)',
        line: 'rgba(13,148,136,0.08)',
        accent: '#0d9488',
        text: '#0f172a',
        muted: '#55727a',
        overlay: 'rgba(255,255,255,0.7)',
      };
    }

    return {
      bgTop: '#08141b',
      bgBottom: '#040b10',
      surface: 'rgba(15,23,42,0.88)',
      panelBorder: 'rgba(57,197,187,0.28)',
      line: 'rgba(57,197,187,0.08)',
      accent: '#39C5BB',
      text: '#f8fafc',
      muted: '#9fb3c8',
      overlay: 'rgba(2,6,23,0.72)',
    };
  }

  private isLightTheme(): boolean {
    return !this.isDarkTheme();
  }

  private isZh(): boolean {
    return document.documentElement.getAttribute('data-lang') === 'zh';
  }
}
