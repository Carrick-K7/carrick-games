import { SimonGame } from './simon.js';
import type { GameHost } from '@carrick/game-sdk/game';
import packageJson from '../package.json';

export { SimonGame } from './simon.js';

export const apiVersion = 1 as const;
export const id = 'simon';
export const version = packageJson.version;

export function create(host: GameHost) {
  return new SimonGame(host);
}
