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
- **Game window:** the villa fills the webpage by default, adapting its camera and HUD to the screen's aspect ratio. Use the browser's own F11 command for fullscreen; there is no app fullscreen button or F shortcut.
- **Help:** click the floating `?`, or press `?` even while the mouse is captured. Read at your own pace, then close with `×`, `?`, Esc or the backdrop; no extra Return button is needed. Esc leaves the cursor free.
- **Quiet view:** I toggles immersive mode: the HUD shows only the current floor and location. Tap that location to restore controls on touchscreens. In normal mode, a small nearby interaction badge fades in on visible objects; it does not show through walls.
- **Touch:** left joystick walks or drives; drag on the right to look. Context buttons provide crouch/jump, held braking, resets, elevator floors and interactions. The Use/Exit circle has a native accessible touch target for Safari, with one action per press and visible feedback when the target is too far away or an action must wait. Snooker has separate aim, power and shot buttons outside the table view, with its Exit target separated from Shot on narrow phones.
- **Elevator:** at the north end of the central gallery, press E (or tap Use), walk inside, then press 1 / 2 / 3 or tap a floor button. All three floors are connected by continuous travel, with the original stairs retained. Doors stay open while occupied or the sill is obstructed; an empty car closes after four seconds. Calling it again reopens the doors.
- **Rally rig:** E selects the playable PC forest rally. W accelerates, S uses the service brake, A/D steers, Space applies the handbrake, R restarts and E stands. Winding gravel roads, hills, pine trees, roadside rocks and stage splits replace the circuit. The circular three-spoke wheel turns smoothly in the correct direction from the driver's view. Q retains the original virtual PlayStation/Switch demos, not physical console streaming.
- **Garden drive:** press E/Q once beside the driver door to open it and automatically board; the door then closes. W/S drives forward/reverse, A/D steers and Space applies the handbrake. An animated circular steering wheel sits on a fixed tilted shaft. The wider driveway leads to a broad planted garden loop without school signs, cones or examination objectives. When stopped with a clear doorway, E/Q opens the door, automatically steps outside and closes it. R returns the car to its clear garage space; H returns the visitor home and stops both vehicles.
- **Electric scooter:** E / Use beside the two-wheel step-through scooter mounts it. W accelerates, S brakes, A/D steers and Space / the touch HB button applies the handbrake. Wheels, handlebars, leaning and the stand animate with the ride. E dismounts only when stopped with a safe standing route. R resets to its clear parking space. Both vehicles respect each other, walls, fences, the pool and pets.
- **Sit and relax:** all five sofas across the house and roof, plus both pool loungers, support E / Use to sit and E / Exit to stand. Look around freely without driving controls. The enlarged 8.7 × 14 m pool faces loungers on a cedar deck, and the aquarium aligns with the tea-bar counter.
- **Snooker:** E at the table's south end starts single-player practice on the existing 3D table. Mouse or ←/→ aims, ↑/↓ adjusts power, Space shoots, R sets a fresh rack, E leaves. Balls collide, rebound, settle and fall into six pockets; red/colour alternation, colour respots, final colour clearance and basic fouls are scored locally. There is no opponent, spin or full tournament rule enforcement, and no leaderboard submission.
- **Living garden:** ten fruit trees include cherries, oranges, mangoes, apples, pears and lemons. Rooftop planters grow roses, lavender, daisies, tulips, hydrangeas and sunflowers. A separate four-bed kitchen garden has tomatoes, lettuce, carrots and eggplants, with open walking aisles; these are decorative plantings, not a crop-management game.
- **Little companions:** a puppy, cat, two independently animated parrots and a rabbit roam peacefully. The dog and cat sometimes walk through the real front doorway into the living room and return; they do not teleport through walls or furniture. Birds accelerate into flight, bank, land, fold their wings and alternate their steps on the ground. Approach and press E / tap Use to offer appropriate food; each animal has its own feeding cooldown and food plate. They stay out of the pool and garden road, and both vehicles stop before reaching them. Walking visitors are not blocked by pets; there is no animal damage or competitive score.
- **Kitchen tap:** stand in front of the recessed sink, press E / tap Use to turn the tap on or off. The handle moves and an animated stream drains into the basin with drops and ripples. Restarting turns it off; there is no flooding mechanic.
- **Tea bar:** the kitchen/dining area has a separate oak-and-stone brewing counter, slatted tea tray, gooseneck kettle, clay teapot, cups and tea canisters. Approach and press E / tap Use to brew for ten seconds with gentle steam; repeated taps do not restart the current brew.
- **Master bedroom:** a continuous five-bay, ten-door wardrobe row lines the solid north wall. A dressing table adds drawers, open knee space, a stool, lit-edge polished mirror, brushes, lipstick, compact and perfume. The bed, bedroom entrance and balcony remain reachable; wardrobes and cosmetics are decorative furnishings.
- **At home:** nine from-scratch original chibi girl collectibles have varied hairstyles, friendly poses and fully covered clothing; the replica-weapon cabinet, detailed PC, fitted kitchen, aquarium and all existing rooms remain. Room names are not painted onto the scenery; they appear in the optional map and location-only immersive HUD.

## Features

- Bilingual interface: English and Chinese.
- Searchable game list with grouped navigation.
- Keyboard, mouse, and touch input where appropriate.
- Full-viewport game windows with a small teal-gamepad **Carrick Games** button that opens the existing game library, plus `?` for help and a compact game/settings menu. Branding floats at the top-left for fixed games and beside the top-right utilities for CS, CS Kimi and Villa; all hide during pointer capture. There is no large page header. Browser fullscreen stays browser-owned (F11).
- Enter a game and play right away: no start prompt is shown, and pointer capture follows the browser gesture rules (first canvas click).
- One-click Controls for every game: the panel drops below the `?` button with readable key/gesture labels and a scrollable body; never shrinks the game. The settings menu leads with an explicit Choose a game entry.
- Help pauses play and timers; closing continues without restarting or clearing a manual gameplay pause. Keyboard focus returns directly to play.
- Light, dark, and system theme modes.
- Responsive 3D cameras and HUDs for CS, CS Kimi and Villa; fixed boards maximize at their original proportions.
- Bounded HiDPI Canvas rendering and consistent pointer coordinates across resizing and rotation.
- Local score records stored in the browser.

## Branding and Browser Installation

The page button, game menu and library header keep the full **Carrick Games** name on phones and desktops, paired with the original teal gamepad. The favicon and installation icons share the geometry in `public/brand/logo.svg`.

`index.html` links external SVG/PNG favicon assets and `/app.webmanifest`. The Web App Manifest supplies the Carrick Games name, root app identity and URLs, standalone display, teal theme color, and 192px/512px PNG icons plus a separately safe-padded 512px maskable icon. `/manifest.json` is deployment metadata, **not** the Web App Manifest, and must remain separate.

Where supported, use Edge's browser menu to install the site as an app. An existing installation may retain its old icon until Edge's icon cache refreshes or the app is reinstalled. Native Windows Edge installation has not yet been tested; this metadata does not provide offline support or a service worker.

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
