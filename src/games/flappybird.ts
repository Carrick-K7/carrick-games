import { BaseGame, createDefaultGameHost, type GameHost, type GameShellSnapshot } from '../core/game.js';
import { getRetroPalette } from '../core/render.js';
import {
  FloatTexts,
  Particles,
  ScreenShake,
  drawSprite,
  drawVignette,
  fillBevelTile,
  fillSphere,
  fx,
  makeSprite,
  shade,
} from '../core/fx.js';

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

  override getShellSnapshot(): GameShellSnapshot {
    return { score: this.score };
  }
  private gameOver = false;
  private groundHeight = 40;
  private time = 0;
  private readonly particles = new Particles();
  private readonly floats = new FloatTexts();
  private readonly shake = new ScreenShake();
  private spriteTheme: boolean | null = null;
  private birdSprite: HTMLCanvasElement | null = null;

  constructor(host?: GameHost) {
    super(host ?? createDefaultGameHost('gameCanvas', 400, 560));
  }

  init() {
    this.bird.y = this.height / 2;
    this.bird.velocity = 0;
    this.pipes = [];
    this.score = 0;
    this.gameOver = false;
    this.spawnTimer = 0;
    this.time = 0;
    this.particles.clear();
    this.floats.clear();
    this.shake.reset();
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
    const palette = getRetroPalette(this.isDarkTheme());
    const emit = fx.sparks(this.bird.x - 8, this.bird.y + 7, Math.PI, [palette.amber, palette.orange]);
    if (!this.isDarkTheme()) emit.blend = 'source-over';
    emit.count = 4;
    this.particles.emit(emit);
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
    this.particles.update(dt);
    this.floats.update(dt);
    this.shake.update(dt);
    this.time += dt;
    if (this.gameOver) return;

    this.bird.velocity += this.gravity * dt;
    this.bird.y += this.bird.velocity * dt;

    // Ground / ceiling collision
    if (this.bird.y + this.bird.radius > this.height - this.groundHeight) {
      this.bird.y = this.height - this.groundHeight - this.bird.radius;
      this.die();
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
        const palette = getRetroPalette(this.isDarkTheme());
        for (const emit of fx.pop(this.bird.x, this.bird.y, [palette.amber, palette.primary])) {
          if (!this.isDarkTheme()) emit.blend = 'source-over';
          this.particles.emit(emit);
        }
        this.floats.add(this.bird.x, this.bird.y - 12, '+1', { color: palette.amber, size: 14 });
      }
      if (this.checkCollision(pipe)) {
        this.die();
        return;
      }
    }

    // Remove off-screen pipes
    this.pipes = this.pipes.filter(p => p.x + p.width > -10);
  }

  private die() {
    if (this.gameOver) return;
    this.gameOver = true;
    const palette = getRetroPalette(this.isDarkTheme());
    for (const emit of fx.explosion(this.bird.x, this.bird.y, [palette.amber, palette.orange, palette.red])) {
      if (!this.isDarkTheme()) emit.blend = 'source-over';
      this.particles.emit(emit);
    }
    this.shake.add(0.65);
  }

  private ensureBirdSprite(dark: boolean) {
    if (this.spriteTheme === dark && this.birdSprite) return;
    this.spriteTheme = dark;
    const palette = getRetroPalette(dark);
    this.birdSprite = makeSprite(42, 32, (ctx) => {
      fillSphere(ctx, 17, 16, 11, palette.amber, { rim: 0.35, rimColor: palette.orange });
      ctx.fillStyle = shade(palette.amber, 0.28);
      ctx.beginPath();
      ctx.ellipse(12, 20, 8, 5, -0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(21, 12, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111827';
      ctx.beginPath();
      ctx.arc(22, 12, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = palette.orange;
      ctx.beginPath();
      ctx.moveTo(26, 16);
      ctx.lineTo(41, 20);
      ctx.lineTo(26, 23);
      ctx.closePath();
      ctx.fill();
    });
  }

  draw(ctx: CanvasRenderingContext2D) {
    const isDark = this.isDarkTheme();
    const palette = getRetroPalette(isDark);
    this.ensureBirdSprite(isDark);

    const sky = ctx.createLinearGradient(0, 0, 0, this.height);
    sky.addColorStop(0, isDark ? '#071827' : '#dff4ff');
    sky.addColorStop(0.68, isDark ? '#153047' : '#f4fbff');
    sky.addColorStop(1, palette.bg2);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.width, this.height);

    // Slow cloud layer gives depth without competing with pipe silhouettes.
    for (let i = 0; i < 5; i++) {
      const span = this.width + 110;
      const x = ((i * 103 - this.time * 12) % span + span) % span - 55;
      const y = 65 + (i % 3) * 78;
      ctx.fillStyle = isDark ? 'rgba(148,163,184,0.10)' : 'rgba(255,255,255,0.72)';
      ctx.beginPath();
      ctx.arc(x, y, 20, 0, Math.PI * 2);
      ctx.arc(x + 22, y - 8, 27, 0, Math.PI * 2);
      ctx.arc(x + 48, y, 19, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = isDark ? '#102637' : '#c8e4dc';
    ctx.beginPath();
    ctx.moveTo(0, this.height - this.groundHeight);
    for (let x = 0; x <= this.width; x += 48) {
      ctx.quadraticCurveTo(x + 24, this.height - this.groundHeight - 52 - (x % 96) / 4, x + 48, this.height - this.groundHeight);
    }
    ctx.closePath();
    ctx.fill();

    this.shake.apply(ctx, () => {
      for (const pipe of this.pipes) {
        const bottomY = pipe.topHeight + pipe.gap;
        const bottomH = this.height - this.groundHeight - bottomY;
        fillBevelTile(ctx, pipe.x, -8, pipe.width, pipe.topHeight + 8, 5, palette.green, { border: shade(palette.green, -0.45) });
        fillBevelTile(ctx, pipe.x - 4, pipe.topHeight - 20, pipe.width + 8, 20, 4, palette.green, { border: shade(palette.green, -0.45) });
        fillBevelTile(ctx, pipe.x, bottomY, pipe.width, bottomH + 8, 5, palette.green, { border: shade(palette.green, -0.45) });
        fillBevelTile(ctx, pipe.x - 4, bottomY, pipe.width + 8, 20, 4, palette.green, { border: shade(palette.green, -0.45) });
      }

      fillBevelTile(ctx, -4, this.height - this.groundHeight, this.width + 8, this.groundHeight + 8, 3, isDark ? '#713f12' : '#a16207', {
        border: palette.amber,
      });

      if (this.birdSprite) {
        const rotation = Math.max(-0.45, Math.min(0.8, this.bird.velocity / 520));
        drawSprite(ctx, this.birdSprite, this.bird.x + 4, this.bird.y, 42, 32, { rotation });
      }
      this.particles.draw(ctx);
    });

    drawVignette(ctx, this.width, this.height, isDark ? 0.22 : 0.1);
    this.floats.draw(ctx);

    ctx.fillStyle = palette.text;
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(String(this.score), this.width / 2, 16);

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

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    if (this.gameOver && this.isRestartInput(e)) {
      if (e instanceof TouchEvent) e.preventDefault();
      this.init();
      return;
    }

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
