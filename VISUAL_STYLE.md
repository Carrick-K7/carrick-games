# Carrick Games Visual Style

## Direction

Use **HD Retro Arcade** as the default style: retro game language, high-resolution rendering, and restrained modern polish.

This means:
- Keep arcade-era silhouettes, grids, chunky shapes, readable HUDs, and the `"Press Start 2P"` canvas font.
- Render on a high-density backing canvas through `BaseGame` so modern displays look crisp.
- Use glow, gradients, small particles, scanlines, and subtle texture to lift the image quality.
- Avoid pure 8-bit minimalism as the default. It can be used for specific games, but should still render crisply.
- Avoid realism or heavy asset pipelines. The collection should stay lightweight and Canvas-native.

## Shared Foundation

`src/core/render.ts` owns reusable rendering utilities:
- `configureHiDpiCanvas` keeps logical game coordinates stable while scaling the backing canvas.
- `getRetroPalette` provides theme-aware color families for dark and light modes.
- `drawRetroBackground`, `drawPixelFrame`, `drawScanlines`, `drawNeonRect`, `drawGlowText`, and `fillRoundedPanel` provide reusable visual building blocks.

`BaseGame` applies the high-DPI canvas setup for every game. Games should continue to draw using `this.width` and `this.height` as logical units.

## Game Families

- Pixel arcade: Snake, Tetris, Pac-Man, Invaders, Galaga, Frogger, Berzerk, Asteroids.
- Neon arcade: Breakout, Bubble Shooter, Space Shooter, Missile Command, Beach Head, Parking.
- Refined tabletop and puzzle: Solitaire, Chess, Checkers, Connect Four, Mahjong, Sudoku, Wordle, 2048, Texas Hold'em.

## Acceptance Bar

Before a visual upgrade is done:
- `npm run build` passes.
- Playwright smoke tests pass for the touched games.
- The canvas is nonblank in dark and light themes.
- High-density displays preserve logical canvas size and pointer input behavior.
- The game remains readable without relying only on color.
