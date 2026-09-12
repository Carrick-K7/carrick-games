import { describe, expect, it, vi } from 'vitest';
import { drawGameResultOverlay, getRetroPalette, measureResultPanel, wrapCanvasText } from '../src/render';

function context(cssWidth = 320) {
  const draws: { text: string; color: string; font: string }[] = [];
  const ctx = {
    canvas: { getBoundingClientRect: () => ({ width: cssWidth }) }, font: '14px system-ui', fillStyle: '',
    measureText(text: string) { return { width: [...text].length * (Number(this.font.match(/([\d.]+)px/)?.[1]) || 14) * .62 }; },
    save: vi.fn(), restore: vi.fn(), fillRect: vi.fn(), translate: vi.fn(), scale: vi.fn(), beginPath: vi.fn(), roundRect: vi.fn(), fill: vi.fn(), stroke: vi.fn(),
    fillText(text: string) { draws.push({ text, color: this.fillStyle, font: this.font }); },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, draws };
}

describe('readable result-only presentation', () => {
  it('wraps words without squeezing them into a single canvas line', () => {
    const { ctx } = context();
    const text = 'Press Space or tap the canvas to start again';
    const lines = wrapCanvasText(ctx, text, 160);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toBe(text);
    for (const line of lines) expect(ctx.measureText(line).width).toBeLessThanOrEqual(160);
  });
  it('wraps unspaced Chinese and preserves every character', () => {
    const { ctx } = context();
    const text = '按空格键或点击画布开始下一场游戏';
    const lines = wrapCanvasText(ctx, text, 100);
    expect(lines.join('')).toBe(text);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(ctx.measureText(line).width).toBeLessThanOrEqual(100);
  });
  it('preserves code points and explicit paragraph breaks', () => {
    const ctx = { measureText: (text: string) => ({ width: [...text].length * 10 } as TextMetrics) };
    expect(wrapCanvasText(ctx, '🏆🏆\n得分', 10)).toEqual(['🏆', '🏆', '得', '分']);
  });
  it('keeps normal phone score and hint text at 14 real CSS pixels', () => {
    const { ctx } = context();
    const scale = 320 / 800;
    const layout = measureResultPanel(ctx, 800, 1000, { title: 'Complete', details: ['Score: 1280', 'Level: 8'], hint: 'Press Space or tap to restart' }, scale);
    expect(layout.fit).toBe(1);
    for (const row of layout.rows.filter(row => row.role !== 'title')) {
      expect(Number(row.font.match(/([\d.]+)px/)?.[1]) * scale).toBeCloseTo(14);
    }
    expect(layout.width * scale).toBeLessThanOrEqual(320 - 24);
  });
  it('fits complete wrapped content inside a short landscape canvas', () => {
    const { ctx } = context();
    const layout = measureResultPanel(ctx, 640, 300, { title: 'All levels complete', details: ['Score: 12800', 'Accuracy: 100%', 'New personal best'], hint: 'Press Space or tap the canvas to start again' }, .5);
    expect(layout.height * layout.fit).toBeLessThanOrEqual(300);
    expect(layout.rows.filter(row => row.role === 'detail').map(row => row.text).join(' ')).toContain('Accuracy: 100%');
    expect(layout.rows.at(-1)?.role).toBe('hint');
    for (const row of layout.rows) expect(row.y).toBeLessThan(layout.height);
  });
  it.each([false, true])('uses neutral readable score text in dark=%s without changing the game palette', dark => {
    const { ctx, draws } = context();
    const palette = getRetroPalette(dark), before = structuredClone(palette);
    drawGameResultOverlay(ctx, 400, 500, palette, { title: 'Game over', details: ['Score: 120'], hint: 'Tap to restart', tone: 'danger' });
    expect(draws.find(draw => draw.text === 'Score: 120')?.color).toBe(dark ? '#EDF5F1' : '#14231F');
    expect(draws.find(draw => draw.text === 'Game over')?.color).not.toBe(palette.red);
    expect(palette).toEqual(before);
    expect(ctx.save).toHaveBeenCalledOnce();
    expect(ctx.restore).toHaveBeenCalledOnce();
  });
});
