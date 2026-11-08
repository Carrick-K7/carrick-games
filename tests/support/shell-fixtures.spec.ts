import { expect, test } from '@playwright/test';
import { GAMES, type GameMeta } from './catalog';
import { mappingWidth, selectCurrentGame, selectFixedSwitchGames, selectGuideGames, selectLongMappingGames, selectMobileSwitchGames, selectResponsiveWindowGames, selectSearchGame, selectSpacedGame } from './shell-fixtures';

// Pure selector contracts. The normal source and pinned-published Shell gates
// collect these through tests/**/*.spec.ts; no page or fabricated metadata.
const matches = (catalog: readonly GameMeta[], query: string) => catalog.filter(game => [game.name, game.nameZh, game.desc, game.descZh]
  .some(text => text.toLowerCase().includes(query.trim().toLowerCase())));
const uniquelyNamed = (catalog: readonly GameMeta[], game: GameMeta) => [game.name, game.nameZh]
  .every(name => matches(catalog, name).length === 1);
const boards = (catalog: readonly GameMeta[]) => catalog.filter(game => ['puzzle', 'tabletop'].includes(game.group) && mappingWidth(game) >= 4)
  .sort((a, b) => mappingWidth(b) - mappingWidth(a) || a.order - b.order).slice(0, 4);

test('shell selectors return unchanged metadata from the catalog under test', () => {
  const before = JSON.stringify(GAMES);
  const current = selectCurrentGame(GAMES);
  const selected = [current, selectSearchGame(GAMES, current), selectSpacedGame(GAMES, current), ...selectLongMappingGames(GAMES)];
  for (const game of selected) expect(GAMES.find(entry => entry.id === game.id)).toBe(game);
  expect(JSON.stringify(GAMES)).toBe(before);
});

test('current retains a fixed board and an essential right-arrow mapping', () => {
  for (const catalog of [GAMES, GAMES.filter(game => game.id !== 'sudoku')]) {
    const eligible = ['sudoku', 'minesweeper'].map(id => catalog.find(game => game.id === id))
      .filter((game): game is GameMeta => !!game && uniquelyNamed(catalog, game)
        && !!game.controls.keyboard?.slice(0, 3).some(row => row.keys.includes('→') || row.keys.includes('ArrowRight')));
    if (!eligible.length) {
      expect(() => selectCurrentGame(catalog)).toThrow(/no compatible fixed current/);
    } else {
      const current = selectCurrentGame(catalog);
      expect(current).toBe(eligible[0]);
      expect(matches(catalog, current.name)).toEqual([current]);
      expect(matches(catalog, current.nameZh)).toEqual([current]);
    }
  }
});

test('search and held-preflight candidates are distinct with unique bilingual queries', () => {
  const current = selectCurrentGame(GAMES), selected = selectSearchGame(GAMES, current);
  // Removing the preferred candidate must select another real compatible card,
  // or fail honestly if no such card remains; no particular fallback is mandatory.
  for (const catalog of [GAMES, GAMES.filter(game => game.id !== selected.id)]) {
    const eligible = catalog.filter(game => game.id !== current.id && game.id !== 'gacha'
      && /\p{Script=Han}/u.test(game.nameZh) && uniquelyNamed(catalog, game));
    if (!eligible.length) {
      expect(() => selectSearchGame(catalog, current)).toThrow(/no compatible distinct bilingual/);
    } else {
      const candidate = selectSearchGame(catalog, current);
      expect(eligible).toContain(candidate);
      for (const name of [candidate.name, candidate.nameZh]) expect(matches(catalog, name)).toEqual([candidate]);
      const preferred = ['minesweeper', 'parking'].map(id => eligible.find(game => game.id === id)).find(Boolean);
      expect(candidate).toBe(preferred ?? eligible[0]);
    }
  }
});

test('space typing uses a distinct real uniquely matching title even without Aim Lab', () => {
  const current = selectCurrentGame(GAMES);
  for (const catalog of [GAMES, GAMES.filter(game => game.id !== 'aimlab')]) {
    const eligible = catalog.filter(game => game.id !== current.id && game.name.trim().includes(' ')
      && matches(catalog, game.name).length === 1);
    if (!eligible.length) {
      expect(() => selectSpacedGame(catalog, current)).toThrow(/no compatible distinct English name/);
    } else {
      const spaced = selectSpacedGame(catalog, current);
      expect(eligible).toContain(spaced);
      expect(matches(catalog, spaced.name.toLowerCase())).toEqual([spaced]);
      const preferred = ['aimlab', 'texashold'].map(id => eligible.find(game => game.id === id)).find(Boolean);
      expect(spaced).toBe(preferred ?? eligible[0]);
    }
  }
});

test('long mappings preserve all original top-four board cases and only fill a real deficit', () => {
  const original = boards(GAMES), selected = selectLongMappingGames(GAMES);
  expect(selected.slice(0, original.length)).toEqual(original);
  expect(selected).toHaveLength(Math.max(2, original.length));
  expect(new Set(selected.map(game => game.id)).size).toBe(selected.length);
  for (const game of selected) expect(mappingWidth(game)).toBeGreaterThanOrEqual(4);
  const otherWide = GAMES.filter(game => !original.includes(game) && mappingWidth(game) >= 4)
    .sort((a, b) => mappingWidth(b) - mappingWidth(a) || a.order - b.order);
  expect(selected.slice(original.length)).toEqual(otherWide.slice(0, Math.max(0, 2 - original.length)));
});

test('mobile switching retains four distinct real games when source-only Sudoku is absent', () => {
  for (const catalog of [GAMES, GAMES.filter(game => game.id !== 'sudoku')]) {
    const before = JSON.stringify(catalog), selected = selectMobileSwitchGames(catalog);
    expect(selected).toHaveLength(4);
    expect(new Set(selected.map(game => game.id)).size).toBe(4);
    for (const game of selected) expect(catalog.find(entry => entry.id === game.id)).toBe(game);
    expect(JSON.stringify(catalog)).toBe(before);
    const original = ['parking', 'minesweeper', 'sudoku', 'gacha'];
    if (original.every(id => catalog.some(game => game.id === id))) {
      expect(selected.map(game => game.id)).toEqual(original);
    }
  }
  expect(() => selectMobileSwitchGames(GAMES.slice(0, 3))).toThrow(/at least four distinct games/);
  expect(() => selectMobileSwitchGames([GAMES[0], GAMES[0], GAMES[1], GAMES[2]]))
    .toThrow(/at least four distinct games/);
});

test('guide samples retain original available cases and cover every actual catalog family', () => {
  for (const catalog of [GAMES, GAMES.filter(game => !['sudoku', 'cs-kimi'].includes(game.id))]) {
    const before = JSON.stringify(catalog), selected = selectGuideGames(catalog);
    expect(new Set(selected.map(game => game.group))).toEqual(new Set(catalog.map(game => game.group)));
    expect(new Set(selected.map(game => game.id)).size).toBe(selected.length);
    for (const game of selected) {
      expect(catalog.find(entry => entry.id === game.id)).toBe(game);
      expect(game.controls.keyboard!.slice(0, 3).some(row => row.keys.length > 0)).toBe(true);
      expect(game.controls.touch!.length).toBeGreaterThan(0);
    }
    for (const game of catalog.filter(game => ['minesweeper', 'sudoku', 'cs', 'cs-kimi', 'villa'].includes(game.id))) {
      expect(selected).toContain(game);
    }
    expect(JSON.stringify(catalog)).toBe(before);
  }
  expect(() => selectGuideGames([])).toThrow(/no compatible operation-guide/);
  const noKeyboard = GAMES.filter(game => !game.controls.keyboard?.length);
  if (noKeyboard.length) expect(() => selectGuideGames(noKeyboard)).toThrow(/guide with keyboard essentials/);
});

test('F11 switches between two actual distinct fixed boards without requiring Sudoku', () => {
  for (const catalog of [GAMES, GAMES.filter(game => game.id !== 'sudoku')]) {
    const selected = selectFixedSwitchGames(catalog);
    expect(selected).toHaveLength(2);
    expect(selected[0].id).not.toBe(selected[1].id);
    for (const game of selected) {
      expect(catalog.find(entry => entry.id === game.id)).toBe(game);
      expect(['minesweeper', 'sudoku', 'parking']).toContain(game.id);
    }
    if (catalog.some(game => game.id === 'minesweeper')) expect(selected[0].id).toBe('minesweeper');
    const next = ['sudoku', 'parking', 'minesweeper'].find(id => id !== selected[0].id && catalog.some(game => game.id === id));
    expect(selected[1].id).toBe(next);
  }
  expect(() => selectFixedSwitchGames([selectFixedSwitchGames(GAMES)[0]])).toThrow(/distinct fixed switch/);
});

test('shared responsive window samples contain only tested releases and fail on no suitable sample', () => {
  for (const catalog of [GAMES, GAMES.filter(game => game.id !== 'cs-kimi')]) {
    const selected = selectResponsiveWindowGames(catalog);
    expect(selected.map(game => game.id)).toEqual(['cs', 'cs-kimi', 'villa'].filter(id => catalog.some(game => game.id === id)));
    for (const game of selected) expect(catalog.find(entry => entry.id === game.id)).toBe(game);
  }
  expect(() => selectResponsiveWindowGames(GAMES.filter(game => !['cs', 'cs-kimi', 'villa'].includes(game.id))))
    .toThrow(/no compatible responsive-window/);
});

test('insufficient real fixture capabilities fail instead of skipping or fabricating games', () => {
  const current = selectCurrentGame(GAMES);
  expect(() => selectCurrentGame(GAMES.filter(game => !['sudoku', 'minesweeper'].includes(game.id))))
    .toThrow(/no compatible fixed current/);
  expect(() => selectSearchGame([current], current)).toThrow(/no compatible distinct bilingual/);
  expect(() => selectSpacedGame(GAMES.filter(game => !game.name.trim().includes(' ')), current))
    .toThrow(/no compatible distinct English name/);
  const oneWide = selectLongMappingGames(GAMES)[0];
  expect(() => selectLongMappingGames([oneWide, ...GAMES.filter(game => mappingWidth(game) < 4)]))
    .toThrow(/at least two games with wide essential/);
});
