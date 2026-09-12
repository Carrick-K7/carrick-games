import { test, expect } from '@playwright/test';
import { calculateSudokuScore } from '../src/sudokuScore';

if (!process.env.GAME_ID || process.env.GAME_ID === 'sudoku') {
  test.describe('Game rules', () => {
    test('sudoku hints reduce final score', () => {
      const cleanSolve = calculateSudokuScore(120, 0, 0);
      const withHints = calculateSudokuScore(120, 0, 2);
      const withMistake = calculateSudokuScore(120, 1, 0);

      expect(withHints).toBeLessThan(cleanSolve);
      expect(withMistake).toBeLessThan(cleanSolve);
      expect(calculateSudokuScore(9999, 10, 10)).toBe(0);
    });
  });
}
