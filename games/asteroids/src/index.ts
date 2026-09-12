import { AsteroidsGame } from './asteroids.js';
import type { GameHost } from '@carrick/game-sdk/game';
import packageJson from '../package.json';

export { AsteroidsGame } from './asteroids.js';

export const apiVersion = 1 as const;
export const id = 'asteroids';
export const version = packageJson.version;

export function create(host: GameHost) {
  return new AsteroidsGame(host);
}
