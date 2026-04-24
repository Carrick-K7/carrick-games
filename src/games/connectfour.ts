import { BaseGame } from '../core/game.js';

const COLS = 7;
const ROWS = 6;
const CELL = 60;
const MARGIN = 10;

export class ConnectFourGame extends BaseGame {
  private board: (number | null)[][] = [];
  private currentPlayer = 1; // 1 = player (red), 2 = AI (yellow)
  private winner: number | null = null;
  private gameOver = false;
  private animatingCol = -1;
  private animatingRow = -1;
  private animY = 0;
  private animating = false;
  private score = 0;
  private moves = 0;

  constructor() {
    super('gameCanvas', COLS * CELL + MARGIN * 2, ROWS * CELL + MARGIN * 2 + 40);
  }

  init() {
    this.board = Array.from({ length: COLS }, () => Array(ROWS).fill(null));
    this.currentPlayer = 1;
    this.winner = null;
    this.gameOver = false;
    this.animating = false;
    this.score = 0;
    this.moves = 0;
  }

  update(_dt: number) {
    if (this.gameOver || this.animating) return;
    if (this.currentPlayer === 2) {
      this.aiMove();
    }
  }

  private aiMove() {
    // Find winning move
    let col = this.findWinningMove(2);
    // Block player win
    if (col === -1) col = this.findWinningMove(1);
    // Prefer center
    if (col === -1) {
      const center = [3, 2, 4, 1, 5, 0, 6];
      for (const c of center) {
        if (this.canDrop(c)) { col = c; break; }
      }
    }
    if (col !== -1) {
      this.dropPiece(col);
    }
  }

  private findWinningMove(player: number): number {
    for (let c = 0; c < COLS; c++) {
      const r = this.getDropRow(c);
      if (r === -1) continue;
      this.board[c][r] = player;
      const win = this.checkWinAt(c, r, player);
      this.board[c][r] = null;
      if (win) return c;
    }
    return -1;
  }

  private canDrop(col: number): boolean {
    return this.board[col][0] === null;
  }

  private getDropRow(col: number): number {
    for (let r = ROWS - 1; r >= 0; r--) {
      if (this.board[col][r] === null) return r;
    }
    return -1;
  }

  private dropPiece(col: number) {
    const row = this.getDropRow(col);
    if (row === -1) return;
    this.board[col][row] = this.currentPlayer;
    this.moves++;
    if (this.checkWinAt(col, row, this.currentPlayer)) {
      this.winner = this.currentPlayer;
      this.gameOver = true;
      if (this.currentPlayer === 1) {
        this.score = 1000 - this.moves * 10;
        if (this.score < 100) this.score = 100;
      }
      window.reportScore?.(this.score);
    } else if (this.board.every(col => col[0] !== null)) {
      this.gameOver = true;
      this.score = 0;
      window.reportScore?.(this.score);
    } else {
      this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
    }
  }

  private checkWinAt(c: number, r: number, p: number): boolean {
    const dirs = [[1,0],[0,1],[1,1],[1,-1]];
    for (const [dx, dy] of dirs) {
      let count = 1;
      for (let step = 1; step < 4; step++) {
        const x = c + dx * step, y = r + dy * step;
        if (x >= 0 && x < COLS && y >= 0 && y < ROWS && this.board[x][y] === p) count++;
        else break;
      }
      for (let step = 1; step < 4; step++) {
        const x = c - dx * step, y = r - dy * step;
        if (x >= 0 && x < COLS && y >= 0 && y < ROWS && this.board[x][y] === p) count++;
        else break;
      }
      if (count >= 4) return true;
    }
    return false;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const isDark = this.isDarkTheme();
    const bg = isDark ? '#0b0f19' : '#fafafa';
    const boardColor = isDark ? '#1e3a8a' : '#3b82f6';
    const holeColor = isDark ? '#0b0f19' : '#fafafa';
    const p1Color = '#ef4444';
    const p2Color = '#eab308';
    const textColor = isDark ? '#e0e0e0' : '#1a1a2e';

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.width, this.height);

    // Draw board
    ctx.fillStyle = boardColor;
    const bx = MARGIN;
    const by = MARGIN + 40;
    ctx.fillRect(bx, by, COLS * CELL, ROWS * CELL);

    // Draw holes and pieces
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const x = bx + c * CELL + CELL / 2;
        const y = by + r * CELL + CELL / 2;
        const piece = this.board[c][r];

        if (piece === null) {
          ctx.fillStyle = holeColor;
          ctx.beginPath();
          ctx.arc(x, y, CELL / 2 - 4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = piece === 1 ? p1Color : p2Color;
          ctx.beginPath();
          ctx.arc(x, y, CELL / 2 - 4, 0, Math.PI * 2);
          ctx.fill();
          // Highlight
          ctx.fillStyle = 'rgba(255,255,255,0.2)';
          ctx.beginPath();
          ctx.arc(x - 6, y - 6, 8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Hover indicator for player
    if (!this.gameOver && this.currentPlayer === 1) {
      // No complex hover tracking; rely on click/tap
    }

    // Turn text
    ctx.fillStyle = textColor;
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    const zh = document.documentElement.getAttribute('data-lang') === 'zh';
    if (!this.gameOver) {
      const turnText = this.currentPlayer === 1
        ? (zh ? '你的回合 (红)' : 'Your Turn (Red)')
        : (zh ? '电脑思考中...' : 'Computer thinking...');
      ctx.fillText(turnText, this.width / 2, 24);
    } else {
      let msg = '';
      if (this.winner === 1) msg = zh ? '你赢了!' : 'You Win!';
      else if (this.winner === 2) msg = zh ? '电脑赢了!' : 'Computer Wins!';
      else msg = zh ? '平局!' : 'Draw!';
      ctx.fillText(msg, this.width / 2, 24);
    }

    // Score
    ctx.textAlign = 'left';
    ctx.fillText(`${zh ? '得分' : 'SCORE'} ${this.score}`, 8, this.height - 8);

    // Game over overlay
    if (this.gameOver) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.fillStyle = '#f8fafc';
      ctx.font = '14px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      const overText = zh ? '按空格重新开始' : 'PRESS SPACE';
      ctx.fillText(overText, this.width / 2, this.height / 2 + 8);
    }
    ctx.textAlign = 'left';
  }

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    if (e instanceof KeyboardEvent) {
      if (e.type === 'keydown') {
        if (this.gameOver && e.key === ' ') {
          this.init();
          return;
        }
        if (!this.gameOver && this.currentPlayer === 1) {
          const key = e.key;
          const colMap: Record<string, number> = {
            '1': 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5, '7': 6,
          };
          if (key in colMap) {
            this.dropPiece(colMap[key]);
          }
        }
      }
    }
    if (e instanceof MouseEvent && e.type === 'mousedown') {
      if (this.gameOver) {
        this.init();
        return;
      }
      if (this.currentPlayer !== 1) return;
      const rect = this.canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (this.width / rect.width);
      const bx = MARGIN;
      if (x >= bx && x < bx + COLS * CELL) {
        const col = Math.floor((x - bx) / CELL);
        this.dropPiece(col);
      }
    }
    if (e instanceof TouchEvent && e.type === 'touchstart') {
      e.preventDefault();
      if (this.gameOver) {
        this.init();
        return;
      }
      if (this.currentPlayer !== 1) return;
      const rect = this.canvas.getBoundingClientRect();
      const touch = e.touches[0];
      const x = (touch.clientX - rect.left) * (this.width / rect.width);
      const bx = MARGIN;
      if (x >= bx && x < bx + COLS * CELL) {
        const col = Math.floor((x - bx) / CELL);
        this.dropPiece(col);
      }
    }
  }

  destroy() {
    this.stop();
  }
}
