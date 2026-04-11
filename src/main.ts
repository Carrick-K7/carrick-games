import { SnakeGame } from './games/snake.js';

type GameCtor = new () => { start(): void; stop(): void };

const registry: Record<string, GameCtor> = {
  snake: SnakeGame,
};

let currentGame: { start(): void; stop(): void } | null = null;

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
}

(window as any).loadGame = loadGame;

// Default to snake on load
loadGame('snake');
