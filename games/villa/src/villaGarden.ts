import * as THREE from 'three';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import { addVillaOrchardTree } from './villaOrchardArt.js';
import { addVillaBloom, addVillaKitchenCrop } from './villaCropArt.js';
import { NaturePalette } from './villaNatureGeometry.js';
import { createKitchenLeafMap, createKitchenStockMap } from './villaHorticultureAtlas.js';
import { buildBedStock, buildClayVessel, buildTomatoTrellis, potCompost, stakeTomato } from './villaKitchenGardenJoinery.js';
import { kitchenGround, kitchenSites, scatterKitchenLitter, turnKitchenSoil } from './villaKitchenGardenGround.js';
import { sample01 } from './villaWeatheredFinish.js';
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
  const bark = villaMaterial('#74604a', .98), wood = villaMaterial('#a08561', .93), green = villaMaterial('#486644', .9);
  const stock = villaMaterial('#ffffff', .96), bits = villaMaterial('#ffffff', .94), light = villaMaterial('#ffffff', .87), produce = villaMaterial('#ffffff', .42);
  stock.name = 'garden/boards-compost-and-terracotta'; bits.name = 'garden/aggregate-and-lashings'; produce.name = 'garden/fruit-skins'; light.name = 'garden/soft-leaves';
  stock.map = createKitchenStockMap(); light.map = createKitchenLeafMap(); light.alphaTest = .40;
  const crop = { green, light, produce, white: villaMaterial('#f5e8cf', .84), pink: villaMaterial('#bf6578', .81), purple: villaMaterial('#9079a9', .89),
    blue: villaMaterial('#a5b5d9', .87), gold: villaMaterial('#e6bd55', .83), plum: produce, rust: villaMaterial('#cf6544', .77), dark: villaMaterial('#574633', .96) };
  const leaves = Object.fromEntries(Object.entries(VILLA_FRUIT_SPECIES).map(([key, s]) => [key, villaMaterial(s.leaf, .91)])) as Record<VillaFruitSpecies, THREE.MeshStandardMaterial>;
  const fruits = Object.fromEntries(Object.entries(VILLA_FRUIT_SPECIES).map(([key, s]) => [key, villaMaterial(s.fruit, .48)])) as Record<VillaFruitSpecies, THREE.MeshStandardMaterial>;
  for (const paint of [...Object.values(leaves), ...Object.values(fruits), ...Object.values(crop), stock, bits]) paint.vertexColors = true;
  for (const leaf of [...Object.values(leaves), green, light, crop.gold, crop.pink, crop.white, crop.blue, crop.purple, crop.rust]) leaf.side = THREE.DoubleSide;
  const marker = (kind: string, species: string, x: number, y: number, z: number, data: Record<string, unknown>) => {
    const node = new THREE.Object3D(); node.name = `Garden/${kind}/${species}`;
    node.position.set(x, y, z); node.userData = { kind, species, ...data }; b.root.add(node);
  };
  VILLA_GARDEN_TREES.forEach(({ x, z, scale: s, species }, index) => {
    const floor = villaTerrainGroundHeight(x, z);
    b.collide(x, 0, z, .5 * s, 2.9 * s, .5 * s);
    b.at(x, floor, z, 0, () => {
      const bearing = addVillaOrchardTree(b, species, s, index * 2.399, { bark, wood, stalk: green, leaf: leaves[species], fruit: fruits[species] });
      marker('fruit-tree', species, x, floor, z, { scale: s, ...VILLA_FRUIT_SPECIES[species], ...bearing });
    });
  });
  for (const [bed, { x, y, z, w, d, species }] of VILLA_ROOF_PLANTERS.entries()) {
    marker('flower-planter', species, x, y, z, { width: w, depth: d, plants: 7 });
    b.at(x, y, z, 0, () => {
      b.collide(0, 0, 0, w, .43, d);
      const seed = 781 + 137 * bed, ground = kitchenGround(w - .084, d - .084, seed, true), surfaces = new NaturePalette();
      const sites = Array.from({ length: 7 }, (_, i) => {
        const along = (i - 3) * .267 + (sample01(seed, i + 55) - .5) * .095;
        const across = .095 * (i % 2 ? -1 : 1) + (sample01(seed, i + 423) - .5) * .095;
        return { x: w > d ? along : across, z: w > d ? across : along };
      });
      buildClayVessel(surfaces.get(stock), w, d, false, seed); turnKitchenSoil(surfaces.get(stock), ground, sites);
      scatterKitchenLitter(surfaces.get(bits), ground.width, ground.depth, ground.yAt, seed, 39); surfaces.finish(b);
      sites.forEach((site, i) => b.at(site.x, ground.yAt(site.x, site.z), site.z, 0, () => {
        const art = new NaturePalette(), age = sample01(i + 12, seed + 89), phase = sample01(i + 85, seed + 44) * 6.283;
        const h = { sunflower: .70, tulip: .36, lavender: .39, rose: .43, hydrangea: .46, daisy: .36 }[species] * (.72 + .54 * age);
        addVillaBloom(art, species, crop, h, phase, .18 + .80 * age, true); art.finish(b);
      }));
    });
  }
  for (const [i, { x, y, z, species }] of VILLA_ROOF_POTS.entries()) {
    marker('flower-pot', species, x, y, z, { width: .5, depth: .5, plants: 1 });
    b.at(x, y, z, 0, () => {
      const pot = new NaturePalette(), soilY = .294;
      buildClayVessel(pot.get(stock), .5, .5, true, 49 + i); potCompost(pot.get(stock), soilY);
      scatterKitchenLitter(pot.get(bits), .408, .408, () => soilY + .001, 39 + i, 8, true); pot.finish(b);
      b.at(0, soilY, 0, 0, () => {
        const art = new NaturePalette(); addVillaBloom(art, species, crop, species === 'sunflower' ? .67 : .36, i * 2.399, .61 + .19 * sample01(i, 43)); art.finish(b, .89);
      });
    });
  }
  for (const [bed, { x, z, w, d, species }] of VILLA_VEGETABLE_BEDS.entries()) {
    marker('vegetable-bed', species, x, 0, z, { width: w, depth: d, rows: 2, plants: 10, trellis: species === 'tomato' });
    b.at(x, 0, z, 0, () => {
      b.collide(0, 0, 0, w, species === 'tomato' ? 1.65 : .28, d);
      const seed = 311 + 157 * bed, ground = kitchenGround(w - .078, d - .078, seed), surfaces = new NaturePalette(), sites = kitchenSites(seed);
      const frame = surfaces.get(stock), litter = surfaces.get(bits);
      buildBedStock(frame, litter, w, d, seed); turnKitchenSoil(frame, ground, sites);
      scatterKitchenLitter(litter, ground.width, ground.depth, ground.yAt, seed, 103);
      if (species === 'tomato') buildTomatoTrellis(litter);
      surfaces.finish(b);
      for (const { x: px, z: pz, phase, stage } of sites) {
        const y = ground.yAt(px, pz);
        b.at(px, y, pz, 0, () => {
          const art = new NaturePalette(), ties = addVillaKitchenCrop(art, species, crop, phase, stage, -pz);
          if (ties.length) stakeTomato(art.get(bits), px, pz, y, ties);
          art.finish(b);
        });
      }
    });
  }
  b.finish();
  b.root.userData.garden = { trees: VILLA_GARDEN_TREES.length, roofPlanters: VILLA_ROOF_PLANTERS.length, vegetableBeds: VILLA_VEGETABLE_BEDS.length, deterministic: true };
  return { colliders: b.colliders };
}
