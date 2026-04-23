import { BaseGame } from '../core/game.js';
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
function suitColor(suit, dark) {
    // 0=hearts, 1=diamonds (red), 2=clubs, 3=spades (black)
    if (suit < 2)
        return dark ? '#fc8181' : '#e53e3e';
    return dark ? '#e2e8f0' : '#1a202c';
}
function rankLabel(rank) {
    if (rank === 0)
        return 'A';
    if (rank <= 9)
        return String(rank + 1);
    if (rank === 10)
        return 'J';
    if (rank === 11)
        return 'Q';
    return 'K';
}
function suitSymbol(suit) {
    return ['♥', '♦', '♣', '♠'][suit];
}
export class SolitaireGame extends BaseGame {
    constructor() {
        super('gameCanvas', W, H);
        // Deck state
        this.deck = [];
        // 7 tableau columns
        this.tableau = [[], [], [], [], [], [], []];
        // Stock (face-down draw pile)
        this.stock = [];
        // Waste (face-up drawn cards)
        this.waste = [];
        // 4 foundations (build A->K by suit)
        this.foundations = [[], [], [], [], []];
        this.phase = 'ready';
        this.moves = 0;
        this.startTime = 0;
        this.elapsed = 0;
        this.reportedScore = false;
        // Selection state
        this.selectedSrc = null;
        // Hover highlight
        this.hoveredCard = null;
        // Drag state
        this.dragging = null;
        // Touch state
        this.touchStartTime = 0;
        this.touchStartPos = { x: 0, y: 0 };
        this.lastTap = { x: 0, y: 0, time: 0 };
        // Double-click detection
        this.doubleClickTimer = null;
    }
    start() {
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
    update(dt) {
        if (this.phase !== 'playing')
            return;
        this.elapsed = (performance.now() - this.startTime) / 1000;
    }
    draw(ctx) {
        const theme = this.getTheme();
        const zh = this.isZh();
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, theme.bgTop);
        grad.addColorStop(1, theme.bgBottom);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
        this.drawFoundations(ctx, theme);
        this.drawStockWaste(ctx, theme);
        this.drawTableau(ctx, theme, zh);
        this.drawHud(ctx, theme, zh);
        if (this.phase === 'ready' || this.phase === 'won') {
            this.drawOverlay(ctx, theme, zh);
        }
    }
    handleInput(e) {
        if (this.phase === 'ready' || this.phase === 'won') {
            if (e instanceof KeyboardEvent) {
                if (e.type === 'keydown' && (e.key === ' ' || e.key === 'Enter')) {
                    e.preventDefault();
                    if (this.phase === 'won')
                        this.beginGame();
                }
            }
            if (e instanceof MouseEvent) {
                if (e.type === 'mousedown') {
                    const clicked = this.getClickTarget(e.clientX, e.clientY);
                    if (!clicked)
                        return;
                    if (this.phase === 'ready' || this.phase === 'won')
                        this.beginGame();
                }
            }
            if (e instanceof TouchEvent) {
                if (e.type === 'touchstart') {
                    e.preventDefault();
                    if (this.phase === 'ready' || this.phase === 'won')
                        this.beginGame();
                }
            }
            return;
        }
        if (e instanceof KeyboardEvent) {
            if (e.type !== 'keydown')
                return;
            this.handleKey(e);
            return;
        }
        if (e instanceof TouchEvent) {
            if (e.type === 'touchstart') {
                e.preventDefault();
                const t = e.touches[0] || e.changedTouches[0];
                if (!t)
                    return;
                this.touchStartTime = Date.now();
                this.touchStartPos = { x: t.clientX, y: t.clientY };
                this.lastTap = { x: t.clientX, y: t.clientY, time: Date.now() };
            }
            if (e.type === 'touchend') {
                e.preventDefault();
                const t = e.touches[0] || e.changedTouches[0];
                if (!t)
                    return;
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
                if (!clicked)
                    return;
                // Double-click check
                const now = Date.now();
                const ddx = Math.abs(e.clientX - this.lastTap.x);
                const ddy = Math.abs(e.clientY - this.lastTap.y);
                if (ddx < 10 && ddy < 10 && now - this.lastTap.time < 350) {
                    this.handleDoubleClick(clicked);
                }
                else {
                    this.lastTap = { x: e.clientX, y: e.clientY, time: now };
                    this.handleClick(clicked);
                }
            }
            return;
        }
    }
    handleKey(e) {
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
            if (tab.length === 0)
                return;
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
    handleClick(target) {
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
                if (this.selectedSrc)
                    this.tryMoveToTableau(target.col);
                return;
            }
            const card = tab[tab.length - 1];
            if (this.selectedSrc) {
                // Try to move selected to this column
                this.tryMoveToTableau(target.col);
            }
            else {
                if (card.faceUp) {
                    this.selectedSrc = { type: 'tab', col: target.col, index: tab.length - 1, card };
                }
            }
            return;
        }
        if (target.type === 'waste') {
            if (this.waste.length === 0)
                return;
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
            }
            else {
                this.selectedSrc = { type: 'waste', card };
            }
        }
    }
    handleDoubleClick(target) {
        let card;
        if (target.type === 'tab' && target.col !== undefined) {
            const tab = this.tableau[target.col];
            if (tab.length === 0)
                return;
            card = tab[tab.length - 1];
        }
        else if (target.type === 'waste') {
            if (this.waste.length === 0)
                return;
            card = this.waste[this.waste.length - 1];
        }
        if (!card || !card.faceUp)
            return;
        // Try each foundation
        for (let f = 0; f < 4; f++) {
            if (this.canPlaceOnFoundation(card, f)) {
                if (target.type === 'tab' && target.col !== undefined) {
                    this.tableau[target.col].pop();
                    this.foundations[f].push(card);
                    this.moves++;
                    this.revealTopOfTableau();
                }
                else if (target.type === 'waste') {
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
    handleTap(clientX, clientY, isTouch) {
        const target = this.getClickTarget(clientX, clientY);
        if (!target)
            return;
        this.handleClick(target);
    }
    getClickTarget(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = this.canvas.width / rect.width;
        const sy = this.canvas.height / rect.height;
        const x = (clientX - rect.left) * sx;
        const y = (clientY - rect.top) * sy;
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
    drawFromStock() {
        if (this.stock.length === 0) {
            // Reset stock from waste
            if (this.waste.length === 0)
                return;
            while (this.waste.length > 0) {
                const c = this.waste.pop();
                c.faceUp = false;
                this.stock.push(c);
            }
            this.moves++;
        }
        else {
            const c = this.stock.pop();
            c.faceUp = true;
            this.waste.push(c);
            this.moves++;
        }
        this.selectedSrc = null;
        this.checkWin();
    }
    tryMoveToFoundation(foundIdx) {
        if (!this.selectedSrc)
            return;
        let card;
        if (this.selectedSrc.type === 'waste') {
            card = this.waste[this.waste.length - 1];
        }
        else if (this.selectedSrc.type === 'tab' && this.selectedSrc.col !== undefined) {
            const tab = this.tableau[this.selectedSrc.col];
            card = tab[tab.length - 1];
        }
        else {
            return;
        }
        if (!card || !this.canPlaceOnFoundation(card, foundIdx))
            return;
        if (this.selectedSrc.type === 'waste') {
            this.waste.pop();
        }
        else if (this.selectedSrc.type === 'tab' && this.selectedSrc.col !== undefined) {
            this.tableau[this.selectedSrc.col].pop();
        }
        this.foundations[foundIdx].push(card);
        this.moves++;
        this.selectedSrc = null;
        this.revealTopOfTableau();
        this.checkWin();
    }
    tryMoveToTableau(colIdx) {
        if (!this.selectedSrc)
            return;
        let cards = [];
        if (this.selectedSrc.type === 'waste') {
            cards = [this.waste[this.waste.length - 1]];
        }
        else if (this.selectedSrc.type === 'tab' && this.selectedSrc.col !== undefined) {
            const tab = this.tableau[this.selectedSrc.col];
            cards = tab.slice(this.selectedSrc.index);
        }
        else {
            return;
        }
        const dest = this.tableau[colIdx];
        if (dest.length === 0) {
            // Only Kings can go on empty columns
            if (cards[0].rank !== 12)
                return;
        }
        else {
            const top = dest[dest.length - 1];
            if (!this.canPlaceOnTableau(cards[0], dest))
                return;
        }
        if (this.selectedSrc.type === 'waste') {
            this.waste.pop();
        }
        else if (this.selectedSrc.type === 'tab' && this.selectedSrc.col !== undefined) {
            this.tableau[this.selectedSrc.col].splice(this.selectedSrc.index);
        }
        dest.push(...cards);
        this.moves++;
        this.selectedSrc = null;
        this.revealTopOfTableau();
        this.checkWin();
    }
    canPlaceOnTableau(card, dest) {
        if (dest.length === 0)
            return card.rank === 12; // King on empty
        const top = dest[dest.length - 1];
        if (!top.faceUp)
            return false;
        const cardColor = card.suit < 2 ? 0 : 1;
        const topColor = top.suit < 2 ? 0 : 1;
        return cardColor !== topColor && card.rank === top.rank - 1;
    }
    canPlaceOnFoundation(card, foundIdx) {
        const found = this.foundations[foundIdx];
        if (found.length === 0)
            return card.rank === 0; // Ace on empty
        const top = found[found.length - 1];
        return card.suit === top.suit && card.rank === top.rank + 1;
    }
    revealTopOfTableau() {
        for (const col of this.tableau) {
            if (col.length > 0 && !col[col.length - 1].faceUp) {
                col[col.length - 1].faceUp = true;
            }
        }
    }
    checkWin() {
        const total = this.foundations.reduce((s, f) => s + f.length, 0);
        if (total === 52) {
            this.phase = 'won';
            if (!this.reportedScore) {
                this.reportedScore = true;
                window.reportScore?.(this.score);
            }
        }
    }
    beginGame() {
        this.init();
        this.phase = 'playing';
        this.moves = 0;
        this.startTime = performance.now();
        this.selectedSrc = null;
        // Create deck
        const deck = [];
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
    get score() {
        // Score = moves bonus: fewer moves = higher score
        const timeBonus = Math.max(0, Math.round(100000 / (this.elapsed + 1)));
        const movePenalty = this.moves * 10;
        return Math.max(0, timeBonus - movePenalty + 50000);
    }
    // ─── Drawing helpers ─────────────────────────────────────────────
    drawFoundations(ctx, theme) {
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
            ctx.font = '8px "Press Start 2P", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(['H', 'D', 'C', 'S'][f], fx + CW / 2, FOUND_Y + CH / 2);
        }
    }
    drawStockWaste(ctx, theme) {
        // Stock
        if (this.stock.length > 0) {
            this.drawCard(ctx, STOCK_X, STOCK_Y, { suit: 0, rank: 0, faceUp: false }, false, theme);
            // Count badge
            ctx.fillStyle = theme.accent;
            ctx.font = '7px "Press Start 2P", monospace';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'top';
            ctx.fillText(String(this.stock.length), STOCK_X + CW - 3, STOCK_Y + 3);
        }
        else {
            this.drawEmptySlot(ctx, STOCK_X, STOCK_Y, theme);
            // Refresh icon
            ctx.fillStyle = theme.muted;
            ctx.font = '7px "Press Start 2P", monospace';
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
        }
        else {
            this.drawEmptySlot(ctx, WASTE_X, WASTE_Y, theme);
        }
    }
    drawTableau(ctx, theme, zh) {
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
                const highlight = selected &&
                    this.selectedSrc.index !== undefined &&
                    i >= this.selectedSrc.index;
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
    drawCard(ctx, x, y, card, highlight, theme) {
        const dark = this.isLightTheme() ? false : true;
        // Card background
        ctx.fillStyle = theme.cardFace;
        ctx.strokeStyle = highlight ? theme.accent : theme.border;
        ctx.lineWidth = highlight ? 2 : 1;
        ctx.beginPath();
        ctx.roundRect(x, y, CW, CH, CARD_R);
        ctx.fill();
        ctx.stroke();
        if (!card.faceUp) {
            // Card back
            ctx.fillStyle = theme.cardBack;
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
            ctx.fillStyle = theme.cardBackPattern;
            ctx.beginPath();
            ctx.roundRect(x + CW / 2 - 8, y + CH / 2 - 8, 16, 16, 3);
            ctx.fill();
            ctx.fillStyle = theme.cardBack;
            ctx.font = '8px "Press Start 2P", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('♠', x + CW / 2, y + CH / 2);
            return;
        }
        // Face-up card
        const color = suitColor(card.suit, !dark);
        ctx.fillStyle = color;
        // Top-left rank + suit
        ctx.font = '9px "Press Start 2P", monospace';
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
        // Bottom-right rank + suit (rotated)
        ctx.save();
        ctx.translate(x + CW - 4, y + CH - 4);
        ctx.rotate(Math.PI);
        ctx.fillStyle = color;
        ctx.font = '9px serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(suitSymbol(card.suit), 0, 0);
        ctx.font = '9px "Press Start 2P", monospace';
        ctx.fillText(rankLabel(card.rank), 8, 0);
        ctx.restore();
    }
    drawEmptySlot(ctx, x, y, theme) {
        ctx.strokeStyle = theme.emptySlot;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.roundRect(x, y, CW, CH, CARD_R);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    drawHud(ctx, theme, zh) {
        const hudH = 36;
        ctx.fillStyle = theme.surface;
        ctx.fillRect(0, 0, W, hudH);
        ctx.strokeStyle = theme.border;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, hudH);
        ctx.lineTo(W, hudH);
        ctx.stroke();
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.textBaseline = 'middle';
        // Moves
        ctx.fillStyle = theme.muted;
        ctx.textAlign = 'left';
        ctx.fillText(zh ? '步数' : 'MOVES', 12, hudH / 2 - 7);
        ctx.fillStyle = theme.text;
        ctx.font = '11px "Press Start 2P", monospace';
        ctx.fillText(String(this.moves), 12, hudH / 2 + 7);
        // Time
        const mins = Math.floor(this.elapsed / 60);
        const secs = Math.floor(this.elapsed % 60);
        const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.fillStyle = theme.muted;
        ctx.textAlign = 'center';
        ctx.fillText(zh ? '时间' : 'TIME', W / 2, hudH / 2 - 7);
        ctx.fillStyle = theme.text;
        ctx.font = '11px "Press Start 2P", monospace';
        ctx.fillText(timeStr, W / 2, hudH / 2 + 7);
        // Score
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.fillStyle = theme.muted;
        ctx.textAlign = 'right';
        ctx.fillText(zh ? '得分' : 'SCORE', W - 12, hudH / 2 - 7);
        ctx.fillStyle = theme.accent;
        ctx.font = '11px "Press Start 2P", monospace';
        ctx.fillText(String(this.score), W - 12, hudH / 2 + 7);
        // Foundations progress
        const totalFound = this.foundations.reduce((s, f) => s + f.length, 0);
        ctx.fillStyle = theme.muted;
        ctx.font = '7px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${totalFound}/52`, W / 2 + 80, hudH / 2);
    }
    drawOverlay(ctx, theme, zh) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, W, H);
        const cx = W / 2;
        const cy = H / 2;
        // Panel
        ctx.fillStyle = theme.surface;
        ctx.strokeStyle = theme.border;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(cx - 160, cy - 110, 320, 220, 16);
        ctx.fill();
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (this.phase === 'ready') {
            ctx.fillStyle = theme.accent;
            ctx.font = '16px "Press Start 2P", monospace';
            ctx.fillText(zh ? '纸牌' : 'SOLITAIRE', cx, cy - 60);
            ctx.fillStyle = theme.muted;
            ctx.font = '8px "Press Start 2P", monospace';
            ctx.fillText('Klondike', cx, cy - 35);
            ctx.fillStyle = theme.text;
            ctx.font = '8px "Press Start 2P", monospace';
            ctx.fillText(zh ? '点击任意位置开始' : 'TAP OR PRESS SPACE', cx, cy + 10);
            ctx.fillText(zh ? '空格：发牌  1-7：选列' : 'SPACE: draw  1-7: select col', cx, cy + 35);
            ctx.fillText(zh ? '双击：自动放到王牌' : 'Double-click: auto-move to foundation', cx, cy + 55);
            // Suit icons
            ctx.font = '18px serif';
            ctx.fillStyle = suitColor(0, !this.isLightTheme());
            ctx.fillText('♥', cx - 40, cy + 85);
            ctx.fillStyle = suitColor(1, !this.isLightTheme());
            ctx.fillText('♦', cx, cy + 85);
            ctx.fillStyle = suitColor(2, !this.isLightTheme());
            ctx.fillText('♣', cx + 40, cy + 85);
        }
        else {
            // Won
            ctx.fillStyle = theme.accent;
            ctx.font = '16px "Press Start 2P", monospace';
            ctx.fillText(zh ? '恭喜通关!' : 'YOU WIN!', cx, cy - 70);
            ctx.fillStyle = theme.text;
            ctx.font = '10px "Press Start 2P", monospace';
            ctx.fillText(`MOVES: ${this.moves}`, cx, cy - 30);
            const mins = Math.floor(this.elapsed / 60);
            const secs = Math.floor(this.elapsed % 60);
            ctx.fillText(`TIME: ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`, cx, cy);
            ctx.fillStyle = theme.accent;
            ctx.font = '11px "Press Start 2P", monospace';
            ctx.fillText(`SCORE: ${this.score}`, cx, cy + 35);
            ctx.fillStyle = theme.muted;
            ctx.font = '8px "Press Start 2P", monospace';
            ctx.fillText(zh ? '点击或空格再来一局' : 'TAP OR SPACE TO PLAY AGAIN', cx, cy + 70);
        }
    }
    getTheme() {
        const dark = !this.isLightTheme();
        if (dark) {
            return {
                bgTop: '#08141b',
                bgBottom: '#040b10',
                surface: 'rgba(15,23,42,0.90)',
                cardFace: '#1e293b',
                cardBack: '#0f3460',
                cardBackPattern: 'rgba(57,197,187,0.20)',
                border: 'rgba(57,197,187,0.30)',
                accent: '#39C5BB',
                text: '#f8fafc',
                muted: '#9fb3c8',
                emptySlot: 'rgba(57,197,187,0.20)',
            };
        }
        return {
            bgTop: '#f6fbfb',
            bgBottom: '#e4f4f3',
            surface: 'rgba(255,255,255,0.92)',
            cardFace: '#ffffff',
            cardBack: '#b8e0df',
            cardBackPattern: 'rgba(13,148,136,0.15)',
            border: 'rgba(13,148,136,0.30)',
            accent: '#0d9488',
            text: '#0f172a',
            muted: '#55727a',
            emptySlot: 'rgba(13,148,136,0.20)',
        };
    }
    isLightTheme() {
        const explicit = document.documentElement.getAttribute('data-theme');
        if (explicit === 'light')
            return true;
        if (explicit === 'dark')
            return false;
        return window.matchMedia('(prefers-color-scheme: light)').matches;
    }
    isZh() {
        return document.documentElement.getAttribute('data-lang') === 'zh';
    }
}
//# sourceMappingURL=solitaire.js.map