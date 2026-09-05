import * as THREE from 'three';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import type { VillaCollider } from './villaWorld.js';

/** Authored botanical differences; also usable by an optional floor plan. */
export const VILLA_FRUIT_SPECIES = {
  cherry: { fruit: '#a92b40', leaf: '#52734b', silhouette: 'open-vase', shape: 'paired-cherries', leafShape: 'serrated-ovate' },
  orange: { fruit: '#f09a29', leaf: '#345d42', silhouette: 'round', shape: 'round-orange', leafShape: 'oval' },
  mango: { fruit: '#e3a646', leaf: '#315747', silhouette: 'spreading', shape: 'elongated-mango', leafShape: 'long-lanceolate' },
  apple: { fruit: '#cd5543', leaf: '#68804c', silhouette: 'low-dome', shape: 'lobed-apple', leafShape: 'broad-ovate' },
  pear: { fruit: '#c5b853', leaf: '#577445', silhouette: 'upright', shape: 'tapered-pear', leafShape: 'pointed-oval' },
  lemon: { fruit: '#efd361', leaf: '#486c3e', silhouette: 'airy', shape: 'pointed-lemon', leafShape: 'narrow-oval' },
} as const;
export type VillaFruitSpecies = keyof typeof VILLA_FRUIT_SPECIES;

/** Replaces, rather than supplements, the original furnishings' ten generic trees. */
export const VILLA_GARDEN_TREES = [
  { x: -23.2, z: -11, scale: 1.25, species: 'pear' },
  { x: -23, z: 8.2, scale: 1, species: 'orange' },
  { x: -22, z: 19, scale: 1.25, species: 'cherry' },
  { x: -14, z: 22.8, scale: 1, species: 'mango' },
  { x: 8, z: 23, scale: 1.15, species: 'apple' },
  { x: 23.2, z: 19, scale: 1.2, species: 'orange' },
  { x: 23.4, z: 7, scale: 1, species: 'lemon' },
  { x: 22.7, z: -12, scale: 1.2, species: 'mango' },
  { x: -8, z: -14.5, scale: 1.15, species: 'apple' },
  { x: 8, z: -14.5, scale: 1.1, species: 'cherry' },
] as const satisfies readonly { x: number; z: number; scale: number; species: VillaFruitSpecies }[];

export const VILLA_FLOWER_SPECIES = ['rose', 'lavender', 'daisy', 'tulip', 'hydrangea', 'sunflower'] as const;
export const VILLA_ROOF_PLANTERS = [
  { x: -11, z: -5, y: 7.2, w: 0.72, d: 2.2, species: 'rose' },
  { x: -11, z: -1, y: 7.2, w: 0.72, d: 2.2, species: 'lavender' },
  { x: 11, z: -3, y: 7.2, w: 0.72, d: 2.2, species: 'daisy' },
  { x: 11, z: 1.5, y: 7.2, w: 0.72, d: 2.2, species: 'tulip' },
  { x: 11, z: 5, y: 7.2, w: 0.72, d: 2.2, species: 'hydrangea' },
  { x: 0, z: 8.1, y: 7.2, w: 2.2, d: 0.72, species: 'sunflower' },
] as const;
export const VILLA_VEGETABLE_SPECIES = ['tomato', 'lettuce', 'carrot', 'eggplant'] as const;
export const VILLA_VEGETABLE_BEDS = [
  { x: -10, z: 18, w: 2.6, d: 1.55, species: 'tomato' },
  { x: -5.8, z: 18, w: 2.6, d: 1.55, species: 'lettuce' },
  { x: -10, z: 21, w: 2.6, d: 1.55, species: 'carrot' },
  { x: -5.8, z: 21, w: 2.6, d: 1.55, species: 'eggplant' },
] as const;

type Point = [number, number, number];
/** All geometry/materials are scene-owned, static and merged per material. No DOM, timers or random. */
export function createVillaGarden(parent: THREE.Object3D): { colliders: VillaCollider[] } {
  const b = new VillaModelBuilder(parent, 'Villa garden');
  // One palette per garden, not per flower/fruit; the host disposes it by traversal.
  const bark = villaMaterial('#74604a', 0.98), wood = villaMaterial('#a08561', 0.93);
  const soil = villaMaterial('#493a2b', 1), ridge = villaMaterial('#60503a', 1);
  const terra = villaMaterial('#b88368', 0.92), stem = villaMaterial('#486644', 0.9);
  const lightLeaf = villaMaterial('#819456', 0.92), white = villaMaterial('#f5e8cf', 0.84);
  const rose = villaMaterial('#bf6578', 0.84), purple = villaMaterial('#8b76ae', 0.86);
  const blue = villaMaterial('#a5b5d9', 0.85), yellow = villaMaterial('#e6bd55', 0.84);
  const aubergine = villaMaterial('#654267', 0.42), tomato = villaMaterial('#cf6544', 0.5);
  const leaves = Object.fromEntries(Object.entries(VILLA_FRUIT_SPECIES).map(([key, s]) => [key, villaMaterial(s.leaf, 0.94)])) as Record<VillaFruitSpecies, THREE.MeshStandardMaterial>;
  const fruits = Object.fromEntries(Object.entries(VILLA_FRUIT_SPECIES).map(([key, s]) => [key, villaMaterial(s.fruit, 0.48)])) as Record<VillaFruitSpecies, THREE.MeshStandardMaterial>;
  fruits.mango.vertexColors = true;
  const mango = (s: number) => {
    // Deform one continuous surface: broad shoulders, a curved belly and a rounded
    // taper, with no attached tip/blush spheres that could read as extra fruit.
    const g = new THREE.SphereGeometry(1, 16, 12), positions = g.getAttribute('position');
    const colors: number[] = [];
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
      const belly = 1 - y * y;
      positions.setXYZ(i, (x * 0.14 * (0.95 + y * 0.12) + 0.055 * belly - 0.025 * y) * s,
        y * 0.27 * s, z * 0.12 * (0.95 + y * 0.08) * s);
      const blush = Math.max(0, z) * Math.max(0, 0.5 + y) * 0.38;
      colors.push(1, 1 - blush * 0.42, 1 - blush * 0.48);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.computeVertexNormals(); b.geometry(g, fruits.mango);
  };
  const marker = (kind: string, species: string, x: number, y: number, z: number, data: Record<string, unknown> = {}) => {
    const node = new THREE.Object3D(); node.name = `Garden/${kind}/${species}`;
    node.position.set(x, y, z); node.userData = { kind, species, ...data }; b.root.add(node); return node;
  };
  // Lower resolution than the furniture spheres: organic details stay inexpensive.
  const orb = (x: number, y: number, z: number, sx: number, sy: number, sz: number, material: THREE.Material, tilt = 0) => {
    const g = new THREE.SphereGeometry(1, 8, 5); g.scale(sx, sy, sz); b.geometry(g, material, [x, y, z], [0, 0, tilt]);
  };
  const leaf = (x: number, y: number, z: number, length: number, width: number, material: THREE.Material, yaw: number, droop = 0.25, serrated = false) => {
    // Folded, pointed leaf with a raised midrib, not a flat rectangular sprite.
    const points = [0, 0, 0, -width, -droop * 0.4, length * 0.48, 0, 0.035, length * 0.5,
      0, 0, 0, 0, 0.035, length * 0.5, width, -droop * 0.4, length * 0.48,
      -width, -droop * 0.4, length * 0.48, 0, -droop, length, 0, 0.035, length * 0.5,
      0, 0.035, length * 0.5, 0, -droop, length, width, -droop * 0.4, length * 0.48];
    // Duplicate reversed faces rather than requiring double-sided materials on entire canopies.
    const back: number[] = []; for (let i = 0; i < points.length; i += 9) back.push(...points.slice(i + 6, i + 9), ...points.slice(i + 3, i + 6), ...points.slice(i, i + 3));
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([...points, ...back], 3));
    b.geometry(g, material, [x, y, z], [0, yaw, 0]);
    if (serrated) b.at(x, y, z, yaw, () => {
      for (const side of [-1, 1]) for (const t of [0.3, 0.55, 0.7]) orb(side * width * 0.75, -droop * t * 0.6, length * t, width * 0.4, 0.015, length * 0.09, material);
    });
  };

  for (const tree of VILLA_GARDEN_TREES) {
    const { x, z, scale: s, species } = tree, spec = VILLA_FRUIT_SPECIES[species];
    marker('fruit-tree', species, x, 0, z, { scale: s, ...spec, fruitClusters: 12, fruitHeight: [1.92 * s, 2.71 * s] });
    b.at(x, 0, z, 0, () => {
      // Trunk and collision dimensions intentionally match the removed tree() exactly.
      b.cylinder(0, 1.45 * s, 0, 0.14 * s, 0.25 * s, 2.9 * s, bark, [0, 0, 0], 10);
      b.collide(0, 0, 0, 0.5 * s, 2.9 * s, 0.5 * s);
      // Branch spacing and lobe proportions change the outline, not just the paint.
      const crowns: Record<VillaFruitSpecies, { spread: number; y: number; width: number; height: number; depth: number; rise: number }> = {
        cherry: { spread: 0.98, y: 3.05, width: 0.66, height: 0.76, depth: 0.62, rise: 0.19 },
        orange: { spread: 0.65, y: 3.05, width: 0.96, height: 0.96, depth: 0.9, rise: 0.09 },
        mango: { spread: 1.05, y: 3.13, width: 0.9, height: 0.64, depth: 0.72, rise: 0.12 },
        apple: { spread: 0.78, y: 2.95, width: 0.94, height: 0.72, depth: 0.88, rise: 0.12 },
        pear: { spread: 0.53, y: 3.35, width: 0.66, height: 1.08, depth: 0.65, rise: 0.21 },
        lemon: { spread: 0.85, y: 3.08, width: 0.61, height: 0.73, depth: 0.57, rise: 0.27 },
      };
      const crown = crowns[species];
      for (let i = 0; i < 6; i++) {
        const a = i * 2.399, px = Math.cos(a) * crown.spread * s, pz = Math.sin(a) * crown.spread * s;
        const cy = (crown.y + (i % 3) * crown.rise) * s;
        b.beam([0, 1.65 * s, 0], [px, cy, pz], 0.06 * s, bark, 7);
        orb(px, cy, pz, crown.width * s, crown.height * s, crown.depth * s, leaves[species]);
        for (let j = 0; j < 7; j++) {
          const angle = a + j * 0.898, lx = px + Math.cos(angle) * 0.65 * s, lz = pz + Math.sin(angle) * 0.6 * s;
          leaf(lx, cy + (j % 2 ? -0.18 : 0.3) * s, lz, (species === 'mango' ? 0.64 : species === 'lemon' ? 0.37 : 0.43) * s,
            (species === 'mango' ? 0.065 : species === 'apple' ? 0.15 : 0.11) * s, j % 3 ? leaves[species] : lightLeaf, -angle, 0.18 * s, species === 'cherry');
        }
      }
      // Pendant clusters outside and below the opaque crown, visible from the lawn.
      for (let i = 0; i < 12; i++) {
        const a = i * Math.PI / 6, r = (1.02 + (i % 2) * 0.22) * s;
        const px = Math.cos(a) * r, pz = Math.sin(a) * r, py = (2.12 + (i % 3) * 0.24) * s;
        const tip: Point = [px * 0.9, py + 0.48 * s, pz * 0.9];
        b.beam([px * 0.62, 2.75 * s, pz * 0.62], tip, 0.024 * s, bark, 5);
        for (let j = 0; j < 2; j++) {
          // Radially stagger pairs, rather than stacking overlapping fruit along
          // world X. This also keeps pairs clear of the neighboring radial cluster.
          const offset = (j ? 1 : -1) * (species === 'cherry' ? 0.12 : 0.24) * s;
          const fx = px + Math.cos(a) * offset, fz = pz + Math.sin(a) * offset, fy = py + j * 0.11 * s;
          const stalkTop = species === 'mango' ? 0.27 : species === 'cherry' ? 0.083 : 0.16;
          b.beam(tip, [fx - (species === 'mango' ? Math.cos(a) * 0.025 * s : 0), fy + stalkTop * s,
            fz + (species === 'mango' ? Math.sin(a) * 0.025 * s : 0)], 0.012 * s, stem, 5);
          b.at(fx, fy, fz, a, () => {
            const material = fruits[species];
            if (species === 'mango') mango(s);
            else if (species === 'pear') {
              orb(0, -0.04 * s, 0, 0.165 * s, 0.17 * s, 0.15 * s, material);
              orb(0, 0.12 * s, 0, 0.09 * s, 0.16 * s, 0.085 * s, material);
            } else if (species === 'lemon') {
              orb(0, 0, 0, 0.13 * s, 0.21 * s, 0.13 * s, material, 0.5);
              orb(-0.09 * s, 0.16 * s, 0, 0.043 * s, 0.065 * s, 0.04 * s, material, 0.5);
            } else if (species === 'apple') {
              for (let lobe = 0; lobe < 3; lobe++) { const t = lobe * Math.PI * 2 / 3; orb(Math.cos(t) * 0.055 * s, 0, Math.sin(t) * 0.055 * s, 0.135 * s, 0.155 * s, 0.13 * s, material); }
            } else orb(0, 0, 0, (species === 'cherry' ? 0.075 : 0.18) * s, (species === 'cherry' ? 0.083 : 0.175) * s, (species === 'cherry' ? 0.075 : 0.18) * s, material);
          });
        }
      }
    });
  }

  const frameBed = (w: number, d: number, h: number, material: THREE.Material) => {
    b.box(0, h * 0.5, 0, w - 0.12, h - 0.08, d - 0.12, soil, 0);
    for (const x of [-w / 2 + 0.055, w / 2 - 0.055]) b.box(x, h / 2, 0, 0.11, h, d, material);
    for (const z of [-d / 2 + 0.055, d / 2 - 0.055]) b.box(0, h / 2, z, w - 0.22, h, 0.11, material);
    b.collide(0, 0, 0, w, h, d);
  };
  for (const planter of VILLA_ROOF_PLANTERS) {
    const { x, y, z, w, d, species } = planter;
    marker('flower-planter', species, x, y, z, { width: w, depth: d, plants: 7 });
    b.at(x, y, z, 0, () => {
      frameBed(w, d, 0.43, terra);
      for (let i = 0; i < 7; i++) {
        const along = (i - 3) * 0.25, across = (i % 2 ? -1 : 1) * 0.12;
        const px = w > d ? along : across, pz = w > d ? across : along;
        const h = (species === 'sunflower' ? 1.2 : species === 'lavender' ? 0.96 : 0.88) + (i % 3) * 0.07;
        b.beam([px, 0.37, pz], [px, h, pz], 0.014, stem, 5);
        for (const side of [-1, 1]) leaf(px, 0.62, pz, species === 'tulip' ? 0.38 : 0.24, 0.07, stem, side * Math.PI / 2, -0.08);
        if (species === 'lavender') {
          for (let sprig = -1; sprig <= 1; sprig++) {
            const sx = px + sprig * 0.075;
            b.beam([px, 0.5, pz], [sx, h + 0.16, pz], 0.008, stem, 5);
            for (let bud = 0; bud < 5; bud++) orb(sx, h - 0.14 + bud * 0.062, pz, 0.047 - bud * 0.004, 0.045, 0.047 - bud * 0.004, purple);
          }
        } else if (species === 'hydrangea') {
          for (let floret = 0; floret < 14; floret++) {
            const a = floret * 2.399, r = Math.sqrt(floret / 14) * 0.19;
            orb(px + Math.cos(a) * r, h + 0.13 * (1 - r / 0.2), pz + Math.sin(a) * r, 0.074, 0.055, 0.074, floret % 3 ? blue : purple);
          }
        } else if (species === 'rose') {
          for (let ring = 0; ring < 2; ring++) for (let p = 0; p < 5; p++) {
            const a = p * Math.PI * 0.4 + ring * 0.5, r = ring ? 0.045 : 0.095;
            orb(px + Math.cos(a) * r, h + ring * 0.055, pz + Math.sin(a) * r, ring ? 0.055 : 0.087, 0.067, ring ? 0.055 : 0.087, ring ? rose : tomato);
          }
        } else if (species === 'tulip') {
          for (let p = 0; p < 5; p++) { const a = p * Math.PI * 0.4; orb(px + Math.cos(a) * 0.062, h, pz + Math.sin(a) * 0.062, 0.059, 0.135, 0.059, i % 2 ? rose : yellow); }
        } else {
          // Sunflowers face the terrace; daisies lie open to the sky.
          const sunflower = species === 'sunflower', count = sunflower ? 12 : 9, radius = sunflower ? 0.15 : 0.105;
          for (let p = 0; p < count; p++) {
            const a = p * Math.PI * 2 / count;
            orb(px + Math.cos(a) * radius, h + (sunflower ? Math.sin(a) * radius : 0), pz + (sunflower ? 0 : Math.sin(a) * radius), 0.064, sunflower ? 0.09 : 0.03, sunflower ? 0.025 : 0.078, sunflower ? yellow : white, sunflower ? -a : 0);
          }
          orb(px, h + (sunflower ? 0 : 0.025), pz - (sunflower ? 0.02 : 0), sunflower ? 0.103 : 0.054, sunflower ? 0.103 : 0.044, sunflower ? 0.045 : 0.054, sunflower ? soil : yellow);
        }
      }
    });
  }

  for (const bed of VILLA_VEGETABLE_BEDS) {
    const { x, z, w, d, species } = bed;
    marker('vegetable-bed', species, x, 0, z, { width: w, depth: d, rows: 2, plants: 10, trellis: species === 'tomato' });
    b.at(x, 0, z, 0, () => {
      frameBed(w, d, 0.28, wood);
      // Raised soil rows and corner joinery, separated by exposed dark soil.
      for (const rz of [-0.36, 0.36]) b.box(0, 0.255, rz, 2.23, 0.07, 0.25, ridge, 0.025);
      for (const sx of [-1.22, 1.22]) for (const sz of [-0.695, 0.695]) b.box(sx, 0.17, sz, 0.13, 0.34, 0.13, wood);
      if (species === 'tomato') {
        for (const sx of [-1.06, 0, 1.06]) b.beam([sx, 0.25, 0], [sx, 1.62, 0], 0.028, wood, 6);
        for (const h of [0.65, 1.12, 1.55]) b.beam([-1.1, h, 0], [1.1, h, 0], 0.02, wood, 6);
        // The bed footprint also protects the trellis from people and roaming pets.
        b.colliders[b.colliders.length - 1].maxY = 1.65;
      }
      for (const rz of [-0.36, 0.36]) for (let i = 0; i < 5; i++) {
        const px = (i - 2) * 0.43;
        if (species === 'lettuce') {
          for (let j = 0; j < 7; j++) { const a = j * 2.399; orb(px + Math.cos(a) * 0.09, 0.36 + (j % 3) * 0.045, rz + Math.sin(a) * 0.09, 0.11, 0.07, 0.14, j % 2 ? lightLeaf : stem, Math.sin(a) * 0.4); }
          orb(px, 0.47, rz, 0.085, 0.07, 0.085, lightLeaf);
        } else if (species === 'carrot') {
          b.cylinder(px, 0.27, rz, 0.064, 0.012, 0.18, fruits.orange, [0, 0, 0], 7);
          for (let j = 0; j < 5; j++) {
            const a = j * 2.399, tx = px + Math.cos(a) * 0.13, tz = rz + Math.sin(a) * 0.13;
            b.beam([px, 0.32, rz], [tx, 0.64, tz], 0.008, stem, 5);
            for (let k = 0; k < 3; k++) leaf(tx, 0.45 + k * 0.07, tz, 0.12, 0.025, lightLeaf, a + k, 0.035);
          }
        } else {
          const h = species === 'tomato' ? 1.25 : 0.86;
          b.beam([px, 0.26, rz], [px, h, rz], 0.019, stem, 6);
          for (let j = 0; j < 5; j++) {
            const a = j * 2.399, ly = 0.45 + j * 0.13;
            leaf(px, ly, rz, species === 'eggplant' ? 0.28 : 0.22, species === 'eggplant' ? 0.12 : 0.065, j % 2 ? stem : lightLeaf, a, 0.08);
          }
          for (let j = 0; j < 3; j++) {
            const fx = px + (j % 2 ? -0.12 : 0.12), fy = 0.47 + j * 0.19;
            b.beam([px, fy + 0.1, rz], [fx, fy + 0.03, rz + 0.09], 0.008, stem, 5);
            orb(fx, fy, rz + 0.09, species === 'eggplant' ? 0.075 : 0.086, species === 'eggplant' ? 0.16 : 0.084, 0.075, species === 'eggplant' ? aubergine : tomato, species === 'eggplant' ? 0.16 : 0);
            orb(fx, fy + (species === 'eggplant' ? 0.13 : 0.065), rz + 0.09, 0.045, 0.028, 0.045, stem);
          }
        }
      }
    });
  }
  b.finish();
  b.root.userData.garden = { trees: VILLA_GARDEN_TREES.length, roofPlanters: VILLA_ROOF_PLANTERS.length, vegetableBeds: VILLA_VEGETABLE_BEDS.length, deterministic: true };
  return { colliders: b.colliders };
}
