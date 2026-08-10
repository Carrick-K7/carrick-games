import { BaseGame, createDefaultGameHost, type GameHost, type GameShellSnapshot } from '../core/game.js';

const BOARD = 8;
const CELL = 60;
const MARGIN = 10;

type Piece = 0 | 1 | 2 | 3 | 4; // 0=empty, 1=player, 2=ai, 3=playerKing, 4=aiKing

interface Move {
  fromC: number;
  fromR: number;
  toC: number;
  toR: number;
  captures: { c: number; r: number }[];
}

export class CheckersGame extends BaseGame {
  private board: Piece[][] = [];
  private selected: { c: number; r: number } | null = null;
  private currentPlayer = 1; // 1 = player, 2 = ai
  private gameOver = false;
  private winner: number | null = null;
  private score = 0;

  override getShellSnapshot(): GameShellSnapshot {
    return { score: this.score };
  }
  private validMoves: Move[] = [];
  private forcedCapture: { c: number; r: number } | null = null;

  constructor(host?: GameHost) {
    super(host ?? createDefaultGameHost('gameCanvas', BOARD * CELL + MARGIN * 2, BOARD * CELL + MARGIN * 2 + 40));
  }

  init() {
    this.board = Array.from({ length: BOARD }, () => Array(BOARD).fill(0) as Piece[]);
    // Player pieces on bottom 3 rows (rows 5-7)
    for (let r = 5; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if ((c + r) % 2 === 1) this.board[c][r] = 1;
      }
    }
    // AI pieces on top 3 rows (rows 0-2)
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 8; c++) {
        if ((c + r) % 2 === 1) this.board[c][r] = 2;
      }
    }
    this.selected = null;
    this.currentPlayer = 1;
    this.gameOver = false;
    this.winner = null;
    this.score = 0;
    this.validMoves = [];
    this.forcedCapture = null;
    this.resetScoreReport();
  }

  update(_dt: number) {
    if (this.gameOver) return;
    if (this.currentPlayer === 2) {
      this.aiTurn();
    }
  }

  private getPieceMoves(c: number, r: number, player: number, board = this.board): Move[] {
    const piece = board[c][r];
    if (piece === 0) return [];
    const isPlayer = piece === 1 || piece === 3;
    const isKing = piece === 3 || piece === 4;
    const dirs: [number, number][] = [];
    if (isPlayer || isKing) dirs.push([-1, -1], [1, -1]); // up-left, up-right (player goes up)
    if ((!isPlayer && player === 2) || isKing) dirs.push([-1, 1], [1, 1]); // down-left, down-right

    const moves: Move[] = [];
    const captures: Move[] = [];

    for (const [dc, dr] of dirs) {
      const nc = c + dc, nr = r + dr;
      if (nc >= 0 && nc < 8 && nr >= 0 && nr < 8 && board[nc][nr] === 0) {
        moves.push({ fromC: c, fromR: r, toC: nc, toR: nr, captures: [] });
      }
      // Capture
      const ec = c + dc * 2, er = r + dr * 2;
      if (ec >= 0 && ec < 8 && er >= 0 && er < 8 && board[ec][er] === 0) {
        const mid = board[nc][nr];
        if (mid !== 0 && ((isPlayer && (mid === 2 || mid === 4)) || (!isPlayer && (mid === 1 || mid === 3)))) {
          captures.push({ fromC: c, fromR: r, toC: ec, toR: er, captures: [{ c: nc, r: nr }] });
        }
      }
    }
    return captures.length > 0 ? captures : moves;
  }

  private getAllMoves(player: number, board = this.board): Move[] {
    const all: Move[] = [];
    for (let c = 0; c < 8; c++) {
      for (let r = 0; r < 8; r++) {
        const p = board[c][r];
        if (p !== 0 && ((player === 1 && (p === 1 || p === 3)) || (player === 2 && (p === 2 || p === 4)))) {
          all.push(...this.getPieceMoves(c, r, player, board));
        }
      }
    }
    const captures = all.filter((move) => move.captures.length > 0);
    return captures.length > 0 ? captures : all;
  }

  private aiTurn() {
    const candidates = this.forcedCapture
      ? this.getPieceMoves(this.forcedCapture.c, this.forcedCapture.r, 2).filter((move) => move.captures.length > 0)
      : this.getAllMoves(2);
    if (candidates.length === 0) {
      this.gameOver = true;
      this.winner = 1;
      this.score = 100;
      this.submitScoreOnce(this.score);
      return;
    }
    // Pick best: prioritize captures with most pieces, then center control
    const move = candidates.reduce((best, m) => {
      if (m.captures.length > best.captures.length) return m;
      if (m.captures.length < best.captures.length) return best;
      // Prefer advancing and center
      const score = (m.toR * 2) + (4 - Math.abs(m.toC - 3.5));
      const bestScore = (best.toR * 2) + (4 - Math.abs(best.toC - 3.5));
      return score > bestScore ? m : best;
    }, candidates[0]);
    this.executeMove(move);
  }

  private executeMove(move: Move) {
    const piece = this.board[move.fromC][move.fromR];
    this.board[move.fromC][move.fromR] = 0;
    // Remove captured pieces
    for (const cap of move.captures) {
      this.board[cap.c][cap.r] = 0;
    }
    // King promotion
    let newPiece = piece;
    if (piece === 1 && move.toR === 0) newPiece = 3;
    if (piece === 2 && move.toR === 7) newPiece = 4;
    this.board[move.toC][move.toR] = newPiece;

    // Check multi-capture
    const promoted = newPiece !== piece;
    const further = promoted
      ? []
      : this.getPieceMoves(move.toC, move.toR, this.currentPlayer).filter(m => m.captures.length > 0);
    if (move.captures.length > 0 && further.length > 0) {
      this.forcedCapture = { c: move.toC, r: move.toR };
      this.selected = this.currentPlayer === 1 ? { c: move.toC, r: move.toR } : null;
      this.validMoves = this.currentPlayer === 1 ? further : [];
      return;
    }

    // Switch turn
    this.forcedCapture = null;
    this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
    this.selected = null;
    this.validMoves = [];

    // Check game over
    const nextMoves = this.getAllMoves(this.currentPlayer);
    if (nextMoves.length === 0) {
      this.gameOver = true;
      this.winner = this.currentPlayer === 1 ? 2 : 1;
      if (this.winner === 1) {
        this.score = 100;
      }
      this.submitScoreOnce(this.score);
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const isDark = this.isDarkTheme();
    const bg = isDark ? '#0b0f19' : '#fafafa';
    const darkSq = isDark ? '#1e293b' : '#94a3b8';
    const lightSq = isDark ? '#334155' : '#cbd5e1';
    const pColor = '#ef4444';
    const aiColor = '#1e1e1e';
    const kingRing = '#fbbf24';
    const textColor = isDark ? '#e0e0e0' : '#1a1a2e';

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.width, this.height);

    const bx = MARGIN;
    const by = MARGIN;

    // Draw board squares
    for (let c = 0; c < BOARD; c++) {
      for (let r = 0; r < BOARD; r++) {
        ctx.fillStyle = (c + r) % 2 === 0 ? lightSq : darkSq;
        ctx.fillRect(bx + c * CELL, by + r * CELL, CELL, CELL);
      }
    }

    // Highlight selected piece valid moves
    if (this.selected) {
      ctx.fillStyle = 'rgba(57,197,187,0.4)';
      ctx.fillRect(bx + this.selected.c * CELL, by + this.selected.r * CELL, CELL, CELL);
      for (const m of this.validMoves) {
        ctx.fillStyle = 'rgba(57,197,187,0.3)';
        ctx.fillRect(bx + m.toC * CELL, by + m.toR * CELL, CELL, CELL);
      }
    }

    // Draw pieces
    for (let c = 0; c < BOARD; c++) {
      for (let r = 0; r < BOARD; r++) {
        const p = this.board[c][r];
        if (p === 0) continue;
        const x = bx + c * CELL + CELL / 2;
        const y = by + r * CELL + CELL / 2;
        const isPlayer = p === 1 || p === 3;
        const isKing = p === 3 || p === 4;

        ctx.fillStyle = isPlayer ? pColor : aiColor;
        ctx.beginPath();
        ctx.arc(x, y, CELL / 2 - 6, 0, Math.PI * 2);
        ctx.fill();

        // Highlight
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.beginPath();
        ctx.arc(x - 5, y - 5, 6, 0, Math.PI * 2);
        ctx.fill();

        if (isKing) {
          ctx.strokeStyle = kingRing;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(x, y, CELL / 2 - 10, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    // Turn text
    const zh = this.isZhLang();
    ctx.fillStyle = textColor;
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    if (!this.gameOver) {
      const txt = this.currentPlayer === 1 ? (zh ? '你的回合' : 'Your Turn') : (zh ? '电脑思考中...' : 'Computer thinking...');
      ctx.fillText(txt, this.width / 2, this.height - 16);
    }

    // Game over overlay
    if (this.gameOver) {
      const result = this.winner === 1
        ? (zh ? '你赢了！' : 'YOU WIN!')
        : this.winner === 2
          ? (zh ? '电脑赢了' : 'COMPUTER WINS')
          : (zh ? '平局' : 'DRAW');
      this.drawResultOverlay(ctx, {
        title: result,
        tone: this.winner === 1 ? 'success' : this.winner === 2 ? 'danger' : 'neutral',
        details: [`${zh ? '得分' : 'SCORE'} ${this.score}`],
        hint: zh ? '点击或按空格重新开始' : 'CLICK OR PRESS SPACE',
      });
    }
    ctx.textAlign = 'left';
  }

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    if (this.gameOver && this.isRestartInput(e)) {
      if (e instanceof TouchEvent) e.preventDefault();
      this.init();
      return;
    }

    if (e instanceof KeyboardEvent) {
      if (e.type === 'keydown' && e.key === ' ') {
        if (this.gameOver) this.init();
        return;
      }
    }

    if (this.gameOver) {
      if (
        (e instanceof MouseEvent && e.type === 'mousedown')
        || (e instanceof TouchEvent && e.type === 'touchstart')
      ) {
        if (e instanceof TouchEvent) e.preventDefault();
        this.init();
      }
      return;
    }
    if (this.currentPlayer !== 1) return;

    let x = 0, y = 0;
    if (e instanceof MouseEvent && e.type === 'mousedown') {
      ({ x, y } = this.canvasPoint(e.clientX, e.clientY));
    } else if (e instanceof TouchEvent && e.type === 'touchstart') {
      e.preventDefault();
      const touch = e.touches[0];
      if (!touch) return;
      ({ x, y } = this.canvasPoint(touch.clientX, touch.clientY));
    } else {
      return;
    }

    const bx = MARGIN;
    const by = MARGIN;
    if (x < bx || y < by || x >= bx + BOARD * CELL || y >= by + BOARD * CELL) return;
    const c = Math.floor((x - bx) / CELL);
    const r = Math.floor((y - by) / CELL);

    const piece = this.board[c][r];
    const isPlayerPiece = piece === 1 || piece === 3;

    if (this.selected) {
      // Try to move
      const move = this.validMoves.find(m => m.toC === c && m.toR === r);
      if (move) {
        this.executeMove(move);
        return;
      }
    }

    if (isPlayerPiece) {
      if (this.forcedCapture && (c !== this.forcedCapture.c || r !== this.forcedCapture.r)) return;
      this.selected = { c, r };
      const legal = this.getAllMoves(1);
      this.validMoves = legal.filter((move) => move.fromC === c && move.fromR === r);
    } else {
      this.selected = null;
      this.validMoves = [];
    }
  }

  destroy() {
    this.stop();
    this.unbindInput();
  }
}
