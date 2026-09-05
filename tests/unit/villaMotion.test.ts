import { describe, expect, it } from 'vitest';
import {
  advanceVillaMotion, createVillaMotion, jumpVillaMotion, toggleVillaCrouch,
  villaBodyHeight, villaEyeHeight,
} from '../../src/games/villaMotion';
import { moveVillaPlayer, villaCollides, villaSupportAt, VILLA_RAILS, VILLA_WALL_COLLIDERS } from '../../src/games/villaWorld';

const clear = () => true;

describe('Villa jumping and gravity', () => {
  it('starts grounded with independent reset states and standing eye/body heights', () => {
    const s = createVillaMotion();
    expect(s).toEqual({ offset: 0, velocity: 0, crouched: false, stance: 0 });
    expect(villaBodyHeight(s)).toBe(1.75); expect(villaEyeHeight(s)).toBe(1.65);
    jumpVillaMotion(s);
    expect(createVillaMotion()).toEqual({ offset: 0, velocity: 0, crouched: false, stance: 0 });
  });
  it.each([1 / 120, 1 / 60, .05])('follows a gravity arc and lands exactly without bounce at dt=%s', dt => {
    const s = createVillaMotion(); expect(jumpVillaMotion(s)).toBe(true);
    let maximum = 0, falling = false, elapsed = 0;
    for (let i = 0; i < 200 && (s.velocity !== 0 || s.offset !== 0); i++) {
      advanceVillaMotion(s, dt, clear); elapsed += dt;
      maximum = Math.max(maximum, s.offset); falling ||= s.velocity < 0;
      expect(s.offset).toBeGreaterThanOrEqual(0);
      if (s.offset > 0) expect(s.offset).toBeCloseTo(4.35 * elapsed - 4.9 * elapsed * elapsed, 8);
    }
    expect(maximum).toBeGreaterThan(.95); expect(maximum).toBeLessThan(.966);
    expect(falling).toBe(true); expect(elapsed).toBeGreaterThan(.88); expect(elapsed).toBeLessThan(.95);
    expect(s.offset).toBe(0); expect(s.velocity).toBe(0);
    const landed = { ...s }; advanceVillaMotion(s, dt, clear); expect(s).toEqual(landed);
    expect(jumpVillaMotion(s)).toBe(true);
  });
  it('refuses another impulse at takeoff, while rising and while falling', () => {
    const s = createVillaMotion(); jumpVillaMotion(s);
    expect(jumpVillaMotion(s)).toBe(false);
    advanceVillaMotion(s, .05, clear);
    const rising = { ...s }; expect(jumpVillaMotion(s)).toBe(false); expect(s).toEqual(rising);
    for (let i = 0; i < 9; i++) advanceVillaMotion(s, .05, clear);
    expect(s.velocity).toBeLessThan(0);
    const falling = { ...s }; expect(jumpVillaMotion(s)).toBe(false); expect(s).toEqual(falling);
  });
  it.each([NaN, Infinity, -Infinity, 0, -.1])('ignores unsafe dt=%s including stance changes', dt => {
    const s = createVillaMotion(); jumpVillaMotion(s); toggleVillaCrouch(s, clear);
    const before = { ...s }; advanceVillaMotion(s, dt, () => false); expect(s).toEqual(before);
  });
  it('caps large dt at .05 seconds', () => {
    const s = createVillaMotion(); jumpVillaMotion(s); const capped = { ...s };
    advanceVillaMotion(s, 100, clear); advanceVillaMotion(capped, .05, clear); expect(s).toEqual(capped);
  });
  it('sweeps the head to a low ceiling then falls rather than clipping or hovering', () => {
    const s = createVillaMotion(); jumpVillaMotion(s);
    const canFit = (height: number) => height <= 1.95;
    advanceVillaMotion(s, .05, canFit);
    expect(s.offset).toBeGreaterThan(.1999); expect(s.offset).toBeLessThanOrEqual(.2);
    expect(villaBodyHeight(s) + s.offset).toBeLessThanOrEqual(1.95);
    expect(s.velocity).toBe(0); expect(jumpVillaMotion(s)).toBe(false);
    const peak = s.offset; advanceVillaMotion(s, .05, canFit); expect(s.offset).toBeLessThan(peak);
    for (let i = 0; i < 20; i++) advanceVillaMotion(s, .05, canFit);
    expect(s.offset).toBe(0); expect(s.velocity).toBe(0);
  });
  it('cannot jump through an immediately adjacent ceiling', () => {
    const s = createVillaMotion(); jumpVillaMotion(s);
    advanceVillaMotion(s, .05, height => height <= 1.75);
    expect(s.offset).toBe(0); expect(s.velocity).toBe(0);
  });
});

describe('Villa crouching and full-body clearance', () => {
  it('smoothly lowers the stance and eye then returns to full standing height', () => {
    const s = createVillaMotion(); expect(toggleVillaCrouch(s, () => false)).toBe(true);
    advanceVillaMotion(s, 1 / 60, clear);
    expect(s.stance).toBeGreaterThan(0); expect(s.stance).toBeLessThan(1);
    for (let i = 0; i < 60; i++) advanceVillaMotion(s, 1 / 60, clear);
    expect(s.stance).toBe(1); expect(villaBodyHeight(s)).toBeCloseTo(1.05); expect(villaEyeHeight(s)).toBeCloseTo(.9);
    expect(toggleVillaCrouch(s, clear)).toBe(true);
    for (let i = 0; i < 60; i++) advanceVillaMotion(s, 1 / 60, clear);
    expect(s.stance).toBe(0); expect(villaBodyHeight(s)).toBe(1.75);
  });
  it('includes airborne offset when deciding whether standing is possible', () => {
    const s = { ...createVillaMotion(), crouched: true, stance: 1, offset: .3 };
    let checked = 0;
    expect(toggleVillaCrouch(s, height => { checked = height; return height <= 2; })).toBe(false);
    expect(checked).toBeCloseTo(2.05); expect(s.crouched).toBe(true);
    s.offset = 0; expect(toggleVillaCrouch(s, height => height <= 2)).toBe(true);
  });
  it('rechecks head clearance during uncrouching if the environment changes', () => {
    const s = { ...createVillaMotion(), crouched: true, stance: 1 };
    expect(toggleVillaCrouch(s, clear)).toBe(true);
    advanceVillaMotion(s, .05, () => false); expect(s.stance).toBe(1);
    advanceVillaMotion(s, .05, clear); expect(s.stance).toBeLessThan(1);
  });
  it('walks under the real low stair landing crouched, refuses standing there, and stands after leaving', () => {
    const s = createVillaMotion(); toggleVillaCrouch(s, clear);
    for (let i = 0; i < 20; i++) advanceVillaMotion(s, .05, clear);
    const colliders = [...VILLA_WALL_COLLIDERS, ...VILLA_RAILS];
    let p = { x: 5.2, y: 0, z: -4 };
    const support = (x: number, z: number, y: number) => villaSupportAt(x, z, y, villaBodyHeight(s));
    for (let i = 0; i < 44; i++) p = moveVillaPlayer(p, 0, -.05, colliders, support, villaBodyHeight(s));
    expect(p.z).toBeCloseTo(-6.2); expect(p.y).toBe(0);
    const canFit = (height: number) => villaSupportAt(p.x, p.z, p.y, height) !== null && !villaCollides(p, colliders, height);
    expect(canFit(villaBodyHeight(s))).toBe(true); expect(canFit(1.75)).toBe(false);
    expect(toggleVillaCrouch(s, canFit)).toBe(false); expect(s.crouched).toBe(true);
    for (let i = 0; i < 44; i++) p = moveVillaPlayer(p, 0, .05, colliders, support, villaBodyHeight(s));
    expect(p.z).toBeCloseTo(-4); expect(toggleVillaCrouch(s, canFit)).toBe(true);
    for (let i = 0; i < 20; i++) advanceVillaMotion(s, .05, canFit);
    expect(s.stance).toBe(0);
  });
});
