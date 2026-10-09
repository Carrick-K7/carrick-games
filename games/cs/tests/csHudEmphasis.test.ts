import { describe, expect, it } from 'vitest';
import { HudEmphasis, type HudEmphasisInput } from '../src/csHudEmphasis';

const snapshot = (clock: number, overrides: Partial<HudEmphasisInput> = {}): HudEmphasisInput => ({
  clock, location: 'CT spawn', scopeKey: '', ...overrides,
});
const hidden = { location: false, scope: false };

describe('CS noninteractive HUD caption emphasis', () => {
  it('shows initial location for exactly two simulation seconds with no equipment flag', () => {
    const emphasis = new HudEmphasis();
    expect(emphasis.update(snapshot(10))).toEqual({ location: true, scope: false });
    expect(emphasis.update(snapshot(11.999))).toEqual({ location: true, scope: false });
    expect(emphasis.update(snapshot(12))).toEqual(hidden);
    expect(emphasis.update(snapshot(100))).toEqual(hidden);
  });

  it('does not refresh deadlines on repeated paused draws, before or after expiry', () => {
    const emphasis = new HudEmphasis();
    emphasis.update(snapshot(0, { scopeKey: '2x' }));
    for (let draw = 0; draw < 100; draw++) {
      expect(emphasis.update(snapshot(1.5, { scopeKey: '2x' }))).toEqual({ location: true, scope: true });
    }
    expect(emphasis.update(snapshot(1.6, { scopeKey: '2x' })).scope).toBe(false);
    for (let draw = 0; draw < 100; draw++) {
      expect(emphasis.update(snapshot(2, { scopeKey: '2x' }))).toEqual(hidden);
    }
    expect(emphasis.update(snapshot(2.1, { scopeKey: '2x' }))).toEqual(hidden);
  });

  it('uses the latest rapid location change, including real transitions at the same clock', () => {
    const emphasis = new HudEmphasis();
    emphasis.update(snapshot(0));
    emphasis.update(snapshot(10, { location: 'Long A' }));
    emphasis.update(snapshot(11, { location: 'A site' }));
    const current = { location: 'Short A' };
    expect(emphasis.update(snapshot(11, current)).location).toBe(true);
    expect(emphasis.update(snapshot(12.2, current)).location).toBe(true);
    expect(emphasis.update(snapshot(13.199, current)).location).toBe(true);
    expect(emphasis.update(snapshot(13.2, current)).location).toBe(false);
  });

  it('shows a location change for 2.2 seconds without refreshing scope', () => {
    const emphasis = new HudEmphasis();
    emphasis.update(snapshot(0, { scopeKey: '2x' }));
    const current = { location: 'Long A', scopeKey: '2x' };
    expect(emphasis.update(snapshot(10, current))).toEqual({ ...hidden, location: true });
    expect(emphasis.update(snapshot(12.199, current)).location).toBe(true);
    expect(emphasis.update(snapshot(12.2, current))).toEqual(hidden);
  });

  it('shows scope-on/zoom changes for 1.6 seconds and hides scope-off immediately', () => {
    const emphasis = new HudEmphasis();
    emphasis.update(snapshot(0));
    expect(emphasis.update(snapshot(10, { scopeKey: '2x' }))).toEqual({ ...hidden, scope: true });
    expect(emphasis.update(snapshot(11.599, { scopeKey: '2x' })).scope).toBe(true);
    expect(emphasis.update(snapshot(11.6, { scopeKey: '2x' })).scope).toBe(false);
    expect(emphasis.update(snapshot(12, { scopeKey: '4x' })).scope).toBe(true);
    expect(emphasis.update(snapshot(12, { scopeKey: '' })).scope).toBe(false);
    expect(emphasis.update(snapshot(12, { scopeKey: '4x' })).scope).toBe(true);
    expect(emphasis.update(snapshot(13.599, { scopeKey: '4x' })).scope).toBe(true);
    expect(emphasis.update(snapshot(13.6, { scopeKey: '4x' }))).toEqual(hidden);
  });

  it('maintains independent deadlines when both captions change', () => {
    const emphasis = new HudEmphasis();
    emphasis.update(snapshot(0));
    const current = { location: 'A site', scopeKey: '4x' };
    expect(emphasis.update(snapshot(10, current))).toEqual({ location: true, scope: true });
    expect(emphasis.update(snapshot(11.6, current))).toEqual({ location: true, scope: false });
    expect(emphasis.update(snapshot(12.2, current))).toEqual(hidden);
  });

  it('retriggers initial location on revive without refreshing an unchanged scope', () => {
    const emphasis = new HudEmphasis();
    const scoped = { scopeKey: '2x' };
    emphasis.update(snapshot(0, scoped));
    expect(emphasis.update(snapshot(1, { ...scoped, alive: false }))).toEqual({ location: true, scope: true });
    expect(emphasis.update(snapshot(10, { ...scoped, alive: false }))).toEqual(hidden);
    expect(emphasis.update(snapshot(10, scoped))).toEqual({ location: true, scope: false });
    expect(emphasis.update(snapshot(11.999, scoped)).location).toBe(true);
    expect(emphasis.update(snapshot(12, scoped))).toEqual(hidden);
  });

  it('supports an initially dead player and an explicit alive respawn', () => {
    const emphasis = new HudEmphasis();
    expect(emphasis.update(snapshot(0, { alive: false })).location).toBe(true);
    expect(emphasis.update(snapshot(2, { alive: false }))).toEqual(hidden);
    expect(emphasis.update(snapshot(5, { alive: true })).location).toBe(true);
    expect(emphasis.update(snapshot(7, { alive: true }))).toEqual(hidden);
  });

  it('restarts after reset even with unchanged identity and clock', () => {
    const emphasis = new HudEmphasis();
    emphasis.update(snapshot(0, { scopeKey: '2x' }));
    expect(emphasis.update(snapshot(10, { scopeKey: '2x' }))).toEqual(hidden);
    emphasis.reset();
    emphasis.reset();
    expect(emphasis.update(snapshot(10, { scopeKey: '2x' }))).toEqual({ location: true, scope: true });
    expect(emphasis.update(snapshot(12, { scopeKey: '2x' }))).toEqual(hidden);
  });

  it('restarts on clock rewind, including a finite negative origin', () => {
    const emphasis = new HudEmphasis();
    emphasis.update(snapshot(100));
    expect(emphasis.update(snapshot(102))).toEqual(hidden);
    expect(emphasis.update(snapshot(-5))).toEqual({ location: true, scope: false });
    expect(emphasis.update(snapshot(-3))).toEqual(hidden);
  });

  it('restarts on session identity changes but not repeated empty session keys', () => {
    const emphasis = new HudEmphasis();
    emphasis.update(snapshot(0));
    expect(emphasis.update(snapshot(10))).toEqual(hidden);
    expect(emphasis.update(snapshot(10, { sessionKey: '' })).location).toBe(true);
    expect(emphasis.update(snapshot(12, { sessionKey: '' }))).toEqual(hidden);
    expect(emphasis.update(snapshot(12, { sessionKey: 'round-2' })).location).toBe(true);
    expect(emphasis.update(snapshot(14, { sessionKey: 'round-2' }))).toEqual(hidden);
    expect(emphasis.update(snapshot(14)).location).toBe(true);
  });

  it('never shows empty captions and treats later nonempty values as real changes', () => {
    const emphasis = new HudEmphasis();
    const empty = { location: '', scopeKey: '' };
    expect(emphasis.update(snapshot(0, empty))).toEqual(hidden);
    expect(emphasis.update(snapshot(1, empty))).toEqual(hidden);
    expect(emphasis.update(snapshot(10))).toEqual({ location: true, scope: false });
    expect(emphasis.update(snapshot(10, empty))).toEqual(hidden);
    expect(emphasis.update(snapshot(10))).toEqual({ location: true, scope: false });
    expect(emphasis.update(snapshot(12.199))).toEqual({ ...hidden, location: true });
    expect(emphasis.update(snapshot(12.2))).toEqual(hidden);
  });

  it.each([NaN, Infinity, -Infinity])('freezes non-finite clock %s without poisoning or refreshing deadlines', clock => {
    const emphasis = new HudEmphasis();
    emphasis.update(snapshot(10, { scopeKey: '2x' }));
    for (let draw = 0; draw < 10; draw++) {
      expect(emphasis.update(snapshot(clock, { scopeKey: '2x' }))).toEqual({ location: true, scope: true });
    }
    expect(emphasis.update(snapshot(clock, { alive: false, location: '', scopeKey: '' }))).toEqual(hidden);
    expect(emphasis.update(snapshot(12, { scopeKey: '2x' }))).toEqual(hidden);
    expect(emphasis.update(snapshot(clock, { scopeKey: '2x' }))).toEqual(hidden);
    expect(emphasis.update(snapshot(13, { location: 'Long A' })).location).toBe(true);
  });

  it('starts full initial windows on first finite clock after invalid startup', () => {
    const emphasis = new HudEmphasis();
    expect(emphasis.update(snapshot(NaN))).toEqual({ location: true, scope: false });
    expect(emphasis.update(snapshot(Infinity, { location: '' }))).toEqual(hidden);
    expect(emphasis.update(snapshot(100))).toEqual({ location: true, scope: false });
    expect(emphasis.update(snapshot(101.999)).location).toBe(true);
    expect(emphasis.update(snapshot(102))).toEqual(hidden);
  });

  it('samples transitions seen during invalid time on the next finite update', () => {
    const emphasis = new HudEmphasis();
    emphasis.update(snapshot(0));
    emphasis.update(snapshot(2));
    const current = { location: 'B site', scopeKey: '4x', sessionKey: 'new-round' };
    expect(emphasis.update(snapshot(NaN, current))).toEqual(hidden);
    expect(emphasis.update(snapshot(10, current))).toEqual({ location: true, scope: true });
    expect(emphasis.update(snapshot(12, current))).toEqual(hidden);
  });

  it('keeps two HUD instances independent, including resets and rewinds', () => {
    const first = new HudEmphasis(), second = new HudEmphasis();
    first.update(snapshot(0));
    expect(first.update(snapshot(10))).toEqual(hidden);
    expect(second.update(snapshot(10)).location).toBe(true);
    first.reset();
    expect(first.update(snapshot(10)).location).toBe(true);
    expect(second.update(snapshot(12))).toEqual(hidden);
    expect(first.update(snapshot(0)).location).toBe(true);
    expect(second.update(snapshot(12))).toEqual(hidden);
  });

  it('neither mutates nor retains caller snapshots or returned flags', () => {
    const emphasis = new HudEmphasis();
    const input = snapshot(0);
    const result = emphasis.update(input);
    input.location = 'Long A';
    result.location = false;
    expect(emphasis.update(Object.freeze(snapshot(1))).location).toBe(true);
    expect(emphasis.update(Object.freeze(snapshot(2)))).toEqual(hidden);
  });
});
