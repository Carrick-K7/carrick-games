import * as THREE from 'three';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import { PLAYER_RADIUS, setVillaColliderNarrowPhase, type VillaCollider } from './villaWorld.js';
import { createVillaScooter, registerVillaScooterColliders, villaScooterAnchors, VILLA_SCOOTER_LIMITS, type VillaScooterState } from './villaScooter.js';

/** Scene-owned procedural electric step-through. All animation is a pure view of
 * state (distance drives tyres), so resetting or changing sessions leaves no drift.
 * Returned plain collider references are stable and mutated in place on update.
 */
export function createVillaScooterModel(parent: THREE.Object3D): {
  colliders: VillaCollider[];
  update(time: number, state: { scooter?: VillaScooterState; seated?: string | null }): boolean;
} {
  const root = new THREE.Group(); root.name = 'rideableElectricScooter'; parent.add(root);
  const lean = new THREE.Group(); lean.name = 'scooterLean'; root.add(lean);
  const body = new VillaModelBuilder(lean, 'scooterBody');
  const sage = villaMaterial('#8ca99b', .35, .35), trim = villaMaterial('#dce1d7', .4, .3);
  const rubber = villaMaterial('#242a2a', .9), steel = villaMaterial('#87928f', .3, .75);
  const dark = villaMaterial('#303b3b', .48, .35);
  const lens = new THREE.MeshStandardMaterial({ color: '#fff3ce', emissive: '#fff0c5', emissiveIntensity: .8, roughness: .2 });
  const rearLens = new THREE.MeshStandardMaterial({ color: '#e56250', emissive: '#db3b28', emissiveIntensity: .35, roughness: .2 });
  const mirror = villaMaterial('#a8c2c6', .12, .85);
  // Low battery tray, generous open step-through and ribbed floor mat.
  body.box(0, .285, -.005, .39, .135, .85, sage, .035);
  body.box(0, .215, -.005, .33, .035, .76, dark, .009);
  body.box(0, .36, .04, .345, .02, .63, rubber, .008);
  for (let i = 0; i < 8; i++) body.box(0, .373, -.22 + i * .074, .30, .009, .018, dark, .002);
  for (const side of [-1, 1]) {
    body.beam([side * .14, .3, -.4], [side * .13, .62, -.51], .026, steel);
    body.beam([side * .14, .3, .29], [side * .105, .81, .5], .026, steel);
  }
  // Rear motor/battery cowl and a single padded bench: visibly not a bicycle.
  body.ellipsoid(0, .52, -.51, .235, .21, .34, sage);
  body.box(0, .715, -.43, .41, .095, .59, rubber, .04);
  body.box(0, .758, -.43, .36, .022, .50, dark, .009);
  body.box(0, .645, -.77, .27, .055, .045, rearLens, .011);
  body.box(0, .493, -.855, .21, .065, .025, trim, .006);
  body.beam([-.2, .73, -.69], [-.2, .79, -.84], .014, steel);
  body.beam([.2, .73, -.69], [.2, .79, -.84], .014, steel);
  body.beam([-.2, .79, -.84], [.2, .79, -.84], .014, steel);
  // Curved shin shield rises only in front, preserving the open footwell.
  body.ellipsoid(0, .615, .43, .235, .33, .105, sage);
  body.ellipsoid(0, .635, .348, .17, .245, .027, dark);
  body.box(0, .52, .315, .09, .045, .016, trim, .006); // bag hook / access panel
  body.box(.215, .49, -.43, .012, .062, .08, dark, .005); // charging flap
  body.beam([-.085, .285, -.29], [-.085, .235, -.65], .035, steel);
  body.beam([.085, .285, -.29], [.085, .235, -.65], .035, steel);
  for (const side of [-1, 1]) body.beam([side * .15, .57, -.52], [side * .09, .235, -.65], .018, dark);
  // Small rear wheel mudguard, open underneath rather than a solid covering.
  body.geometry(new THREE.TorusGeometry(.275, .024, 6, 24, Math.PI), sage, [0, .235, -.65], [0, Math.PI / 2, 0]);
  body.finish();
  const tyre = (parentNode: THREE.Object3D, name: string) => {
    const w = new VillaModelBuilder(parentNode, name), radius = VILLA_SCOOTER_LIMITS.wheelRadius;
    w.geometry(new THREE.TorusGeometry(radius - .044, .044, 10, 40), rubber, [0, 0, 0], [0, Math.PI / 2, 0]);
    w.cylinder(0, 0, 0, .135, .135, .08, dark, [0, 0, Math.PI / 2], 28);
    for (const side of [-1, 1]) {
      w.geometry(new THREE.TorusGeometry(.137, .009, 6, 28), steel, [side * .045, 0, 0], [0, Math.PI / 2, 0]);
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        w.beam([side * .047, 0, 0], [side * .047, Math.sin(a) * .13, Math.cos(a) * .13], .008, steel, 6);
      }
    }
    w.cylinder(0, 0, 0, .044, .044, .12, steel, [0, 0, Math.PI / 2], 16);
    w.finish(); return w.root;
  };
  const rear = tyre(lean, 'scooterRearWheel'); rear.position.set(0, .235, -.65);
  const front = new THREE.Group(); front.name = 'scooterSteeringFork'; front.position.set(0, .235, .65); lean.add(front);
  const fork = new VillaModelBuilder(front, 'scooterHandlebars');
  for (const side of [-1, 1]) {
    fork.beam([side * .077, 0, 0], [side * .077, .39, -.105], .022, steel);
    fork.beam([side * .077, .19, -.052], [side * .077, .47, -.12], .025, dark);
  }
  fork.beam([0, .38, -.105], [0, .83, -.2], .032, steel);
  fork.geometry(new THREE.TorusGeometry(.276, .026, 6, 24, Math.PI), sage, [0, 0, 0], [0, Math.PI / 2, 0]);
  fork.box(0, .835, -.20, .37, .13, .19, sage, .03);
  fork.ellipsoid(0, .84, -.093, .13, .052, .022, lens); // front lamp, facing +Z
  fork.box(0, .906, -.205, .14, .008, .077, dark, .009);
  fork.box(0, .912, -.205, .112, .004, .05, mirror, .004); // instrument glass
  fork.beam([-.31, .846, -.225], [.31, .846, -.225], .015, steel);
  for (const side of [-1, 1]) {
    fork.cylinder(side * .313, .846, -.225, .022, .022, .12, rubber, [0, 0, Math.PI / 2], 16);
    fork.box(side * .234, .848, -.233, .035, .044, .054, dark, .007);
    fork.beam([side * .225, .837, -.266], [side * .351, .829, -.278], .006, steel, 8); // service brake levers
    // Sink the stalk into the lever housing; no floating gap above the grip.
    fork.beam([side * .234, .862, -.222], [side * .365, 1.04, -.13], .006, steel, 8);
    fork.ellipsoid(side * .367, 1.047, -.13, .065, .043, .019, dark);
    fork.ellipsoid(side * .367, 1.047, -.149, .055, .034, .004, mirror);
  }
  fork.finish();
  const frontWheel = tyre(front, 'scooterFrontWheel');
  const standBuilder = new VillaModelBuilder(lean, 'scooterFoldingStand');
  standBuilder.root.position.set(.14, .345, -.38);
  standBuilder.beam([0, 0, 0], [.15, -.305, -.035], .012, steel);
  standBuilder.box(.15, -.31, -.035, .095, .016, .07, dark, .003); standBuilder.finish();
  const stand = standBuilder.root;
  root.userData = { rideable: true, electric: true, stepThrough: true, wheels: 2, front: '+Z', dynamicTransforms: ['scooterFrontWheel', 'scooterRearWheel', 'scooterSteeringFork', 'scooterFoldingStand', 'scooterLean'] };
  const fallback = createVillaScooter();
  const collider: VillaCollider = { ...villaScooterAnchors(fallback).body }, colliders = [collider];
  registerVillaScooterColliders(colliders);
  let pose = { x: fallback.x, z: fallback.z, yaw: fallback.yaw }, previous = '';
  // Pedestrians use a tighter rounded OBB, not the broadphase's rotated AABB.
  setVillaColliderNarrowPhase(collider, (p, height) => {
    if (p.y >= collider.maxY || p.y + height <= collider.minY) return false;
    const dx = p.x - pose.x, dz = p.z - pose.z, c = Math.cos(pose.yaw), s = Math.sin(pose.yaw);
    const x = dx * c - dz * s, z = dx * s + dz * c;
    return Math.hypot(Math.max(0, Math.abs(x) - VILLA_SCOOTER_LIMITS.halfWidth), Math.max(0, Math.abs(z) - VILLA_SCOOTER_LIMITS.halfLength)) < PLAYER_RADIUS;
  });
  const update = (_time: number, state: { scooter?: VillaScooterState; seated?: string | null }): boolean => {
    const candidate = state.scooter ?? fallback;
    const scooter = [candidate.x, candidate.z, candidate.yaw].every(Number.isFinite) ? candidate : fallback;
    const speed = Number.isFinite(scooter.speed) ? Math.max(0, Math.min(VILLA_SCOOTER_LIMITS.maxSpeed, scooter.speed)) : 0;
    const steering = Number.isFinite(scooter.steering) ? Math.max(-.5, Math.min(.5, scooter.steering)) : 0;
    const distance = Number.isFinite(scooter.distance) ? scooter.distance : 0;
    const mounted = state.seated === 'scooter';
    const signature = [scooter.x, scooter.z, scooter.yaw, speed, steering, distance, mounted, scooter.handbrake].join('/');
    if (signature === previous) return false;
    previous = signature; pose = { x: scooter.x, z: scooter.z, yaw: scooter.yaw };
    root.position.set(pose.x, 0, pose.z); root.rotation.y = pose.yaw;
    lean.rotation.z = mounted ? Math.max(-.1, Math.min(.1, steering * speed * .032)) : 0;
    front.rotation.y = steering === 0 ? 0 : -steering;
    frontWheel.rotation.x = rear.rotation.x = (distance / VILLA_SCOOTER_LIMITS.wheelRadius) % (Math.PI * 2);
    stand.rotation.x = mounted ? -1.4 : 0;
    rearLens.emissiveIntensity = scooter.handbrake ? 1.4 : .35;
    Object.assign(collider, villaScooterAnchors(pose).body);
    return true;
  };
  update(0, {});
  return { colliders, update };
}
