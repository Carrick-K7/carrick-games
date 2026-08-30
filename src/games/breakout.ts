import { BaseGame, createDefaultGameHost, type GameHost, type GameShellSnapshot } from '../core/game.js';
import { getRetroPalette } from '../core/render.js';
import {
  FloatTexts,
  Particles,
  ScreenShake,
  drawGlow,
  drawVignette,
  fillBevelTile,
  fillSphere,
  fx,
} from '../core/fx.js';

export class BreakoutGame extends BaseGame {
  private paddleWidth = 80;
  private paddleHeight = 12;
  private paddleX = 0;
  private paddleY = 0;
  private ballRadius = 6;
  private ballX = 0;
  private ballY = 0;
  private ballDx = 240;
  private ballDy = -240;
  private brickRows = 4;
  private brickCols = 6;
  private brickWidth = 0;
  private brickHeight = 20;
  private brickPadding = 8;
  private brickOffsetTop = 40;
  private brickOffsetLeft = 0;
  private bricks: { x: number; y: number; active: boolean; color: string }[] = [];
  private score = 0;

  override getShellSnapshot(): GameShellSnapshot {
    return { score: this.score };
  }
  private gameOver = false;
  private won = false;
  private rightPressed = false;
  private leftPressed = false;
  private destroyedCount = 0;
  private trailTimer = 0;
  private readonly particles = new Particles();
  private readonly floats = new FloatTexts();
  private readonly shake = new ScreenShake();

  constructor(host?: GameHost) {
    super(host ?? createDefaultGameHost('gameCanvas', 480, 360));
  }

  init() {
    this.paddleX = (this.width - this.paddleWidth) / 2;
    this.paddleY = this.height - 30;
    this.ballX = this.width / 2;
    this.ballY = this.paddleY - this.ballRadius - 2;
    this.ballDx = 240;
    this.ballDy = -240;
    this.score = 0;
    this.gameOver = false;
    this.won = false;
    this.destroyedCount = 0;
    this.rightPressed = false;
    this.leftPressed = false;
    this.trailTimer = 0;
    this.particles.clear();
    this.floats.clear();
    this.shake.reset();

    this.brickWidth =
      (this.width - (this.brickPadding * (this.brickCols + 1))) / this.brickCols;
    this.brickOffsetLeft = this.brickPadding;

    const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e'];
    this.bricks = [];
    for (let r = 0; r < this.brickRows; r++) {
      for (let c = 0; c < this.brickCols; c++) {
        this.bricks.push({
          x: this.brickOffsetLeft + c * (this.brickWidth + this.brickPadding),
          y: this.brickOffsetTop + r * (this.brickHeight + this.brickPadding),
          active: true,
          color: colors[r % colors.length],
        });
      }
    }
    this.resetScoreReport();
  }

  update(dt: number) {
    this.particles.update(dt);
    this.floats.update(dt);
    this.shake.update(dt);

    if (this.gameOver || this.won) return;

    this.trailTimer += dt;
    while (this.trailTimer >= 1 / 40) {
      this.trailTimer -= 1 / 40;
      this.particles.emit({
        x: this.ballX,
        y: this.ballY,
        count: 1,
        speed: [2, 10],
        life: [0.12, 0.22],
        size: [2, 4],
        colors: [getRetroPalette(this.isDarkTheme()).cyan],
        shape: 'glow',
        drag: 3,
        blend: this.isDarkTheme() ? 'lighter' : 'source-over',
      });
    }

    // Paddle movement
    if (this.rightPressed && this.paddleX < this.width - this.paddleWidth) {
      this.paddleX += 360 * dt;
    } else if (this.leftPressed && this.paddleX > 0) {
      this.paddleX -= 360 * dt;
    }
    // Clamp paddle
    this.paddleX = Math.max(0, Math.min(this.width - this.paddleWidth, this.paddleX));

    // Ball movement
    this.ballX += this.ballDx * dt;
    this.ballY += this.ballDy * dt;

    // Wall collisions
    if (this.ballX + this.ballRadius > this.width || this.ballX - this.ballRadius < 0) {
      this.ballDx = -this.ballDx;
      this.ballX = Math.max(this.ballRadius, Math.min(this.width - this.ballRadius, this.ballX));
    }
    if (this.ballY - this.ballRadius < 0) {
      this.ballDy = -this.ballDy;
      this.ballY = this.ballRadius;
    }

    // Paddle collision
    if (
      this.ballY + this.ballRadius >= this.paddleY &&
      this.ballY - this.ballRadius <= this.paddleY + this.paddleHeight &&
      this.ballX >= this.paddleX &&
      this.ballX <= this.paddleX + this.paddleWidth
    ) {
      this.ballDy = -Math.abs(this.ballDy);
      // Add slight horizontal deflection based on where ball hits paddle
      const hitPos = (this.ballX - (this.paddleX + this.paddleWidth / 2)) / (this.paddleWidth / 2);
      this.ballDx = hitPos * 300;
      this.ballY = this.paddleY - this.ballRadius - 0.5;
      this.emitHit(this.ballX, this.paddleY, '#38bdf8', false);
    }

    // Floor collision -> game over
    if (this.ballY + this.ballRadius > this.height) {
      this.gameOver = true;
      const palette = getRetroPalette(this.isDarkTheme());
      for (const emit of fx.explosion(this.ballX, this.height - 4, [palette.red, palette.orange, palette.amber])) {
        if (!this.isDarkTheme()) emit.blend = 'source-over';
        this.particles.emit(emit);
      }
      this.shake.add(0.55);
      return;
    }

    // Brick collisions
    for (const brick of this.bricks) {
      if (!brick.active) continue;
      if (
        this.ballX > brick.x &&
        this.ballX < brick.x + this.brickWidth &&
        this.ballY > brick.y &&
        this.ballY < brick.y + this.brickHeight
      ) {
        this.ballDy = -this.ballDy;
        brick.active = false;
        this.score += 10;
        this.destroyedCount++;
        this.emitHit(this.ballX, this.ballY, brick.color);
        if (this.destroyedCount % 5 === 0) {
          const speed = Math.sqrt(this.ballDx ** 2 + this.ballDy ** 2);
          const newSpeed = Math.min(600, speed * 1.08);
          const angle = Math.atan2(this.ballDy, this.ballDx);
          this.ballDx = Math.cos(angle) * newSpeed;
          this.ballDy = Math.sin(angle) * newSpeed;
        }
        break;
      }
    }

    if (this.destroyedCount === this.bricks.length) {
      this.won = true;
      const palette = getRetroPalette(this.isDarkTheme());
      const emit = fx.confetti(this.width / 2, 10, [palette.primary, palette.cyan, palette.amber, palette.violet]);
      this.particles.emit(emit);
    }
  }

  private emitHit(x: number, y: number, color: string, showScore = true) {
    const emits = showScore ? fx.pop(x, y, [color, '#ffffff']) : [fx.sparks(x, y, -Math.PI / 2, [color, '#ffffff'])];
    for (const emit of emits) {
      if (!this.isDarkTheme()) emit.blend = 'source-over';
      this.particles.emit(emit);
    }
    if (showScore) this.floats.add(x, y - 8, '+10', { color, size: 12, life: 0.65, rise: 32 });
    this.shake.add(showScore ? 0.08 : 0.05);
  }

  draw(ctx: CanvasRenderingContext2D) {
    const isDark = this.isDarkTheme();
    const palette = getRetroPalette(isDark);

    const bg = ctx.createLinearGradient(0, 0, 0, this.height);
    bg.addColorStop(0, palette.bg2);
    bg.addColorStop(1, palette.bg);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.width, this.height);

    // Restrained depth texture; the playfield remains easy to scan.
    for (let i = 0; i < 54; i++) {
      const sx = (i * 97) % this.width;
      const sy = (i * 53) % this.height;
      ctx.fillStyle = i % 3 === 0 ? palette.cyan : i % 3 === 1 ? palette.primary : palette.muted;
      ctx.globalAlpha = isDark ? 0.3 : 0.14;
      ctx.fillRect(sx, sy, i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1);
    }
    ctx.globalAlpha = 1;

    this.shake.apply(ctx, () => {
      for (const brick of this.bricks) {
        if (!brick.active) continue;
        fillBevelTile(ctx, brick.x, brick.y, this.brickWidth, this.brickHeight, 4, brick.color, {
          border: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(15,23,42,0.2)',
        });
      }

      fillBevelTile(ctx, this.paddleX, this.paddleY, this.paddleWidth, this.paddleHeight, 5, palette.cyan, {
        border: palette.primary,
      });

      drawGlow(ctx, this.ballX, this.ballY, 22, palette.cyan, isDark ? 0.45 : 0.18);
      fillSphere(ctx, this.ballX, this.ballY, this.ballRadius, isDark ? '#e2f7ff' : '#ffffff', {
        rim: 0.35,
        rimColor: palette.blue,
      });

      this.particles.draw(ctx);
    });

    drawVignette(ctx, this.width, this.height, isDark ? 0.24 : 0.12);
    this.floats.draw(ctx);

    ctx.fillStyle = palette.text;
    ctx.font = '14px system-ui, sans-serif';
    ctx.textBaseline = 'alphabetic';
    const liveBricks = this.bricks.length - this.destroyedCount;
    ctx.textAlign = 'right';
    ctx.fillText(`${this.isZhLang() ? '砖块' : 'BRICKS'} ${liveBricks}`, this.width - 10, 22);

    if (this.gameOver || this.won) {
      this.submitScoreOnce(this.score);
      const zh = this.isZhLang();
      this.drawResultOverlay(ctx, {
        title: this.won ? (zh ? '胜利！' : 'YOU WIN!') : (zh ? '游戏结束' : 'GAME OVER'),
        tone: this.won ? 'success' : 'danger',
        details: [`${zh ? '得分' : 'SCORE'} ${this.score}`],
        hint: zh ? '点击或按空格重新开始' : 'CLICK OR PRESS SPACE',
      });
    }
  }

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    if ((this.gameOver || this.won) && this.isRestartInput(e)) {
      if (e instanceof TouchEvent) e.preventDefault();
      this.init();
      return;
    }

    if (e instanceof KeyboardEvent) {
      if (e.key === 'Right' || e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        this.rightPressed = e.type === 'keydown';
      } else if (e.key === 'Left' || e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        this.leftPressed = e.type === 'keydown';
      } else if (e.key === ' ' && (this.gameOver || this.won)) {
        this.init();
      }
      return;
    }

    if (e instanceof TouchEvent) {
      e.preventDefault();
      const touch = e.touches[0] || e.changedTouches[0];
      if (!touch) return;
      const canvasX = this.canvasPoint(touch.clientX, touch.clientY).x;

      if (this.gameOver || this.won) {
        this.init();
        return;
      }

      // Touch left/right thirds to move paddle
      if (canvasX < this.width * 0.4) {
        this.leftPressed = true;
        this.rightPressed = false;
      } else if (canvasX > this.width * 0.6) {
        this.rightPressed = true;
        this.leftPressed = false;
      } else {
        this.rightPressed = false;
        this.leftPressed = false;
      }

      // On touch end, stop movement
      if (e.type === 'touchend') {
        this.rightPressed = false;
        this.leftPressed = false;
      }
    }
  }
}
