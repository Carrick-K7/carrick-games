import { PongGame } from './pong.js';
import type { GameHost } from '@carrick/game-sdk/game';
import packageJson from '../package.json';

export { PongGame } from './pong.js';

export const apiVersion = 1 as const;
export const id = 'pong';
export const version = packageJson.version;

export function create(host: GameHost) {
  return new PongGame(host);
}
