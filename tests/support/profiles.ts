/** Existing browser input exercises, independent of game implementation imports. */
export interface GameProfile {
  id: string;
  keys?: string[];
  clicks?: number;
  delayMs?: number;
}

export const KEYBOARD_GAMES: GameProfile[] = [
  { id: 'snake', keys: ['ArrowRight', 'ArrowUp', 'ArrowDown'], delayMs: 1500 },
  { id: 'breakout', keys: ['ArrowLeft', 'ArrowRight', 'Space'], delayMs: 2000 },
  { id: 'tetris', keys: ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'Space'], delayMs: 2000 },
  { id: 'pong', keys: ['ArrowUp', 'ArrowDown', 'w', 's'], delayMs: 2000 },
  { id: 'spaceshooter', keys: ['ArrowLeft', 'ArrowRight', 'Space'], delayMs: 2000 },
  { id: 'flappybird', keys: ['Space', 'Space', 'Space'], delayMs: 2000 },
  { id: 'asteroids', keys: ['ArrowLeft', 'ArrowUp', 'Space'], delayMs: 2000 },
  { id: 'doodlejump', keys: ['ArrowLeft', 'ArrowRight', 'Space'], delayMs: 2000 },
  { id: 'galaga', keys: ['ArrowLeft', 'ArrowRight', 'Space'], delayMs: 2000 },
  { id: 'stacker', keys: ['Space'], delayMs: 1500 },
  { id: 'iwanna', keys: ['ArrowLeft', 'ArrowRight', 'Space'], delayMs: 2000 },
  { id: 'cs-kimi', keys: ['w', 'a', 's', 'd', 'r', 'b', 'q', '1', '2', '3', '4', 'g', ' '], delayMs: 2500 },
  { id: 'cs', keys: ['w', 'a', 's', 'd', 'r', 'b', 'q', '1', '2', '3', '4', 'g', ' '], delayMs: 3000 },
  { id: 'aimlab', keys: [], delayMs: 1500 },
  { id: 'parking', keys: ['ArrowUp', 'ArrowLeft', 'ArrowRight'], delayMs: 2000 },
  { id: 'villa', keys: ['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Shift+w', 'e', 'm', 'm', 't', 'h'], delayMs: 2000 },
  { id: 'bubbleshooter', keys: ['ArrowLeft', 'ArrowRight', 'Space'], delayMs: 2000 },
  { id: '2048', keys: ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'], delayMs: 1500 },
];

export const CLICK_GAMES: GameProfile[] = [
  { id: 'gacha', clicks: 2, delayMs: 1500 },
  { id: 'minesweeper', clicks: 3, delayMs: 1500 },
  { id: 'checkers', clicks: 2, delayMs: 1500 },
  { id: 'solitaire', clicks: 2, delayMs: 1500 },
  { id: 'chess', clicks: 2, delayMs: 1500 },
  { id: 'connectfour', clicks: 2, delayMs: 1500 },
  { id: 'texashold', clicks: 1, delayMs: 1500 },
  { id: 'simon', clicks: 2, delayMs: 2000 },
  { id: 'sudoku', clicks: 2, delayMs: 1500 },
  { id: 'wordle', clicks: 1, delayMs: 1500 },
];

export const ALL_GAME_IDS = [...KEYBOARD_GAMES, ...CLICK_GAMES].map(game => game.id);
export function selectedProfiles(profiles: readonly GameProfile[]): GameProfile[] {
  const target = process.env.GAME_ID;
  if (target && !ALL_GAME_IDS.includes(target)) throw new Error(`Unknown test GAME_ID: ${target}`);
  return profiles.filter(game => !target || game.id === target);
}
