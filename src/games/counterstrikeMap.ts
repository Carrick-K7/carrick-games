// fy_iceworld — pure map data for the CS 1.6 port.
//
// The real fy_iceworld is a small square cut into a four-block grid: two
// crossing wall bands divide the arena into four open quadrants that only
// meet at an open cross in the middle. CT spawns on the blue (left) side,
// T on the red (right) side, every spawn sits on top of a gun pickup, and
// the only buyzone is the exposed center cross.
// https://www.rockpapershotgun.com/the-legacy-of-fy_iceworld-counter-strikes-divisive-and-hugely-popular-custom-map
// https://buff.163.com/news/21880

import type { WeaponId } from './counterstrikeRules.js';

export const TILE = 30;
export const MAP_COLS = 16;
export const MAP_ROWS = 16;
export const MAP_PIXEL = MAP_COLS * TILE; // 480

export const TileKind = {
  Floor: 0,
  Wall: 1,
} as const;
export type TileKind = (typeof TileKind)[keyof typeof TileKind];

// '#' = wall, '.' = floor.
//
// fy_iceworld: a square cut into four rooms by two crossing wall bands. Each
// band leaves a doorway at its inner end, so all four rooms open into the
// exposed open cross in the middle — the map's only buyzone. Spawns near the
// inner rows/columns have direct line of sight into the enemy rooms at round
// start, exactly like the original ("instantaneous danger or brief safety").
const LAYOUT = [
  '################',
  '#......##......#',
  '#......##......#',
  '#......##......#',
  '#......##......#',
  '#..............#',
  '#..............#',
  '#####......#####',
  '#####......#####',
  '#..............#',
  '#..............#',
  '#......##......#',
  '#......##......#',
  '#......##......#',
  '#......##......#',
  '################',
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

// ── Buyzone (the exposed center cross) ──────────────────────────────────────

export const BUY_ZONE = { col: 7, row: 7, cols: 2, rows: 2 };
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

// ── Spawn points and the weapon under each spawn ────────────────────────────

export interface SpawnPoint {
  x: number;
  y: number;
  weapon: WeaponId;
}

function px(col: number, row: number): { x: number; y: number } {
  return { x: (col + 0.5) * TILE, y: (row + 0.5) * TILE };
}

// CT: blue side (left rooms), T: red side (right rooms). Guns vary per spawn,
// faithful to "a different gun under each player start".
export const CT_SPAWNS: SpawnPoint[] = [
  { ...px(1.5, 1.5), weapon: 'm4a1' },
  { ...px(5, 2.5), weapon: 'mp5' },
  { ...px(2.5, 5), weapon: 'deagle' },
  { ...px(5.5, 5.5), weapon: 'xm1014' },
  { ...px(1.5, 9.5), weapon: 'sg550' },
  { ...px(5, 10.5), weapon: 'usp' },
  { ...px(2.5, 13), weapon: 'm3' },
  { ...px(5.5, 13.5), weapon: 'p228' },
];

export const T_SPAWNS: SpawnPoint[] = [
  { ...px(10.5, 1.5), weapon: 'ak47' },
  { ...px(13.5, 2.5), weapon: 'awp' },
  { ...px(10.5, 5), weapon: 'mac10' },
  { ...px(13.5, 5.5), weapon: 'deagle' },
  { ...px(10.5, 9.5), weapon: 'sg552' },
  { ...px(13.5, 10.5), weapon: 'm249' },
  { ...px(10.5, 13), weapon: 'glock' },
  { ...px(13.5, 13.5), weapon: 'elite' },
];

// Grenades scattered around the map, like the real fy_iceworld.
export interface NadePickup {
  x: number;
  y: number;
  nade: 'he' | 'flash' | 'smoke';
}

export const NADE_PICKUPS: NadePickup[] = [
  { ...px(3, 3), nade: 'he' },
  { ...px(3, 12), nade: 'he' },
  { ...px(12, 3), nade: 'he' },
  { ...px(12, 12), nade: 'he' },
  { ...px(6.5, 7.5), nade: 'flash' },
  { ...px(8.5, 7.5), nade: 'smoke' },
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
      // No corner cutting through wall diagonals.
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
