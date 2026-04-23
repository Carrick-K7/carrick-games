import { BaseGame } from '../core/game.js';

interface Tile {
  id: number;
  char: string;
  col: number;
  row: number;
  removed: boolean;
  selected: boolean;
}

export class MahjongGame extends BaseGame {
  private tiles: Tile[] = [];
  private score = 0;
  private timeLeft = 60;
  private timerAccum = 0;
  private gameOver = false;
  private won = false;
  private gameStarted = false;
  private selectedId: number | null = null;
  private shakeId: number | null = null;
  private shakeTimer = 0;
  private matchedIds: number[] = [];
  private matchAnimTimer = 0;
  private scoreReported = false;
  private noMovesTimeout: ReturnType<typeof setTimeout> | null = null;

  private readonly cols = 6;
  private readonly rows = 4;
  private readonly tileW = 52;
  private readonly tileH = 76;
  private readonly gap = 6;
  private readonly startX: number;
  private readonly startY: number;

  constructor() {
    super('gameCanvas', 400, 500);
    const gridW = this.cols * this.tileW + (this.cols - 1) * this.gap;
    const gridH = this.rows * this.tileH + (this.rows - 1) * this.gap;
    this.startX = (this.width - gridW) / 2;
    this.startY = 64;
  }

  init() {
    this.score = 0;
    this.timeLeft = 60;
    this.timerAccum = 0;
    this.gameOver = false;
    this.won = false;
    this.gameStarted = true;
    this.selectedId = null;
    this.shakeId = null;
    this.shakeTimer = 0;
    this.matchedIds = [];
    this.matchAnimTimer = 0;
    this.scoreReported = false;
    this.noMovesTimeout = null;
    this.generateTiles();
    // Ensure solvable
    this.ensureSolvable();
  }

  private generateTiles() {
    const chars = [
      '\u{1F007}', '\u{1F008}', '\u{1F009}', '\u{1F00A}',
      '\u{1F00B}', '\u{1F00C}', '\u{1F00D}', '\u{1F00E}',
      '\u{1F00F}', '\u{1F010}', '\u{1F011}', '\u{1F012}',
    ];
    const deck: string[] = [];
    for (const c of chars) {
      deck.push(c, c);
    }
    // Shuffle
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    this.tiles = [];
    let idx = 0;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        this.tiles.push({
          id: idx,
          char: deck[idx],
          col: c,
          row: r,
          removed: false,
          selected: false,
        });
        idx++;
      }
    }
  }

  private ensureSolvable() {
    // Simple approach: keep shuffling until at least one valid move exists
    let attempts = 0;
    while (!this.hasAnyValidMove() && attempts < 200) {
      this.generateTiles();
      attempts++;
    }
  }

  private getTileAt(col: number, row: number): Tile | undefined {
    return this.tiles.find(t => !t.removed && t.col === col && t.row === row);
  }

  private isFree(tile: Tile): boolean {
    if (tile.removed) return false;
    const left = this.getTileAt(tile.col - 1, tile.row);
    const right = this.getTileAt(tile.col + 1, tile.row);
    // At least one side must be open (no tile on that side)
    return !left || !right;
  }

  private hasAnyValidMove(): boolean {
    const free = this.tiles.filter(t => !t.removed && this.isFree(t));
    const groups = new Map<string, Tile[]>();
    for (const t of free) {
      if (!groups.has(t.char)) groups.set(t.char, []);
      groups.get(t.char)!.push(t);
    }
    for (const [, arr] of groups) {
      if (arr.length >= 2) return true;
    }
    return false;
  }

  private checkNoMoves() {
    if (!this.hasAnyValidMove()) {
      this.gameOver = true;
      this.gameStarted = false;
      if (!this.scoreReported) {
        this.scoreReported = true;
        (window as any).reportScore?.(this.score);
      }
    }
  }

  update(dt: number) {
    if (this.gameOver || this.won || !this.gameStarted) return;

    this.timerAccum += dt;
    if (this.timerAccum >= 1) {
      this.timerAccum -= 1;
      this.timeLeft--;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.gameOver = true;
        this.gameStarted = false;
        if (!this.scoreReported) {
          this.scoreReported = true;
          (window as any).reportScore?.(this.score);
        }
      }
    }

    if (this.shakeTimer > 0) {
      this.shakeTimer -= dt;
      if (this.shakeTimer <= 0) {
        this.shakeTimer = 0;
        this.shakeId = null;
      }
    }

    if (this.matchAnimTimer > 0) {
      this.matchAnimTimer -= dt;
      if (this.matchAnimTimer <= 0) {
        this.matchAnimTimer = 0;
        this.matchedIds = [];
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const isDark = !document.documentElement.hasAttribute('data-theme') ||
      document.documentElement.getAttribute('data-theme') === 'dark';
    const zh = document.documentElement.getAttribute('data-lang') === 'zh';

    const bg = isDark ? '#0b0f19' : '#fafafa';
    const text = isDark ? '#e0e0e0' : '#1a1a2e';
    const accent = isDark ? '#39C5BB' : '#0d9488';
    const tileBg = isDark ? '#1e293b' : '#e2e8f0';
    const tileBorder = isDark ? '#334155' : '#cbd5e1';
    const tileShadow = isDark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.15)';
    const selectedBorder = accent;
    const disabledText = isDark ? '#64748b' : '#94a3b8';

    // Background
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.width, this.height);

    // HUD
    ctx.fillStyle = text;
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${zh ? '分数' : 'SCORE'} ${this.score}`, 16, 24);
    ctx.textAlign = 'right';
    ctx.fillText(`${zh ? '时间' : 'TIME'} ${this.timeLeft}`, this.width - 16, 24);
    ctx.textAlign = 'left';

    // Tiles
    for (const tile of this.tiles) {
      if (tile.removed) continue;
      const x = this.startX + tile.col * (this.tileW + this.gap);
      const y = this.startY + tile.row * (this.tileH + this.gap);
      this.drawTile(ctx, tile, x, y, tileBg, tileBorder, tileShadow, selectedBorder, disabledText, accent);
    }

    // Overlay
    if (this.won) {
      ctx.fillStyle = isDark ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.8)';
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.fillStyle = accent;
      ctx.font = '16px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(zh ? '通关!' : 'CLEARED!', this.width / 2, this.height / 2 - 24);
      ctx.fillStyle = text;
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.fillText(`${zh ? '最终得分' : 'FINAL SCORE'} ${this.score}`, this.width / 2, this.height / 2 + 8);
      ctx.fillText(zh ? '点击重新开始' : 'TAP TO RESTART', this.width / 2, this.height / 2 + 32);
      ctx.textAlign = 'left';
    } else if (this.gameOver) {
      ctx.fillStyle = isDark ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.8)';
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.fillStyle = '#ef4444';
      ctx.font = '16px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(zh ? '游戏结束' : 'GAME OVER', this.width / 2, this.height / 2 - 16);
      ctx.fillStyle = text;
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.fillText(`${zh ? '得分' : 'SCORE'} ${this.score}`, this.width / 2, this.height / 2 + 12);
      ctx.fillText(zh ? '点击重新开始' : 'TAP TO RESTART', this.width / 2, this.height / 2 + 32);
      ctx.textAlign = 'left';
    }
  }

  private drawTile(
    ctx: CanvasRenderingContext2D,
    tile: Tile,
    x: number,
    y: number,
    tileBg: string,
    tileBorder: string,
    tileShadow: string,
    selectedBorder: string,
    disabledText: string,
    accent: string,
  ) {
    const free = this.isFree(tile);
    const isMatched = this.matchedIds.includes(tile.id);
    const isShake = this.shakeId === tile.id;
    const shakeOffset = isShake ? Math.sin(this.shakeTimer * 40) * 3 : 0;
    const matchScale = isMatched ? 1 + Math.sin(this.matchAnimTimer * 15) * 0.15 : 1;

    const cx = x + this.tileW / 2 + shakeOffset;
    const cy = y + this.tileH / 2;
    const w = this.tileW * matchScale;
    const h = this.tileH * matchScale;
    const dx = cx - w / 2;
    const dy = cy - h / 2;

    // Shadow
    ctx.fillStyle = tileShadow;
    ctx.beginPath();
    ctx.roundRect(dx + 3, dy + 3, w, h, 6);
    ctx.fill();

    // Body
    ctx.fillStyle = tileBg;
    ctx.beginPath();
    ctx.roundRect(dx, dy, w, h, 6);
    ctx.fill();

    // Border
    ctx.lineWidth = tile.selected ? 3 : 2;
    ctx.strokeStyle = tile.selected ? selectedBorder : tileBorder;
    if (!free && !tile.selected) {
      ctx.strokeStyle = tileBorder;
    }
    ctx.beginPath();
    ctx.roundRect(dx, dy, w, h, 6);
    ctx.stroke();

    // Highlight for free tiles
    if (free && !tile.selected && !isMatched) {
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(dx, dy, w, h, 6);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Character
    ctx.fillStyle = free ? (this.isDark() ? '#e0e0e0' : '#1a1a2e') : disabledText;
    ctx.font = `28px "Press Start 2P", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tile.char, cx, cy + 2);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
  }

  private isDark(): boolean {
    return !document.documentElement.hasAttribute('data-theme') ||
      document.documentElement.getAttribute('data-theme') === 'dark';
  }

  private onTileClick(px: number, py: number) {
    if (this.gameOver || this.won) {
      this.init();
      return;
    }
    if (!this.gameStarted) return;

    for (const tile of this.tiles) {
      if (tile.removed) continue;
      const x = this.startX + tile.col * (this.tileW + this.gap);
      const y = this.startY + tile.row * (this.tileH + this.gap);
      if (px >= x && px <= x + this.tileW && py >= y && py <= y + this.tileH) {
        this.handleTileSelect(tile);
        return;
      }
    }
  }

  private handleTileSelect(tile: Tile) {
    if (tile.removed) return;
    if (!this.isFree(tile)) {
      this.shakeId = tile.id;
      this.shakeTimer = 0.3;
      return;
    }

    if (this.selectedId === null) {
      tile.selected = true;
      this.selectedId = tile.id;
      return;
    }

    if (this.selectedId === tile.id) {
      tile.selected = false;
      this.selectedId = null;
      return;
    }

    const other = this.tiles.find(t => t.id === this.selectedId);
    if (!other) return;

    if (other.char === tile.char && this.isFree(other)) {
      // Match!
      other.removed = true;
      tile.removed = true;
      other.selected = false;
      this.selectedId = null;
      this.score += 10;
      this.matchedIds = [other.id, tile.id];
      this.matchAnimTimer = 0.25;

      // Check win
      const remaining = this.tiles.filter(t => !t.removed).length;
      if (remaining === 0) {
        this.won = true;
        this.gameStarted = false;
        this.score += this.timeLeft; // time bonus
        if (!this.scoreReported) {
          this.scoreReported = true;
          (window as any).reportScore?.(this.score);
        }
      } else {
        // Check no moves after a short delay (let anim finish)
        this.noMovesTimeout = setTimeout(() => this.checkNoMoves(), 300);
      }
    } else {
      // Mismatch
      other.selected = false;
      tile.selected = true;
      this.selectedId = tile.id;
      this.shakeId = tile.id;
      this.shakeTimer = 0.2;
    }
  }

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    if (e instanceof KeyboardEvent) {
      if (e.key === ' ' || e.key === 'Enter') {
        if (this.gameOver || this.won) {
          this.init();
        }
      }
    }
    if (e instanceof MouseEvent) {
      if (e.type === 'mousedown') {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        this.onTileClick(x, y);
      }
    }
    if (e instanceof TouchEvent) {
      e.preventDefault();
      if (e.type === 'touchstart') {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const touch = e.touches[0];
        const x = (touch.clientX - rect.left) * scaleX;
        const y = (touch.clientY - rect.top) * scaleY;
        this.onTileClick(x, y);
      }
    }
  }

  destroy() {
    this.stop();
    if (this.noMovesTimeout !== null) {
      clearTimeout(this.noMovesTimeout);
      this.noMovesTimeout = null;
    }
  }
}
