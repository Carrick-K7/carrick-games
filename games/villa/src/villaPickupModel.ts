import * as THREE from 'three';
import { CAR_DOOR_SECONDS } from './villaActivities.js';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import { PLAYER_RADIUS, setVillaColliderNarrowPhase, type VillaCollider } from './villaWorld.js';
import { villaTerrainOrientation } from './villaEstateLayout.js';
import { createVillaPickup, registerVillaPickupColliders, VILLA_PICKUP, VILLA_PICKUP_LIMITS, type VillaPickupState } from './villaPickup.js';
import { coachCanopy, coachCoolingFins, coachGlass, coachHull, coachHeadlamp, coachLine, coachMix, coachPanel, coachSeat, coachSheet, coachTailLens, coachWheels } from './villaCoachwork.js';
import { finishCoachPaint, motorContact } from './villaMotorFinish.js';

import { cabinMap, cupConsole, doorMirror, trimDoor } from './villaVehicleTrim.js';
import { trimSteeringWheel } from './villaCabinWheel.js';
import { sectionLoft, type P2, type P3 } from './villaVehicleSections.js';

const smooth = (t: number) => t * t * (3 - 2 * t);
/** Original short-cab utility pickup. A softly folded cab and a genuinely
 * separate open cargo box sit on one ladder chassis; fixed details are batched. */
export function createVillaPickupModel(parent: THREE.Object3D): {
  colliders: VillaCollider[];
  update(time: number, state: { pickup?: VillaPickupState; pickupDoorOpen?: boolean }): boolean;
  readonly doorProgress: number;
} {
  const root = new THREE.Group(); root.name = 'villa-pickup'; root.userData = { kind: 'vehicle', style: 'utility-pickup', forward: '+Z', driverSide: '+X', hollowCabin: true, openCargoBed: true }; parent.add(root);
  const paint = new THREE.MeshPhysicalMaterial({ color: 0x829b88, metalness: .07, roughness: .46, clearcoat: .48, clearcoatRoughness: .31 });
  const dark = villaMaterial(0x27302e, .65), rubber = villaMaterial(0x1d2221, .92), metal = villaMaterial(0xc2cac4, .38, .28);
  const fabric = villaMaterial(0x806e55, .9), insert = villaMaterial(0xbaa58a, .96), stitch = villaMaterial(0xd6c9b0, .84);
  const glass = coachGlass(0x597277, .62);
  const headlight = new THREE.MeshStandardMaterial({ color: 0xf2ecd2, emissive: 0xe7e4c4, emissiveIntensity: .44, roughness: .26 });
  const tail = new THREE.MeshPhysicalMaterial({ color: 0xa6352d, emissive: 0xa02d24, emissiveIntensity: .20, roughness: .36, clearcoat: .86, clearcoatRoughness: .16 });
  const screen = new THREE.MeshBasicMaterial({ color: 0x172c30 }), graphic = new THREE.MeshBasicMaterial({ color: 0xb5cabc });
  paint.name = 'sage-utility-clearcoat'; glass.name = 'pickup-cabin-glazing';
  const body = new VillaModelBuilder(root, 'pickup-body'), cabin = new VillaModelBuilder(root, 'pickup-cabin'), glazing = new VillaModelBuilder(root, 'pickup-glazing');
  const bed = new VillaModelBuilder(root, 'pickup-cargo-bed');
  const hull = coachHull([
    [-.73, 1.01, 1.265], [-.45, 1.026, 1.27], [.60, 1.032, 1.275], [1.21, 1.038, 1.265],
    [1.725, 1.052, 1.225], [2.40, .99, 1.13], [2.78, .857, 1.035],
  ], [1.725], .41, .442, .43, .045, { style: 'utility', hoodBase: 1.21, front: .24, rear: 0 });
  const bedHull = coachHull([[-2.80, .935, 1.22], [-2.5, 1.027, 1.265], [-1.725, 1.052, 1.265], [-.77, 1.01, 1.255]], [-1.725], .41, .442, .43, .026, { style: 'utility', front: 0, rear: 0 });
  const canopy = coachCanopy(hull, { frontBase: 1.21, rearBase: -.73, front: [.65, .913, 1.9], rear: [-.58, .926, 1.9], crown: .047 });
  for (const x of [-.69, .69]) body.box(x, .375, -.06, .13, .16, 5.07, dark, .024);
  for (const side of [-1, 1]) {
    hull.sides(body, paint, side, -.73, -.56); hull.sides(body, paint, side, 1.21, 2.78);
    bedHull.sides(bed, paint, side, -2.8, -.77);
    body.box(side * .998, .397, .22, .21, .07, 1.93, dark, .021);
    body.box(side * 1.003, .439, .22, .14, .009, 1.67, metal, .003);
    for (let i = 0; i < 8; i++) body.box(side * 1.002, .446, -.43 + i * .18, .10, .004, .013, rubber, .002);
  }
  hull.deckPanel(body, paint, 1.21, 2.78, dark);
  const [grille, leftLamp, rightLamp] = hull.endPanel(body, paint, 2.78, [
    { rect: [-.61, .61, .382, .810], shape: 'grille', depth: .057, stock: dark },
    { rect: [-.625, -.987, .54, .938], shape: 'wing', depth: .036, stock: dark },
    { rect: [.625, .987, .54, .938], shape: 'wing', depth: .036, stock: dark },
  ]);
  hull.arches(body, paint, dark); bedHull.arches(bed, paint, dark);
  const tyres = coachWheels(body, { axles: [-1.725, 1.725], x: .967, y: .41, radius: .397, width: .19, spokes: 6, design: 'utility' }, rubber, dark, metal, metal);
  // The raised open bed exposes its transverse axle and central differential below the ladder rails.
  body.cylinder(0,.402,-1.725,.055,.055,1.75,dark,[0,0,Math.PI/2],12);
  body.ellipsoid(0,.398,-1.73,.151,.126,.103,dark);
  // A pressed tailgate, capped load rails, ribbed liner and enclosed wheel tubs.
  // The 40mm cab/bed joint is deliberate; it is not a hole into the cab.
  // One pressed liner: its corrugations ease into flat flanges at either end.
  const insideX = (z: number, y: number) => {
    const low = bedHull.lower(z), t = THREE.MathUtils.clamp((y - low) / (bedHull.section(z).belt - low), 0, 1);
    return bedHull.side(1, z, t)[0] - .043;
  };
  const loadFloor=(z:number,rise:number):P3[]=>{
    // Trim the floor at both tapered bedsides and the REAL wheel boxes. The
    // old constant-width liner poked through the green paint in rear 3/4.
    const tub = smooth(THREE.MathUtils.clamp((.59 - Math.abs(z + 1.725)) / .20, 0, 1));
    const w = coachMix(Math.min(insideX(z,.706), insideX(z,.770))+.004, .839, tub);
    const top:P2[]=[[-w,.770]];
    for(let i=0;i<10;i++) {
      const x=-.702+i*.156;
      top.push([x-.028,.770],[x-.016,.770+rise*.84],[x-.010,.770+rise],[x+.010,.770+rise],[x+.016,.770+rise*.84],[x+.028,.770]);
    }
    return [...top,[w,.770],[w,.706],[-w,.706]].map(([x,y])=>[x,y,z]);
  };
  bed.geometry(sectionLoft([[-2.704,0],[-2.674,0],[-2.625,.013],[-2.596,.018],[-2.30,.018],[-2.11,.018],[-1.725,.018],[-1.34,.018],[-1.15,.018],[-.922,.018],[-.875,.013],[-.831,0],[-.789,0]]
    .map(([z,r])=>loadFloor(z,r))),dark);
  for (const side of [-1, 1]) {
    coachPanel(bed, (u, v) => {
      const z = coachMix(-2.77, -.79, u), s = bedHull.section(z);
      const y = coachMix(Math.max(.765, bedHull.lower(z) - .007), s.belt - .012, v);
      return [side * insideX(z, y), y, z];
    }, dark, [-side, 0, 0], [side * .015, 0, 0], 36, 6);
    // A wide top land, rolled just over the inner and outer painted returns.
    coachPanel(bed, (u, v) => {
      const z = coachMix(-2.797, -.774, u), s = bedHull.section(z);
      return [side * (s.width - .026 + (v - .5) * .067), s.belt + .008 - .008 * (2 * v - 1) ** 4, z];
    }, dark, [0, 1, 0], [0, -.022, 0], 24, 4);
    bed.geometry(sectionLoft([[-.488,.018,.018],[-.424,.100,.084],[-.296,.180,.171],[-.130,.229,.228],[.079,.231,.235],
      [.263,.193,.189],[.404,.124,.104],[.493,.019,.020]].map(([dz,w,h])=>{
      const profile:P2[]=[[0,0],[w,0],[w,.030*h],[w*.88,h*.15],[w*.78,h*.71],[w*.63,h*.92],[w*.44,h],[0,h]];
      return profile.map(([inset,up]):P3=>[side*(.993-inset),.773+up,-1.725+dz]);
    })),dark);
    for (const z of [-2.5, -.94]) bed.geometry(new THREE.TorusGeometry(.034, .006, 6, 18), metal, [side * .965, 1.135, z], [0, Math.PI / 2, 0]);
  }
  const [, latch, leftTail, rightTail] = bedHull.endPanel(bed, paint, -2.8, [
    { rect: [-.763, .763, .20, .735], shape: 'gate', depth: .068, stock: paint },
    { rect: [-.22, .22, .752, .949], shape: 'press', depth: .083, stock: dark },
    { rect: [-.778, -.997, .523, .930], shape: 'press', depth: .023, stock: dark },
    { rect: [.778, .997, .523, .930], shape: 'press', depth: .023, stock: dark },
  ]);
  for (const lamp of [leftTail, rightTail]) coachTailLens(bed, lamp, tail, headlight, true);
  // The pull bridges a hand-deep draw in the steel. Both ends return to the
  // moulding; a finger fits underneath without passing through the gate.
  coachPanel(bed, (u, v) => latch(.066 + .868 * u, .54 + .27 * v,
    .012 + .050 * Math.min(1, 5 * u, 5 * (1 - u)) + .004 * Math.sin(v * Math.PI)), metal,
  [0, 0, -1], [0, 0, .016], 12, 3);
  for (const side of [-1, 1]) coachLine(bed, t => bedHull.fascia(-2.8, side * .772, coachMix(.167, .994, t), .001), dark, .0035, 12);
  coachPanel(bed, (u, v) => {
    const y = coachMix(.758, 1.235, v);
    return [(2 * u - 1) * (insideX(-.79, y) + .004), y, -.79];
  }, dark, [0, 0, -1], [0, 0, .022], 8, 6);
  // Cranked rear step beam. Both toe lands drop below the central sill and
  // the ends wrap forward around the rear corners instead of sticking out.
  const stepRail = (x: number, top: number, wrap: number): P3[] => {
    const section: P2[] = [[.430, -.692], [.423, -.786], [.434, -.838 + wrap], [.461, -.854 + wrap],
      [top - .013, -.854 + wrap], [top, -.841 + wrap], [top, -.737], [top - .021, -.692]];
    return section.map(([y, dz]) => [x, y, -2 + dz]);
  };
  bed.geometry(sectionLoft([[-.983,.489,.079],[-.932,.517,.036],[-.853,.521,.007],[-.669,.521,0],[-.60,.570,0],
    [-.52,.574,0],[.52,.574,0],[.60,.570,0],[.669,.521,0],[.853,.521,.007],[.932,.517,.036],[.983,.489,.079]]
    .map(([x, y, turn]) => stepRail(x, y, turn))), dark);
  for (const side of [-1, 1]) coachPanel(bed, (u, v) => [side * (.69 + .160 * u), .522 + .004 * Math.sin(v * Math.PI),
    coachMix(-2.827 + .006 * u, -2.752, v)], metal, [0, 1, 0], [0, -.008, 0], 4, 3);
  // A softly wrapped utility face rather than a cab-width rectangular block.
  // The lamp housings, slats and textured lower bumper share its curved skin.
  coachCoolingFins(body, grille, true, 12);
  for (const v of [.13, .42, .71]) body.geometry(coachSheet(18, 3, (u, h) => grille(u, v + h * .060,
    .015 + .015 * Math.sin(Math.PI * h)), [0, 0, 1]), metal);
  for (const lamp of [leftLamp, rightLamp]) coachHeadlamp(body, lamp, metal, headlight, 'utility');
  // Deep wrapped impact cover hides the ends of both ladder rails. A separate
  // scuff land sits on its lower return rather than floating in the grille.
  const bumper = (u: number, v: number, lift = 0): P3 => {
    const a = u * 2 - 1, y = coachMix(.318 + .037 * a * a, .562 - .026 * a * a, v);
    const p = hull.fascia(2.78, a, Math.max(0, (y - .43) / (.605 + .08 * (1 - a * a))));
    return [p[0] + a * .010 * Math.sin(v * Math.PI), y, p[2] + .004 + .017 * Math.sin(Math.PI * v) + lift];
  };
  coachPanel(body, bumper, dark, [0, 0, 1], [0, 0, -.074], 24, 6);
  coachPanel(body, (u, v) => bumper(.5 + (u - .5) * (.62 + .07 * v), .10 + .245 * v, .0025),
    metal, [0, 0, 1], [0, 0, -.005], 14, 3);
  coachPanel(body, canopy.roof, paint, [0, 1, 0], [0, -.044, 0], 28, 26);
  canopy.frame(body, paint, dark);
  cabin.geometry(coachSheet(24, 24, (u, v) => { const p = canopy.roof(u, v); p[1] -= .048; return p; }, [0, -1, 0]), insert);
  for (const side of [-1, 1]) cabin.box(side * .49, 1.845, .60, .40, .026, .17, fabric, .012);
  for (const front of [true, false]) canopy.windPane(glazing, glass, front, 24);
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
  cabinMap(cabin,0,1.337,.915,.291,.161,graphic,headlight,'utility');
  for (const x of [-.112, 0, .112]) cabin.cylinder(x, 1.188, .918, .021, .021, .022, metal, [Math.PI / 2, 0, 0], 16);
  for (const x of [-.80, -.29, .29, .80]) {
    cabin.box(x, 1.282, .944, .154, .076, .015, rubber, .010);
    for (let i = 0; i < 4; i++) cabin.box(x, 1.255 + i * .017, .933, .12, .003, .005, metal, .001);
  }
  cupConsole(cabin,.19,.80,.29,.59,1.138,[.13,.275],dark,insert,rubber,metal);
  cabin.box(0, 1.161, -.069, .29, .077, .26, fabric, .022);
  cabin.box(0, 1.149, .442, .20, .019, .197, rubber, .012);
  for (const [x, w] of [[.44, .11], [.61, .085]] as const) cabin.box(x, .75, 1.137, w, .135, .026, metal, .005);
  cabin.beam([0, 1.922, .63], [0, 1.79, .885], .011, dark);
  cabin.box(0, 1.765, .895, .25, .075, .034, dark, .012); cabin.box(0, 1.765, .875, .22, .058, .004, metal, .003);
  cabin.beam([.52, 1.24, 1.05], [.52, 1.31, .83], .035, dark);
  const mount = new THREE.Group(); mount.name = 'pickup-steering-mount'; mount.position.set(.52, 1.33, .80); mount.rotation.x = .24; root.add(mount);
  const wheel = new VillaModelBuilder(mount, 'pickup-steering-wheel');
  trimSteeringWheel(wheel,'utility',.183,rubber,dark,metal);
  const marker = new THREE.Object3D(); marker.name = 'pickup-wheel-top-marker'; marker.position.set(0, .183, 0); wheel.root.add(marker); wheel.finish();
  const doors: { root: THREE.Group; bounds: THREE.Box3 }[] = [];
  for (const side of [1, -1]) {
    const pivot = new THREE.Group(); pivot.name = side === 1 ? 'pickup-driver-door' : 'pickup-passenger-door'; pivot.position.set(side * 1.02, 0, 1.21); pivot.userData = { animated: true, side, hinge: [side * 1.02, 0, 1.21] }; root.add(pivot);
    const door = new VillaModelBuilder(pivot, `pickup-door-${side}`);
    door.at(-side * 1.02, 0, -1.21, 0, () => {
      hull.sides(door, paint, side, -.56, 1.21); canopy.pane(door, glass, side, -.56, 1.21);
      coachLine(door, t => canopy.window(side, coachMix(-.56, 1.21, t), 0), dark, .011);
      for (const z of [-.56, 1.21]) coachLine(door, t => hull.side(side, z, .003 + .994 * t), dark, .003, 12);
      trimDoor(door,hull,side,'utility',-.54,1.19,.655,1.245,fabric,insert,dark,metal,insert);
      door.box(side * 1.036, 1.177, -.36, .017, .029, .184, dark, .008);
      doorMirror(door,side,[.981,1.35,.95],[1.13,1.442,1.016],.124,.137,.174,'utility',paint,dark,metal);
    });
    door.finish();
    doors.push({ root: pivot, bounds: new THREE.Box3(new THREE.Vector3(side === 1 ? -.16 : -.18, .43, -1.79), new THREE.Vector3(side === 1 ? .18 : .16, 1.94, .04)) });
  }
  for (const builder of [body, cabin, glazing, bed]) builder.finish();
  finishCoachPaint(root,paint,[-1.725,1.725],.41);
  const updateContact=motorContact(root,tyres,.967,1.725,2.80);
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
    if (moved) updateContact();
    for (const door of doors) door.root.rotation.y = door.root.userData.side === 1 ? -1.13 * smooth(progress) : 0;
    updateColliders(); return true;
  };
  update(0, {});
  return { colliders, update, get doorProgress() { return progress; } };
}
