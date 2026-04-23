import { BaseGame } from '../core/game.js';
const W = 440;
const H = 520;
const STARTING_CHIPS = 200;
const SMALL_BLIND = 10;
const BIG_BLIND = 20;
const TOTAL_HANDS = 10;
const CARD_W = 36;
const CARD_H = 50;
const CARD_GAP = 8;
const BUTTON_W = 96;
const BUTTON_H = 28;
const BUTTON_GAP = 8;
export class TexasHoldGame extends BaseGame {
    constructor() {
        super('gameCanvas', W, H);
        this.score = STARTING_CHIPS;
        this.players = [
            { seat: 0, name: 'You', nameZh: '你', isHuman: true, chips: STARTING_CHIPS, hole: [], folded: false, allIn: false, out: false, bet: 0, committed: 0, acted: false, lastAction: null, wonThisHand: 0 },
            { seat: 1, name: 'Bot A', nameZh: '甲机', isHuman: false, chips: STARTING_CHIPS, hole: [], folded: false, allIn: false, out: false, bet: 0, committed: 0, acted: false, lastAction: null, wonThisHand: 0 },
            { seat: 2, name: 'Bot B', nameZh: '乙机', isHuman: false, chips: STARTING_CHIPS, hole: [], folded: false, allIn: false, out: false, bet: 0, committed: 0, acted: false, lastAction: null, wonThisHand: 0 },
            { seat: 3, name: 'Bot C', nameZh: '丙机', isHuman: false, chips: STARTING_CHIPS, hole: [], folded: false, allIn: false, out: false, bet: 0, committed: 0, acted: false, lastAction: null, wonThisHand: 0 },
        ];
        this.seatLayout = [
            { x: W / 2, y: 344 },
            { x: 78, y: 96 },
            { x: W / 2, y: 52 },
            { x: W - 78, y: 96 },
        ];
        this.deck = [];
        this.community = [];
        this.logs = [];
        this.stage = 'preflop';
        this.state = 'playing';
        this.dealerIndex = -1;
        this.smallBlindIndex = 0;
        this.bigBlindIndex = 0;
        this.currentPlayerIndex = null;
        this.currentBet = 0;
        this.completedHands = 0;
        this.banner = { en: '', zh: '' };
        this.pendingSystemDelay = 0;
        this.pendingSystemAction = null;
        this.showdownHands = new Map();
        this.reportedScore = false;
    }
    init() {
        this.score = STARTING_CHIPS;
        this.state = 'playing';
        this.stage = 'preflop';
        this.dealerIndex = -1;
        this.smallBlindIndex = 0;
        this.bigBlindIndex = 0;
        this.currentPlayerIndex = null;
        this.currentBet = 0;
        this.completedHands = 0;
        this.logs = [];
        this.banner = { en: '', zh: '' };
        this.pendingSystemDelay = 0;
        this.pendingSystemAction = null;
        this.showdownHands.clear();
        this.reportedScore = false;
        for (const player of this.players) {
            player.chips = STARTING_CHIPS;
            this.resetPlayerForHand(player);
        }
        this.startNewHand();
    }
    update(dt) {
        if (this.state !== 'playing')
            return;
        if (this.pendingSystemAction) {
            this.pendingSystemDelay -= dt;
            if (this.pendingSystemDelay <= 0) {
                const action = this.pendingSystemAction;
                this.pendingSystemAction = null;
                this.pendingSystemDelay = 0;
                action();
            }
            return;
        }
        if (this.currentPlayerIndex === null)
            return;
        if (this.players[this.currentPlayerIndex]?.isHuman)
            return;
        this.scheduleSystemAction(0.65, () => this.performAiTurn());
    }
    draw(ctx) {
        const theme = this.getTheme();
        const zh = this.isZh();
        ctx.fillStyle = theme.bg;
        ctx.fillRect(0, 0, W, H);
        this.drawTable(ctx, theme);
        this.drawHeader(ctx, theme, zh);
        this.drawCommunity(ctx, theme, zh);
        this.drawPlayers(ctx, theme, zh);
        this.drawStatusBar(ctx, theme, zh);
        this.drawActionButtons(ctx, theme, zh);
        if (this.state !== 'playing') {
            this.drawOverlay(ctx, theme, zh);
        }
    }
    handleInput(e) {
        if (e instanceof KeyboardEvent) {
            if (e.type !== 'keydown')
                return;
            this.handleKeyInput(e);
            return;
        }
        if (e instanceof TouchEvent) {
            if (e.type !== 'touchstart')
                return;
            e.preventDefault();
            const touch = e.touches[0] ?? e.changedTouches[0];
            if (!touch)
                return;
            this.handlePointerInput(touch.clientX, touch.clientY);
            return;
        }
        if (e.type === 'mousedown') {
            this.handlePointerInput(e.clientX, e.clientY);
        }
    }
    destroy() {
        this.pendingSystemAction = null;
        this.pendingSystemDelay = 0;
        super.destroy();
    }
    handleKeyInput(e) {
        const key = e.key.toLowerCase();
        if (this.state === 'betweenHands' || this.state === 'gameOver') {
            if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                if (this.state === 'betweenHands') {
                    this.startNewHand();
                }
                else {
                    this.init();
                }
            }
            return;
        }
        if (!this.isHumanTurn())
            return;
        if (key === 'f') {
            this.handleHumanAction('fold');
        }
        else if (key === 'c') {
            this.handleHumanAction('call');
        }
        else if (key === 'r') {
            this.handleHumanAction('raise');
        }
        else if (key === 'a') {
            this.handleHumanAction('all-in');
        }
    }
    handlePointerInput(clientX, clientY) {
        if (this.state === 'betweenHands') {
            this.startNewHand();
            return;
        }
        if (this.state === 'gameOver') {
            this.init();
            return;
        }
        if (!this.isHumanTurn())
            return;
        const point = this.toCanvasPoint(clientX, clientY);
        if (!point)
            return;
        const button = this.getActionButtons().find((item) => point.x >= item.x &&
            point.x <= item.x + item.w &&
            point.y >= item.y &&
            point.y <= item.y + item.h);
        if (!button || !button.enabled)
            return;
        this.handleHumanAction(button.id);
    }
    handleHumanAction(action) {
        if (!this.isHumanTurn())
            return;
        this.performPlayerAction(0, action);
    }
    isHumanTurn() {
        return this.state === 'playing' &&
            this.pendingSystemAction === null &&
            this.currentPlayerIndex === 0 &&
            !this.players[0].folded &&
            !this.players[0].allIn &&
            !this.players[0].out;
    }
    startNewHand() {
        this.pendingSystemAction = null;
        this.pendingSystemDelay = 0;
        this.showdownHands.clear();
        this.community = [];
        this.logs = [];
        if (this.shouldEndTournament()) {
            this.finishTournament();
            return;
        }
        for (const player of this.players) {
            this.resetPlayerForHand(player);
            player.out = player.chips <= 0;
        }
        const live = this.getLivePlayerIndices();
        if (live.length < 2) {
            this.finishTournament();
            return;
        }
        this.dealerIndex = this.nextLivePlayerIndex(this.dealerIndex);
        const headsUp = live.length === 2;
        this.smallBlindIndex = headsUp ? this.dealerIndex : this.nextLivePlayerIndex(this.dealerIndex);
        this.bigBlindIndex = this.nextLivePlayerIndex(this.smallBlindIndex);
        this.stage = 'preflop';
        this.state = 'playing';
        this.currentBet = 0;
        this.banner = {
            en: `Hand ${this.completedHands + 1}/${TOTAL_HANDS}`,
            zh: `第 ${this.completedHands + 1}/${TOTAL_HANDS} 局`,
        };
        this.deck = this.createDeck();
        this.shuffleDeck(this.deck);
        for (let round = 0; round < 2; round += 1) {
            for (const index of live) {
                const card = this.deck.pop();
                if (card)
                    this.players[index].hole.push(card);
            }
        }
        this.postBlind(this.smallBlindIndex, SMALL_BLIND, 'SB', '小盲');
        this.postBlind(this.bigBlindIndex, BIG_BLIND, 'BB', '大盲');
        this.currentBet = this.players[this.bigBlindIndex].bet;
        const firstToAct = headsUp ? this.smallBlindIndex : this.nextActingPlayerIndex(this.bigBlindIndex);
        this.beginBettingRound(firstToAct, this.currentBet);
        this.pushLog(`Hand ${this.completedHands + 1}: blinds ${SMALL_BLIND}/${BIG_BLIND}`, `第 ${this.completedHands + 1} 局：盲注 ${SMALL_BLIND}/${BIG_BLIND}`);
    }
    beginBettingRound(firstPlayerIndex, currentBet) {
        this.currentBet = currentBet;
        for (const player of this.players) {
            player.acted = player.folded || player.allIn || player.out;
        }
        if (firstPlayerIndex === null) {
            this.currentPlayerIndex = null;
            this.scheduleSystemAction(0.8, () => this.advanceStreet());
            return;
        }
        const next = this.findNextEligibleFrom(firstPlayerIndex);
        this.currentPlayerIndex = next;
        if (this.currentPlayerIndex === null || this.isBettingRoundComplete()) {
            this.currentPlayerIndex = null;
            this.scheduleSystemAction(0.8, () => this.advanceStreet());
        }
    }
    performAiTurn() {
        if (this.currentPlayerIndex === null)
            return;
        const player = this.players[this.currentPlayerIndex];
        if (!player || player.isHuman || player.folded || player.allIn || player.out) {
            this.advanceToNextActor(this.currentPlayerIndex);
            return;
        }
        const action = this.chooseAiAction(this.currentPlayerIndex);
        this.performPlayerAction(this.currentPlayerIndex, action);
    }
    chooseAiAction(playerIndex) {
        const player = this.players[playerIndex];
        const toCall = Math.max(0, this.currentBet - player.bet);
        const strength = this.evaluateStrength(playerIndex);
        const raiseTo = this.getRaiseTarget(player);
        const canRaise = raiseTo > this.currentBet;
        const pressure = toCall / Math.max(1, this.getPotSize() + toCall);
        if (strength >= 92 && player.chips > 0 && (player.chips <= BIG_BLIND * 4 || pressure < 0.4)) {
            return 'all-in';
        }
        if (strength >= 76 && canRaise) {
            return 'raise';
        }
        if (toCall === 0) {
            return strength >= 62 && canRaise ? 'raise' : 'call';
        }
        if (strength >= 56) {
            return 'call';
        }
        if (strength >= 42 && toCall <= Math.max(BIG_BLIND, Math.floor(this.getPotSize() * 0.18))) {
            return 'call';
        }
        return 'fold';
    }
    performPlayerAction(playerIndex, requestedAction) {
        const player = this.players[playerIndex];
        if (!player || player.folded || player.out || player.allIn)
            return;
        const toCall = Math.max(0, this.currentBet - player.bet);
        let action = requestedAction;
        let aggressive = false;
        if (action === 'raise' && this.getRaiseTarget(player) <= this.currentBet) {
            action = player.chips > toCall ? 'all-in' : 'call';
        }
        if (action === 'fold') {
            player.folded = true;
            player.acted = true;
            player.lastAction = { en: 'Fold', zh: '弃牌' };
        }
        else if (action === 'call') {
            const amount = Math.min(player.chips, toCall);
            this.commitChips(player, amount);
            player.acted = true;
            if (toCall === 0) {
                player.lastAction = { en: 'Check', zh: '过牌' };
            }
            else if (amount < toCall) {
                player.lastAction = { en: `Call all-in ${player.bet}`, zh: `跟注全下 ${player.bet}` };
            }
            else {
                player.lastAction = { en: `Call ${toCall}`, zh: `跟注 ${toCall}` };
            }
        }
        else if (action === 'raise') {
            const target = this.getRaiseTarget(player);
            const amount = target - player.bet;
            this.commitChips(player, amount);
            this.currentBet = Math.max(this.currentBet, player.bet);
            aggressive = true;
            player.acted = true;
            player.lastAction = { en: `Raise to ${player.bet}`, zh: `加注到 ${player.bet}` };
        }
        else if (action === 'all-in') {
            const target = player.bet + player.chips;
            const amount = player.chips;
            this.commitChips(player, amount);
            if (target > this.currentBet) {
                this.currentBet = target;
                aggressive = true;
            }
            player.acted = true;
            player.lastAction = { en: `All-in ${target}`, zh: `全下 ${target}` };
        }
        if (aggressive) {
            for (const other of this.players) {
                other.acted = other.folded || other.allIn || other.out;
            }
            player.acted = true;
        }
        if (player.folded) {
            this.pushLog(`${player.name} folds`, `${player.nameZh} 弃牌`);
        }
        else if (player.lastAction) {
            this.pushLog(`${player.name}: ${player.lastAction.en}`, `${player.nameZh}：${player.lastAction.zh}`);
        }
        if (this.getContendingPlayers().length === 1) {
            const winner = this.getContendingPlayers()[0];
            if (winner !== undefined) {
                this.awardFoldWin(winner);
            }
            return;
        }
        this.advanceToNextActor(playerIndex);
    }
    advanceToNextActor(fromIndex) {
        if (this.isBettingRoundComplete()) {
            this.currentPlayerIndex = null;
            this.scheduleSystemAction(0.9, () => this.advanceStreet());
            return;
        }
        this.currentPlayerIndex = this.findNextEligibleFrom(fromIndex);
        if (this.currentPlayerIndex === null) {
            this.scheduleSystemAction(0.9, () => this.advanceStreet());
        }
    }
    advanceStreet() {
        this.pendingSystemAction = null;
        this.pendingSystemDelay = 0;
        if (this.getContendingPlayers().length <= 1) {
            const winner = this.getContendingPlayers()[0];
            if (winner !== undefined)
                this.awardFoldWin(winner);
            return;
        }
        for (const player of this.players) {
            player.bet = 0;
            player.acted = player.folded || player.allIn || player.out;
        }
        this.currentBet = 0;
        if (this.stage === 'preflop') {
            this.stage = 'flop';
            this.dealCommunityCards(3);
            this.pushLog('Flop dealt', '翻牌发出');
        }
        else if (this.stage === 'flop') {
            this.stage = 'turn';
            this.dealCommunityCards(1);
            this.pushLog('Turn dealt', '转牌发出');
        }
        else if (this.stage === 'turn') {
            this.stage = 'river';
            this.dealCommunityCards(1);
            this.pushLog('River dealt', '河牌发出');
        }
        else if (this.stage === 'river') {
            this.stage = 'showdown';
            this.resolveShowdown();
            return;
        }
        const first = this.nextActingPlayerIndex(this.dealerIndex);
        this.beginBettingRound(first, 0);
    }
    resolveShowdown() {
        this.currentPlayerIndex = null;
        this.showdownHands.clear();
        const contenders = this.players
            .map((player, index) => ({ player, index }))
            .filter(({ player }) => !player.folded && player.hole.length === 2);
        for (const contender of contenders) {
            const hand = this.evaluateBestHand([...contender.player.hole, ...this.community]);
            this.showdownHands.set(contender.index, hand);
        }
        const levels = Array.from(new Set(this.players.map((player) => player.committed).filter((amount) => amount > 0))).sort((a, b) => a - b);
        let previousLevel = 0;
        for (const level of levels) {
            const segment = this.players.reduce((sum, player) => {
                return sum + Math.max(0, Math.min(player.committed, level) - previousLevel);
            }, 0);
            if (segment <= 0) {
                previousLevel = level;
                continue;
            }
            const eligible = contenders.filter(({ player }) => player.committed >= level);
            if (eligible.length === 0) {
                previousLevel = level;
                continue;
            }
            let winners = [eligible[0].index];
            let bestHand = this.showdownHands.get(eligible[0].index);
            for (let i = 1; i < eligible.length; i += 1) {
                const challenger = eligible[i].index;
                const challengerHand = this.showdownHands.get(challenger);
                const comparison = this.compareHands(challengerHand, bestHand);
                if (comparison > 0) {
                    winners = [challenger];
                    bestHand = challengerHand;
                }
                else if (comparison === 0) {
                    winners.push(challenger);
                }
            }
            const orderedWinners = winners.sort((a, b) => this.distanceFromDealer(a) - this.distanceFromDealer(b));
            const share = Math.floor(segment / orderedWinners.length);
            let remainder = segment % orderedWinners.length;
            for (const winnerIndex of orderedWinners) {
                const payout = share + (remainder > 0 ? 1 : 0);
                if (remainder > 0)
                    remainder -= 1;
                this.players[winnerIndex].chips += payout;
                this.players[winnerIndex].wonThisHand += payout;
            }
            const names = orderedWinners.map((index) => this.players[index].name).join(' / ');
            const namesZh = orderedWinners.map((index) => this.players[index].nameZh).join(' / ');
            this.pushLog(`${names} win ${segment} with ${bestHand.label}`, `${namesZh} 以 ${bestHand.labelZh} 赢得 ${segment}`);
            previousLevel = level;
        }
        this.finishHand();
    }
    awardFoldWin(winnerIndex) {
        const pot = this.getPotSize();
        this.players[winnerIndex].chips += pot;
        this.players[winnerIndex].wonThisHand += pot;
        this.pushLog(`${this.players[winnerIndex].name} wins ${pot} uncontested`, `${this.players[winnerIndex].nameZh} 直接收下 ${pot}`);
        this.finishHand();
    }
    finishHand() {
        this.pendingSystemAction = null;
        this.pendingSystemDelay = 0;
        this.currentPlayerIndex = null;
        this.stage = 'showdown';
        this.completedHands += 1;
        this.score = this.players[0].chips;
        for (const player of this.players) {
            player.out = player.chips <= 0;
            if (player.wonThisHand > 0) {
                player.lastAction = { en: `Won ${player.wonThisHand}`, zh: `赢得 ${player.wonThisHand}` };
            }
            else if (player.folded) {
                player.lastAction = player.lastAction ?? { en: 'Folded', zh: '已弃牌' };
            }
            else if (player.out) {
                player.lastAction = { en: 'Busted', zh: '出局' };
            }
        }
        if (this.shouldEndTournament()) {
            this.finishTournament();
            return;
        }
        this.state = 'betweenHands';
        this.banner = {
            en: `Hand ${this.completedHands} complete. Press Space or Enter.`,
            zh: `第 ${this.completedHands} 局结束。按 Space 或 Enter。`,
        };
    }
    finishTournament() {
        this.state = 'gameOver';
        this.currentPlayerIndex = null;
        this.score = this.players[0].chips;
        this.banner = {
            en: `Tournament over. Score ${this.score}.`,
            zh: `牌局结束。得分 ${this.score}。`,
        };
        if (!this.reportedScore) {
            this.reportedScore = true;
            window.reportScore?.(this.score);
        }
    }
    shouldEndTournament() {
        const human = this.players[0];
        const opponentsAlive = this.players.slice(1).some((player) => player.chips > 0);
        return human.chips <= 0 || this.completedHands >= TOTAL_HANDS || !opponentsAlive;
    }
    resetPlayerForHand(player) {
        player.hole = [];
        player.folded = false;
        player.allIn = false;
        player.bet = 0;
        player.committed = 0;
        player.acted = false;
        player.lastAction = null;
        player.wonThisHand = 0;
    }
    postBlind(index, amount, label, labelZh) {
        const player = this.players[index];
        const posted = Math.min(player.chips, amount);
        this.commitChips(player, posted);
        player.lastAction = { en: `${label} ${posted}`, zh: `${labelZh} ${posted}` };
    }
    commitChips(player, amount) {
        if (amount <= 0)
            return;
        player.chips -= amount;
        player.bet += amount;
        player.committed += amount;
        if (player.chips <= 0) {
            player.chips = 0;
            player.allIn = true;
        }
    }
    getRaiseTarget(player) {
        const unit = this.getBetUnit();
        const maxTotal = player.bet + player.chips;
        if (maxTotal <= this.currentBet)
            return this.currentBet;
        const minRaiseTo = this.currentBet === 0 ? unit : this.currentBet + unit;
        return maxTotal >= minRaiseTo ? minRaiseTo : this.currentBet;
    }
    getBetUnit() {
        return this.stage === 'turn' || this.stage === 'river' ? BIG_BLIND * 2 : BIG_BLIND;
    }
    isBettingRoundComplete() {
        const contenders = this.getContendingPlayers();
        if (contenders.length <= 1)
            return true;
        return !this.players.some((player) => !player.folded &&
            !player.out &&
            !player.allIn &&
            (!player.acted || player.bet !== this.currentBet));
    }
    getContendingPlayers() {
        return this.players
            .map((player, index) => ({ player, index }))
            .filter(({ player }) => !player.folded && !player.out && player.hole.length === 2)
            .map(({ index }) => index);
    }
    getLivePlayerIndices() {
        return this.players
            .map((player, index) => ({ player, index }))
            .filter(({ player }) => player.chips > 0)
            .map(({ index }) => index);
    }
    nextLivePlayerIndex(fromIndex) {
        for (let step = 1; step <= this.players.length; step += 1) {
            const index = (fromIndex + step + this.players.length) % this.players.length;
            if (this.players[index].chips > 0)
                return index;
        }
        return 0;
    }
    nextActingPlayerIndex(fromIndex) {
        return this.findNextEligibleFrom(fromIndex);
    }
    findNextEligibleFrom(fromIndex) {
        for (let step = 1; step <= this.players.length; step += 1) {
            const index = (fromIndex + step + this.players.length) % this.players.length;
            const player = this.players[index];
            if (!player.folded && !player.out && !player.allIn && player.hole.length === 2) {
                return index;
            }
        }
        return null;
    }
    distanceFromDealer(index) {
        return (index - this.dealerIndex + this.players.length) % this.players.length;
    }
    getPotSize() {
        return this.players.reduce((sum, player) => sum + player.committed, 0);
    }
    scheduleSystemAction(delay, action) {
        if (this.pendingSystemAction)
            return;
        this.pendingSystemDelay = delay;
        this.pendingSystemAction = action;
    }
    dealCommunityCards(count) {
        for (let i = 0; i < count; i += 1) {
            const card = this.deck.pop();
            if (card)
                this.community.push(card);
        }
    }
    evaluateStrength(playerIndex) {
        const player = this.players[playerIndex];
        if (player.hole.length < 2)
            return 0;
        if (this.stage === 'preflop') {
            return this.evaluatePreflopStrength(player.hole);
        }
        const cards = [...player.hole, ...this.community];
        const hand = this.evaluateBestHand(cards);
        const counts = this.getRankCounts(cards);
        const highPair = Array.from(counts.entries())
            .filter(([, count]) => count >= 2)
            .map(([rank]) => rank)
            .sort((a, b) => b - a)[0] ?? 0;
        let score = 18;
        if (hand.category >= 7)
            score = 99;
        else if (hand.category === 6)
            score = 96;
        else if (hand.category === 5)
            score = 92;
        else if (hand.category === 4)
            score = 86;
        else if (hand.category === 3)
            score = 77;
        else if (hand.category === 2)
            score = 67;
        else if (hand.category === 1)
            score = 44 + highPair;
        else
            score = 18 + Math.max(player.hole[0].rank, player.hole[1].rank);
        if (this.hasFlushDraw(cards))
            score += 10;
        if (this.hasStraightDraw(cards))
            score += 8;
        if (player.hole[0].rank === player.hole[1].rank)
            score += 4;
        return Math.max(0, Math.min(100, score));
    }
    evaluatePreflopStrength(hole) {
        const ranks = hole.map((card) => card.rank).sort((a, b) => b - a);
        const suited = hole[0].suit === hole[1].suit;
        const pair = ranks[0] === ranks[1];
        const gap = ranks[0] - ranks[1];
        const bothBroadway = ranks[0] >= 10 && ranks[1] >= 10;
        let score = ranks[0] * 2 + ranks[1];
        if (pair)
            score = 38 + ranks[0] * 4;
        if (suited)
            score += 8;
        if (gap === 1)
            score += 7;
        else if (gap === 2)
            score += 4;
        if (bothBroadway)
            score += 10;
        if (ranks[0] === 14)
            score += 8;
        if (ranks[0] + ranks[1] >= 24)
            score += 8;
        return Math.max(0, Math.min(100, score));
    }
    hasFlushDraw(cards) {
        const suits = [0, 0, 0, 0];
        for (const card of cards)
            suits[card.suit] += 1;
        return suits.some((count) => count === 4);
    }
    hasStraightDraw(cards) {
        const values = new Set();
        for (const card of cards) {
            values.add(card.rank);
            if (card.rank === 14)
                values.add(1);
        }
        for (let start = 1; start <= 10; start += 1) {
            let count = 0;
            for (let value = start; value < start + 5; value += 1) {
                if (values.has(value))
                    count += 1;
            }
            if (count === 4)
                return true;
        }
        return false;
    }
    evaluateBestHand(cards) {
        const counts = this.getRankCounts(cards);
        const groups = Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || b[0] - a[0]);
        const distinctRanks = Array.from(new Set(cards.map((card) => card.rank))).sort((a, b) => b - a);
        const flushSuit = [0, 1, 2, 3].find((suit) => cards.filter((card) => card.suit === suit).length >= 5);
        const straightHigh = this.findStraightHigh(distinctRanks);
        if (flushSuit !== undefined) {
            const flushRanks = cards
                .filter((card) => card.suit === flushSuit)
                .map((card) => card.rank)
                .sort((a, b) => b - a);
            const straightFlushHigh = this.findStraightHigh(flushRanks);
            if (straightFlushHigh > 0) {
                return { category: 8, tiebreakers: [straightFlushHigh], label: 'Straight Flush', labelZh: '同花顺' };
            }
        }
        const fourKind = groups.find(([, count]) => count === 4);
        if (fourKind) {
            const kicker = distinctRanks.find((rank) => rank !== fourKind[0]) ?? 0;
            return { category: 7, tiebreakers: [fourKind[0], kicker], label: 'Four of a Kind', labelZh: '四条' };
        }
        const trips = groups.filter(([, count]) => count === 3).map(([rank]) => rank);
        const pairs = groups.filter(([, count]) => count >= 2).map(([rank]) => rank);
        if (trips.length >= 1 && pairs.filter((rank) => rank !== trips[0]).length >= 1) {
            const pairRank = pairs.find((rank) => rank !== trips[0]) ?? 0;
            return { category: 6, tiebreakers: [trips[0], pairRank], label: 'Full House', labelZh: '葫芦' };
        }
        if (trips.length >= 2) {
            return { category: 6, tiebreakers: [trips[0], trips[1]], label: 'Full House', labelZh: '葫芦' };
        }
        if (flushSuit !== undefined) {
            const topFlush = cards
                .filter((card) => card.suit === flushSuit)
                .map((card) => card.rank)
                .sort((a, b) => b - a)
                .slice(0, 5);
            return { category: 5, tiebreakers: topFlush, label: 'Flush', labelZh: '同花' };
        }
        if (straightHigh > 0) {
            return { category: 4, tiebreakers: [straightHigh], label: 'Straight', labelZh: '顺子' };
        }
        if (trips.length >= 1) {
            const kickers = distinctRanks.filter((rank) => rank !== trips[0]).slice(0, 2);
            return { category: 3, tiebreakers: [trips[0], ...kickers], label: 'Three of a Kind', labelZh: '三条' };
        }
        const pairRanks = groups.filter(([, count]) => count === 2).map(([rank]) => rank);
        if (pairRanks.length >= 2) {
            const topPairs = pairRanks.slice(0, 2);
            const kicker = distinctRanks.find((rank) => rank !== topPairs[0] && rank !== topPairs[1]) ?? 0;
            return { category: 2, tiebreakers: [...topPairs, kicker], label: 'Two Pair', labelZh: '两对' };
        }
        if (pairRanks.length === 1) {
            const kickers = distinctRanks.filter((rank) => rank !== pairRanks[0]).slice(0, 3);
            return { category: 1, tiebreakers: [pairRanks[0], ...kickers], label: 'Pair', labelZh: '一对' };
        }
        return { category: 0, tiebreakers: distinctRanks.slice(0, 5), label: 'High Card', labelZh: '高牌' };
    }
    compareHands(a, b) {
        if (a.category !== b.category)
            return a.category - b.category;
        const length = Math.max(a.tiebreakers.length, b.tiebreakers.length);
        for (let i = 0; i < length; i += 1) {
            const left = a.tiebreakers[i] ?? 0;
            const right = b.tiebreakers[i] ?? 0;
            if (left !== right)
                return left - right;
        }
        return 0;
    }
    getRankCounts(cards) {
        const counts = new Map();
        for (const card of cards) {
            counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
        }
        return counts;
    }
    findStraightHigh(ranks) {
        const values = Array.from(new Set(ranks));
        if (values.includes(14))
            values.push(1);
        values.sort((a, b) => a - b);
        let run = 1;
        let best = 0;
        for (let i = 1; i < values.length; i += 1) {
            if (values[i] === values[i - 1] + 1) {
                run += 1;
                if (run >= 5)
                    best = values[i];
            }
            else if (values[i] !== values[i - 1]) {
                run = 1;
            }
        }
        return best;
    }
    createDeck() {
        const deck = [];
        for (let suit = 0; suit <= 3; suit = (suit + 1)) {
            for (let rank = 2; rank <= 14; rank += 1) {
                deck.push({ rank, suit });
            }
        }
        return deck;
    }
    shuffleDeck(deck) {
        for (let i = deck.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
    }
    pushLog(en, zh) {
        this.logs.unshift({ en, zh });
        this.logs = this.logs.slice(0, 4);
    }
    toCanvasPoint(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        if (!rect.width || !rect.height)
            return null;
        return {
            x: (clientX - rect.left) * (this.width / rect.width),
            y: (clientY - rect.top) * (this.height / rect.height),
        };
    }
    getTheme() {
        const isDark = !document.documentElement.hasAttribute('data-theme') ||
            document.documentElement.getAttribute('data-theme') === 'dark';
        return {
            bg: isDark ? '#0b0f19' : '#fafafa',
            felt: isDark ? '#10273a' : '#dff7f3',
            surface: isDark ? '#162133' : '#ffffff',
            surfaceMuted: isDark ? '#0f1724' : '#e7ecef',
            border: isDark ? '#274059' : '#b8c7cf',
            primary: isDark ? '#39C5BB' : '#0d9488',
            text: isDark ? '#edf2f7' : '#17202a',
            muted: isDark ? '#94a3b8' : '#5f6b76',
            cardFace: isDark ? '#f8fafc' : '#ffffff',
            cardBack: isDark ? '#17324b' : '#d6f4ef',
            cardBackAlt: isDark ? '#39C5BB' : '#0d9488',
            red: '#d64545',
            black: '#1f2937',
            shadow: isDark ? 'rgba(0,0,0,0.35)' : 'rgba(15,23,42,0.12)',
        };
    }
    isZh() {
        return document.documentElement.getAttribute('data-lang') === 'zh';
    }
    drawTable(ctx, theme) {
        ctx.save();
        ctx.fillStyle = theme.felt;
        this.roundRect(ctx, 18, 26, W - 36, 418, 26);
        ctx.fill();
        ctx.strokeStyle = theme.border;
        ctx.lineWidth = 2;
        this.roundRect(ctx, 18, 26, W - 36, 418, 26);
        ctx.stroke();
        ctx.strokeStyle = `${theme.primary}55`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(W / 2, 236, 146, 92, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }
    drawHeader(ctx, theme, zh) {
        ctx.fillStyle = theme.text;
        ctx.font = '10px "Press Start 2P", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(zh ? '德州扑克' : 'Texas Holdem', 20, 20);
        ctx.textAlign = 'right';
        ctx.fillStyle = theme.primary;
        ctx.fillText(zh ? `筹码 ${this.players[0].chips}` : `Chips ${this.players[0].chips}`, W - 20, 20);
        ctx.textAlign = 'center';
        ctx.fillStyle = theme.text;
        ctx.font = '9px "Press Start 2P", monospace';
        const streetLabel = this.getStreetLabel(zh);
        const dealerName = zh ? this.players[this.dealerIndex]?.nameZh ?? '--' : this.players[this.dealerIndex]?.name ?? '--';
        ctx.fillText(`${streetLabel}  ${zh ? '庄' : 'D'}:${dealerName}`, W / 2, 158);
        ctx.fillText(`${zh ? '底池' : 'POT'} ${this.getPotSize()}`, W / 2, 174);
    }
    drawCommunity(ctx, theme, zh) {
        const totalWidth = CARD_W * 5 + CARD_GAP * 4;
        const startX = (W - totalWidth) / 2;
        const y = 188;
        for (let i = 0; i < 5; i += 1) {
            const x = startX + i * (CARD_W + CARD_GAP);
            const card = this.community[i];
            if (card) {
                this.drawCard(ctx, x, y, card, true, theme, false);
            }
            else {
                ctx.save();
                ctx.globalAlpha = 0.5;
                ctx.fillStyle = theme.surfaceMuted;
                this.roundRect(ctx, x, y, CARD_W, CARD_H, 6);
                ctx.fill();
                ctx.strokeStyle = theme.border;
                ctx.stroke();
                ctx.restore();
            }
        }
        ctx.textAlign = 'center';
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.fillStyle = theme.muted;
        ctx.fillText(zh ? '公共牌' : 'BOARD', W / 2, y - 10);
    }
    drawPlayers(ctx, theme, zh) {
        for (let index = 0; index < this.players.length; index += 1) {
            const player = this.players[index];
            const seat = this.seatLayout[index];
            const reveal = player.isHuman || this.state !== 'playing' || this.stage === 'showdown' || player.folded;
            const cardY = player.isHuman ? seat.y : seat.y;
            const leftX = seat.x - (CARD_W + CARD_GAP / 2);
            const rightX = seat.x + CARD_GAP / 2;
            const dim = player.folded || player.out;
            if (player.hole[0])
                this.drawCard(ctx, leftX, cardY, player.hole[0], reveal, theme, dim);
            if (player.hole[1])
                this.drawCard(ctx, rightX, cardY, player.hole[1], reveal, theme, dim);
            ctx.save();
            ctx.globalAlpha = dim ? 0.55 : 1;
            ctx.textAlign = 'center';
            ctx.fillStyle = theme.text;
            ctx.font = '8px "Press Start 2P", monospace';
            const name = zh ? player.nameZh : player.name;
            const labelY = player.isHuman ? cardY + CARD_H + 16 : cardY + CARD_H + 14;
            ctx.fillText(name, seat.x, labelY);
            ctx.fillStyle = theme.muted;
            ctx.fillText(`${zh ? '筹码' : 'CHIPS'} ${player.chips}`, seat.x, labelY + 12);
            if (player.bet > 0) {
                ctx.fillStyle = theme.primary;
                ctx.fillText(`${zh ? '本轮' : 'BET'} ${player.bet}`, seat.x, labelY + 24);
            }
            if (player.lastAction) {
                ctx.fillStyle = player.wonThisHand > 0 ? theme.primary : theme.muted;
                ctx.fillText(zh ? player.lastAction.zh : player.lastAction.en, seat.x, labelY + 36);
            }
            else if (player.out) {
                ctx.fillStyle = theme.red;
                ctx.fillText(zh ? '出局' : 'OUT', seat.x, labelY + 36);
            }
            if (this.showdownHands.has(index) && !player.folded) {
                const hand = this.showdownHands.get(index);
                ctx.fillStyle = theme.primary;
                ctx.fillText(zh ? hand.labelZh : hand.label, seat.x, labelY + 48);
            }
            if (this.currentPlayerIndex === index && this.state === 'playing') {
                ctx.strokeStyle = theme.primary;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(seat.x, cardY - 10, 8, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.restore();
            this.drawSeatMarkers(ctx, theme, index, seat.x, player.isHuman ? cardY + CARD_H + 56 : cardY - 8);
        }
    }
    drawSeatMarkers(ctx, theme, index, x, y) {
        const markers = [];
        if (index === this.dealerIndex)
            markers.push('D');
        if (index === this.smallBlindIndex)
            markers.push('SB');
        if (index === this.bigBlindIndex)
            markers.push('BB');
        if (markers.length === 0)
            return;
        ctx.save();
        ctx.font = '7px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = theme.primary;
        ctx.fillText(markers.join(' '), x, y);
        ctx.restore();
    }
    drawStatusBar(ctx, theme, zh) {
        ctx.fillStyle = theme.surface;
        this.roundRect(ctx, 18, 450, W - 36, 36, 10);
        ctx.fill();
        ctx.strokeStyle = theme.border;
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.font = '7px "Press Start 2P", monospace';
        ctx.fillStyle = theme.text;
        const line = zh ? this.banner.zh : this.banner.en;
        ctx.fillText(line || (this.isHumanTurn() ? (zh ? '轮到你行动' : 'Your action') : (zh ? 'AI 思考中' : 'AI thinking')), W / 2, 464);
        const log = this.logs[0];
        ctx.fillStyle = theme.muted;
        ctx.fillText(log ? (zh ? log.zh : log.en) : (zh ? '完成 10 局或避免破产' : 'Finish 10 hands or avoid busting'), W / 2, 478);
    }
    drawActionButtons(ctx, theme, zh) {
        const buttons = this.getActionButtons();
        for (const button of buttons) {
            ctx.save();
            ctx.fillStyle = button.enabled ? theme.surface : theme.surfaceMuted;
            this.roundRect(ctx, button.x, button.y, button.w, button.h, 8);
            ctx.fill();
            ctx.strokeStyle = button.enabled ? theme.primary : theme.border;
            ctx.stroke();
            ctx.textAlign = 'center';
            ctx.font = '7px "Press Start 2P", monospace';
            ctx.fillStyle = button.enabled ? theme.text : theme.muted;
            ctx.fillText(zh ? button.labelZh : button.label, button.x + button.w / 2, button.y + 17);
            ctx.restore();
        }
    }
    drawOverlay(ctx, theme, zh) {
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.56)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = theme.surface;
        this.roundRect(ctx, 40, 182, W - 80, 128, 14);
        ctx.fill();
        ctx.strokeStyle = theme.primary;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.fillStyle = theme.text;
        ctx.font = '10px "Press Start 2P", monospace';
        ctx.fillText(zh ? '本局结束' : 'Round End', W / 2, 218);
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.fillStyle = theme.primary;
        ctx.fillText(zh ? `得分 ${this.score}` : `Score ${this.score}`, W / 2, 242);
        ctx.fillStyle = theme.text;
        ctx.fillText(zh ? this.banner.zh : this.banner.en, W / 2, 266);
        ctx.fillStyle = theme.muted;
        const prompt = this.state === 'gameOver'
            ? (zh ? '按 Space / Enter 重开' : 'Press Space / Enter to restart')
            : (zh ? '按 Space / Enter 进入下一局' : 'Press Space / Enter for next hand');
        ctx.fillText(prompt, W / 2, 290);
        ctx.restore();
    }
    drawCard(ctx, x, y, card, faceUp, theme, dim) {
        ctx.save();
        if (dim)
            ctx.globalAlpha = 0.55;
        ctx.shadowColor = theme.shadow;
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 3;
        if (!faceUp) {
            ctx.fillStyle = theme.cardBack;
            this.roundRect(ctx, x, y, CARD_W, CARD_H, 6);
            ctx.fill();
            ctx.strokeStyle = theme.cardBackAlt;
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.shadowColor = 'transparent';
            ctx.strokeStyle = theme.cardBackAlt;
            for (let i = 0; i < 4; i += 1) {
                ctx.beginPath();
                ctx.moveTo(x + 7, y + 10 + i * 10);
                ctx.lineTo(x + CARD_W - 7, y + 4 + i * 10);
                ctx.stroke();
            }
            ctx.restore();
            return;
        }
        ctx.fillStyle = theme.cardFace;
        this.roundRect(ctx, x, y, CARD_W, CARD_H, 6);
        ctx.fill();
        ctx.strokeStyle = theme.border;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.shadowColor = 'transparent';
        const color = card.suit === 0 || card.suit === 1 ? theme.red : theme.black;
        const rank = this.rankLabel(card.rank);
        const suit = this.suitSymbol(card.suit);
        ctx.fillStyle = color;
        ctx.textAlign = 'left';
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.fillText(rank, x + 4, y + 11);
        ctx.fillText(suit, x + 4, y + 22);
        ctx.textAlign = 'center';
        ctx.font = '14px "Press Start 2P", monospace';
        ctx.fillText(suit, x + CARD_W / 2, y + 32);
        ctx.textAlign = 'right';
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.fillText(rank, x + CARD_W - 4, y + CARD_H - 12);
        ctx.restore();
    }
    getActionButtons() {
        const human = this.players[0];
        const toCall = Math.max(0, this.currentBet - human.bet);
        const canAct = this.isHumanTurn();
        const canRaise = this.getRaiseTarget(human) > this.currentBet;
        const callLabel = toCall === 0 ? 'Check' : `Call ${Math.min(toCall, human.chips)}`;
        const callLabelZh = toCall === 0 ? '过牌' : `跟注 ${Math.min(toCall, human.chips)}`;
        const raiseTo = this.getRaiseTarget(human);
        const raiseLabel = canRaise ? `Raise ${raiseTo}` : 'Raise';
        const raiseLabelZh = canRaise ? `加到 ${raiseTo}` : '加注';
        const totalWidth = BUTTON_W * 4 + BUTTON_GAP * 3;
        const startX = (W - totalWidth) / 2;
        const y = H - BUTTON_H - 10;
        return [
            { id: 'fold', x: startX, y, w: BUTTON_W, h: BUTTON_H, enabled: canAct && toCall >= 0, label: 'Fold', labelZh: '弃牌' },
            { id: 'call', x: startX + (BUTTON_W + BUTTON_GAP), y, w: BUTTON_W, h: BUTTON_H, enabled: canAct, label: callLabel, labelZh: callLabelZh },
            { id: 'raise', x: startX + 2 * (BUTTON_W + BUTTON_GAP), y, w: BUTTON_W, h: BUTTON_H, enabled: canAct && canRaise, label: raiseLabel, labelZh: raiseLabelZh },
            { id: 'all-in', x: startX + 3 * (BUTTON_W + BUTTON_GAP), y, w: BUTTON_W, h: BUTTON_H, enabled: canAct && human.chips > 0, label: 'All-in', labelZh: '全下' },
        ];
    }
    getStreetLabel(zh) {
        if (this.stage === 'preflop')
            return zh ? '翻牌前' : 'Preflop';
        if (this.stage === 'flop')
            return zh ? '翻牌圈' : 'Flop';
        if (this.stage === 'turn')
            return zh ? '转牌圈' : 'Turn';
        if (this.stage === 'river')
            return zh ? '河牌圈' : 'River';
        return zh ? '摊牌' : 'Showdown';
    }
    rankLabel(rank) {
        if (rank === 14)
            return 'A';
        if (rank === 13)
            return 'K';
        if (rank === 12)
            return 'Q';
        if (rank === 11)
            return 'J';
        return String(rank);
    }
    suitSymbol(suit) {
        return ['♥', '♦', '♣', '♠'][suit];
    }
    roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }
}
//# sourceMappingURL=texashold.js.map