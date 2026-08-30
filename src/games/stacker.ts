import { BaseGame, createDefaultGameHost, type GameHost, type GameShellSnapshot, getStoredRecord } from '../core/game.js';
import { getRetroPalette } from '../core/render.js';
import {
  FloatTexts,
  Particles,
  ScreenShake,
  drawGlow,
  drawVignette,
  fillBevelTile,
  fx,
  shade,
} from '../core/fx.js';

const COLS = 7;
const ROWS = 16;
const START_WIDTH = 3;

type GameState = 'idle' | 'playing' | 'gameover' | 'win';

interface LockedBlock {
  row: number;
  x: number;
  width: number;
}

export class StackerGame extends BaseGame {
  private state: GameState = 'idle';
  private score = 0;

  override getShellSnapshot(): GameShellSnapshot {
    return { score: this.score };
  }
  private blocks: LockedBlock[] = [];
  private currentRow = ROWS - 1;
  private currentX = 0;
  private currentWidth = START_WIDTH;
  private direction = 1;
  private speed = 0;
  private highScore = 0;
  private lockGlow = 0;
  private readonly particles = new Particles();
  private readonly floats = new FloatTexts();
  private readonly shake = new ScreenShake();

  constructor(host?: GameHost) {
    super(host ?? createDefaultGameHost('gameCanvas', 320, 480));
  }

  protected override onStart() {
    this.startGame();
  }

  init() {
    this.state = 'idle';
    this.score = 0;
    this.blocks = [];
    this.currentRow = ROWS - 1;
    this.currentX = 0;
    this.currentWidth = START_WIDTH;
    this.direction = 1;
    this.speed = this.getSpeed();
    this.lockGlow = 0;
    this.particles.clear();
    this.floats.clear();
    this.shake.reset();
    this.loadHighScore();
    this.resetScoreReport();
  }

  private getSpeed(): number {
    const progress = (ROWS - 1) - this.currentRow;
    return 2.5 + progress * 0.25;
  }

  private loadHighScore() {
    this.highScore = getStoredRecord('stacker') ?? 0;
  }

  update(dt: number) {
    this.particles.update(dt);
    this.floats.update(dt);
    this.shake.update(dt);
    this.lockGlow = Math.max(0, this.lockGlow - dt * 3.5);
    if (this.state !== 'playing') return;

    this.currentX += this.direction * this.speed * dt;

    if (this.currentX <= 0) {
      this.currentX = 0;
      this.direction = 1;
    } else if (this.currentX + this.currentWidth >= COLS) {
      this.currentX = COLS - this.currentWidth;
      this.direction = -1;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const isDark = this.isDarkTheme();
    const zh = this.isZhLang();
    const palette = getRetroPalette(isDark);
    const cellW = this.width / COLS;
    const cellH = this.height / ROWS;

    const bg = ctx.createLinearGradient(0, 0, 0, this.height);
    bg.addColorStop(0, palette.bg2);
    bg.addColorStop(1, palette.bg);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = 1;
    for (let c = 0; c <= COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * cellW, 0);
      ctx.lineTo(c * cellW, this.height);
      ctx.stroke();
    }
    for (let r = 0; r <= ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * cellH);
      ctx.lineTo(this.width, r * cellH);
      ctx.stroke();
    }

    this.shake.apply(ctx, () => {
      for (let i = 0; i < this.blocks.length; i++) {
        const block = this.blocks[i];
        const x = block.x * cellW;
        const y = block.row * cellH;
        const w = block.width * cellW;
        const color = shade(i % 2 === 0 ? palette.primary : palette.cyan, (ROWS - block.row) * 0.012);
        if (i === this.blocks.length - 1 && this.lockGlow > 0) {
          drawGlow(ctx, x + w / 2, y + cellH / 2, 36 + this.lockGlow * 12, color, this.lockGlow * 0.7);
        }
        fillBevelTile(ctx, x + 1, y + 1, w - 2, cellH - 2, 4, color, { border: palette.border });
      }

      if (this.state === 'playing') {
        const x = this.currentX * cellW;
        const y = this.currentRow * cellH;
        const w = this.currentWidth * cellW;
        drawGlow(ctx, x + w / 2, y + cellH / 2, 30, palette.amber, isDark ? 0.18 : 0.08);
        fillBevelTile(ctx, x + 1, y + 1, w - 2, cellH - 2, 4, palette.amber, { border: palette.orange });
      }

      this.particles.draw(ctx);
    });

    drawVignette(ctx, this.width, this.height, isDark ? 0.22 : 0.1);
    this.floats.draw(ctx);

    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle = palette.text;
    ctx.fillText(`${zh ? '得分' : 'SCORE'} ${this.score}`, this.width - 10, 10);

    if (this.state === 'idle') {
      ctx.font = '24px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = palette.text;
      ctx.fillText(zh ? '堆叠方块' : 'STACKER', this.width / 2, this.height / 2 - 30);
    }

    if (this.state === 'gameover' || this.state === 'win') {
      const title = this.state === 'win' ? (zh ? '胜利!' : 'WIN!') : (zh ? '游戏结束' : 'GAME OVER');
      const scoreText = zh ? `得分: ${this.score}` : `SCORE: ${this.score}`;
      const hsText = zh ? `最高: ${this.highScore}` : `HIGH: ${this.highScore}`;
      this.drawResultOverlay(ctx, {
        title,
        tone: this.state === 'win' ? 'success' : 'danger',
        details: [scoreText, hsText],
        hint: zh ? '点击或按空格重新开始' : 'CLICK OR PRESS SPACE',
      });
    }
  }

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    if ((this.state === 'gameover' || this.state === 'win') && this.isRestartInput(e)) {
      if (e instanceof TouchEvent) e.preventDefault();
      this.init();
      this.startGame();
      return;
    }

    if (e instanceof KeyboardEvent) {
      if (e.type === 'keydown') {
        this.onAction();
      }
      return;
    }

    if (e instanceof TouchEvent) {
      e.preventDefault();
      if (e.type === 'touchstart') {
        this.onAction();
      }
      return;
    }

    if (e instanceof MouseEvent) {
      if (e.type === 'mousedown') {
        this.onAction();
      }
      return;
    }
  }

  private onAction() {
    if (this.state === 'idle') {
      this.startGame();
    } else if (this.state === 'playing') {
      this.lockBlock();
    } else if (this.state === 'gameover' || this.state === 'win') {
      this.init();
      this.startGame();
    }
  }

  private startGame() {
    this.state = 'playing';
    this.score = 0;
    this.blocks = [];
    this.currentRow = ROWS - 1;
    this.currentX = 0;
    this.currentWidth = START_WIDTH;
    this.direction = 1;
    this.speed = this.getSpeed();
  }

  private lockBlock() {
    let perfect = this.currentRow === ROWS - 1;
    if (this.currentRow < ROWS - 1) {
      const below = this.blocks.find(b => b.row === this.currentRow + 1);
      if (below) {
        perfect = Math.abs(this.currentX - below.x) < 0.08 && Math.abs(this.currentWidth - below.width) < 0.08;
        const left = Math.max(this.currentX, below.x);
        const right = Math.min(this.currentX + this.currentWidth, below.x + below.width);
        const overlap = right - left;

        if (overlap <= 0) {
          this.endGame();
          return;
        }

        this.currentX = left;
        this.currentWidth = overlap;
      }
    }

    this.blocks.push({
      row: this.currentRow,
      x: this.currentX,
      width: this.currentWidth,
    });

    const cellW = this.width / COLS;
    const cellH = this.height / ROWS;
    const cx = (this.currentX + this.currentWidth / 2) * cellW;
    const cy = (this.currentRow + 0.5) * cellH;
    const palette = getRetroPalette(this.isDarkTheme());
    for (const emit of fx.pop(cx, cy, [palette.primary, palette.cyan, '#ffffff'])) {
      if (!this.isDarkTheme()) emit.blend = 'source-over';
      this.particles.emit(emit);
    }
    this.lockGlow = 1;
    this.shake.add(0.05);
    if (perfect && this.blocks.length > 1) {
      this.floats.add(cx, cy - 6, this.isZhLang() ? '完美！' : 'PERFECT!', {
        color: palette.amber,
        size: 14,
        life: 0.9,
      });
    }

    this.score++;
    this.currentRow--;

    if (this.currentRow < 0) {
      this.state = 'win';
      this.particles.emit(fx.confetti(this.width / 2, 12, [palette.primary, palette.cyan, palette.amber, palette.violet]));
      this.saveScore();
      return;
    }

    this.speed = this.getSpeed();
  }

  private endGame() {
    this.state = 'gameover';
    const cellW = this.width / COLS;
    const cellH = this.height / ROWS;
    const cx = (this.currentX + this.currentWidth / 2) * cellW;
    const cy = (this.currentRow + 0.5) * cellH;
    const palette = getRetroPalette(this.isDarkTheme());
    for (const emit of fx.explosion(cx, cy, [palette.red, palette.orange, palette.amber])) {
      if (!this.isDarkTheme()) emit.blend = 'source-over';
      this.particles.emit(emit);
    }
    this.shake.add(0.6);
    this.saveScore();
  }

  private saveScore() {
    if (this.score > this.highScore) {
      this.highScore = this.score;
    }
    this.submitScoreOnce(this.score);
  }

  destroy() {
    super.destroy();
  }
}
