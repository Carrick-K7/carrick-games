import { SnakeGame } from './snake.js';
import type { GameHost } from '@carrick/game-sdk/game';
import packageJson from '../package.json';

export { SnakeGame } from './snake.js';

export const apiVersion = 1 as const;
export const id = 'snake';
export const version = packageJson.version;

export function create(host: GameHost) {
  return new SnakeGame(host);
}
