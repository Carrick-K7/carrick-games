import { BaseGame } from '../core/game.js';

// ─── Constants ───────────────────────────────────────────────────────────────
const W = 480;
const H = 560;
const LIVES = 3;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getTheme(): { bg: string; fg: string; accent: string } {
  const dark = document.documentElement.getAttribute('data-theme') !== 'light';
  return {
    bg: dark ? '#0b0f19' : '#fafafa',
    fg: dark ? '#39C5BB' : '#0d9488',
    accent: dark ? '#ff6b6b' : '#dc2626',
  };
}

function getText(lang: string, key: string): string {
  const texts: Record<string, Record<string, string>> = {
    en: {
      title: 'JOUST',
      start: 'PRESS SPACE TO START',
      over: 'GAME OVER',
      score: 'SCORE',
      lives: 'LIVES',
      wave: 'WAVE',
    },
    zh: {
      title: '角鹰骑士',
      start: '按空格键开始',
      over: '游戏结束',
      score: '得分',
      lives: '生命',
      wave: '波次',
    },
  };
  return texts[lang]?.[key] ?? texts.en[key];
}

// ─── Platform ─────────────────────────────────────────────────────────────────
interface Platform {
  x: number;
  y: number;
  w: number;
  h: number;
}

const PLATFORMS: Platform[] = [
  { x: 0, y: H - 20, w: W, h: 20 },   // ground
  { x: 60, y: H - 130, w: 150, h: 10 },
  { x: W - 210, y: H - 130, w: 150, h: 10 },
  { x: 160, y: H - 230, w: 160, h: 10 },
  { x: 40, y: H - 330, w: 120, h: 10 },
  { x: W - 160, y: H - 330, w: 120, h: 10 },
  { x: 170, y: H - 430, w: 140, h: 10 },
];

// ─── Enemy types ─────────────────────────────────────────────────────────────
interface EnemyType {
  name: string;
  color: string;
  speed: number;
  flapInterval: number;
  size: number;
  score: number;
}

const ENEMY_TYPES: EnemyType[] = [
  { name: 'Bounder', color: '#ff6b6b', speed: 60, flapInterval: 1.2, size: 12, score: 250 },
  { name: 'Hunter', color: '#ffd93d', speed: 90, flapInterval: 0.9, size: 12, score: 500 },
  { name: 'Dreadnought', color: '#c77dff', speed: 50, flapInterval: 1.5, size: 16, score: 750 },
];

// ─── Entity ───────────────────────────────────────────────────────────────────
interface Entity {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dirX: number;  // -1 left, 1 right
  alive: boolean;
  size: number;
  color: string;
  // flap
  flapTimer: number;
  flapCooldown: number;
  onGround: boolean;
  // animation
  wingAngle: number;
  wingDir: number;
}

function makePlayer(): Entity {
  return {
    x: W / 2,
    y: H - 80,
    vx: 0,
    vy: 0,
    dirX: 1,
    alive: true,
    size: 14,
    color: '#39C5BB',
    flapTimer: 0,
    flapCooldown: 0,
    onGround: false,
    wingAngle: 0,
    wingDir: 1,
  };
}

function makeEnemy(type: EnemyType, wave: number, index: number): Entity {
  const spacing = W / (wave + 2);
  return {
    x: spacing * (index + 1),
    y: 60 + Math.sin(index) * 30,
    vx: type.speed * (index % 2 === 0 ? 1 : -1),
    vy: 0,
    dirX: index % 2 === 0 ? 1 : -1,
    alive: true,
    size: type.size,
    color: type.color,
    flapTimer: Math.random() * type.flapInterval,
    flapCooldown: type.flapInterval,
    onGround: false,
    wingAngle: 0,
    wingDir: 1,
  };
}

// ─── Egg (dropped by killed enemies) ─────────────────────────────────────────
interface Egg {
  x: number;
  y: number;
  vy: number;
  active: boolean;
  player: boolean; // true=belongs to player, false=enemy
}

// ─── Explosion particle ───────────────────────────────────────────────────────
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

// ─── Game State ───────────────────────────────────────────────────────────────
interface State {
  phase: 'title' | 'playing' | 'gameover';
  player: Entity;
  enemies: Entity[];
  eggs: Egg[];
  particles: Particle[];
  score: number;
  lives: number;
  wave: number;
  flap: boolean;
  flapHeld: boolean;
  respawnTimer: number;
  waveCompleteTimer: number;
  enemyTypeIndex: number;
}

// ─── JoustGame ────────────────────────────────────────────────────────────────
export class JoustGame extends BaseGame {
  private state!: State;
  private keys: Set<string> = new Set();
  private touchStartY = 0;

  constructor() {
    super('gameCanvas', W, H);
  }

  init() {
    this.startGame();
  }

  private startGame() {
    this.state = {
      phase: 'title',
      player: makePlayer(),
      enemies: [],
      eggs: [],
      particles: [],
      score: 0,
      lives: LIVES,
      wave: 1,
      flap: false,
      flapHeld: false,
      respawnTimer: 0,
      waveCompleteTimer: 0,
      enemyTypeIndex: 0,
    };
  }

  private startWave() {
    const wave = this.state.wave;
    const typeIdx = Math.min(this.state.enemyTypeIndex, ENEMY_TYPES.length - 1);
    const type = ENEMY_TYPES[typeIdx];
    const count = Math.min(2 + wave, 8);
    this.state.enemies = [];
    for (let i = 0; i < count; i++) {
      this.state.enemies.push(makeEnemy(type, wave, i));
    }
    this.state.player = makePlayer();
    this.state.respawnTimer = 0;
  }

  private spawnExplosion(x: number, y: number, color: string) {
    for (let i = 0; i < 10; i++) {
      const angle = (Math.PI * 2 * i) / 10 + Math.random() * 0.5;
      const speed = 60 + Math.random() * 80;
      this.state.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.6 + Math.random() * 0.3,
        color,
      });
    }
  }

  private dropEggs(x: number, y: number, count: number) {
    for (let i = 0; i < count; i++) {
      this.state.eggs.push({
        x: x + (Math.random() - 0.5) * 20,
        y,
        vy: -50 - Math.random() * 50,
        active: true,
        player: false,
      });
    }
  }

  private playerFlap(p: Entity) {
    p.vy = -220;
    p.flapTimer = p.flapCooldown;
    p.onGround = false;
  }

  private enemyFlap(e: EnemyType, p: Entity) {
    p.vy = -200 - Math.random() * 40;
    p.vx = e.speed * p.dirX;
    p.flapTimer = p.flapCooldown;
    p.onGround = false;
  }

  private isOnPlatform(p: { x: number; y: number; size: number }): boolean {
    const foot = p.y + p.size;
    for (const plat of PLATFORMS) {
      if (
        p.x > plat.x - 5 &&
        p.x < plat.x + plat.w + 5 &&
        foot >= plat.y &&
        foot <= plat.y + plat.h + 4
      ) {
        return true;
      }
    }
    return false;
  }

  private clampToPlatform(p: Entity) {
    for (const plat of PLATFORMS) {
      const foot = p.y + p.size;
      if (
        p.x > plat.x - 5 &&
        p.x < plat.x + plat.w + 5 &&
        foot >= plat.y - 2 &&
        foot <= plat.y + plat.h + 4
      ) {
        p.y = plat.y - p.size;
        p.vy = 0;
        p.onGround = true;
        return;
      }
    }
    p.onGround = false;
  }

  private updateEntity(e: Entity, dt: number, flap: boolean, flapCooldown: number) {
    // Gravity
    e.vy += 400 * dt;
    // Flap
    if (flap && e.flapTimer <= 0) {
      e.vy = -220;
      e.flapTimer = flapCooldown;
      e.onGround = false;
    }
    if (e.flapTimer > 0) e.flapTimer -= dt;

    e.x += e.vx * dt;
    e.y += e.vy * dt;

    // Horizontal wrap
    if (e.x < -e.size) e.x = W + e.size;
    if (e.x > W + e.size) e.x = -e.size;

    // Vertical wrap (player only)
    if (e.y < -e.size * 2) e.y = H + e.size;
    if (e.y > H + e.size) e.y = -e.size * 2;

    // Platform landing
    if (e.vy >= 0) {
      this.clampToPlatform(e);
    }

    // Wing animation
    if (!e.onGround) {
      e.wingAngle += e.wingDir * dt * 12;
      if (e.wingAngle > 1 || e.wingAngle < -1) e.wingDir *= -1;
    } else {
      e.wingAngle = 0;
    }

    // Enemy AI: auto-flap
    if (e.alive && e.flapTimer <= 0 && Math.random() < dt / e.flapCooldown) {
      const type = ENEMY_TYPES[Math.min(this.state.enemyTypeIndex, ENEMY_TYPES.length - 1)];
      e.vy = -200 - Math.random() * 40;
      e.flapTimer = e.flapCooldown;
      e.onGround = false;
    }
  }

  update(dt: number) {
    const s = this.state;
    const flap = s.flap && !s.flapHeld;
    s.flapHeld = s.flap;

    // Particles
    s.particles = s.particles.filter((p) => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 200 * dt;
      p.life -= dt;
      return p.life > 0;
    });

    // Eggs
    for (const egg of s.eggs) {
      if (!egg.active) continue;
      egg.vy += 300 * dt;
      egg.y += egg.vy * dt;
      if (egg.y > H) egg.active = false;
    }

    if (s.phase === 'title') {
      // Animate title screen
      this.updateEntity(s.player, dt, false, 0);
      return;
    }

    if (s.phase === 'gameover') {
      return;
    }

    if (s.respawnTimer > 0) {
      s.respawnTimer -= dt;
      if (s.respawnTimer <= 0) {
        s.player = makePlayer();
        s.player.alive = true;
      }
      return;
    }

    if (s.waveCompleteTimer > 0) {
      s.waveCompleteTimer -= dt;
      if (s.waveCompleteTimer <= 0) {
        s.wave++;
        s.enemyTypeIndex = Math.min(s.enemyTypeIndex + 1, ENEMY_TYPES.length - 1);
        this.startWave();
      }
      return;
    }

    // Player
    const p = s.player;
    this.updateEntity(p, dt, flap, 0.2);

    // Enemies
    for (const e of s.enemies) {
      if (!e.alive) continue;
      // AI movement
      const type = ENEMY_TYPES[Math.min(this.state.enemyTypeIndex, ENEMY_TYPES.length - 1)];
      e.flapTimer -= dt;
      if (e.flapTimer <= 0 && !e.onGround) {
        // Random direction change
        if (Math.random() < 0.02) e.dirX *= -1;
        e.vx = type.speed * e.dirX;
        e.vy = -180 - Math.random() * 50;
        e.flapTimer = type.flapInterval;
      }
      if (e.flapTimer > 0 && e.onGround) e.flapTimer -= dt;
      this.updateEntity(e, dt, false, type.flapInterval);

      // Enemy-player collision
      if (!p.alive) continue;
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = p.size + e.size;
      if (dist < minDist) {
        if (p.y < e.y - 2) {
          // Player is above — kill enemy
          e.alive = false;
          s.score += ENEMY_TYPES[Math.min(s.enemyTypeIndex, ENEMY_TYPES.length - 1)].score;
          this.spawnExplosion(e.x, e.y, e.color);
          this.dropEggs(e.x, e.y, 1 + Math.floor(s.wave / 2));
          // Bounce player up
          p.vy = -150;
        } else if (p.y > e.y + 2) {
          // Player is below — player dies
          p.alive = false;
          this.spawnExplosion(p.x, p.y, p.color);
          s.lives--;
          if (s.lives <= 0) {
            s.phase = 'gameover';
            (window as any).reportScore?.(s.score);
          } else {
            s.respawnTimer = 1.5;
          }
        } else {
          // Same level — bounce
          p.vx = dx > 0 ? 80 : -80;
          e.vx = dx > 0 ? -80 : 80;
          p.vy = -60;
        }
      }
    }

    // Player-enemy same-level bounce
    // (handled above)

    // Egg collection
    for (const egg of s.eggs) {
      if (!egg.active) continue;
      const dx = p.x - egg.x;
      const dy = p.y - egg.y;
      if (Math.sqrt(dx * dx + dy * dy) < p.size + 8) {
        egg.active = false;
        s.score += 50;
      }
    }

    // Check wave complete
    if (s.enemies.every((e) => !e.alive) && s.waveCompleteTimer === 0) {
      s.waveCompleteTimer = 2.0;
    }
  }

  private drawBird(ctx: CanvasRenderingContext2D, e: Entity, isPlayer: boolean) {
    const t = getTheme();
    const col = isPlayer ? t.fg : e.color;
    const { x, y, dirX, size, wingAngle, onGround } = e;

    ctx.save();
    ctx.translate(x, y);
    if (dirX < 0) ctx.scale(-1, 1);

    // Body
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(0, 0, size, size * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Wing (flapping)
    ctx.save();
    ctx.rotate(wingAngle * 0.5);
    ctx.fillStyle = col + 'cc';
    ctx.beginPath();
    ctx.ellipse(-size * 0.2, -size * 0.3, size * 0.9, size * 0.3, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Beak
    ctx.fillStyle = '#ffd93d';
    ctx.beginPath();
    ctx.moveTo(size, -2);
    ctx.lineTo(size + 8, 0);
    ctx.lineTo(size, 4);
    ctx.closePath();
    ctx.fill();

    // Eye
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(size * 0.4, -size * 0.2, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(size * 0.4 + 1, -size * 0.2, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Lance (player only)
    if (isPlayer) {
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(size * 0.5, 0);
      ctx.lineTo(size + 16, 0);
      ctx.stroke();
    }

    ctx.restore();
  }

  draw(ctx: CanvasRenderingContext2D) {
    const t = getTheme();
    const lang = document.documentElement.getAttribute('data-lang') === 'zh' ? 'zh' : 'en';
    const s = this.state;

    // Background
    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, W, H);

    // Grid lines (subtle)
    ctx.strokeStyle = t.fg + '15';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Platforms
    for (const plat of PLATFORMS) {
      ctx.fillStyle = t.fg + '60';
      ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
      // Top highlight
      ctx.fillStyle = t.fg;
      ctx.fillRect(plat.x, plat.y, plat.w, 2);
    }

    // Eggs
    for (const egg of s.eggs) {
      if (!egg.active) continue;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(egg.x, egg.y, 5, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#cccccc';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Particles
    for (const p of s.particles) {
      ctx.globalAlpha = Math.max(0, p.life / 0.6);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Enemies
    for (const e of s.enemies) {
      if (!e.alive) continue;
      this.drawBird(ctx, e, false);
    }

    // Player
    if (s.respawnTimer <= 0 && s.player.alive) {
      this.drawBird(ctx, s.player, true);
    } else if (s.respawnTimer > 0) {
      // Blink effect
      if (Math.floor(s.respawnTimer * 6) % 2 === 0) {
        this.drawBird(ctx, s.player, true);
      }
    }

    // HUD
    ctx.font = "10px 'Press Start 2P', monospace";
    ctx.fillStyle = t.fg;
    ctx.textAlign = 'left';
    ctx.fillText(`${getText(lang, 'score')}: ${s.score}`, 8, 18);
    ctx.textAlign = 'right';
    ctx.fillText(`${getText(lang, 'wave')}: ${s.wave}`, W - 8, 18);
    ctx.textAlign = 'left';
    ctx.fillText(`${getText(lang, 'lives')}: ${'♥'.repeat(s.lives)}`, 8, H - 6);

    // Title screen
    if (s.phase === 'title') {
      ctx.fillStyle = t.bg + 'cc';
      ctx.fillRect(0, 0, W, H);

      ctx.font = "24px 'Press Start 2P', monospace";
      ctx.fillStyle = t.fg;
      ctx.textAlign = 'center';
      ctx.fillText(getText(lang, 'title'), W / 2, H / 2 - 40);

      ctx.font = "8px 'Press Start 2P', monospace";
      ctx.fillStyle = t.fg + 'cc';
      ctx.fillText(getText(lang, 'start'), W / 2, H / 2 + 10);

      ctx.font = "7px 'Press Start 2P', monospace";
      ctx.fillStyle = t.fg + '88';
      ctx.fillText('SPACE/W/↑ = FLAP', W / 2, H / 2 + 36);
      ctx.fillText('← → = MOVE', W / 2, H / 2 + 52);
      ctx.fillText('HIT ENEMY FROM ABOVE!', W / 2, H / 2 + 68);
    }

    // Game over
    if (s.phase === 'gameover') {
      ctx.fillStyle = t.bg + 'dd';
      ctx.fillRect(0, 0, W, H);

      ctx.font = "20px 'Press Start 2P', monospace";
      ctx.fillStyle = t.accent;
      ctx.textAlign = 'center';
      ctx.fillText(getText(lang, 'over'), W / 2, H / 2 - 30);

      ctx.font = "10px 'Press Start 2P', monospace";
      ctx.fillStyle = t.fg;
      ctx.fillText(`${getText(lang, 'score')}: ${s.score}`, W / 2, H / 2 + 10);
      ctx.fillText(`${getText(lang, 'wave')}: ${s.wave}`, W / 2, H / 2 + 30);

      ctx.font = "7px 'Press Start 2P', monospace";
      ctx.fillStyle = t.fg + '88';
      ctx.fillText(getText(lang, 'start'), W / 2, H / 2 + 56);
    }

    // Wave complete banner
    if (s.waveCompleteTimer > 0.5) {
      ctx.font = "12px 'Press Start 2P', monospace";
      ctx.fillStyle = t.fg;
      ctx.textAlign = 'center';
      ctx.fillText(`${getText(lang, 'wave')} ${s.wave} ${lang === 'zh' ? '完成' : 'COMPLETE'}!`, W / 2, H / 2 - 10);
    }
  }

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    const s = this.state;

    if (e.type === 'keydown') {
      const ke = e as KeyboardEvent;
      if (ke.key === ' ' || ke.key === 'ArrowUp' || ke.key === 'w' || ke.key === 'W' || ke.key === 'ArrowUp') {
        this.keys.add('flap');
        if (s.phase === 'title') {
          s.phase = 'playing';
          this.startWave();
        } else if (s.phase === 'gameover') {
          this.startGame();
          s.phase = 'playing';
          this.startWave();
        }
      }
      if (ke.key === 'ArrowLeft' || ke.key === 'a' || ke.key === 'A') {
        this.keys.add('left');
        if (s.player.alive) s.player.dirX = -1;
      }
      if (ke.key === 'ArrowRight' || ke.key === 'd' || ke.key === 'D') {
        this.keys.add('right');
        if (s.player.alive) s.player.dirX = 1;
      }
      if (ke.key === ' ') {
        e.preventDefault();
      }
    }

    if (e.type === 'keyup') {
      const ke = e as KeyboardEvent;
      if (ke.key === ' ' || ke.key === 'ArrowUp' || ke.key === 'w' || ke.key === 'W') {
        this.keys.delete('flap');
      }
      if (ke.key === 'ArrowLeft' || ke.key === 'a' || ke.key === 'A') {
        this.keys.delete('left');
      }
      if (ke.key === 'ArrowRight' || ke.key === 'd' || ke.key === 'D') {
        this.keys.delete('right');
      }
    }

    // Touch
    if (e.type === 'touchstart') {
      e.preventDefault();
      const touch = (e as TouchEvent).touches[0];
      if (!touch) return;
      this.touchStartY = touch.clientY;

      if (s.phase === 'title') {
        s.phase = 'playing';
        this.startWave();
        return;
      }
      if (s.phase === 'gameover') {
        this.startGame();
        s.phase = 'playing';
        this.startWave();
        return;
      }

      const rect = this.canvas.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      if (x < W / 3) {
        this.keys.add('left');
        this.keys.add('flap');
      } else if (x > (W * 2) / 3) {
        this.keys.add('right');
        this.keys.add('flap');
      } else {
        this.keys.add('flap');
      }
    }

    if (e.type === 'touchend') {
      this.keys.delete('flap');
      this.keys.delete('left');
      this.keys.delete('right');
    }

    // Mouse
    if (e.type === 'mousedown') {
      if (s.phase === 'title') {
        s.phase = 'playing';
        this.startWave();
        return;
      }
      if (s.phase === 'gameover') {
        this.startGame();
        s.phase = 'playing';
        this.startWave();
        return;
      }
      this.keys.add('flap');
    }
    if (e.type === 'mouseup') {
      this.keys.delete('flap');
      this.keys.delete('left');
      this.keys.delete('right');
    }

    s.flap = this.keys.has('flap');
    if (s.player.alive) {
      const speed = 120;
      if (this.keys.has('left')) s.player.vx = -speed;
      else if (this.keys.has('right')) s.player.vx = speed;
      else if (s.player.onGround) s.player.vx *= 0.8;
    }
  }
}
