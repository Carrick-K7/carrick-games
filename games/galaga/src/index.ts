import { GalagaGame } from './galaga.js';
import type { GameHost } from '@carrick/game-sdk/game';
import packageJson from '../package.json';

export { GalagaGame } from './galaga.js';

export const apiVersion = 1 as const;
export const id = 'galaga';
export const version = packageJson.version;

export function create(host: GameHost) {
  return new GalagaGame(host);
}
