import { describe, expect, it } from 'vitest';
import { advanceVillaTea, createVillaTea, interactVillaTea, VILLA_TEA, villaTeaCupPose } from '../../src/games/villaTea';

describe('pure persistent tea lifecycle', () => {
  it('starts empty, gradually brews, and stays full/ready until explicitly drunk', () => {
    const tea = createVillaTea(); expect(tea).toEqual({ phase: 'empty', elapsed: 0, fill: 0 });
    expect(interactVillaTea(tea)).toBe('brewing');
    advanceVillaTea(tea, 2.5); expect(tea.phase).toBe('brewing'); expect(tea.fill).toBe(0.25);
    const before = { ...tea }; expect(interactVillaTea(tea)).toBe('busy'); expect(tea).toEqual(before);
    advanceVillaTea(tea, 7.5); expect(tea).toEqual({ phase: 'ready', elapsed: 0, fill: 1 });
    expect(advanceVillaTea(tea, 1000)).toBe(false); expect(tea.fill).toBe(1);
  });
  it('lifts and tilts during drinking, depletes liquid, sets down empty, then allows a new brew', () => {
    const tea = createVillaTea(); interactVillaTea(tea); advanceVillaTea(tea, VILLA_TEA.brewSeconds);
    expect(interactVillaTea(tea)).toBe('drinking'); advanceVillaTea(tea, VILLA_TEA.drinkSeconds * 0.5);
    const pose = villaTeaCupPose(tea); expect(pose.lift).toBeGreaterThan(0.4); expect(pose.tilt).toBeGreaterThan(0.7);
    expect(pose.fill).toBeGreaterThan(0); expect(pose.fill).toBeLessThan(1);
    const before = { ...tea }; expect(interactVillaTea(tea)).toBe('busy'); expect(tea).toEqual(before);
    advanceVillaTea(tea, VILLA_TEA.drinkSeconds); expect(tea).toEqual(createVillaTea());
    expect(villaTeaCupPose(tea)).toEqual({ lift: 0, forward: 0, tilt: 0, fill: 0 });
    expect(interactVillaTea(tea)).toBe('brewing'); expect(tea.fill).toBe(0);
  });
  it('uses simulation dt independent of tick rate and ignores invalid or paused time', () => {
    const fast = createVillaTea(), slow = createVillaTea(); interactVillaTea(fast); interactVillaTea(slow);
    for (let i = 0; i < 150; i++) advanceVillaTea(fast, 1 / 60);
    for (let i = 0; i < 25; i++) advanceVillaTea(slow, 0.1);
    expect(fast.fill).toBeCloseTo(slow.fill, 12);
    const before = { ...fast };
    for (const dt of [0, -1, NaN, Infinity, -Infinity]) expect(advanceVillaTea(fast, dt)).toBe(false);
    expect(fast).toEqual(before); advanceVillaTea(fast, 1e10); expect(fast.phase).toBe('ready'); expect(fast.fill).toBe(1);
    expect(createVillaTea()).not.toBe(createVillaTea());
  });
});
