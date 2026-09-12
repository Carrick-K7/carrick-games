import { BreakoutGame } from './breakout.js';
import type { GameHost } from '@carrick/game-sdk/game';
import packageJson from '../package.json';

export { BreakoutGame } from './breakout.js';

export const apiVersion = 1 as const;
export const id = 'breakout';
export const version = packageJson.version;

export function create(host: GameHost) {
  return new BreakoutGame(host);
}
