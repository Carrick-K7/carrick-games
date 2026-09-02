# Carrick Games Design System

This is the repository's design authority. `README.md` is for external readers; `AGENTS.md` is for development workflow and deployment closure.

## Product Principle

Carrick Games is a simple, fun game collection. The shell exists only to help a player:

1. switch games,
2. see and play the game canvas,
3. understand the current keyboard and mouse mapping on desktop.

Everything else is contextual and optional. Games may be expressive; the page around them must stay quiet.

The target feel is closer to Nuxt or Substack than to a game launcher dashboard: strong typography, generous breathing room, neutral surfaces, hairline dividers, and one clear content region.

Do not add a separate visual-style document. Put durable visual decisions here.

## Shell Information Architecture

The persistent shell has exactly three layers:

- A thin header with the wordmark, current-game switcher, and one overflow menu.
- A centered game canvas.
- A compact desktop input strip containing only controls used by the current game.

The following are not persistent page regions:

- The game library opens as a modal command palette on desktop and a bottom sheet on mobile.
- Theme, language, demo, and other low-frequency actions live in the overflow menu.
- Game-specific utilities such as Parking's level selector appear as a compact disclosure below the canvas.
- Descriptions, records, and statistics must not become permanent sidebars.

Do not reintroduce permanent left/right rails, nested cards, category dashboards, or a full inactive keyboard.

## Game Switching

The current game name is always visible in the header and is the game-switch trigger.

The picker:

- opens only on demand;
- puts search first;
- uses simple text group headings rather than colored category pills;
- presents one flat row per game;
- closes immediately after selection;
- supports Escape, backdrop close, focus-visible states, and mobile touch targets;
- may preload a game on pointer or focus intent, but must not eagerly fetch every game.

Game names and grouping come from `src/games/catalog.ts`. Do not maintain a second game registry.

## Canvas Is the Product

The canvas is the only dominant visual object on the page.

- Center it in the available viewport.
- Keep its logical dimensions and HiDPI behavior unchanged.
- Fit it without permanent side panels; on wide desktops, use the natural side gutters for compact contextual controls rather than extending the page vertically.
- Use only a 1px bezel, small radius, and near-flat shadow in the shell.
- Keep fullscreen affordance quiet and reveal it on hover/focus; touch may keep it faintly visible.
- Start through the canvas overlay. Do not duplicate the action with a large external start button.
- Keep loading and error states aligned to the displayed canvas bounds.

`fitGameCanvas()` in `src/main.ts` and `setCanvasDisplaySize()` in `src/core/render.ts` own display scaling. Never change logical coordinates or pointer mapping to fit the shell.

## Input Mapping

Fine-pointer desktops show a compact mapping beside the canvas when side space permits, and below it only on narrower layouts.

- Render only controls the current game uses.
- Group keycaps with their action label.
- Keep real keyboard presses visibly synchronized.
- Keep a small live mouse indicator; do not draw a full decorative keyboard or mouse.
- Do not put controls in a separate card.

Hide the entire mapping on `pointer: coarse` and narrow mobile layouts. Touch games express their controls through the canvas and catalog guidance, not permanent page chrome.

## Contextual Game Utilities

A game-specific shell utility is allowed only when removing it would block gameplay.

- Parking keeps level selection as a compact `Level N` disclosure in the left desktop gutter or below the canvas on compact layouts.
- Demo actions live in the overflow menu and appear only for games that support them.
- Scores and moment-to-moment telemetry belong in the game canvas whenever possible.
- Large steering instruments, records cards, game descriptions, and progress dashboards are not persistent shell UI.

When a contextual control expands, it should collapse after a selection and must not compete with active gameplay.

## Visual Language

Carrick Games has one shell style. There is no modern/pixel shell mode switch.

Individual games may still use pixel art or another visual language inside their canvas. The shell remains neutral and consistent.

### Color

Use a neutral page with one accent color.

| Purpose | Dark | Light |
|---|---|---|
| Page | `#0f0f0f` | `#ffffff` |
| Quiet surface | `#171717` | `#fafafa` |
| Text | `#f5f5f5` | `#111111` |
| Muted | `#a3a3a3` | `#6b7280` |
| Border | `#2a2a2a` | `#e5e7eb` |
| Accent | `#2dd4bf` | `#0d9488` |

Rules:

- No page-level radial ambience or decorative background gradients.
- No category color system in the shell.
- Accent marks focus, active selection, and meaningful state only.
- Do not rely on color alone for critical state.

### Typography

Use the system UI stack for the shell and canvases unless a symbol font is necessary.

- Wordmark: 15–16px, semibold.
- Current game: 14px, medium.
- Body and list rows: 12–14px.
- Avoid uppercase eyebrow labels and decorative display fonts.
- Keep Chinese and English at equivalent visual weight.

### Geometry and Elevation

- Canvas radius: 6–8px.
- Buttons and fields: 5–7px.
- Modal or mobile sheet: 10–12px.
- Ordinary components have no shadow.
- Only dialogs may use obvious elevation.
- Avoid pill shapes except where semantics genuinely require them.

### Motion

Motion communicates state, not decoration.

- Menus and dialogs may use a short 120–160ms opacity/position transition.
- Keyboard and mouse indicators react immediately.
- Do not stagger game-list entrances or animate every page component.
- Honor `prefers-reduced-motion`.

## Canvas Craft

The shared rendering toolkit is `src/core/fx.ts`. Reach for it before writing one-off game drawing code.

- Use `fillBevelTile`, `fillSphere`, `shade`, and `withAlpha` for a consistent top-light model.
- Use glow only for energy, rare rewards, hits, and interactive hotspots.
- Use layered scene backgrounds and restrained vignettes to create depth inside games.
- Use shared particles, screen shake, tweens, and float text for meaningful feedback; keep counts bounded.
- Cache detailed sprites with `makeSprite()`/`drawSprite()` rather than rebuilding them every frame.
- Avoid per-frame `shadowBlur` storms.
- Shooter-family games may use `three`, rendered back into the game's 2D canvas so shell contracts remain intact.
- Gacha weapon prizes use `src/games/gachaWeaponIcons.ts` as the single artwork source across the reel, result, gallery, and history. Profiles stay orthographic and use the principal front view (三视图正视图: muzzle +x, flat profile square to the viewer, no perspective), with supersampling for clean small thumbnails. Do not add a second perspective asset path. Drop odds are never displayed anywhere; rarity color and tier name carry the prestige.

Game visuals branch with `this.isDarkTheme()` and use `getRetroPalette()` from `src/core/render.ts`. Shell minimalism must not flatten or remove useful game feedback.

## Canvas Text and HUD

- Size text for logical canvas dimensions, not the viewport.
- Use at least 11px on canvases up to 480 logical px and 13px on larger canvases where practical.
- Prefer compact top bars, side strips, or anchored HUDs.
- Keep critical score, timer, hazard, and state information readable at a glance.
- Use one line of in-canvas hint at a time.

## Overlays

Terminal win/loss/completion states use `BaseGame.drawResultOverlay()`; Gacha remains the published exception because it has no terminal state.

Start overlays contain only:

- the game name;
- one concise click/tap-to-start instruction.

Do not duplicate control teaching or large external start buttons.

Restart uses the shared Space, Enter, click, or tap behavior through `BaseGame.isRestartInput()` unless the game's continuation semantics require otherwise.

## Responsive Behavior

### Desktop

- Keep the header thin and the canvas centered.
- Keep the full shell inside the viewport on wide fine-pointer layouts; do not require page-level vertical scrolling.
- Put the compact keyboard/mouse mapping in the right gutter and necessary game context in the left gutter.
- Open game switching in a centered modal.

### Mobile and coarse pointer

- Keep wordmark, current-game switcher, and overflow menu in one row.
- Let the canvas use nearly the full viewport width.
- Hide keyboard/mouse mapping completely.
- Open game switching as a bottom sheet.
- Do not render permanent descriptions, records, or control cards below the game.
- Touch targets should be at least 40px where space allows.

## Themes and Language

Dark, light, and system themes remain supported, but they live in the overflow menu. Language selection also lives there.

Theme and language changes must repaint static canvases immediately and fit both English and Chinese without overlap.

## Game Families

The published collection contains 26 games across four broad families:

- Casual: Parking, Gacha, Snake, Flappy Bird, Doodle Jump, Breakout, Pong, Stacker.
- Action: Counter-Strike, I Wanna, Space Shooter, Galaga, Asteroids, Aim Lab.
- Puzzle: Bubble Shooter, Tetris, 2048, Simon Says, Minesweeper, Wordle, Sudoku.
- Board & Card: Checkers, Chess, Connect Four, Solitaire, Texas Hold'em.

Family labels organize the on-demand picker only; they are not permanent dashboard filters.

## Acceptance Checklist

Before a shell or visual change is complete:

- The first viewport is dominated by the current game canvas.
- Game switching is obvious without a permanent library rail.
- No game name, start action, or control legend is duplicated.
- Desktop shows only relevant keyboard/mouse mappings.
- Mobile and coarse-pointer layouts show no keyboard/mouse panel.
- Parking level selection and supported Demo flows remain reachable.
- Dark/light/system themes and English/Chinese remain coherent.
- Canvas pointer mapping and HiDPI scaling remain correct.
- `npm run typecheck`, `npm run test:unit`, `npm run build`, and full `npm run test:e2e` pass.
