import type { MapDefinition, TerrainCell } from './types.js';

/** Authored deterministic development maps. No original assets or classic map names. */
export const MAPS: readonly MapDefinition[] = [
  {
    id: 'cedar-bay', labelZh: '杉湾 · 原创练习场', labelEn: 'Cedar Bay · Practice',
    descriptionZh: '原创开发验证地图：开阔草地、东侧海湾与有限矿脉。非原版地图。',
    descriptionEn: 'Original development map: open grassland, eastern bay and finite ore. Not an original game map.',
    width: 36, height: 36, seed: 127031, spawn: { x: 6, y: 6 }, provenance: 'original-development',
  },
  {
    id: 'snow-meadow', labelZh: '雪原牧场 · 原创练习场', labelEn: 'Snow Meadow · Practice',
    descriptionZh: '原创开发验证地图：平坦雪地与北侧冻湖。非原版地图。',
    descriptionEn: 'Original development map: snowy meadows and a northern lake. Not an original game map.',
    width: 36, height: 36, seed: 882103, spawn: { x: 6, y: 6 }, provenance: 'original-development',
  },
  {
    id: 'river-town', labelZh: '河畔小镇 · 原创练习场', labelEn: 'River Town · Practice',
    descriptionZh: '原创开发验证地图：河流与两条可通行的土堤。非原版地图。',
    descriptionEn: 'Original development map: a river with two passable causeways. Not an original game map.',
    width: 36, height: 36, seed: 450277, spawn: { x: 6, y: 6 }, provenance: 'original-development',
  },
];
export const MAP_CATALOG = MAPS;
export function getMap(id: string): MapDefinition | undefined { return MAPS.find(map => map.id === id); }

/** Fresh cells on every call. Safe starting district is x=2..17,y=2..17. */
export function createTerrain(map: MapDefinition): TerrainCell[] {
  const cells: TerrainCell[] = [];
  let seed = map.seed >>> 0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const noise = random();
      let kind: TerrainCell['kind'] = map.id === 'snow-meadow' ? 'snow' : 'grass';
      if (map.id === 'cedar-bay' && x >= 29 + Math.floor(Math.sin(y / 5) * 2)) kind = 'water';
      if (map.id === 'snow-meadow' && x > 20 && y < 10) kind = 'water';
      if (map.id === 'river-town' && x >= 22 && x <= 24) kind = y === 12 || y === 26 ? 'road' : 'water';
      if (kind !== 'water' && kind !== 'road' && (x > 17 || y > 18) && noise < 0.045) kind = 'rock';
      if (map.id === 'cedar-bay' && x === 27 && kind === 'grass') kind = 'sand';
      cells.push({ kind, height: kind === 'water' ? 0 : 1, ore: 0 });
    }
  }
  // Near ore and approach lanes are explicit, never dependent on random generation.
  for (const [ox, oy] of [[14, 8], [10, 20], [28, 24]]) {
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) {
      const cell = cells[(oy + dy) * map.width + ox + dx];
      if (cell.kind !== 'water') { cell.kind = 'ore'; cell.ore = 160 + Math.floor(random() * 80); }
    }
  }
  return cells;
}
