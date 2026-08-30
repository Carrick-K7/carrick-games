import { BaseGame, createDefaultGameHost, type GameHost, type GameShellSnapshot } from '../core/game.js';
import { getRetroPalette } from '../core/render.js';
import {
  FloatTexts,
  Particles,
  ScreenShake,
  Tween,
  drawGlow,
  drawVignette,
  fillGlassPanel,
  fillSphere,
  fx,
} from '../core/fx.js';

const W = 500;
const H = 400;
const GAME_DURATION = 8;
const TOTAL_TARGETS = 20;

interface Target {
  x: number;
  y: number;
  radius: number;
  spawnTime: number;
  hit: boolean;
}

export class AimLabGame extends BaseGame {
  private targets: Target[] = [];
  private currentTarget: Target | null = null;
  private score = 0;

  override getShellSnapshot(): GameShellSnapshot {
    return { score: this.score };
  }
  private timeLeft = GAME_DURATION;
  private gameOver = false;
  private gameStarted = false;
  private hits = 0;
  private misses = 0;
  private totalReactionTime = 0;
  private targetTween: Tween | null = null;
  private readonly particles = new Particles();
  private readonly floats = new FloatTexts();
  private readonly shake = new ScreenShake();

  constructor(host?: GameHost) {
    super(host ?? createDefaultGameHost('gameCanvas', W, H));
  }

  init() {
    this.targets = [];
    this.currentTarget = null;
    this.score = 0;
    this.timeLeft = GAME_DURATION;
    this.gameOver = false;
    this.gameStarted = false;
    this.hits = 0;
    this.misses = 0;
    this.totalReactionTime = 0;
    this.targetTween = null;
    this.particles.clear();
    this.floats.clear();
    this.shake.reset();
    this.resetScoreReport();
  }



  private spawnTarget() {
    if (this.gameOver || this.targets.length >= TOTAL_TARGETS) return;
    const margin = 40;
    const minR = 12;
    const maxR = 28;
    const radius = minR + Math.random() * (maxR - minR);
    const x = margin + radius + Math.random() * (W - 2 * margin - 2 * radius);
    const y = margin + radius + Math.random() * (H - 2 * margin - 2 * radius);
    const target: Target = { x, y, radius, spawnTime: performance.now(), hit: false };
    this.targets.push(target);
    this.currentTarget = target;
    this.targetTween = new Tween({ from: 0.3, to: 1, duration: 0.16, ease: 'outBack' });
  }

  update(dt: number) {
    this.particles.update(dt);
    this.floats.update(dt);
    this.shake.update(dt);
    this.targetTween?.update(dt);
    if (this.gameOver) return;
    if (!this.gameStarted) {
      this.gameStarted = true;
      this.spawnTarget();
    }
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.endGame();
    }
  }

  private endGame() {
    if (this.gameOver) return;
    this.gameOver = true;
    const palette = getRetroPalette(this.isDarkTheme());
    this.particles.emit(fx.confetti(W / 2, 12, [palette.primary, palette.cyan, palette.amber, palette.violet]));
    this.submitScoreOnce(this.score);
  }

  draw(ctx: CanvasRenderingContext2D) {
    const isDark = this.isDarkTheme();
    const palette = getRetroPalette(isDark);
    const background = ctx.createLinearGradient(0, 0, 0, H);
    background.addColorStop(0, palette.bg2);
    background.addColorStop(1, palette.bg);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += 50) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    this.shake.apply(ctx, () => {
      for (const target of this.targets) {
        if (target.hit) continue;
        const scale = target === this.currentTarget ? (this.targetTween?.value ?? 1) : 1;
        drawGlow(ctx, target.x, target.y, (target.radius + 14) * scale, palette.primary, isDark ? 0.35 : 0.12);
        fillSphere(ctx, target.x, target.y, target.radius * scale, palette.primary, { rim: 0.45, rimColor: palette.cyan });
        fillSphere(ctx, target.x, target.y, target.radius * 0.34 * scale, isDark ? palette.bg : '#ffffff', { rim: 0.15 });
      }
      this.particles.draw(ctx);
    });

    drawVignette(ctx, W, H, isDark ? 0.2 : 0.09);
    this.floats.draw(ctx);

    fillGlassPanel(ctx, 8, 7, W - 16, 40, 10, {
      fill: palette.panel,
      fill2: palette.panel2,
      border: palette.border,
      glow: palette.primary,
      shadow: palette.shadow,
    });
    const zh = this.isZhLang();
    ctx.fillStyle = palette.text;
    ctx.font = '12px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(`${zh ? '得分' : 'SCORE'} ${this.score}`, 18, 20);
    ctx.fillText(`${zh ? '目标' : 'TARGETS'} ${this.hits}/${TOTAL_TARGETS}`, 18, 36);
    ctx.textAlign = 'right';
    ctx.fillText(`${zh ? '时间' : 'TIME'} ${Math.ceil(this.timeLeft)}`, W - 18, 28);

    if (this.gameOver) {
      const avgReaction = this.hits > 0 ? (this.totalReactionTime / this.hits).toFixed(0) : '0';
      this.drawResultOverlay(ctx, {
        title: zh ? '测试完成' : 'TEST COMPLETE',
        tone: 'success',
        details: [
          `${zh ? '得分' : 'SCORE'} ${this.score}`,
          `${zh ? '平均反应' : 'AVG REACTION'} ${avgReaction}ms`,
          `${zh ? '命中' : 'HITS'} ${this.hits}  ${zh ? '失误' : 'MISSES'} ${this.misses}`,
        ],
        hint: zh ? '点击或按空格重新开始' : 'CLICK OR PRESS SPACE',
      });
    }
  }

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    if (this.gameOver) {
      if (this.isRestartInput(e)) {
        if (e instanceof TouchEvent) e.preventDefault();
        this.init();
      }
      return;
    }

    if (!this.gameStarted) return;

    let clientX = 0;
    let clientY = 0;

    if (e instanceof MouseEvent) {
      if (e.type !== 'mousedown') return;
      clientX = e.clientX;
      clientY = e.clientY;
    } else if (e instanceof TouchEvent) {
      if (e.type !== 'touchstart') return;
      e.preventDefault();
      const t = e.touches[0];
      if (!t) return;
      clientX = t.clientX;
      clientY = t.clientY;
    } else {
      return;
    }

    const point = this.canvasPoint(clientX, clientY);
    if (!this.currentTarget || this.currentTarget.hit) {
      this.misses++;
      this.emitMiss(point.x, point.y);
      return;
    }

    const dx = point.x - this.currentTarget.x;
    const dy = point.y - this.currentTarget.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= this.currentTarget.radius + 4) {
      const reaction = performance.now() - this.currentTarget.spawnTime;
      this.totalReactionTime += reaction;
      const speedBonus = Math.max(0, Math.round(500 - reaction));
      const sizeBonus = Math.round(30 - this.currentTarget.radius);
      const points = 100 + speedBonus + sizeBonus;
      this.score += points;
      const palette = getRetroPalette(this.isDarkTheme());
      for (const emit of fx.pop(this.currentTarget.x, this.currentTarget.y, [palette.primary, palette.cyan, '#ffffff'])) {
        if (!this.isDarkTheme()) emit.blend = 'source-over';
        this.particles.emit(emit);
      }
      this.floats.add(this.currentTarget.x, this.currentTarget.y - 12, `+${points}`, { color: palette.amber, size: 14 });
      this.currentTarget.hit = true;
      this.hits++;

      if (this.hits >= TOTAL_TARGETS) {
        this.endGame();
      } else {
        this.spawnTarget();
      }
    } else {
      this.misses++;
      this.emitMiss(point.x, point.y);
    }
  }

  private emitMiss(x: number, y: number) {
    const palette = getRetroPalette(this.isDarkTheme());
    this.particles.emit({
      x,
      y,
      count: 1,
      speed: 0,
      life: 0.28,
      size: 6,
      colors: [palette.red],
      shape: 'ring',
      endScale: 4,
      blend: 'source-over',
    });
    this.shake.add(0.1);
  }

  destroy() {
    this.stop();
  }
}
