import type { GameMeta } from './catalog';

/** Full-name queries must identify one real card, including description matches. */
function uniqueName(catalog: readonly GameMeta[], game: GameMeta, name: string): boolean {
  const term = name.trim().toLowerCase();
  const matches = catalog.filter(entry => [entry.name, entry.nameZh, entry.desc, entry.descZh]
    .some(text => text.toLowerCase().includes(term)));
  return !!term && matches.length === 1 && matches[0] === game;
}

function choose(catalog: readonly GameMeta[], role: string, preferred: readonly string[], eligible: (game: GameMeta) => boolean): GameMeta {
  const candidates = catalog.filter(eligible);
  const game = preferred.map(id => candidates.find(entry => entry.id === id)).find(Boolean) ?? candidates[0];
  if (!game) throw new Error(`Tested catalog has no compatible ${role} fixture (available: ${catalog.map(game => game.id).join(', ')})`);
  return game;
}

export function selectCurrentGame(catalog: readonly GameMeta[]): GameMeta {
  // API-1 metadata has no viewport-mode field. These known fixed-board cases
  // retain the contain/rotation contract; never infer fixed mode from a group
  // or a nominal canvasSize (Texas Hold'em, for example, is responsive).
  return choose(catalog, 'fixed current game with an essential ArrowRight mapping', ['sudoku', 'minesweeper'], game =>
    ['sudoku', 'minesweeper'].includes(game.id)
    && (game.controls.keyboard ?? []).slice(0, 3).some(row => row.keys.some(key => key === '→' || key === 'ArrowRight'))
    && uniqueName(catalog, game, game.name) && uniqueName(catalog, game, game.nameZh));
}

export function selectSearchGame(catalog: readonly GameMeta[], current: GameMeta): GameMeta {
  // This also supplies the held-preflight candidate: it must not be the live
  // game. Gacha keeps its separate, explicit legacy progress-band resize case.
  return choose(catalog, 'distinct bilingual search/candidate game', ['minesweeper', 'parking'], game =>
    game.id !== current.id && game.id !== 'gacha' && /\p{Script=Han}/u.test(game.nameZh)
    && uniqueName(catalog, game, game.name) && uniqueName(catalog, game, game.nameZh));
}

export function selectSpacedGame(catalog: readonly GameMeta[], current: GameMeta): GameMeta {
  return choose(catalog, 'distinct English name containing a real space', ['aimlab', 'texashold'], game =>
    game.id !== current.id && game.name.trim().includes(' ') && uniqueName(catalog, game, game.name));
}

/** Keep the four real switches, not a source-only game that may be delisted. */
export function selectMobileSwitchGames(catalog: readonly GameMeta[]): GameMeta[] {
  const preferred = ['parking', 'minesweeper', 'sudoku', 'gacha', 'texashold', 'red-homestead'];
  const selected: GameMeta[] = [];
  for (const id of [...preferred, ...catalog.map(game => game.id)]) {
    const game = catalog.find(entry => entry.id === id);
    if (game && !selected.some(entry => entry.id === id)) selected.push(game);
    if (selected.length === 4) return selected;
  }
  throw new Error('Tested catalog needs at least four distinct games for mobile switching');
}

export const mappingWidth = (game: GameMeta): number => Math.max(0, ...(game.controls.keyboard ?? []).slice(0, 3).map(row => row.keys.length));

export function selectLongMappingGames(catalog: readonly GameMeta[]): GameMeta[] {
  const byWidth = (a: GameMeta, b: GameMeta) => mappingWidth(b) - mappingWidth(a) || a.order - b.order;
  // Preserve the original source-catalog top-four board cases, including the
  // long letter/number rows. Delisting must not silently drop that coverage.
  const boards = catalog.filter(game => ['puzzle', 'tabletop'].includes(game.group) && mappingWidth(game) >= 4)
    .sort(byWidth).slice(0, 4);
  // A published subset can have only one such board. Exercise the same wide
  // essential-row geometry with another real game's controls, not invented
  // metadata or short rows/disclosure-only mappings.
  const others = catalog.filter(game => !boards.includes(game) && mappingWidth(game) >= 4).sort(byWidth);
  const games = [...boards, ...others.slice(0, Math.max(0, 2 - boards.length))];
  if (games.length < 2) throw new Error('Tested catalog needs at least two games with wide essential keyboard mappings');
  return games;
}
