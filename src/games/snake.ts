import { BaseGame } from '../core/game.js';
import {
  drawGlowText,
  drawPixelFrame,
  drawRetroBackground,
  drawScanlines,
  getRetroPalette,
} from '../core/render.js';

type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string };

export class SnakeGame extends BaseGame {
  private tileSize = 20;
  private cols = 20;
  private rows = 20;
  private snake: { x: number; y: number }[] = [];
  private food = { x: 10, y: 10 };
  private direction: Direction = 'RIGHT';
  private nextDirection: Direction = 'RIGHT';
  private moveTimer = 0;
  private moveInterval = 0.12; // seconds
  private score = 0;
  private gameOver = false;
  private particles: Particle[] = [];

  constructor() {
    super('gameCanvas', 400, 400);
  }

  init() {
    this.snake = [{ x: 5, y: 10 }, { x: 4, y: 10 }, { x: 3, y: 10 }];
    this.direction = 'RIGHT';
    this.nextDirection = 'RIGHT';
    this.score = 0;
    this.gameOver = false;
    this.moveTimer = 0;
    this.particles = [];
    this.spawnFood();
    this.resetScoreReport();
  }

  private spawnFood() {
    let pos: { x: number; y: number };
    do {
      pos = {
        x: Math.floor(Math.random() * this.cols),
        y: Math.floor(Math.random() * this.rows),
      };
    } while (this.snake.some(s => s.x === pos.x && s.y === pos.y));
    this.food = pos;
  }

  update(dt: number) {
    this.particles = this.particles
      .map((p) => ({
        ...p,
        x: p.x + p.vx * dt,
        y: p.y + p.vy * dt,
        vy: p.vy + 110 * dt,
        life: p.life - dt,
      }))
      .filter((p) => p.life > 0);

    if (this.gameOver) return;
    this.moveTimer += dt;
    if (this.moveTimer < this.moveInterval) return;
    this.moveTimer = 0;

    this.direction = this.nextDirection;
    const head = { ...this.snake[0] };
    switch (this.direction) {
      case 'UP': head.y--; break;
      case 'DOWN': head.y++; break;
      case 'LEFT': head.x--; break;
      case 'RIGHT': head.x++; break;
    }

    // Wall collision
    if (head.x < 0 || head.x >= this.cols || head.y < 0 || head.y >= this.rows) {
      this.gameOver = true;
      return;
    }

    // Self collision
    if (this.snake.some(s => s.x === head.x && s.y === head.y)) {
      this.gameOver = true;
      return;
    }

    this.snake.unshift(head);

    if (head.x === this.food.x && head.y === this.food.y) {
      this.score += 10;
      this.moveInterval = Math.max(0.05, this.moveInterval - 0.002);
      this.burstFood(head.x, head.y);
      this.spawnFood();
    } else {
      this.snake.pop();
    }
  }

  private burstFood(x: number, y: number) {
    const cx = x * this.tileSize + this.tileSize / 2;
    const cy = y * this.tileSize + this.tileSize / 2;
    const colors = ['#fb7185', '#facc15', '#39C5BB', '#4ade80'];
    for (let i = 0; i < 16; i++) {
      const angle = (Math.PI * 2 * i) / 16;
      const speed = 50 + (i % 5) * 12;
      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.35 + (i % 4) * 0.04,
        color: colors[i % colors.length],
      });
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const isDark = this.isDarkTheme();
    const palette = getRetroPalette(isDark);
    const boardW = this.cols * this.tileSize;
    const boardH = this.rows * this.tileSize;

    drawRetroBackground(ctx, this.width, this.height, palette, this.tileSize);

    // Pixel board texture
    for (let x = 0; x < this.cols; x++) {
      for (let y = 0; y < this.rows; y++) {
        ctx.fillStyle =
          (x + y) % 2 === 0
            ? (isDark ? 'rgba(57,197,187,0.035)' : 'rgba(13,148,136,0.040)')
            : (isDark ? 'rgba(96,165,250,0.030)' : 'rgba(37,99,235,0.030)');
        ctx.fillRect(x * this.tileSize, y * this.tileSize, this.tileSize, this.tileSize);
        ctx.fillStyle = isDark ? 'rgba(148,163,184,0.22)' : 'rgba(15,23,42,0.12)';
        ctx.fillRect(x * this.tileSize + this.tileSize / 2 - 1, y * this.tileSize + this.tileSize / 2 - 1, 2, 2);
      }
    }

    drawPixelFrame(ctx, 0, 0, boardW, boardH, palette);

    // Food
    const fx = this.food.x * this.tileSize + this.tileSize / 2;
    const fy = this.food.y * this.tileSize + this.tileSize / 2;
    const pulse = 1 + Math.sin(performance.now() / 140) * 0.08;
    ctx.save();
    ctx.shadowColor = palette.red;
    ctx.shadowBlur = 18;
    ctx.fillStyle = palette.red;
    ctx.beginPath();
    ctx.arc(fx, fy, (this.tileSize / 2 - 3) * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = palette.amber;
    ctx.fillRect(fx - 3, fy - 6, 6, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(fx - 4, fy - 5, 3, 3);
    ctx.restore();

    // Snake
    this.snake.forEach((seg, i) => {
      const pad = i === 0 ? 1 : 2;
      const x = seg.x * this.tileSize + pad;
      const y = seg.y * this.tileSize + pad;
      const size = this.tileSize - pad * 2;
      ctx.fillStyle = i === 0 ? palette.primary : i % 2 === 0 ? palette.green : '#22c55e';
      ctx.shadowColor = i === 0 ? palette.primary : palette.green;
      ctx.shadowBlur = i === 0 ? 14 : 5;
      ctx.fillRect(
        x,
        y,
        size,
        size
      );
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(x + 3, y + 3, Math.max(2, size - 6), 3);
      if (i === 0) {
        ctx.fillStyle = isDark ? '#06111a' : '#ffffff';
        ctx.fillRect(x + 5, y + 6, 3, 3);
        ctx.fillRect(x + size - 8, y + 6, 3, 3);
      }
    });

    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2.5));
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;

    // Score
    drawGlowText(ctx, `SCORE ${this.score}`, 10, this.height - 10, palette.primary, '10px "Press Start 2P", monospace');
    drawScanlines(ctx, this.width, this.height, isDark);

    // Game Over
    if (this.gameOver) {
      this.submitScoreOnce(this.score);
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.fillStyle = '#f8fafc';
      ctx.font = '16px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', this.width / 2, this.height / 2 - 20);
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillText('PRESS SPACE', this.width / 2, this.height / 2 + 16);
      ctx.textAlign = 'left';
    }
  }

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    if (e instanceof KeyboardEvent) {
      switch (e.key) {
        case 'ArrowUp':
        case 'w':
          if (this.direction !== 'DOWN') this.nextDirection = 'UP';
          break;
        case 'ArrowDown':
        case 's':
          if (this.direction !== 'UP') this.nextDirection = 'DOWN';
          break;
        case 'ArrowLeft':
        case 'a':
          if (this.direction !== 'RIGHT') this.nextDirection = 'LEFT';
          break;
        case 'ArrowRight':
        case 'd':
          if (this.direction !== 'LEFT') this.nextDirection = 'RIGHT';
          break;
        case ' ':
          if (this.gameOver) this.init();
          break;
      }
    }
    if (e instanceof TouchEvent) {
      e.preventDefault();
      // Simple touch areas for mobile
      const rect = this.canvas.getBoundingClientRect();
      const touch = e.touches[0];
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      if (Math.abs(x - cx) > Math.abs(y - cy)) {
        if (x > cx && this.direction !== 'LEFT') this.nextDirection = 'RIGHT';
        else if (x <= cx && this.direction !== 'RIGHT') this.nextDirection = 'LEFT';
      } else {
        if (y > cy && this.direction !== 'UP') this.nextDirection = 'DOWN';
        else if (y <= cy && this.direction !== 'DOWN') this.nextDirection = 'UP';
      }
    }
  }
}
