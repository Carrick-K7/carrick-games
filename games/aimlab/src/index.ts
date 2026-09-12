import { AimLabGame } from './aimlab.js';
import type { GameHost } from '@carrick/game-sdk/game';
import packageJson from '../package.json';

export { AimLabGame } from './aimlab.js';

export const apiVersion = 1 as const;
export const id = 'aimlab';
export const version = packageJson.version;

export function create(host: GameHost) {
  return new AimLabGame(host);
}
