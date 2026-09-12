import { describe, expect, it } from 'vitest';
import { evaluatePreflopStrength, hasFlushDraw, hasStraightDraw } from '../src/texasholdRules';

if (!process.env.GAME_ID || process.env.GAME_ID === 'texashold') {
  describe('extracted game rules', () => {
    it('scores strong poker openings and detects draws', () => {
      expect(evaluatePreflopStrength([{ suit: 0, rank: 14 }, { suit: 0, rank: 14 }])).toBe(100);
      expect(hasFlushDraw([0, 1, 2, 3].map((rank) => ({ suit: 2, rank })))).toBe(true);
      expect(hasStraightDraw([2, 3, 4, 5].map((rank) => ({ suit: 0, rank })))).toBe(true);
    });
  });
}
