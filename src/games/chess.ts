import { BaseGame } from '../core/game.js';

// Piece types
type PieceType = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P';
type PieceColor = 'w' | 'b';
interface Piece { type: PieceType; color: PieceColor; }
type Board = (Piece | null)[][];
type Phase = 'start' | 'play' | 'gameover';

const BOARD_SIZE = 480;
const CELL = BOARD_SIZE / 8;
const UI_TOP = 36;
const CANVAS_W = BOARD_SIZE;
const CANVAS_H = BOARD_SIZE + UI_TOP + 44;

const PIECE_CHARS: Record<string, string> = {
  'wK': '♔', 'wQ': '♕', 'wR': '♖', 'wB': '♗', 'wN': '♘', 'wP': '♙',
  'bK': '♚', 'bQ': '♛', 'bR': '♜', 'bB': '♝', 'bN': '♞', 'bP': '♟',
};

function getTheme() {
  const dark = !document.documentElement.getAttribute('data-theme')
    ? true
    : document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    bg: dark ? '#0b0f19' : '#fafafa',
    accent: dark ? '#39C5BB' : '#0d9488',
    lightSquare: dark ? '#e8d5b7' : '#f0d9b5',
    darkSquare: dark ? '#b58863' : '#769656',
    text: dark ? '#e2e8f0' : '#1e293b',
    muted: dark ? '#64748b' : '#94a3b8',
    overlay: dark ? 'rgba(11,15,25,0.85)' : 'rgba(250,250,250,0.85)',
    selected: dark ? 'rgba(57,197,187,0.5)' : 'rgba(13,148,136,0.4)',
    highlight: dark ? 'rgba(255,255,100,0.4)' : 'rgba(255,255,100,0.5)',
  };
}

function langText(key: string): string {
  const t: Record<string, Record<string, string>> = {
    en: { title: 'Chess', start: 'Play Chess', restart: 'Play Again', whiteTurn: 'White to move', blackTurn: 'Black to move', whiteWin: 'White Wins!', blackWin: 'Black Wins!', stalemate: 'Stalemate!', draw: 'Draw!', check: 'Check!' },
    zh: { title: '国际象棋', start: '开始对局', restart: '再来一局', whiteTurn: '白方回合', blackTurn: '黑方回合', whiteWin: '白方胜!', blackWin: '黑方胜!', stalemate: '僵局!', draw: '平局!', check: '将军!' },
  };
  const lang = document.documentElement.getAttribute('data-lang') === 'zh' ? 'zh' : 'en';
  return (t[lang]?.[key]) ?? (t.en?.[key] ?? '');
}

export class ChessGame extends BaseGame {
  private board: Board = [];
  private turn: PieceColor = 'w';
  private phase: Phase = 'start';
  private selected: { r: number; c: number } | null = null;
  private validMoves: { r: number; c: number; flags?: string }[] = [];
  private moveHistory: { from: { r: number; c: number }; to: { r: number; c: number }; piece: Piece; captured?: Piece; promotion?: PieceType; castle?: 'K' | 'Q'; enPassant?: boolean }[] = [];
  private isCheck = false;
  private gameResult: string | null = null;
  // Castling rights
  private castling: Record<PieceColor, { K: boolean; Q: boolean }> = {
    w: { K: true, Q: true },
    b: { K: true, Q: true },
  };
  private aiThinking = false;
  private touchStart: { r: number; c: number } | null = null;
  private promotionPending: { from: { r: number; c: number }; to: { r: number; c: number } } | null = null;
  private promotionResolve: ((t: PieceType) => void) | null = null;
  private promotionCallback: ((t: PieceType) => void) | null = null;
  private animTime = 0;
  private lastAiTime = 0;

  constructor() {
    super('gameCanvas', CANVAS_W, CANVAS_H);
  }

  init() {
    this.setupBoard();
    this.phase = 'start';
    this.turn = 'w';
    this.selected = null;
    this.validMoves = [];
    this.moveHistory = [];
    this.isCheck = false;
    this.gameResult = null;
    this.castling = { w: { K: true, Q: true }, b: { K: true, Q: true } };
    this.aiThinking = false;
    this.promotionPending = null;
    this.animTime = 0;
  }

  private setupBoard() {
    this.board = [];
    const backRank: PieceType[] = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
    for (let r = 0; r < 8; r++) {
      this.board[r] = [];
      for (let c = 0; c < 8; c++) {
        if (r === 0) {
          this.board[r][c] = { type: backRank[c], color: 'b' };
        } else if (r === 1) {
          this.board[r][c] = { type: 'P', color: 'b' };
        } else if (r === 6) {
          this.board[r][c] = { type: 'P', color: 'w' };
        } else if (r === 7) {
          this.board[r][c] = { type: backRank[c], color: 'w' };
        } else {
          this.board[r][c] = null;
        }
      }
    }
  }

  private cloneBoard(b: Board): Board {
    return b.map(row => row.map(cell => cell ? { ...cell } : null));
  }

  private getRawMoves(board: Board, r: number, c: number, castling_: Record<PieceColor, { K: boolean; Q: boolean }>): { r: number; c: number; flags?: string }[] {
    const piece = board[r][c];
    if (!piece) return [];
    const moves: { r: number; c: number; flags?: string }[] = [];
    const { type, color } = piece;
    const dir = color === 'w' ? -1 : 1;

    const add = (dr: number, dc: number, flags = '') => {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr > 7 || nc < 0 || nc > 7) return false;
      if (!board[nr][nc]) { moves.push({ r: nr, c: nc, flags }); return dr === 0 && dc === 0; }
      if (board[nr][nc]!.color !== color) moves.push({ r: nr, c: nc, flags });
      return false;
    };

    const slide = (dr: number, dc: number) => {
      let nr = r + dr, nc = c + dc;
      while (nr >= 0 && nr <= 7 && nc >= 0 && nc <= 7) {
        if (!board[nr][nc]) { moves.push({ r: nr, c: nc }); }
        else { if (board[nr][nc]!.color !== color) moves.push({ r: nr, c: nc }); break; }
        nr += dr; nc += dc;
      }
    };

    switch (type) {
      case 'P': {
        if (!board[r + dir]?.[c]) {
          moves.push({ r: r + dir, c });
          if ((color === 'w' && r === 6 && !board[r + 2 * dir]?.[c]) || (color === 'b' && r === 1 && !board[r + 2 * dir]?.[c])) {
            moves.push({ r: r + 2 * dir, c });
          }
        }
        for (const dc of [-1, 1]) {
          const nr = r + dir, nc = c + dc;
          if (nc < 0 || nc > 7) continue;
          if (board[nr]?.[nc] && board[nr][nc]!.color !== color) moves.push({ r: nr, c: nc });
          // En passant
          if (this.moveHistory.length > 0) {
            const last = this.moveHistory[this.moveHistory.length - 1];
            if (last.piece.type === 'P' && Math.abs(last.from.r - last.to.r) === 2 && last.to.r === r && last.to.c === nc) {
              moves.push({ r: nr, c: nc, flags: 'ep' });
            }
          }
        }
        break;
      }
      case 'N': {
        for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
          add(dr, dc);
        }
        break;
      }
      case 'B': slide(-1,-1); slide(-1,1); slide(1,-1); slide(1,1); break;
      case 'R': slide(-1,0); slide(1,0); slide(0,-1); slide(0,1); break;
      case 'Q': slide(-1,-1); slide(-1,1); slide(1,-1); slide(1,1); slide(-1,0); slide(1,0); slide(0,-1); slide(0,1); break;
      case 'K': {
        for (let dr of [-1,0,1]) for (let dc of [-1,0,1]) if (dr||dc) add(dr, dc);
        // Castling
        const row = color === 'w' ? 7 : 0;
        if (r === row && c === 4) {
          if (castling_[color].K && !board[row][5] && !board[row][6] && board[row][7]?.type === 'R' && board[row][7]?.color === color) {
            moves.push({ r: row, c: 6, flags: 'castleK' });
          }
          if (castling_[color].Q && !board[row][3] && !board[row][2] && !board[row][1] && board[row][0]?.type === 'R' && board[row][0]?.color === color) {
            moves.push({ r: row, c: 2, flags: 'castleQ' });
          }
        }
        break;
      }
    }
    return moves;
  }

  private getLegalMoves(board: Board, r: number, c: number, castling_: Record<PieceColor, { K: boolean; Q: boolean }>): { r: number; c: number; flags?: string }[] {
    const piece = board[r][c];
    if (!piece) return [];
    const raw = this.getRawMoves(board, r, c, castling_);
    return raw.filter(m => {
      const nb = this.cloneBoard(board);
      nb[m.r][m.c] = nb[r][c];
      nb[r][c] = null;
      if (m.flags === 'ep') {
        nb[r][m.c] = null;
      }
      if (m.flags === 'castleK' || m.flags === 'castleQ') {
        const row = piece.color === 'w' ? 7 : 0;
        if (m.flags === 'castleK') {
          nb[row][5] = nb[row][7]; nb[row][7] = null;
        } else {
          nb[row][3] = nb[row][0]; nb[row][0] = null;
        }
      }
      return !this.isKingAttacked(nb, piece.color);
    });
  }

  private findKing(board: Board, color: PieceColor): { r: number; c: number } {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      if (board[r][c]?.type === 'K' && board[r][c]!.color === color) return { r, c };
    }
    return { r: -1, c: -1 };
  }

  private isKingAttacked(board: Board, byColor: PieceColor): boolean {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      if (board[r][c]?.color === byColor) {
        const moves = this.getRawMoves(board, r, c, { w: { K: false, Q: false }, b: { K: false, Q: false } });
        for (const m of moves) {
          if (board[m.r][m.c]?.type === 'K') return true;
        }
      }
    }
    return false;
  }

  private isInCheck(color: PieceColor): boolean {
    return this.isKingAttacked(this.board, color);
  }

  private getAllLegalMoves(color: PieceColor): { from: { r: number; c: number }; to: { r: number; c: number }; flags?: string }[] {
    const all: { from: { r: number; c: number }; to: { r: number; c: number }; flags?: string }[] = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      if (this.board[r][c]?.color === color) {
        const moves = this.getLegalMoves(this.board, r, c, this.castling);
        for (const m of moves) all.push({ from: { r, c }, to: m, flags: m.flags });
      }
    }
    return all;
  }

  private needsPromotion(r: number, col: number, color: PieceColor): boolean {
    return this.board[r][col]?.type === 'P' && ((color === 'w' && r === 0) || (color === 'b' && r === 7));
  }

  private makeMove(from: { r: number; c: number }, to: { r: number; c: number }, flags?: string) {
    const piece = this.board[from.r][from.c];
    if (!piece) return;
    const captured: Piece | undefined = this.board[to.r][to.c] ?? undefined;
    const rec: typeof this.moveHistory[0] = { from, to, piece, captured };
    this.board[to.r][to.c] = piece;
    this.board[from.r][from.c] = null;

    if (flags === 'ep') {
      this.board[from.r][to.c] = null;
      rec.enPassant = true;
    }

    if (flags === 'castleK') {
      const row = piece.color === 'w' ? 7 : 0;
      this.board[row][5] = this.board[row][7];
      this.board[row][7] = null;
      rec.castle = 'K';
    } else if (flags === 'castleQ') {
      const row = piece.color === 'w' ? 7 : 0;
      this.board[row][3] = this.board[row][0];
      this.board[row][0] = null;
      rec.castle = 'Q';
    }

    // Pawn promotion
    if (piece.type === 'P' && (to.r === 0 || to.r === 7)) {
      rec.promotion = 'Q'; // Auto-promote to queen
      this.board[to.r][to.c] = { type: 'Q', color: piece.color };
    }

    // Update castling rights
    if (piece.type === 'K') this.castling[piece.color] = { K: false, Q: false };
    if (piece.type === 'R') {
      if (from.c === 0) this.castling[piece.color].Q = false;
      if (from.c === 7) this.castling[piece.color].K = false;
    }
    // If rook captured
    if (captured?.type === 'R') {
      const enemy = captured.color;
      if (to.c === 0) this.castling[enemy].Q = false;
      if (to.c === 7) this.castling[enemy].K = false;
    }

    this.moveHistory.push(rec);
    this.turn = this.turn === 'w' ? 'b' : 'w';
    this.isCheck = this.isInCheck(this.turn);

    // Check game end
    const legalMoves = this.getAllLegalMoves(this.turn);
    if (legalMoves.length === 0) {
      this.phase = 'gameover';
      if (this.isCheck) {
        this.gameResult = this.turn === 'w' ? 'blackWin' : 'whiteWin';
      } else {
        this.gameResult = 'stalemate';
      }
    }
  }

  private asyncAI() {
    if (this.turn !== 'b' || this.phase !== 'play') return;
    this.aiThinking = true;
    this.lastAiTime = performance.now();

    // Use setTimeout to avoid blocking
    setTimeout(() => {
      const moves = this.getAllLegalMoves('b');
      if (moves.length === 0) { this.aiThinking = false; return; }

      // Minimax with depth 2
      const scored = moves.map(m => {
        const nb = this.cloneBoard(this.board);
        const piece = nb[m.from.r][m.from.c];
        nb[m.to.r][m.to.c] = piece;
        nb[m.from.r][m.from.c] = null;
        if (m.flags === 'ep') nb[m.from.r][m.to.c] = null;
        if (m.flags === 'castleK') { const row = 0; nb[row][5] = nb[row][7]; nb[row][7] = null; }
        if (m.flags === 'castleQ') { const row = 0; nb[row][3] = nb[row][0]; nb[row][0] = null; }
        if (piece?.type === 'P' && (m.to.r === 0 || m.to.r === 7)) nb[m.to.r][m.to.c] = { type: 'Q', color: 'b' };

        let score = 0;
        const allWhite = this.getAllLegalMovesForBoard(nb, 'w', this.castling);
        for (const wm of allWhite) {
          const wnb = this.cloneBoard(nb);
          const wp = wnb[wm.from.r][wm.from.c];
          wnb[wm.to.r][wm.to.c] = wp; wnb[wm.from.r][wm.from.c] = null;
          if (wm.flags === 'ep') wnb[wm.from.r][wm.to.c] = null;
          if (wm.flags === 'castleK') { const row = 7; wnb[row][5] = wnb[row][7]; wnb[row][7] = null; }
          if (wm.flags === 'castleQ') { const row = 7; wnb[row][3] = wnb[row][0]; wnb[row][0] = null; }
          if (wp?.type === 'P' && (wm.to.r === 0 || wm.to.r === 7)) wnb[wm.to.r][wm.to.c] = { type: 'Q', color: 'w' };
          // Evaluate
          for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
            const pc = wnb[r][c];
            if (!pc) continue;
            const vals: Record<string, number> = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };
            score -= (vals[pc.type] || 0);
          }
        }
        // Add some randomness
        score += (Math.random() - 0.5) * 0.5;
        return { move: m, score };
      });

      scored.sort((a, b) => a.score - b.score);
      const best = scored.slice(0, Math.min(3, scored.length));
      const chosen = best[Math.floor(Math.random() * best.length)];
      this.makeMove(chosen.move.from, chosen.move.to, chosen.move.flags);
      this.aiThinking = false;
      this.selected = null;
      this.validMoves = [];
    }, 400);
  }

  private getAllLegalMovesForBoard(board: Board, color: PieceColor, castling_: Record<PieceColor, { K: boolean; Q: boolean }>): { from: { r: number; c: number }; to: { r: number; c: number }; flags?: string }[] {
    const all: { from: { r: number; c: number }; to: { r: number; c: number }; flags?: string }[] = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      if (board[r][c]?.color === color) {
        const moves = this.getLegalMovesForBoard(board, r, c, castling_);
        for (const m of moves) all.push({ from: { r, c }, to: m, flags: m.flags });
      }
    }
    return all;
  }

  private getLegalMovesForBoard(board: Board, r: number, c: number, castling_: Record<PieceColor, { K: boolean; Q: boolean }>): { r: number; c: number; flags?: string }[] {
    const piece = board[r][c];
    if (!piece) return [];
    const raw = this.getRawMoves(board, r, c, castling_);
    return raw.filter(m => {
      const nb = this.cloneBoard(board);
      nb[m.r][m.c] = nb[r][c];
      nb[r][c] = null;
      if (m.flags === 'ep') nb[r][m.c] = null;
      if (m.flags === 'castleK') { const row = piece.color === 'w' ? 7 : 0; nb[row][5] = nb[row][7]; nb[row][7] = null; }
      if (m.flags === 'castleQ') { const row = piece.color === 'w' ? 7 : 0; nb[row][3] = nb[row][0]; nb[row][0] = null; }
      return !this.isKingAttacked(nb, piece.color);
    });
  }

  update(dt: number) {
    this.animTime += dt;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const theme = getTheme();
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, this.width, this.height);

    if (this.phase === 'start') {
      this.drawStartScreen(ctx, theme);
      return;
    }

    // Draw UI
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, this.width, UI_TOP);
    ctx.fillStyle = theme.text;
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    const turnText = this.turn === 'w' ? langText('whiteTurn') : langText('blackTurn');
    const checkText = this.isCheck ? ' ' + langText('check') : '';
    ctx.fillText(turnText + checkText, BOARD_SIZE / 2, 22);

    // Draw board
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const x = c * CELL, y = r * CELL + UI_TOP;
        const isLight = (r + c) % 2 === 0;
        ctx.fillStyle = isLight ? theme.lightSquare : theme.darkSquare;
        ctx.fillRect(x, y, CELL, CELL);

        // Highlight selected
        if (this.selected && this.selected.r === r && this.selected.c === c) {
          ctx.fillStyle = theme.selected;
          ctx.fillRect(x, y, CELL, CELL);
        }

        // Highlight valid moves
        if (this.validMoves.some(m => m.r === r && m.c === c)) {
          ctx.fillStyle = this.board[r][c] ? theme.highlight : 'rgba(57,197,187,0.4)';
          if (!this.board[r][c]) {
            ctx.beginPath();
            ctx.arc(x + CELL / 2, y + CELL / 2, CELL * 0.2, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.strokeStyle = theme.accent;
            ctx.lineWidth = 3;
            ctx.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);
          }
        }

        // Last move highlight
        if (this.moveHistory.length > 0) {
          const last = this.moveHistory[this.moveHistory.length - 1];
          if ((last.from.r === r && last.from.c === c) || (last.to.r === r && last.to.c === c)) {
            ctx.fillStyle = 'rgba(255,255,100,0.2)';
            ctx.fillRect(x, y, CELL, CELL);
          }
        }

        // Draw piece
        const piece = this.board[r][c];
        if (piece) {
          const key = piece.color + piece.type;
          const isKingInCheck = piece.type === 'K' && this.isCheck && piece.color === this.turn;
          ctx.font = `${CELL * 0.85}px "Segoe UI Symbol", "Apple Symbols", "Noto Color Emoji", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          if (isKingInCheck) {
            // Draw red glow behind king
            ctx.fillStyle = 'rgba(255,0,0,0.3)';
            ctx.fillRect(x, y, CELL, CELL);
          }
          ctx.fillStyle = piece.color === 'w' ? '#fff' : '#000';
          ctx.strokeStyle = piece.color === 'w' ? '#333' : '#eee';
          ctx.lineWidth = 1;
          ctx.fillText(PIECE_CHARS[key], x + CELL / 2, y + CELL / 2 + 2);
          ctx.strokeText(PIECE_CHARS[key], x + CELL / 2, y + CELL / 2 + 2);
        }
      }
    }

    // File labels
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillStyle = theme.muted;
    ctx.textAlign = 'center';
    for (let c = 0; c < 8; c++) {
      ctx.fillText(String.fromCharCode(97 + c), c * CELL + CELL / 2, this.height - 4);
    }

    // Promotion dialog
    if (this.promotionPending) {
      this.drawPromotionDialog(ctx, theme);
    }

    // Game over overlay
    if (this.phase === 'gameover') {
      this.drawGameOver(ctx, theme);
    }
  }

  private drawStartScreen(ctx: CanvasRenderingContext2D, theme: ReturnType<typeof getTheme>) {
    // Draw empty board preview
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const x = c * CELL, y = r * CELL + UI_TOP;
        const isLight = (r + c) % 2 === 0;
        ctx.fillStyle = isLight ? theme.lightSquare : theme.darkSquare;
        ctx.fillRect(x, y, CELL, CELL);
      }
    }

    // Overlay
    ctx.fillStyle = theme.overlay;
    ctx.fillRect(0, 0, this.width, this.height);

    // Title
    ctx.fillStyle = theme.accent;
    ctx.font = '16px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Chess', this.width / 2, this.height / 2 - 40);

    // Piece icons
    ctx.font = `${CELL * 0.7}px "Segoe UI Symbol", "Apple Symbols", sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    const pieces = ['♔', '♕', '♖', '♗', '♘', '♟'];
    const startX = this.width / 2 - CELL * 3;
    pieces.forEach((p, i) => {
      ctx.fillText(p, startX + i * CELL + CELL / 2, this.height / 2);
      ctx.strokeText(p, startX + i * CELL + CELL / 2, this.height / 2);
    });

    // Button
    const btnW = 180, btnH = 36;
    const bx = this.width / 2 - btnW / 2;
    const by = this.height / 2 + 50;
    ctx.fillStyle = theme.accent;
    ctx.beginPath();
    ctx.roundRect(bx, by, btnW, btnH, 6);
    ctx.fill();
    ctx.fillStyle = theme.bg;
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(langText('start'), this.width / 2, by + btnH / 2);
    this.startBtnBounds = { x: bx, y: by, w: btnW, h: btnH };
  }

  private startBtnBounds: { x: number; y: number; w: number; h: number } | null = null;

  private drawGameOver(ctx: CanvasRenderingContext2D, theme: ReturnType<typeof getTheme>) {
    ctx.fillStyle = theme.overlay;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.fillStyle = theme.accent;
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const msgKey = this.gameResult || 'draw';
    const msgs: Record<string, string> = { whiteWin: 'whiteWin', blackWin: 'blackWin', stalemate: 'stalemate', draw: 'draw' };
    ctx.fillText(langText(msgs[msgKey] || 'draw'), this.width / 2, this.height / 2 - 20);

    const btnW = 160, btnH = 32;
    const bx = this.width / 2 - btnW / 2;
    const by = this.height / 2 + 10;
    ctx.fillStyle = theme.accent;
    ctx.beginPath();
    ctx.roundRect(bx, by, btnW, btnH, 6);
    ctx.fill();
    ctx.fillStyle = theme.bg;
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.fillText(langText('restart'), this.width / 2, by + btnH / 2);
    this.startBtnBounds = { x: bx, y: by, w: btnW, h: btnH };
  }

  private drawPromotionDialog(ctx: CanvasRenderingContext2D, theme: ReturnType<typeof getTheme>) {
    ctx.fillStyle = theme.overlay;
    ctx.fillRect(0, 0, this.width, this.height);
    const color = this.promotionPending ? (this.board[this.promotionPending.to.r][this.promotionPending.to.c]?.color || 'w') : 'w';
    const pieces: PieceType[] = ['Q', 'R', 'B', 'N'];
    const CELL2 = CELL;
    const totalW = CELL2 * 4;
    const ox = this.width / 2 - totalW / 2;
    const oy = this.height / 2 - CELL2 / 2;
    ctx.fillStyle = theme.overlay;
    ctx.fillRect(ox - 10, oy - 10, totalW + 20, CELL2 + 20);

    pieces.forEach((t, i) => {
      const px = ox + i * CELL2;
      ctx.fillStyle = (i % 2 === 0) ? theme.lightSquare : theme.darkSquare;
      ctx.fillRect(px, oy, CELL2, CELL2);
      ctx.font = `${CELL2 * 0.85}px "Segoe UI Symbol", "Apple Symbols", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color === 'w' ? '#fff' : '#000';
      ctx.strokeStyle = color === 'w' ? '#333' : '#eee';
      ctx.lineWidth = 1;
      const ch = PIECE_CHARS[color + t];
      ctx.fillText(ch, px + CELL2 / 2, oy + CELL2 / 2 + 2);
      ctx.strokeText(ch, px + CELL2 / 2, oy + CELL2 / 2 + 2);
    });
  }

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    if (e.type === 'keydown') {
      const ke = e as KeyboardEvent;
      if (ke.key === 'Escape') {
        this.selected = null;
        this.validMoves = [];
        return;
      }
      return;
    }

    // Get canvas-relative position
    const rect = this.canvas.getBoundingClientRect();
    let clientX: number, clientY: number;
    if (e.type.startsWith('touch')) {
      const te = e as TouchEvent;
      if (te.touches.length === 0) return;
      clientX = te.touches[0]?.clientX ?? te.changedTouches[0]?.clientX ?? 0;
      clientY = te.touches[0]?.clientY ?? te.changedTouches[0]?.clientY ?? 0;
    } else {
      const me = e as MouseEvent;
      clientX = me.clientX;
      clientY = me.clientY;
    }
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const cx = (clientX - rect.left) * scaleX;
    const cy = (clientY - rect.top) * scaleY;

    if (this.phase === 'start') {
      if (this.startBtnBounds && cx >= this.startBtnBounds.x && cx <= this.startBtnBounds.x + this.startBtnBounds.w && cy >= this.startBtnBounds.y && cy <= this.startBtnBounds.y + this.startBtnBounds.h) {
        this.phase = 'play';
        this.selected = null;
        this.validMoves = [];
      }
      return;
    }

    if (this.phase === 'gameover') {
      if (this.startBtnBounds && cx >= this.startBtnBounds.x && cx <= this.startBtnBounds.x + this.startBtnBounds.w && cy >= this.startBtnBounds.y && cy <= this.startBtnBounds.y + this.startBtnBounds.h) {
        this.init();
        this.phase = 'play';
      }
      return;
    }

    if (this.promotionPending) {
      const CELL2 = CELL;
      const totalW = CELL2 * 4;
      const ox = this.width / 2 - totalW / 2;
      const oy = this.height / 2 - CELL2 / 2;
      const col = Math.floor((cx - ox) / CELL2);
      if (col >= 0 && col < 4) {
        const pieces: PieceType[] = ['Q', 'R', 'B', 'N'];
        const t = pieces[col];
        if (this.promotionResolve) this.promotionResolve(t);
        this.board[this.promotionPending.to.r][this.promotionPending.to.c] = {
          type: t, color: this.board[this.promotionPending.to.r][this.promotionPending.to.c]!.color
        };
        const last = this.moveHistory[this.moveHistory.length - 1];
        if (last) last.promotion = t;
        this.promotionPending = null;
        this.promotionResolve = null;
        this.turn = this.turn === 'w' ? 'b' : 'w';
        this.isCheck = this.isInCheck(this.turn);
        const legalMoves = this.getAllLegalMoves(this.turn);
        if (legalMoves.length === 0) {
          this.phase = 'gameover';
          if (this.isCheck) this.gameResult = this.turn === 'w' ? 'blackWin' : 'whiteWin';
          else this.gameResult = 'stalemate';
        }
        if (this.turn === 'b') this.asyncAI();
      }
      return;
    }

    // Board click
    const c = Math.floor(cx / CELL);
    const r = Math.floor((cy - UI_TOP) / CELL);
    if (r < 0 || r > 7 || c < 0 || c > 7) {
      this.selected = null;
      this.validMoves = [];
      return;
    }

    if (e.type === 'touchstart') {
      this.touchStart = { r, c };
    }

    if (e.type === 'mousedown') {
      // Select a piece on mousedown
      if (this.board[r][c] && this.board[r][c]!.color === this.turn && !this.aiThinking) {
        this.selected = { r, c };
        this.validMoves = this.getLegalMoves(this.board, r, c, this.castling);
      }
      return;
    }

    if (e.type === 'touchend' || e.type === 'mouseup') {
      const start = this.touchStart || { r, c };
      const rr = start.r, cc = start.c;
      if (this.touchStart) this.touchStart = null;

      // Click on same cell - deselect
      if (rr === r && cc === c && this.selected && this.selected.r === r && this.selected.c === c) {
        this.selected = null;
        this.validMoves = [];
        return;
      }

      // If we have a selected piece and click is a valid move
      if (this.selected && !this.aiThinking) {
        const isValid = this.validMoves.some(m => m.r === r && m.c === c);
        if (isValid) {
          const flags = this.validMoves.find(m => m.r === r && m.c === c)?.flags;
          const piece = this.board[this.selected.r][this.selected.c];

          // Check for pawn promotion
          if (piece?.type === 'P' && (r === 0 || r === 7)) {
            // Auto-promote to queen for simplicity
            this.makeMove(this.selected, { r, c }, flags);
            this.promotionPending = { from: this.selected, to: { r, c } };
            // Auto-select queen
            const t: PieceType = 'Q';
            this.board[r][c] = { type: t, color: piece.color };
            const last = this.moveHistory[this.moveHistory.length - 1];
            if (last) last.promotion = t;
            this.promotionPending = null;
            this.promotionResolve = null;
            this.turn = this.turn === 'w' ? 'b' : 'w';
            this.isCheck = this.isInCheck(this.turn);
            const legalMoves = this.getAllLegalMoves(this.turn);
            if (legalMoves.length === 0) {
              this.phase = 'gameover';
              if (this.isCheck) this.gameResult = this.turn === 'w' ? 'blackWin' : 'whiteWin';
              else this.gameResult = 'stalemate';
            }
            this.selected = null;
            this.validMoves = [];
            if (this.turn === 'b') this.asyncAI();
            return;
          }

          this.makeMove(this.selected, { r, c }, flags);
          this.selected = null;
          this.validMoves = [];
          if (this.turn === 'b') this.asyncAI();
          return;
        }
      }

      // Select a piece
      if (this.board[r][c] && this.board[r][c]!.color === this.turn && !this.aiThinking) {
        this.selected = { r, c };
        this.validMoves = this.getLegalMoves(this.board, r, c, this.castling);
      } else {
        this.selected = null;
        this.validMoves = [];
      }
    }
  }
}

// Fix the chess.ts reference to `c`
