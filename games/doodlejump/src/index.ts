import { DoodleJumpGame } from './doodlejump.js';
import type { GameHost } from '@carrick/game-sdk/game';
import packageJson from '../package.json';

export { DoodleJumpGame } from './doodlejump.js';

export const apiVersion = 1 as const;
export const id = 'doodlejump';
export const version = packageJson.version;

export function create(host: GameHost) {
  return new DoodleJumpGame(host);
}
