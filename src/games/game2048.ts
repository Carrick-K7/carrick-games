import { BaseGame } from '../core/game.js';

const W = 400;
const H = 400;
const GRID = 4;
const CELL = 80;
const GAP = 8;
const PADDING = 20;
const TILE_COLORS: Record<number, { bg: string; fg: string }> = {
  2:    { bg: '#eee4da', fg: '#776e65' },
  4:    { bg: '#ede0c8', fg: '#776e65' },
  8:    { bg: '#f2b179', fg: '#f9f6f2' },
  16:   { bg: '#f59563', fg: '#f9f6f2' },
  32:   { bg: '#f67c5f', fg: '#f9f6f2' },
  64:   { bg: '#f65e3b', fg: '#f9f6f2' },
  128:  { bg: '#edcf72', fg: '#f9f6f2' },
  256:  { bg: '#edcc61', fg: '#f9f6f2' },
  512:  { bg: '#edc850', fg: '#f9f6f2' },
  1024: { bg: '#edc53f', fg: '#f9f6f2' },
  2048: { bg: '#edc22e', fg: '#f9f6f2' },
};
const DEFAULT_COLOR = { bg: '#3c3a32', fg: '#f9f6f2' };

interface Tile {
  value: number;
  row: number;
  col: number;
  merged: boolean;
  isNew: boolean;
}

type Dir = 'up' | 'down' | 'left' | 'right';

export class Game2048 extends BaseGame {
  private grid: (Tile | null)[][] = [];
  private score = 0;
  private gameState: 'idle' | 'playing' | 'gameover' | 'win' = 'idle';
  private hasWon = false;
  private touchStartX = 0;
  private touchStartY = 0;
  private lastScoreReported = false;

  constructor() {
    super('gameCanvas', W, H);
  }

  init() {
    this.grid = Array.from({ length: GRID }, () => Array(GRID).fill(null));
    this.score = 0;
    this.gameState = 'idle';
    this.hasWon = false;
    this.lastScoreReported = false;
    this.addRandomTile();
    this.addRandomTile();
  }

  private addRandomTile() {
    const empty: [number, number][] = [];
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (!this.grid[r][c]) empty.push([r, c]);
      }
    }
    if (!empty.length) return;
    const [r, c] = empty[Math.floor(Math.random() * empty.length)];
    this.grid[r][c] = { value: Math.random() < 0.9 ? 2 : 4, row: r, col: c, merged: false, isNew: true };
  }

  private startGame() {
    this.gameState = 'playing';
  }

  private move(dir: Dir) {
    if (this.gameState === 'idle') this.startGame();
    if (this.gameState !== 'playing') return;

    // Reset merged/new flags
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (this.grid[r][c]) {
          this.grid[r][c]!.merged = false;
          this.grid[r][c]!.isNew = false;
        }
      }
    }

    let moved = false;

    const moveRow = (row: (Tile | null)[]): (Tile | null)[] => {
      const filtered = row.filter(t => t !== null) as Tile[];
      const result: (Tile | null)[] = [];
      let i = 0;
      while (i < filtered.length) {
        if (i + 1 < filtered.length && filtered[i].value === filtered[i + 1].value && !filtered[i].merged) {
          const merged: Tile = {
            value: filtered[i].value * 2,
            row: 0, col: 0,
            merged: true,
            isNew: false,
          };
          this.score += merged.value;
          result.push(merged);
          i += 2;
          moved = true;
        } else {
          result.push({ ...filtered[i], merged: false });
          i++;
        }
      }
      while (result.length < GRID) {
        result.push(null);
      }
      return result;
    };

    const transpose = () => {
      const g: (Tile | null)[][] = [];
      for (let c = 0; c < GRID; c++) {
        g[c] = [];
        for (let r = 0; r < GRID; r++) {
          g[c][r] = this.grid[r][c];
        }
      }
      this.grid = g;
    };

    const reverse = () => {
      for (let r = 0; r < GRID; r++) {
        this.grid[r].reverse();
      }
    };

    if (dir === 'up' || dir === 'down') {
      transpose();
    }
    if (dir === 'right' || dir === 'down') {
      reverse();
    }

    for (let r = 0; r < GRID; r++) {
      const newRow = moveRow(this.grid[r]);
      if (JSON.stringify(newRow) !== JSON.stringify(this.grid[r])) moved = true;
      this.grid[r] = newRow;
    }

    if (dir === 'right' || dir === 'down') {
      reverse();
    }
    if (dir === 'up' || dir === 'down') {
      transpose();
    }

    // Update tile row/col positions after move
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (this.grid[r][c]) {
          this.grid[r][c]!.row = r;
          this.grid[r][c]!.col = c;
        }
      }
    }

    if (moved) {
      this.addRandomTile();
    }

    // Check win
    if (!this.hasWon) {
      for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
          if (this.grid[r][c]?.value === 2048) {
            this.hasWon = true;
          }
        }
      }
    }

    // Check game over
    if (moved && !this.canMove()) {
      this.gameState = 'gameover';
      if (!this.lastScoreReported) {
        this.lastScoreReported = true;
        (window as any).reportScore?.(this.score);
      }
    }
  }

  private canMove(): boolean {
    // Check empty cells
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (!this.grid[r][c]) return true;
      }
    }
    // Check adjacent equal tiles
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const v = this.grid[r][c]!.value;
        if (r < GRID - 1 && this.grid[r + 1][c]?.value === v) return true;
        if (c < GRID - 1 && this.grid[r][c + 1]?.value === v) return true;
      }
    }
    return false;
  }

  update(dt: number) {
    // No continuous physics needed for 2048
  }

  draw(ctx: CanvasRenderingContext2D) {
    const isDark = !document.documentElement.hasAttribute('data-theme') ||
      document.documentElement.getAttribute('data-theme') === 'dark';

    // Background
    ctx.fillStyle = isDark ? '#0b0f19' : '#faf8ef';
    ctx.fillRect(0, 0, W, H);

    // Grid background
    const gridX = PADDING;
    const gridY = PADDING + 40; // space for score

    // Draw grid cells
    const cellSize = CELL;
    const gap = GAP;
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const x = gridX + c * (cellSize + gap);
        const y = gridY + r * (cellSize + gap);
        ctx.fillStyle = isDark ? '#1e293b' : '#bbcdc0';
        ctx.beginPath();
        ctx.roundRect(x, y, cellSize, cellSize, 6);
        ctx.fill();
      }
    }

    // Draw tiles
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const tile = this.grid[r][c];
        if (!tile) continue;
        const x = gridX + c * (cellSize + gap);
        const y = gridY + r * (cellSize + gap);
        const color = TILE_COLORS[tile.value] || DEFAULT_COLOR;

        ctx.fillStyle = color.bg;
        ctx.beginPath();
        ctx.roundRect(x, y, cellSize, cellSize, 6);
        ctx.fill();

        // Tile text
        const fontSize = tile.value >= 1000 ? 14 : tile.value >= 100 ? 18 : 22;
        ctx.fillStyle = color.fg;
        ctx.font = `bold ${fontSize}px "Press Start 2P", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(tile.value), x + cellSize / 2, y + cellSize / 2);
      }
    }

    // Score HUD
    const zh = document.documentElement.getAttribute('data-lang') === 'zh';
    ctx.fillStyle = isDark ? '#f8fafc' : '#0f172a';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`${zh ? '分数' : 'SCORE'} ${this.score}`, PADDING, 10);

    ctx.textAlign = 'right';
    ctx.fillText(`${zh ? '最高' : 'BEST'} ${this.getBest()}`, W - PADDING, 10);

    // Idle overlay
    if (this.gameState === 'idle') {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#f8fafc';
      ctx.font = '20px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('2048', W / 2, H / 2 - 40);
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillText(zh ? '点击或按方向键开始' : 'TAP OR PRESS ARROW KEYS', W / 2, H / 2 + 10);
      ctx.fillText(zh ? '按空格重新开始' : 'SPACE TO RESTART', W / 2, H / 2 + 35);
      return;
    }

    // Win overlay
    if (this.gameState === 'playing' && this.hasWon) {
      ctx.fillStyle = 'rgba(237,194,46,0.85)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#f9f6f2';
      ctx.font = '16px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(zh ? '你赢了！' : 'YOU WIN!', W / 2, H / 2 - 30);
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillText(`${zh ? '分数' : 'SCORE'} ${this.score}`, W / 2, H / 2 + 5);
      ctx.fillText(zh ? '点击继续' : 'TAP TO CONTINUE', W / 2, H / 2 + 35);
    }

    // Game over overlay
    if (this.gameState === 'gameover') {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#f8fafc';
      ctx.font = '14px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(zh ? '游戏结束' : 'GAME OVER', W / 2, H / 2 - 30);
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.fillText(`${zh ? '分数' : 'SCORE'} ${this.score}`, W / 2, H / 2 + 5);
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillText(zh ? '点击或按空格重新开始' : 'TAP OR PRESS SPACE', W / 2, H / 2 + 40);
    }
  }

  private getBest(): number {
    try {
      const records = JSON.parse(localStorage.getItem('cg-records') || '{}') as Record<string, unknown>;
      const best = records['2048'];
      return typeof best === 'number' && Number.isFinite(best) ? best : this.score;
    } catch {
      return this.score;
    }
  }

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    if (e instanceof KeyboardEvent) {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        if (e.type === 'keydown') this.move('left');
      }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        if (e.type === 'keydown') this.move('right');
      }
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        if (e.type === 'keydown') this.move('up');
      }
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        if (e.type === 'keydown') this.move('down');
      }
      if (e.key === ' ') {
        if (e.type === 'keydown' && !e.repeat) {
          if (this.gameState === 'gameover' || this.gameState === 'idle') {
            this.init();
            this.gameState = 'playing';
          } else if (this.gameState === 'playing' && this.hasWon) {
            this.gameState = 'playing';
          }
        }
      }
      return;
    }

    if (e instanceof TouchEvent) {
      e.preventDefault();
      if (e.type === 'touchstart') {
        this.touchStartX = e.touches[0].clientX;
        this.touchStartY = e.touches[0].clientY;
        // Tap to continue on win, or restart on gameover
        if (this.gameState === 'gameover') {
          this.init();
          this.gameState = 'playing';
        } else if (this.gameState === 'playing' && this.hasWon) {
          this.gameState = 'playing';
        }
      }
      if (e.type === 'touchend') {
        const dx = (e as TouchEvent).changedTouches[0].clientX - this.touchStartX;
        const dy = (e as TouchEvent).changedTouches[0].clientY - this.touchStartY;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        if (Math.max(absDx, absDy) > 20) {
          if (absDx > absDy) {
            this.move(dx > 0 ? 'right' : 'left');
          } else {
            this.move(dy > 0 ? 'down' : 'up');
          }
        }
      }
      return;
    }

    if (e instanceof MouseEvent) {
      if (e.type === 'mousedown') {
        if (this.gameState === 'gameover' || this.gameState === 'idle') {
          this.init();
          this.gameState = 'playing';
        } else if (this.gameState === 'playing' && this.hasWon) {
          this.gameState = 'playing';
        }
      }
    }
  }
}
