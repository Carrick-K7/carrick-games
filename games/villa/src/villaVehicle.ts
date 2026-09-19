import * as THREE from 'three';
import { CAR_DOOR_SECONDS, VILLA_CAR, type VillaActivityState } from './villaActivities.js';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import { PLAYER_RADIUS, setVillaColliderNarrowPhase, type VillaCollider } from './villaWorld.js';
import { registerVillaVehicleColliders, type VillaDrivingState } from './villaDriving.js';
import { villaTerrainOrientation } from './villaEstateLayout.js';
import { coachCanopy, coachFasciaPatch, coachGlass, coachHull, coachLine, coachMix, coachPanel, coachSeat, coachSheet, coachWheels } from './villaCoachwork.js';

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
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const shade = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
      shade.addColorStop(0, 'rgba(0,0,0,.65)'); shade.addColorStop(.58, 'rgba(0,0,0,.38)'); shade.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = shade; ctx.fillRect(0, 0, 64, 64);
      const texture = new THREE.CanvasTexture(canvas);
      const contact = new THREE.Mesh(new THREE.PlaneGeometry(2.65, 5.35), new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: .68, depthWrite: false, toneMapped: false }));
      contact.name = 'vehicle-contact-shadow'; contact.rotation.x = -Math.PI / 2; contact.position.y = .032; car.add(contact);
    }
  }
  const paint = new THREE.MeshPhysicalMaterial({ color: 0xd3ddda, roughness: .31, metalness: .12, clearcoat: .75, clearcoatRoughness: .24 });
  const dark = villaMaterial(0x20292d, .64), rubber = villaMaterial(0x151719, .91), silver = villaMaterial(0xc2cdcf, .35, .28);
  const upholstery = villaMaterial(0xe2dfd1, .86), insert = villaMaterial(0xc9c6b8, .92), seam = villaMaterial(0x8e9995, .78), wood = villaMaterial(0x867058, .74);
  const glass = coachGlass(0x526974, .65);
  const roofGlass = new THREE.MeshPhysicalMaterial({ color: 0x243238, roughness: .23, metalness: .23, clearcoat: 1, clearcoatRoughness: .16 });
  const headlight = new THREE.MeshStandardMaterial({ color: 0xe2f6ff, emissive: 0xc8eafa, emissiveIntensity: .55, roughness: .2 });
  const taillight = new THREE.MeshStandardMaterial({ color: 0xa3232c, emissive: 0xd61c25, emissiveIntensity: .35, roughness: .25 });
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
  coachWheels(body, { axles, x: .875, y: .355, radius: .347, width: .15, spokes: 5 }, rubber, dark, silver, paint);
  // A wrapped, swept-back nose with actual front-facing lamp recesses. The
  // bonnet is clean; optics no longer read as black stickers laid on its top.
  const intake = coachFasciaPatch(body, hull, 2.34, -.82, .82, .20, .39, dark);
  coachLine(body, t => intake(t, .04, .003), silver, .004, 24);
  coachFasciaPatch(body, hull, 2.34, -.90, .90, .055, .13, dark, .006);
  for (const side of [-1, 1]) {
    const lamp = coachFasciaPatch(body, hull, 2.34, side * .50, side * .98, .65, .94, dark, .010);
    coachLine(body, t => lamp(coachMix(.055, .945, t), .84, .005), headlight, .007, 20);
    coachLine(body, t => lamp(coachMix(.12, .88, t), .16, .004), silver, .004, 18);
    for (const u of [.32, .67]) {
      const p = lamp(u, .47, .003);
      body.ellipsoid(p[0], p[1], p[2], .029, .024, .010, headlight);
    }
    coachLine(body, t => hull.deck(side * coachMix(.25, .53, t), coachMix(.96, 1.99, t), .002), paint, .004);
    coachFasciaPatch(body, hull, -2.34, side * .47, side * .96, .79, .90, taillight, .008);
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
  cabin.box(0, .47, .086, .265, .29, .96, dark, .035);
  cabin.box(0, .631, -.254, .26, .078, .30, upholstery, .025);
  cabin.box(0, .622, .28, .253, .025, .39, wood, .010);
  for (const z of [-.005, .147]) {
    cabin.cylinder(0, .627, z, .050, .046, .008, rubber, [0, 0, 0], 24);
    cabin.geometry(new THREE.TorusGeometry(.052, .0035, 6, 24), silver, [0, .635, z], [Math.PI / 2, 0, 0]);
  }
  const chargers = new VillaModelBuilder(car, 'vehicle-dual-phone-chargers');
  chargers.root.userData = { kind: 'inductive-phone-chargers', count: 2, consoleMounted: true };
  chargers.geometry(new THREE.BoxGeometry(.269, .024, .222), dark, [0, .676, .442], [-.40, 0, 0]);
  for (const x of [-.069, .069]) {
    chargers.geometry(new THREE.BoxGeometry(.115, .008, .183), rubber, [x, .691, .436], [-.40, 0, 0]);
    chargers.geometry(new THREE.BoxGeometry(.093, .004, .157), display, [x, .697, .434], [-.40, 0, 0]);
    chargers.box(x, .662, .345, .104, .018, .019, silver, .004);
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
  cabin.box(.074, .928, .589, .002, .197, .002, displayAccent, 0);
  for (let i = 0; i < 4; i++) {
    cabin.beam([-.172, .862 + i * .046, .588], [.054, .882 + i * .046, .588], .0015, displayAccent, 5);
    cabin.beam([-.151 + i * .054, .834, .588], [-.125 + i * .054, 1.025, .588], .0015, displayAccent, 5);
  }
  cabin.box(-.06, .928, .584, .018, .033, .003, upholstery, .004);
  cabin.box(.13, .952, .587, .043, .078, .003, upholstery, .008);
  for (let i = 0; i < 3; i++) cabin.box(.13, .869 + i * .015, .587, .068, .004, .002, displayAccent, 0);
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
    wheel.box(side * .085, .006, -.018, .037, .024, .008, silver, .005);
    for (const y of [-.003, .009]) wheel.box(side * .085, y, -.024, .018, .002, .002, rubber, 0);
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
      door.box(side * .839, .626, .27, .051, .41, 1.07, dark, .021);
      door.box(side * .815, .742, .27, .034, .084, 1.015, upholstery, .015);
      door.box(side * .789, .672, .18, .087, .07, .52, upholstery, .018);
      door.box(side * .811, .809, .29, .016, .028, .97, wood, .005);
      door.box(side * .799, .738, .58, .020, .029, .14, silver, .006);
      door.cylinder(side * .809, .511, .62, .064, .064, .012, seam, [0, 0, Math.PI / 2], 24);
      door.box(side * .931, .847, -.17, .011, .019, .143, dark, .005);
      door.beam([side * .884, 1.001, .73], [side * .923, 1.018, .775], .012, dark);
      door.ellipsoid(side * .927, 1.038, .791, .028, .040, .084, paint);
      door.box(side * .925, 1.038, .713, .049, .043, .005, silver, .007);
    });
    door.finish(); windows.finish();
  }
  for (const builder of [body, cabin, glazing, steering, wheel]) builder.finish();
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
      if (moved) updateCollider();
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
