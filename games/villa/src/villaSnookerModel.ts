import * as THREE from 'three';
import { VILLA_SNOOKER } from './villaActivities.js';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import {
  createVillaSnooker, getVillaSnookerTrajectory, VILLA_SNOOKER_APERTURE_RADIUS, VILLA_SNOOKER_BALL_RADIUS,
  VILLA_SNOOKER_POCKETS, type VillaSnookerSegment, type VillaSnookerState,
} from './villaSnooker.js';

export const VILLA_SNOOKER_GUIDE_HEIGHT = VILLA_SNOOKER.height + 0.007;

/** Scene-owned static table, separated from the room so its actual geometry can
 * be verified without a renderer. Dimensions, anchor and physics are unchanged.
 * All surfaces are batched by material; there are no external texture assets.
 */
export function createVillaSnookerTable(parent: THREE.Object3D) {
  const b = new VillaModelBuilder(parent, 'villa-snooker-table');
  const { center, width, length, playingWidth, playingLength, height: h } = VILLA_SNOOKER;
  b.root.position.set(center.x, center.y, center.z);
  const walnut = villaMaterial('#483326', 0.46), endGrain = villaMaterial('#35271f', 0.58);
  const grain = villaMaterial('#604734', 0.64), cloth = villaMaterial('#197047', 0.98);
  const cushion = villaMaterial('#155b3c', 0.92), slate = villaMaterial('#45494a', 0.9);
  const leather = villaMaterial('#33271f', 0.87), pocketDark = villaMaterial('#090c0a', 1);
  const brass = villaMaterial('#968061', 0.38, 0.68), chalk = villaMaterial('#e5e3cd', 0.95);
  for (const [name, material] of Object.entries({ walnut, endGrain, grain, cloth, cushion, slate, leather, pocketDark, brass, chalk })) material.name = `snooker-${name}`;
  const px = playingWidth / 2, pz = playingLength / 2;
  const mark = (name: string, x: number, y: number, z: number, data: Record<string, unknown> = {}) => {
    const node = new THREE.Object3D(); node.name = name; node.position.set(x, y, z); node.userData = data; b.root.add(node);
  };
  const bed = new THREE.Shape();
  bed.moveTo(-0.99, -1.92); bed.lineTo(0.99, -1.92); bed.lineTo(0.99, 1.92); bed.lineTo(-0.99, 1.92); bed.closePath();
  for (const p of VILLA_SNOOKER_POCKETS) {
    const hole = new THREE.Path(); hole.absarc(p.x, -p.z, VILLA_SNOOKER_APERTURE_RADIUS, 0, Math.PI * 2, true); bed.holes.push(hole);
  }
  b.geometry(new THREE.ExtrudeGeometry(bed, { depth: 0.045, bevelEnabled: false, curveSegments: 16 }), slate, [0, h - 0.046, 0], [-Math.PI / 2, 0, 0]);
  b.geometry(new THREE.ShapeGeometry(bed, 16), cloth, [0, h, 0], [-Math.PI / 2, 0, 0]);

  // Aprons meet the slate underside; broad mortise blocks bridge legs to aprons.
  for (const x of [-0.995, 0.995]) {
    for (const z of [-1.02, 1.02]) b.box(x, 0.665, z, 0.14, 0.302, 1.82, walnut, 0.013);
    b.box(x, 0.517, 0, 0.16, 0.042, length - 0.2, endGrain, 0.009);
  }
  for (const z of [-1.91, 1.91]) {
    b.box(0, 0.665, z, 1.58, 0.302, 0.13, walnut, 0.013);
    b.box(0, 0.54, z, 1.99, 0.054, 0.13, endGrain, 0.007);
  }
  const profile = [[0.13, 0.03], [0.15, 0.08], [0.12, 0.12], [0.085, 0.19], [0.12, 0.27], [0.135, 0.31], [0.09, 0.38], [0.1, 0.44], [0.14, 0.49], [0.14, 0.67]].map(([r, y]) => new THREE.Vector2(r, y));
  for (const x of [-0.7, 0.7]) for (const z of [-1.49, 0, 1.49]) {
    b.geometry(new THREE.LatheGeometry(profile, 16), walnut, [x, 0, z]);
    b.cylinder(x, 0.023, z, 0.14, 0.155, 0.046, endGrain);
    b.cylinder(x, 0.065, z, 0.152, 0.156, 0.045, brass);
    // Middle joints fork around the pocket bag instead of filling its throat.
    for (const jointZ of z === 0 ? [-0.17, 0.17] : [z]) {
      b.box(x + Math.sign(x) * 0.075, 0.699, jointZ, 0.45, 0.23, z === 0 ? 0.12 : 0.31, walnut, 0.012);
      b.cylinder(x + Math.sign(x) * 0.225, 0.693, jointZ, 0.018, 0.018, 0.013, brass, [0, 0, Math.PI / 2], 12);
    }
    mark('snooker-connected-leg', x, 0, z, { floorContact: 0, jointToApron: true });
  }
  b.box(0, 0.28, 0, 0.12, 0.12, 3.07, walnut, 0.01);
  for (const z of [-1.49, 0, 1.49]) b.box(0, 0.28, z, 1.5, 0.12, 0.12, walnut, 0.01);
  // Cross-bearers physically support the slate, but never pass through a pocket.
  for (const z of [-1.49, 0, 1.49]) b.box(0, 0.777, z, z === 0 ? 1.54 : 1.83, 0.08, 0.14, endGrain, 0.006);

  const cushionPlan = (points: [number, number][]) => {
    const shape = new THREE.Shape(); points.forEach(([x, z], i) => i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)); shape.closePath();
    b.geometry(new THREE.ExtrudeGeometry(shape, { depth: 0.049, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: 0.003, bevelThickness: 0.003, curveSegments: 1 }), cushion, [0, h - 0.012, 0], [-Math.PI / 2, 0, 0]);
  };
  // One continuous walnut rim with a scalloped inner opening: the union of the
  // rail opening and six jaw cutouts. Unlike overlapping boxes, it cannot cap a
  // corner pocket or leave floating rail joints. Radial sampling is build-only.
  const rim = new THREE.Shape(), rx = width / 2, rz = length / 2, corner = 0.07;
  rim.moveTo(-rx + corner, -rz); rim.lineTo(rx - corner, -rz); rim.quadraticCurveTo(rx, -rz, rx, -rz + corner);
  rim.lineTo(rx, rz - corner); rim.quadraticCurveTo(rx, rz, rx - corner, rz); rim.lineTo(-rx + corner, rz);
  rim.quadraticCurveTo(-rx, rz, -rx, rz - corner); rim.lineTo(-rx, -rz + corner); rim.quadraticCurveTo(-rx, -rz, -rx + corner, -rz);
  const opening = new THREE.Path();
  for (let i = 0; i < 512; i++) {
    const a = -i * Math.PI * 2 / 512, dx = Math.cos(a), dz = Math.sin(a);
    let distance = Math.min(0.946 / Math.max(Math.abs(dx), 1e-9), 1.846 / Math.max(Math.abs(dz), 1e-9));
    for (const p of VILLA_SNOOKER_POCKETS) {
      const along = p.x * dx + p.z * dz, across = p.x * dz - p.z * dx, disc = 0.1 ** 2 - across ** 2;
      if (disc >= 0 && along > 0) distance = Math.max(distance, along + Math.sqrt(disc));
    }
    if (i) opening.lineTo(dx * distance, -dz * distance); else opening.moveTo(dx * distance, -dz * distance);
  }
  opening.closePath(); rim.holes.push(opening);
  b.geometry(new THREE.ExtrudeGeometry(rim, { depth: 0.08, bevelEnabled: false, curveSegments: 12 }), walnut, [0, 0.84, 0], [-Math.PI / 2, 0, 0]);
  // Six cushion backs penetrate that rim; shaped noses stop clear of the mouths.
  for (const side of [-1, 1]) for (const end of [-1, 1]) {
    cushionPlan([[px + 0.065, 0.083], [px + 0.005, 0.13], [px + 0.003, 0.17], [px + 0.003, pz - 0.13], [px + 0.053, pz - 0.065], [1.006, pz - 0.065], [1.006, 0.083]].map(([x, z]) => [side * x, end * z]));
    // Leather jaw ends attach to the cushion, without closing the round throat.
    b.beam([side * (px + 0.048), 0.886, end * 0.083], [side * (px + 0.011), 0.886, end * 0.125], 0.007, leather, 8);
  }
  for (const end of [-1, 1]) {
    cushionPlan([[-px + 0.073, pz + 0.073], [-px + 0.12, pz + 0.003], [px - 0.12, pz + 0.003], [px - 0.073, pz + 0.073], [px - 0.073, 1.895], [-px + 0.073, 1.895]].map(([x, z]) => [x, end * z]));
  }
  for (const side of [-1, 1]) for (const z of [-1.35, -0.66, 0.66, 1.35]) b.cylinder(side * 1.02, 0.921, z, 0.007, 0.007, 0.002, chalk, [0, 0, 0], 10);
  // Subtle authored growth lines follow the grain along rail tops and aprons.
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
    for (const end of [-1, 1]) {
      const points = [0.17, 0.52, 0.95, 1.35, 1.67].map((z, k) => new THREE.Vector3(side * (0.972 + i * 0.023 + Math.sin(k * 1.6 + i) * 0.003), 0.9205, end * z));
      b.geometry(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 14, 0.0012, 3, false), grain);
    }
    for (const end of [-1, 1]) {
      const points = [0.15, 0.55, 0.95, 1.4, 1.7].map((z, k) => new THREE.Vector3(side * 1.0655, 0.576 + i * 0.052 + Math.sin(k + i) * 0.007, end * z));
      b.geometry(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 16, 0.0018, 3, false), grain);
    }
  }
  VILLA_SNOOKER_POCKETS.forEach((p, i) => {
    b.geometry(new THREE.TorusGeometry(0.083, 0.01, 8, 28), leather, [p.x, h - 0.002, p.z], [Math.PI / 2, 0, 0]);
    // Open-topped leather throat plus a dark cup below, never a cap at cloth level.
    b.geometry(new THREE.CylinderGeometry(0.077, 0.052, 0.2, 20, 1, true), leather, [p.x, 0.75, p.z]);
    b.cylinder(p.x, 0.63, p.z, 0.052, 0.045, 0.045, pocketDark, [0, 0, 0], 18);
    for (let rib = 0; rib < 8; rib++) {
      const a = rib * Math.PI / 4;
      b.beam([p.x + Math.cos(a) * 0.075, 0.843, p.z + Math.sin(a) * 0.075], [p.x + Math.cos(a) * 0.047, 0.63, p.z + Math.sin(a) * 0.047], 0.0035, leather, 6);
    }
    mark(`snooker-pocket-${i}`, p.x, h, p.z, { apertureRadius: VILLA_SNOOKER_APERTURE_RADIUS, openCloth: true, openSlate: true });
  });
  const baulk = pz - 0.737, dRadius = 0.292;
  b.box(0, h + 0.0015, baulk, playingWidth, 0.002, 0.0035, chalk, 0);
  for (let i = 0; i < 32; i++) {
    const a = i * Math.PI / 32, c = (i + 1) * Math.PI / 32;
    b.beam([Math.cos(a) * dRadius, h + 0.002, baulk + Math.sin(a) * dRadius], [Math.cos(c) * dRadius, h + 0.002, baulk + Math.sin(c) * dRadius], 0.0017, chalk, 6);
  }
  b.collide(0, 0, 0, width, 0.92, length);
  b.root.userData = { ...VILLA_SNOOKER, finish: 'walnut', pocketCount: 6, pocketRadius: VILLA_SNOOKER_APERTURE_RADIUS, connectedLegs: 6, clothHeight: h, ballCenterHeight: h + VILLA_SNOOKER_BALL_RADIUS, grain: 'batched original geometry' };
  b.finish();
  return { root: b.root, colliders: b.colliders.map(c => ({ minX: c.minX + center.x, maxX: c.maxX + center.x, minZ: c.minZ + center.z, maxZ: c.maxZ + center.z, minY: c.minY + center.y, maxY: c.maxY + center.y })) };
}

/** Dynamic balls/cue and three small bounded line batches. Parent scene owns disposal. */
export function createVillaSnookerModel(parent: THREE.Object3D): { update(state: VillaSnookerState, active: boolean): boolean } {
  const root = new THREE.Group();
  root.name = 'villa-playable-snooker';
  root.position.set(VILLA_SNOOKER.center.x, VILLA_SNOOKER.center.y, VILLA_SNOOKER.center.z);
  parent.add(root);
  const radius = VILLA_SNOOKER_BALL_RADIUS;
  const height = VILLA_SNOOKER.height + radius;
  const colors = { white: '#fff9e6', red: '#b51f24', yellow: '#e9bd26', green: '#208844', brown: '#714028', blue: '#255bbb', pink: '#e99aa9', black: '#101113' };
  const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(radius, 20, 14), new THREE.MeshStandardMaterial({ roughness: 0.17, metalness: 0.02 }), 22);
  balls.name = 'snooker-dynamic-balls';
  balls.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  balls.frustumCulled = false; balls.castShadow = true; root.add(balls);
  const transform = new THREE.Object3D(), color = new THREE.Color();
  const lineBatch = (name: string, capacity: number, tint: string, dashed = false) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(capacity * 6), 3).setUsage(THREE.DynamicDrawUsage));
    if (dashed) geometry.setAttribute('lineDistance', new THREE.BufferAttribute(new Float32Array(capacity * 2), 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0, 0);
    const options = { color: tint, transparent: true, opacity: 0.72, depthWrite: false };
    const material = dashed ? new THREE.LineDashedMaterial({ ...options, dashSize: 0.04, gapSize: 0.025 }) : new THREE.LineBasicMaterial(options);
    const lines = new THREE.LineSegments(geometry, material); lines.name = name; lines.frustumCulled = false; lines.visible = false; root.add(lines);
    return lines;
  };
  const guide = lineBatch('snooker-world-aim-guide', 1, '#f4efcb', true);
  const ghost = lineBatch('snooker-ghost-contact', 24, '#f4efcb');
  const projected = lineBatch('snooker-projected-path', 2, '#cbbf7e', true);
  const setSegments = (lines: THREE.LineSegments, segments: VillaSnookerSegment[]) => {
    const position = lines.geometry.getAttribute('position') as THREE.BufferAttribute;
    const distances = lines.geometry.getAttribute('lineDistance') as THREE.BufferAttribute | undefined;
    segments.forEach((s, i) => {
      position.setXYZ(i * 2, s.from.x, VILLA_SNOOKER_GUIDE_HEIGHT, s.from.z); position.setXYZ(i * 2 + 1, s.to.x, VILLA_SNOOKER_GUIDE_HEIGHT, s.to.z);
      if (distances) { distances.setX(i * 2, 0); distances.setX(i * 2 + 1, Math.hypot(s.to.x - s.from.x, s.to.z - s.from.z)); }
    });
    lines.geometry.setDrawRange(0, segments.length * 2); position.needsUpdate = true;
    if (distances) distances.needsUpdate = true;
    lines.visible = segments.length > 0;
  };
  const cue = new THREE.Group(); cue.name = 'snooker-active-cue';
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0048, 0.012, 1.15, 10), new THREE.MeshStandardMaterial({ color: '#c6a875', roughness: 0.55 })); cue.add(shaft);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.012, 10), new THREE.MeshStandardMaterial({ color: '#568c94', roughness: 0.8 })); tip.position.y = 0.581; cue.add(tip); root.add(cue);
  const axis = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3();
  let previous = '';
  const update = (state: VillaSnookerState, active: boolean): boolean => {
    const key = `${active}/${state.aimAssist}/${state.moving}/${state.phase}/${state.aim}/${state.power}/${state.balls.map(b => `${b.id},${b.x},${b.z},${b.vx},${b.vz},${b.potted}`).join(';')}`;
    if (key === previous) return false;
    previous = key;
    balls.count = Math.min(22, state.balls.length);
    state.balls.slice(0, 22).forEach((b, i) => {
      const valid = Number.isFinite(b.x) && Number.isFinite(b.z);
      transform.position.set(valid ? b.x : 0, height, valid ? b.z : 0); transform.scale.setScalar(b.potted || !valid ? 0 : 1); transform.updateMatrix();
      balls.setMatrixAt(i, transform.matrix); balls.setColorAt(i, color.set(colors[b.kind]));
    });
    balls.instanceMatrix.needsUpdate = true; if (balls.instanceColor) balls.instanceColor.needsUpdate = true;
    const white = state.balls.find(b => b.kind === 'white');
    const trajectory = getVillaSnookerTrajectory(state, active);
    setSegments(guide, trajectory ? [trajectory.cue] : []);
    setSegments(projected, trajectory ? [trajectory.object, trajectory.bank].filter((s): s is VillaSnookerSegment => !!s) : []);
    const circle: VillaSnookerSegment[] = [];
    if (trajectory?.ghost) for (let i = 0; i < 24; i++) {
      const a = i * Math.PI * 2 / 24, c = (i + 1) * Math.PI * 2 / 24, p = trajectory.ghost;
      circle.push({ from: { x: p.x + Math.cos(a) * radius, z: p.z + Math.sin(a) * radius }, to: { x: p.x + Math.cos(c) * radius, z: p.z + Math.sin(c) * radius } });
    }
    setSegments(ghost, circle);
    // Assistance is optional; switching it off must not remove the physical cue.
    cue.visible = active && !state.moving && state.phase === 'aiming' && !!white && !white.potted && [white.x, white.z, state.aim].every(Number.isFinite);
    if (cue.visible && white) {
      const dx = Math.sin(state.aim), dz = -Math.cos(state.aim);
      const power = Number.isFinite(state.power) ? Math.max(0, Math.min(1, state.power)) : 0;
      const pullback = 0.64 + power * 0.18;
      cue.position.set(white.x - dx * pullback, height + 0.025, white.z - dz * pullback);
      direction.set(dx, -0.035, dz).normalize(); cue.quaternion.setFromUnitVectors(axis, direction);
    }
    return true;
  };
  update(createVillaSnooker(), false);
  return { update };
}
