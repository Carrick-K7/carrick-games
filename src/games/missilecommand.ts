import { BaseGame } from '../core/game.js';

interface Missile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetX: number;
  targetY: number;
  explosionRadius: number;
  maxR: number;
  exploding: boolean;
  isEnemy: boolean;
}

interface City {
  x: number;
  w: number;
  h: number;
  alive: boolean;
}

export class MissileCommandGame extends BaseGame {
  private cities: City[] = [];
  private playerMissiles: Missile[] = [];
  private enemyMissiles: Missile[] = [];
  private explosions: { x: number; y: number; r: number; maxR: number }[] = [];
  private mouseX = 200;
  private mouseY = 300;
  private score = 0;
  private wave = 1;
  private missilesLeft = 0;
  private waveIncoming = 0;
  private state: 'waiting' | 'playing' | 'waveclear' | 'gameover' = 'waiting';
  private gameOver = false;
  private scoreReported = false;
  private ammos: number[] = [];
  private maxAmmo = 30;
  private waveClearTimeout: ReturnType<typeof setTimeout> | null = null;

  private readonly CITY_Y = 520;
  private readonly BATTERY_X = 200;
  private readonly BATTERY_Y = 520;

  constructor() {
    super('gameCanvas', 400, 600);
  }

  init() {
    this.score = 0;
    this.wave = 1;
    this.state = 'waiting';
    this.gameOver = false;
    this.scoreReported = false;
    this.playerMissiles = [];
    this.enemyMissiles = [];
    this.explosions = [];
    this.ammos = [];
    for (let i = 0; i < this.maxAmmo; i++) this.ammos.push(1);
    if (this.waveClearTimeout) {
      clearTimeout(this.waveClearTimeout);
      this.waveClearTimeout = null;
    }
    this.initCities();
  }

  private initCities() {
    this.cities = [];
    const positions = [30, 70, 110, 270, 310, 350];
    for (const x of positions) {
      this.cities.push({ x, w: 28, h: 20, alive: true });
    }
  }

  private startWave() {
    this.state = 'playing';
    this.playerMissiles = [];
    this.enemyMissiles = [];
    this.explosions = [];
    this.waveIncoming = 5 + this.wave * 3;
    this.missilesLeft = this.waveIncoming;
    this.ammos = [];
    for (let i = 0; i < this.maxAmmo; i++) this.ammos.push(1);
    this.spawnEnemyWave();
  }

  private spawnEnemyWave() {
    const count = Math.min(this.waveIncoming, 3 + this.wave);
    for (let i = 0; i < count; i++) {
      const city = this.cities[Math.floor(Math.random() * this.cities.filter(c => c.alive).length)];
      const tx = city ? city.x + city.w / 2 : Math.random() * 400;
      this.enemyMissiles.push({
        x: Math.random() * 400,
        y: -10,
        vx: 0,
        vy: 0,
        targetX: tx,
        targetY: this.CITY_Y,
        explosionRadius: 0,
        maxR: 0,
        exploding: false,
        isEnemy: true,
      });
    }
    this.waveIncoming -= count;
  }

  update(dt: number) {
    if (this.state === 'waiting' || this.gameOver) return;

    const t = this.lastTime + dt;
    this.lastTime = t;

    // Move player missiles
    for (const m of this.playerMissiles) {
      if (m.exploding) {
        m.explosionRadius += dt * 120;
        if (m.explosionRadius > m.maxR) {
          m.y = 99999; // remove
        }
        continue;
      }
      const dx = m.targetX - m.x;
      const dy = m.targetY - m.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const speed = 400;
      if (dist < 5) {
        m.exploding = true;
        m.explosionRadius = 0;
        m.maxR = 40;
        this.explosions.push({ x: m.x, y: m.y, r: 0, maxR: 40 });
      } else {
        m.x += (dx / dist) * speed * dt;
        m.y += (dy / dist) * speed * dt;
      }
    }

    // Move enemy missiles
    for (const m of this.enemyMissiles) {
      if (m.exploding) {
        m.explosionRadius += dt * 150;
        if (m.explosionRadius > m.maxR) {
          m.y = 99999;
        }
        continue;
      }
      const dx = m.targetX - m.x;
      const dy = m.targetY - m.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const speed = 60 + this.wave * 8;
      if (dist < 5) {
        m.exploding = true;
        m.explosionRadius = 0;
        m.maxR = 30;
        this.checkCityHit(m.x);
      } else {
        m.x += (dx / dist) * speed * dt;
        m.y += (dy / dist) * speed * dt;
      }
    }

    // Explosion collision with enemy missiles
    for (const exp of this.explosions) {
      for (const m of this.enemyMissiles) {
        if (m.exploding || m.y > 9000) continue;
        const dx = m.x - exp.x;
        const dy = m.y - exp.y;
        if (Math.sqrt(dx * dx + dy * dy) < exp.r) {
          m.exploding = true;
          m.explosionRadius = 0;
          m.maxR = 30;
          this.score += 10;
        }
      }
    }

    // Remove dead missiles
    this.playerMissiles = this.playerMissiles.filter(m => m.y < 9000);
    this.enemyMissiles = this.enemyMissiles.filter(m => m.y < 9000);
    this.explosions = this.explosions.filter(e => e.r < e.maxR);

    // Check wave clear
    if (this.state === 'playing' && this.enemyMissiles.length === 0 && this.waveIncoming === 0) {
      this.wave++;
      const aliveCities = this.cities.filter(c => c.alive).length;
      this.score += aliveCities * 100;
      this.state = 'waveclear';
      this.waveClearTimeout = setTimeout(() => this.startWave(), 2000);
    }

    // Check game over
    if (this.cities.every(c => !c.alive) && !this.gameOver) {
      this.gameOver = true;
      this.state = 'gameover';
      if (!this.scoreReported) {
        this.scoreReported = true;
        window.reportScore?.(this.score);
      }
    }
  }

  private checkCityHit(x: number) {
    for (const city of this.cities) {
      if (city.alive && x >= city.x && x <= city.x + city.w) {
        city.alive = false;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const isDark = this.isDarkTheme();

    ctx.fillStyle = isDark ? '#0b0f19' : '#1a1a2e';
    ctx.fillRect(0, 0, this.width, this.height);

    // Stars
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.3)';
    for (let i = 0; i < 40; i++) {
      const sx = ((i * 73) % 400);
      const sy = ((i * 137) % 450);
      ctx.fillRect(sx, sy, 1, 1);
    }

    // Ground
    ctx.fillStyle = isDark ? '#1a1a2e' : '#2d2d44';
    ctx.fillRect(0, this.CITY_Y + 20, 400, 80);

    // Cities
    for (const city of this.cities) {
      if (!city.alive) continue;
      ctx.fillStyle = isDark ? '#39C5BB' : '#0d9488';
      // Building shapes
      ctx.fillRect(city.x, this.CITY_Y + 5, 6, 15);
      ctx.fillRect(city.x + 8, this.CITY_Y, 10, 20);
      ctx.fillRect(city.x + 20, this.CITY_Y + 8, 6, 12);
    }

    // Battery
    ctx.fillStyle = isDark ? '#e0e0e0' : '#cccccc';
    ctx.fillRect(this.BATTERY_X - 15, this.CITY_Y - 5, 30, 25);
    ctx.fillStyle = isDark ? '#39C5BB' : '#0d9488';
    ctx.fillRect(this.BATTERY_X - 3, this.CITY_Y - 20, 6, 20);

    // Crosshair
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(this.mouseX, this.mouseY, 8, 0, Math.PI * 2);
    ctx.moveTo(this.mouseX - 12, this.mouseY);
    ctx.lineTo(this.mouseX + 12, this.mouseY);
    ctx.moveTo(this.mouseX, this.mouseY - 12);
    ctx.lineTo(this.mouseX, this.mouseY + 12);
    ctx.stroke();

    // Enemy missiles (red trails)
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 1;
    for (const m of this.enemyMissiles) {
      if (m.exploding) continue;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(m.x - m.vx * 0.1, m.y - m.vy * 0.1);
      ctx.stroke();
    }

    // Player missiles (white trails)
    ctx.strokeStyle = '#ffffff';
    for (const m of this.playerMissiles) {
      if (m.exploding) continue;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(m.targetX, this.BATTERY_Y - 20);
      ctx.stroke();
    }

    // Explosions
    for (const exp of this.explosions) {
      const alpha = 1 - exp.r / exp.maxR;
      ctx.strokeStyle = `rgba(255,200,50,${alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(exp.x, exp.y, exp.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,150,0,${alpha * 0.3})`;
      ctx.fill();
    }

    // HUD
    const zh = document.documentElement.getAttribute('data-lang') === 'zh';
    ctx.fillStyle = isDark ? '#39C5BB' : '#0d9488';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillText(`SCORE: ${this.score}`, 10, 20);
    ctx.fillText(`${zh ? '波' : 'WAVE'} ${this.wave}`, 300, 20);

    // City count
    const alive = this.cities.filter(c => c.alive).length;
    ctx.fillText(`${zh ? '城市' : 'CITY'}: ${alive}`, 150, 20);

    // Ammo indicator
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText(`${zh ? '弹药' : 'AMMO'}: ${this.ammos.length}`, 10, 580);

    // Overlays
    if (this.state === 'waiting') {
      this.drawOverlay(ctx, isDark,
        'CLICK TO LAUNCH',
        zh ? '点击发射导弹' : 'CLICK TO LAUNCH');
    } else if (this.state === 'gameover') {
      this.drawOverlay(ctx, isDark,
        `GAME OVER  SCORE: ${this.score}`,
        zh ? `游戏结束  得分: ${this.score}` : `GAME OVER  SCORE: ${this.score}`);
    } else if (this.state === 'waveclear') {
      this.drawOverlay(ctx, isDark,
        `${zh ? '波' : 'WAVE'} ${this.wave - 1} ${zh ? '完成' : 'CLEAR'}!`,
`${zh ? `第${this.wave - 1}波完成` : `WAVE ${this.wave - 1} CLEAR`} ${zh ? '波即将开始' : 'incoming'}`);
    }
  }

  private drawOverlay(ctx: CanvasRenderingContext2D, isDark: boolean, text: string, textZh: string) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 200, 400, 200);
    ctx.fillStyle = isDark ? '#39C5BB' : '#0d9488';
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(textZh, 200, 290);
    ctx.fillText(text, 200, 320);
    ctx.textAlign = 'left';
  }

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    if (this.gameOver) {
      if (e instanceof KeyboardEvent && e.type === 'keydown' && (e.key === ' ' || e.key === 'Enter')) {
        this.init();
        this.startWave();
      }
      if (e instanceof MouseEvent && e.type === 'mousedown') {
        this.init();
        this.startWave();
      }
      if (e instanceof TouchEvent && e.type === 'touchstart') {
        this.init();
        this.startWave();
      }
      return;
    }

    if (this.state === 'waiting') {
      const hasInput = (e instanceof MouseEvent && e.type === 'mousedown') ||
        (e instanceof TouchEvent && e.type === 'touchstart') ||
        (e instanceof KeyboardEvent && e.type === 'keydown');
      if (hasInput) {
        this.state = 'playing';
        this.startWave();
      }
      return;
    }

    if (e instanceof MouseEvent) {
      if (e.type === 'mousemove') {
        this.mouseX = e.clientX - (window.innerWidth - 400) / 2;
        this.mouseY = e.clientY - 60;
        this.mouseX = Math.max(0, Math.min(400, this.mouseX));
        this.mouseY = Math.max(0, Math.min(600, this.mouseY));
      }
      if (e.type === 'mousedown' && this.state === 'playing') {
        this.fireMissile(this.mouseX, this.mouseY);
      }
      return;
    }

    if (e instanceof TouchEvent) {
      e.preventDefault();
      if (e.type === 'touchstart' && this.state === 'playing') {
        const t = e.touches[0];
        this.mouseX = t.clientX - (window.innerWidth - 400) / 2;
        this.mouseY = t.clientY - 60;
        this.fireMissile(this.mouseX, this.mouseY);
      }
      return;
    }

    if (e instanceof KeyboardEvent && e.type === 'keydown') {
      if ((e.key === ' ' || e.key === 'Enter') && this.state === 'playing') {
        this.fireMissile(this.mouseX, this.mouseY);
      }
    }
  }

  private fireMissile(tx: number, ty: number) {
    if (this.ammos.length === 0) return;
    this.ammos.pop();
    this.playerMissiles.push({
      x: this.BATTERY_X,
      y: this.BATTERY_Y - 20,
      vx: 0,
      vy: 0,
      targetX: tx,
      targetY: ty,
      explosionRadius: 0,
      maxR: 0,
      exploding: false,
      isEnemy: false,
    });
  }

  destroy() {
    if (this.waveClearTimeout) {
      clearTimeout(this.waveClearTimeout);
      this.waveClearTimeout = null;
    }
    this.state = 'gameover';
    this.gameOver = true;
    super.destroy();
  }
}
