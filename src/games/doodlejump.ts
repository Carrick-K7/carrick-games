import { BaseGame } from '../core/game.js';

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
  private maxY = this.player.y;
  private gameState: 'idle' | 'playing' | 'gameover' = 'idle';
  private keys = { left: false, right: false };
  private touchSide: 'left' | 'right' | null = null;
  private cameraY = 0;
  private lastScoreReported = false;

  constructor() {
    super('gameCanvas', W, H);
  }

  init() {
    this.player = { x: W / 2 - CHAR_W / 2, y: H - 100, vx: 0, vy: 0 };
    this.score = 0;
    this.maxY = this.player.y;
    this.cameraY = 0;
    this.gameState = 'idle';
    this.platforms = [];
    this.keys = { left: false, right: false };
    this.touchSide = null;
    this.lastScoreReported = false;

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
    if (newScore > this.score) this.score = newScore;

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
      if (!this.lastScoreReported) {
        this.lastScoreReported = true;
        (window as any).reportScore?.(this.score);
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    // Sky gradient
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    const isDark = !document.documentElement.hasAttribute('data-theme') ||
      document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
      grad.addColorStop(0, '#0b0f19');
      grad.addColorStop(1, '#0f172a');
    } else {
      grad.addColorStop(0, '#e0f2fe');
      grad.addColorStop(1, '#bae6fd');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(0, -this.cameraY);

    // Draw platforms
    for (const p of this.platforms) {
      if (p.broken) continue;
      ctx.globalAlpha = p.alpha;
      let color = '#39C5BB';
      if (!isDark) color = '#0d9488';
      if (p.type === 'fragile') color = isDark ? '#f97316' : '#c2410c';
      if (p.type === 'disappearing') color = isDark ? '#a855f7' : '#7c3aed';
      if (p.type === 'moving') color = isDark ? '#eab308' : '#a16207';
      ctx.fillStyle = color;
      ctx.fillRect(p.x, p.y, p.w, PLATFORM_H);
      // Top highlight
      ctx.fillStyle = isDark ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.5)';
      ctx.fillRect(p.x, p.y, p.w, 3);
      ctx.globalAlpha = 1;
    }

    // Draw player (doodle character)
    this.drawPlayer(ctx);

    ctx.restore();

    // Score (HUD)
    ctx.fillStyle = isDark ? '#f8fafc' : '#0f172a';
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.textAlign = 'left';
    const t = document.documentElement.getAttribute('data-lang') === 'zh' ? '分数' : 'SCORE';
    ctx.fillText(`${t} ${this.score}`, 12, 28);

    // Idle screen
    if (this.gameState === 'idle') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#f8fafc';
      ctx.font = '14px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      const zh = document.documentElement.getAttribute('data-lang') === 'zh';
      ctx.fillText('DOODLE JUMP', W / 2, H / 2 - 50);
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillText(zh ? '点击或按空格开始' : 'TAP OR PRESS SPACE', W / 2, H / 2 + 10);
      ctx.fillText(zh ? '← → 或 A D 移动' : '← → OR A D TO MOVE', W / 2, H / 2 + 35);
    }

    // Game over
    if (this.gameState === 'gameover') {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#f8fafc';
      ctx.font = '14px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      const zh = document.documentElement.getAttribute('data-lang') === 'zh';
      ctx.fillText(zh ? '游戏结束' : 'GAME OVER', W / 2, H / 2 - 40);
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.fillText(`${zh ? '分数' : 'SCORE'} ${this.score}`, W / 2, H / 2 + 5);
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillText(zh ? '点击或按空格重新开始' : 'TAP OR PRESS SPACE', W / 2, H / 2 + 40);
    }
  }

  private drawPlayer(ctx: CanvasRenderingContext2D) {
    const { x, y } = this.player;
    const isDark = !document.documentElement.hasAttribute('data-theme') ||
      document.documentElement.getAttribute('data-theme') === 'dark';
    const bodyColor = isDark ? '#4ade80' : '#15803d';
    const eyeColor = '#0f172a';

    // Body (oval)
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.ellipse(x + CHAR_W / 2, y + CHAR_H / 2 + 2, CHAR_W / 2 - 2, CHAR_H / 2 - 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head (circle on top)
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.arc(x + CHAR_W / 2, y + CHAR_H / 2 - 4, CHAR_W / 2 - 4, 0, Math.PI * 2);
    ctx.fill();

    // Eyes (white)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(x + CHAR_W / 2 - 6, y + CHAR_H / 2 - 6, 5, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + CHAR_W / 2 + 6, y + CHAR_H / 2 - 6, 5, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Pupils
    ctx.fillStyle = eyeColor;
    ctx.beginPath();
    ctx.arc(x + CHAR_W / 2 - 5, y + CHAR_H / 2 - 5, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + CHAR_W / 2 + 7, y + CHAR_H / 2 - 5, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Mouth (smile)
    ctx.strokeStyle = eyeColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + CHAR_W / 2, y + CHAR_H / 2, 6, 0.2, Math.PI - 0.2);
    ctx.stroke();

    // Legs (simple lines)
    ctx.strokeStyle = bodyColor;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + CHAR_W / 2 - 6, y + CHAR_H - 4);
    ctx.lineTo(x + CHAR_W / 2 - 10, y + CHAR_H + 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + CHAR_W / 2 + 6, y + CHAR_H - 4);
    ctx.lineTo(x + CHAR_W / 2 + 10, y + CHAR_H + 6);
    ctx.stroke();
  }

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
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
          this.touchSide = touch.clientX < window.innerWidth / 2 ? 'left' : 'right';
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
        this.touchSide = e.clientX < window.innerWidth / 2 ? 'left' : 'right';
        this.jump();
      }
      if (e.type === 'mouseup') {
        this.touchSide = null;
      }
    }
  }
}
