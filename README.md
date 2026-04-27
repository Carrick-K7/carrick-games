# Carrick Games

A browser-based collection of retro-inspired HTML5 Canvas games.

Live site: https://games.carrick7.com/

## Games

Carrick Games currently ships 27 playable games:

| Game | Chinese | Type |
|------|---------|------|
| Snake | 贪吃蛇 | Arcade |
| Pac-Man | 吃豆人 | Arcade |
| Frogger | 青蛙过河 | Arcade |
| Flappy Bird | 像素鸟 | Arcade |
| Doodle Jump | 涂鸦跳跃 | Arcade |
| I Wanna | I Wanna | Precision platformer |
| Parking | 停车 | Driving |
| Breakout | 打砖块 | Arcade |
| Pong | 乒乓 | Arcade |
| Stacker | 堆叠方块 | Arcade |
| Space Shooter | 太空射击 | Shooter |
| Galaga | 大战役 | Shooter |
| Asteroids | 小行星 | Shooter |
| Beach Head | 抢滩登陆战 | Shooter |
| Bubble Shooter | 泡泡龙 | Puzzle |
| Tetris | 俄罗斯方块 | Puzzle |
| 2048 | 2048 | Puzzle |
| Simon Says | 西蒙记忆 | Memory |
| Minesweeper | 扫雷 | Puzzle |
| Wordle | 猜单词 | Word |
| Sudoku | 数独 | Puzzle |
| Checkers | 跳棋 | Tabletop |
| Chess | 国际象棋 | Tabletop |
| Connect Four | 四子连珠 | Tabletop |
| Solitaire | 纸牌 | Card |
| Texas Hold'em | 德州扑克 | Card |
| Aim Lab | 瞄准实验室 | Skill |

## Features

- Bilingual interface: English and Chinese.
- Searchable game list with grouped navigation.
- Keyboard, mouse, and touch input where appropriate.
- Live keyboard panel for game-specific controls.
- Light, dark, and system theme modes.
- HiDPI Canvas rendering with stable logical coordinates.
- Local score records stored in the browser.

## Tech Stack

- TypeScript and browser ES modules.
- HTML5 Canvas 2D rendering.
- CSS custom properties for theming.
- Playwright end-to-end tests.
- GitHub Actions and Caddy for production deployment.

## Local Development

```bash
npm ci
npm run build
npm run test:e2e
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Deployment

Pushes to `main` run the GitHub Actions workflow in `.github/workflows/deploy.yml`. The workflow builds, runs Playwright e2e tests, packages `index.html`, `dist/`, and `fonts/`, then switches Caddy to a new release under `/var/www/games.carrick7.com/current`.

Development and deployment rules are documented in `AGENTS.md`. Visual design rules are documented in `DESIGN.md`.
