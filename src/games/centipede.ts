import { BaseGame } from '../core/game.js';

// ─── Constants ───────────────────────────────────────────────────────────────
const W = 320;
const H = 480;
const COLS = 20;          // 16px per col
const ROWS = 30;          // 16px per row
const CELL = 16;
const SHIP_Y = H - 30;
const SHIP_SPEED = 150;   // px/s
const BULLET_SPEED = 300;
const CENTI_SPEED_BASE = 60; // px/s for first segment
const SEG_COUNT = 12;

// ─── Types ────────────────────────────────────────────────────────────────────
type Dir = 1 | -1;

interface Seg {
  x: number; y: number; dir: Dir;
}

interface Mushroom {
  x: number; y: number;  // grid coords
  hits: number;          // 4=full, 3, 2, 1=small, 0=dead
}

interface Bullet {
  x: number; y: number; fromPlayer: boolean;
}

interface Spider {
  x: number; y: number; dir: Dir; phase: number; alive: boolean;
}

interface Flea {
  x: number; y: number; alive: boolean; dropTimer: number;
}

// ─── Game ─────────────────────────────────────────────────────────────────────
export class CentipedeGame extends BaseGame {
  // State
  private phase: 'start' | 'playing' | 'gameover' = 'start';
  private score = 0;
  private lives = 3;
  private wave = 1;
  private hiScore = 0;

  // Player
  private shipX = W / 2;

  // Centipede
  private segs: Seg[] = [];
  private dir: Dir = 1;
  private centiSpeed = CENTI_SPEED_BASE;

  // Objects
  private mushrooms: Mushroom[] = [];
  private bullets: Bullet[] = [];
  private spiders: Spider[] = [];
  private fleas: Flea[] = [];
  private explosions: { x: number; y: number; r: number; life: number }[] = [];

  // Input
  private keys: Set<string> = new Set();
  private shootCooldown = 0;

  // Timers
  private fleaTimer = 0;
  private spiderTimer = 0;
  private waveTimer = 0;
  private centiMoveTimer = 0;

  constructor() {
    super('gameCanvas', W, H);
  }

  init() {
    this.score = 0;
    this.lives = 3;
    this.wave = 1;
    this.shipX = W / 2;
    this.bullets = [];
    this.mushrooms = [];
    this.spiders = [];
    this.fleas = [];
    this.explosions = [];
    this.dir = 1;
    this.centiSpeed = CENTI_SPEED_BASE;
    this.fleaTimer = 8;
    this.spiderTimer = 12;
    this.waveTimer = 0;
    this.shootCooldown = 0;
    this.centiMoveTimer = 0;
    this.spawnMushrooms();
    this.spawnCentipede();
  }

  // ─── Spawn helpers ────────────────────────────────────────────────────────

  private spawnMushrooms() {
    // Bottom 2/3 of field: random mushrooms
    const count = 20 + this.wave * 5;
    for (let i = 0; i < count; i++) {
      const gx = Math.floor(Math.random() * COLS);
      const gy = 6 + Math.floor(Math.random() * (ROWS - 6));
      if (!this.mushAt(gx, gy)) {
        this.mushrooms.push({ x: gx, y: gy, hits: 4 });
      }
    }
  }

  private spawnCentipede() {
    this.segs = [];
    const startY = CELL * 2;
    for (let i = 0; i < SEG_COUNT; i++) {
      this.segs.push({ x: W / 2 - i * CELL, y: startY, dir: 1 });
    }
    this.dir = 1;
  }

  private mushAt(gx: number, gy: number): boolean {
    return this.mushrooms.some(m => m.x === gx && m.y === gy && m.hits > 0);
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  update(dt: number) {
    if (this.phase === 'start') return;

    this.shootCooldown = Math.max(0, this.shootCooldown - dt);
    this.waveTimer += dt;

    // Player movement
    if (this.keys.has('ArrowLeft') || this.keys.has('a')) {
      this.shipX -= SHIP_SPEED * dt;
    }
    if (this.keys.has('ArrowRight') || this.keys.has('d')) {
      this.shipX += SHIP_SPEED * dt;
    }
    this.shipX = Math.max(10, Math.min(W - 10, this.shipX));

    // Shooting
    if ((this.keys.has(' ') || this.keys.has('z')) && this.shootCooldown <= 0) {
      this.bullets.push({ x: this.shipX, y: SHIP_Y - 10, fromPlayer: true });
      this.shootCooldown = 0.2;
    }

    // Bullets
    for (const b of this.bullets) {
      b.y += b.fromPlayer ? -BULLET_SPEED * dt : BULLET_SPEED * 0.5 * dt;
    }
    this.bullets = this.bullets.filter(b => b.y > 0 && b.y < H);

    // Centipede movement
    this.updateCentipede(dt);

    // Flea
    this.updateFlea(dt);

    // Spiders
    this.updateSpiders(dt);

    // Explosions
    for (const e of this.explosions) {
      e.r += 40 * dt;
      e.life -= dt;
    }
    this.explosions = this.explosions.filter(e => e.life > 0);

    // Check collisions
    this.checkCollisions();

    // Wave clear?
    if (this.segs.length === 0) {
      this.nextWave();
    }

    // Game over if centipede reaches bottom
    const bottom = this.segs.some(s => s.y >= SHIP_Y - CELL);
    if (bottom) {
      this.lives--;
      if (this.lives <= 0) {
        this.phase = 'gameover';
        this.hiScore = Math.max(this.hiScore, this.score);
      } else {
        // Reset centipede only
        this.segs = [];
        this.spawnCentipede();
        this.bullets = [];
      }
    }
  }

  private updateCentipede(dt: number) {
    const aliveSegs = this.segs.filter(s => s);
    if (aliveSegs.length === 0) return;

    this.centiMoveTimer += dt;
    const speed = this.centiSpeed * (1 + (SEG_COUNT - aliveSegs.length) * 0.05);
    const moveInterval = CELL / speed;

    if (this.centiMoveTimer < moveInterval) return;
    this.centiMoveTimer -= moveInterval;

    const head = this.segs[0];
    if (!head) return;

    // Determine head's next position
    const hgx = Math.floor(head.x / CELL);
    const hgy = Math.floor(head.y / CELL);
    const nextGX = hgx + this.dir;
    const blocked = nextGX < 0 || nextGX >= COLS || this.mushAt(nextGX, hgy);

    let newHeadX = head.x;
    let newHeadY = head.y;

    if (blocked) {
      if (hgy + 1 < ROWS && !this.mushAt(hgx, hgy + 1)) {
        newHeadY = head.y + CELL;
        this.dir = (this.dir === 1 ? -1 : 1) as Dir;
      }
    } else {
      newHeadX = head.x + this.dir * CELL;
    }

    // Body segments follow the segment ahead
    for (let i = this.segs.length - 1; i > 0; i--) {
      const s = this.segs[i];
      const prev = this.segs[i - 1];
      if (s && prev) {
        s.x = prev.x;
        s.y = prev.y;
        s.dir = prev.dir;
      }
    }

    // Update head
    head.x = newHeadX;
    head.y = newHeadY;
    head.dir = this.dir;
  }

  private updateFlea(dt: number) {
    // Spawn flea occasionally
    this.fleaTimer -= dt;
    if (this.fleaTimer <= 0 && this.fleas.every(f => !f.alive)) {
      const x = Math.random() * (W - 40) + 20;
      this.fleas.push({ x, y: 0, alive: true, dropTimer: 0 });
      this.fleaTimer = 10 + Math.random() * 15;
    }

    for (const f of this.fleas) {
      if (!f.alive) continue;
      f.y += 80 * dt;
      f.dropTimer += dt;
      if (f.dropTimer > 0.3) {
        f.dropTimer = 0;
        // Drop mushroom
        const gx = Math.floor(f.x / CELL);
        const gy = Math.floor(f.y / CELL);
        if (gy < ROWS && !this.mushAt(gx, gy)) {
          this.mushrooms.push({ x: gx, y: gy, hits: 4 });
        }
      }
      if (f.y > SHIP_Y) f.alive = false;
    }
    this.fleas = this.fleas.filter(f => f.alive);
  }

  private updateSpiders(dt: number) {
    this.spiderTimer -= dt;
    if (this.spiderTimer <= 0 && this.spiders.every(s => !s.alive)) {
      this.spiders.push({
        x: Math.random() * (W - 60) + 30,
        y: H - 60,
        dir: Math.random() > 0.5 ? 1 : -1,
        phase: 0,
        alive: true,
      });
      this.spiderTimer = 15 + Math.random() * 20;
    }

    for (const sp of this.spiders) {
      if (!sp.alive) continue;
      sp.phase += dt * 4;
      sp.x += sp.dir * (50 + Math.sin(sp.phase) * 30) * dt;
      if (sp.x < 20) { sp.x = 20; sp.dir = 1; }
      if (sp.x > W - 20) { sp.x = W - 20; sp.dir = -1; }
    }
    this.spiders = this.spiders.filter(s => s.alive);
  }

  // ─── Collisions ─────────────────────────────────────────────────────────

  private checkCollisions() {
    // Player bullets vs centipede
    for (let bi = this.bullets.length - 1; bi >= 0; bi--) {
      const b = this.bullets[bi];
      if (!b.fromPlayer) continue;

      // vs centipede
      for (let si = this.segs.length - 1; si >= 0; si--) {
        const s = this.segs[si];
        if (!s) continue;
        const dx = b.x - s.x;
        const dy = b.y - s.y;
        if (Math.abs(dx) < CELL * 0.6 && Math.abs(dy) < CELL * 0.6) {
          // Hit!
          this.bullets.splice(bi, 1);
          this.explosions.push({ x: s.x, y: s.y, r: 6, life: 0.3 });

          if (si === 0) {
            // Head: 100 pts
            this.score += 100;
          } else {
            this.score += 10;
          }

          // Detach segments after hit (they become a new centipede from this point)
          const tail = this.segs.splice(si + 1);
          this.segs = [];
          this.spawnCentipedeSegments(tail, si);
          this.segs = this.segs.slice(0, SEG_COUNT);
          break;
        }
      }

      // vs mushrooms
      if (this.bullets[bi]) {
        const bgx = Math.floor(b.x / CELL);
        const bgy = Math.floor(b.y / CELL);
        const m = this.mushrooms.find(m => m.x === bgx && m.y === bgy && m.hits > 0);
        if (m) {
          m.hits--;
          this.bullets.splice(bi, 1);
          if (m.hits === 0) {
            this.score += 10;
          } else if (m.hits === 2) {
            this.score += 5;
          } else {
            this.score += 1;
          }
        }
      }

      // vs fleas
      if (this.bullets[bi]) {
        for (let fi = this.fleas.length - 1; fi >= 0; fi--) {
          const f = this.fleas[fi];
          if (!f.alive) continue;
          if (Math.abs(b.x - f.x) < 12 && Math.abs(b.y - f.y) < 12) {
            this.bullets.splice(bi, 1);
            f.alive = false;
            this.score += 200;
            this.explosions.push({ x: f.x, y: f.y, r: 8, life: 0.3 });
            break;
          }
        }
      }

      // vs spiders
      if (this.bullets[bi]) {
        for (let si = this.spiders.length - 1; si >= 0; si--) {
          const sp = this.spiders[si];
          if (!sp.alive) continue;
          if (Math.abs(b.x - sp.x) < 16 && Math.abs(b.y - sp.y) < 16) {
            this.bullets.splice(bi, 1);
            sp.alive = false;
            this.score += 300;
            this.explosions.push({ x: sp.x, y: sp.y, r: 10, life: 0.3 });
            break;
          }
        }
      }
    }

    // Spider vs player (steals score)
    for (const sp of this.spiders) {
      if (!sp.alive) continue;
      if (Math.abs(sp.x - this.shipX) < 20 && Math.abs(sp.y - SHIP_Y) < 20) {
        sp.alive = false;
        this.score = Math.max(0, this.score - 200);
        this.explosions.push({ x: sp.x, y: sp.y, r: 14, life: 0.4 });
      }
    }

    // Flea vs player
    for (const f of this.fleas) {
      if (!f.alive) continue;
      if (Math.abs(f.x - this.shipX) < 16 && Math.abs(f.y - SHIP_Y) < 16) {
        this.lives--;
        f.alive = false;
        if (this.lives <= 0) {
          this.phase = 'gameover';
          this.hiScore = Math.max(this.hiScore, this.score);
        }
      }
    }
  }

  private spawnCentipedeSegments(tail: Seg[], remaining: number) {
    // Spawn a new centipede group from a detached tail
    if (tail.length === 0) return;
    const startX = tail[0].x;
    const startY = tail[0].y;
    for (const t of tail) {
      this.segs.push({ x: t.x, y: t.y, dir: this.dir });
      if (this.segs.length >= remaining + tail.length) break;
    }
  }

  private nextWave() {
    this.wave++;
    this.centiSpeed = CENTI_SPEED_BASE + this.wave * 10;
    this.bullets = [];
    this.fleas = [];
    this.spiders = [];
    this.spawnMushrooms();
    this.spawnCentipede();
  }

  // ─── Draw ─────────────────────────────────────────────────────────────────

  draw(ctx: CanvasRenderingContext2D) {
    ctx.clearRect(0, 0, W, H);

    if (this.phase === 'start') {
      this.drawStart(ctx);
      return;
    }

    if (this.phase === 'gameover') {
      this.drawGameOver(ctx);
      return;
    }

    // Background
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, W, H);

    // Draw field grid (subtle)
    ctx.strokeStyle = 'rgba(57,197,187,0.06)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= W; x += CELL) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y <= H; y += CELL) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Mushrooms
    for (const m of this.mushrooms) {
      if (m.hits <= 0) continue;
      this.drawMushroom(ctx, m);
    }

    // Fleas
    for (const f of this.fleas) {
      if (!f.alive) continue;
      this.drawFlea(ctx, f);
    }

    // Spiders
    for (const sp of this.spiders) {
      if (!sp.alive) continue;
      this.drawSpider(ctx, sp);
    }

    // Centipede
    for (let i = this.segs.length - 1; i >= 0; i--) {
      const s = this.segs[i];
      if (!s) continue;
      this.drawSeg(ctx, s, i === 0);
    }

    // Bullets
    ctx.fillStyle = '#39C5BB';
    for (const b of this.bullets) {
      if (!b.fromPlayer) continue;
      ctx.fillRect(b.x - 1, b.y - 5, 2, 10);
    }

    // Explosions
    for (const e of this.explosions) {
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,200,50,${e.life * 2})`;
      ctx.fill();
    }

    // Ship
    this.drawShip(ctx);

    // HUD
    this.drawHUD(ctx);
  }

  private drawSeg(ctx: CanvasRenderingContext2D, s: Seg, isHead: boolean) {
    const x = s.x, y = s.y;
    if (isHead) {
      // Head: round mushroom-ish shape, brighter
      ctx.fillStyle = '#ff4444';
      ctx.beginPath();
      ctx.arc(x, y, CELL * 0.42, 0, Math.PI * 2);
      ctx.fill();
      // Eyes
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x - 3, y - 2, 2, 0, Math.PI * 2);
      ctx.arc(x + 3, y - 2, 2, 0, Math.PI * 2);
      ctx.fill();
      // Antennae
      ctx.strokeStyle = '#ff6666';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - 4, y - CELL * 0.4);
      ctx.lineTo(x - 6, y - CELL * 0.7);
      ctx.moveTo(x + 4, y - CELL * 0.4);
      ctx.lineTo(x + 6, y - CELL * 0.7);
      ctx.stroke();
    } else {
      // Body segment
      const shade = Math.max(150, 220 - (this.segs.indexOf(s) % 6) * 20);
      ctx.fillStyle = `rgb(${shade},${shade * 0.4},${shade * 0.2})`;
      ctx.beginPath();
      ctx.arc(x, y, CELL * 0.38, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawMushroom(ctx: CanvasRenderingContext2D, m: Mushroom) {
    const x = m.x * CELL + CELL / 2;
    const y = m.y * CELL + CELL / 2;
    const r = m.hits === 4 ? CELL * 0.45 : m.hits === 3 ? CELL * 0.36 : m.hits === 2 ? CELL * 0.26 : CELL * 0.16;
    const colors = ['#7a3', '#6a2', '#5a1', '#4a0'];
    ctx.fillStyle = colors[m.hits - 1] ?? '#333';
    // Cap
    ctx.beginPath();
    ctx.arc(x, y - 1, r, Math.PI, 0);
    ctx.fill();
    // Stem
    ctx.fillStyle = '#c9a86c';
    ctx.fillRect(x - r * 0.3, y - 1, r * 0.6, r * 0.5 + 2);
  }

  private drawFlea(ctx: CanvasRenderingContext2D, f: Flea) {
    ctx.fillStyle = '#ff8800';
    ctx.beginPath();
    ctx.ellipse(f.x, f.y, 6, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    // Legs
    ctx.strokeStyle = '#cc6600';
    ctx.lineWidth = 1;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(f.x + i * 4, f.y + 6);
      ctx.lineTo(f.x + i * 4 - 4, f.y + 12);
      ctx.stroke();
    }
  }

  private drawSpider(ctx: CanvasRenderingContext2D, sp: Spider) {
    ctx.fillStyle = '#aaa';
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 8, 0, Math.PI * 2);
    ctx.fill();
    // Legs
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1.5;
    const legAngle = Math.sin(sp.phase) * 0.4;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const len = 10 + Math.sin(sp.phase + i) * 3;
      ctx.beginPath();
      ctx.moveTo(sp.x + Math.cos(a) * 6, sp.y + Math.sin(a) * 6);
      ctx.lineTo(sp.x + Math.cos(a + legAngle) * len, sp.y + Math.sin(a + legAngle) * len);
      ctx.stroke();
    }
  }

  private drawShip(ctx: CanvasRenderingContext2D) {
    const x = this.shipX, y = SHIP_Y;
    ctx.fillStyle = '#39C5BB';
    ctx.beginPath();
    ctx.moveTo(x, y - 10);
    ctx.lineTo(x - 10, y + 8);
    ctx.lineTo(x + 10, y + 8);
    ctx.closePath();
    ctx.fill();
    // Cannon
    ctx.fillStyle = '#2a9a94';
    ctx.fillRect(x - 2, y - 14, 4, 6);
  }

  private drawHUD(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#39C5BB';
    ctx.font = '8px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`SCORE ${this.score}`, 4, 12);
    ctx.textAlign = 'right';
    ctx.fillText(`WAVE ${this.wave}`, W - 4, 12);
    ctx.textAlign = 'center';
    // Lives as small ships
    for (let i = 0; i < this.lives; i++) {
      const lx = W / 2 - (this.lives - 1) * 10 / 2 + i * 10;
      ctx.fillStyle = '#39C5BB';
      ctx.beginPath();
      ctx.moveTo(lx, H - 4);
      ctx.lineTo(lx - 4, H);
      ctx.lineTo(lx + 4, H);
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawStart(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#39C5BB';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CENTIPEDE', W / 2, H / 2 - 60);
    ctx.font = '9px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('蜈蚣大战', W / 2, H / 2 - 40);
    ctx.fillStyle = '#39C5BB';
    ctx.font = '8px monospace';
    ctx.fillText('Arrow keys / A D — Move', W / 2, H / 2);
    ctx.fillText('Space / Z — Shoot', W / 2, H / 2 + 14);
    ctx.fillStyle = '#ff4444';
    ctx.fillText('PRESS SPACE TO START', W / 2, H / 2 + 50);
    ctx.fillStyle = '#888';
    ctx.fillText('ARROWS / WASD: MOVE   SPACE: SHOOT', W / 2, H / 2 + 80);
  }

  private drawGameOver(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', W / 2, H / 2 - 30);
    ctx.fillStyle = '#39C5BB';
    ctx.font = '9px monospace';
    ctx.fillText(`FINAL SCORE: ${this.score}`, W / 2, H / 2);
    ctx.fillText(`HI-SCORE: ${this.hiScore}`, W / 2, H / 2 + 18);
    ctx.fillStyle = '#fff';
    ctx.font = '8px monospace';
    ctx.fillText('SPACE TO RESTART', W / 2, H / 2 + 50);
  }

  // ─── Input ─────────────────────────────────────────────────────────────────

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    if (e.type === 'keydown') {
      const ke = e as KeyboardEvent;
      this.keys.add(ke.key);

      if (ke.key === ' ' || ke.key === 'z') {
        ke.preventDefault();
        if (this.phase === 'start') {
          this.phase = 'playing';
          this.init();
        } else if (this.phase === 'gameover') {
          this.phase = 'playing';
          this.init();
        }
      }
    } else if (e.type === 'keyup') {
      this.keys.delete((e as KeyboardEvent).key);
    } else if (e.type === 'touchstart' || e.type === 'touchmove') {
      e.preventDefault();
      const touches = (e as TouchEvent).touches;
      if (touches.length === 1) {
        const t = touches[0];
        const rect = this.canvas.getBoundingClientRect();
        const tx = (t.clientX - rect.left) * (W / rect.width);
        if (tx < this.shipX - 10) {
          this.keys.add('ArrowLeft');
          this.keys.delete('ArrowRight');
        } else if (tx > this.shipX + 10) {
          this.keys.add('ArrowRight');
          this.keys.delete('ArrowLeft');
        } else {
          this.keys.delete('ArrowLeft');
          this.keys.delete('ArrowRight');
          if (this.phase === 'start' || this.phase === 'gameover') {
            this.phase = 'playing';
            this.init();
          } else {
            this.keys.add(' ');
          }
        }
      }
    } else if (e.type === 'touchend') {
      this.keys.delete('ArrowLeft');
      this.keys.delete('ArrowRight');
      this.keys.delete(' ');
    } else if (e.type === 'mousedown') {
      const me = e as MouseEvent;
      const rect = this.canvas.getBoundingClientRect();
      const mx = (me.clientX - rect.left) * (W / rect.width);
      if (Math.abs(mx - this.shipX) > 15) {
        if (mx < this.shipX) this.keys.add('ArrowLeft');
        else this.keys.add('ArrowRight');
      } else {
        if (this.phase === 'start' || this.phase === 'gameover') {
          this.phase = 'playing';
          this.init();
        } else {
          this.keys.add(' ');
        }
      }
    } else if (e.type === 'mouseup') {
      this.keys.delete('ArrowLeft');
      this.keys.delete('ArrowRight');
      this.keys.delete(' ');
    }
  }

  destroy() {
    super.destroy();
  }
}
