import { GachaGame } from './gacha.js';
import type { GameHost } from '@carrick/game-sdk/game';
import packageJson from '../package.json';

export { GachaGame } from './gacha.js';

export const apiVersion = 1 as const;
export const id = 'gacha';
export const version = packageJson.version;

export function create(host: GameHost) {
  return new GachaGame(host);
}
