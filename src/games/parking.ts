import { BaseGame } from '../core/game.js';
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

  constructor() {
    super('gameCanvas', GAME_W, GAME_H);
  }

  init() {
    this.loadProgress();
    this.selectedLevel = Math.max(0, Math.min(this.selectedLevel, this.unlockedLevel, PARKING_LEVELS.length - 1));
    this.loadLevel(this.selectedLevel);
    this.gameState = 'menu';
  }

  start() {
    super.start();
    this.loadLevel(this.selectedLevel);
  }

  startDemo() {
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
        this.submitScoreOnce(this.bestLevel);
        this.parkedTime = 0;
      }
      return;
    }

    this.updateDriving(dt);
  }

  private drawStaticScene(
    ctx: CanvasRenderingContext2D,
    isDark: boolean,
    primary: string,
    asphalt: string
  ) {
    ctx.fillStyle = asphalt;
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)';
    for (let i = 0; i < 200; i++) {
      const sx = ((i * 137.5) % GAME_W);
      const sy = ((i * 73.3) % GAME_H);
      ctx.fillRect(sx, sy, 1.5, 1.5);
    }

    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    for (let y = 60; y < GAME_H; y += 60) {
      ctx.beginPath();
      ctx.moveTo(12, y);
      ctx.lineTo(GAME_W - 12, y);
      ctx.stroke();
    }

    const sp = this.level.spot;
    ctx.fillStyle = isDark ? 'rgba(57,197,187,0.08)' : 'rgba(13,148,136,0.06)';
    ctx.fillRect(sp.x - 2, sp.y - 2, sp.w + 4, sp.h + 4);

    ctx.strokeStyle = primary;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.setLineDash([6, 5]);
    ctx.strokeRect(sp.x + 1, sp.y + 1, sp.w - 2, sp.h - 2);
    ctx.setLineDash([]);

    const cx = sp.x + sp.w / 2;
    const cy = sp.y + sp.h / 2;
    ctx.fillStyle = primary;
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fill();

    for (const obs of this.level.obstacles) {
      const isCarLike = (obs.w < obs.h && obs.w > 20 && obs.h > 30) || (obs.w > obs.h && obs.h > 20 && obs.w > 30);
      if (isCarLike) {
        this.drawParkedCar(ctx, obs.x, obs.y, obs.w, obs.h, isDark);
      } else {
        ctx.fillStyle = isDark ? '#1f2937' : '#d1d5db';
        ctx.strokeStyle = isDark ? '#374151' : '#9ca3af';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(obs.x, obs.y, obs.w, obs.h, 2);
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(obs.x + 4, obs.y + obs.h * 0.3);
        ctx.lineTo(obs.x + obs.w - 4, obs.y + obs.h * 0.3);
        ctx.moveTo(obs.x + 4, obs.y + obs.h * 0.6);
        ctx.lineTo(obs.x + obs.w - 4, obs.y + obs.h * 0.6);
        ctx.stroke();
      }
    }
  }

  private ensureStaticLayer(isDark: boolean, primary: string, asphalt: string) {
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
    this.drawStaticScene(layerCtx, isDark, primary, asphalt);
    this.staticLayer = layer;
    this.staticLayerKey = key;
  }

  draw(ctx: CanvasRenderingContext2D) {
    this.canvas.dataset.parkingState = this.gameState;
    const isDark = this.isDarkTheme();
    const primary = isDark ? '#39C5BB' : '#0d9488';
    const asphalt = isDark ? '#13161f' : '#e8e9ec';

    this.ensureStaticLayer(isDark, primary, asphalt);
    if (this.staticLayer) {
      ctx.drawImage(this.staticLayer, 0, 0, GAME_W, GAME_H);
    } else {
      this.drawStaticScene(ctx, isDark, primary, asphalt);
    }

    const sp = this.level.spot;

    // Demo route
    if ((this.gameState === 'demo' || this.gameState === 'demoComplete') && this.demoRoute) {
      ctx.strokeStyle = isDark ? 'rgba(57,197,187,0.42)' : 'rgba(13,148,136,0.35)';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash([8, 7]);
      ctx.beginPath();
      this.demoRoute.poses.forEach((pose, index) => {
        if (index === 0) ctx.moveTo(pose.x, pose.y);
        else ctx.lineTo(pose.x, pose.y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
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
      // Track
      ctx.fillStyle = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
      ctx.beginPath();
      ctx.roundRect(sp.x, barY, sp.w, barH, barH / 2);
      ctx.fill();
      // Fill
      ctx.fillStyle = primary;
      ctx.shadowColor = primary;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.roundRect(sp.x, barY, Math.max(barH, sp.w * prog), barH, barH / 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
    }

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

  private drawParkedCar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    isDark: boolean
  ) {
    const vertical = h > w;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    if (!vertical) ctx.rotate(Math.PI / 2);

    const bw = vertical ? w : h;
    const bh = vertical ? h : w;

    // Drop shadow
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;

    // Body
    ctx.fillStyle = isDark ? '#4b5563' : '#9ca3af';
    ctx.beginPath();
    ctx.roundRect(-bw / 2, -bh / 2, bw, bh, 3);
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Roof / cabin
    ctx.fillStyle = isDark ? '#374151' : '#6b7280';
    ctx.beginPath();
    ctx.roundRect(-bw / 2 + 2, -bh / 2 + 8, bw - 4, bh - 16, 2);
    ctx.fill();

    // Windshield / rear window
    ctx.fillStyle = isDark ? 'rgba(148,163,184,0.35)' : 'rgba(209,213,219,0.45)';
    ctx.beginPath();
    ctx.roundRect(-bw / 2 + 3, -bh / 2 + 9, bw - 6, 5, 1);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(-bw / 2 + 3, bh / 2 - 13, bw - 6, 5, 1);
    ctx.fill();

    // Headlights
    ctx.fillStyle = 'rgba(253,224,71,0.7)';
    ctx.beginPath();
    ctx.roundRect(-bw / 2 + 2, -bh / 2 - 0.5, 4, 1.5, 0.5);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(bw / 2 - 6, -bh / 2 - 0.5, 4, 1.5, 0.5);
    ctx.fill();

    // Taillights
    ctx.fillStyle = 'rgba(239,68,68,0.7)';
    ctx.beginPath();
    ctx.roundRect(-bw / 2 + 2, bh / 2 - 1, 4, 1.5, 0.5);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(bw / 2 - 6, bh / 2 - 1, 4, 1.5, 0.5);
    ctx.fill();

    ctx.restore();
  }

  private drawPlayerCar(ctx: CanvasRenderingContext2D, isDark: boolean) {
    const w = CAR_W;
    const h = CAR_H;

    // Drop shadow
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 3;

    // Body gradient for depth
    const grad = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, -h / 2);
    if (isDark) {
      grad.addColorStop(0, '#e2e8f0');
      grad.addColorStop(0.5, '#f8fafc');
      grad.addColorStop(1, '#e2e8f0');
    } else {
      grad.addColorStop(0, '#0f766e');
      grad.addColorStop(0.5, '#14b8a6');
      grad.addColorStop(1, '#0f766e');
    }

    // Main body
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 4);
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Cabin / roof
    ctx.fillStyle = isDark ? '#0ea5e9' : '#0d9488';
    ctx.beginPath();
    ctx.roundRect(-w / 2 + 3, -h / 2 + 10, w - 6, h - 20, 3);
    ctx.fill();

    // Windshield (front)
    ctx.fillStyle = isDark ? 'rgba(186,230,253,0.55)' : 'rgba(204,251,241,0.55)';
    ctx.beginPath();
    ctx.roundRect(-w / 2 + 4, -h / 2 + 11, w - 8, 5, 2);
    ctx.fill();

    // Rear window
    ctx.fillStyle = isDark ? 'rgba(186,230,253,0.45)' : 'rgba(204,251,241,0.45)';
    ctx.beginPath();
    ctx.roundRect(-w / 2 + 4, h / 2 - 15, w - 8, 5, 2);
    ctx.fill();

    // Side mirrors
    ctx.fillStyle = isDark ? '#cbd5e1' : '#115e59';
    ctx.beginPath();
    ctx.roundRect(-w / 2 - 2, -h / 2 + 12, 2.5, 4, 1);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(w / 2 - 0.5, -h / 2 + 12, 2.5, 4, 1);
    ctx.fill();

    // Headlights with glow
    ctx.fillStyle = isDark ? 'rgba(254,240,138,0.95)' : 'rgba(253,224,71,0.95)';
    ctx.shadowColor = 'rgba(253,224,71,0.5)';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.roundRect(-w / 2 + 2, -h / 2 - 1, 5, 2, 1);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(w / 2 - 7, -h / 2 - 1, 5, 2, 1);
    ctx.fill();

    // Taillights with glow
    ctx.fillStyle = 'rgba(239,68,68,0.95)';
    ctx.shadowColor = 'rgba(239,68,68,0.5)';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.roundRect(-w / 2 + 2, h / 2 - 1, 5, 2, 1);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(w / 2 - 7, h / 2 - 1, 5, 2, 1);
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // Side stripe detail
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.roundRect(-w / 2 + 2, -h / 2 + 26, 2, h - 34, 1);
    ctx.fill();

    // Wheels
    const drawWheel = (wx: number, wy: number, steer: boolean) => {
      ctx.save();
      ctx.translate(wx, wy);
      if (steer) ctx.rotate(this.car.steerAngle);
      // Tire
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.roundRect(-2.5, -5.5, 5, 11, 2);
      ctx.fill();
      // Rim
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.roundRect(-1.5, -3.5, 3, 7, 1);
      ctx.fill();
      ctx.restore();
    };
    const frontWheelY = -PARKING_WHEEL_BASE / 2;
    const rearWheelY = PARKING_WHEEL_BASE / 2;
    drawWheel(-w / 2 - 2.5, frontWheelY, true);
    drawWheel(w / 2 + 2.5, frontWheelY, true);
    drawWheel(-w / 2 - 2.5, rearWheelY, false);
    drawWheel(w / 2 + 2.5, rearWheelY, false);
  }

  private drawOverlay(
    ctx: CanvasRenderingContext2D,
    isDark: boolean,
    title: string,
    subtitle: string,
    accent: string,
    hint?: string
  ) {
    // Backdrop
    ctx.fillStyle = isDark ? 'rgba(11,15,25,0.82)' : 'rgba(248,250,252,0.88)';
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    // Card panel
    const cardW = 280;
    const cardH = hint ? 130 : 100;
    const cardX = (GAME_W - cardW) / 2;
    const cardY = (GAME_H - cardH) / 2;

    ctx.fillStyle = isDark ? 'rgba(30,41,59,0.7)' : 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, 14);
    ctx.fill();

    ctx.strokeStyle = isDark ? 'rgba(57,197,187,0.25)' : 'rgba(13,148,136,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, 14);
    ctx.stroke();

    // Title
    ctx.fillStyle = accent;
    ctx.font = 'bold 22px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, GAME_W / 2, cardY + 36);

    // Subtitle
    ctx.fillStyle = isDark ? '#f8fafc' : '#0f172a';
    ctx.font = '15px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText(subtitle, GAME_W / 2, cardY + 68);

    // Hint
    if (hint) {
      ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
      ctx.font = '12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.fillText(hint, GAME_W / 2, cardY + 96);
    }
  }



  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
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
