import { ParkingGame } from './parking.js';
import type { GameHost } from '@carrick/game-sdk/game';
import packageJson from '../package.json';

export { ParkingGame } from './parking.js';

export const apiVersion = 1 as const;
export const id = 'parking';
export const version = packageJson.version;

export function create(host: GameHost) {
  return new ParkingGame(host);
}
