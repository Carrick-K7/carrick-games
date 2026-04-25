import { BaseGame } from '../core/game.js';
import {
  getRetroPalette,
} from '../core/render.js';

type HitParticle = { x: number; y: number; vx: number; vy: number; life: number; color: string };

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
  private gameOver = false;
  private won = false;
  private rightPressed = false;
  private leftPressed = false;
  private destroyedCount = 0;
  private hitParticles: HitParticle[] = [];

  constructor() {
    super('gameCanvas', 480, 360);
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
    this.hitParticles = [];

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
    this.hitParticles = this.hitParticles
      .map((p) => ({
        ...p,
        x: p.x + p.vx * dt,
        y: p.y + p.vy * dt,
        vy: p.vy + 150 * dt,
        life: p.life - dt,
      }))
      .filter((p) => p.life > 0);

    if (this.gameOver || this.won) return;

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
      this.emitHit(this.ballX, this.paddleY, '#38bdf8');
    }

    // Floor collision -> game over
    if (this.ballY + this.ballRadius > this.height) {
      this.gameOver = true;
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
    }
  }

  private emitHit(x: number, y: number, color: string) {
    for (let i = 0; i < 12; i++) {
      const angle = -Math.PI + (Math.PI * 2 * i) / 12;
      const speed = 60 + (i % 4) * 25;
      this.hitParticles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.28 + (i % 3) * 0.06,
        color,
      });
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const isDark = this.isDarkTheme();
    const palette = getRetroPalette(isDark);

    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, this.width, this.height);

    // Parallax starfield
    for (let i = 0; i < 54; i++) {
      const sx = (i * 97) % this.width;
      const sy = (i * 53) % this.height;
      ctx.fillStyle = i % 3 === 0 ? palette.cyan : i % 3 === 1 ? palette.primary : palette.muted;
      ctx.globalAlpha = isDark ? 0.45 : 0.25;
      ctx.fillRect(sx, sy, i % 5 === 0 ? 3 : 2, i % 5 === 0 ? 3 : 2);
    }
    ctx.globalAlpha = 1;

    // Bricks
    for (const brick of this.bricks) {
      if (!brick.active) continue;
      ctx.fillStyle = brick.color;
      ctx.beginPath();
      ctx.roundRect(brick.x, brick.y, this.brickWidth, this.brickHeight, 4);
      ctx.fill();
      ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 1;
      ctx.strokeRect(brick.x + 1.5, brick.y + 1.5, this.brickWidth - 3, this.brickHeight - 3);
    }

    // Paddle
    const paddleGrad = ctx.createLinearGradient(this.paddleX, this.paddleY, this.paddleX, this.paddleY + this.paddleHeight);
    paddleGrad.addColorStop(0, '#7dd3fc');
    paddleGrad.addColorStop(0.5, '#38bdf8');
    paddleGrad.addColorStop(1, palette.primary);
    ctx.shadowColor = 'rgba(0,0,0,0.15)';
    ctx.shadowBlur = 6;
    ctx.fillStyle = paddleGrad;
    ctx.beginPath();
    ctx.roundRect(this.paddleX, this.paddleY, this.paddleWidth, this.paddleHeight, 4);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.40)';
    ctx.fillRect(this.paddleX + 8, this.paddleY + 2, this.paddleWidth - 16, 2);

    // Ball
    ctx.shadowColor = 'rgba(0,0,0,0.15)';
    ctx.shadowBlur = 6;
    ctx.fillStyle = isDark ? '#f8fafc' : '#ffffff';
    ctx.beginPath();
    ctx.arc(this.ballX, this.ballY, this.ballRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = palette.blue;
    ctx.lineWidth = 2;
    ctx.stroke();

    for (const p of this.hitParticles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 3));
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;

    // Score
    ctx.textAlign = 'left';
    ctx.fillStyle = palette.text;
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const liveBricks = this.bricks.length - this.destroyedCount;
    ctx.textAlign = 'right';
    ctx.fillText(`BRICKS ${liveBricks}`, this.width - 10, 22);

    // Game Over / Win overlay
    if (this.gameOver || this.won) {
      this.submitScoreOnce(this.score);
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.fillText(this.won ? 'YOU WIN!' : 'GAME OVER', this.width / 2, this.height / 2 - 20);
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText('PRESS SPACE', this.width / 2, this.height / 2 + 16);
    }
  }

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
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
