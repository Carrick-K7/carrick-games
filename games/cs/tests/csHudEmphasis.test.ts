import { describe, expect, it } from 'vitest';
import { HudEmphasis, type HudEmphasisInput } from '../src/csHudEmphasis';

const snapshot = (clock: number, overrides: Partial<HudEmphasisInput> = {}): HudEmphasisInput => ({
  clock, weaponKey: 'primary:ak47', location: 'CT spawn', scopeKey: '', ...overrides,
});
const hidden = { equipment: false, location: false, scope: false };

describe('CS noninteractive HUD caption emphasis', () => {
  it('shows initial equipment and location for exactly two simulation seconds', () => {
    const emphasis = new HudEmphasis();
    expect(emphasis.update(snapshot(10))).toEqual({ equipment: true, location: true, scope: false });
    expect(emphasis.update(snapshot(11.999))).toEqual({ equipment: true, location: true, scope: false });
    expect(emphasis.update(snapshot(12))).toEqual(hidden);
    expect(emphasis.update(snapshot(100))).toEqual(hidden);
  });

  it('does not refresh deadlines on repeated paused draws, before or after expiry', () => {
    const emphasis = new HudEmphasis();
    emphasis.update(snapshot(0, { scopeKey: '2x' }));
    for (let draw = 0; draw < 100; draw++) {
      expect(emphasis.update(snapshot(1.5, { scopeKey: '2x' }))).toEqual({ equipment: true, location: true, scope: true });
    }
    expect(emphasis.update(snapshot(1.6, { scopeKey: '2x' })).scope).toBe(false);
    for (let draw = 0; draw < 100; draw++) {
      expect(emphasis.update(snapshot(2, { scopeKey: '2x' }))).toEqual(hidden);
    }
    expect(emphasis.update(snapshot(2.1, { scopeKey: '2x' }))).toEqual(hidden);
  });

  it.each(['primary:m4a1', 'secondary:ak47', 'knife:karambit', 'knife:butterfly'])(
    'shows equipment for 1.8 seconds when opaque weapon/slot/appearance key becomes %s', weaponKey => {
      const emphasis = new HudEmphasis();
      emphasis.update(snapshot(0));
      expect(emphasis.update(snapshot(10, { weaponKey }))).toEqual({ ...hidden, equipment: true });
      expect(emphasis.update(snapshot(11.799, { weaponKey })).equipment).toBe(true);
      expect(emphasis.update(snapshot(11.8, { weaponKey }))).toEqual(hidden);
    },
  );

  it('uses the latest rapid change, including real transitions at the same clock', () => {
    const emphasis = new HudEmphasis();
    emphasis.update(snapshot(0));
    emphasis.update(snapshot(10, { weaponKey: 'knife:default' }));
    emphasis.update(snapshot(11, { weaponKey: 'knife:karambit' }));
    const current = { weaponKey: 'knife:butterfly' };
    expect(emphasis.update(snapshot(11, current)).equipment).toBe(true);
    expect(emphasis.update(snapshot(11.8, current)).equipment).toBe(true);
    expect(emphasis.update(snapshot(12.799, current)).equipment).toBe(true);
    expect(emphasis.update(snapshot(12.8, current)).equipment).toBe(false);
  });

  it('shows a location change for 2.2 seconds without refreshing equipment', () => {
    const emphasis = new HudEmphasis();
    emphasis.update(snapshot(0));
    const current = { location: 'Long A' };
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

  it('maintains independent deadlines when all three captions change', () => {
    const emphasis = new HudEmphasis();
    emphasis.update(snapshot(0));
    const current = { weaponKey: 'primary:awp', location: 'A site', scopeKey: '4x' };
    expect(emphasis.update(snapshot(10, current))).toEqual({ equipment: true, location: true, scope: true });
    expect(emphasis.update(snapshot(11.6, current))).toEqual({ equipment: true, location: true, scope: false });
    expect(emphasis.update(snapshot(11.8, current))).toEqual({ equipment: false, location: true, scope: false });
    expect(emphasis.update(snapshot(12.2, current))).toEqual(hidden);
  });

  it('hides equipment on death and retriggers initial captions on revive', () => {
    const emphasis = new HudEmphasis();
    emphasis.update(snapshot(0));
    expect(emphasis.update(snapshot(1, { alive: false }))).toEqual({ ...hidden, location: true });
    expect(emphasis.update(snapshot(10, { alive: false, weaponKey: 'knife:default' }))).toEqual(hidden);
    const current = { weaponKey: 'knife:default' };
    expect(emphasis.update(snapshot(10, current))).toEqual({ equipment: true, location: true, scope: false });
    expect(emphasis.update(snapshot(11.999, current)).equipment).toBe(true);
    expect(emphasis.update(snapshot(12, current))).toEqual(hidden);
  });

  it('supports an initially dead player and an explicit alive respawn', () => {
    const emphasis = new HudEmphasis();
    expect(emphasis.update(snapshot(0, { alive: false })).equipment).toBe(false);
    expect(emphasis.update(snapshot(5, { alive: true })).equipment).toBe(true);
    expect(emphasis.update(snapshot(7, { alive: true }))).toEqual(hidden);
  });

  it('restarts after reset even with unchanged identity and clock', () => {
    const emphasis = new HudEmphasis();
    emphasis.update(snapshot(0, { scopeKey: '2x' }));
    expect(emphasis.update(snapshot(10, { scopeKey: '2x' }))).toEqual(hidden);
    emphasis.reset();
    emphasis.reset();
    expect(emphasis.update(snapshot(10, { scopeKey: '2x' }))).toEqual({ equipment: true, location: true, scope: true });
    expect(emphasis.update(snapshot(12, { scopeKey: '2x' }))).toEqual(hidden);
  });

  it('restarts on clock rewind, including a finite negative origin', () => {
    const emphasis = new HudEmphasis();
    emphasis.update(snapshot(100));
    expect(emphasis.update(snapshot(102))).toEqual(hidden);
    expect(emphasis.update(snapshot(-5))).toEqual({ equipment: true, location: true, scope: false });
    expect(emphasis.update(snapshot(-3))).toEqual(hidden);
  });

  it('restarts on session identity changes but not repeated empty session keys', () => {
    const emphasis = new HudEmphasis();
    emphasis.update(snapshot(0));
    expect(emphasis.update(snapshot(10))).toEqual(hidden);
    expect(emphasis.update(snapshot(10, { sessionKey: '' })).equipment).toBe(true);
    expect(emphasis.update(snapshot(12, { sessionKey: '' }))).toEqual(hidden);
    expect(emphasis.update(snapshot(12, { sessionKey: 'round-2' })).equipment).toBe(true);
    expect(emphasis.update(snapshot(14, { sessionKey: 'round-2' }))).toEqual(hidden);
    expect(emphasis.update(snapshot(14)).equipment).toBe(true);
  });

  it('never shows empty captions and treats later nonempty values as real changes', () => {
    const emphasis = new HudEmphasis();
    const empty = { weaponKey: '', location: '', scopeKey: '' };
    expect(emphasis.update(snapshot(0, empty))).toEqual(hidden);
    expect(emphasis.update(snapshot(1, empty))).toEqual(hidden);
    expect(emphasis.update(snapshot(10))).toEqual({ equipment: true, location: true, scope: false });
    expect(emphasis.update(snapshot(10, empty))).toEqual(hidden);
    expect(emphasis.update(snapshot(10))).toEqual({ equipment: true, location: true, scope: false });
    expect(emphasis.update(snapshot(11.8))).toEqual({ ...hidden, location: true });
    expect(emphasis.update(snapshot(12.2))).toEqual(hidden);
  });

  it.each([NaN, Infinity, -Infinity])('freezes non-finite clock %s without poisoning or refreshing deadlines', clock => {
    const emphasis = new HudEmphasis();
    emphasis.update(snapshot(10, { scopeKey: '2x' }));
    for (let draw = 0; draw < 10; draw++) {
      expect(emphasis.update(snapshot(clock, { scopeKey: '2x' }))).toEqual({ equipment: true, location: true, scope: true });
    }
    expect(emphasis.update(snapshot(clock, { alive: false, location: '', scopeKey: '' }))).toEqual(hidden);
    expect(emphasis.update(snapshot(12, { scopeKey: '2x' }))).toEqual(hidden);
    expect(emphasis.update(snapshot(clock, { scopeKey: '2x' }))).toEqual(hidden);
    expect(emphasis.update(snapshot(13, { weaponKey: 'knife:default' })).equipment).toBe(true);
  });

  it('starts full initial windows on first finite clock after invalid startup', () => {
    const emphasis = new HudEmphasis();
    expect(emphasis.update(snapshot(NaN))).toEqual({ equipment: true, location: true, scope: false });
    expect(emphasis.update(snapshot(Infinity, { weaponKey: '', location: '' }))).toEqual(hidden);
    expect(emphasis.update(snapshot(100))).toEqual({ equipment: true, location: true, scope: false });
    expect(emphasis.update(snapshot(101.999)).equipment).toBe(true);
    expect(emphasis.update(snapshot(102))).toEqual(hidden);
  });

  it('samples transitions seen during invalid time on the next finite update', () => {
    const emphasis = new HudEmphasis();
    emphasis.update(snapshot(0));
    emphasis.update(snapshot(2));
    const current = { weaponKey: 'primary:awp', location: 'B site', scopeKey: '4x', sessionKey: 'new-round' };
    expect(emphasis.update(snapshot(NaN, current))).toEqual(hidden);
    expect(emphasis.update(snapshot(10, current))).toEqual({ equipment: true, location: true, scope: true });
    expect(emphasis.update(snapshot(12, current))).toEqual(hidden);
  });

  it('keeps two HUD instances independent, including resets and rewinds', () => {
    const first = new HudEmphasis(), second = new HudEmphasis();
    first.update(snapshot(0));
    expect(first.update(snapshot(10))).toEqual(hidden);
    expect(second.update(snapshot(10)).equipment).toBe(true);
    first.reset();
    expect(first.update(snapshot(10)).equipment).toBe(true);
    expect(second.update(snapshot(12))).toEqual(hidden);
    expect(first.update(snapshot(0)).equipment).toBe(true);
    expect(second.update(snapshot(12))).toEqual(hidden);
  });

  it('neither mutates nor retains caller snapshots or returned flags', () => {
    const emphasis = new HudEmphasis();
    const input = snapshot(0);
    const result = emphasis.update(input);
    input.weaponKey = 'knife:karambit';
    result.equipment = false;
    expect(emphasis.update(Object.freeze(snapshot(1))).equipment).toBe(true);
    expect(emphasis.update(Object.freeze(snapshot(2)))).toEqual(hidden);
  });
});
