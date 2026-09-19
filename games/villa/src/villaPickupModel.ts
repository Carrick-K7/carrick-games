import * as THREE from 'three';
import { CAR_DOOR_SECONDS } from './villaActivities.js';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import { PLAYER_RADIUS, setVillaColliderNarrowPhase, type VillaCollider } from './villaWorld.js';
import { villaTerrainOrientation } from './villaEstateLayout.js';
import { createVillaPickup, registerVillaPickupColliders, VILLA_PICKUP, VILLA_PICKUP_LIMITS, type VillaPickupState } from './villaPickup.js';
import { coachCanopy, coachFasciaPatch, coachGlass, coachHull, coachLine, coachMix, coachPanel, coachSeat, coachSheet, coachWheels } from './villaCoachwork.js';

const smooth = (t: number) => t * t * (3 - 2 * t);
/** Original short-cab utility pickup. A softly folded cab and a genuinely
 * separate open cargo box sit on one ladder chassis; fixed details are batched. */
export function createVillaPickupModel(parent: THREE.Object3D): {
  colliders: VillaCollider[];
  update(time: number, state: { pickup?: VillaPickupState; pickupDoorOpen?: boolean }): boolean;
  readonly doorProgress: number;
} {
  const root = new THREE.Group(); root.name = 'villa-pickup'; root.userData = { kind: 'vehicle', style: 'utility-pickup', forward: '+Z', driverSide: '+X', hollowCabin: true, openCargoBed: true }; parent.add(root);
  const paint = new THREE.MeshPhysicalMaterial({ color: 0x829b88, metalness: .10, roughness: .40, clearcoat: .55, clearcoatRoughness: .30 });
  const dark = villaMaterial(0x27302e, .65), rubber = villaMaterial(0x1d2221, .92), metal = villaMaterial(0xc2cac4, .38, .28);
  const fabric = villaMaterial(0x806e55, .9), insert = villaMaterial(0xbaa58a, .96), stitch = villaMaterial(0xd6c9b0, .84);
  const glass = coachGlass(0x597277, .62);
  const headlight = new THREE.MeshStandardMaterial({ color: 0xf2ecd2, emissive: 0xe7e4c4, emissiveIntensity: .44, roughness: .26 });
  const tail = new THREE.MeshStandardMaterial({ color: 0xa52b26, emissive: 0xbb3427, emissiveIntensity: .33, roughness: .35 });
  const screen = new THREE.MeshBasicMaterial({ color: 0x172c30 }), graphic = new THREE.MeshBasicMaterial({ color: 0xb5cabc });
  paint.name = 'sage-utility-clearcoat'; glass.name = 'pickup-cabin-glazing';
  const body = new VillaModelBuilder(root, 'pickup-body'), cabin = new VillaModelBuilder(root, 'pickup-cabin'), glazing = new VillaModelBuilder(root, 'pickup-glazing');
  const bed = new VillaModelBuilder(root, 'pickup-cargo-bed');
  const hull = coachHull([
    [-.73, 1.01, 1.265], [-.45, 1.026, 1.27], [.60, 1.032, 1.275], [1.21, 1.038, 1.265],
    [1.725, 1.052, 1.225], [2.40, .99, 1.13], [2.78, .857, 1.035],
  ], [1.725], .41, .442, .43, .045, { front: .22, rear: 0 });
  const bedHull = coachHull([[-2.80, .935, 1.22], [-2.5, 1.027, 1.265], [-1.725, 1.052, 1.265], [-.77, 1.01, 1.255]], [-1.725], .41, .442, .43, .026, { front: 0, rear: 0 });
  const canopy = coachCanopy(hull, { frontBase: 1.21, rearBase: -.73, front: [.65, .913, 1.9], rear: [-.58, .926, 1.9], crown: .047 });
  for (const x of [-.69, .69]) body.box(x, .375, -.02, .13, .16, 5.25, dark, .024);
  for (const side of [-1, 1]) {
    hull.sides(body, paint, side, -.73, -.56); hull.sides(body, paint, side, 1.21, 2.78);
    bedHull.sides(bed, paint, side, -2.8, -.77);
    body.box(side * .998, .397, .22, .21, .07, 1.93, dark, .021);
    body.box(side * 1.003, .439, .22, .14, .009, 1.67, metal, .003);
    for (let i = 0; i < 8; i++) body.box(side * 1.002, .446, -.43 + i * .18, .10, .004, .013, rubber, .002);
  }
  hull.deckPanel(body, paint, 1.21, 2.78); hull.endPanel(body, paint, 2.78);
  hull.arches(body, dark, .024); bedHull.arches(bed, dark, .024);
  coachWheels(body, { axles: [-1.725, 1.725], x: .967, y: .41, radius: .397, width: .19, spokes: 6 }, rubber, dark, metal, metal);
  // A pressed tailgate, capped load rails, ribbed liner and enclosed wheel tubs.
  // The 40mm cab/bed joint is deliberate; it is not a hole into the cab.
  bed.box(0, .735, -1.785, 1.95, .075, 2.0, dark, .013);
  for (let i = 0; i < 12; i++) bed.box(-.858 + i * .156, .780, -1.78, .029, .018, 1.86, dark, .004);
  for (const side of [-1, 1]) {
    coachPanel(bed, (u, v) => {
      const z = coachMix(-2.77, -.79, u), s = bedHull.section(z);
      return [side * (s.width - .047), coachMix(.765, s.belt - .012, v), z];
    }, dark, [-side, 0, 0], [side * .020, 0, 0], 32, 8);
    coachLine(bed, t => { const z = coachMix(-2.8, -.77, t), s = bedHull.section(z); return [side * (s.width - .015), s.belt, z]; }, dark, .027);
    bed.ellipsoid(side * .865, .755, -1.725, .175, .245, .47, dark);
    for (const z of [-2.5, -.94]) bed.geometry(new THREE.TorusGeometry(.034, .006, 6, 18), metal, [side * .965, 1.135, z], [0, Math.PI / 2, 0]);
    bed.box(side * .81, 1.004, -2.811, .13, .28, .018, tail, .022);
    bed.box(side * .81, 1.013, -2.823, .09, .038, .004, headlight, .006);
  }
  bedHull.endPanel(bed, paint, -2.8);
  bed.box(0, 1.0, -.79, 1.96, .50, .034, dark, .009);
  bed.box(0, 1.12, -2.824, .224, .047, .017, dark, .010);
  bed.box(0, .902, -2.822, 1.09, .008, .006, metal, .002);
  bed.box(0, .478, -2.803, 1.94, .135, .095, dark, .026);
  bed.box(0, .55, -2.801, 1.80, .028, .094, metal, .010);
  // A softly wrapped utility face rather than a cab-width rectangular block.
  // The lamp housings, slats and textured lower bumper share its curved skin.
  const grille = coachFasciaPatch(body, hull, 2.78, -.58, .58, .46, .85, dark, .012);
  for (const v of [.12, .36, .60, .84]) coachLine(body, t => grille(coachMix(.04, .96, t), v, .004), metal, .004, 20);
  for (const side of [-1, 1]) {
    const lamp = coachFasciaPatch(body, hull, 2.78, side * .63, side * .98, .51, .91, dark, .012);
    coachLine(body, t => lamp(.89, coachMix(.12, .88, t), .006), headlight, .010, 10);
    coachLine(body, t => lamp(coachMix(.08, .87, t), .84, .006), headlight, .008, 12);
    const p = lamp(.40, .49, .004); body.ellipsoid(p[0], p[1], p[2], .040, .045, .015, headlight);
    coachLine(body, t => hull.deck(side * coachMix(.35, .50, t), coachMix(1.30, 2.38, t), .002), paint, .006);
  }
  coachFasciaPatch(body, hull, 2.78, -.98, .98, .045, .26, dark, .012);
  coachFasciaPatch(body, hull, 2.78, -.46, .46, .05, .16, metal, .016);
  coachPanel(body, canopy.roof, paint, [0, 1, 0], [0, -.044, 0], 28, 26);
  canopy.frame(body, paint, dark);
  cabin.geometry(coachSheet(24, 24, (u, v) => { const p = canopy.roof(u, v); p[1] -= .048; return p; }, [0, -1, 0]), insert);
  for (const side of [-1, 1]) cabin.box(side * .49, 1.845, .60, .40, .026, .17, fabric, .012);
  for (const front of [true, false]) glazing.geometry(coachSheet(28, 24, (u, v) => canopy.wind(front, u, v), [0, 1, front ? 1 : -1]), glass);
  for (const side of [-1, 1]) {
    canopy.pane(glazing, glass, side, -.73, -.56);
    coachLine(body, t => canopy.window(side, -.56, t), paint, .035, 16);
    coachLine(body, t => canopy.roof(side > 0 ? .98 : .02, t), dark, .008);
  }
  // Closed front/rear bulkheads and low footwells; no opaque volume fills the
  // cab. Tall bucket seats now relate to the actual unchanged 1.58m eye datum.
  cabin.box(0, .555, .22, 1.94, .075, 1.90, dark, .024);
  cabin.box(0, .931, 1.19, 1.97, .73, .069, dark, .016);
  coachPanel(body, (u, v) => [coachMix(-1.01, 1.01, u), coachMix(.57, 1.265, v), -.73], paint, [0, 0, -1], [0, 0, .05], 24, 8);
  for (const side of [-1, 1]) {
    cabin.box(side * .954, .88, 1.025, .06, .58, .34, dark, .012);
    cabin.box(side * .52, .602, .76, .57, .014, .48, rubber, .014);
    coachSeat(cabin, side * .52, .82, .17, .66, fabric, insert, dark, stitch, .60);
    cabin.beam([side * .947, 1.64, -.49], [side * .81, .84, -.43], .012, dark, 6);
  }
  // Folded soft-touch dashboard, hooded twin analogue dials, embedded map and
  // tangible heater knobs. Purposeful utility, not the sedan's floating tablet.
  coachPanel(cabin, (u, v) => {
    const x = u * 2 - 1;
    return [x * .945, coachMix(1.115, 1.32, v) - .022 * x * x, coachMix(.935, 1.195, v) + .025 * x * x];
  }, dark, [0, 0, -1], [0, 0, .046], 28, 10);
  cabin.box(0, 1.187, .91, 1.78, .072, .027, fabric, .008);
  cabin.box(.52, 1.399, 1.087, .40, .188, .054, dark, .026);
  cabin.box(.52, 1.397, 1.055, .349, .139, .006, screen, .006);
  for (const x of [.415, .625]) {
    cabin.geometry(new THREE.TorusGeometry(.052, .003, 6, 32, Math.PI * 1.65), metal, [x, 1.399, 1.05], [0, 0, -.28]);
    for (let i = 0; i < 9; i++) {
      const a = i * Math.PI * 1.65 / 8 - .28;
      cabin.beam([x + Math.cos(a) * .042, 1.399 + Math.sin(a) * .042, 1.045], [x + Math.cos(a) * .048, 1.399 + Math.sin(a) * .048, 1.045], .0017, graphic, 5);
    }
    cabin.beam([x, 1.399, 1.043], [x - .018, 1.43, 1.043], .0025, headlight, 5);
  }
  cabin.box(0, 1.324, .941, .34, .232, .035, dark, .018);
  cabin.box(0, 1.337, .919, .291, .161, .005, screen, .004);
  for (let i = 0; i < 3; i++) { cabin.box(0, 1.291 + i * .045, .916, .258, .003, .003, graphic, 0); cabin.box(-.09 + i * .085, 1.337, .914, .003, .136, .002, graphic, 0); }
  for (const x of [-.112, 0, .112]) cabin.cylinder(x, 1.188, .918, .021, .021, .022, metal, [Math.PI / 2, 0, 0], 16);
  for (const x of [-.80, -.29, .29, .80]) {
    cabin.box(x, 1.282, .944, .154, .076, .015, rubber, .010);
    for (let i = 0; i < 4; i++) cabin.box(x, 1.255 + i * .017, .933, .12, .003, .005, metal, .001);
  }
  cabin.box(0, .905, .19, .29, .44, .79, dark, .033);
  cabin.box(0, 1.154, -.06, .29, .084, .29, fabric, .022);
  cabin.box(0, 1.131, .412, .20, .023, .218, rubber, .012);
  for (const z of [.13, .275]) {
    cabin.cylinder(0, 1.134, z, .049, .045, .022, rubber, [0, 0, 0], 24);
    cabin.geometry(new THREE.TorusGeometry(.051, .0035, 6, 24), metal, [0, 1.15, z], [Math.PI / 2, 0, 0]);
  }
  for (const [x, w] of [[.44, .11], [.61, .085]] as const) cabin.box(x, .75, 1.137, w, .135, .026, metal, .005);
  cabin.beam([0, 1.922, .63], [0, 1.79, .885], .011, dark);
  cabin.box(0, 1.765, .895, .25, .075, .034, dark, .012); cabin.box(0, 1.765, .875, .22, .058, .004, metal, .003);
  cabin.beam([.52, 1.24, 1.05], [.52, 1.31, .83], .035, dark);
  const mount = new THREE.Group(); mount.name = 'pickup-steering-mount'; mount.position.set(.52, 1.33, .80); mount.rotation.x = .24; root.add(mount);
  const wheel = new VillaModelBuilder(mount, 'pickup-steering-wheel');
  wheel.geometry(new THREE.TorusGeometry(.183, .022, 10, 40), rubber); wheel.box(0, 0, 0, .115, .083, .045, dark, .015);
  for (const x of [-.15, .15]) { wheel.beam([0, 0, 0], [x, .015, 0], .019, dark); wheel.box(x * .63, .008, -.028, .04, .025, .011, metal, .004); }
  wheel.beam([0, -.03, 0], [0, -.17, 0], .019, dark);
  const marker = new THREE.Object3D(); marker.name = 'pickup-wheel-top-marker'; marker.position.set(0, .183, 0); wheel.root.add(marker); wheel.finish();
  const doors: { root: THREE.Group; bounds: THREE.Box3 }[] = [];
  for (const side of [1, -1]) {
    const pivot = new THREE.Group(); pivot.name = side === 1 ? 'pickup-driver-door' : 'pickup-passenger-door'; pivot.position.set(side * 1.02, 0, 1.21); pivot.userData = { animated: true, side, hinge: [side * 1.02, 0, 1.21] }; root.add(pivot);
    const door = new VillaModelBuilder(pivot, `pickup-door-${side}`);
    door.at(-side * 1.02, 0, -1.21, 0, () => {
      hull.sides(door, paint, side, -.56, 1.21); canopy.pane(door, glass, side, -.56, 1.21);
      coachLine(door, t => canopy.window(side, coachMix(-.56, 1.21, t), 0), dark, .011);
      for (const z of [-.56, 1.21]) coachLine(door, t => hull.side(side, z, t), dark, .003, 12);
      door.box(side * .963, .92, .29, .05, .53, 1.56, fabric, .019);
      door.box(side * .924, 1.059, .22, .105, .083, .67, insert, .020);
      door.box(side * .929, 1.191, .63, .025, .035, .172, metal, .008);
      door.cylinder(side * .925, .84, .78, .075, .075, .019, dark, [0, 0, Math.PI / 2], 24);
      door.box(side * 1.036, 1.177, -.36, .017, .029, .184, dark, .008);
      door.beam([side * .981, 1.35, .95], [side * 1.10, 1.407, 1.0], .018, dark);
      door.box(side * 1.13, 1.442, 1.016, .124, .137, .171, paint, .031);
      door.box(side * 1.13, 1.442, .925, .101, .105, .007, metal, .014);
    });
    door.finish();
    doors.push({ root: pivot, bounds: new THREE.Box3(new THREE.Vector3(side === 1 ? -.16 : -.18, .43, -1.79), new THREE.Vector3(side === 1 ? .18 : .16, 1.94, .04)) });
  }
  for (const builder of [body, cabin, glazing, bed]) builder.finish();
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
    for (const door of doors) door.root.rotation.y = door.root.userData.side === 1 ? -1.13 * smooth(progress) : 0;
    updateColliders(); return true;
  };
  update(0, {});
  return { colliders, update, get doorProgress() { return progress; } };
}
