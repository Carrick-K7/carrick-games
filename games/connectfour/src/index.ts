import { ConnectFourGame } from './connectfour.js';
import type { GameHost } from '@carrick/game-sdk/game';
import packageJson from '../package.json';

export { ConnectFourGame } from './connectfour.js';

export const apiVersion = 1 as const;
export const id = 'connectfour';
export const version = packageJson.version;

export function create(host: GameHost) {
  return new ConnectFourGame(host);
}
