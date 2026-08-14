// Iceberg Strike — pure map data for the Iceberg battleground.
// Tile legend:
//   '#' ice wall        'C' shipping container   'K' wooden crate
//   'S' snow bank       '.' snow floor           'P' player start
//   '1'-'6' enemy spawn points                   'H' medkit spot
//   'A' ammo spot
// The outer border is solid so the playfield is always enclosed.

export const MAP_COLS = 24;
export const MAP_ROWS = 16;

export const ICEBERG_MAP: string[] = [
  '########################',
  '#..........#...........#',
  '#..K...C....#....K.....#',
  '#....S......#.....S....#',
  '#P........K.#....C.....#',
  '#..........H...........#',
  '#..CA..S...........K.H.#',
  '#.......#........#.....#',
  '#..K....#...1....#..2A.#',
  '#.......#........#.....#',
  '#..S...H....K..........#',
  '#...........#....C.....#',
  '#..3...K....#....4.....#',
  '#...........A....S.....#',
  '#....5......#....6.....#',
  '########################',
];

export enum TileKind {
  Floor = 0,
  IceWall = 1,
  Crate = 2,
  Container = 3,
  SnowBank = 4,
}

function charToKind(ch: string): TileKind {
  switch (ch) {
    case '#': return TileKind.IceWall;
    case 'C': return TileKind.Container;
    case 'K': return TileKind.Crate;
    case 'S': return TileKind.SnowBank;
    default: return TileKind.Floor;
  }
}

export function tileKindAt(col: number, row: number): TileKind {
  if (col < 0 || row < 0 || col >= MAP_COLS || row >= MAP_ROWS) return TileKind.IceWall;
  return charToKind(ICEBERG_MAP[row][col] ?? '.');
}

export function isSolidTile(col: number, row: number): boolean {
  return tileKindAt(col, row) !== TileKind.Floor;
}

export function isWalkable(col: number, row: number): boolean {
  return !isSolidTile(col, row);
}

interface MapPoint {
  x: number;
  y: number;
}

function scanPositions(match: (ch: string) => string | null): MapPoint[] {
  const out: MapPoint[] = [];
  for (let r = 0; r < MAP_ROWS; r++) {
    const row = ICEBERG_MAP[r];
    for (let c = 0; c < MAP_COLS; c++) {
      const ch = row[c] ?? '.';
      if (match(ch) !== null) out.push({ x: c + 0.5, y: r + 0.5 });
    }
  }
  return out;
}

export const PLAYER_START: MapPoint & { angle: number } = (() => {
  const found = scanPositions((ch) => (ch === 'P' ? 'P' : null));
  return { ...(found[0] ?? { x: 2.5, y: 4.5 }), angle: 0.45 };
})();

export const SPAWN_POINTS: MapPoint[] = scanPositions((ch) =>
  ch >= '1' && ch <= '9' ? ch : null,
);

export interface PickupSpot extends MapPoint {
  kind: 'med' | 'ammo';
}

export const PICKUP_SPOTS: PickupSpot[] = scanPositions((ch) =>
  ch === 'H' || ch === 'A' ? ch : null,
).map((point) => {
  const ch = ICEBERG_MAP[Math.floor(point.y)][Math.floor(point.x)];
  return { ...point, kind: ch === 'H' ? 'med' : 'ammo' };
});
