import { describe, expect, it } from 'vitest';
import {
  CS_BASE_ASPECT,
  CS_HALF_FOV_TAN,
  MIN_TOUCH_TARGET,
  SCENE_MAX_BACKING_PIXELS,
  SHELL_MENU_RESERVE,
  buyFooterButtons,
  buyMenuLayout,
  centeredPanelLayout,
  halfFovTanForAspect,
  hudScale,
  maxBuyScroll,
  roundHeaderY,
  raycastBufferSize,
  sanitizeInsets,
  sceneBackingRatio,
  touchControlsLayout,
} from '../../src/games/counterstrikeViewport';

// The viewport matrix from the responsive-fullscreen spec, plus a notched
// phone landscape variant exercising safe-area insets.
const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1280, height: 720 },
  { width: 2560, height: 1080 },
];
const NOTCHED = { width: 844, height: 390, insets: { top: 0, right: 44, bottom: 21, left: 44 } };

describe('counterstrike viewport helpers', () => {
  describe('halfFovTanForAspect', () => {
    it('keeps the 16:9 baseline horizontal FOV', () => {
      expect(halfFovTanForAspect(CS_BASE_ASPECT)).toBe(CS_HALF_FOV_TAN);
      expect(halfFovTanForAspect(1280 / 720)).toBe(CS_HALF_FOV_TAN);
    });

    it('pins the vertical FOV and widens/narrows horizontally with aspect', () => {
      // tan(halfH) / aspect must be a constant (the vertical half-FOV tangent).
      const vertical = (aspect: number) => halfFovTanForAspect(aspect) / aspect;
      for (const { width, height } of VIEWPORTS) {
        expect(vertical(width / height)).toBeCloseTo(vertical(CS_BASE_ASPECT), 12);
      }
      expect(halfFovTanForAspect(390 / 844)).toBeLessThan(CS_HALF_FOV_TAN);
      expect(halfFovTanForAspect(2560 / 1080)).toBeGreaterThan(CS_HALF_FOV_TAN);
    });

    it('falls back to the baseline for invalid aspects', () => {
      expect(halfFovTanForAspect(0)).toBe(CS_HALF_FOV_TAN);
      expect(halfFovTanForAspect(-2)).toBe(CS_HALF_FOV_TAN);
      expect(halfFovTanForAspect(Number.NaN)).toBe(CS_HALF_FOV_TAN);
    });
  });

  describe('raycastBufferSize', () => {
    it('matches the original 640x360 / 320x180 baselines at 1280x720', () => {
      expect(raycastBufferSize(1280, 720, false)).toEqual({ rw: 640, rh: 360 });
      expect(raycastBufferSize(1280, 720, true)).toEqual({ rw: 320, rh: 180 });
    });

    it('preserves the actual viewport aspect on every spec viewport', () => {
      for (const { width, height } of VIEWPORTS) {
        for (const pixel of [false, true]) {
          const { rw, rh } = raycastBufferSize(width, height, pixel);
          // Rounding slack only — the blit never stretches the world.
          expect(Math.abs(rw / rh - width / height)).toBeLessThan(0.02);
        }
      }
    });

    it('keeps the per-frame column cost bounded on ultrawide screens', () => {
      const { rw, rh } = raycastBufferSize(2560, 1080, false);
      expect(rh).toBe(360);
      expect(rw).toBeLessThanOrEqual(1152);
      expect(rw * rh).toBeLessThanOrEqual(1152 * 360);
    });

    it('never stretches even when clamped at extreme aspects', () => {
      const wide = raycastBufferSize(4000, 200, false);
      expect(wide.rw).toBe(1152);
      expect(Math.abs(wide.rw / wide.rh - 20)).toBeLessThan(0.6);
      const tall = raycastBufferSize(100, 2000, false);
      expect(tall.rw).toBe(96);
      expect(Math.abs(tall.rw / tall.rh - 0.05)).toBeLessThan(0.01);
    });

    it('falls back to the baseline for degenerate sizes', () => {
      expect(raycastBufferSize(0, 0, false)).toEqual({ rw: 640, rh: 360 });
      expect(raycastBufferSize(Number.NaN, -10, true)).toEqual({ rw: 320, rh: 180 });
    });
  });

  describe('sceneBackingRatio', () => {
    it('keeps full dpr within budget at the baseline', () => {
      expect(sceneBackingRatio(1280, 720, 2)).toBe(2);
      expect(1280 * 720 * 4).toBeLessThanOrEqual(SCENE_MAX_BACKING_PIXELS);
    });

    it('caps the backing store at 4.5M pixels on large fullscreen windows', () => {
      const ratio = sceneBackingRatio(2560, 1080, 2);
      expect(ratio).toBeLessThan(2);
      expect(2560 * 1080 * ratio * ratio).toBeLessThanOrEqual(SCENE_MAX_BACKING_PIXELS);
      const retina = sceneBackingRatio(2560, 1440, 2);
      expect(2560 * 1440 * retina * retina).toBeLessThanOrEqual(SCENE_MAX_BACKING_PIXELS);
    });

    it('sanitizes invalid inputs', () => {
      expect(sceneBackingRatio(0, 0, Number.NaN)).toBe(1);
      expect(sceneBackingRatio(1280, 720, 0)).toBe(1);
      expect(sceneBackingRatio(100, 100, 8)).toBe(2);
    });
  });

  describe('hudScale', () => {
    it('is 1 at the baseline and bounded at the extremes', () => {
      expect(hudScale(1280, 720)).toBe(1);
      expect(hudScale(320, 568)).toBe(0.55);
      expect(hudScale(2560, 1080)).toBe(1.3);
      expect(hudScale(0, 0)).toBe(1);
    });
  });

  describe('buyMenuLayout', () => {
    it('matches the original 480px mouse menu at the baseline', () => {
      const layout = buyMenuLayout(1280, 720, null, false);
      expect(layout.touch).toBe(false);
      expect(layout.w).toBe(480);
      expect(layout.rowH).toBe(25);
      expect(layout.x).toBeCloseTo((1280 - 480) / 2, 6);
      expect(layout.bodyY).toBe(layout.y + layout.headerH);
    });

    it('stays inside the safe area on every spec viewport', () => {
      for (const { width, height } of VIEWPORTS) {
        for (const touch of [false, true]) {
          const layout = buyMenuLayout(width, height, null, touch);
          expect(layout.w).toBeGreaterThan(120);
          expect(layout.x).toBeGreaterThanOrEqual(7.9);
          expect(layout.y).toBeGreaterThanOrEqual(7.9);
          expect(layout.x + layout.w).toBeLessThanOrEqual(width - 7.9);
          expect(layout.y + layout.h).toBeLessThanOrEqual(height - 7.9);
          expect(layout.bodyY).toBeCloseTo(layout.y + layout.headerH, 6);
          expect(layout.bodyY + layout.bodyH + layout.footerH).toBeLessThanOrEqual(layout.y + layout.h + 0.01);
          if (!touch) {
            // Desktop: all 8 category rows fit between header and footer.
            expect(layout.headerH + 8 * layout.rowH + layout.footerH).toBeLessThanOrEqual(layout.h + 0.01);
          }
        }
      }
    });

    it('touch: every interactive row is a ≥44px target on every spec viewport', () => {
      for (const { width, height } of VIEWPORTS) {
        const layout = buyMenuLayout(width, height, null, true);
        expect(layout.touch).toBe(true);
        // Category grid: 2 columns × 4 rows, each cell ≥44px tall.
        expect(layout.catCols).toBe(2);
        expect(layout.catRows).toBe(4);
        expect(layout.cellH).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
        expect(layout.cellW * layout.catCols).toBeCloseTo(layout.w, 6);
        // Item list rows are always 44px; overflow is handled by scroll.
        expect(layout.itemRowH).toBe(MIN_TOUCH_TARGET);
        expect(layout.rowH).toBe(MIN_TOUCH_TARGET);
        // Persistent footer buttons are ≥44px and inside the panel.
        const { back, close } = buyFooterButtons(layout);
        for (const btn of [back, close]) {
          expect(btn.h).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
          expect(btn.w).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
          expect(btn.y + btn.h).toBeLessThanOrEqual(layout.y + layout.h + 0.01);
          expect(btn.x).toBeGreaterThanOrEqual(layout.x - 0.01);
          expect(btn.x + btn.w).toBeLessThanOrEqual(layout.x + layout.w + 0.01);
        }
        expect(close.x).toBeGreaterThanOrEqual(back.x + back.w);
        // The 8 grid cells and every visible item row sit inside the body.
        expect(4 * layout.cellH).toBeLessThanOrEqual(layout.bodyH + 0.01);
        expect(layout.visibleItemRows * layout.itemRowH).toBeLessThanOrEqual(layout.bodyH + 0.01);
      }
    });

    it('touch: short landscape scrolls long lists instead of shrinking rows', () => {
      // 844x390: body fits 5 rows; the 7-row CT equipment list scrolls.
      const layout = buyMenuLayout(844, 390, null, true);
      expect(layout.itemRowH).toBe(MIN_TOUCH_TARGET);
      expect(layout.visibleItemRows).toBe(Math.floor(layout.bodyH / MIN_TOUCH_TARGET));
      expect(layout.visibleItemRows).toBeLessThan(7);
      expect(maxBuyScroll(7, layout)).toBeCloseTo(7 * 44 - layout.visibleItemRows * 44, 6);
      expect(maxBuyScroll(7, layout)).toBeGreaterThan(0);
      // A list that fits does not scroll.
      expect(maxBuyScroll(layout.visibleItemRows, layout)).toBe(0);
      expect(maxBuyScroll(0, layout)).toBe(0);
    });

    it('touch: portrait viewports fit the longest list without scrolling', () => {
      for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
        const layout = buyMenuLayout(size.width, size.height, null, true);
        expect(layout.visibleItemRows).toBeGreaterThanOrEqual(7);
        expect(maxBuyScroll(7, layout)).toBe(0);
      }
    });

    it('respects notched safe areas', () => {
      const layout = buyMenuLayout(NOTCHED.width, NOTCHED.height, NOTCHED.insets, true);
      expect(layout.x).toBeGreaterThanOrEqual(NOTCHED.insets.left + 7.9);
      expect(layout.x + layout.w).toBeLessThanOrEqual(NOTCHED.width - NOTCHED.insets.right - 7.9);
      expect(layout.y + layout.h).toBeLessThanOrEqual(NOTCHED.height - NOTCHED.insets.bottom - 7.9);
      expect(layout.cellH).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
      const { back } = buyFooterButtons(layout);
      expect(back.y + back.h).toBeLessThanOrEqual(NOTCHED.height - NOTCHED.insets.bottom - 7.9);
      expect(back.x).toBeGreaterThanOrEqual(NOTCHED.insets.left + 7.9);
    });
  });

  describe('centeredPanelLayout (scoreboard)', () => {
    it('keeps the 440x320 base size at the baseline', () => {
      const panel = centeredPanelLayout(1280, 720, null, 440, 320);
      expect(panel.scale).toBe(1);
      expect(panel.x).toBeCloseTo((1280 - 440) / 2, 6);
    });

    it('fits every spec viewport', () => {
      for (const { width, height } of VIEWPORTS) {
        const panel = centeredPanelLayout(width, height, null, 440, 320);
        expect(panel.x).toBeGreaterThanOrEqual(7.9);
        expect(panel.y).toBeGreaterThanOrEqual(7.9);
        expect(panel.x + panel.w).toBeLessThanOrEqual(width - 7.9);
        expect(panel.y + panel.h).toBeLessThanOrEqual(height - 7.9);
        expect(panel.w).toBeCloseTo(440 * panel.scale, 6);
        expect(panel.h).toBeCloseTo(320 * panel.scale, 6);
      }
    });
  });

  describe('touchControlsLayout', () => {
    it('reproduces the original 1280x720 control positions', () => {
      const layout = touchControlsLayout(1280, 720, null);
      expect(layout.fire).toEqual({ x: 1280 - 104, y: 720 - 100, r: 52, hitR: 58 });
      expect(layout.reload).toEqual({ x: 1280 - 104, y: 720 - 196, r: 36, hitR: 44 });
      expect(layout.stickHint).toEqual({ x: 104, y: 720 - 104 });
      expect(layout.stickR).toBe(66);
      expect(layout.moveRegionW).toBe(1280 * 0.45);
    });

    it('keeps ≥44px hit targets inside the viewport on every spec size', () => {
      for (const { width, height } of VIEWPORTS) {
        const layout = touchControlsLayout(width, height, null);
        for (const button of [layout.fire, layout.reload, layout.buy]) {
          expect(button.hitR * 2).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
          expect(button.x - button.r).toBeGreaterThanOrEqual(0);
          expect(button.x + button.r).toBeLessThanOrEqual(width);
          expect(button.y - button.r).toBeGreaterThanOrEqual(0);
          expect(button.y + button.r).toBeLessThanOrEqual(height);
        }
        // Fire / reload / buy never overlap.
        const pairs: [typeof layout.fire, typeof layout.fire][] = [
          [layout.fire, layout.reload],
          [layout.reload, layout.buy],
          [layout.fire, layout.buy],
        ];
        for (const [a, b] of pairs) {
          const gap = Math.hypot(a.x - b.x, a.y - b.y);
          expect(gap).toBeGreaterThanOrEqual(a.r + b.r);
        }
        expect(layout.stickHint.x).toBeLessThan(layout.moveRegionW);
      }
    });

    it('stacks the buy button above reload at the 1280x720 baseline', () => {
      const layout = touchControlsLayout(1280, 720, null);
      expect(layout.buy).toEqual({ x: 1280 - 104, y: 720 - 284, r: 30, hitR: 36 });
    });

    it('clears notched safe areas', () => {
      const layout = touchControlsLayout(NOTCHED.width, NOTCHED.height, NOTCHED.insets);
      expect(layout.fire.x + layout.fire.r).toBeLessThanOrEqual(NOTCHED.width - NOTCHED.insets.right);
      expect(layout.fire.y + layout.fire.r).toBeLessThanOrEqual(NOTCHED.height - NOTCHED.insets.bottom);
      expect(layout.stickHint.x - layout.stickR).toBeGreaterThanOrEqual(NOTCHED.insets.left);
    });
  });

  describe('roundHeaderY', () => {
    it('clears both shared utilities and the radar on narrow phones', () => {
      for (const { width, height } of VIEWPORTS.filter(v => v.width < 500)) {
        for (const safe of [sanitizeInsets(null), { top: 47, right: 0, bottom: 34, left: 24 }]) {
          const y = roundHeaderY(width, height, safe), s = hudScale(width, height);
          expect(y).toBeGreaterThanOrEqual(safe.top + SHELL_MENU_RESERVE + 8);
          expect(y).toBeGreaterThan(safe.top + 10 * s + Math.max(64, 100 * s));
        }
      }
    });
    it('keeps the established centered header on desktop and landscape', () => {
      expect(roundHeaderY(1280, 720)).toBe(14);
      expect(roundHeaderY(844, 390, NOTCHED.insets)).toBe(14 * hudScale(844, 390));
    });
  });

  describe('shell chrome + safe-area primitives', () => {
    it('reserves the shared 44px top-right menu plus its 12px margin', () => {
      expect(SHELL_MENU_RESERVE).toBe(56);
    });

    it('sanitizes missing or negative insets', () => {
      expect(sanitizeInsets(null)).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
      expect(sanitizeInsets({ top: -5, right: 10 })).toEqual({ top: 0, right: 10, bottom: 0, left: 0 });
    });
  });
});
