import { BaseGame } from '../core/game.js';

const W = 480;
const H = 400;
const HORIZON_Y = 82;
const SHORE_Y = 304;
const TURRET_X = W / 2;
const TURRET_Y = H - 48;
const GRAVITY = 260;

type EnemyKind = 'landing' | 'chopper';

interface Shell {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  reload: number;
  drift: number;
}

interface EnemyShot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
}

interface Explosion {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
}

export class BeachHeadGame extends BaseGame {
  private aimAngle = -Math.PI / 2;
  private shellPower = 330;
  private shellCooldown = 0;
  private spawnTimer = 0;
  private waveTimer = 0;
  private elapsed = 0;
  private score = 0;
  private integrity = 120;
  private wave = 1;
  private gameOver = false;
  private nextEnemyId = 1;
  private muzzleFlash = 0;
  private touchStart: { x: number; y: number } | null = null;
  private readonly keysDown = new Set<string>();
  private readonly shells: Shell[] = [];
  private readonly enemies: Enemy[] = [];
  private readonly enemyShots: EnemyShot[] = [];
  private readonly explosions: Explosion[] = [];

  constructor() {
    super('gameCanvas', W, H);
  }

  init() {
    this.resetScoreReport();
    this.aimAngle = -Math.PI / 2;
    this.shellPower = 330;
    this.shellCooldown = 0;
    this.spawnTimer = 0;
    this.waveTimer = 0;
    this.elapsed = 0;
    this.score = 0;
    this.integrity = 120;
    this.wave = 1;
    this.gameOver = false;
    this.nextEnemyId = 1;
    this.muzzleFlash = 0;
    this.touchStart = null;
    this.keysDown.clear();
    this.shells.length = 0;
    this.enemies.length = 0;
    this.enemyShots.length = 0;
    this.explosions.length = 0;
  }

  update(dt: number) {
    if (this.gameOver) return;

    this.elapsed += dt;
    this.waveTimer += dt;
    this.wave = 1 + Math.floor(this.waveTimer / 18);
    this.shellCooldown = Math.max(0, this.shellCooldown - dt);
    this.muzzleFlash = Math.max(0, this.muzzleFlash - dt * 5);

    this.updateAiming(dt);

    this.spawnTimer += dt;
    const spawnInterval = Math.max(0.8, 1.45 - (this.wave - 1) * 0.06);
    if (this.spawnTimer >= spawnInterval) {
      this.spawnTimer = 0;
      this.spawnEnemy();
    }

    this.updateShells(dt);
    this.updateEnemies(dt);
    this.updateEnemyShots(dt);
    this.updateExplosions(dt);
  }

  draw(ctx: CanvasRenderingContext2D) {
    const isDark = this.isDarkTheme();
    const sky = isDark ? '#08111f' : '#dbeafe';
    const skyGlow = isDark ? '#1d4ed8' : '#60a5fa';
    const sea = isDark ? '#0f3157' : '#60a5fa';
    const seaFoam = isDark ? '#6ee7f2' : '#dbeafe';
    const beach = isDark ? '#4b5563' : '#d6b88a';
    const bunker = isDark ? '#1f2937' : '#475569';
    const accent = isDark ? '#39C5BB' : '#0d9488';
    const text = isDark ? '#e0e0e0' : '#1a1a2e';

    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    const glow = ctx.createLinearGradient(0, 0, 0, HORIZON_Y + 40);
    glow.addColorStop(0, sky);
    glow.addColorStop(1, skyGlow);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, HORIZON_Y + 40);

    ctx.fillStyle = sea;
    ctx.fillRect(0, HORIZON_Y, W, SHORE_Y - HORIZON_Y);

    ctx.fillStyle = seaFoam;
    for (let i = 0; i < 5; i++) {
      const y = HORIZON_Y + 26 + i * 42 + Math.sin(this.elapsed * 2 + i) * 4;
      ctx.fillRect(0, y, W, 2);
    }

    ctx.fillStyle = beach;
    ctx.fillRect(0, SHORE_Y, W, H - SHORE_Y);

    ctx.fillStyle = isDark ? '#eab308' : '#f59e0b';
    ctx.beginPath();
    ctx.arc(52, 54, 16, 0, Math.PI * 2);
    ctx.fill();

    for (const enemy of this.enemies) {
      this.drawEnemy(ctx, enemy, isDark);
    }

    for (const shell of this.shells) {
      ctx.fillStyle = isDark ? '#f8fafc' : '#1f2937';
      ctx.beginPath();
      ctx.arc(shell.x, shell.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const shot of this.enemyShots) {
      ctx.fillStyle = '#fb7185';
      ctx.beginPath();
      ctx.arc(shot.x, shot.y, shot.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const explosion of this.explosions) {
      const alpha = Math.max(0, explosion.life / explosion.maxLife);
      ctx.fillStyle = `rgba(251, 191, 36, ${alpha})`;
      ctx.beginPath();
      ctx.arc(explosion.x, explosion.y, explosion.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(251, 113, 133, ${alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(explosion.x, explosion.y, explosion.radius + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    this.drawTurret(ctx, bunker, accent, isDark);

    ctx.strokeStyle = `${accent}88`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(TURRET_X, TURRET_Y);
    ctx.lineTo(
      TURRET_X + Math.cos(this.aimAngle) * 58,
      TURRET_Y + Math.sin(this.aimAngle) * 58
    );
    ctx.stroke();

    ctx.fillStyle = text;
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`SCORE ${this.score}`, 10, 22);
    ctx.fillText(`WAVE ${this.wave}`, 10, 42);
    ctx.fillText(`RANGE ${Math.round(this.shellPower)}`, 10, 62);

    ctx.textAlign = 'right';
    ctx.fillText(`HULL ${Math.max(0, this.integrity)}`, W - 12, 22);
    ctx.textAlign = 'left';

    ctx.strokeStyle = isDark ? '#334155' : '#94a3b8';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, H - 24, 140, 10);
    ctx.fillStyle = accent;
    ctx.fillRect(10, H - 24, Math.max(0, (this.integrity / 120) * 140), 10);

    if (this.gameOver) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = text;
      ctx.textAlign = 'center';
      ctx.font = '110px system-ui, sans-serif';
      ctx.fillText('GAME OVER', W / 2, H / 2 - 18);
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText('PRESS SPACE', W / 2, H / 2 + 18);
      ctx.fillText(`FINAL ${this.score}`, W / 2, H / 2 + 38);
      ctx.textAlign = 'left';
    }
  }

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    if (e instanceof KeyboardEvent) {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (e.type === 'keydown') {
        this.keysDown.add(key);
        if (key === ' ' || key === 'z') {
          e.preventDefault();
          if (this.gameOver) {
            this.init();
          } else {
            this.fireShell();
          }
        }
      } else if (e.type === 'keyup') {
        this.keysDown.delete(key);
      }
      return;
    }

    if (e instanceof TouchEvent) {
      e.preventDefault();
      if (e.type === 'touchstart') {
        const touch = e.touches[0] ?? e.changedTouches[0];
        if (!touch) return;
        this.touchStart = { x: touch.clientX, y: touch.clientY };
      } else if (e.type === 'touchend') {
        const touch = e.changedTouches[0] ?? e.touches[0];
        if (!touch || !this.touchStart) return;
        const dx = touch.clientX - this.touchStart.x;
        const dy = touch.clientY - this.touchStart.y;
        if (Math.abs(dx) < 18 && Math.abs(dy) < 18) {
          this.aimAtPoint(touch.clientX, touch.clientY);
          if (this.gameOver) this.init();
          else this.fireShell();
        } else if (Math.abs(dx) > Math.abs(dy)) {
          this.aimAngle += dx > 0 ? 0.16 : -0.16;
          this.clampAim();
        } else {
          this.shellPower += dy < 0 ? 18 : -18;
          this.clampPower();
        }
        this.touchStart = null;
      }
      return;
    }

    if (e.type === 'mousedown') {
      this.aimAtPoint(e.clientX, e.clientY);
      if (this.gameOver) this.init();
      else this.fireShell();
    }
  }

  override destroy() {
    this.keysDown.clear();
    this.touchStart = null;
    super.destroy();
  }

  private updateAiming(dt: number) {
    const rotateSpeed = 1.9;
    const powerSpeed = 180;

    if (this.keysDown.has('ArrowLeft') || this.keysDown.has('a')) {
      this.aimAngle -= rotateSpeed * dt;
    }
    if (this.keysDown.has('ArrowRight') || this.keysDown.has('d')) {
      this.aimAngle += rotateSpeed * dt;
    }
    if (this.keysDown.has('ArrowUp') || this.keysDown.has('w')) {
      this.shellPower += powerSpeed * dt;
    }
    if (this.keysDown.has('ArrowDown') || this.keysDown.has('s')) {
      this.shellPower -= powerSpeed * dt;
    }

    this.clampAim();
    this.clampPower();
  }

  private fireShell() {
    if (this.shellCooldown > 0) return;
    this.shellCooldown = 0.22;
    this.muzzleFlash = 1;
    this.shells.push({
      x: TURRET_X + Math.cos(this.aimAngle) * 28,
      y: TURRET_Y + Math.sin(this.aimAngle) * 28,
      vx: Math.cos(this.aimAngle) * this.shellPower,
      vy: Math.sin(this.aimAngle) * this.shellPower,
      life: 0,
    });
  }

  private spawnEnemy() {
    const chopperChance = this.wave >= 2 ? 0.28 : 0.12;
    if (Math.random() < chopperChance) {
      const fromLeft = Math.random() > 0.5;
      this.enemies.push({
        id: this.nextEnemyId++,
        kind: 'chopper',
        x: fromLeft ? -36 : W + 36,
        y: 86 + Math.random() * 54,
        vx: (fromLeft ? 1 : -1) * (68 + this.wave * 5),
        vy: 0,
        radius: 18,
        hp: 2,
        reload: 1.5 + Math.random(),
        drift: Math.random() * Math.PI * 2,
      });
      return;
    }

    this.enemies.push({
      id: this.nextEnemyId++,
      kind: 'landing',
      x: 50 + Math.random() * (W - 100),
      y: 96 + Math.random() * 34,
      vx: (Math.random() - 0.5) * 12,
      vy: 42 + this.wave * 3,
      radius: 20,
      hp: 2,
      reload: 1.8 + Math.random() * 0.6,
      drift: Math.random() * Math.PI * 2,
    });
  }

  private updateShells(dt: number) {
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const shell = this.shells[i];
      shell.x += shell.vx * dt;
      shell.y += shell.vy * dt;
      shell.vy += GRAVITY * dt;
      shell.life += dt;

      let hit = false;
      for (let j = this.enemies.length - 1; j >= 0; j--) {
        const enemy = this.enemies[j];
        const dx = shell.x - enemy.x;
        const dy = shell.y - enemy.y;
        if (dx * dx + dy * dy <= (enemy.radius + 6) * (enemy.radius + 6)) {
          enemy.hp -= 1;
          hit = true;
          if (enemy.hp <= 0) {
            this.score += enemy.kind === 'landing' ? 120 : 180;
            this.addExplosion(enemy.x, enemy.y, enemy.kind === 'landing' ? 34 : 28);
            this.enemies.splice(j, 1);
          } else {
            this.addExplosion(shell.x, shell.y, 16);
          }
          break;
        }
      }

      if (hit || shell.y > H + 20 || shell.x < -20 || shell.x > W + 20 || shell.life > 2.4) {
        this.shells.splice(i, 1);
      }
    }
  }

  private updateEnemies(dt: number) {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      enemy.reload -= dt;
      enemy.drift += dt * (enemy.kind === 'landing' ? 1.8 : 3.2);

      if (enemy.kind === 'landing') {
        enemy.x += enemy.vx * dt + Math.sin(enemy.drift) * 8 * dt;
        enemy.y += enemy.vy * dt;

        if (enemy.reload <= 0 && enemy.y < SHORE_Y - 36) {
          enemy.reload = Math.max(0.95, 1.55 - this.wave * 0.05);
          this.fireEnemyShot(enemy, 150);
        }

        if (enemy.y >= SHORE_Y - 10) {
          this.integrity -= 40;
          this.addExplosion(enemy.x, SHORE_Y - 6, 28);
          this.enemies.splice(i, 1);
          if (this.integrity <= 0) {
            this.triggerGameOver();
          }
        }
      } else {
        enemy.x += enemy.vx * dt;
        enemy.y += Math.sin(enemy.drift) * 10 * dt;

        if (enemy.reload <= 0) {
          enemy.reload = Math.max(0.8, 1.25 - this.wave * 0.04);
          this.fireEnemyShot(enemy, 170);
        }

        if (enemy.x < -60 || enemy.x > W + 60) {
          this.enemies.splice(i, 1);
        }
      }
    }
  }

  private updateEnemyShots(dt: number) {
    for (let i = this.enemyShots.length - 1; i >= 0; i--) {
      const shot = this.enemyShots[i];
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;

      const dx = shot.x - TURRET_X;
      const dy = shot.y - (TURRET_Y - 6);
      if (dx * dx + dy * dy <= 28 * 28) {
        this.integrity -= shot.damage;
        this.addExplosion(shot.x, shot.y, 20);
        this.enemyShots.splice(i, 1);
        if (this.integrity <= 0) {
          this.triggerGameOver();
        }
        continue;
      }

      if (shot.y > H + 18 || shot.x < -18 || shot.x > W + 18) {
        this.enemyShots.splice(i, 1);
      }
    }
  }

  private updateExplosions(dt: number) {
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const explosion = this.explosions[i];
      explosion.life -= dt;
      explosion.radius = explosion.maxRadius * (1 - explosion.life / explosion.maxLife);
      if (explosion.life <= 0) {
        this.explosions.splice(i, 1);
      }
    }
  }

  private fireEnemyShot(enemy: Enemy, speed: number) {
    const dx = TURRET_X - enemy.x;
    const dy = (TURRET_Y - 6) - enemy.y;
    const mag = Math.hypot(dx, dy) || 1;
    this.enemyShots.push({
      x: enemy.x,
      y: enemy.y + (enemy.kind === 'landing' ? 6 : 12),
      vx: (dx / mag) * speed,
      vy: (dy / mag) * speed,
      radius: enemy.kind === 'landing' ? 4 : 5,
      damage: enemy.kind === 'landing' ? 18 : 22,
    });
  }

  private aimAtPoint(clientX: number, clientY: number) {
    const { x, y } = this.canvasPoint(clientX, clientY);
    this.aimAngle = Math.atan2(y - TURRET_Y, x - TURRET_X);
    this.clampAim();
  }

  private addExplosion(x: number, y: number, maxRadius: number) {
    this.explosions.push({
      x,
      y,
      radius: 4,
      maxRadius,
      life: 0.28,
      maxLife: 0.28,
    });
  }

  private triggerGameOver() {
    this.integrity = 0;
    this.gameOver = true;
    this.submitScoreOnce(this.score);
  }

  private clampAim() {
    this.aimAngle = Math.max(-2.7, Math.min(-0.42, this.aimAngle));
  }

  private clampPower() {
    this.shellPower = Math.max(240, Math.min(420, this.shellPower));
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy, isDark: boolean) {
    if (enemy.kind === 'landing') {
      ctx.fillStyle = isDark ? '#94a3b8' : '#475569';
      ctx.beginPath();
      ctx.moveTo(enemy.x - 22, enemy.y);
      ctx.lineTo(enemy.x + 22, enemy.y);
      ctx.lineTo(enemy.x + 12, enemy.y + 12);
      ctx.lineTo(enemy.x - 12, enemy.y + 12);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = isDark ? '#cbd5e1' : '#e2e8f0';
      ctx.fillRect(enemy.x - 10, enemy.y - 8, 20, 8);

      ctx.strokeStyle = isDark ? '#38bdf8' : '#2563eb';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(enemy.x - 12, enemy.y + 13);
      ctx.lineTo(enemy.x + 14, enemy.y + 13);
      ctx.stroke();
      return;
    }

    ctx.fillStyle = isDark ? '#f59e0b' : '#dc2626';
    ctx.fillRect(enemy.x - 16, enemy.y - 6, 32, 12);
    ctx.fillRect(enemy.x - 8, enemy.y - 12, 16, 8);
    ctx.fillRect(enemy.x - 24, enemy.y - 2, 8, 4);
    ctx.fillRect(enemy.x + 16, enemy.y - 2, 8, 4);
    ctx.strokeStyle = isDark ? '#e2e8f0' : '#1f2937';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(enemy.x - 6, enemy.y - 16);
    ctx.lineTo(enemy.x + 6, enemy.y - 16);
    ctx.stroke();
  }

  private drawTurret(ctx: CanvasRenderingContext2D, bunker: string, accent: string, isDark: boolean) {
    ctx.fillStyle = bunker;
    ctx.fillRect(TURRET_X - 64, TURRET_Y - 4, 128, 52);
    ctx.fillRect(TURRET_X - 24, TURRET_Y - 28, 48, 28);

    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(TURRET_X, TURRET_Y - 8, 18, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(TURRET_X, TURRET_Y - 8);
    ctx.rotate(this.aimAngle);
    ctx.fillStyle = this.muzzleFlash > 0 ? '#fbbf24' : isDark ? '#e2e8f0' : '#1f2937';
    ctx.fillRect(0, -4, 38, 8);
    if (this.muzzleFlash > 0) {
      ctx.fillStyle = `rgba(251, 191, 36, ${this.muzzleFlash})`;
      ctx.beginPath();
      ctx.moveTo(40, 0);
      ctx.lineTo(54, -7);
      ctx.lineTo(54, 7);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}
