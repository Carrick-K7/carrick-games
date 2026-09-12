import { test, expect } from '@playwright/test';
import {
  IWANNA_PLAYER_H,
  IWANNA_PLAYER_W,
  resolveIwannaHorizontalMove,
} from '../src/iwannaPhysics';

if (!process.env.GAME_ID || process.env.GAME_ID === 'iwanna') {
  test.describe('Game rules', () => {
    test('iwanna horizontal movement stops at platform edges', () => {
      const platform = { x: 100, y: 100, w: 80, h: 20 };
      const player = {
        x: platform.x - IWANNA_PLAYER_W - 1,
        y: platform.y + 1,
        vx: 154,
        vy: 0,
        onGround: false,
      };

      const moved = resolveIwannaHorizontalMove(player, [platform], 12, 480);

      expect(moved.x + IWANNA_PLAYER_W).toBeLessThanOrEqual(platform.x);
      expect(moved.y + IWANNA_PLAYER_H).toBeGreaterThan(platform.y);
    });
  });
}
