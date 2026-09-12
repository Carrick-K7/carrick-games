import { ChessGame } from './chess.js';
import type { GameHost } from '@carrick/game-sdk/game';
import packageJson from '../package.json';

export { ChessGame } from './chess.js';

export const apiVersion = 1 as const;
export const id = 'chess';
export const version = packageJson.version;

export function create(host: GameHost) {
  return new ChessGame(host);
}
