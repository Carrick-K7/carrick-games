import { BaseGame } from '../core/game.js';

type TetrominoType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

interface Piece {
  type: TetrominoType;
  x: number;
  y: number;
  rotation: number;
  color: string;
}

const TETROMINOES: Record<TetrominoType, number[][][]> = {
  I: [
    [[0,0,0,0], [1,1,1,1], [0,0,0,0], [0,0,0,0]],
    [[0,0,1,0], [0,0,1,0], [0,0,1,0], [0,0,1,0]],
    [[0,0,0,0], [0,0,0,0], [1,1,1,1], [0,0,0,0]],
    [[0,1,0,0], [0,1,0,0], [0,1,0,0], [0,1,0,0]],
  ],
  O: [
    [[1,1], [1,1]],
  ],
  T: [
    [[0,1,0], [1,1,1], [0,0,0]],
    [[0,1,0], [0,1,1], [0,1,0]],
    [[0,0,0], [1,1,1], [0,1,0]],
    [[0,1,0], [1,1,0], [0,1,0]],
  ],
  S: [
    [[0,1,1], [1,1,0], [0,0,0]],
    [[0,1,0], [0,1,1], [0,0,1]],
    [[0,0,0], [0,1,1], [1,1,0]],
    [[1,0,0], [1,1,0], [0,1,0]],
  ],
  Z: [
    [[1,1,0], [0,1,1], [0,0,0]],
    [[0,0,1], [0,1,1], [0,1,0]],
    [[0,0,0], [1,1,0], [0,1,1]],
    [[0,1,0], [1,1,0], [1,0,0]],
  ],
  J: [
    [[1,0,0], [1,1,1], [0,0,0]],
    [[0,1,1], [0,1,0], [0,1,0]],
    [[0,0,0], [1,1,1], [0,0,1]],
    [[0,1,0], [0,1,0], [1,1,0]],
  ],
  L: [
    [[0,0,1], [1,1,1], [0,0,0]],
    [[0,1,0], [0,1,0], [0,1,1]],
    [[0,0,0], [1,1,1], [1,0,0]],
    [[1,1,0], [0,1,0], [0,1,0]],
  ],
};

const COLORS: Record<TetrominoType, string> = {
  I: '#22d3ee',
  O: '#facc15',
  T: '#c084fc',
  S: '#4ade80',
  Z: '#f87171',
  J: '#60a5fa',
  L: '#fb923c',
};

export class TetrisGame extends BaseGame {
  private cols = 10;
  private rows = 20;
  private cellSize = 30;
  private board: (string | null)[][] = [];
  private currentPiece: Piece | null = null;
  private nextType: TetrominoType = 'I';
  private bag: TetrominoType[] = [];
  private score = 0;
  private lines = 0;
  private level = 1;
  private dropTimer = 0;
  private lockDelay = 0.5;
  private lockTimer = 0;
  private gameOver = false;
  private paused = false;

  // Input state
  private moveLeft = false;
  private moveRight = false;
  private softDrop = false;
  private hardDropPending = false;
  private rotateCWPending = false;
  private rotateCCWPending = false;

  // Touch tracking
  private touchStartX = 0;
  private touchStartY = 0;
  private touchStartTime = 0;
  private lastMoveTime = 0;
  private autoRepeatDelay = 0.15;

  constructor() {
    super('gameCanvas', 300, 600);
  }

  init() {
    this.board = Array.from({ length: this.rows }, () => Array(this.cols).fill(null));
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.dropTimer = 0;
    this.lockTimer = 0;
    this.gameOver = false;
    this.paused = false;
    this.bag = [];
    this.nextType = this.drawFromBag();
    this.spawnPiece();
    this.resetScoreReport();
    this.moveLeft = false;
    this.moveRight = false;
    this.softDrop = false;
    this.hardDropPending = false;
    this.rotateCWPending = false;
    this.rotateCCWPending = false;
    this.lastMoveTime = 0;
  }

  private drawFromBag(): TetrominoType {
    if (this.bag.length === 0) {
      const types: TetrominoType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
      for (let i = types.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [types[i], types[j]] = [types[j], types[i]];
      }
      this.bag = types;
    }
    return this.bag.pop()!;
  }

  private spawnPiece() {
    const type = this.nextType;
    this.nextType = this.drawFromBag();
    const shape = TETROMINOES[type][0];
    const piece: Piece = {
      type,
      x: Math.floor((this.cols - shape[0].length) / 2),
      y: 0,
      rotation: 0,
      color: COLORS[type],
    };
    // Adjust O piece spawn slightly
    if (type === 'O') piece.y = -1;

    if (this.collides(piece, 0, 0)) {
      this.gameOver = true;
      return;
    }
    this.currentPiece = piece;
    this.lockTimer = 0;
    this.dropTimer = 0;
  }

  private collides(piece: Piece, dx: number, dy: number, rot?: number): boolean {
    const r = rot ?? piece.rotation;
    const shape = TETROMINOES[piece.type][r];
    for (let y = 0; y < shape.length; y++) {
      for (let x = 0; x < shape[y].length; x++) {
        if (shape[y][x]) {
          const nx = piece.x + x + dx;
          const ny = piece.y + y + dy;
          if (nx < 0 || nx >= this.cols || ny >= this.rows) return true;
          if (ny >= 0 && this.board[ny][nx]) return true;
        }
      }
    }
    return false;
  }

  private lockPiece() {
    if (!this.currentPiece) return;
    const { type, x, y, rotation, color } = this.currentPiece;
    const shape = TETROMINOES[type][rotation];
    for (let ry = 0; ry < shape.length; ry++) {
      for (let rx = 0; rx < shape[ry].length; rx++) {
        if (shape[ry][rx]) {
          const ny = y + ry;
          const nx = x + rx;
          if (ny >= 0 && ny < this.rows && nx >= 0 && nx < this.cols) {
            this.board[ny][nx] = color;
          }
        }
      }
    }
    this.clearLines();
    this.spawnPiece();
  }

  private clearLines() {
    let cleared = 0;
    for (let r = this.rows - 1; r >= 0; r--) {
      if (this.board[r].every((c) => c)) {
        this.board.splice(r, 1);
        this.board.unshift(Array(this.cols).fill(null));
        cleared++;
        r++; // recheck this row
      }
    }
    if (cleared > 0) {
      const points = [0, 100, 300, 500, 800];
      this.score += points[cleared] * this.level;
      this.lines += cleared;
      const newLevel = Math.floor(this.lines / 10) + 1;
      if (newLevel > this.level) {
        this.level = newLevel;
      }
    }
  }

  private tryRotate(dir: 1 | -1) {
    if (!this.currentPiece) return;
    const piece = this.currentPiece;
    const rotations = TETROMINOES[piece.type].length;
    const newRot = (piece.rotation + dir + rotations) % rotations;
    if (!this.collides(piece, 0, 0, newRot)) {
      piece.rotation = newRot;
      this.lockTimer = 0;
      return;
    }
    // Simple wall kicks: try shift left/right/down
    const kicks = dir === 1 ? [1, -1, 2, -2, 0, 1] : [-1, 1, -2, 2, 0, 1];
    for (const kick of kicks) {
      if (!this.collides(piece, kick, 0, newRot)) {
        piece.x += kick;
        piece.rotation = newRot;
        this.lockTimer = 0;
        return;
      }
    }
    for (const ky of [1, -1]) {
      for (const kx of [0, 1, -1]) {
        if (!this.collides(piece, kx, ky, newRot)) {
          piece.x += kx;
          piece.y += ky;
          piece.rotation = newRot;
          this.lockTimer = 0;
          return;
        }
      }
    }
  }

  private tryMove(dx: number, dy: number): boolean {
    if (!this.currentPiece) return false;
    if (!this.collides(this.currentPiece, dx, dy)) {
      this.currentPiece.x += dx;
      this.currentPiece.y += dy;
      if (dy > 0) this.lockTimer = 0;
      return true;
    }
    return false;
  }

  private performHardDrop() {
    if (!this.currentPiece) return;
    let cells = 0;
    while (this.tryMove(0, 1)) {
      cells++;
    }
    this.score += cells * 2;
    this.lockPiece();
  }

  private getDropInterval(): number {
    // Gravity in seconds per row; speeds up per level
    const base = Math.max(0.05, 0.8 - (this.level - 1) * 0.05);
    return this.softDrop ? Math.min(base, 0.05) : base;
  }

  update(dt: number) {
    if (this.gameOver || this.paused) return;

    // Handle pending inputs
    if (this.hardDropPending) {
      this.hardDropPending = false;
      this.performHardDrop();
      return;
    }
    if (this.rotateCWPending) {
      this.rotateCWPending = false;
      this.tryRotate(1);
    }
    if (this.rotateCCWPending) {
      this.rotateCCWPending = false;
      this.tryRotate(-1);
    }

    // Horizontal auto-repeat
    const now = performance.now() / 1000;
    if (this.moveLeft !== this.moveRight) {
      if (now - this.lastMoveTime > this.autoRepeatDelay) {
        const dx = this.moveLeft ? -1 : 1;
        if (this.tryMove(dx, 0)) {
          this.lastMoveTime = now;
          this.lockTimer = 0;
        }
      }
    } else {
      this.lastMoveTime = now - this.autoRepeatDelay;
    }

    // Vertical drop
    this.dropTimer += dt;
    const interval = this.getDropInterval();
    if (this.dropTimer >= interval) {
      this.dropTimer = 0;
      if (!this.tryMove(0, 1)) {
        // Piece is resting
        this.lockTimer += dt;
        if (this.lockTimer >= this.lockDelay) {
          this.lockPiece();
        }
      } else {
        if (this.softDrop) this.score += 1;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const isDark = this.isDarkTheme();

    // Background
    ctx.fillStyle = isDark ? '#0b0f19' : '#fafafa';
    ctx.fillRect(0, 0, this.width, this.height);

    // Draw board
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const color = this.board[y][x];
        const cx = x * this.cellSize;
        const cy = y * this.cellSize;
        if (color) {
          ctx.fillStyle = color;
          ctx.fillRect(cx + 1, cy + 1, this.cellSize - 2, this.cellSize - 2);
        } else {
          ctx.strokeStyle = isDark ? '#1e293b' : '#d1d5db';
          ctx.lineWidth = 1;
          ctx.strokeRect(cx, cy, this.cellSize, this.cellSize);
        }
      }
    }

    // Draw ghost piece
    if (this.currentPiece) {
      let ghostY = this.currentPiece.y;
      while (!this.collides({ ...this.currentPiece, y: ghostY + 1 }, 0, 0)) {
        ghostY++;
      }
      if (ghostY !== this.currentPiece.y) {
        this.drawPiece(ctx, { ...this.currentPiece, y: ghostY }, true);
      }
    }

    // Draw current piece
    if (this.currentPiece) {
      this.drawPiece(ctx, this.currentPiece, false);
    }

    // Draw next piece preview
    const previewX = this.cols * this.cellSize + 16;
    const previewY = 40;
    const previewSize = 24;
    ctx.fillStyle = isDark ? '#0f172a' : '#e5e7eb';
    ctx.fillRect(previewX - 8, previewY - 24, 104, 120);
    ctx.strokeStyle = isDark ? '#334155' : '#9ca3af';
    ctx.strokeRect(previewX - 8, previewY - 24, 104, 120);
    ctx.fillStyle = isDark ? '#94a3b8' : '#4b5563';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('NEXT', previewX, previewY - 8);

    const nextShape = TETROMINOES[this.nextType][0];
    const offsetX = previewX + (4 - nextShape[0].length) * previewSize / 2;
    const offsetY = previewY + (4 - nextShape.length) * previewSize / 2;
    ctx.fillStyle = COLORS[this.nextType];
    for (let y = 0; y < nextShape.length; y++) {
      for (let x = 0; x < nextShape[y].length; x++) {
        if (nextShape[y][x]) {
          ctx.fillRect(offsetX + x * previewSize, offsetY + y * previewSize, previewSize - 2, previewSize - 2);
        }
      }
    }

    // Draw UI
    ctx.fillStyle = isDark ? '#e0e0e0' : '#1a1a2e';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`SCORE ${this.score}`, this.cols * this.cellSize + 16, 200);
    ctx.fillText(`LINES ${this.lines}`, this.cols * this.cellSize + 16, 224);
    ctx.fillText(`LEVEL ${this.level}`, this.cols * this.cellSize + 16, 248);

    if (this.gameOver) {
      this.submitScoreOnce(this.score);
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.fillStyle = isDark ? '#e0e0e0' : '#1a1a2e';
      ctx.font = '16px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', this.width / 2, this.height / 2 - 20);
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillText('PRESS SPACE', this.width / 2, this.height / 2 + 16);
    }
  }

  private drawPiece(ctx: CanvasRenderingContext2D, piece: Piece, ghost: boolean) {
    const shape = TETROMINOES[piece.type][piece.rotation];
    ctx.globalAlpha = ghost ? 0.3 : 1.0;
    ctx.fillStyle = piece.color;
    for (let y = 0; y < shape.length; y++) {
      for (let x = 0; x < shape[y].length; x++) {
        if (shape[y][x]) {
          const cx = (piece.x + x) * this.cellSize;
          const cy = (piece.y + y) * this.cellSize;
          ctx.fillRect(cx + 1, cy + 1, this.cellSize - 2, this.cellSize - 2);
        }
      }
    }
    ctx.globalAlpha = 1.0;
  }

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    if (e instanceof KeyboardEvent) {
      const down = e.type === 'keydown';
      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
          this.moveLeft = down;
          if (down) {
            this.tryMove(-1, 0);
            this.lockTimer = 0;
            this.lastMoveTime = performance.now() / 1000;
          }
          break;
        case 'ArrowRight':
        case 'd':
          this.moveRight = down;
          if (down) {
            this.tryMove(1, 0);
            this.lockTimer = 0;
            this.lastMoveTime = performance.now() / 1000;
          }
          break;
        case 'ArrowDown':
        case 's':
          this.softDrop = down;
          break;
        case 'ArrowUp':
        case 'x':
        case 'X':
          if (down) this.rotateCWPending = true;
          break;
        case 'z':
        case 'Z':
          if (down) this.rotateCCWPending = true;
          break;
        case ' ':
          if (down) {
            if (this.gameOver) {
              this.init();
            } else {
              this.hardDropPending = true;
            }
          }
          break;
      }
      return;
    }

    if (e instanceof TouchEvent) {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const touch = e.touches[0] || e.changedTouches[0];
      if (!touch) return;
      const x = touch.clientX;
      const y = touch.clientY;

      if (e.type === 'touchstart') {
        this.touchStartX = x;
        this.touchStartY = y;
        this.touchStartTime = performance.now();
      } else if (e.type === 'touchend') {
        if (this.gameOver) {
          this.init();
          return;
        }
        const dx = x - this.touchStartX;
        const dy = y - this.touchStartY;
        const dt = performance.now() - this.touchStartTime;
        const minSwipe = 40;

        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > minSwipe) {
          // horizontal swipe
          const steps = Math.max(1, Math.floor(Math.abs(dx) / this.cellSize));
          for (let i = 0; i < steps && this.tryMove(dx > 0 ? 1 : -1, 0); i++) {}
          this.lockTimer = 0;
        } else if (Math.abs(dy) > minSwipe) {
          if (dy > 0) {
            // swipe down: soft drop a bit
            for (let i = 0; i < 3 && this.tryMove(0, 1); i++) {}
            this.score += 1;
          } else {
            // swipe up: hard drop
            this.performHardDrop();
          }
        } else if (dt < 200) {
          // tap: rotate
          this.rotateCWPending = true;
        }
      }
    }
  }
}
