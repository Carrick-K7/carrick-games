import { afterEach, describe, expect, it, vi } from 'vitest';
import { courtyardSwatches, type GroundSwatch } from '../src/villaSoilFinishes.js';
import { VILLA_GROUND_SCANS } from '../src/villaGroundScanData.js';

const sizes = { turf: [512, 512], gravel: [1024, 1024], timber: [1024, 256] } as const;
const kinds = Object.keys(sizes) as GroundSwatch[];
afterEach(() => { vi.unstubAllGlobals(); });

function fixture() {
  const pictures = {} as Record<GroundSwatch, Picture>;
  class Picture {
    decoding = ''; naturalWidth = 0; naturalHeight = 0;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(url: string) {
      const kind = kinds.find(k => VILLA_GROUND_SCANS[k] === url);
      if (!kind) throw Error('Not a bundled swatch');
      [this.naturalWidth, this.naturalHeight] = sizes[kind]; pictures[kind] = this;
    }
  }
  vi.stubGlobal('Image', Picture);
  const drawImage = vi.fn(), pattern = {}, context = { createPattern: () => pattern, fillRect: vi.fn(), drawImage };
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
  return { pictures, drawImage, context };
}

describe('scene-owned courtyard swatches', () => {
  it('paints the full fallback first and reports decoded only after drawing each bundled photo into its original canvas', async () => {
    const { pictures, context, drawImage } = fixture(), redraw = vi.fn(), s = courtyardSwatches(redraw);
    const sources = kinds.map(k => s.maps[k].image);
    try {
      for (const k of kinds) {
        const [w, h] = sizes[k];
        expect(s.maps[k].image).toMatchObject({ width: w, height: h });
        expect(context.fillRect).toHaveBeenCalledWith(0, 0, w, h);
        expect(s.maps[k].version).toBe(1);
      }
      expect(drawImage).not.toHaveBeenCalled(); expect(redraw).not.toHaveBeenCalled();
      for (const k of ['timber', 'gravel', 'turf'] as const) {
        const callback = pictures[k].onload!; callback(); callback();
        expect(drawImage).toHaveBeenCalledWith(pictures[k], 0, 0, ...sizes[k]);
        expect(s.maps[k].version).toBe(2);
        expect(pictures[k].onload).toBeNull(); expect(pictures[k].onerror).toBeNull();
      }
      await expect(s.ready).resolves.toEqual({ turf: 'decoded', gravel: 'decoded', timber: 'decoded' });
      kinds.forEach((k, i) => expect(s.maps[k].image).toBe(sources[i]));
      expect(drawImage).toHaveBeenCalledTimes(3); expect(redraw).toHaveBeenCalledTimes(3);
    } finally { s.dispose(); }
  });

  it('keeps prior outcomes, cancels only pending decodes once, and ignores queued callbacks after error or teardown', async () => {
    const { pictures, drawImage } = fixture(), redraw = vi.fn(), s = courtyardSwatches(redraw);
    const disposed = kinds.map(k => { const event = vi.fn(); s.maps[k].addEventListener('dispose', event); return event; });
    const queued = kinds.map(k => ({ load: pictures[k].onload!, error: pictures[k].onerror! }));
    pictures.gravel.onerror!(); queued[1]!.load(); pictures.turf.onload!();
    s.dispose(); s.dispose();
    for (const callback of queued) { callback.load(); callback.error(); }
    await expect(s.ready).resolves.toEqual({ turf: 'decoded', gravel: 'failed', timber: 'cancelled' });
    expect(kinds.map(k => s.maps[k].version)).toEqual([2, 1, 1]);
    expect(drawImage).toHaveBeenCalledTimes(1); expect(redraw).toHaveBeenCalledTimes(1);
    for (const k of kinds) { expect(pictures[k].onload).toBeNull(); expect(pictures[k].onerror).toBeNull(); }
    disposed.forEach(event => expect(event).toHaveBeenCalledTimes(1));
  });

  it('does not certify failed or wrong-sized raster copies, or an unavailable decoder', async () => {
    const { pictures, drawImage } = fixture(), redraw = vi.fn(), s = courtyardSwatches(redraw);
    try {
      pictures.gravel.naturalHeight = 1; pictures.gravel.onload!();
      drawImage.mockImplementationOnce(() => { throw Error('Unreadable image'); }); pictures.timber.onload!();
      pictures.turf.onerror!();
      const failed = { turf: 'failed', gravel: 'failed', timber: 'failed' };
      await expect(s.ready).resolves.toEqual(failed);
      expect(drawImage).toHaveBeenCalledTimes(1); expect(kinds.map(k => s.maps[k].version)).toEqual([1, 1, 1]);
      vi.stubGlobal('Image', undefined); const fallback = courtyardSwatches(redraw);
      try { await expect(fallback.ready).resolves.toEqual(failed); } finally { fallback.dispose(); }
      expect(redraw).not.toHaveBeenCalled();
    } finally { s.dispose(); }
  });
});
