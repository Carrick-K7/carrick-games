import { describe, expect, it } from 'vitest';
import { canPlaceOnFoundation, canPlaceOnTableau } from '../src/solitaireRules';

if (!process.env.GAME_ID || process.env.GAME_ID === 'solitaire') {
  describe('extracted game rules', () => {
    it('enforces Solitaire tableau and foundation rules', () => {
      const redQueen = { suit: 0, rank: 11, faceUp: true };
      const blackKing = { suit: 2, rank: 12, faceUp: true };
      expect(canPlaceOnTableau(redQueen, [blackKing])).toBe(true);
      expect(canPlaceOnFoundation({ suit: 1, rank: 0, faceUp: true }, [])).toBe(true);
    });
  });
}
