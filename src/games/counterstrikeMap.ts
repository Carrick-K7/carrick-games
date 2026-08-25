// fy_iceworld — the real map, tile-for-tile.
//
// The tile grid below was transcribed from the original fy_iceworld.bsp
// (v30, "cs_iceworld by Fantasy - for Counter Strike"): every wall face,
// spawn point, armoury pickup and the buyzone brush were read straight out
// of the map's entity and geometry lumps, then rasterized at 32 units per
// tile. The result keeps the authentic maze: beveled corner walls, six
// spawn lanes at each end, two rows of guns per side, and the long central
// corridors whose crossing is the only buyzone.
// https://www.rockpapershotgun.com/the-legacy-of-fy_iceworld-counter-strikes-divisive-and-hugely-popular-custom-map
// https://buff.163.com/news/21880

import type { WeaponId } from './counterstrikeRules.js';

export const TILE = 60;
export const MAP_COLS = 48;
export const MAP_ROWS = 56;
export const MAP_PIXEL_X = MAP_COLS * TILE; // 2880
export const MAP_PIXEL_Y = MAP_ROWS * TILE; // 3360

export const TileKind = {
  Floor: 0,
  Wall: 1,
} as const;
export type TileKind = (typeof TileKind)[keyof typeof TileKind];

// Wall layout from the real map: every cell was sampled through the map's
// collision BSP (clipnodes) at 32 units per cell — the engine's own
// walkability answer. T end at the top: four large ice blocks around an
// open cross of corridors, beveled corners, and perimeter lanes.
const LAYOUT = [
  '################################################',
  '################################################',
  '######................####................######',
  '#####.................####.................#####',
  '####..................####..................####',
  '###....................##....................###',
  '##.....................##....................###',
  '##...........................................###',
  '##...........................................###',
  '##...........................................###',
  '##...........................................###',
  '##...........................................###',
  '##...........................................###',
  '##.......############......###########.......###',
  '##.......#############....############.......###',
  '##.......#############....############.......###',
  '##.......#############....############.......###',
  '##.......#############...#############.......###',
  '##.......#############...#############.......###',
  '##.......#############...#############.......###',
  '##.......#############...#############.......###',
  '##.......#############...#############.......###',
  '##.......#############...#############.......###',
  '##.......#############...#############.......###',
  '##.......#############....############.......###',
  '##........###########......###########.......###',
  '##...........................................###',
  '##...........................................###',
  '##...........................................###',
  '##...........#######........#######..........###',
  '##........###########......###########.......###',
  '##.......#############....############.......###',
  '##.......#############...#############.......###',
  '##.......#############...#############.......###',
  '##.......#############...#############.......###',
  '##.......#############...#############.......###',
  '##.......#############...#############.......###',
  '##.......#############...#############.......###',
  '##.......#############...#############.......###',
  '##.......#############....############.......###',
  '##.......#############....############.......###',
  '##.......#############....############.......###',
  '##...........................................###',
  '##...........................................###',
  '##...........................................###',
  '##...........................................###',
  '##...........................................###',
  '##...........................................###',
  '##...........................................###',
  '##.....................##....................###',
  '###....................##....................###',
  '####..................####..................####',
  '#####.................####.................#####',
  '################################################',
  '################################################',
  '################################################',
];

export const ICEBERG_MAP: number[][] = LAYOUT.map((row) =>
  [...row].map((ch) => (ch === '#' ? TileKind.Wall : TileKind.Floor)),
);

export function tileAt(col: number, row: number): TileKind {
  if (col < 0 || row < 0 || col >= MAP_COLS || row >= MAP_ROWS) return TileKind.Wall;
  return ICEBERG_MAP[row][col] as TileKind;
}

export function tileKindAt(x: number, y: number): TileKind {
  return tileAt(Math.floor(x / TILE), Math.floor(y / TILE));
}

export function isSolidTile(col: number, row: number): boolean {
  return tileAt(col, row) === TileKind.Wall;
}

export function isWalkable(col: number, row: number): boolean {
  return tileAt(col, row) === TileKind.Floor;
}

/** Circle collision against the wall grid (corner sampling). */
export function solidCircle(cx: number, cy: number, r: number): boolean {
  return (
    isSolidTile(Math.floor((cx - r) / TILE), Math.floor((cy - r) / TILE)) ||
    isSolidTile(Math.floor((cx + r) / TILE), Math.floor((cy - r) / TILE)) ||
    isSolidTile(Math.floor((cx - r) / TILE), Math.floor((cy + r) / TILE)) ||
    isSolidTile(Math.floor((cx + r) / TILE), Math.floor((cy + r) / TILE))
  );
}

// ── Buyzone ──────────────────────────────────────────────────────────────────
// The real map's func_buyzone brush spans x 224–544, y −800–−480 in map
// units: the wide crossing of the central corridors.

export const BUY_ZONE = { col: 19, row: 23, cols: 10, rows: 10 };
export const BUY_ZONE_RECT = {
  x: BUY_ZONE.col * TILE,
  y: BUY_ZONE.row * TILE,
  w: BUY_ZONE.cols * TILE,
  h: BUY_ZONE.rows * TILE,
};

export function inBuyZone(x: number, y: number): boolean {
  return (
    x >= BUY_ZONE_RECT.x &&
    x <= BUY_ZONE_RECT.x + BUY_ZONE_RECT.w &&
    y >= BUY_ZONE_RECT.y &&
    y <= BUY_ZONE_RECT.y + BUY_ZONE_RECT.h
  );
}

// ── Spawn points and the guns aligned with them ──────────────────────────────
// From the real map: T spawns at map y −1216/−1344, CT spawns at y −64/64,
// 12 per team along six lanes. Each spawn column carries a gun one tier in
// front of it (armoury rows at y −1152/−1280 / −128/−160… exactly as the
// map drops them).

export interface SpawnPoint {
  x: number;
  y: number;
  weapon: WeaponId;
  row: number;
  col: number;
}

function sp(col: number, row: number, weapon: WeaponId): SpawnPoint {
  return { x: (col + 0.5) * TILE, y: (row + 0.5) * TILE, weapon, row, col };
}

// T side (top end). Outer lane (row 6) pairs with knife/deagle/fiveseven/
// m3/elite/usp (row 8); inner lane (row 10) with the SMG row (row 12).
export const T_SPAWNS: SpawnPoint[] = [
  sp(12, 6, 'knife'), sp(16, 6, 'deagle'), sp(20, 6, 'fiveseven'),
  sp(28, 6, 'm3'), sp(32, 6, 'elite'), sp(36, 6, 'usp'),
  sp(12, 10, 'glock'), sp(16, 10, 'mp5'), sp(20, 10, 'ump45'),
  sp(28, 10, 'p90'), sp(32, 10, 'mac10'), sp(36, 10, 'p228'),
];

// CT side (bottom end): mirror of the T side.
export const CT_SPAWNS: SpawnPoint[] = [
  sp(12, 50, 'knife'), sp(16, 50, 'deagle'), sp(20, 50, 'fiveseven'),
  sp(28, 50, 'm3'), sp(32, 50, 'elite'), sp(36, 50, 'usp'),
  sp(12, 46, 'glock'), sp(16, 46, 'mp5'), sp(20, 46, 'ump45'),
  sp(28, 46, 'p90'), sp(32, 46, 'mac10'), sp(36, 46, 'p228'),
];

// ── Pathfinding (A* over the tile grid) ─────────────────────────────────────

export interface MapPathPoint {
  x: number;
  y: number;
}

const DIRS = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
  { dx: 1, dy: 1 },
  { dx: 1, dy: -1 },
  { dx: -1, dy: 1 },
  { dx: -1, dy: -1 },
];

export function findMapPath(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): MapPathPoint[] | null {
  const startC = Math.floor(fromX / TILE);
  const startR = Math.floor(fromY / TILE);
  const goalC = Math.floor(toX / TILE);
  const goalR = Math.floor(toY / TILE);
  const index = (c: number, r: number) => r * MAP_COLS + c;

  if (!isWalkable(startC, startR) || !isWalkable(goalC, goalR)) return null;
  if (startC === goalC && startR === goalR) return [{ x: toX, y: toY }];

  const open: number[] = [index(startC, startR)];
  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>([[index(startC, startR), 0]]);
  const closed = new Set<number>();
  const h = (c: number, r: number) => Math.abs(c - goalC) + Math.abs(r - goalR);

  while (open.length > 0) {
    open.sort((a, b) => (gScore.get(a) ?? Infinity) - (gScore.get(b) ?? Infinity));
    const current = open.shift() as number;
    if (current === index(goalC, goalR)) break;
    if (closed.has(current)) continue;
    closed.add(current);
    const c = current % MAP_COLS;
    const r = Math.floor(current / MAP_COLS);

    for (const dir of DIRS) {
      const nc = c + dir.dx;
      const nr = r + dir.dy;
      if (!isWalkable(nc, nr)) continue;
      if (dir.dx !== 0 && dir.dy !== 0 && (!isWalkable(c + dir.dx, r) || !isWalkable(c, r + dir.dy))) {
        continue;
      }
      const next = index(nc, nr);
      if (closed.has(next)) continue;
      const cost = gScore.get(current)! + (dir.dx !== 0 && dir.dy !== 0 ? 1.42 : 1);
      if (cost < (gScore.get(next) ?? Infinity)) {
        gScore.set(next, cost);
        cameFrom.set(next, current);
        open.push(next);
      }
    }
  }

  const goal = index(goalC, goalR);
  if (!cameFrom.has(goal) && goal !== index(startC, startR)) return null;

  const path: MapPathPoint[] = [];
  let cur = goal;
  while (cur !== index(startC, startR)) {
    path.push({
      x: (cur % MAP_COLS) * TILE + TILE / 2,
      y: Math.floor(cur / MAP_COLS) * TILE + TILE / 2,
    });
    const prev = cameFrom.get(cur);
    if (prev === undefined) return null;
    cur = prev;
  }
  path.reverse();
  path.push({ x: toX, y: toY });
  return path;
}

/** Snap an arbitrary (possibly wall) tile to the nearest walkable tile. */
export function nearestWalkableTile(col: number, row: number): { col: number; row: number } {
  if (isWalkable(col, row)) return { col, row };
  for (let ring = 1; ring < 14; ring++) {
    for (let dc = -ring; dc <= ring; dc++) {
      for (let dr = -ring; dr <= ring; dr++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue;
        if (isWalkable(col + dc, row + dr)) return { col: col + dc, row: row + dr };
      }
    }
  }
  return { col, row };
}

// ── Line of sight ───────────────────────────────────────────────────────────

export function hasLineOfSight(x1: number, y1: number, x2: number, y2: number): boolean {
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(1, Math.ceil(dist / (TILE / 4)));
  const dx = (x2 - x1) / steps;
  const dy = (y2 - y1) / steps;
  let x = x1;
  let y = y1;
  for (let i = 0; i <= steps; i++) {
    if (isSolidTile(Math.floor(x / TILE), Math.floor(y / TILE))) return false;
    x += dx;
    y += dy;
  }
  return true;
}

/** Distance along a ray to the first wall, up to maxDist. */
export function raycastWall(x: number, y: number, dx: number, dy: number, maxDist: number): number {
  const steps = Math.max(1, Math.ceil(maxDist / (TILE / 4)));
  const step = maxDist / steps;
  for (let i = 0; i <= steps; i++) {
    const d = i * step;
    const tx = Math.floor((x + dx * d) / TILE);
    const ty = Math.floor((y + dy * d) / TILE);
    if (isSolidTile(tx, ty)) return Math.max(0, d - TILE / 8);
  }
  return maxDist;
}

// ── Textured raycast (DDA) for the first-person renderer ────────────────────

export interface RayResult {
  dist: number;
  side: 0 | 1;
  wallX: number;
  kind: TileKind;
  col: number;
  row: number;
}

/**
 * DDA raycast over the tile grid, returning the hit distance, wall face, and
 * the fractional texture coordinate. World units are pixels (TILE = 30).
 */
export function castRay(px: number, py: number, dirX: number, dirY: number, maxDist: number): RayResult {
  const unitX = px / TILE;
  const unitY = py / TILE;
  let mapX = Math.floor(unitX);
  let mapY = Math.floor(unitY);
  const deltaX = dirX === 0 ? 1e30 : Math.abs(1 / dirX);
  const deltaY = dirY === 0 ? 1e30 : Math.abs(1 / dirY);
  const stepX = dirX < 0 ? -1 : 1;
  const stepY = dirY < 0 ? -1 : 1;
  let sideX = dirX < 0 ? (unitX - mapX) * deltaX : (mapX + 1 - unitX) * deltaX;
  let sideY = dirY < 0 ? (unitY - mapY) * deltaY : (mapY + 1 - unitY) * deltaY;
  let side: 0 | 1 = 0;
  let dist = 0;
  for (let i = 0; i < 128; i++) {
    if (sideX < sideY) {
      sideX += deltaX;
      mapX += stepX;
      side = 0;
    } else {
      sideY += deltaY;
      mapY += stepY;
      side = 1;
    }
    dist = (side === 0 ? sideX - deltaX : sideY - deltaY) * TILE;
    if (dist > maxDist) break;
    if (isSolidTile(mapX, mapY)) {
      let wallX = side === 0 ? unitY + (dist / TILE) * dirY : unitX + (dist / TILE) * dirX;
      wallX -= Math.floor(wallX);
      return { dist, side, wallX, kind: tileAt(mapX, mapY), col: mapX, row: mapY };
    }
  }
  return { dist: maxDist, side, wallX: 0, kind: TileKind.Floor, col: -1, row: -1 };
}

export type WallTint = 'blue' | 'red';

/** CT half (bottom end) walls lean blue, T half (top end) lean red. */
export function wallTintAt(_col: number, row: number): WallTint {
  return row >= MAP_ROWS / 2 ? 'blue' : 'red';
}
