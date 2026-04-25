import { BaseGame } from '../core/game.js';
import {
  PARKING_MAX_FORWARD_SPEED,
  createParkingCar,
  updateParkingCar,
  type ParkingCarState,
} from './parkingPhysics.js';

const GAME_W = 400;
const GAME_H = 520;
const DASH_W = 120;
const TOTAL_W = 520;
const CAR_W = 24;
const CAR_H = 42;

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
    playerStart: { x: 340, y: 240, angle: Math.PI },
    obstacles: [
      wall(10, 10, 380, 12), wall(10, GAME_H - 22, 380, 12),
      wall(10, 10, 12, GAME_H - 20), wall(GAME_W - 22, 10, 12, GAME_H - 20),
      parkedCar(20, 180, false), parkedCar(20, 280, false),
    ],
    spot: { x: 10, y: 230, w: 76, h: 50 },
    timeLimit: 55,
  },
  {
    playerStart: { x: 60, y: 280, angle: 0 },
    obstacles: [
      wall(10, 10, 380, 12), wall(10, GAME_H - 22, 380, 12),
      wall(10, 10, 12, GAME_H - 20), wall(GAME_W - 22, 10, 12, GAME_H - 20),
      parkedCar(330, 180, false), parkedCar(330, 280, false),
    ],
    spot: { x: 330, y: 230, w: 76, h: 50 },
    timeLimit: 55,
  },
  {
    playerStart: { x: 200, y: 60, angle: Math.PI / 2 },
    obstacles: [
      wall(10, 10, 380, 12), wall(10, GAME_H - 22, 380, 12),
      wall(10, 10, 12, GAME_H - 20), wall(GAME_W - 22, 10, 12, GAME_H - 20),
      parkedCar(120, 450, false), parkedCar(220, 450, false),
    ],
    spot: { x: 170, y: 450, w: 76, h: 50 },
    timeLimit: 55,
  },
  {
    playerStart: { x: 200, y: 460, angle: -Math.PI / 2 },
    obstacles: [
      wall(10, 10, 380, 12), wall(10, GAME_H - 22, 380, 12),
      wall(10, 10, 12, GAME_H - 20), wall(GAME_W - 22, 10, 12, GAME_H - 20),
      parkedCar(120, 10, false), parkedCar(220, 10, false),
    ],
    spot: { x: 170, y: 10, w: 76, h: 50 },
    timeLimit: 55,
  },
  {
    playerStart: { x: 340, y: 260, angle: Math.PI },
    obstacles: [
      wall(10, 10, 380, 12), wall(10, GAME_H - 22, 380, 12),
      wall(10, 10, 12, GAME_H - 20), wall(GAME_W - 22, 10, 12, GAME_H - 20),
      parkedCar(10, 120, false), parkedCar(10, 360, false),
    ],
    spot: { x: 10, y: 235, w: 76, h: 50 },
    timeLimit: 50,
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
  private score = 0;
  private totalScore = 0;
  private elapsed = 0;
  private timeLeft = 0;
  private parkedTime = 0;
  private gameState: 'playing' | 'parked' | 'crash' | 'timeout' | 'complete' = 'playing';
  private keys = { up: false, down: false, left: false, right: false };
  private touchDir: 'up' | 'down' | 'left' | 'right' | null = null;

  private readonly PARK_TIME = 1.0;

  constructor() {
    super('gameCanvas', TOTAL_W, GAME_H);
  }

  init() {
    this.loadLevel(0);
  }

  private loadLevel(idx: number) {
    this.levelIndex = idx;
    this.level = LEVELS[idx % LEVELS.length];
    const start = this.level.playerStart;
    this.car = createParkingCar(start.x, start.y, start.angle);
    this.score = 0;
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
    const angleOk = Math.abs(angleNorm - Math.PI / 2) < 0.35 ||
                    Math.abs(angleNorm - Math.PI * 3 / 2) < 0.35;
    return inSpotX && inSpotY && angleOk;
  }

  update(dt: number) {
    if (this.gameState === 'crash' || this.gameState === 'timeout') return;

    if (this.gameState === 'complete') {
      return;
    }

    if (this.gameState === 'parked') {
      this.parkedTime += dt;
      if (this.parkedTime >= this.PARK_TIME) {
        this.score = Math.max(0, Math.round(this.timeLeft * 100));
        this.gameState = 'complete';
        this.submitScoreOnce(this.totalScore + this.score);
        this.parkedTime = 0;
      }
      return;
    }

    const up = this.keys.up || this.touchDir === 'up';
    const down = this.keys.down || this.touchDir === 'down';
    const left = this.keys.left || this.touchDir === 'left';
    const right = this.keys.right || this.touchDir === 'right';

    const oldCar = { ...this.car };
    this.car = updateParkingCar(this.car, { up, down, left, right }, dt);

    if (this.checkCollisions()) {
      this.car = { ...oldCar, speed: 0, vx: 0, vy: 0 };
      this.gameState = 'crash';
      this.submitScoreOnce(this.totalScore);
      return;
    }

    this.elapsed += dt;
    this.timeLeft = Math.max(0, this.level.timeLimit - this.elapsed);
    if (this.timeLeft <= 0) {
      this.gameState = 'timeout';
      this.submitScoreOnce(this.totalScore);
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

  draw(ctx: CanvasRenderingContext2D) {
    const isDark = this.isDarkTheme();
    const primary = isDark ? '#39C5BB' : '#0d9488';
    const bg = isDark ? '#0b0f19' : '#fafafa';
    const text = isDark ? '#f8fafc' : '#0f172a';
    const accent = '#39C5BB';
    const spotColor = isDark ? 'rgba(57,197,187,0.25)' : 'rgba(13,148,136,0.15)';
    const spotBorder = isDark ? '#39C5BB' : '#0d9488';
    const carBody = isDark ? '#f8fafc' : '#0f766e';
    const carRoof = isDark ? '#38bdf8' : '#134e4a';
    const obstacleColor = isDark ? '#1e293b' : '#cbd5e1';
    const obstacleBorder = isDark ? '#475569' : '#94a3b8';
    const zh = document.documentElement.getAttribute('data-lang') === 'zh';

    // === Game Area Background ===
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    // Draw parking lot lines
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

    // Draw obstacles (parked cars)
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

    // Draw player car
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
      ctx.fillStyle = accent;
      ctx.fillRect(sp.x, sp.y + sp.h + 4, sp.w * prog, 6);
    }

    // === Dashboard Area ===
    const dx = GAME_W;
    const dw = DASH_W;
    const dashBg = isDark ? '#0f172a' : '#f1f5f9';
    const dashBorder = isDark ? '#1e293b' : '#e2e8f0';

    // Dashboard background
    ctx.fillStyle = dashBg;
    ctx.fillRect(dx, 0, dw, GAME_H);
    ctx.strokeStyle = dashBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(dx, 0);
    ctx.lineTo(dx, GAME_H);
    ctx.stroke();

    // Title
    ctx.fillStyle = primary;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(zh ? '停车' : 'PARK', dx + dw / 2, 28);

    // Level number (big)
    ctx.fillStyle = text;
    ctx.font = '18px "Press Start 2P", monospace';
    ctx.fillText(`${this.levelIndex + 1}`, dx + dw / 2, 58);
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
    ctx.fillText(`/ ${LEVELS.length}`, dx + dw / 2, 72);

    // Speed gauge
    const cx = dx + dw / 2;
    const cy = 130;
    const radius = 40;
    const startAngle = Math.PI * 0.8;
    const endAngle = Math.PI * 2.2;

    // Gauge background arc
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.strokeStyle = isDark ? '#334155' : '#cbd5e1';
    ctx.lineWidth = 6;
    ctx.stroke();

    // Speed arc
    const speedRatio = Math.abs(this.car.speed) / PARKING_MAX_FORWARD_SPEED;
    const speedEndAngle = startAngle + speedRatio * (endAngle - startAngle);
    if (speedRatio > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, speedEndAngle);
      ctx.strokeStyle = this.car.speed > PARKING_MAX_FORWARD_SPEED * 0.8 ? '#ef4444' : primary;
      ctx.lineWidth = 6;
      ctx.stroke();
    }

    // Needle
    const needleAngle = startAngle + speedRatio * (endAngle - startAngle);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(needleAngle);
    ctx.fillStyle = primary;
    ctx.fillRect(-1, -radius + 4, 2, radius - 8);
    ctx.restore();

    // Center dot
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = primary;
    ctx.fill();

    // Speed value
    ctx.fillStyle = text;
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(Math.abs(this.car.speed))}`, cx, cy + 22);
    ctx.font = '6px "Press Start 2P", monospace';
    ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
    ctx.fillText(zh ? '速度' : 'KM/H', cx, cy + 34);

    // Gear indicator
    const gearY = 200;
    const gear = this.car.speed > 2 ? 'D' : this.car.speed < -2 ? 'R' : 'N';
    ctx.fillStyle = gear === 'R' ? '#ef4444' : gear === 'D' ? primary : isDark ? '#475569' : '#94a3b8';
    ctx.font = '16px "Press Start 2P", monospace';
    ctx.fillText(gear, cx, gearY);
    ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
    ctx.font = '6px "Press Start 2P", monospace';
    ctx.fillText(zh ? '档位' : 'GEAR', cx, gearY + 14);

    // Time
    const timeY = 260;
    ctx.fillStyle = this.timeLeft <= 10 ? '#ef4444' : text;
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.fillText(`${Math.ceil(this.timeLeft)}`, cx, timeY);
    ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
    ctx.font = '6px "Press Start 2P", monospace';
    ctx.fillText(zh ? '秒' : 'SEC', cx, timeY + 14);

    // Score
    const scoreY = 320;
    ctx.fillStyle = text;
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillText(`${this.totalScore + this.score}`, cx, scoreY);
    ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
    ctx.font = '6px "Press Start 2P", monospace';
    ctx.fillText(zh ? '总分' : 'SCORE', cx, scoreY + 14);

    // Level progress dots
    const dotY = 380;
    const dotSize = 5;
    const gap = 8;
    const cols = 5;
    const rows = Math.ceil(LEVELS.length / cols);
    const startX = cx - ((cols - 1) * gap) / 2;
    for (let i = 0; i < LEVELS.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const px = startX + col * gap;
      const py = dotY + row * (dotSize + 4);
      ctx.beginPath();
      ctx.arc(px, py, dotSize / 2, 0, Math.PI * 2);
      if (i < this.levelIndex) {
        ctx.fillStyle = primary;
      } else if (i === this.levelIndex) {
        ctx.fillStyle = accent;
        ctx.strokeStyle = text;
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        ctx.fillStyle = isDark ? '#334155' : '#cbd5e1';
      }
      ctx.fill();
    }

    // Status text
    const statusY = GAME_H - 60;
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    if (this.gameState === 'parked') {
      ctx.fillStyle = accent;
      ctx.fillText(zh ? '停车中...' : 'PARKING...', cx, statusY);
    } else if (this.gameState === 'playing') {
      ctx.fillStyle = isDark ? '#64748b' : '#94a3b8';
      ctx.fillText(zh ? '驾驶中' : 'DRIVING', cx, statusY);
    }

    // Controls hint at bottom
    ctx.fillStyle = isDark ? '#475569' : '#94a3b8';
    ctx.font = '5px "Press Start 2P", monospace';
    if (this.gameState === 'playing') {
      ctx.fillText(zh ? '↑加速 ↓倒车' : 'UP DWN', cx, GAME_H - 30);
      ctx.fillText(zh ? '← →转向' : 'L R', cx, GAME_H - 18);
    }

    // === Overlays ===
    if (this.gameState === 'crash' || this.gameState === 'timeout') {
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(0, 0, TOTAL_W, GAME_H);
      ctx.fillStyle = this.gameState === 'timeout' ? accent : '#ef4444';
      ctx.font = '14px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(this.gameState === 'timeout' ? (zh ? '超时！' : 'TIME UP') : (zh ? '撞车！' : 'CRASH!'), TOTAL_W / 2, GAME_H / 2 - 30);
      ctx.fillStyle = text;
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.fillText(`${zh ? '总分' : 'SCORE'} ${this.totalScore}`, TOTAL_W / 2, GAME_H / 2);
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillText(zh ? '点击或空格重新开始' : 'TAP OR SPACE', TOTAL_W / 2, GAME_H / 2 + 30);
    }

    if (this.gameState === 'complete') {
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(0, 0, TOTAL_W, GAME_H);
      ctx.fillStyle = accent;
      ctx.font = '14px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      const isLast = this.levelIndex + 1 >= LEVELS.length;
      ctx.fillText('✅ ' + (zh ? '停车成功！' : 'PARKED!'), TOTAL_W / 2, GAME_H / 2 - 40);
      ctx.fillStyle = text;
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.fillText(`${zh ? '本关' : 'LEVEL'} ${this.levelIndex + 1}  ${zh ? '得分' : 'SCORE'} ${this.score}`, TOTAL_W / 2, GAME_H / 2 - 10);
      ctx.fillText(`${zh ? '总分' : 'TOTAL'} ${this.totalScore + this.score}`, TOTAL_W / 2, GAME_H / 2 + 10);
      ctx.font = '8px "Press Start 2P", monospace';
      if (isLast) {
        ctx.fillText(zh ? '全部通关！点击重新开始' : 'ALL CLEARED! TAP TO RESTART', TOTAL_W / 2, GAME_H / 2 + 40);
      } else {
        ctx.fillText(zh ? '空格进入下一关' : 'SPACE FOR NEXT', TOTAL_W / 2, GAME_H / 2 + 35);
        ctx.fillText(zh ? '点击返回第一关' : 'TAP TO RESTART', TOTAL_W / 2, GAME_H / 2 + 52);
      }
    }
  }

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    if (e instanceof KeyboardEvent) {
      if (
        e.key === ' ' || e.key === 'Enter' ||
        e.key === 'ArrowUp' || e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft' || e.key === 'ArrowRight'
      ) {
        e.preventDefault();
      }
      if (e.key === ' ' || e.key === 'Enter') {
        if (e.type === 'keydown' && !e.repeat) {
          if (this.gameState === 'crash' || this.gameState === 'timeout') {
            this.loadLevel(0);
          } else if (this.gameState === 'complete') {
            if (this.levelIndex + 1 < LEVELS.length) {
              this.totalScore += this.score;
              this.loadLevel(this.levelIndex + 1);
            } else {
              this.loadLevel(0);
            }
          }
        }
        return;
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
          if (this.gameState === 'crash' || this.gameState === 'timeout') this.loadLevel(0);
          else if (this.gameState === 'complete') {
            this.loadLevel(0);
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
        const { x: cx } = this.canvasPoint(e.clientX, e.clientY);
        if (cx < GAME_W) {
          if (this.gameState === 'crash' || this.gameState === 'timeout') this.loadLevel(0);
          else if (this.gameState === 'complete') {
            this.loadLevel(0);
          }
        }
      }
    }
  }
}
