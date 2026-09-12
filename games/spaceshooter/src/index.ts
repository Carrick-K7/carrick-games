import { SpaceShooterGame } from './spaceshooter.js';
import type { GameHost } from '@carrick/game-sdk/game';
import packageJson from '../package.json';

export { SpaceShooterGame } from './spaceshooter.js';

export const apiVersion = 1 as const;
export const id = 'spaceshooter';
export const version = packageJson.version;

export function create(host: GameHost) {
  return new SpaceShooterGame(host);
}
