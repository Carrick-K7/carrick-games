import { afterEach, describe, expect, it, vi } from 'vitest';
import { CsHud, type CsHudView } from '../src/csHud';
import { killfeedColumns, rectsOverlap } from '../src/csHudLayout';

afterEach(() => vi.unstubAllGlobals());
const row = { x: 19, y: 71, w: 300, h: 22 };
function context() {
  const ops: any[] = [];
  const ctx: any = new Proxy({
    globalAlpha: 1, font: '11px sans-serif', textAlign: 'left', fillStyle: '',
    measureText: (text: string) => ({ width: Array.from(text).length * 6 }),
    fillText: (text: string, x: number, y: number) => {
      const w = Array.from(text).length * 6, h = parseFloat(ctx.font.match(/([\d.]+)px/)?.[1] || '11');
      ops.push({ kind: 'text', text, color: ctx.fillStyle, x: x - (ctx.textAlign === 'center' ? w / 2 : ctx.textAlign === 'right' ? w : 0), y: y - h / 2, w, h });
    },
    drawImage: (image: HTMLImageElement, x: number, y: number, w: number, h: number) => ops.push({ kind: 'image', src: image.src, x, y, w, h }),
  }, { get: (target, key) => (target as any)[key] ?? (() => undefined) });
  return { ctx: ctx as CanvasRenderingContext2D, ops };
}
function setup(complete = true, naturalWidth = 640, naturalHeight = 160) {
  const requested: string[] = [];
  class ImageMock {
    complete = complete; naturalWidth = naturalWidth; naturalHeight = naturalHeight; decoding = '';
    private url = '';
    get src() { return this.url; }
    set src(url: string) { this.url = url; requested.push(url); }
  }
  vi.stubGlobal('Image', ImageMock);
  const e: any = { isZh: () => false, gunId: 'usp', assetUrl: (path: string) => `https://example.test/games/cs/1.2.1/revision/${path}` };
  return { e, hud: new CsHud(e) as any, requested };
}
function entry(weaponId: string | undefined = 'ak47', head = true): CsHudView['killfeed'][number] {
  return { aName: 'ATTACKER-WITH-LONG-NAME', aTeam: 'ct', aMe: true, bName: '被击败的长名字', bTeam: 't', weaponId, weapon: 'AK-47', head, time: 1 };
}

describe('CS killfeed silhouette cells', () => {
  for (const w of [160, 184, 240, 300]) for (const head of [false, true]) {
    it(`${w}px head=${head}: name/art/headshot cells stay bounded and disjoint`, () => {
      const r = { ...row, w }, cells = killfeedColumns(r, head);
      const rects = [cells.attacker, cells.weapon, cells.head, cells.victim].filter(Boolean) as typeof row[];
      rects.forEach((rect, i) => {
        expect(rect.w).toBeGreaterThan(0); expect(rect.h).toBeGreaterThan(0);
        expect(rect.x).toBeGreaterThanOrEqual(r.x); expect(rect.y).toBeGreaterThanOrEqual(r.y);
        expect(rect.x + rect.w).toBeLessThanOrEqual(r.x + r.w + .001);
        expect(rect.y + rect.h).toBeLessThanOrEqual(r.y + r.h + .001);
        for (const other of rects.slice(i + 1)) expect(rectsOverlap(rect, other)).toBe(false);
      });
      const { hud } = setup(), { ctx, ops } = context();
      hud.drawKillfeedRow(ctx, r, entry('ak47', head));
      expect(ops.filter(o => o.kind === 'image')).toHaveLength(1);
      expect(ops.some(o => o.text === 'AK-47')).toBe(false);
      expect(ops.filter(o => o.text === 'HS')).toHaveLength(head ? 1 : 0);
      const painted = ops.filter(o => o.kind === 'text' || o.kind === 'image');
      painted.forEach((op, i) => {
        expect(op.x).toBeGreaterThanOrEqual(r.x); expect(op.y).toBeGreaterThanOrEqual(r.y);
        expect(op.x + op.w).toBeLessThanOrEqual(r.x + r.w + .001);
        expect(op.y + op.h).toBeLessThanOrEqual(r.y + r.h + .001);
        for (const other of painted.slice(i + 1)) expect(rectsOverlap(op, other)).toBe(false);
      });
    });
  }
  for (const [id, width, height] of [['awp', 1040, 290], ['usp', 1040, 530], ['p90', 1040, 470]] as const) {
    it(`${id}: uses event ID and preserves its real aspect after switching guns`, () => {
      const { hud, e, requested } = setup(true, width, height), { ctx, ops } = context();
      hud.drawKillfeedRow(ctx, row, entry(id));
      e.gunId = 'glock'; hud.drawKillfeedRow(ctx, row, entry(id));
      const images = ops.filter(o => o.kind === 'image');
      expect(images).toHaveLength(2); expect(images[0].w / images[0].h).toBeCloseTo(width / height, 8);
      expect(requested).toEqual([`https://example.test/games/cs/1.2.1/revision/assets/ui/weapons/${id}.svg`]);
      expect(images[1]).toEqual(images[0]);
    });
  }
  for (const state of ['pending', 'failed', 'legacy', 'utility'] as const) {
    it(`${state}: retains readable fallback plus headshot information`, () => {
      const { hud, requested } = setup(state !== 'pending', state === 'failed' ? 0 : 640), { ctx, ops } = context();
      const k = entry(state === 'legacy' ? undefined : state === 'utility' ? 'he' : 'ak47');
      if (state === 'legacy') delete k.weaponId;
      k.weapon = state === 'utility' ? 'HE' : 'AK-47';
      hud.drawKillfeedRow(ctx, row, k);
      expect(ops.filter(o => o.kind === 'image')).toHaveLength(0);
      expect(ops.some(o => o.text === k.weapon)).toBe(true);
      expect(ops.some(o => o.text === 'HS')).toBe(true);
      if (state === 'legacy' || state === 'utility') expect(requested).toEqual([]);
    });
  }
  it('pending and loaded artwork keep names and headshot labels at identical positions', () => {
    const { hud } = setup(false), before = context(), after = context();
    hud.drawKillfeedRow(before.ctx, row, entry());
    const image = [...hud.weaponIcons.values()][0] as any; image.complete = true;
    hud.drawKillfeedRow(after.ctx, row, entry());
    expect(after.ops.filter(o => o.kind === 'text')).toEqual(before.ops.filter(o => o.kind === 'text' && o.text !== 'AK-47'));
  });
});
