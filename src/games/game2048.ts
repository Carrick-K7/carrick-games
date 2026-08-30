import { BaseGame, createDefaultGameHost, type GameHost, type GameShellSnapshot, getStoredRecord } from '../core/game.js';
import { getRetroPalette } from '../core/render.js';
import {
  FloatTexts,
  Particles,
  ScreenShake,
  Tween,
  drawVignette,
  fillBevelTile,
  fillGlassPanel,
  fx,
  shade,
} from '../core/fx.js';

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

  override getShellSnapshot(): GameShellSnapshot {
    return { score: this.score };
  }
  private gameState: 'idle' | 'playing' | 'gameover' | 'win' = 'idle';
  private hasWon = false;
  private touchStartX = 0;
  private touchStartY = 0;
  private readonly tileTweens = new Map<string, Tween>();
  private readonly particles = new Particles();
  private readonly floats = new FloatTexts();
  private readonly shake = new ScreenShake();

  constructor(host?: GameHost) {
    super(host ?? createDefaultGameHost('gameCanvas', W, H));
  }

  init() {
    this.grid = Array.from({ length: GRID }, () => Array(GRID).fill(null));
    this.score = 0;
    this.gameState = 'playing';
    this.hasWon = false;
    this.tileTweens.clear();
    this.particles.clear();
    this.floats.clear();
    this.shake.reset();
    this.resetScoreReport();
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
    this.tileTweens.set(`${r}:${c}`, new Tween({ from: 0.3, to: 1, duration: 0.16, ease: 'outBack' }));
  }

  private startGame() {
    this.gameState = 'playing';
  }

  private move(dir: Dir) {
    if (this.gameState === 'idle') this.startGame();
    if (this.gameState !== 'playing') return;
    this.tileTweens.clear();

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
      for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
          const tile = this.grid[r][c];
          if (!tile?.merged) continue;
          this.tileTweens.set(`${r}:${c}`, new Tween({ from: 1.28, to: 1, duration: 0.18, ease: 'outBack' }));
          const x = PADDING + c * (CELL + GAP) + CELL / 2;
          const y = PADDING + 40 + r * (CELL + GAP) + CELL / 2;
          const color = TILE_COLORS[tile.value] ?? DEFAULT_COLOR;
          for (const emit of fx.pop(x, y, [color.bg, '#ffffff'])) {
            if (!this.isDarkTheme()) emit.blend = 'source-over';
            emit.count = Math.min(emit.count, 7);
            this.particles.emit(emit);
          }
          this.floats.add(x, y - 10, `+${tile.value}`, { color: color.fg, size: 13, life: 0.65 });
          this.shake.add(0.06);
        }
      }
    }

    // Check win
    if (!this.hasWon) {
      for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
          if (this.grid[r][c]?.value === 2048) {
            this.hasWon = true;
            const palette = getRetroPalette(this.isDarkTheme());
            this.particles.emit(fx.confetti(W / 2, 12, [palette.primary, palette.cyan, palette.amber, palette.violet]));
          }
        }
      }
    }

    // Check game over
    if (moved && !this.canMove()) {
      this.gameState = 'gameover';
      this.shake.add(0.35);
      this.submitScoreOnce(this.score);
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
    this.particles.update(dt);
    this.floats.update(dt);
    this.shake.update(dt);
    for (const tween of this.tileTweens.values()) tween.update(dt);
  }

  draw(ctx: CanvasRenderingContext2D) {
    const isDark = this.isDarkTheme();
    const palette = getRetroPalette(isDark);
    const gridX = PADDING;
    const gridY = PADDING + 40;

    const background = ctx.createLinearGradient(0, 0, 0, H);
    background.addColorStop(0, palette.bg2);
    background.addColorStop(1, isDark ? palette.bg : '#faf8ef');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, W, H);

    this.shake.apply(ctx, () => {
      fillGlassPanel(ctx, gridX - 8, gridY - 8, GRID * CELL + (GRID - 1) * GAP + 16, GRID * CELL + (GRID - 1) * GAP + 16, 12, {
        fill: palette.panel,
        fill2: palette.panel2,
        border: palette.border,
        shadow: palette.shadow,
      });

      for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
          const x = gridX + c * (CELL + GAP);
          const y = gridY + r * (CELL + GAP);
          fillBevelTile(ctx, x, y, CELL, CELL, 7, isDark ? '#1e293b' : '#bbcdc0', {
            gloss: false,
            border: palette.border,
          });
        }
      }

      for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
          const tile = this.grid[r][c];
          if (!tile) continue;
          const baseX = gridX + c * (CELL + GAP);
          const baseY = gridY + r * (CELL + GAP);
          const scale = this.tileTweens.get(`${r}:${c}`)?.value ?? 1;
          const size = CELL * scale;
          const x = baseX + (CELL - size) / 2;
          const y = baseY + (CELL - size) / 2;
          const color = TILE_COLORS[tile.value] || DEFAULT_COLOR;
          fillBevelTile(ctx, x, y, size, size, 7 * scale, color.bg, {
            border: shade(color.bg, -0.35),
          });

          const fontSize = tile.value >= 1000 ? 14 : tile.value >= 100 ? 18 : 22;
          ctx.fillStyle = color.fg;
          ctx.font = `bold ${Math.max(11, fontSize * scale)}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(tile.value), baseX + CELL / 2, baseY + CELL / 2);
        }
      }
      this.particles.draw(ctx);
    });

    drawVignette(ctx, W, H, isDark ? 0.18 : 0.08);
    this.floats.draw(ctx);

    const zh = this.isZhLang();
    ctx.fillStyle = palette.text;
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`${zh ? '得分' : 'SCORE'} ${this.score}`, PADDING, 10);
    ctx.textAlign = 'right';
    ctx.fillText(`${zh ? '最高' : 'BEST'} ${this.getBest()}`, W - PADDING, 10);

    if (this.gameState === 'idle') {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#f8fafc';
      ctx.font = '24px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('2048', W / 2, H / 2 - 40);
      return;
    }

    if (this.gameState === 'playing' && this.hasWon) {
      this.drawResultOverlay(ctx, {
        title: zh ? '达成 2048！' : '2048 REACHED!',
        tone: 'success',
        details: [`${zh ? '得分' : 'SCORE'} ${this.score}`],
        hint: zh ? '点击或按空格继续' : 'CLICK OR PRESS SPACE TO CONTINUE',
      });
    }

    if (this.gameState === 'gameover') {
      this.drawResultOverlay(ctx, {
        title: zh ? '游戏结束' : 'GAME OVER',
        tone: 'danger',
        details: [`${zh ? '得分' : 'SCORE'} ${this.score}`],
        hint: zh ? '点击或按空格重新开始' : 'CLICK OR PRESS SPACE',
      });
    }
  }

  private getBest(): number {
    return getStoredRecord('2048') ?? this.score;
  }

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    if (this.gameState === 'gameover' && this.isRestartInput(e)) {
      if (e instanceof TouchEvent) e.preventDefault();
      this.init();
      return;
    }
    if (this.gameState === 'playing' && this.hasWon && this.isRestartInput(e)) {
      if (e instanceof TouchEvent) e.preventDefault();
      this.hasWon = false;
      return;
    }

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
            this.hasWon = false;
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
          this.hasWon = false;
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
          this.hasWon = false;
        }
      }
    }
  }
}
