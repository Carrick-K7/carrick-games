import * as THREE from 'three';
import { CAR_DOOR_SECONDS } from './villaActivities.js';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import { PLAYER_RADIUS, setVillaColliderNarrowPhase, type VillaCollider } from './villaWorld.js';
import { villaTerrainOrientation } from './villaEstateLayout.js';
import { createVillaPickup, registerVillaPickupColliders, VILLA_PICKUP, VILLA_PICKUP_LIMITS, type VillaPickupState } from './villaPickup.js';

type Triple = [number, number, number];
const smooth = (t: number) => t * t * (3 - 2 * t);
/** Hollow utility pickup with an open ribbed bed, real cabin and automatic doors.
 * Scene owns disposal; all fixed detail is batched, only pose/doors/wheel mutate. */
export function createVillaPickupModel(parent: THREE.Object3D): {
  colliders: VillaCollider[];
  update(time: number, state: { pickup?: VillaPickupState; pickupDoorOpen?: boolean }): boolean;
  readonly doorProgress: number;
} {
  const root = new THREE.Group(); root.name = 'villa-pickup'; root.userData = { kind: 'vehicle', style: 'utility-pickup', forward: '+Z', driverSide: '+X', hollowCabin: true, openCargoBed: true }; parent.add(root);
  const paint = new THREE.MeshPhysicalMaterial({ color: 0x68877c, metalness: .28, roughness: .34, clearcoat: .7, side: THREE.DoubleSide });
  const dark = villaMaterial(0x242c2d, .64), rubber = villaMaterial(0x1f2425, .94), metal = villaMaterial(0xa1aaa8, .32, .73);
  const fabric = villaMaterial(0xa79c86, .92), trim = villaMaterial(0x5f6b65, .79);
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xa2c0c1, transparent: true, opacity: .28, depthWrite: false, roughness: .13, side: THREE.DoubleSide });
  const headlight = new THREE.MeshStandardMaterial({ color: 0xddeac8, emissive: 0xddeac8, emissiveIntensity: .42, roughness: .28 });
  const tail = new THREE.MeshStandardMaterial({ color: 0xa82b25, emissive: 0xbb3427, emissiveIntensity: .33, roughness: .4 });
  const body = new VillaModelBuilder(root, 'pickup-body'), cabin = new VillaModelBuilder(root, 'pickup-cabin'), glazing = new VillaModelBuilder(root, 'pickup-glazing');
  const quad = (builder: VillaModelBuilder, corners: Triple[], material: THREE.Material) => {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(corners.flat(), 3)); g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals(); builder.geometry(g, material);
  };
  // Structural rails stay below the footwell and bed, never fill the cabin.
  for (const x of [-.69, .69]) body.box(x, .39, -.02, .13, .17, 5.15, dark, .018);
  body.box(0, .57, .20, 1.9, .09, 2.15, dark, .025);
  // Tall tyres, disc brakes and six-spoke alloys make a visibly distinct stance.
  for (const side of [-1, 1]) for (const z of [-1.725, 1.725]) {
    body.geometry(new THREE.TorusGeometry(.306, .094, 10, 40), rubber, [side * .955, .41, z], [0, Math.PI / 2, 0]);
    body.cylinder(side * 1.04, .41, z, .255, .255, .034, dark, [0, 0, Math.PI / 2], 30);
    body.geometry(new THREE.TorusGeometry(.242, .013, 6, 30), metal, [side * 1.061, .41, z], [0, Math.PI / 2, 0]);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      body.beam([side * 1.065, .41, z], [side * 1.065, .41 + Math.cos(a) * .23, z + Math.sin(a) * .23], .023, metal, 6);
    }
    body.cylinder(side * 1.075, .41, z, .065, .065, .035, metal, [0, 0, Math.PI / 2], 12);
    body.geometry(new THREE.TorusGeometry(.437, .033, 7, 34, Math.PI), dark, [side * 1.035, .41, z], [0, Math.PI / 2, 0]);
    // Upper fender shoulder above the arch; open tyre space below.
    body.box(side * .95, 1.0, z, .17, .18, 1.13, paint, .05);
    for (const dz of [-.55, .55]) body.box(side * .995, .73, z + dz, .10, .57, .13, paint, .027);
  }
  // Hood has a slight crown and clipped front corners rather than one cube.
  quad(body, [[-1.00, 1.12, 1.24], [-.91, 1.0, 2.64], [0, 1.035, 2.75], [0, 1.16, 1.24]], paint);
  quad(body, [[0, 1.16, 1.24], [0, 1.035, 2.75], [.91, 1.0, 2.64], [1, 1.12, 1.24]], paint);
  body.box(0, .77, 2.66, 1.86, .40, .075, paint, .045);
  body.box(0, .70, 2.707, 1.14, .21, .03, dark, .035);
  for (let i = 0; i < 7; i++) body.box(-.48 + i * .16, .71, 2.729, .024, .15, .015, metal, .003);
  body.box(0, .48, 2.70, 2.01, .15, .21, dark, .055);
  for (const side of [-1, 1]) {
    body.box(side * .76, .91, 2.71, .36, .17, .035, headlight, .035);
    body.box(side * .94, .40, .24, .22, .08, 1.90, metal, .016); // usable side step
  }
  // Open load bed: thin floor and separate sides/tailgate, with visible ribs,
  // tie-downs and wheel tubs. No roof or solid cuboid fills the cargo space.
  body.box(0, .74, -1.70, 1.85, .085, 1.98, paint, .018);
  for (let i = 0; i < 11; i++) body.box(-.80 + i * .16, .796, -1.69, .035, .025, 1.80, dark, .006);
  for (const side of [-1, 1]) {
    body.box(side * .977, 1.025, -1.71, .115, .49, 2.04, paint, .025);
    body.box(side * .967, 1.285, -1.71, .15, .055, 2.05, dark, .012);
    body.box(side * .79, .88, -1.725, .28, .20, .88, trim, .05);
    for (const z of [-2.48, -.87]) body.geometry(new THREE.TorusGeometry(.042, .008, 6, 16), metal, [side * .90, 1.14, z], [0, Math.PI / 2, 0]);
    body.box(side * .95, 1.04, -2.746, .14, .36, .025, tail, .016);
  }
  body.box(0, 1.015, -2.739, 1.91, .49, .095, paint, .025);
  body.box(0, 1.28, -2.739, 1.94, .05, .12, dark, .010);
  body.box(0, 1.12, -2.795, .24, .058, .022, dark, .015);
  body.box(0, .57, -2.74, 2.01, .13, .19, metal, .033);
  // Hollow cab and lightly raked windshield; glass remains actual thin sheets.
  body.box(0, 1.10, -.65, 1.95, .77, .08, paint, .035);
  body.box(0, 1.945, .04, 1.94, .055, 1.40, paint, .035);
  quad(glazing, [[-.91, 1.27, 1.23], [.91, 1.27, 1.23], [.86, 1.91, .73], [-.86, 1.91, .73]], glass);
  quad(glazing, [[-.82, 1.40, -.699], [.82, 1.40, -.699], [.82, 1.87, -.699], [-.82, 1.87, -.699]], glass);
  for (const side of [-1, 1]) {
    body.beam([side * .94, 1.21, 1.21], [side * .90, 1.92, .73], .04, paint);
    body.beam([side * .96, 1.23, -.64], [side * .91, 1.92, -.64], .043, paint);
  }
  cabin.box(0, 1.235, 1.065, 1.78, .16, .30, dark, .025);
  cabin.box(0, 1.23, .897, 1.72, .055, .026, trim, .006);
  cabin.box(0, 1.30, .868, .33, .21, .024, dark, .01);
  cabin.box(0, 1.30, .853, .29, .17, .004, metal, .003);
  for (const side of [-1, 1]) {
    cabin.box(side * .52, .77, .18, .64, .17, .69, fabric, .065);
    cabin.geometry(new THREE.BoxGeometry(.61, .62, .14), fabric, [side * .52, 1.15, -.16], [-.1, 0, 0]);
    cabin.box(side * .52, 1.55, -.205, .29, .22, .14, fabric, .043);
    cabin.box(side * .52, .605, .67, .54, .012, .44, rubber, .015);
  }
  cabin.box(0, .83, .13, .29, .29, .72, dark, .035); cabin.box(0, .99, -.01, .28, .06, .37, fabric, .025);
  cabin.beam([.52, 1.24, 1.05], [.52, 1.31, .83], .035, dark);
  const mount = new THREE.Group(); mount.name = 'pickup-steering-mount'; mount.position.set(.52, 1.33, .80); mount.rotation.x = .24; root.add(mount);
  const wheel = new VillaModelBuilder(mount, 'pickup-steering-wheel');
  wheel.geometry(new THREE.TorusGeometry(.183, .022, 10, 40), rubber); wheel.box(0, 0, 0, .115, .083, .045, dark, .015);
  for (const x of [-.15, .15]) wheel.beam([0, 0, 0], [x, .015, 0], .019, dark);
  wheel.beam([0, -.03, 0], [0, -.17, 0], .019, dark); wheel.finish();
  const doors: { root: THREE.Group; bounds: THREE.Box3 }[] = [];
  for (const side of [1, -1]) {
    const pivot = new THREE.Group(); pivot.name = side === 1 ? 'pickup-driver-door' : 'pickup-passenger-door'; pivot.position.set(side * 1.02, 0, 1.21); pivot.userData = { animated: true, side, hinge: [side * 1.02, 0, 1.21] }; root.add(pivot);
    const door = new VillaModelBuilder(pivot, `pickup-door-${side}`);
    door.at(-side * 1.02, 0, -1.21, 0, () => {
      door.box(side * .995, .916, .275, .075, .66, 1.68, paint, .021);
      door.box(side * .943, 1.075, .20, .04, .23, 1.49, trim, .015);
      door.box(side * .902, 1.06, .19, .13, .07, .63, fabric, .019);
      door.box(side * 1.041, 1.15, -.31, .023, .04, .18, dark, .013);
      quad(door, [[side * .98, 1.25, -.54], [side * .98, 1.25, 1.13], [side * .895, 1.89, .69], [side * .895, 1.89, -.54]], glass);
      door.beam([side * .98, 1.25, -.54], [side * .895, 1.89, -.54], .012, dark);
      door.beam([side * .895, 1.89, -.54], [side * .895, 1.89, .69], .012, dark);
      door.beam([side * .98, 1.25, .93], [side * 1.12, 1.36, 1.0], .018, dark);
      door.box(side * 1.115, 1.40, 1.025, .12, .14, .15, paint, .036);
      door.box(side * 1.115, 1.40, .943, .10, .10, .008, metal, .015);
    });
    door.finish();
    doors.push({ root: pivot, bounds: new THREE.Box3(new THREE.Vector3(side === 1 ? -.14 : -.17, .57, -1.79), new THREE.Vector3(side === 1 ? .17 : .14, 1.93, .04)) });
  }
  for (const builder of [body, cabin, glazing]) builder.finish();
  const localBody = new THREE.Box3(new THREE.Vector3(-VILLA_PICKUP_LIMITS.halfWidth, 0, -VILLA_PICKUP_LIMITS.halfLength), new THREE.Vector3(VILLA_PICKUP_LIMITS.halfWidth, VILLA_PICKUP_LIMITS.height, VILLA_PICKUP_LIMITS.halfLength));
  const nodes = [{ root, bounds: localBody }, ...doors], world = new THREE.Box3(), query = new THREE.Vector3();
  const colliders: VillaCollider[] = nodes.map(() => ({ ...VILLA_PICKUP.body })), inverses = nodes.map(() => new THREE.Matrix4());
  registerVillaPickupColliders(colliders);
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
  const fallback = createVillaPickup(); let progress = 0, previousTime: number | undefined, previousPose = '';
  const update = (time: number, state: { pickup?: VillaPickupState; pickupDoorOpen?: boolean }): boolean => {
    if (!Number.isFinite(time)) return false;
    const candidate = state.pickup ?? fallback, pose = [candidate.x, candidate.z, candidate.yaw].every(Number.isFinite) ? candidate : fallback;
    const terrain = villaTerrainOrientation(pose.x, pose.z, pose.yaw), wheelAngle = THREE.MathUtils.clamp(pose.steering || 0, -.53, .53) * 4.5;
    const signature = [pose.x, terrain.y, pose.z, pose.yaw, wheelAngle].join('/'), moved = signature !== previousPose; previousPose = signature;
    root.position.set(pose.x, terrain.y, pose.z); root.rotation.set(terrain.pitch, pose.yaw, terrain.roll, terrain.order); wheel.root.rotation.z = wheelAngle;
    const target = state.pickupDoorOpen ? 1 : 0, before = progress;
    if (time === 0 || (previousTime !== undefined && time < previousTime)) progress = target;
    else if (previousTime !== undefined) {
      const delta = Math.max(0, time - previousTime) / CAR_DOOR_SECONDS;
      progress = target > progress ? Math.min(target, progress + delta) : Math.max(target, progress - delta);
      if (Math.abs(progress - target) < 1e-9) progress = target;
    }
    previousTime = time;
    if (!moved && before === progress) return false;
    // Only the driver's door is used: one person gets in and out on their own
    // side, so the passenger door stays shut instead of opening both at once.
    for (const door of doors) door.root.rotation.y = door.root.userData.side === 1 ? -1.13 * smooth(progress) : 0;
    updateColliders(); return true;
  };
  update(0, {});
  return { colliders, update, get doorProgress() { return progress; } };
}
