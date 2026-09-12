import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GameCatalog } from '../../packages/game-sdk/src/catalog';

/** Tests exercise the actual self-contained ESM entry, never a shell's lazy chunk. */
export function builtCatalog(): GameCatalog {
  return JSON.parse(readFileSync(process.env.CG_TEST_CATALOG || join(process.cwd(), 'dist/games/index.json'), 'utf8')) as GameCatalog;
}
export function gameModuleUrl(id: string): string {
  const release = builtCatalog().games.find(game => game.id === id);
  if (!release) throw new Error(`Game was not built: ${id}`);
  return release.entry;
}
export function gameAssetUrl(id: string, relative: string): string {
  const release = builtCatalog().games.find(game => game.id === id);
  if (!release) throw new Error(`Game was not built: ${id}`);
  return `${release.assetBase}${relative}`;
}
