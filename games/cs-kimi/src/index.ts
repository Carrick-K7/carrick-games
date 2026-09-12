import { CounterStrikeGame } from './counterstrike.js';
import type { GameHost } from '@carrick/game-sdk/game';
import packageJson from '../package.json';

export { CounterStrikeGame } from './counterstrike.js';

export const apiVersion = 1 as const;
export const id = 'cs-kimi';
export const version = packageJson.version;

export function create(host: GameHost) {
  return new CounterStrikeGame(host);
}
