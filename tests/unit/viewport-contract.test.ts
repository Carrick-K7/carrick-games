import { describe, expect, it } from 'vitest';
import { canvasViewportIssues, type CanvasViewportSample } from '../support/viewport-contract';

const fixedSize = { width: 440, height: 660 };
function sample(overrides: Partial<CanvasViewportSample> = {}): CanvasViewportSample {
  return {
    mode: 'responsive', logicalWidth: 640, logicalHeight: 360,
    backingWidth: 1280, backingHeight: 720, pixelRatio: 2,
    cssWidth: 640, cssHeight: 360, offsetX: 0, offsetY: 0,
    viewportWidth: 640, viewportHeight: 360, devicePixelRatio: 2,
    ...overrides,
  };
}

describe('browser viewport assertion contract', () => {
  it('keeps fixed and older unmarked API-1 boards at the exact metadata size', () => {
    for (const mode of ['contain', null]) {
      expect(canvasViewportIssues(sample({ mode, logicalWidth: 440, logicalHeight: 660 }), fixedSize)).toEqual([]);
      expect(canvasViewportIssues(sample({ mode }), fixedSize)).toContain('fixed logical size 640x360 != 440x660');
    }
  });
  it('accepts a legitimate responsive opt-in without requiring a game-id allowlist', () => {
    expect(canvasViewportIssues(sample(), fixedSize)).toEqual([]);
    expect(canvasViewportIssues(sample({ logicalWidth: 440, logicalHeight: 660 }), fixedSize))
      .toContain('responsive logical size must equal the host viewport');
  });
  it('requires actual CSS coverage, alignment, DPR and backing dimensions together', () => {
    for (const changed of [{ cssWidth: 320 }, { cssHeight: 320 }, { offsetX: 5 }, { offsetY: 5 }, { pixelRatio: 1 }, { backingWidth: 1279 }, { backingHeight: 719 }]) {
      expect(canvasViewportIssues(sample(changed), fixedSize).length).toBeGreaterThan(0);
    }
  });
  it('clamps high device DPR to two rather than accepting any positive backing size', () => {
    expect(canvasViewportIssues(sample({ devicePixelRatio: 3 }), fixedSize)).toEqual([]);
    expect(canvasViewportIssues(sample({ devicePixelRatio: 3, pixelRatio: 3, backingWidth: 1920, backingHeight: 1080 }), fixedSize).length).toBeGreaterThan(0);
  });
  it('enforces the public pixel budget at large responsive viewports', () => {
    const large = sample({ viewportWidth: 2560, viewportHeight: 1440, logicalWidth: 2560, logicalHeight: 1440,
      cssWidth: 2560, cssHeight: 1440, pixelRatio: 1.5, backingWidth: 3840, backingHeight: 2160 });
    expect(canvasViewportIssues(large, fixedSize)).toEqual([]);
    expect(canvasViewportIssues({ ...large, pixelRatio: 2, backingWidth: 5120, backingHeight: 2880 }, fixedSize).length).toBeGreaterThan(0);
  });
  it('does not treat missing numeric geometry as success', () => {
    for (const changed of [{ logicalWidth: NaN }, { cssHeight: NaN }, { pixelRatio: NaN }, { viewportHeight: 0 }]) {
      expect(canvasViewportIssues(sample(changed), fixedSize).length).toBeGreaterThan(0);
    }
  });
  it('retains only the explicitly requested legacy contained-layout exception', () => {
    expect(canvasViewportIssues(sample({ mode: 'contain' }), fixedSize, true)).toEqual([]);
    expect(canvasViewportIssues(sample({ mode: 'unexpected' }), fixedSize, true)).toContain('unknown viewport mode');
    expect(canvasViewportIssues(sample({ backingWidth: 1 }), fixedSize, true).length).toBeGreaterThan(0);
  });
});
