import { describe, expect, it } from 'vitest';
import { PokerMotion } from '../src/texasholdMotion';

describe('poker presentation timeline', () => {
  it('staggers deals and flips without executing gameplay callbacks', () => {
    const m = new PokerMotion();
    m.deal('hole:0:0'); m.deal('hole:0:1', 0.12); m.deal('board:0', 0, true);
    expect(m.card('hole:0:0')).toBe(0);
    m.update(0.08);
    expect(m.card('hole:0:0')).toBeCloseTo(0.5);
    expect(m.card('hole:0:1')).toBe(0);
    expect(m.card('board:0')).toBeCloseTo(0.08 / 0.22);
    m.update(1);
    expect(m.card('hole:0:1')).toBe(1);
    expect(m.diagnostics().cards).toBe(0);
  });
  it('keeps folds bounded and lets them finish independently of the betting round', () => {
    const m = new PokerMotion(); m.fold(2); m.update(0.08);
    expect(m.folded(2)).toBeCloseTo(0.5);
    m.update(0.08); expect(m.folded(2)).toBe(1);
    expect(m.diagnostics().folds).toBe(0);
  });
  it('reveals before highlighting and paying out, with no chip mutations', () => {
    const m = new PokerMotion();
    m.showdown(); m.transfer(0, 160, 'payout', 0.24);
    expect(m.highlightReady()).toBe(false);
    expect(m.progress(m.chips[0].start, m.chips[0].duration)).toBe(0);
    m.update(0.23); expect(m.highlightReady()).toBe(true);
    m.update(0.16); expect(m.progress(m.chips[0].start, m.chips[0].duration)).toBeCloseTo(0.5);
    m.update(0.2); expect(m.chips).toHaveLength(0);
  });
  it('bounds transfer count even with repeated events and ignores nonpositive transfers', () => {
    const m = new PokerMotion();
    m.transfer(0, 0, 'bet'); m.transfer(0, -1, 'bet');
    expect(m.chips).toHaveLength(0);
    for (let i = 0; i < 100; i++) m.transfer(i % 4, 20, 'bet');
    expect(m.chips).toHaveLength(20);
  });
  it('emphasizes a changed actor once, not on every render', () => {
    const m = new PokerMotion(); m.turn(0); m.update(0.09);
    m.turn(0); expect(m.turnProgress()).toBeCloseTo(0.5);
    m.update(1); expect(m.turnProgress()).toBe(1);
    m.turn(1); expect(m.turnProgress()).toBe(0);
  });
  it('settles reduced motion immediately and resets old events on a new hand', () => {
    const m = new PokerMotion(); m.deal('board:0'); m.fold(1); m.transfer(0, 20, 'bet'); m.showdown();
    m.update(0.04); m.settle();
    expect(m.card('board:0')).toBe(1); expect(m.highlightReady()).toBe(true); expect(m.chips).toHaveLength(0);
    expect(m.time).toBe(0.04);
    m.reset(); expect(m.diagnostics()).toEqual({time:0,cards:0,folds:0,chipFlights:0,reveal:1});
  });
  it('does not advance for invalid deltas', () => {
    const m = new PokerMotion();
    for (const dt of [0, -1, NaN, Infinity]) m.update(dt);
    expect(m.time).toBe(0);
  });
});
