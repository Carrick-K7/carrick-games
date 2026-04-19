import { BaseGame } from '../core/game.js';

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
  private blocks: LockedBlock[] = [];
  private currentRow = ROWS - 1;
  private currentX = 0;
  private currentWidth = START_WIDTH;
  private direction = 1;
  private speed = 0;
  private highScore = 0;

  constructor() {
    super('gameCanvas', 320, 480);
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
    this.loadHighScore();
  }

  private getSpeed(): number {
    const progress = (ROWS - 1) - this.currentRow;
    return 2.5 + progress * 0.25;
  }

  private loadHighScore() {
    try {
      const records = JSON.parse(localStorage.getItem('cg-records') || '{}');
      this.highScore = records['stacker'] || 0;
    } catch {
      this.highScore = 0;
    }
  }

  update(dt: number) {
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
    const isDark = !document.documentElement.hasAttribute('data-theme') ||
      document.documentElement.getAttribute('data-theme') === 'dark';
    const zh = document.documentElement.getAttribute('data-lang') === 'zh';

    const bg = isDark ? '#0b0f19' : '#fafafa';
    const primary = isDark ? '#39C5BB' : '#0d9488';
    const textColor = isDark ? '#e0e0e0' : '#1a1a2e';
    const gridLine = isDark ? '#1a2332' : '#e0e0e0';

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.width, this.height);

    const cellW = this.width / COLS;
    const cellH = this.height / ROWS;

    ctx.strokeStyle = gridLine;
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

    ctx.fillStyle = primary;
    for (const block of this.blocks) {
      const x = block.x * cellW;
      const y = block.row * cellH;
      const w = block.width * cellW;
      const h = cellH;
      ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    }

    if (this.state === 'playing') {
      ctx.fillStyle = primary;
      const x = this.currentX * cellW;
      const y = this.currentRow * cellH;
      const w = this.currentWidth * cellW;
      const h = cellH;
      ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    }

    if (this.state === 'playing') {
      ctx.font = '12px "Press Start 2P", monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = textColor;
      const scoreLabel = zh ? `得分: ${this.score}` : `SCORE: ${this.score}`;
      ctx.fillText(scoreLabel, 10, 24);

      ctx.globalAlpha = 0.1;
      ctx.fillStyle = textColor;
      ctx.fillRect(0, this.height - 36, this.width / 2, 36);
      ctx.fillRect(this.width / 2, this.height - 36, this.width / 2, 36);
      ctx.globalAlpha = 1.0;

      ctx.font = '10px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = isDark ? '#ffffff' : '#000000';
      ctx.fillText('◄', this.width / 4, this.height - 12);
      ctx.fillText('►', (this.width * 3) / 4, this.height - 12);
    }

    if (this.state === 'idle') {
      ctx.font = '20px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = textColor;
      const title = zh ? '堆叠方块' : 'STACKER';
      ctx.fillText(title, this.width / 2, this.height / 2 - 30);

      ctx.font = '10px "Press Start 2P", monospace';
      const hint = zh ? '点击或按键开始' : 'TAP OR PRESS TO START';
      ctx.fillText(hint, this.width / 2, this.height / 2 + 20);
    }

    if (this.state === 'gameover' || this.state === 'win') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(0, 0, this.width, this.height);

      ctx.font = '18px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      const title = this.state === 'win' ? (zh ? '胜利!' : 'WIN!') : (zh ? '游戏结束' : 'GAME OVER');
      ctx.fillText(title, this.width / 2, this.height / 2 - 50);

      ctx.font = '12px "Press Start 2P", monospace';
      const scoreText = zh ? `得分: ${this.score}` : `SCORE: ${this.score}`;
      ctx.fillText(scoreText, this.width / 2, this.height / 2 - 10);
      const hsText = zh ? `最高: ${this.highScore}` : `HIGH: ${this.highScore}`;
      ctx.fillText(hsText, this.width / 2, this.height / 2 + 20);

      ctx.font = '10px "Press Start 2P", monospace';
      const hint = zh ? '点击重试' : 'TAP TO RETRY';
      ctx.fillText(hint, this.width / 2, this.height / 2 + 55);
    }
  }

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
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
    if (this.currentRow < ROWS - 1) {
      const below = this.blocks.find(b => b.row === this.currentRow + 1);
      if (below) {
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

    this.score++;
    this.currentRow--;

    if (this.currentRow < 0) {
      this.state = 'win';
      this.saveScore();
      return;
    }

    this.speed = this.getSpeed();
  }

  private endGame() {
    this.state = 'gameover';
    this.saveScore();
  }

  private saveScore() {
    if (this.score > this.highScore) {
      this.highScore = this.score;
    }
    (window as any).reportScore?.(this.score);
  }

  destroy() {
    this.stop();
  }
}
