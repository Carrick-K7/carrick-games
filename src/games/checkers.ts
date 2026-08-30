import { BaseGame, createDefaultGameHost, type GameHost, type GameShellSnapshot } from '../core/game.js';
import { getRetroPalette } from '../core/render.js';
import {
  FloatTexts,
  Particles,
  ScreenShake,
  drawGlow,
  drawVignette,
  fillBevelTile,
  fillSphere,
  fx,
  shade,
} from '../core/fx.js';

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
  private readonly particles = new Particles();
  private readonly floats = new FloatTexts();
  private readonly shake = new ScreenShake();

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
    this.particles.clear();
    this.floats.clear();
    this.shake.reset();
    this.resetScoreReport();
  }

  update(dt: number) {
    this.particles.update(dt);
    this.floats.update(dt);
    this.shake.update(dt);
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
      const palette = getRetroPalette(this.isDarkTheme());
      this.particles.emit(fx.confetti(this.width / 2, 12, [palette.primary, palette.cyan, palette.amber, palette.violet]));
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
      const capturedPiece = this.board[cap.c][cap.r];
      const palette = getRetroPalette(this.isDarkTheme());
      const x = MARGIN + cap.c * CELL + CELL / 2;
      const y = MARGIN + cap.r * CELL + CELL / 2;
      for (const emit of fx.pop(x, y, [capturedPiece === 1 || capturedPiece === 3 ? palette.red : '#334155', palette.amber])) {
        if (!this.isDarkTheme()) emit.blend = 'source-over';
        this.particles.emit(emit);
      }
      this.floats.add(x, y - 10, this.isZhLang() ? '吃子' : 'CAPTURE', { color: palette.amber, size: 12, life: 0.65 });
      this.board[cap.c][cap.r] = 0;
    }
    if (move.captures.length > 0) this.shake.add(0.08);
    // King promotion
    let newPiece = piece;
    if (piece === 1 && move.toR === 0) newPiece = 3;
    if (piece === 2 && move.toR === 7) newPiece = 4;
    this.board[move.toC][move.toR] = newPiece;
    if (newPiece !== piece) {
      const palette = getRetroPalette(this.isDarkTheme());
      const x = MARGIN + move.toC * CELL + CELL / 2;
      const y = MARGIN + move.toR * CELL + CELL / 2;
      for (const emit of fx.pop(x, y, [palette.amber, '#ffffff'])) {
        if (!this.isDarkTheme()) emit.blend = 'source-over';
        this.particles.emit(emit);
      }
      this.floats.add(x, y - 10, this.isZhLang() ? '升王！' : 'KING!', { color: palette.amber, size: 13 });
    }

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
        const palette = getRetroPalette(this.isDarkTheme());
        this.particles.emit(fx.confetti(this.width / 2, 12, [palette.primary, palette.cyan, palette.amber, palette.violet]));
      } else {
        this.shake.add(0.25);
      }
      this.submitScoreOnce(this.score);
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const isDark = this.isDarkTheme();
    const palette = getRetroPalette(isDark);
    const darkSq = isDark ? '#1e293b' : '#94a3b8';
    const lightSq = isDark ? '#334155' : '#cbd5e1';
    const pColor = palette.red;
    const aiColor = isDark ? '#111827' : '#334155';
    const kingRing = palette.amber;
    const textColor = palette.text;

    const background = ctx.createLinearGradient(0, 0, 0, this.height);
    background.addColorStop(0, palette.bg2);
    background.addColorStop(1, palette.bg);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, this.width, this.height);

    const bx = MARGIN;
    const by = MARGIN;

    // Draw board squares
    ctx.save();
    ctx.translate(this.shake.x, this.shake.y);
    for (let c = 0; c < BOARD; c++) {
      for (let r = 0; r < BOARD; r++) {
        fillBevelTile(ctx, bx + c * CELL, by + r * CELL, CELL, CELL, 0, (c + r) % 2 === 0 ? lightSq : darkSq, {
          gloss: false,
          border: 'rgba(15,23,42,0.12)',
        });
      }
    }

    // Highlight selected piece valid moves
    if (this.selected) {
      drawGlow(ctx, bx + this.selected.c * CELL + CELL / 2, by + this.selected.r * CELL + CELL / 2, CELL * 0.75, palette.primary, isDark ? 0.28 : 0.1);
      ctx.fillStyle = 'rgba(57,197,187,0.4)';
      ctx.fillRect(bx + this.selected.c * CELL, by + this.selected.r * CELL, CELL, CELL);
      for (const m of this.validMoves) {
        drawGlow(ctx, bx + m.toC * CELL + CELL / 2, by + m.toR * CELL + CELL / 2, CELL * 0.55, palette.primary, isDark ? 0.16 : 0.06);
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

        const pieceColor = isPlayer ? pColor : aiColor;
        ctx.fillStyle = shade(pieceColor, -0.45);
        ctx.beginPath();
        ctx.arc(x, y + 3, CELL / 2 - 5, 0, Math.PI * 2);
        ctx.fill();
        fillSphere(ctx, x, y - 1, CELL / 2 - 7, pieceColor, { rim: 0.32, rimColor: isKing ? kingRing : '#ffffff' });

        if (isKing) {
          drawGlow(ctx, x, y, CELL * 0.55, kingRing, isDark ? 0.25 : 0.09);
          ctx.strokeStyle = kingRing;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(x, y, CELL / 2 - 10, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
    this.particles.draw(ctx);
    ctx.restore();

    drawVignette(ctx, this.width, this.height, isDark ? 0.16 : 0.06);
    this.floats.draw(ctx);

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
