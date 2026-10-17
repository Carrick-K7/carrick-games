import { BaseGame, createDefaultGameHost, type GameHost, type GameShellSnapshot, type GameViewport } from '@carrick/game-sdk/game';
import { getRetroPalette } from '@carrick/game-sdk/render';
import {
  FloatTexts,
  Particles,
  ScreenShake,
  fx,
  ease,
} from '@carrick/game-sdk/fx';
import {
  evaluatePreflopStrength,
  hasFlushDraw,
  hasStraightDraw,
  type PokerCard,
} from './texasholdRules.js';

import { pokerLayout, type PokerLayout } from './texasholdLayout.js';
import { PokerActions, type PokerAction, type PokerActionId } from './texasholdActions.js';
import { evaluateBestHand, compareHands, explainComparison, type PokerHandValue } from './texasholdHands.js';
import { PokerMotion } from './texasholdMotion.js';

const W = 440;
const H = 520;
const STARTING_CHIPS = 200;
const SMALL_BLIND = 10;
const BIG_BLIND = 20;
const TOTAL_HANDS = 10;
const CARD_H = 50;

type Suit = 0 | 1 | 2 | 3;
type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
type TableState = 'playing' | 'betweenHands' | 'gameOver';
type PlayerAction = 'fold' | 'call' | 'raise' | 'all-in';

interface Card extends PokerCard {
  rank: number;
  suit: Suit;
}

interface LocalizedText {
  en: string;
  zh: string;
}

interface ThemePalette {
  bg: string;
  felt: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  primary: string;
  text: string;
  muted: string;
  cardFace: string;
  cardBack: string;
  cardBackAlt: string;
  red: string;
  black: string;
  shadow: string;
}

type HandValue = PokerHandValue;

interface HandPot {
  amount: number;
  winners: number[];
  eligible: number[];
  payouts: Record<number, number>;
  explanation: LocalizedText;
  refund: boolean;
}

interface Player {
  seat: number;
  name: string;
  nameZh: string;
  isHuman: boolean;
  chips: number;
  hole: Card[];
  folded: boolean;
  allIn: boolean;
  out: boolean;
  bet: number;
  committed: number;
  acted: boolean;
  lastAction: LocalizedText | null;
  wonThisHand: number;
}

interface SeatLayout {
  x: number;
  y: number;
}

export class TexasHoldGame extends BaseGame {
  score = STARTING_CHIPS;

  override getShellSnapshot(): GameShellSnapshot {
    return { score: this.score };
  }

  private readonly players: Player[] = [
    { seat: 0, name: 'You', nameZh: '你', isHuman: true, chips: STARTING_CHIPS, hole: [], folded: false, allIn: false, out: false, bet: 0, committed: 0, acted: false, lastAction: null, wonThisHand: 0 },
    { seat: 1, name: 'Bot A', nameZh: '甲机', isHuman: false, chips: STARTING_CHIPS, hole: [], folded: false, allIn: false, out: false, bet: 0, committed: 0, acted: false, lastAction: null, wonThisHand: 0 },
    { seat: 2, name: 'Bot B', nameZh: '乙机', isHuman: false, chips: STARTING_CHIPS, hole: [], folded: false, allIn: false, out: false, bet: 0, committed: 0, acted: false, lastAction: null, wonThisHand: 0 },
    { seat: 3, name: 'Bot C', nameZh: '丙机', isHuman: false, chips: STARTING_CHIPS, hole: [], folded: false, allIn: false, out: false, bet: 0, committed: 0, acted: false, lastAction: null, wonThisHand: 0 },
  ];

  private readonly seatLayout: SeatLayout[] = [
    { x: W / 2, y: 344 },
    { x: 78, y: 96 },
    { x: W / 2, y: 52 },
    { x: W - 78, y: 96 },
  ];

  private deck: Card[] = [];
  private community: Card[] = [];
  private logs: LocalizedText[] = [];
  private stage: Street = 'preflop';
  private state: TableState = 'playing';
  private dealerIndex = -1;
  private smallBlindIndex = 0;
  private bigBlindIndex = 0;
  private currentPlayerIndex: number | null = null;
  private currentBet = 0;
  private completedHands = 0;
  private banner: LocalizedText = { en: '', zh: '' };
  private pendingSystemDelay = 0;
  private pendingSystemAction: (() => void) | null = null;
  private showdownHands = new Map<number, HandValue>();
  private readonly particles = new Particles();
  private readonly floats = new FloatTexts();
  private readonly shake = new ScreenShake();
  private actions: PokerActions | null = null;
  private readonly motion = new PokerMotion();
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private pendingAllIn: string | null = null;
  private detailsOpen = false;
  private handPots: HandPot[] = [];
  private highlightedSeat: number | null = null;
  private readonly cancelPendingInput = () => {
    this.pendingAllIn = null;
    this.detailsOpen = false;
    if (this.actions) this.renderFrame();
  };

  constructor(host?: GameHost) {
    super(host ?? createDefaultGameHost('gameCanvas', W, H));
    window.addEventListener('blur', this.cancelPendingInput);
    document.addEventListener('visibilitychange', this.cancelPendingInput);
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
    this.particles.clear();
    this.floats.clear();
    this.shake.reset();
    this.resetScoreReport();

    for (const player of this.players) {
      player.chips = STARTING_CHIPS;
      this.resetPlayerForHand(player);
    }

    this.startNewHand();
  }

  update(dt: number) {
    if (this.presentationPaused) return;
    this.motion.update(dt);
    if (this.reducedMotion.matches) this.motion.settle();
    this.validateConfirmation();
    this.particles.update(dt);
    this.floats.update(dt);
    this.shake.update(dt);
    if (this.state !== 'playing') return;

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

    if (this.currentPlayerIndex === null) return;
    if (this.players[this.currentPlayerIndex]?.isHuman) return;

    this.scheduleSystemAction(0.65, () => this.performAiTurn());
  }

  override setViewport(viewport: GameViewport) {
    this.resizeLogicalViewport(viewport);
  }

  override setPresentationPaused(paused: boolean) {
    if (paused) { this.pendingAllIn = null; this.detailsOpen = false; }
    super.setPresentationPaused(paused);
    this.renderFrame();
  }

  getDiagnostics() {
    return {
      state: this.state, stage: this.stage, completedHands: this.completedHands,
      pot: this.getPotSize(), currentPlayer: this.currentPlayerIndex,
      chips: this.players.map(player => player.chips), communityCount: this.community.length,
      actions: this.getActions().map(({ id, enabled }) => ({ id, enabled })),
      layout: this.layout(), allInConfirmation: this.pendingAllIn !== null,
      visibleHoleSeats: this.players.filter(player => this.revealHole(player)).map(player => player.seat),
      highlightedSeat: this.highlightedSeat,
      highlightedCards: this.highlightedSeat === null ? [] : (this.showdownHands.get(this.highlightedSeat)?.bestFive ?? []),
      netReturns: this.state === 'playing' ? [] : this.players.map(player => player.wonThisHand - player.committed),
      resultDetails: this.state === 'playing' ? null : this.resultDetails(this.isZh()),
      motion: this.motion.diagnostics(),
    };
  }

  private layout(): PokerLayout {
    return pokerLayout(this.width, this.height, this.viewport?.safeArea);
  }

  draw(ctx: CanvasRenderingContext2D) {
    const theme = this.getTheme();
    const zh = this.isZh();
    const layout = this.layout();
    if (this.reducedMotion.matches) this.motion.settle();
    this.motion.turn(this.state === 'playing' ? this.currentPlayerIndex : null);
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, this.width, this.height);
    this.drawTable(ctx, theme, layout);
    this.drawHeader(ctx, theme, zh, layout);
    this.drawCommunity(ctx, theme, zh, layout);
    this.drawPlayers(ctx, theme, zh, layout);
    this.drawStatusBar(ctx, theme, zh, layout);
    this.drawChipFlights(ctx, theme, layout);
    if (!this.reducedMotion.matches) {
      this.particles.draw(ctx);
      this.floats.draw(ctx);
    }
    if (this.state === 'gameOver') this.drawOverlay(ctx, theme, zh);
    this.syncActions(layout, zh);
  }

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    if (this.presentationPaused) return;
    if (e instanceof KeyboardEvent && e.type === 'keydown' && e.key === 'Escape') {
      if (this.pendingAllIn || this.detailsOpen) { e.preventDefault(); this.cancelPendingInput(); }
      return;
    }
    if (e.target instanceof HTMLElement && e.target.closest('[data-texashold-actions], button')) return;
    if (this.detailsOpen && (e.type === 'mousedown' || e.type === 'touchstart')) { this.cancelPendingInput(); return; }
    if (this.state === 'gameOver' && this.isRestartInput(e)) {
      if (e instanceof TouchEvent) e.preventDefault();
      this.init();
      return;
    }

    if (e instanceof KeyboardEvent) {
      if (e.type !== 'keydown' || e.repeat) return;
      this.handleKeyInput(e);
      return;
    }

    if (e instanceof TouchEvent) {
      if (e.type !== 'touchstart') return;
      e.preventDefault();
      const touch = e.touches[0] ?? e.changedTouches[0];
      if (!touch) return;
      this.handlePointerInput(touch.clientX, touch.clientY);
      return;
    }

    if (e.type === 'mousedown') {
      this.handlePointerInput(e.clientX, e.clientY);
    }
  }

  override destroy() {
    this.pendingSystemAction = null;
    this.pendingSystemDelay = 0;
    window.removeEventListener('blur', this.cancelPendingInput);
    document.removeEventListener('visibilitychange', this.cancelPendingInput);
    this.pendingAllIn = null;
    this.motion.reset();
    this.actions?.destroy();
    this.actions = null;
    super.destroy();
  }

  private handleKeyInput(e: KeyboardEvent) {
    const key = e.key.toLowerCase();
    this.validateConfirmation();
    if (this.pendingAllIn) {
      if (e.key === 'Enter') { e.preventDefault(); this.confirmAllIn(); this.renderFrame(); }
      return;
    }

    if (this.state === 'betweenHands' || this.state === 'gameOver') {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (this.state === 'betweenHands') {
          this.startNewHand();
        } else {
          this.init();
        }
      }
      return;
    }

    if (!this.isHumanTurn()) return;

    if (key === 'f') {
      this.handleHumanAction('fold');
    } else if (key === 'c') {
      this.handleHumanAction('call');
    } else if (key === 'r') {
      this.handleHumanAction('raise');
    } else if (key === 'a') {
      this.handleHumanAction('all-in');
    }
  }

  private handlePointerInput(_clientX: number, _clientY: number) {
    // Inspecting a settled hand must never advance it. Only Next hand / keys do.
    if (this.pendingAllIn || this.detailsOpen) this.cancelPendingInput();
  }

  private confirmationKey() {
    const player = this.players[0];
    return `${this.completedHands}:${this.stage}:${this.currentPlayerIndex}:${this.currentBet}:${player.bet}:${player.chips}`;
  }

  private validateConfirmation() {
    if (this.pendingAllIn && (!this.isHumanTurn() || this.pendingAllIn !== this.confirmationKey())) this.pendingAllIn = null;
  }

  private confirmAllIn() {
    this.validateConfirmation();
    if (!this.pendingAllIn || this.presentationPaused) return;
    this.pendingAllIn = null;
    this.performPlayerAction(0, 'all-in');
  }

  private handleHumanAction(action: PlayerAction) {
    if (this.presentationPaused || !this.isHumanTurn()) return;
    this.validateConfirmation();
    // Keyboard and native controls share legality; a disabled raise must not fall back to all-in.
    if (!this.getActions().some(button => button.id === action && button.enabled)) return;
    if (action === 'all-in') {
      if (this.pendingAllIn) this.confirmAllIn();
      else this.pendingAllIn = this.confirmationKey();
    } else if (!this.pendingAllIn) {
      this.performPlayerAction(0, action);
    }
    this.renderFrame();
  }

  private isHumanTurn(): boolean {
    return this.state === 'playing' &&
      this.pendingSystemAction === null &&
      this.currentPlayerIndex === 0 &&
      !this.players[0].folded &&
      !this.players[0].allIn &&
      !this.players[0].out;
  }

  private startNewHand() {
    this.pendingAllIn = null;
    this.detailsOpen = false;
    this.handPots = [];
    this.highlightedSeat = null;
    this.motion.reset();
    this.particles.clear(); this.floats.clear();
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
        if (card) {
          this.players[index].hole.push(card);
          this.motion.deal(`hole:${index}:${round}`, (round * live.length + live.indexOf(index)) * 0.03);
        }
      }
    }

    this.postBlind(this.smallBlindIndex, SMALL_BLIND, 'SB', '小盲');
    this.postBlind(this.bigBlindIndex, BIG_BLIND, 'BB', '大盲');
    this.currentBet = this.players[this.bigBlindIndex].bet;

    const firstToAct = headsUp ? this.smallBlindIndex : this.nextActingPlayerIndex(this.bigBlindIndex);
    this.beginBettingRound(firstToAct, this.currentBet);

    this.pushLog(
      `Hand ${this.completedHands + 1}: blinds ${SMALL_BLIND}/${BIG_BLIND}`,
      `第 ${this.completedHands + 1} 局：盲注 ${SMALL_BLIND}/${BIG_BLIND}`
    );
  }

  private beginBettingRound(firstPlayerIndex: number | null, currentBet: number) {
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

  private performAiTurn() {
    if (this.currentPlayerIndex === null) return;
    const player = this.players[this.currentPlayerIndex];
    if (!player || player.isHuman || player.folded || player.allIn || player.out) {
      this.advanceToNextActor(this.currentPlayerIndex);
      return;
    }

    const action = this.chooseAiAction(this.currentPlayerIndex);
    this.performPlayerAction(this.currentPlayerIndex, action);
  }

  private chooseAiAction(playerIndex: number): PlayerAction {
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

  private performPlayerAction(playerIndex: number, requestedAction: PlayerAction) {
    const player = this.players[playerIndex];
    if (!player || player.folded || player.out || player.allIn) return;

    const toCall = Math.max(0, this.currentBet - player.bet);
    let action = requestedAction;
    let aggressive = false;

    if (action === 'raise' && this.getRaiseTarget(player) <= this.currentBet) {
      action = player.chips > toCall ? 'all-in' : 'call';
    }

    if (action === 'fold') {
      player.folded = true;
      this.motion.fold(playerIndex);
      player.acted = true;
      player.lastAction = { en: 'Fold', zh: '弃牌' };
    } else if (action === 'call') {
      const amount = Math.min(player.chips, toCall);
      this.commitChips(player, amount);
      player.acted = true;
      if (toCall === 0) {
        player.lastAction = { en: 'Check', zh: '过牌' };
      } else if (amount < toCall) {
        player.lastAction = { en: `Call all-in ${player.bet}`, zh: `跟注全下 ${player.bet}` };
      } else {
        player.lastAction = { en: `Call ${toCall}`, zh: `跟注 ${toCall}` };
      }
    } else if (action === 'raise') {
      const target = this.getRaiseTarget(player);
      const amount = target - player.bet;
      this.commitChips(player, amount);
      this.currentBet = Math.max(this.currentBet, player.bet);
      aggressive = true;
      player.acted = true;
      player.lastAction = { en: `Raise to ${player.bet}`, zh: `加注到 ${player.bet}` };
    } else if (action === 'all-in') {
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
    } else if (player.lastAction) {
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

  private advanceToNextActor(fromIndex: number) {
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

  private advanceStreet() {
    this.pendingSystemAction = null;
    this.pendingSystemDelay = 0;

    if (this.getContendingPlayers().length <= 1) {
      const winner = this.getContendingPlayers()[0];
      if (winner !== undefined) this.awardFoldWin(winner);
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
    } else if (this.stage === 'flop') {
      this.stage = 'turn';
      this.dealCommunityCards(1);
      this.pushLog('Turn dealt', '转牌发出');
    } else if (this.stage === 'turn') {
      this.stage = 'river';
      this.dealCommunityCards(1);
      this.pushLog('River dealt', '河牌发出');
    } else if (this.stage === 'river') {
      this.stage = 'showdown';
      this.resolveShowdown();
      return;
    }

    const first = this.nextActingPlayerIndex(this.dealerIndex);
    this.beginBettingRound(first, 0);
  }

  private resolveShowdown() {
    if (this.state !== 'playing') return;
    this.pendingAllIn = null;
    this.motion.showdown();
    this.handPots = [];
    this.currentPlayerIndex = null;
    this.showdownHands.clear();

    const contenders = this.players
      .map((player, index) => ({ player, index }))
      .filter(({ player }) => !player.folded && player.hole.length === 2);

    for (const contender of contenders) {
      const hand = this.evaluateBestHand([...contender.player.hole, ...this.community]);
      this.showdownHands.set(contender.index, hand);
    }

    const levels = Array.from(
      new Set(this.players.map((player) => player.committed).filter((amount) => amount > 0))
    ).sort((a, b) => a - b);

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
      let bestHand = this.showdownHands.get(eligible[0].index)!;

      for (let i = 1; i < eligible.length; i += 1) {
        const challenger = eligible[i].index;
        const challengerHand = this.showdownHands.get(challenger)!;
        const comparison = this.compareHands(challengerHand, bestHand);
        if (comparison > 0) {
          winners = [challenger];
          bestHand = challengerHand;
        } else if (comparison === 0) {
          winners.push(challenger);
        }
      }

      const orderedWinners = winners.sort((a, b) => this.distanceFromDealer(a) - this.distanceFromDealer(b));
      const share = Math.floor(segment / orderedWinners.length);
      let remainder = segment % orderedWinners.length;

      const payouts: Record<number, number> = {};
      for (const winnerIndex of orderedWinners) {
        const payout = share + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder -= 1;
        payouts[winnerIndex] = payout;
        this.players[winnerIndex].chips += payout;
        this.players[winnerIndex].wonThisHand += payout;
      }

      const refund = this.players.filter(player => player.committed >= level).length === 1;
      const loserHands = eligible.filter(({ index }) => !orderedWinners.includes(index))
        .map(({ index }) => this.showdownHands.get(index)!).sort((a, b) => this.compareHands(b, a));
      const explanation = refund ? { en: 'Uncalled chips returned', zh: '退回未被跟注的筹码' }
        : orderedWinners.length > 1 ? explainComparison(bestHand, bestHand)
        : loserHands[0] ? explainComparison(bestHand, loserHands[0])
        : { en: 'Only eligible hand', zh: '唯一有资格赢取此底池的手牌' };
      const eligibleSeats = eligible.map(({ index }) => index);
      const previousPot = this.handPots[this.handPots.length - 1];
      // Folded contribution levels do not create new side pots. Merge presentation
      // tiers with identical eligibility; retain the existing accounting payouts.
      if (!refund && previousPot && !previousPot.refund && previousPot.eligible.join(',') === eligibleSeats.join(',')) {
        previousPot.amount += segment;
        for (const [seat, payout] of Object.entries(payouts)) previousPot.payouts[Number(seat)] = (previousPot.payouts[Number(seat)] ?? 0) + payout;
      } else {
        this.handPots.push({ amount: segment, winners: [...orderedWinners], eligible: eligibleSeats, payouts, explanation, refund });
      }
      const names = orderedWinners.map((index) => this.players[index].name).join(' / ');
      const namesZh = orderedWinners.map((index) => this.players[index].nameZh).join(' / ');
      this.pushLog(
        `${names} win ${segment} with ${bestHand.label}`,
        `${namesZh} 以 ${bestHand.labelZh} 赢得 ${segment}`
      );

      previousLevel = level;
    }

    this.finishHand();
  }

  private awardFoldWin(winnerIndex: number) {
    if (this.state !== 'playing') return;
    const pot = this.getPotSize();
    this.players[winnerIndex].chips += pot;
    this.players[winnerIndex].wonThisHand += pot;
    this.handPots = [{ amount: pot, winners: [winnerIndex], eligible: [winnerIndex], payouts: { [winnerIndex]: pot },
      explanation: { en: 'Everyone else folded', zh: '其他玩家均已弃牌' }, refund: false }];
    this.pushLog(
      `${this.players[winnerIndex].name} wins ${pot} uncontested`,
      `${this.players[winnerIndex].nameZh} 直接收下 ${pot}`
    );
    this.finishHand();
  }

  private emitPayoutFx() {
    for (const player of this.players) {
      if (player.wonThisHand > 0) this.motion.transfer(player.seat, player.wonThisHand, 'payout', this.showdownHands.size ? 0.24 : 0);
    }
  }

  private finishHand() {
    if (this.state !== 'playing') return;
    this.pendingAllIn = null;
    this.detailsOpen = false;
    const contested = this.handPots.filter(pot => !pot.refund);
    const bestSeat = contested.some(pot => pot.winners.includes(0)) ? 0 : contested[0]?.winners[0];
    this.highlightedSeat = bestSeat !== undefined && this.showdownHands.has(bestSeat) ? bestSeat : null;
    this.pendingSystemAction = null;
    this.pendingSystemDelay = 0;
    this.currentPlayerIndex = null;
    this.stage = 'showdown';
    this.completedHands += 1;
    this.score = this.players[0].chips;
    this.emitPayoutFx();

    for (const player of this.players) {
      player.out = player.chips <= 0;
      if (player.wonThisHand > 0) {
        player.lastAction = { en: `Won ${player.wonThisHand}`, zh: `赢得 ${player.wonThisHand}` };
      } else if (player.folded) {
        player.lastAction = player.lastAction ?? { en: 'Folded', zh: '已弃牌' };
      } else if (player.out) {
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

  private finishTournament() {
    this.state = 'gameOver';
    this.currentPlayerIndex = null;
    this.score = this.players[0].chips;
    this.banner = {
      en: `Tournament over. Score ${this.score}.`,
      zh: `牌局结束。得分 ${this.score}。`,
    };
    const palette = getRetroPalette(this.isDarkTheme());
    if (this.players[0].chips > 0) {
      this.particles.emit(fx.confetti(this.width / 2, 72, [palette.primary, palette.cyan, palette.amber, palette.violet]));
    } else {
      for (const emit of fx.explosion(this.seatLayout[0].x, this.seatLayout[0].y, [palette.red, palette.amber])) {
        if (!this.isDarkTheme()) emit.blend = 'source-over';
        this.particles.emit(emit);
      }
      this.shake.add(0.4);
    }

    this.submitScoreOnce(this.score);
  }

  private shouldEndTournament(): boolean {
    const human = this.players[0];
    const opponentsAlive = this.players.slice(1).some((player) => player.chips > 0);
    return human.chips <= 0 || this.completedHands >= TOTAL_HANDS || !opponentsAlive;
  }

  private resetPlayerForHand(player: Player) {
    player.hole = [];
    player.folded = false;
    player.allIn = false;
    player.bet = 0;
    player.committed = 0;
    player.acted = false;
    player.lastAction = null;
    player.wonThisHand = 0;
  }

  private postBlind(index: number, amount: number, label: string, labelZh: string) {
    const player = this.players[index];
    const posted = Math.min(player.chips, amount);
    this.commitChips(player, posted);
    player.lastAction = { en: `${label} ${posted}`, zh: `${labelZh} ${posted}` };
  }

  private commitChips(player: Player, amount: number) {
    if (amount <= 0) return;
    player.chips -= amount;
    player.bet += amount;
    player.committed += amount;
    this.motion.transfer(player.seat, amount, 'bet');
    if (player.chips <= 0) {
      player.chips = 0;
      player.allIn = true;
    }
  }

  private getRaiseTarget(player: Player): number {
    const unit = this.getBetUnit();
    const maxTotal = player.bet + player.chips;
    if (maxTotal <= this.currentBet) return this.currentBet;
    const minRaiseTo = this.currentBet === 0 ? unit : this.currentBet + unit;
    return maxTotal >= minRaiseTo ? minRaiseTo : this.currentBet;
  }

  private getBetUnit(): number {
    return this.stage === 'turn' || this.stage === 'river' ? BIG_BLIND * 2 : BIG_BLIND;
  }

  private isBettingRoundComplete(): boolean {
    const contenders = this.getContendingPlayers();
    if (contenders.length <= 1) return true;

    return !this.players.some((player) =>
      !player.folded &&
      !player.out &&
      !player.allIn &&
      (!player.acted || player.bet !== this.currentBet)
    );
  }

  private getContendingPlayers(): number[] {
    return this.players
      .map((player, index) => ({ player, index }))
      .filter(({ player }) => !player.folded && !player.out && player.hole.length === 2)
      .map(({ index }) => index);
  }

  private getLivePlayerIndices(): number[] {
    return this.players
      .map((player, index) => ({ player, index }))
      .filter(({ player }) => player.chips > 0)
      .map(({ index }) => index);
  }

  private nextLivePlayerIndex(fromIndex: number): number {
    for (let step = 1; step <= this.players.length; step += 1) {
      const index = (fromIndex + step + this.players.length) % this.players.length;
      if (this.players[index].chips > 0) return index;
    }
    return 0;
  }

  private nextActingPlayerIndex(fromIndex: number): number | null {
    return this.findNextEligibleFrom(fromIndex);
  }

  private findNextEligibleFrom(fromIndex: number): number | null {
    for (let step = 1; step <= this.players.length; step += 1) {
      const index = (fromIndex + step + this.players.length) % this.players.length;
      const player = this.players[index];
      if (!player.folded && !player.out && !player.allIn && player.hole.length === 2) {
        return index;
      }
    }
    return null;
  }

  private distanceFromDealer(index: number): number {
    return (index - this.dealerIndex + this.players.length) % this.players.length;
  }

  private getPotSize(): number {
    return this.players.reduce((sum, player) => sum + player.committed, 0);
  }

  private scheduleSystemAction(delay: number, action: () => void) {
    if (this.pendingSystemAction) return;
    this.pendingSystemDelay = delay;
    this.pendingSystemAction = action;
  }

  private dealCommunityCards(count: number) {
    for (let i = 0; i < count; i += 1) {
      const card = this.deck.pop();
      if (card) {
        this.motion.deal(`board:${this.community.length}`, i * 0.035, true);
        this.community.push(card);
      }
    }
  }

  private evaluateStrength(playerIndex: number): number {
    const player = this.players[playerIndex];
    if (player.hole.length < 2) return 0;

    if (this.stage === 'preflop') {
      return evaluatePreflopStrength(player.hole);
    }

    const cards = [...player.hole, ...this.community];
    const hand = this.evaluateBestHand(cards);
    const counts = this.getRankCounts(cards);
    const highPair = Array.from(counts.entries())
      .filter(([, count]) => count >= 2)
      .map(([rank]) => rank)
      .sort((a, b) => b - a)[0] ?? 0;

    let score = 18;
    if (hand.category >= 7) score = 99;
    else if (hand.category === 6) score = 96;
    else if (hand.category === 5) score = 92;
    else if (hand.category === 4) score = 86;
    else if (hand.category === 3) score = 77;
    else if (hand.category === 2) score = 67;
    else if (hand.category === 1) score = 44 + highPair;
    else score = 18 + Math.max(player.hole[0].rank, player.hole[1].rank);

    if (hasFlushDraw(cards)) score += 10;
    if (hasStraightDraw(cards)) score += 8;
    if (player.hole[0].rank === player.hole[1].rank) score += 4;

    return Math.max(0, Math.min(100, score));
  }

  private evaluateBestHand(cards: Card[]): HandValue { return evaluateBestHand(cards); }

  private compareHands(a: HandValue, b: HandValue): number { return compareHands(a, b); }

  private getRankCounts(cards: Card[]): Map<number, number> {
    const counts = new Map<number, number>();
    for (const card of cards) {
      counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
    }
    return counts;
  }

  private createDeck(): Card[] {
    const deck: Card[] = [];
    for (let suit = 0 as Suit; suit <= 3; suit = (suit + 1) as Suit) {
      for (let rank = 2; rank <= 14; rank += 1) {
        deck.push({ rank, suit });
      }
    }
    return deck;
  }

  private shuffleDeck(deck: Card[]) {
    for (let i = deck.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  }

  private pushLog(en: string, zh: string) {
    this.logs.unshift({ en, zh });
    this.logs = this.logs.slice(0, 4);
  }

  private getTheme(): ThemePalette {
    const dark = this.isDarkTheme();
    return {
      bg: dark ? '#0d1815' : '#f4f6f5',
      felt: dark ? '#142b24' : '#e5eeea',
      surface: dark ? '#1c3028' : '#ffffff',
      surfaceMuted: dark ? '#1b352c' : '#dce8e2',
      border: dark ? '#345046' : '#c3d5cb',
      primary: dark ? '#80d7b7' : '#17694f',
      text: dark ? '#edf5f1' : '#142f24',
      muted: dark ? '#a3bcb0' : '#526d60',
      cardFace: '#fdfefa', cardBack: dark ? '#244b3c' : '#c1d8cb',
      cardBackAlt: dark ? '#6a9a82' : '#608871',
      red: '#b6404c', black: '#233b31', shadow: 'transparent',
    };
  }

  private isZh(): boolean { return this.isZhLang(); }

  private text(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center', weight = 400) {
    ctx.font = `${weight} ${size}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  private panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string, border?: string) {
    this.roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
    if (border) { ctx.strokeStyle = border; ctx.lineWidth = 1; ctx.stroke(); }
  }

  private drawTable(ctx: CanvasRenderingContext2D, theme: ThemePalette, l: PokerLayout) {
    // A quiet playing surface, not a second framed dashboard around the game.
    const y = l.top + 24;
    const bottom = l.human.y + l.human.h + 10;
    this.panel(ctx, l.left, y, l.width, bottom - y, l.wide ? (bottom - y) / 2 : Math.min(48, l.width / 6), theme.felt);
  }

  private drawHeader(ctx: CanvasRenderingContext2D, theme: ThemePalette, zh: boolean, l: PokerLayout) {
    const hand = Math.min(TOTAL_HANDS, this.completedHands + (this.state === 'playing' ? 1 : 0));
    this.text(ctx, zh ? `第 ${hand} / ${TOTAL_HANDS} 局` : `Hand ${hand} / ${TOTAL_HANDS}`, l.left + 4, l.top + 8, 13, theme.text, 'left', 500);
    this.text(ctx, this.getStreetLabel(zh), l.left + l.width / 2, l.top + 8, 13, theme.muted);
    this.text(ctx, zh ? '盲注 10 / 20' : 'Blinds 10 / 20', l.left + l.width - 4, l.top + 8, 13, theme.muted, 'right');
  }

  private drawCommunity(ctx: CanvasRenderingContext2D, theme: ThemePalette, zh: boolean, l: PokerLayout) {
    const { x, y, w, h } = l.board;
    const cx = x + w / 2;
    const pot = `${zh ? '底池' : 'Pot'}  ${this.getPotSize()}`;
    this.text(ctx, pot, cx, y - 14, l.compact ? 17 : 21, theme.text, 'center', 600);
    const gap = 6;
    const cw = Math.min((w - gap * 4) / 5, h * 0.7);
    const start = cx - (cw * 5 + gap * 4) / 2;
    for (let i = 0; i < 5; i++) {
      const card = this.community[i];
      const px = start + i * (cw + gap);
      if (card) this.drawAnimatedCard(ctx, px, y, cw, h, card, true, theme, false,
        `board:${i}`, true, undefined, this.highlighted(card));
      else {
        this.panel(ctx, px, y, cw, h, 6, theme.surfaceMuted, theme.border);
        this.text(ctx, '·', px + cw / 2, y + h / 2 + 5, 18, theme.cardBackAlt);
      }
    }
  }

  private drawPlayers(ctx: CanvasRenderingContext2D, theme: ThemePalette, zh: boolean, l: PokerLayout) {
    for (let index = 1; index < this.players.length; index++) {
      const player = this.players[index];
      const seat = l.opponents[index - 1];
      const active = this.currentPlayerIndex === index && this.state === 'playing';
      const dim = player.folded || player.out;
      const color = dim ? theme.muted : theme.text;
      const name = zh ? player.nameZh : player.name;
      const net = player.wonThisHand - player.committed;
      const selected = this.highlightedSeat === index;
      const nameLabel = `${active ? '› ' : selected ? '✓ ' : ''}${name}${this.state !== 'playing' && player.committed > 0 ? ` ${this.signed(net)}` : ''}`;
      this.text(ctx, nameLabel, seat.x, seat.y, 13, player.wonThisHand > 0 ? theme.primary : color, 'center', active ? 650 : 500);
      this.text(ctx, String(player.chips), seat.x, seat.y + 20, 17, color, 'center', 600);
      const ch = l.opponentCardHeight;
      const cw = ch * 0.72;
      const cardY = seat.y + 28;
      for (let i = 0; i < player.hole.length; i++) {
        this.drawAnimatedCard(ctx, seat.x - cw - 2 + i * (cw + 4), cardY, cw, ch, player.hole[i], this.revealHole(player), theme, dim,
          `hole:${index}:${i}`, this.state !== 'playing' && this.revealHole(player), player.folded ? index : undefined,
          this.highlightedSeat === index && this.highlighted(player.hole[i]));
      }
      const action = this.playerStatus(player, zh);
      this.text(ctx, action, seat.x, cardY + ch + 17, 11, player.wonThisHand > 0 ? theme.primary : theme.muted);
      this.drawSeatMarkers(ctx, theme, index, seat.x + Math.min(42, seat.width / 2 - 9), seat.y + 18);
      this.seatLayout[index] = { x: seat.x, y: cardY };
      if (active) {
        ctx.fillStyle = theme.primary;
        const emphasis = this.reducedMotion.matches ? 1 : this.motion.turnProgress();
        const lineWidth = 28 + 12 * (1 - emphasis);
        ctx.fillRect(seat.x - lineWidth / 2, cardY + ch + 22, lineWidth, 2);
      }
    }
    const human = this.players[0];
    const { x, y, h } = l.human;
    const cw = h * 0.7;
    for (let i = 0; i < human.hole.length; i++) {
      this.drawAnimatedCard(ctx, x + i * (cw + 6), y, cw, h, human.hole[i], !human.folded, theme, human.folded || human.out,
        `hole:0:${i}`, false, human.folded ? 0 : undefined, this.highlightedSeat === 0 && this.highlighted(human.hole[i]));
    }
    const tx = x + cw * 2 + 22;
    const humanLabel = zh ? '你的筹码' : 'Your chips';
    this.text(ctx, humanLabel, tx, y + 14, 12, human.wonThisHand > 0 ? theme.primary : theme.muted, 'left');
    this.text(ctx, String(human.chips), tx, y + 39, 24, theme.text, 'left', 600);
    const humanStatus = this.state === 'playing' ? this.playerStatus(human, zh)
      : `${zh ? '净收益' : 'Net'} ${this.signed(human.wonThisHand - human.committed)}`;
    this.text(ctx, humanStatus, tx, y + 58, 11, theme.primary, 'left');
    if (this.isHumanTurn()) {
      ctx.fillStyle = theme.primary;
      const progress = this.reducedMotion.matches ? 1 : this.motion.turnProgress();
      ctx.globalAlpha = 0.4 + progress * 0.6;
      ctx.fillRect(x, y + h + 5, cw * 2 + 6, 2);
      ctx.globalAlpha = 1;
    }
    this.drawSeatMarkers(ctx, theme, 0, x - 14, y + 18);
    this.seatLayout[0] = { x: x + cw, y };
  }

  private playerStatus(player: Player, zh: boolean): string {
    const hand = this.showdownHands.get(player.seat);
    if (player.wonThisHand > 0) return hand ? (zh ? hand.labelZh : hand.label) : (zh ? '赢得底池' : 'Won pot');
    if (player.out) return zh ? '出局' : 'Out';
    if (player.folded) return zh ? '已弃牌' : 'Folded';
    if (hand) return zh ? hand.labelZh : hand.label;
    // Street bets reset during the runout; the recorded action keeps its true amount.
    if (player.allIn) return player.lastAction ? (zh ? player.lastAction.zh : player.lastAction.en) : (zh ? '全下' : 'All-in');
    if (player.bet > 0 && !player.lastAction) return zh ? `下注 ${player.bet}` : `Bet ${player.bet}`;
    return player.lastAction ? (zh ? player.lastAction.zh : player.lastAction.en) : '';
  }

  private drawSeatMarkers(ctx: CanvasRenderingContext2D, theme: ThemePalette, index: number, x: number, y: number) {
    const markers: string[] = [];
    if (index === this.dealerIndex) markers.push('D');
    if (index === this.smallBlindIndex) markers.push('SB');
    if (index === this.bigBlindIndex) markers.push('BB');
    markers.forEach((marker, i) => {
      this.panel(ctx, x - 10, y - 12 + i * 22, 22, 18, 5, theme.surface);
      this.text(ctx, marker, x + 1, y + 1 + i * 22, 10, theme.muted, 'center', 600);
    });
  }

  private status(zh: boolean): string {
    if (this.state !== 'playing') {
      const actualPots = this.handPots.filter(pot => !pot.refund);
      const winners = [...new Set(actualPots.flatMap(pot => pot.winners))];
      if (actualPots.length > 1) return zh ? '多底池结算 · 点击详情查看' : 'Multiple pots · Details available';
      if (winners.length > 1) return zh ? '平分底池 · 点击详情查看' : 'Split pot · Details available';
      const winner = this.players[winners[0]];
      const hand = winner && this.showdownHands.get(winner.seat);
      return winner ? `${zh ? winner.nameZh : winner.name} ${zh ? '获胜' : 'wins'}${hand ? ` · ${zh ? hand.labelZh : hand.label}` : ''}`
        : (zh ? '本局结束' : 'Hand complete');
    }
    if (this.pendingAllIn) return zh ? `确认投入剩余 ${this.players[0].chips} 筹码？` : `Commit your remaining ${this.players[0].chips} chips?`;
    if (this.isHumanTurn()) return zh ? '轮到你行动' : 'Your turn';
    if (this.currentPlayerIndex !== null) {
      const player = this.players[this.currentPlayerIndex];
      return zh ? `${player.nameZh} 正在思考…` : `${player.name} is thinking…`;
    }
    return zh ? '正在发牌…' : 'Dealing…';
  }

  private drawStatusBar(ctx: CanvasRenderingContext2D, theme: ThemePalette, zh: boolean, l: PokerLayout) {
    this.text(ctx, this.status(zh), l.left + l.width / 2, l.statusY, 13, this.isHumanTurn() ? theme.primary : theme.muted, 'center', 500);
  }

  private syncActions(l: PokerLayout, zh: boolean) {
    this.actions ??= new PokerActions(this.canvas, id => this.activateAction(id));
    this.actions.sync({ actions: this.getActions(), x: l.dock.x, y: l.dock.y, width: l.dock.w,
      columns: this.state === 'playing' ? l.columns : 2, dark: this.isDarkTheme(),
      hidden: this.presentationPaused, status: this.status(zh),
      details: this.detailsOpen && this.state !== 'playing' ? this.resultDetails(zh) : undefined });
  }

  private activateAction(id: PokerActionId) {
    if (this.presentationPaused) return;
    if (id === 'cancel') {
      this.pendingAllIn = null;
    } else if (id === 'details') {
      if (this.state !== 'playing') this.detailsOpen = !this.detailsOpen;
    } else if (id === 'next') {
      if (this.state === 'betweenHands') this.startNewHand();
      else if (this.state === 'gameOver') this.init();
    } else if (this.getActions().some(action => action.id === id && action.enabled)) {
      this.handleHumanAction(id);
    }
    this.renderFrame();
  }

  private getActions(): PokerAction[] {
    const zh = this.isZh();
    this.validateConfirmation();
    if (this.state !== 'playing') return [
      { id: 'details', label: this.detailsOpen ? (zh ? '收起详情' : 'Hide details') : (zh ? '结算详情' : 'Hand details'), enabled: true },
      { id: 'next', label: this.state === 'gameOver' ? (zh ? '再玩一次' : 'Play again') : (zh ? '下一局' : 'Next hand'), enabled: true, primary: true },
    ];
    const human = this.players[0];
    const toCall = Math.min(Math.max(0, this.currentBet - human.bet), human.chips);
    const canAct = this.isHumanTurn();
    const canRaise = this.getRaiseTarget(human) > this.currentBet;
    if (this.pendingAllIn) return [
      { id: 'cancel', label: zh ? '取消' : 'Cancel', enabled: true },
      { id: 'call', label: toCall === 0 ? (zh ? '过牌' : 'Check') : `${zh ? '跟注' : 'Call'} ${toCall}`, enabled: false },
      { id: 'raise', label: zh ? '加注' : 'Raise', enabled: false },
      { id: 'all-in', label: zh ? `确认全下 ${human.chips}` : `Confirm ${human.chips}`, enabled: true, primary: true },
    ];
    return [
      { id: 'fold', label: zh ? '弃牌' : 'Fold', enabled: canAct },
      { id: 'call', label: toCall === 0 ? (zh ? '过牌' : 'Check') : `${zh ? '跟注' : 'Call'} ${toCall}`, enabled: canAct, primary: true },
      { id: 'raise', label: canRaise ? `${zh ? '加到' : 'Raise to'} ${this.getRaiseTarget(human)}` : (zh ? '加注' : 'Raise'), enabled: canAct && canRaise },
      { id: 'all-in', label: zh ? '全下' : 'All-in', enabled: canAct && human.chips > 0 },
    ];
  }

  private drawOverlay(ctx: CanvasRenderingContext2D, _theme: ThemePalette, zh: boolean) {
    this.drawResultOverlay(ctx, {
      title: zh ? '牌局结束' : 'Tournament complete',
      tone: this.players[0].chips > 0 ? 'success' : 'danger',
      details: [`${zh ? '筹码' : 'Chips'} ${this.score}`, `${zh ? '完成局数' : 'Hands'} ${this.completedHands}/${TOTAL_HANDS}`],
      hint: zh ? '点击、空格或回车重新开始' : 'Click, Space or Enter to play again',
    });
  }

  private signed(amount: number) { return amount > 0 ? `+${amount}` : amount < 0 ? `−${Math.abs(amount)}` : '0'; }

  private revealHole(player: Player) {
    return player.isHuman && !player.folded || this.state !== 'playing' && !player.folded && this.showdownHands.has(player.seat);
  }

  private highlighted(card: PokerCard): boolean {
    if (this.state === 'playing' || this.highlightedSeat === null) return false;
    return this.showdownHands.get(this.highlightedSeat)?.bestFive?.some(best => best.rank === card.rank && best.suit === card.suit) ?? false;
  }

  private resultDetails(zh: boolean) {
    const human = this.players[0];
    const selected = this.highlightedSeat === null ? null : this.players[this.highlightedSeat];
    const hand = selected && this.showdownHands.get(selected.seat);
    const title = selected && hand ? `${zh ? selected.nameZh : selected.name} · ${zh ? hand.labelZh : hand.label}` : (zh ? '本手结算' : 'Hand settlement');
    const rows = [zh
      ? `你的投入 ${human.committed} · 收回 ${human.wonThisHand} · 净收益 ${this.signed(human.wonThisHand - human.committed)}`
      : `You committed ${human.committed} · Returned ${human.wonThisHand} · Net ${this.signed(human.wonThisHand - human.committed)}`];
    if (hand?.bestFive) rows.push(`${zh ? '高亮最佳五张' : 'Highlighted best five'}: ${hand.bestFive.map(card => `${this.rankLabel(card.rank)}${this.suitSymbol(card.suit as Suit)}`).join(' ')}`);
    this.handPots.forEach((pot, i) => {
      const label = pot.refund ? (zh ? '退回' : 'Return') : i === 0 ? (zh ? '主池' : 'Main pot') : (zh ? `边池 ${i}` : `Side pot ${i}`);
      const names = pot.winners.map(index => `${zh ? this.players[index].nameZh : this.players[index].name} ${pot.payouts[index]}`).join(' / ');
      rows.push(`${label} ${pot.amount} → ${names}. ${zh ? pot.explanation.zh : pot.explanation.en}`);
    });
    return { title, body: rows.join('\n') };
  }

  private drawChipFlights(ctx: CanvasRenderingContext2D, theme: ThemePalette, l: PokerLayout) {
    if (this.reducedMotion.matches) return;
    const pot = { x: l.board.x + l.board.w / 2, y: l.board.y - 8 };
    for (const flight of this.motion.chips) {
      const raw = this.motion.progress(flight.start, flight.duration);
      if (raw <= 0 || raw >= 1) continue;
      const seat = this.seatLayout[flight.seat];
      const from = flight.kind === 'bet' ? seat : pot;
      const to = flight.kind === 'bet' ? pot : seat;
      const p = ease('outCubic', raw);
      const x = from.x + (to.x - from.x) * p;
      const y = from.y + (to.y - from.y) * p;
      ctx.save();
      ctx.globalAlpha = Math.min(1, raw * 8, (1 - raw) * 6);
      for (let chip = 0; chip < 3; chip++) {
        ctx.beginPath(); ctx.ellipse(x, y - chip * 3, 5, 3, 0, 0, Math.PI * 2);
        ctx.fillStyle = theme.primary; ctx.fill(); ctx.strokeStyle = theme.felt; ctx.lineWidth = 1; ctx.stroke();
      }
      ctx.restore();
    }
  }

  private drawAnimatedCard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
    card: Card, faceUp: boolean, theme: ThemePalette, dim: boolean, key: string, flip: boolean,
    foldedSeat?: number, highlighted = false) {
    const reduce = this.reducedMotion.matches;
    let progress = reduce ? 1 : this.motion.card(key);
    if (flip && key.startsWith('hole:') && faceUp && !reduce) progress = Math.min(progress, this.motion.revealProgress());
    const fold = foldedSeat === undefined ? 0 : reduce ? 1 : this.motion.folded(foldedSeat);
    ctx.save();
    ctx.globalAlpha = progress < 1 ? Math.min(1, progress * 4) : 1;
    if (!reduce) ctx.translate(0, flip ? 0 : (1 - ease('outCubic', progress)) * -8 + fold * 4);
    if (flip && progress < 1) {
      ctx.translate(x + w / 2, 0); ctx.scale(Math.max(0.03, Math.abs(1 - progress * 2)), 1); ctx.translate(-x - w / 2, 0);
    }
    this.drawCard(ctx, x, y, w, h, card, faceUp && (!flip || progress >= 0.5), theme, dim && foldedSeat === undefined);
    if (foldedSeat !== undefined) {
      // Face down from the first folded frame: even the transition cannot leak ranks.
      ctx.globalAlpha *= 0.55 * fold;
      this.panel(ctx, x, y, w, h, 5, theme.felt);
    }
    if (highlighted && (reduce || this.motion.highlightReady()) && progress >= 1) {
      this.roundRect(ctx, x + 1, y + 1, w - 2, h - 2, 4);
      ctx.strokeStyle = theme.primary; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = theme.primary; ctx.fillRect(x + 5, y + h - 4, Math.max(4, w - 10), 2);
    }
    ctx.restore();
  }

  private drawCard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, card: Card, faceUp: boolean, theme: ThemePalette, dim: boolean) {
    ctx.save();
    if (dim) ctx.globalAlpha = 0.45;
    this.panel(ctx, x, y, w, h, 5, faceUp ? theme.cardFace : theme.cardBack, faceUp ? '#c7d5cd' : theme.cardBackAlt);
    if (!faceUp) {
      this.roundRect(ctx, x + 4, y + 4, w - 8, h - 8, 3);
      ctx.strokeStyle = theme.cardBackAlt;
      ctx.lineWidth = 0.75;
      ctx.stroke();
    } else {
      const color = card.suit < 2 ? theme.red : theme.black;
      const small = h <= 48;
      this.text(ctx, this.rankLabel(card.rank), x + (small ? w / 2 : 7), y + (small ? 13 : 20), small ? 12 : 18, color, small ? 'center' : 'left', 600);
      this.text(ctx, this.suitSymbol(card.suit), x + w * (small ? 0.5 : 0.64), y + h - (small ? 4 : 10), small ? 12 : 24, color);
    }
    ctx.restore();
  }

  private getStreetLabel(zh: boolean): string {
    if (this.stage === 'preflop') return zh ? '翻牌前' : 'Preflop';
    if (this.stage === 'flop') return zh ? '翻牌圈' : 'Flop';
    if (this.stage === 'turn') return zh ? '转牌圈' : 'Turn';
    if (this.stage === 'river') return zh ? '河牌圈' : 'River';
    return zh ? '摊牌' : 'Showdown';
  }

  private rankLabel(rank: number): string {
    if (rank === 14) return 'A';
    if (rank === 13) return 'K';
    if (rank === 12) return 'Q';
    if (rank === 11) return 'J';
    return String(rank);
  }

  private suitSymbol(suit: Suit): string {
    return ['♥', '♦', '♣', '♠'][suit];
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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
