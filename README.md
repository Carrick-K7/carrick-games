# 🎮 Carrick Games

A curated collection of retro HTML5 Canvas games, built for the web.

Live site: **https://games.carrick7.com/**

---

## Games

| Game | EN | ZH | Description |
|------|----|----|-------------|
| Snake | Snake | 贪吃蛇 | Classic arcade snake |
| Pac-Man | Pac-Man | 吃豆人 | Maze chase with ghosts |
| Frogger | Frogger | 青蛙过河 | Cross roads and rivers |
| Flappy Bird | Flappy Bird | 像素鸟 | Tap to flap and dodge pipes |
| Doodle Jump | Doodle Jump | 涂鸦跳跃 | Bounce higher on platforms |
| I Wanna | I Wanna | I Wanna | Pure precision platforming with steadily harder jumps |
| Breakout | Breakout | 打砖块 | Bounce and break bricks |
| Pong | Pong | 乒乓 | Classic table tennis against AI |
| Parking | Parking | 停车小游戏 | Top-down parking challenge |
| Stacker | Stacker | 堆叠方块 | Time your locks to stack to the top |
| Space Shooter | Space Shooter | 太空射击 | Vertical space shooter |
| Space Invaders | Space Invaders | 太空侵略者 | Destroy waves of invaders |
| Galaga | Galaga | 大战役 | Vertical shooter formations |
| Asteroids | Asteroids | 小行星 | Thrust and shoot through asteroid fields |
| Missile Command | Missile Command | 导弹指挥官 | Defend cities from missiles |
| Beach Head | Beach Head | 抢滩登陆战 | Hold the shoreline and sink incoming landing waves |
| Berzerk | Berzerk | 狂暴机器人 | Maze chase, shoot robots |
| Bubble Shooter | Bubble Shooter | 泡泡龙 | Match colors and clear bubbles |
| Tetris | Tetris | 俄罗斯方块 | Falling blocks puzzle |
| 2048 | 2048 | 2048 | Slide and merge tiles |
| Simon Says | Simon Says | 西蒙记忆 | Memorize the color sequence |
| Minesweeper | Minesweeper | 扫雷 | Reveal cells and avoid mines |
| Wordle | Wordle | 猜单词 | Guess the 5-letter word |
| Sudoku | Sudoku | 数独 | Fill the 9x9 grid |
| Mahjong | Mahjong | 麻将连连看 | Match free tiles |
| Checkers | Checkers | 跳棋 | Classic checkers against AI |
| Chess | Chess | 国际象棋 | Classic chess against AI |
| Connect Four | Connect Four | 四子连珠 | Drop discs to connect four |
| Solitaire | Solitaire | 纸牌 | Classic Klondike Solitaire |
| Texas Hold'em | Texas Hold'em | 德州扑克 | Four-player poker with AI |

---

## Controls

Each game supports **keyboard** and **touch** input.

- **Keyboard**: standard arrow keys, WASD, and game-specific shortcuts (Z, X, Space)
- **Touch**: tap, swipe, and drag gestures (shown in the on-page controls panel)

A **live virtual keyboard** on the right side of the screen highlights the keys you are currently pressing.

---

## Features

- 🎨 **Miku-themed** minimalist UI with Light / Dark / Auto mode
- 🌐 **Bilingual** interface (English / 中文)
- 🔍 **Searchable** vertical game list
- ⌨️ **Real-time keyboard** visual feedback
- 🕹️ Unified **Start / Restart** button
- 🖋️ Retro pixel font inside every game canvas

---

## Tech Stack

- TypeScript + ES Modules
- HTML5 Canvas (no external game engine)
- Pure CSS variables for theming
- Deployed via GitHub Actions + Caddy atomic releases

---

## Local Development

```bash
npm ci
npm run build
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Deployment

Pushes to `main` run GitHub Actions. The workflow builds, runs Playwright e2e tests, packages `index.html`, `dist/`, and `fonts/`, then switches Caddy to a new release under `/var/www/games.carrick7.com/current`.

For Agent-developed changes, closure requires a commit, push to `main`, monitoring the GitHub Actions run to success, and smoke testing https://games.carrick7.com/.

Operational deployment details live in [AGENTS.md](AGENTS.md).

---

## Credits

Built by **Linus** for Carrick.
