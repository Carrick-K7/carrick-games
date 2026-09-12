import { describe, it, expect } from 'vitest';
import { villaUseCircle } from '../../src/games/villaTouchUi.js';
import { villaRendererSize } from '../../src/games/villaScene.js';
import { VillaGame } from '../../src/games/villa.js';
import { computeHudLayout, rectsOverlap, type HudRect } from '../../src/games/csHudLayout.js';

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

describe('Villa HUD clears the brand/help/menu cluster', () => {
  // Exercise the actual HUD-only methods without creating a canvas, renderer or game loop.
  function hud(width: number, height: number, safe: typeof VIEWPORTS[number]['safe'], touchMode: boolean, immersive: boolean, snookerActive = false) {
    return Object.assign(Object.create(VillaGame.prototype), {
      width, height, viewport: { width, height, dpr: 1, safeArea: safe }, touchMode, immersive,
      state: { home: { timeOfDay: 'day' }, snookerActive, seated: null },
      isZhLang: () => false, hotspot: () => null, inElevator: () => false, drivingSeat: () => false,
    }) as { buttons(): (HudRect & { id: string })[]; compactHud(): boolean };
  }

  for (const { width, height, safe } of [...VIEWPORTS, { width: 1024, height: 768, safe: VIEWPORTS[0].safe }, { width: 1120, height: 700, safe: VIEWPORTS[0].safe }]) {
    for (const touch of [false, true]) {
      for (const immersive of [false, true]) {
        it(`${width}x${height} touch=${touch} immersive=${immersive}: controls stay clear and ≥44px`, () => {
          const shell = computeHudLayout(width, height, safe).shellReserve;
          for (const snooker of [false, true]) {
            const game = hud(width, height, safe, touch, immersive, snooker);
            const buttons = game.buttons();
            for (const button of buttons) {
              expect(rectsOverlap(button, shell), button.id).toBe(false);
              expect(button.w, button.id).toBeGreaterThanOrEqual(44);
              expect(button.h, button.id).toBeGreaterThanOrEqual(44);
              expect(button.x, button.id).toBeGreaterThanOrEqual(safe.left);
              expect(button.x + button.w, button.id).toBeLessThanOrEqual(width - safe.right);
            }
            if (!immersive) {
              const compact = game.compactHud();
              const location = { x: (compact ? 12 : 24) + safe.left, y: (compact ? 12 : 22) + safe.top, w: compact ? 56 : 294, h: compact ? 42 : 68 };
              expect(rectsOverlap(location, shell)).toBe(false);
              for (const button of buttons) expect(rectsOverlap(location, button), button.id).toBe(false);
            }
          }
        });
      }
    }
  }

  it('keeps the original activity-row heights and 8px immersive gap', () => {
    const safe = VIEWPORTS[0].safe;
    expect(hud(320, 568, safe, true, false).buttons().find(b => b.id === 'map')?.y).toBe(68);
    expect(hud(844, 390, safe, true, false).buttons().find(b => b.id === 'map')).toMatchObject({ x: 426, y: 12 });
    expect(hud(1280, 720, safe, false, false).buttons().find(b => b.id === 'map')).toMatchObject({ x: 557, y: 22 });
    expect(hud(320, 568, safe, true, true).buttons()[0]).toMatchObject({ x: 16, y: 12, w: 84, h: 44 });
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

