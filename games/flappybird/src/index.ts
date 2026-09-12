import { FlappyBirdGame } from './flappybird.js';
import type { GameHost } from '@carrick/game-sdk/game';
import packageJson from '../package.json';

export { FlappyBirdGame } from './flappybird.js';

export const apiVersion = 1 as const;
export const id = 'flappybird';
export const version = packageJson.version;

export function create(host: GameHost) {
  return new FlappyBirdGame(host);
}
