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

The page is a game window, not a webpage containing a canvas card:

- `#gameApp` and its game stage fill the visible browser viewport by default, including short landscape screens. No header, margins, bezel, corner radius, input strip, or side rail reserves game space.
- Two 44px utilities float at the top-right safe area: a direct `?` guide followed by the game menu, separated by 8px with a 12px outer margin. Both hide while pointer lock owns the canvas; `?` on the keyboard opens help directly from captured play. Touch keeps both utilities available.
- The menu contains the wordmark, current-game switcher, restart, settings, and applicable utilities. Do not add browser-fullscreen, Return-to-game, or duplicate Controls entries. The game library is a modal command palette on desktop and a bottom sheet on mobile.
- Controls open as an optional protected reading overlay. Parking's level selector stays in the menu. Opening either never resizes the game.
- Every menu, loading state and native game accessibility target lives inside the persistent `#gameApp` root. Descriptions, records, and statistics must not become permanent sidebars.

Browser fullscreen belongs to the browser (F11 or its own command). The app neither intercepts F11 nor uses the Fullscreen API; there are no per-game fullscreen buttons or F aliases. Window and visual-viewport resizing remain fully responsive.

Do not reintroduce permanent left/right rails, nested cards, category dashboards, or a full inactive keyboard.

## Game Switching

The current game name is visible in the startup state and game menu, where it is the game-switch trigger. Command/Ctrl+K opens the library directly during play.

The picker:

- opens only on demand from the current-game trigger or Command/Ctrl+K; show the platform-appropriate shortcut in the desktop trigger;
- shows all 28 games in one screen without scrolling, paging, or category switching at ordinary desktop and phone sizes; retain overflow only as an accessibility fallback for extreme zoom or an open software keyboard;
- uses a desktop dialog up to 1040px wide, with the heading, search, and close action in one compact toolbar;
- matches both English and Chinese names and descriptions; descriptions remain available to assistive technology and search but do not occupy visible rows;
- lays out four category columns on desktop, with simple 12px group headings and subdued counts, rather than colored category pills;
- uses compact 40–44px game buttons with 22px monochrome line icons and complete, wrapping 13px names; do not truncate names;
- uses a three-column, text-first grid on phones and a five-column grid on short landscape screens; visually hide group headings and icons in these compact layouts, while keeping semantic grouping;
- focuses the dialog rather than search on coarse pointers so opening the picker does not summon a software keyboard and obscure the choices; desktop retains search autofocus;
- marks the selected game with an inset accent line and tick, not color alone; an arrow appears on unselected rows on hover/focus;
- supports Arrow Up/Down navigation through results, Enter to select, Escape/backdrop/close-button dismissal, focus trapping, and dismissal back to the canvas (or the startup action before play);
- closes immediately after selection, without changing the current game simply by moving keyboard focus;
- shows a polite live result count in a hairline-separated footer, alongside compact desktop keyboard hints; keep the count but hide keyboard hints on mobile/coarse pointers;
- gives an empty search a clear heading and helpful secondary line;
- uses a bottom sheet on mobile, with only the toolbar, choices, and a compact count; short landscape hides the footer to preserve 40px targets;
- may preload a game on pointer or focus intent, but must not eagerly fetch every game.

Game names and grouping come from `src/games/catalog.ts`. Do not maintain a second game registry.

## Canvas Is the Product

The canvas is the only dominant visual object on the page.

- The game stage fills the visible viewport edge to edge; canvas has no page-level frame, shadow or rounded corners.
- Fixed-layout games use the largest complete, uniformly scaled board within the safe area. Necessary aspect-ratio margins use the quiet stage background; never stretch, crop, change board dimensions, or invent extra panels to fill them.
- CS, CS Kimi and Villa opt into responsive logical drawing dimensions. Their camera aspect follows the actual viewport, rather than enlarging a fixed 16:9 image. Preserve gameplay coordinates and the baseline vertical field of view.
- HUD coordinates, rendering resolution and world coordinates are separate. HUD anchors respect safe areas and the complete floating help/menu cluster; narrow/short menus reflow or scroll internally, with readable text and 44px touch actions.
- Keep HiDPI backing stores sharp but bounded (DPR at most 2, shared canvas at most 8,294,400 pixels). Individual 3D renderers may use a lower quality budget without shrinking their CSS viewport.
- Start through the stage overlay. Loading, failure/retry and startup occupy the stage; switching games remains reachable above them.

`fitGameCanvas()` provides `GameViewport` width, height, DPR and safe-area insets. `BaseGame.setViewport()` preserves fixed logical coordinates by default; responsive games explicitly use `resizeLogicalViewport()` without reinitializing game state. `canvasPoint()` remains the only game input mapping path. Refits include height-only, DPR, visual viewport and fullscreen changes.

## Unified Operation Guide

Every game uses the same floating **? / Controls / 操作指南** trigger and shared panel. One click or the `?` key opens it without visiting the menu. It starts closed and never participates in stage sizing. Games supply catalog keyboard/touch entries and optional plain-text notes; existing help shortcuts may call `GameHost.presentation.openControls()`.

- Desktop: lower-left reference panel, 12px inside the safe area, at most 560px wide. Responsive 3D games reserve a 160px bottom HUD dock, so the guide sits above it.
- Narrow, short-landscape or touch screens: one bottom sheet (at most 720px wide), clear of the top-right utilities.
- One restrained light/dark style: game-name subtitle, 15px title, consistent read-only keycaps/action rows and gesture labels. The 44px `×` stays in the fixed header; only the body scrolls. No Return button or redundant footer.
- Close with `×`, the same `?` trigger/key, Escape, or the backdrop. The dialog traps focus across its close action, scrollable body and both utility triggers (included with `aria-owns`); the stage is inert. The menu trigger switches directly from help to navigation without an extra close step. On coarse pointers, show touch instructions rather than the physical keyboard.
- Reading pauses simulation and managed delays for every game, including fixed boards. Gameplay wall clocks exclude reading time. Opening clears held keys/fire/touches; closing resumes only presentation-owned pauses, preserving an intentional gameplay pause.
- Dismissal focuses the canvas during play or the startup action before play, so the next movement/start key works immediately. A trusted click or `?` dismissal may restore capture previously owned by the same game. Escape leaves the cursor free; internal closes and game switching never recapture it.
- Opening another overlay or switching games closes the guide rather than stacking panels. Rotation preserves the game and readable guide; language/theme changes update the shared presentation.

Contextual game feedback (ammo, an interaction prompt, a map legend, or a restart cue) is not a full operation guide and stays with the gameplay HUD. Avoid persistent lists of shortcuts along the game canvas edges.

## Contextual Game Utilities

A game-specific shell utility is allowed only when removing it would block gameplay.

- Parking keeps level selection as a compact `Level N` disclosure inside the game menu, never beside or below the stage.
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

- Preserve the original text-only wordmark: “Carrick Games” at 15px, 650 weight, and -0.015em tracking; mobile shows “Carrick” at 14px. No added monogram or brand icon. Preserve the original teal gamepad favicon.
- Current game: 14px medium (13px mobile), with truncation for long names.
- Dialog heading: 22px semibold with tight tracking; desktop support copy: 12px.
- Game button name: 13px medium; section labels: 12px. Keep full names readable, including English two-line labels on phones.
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
- Desktop picker side inset: 24px, category gap: 16px, button gap: 4px. Phone grids use 12px side insets and 4px gaps; touch targets remain at least 40px high.
- The mobile sheet may use `calc(100dvh - 12px)` to fit all games. At heights below 700px, reduce toolbar spacing and buttons to 40px; at short landscape widths of at least 560px, use five columns and hide nonessential copy/footer. Never hide games to force a fit.
- Preserve footer bottom safe-area inset; retain a scroll fallback if zoom, larger fonts, or an open keyboard makes one-screen fitting impossible.
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
- Shooter-family games and the user-requested Warm Villa (`villa`) exploration experience may use the existing `three` dependency, rendered back into the game's 2D canvas so shell contracts remain intact. Villa favors realistic cozy materials, warm day/evening lighting, walkable continuous stairs, and collisions; its floor plan and visible controls stay in-canvas. Villa's mobile Use circle has a native accessible hit target aligned exactly over it, hidden with panels/immersive mode and removed on game cleanup; it does not forward a second event into the canvas. A rejected action must explain why, with up to two readable mobile feedback lines instead of silently replacing the message. Its viewport and aspect-correct hit areas follow ordinary browser resizing; fullscreen remains browser-owned. Mouse movement looks automatically (Esc releases capture), Shift runs, and contextual E/Q actions operate seats, doors and virtual screen inputs. Keep room names off architecture and the normal HUD. The optional I-key immersive HUD displays only current floor/location; all menus, reticles, hints and activity counters disappear until toggled back (touch can tap the location). Normal nearby interaction badges are small, fading and occlusion-aware. Stair tread finish and structural surfaces must not overlap; detailed vehicles, fitted appliances and glazed collections should read as physical objects, not labeled boxes. Villa's residential elevator has a continuous moving cabin, a real slab opening and interlocked landing doors: only an aligned, fully open car permits passage. Floor selection is contextual (1/2/3 or touch); retain the stairs and never replace travel with teleportation. Empty elevators close after a four-second delay; occupancy and a blocked sill cancel closure. Crouching and jumps preserve head clearance, walkable supports and shaft/pool safety. Collectible girls are original, cute chibi designs with modest full-coverage clothing, not reused character skins. The racing rig is a playable forest-and-gravel rally with coherent bends, hills, roadside rocks and a distinct Space handbrake. Both circular steering wheels spin independently of their fixed tilted shafts; right input must be verified as clockwise from the actual seated camera. A single E/Q driver-door action opens, automatically boards/exits and then closes the sedan door; motion, blocked corridors and lifecycle cancellation must remain safe. The garage leads to a broad planted garden loop without school signs, cones, examination bays or progress counters. A rideable two-wheel electric step-through scooter has responsive handlebars, rolling wheels, a folding stand, separate service/hand brakes, and safe stationary dismounting. Vehicles share live obstacles but ignore only their own collider identities. Snooker reuses the physical table but has dynamic rolling/potted balls, a below-ceiling playing camera and readable cue/power feedback; local practice scores never enter global leaderboards. The living garden distinguishes fruit species by actual fruit/leaf shapes, rooftop flowers by their blooms, and vegetable beds by crops and open aisles. A puppy, cat, two individually identified parrots and a rabbit yield peacefully, greet visitors and accept species-appropriate food with independent cooldowns and visible eating responses. Dog/cat visits to the living room follow real collision-checked doorway routes rather than teleporting. Parrots have independent flight phases, curved banked turns, smooth takeoff/landing, folded resting wings and alternating ground steps. Never add combat or injury; both vehicles stop before pet footprints, but pets do not block walking visitors. Keep crops, pots and tree trunks in their shared obstacle set. The kitchen tap must visibly open/close at its existing swan-neck spout, drain inside the recessed basin and reset shut. Fitted master-bedroom wardrobes belong along the solid partition, not across glazing or balcony doors; the dressing table needs real knee space, a stool, recognizable cosmetics and a polished framed mirror without another reflection render target. A separate tea bar uses physical brewing utensils and restrained timed steam, not a labelled block or a new scoring system; the aquarium aligns with its counter line. All sofas and both loungers support seated views and collision-checked standing exits without showing driving controls. The enlarged pool's water, basin, ground cutout and supports share POOL bounds, and the loungers face it from a low cedar deck rather than blocking the narrow side path. Floor contact shadows must not float underneath elevated drawers or mirrors. All new resources are scene-owned; static planting is batched, pets use shared materials without dynamic shadow casters, and continuous animation/AI values never enter software-GL cache keys.
- Gacha weapon prizes use `src/games/gachaWeaponIcons.ts` as the single artwork source across the reel, result, gallery, and history. The artwork is real Counter-Strike silhouettes: `src/games/gachaWeaponSilhouettes.ts` holds SVG path data traced from Valve's official inventory renders (never hand-drawn approximations). Profiles stay orthographic and use the principal front view (三视图正视图: muzzle +x, flat profile square to the viewer, no perspective), with supersampling for clean small thumbnails. Do not add a second perspective asset path. Every container sizes icons through `weaponIconFitSize()` using the measured per-weapon extents in `WEAPON_SILHOUETTE_DIMS`, so wide snipers fill their cells without overflow and tall knives stay inside theirs; never hand-pick a fixed pixel size for a new surface. Drop odds are never displayed anywhere; rarity color and tier name carry the prestige.

Game visuals branch with `this.isDarkTheme()` and use `getRetroPalette()` from `src/core/render.ts`. Shell minimalism must not flatten or remove useful game feedback.

## Canvas Text and HUD

- Size text for logical canvas dimensions, not the viewport.
- Use at least 11px on canvases up to 480 logical px and 13px on larger canvases where practical.
- Prefer compact top bars, side strips, or anchored HUDs.
- Keep critical score, timer, hazard, and state information readable at a glance.
- Use one line of in-canvas hint at a time.

## Overlays

Terminal win/loss/completion states use `BaseGame.drawResultOverlay()`; Gacha and Warm Villa have no terminal state and do not need a result overlay.

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
- Floating help/menu and guide-close targets are 44px. Settings and level-cell touch targets are at least 40px; level grids auto-fit minimum cells rather than squeezing a fixed column count.
- A 320px viewport must fit without horizontal overflow; hide the decorative picker grid below 360px when necessary, not the current game name.
- Use dynamic viewport height (`dvh`) for stage and dialog bounds. Game-owned targets remain aligned to the displayed canvas, not the wrapper.

## Themes and Language

Dark, light, and system themes remain supported, but they live in the overflow menu. Language selection also lives there.

Theme and language changes must repaint static canvases immediately and fit both English and Chinese without overlap.

## Game Families

The published collection contains 27 games across four broad families:

- Casual: Gacha, Parking, Warm Villa, Snake, Flappy Bird, Doodle Jump, Breakout, Pong, Stacker.
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
