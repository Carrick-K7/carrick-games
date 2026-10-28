import type { GameHost } from '@carrick/game-sdk/game';
import packageJson from '../package.json';
import { RedHomesteadGame } from './redHomestead.js';

export const id = 'red-homestead';
export const version = packageJson.version;
export const apiVersion = 1 as const;
export function create(host: GameHost) { return new RedHomesteadGame(host); }
export { RedHomesteadGame };
