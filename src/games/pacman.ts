import { BaseGame } from '../core/game.js';
import {
  PACMAN_DIR_DX as DIR_DX,
  PACMAN_DIR_DY as DIR_DY,
  PACMAN_RADIUS,
  PACMAN_TILE as TILE,
  getPacmanValidDirs,
  movePacmanBody,
  type PacmanDir as Dir,
} from './pacmanPhysics.js';

const COLS = 28;
const ROWS = 31;

// Pac-Man maze: 0=wall, 1=dot, 2=power pellet, 3=empty, 4=ghost house
const MAZE_TEMPLATE: number[][] = [
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,1,0,0,0,0,1,0,0,0,0,0,1,0,0,1,0,0,0,0,0,1,0,0,0,0,1,0],
  [0,2,0,0,0,0,1,0,0,0,0,0,1,0,0,1,0,0,0,0,0,1,0,0,0,0,2,0],
  [0,1,0,0,0,0,1,0,0,0,0,0,1,0,0,1,0,0,0,0,0,1,0,0,0,0,1,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,1,0,0,0,0,1,0,0,1,0,0,0,0,0,0,0,0,1,0,0,1,0,0,0,0,1,0],
  [0,1,0,0,0,0,1,0,0,1,0,0,0,0,0,0,0,0,1,0,0,1,0,0,0,0,1,0],
  [0,1,1,1,1,1,1,0,0,1,1,1,1,0,0,1,1,1,1,0,0,1,1,1,1,1,1,0],
  [0,0,0,0,0,0,1,0,0,0,0,0,3,0,0,3,0,0,0,0,0,1,0,0,0,0,0,0],
  [0,0,0,0,0,0,1,0,0,0,0,0,3,0,0,3,0,0,0,0,0,1,0,0,0,0,0,0],
  [0,0,0,0,0,0,1,0,0,3,3,3,3,3,3,3,3,3,3,0,0,1,0,0,0,0,0,0],
  [0,0,0,0,0,0,1,0,0,3,0,0,0,4,4,0,0,0,3,0,0,1,0,0,0,0,0,0],
  [0,0,0,0,0,0,1,0,0,3,0,4,4,4,4,4,4,0,3,0,0,1,0,0,0,0,0,0],
  [3,3,3,3,3,3,1,3,3,3,0,4,4,4,4,4,4,0,3,3,3,1,3,3,3,3,3,3],
  [0,0,0,0,0,0,1,0,0,3,0,4,4,4,4,4,4,0,3,0,0,1,0,0,0,0,0,0],
  [0,0,0,0,0,0,1,0,0,3,0,0,0,0,0,0,0,0,3,0,0,1,0,0,0,0,0,0],
  [0,0,0,0,0,0,1,0,0,3,3,3,3,3,3,3,3,3,3,0,0,1,0,0,0,0,0,0],
  [0,0,0,0,0,0,1,0,0,3,0,0,0,0,0,0,0,0,3,0,0,1,0,0,0,0,0,0],
  [0,0,0,0,0,0,1,0,0,3,0,0,0,0,0,0,0,0,3,0,0,1,0,0,0,0,0,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,1,0,0,0,0,1,0,0,0,0,0,1,0,0,1,0,0,0,0,0,1,0,0,0,0,1,0],
  [0,1,0,0,0,0,1,0,0,0,0,0,1,0,0,1,0,0,0,0,0,1,0,0,0,0,1,0],
  [0,2,1,1,0,0,1,1,1,1,1,1,1,3,3,1,1,1,1,1,1,1,0,0,1,1,2,0],
  [0,0,0,1,0,0,1,0,0,1,0,0,0,0,0,0,0,0,1,0,0,1,0,0,1,0,0,0],
  [0,0,0,1,0,0,1,0,0,1,0,0,0,0,0,0,0,0,1,0,0,1,0,0,1,0,0,0],
  [0,1,1,1,1,1,1,0,0,1,1,1,1,0,0,1,1,1,1,0,0,1,1,1,1,1,1,0],
  [0,1,0,0,0,0,0,0,0,0,0,0,1,0,0,1,0,0,0,0,0,0,0,0,0,0,1,0],
  [0,1,0,0,0,0,0,0,0,0,0,0,1,0,0,1,0,0,0,0,0,0,0,0,0,0,1,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
];

export class PacManGame extends BaseGame {
  private maze: number[][] = [];
  private pacX = 14; // tile col
  private pacY = 23; // tile row
  private pacPixelX = 14 * TILE + TILE / 2;
  private pacPixelY = 23 * TILE + TILE / 2;
  private pacDir: Dir = 'LEFT';
  private nextDir: Dir = 'LEFT';
  private pacSpeed = 120; // px/s
  private pacAngle = Math.PI;
  private mouthAngle = 0.2;
  private mouthDir = 1;
  private score = 0;
  private lives = 3;
  private gameOver = false;
  private allDotsEaten = false;
  private dotsTotal = 0;
  private dotsEaten = 0;

  // Ghosts
  private ghosts: { col: number; row: number; px: number; py: number; dir: Dir; color: string; mode: 'scatter' | 'chase' | 'frightened'; startCol: number; startRow: number }[] = [];
  private ghostPixelSpeeds = [100, 95, 90, 85];
  private ghostColors = ['#ef4444', '#fb923c', '#38bdf8', '#e879f9'];
  private frightenedTimer = 0;
  private ghostReleaseTimer = 0;

  // Timers
  private scatterTimer = 0;
  private chaseTimer = 0;
  private mode: 'scatter' | 'chase' = 'scatter';
  private inHouse = [false, false, false, false];

  constructor() {
    super('gameCanvas', COLS * TILE, ROWS * TILE);
  }

  init() {
    this.maze = MAZE_TEMPLATE.map(r => [...r]);
    this.score = 0;
    this.lives = 3;
    this.gameOver = false;
    this.allDotsEaten = false;
    this.dotsTotal = 0;
    this.dotsEaten = 0;

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this.maze[r][c] === 1 || this.maze[r][c] === 2) this.dotsTotal++;
      }
    }

    this.pacX = 14;
    this.pacY = 23;
    this.pacPixelX = 14 * TILE + TILE / 2;
    this.pacPixelY = 23 * TILE + TILE / 2;
    this.pacDir = 'LEFT';
    this.nextDir = 'LEFT';
    this.pacAngle = Math.PI;
    this.mouthAngle = 0.2;
    this.mouthDir = 1;

    // Init ghosts
    const startCols = [14, 13, 14, 15];
    const startRows = [11, 14, 14, 14];
    this.ghosts = [];
    for (let i = 0; i < 4; i++) {
      const g: typeof this.ghosts[0] = {
        col: startCols[i],
        row: startRows[i],
        px: startCols[i] * TILE + TILE / 2,
        py: startRows[i] * TILE + TILE / 2,
        dir: 'UP',
        color: this.ghostColors[i],
        mode: 'frightened',
        startCol: startCols[i],
        startRow: startRows[i],
      };
      this.ghosts.push(g);
    }
    this.inHouse = [false, true, true, true];
    this.ghostReleaseTimer = 0;
    this.frightenedTimer = 0;
    this.scatterTimer = 7;
    this.chaseTimer = 20;
    this.mode = 'scatter';
    this.resetScoreReport();
  }

  update(dt: number) {
    if (this.gameOver) return;

    // Mouth animation
    this.mouthAngle += this.mouthDir * dt * 8;
    if (this.mouthAngle > 0.4) { this.mouthAngle = 0.4; this.mouthDir = -1; }
    if (this.mouthAngle < 0.05) { this.mouthAngle = 0.05; this.mouthDir = 1; }

    // Mode switching
    if (this.mode === 'scatter') {
      this.scatterTimer -= dt;
      if (this.scatterTimer <= 0) {
        this.mode = 'chase';
        this.chaseTimer = 20;
      }
    } else {
      this.chaseTimer -= dt;
      if (this.chaseTimer <= 0) {
        this.mode = 'scatter';
        this.scatterTimer = 7;
      }
    }

    // Frightened timer
    if (this.frightenedTimer > 0) {
      this.frightenedTimer -= dt;
      if (this.frightenedTimer <= 0) {
        for (const g of this.ghosts) g.mode = this.mode;
      }
    }

    // Ghost release timer
    for (let i = 1; i < 4; i++) {
      if (this.inHouse[i]) {
        this.ghostReleaseTimer += dt;
        const threshold = i === 1 ? 2 : i === 2 ? 4 : 6;
        if (this.ghostReleaseTimer > threshold) {
          this.inHouse[i] = false;
          this.ghosts[i].px = 14 * TILE + TILE / 2;
          this.ghosts[i].py = 11 * TILE + TILE / 2;
          this.ghosts[i].col = 14;
          this.ghosts[i].row = 11;
        }
      }
    }

    // Move Pac-Man
    this.movePacMan(dt);

    // Eat dots
    const col = Math.floor(this.pacPixelX / TILE);
    const row = Math.floor(this.pacPixelY / TILE);
    if (col >= 0 && col < COLS && row >= 0 && row < ROWS) {
      if (this.maze[row][col] === 1) {
        this.maze[row][col] = 3;
        this.score += 10;
        this.dotsEaten++;
      } else if (this.maze[row][col] === 2) {
        this.maze[row][col] = 3;
        this.score += 50;
        this.dotsEaten++;
        this.frightenedTimer = 8;
        for (const g of this.ghosts) {
          if (!this.inHouse[this.ghosts.indexOf(g)]) g.mode = 'frightened';
        }
      }
      if (this.dotsEaten >= this.dotsTotal) {
        this.allDotsEaten = true;
        this.gameOver = true;
        this.submitScoreOnce(this.score);
        return;
      }
    }

    // Move ghosts
    for (let i = 0; i < 4; i++) {
      if (this.inHouse[i]) continue;
      this.moveGhost(i, dt);
      // Collision with Pac-Man
      const gx = this.ghosts[i].px;
      const gy = this.ghosts[i].py;
      const dist = Math.hypot(gx - this.pacPixelX, gy - this.pacPixelY);
      if (dist < TILE * 0.8) {
        if (this.ghosts[i].mode === 'frightened') {
          // Eaten!
          this.ghosts[i].px = this.ghosts[i].startCol * TILE + TILE / 2;
          this.ghosts[i].py = this.ghosts[i].startRow * TILE + TILE / 2;
          this.ghosts[i].col = this.ghosts[i].startCol;
          this.ghosts[i].row = this.ghosts[i].startRow;
          this.inHouse[i] = true;
          this.ghostReleaseTimer = 0;
          this.score += 200;
        } else {
          // Pac-Man dies
          this.lives--;
          if (this.lives <= 0) {
            this.gameOver = true;
            this.submitScoreOnce(this.score);
          } else {
            // Reset positions
            this.pacPixelX = 14 * TILE + TILE / 2;
            this.pacPixelY = 23 * TILE + TILE / 2;
            this.pacDir = 'LEFT';
            this.nextDir = 'LEFT';
            this.pacAngle = Math.PI;
            for (let j = 0; j < 4; j++) {
              this.ghosts[j].px = this.ghosts[j].startCol * TILE + TILE / 2;
              this.ghosts[j].py = this.ghosts[j].startRow * TILE + TILE / 2;
              this.ghosts[j].col = this.ghosts[j].startCol;
              this.ghosts[j].row = this.ghosts[j].startRow;
              this.ghosts[j].mode = 'frightened';
              this.inHouse[j] = j > 0;
            }
            this.ghostReleaseTimer = 0;
            this.frightenedTimer = 3;
          }
        }
      }
    }
  }

  private movePacMan(dt: number) {
    const moved = movePacmanBody({
      maze: this.maze,
      cols: COLS,
      rows: ROWS,
      tile: TILE,
      radius: PACMAN_RADIUS,
      x: this.pacPixelX,
      y: this.pacPixelY,
      dir: this.pacDir,
      nextDir: this.nextDir,
      speed: this.pacSpeed,
      dt,
    });

    this.pacPixelX = moved.x;
    this.pacPixelY = moved.y;
    this.pacX = moved.col;
    this.pacY = moved.row;
    this.pacDir = moved.dir;
    this.pacAngle = moved.angle;
  }

  private getValidDirs(col: number, row: number): Dir[] {
    return getPacmanValidDirs(this.maze, col, row, COLS, ROWS);
  }

  private moveGhost(idx: number, dt: number) {
    const g = this.ghosts[idx];
    const spd = this.ghostPixelSpeeds[idx] * (g.mode === 'frightened' ? 0.6 : 1) * dt;

    // Pixel movement
    let newPx = g.px + DIR_DX[g.dir] * spd;
    let newPy = g.py + DIR_DY[g.dir] * spd;

    // Tunnel wrap
    if (newPx < -TILE / 2) newPx = COLS * TILE + TILE / 2;
    if (newPx > COLS * TILE + TILE / 2) newPx = -TILE / 2;

    const newCol = Math.floor(newPx / TILE);
    const newRow = Math.floor(newPy / TILE);

    // At grid center? Choose new direction
    const atCenter = Math.abs(g.px - (g.col * TILE + TILE / 2)) < spd + 1 &&
                     Math.abs(g.py - (g.row * TILE + TILE / 2)) < spd + 1;

    if (atCenter) {
      g.col = Math.round((g.px - TILE / 2) / TILE);
      g.row = Math.round((g.py - TILE / 2) / TILE);
      g.px = g.col * TILE + TILE / 2;
      g.py = g.row * TILE + TILE / 2;

      const valid = this.getValidDirs(g.col, g.row);
      if (valid.length === 0) return;

      // Avoid reversing
      const opposite: Record<Dir, Dir> = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' };
      const filtered = valid.filter(d => d !== opposite[g.dir]);

      if (g.mode === 'frightened') {
        // Random direction
        g.dir = filtered[Math.floor(Math.random() * filtered.length)] || valid[0];
      } else {
        // Chase/scatter AI per ghost
        const target = this.getGhostTarget(idx);
        let best = filtered[0] || g.dir;
        let bestDist = Infinity;
        for (const d of filtered) {
          const nx = g.col + DIR_DX[d];
          const ny = g.row + DIR_DY[d];
          const dist = Math.hypot(nx - target.col, ny - target.row);
          if (dist < bestDist) {
            bestDist = dist;
            best = d;
          }
        }
        g.dir = best;
      }
    }

    g.px = newPx;
    g.py = newPy;
  }

  private getGhostTarget(idx: number): { col: number; row: number } {
    if (this.mode === 'scatter') {
      // Return ghost's home corner
      const corners = [{ col: COLS - 3, row: 0 }, { col: 2, row: 0 }, { col: COLS - 3, row: ROWS - 1 }, { col: 2, row: ROWS - 1 }];
      return corners[idx];
    }
    // Chase: target Pac-Man's tile
    if (idx === 0) return { col: this.pacX, row: this.pacY };
    if (idx === 1) return { col: this.pacX + 4 * DIR_DX[this.pacDir], row: this.pacY + 4 * DIR_DY[this.pacDir] };
    if (idx === 2) return { col: this.pacX - 4 * DIR_DX[this.pacDir], row: this.pacY - 4 * DIR_DY[this.pacDir] };
    return { col: this.pacX, row: this.pacY };
  }

  draw(ctx: CanvasRenderingContext2D) {
    const isDark = this.isDarkTheme();

    // Background
    ctx.fillStyle = isDark ? '#0b0f19' : '#fafafa';
    ctx.fillRect(0, 0, this.width, this.height);

    // Maze walls
    ctx.strokeStyle = isDark ? '#3b82f6' : '#2563eb';
    ctx.lineWidth = 2;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = c * TILE;
        const y = r * TILE;
        const t = this.maze[r][c];
        if (t === 0) {
          // Draw wall block
          ctx.fillStyle = isDark ? '#1e3a5f' : '#93c5fd';
          ctx.fillRect(x, y, TILE, TILE);
          ctx.strokeStyle = '#3b82f6';
          ctx.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);
        }
      }
    }

    // Draw ghost house
    for (let c = 11; c <= 16; c++) {
      for (let r = 12; r <= 14; r++) {
        if (MAZE_TEMPLATE[r][c] === 4) {
          ctx.fillStyle = isDark ? '#1e293b' : '#e5e7eb';
          ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
        }
      }
    }

    // Draw tunnel indicator
    ctx.fillStyle = isDark ? '#0b0f19' : '#fafafa';
    ctx.fillRect(0, 13 * TILE, TILE, TILE);
    ctx.fillRect((COLS - 1) * TILE, 13 * TILE, TILE, TILE);

    // Draw dots
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = c * TILE + TILE / 2;
        const y = r * TILE + TILE / 2;
        if (this.maze[r][c] === 1) {
          ctx.fillStyle = isDark ? '#f1f5f9' : '#374151';
          ctx.beginPath();
          ctx.arc(x, y, 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (this.maze[r][c] === 2) {
          // Power pellet - pulsing
          const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 200);
          ctx.fillStyle = `rgba(34,211,238,${pulse})`;
          ctx.beginPath();
          ctx.arc(x, y, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Draw Pac-Man
    ctx.save();
    ctx.translate(this.pacPixelX, this.pacPixelY);
    ctx.rotate(this.pacAngle);
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(0, 0, PACMAN_RADIUS, this.mouthAngle, Math.PI * 2 - this.mouthAngle);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Draw ghosts
    for (const g of this.ghosts) {
      ctx.save();
      ctx.translate(g.px, g.py);
      const bodyColor = g.mode === 'frightened' ? '#3b82f6' : g.color;
      // Body
      ctx.fillStyle = bodyColor;
      ctx.beginPath();
      ctx.arc(0, -2, TILE / 2 - 1, Math.PI, 0, false);
      ctx.lineTo(TILE / 2 - 1, TILE / 2 - 1);
      // Wavy bottom
      const wave = Math.sin(Date.now() / 100) * 1.5;
      for (let i = 3; i >= 0; i--) {
        ctx.quadraticCurveTo(
          (TILE / 2 - 1) * (1 - 2 * (i / 3)) + (i % 2 === 0 ? wave : -wave),
          TILE / 2 - 1 + (i % 2 === 0 ? 2 : 0),
          (TILE / 2 - 1) * (1 - 2 * ((i - 1) / 3)),
          TILE / 2 - 1
        );
      }
      ctx.closePath();
      ctx.fill();

      // Eyes
      if (g.mode === 'frightened') {
        // White X eyes
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-4, -4); ctx.lineTo(-1, -1);
        ctx.moveTo(-1, -4); ctx.lineTo(-4, -1);
        ctx.moveTo(1, -4); ctx.lineTo(4, -1);
        ctx.moveTo(4, -4); ctx.lineTo(1, -1);
        ctx.stroke();
      } else {
        // Normal eyes
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(-3, -2, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(3, -2, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1e3a8a';
        ctx.beginPath(); ctx.arc(-2 + DIR_DX[g.dir], -2 + DIR_DY[g.dir], 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(4 + DIR_DX[g.dir], -2 + DIR_DY[g.dir], 1.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    // HUD
    ctx.fillStyle = isDark ? '#e0e0e0' : '#1a1a2e';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillText(`SCORE ${this.score}`, 8, 18);

    // Lives
    for (let i = 0; i < this.lives - 1; i++) {
      ctx.save();
      ctx.translate(this.width - 20 - i * 18, 12);
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0.2, Math.PI * 2 - 0.2);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Game Over
    if (this.gameOver) {
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.fillStyle = '#f8fafc';
      ctx.font = '14px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      if (this.allDotsEaten) {
        ctx.fillText('YOU WIN!', this.width / 2, this.height / 2 - 20);
      } else {
        ctx.fillText('GAME OVER', this.width / 2, this.height / 2 - 20);
      }
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillText('PRESS SPACE', this.width / 2, this.height / 2 + 16);
      ctx.textAlign = 'left';
    }
  }

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    if (this.gameOver) {
      if (e instanceof KeyboardEvent && e.key === ' ') {
        this.init();
        this.start();
      }
      if (e instanceof TouchEvent) {
        e.preventDefault();
        this.init();
        this.start();
      }
      return;
    }
    if (e instanceof KeyboardEvent) {
      switch (e.key) {
        case 'ArrowLeft': case 'a': this.nextDir = 'LEFT'; break;
        case 'ArrowRight': case 'd': this.nextDir = 'RIGHT'; break;
        case 'ArrowUp': case 'w': this.nextDir = 'UP'; break;
        case 'ArrowDown': case 's': this.nextDir = 'DOWN'; break;
      }
    }
    if (e instanceof TouchEvent) {
      e.preventDefault();
      const touch = e.touches[0] ?? e.changedTouches[0];
      if (!touch) return;
      const { x } = this.canvasPoint(touch.clientX, touch.clientY);
      if (x < this.width / 3) this.nextDir = 'LEFT';
      else if (x > (this.width * 2) / 3) this.nextDir = 'RIGHT';
      else this.nextDir = this.pacDir;
    }
  }
}
