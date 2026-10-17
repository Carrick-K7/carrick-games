import { afterEach, describe, expect, it } from 'vitest';
import * as T from 'three';
import { makeWeapon } from '../src/csWeapons.js';
import { sampleWeaponMotion, applyWeaponAnimation, placeWeaponView } from '../src/csWeaponMotion.js';
import { GRENADE_RELEASE_TIME, GRENADE_RECOVER_TIME } from '../src/csGrenade.js';

const models: T.Object3D[] = [];
afterEach(() => {
  for (const model of models.splice(0)) model.traverse((o: any) => {
    o.geometry?.dispose(); o.skeleton?.dispose();
    for (const m of [].concat(o.material || []) as T.Material[]) if (m.userData.ownedCsWeaponMaterial) m.dispose();
  });
});
function fixture(placement: Record<string, number> = { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 }) {
  const model = makeWeapon('he', true); models.push(model);
  const rig = model.userData.rig;
  const pose = (state: Record<string, number> = {}) => {
    const motion = applyWeaponAnimation(model, state);
    placeWeaponView(model, motion, placement);
    model.updateMatrixWorld(true);
    return motion;
  };
  return { model, rig, pose };
}
const point = (node: T.Object3D) => node.getWorldPosition(new T.Vector3());

describe('CS grenade hand presentation', () => {
  it('joins idle, finished draw, pin start, held grenade and throw start without a pose jump', () => {
    const idle = sampleWeaponMotion('he');
    for (const state of [{ deployProgress: 1 }, { grenadeProgress: 0 }]) {
      const motion = sampleWeaponMotion('he', state);
      expect(motion.offset).toEqual(idle.offset); expect(motion.rotation).toEqual(idle.rotation);
    }
    const { rig, pose } = fixture();
    const held = pose({ grenadeProgress: 1 });
    const left = point(rig.left.hand), right = point(rig.right.hand);
    const throwing = pose({ grenadeProgress: 1, grenadeThrowProgress: 0 });
    expect(throwing.offset).toEqual(held.offset); expect(throwing.rotation).toEqual(held.rotation);
    expect(point(rig.left.hand).distanceTo(left)).toBeLessThan(1e-8);
    expect(point(rig.right.hand).distanceTo(right)).toBeLessThan(1e-8);
  });

  it('hooks the left index segment through the physical pin ring throughout the pull', () => {
    const { model, rig, pose } = fixture();
    for (const t of [.28, .4, .55, .65]) {
      pose({ grenadeProgress: t });
      const hook = point(rig.left.skin.bones.index_02_l).lerp(point(rig.left.skin.bones.index_03_l), .65);
      const ring = rig.pin.localToWorld(new T.Vector3(-.028, .05, 0));
      expect(hook.distanceTo(ring), `pin progress ${t}`).toBeLessThan(1e-7);
      expect(rig.pin.visible).toBe(true);
      expect(model.matrixWorld.elements.every(Number.isFinite)).toBe(true);
    }
  });

  it.each([0, .5, 1])('strength %s keeps the off-hand by the body and follows through forward, not upright', strength => {
    const { rig, pose } = fixture();
    pose({ grenadeProgress: 1, grenadeThrowProgress: 0, grenadeStrength: strength });
    const left = point(rig.left.hand);
    for (const t of [.16, .39, .48, .7, 1]) {
      pose({ grenadeProgress: 1, grenadeThrowProgress: t, grenadeStrength: strength });
      expect(point(rig.left.hand).distanceTo(left)).toBeLessThan(1e-7);
    }
    pose({ grenadeProgress: 1, grenadeThrowProgress: .48, grenadeStrength: strength });
    const fingers = new T.Vector3(0, 1, 0).applyQuaternion(rig.right.hand.getWorldQuaternion(new T.Quaternion()));
    expect(fingers.y).toBeLessThan(.4); expect(fingers.z).toBeLessThan(-.65);
    const out = point(rig.right.hand);
    pose({ grenadeProgress: 1, grenadeThrowProgress: 1, grenadeStrength: strength });
    expect(point(rig.right.hand).y).toBeLessThan(out.y - .2);
  });

  it.each([{}, { pitch: .08, yaw: -.12, roll: .05 }])('stabilizes the full offhand frame with real base placement %j', placement => {
    const { rig, pose } = fixture(placement);
    pose({ grenadeProgress: 1, grenadeThrowProgress: 0 });
    const left = point(rig.left.hand), rotation = rig.left.hand.getWorldQuaternion(new T.Quaternion());
    for (const t of [.16, .39, .48, .7, 1]) {
      pose({ grenadeProgress: 1, grenadeThrowProgress: t });
      expect(point(rig.left.hand).distanceTo(left)).toBeLessThan(1e-7);
      expect(rig.left.hand.getWorldQuaternion(new T.Quaternion()).angleTo(rotation)).toBeLessThan(1e-7);
    }
  });

  it('keeps release visibility synchronized with the unchanged physical release time', () => {
    const { rig, pose } = fixture(), release = GRENADE_RELEASE_TIME / GRENADE_RECOVER_TIME;
    for (const strength of [0, .5, 1]) for (const t of [release - 1e-6, release, release + 1e-6]) {
      const state = { grenadeProgress: 1, grenadeThrowProgress: t, grenadeStrength: strength };
      const motion = pose(state);
      expect(rig.fixed.visible).toBe(t < release);
      expect(motion.grenadeReleased).toBe(t >= release);
      expect(motion.grenadeHandOpen).toBeLessThan(1);
    }
    expect(GRENADE_RELEASE_TIME).toBe(.22); expect(GRENADE_RECOVER_TIME).toBe(.56);
  });

  it('is deterministic across frozen redraws, interrupted pulls and arbitrary sample order without stretching fingers', () => {
    const { model, rig, pose } = fixture();
    pose();
    const bones = [rig.left.skin, rig.right.skin].flatMap(h => h.skeleton.bones);
    const lengths = bones.map((b: T.Bone) => b.position.toArray());
    const snapshot = () => { model.updateMatrixWorld(true); const values: number[][] = []; model.traverse(o => values.push(o.matrixWorld.toArray())); return values; };
    const idle = snapshot();
    // World/local quaternion round-trips may differ below 1e-9; require
    // sub-micron pose agreement rather than bit-identical floating point.
    const samePose = (a: number[][], b: number[][]) => expect(Math.max(...a.flat().map((n, i) => Math.abs(n - b.flat()[i])))).toBeLessThan(1e-7);
    for (let i = 0; i <= 60; i++) {
      const state = { grenadeProgress: i / 60, grenadeThrowProgress: i % 2 ? i / 60 : -1, grenadeStrength: (i % 3) / 2 };
      pose(state); const first = snapshot(); pose(state); samePose(snapshot(), first);
      expect(sampleWeaponMotion('he', state)).toEqual(sampleWeaponMotion('he', state));
      expect(first.flat().every(Number.isFinite)).toBe(true);
      expect(rig.left.wristBend).toBeLessThanOrEqual(.620001); expect(rig.right.wristBend).toBeLessThanOrEqual(.620001);
      expect(bones.map((b: T.Bone) => b.position.toArray())).toEqual(lengths);
    }
    pose(); samePose(snapshot(), idle); expect(rig.pin.visible && rig.fixed.visible).toBe(true);
  });
});
