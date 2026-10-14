import { describe, expect, it } from 'vitest';
import { ALL_GAME_IDS, CLICK_GAMES, KEYBOARD_GAMES, selectAvailableProfiles } from '../support/profiles';

const profiles = [...KEYBOARD_GAMES, ...CLICK_GAMES];
const published = ['aimlab', 'cs', 'cs-kimi', 'gacha', 'minesweeper', 'parking', 'sudoku', 'texashold', 'villa'];

describe('browser exercise ownership follows the pinned catalog', () => {
  it('covers every current published game and excludes delisted games', () => {
    const selected = selectAvailableProfiles(profiles, published);
    expect(selected.map(game => game.id).sort()).toEqual([...published].sort());
    expect(selected.some(game => game.id === 'snake')).toBe(false);
  });
  it('preserves all source profiles for the full-source gate', () => {
    expect(selectAvailableProfiles(profiles, ALL_GAME_IDS)).toEqual(profiles);
  });
  it('treats a shell cell as all pinned games, and a game cell as its single target', () => {
    expect(selectAvailableProfiles(profiles, published, 'shell')).toEqual(selectAvailableProfiles(profiles, published));
    expect(selectAvailableProfiles(profiles, published, 'sudoku')).toEqual([CLICK_GAMES.find(game => game.id === 'sudoku')]);
    expect(selectAvailableProfiles(KEYBOARD_GAMES, published, 'sudoku')).toEqual([]);
  });
  it('fails rather than silently dropping games without a profile or a requested absent target', () => {
    expect(() => selectAvailableProfiles(profiles, [...published, 'new-game'])).toThrow('no browser input profile');
    expect(() => selectAvailableProfiles(profiles, published, 'new-game')).toThrow('Unknown test GAME_ID');
    expect(() => selectAvailableProfiles(profiles, published, 'snake')).toThrow('absent from the pinned catalog');
  });
});
