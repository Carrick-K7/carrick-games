# Carrick Games

A browser-based collection of retro-inspired HTML5 Canvas games.

Live site: https://games.carrick7.com/

Current release line: `0.1.x`.

## Games

Carrick Games currently ships 27 playable games:

| Game | Chinese | Type |
|------|---------|------|
| Gacha | 抽卡 | Casual |
| Parking | 停车 | Casual |
| Warm Villa | 暖居别墅 | Casual |
| Snake | 贪吃蛇 | Casual |
| Flappy Bird | 像素鸟 | Casual |
| Doodle Jump | 涂鸦跳跃 | Casual |
| Breakout | 打砖块 | Casual |
| Pong | 乒乓 | Casual |
| Stacker | 堆叠方块 | Casual |
| Counter-Strike | 反恐精英 | Action |
| I Wanna | I Wanna | Action |
| Space Shooter | 太空射击 | Action |
| Galaga | 大战役 | Action |
| Asteroids | 小行星 | Action |
| Aim Lab | AimLab | Action |
| Bubble Shooter | 泡泡龙 | Puzzle |
| Tetris | 俄罗斯方块 | Puzzle |
| 2048 | 2048 | Puzzle |
| Simon Says | 西蒙记忆 | Puzzle |
| Minesweeper | 扫雷 | Puzzle |
| Wordle | 猜单词 | Puzzle |
| Sudoku | 数独 | Puzzle |
| Checkers | 跳棋 | Board & Card |
| Chess | 国际象棋 | Board & Card |
| Connect Four | 四子连珠 | Board & Card |
| Solitaire | 纸牌 | Board & Card |
| Texas Hold'em | 德州扑克 | Board & Card |

## 3D Exploration: Warm Villa

[Play Warm Villa / 暖居别墅](https://games.carrick7.com/#/villa): walk through a realistic, cozy three-story home with continuous stairs, collisions, day/evening lighting, and interactive furnishings. Explore the ground-floor living room, garden, pool, aquarium, gaming room, garage, and kitchen; upstairs bedrooms, bathroom, and library; and the roof terrace.

- **Desktop:** WASD moves; hold Shift to run. Moving the mouse looks around automatically, without holding a button; Esc frees the cursor, and clicking the scene resumes capture. ↑/↓ walks and ←/→ turns. E interacts / sits / stands up, Q operates the car door or switches the big screen's virtual PC / PlayStation / Switch input. M opens the floor plan, T switches day/evening, and H returns to the entrance.
- **Touch:** left joystick moves, right-side dragging looks; on-canvas buttons provide interaction, door / screen input, map, time, and home actions.
- **At home:** a Tesla-inspired sedan with an opening driver door and furnished cabin; a detailed mechanical keyboard, mouse, panoramic glass PC and gaming chair; a wheel/pedals cockpit and big-screen console corner; glazed Miku figurine and non-functional replica-weapon collections; a full-size snooker table and fitted kitchen. Screen inputs are original virtual scene demos, not a connection to physical consoles. Room names appear only in the optional floor plan, not as scene signs or persistent HUD labels.

## Features

- Bilingual interface: English and Chinese.
- Searchable game list with grouped navigation.
- Keyboard, mouse, and touch input where appropriate.
- Live keyboard panel for game-specific controls.
- Light, dark, and system theme modes.
- HiDPI Canvas rendering with stable logical coordinates.
- Local score records stored in the browser.

## Tech Stack

- TypeScript, Vite, and browser ES modules.
- HTML5 Canvas 2D rendering; the existing Three.js dependency supports shooter-family real 3D and the user-requested Warm Villa exploration experience within the same canvas shell.
- CSS custom properties for theming.
- Playwright end-to-end tests.
- Vitest unit tests.
- GitHub Actions and Caddy for production deployment.

Game metadata and dynamic loaders live in `src/games/catalog.ts`; `GameHost` and lifecycle code live in `src/core/game.ts`; shell behavior and rendering helpers are split across `src/app/`, `src/ui/`, and `src/main.ts`.

## Local Development

```bash
npm ci
npm run typecheck
npm run test:unit
npm run build
npm run test:e2e
npm run preview -- --host 127.0.0.1 --port 8080
```

Then open `http://localhost:8080`.

## Deployment

Pushes to `main` run the GitHub Actions workflow in `.github/workflows/deploy.yml`. The workflow type-checks, runs Vitest and Playwright, packages the Vite `dist/` output, then switches Caddy to a new release under `/var/www/games.carrick7.com/current`.

Development and deployment rules are documented in `AGENTS.md`. Visual design rules are documented in `DESIGN.md`.
