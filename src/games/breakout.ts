import { BaseGame } from '../core/game.js';

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
    (this as any)._recorded = false;
  }

  update(dt: number) {
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

  draw(ctx: CanvasRenderingContext2D) {
    const isDark = !document.documentElement.hasAttribute('data-theme') ||
      document.documentElement.getAttribute('data-theme') === 'dark';

    // Background
    ctx.fillStyle = isDark ? '#0b0f19' : '#fafafa';
    ctx.fillRect(0, 0, this.width, this.height);

    // Stars
    ctx.fillStyle = isDark ? '#334155' : '#cbd5e1';
    for (let i = 0; i < 40; i++) {
      const sx = (i * 97) % this.width;
      const sy = (i * 53) % this.height;
      ctx.fillRect(sx, sy, 2, 2);
    }

    // Bricks
    for (const brick of this.bricks) {
      if (!brick.active) continue;
      ctx.fillStyle = brick.color;
      ctx.beginPath();
      ctx.roundRect(brick.x, brick.y, this.brickWidth, this.brickHeight, 4);
      ctx.fill();
    }

    // Paddle
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.roundRect(this.paddleX, this.paddleY, this.paddleWidth, this.paddleHeight, 4);
    ctx.fill();

    // Ball
    ctx.fillStyle = isDark ? '#f8fafc' : '#1a1a2e';
    ctx.beginPath();
    ctx.arc(this.ballX, this.ballY, this.ballRadius, 0, Math.PI * 2);
    ctx.fill();

    // Score
    ctx.fillStyle = isDark ? '#e0e0e0' : '#1a1a2e';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`SCORE ${this.score}`, 8, 20);

    // Game Over / Win overlay
    if (this.gameOver || this.won) {
      if (!(this as any)._recorded) {
        (this as any)._recorded = true;
        (window as any).reportScore?.(this.score);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.textAlign = 'center';
      ctx.fillStyle = isDark ? '#e0e0e0' : '#1a1a2e';
      ctx.font = '16px "Press Start 2P", monospace';
      ctx.fillText(this.won ? 'YOU WIN!' : 'GAME OVER', this.width / 2, this.height / 2 - 20);
      ctx.font = '8px "Press Start 2P", monospace';
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
      const rect = this.canvas.getBoundingClientRect();
      const touch = e.touches[0] || e.changedTouches[0];
      if (!touch) return;
      const x = touch.clientX - rect.left;
      const scaleX = this.canvas.width / rect.width;
      const canvasX = x * scaleX;

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
