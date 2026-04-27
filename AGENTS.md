# AGENTS.md — Carrick Games Development Guide

## Project Structure

```
src/
  core/game.ts       # BaseGame abstract class - ALL games extend this
  core/render.ts     # Shared HD Retro rendering, HiDPI canvas, input mapping helpers
  games/             # One file per game (e.g., snake.ts, breakout.ts)
  main.ts            # Game registration, UI, controls rendering
tests/
  games.spec.ts      # Playwright e2e tests
dist/                # Built output (JS files)
index.html           # Main HTML page
playwright.config.ts # Playwright configuration
.github/workflows/   # GitHub Actions build/test/deploy workflow
.kimi_session        # Stores last kimi session ID (auto-managed)
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
    const isDark = this.isDarkTheme();
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

Add ONE loader to `GAME_LOADERS`:
```typescript
<gamename>: () => import('./games/<gamename>.js').then((m) => m.<GameName>Game),
```

Add ONE entry to the `GAMES` array (before the closing `];`):
```typescript
{
  id: '<gamename>',
  name: '<English Name>',
  nameZh: '<中文名>',
  desc: 'One sentence description.',
  descZh: '中文描述。',
  loader: GAME_LOADERS.<gamename>,
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

### 3. Build and test

```bash
npm run build
npm run test:e2e
```

Files go to `dist/`. For Agent-developed work, local tests are not the end of the task; follow the Agent Development Closure section below.

## Development Workflow (kimi CLI)

All game development is done via **kimi CLI** using Linus's dedicated `linus:games` tmux session.

### Session Reuse
```bash
# Read last session ID (stored in .kimi_session)
cat .kimi_session  # e.g., "9e0d3b08-1c82-4253-8c2d-48b1b10ab971"

# Resume with -r flag
kimi -r <session-id>
```

### Sending a Game Task
```bash
# In linus:games tmux session, send task:
tmux send-keys -t linus:games -l -- "cd /home/ubuntu/projects/carrick-games && kimi --work-dir /home/ubuntu/projects/carrick-games --print -r <session-id> -p 'Create a Breakout game... && echo DONE: Breakout'" && tmux send-keys -t linus:games Enter

# Monitor progress:
tmux capture-pane -t linus:games -p | tail -20

# Extract new session ID from output:
tmux capture-pane -t linus:games -p | grep 'To resume this session'
```

### Testing
```bash
npm run build          # TypeScript compile
npm run test:e2e       # Playwright e2e tests (headless)
npm run test:e2e:ui    # Playwright with UI (for debugging)
```

### Agent Development Closure

When this repository is developed by an Agent, the work is not complete until every step below is finished:

1. Local verification passes:
   ```bash
   npm run build
   npm run test:e2e
   ```
2. The intended changes are committed. Do not include unrelated user changes in the commit.
3. The commit is pushed to `main`.
4. The GitHub Actions (GA) deployment for that pushed commit is monitored until it reaches a completed successful state. Always filter by the pushed commit SHA:
   ```bash
   sha=$(git rev-parse HEAD)
   gh run list --repo Carrick-K7/carrick-games --workflow deploy.yml --commit "$sha" --limit 3
   gh run watch <run-id> --repo Carrick-K7/carrick-games --exit-status
   ```
5. Production smoke tests pass against the public site:
   ```bash
   curl -fsSL https://games.carrick7.com/ -o /tmp/carrick-games-index.html
   curl -fsSL https://games.carrick7.com/dist/main.js?v=8 -o /dev/null
   ```
6. The final report states the commit SHA, GA run status, and production smoke-test result.

Do not call Agent-developed work done after only editing files, running local tests, committing, or pushing. Deployment completion and production smoke testing are required for closure.

### Deployment Reference

Deployment is automatic on every push to `main` through `.github/workflows/deploy.yml`.

The workflow:
- installs with `npm ci`
- builds with `npm run build`
- runs `npm run test:e2e`
- packages `index.html`, `dist/`, and `fonts/`
- deploys to `/var/www/games.carrick7.com/releases/<git-sha>/`
- atomically switches `/var/www/games.carrick7.com/current`
- smoke tests the public URL and `dist/main.js`

Caddy serves `/var/www/games.carrick7.com/current`.

Required GitHub secrets, either repository-level or on the `production` environment:

- `DEPLOY_HOST`: SSH host, currently `games.carrick7.com`
- `DEPLOY_USER`: SSH user, currently `ubuntu`
- `DEPLOY_PATH`: deploy root, currently `/var/www/games.carrick7.com`
- `DEPLOY_URL`: public URL, currently `https://games.carrick7.com`
- `DEPLOY_SSH_KEY`: private key for the deploy user
- `DEPLOY_KNOWN_HOSTS`: pinned SSH host key lines for `DEPLOY_HOST`

To confirm what Caddy is serving:

```bash
git rev-parse --short=12 HEAD
ssh ubuntu@games.carrick7.com 'readlink /var/www/games.carrick7.com/current'
curl -fsSI https://games.carrick7.com/
```

Rollback is an operational action. List releases, then switch `current` to the chosen release:

```bash
ssh ubuntu@games.carrick7.com 'ls -1dt /var/www/games.carrick7.com/releases/*'
ssh ubuntu@games.carrick7.com '
  set -euo pipefail
  deploy_root=/var/www/games.carrick7.com
  release=releases/<release-id>
  test -f "$deploy_root/$release/index.html"
  ln -sfn "$release" "$deploy_root/current.new"
  mv -Tf "$deploy_root/current.new" "$deploy_root/current"
'
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
const isDark = this.isDarkTheme();
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
const zh = this.isZhLang();
```

## Score Reporting

When game ends, report the score:
```typescript
this.submitScoreOnce(this.score);
```

Use `this.submitScore(score)` only when the same game session intentionally reports more than once.

## Canvas Coordinates

For mouse and touch input, map screen coordinates to logical canvas coordinates:
```typescript
const point = this.canvasPoint(clientX, clientY);
```

Do not calculate from `canvas.width / rect.width`; canvases use a HiDPI backing store.

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
- BaseGame applies the global HD Retro finish layer; individual games should draw their scene only.
- Canvas sizes: anything that fits the game (common: 400×400, 480×400, 400×600)
- Game over overlay: semi-transparent black bg + centered text
- No external dependencies beyond BaseGame

## Testing Requirements

Every game must pass Playwright e2e tests before deployment. Core behaviors to verify:

- Page loads without console errors
- Canvas element is visible after game selection
- Start button is clickable and game begins
- Keyboard input does not cause crashes
- Game can be stopped and restarted

Add game-specific tests in `tests/games.spec.ts` if the game has unique mechanics.
