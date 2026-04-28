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

## Core UI

The shell UI is an application surface, not a marketing landing page.

- Keep the game as the primary first-screen experience.
- Keep navigation dense enough for repeated use.
- Use compact controls and predictable panels.
- Avoid nested cards and decorative page sections.
- Do not let sidebars, keyboard panels, or overlays intercept unrelated clicks.
- Text must fit in buttons, cards, sidebars, and canvas overlays at mobile and desktop sizes.

## Palette

Use the app theme tokens for page UI and `getRetroPalette()` from `src/core/render.ts` for canvas scenes.

| Purpose | Dark | Light |
|---------|------|-------|
| App background | `#0b0f14` | `#f8fafc` |
| Canvas background | `#0b0f19` | `#fafafa` |
| Primary accent | `#39C5BB` | `#0d9488` |
| Text | `#f8fafc` | `#0f172a` |
| Muted text | `#94a3af` | `#64748b` |
| Danger | `#fb7185` | `#dc2626` |
| Warning | `#facc15` | `#ca8a04` |
| Success | `#4ade80` | `#16a34a` |

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

Do not create large explanatory screens inside games. The app already renders controls outside the canvas.

## Game Families

The 0.1.x release line includes 27 published games. Keep this list aligned with `src/games/catalog.ts` and `README.md`.

- Arcade movement: Snake, Pac-Man, Frogger, Flappy Bird, Doodle Jump, I Wanna, Parking, Breakout, Pong, Stacker.
- Combat and shooters: Space Shooter, Galaga, Asteroids, Beach Head.
- Puzzles and word games: Bubble Shooter, Tetris, 2048, Simon Says, Minesweeper, Wordle, Sudoku, Aim Lab.
- Tabletop and cards: Checkers, Chess, Connect Four, Solitaire, Texas Hold'em.

Each family can vary in mood, but all games should share the same clarity, theming, and HiDPI expectations.

## Acceptance Checklist

Before a design or UI change is done:

- `npm run build` passes.
- Relevant Playwright tests pass; full `npm run test:e2e` is required before Agent closure.
- Canvas is nonblank in dark and light themes.
- Text fits in English and Chinese.
- Keyboard, mouse, and touch input remain correctly mapped after canvas scaling.
- The UI has no incoherent overlaps at mobile and desktop widths.
