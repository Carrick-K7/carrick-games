import { BaseGame, createDefaultGameHost, type GameHost, type GameShellSnapshot } from '../core/game.js';
import {
  getRetroPalette,
} from '../core/render.js';
import {
  Particles,
  ScreenShake,
  FloatTexts,
  drawGlow,
  drawVignette,
  fillSphere,
  fillBevelTile,
  shade,
  fx,
} from '../core/fx.js';

type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

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

  override getShellSnapshot(): GameShellSnapshot {
    return { score: this.score };
  }
  private gameOver = false;

  // Presentation state (visual only; gameplay values above stay untouched)
  private time = 0;
  private trailTimer = 0;
  private readonly particles = new Particles();
  private readonly floats = new FloatTexts();
  private readonly shake = new ScreenShake();

  constructor(host?: GameHost) {
    super(host ?? createDefaultGameHost('gameCanvas', 400, 400));
  }

  init() {
    this.snake = [{ x: 5, y: 10 }, { x: 4, y: 10 }, { x: 3, y: 10 }];
    this.direction = 'RIGHT';
    this.nextDirection = 'RIGHT';
    this.score = 0;
    this.gameOver = false;
    this.moveTimer = 0;
    this.moveInterval = 0.12;
    this.time = 0;
    this.trailTimer = 0;
    this.particles.clear();
    this.floats.clear();
    this.shake.reset();
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
    this.time += dt;
    this.particles.update(dt);
    this.floats.update(dt);
    this.shake.update(dt);

    if (this.gameOver) return;
    this.moveTimer += dt;

    // Throttled soft glow trail behind the head
    this.trailTimer += dt;
    if (this.trailTimer >= 0.09) {
      this.trailTimer = 0;
      const head = this.snake[0];
      if (head) {
        const dark = this.isDarkTheme();
        const palette = getRetroPalette(dark);
        this.particles.emit({
          x: head.x * this.tileSize + this.tileSize / 2,
          y: head.y * this.tileSize + this.tileSize / 2,
          count: 1,
          speed: [3, 14],
          life: [0.12, 0.22],
          size: [2, 4],
          colors: [palette.primary, palette.green],
          shape: 'glow',
          drag: 2,
          blend: dark ? 'lighter' : 'source-over',
        });
      }
    }

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
      this.onDeath(head);
      return;
    }

    // Self collision
    if (this.snake.some(s => s.x === head.x && s.y === head.y)) {
      this.onDeath(head);
      return;
    }

    this.snake.unshift(head);

    if (head.x === this.food.x && head.y === this.food.y) {
      this.score += 10;
      this.moveInterval = Math.max(0.05, this.moveInterval - 0.002);
      this.onEat(head.x, head.y);
      this.spawnFood();
    } else {
      this.snake.pop();
    }
  }

  private onEat(x: number, y: number) {
    const dark = this.isDarkTheme();
    const palette = getRetroPalette(dark);
    const cx = x * this.tileSize + this.tileSize / 2;
    const cy = y * this.tileSize + this.tileSize / 2;
    const colors = [palette.red, palette.amber, palette.orange, '#ffffff'];
    for (const emit of fx.pop(cx, cy, colors)) {
      // Additive particles wash out on light backgrounds.
      if (!dark) emit.blend = 'source-over';
      this.particles.emit(emit);
    }
    this.floats.add(cx, cy - 6, '+10', { color: palette.amber, size: 13 });
  }

  private onDeath(head: { x: number; y: number }) {
    this.gameOver = true;
    const dark = this.isDarkTheme();
    const palette = getRetroPalette(dark);
    const cx = (Math.max(0, Math.min(this.cols - 1, head.x))) * this.tileSize + this.tileSize / 2;
    const cy = (Math.max(0, Math.min(this.rows - 1, head.y))) * this.tileSize + this.tileSize / 2;
    const colors = [palette.primary, palette.green, palette.red, '#ffffff'];
    for (const emit of fx.explosion(cx, cy, colors)) {
      if (!dark && emit.shape !== 'glow') emit.blend = 'source-over';
      this.particles.emit(emit);
    }
    this.shake.add(0.5);
  }

  draw(ctx: CanvasRenderingContext2D) {
    const isDark = this.isDarkTheme();
    const palette = getRetroPalette(isDark);
    const boardW = this.cols * this.tileSize;
    const boardH = this.rows * this.tileSize;

    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, this.width, this.height);

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

    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, boardW - 1, boardH - 1);

    this.shake.apply(ctx, () => {
      this.drawFood(ctx, palette);
      this.drawSnake(ctx, palette, isDark);
      this.particles.draw(ctx);
    });

    this.floats.draw(ctx);
    drawVignette(ctx, this.width, this.height, isDark ? 0.26 : 0.14);

    // Game Over
    if (this.gameOver) {
      this.submitScoreOnce(this.score);
      const zh = this.isZhLang();
      this.drawResultOverlay(ctx, {
        title: zh ? '游戏结束' : 'GAME OVER',
        tone: 'danger',
        details: [`${zh ? '得分' : 'SCORE'} ${this.score}`],
        hint: zh ? '点击或按空格重新开始' : 'CLICK OR PRESS SPACE',
      });
    }
  }

  private drawFood(ctx: CanvasRenderingContext2D, palette: ReturnType<typeof getRetroPalette>) {
    const cx = this.food.x * this.tileSize + this.tileSize / 2;
    const cy = this.food.y * this.tileSize + this.tileSize / 2;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 4.5);
    drawGlow(ctx, cx, cy, this.tileSize * (0.85 + 0.25 * pulse), palette.red, 0.35 + 0.25 * pulse);
    fillSphere(ctx, cx, cy, (this.tileSize / 2 - 3) * (1 + pulse * 0.08), palette.red, { rim: 0.3, rimColor: palette.amber });
    // Tiny stem
    ctx.fillStyle = shade(palette.green, -0.2);
    ctx.beginPath();
    ctx.roundRect(cx - 1, cy - (this.tileSize / 2 - 2), 2, 4, 1);
    ctx.fill();
  }

  private drawSnake(ctx: CanvasRenderingContext2D, palette: ReturnType<typeof getRetroPalette>, isDark: boolean) {
    const len = this.snake.length;
    this.snake.forEach((seg, i) => {
      const pad = i === 0 ? 1 : 2;
      const x = seg.x * this.tileSize + pad;
      const y = seg.y * this.tileSize + pad;
      const size = this.tileSize - pad * 2;
      // Per-segment shade gradient toward the tail
      const t = len > 1 ? i / (len - 1) : 0;
      const base = i === 0 ? palette.primary : shade(palette.green, -0.12 - 0.3 * t);
      fillBevelTile(ctx, x, y, size, size, 5, base, { gloss: i === 0 || i % 2 === 0 });
      if (i === 0) {
        this.drawEyes(ctx, x, y, size, isDark);
      }
    });
  }

  private drawEyes(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, isDark: boolean) {
    // Eyes look along the current direction of travel
    let dx = 0;
    let dy = 0;
    switch (this.direction) {
      case 'UP': dy = -1; break;
      case 'DOWN': dy = 1; break;
      case 'LEFT': dx = -1; break;
      case 'RIGHT': dx = 1; break;
    }
    const cx = x + size / 2;
    const cy = y + size / 2;
    const perpX = -dy;
    const perpY = dx;
    const eyeSep = size * 0.26;
    const forward = size * 0.16;
    const white = isDark ? '#f8fafc' : '#ffffff';
    const pupil = isDark ? '#06111a' : '#0f172a';
    for (const side of [-1, 1]) {
      const ex = cx + perpX * eyeSep * side + dx * forward;
      const ey = cy + perpY * eyeSep * side + dy * forward;
      ctx.fillStyle = white;
      ctx.beginPath();
      ctx.arc(ex, ey, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = pupil;
      ctx.beginPath();
      ctx.arc(ex + dx * 0.9, ey + dy * 0.9, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    if (this.gameOver && this.isRestartInput(e)) {
      if (e instanceof TouchEvent) e.preventDefault();
      this.init();
      return;
    }

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
      if (e.type !== 'touchstart') return;
      if (this.gameOver) {
        this.init();
        return;
      }
      // Simple touch areas for mobile
      const touch = e.touches[0];
      if (!touch) return;
      const { x, y } = this.canvasPoint(touch.clientX, touch.clientY);
      const cx = this.width / 2;
      const cy = this.height / 2;
      if (Math.abs(x - cx) > Math.abs(y - cy)) {
        if (x > cx && this.direction !== 'LEFT') this.nextDirection = 'RIGHT';
        else if (x <= cx && this.direction !== 'RIGHT') this.nextDirection = 'LEFT';
      } else {
        if (y > cy && this.direction !== 'UP') this.nextDirection = 'DOWN';
        else if (y <= cy && this.direction !== 'DOWN') this.nextDirection = 'UP';
      }
    }
    if (e instanceof MouseEvent && e.type === 'mousedown' && this.gameOver) {
      this.init();
    }
  }
}
