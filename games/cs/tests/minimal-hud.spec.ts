import { expect, test } from '@playwright/test';
import { advanceMinimalHud, closeMinimalHudFixture, openMinimalHudFixture, readMinimalHud, setMinimalHudScenario, type MinimalHudSnapshot } from './minimal-hud.fixture';
import type { AimPaint } from './aiming.fixture';

const shapes = [
  { name: 'desktop', width: 1280, height: 720, touch: false },
  { name: 'phone', width: 390, height: 844, touch: true },
  { name: 'landscape', width: 844, height: 390, touch: true },
];
const boundaryShapes = [
  { name: 'narrow-phone', width: 320, height: 568 },
  { name: 'short-landscape', width: 568, height: 320 },
];
const safeArea = { top: 44, right: 20, bottom: 34, left: 47 };
const buttonIds = ['buy', 'fire', 'jump', 'pause', 'reload', 'switch', 'use'].map(id => `touch-${id}`);
const texts = (s: MinimalHudSnapshot) => s.paint.filter(p => p.op === 'text').map(p => p.text);
const equipment = (s: MinimalHudSnapshot) => s.paint.filter(p => p.op === 'text' && /^[1-5]$/.test(p.text ?? ''));
const optic = (s: MinimalHudSnapshot) => s.paint.filter(p => (p.op === 'fill' && p.evenodd && p.arcs.length) || (p.op === 'stroke' && p.color === '#10151a'))
  .map(({ op, color, alpha, arcs, segments, evenodd }) => ({ op, color, alpha, arcs, segments, evenodd }));
function overlaps(a: NonNullable<AimPaint['bounds']>, b: NonNullable<AimPaint['bounds']>) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function assertNativePaint(s: MinimalHudSnapshot) {
  expect(s.evidence).toBe('controlled-hud-state-real-snow-native-canvas');
  expect(s.map).toBe('fy_snow'); expect(s.worldLoaded).toBe(true); expect(s.renderFrame).toBeGreaterThan(0);
  expect(s.backing).toEqual({ width: s.viewport.width * s.viewport.dpr, height: s.viewport.height * s.viewport.dpr });
  expect(s.paint.some(p => p.op === 'image' && !p.src && p.bounds?.w === s.viewport.width && p.bounds?.h === s.viewport.height)).toBe(true);
  expect(texts(s).some(text => /65\s*K|65\s*击杀/.test(text ?? ''))).toBe(false);
  // No inventory strip, even on initial frames or immediately after a weapon change.
  expect(equipment(s)).toEqual([]);
  expect(texts(s).filter(text => /Deploy|Reload(?:ing)?\s*[·:]?\s*\d|Burst|Semi-auto|Suppress|换弹(?:中)?\s*[·:]?\s*\d|取出武器|部署|三连发|半自动|消音|拉栓|拉环|Cycling bolt|Pulling pin/i.test(text ?? ''))).toEqual([]);
  for (const p of s.paint.filter(p => p.op === 'text' && p.text?.trim())) {
    expect(p.alpha, p.text).toBeGreaterThan(0);
    const b = p.bounds!;
    expect(b.x, p.text).toBeGreaterThanOrEqual(safeArea.left);
    expect(b.y, p.text).toBeGreaterThanOrEqual(safeArea.top);
    expect(b.x + b.w, p.text).toBeLessThanOrEqual(s.viewport.width - safeArea.right);
    expect(b.y + b.h, p.text).toBeLessThanOrEqual(s.viewport.height - safeArea.bottom);
  }
}
function assertTouch(s: MinimalHudSnapshot, touch: boolean) {
  const targets = s.targets.filter(r => r.id !== 'touch-move').sort((a, b) => a.id.localeCompare(b.id));
  if (!touch) { expect(targets).toEqual([]); return; }
  expect(targets.map(r => r.id)).toEqual(buttonIds);
  for (const r of targets) {
    expect(r.w, r.id).toBeGreaterThanOrEqual(44); expect(r.h, r.id).toBeGreaterThanOrEqual(44);
    const circle = s.paint.find(p => p.op === 'fill' && p.alpha > 0 && p.arcs.some(a => Math.abs(a.x - r.x - r.w / 2) < .001 && Math.abs(a.y - r.y - r.h / 2) < .001 && a.r >= 22));
    expect(circle, r.id).toBeDefined();
    expect(circle!.color).not.toMatch(/,\s*0\)$/);
    expect(s.paint.some(p => p.op === 'text' && p.alpha > 0 && p.bounds && p.bounds.x >= r.x && p.bounds.x + p.bounds.w <= r.x + r.w && p.bounds.y >= r.y && p.bounds.y + p.bounds.h <= r.y + r.h), r.id).toBe(true);
  }
}

for (const shape of shapes) for (const dpr of [1, 2]) test.describe(`CS minimal HUD · controlled Snow paint · ${shape.name} · DPR ${dpr}`, () => {
  test.use({ viewport: { width: shape.width, height: shape.height }, deviceScaleFactor: dpr, hasTouch: shape.touch, isMobile: shape.touch });
  test('quiet/busy/high-ammo/death frames preserve feedback, visible controls and game-time-only captions', async ({ page }, testInfo) => {
    test.setTimeout(150_000);
    const viewport = { width: shape.width, height: shape.height, dpr, safeArea };
    const { errors } = await openMinimalHudFixture(page, viewport, shape.touch);
    const screenshot = (state: string) => page.screenshot({ path: testInfo.outputPath(`minimal-hud-${shape.name}-dpr${dpr}-${state}.png`) });
    try {
      const initial = await setMinimalHudScenario(page, 'quiet');
      assertNativePaint(initial); assertTouch(initial, shape.touch);
      if (shape.height >= 480) expect(texts(initial)).toContain(initial.location);
      expect(equipment(initial)).toEqual([]);
      await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-presentation', 'paused');
      const paused = await readMinimalHud(page);
      expect(paused.clock).toBe(initial.clock); expect(paused.paint).toEqual(initial.paint); expect(paused.targets).toEqual(initial.targets);
      expect(paused.renderFrame).toBeGreaterThan(initial.renderFrame);
      const quiet = await advanceMinimalHud(page, 2.3);
      assertNativePaint(quiet); assertTouch(quiet, shape.touch);
      expect(equipment(quiet)).toEqual([]); expect(texts(quiet)).not.toContain(quiet.location);
      expect(quiet.targets).toEqual(initial.targets);
      expect(texts(quiet).filter(t => t === '100')).toHaveLength(2);
      expect(texts(quiet)).toEqual(expect.arrayContaining(['30 / 90', '$ 16000', 'HE×2 · C4', '1:05']));
      expect(quiet.paint.filter(p => p.op === 'image' && p.src?.includes('/assets/ui/weapons/'))).toEqual([]);
      await screenshot('quiet');
      const stillQuiet = await readMinimalHud(page);
      expect(stillQuiet.clock).toBe(quiet.clock); expect(equipment(stillQuiet)).toEqual([]);

      const busy = await setMinimalHudScenario(page, 'busy', true);
      assertNativePaint(busy); assertTouch(busy, shape.touch);
      expect(texts(busy)).toContain('拆除 B');
      expect(texts(busy).some(t => /^换弹(?:中)?\s*·/.test(t ?? ''))).toBe(false);
      expect(texts(busy)).toContain('HE×2 · C4');
      await screenshot('busy-zh');

      const switched = await setMinimalHudScenario(page, 'high-ammo');
      assertNativePaint(switched); assertTouch(switched, shape.touch);
      expect(texts(switched)).toEqual(expect.arrayContaining(['M249', '100 / 200', 'HE×2 · C4']));
      const justSwitched = await advanceMinimalHud(page, .1);
      assertNativePaint(justSwitched);
      expect(justSwitched.targets).toEqual(initial.targets);
      const high = await advanceMinimalHud(page, 2.2);
      assertNativePaint(high); assertTouch(high, shape.touch);
      expect(texts(high)).toEqual(expect.arrayContaining(['100 / 200', 'M249', '$ 16000', 'HE×2 · C4']));
      expect(texts(high).filter(t => t === '100')).toHaveLength(2);
      const body = high.paint.filter(p => p.op === 'text' && ['100', '100 / 200', 'M249', '$ 16000', 'HE×2 · C4'].includes(p.text ?? ''));
      for (let i = 0; i < body.length; i++) for (let j = i + 1; j < body.length; j++) expect(overlaps(body[i].bounds!, body[j].bounds!), `${body[i].text} vs ${body[j].text}`).toBe(false);
      expect(high.targets).toEqual(initial.targets);
      await screenshot('high-ammo');

      const dead = await setMinimalHudScenario(page, 'death');
      assertNativePaint(dead); assertTouch(dead, shape.touch);
      expect(dead.alive).toBe(false); expect(texts(dead)).toContain('Respawn 2s');
      expect(texts(dead).some(t => t?.startsWith('Reload ·'))).toBe(false);
      expect(texts(dead)).not.toContain('30 / 90'); expect(equipment(dead)).toEqual([]);
      await screenshot('death');

      const scoped = await setMinimalHudScenario(page, 'scope');
      assertNativePaint(scoped); assertTouch(scoped, shape.touch);
      expect(scoped.scope).toBe(true); expect(texts(scoped)).toContain(scoped.scopeLabel);
      const geometry = optic(scoped);
      expect(geometry).toHaveLength(2);
      expect(geometry[0].arcs).toHaveLength(1);
      expect(geometry[0].arcs[0].x).toBe(shape.width / 2);
      expect(geometry[0].arcs[0].y).toBe(shape.height / 2);
      // Native transform/radius reconstruction differs at ~1e-14, not a pixel.
      expect(geometry[0].arcs[0].r).toBeCloseTo(Math.min(shape.width, shape.height) * .42, 10);
      const frozenScope = await readMinimalHud(page);
      expect(frozenScope.clock).toBe(scoped.clock); expect(texts(frozenScope)).toContain(scoped.scopeLabel);
      const agedScope = await advanceMinimalHud(page, 2.3);
      expect(texts(agedScope)).not.toContain(scoped.scopeLabel); expect(equipment(agedScope)).toEqual([]);
      expect(optic(agedScope)).toEqual(geometry); expect(agedScope.targets).toEqual(scoped.targets);
      const unscoped: MinimalHudSnapshot = await page.evaluate(() => (window as any).__CS_MINIMAL_HUD_FIXTURE__.scopeOff());
      expect(optic(unscoped)).toEqual([]); expect(texts(unscoped)).not.toContain(scoped.scopeLabel);
      expect(errors).toEqual([]);
    } finally { await closeMinimalHudFixture(page); }
  });
});

// These two boundary cases specifically audit native glyphs in the narrowest
// persistent body lanes; the six full-state/caption cases above stay unchanged.
for (const shape of boundaryShapes) test.describe(`CS minimal HUD · deep-safe boundary · ${shape.name} · DPR 2`, () => {
  test.use({ viewport: { width: shape.width, height: shape.height }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  test('native high-ammo and utility text remain complete and disjoint in EN/ZH', async ({ page }, testInfo) => {
    test.setTimeout(150_000);
    const viewport = { width: shape.width, height: shape.height, dpr: 2, safeArea };
    const { errors } = await openMinimalHudFixture(page, viewport, true);
    try {
      for (const zh of [false, true]) {
        const initial = await setMinimalHudScenario(page, 'high-ammo', zh);
        assertNativePaint(initial); assertTouch(initial, true);
        await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-presentation', 'paused');
        const high = await advanceMinimalHud(page, 2.3);
        assertNativePaint(high); assertTouch(high, true);
        expect(high.targets).toEqual(initial.targets);
        expect(equipment(high)).toEqual([]);
        expect(texts(high)).toEqual(expect.arrayContaining(['100 / 200', 'M249', '$ 16000', 'HE×2 · C4']));
        expect(texts(high).filter(t => t === '100')).toHaveLength(2);
        const body = high.paint.filter(p => p.op === 'text' && ['100', '100 / 200', 'M249', '$ 16000', 'HE×2 · C4'].includes(p.text ?? ''));
        expect(body).toHaveLength(6);
        for (let i = 0; i < body.length; i++) for (let j = i + 1; j < body.length; j++) {
          expect(overlaps(body[i].bounds!, body[j].bounds!), `${body[i].text} vs ${body[j].text}`).toBe(false);
        }
        for (const p of body) for (const target of high.targets) {
          expect(overlaps(p.bounds!, target), `${p.text} vs ${target.id}`).toBe(false);
        }
        expect(high.paint.filter(p => p.op === 'image' && p.src?.includes('/assets/ui/weapons/'))).toEqual([]);
        await page.screenshot({ path: testInfo.outputPath(`minimal-hud-${shape.name}-dpr2-high-ammo-${zh ? 'zh' : 'en'}.png`) });
        const paused = await readMinimalHud(page);
        expect(paused.clock).toBe(high.clock); expect(paused.paint).toEqual(high.paint); expect(paused.targets).toEqual(high.targets);
      }
      expect(errors).toEqual([]);
    } finally { await closeMinimalHudFixture(page); }
  });
});
