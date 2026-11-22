import * as THREE from 'three';
import { CAR_DOOR_SECONDS, VILLA_CAR, type VillaActivityState } from './villaActivities.js';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import { PLAYER_RADIUS, setVillaColliderNarrowPhase, type VillaCollider } from './villaWorld.js';
import { registerVillaVehicleColliders, type VillaDrivingState } from './villaDriving.js';
import { villaTerrainOrientation } from './villaEstateLayout.js';
import { coachCanopy, coachCoolingFins, coachFasciaPatch, coachGlass, coachHull, coachLine, coachMix, coachPanel, coachProjector, coachSeat, coachSheet, coachTailLens, coachWheels } from './villaCoachwork.js';
import { finishCoachPaint, motorContact } from './villaMotorFinish.js';

import { cabinMap, cupConsole, doorMirror, trimDoor, wheelThumbPod } from './villaVehicleTrim.js';
import { roundedLoop, sectionLoft, type P3 } from './villaVehicleSections.js';

const smooth = (t: number) => t * t * (3 - 2 * t);
/** Pearl electric fastback with a low prow, flowing shoulders and a fitted
 * dark canopy. Original local coachwork; no downloaded or branded assets. */
export function createVillaVehicle(parent: THREE.Object3D): {
  colliders: VillaCollider[];
  update(time: number, state: VillaActivityState & { driving?: VillaDrivingState }): boolean;
  readonly doorProgress: number;
} {
  const car = new THREE.Group(); car.name = 'villa-vehicle';
  car.position.set(VILLA_CAR.center.x, VILLA_CAR.center.y, VILLA_CAR.center.z);
  car.userData = { kind: 'vehicle', style: 'electric-fastback-sedan', forward: '+Z', driverSide: '+X', hollowCabin: true }; parent.add(car);
  const paint = new THREE.MeshPhysicalMaterial({ color: 0xd3ddda, roughness: .34, metalness: .20, clearcoat: .86, clearcoatRoughness: .19 });
  const dark = villaMaterial(0x20292d, .64), rubber = villaMaterial(0x151719, .91), silver = villaMaterial(0xc2cdcf, .35, .28);
  const upholstery = villaMaterial(0xe2dfd1, .86), insert = villaMaterial(0xc9c6b8, .92), seam = villaMaterial(0x8e9995, .78), wood = villaMaterial(0x867058, .74);
  const glass = coachGlass(0x526974, .65);
  const roofGlass = new THREE.MeshPhysicalMaterial({ color: 0x243238, roughness: .23, metalness: .23, clearcoat: 1, clearcoatRoughness: .16 });
  const headlight = new THREE.MeshPhysicalMaterial({ color: 0xc9dfea, emissive: 0xb8d9e8, emissiveIntensity: .55, roughness: .24, clearcoat: .94, clearcoatRoughness: .10 });
  const taillight = new THREE.MeshPhysicalMaterial({ color: 0x982031, emissive: 0xa81924, emissiveIntensity: .22, roughness: .31, clearcoat: .96, clearcoatRoughness: .12 });
  const display = new THREE.MeshBasicMaterial({ color: 0x182d38 }), displayAccent = new THREE.MeshBasicMaterial({ color: 0x8fc3cd });
  paint.name = 'pearl-clearcoat'; glass.name = 'clear-cabin-glazing'; roofGlass.name = 'panoramic-roof-glazing';
  const body = new VillaModelBuilder(car, 'vehicle-body'), cabin = new VillaModelBuilder(car, 'vehicle-cabin'), glazing = new VillaModelBuilder(car, 'vehicle-glazing');
  cabin.root.userData = { kind: 'cabin', hollow: true, eyeHeight: VILLA_CAR.eyeHeight, inspiration: 'refreshed-Model-S', landscapeDisplay: true, driverInstrumentCluster: true, dualPhoneChargers: true };
  glazing.root.userData.kind = 'glazing';
  const axles = [-1.46, 1.46];
  const hull = coachHull([
    [-2.34, .735, .742], [-2.09, .878, .856], [-1.46, .941, .943], [-.3, .928, .935],
    [.43, .921, .93], [.9, .910, .912], [1.46, .936, .871], [2.09, .855, .721], [2.34, .710, .661],
  ], axles, .355, .383, .249, .045);
  const canopy = coachCanopy(hull, { frontBase: .9, rearBase: -1.84, front: [.17, .750, 1.407], rear: [-.95, .751, 1.40], crown: .060 });
  for (const side of [-1, 1]) {
    hull.sides(body, paint, side, -2.34, -.3); hull.sides(body, paint, side, .9, 2.34);
    body.box(side * .852, .234, .01, .12, .046, 1.84, dark, .013);
    coachLine(body, t => hull.side(side, coachMix(-2.08, -.32, t), .83), paint, .007);
    for (const z of [-1.08]) coachLine(body, t => hull.side(side, z + .055 * (1 - t), t), seam, .0025, 16);
    body.box(side * .933, .855, -.98, .010, .018, .13, dark, .005);
  }
  hull.deckPanel(body, paint, .9, 2.34); hull.deckPanel(body, paint, -2.34, -1.84);
  hull.endPanel(body, paint, 2.34); hull.endPanel(body, paint, -2.34); hull.arches(body, paint, .013);
  const tyres = coachWheels(body, { axles, x: .875, y: .355, radius: .347, width: .15, spokes: 5, design: 'aero' }, rubber, dark, silver, paint);
  // Tucked aerodynamic closeout under the sill; no visible road through the rear valance.
  body.box(0,.222,-.10,1.60,.048,3.97,dark,.018);
  // A wrapped, swept-back nose with actual front-facing lamp recesses. The
  // bonnet is clean; optics no longer read as black stickers laid on its top.
  const intake = coachFasciaPatch(body, hull, 2.34, -.82, .82, .20, .39, dark);
  coachCoolingFins(body,intake,true,11);
  coachLine(body, t => intake(t, .04, .003), silver, .004, 24);
  coachFasciaPatch(body, hull, 2.34, -.90, .90, .055, .13, dark, .006);
  for (const side of [-1, 1]) {
    const lamp = coachFasciaPatch(body, hull, 2.34, side * .50, side * .98, .65, .94, dark, .010);
    coachLine(body, t => lamp(coachMix(.055, .945, t), .84, .005), headlight, .007, 20);
    coachLine(body, t => lamp(coachMix(.12, .88, t), .16, .004), silver, .004, 18);
    for (const u of [.30,.69]) coachProjector(body,lamp,u,.179,silver,headlight);
    coachLine(body, t => hull.deck(side * coachMix(.25, .53, t), coachMix(.96, 1.99, t), .002), paint, .004);
    const rearLamp=coachFasciaPatch(body,hull,-2.34,side*.45,side*.974,.765,.92,dark,.006);
    coachTailLens(body,rearLamp,taillight,headlight);
  }
  coachLine(body, t => hull.fascia(-2.34, coachMix(-.60, .60, t), .84, .010), taillight, .005, 32);
  coachFasciaPatch(body, hull, -2.34, -.91, .91, .12, .29, dark, .007);
  coachPanel(glazing, canopy.roof, roofGlass, [0, 1, 0], [0, -.033, 0], 28, 30);
  canopy.frame(body, paint, dark);
  cabin.geometry(coachSheet(24, 24, (u, v) => { const p = canopy.roof(u, v); p[1] -= .037; return p; }, [0, -1, 0]), dark);
  for (const side of [-1, 1]) cabin.box(side * .42, 1.365, .125, .35, .024, .14, insert, .010);
  for (const front of [true, false]) glazing.geometry(coachSheet(28, 26, (u, v) => canopy.wind(front, u, v), [0, 1, front ? 1 : -1]), glass);
  for (const side of [-1, 1]) {
    canopy.pane(glazing, glass, side, -1.84, -.3);
    coachLine(body, t => canopy.window(side, -.3, t), dark, .020, 14);
    coachLine(body, t => canopy.window(side, coachMix(-1.81, -.3, t), 0), silver, .007);
    coachLine(body, t => canopy.window(side, -1.24, t), paint, .022, 12);
  }
  for (const side of [-1, 1]) coachLine(body, t => { const p = canopy.wind(true, coachMix(side > 0 ? .54 : .07, side > 0 ? .93 : .46, t), .032); p[1] += .006; return p; }, dark, .006, 12);
  // A low, sealed floor and front bulkhead preserve the corrected tyre
  // occlusion without hiding wheels or moving the physical driver eye.
  cabin.box(0, .257, -.31, 1.72, .055, 2.61, dark, .025);
  const footwell = new VillaModelBuilder(car, 'vehicle-front-footwell');
  footwell.box(0, .546, .94, 1.72, .578, .08, dark, .012);
  for (const side of [-1, 1]) footwell.box(side * .845, .51, .69, .045, .48, .50, dark, .012);
  footwell.root.userData = { kind: 'opaque-front-footwell', joinsFloor: true, joinsDashboard: true }; footwell.finish();
  for (const side of [-1, 1]) {
    cabin.box(side * .43, .295, .41, .56, .012, .53, rubber, .020);
    coachSeat(cabin, side * .43, .453, -.02, .525, upholstery, insert, dark, seam, .515);
    cabin.beam([side * .80, 1.10, -.33], [side * .74, .45, -.42], .010, dark, 6);
    coachSeat(cabin, side * .45, .447, -1.10, .53, upholstery, insert, dark, seam, .43);
  }
  cabin.box(0, .452, -1.14, .39, .12, .46, upholstery, .037);
  cabin.box(0, .706, -1.375, .38, .40, .12, upholstery, .035);
  cabin.box(0, .992, -1.441, .22, .14, .11, upholstery, .028);
  for (const [x, w] of [[.38, .11], [.53, .085]] as const) {
    cabin.box(x, .40, .86, w, .135, .022, silver, .004); cabin.box(x, .41, .845, w - .032, .105, .012, rubber, .003);
  }
  // A soft, continuous wing-shaped fascia replaces the old rectangular stack.
  coachPanel(cabin, (u, v) => {
    const x = u * 2 - 1;
    return [x * .832, coachMix(.81, .925, v) - .018 * x * x, coachMix(.692, .913, v) + .020 * x * x];
  }, dark, [0, 0, -1], [0, 0, .04], 32, 10);
  coachLine(cabin, t => [coachMix(-.80, .80, t), .848, .690 + .020 * (t * 2 - 1) ** 2], wood, .019, 30);
  cabin.box(0, .888, .712, 1.54, .012, .019, rubber, .003);
  for (const x of [-.71, .71]) for (let i = 0; i < 4; i++) cabin.box(x, .842 + i * .009, .669, .18, .002, .003, silver, 0);
  cupConsole(cabin,.086,.96,.265,.287,.628,[-.005,.147],dark,wood,rubber,silver);
  cabin.box(0, .650, -.254, .26, .078, .30, upholstery, .025);
  const chargers = new VillaModelBuilder(car, 'vehicle-dual-phone-chargers');
  chargers.root.userData = { kind: 'inductive-phone-chargers', count: 2, consoleMounted: true };
  for (const x of [-.067, .067]) {
    const pocket=(w:number,d:number,h:number)=>roundedLoop(w,d,.013).map(([a,c]):P3=>[x+a,.670+.40*c+h,.442+c]);
    chargers.geometry(sectionLoft([pocket(.127,.208,0).map(([a,,c]):P3=>[a,.625,c]),pocket(.133,.216,.011),pocket(.131,.214,.017),
      pocket(.112,.191,.016),pocket(.105,.185,.001)],true,false),dark);
    chargers.geometry(sectionLoft([pocket(.105,.185,.001),pocket(.096,.174,-.004)],false,true,[0,1,0]),rubber);
    coachLine(chargers,t=>[x+(t-.5)*.087,.652-.024*(t-.5)**2,.342],silver,.006,10);
    for(const k of [-1,0,1]) coachLine(chargers,t=>[x+(t-.5)*.057,.664+k*.007+.0015*Math.sin(t*Math.PI),.433+k*.0175],display,.0018,6);
  }
  chargers.finish();
  const instruments = new VillaModelBuilder(car, 'vehicle-driver-instruments');
  instruments.root.userData = { kind: 'driver-instrument-cluster', behindSteeringWheel: true, driverX: .43 };
  instruments.box(.43, .999, .762, .326, .117, .048, dark, .021);
  instruments.box(.43, .999, .735, .291, .091, .005, display, .006);
  instruments.box(.43, 1.061, .758, .341, .016, .070, dark, .008);
  for (const x of [.344, .516]) instruments.geometry(new THREE.TorusGeometry(.032, .002, 5, 24, Math.PI * 1.65), displayAccent, [x, .999, .731], [0, 0, -.3]);
  instruments.beam([.412, .964, .731], [.422, 1.032, .731], .002, displayAccent, 5);
  instruments.beam([.449, .964, .731], [.439, 1.032, .731], .002, displayAccent, 5);
  instruments.box(.43, .987, .729, .013, .030, .003, upholstery, .003); instruments.finish();
  cabin.box(0, .927, .607, .407, .258, .024, dark, .012);
  cabin.box(0, .929, .592, .376, .225, .003, display, .002);
  cabinMap(cabin,0,.929,.589,.376,.225,displayAccent,upholstery,'fastback');
  cabin.beam([0, 1.439, .19], [0, 1.304, .30], .010, dark);
  cabin.box(0, 1.286, .309, .235, .066, .03, dark, .011); cabin.box(0, 1.286, .291, .208, .047, .004, silver, .003);
  // Fixed tilted column; only the centred wheel rotor turns.
  cabin.beam([.43, .873, .821], [.43, .925, .652], .033, dark);
  const steering = new VillaModelBuilder(car, 'vehicle-steering');
  steering.root.position.set(.43, .935, .62); steering.root.rotation.x = .30;
  steering.root.userData = { kind: 'steering', driverSide: '+X', position: [.43, .935, .62], shaftTilt: .30, animated: true };
  const wheel = new VillaModelBuilder(steering.root, 'vehicle-steering-wheel');
  wheel.geometry(new THREE.TorusGeometry(.174, .020, 10, 48), rubber);
  wheel.geometry(new THREE.TorusGeometry(.148, .004, 6, 40), silver, [0, 0, -.005]);
  wheel.box(0, -.008, -.008, .104, .076, .046, dark, .018);
  for (const side of [-1, 1]) {
    wheel.beam([side * .037, -.006, 0], [side * .157, .016, 0], .016, dark);
    wheelThumbPod(wheel,side,.085,.006,-.02,false,rubber,silver,silver);
  }
  for (const x of [-.025, .025]) wheel.beam([x, -.029, 0], [x, -.157, 0], .011, dark);
  wheel.box(0, .175, -.005, .026, .025, .037, upholstery, .004);
  const wheelMarker = new THREE.Object3D(); wheelMarker.name = 'vehicle-wheel-top-marker'; wheelMarker.position.set(0, .174, 0); wheel.root.add(wheelMarker);
  wheel.root.userData = { localAxis: 'z', steeringRatio: 4.5, rightInputClockwiseFromSeat: true };
  const doorPivot = new THREE.Group(); doorPivot.name = 'vehicle-driver-door'; doorPivot.position.set(.96, 0, .9);
  doorPivot.userData = { kind: 'door', animated: true, hinge: [.96, 0, .9], openAngle: -1.1, carriesGlazing: true }; car.add(doorPivot);
  const passengerPivot = new THREE.Group(); passengerPivot.name = 'vehicle-passenger-door'; passengerPivot.position.set(-.96, 0, .9);
  passengerPivot.userData = { kind: 'door', animated: true, hinge: [-.96, 0, .9], openAngle: 1.1, carriesGlazing: true }; car.add(passengerPivot);
  for (const [side, pivot, name] of [[1, doorPivot, 'driver'], [-1, passengerPivot, 'passenger']] as const) {
    const door = new VillaModelBuilder(pivot, side > 0 ? 'driver-door-panel' : 'passenger-door-details');
    const windows = new VillaModelBuilder(pivot, `${name}-door-glazing`); windows.root.userData.kind = 'glazing';
    windows.at(-side * .96, 0, -.9, 0, () => canopy.pane(windows, glass, side, -.3, .9));
    door.at(-side * .96, 0, -.9, 0, () => {
      hull.sides(door, paint, side, -.3, .9);
      coachLine(door, t => canopy.window(side, coachMix(-.3, .9, t), 0), silver, .007);
      for (const z of [-.3, .9]) coachLine(door, t => hull.side(side, z, t), seam, .0025, 12);
      trimDoor(door,hull,side,'fastback',-.285,.884,.35,.898,upholstery,insert,dark,silver,wood);
      door.box(side * .931, .847, -.17, .011, .019, .143, dark, .005);
      doorMirror(door,side,[.884,1.001,.73],[.925,1.038,.791],.061,.071,.155,'fastback',paint,dark,silver);
    });
    door.finish(); windows.finish();
  }
  for (const builder of [body, cabin, glazing, steering, wheel]) builder.finish();
  finishCoachPaint(car,paint,axles,.355);
  const updateContact=motorContact(car,tyres,.875,1.46,2.34); updateContact();
  car.traverse(node => {
    if (node instanceof THREE.Mesh) {
      const material = node.material as THREE.Material;
      node.name = `${node.parent?.name}/${material.name || material.type}`;
      if (material === glass || material === roofGlass) node.userData.kind = 'glazing';
    }
  });
  // Stable identities are registered once. Expanded local door bounds contain
  // its actual tapered window, while keeping the declared footprint unchanged.
  const bodyCollider: VillaCollider = { ...VILLA_CAR.body };
  const doorCollider: VillaCollider = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, minY: 0, maxY: 1.46 };
  const localDoorBounds = new THREE.Box3(new THREE.Vector3(-.23, .245, -1.205), new THREE.Vector3(.011, 1.455, .013));
  const worldDoorBounds = new THREE.Box3();
  const localBodyBounds = new THREE.Box3(new THREE.Vector3(-.96, 0, -2.36), new THREE.Vector3(.96, 1.48, 2.36));
  const worldBodyBounds = new THREE.Box3();
  const passengerCollider: VillaCollider = { ...doorCollider }, passengerDoorBounds = new THREE.Box3(new THREE.Vector3(-.011, .245, -1.205), new THREE.Vector3(.23, 1.455, .013)), worldPassengerBounds = new THREE.Box3();
  registerVillaVehicleColliders([bodyCollider, doorCollider, passengerCollider]);
  const bodyInverse = new THREE.Matrix4(), doorInverse = new THREE.Matrix4(), passengerInverse = new THREE.Matrix4(), query = new THREE.Vector3();
  for (const [collider, bounds, inverse] of [[bodyCollider, localBodyBounds, bodyInverse], [doorCollider, localDoorBounds, doorInverse], [passengerCollider, passengerDoorBounds, passengerInverse]] as const) {
    setVillaColliderNarrowPhase(collider, p => {
      query.set(p.x, p.y, p.z).applyMatrix4(inverse);
      const dx = query.x - THREE.MathUtils.clamp(query.x, bounds.min.x, bounds.max.x), dz = query.z - THREE.MathUtils.clamp(query.z, bounds.min.z, bounds.max.z);
      return dx * dx + dz * dz < PLAYER_RADIUS * PLAYER_RADIUS;
    });
  }
  const updateCollider = () => {
    doorPivot.updateWorldMatrix(true, false); passengerPivot.updateWorldMatrix(true, false);
    bodyInverse.copy(car.matrixWorld).invert(); doorInverse.copy(doorPivot.matrixWorld).invert(); passengerInverse.copy(passengerPivot.matrixWorld).invert();
    worldBodyBounds.copy(localBodyBounds).applyMatrix4(car.matrixWorld);
    if (car.position.x === VILLA_CAR.center.x && car.position.z === VILLA_CAR.center.z && car.rotation.y === 0) Object.assign(bodyCollider, VILLA_CAR.body);
    else Object.assign(bodyCollider, { minX: worldBodyBounds.min.x, maxX: worldBodyBounds.max.x, minZ: worldBodyBounds.min.z, maxZ: worldBodyBounds.max.z, minY: worldBodyBounds.min.y, maxY: worldBodyBounds.max.y });
    worldDoorBounds.copy(localDoorBounds).applyMatrix4(doorPivot.matrixWorld);
    doorCollider.minX = worldDoorBounds.min.x; doorCollider.maxX = worldDoorBounds.max.x;
    doorCollider.minZ = worldDoorBounds.min.z; doorCollider.maxZ = worldDoorBounds.max.z;
    doorCollider.minY = worldDoorBounds.min.y; doorCollider.maxY = worldDoorBounds.max.y;
    worldPassengerBounds.copy(passengerDoorBounds).applyMatrix4(passengerPivot.matrixWorld);
    Object.assign(passengerCollider, { minX: worldPassengerBounds.min.x, maxX: worldPassengerBounds.max.x, minZ: worldPassengerBounds.min.z, maxZ: worldPassengerBounds.max.z, minY: worldPassengerBounds.min.y, maxY: worldPassengerBounds.max.y });
  };
  updateCollider();
  let progress = 0, previousTime: number | undefined;
  return {
    colliders: [bodyCollider, doorCollider, passengerCollider],
    get doorProgress() { return progress; },
    update(time, state) {
      if (!Number.isFinite(time)) return false;
      const pose = state.driving;
      const x = pose?.x ?? VILLA_CAR.center.x, z = pose?.z ?? VILLA_CAR.center.z, yaw = pose?.yaw ?? 0;
      const wheelAngle = THREE.MathUtils.clamp(pose?.steering ?? 0, -.56, .56) * 4.5;
      const moved = car.position.x !== x || car.position.z !== z || car.rotation.y !== yaw || wheel.root.rotation.z !== wheelAngle;
      wheel.root.rotation.z = wheelAngle;
      const terrain = villaTerrainOrientation(x, z, yaw);
      car.position.set(x, terrain.y, z); car.rotation.set(terrain.pitch, yaw, terrain.roll, terrain.order);
      if (moved) { updateContact(); updateCollider(); }
      const target = state.carDoorOpen ? 1 : 0;
      if (time === 0 || (previousTime !== undefined && time < previousTime)) {
        const changed = moved || progress !== target;
        progress = target; previousTime = time; doorPivot.rotation.y = -1.1 * smooth(progress); passengerPivot.rotation.y = 0; updateCollider(); return changed;
      }
      const elapsed = previousTime === undefined ? 0 : Math.max(0, time - previousTime); previousTime = time;
      if (target === progress) return moved;
      let next = target > progress ? Math.min(1, progress + elapsed / CAR_DOOR_SECONDS) : Math.max(0, progress - elapsed / CAR_DOOR_SECONDS);
      if (Math.abs(next - target) < 1e-9) next = target;
      if (next === progress) return moved;
      progress = next;
      const angle = -1.1 * smooth(progress);
      if (doorPivot.rotation.y === angle) return moved;
      doorPivot.rotation.y = angle; passengerPivot.rotation.y = 0; updateCollider(); return true;
    },
  };
}
