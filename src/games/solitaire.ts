import { BaseGame } from '../core/game.js';
import {
  getRetroPalette,
} from '../core/render.js';

const W = 480;
const H = 640;

// Card dimensions
const CW = 52; // card width
const CH = 74; // card height
const CARD_R = 6; // corner radius

// Layout positions
const MARGIN_X = 12;
const GAP_X = 4;

// Foundations: y=14, 4 piles
const FOUND_X = MARGIN_X;
const FOUND_Y = 14;
const FOUND_GAP = CW + 8;

// Stock/Waste: top right
const STOCK_X = W - MARGIN_X - CW;
const STOCK_Y = FOUND_Y;
const WASTE_X = STOCK_X - CW - 6;
const WASTE_Y = FOUND_Y;

// Tableau: y=110, 7 columns
const TAB_Y = 110;
const TAB_OFFSET_DOWN = 20; // face-down stack offset
const TAB_OFFSET_UP = 26; // face-up stack offset

function suitColor(suit: number, dark: boolean): string {
  // 0=hearts, 1=diamonds (red), 2=clubs, 3=spades (black)
  if (suit < 2) return dark ? '#fc8181' : '#e53e3e';
  return dark ? '#e2e8f0' : '#1a202c';
}

function rankLabel(rank: number): string {
  if (rank === 0) return 'A';
  if (rank <= 9) return String(rank + 1);
  if (rank === 10) return 'J';
  if (rank === 11) return 'Q';
  return 'K';
}

function suitSymbol(suit: number): string {
  return ['♥', '♦', '♣', '♠'][suit];
}

interface Card {
  suit: number; // 0-3: hearts, diamonds, clubs, spades
  rank: number; // 0=A, 1=2, ..., 10=J, 11=Q, 12=K
  faceUp: boolean;
}

interface ThemePalette {
  bgTop: string;
  bgBottom: string;
  surface: string;
  cardFace: string;
  cardBack: string;
  cardBackPattern: string;
  cardEdge: string;
  cardShadow: string;
  cardHighlight: string;
  border: string;
  accent: string;
  text: string;
  muted: string;
  emptySlot: string;
  slotFill: string;
}

type Phase = 'ready' | 'playing' | 'won';

type MoveRecord = {
  kind: 'tableau' | 'foundation' | 'stock' | 'waste-to-tab' | 'tab-to-found' | 'found-to-tab';
  cardIdx?: number;
  from?: number;
  to?: number;
  faceUp?: boolean;
  cards?: Card[];
  revealedCard?: Card;
  wasteCard?: Card;
};

export class SolitaireGame extends BaseGame {
  // Deck state
  private deck: Card[] = [];
  // 7 tableau columns
  private tableau: Card[][] = [[], [], [], [], [], [], []];
  // Stock (face-down draw pile)
  private stock: Card[] = [];
  // Waste (face-up drawn cards)
  private waste: Card[] = [];
  // 4 foundations (build A->K by suit)
  private foundations: Card[][] = [[], [], [], [], []];

  private phase: Phase = 'ready';
  private moves = 0;
  private startTime = 0;
  private elapsed = 0;
  private reportedScore = false;

  // Selection state
  private selectedSrc: { type: 'tab' | 'waste' | 'found'; col?: number; index?: number; card?: Card } | null = null;
  // Hover highlight
  private hoveredCard: { type: 'tab' | 'waste' | 'found'; col?: number; index?: number } | null = null;

  // Drag state
  private dragging: {
    type: 'tab' | 'waste';
    col?: number;
    index?: number;
    cards: Card[];
    ox: number;
    oy: number;
  } | null = null;

  // Touch state
  private touchStartTime = 0;
  private touchStartPos = { x: 0, y: 0 };
  private lastTap = { x: 0, y: 0, time: 0 };

  // Double-click detection
  private doubleClickTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super('gameCanvas', W, H);
  }

  override start() {
    super.start();
    this.beginGame();
  }

  init() {
    this.phase = 'ready';
    this.moves = 0;
    this.elapsed = 0;
    this.reportedScore = false;
    this.selectedSrc = null;
    this.hoveredCard = null;
    this.dragging = null;
    this.stock = [];
    this.waste = [];
    this.tableau = [[], [], [], [], [], [], []];
    this.foundations = [[], [], [], [], []];
    this.deck = [];
  }

  update(dt: number) {
    if (this.phase !== 'playing') return;
    this.elapsed = (performance.now() - this.startTime) / 1000;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const theme = this.getTheme();
    const zh = this.isZh();

    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, theme.bgTop);
    grad.addColorStop(1, theme.bgBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    this.drawTableTexture(ctx, theme);

    this.drawFoundations(ctx, theme);
    this.drawStockWaste(ctx, theme);
    this.drawTableau(ctx, theme, zh);
    this.drawHud(ctx, theme, zh);


    if (this.phase === 'ready' || this.phase === 'won') {
      this.drawOverlay(ctx, theme, zh);
    }
  }

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    if (this.phase === 'ready' || this.phase === 'won') {
      if (e instanceof KeyboardEvent) {
        if (e.type === 'keydown' && (e.key === ' ' || e.key === 'Enter')) {
          e.preventDefault();
          if (this.phase === 'won') this.beginGame();
        }
      }
      if (e instanceof MouseEvent) {
        if (e.type === 'mousedown') {
          const clicked = this.getClickTarget(e.clientX, e.clientY);
          if (!clicked) return;
          if (this.phase === 'ready' || this.phase === 'won') this.beginGame();
        }
      }
      if (e instanceof TouchEvent) {
        if (e.type === 'touchstart') {
          e.preventDefault();
          if (this.phase === 'ready' || this.phase === 'won') this.beginGame();
        }
      }
      return;
    }

    if (e instanceof KeyboardEvent) {
      if (e.type !== 'keydown') return;
      this.handleKey(e);
      return;
    }

    if (e instanceof TouchEvent) {
      if (e.type === 'touchstart') {
        e.preventDefault();
        const t = e.touches[0] || e.changedTouches[0];
        if (!t) return;
        this.touchStartTime = Date.now();
        this.touchStartPos = { x: t.clientX, y: t.clientY };
        this.lastTap = { x: t.clientX, y: t.clientY, time: Date.now() };
      }
      if (e.type === 'touchend') {
        e.preventDefault();
        const t = e.touches[0] || e.changedTouches[0];
        if (!t) return;
        const dx = Math.abs(t.clientX - this.touchStartPos.x);
        const dy = Math.abs(t.clientY - this.touchStartPos.y);
        const dt2 = Date.now() - this.touchStartTime;
        if (dx < 15 && dy < 15 && dt2 < 400) {
          this.handleTap(t.clientX, t.clientY, true);
        }
      }
      return;
    }

    if (e instanceof MouseEvent) {
      if (e.type === 'mousedown') {
        const clicked = this.getClickTarget(e.clientX, e.clientY);
        if (!clicked) return;

        // Double-click check
        const now = Date.now();
        const ddx = Math.abs(e.clientX - this.lastTap.x);
        const ddy = Math.abs(e.clientY - this.lastTap.y);
        if (ddx < 10 && ddy < 10 && now - this.lastTap.time < 350) {
          this.handleDoubleClick(clicked);
        } else {
          this.lastTap = { x: e.clientX, y: e.clientY, time: now };
          this.handleClick(clicked);
        }
      }
      return;
    }
  }

  private handleKey(e: KeyboardEvent) {
    const key = e.key;

    if (key === ' ') {
      e.preventDefault();
      this.drawFromStock();
      return;
    }

    // Tab selection by number 1-7
    if (key >= '1' && key <= '7') {
      const col = parseInt(key) - 1;
      const tab = this.tableau[col];
      if (tab.length === 0) return;
      // Select the bottom face-up card
      const card = tab[tab.length - 1];
      this.selectedSrc = { type: 'tab', col, index: tab.length - 1, card };
      return;
    }

    if (key === 'Escape') {
      this.selectedSrc = null;
      return;
    }
  }

  private handleClick(target: { type: 'tab' | 'waste' | 'found' | 'stock'; col?: number; index?: number }): void {
    if (target.type === 'stock') {
      this.drawFromStock();
      return;
    }

    if (target.type === 'found' && target.col !== undefined) {
      // Try to move selected card to foundation
      if (this.selectedSrc) {
        this.tryMoveToFoundation(target.col);
      }
      return;
    }

    if (target.type === 'tab' && target.col !== undefined) {
      const tab = this.tableau[target.col];
      if (tab.length === 0) {
        // Try to place selected card here
        if (this.selectedSrc) this.tryMoveToTableau(target.col);
        return;
      }
      const card = tab[tab.length - 1];
      if (this.selectedSrc) {
        // Try to move selected to this column
        this.tryMoveToTableau(target.col);
      } else {
        if (card.faceUp) {
          this.selectedSrc = { type: 'tab', col: target.col, index: tab.length - 1, card };
        }
      }
      return;
    }

    if (target.type === 'waste') {
      if (this.waste.length === 0) return;
      const card = this.waste[this.waste.length - 1];
      if (this.selectedSrc) {
        // Try to move waste card
        if (this.selectedSrc.type === 'tab' && this.selectedSrc.col !== undefined) {
          const tab = this.tableau[this.selectedSrc.col];
          if (this.canPlaceOnTableau(card, tab)) {
            tab.push(card);
            this.waste.pop();
            this.moves++;
            this.selectedSrc = null;
            this.revealTopOfTableau();
            this.checkWin();
          }
        }
      } else {
        this.selectedSrc = { type: 'waste', card };
      }
    }
  }

  private handleDoubleClick(target: { type: 'tab' | 'waste' | 'found' | 'stock'; col?: number; index?: number }) {
    let card: Card | undefined;
    if (target.type === 'tab' && target.col !== undefined) {
      const tab = this.tableau[target.col];
      if (tab.length === 0) return;
      card = tab[tab.length - 1];
    } else if (target.type === 'waste') {
      if (this.waste.length === 0) return;
      card = this.waste[this.waste.length - 1];
    }
    if (!card || !card.faceUp) return;

    // Try each foundation
    for (let f = 0; f < 4; f++) {
      if (this.canPlaceOnFoundation(card, f)) {
        if (target.type === 'tab' && target.col !== undefined) {
          this.tableau[target.col].pop();
          this.foundations[f].push(card);
          this.moves++;
          this.revealTopOfTableau();
        } else if (target.type === 'waste') {
          this.waste.pop();
          this.foundations[f].push(card);
          this.moves++;
        }
        this.selectedSrc = null;
        this.checkWin();
        return;
      }
    }
  }

  private handleTap(clientX: number, clientY: number, isTouch: boolean) {
    const target = this.getClickTarget(clientX, clientY);
    if (!target) return;
    this.handleClick(target);
  }

  private getClickTarget(clientX: number, clientY: number): { type: 'tab' | 'waste' | 'found' | 'stock'; col?: number; index?: number } | null {
    const { x, y } = this.canvasPoint(clientX, clientY);

    // Stock
    if (x >= STOCK_X && x <= STOCK_X + CW && y >= STOCK_Y && y <= STOCK_Y + CH) {
      return { type: 'stock' };
    }

    // Waste
    if (x >= WASTE_X && x <= WASTE_X + CW && y >= WASTE_Y && y <= WASTE_Y + CH) {
      return { type: 'waste' };
    }

    // Foundations
    for (let f = 0; f < 4; f++) {
      const fx = FOUND_X + f * FOUND_GAP;
      if (x >= fx && x <= fx + CW && y >= FOUND_Y && y <= FOUND_Y + CH) {
        return { type: 'found', col: f };
      }
    }

    // Tableau
    for (let c = 0; c < 7; c++) {
      const tx = MARGIN_X + c * (CW + GAP_X);
      let ty = TAB_Y;
      for (let i = 0; i < this.tableau[c].length; i++) {
        const offset = this.tableau[c][i].faceUp ? TAB_OFFSET_UP : TAB_OFFSET_DOWN;
        if (x >= tx && x <= tx + CW && y >= ty && y <= ty + CH) {
          return { type: 'tab', col: c, index: i };
        }
        ty += offset;
      }
    }

    return null;
  }

  private drawFromStock() {
    if (this.stock.length === 0) {
      // Reset stock from waste
      if (this.waste.length === 0) return;
      while (this.waste.length > 0) {
        const c = this.waste.pop()!;
        c.faceUp = false;
        this.stock.push(c);
      }
      this.moves++;
    } else {
      const c = this.stock.pop()!;
      c.faceUp = true;
      this.waste.push(c);
      this.moves++;
    }
    this.selectedSrc = null;
    this.checkWin();
  }

  private tryMoveToFoundation(foundIdx: number) {
    if (!this.selectedSrc) return;
    let card: Card | undefined;

    if (this.selectedSrc.type === 'waste') {
      card = this.waste[this.waste.length - 1];
    } else if (this.selectedSrc.type === 'tab' && this.selectedSrc.col !== undefined) {
      const tab = this.tableau[this.selectedSrc.col];
      card = tab[tab.length - 1];
    } else {
      return;
    }

    if (!card || !this.canPlaceOnFoundation(card, foundIdx)) return;

    if (this.selectedSrc.type === 'waste') {
      this.waste.pop();
    } else if (this.selectedSrc.type === 'tab' && this.selectedSrc.col !== undefined) {
      this.tableau[this.selectedSrc.col].pop();
    }

    this.foundations[foundIdx].push(card);
    this.moves++;
    this.selectedSrc = null;
    this.revealTopOfTableau();
    this.checkWin();
  }

  private tryMoveToTableau(colIdx: number) {
    if (!this.selectedSrc) return;
    let cards: Card[] = [];

    if (this.selectedSrc.type === 'waste') {
      cards = [this.waste[this.waste.length - 1]];
    } else if (this.selectedSrc.type === 'tab' && this.selectedSrc.col !== undefined) {
      const tab = this.tableau[this.selectedSrc.col];
      cards = tab.slice(this.selectedSrc.index!);
    } else {
      return;
    }

    const dest = this.tableau[colIdx];
    if (dest.length === 0) {
      // Only Kings can go on empty columns
      if (cards[0].rank !== 12) return;
    } else {
      const top = dest[dest.length - 1];
      if (!this.canPlaceOnTableau(cards[0], dest)) return;
    }

    if (this.selectedSrc.type === 'waste') {
      this.waste.pop();
    } else if (this.selectedSrc.type === 'tab' && this.selectedSrc.col !== undefined) {
      this.tableau[this.selectedSrc.col].splice(this.selectedSrc.index!);
    }

    dest.push(...cards);
    this.moves++;
    this.selectedSrc = null;
    this.revealTopOfTableau();
    this.checkWin();
  }

  private canPlaceOnTableau(card: Card, dest: Card[]): boolean {
    if (dest.length === 0) return card.rank === 12; // King on empty
    const top = dest[dest.length - 1];
    if (!top.faceUp) return false;
    const cardColor = card.suit < 2 ? 0 : 1;
    const topColor = top.suit < 2 ? 0 : 1;
    return cardColor !== topColor && card.rank === top.rank - 1;
  }

  private canPlaceOnFoundation(card: Card, foundIdx: number): boolean {
    const found = this.foundations[foundIdx];
    if (found.length === 0) return card.rank === 0; // Ace on empty
    const top = found[found.length - 1];
    return card.suit === top.suit && card.rank === top.rank + 1;
  }

  private revealTopOfTableau() {
    for (const col of this.tableau) {
      if (col.length > 0 && !col[col.length - 1].faceUp) {
        col[col.length - 1].faceUp = true;
      }
    }
  }

  private checkWin() {
    const total = this.foundations.reduce((s, f) => s + f.length, 0);
    if (total === 52) {
      this.phase = 'won';
      if (!this.reportedScore) {
        this.reportedScore = true;
        window.reportScore?.(this.score);
      }
    }
  }

  private beginGame() {
    this.init();
    this.phase = 'playing';
    this.moves = 0;
    this.startTime = performance.now();
    this.selectedSrc = null;

    // Create deck
    const deck: Card[] = [];
    for (let s = 0; s < 4; s++) {
      for (let r = 0; r < 13; r++) {
        deck.push({ suit: s, rank: r, faceUp: false });
      }
    }

    // Fisher-Yates shuffle
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    // Deal to tableau
    let deckIdx = 0;
    for (let c = 0; c < 7; c++) {
      for (let r = 0; r <= c; r++) {
        const card = deck[deckIdx++];
        card.faceUp = r === c; // Only top card face up
        this.tableau[c].push(card);
      }
    }

    // Rest goes to stock
    this.stock = deck.slice(deckIdx);
  }

  private get score(): number {
    // Score = moves bonus: fewer moves = higher score
    const timeBonus = Math.max(0, Math.round(100000 / (this.elapsed + 1)));
    const movePenalty = this.moves * 10;
    return Math.max(0, timeBonus - movePenalty + 50000);
  }

  // ─── Drawing helpers ─────────────────────────────────────────────

  private drawTableTexture(ctx: CanvasRenderingContext2D, theme: ThemePalette) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.035)';
    for (let y = 42; y < H; y += 18) {
      for (let x = (y / 18) % 2 === 0 ? 0 : 9; x < W; x += 18) {
        ctx.fillRect(x, y, 2, 2);
      }
    }
    ctx.strokeStyle = theme.emptySlot;
    ctx.lineWidth = 1;
    for (let x = 0.5; x < W; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 36);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawFoundations(ctx: CanvasRenderingContext2D, theme: ThemePalette) {
    for (let f = 0; f < 4; f++) {
      const fx = FOUND_X + f * FOUND_GAP;
      const pile = this.foundations[f];
      this.drawEmptySlot(ctx, fx, FOUND_Y, theme);
      if (pile.length > 0) {
        const top = pile[pile.length - 1];
        this.drawCard(ctx, fx, FOUND_Y, top, false, theme);
      }
      // Suit label
      ctx.fillStyle = theme.muted;
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(['H', 'D', 'C', 'S'][f], fx + CW / 2, FOUND_Y + CH / 2);
    }
  }

  private drawStockWaste(ctx: CanvasRenderingContext2D, theme: ThemePalette) {
    // Stock
    if (this.stock.length > 0) {
      this.drawCard(ctx, STOCK_X, STOCK_Y, { suit: 0, rank: 0, faceUp: false }, false, theme);
      // Count badge
      ctx.fillStyle = theme.accent;
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(String(this.stock.length), STOCK_X + CW - 3, STOCK_Y + 3);
    } else {
      this.drawEmptySlot(ctx, STOCK_X, STOCK_Y, theme);
      // Refresh icon
      ctx.fillStyle = theme.muted;
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⟳', STOCK_X + CW / 2, STOCK_Y + CH / 2);
    }

    // Waste (show top 1 or 3)
    if (this.waste.length > 0) {
      const top = this.waste[this.waste.length - 1];
      this.drawCard(ctx, WASTE_X, WASTE_Y, top, false, theme);

      // Selected highlight
      if (this.selectedSrc?.type === 'waste') {
        ctx.strokeStyle = theme.accent;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(WASTE_X, WASTE_Y, CW, CH, CARD_R);
        ctx.stroke();
      }
    } else {
      this.drawEmptySlot(ctx, WASTE_X, WASTE_Y, theme);
    }
  }

  private drawTableau(ctx: CanvasRenderingContext2D, theme: ThemePalette, zh: boolean) {
    for (let c = 0; c < 7; c++) {
      const tx = MARGIN_X + c * (CW + GAP_X);
      let ty = TAB_Y;
      const tab = this.tableau[c];

      // Selection highlight on column
      let selected = false;
      if (this.selectedSrc?.type === 'tab' && this.selectedSrc.col === c) {
        selected = true;
      }

      for (let i = 0; i < tab.length; i++) {
        const card = tab[i];
        const offset = card.faceUp ? TAB_OFFSET_UP : TAB_OFFSET_DOWN;
        const highlight =
          selected &&
          this.selectedSrc!.index !== undefined &&
          i >= this.selectedSrc!.index!;
        this.drawCard(ctx, tx, ty, card, highlight, theme);
        ty += offset;
      }

      // Empty column indicator
      if (tab.length === 0) {
        ctx.strokeStyle = theme.emptySlot;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.roundRect(tx, ty, CW, CH * 0.4, 4);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  private drawCard(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    card: Card,
    highlight: boolean,
    theme: ThemePalette
  ) {
    const dark = !this.isLightTheme();

    // Card background
    ctx.save();
    ctx.shadowColor = theme.cardShadow;
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    const faceGrad = ctx.createLinearGradient(x, y, x, y + CH);
    faceGrad.addColorStop(0, theme.cardHighlight);
    faceGrad.addColorStop(0.18, theme.cardFace);
    faceGrad.addColorStop(1, theme.cardEdge);
    ctx.fillStyle = faceGrad;
    ctx.strokeStyle = highlight ? theme.accent : theme.border;
    ctx.lineWidth = highlight ? 2 : 1;
    ctx.beginPath();
    ctx.roundRect(x, y, CW, CH, CARD_R);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.stroke();
    ctx.restore();

    if (!card.faceUp) {
      // Card back
      const backGrad = ctx.createLinearGradient(x, y, x + CW, y + CH);
      backGrad.addColorStop(0, theme.cardBack);
      backGrad.addColorStop(0.55, theme.accent);
      backGrad.addColorStop(1, theme.cardBack);
      ctx.fillStyle = backGrad;
      ctx.beginPath();
      ctx.roundRect(x + 2, y + 2, CW - 4, CH - 4, CARD_R - 1);
      ctx.fill();

      // Diagonal stripe pattern
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x + 2, y + 2, CW - 4, CH - 4, CARD_R - 1);
      ctx.clip();
      ctx.strokeStyle = theme.cardBackPattern;
      ctx.lineWidth = 1;
      for (let i = -CH; i < CW + CH; i += 7) {
        ctx.beginPath();
        ctx.moveTo(x + i, y);
        ctx.lineTo(x + i + CH, y + CH);
        ctx.stroke();
      }
      ctx.restore();

      // Center emblem
      ctx.fillStyle = 'rgba(255,255,255,0.24)';
      ctx.beginPath();
      ctx.roundRect(x + CW / 2 - 8, y + CH / 2 - 8, 16, 16, 3);
      ctx.fill();
      ctx.fillStyle = theme.cardBack;
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('♠', x + CW / 2, y + CH / 2);
      return;
    }

    // Face-up card
    const color = suitColor(card.suit, dark);
    ctx.fillStyle = color;

    // Top-left rank + suit
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(rankLabel(card.rank), x + 4, y + 4);
    ctx.font = '9px serif';
    ctx.fillText(suitSymbol(card.suit), x + 4 + 12, y + 4);

    // Center large suit
    ctx.font = '26px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(suitSymbol(card.suit), x + CW / 2, y + CH / 2);
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = color;
    ctx.fillText(suitSymbol(card.suit), x + CW / 2 + 7, y + CH / 2 + 8);
    ctx.globalAlpha = 1;

    // Bottom-right rank + suit (rotated)
    ctx.save();
    ctx.translate(x + CW - 4, y + CH - 4);
    ctx.rotate(Math.PI);
    ctx.fillStyle = color;
    ctx.font = '9px serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(suitSymbol(card.suit), 0, 0);
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(rankLabel(card.rank), 8, 0);
    ctx.restore();
  }

  private drawEmptySlot(ctx: CanvasRenderingContext2D, x: number, y: number, theme: ThemePalette) {
    ctx.fillStyle = theme.slotFill;
    ctx.beginPath();
    ctx.roundRect(x, y, CW, CH, CARD_R);
    ctx.fill();
    ctx.strokeStyle = theme.emptySlot;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.roundRect(x, y, CW, CH, CARD_R);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawHud(ctx: CanvasRenderingContext2D, theme: ThemePalette, zh: boolean) {
    const hudH = 36;
    ctx.fillStyle = theme.surface;
    ctx.fillRect(0, 0, W, hudH);
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, hudH);
    ctx.lineTo(W, hudH);
    ctx.stroke();

    ctx.font = '12px system-ui, sans-serif';
    ctx.textBaseline = 'middle';

    // Moves
    ctx.fillStyle = theme.muted;
    ctx.textAlign = 'left';
    ctx.fillText(zh ? '步数' : 'MOVES', 12, hudH / 2 - 7);
    ctx.fillStyle = theme.text;
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText(String(this.moves), 12, hudH / 2 + 7);

    // Time
    const mins = Math.floor(this.elapsed / 60);
    const secs = Math.floor(this.elapsed % 60);
    const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = theme.muted;
    ctx.textAlign = 'center';
    ctx.fillText(zh ? '时间' : 'TIME', W / 2, hudH / 2 - 7);
    ctx.fillStyle = theme.text;
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText(timeStr, W / 2, hudH / 2 + 7);

    // Foundations progress
    const totalFound = this.foundations.reduce((s, f) => s + f.length, 0);
    ctx.fillStyle = theme.muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${totalFound}/52`, W / 2 + 80, hudH / 2);
  }

  private drawOverlay(ctx: CanvasRenderingContext2D, theme: ThemePalette, zh: boolean) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, H);

    const cx = W / 2;
    const cy = H / 2;

    // Panel
    const p = getRetroPalette(this.isDarkTheme());
    ctx.fillStyle = p.panel;
    ctx.beginPath();
    ctx.roundRect(cx - 160, cy - 110, 320, 220, 12);
    ctx.fill();
    ctx.strokeStyle = p.border;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (this.phase === 'ready') {
      ctx.fillStyle = theme.accent;
      ctx.font = '110px system-ui, sans-serif';
      ctx.fillText(zh ? '纸牌' : 'SOLITAIRE', cx, cy - 60);

      ctx.fillStyle = theme.muted;
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText('Klondike', cx, cy - 35);

      ctx.fillStyle = theme.text;
      ctx.font = '12px system-ui, sans-serif';

      // Suit icons
      ctx.font = '18px serif';
      ctx.fillStyle = suitColor(0, !this.isLightTheme());
      ctx.fillText('♥', cx - 40, cy + 85);
      ctx.fillStyle = suitColor(1, !this.isLightTheme());
      ctx.fillText('♦', cx, cy + 85);
      ctx.fillStyle = suitColor(2, !this.isLightTheme());
      ctx.fillText('♣', cx + 40, cy + 85);
    } else {
      // Won
      ctx.fillStyle = theme.accent;
      ctx.font = '110px system-ui, sans-serif';
      ctx.fillText(zh ? '恭喜通关!' : 'YOU WIN!', cx, cy - 70);

      ctx.fillStyle = theme.text;
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillText(`MOVES: ${this.moves}`, cx, cy - 30);

      const mins = Math.floor(this.elapsed / 60);
      const secs = Math.floor(this.elapsed % 60);
      ctx.fillText(
        `TIME: ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`,
        cx,
        cy
      );

      ctx.fillStyle = theme.accent;
      ctx.font = '15px system-ui, sans-serif';
      ctx.fillText(`SCORE: ${this.score}`, cx, cy + 35);

      ctx.fillStyle = theme.muted;
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(zh ? '点击或空格再来一局' : 'TAP OR SPACE TO PLAY AGAIN', cx, cy + 70);
    }
  }

  private getTheme(): ThemePalette {
    const dark = !this.isLightTheme();
    if (dark) {
      return {
        bgTop: '#08141b',
        bgBottom: '#040b10',
        surface: 'rgba(15,23,42,0.90)',
        cardFace: '#f8fafc',
        cardBack: '#0f3460',
        cardBackPattern: 'rgba(226,232,240,0.22)',
        cardEdge: '#dbe8ef',
        cardShadow: 'rgba(0,0,0,0.38)',
        cardHighlight: '#ffffff',
        border: 'rgba(57,197,187,0.30)',
        accent: '#39C5BB',
        text: '#f8fafc',
        muted: '#9fb3c8',
        emptySlot: 'rgba(57,197,187,0.20)',
        slotFill: 'rgba(7,17,29,0.28)',
      };
    }
    return {
      bgTop: '#f6fbfb',
      bgBottom: '#e4f4f3',
      surface: 'rgba(255,255,255,0.92)',
      cardFace: '#ffffff',
      cardBack: '#b8e0df',
      cardBackPattern: 'rgba(13,148,136,0.15)',
      cardEdge: '#e2ecec',
      cardShadow: 'rgba(15,23,42,0.16)',
      cardHighlight: '#ffffff',
      border: 'rgba(13,148,136,0.30)',
      accent: '#0d9488',
      text: '#0f172a',
      muted: '#55727a',
      emptySlot: 'rgba(13,148,136,0.20)',
      slotFill: 'rgba(255,255,255,0.34)',
    };
  }

  private isLightTheme(): boolean {
    return !this.isDarkTheme();
  }

  private isZh(): boolean {
    return document.documentElement.getAttribute('data-lang') === 'zh';
  }
}
