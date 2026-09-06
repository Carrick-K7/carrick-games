import { describe, it, expect } from 'vitest';
import { villaUseCircle } from '../../src/games/villaTouchUi.js';
import { villaRendererSize } from '../../src/games/villaScene.js';

// Edge-to-edge viewport geometry: HUD touch targets must stay ≥44px and inside
// the display safe area at every supported viewport class.
const VIEWPORTS = [
  { width: 320, height: 568, safe: { top: 0, right: 0, bottom: 0, left: 0 } },
  { width: 390, height: 844, safe: { top: 47, right: 0, bottom: 34, left: 0 } },
  { width: 844, height: 390, safe: { top: 0, right: 47, bottom: 21, left: 47 } },
  { width: 1280, height: 720, safe: { top: 0, right: 0, bottom: 0, left: 0 } },
  { width: 2560, height: 1080, safe: { top: 0, right: 0, bottom: 0, left: 0 } },
];

describe('villaUseCircle safe-area placement', () => {
  for (const { width, height, safe } of VIEWPORTS) {
    for (const snooker of [false, true]) {
      it(`stays a ≥44px target inside ${width}x${height} safe area (snooker=${snooker})`, () => {
        const c = villaUseCircle(width, height, 1, snooker, safe);
        expect(c.radius * 2).toBeGreaterThanOrEqual(44);
        expect(c.x + c.radius).toBeLessThanOrEqual(width - safe.right);
        expect(c.y + c.radius).toBeLessThanOrEqual(height - safe.bottom);
        expect(c.x - c.radius).toBeGreaterThanOrEqual(0);
        expect(c.y - c.radius).toBeGreaterThanOrEqual(0);
      });
    }
  }

  it('defaults to zero insets when no safe area is given', () => {
    expect(villaUseCircle(1120, 700, 3, false)).toEqual({ x: 1006, y: 475, radius: 87 });
  });
});

describe('villaRendererSize', () => {
  it('keeps the actual viewport aspect at dpr 1', () => {
    expect(villaRendererSize(1280, 720, 1, false)).toEqual({ w: 1280, h: 720 });
    expect(villaRendererSize(844, 390, 1, false)).toEqual({ w: 844, h: 390 });
  });

  it('caps the upscale at 1.5x on high-dpr displays', () => {
    expect(villaRendererSize(390, 844, 3, false)).toEqual({ w: 585, h: 1266 });
  });

  it('bounds total render pixels on very wide fullscreen viewports', () => {
    const { w, h } = villaRendererSize(2560, 1080, 2, false);
    expect(w * h).toBeLessThanOrEqual(4_200_000);
    expect(w / h).toBeCloseTo(2560 / 1080, 1);
  });

  it('software GL stays cheap at any viewport', () => {
    const { w, h } = villaRendererSize(2560, 1080, 2, true);
    expect(w).toBe(Math.round(2560 * 0.55));
    expect(h).toBe(Math.round(1080 * 0.55));
  });
});
