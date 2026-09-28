import { afterEach, describe, expect, it, vi } from 'vitest';
import { CsHud, type CsHudView } from '../src/csHud';
import { killfeedColumns, rectsOverlap } from '../src/csHudLayout';

const GOLD = '#d8c08b', WHITE = '#f0f3f5';
afterEach(() => vi.unstubAllGlobals());
const row = { x: 19, y: 71, w: 300, h: 22 };
class RecordedPath {
  points: [number, number][] = [];
  moveTo(x: number, y: number) { this.points.push([x, y]); }
  lineTo(x: number, y: number) { this.points.push([x, y]); }
  closePath() {}
}
function context() {
  const ops: any[] = [], stack: any[] = [];
  let currentPath = new RecordedPath();
  const state = () => ({ fillStyle: ctx.fillStyle, strokeStyle: ctx.strokeStyle, globalAlpha: ctx.globalAlpha,
    font: ctx.font, textAlign: ctx.textAlign, textBaseline: ctx.textBaseline });
  const ctx: any = new Proxy({
    globalAlpha: 1, font: '11px sans-serif', textAlign: 'left', fillStyle: '',
    save: () => stack.push(state()), restore: () => Object.assign(ctx, stack.pop()),
    beginPath: () => { currentPath = new RecordedPath(); },
    moveTo: (x: number, y: number) => currentPath.moveTo(x, y),
    lineTo: (x: number, y: number) => currentPath.lineTo(x, y), closePath: () => {},
    fill: (pathOrRule: RecordedPath | string, rule?: string) => {
      const path = typeof pathOrRule === 'string' ? currentPath : pathOrRule;
      if (!path?.points.length) return;
      const xs = path.points.map(p => p[0]), ys = path.points.map(p => p[1]);
      ops.push({ kind: 'glyph', color: ctx.fillStyle, points: path.points,
        rule: rule ?? pathOrRule, x: Math.min(...xs), y: Math.min(...ys),
        w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) });
    },
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
  vi.stubGlobal('Image', ImageMock); vi.stubGlobal('Path2D', RecordedPath);
  const e: any = { isZh: () => false, gunId: 'usp', controlSettings: { knifeModel: 'classic' },
    assetUrl: (path: string) => `https://example.test/games/cs/1.2.1/revision/${path}` };
  return { e, hud: new CsHud(e) as any, requested };
}
function entry(weaponId: string | undefined = 'ak47', head = true, weaponIconId = weaponId): CsHudView['killfeed'][number] {
  return { aName: 'ATTACKER-WITH-LONG-NAME', aTeam: 'ct', aMe: true, bName: '被击败的长名字', bTeam: 't',
    weaponId, weaponIconId, weapon: 'AK-47', head, time: 1 };
}
function bounded(ops: any[], r: typeof row) {
  ops.forEach((op, i) => {
    expect([op.x, op.y, op.w, op.h].every(Number.isFinite)).toBe(true);
    expect(op.x).toBeGreaterThanOrEqual(r.x); expect(op.y).toBeGreaterThanOrEqual(r.y);
    expect(op.x + op.w).toBeLessThanOrEqual(r.x + r.w + .001);
    expect(op.y + op.h).toBeLessThanOrEqual(r.y + r.h + .001);
    for (const other of ops.slice(i + 1)) expect(rectsOverlap(op, other)).toBe(false);
  });
}
function headGlyphs(ops: any[]) { return ops.filter(o => o.kind === 'glyph' && o.color === GOLD); }

describe('CS killfeed silhouette cells', () => {
  for (const w of [160, 184, 240, 300]) for (const head of [false, true]) {
    it(`${w}px head=${head}: name/art/headshot glyph cells stay bounded and disjoint`, () => {
      const r = { ...row, w }, cells = killfeedColumns(r, head);
      const rects = [cells.attacker, cells.weapon, cells.head, cells.victim].filter(Boolean) as typeof row[];
      rects.forEach(rect => { expect(rect.w).toBeGreaterThan(0); expect(rect.h).toBeGreaterThan(0); });
      bounded(rects, r);
      const { hud } = setup(), { ctx, ops } = context();
      hud.drawKillfeedRow(ctx, r, entry('ak47', head));
      expect(ops.filter(o => o.kind === 'image')).toHaveLength(1);
      expect(ops.some(o => o.text === 'AK-47' || o.text === 'HS')).toBe(false);
      expect(headGlyphs(ops)).toHaveLength(head ? 1 : 0);
      if (head) {
        const glyph = headGlyphs(ops)[0];
        expect(glyph.rule).toBe('evenodd'); expect(glyph.points.length).toBeGreaterThan(3);
        expect(glyph.w).toBeLessThanOrEqual(16); expect(glyph.h).toBeLessThanOrEqual(16);
        bounded([glyph], cells.head!);
      }
      bounded(ops, r);
    });
  }
  for (const [id, width, height] of [['awp', 1040, 290], ['usp', 1040, 530], ['p90', 1040, 470],
    ['knife-classic', 754, 614], ['knife-karambit', 855, 605], ['knife-butterfly', 733, 616]] as const) {
    it(`${id}: uses saved icon identity and real aspect after equipment/settings changes`, () => {
      const { hud, e, requested } = setup(true, width, height), before = context(), after = context();
      const k = entry(id.startsWith('knife-') ? 'knife' : id, true, id);
      hud.drawKillfeedRow(before.ctx, row, k);
      e.gunId = 'glock'; e.controlSettings.knifeModel = 'butterfly'; e.isZh = () => true;
      hud.drawKillfeedRow(after.ctx, row, k);
      const images = before.ops.filter(o => o.kind === 'image');
      expect(images).toHaveLength(1); expect(images[0].w / images[0].h).toBeCloseTo(width / height, 8);
      expect(images[0].h).toBeLessThanOrEqual(16); bounded(before.ops, row);
      expect(requested).toEqual([`https://example.test/games/cs/1.2.1/revision/assets/ui/weapons/${id}.svg`]);
      expect(after.ops).toEqual(before.ops);
    });
  }
  for (const state of ['pending', 'failed', 'legacy', 'legacy-knife', 'pending-knife', 'failed-knife', 'unknown', 'invalid-icon'] as const) {
    it(`${state}: retains readable fallback and headshot glyph without fake art`, () => {
      const knife = state.includes('knife'), pending = state.startsWith('pending'), failed = state.startsWith('failed');
      const { hud, requested } = setup(!pending, failed ? 0 : 640), { ctx, ops } = context();
      const k = entry(knife ? 'knife' : state === 'unknown' ? 'future-weapon' : 'ak47', true,
        knife ? 'knife-karambit' : state === 'invalid-icon' ? '__proto__' : undefined);
      if (state === 'legacy' || state === 'legacy-knife') delete k.weaponIconId;
      if (state === 'legacy') delete k.weaponId;
      k.weapon = knife ? 'Knife' : state === 'unknown' || state === 'invalid-icon' ? 'Other' : 'AK-47';
      hud.drawKillfeedRow(ctx, row, k);
      expect(ops.filter(o => o.kind === 'image')).toHaveLength(0);
      expect(ops.some(o => o.text === k.weapon)).toBe(true);
      expect(ops.some(o => o.text === 'HS')).toBe(false); expect(headGlyphs(ops)).toHaveLength(1);
      bounded(ops, row);
      expect(requested).toHaveLength(pending || failed ? 1 : 0);
    });
  }
  for (const id of ['he', 'c4']) for (const head of [false, true]) {
    it(`${id} head=${head}: draws a bounded original utility symbol without loading images`, () => {
      const { hud, e, requested } = setup(), before = context(), after = context();
      vi.stubGlobal('Image', undefined);
      const k = entry(id, head); k.weapon = id === 'he' ? 'HE Grenade' : 'C4 Explosive';
      hud.drawKillfeedRow(before.ctx, row, k);
      const utilities = before.ops.filter(o => o.kind === 'glyph' && o.color === WHITE);
      expect(utilities).toHaveLength(1); expect(utilities[0].rule).toBe('evenodd');
      expect(utilities[0].w).toBeLessThanOrEqual(16); expect(utilities[0].h).toBeLessThanOrEqual(16);
      bounded([utilities[0]], killfeedColumns(row, head).weapon); bounded(before.ops, row);
      expect(headGlyphs(before.ops)).toHaveLength(head ? 1 : 0);
      expect(before.ops.some(o => o.kind === 'image' || o.text === k.weapon || o.text === 'HS')).toBe(false);
      expect(requested).toEqual([]);
      e.gunId = 'knife'; e.controlSettings.knifeModel = 'karambit';
      hud.drawKillfeedRow(after.ctx, row, k); expect(after.ops).toEqual(before.ops);
    });
  }
  it('legacy firearm records still use their raw event ID, never the current gun', () => {
    const { hud, e, requested } = setup(), { ctx, ops } = context(), k = entry('awp'); delete k.weaponIconId;
    e.gunId = 'usp'; hud.drawKillfeedRow(ctx, row, k);
    expect(ops.filter(o => o.kind === 'image')).toHaveLength(1);
    expect(requested[0]).toMatch(/\/awp.svg$/);
  });
  it('pending and loaded art keep names and headshot glyph at identical positions', () => {
    const { hud } = setup(false), before = context(), after = context();
    hud.drawKillfeedRow(before.ctx, row, entry());
    const image = [...hud.weaponIcons.values()][0] as any; image.complete = true;
    hud.drawKillfeedRow(after.ctx, row, entry());
    expect(after.ops.filter(o => o.kind !== 'image')).toEqual(before.ops.filter(o => o.text !== 'AK-47'));
  });
});
