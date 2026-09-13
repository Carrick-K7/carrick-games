import * as THREE from 'three';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import { VILLA_RACING, type VillaActivityState, type VillaScreenSource } from './villaActivities.js';
import type { VillaCollider } from './villaWorld.js';
import { createVillaRace, drawVillaRace, VILLA_RACE_WHEEL_TURN, type VillaRaceState } from './villaRacing.js';
import { registerVillaSeatCollider } from './villaSeating.js';

type V3 = [number, number, number];

/** Fixed shaft tilt and independent wheel-local Z spin. The driver looks +Z,
 * so world -X projects to screen right: POSITIVE local Z is driver-clockwise.
 * Exported for projection tests using the same authored geometry as the rig.
 */
export function createVillaRallyWheel(parent: THREE.Object3D, rubber = villaMaterial('#20272b', .87), steel = villaMaterial('#697782', .28, .8), markerMaterial = villaMaterial('#e7c95d', .5)) {
  const mount = new THREE.Group(); mount.name = 'racingWheelShaft';
  mount.position.set(VILLA_RACING.seat.x, 1.045, 6.825); mount.rotation.x = .25; parent.add(mount);
  const shaft = new VillaModelBuilder(mount, 'fixedRacingShaft');
  shaft.cylinder(0, 0, .12, .025, .025, .24, steel, [Math.PI / 2, 0, 0]); shaft.finish();
  const wheel = new VillaModelBuilder(mount, 'interactiveRacingWheel');
  wheel.geometry(new THREE.TorusGeometry(.178, .019, 10, 48), rubber);
  wheel.cylinder(0, 0, -.007, .047, .047, .048, rubber, [Math.PI / 2, 0, 0], 24);
  // Flat, tapered three spokes, rather than bars through the whole wheel.
  for (const a of [0, Math.PI, Math.PI * 1.5]) {
    const shape = new THREE.Shape(); shape.moveTo(.035, -.025); shape.lineTo(.153, -.014);
    shape.lineTo(.153, .014); shape.lineTo(.035, .025); shape.closePath();
    wheel.geometry(new THREE.ExtrudeGeometry(shape, { depth: .012, bevelEnabled: false }), steel, [0, 0, -.014], [0, 0, a]);
  }
  wheel.box(0, .178, 0, .025, .031, .041, markerMaterial, .003);
  const marker = new THREE.Object3D(); marker.name = 'racingWheelTopMarker'; marker.position.set(0, .178, -.022); wheel.root.add(marker);
  for (const side of [-1, 1]) {
    wheel.box(side * .105, .012, .044, .038, .102, .012, steel, .006);
    for (const x of [.071, .112]) wheel.cylinder(side * x, 0, -.025, .008, .008, .009, markerMaterial, [Math.PI / 2, 0, 0], 10);
  }
  wheel.finish();
  mount.traverse(node => { if (node instanceof THREE.Mesh) node.castShadow = false; });
  return { mount, spin: wheel.root, marker, setSteer(steer: number) {
    wheel.root.rotation.z = (Number.isFinite(steer) ? Math.max(-1, Math.min(1, steer)) : 0) * VILLA_RACE_WHEEL_TURN;
  } };
}

/** One original collector-sculpture design. `base` selects its tinted display
 *  plinth, `hairVolume` adds swept twin-tails and `prop` a held instrument. */
export interface VillaAnimeFigure {
  name: string; age: number;
  hair: 'chestnut' | 'silver' | 'copper' | 'plum' | 'ink' | 'gold';
  hairstyle: string;
  outfit: 'sage' | 'navy' | 'rose' | 'cream' | 'ochre';
  clothing: string; pose: string;
  base?: 'tealBase' | 'blueBase' | 'plumBase';
  hairVolume?: 'twin-tails';
  prop?: 'flute';
}
export const VILLA_ANIME_FIGURES: readonly VillaAnimeFigure[] = [
  { name: 'Hazel / seed curator', age: 28, hair: 'chestnut', hairstyle: 'layered bob', outfit: 'sage', clothing: 'ankle dress and cardigan', pose: 'contrapposto', base: 'tealBase', hairVolume: 'twin-tails' },
  { name: 'Alba / observatory guide', age: 27, hair: 'silver', hairstyle: 'side ponytail', outfit: 'navy', clothing: 'long coat and trousers', pose: 'greeting hand', base: 'blueBase' },
  { name: 'Poppy / botanical author', age: 31, hair: 'copper', hairstyle: 'low braid', outfit: 'rose', clothing: 'ankle dress and cardigan', pose: 'holding book', base: 'plumBase', prop: 'flute' },
  { name: 'Violet / city archivist', age: 29, hair: 'plum', hairstyle: 'swept bob', outfit: 'cream', clothing: 'long coat and trousers', pose: 'shoulder bag', base: 'plumBase' },
  { name: 'Maren / landscape architect', age: 32, hair: 'ink', hairstyle: 'swept bun', outfit: 'navy', clothing: 'high-collar dress and cape', pose: 'flowing cape', base: 'blueBase', hairVolume: 'twin-tails' },
  { name: 'Saffron / morning baker', age: 26, hair: 'gold', hairstyle: 'soft waves', outfit: 'ochre', clothing: 'ankle dress and cardigan', pose: 'holding book', base: 'tealBase' },
  { name: 'Fern / kite artisan', age: 30, hair: 'chestnut', hairstyle: 'short crop', outfit: 'cream', clothing: 'layered jacket and trousers', pose: 'greeting hand', base: 'tealBase' },
  { name: 'Rosie / garden designer', age: 28, hair: 'plum', hairstyle: 'long layers', outfit: 'sage', clothing: 'high-collar flowing dress', pose: 'flowing dress', base: 'blueBase', hairVolume: 'twin-tails' },
  { name: 'Dove / mural painter', age: 25, hair: 'silver', hairstyle: 'wind-swept layers', outfit: 'rose', clothing: 'long coat and trousers', pose: 'shoulder bag', base: 'plumBase' },
];

/** Original adult anime collector sculptures, not licensed characters or chibi.
 * Research: https://bishoujoseries.com/about/ (Japanese-styled character statues),
 * https://www.goodsmile.com/en/product/1139934/DR. (original scale figure), and
 * https://www.goodsmile.com/en/product/1145953/Saori%2BDress%2B1%2B7%2BScale%2BFigure
 * (sculpted dress + supplied stand). Only general collector presentation is used;
 * no artwork, character designs, downloaded images, textures or meshes are copied.
 * A shared batch per material keeps nine detailed figures and the case inexpensive.
 */
export function createVillaAnimeFigureDisplay(parent: THREE.Object3D, sharedLight?: THREE.MeshStandardMaterial) {
  const b = new VillaModelBuilder(parent, 'originalAnimeFigureWall');
  b.root.position.set(2.32, 0, 6.45); b.root.rotation.y = Math.PI / 2;
  const palette = {
    walnut: '#584131', ink: '#242932', cream: '#ebe6db', skin: '#f2d2bb', blush: '#b87e79',
    sage: '#466759', navy: '#3f536f', rose: '#a87383', ochre: '#a4804e',
    chestnut: '#554038', copper: '#98644e', silver: '#bdc7ce', plum: '#695971', gold: '#c1a373', brass: '#ad926c',
    tealBase: '#5fc8c2', blueBase: '#7fb2e8', plumBase: '#a98fc4',
  };
  const materials = Object.fromEntries(Object.entries(palette).map(([key, hex]) => {
    const material = villaMaterial(hex, key === 'brass' ? 0.4 : 0.65, key === 'brass' ? 0.5 : 0);
    material.name = `anime-display-${key}`; return [key, material];
  })) as Record<keyof typeof palette, THREE.MeshStandardMaterial>;
  const glass = new THREE.MeshPhysicalMaterial({ color: '#d6faff', transparent: true, opacity: 0.13, roughness: 0.07, metalness: 0.04, depthWrite: false, side: THREE.DoubleSide });
  glass.name = 'anime-display-glass';
  const light = sharedLight ?? new THREE.MeshStandardMaterial({ color: '#ffe4b2', emissive: '#ffc575', emissiveIntensity: 0.8 });
  const { walnut, ink, cream, skin, blush, brass } = materials;
  type Ring = { y: number; x?: number; z?: number; rx: number; rz: number; pleat?: number; lift?: number };
  // Closed sculpted lofts give tapered jaws, fitted opaque layers and real drapery,
  // rather than scaling a sphere for every body part.
  const loft = (rings: Ring[], material: THREE.Material, segments = 18) => {
    const positions: number[] = [], indices: number[] = [];
    for (const r of rings) for (let i = 0; i < segments; i++) {
      const a = i * Math.PI * 2 / segments, pleat = 1 + (r.pleat ?? 0) * Math.cos(a * 6);
      positions.push((r.x ?? 0) + Math.cos(a) * r.rx * pleat, r.y + (r.lift ?? 0) * Math.sin(a + 0.8), (r.z ?? 0) + Math.sin(a) * r.rz * pleat);
    }
    for (let row = 0; row < rings.length - 1; row++) for (let i = 0; i < segments; i++) {
      const a = row * segments + i, next = row * segments + (i + 1) % segments, upper = a + segments;
      indices.push(a, upper, next, next, upper, next + segments);
    }
    for (const row of [0, rings.length - 1]) {
      const r = rings[row], center = positions.length / 3; positions.push(r.x ?? 0, r.y, r.z ?? 0);
      for (let i = 0; i < segments; i++) {
        const a = row * segments + i, next = row * segments + (i + 1) % segments;
        indices.push(...(row === 0 ? [center, a, next] : [center, next, a]));
      }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals(); b.geometry(geometry, material);
  };
  // Tapered, curved hair ribbons have attached roots and pointed strand ends.
  const lock = (points: V3[], width: number, material: THREE.Material) => {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), positions: number[] = [], indices: number[] = [];
    for (let row = 0; row <= 9; row++) {
      const t = row / 9, p = curve.getPoint(t), tangent = curve.getTangent(t).normalize();
      const side = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 0, 1)).normalize(), back = new THREE.Vector3().crossVectors(tangent, side).normalize();
      const taper = (0.55 + 0.45 * Math.sin(t * Math.PI)) * (1 - t * 0.97);
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3, vertex = p.clone().addScaledVector(side, Math.cos(a) * width * taper).addScaledVector(back, Math.sin(a) * 0.007 * taper);
        positions.push(vertex.x, vertex.y, vertex.z);
        if (row < 9) { const v = row * 6 + i, next = row * 6 + (i + 1) % 6; indices.push(v, next, v + 6, next, next + 6, v + 6); }
      }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals(); b.geometry(geometry, material);
  };
  const figureNames: string[] = [];
  VILLA_ANIME_FIGURES.forEach((design, index) => {
    const x = (index % 3 - 1) * 1.22, shelfY = [0.0535, 0.8685, 1.6885][Math.floor(index / 3)];
    const outfit = materials[design.outfit], hair = materials[design.hair], trousers = design.clothing.includes('trousers');
    const sway = index % 2 ? -0.011 : 0.011, headX = -sway * 0.45;
    b.at(x, shelfY, -0.006, 0, () => {
      b.cylinder(0, 0.017, 0, 0.163, 0.163, 0.034, walnut, [0, 0, 0], 28);
      b.geometry(new THREE.TorusGeometry(0.151, 0.0025, 5, 30), brass, [0, 0.032, 0], [Math.PI / 2, 0, 0]);
      // Contrapposto: one straight supporting leg, the other knee relaxed. Opaque
      // tights/trousers enter closed boots; BOTH soles touch the display base.
      for (const side of [-1, 1]) {
        const ankle: V3 = [side * 0.04 + (side < 0 ? -0.012 : 0), 0.085, side < 0 ? 0.025 : 0];
        const knee: V3 = [side * 0.033 + sway, 0.22, side < 0 ? 0.018 : 0];
        b.beam([side * 0.032 + sway, 0.34, 0], knee, trousers ? 0.022 : 0.018, trousers ? outfit : ink, 12);
        b.beam(knee, ankle, trousers ? 0.02 : 0.015, trousers ? outfit : ink, 12);
        b.ellipsoid(...knee, trousers ? 0.022 : 0.018, 0.023, trousers ? 0.021 : 0.018, trousers ? outfit : ink);
        b.box(ankle[0], 0.037, ankle[2] + 0.021, 0.051, 0.006, 0.077, ink, 0.002);
        b.ellipsoid(ankle[0], 0.053, ankle[2] + 0.017, 0.026, 0.019, 0.04, ink);
        loft([{ x: ankle[0], y: 0.054, z: ankle[2], rx: 0.022, rz: 0.027 }, { x: ankle[0], y: 0.089, z: ankle[2], rx: 0.023, rz: 0.022 }, { x: ankle[0], y: 0.143, z: ankle[2], rx: 0.022, rz: 0.018 }], ink, 12);
        b.box(ankle[0] + side * 0.022, 0.127, ankle[2], 0.004, 0.011, 0.014, brass, 0.001);
      }
      const flowing = design.pose === 'flowing dress' || design.pose === 'flowing cape';
      if (!trousers || design.clothing.includes('coat')) {
        loft([
          { y: trousers ? 0.21 : 0.137, x: flowing ? 0.023 : 0, z: flowing ? -0.006 : 0, rx: flowing ? 0.125 : trousers ? 0.083 : 0.097, rz: flowing ? 0.071 : 0.056, pleat: 0.07, lift: flowing ? 0.014 : 0.004 },
          { y: 0.265, x: sway * 0.5, rx: 0.077, rz: 0.047, pleat: 0.045 },
          { y: 0.335, x: sway, rx: 0.055, rz: 0.037, pleat: 0.02 },
          { y: 0.388, x: sway, rx: 0.038, rz: 0.03 },
        ], outfit, 24);
      }
      loft([{ y: 0.329, x: sway, rx: 0.052, rz: 0.037 }, { y: 0.386, x: sway, rx: 0.039, rz: 0.03 }, { y: 0.456, rx: 0.055, rz: 0.035 }, { y: 0.495, rx: 0.064, rz: 0.03 }, { y: 0.518, rx: 0.027, rz: 0.024 }], outfit);
      b.cylinder(0, 0.519, 0, 0.022, 0.028, 0.023, cream, [0, 0, 0], 14);
      b.cylinder(headX, 0.543, 0, 0.014, 0.017, 0.041, skin, [0, 0, 0], 12);
      // Lapels, sewn front edges and small buttons stay attached to the opaque coat.
      for (const side of [-1, 1]) b.beam([side * 0.022, 0.503, 0.024], [side * 0.013 + sway, 0.454, 0.034], 0.005, cream, 6);
      for (const y of [0.413, 0.44, 0.467]) b.ellipsoid(sway * 0.5, y, 0.036, 0.0028, 0.0028, 0.002, brass);
      if (design.pose === 'flowing cape') {
        // A closed, scalloped back cape meets both shoulders; its hem curves out.
        loft([{ y: 0.242, x: 0.018, z: -0.068, rx: 0.127, rz: 0.029, pleat: 0.08, lift: 0.014 }, { y: 0.365, x: 0.008, z: -0.047, rx: 0.093, rz: 0.019, pleat: 0.04 }, { y: 0.493, z: -0.021, rx: 0.065, rz: 0.016 }, { y: 0.507, z: -0.012, rx: 0.042, rz: 0.017 }], cream, 24);
      }
      for (const side of [-1, 1]) {
        const waving = design.pose === 'greeting hand' && side === 1;
        const book = design.pose === 'holding book';
        const elbow: V3 = [side * (waving ? 0.104 : 0.087), waving ? 0.456 : 0.407, book ? 0.031 : 0.004];
        const wrist: V3 = waving ? [0.117, 0.568, 0.024] : book ? [side * 0.049, 0.373, 0.079] : design.pose === 'shoulder bag' && side === 1 ? [0.108, 0.335, 0.022] : [side * (flowing ? 0.11 : 0.069), flowing ? 0.363 : 0.347, 0.035];
        b.beam([side * 0.058, 0.49, 0], elbow, 0.02, outfit, 12);
        b.ellipsoid(...elbow, 0.019, 0.021, 0.019, outfit);
        b.beam(elbow, wrist, 0.0155, outfit, 12);
        const handY = wrist[1] + (waving ? 0.01 : -0.007);
        b.ellipsoid(wrist[0], handY, wrist[2], 0.01, 0.015, 0.009, skin);
        b.ellipsoid(wrist[0] - side * 0.009, handY - 0.002, wrist[2] + 0.004, 0.004, 0.008, 0.004, skin);
        if (waving) for (let finger = 0; finger < 3; finger++) b.beam([wrist[0] - 0.006 + finger * 0.005, handY + 0.009, wrist[2]], [wrist[0] - 0.009 + finger * 0.008, handY + 0.024 - Math.abs(finger - 1) * 0.003, wrist[2]], 0.0023, skin, 6);
      }
      // Tapered chin and restrained almond eyes. Even INCLUDING the hair crown,
      // this is a 5.2-head adult silhouette, not a one-third-height toy head.
      loft([{ y: 0.56, x: headX, z: 0.008, rx: 0.008, rz: 0.009 }, { y: 0.572, x: headX, z: 0.008, rx: 0.023, rz: 0.02 }, { y: 0.59, x: headX, z: 0.008, rx: 0.035, rz: 0.028 }, { y: 0.617, x: headX, z: 0.008, rx: 0.041, rz: 0.035 }, { y: 0.641, x: headX, z: 0.006, rx: 0.04, rz: 0.033 }, { y: 0.666, x: headX, rx: 0.026, rz: 0.022 }, { y: 0.673, x: headX, rx: 0.007, rz: 0.008 }], skin, 20);
      b.ellipsoid(headX, 0.644, -0.011, 0.047, 0.04, 0.038, hair);
      for (const side of [-1, 1]) {
        b.ellipsoid(headX + side * 0.04, 0.605, 0.003, 0.007, 0.012, 0.009, skin);
        b.ellipsoid(headX + side * 0.018, 0.615, 0.038, 0.0105, 0.0057, 0.0036, cream);
        b.ellipsoid(headX + side * 0.018, 0.615, 0.041, 0.004, 0.005, 0.0015, outfit);
        b.ellipsoid(headX + side * 0.018, 0.615, 0.0423, 0.002, 0.004, 0.001, ink);
        b.ellipsoid(headX + side * 0.019, 0.617, 0.0432, 0.0012, 0.0015, 0.0007, cream);
        b.beam([headX + side * 0.009, 0.62, 0.04], [headX + side * 0.028, 0.619, 0.038], 0.0016, ink, 5);
        b.beam([headX + side * 0.011, 0.631, 0.037], [headX + side * 0.028, 0.63, 0.034], 0.0018, hair, 5);
      }
      b.ellipsoid(headX, 0.598, 0.042, 0.0032, 0.0045, 0.004, skin);
      b.beam([headX - 0.005, 0.578, 0.0315], [headX + 0.004, 0.578, 0.0315], 0.0012, blush, 6);
      // Four asymmetrical pointed bangs attach to the cap; side locks overlap roots.
      for (let i = 0; i < 4; i++) {
        const xx = headX - 0.031 + i * 0.019;
        lock([[xx - 0.006, 0.676, 0.007], [xx, 0.659, 0.032], [xx + 0.012, 0.636 - (i % 2) * 0.008, 0.04]], 0.019, hair);
      }
      const long = /long|waves|wind/.test(design.hairstyle), bob = design.hairstyle.includes('bob');
      for (const side of [-1, 1]) for (let layer = 0; layer < (long ? 3 : 2); layer++) {
        const endY = long ? 0.467 + layer * 0.028 : bob ? 0.561 + layer * 0.01 : 0.588 + layer * 0.015;
        const wind = design.hairstyle.startsWith('wind') ? 0.024 : 0;
        lock([[headX + side * 0.033, 0.661, -0.01 - layer * 0.011], [headX + side * 0.046, 0.606, -0.001 - layer * 0.011], [headX + side * (long ? 0.057 : 0.044) + wind, endY + 0.031, -0.016 - layer * 0.01], [headX + side * 0.042 + wind, endY, -0.013 - layer * 0.01]], 0.019, hair);
      }
      if (design.hairstyle === 'side ponytail') {
        b.ellipsoid(headX + 0.037, 0.66, -0.035, 0.018, 0.018, 0.02, hair);
        for (let i = 0; i < 3; i++) lock([[headX + 0.04, 0.66, -0.035], [headX + 0.072 + i * 0.004, 0.623, -0.041], [headX + 0.085, 0.558, -0.045 - i * 0.009], [headX + 0.061, 0.524 + i * 0.009, -0.047]], 0.021, hair);
        b.box(headX + 0.055, 0.647, -0.025, 0.018, 0.01, 0.008, outfit, 0.002);
      }
      // Collector styling: a tinted display base, a ruffled skirt tier with a bow,
      // detached sleeve cuffs and the swept hair volume that reads as a scale
      // figure rather than a mannequin. All original geometry and colour.
      const baseMat = design.base ?? 'tealBase';
      b.cylinder(0, 0.008, 0, 0.168, 0.168, 0.016, materials[baseMat], [0, 0, 0], 6);
      b.geometry(new THREE.TorusGeometry(0.156, 0.004, 5, 6), materials[baseMat], [0, 0.02, 0], [Math.PI / 2, 0, 0]);
      lock([[0.052, 0.31, 0.03], [0.082, 0.262, 0.028], [0.07, 0.21, 0.02]], 0.019, hair);
      lock([[-0.052, 0.31, 0.03], [-0.082, 0.262, 0.028], [-0.07, 0.21, 0.02]], 0.019, hair);
      // Frilled skirt tier with a bow at the waist, over the dress only.
      if (!trousers) {
        loft([
          { y: 0.322, rx: 0.063, rz: 0.049, pleat: 0.05 },
          { y: 0.287, x: sway, rx: 0.093, rz: 0.069, pleat: 0.09, lift: 0.006 },
          { y: 0.251, x: sway, rx: 0.105, rz: 0.077, pleat: 0.115, lift: 0.011 },
        ], materials.cream, 16);
        b.ellipsoid(sway, 0.326, 0.037, 0.016, 0.012, 0.008, materials.rose);
        for (const side of [-1, 1]) b.ellipsoid(sway + side * 0.02, 0.325, 0.033, 0.014, 0.01, 0.006, materials.rose);
        b.ellipsoid(sway, 0.325, 0.031, 0.006, 0.006, 0.005, materials.rose);
      }
      // Detached sleeve cuffs, the signature anime arm treatment.
      for (const side of [-1, 1]) b.cylinder(side * 0.062, 0.452, 0, 0.026, 0.022, 0.03, materials.cream, undefined, 10);
      // Twin-tails: the swept volume that makes a scale figure read at a glance.
      if (design.hairVolume === 'twin-tails') for (const side of [-1, 1]) {
        b.ellipsoid(headX + side * 0.041, 0.664, -0.026, 0.02, 0.02, 0.022, hair);
        for (let i = 0; i < 3; i++) lock([
          [headX + side * 0.045, 0.668, -0.028],
          [headX + side * (0.074 + i * 0.005), 0.626, -0.032],
          [headX + side * (0.088 + i * 0.007), 0.542 - i * 0.02, -0.036],
          [headX + side * (0.06 + i * 0.013), 0.45 - i * 0.028, -0.032],
        ], 0.024, hair);
        b.box(headX + side * 0.056, 0.652, -0.03, 0.021, 0.011, 0.01, materials.rose, 0.002);
      }
      // A held instrument, as on the reference figure, kept as pure display geometry.
      if (design.prop === 'flute') {
        b.cylinder(0.045, 0.372, 0.082, 0.006, 0.006, 0.19, materials.brass, [0, 0, Math.PI / 2.35], 10);
        for (const dz of [-0.03, 0.045]) b.ellipsoid(0.045 + dz, 0.375, 0.083, 0.007, 0.007, 0.005, materials.ink);
      }
      if (design.hairstyle === 'low braid') {
        for (let i = 0; i < 3; i++) lock([[headX - 0.028, 0.635, -0.036], [headX - 0.046 + Math.sin(i * 2) * 0.008, 0.565, -0.026], [headX - 0.05 + Math.cos(i * 2) * 0.008, 0.504, -0.014], [headX - 0.046, 0.473, -0.011]], 0.018, hair);
        b.box(headX - 0.046, 0.487, -0.007, 0.024, 0.009, 0.012, outfit, 0.002);
      }
      if (design.hairstyle === 'swept bun') {
        b.ellipsoid(headX - 0.018, 0.645, -0.049, 0.029, 0.028, 0.022, hair);
        for (let i = 0; i < 3; i++) lock([[headX + 0.025, 0.668, -0.023], [headX - 0.013, 0.671 - i * 0.006, -0.055], [headX - 0.037, 0.63, -0.049]], 0.009, hair);
      }
      if (design.pose === 'holding book') {
        b.box(0, 0.372, 0.084, 0.094, 0.095, 0.02, walnut, 0.002);
        b.box(0, 0.372, 0.089, 0.083, 0.083, 0.015, cream, 0.001);
        b.box(-0.046, 0.372, 0.084, 0.009, 0.095, 0.023, outfit, 0.002);
        b.box(0.022, 0.326, 0.095, 0.006, 0.018, 0.002, outfit, 0);
      }
      if (design.pose === 'shoulder bag') {
        b.box(0.108, 0.282, 0.025, 0.068, 0.079, 0.037, walnut, 0.008);
        b.box(0.108, 0.3, 0.046, 0.058, 0.027, 0.008, outfit, 0.004);
        b.beam([0.085, 0.319, 0.025], [0.092, 0.339, 0.025], 0.0035, walnut, 6);
        b.beam([0.092, 0.339, 0.025], [0.123, 0.335, 0.025], 0.0035, walnut, 6);
        b.beam([0.123, 0.335, 0.025], [0.13, 0.319, 0.025], 0.0035, walnut, 6);
        b.beam([-0.039, 0.495, 0.017], [0.071, 0.352, 0.04], 0.003, walnut, 6);
        b.beam([0.071, 0.352, 0.04], [0.092, 0.32, 0.025], 0.003, walnut, 6);
      }
      if (design.pose === 'flowing dress' || design.pose === 'contrapposto') {
        const hx = design.pose === 'flowing dress' ? -0.11 : -0.069, hy = design.pose === 'flowing dress' ? 0.36 : 0.344;
        b.beam([hx, hy - 0.016, 0.037], [hx + 0.009, hy + 0.05, 0.037], 0.002, materials.sage, 6);
        for (let petal = 0; petal < 5; petal++) {
          const a = petal * Math.PI * 2 / 5;
          b.ellipsoid(hx + 0.009 + Math.cos(a) * 0.008, hy + 0.05 + Math.sin(a) * 0.008, 0.037, 0.006, 0.007, 0.003, cream);
        }
      }
    });
    figureNames.push(design.name);
    const marker = new THREE.Object3D(); marker.name = `originalAnimeFigure-${index}`; marker.position.set(x, shelfY, -0.006);
    marker.userData = { character: design.name, characterAge: design.age, style: 'adult anime bishoujo', authored3D: true, originalDesigns: true, modestClothing: true, hairstyle: design.hairstyle, clothing: design.clothing, pose: design.pose, bodyHeight: 0.65, headHeight: 0.124, headsTall: 0.65 / 0.124, baseHeight: 0.034, soleHeight: 0.034, baseOnShelf: true };
    b.root.add(marker);
  });
  b.box(0, 1.27, -0.207, 3.7, 2.5, 0.045, walnut);
  b.box(0, 1.27, -0.18, 3.6, 2.4, 0.015, ink);
  for (const x of [-1.825, 1.825]) b.box(x, 1.27, 0, 0.05, 2.5, 0.48, walnut);
  for (const y of [0.035, 0.85, 1.67, 2.515]) b.box(0, y, 0, 3.7, 0.037, 0.48, walnut);
  for (const x of [-0.61, 0.61]) b.box(x, 1.27, 0, 0.025, 2.46, 0.44, walnut);
  for (const y of [0.81, 1.63, 2.47]) b.box(0, y, -0.135, 3.58, 0.015, 0.018, light, 0.002);
  for (let i = 0; i < 3; i++) b.box((i - 1) * 1.22, 1.275, 0.241, 1.19, 2.43, 0.006, glass, 0);
  b.root.userData = { figureNames, compartments: 9, variants: 9, originalDesigns: true, adultFigures: true, modestClothing: true, facing: '+X', frontMaxX: 2.564, proportions: '5.2 heads including hair', hairstyles: 'shaped tapered strands', lights: 'shared display switch' };
  // Retain the old named cabinet anchor for existing scene integrations; it is
  // non-rendering metadata only and no chibi geometry remains in the case.
  const legacy = new THREE.Object3D(); legacy.name = 'originalChibiGirlWall'; legacy.userData = b.root.userData; b.root.add(legacy);
  b.finish();
  return { root: b.root, figureNames, colliders: [{ minX: 2.075, maxX: 2.565, minZ: 4.6, maxZ: 8.3, minY: 0, maxY: 2.52 }] };
}

/** Authored, nonfunctional display replicas and virtual-input gaming furniture.
 * Geometry is batched by material, with one steerable wheel group; the owner disposes the scene.
 * Time is seconds. Texture/emissive updates never require shadow invalidation.
 */
export function createVillaGaming(parent: THREE.Object3D): {
  colliders: VillaCollider[];
  update(time: number, state: VillaActivityState & { gaming: boolean; race?: VillaRaceState }): boolean;
} {
  const b = new VillaModelBuilder(parent, 'villaGaming');
  const black = villaMaterial('#12191e', .43, .25);
  const rubber = villaMaterial('#20272b', .87);
  const steel = villaMaterial('#697782', .28, .8);
  const walnut = villaMaterial('#68452e', .62);
  const wood = villaMaterial('#925937', .48);
  const white = villaMaterial('#e8edf0', .42);
  const grey = villaMaterial('#8eabb2', .47, .25);
  const turquoise = villaMaterial('#21c6c5', .36, .17);
  const blue = villaMaterial('#268ee2', .45);
  const red = villaMaterial('#ed585f', .45);
  const green = villaMaterial('#133f35', .6);
  const orange = villaMaterial('#fa842d', .5);
  const glass = new THREE.MeshPhysicalMaterial({ color: '#d6faff', transparent: true, opacity: .13, roughness: .07, metalness: .04, depthWrite: false, side: THREE.DoubleSide });
  const warm = new THREE.MeshStandardMaterial({ color: '#ffe4b2', emissive: '#ffc575', emissiveIntensity: .8 });
  const rgb = new THREE.MeshStandardMaterial({ color: '#54dedc', emissive: '#25d3dd', emissiveIntensity: 1.1 });
  const rgbPink = new THREE.MeshStandardMaterial({ color: '#eab9fc', emissive: '#bb56ff', emissiveIntensity: .8 });
  const mark = (name: string, position: V3, data: Record<string, unknown> = {}) => {
    const node = new THREE.Object3D(); node.name = name; node.position.set(...position); node.userData = data; b.root.add(node); return node;
  };
  const ring = (x: number, y: number, z: number, radius: number, tube: number, mat: THREE.Material, rotation: V3 = [0, 0, 0]) =>
    b.geometry(new THREE.TorusGeometry(radius, tube, 6, 24), mat, [x, y, z], rotation);
  const cable = (points: V3[], radius: number, mat: THREE.Material) => {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    b.geometry(new THREE.TubeGeometry(curve, 20, radius, 6, false), mat);
  };
  const silhouette = (points: [number, number][], depth: number, mat: THREE.Material, pos: V3) => {
    const shape = new THREE.Shape(); points.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y)); shape.closePath();
    b.geometry(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 }), mat, pos);
  };
  const canvas = (width: number, height: number) => {
    const element = document.createElement('canvas'); element.width = width; element.height = height;
    const ctx = element.getContext('2d'); if (!ctx) throw new Error('Villa gaming needs a 2D canvas');
    const map = new THREE.CanvasTexture(element); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
    return { ctx, map };
  };
  const screen = (name: string, x: number, y: number, z: number, w: number, h: number, map: THREE.Texture, yaw = 0) => {
    const mat = new THREE.MeshBasicMaterial({ map, toneMapped: false });
    b.at(x, y, z, yaw, () => {
      b.box(0, 0, .035, w + .055, h + .055, .055, black);
      b.geometry(new THREE.PlaneGeometry(w, h), mat, [0, 0, .068]);
    });
    mark(name, [x, y, z]); return mat;
  };

  // Walnut desk: wall side -Z, user +Z. The northern doorway is untouched.
  b.box(7.25, .775, 3.84, 2.7, .055, .85, walnut);
  for (const x of [6.08, 8.42]) {
    b.box(x, .395, 3.84, .055, .73, .63, black);
    b.box(x, .05, 3.84, .12, .07, .73, black);
  }
  b.box(7.25, .58, 3.5, 2.31, .055, .04, steel);
  b.box(7.08, .808, 3.99, 1.14, .012, .43, rubber, .005);
  b.collide(7.25, 0, 3.84, 2.7, .81, .85);
  mark('pcDesk', [7.25, 0, 3.84], { width: 2.7, depth: .85 });

  // Physical 87-key TKL layout with sculpted individual caps and a shared legend atlas.
  const legend = canvas(1024, 512);
  legend.ctx.clearRect(0, 0, 1024, 512);
  legend.ctx.fillStyle = '#e3edf0'; legend.ctx.font = '500 27px Arial, sans-serif';
  legend.ctx.textAlign = 'center'; legend.ctx.textBaseline = 'middle';
  const rows: { z: number; start: number; keys: [string, number][] }[] = [
    { z: -.085, start: 0, keys: [['Esc', 1], ['', .5], ...['F1', 'F2', 'F3', 'F4'].map(k => [k, 1] as [string, number]), ['', .3], ...['F5', 'F6', 'F7', 'F8'].map(k => [k, 1] as [string, number]), ['', .3], ...['F9', 'F10', 'F11', 'F12'].map(k => [k, 1] as [string, number])] },
    { z: -.047, start: 0, keys: [...['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='].map(k => [k, 1] as [string, number]), ['Back', 2]] },
    { z: -.016, start: 0, keys: [['Tab', 1.5], ...'QWERTYUIOP'.split('').map(k => [k, 1] as [string, number]), ['[', 1], [']', 1], ['\\', 1.5]] },
    { z: .015, start: 0, keys: [['Caps', 1.75], ...'ASDFGHJKL'.split('').map(k => [k, 1] as [string, number]), [';', 1], ["'", 1], ['Enter', 2.25]] },
    { z: .046, start: 0, keys: [['Shift', 2.25], ...'ZXCVBNM'.split('').map(k => [k, 1] as [string, number]), [',', 1], ['.', 1], ['/', 1], ['Shift', 2.75]] },
    { z: .077, start: 0, keys: [['Ctrl', 1.25], ['Win', 1.25], ['Alt', 1.25], [' ', 6.25], ['Alt', 1.25], ['Fn', 1.25], ['Menu', 1.25], ['Ctrl', 1.25]] },
  ];
  const keyMat = new THREE.MeshBasicMaterial({ map: legend.map, transparent: true, depthWrite: false });
  let keyCount = 0;
  const key = (label: string, x: number, z: number, width = .025) => {
    const y = .842 + (-z + .08) * .045;
    b.box(x, y, z, width, .021, .027, label === 'Esc' ? turquoise : black, .004);
    // Raised shoulders plus smaller softly rounded face read as profiled keycaps.
    b.box(x, y + .01, z - .001, width * .86, .006, .023, label === 'Esc' ? turquoise : rubber, .002);
    const column = keyCount % 16, row = Math.floor(keyCount / 16);
    legend.ctx.fillText(label, column * 64 + 32, row * 64 + 31, 61);
    const geometry = new THREE.PlaneGeometry(width * .83, .022);
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (column + uv.getX(i)) / 16, 1 - (row + 1 - uv.getY(i)) / 8);
    b.geometry(geometry, keyMat, [x, y + .0135, z - .001], [-Math.PI / 2, 0, 0]); keyCount++;
  };
  b.at(6.94, 0, 4.035, 0, () => {
    b.box(.01, .826, 0, .59, .028, .207, steel, .006);
    for (const row of rows) {
      let u = row.start;
      for (const [label, width] of row.keys) { if (label) key(label, -.255 + (u + width / 2) * .03, row.z, width * .03 - .004); u += width; }
    }
    for (const [i, label] of ['Prt', 'Scr', 'Pau'].entries()) key(label, .215 + i * .03, -.085);
    for (const [i, label] of ['Ins', 'Home', 'PgUp', 'Del', 'End', 'PgDn'].entries()) key(label, .215 + (i % 3) * .03, -.047 + Math.floor(i / 3) * .031);
    key('↑', .245, .046); for (const [i, label] of ['←', '↓', '→'].entries()) key(label, .215 + i * .03, .077);
  });
  legend.map.needsUpdate = true;
  mark('mechanicalKeyboard', [6.94, .83, 4.035], { keyboardKeys: keyCount, layout: 'TKL', individuallySculpted: true, legends: 'canvas-atlas' });
  // Mouse shell, independent split buttons, central scroll wheel, side buttons and cable.
  b.ellipsoid(7.48, .837, 4.02, .044, .028, .071, black);
  for (const x of [7.457, 7.5]) b.ellipsoid(x, .85, 3.985, .02, .012, .034, rubber);
  b.cylinder(7.48, .861, 3.985, .012, .012, .011, steel, [0, 0, Math.PI / 2], 14);
  for (const z of [4.012, 4.036]) b.box(7.437, .845, z, .008, .007, .017, grey, .003);
  cable([[7.48, .843, 3.953], [7.5, .815, 3.82], [7.37, .812, 3.69], [7.48, .79, 3.48]], .003, black);
  cable([[6.96, .834, 3.933], [6.98, .815, 3.76], [7.13, .812, 3.68], [7.17, .76, 3.44]], .003, rubber);
  mark('ergonomicMouse', [7.48, .84, 4.02], { splitButtons: true, scrollWheel: true, sideButtons: 2, wired: true });
  const pcCanvas = canvas(768, 432);
  const pcMonitorMat = screen('pcMonitor', 7.05, 1.17, 3.62, .77, .433, pcCanvas.map);
  const sideMonitorMat = screen('secondaryMonitor', 6.25, 1.17, 3.69, .52, .33, pcCanvas.map, .18);
  for (const x of [6.25, 7.05]) {
    b.box(x, .803, 3.46, .11, .03, .1, steel);
    b.beam([x, .81, 3.45], [x, 1.06, 3.45], .019, black);
    b.beam([x, 1.06, 3.45], [x + .12, 1.16, 3.5], .018, steel);
    b.beam([x + .12, 1.16, 3.5], [x, 1.17, 3.59], .016, black);
  }
  // Headset on a simple desk stand, microphone on an articulated arm.
  b.box(7.7, .824, 3.65, .12, .025, .11, black);
  b.beam([7.7, .84, 3.65], [7.7, 1.06, 3.65], .009, steel);
  b.geometry(new THREE.TorusGeometry(.071, .012, 7, 20, Math.PI), rubber, [7.7, 1.035, 3.65]);
  for (const x of [7.626, 7.774]) b.ellipsoid(x, 1.01, 3.65, .02, .045, .034, black);
  b.beam([6.02, .82, 3.76], [6.08, 1.08, 3.8], .009, black);
  b.beam([6.08, 1.08, 3.8], [6.38, 1.02, 3.96], .009, black);
  b.cylinder(6.38, .98, 3.96, .021, .021, .087, rubber);

  // Open interior showcase PC. Only the bottom, rear and top are opaque panels.
  b.at(8.12, .8, 3.84, 0, () => {
    b.box(0, .018, 0, .32, .035, .4, black);
    b.box(0, .465, 0, .32, .027, .4, black);
    b.box(0, .24, -.19, .32, .45, .018, black);
    b.box(-.151, .245, 0, .009, .425, .38, glass, 0);
    b.box(0, .245, .201, .315, .425, .004, glass, 0);
    for (const x of [-.145, .145]) for (const z of [-.18, .18]) b.box(x, -.006, z, .028, .025, .03, rubber);
    // Motherboard: a real ATX board rather than a bare green slab. Dark PCB with
    // visible traces, VRM heatsinks, socket and pump block, four RAM slots (two
    // populated), chipset and M.2 shields, the 24-pin run and a rear I/O shroud.
    const pcb = black;
    b.box(.134, .265, -.03, .010, .355, .30, pcb, 0);
    for (const y of [.10, .16, .22, .28, .34, .40]) b.box(.1285, y, -.03, .0016, .0026, .292, green, 0);
    for (const z of [-.155, -.10, -.045, .01]) b.box(.1285, .265, z, .0016, .35, .0026, green, 0);
    // Top-edge VRM heatsinks and the rear I/O shroud.
    b.box(.115, .425, -.115, .034, .052, .09, steel, .004);
    b.box(.115, .425, -.015, .034, .052, .088, steel, .004);
    b.box(.118, .40, .118, .03, .12, .056, black, .003);
    for (let i = 0; i < 5; i++) b.box(.103, .355 + i * .018, .118, .006, .009, .038, steel);
    // Socket, retention frame and the AIO pump block over it.
    b.box(.118, .305, -.10, .026, .058, .058, steel);
    b.box(.108, .305, -.10, .014, .05, .05, black);
    b.cylinder(.09, .305, -.10, .032, .032, .028, black, [0, 0, Math.PI / 2], 16);
    ring(.0755, .305, -.10, .026, .0035, rgb, [0, Math.PI / 2, 0]);
    b.cylinder(.072, .305, -.10, .021, .021, .006, steel, [0, 0, Math.PI / 2], 16);
    // Four DIMM slots; the two nearest the socket carry heatspreaders.
    for (let i = 0; i < 4; i++) {
      const z = -.045 + i * .026;
      b.box(.118, .305, z, .012, .1, .009, i < 2 ? black : steel);
      if (i < 2) { b.box(.106, .305, z, .013, .096, .011, rgbPink, 0); b.box(.098, .305, z, .004, .09, .009, steel); }
    }
    // Chipset heatsink and the M.2 shield with its retaining screw.
    b.box(.118, .175, -.075, .026, .05, .07, steel, .004);
    b.box(.118, .135, -.02, .022, .028, .09, black, .003);
    b.cylinder(.106, .135, .026, .005, .005, .004, steel, [0, 0, Math.PI / 2], 8);
    // 24-pin ATX run plus the EPS bundle, dressed along the tray.
    b.box(.118, .255, .108, .022, .05, .02, black);
    cable([[.115, .262, .1], [.128, .22, .07], [.132, .17, .04]], .009, grey);
    b.box(.118, .415, .06, .02, .024, .024, black);
    cable([[.112, .412, .055], [.126, .37, .02], [.132, .3, -.005]], .007, grey);
    b.box(0, .155, -.025, .26, .047, .27, black);
    b.box(0, .183, -.025, .252, .009, .264, steel);
    b.box(-.132, .16, -.025, .009, .018, .25, rgb);
    for (const z of [-.103, .043]) {
      ring(0, .127, z, .047, .005, steel, [Math.PI / 2, 0, 0]);
      b.cylinder(0, .126, z, .014, .014, .012, black);
    }
    b.box(.02, .067, -.08, .21, .065, .2, rubber);
    // Three front intake fans visible through the completely clear front sheet.
    for (let i = 0; i < 3; i++) {
      const y = .115 + i * .124;
      ring(0, y, .16, .052, .004, rgb); ring(0, y, .154, .055, .003, black);
      b.cylinder(0, y, .154, .013, .013, .014, steel, [Math.PI / 2, 0, 0]);
      for (let j = 0; j < 7; j++) {
        const a = j * Math.PI * 2 / 7;
        b.geometry(new THREE.BoxGeometry(.024, .012, .006), rubber, [Math.cos(a) * .032, y + Math.sin(a) * .032, .152], [0, 0, a + .55]);
      }
    }
    b.box(0, .432, -.045, .245, .025, .22, steel);
    cable([[.078, .33, -.115], [.015, .385, -.145], [-.07, .4, -.1], [-.075, .435, .005]], .007, rubber);
    cable([[.078, .29, -.11], [-.035, .32, -.15], [-.11, .415, -.1], [-.055, .435, .015]], .007, rubber);
    for (let i = 0; i < 4; i++) cable([[.06 + i * .009, .13, .075], [.08 + i * .009, .09, .1], [.11, .08, -.12]], .003, i % 2 ? grey : rubber);
    b.box(0, .48, .125, .03, .004, .015, rgb);
  });
  mark('panoramicGamingPC', [8.12, .8, 3.84], { fanCount: 3, glassSides: 2, components: ['motherboard', 'GPU', 'RAM', 'AIO', 'PSU', 'cables'], size: [.32, .48, .4] });

  // Ergonomic chair, facing -Z towards the PC; cockpit seat reuses the bucket form facing +Z.
  const bucket = (x: number, z: number, yaw: number, racing: boolean) => b.at(x, 0, z, yaw, () => {
    b.box(0, .47, .015, .49, .12, .48, rubber, .045);
    b.box(0, .537, .015, .37, .025, .35, black, .01);
    b.geometry(new THREE.BoxGeometry(.43, .66, .105), rubber, [0, .85, .22], [.12, 0, 0]);
    b.box(0, 1.2, .265, .3, .2, .12, black, .03);
    b.box(0, 1.08, .165, .245, .1, .075, turquoise, .02);
    b.box(0, .7, .155, .3, .14, .09, black, .025);
    for (const side of [-1, 1]) {
      b.beam([side * .215, .59, .15], [side * .225, 1.12, .25], .044, black);
      b.beam([side * .24, .51, -.17], [side * .245, .57, .17], .04, turquoise);
      b.beam([side * .195, .71, .122], [side * .205, 1.05, .188], .006, turquoise);
      if (!racing) {
        b.box(side * .31, .69, -.035, .085, .045, .27, rubber, .012);
        b.beam([side * .28, .46, .075], [side * .31, .67, .05], .017, steel);
      }
    }
    if (!racing) {
      b.cylinder(0, .27, 0, .026, .038, .31, steel);
      for (let i = 0; i < 5; i++) {
        const a = i * Math.PI * 2 / 5, x1 = Math.sin(a) * .32, z1 = Math.cos(a) * .32;
        b.beam([0, .17, 0], [x1, .085, z1], .019, black);
        b.cylinder(x1, .047, z1, .039, .039, .065, rubber, [0, 0, Math.PI / 2], 12);
      }
    }
  });
  bucket(7.25, 5.1, 0, false); b.collide(7.25, 0, 5.1, .7, 1.31, .75);
  registerVillaSeatCollider(b.colliders[b.colliders.length - 1], 'chair-pc');
  mark('ergonomicGamingChair', [7.25, 0, 5.1], { seatId: 'chair-pc', sitable: true, cushionHeight: .55, yaw: 0, wheels: 5, headrest: true, lumbar: true, armrests: 2 });

  // North-wall locked replica cabinet, warm rim light, three horizontal display bays.
  b.at(10.35, 0, 3.3, 0, () => {
    b.box(0, 1.4, -.185, 2.9, 2.55, .045, walnut);
    b.box(0, 1.4, -.153, 2.77, 2.43, .018, rubber);
    for (const x of [-1.43, 1.43]) b.box(x, 1.4, 0, .04, 2.55, .42, walnut);
    for (const y of [.125, 2.675]) b.box(0, y, 0, 2.9, .045, .42, walnut);
    for (const y of [.2, 1, 1.83, 2.61]) b.box(0, y, -.11, 2.79, .012, .018, warm, .003);
    b.box(0, 1.4, .211, 2.82, 2.46, .006, glass, 0);
    b.box(0, 1.4, .219, .017, 2.46, .014, black);
    b.box(.045, 1.31, .232, .035, .065, .021, steel, .006);
    b.cylinder(.045, 1.31, .245, .009, .009, .005, black, [Math.PI / 2, 0, 0], 10);
    for (const y of [.74, 1.59, 2.33]) for (const x of [-.6, .55]) {
      b.beam([x, y - .06, -.14], [x, y - .06, .02], .009, steel);
      b.beam([x, y - .06, .02], [x, y, .02], .009, black);
    }
    // Pure exterior silhouettes: no ammunition, mechanism, or functional parts.
    b.at(-1.17, 2.22, -.045, 0, () => {
      silhouette([[0, -.1], [.37, -.025], [.46, .04], [.4, .13], [.06, .11], [0, .04]], .07, wood, [0, 0, 0]);
      b.box(.77, .055, .04, .66, .13, .095, black, .008);
      b.box(1.24, .06, .04, .37, .12, .09, wood, .014);
      b.beam([1.08, .15, .04], [1.6, .15, .04], .015, steel);
      b.beam([1.4, .07, .04], [2.13, .07, .04], .022, black);
      b.box(1.95, .125, .04, .027, .15, .04, steel, .002);
      b.beam([2.13, .07, .04], [2.16, .07, .04], .024, orange);
      // Curved 30-round magazine: a swept banana profile, not a rectangle.
      silhouette([[.9, -.005], [1.0, -.005], [1.05, -.13], [1.12, -.27], [1.14, -.38],
        [1.06, -.4], [1.0, -.29], [.95, -.15], [.89, -.03]], .05, black, [0, 0, .015]);
      for (let i = 0; i < 3; i++) b.beam([.92 + i * .012, -.1, .046], [.97 + i * .022, -.34, .046], .0035, steel);
      // Trigger, guard, magazine release and selector lever on the receiver side.
      silhouette([[.86, -.02], [.9, -.02], [.895, -.085], [.865, -.09]], .02, steel, [0, 0, .052]);
      silhouette([[.84, -.005], [.93, -.005], [.925, -.115], [.905, -.12], [.9, -.03], [.85, -.03]], .014, black, [0, 0, .03]);
      b.box(.83, -.055, .052, .03, .028, .012, black, .002);
      b.box(1.02, .03, .052, .07, .014, .01, steel, .002);
      // Pistol grip raked back, with a steel buttplate and sling loops.
      silhouette([[.59, 0], [.71, -.015], [.67, -.22], [.56, -.19]], .07, wood, [0, 0, .01]);
      b.box(1.87, .09, .04, .022, .17, .09, steel, .003);
      for (const x of [1.9, .3]) { b.beam([x, .0, .04], [x, .06, .04], .006, steel); ring(x, .0, .04, .016, .003, steel, [0, Math.PI / 2, 0]); }
      // Front sight post with ears, rear tangent leaf and the slant brake.
      b.box(1.9, .155, .04, .02, .045, .03, steel, .002);
      for (const dz of [-.018, .018]) b.box(1.9, .168, .04 + dz, .014, .022, .008, steel, .001);
      b.box(1.18, .125, .04, .07, .02, .05, steel, .002);
      silhouette([[2.12, .05], [2.2, .06], [2.19, .1], [2.11, .09]], .04, steel, [0, 0, .0]);
      ring(.77, -.079, .055, .055, .006, steel);
    });
    b.at(-1.28, 1.48, -.045, 0, () => {
      silhouette([[0, -.09], [.38, -.055], [.66, .025], [1.89, .025], [1.89, .095], [.7, .09], [.4, .045], [.03, .13]], .074, wood, [0, 0, 0]);
      b.beam([.59, .118, .037], [2.5, .118, .037], .017, steel);
      b.box(.76, .114, .038, .4, .075, .09, black, .004);
      // Two barrel bands, the bolt with its turned-down handle, and sling slots.
      for (const x of [1.35, 1.77]) { b.box(x, .055, .038, .045, .115, .085, steel, .002); b.beam([x - .02, .115, .038], [x + .02, .115, .038], .008, steel); }
      b.beam([.88, .14, .075], [.9, .065, .125], .009, steel); b.ellipsoid(.9, .065, .125, .021, .021, .021, black);
      b.cylinder(.9, .075, .098, .008, .008, .05, steel, [Math.PI / 2, 0, 0], 10);
      for (const x of [1.02, 2.1]) b.beam([x, -.02, .038], [x + .06, -.02, .038], .005, steel);
      // Trigger and guard under the receiver, hooded front sight, steel buttplate.
      silhouette([[.8, .02], [.84, .02], [.835, -.05], [.805, -.055]], .018, steel, [0, 0, .048]);
      silhouette([[.78, .03], [.87, .03], [.865, -.075], [.845, -.08], [.84, .045], [.79, .045]], .012, black, [0, 0, .028]);
      b.box(2.28, .1, .037, .022, .04, .028, steel, .002);
      for (const dz of [-.016, .016]) b.box(2.28, .112, .037 + dz, .015, .02, .007, steel, .001);
      b.box(.06, .052, .037, .022, .105, .078, steel, .003);
      ring(.69, -.045, .06, .055, .007, black);
      b.box(2.32, .153, .037, .03, .09, .03, black, .002);
      b.beam([2.5, .118, .037], [2.53, .118, .037], .018, orange);
    });
    b.at(-.63, .64, -.04, 0, () => {
      b.box(.48, .1, .04, .75, .18, .11, black, .009);
      b.box(.08, .08, .04, .1, .21, .13, rubber, .01);
      b.box(.38, .214, .04, .27, .025, .04, steel, .004);
      b.box(.92, .1, .04, .15, .13, .1, rubber, .008);
      b.beam([.98, .1, .04], [1.14, .1, .04], .022, black);
      b.beam([1.14, .1, .04], [1.165, .1, .04], .024, orange);
      silhouette([[.25, .02], [.4, .02], [.36, -.23], [.22, -.21]], .08, rubber, [0, 0, 0]);
      // Curved magazine with witness ribs.
      silhouette([[.6, -.115], [.68, -.115], [.7, -.21], [.76, -.3], [.7, -.325], [.66, -.24], [.61, -.16]], .045, black, [0, 0, .018]);
      for (let i = 0; i < 3; i++) b.box(.585 + i * .012, -.19 - i * .04, .062, .012, .07, .006, steel, .001);
      // Trigger, guard, selector drum and magazine release.
      silhouette([[.6, -.02], [.64, -.02], [.635, -.08], [.605, -.085]], .016, steel, [0, 0, .046]);
      silhouette([[.58, -.005], [.67, -.005], [.665, -.1], [.645, -.105], [.64, -.02], [.59, -.02]], .011, black, [0, 0, .026]);
      b.cylinder(.5, -.02, .052, .014, .014, .022, steel, [0, 0, Math.PI / 2], 10);
      ring(.47, -.045, .055, .056, .006, black);
      // Drum front sight, rear aperture and the cocking handle tube.
      b.cylinder(.99, .217, .04, .028, .028, .03, steel, [0, 0, Math.PI / 2], 12);
      ring(.99, .217, .04, .02, .006, black, [Math.PI / 2, 0, 0]);
      b.box(.66, .245, .04, .05, .022, .04, steel, .002);
      b.cylinder(.86, .17, .062, .011, .011, .055, steel, [0, 0, Math.PI / 2], 8);
      for (let i = 0; i < 3; i++) b.box(.9, .1 + i * .028, .07, .02, .008, .006, steel, .001);
      // Extending stock rails collapsed along the receiver.
      for (const dz of [-.045, .045]) b.beam([.3, .13, .04 + dz], [.72, .13, .04 + dz], .008, steel);
      b.box(.31, .13, .04, .03, .11, .11, rubber, .006);
    });
  });
  b.collide(10.35, .125, 3.3, 2.9, 2.55, .44);
  mark('lockedReplicaCabinet', [10.35, 1.4, 3.3], { locked: true, decorativeOnly: true, replicaNames: ['AK47', 'MosinNagant', 'MP5K'], orangeMuzzleTips: true });

  const figureDisplay = createVillaAnimeFigureDisplay(b.root, warm);
  const figureNames = figureDisplay.figureNames;
  b.colliders.push(...figureDisplay.colliders);

  // Independent aluminium-profile FFB simulator; central seating reference is shared.
  const sx = VILLA_RACING.seat.x, sz = VILLA_RACING.seat.z;
  bucket(sx, sz, Math.PI, true);
  for (const x of [sx - .5, sx + .5]) {
    b.box(x, .15, 6.86, .075, .1, 2.48, steel, .003);
    b.box(x, .177, 6.86, .02, .008, 2.43, black, .001);
    for (const z of [5.7, 6.25, 7.85]) b.box(x, .055, z, .14, .06, .16, rubber);
    b.beam([x, .2, 6.83], [x, .94, 7.06], .029, steel);
    b.box(x, .52, 6.06, .035, .45, .2, black);
  }
  for (const z of [5.7, 6.35, 7.92]) b.box(sx, .16, z, 1.06, .085, .06, steel, .002);
  b.box(sx, .93, 7.065, 1.1, .055, .35, black);
  b.box(sx, 1.01, 7.05, .32, .16, .31, black);
  for (let i = 0; i < 5; i++) b.box(sx - .11 + i * .055, 1.095, 7.065, .02, .01, .21, steel, .001);
  // The FFB base, shaft and dashboard stay fixed; only the circular rim spins.
  const wheel = createVillaRallyWheel(b.root, rubber, steel);
  b.box(sx, .24, 7.66, .67, .045, .64, black);
  for (let i = 0; i < 3; i++) {
    const x = sx - .22 + i * .22;
    b.beam([x, .27, 7.82], [x, .43, 7.59], .013, steel);
    b.geometry(new THREE.BoxGeometry(.115, .19, .018), steel, [x, .4, 7.61], [-.5, 0, 0]);
    for (let j = 0; j < 3; j++) b.box(x, .346 + j * .04, 7.575 - j * .018, .09, .009, .006, rubber, .001);
  }
  b.box(10.5, .68, 6.72, .32, .045, .3, steel);
  b.beam([10.46, .18, 6.72], [10.46, .68, 6.72], .025, steel);
  b.box(10.5, .74, 6.72, .15, .1, .17, black);
  b.beam([10.5, .78, 6.72], [10.5, .94, 6.72], .012, steel);
  b.ellipsoid(10.5, .96, 6.72, .035, .037, .035, black);
  b.collide(9.8, 0, 6.86, 1.16, 1.28, 2.48);
  registerVillaSeatCollider(b.colliders[b.colliders.length - 1], 'racing');
  b.collide(10.5, 0, 6.72, .33, .99, .31);
  registerVillaSeatCollider(b.colliders[b.colliders.length - 1], 'racing');
  mark('racingCockpit', [sx, 0, sz], { seat: VILLA_RACING.seat, exit: VILLA_RACING.exit, forward: '+Z', bounds: { minX: 9.22, maxX: 10.665, minZ: 5.55, maxZ: 8.1 }, pedals: 3, paddleShifters: 2, gearShifter: true });

  // Freestanding large display in front of glazing, with actual device silhouettes below.
  const tvCanvas = canvas(960, 540);
  screen('racingLargeScreen', VILLA_RACING.screen.x, VILLA_RACING.screen.y, VILLA_RACING.screen.z, 3.8, 2.1, tvCanvas.map, Math.PI);
  for (const x of [9.05, 10.55]) {
    b.box(x, .81, 8.66, .055, 1.51, .06, black);
    b.box(x, .055, 8.58, .42, .07, .57, black);
  }
  b.box(9.8, .46, 8.54, 2.1, .055, .55, walnut);
  b.collide(9.8, 0, 8.56, 3.85, 3.025, .66);
  // PS5-inspired sculpted white side wings around a black core, lying horizontally.
  b.box(9.29, .55, 8.53, .48, .105, .29, black, .025);
  for (const y of [.491, .615]) {
    b.geometry(new THREE.BoxGeometry(.515, .018, .31), white, [9.29, y, 8.525], [0, -.07, -.035]);
  }
  b.box(9.28, .558, 8.377, .27, .007, .005, blue, .001);
  b.box(9.39, .522, 8.377, .14, .006, .005, black, .001);
  const controller = (x: number, y: number, z: number) => {
    b.ellipsoid(x, y, z, .09, .028, .045, white);
    for (const side of [-1, 1]) {
      b.ellipsoid(x + side * .065, y - .005, z - .037, .032, .029, .052, white);
      b.cylinder(x + side * .032, y + .027, z - .008, .012, .012, .011, black, [0, 0, 0], 10);
    }
    b.box(x, y + .027, z + .014, .045, .006, .03, black, .003);
    b.box(x - .06, y + .026, z + .018, .027, .007, .008, black, .002);
    b.box(x - .06, y + .026, z + .018, .008, .007, .027, black, .002);
    for (let i = 0; i < 4; i++) b.cylinder(x + .061 + Math.cos(i * Math.PI / 2) * .012, y + .028, z + .018 + Math.sin(i * Math.PI / 2) * .012, .0038, .0038, .006, grey, [0, 0, 0], 6);
  };
  controller(9.72, .525, 8.42);
  b.box(10.32, .56, 8.6, .29, .15, .082, black, .009); // dock
  b.box(10.32, .68, 8.555, .29, .172, .024, black, .007);
  for (const side of [-1, 1]) {
    const x = 10.32 + side * .174;
    b.box(x, .68, 8.555, .055, .17, .027, side < 0 ? blue : red, .011);
    b.cylinder(x, side < 0 ? .71 : .65, 8.535, .012, .012, .009, black, [Math.PI / 2, 0, 0], 10);
    for (let i = 0; i < 4; i++) b.cylinder(x + Math.cos(i * Math.PI / 2) * .011, (side < 0 ? .65 : .717) + Math.sin(i * Math.PI / 2) * .011, 8.535, .0035, .0035, .007, black, [Math.PI / 2, 0, 0], 6);
  }
  const handheld = canvas(256, 144); handheld.ctx.fillStyle = '#68d7e1'; handheld.ctx.fillRect(0, 0, 256, 144);
  handheld.ctx.fillStyle = '#92d779'; handheld.ctx.beginPath(); handheld.ctx.ellipse(126, 89, 86, 35, 0, 0, Math.PI * 2); handheld.ctx.fill();
  handheld.ctx.fillStyle = '#fff0c6'; handheld.ctx.fillRect(107, 55, 39, 33); handheld.ctx.fillStyle = '#dd7260'; handheld.ctx.beginPath(); handheld.ctx.moveTo(100, 57); handheld.ctx.lineTo(126, 35); handheld.ctx.lineTo(153, 57); handheld.ctx.fill(); handheld.map.needsUpdate = true;
  const handheldMat = new THREE.MeshBasicMaterial({ map: handheld.map, toneMapped: false });
  b.geometry(new THREE.PlaneGeometry(.26, .144), handheldMat, [10.32, .68, 8.54], [0, Math.PI, 0]);
  cable([[9.29, .54, 8.68], [9.3, .42, 8.78], [9.8, .43, 8.76], [9.8, 1.13, 8.65]], .005, black);
  cable([[10.32, .53, 8.65], [10.3, .42, 8.76], [9.86, .43, 8.76], [9.86, 1.13, 8.65]], .004, black);
  mark('consoleMediaShelf', [9.8, .46, 8.54], { consoleSources: ['pc', 'ps', 'switch'], virtualInputSelection: true, devices: ['PS5-style console and dual-grip controller', 'Switch-style handheld, red/blue Joy-Cons and dock'] });

  // Source-specific graphics are drawn, not external streams or artwork.
  const polygon = (ctx: CanvasRenderingContext2D, color: string, pts: [number, number][]) => {
    ctx.fillStyle = color; ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill();
  };
  const fallbackRace = createVillaRace();
  const drawSource = (ctx: CanvasRenderingContext2D, source: VillaScreenSource, t: number, width: number, height: number, race = fallbackRace) => {
    ctx.save(); ctx.scale(width / 960, height / 540);
    if (source === 'pc') {
      drawVillaRace(ctx, 960, 540, race);
    } else if (source === 'ps') {
      const sky = ctx.createLinearGradient(0, 0, 960, 540); sky.addColorStop(0, '#062774'); sky.addColorStop(1, '#3974bd'); ctx.fillStyle = sky; ctx.fillRect(0, 0, 960, 540);
      for (let i = 0; i < 72; i++) { ctx.fillStyle = `rgba(220,240,255,${.35 + .25 * Math.sin(i + t)})`; ctx.fillRect((i * 137) % 960, (i * 79) % 370, 2, 2); }
      ctx.fillStyle = '#729ee5'; ctx.beginPath(); ctx.arc(692, 236, 130, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#b6d6ff'; ctx.lineWidth = 9; ctx.beginPath(); ctx.ellipse(692, 238, 198, 42, -.4, 0, Math.PI * 2); ctx.stroke();
      polygon(ctx, '#e0edfa', [[660, 196], [687, 225], [625, 218], [575, 225]]);
      ctx.fillStyle = '#f2f7ff'; ctx.font = '22px Arial'; ctx.fillText('Games    Media', 40, 43); ctx.font = '37px Arial'; ctx.fillText('Beyond the blue', 42, 208); ctx.font = '18px Arial'; ctx.fillText('A new constellation awaits', 44, 245);
      for (let i = 0; i < 5; i++) { ctx.fillStyle = ['#89abdf', '#193c73', '#a1b9dc', '#305da0', '#456fa5'][i]!; ctx.fillRect(42 + i * 174, 365, 157, 120); ctx.strokeStyle = '#e5f5ff'; ctx.lineWidth = 3; ctx.strokeRect(54 + i * 174, 382, 132, 69); ctx.fillStyle = '#eaf6ff'; ctx.font = '14px Arial'; ctx.fillText(['Continue', 'Explore', 'Library', 'Friends', 'Settings'][i]!, 61 + i * 174, 474); }
    } else {
      ctx.fillStyle = '#79dce5'; ctx.fillRect(0, 0, 960, 540);
      for (let i = 0; i < 12; i++) { ctx.strokeStyle = '#b9f3ea'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse((i * 171 + t * 9) % 1040 - 40, 230 + (i * 57) % 260, 28, 5, 0, 0, Math.PI); ctx.stroke(); }
      ctx.fillStyle = '#efdaa2'; ctx.beginPath(); ctx.ellipse(490, 313, 270, 125, -.08, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#91c866'; ctx.beginPath(); ctx.ellipse(490, 289, 232, 101, -.08, 0, Math.PI * 2); ctx.fill();
      for (const [x, y] of [[370, 205], [612, 229], [550, 172]]) { ctx.fillStyle = '#956d45'; ctx.fillRect(x - 7, y, 14, 56); ctx.fillStyle = '#4c9e67'; ctx.beginPath(); ctx.arc(x, y - 8, 35, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#fff2cd'; ctx.fillRect(445, 257, 79, 66); polygon(ctx, '#df8270', [[431, 259], [484, 214], [537, 259]]); ctx.fillStyle = '#967256'; ctx.fillRect(474, 284, 24, 39);
      ctx.fillStyle = '#f8fcf1'; ctx.font = '30px Arial'; ctx.fillText('Island days', 40, 56); ctx.font = '17px Arial'; ctx.fillText('Welcome home', 43, 83);
      for (let i = 0; i < 6; i++) { ctx.fillStyle = '#fff6dd'; ctx.beginPath(); ctx.arc(295 + i * 76, 480, 27, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = ['#80b665', '#e99474', '#65bbc9'][i % 3]!; ctx.fillRect(283 + i * 76, 468, 24, 24); }
    }
    ctx.restore();
  };
  drawSource(pcCanvas.ctx, 'pc', 0, 768, 432); pcCanvas.map.needsUpdate = true;
  drawSource(tvCanvas.ctx, 'pc', 0, 960, 540); tvCanvas.map.needsUpdate = true;
  b.root.userData = { keyboardKeys: keyCount, fanCount: 3, replicaNames: ['AK47', 'MosinNagant', 'MP5K'], figureNames, originalDesigns: true, modestClothing: true, consoleSources: ['pc', 'ps', 'switch'], virtualInputs: true, playableRacing: true, dynamicTransforms: ['interactiveRacingWheel'] };
  b.finish();
  let lastTick = -1, lastGaming: boolean | undefined, lastLights: boolean | undefined, lastSource: VillaScreenSource | undefined;
  return {
    colliders: b.colliders,
    update(time, state) {
      const tick = Math.floor(time * (state.screenSource === 'pc' ? 30 : 12));
      wheel.setSteer(state.race?.steer ?? 0);
      if (state.gaming !== lastGaming || state.displayLights !== lastLights) {
        rgb.emissiveIntensity = state.gaming && state.displayLights ? 1.1 : 0;
        rgbPink.emissiveIntensity = state.gaming && state.displayLights ? .8 : 0;
        rgb.color.set(state.gaming && state.displayLights ? '#54dedc' : '#253338');
        rgbPink.color.set(state.gaming && state.displayLights ? '#eab9fc' : '#30313a');
        warm.emissiveIntensity = state.displayLights ? .8 : 0;
        warm.color.set(state.displayLights ? '#ffe4b2' : '#665b49');
        pcMonitorMat.color.set(state.gaming ? '#ffffff' : '#030607'); sideMonitorMat.color.copy(pcMonitorMat.color);
      }
      if (tick !== lastTick || lastSource !== state.screenSource || lastGaming !== state.gaming) {
        drawSource(tvCanvas.ctx, state.screenSource, time, 960, 540, state.race); tvCanvas.map.needsUpdate = true;
        if (state.gaming) { drawSource(pcCanvas.ctx, 'pc', time, 768, 432, state.race); pcCanvas.map.needsUpdate = true; }
      }
      lastTick = tick; lastGaming = state.gaming; lastLights = state.displayLights; lastSource = state.screenSource;
      return false;
    },
  };
}
