import { MinesweeperGame } from './minesweeper.js';
import type { GameHost } from '@carrick/game-sdk/game';
import packageJson from '../package.json';

export { MinesweeperGame } from './minesweeper.js';

export const apiVersion = 1 as const;
export const id = 'minesweeper';
export const version = packageJson.version;

export function create(host: GameHost) {
  return new MinesweeperGame(host);
}
