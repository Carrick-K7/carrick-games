import { BaseGame, createDefaultGameHost, type GameHost, type GameShellSnapshot } from '../core/game.js';
import {
  getRetroPalette,
  type RetroPalette,
} from '../core/render.js';
import {
  Particles,
  ScreenShake,
  FloatTexts,
  drawGlow,
  drawVignette,
  fillSphere,
  fillBevelTile,
  fx,
} from '../core/fx.js';

export class PongGame extends BaseGame {
  private paddleWidth = 12;
  private paddleHeight = 80;
  private playerY = 0;
  private aiY = 0;
  private ballX = 0;
  private ballY = 0;
  private ballRadius = 6;
  private ballDx = 260;
  private ballDy = 200;
  private playerScore = 0;
  private aiScore = 0;

  override getShellSnapshot(): GameShellSnapshot {
    return { score: this.playerScore };
  }
  private upPressed = false;
  private downPressed = false;
  private gameOver = false;
  private winner: 'player' | 'ai' | null = null;
  private paddleSpeed = 400;
  private aiSpeed = 260;
  private maxScore = 7;

  // Presentation state (visual only; gameplay values above stay untouched)
  private trailTimer = 0;
  private readonly particles = new Particles();
  private readonly floats = new FloatTexts();
  private readonly shake = new ScreenShake();

  constructor(host?: GameHost) {
    super(host ?? createDefaultGameHost('gameCanvas', 600, 400));
  }

  init() {
    this.playerY = (this.height - this.paddleHeight) / 2;
    this.aiY = (this.height - this.paddleHeight) / 2;
    this.playerScore = 0;
    this.aiScore = 0;
    this.gameOver = false;
    this.winner = null;
    this.upPressed = false;
    this.downPressed = false;
    this.trailTimer = 0;
    this.particles.clear();
    this.floats.clear();
    this.shake.reset();
    this.resetBall();
    this.resetScoreReport();
  }

  private resetBall() {
    this.ballX = this.width / 2;
    this.ballY = this.height / 2;
    this.ballDx = (Math.random() > 0.5 ? 1 : -1) * 260;
    this.ballDy = (Math.random() * 2 - 1) * 200;
  }

  update(dt: number) {
    this.particles.update(dt);
    this.floats.update(dt);
    this.shake.update(dt);

    if (this.gameOver) return;

    // Player movement
    if (this.upPressed && this.playerY > 0) {
      this.playerY -= this.paddleSpeed * dt;
    }
    if (this.downPressed && this.playerY < this.height - this.paddleHeight) {
      this.playerY += this.paddleSpeed * dt;
    }
    this.playerY = Math.max(0, Math.min(this.height - this.paddleHeight, this.playerY));

    // AI movement (follow ball with limited speed)
    const aiCenter = this.aiY + this.paddleHeight / 2;
    if (this.ballY < aiCenter - 10) {
      this.aiY -= this.aiSpeed * dt;
    } else if (this.ballY > aiCenter + 10) {
      this.aiY += this.aiSpeed * dt;
    }
    this.aiY = Math.max(0, Math.min(this.height - this.paddleHeight, this.aiY));

    // Ball movement
    this.ballX += this.ballDx * dt;
    this.ballY += this.ballDy * dt;

    // Throttled glow trail behind the ball
    this.trailTimer += dt;
    if (this.trailTimer >= 0.05) {
      this.trailTimer = 0;
      const dark = this.isDarkTheme();
      const palette = getRetroPalette(dark);
      this.particles.emit({
        x: this.ballX,
        y: this.ballY,
        count: 1,
        speed: [3, 16],
        life: [0.12, 0.2],
        size: [1.5, 3],
        colors: [palette.cyan, '#ffffff'],
        shape: 'glow',
        drag: 2,
        blend: dark ? 'lighter' : 'source-over',
      });
    }

    // Top/bottom wall collision
    if (this.ballY - this.ballRadius < 0) {
      this.ballDy = Math.abs(this.ballDy);
      this.ballY = this.ballRadius;
    } else if (this.ballY + this.ballRadius > this.height) {
      this.ballDy = -Math.abs(this.ballDy);
      this.ballY = this.height - this.ballRadius;
    }

    // Paddle collisions
    const playerX = 20;
    const aiX = this.width - 20 - this.paddleWidth;

    // Player paddle
    if (
      this.ballDx < 0 &&
      this.ballX - this.ballRadius <= playerX + this.paddleWidth &&
      this.ballX + this.ballRadius >= playerX &&
      this.ballY >= this.playerY &&
      this.ballY <= this.playerY + this.paddleHeight
    ) {
      const relativeIntersectY = (this.playerY + this.paddleHeight / 2) - this.ballY;
      const normalized = relativeIntersectY / (this.paddleHeight / 2);
      const bounceAngle = normalized * (Math.PI / 4);
      const speed = Math.sqrt(this.ballDx * this.ballDx + this.ballDy * this.ballDy) * 1.05;
      this.ballDx = Math.abs(Math.cos(bounceAngle) * speed);
      this.ballDy = -Math.sin(bounceAngle) * speed;
      this.ballX = playerX + this.paddleWidth + this.ballRadius + 1;
      this.onPaddleHit(playerX + this.paddleWidth, this.ballY, 0);
    }

    // AI paddle
    if (
      this.ballDx > 0 &&
      this.ballX + this.ballRadius >= aiX &&
      this.ballX - this.ballRadius <= aiX + this.paddleWidth &&
      this.ballY >= this.aiY &&
      this.ballY <= this.aiY + this.paddleHeight
    ) {
      const relativeIntersectY = (this.aiY + this.paddleHeight / 2) - this.ballY;
      const normalized = relativeIntersectY / (this.paddleHeight / 2);
      const bounceAngle = normalized * (Math.PI / 4);
      const speed = Math.sqrt(this.ballDx * this.ballDx + this.ballDy * this.ballDy) * 1.05;
      this.ballDx = -Math.abs(Math.cos(bounceAngle) * speed);
      this.ballDy = -Math.sin(bounceAngle) * speed;
      this.ballX = aiX - this.ballRadius - 1;
      this.onPaddleHit(aiX, this.ballY, Math.PI);
    }

    // Scoring
    if (this.ballX + this.ballRadius < 0) {
      this.aiScore++;
      this.onScore(false);
      if (this.aiScore >= this.maxScore) {
        this.gameOver = true;
        this.winner = 'ai';
      } else {
        this.resetBall();
      }
    } else if (this.ballX - this.ballRadius > this.width) {
      this.playerScore++;
      this.onScore(true);
      if (this.playerScore >= this.maxScore) {
        this.gameOver = true;
        this.winner = 'player';
      } else {
        this.resetBall();
      }
    }
  }

  private onPaddleHit(x: number, y: number, awayAngle: number) {
    const dark = this.isDarkTheme();
    const palette = getRetroPalette(dark);
    const emit = fx.sparks(x, y, awayAngle, [palette.cyan, '#ffffff', palette.primary]);
    // Additive sparks wash out on light backgrounds.
    if (!dark) emit.blend = 'source-over';
    this.particles.emit(emit);
    this.shake.add(0.15);
  }

  private onScore(playerScored: boolean) {
    const dark = this.isDarkTheme();
    const palette = getRetroPalette(dark);
    const zh = this.isZhLang();
    const cx = this.width / 2;
    const cy = this.height / 2;
    const colors = playerScored
      ? [palette.primary, palette.cyan, '#ffffff']
      : [palette.red, palette.orange, '#ffffff'];
    for (const emit of fx.pop(cx, cy, colors)) {
      if (!dark) emit.blend = 'source-over';
      this.particles.emit(emit);
    }
    const text = playerScored ? (zh ? '玩家得分！' : 'PLAYER SCORES!') : (zh ? '电脑得分！' : 'AI SCORES!');
    this.floats.add(cx, cy - 14, text, {
      color: playerScored ? palette.primary : palette.red,
      size: 17,
      life: 1.1,
    });
  }

  draw(ctx: CanvasRenderingContext2D) {
    const isDark = this.isDarkTheme();
    const palette = getRetroPalette(isDark);

    // Background
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, this.width, this.height);

    // Decorative background bars
    ctx.fillStyle = isDark ? '#1e293b' : '#e5e7eb';
    for (let y = 0; y < this.height; y += 40) {
      ctx.fillRect(30, y + 10, this.width - 60, 4);
    }

    // Center dashed line
    ctx.strokeStyle = isDark ? '#334155' : '#9ca3af';
    ctx.setLineDash([8, 8]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.width / 2, 0);
    ctx.lineTo(this.width / 2, this.height);
    ctx.stroke();
    ctx.setLineDash([]);

    this.shake.apply(ctx, () => {
      this.drawPaddles(ctx, palette);
      this.drawBall(ctx, palette, isDark);
      this.particles.draw(ctx);
    });

    this.floats.draw(ctx);
    drawVignette(ctx, this.width, this.height, isDark ? 0.26 : 0.14);

    // Score
    ctx.fillStyle = palette.text;
    ctx.font = '48px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(this.playerScore), this.width / 2 - 40, 40);
    ctx.fillText(String(this.aiScore), this.width / 2 + 40, 40);

    // Game over overlay
    if (this.gameOver) {
      this.submitScoreOnce(this.playerScore);
      const zh = this.isZhLang();
      this.drawResultOverlay(ctx, {
        title: this.winner === 'player' ? (zh ? '你赢了！' : 'YOU WIN!') : (zh ? '游戏结束' : 'GAME OVER'),
        tone: this.winner === 'player' ? 'success' : 'danger',
        details: [`${this.playerScore} : ${this.aiScore}`],
        hint: zh ? '点击或按空格重新开始' : 'CLICK OR PRESS SPACE',
      });
    }
  }

  private drawPaddles(ctx: CanvasRenderingContext2D, palette: RetroPalette) {
    const playerX = 20;
    const aiX = this.width - 20 - this.paddleWidth;
    fillBevelTile(ctx, playerX, this.playerY, this.paddleWidth, this.paddleHeight, 6, palette.primary);
    fillBevelTile(ctx, aiX, this.aiY, this.paddleWidth, this.paddleHeight, 6, palette.violet);
  }

  private drawBall(ctx: CanvasRenderingContext2D, palette: RetroPalette, isDark: boolean) {
    const speed = Math.hypot(this.ballDx, this.ballDy);
    // Glow scales with ball speed so acceleration stays readable
    const glowIntensity = Math.min(0.6, 0.2 + (speed - 260) / 900);
    if (isDark && glowIntensity > 0.05) {
      drawGlow(ctx, this.ballX, this.ballY, this.ballRadius * 3.2, palette.cyan, glowIntensity);
    }
    fillSphere(ctx, this.ballX, this.ballY, this.ballRadius, isDark ? '#e2e8f0' : '#334155', {
      rim: 0.3,
      rimColor: palette.cyan,
    });
  }

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    if (this.gameOver && this.isRestartInput(e)) {
      if (e instanceof TouchEvent) e.preventDefault();
      this.init();
      return;
    }

    if (e instanceof KeyboardEvent) {
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        this.upPressed = e.type === 'keydown';
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        this.downPressed = e.type === 'keydown';
      } else if (e.key === ' ' && this.gameOver) {
        this.init();
      }
      return;
    }

    if (e instanceof TouchEvent) {
      e.preventDefault();
      const touch = e.touches[0] || e.changedTouches[0];
      if (!touch) return;
      const { y: canvasY } = this.canvasPoint(touch.clientX, touch.clientY);

      if (this.gameOver) {
        this.init();
        return;
      }

      if (canvasY < this.height / 2) {
        this.upPressed = true;
        this.downPressed = false;
      } else {
        this.downPressed = true;
        this.upPressed = false;
      }

      if (e.type === 'touchend') {
        this.upPressed = false;
        this.downPressed = false;
      }
    }
    if (e instanceof MouseEvent && e.type === 'mousedown' && this.gameOver) {
      this.init();
    }
  }
}
