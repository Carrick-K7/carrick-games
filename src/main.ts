import { SnakeGame } from './games/snake.js';
import { BreakoutGame } from './games/breakout.js';

type GameCtor = new () => { start(): void; stop(): void };

const registry: Record<string, GameCtor> = {
  snake: SnakeGame,
  breakout: BreakoutGame,
};

let currentGame: { start(): void; stop(): void } | null = null;

const controlsMap: Record<string, string> = {
  snake: 'Desktop: Arrow keys / WASD<br>Mobile: Tap sides to turn',
  breakout: 'Desktop: Arrow Left/Right or A/D<br>Mobile: Touch left/right to move paddle',
};

function loadGame(name: string) {
  if (currentGame) {
    (currentGame as any).stop?.();
    currentGame = null;
  }
  const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);

  const GameClass = registry[name];
  if (!GameClass) return;
  currentGame = new GameClass();
  currentGame.start();

  const controlsEl = document.getElementById('controlsText');
  if (controlsEl) controlsEl.innerHTML = controlsMap[name] || '';
}

(window as any).loadGame = loadGame;

// Default to snake on load
loadGame('snake');
