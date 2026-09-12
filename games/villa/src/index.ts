import { VillaGame } from './villa.js';
import type { GameHost } from '@carrick/game-sdk/game';
import packageJson from '../package.json';

export { VillaGame } from './villa.js';

export const apiVersion = 1 as const;
export const id = 'villa';
export const version = packageJson.version;

export function create(host: GameHost) {
  return new VillaGame(host);
}
