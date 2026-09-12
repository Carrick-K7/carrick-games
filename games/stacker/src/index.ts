import { StackerGame } from './stacker.js';
import type { GameHost } from '@carrick/game-sdk/game';
import packageJson from '../package.json';

export { StackerGame } from './stacker.js';

export const apiVersion = 1 as const;
export const id = 'stacker';
export const version = packageJson.version;

export function create(host: GameHost) {
  return new StackerGame(host);
}
