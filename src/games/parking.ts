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
    const asphalt = isDark ? '#13161f' : '#e8e9ec';
    const text = isDark ? '#f8fafc' : '#0f172a';

    // Background - asphalt
    ctx.fillStyle = asphalt;
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    // Asphalt texture - subtle speckles
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)';
    for (let i = 0; i < 200; i++) {
      const sx = ((i * 137.5) % GAME_W);
      const sy = ((i * 73.3) % GAME_H);
      ctx.fillRect(sx, sy, 1.5, 1.5);
    }

    // Parking lot lane lines
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    for (let y = 60; y < GAME_H; y += 60) {
      ctx.beginPath();
      ctx.moveTo(12, y);
      ctx.lineTo(GAME_W - 12, y);
      ctx.stroke();
    }

    // Parking spot
    const sp = this.level.spot;
    // Spot fill with subtle primary tint
    ctx.fillStyle = isDark ? 'rgba(57,197,187,0.08)' : 'rgba(13,148,136,0.06)';
    ctx.fillRect(sp.x - 2, sp.y - 2, sp.w + 4, sp.h + 4);

    // Spot border - dashed with rounded caps
    ctx.strokeStyle = primary;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.setLineDash([6, 5]);
    ctx.strokeRect(sp.x + 1, sp.y + 1, sp.w - 2, sp.h - 2);
    ctx.setLineDash([]);

    // Target center dot
    const cx = sp.x + sp.w / 2;
    const cy = sp.y + sp.h / 2;
    ctx.fillStyle = primary;
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fill();

    // Obstacles
    for (const obs of this.level.obstacles) {
      const isCarLike = (obs.w < obs.h && obs.w > 20 && obs.h > 30) || (obs.w > obs.h && obs.h > 20 && obs.w > 30);
      if (isCarLike) {
        this.drawParkedCar(ctx, obs.x, obs.y, obs.w, obs.h, isDark);
      } else {
        // Wall / barrier
        ctx.fillStyle = isDark ? '#1f2937' : '#d1d5db';
        ctx.strokeStyle = isDark ? '#374151' : '#9ca3af';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(obs.x, obs.y, obs.w, obs.h, 2);
        ctx.fill();
        ctx.stroke();

        // Wall detail lines
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
    if (this.gameState === 'crash' || this.gameState === 'timeout') {
      const zh = this.isZhLang();
      this.drawOverlay(
        ctx,
        isDark,
        this.gameState === 'timeout' ? (zh ? '超时！' : 'TIME UP') : (zh ? '撞车！' : 'CRASH!'),
        zh ? '空格/点击 重试  ·  M 菜单' : 'SPACE/TAP RETRY  ·  M MENU',
        this.gameState === 'timeout' ? primary : '#ef4444'
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
    drawWheel(-w / 2 - 2.5, -h / 2 + 9, true);
    drawWheel(w / 2 + 2.5, -h / 2 + 9, true);
    drawWheel(-w / 2 - 2.5, h / 2 - 11, false);
    drawWheel(w / 2 + 2.5, h / 2 - 11, false);
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
