import { BaseGame } from '../core/game.js';
import { calculateSudokuScore } from './sudokuScore.js';

interface Cell {
  value: number;
  given: boolean;
  notes: Set<number>;
  invalid: boolean;
}

type Difficulty = 'easy' | 'medium' | 'hard';

export class SudokuGame extends BaseGame {
  private board: Cell[][] = [];
  private solution: number[][] = [];
  private selectedRow = -1;
  private selectedCol = -1;
  private difficulty: Difficulty = 'easy';
  private mistakes = 0;
  private maxMistakes = 3;
  private hints = 0;
  private maxHints = 3;
  private timer = 0;
  private gameOver = false;
  private won = false;
  private started = false;
  private noteMode = false;
  private completedNumbers = new Set<number>();
  private numpadHovered = -1;
  private numpadPressed = -1;
  private difficultyHovered: Difficulty | null = null;
  private showMenu = true;

  constructor() {
    super('gameCanvas', 480, 560);
  }

  init() {
    this.resetGame();
  }

  private resetGame() {
    this.resetScoreReport();
    this.board = [];
    this.solution = [];
    this.selectedRow = -1;
    this.selectedCol = -1;
    this.mistakes = 0;
    this.hints = 0;
    this.timer = 0;
    this.gameOver = false;
    this.won = false;
    this.started = false;
    this.noteMode = false;
    this.completedNumbers.clear();
    this.numpadHovered = -1;
    this.numpadPressed = -1;
    this.difficultyHovered = null;
    this.showMenu = true;
  }

  private startGame(diff: Difficulty) {
    this.difficulty = diff;
    this.showMenu = false;
    this.started = true;
    this.generatePuzzle();
    this.selectedRow = 0;
    this.selectedCol = 0;
  }

  private generatePuzzle() {
    const full = this.generateCompleteBoard();
    this.solution = full.map((r) => [...r]);

    const clues =
      this.difficulty === 'easy'
        ? 38 + Math.floor(Math.random() * 8)
        : this.difficulty === 'medium'
        ? 30 + Math.floor(Math.random() * 6)
        : 24 + Math.floor(Math.random() * 5);

    const cellsToRemove = 81 - clues;
    const positions = this.shuffle(Array.from({ length: 81 }, (_, i) => i));
    const puzzle = full.map((r) =>
      r.map((v) => ({
        value: v,
        given: true,
        notes: new Set<number>(),
        invalid: false,
      }))
    );

    let removed = 0;
    for (const pos of positions) {
      if (removed >= cellsToRemove) break;
      const r = Math.floor(pos / 9);
      const c = pos % 9;
      if (!puzzle[r][c].given) continue;

      const backup = puzzle[r][c].value;
      puzzle[r][c].value = 0;
      puzzle[r][c].given = false;

      const copy = puzzle.map((row) => row.map((cell) => cell.value));
      const solutions = this.countSolutions(copy);
      if (solutions === 1) {
        removed++;
      } else {
        puzzle[r][c].value = backup;
        puzzle[r][c].given = true;
      }
    }

    this.board = puzzle;
    this.updateCompletedNumbers();
  }

  private generateCompleteBoard(): number[][] {
    const board = Array.from({ length: 9 }, () => Array(9).fill(0));
    this.solveBoard(board);
    return board;
  }

  private solveBoard(board: number[][]): boolean {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] === 0) {
          const nums = this.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
          for (const n of nums) {
            if (this.isValid(board, r, c, n)) {
              board[r][c] = n;
              if (this.solveBoard(board)) return true;
              board[r][c] = 0;
            }
          }
          return false;
        }
      }
    }
    return true;
  }

  private countSolutions(board: number[][]): number {
    let count = 0;
    const solve = (b: number[][]) => {
      if (count >= 2) return;
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (b[r][c] === 0) {
            for (let n = 1; n <= 9; n++) {
              if (this.isValid(b, r, c, n)) {
                b[r][c] = n;
                solve(b);
                b[r][c] = 0;
              }
            }
            return;
          }
        }
      }
      count++;
    };
    solve(board.map((r) => [...r]));
    return count;
  }

  private isValid(board: number[][], row: number, col: number, num: number): boolean {
    for (let i = 0; i < 9; i++) {
      if (board[row][i] === num && i !== col) return false;
      if (board[i][col] === num && i !== row) return false;
    }
    const boxR = Math.floor(row / 3) * 3;
    const boxC = Math.floor(col / 3) * 3;
    for (let r = boxR; r < boxR + 3; r++) {
      for (let c = boxC; c < boxC + 3; c++) {
        if (board[r][c] === num && (r !== row || c !== col)) return false;
      }
    }
    return true;
  }

  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  update(dt: number) {
    if (this.started && !this.gameOver && !this.won) {
      this.timer += dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const isDark = this.isDarkTheme();
    const zh = document.documentElement.getAttribute('data-lang') === 'zh';

    const bg = isDark ? '#0b0f19' : '#fafafa';
    const text = isDark ? '#e0e0e0' : '#1a1a2e';
    const primary = isDark ? '#39C5BB' : '#0d9488';
    const secondary = isDark ? '#2a2f3e' : '#e8e8e8';
    const gridLine = isDark ? '#3a3f4e' : '#d0d0d0';
    const boxLine = isDark ? '#5a6070' : '#a0a0a0';
    const givenColor = isDark ? '#ffffff' : '#1a1a2e';
    const playerColor = primary;
    const invalidColor = '#ef4444';
    const noteColor = isDark ? '#7a8090' : '#909090';
    const highlightBg = isDark ? '#1a2030' : '#e0f0ee';
    const selectedBg = isDark ? '#2a4050' : '#c8e8e4';
    const sameNumBg = isDark ? '#3a5060' : '#b8d8d4';

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.width, this.height);

    if (this.showMenu) {
      this.drawMenu(ctx, isDark, text, primary, secondary, zh);
      return;
    }

    // Top info bar
    const infoY = 18;
    ctx.font = '16px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = text;
    ctx.fillText(zh ? '时间' : 'Time', 16, infoY);
    ctx.fillText(this.formatTime(this.timer), 16, infoY + 16);

    ctx.textAlign = 'center';
    const diffText =
      this.difficulty === 'easy'
        ? zh
          ? '简单'
          : 'Easy'
        : this.difficulty === 'medium'
        ? zh
          ? '中等'
          : 'Medium'
        : zh
        ? '困难'
        : 'Hard';
    ctx.fillText(diffText, this.width / 2, infoY + 8);

    ctx.textAlign = 'right';
    ctx.fillText(
      `${zh ? '错误' : 'Mistakes'} ${this.mistakes}/${this.maxMistakes}`,
      this.width - 16,
      infoY
    );
    ctx.fillText(
      `${zh ? '提示' : 'Hints'} ${this.hints}/${this.maxHints}`,
      this.width - 16,
      infoY + 16
    );

    // Grid
    const gridSize = 432;
    const cellSize = gridSize / 9;
    const gridX = (this.width - gridSize) / 2;
    const gridY = 48;

    // Highlight cells
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const x = gridX + c * cellSize;
        const y = gridY + r * cellSize;
        let cellBg = null;

        if (r === this.selectedRow && c === this.selectedCol) {
          cellBg = selectedBg;
        } else if (
          this.selectedRow !== -1 &&
          (r === this.selectedRow || c === this.selectedCol || this.inSameBox(r, c, this.selectedRow, this.selectedCol))
        ) {
          cellBg = highlightBg;
        }

        if (this.board[r]?.[c]?.value && this.board[this.selectedRow]?.[this.selectedCol]?.value) {
          if (this.board[r][c].value === this.board[this.selectedRow][this.selectedCol].value && !(r === this.selectedRow && c === this.selectedCol)) {
            cellBg = sameNumBg;
          }
        }

        if (cellBg) {
          ctx.fillStyle = cellBg;
          ctx.fillRect(x, y, cellSize, cellSize);
        }
      }
    }

    // Draw numbers
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const cell = this.board[r][c];
        const x = gridX + c * cellSize + cellSize / 2;
        const y = gridY + r * cellSize + cellSize / 2;

        if (cell.value !== 0) {
          ctx.font = 'bold 24px system-ui, sans-serif';
          if (cell.invalid) {
            ctx.fillStyle = invalidColor;
          } else if (cell.given) {
            ctx.fillStyle = givenColor;
          } else {
            ctx.fillStyle = playerColor;
          }
          ctx.fillText(String(cell.value), x, y + 1);
        } else if (cell.notes.size > 0) {
          ctx.font = '12px system-ui, sans-serif';
          ctx.fillStyle = noteColor;
          const notes = Array.from(cell.notes).sort();
          const noteSize = cellSize / 3;
          for (let i = 0; i < notes.length; i++) {
            const nr = Math.floor((notes[i] - 1) / 3);
            const nc = (notes[i] - 1) % 3;
            const nx = gridX + c * cellSize + nc * noteSize + noteSize / 2;
            const ny = gridY + r * cellSize + nr * noteSize + noteSize / 2 + 1;
            ctx.fillText(String(notes[i]), nx, ny);
          }
        }
      }
    }

    // Grid lines
    ctx.strokeStyle = gridLine;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 9; i++) {
      ctx.beginPath();
      ctx.moveTo(gridX + i * cellSize, gridY);
      ctx.lineTo(gridX + i * cellSize, gridY + gridSize);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(gridX, gridY + i * cellSize);
      ctx.lineTo(gridX + gridSize, gridY + i * cellSize);
      ctx.stroke();
    }

    // Box borders
    ctx.strokeStyle = boxLine;
    ctx.lineWidth = 2;
    for (let i = 0; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(gridX + i * cellSize * 3, gridY);
      ctx.lineTo(gridX + i * cellSize * 3, gridY + gridSize);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(gridX, gridY + i * cellSize * 3);
      ctx.lineTo(gridX + gridSize, gridY + i * cellSize * 3);
      ctx.stroke();
    }

    // Outer border
    ctx.strokeStyle = boxLine;
    ctx.lineWidth = 2;
    ctx.strokeRect(gridX, gridY, gridSize, gridSize);

    // Numpad
    this.drawNumpad(ctx, gridX, gridY + gridSize + 8, gridSize, 40, isDark, text, primary, secondary, zh);

    // Note mode indicator
    if (this.noteMode) {
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillStyle = primary;
      ctx.textAlign = 'left';
      ctx.fillText(zh ? '笔记模式' : 'NOTE MODE', 16, this.height - 8);
    }

    // Game over / win overlay
    if (this.gameOver || this.won) {
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '28px system-ui, sans-serif';
      ctx.fillStyle = this.won ? primary : invalidColor;
      ctx.fillText(this.won ? (zh ? '胜利!' : 'YOU WON!') : zh ? '游戏结束' : 'GAME OVER', this.width / 2, this.height / 2 - 20);
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillStyle = text;
      ctx.fillText(zh ? '按空格或点击重新开始' : 'Space or tap to restart', this.width / 2, this.height / 2 + 16);
    }
  }

  private drawMenu(ctx: CanvasRenderingContext2D, isDark: boolean, text: string, primary: string, secondary: string, zh: boolean) {
    const difficulties: { key: Difficulty; label: string; labelZh: string }[] = [
      { key: 'easy', label: 'Easy', labelZh: '简单' },
      { key: 'medium', label: 'Medium', labelZh: '中等' },
      { key: 'hard', label: 'Hard', labelZh: '困难' },
    ];

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '24px system-ui, sans-serif';
    ctx.fillStyle = primary;
    ctx.fillText('SUDOKU', this.width / 2, 120);
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillStyle = text;
    ctx.fillText(zh ? '选择难度' : 'Select Difficulty', this.width / 2, 170);

    const btnWidth = 160;
    const btnHeight = 44;
    const startY = 220;
    const gap = 16;

    for (let i = 0; i < difficulties.length; i++) {
      const d = difficulties[i];
      const x = (this.width - btnWidth) / 2;
      const y = startY + i * (btnHeight + gap);
      const hovered = this.difficultyHovered === d.key;

      ctx.fillStyle = hovered ? primary : secondary;
      ctx.fillRect(x, y, btnWidth, btnHeight);
      ctx.strokeStyle = primary;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, btnWidth, btnHeight);

      ctx.fillStyle = hovered ? (isDark ? '#0b0f19' : '#fafafa') : text;
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillText(zh ? d.labelZh : d.label, this.width / 2, y + btnHeight / 2 + 1);
    }

    ctx.font = '14px system-ui, sans-serif';
    ctx.fillStyle = isDark ? '#5a6070' : '#a0a0a0';
    ctx.fillText(zh ? '点击选择难度开始游戏' : 'Click difficulty to start', this.width / 2, this.height - 40);
  }

  private drawNumpad(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    isDark: boolean,
    text: string,
    primary: string,
    secondary: string,
    zh: boolean
  ) {
    const cols = 9;
    const btnW = width / cols;
    const btnH = height;

    for (let i = 0; i < 9; i++) {
      const bx = x + i * btnW;
      const num = i + 1;
      const hovered = this.numpadHovered === num;
      const pressed = this.numpadPressed === num;
      const completed = this.completedNumbers.has(num);

      if (pressed) {
        ctx.fillStyle = primary;
      } else if (hovered) {
        ctx.fillStyle = isDark ? '#2a4050' : '#c8e8e4';
      } else {
        ctx.fillStyle = secondary;
      }
      ctx.fillRect(bx, y, btnW, btnH);

      ctx.strokeStyle = isDark ? '#3a3f4e' : '#d0d0d0';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, y, btnW, btnH);

      ctx.font = '18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = completed ? (isDark ? '#3a5060' : '#a0c0bc') : pressed ? (isDark ? '#0b0f19' : '#fafafa') : text;
      ctx.fillText(String(num), bx + btnW / 2, y + btnH / 2 + 1);
    }

    // Note toggle button
    const noteX = x + width + 8;
    const noteW = 40;
    ctx.fillStyle = this.noteMode ? primary : secondary;
    ctx.fillRect(noteX, y, noteW, btnH);
    ctx.strokeStyle = isDark ? '#3a3f4e' : '#d0d0d0';
    ctx.strokeRect(noteX, y, noteW, btnH);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = this.noteMode ? (isDark ? '#0b0f19' : '#fafafa') : text;
    ctx.fillText(zh ? '笔记' : 'NOTE', noteX + noteW / 2, y + btnH / 2 + 1);
  }

  private formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  private inSameBox(r1: number, c1: number, r2: number, c2: number): boolean {
    return Math.floor(r1 / 3) === Math.floor(r2 / 3) && Math.floor(c1 / 3) === Math.floor(c2 / 3);
  }

  private updateCompletedNumbers() {
    this.completedNumbers.clear();
    for (let num = 1; num <= 9; num++) {
      let count = 0;
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (this.board[r][c].value === num) count++;
        }
      }
      if (count === 9) this.completedNumbers.add(num);
    }
  }

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    if (e instanceof KeyboardEvent) {
      if (e.type === 'keydown') {
        if (this.showMenu) {
          if (e.key === '1') this.startGame('easy');
          if (e.key === '2') this.startGame('medium');
          if (e.key === '3') this.startGame('hard');
          return;
        }

        if ((this.gameOver || this.won) && e.key === ' ') {
          this.resetGame();
          return;
        }

        if (e.key === 'n' || e.key === 'N') {
          this.noteMode = !this.noteMode;
          return;
        }

        if (e.key === 'h' || e.key === 'H') {
          this.useHint();
          return;
        }

        if (e.key >= '1' && e.key <= '9') {
          const num = parseInt(e.key, 10);
          this.inputNumber(num);
          return;
        }

        if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
          this.clearCell();
          return;
        }

        if (e.key === 'ArrowUp') {
          if (this.selectedRow > 0) this.selectedRow--;
        } else if (e.key === 'ArrowDown') {
          if (this.selectedRow < 8) this.selectedRow++;
        } else if (e.key === 'ArrowLeft') {
          if (this.selectedCol > 0) this.selectedCol--;
        } else if (e.key === 'ArrowRight') {
          if (this.selectedCol < 8) this.selectedCol++;
        }
      }
      return;
    }

    if (e instanceof MouseEvent || e instanceof TouchEvent) {
      let clientX: number, clientY: number;
      if (e instanceof TouchEvent) {
        e.preventDefault();
        if (e.touches.length === 0) {
          this.numpadPressed = -1;
          return;
        }
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }

      const { x, y } = this.canvasPoint(clientX, clientY);

      if (this.showMenu) {
        this.handleMenuClick(x, y, e.type);
        return;
      }

      if ((this.gameOver || this.won) && (e.type === 'mousedown' || e.type === 'touchstart')) {
        this.resetGame();
        return;
      }

      const gridSize = 432;
      const cellSize = gridSize / 9;
      const gridX = (this.width - gridSize) / 2;
      const gridY = 48;
      const numpadY = gridY + gridSize + 8;
      const numpadHeight = 40;

      // Numpad hit test
      if (y >= numpadY && y <= numpadY + numpadHeight) {
        const noteX = gridX + gridSize + 8;
        if (x >= noteX && x <= noteX + 40) {
          if (e.type === 'mousedown' || e.type === 'touchstart') {
            this.noteMode = !this.noteMode;
          }
          this.numpadHovered = -1;
          return;
        }
        if (x >= gridX && x <= gridX + gridSize) {
          const idx = Math.floor((x - gridX) / (gridSize / 9));
          if (idx >= 0 && idx < 9) {
            const num = idx + 1;
            if (e.type === 'mousedown' || e.type === 'touchstart') {
              this.numpadPressed = num;
              this.inputNumber(num);
            } else if (e.type === 'mouseup' || e.type === 'touchend') {
              this.numpadPressed = -1;
            } else {
              this.numpadHovered = num;
            }
          }
          return;
        }
      }

      this.numpadHovered = -1;
      this.numpadPressed = -1;

      // Grid hit test
      if (x >= gridX && x <= gridX + gridSize && y >= gridY && y <= gridY + gridSize) {
        const c = Math.floor((x - gridX) / cellSize);
        const r = Math.floor((y - gridY) / cellSize);
        if (r >= 0 && r < 9 && c >= 0 && c < 9) {
          if (e.type === 'mousedown' || e.type === 'touchstart') {
            this.selectedRow = r;
            this.selectedCol = c;
          }
        }
      }
    }
  }

  private handleMenuClick(x: number, y: number, type: string) {
    const btnWidth = 160;
    const btnHeight = 44;
    const startY = 220;
    const gap = 16;
    const difficulties: Difficulty[] = ['easy', 'medium', 'hard'];

    this.difficultyHovered = null;
    for (let i = 0; i < difficulties.length; i++) {
      const bx = (this.width - btnWidth) / 2;
      const by = startY + i * (btnHeight + gap);
      if (x >= bx && x <= bx + btnWidth && y >= by && y <= by + btnHeight) {
        this.difficultyHovered = difficulties[i];
        if (type === 'mousedown' || type === 'touchstart') {
          this.startGame(difficulties[i]);
        }
      }
    }
  }

  private inputNumber(num: number) {
    if (this.gameOver || this.won) return;
    if (this.selectedRow === -1 || this.selectedCol === -1) return;
    const cell = this.board[this.selectedRow][this.selectedCol];
    if (cell.given) return;

    if (this.noteMode) {
      if (cell.notes.has(num)) {
        cell.notes.delete(num);
      } else {
        cell.notes.add(num);
      }
    } else {
      cell.value = num;
      cell.notes.clear();
      if (num !== this.solution[this.selectedRow][this.selectedCol]) {
        cell.invalid = true;
        this.mistakes++;
        if (this.mistakes >= this.maxMistakes) {
          this.gameOver = true;
          this.submitScoreOnce(0);
        }
      } else {
        cell.invalid = false;
        this.checkWin();
      }
      this.updateCompletedNumbers();
    }
  }

  private clearCell() {
    if (this.gameOver || this.won) return;
    if (this.selectedRow === -1 || this.selectedCol === -1) return;
    const cell = this.board[this.selectedRow][this.selectedCol];
    if (cell.given) return;
    cell.value = 0;
    cell.notes.clear();
    cell.invalid = false;
    this.updateCompletedNumbers();
  }

  private useHint() {
    if (this.gameOver || this.won) return;
    if (this.hints >= this.maxHints) return;

    const empties: { r: number; c: number }[] = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (this.board[r][c].value === 0) {
          empties.push({ r, c });
        }
      }
    }

    if (empties.length === 0) return;
    const pick = empties[Math.floor(Math.random() * empties.length)];
    const cell = this.board[pick.r][pick.c];
    cell.value = this.solution[pick.r][pick.c];
    cell.notes.clear();
    cell.invalid = false;
    this.hints++;
    this.updateCompletedNumbers();
    this.checkWin();
  }

  private checkWin() {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (this.board[r][c].value !== this.solution[r][c]) return;
      }
    }
    this.won = true;
    const score = calculateSudokuScore(this.timer, this.mistakes, this.hints);
    this.submitScoreOnce(score);
  }

  destroy() {
    this.stop();
  }
}
