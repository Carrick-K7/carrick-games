// Iceberg Strike raycast engine helpers. Kept separate from game rules so the
// renderer, player hitscan, enemy line-of-sight and tests share one DDA
// implementation.

import { isSolidTile, tileKindAt, TileKind } from './icebergMap.js';

export interface RayResult {
  dist: number;
  side: 0 | 1;
  wallX: number;
  kind: TileKind;
}

export function castRay(px: number, py: number, dirX: number, dirY: number, maxDist: number): RayResult {
  let mapX = Math.floor(px);
  let mapY = Math.floor(py);
  const deltaX = dirX === 0 ? 1e30 : Math.abs(1 / dirX);
  const deltaY = dirY === 0 ? 1e30 : Math.abs(1 / dirY);
  const stepX = dirX < 0 ? -1 : 1;
  const stepY = dirY < 0 ? -1 : 1;
  let sideX = dirX < 0 ? (px - mapX) * deltaX : (mapX + 1 - px) * deltaX;
  let sideY = dirY < 0 ? (py - mapY) * deltaY : (mapY + 1 - py) * deltaY;
  let side: 0 | 1 = 0;
  let dist = 0;
  for (let i = 0; i < 96; i++) {
    if (sideX < sideY) {
      sideX += deltaX;
      mapX += stepX;
      side = 0;
    } else {
      sideY += deltaY;
      mapY += stepY;
      side = 1;
    }
    dist = side === 0 ? sideX - deltaX : sideY - deltaY;
    if (dist > maxDist) break;
    if (isSolidTile(mapX, mapY)) {
      let wallX = side === 0 ? py + dist * dirY : px + dist * dirX;
      wallX -= Math.floor(wallX);
      return { dist, side, wallX, kind: tileKindAt(mapX, mapY) };
    }
  }
  return { dist: maxDist, side, wallX: 0, kind: TileKind.Floor };
}

export function hasLineOfSight(x1: number, y1: number, x2: number, y2: number): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-4) return true;
  const hit = castRay(x1, y1, dx / len, dy / len, len);
  return hit.dist >= len - 0.05;
}
