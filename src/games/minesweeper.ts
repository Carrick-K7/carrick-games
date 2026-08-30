import { BaseGame, createDefaultGameHost, type GameHost, type GameShellSnapshot } from '../core/game.js';
import { getRetroPalette } from '../core/render.js';
import {
  FloatTexts,
  Particles,
  ScreenShake,
  drawGlow,
  drawVignette,
  fillBevelTile,
  fillGlassPanel,
  fillSphere,
  fx,
} from '../core/fx.js';

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
  private minesPlaced = false;
  private touchTimer: number | null = null;
  private readonly particles = new Particles();
  private readonly floats = new FloatTexts();
  private readonly shake = new ScreenShake();

  constructor(host?: GameHost) {
    super(host ?? createDefaultGameHost('gameCanvas', CELL * COLS + 4, CELL * ROWS + 52));
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
    this.flagsLeft = MINES;
    this.timer = 0;
    this.minesPlaced = false;
    this.gameState = 'idle';
    this.cursorX = Math.floor(COLS / 2);
    this.cursorY = Math.floor(ROWS / 2);
    this.particles.clear();
    this.floats.clear();
    this.shake.reset();
    this.resetScoreReport();
  }

  private placeMines(safeX: number, safeY: number) {
    let placed = 0;
    while (placed < MINES) {
      const x = Math.floor(Math.random() * COLS);
      const y = Math.floor(Math.random() * ROWS);
      const inSafeArea = Math.abs(x - safeX) <= 1 && Math.abs(y - safeY) <= 1;
      if (!inSafeArea && this.grid[y][x] !== -1) {
        this.grid[y][x] = -1;
        placed++;
      }
    }
    this.computeNumbers();
    this.minesPlaced = true;
  }

  private beginAt(x: number, y: number) {
    if (!this.minesPlaced) this.placeMines(x, y);
    if (this.gameState === 'idle') {
      this.timer = 0;
      this.gameState = 'playing';
    }
  }

  private toggleFlag(x: number, y: number) {
    if (this.revealed[y][x]) return;
    if (!this.flagged[y][x] && this.flagsLeft === 0) return;
    this.flagged[y][x] = !this.flagged[y][x];
    this.flagsLeft += this.flagged[y][x] ? -1 : 1;
    if (this.flagged[y][x]) {
      const palette = getRetroPalette(this.isDarkTheme());
      for (const emit of fx.pop(2 + x * CELL + CELL / 2, 50 + y * CELL + CELL / 2, [palette.red, palette.amber])) {
        emit.count = Math.min(emit.count, 5);
        if (!this.isDarkTheme()) emit.blend = 'source-over';
        this.particles.emit(emit);
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
      const palette = getRetroPalette(this.isDarkTheme());
      const cx = 2 + x * CELL + CELL / 2;
      const cy = 50 + y * CELL + CELL / 2;
      for (const emit of fx.explosion(cx, cy, [palette.red, palette.orange, palette.amber])) {
        if (!this.isDarkTheme()) emit.blend = 'source-over';
        this.particles.emit(emit);
      }
      this.shake.add(0.65);
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
    if (unrevealedSafe === 0 && this.gameState !== 'won') {
      this.gameState = 'won';
      const palette = getRetroPalette(this.isDarkTheme());
      this.particles.emit(fx.confetti(this.width / 2, 14, [palette.primary, palette.cyan, palette.amber, palette.violet]));
    }
  }

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    const isKeyDown = e instanceof KeyboardEvent && e.type === 'keydown';

    if ((this.gameState === 'won' || this.gameState === 'lost') && this.isRestartInput(e)) {
      if (e instanceof TouchEvent) e.preventDefault();
      this.init();
      return;
    }

    if (isKeyDown && e.key === 'r') {
      this.init();
      return;
    }

    if (this.gameState === 'won' || this.gameState === 'lost') {
      if (isKeyDown && (e.key === ' ' || e.key === 'Enter')) {
        this.init();
      } else if (
        (e instanceof MouseEvent && e.type === 'mousedown')
        || (e instanceof TouchEvent && e.type === 'touchstart')
      ) {
        if (e instanceof TouchEvent) e.preventDefault();
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
        this.beginAt(this.cursorX, this.cursorY);
        if (this.gameState === 'playing') this.revealCell(this.cursorX, this.cursorY);
      }
      if (e.key === 'f' || e.key === 'x') {
        this.toggleFlag(this.cursorX, this.cursorY);
      }
      return;
    }

    // Touch / mouse
    const touchEvent = e as TouchEvent;
    const mouseEvent = e as MouseEvent;

    const getCell = (clientX: number, clientY: number): { x: number; y: number } | null => {
      const { x: tx, y: ty } = this.canvasPoint(clientX, clientY);
      const cellX = Math.floor((tx - 2) / CELL);
      const cellY = Math.floor((ty - 50) / CELL);
      if (cellX >= 0 && cellX < COLS && cellY >= 0 && cellY < ROWS) return { x: cellX, y: cellY };
      return null;
    };

    if (touchEvent.type === 'touchstart') {
      e.preventDefault();
      const t = touchEvent.touches[0];
      if (!t) return;
      const cell = getCell(t.clientX, t.clientY);
      if (!cell) return;
      this.touchTimer = this.setManagedTimeout(() => {
        // Long press = flag
        this.toggleFlag(cell.x, cell.y);
        this.touchTimer = null;
      }, 300);
      return;
    }

    if (touchEvent.type === 'touchend') {
      e.preventDefault();
      if (this.touchTimer !== null) {
        this.clearManagedTimeout(this.touchTimer);
        this.touchTimer = null;
        const t = touchEvent.changedTouches[0];
        if (!t) return;
        const cell = getCell(t.clientX, t.clientY);
        if (cell) {
          this.beginAt(cell.x, cell.y);
          this.revealCell(cell.x, cell.y);
          this.cursorX = cell.x;
          this.cursorY = cell.y;
        }
      }
      return;
    }

    if (touchEvent.type === 'touchmove') {
      e.preventDefault();
      if (this.touchTimer !== null) {
        this.clearManagedTimeout(this.touchTimer);
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
        this.beginAt(cell.x, cell.y);
        this.revealCell(cell.x, cell.y);
        this.cursorX = cell.x;
        this.cursorY = cell.y;
      }
    }
  }

  update(dt: number) {
    this.particles.update(dt);
    this.floats.update(dt);
    this.shake.update(dt);
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
    const lang = this.isZhLang();
    const isDark = this.isDarkTheme();

    const palette = getRetroPalette(isDark);
    const background = ctx.createLinearGradient(0, 0, 0, h);
    background.addColorStop(0, palette.bg2);
    background.addColorStop(1, palette.bg);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);

    fillGlassPanel(ctx, 4, 4, w - 8, 42, 9, {
      fill: palette.panel,
      fill2: palette.panel2,
      border: palette.border,
      glow: palette.primary,
      shadow: palette.shadow,
    });

    // Border
    ctx.strokeStyle = palette.primary;
    ctx.lineWidth = 1;
    ctx.strokeRect(1, 1, w - 2, h - 2);

    // Timer
    const secs = Math.floor(this.gameState === 'idle' ? 0 : this.timer);
    const padded = (n: number) => String(n).padStart(3, '0');
    ctx.fillStyle = palette.primary;
    ctx.font = "bold 24px system-ui, sans-serif";
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
    ctx.save();
    ctx.translate(this.shake.x, this.shake.y);
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const px = 2 + x * CELL;
        const py = 50 + y * CELL;
        const isRevealed = this.revealed[y][x];
        const isFlagged = this.flagged[y][x];
        const isMine = this.grid[y][x] === -1;
        const isCursor = x === this.cursorX && y === this.cursorY;

        // Raised unopened cells and recessed revealed cells make state readable at a glance.
        if (isRevealed) {
          ctx.fillStyle = isDark ? '#151c28' : '#e5e7eb';
          ctx.fillRect(px, py, CELL - 1, CELL - 1);
        } else {
          const cellColor = isCursor ? palette.panel2 : (isDark ? '#243244' : '#f3f4f6');
          fillBevelTile(ctx, px, py, CELL - 1, CELL - 1, 4, cellColor, {
            border: isCursor ? palette.primary : palette.border,
          });
        }

        if (!isRevealed && !isFlagged) {
          // Unrevealed - border
          ctx.strokeStyle = isCursor ? '#39C5BB' : (isDark ? '#2a2a3a' : '#d1d5db');
          ctx.lineWidth = isCursor ? 2 : 1;
          ctx.strokeRect(px + 0.5, py + 0.5, CELL - 2, CELL - 2);
        }

        if (isRevealed) {
          if (isMine) {
            drawGlow(ctx, px + CELL / 2, py + CELL / 2, CELL * 0.65, palette.red, isDark ? 0.36 : 0.12);
            fillSphere(ctx, px + CELL / 2, py + CELL / 2, CELL / 3, palette.red, { rim: 0.35, rimColor: palette.orange });
          } else if (this.grid[y][x] > 0) {
            const colors = ['', '#39C5BB', '#4ade80', '#f97316', '#a855f7', '#ef4444', '#06b6d4', '#1a1a2e', '#6b7280'];
            ctx.fillStyle = colors[this.grid[y][x]] || '#fff';
            ctx.font = "bold 22px system-ui, sans-serif";
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
      drawGlow(ctx, px + CELL / 2, py + CELL / 2, CELL * 0.7, palette.primary, isDark ? 0.2 : 0.08);
      ctx.strokeStyle = palette.primary;
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 1, py + 1, CELL - 3, CELL - 3);
    }
    this.particles.draw(ctx);
    ctx.restore();

    drawVignette(ctx, w, h, isDark ? 0.16 : 0.07);
    this.floats.draw(ctx);

    // Overlay messages
    if (this.gameState === 'won') {
      this.drawResultOverlay(ctx, {
        title: lang ? '你赢了！' : 'YOU WIN!',
        tone: 'success',
        details: [`${lang ? '用时' : 'TIME'} ${Math.floor(this.timer)}s`],
        hint: lang ? '点击、R 或空格重新开始' : 'CLICK, R OR SPACE TO RESTART',
      });
    } else if (this.gameState === 'lost') {
      this.drawResultOverlay(ctx, {
        title: lang ? '游戏结束' : 'GAME OVER',
        tone: 'danger',
        details: [`${lang ? '用时' : 'TIME'} ${Math.floor(this.timer)}s`],
        hint: lang ? '点击、R 或空格重新开始' : 'CLICK, R OR SPACE TO RESTART',
      });
    }
  }
}
