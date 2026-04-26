import { BaseGame } from '../core/game.js';
import {
  PARKING_MAX_FORWARD_SPEED,
  createParkingCar,
  updateParkingCar,
  type ParkingCarState,
} from './parkingPhysics.js';

const GAME_W = 400;
const GAME_H = 520;
const CAR_W = 24;
const CAR_H = 42;

const STORAGE_KEY = 'carrick-parking-progress';

interface Obstacle {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ParkingSpot {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Level {
  playerStart: { x: number; y: number; angle: number };
  obstacles: Obstacle[];
  spot: ParkingSpot;
  timeLimit: number;
}

function wall(x: number, y: number, w: number, h: number): Obstacle {
  return { x, y, w, h };
}

function parkedCar(x: number, y: number, vertical = true): Obstacle {
  return vertical ? { x, y, w: 26, h: 44 } : { x, y, w: 44, h: 26 };
}

// prettier-ignore
const LEVELS: Level[] = [
  // ===== 基础直停车 (1-5) =====
  {
    playerStart: { x: 200, y: 460, angle: -Math.PI / 2 },
    obstacles: [
      wall(10, 10, 380, 12), wall(10, GAME_H - 22, 380, 12),
      wall(10, 10, 12, GAME_H - 20), wall(GAME_W - 22, 10, 12, GAME_H - 20),
      parkedCar(50, 80), parkedCar(130, 80), parkedCar(220, 80), parkedCar(310, 80),
    ],
    spot: { x: 162, y: 60, w: 50, h: 76 },
    timeLimit: 60,
  },
  {
    playerStart: { x: 200, y: 60, angle: Math.PI / 2 },
    obstacles: [
      wall(10, 10, 380, 12), wall(10, GAME_H - 22, 380, 12),
      wall(10, 10, 12, GAME_H - 20), wall(GAME_W - 22, 10, 12, GAME_H - 20),
      parkedCar(50, 380), parkedCar(130, 380), parkedCar(220, 380), parkedCar(310, 380),
    ],
    spot: { x: 162, y: 380, w: 50, h: 76 },
    timeLimit: 60,
  },
  {
    playerStart: { x: 340, y: 260, angle: Math.PI },
    obstacles: [
      wall(10, 10, 380, 12), wall(10, GAME_H - 22, 380, 12),
      wall(10, 10, 12, GAME_H - 20), wall(GAME_W - 22, 10, 12, GAME_H - 20),
      parkedCar(50, 60), parkedCar(50, 140), parkedCar(50, 300), parkedCar(50, 400),
    ],
    spot: { x: 30, y: 210, w: 50, h: 76 },
    timeLimit: 55,
  },
  {
    playerStart: { x: 60, y: 260, angle: 0 },
    obstacles: [
      wall(10, 10, 380, 12), wall(10, GAME_H - 22, 380, 12),
      wall(10, 10, 12, GAME_H - 20), wall(GAME_W - 22, 10, 12, GAME_H - 20),
      parkedCar(310, 60), parkedCar(310, 140), parkedCar(310, 300), parkedCar(310, 400),
    ],
    spot: { x: 310, y: 210, w: 50, h: 76 },
    timeLimit: 55,
  },
  {
    playerStart: { x: 200, y: 460, angle: -Math.PI / 2 },
    obstacles: [
      wall(10, 10, 380, 12), wall(10, GAME_H - 22, 380, 12),
      wall(10, 10, 12, GAME_H - 20), wall(GAME_W - 22, 10, 12, GAME_H - 20),
      parkedCar(50, 80), parkedCar(108, 80), parkedCar(230, 80), parkedCar(288, 80), parkedCar(346, 80),
    ],
    spot: { x: 155, y: 60, w: 50, h: 76 },
    timeLimit: 50,
  },

  // ===== 侧方停车 (6-10) =====
  {
    playerStart: { x: 340, y: 275, angle: Math.PI },
    obstacles: [
      wall(10, 10, 380, 12), wall(10, GAME_H - 22, 380, 12),
      wall(10, 10, 12, GAME_H - 20), wall(GAME_W - 22, 10, 12, GAME_H - 20),
      parkedCar(10, 160, false), parkedCar(10, 340, false),
    ],
    spot: { x: 10, y: 250, w: 76, h: 50 },
    timeLimit: 60,
  },
  {
    playerStart: { x: 60, y: 275, angle: 0 },
    obstacles: [
      wall(10, 10, 380, 12), wall(10, GAME_H - 22, 380, 12),
      wall(10, 10, 12, GAME_H - 20), wall(GAME_W - 22, 10, 12, GAME_H - 20),
      parkedCar(310, 160, false), parkedCar(310, 340, false),
    ],
    spot: { x: 310, y: 250, w: 76, h: 50 },
    timeLimit: 60,
  },
  {
    playerStart: { x: 208, y: 100, angle: Math.PI / 2 },
    obstacles: [
      wall(10, 10, 380, 12), wall(10, GAME_H - 22, 380, 12),
      wall(10, 10, 12, GAME_H - 20), wall(GAME_W - 22, 10, 12, GAME_H - 20),
      parkedCar(90, 370, false), parkedCar(260, 370, false),
    ],
    spot: { x: 162, y: 430, w: 76, h: 50 },
    timeLimit: 60,
  },
  {
    playerStart: { x: 208, y: 460, angle: -Math.PI / 2 },
    obstacles: [
      wall(10, 10, 380, 12), wall(10, GAME_H - 22, 380, 12),
      wall(10, 10, 12, GAME_H - 20), wall(GAME_W - 22, 10, 12, GAME_H - 20),
      parkedCar(90, 120, false), parkedCar(260, 120, false),
    ],
    spot: { x: 162, y: 40, w: 76, h: 50 },
    timeLimit: 60,
  },
  {
    playerStart: { x: 340, y: 260, angle: Math.PI },
    obstacles: [
      wall(10, 10, 380, 12), wall(10, GAME_H - 22, 380, 12),
      wall(10, 10, 12, GAME_H - 20), wall(GAME_W - 22, 10, 12, GAME_H - 20),
      parkedCar(10, 120, false), parkedCar(10, 360, false),
    ],
    spot: { x: 10, y: 240, w: 76, h: 50 },
    timeLimit: 55,
  },

  // ===== 倒车入库 (11-15) =====
  {
    playerStart: { x: 200, y: 420, angle: -Math.PI / 2 },
    obstacles: [
      wall(10, 10, 380, 12), wall(10, GAME_H - 22, 380, 12),
      wall(10, 10, 12, GAME_H - 20), wall(GAME_W - 22, 10, 12, GAME_H - 20),
      wall(80, 160, 240, 8),
      parkedCar(50, 80), parkedCar(130, 80), parkedCar(220, 80), parkedCar(310, 80),
    ],
    spot: { x: 162, y: 60, w: 50, h: 76 },
    timeLimit: 50,
  },
  {
    playerStart: { x: 340, y: 420, angle: -Math.PI / 2 },
    obstacles: [
      wall(10, 10, 380, 12), wall(10, GAME_H - 22, 380, 12),
      wall(10, 10, 12, GAME_H - 20), wall(GAME_W - 22, 10, 12, GAME_H - 20),
      wall(80, 160, 240, 8),
      parkedCar(50, 80), parkedCar(130, 80), parkedCar(220, 80),
    ],
    spot: { x: 290, y: 60, w: 50, h: 76 },
    timeLimit: 50,
  },
  {
    playerStart: { x: 60, y: 420, angle: -Math.PI / 2 },
    obstacles: [
      wall(10, 10, 380, 12), wall(10, GAME_H - 22, 380, 12),
      wall(10, 10, 12, GAME_H - 20), wall(GAME_W - 22, 10, 12, GAME_H - 20),
      wall(80, 160, 240, 8),
      parkedCar(130, 80), parkedCar(220, 80), parkedCar(310, 80),
    ],
    spot: { x: 50, y: 60, w: 50, h: 76 },
    timeLimit: 50,
  },
  {
    playerStart: { x: 200, y: 100, angle: Math.PI / 2 },
    obstacles: [
      wall(10, 10, 380, 12), wall(10, GAME_H - 22, 380, 12),
      wall(10, 10, 12, GAME_H - 20), wall(GAME_W - 22, 10, 12, GAME_H - 20),
      wall(80, 320, 240, 8),
      parkedCar(50, 380), parkedCar(130, 380), parkedCar(220, 380), parkedCar(310, 380),
    ],
    spot: { x: 162, y: 380, w: 50, h: 76 },
    timeLimit: 50,
  },
  {
    playerStart: { x: 200, y: 460, angle: -Math.PI / 2 },
    obstacles: [
      wall(10, 10, 380, 12), wall(10, GAME_H - 22, 380, 12),
      wall(10, 10, 12, GAME_H - 20), wall(GAME_W - 22, 10, 12, GAME_H - 20),
      wall(80, 160, 240, 8),
      parkedCar(50, 80), parkedCar(108, 80), parkedCar(230, 80), parkedCar(288, 80), parkedCar(346, 80),
    ],
    spot: { x: 155, y: 60, w: 50, h: 76 },
    timeLimit: 45,
  },

  // ===== 混合挑战 (16-20) =====
  {
    playerStart: { x: 60, y: 460, angle: -Math.PI / 2 },
    obstacles: [
      wall(10, 10, 380, 12), wall(10, GAME_H - 22, 380, 12),
      wall(10, 10, 12, GAME_H - 20), wall(GAME_W - 22, 10, 12, GAME_H - 20),
      wall(140, 10, 8, 200), wall(140, 280, 8, 230),
      parkedCar(180, 80), parkedCar(260, 80), parkedCar(340, 80),
    ],
    spot: { x: 30, y: 220, w: 50, h: 76 },
    timeLimit: 50,
  },
  {
    playerStart: { x: 340, y: 460, angle: -Math.PI / 2 },
    obstacles: [
      wall(10, 10, 380, 12), wall(10, GAME_H - 22, 380, 12),
      wall(10, 10, 12, GAME_H - 20), wall(GAME_W - 22, 10, 12, GAME_H - 20),
      wall(200, 180, 8, 160),
      parkedCar(50, 180), parkedCar(50, 280), parkedCar(260, 180), parkedCar(260, 280),
    ],
    spot: { x: 130, y: 220, w: 50, h: 76 },
    timeLimit: 50,
  },
  {
    playerStart: { x: 200, y: 460, angle: -Math.PI / 2 },
    obstacles: [
      wall(10, 10, 380, 12), wall(10, GAME_H - 22, 380, 12),
      wall(10, 10, 12, GAME_H - 20), wall(GAME_W - 22, 10, 12, GAME_H - 20),
      wall(80, 200, 120, 8), wall(220, 280, 120, 8),
      parkedCar(60, 80), parkedCar(140, 80), parkedCar(280, 80),
    ],
    spot: { x: 210, y: 60, w: 50, h: 76 },
    timeLimit: 45,
  },
  {
    playerStart: { x: 200, y: 460, angle: -Math.PI / 2 },
    obstacles: [
      wall(10, 10, 380, 12), wall(10, GAME_H - 22, 380, 12),
      wall(10, 10, 12, GAME_H - 20), wall(GAME_W - 22, 10, 12, GAME_H - 20),
      wall(120, 160, 160, 8), wall(120, 320, 160, 8),
      parkedCar(50, 160), parkedCar(50, 320), parkedCar(310, 160), parkedCar(310, 320),
    ],
    spot: { x: 165, y: 220, w: 50, h: 76 },
    timeLimit: 45,
  },
  {
    playerStart: { x: 340, y: 420, angle: Math.PI },
    obstacles: [
      wall(10, 10, 380, 12), wall(10, GAME_H - 22, 380, 12),
      wall(10, 10, 12, GAME_H - 20), wall(GAME_W - 22, 10, 12, GAME_H - 20),
      wall(120, 120, 8, 160), wall(260, 240, 8, 160),
      parkedCar(20, 80, false), parkedCar(100, 80, false), parkedCar(180, 80, false),
    ],
    spot: { x: 30, y: 400, w: 76, h: 50 },
    timeLimit: 40,
  },

  // ===== 高难度 (21-25) =====
  {
    playerStart: { x: 200, y: 460, angle: -Math.PI / 2 },
    obstacles: [
      wall(10, 10, 380, 12), wall(10, GAME_H - 22, 380, 12),
      wall(10, 10, 12, GAME_H - 20), wall(GAME_W - 22, 10, 12, GAME_H - 20),
      parkedCar(50, 80), parkedCar(95, 80), parkedCar(255, 80), parkedCar(300, 80),
    ],
    spot: { x: 142, y: 60, w: 50, h: 76 },
    timeLimit: 45,
  },
  {
    playerStart: { x: 200, y: 460, angle: -Math.PI / 2 },
    obstacles: [
      wall(10, 10, 380, 12), wall(10, GAME_H - 22, 380, 12),
      wall(10, 10, 12, GAME_H - 20), wall(GAME_W - 22, 10, 12, GAME_H - 20),
      parkedCar(50, 80), parkedCar(130, 80), parkedCar(220, 80), parkedCar(310, 80),
      wall(80, 180, 240, 8),
    ],
    spot: { x: 162, y: 60, w: 50, h: 76 },
    timeLimit: 30,
  },
  {
    playerStart: { x: 60, y: 460, angle: -Math.PI / 2 },
    obstacles: [
      wall(10, 10, 380, 12), wall(10, GAME_H - 22, 380, 12),
      wall(10, 10, 12, GAME_H - 20), wall(GAME_W - 22, 10, 12, GAME_H - 20),
      wall(80, 160, 8, 200), wall(200, 80, 8, 200), wall(320, 200, 8, 200),
      parkedCar(110, 160), parkedCar(230, 280),
    ],
    spot: { x: 340, y: 100, w: 50, h: 76 },
    timeLimit: 45,
  },
  {
    playerStart: { x: 200, y: 460, angle: -Math.PI / 2 },
    obstacles: [
      wall(10, 10, 380, 12), wall(10, GAME_H - 22, 380, 12),
      wall(10, 10, 12, GAME_H - 20), wall(GAME_W - 22, 10, 12, GAME_H - 20),
      wall(80, 160, 240, 8),
      parkedCar(50, 80), parkedCar(108, 80), parkedCar(230, 80), parkedCar(288, 80), parkedCar(346, 80),
    ],
    spot: { x: 155, y: 60, w: 50, h: 76 },
    timeLimit: 35,
  },
  {
    playerStart: { x: 340, y: 240, angle: Math.PI },
    obstacles: [
      wall(10, 10, 380, 12), wall(10, GAME_H - 22, 380, 12),
      wall(10, 10, 12, GAME_H - 20), wall(GAME_W - 22, 10, 12, GAME_H - 20),
      parkedCar(10, 140, false), parkedCar(10, 340, false),
    ],
    spot: { x: 10, y: 237, w: 76, h: 50 },
    timeLimit: 35,
  },

  // ===== 极限挑战 (26-30) =====
  {
    playerStart: { x: 60, y: 460, angle: -Math.PI / 2 },
    obstacles: [
      wall(10, 10, 380, 12), wall(10, GAME_H - 22, 380, 12),
      wall(10, 10, 12, GAME_H - 20), wall(GAME_W - 22, 10, 12, GAME_H - 20),
      wall(100, 120, 8, 200), wall(200, 200, 8, 200), wall(300, 80, 8, 200),
      parkedCar(120, 120), parkedCar(220, 280), parkedCar(320, 120),
    ],
    spot: { x: 340, y: 400, w: 50, h: 76 },
    timeLimit: 40,
  },
  {
    playerStart: { x: 200, y: 460, angle: -Math.PI / 2 },
    obstacles: [
      wall(10, 10, 380, 12), wall(10, GAME_H - 22, 380, 12),
      wall(10, 10, 12, GAME_H - 20), wall(GAME_W - 22, 10, 12, GAME_H - 20),
      wall(100, 160, 8, 200), wall(300, 160, 8, 200),
      parkedCar(60, 80), parkedCar(140, 80), parkedCar(220, 80), parkedCar(340, 80),
    ],
    spot: { x: 165, y: 60, w: 50, h: 76 },
    timeLimit: 25,
  },
  {
    playerStart: { x: 200, y: 460, angle: -Math.PI / 2 },
    obstacles: [
      wall(10, 10, 380, 12), wall(10, GAME_H - 22, 380, 12),
      wall(10, 10, 12, GAME_H - 20), wall(GAME_W - 22, 10, 12, GAME_H - 20),
      parkedCar(50, 80), parkedCar(130, 80), parkedCar(220, 80), parkedCar(310, 80),
      wall(80, 180, 240, 8),
    ],
    spot: { x: 162, y: 60, w: 50, h: 76 },
    timeLimit: 20,
  },
  {
    playerStart: { x: 340, y: 420, angle: Math.PI },
    obstacles: [
      wall(10, 10, 380, 12), wall(10, GAME_H - 22, 380, 12),
      wall(10, 10, 12, GAME_H - 20), wall(GAME_W - 22, 10, 12, GAME_H - 20),
      wall(80, 120, 8, 200), wall(200, 200, 8, 200),
      parkedCar(100, 120), parkedCar(220, 200), parkedCar(340, 120),
    ],
    spot: { x: 30, y: 400, w: 76, h: 50 },
    timeLimit: 35,
  },
  {
    playerStart: { x: 200, y: 460, angle: -Math.PI / 2 },
    obstacles: [
      wall(10, 10, 380, 12), wall(10, GAME_H - 22, 380, 12),
      wall(10, 10, 12, GAME_H - 20), wall(GAME_W - 22, 10, 12, GAME_H - 20),
      wall(80, 160, 240, 8), wall(140, 280, 120, 8),
      parkedCar(50, 80), parkedCar(108, 80), parkedCar(230, 80), parkedCar(288, 80), parkedCar(346, 80),
      parkedCar(50, 300), parkedCar(310, 300),
    ],
    spot: { x: 155, y: 60, w: 50, h: 76 },
    timeLimit: 30,
  },
];

export class ParkingGame extends BaseGame {
  private car: ParkingCarState = createParkingCar(0, 0, 0);
  private levelIndex = 0;
  private level!: Level;
  private elapsed = 0;
  private timeLeft = 0;
  private parkedTime = 0;
  private gameState: 'menu' | 'playing' | 'parked' | 'crash' | 'timeout' | 'complete' = 'menu';
  private keys = { up: false, down: false, left: false, right: false };
  private touchDir: 'up' | 'down' | 'left' | 'right' | null = null;

  private readonly PARK_TIME = 1.0;

  private unlockedLevel = 0;
  private bestLevel = 0;
  private selectedLevel = 0;

  // Exposed for side panel
  readonly totalLevels = LEVELS.length;
  get levelIndexEx(): number { return this.levelIndex; }
  get bestLevelEx(): number { return this.bestLevel; }
  get unlockedLevelEx(): number { return this.unlockedLevel; }
  get selectedLevelEx(): number { return this.selectedLevel; }
  get gameStateEx(): string { return this.gameState; }
  get speed(): number { return Math.abs(this.car.speed); }
  get maxSpeed(): number { return PARKING_MAX_FORWARD_SPEED; }
  get timeLeftEx(): number { return this.timeLeft; }
  get gear(): string {
    const s = this.car.speed;
    return s > 2 ? 'D' : s < -2 ? 'R' : 'N';
  }

  constructor() {
    super('gameCanvas', GAME_W, GAME_H);
  }

  init() {
    this.loadProgress();
    this.gameState = 'menu';
    this.selectedLevel = Math.min(this.unlockedLevel, LEVELS.length - 1);
    this.loadLevel(this.selectedLevel);
    this.gameState = 'menu';
  }

  /** Called from side panel to select a level in menu */
  selectLevel(index: number) {
    if (index < 0 || index >= LEVELS.length) return;
    if (index > this.unlockedLevel) return;
    this.selectedLevel = index;
    this.loadLevel(index);
  }

  /** Called from side panel to select a level and enter menu mode */
  goToMenu() {
    this.gameState = 'menu';
    this.selectedLevel = Math.min(this.unlockedLevel, LEVELS.length - 1);
  }

  private loadProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        this.unlockedLevel = Math.max(0, Math.min(LEVELS.length - 1, p.unlocked || 0));
        this.bestLevel = Math.max(0, Math.min(LEVELS.length, p.bestLevel || 0));
      } else {
        this.unlockedLevel = 0;
        this.bestLevel = 0;
      }
    } catch {
      this.unlockedLevel = 0;
      this.bestLevel = 0;
    }
  }

  private saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        unlocked: this.unlockedLevel,
        bestLevel: this.bestLevel,
      }));
    } catch {
      // ignore
    }
  }

  private loadLevel(idx: number) {
    this.levelIndex = idx;
    this.level = LEVELS[idx];
    const start = this.level.playerStart;
    this.car = createParkingCar(start.x, start.y, start.angle);
    this.elapsed = 0;
    this.timeLeft = this.level.timeLimit;
    this.parkedTime = 0;
    this.gameState = 'playing';
    this.keys = { up: false, down: false, left: false, right: false };
    this.touchDir = null;
    this.resetScoreReport();
  }

  private rectCollide(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number): boolean {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  private getCarCorners(x: number, y: number, angle: number, w: number, h: number): { x: number; y: number }[] {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const hw = w / 2, hh = h / 2;
    const pts = [
      { x: -hw, y: -hh }, { x: hw, y: -hh },
      { x: hw, y: hh }, { x: -hw, y: hh },
    ];
    return pts.map(p => ({
      x: x + cos * p.x - sin * p.y,
      y: y + sin * p.x + cos * p.y,
    }));
  }

  private carCollidesRect(rx: number, ry: number, rw: number, rh: number): boolean {
    const corners = this.getCarCorners(this.car.x, this.car.y, this.car.angle, CAR_W, CAR_H);
    for (const c of corners) {
      if (this.pointInRect(c.x, c.y, rx, ry, rw, rh)) return true;
    }
    const carR = { x: this.car.x - CAR_W / 2, y: this.car.y - CAR_H / 2, w: CAR_W, h: CAR_H };
    return this.rectCollide(rx, ry, rw, rh, carR.x, carR.y, carR.w, carR.h);
  }

  private pointInRect(px: number, py: number, rx: number, ry: number, rw: number, rh: number): boolean {
    return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
  }

  private checkCollisions(): boolean {
    for (const obs of this.level.obstacles) {
      if (this.carCollidesRect(obs.x, obs.y, obs.w, obs.h)) return true;
    }
    return false;
  }

  private checkParked(): boolean {
    const s = this.level.spot;
    const carCenterX = this.car.x;
    const carCenterY = this.car.y;
    const inSpotX = carCenterX > s.x + 6 && carCenterX < s.x + s.w - 6;
    const inSpotY = carCenterY > s.y + 8 && carCenterY < s.y + s.h - 8;
    const angleNorm = ((this.car.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const isHorizontalSpot = s.w > s.h;
    const angleOk = isHorizontalSpot
      ? (angleNorm < 0.4 || angleNorm > Math.PI * 2 - 0.4 || Math.abs(angleNorm - Math.PI) < 0.4)
      : (Math.abs(angleNorm - Math.PI / 2) < 0.35 || Math.abs(angleNorm - Math.PI * 3 / 2) < 0.35);
    return inSpotX && inSpotY && angleOk;
  }

  private updateDriving(dt: number) {
    const up = this.keys.up || this.touchDir === 'up';
    const down = this.keys.down || this.touchDir === 'down';
    const left = this.keys.left || this.touchDir === 'left';
    const right = this.keys.right || this.touchDir === 'right';

    const oldCar = { ...this.car };
    this.car = updateParkingCar(this.car, { up, down, left, right }, dt);

    if (this.checkCollisions()) {
      this.car = { ...oldCar, speed: 0, vx: 0, vy: 0 };
      this.gameState = 'crash';
      this.submitScoreOnce(this.bestLevel);
      return;
    }

    this.elapsed += dt;
    this.timeLeft = Math.max(0, this.level.timeLimit - this.elapsed);
    if (this.timeLeft <= 0) {
      this.gameState = 'timeout';
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

  update(dt: number) {
    if (this.gameState === 'crash' || this.gameState === 'timeout' || this.gameState === 'complete' || this.gameState === 'menu') {
      return;
    }

    if (this.gameState === 'parked') {
      const up = this.keys.up || this.touchDir === 'up';
      const down = this.keys.down || this.touchDir === 'down';
      const left = this.keys.left || this.touchDir === 'left';
      const right = this.keys.right || this.touchDir === 'right';

      const oldCar = { ...this.car };
      this.car = updateParkingCar(this.car, { up, down, left, right }, dt);

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
        if (this.levelIndex + 1 > this.unlockedLevel && this.levelIndex + 1 < LEVELS.length) {
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

  draw(ctx: CanvasRenderingContext2D) {
    const isDark = this.isDarkTheme();
    const primary = isDark ? '#39C5BB' : '#0d9488';
    const bg = isDark ? '#0b0f19' : '#fafafa';
    const text = isDark ? '#f8fafc' : '#0f172a';
    const spotColor = isDark ? 'rgba(57,197,187,0.25)' : 'rgba(13,148,136,0.15)';
    const spotBorder = isDark ? '#39C5BB' : '#0d9488';
    const carBody = isDark ? '#f8fafc' : '#0f766e';
    const carRoof = isDark ? '#38bdf8' : '#134e4a';
    const obstacleColor = isDark ? '#1e293b' : '#cbd5e1';
    const obstacleBorder = isDark ? '#475569' : '#94a3b8';

    // Background
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    // Parking lot lines
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    for (let y = 60; y < GAME_H; y += 60) {
      ctx.beginPath();
      ctx.moveTo(12, y);
      ctx.lineTo(GAME_W - 12, y);
      ctx.stroke();
    }

    // Parking spot
    const sp = this.level.spot;
    ctx.fillStyle = spotColor;
    ctx.fillRect(sp.x, sp.y, sp.w, sp.h);
    ctx.strokeStyle = spotBorder;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(sp.x, sp.y, sp.w, sp.h);
    ctx.setLineDash([]);

    // Obstacles
    for (const obs of this.level.obstacles) {
      ctx.fillStyle = obstacleColor;
      ctx.strokeStyle = obstacleBorder;
      ctx.lineWidth = 1.5;
      ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
      ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
      if (obs.w < obs.h) {
        ctx.strokeStyle = isDark ? '#334155' : '#94a3b8';
        ctx.beginPath();
        ctx.moveTo(obs.x + 4, obs.y + obs.h * 0.25);
        ctx.lineTo(obs.x + obs.w - 4, obs.y + obs.h * 0.25);
        ctx.moveTo(obs.x + 4, obs.y + obs.h * 0.45);
        ctx.lineTo(obs.x + obs.w - 4, obs.y + obs.h * 0.45);
        ctx.stroke();
      }
    }

    // Player car
    ctx.save();
    ctx.translate(this.car.x, this.car.y);
    ctx.rotate(this.car.angle + Math.PI / 2);

    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(-CAR_W / 2 + 2, -CAR_H / 2 + 2, CAR_W, CAR_H);

    ctx.fillStyle = isDark ? '#0f172a' : '#020617';
    ctx.fillRect(-CAR_W / 2 - 1, -CAR_H / 2 + 1, CAR_W + 2, CAR_H - 2);
    ctx.fillStyle = carBody;
    ctx.fillRect(-CAR_W / 2, -CAR_H / 2, CAR_W, CAR_H);
    ctx.fillStyle = isDark ? '#38bdf8' : '#0ea5e9';
    ctx.fillRect(-CAR_W / 2 + 2, -CAR_H / 2 + 2, CAR_W - 4, 5);
    ctx.fillStyle = carRoof;
    ctx.fillRect(-CAR_W / 2 + 4, -CAR_H / 2 + 11, CAR_W - 8, 16);
    ctx.fillStyle = isDark ? 'rgba(125,211,252,0.68)' : 'rgba(186,230,253,0.8)';
    ctx.fillRect(-CAR_W / 2 + 5, -CAR_H / 2 + 8, CAR_W - 10, 6);
    ctx.fillRect(-CAR_W / 2 + 5, CAR_H / 2 - 13, CAR_W - 10, 6);
    ctx.fillStyle = isDark ? '#f8fafc' : '#fef3c7';
    ctx.fillRect(-CAR_W / 2 + 3, -CAR_H / 2 - 1, 5, 3);
    ctx.fillRect(CAR_W / 2 - 8, -CAR_H / 2 - 1, 5, 3);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(-CAR_W / 2 + 3, CAR_H / 2 - 2, 5, 3);
    ctx.fillRect(CAR_W / 2 - 8, CAR_H / 2 - 2, 5, 3);
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.35)';
    ctx.fillRect(-CAR_W / 2 + 2, -CAR_H / 2 + 2, 2, CAR_H - 5);

    const drawWheel = (x: number, y: number, steer: boolean) => {
      ctx.save();
      ctx.translate(x, y);
      if (steer) ctx.rotate(this.car.steerAngle);
      ctx.fillStyle = '#020617';
      ctx.fillRect(-2, -6, 4, 12);
      ctx.fillStyle = '#334155';
      ctx.fillRect(-1, -4, 2, 8);
      ctx.restore();
    };
    drawWheel(-CAR_W / 2 - 2, -CAR_H / 2 + 9, true);
    drawWheel(CAR_W / 2 + 2, -CAR_H / 2 + 9, true);
    drawWheel(-CAR_W / 2 - 2, CAR_H / 2 - 11, false);
    drawWheel(CAR_W / 2 + 2, CAR_H / 2 - 11, false);

    ctx.restore();

    // Parked progress bar
    if (this.gameState === 'parked') {
      const prog = Math.min(1, this.parkedTime / this.PARK_TIME);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(sp.x, sp.y + sp.h + 4, sp.w, 6);
      ctx.fillStyle = isDark ? '#39C5BB' : '#0d9488';
      ctx.fillRect(sp.x, sp.y + sp.h + 4, sp.w * prog, 6);
    }

    // Overlays
    if (this.gameState === 'crash' || this.gameState === 'timeout') {
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(0, 0, GAME_W, GAME_H);
      ctx.fillStyle = this.gameState === 'timeout' ? primary : '#ef4444';
      ctx.font = '18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      const zh = this.isZhLang();
      ctx.fillText(this.gameState === 'timeout' ? (zh ? '超时！' : 'TIME UP') : (zh ? '撞车！' : 'CRASH!'), GAME_W / 2, GAME_H / 2 - 20);
      ctx.fillStyle = text;
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(zh ? '空格/点击 重试  ·  M 菜单' : 'SPACE/TAP RETRY  ·  M MENU', GAME_W / 2, GAME_H / 2 + 15);
    }

    if (this.gameState === 'complete') {
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(0, 0, GAME_W, GAME_H);
      const zh = this.isZhLang();
      ctx.fillStyle = primary;
      ctx.font = '18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(zh ? '停车成功！' : 'PARKED!', GAME_W / 2, GAME_H / 2 - 40);
      ctx.fillStyle = text;
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillText(`${zh ? '关卡' : 'LEVEL'} ${this.levelIndex + 1}`, GAME_W / 2, GAME_H / 2 - 5);
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
      ctx.fillText(zh ? '空格: 下一关  ·  R: 重玩  ·  M: 菜单' : 'SPACE: NEXT  ·  R: REPLAY  ·  M: MENU', GAME_W / 2, GAME_H / 2 + 25);
    }
  }



  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    if (e instanceof KeyboardEvent) {
      if (e.key === ' ' || e.key === 'm' || e.key === 'M' || e.key === 'r' || e.key === 'R' ||
          e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
      }

      if (e.type === 'keydown' && !e.repeat) {
        if (this.gameState === 'crash' || this.gameState === 'timeout') {
          if (e.key === ' ') { this.loadLevel(this.levelIndex); return; }
          if (e.key === 'm' || e.key === 'M') { this.goToMenu(); return; }
        }
        if (this.gameState === 'complete') {
          if (e.key === ' ') {
            if (this.levelIndex + 1 < LEVELS.length) this.loadLevel(this.levelIndex + 1);
            else this.loadLevel(this.levelIndex);
            return;
          }
          if (e.key === 'r' || e.key === 'R') { this.loadLevel(this.levelIndex); return; }
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
          if (this.gameState === 'crash' || this.gameState === 'timeout') {
            this.loadLevel(this.levelIndex);
          }
          if (this.gameState === 'complete') {
            if (this.levelIndex + 1 < LEVELS.length) this.loadLevel(this.levelIndex + 1);
          }
        }
      }
      if (e.type === 'touchend' || e.type === 'touchcancel') {
        this.touchDir = null;
      }
      return;
    }

    if (e instanceof MouseEvent) {
      if (e.type === 'mousedown') {
        if (this.gameState === 'crash' || this.gameState === 'timeout') {
          this.loadLevel(this.levelIndex);
        }
        if (this.gameState === 'complete') {
          if (this.levelIndex + 1 < LEVELS.length) this.loadLevel(this.levelIndex + 1);
        }
      }
    }
  }
}
