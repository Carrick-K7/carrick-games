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
- Two 44px utilities float at the top-right safe area: a direct `?` guide left of the game menu, separated by 8px with a 12px outer margin. A lightweight 96×44px `#siteBrand` button pairs a 22px original teal gamepad with the full name stacked as “Carrick” / “Games”. It floats at top/left 12px plus safe-area insets for fixed games. For responsive `cs`, `cs-kimi` and `villa`, it moves beside the utility row at top 12px/right 116px plus safe-area insets. Clicking it opens the existing game library, not a home screen or start gate; it never reserves a page header.
- The brand and both utilities hide while pointer lock owns the canvas; `?` on the keyboard opens help directly from captured play. Touch keeps these actions available. The menu wordmark and library header also pair the same logo with the full “Carrick Games” name at every screen size.
- The menu opens with an explicit **Choose a game** section (localized label + accent-bordered current-game trigger), then wordmark, restart, settings and applicable utilities. Do not add browser-fullscreen, Return-to-game, or duplicate Controls entries. The game library stays a modal command palette on desktop and a bottom sheet on mobile.
- Controls open as a protected reading panel that drops down below the utility row. Parking's level selector stays in the menu. Opening either never resizes the game.
- Every menu, loading state and native game accessibility target lives inside the persistent `#gameApp` root. Descriptions, records, and statistics must not become permanent sidebars.

Browser fullscreen belongs to the browser (F11 or its own command). The app neither intercepts F11 nor uses the Fullscreen API; there are no per-game fullscreen buttons or F aliases. Window and visual-viewport resizing remain fully responsive.

Do not reintroduce permanent left/right rails, nested cards, category dashboards, or a full inactive keyboard.

## Game Switching

The current game name is visible in the startup state and game menu, where it is the game-switch trigger. Command/Ctrl+K opens the library directly during play.

The picker:

- opens only on demand from the site-brand button, current-game trigger or Command/Ctrl+K; show the platform-appropriate shortcut in the desktop current-game trigger;
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
- HUD coordinates, rendering resolution and world coordinates are separate. Responsive HUD anchors reserve 200×44px for the complete floating brand/help/menu cluster inside the top-right safe area; the content clearance below it remains 64px. Narrow/short menus reflow or scroll internally, with readable text and 44px touch actions.
- Preserve Gacha's top progress display rather than deleting it to fit the brand. Its counters sit to the right of the fixed-game brand; below 360px they stack in Gacha's own 112px top band instead of the normal 80px band. This game-owned accommodation is not a global page header or a change to the shared 64px clearance.
- Keep HiDPI backing stores sharp but bounded (DPR at most 2, shared canvas at most 8,294,400 pixels). Individual 3D renderers may use a lower quality budget without shrinking their CSS viewport.
- Entering a game starts it immediately: there is no start overlay to dismiss. Loading, failure/retry and startup occupy the stage; switching games remains reachable above them. Mouse capture and audio still follow browser gesture rules (pointer lock engages on the first canvas click).

`fitGameCanvas()` provides `GameViewport` width, height, DPR and safe-area insets. `BaseGame.setViewport()` preserves fixed logical coordinates by default; responsive games explicitly use `resizeLogicalViewport()` without reinitializing game state. `canvasPoint()` remains the only game input mapping path. Refits include height-only, DPR, visual viewport and fullscreen changes.

## Unified Operation Guide

Every game uses the same floating **? / Controls / 操作指南** trigger and shared panel. One click or the `?` key opens it without visiting the menu. It starts closed and never participates in stage sizing. Games supply catalog keyboard/touch entries and optional plain-text notes; existing help shortcuts may call `GameHost.presentation.openControls()`.

- The panel drops from the utility row: top edge 64px inside the safe area (12px margin + 44px button + 8px gap), right-aligned at 12px, at most 560px wide. Narrow or short screens use the same anchored panel at most 720px wide. No frame of the game is reserved: reading is modal with a protective backdrop.
- One restrained light/dark style: game-name subtitle, 15px title, consistent read-only keycaps/action rows and gesture labels. The 44px `×` stays in the fixed header; only the body scrolls. No Return button or redundant footer.
- Close with `×`, the same `?` trigger/key, Escape, or the backdrop. The dialog traps focus across its close action, scrollable body, site-brand button and both utility triggers (included with `aria-owns`); the stage is inert. The brand opens the library and the menu trigger opens navigation directly from help, without an extra close step or stacked overlays. On coarse pointers, show touch instructions rather than the physical keyboard.
- Reading pauses simulation and managed delays for every game, including fixed boards. Gameplay wall clocks exclude reading time. Opening clears held keys/fire/touches; closing resumes only presentation-owned pauses, preserving an intentional gameplay pause.
- Dismissal returns focus to the canvas, so the next movement key works immediately. A trusted click or `?` dismissal may restore capture previously owned by the same game. Escape leaves the cursor free; internal closes and game switching never recapture it.
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

- Keep the full “Carrick Games” identity with the original `#0d9488` gamepad on all sizes: compact stacked text in the floating site-brand button, full wordmark in the menu and library header. Never hide “Games” on mobile or substitute a monogram. The brand teal is fixed across themes and does not replace the shell's semantic accent tokens.
- Current game: 14px medium (13px mobile), with truncation for long names.
- Dialog heading: 22px semibold with tight tracking; desktop support copy: 12px.
- Game button name: 13px medium; section labels: 12px. Keep full names readable, including English two-line labels on phones.
- Start title: 28–32px desktop, 24px mobile, 600 weight and tight tracking.
- Avoid uppercase eyebrow labels and decorative display fonts.
- Keep Chinese and English at equivalent visual weight.

### Geometry, Spacing, and Elevation

- Branding and utility actions float over the stage; never subtract a page-header height from viewport calculations. Their top inset is 12px plus the safe area and their height is 44px. Shared HUD/guide content clearance remains 64px.
- Keep the site-brand button at 96×44px, with a 22px gamepad and stacked full name. Use the fixed-game left 12px or responsive-game right 116px anchor plus safe-area insets, rather than introducing a full-width header.
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

### Favicon and Installation Identity

- `public/brand/logo.svg` is the source of truth: retain the exact original 24×24 gamepad path and `#0d9488` fill. `index.html` links the external SVG favicon, PNG fallback and `/app.webmanifest`; page logos use the same SVG.
- Generate genuine 192×192 and 512×512 PNG icons for `purpose: any`, and a separate opaque 512×512 `purpose: maskable` icon. All use the same geometry on `#f6f7f5`; the regular mark is centered at 88% source scale, and the maskable mark at 72%, safely within the central 40%-radius circle. Do not mark an unpadded regular icon as maskable.
- The Web App Manifest names the app “Carrick Games” for both `name` and `short_name`, uses `/` for `id`, `start_url` and `scope`, `standalone` display, theme color `#0d9488`, and background color `#f6f7f5`. Keep icon sizes, MIME types and purposes accurate.
- `/manifest.json` remains separate deployment metadata, never the Web App Manifest. Do not add a service worker or claim offline support as part of branding. Existing Edge installations may require icon-cache refresh or reinstallation; native Windows Edge installation has not yet been tested.

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
- Shooter-family games and the user-requested Warm Villa (`villa`) exploration experience may use the existing `three` dependency, rendered back into the game's 2D canvas so shell contracts remain intact.

  **Warm Villa 1.1.0** is independently versioned by `src/games/villaVersion.ts`; it does not change the shared collection's `0.1.x` release line. The following describes the Villa source/design, not a claim about deployment status.

  - **Presentation and controls:** retain cozy, physically readable materials, automatic start, responsive camera aspect and the shell-owned `?` guide. Fullscreen remains browser-owned F11: no app button, F alias, intercepted F11 or second guide. P opens the contextual smart-home terminal; E follows the visible interaction/leave prompt, and Q handles a camping chair or the relevant door/screen secondary action. Keep M/T/H/I, elevator, rally and snooker controls in the catalog guide rather than a persistent footer/list. Mouse capture starts on a trusted scene click; Esc releases it. I hides HUD chrome except floor/location, with a location-tap exit on touch. Normal object prompts fade and respect occlusion; room names belong only in maps/location views.
  - **Access and safety:** the native mobile Use/Exit hit target exactly covers its canvas circle, fires once, hides with overlays/immersive mode and is removed on cleanup. Rejected actions explain why in up to two readable mobile lines, and a genuine refusal to a player action appears as a short-lived contextual message at the occupied object rather than a permanent footer. Crouching, gravity-driven jumps and head clearance preserve real floor/shaft/pool support. Stair finish and structure never share a plane. The elevator travels continuously through real slab openings with interlocked doors; 1/2/3 selects a floor inside. Occupancy or an obstructed sill prevents closure, while an empty cabin closes after four seconds. The staircase and the lift swapped places (`STAIR_HOLE` west, shaft east at `x=4.55`, doors facing +Z): keep both, keep the switchback stair continuous at 16.7°, and never replace travel with teleportation. Only the driver's door opens on either vehicle (`E` opens, seats and closes on one action); the car panel lists the top floor first and has its own Open/Close buttons.
  - **Orientation and estate:** +Z is south/front, +X east; the entrance faces south and the four-bay garage is east. Only the upper two storeys extend to `x=16` (`VILLA_EAST_WALL`) so the stair aisle, lift lobby and east rooms keep real walking clearance; the ground floor stays at `x=12` because the garage occupies that band. The lawn mesh is cut away under the whole building footprint, because a flat lawn sharing a plane with the interior slabs z-fights at thresholds and makes the lift floor look grassy. Preserve the original planted driving loop, house, west pool, garden aisles and roof terrace. Extend rolling terrain, scenic roads, fields and a natural pond southward; ground supports, fences, tyres, field edges and pond exclusion must agree. Fruit/leaf geometry distinguishes ten fruit trees; rooftop blooms and four vegetable beds remain botanical rather than labelled boxes or a crop-management game. The pool's water, basin, ground cutout and supports share POOL bounds, with loungers on its south cedar deck rather than the narrow side path.
  - **Tea and aquarium:** align actual BACK edges to the fireplace chimney datum `z=-0.31` (chimney centre `-0.1`, depth `0.42`), not unlike-depth counter centres. Tea bar `x=-7.05`, tank `x=-3.98`; preserve cabinet gaps, the `x=-2` room wall, living-side approaches and live collider bounds, including pulls. The visible tea cup starts empty; E progressively brews for ten seconds, a full/ready cup persists, then E lifts/tilts it, depletes liquid and sets it down empty. Busy presses do not reset brewing/drinking. Keep physical utensils, subtle steam and the independently operable recessed kitchen tap; no score/flood mechanic. The tank has ten slender top-view ornamental medaka with a blue-silver dorsal stripe, upturned mouth and rear-set translucent fins, plus six small segmented dark-brown/olive dwarf shrimp with rostra, antennae, legs, tail fans and grazing motion. No fat goldfish stand-ins; “black-shell” is a trade description, not a universal species claim.
  - **Seats, beds and wardrobes:** maintain 22 authored house/roof/pool seating/rest definitions covering sofas, dining and roof chairs, PC/guest chairs, stools, loungers and both beds, plus the outdoor swing and relocatable camping chair. Resolve sofa positions along their actual cushion segments from the pre-seat position; do not force one entry side. Small seats stay on their cushions. Preserve free look, correct floor/yaw, own-seat collider identity and collision-checked entry/exit candidates. Each bed has one centred pillow and a lying pose with the head nearby. The five-bay master wardrobe stays on the solid north partition, clear of glazing and doors; ten separated animated leaves expose nine women's compartments and only the rightmost small men's compartment, with ordinary garments, hats, bags and shoes. Update every moving collider, avoid coplanar panels and do not hide the open contents behind an opaque cabinet box. The vanity retains open knee space, a sittable stool, cosmetics and a polished framed mirror without a reflection render target.
  - **Companions:** six independent pets retain the original five IDs and add `rabbit-female`: puppy, cat, two parrots, a male rabbit and a female rabbit, naturally distinguished by coat/ear styling and labels, not sexualized anatomy. Each has separate feet/animation, food, dish, cooldown and driving obstacle identity. Clear-weather dog/cat visits remain. Rain sends all six by swept, collision-checked continuous routes to spaced living-room/garage shelter sites; birds fly over the forecourt, land/fold before the reserved-bay doorway and walk inside. Blocked routes yield/replan without teleporting or tunnelling; clear weather returns them to the lawn. Parrot tails stay attached and toes tuck rearward during flight; rabbits hop naturally. Vehicles stop before pets, but pets do not block walking visitors. Never add combat or injury.
  - **Collections and snooker:** nine locally authored, original adult anime figures use varied hairstyles, poses and modest full-coverage outfits; they use adult, non-chibi proportions, not reused licensed skins or downloaded character images. Retain the detailed PC and replica display. Snooker uses walnut-toned connected joinery, grounded feet and real cloth/slate pocket cutouts, with dynamic rolling/potted balls, readable cue/power feedback and switchable aiming guides. Guides must correspond to the physical playing surface, not float outside it. Practice scoring stays local, with no leaderboard or claim of complete tournament rules.
  - **Vehicles and rally:** the locally authored Model S-inspired electric fastback has a detailed, hollow interior; the utility pickup has a distinct cabin/open bed. Four garage bays include two spare bays, with a workshop and charging pedestal kept outside through routes. One contextual driver-door action opens, safely boards/exits and closes the door; motion, blocked corridors and lifecycle cancellation remain guarded. Road sedan/pickup/scooter W accelerates, S first brakes then reverses from rest, A/D steers and Space supplies a separate handbrake. The electric step-through retains independent wheels, handlebars, lean, stand and safe stationary dismounting. The forest/gravel rally retains bends, hills, rocks, stage splits and brake-only S. Circular steering wheels spin on fixed tilted shafts; right input is clockwise from the actual seated camera. Vehicles share live obstacles and ignore only their own identities; no driving-school signs, cones or exam objectives.
  - **Smart home and atmosphere:** P's terminal provides per-room/all lighting, fireplace/aquarium switches, day/evening/night, clear/rain weather, look sensitivity and snooker guides. Time, weather and light levels ease gradually; night remains readable with the lights off. Room lamps, corridors, roof LEDs and garden fixtures agree with their switches while reusing a six-point-light physical budget. CCTV shows one selected, genuinely rendered local-camera view at a time—not a decorative still or many simultaneous scene passes. Sensitivity applies to mouse/touch look without changing movement speed. This is game functionality, not a replacement shell or persistent dashboard.
  - **Resource discipline and references:** all meshes/materials/maps/targets remain scene-owned; static details are batched, aquarium animals are instanced, and pet parts share materials without dynamic shadow casters. Floor contact shadows do not float under elevated drawers/mirrors. No new dependencies or image downloads. Preserve cached software-GL input frames: continuous animation/AI time does not enter cache keys or unconditionally invalidate rendering. Aquatic proportions reference [Miyuki medaka](https://medaka.fr/especes-varietes/medaka-miyuki-longfin-fiche-complete-oryzias-latipes/) and [USGS dwarf-shrimp coloration](https://nas.er.usgs.gov/queries/FactSheet.aspx?SpeciesID=2257).
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

Games start automatically when prepared. Do not add a start overlay, click-to-start gate, branded landing screen or large external start button. The site-brand button opens only the existing game library; pointer capture and audio still obey browser gesture requirements.

Restart uses the shared Space, Enter, click, or tap behavior through `BaseGame.isRestartInput()` unless the game's continuation semantics require otherwise.

## Responsive Behavior

### Desktop

- Keep branding lightweight and floating, not a page header; the canvas remains the dominant full-viewport content.
- Keep the full shell inside the viewport on wide fine-pointer layouts; do not require page-level vertical scrolling.
- Put the compact keyboard/mouse mapping in the right gutter and necessary game context in the left gutter.
- Open game switching in a centered modal.

### Mobile and coarse pointer

- Keep the full logo-and-name brand visible at its fixed-game left or responsive-game right anchor; the current-game switcher stays inside the menu. Do not turn these controls into a mobile page header.
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
