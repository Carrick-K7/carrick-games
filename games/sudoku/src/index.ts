import { SudokuGame } from './sudoku.js';
import type { GameHost } from '@carrick/game-sdk/game';
import packageJson from '../package.json';

export { SudokuGame } from './sudoku.js';

export const apiVersion = 1 as const;
export const id = 'sudoku';
export const version = packageJson.version;

export function create(host: GameHost) {
  return new SudokuGame(host);
}
