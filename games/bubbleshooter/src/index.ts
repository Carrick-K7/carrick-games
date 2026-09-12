import { BubbleShooterGame } from './bubbleshooter.js';
import type { GameHost } from '@carrick/game-sdk/game';
import packageJson from '../package.json';

export { BubbleShooterGame } from './bubbleshooter.js';

export const apiVersion = 1 as const;
export const id = 'bubbleshooter';
export const version = packageJson.version;

export function create(host: GameHost) {
  return new BubbleShooterGame(host);
}
