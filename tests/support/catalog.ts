// Test-only discovery of source metadata. Never imported by the browser shell.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GAME_GROUPS, parseGameMeta } from '../../packages/game-sdk/src/catalog';
export { GAME_GROUPS };
export type { GameMeta, GameCtor, GameInstance } from '../../packages/game-sdk/src/catalog';
const gamesDir = join(process.cwd(), 'games');
export const GAMES = (process.env.CG_TEST_CATALOG
  ? (JSON.parse(readFileSync(process.env.CG_TEST_CATALOG, 'utf8')).games as unknown[]).map(parseGameMeta)
  : readdirSync(gamesDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => parseGameMeta(JSON.parse(readFileSync(join(gamesDir, entry.name, 'game.json'), 'utf8')))))
  .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
export const GAME_GROUP_MAP = Object.fromEntries(GAMES.map(game => [game.id, game.group]));
export const GAME_LIST_ORDER = GAMES.map(game => game.id);
export const GAME_LIST_ORDER_INDEX = new Map(GAME_LIST_ORDER.map((id, index) => [id, index]));
