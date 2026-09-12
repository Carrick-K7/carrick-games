import { SolitaireGame } from './solitaire.js';
import type { GameHost } from '@carrick/game-sdk/game';
import packageJson from '../package.json';

export { SolitaireGame } from './solitaire.js';

export const apiVersion = 1 as const;
export const id = 'solitaire';
export const version = packageJson.version;

export function create(host: GameHost) {
  return new SolitaireGame(host);
}
