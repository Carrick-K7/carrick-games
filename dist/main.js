import { SnakeGame } from './games/snake.js';
const registry = {
    snake: SnakeGame,
};
let currentGame = null;
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
}
window.loadGame = loadGame;
// Default to snake on load
loadGame('snake');
//# sourceMappingURL=main.js.map