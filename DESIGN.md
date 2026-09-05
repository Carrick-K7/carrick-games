# Carrick Games Design System

This is the repository's design authority. `README.md` is for external readers; `AGENTS.md` is for development workflow and deployment closure.

## Product Principle

Carrick Games is a simple, fun game collection. The shell exists only to help a player:

1. switch games,
2. see and play the game canvas,
3. understand the current keyboard and mouse mapping on desktop.

Everything else is contextual and optional. Games may be expressive; the page around them must stay quiet.

The target feel is a quiet boutique gaming space, not a game launcher dashboard: carefully weighted typography, generous breathing room, soft mineral surfaces, hairline dividers, and one clear content region. Premium means precise and calm, never a hero section, decorative background, or extra chrome.

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

- opens only on demand from the current-game trigger or Command/Ctrl+K; show the platform-appropriate shortcut in the desktop trigger;
- uses a 600px-wide desktop dialog, capped at `min(760px, calc(100dvh - 64px))`, with a 24px heading, concise supporting line, and 46px search field;
- puts search first and matches both English and Chinese names and descriptions;
- uses simple 12px text group headings with subdued result counts rather than colored category pills;
- presents one flat, at least 62px row per game: a 36px monochrome icon tile with 24px line artwork, a 14px game name, a 12px description, and a reserved status column;
- marks the selected game with an inset accent line and tick, not color alone; an arrow appears on unselected rows on hover/focus;
- supports Arrow Up/Down navigation through results, Enter to select, Escape/backdrop/close-button dismissal, focus trapping, and focus restoration to the opener;
- closes immediately after selection, without changing the current game simply by moving keyboard focus;
- shows a polite live result count in a hairline-separated footer, alongside compact desktop keyboard hints; keep the count but hide keyboard hints on mobile/coarse pointers;
- gives an empty search a clear heading and helpful secondary line;
- uses a bottom sheet with a small visual handle on mobile; the handle is decorative, not a promise of drag-to-dismiss behavior;
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

| Token / purpose | Light | Dark |
|---|---|---|
| `--page` | `#f6f7f5` | `#111512` |
| `--surface` / quiet fill | `#eef0ec` | `#1a201c` |
| `--surface-raised` / dialog and keycaps | `#ffffff` | `#202722` |
| `--text` | `#202723` | `#edf1eb` |
| `--muted` | `#666e68` | `#a0aba1` |
| `--border` | `#dde2db` | `#2d3830` |
| `--border-strong` | `#c7cec5` | `#435047` |
| `--accent` | `#28745c` | `#8bd5b0` |

Soft accent fills use 7% light-theme or 9% dark-theme accent opacity. Text uses the solid accent, never the tint, to preserve readable contrast.

Rules:

- No page-level radial ambience or decorative background gradients.
- No category color system in the shell.
- Accent marks focus, active selection, and meaningful state only.
- Do not rely on color alone for critical state.

### Typography

Use the system UI stack for the shell and canvases unless a symbol font is necessary.

- Wordmark: 16px semibold with a 28px monochrome brand mark; 14px and 24px on mobile. Keep “Carrick” visible and hide only the secondary “ Games” span on mobile.
- Current game: 14px medium (13px mobile), with truncation for long names.
- Dialog heading: 24px semibold with tight tracking; support copy: 13px.
- Game row name: 14px medium; descriptions: 12px; section labels: 12px.
- Start title: 28–32px desktop, 24px mobile, 600 weight and tight tracking.
- Avoid uppercase eyebrow labels and decorative display fonts.
- Keep Chinese and English at equivalent visual weight.

### Geometry, Spacing, and Elevation

- Use `--header-height` consistently for viewport calculations: 64px desktop and 60px at widths up to 720px.
- Desktop header side padding uses `clamp(24px, 4vw, 48px)`; mobile uses 12px, reducing to 8px at 360px and below.
- Current-game trigger: subtly filled, outlined, at least 40px high, 8px radius, small grid icon, name, chevron, and desktop shortcut keycap.
- Overflow and close buttons: 40×40px. Settings menu: 264px wide, 12px radius, subtle dividers, 12px section padding, and segmented text theme/language options at least 40px tall.
- Canvas radius: 8px, 1px bezel, near-flat shadow only.
- Buttons and fields: 6–8px radius; desktop dialog: 12px; mobile sheet: 16px top corners.
- Desktop picker header and search side inset: 26px; mobile: 20px. Rows use 12px horizontal padding and 10–12px gaps.
- Dialog footer preserves bottom safe-area inset. Mobile sheet caps at `min(88dvh, 760px)` and keeps search and footer outside its scrolling result region.
- Desktop stage padding: 24px; grid max-width: 1320px. Use natural side gutters of `minmax(180px, 1fr)` with `clamp(24px, 3vw, 48px)` gaps. Canvas fitting must subtract both real computed gaps and both 180px minimum gutters, not assume a percentage of the viewport.
- Keycaps have a quiet raised fill, 6px radius, and a 2px bottom inset edge; pressed state moves down 1px and uses a crisp accent border. Mouse feedback is a crisp accent, not a glow.
- Ordinary components have no floating shadow; only menus and dialogs use noticeable elevation.
- Avoid pill shapes except where semantics genuinely require them.

### Motion

Motion communicates state, not decoration.

- Menus and dialogs enter with a 150ms opacity/5px position transition. Hover and border transitions stay within 120–150ms; the backdrop uses a restrained dark tint and optional 3px blur.
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
- Gacha weapon prizes use `src/games/gachaWeaponIcons.ts` as the single artwork source across the reel, result, gallery, and history. The artwork is real Counter-Strike silhouettes: `src/games/gachaWeaponSilhouettes.ts` holds SVG path data traced from Valve's official inventory renders (never hand-drawn approximations). Profiles stay orthographic and use the principal front view (三视图正视图: muzzle +x, flat profile square to the viewer, no perspective), with supersampling for clean small thumbnails. Do not add a second perspective asset path. Every container sizes icons through `weaponIconFitSize()` using the measured per-weapon extents in `WEAPON_SILHOUETTE_DIMS`, so wide snipers fill their cells without overflow and tall knives stay inside theirs; never hand-pick a fixed pixel size for a new surface. Drop odds are never displayed anywhere; rarity color and tier name carry the prestige.

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

The title and hint sit on a restrained dark translucent canvas-sized backing with subtle 2px blur. A small CSS play triangle accompanies the hint, not a separate start control. Hover lightens the backing; keyboard focus gets a clearly visible inset outline. Do not duplicate control teaching or large external start buttons.

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
- Overflow, settings, close, fullscreen, and level-cell touch targets are at least 40px. Level grids auto-fit 40px minimum cells rather than squeezing a fixed column count.
- A 320px viewport must fit without horizontal overflow; hide the decorative picker grid below 360px when necessary, not the current game name.
- Use dynamic viewport height (`dvh`) for main, dialog, and fullscreen bounds. Fullscreen overlays remain aligned to the displayed canvas, not the wrapper.

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
