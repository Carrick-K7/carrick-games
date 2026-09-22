import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CsHud } from '../src/csHud';
import { UI, uiButton, uiHudPlate } from '../src/csHudUi';

function recorder() {
  const ops: any[] = [];
  const ctx: any = new Proxy({
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '14px sans-serif',
    roundRect: (x: number, y: number, w: number, h: number, radius: number) => ops.push({ type: 'shape', x, y, w, h, radius }),
    fillRect: (x: number, y: number, w: number, h: number) => ops.push({ type: 'fillRect', x, y, w, h, color: ctx.fillStyle }),
    fill: () => ops.push({ type: 'fill', color: ctx.fillStyle }),
    fillText: (value: string, x: number, y: number) => ops.push({ type: 'text', value, x, y, color: ctx.fillStyle }),
    measureText: (value: string) => ({ width: value.length * 6 }),
  }, { get: (target, key) => (target as any)[key] ?? (() => undefined) });
  return { ctx: ctx as CanvasRenderingContext2D, ops };
}
function luminance(hex: string) {
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
afterEach(() => vi.unstubAllGlobals());

describe('CS tactical presentation tokens', () => {
  it('uses crisp controls, an explicit selected underline, and high-contrast primary actions', () => {
    const { ctx, ops } = recorder();
    uiButton(ctx, 10, 20, 160, 44, 'CT', { selected: true, tone: 'ct' });
    expect(ops.find(op => op.type === 'shape')?.radius).toBeLessThanOrEqual(2);
    expect(ops).toContainEqual({ type: 'fillRect', x: 11, y: 61, w: 158, h: 2, color: UI.ct });
    for (const background of [UI.primary, UI.primaryHover]) {
      expect((luminance(UI.text) + .05) / (luminance(background) + .05)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('hover adds visual feedback without moving the target or changing its label', () => {
    const idle = recorder(), hover = recorder();
    uiButton(idle.ctx, 2, 3, 160, 44, 'Settings');
    uiButton(hover.ctx, 2, 3, 160, 44, 'Settings', { hovered: true });
    expect(idle.ops.find(op => op.type === 'shape')).toEqual(hover.ops.find(op => op.type === 'shape'));
    expect(idle.ops.find(op => op.type === 'text')).toEqual(hover.ops.find(op => op.type === 'text'));
    expect(idle.ops.find(op => op.type === 'fill')?.color).not.toBe(hover.ops.find(op => op.type === 'fill')?.color);
  });
  it('HUD backplates remain square and restrained within their existing rectangles', () => {
    const { ctx, ops } = recorder(); uiHudPlate(ctx, 12, 30, 145, 46, UI.ct);
    expect(ops.filter(op => op.type === 'shape')).toEqual([]);
    for (const op of ops.filter(op => op.type === 'fillRect')) {
      expect(op.x).toBeGreaterThanOrEqual(12); expect(op.y).toBeGreaterThanOrEqual(30);
      expect(op.x + op.w).toBeLessThanOrEqual(157); expect(op.y + op.h).toBeLessThanOrEqual(76);
    }
  });
});

describe('CS-owned map preview resources', () => {
  it('captures map images once per immutable URL and never shares an active asset base', () => {
    const loaded: string[] = [];
    class ImageMock {
      complete = true; naturalWidth = 640; naturalHeight = 360; decoding = '';
      private url = '';
      set src(url: string) { this.url = url; loaded.push(url); }
      get src() { return this.url; }
    }
    vi.stubGlobal('Image', ImageMock);
    const first: any = new CsHud({ assetUrl: (path: string) => `https://example.test/games/cs/1.2.0/first/${path}` } as any);
    const second: any = new CsHud({ assetUrl: (path: string) => `https://example.test/games/cs/1.2.1/second/${path}` } as any);
    const snow = first.mapPreview('fy_snow');
    expect(first.mapPreview('fy_snow')).toBe(snow);
    first.mapPreview('de_dust2');
    expect(second.mapPreview('fy_snow')).not.toBe(snow);
    expect(loaded).toEqual([
      'https://example.test/games/cs/1.2.0/first/assets/ui/maps/fy_snow.webp',
      'https://example.test/games/cs/1.2.0/first/assets/ui/maps/de_dust2.webp',
      'https://example.test/games/cs/1.2.1/second/assets/ui/maps/fy_snow.webp',
    ]);
    first.dispose(); expect(first.mapPreviews.size).toBe(0); expect(second.mapPreviews.size).toBe(1);
  });
  it('keeps a labeled fallback when an optional thumbnail fails', () => {
    vi.stubGlobal('Image', class { complete = true; naturalWidth = 0; src = ''; decoding = ''; });
    const hud: any = new CsHud({ assetUrl: (path: string) => path } as any);
    expect(hud.mapPreview('fy_snow')).toBeNull();
    const { ctx, ops } = recorder(); hud.drawMapPreview(ctx, 'fy_snow', 0, 0, 200, 84);
    expect(ops).toContainEqual({ type: 'fillRect', x: 0, y: 0, w: 200, h: 84, color: UI.raised });
  });
  it('ships real WebP preview files, not external image URLs or illustrated fixtures', () => {
    for (const name of ['fy_snow', 'de_dust2']) {
      const bytes = readFileSync(join(process.cwd(), 'games/cs/public/assets/ui/maps', `${name}.webp`));
      expect(bytes.subarray(0, 4).toString()).toBe('RIFF'); expect(bytes.subarray(8, 12).toString()).toBe('WEBP');
      expect(bytes.length).toBeGreaterThan(10000); expect(bytes.length).toBeLessThan(100000);
    }
  });
});
