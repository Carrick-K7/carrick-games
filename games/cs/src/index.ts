import { CsGame } from './cs.js';
import type { GameHost } from '@carrick/game-sdk/game';
import packageJson from '../package.json';

export { CsGame } from './cs.js';

export const apiVersion = 1 as const;
export const id = 'cs';
export const version = packageJson.version;

export function create(host: GameHost) {
  return new CsGame(host);
}
