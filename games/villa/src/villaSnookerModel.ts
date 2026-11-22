import * as THREE from 'three';
import { VILLA_SNOOKER } from './villaActivities.js';
import { villaMaterial } from './villaModel.js';
import { FittingSkin, IndexedFittingBuilder, formedTube, vessel } from './villaFittingGeometry.js';
import { fieldFrame } from './villaFurnitureForms.js';
import { baizeGrain, finishingVeneer } from './villaRecreationSurfaces.js';
import { ballContacts, billiardResin, pocketSaddle, veneerCoordinates } from './villaRecreationBilliards.js';
import {
  createVillaSnooker, getVillaSnookerTrajectory, VILLA_SNOOKER_APERTURE_RADIUS, VILLA_SNOOKER_BALL_RADIUS,
  VILLA_SNOOKER_POCKETS, type VillaSnookerSegment, type VillaSnookerState,
} from './villaSnooker.js';

export const VILLA_SNOOKER_GUIDE_HEIGHT = VILLA_SNOOKER.height + 0.007;

/** Scarfed hardwood butt and contrasting thin veneer lines. Their boundaries follow
 * each tapering splice up the shaft, rather than painting concentric colour bands. */
function snookerCueShaft() {
  const sides = 24, p: number[] = [], rgb: number[] = [], ids: number[] = [];
  const tone = new THREE.Color(), splice = (a: number) => Math.max(0, Math.cos(4 * a)) ** 1.8;
  const bands = [[-.575, .0098, 0], [-.571, .0124, 0], [-.551, .0125, 0], [-.545, .0122, 0],
    [-.50, .012, 0], [-.28, .0105, .21], [-.269, .0104, .21], [-.262, .0103, .21], [.15, .0071, 0],
    [.542, .00495, 0], [.546, .00495, 0], [.575, .00485, 0]];
  const tones = ['#282723', '#312f29', '#a89063', '#31291e', '#3a2c23', '#ae8154', '#513a2c', '#c6a875', '#d0b381', '#875e39', '#af946a'];
  for (let i = 0; i < bands.length - 1; i++) {
    const start = p.length / 3; tone.set(tones[i]);
    for (const [y, r, rise] of bands.slice(i, i + 2)) for (let j = 0; j < sides; j++) {
      const a = 2 * Math.PI * j / sides, f = splice(a), yy = y + rise * f;
      const radius = r - rise * f * .0068; p.push(radius * Math.cos(a), yy, radius * Math.sin(a)); rgb.push(tone.r, tone.g, tone.b);
    }
    for (let j = 0; j < sides; j++) { const a = start + j, b = start + (j + 1) % sides; ids.push(a, a + sides, b + sides, a, b + sides, b); }
  }
  // The rubber bumper has an actual underside when the cue is seen end-on.
  const start = p.length / 3; tone.set(tones[0]); p.push(0, -.575, 0); rgb.push(tone.r, tone.g, tone.b);
  for (let i = 0; i < sides; i++) { const a = i * 2 * Math.PI / sides; p.push(.0098 * Math.cos(a), -.575, .0098 * Math.sin(a)); rgb.push(tone.r, tone.g, tone.b); }
  for (let i = 0; i < sides; i++) ids.push(start, start + 1 + i, start + 1 + (i + 1) % sides);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(rgb, 3)); g.setIndex(ids); g.computeVertexNormals(); return g;
}

/** Scene-owned static table, separated from the room so its actual geometry can
 * be verified without a renderer. Dimensions, anchor and physics are unchanged.
 * All surfaces are batched by material; there are no external texture assets.
 */
export function createVillaSnookerTable(parent: THREE.Object3D) {
  const b = new IndexedFittingBuilder(parent, 'villa-snooker-table');
  const { center, width, length, playingWidth, playingLength, height: h } = VILLA_SNOOKER;
  b.root.position.set(center.x, center.y, center.z);
  const walnut = villaMaterial('#483326', 0.46), endGrain = villaMaterial('#35271f', 0.58);
  const grain = villaMaterial('#8b6545', 0.48), cloth = villaMaterial('#317e58', 0.97);
  const cushion = villaMaterial('#226647', 0.92), slate = villaMaterial('#45494a', 0.9);
  const leather = villaMaterial('#976445', 0.72), pocketDark = villaMaterial('#30251e', .88);
  const brass = villaMaterial('#bd9a61', 0.34, 0.48), chalk = villaMaterial('#e5e3cd', 0.95);
  walnut.map = grain.map = endGrain.map = finishingVeneer();
  cloth.map = cushion.map = baizeGrain();
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
    for (const sign of [-1, 1]) {
      const from = .107, to = (length - .2) / 2;
      b.box(x, .517, sign * (from + to) / 2, .16, .042, to - from, endGrain, .008);
    }
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

  const cushionPlan = (outline: [number, number][], nx: number, nz: number) => {
    // L-shaped rubber bonded to the rail. Only its rounded nose reaches the
    // gameplay edge, at ball-centre height; both the toe and shoulder recede.
    const points = outline.map(([x, z]) => new THREE.Vector2(x, z));
    if (THREE.ShapeUtils.area(points) < 0) points.reverse();
    const axis = points.map(p => p.x * nx + p.y * nz), min = Math.min(...axis), range = Math.max(...axis) - min;
    const skin = new FittingSkin(); let previous: number[] | undefined;
    for (const [y, setback] of [[-.011, .027], [.001, .020], [.016, .007], [.023, .001], [.0265, 0],
      [.029, .001], [.036, .010], [.042, .025], [.043, .035]]) {
      const plan = points.map((p, i) => {
        const s = setback * (1 - (axis[i] - min) / range);
        return new THREE.Vector2(p.x + nx * s, p.y + nz * s);
      });
      const ring = plan.map(p => skin.point(p.x, h + y, p.y));
      if (previous) skin.join(previous, ring);
      if (!previous || y === .043) for (const [a, c, d] of THREE.ShapeUtils.triangulateShape(plan, [])) {
        if (previous) skin.face(ring[d], ring[c], ring[a]); else skin.face(ring[a], ring[c], ring[d]);
      }
      previous = ring;
    }
    const g=skin.geometry(), pos=g.getAttribute('position'), uv=new Float32Array(pos.count*2);
    for(let i=0;i<pos.count;i++) {uv[2*i]=nx?pos.getZ(i):pos.getX(i);uv[2*i+1]=2*((nx?pos.getX(i):pos.getZ(i))+pos.getY(i));}
    g.setAttribute('uv',new THREE.BufferAttribute(uv,2));b.geometry(g,cushion);
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
    cushionPlan([[px + 0.065, 0.083], [px + 0.005, 0.13], [px + 0.003, 0.17], [px + 0.003, pz - 0.13], [px + 0.053, pz - 0.065], [1.006, pz - 0.065], [1.006, 0.083]].map(([x, z]) => [side * x, end * z]), side, 0);
    // Leather jaw ends attach to the cushion, without closing the round throat.
    b.beam([side * (px + 0.048), 0.886, end * 0.083], [side * (px + 0.011), 0.886, end * 0.125], 0.007, leather, 8);
  }
  for (const end of [-1, 1]) {
    cushionPlan([[-px + 0.073, pz + 0.073], [-px + 0.12, pz + 0.003], [px - 0.12, pz + 0.003], [px - 0.073, pz + 0.073], [px - 0.073, 1.895], [-px + 0.073, 1.895]].map(([x, z]) => [x, end * z]), 0, end);
  }
  for (const side of [-1, 1]) for (const z of [-1.35, -0.66, 0.66, 1.35]) b.cylinder(side * 1.02, 0.921, z, 0.007, 0.007, 0.002, chalk, [0, 0, 0], 10);
  // Veneered apron panels sit behind a raised moulding. The pull-down bolts
  // actually bear on the facing at the legs. No 'grain' made out of wire.
  for(const side of [-1,1]) for(const end of [-1,1]) {
    b.geometry(fieldFrame(1.70,.242,.026,.026,true),endGrain,[side*1.064,.666,end*1.015],[0,side*Math.PI/2,0]);
    b.box(side*1.066,.666,end*1.015,.008,.194,1.646,grain,0);
    for(const z of [.255,1.69]) b.cylinder(side*1.071,.667,end*z,.026,.021,.009,brass,[0,0,Math.PI/2],12);
  }
  for(const end of [-1,1]) {
    b.geometry(fieldFrame(1.46,.237,.023,.026,true),endGrain,[0,.666,end*1.979],[0,end===1?0:Math.PI,0]);
    b.box(0,.666,end*1.978,1.409,.19,.009,grain,0);
  }
  VILLA_SNOOKER_POCKETS.forEach((p, i) => {
    // Rolled hide is turned back on the INSIDE. At cloth height its opening is
    // the gameplay radius, not a tube centreline one tube radius too small.
    const mouth = VILLA_SNOOKER_APERTURE_RADIUS;
    b.geometry(vessel([[.069, -.095], [.072, -.091], [.083, -.024], [.093, -.007], [.096, -.003], [.094, .003],
      [.089, .006], [.082, .005], [mouth, 0], [.076, -.017], [.064, -.088], [.065, -.095], [.069, -.095]], 32), leather, [p.x, h, p.z]);
    // A pocket iron bridges the jaw to the walnut capping, but only on the rail
    // side: the cloth-side arc stays low enough for a ball to enter the mouth.
    const iron = new FittingSkin(), outward = Math.atan2(Math.sign(p.z), Math.sign(p.x));
    let previous: number[] | undefined;
    for (let j = 0; j <= 18; j++) {
      const a = outward + (j / 18 - .5) * Math.PI * .98, ease = Math.sin(j * Math.PI / 18);
      const shape = [[.093, .004], [.099, .010], [.107, .035], [.115, .053], [.138, .055], [.140, .061], [.133, .062],
        [.110, .060], [.101, .050], [.094, .026], [.088, .009], [.088, .005]];
      const section = shape.map(([r, y]) => iron.point(p.x + Math.cos(a) * r, h + y * (.18 + .82 * ease), p.z + Math.sin(a) * r));
      if (previous) iron.join(section, previous);
      else for (let k = 1; k < section.length - 1; k++) iron.face(section[0], section[k + 1], section[k]);
      previous = section;
      if (j === 18) for (let k = 1; k < section.length - 1; k++) iron.face(section[0], section[k], section[k + 1]);
    }
    b.geometry(iron.geometry(), brass);
    b.geometry(pocketSaddle(p.x,p.z,rx,rz),leather);
    b.geometry(pocketSaddle(p.x,p.z,rx,rz,true),brass);
    // A knotted diamond bag, not struts inside an opaque cylinder. Adjacent
    // strands meet at each node and converge into a small leather ball cradle.
    for (let rib = 0; rib < 8; rib++) for (const hand of [-1, 1]) {
      const path = [[.067, .769], [.065, .718], [.061, .662], [.056, .606], [.051, .554], [.043, .511]].map(([r, y], k) => {
        const a = (rib + hand * k / 2) * Math.PI / 4;
        return [Math.cos(a) * r, y, Math.sin(a) * r, .0027] as const;
      });
      b.geometry(formedTube(path, 5, 0, [0, 1, 0]), chalk, [p.x, 0, p.z]);
    }
    b.geometry(vessel([[0, .490], [.030, .490], [.045, .497], [.047, .508], [.045, .516], [.039, .516],
      [.034, .505], [.021, .502], [0, .502]], 18), pocketDark, [p.x, 0, p.z]);
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
  for(const mesh of b.root.children) if(mesh instanceof THREE.Mesh && [walnut,endGrain,grain].includes(mesh.material)) veneerCoordinates(mesh.geometry);
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
  const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(radius, 20, 14), billiardResin(), 22);
  balls.name = 'snooker-dynamic-balls';
  balls.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  balls.frustumCulled = false; balls.castShadow = true; balls.receiveShadow = true; root.add(balls);
  const contacts=ballContacts(balls,radius); root.add(contacts);
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
  const shaft = new THREE.Mesh(snookerCueShaft(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .53 })); cue.add(shaft);
  const tip = new THREE.Mesh(vessel([[.00485, 0], [.0050, .0025], [.0051, .007], [.0047, .009], [.0037, .0108], [0, .012]], 16),
    new THREE.MeshStandardMaterial({ color: '#568c94', roughness: .84 })); tip.position.y = .575; cue.add(tip); root.add(cue);
  const axis = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3();
  let previous = '';
  const update = (state: VillaSnookerState, active: boolean): boolean => {
    const key = `${active}/${state.aimAssist}/${state.moving}/${state.phase}/${state.aim}/${state.power}/${state.balls.map(b => `${b.id},${b.x},${b.z},${b.vx},${b.vz},${b.potted}`).join(';')}`;
    if (key === previous) return false;
    previous = key;
    contacts.count = balls.count = Math.min(22, state.balls.length);
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
