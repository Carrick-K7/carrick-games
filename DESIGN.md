# Carrick Games Design System

This is the repository's design authority. `README.md` is for external readers; `AGENTS.md` is for development workflow and deployment closure.

## Direction

Carrick Games uses a clean HD arcade style: classic game shapes and readable arcade layouts, rendered with modern high-density Canvas 2D.

The target feel is:

- Crisp: HiDPI backing canvases, sharp geometry, stable logical coordinates.
- Playable: controls, scores, hazards, and game state must read instantly.
- Lightweight: Canvas-native drawing, no heavy asset pipeline.
- Bilingual: English and Chinese UI must both fit without overlap.
- Theme-aware: dark, light, and system modes should all look intentional.

Do not use a separate visual-style document. Put durable visual decisions here.

## Style Modes

The shell ships two style modes, orthogonal to the light/dark theme. The active
mode lives on `<html data-style-mode="modern|pixel">` (default `modern`) and is
persisted in `localStorage` under `cg-style-mode`. Both modes share one set of
semantic CSS tokens in `index.html`; a mode only changes token values
(geometry, shadows, display font) plus a short list of component overrides.

### Modern (default)

- Layered dark scene (`--bg-scene` gradient + faint accent ambience), glassy
  translucent sidebar/panels with `backdrop-filter` blur, hairline alpha
  borders, soft elevation shadows.
- The canvas sits on a "stage": hairline bezel, rounded corners, and a
  restrained ambient accent glow (`0 0 80px -22px var(--accent-glow)`).
- Motion is token-driven (`--dur-fast`, `--dur-base`, `--ease-out`): hover
  lifts, pressed states, staggered list entrances, canvas pop-in, overlay
  fade-up. Everything degrades to instant under
  `prefers-reduced-motion: reduce`.

### Pixel

- Geometry tokens flip to the arcade set: `--radius-*` → 2px/4px,
  `--bw` → 2px, blur shadows → hard offset shadows (`0 4px 0 ...`),
  `--glass-blur` → 0.
- Dark pixel is a deep indigo cabinet palette; light pixel is a warm retro
  paper palette.
- Display type uses the bundled `fonts/PressStart2P-Regular.ttf`
  (`@font-face 'Press Start 2P'`, stack falls back to system UI for Chinese
  glyphs). Apply it via `var(--font-display)` to brand, eyebrows, section
  titles, buttons, numeric readouts, and overlay titles — never to dense body
  text or the game list names.
- CJK fallback rule: any pixel-mode selector whose text may be Chinese must
  stay at or above roughly `0.55rem`; keep tiny `0.4–0.5rem` sizes for
  Latin/digit-only micro labels.
- `#gameCanvas` gets `image-rendering: pixelated` and a thicker bezel.
- `drawGameResultOverlay()`/`fillRoundedPanel()` in `src/core/render.ts` read
  `isPixelMode()` and switch to the pixel font stack, small radius, and hard
  shadow so in-canvas terminal panels match the shell.

## Core UI

The shell UI is an application surface, not a marketing landing page.

- Keep the game as the primary first-screen experience.
- Keep navigation dense enough for repeated use.
- Use compact controls and predictable panels.
- Avoid nested cards and decorative page sections.
- Do not let sidebars, keyboard panels, or overlays intercept unrelated clicks.
- Text must fit in buttons, cards, sidebars, and canvas overlays at mobile and desktop sizes.

The game library uses four visible primary category filters plus grouped game
sections. Category filters show counts, the selected category is explicit, and
the current game's family remains visible in the top bar. On mobile, choosing a
game closes the library drawer so the play surface is revealed immediately.
Desktop and mobile sidebar state must remain independent. A collapsed desktop
rail shows icons only and always keeps an obvious expand control visible.

## Palette

Use the app theme tokens for page UI and `getRetroPalette()` from `src/core/render.ts` for canvas scenes.

| Purpose | Dark | Light |
|---------|------|-------|
| App background | `#070b12` | `#eef2f7` |
| Canvas background | `#0b0f19` | `#fafafa` |
| Primary accent | `#39C5BB` | `#0d9488` |
| Text | `#f1f5f9` | `#0f172a` |
| Muted text | `#94a3b8` | `#5b6b80` |
| Danger | `#fb7185` | `#dc2626` |
| Warning | `#facc15` | `#ca8a04` |
| Success | `#4ade80` | `#16a34a` |

Pixel mode shifts the shell palette (indigo cabinet / retro paper) and
brightens the accent; canvas scenes keep the shared `getRetroPalette()` values.

Rules:

- Branch game colors with `this.isDarkTheme()`.
- Prefer shared palette helpers over one-off colors.
- Do not rely on color alone for critical state; pair color with shape, position, text, or motion.

## Typography

Canvas text should use the system UI stack unless a specific symbol font is needed:

```typescript
ctx.font = '14px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
```

Rules:

- Use system fonts for HUDs, labels, instructions, and overlays.
- Use `ui-monospace, SFMono-Regular, monospace` only for aligned numeric readouts.
- Use symbol fonts only for board-game pieces or card suits where needed.
- The pixel display font (`'Press Start 2P'`) is reserved for result-overlay
  titles/details in pixel mode and for shell display elements; never use it
  for in-gameplay HUD text that must read at a glance.
- Minimum readable canvas text size is `10px`.
- Typical HUD text is `12px-14px`.
- Game-over and title text is usually `18px-28px`.
- Set `ctx.textBaseline = 'middle'` for vertically centered single-line text.

## Canvas Rendering

`BaseGame` configures the HiDPI backing canvas through `configureHiDpiCanvas()`. Games draw in logical coordinates with `this.width` and `this.height`.

Use:

- `drawRetroBackground()` for subtle arcade grids or background texture.
- `fillRoundedPanel()` for HUD panels, menus, and overlays.
- `getCanvasPoint()` or `this.canvasPoint()` for input mapping.

Avoid:

- Manually scaling pointer coordinates from `canvas.width / rect.width`.
- Decorative overlays that reduce readability.
- Full-screen scanline/vignette effects by default.
- Canvas text or controls that depend on browser viewport-scaled font sizes.

Game-specific glow, particles, gradients, and texture are acceptable when they improve readability or game feel. Keep them restrained.

## Layout

Common canvas sizes:

- Square arcade: `400x400`, `480x480`, `600x600`.
- Wide arcade: `480x360`, `600x400`.
- Tall arcade: `400x560`, `480x640`.
- Puzzle/tabletop: whatever preserves a readable board and touch targets.

Rules:

- Use stable dimensions for boards, tiles, buttons, HUD rows, and side panels.
- Avoid layout shifts caused by hover states, dynamic labels, loading states, or translated text.
- Mobile sidebars must not overlap game-list items in a way that changes click targets.
- Touch targets should be at least `40px` where the game allows it.
- On common desktop widths, keep the game and its status panel in the first
  layout row; place the keyboard/control panel below when three columns do not
  fit.

## In-Game HUD

HUDs should be compact and close to the action:

- Prefer a top bar, side strip, or small anchored panel.
- Keep score, timer, level, and state readable at a glance.
- Keep HUD outside the playfield when it would obscure gameplay.
- Use translucent panels only when the content behind them does not matter.

## Overlays

Game-over, pause, win, and start overlays should use:

- a semi-transparent dim layer,
- centered text or a compact panel,
- clear score/result state,
- concise restart/start instruction.

All terminal win, loss, completion, and game-over states use
`BaseGame.drawResultOverlay()`. This keeps result hierarchy, tone, spacing,
theme behavior, style-mode behavior, and the testable canvas result state
consistent. The only published exception is Lucky Case, which has no terminal
state.

The standard terminal primary action is Space, Enter, click, or tap, detected
through `BaseGame.isRestartInput()`. A game may map that action to the next
level or continue state when restarting would be incorrect, but its result
panel must describe that behavior. Secondary shortcuts such as replay or menu
may remain game-specific.

Do not create large explanatory screens inside games. The app already renders controls outside the canvas.

## Game Families

The 0.1.x release line includes 25 published games. The four primary families are intentionally broad and follow familiar App Store game-category language. Keep this list aligned with `src/games/catalog.ts` and `README.md`.

- Casual: Parking, Lucky Case, Snake, Flappy Bird, Doodle Jump, Breakout, Pong, Stacker.
- Action: I Wanna, Space Shooter, Galaga, Asteroids, Aim Lab.
- Puzzle: Bubble Shooter, Tetris, 2048, Simon Says, Minesweeper, Wordle, Sudoku.
- Board & Card: Checkers, Chess, Connect Four, Solitaire, Texas Hold'em.

Each family can vary in mood, but all games should share the same clarity, theming, and HiDPI expectations.

## Acceptance Checklist

Before a design or UI change is done:

- `npm run build` passes.
- Relevant Playwright tests pass; full `npm run test:e2e` is required before Agent closure.
- Canvas is nonblank in dark and light themes.
- Shell looks intentional in both style modes (modern and pixel), in dark and light.
- Text fits in English and Chinese, including pixel-mode CJK fallback sizes.
- Keyboard, mouse, and touch input remain correctly mapped after canvas scaling.
- The UI has no incoherent overlaps at mobile and desktop widths.
