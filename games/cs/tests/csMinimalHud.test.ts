import { afterEach, describe, expect, it, vi } from 'vitest';
import { CsHud } from '../src/csHud';
import { aimGeometry, computeHudLayout, healthPanelRect, matchFeedbackLayout, rectsOverlap, weaponPanelRect, type HudRect } from '../src/csHudLayout';

type Point = { op: string; x: number; y: number; r?: number };
type Paint = { op: string; color: string; alpha: number; path: Point[]; text?: string; bounds?: HudRect; size?: number; rule?: string };
function recorder() {
  const paint: Paint[] = [], stack: Record<string, unknown>[] = [];
  let path: Point[] = [];
  const state: any = { globalAlpha: 1, lineWidth: 1, lineCap: 'butt', strokeStyle: '', fillStyle: '', font: '12px sans-serif', textAlign: 'left', textBaseline: 'middle' };
  const ctx: any = new Proxy(state, { get: (target, key) => target[key] ?? (() => undefined) });
  const record = (op: string, extra: Partial<Paint> = {}) => paint.push({ op, color: String(op === 'stroke' ? ctx.strokeStyle : ctx.fillStyle), alpha: ctx.globalAlpha, path: [...path], ...extra });
  Object.assign(state, {
    save: () => stack.push(Object.fromEntries(['globalAlpha', 'lineWidth', 'lineCap', 'strokeStyle', 'fillStyle', 'font', 'textAlign', 'textBaseline'].map(k => [k, ctx[k]]))),
    restore: () => Object.assign(state, stack.pop()),
    beginPath: () => { path = []; },
    moveTo: (x: number, y: number) => path.push({ op: 'move', x, y }),
    lineTo: (x: number, y: number) => path.push({ op: 'line', x, y }),
    arc: (x: number, y: number, r: number) => path.push({ op: 'arc', x, y, r }),
    rect: (x: number, y: number) => path.push({ op: 'rect', x, y }),
    roundRect: (x: number, y: number) => path.push({ op: 'roundRect', x, y }),
    stroke: () => record('stroke'), fill: (rule?: string) => record('fill', { rule }),
    fillRect: (x: number, y: number, w: number, h: number) => record('fillRect', { bounds: { x, y, w, h } }),
    drawImage: () => record('image'),
    measureText: (text: string) => ({ width: Array.from(text).reduce((sum, char) => sum + (/[^\x00-\xff]/.test(char) ? 1 : .55), 0) * Number(ctx.font.match(/([\d.]+)px/)?.[1] || 12) }),
    fillText: (text: string, x: number, y: number) => {
      const w = ctx.measureText(text).width, h = Number(ctx.font.match(/([\d.]+)px/)?.[1] || 12);
      record('text', { text, size: h, bounds: { x: x - (ctx.textAlign === 'center' ? w / 2 : ctx.textAlign === 'right' ? w : 0), y: y - h / 2, w, h } });
    },
  });
  return { ctx: ctx as CanvasRenderingContext2D, paint };
}
const safe = { top: 44, right: 20, bottom: 34, left: 47 };
const shapes = [[1280, 720], [320, 568], [390, 844], [568, 320], [844, 390], [431, 719]];
const buttonIds = ['buy', 'fire', 'jump', 'pause', 'reload', 'switch', 'use'].map(id => `touch-${id}`);
function fixture(zh = false) {
  const recording = recorder();
  const engine: any = {
    clock: 10, mode: 'elimination', selectedMap: 'fy_snow', round: 1, phase: 'active', gunId: 'm249', touchMode: false,
    isZh: () => zh, assetUrl: (path: string) => `https://example.invalid/${path}`,
    player: { alive: true, slot: 'primary', health: 100, armor: 100, reload: 0, reloadTotal: 0, money: 16000, inventory: { primary: { id: 'm249' }, bomb: { id: 'c4' } } },
    isDeploying: () => false, isCycling: () => false, controlSettings: { knifeModel: 'classic' },
    drawRadarContent: () => undefined, touchMove: { x: 0, y: 0 }, keys: new Set(),
    hud: {
      health: 100, armor: 100, healthPct: 100, healthLow: false, killCount: 65, grenadeCount: 2,
      weaponName: 'M249', ammoText: '100', reserveText: '200', reloadState: zh ? '轻机枪' : 'Machine gun',
      slots: ['primary', 'pistol', 'knife', 'grenade', 'bomb'].map((key, i) => ({ key, num: i + 1, equipped: i === 0, label: key, empty: false })),
      crosshairHidden: false, crosshairGap: 7, scope: false, scopeLabel: zh ? '二级瞄准' : '2× zoom',
      hitOpacity: 0, hitHead: false, hitKind: 'body', hitConfirmation: '', damageOpacity: 0,
      location: zh ? '反恐出生点' : 'CT spawn', roundLabel: zh ? '回合 12' : 'Round 12', timerText: '1:05', timerUrgent: false,
      ctScore: 12, tScore: 9, alivePips: { ct: ['me', 'alive', 'dead'], t: ['alive', 'dead'] },
      objective: null, objectiveAction: null, money: '$16000', center: null, notice: null, pickup: null,
      scoreboardOpen: false, matchEnd: null, radio: null, killfeed: [],
    },
  };
  const hud = new CsHud(engine);
  return { ...recording, engine, hud, draw(W = 1280, H = 720) { recording.paint.length = 0; hud.draw(recording.ctx, W, H); return [...recording.paint]; } };
}
const texts = (paint: Paint[]) => paint.filter(p => p.op === 'text').map(p => p.text);
const contains = (outer: HudRect, inner: HudRect) => inner.x >= outer.x - .001 && inner.y >= outer.y - .001 && inner.x + inner.w <= outer.x + outer.w + .001 && inner.y + inner.h <= outer.y + outer.h + .001;
const reloadLines = (paint: Paint[], weapon: HudRect) => paint.filter(p => p.op === 'fillRect' && p.bounds?.h === 2 && contains(weapon, p.bounds));
const slots = (paint: Paint[]) => paint.filter(p => p.op === 'text' && /^[1-5]$/.test(p.text ?? ''));

afterEach(() => vi.unstubAllGlobals());
describe('minimal CS HUD actual canvas paint', () => {
  it('retains numeric vitals/cash/ammo/utilities but no personal kill count, vitals bars or permanent firearm image', () => {
    vi.stubGlobal('Image', class { complete = true; naturalWidth = 200; naturalHeight = 80; src = ''; decoding = ''; });
    const f = fixture(); f.hud.setSafeArea(safe);
    f.draw(); f.engine.clock = 13;
    const paint = f.draw(), labels = texts(paint), vital = healthPanelRect(computeHudLayout(1280, 720, safe));
    expect(labels.filter(label => label === '100')).toHaveLength(2);
    expect(labels).toEqual(expect.arrayContaining(['$ 16000', '100 / 200', 'HE×2 · C4', 'M249', '12', '9', '1:05', 'Round 12']));
    expect(labels.some(label => /65|Machine gun|CT spawn/.test(label!))).toBe(false);
    expect(slots(paint)).toEqual([]);
    expect(paint.filter(p => p.op === 'image')).toEqual([]);
    const vitalRects = paint.filter(p => p.op === 'fillRect' && p.bounds && contains(vital, p.bounds));
    expect(vitalRects).toHaveLength(1);
    expect(vitalRects[0].bounds!.h).toBeGreaterThan(20); // One backing, no health/armor progress bars.
  });

  for (const [W, H] of shapes) for (const zh of [false, true]) {
    it(`${W}×${H} deep-safe ${zh ? 'ZH' : 'EN'}: complete body values and seven painted 44px actions survive emphasis expiry`, () => {
      const f = fixture(zh); f.engine.touchMode = true; f.hud.setSafeArea(safe);
      const first = f.draw(W, H);
      expect(slots(first)).toEqual([]);
      const targets = () => f.hud.regions.filter(r => buttonIds.includes(r.id!)).map(({ id, x, y, w, h }) => ({ id, x, y, w, h })).sort((a, b) => a.id!.localeCompare(b.id!));
      const before = targets();
      expect(before.map(r => r.id)).toEqual(buttonIds);
      for (const r of before) {
        expect(r.w).toBeGreaterThanOrEqual(44); expect(r.h).toBeGreaterThanOrEqual(44);
        const circle = first.find(p => p.op === 'fill' && p.alpha > 0 && p.path.some(v => v.op === 'arc' && Math.abs(v.x - r.x - r.w / 2) < .001 && Math.abs(v.y - r.y - r.h / 2) < .001 && v.r! >= 22));
        expect(circle, r.id).toBeTruthy();
        expect(circle!.color).not.toMatch(/,0\)$/);
        expect(first.some(p => p.op === 'text' && p.alpha > 0 && p.bounds && contains(r, p.bounds))).toBe(true);
      }
      f.engine.clock = 13;
      const aged = f.draw(W, H);
      expect(targets()).toEqual(before);
      expect(slots(aged)).toEqual([]);
      const L = computeHudLayout(W, H, safe), vital = healthPanelRect(L), weapon = weaponPanelRect(L);
      const labels = texts(aged);
      expect(labels).toContain('100 / 200'); expect(labels).toContain('HE×2 · C4'); expect(labels).toContain('$ 16000');
      const numericVitals = aged.filter(p => p.op === 'text' && p.text === '100');
      expect(numericVitals).toHaveLength(2);
      for (const p of numericVitals) expect(contains(vital, p.bounds!)).toBe(true);
      for (const p of aged.filter(p => p.op === 'text' && ['100 / 200', 'HE×2 · C4', 'M249'].includes(p.text!))) expect(contains(weapon, p.bounds!), p.text).toBe(true);
      for (const p of aged.filter(p => p.op === 'text' && p.text?.trim())) {
        expect(contains({ x: safe.left, y: safe.top, w: W - safe.left - safe.right, h: H - safe.top - safe.bottom }, p.bounds!), p.text).toBe(true);
      }
      const body = aged.filter(p => p.op === 'text' && p.bounds && (contains(vital, p.bounds) || contains(weapon, p.bounds)));
      for (let i = 0; i < body.length; i++) for (let j = i + 1; j < body.length; j++) expect(rectsOverlap(body[i].bounds!, body[j].bounds!), `${body[i].text} vs ${body[j].text}`).toBe(false);
    });
  }

  it.each([[1280, 720], [390, 844], [844, 390]])('%i×%i: initial and switched weapons never show numeric slots; scope captions remain', (W, H) => {
    const f = fixture(); f.engine.touchMode = W < 1000; f.hud.setSafeArea(safe);
    expect(slots(f.draw(W, H))).toEqual([]);
    for (const [slot, gunId] of [['pistol', 'usp'], ['knife', 'knife'], ['primary', 'ak47']]) {
      f.engine.player.slot = slot; f.engine.gunId = gunId;
      f.engine.player.inventory[slot] = { id: gunId };
      for (const item of f.engine.hud.slots) item.equipped = item.key === slot;
      expect(slots(f.draw(W, H))).toEqual([]);
      f.engine.clock += .1;
      expect(slots(f.draw(W, H))).toEqual([]);
    }
    f.engine.hud.scope = true;
    expect(texts(f.draw(W, H))).toContain('2× zoom');
  });

  it('expires only captions on game-clock advance; frozen redraws retain exact scope geometry and input targets', () => {
    const f = fixture(); f.engine.touchMode = true; f.engine.hud.scope = true;
    const first = f.draw(390, 844);
    expect(texts(first)).toContain('CT spawn'); expect(texts(first)).toContain('2× zoom'); expect(slots(first)).toEqual([]);
    const optic = (paint: Paint[]) => paint.filter(p => (p.op === 'fill' && p.rule === 'evenodd' && p.path.some(v => v.op === 'arc')) || (p.op === 'stroke' && p.color === '#10151a'));
    for (let i = 0; i < 5; i++) expect(f.draw(390, 844)).toEqual(first);
    f.engine.clock = 11.6;
    const scopeAged = f.draw(390, 844);
    expect(texts(scopeAged)).not.toContain('2× zoom'); expect(texts(scopeAged)).toContain('CT spawn'); expect(slots(scopeAged)).toEqual([]);
    f.engine.clock = 12;
    const aged = f.draw(390, 844);
    expect(texts(aged)).not.toContain('CT spawn'); expect(slots(aged)).toEqual([]);
    expect(optic(aged)).toEqual(optic(first));
    const arc = optic(first)[0].path.find(v => v.op === 'arc')!;
    expect(arc).toMatchObject({ x: 195, y: 422, r: aimGeometry(390, 844).scopeRadius });
    f.engine.hud.scope = false;
    expect(optic(f.draw(390, 844))).toEqual([]);
  });

  it.each([
    ['reload', 'Reloading · 1s', '换弹中 · 1s'], ['deploy', 'Deploying · 0.2s', '取出武器 · 0.2s'],
    ['cycle', 'Cycling bolt', '拉栓中'], ['prime', 'Pulling pin…', '正在拉环…'],
    ['burst', 'Burst', '三连发'], ['semi', 'Semi-auto', '半自动'],
    ['suppressed', 'Suppressed', '消音'], ['unsuppressed', 'Unsuppressed', '未消音'],
  ])('never paints %s weapon status, initially or after caption expiry, in EN and ZH', (kind, en, zhLabel) => {
    for (const zh of [false, true]) {
      const f = fixture(zh);
      f.engine.hud.reloadState = zh ? zhLabel : en;
      if (kind === 'reload') f.engine.player.reload = 1;
      if (kind === 'deploy') f.engine.isDeploying = () => true;
      if (kind === 'cycle') f.engine.isCycling = () => true;
      if (kind === 'prime') f.engine.grenadePrime = { readyAt: 14 };
      if (kind === 'burst' || kind === 'semi') f.engine.player.inventory.primary = { id: 'glock', burst: kind === 'burst' };
      if (kind === 'suppressed' || kind === 'unsuppressed') f.engine.player.inventory.primary = { id: 'm4a1', suppressed: kind === 'suppressed' };
      for (const clock of [10, 10.1, 13]) {
        f.engine.clock = clock;
        const paint = f.draw();
        expect(texts(paint)).not.toContain(zh ? zhLabel : en);
        expect(slots(paint)).toEqual([]);
        expect(texts(paint)).toEqual(expect.arrayContaining(['100 / 200', 'HE×2 · C4']));
      }
    }
  });

  for (const [W, H] of shapes) it(`${W}×${H}: real reload paints only a bounded 2px line with complete ammo and utility values`, () => {
    const f = fixture(); f.hud.setSafeArea(safe);
    const weapon = weaponPanelRect(computeHudLayout(W, H, safe));
    expect(reloadLines(f.draw(W, H), weapon)).toEqual([]);
    f.engine.player.reloadTotal = 4;
    f.engine.hud.reloadState = 'Reloading · 3s';
    let previousWidth = -1;
    for (const remaining of [4, 3, 2, 1, .01]) {
      f.engine.player.reload = remaining;
      const paint = f.draw(W, H), lines = reloadLines(paint, weapon);
      expect(lines).toHaveLength(2);
      const [track, progress] = lines.map(p => p.bounds!);
      expect(track.w).toBeGreaterThan(0);
      expect(track.w).toBeLessThanOrEqual(weapon.w - 16);
      expect(progress).toMatchObject({ x: track.x, y: track.y, h: 2 });
      expect(progress.w).toBeCloseTo(track.w * (1 - remaining / 4));
      expect(progress.w).toBeGreaterThanOrEqual(previousWidth);
      expect(progress.w).toBeLessThanOrEqual(track.w);
      previousWidth = progress.w;
      expect(lines.every(p => p.alpha > 0)).toBe(true);
      expect(texts(paint)).toEqual(expect.arrayContaining(['100 / 200', 'HE×2 · C4', 'M249']));
      expect(texts(paint)).not.toContain(f.engine.hud.reloadState);
      for (const label of paint.filter(p => p.op === 'text' && p.bounds && contains(weapon, p.bounds))) {
        expect(rectsOverlap(track, label.bounds!), label.text).toBe(false);
      }
    }
    f.engine.player.reload = 5; // A stale remaining value must never overdraw the track.
    expect(reloadLines(f.draw(W, H), weapon)[1].bounds!.w).toBe(0);
    f.engine.player.reloadTotal = 0;
    expect(reloadLines(f.draw(W, H), weapon)).toEqual([]);
    f.engine.player.reloadTotal = 4; f.engine.player.reload = 0;
    expect(reloadLines(f.draw(W, H), weapon)).toEqual([]);
  });

  it.each([{ id: 'usp', suppressed: true }, { id: 'glock', burst: true }])('prioritizes missing objective over passive $id mode on the deeply inset phone', item => {
    const f = fixture(); f.engine.touchMode = true; f.hud.setSafeArea(safe);
    f.engine.player.inventory.primary = item;
    f.engine.hud.objective = { text: 'Defend B' };
    const L = computeHudLayout(320, 568, safe);
    expect(matchFeedbackLayout(L, { touch: true, hasBuy: true, objective: true }).objective).toBeNull();
    f.draw(320, 568); f.engine.clock = 13;
    const labels = texts(f.draw(320, 568));
    expect(labels).toContain('Defend B');
    expect(labels).not.toContain('Suppressed'); expect(labels).not.toContain('Burst');
  });

  it('retains critical objective/reload progress and omits stale reload/ammo after death', () => {
    const f = fixture(); f.engine.touchMode = true; f.hud.setSafeArea(safe);
    f.engine.player.reload = 2; f.engine.player.reloadTotal = 4; f.engine.hud.reloadState = 'Reloading · 2s';
    const loading = f.draw(320, 568);
    expect(texts(loading)).not.toContain('Reloading · 2s');
    expect(reloadLines(loading, weaponPanelRect(computeHudLayout(320, 568, safe)))).toHaveLength(2);
    f.engine.player.alive = false; f.engine.hud.health = 0;
    f.engine.hud.center = { kicker: 'RESPAWNING', title: 'Respawn 2s', detail: 'Team DM' };
    const dead = f.draw(320, 568);
    expect(texts(dead)).toContain('Respawn 2s'); expect(texts(dead)).not.toContain('Reloading · 2s');
    expect(texts(dead)).not.toContain('100 / 200'); expect(slots(dead)).toEqual([]);
    expect(reloadLines(dead, weaponPanelRect(computeHudLayout(320, 568, safe)))).toEqual([]);
    f.engine.player.alive = true; f.engine.player.reload = 0; f.engine.hud.center = null;
    f.engine.hud.objectiveAction = { text: 'Defusing B', progress01: .5 };
    expect(texts(f.draw(320, 568))).toContain('Defusing B');
  });
});
