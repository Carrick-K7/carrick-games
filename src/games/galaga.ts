import { BaseGame, isDarkTheme as getEffectiveDarkTheme } from '../core/game.js';

// ─── Types ───────────────────────────────────────────────────────────────────
type EnemyKind = 'drone' | 'boss';
type EnemyState = 'entering' | 'formation' | 'diving' | 'returning';
type GameState = 'start' | 'playing' | 'gameover';

// ─── Constants ────────────────────────────────────────────────────────────────
const W = 420;
const H = 620;
const PLAYER_W = 36;
const PLAYER_H = 24;
const BULLET_W = 4;
const BULLET_H = 14;
const BULLET_SPEED = 480;
const ENEMY_BULLET_SPEED = 220;
const FORMATION_ROWS = 4;
const FORMATION_COLS = 8;
const ENEMY_SPACING_X = 44;
const ENEMY_SPACING_Y = 36;
const FORMATION_TOP = 80;
const FORMATION_LEFT = (W - FORMATION_COLS * ENEMY_SPACING_X) / 2 + ENEMY_SPACING_X / 2;
const PLAYER_Y = H - 50;
const ENEMY_BOSS_ROWS = [0, 1]; // rows that have boss enemies
const FORMATION_MOVE_SPEED = 18;
const FORMATION_MOVE_INTERVAL = 0.6;
const DIVE_CHANCE_PER_TICK = 0.008;
const ENEMY_FIRE_INTERVAL = 1.8;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getTheme(): { isDark: boolean; bg: string; primary: string; enemyDrone: string; enemyBoss: string } {
  const isDark = getEffectiveDarkTheme();
  return {
    isDark,
    bg: isDark ? '#0b1a2e' : '#e3f2fd',
    primary: isDark ? '#39C5BB' : '#0d9488',
    enemyDrone: isDark ? '#44cc44' : '#2e7d32',
    enemyBoss: isDark ? '#4488ff' : '#1565c0',
  };
}

function getText(isZh: boolean, en: string, zh: string): string {
  return isZh ? zh : en;
}

// ─── Interfaces ──────────────────────────────────────────────────────────────
interface Bullet {
  x: number; y: number; active: boolean; isEnemy: boolean;
}
interface Enemy {
  x: number; y: number; vx: number; vy: number;
  kind: EnemyKind; state: EnemyState;
  alive: boolean; index: number;
  // formation position
  formCol: number; formRow: number;
  // diving curve
  diveT: number; diveStartX: number; diveStartY: number;
  // entry animation
  entryT: number; entryDuration: number;
}
interface Explosion {
  x: number; y: number; t: number; duration: number;
}

// ─── Game ─────────────────────────────────────────────────────────────────────
export class GalagaGame extends BaseGame {
  // Player
  private playerX = 0;
  private leftHeld = false;
  private rightHeld = false;
  private shootHeld = false;
  private lastFireTime = 0;
  private fireCooldown = 0.25;
  private invulnerable = 0;

  // Game objects
  private bullets: Bullet[] = [];
  private enemies: Enemy[] = [];
  private explosions: Explosion[] = [];
  private enemyBullets: Bullet[] = [];

  // State
  private state: GameState = 'start';
  private score = 0;
  private lives = 3;
  private wave = 1;
  private waveClearTimer = 0;
  private waveClearDelay = 2.0;

  // Formation movement
  private formDir = 1; // 1=right, -1=left
  private formMoveTimer = 0;
  private formMoveAccum = 0;
  private formationMinX = 0;
  private formationMaxX = 0;

  // Enemy firing
  private enemyFireTimer = 0;

  // Respawn
  private respawnTimer = 0;
  private respawnDelay = 1.5;

  constructor() {
    super('gameCanvas', W, H);
  }

  init() {
    this.playerX = (W - PLAYER_W) / 2;
    this.leftHeld = false;
    this.rightHeld = false;
    this.shootHeld = false;
    this.lastFireTime = 0;
    this.invulnerable = 0;
    this.bullets = [];
    this.enemyBullets = [];
    this.explosions = [];
    this.score = 0;
    this.lives = 3;
    this.wave = 1;
    this.formDir = 1;
    this.formMoveTimer = 0;
    this.formMoveAccum = 0;
    this.enemyFireTimer = 0;
    this.waveClearTimer = 0;
    this.respawnTimer = 0;
    this.spawnWave();
    this.state = 'start';
  }

  private spawnWave() {
    this.enemies = [];
    this.enemyBullets = [];
    let idx = 0;
    for (let r = 0; r < FORMATION_ROWS; r++) {
      for (let c = 0; c < FORMATION_COLS; c++) {
        const isBoss = ENEMY_BOSS_ROWS.includes(r);
        const kind: EnemyKind = isBoss ? 'boss' : 'drone';
        const enemy: Enemy = {
          x: FORMATION_LEFT + c * ENEMY_SPACING_X,
          y: FORMATION_TOP + r * ENEMY_SPACING_Y,
          vx: 0, vy: 0,
          kind,
          state: 'entering',
          alive: true,
          index: idx++,
          formCol: c, formRow: r,
          diveT: 0,
          diveStartX: 0, diveStartY: 0,
          entryT: 0,
          entryDuration: 1.0 + r * 0.15,
        };
        this.enemies.push(enemy);
      }
    }
    this.computeFormationBounds();
  }

  private computeFormationBounds() {
    const leftmost = Math.min(...this.enemies.filter(e => e.alive).map(e => e.formCol));
    const rightmost = Math.max(...this.enemies.filter(e => e.alive).map(e => e.formCol));
    this.formationMinX = FORMATION_LEFT + leftmost * ENEMY_SPACING_X;
    this.formationMaxX = FORMATION_LEFT + rightmost * ENEMY_SPACING_X;
  }

  private startGame() {
    this.state = 'playing';
  }

  private respawnPlayer() {
    this.playerX = (W - PLAYER_W) / 2;
    this.invulnerable = 2.0;
    this.enemyBullets = [];
  }

  private enemyDive(e: Enemy) {
    if (e.state !== 'formation' && e.state !== 'entering') return;
    if (Math.random() > DIVE_CHANCE_PER_TICK * (this.wave + 1)) return;
    e.state = 'diving';
    e.diveT = 0;
    e.diveStartX = e.x;
    e.diveStartY = e.y;
    // pick a dive direction
    const targetX = this.playerX + PLAYER_W / 2 + (Math.random() - 0.5) * 80;
    const dx = targetX - e.x;
    e.vx = dx * 0.8;
    e.vy = 90 + this.wave * 10;
  }

  private enemyReturn(e: Enemy) {
    const targetX = FORMATION_LEFT + e.formCol * ENEMY_SPACING_X;
    const targetY = FORMATION_TOP + e.formRow * ENEMY_SPACING_Y;
    const dx = targetX - e.x;
    const dy = targetY - e.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 4) {
      e.x = targetX;
      e.y = targetY;
      e.state = 'formation';
      e.vx = 0; e.vy = 0;
    } else {
      const spd = 180;
      e.vx = (dx / dist) * spd;
      e.vy = (dy / dist) * spd;
    }
  }

  private enemyFire() {
    const shooters = this.enemies.filter(e => e.alive && (e.state === 'diving' || e.state === 'formation'));
    if (shooters.length === 0) return;
    const shooter = shooters[Math.floor(Math.random() * shooters.length)];
    this.enemyBullets.push({
      x: shooter.x - BULLET_W / 2,
      y: shooter.y + 10,
      active: true,
      isEnemy: true,
    });
  }

  private checkCollision(a: { x: number; y: number; w: number; h: number },
                        b: { x: number; y: number; w: number; h: number }): boolean {
    return a.x < b.x + b.w && a.x + a.w > b.x &&
           a.y < b.y + b.h && a.y + a.h > b.y;
  }

  private addExplosion(x: number, y: number) {
    this.explosions.push({ x, y, t: 0, duration: 0.4 });
  }

  update(dt: number) {
    const isZh = document.documentElement.getAttribute('data-lang') === 'zh';

    if (this.state === 'start') return;
    if (this.state === 'gameover') return;

    // Invulnerability timer
    if (this.invulnerable > 0) this.invulnerable -= dt;

    // Respawn timer
    if (this.respawnTimer > 0) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this.respawnPlayer();
        this.state = 'playing';
      }
      // Still update bullets/explosions during respawn
    }

    // ── Player movement ──────────────────────────────────────────────────────
    if (this.respawnTimer <= 0) {
      const speed = 260;
      if (this.leftHeld && this.playerX > 0) this.playerX -= speed * dt;
      if (this.rightHeld && this.playerX < W - PLAYER_W) this.playerX += speed * dt;
      this.playerX = Math.max(0, Math.min(W - PLAYER_W, this.playerX));

      // Auto-fire when held
      if (this.shootHeld) {
        const now = performance.now() / 1000;
        if (now - this.lastFireTime >= this.fireCooldown) {
          this.lastFireTime = now;
          this.bullets.push({
            x: this.playerX + PLAYER_W / 2 - BULLET_W / 2,
            y: PLAYER_Y - BULLET_H,
            active: true,
            isEnemy: false,
          });
        }
      }
    }

    // ── Bullets ─────────────────────────────────────────────────────────────
    for (const b of this.bullets) {
      if (!b.active) continue;
      b.y -= BULLET_SPEED * dt;
      if (b.y + BULLET_H < 0) b.active = false;
    }

    for (const b of this.enemyBullets) {
      if (!b.active) continue;
      b.y += ENEMY_BULLET_SPEED * dt;
      if (b.y > H) b.active = false;
    }

    // ── Enemies ─────────────────────────────────────────────────────────────
    for (const e of this.enemies) {
      if (!e.alive) continue;

      if (e.state === 'entering') {
        e.entryT += dt;
        const t = Math.min(1, e.entryT / e.entryDuration);
        // ease out
        const ease = 1 - Math.pow(1 - t, 3);
        const startX = W / 2;
        const startY = -30;
        e.x = startX + (FORMATION_LEFT + e.formCol * ENEMY_SPACING_X - startX) * ease;
        e.y = startY + (FORMATION_TOP + e.formRow * ENEMY_SPACING_Y - startY) * ease;
        if (t >= 1) {
          e.state = 'formation';
          e.x = FORMATION_LEFT + e.formCol * ENEMY_SPACING_X;
          e.y = FORMATION_TOP + e.formRow * ENEMY_SPACING_Y;
        }
        continue;
      }

      if (e.state === 'formation') {
        // Formation movement
        this.formMoveAccum += dt;
        if (this.formMoveAccum >= FORMATION_MOVE_INTERVAL) {
          this.formMoveAccum -= FORMATION_MOVE_INTERVAL;
          this.formDir *= -1;
          // also trigger some dives
          const divers = this.enemies.filter(en => en.alive && en.state === 'formation');
          const count = Math.min(divers.length, 1 + Math.floor(this.wave / 2));
          for (let i = 0; i < count; i++) {
            const idx = Math.floor(Math.random() * divers.length);
            this.enemyDive(divers[idx]);
          }
        }
        e.vx = this.formDir * FORMATION_MOVE_SPEED * (1 + (this.wave - 1) * 0.1);
        e.vy = 0;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        // bounds check
        if (e.x < 10 || e.x > W - 10) {
          this.formDir *= -1;
        }
        continue;
      }

      if (e.state === 'diving') {
        e.diveT += dt;
        // Curve dive
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        // If below screen or reached target, return to formation
        if (e.y > H + 40) {
          this.enemyReturn(e);
        }
        continue;
      }

      if (e.state === 'returning') {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        this.enemyReturn(e);
        continue;
      }
    }

    // ── Enemy firing ────────────────────────────────────────────────────────
    this.enemyFireTimer += dt;
    if (this.enemyFireTimer >= ENEMY_FIRE_INTERVAL / (1 + this.wave * 0.15)) {
      this.enemyFireTimer = 0;
      this.enemyFire();
    }

    // ── Collisions: player bullets vs enemies ───────────────────────────────
    for (const b of this.bullets) {
      if (!b.active) continue;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (this.checkCollision(
          { x: b.x, y: b.y, w: BULLET_W, h: BULLET_H },
          { x: e.x - 10, y: e.y - 8, w: 20, h: 16 }
        )) {
          b.active = false;
          e.alive = false;
          this.score += e.kind === 'boss' ? 200 : 100;
          this.addExplosion(e.x, e.y);
          break;
        }
      }
    }

    // ── Collisions: enemy bullets vs player ─────────────────────────────────
    if (this.invulnerable <= 0 && this.respawnTimer <= 0) {
      for (const b of this.enemyBullets) {
        if (!b.active) continue;
        if (this.checkCollision(
          { x: b.x, y: b.y, w: BULLET_W, h: BULLET_H },
          { x: this.playerX, y: PLAYER_Y, w: PLAYER_W, h: PLAYER_H }
        )) {
          b.active = false;
          this.playerHit();
          break;
        }
      }
      // Collision with diving enemies
      for (const e of this.enemies) {
        if (!e.alive || e.state !== 'diving') continue;
        if (this.checkCollision(
          { x: e.x - 10, y: e.y - 8, w: 20, h: 16 },
          { x: this.playerX, y: PLAYER_Y, w: PLAYER_W, h: PLAYER_H }
        )) {
          e.alive = false;
          this.addExplosion(e.x, e.y);
          this.playerHit();
          break;
        }
      }
    }

    // ── Explosions ─────────────────────────────────────────────────────────
    for (const ex of this.explosions) {
      ex.t += dt;
    }
    this.explosions = this.explosions.filter(ex => ex.t < ex.duration);

    // ── Clean up dead bullets ───────────────────────────────────────────────
    this.bullets = this.bullets.filter(b => b.active);
    this.enemyBullets = this.enemyBullets.filter(b => b.active);

    // ── Wave clear check ────────────────────────────────────────────────────
    const alive = this.enemies.filter(e => e.alive);
    if (alive.length === 0 && this.state === 'playing') {
      this.waveClearTimer += dt;
      if (this.waveClearTimer >= this.waveClearDelay) {
        this.waveClearTimer = 0;
        this.wave++;
        this.spawnWave();
      }
    }
  }

  private playerHit() {
    this.lives--;
    this.addExplosion(this.playerX + PLAYER_W / 2, PLAYER_Y + PLAYER_H / 2);
    if (this.lives <= 0) {
      this.state = 'gameover';
      window.reportScore?.(this.score);
    } else {
      this.respawnTimer = this.respawnDelay;
      this.state = 'playing';
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const { isDark, bg, primary, enemyDrone, enemyBoss } = getTheme();
    const isZh = document.documentElement.getAttribute('data-lang') === 'zh';

    // Background
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Starfield (static dots)
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.2)';
    const starSeed = [7,13,19,23,29,37,41,43,47,53,59,61,67,71,73,79,83,89,97,
      101,103,107,109,113,127,131,137,139,149,151,157,163,167,173,179,181,191,
      193,197,199,211,223,227,229,233,239,241,251,257,263,269,271,277,281,283];
    for (let i = 0; i < 60; i++) {
      const sx = (starSeed[i] * 97) % W;
      const sy = (starSeed[i] * 53) % (H - 80);
      ctx.fillRect(sx, sy, 1, 1);
    }

    // HUD
    this.drawHUD(ctx, isDark, isZh);

    // Bullets
    for (const b of this.bullets) {
      ctx.fillStyle = primary;
      ctx.fillRect(b.x, b.y, BULLET_W, BULLET_H);
    }
    for (const b of this.enemyBullets) {
      ctx.fillStyle = isDark ? '#ff4444' : '#c62828';
      ctx.fillRect(b.x, b.y, BULLET_W, BULLET_H);
    }

    // Enemies
    for (const e of this.enemies) {
      if (!e.alive) continue;
      this.drawEnemy(ctx, e, isDark, enemyDrone, enemyBoss);
    }

    // Explosions
    for (const ex of this.explosions) {
      const progress = ex.t / ex.duration;
      const alpha = 1 - progress;
      const radius = 8 + progress * 16;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#ffaa00';
      ctx.beginPath();
      ctx.arc(ex.x, ex.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff4400';
      ctx.beginPath();
      ctx.arc(ex.x, ex.y, radius * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Player (blink when invulnerable)
    if (this.respawnTimer <= 0) {
      const show = this.invulnerable <= 0 || (Math.floor(this.invulnerable * 8) % 2 === 0);
      if (show) this.drawPlayer(ctx, isDark);
    }

    // Wave clear flash
    if (this.waveClearTimer > 0 && this.enemies.filter(e => e.alive).length === 0) {
      ctx.fillStyle = isDark ? 'rgba(57,197,187,0.2)' : 'rgba(13,148,136,0.15)';
      ctx.fillRect(0, 0, W, H);
      ctx.font = "11px 'Press Start 2P', monospace";
      ctx.fillStyle = primary;
      ctx.textAlign = 'center';
      const t = isZh ? `第 ${this.wave} 关完成!` : `WAVE ${this.wave} CLEAR!`;
      ctx.fillText(t, W / 2, H / 2);
      const nt = isZh ? `第 ${this.wave + 1} 关即将开始...` : `NEXT WAVE...`;
      ctx.font = "8px 'Press Start 2P', monospace";
      ctx.fillText(nt, W / 2, H / 2 + 20);
      ctx.textAlign = 'left';
    }

    // Overlays
    if (this.state === 'start') {
      this.drawOverlay(ctx, isDark, isZh,
        'GALAGA',
        isZh ? '大战役' : '',
        'PRESS SPACE TO START',
        isZh ? '空格键开始' : '');
    } else if (this.state === 'gameover') {
      this.drawOverlay(ctx, isDark, isZh,
        `GAME OVER`,
        isZh ? `游戏结束  得分: ${this.score}` : `SCORE: ${this.score}`,
        'PRESS SPACE TO RESTART',
        isZh ? '空格键重新开始' : '');
    }
  }

  private drawHUD(ctx: CanvasRenderingContext2D, isDark: boolean, isZh: boolean) {
    ctx.font = "9px 'Press Start 2P', monospace";
    ctx.fillStyle = isDark ? '#fff' : '#111';
    ctx.fillText(`SCORE:${this.score}`, 8, 22);
    ctx.fillStyle = isDark ? '#ef5350' : '#c62828';
    ctx.fillText(`LIVES:${this.lives}`, 155, 22);
    ctx.fillStyle = isDark ? '#f9a825' : '#e65100';
    ctx.fillText(`WAVE:${this.wave}`, 295, 22);
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, isDark: boolean) {
    const { primary } = getTheme();
    const cx = this.playerX + PLAYER_W / 2;
    const cy = PLAYER_Y + PLAYER_H / 2;
    // Body
    ctx.fillStyle = primary;
    ctx.beginPath();
    ctx.moveTo(cx, cy - PLAYER_H / 2);
    ctx.lineTo(cx - PLAYER_W / 2, cy + PLAYER_H / 2);
    ctx.lineTo(cx, cy + PLAYER_H / 4);
    ctx.lineTo(cx + PLAYER_W / 2, cy + PLAYER_H / 2);
    ctx.closePath();
    ctx.fill();
    // Cockpit
    ctx.fillStyle = isDark ? '#80deea' : '#4dd0e1';
    ctx.beginPath();
    ctx.arc(cx, cy - 2, 5, 0, Math.PI * 2);
    ctx.fill();
    // Engine glow
    ctx.fillStyle = isDark ? '#ff8f00' : '#ff6f00';
    ctx.fillRect(cx - 4, cy + PLAYER_H / 4, 8, 4);
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, isDark: boolean,
                    droneCol: string, bossCol: string) {
    const col = e.kind === 'boss' ? bossCol : droneCol;
    ctx.fillStyle = col;
    // Body shape
    ctx.beginPath();
    ctx.arc(e.x, e.y, 10, 0, Math.PI * 2);
    ctx.fill();
    // Wings
    ctx.beginPath();
    ctx.moveTo(e.x - 10, e.y + 4);
    ctx.lineTo(e.x - 16, e.y + 10);
    ctx.lineTo(e.x - 4, e.y + 8);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(e.x + 10, e.y + 4);
    ctx.lineTo(e.x + 16, e.y + 10);
    ctx.lineTo(e.x + 4, e.y + 8);
    ctx.closePath();
    ctx.fill();
    // Eyes
    ctx.fillStyle = isDark ? '#fff' : '#fff';
    ctx.beginPath();
    ctx.arc(e.x - 3, e.y - 3, 2, 0, Math.PI * 2);
    ctx.arc(e.x + 3, e.y - 3, 2, 0, Math.PI * 2);
    ctx.fill();
    // Boss has crown/star detail
    if (e.kind === 'boss') {
      ctx.fillStyle = '#ffeb3b';
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
        const r = i % 2 === 0 ? 5 : 2;
        const px = e.x + Math.cos(angle) * r;
        const py = e.y - 14 + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
    // Diving indicator
    if (e.state === 'diving') {
      ctx.fillStyle = isDark ? 'rgba(255,0,0,0.4)' : 'rgba(255,0,0,0.3)';
      ctx.beginPath();
      ctx.arc(e.x, e.y, 14, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawOverlay(ctx: CanvasRenderingContext2D, isDark: boolean, isZh: boolean,
                     en1: string, en2: string, en3: string, zh: string) {
    ctx.fillStyle = isDark ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.font = "13px 'Press Start 2P', monospace";
    ctx.fillStyle = '#fff';
    ctx.fillText(en1, W / 2, H / 2 - 30);
    ctx.font = "9px 'Press Start 2P', monospace";
    ctx.fillStyle = '#ccc';
    ctx.fillText(en2, W / 2, H / 2);
    ctx.fillStyle = '#39C5BB';
    ctx.fillText(en3, W / 2, H / 2 + 30);
    if (zh) {
      ctx.fillStyle = '#aaa';
      ctx.fillText(zh, W / 2, H / 2 + 48);
    }
    ctx.textAlign = 'left';
  }

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    if (e.type !== 'keydown' && e.type !== 'keyup' &&
        e.type !== 'touchstart' && e.type !== 'touchend' &&
        e.type !== 'mousedown' && e.type !== 'mouseup') return;

    const isKey = e.type === 'keydown' || e.type === 'keyup';
    const pressed = e.type === 'keydown' || e.type === 'touchstart' || e.type === 'mousedown';

    if (isKey) {
      const ke = e as KeyboardEvent;
      const key = ke.key;

      if (this.state === 'start' || this.state === 'gameover') {
        if (key === ' ' || ke.code === 'Space' || ke.code === 'Enter') {
          ke.preventDefault();
          this.init();
          this.startGame();
        }
        return;
      }

      switch (key) {
        case 'ArrowLeft': case 'a': case 'A':
          this.leftHeld = pressed; break;
        case 'ArrowRight': case 'd': case 'D':
          this.rightHeld = pressed; break;
        case ' ': case 'ArrowUp': case 'w': case 'W':
          ke.preventDefault();
          if (pressed) {
            this.shootHeld = true;
          } else {
            this.shootHeld = false;
          }
          break;
      }
    } else {
      if (e instanceof TouchEvent) e.preventDefault();
      // Touch / mouse: tap to start/restart, or shoot
      if (this.state === 'start' || this.state === 'gameover') {
        if (pressed) {
          this.init();
          this.startGame();
        }
        return;
      }
      if (pressed) this.shootHeld = true;
      else this.shootHeld = false;
    }
  }
}
