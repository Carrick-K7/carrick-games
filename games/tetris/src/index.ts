import { TetrisGame } from './tetris.js';
import type { GameHost } from '@carrick/game-sdk/game';
import packageJson from '../package.json';

export { TetrisGame } from './tetris.js';

export const apiVersion = 1 as const;
export const id = 'tetris';
export const version = packageJson.version;

export function create(host: GameHost) {
  return new TetrisGame(host);
}
