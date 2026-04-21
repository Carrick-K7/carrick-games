import { BaseGame } from '../core/game.js';

const W = 400;
const H = 520;
const CAR_W = 20;
const CAR_H = 36;

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

const LEVELS: Level[] = [
  // Level 1: simple lot
  {
    playerStart: { x: 60, y: 420, angle: -Math.PI / 2 },
    obstacles: [
      { x: 10, y: 10, w: 380, h: 12 },
      { x: 10, y: H - 22, w: 380, h: 12 },
      { x: 10, y: 10, w: 12, h: H - 20 },
      { x: W - 22, y: 10, w: 12, h: H - 20 },
      // Parked cars
      { x: 130, y: 80, w: 26, h: 44 },
      { x: 220, y: 80, w: 26, h: 44 },
      { x: 300, y: 80, w: 26, h: 44 },
      { x: 50, y: 180, w: 26, h: 44 },
      { x: 310, y: 180, w: 26, h: 44 },
      { x: 50, y: 300, w: 26, h: 44 },
      { x: 310, y: 300, w: 26, h: 44 },
    ],
    spot: { x: 155, y: 160, w: 50, h: 76 },
    timeLimit: 60,
  },
  // Level 2: tighter
  {
    playerStart: { x: 200, y: 460, angle: -Math.PI / 2 },
    obstacles: [
      { x: 10, y: 10, w: 380, h: 12 },
      { x: 10, y: H - 22, w: 380, h: 12 },
      { x: 10, y: 10, w: 12, h: H - 20 },
      { x: W - 22, y: 10, w: 12, h: H - 20 },
      { x: 100, y: 60, w: 26, h: 44 },
      { x: 180, y: 60, w: 26, h: 44 },
      { x: 260, y: 60, w: 26, h: 44 },
      { x: 50, y: 150, w: 26, h: 44 },
      { x: 150, y: 150, w: 26, h: 44 },
      { x: 230, y: 150, w: 26, h: 44 },
      { x: 300, y: 150, w: 26, h: 44 },
      { x: 10, y: 240, w: 380, h: 8 },
      { x: 50, y: 300, w: 26, h: 44 },
      { x: 130, y: 300, w: 26, h: 44 },
      { x: 230, y: 300, w: 26, h: 44 },
      { x: 300, y: 300, w: 26, h: 44 },
    ],
    spot: { x: 155, y: 260, w: 50, h: 76 },
    timeLimit: 50,
  },
  // Level 3: expert
  {
    playerStart: { x: 40, y: 460, angle: 0 },
    obstacles: [
      { x: 10, y: 10, w: 380, h: 12 },
      { x: 10, y: H - 22, w: 380, h: 12 },
      { x: 10, y: 10, w: 12, h: H - 20 },
      { x: W - 22, y: 10, w: 12, h: H - 20 },
      { x: 60, y: 60, w: 26, h: 44 },
      { x: 120, y: 60, w: 26, h: 44 },
      { x: 180, y: 60, w: 26, h: 44 },
      { x: 240, y: 60, w: 26, h: 44 },
      { x: 300, y: 60, w: 26, h: 44 },
      { x: 10, y: 140, w: 380, h: 8 },
      { x: 60, y: 200, w: 26, h: 44 },
      { x: 140, y: 200, w: 26, h: 44 },
      { x: 220, y: 200, w: 26, h: 44 },
      { x: 300, y: 200, w: 26, h: 44 },
      { x: 10, y: 280, w: 380, h: 8 },
      { x: 60, y: 340, w: 26, h: 44 },
      { x: 140, y: 340, w: 26, h: 44 },
      { x: 220, y: 340, w: 26, h: 44 },
      { x: 300, y: 340, w: 26, h: 44 },
    ],
    spot: { x: 155, y: 370, w: 50, h: 76 },
    timeLimit: 40,
  },
];

export class ParkingGame extends BaseGame {
  private car = { x: 0, y: 0, angle: 0, vx: 0, vy: 0, steerAngle: 0 };
  private levelIndex = 0;
  private level!: Level;
  private score = 0;
  private elapsed = 0;
  private timeLeft = 0;
  private parkedTime = 0;
  private gameState: 'playing' | 'parked' | 'crash' | 'timeout' | 'complete' = 'playing';
  private keys = { up: false, down: false, left: false, right: false };
  private touchDir: 'up' | 'down' | 'left' | 'right' | null = null;
  private lastScoreReported = false;

  private readonly ACCEL = 260;
  private readonly BRAKE = 340;
  private readonly FRICTION = 0.88;
  private readonly MAX_SPEED = 180;
  private readonly TURN_SPEED = 2.8;
  private readonly PARK_TIME = 1.0;

  constructor() {
    super('gameCanvas', W, H);
  }

  init() {
    this.loadLevel(0);
  }

  private loadLevel(idx: number) {
    this.levelIndex = idx;
    this.level = LEVELS[idx % LEVELS.length];
    const start = this.level.playerStart;
    this.car = { x: start.x, y: start.y, angle: start.angle, vx: 0, vy: 0, steerAngle: 0 };
    this.score = 0;
    this.elapsed = 0;
    this.timeLeft = this.level.timeLimit;
    this.parkedTime = 0;
    this.gameState = 'playing';
    this.keys = { up: false, down: false, left: false, right: false };
    this.touchDir = null;
    this.lastScoreReported = false;
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
    // SAT-like: check if any corner is inside rect, or if car center projection intersects
    for (const c of corners) {
      if (this.pointInRect(c.x, c.y, rx, ry, rw, rh)) return true;
    }
    // Also check rect corners inside car
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
    // Car must be roughly centered in spot, and angle near upright (or spot-aligned)
    const inSpotX = carCenterX > s.x + 6 && carCenterX < s.x + s.w - 6;
    const inSpotY = carCenterY > s.y + 8 && carCenterY < s.y + s.h - 8;
    const angleOk = Math.abs(((this.car.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI / 2) < 0.35 ||
                    Math.abs(((this.car.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI * 3 / 2) < 0.35;
    return inSpotX && inSpotY && angleOk;
  }

  update(dt: number) {
    if (this.gameState === 'crash' || this.gameState === 'timeout' || this.gameState === 'complete') return;

    if (this.gameState === 'parked') {
      this.parkedTime += dt;
      if (this.parkedTime >= this.PARK_TIME) {
        this.gameState = 'complete';
        this.score = Math.max(0, Math.round(this.timeLeft * 100));
        if (!this.lastScoreReported) {
          this.lastScoreReported = true;
          (window as any).reportScore?.(this.score);
        }
      }
      return;
    }

    const up = this.keys.up || this.touchDir === 'up';
    const down = this.keys.down || this.touchDir === 'down';
    const left = this.keys.left || this.touchDir === 'left';
    const right = this.keys.right || this.touchDir === 'right';

    // Acceleration / braking
    if (up) {
      this.car.vx += Math.cos(this.car.angle) * this.ACCEL * dt;
      this.car.vy += Math.sin(this.car.angle) * this.ACCEL * dt;
    }
    if (down) {
      this.car.vx -= Math.cos(this.car.angle) * this.BRAKE * dt;
      this.car.vy -= Math.sin(this.car.angle) * this.BRAKE * dt;
    }

    // Steering (only when moving)
    const speed = Math.sqrt(this.car.vx * this.car.vx + this.car.vy * this.car.vy);
    if (speed > 5) {
      if (left) this.car.angle -= this.TURN_SPEED * dt * Math.sign(speed > 0 ? 1 : -1);
      if (right) this.car.angle += this.TURN_SPEED * dt * Math.sign(speed > 0 ? 1 : -1);
    }

    // Friction
    this.car.vx *= this.FRICTION;
    this.car.vy *= this.FRICTION;

    // Clamp speed
    const currentSpeed = Math.sqrt(this.car.vx * this.car.vx + this.car.vy * this.car.vy);
    if (currentSpeed > this.MAX_SPEED) {
      const scale = this.MAX_SPEED / currentSpeed;
      this.car.vx *= scale;
      this.car.vy *= scale;
    }

    // Move
    const nx = this.car.x + this.car.vx * dt;
    const ny = this.car.y + this.car.vy * dt;

    // Check collision before committing
    const oldX = this.car.x, oldY = this.car.y;
    this.car.x = nx; this.car.y = ny;
    if (this.checkCollisions()) {
      this.car.x = oldX; this.car.y = oldY;
      this.car.vx = 0; this.car.vy = 0;
      this.gameState = 'crash';
      if (!this.lastScoreReported) {
        this.lastScoreReported = true;
        (window as any).reportScore?.(this.score);
      }
      return;
    }

    this.elapsed += dt;
    this.timeLeft = Math.max(0, this.level.timeLimit - this.elapsed);
    if (this.timeLeft <= 0) {
      this.gameState = 'timeout';
      if (!this.lastScoreReported) {
        this.lastScoreReported = true;
        (window as any).reportScore?.(0);
      }
      return;
    }

    // Check parking
    if (this.checkParked() && currentSpeed < 30) {
      this.gameState = 'parked';
      this.parkedTime = 0;
      this.car.vx = 0; this.car.vy = 0;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const isDark = !document.documentElement.hasAttribute('data-theme') ||
      document.documentElement.getAttribute('data-theme') === 'dark';
    const primary = isDark ? '#39C5BB' : '#0d9488';
    const bg = isDark ? '#0b0f19' : '#fafafa';
    const text = isDark ? '#f8fafc' : '#0f172a';
    const accent = '#39C5BB';
    const spotColor = isDark ? 'rgba(57,197,187,0.25)' : 'rgba(13,148,136,0.15)';
    const spotBorder = isDark ? '#39C5BB' : '#0d9488';
    const carBody = isDark ? '#e2e8f0' : '#1e293b';
    const carRoof = isDark ? '#94a3b8' : '#475569';
    const obstacleColor = isDark ? '#1e293b' : '#cbd5e1';
    const obstacleBorder = isDark ? '#475569' : '#94a3b8';
    const zh = document.documentElement.getAttribute('data-lang') === 'zh';

    // Background
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Draw parking lot lines
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    for (let y = 60; y < H; y += 60) {
      ctx.beginPath();
      ctx.moveTo(12, y);
      ctx.lineTo(W - 12, y);
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
      // Windshield lines
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

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(-CAR_W / 2 + 2, -CAR_H / 2 + 2, CAR_W, CAR_H);

    // Body
    ctx.fillStyle = carBody;
    ctx.fillRect(-CAR_W / 2, -CAR_H / 2, CAR_W, CAR_H);

    // Roof/cabin
    ctx.fillStyle = carRoof;
    ctx.fillRect(-CAR_W / 2 + 3, -CAR_H / 2 + 8, CAR_W - 6, CAR_H * 0.45);

    // Windshield
    ctx.fillStyle = isDark ? 'rgba(100,200,255,0.4)' : 'rgba(100,180,220,0.5)';
    ctx.fillRect(-CAR_W / 2 + 3, -CAR_H / 2 + 3, CAR_W - 6, 6);

    // Rear window
    ctx.fillStyle = isDark ? 'rgba(100,200,255,0.3)' : 'rgba(100,180,220,0.4)';
    ctx.fillRect(-CAR_W / 2 + 3, CAR_H / 2 - 10, CAR_W - 6, 6);

    // Wheels
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-CAR_W / 2 - 2, -CAR_H / 2 + 4, 4, 10);
    ctx.fillRect(CAR_W / 2 - 2, -CAR_H / 2 + 4, 4, 10);
    ctx.fillRect(-CAR_W / 2 - 2, CAR_H / 2 - 14, 4, 10);
    ctx.fillRect(CAR_W / 2 - 2, CAR_H / 2 - 14, 4, 10);

    ctx.restore();

    // Parked progress bar
    if (this.gameState === 'parked') {
      const prog = Math.min(1, this.parkedTime / this.PARK_TIME);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(sp.x, sp.y + sp.h + 4, sp.w, 6);
      ctx.fillStyle = accent;
      ctx.fillRect(sp.x, sp.y + sp.h + 4, sp.w * prog, 6);
    }

    // HUD
    ctx.fillStyle = text;
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.textAlign = 'left';
    const tScore = zh ? '分' : 'SCORE';
    const tTime = zh ? '时间' : 'TIME';
    const tLevel = zh ? '关卡' : 'LVL';
    ctx.fillText(`${tLevel} ${this.levelIndex + 1}`, 12, 22);
    ctx.fillText(`${tTime} ${Math.ceil(this.timeLeft)}`, 12, 38);
    ctx.fillText(`${tScore} ${this.score}`, 12, 54);

    // Speed indicator
    const speed = Math.sqrt(this.car.vx * this.car.vx + this.car.vy * this.car.vy);
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)';
    ctx.fillRect(W - 80, 12, 68, 14);
    ctx.fillStyle = speed > this.MAX_SPEED * 0.8 ? '#ef4444' : accent;
    ctx.fillRect(W - 80, 12, 68 * (speed / this.MAX_SPEED), 14);
    ctx.fillStyle = text;
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SPD', W - 46, 22);

    // Overlay: crash
    if (this.gameState === 'crash' || this.gameState === 'timeout') {
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = this.gameState === 'timeout' ? accent : '#ef4444';
      ctx.font = '14px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(this.gameState === 'timeout' ? (zh ? '超时！' : 'TIME UP') : (zh ? '撞车！' : 'CRASH!'), W / 2, H / 2 - 20);
      ctx.fillStyle = text;
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillText(zh ? '点击或空格重新开始' : 'TAP OR PRESS SPACE', W / 2, H / 2 + 20);
    }

    // Overlay: level complete
    if (this.gameState === 'complete') {
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = accent;
      ctx.font = '14px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('✅ ' + (zh ? '停车成功！' : 'PARKED!'), W / 2, H / 2 - 35);
      ctx.fillStyle = text;
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.fillText(`${zh ? '得分' : 'SCORE'} ${this.score}`, W / 2, H / 2);
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillText(zh ? '空格进入下一关' : 'SPACE FOR NEXT LEVEL', W / 2, H / 2 + 25);
      ctx.fillText(zh ? '点击返回第一关' : 'TAP TO RESTART', W / 2, H / 2 + 42);
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
            this.loadLevel(this.levelIndex);
          } else if (this.gameState === 'complete') {
            this.loadLevel(this.levelIndex + 1);
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
        const canvasRect = this.canvas.getBoundingClientRect();
        const cx = t.clientX - canvasRect.left;
        const cy = t.clientY - canvasRect.top;
        // Directional zones
        if (cy < H * 0.35) this.touchDir = 'up';
        else if (cy > H * 0.65) this.touchDir = 'down';
        else if (cx < W * 0.4) this.touchDir = 'left';
        else if (cx > W * 0.6) this.touchDir = 'right';
        else this.touchDir = null;

        if (e.type === 'touchstart') {
          if (this.gameState === 'crash' || this.gameState === 'timeout') this.loadLevel(this.levelIndex);
          else if (this.gameState === 'complete') this.loadLevel(this.levelIndex + 1);
        }
      }
      if (e.type === 'touchend' || e.type === 'touchcancel') {
        this.touchDir = null;
      }
      return;
    }

    if (e instanceof MouseEvent) {
      if (e.type === 'mousedown') {
        if (this.gameState === 'crash' || this.gameState === 'timeout') this.loadLevel(this.levelIndex);
        else if (this.gameState === 'complete') this.loadLevel(0);
      }
    }
  }
}
