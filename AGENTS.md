# AGENTS.md - Carrick Games Development Guide

This is the repository's development authority. `README.md` is for external readers; `DESIGN.md` is for visual and interaction design.

## Project Structure

```text
src/
  core/game.ts        # BaseGame abstract class; all games extend it
  core/render.ts      # HiDPI canvas, palette, and coordinate helpers
  core/levelselect.ts # Shared level-select UI helpers
  games/catalog.ts    # Game metadata, dynamic loaders, and sidebar grouping
  games/              # One file per registered game plus pure helper modules
  main.ts             # App UI rendering, controls, routing, and lifecycle
tests/
  games.spec.ts       # Playwright e2e and behavior coverage
  gameover.spec.ts    # Game-over and restart coverage
dist/                 # Built JavaScript output
fonts/                # Static font assets copied into production releases
index.html            # Main page shell and CSS
playwright.config.ts  # Playwright configuration and local web server
.github/workflows/    # GitHub Actions build/test/deploy workflow
```

Only three project documents should be kept at the repository root:

- `README.md` - public project overview.
- `AGENTS.md` - development workflow, tests, deployment, and closure.
- `DESIGN.md` - visual and interaction design rules.

Do not add separate deployment, heartbeat, memory, or visual-style documents unless the user explicitly asks for a new long-lived document.

## Development Rules

- Prefer existing patterns in `BaseGame`, `src/core/render.ts`, `src/games/catalog.ts`, `src/main.ts`, and nearby games.
- Do not add external runtime dependencies for games unless the user explicitly approves it.
- Keep changes scoped. Do not reformat unrelated files or rewrite established game logic as part of a narrow fix.
- Use `this.isDarkTheme()` and `this.isZhLang()` for theme and language branching inside games.
- Use `this.canvasPoint(clientX, clientY)` for mouse and touch coordinates. Do not compute from `canvas.width / rect.width`; canvases use HiDPI backing stores.
- Follow `DESIGN.md` for visual choices. If `AGENTS.md` and `DESIGN.md` appear to conflict on design, update the docs instead of inventing a third rule.

## Adding A Game

### 1. Create `src/games/<gamename>.ts`

```typescript
import { BaseGame } from '../core/game.js';

export class ExampleGame extends BaseGame {
  constructor() {
    super('gameCanvas', 400, 400);
  }

  init() {}

  update(dt: number) {}

  draw(ctx: CanvasRenderingContext2D) {
    const isDark = this.isDarkTheme();
    ctx.fillStyle = isDark ? '#0b0f19' : '#fafafa';
    ctx.fillRect(0, 0, this.width, this.height);
  }

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {}

  destroy() {
    this.stop();
  }
}
```

Required `BaseGame` methods:

| Method | Required | Purpose |
|--------|----------|---------|
| `constructor(canvasId, width, height)` | Yes | Pass `'gameCanvas'` and logical canvas size. |
| `init()` | Yes | Initialize or reset state. Called before play starts. |
| `update(dt)` | Yes | Advance game logic. `dt` is seconds. |
| `draw(ctx)` | Yes | Render the current frame. |
| `handleInput(e)` | Yes | Handle keyboard, mouse, and touch input. |
| `destroy()` | Optional | Cleanup when the active game changes. |

### 2. Register it in `src/games/catalog.ts`

Add one loader to `GAME_LOADERS`:

```typescript
example: () => import('./games/example.js').then((m) => m.ExampleGame),
```

Add one `GAMES` entry:

```typescript
{
  id: 'example',
  name: 'Example',
  nameZh: '示例',
  desc: 'One sentence description.',
  descZh: '中文描述。',
  loader: GAME_LOADERS.example,
  canvasSize: { width: 400, height: 400 },
  controls: {
    keyboard: [
      { keys: ['←', '→'], action: 'Move', actionZh: '移动' },
    ],
    touch: [
      { icon: 'tap', action: 'Tap', actionZh: '点击' },
    ],
  },
},
```

If the game should appear in a specific sidebar group, update `GAME_GROUP_MAP` and `GAME_LIST_ORDER` in the same file.

### 3. Add focused tests when needed

The shared smoke tests cover selection, canvas visibility, start/restart, keyboard input, clicks, theme switching, and language switching. Add game-specific tests in `tests/games.spec.ts` when the game has unique mechanics, scoring, AI, level progression, collision, or persistence behavior.

## Input Pattern

```typescript
handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
  if (e instanceof KeyboardEvent) {
    if (e.type === 'keydown' && e.key === 'ArrowLeft') {
      // ...
    }
    if (e.type === 'keyup') {
      // ...
    }
  }

  if (e instanceof MouseEvent) {
    if (e.type === 'mousedown') {
      const point = this.canvasPoint(e.clientX, e.clientY);
      // ...
    }
  }

  if (e instanceof TouchEvent) {
    e.preventDefault();
    const touch = e.changedTouches[0];
    if (!touch) return;
    const point = this.canvasPoint(touch.clientX, touch.clientY);
    // ...
  }
}
```

## Score Reporting

When a game ends, report the score once:

```typescript
this.submitScoreOnce(this.score);
```

Use `this.submitScore(score)` only if a single session intentionally reports more than once.

## Local Verification

Run these before committing:

```bash
npm run build
npm run test:e2e
```

Use targeted Playwright runs only while iterating. The full `npm run test:e2e` suite is required before commit unless the user explicitly scopes the task to a non-code investigation.

## Agent Development Closure

When this repository is changed by an Agent, the work is not complete until every step below is finished:

1. Local verification passes:
   ```bash
   npm run build
   npm run test:e2e
   ```
2. The intended changes are committed. Do not include unrelated user changes in the commit.
3. The commit is pushed to `main`.
4. The GitHub Actions (GA) deployment for that pushed commit is monitored until it completes successfully. Always filter by the pushed commit SHA:
   ```bash
   sha=$(git rev-parse HEAD)
   gh run list --repo Carrick-K7/carrick-games --workflow deploy.yml --commit "$sha" --limit 3
   gh run watch <run-id> --repo Carrick-K7/carrick-games --exit-status
   ```
5. Production smoke tests pass:
   ```bash
   curl -fsSL https://games.carrick7.com/ -o /tmp/carrick-games-index.html
   curl -fsSL https://games.carrick7.com/dist/main.js?v=8 -o /dev/null
   ```
6. The final response states the commit SHA, GA run status, and production smoke-test result.

Do not call Agent-developed work done after only editing files, running tests, committing, or pushing. Deployment completion and production smoke testing are required for closure.

## Release Tags

Release tags are cut only after the Agent Development Closure steps pass for the commit being tagged.

For a release:

1. Set `package.json` and `package-lock.json` to the intended version.
2. Commit, push, monitor GA, and smoke test production.
3. Create an annotated tag from the verified commit:
   ```bash
   git tag -a v0.1.0 -m "Carrick Games v0.1.0"
   git push origin v0.1.0
   ```

Do not tag an unpushed, unverified, or locally-only commit.

## Deployment Reference

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
curl -fsSL https://games.carrick7.com/ -o /tmp/carrick-games-index.html
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
