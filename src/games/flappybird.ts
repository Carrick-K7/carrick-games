import { BaseGame } from '../core/game.js';

interface Pipe {
  x: number;
  topHeight: number;
  gap: number;
  width: number;
  passed: boolean;
}

export class FlappyBirdGame extends BaseGame {
  private bird = { x: 80, y: 0, radius: 12, velocity: 0 };
  private gravity = 900;
  private jumpVelocity = -280;
  private pipes: Pipe[] = [];
  private pipeWidth = 52;
  private pipeGap = 110;
  private pipeSpeed = 160;
  private spawnTimer = 0;
  private spawnInterval = 1.6;
  private score = 0;
  private gameOver = false;
  private groundHeight = 40;

  constructor() {
    super('gameCanvas', 400, 560);
  }

  init() {
    this.bird.y = this.height / 2;
    this.bird.velocity = 0;
    this.pipes = [];
    this.score = 0;
    this.gameOver = false;
    this.spawnTimer = 0;
    this.resetScoreReport();
  }

  private spawnPipe() {
    const minTop = 40;
    const maxTop = this.height - this.groundHeight - this.pipeGap - minTop;
    const topHeight = minTop + Math.random() * (maxTop - minTop);
    this.pipes.push({
      x: this.width,
      topHeight,
      gap: this.pipeGap,
      width: this.pipeWidth,
      passed: false,
    });
  }

  private jump() {
    if (this.gameOver) {
      this.init();
      return;
    }
    this.bird.velocity = this.jumpVelocity;
  }

  private checkCollision(pipe: Pipe): boolean {
    const bx = this.bird.x;
    const by = this.bird.y;
    const br = this.bird.radius;
    // Pipe body (use slightly smaller hitbox for fairness)
    const px = pipe.x;
    const pw = pipe.width;
    const inPipeX = bx + br > px && bx - br < px + pw;
    const inTop = by - br < pipe.topHeight;
    const inBottom = by + br > this.height - this.groundHeight - (this.height - this.groundHeight - pipe.topHeight - pipe.gap);
    // Simpler: compute bottom pipe y
    const bottomY = pipe.topHeight + pipe.gap;
    const inBottomPipe = by + br > bottomY;
    if (inPipeX && (inTop || inBottomPipe)) return true;
    return false;
  }

  update(dt: number) {
    if (this.gameOver) return;

    this.bird.velocity += this.gravity * dt;
    this.bird.y += this.bird.velocity * dt;

    // Ground / ceiling collision
    if (this.bird.y + this.bird.radius > this.height - this.groundHeight) {
      this.bird.y = this.height - this.groundHeight - this.bird.radius;
      this.gameOver = true;
      return;
    }
    if (this.bird.y - this.bird.radius < 0) {
      this.bird.y = this.bird.radius;
      this.bird.velocity = 0;
    }

    // Spawn pipes
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer = 0;
      this.spawnPipe();
    }

    // Update pipes
    for (const pipe of this.pipes) {
      pipe.x -= this.pipeSpeed * dt;
      if (!pipe.passed && pipe.x + pipe.width < this.bird.x) {
        pipe.passed = true;
        this.score += 1;
      }
      if (this.checkCollision(pipe)) {
        this.gameOver = true;
        return;
      }
    }

    // Remove off-screen pipes
    this.pipes = this.pipes.filter(p => p.x + p.width > -10);
  }

  draw(ctx: CanvasRenderingContext2D) {
    const isDark = this.isDarkTheme();

    // Sky
    ctx.fillStyle = isDark ? '#0b0f19' : '#fafafa';
    ctx.fillRect(0, 0, this.width, this.height);

    // Background city silhouette (simple)
    ctx.fillStyle = isDark ? '#111827' : '#e5e7eb';
    ctx.beginPath();
    ctx.moveTo(0, this.height - this.groundHeight);
    for (let i = 0; i <= this.width; i += 40) {
      const h = 30 + (i % 80 === 0 ? 40 : 20);
      ctx.lineTo(i, this.height - this.groundHeight - h);
      ctx.lineTo(i + 20, this.height - this.groundHeight - h);
    }
    ctx.lineTo(this.width, this.height - this.groundHeight);
    ctx.closePath();
    ctx.fill();

    // Pipes
    ctx.fillStyle = '#22c55e';
    ctx.strokeStyle = '#14532d';
    ctx.lineWidth = 2;
    for (const pipe of this.pipes) {
      // Top pipe
      ctx.fillRect(pipe.x, 0, pipe.width, pipe.topHeight);
      ctx.strokeRect(pipe.x, 0, pipe.width, pipe.topHeight);
      // Top pipe cap
      ctx.fillRect(pipe.x - 4, pipe.topHeight - 20, pipe.width + 8, 20);
      ctx.strokeRect(pipe.x - 4, pipe.topHeight - 20, pipe.width + 8, 20);

      // Bottom pipe
      const bottomY = pipe.topHeight + pipe.gap;
      const bottomH = this.height - this.groundHeight - bottomY;
      ctx.fillRect(pipe.x, bottomY, pipe.width, bottomH);
      ctx.strokeRect(pipe.x, bottomY, pipe.width, bottomH);
      // Bottom pipe cap
      ctx.fillRect(pipe.x - 4, bottomY, pipe.width + 8, 20);
      ctx.strokeRect(pipe.x - 4, bottomY, pipe.width + 8, 20);
    }

    // Ground
    ctx.fillStyle = '#78350f';
    ctx.fillRect(0, this.height - this.groundHeight, this.width, this.groundHeight);
    ctx.fillStyle = '#92400e';
    ctx.fillRect(0, this.height - this.groundHeight, this.width, 6);

    // Bird
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(this.bird.x, this.bird.y, this.bird.radius, 0, Math.PI * 2);
    ctx.fill();
    // Eye
    ctx.fillStyle = isDark ? '#0f172a' : '#1a1a2e';
    ctx.beginPath();
    ctx.arc(this.bird.x + 4, this.bird.y - 4, 3, 0, Math.PI * 2);
    ctx.fill();
    // Beak
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.moveTo(this.bird.x + 6, this.bird.y + 2);
    ctx.lineTo(this.bird.x + 16, this.bird.y + 6);
    ctx.lineTo(this.bird.x + 6, this.bird.y + 10);
    ctx.closePath();
    ctx.fill();
    // Wing
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.ellipse(this.bird.x - 4, this.bird.y + 4, 6, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Score
    ctx.fillStyle = isDark ? '#e0e0e0' : '#1a1a2e';
    ctx.font = '16px system-ui, sans-serif';
    ctx.textAlign = 'left';
    // Game Over
    if (this.gameOver) {
      this.submitScoreOnce(this.score);
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.fillStyle = isDark ? '#e0e0e0' : '#1a1a2e';
      ctx.font = '24px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', this.width / 2, this.height / 2 - 30);
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillText(`SCORE ${this.score}`, this.width / 2, this.height / 2 + 10);
      ctx.fillText('PRESS SPACE', this.width / 2, this.height / 2 + 40);
      ctx.textAlign = 'left';
    }
  }

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    if (e instanceof KeyboardEvent) {
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        if (e.type === 'keydown') {
          // Prevent repeated jumps from key hold
          if (e.repeat) return;
          this.jump();
        }
      }
      return;
    }

    if (e instanceof TouchEvent) {
      e.preventDefault();
      if (e.type === 'touchstart') {
        this.jump();
      }
      return;
    }

    if (e instanceof MouseEvent && e.type === 'mousedown') {
      this.jump();
    }
  }
}
