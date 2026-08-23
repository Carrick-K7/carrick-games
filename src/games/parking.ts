import {
  BaseGame,
  createDefaultGameHost,
  type GameFrameTelemetry,
  type GameHost,
  type GameShellSnapshot,
} from '../core/game.js';
import {
  Particles,
  ScreenShake,
  FloatTexts,
  drawGlow,
  fx,
  makeSprite,
  shade,
  withAlpha,
} from '../core/fx.js';
import {
  PARKING_CAR_LENGTH,
  PARKING_CAR_WIDTH,
  PARKING_MAX_FORWARD_SPEED,
  PARKING_MAX_STEER,
  PARKING_PX_S_TO_KMH,
  PARKING_WHEEL_BASE,
  createParkingCar,
  updateParkingCar,
  type ParkingCarState,
} from './parkingPhysics.js';
import {
  PARKING_GAME_HEIGHT as GAME_H,
  PARKING_GAME_WIDTH as GAME_W,
  PARKING_STORAGE_KEY,
} from './parkingConstants.js';
import {
  parkingCarCollides,
  parkingCarIsParked,
} from './parkingGeometry.js';
import { buildParkingLevels } from './parkingLevels.js';
import {
  createParkingDemoRoute,
  normalizeParkingAngle,
} from './parkingRoute.js';
import type { Level, Obstacle, ParkingDemoRoute } from './parkingTypes.js';
export type {
  Level,
  Obstacle,
  ParkingDemoPose,
  ParkingDemoRoute,
  ParkingDemoWaypoint,
  ParkingSpot,
  ParkingTechnique,
} from './parkingTypes.js';
export {
  parkingCarCollides,
  parkingCarCorners,
  parkingCarIsParked,
  parkingCarIsWithinSpot,
} from './parkingGeometry.js';
export { createParkingDemoRoute, parkingRouteIsClear } from './parkingRoute.js';

const CAR_W = PARKING_CAR_WIDTH;
const CAR_H = PARKING_CAR_LENGTH;

// Player sprite canvas padding around the car body (mirrors, glow bleed).
const PLAYER_SPRITE_W = CAR_W + 18;
const PLAYER_SPRITE_H = CAR_H + 22;
// Parked-car sprite padding around its 26x44 obstacle footprint.
const PARKED_PAD = 4;

type SpotEntry = 'top' | 'bottom' | 'left' | 'right';

// Muted body colors for parked cars (five per theme, deterministic pick).
const PARKED_COLORS_DARK = ['#5d6b80', '#6f6156', '#527068', '#716071', '#606a5a'];
const PARKED_COLORS_LIGHT = ['#93a6bb', '#b0a08d', '#92b09a', '#b7959c', '#a3ad9a'];

/** Deterministic 0..1 hash for worn paint, speckles, and decoration jitter. */
function hash01(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function wall(x: number, y: number, w: number, h: number): Obstacle {
  return { x, y, w, h };
}

function parkedCar(x: number, y: number, vertical = true): Obstacle {
  return vertical ? { x, y, w: 26, h: 44 } : { x, y, w: 44, h: 26 };
}

export const PARKING_LEVELS: Level[] = buildParkingLevels({
  gameW: GAME_W,
  gameH: GAME_H,
  wall,
  parkedCar,
});

export class ParkingGame extends BaseGame {
  private car: ParkingCarState = createParkingCar(0, 0, 0);
  private levelIndex = 0;
  private level!: Level;
  private parkedTime = 0;
  private gameState: 'menu' | 'playing' | 'parked' | 'crash' | 'complete' | 'demo' | 'demoComplete' = 'menu';
  private keys = { up: false, down: false, left: false, right: false };
  private touchDir: 'up' | 'down' | 'left' | 'right' | null = null;
  private mouseSteer: number | null = null;
  private mouseSteering = false;
  private demoRoute: ParkingDemoRoute | null = null;
  private demoTime = 0;
  private staticLayer: HTMLCanvasElement | null = null;
  private staticLayerKey = '';

  // Visual-only state: FX systems, animation clock, and sprite caches.
  private readonly particles = new Particles();
  private readonly shake = new ScreenShake();
  private readonly floats = new FloatTexts();
  private animTime = 0;
  private dustCooldown = 0;
  private playerSpriteDark: HTMLCanvasElement | null = null;
  private playerSpriteLight: HTMLCanvasElement | null = null;
  private parkedSpritesDark: HTMLCanvasElement[] | null = null;
  private parkedSpritesLight: HTMLCanvasElement[] | null = null;

  private readonly PARK_TIME = 1.0;
  private readonly DEMO_SPEED = 60;
  private unlockedLevel = 0;
  private bestLevel = 0;
  private selectedLevel = 0;

  // Exposed for side panel
  readonly totalLevels = PARKING_LEVELS.length;
  get levelIndexEx(): number { return this.levelIndex; }
  get bestLevelEx(): number { return this.bestLevel; }
  get unlockedLevelEx(): number { return this.unlockedLevel; }
  get selectedLevelEx(): number { return this.selectedLevel; }
  get gameStateEx(): string { return this.gameState; }
  get speed(): number { return Math.abs(this.car.speed) * PARKING_PX_S_TO_KMH; }
  get maxSpeed(): number { return PARKING_MAX_FORWARD_SPEED * PARKING_PX_S_TO_KMH; }
  get steerAngle(): number { return this.car.steerAngle; }
  get maxSteerAngle(): number { return PARKING_MAX_STEER; }
  get mouseSteeringActiveEx(): boolean { return this.mouseSteering; }
  get gear(): string {
    const s = this.car.speed;
    return s > 2 ? 'D' : s < -2 ? 'R' : 'N';
  }

  private getLevelSelectSnapshot() {
    return {
      totalLevels: this.totalLevels,
      currentLevel: this.levelIndex,
      bestLevel: this.bestLevel,
      unlockedLevel: this.unlockedLevel,
      selectedLevel: this.selectedLevel,
      speed: this.speed,
      maxSpeed: this.maxSpeed,
      gear: this.gear,
      gameState: this.gameState,
      steerAngle: this.steerAngle,
      maxSteerAngle: this.maxSteerAngle,
      steeringActive: this.mouseSteering,
    };
  }

  override getShellSnapshot(): GameShellSnapshot {
    return { levelSelect: this.getLevelSelectSnapshot() };
  }

  override getFrameTelemetry(): GameFrameTelemetry {
    return { levelSelect: this.getLevelSelectSnapshot() };
  }

  constructor(host?: GameHost) {
    super(host ?? createDefaultGameHost('gameCanvas', GAME_W, GAME_H));
  }

  init() {
    this.loadProgress();
    this.selectedLevel = Math.max(0, Math.min(this.selectedLevel, this.unlockedLevel, PARKING_LEVELS.length - 1));
    this.loadLevel(this.selectedLevel);
    this.gameState = 'menu';
  }

  protected override onStart() {
    this.loadLevel(this.selectedLevel);
  }

  startDemo() {
    this.prepare();
    super.start();
    const route = createParkingDemoRoute(this.level);
    if (!route) {
      this.loadLevel(this.selectedLevel);
      return;
    }
    this.demoRoute = route;
    this.demoTime = 0;
    this.parkedTime = 0;
    this.keys = { up: false, down: false, left: false, right: false };
    this.touchDir = null;
    this.mouseSteer = null;
    this.mouseSteering = false;
    this.car = createParkingCar(route.poses[0].x, route.poses[0].y, route.poses[0].angle);
    this.gameState = 'demo';
  }

  /** Called from side panel to select a level in menu */
  selectLevel(index: number) {
    if (index < 0 || index >= PARKING_LEVELS.length) return;
    if (index > this.unlockedLevel) return;
    this.selectedLevel = index;
    this.loadLevel(index);
    this.notifyShellStateChanged();
  }

  /** Called from side panel to select a level and enter menu mode */
  goToMenu() {
    this.gameState = 'menu';
    this.selectedLevel = Math.min(this.unlockedLevel, PARKING_LEVELS.length - 1);
    this.mouseSteer = null;
    this.mouseSteering = false;
  }

  private loadProgress() {
    const recordFallback = this.readParkingRecord();
    try {
      const raw = localStorage.getItem(PARKING_STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        const bestLevel = Number.isFinite(p.bestLevel) ? p.bestLevel : recordFallback;
        this.bestLevel = Math.max(0, Math.min(PARKING_LEVELS.length, bestLevel || 0));
        const unlocked = Number.isFinite(p.unlocked) ? p.unlocked : Math.max(0, this.bestLevel - 1);
        this.unlockedLevel = Math.max(0, Math.min(PARKING_LEVELS.length - 1, unlocked || 0));
      } else {
        this.bestLevel = Math.max(0, Math.min(PARKING_LEVELS.length, recordFallback || 0));
        this.unlockedLevel = Math.max(0, Math.min(PARKING_LEVELS.length - 1, Math.max(0, this.bestLevel - 1)));
      }
    } catch {
      this.bestLevel = Math.max(0, Math.min(PARKING_LEVELS.length, recordFallback || 0));
      this.unlockedLevel = Math.max(0, Math.min(PARKING_LEVELS.length - 1, Math.max(0, this.bestLevel - 1)));
    }
    this.syncParkingRecord();
  }

  private readParkingRecord(): number {
    try {
      const raw = localStorage.getItem('cg-records');
      if (!raw) return 0;
      const records = JSON.parse(raw);
      const value = records?.parking;
      if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
      if (value < 0 || value > PARKING_LEVELS.length) return 0;
      return Math.floor(value);
    } catch {
      return 0;
    }
  }

  private syncParkingRecord() {
    try {
      const raw = localStorage.getItem('cg-records');
      const parsed = raw ? JSON.parse(raw) : {};
      const records = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      records.parking = this.bestLevel;
      localStorage.setItem('cg-records', JSON.stringify(records));
    } catch {
      // Records are a convenience feature; storage failures should not break play.
    }
  }

  private saveProgress() {
    try {
      localStorage.setItem(PARKING_STORAGE_KEY, JSON.stringify({
        unlocked: this.unlockedLevel,
        bestLevel: this.bestLevel,
      }));
      this.syncParkingRecord();
    } catch {
      // ignore
    }
  }

  private loadLevel(idx: number) {
    this.levelIndex = idx;
    this.level = PARKING_LEVELS[idx];
    const start = this.level.playerStart;
    this.car = createParkingCar(start.x, start.y, start.angle);
    this.parkedTime = 0;
    this.demoRoute = null;
    this.demoTime = 0;
    this.gameState = 'playing';
    this.keys = { up: false, down: false, left: false, right: false };
    this.touchDir = null;
    this.mouseSteer = null;
    this.mouseSteering = false;
    this.staticLayerKey = '';
    this.particles.clear();
    this.floats.clear();
    this.shake.reset();
    this.dustCooldown = 0;
    this.resetScoreReport();
  }

  private checkCollisions(): boolean {
    return parkingCarCollides(this.level, this.car);
  }

  private checkParked(): boolean {
    return parkingCarIsParked(this.level, this.car);
  }

  private updateMouseSteerFromEvent(e: MouseEvent) {
    const point = this.canvasPoint(e.clientX, e.clientY);
    const raw = (point.x - GAME_W / 2) / (GAME_W * 0.34);
    const deadZone = 0.045;
    this.mouseSteer = Math.abs(raw) < deadZone ? 0 : Math.max(-1, Math.min(1, raw));
  }

  /** Crash feedback: screen shake plus a spark burst at the front bumper. */
  private onCrash() {
    this.shake.add(0.3);
    const hx = Math.cos(this.car.angle);
    const hy = Math.sin(this.car.angle);
    const nx = this.car.x + hx * (CAR_H / 2);
    const ny = this.car.y + hy * (CAR_H / 2);
    this.particles.emit(fx.sparks(nx, ny, this.car.angle, ['#fde047', '#fb923c', '#e2e8f0']));
    this.particles.emit(fx.sparks(nx, ny, this.car.angle + Math.PI, ['#fde047', '#f87171']));
  }

  /** Level-complete feedback: confetti, a pop ring, and a floating praise. */
  private onComplete() {
    const sp = this.level.spot;
    const cx = sp.x + sp.w / 2;
    const cy = sp.y + sp.h / 2;
    this.particles.emit(fx.confetti(cx, cy, ['#39C5BB', '#4ade80', '#facc15', '#f472b6', '#60a5fa']));
    for (const e of fx.pop(cx, cy, ['#39C5BB', '#a7f3d0'])) this.particles.emit(e);
    const zh = this.isZhLang();
    this.floats.add(cx, cy - 6, zh ? '停得漂亮！' : 'Nice park!', {
      color: this.isDarkTheme() ? '#5eead4' : '#0d9488',
      size: 15,
      life: 1.4,
    });
  }

  /** Light tire dust when launching hard or steering sharply at speed. */
  private maybeEmitTireDust(dt: number) {
    this.dustCooldown -= dt;
    if (this.dustCooldown > 0) return;
    const speed = Math.abs(this.car.speed);
    const launching = (this.keys.up || this.touchDir === 'up') && speed < 62;
    const hardTurn = Math.abs(this.car.steerAngle) > PARKING_MAX_STEER * 0.55 && speed > 34;
    if (!launching && !hardTurn) return;
    this.dustCooldown = 0.07;

    const theta = this.car.angle + Math.PI / 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const lx = CAR_W / 2 + 2;
    const ly = PARKING_WHEEL_BASE / 2;
    const color = this.isDarkTheme() ? 'rgba(148,163,184,0.32)' : 'rgba(120,113,108,0.42)';
    for (const side of [-1, 1]) {
      const px = this.car.x + (lx * side) * cos - ly * sin;
      const py = this.car.y + (lx * side) * sin + ly * cos;
      this.particles.emit({
        x: px,
        y: py,
        count: 1,
        speed: [8, 26],
        life: [0.3, 0.6],
        size: [1.8, 3.6],
        colors: [color],
        drag: 2.2,
        shape: 'circle',
        blend: 'source-over',
        endScale: 1.6,
      });
    }
  }

  private updateDriving(dt: number) {
    const up = this.keys.up || this.touchDir === 'up';
    const down = this.keys.down || this.touchDir === 'down';
    const left = this.keys.left || this.touchDir === 'left';
    const right = this.keys.right || this.touchDir === 'right';
    const steer = this.mouseSteer ?? undefined;

    const oldCar = { ...this.car };
    this.car = updateParkingCar(this.car, { up, down, left, right, steer }, dt);

    if (this.checkCollisions()) {
      this.car = { ...oldCar, speed: 0, vx: 0, vy: 0 };
      this.gameState = 'crash';
      this.onCrash();
      this.submitScoreOnce(this.bestLevel);
      return;
    }

    if (this.checkParked() && Math.abs(this.car.speed) < 35) {
      this.gameState = 'parked';
      this.parkedTime = 0;
      this.car.speed = 0;
      this.car.vx = 0;
      this.car.vy = 0;
    }
  }

  private sampleDemoRoute(distance: number): { x: number; y: number; angle: number; steerAngle: number } {
    if (!this.demoRoute) {
      return { x: this.car.x, y: this.car.y, angle: this.car.angle, steerAngle: this.car.steerAngle };
    }

    const route = this.demoRoute.poses;
    let remaining = Math.max(0, Math.min(distance, this.demoRoute.length));
    for (let i = 1; i < route.length; i++) {
      const from = route[i - 1];
      const to = route[i];
      const segment = Math.hypot(to.x - from.x, to.y - from.y);
      if (remaining <= segment || i === route.length - 1) {
        const t = segment === 0 ? 1 : Math.max(0, Math.min(1, remaining / segment));
        const angle = from.angle + normalizeParkingAngle(to.angle - from.angle) * t;
        const angleDelta = normalizeParkingAngle(to.angle - from.angle);
        const steerAngle = segment > 0.5
          ? Math.max(-PARKING_MAX_STEER, Math.min(PARKING_MAX_STEER, Math.atan((angleDelta / segment) * PARKING_WHEEL_BASE)))
          : 0;
        return {
          x: from.x + (to.x - from.x) * t,
          y: from.y + (to.y - from.y) * t,
          angle,
          steerAngle,
        };
      }
      remaining -= segment;
    }

    const last = route[route.length - 1];
    return { x: last.x, y: last.y, angle: last.angle, steerAngle: 0 };
  }

  private updateDemo(dt: number) {
    if (!this.demoRoute) {
      this.gameState = 'menu';
      return;
    }

    this.demoTime += dt;
    const driveTime = this.demoRoute.length / this.DEMO_SPEED;
    if (this.demoTime < driveTime) {
      const pose = this.sampleDemoRoute(this.demoTime * this.DEMO_SPEED);
      this.car = {
        ...this.car,
        x: pose.x,
        y: pose.y,
        angle: pose.angle,
        speed: this.DEMO_SPEED,
        vx: Math.cos(pose.angle) * this.DEMO_SPEED,
        vy: Math.sin(pose.angle) * this.DEMO_SPEED,
        steerAngle: pose.steerAngle,
      };
      return;
    }

    const target = this.demoRoute.poses[this.demoRoute.poses.length - 1];
    this.car = {
      ...this.car,
      x: target.x,
      y: target.y,
      angle: target.angle,
      speed: 0,
      vx: 0,
      vy: 0,
      steerAngle: 0,
    };
    this.gameState = 'demoComplete';
  }

  update(dt: number) {
    this.animTime += dt;
    this.particles.update(dt);
    this.floats.update(dt);
    this.shake.update(dt);

    if (this.gameState === 'demo') {
      this.updateDemo(dt);
      return;
    }

    if (this.gameState === 'crash' || this.gameState === 'complete' || this.gameState === 'demoComplete' || this.gameState === 'menu') {
      return;
    }

    if (this.gameState === 'parked') {
      const up = this.keys.up || this.touchDir === 'up';
      const down = this.keys.down || this.touchDir === 'down';
      const left = this.keys.left || this.touchDir === 'left';
      const right = this.keys.right || this.touchDir === 'right';
      const steer = this.mouseSteer ?? undefined;

      const oldCar = { ...this.car };
      this.car = updateParkingCar(this.car, { up, down, left, right, steer }, dt);

      if (this.checkCollisions()) {
        this.car = { ...oldCar, speed: 0, vx: 0, vy: 0 };
        this.gameState = 'crash';
        this.onCrash();
        this.submitScoreOnce(this.bestLevel);
        return;
      }

      if (!this.checkParked() || Math.abs(this.car.speed) >= 35) {
        this.gameState = 'playing';
        this.parkedTime = 0;
        return;
      }

      this.parkedTime += dt;
      if (this.parkedTime >= this.PARK_TIME) {
        this.gameState = 'complete';
        if (this.levelIndex + 1 > this.bestLevel) {
          this.bestLevel = this.levelIndex + 1;
        }
        if (this.levelIndex + 1 > this.unlockedLevel && this.levelIndex + 1 < PARKING_LEVELS.length) {
          this.unlockedLevel = this.levelIndex + 1;
        }
        this.saveProgress();
        this.onComplete();
        this.submitScoreOnce(this.bestLevel);
        this.parkedTime = 0;
      }
      return;
    }

    this.updateDriving(dt);
    if (this.gameState === 'playing') this.maybeEmitTireDust(dt);
  }

  // ── Static scene (pre-rendered into the offscreen layer) ─────────────────

  /** Side of the spot with the most open approach space (the entry). */
  private computeSpotEntry(): SpotEntry {
    const sp = this.level.spot;
    const sides: { side: SpotEntry; dx: number; dy: number }[] = [
      { side: 'top', dx: 0, dy: -1 },
      { side: 'bottom', dx: 0, dy: 1 },
      { side: 'left', dx: -1, dy: 0 },
      { side: 'right', dx: 1, dy: 0 },
    ];
    let best: SpotEntry = 'bottom';
    let bestClear = -1;
    for (const s of sides) {
      let clear = 0;
      for (let d = 4; d <= 64; d += 6) {
        const blocked = [0.25, 0.5, 0.75].some((t) => {
          const px = s.dx === 0 ? sp.x + sp.w * t : (s.dx < 0 ? sp.x - d : sp.x + sp.w + d);
          const py = s.dy === 0 ? sp.y + sp.h * t : (s.dy < 0 ? sp.y - d : sp.y + sp.h + d);
          return this.level.obstacles.some((o) =>
            px >= o.x - 2 && px <= o.x + o.w + 2 && py >= o.y - 2 && py <= o.y + o.h + 2
          );
        });
        if (blocked) break;
        clear = d;
      }
      if (clear > bestClear) {
        bestClear = clear;
        best = s.side;
      }
    }
    return best;
  }

  private rectIsClear(x: number, y: number, w: number, h: number, margin: number): boolean {
    const sp = this.level.spot;
    if (
      x < sp.x + sp.w + margin && x + w > sp.x - margin &&
      y < sp.y + sp.h + margin && y + h > sp.y - margin
    ) {
      return false;
    }
    return !this.level.obstacles.some((o) =>
      x < o.x + o.w + margin && x + w > o.x - margin &&
      y < o.y + o.h + margin && y + h > o.y - margin
    );
  }

  /** A paint line broken into worn segments, like weathered road marking. */
  private paintWornLine(
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string,
    seed: number
  ) {
    const length = Math.hypot(x2 - x1, y2 - y1);
    const segments = Math.max(2, Math.round(length / 14));
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < segments; i++) {
      const h = hash01(seed + i * 7.3);
      if (h < 0.14) continue;
      const t0 = i / segments;
      const t1 = (i + 0.86) / segments;
      ctx.strokeStyle = withAlpha(color, 0.55 + h * 0.4);
      ctx.lineWidth = 2.4 - h * 0.5;
      ctx.beginPath();
      ctx.moveTo(x1 + (x2 - x1) * t0, y1 + (y2 - y1) * t0);
      ctx.lineTo(x1 + (x2 - x1) * t1, y1 + (y2 - y1) * t1);
      ctx.stroke();
    }
    ctx.restore();
  }

  private paintHazardBand(
    ctx: CanvasRenderingContext2D,
    isDark: boolean,
    band: { x: number; y: number; w: number; h: number }
  ) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(band.x, band.y, band.w, band.h);
    ctx.clip();
    ctx.strokeStyle = isDark ? 'rgba(250,204,21,0.26)' : 'rgba(202,138,4,0.30)';
    ctx.lineWidth = 4;
    const span = band.w + band.h;
    for (let d = -band.h; d < span; d += 12) {
      ctx.beginPath();
      ctx.moveTo(band.x + d, band.y + band.h);
      ctx.lineTo(band.x + d + band.h, band.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawPlanter(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    isDark: boolean,
    seed: number
  ) {
    ctx.save();
    // Grass bed
    const g = ctx.createLinearGradient(x, y, x, y + h);
    if (isDark) {
      g.addColorStop(0, '#1a3524');
      g.addColorStop(1, '#11231a');
    } else {
      g.addColorStop(0, '#93b478');
      g.addColorStop(1, '#6f9158');
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 7);
    ctx.fill();
    ctx.strokeStyle = isDark ? 'rgba(0,0,0,0.4)' : 'rgba(70,90,55,0.55)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Bushes with a soft top-left light
    const bushes = 3;
    for (let i = 0; i < bushes; i++) {
      const bx = x + w * (0.22 + 0.28 * i) + (hash01(seed + i) - 0.5) * 5;
      const by = y + h * (0.5 + (hash01(seed + i * 3.1) - 0.5) * 0.3);
      const br = Math.min(w, h) * (0.26 + hash01(seed + i * 5.7) * 0.1);
      const base = isDark ? '#24452f' : '#55793f';
      const bg = ctx.createRadialGradient(bx - br * 0.3, by - br * 0.35, br * 0.15, bx, by, br);
      bg.addColorStop(0, shade(base, 0.4));
      bg.addColorStop(0.7, base);
      bg.addColorStop(1, shade(base, -0.35));
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawLampPole(ctx: CanvasRenderingContext2D, x: number, y: number, isDark: boolean) {
    ctx.save();
    ctx.fillStyle = isDark ? '#454e5e' : '#7c8494';
    ctx.beginPath();
    ctx.arc(x, y, 2.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = isDark ? '#8b96a8' : '#c9ced8';
    ctx.beginPath();
    ctx.arc(x - 0.7, y - 0.7, 1.1, 0, Math.PI * 2);
    ctx.fill();
    if (isDark) {
      drawGlow(ctx, x, y, 7, '#ffd69a', 0.9);
    }
    ctx.restore();
  }

  private drawPaintedArrow(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    pointingDown: boolean,
    color: string
  ) {
    ctx.save();
    ctx.translate(x, y);
    if (pointingDown) ctx.rotate(Math.PI);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6.5, 1);
    ctx.lineTo(2.8, 1);
    ctx.lineTo(2.8, 9);
    ctx.lineTo(-2.8, 9);
    ctx.lineTo(-2.8, 1);
    ctx.lineTo(-6.5, 1);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawCurbBlock(
    ctx: CanvasRenderingContext2D,
    obs: Obstacle,
    isDark: boolean
  ) {
    const base = isDark ? '#2b3140' : '#c3c7cf';
    ctx.save();
    const g = ctx.createLinearGradient(obs.x, obs.y, obs.x, obs.y + obs.h);
    g.addColorStop(0, shade(base, 0.22));
    g.addColorStop(0.5, base);
    g.addColorStop(1, shade(base, -0.28));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(obs.x, obs.y, obs.w, obs.h, 2.5);
    ctx.fill();

    // Top edge highlight / bottom shade for a poured-concrete read.
    ctx.save();
    ctx.clip();
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.5)';
    ctx.fillRect(obs.x, obs.y, obs.w, Math.max(1, obs.h * 0.14));
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    ctx.fillRect(obs.x, obs.y + obs.h - Math.max(1, obs.h * 0.18), obs.w, Math.max(1, obs.h * 0.18));
    ctx.restore();

    ctx.strokeStyle = isDark ? 'rgba(10,14,22,0.7)' : 'rgba(90,96,110,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Worn yellow safety stripe along the long axis of low barriers.
    const horizontal = obs.w >= obs.h;
    const long = horizontal ? obs.w : obs.h;
    if (long >= 36) {
      ctx.strokeStyle = isDark ? 'rgba(250,204,21,0.34)' : 'rgba(202,138,4,0.38)';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([7, 6]);
      ctx.beginPath();
      if (horizontal) {
        ctx.moveTo(obs.x + 5, obs.y + obs.h / 2);
        ctx.lineTo(obs.x + obs.w - 5, obs.y + obs.h / 2);
      } else {
        ctx.moveTo(obs.x + obs.w / 2, obs.y + 5);
        ctx.lineTo(obs.x + obs.w / 2, obs.y + obs.h - 5);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  private getParkedSprites(isDark: boolean): HTMLCanvasElement[] {
    if (isDark) {
      if (!this.parkedSpritesDark) {
        this.parkedSpritesDark = PARKED_COLORS_DARK.map((c) => this.buildParkedSprite(c, true));
      }
      return this.parkedSpritesDark;
    }
    if (!this.parkedSpritesLight) {
      this.parkedSpritesLight = PARKED_COLORS_LIGHT.map((c) => this.buildParkedSprite(c, false));
    }
    return this.parkedSpritesLight;
  }

  /** Pre-rendered top-down parked car: gradient body, glass, lights, shadow. */
  private buildParkedSprite(base: string, isDark: boolean): HTMLCanvasElement {
    const w = 26;
    const h = 44;
    return makeSprite(w + PARKED_PAD * 2, h + PARKED_PAD * 2, (c) => {
      c.translate(PARKED_PAD + w / 2, PARKED_PAD + h / 2);

      // Soft shadow
      const sg = c.createRadialGradient(0.8, 1.8, 2, 0.8, 1.8, h / 2 + 4);
      sg.addColorStop(0, 'rgba(0,0,0,0.30)');
      sg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = sg;
      c.beginPath();
      c.ellipse(0.8, 1.8, w / 2 + 3.5, h / 2 + 3, 0, 0, Math.PI * 2);
      c.fill();

      // Metallic body
      const g = c.createLinearGradient(-w / 2, 0, w / 2, 0);
      g.addColorStop(0, shade(base, -0.3));
      g.addColorStop(0.3, shade(base, 0.05));
      g.addColorStop(0.5, shade(base, 0.3));
      g.addColorStop(0.7, shade(base, 0.05));
      g.addColorStop(1, shade(base, -0.3));
      c.fillStyle = g;
      c.beginPath();
      c.roundRect(-w / 2, -h / 2, w, h, 4);
      c.fill();
      c.strokeStyle = withAlpha(shade(base, -0.5), 0.7);
      c.lineWidth = 0.8;
      c.stroke();

      // Glass: windshield, rear window, side strips
      const glass = c.createLinearGradient(0, -h / 2 + 8, 0, -h / 2 + 15);
      glass.addColorStop(0, isDark ? '#31435c' : '#3b5570');
      glass.addColorStop(1, isDark ? '#141f2e' : '#22354a');
      c.fillStyle = glass;
      c.beginPath();
      c.roundRect(-w / 2 + 3, -h / 2 + 8, w - 6, 6.5, 2);
      c.fill();
      c.beginPath();
      c.roundRect(-w / 2 + 3, h / 2 - 13.5, w - 6, 5.5, 2);
      c.fill();
      c.fillStyle = isDark ? 'rgba(20,31,46,0.9)' : 'rgba(34,53,74,0.9)';
      c.fillRect(-w / 2 + 2, -h / 2 + 16, 1.8, h - 32);
      c.fillRect(w / 2 - 3.8, -h / 2 + 16, 1.8, h - 32);

      // Glass sheen
      c.fillStyle = 'rgba(255,255,255,0.16)';
      c.beginPath();
      c.roundRect(-w / 2 + 4, -h / 2 + 9, 4, 4.5, 1.5);
      c.fill();

      // Roof panel
      c.fillStyle = withAlpha(shade(base, 0.12), 0.9);
      c.beginPath();
      c.roundRect(-w / 2 + 4.5, -h / 2 + 16.5, w - 9, h - 31, 2);
      c.fill();

      // Headlights / taillights
      c.fillStyle = isDark ? 'rgba(255,239,196,0.85)' : 'rgba(230,235,240,0.9)';
      c.fillRect(-w / 2 + 2, -h / 2 + 0.5, 4.5, 1.8);
      c.fillRect(w / 2 - 6.5, -h / 2 + 0.5, 4.5, 1.8);
      c.fillStyle = 'rgba(185,28,28,0.9)';
      c.fillRect(-w / 2 + 2, h / 2 - 2.3, 4.5, 1.8);
      c.fillRect(w / 2 - 6.5, h / 2 - 2.3, 4.5, 1.8);
    }, 2);
  }

  private drawParkedCar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    isDark: boolean,
    index: number
  ) {
    const sprites = this.getParkedSprites(isDark);
    const sprite = sprites[index % sprites.length];
    const bw = Math.min(w, h);
    const bh = Math.max(w, h);
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    if (w > h) ctx.rotate(Math.PI / 2);
    ctx.drawImage(
      sprite,
      -(bw + PARKED_PAD * 2) / 2,
      -(bh + PARKED_PAD * 2) / 2,
      bw + PARKED_PAD * 2,
      bh + PARKED_PAD * 2
    );
    ctx.restore();
  }

  private drawStaticScene(
    ctx: CanvasRenderingContext2D,
    isDark: boolean,
    primary: string,
    asphalt: string,
    entry: SpotEntry
  ) {
    // ── Asphalt base: soft vertical grade plus tonal patches ──
    const base = ctx.createLinearGradient(0, 0, 0, GAME_H);
    if (isDark) {
      base.addColorStop(0, shade(asphalt, 0.1));
      base.addColorStop(0.5, asphalt);
      base.addColorStop(1, shade(asphalt, -0.12));
    } else {
      base.addColorStop(0, shade(asphalt, 0.04));
      base.addColorStop(0.5, asphalt);
      base.addColorStop(1, shade(asphalt, -0.05));
    }
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    for (let i = 0; i < 4; i++) {
      const px = hash01(i * 3.7) * GAME_W;
      const py = hash01(i * 9.1 + 2) * GAME_H;
      const pr = 120 + hash01(i * 5.3) * 90;
      const pg = ctx.createRadialGradient(px, py, 0, px, py, pr);
      const tone = i % 2 === 0
        ? (isDark ? 'rgba(255,255,255,0.022)' : 'rgba(255,255,255,0.10)')
        : (isDark ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.035)');
      pg.addColorStop(0, tone);
      pg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = pg;
      ctx.fillRect(0, 0, GAME_W, GAME_H);
    }

    // Tire-wear darkening in the central driving aisle
    const wear = ctx.createLinearGradient(0, GAME_H * 0.42, 0, GAME_H * 0.8);
    wear.addColorStop(0, 'rgba(0,0,0,0)');
    wear.addColorStop(0.5, isDark ? 'rgba(0,0,0,0.07)' : 'rgba(60,60,70,0.05)');
    wear.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = wear;
    ctx.fillRect(24, GAME_H * 0.42, GAME_W - 48, GAME_H * 0.38);

    // Fine asphalt speckle (deterministic)
    for (let i = 0; i < 380; i++) {
      const sx = (i * 137.5) % GAME_W;
      const sy = (i * 73.3) % GAME_H;
      const h = hash01(i * 1.7);
      ctx.fillStyle = isDark
        ? `rgba(255,255,255,${0.02 + h * 0.03})`
        : `rgba(20,24,32,${0.03 + h * 0.04})`;
      const size = h > 0.85 ? 2 : 1.3;
      ctx.fillRect(sx, sy, size, size);
    }

    // ── Sidewalk band outside the boundary curbs ──
    ctx.fillStyle = isDark ? '#1c212c' : '#d3d6dc';
    ctx.fillRect(0, 0, GAME_W, 10);
    ctx.fillRect(0, GAME_H - 10, GAME_W, 10);
    ctx.fillRect(0, 0, 10, GAME_H);
    ctx.fillRect(GAME_W - 10, 0, 10, GAME_H);
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    for (let x = 30; x < GAME_W; x += 42) {
      ctx.beginPath();
      ctx.moveTo(x, 1);
      ctx.lineTo(x, 9);
      ctx.moveTo(x, GAME_H - 9);
      ctx.lineTo(x, GAME_H - 1);
      ctx.stroke();
    }
    for (let y = 30; y < GAME_H; y += 42) {
      ctx.beginPath();
      ctx.moveTo(1, y);
      ctx.lineTo(9, y);
      ctx.moveTo(GAME_W - 9, y);
      ctx.lineTo(GAME_W - 1, y);
      ctx.stroke();
    }

    // ── Worn lane markings ──
    const paint = isDark ? '#e2e8f0' : '#ffffff';
    for (let y = 60; y < GAME_H; y += 60) {
      this.paintWornLine(ctx, 26, y, GAME_W - 26, y, paint, y * 0.7);
    }

    // Painted direction arrows in the aisle (kept off the spot)
    const sp = this.level.spot;
    const arrowColor = isDark ? 'rgba(226,232,240,0.16)' : 'rgba(255,255,255,0.5)';
    const arrowSpots: { x: number; y: number; down: boolean }[] = [
      { x: 100, y: 170, down: true },
      { x: 300, y: 230, down: false },
      { x: 100, y: 340, down: true },
      { x: 300, y: 400, down: false },
    ];
    for (const a of arrowSpots) {
      if (
        a.x > sp.x - 14 && a.x < sp.x + sp.w + 14 &&
        a.y > sp.y - 16 && a.y < sp.y + sp.h + 16
      ) continue;
      this.drawPaintedArrow(ctx, a.x, a.y, a.down, arrowColor);
    }

    // ── Street-lamp light pools (night), poles drawn after obstacles ──
    const lamps = [
      { x: 16, y: 148 },
      { x: GAME_W - 16, y: 290 },
      { x: 16, y: 428 },
    ];
    if (isDark) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const lamp of lamps) {
        const lg = ctx.createRadialGradient(lamp.x, lamp.y, 4, lamp.x, lamp.y, 64);
        lg.addColorStop(0, 'rgba(255,214,150,0.10)');
        lg.addColorStop(1, 'rgba(255,214,150,0)');
        ctx.fillStyle = lg;
        ctx.fillRect(lamp.x - 64, lamp.y - 64, 128, 128);
      }
      ctx.restore();
    }

    // ── Greenery planters where the level leaves room ──
    const planterCandidates = [
      { x: 30, y: GAME_H - 88, w: 48, h: 30 },
      { x: GAME_W - 78, y: GAME_H - 88, w: 48, h: 30 },
      { x: 30, y: 34, w: 48, h: 30 },
      { x: GAME_W - 78, y: 34, w: 48, h: 30 },
    ];
    planterCandidates.forEach((p, i) => {
      if (this.rectIsClear(p.x, p.y, p.w, p.h, 6)) {
        this.drawPlanter(ctx, p.x, p.y, p.w, p.h, isDark, i * 11.3 + 4);
      }
    });

    // ── Parking spot paint ──
    ctx.fillStyle = isDark ? 'rgba(57,197,187,0.045)' : 'rgba(13,148,136,0.05)';
    ctx.fillRect(sp.x - 2, sp.y - 2, sp.w + 4, sp.h + 4);

    // Hazard stripe band just outside the entry edge
    const bandDepth = 9;
    if (entry === 'bottom') {
      this.paintHazardBand(ctx, isDark, { x: sp.x - 3, y: sp.y + sp.h + 2, w: sp.w + 6, h: bandDepth });
    } else if (entry === 'top') {
      this.paintHazardBand(ctx, isDark, { x: sp.x - 3, y: sp.y - 2 - bandDepth, w: sp.w + 6, h: bandDepth });
    } else if (entry === 'left') {
      this.paintHazardBand(ctx, isDark, { x: sp.x - 2 - bandDepth, y: sp.y - 3, w: bandDepth, h: sp.h + 6 });
    } else {
      this.paintHazardBand(ctx, isDark, { x: sp.x + sp.w + 2, y: sp.y - 3, w: bandDepth, h: sp.h + 6 });
    }

    // U-shaped bay lines (open at the entry), worn paint
    const linePaint = isDark ? '#e2e8f0' : '#ffffff';
    if (entry === 'bottom' || entry === 'top') {
      const backY = entry === 'bottom' ? sp.y : sp.y + sp.h;
      this.paintWornLine(ctx, sp.x, backY, sp.x + sp.w, backY, linePaint, sp.x * 0.31);
      this.paintWornLine(ctx, sp.x, sp.y, sp.x, sp.y + sp.h, linePaint, sp.y * 0.17);
      this.paintWornLine(ctx, sp.x + sp.w, sp.y, sp.x + sp.w, sp.y + sp.h, linePaint, sp.y * 0.23 + 9);
    } else {
      const backX = entry === 'right' ? sp.x : sp.x + sp.w;
      this.paintWornLine(ctx, backX, sp.y, backX, sp.y + sp.h, linePaint, sp.y * 0.31);
      this.paintWornLine(ctx, sp.x, sp.y, sp.x + sp.w, sp.y, linePaint, sp.x * 0.17);
      this.paintWornLine(ctx, sp.x, sp.y + sp.h, sp.x + sp.w, sp.y + sp.h, linePaint, sp.x * 0.23 + 9);
    }

    // Painted "P" near the back of the bay
    ctx.save();
    ctx.font = 'bold 15px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isDark ? 'rgba(226,232,240,0.4)' : 'rgba(255,255,255,0.65)';
    const px = sp.x + sp.w / 2;
    const py = entry === 'bottom' ? sp.y + 11
      : entry === 'top' ? sp.y + sp.h - 11
        : sp.y + sp.h / 2;
    const pxx = entry === 'left' ? sp.x + sp.w - 11
      : entry === 'right' ? sp.x + 11
        : px;
    ctx.fillText('P', pxx, py);
    ctx.restore();

    // ── Obstacles ──
    this.level.obstacles.forEach((obs, index) => {
      const isCarLike = (obs.w < obs.h && obs.w > 20 && obs.h > 30) || (obs.w > obs.h && obs.h > 20 && obs.w > 30);
      if (isCarLike) {
        this.drawParkedCar(ctx, obs.x, obs.y, obs.w, obs.h, isDark, index);
      } else {
        this.drawCurbBlock(ctx, obs, isDark);
      }
    });

    // Lamp poles sit on the boundary curbs
    for (const lamp of lamps) {
      this.drawLampPole(ctx, lamp.x, lamp.y, isDark);
    }

    // Subtle primary tint so the spot family still reads in the static layer
    ctx.fillStyle = withAlpha(primary, 0.02);
    ctx.fillRect(sp.x - 2, sp.y - 2, sp.w + 4, sp.h + 4);
  }

  private ensureStaticLayer(isDark: boolean, primary: string, asphalt: string, entry: SpotEntry) {
    const key = `${this.level.id}:${isDark ? 'dark' : 'light'}:${this.pixelRatio}`;
    if (this.staticLayer && this.staticLayerKey === key) return;

    const layer = this.staticLayer ?? document.createElement('canvas');
    const ratio = this.pixelRatio || 1;
    layer.width = Math.round(GAME_W * ratio);
    layer.height = Math.round(GAME_H * ratio);
    const layerCtx = layer.getContext('2d');
    if (!layerCtx) return;
    layerCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
    layerCtx.clearRect(0, 0, GAME_W, GAME_H);
    this.drawStaticScene(layerCtx, isDark, primary, asphalt, entry);
    this.staticLayer = layer;
    this.staticLayerKey = key;
  }

  // ── Dynamic per-frame drawing ──

  /** Pulsing spot highlight, glowing corner brackets, and an entry chevron. */
  private drawSpotGuide(ctx: CanvasRenderingContext2D, primary: string, entry: SpotEntry) {
    if (this.gameState !== 'playing' && this.gameState !== 'parked') return;
    const sp = this.level.spot;
    const pulse = 0.5 + 0.5 * Math.sin(this.animTime * 3);

    ctx.fillStyle = withAlpha(primary, 0.04 + 0.045 * pulse);
    ctx.fillRect(sp.x, sp.y, sp.w, sp.h);

    ctx.save();
    ctx.strokeStyle = withAlpha(primary, 0.55 + 0.4 * pulse);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.shadowColor = withAlpha(primary, 0.85);
    ctx.shadowBlur = 5 + 6 * pulse;
    const L = 9;
    const inset = 1.5;
    const corners = [
      { x: sp.x + inset, y: sp.y + inset, sx: 1, sy: 1 },
      { x: sp.x + sp.w - inset, y: sp.y + inset, sx: -1, sy: 1 },
      { x: sp.x + inset, y: sp.y + sp.h - inset, sx: 1, sy: -1 },
      { x: sp.x + sp.w - inset, y: sp.y + sp.h - inset, sx: -1, sy: -1 },
    ];
    for (const c of corners) {
      ctx.beginPath();
      ctx.moveTo(c.x + c.sx * L, c.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(c.x, c.y + c.sy * L);
      ctx.stroke();
    }
    ctx.restore();

    // Bouncing double chevron pointing into the bay
    const bob = Math.sin(this.animTime * 4) * 2.5;
    const cx = sp.x + sp.w / 2;
    const cy = sp.y + sp.h / 2;
    let ax = cx;
    let ay = cy;
    let rot = 0;
    if (entry === 'bottom') {
      ay = sp.y + sp.h + 16 + bob;
      rot = 0;
    } else if (entry === 'top') {
      ay = sp.y - 16 - bob;
      rot = Math.PI;
    } else if (entry === 'left') {
      ax = sp.x - 16 - bob;
      rot = Math.PI / 2;
    } else {
      ax = sp.x + sp.w + 16 + bob;
      rot = -Math.PI / 2;
    }
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(rot);
    ctx.strokeStyle = withAlpha(primary, 0.5 + 0.35 * pulse);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < 2; i++) {
      const off = i * 5.5;
      ctx.beginPath();
      ctx.moveTo(-4.5, 2.5 + off);
      ctx.lineTo(0, -2 + off);
      ctx.lineTo(4.5, 2.5 + off);
      ctx.stroke();
    }
    ctx.restore();
  }

  private getPlayerSprite(isDark: boolean): HTMLCanvasElement {
    if (isDark) {
      if (!this.playerSpriteDark) this.playerSpriteDark = this.buildPlayerSprite(true);
      return this.playerSpriteDark;
    }
    if (!this.playerSpriteLight) this.playerSpriteLight = this.buildPlayerSprite(false);
    return this.playerSpriteLight;
  }

  /** Pre-rendered top-down Tank 500: metallic paint, glass house, trim. */
  private buildPlayerSprite(isDark: boolean): HTMLCanvasElement {
    const w = CAR_W;
    const h = CAR_H;
    const base = isDark ? '#c3cedd' : '#0f766e';
    return makeSprite(PLAYER_SPRITE_W, PLAYER_SPRITE_H, (c) => {
      c.translate(PLAYER_SPRITE_W / 2, PLAYER_SPRITE_H / 2);

      // Soft ground shadow
      const sg = c.createRadialGradient(1, 2.2, 3, 1, 2.2, h / 2 + 6);
      sg.addColorStop(0, 'rgba(0,0,0,0.34)');
      sg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = sg;
      c.beginPath();
      c.ellipse(1, 2.2, w / 2 + 5, h / 2 + 4.5, 0, 0, Math.PI * 2);
      c.fill();

      // Metallic body: light sweep across the width
      const g = c.createLinearGradient(-w / 2, 0, w / 2, 0);
      if (isDark) {
        g.addColorStop(0, '#74849b');
        g.addColorStop(0.3, '#b6c1d1');
        g.addColorStop(0.5, '#f3f7fc');
        g.addColorStop(0.7, '#b6c1d1');
        g.addColorStop(1, '#74849b');
      } else {
        g.addColorStop(0, '#0a4f4a');
        g.addColorStop(0.3, '#0f766e');
        g.addColorStop(0.5, '#2dd4bf');
        g.addColorStop(0.7, '#0f766e');
        g.addColorStop(1, '#0a4f4a');
      }
      c.fillStyle = g;
      c.beginPath();
      c.roundRect(-w / 2, -h / 2, w, h, 5);
      c.fill();
      c.strokeStyle = withAlpha(shade(base, -0.55), 0.65);
      c.lineWidth = 0.9;
      c.stroke();

      // Hood / trunk shading
      const hood = c.createLinearGradient(0, -h / 2, 0, -h / 2 + 9);
      hood.addColorStop(0, 'rgba(0,0,0,0.22)');
      hood.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = hood;
      c.fillRect(-w / 2 + 1, -h / 2 + 1, w - 2, 9);
      const trunk = c.createLinearGradient(0, h / 2, 0, h / 2 - 8);
      trunk.addColorStop(0, 'rgba(0,0,0,0.18)');
      trunk.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = trunk;
      c.fillRect(-w / 2 + 1, h / 2 - 9, w - 2, 8);

      // Hood sheen
      const sheen = c.createLinearGradient(-w / 2, -h / 2, w / 2, -h / 2 + 14);
      sheen.addColorStop(0, 'rgba(255,255,255,0)');
      sheen.addColorStop(0.5, 'rgba(255,255,255,0.14)');
      sheen.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = sheen;
      c.fillRect(-w / 2 + 1, -h / 2 + 1, w - 2, 14);

      // Glass house: windshield, side windows, rear window
      const glass = c.createLinearGradient(0, -h / 2 + 10, 0, -h / 2 + 17);
      glass.addColorStop(0, isDark ? '#3a4f6b' : '#40607e');
      glass.addColorStop(1, isDark ? '#16222f' : '#243b52');
      c.fillStyle = glass;
      c.beginPath();
      c.roundRect(-w / 2 + 2.5, -h / 2 + 9.5, w - 5, 7, 2.5);
      c.fill();
      c.fillStyle = isDark ? '#1b2938' : '#2b4257';
      c.beginPath();
      c.roundRect(-w / 2 + 2.5, h / 2 - 14.5, w - 5, 6, 2.5);
      c.fill();
      c.fillStyle = isDark ? 'rgba(27,41,56,0.95)' : 'rgba(43,66,87,0.95)';
      c.fillRect(-w / 2 + 1.2, -h / 2 + 17.5, 2, h - 33);
      c.fillRect(w / 2 - 3.2, -h / 2 + 17.5, 2, h - 33);

      // Windshield glare streak
      c.fillStyle = 'rgba(255,255,255,0.2)';
      c.beginPath();
      c.roundRect(-w / 2 + 3.5, -h / 2 + 10.5, 4.5, 5, 1.5);
      c.fill();

      // Roof panel + sunroof
      c.fillStyle = withAlpha(shade(base, isDark ? 0.1 : 0.16), 0.95);
      c.beginPath();
      c.roundRect(-w / 2 + 3.6, -h / 2 + 17.5, w - 7.2, h - 33, 2.5);
      c.fill();
      c.fillStyle = isDark ? 'rgba(22,34,47,0.9)' : 'rgba(36,59,82,0.9)';
      c.beginPath();
      c.roundRect(-w / 2 + 5.5, -h / 2 + 19.5, w - 11, 8.5, 1.5);
      c.fill();

      // Roof center highlight
      c.fillStyle = 'rgba(255,255,255,0.16)';
      c.fillRect(-0.7, h / 2 - 13, 1.4, 10);

      // Front grille
      c.fillStyle = 'rgba(8,12,20,0.8)';
      c.beginPath();
      c.roundRect(-w / 2 + 3, -h / 2 + 1, w - 6, 2.4, 1);
      c.fill();

      // Headlight / taillight housings (lit state drawn dynamically)
      c.fillStyle = isDark ? '#f6efd7' : '#dbe4ec';
      c.beginPath();
      c.roundRect(-w / 2 + 1.4, -h / 2 + 0.4, 4.4, 2.4, 1);
      c.fill();
      c.beginPath();
      c.roundRect(w / 2 - 5.8, -h / 2 + 0.4, 4.4, 2.4, 1);
      c.fill();
      c.fillStyle = isDark ? '#8f1d1d' : '#7f1d1d';
      c.beginPath();
      c.roundRect(-w / 2 + 1.4, h / 2 - 2.8, 4.4, 2.4, 1);
      c.fill();
      c.beginPath();
      c.roundRect(w / 2 - 5.8, h / 2 - 2.8, 4.4, 2.4, 1);
      c.fill();

      // Side mirrors
      c.fillStyle = shade(base, -0.35);
      c.beginPath();
      c.roundRect(-w / 2 - 2.4, -h / 2 + 11.5, 2.6, 4.5, 1);
      c.fill();
      c.beginPath();
      c.roundRect(w / 2 - 0.2, -h / 2 + 11.5, 2.6, 4.5, 1);
      c.fill();
    }, 2);
  }

  /** Night headlight beam: additive cone cast forward on the asphalt. */
  private drawHeadlightBeam(ctx: CanvasRenderingContext2D) {
    const frontY = -CAR_H / 2 - 2;
    const len = 118;
    const spread = 0.4;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, frontY, 6, 0, frontY, len);
    g.addColorStop(0, 'rgba(255,240,190,0.30)');
    g.addColorStop(0.55, 'rgba(255,240,190,0.10)');
    g.addColorStop(1, 'rgba(255,240,190,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, frontY + 2);
    ctx.arc(0, frontY, len, -Math.PI / 2 - spread, -Math.PI / 2 + spread);
    ctx.closePath();
    ctx.fill();
    // Warm pool where the beams land
    const pool = ctx.createRadialGradient(0, frontY - len * 0.62, 4, 0, frontY - len * 0.62, 40);
    pool.addColorStop(0, 'rgba(255,236,180,0.12)');
    pool.addColorStop(1, 'rgba(255,236,180,0)');
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.ellipse(0, frontY - len * 0.62, 34, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawWheels(ctx: CanvasRenderingContext2D) {
    const w = CAR_W;
    const drawWheel = (wx: number, wy: number, steer: boolean) => {
      ctx.save();
      ctx.translate(wx, wy);
      if (steer) ctx.rotate(this.car.steerAngle);
      ctx.fillStyle = '#0b1120';
      ctx.beginPath();
      ctx.roundRect(-2.5, -5.5, 5, 11, 2);
      ctx.fill();
      ctx.fillStyle = '#5b6b80';
      ctx.beginPath();
      ctx.roundRect(-1.4, -3.4, 2.8, 6.8, 1);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(-0.4, -2.4, 0.8, 4.8);
      ctx.restore();
    };
    const frontWheelY = -PARKING_WHEEL_BASE / 2;
    const rearWheelY = PARKING_WHEEL_BASE / 2;
    drawWheel(-w / 2 - 2.2, frontWheelY, true);
    drawWheel(w / 2 + 2.2, frontWheelY, true);
    drawWheel(-w / 2 - 2.2, rearWheelY, false);
    drawWheel(w / 2 + 2.2, rearWheelY, false);
  }

  /** Dynamic lights over the body sprite: beams, brakes, reverse, blinkers. */
  private drawCarLights(ctx: CanvasRenderingContext2D, isDark: boolean) {
    const w = CAR_W;
    const h = CAR_H;
    const braking = this.keys.down || this.touchDir === 'down';
    const reversing = this.car.speed < -2;
    const blink = (this.animTime * 2.2) % 1 < 0.55;
    const steer = this.car.steerAngle;

    if (isDark) {
      drawGlow(ctx, -w / 2 + 3.6, -h / 2 + 1, 6.5, '#ffefc0', 0.85);
      drawGlow(ctx, w / 2 - 3.6, -h / 2 + 1, 6.5, '#ffefc0', 0.85);
    }

    const tailGlow = braking ? 0.95 : isDark ? 0.4 : 0.18;
    drawGlow(ctx, -w / 2 + 3.6, h / 2 - 1.2, braking ? 7 : 4.5, '#ef4444', tailGlow);
    drawGlow(ctx, w / 2 - 3.6, h / 2 - 1.2, braking ? 7 : 4.5, '#ef4444', tailGlow);

    if (reversing) {
      drawGlow(ctx, 0, h / 2 - 1, 5, '#e2e8f0', 0.7);
    }

    if (blink && Math.abs(steer) > PARKING_MAX_STEER * 0.2) {
      const sx = steer > 0 ? w / 2 - 1.6 : -w / 2 + 1.6;
      drawGlow(ctx, sx, -h / 2 + 2.4, 4.5, '#f59e0b', 0.9);
      drawGlow(ctx, sx, h / 2 - 2.4, 4.5, '#f59e0b', 0.9);
    }
  }

  private drawPlayerCar(ctx: CanvasRenderingContext2D, isDark: boolean) {
    if (isDark) this.drawHeadlightBeam(ctx);
    this.drawWheels(ctx);
    const sprite = this.getPlayerSprite(isDark);
    ctx.drawImage(
      sprite,
      -PLAYER_SPRITE_W / 2,
      -PLAYER_SPRITE_H / 2,
      PLAYER_SPRITE_W,
      PLAYER_SPRITE_H
    );
    this.drawCarLights(ctx, isDark);
  }

  draw(ctx: CanvasRenderingContext2D) {
    this.canvas.dataset.parkingState = this.gameState;
    const isDark = this.isDarkTheme();
    const primary = isDark ? '#39C5BB' : '#0d9488';
    const asphalt = isDark ? '#151924' : '#e8eaee';
    const entry = this.computeSpotEntry();

    this.ensureStaticLayer(isDark, primary, asphalt, entry);

    this.shake.apply(ctx, () => {
      if (this.staticLayer) {
        ctx.drawImage(this.staticLayer, 0, 0, GAME_W, GAME_H);
      } else {
        this.drawStaticScene(ctx, isDark, primary, asphalt, entry);
      }

      const sp = this.level.spot;

      // Spot guidance: pulse, brackets, entry chevron
      this.drawSpotGuide(ctx, primary, entry);

      // Demo route: animated marching dashes with a soft glow
      if ((this.gameState === 'demo' || this.gameState === 'demoComplete') && this.demoRoute) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash([9, 8]);
        ctx.lineDashOffset = -this.animTime * 32;
        ctx.strokeStyle = isDark ? 'rgba(57,197,187,0.16)' : 'rgba(13,148,136,0.14)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        this.demoRoute.poses.forEach((pose, index) => {
          if (index === 0) ctx.moveTo(pose.x, pose.y);
          else ctx.lineTo(pose.x, pose.y);
        });
        ctx.stroke();
        ctx.strokeStyle = isDark ? 'rgba(57,197,187,0.55)' : 'rgba(13,148,136,0.45)';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        this.demoRoute.poses.forEach((pose, index) => {
          if (index === 0) ctx.moveTo(pose.x, pose.y);
          else ctx.lineTo(pose.x, pose.y);
        });
        ctx.stroke();
        ctx.restore();
      }

      // Player car
      ctx.save();
      ctx.translate(this.car.x, this.car.y);
      ctx.rotate(this.car.angle + Math.PI / 2);
      this.drawPlayerCar(ctx, isDark);
      ctx.restore();

      // Parked progress bar
      if (this.gameState === 'parked') {
        const prog = Math.min(1, this.parkedTime / this.PARK_TIME);
        const barY = sp.y + sp.h + 8;
        const barH = 5;
        ctx.fillStyle = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
        ctx.beginPath();
        ctx.roundRect(sp.x, barY, sp.w, barH, barH / 2);
        ctx.fill();
        ctx.fillStyle = primary;
        ctx.shadowColor = primary;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.roundRect(sp.x, barY, Math.max(barH, sp.w * prog), barH, barH / 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
      }

      this.particles.draw(ctx);
      this.floats.draw(ctx);
    });

    // Overlays
    if (this.gameState === 'crash') {
      const zh = this.isZhLang();
      this.drawOverlay(
        ctx,
        isDark,
        zh ? '撞车！' : 'CRASH!',
        zh ? '空格/点击 重试  ·  M 菜单' : 'SPACE/TAP RETRY  ·  M MENU',
        '#ef4444'
      );
    }

    if (this.gameState === 'complete') {
      const zh = this.isZhLang();
      this.drawOverlay(
        ctx,
        isDark,
        zh ? '停车成功！' : 'PARKED!',
        `${zh ? '关卡' : 'LEVEL'} ${this.levelIndex + 1}`,
        primary,
        zh ? '空格: 下一关  ·  R: 重玩  ·  M: 菜单' : 'SPACE: NEXT  ·  R: REPLAY  ·  M: MENU'
      );
    }

    if (this.gameState === 'demoComplete') {
      const zh = this.isZhLang();
      this.drawOverlay(
        ctx,
        isDark,
        zh ? '示例完成' : 'DEMO COMPLETE',
        `${zh ? '关卡' : 'LEVEL'} ${this.levelIndex + 1}`,
        primary,
        zh ? '空格: 正式开始  ·  R: 重看  ·  M: 菜单' : 'SPACE: PLAY  ·  R: REPLAY DEMO  ·  M: MENU'
      );
    }
  }

  private drawOverlay(
    ctx: CanvasRenderingContext2D,
    _isDark: boolean,
    title: string,
    subtitle: string,
    accent: string,
    hint?: string
  ) {
    this.drawResultOverlay(ctx, {
      title,
      tone: accent === '#ef4444' ? 'danger' : 'success',
      details: [subtitle],
      hint,
    });
  }



  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    if (
      (this.gameState === 'crash' || this.gameState === 'complete' || this.gameState === 'demoComplete')
      && this.isRestartInput(e)
    ) {
      e.preventDefault();
      if (this.gameState === 'crash' || this.gameState === 'demoComplete') {
        this.loadLevel(this.levelIndex);
      } else if (this.levelIndex + 1 < PARKING_LEVELS.length) {
        this.loadLevel(this.levelIndex + 1);
      } else {
        this.loadLevel(this.levelIndex);
      }
      return;
    }

    if (e instanceof KeyboardEvent) {
      if (e.key === ' ' || e.key === 'm' || e.key === 'M' || e.key === 'r' || e.key === 'R' ||
          e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
      }

      if (e.type === 'keydown' && !e.repeat) {
        if (this.gameState === 'crash') {
          if (e.key === ' ') { this.loadLevel(this.levelIndex); return; }
          if (e.key === 'm' || e.key === 'M') { this.goToMenu(); return; }
        }
        if (this.gameState === 'complete') {
          if (e.key === ' ') {
            if (this.levelIndex + 1 < PARKING_LEVELS.length) this.loadLevel(this.levelIndex + 1);
            else this.loadLevel(this.levelIndex);
            return;
          }
          if (e.key === 'r' || e.key === 'R') { this.loadLevel(this.levelIndex); return; }
          if (e.key === 'm' || e.key === 'M') { this.goToMenu(); return; }
        }
        if (this.gameState === 'demoComplete') {
          if (e.key === ' ') { this.loadLevel(this.levelIndex); return; }
          if (e.key === 'r' || e.key === 'R') { this.startDemo(); return; }
          if (e.key === 'm' || e.key === 'M') { this.goToMenu(); return; }
        }
      }

      if (e.type === 'keydown') {
        if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') this.keys.up = true;
        if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') this.keys.down = true;
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') this.keys.left = true;
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') this.keys.right = true;
      } else {
        if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') this.keys.up = false;
        if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') this.keys.down = false;
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') this.keys.left = false;
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') this.keys.right = false;
      }
      return;
    }

    if (e instanceof TouchEvent) {
      e.preventDefault();
      if (e.type === 'touchstart' || e.type === 'touchmove') {
        const t = e.touches[0];
        if (!t) return;
        const { x: cx, y: cy } = this.canvasPoint(t.clientX, t.clientY);

        if (cx < GAME_W) {
          if (cy < GAME_H * 0.35) this.touchDir = 'up';
          else if (cy > GAME_H * 0.65) this.touchDir = 'down';
          else if (cx < GAME_W * 0.4) this.touchDir = 'left';
          else if (cx > GAME_W * 0.6) this.touchDir = 'right';
          else this.touchDir = null;
        } else {
          this.touchDir = null;
        }

        if (e.type === 'touchstart') {
          if (this.gameState === 'crash') {
            this.loadLevel(this.levelIndex);
          }
          if (this.gameState === 'complete') {
            if (this.levelIndex + 1 < PARKING_LEVELS.length) this.loadLevel(this.levelIndex + 1);
          }
          if (this.gameState === 'demoComplete') {
            this.loadLevel(this.levelIndex);
          }
        }
      }
      if (e.type === 'touchend' || e.type === 'touchcancel') {
        this.touchDir = null;
      }
      return;
    }

    if (e instanceof MouseEvent) {
      if (e.type === 'mouseup') {
        this.mouseSteering = false;
        this.mouseSteer = null;
        return;
      }

      if (e.type === 'mousemove') {
        if (this.mouseSteering) {
          e.preventDefault();
          this.updateMouseSteerFromEvent(e);
        }
        return;
      }

      if (e.type === 'mousedown') {
        if (this.gameState === 'crash') {
          this.loadLevel(this.levelIndex);
          return;
        }
        if (this.gameState === 'complete') {
          if (this.levelIndex + 1 < PARKING_LEVELS.length) this.loadLevel(this.levelIndex + 1);
          return;
        }
        if (this.gameState === 'demoComplete') {
          this.loadLevel(this.levelIndex);
          return;
        }
        if (this.gameState === 'playing' || this.gameState === 'parked') {
          e.preventDefault();
          this.mouseSteering = true;
          this.updateMouseSteerFromEvent(e);
        }
      }
    }
  }
}
