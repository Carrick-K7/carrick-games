import * as THREE from 'three';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import { addVillaOrchardTree } from './villaOrchardArt.js';
import { addVillaBloom, addVillaKitchenCrop } from './villaCropArt.js';
import { NatureMesh, NaturePalette } from './villaNatureGeometry.js';
import { villaTerrainGroundHeight } from './villaEstateLayout.js';
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
  // Six of the ten stand outside the enlarged footprint; the house doubled west,
  // east and north, so the rows that hugged the old walls moved out with them.
  { x: -30.4, z: -13.5, scale: 1.25, species: 'pear' },
  // The orange tree shades the pool approach, not the east lounger: its old
  // trunk intersected that chair on the newly widened cedar deck.
  { x: -26.7, z: 11.6, scale: 1, species: 'orange' },
  { x: -22, z: 19, scale: 1.25, species: 'cherry' },
  { x: -14, z: 22.8, scale: 1, species: 'mango' },
  // Moved 1.5 m east: the rerouted front link's shoulder reached within 0.7 m
  // of this trunk, and it now sits 5.7 m clear of every road centreline.
  { x: 9.5, z: 23, scale: 1.15, species: 'apple' },
  { x: 16.5, z: 60, scale: 1.2, species: 'orange' },
  { x: 22, z: 14.5, scale: 1, species: 'lemon' },
  { x: 34.4, z: -15.6, scale: 1.2, species: 'mango' },
  { x: -8, z: -23.4, scale: 1.15, species: 'apple' },
  { x: 8, z: -23.4, scale: 1.1, species: 'cherry' },
  // Roadside fruit trees, one every several metres of verge — sparse, never a hedge.
  { x: -8, z: 12.5, scale: 1, species: 'cherry' },
  { x: 12.5, z: 40, scale: 1.1, species: 'pear' },
  { x: 12.5, z: 56.5, scale: 1.15, species: 'orange' },
  { x: 16.5, z: 94.5, scale: 1.2, species: 'apple' },
  { x: 16.5, z: 106.5, scale: 1.1, species: 'mango' },
] as const satisfies readonly { x: number; z: number; scale: number; species: VillaFruitSpecies }[];

export const VILLA_FLOWER_SPECIES = ['rose', 'lavender', 'daisy', 'tulip', 'hydrangea', 'sunflower'] as const;
export const VILLA_ROOF_PLANTERS = [
  // The planter beds sit against the outer parapets now: the flower zone spread
  // outward from its old mid-terrace strip.
  { x: -20.5, z: -5, y: 7.2, w: 0.72, d: 2.2, species: 'rose' },
  { x: -20.5, z: -1, y: 7.2, w: 0.72, d: 2.2, species: 'lavender' },
  { x: 23.5, z: -3, y: 7.2, w: 0.72, d: 2.2, species: 'daisy' },
  { x: 23.5, z: 1.5, y: 7.2, w: 0.72, d: 2.2, species: 'tulip' },
  { x: 23.5, z: 5, y: 7.2, w: 0.72, d: 2.2, species: 'hydrangea' },
  { x: 0, z: 8.15, y: 7.2, w: 2.2, d: 0.72, species: 'sunflower' },
] as const;
/** One pot per position rings the terrace perimeter, each a single species. */
export const VILLA_ROOF_POTS = (() => {
  const edge = (from: number, to: number, count: number) => Array.from({ length: count }, (_, i) => from + (to - from) * i / (count - 1));
  const north = edge(-20, 26, 7).map(x => ({ x, z: -17.3 }));
  const south = edge(-20, 26, 7).map(x => ({ x, z: 8.15 }));
  const west = edge(-14, 6, 4).map(z => ({ x: -23.2, z }));
  const east = edge(-14, 6, 4).map(z => ({ x: 27.3, z }));
  return [...north, ...south, ...west, ...east].map((p, i) => ({ ...p, y: 7.2, species: VILLA_FLOWER_SPECIES[i % VILLA_FLOWER_SPECIES.length] }));
})();
export const VILLA_VEGETABLE_SPECIES = ['tomato', 'lettuce', 'carrot', 'eggplant'] as const;
// The patch stays on the lawn the pets, the player's spawn and the garden tests
// all expect. The front link's west approach is routed around it instead: that
// road was the newcomer that ran through the plants.
export const VILLA_VEGETABLE_BEDS = [
  { x: -10, z: 18, w: 2.6, d: 1.55, species: 'tomato' },
  { x: -5.8, z: 18, w: 2.6, d: 1.55, species: 'lettuce' },
  { x: -10, z: 21, w: 2.6, d: 1.55, species: 'carrot' },
  { x: -5.8, z: 21, w: 2.6, d: 1.55, species: 'eggplant' },
] as const;

/** Scene-owned geometry, merged by finish. Positions and collision footprints
 * still come from the garden/estate layout, independently of the art detail. */
export function createVillaGarden(parent: THREE.Object3D): { colliders: VillaCollider[] } {
  const b = new VillaModelBuilder(parent, 'Villa garden');
  const bark = villaMaterial('#74604a', .98), wood = villaMaterial('#a08561', .93), soil = villaMaterial('#493a2b', 1), ridge = villaMaterial('#60503a', 1);
  const terra = villaMaterial('#b88368', .91), green = villaMaterial('#486644', .9), light = villaMaterial('#819456', .92);
  const crop = { green, light, white: villaMaterial('#f5e8cf', .84), pink: villaMaterial('#bf6578', .84), purple: villaMaterial('#9079a9', .86),
    blue: villaMaterial('#a5b5d9', .85), gold: villaMaterial('#e6bd55', .84), plum: villaMaterial('#654267', .42), rust: villaMaterial('#cf6544', .5), dark: soil };
  const leaves = Object.fromEntries(Object.entries(VILLA_FRUIT_SPECIES).map(([key, s]) => [key, villaMaterial(s.leaf, .91)])) as Record<VillaFruitSpecies, THREE.MeshStandardMaterial>;
  const fruits = Object.fromEntries(Object.entries(VILLA_FRUIT_SPECIES).map(([key, s]) => [key, villaMaterial(s.fruit, .48)])) as Record<VillaFruitSpecies, THREE.MeshStandardMaterial>;
  for (const paint of [...Object.values(leaves), ...Object.values(fruits), green, light, crop.pink]) paint.vertexColors = true;
  for (const leaf of [...Object.values(leaves), green, light, crop.gold, crop.pink, crop.white, crop.blue, crop.purple]) leaf.side = THREE.DoubleSide;
  const marker = (kind: string, species: string, x: number, y: number, z: number, data: Record<string, unknown>) => {
    const node = new THREE.Object3D(); node.name = `Garden/${kind}/${species}`;
    node.position.set(x, y, z); node.userData = { kind, species, ...data }; b.root.add(node);
  };
  VILLA_GARDEN_TREES.forEach(({ x, z, scale: s, species }, index) => {
    const floor = villaTerrainGroundHeight(x, z);
    marker('fruit-tree', species, x, floor, z, { scale: s, ...VILLA_FRUIT_SPECIES[species], fruitClusters: 12, fruitHeight: [1.92 * s, 2.71 * s] });
    b.collide(x, 0, z, .5 * s, 2.9 * s, .5 * s);
    b.at(x, floor, z, 0, () => addVillaOrchardTree(b, species, s, index * 2.399, { bark, wood, stalk: green, leaf: leaves[species], fruit: fruits[species] }));
  });
  const frameBed = (w: number, d: number, h: number, material: THREE.Material) => {
    b.box(0, h * .49, 0, w - .12, h - .08, d - .12, soil, 0);
    for (const sign of [-1, 1]) {
      for (const level of [0, 1]) {
        const y = (.25 + level * .50) * h;
        b.box(sign * (w / 2 - .053), y, 0, .106, h * .50 - .004, d, material, 0);
        b.box(0, y, sign * (d / 2 - .052), w - .208, h * .50 - .004, .105, material, 0);
      }
      for (const end of [-1, 1]) {
        b.box(sign * (w / 2 - .073), h / 2, end * (d / 2 - .075), .14, h + .012, .14, material, 0);
        for (const y of [h * .28, h * .71]) b.cylinder(sign * (w / 2 - .004), y, end * (d / 2 - .077), .016, .016, .011, ridge, [0, 0, Math.PI / 2], 7);
      }
    }
    b.collide(0, 0, 0, w, h, d);
  };
  for (const { x, y, z, w, d, species } of VILLA_ROOF_PLANTERS) {
    marker('flower-planter', species, x, y, z, { width: w, depth: d, plants: 7 });
    b.at(x, y, z, 0, () => {
      frameBed(w, d, .43, terra);
      for (let i = 0; i < 7; i++) {
        const along = (i - 3) * .25, across = (i % 2 ? -1 : 1) * .12;
        b.at(w > d ? along : across, .38, w > d ? across : along, 0, () => {
          const art = new NaturePalette(); addVillaBloom(art, species, crop, (species === 'sunflower' ? .79 : species === 'lavender' ? .51 : .46) + i % 3 * .052, i * 2.399); art.finish(b);
        });
      }
    });
  }
  for (const [i, { x, y, z, species }] of VILLA_ROOF_POTS.entries()) {
    marker('flower-pot', species, x, y, z, { width: .5, depth: .5, plants: 1 });
    b.at(x, y, z, 0, () => {
      const clay = new NatureMesh();
      clay.round([[.003, 0], [.003, .156], [.013, .181], [.038, .181], [.046, .173], [.243, .222], [.251, .233], [.268, .234], [.275, .225],
        [.296, .234], [.301, .249], [.328, .25], [.341, .24], [.341, .219], [.324, .214], [.283, .210]], 14);
      b.geometry(clay.geometry(), terra); b.cylinder(0, .286, 0, .212, .205, .016, soil, [0, 0, 0], 14);
      b.at(0, .292, 0, 0, () => { const art = new NaturePalette(); addVillaBloom(art, species, crop, species === 'sunflower' ? .68 : .36, i * 2.399); art.finish(b, .89); });
    });
  }
  for (const { x, z, w, d, species } of VILLA_VEGETABLE_BEDS) {
    marker('vegetable-bed', species, x, 0, z, { width: w, depth: d, rows: 2, plants: 10, trellis: species === 'tomato' });
    b.at(x, 0, z, 0, () => {
      frameBed(w, d, .28, wood);
      for (const rz of [-.36, .36]) b.box(0, .252, rz, 2.29, .085, .28, ridge, .027);
      if (species === 'tomato') {
        for (const sx of [-1.06, 0, 1.06]) b.beam([sx, .19, 0], [sx, 1.62, 0], .027, wood, 8);
        for (const h of [.65, 1.12, 1.55]) {
          b.beam([-1.12, h, .032], [1.12, h, .032], .02, wood, 7);
          for (const sx of [-1.06, 0, 1.06]) for (const sign of [-1, 1]) b.beam([sx + sign * .023, h - .025, -.009], [sx - sign * .023, h + .026, .047], .005, ridge, 5);
        }
        b.colliders[b.colliders.length - 1].maxY = 1.65;
      }
      for (const row of [-1, 1]) for (let i = 0; i < 5; i++) {
        b.at((i - 2) * .43, .286, row * .36, row === 1 ? 0 : Math.PI, () => {
          const art = new NaturePalette(); addVillaKitchenCrop(art, species, species === 'carrot' ? { ...crop, rust: fruits.orange } : crop, i * 2.399 + row); art.finish(b);
          if (species === 'tomato') {
            // Raked cane connects the tied vine to the horizontal espalier.
            b.beam([.01, 0, .02], [.068, 1.27, -.36], .009, wood, 5);
            b.beam([.012, .57, .04], [.04, .57, -.153], .006, ridge, 5);
          }
        });
      }
    });
  }
  b.finish();
  b.root.userData.garden = { trees: VILLA_GARDEN_TREES.length, roofPlanters: VILLA_ROOF_PLANTERS.length, vegetableBeds: VILLA_VEGETABLE_BEDS.length, deterministic: true };
  return { colliders: b.colliders };
}
