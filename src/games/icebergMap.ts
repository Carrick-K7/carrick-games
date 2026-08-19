// Iceberg Strike — pure map data for de_iceberg, the one and only map.
// Bomb-defusal layout: T spawn (SW) pushes through three lanes — west A
// corridor, central mid plaza, and the east B approach — toward two bomb
// sites guarded by the CT spawn (NE).
//
// Tile legend:
//   '#' ice wall        'C' shipping container   'K' wooden crate
//   'S' snow bank       '.' snow floor
//   '1'-'6' T spawn slots                        'P','Q','R','U','V' CT spawn slots
// The outer border is solid so the playfield is always enclosed.

export const MAP_COLS = 24;
export const MAP_ROWS = 16;

export const ICEBERG_MAP: string[] = [
  '########################',
  '#...........#....P.Q.R.#',
  '#..K...C.......K...U.V.#',
  '#...........#..........#',
  '#..C....S...#####..C...#',
  '#...........#..........#',
  '#....K.......C....K....#',
  '#.S..............#.....#',
  '#.......####.....#..C..#',
  '#.......#....K...#.....#',
  '#..C....#.....C..#.....#',
  '#.......#........#.....#',
  '#..1.2.....K...........#',
  '#.3...4.........C......#',
  '#..5.6.....K.......S...#',
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

function scanPositions(match: (ch: string) => boolean): MapPoint[] {
  const out: MapPoint[] = [];
  for (let r = 0; r < MAP_ROWS; r++) {
    const row = ICEBERG_MAP[r];
    for (let c = 0; c < MAP_COLS; c++) {
      if (match(row[c] ?? '.')) out.push({ x: c + 0.5, y: r + 0.5 });
    }
  }
  return out;
}

// Terrorist spawn slots (south-west camp).
export const T_SPAWN_POINTS: MapPoint[] = scanPositions((ch) => ch >= '1' && ch <= '9');

// Counter-terrorist spawn slots (north-east camp). PLAYER_START stays the
// canonical first CT slot for legacy callers and tests.
export const CT_SPAWN_POINTS: MapPoint[] = scanPositions(
  (ch) => ch === 'P' || ch === 'Q' || ch === 'R' || ch === 'U' || ch === 'V',
);

export const PLAYER_START: MapPoint & { angle: number } = (() => {
  const first = CT_SPAWN_POINTS[0] ?? { x: 17.5, y: 1.5 };
  return { ...first, angle: Math.PI / 2 };
})();

export interface BombSite extends MapPoint {
  id: 'A' | 'B';
  radius: number;
}

// Two objective areas on the single Iceberg map. A covers the north-west
// container yard; B covers the eastern dock lane.
export const BOMB_SITES: BombSite[] = [
  { id: 'A', x: 5.5, y: 2.5, radius: 2.4 },
  { id: 'B', x: 20.5, y: 11.5, radius: 2.4 },
];

export function bombSiteAt(x: number, y: number): BombSite | null {
  for (const site of BOMB_SITES) {
    if (Math.hypot(x - site.x, y - site.y) <= site.radius) return site;
  }
  return null;
}

// Breadth-first walkable path between two map points (tile centers). Shared
// by bot routing and tests; returns null when no route exists.
export function findMapPath(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
): MapPoint[] | null {
  const startC = Math.floor(sx);
  const startR = Math.floor(sy);
  const endC = Math.floor(tx);
  const endR = Math.floor(ty);
  if (isSolidTile(startC, startR) || isSolidTile(endC, endR)) return null;
  if (startC === endC && startR === endR) return [];
  const startKey = startC * 1000 + startR;
  const endKey = endC * 1000 + endR;
  const prev = new Map<number, number>();
  const visited = new Set<number>([startKey]);
  const queue: number[] = [startKey];
  let found = false;
  while (queue.length > 0) {
    const key = queue.shift() as number;
    if (key === endKey) {
      found = true;
      break;
    }
    const c = Math.floor(key / 1000);
    const r = key % 1000;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= MAP_COLS || nr >= MAP_ROWS) continue;
      if (isSolidTile(nc, nr)) continue;
      const nk = nc * 1000 + nr;
      if (visited.has(nk)) continue;
      visited.add(nk);
      prev.set(nk, key);
      queue.push(nk);
    }
  }
  if (!found) return null;
  const path: MapPoint[] = [];
  let key = endKey;
  while (key !== startKey) {
    const c = Math.floor(key / 1000);
    const r = key % 1000;
    path.push({ x: c + 0.5, y: r + 0.5 });
    key = prev.get(key) as number;
  }
  path.reverse();
  return path;
}
