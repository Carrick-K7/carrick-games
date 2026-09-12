import { Game2048 } from './game2048.js';
import type { GameHost } from '@carrick/game-sdk/game';
import packageJson from '../package.json';

export { Game2048 } from './game2048.js';

export const apiVersion = 1 as const;
export const id = '2048';
export const version = packageJson.version;

export function create(host: GameHost) {
  return new Game2048(host);
}
