# Carrick Games

A browser-based collection of retro-inspired HTML5 Canvas games.

Live site: https://games.carrick7.com/

Current release line: `0.1.x`.

## Games

Carrick Games currently ships 28 playable games:

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
| CS | 反恐精英 | Action |
| CS Kimi | 反恐精英 Kimi 版 | Action |
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

- **Desktop:** WASD moves; Shift runs, C toggles crouching, and Space jumps with gravity and head clearance. Moving the mouse looks around without holding a button; Esc frees the cursor, and clicking resumes capture. ↑/↓ walks and ←/→ turns. E interacts / sits / stands, Q operates the car door or screen input. M opens the floor plan, T switches day/evening, H returns to the entrance.
- **Fullscreen:** on desktop press F or click the villa's Fullscreen button (Esc first if the mouse is captured). The villa fills the available screen while preserving its aspect ratio and accurate hit areas; Esc/F exits. If native fullscreen is unavailable, it fills the browser viewport instead. Other games and the shell layout are restored on exit.
- **Quiet view:** I toggles immersive mode: the HUD shows only the current floor and location. Tap that location to restore controls on touchscreens. In normal mode, a small nearby interaction badge fades in on visible objects; it does not show through walls.
- **Touch:** left joystick walks or drives; drag on the right to look. Context buttons provide crouch/jump, held braking, resets, elevator floors and interactions. The Use/Exit circle has a native accessible touch target for Safari, with one action per press and visible feedback when the target is too far away or an action must wait. Snooker has separate aim, power and shot buttons outside the table view, with its Exit target separated from Shot on narrow phones.
- **Elevator:** at the north end of the central gallery, press E (or tap Use), walk inside, then press 1 / 2 / 3 or tap a floor button. All three floors are connected by continuous travel, with the original stairs retained. Doors stay open while occupied or the sill is obstructed; an empty car closes after four seconds. Calling it again reopens the doors.
- **Racing rig:** E sits at the wheel and selects the playable PC racing screen. W/S accelerates/brakes, A/D steers, Space brakes, R restarts and E stands up. Curved roads, traffic, collisions, checkpoints and laps respond to your input; the physical wheel turns too. Q still switches to original virtual PlayStation/Switch demos, not physical console streaming.
- **Test drive:** open the sedan's driver door with E, wait, then E to sit. Once the door closes, W/S drives forward/reverse, A/D steers and Space brakes. Follow the driveway south to the private practice course: reverse parking, parallel parking, an S-curve and a right-angle turn. E/Q require stopping and a clear door passage; walls, pool, fences and cones remain solid. R returns the car to the garage; H returns the visitor home and stops the parked car. This is a casual driving-school-style playground, not an official exam simulation.
- **Snooker:** E at the table's south end starts single-player practice on the existing 3D table. Mouse or ←/→ aims, ↑/↓ adjusts power, Space shoots, R sets a fresh rack, E leaves. Balls collide, rebound, settle and fall into six pockets; red/colour alternation, colour respots, final colour clearance and basic fouls are scored locally. There is no opponent, spin or full tournament rule enforcement, and no leaderboard submission.
- **Living garden:** ten fruit trees include cherries, oranges, mangoes, apples, pears and lemons. Rooftop planters grow roses, lavender, daisies, tulips, hydrangeas and sunflowers. A separate four-bed kitchen garden has tomatoes, lettuce, carrots and eggplants, with open walking aisles; these are decorative plantings, not a crop-management game.
- **Little companions:** a puppy, cat, parrot and rabbit roam the front garden lawn, rest and greet nearby visitors; the parrot gently lands before feeding. Approach and press E / tap Use to offer appropriate kibble, seeds or hay/greens. Visible food, eating and happy reactions have a short cooldown. They yield to one another, never fight, stay out of the pool/house/practice road, and the sedan stops before reaching them. Walking visitors are not blocked by pets; there is no animal damage or competitive score.
- **Kitchen tap:** stand in front of the recessed sink, press E / tap Use to turn the tap on or off. The handle moves and an animated stream drains into the basin with drops and ripples. Restarting turns it off; there is no flooding mechanic.
- **Tea bar:** the kitchen/dining area has a separate oak-and-stone brewing counter, slatted tea tray, gooseneck kettle, clay teapot, cups and tea canisters. Approach and press E / tap Use to brew for ten seconds with gentle steam; repeated taps do not restart the current brew.
- **Master bedroom:** a continuous five-bay, ten-door wardrobe row lines the solid north wall. A dressing table adds drawers, open knee space, a stool, lit-edge polished mirror, brushes, lipstick, compact and perfume. The bed, bedroom entrance and balcony remain reachable; wardrobes and cosmetics are decorative furnishings.
- **At home:** nine from-scratch original chibi girl collectibles have varied hairstyles, friendly poses and fully covered clothing; the replica-weapon cabinet, detailed PC, fitted kitchen, aquarium and all existing rooms remain. Room names are not painted onto the scenery; they appear in the optional map and location-only immersive HUD.

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
