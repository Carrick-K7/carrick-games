import { BaseGame, createDefaultGameHost, type GameHost, type GameShellSnapshot } from '../core/game.js';
import { getRetroPalette, type RetroPalette } from '../core/render.js';
import {
  Particles,
  ScreenShake,
  FloatTexts,
  Starfield,
  drawGlow,
  drawVignette,
  fillSphere,
  fillGlassPanel,
  makeSprite,
  drawSprite,
  shade,
  withAlpha,
  fx,
  rand,
  randInt,
  lerp,
  TAU,
} from '../core/fx.js';

interface Bullet {
  x: number;
  y: number;
  width: number;
  height: number;
  active: boolean;
}

interface Enemy {
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  active: boolean;
  /** 0 scout (wedge), 1 gunship (heavy core), 2 dart (interceptor). */
  kind: number;
  phase: number;
}

const ENEMY_COLORS: readonly (readonly string[])[] = [
  ['#38bdf8', '#60a5fa', '#e0f2fe'],
  ['#fb7185', '#fb923c', '#facc15', '#fff7ed'],
  ['#a78bfa', '#f0abfc', '#ede9fe'],
];

export class SpaceShooterGame extends BaseGame {
  // Player
  private playerWidth = 40;
  private playerHeight = 30;
  private playerX = 0;
  private playerY = 0;
  private playerSpeed = 300;

  // Bullets
  private bullets: Bullet[] = [];
  private bulletWidth = 4;
  private bulletHeight = 12;
  private bulletSpeed = 400;
  private fireTimer = 0;
  private fireInterval = 0.25;

  // Enemies
  private enemies: Enemy[] = [];
  private enemyWidth = 30;
  private enemyHeight = 30;
  private enemyMinSpeed = 60;
  private enemyMaxSpeed = 120;
  private spawnTimer = 0;
  private spawnInterval = 0.8;

  // Game state
  private score = 0;

  override getShellSnapshot(): GameShellSnapshot {
    return { score: this.score };
  }
  private gameOver = false;
  private rightPressed = false;
  private leftPressed = false;

  // Presentation state (visual only; gameplay values above stay untouched)
  private time = 0;
  private bank = 0;
  private playerAlive = true;
  private deathTimer = 0;
  private thrustTimer = 0;
  private trailTimer = 0;
  private readonly particles = new Particles();
  private readonly floats = new FloatTexts();
  private readonly shake = new ScreenShake();
  private readonly starfield = new Starfield({ density: 1.35 });
  private spriteTheme: boolean | null = null;
  private playerSprite: HTMLCanvasElement | null = null;
  private enemySprites: (HTMLCanvasElement | null)[] = [null, null, null];
  private bulletSprite: HTMLCanvasElement | null = null;

  constructor(host?: GameHost) {
    super(host ?? createDefaultGameHost('gameCanvas', 480, 640));
  }

  init() {
    this.playerX = (this.width - this.playerWidth) / 2;
    this.playerY = this.height - this.playerHeight - 20;
    this.bullets = [];
    this.enemies = [];
    this.score = 0;
    this.gameOver = false;
    this.rightPressed = false;
    this.leftPressed = false;
    this.fireTimer = 0;
    this.spawnTimer = 0;
    this.time = 0;
    this.bank = 0;
    this.playerAlive = true;
    this.deathTimer = 0;
    this.thrustTimer = 0;
    this.trailTimer = 0;
    this.particles.clear();
    this.floats.clear();
    this.shake.reset();
    this.resetScoreReport();
  }

  private spawnBullet() {
    this.bullets.push({
      x: this.playerX + this.playerWidth / 2 - this.bulletWidth / 2,
      y: this.playerY,
      width: this.bulletWidth,
      height: this.bulletHeight,
      active: true,
    });
  }

  private spawnEnemy() {
    const speed = this.enemyMinSpeed + Math.random() * (this.enemyMaxSpeed - this.enemyMinSpeed);
    this.enemies.push({
      x: Math.random() * (this.width - this.enemyWidth),
      y: -this.enemyHeight,
      width: this.enemyWidth,
      height: this.enemyHeight,
      speed: speed,
      active: true,
      kind: randInt(0, 2),
      phase: rand(0, TAU),
    });
  }

  private checkCollision(a: { x: number; y: number; width: number; height: number },
                         b: { x: number; y: number; width: number; height: number }): boolean {
    return a.x < b.x + b.width &&
           a.x + a.width > b.x &&
           a.y < b.y + b.height &&
           a.y + a.height > b.y;
  }

  update(dt: number) {
    this.time += dt;
    this.starfield.update(dt, this.gameOver ? 10 : 30);
    this.particles.update(dt);
    this.floats.update(dt);
    this.shake.update(dt);

    if (this.gameOver) {
      this.deathTimer += dt;
      return;
    }

    // Player movement
    if (this.rightPressed && this.playerX < this.width - this.playerWidth) {
      this.playerX += this.playerSpeed * dt;
    } else if (this.leftPressed && this.playerX > 0) {
      this.playerX -= this.playerSpeed * dt;
    }
    // Clamp player
    this.playerX = Math.max(0, Math.min(this.width - this.playerWidth, this.playerX));

    // Banking tilt toward the current direction of travel
    const bankTarget = this.rightPressed ? 1 : this.leftPressed ? -1 : 0;
    this.bank = lerp(this.bank, bankTarget, Math.min(1, dt * 9));

    // Engine exhaust
    this.thrustTimer += dt;
    const nozzleX = this.playerX + this.playerWidth / 2;
    const nozzleY = this.playerY + this.playerHeight + 3;
    while (this.thrustTimer >= 1 / 30) {
      this.thrustTimer -= 1 / 30;
      const dark = this.isDarkTheme();
      const palette = getRetroPalette(dark);
      const emit = fx.thruster(nozzleX, nozzleY, Math.PI / 2, [palette.cyan, palette.primary, '#ffffff']);
      if (!dark) emit.blend = 'source-over';
      this.particles.emit(emit);
    }

    // Auto-fire bullets
    this.fireTimer += dt;
    if (this.fireTimer >= this.fireInterval) {
      this.fireTimer = 0;
      this.spawnBullet();
    }

    // Spawn enemies
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer = 0;
      this.spawnEnemy();
    }

    // Update bullets
    for (const bullet of this.bullets) {
      if (!bullet.active) continue;
      bullet.y -= this.bulletSpeed * dt;
      if (bullet.y + bullet.height < 0) {
        bullet.active = false;
      }
    }

    // Short glowing trails behind energy bolts
    this.trailTimer += dt;
    if (this.trailTimer >= 0.06) {
      this.trailTimer = 0;
      const dark = this.isDarkTheme();
      const palette = getRetroPalette(dark);
      for (const bullet of this.bullets) {
        if (!bullet.active) continue;
        this.particles.emit({
          x: bullet.x + bullet.width / 2,
          y: bullet.y + bullet.height,
          count: 1,
          speed: [4, 18],
          life: [0.1, 0.18],
          size: [1, 2.2],
          colors: [palette.cyan, palette.primary],
          shape: 'glow',
          drag: 2,
          blend: dark ? 'lighter' : 'source-over',
        });
      }
    }

    // Update enemies and check collisions
    for (const enemy of this.enemies) {
      if (!enemy.active) continue;
      enemy.y += enemy.speed * dt;

      // Check player collision
      if (this.checkCollision(
        { x: this.playerX, y: this.playerY, width: this.playerWidth, height: this.playerHeight },
        enemy
      )) {
        this.onPlayerDestroyed();
        return;
      }

      // Check bullet collisions
      for (const bullet of this.bullets) {
        if (!bullet.active) continue;
        if (this.checkCollision(bullet, enemy)) {
          bullet.active = false;
          enemy.active = false;
          this.score += 10;
          this.onEnemyDestroyed(enemy);
          break;
        }
      }

      // Remove enemies that pass bottom edge
      if (enemy.y > this.height) {
        enemy.active = false;
      }
    }

    // Clean up inactive bullets and enemies
    this.bullets = this.bullets.filter(b => b.active);
    this.enemies = this.enemies.filter(e => e.active);
  }

  private onEnemyDestroyed(enemy: Enemy) {
    const dark = this.isDarkTheme();
    const palette = getRetroPalette(dark);
    const cx = enemy.x + enemy.width / 2;
    const cy = enemy.y + enemy.height / 2;
    for (const emit of fx.explosion(cx, cy, ENEMY_COLORS[enemy.kind] ?? ENEMY_COLORS[0])) {
      // Additive glow washes out on light backgrounds; keep sparks solid there.
      if (!dark && emit.shape !== 'glow') emit.blend = 'source-over';
      this.particles.emit(emit);
    }
    this.shake.add(0.25);
    this.floats.add(cx, cy - 8, '+10', { color: palette.amber, size: 15 });
  }

  private onPlayerDestroyed() {
    const dark = this.isDarkTheme();
    const palette = getRetroPalette(dark);
    this.gameOver = true;
    this.playerAlive = false;
    this.deathTimer = 0;
    const cx = this.playerX + this.playerWidth / 2;
    const cy = this.playerY + this.playerHeight / 2;
    const colors = ['#ffffff', palette.primary, palette.cyan, palette.amber, palette.orange];
    for (let i = 0; i < 2; i++) {
      for (const emit of fx.explosion(cx, cy, colors)) {
        if (!dark && emit.shape !== 'glow') emit.blend = 'source-over';
        this.particles.emit(emit);
      }
    }
    this.particles.emit({
      x: cx, y: cy, count: 1, speed: 0, life: 0.6,
      size: [18, 24], colors: ['#ffffff'], shape: 'ring', endScale: 7,
    });
    this.shake.add(0.8);
  }

  /* --------------------------------------------------------------- */
  /* Sprites (pre-rendered once per theme)                            */
  /* --------------------------------------------------------------- */

  private ensureSprites(dark: boolean, palette: RetroPalette) {
    if (this.spriteTheme === dark && this.playerSprite) return;
    this.spriteTheme = dark;
    this.playerSprite = makeSprite(48, 46, (c, w, h) => this.paintPlayer(c, w, h, dark, palette));
    this.enemySprites = [
      makeSprite(40, 34, (c, w, h) => this.paintScout(c, w, h, dark, palette)),
      makeSprite(42, 38, (c, w, h) => this.paintGunship(c, w, h, dark, palette)),
      makeSprite(38, 36, (c, w, h) => this.paintDart(c, w, h, dark, palette)),
    ];
    this.bulletSprite = makeSprite(12, 24, (c, w, h) => this.paintBullet(c, w, h, palette));
  }

  private paintPlayer(ctx: CanvasRenderingContext2D, w: number, h: number, dark: boolean, p: RetroPalette) {
    const cx = w / 2;
    const hull = dark ? '#c6d2e0' : '#5c7085';
    const hullHi = dark ? '#f2f7fc' : '#8ba1b5';
    const hullLo = dark ? '#6b7a8e' : '#37485a';

    // Swept wings
    const wingGrad = ctx.createLinearGradient(0, h * 0.4, 0, h);
    wingGrad.addColorStop(0, shade(p.primary, -0.1));
    wingGrad.addColorStop(1, shade(p.primary, -0.55));
    ctx.fillStyle = wingGrad;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + side * 5, h * 0.44);
      ctx.lineTo(cx + side * 20, h * 0.78);
      ctx.lineTo(cx + side * 18, h * 0.9);
      ctx.lineTo(cx + side * 5, h * 0.74);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = withAlpha(shade(p.primary, -0.7), 0.9);
      ctx.lineWidth = 1;
      ctx.stroke();
      // Wing-tip light
      ctx.fillStyle = withAlpha(p.cyan, 0.95);
      ctx.beginPath();
      ctx.arc(cx + side * 18.5, h * 0.85, 1.4, 0, TAU);
      ctx.fill();
    }

    // Fuselage
    const bodyGrad = ctx.createLinearGradient(0, 0, 0, h);
    bodyGrad.addColorStop(0, hullHi);
    bodyGrad.addColorStop(0.45, hull);
    bodyGrad.addColorStop(1, hullLo);
    ctx.beginPath();
    ctx.moveTo(cx, 2);
    ctx.bezierCurveTo(cx + 3, 8, cx + 6.5, 14, cx + 7.5, 24);
    ctx.lineTo(cx + 8, 36);
    ctx.quadraticCurveTo(cx + 8, 41.5, cx + 4, 42.5);
    ctx.lineTo(cx - 4, 42.5);
    ctx.quadraticCurveTo(cx - 8, 41.5, cx - 8, 36);
    ctx.lineTo(cx - 7.5, 24);
    ctx.bezierCurveTo(cx - 6.5, 14, cx - 3, 8, cx, 2);
    ctx.closePath();
    ctx.fillStyle = bodyGrad;
    ctx.fill();
    ctx.strokeStyle = withAlpha(shade(hull, -0.6), 0.9);
    ctx.lineWidth = 1;
    ctx.stroke();

    // Center accent stripe
    const stripe = ctx.createLinearGradient(0, 6, 0, 40);
    stripe.addColorStop(0, withAlpha(p.primary, 0.95));
    stripe.addColorStop(1, withAlpha(p.primary, 0.35));
    ctx.fillStyle = stripe;
    ctx.beginPath();
    ctx.roundRect(cx - 1.3, 8, 2.6, 32, 1.3);
    ctx.fill();

    // Canopy glass
    const canopy = ctx.createLinearGradient(cx, 9, cx, 23);
    canopy.addColorStop(0, '#eaf6ff');
    canopy.addColorStop(0.35, shade(p.cyan, 0.15));
    canopy.addColorStop(1, shade(p.cyan, -0.6));
    ctx.fillStyle = canopy;
    ctx.beginPath();
    ctx.ellipse(cx, 15.5, 3.4, 6.6, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = withAlpha(shade(p.cyan, -0.7), 0.8);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(cx - 1.1, 11.5, 1.1, 2.2, -0.3, 0, TAU);
    ctx.fill();

    // Engine nozzles
    for (const side of [-1, 1]) {
      const nx = cx + side * 4.2;
      ctx.fillStyle = shade(hullLo, -0.35);
      ctx.beginPath();
      ctx.roundRect(nx - 1.9, 41, 3.8, 3.4, 1.4);
      ctx.fill();
      ctx.fillStyle = withAlpha(p.cyan, 0.95);
      ctx.beginPath();
      ctx.arc(nx, 43.4, 1.2, 0, TAU);
      ctx.fill();
    }
  }

  private paintScout(ctx: CanvasRenderingContext2D, w: number, h: number, dark: boolean, p: RetroPalette) {
    const cx = w / 2;
    const base = dark ? p.cyan : shade(p.cyan, -0.1);
    const body = ctx.createLinearGradient(0, 0, 0, h);
    body.addColorStop(0, shade(base, -0.55));
    body.addColorStop(0.6, base);
    body.addColorStop(1, shade(base, 0.45));
    ctx.beginPath();
    ctx.moveTo(cx, h - 2);
    ctx.lineTo(3, 5);
    ctx.lineTo(cx, 13);
    ctx.lineTo(w - 3, 5);
    ctx.closePath();
    ctx.fillStyle = body;
    ctx.fill();
    ctx.strokeStyle = withAlpha(shade(base, -0.7), 0.85);
    ctx.lineWidth = 1;
    ctx.stroke();
    // Inner armored spine panel
    const spine = ctx.createLinearGradient(0, 8, 0, h - 2);
    spine.addColorStop(0, shade(base, -0.45));
    spine.addColorStop(1, shade(base, 0.25));
    ctx.fillStyle = spine;
    ctx.beginPath();
    ctx.moveTo(cx, h - 5);
    ctx.lineTo(cx - 5.5, 11);
    ctx.lineTo(cx, 15.5);
    ctx.lineTo(cx + 5.5, 11);
    ctx.closePath();
    ctx.fill();
    // Wing edge lights
    ctx.strokeStyle = withAlpha(shade(base, 0.6), 0.9);
    ctx.beginPath();
    ctx.moveTo(4.5, 6);
    ctx.lineTo(cx, h - 3.5);
    ctx.lineTo(w - 4.5, 6);
    ctx.stroke();
    // Canopy slit
    ctx.fillStyle = dark ? '#082f49' : '#0c4a6e';
    ctx.beginPath();
    ctx.ellipse(cx, 15, 2.2, 4.4, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.ellipse(cx - 0.7, 13, 0.8, 1.6, -0.2, 0, TAU);
    ctx.fill();
  }

  private paintGunship(ctx: CanvasRenderingContext2D, w: number, h: number, dark: boolean, p: RetroPalette) {
    const cx = w / 2;
    const armor = dark ? '#7d8ea3' : '#55677c';
    const body = ctx.createLinearGradient(0, 0, 0, h);
    body.addColorStop(0, shade(armor, 0.35));
    body.addColorStop(0.5, armor);
    body.addColorStop(1, shade(armor, -0.5));
    // Heavy hexagonal hull pointing down
    ctx.beginPath();
    ctx.moveTo(cx, h - 2);
    ctx.lineTo(w - 8, h * 0.66);
    ctx.lineTo(w - 3, h * 0.3);
    ctx.lineTo(w * 0.68, 3);
    ctx.lineTo(w * 0.32, 3);
    ctx.lineTo(3, h * 0.3);
    ctx.lineTo(8, h * 0.66);
    ctx.closePath();
    ctx.fillStyle = body;
    ctx.fill();
    ctx.strokeStyle = withAlpha(shade(armor, -0.65), 0.9);
    ctx.lineWidth = 1;
    ctx.stroke();
    // Armor plate seams
    ctx.strokeStyle = withAlpha(shade(armor, -0.45), 0.7);
    ctx.beginPath();
    ctx.moveTo(w * 0.32, 4);
    ctx.lineTo(cx - 6, h * 0.5);
    ctx.moveTo(w * 0.68, 4);
    ctx.lineTo(cx + 6, h * 0.5);
    ctx.stroke();
    // Glowing reactor core
    fillSphere(ctx, cx, h * 0.42, 6.4, p.red, { rim: 0.35, rimColor: p.orange });
    // Chin barrels
    ctx.fillStyle = shade(armor, -0.55);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.roundRect(cx + side * 5 - 1.4, h * 0.72, 2.8, h * 0.24, 1.2);
      ctx.fill();
    }
  }

  private paintDart(ctx: CanvasRenderingContext2D, w: number, h: number, dark: boolean, p: RetroPalette) {
    const cx = w / 2;
    const base = dark ? p.violet : shade(p.violet, -0.05);
    // Forward-swept wings
    const wing = ctx.createLinearGradient(0, 0, 0, h);
    wing.addColorStop(0, shade(base, 0.3));
    wing.addColorStop(1, shade(base, -0.5));
    ctx.fillStyle = wing;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + side * 2.5, h * 0.3);
      ctx.lineTo(cx + side * 17, h * 0.66);
      ctx.lineTo(cx + side * 15, h * 0.78);
      ctx.lineTo(cx + side * 2.5, h * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = withAlpha(shade(base, -0.7), 0.85);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // Slim fuselage
    const body = ctx.createLinearGradient(0, 0, 0, h);
    body.addColorStop(0, shade(base, -0.35));
    body.addColorStop(1, shade(base, 0.5));
    ctx.beginPath();
    ctx.moveTo(cx, h - 2);
    ctx.bezierCurveTo(cx + 4, h * 0.7, cx + 4.5, h * 0.35, cx, 3);
    ctx.bezierCurveTo(cx - 4.5, h * 0.35, cx - 4, h * 0.7, cx, h - 2);
    ctx.closePath();
    ctx.fillStyle = body;
    ctx.fill();
    ctx.strokeStyle = withAlpha(shade(base, -0.7), 0.85);
    ctx.stroke();
    // Eye
    fillSphere(ctx, cx, h * 0.62, 3, dark ? '#f0abfc' : p.violet, { rim: 0.3 });
  }

  private paintBullet(ctx: CanvasRenderingContext2D, w: number, h: number, p: RetroPalette) {
    const cx = w / 2;
    const cy = h / 2;
    // Baked additive glow halo
    const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.9);
    halo.addColorStop(0, withAlpha(p.cyan, 0.5));
    halo.addColorStop(1, withAlpha(p.cyan, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h);
    // Energy capsule
    const bolt = ctx.createLinearGradient(0, 2, 0, h - 2);
    bolt.addColorStop(0, '#ffffff');
    bolt.addColorStop(0.5, shade(p.cyan, 0.4));
    bolt.addColorStop(1, withAlpha(p.cyan, 0.15));
    ctx.fillStyle = bolt;
    ctx.beginPath();
    ctx.roundRect(cx - 2, 3, 4, h - 6, 2);
    ctx.fill();
  }

  /* --------------------------------------------------------------- */
  /* Draw                                                             */
  /* --------------------------------------------------------------- */

  draw(ctx: CanvasRenderingContext2D) {
    const isDark = this.isDarkTheme();
    const palette = getRetroPalette(isDark);
    const zh = this.isZhLang();
    this.ensureSprites(isDark, palette);
    this.starfield.setTheme(isDark);

    // Deep-space backdrop
    const bg = ctx.createLinearGradient(0, 0, 0, this.height);
    bg.addColorStop(0, palette.bg);
    bg.addColorStop(1, palette.bg2);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.width, this.height);
    this.starfield.draw(ctx, this.width, this.height);

    this.shake.apply(ctx, () => {
      this.drawBullets(ctx);
      this.drawEnemies(ctx, palette);
      this.drawPlayer(ctx, palette);
      this.particles.draw(ctx);
    });

    this.floats.draw(ctx);
    drawVignette(ctx, this.width, this.height, isDark ? 0.3 : 0.16);
    this.drawHud(ctx, palette, zh);

    if (this.gameOver && this.deathTimer > 0.7) {
      this.submitScoreOnce(this.score);
      this.drawResultOverlay(ctx, {
        title: zh ? '游戏结束' : 'GAME OVER',
        tone: 'danger',
        details: [`${zh ? '得分' : 'SCORE'} ${this.score}`],
        hint: zh ? '点击或按空格重新开始' : 'CLICK OR PRESS SPACE',
      });
    }
  }

  private drawBullets(ctx: CanvasRenderingContext2D) {
    const sprite = this.bulletSprite;
    if (!sprite) return;
    for (const bullet of this.bullets) {
      if (!bullet.active) continue;
      drawSprite(ctx, sprite, bullet.x + bullet.width / 2, bullet.y + bullet.height / 2, 12, 24);
    }
  }

  private drawEnemies(ctx: CanvasRenderingContext2D, palette: RetroPalette) {
    for (const enemy of this.enemies) {
      if (!enemy.active) continue;
      const cx = enemy.x + enemy.width / 2;
      const cy = enemy.y + enemy.height / 2;
      const sprite = this.enemySprites[enemy.kind];
      if (!sprite) continue;
      if (enemy.kind === 1) {
        // Pulsing reactor glow for gunships
        const pulse = 0.55 + 0.45 * Math.sin(this.time * 4 + enemy.phase);
        drawGlow(ctx, cx, cy - 2, 15, palette.red, 0.35 * pulse);
      }
      const wobble = Math.sin(this.time * 2.2 + enemy.phase) * (enemy.kind === 1 ? 0.06 : 0.13);
      const drift = Math.sin(this.time * 1.6 + enemy.phase) * 1.5;
      const size = enemy.kind === 1 ? [46, 42] : enemy.kind === 2 ? [42, 40] : [44, 38];
      drawSprite(ctx, sprite, cx + drift * 0.4, cy, size[0], size[1], { rotation: wobble });
    }
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, palette: RetroPalette) {
    if (!this.playerAlive || !this.playerSprite) return;
    const cx = this.playerX + this.playerWidth / 2;
    const cy = this.playerY + this.playerHeight / 2;
    const nozzleY = this.playerY + this.playerHeight + 3;
    // Engine flame: flickering teardrop + glow halo
    const flicker = 0.75 + 0.25 * Math.sin(this.time * 31);
    const flameLen = (13 + 4 * Math.sin(this.time * 47)) * flicker;
    const dark = this.isDarkTheme();
    ctx.save();
    ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
    const flame = ctx.createLinearGradient(0, nozzleY - 2, 0, nozzleY + flameLen);
    if (dark) {
      flame.addColorStop(0, 'rgba(255,255,255,0.9)');
      flame.addColorStop(0.35, withAlpha(palette.cyan, 0.8));
      flame.addColorStop(1, withAlpha(palette.primary, 0));
    } else {
      flame.addColorStop(0, withAlpha(shade(palette.cyan, 0.3), 0.85));
      flame.addColorStop(0.4, withAlpha(palette.cyan, 0.6));
      flame.addColorStop(1, withAlpha(palette.primary, 0));
    }
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.moveTo(cx - 3.2, nozzleY - 2);
    ctx.quadraticCurveTo(cx - 2.2, nozzleY + flameLen * 0.6, cx, nozzleY + flameLen);
    ctx.quadraticCurveTo(cx + 2.2, nozzleY + flameLen * 0.6, cx + 3.2, nozzleY - 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    drawGlow(ctx, cx, nozzleY + 2, 16 * flicker, palette.cyan, 0.55);
    drawGlow(ctx, cx, cy, 30, palette.primary, 0.18);
    drawSprite(ctx, this.playerSprite, cx, cy + 2, 54, 52, { rotation: this.bank * 0.22 });
    // Muzzle flash right after a shot leaves the nose
    if (this.fireTimer < 0.06) {
      drawGlow(ctx, cx, this.playerY - 2, 9, '#ffffff', 0.5 * (1 - this.fireTimer / 0.06));
    }
  }

  private drawHud(ctx: CanvasRenderingContext2D, palette: RetroPalette, zh: boolean) {
    const label = `${zh ? '得分' : 'SCORE'}  ${this.score}`;
    const panelW = 148;
    const panelH = 32;
    const x = (this.width - panelW) / 2;
    const y = 10;
    fillGlassPanel(ctx, x, y, panelW, panelH, 12, {
      fill: palette.panel,
      fill2: palette.panel2,
      border: palette.border,
      glow: palette.primary,
      shadow: palette.shadow,
    });
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 16px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = palette.text;
    ctx.fillText(label, this.width / 2, y + panelH / 2 + 1);
    ctx.restore();
  }

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    if (this.gameOver && this.isRestartInput(e)) {
      if (e instanceof TouchEvent) e.preventDefault();
      this.init();
      return;
    }

    if (e instanceof KeyboardEvent) {
      const isKeyDown = e.type === 'keydown';
      if (e.key === 'Right' || e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        this.rightPressed = isKeyDown;
      } else if (e.key === 'Left' || e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        this.leftPressed = isKeyDown;
      } else if (e.key === ' ' && this.gameOver) {
        this.init();
      }
      return;
    }

    if (e instanceof TouchEvent) {
      e.preventDefault();
      const touch = e.touches[0] || e.changedTouches[0];
      if (!touch) return;
      const { x: canvasX } = this.canvasPoint(touch.clientX, touch.clientY);

      if (this.gameOver) {
        this.init();
        return;
      }

      // Touch left/right side to move ship
      if (e.type === 'touchstart') {
        if (canvasX < this.width / 2) {
          this.leftPressed = true;
          this.rightPressed = false;
        } else {
          this.rightPressed = true;
          this.leftPressed = false;
        }
      }

      // On touch end, stop movement
      if (e.type === 'touchend') {
        this.rightPressed = false;
        this.leftPressed = false;
      }
    }
    if (e instanceof MouseEvent && e.type === 'mousedown' && this.gameOver) {
      this.init();
    }
  }
}
