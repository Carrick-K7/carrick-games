import { afterEach, describe, expect, it } from 'vitest';
import * as T from 'three';
import { makeWeapon } from '../src/csWeapons.js';
import { freeGeometry } from '../src/csEngine.js';
import { applyWeaponAnimation, placeWeaponView, sampleWeaponMotion } from '../src/csWeaponMotion.js';
import { resolveButterflyPresentation } from '../src/csButterflyPresentation.js';

const models: T.Object3D[] = [];
afterEach(() => models.splice(0).forEach(freeGeometry));
function model() { const m = makeWeapon('knife', true, 'butterfly'); models.push(m); return m; }
function at(m: any, time: number | undefined, state: any = {}) {
  const pose = applyWeaponAnimation(m, { ...state, animationTime: time }); placeWeaponView(m, pose); m.updateMatrixWorld(true);
  const rig = m.userData.rig;
  return { pose, tip: rig.butterflyBlade.localToWorld(rig.knifeTip.clone()),
    wrist: rig.core.localToWorld(rig.knifeWrist.clone().applyQuaternion(rig.knifeFrame.quaternion)) };
}
const raw = (s: any = {}) => sampleWeaponMotion('knife', { knifeModel: 'butterfly', ...s });

describe('butterfly presentation continuity only', () => {
  it('preserves direct sampling without a clock and explicit reset', () => {
    const m = model();
    expect(at(m, undefined, { inspectProgress: .5 }).pose).toEqual(raw({ inspectProgress: .5 }));
    at(m, 10, { inspectProgress: .5 }); at(m, 10, { shotAge: 0 });
    expect(at(m, undefined).pose).toEqual(raw());
    expect(m.userData.rig.butterflyPresentation).toBeUndefined();
  });
  it.each([false, true])('retains the displayed pose through fire pre-sync then attack at the same clock, heavy=%s', knifeHeavy => {
    const m = model(), before = at(m, 10, { inspectProgress: .5, butterflyInspectVariant: 2 });
    const cleared = at(m, 10), shot = at(m, 10, { shotAge: 0, knifeHeavy });
    expect(cleared.pose).toEqual(before.pose); expect(shot.pose).toEqual(before.pose);
    expect(shot.tip.distanceTo(before.tip)).toBeLessThan(1e-12);
    expect(shot.wrist.distanceTo(before.wrist)).toBeLessThan(1e-12);
    const tiny = at(m, 10 + 1 / 144, { shotAge: 1 / 144, knifeHeavy });
    expect(tiny.tip.distanceTo(shot.tip)).toBeLessThan(.025);
    const caught = at(m, 10.09, { shotAge: .09, knifeHeavy });
    expect(caught.pose).toEqual(raw({ shotAge: .09, knifeHeavy }));
  });
  it('handles repeated inspect and late inspect entry without an instantaneous jump', () => {
    const m = model(), old = at(m, 8, { inspectProgress: .5 });
    expect(at(m, 8, { inspectProgress: 0, butterflyInspectVariant: 1 }).pose).toEqual(old.pose);
    expect(at(m, 8.13, { inspectProgress: .13 / 3.4, butterflyInspectVariant: 1 }).pose)
      .toEqual(raw({ inspectProgress: .13 / 3.4, butterflyInspectVariant: 1 }));
    const next = model(); at(next, 10, { shotAge: .47 });
    const recovered = at(next, 10.01, { shotAge: .48, inspectProgress: .48 / 3.4 });
    const late = at(next, 10.04, { shotAge: .51, inspectProgress: .51 / 3.4 });
    expect(late.pose).toEqual(recovered.pose);
    expect(at(next, 10.17, { shotAge: .64, inspectProgress: .64 / 3.4 }).pose)
      .toEqual(raw({ shotAge: .64, inspectProgress: .64 / 3.4 }));
  });
  it('freezes repeated paused draws, resets time rewinds/gaps and isolates rigs', () => {
    const a = model(), b = model(); at(a, 10, { inspectProgress: .6 });
    const moving = at(a, 10, { shotAge: 0 }).pose;
    for (let i = 0; i < 100; i++) expect(at(a, 10, { shotAge: 0 }).pose).toEqual(moving);
    expect(at(b, 10, { shotAge: 0 }).pose).toEqual(raw({ shotAge: 0 }));
    expect(at(a, 0, { inspectProgress: .3 }).pose).toEqual(raw({ inspectProgress: .3 }));
    expect(at(a, 5).pose).toEqual(raw());
  });
  it('chooses angle winding once, without mutating inputs or adding a half-turn flip', () => {
    const r: any = {}, from = raw(), target = raw(); from.butterflyHandle = Math.PI - .1;
    target.butterflyHandle = -Math.PI + .1;
    resolveButterflyPresentation(r, from, { animationTime: 2, inspectProgress: .5 });
    const saved = structuredClone(target);
    const begin = resolveButterflyPresentation(r, target, { animationTime: 2, shotAge: 0 });
    expect(begin.butterflyHandle).toBe(from.butterflyHandle);
    let previous = begin.butterflyHandle;
    for (let i = 1; i <= 7; i++) {
      const p = { ...target, butterflyHandle: -Math.PI + .1 + i * .02 };
      const display = resolveButterflyPresentation(r, p, { animationTime: 2 + i * .01, shotAge: i * .01 });
      expect(display.butterflyHandle).toBeGreaterThanOrEqual(previous);
      expect(display.butterflyHandle - previous).toBeLessThan(.1); previous = display.butterflyHandle;
    }
    expect(target).toEqual(saved);
  });
  it.each([30, 60, 144])('keeps interrupted frames finite and catches the raw strike by .1s at %iHz', hz => {
    const m = model(); at(m, 10, { inspectProgress: .5, butterflyInspectVariant: 2 });
    let previous = at(m, 10, { shotAge: 0 });
    for (let i = 1; i <= hz; i++) {
      const age = i / hz, next = at(m, 10 + age, { shotAge: age });
      expect([...next.tip.toArray(), ...next.wrist.toArray()].every(Number.isFinite)).toBe(true);
      expect(next.tip.distanceTo(previous.tip)).toBeLessThan(12 / hz);
      if (age >= .1 && age < .48) expect(next.pose).toEqual(raw({ shotAge: age }));
      previous = next;
    }
  });
  it.each(['classic', 'karambit'])('does not create presentation history or modify %s', knifeModel => {
    const m = makeWeapon('knife', true, knifeModel); models.push(m);
    const s = { animationTime: 10, inspectProgress: .5 };
    expect(applyWeaponAnimation(m, s)).toEqual(sampleWeaponMotion('knife', { ...s, knifeModel }));
    expect(m.userData.rig.butterflyPresentation).toBeUndefined();
  });
});
