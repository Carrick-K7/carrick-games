import { describe, expect, it } from 'vitest';
import { CsHud } from '../src/csHud';
import { aimGeometry, buttonHit, computeHudLayout, computeTouchControls, healthPanelRect, rectsOverlap, weaponPanelRect } from '../src/csHudLayout';

type Point = { op: string; x: number; y: number; radius?: number };
function recorder() {
  const operations: any[] = [], stack: any[] = [];
  let path: Point[] = [];
  const target: any = { globalAlpha: 1, lineWidth: 1, lineCap: 'butt', strokeStyle: '', fillStyle: '', font: '12px sans-serif', textAlign: 'left', textBaseline: 'alphabetic' };
  const ctx: any = new Proxy(target, { get: (t, key) => t[key] ?? (() => undefined) });
  Object.assign(target, {
    save: () => stack.push(Object.fromEntries(['globalAlpha', 'lineWidth', 'lineCap', 'strokeStyle', 'fillStyle', 'font', 'textAlign', 'textBaseline'].map(k => [k, ctx[k]]))),
    restore: () => Object.assign(target, stack.pop()),
    beginPath: () => { path = []; },
    moveTo: (x: number, y: number) => path.push({ op: 'move', x, y }),
    lineTo: (x: number, y: number) => path.push({ op: 'line', x, y }),
    arc: (x: number, y: number, radius: number) => path.push({ op: 'arc', x, y, radius }),
    rect: (x: number, y: number) => path.push({ op: 'rect', x, y }),
    roundRect: (x: number, y: number) => path.push({ op: 'roundRect', x, y }),
    stroke: () => operations.push({ kind: 'stroke', path: [...path], color: ctx.strokeStyle, alpha: ctx.globalAlpha, width: ctx.lineWidth, cap: ctx.lineCap }),
    fill: (rule?: string) => operations.push({ kind: 'fill', path: [...path], rule, color: ctx.fillStyle, alpha: ctx.globalAlpha }),
    measureText: (text: string) => ({ width: Array.from(text).length * Number(ctx.font.match(/([\d.]+)px/)?.[1] || 12) * .55 }),
    fillText: (text: string, x: number, y: number) => {
      const width = ctx.measureText(text).width;
      const height = Number(ctx.font.match(/([\d.]+)px/)?.[1] || 12);
      operations.push({ kind: 'text', text, x, y, alpha: ctx.globalAlpha, color: ctx.fillStyle,
        bounds: { x: x - (ctx.textAlign === 'center' ? width / 2 : ctx.textAlign === 'right' ? width : 0), y: y - height / 2, w: width, h: height } });
    },
  });
  return { ctx: ctx as CanvasRenderingContext2D, operations };
}
function fixture(operations: any[], overrides: Record<string, unknown> = {}) {
  const engine: any = {
    isZh: () => false, phase: 'active', player: { alive: true }, touchMode: false,
    drawRadarContent: () => operations.push({ kind: 'radar' }),
    touchMove: { x: 0, y: 0 }, hud: {
      health: 100, healthPct: 100, healthLow: false, armor: 100, killCount: 0, grenadeCount: 0,
      weaponName: 'G3SG1', ammoText: '20', reserveText: '60', reloadState: '', slots: [],
      crosshairHidden: false, crosshairGap: 7, scope: false, scopeLabel: '2× zoom',
      hitOpacity: 1, hitHead: false, hitKind: 'body', hitConfirmation: '', damageOpacity: 0,
      location: 'CT spawn', roundLabel: 'Round 1', timerText: '1:05', timerUrgent: false,
      ctScore: 0, tScore: 0, alivePips: { ct: ['alive'], t: ['alive'] },
      objective: null, objectiveAction: null, money: null, center: null, notice: null, pickup: null,
      scoreboardOpen: false, matchEnd: null, radio: null, killfeed: [], ...overrides,
    },
  };
  return { engine, hud: new CsHud(engine) };
}
function hitStroke(ops: any[]) {
  return ops.find(op => op.kind === 'stroke' && op.width === 2 && op.cap === 'round'
    && op.path.length === 8 && op.path.every((p: Point) => p.op === 'move' || p.op === 'line'));
}

describe('CS aiming paint geometry', () => {
  for (const [W, H] of [[320, 568], [390, 844], [568, 320], [844, 390], [1280, 720], [431, 719]]) {
    for (const scoped of [false, true]) for (const kind of ['body', 'head', 'kill']) {
      it(`${W}x${H} ${scoped ? 'scope' : 'hip'} ${kind}: centered symmetric marker independent of font and safe area`, () => {
        const { ctx, operations } = recorder();
        const { hud } = fixture(operations, { scope: scoped, hitKind: kind, hitHead: kind !== 'body', hitOpacity: .6 });
        hud.setSafeArea({ top: 44, left: 47, right: 20, bottom: 34 });
        hud.draw(ctx, W, H);
        const marker = hitStroke(operations);
        expect(marker).toBeTruthy(); expect(marker.alpha).toBe(.6);
        const xs = marker.path.map((p: Point) => p.x), ys = marker.path.map((p: Point) => p.y);
        expect((Math.min(...xs) + Math.max(...xs)) / 2).toBe(W / 2);
        expect((Math.min(...ys) + Math.max(...ys)) / 2).toBe(H / 2);
        expect(Math.max(...xs) - W / 2).toBe(kind === 'kill' ? 12 : 10);
        expect(marker.path.filter((p: Point) => p.op === 'move').every((p: Point) => Math.abs(p.x - W / 2) === 4 && Math.abs(p.y - H / 2) === 4)).toBe(true);
        expect(operations.filter(op => op.kind === 'text' && op.text === '×')).toHaveLength(0);
        const aim = aimGeometry(W, H);
        if (scoped) {
          const mask = operations.find(op => op.kind === 'fill' && op.rule === 'evenodd');
          expect(mask.path.find((p: Point) => p.op === 'arc')).toMatchObject({ x: W / 2, y: H / 2, radius: aim.scopeRadius });
        } else {
          const crosshair = operations.find(op => op.kind === 'stroke' && op.color === 'rgba(255,255,255,.9)');
          expect(crosshair.path.every((p: Point) => p.x === W / 2 || p.y === H / 2)).toBe(true);
        }
      });
    }
  }

  it('places the scope mask/lines beneath radar, score and objective instead of blackening them', () => {
    const { ctx, operations } = recorder();
    const { hud } = fixture(operations, { scope: true, objective: { text: 'Defend A / B' }, hitKind: 'kill', hitConfirmation: 'KILL' });
    hud.draw(ctx, 1280, 720);
    const maskIndex = operations.findIndex(op => op.kind === 'fill' && op.rule === 'evenodd');
    const scopeLines = operations.findIndex(op => op.kind === 'stroke' && op.color === '#10151a');
    expect(maskIndex).toBeGreaterThanOrEqual(0); expect(scopeLines).toBeGreaterThan(maskIndex);
    for (const index of [operations.findIndex(op => op.kind === 'radar'), operations.findIndex(op => op.text === '1:05'), operations.findIndex(op => op.text === 'Defend A / B')]) {
      expect(index).toBeGreaterThan(scopeLines);
    }
  });

  it('keeps objective progress inside the weapon panel if an extreme window has no free lane', () => {
    const { ctx, operations } = recorder();
    const { hud, engine } = fixture(operations, { money: '$800', objectiveAction: { text: 'Defusing B', progress01: .5 } });
    const safe = { top: 44, right: 20, bottom: 34, left: 47 };
    engine.touchMode = true; hud.setSafeArea(safe); hud.draw(ctx, 320, 480);
    const panel = weaponPanelRect(computeHudLayout(320, 480, safe));
    const label = operations.find(op => op.kind === 'text' && op.text === 'Defusing B');
    expect(label).toBeTruthy();
    expect(label.bounds.x).toBeGreaterThanOrEqual(panel.x);
    expect(label.bounds.x + label.bounds.w).toBeLessThanOrEqual(panel.x + panel.w);
    expect(label.bounds.y).toBeGreaterThanOrEqual(panel.y);
    expect(label.bounds.y + label.bounds.h).toBeLessThanOrEqual(panel.y + panel.h);
    expect(hitStroke(operations)).toBeTruthy();
  });

  it('preserves the caller canvas alpha/stroke state, and draws nothing when feedback is off', () => {
    const { ctx, operations } = recorder(), { hud, engine } = fixture(operations);
    ctx.globalAlpha = .4; ctx.lineWidth = 7; ctx.lineCap = 'square'; ctx.strokeStyle = '#123456';
    (hud as any).drawHitMarker(ctx, 844, 390);
    expect(ctx.globalAlpha).toBe(.4); expect(ctx.lineWidth).toBe(7); expect(ctx.lineCap).toBe('square'); expect(ctx.strokeStyle).toBe('#123456');
    operations.length = 0; engine.hud.hitOpacity = 0;
    (hud as any).drawHitMarker(ctx, 844, 390); expect(operations).toEqual([]);
  });

  for (const [W, H] of [[320, 568], [390, 844], [568, 320], [844, 390]]) {
    it(`${W}x${H}: painted confirmation and scope caption stay clear of controls, ammo and aim`, () => {
      const { ctx, operations } = recorder();
      const { hud, engine } = fixture(operations, { scope: true, hitKind: 'kill', hitHead: true, hitConfirmation: 'HEADSHOT KILL' });
      engine.touchMode = true;
      hud.draw(ctx, W, H);
      const L = computeHudLayout(W, H), controls = computeTouchControls(L);
      const blocked = [aimGeometry(W, H).clearance, healthPanelRect(L), weaponPanelRect(L), controls.joystick.hit, ...controls.buttons.map(buttonHit)];
      const captions = operations.filter(op => op.kind === 'text' && (op.text.startsWith('HEAD') || op.text === '2× zoom'));
      expect(captions).toHaveLength(2);
      for (const caption of captions) {
        expect(caption.bounds.x).toBeGreaterThanOrEqual(L.left);
        expect(caption.bounds.y).toBeGreaterThanOrEqual(L.contentTop);
        expect(caption.bounds.x + caption.bounds.w).toBeLessThanOrEqual(L.right);
        expect(caption.bounds.y + caption.bounds.h).toBeLessThanOrEqual(L.bottom);
        for (const obstacle of blocked) expect(rectsOverlap(caption.bounds, obstacle)).toBe(false);
      }
    });
  }
});
