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
  // Lower body split into sills, a front section under the hood and a rear
  // section under the tail, so the cabin between them is a real hollow volume
  // instead of one solid block the seats and dashboard sat inside.
  for (const side of [-1, 1]) body.box(side * .85, .88, .05, .16, .42, 4.0, paint, .04);
  body.box(0, .88, 1.58, 1.86, .42, .94, paint, .05);
  body.box(0, .88, -1.72, 1.86, .42, .46, paint, .05);
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
  // ---- Cabin interior: a luxury two-tone cockpit ----
  // Semi-aniline cognac leather with perforated centres and contrast piping, a
  // leather-wrapped dash with open-pore walnut, a curved dual-screen cockpit and
  // warm ambient strips — a full redesign of the old placeholder slab interior.
  const leather = villaMaterial(0x77563c, .82), leatherLight = villaMaterial(0x9a7c5c, .86), piping = villaMaterial(0xd8c7a4, .6);
  const dashSoft = villaMaterial(0x22262a, .7), wood = villaMaterial(0x4c3826, .55), speaker = villaMaterial(0x6b7176, .35, .6);
  const screenGlass = new THREE.MeshStandardMaterial({ color: 0x0d141a, roughness: .16, metalness: .25 });
  const screenGlow = new THREE.MeshStandardMaterial({ color: 0x16232c, emissive: 0x2c4e60, emissiveIntensity: .6, roughness: .3 });
  const ambient = new THREE.MeshStandardMaterial({ color: 0x3a2c1c, emissive: 0xffb46b, emissiveIntensity: .45, roughness: .5 });
  screenGlass.name = 'suv-screen-glass'; screenGlow.name = 'suv-screen-glow'; ambient.name = 'suv-ambient-glow';
  cabin.box(0, .30, -.25, 1.72, .06, 2.32, dashSoft, .02);
  // Deep-pile floor mats with a heel pad on the driver's side.
  for (const side of [-1, 1]) {
    cabin.box(side * .52, .335, .55, .56, .02, .56, fabric, .015);
    cabin.box(side * .52, .335, -1.3, .56, .02, .5, fabric, .015);
  }
  cabin.box(.52, .352, .68, .22, .006, .18, speaker, .004);
  // Luxury bucket seats: bolstered cushion, perforated centre, shoulder wings,
  // contrast piping and an articulated headrest, on a hard back shell and rails.
  const bucketSeat = (side: number, z: number, front: boolean) => {
    const sx = side * .52;
    cabin.box(sx, .50, z, .56, .16, .62, leather, .06);
    cabin.box(sx - .21, .545, z, .10, .21, .58, leather, .05);
    cabin.box(sx + .21, .545, z, .10, .21, .58, leather, .05);
    cabin.box(sx, .512, z + .03, .34, .155, .46, leatherLight, .05);
    cabin.box(sx, .86, z - .34, .54, .62, .13, leather, .05);
    cabin.box(sx - .205, .93, z - .33, .11, .5, .14, leather, .05);
    cabin.box(sx + .205, .93, z - .33, .11, .5, .14, leather, .05);
    cabin.box(sx, .89, z - .325, .32, .46, .12, leatherLight, .04);
    cabin.box(sx, .545, z + .30, .5, .03, .02, piping, .008);
    cabin.box(sx, 1.165, z - .36, .38, .03, .03, piping, .008);
    cabin.box(sx, 1.23, z - .36, .26, .18, .11, leather, .045);
    cabin.box(sx, 1.23, z - .328, .18, .12, .05, leatherLight, .03);
    cabin.box(sx, .86, z - .42, .5, .62, .04, dashSoft, .02);
    cabin.box(sx, .375, z, .42, .05, .52, dashSoft, .012);
    if (front) for (const dz of [-.18, .18]) cabin.box(sx, .345, z + dz, .44, .03, .05, speaker, .004);
  };
  bucketSeat(1, -.30, true); bucketSeat(-1, -.30, true);
  // Rear bench: sculpted twin outer seats with a fold-down centre armrest.
  cabin.box(0, .50, -1.26, 1.62, .16, .5, leather, .06);
  for (const side of [-1, 1]) {
    cabin.box(side * .47, .53, -1.26, .5, .19, .48, leatherLight, .05);
    cabin.box(side * .47, .85, -1.5, .52, .58, .13, leather, .05);
    cabin.box(side * .47, 1.19, -1.55, .24, .16, .11, leather, .04);
  }
  cabin.box(0, .84, -1.5, .42, .5, .11, leather, .04);
  cabin.box(0, .72, -1.44, .3, .08, .16, leatherLight, .03);
  // Leather-wrapped dash: soft top, walnut inlay, and a full-width curved cockpit
  // of two joined screens under one glass pane, plus a driver cluster hood.
  cabin.box(0, .90, .52, 1.78, .26, .34, dashSoft, .05);
  cabin.box(0, 1.015, .55, 1.76, .05, .3, dashSoft, .03);
  cabin.box(0, .985, .68, 1.7, .06, .05, wood, .015);
  cabin.box(0, 1.10, .60, 1.04, .16, .04, screenGlass, .012);
  cabin.box(-.20, 1.10, .583, .58, .12, .006, screenGlow, .002);
  cabin.box(.36, 1.10, .583, .28, .12, .006, screenGlow, .002);
  cabin.box(.52, 1.13, .56, .42, .06, .1, dashSoft, .02);
  // Slim turbine air vents and a row of milled climate toggles under the screen.
  for (const side of [-1, 1]) {
    cabin.cylinder(side * .80, .98, .685, .05, .05, .05, speaker, [Math.PI / 2, 0, 0], 16);
    cabin.cylinder(side * .80, .98, .71, .03, .03, .012, dashSoft, [Math.PI / 2, 0, 0], 12);
  }
  for (let i = 0; i < 6; i++) cabin.box(-.30 + i * .06, .935, .695, .035, .02, .012, speaker, .003);
  // Floating centre console: open-pore wood bridge, hidden cup holders, a crystal
  // drive selector and a wireless charging pad, with an ambient strip beneath.
  cabin.box(0, .52, -.10, .32, .42, .96, dashSoft, .045);
  cabin.box(0, .755, -.10, .30, .05, .9, wood, .025);
  cabin.box(0, .83, -.48, .28, .08, .42, leather, .03);
  cabin.ellipsoid(0, .80, .02, .05, .075, .05, screenGlass);
  cabin.box(0, .745, .02, .07, .05, .07, screenGlass, .015);
  cabin.box(0, .79, .28, .12, .01, .18, dashSoft, .01);
  for (const z of [.34, .46]) cabin.cylinder(0, .775, z, .042, .036, .045, dashSoft, [0, 0, 0], 14);
  cabin.box(0, .62, .36, .26, .02, .02, ambient, .004);
  cabin.box(0, .985, .70, 1.66, .012, .012, ambient, .002);
  // Pedals in the driver's footwell below the dash.
  for (const [x, w] of [[.44, .11], [.61, .08]] as const) {
    cabin.box(x, .46, .76, w, .13, .02, speaker, .004);
    cabin.box(x, .47, .745, w - .03, .10, .012, rubber, .003);
  }
  // Panoramic-roof console: mirror, SOS/light touch panel and twin reading lights.
  cabin.beam([0, 1.552, .02], [0, 1.478, .10], .012, dashSoft);
  cabin.box(0, 1.452, .115, .25, .072, .034, dashSoft, .012);
  cabin.box(0, 1.452, .098, .22, .055, .004, speaker, .002);
  cabin.box(0, 1.53, -.28, .34, .012, .1, dashSoft, .01);
  for (const side of [-1, 1]) cabin.box(side * .1, 1.522, -.28, .08, .006, .05, ambient, .002);
  const wheel = new VillaModelBuilder(root, 'suv-steering-wheel');
  // Three-spoke leather wheel with a slim hub, metal spokes and shift paddles.
  wheel.beam([.52, .84, .66], [.52, 1.03, .44], .033, dashSoft);
  wheel.geometry(new THREE.TorusGeometry(.19, .022, 10, 40), leather, [.52, 1.06, .40], [Math.PI / 2.3, 0, 0]);
  wheel.box(.52, 1.06, .40, .11, .08, .05, dashSoft, .02);
  wheel.box(.52, 1.06, .385, .05, .04, .012, speaker, .004);
  for (const x of [-.15, .15]) wheel.beam([.52 + x, 1.06, .40], [.52 + x * .16, 1.072, .40], .016, speaker);
  wheel.beam([.52, 1.045, .40], [.52, .985, .40], .016, speaker);
  for (const x of [-.12, .12]) wheel.box(.52 + x, 1.10, .435, .03, .06, .01, speaker, .002);
  wheel.finish();
  const doors: { root: THREE.Group; bounds: THREE.Box3 }[] = [];
  for (const side of [1, -1]) {
    const pivot = new THREE.Group(); pivot.name = side === 1 ? 'suv-driver-door' : 'suv-passenger-door'; pivot.position.set(side * .99, 0, 1.05); pivot.userData = { animated: true, side, hinge: [side * .99, 0, 1.05] }; root.add(pivot);
    const door = new VillaModelBuilder(pivot, `suv-door-${side}`);
    door.at(-side * .99, 0, -1.05, 0, () => {
      door.box(side * .97, .88, -.1, .08, .62, 1.5, paint, .02);
      // Luxury door card: leather insert over a walnut strip, a stitched armrest,
      // a round speaker grille, a pull handle and an ambient accent.
      door.box(side * .92, .82, -.16, .04, .44, 1.34, leather, .014);
      door.box(side * .90, 1.0, -.16, .03, .1, 1.3, wood, .012);
      door.box(side * .86, .98, -.2, .12, .07, .58, leatherLight, .018);
      door.cylinder(side * .905, .78, -.62, .07, .07, .02, speaker, [0, 0, Math.PI / 2], 18);
      door.cylinder(side * .90, .78, -.62, .045, .045, .012, dashSoft, [0, 0, Math.PI / 2], 14);
      door.box(side * .90, 1.0, .12, .05, .045, .18, dashSoft, .012);
      door.box(side * .905, .74, .28, .012, .02, .5, ambient, .002);
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
