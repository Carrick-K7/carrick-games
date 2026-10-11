import * as T from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { createViewHand, poseButterflyKnifeGrip } from '../src/csViewHands.js';
import { butterflyShoulder, BUTTERFLY_UPPER_ARM_MAX } from '../src/csButterflyArm.js';
import { makeWeapon } from '../src/csWeapons.js';
import { applyWeaponAnimation, placeWeaponView, WEAPON_VIEW_FOV } from '../src/csWeaponMotion.js';

const cleanups: (() => void)[] = [];
afterEach(() => { for (const dispose of cleanups.splice(0)) dispose(); });
function hand() {
  const material = new T.MeshStandardMaterial(), rig = createViewHand(material, 'r');
  cleanups.push(() => { rig.mesh.geometry.dispose(); rig.skeleton.dispose(); material.dispose(); });
  return rig;
}
function point(rig: ReturnType<typeof createViewHand>, name: string) {
  const p = rig.bones[`${name}_r`].getWorldPosition(new T.Vector3());
  return rig.group.parent ? rig.group.parent.worldToLocal(p) : p;
}
function closeVector(actual: T.Vector3, expected: number[]) {
  expect(actual.distanceTo(new T.Vector3().fromArray(expected))).toBeLessThan(1e-10);
}
function disposeModel(model: T.Object3D) {
  const skeletons = new Set<T.Skeleton>(), ownedMaterials = new Set<T.Material>();
  model.traverse((object: any) => {
    if (object.geometry && !object.geometry.userData.sharedCharacter) object.geometry.dispose();
    if (object.skeleton) skeletons.add(object.skeleton);
    for (const material of [].concat(object.material || [])) {
      if (material.userData.ownedCsWeaponMaterial) ownedMaterials.add(material);
    }
  });
  for (const skeleton of skeletons) skeleton.dispose();
  for (const material of ownedMaterials) material.dispose();
}

describe('butterfly retained safe-handle grip', () => {
  it('preserves the previously authored closed idle fit', () => {
    const rig = hand(), contact = poseButterflyKnifeGrip(rig);
    closeVector(rig.group.position, [.040951180939649265, -.022160819152188288, .04482755800965724]);
    expect(rig.group.quaternion.angleTo(new T.Quaternion(-.6151788504754693, .005874844105727706, -.004584345785795826, .7883523653215798))).toBeLessThan(1e-7);
    closeVector(contact.wrist, [.03596575743505389, -.013014483215702815, .04010923294489301]);
    closeVector(contact.palm, [.03668405161835742, .00021928492527948339, .00008169622426743711]);
    closeVector(point(rig, 'index_03'), [-.005888765800259446, .03362919649916461, -.03589779745600579]);
    closeVector(point(rig, 'thumb_03'), [-.010647966851622066, .03229176391440947, -.025787957508196544]);
  });

  it('keeps the palm and retained index fixed while only the other fingers loosen', () => {
    const rig = hand(), initial = poseButterflyKnifeGrip(rig);
    const position = rig.group.position.clone(), rotation = rig.group.quaternion.clone();
    const names = ['index_01', 'index_02', 'index_03', 'index_04_leaf'];
    const index = names.map(name => point(rig, name));
    const lengths = rig.skeleton.bones.map(bone => bone.position.length());
    const thumb = point(rig, 'thumb_03'), thumbTip = point(rig, 'thumb_04_leaf');
    const fingers = ['middle_03', 'ring_03', 'pinky_03'].map(name => point(rig, name));
    for (let i = 0; i <= 40; i++) {
      const contact = poseButterflyKnifeGrip(rig, { knifeOpen: i / 40, knifeThumb: i / 40 });
      expect(rig.group.position.distanceTo(position)).toBeLessThan(1e-10);
      expect(rig.group.quaternion.angleTo(rotation)).toBeLessThan(1e-7);
      names.forEach((name, j) => expect(point(rig, name).distanceTo(index[j])).toBeLessThan(1e-10));
      expect(contact.wrist.distanceTo(initial.wrist)).toBeLessThan(1e-10);
      expect(contact.palm.distanceTo(initial.palm)).toBeLessThan(1e-10);
      expect(contact.forward.distanceTo(initial.forward)).toBeLessThan(1e-10);
      expect(point(rig, 'thumb_03').distanceTo(thumb)).toBeLessThan(.003);
      expect(point(rig, 'thumb_04_leaf').distanceTo(thumbTip)).toBeLessThan(.008);
      expect(rig.skeleton.bones.map(bone => bone.position.length())).toEqual(lengths);
    }
    ['middle_03', 'ring_03', 'pinky_03'].forEach((name, i) => {
      const distance = point(rig, name).distanceTo(fingers[i]);
      expect(distance).toBeGreaterThan(.015);
      expect(distance).toBeLessThan(.025);
    });
  });

  it('clamps release, resets deterministically and is independent of parent transforms', () => {
    const rig = hand(), other = hand(), parent = new T.Group();
    parent.position.set(4, -2, 1); parent.rotation.set(.7, -.9, .4); parent.scale.setScalar(1.3);
    parent.add(other.group); parent.updateMatrixWorld(true);
    const names = Object.keys(rig.bones);
    const snapshot = (h: ReturnType<typeof createViewHand>) => names.map(name => point(h, name.slice(0, -2)).toArray());
    poseButterflyKnifeGrip(rig, { knifeOpen: .35, knifeThumb: .15 });
    const maximum = snapshot(rig);
    poseButterflyKnifeGrip(rig, { knifeOpen: 20, knifeThumb: 20 });
    expect(snapshot(rig)).toEqual(maximum);
    for (const h of [rig, other]) poseButterflyKnifeGrip(h, { knifeOpen: .27, knifeThumb: .12 });
    names.forEach(name => expect(point(rig, name.slice(0, -2)).distanceTo(point(other, name.slice(0, -2)))).toBeLessThan(1e-9));
    const repeated = snapshot(rig);
    poseButterflyKnifeGrip(rig, { knifeOpen: .27, knifeThumb: .12 });
    expect(snapshot(rig)).toEqual(repeated);
    poseButterflyKnifeGrip(rig);
    const idle = snapshot(rig);
    for (const value of [-1, NaN, Infinity, -Infinity]) {
      poseButterflyKnifeGrip(rig, { knifeOpen: value, knifeThumb: value });
      expect(snapshot(rig)).toEqual(idle);
    }
    poseButterflyKnifeGrip(other, { knifeOpen: .35, knifeThumb: .15 });
    expect(snapshot(rig)).toEqual(idle);
  });
});

describe('butterfly virtual shoulder', () => {
  it('caps actual endpoints without moving the elbow, mutating inputs or changing direction', () => {
    const elbow = new T.Vector3(.3, -.2, .1), requested = new T.Vector3(.9, -.7, .4);
    const originalElbow = elbow.clone(), originalRequested = requested.clone();
    const result = butterflyShoulder(elbow, requested);
    expect(result.distanceTo(elbow)).toBeCloseTo(BUTTERFLY_UPPER_ARM_MAX, 12);
    expect(result.clone().sub(elbow).normalize().distanceTo(requested.clone().sub(elbow).normalize())).toBeLessThan(1e-12);
    expect(elbow).toEqual(originalElbow); expect(requested).toEqual(originalRequested);
    expect(result).not.toBe(requested);
    const near = elbow.clone().add(new T.Vector3(.1, -.1, .1));
    expect(butterflyShoulder(elbow, near).distanceTo(near)).toBeLessThan(1e-12);
    expect(butterflyShoulder(elbow, elbow)).toEqual(elbow);
    const direction = new T.Vector3(1, -1, .3).normalize();
    const below = butterflyShoulder(elbow, elbow.clone().addScaledVector(direction, BUTTERFLY_UPPER_ARM_MAX - 1e-6));
    const above = butterflyShoulder(elbow, elbow.clone().addScaledVector(direction, BUTTERFLY_UPPER_ARM_MAX + 1e-6));
    expect(below.distanceTo(above)).toBeCloseTo(1e-6, 12);
  });

  it('keeps the capped sleeve end below the viewport across every authored action and aspect', () => {
    const model = makeWeapon('knife', true, 'butterfly'), rig = model.userData.rig;
    cleanups.push(() => disposeModel(model));
    const aspects = [9 / 21, 9 / 16, 1, 4 / 3, 16 / 9, 21 / 9, 32 / 9];
    const cameras = aspects.map(aspect => new T.PerspectiveCamera(WEAPON_VIEW_FOV, aspect, .01, 4));
    const states: Record<string, number | boolean>[] = [{}];
    for (let i = 0; i <= 100; i++) {
      const t = i / 100;
      for (let variant = 0; variant < 2; variant++) states.push({ deployProgress: t, butterflyDrawVariant: variant });
      for (let variant = 0; variant < 3; variant++) states.push({ inspectProgress: t, butterflyInspectVariant: variant });
      states.push({ shotAge: t * .48 }, { shotAge: t * .85, knifeHeavy: true });
    }
    let capped = false;
    for (const state of states) {
      const motion = applyWeaponAnimation(model, state);
      placeWeaponView(model, motion); model.updateMatrixWorld(true);
      const direction = new T.Vector3(0, 1, 0).applyQuaternion(rig.knifeForearm.quaternion);
      const seam = rig.knifeElbow.clone().addScaledVector(direction, .012);
      const requested = new T.Vector3(.65 - motion.offset[0], -.50 - motion.offset[1], .12 - motion.offset[2])
        .applyQuaternion(new T.Quaternion().setFromEuler(new T.Euler(motion.rotation[0], motion.rotation[1], motion.rotation[2])).invert());
      const shoulder = butterflyShoulder(seam, requested);
      expect(shoulder.distanceTo(seam)).toBeLessThanOrEqual(BUTTERFLY_UPPER_ARM_MAX + 1e-12);
      capped ||= shoulder.distanceTo(requested) > .1;
      const end = model.localToWorld(shoulder.clone());
      // A radius-.062 sphere encloses the upper sleeve cap in any orientation.
      // Its highest, farthest corner being below frame proves the entire cap
      // stays outside vertically, independent of the horizontal aspect ratio.
      for (const camera of cameras) {
        const mostVisible = new T.Vector3(end.x, end.y + .062, end.z - .062).project(camera);
        expect(mostVisible.y, JSON.stringify(state)).toBeLessThan(-1);
      }
      expect(rig.knifeForearm.scale.y).toBeCloseTo(.43, 12);
      expect(rig.knifeWristBend).toBeLessThanOrEqual(.480000001);
    }
    expect(capped).toBe(true);
  });
});
