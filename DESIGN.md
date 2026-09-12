# Carrick Games Design System

This is the repository's visual and interaction authority. `README.md` is the public overview; `AGENTS.md` owns development, verification and release closure. Keep durable design decisions here rather than adding another root document.

The rules below define the design and acceptance contract. Validate actual desktop/mobile screenshots and interaction tests for each affected release; this document alone is not evidence of a successful deployment.

## Product Principle

Carrick Games is a game window with an on-demand library, not a dashboard. The shell helps a player choose a game, play it and understand the current device's controls. Games may be expressive; their surroundings stay quiet, readable and precise.

Use system typography, soft mineral surfaces, restrained borders and clear focus. No permanent sidebar, hero, landing/start gate, fullscreen toggle, style-mode switch or decorative dashboard. Modernize the shell and **shared result panel only**; do not rewrite existing game worlds, palettes or gameplay to match the shell.

## Permanent Shell and Canvas

- The persistent `#gameApp` and game stage fill the visible viewport, including short landscape screens. No page header, stage gutters, canvas card/bezel/radius/shadow, footer instructions or side rail reserves game space. All overlays and native game accessibility targets stay inside that root; never reparent the canvas.
- Exactly **three permanent shell actions**, each a real native target rather than a larger visual pseudo-element around a smaller hitbox:

  | Action | Target | Anchor, plus safe-area insets |
  |---|---|---|
  | Carrick Games / `#siteBrand` | 96×44px; exact 22px gamepad and full stacked name | Top/left 12px for fixed games; top 12px/right 116px for responsive CS, CS Kimi and Villa |
  | Help / `?` | 44×44px | Top 12px/right 64px |
  | Game/settings menu | 44×44px | Top 12px/right 12px |

- Brand activation opens the existing library, not a home screen. Full Carrick Games identity and the same gamepad also remain in library/menu headers on mobile. Brand/help/menu hide during pointer capture; keyboard `?` still opens help from captured play. Touch keeps the controls reachable.
- Responsive HUDs reserve the existing 200×44px top-right utility cluster and 64px content clearance. Brand/help/menu are floating, not a new global header.
- Fixed boards use the largest complete uniformly scaled board within the safe area. Quiet aspect-ratio margins are allowed; stretching, cropping or changing logical board dimensions to fill them is not.
- CS, CS Kimi and Villa use responsive logical dimensions with actual camera aspect and baseline vertical field of view. Keep HUD coordinates, rendering resolution and world coordinates separate.
- Keep bounded HiDPI rendering: DPR at most 2 and shared canvas at most 8,294,400 pixels. Game-owned 3D renderers may use a lower rendering budget without shrinking the CSS viewport. `canvasPoint()` remains the input coordinate path.
- `GameViewport`/`setViewport()` preserve fixed game coordinates; opt-in `resizeLogicalViewport()` does not reinitialize gameplay. Handle window, visual viewport, height-only, DPR and rotation changes.
- Games autoplay after preparation, without a shell start overlay or external Start button. A game-specific arena/mode menu remains allowed. Pointer capture/audio retain browser gesture rules; the first trusted canvas click captures a 3D game.

Browser fullscreen belongs to the browser (F11 or its own command). No Fullscreen API, F aliases, app fullscreen buttons or F11 interception. Ordinary resizing must continue to work without fullscreen simulation.

## Library: Real Games, Clear Choices

The library opens from the brand, the menu's first **Choose a game** entry/current-game trigger or Command/Ctrl+K. Selection comes from permanent API-1 `/games/index.json`, not a shell-owned game registry. Metadata, icon and cover belong to each `games/<id>` package/release. Unknown groups fall back to Other without a shell change.

### Layout and Cards

- Desktop: centered dialog **max-width 1120px**, with **32px outer margins** at ordinary sizes. Reflow the grid through **4 / 3 / 2 columns** as available width decreases; never squeeze names or targets to hold four columns.
- Mobile: near-full-height bottom sheet bounded by the visible viewport and safe area, **two columns with 12px gaps**. At accessibility zoom/large text, use one column instead of clipping or horizontal scrolling.
- There is **one internal scroll container for library content**, not a scrolling page plus list, cards with their own scrolling, or nested search/category/result scrollers. Header/search/filter/count chrome must not create competing scroll areas. Scrolling through 28 games is intentional; remove the old “all games fit on one screen” constraint.
- Cards use real **16:10, 640×400 `cover.webp`** game frames, a **16px fully wrapping title** and readable **14–15px body**. No ellipsis, line-clamped game names, tiny text-first icon rows or fake illustrated previews. Localized descriptions remain useful to search and assistive technology.
- One clear native **Play / Continue** target per card; the cover/title/action treatment is one activation surface, not nested buttons or competing click zones. Focus alone never switches a game. Mark the current game with text/icon or a border plus text, not color alone.
- Cards use 14px radii; meaningful focus outlines remain visible. A failed cover must not erase the game's name or action. Do not eagerly import all game modules just to draw cards; bounded pointer/focus-intent preloading is allowed.
- No favorites, recommendations, popularity/sort controls, ratings, live previews or extra dashboard sections.

### Search, Categories and Focus

- Match English and Chinese names/descriptions. Show **All + Casual / Action / Puzzle / Board & Card**; show **Other only when needed**. Keep category choices available without a permanent sidebar.
- Preserve query, active category, scroll and logical focus across catalog refresh, language/theme changes and card rerenders. A refresh must not jump to the top or unexpectedly focus search.
- Desktop can autofocus search; coarse-pointer opening focuses the dialog so the software keyboard does not immediately hide games. Keep full names and usable search when the keyboard is intentionally open.
- Keep keyboard result navigation, Enter activation, visible focus, Escape/backdrop/close dismissal and a focus trap. A polite live result count and a useful empty-result heading/help line are sufficient; avoid extra call-to-action buttons.
- Opening another shell overlay switches ownership instead of stacking dialogs. Dismiss back to the live canvas when one exists; preserve meaningful focus in loading/error/no-game states.

### Cover Capture and Provenance

Capture actual game frames, not generated illustrations, arbitrary stock screenshots or branded posters. Store the finished asset in `games/<id>/public/cover.webp` and metadata `cover: { src: "cover.webp", width: 640, height: 400 }`. The build publishes the relative reference within that game's immutable release.

Show a recognizable in-game moment, without shell dialogs, capture guidance or unrelated UI. Keep the whole authored board visible for portrait/fixed-board games. Soft **same-frame** side extensions are allowed to fill 16:10 without clipping the board; do not stretch the board, invent a world or crop away gameplay to fill the card. No animated/live preview or decorative text baked over the frame. The parent implementation owns the initial capture/review of all 28 covers; documenting this rule is not evidence that capture is complete.

## Version Awareness and Failure Presentation

Initial routing prefers a direct `#id`, otherwise the last successfully loaded game, otherwise Gacha/first available. Retain existing hash, browser storage and score behavior. Opening the library refreshes discovery; it does not replace a running release.

- The current card says **Continue** and resumes the same live instance even if the refreshed catalog advertises a newer version.
- A separate explicit **Update to … (restart)** action in the game menu communicates that adopting the newer release loses the current session. Do not overload Continue, auto-swap versions, or treat SemVer/schemaVersion as runtime compatibility.
- Preflight candidate JavaScript and CSS with the old instance paused and intact. Only after preflight may the shell tear it down immediately before create/prepare/start.
- Pre-teardown errors may offer **Resume** of that intact instance. Post-teardown errors must offer **Restart**, never imply that destroyed state is recoverable. Keep **Retry**, **resume-or-restart**, **Choose a game** and **Reload** reachable as appropriate.
- Loading and error panels occupy the stage without disabling navigation. Stale discovery/import/dismissal completions must not resurrect an overlay or change a newer game choice. Restart/demo/contextual-action failures also need an honest recoverable state, not a spinner or dead action that pretends the game is running.
- Subtle shell/game version details belong in the menu, not badges on every corner or a persistent version dashboard.

## Game and Settings Menu

- Desktop: **320px wide**, top **64px**, right **12px**, plus safe area. Mobile: bottom sheet with bounded internal overflow, 44px actions and no game resize.
- Information order: **Choose a game first**, then relevant game actions/restart/demo/level controls, language/theme, and subtle versions. Keep the full brand in its header without moving Choose below a decorative block.
- Language and light/dark/system theme selections **keep the menu open** and repaint game/presentation immediately. Contextual action/level selection may close its disclosure after a choice. All real targets, including close and level cells, are at least 44px.
- Use one close affordance in the panel. No redundant Return-to-game, duplicate Controls, start action or browser-fullscreen entry.
- Parking keeps a compact Level disclosure; demo appears only where supported. Genuine gameplay Resume and urgent gameplay feedback stay game-owned rather than being mistaken for shell presentation pause.
- Brand/help/menu can navigate directly between overlays with one owner, retained focus/pause rules and no extra close step.

## Unified Read-Only Help

Every game uses the floating **? / Controls / 操作指南** trigger and shared panel. It starts closed, never affects stage size and may be opened by the common `?` key even during pointer capture. Existing shortcuts can call `GameHost.presentation.openControls()`.

- Desktop: **420px wide**, top **64px**, right **12px**, plus safe area. Mobile: bounded reading panel/sheet no taller than **88% of the visible viewport**; account for safe areas, software keyboard and rotation. Protect reading with a restrained backdrop.
- Show a clear title/current game, **at most three essentials for the current device**, then optional disclosure sections. Metadata comes from `game.json`: keyboard/touch entries, titled sections and localized device-scoped notes. Never leak desktop shortcut notes into a touch-only guide just because they are plain text.
- Use readable 14–15px actions and **28px read-only keycaps**. Keycaps are not interactive buttons or a live keyboard; disclosure summaries, close and other genuine controls have **44px minimum targets**.
- Keep the 44px close action in the fixed header and **only the body scrolling**. No redundant footer/Return button, duplicate full guide inside the game or persistent shortcut wall around the canvas.
- Close with `×`, the same `?` trigger/key, Escape or backdrop. Trap focus through help's actual controls/body and the owned brand/help/menu triggers (`siteBrand` included in `aria-owns`); the game stage is inert while reading. Brand switches to the library and menu to navigation without stacking.
- Opening pauses simulation and SDK-managed timers/delays and releases held keys/fire/touches. Gameplay clocks exclude reading time. Closing removes only presentation-owned pause, preserves a manual gameplay pause and returns focus to play.
- Only a trusted dismissal for the **same still-live game instance** may restore its prior pointer capture. Escape, internal/programmatic close, game switching and stale async callbacks **never** recapture. Rotation/language/theme updates preserve the live game and readable help.

An ammo counter, interaction prompt, map legend, refusal message or contextual restart cue is gameplay feedback, not a second operation guide. Keep useful game feedback while removing persistent command lists.

## Contextual Game Utilities

Do not hide gameplay merely to make screenshots minimal. Distinguish actual input/feedback from optional utility chrome.

- **Gacha:** keep Draw and exactly one **native 104×44px Collection** target. Move statistics and sound settings into the game menu; do not retain duplicate canvas/native Collection actions or overlapping hitboxes. Preserve top progress and counters to the right of the fixed-game brand; below 360px, the game-owned top band can stack to 112px rather than the normal 80px. This is not a new global header or a change to shared 64px clearance.
- **Villa:** utility access in the HUD is **map/location + terminal only**. Time/weather belong in the smart terminal; Home/Immersive are menu actions, while existing keyboard shortcuts remain discoverable in help. Keep genuine movement, Use/Exit, driving, elevator and snooker touch controls. Immersive mode keeps floor/location with a location-tap way back on touch.
- **Parking:** level selection lives in the menu. **Demo** remains contextual for games supporting it. Moment-to-moment scores/timers/ammo stay in the canvas, not permanent external cards.

## Visual Language

One neutral shell style serves English/Chinese and light/dark/system themes. Theme/language live in the menu and immediately repaint static canvases. No shell-wide pixel/modern style switch.

### Color

| Purpose | Light | Dark |
|---|---|---|
| Page/stage (`--page`) | `#F4F6F5` | `#0D1412` |
| Surface/dialog | `#FFFFFF` | `#151F1B` |
| Primary text | `#14231F` | `#EDF5F1` |
| Secondary text | `#5B6E66` | `#A6B9AF` |
| Semantic accent | `#0F766E` | `#5EEAD4` |

Use quiet theme-derived hairlines and restrained accent tints. Keep text solid and contrast readable. Focus/selection/errors need non-color cues. No category color system, page-level radial ambience, decorative gradients, glow borders or heavy blur. The brand is **exactly `#0d9488` across themes**, distinct from the semantic accent.

### Type, Spacing and Shape

- Use the **system UI font stack** for the shell and shared result panel. Keep Chinese and English equivalent in weight; no decorative display font or uppercase eyebrow labels. Existing game-specific art is not globally rewritten.
- Full wrapping game names: **16px**; body/actions: **14–15px**. Do not truncate current-game names or shrink labels to fit a phone. Clear modest dialog headings may be larger; no oversized hero/start titles.
- Spacing scale: **4 / 8 / 12 / 16 / 24 / 32px**.
- Radii: **dialog 20px / card 14px / button and field 10–12px**. Canvas remains unframed with no page-level radius.
- Real interactive targets: **44px minimum**. Read-only help keycaps are 28px; they do not need fake button padding or pressed animations. Menu close and level cells are not legacy 40px exceptions.
- Elevation is reserved for menus/dialogs and kept modest; no floating shadows on every ordinary control. Avoid pill styling without a semantic reason.
- Desktop library gutters are 32px; mobile card gap is 12px. These are overlay layout values, not stage padding or left/right game gutters.

### Motion

- Controls: **120ms** feedback transitions.
- Dialogs: **160–180ms** opacity with at most **4px** travel.
- With `prefers-reduced-motion`, use **no positional movement** and immediate or restrained opacity changes.
- No stagger, live card previews, heavy backdrop blur, animated ambient decoration or entrance animation on every game card. Gameplay input feedback remains immediate.

### Favicon and Installation Identity

- `apps/shell/public/brand/logo.svg` remains the exact original 24×24 gamepad path and `#0d9488` fill. Page logos, external SVG favicon and PNG fallbacks use that geometry, never a redesigned gamepad or mobile monogram.
- Keep genuine **192×192 and 512×512 PNGs** for `purpose: any` plus a distinct opaque **512×512 maskable** PNG. Existing icon art uses `#f6f7f5`, regular mark centered at 88% source scale and maskable at 72%, within the central **40%-radius safe circle**. Do not relabel an unpadded regular image as maskable. Installation art's retained background is separate from the modern shell's page token.
- `apps/shell/public/app.webmanifest` names the app Carrick Games for both names and keeps `/` for `id`, `start_url` and `scope`, standalone display, theme color `#0d9488` and retained background `#f6f7f5`. Sizes, MIME types and purposes must be true.
- Build rewrites icon references to **`/shell/<sha>/brand/...`**. Modern shell code/icons/manifest resources must use retained shell URLs, not the pinned legacy `/brand/` namespace. `/manifest.json` remains deployment metadata, not the Web App Manifest.
- No service worker or offline support is introduced. Existing Edge installs may require icon-cache refresh/reinstallation; **native Windows Edge installation remains untested** until actually exercised.

## Canvas Craft and Preserved Game Audits

Existing expressive game art and mechanics remain game-owned. Use `packages/game-sdk/src/fx.ts` for established effects rather than inventing parallel render helpers:

- `fillBevelTile`, `fillSphere`, `shade` and `withAlpha` preserve the existing top-light model.
- Limit glow to energy, rare rewards, hits and interactive hotspots. Layered scene backgrounds/vignettes belong inside games, not the shell.
- Keep particles, shake, tweens and float text meaningful and bounded. Cache detailed sprites with `makeSprite()`/`drawSprite()`; avoid per-frame `shadowBlur` storms.
- Games use `this.isDarkTheme()` / `this.isZhLang()` and `getRetroPalette()` from `packages/game-sdk/src/render.ts`; shell tokens do not imply a global gameplay palette rewrite.
- Existing `three` use is limited to CS, CS Kimi and Villa, rendered back into the shared 2D canvas contract. Preserve game-owned renderer/resource budgets and private QA fixtures, not shell knowledge of internal scenes.

### Warm Villa 1.1.0 Source and Design

`games/villa/package.json` is Villa's independent version source; `games/villa/src/villaVersion.ts` reads it. The shell has its own version. The following retains the authored Villa design/audit constraints, **not a claim about deployment status**.

- **Presentation and controls:** retain cozy, physically readable materials, automatic start, responsive camera aspect and the shell-owned `?` guide. Fullscreen remains browser-owned F11: no app button, F alias, intercepted F11 or second guide. P opens the contextual smart-home terminal; E follows the visible interaction/leave prompt, and Q handles a camping chair or the relevant door/screen secondary action. Keep M/T/H/I, elevator, rally and snooker controls in the game-owned metadata guide rather than a persistent footer/list. Mouse capture starts on a trusted scene click; Esc releases it. I hides HUD chrome except floor/location, with a location-tap exit on touch. Normal object prompts fade and respect occlusion; room names belong only in maps/location views. Apply the utility placement rules above without removing gameplay actions.
- **Access and safety:** the native mobile Use/Exit hit target exactly covers its canvas circle, fires once, hides with overlays/immersive mode and is removed on cleanup. Rejected actions explain why in up to two readable mobile lines, and a genuine refusal to a player action appears as a short-lived contextual message at the occupied object rather than a permanent footer. Crouching, gravity-driven jumps and head clearance preserve real floor/shaft/pool support. Stair finish and structure never share a plane. The elevator travels continuously through real slab openings with interlocked doors; 1/2/3 selects a floor inside. Occupancy or an obstructed sill prevents closure, while an empty cabin closes after four seconds. The staircase and the lift swapped places (`STAIR_HOLE` west, shaft east at `x=4.55`, doors facing +Z): keep both, keep the switchback stair continuous at 16.7°, and never replace travel with teleportation. Only the driver's door opens on either vehicle (`E` opens, seats and closes on one action); the car panel lists the top floor first and has its own Open/Close buttons.
- **Orientation and estate:** +Z is south/front, +X east; the entrance faces south and the four-bay garage is east. Only the upper two storeys extend to `x=16` (`VILLA_EAST_WALL`) so the stair aisle, lift lobby and east rooms keep real walking clearance; the ground floor stays at `x=12` because the garage occupies that band. The lawn mesh is cut away under the whole building footprint, because a flat lawn sharing a plane with the interior slabs z-fights at thresholds and makes the lift floor look grassy. Preserve the original planted driving loop, house, west pool, garden aisles and roof terrace. Extend rolling terrain, scenic roads, fields and a natural pond southward; ground supports, fences, tyres, field edges and pond exclusion must agree. Fruit/leaf geometry distinguishes ten fruit trees; rooftop blooms and four vegetable beds remain botanical rather than labelled boxes or a crop-management game. The pool's water, basin, ground cutout and supports share POOL bounds, with loungers on its south cedar deck rather than the narrow side path.
- **Tea and aquarium:** align actual BACK edges to the fireplace chimney datum `z=-0.31` (chimney centre `-0.1`, depth `0.42`), not unlike-depth counter centres. Tea bar `x=-7.05`, tank `x=-3.98`; preserve cabinet gaps, the `x=-2` room wall, living-side approaches and live collider bounds, including pulls. The visible tea cup starts empty; E progressively brews for ten seconds, a full/ready cup persists, then E lifts/tilts it, depletes liquid and sets it down empty. Busy presses do not reset brewing/drinking. Keep physical utensils, subtle steam and the independently operable recessed kitchen tap; no score/flood mechanic. The tank has ten slender top-view ornamental medaka with a blue-silver dorsal stripe, upturned mouth and rear-set translucent fins, plus six small segmented dark-brown/olive dwarf shrimp with rostra, antennae, legs, tail fans and grazing motion. No fat goldfish stand-ins; “black-shell” is a trade description, not a universal species claim.
- **Seats, beds and wardrobes:** maintain 22 authored house/roof/pool seating/rest definitions covering sofas, dining and roof chairs, PC/guest chairs, stools, loungers and both beds, plus the outdoor swing and relocatable camping chair. Resolve sofa positions along their actual cushion segments from the pre-seat position; do not force one entry side. Small seats stay on their cushions. Preserve free look, correct floor/yaw, own-seat collider identity and collision-checked entry/exit candidates. Each bed has one centred pillow and a lying pose with the head nearby. The five-bay master wardrobe stays on the solid north partition, clear of glazing and doors; ten separated animated leaves expose nine women's compartments and only the rightmost small men's compartment, with ordinary garments, hats, bags and shoes. Update every moving collider, avoid coplanar panels and do not hide the open contents behind an opaque cabinet box. The vanity retains open knee space, a sittable stool, cosmetics and a polished framed mirror without a reflection render target.
- **Companions:** six independent pets retain the original five IDs and add `rabbit-female`: puppy, cat, two parrots, a male rabbit and a female rabbit, naturally distinguished by coat/ear styling and labels, not sexualized anatomy. Each has separate feet/animation, food, dish, cooldown and driving obstacle identity. Clear-weather dog/cat visits remain. Rain sends all six by swept, collision-checked continuous routes to spaced living-room/garage shelter sites; birds fly over the forecourt, land/fold before the reserved-bay doorway and walk inside. Blocked routes yield/replan without teleporting or tunnelling; clear weather returns them to the lawn. Parrot tails stay attached and toes tuck rearward during flight; rabbits hop naturally. Vehicles stop before pets, but pets do not block walking visitors. Never add combat or injury.
- **Collections and snooker:** nine locally authored, original adult anime figures use varied hairstyles, poses and modest full-coverage outfits; they use adult, non-chibi proportions, not reused licensed skins or downloaded character images. Retain the detailed PC and replica display. Snooker uses walnut-toned connected joinery, grounded feet and real cloth/slate pocket cutouts, with dynamic rolling/potted balls, readable cue/power feedback and switchable aiming guides. Guides must correspond to the physical playing surface, not float outside it. Practice scoring stays local, with no leaderboard or claim of complete tournament rules.
- **Vehicles and rally:** the locally authored Model S-inspired electric fastback has a detailed, hollow interior; the utility pickup has a distinct cabin/open bed. Four garage bays include two spare bays, with a workshop and charging pedestal kept outside through routes. One contextual driver-door action opens, safely boards/exits and closes the door; motion, blocked corridors and lifecycle cancellation remain guarded. Road sedan/pickup/scooter W accelerates, S first brakes then reverses from rest, A/D steers and Space supplies a separate handbrake. The electric step-through retains independent wheels, handlebars, lean, stand and safe stationary dismounting. The forest/gravel rally retains bends, hills, rocks, stage splits and brake-only S. Circular steering wheels spin on fixed tilted shafts; right input is clockwise from the actual seated camera. Vehicles share live obstacles and ignore only their own identities; no driving-school signs, cones or exam objectives.
- **Smart home and atmosphere:** P's terminal provides per-room/all lighting, fireplace/aquarium switches, day/evening/night, clear/rain weather, look sensitivity and snooker guides. Time, weather and light levels ease gradually; night remains readable with the lights off. Room lamps, corridors, roof LEDs and garden fixtures agree with their switches while reusing a six-point-light physical budget. CCTV shows one selected, genuinely rendered local-camera view at a time—not a decorative still or many simultaneous scene passes. Sensitivity applies to mouse/touch look without changing movement speed. This is game functionality, not a replacement shell or persistent dashboard.
- **Resource discipline and references:** all meshes/materials/maps/targets remain scene-owned; static details are batched, aquarium animals are instanced, and pet parts share materials without dynamic shadow casters. Floor contact shadows do not float under elevated drawers/mirrors. No new dependencies or image downloads. Preserve cached software-GL input frames: continuous animation/AI time does not enter cache keys or unconditionally invalidate rendering. Aquatic proportions reference [Miyuki medaka](https://medaka.fr/especes-varietes/medaka-miyuki-longfin-fiche-complete-oryzias-latipes/) and [USGS dwarf-shrimp coloration](https://nas.er.usgs.gov/queries/FactSheet.aspx?SpeciesID=2257).

### Gacha and Shared Weapon Artwork

`packages/weapon-art/src/index.ts` and `silhouettes.ts` are the pure shared artwork source used by Gacha and CS Kimi. Preserve real Counter-Strike silhouettes traced from Valve's official inventory renders, never hand-drawn approximations. Profiles stay orthographic with the principal front view (三视图正视图: muzzle +x, flat profile square to the viewer, no perspective), supersampled for clean small thumbnails; do not add a second perspective asset path.

Size every silhouette surface with `weaponIconFitSize()` and measured `WEAPON_SILHOUETTE_DIMS`, so wide snipers fill their cells and tall knives stay contained. Do not hand-pick fixed icon sizes per new surface. Gacha-owned photos in `games/gacha/public/weapons/` are loaded by `games/gacha/src/gachaWeaponIcons.ts` through that instance's immutable asset resolver and contain-fitted by their measured aspect; keep the shared silhouette fallback. Do not move these resources into the pure library or create game-to-game imports. Reel, result, gallery and history retain consistent artwork. **Drop odds are never displayed anywhere**; rarity color and tier name carry prestige.

## Shared Result Panel and Game HUDs

Terminal win/loss/completion uses `BaseGame.drawResultOverlay()` in `packages/game-sdk/src/game.ts`, modernized to the shell's system typography, calm surfaces and clear hierarchy. Preserve score submission and restart semantics; do not restyle the scene underneath, replace game palettes or invent new results for Gacha/Villa. CS's retained interactive terminal HUD uses `publishResult()` rather than drawing a duplicate panel.

Restart normally uses Space, Enter, click or tap through `BaseGame.isRestartInput()`, except for game-specific continuation semantics. Keep contextual failure/score/record text truthful and readable. A terminal panel is not a new initial start gate.

- Size game text for logical canvas dimensions, not the viewport. Preserve practical minimums of 11px for boards up to 480 logical px and 13px on larger canvases where possible; these game-art minima do not shrink shell body text.
- Keep critical score/timer/hazard/state information readable. Compact game-owned top bars or anchored HUDs are allowed; permanent external record/description dashboards are not.
- Use one contextual in-canvas hint at a time, not a duplicated full operation guide. Native game targets stay aligned with the displayed canvas and are removed on cleanup.

## Responsive and Accessibility Acceptance

- The game remains dominant and edge-to-edge at desktop, phone, short landscape and 320px widths. No horizontal overflow or document-level scroll from shell chrome. Use dynamic/visible viewport bounds and safe-area padding, not fixed desktop-height assumptions.
- Library reflows 4/3/2 desktop columns to two mobile columns, one under accessibility zoom, with full names, 12px mobile gaps and **one** internal scroll area. Do not hide games or shrink text to fit all 28 at once.
- Help is device-scoped and read-only apart from disclosures/navigation. There is no desktop mapping in a permanent right gutter and no keyboard/mouse panel on coarse pointers.
- All real shell/menu/disclosure/level/native utility targets are at least 44px. Verify the actual hitboxes, not just their painted size. Read-only help keycaps are 28px.
- Visible focus, inert stage/modal ownership, focus return, browser gesture restrictions, presentation/manual pause separation and reduced-motion/no-movement behavior survive overlay switching and async failure.
- Test English and Chinese, light/dark/system, keyboard-only and touch, software-keyboard opening, zoom/large text, rotation, height-only/DPR resize and pointer capture. Game names must never be truncated or collide with controls.

## Game Families

The collection contains **28 games** across four library families:

- Casual (9): Gacha, Parking, Warm Villa, Snake, Flappy Bird, Doodle Jump, Breakout, Pong, Stacker.
- Action (7): CS, CS Kimi, I Wanna, Space Shooter, Galaga, Asteroids, Aim Lab.
- Puzzle (7): Bubble Shooter, Tetris, 2048, Simon Says, Minesweeper, Wordle, Sudoku.
- Board & Card (5): Checkers, Chess, Connect Four, Solitaire, Texas Hold'em.

These labels organize the on-demand library only. All + the four categories are available; Other appears only for an unknown group actually present. The source of each game's name/group/description remains its own metadata, not a parallel design registry.

## Completion Checklist

Before this bootstrap's shell/visual work is release-ready:

- All 28 real covers are captured/reviewed; portrait boards are complete and every icon/cover resolves within its own immutable release.
- No old one-screen picker, sidebar, hero/start gate, fullscreen alias, duplicate action or contradictory stage gutter survives.
- Brand/help/menu have the approved actual targets/anchors; menu/help/library have correct widths, mobile bounds, scrolling, full names and focus ownership.
- Current Continue survives catalog refresh; Update explicitly restarts. Test stale discovery/intent races, JS/CSS preflight failure, post-teardown failure and restart/demo/contextual-action recovery without false session-recovery claims.
- Help pauses gameplay clocks and releases held input; manual pause survives. Trusted same-instance dismissal is the only recapture route; Escape/internal close never recaptures.
- Parking level/demo flows, Gacha Draw/Collection/progress and Villa's real gameplay controls remain usable. Result-panel changes have not rewritten game worlds/palettes.
- Branding SVG/PNG/manifest identities are genuine and immutable-addressed. No service worker/offline or untested Windows Edge installation claim is added.
- Game-owned visual/mechanics audits, bilingual/theme/device/resize/HiDPI/accessibility checks and release isolation/fence/old-URL regressions pass.
- For **this bootstrap**, full `npm run typecheck`, `npm run test:unit`, `npm run test:release`, `npm run build` and **all** `npm run test:e2e` pass after final changes and before the application commit. Future releases use scoped orchestrated checks per `AGENTS.md`, not an unconditional all-28 rule.
- Commit/push/monitor exact-SHA `deploy.yml` and public smoke follow `AGENTS.md` under the release owner's authorization. Documentation or a local screenshot alone is not deployment closure; record remaining untested platforms honestly.
