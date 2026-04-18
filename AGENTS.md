# AGENTS.md — Carrick Games Development Guide

## Project Structure

```
src/
  core/game.ts       # BaseGame abstract class - ALL games extend this
  games/             # One file per game (e.g., snake.ts, breakout.ts)
  main.ts            # Game registration, UI, controls rendering
dist/                # Built output (JS files)
index.html           # Main HTML page
```

## Adding a New Game (3 steps)

### 1. Create the game file: `src/games/<gamename>.ts`

```typescript
import { BaseGame } from '../core/game.js';

export class <GameName>Game extends BaseGame {
  constructor() {
    // Canvas ID is always 'gameCanvas'
    // Width and height are your choice
    super('gameCanvas', WIDTH, HEIGHT);
  }

  // Called when game starts
  init() {}

  // Called every frame, dt = delta time in seconds
  update(dt: number) {}

  // Draw the game on canvas
  draw(ctx: CanvasRenderingContext2D) {
    const isDark = !document.documentElement.hasAttribute('data-theme') ||
      document.documentElement.getAttribute('data-theme') === 'dark';
    // isDark = true → dark mode colors
    // isDark = false → light mode colors
    ctx.fillStyle = isDark ? '#0b0f19' : '#fafafa';
    ctx.fillRect(0, 0, this.width, this.height);
  }

  // Handle keyboard, touch, and mouse input
  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {}

  // Optional cleanup
  destroy() {
    this.stop();
  }
}
```

### 2. Register in `src/main.ts`

Add ONE import:
```typescript
import { <GameName>Game } from './games/<gamename>.js';
```

Add ONE entry to the `GAMES` array (before the closing `];`):
```typescript
{
  id: '<gamename>',
  name: '<English Name>',
  nameZh: '<中文名>',
  desc: 'One sentence description.',
  descZh: '中文描述。',
  cls: <GameName>Game,
  canvasSize: { width: WIDTH, height: HEIGHT },
  controls: {
    keyboard: [
      { keys: ['←', '→'], action: 'Move', actionZh: '移动' },
    ],
    touch: [
      { icon: 'swipe-left', action: 'Swipe left', actionZh: '向左滑' },
    ],
  },
},
```

### 3. Build and deploy

```bash
npm run build
# Files go to dist/
```

## BaseGame Interface (from `src/core/game.ts`)

| Method | Required | Description |
|--------|----------|-------------|
| `constructor(canvasId, width, height)` | Yes | Pass `'gameCanvas'`, width, height |
| `init()` | Yes | Initialize game state, called on start |
| `update(dt: number)` | Yes | Game logic, dt is seconds since last frame |
| `draw(ctx)` | Yes | Render to canvas |
| `handleInput(e)` | Yes | KeyboardEvent / TouchEvent / MouseEvent |
| `destroy()` | Optional | Cleanup when game is swapped |

Properties available in your class:
- `this.canvas` — HTMLCanvasElement
- `this.ctx` — CanvasRenderingContext2D
- `this.width` — canvas width
- `this.height` — canvas height

Call `this.start()` to begin game loop.
Call `this.stop()` to stop game loop.

## Theme-Aware Rendering

Always check at the top of `draw()`:
```typescript
const isDark = !document.documentElement.hasAttribute('data-theme') ||
  document.documentElement.getAttribute('data-theme') === 'dark';
```

Use `isDark` to switch colors:
```typescript
// Dark mode → light mode
const bg = isDark ? '#0b0f19' : '#fafafa';
const primary = isDark ? '#39C5BB' : '#0d9488';
const text = isDark ? '#e0e0e0' : '#1a1a2e';
```

## Language Switching

Check `data-lang` attribute on `<html>`:
```typescript
const zh = document.documentElement.getAttribute('data-lang') === 'zh';
```

## Score Reporting

When game ends, report the score:
```typescript
(window as any).reportScore?.(this.score);
```

## Input Handling Pattern

```typescript
handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
  if (e instanceof KeyboardEvent) {
    if (e.type === 'keydown' && e.key === 'ArrowLeft') { ... }
    if (e.type === 'keyup') { ... }
  }
  if (e instanceof MouseEvent) {
    if (e.type === 'mousedown') { ... }
  }
  if (e instanceof TouchEvent) {
    e.preventDefault(); // important!
    if (e.type === 'touchstart') { ... }
  }
}
```

## Style Rules

- Primary color: `#39C5BB` (dark mode), `#0d9488` (light mode)
- Background: `#0b0f19` (dark), `#fafafa` (light)
- Font: `"Press Start 2P", monospace` — inside game canvas only
- Canvas sizes: anything that fits the game (common: 400×400, 480×400, 400×600)
- Game over overlay: semi-transparent black bg + centered text
- No external dependencies beyond BaseGame
