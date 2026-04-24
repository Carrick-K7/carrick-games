import { BaseGame } from '../core/game.js';

const COLS = 9;
const ROWS = 9;
const MINES = 10;
const CELL = 36;

export class MinesweeperGame extends BaseGame {
  private grid: number[][] = []; // -1=mine, 0-8=adjacent count
  private revealed: boolean[][] = [];
  private flagged: boolean[][] = [];
  private gameState: 'idle' | 'playing' | 'won' | 'lost' = 'idle';
  private cursorX = Math.floor(COLS / 2);
  private cursorY = Math.floor(ROWS / 2);
  private flagsLeft = MINES;
  private timer = 0;
  private gameStart = 0;
  private touchTimer: number | null = null;
  private touchStartX = 0;
  private touchStartY = 0;

  constructor() {
    super('gameCanvas', CELL * COLS + 4, CELL * ROWS + 52);
  }

  init() {
    this.grid = [];
    this.revealed = [];
    this.flagged = [];
    for (let y = 0; y < ROWS; y++) {
      this.grid[y] = [];
      this.revealed[y] = [];
      this.flagged[y] = [];
      for (let x = 0; x < COLS; x++) {
        this.grid[y][x] = 0;
        this.revealed[y][x] = false;
        this.flagged[y][x] = false;
      }
    }
    this.placeMines();
    this.computeNumbers();
    this.flagsLeft = MINES;
    this.timer = 0;
    this.gameState = 'idle';
    this.cursorX = Math.floor(COLS / 2);
    this.cursorY = Math.floor(ROWS / 2);
    this.resetScoreReport();
  }

  private placeMines() {
    let placed = 0;
    while (placed < MINES) {
      const x = Math.floor(Math.random() * COLS);
      const y = Math.floor(Math.random() * ROWS);
      if (this.grid[y][x] !== -1) {
        this.grid[y][x] = -1;
        placed++;
      }
    }
  }

  private computeNumbers() {
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (this.grid[y][x] === -1) continue;
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny >= 0 && ny < ROWS && nx >= 0 && nx < COLS && this.grid[ny][nx] === -1) count++;
          }
        }
        this.grid[y][x] = count;
      }
    }
  }

  private revealCell(x: number, y: number) {
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return;
    if (this.revealed[y][x] || this.flagged[y][x]) return;
    this.revealed[y][x] = true;
    if (this.grid[y][x] === -1) {
      this.gameState = 'lost';
      return;
    }
    if (this.grid[y][x] === 0) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          this.revealCell(x + dx, y + dy);
        }
      }
    }
    this.checkWin();
  }

  private checkWin() {
    let unrevealedSafe = 0;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (!this.revealed[y][x] && this.grid[y][x] !== -1) unrevealedSafe++;
      }
    }
    if (unrevealedSafe === 0) this.gameState = 'won';
  }

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    const isKeyDown = e instanceof KeyboardEvent && e.type === 'keydown';
    const isKeyUp = e instanceof KeyboardEvent && e.type === 'keyup';

    if (isKeyDown && e.key === 'r') {
      this.init();
      return;
    }

    if (this.gameState === 'won' || this.gameState === 'lost') {
      if (isKeyDown && (e.key === ' ' || e.key === 'Enter')) {
        this.init();
      }
      return;
    }

    // Keyboard navigation
    if (isKeyDown) {
      if (e.key === 'ArrowLeft' || e.key === 'a') this.cursorX = Math.max(0, this.cursorX - 1);
      if (e.key === 'ArrowRight' || e.key === 'd') this.cursorX = Math.min(COLS - 1, this.cursorX + 1);
      if (e.key === 'ArrowUp' || e.key === 'w') this.cursorY = Math.max(0, this.cursorY - 1);
      if (e.key === 'ArrowDown' || e.key === 's') this.cursorY = Math.min(ROWS - 1, this.cursorY + 1);
      if (e.key === ' ' || e.key === 'Enter') {
        if (this.gameState === 'idle') this.gameState = 'playing';
        if (this.gameState === 'playing') this.revealCell(this.cursorX, this.cursorY);
        this.timer = 0;
        this.gameStart = performance.now();
      }
      if (e.key === 'f' || e.key === 'x') {
        if (!this.revealed[this.cursorY][this.cursorX]) {
          this.flagged[this.cursorY][this.cursorX] = !this.flagged[this.cursorY][this.cursorX];
          this.flagsLeft += this.flagged[this.cursorY][this.cursorX] ? -1 : 1;
        }
      }
      return;
    }

    // Touch / mouse
    const touchEvent = e as TouchEvent;
    const mouseEvent = e as MouseEvent;

    const getCell = (clientX: number, clientY: number): { x: number; y: number } | null => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.width / rect.width;
      const scaleY = this.height / rect.height;
      const tx = (clientX - rect.left) * scaleX;
      const ty = (clientY - rect.top) * scaleY;
      const cellX = Math.floor((tx - 2) / CELL);
      const cellY = Math.floor((ty - 50) / CELL);
      if (cellX >= 0 && cellX < COLS && cellY >= 0 && cellY < ROWS) return { x: cellX, y: cellY };
      return null;
    };

    if (touchEvent.type === 'touchstart') {
      e.preventDefault();
      const t = touchEvent.touches[0];
      const cell = getCell(t.clientX, t.clientY);
      if (!cell) return;
      this.touchStartX = t.clientX;
      this.touchStartY = t.clientY;
      this.touchTimer = window.setTimeout(() => {
        // Long press = flag
        if (this.gameState === 'idle') this.gameState = 'playing';
        this.flagged[cell.y][cell.x] = !this.flagged[cell.y][cell.x];
        this.flagsLeft += this.flagged[cell.y][cell.x] ? -1 : 1;
        this.touchTimer = null;
      }, 300);
      return;
    }

    if (touchEvent.type === 'touchend') {
      e.preventDefault();
      if (this.touchTimer !== null) {
        clearTimeout(this.touchTimer);
        this.touchTimer = null;
        const t = touchEvent.changedTouches[0];
        const cell = getCell(t.clientX, t.clientY);
        if (cell) {
          if (this.gameState === 'idle') this.gameState = 'playing';
          this.revealCell(cell.x, cell.y);
          this.cursorX = cell.x;
          this.cursorY = cell.y;
          this.timer = 0;
          this.gameStart = performance.now();
        }
      }
      return;
    }

    if (touchEvent.type === 'touchmove') {
      e.preventDefault();
      if (this.touchTimer !== null) {
        clearTimeout(this.touchTimer);
        this.touchTimer = null;
      }
      return;
    }

    if (mouseEvent.type === 'mousedown') {
      const cell = getCell(mouseEvent.clientX, mouseEvent.clientY);
      if (cell) {
        this.cursorX = cell.x;
        this.cursorY = cell.y;
      }
      return;
    }

    if (mouseEvent.type === 'mouseup') {
      const cell = getCell(mouseEvent.clientX, mouseEvent.clientY);
      if (cell) {
        if (this.gameState === 'idle') this.gameState = 'playing';
        this.revealCell(cell.x, cell.y);
        this.cursorX = cell.x;
        this.cursorY = cell.y;
        this.timer = 0;
        this.gameStart = performance.now();
      }
    }
  }

  update(dt: number) {
    if (this.gameState === 'playing') {
      this.timer += dt;
    }
    if (this.gameState === 'won' || this.gameState === 'lost') {
      this.submitScoreOnce(this.gameState === 'won' ? Math.max(0, Math.floor(10000 - this.timer * 10)) : 0);
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const w = this.width;
    const h = this.height;
    const lang = document.documentElement.getAttribute('data-lang') === 'zh';
    const isDark = this.isDarkTheme();

    // Background
    ctx.fillStyle = isDark ? '#0b0f19' : '#fafafa';
    ctx.fillRect(0, 0, w, h);

    // Header bg
    ctx.fillStyle = isDark ? '#12121a' : '#e5e7eb';
    ctx.fillRect(0, 0, w, 48);

    // Border
    ctx.strokeStyle = '#39C5BB';
    ctx.lineWidth = 1;
    ctx.strokeRect(1, 1, w - 2, h - 2);

    // Timer
    const secs = Math.floor(this.gameState === 'idle' ? 0 : this.timer);
    const padded = (n: number) => String(n).padStart(3, '0');
    ctx.fillStyle = '#39C5BB';
    ctx.font = "bold 20px 'Press Start 2P', monospace";
    ctx.textAlign = 'center';
    ctx.fillText(padded(secs), w / 2, 32);

    // Flags left
    ctx.textAlign = 'left';
    ctx.fillText(`🚩${this.flagsLeft}`, 8, 32);

    // Face indicator
    ctx.textAlign = 'right';
    let face = '😐';
    if (this.gameState === 'won') face = '😎';
    else if (this.gameState === 'lost') face = '😵';
    ctx.fillText(face, w - 8, 32);

    // Grid
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const px = 2 + x * CELL;
        const py = 50 + y * CELL;
        const isRevealed = this.revealed[y][x];
        const isFlagged = this.flagged[y][x];
        const isMine = this.grid[y][x] === -1;
        const isCursor = x === this.cursorX && y === this.cursorY;

        // Cell background
        if (isRevealed) {
          ctx.fillStyle = isDark ? '#1a1a24' : '#e5e7eb';
        } else {
          ctx.fillStyle = isCursor ? (isDark ? '#2a2a3a' : '#d1d5db') : (isDark ? '#1e1e2a' : '#f3f4f6');
        }
        ctx.fillRect(px, py, CELL - 1, CELL - 1);

        if (!isRevealed && !isFlagged) {
          // Unrevealed - border
          ctx.strokeStyle = isCursor ? '#39C5BB' : (isDark ? '#2a2a3a' : '#d1d5db');
          ctx.lineWidth = isCursor ? 2 : 1;
          ctx.strokeRect(px + 0.5, py + 0.5, CELL - 2, CELL - 2);
        }

        if (isRevealed) {
          if (isMine) {
            // Draw mine
            ctx.fillStyle = '#ff4444';
            ctx.beginPath();
            ctx.arc(px + CELL / 2, py + CELL / 2, CELL / 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ff8888';
            ctx.beginPath();
            ctx.arc(px + CELL / 2 - 3, py + CELL / 2 - 3, 3, 0, Math.PI * 2);
            ctx.fill();
          } else if (this.grid[y][x] > 0) {
            const colors = ['', '#39C5BB', '#4ade80', '#f97316', '#a855f7', '#ef4444', '#06b6d4', '#1a1a2e', '#6b7280'];
            ctx.fillStyle = colors[this.grid[y][x]] || '#fff';
            ctx.font = "bold 16px 'Press Start 2P', monospace";
            ctx.textAlign = 'center';
            ctx.fillText(String(this.grid[y][x]), px + CELL / 2, py + CELL / 2 + 6);
          }
        }

        if (isFlagged && !isRevealed) {
          ctx.font = '14px serif';
          ctx.textAlign = 'center';
          ctx.fillText('🚩', px + CELL / 2, py + CELL / 2 + 5);
        }
      }
    }

    // Cursor border
    {
      const px = 2 + this.cursorX * CELL;
      const py = 50 + this.cursorY * CELL;
      ctx.strokeStyle = '#39C5BB';
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 1, py + 1, CELL - 3, CELL - 3);
    }

    // Overlay messages
    if (this.gameState === 'won') {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#39C5BB';
      ctx.font = "16px 'Press Start 2P', monospace";
      ctx.textAlign = 'center';
      ctx.fillText(lang ? '🎉 你赢了!' : '🎉 YOU WIN!', w / 2, h / 2 - 10);
      ctx.font = "10px 'Press Start 2P', monospace";
      ctx.fillText(lang ? '按 R 或空格重新开始' : 'Press R or Space to restart', w / 2, h / 2 + 20);
    } else if (this.gameState === 'lost') {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ef4444';
      ctx.font = "16px 'Press Start 2P', monospace";
      ctx.textAlign = 'center';
      ctx.fillText(lang ? '💥 游戏结束' : '💥 GAME OVER', w / 2, h / 2 - 10);
      ctx.font = "10px 'Press Start 2P', monospace";
      ctx.fillText(lang ? '按 R 或空格重新开始' : 'Press R or Space to restart', w / 2, h / 2 + 20);
    } else if (this.gameState === 'idle') {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#39C5BB';
      ctx.font = "10px 'Press Start 2P', monospace";
      ctx.textAlign = 'center';
      ctx.fillText(lang ? '← → ↑ ↓ 移动 | 空格 翻开 | F 标记' : '← → ↑ ↓ Move | Space Reveal | F Flag', w / 2, h / 2);
    }
  }
}
