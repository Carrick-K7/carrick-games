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

[Play Warm Villa / 暖居别墅](https://games.carrick7.com/#/villa): a cozy three-story 3D home with continuous stairs, interactive furnishings, six peaceful pets and a drivable country estate. The entrance faces south (**+Z**); east is **+X**, toward the expanded garage. Explore the living room, kitchen, aquarium, gaming/snooker rooms and pool; upstairs bedrooms, bathroom and library; the roof garden; and the rolling southern landscape, fields and pond.

The features below describe Villa's independent **1.1.0 source version**, `VILLA_VERSION` in `src/games/villaVersion.ts`, not a deployment announcement. The shared collection's `0.1.x` release line is unchanged.

- **Desktop:** WASD moves; Shift runs, C crouches, and Space jumps with gravity and head clearance. Mouse movement looks without holding a button; Esc frees the cursor, and a scene click captures it. ↑/↓ walks and ←/→ turns. E performs the current action, sits/lies down or leaves. Q carries/places a camping chair or operates the relevant vehicle-door/screen secondary action. P opens the smart terminal, M the floor plan, T cycles day/evening/night, and H returns to the entrance.
- **Game window:** play starts automatically and the villa fills the webpage, adapting its camera and HUD to the screen's aspect ratio. Pointer capture still needs the first scene click. Use the browser's own F11 command for fullscreen; there is no app fullscreen button, F shortcut or persistent instruction footer.
- **Help:** click the floating `?`, or press `?` even while the mouse is captured. Read at your own pace, then close with `×`, `?`, Esc or the backdrop; no extra Return button is needed. Esc leaves the cursor free.
- **Quiet view:** I toggles immersive mode: the HUD shows only the current floor and location. Tap that location to restore controls on touchscreens. In normal mode, a small nearby interaction badge fades in on visible objects; it does not show through walls.
- **Smart home:** P opens a game-local terminal for individual/all room lights, fireplace and aquarium lighting, roof LEDs, gradual day/evening/night and clear/rain transitions, snooker aiming guides and mouse/touch look sensitivity. Night stays readable with lights off. A reusable six-point-light budget serves the visible rooms rather than adding an expensive light for every fixture. Select one actual live CCTV view at a time from around the villa and estate; these are rendered scene views, not decorative photos. The terminal is separate from the shell's read-only `?` guide.
- **Touch:** left joystick walks or drives; drag on the right to look. Context buttons provide crouch/jump, held braking, resets, elevator floors and interactions. The Use/Exit circle has a native accessible touch target for Safari, with one action per press and visible feedback when the target is too far away or an action must wait. Snooker has separate aim, power and shot buttons outside the table view, with its Exit target separated from Shot on narrow phones.
- **Elevator:** the lift and the staircase swapped places in 1.1.0, so the shaft now stands in the north end of the former stairwell and the oak switchback stair fills the old shaft bay. Press E (or tap Use) at the lift lobby east of the hall, walk inside, then press 1 / 2 / 3 or tap a floor button. All three floors are connected by continuous travel, with the stairs retained. Doors stay open while occupied or the sill is obstructed; an empty car closes after four seconds. Calling it again reopens the doors.
- **Rally rig:** E selects the playable PC forest rally. W accelerates, S uses the service brake, A/D steers, Space applies the handbrake, R restarts and E stands. Winding gravel roads, hills, pine trees, roadside rocks and stage splits replace the circuit. The circular three-spoke wheel turns smoothly in the correct direction from the driver's view. Q retains the original virtual PlayStation/Switch demos, not physical console streaming.
- **Estate driving:** a locally authored Model S-inspired electric fastback has a detailed hollow interior; a separate utility pickup adds a cabin and open cargo bed. E/Q at the driver door opens it, safely boards/exits and closes it. W accelerates; S brakes first, then reverses from rest; A/D steers and Space applies the handbrake. Circular steering wheels turn on fixed tilted shafts. The expanded four-bay east garage keeps two spare bays, a workshop and charging pedestal. Drive the preserved planted loop or the rolling southern roads past fields and a pond—without school signs, cones or exam objectives. Exiting requires a stopped vehicle and clear route. R resets to a clear parking space; H returns the visitor home and stops the vehicles.
- **Electric scooter:** E / Use mounts the two-wheel step-through scooter. W accelerates, S first brakes and then reverses when stopped, A/D steers, and Space / touch HB applies the handbrake. Wheels, handlebars, lean and the stand animate with the ride. E dismounts only when stopped with a safe standing route; R resets to a clear parking space. Sedan, pickup and scooter share live collision checks for each other, walls, fences, water and pets.
- **Sit and relax:** 22 authored house/roof/pool seats and rest poses cover all sofas, dining/roof/guest/PC chairs, stools, loungers and beds; a garden swing and relocatable camping chair add two outdoor seats. E / Use sits or lies down; E / Exit stands when a safe route is clear. Sofa seating follows the cushion nearest your approach rather than forcing one side; small chairs stay centred. Each bed has one centred pillow, with your head nearby and free look while resting. Q carries/places the camping chair on clear ground. Pool loungers face the enlarged 8.7 × 14 m pool from its south cedar deck.
- **Snooker:** E at the south end starts single-player practice on a walnut-toned table with connected joinery, grounded legs and real cloth/slate pocket openings. Mouse or ←/→ aims, ↑/↓ adjusts power, Space shoots, R racks and E leaves. The smart terminal toggles aiming guides. Balls collide, rebound, settle and fall into six pockets; red/colour alternation, colour respots, final colour clearance and basic fouls are scored locally. There is no opponent, spin, complete tournament ruleset or leaderboard submission.
- **Living garden:** ten fruit trees include cherries, oranges, mangoes, apples, pears and lemons. Rooftop planters grow roses, lavender, daisies, tulips, hydrangeas and sunflowers. The four-bed kitchen garden retains tomatoes, lettuce, carrots and eggplants with open aisles. Farther south, planted fields and a natural pond accompany the scenic terrain; these are decorative plantings, not a crop-management game.
- **Little companions:** six peaceful pets include a puppy, cat, two independently animated parrots, and male/female rabbits distinguished by subtle coat/ear styling and labels. Each has its own food, dish, cooldown and animation. Dog/cat living-room visits remain; rain sends all six along real collision-checked routes to spaced living-room or garage shelter sites. Birds fly over the forecourt, land/fold before the spare-bay doorway and walk inside; rabbits hop. Blocked routes wait/replan without teleporting through furniture or vehicles, and clear weather brings them back to the lawn. E / Use offers suitable food and does not reset another pet's reaction. Vehicles stop before them; walking visitors are not blocked, and there is no animal damage or competitive score.
- **Kitchen tap:** stand in front of the recessed sink, press E / tap Use to turn the tap on or off. The handle moves and an animated stream drains into the basin with drops and ripples. Restarting turns it off; there is no flooding mechanic.
- **Tea bar and aquarium:** both cabinets align their actual back edges with the fireplace wall, with gaps between them and clear living-side access. The oak-and-stone bar retains its tea tray, gooseneck kettle, teapot and canisters. The cup starts visibly empty: E / Use gradually brews for ten seconds, the full cup stays ready, and a later E lifts/tilts it to drink until empty. Busy presses do not restart brewing/drinking. The aquarium holds ten slender, blue-silver dorsal-striped ornamental medaka and six small dark-brown/olive dwarf shrimp with segmented bodies, antennae and grazing motion. All geometry is locally authored; “black-shell” describes a trade appearance, not one guaranteed species.
- **Master bedroom:** E opens/closes the north-wall wardrobe's ten animated doors, revealing nine women's compartments with everyday garments, hats, bags and shoes; only the rightmost small compartment contains men's clothing. The cabinet is genuinely open inside, and live door collisions preserve safe approaches. The dressing table retains drawers, open knee space, a sittable stool, lit-edge polished mirror and cosmetics. The bedroom entrance, bed and balcony remain reachable.
- **At home:** nine from-scratch original adult anime collector figures have adult, non-chibi proportions, varied hairstyles/poses and modest full-coverage clothing. No licensed characters or downloaded character skins are reused. The replica-weapon cabinet, detailed PC, fitted kitchen and all existing rooms remain. Room names are not painted onto the scenery; they appear in the optional map and location-only immersive HUD. Static details remain batched and scene-owned, while aquarium animals use conservative instanced geometry.

## Features

- Bilingual interface: English and Chinese.
- Searchable game list with grouped navigation.
- Keyboard, mouse, and touch input where appropriate.
- Full-viewport game windows with two floating controls: `?` for help and a compact game/settings menu. Browser fullscreen stays browser-owned (F11).
- Enter a game and play right away: no start prompt is shown, and pointer capture follows the browser gesture rules (first canvas click).
- One-click Controls for every game: the panel drops below the `?` button with readable key/gesture labels and a scrollable body; never shrinks the game. The settings menu leads with an explicit Choose a game entry.
- Help pauses play and timers; closing continues without restarting or clearing a manual gameplay pause. Keyboard focus returns directly to play.
- Light, dark, and system theme modes.
- Responsive 3D cameras and HUDs for CS, CS Kimi and Villa; fixed boards maximize at their original proportions.
- Bounded HiDPI Canvas rendering and consistent pointer coordinates across resizing and rotation.
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
