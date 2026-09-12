import { GAME_GROUPS, parseCatalog, type GameRelease } from '@carrick/game-sdk/catalog';
export { GAME_GROUPS };
export type { GameCtor, GameInstance, GameModule } from '@carrick/game-sdk/catalog';
export type GameMeta = GameRelease;

/** The only browser registry is fetched data. No game implementation is imported here. */
export let GAMES: GameRelease[] = [];
export let GAME_GROUP_MAP: Record<string, string> = {};
export let GAME_LIST_ORDER: string[] = [];
export let GAME_LIST_ORDER_INDEX = new Map<string, number>();
let pending: Promise<void> | undefined;

export function refreshCatalog(): Promise<void> {
  if (pending) return pending;
  pending = (async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch('/games/index.json', { cache: 'no-cache', credentials: 'same-origin', signal: controller.signal });
      if (!response.ok) throw new Error(`Game catalog unavailable (${response.status})`);
      const { catalog, rejected } = parseCatalog(await response.json(), window.location.origin);
      if (rejected.length) console.warn('Ignored invalid game releases:', rejected);
      if (!catalog.games.length && rejected.length) throw new Error('No compatible games in the catalog');
      const groups = new Set(GAME_GROUPS.map(group => group.id));
      GAMES = catalog.games.map(game => ({ ...game, group: groups.has(game.group) ? game.group : 'other' }));
      GAME_GROUP_MAP = Object.fromEntries(GAMES.map(game => [game.id, game.group]));
      GAME_LIST_ORDER = GAMES.map(game => game.id);
      GAME_LIST_ORDER_INDEX = new Map(GAME_LIST_ORDER.map((id, index) => [id, index]));
    } finally { window.clearTimeout(timeout); }
  })().finally(() => { pending = undefined; });
  return pending;
}
