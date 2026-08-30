import { BaseGame, createDefaultGameHost, type GameHost, type GameShellSnapshot } from '../core/game.js';
import { getRetroPalette } from '../core/render.js';
import {
  FloatTexts,
  Particles,
  ScreenShake,
  drawGlow,
  drawSprite,
  drawVignette,
  fillBevelTile,
  fillSphere,
  fx,
  makeSprite,
} from '../core/fx.js';

const W = 400;
const H = 600;
const GRAVITY = 1800;
const JUMP_VEL = -620;
const MOVE_SPEED = 280;
const PLATFORM_W = 70;
const PLATFORM_H = 14;
const CHAR_W = 30;
const CHAR_H = 30;

interface Platform {
  x: number;
  y: number;
  w: number;
  type: 'normal' | 'moving' | 'fragile' | 'disappearing';
  dx?: number; // for moving platforms
  alpha: number; // for disappearing
  broken: boolean;
}

export class DoodleJumpGame extends BaseGame {
  private player = { x: W / 2 - CHAR_W / 2, y: H - 100, vx: 0, vy: 0 };
  private platforms: Platform[] = [];
  private score = 0;

  override getShellSnapshot(): GameShellSnapshot {
    return { score: this.score };
  }
  private maxY = this.player.y;
  private gameState: 'idle' | 'playing' | 'gameover' = 'idle';
  private keys = { left: false, right: false };
  private touchSide: 'left' | 'right' | null = null;
  private cameraY = 0;
  private readonly particles = new Particles();
  private readonly floats = new FloatTexts();
  private readonly shake = new ScreenShake();
  private spriteTheme: boolean | null = null;
  private playerSprite: HTMLCanvasElement | null = null;

  constructor(host?: GameHost) {
    super(host ?? createDefaultGameHost('gameCanvas', W, H));
  }

  init() {
    this.player = { x: W / 2 - CHAR_W / 2, y: H - 100, vx: 0, vy: 0 };
    this.score = 0;
    this.maxY = this.player.y;
    this.cameraY = 0;
    this.gameState = 'playing';
    this.platforms = [];
    this.keys = { left: false, right: false };
    this.touchSide = null;
    this.particles.clear();
    this.floats.clear();
    this.shake.reset();
    this.resetScoreReport();

    // Generate initial platforms
    this.platforms.push({ x: W / 2 - PLATFORM_W / 2, y: H - 60, w: PLATFORM_W, type: 'normal', alpha: 1, broken: false });
    for (let i = 0; i < 10; i++) {
      this.addPlatform(H - 60 - i * 55);
    }
  }

  private addPlatform(y: number): Platform {
    const types: Platform['type'][] = ['normal', 'normal', 'normal', 'moving', 'fragile', 'disappearing'];
    const type = types[Math.floor(Math.random() * types.length)];
    const pw = PLATFORM_W;
    const px = Math.random() * (W - pw);
    const p: Platform = { x: px, y, w: pw, type, alpha: 1, broken: false };
    if (type === 'moving') p.dx = (Math.random() < 0.5 ? 1 : -1) * (80 + Math.random() * 60);
    return p;
  }

  private startGame() {
    this.gameState = 'playing';
  }

  private jump() {
    if (this.gameState === 'gameover') {
      this.init();
      this.gameState = 'playing';
      return;
    }
    if (this.gameState === 'idle') {
      this.startGame();
    }
    if (this.gameState === 'playing') {
      this.player.vy = JUMP_VEL;
    }
  }

  update(dt: number) {
    this.particles.update(dt);
    this.floats.update(dt);
    this.shake.update(dt);
    if (this.gameState !== 'playing') return;

    // Horizontal movement
    let vx = 0;
    if (this.keys.left || this.touchSide === 'left') vx = -MOVE_SPEED;
    if (this.keys.right || this.touchSide === 'right') vx = MOVE_SPEED;
    this.player.vx = vx;
    this.player.x += this.player.vx * dt;

    // Screen wrap
    if (this.player.x + CHAR_W < 0) this.player.x = W;
    if (this.player.x > W) this.player.x = -CHAR_W;

    // Gravity
    this.player.vy += GRAVITY * dt;
    this.player.y += this.player.vy * dt;

    // Platform collision (only when falling)
    if (this.player.vy > 0) {
      for (const p of this.platforms) {
        if (p.broken) continue;
        const inX = this.player.x + CHAR_W > p.x && this.player.x < p.x + p.w;
        const charBottom = this.player.y + CHAR_H;
        const prevBottom = charBottom - this.player.vy * dt;
        if (inX && prevBottom <= p.y + 2 && charBottom >= p.y) {
          this.player.y = p.y - CHAR_H;
          this.player.vy = JUMP_VEL;

          const palette = getRetroPalette(this.isDarkTheme());
          const color = p.type === 'fragile' ? palette.orange : p.type === 'moving' ? palette.amber : p.type === 'disappearing' ? palette.violet : palette.primary;
          for (const emit of fx.pop(this.player.x + CHAR_W / 2, p.y, [color, '#ffffff'])) {
            if (!this.isDarkTheme()) emit.blend = 'source-over';
            emit.count = Math.min(emit.count, 7);
            this.particles.emit(emit);
          }

          if (p.type === 'fragile') {
            p.broken = true;
          } else if (p.type === 'disappearing') {
            p.alpha = 0.3;
          }
        }
      }
    }

    // Camera: player moves up, camera follows
    const screenY = this.player.y - this.cameraY;
    if (screenY < H * 0.4) {
      this.cameraY = this.player.y - H * 0.4;
    }

    // Score: based on how high we've climbed
    if (this.player.y < this.maxY) {
      this.maxY = this.player.y;
    }
    const newScore = Math.floor((H - 60 - this.maxY) / 10);
    if (newScore > this.score) {
      if (Math.floor(newScore / 10) > Math.floor(this.score / 10)) {
        const palette = getRetroPalette(this.isDarkTheme());
        this.floats.add(this.player.x + CHAR_W / 2, this.player.y - 8, `+${newScore - this.score}`, {
          color: palette.amber,
          size: 13,
          life: 0.7,
        });
      }
      this.score = newScore;
    }

    // Remove platforms far below camera
    this.platforms = this.platforms.filter(p => p.y - this.cameraY < H + 60);

    // Add new platforms above
    let topY = H;
    for (const p of this.platforms) {
      const sy = p.y - this.cameraY;
      if (sy < H + 60) topY = Math.min(topY, p.y);
    }
    while (topY > this.cameraY - 60) {
      topY -= 50 + Math.random() * 30;
      this.platforms.push(this.addPlatform(topY));
    }

    // Update moving platforms
    for (const p of this.platforms) {
      if (p.type === 'moving' && p.dx) {
        p.x += p.dx * dt;
        if (p.x <= 0 || p.x + p.w >= W) p.dx *= -1;
        p.x = Math.max(0, Math.min(W - p.w, p.x));
      }
      if (p.type === 'disappearing' && p.alpha < 1) {
        p.alpha = Math.min(1, p.alpha + dt * 0.5);
      }
    }

    // Game over: fell below camera
    if (this.player.y - this.cameraY > H + 40) {
      this.gameState = 'gameover';
      const palette = getRetroPalette(this.isDarkTheme());
      for (const emit of fx.explosion(this.player.x + CHAR_W / 2, this.player.y, [palette.green, palette.primary, palette.red])) {
        if (!this.isDarkTheme()) emit.blend = 'source-over';
        this.particles.emit(emit);
      }
      this.shake.add(0.65);
      this.submitScoreOnce(this.score);
    }
  }

  private ensurePlayerSprite(dark: boolean) {
    if (this.spriteTheme === dark && this.playerSprite) return;
    this.spriteTheme = dark;
    const palette = getRetroPalette(dark);
    this.playerSprite = makeSprite(40, 44, (ctx) => {
      fillSphere(ctx, 20, 20, 14, palette.green, { rim: 0.3, rimColor: palette.primary });
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(15, 16, 5, 6, 0, 0, Math.PI * 2);
      ctx.ellipse(25, 16, 5, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(16, 16, 2.2, 0, Math.PI * 2);
      ctx.arc(26, 16, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(20, 22, 6, 0.2, Math.PI - 0.2);
      ctx.stroke();
      ctx.strokeStyle = palette.green;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(14, 31);
      ctx.lineTo(10, 41);
      ctx.moveTo(26, 31);
      ctx.lineTo(30, 41);
      ctx.stroke();
    });
  }

  draw(ctx: CanvasRenderingContext2D) {
    const isDark = this.isDarkTheme();
    const palette = getRetroPalette(isDark);
    this.ensurePlayerSprite(isDark);

    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, isDark ? '#071522' : '#e0f2fe');
    grad.addColorStop(1, isDark ? '#10283a' : '#bae6fd');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Sparse parallax dots make vertical travel legible.
    for (let i = 0; i < 24; i++) {
      const x = (i * 71) % W;
      const y = ((i * 97 - this.cameraY * (0.08 + (i % 3) * 0.04)) % H + H) % H;
      ctx.fillStyle = i % 2 ? palette.primary : palette.cyan;
      ctx.globalAlpha = isDark ? 0.16 : 0.1;
      ctx.beginPath();
      ctx.arc(x, y, 2 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    this.shake.apply(ctx, () => {
      ctx.save();
      ctx.translate(0, -this.cameraY);

      for (const p of this.platforms) {
        if (p.broken) continue;
        ctx.globalAlpha = p.alpha;
        const color = p.type === 'fragile' ? palette.orange : p.type === 'disappearing' ? palette.violet : p.type === 'moving' ? palette.amber : palette.primary;
        if (p.type === 'moving' || p.type === 'disappearing') {
          drawGlow(ctx, p.x + p.w / 2, p.y + PLATFORM_H / 2, 24, color, isDark ? 0.18 : 0.08);
        }
        fillBevelTile(ctx, p.x, p.y, p.w, PLATFORM_H, 5, color, { border: palette.border });
        ctx.globalAlpha = 1;
      }

      if (this.playerSprite) {
        const tilt = Math.max(-0.2, Math.min(0.2, this.player.vx / 900));
        drawSprite(ctx, this.playerSprite, this.player.x + CHAR_W / 2, this.player.y + CHAR_H / 2, 40, 44, {
          rotation: tilt,
          flipX: this.player.vx < 0,
        });
      }

      this.particles.draw(ctx);
      this.floats.draw(ctx);
      ctx.restore();
    });

    drawVignette(ctx, W, H, isDark ? 0.22 : 0.1);
    ctx.fillStyle = palette.text;
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(`${this.isZhLang() ? '得分' : 'SCORE'} ${this.score}`, W - 12, 12);

    if (this.gameState === 'idle') {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#f8fafc';
      ctx.font = '18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(this.isZhLang() ? '涂鸦跳跃' : 'DOODLE JUMP', W / 2, H / 2 - 50);
    }

    if (this.gameState === 'gameover') {
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
    if (this.gameState === 'gameover' && this.isRestartInput(e)) {
      if (e instanceof TouchEvent) e.preventDefault();
      this.init();
      return;
    }

    if (e instanceof KeyboardEvent) {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        if (e.type === 'keydown') this.keys.left = true;
        else this.keys.left = false;
      }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        if (e.type === 'keydown') this.keys.right = true;
        else this.keys.right = false;
      }
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === 'Enter') {
        if (e.type === 'keydown' && !e.repeat) this.jump();
      }
      return;
    }

    if (e instanceof TouchEvent) {
      e.preventDefault();
      if (e.type === 'touchstart' || e.type === 'touchmove') {
        const touch = e.touches[0];
        if (touch) {
          const { x } = this.canvasPoint(touch.clientX, touch.clientY);
          this.touchSide = x < this.width / 2 ? 'left' : 'right';
        }
        if (e.type === 'touchstart') this.jump();
      }
      if (e.type === 'touchend') {
        this.touchSide = null;
      }
      return;
    }

    if (e instanceof MouseEvent) {
      if (e.type === 'mousedown') {
        const { x } = this.canvasPoint(e.clientX, e.clientY);
        this.touchSide = x < this.width / 2 ? 'left' : 'right';
        this.jump();
      }
      if (e.type === 'mouseup') {
        this.touchSide = null;
      }
    }
  }
}
