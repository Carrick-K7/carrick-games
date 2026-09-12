import { test, expect } from '@playwright/test';
import {
  BUY_ZONE,
  CT_SPAWNS,
  ICEBERG_MAP,
  MAP_COLS,
  MAP_ROWS,
  T_SPAWNS,
  TILE,
  findMapPath,
  inBuyZone,
  isSolidTile,
  isWalkable,
} from '../src/counterstrikeMap';
import { WEAPONS } from '../src/counterstrikeRules';

if (!process.env.GAME_ID || process.env.GAME_ID === 'cs-kimi') {
  test.describe('Game rules', () => {
    test('fy_iceworld matches the original arena: closed, connected, real spawn lanes', () => {
      expect(ICEBERG_MAP).toHaveLength(MAP_ROWS);
      for (const row of ICEBERG_MAP) {
        expect(row).toHaveLength(MAP_COLS);
      }

      // solid outer border
      for (let c = 0; c < MAP_COLS; c++) {
        expect(isSolidTile(c, 0)).toBe(true);
        expect(isSolidTile(c, MAP_ROWS - 1)).toBe(true);
      }
      for (let r = 0; r < MAP_ROWS; r++) {
        expect(isSolidTile(0, r)).toBe(true);
        expect(isSolidTile(MAP_COLS - 1, r)).toBe(true);
      }

      // the buyzone spans the central corridors; its walkable heart is open
      const center = { x: (BUY_ZONE.col + BUY_ZONE.cols / 2) * TILE, y: (BUY_ZONE.row + BUY_ZONE.rows / 2) * TILE };
      expect(inBuyZone(center.x, center.y)).toBe(true);
      const walkableInZone = BUY_ZONE.cols * BUY_ZONE.rows;
      expect(walkableInZone).toBeGreaterThan(0);

      // CT spawns line the bottom (blue) end, T spawns the top (red) end, and
      // every spawn column's gun tier is a real weapon.
      expect(CT_SPAWNS.length).toBeGreaterThanOrEqual(6);
      expect(T_SPAWNS.length).toBeGreaterThanOrEqual(6);
      for (const point of CT_SPAWNS) {
        expect(point.row).toBeGreaterThan(MAP_ROWS * 0.75);
        expect(point.x).toBeLessThan(MAP_COLS * TILE);
        expect(isWalkable(Math.floor(point.x / TILE), Math.floor(point.y / TILE))).toBe(true);
        expect(WEAPONS[point.weapon]).toBeTruthy();
      }
      for (const point of T_SPAWNS) {
        expect(point.row).toBeLessThan(MAP_ROWS * 0.25);
        expect(isWalkable(Math.floor(point.x / TILE), Math.floor(point.y / TILE))).toBe(true);
        expect(WEAPONS[point.weapon]).toBeTruthy();
      }

      // the map is fully connected: every CT spawn reaches every T spawn
      for (const ct of CT_SPAWNS) {
        for (const t of T_SPAWNS) {
          expect(findMapPath(ct.x, ct.y, t.x, t.y)).not.toBeNull();
        }
      }
    });
  });
}
