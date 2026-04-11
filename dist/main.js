import { SnakeGame } from './games/snake.js';
import { BreakoutGame } from './games/breakout.js';
const registry = {
    snake: SnakeGame,
    breakout: BreakoutGame,
};
let currentGame = null;
const controlsMap = {
    snake: 'Desktop: Arrow keys / WASD<br>Mobile: Tap sides to turn',
    breakout: 'Desktop: Arrow Left/Right or A/D<br>Mobile: Touch left/right to move paddle',
};
function loadGame(name) {
    if (currentGame) {
        currentGame.stop?.();
        currentGame = null;
    }
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    if (ctx)
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    const GameClass = registry[name];
    if (!GameClass)
        return;
    currentGame = new GameClass();
    currentGame.start();
    const controlsEl = document.getElementById('controlsText');
    if (controlsEl)
        controlsEl.innerHTML = controlsMap[name] || '';
}
window.loadGame = loadGame;
// Default to snake on load
loadGame('snake');
//# sourceMappingURL=main.js.map