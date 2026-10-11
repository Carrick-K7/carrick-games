import { BaseGame, createDefaultGameHost, type GameHost, type GameShellSnapshot, type GameViewport } from '@carrick/game-sdk/game';
import { getRetroPalette } from '@carrick/game-sdk/render';
import {
  FloatTexts,
  Particles,
  ScreenShake,
  fx,
} from '@carrick/game-sdk/fx';
import {
  evaluatePreflopStrength,
  hasFlushDraw,
  hasStraightDraw,
  type PokerCard,
} from './texasholdRules.js';

import { pokerLayout, type PokerLayout } from './texasholdLayout.js';
import { PokerActions, type PokerAction, type PokerActionId } from './texasholdActions.js';

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

interface HandValue {
  category: number;
  tiebreakers: number[];
  label: string;
  labelZh: string;
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

  constructor(host?: GameHost) {
    super(host ?? createDefaultGameHost('gameCanvas', W, H));
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
    super.setPresentationPaused(paused);
    this.renderFrame();
  }

  getDiagnostics() {
    return {
      state: this.state, stage: this.stage, completedHands: this.completedHands,
      pot: this.getPotSize(), currentPlayer: this.currentPlayerIndex,
      chips: this.players.map(player => player.chips), communityCount: this.community.length,
      actions: this.getActions().map(({ id, enabled }) => ({ id, enabled })),
      layout: this.layout(),
    };
  }

  private layout(): PokerLayout {
    return pokerLayout(this.width, this.height, this.viewport?.safeArea);
  }

  draw(ctx: CanvasRenderingContext2D) {
    const theme = this.getTheme();
    const zh = this.isZh();
    const layout = this.layout();
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, this.width, this.height);
    this.drawTable(ctx, theme, layout);
    this.drawHeader(ctx, theme, zh, layout);
    this.drawCommunity(ctx, theme, zh, layout);
    this.drawPlayers(ctx, theme, zh, layout);
    this.drawStatusBar(ctx, theme, zh, layout);
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.particles.draw(ctx);
      this.floats.draw(ctx);
    }
    if (this.state === 'gameOver') this.drawOverlay(ctx, theme, zh);
    this.syncActions(layout, zh);
  }

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    if (this.presentationPaused) return;
    if (e.target instanceof HTMLElement && e.target.closest('button')) return;
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
    this.actions?.destroy();
    this.actions = null;
    super.destroy();
  }

  private handleKeyInput(e: KeyboardEvent) {
    const key = e.key.toLowerCase();

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

  private handlePointerInput(clientX: number, clientY: number) {
    if (this.state === 'betweenHands') {
      this.startNewHand();
      return;
    }

    if (this.state === 'gameOver') {
      this.init();
      return;
    }

    // Betting uses native controls: canvas taps never place an accidental bet.
  }

  private handleHumanAction(action: PlayerAction) {
    if (!this.isHumanTurn()) return;
    this.performPlayerAction(0, action);
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
        if (card) this.players[index].hole.push(card);
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

      for (const winnerIndex of orderedWinners) {
        const payout = share + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder -= 1;
        this.players[winnerIndex].chips += payout;
        this.players[winnerIndex].wonThisHand += payout;
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
    const pot = this.getPotSize();
    this.players[winnerIndex].chips += pot;
    this.players[winnerIndex].wonThisHand += pot;
    this.pushLog(
      `${this.players[winnerIndex].name} wins ${pot} uncontested`,
      `${this.players[winnerIndex].nameZh} 直接收下 ${pot}`
    );
    this.finishHand();
  }

  private emitPayoutFx() {
    const palette = getRetroPalette(this.isDarkTheme());
    for (let index = 0; index < this.players.length; index += 1) {
      const player = this.players[index];
      if (player.wonThisHand <= 0) continue;
      const seat = this.seatLayout[index];
      for (const emit of fx.pop(seat.x, seat.y + CARD_H / 2, [palette.amber, palette.primary])) {
        emit.count = Math.min(emit.count, player.isHuman ? 10 : 6);
        if (!this.isDarkTheme()) emit.blend = 'source-over';
        this.particles.emit(emit);
      }
      this.floats.add(seat.x, seat.y - 8, `+${player.wonThisHand}`, {
        color: palette.amber,
        size: player.isHuman ? 16 : 13,
        life: 1,
      });
    }
  }

  private finishHand() {
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
      if (card) this.community.push(card);
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

  private evaluateBestHand(cards: Card[]): HandValue {
    const counts = this.getRankCounts(cards);
    const groups = Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || b[0] - a[0]);
    const distinctRanks = Array.from(new Set(cards.map((card) => card.rank))).sort((a, b) => b - a);
    const flushSuit = ([0, 1, 2, 3] as Suit[]).find((suit) =>
      cards.filter((card) => card.suit === suit).length >= 5
    );
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

  private compareHands(a: HandValue, b: HandValue): number {
    if (a.category !== b.category) return a.category - b.category;
    const length = Math.max(a.tiebreakers.length, b.tiebreakers.length);
    for (let i = 0; i < length; i += 1) {
      const left = a.tiebreakers[i] ?? 0;
      const right = b.tiebreakers[i] ?? 0;
      if (left !== right) return left - right;
    }
    return 0;
  }

  private getRankCounts(cards: Card[]): Map<number, number> {
    const counts = new Map<number, number>();
    for (const card of cards) {
      counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
    }
    return counts;
  }

  private findStraightHigh(ranks: number[]): number {
    const values = Array.from(new Set(ranks));
    if (values.includes(14)) values.push(1);
    values.sort((a, b) => a - b);

    let run = 1;
    let best = 0;
    for (let i = 1; i < values.length; i += 1) {
      if (values[i] === values[i - 1] + 1) {
        run += 1;
        if (run >= 5) best = values[i];
      } else if (values[i] !== values[i - 1]) {
        run = 1;
      }
    }
    return best;
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
      if (card) this.drawCard(ctx, px, y, cw, h, card, true, theme, false);
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
      const nameLabel = `${active ? '› ' : ''}${name}${player.wonThisHand > 0 ? ` +${player.wonThisHand}` : ''}`;
      this.text(ctx, nameLabel, seat.x, seat.y, 13, player.wonThisHand > 0 ? theme.primary : color, 'center', active ? 650 : 500);
      this.text(ctx, String(player.chips), seat.x, seat.y + 20, 17, color, 'center', 600);
      const ch = l.opponentCardHeight;
      const cw = ch * 0.72;
      const cardY = seat.y + 28;
      for (let i = 0; i < player.hole.length; i++) {
        this.drawCard(ctx, seat.x - cw - 2 + i * (cw + 4), cardY, cw, ch, player.hole[i], this.state !== 'playing' || player.folded, theme, dim);
      }
      const action = this.playerStatus(player, zh);
      this.text(ctx, action, seat.x, cardY + ch + 17, 11, player.wonThisHand > 0 ? theme.primary : theme.muted);
      this.drawSeatMarkers(ctx, theme, index, seat.x + Math.min(42, seat.width / 2 - 9), seat.y + 18);
      this.seatLayout[index] = { x: seat.x, y: cardY };
      if (active) {
        ctx.fillStyle = theme.primary;
        ctx.fillRect(seat.x - 14, cardY + ch + 22, 28, 2);
      }
    }
    const human = this.players[0];
    const { x, y, h } = l.human;
    const cw = h * 0.7;
    for (let i = 0; i < human.hole.length; i++) {
      this.drawCard(ctx, x + i * (cw + 6), y, cw, h, human.hole[i], true, theme, human.folded || human.out);
    }
    const tx = x + cw * 2 + 22;
    const humanLabel = human.wonThisHand > 0 ? `${zh ? '你' : 'You'} +${human.wonThisHand}` : (zh ? '你的筹码' : 'Your chips');
    this.text(ctx, humanLabel, tx, y + 14, 12, human.wonThisHand > 0 ? theme.primary : theme.muted, 'left');
    this.text(ctx, String(human.chips), tx, y + 39, 24, theme.text, 'left', 600);
    this.text(ctx, this.playerStatus(human, zh), tx, y + 58, 11, theme.primary, 'left');
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
    if (this.state !== 'playing') return zh ? '本局结束' : 'Hand complete';
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
      columns: this.state === 'playing' ? l.columns : 1, dark: this.isDarkTheme(),
      hidden: this.presentationPaused, status: this.status(zh) });
  }

  private activateAction(id: PokerActionId) {
    if (this.presentationPaused) return;
    if (id === 'next') {
      if (this.state === 'betweenHands') this.startNewHand();
      else if (this.state === 'gameOver') this.init();
    } else if (this.getActions().some(action => action.id === id && action.enabled)) {
      this.handleHumanAction(id);
    }
    this.renderFrame();
  }

  private getActions(): PokerAction[] {
    const zh = this.isZh();
    if (this.state !== 'playing') return [{ id: 'next', label: this.state === 'gameOver' ? (zh ? '再玩一次' : 'Play again') : (zh ? '下一局' : 'Next hand'), enabled: true, primary: true }];
    const human = this.players[0];
    const toCall = Math.min(Math.max(0, this.currentBet - human.bet), human.chips);
    const canAct = this.isHumanTurn();
    const canRaise = this.getRaiseTarget(human) > this.currentBet;
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
