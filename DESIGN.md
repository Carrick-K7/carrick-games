# Carrick Games — Design System

> Minimal, crisp, and smooth. No retro pixels. No scanlines. No glow.

## Philosophy

Every game renders as a **clean, high-resolution Canvas 2D surface** with **system typography** and **flat, intentional color**. The visual language is:

- **Minimal** — only what's necessary to play and understand.
- **Crisp** — HiDPI canvas with `imageSmoothingEnabled = true`, sharp vectors, no pixelation.
- **Smooth** — subtle easing, rounded geometry, consistent spacing, no jagged edges.
- **Flat** — no skeuomorphism, no 3D chrome, no decorative chrome beyond thin borders.

## Color

Two theme palettes derived from a single primary hue. Games must use these tokens; never hard-code one-off colors.

| Token | Dark | Light | Usage |
|-------|------|-------|-------|
| `bg` | `#0b0f19` | `#fafafa` | Canvas background |
| `surface` | `#111827` | `#ffffff` | HUD panels, overlays |
| `surface-elevated` | `#1f2937` | `#f1f5f9` | Buttons, cards |
| `border` | `rgba(57,197,187,0.25)` | `rgba(13,148,136,0.22)` | Dividers, outlines |
| `text` | `#f8fafc` | `#0f172a` | Primary text |
| `text-secondary` | `#94a3b8` | `#64748b` | Labels, hints |
| `primary` | `#39C5BB` | `#0d9488` | Accent, active states |
| `success` | `#4ade80` | `#16a34a` | Win, correct |
| `danger` | `#fb7185` | `#dc2626` | Lose, crash, error |
| `warning` | `#facc15` | `#ca8a04` | Caution, timer low |

Prefer `this.isDarkTheme()` at the top of `draw()` to branch colors.

## Typography

All canvas text uses **system-ui stack**:

```typescript
ctx.font = '14px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
```

Rules:
- **Never** use `"Press Start 2P"`, pixel fonts, or monospace for UI text.
- Use `ui-monospace, SFMono-Regular, monospace` **only** for numeric readouts (scores, timers) when a fixed-width column is required.
- Minimum readable size: `10px` on canvas.
- Labels and scores: `12px–14px`.
- Titles and game-over text: `18px–24px`, **bold** if needed.
- Always set `ctx.textBaseline = 'middle'` for vertically-centered single-line text.

## Canvas Rendering

### HiDPI Setup

`BaseGame` configures the backing store automatically. Games draw in logical coordinates (`this.width`, `this.height`).

```typescript
// In BaseGame — already handled
ctx.imageSmoothingEnabled = true;
```

### No Post-Process Layer

`BaseGame.renderFrame()` **does not** apply scanlines, vignette, glow, or decorative corner brackets. Games draw their own clean overlays when needed.

### Background Pattern (Optional)

If a game needs a grid, use a **subtle dot grid** or **faint line grid** at 10–15% opacity. No scanlines. No radial vignette.

```typescript
ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
ctx.lineWidth = 1;
// draw grid lines...
```

## Spacing & Shape

- **Border radius**: `6px` for UI panels, `999px` for pills, `4px` for small tags.
- **Padding**: `8px` minimum inside panels; `12px` for larger cards.
- **Shadow**: single soft shadow only for floating panels:
  ```typescript
  ctx.shadowColor = isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.08)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 4;
  ```
- **Borders**: `1px` solid at `border` token opacity. No double borders, no glow strokes.

## In-Game UI (HUD)

Keep HUD **outside the playfield** when possible, or in a compact top bar.

```typescript
// Top bar example
ctx.fillStyle = isDark ? 'rgba(17,24,39,0.8)' : 'rgba(255,255,255,0.85)';
ctx.fillRect(0, 0, this.width, 36);
ctx.fillStyle = text;
ctx.font = '12px system-ui, sans-serif';
ctx.textAlign = 'left';
ctx.textBaseline = 'middle';
ctx.fillText(`Score: ${this.score}`, 12, 18);
```

Avoid:
- Corner bracket decorations.
- Neon glow on text.
- Scanline overlays.
- Heavy drop shadows on every element.

## Game Over / Pause Overlays

Use a **semi-transparent dim** + **centered card**:

```typescript
// Dim
ctx.fillStyle = isDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.7)';
ctx.fillRect(0, 0, this.width, this.height);

// Card
const cw = 280, ch = 160, cx = (this.width - cw) / 2, cy = (this.height - ch) / 2;
ctx.fillStyle = isDark ? '#111827' : '#ffffff';
ctx.beginPath();
ctx.roundRect(cx, cy, cw, ch, 12);
ctx.fill();

// Border
ctx.strokeStyle = isDark ? 'rgba(57,197,187,0.3)' : 'rgba(13,148,136,0.3)';
ctx.lineWidth = 1;
ctx.stroke();
```

## Motion & Animation

- Use `requestAnimationFrame` delta time (`dt`) for all motion.
- Easing: `ease-out` for UI transitions, linear for gameplay physics.
- Particle effects: small circles or rounded rects, `2–6px`, fading opacity. No pixel blocks.

## Acceptance Checklist

Before any visual change is merged:
- [ ] `npm run build` passes with zero TypeScript errors.
- [ ] Playwright smoke tests pass for every touched game.
- [ ] Canvas renders crisply at 2× DPR (no pixelation on Retina).
- [ ] Dark and light themes both look intentional (no accidental hard-coded colors).
- [ ] No `"Press Start 2P"` references remain in new or changed code.
