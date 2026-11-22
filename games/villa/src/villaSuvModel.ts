import * as THREE from 'three';
import { CAR_DOOR_SECONDS } from './villaActivities.js';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import { PLAYER_RADIUS, setVillaColliderNarrowPhase, type VillaCollider } from './villaWorld.js';
import { villaTerrainOrientation } from './villaEstateLayout.js';
import { createVillaSuv, registerVillaSuvColliders, VILLA_SUV, VILLA_SUV_LIMITS, type VillaSuvState } from './villaSuv.js';
import { coachCanopy, coachCoolingFins, coachFasciaPatch, coachGlass, coachHull, coachLine, coachMix, coachPanel, coachProjector, coachSeat, coachSheet, coachTailLens, coachWheels } from './villaCoachwork.js';
import { finishCoachPaint, motorContact } from './villaMotorFinish.js';

import { cabinMap, cupConsole, doorMirror, trimDoor, wheelThumbPod } from './villaVehicleTrim.js';

const smooth = (t: number) => t * t * (3 - 2 * t);
/** Original grand-touring SUV: broad shoulders, substantial glazed cabin and a
 * gently falling tail. All panels are lofted skins, never a solid cabin block. */
export function createVillaSuvModel(parent: THREE.Object3D): {
  colliders: VillaCollider[];
  update(time: number, state: { suv?: VillaSuvState; suvDoorOpen?: boolean }): boolean;
  readonly doorProgress: number;
} {
  const root = new THREE.Group(); root.name = 'villa-suv'; root.userData = { kind: 'vehicle', style: 'coupe-suv', forward: '+Z', driverSide: '+X', hollowCabin: true }; parent.add(root);
  const paint = new THREE.MeshPhysicalMaterial({ color: 0x496f83, metalness: .25, roughness: .34, clearcoat: .81, clearcoatRoughness: .20 });
  const dark = villaMaterial(0x1d262a, .63), rubber = villaMaterial(0x191d20, .91), metal = villaMaterial(0xc7d0d3, .35, .30);
  const leather = villaMaterial(0x966746, .82), insert = villaMaterial(0xb0835c, .91), stitch = villaMaterial(0xceba99, .8), wood = villaMaterial(0x514131, .74);
  const glass = coachGlass(0x465e6c, .68);
  const headlight = new THREE.MeshPhysicalMaterial({ color: 0xcfdfdf, emissive: 0xb1cbce, emissiveIntensity: .50, roughness: .22, clearcoat: .94, clearcoatRoughness: .10 });
  const taillight = new THREE.MeshPhysicalMaterial({ color: 0x8e1c30, emissive: 0xa71e30, emissiveIntensity: .21, roughness: .28, clearcoat: .96, clearcoatRoughness: .11 });
  const screen = new THREE.MeshBasicMaterial({ color: 0x142a33 }), graphic = new THREE.MeshBasicMaterial({ color: 0x92c5cc });
  paint.name = 'gentian-clearcoat'; glass.name = 'coupe-suv-glazing'; leather.name = 'suv-saddle-leather';
  const body = new VillaModelBuilder(root, 'suv-body'), cabin = new VillaModelBuilder(root, 'suv-cabin'), glazing = new VillaModelBuilder(root, 'suv-glazing');
  const roofHeaders = new VillaModelBuilder(root, 'suv-roof-headers');
  const axles = [-1.45, 1.45];
  const hull = coachHull([
    [-2.44, .79, .97], [-2.20, .91, 1.055], [-1.45, .955, 1.105], [-.65, .941, 1.10],
    [.4, .935, 1.105], [.92, .948, 1.10], [1.45, .955, 1.075], [2.13, .902, .985], [2.44, .76, .88],
  ], axles, .42, .437, .32, .046);
  const canopy = coachCanopy(hull, { frontBase: .92, rearBase: -2.08, front: [.13, .787, 1.661], rear: [-1.35, .799, 1.61], crown: .047 });
  for (const side of [-1, 1]) {
    hull.sides(body, paint, side, -2.44, -.62); hull.sides(body, paint, side, .92, 2.44);
    body.box(side * .869, .30, .01, .105, .085, 1.94, dark, .025);
    coachLine(body, t => hull.side(side, coachMix(-2.2, -.65, t), .84), metal, .004);
  }
  hull.deckPanel(body, paint, .92, 2.44); hull.deckPanel(body, paint, -2.44, -2.08);
  hull.endPanel(body, paint, 2.44); hull.endPanel(body, paint, -2.44); hull.arches(body, dark, .026);
  const tyres = coachWheels(body, { axles, x: .858, y: .42, radius: .407, width: .164, spokes: 5, design: 'split' }, rubber, dark, metal, metal);
  body.box(0,.296,-.10,1.60,.064,4.08,dark,.020);
  // A compact shield grille, separated corner intakes and wraparound optical
  // housings articulate the nose. Every recess follows the sculpted bumper.
  const grille = coachFasciaPatch(body, hull, 2.44, -.53, .53, .32, .69, dark);
  coachCoolingFins(body,grille,false,4);
  for (let i = 0; i < 9; i++) coachLine(body, t => grille(.08 + i * .105, coachMix(.12, .88, t), .004), metal, .004, 5);
  coachLine(body, t => grille(t, .98, .003), metal, .005, 20);
  const skid = coachFasciaPatch(body, hull, 2.44, -.61, .61, .08, .17, metal, .006);
  coachLine(body, t => skid(t, .02, .002), dark, .005, 20);
  for (const side of [-1, 1]) {
    coachFasciaPatch(body, hull, 2.44, side * .65, side * .96, .22, .44, dark, .008);
    const lamp = coachFasciaPatch(body, hull, 2.44, side * .52, side * .97, .72, .96, dark, .010);
    coachLine(body, t => lamp(coachMix(.04, .96, t), .85, .005), headlight, .007, 18);
    coachLine(body, t => lamp(.94, coachMix(.12, .85, t), .005), headlight, .006, 8);
    for (const u of [.28,.66]) coachProjector(body,lamp,u,.171,metal,headlight);
    coachLine(body, t => hull.deck(side * coachMix(.20, .48, t), coachMix(1.05, 2.08, t), .002), paint, .005);
    const rearLamp=coachFasciaPatch(body,hull,-2.44,side*.48,side*.977,.749,.906,dark,.006);
    coachTailLens(body,rearLamp,taillight,headlight);
  }
  coachLine(body, t => hull.fascia(-2.44, coachMix(-.66, .66, t), .835, .010), taillight, .005, 30);
  coachFasciaPatch(body, hull, -2.44, -.93, .93, .09, .27, dark, .007);
  coachFasciaPatch(body, hull, -2.44, -.54, .54, .09, .15, metal, .011);
  // One continuous opaque roof, with matching inner skin and sealed edges.
  coachPanel(body, canopy.roof, paint, [0, 1, 0], [0, -.038, 0], 28, 32);
  canopy.frame(roofHeaders, paint, dark);
  cabin.geometry(coachSheet(24, 24, (u, v) => { const p = canopy.roof(u, v); p[1] -= .042; return p; }, [0, -1, 0]), stitch);
  for (const side of [-1, 1]) cabin.box(side * .44, 1.609, .065, .35, .026, .15, leather, .010);
  for (const front of [true, false]) glazing.geometry(coachSheet(28, 24, (u, v) => canopy.wind(front, u, v), [0, 1, front ? 1 : -1]), glass);
  for (const side of [-1, 1]) {
    canopy.pane(glazing, glass, side, -2.08, -.62);
    coachLine(roofHeaders, t => canopy.window(side, -.62, t), dark, .028, 12);
    coachLine(body, t => canopy.window(side, coachMix(-2.05, -.62, t), 0), metal, .008);
    coachLine(roofHeaders, t => canopy.window(side, -1.48, t), paint, .033, 12);
    // Roof rails sit inside the declared 1.72m envelope, not on spacers above it.
    coachLine(roofHeaders, t => { const p = canopy.roof(side > 0 ? .92 : .08, coachMix(.12, .82, t)); p[1] += .010; return p; }, metal, .009);
  }
  // Entire lower cabin is enclosed: wheel/road triangles cannot leak into the
  // first-person footwell. The shell above the belt remains genuinely hollow.
  cabin.box(0, .367, -.43, 1.75, .06, 2.86, dark, .018);
  cabin.box(0, .715, .897, 1.76, .69, .065, dark, .014);
  cabin.box(0, .67, -1.91, 1.68, .57, .06, dark, .014);
  for (const side of [-1, 1]) {
    cabin.box(side * .865, .655, .68, .05, .54, .43, dark, .012);
    cabin.box(side * .52, .407, .39, .53, .016, .63, rubber, .016);
    coachSeat(cabin, side * .52, .662, -.26, .575, leather, insert, dark, stitch, .55);
    cabin.beam([side * .84, 1.41, -.66], [side * .79, .66, -.72], .011, dark, 6);
    coachSeat(cabin, side * .47, .638, -1.24, .57, leather, insert, dark, stitch, .46);
  }
  cabin.box(0, .64, -1.28, .39, .13, .47, leather, .035);
  cabin.box(0, .925, -1.54, .38, .44, .10, leather, .035);
  // Curved leather fascia has a sculpted brow and a recessed walnut passenger
  // wing. Screens face the occupants (-Z), with readable gauge/map geometry.
  coachPanel(cabin, (u, v) => {
    const x = u * 2 - 1;
    return [x * .854, coachMix(.91, 1.065, v) - .025 * x * x, .90 - .255 * (1 - v) + .035 * x * x];
  }, dark, [0, 0, -1], [0, 0, .05], 32, 10);
  cabin.box(0, .945, .626, 1.62, .051, .021, wood, .010);
  cabin.box(0, 1.008, .647, 1.61, .019, .027, rubber, .004);
  for (const x of [-.73, .73]) for (let i = 0; i < 4; i++) cabin.box(x, .977+i*.010, .627-i*.002, .20, .003, .008, metal, 0);
  cabin.box(.49, 1.166, .719, .374, .172, .039, dark, .023);
  cabin.box(.49, 1.161, .695, .333, .129, .006, screen, .006);
  for (const x of [.393, .585]) {
    cabin.geometry(new THREE.TorusGeometry(.043, .0025, 5, 24, Math.PI * 1.6), graphic, [x, 1.159, .69], [0, 0, -.3]);
    cabin.beam([x, 1.159, .688], [x - .017, 1.183, .688], .002, stitch, 5);
  }
  cabin.box(-.11, 1.164, .687, .56, .223, .028, dark, .013);
  cabin.box(-.11, 1.166, .669, .518, .18, .004, screen, .004);
  cabinMap(cabin,-.11,1.166,.666,.518,.180,graphic,stitch,'touring');
  // Copper edge-lit haptic strip under the wide glass, with a shallow locating ridge.
  cabin.box(-.11,1.046,.676,.40,.013,.012,wood,.002);
  for(const xx of [-.245,-.195,-.025,.025]) cabin.box(xx,1.046,.668,.018,.003,.003,graphic,0);
  cupConsole(cabin,-.055,.95,.29,.40,1.011,[-.07,.085],dark,wood,rubber,metal);
  cabin.box(0, 1.039, -.38, .28, .075, .29, leather, .023);
  cabin.box(0, 1.02, .29, .17, .018, .21, rubber, .015);
  for (const [x, w] of [[.44, .11], [.61, .08]] as const) cabin.box(x, .58, .827, w, .13, .024, metal, .006);
  cabin.beam([0, 1.674, .12], [0, 1.51, .37], .010, dark);
  cabin.box(0, 1.492, .375, .25, .07, .031, dark, .011);
  cabin.box(0, 1.492, .357, .222, .052, .004, metal, .004);
  // The proven hub/shaft geometry is intentionally unchanged. Only its local
  // rotor turns; right input remains clockwise from the real seated camera.
  const shaftTilt = Math.atan2(.22, .26), shaftLength = Math.hypot(.22, .26);
  const steering = new VillaModelBuilder(root, 'suv-steering-column');
  steering.root.position.set(.52, 1.06, .40); steering.root.rotation.x = shaftTilt;
  steering.root.userData = { kind: 'steering', driverSide: '+X', position: [.52, 1.06, .40], shaftTilt };
  steering.beam([0, 0, shaftLength], [0, 0, .025], .033, dark);
  const wheel = new VillaModelBuilder(steering.root, 'suv-steering-wheel');
  wheel.geometry(new THREE.TorusGeometry(.19, .022, 10, 40), leather);
  wheel.box(0, 0, 0, .11, .08, .05, dark, .02); wheel.box(0, 0, -.032, .05, .04, .012, metal, .004);
  for (const side of [-1, 1]) {
    wheel.beam([side*.175,.015,0],[side*.045,.012,0],.016,metal);
    wheelThumbPod(wheel,side,.092,.016,-.022,false,dark,leather,metal);
  }
  wheel.beam([0, -.035, 0], [0, -.175, 0], .016, metal);
  for (const x of [-.12, .12]) wheel.box(x, .04, .04, .03, .06, .01, metal, .002);
  const wheelMarker = new THREE.Object3D(); wheelMarker.name = 'suv-wheel-top-marker'; wheelMarker.position.set(0, .19, 0); wheel.root.add(wheelMarker);
  wheel.root.userData = { localAxis: 'z', steeringRatio: 4.5, rightInputClockwiseFromSeat: true }; steering.finish(); wheel.finish();
  const doors: { root: THREE.Group; bounds: THREE.Box3 }[] = [];
  for (const side of [1, -1]) {
    const pivot = new THREE.Group(); pivot.name = side === 1 ? 'suv-driver-door' : 'suv-passenger-door'; pivot.position.set(side * .99, 0, 1.05); pivot.userData = { animated: true, side, hinge: [side * .99, 0, 1.05] }; root.add(pivot);
    const door = new VillaModelBuilder(pivot, `suv-door-${side}`);
    door.at(-side * .99, 0, -1.05, 0, () => {
      hull.sides(door, paint, side, -.62, .92); canopy.pane(door, glass, side, -.62, .92);
      coachLine(door, t => canopy.window(side, coachMix(-.62, .92, t), 0), metal, .008);
      for (const z of [-.62, .92]) coachLine(door, t => hull.side(side, z, t), dark, .003, 12);
      trimDoor(door,hull,side,'touring',-.597,.893,.485,1.077,leather,insert,dark,metal,wood);
      door.box(side * .945, 1.005, -.43, .017, .025, .158, metal, .005);
      doorMirror(door,side,[.887,1.24,.70],[.950,1.30,.78],.076,.089,.170,'touring',paint,dark,metal);
    });
    door.finish();
    // Expanded upward with the refitted cabin. Same collider objects/hinges and
    // driver-only operation; bounds now contain the actual complete door leaf.
    doors.push({ root: pivot, bounds: new THREE.Box3(new THREE.Vector3(side === 1 ? -.23 : -.012, .28, -1.69), new THREE.Vector3(side === 1 ? .012 : .23, 1.70, .015)) });
  }
  for (const builder of [body, cabin, glazing, roofHeaders]) builder.finish();
  finishCoachPaint(root,paint,axles,.42);
  const updateContact=motorContact(root,tyres,.858,1.45,2.44);
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
    if (moved) updateContact();
    for (const door of doors) door.root.rotation.y = door.root.userData.side === 1 ? -1.13 * smooth(progress) : 0;
    updateColliders(); return true;
  };
  update(0, {});
  return { colliders, update, get doorProgress() { return progress; } };
}
