import { TexasHoldGame } from './texashold.js';
import type { GameHost } from '@carrick/game-sdk/game';
import packageJson from '../package.json';

export { TexasHoldGame } from './texashold.js';

export const apiVersion = 1 as const;
export const id = 'texashold';
export const version = packageJson.version;

export function create(host: GameHost) {
  return new TexasHoldGame(host);
}
