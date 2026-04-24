import { BaseGame, isDarkTheme as getEffectiveDarkTheme } from '../core/game.js';

const W = 480;
const H = 560;
const WORLD_H = 1680;
const PLAYER_W = 14;
const PLAYER_H = 18;
const MOVE_SPEED = 154;
const JUMP_SPEED = 280;
const GRAVITY = 700;
const RESPAWN_TIME = 0.45;

interface Platform {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface SpikeStrip {
  x: number;
  y: number;
  w: number;
  h: number;
  dir: 'up' | 'down';
}

interface SavePoint {
  x: number;
  y: number;
  spawnX: number;
  spawnY: number;
  score: number;
}

interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

const PLATFORMS: Platform[] = [
  { x: 0, y: WORLD_H - 26, w: 132, h: 26 },
  { x: 186, y: WORLD_H - 26, w: 294, h: 26 },

  { x: 64, y: WORLD_H - 120, w: 122, h: 12 },
  { x: 236, y: WORLD_H - 210, w: 116, h: 12 },
  { x: 104, y: WORLD_H - 300, w: 92, h: 12 },

  { x: 0, y: WORLD_H - 362, w: 168, h: 24 },
  { x: 208, y: WORLD_H - 362, w: 102, h: 24 },
  { x: 350, y: WORLD_H - 362, w: 130, h: 24 },

  { x: 332, y: WORLD_H - 454, w: 72, h: 12 },
  { x: 236, y: WORLD_H - 540, w: 58, h: 12 },
  { x: 132, y: WORLD_H - 620, w: 52, h: 12 },
  { x: 58, y: WORLD_H - 706, w: 48, h: 12 },

  { x: 0, y: WORLD_H - 772, w: 160, h: 24 },
  { x: 206, y: WORLD_H - 772, w: 92, h: 24 },
  { x: 340, y: WORLD_H - 772, w: 140, h: 24 },

  { x: 102, y: WORLD_H - 860, w: 46, h: 12 },
  { x: 192, y: WORLD_H - 934, w: 42, h: 12 },
  { x: 284, y: WORLD_H - 1006, w: 38, h: 12 },
  { x: 210, y: WORLD_H - 1078, w: 34, h: 12 },
  { x: 118, y: WORLD_H - 1152, w: 32, h: 12 },

  { x: 0, y: WORLD_H - 1218, w: 176, h: 24 },
  { x: 216, y: WORLD_H - 1218, w: 118, h: 24 },
  { x: 374, y: WORLD_H - 1218, w: 106, h: 24 },

  { x: 346, y: WORLD_H - 1300, w: 40, h: 12 },
  { x: 278, y: WORLD_H - 1368, w: 36, h: 12 },
  { x: 212, y: WORLD_H - 1436, w: 34, h: 12 },
  { x: 148, y: WORLD_H - 1504, w: 32, h: 12 },
  { x: 82, y: WORLD_H - 1570, w: 30, h: 12 },

  { x: 0, y: WORLD_H - 1626, w: 124, h: 24 },
  { x: 170, y: WORLD_H - 1626, w: 100, h: 24 },
  { x: 316, y: WORLD_H - 1626, w: 164, h: 24 },
];

const SPIKES: SpikeStrip[] = [
  { x: 132, y: WORLD_H - 26, w: 54, h: 18, dir: 'up' },
  { x: 168, y: WORLD_H - 362, w: 40, h: 16, dir: 'up' },
  { x: 310, y: WORLD_H - 362, w: 40, h: 16, dir: 'up' },
  { x: 122, y: WORLD_H - 772, w: 38, h: 16, dir: 'up' },
  { x: 298, y: WORLD_H - 772, w: 42, h: 16, dir: 'up' },
  { x: 176, y: WORLD_H - 1218, w: 40, h: 16, dir: 'up' },
  { x: 334, y: WORLD_H - 1218, w: 40, h: 16, dir: 'up' },
  { x: 124, y: WORLD_H - 1600, w: 46, h: 16, dir: 'down' },
  { x: 270, y: WORLD_H - 1600, w: 46, h: 16, dir: 'down' },
];

const SAVE_POINTS: SavePoint[] = [
  { x: 384, y: WORLD_H - 392, spawnX: 372, spawnY: WORLD_H - 392 - PLAYER_H, score: 250 },
  { x: 372, y: WORLD_H - 1248, spawnX: 390, spawnY: WORLD_H - 1248 - PLAYER_H, score: 650 },
];

const GOAL = { x: 426, y: WORLD_H - 1658, w: 18, h: 32 };

function isDarkTheme() {
  return getEffectiveDarkTheme();
}

function isZh() {
  return document.documentElement.getAttribute('data-lang') === 'zh';
}

function rectsOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number
) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

export class IwannaGame extends BaseGame {
  private player!: Player;
  private readonly keys = new Set<string>();
  private readonly particles: Particle[] = [];
  private cameraY = WORLD_H - H;
  private respawnX = 34;
  private respawnY = WORLD_H - 26 - PLAYER_H;
  private respawnTimer = 0;
  private deaths = 0;
  private score = 0;
  private elapsed = 0;
  private saveIndex = 0;
  private cleared = false;
  private reportedClear = false;
  private touchStart: { x: number; y: number } | null = null;

  constructor() {
    super('gameCanvas', W, H);
  }

  init() {
    this.player = {
      x: 34,
      y: WORLD_H - 26 - PLAYER_H,
      vx: 0,
      vy: 0,
      onGround: false,
    };
    this.keys.clear();
    this.particles.length = 0;
    this.cameraY = WORLD_H - H;
    this.respawnX = 34;
    this.respawnY = WORLD_H - 26 - PLAYER_H;
    this.respawnTimer = 0;
    this.deaths = 0;
    this.score = 0;
    this.elapsed = 0;
    this.saveIndex = 0;
    this.cleared = false;
    this.reportedClear = false;
    this.touchStart = null;
  }

  update(dt: number) {
    this.elapsed += dt;
    this.updateParticles(dt);

    if (this.cleared) {
      this.updateCamera(dt);
      return;
    }

    if (this.respawnTimer > 0) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this.respawnPlayer();
      }
      this.updateCamera(dt);
      return;
    }

    this.updatePlayer(dt);
    this.checkSavePoints();
    this.checkGoal();
    this.updateCamera(dt);
  }

  draw(ctx: CanvasRenderingContext2D) {
    const dark = isDarkTheme();
    const zh = isZh();
    const bg = dark ? '#0b0f19' : '#fafafa';
    const sky = dark ? '#111827' : '#e0f2fe';
    const platform = dark ? '#334155' : '#64748b';
    const accent = dark ? '#39C5BB' : '#0d9488';
    const spike = dark ? '#f43f5e' : '#dc2626';
    const text = dark ? '#e0e0e0' : '#1a1a2e';
    const save = dark ? '#facc15' : '#ca8a04';

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = dark ? '#1f2937' : '#cbd5e1';
    for (let i = 0; i < 14; i++) {
      const x = (i * 41) % W;
      const y = 40 + ((i * 83) % H);
      ctx.fillRect(x, y, 18, 6);
    }

    ctx.save();
    ctx.translate(0, -this.cameraY);

    for (const plat of PLATFORMS) {
      ctx.fillStyle = platform;
      ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
    }

    for (const strip of SPIKES) {
      this.drawSpikeStrip(ctx, strip, spike);
    }

    for (let i = 0; i < SAVE_POINTS.length; i++) {
      const savePoint = SAVE_POINTS[i];
      ctx.fillStyle = i < this.saveIndex ? accent : save;
      ctx.fillRect(savePoint.x, savePoint.y - 22, 6, 22);
      ctx.beginPath();
      ctx.moveTo(savePoint.x + 6, savePoint.y - 22);
      ctx.lineTo(savePoint.x + 22, savePoint.y - 16);
      ctx.lineTo(savePoint.x + 6, savePoint.y - 10);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = dark ? '#f8fafc' : '#0f172a';
    ctx.fillRect(GOAL.x, GOAL.y, GOAL.w, GOAL.h);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(GOAL.x, GOAL.y, GOAL.w, GOAL.h);

    for (const particle of this.particles) {
      ctx.fillStyle = `rgba(251, 113, 133, ${Math.max(0, particle.life)})`;
      ctx.fillRect(particle.x, particle.y, 3, 3);
    }

    if (this.respawnTimer <= 0) {
      ctx.fillStyle = accent;
      ctx.fillRect(this.player.x, this.player.y, PLAYER_W, PLAYER_H);
      ctx.fillStyle = dark ? '#f8fafc' : '#0f172a';
      ctx.fillRect(this.player.x + 9, this.player.y + 4, 3, 3);
    }

    ctx.restore();

    ctx.fillStyle = text;
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillText('IWANNA', 12, 22);
    ctx.fillText(`${zh ? '死亡' : 'DEATH'} ${this.deaths}`, 12, 42);
    ctx.fillText(`${zh ? '进度' : 'SCORE'} ${this.score}`, 12, 62);

    if (this.cleared) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = text;
      ctx.textAlign = 'center';
      ctx.font = '16px "Press Start 2P", monospace';
      ctx.fillText(zh ? '通关' : 'CLEAR', W / 2, H / 2 - 18);
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillText(zh ? '按空格重开' : 'PRESS SPACE', W / 2, H / 2 + 18);
      ctx.textAlign = 'left';
    }
  }

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    if (e instanceof KeyboardEvent) {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (e.type === 'keydown') {
        this.keys.add(key);
        if ((key === ' ' || key === 'z' || key === 'ArrowUp' || key === 'w') && this.respawnTimer <= 0) {
          e.preventDefault();
          if (this.cleared) {
            this.init();
          } else if (this.player.onGround) {
            this.player.vy = -JUMP_SPEED;
            this.player.onGround = false;
          }
        }
        if (key === 'r' && (this.cleared || this.respawnTimer > 0)) {
          this.init();
        }
      } else if (e.type === 'keyup') {
        this.keys.delete(key);
      }
      return;
    }

    if (e instanceof TouchEvent) {
      e.preventDefault();
      if (e.type === 'touchstart') {
        const touch = e.touches[0] ?? e.changedTouches[0];
        if (!touch) return;
        this.touchStart = { x: touch.clientX, y: touch.clientY };
      }
      if (e.type === 'touchend') {
        const touch = e.changedTouches[0];
        if (!touch || !this.touchStart) return;
        const dx = touch.clientX - this.touchStart.x;
        const dy = touch.clientY - this.touchStart.y;
        if (this.cleared) {
          this.init();
        } else if (Math.abs(dx) < 20 && Math.abs(dy) < 20 && this.player.onGround && this.respawnTimer <= 0) {
          this.player.vy = -JUMP_SPEED;
          this.player.onGround = false;
        } else if (Math.abs(dx) > Math.abs(dy)) {
          this.player.x += dx > 0 ? 22 : -22;
        }
        this.touchStart = null;
      }
      return;
    }

    if (e.type === 'mousedown') {
      if (this.cleared) {
        this.init();
      } else if (this.player.onGround && this.respawnTimer <= 0) {
        this.player.vy = -JUMP_SPEED;
        this.player.onGround = false;
      }
    }
  }

  override destroy() {
    this.keys.clear();
    this.touchStart = null;
    super.destroy();
  }

  private updatePlayer(dt: number) {
    let dir = 0;
    if (this.keys.has('ArrowLeft') || this.keys.has('a')) dir -= 1;
    if (this.keys.has('ArrowRight') || this.keys.has('d')) dir += 1;

    const prevX = this.player.x;
    const prevY = this.player.y;
    this.player.vx = dir * MOVE_SPEED;
    this.player.vy += GRAVITY * dt;
    this.player.x += this.player.vx * dt;
    this.player.y += this.player.vy * dt;
    this.player.onGround = false;

    if (this.player.x < 0) this.player.x = 0;
    if (this.player.x + PLAYER_W > W) this.player.x = W - PLAYER_W;

    for (const plat of PLATFORMS) {
      const wasAbove = prevY + PLAYER_H <= plat.y;
      const horizontallyInside = this.player.x + PLAYER_W > plat.x && this.player.x < plat.x + plat.w;
      if (wasAbove && horizontallyInside && this.player.y + PLAYER_H >= plat.y && this.player.y + PLAYER_H <= plat.y + plat.h + 12 && this.player.vy >= 0) {
        this.player.y = plat.y - PLAYER_H;
        this.player.vy = 0;
        this.player.onGround = true;
      }
    }

    if (this.player.y > WORLD_H + 40) {
      this.killPlayer();
      return;
    }

    for (const strip of SPIKES) {
      if (rectsOverlap(this.player.x + 2, this.player.y + 2, PLAYER_W - 4, PLAYER_H - 4, strip.x, strip.y, strip.w, strip.h)) {
        this.killPlayer();
        return;
      }
    }

    if (Math.abs(this.player.x - prevX) > 0 || Math.abs(this.player.y - prevY) > 0) {
      const heightProgress = WORLD_H - this.player.y;
      this.score = Math.max(this.score, Math.floor(heightProgress * 0.6));
    }
  }

  private updateCamera(dt: number) {
    const target = Math.max(0, Math.min(WORLD_H - H, this.player.y - H * 0.58));
    this.cameraY += (target - this.cameraY) * Math.min(1, dt * 7);
  }

  private checkSavePoints() {
    while (this.saveIndex < SAVE_POINTS.length) {
      const savePoint = SAVE_POINTS[this.saveIndex];
      if (rectsOverlap(this.player.x, this.player.y, PLAYER_W, PLAYER_H, savePoint.x - 8, savePoint.y - 30, 28, 32)) {
        this.respawnX = savePoint.spawnX;
        this.respawnY = savePoint.spawnY;
        this.score = Math.max(this.score, savePoint.score);
        this.saveIndex += 1;
        window.reportScore?.(this.score);
      } else {
        break;
      }
    }
  }

  private checkGoal() {
    if (rectsOverlap(this.player.x, this.player.y, PLAYER_W, PLAYER_H, GOAL.x - 4, GOAL.y - 4, GOAL.w + 8, GOAL.h + 8)) {
      this.cleared = true;
      this.score = Math.max(this.score, 1200);
      if (!this.reportedClear) {
        this.reportedClear = true;
        window.reportScore?.(this.score);
      }
    }
  }

  private killPlayer() {
    if (this.respawnTimer > 0 || this.cleared) return;
    this.deaths++;
    for (let i = 0; i < 16; i++) {
      this.particles.push({
        x: this.player.x + PLAYER_W / 2,
        y: this.player.y + PLAYER_H / 2,
        vx: (Math.random() - 0.5) * 180,
        vy: -50 - Math.random() * 120,
        life: 1,
      });
    }
    this.respawnTimer = RESPAWN_TIME;
    this.player.vx = 0;
    this.player.vy = 0;
  }

  private respawnPlayer() {
    this.player.x = this.respawnX;
    this.player.y = this.respawnY;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.onGround = false;
    this.respawnTimer = 0;
  }

  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 280 * dt;
      particle.life -= dt * 1.6;
      if (particle.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  private drawSpikeStrip(ctx: CanvasRenderingContext2D, strip: SpikeStrip, color: string) {
    const size = 12;
    const count = Math.max(1, Math.floor(strip.w / size));
    ctx.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const x = strip.x + i * size;
      ctx.beginPath();
      if (strip.dir === 'up') {
        ctx.moveTo(x, strip.y + strip.h);
        ctx.lineTo(x + size / 2, strip.y);
        ctx.lineTo(x + size, strip.y + strip.h);
      } else {
        ctx.moveTo(x, strip.y);
        ctx.lineTo(x + size / 2, strip.y + strip.h);
        ctx.lineTo(x + size, strip.y);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
}
