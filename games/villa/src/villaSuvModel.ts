import * as THREE from 'three';
import { CAR_DOOR_SECONDS } from './villaActivities.js';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import { PLAYER_RADIUS, setVillaColliderNarrowPhase, type VillaCollider } from './villaWorld.js';
import { villaTerrainOrientation } from './villaEstateLayout.js';
import { createVillaSuv, registerVillaSuvColliders, VILLA_SUV, VILLA_SUV_LIMITS, type VillaSuvState } from './villaSuv.js';

type Triple = [number, number, number];
const smooth = (t: number) => t * t * (3 - 2 * t);
/** A coupe-SUV with a sloped rear roofline, teardrop headlights and wide
 * haunches — an original design informed by full-size Porsche SUV proportions,
 * not a licensed model. Scene owns disposal; only pose, doors and wheel mutate. */
export function createVillaSuvModel(parent: THREE.Object3D): {
  colliders: VillaCollider[];
  update(time: number, state: { suv?: VillaSuvState; suvDoorOpen?: boolean }): boolean;
  readonly doorProgress: number;
} {
  const root = new THREE.Group(); root.name = 'villa-suv'; root.userData = { kind: 'vehicle', style: 'coupe-suv', forward: '+Z', driverSide: '+X', hollowCabin: true }; parent.add(root);
  const paint = new THREE.MeshPhysicalMaterial({ color: 0x24466b, metalness: .38, roughness: .3, clearcoat: .85, clearcoatRoughness: .18, side: THREE.DoubleSide });
  const dark = villaMaterial(0x1d2328, .58), rubber = villaMaterial(0x1a1e20, .93), metal = villaMaterial(0xb3bcc0, .3, .78);
  const fabric = villaMaterial(0x2c3134, .9), trim = villaMaterial(0x59636b, .72);
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x223a45, transparent: true, opacity: .34, depthWrite: false, roughness: .1, side: THREE.DoubleSide, clearcoat: 1 });
  const headlight = new THREE.MeshStandardMaterial({ color: 0xe8f4f8, emissive: 0xd7ecf4, emissiveIntensity: .5, roughness: .2 });
  const taillight = new THREE.MeshStandardMaterial({ color: 0x8f1620, emissive: 0xc21e28, emissiveIntensity: .5, roughness: .3 });
  paint.name = 'gentian-clearcoat'; glass.name = 'coupe-suv-glazing';
  const body = new VillaModelBuilder(root, 'suv-body'), cabin = new VillaModelBuilder(root, 'suv-cabin'), glazing = new VillaModelBuilder(root, 'suv-glazing');
  const quad = (builder: VillaModelBuilder, corners: Triple[], material: THREE.Material) => {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(corners.flat(), 3)); g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals(); builder.geometry(g, material);
  };
  // Chassis rails below the footwell; the cabin above them stays hollow.
  for (const x of [-.72, .72]) body.box(x, .4, 0, .14, .2, 4.6, dark, .018);
  // Big 5-spoke wheels with wide arches — the SUV stance.
  for (const side of [-1, 1]) for (const z of [-1.45, 1.45]) {
    body.geometry(new THREE.TorusGeometry(.37, .105, 12, 42), rubber, [side * .99, .42, z], [0, Math.PI / 2, 0]);
    body.cylinder(side * 1.1, .42, z, .27, .27, .045, dark, [0, 0, Math.PI / 2], 28);
    body.geometry(new THREE.TorusGeometry(.255, .015, 6, 32), metal, [side * 1.12, .42, z], [0, Math.PI / 2, 0]);
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5;
      body.beam([side * 1.13, .42, z], [side * 1.13, .42 + Math.cos(a) * .245, z + Math.sin(a) * .245], .026, metal, 6);
    }
    body.cylinder(side * 1.135, .42, z, .07, .07, .04, metal, [0, 0, Math.PI / 2], 14);
    body.geometry(new THREE.TorusGeometry(.49, .038, 8, 36, Math.PI), dark, [side * 1.06, .42, z], [0, Math.PI / 2, 0]);
    body.box(side * .96, 1.06, z, .18, .2, 1.16, paint, .05);
    for (const dz of [-.58, .58]) body.box(side * 1.01, .74, z + dz, .12, .6, .14, paint, .03);
  }
  // Lower body: a clean shoulder between the arches, then the hood's crown.
  body.box(0, .88, .05, 1.86, .42, 4.0, paint, .05);
  for (const side of [-1, 1]) body.box(side * .94, 1.02, 0, .09, .16, 3.4, trim, .03);
  quad(body, [[-.95, 1.06, .55], [-.82, 1.0, 2.34], [0, 1.06, 2.45], [0, 1.2, .5]], paint);
  quad(body, [[0, 1.2, .5], [0, 1.06, 2.45], [.82, 1.0, 2.34], [.95, 1.06, .55]], paint);
  // Front bumper: three intake openings and teardrop headlights raked back.
  body.box(0, .62, 2.42, 1.98, .34, .18, paint, .05);
  body.box(0, .56, 2.51, .62, .2, .04, dark, .03);
  for (const side of [-1, 1]) {
    body.box(side * .68, .58, 2.5, .5, .16, .045, dark, .03);
    for (let i = 0; i < 3; i++) body.box(side * .56 + i * .12, .575, 2.53, .05, .1, .02, metal, .004);
    quad(body, [[side * .6, .92, 2.35], [side * .94, .86, 2.18], [side * .9, 1.04, 1.62], [side * .56, 1.08, 1.75]], headlight);
    body.ellipsoid(side * .77, .97, 1.95, .13, .09, .06, headlight);
    body.box(side * .66, .62, 2.56, .09, .06, .02, headlight, .01);
  }
  // Raked windshield, then the coupe roofline falling away to the tail.
  quad(glazing, [[-.86, 1.1, .5], [.86, 1.1, .5], [.78, 1.56, -.05], [-.78, 1.56, -.05]], glass);
  quad(body, [[-.9, 1.58, -.02], [.9, 1.58, -.02], [.84, 1.4, -1.98], [-.84, 1.4, -1.98]], paint);
  for (const side of [-1, 1]) {
    // Side glass: a fast, shallow arc under the falling roof rail.
    quad(glazing, [[side * .9, 1.12, .42], [side * .9, 1.12, -1.72], [side * .84, 1.42, -1.72], [side * .83, 1.5, .1]], glass);
    body.beam([side * .92, 1.56, -.02], [side * .86, 1.4, -1.98], .022, paint);
    body.box(side * .88, 1.02, -.85, .05, .34, .06, trim, .02);
  }
  // Raked rear glass into the tail, and the full-width light bar.
  quad(glazing, [[-.8, 1.42, -1.96], [.8, 1.42, -1.96], [.86, 1.02, -2.36], [-.86, 1.02, -2.36]], glass);
  body.box(0, .9, -2.42, 1.88, .44, .12, paint, .05);
  body.box(0, 1.06, -2.47, 1.68, .075, .035, taillight, .012);
  for (const side of [-1, 1]) body.ellipsoid(side * .78, 1.06, -2.47, .1, .055, .02, taillight);
  body.box(0, .66, -2.46, 1.92, .2, .16, dark, .045);
  body.box(0, .6, -2.5, .8, .1, .06, dark, .02);
  body.box(0, .48, -2.45, 1.9, .16, .18, paint, .05);
  body.box(0, 1.58, -.02, 1.0, .03, .06, trim, .01);
  cabin.box(0, 1.3, -.3, 1.5, .05, 2.2, fabric, .02);
  cabin.box(.52, 1.02, .3, .3, .1, .9, fabric, .02);
  cabin.box(.52, 1.12, .05, .12, .1, .24, dark, .02);
  const wheel = new VillaModelBuilder(root, 'suv-steering-wheel');
  wheel.geometry(new THREE.TorusGeometry(.19, .02, 10, 36), fabric, [.52, 1.14, .45], [Math.PI / 2.3, 0, 0]);
  for (const x of [-.14, .14]) wheel.beam([.52 + x, 1.14, .45], [.52, 1.16, .45], .018, fabric);
  wheel.finish();
  const doors: { root: THREE.Group; bounds: THREE.Box3 }[] = [];
  for (const side of [1, -1]) {
    const pivot = new THREE.Group(); pivot.name = side === 1 ? 'suv-driver-door' : 'suv-passenger-door'; pivot.position.set(side * .99, 0, 1.05); pivot.userData = { animated: true, side, hinge: [side * .99, 0, 1.05] }; root.add(pivot);
    const door = new VillaModelBuilder(pivot, `suv-door-${side}`);
    door.at(-side * .99, 0, -1.05, 0, () => {
      door.box(side * .97, .88, -.1, .08, .62, 1.5, paint, .02);
      door.box(side * .92, 1.0, -.16, .04, .2, 1.3, trim, .014);
      door.box(side * .86, 1.0, -.2, .12, .06, .58, fabric, .018);
      quad(door, [[side * .95, 1.16, .38], [side * .95, 1.16, -1.0], [side * .86, 1.42, -1.0], [side * .87, 1.48, .1]], glass);
      door.beam([side * .95, 1.16, -1.0], [side * .86, 1.42, -1.0], .012, dark);
      door.beam([side * .86, 1.42, -1.0], [side * .87, 1.48, .1], .012, dark);
      door.box(side * .99, 1.06, .5, .022, .05, .2, dark, .012);
      door.beam([side * .95, 1.16, .55], [side * 1.09, 1.24, .62], .016, dark);
      door.box(side * 1.09, 1.27, .66, .11, .12, .13, paint, .032);
    });
    door.finish();
    doors.push({ root: pivot, bounds: new THREE.Box3(new THREE.Vector3(side === 1 ? -.15 : -.18, .5, -1.65), new THREE.Vector3(side === 1 ? .18 : .15, 1.52, .18)) });
  }
  for (const builder of [body, cabin, glazing]) builder.finish();
  const localBody = new THREE.Box3(new THREE.Vector3(-VILLA_SUV_LIMITS.halfWidth, 0, -VILLA_SUV_LIMITS.halfLength), new THREE.Vector3(VILLA_SUV_LIMITS.halfWidth, VILLA_SUV_LIMITS.height, VILLA_SUV_LIMITS.halfLength));
  const nodes = [{ root, bounds: localBody }, ...doors], world = new THREE.Box3(), query = new THREE.Vector3();
  const colliders: VillaCollider[] = nodes.map(() => ({ ...VILLA_SUV.body })), inverses = nodes.map(() => new THREE.Matrix4());
  registerVillaSuvColliders(colliders);
  for (let i = 0; i < nodes.length; i++) setVillaColliderNarrowPhase(colliders[i], (p, height) => {
    if (p.y + height <= colliders[i].minY || p.y >= colliders[i].maxY) return false;
    query.set(p.x, p.y, p.z).applyMatrix4(inverses[i]); const b = nodes[i].bounds;
    return Math.hypot(query.x - THREE.MathUtils.clamp(query.x, b.min.x, b.max.x), query.z - THREE.MathUtils.clamp(query.z, b.min.z, b.max.z)) < PLAYER_RADIUS;
  });
  const updateColliders = () => {
    root.updateWorldMatrix(true, true);
    for (let i = 0; i < nodes.length; i++) {
      inverses[i].copy(nodes[i].root.matrixWorld).invert(); world.copy(nodes[i].bounds).applyMatrix4(nodes[i].root.matrixWorld);
      Object.assign(colliders[i], { minX: world.min.x, maxX: world.max.x, minY: world.min.y, maxY: world.max.y, minZ: world.min.z, maxZ: world.max.z });
    }
  };
  const fallback = createVillaSuv(); let progress = 0, previousTime: number | undefined, previousPose = '';
  const update = (time: number, state: { suv?: VillaSuvState; suvDoorOpen?: boolean }): boolean => {
    if (!Number.isFinite(time)) return false;
    const candidate = state.suv ?? fallback, pose = [candidate.x, candidate.z, candidate.yaw].every(Number.isFinite) ? candidate : fallback;
    const terrain = villaTerrainOrientation(pose.x, pose.z, pose.yaw), wheelAngle = THREE.MathUtils.clamp(pose.steering || 0, -.55, .55) * 4.5;
    const signature = [pose.x, terrain.y, pose.z, pose.yaw, wheelAngle].join('/'), moved = signature !== previousPose; previousPose = signature;
    root.position.set(pose.x, terrain.y, pose.z); root.rotation.set(terrain.pitch, pose.yaw, terrain.roll, terrain.order); wheel.root.rotation.z = wheelAngle;
    const target = state.suvDoorOpen ? 1 : 0, before = progress;
    if (time === 0 || (previousTime !== undefined && time < previousTime)) progress = target;
    else if (previousTime !== undefined) {
      const delta = Math.max(0, time - previousTime) / CAR_DOOR_SECONDS;
      progress = target > progress ? Math.min(target, progress + delta) : Math.max(target, progress - delta);
      if (Math.abs(progress - target) < 1e-9) progress = target;
    }
    previousTime = time;
    if (!moved && before === progress) return false;
    for (const door of doors) door.root.rotation.y = door.root.userData.side === 1 ? -1.13 * smooth(progress) : 0;
    updateColliders(); return true;
  };
  update(0, {});
  return { colliders, update, get doorProgress() { return progress; } };
}
