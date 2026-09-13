# Carrick Games

28 browser games in a quiet, modern interface, with independently versioned static releases.

Live site: https://games.carrick7.com/

**Release identities:** each component has its own version. Live deployment identities are reported by `/manifest.json` and `/games/index.json`; repository documentation is not a deployment receipt. The former monolith's `0.1.x` version is historical, not a shared version for all games.

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

[Play Warm Villa / 暖居别墅](https://games.carrick7.com/#villa): a cozy three-story 3D home with continuous stairs, interactive furnishings, six peaceful pets and a drivable country estate. The entrance faces south (**+Z**); east is **+X**, toward the expanded garage. Explore the living room, kitchen, aquarium, gaming/snooker rooms and pool; upstairs bedrooms, bathroom and library; the roof garden; and the rolling southern landscape, fields and pond.

The features below describe Villa's independent **1.2.0 source version**, not a deployment announcement. `games/villa/package.json` is the version source of truth; `games/villa/src/villaVersion.ts` and the release entry read it. The shell and other games have their own versions.

- **Desktop:** WASD moves; Shift runs, C crouches, and Space jumps with gravity and head clearance. Mouse movement looks without holding a button; Esc frees the cursor, and a scene click captures it. ↑/↓ walks and ←/→ turns. E performs the current action, sits/lies down or leaves. Q carries/places a camping chair or operates the relevant vehicle-door/screen secondary action. P opens the smart terminal, M the floor plan, T cycles day/evening/night, and H returns to the entrance. Getting into the car is forgiving: standing anywhere at the driver's door counts, and if the door's swing is blocked the character steps back out of the way and then opens it.
- **Game window:** play starts automatically and the villa fills the webpage, adapting its camera and HUD to the screen's aspect ratio. Pointer capture still needs the first scene click. Use the browser's own F11 command for fullscreen; there is no app fullscreen button, F shortcut or persistent instruction footer.
- **Help:** click the floating `?`, or press `?` even while the mouse is captured. Read at your own pace, then close with `×`, `?`, Esc or the backdrop; no extra Return button is needed. Esc leaves the cursor free.
- **Quiet view:** I toggles immersive mode: the HUD shows only the current floor and location. Tap that location to restore controls on touchscreens. The modern utility layout keeps only map/location and terminal access in the Villa HUD; Home and Immersive live in the game menu, with time/weather in the terminal. In normal mode, a small nearby interaction badge fades in on visible objects; it does not show through walls.
- **Smart home:** P opens a game-local terminal for individual/all room lights, fireplace and aquarium lighting, roof LEDs, gradual day/evening/night and clear/rain transitions, snooker aiming guides and mouse/touch look sensitivity. Night stays readable with lights off. A reusable six-point-light budget serves the visible rooms rather than adding an expensive light for every fixture. Select one actual live CCTV view at a time from around the villa and estate; these are rendered scene views, not decorative photos. The terminal is separate from the shell's read-only `?` guide.
- **Touch:** left joystick walks or drives; drag on the right to look. Context buttons provide crouch/jump, held braking, resets, elevator floors and interactions. The Use/Exit circle has a native accessible touch target for Safari, with one action per press and visible feedback when the target is too far away or an action must wait. Snooker has separate aim, power and shot buttons outside the table view, with its Exit target separated from Shot on narrow phones.
- **Elevator:** the lift and the staircase swapped places in 1.1.0, so the shaft now stands in the north end of the former stairwell and the oak switchback stair fills the old shaft bay. The upper storeys also extend east to x=16, which widened the stair aisle and the lift lobby. Press E (or tap Use) at the lift doorway, then use the on-screen car panel — 3F/2F/1F listed top floor first, with separate Open and Close buttons — or press 1/2/3 for a floor and O/K for the doors. All three floors are connected by continuous travel, with the stairs retained. Doors stay open while occupied or the sill is obstructed; an empty car closes after four seconds. Calling it again reopens the doors. The car floor is tiled, not lawn.
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

## Interface and Play

- English/Chinese search and **All** plus four category filters in an on-demand game library. Unknown categories fall back to **Other** only when needed.
- Real 16:10 game-frame cover cards with full, wrapping names and one Play/Continue target. The desktop dialog grows to 1120px; phones use a near-full-height bottom sheet with one internal scroll area. Covers are captured from actual built games; game-owned input recipes keep gameplay and artwork updates independent.
- A full-viewport game stage with exactly three permanent shell actions: the small **Carrick Games** library button, `?` help and the game/settings menu. No sidebar, hero, start gate or app fullscreen toggle. Browser fullscreen stays browser-owned (F11).
- Games start automatically after preparation; a game's own arena/mode menu is allowed. Keyboard, mouse and touch input, pointer capture and audio retain browser gesture rules.
- Help shows up to three essentials for the current device, then expandable details. Reading pauses simulation and managed timers without clearing an intentional gameplay pause. Escape never recaptures the pointer.
- The menu leads with **Choose a game**, then contextual actions, restart/demo/level controls where supported, language/theme and subtle version information. Language and theme changes keep the menu open.
- Gacha keeps Draw and one native Collection control; statistics and sound move to its menu. Villa keeps map/location and terminal utilities rather than a row of permanent shortcuts.
- Light, dark and system themes, system typography and a modern shared result panel. Existing game worlds, palettes and mechanics are not globally restyled.
- Responsive 3D cameras/HUDs for CS, CS Kimi and Villa; complete fixed boards at their original proportions, bounded HiDPI rendering and consistent pointer coordinates during resize/rotation.
- Existing browser score storage and hash links remain. Selection prefers a direct `#id` link, otherwise the last successfully loaded game, otherwise Gacha or the first available game.

Opening the library refreshes the catalog without swapping a running release. **Continue** returns to the existing instance even when a new version is listed; **Update … (restart)** is an explicit choice. A switch preflights JavaScript and CSS while preserving the paused old instance. A pre-teardown failure can resume it; after teardown, recovery honestly offers a restart rather than claiming a lost session can be restored. Retry, resume-or-restart, choose another game and reload remain reachable.

## Independent Static Releases

```text
apps/shell/           Thin host: navigation, loading, preferences and shell UI
  src/ public/ tests/
games/<id>/          28 independent @carrick/game-<id> packages
  package.json       Own SemVer and declared dependencies
  game.json          Localized metadata, controls, icon and cover references
  src/index.ts       id, version, apiVersion: 1, create(host)
  src/ public/ tests/  Own mechanics, resources and fixtures
packages/game-sdk/   Shared ABI, lifecycle, renderer and geometry; own unit tests
packages/weapon-art/ Pure shared weapon icons used by Gacha and CS Kimi
scripts/             Workspace validation, builds and release orchestration
tests/               Generic shell/release contracts and reusable support
```

This is an npm-workspaces monorepo with **one root lockfile** and **Node.js ≥22.18.0**. It uses TypeScript, Vite, Canvas 2D, Vitest and Playwright. The existing `three` dependency is limited to CS, CS Kimi and Villa; no new runtime dependency is introduced.

- `/games/index.json` is the permanent API-1 discovery endpoint.
- Each game owns `/games/<id>/<SemVer>/<40-character-sha>/entry.js` and its CSS, chunks, bundled SDK/dependencies, assets, icon and `cover.webp` in the same immutable release.
- Shell releases remain reachable at `/shell/<40-character-sha>/`; `/` serves the current shell.
- Descriptor `schemaVersion`, runtime API epoch, package SemVer, activation `generation` and CI deployment `sequence` are distinct. Runtime API 1 requires an exact match, not “game API ≤ host version”.
- The shell discovers data rather than importing game implementations. Adding a game requires no central registry, loader or icon-map edit. Games cannot import other games; game assets resolve through the instance's `host.assetUrl(relative)` rather than a mutable global base.

## Branding and Browser Installation

The floating button, game menu and library retain the full **Carrick Games** name at every size and the exact original `#0d9488` gamepad in `apps/shell/public/brand/logo.svg`. Installation icons are genuine 192px/512px PNGs plus a separately safe-padded 512px maskable icon.

`apps/shell/index.html` links the Web App Manifest. Its app `id`, `start_url` and `scope` remain `/`, with standalone display. The build rewrites icon URLs to `/shell/<sha>/brand/...`, so modern installs do not depend on the pinned legacy `/brand/` namespace. `/manifest.json` is deployment metadata, **not** the Web App Manifest.

Where supported, use Edge's browser menu to install the site. Existing installations may retain old icons until an icon-cache refresh or reinstall. **Native Windows Edge installation remains untested. There is no service worker or offline support.**

## Local Development

Use Node.js ≥22.18.0 from the repository root:

```bash
npm ci
npm run dev
```

For the complete local build and browser checks:

```bash
npm run typecheck
npm run test:unit
npm run test:release
npm run build
npm run test:e2e
```

Playwright uses the built preview at `http://localhost:8080`; install its browsers when needed with `npx playwright install chromium webkit`. For manual preview after building, run `npm run preview -- --host 127.0.0.1 --port 8080`.

Focused iteration can use `npm run typecheck -- snake` and `npm run build:game -- snake`; `npm run build:shell` builds only the shell. A targeted build is not a release qualification and does not recreate the pinned published counterparts. The actual scoped verification orchestrator and bootstrap requirements are in `AGENTS.md`.

## Deployment and Operations

One `.github/workflows/deploy.yml` DAG checks pull requests and plans independent publications on `main`. In steady state, each game candidate is tested with a **pinned published shell**; a shell candidate is tested with **pinned published games**. An unrelated game's failure does not block an independent game release. Docs/test-only changes do not themselves publish runtime artifacts; pending, unhandled runtime changes are still evaluated separately.

The first migration is a special full-suite gate: seed all tested game identities first, then activate the modern shell last. Repeated bootstrap attempts reuse unchanged, already-seeded identities. This bootstrap still requires full typecheck, unit tests, build and all E2E before an application commit, followed by exact-SHA Actions monitoring and public smoke tests.

The private `Carrick-K7/carrick-ops` repository owns the restricted publisher, Caddy mounts, rollback wrappers and read-only doctor. Publication validates complete immutable inventories and promotes only one target under generation/sequence/counterpart fences. It never restores a whole catalog over another game's release. All immutable releases are retained—no automatic garbage collection; monitor disk and inodes.

The first cutover pins one validated copy of the in-service legacy release so existing `/assets/`, `/cs/`, `/gacha/`, `/fonts/` and `/brand/` URLs keep serving those bytes. Missing pinned resources return 404, not modern files or SPA HTML. Prior modern immutable URLs also remain reachable. Rollbacks must use the ops wrappers, never a manual symlink switch.

Development, secrets, operations and release closure: `AGENTS.md`. Visual and interaction authority: `DESIGN.md`. Only these three root project documents are maintained.
