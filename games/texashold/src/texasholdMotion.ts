export interface ChipFlight {
  seat: number;
  amount: number;
  kind: 'bet' | 'payout';
  start: number;
  duration: number;
}

/** Presentation-only timeline. No timers/callbacks can deal cards or move money. */
export class PokerMotion {
  time = 0;
  private readonly cards = new Map<string, { start: number; duration: number }>();
  private readonly folds = new Map<number, number>();
  readonly chips: ChipFlight[] = [];
  private actor: number | null = null;
  private actorAt = -1;
  private revealAt: number | null = null;

  reset() {
    this.time = 0;
    this.cards.clear(); this.folds.clear(); this.chips.length = 0;
    this.actor = null; this.actorAt = -1; this.revealAt = null;
  }

  settle() {
    this.cards.clear(); this.folds.clear(); this.chips.length = 0;
    this.actorAt = -1; this.revealAt = null;
  }

  update(dt: number) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.time += dt;
    for (const [key, value] of this.cards) if (this.time >= value.start + value.duration) this.cards.delete(key);
    for (const [seat, at] of this.folds) if (this.time >= at + 0.16) this.folds.delete(seat);
    for (let i = this.chips.length - 1; i >= 0; i--) {
      const event = this.chips[i];
      if (this.time >= event.start + event.duration) this.chips.splice(i, 1);
    }
  }

  deal(key: string, delay = 0, flip = false) {
    this.cards.set(key, { start: this.time + delay, duration: flip ? 0.22 : 0.16 });
  }
  card(key: string): number {
    const event = this.cards.get(key);
    return event ? this.progress(event.start, event.duration) : 1;
  }
  fold(seat: number) { this.folds.set(seat, this.time); }
  folded(seat: number): number {
    const at = this.folds.get(seat);
    return at === undefined ? 1 : this.progress(at, 0.16);
  }
  transfer(seat: number, amount: number, kind: ChipFlight['kind'], delay = 0) {
    if (amount <= 0) return;
    this.chips.push({ seat, amount, kind, start: this.time + delay, duration: kind === 'bet' ? 0.22 : 0.3 });
    if (this.chips.length > 20) this.chips.splice(0, this.chips.length - 20);
  }
  turn(seat: number | null) {
    if (this.actor === seat) return;
    this.actor = seat; this.actorAt = this.time;
  }
  turnProgress() { return this.actorAt < 0 ? 1 : this.progress(this.actorAt, 0.18); }
  showdown() { this.revealAt = this.time; }
  revealProgress() { return this.revealAt === null ? 1 : this.progress(this.revealAt, 0.22); }
  highlightReady() { return this.revealAt === null || this.time - this.revealAt >= 0.22; }
  progress(start: number, duration: number) { return Math.max(0, Math.min(1, (this.time - start) / duration)); }
  diagnostics() { return { time: this.time, cards: this.cards.size, folds: this.folds.size, chipFlights: this.chips.length, reveal: this.revealProgress() }; }
}
