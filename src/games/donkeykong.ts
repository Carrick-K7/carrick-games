import { BaseGame } from '../core/game.js';

const W = 480;
const H = 400;
const GROUND_Y = H - 24;
const PLAT_H = 12;
const BOY_H = 24;
const BOY_W = 16;
const BARREL_R = 10;

interface Platform {
  y: number;
  x1: number;
  x2: number;
  hasLadder: boolean;
}

interface Ladder {
  x: number;
  y1: number;
  y2: number;
}

interface Barrel {
  x: number;
  y: number;
  dx: number;
  dy: number;
  onLadder: boolean;
  ladderIndex: number;
}

export class DonkeyKongGame extends BaseGame {
  private boyX = 40;
  private boyY = GROUND_Y - BOY_H;
  private boyDir: 'left' | 'right' = 'right';
  private boyOnLadder = false;
  private barrels: Barrel[] = [];
  private score = 0;
  private lives = 3;
  private level = 1;
  private gameOver = false;
  private won = false;
  private gameOverReported = false;
  private lastBarrel = 0;
  private platforms: Platform[] = [];
  private ladders: Ladder[] = [];
  private jumpVy = 0;
  private jumping = false;
  private onGround = true;

  constructor() {
    super('gameCanvas', W, H);
  }

  init() {
    this.boyX = 40;
    this.boyY = GROUND_Y - BOY_H;
    this.boyDir = 'right';
    this.boyOnLadder = false;
    this.barrels = [];
    this.score = 0;
    this.lives = 3;
    this.level = 1;
    this.gameOver = false;
    this.won = false;
    this.gameOverReported = false;
    this.lastBarrel = 0;
    this.jumpVy = 0;
    this.jumping = false;
    this.onGround = true;
    this.buildLevel();
  }

  private buildLevel() {
    this.platforms = [];
    this.ladders = [];

    if (this.level === 1) {
      this.platforms.push({ y: GROUND_Y, x1: 0, x2: W, hasLadder: false });
      this.platforms.push({ y: GROUND_Y - 60, x1: 60, x2: 420, hasLadder: true });
      this.platforms.push({ y: GROUND_Y - 120, x1: 0, x2: 360, hasLadder: true });
      this.platforms.push({ y: GROUND_Y - 180, x1: 120, x2: 480, hasLadder: true });
      this.platforms.push({ y: GROUND_Y - 240, x1: 0, x2: 300, hasLadder: true });
      this.platforms.push({ y: GROUND_Y - 300, x1: 150, x2: 450, hasLadder: false });

      this.ladders.push({ x: 180, y1: GROUND_Y, y2: GROUND_Y - 60 });
      this.ladders.push({ x: 80, y1: GROUND_Y - 60, y2: GROUND_Y - 120 });
      this.ladders.push({ x: 300, y1: GROUND_Y - 120, y2: GROUND_Y - 180 });
      this.ladders.push({ x: 200, y1: GROUND_Y - 180, y2: GROUND_Y - 240 });
      this.ladders.push({ x: 380, y1: GROUND_Y - 240, y2: GROUND_Y - 300 });
    } else {
      // Level 2 - more complex
      this.platforms.push({ y: GROUND_Y, x1: 0, x2: W, hasLadder: false });
      this.platforms.push({ y: GROUND_Y - 50, x1: 0, x2: 350, hasLadder: true });
      this.platforms.push({ y: GROUND_Y - 100, x1: 130, x2: W, hasLadder: true });
      this.platforms.push({ y: GROUND_Y - 150, x1: 0, x2: 280, hasLadder: true });
      this.platforms.push({ y: GROUND_Y - 200, x1: 200, x2: W, hasLadder: true });
      this.platforms.push({ y: GROUND_Y - 250, x1: 0, x2: 380, hasLadder: true });
      this.platforms.push({ y: GROUND_Y - 300, x1: 100, x2: 480, hasLadder: false });

      this.ladders.push({ x: 280, y1: GROUND_Y, y2: GROUND_Y - 50 });
      this.ladders.push({ x: 200, y1: GROUND_Y - 50, y2: GROUND_Y - 100 });
      this.ladders.push({ x: 340, y1: GROUND_Y - 100, y2: GROUND_Y - 150 });
      this.ladders.push({ x: 120, y1: GROUND_Y - 150, y2: GROUND_Y - 200 });
      this.ladders.push({ x: 260, y1: GROUND_Y - 200, y2: GROUND_Y - 250 });
      this.ladders.push({ x: 400, y1: GROUND_Y - 250, y2: GROUND_Y - 300 });
    }
  }

  update(dt: number) {
    if (this.gameOver || this.won) return;

    // Spawn barrels
    this.lastBarrel += dt;
    const spawnInterval = Math.max(2.0, 4.0 - this.level * 0.5);
    if (this.lastBarrel > spawnInterval) {
      this.lastBarrel = 0;
      const topPlat = this.platforms[this.platforms.length - 1];
      this.barrels.push({
        x: topPlat.x1 + 20,
        y: topPlat.y - BARREL_R,
        dx: 1.5 + this.level * 0.3,
        dy: 0,
        onLadder: false,
        ladderIndex: -1,
      });
    }

    // Jump physics
    if (this.jumping) {
      this.boyY += this.jumpVy;
      this.jumpVy += 0.5;
      const groundY = this.getGroundY(this.boyX, this.boyX + BOY_W);
      if (this.boyY + BOY_H >= groundY) {
        this.boyY = groundY - BOY_H;
        this.jumping = false;
        this.onGround = true;
        this.jumpVy = 0;
      }
    } else if (this.boyOnLadder) {
      if (this.isOnLadder(this.boyX, this.boyY) < 0) {
        this.boyOnLadder = false;
        this.onGround = false;
      }
    } else if (this.onGround) {
      this.boyY = this.getGroundY(this.boyX, this.boyX + BOY_W) - BOY_H;
    }

    // Move barrels
    for (const b of this.barrels) {
      const gY = this.getGroundY(b.x, b.x);
      if (gY < b.y + BARREL_R) {
        // On a platform
        b.onLadder = false;
        b.ladderIndex = -1;
        b.y = gY - BARREL_R;
        b.x += b.dx * 60 * dt;
        if (b.x < 0 || b.x > W) b.dx *= -1;
      } else {
        // Fall / take ladder
        const lad = this.findLadder(b.x, b.y);
        if (lad && !b.onLadder) {
          b.onLadder = true;
          b.ladderIndex = lad;
          b.x = this.ladders[lad].x;
          b.dy = 1.5;
          b.dx = 0;
        }
        if (b.onLadder) {
          b.y += b.dy * 60 * dt;
          // Check if reached bottom of ladder
          const ll = this.ladders[b.ladderIndex];
          if (b.y >= ll.y2 - BARREL_R) {
            b.onLadder = false;
            b.ladderIndex = -1;
            b.dx = (Math.random() > 0.5 ? 1 : -1) * (1.5 + this.level * 0.3);
            b.dy = 0;
          }
        } else {
          b.y += 120 * dt;
        }
      }

      // Collision with boy
      if (!this.gameOver) {
        const bx = this.boyX + BOY_W / 2;
        const by = this.boyY + BOY_H / 2;
        const dist = Math.sqrt((b.x - bx) ** 2 + (b.y - by) ** 2);
        if (dist < BARREL_R + BOY_W / 2) {
          this.lives--;
          this.score -= 100;
          if (this.score < 0) this.score = 0;
          if (this.lives <= 0) {
            this.gameOver = true;
            if (!this.gameOverReported) {
              this.gameOverReported = true;
              (window as any).reportScore?.(this.score);
            }
          } else {
            this.boyX = 40;
            this.boyY = GROUND_Y - BOY_H;
            this.boyOnLadder = false;
            this.barrels = [];
          }
        }
      }
    }

    // Remove off-screen barrels
    this.barrels = this.barrels.filter(b => b.y < H + 50);

    // Score for survival
    this.score += dt * 2;
  }

  private getGroundY(x1: number, x2: number): number {
    for (const p of this.platforms) {
      if (x2 >= p.x1 && x1 <= p.x2) {
        return p.y;
      }
    }
    return GROUND_Y;
  }

  private findLadder(x: number, y: number): number {
    for (let i = 0; i < this.ladders.length; i++) {
      const l = this.ladders[i];
      if (Math.abs(x - l.x) < 16 && y < l.y1 && y > l.y2 - 20) {
        return i;
      }
    }
    return -1;
  }

  private isOnLadder(x: number, y: number): number {
    for (let i = 0; i < this.ladders.length; i++) {
      const l = this.ladders[i];
      if (Math.abs(x + BOY_W / 2 - l.x) < 12 && y + BOY_H > l.y2 && y < l.y1) {
        return i;
      }
    }
    return -1;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const isDark = !document.documentElement.hasAttribute('data-theme') ||
      document.documentElement.getAttribute('data-theme') === 'dark';

    ctx.fillStyle = isDark ? '#0b0f19' : '#1a1a2e';
    ctx.fillRect(0, 0, W, H);

    // Platforms
    ctx.fillStyle = isDark ? '#334155' : '#475569';
    for (const p of this.platforms) {
      ctx.fillRect(p.x1, p.y, p.x2 - p.x1, PLAT_H);
    }

    // Ladders
    ctx.strokeStyle = isDark ? '#f59e0b' : '#d97706';
    ctx.lineWidth = 6;
    for (const l of this.ladders) {
      ctx.beginPath();
      ctx.moveTo(l.x, l.y1);
      ctx.lineTo(l.x, l.y2);
      ctx.stroke();
      // Rungs
      ctx.lineWidth = 2;
      for (let yy = l.y2; yy < l.y1; yy += 12) {
        ctx.beginPath();
        ctx.moveTo(l.x - 8, yy);
        ctx.lineTo(l.x + 8, yy);
        ctx.stroke();
      }
      ctx.lineWidth = 6;
    }

    // Barrels
    ctx.fillStyle = '#b45309';
    for (const b of this.barrels) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, BARREL_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Boy (simple Mario-like)
    ctx.fillStyle = '#ef4444'; // shirt
    ctx.fillRect(this.boyX + 2, this.boyY + 8, 12, 10);
    ctx.fillStyle = '#3b82f6'; // pants
    ctx.fillRect(this.boyX + 2, this.boyY + 18, 12, 6);
    ctx.fillStyle = '#fbbf24'; // head
    ctx.beginPath();
    ctx.arc(this.boyX + 8, this.boyY + 5, 6, 0, Math.PI * 2);
    ctx.fill();

    // HUD
    const zh = document.documentElement.getAttribute('data-lang') === 'zh';
    ctx.fillStyle = isDark ? '#39C5BB' : '#0d9488';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillText(`SCORE: ${Math.floor(this.score)}`, 8, 16);
    ctx.fillText(`${zh ? '命' : 'LIVES'}: ${'❤'.repeat(this.lives)}`, 180, 16);
    ctx.fillText(`${zh ? '关' : 'LV'}: ${this.level}`, 360, 16);

    // DK at top
    ctx.fillStyle = isDark ? '#92400e' : '#78350f';
    ctx.font = '14px "Press Start 2P", monospace';
    ctx.fillText('DK', W / 2 - 14, 20);

    if (this.gameOver) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 140, W, 120);
      ctx.fillStyle = isDark ? '#39C5BB' : '#0d9488';
      ctx.font = '12px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', W / 2, 195);
      ctx.fillText(`${zh ? '得分' : 'SCORE'}: ${Math.floor(this.score)}`, W / 2, 220);
      ctx.textAlign = 'left';
    }

    if (this.won) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 140, W, 120);
      ctx.fillStyle = '#fbbf24';
      ctx.font = '12px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${zh ? '通关!' : 'YOU WIN!'}`, W / 2, 195);
      ctx.fillText(`${zh ? '得分' : 'SCORE'}: ${Math.floor(this.score)}`, W / 2, 220);
      ctx.textAlign = 'left';
    }
  }

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    if (this.gameOver || this.won) {
      if (e instanceof KeyboardEvent && e.type === 'keydown' && (e.key === ' ' || e.key === 'Enter')) {
        this.init();
      }
      if (e instanceof MouseEvent && e.type === 'mousedown') this.init();
      if (e instanceof TouchEvent && e.type === 'touchstart') this.init();
      return;
    }

    if (e instanceof KeyboardEvent && e.type === 'keydown') {
      const ladIdx = this.isOnLadder(this.boyX, this.boyY);
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        this.boyX = Math.max(0, this.boyX - 5);
        this.boyDir = 'left';
      }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        this.boyX = Math.min(W - BOY_W, this.boyX + 5);
        this.boyDir = 'right';
      }
      if ((e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') && ladIdx >= 0) {
        this.boyOnLadder = true;
        this.boyY = Math.max(this.ladders[ladIdx].y2 - BOY_H, this.boyY - 4);
      }
      if ((e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') && ladIdx >= 0) {
        this.boyOnLadder = true;
        this.boyY = Math.min(this.ladders[ladIdx].y1 - BOY_H, this.boyY + 4);
      }
      if (e.key === ' ' || e.key === 'z' || e.key === 'Z' || e.key === 'ArrowDown') {
        if (this.onGround && !this.jumping) {
          this.jumping = true;
          this.jumpVy = -8;
          this.onGround = false;
        }
      }
    }

    if (e instanceof TouchEvent) {
      e.preventDefault();
      if (e.type === 'touchstart') {
        const t = e.touches[0];
        const cx = t.clientX - (window.innerWidth - W) / 2;
        if (cx < W / 3) {
          this.boyX = Math.max(0, this.boyX - 8);
          this.boyDir = 'left';
        } else if (cx > W * 2 / 3) {
          this.boyX = Math.min(W - BOY_W, this.boyX + 8);
          this.boyDir = 'right';
        } else {
          if (this.onGround && !this.jumping) {
            this.jumping = true;
            this.jumpVy = -8;
            this.onGround = false;
          }
        }
      }
    }

    if (e instanceof MouseEvent && e.type === 'mousedown') {
      const cx = e.clientX - (window.innerWidth - W) / 2;
      if (cx < W / 3) {
        this.boyX = Math.max(0, this.boyX - 8);
        this.boyDir = 'left';
      } else if (cx > W * 2 / 3) {
        this.boyX = Math.min(W - BOY_W, this.boyX + 8);
        this.boyDir = 'right';
      } else {
        if (this.onGround && !this.jumping) {
          this.jumping = true;
          this.jumpVy = -8;
          this.onGround = false;
        }
      }
    }
  }

  destroy() {
    this.gameOver = true;
    super.destroy();
  }
}
