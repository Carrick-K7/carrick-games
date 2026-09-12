import { IwannaGame } from './iwanna.js';
import type { GameHost } from '@carrick/game-sdk/game';
import packageJson from '../package.json';

export { IwannaGame } from './iwanna.js';

export const apiVersion = 1 as const;
export const id = 'iwanna';
export const version = packageJson.version;

export function create(host: GameHost) {
  return new IwannaGame(host);
}
