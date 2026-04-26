import { BaseGame } from '../core/game.js';

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
  private timeLeft = GAME_DURATION;
  private gameOver = false;
  private gameStarted = false;
  private hits = 0;
  private misses = 0;
  private totalReactionTime = 0;

  constructor() {
    super('gameCanvas', W, H);
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
  }

  update(dt: number) {
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
    this.gameOver = true;
    this.submitScoreOnce(this.score);
  }

  draw(ctx: CanvasRenderingContext2D) {
    const isDark = this.isDarkTheme();
    const bg = isDark ? '#0b0f19' : '#fafafa';
    const primary = isDark ? '#39C5BB' : '#0d9488';
    const text = isDark ? '#f8fafc' : '#0f172a';
    const grid = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Grid background
    ctx.strokeStyle = grid;
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

    // HUD
    const zh = this.isZhLang();
    ctx.fillStyle = text;
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${zh ? '得分' : 'SCORE'} ${this.score}`, 12, 20);
    ctx.textAlign = 'right';
    ctx.fillText(`${zh ? '时间' : 'TIME'} ${Math.ceil(this.timeLeft)}`, W - 12, 20);
    ctx.textAlign = 'left';
    ctx.fillText(`${zh ? '目标' : 'TARGETS'} ${this.hits}/${TOTAL_TARGETS}`, 12, 38);

    if (this.gameOver) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = primary;
      ctx.font = '22px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(zh ? '测试完成' : 'TEST COMPLETE', W / 2, H / 2 - 50);
      ctx.fillStyle = text;
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillText(`${zh ? '得分' : 'SCORE'} ${this.score}`, W / 2, H / 2 - 10);
      const avgReaction = this.hits > 0 ? (this.totalReactionTime / this.hits).toFixed(0) : '0';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(`${zh ? '平均反应' : 'AVG REACTION'} ${avgReaction}ms`, W / 2, H / 2 + 18);
      ctx.fillText(`${zh ? '命中' : 'HITS'} ${this.hits}  ${zh ? '失误' : 'MISSES'} ${this.misses}`, W / 2, H / 2 + 38);
      ctx.textBaseline = 'alphabetic';
      return;
    }

    // Draw targets
    for (const t of this.targets) {
      if (t.hit) continue;
      // Outer ring
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.radius + 4, 0, Math.PI * 2);
      ctx.fillStyle = isDark ? 'rgba(57,197,187,0.2)' : 'rgba(13,148,136,0.15)';
      ctx.fill();

      // Main target
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.radius, 0, Math.PI * 2);
      ctx.fillStyle = primary;
      ctx.fill();

      // Inner dot
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.radius * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = bg;
      ctx.fill();
    }
  }

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    if (this.gameOver) {
      if (e instanceof KeyboardEvent && e.type === 'keydown' && e.key === ' ') {
        this.start();
      }
      if (e instanceof MouseEvent && e.type === 'mousedown') {
        this.start();
      }
      if (e instanceof TouchEvent && e.type === 'touchstart') {
        e.preventDefault();
        this.start();
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
      this.score += 100 + speedBonus + sizeBonus;
      this.currentTarget.hit = true;
      this.hits++;

      if (this.hits >= TOTAL_TARGETS) {
        this.endGame();
      } else {
        this.spawnTarget();
      }
    } else {
      this.misses++;
    }
  }

  destroy() {
    this.stop();
  }
}
