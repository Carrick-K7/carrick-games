import { describe, expect, it } from 'vitest';
import { computeShellReserve, normalizeSafeArea, rectsOverlap, type HudRect } from '../src/layout';

describe('shared chrome geometry', () => {
  it('preserves the original CS reserve formula across widths and safe areas', () => {
    for (const width of [0, 320, 390, 640, 844, 1280, 2560]) {
      for (const safe of [undefined, null, {}, { top: 47, right: 44, bottom: 21, left: 44 }, { top: -8, right: Number.NaN }]) {
        const normalized = normalizeSafeArea(safe);
        expect(computeShellReserve(width, safe)).toEqual({
          x: width - normalized.right - 12 - 200,
          y: normalized.top + 12,
          w: 200,
          h: 44,
        });
      }
    }
  });

  it('treats shared edges as non-overlapping and positive intersections symmetrically', () => {
    const base: HudRect = { x: 12, y: 12, w: 44, h: 44 };
    for (const other of [{ x: 56, y: 12, w: 44, h: 44 }, { x: 12, y: 56, w: 44, h: 44 }]) {
      expect(rectsOverlap(base, other)).toBe(false);
      expect(rectsOverlap(other, base)).toBe(false);
    }
    const overlap = { x: 55, y: 55, w: 44, h: 44 };
    expect(rectsOverlap(base, overlap)).toBe(true);
    expect(rectsOverlap(overlap, base)).toBe(true);
  });
});
