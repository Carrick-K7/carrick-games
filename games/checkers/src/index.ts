import { CheckersGame } from './checkers.js';
import type { GameHost } from '@carrick/game-sdk/game';
import packageJson from '../package.json';

export { CheckersGame } from './checkers.js';

export const apiVersion = 1 as const;
export const id = 'checkers';
export const version = packageJson.version;

export function create(host: GameHost) {
  return new CheckersGame(host);
}
