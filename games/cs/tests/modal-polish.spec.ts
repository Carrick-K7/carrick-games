import { expect, test } from '@playwright/test';
import {
  activateModal, closeModalFixture, modalSnapshot, modalSurface, modalWheel, openModalFixture,
  resizeModal, revealModal, stepModal, type ModalRect, type ModalSnapshot, type ModalViewport,
} from './modal-polish.fixture';

const safe = { top: 44, right: 20, bottom: 34, left: 47 };
const zero = { top: 0, right: 0, bottom: 0, left: 0 };
// Two map boots, not a Cartesian product of heavyweight GPU fixtures. Each
// live instance rotates/resizes through three shapes; CPU tests cover the full
// viewport × safe-area × language matrix independently.
const runs = [
  { dpr: 1, shapes: [
    { width: 1280, height: 720, safeArea: zero, zh: false, touch: false },
    { width: 390, height: 844, safeArea: safe, zh: true, touch: true },
    { width: 844, height: 390, safeArea: safe, zh: false, touch: true },
  ] },
  { dpr: 2, shapes: [
    { width: 1100, height: 640, safeArea: zero, zh: true, touch: false },
    { width: 320, height: 568, safeArea: safe, zh: false, touch: true },
    { width: 568, height: 320, safeArea: safe, zh: true, touch: true },
  ] },
];
function overlap(a: ModalRect, b: ModalRect) {
  return a.x < b.x + b.w - .25 && a.x + a.w > b.x + .25
    && a.y < b.y + b.h - .25 && a.y + a.h > b.y + .25;
}
function assertPaint(s: ModalSnapshot) {
  expect(s.fixture).toBe('real-cs-controlled-modal-host');
  expect(s.sceneFramesAfter).toBeGreaterThan(s.sceneFramesBefore); // Fresh real WebGL scene, never cached-label evidence.
  const { width, height, dpr, safeArea } = s.viewport, margin = width >= 940 ? 18 : 12;
  expect(s.backing).toEqual({ width: width * dpr, height: height * dpr });
  const bounds = { x: margin + safeArea.left, y: safeArea.top + 64, right: width - margin - safeArea.right, bottom: height - margin - safeArea.bottom };
  const inside = (r: ModalRect, label: string) => {
    expect(r.x, label).toBeGreaterThanOrEqual(bounds.x - 1);
    expect(r.y, label).toBeGreaterThanOrEqual(bounds.y - 1);
    expect(r.x + r.w, label).toBeLessThanOrEqual(bounds.right + 1);
    expect(r.y + r.h, label).toBeLessThanOrEqual(bounds.bottom + 1);
  };
  const text = s.paint.filter(t => t.visible && t.visible.w > .25 && t.visible.h > .25);
  for (const [i, p] of text.entries()) {
    inside(p.visible!, p.text);
    for (const previous of text.slice(0, i)) expect(overlap(p.visible!, previous.visible!), `${p.text} vs ${previous.text}`).toBe(false);
  }
  for (const r of s.regions.filter(r => r.id)) {
    inside(r, r.id!); expect(r.w, r.id!).toBeGreaterThanOrEqual(44); expect(r.h, r.id!).toBeGreaterThanOrEqual(44);
  }
  const fixed = s.regions.filter(r => r.id && !r.deferred);
  for (const [i, r] of fixed.entries()) for (const other of fixed.slice(0, i)) expect(overlap(r, other), `${r.id} vs ${other.id}`).toBe(false);
}

for (const run of runs) test.describe(`CS modal polish · isolated real release · DPR ${run.dpr}`, () => {
  test.use({ viewport: { width: run.shapes[0].width, height: run.shapes[0].height }, deviceScaleFactor: run.dpr, hasTouch: true });
  test('modal paint, 44px targets, pause ownership and real Dust purchases survive resize', async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const first: ModalViewport = { ...run.shapes[0], dpr: run.dpr };
    const { errors } = await openModalFixture(page, first);
    try {
      for (const shape of run.shapes) await test.step(`${shape.width}x${shape.height} ${shape.zh ? 'ZH' : 'EN'} modal audit`, async () => {
        await page.setViewportSize({ width: shape.width, height: shape.height });
        await resizeModal(page, { ...shape, dpr: run.dpr });
        for (const surface of ['menu', 'settings', 'pause', 'result', 'radio', 'scoreboard', 'map'] as const) {
          let s = await modalSurface(page, surface);
          assertPaint(s);
          if (surface === 'scoreboard') await page.screenshot({ path: testInfo.outputPath(`${shape.width}x${shape.height}-scoreboard-top.png`) });
          if (s.scroll?.max) { s = await modalWheel(page, s.scroll.max); assertPaint(s); }
          if (shape.width === 568) {
            const options: Partial<Record<typeof surface, string[]>> = {
              menu: ['menu-map-fy_snow', 'menu-map-de_dust2', 'menu-mode-elimination', 'menu-mode-tdm', 'menu-limit-30', 'menu-limit-50', 'menu-limit-100', 'menu-team-ct', 'menu-team-t', 'menu-skill-easy', 'menu-skill-normal', 'menu-skill-hard', 'menu-pistol-default', 'menu-pistol-deagle'],
              settings: ['settings-sensitivity', 'settings-scope', 'settings-knife-classic', 'settings-knife-karambit', 'settings-knife-butterfly', 'settings-pistol-default', 'settings-pistol-deagle', 'settings-hit-off', 'settings-hit-visual', 'settings-hit-full', 'settings-quality-high', 'settings-quality-low', 'settings-sound-on', 'settings-sound-off'],
              pause: ['pause-settings', 'pause-scoreboard', 'pause-radio', 'pause-restart', 'pause-menu'],
              result: ['result-menu'],
            };
            const fixed = s.regions.filter(r => r.id && !r.deferred);
            for (const id of options[surface] ?? []) {
              s = await revealModal(page, id);
              const target = s.regions.find(r => r.id === id)!;
              expect(target.w, id).toBeGreaterThanOrEqual(44); expect(target.h, id).toBeGreaterThanOrEqual(44);
              expect(s.regions.filter(r => r.id && !r.deferred)).toEqual(fixed);
              assertPaint(s);
            }
          }
          if (surface === 'radio') {
            expect(s.regions.some(r => r.id?.startsWith('touch-'))).toBe(false);
            s = await revealModal(page, 'radio-choice-8'); assertPaint(s);
          }
          if (surface === 'map') {
            expect(s.radar).toHaveLength(1);
            expect(s.radar[0].w).toBeGreaterThanOrEqual(90);
            if (shape.width === 568) expect(s.radar[0].w).toBe(98);
          }
          if (surface === 'radio' || surface === 'map' || surface === 'scoreboard' || surface === 'result') {
            await testInfo.attach(`${shape.width}x${shape.height}-${surface}-paint`, { body: Buffer.from(JSON.stringify(s)), contentType: 'application/json' });
            await page.screenshot({ path: testInfo.outputPath(`${shape.width}x${shape.height}-${surface}.png`) });
          }
        }
        // Native touch/mouse uses the displayed current hitbox after scrolling,
        // never a legacy coordinate or a direct callback invocation.
        await modalSurface(page, 'pause');
        let s = await activateModal(page, 'pause-scoreboard', shape.touch);
        expect(s.phase).toBe('paused'); expect(s.scoreboard).toBe(true);
        s = await activateModal(page, 'scoreboard-close', shape.touch);
        expect(s.phase).toBe('paused'); expect(s.scoreboard).toBe(false);
        const before = s.clock;
        s = await activateModal(page, 'pause-radio', shape.touch);
        expect(s.radio).toBe('radio1'); expect(s.phase).toBe('paused');
        s = await stepModal(page, .08); expect(s.clock).toBe(before);
        await activateModal(page, 'radio-group-radio3', shape.touch);
        await page.keyboard.press('8'); s = await modalSnapshot(page);
        expect(s.radio).toBeNull(); expect(s.phase).toBe('paused');
        expect(s.notice).toContain(shape.zh ? '击毙敌人' : 'Enemy down');
      });

      // Radio is exclusive input ownership, not an accidental manual pause.
      let s = await modalSurface(page, 'radio'), clock = s.clock;
      const captures = s.captureRequests, ammo = s.ammo;
      await page.mouse.click(2, 2); // Empty backdrop cannot reach weapon fire/capture.
      const radioPanel = s.regions.find(r => r.id === 'radio-close')!;
      await page.mouse.click(radioPanel.x - 20, radioPanel.y + 2); // Blank header, not a choice.
      s = await stepModal(page, .08);
      expect(s.clock).toBeGreaterThan(clock); expect(s.radio).toBe('radio3');
      expect(s.ammo).toBe(ammo); expect(s.fireHeld).toBe(false); expect(s.shotPressed).toBe(false);
      expect(s.captureRequests).toBe(captures);
      await page.keyboard.press('Escape'); s = await modalSnapshot(page);
      expect(s.radio).toBeNull(); expect(s.captureRequests).toBe(captures);
      await modalSurface(page, 'radio');
      s = await activateModal(page, 'radio-choice-8', true);
      expect(s.radio).toBeNull(); expect(s.phase).toBe('active');

      await page.evaluate(() => (window as any).__CS_MODAL_FIXTURE__.dustShop());
      for (const shape of run.shapes) await test.step(`${shape.width}x${shape.height} real Dust shop`, async () => {
        await page.setViewportSize({ width: shape.width, height: shape.height });
        await resizeModal(page, { ...shape, dpr: run.dpr });
        s = await modalSurface(page, 'shop');
        expect(s.canBuy).toBe(true); assertPaint(s);
        const categories = s.regions.filter(r => r.id?.startsWith('shop-category-'));
        expect(categories).toHaveLength(6);
        const scrollMax = s.scroll!.max;
        s = await modalWheel(page, scrollMax);
        expect(s.regions.filter(r => r.id?.startsWith('shop-category-'))).toEqual(categories);
        assertPaint(s);
        await activateModal(page, 'shop-category-rifle', shape.touch);
        s = await modalSnapshot(page);
        if (!shape.zh) expect(s.shop.every(item => !/[\u3400-\u9fff]/u.test(item.detail))).toBe(true);
        const money = s.money, rounds = s.ammo, requests = s.captureRequests;
        await page.mouse.click(2, 2);
        s = await stepModal(page, .02);
        expect(s.buyOpen).toBe(true); expect(s.ammo).toBe(rounds); expect(s.money).toBe(money);
        expect(s.fireHeld).toBe(false); expect(s.shotPressed).toBe(false); expect(s.captureRequests).toBe(requests);
        await page.screenshot({ path: testInfo.outputPath(`${shape.width}x${shape.height}-shop.png`) });
      });
      const last = run.shapes.at(-1)!;
      s = await page.evaluate(() => (window as any).__CS_MODAL_FIXTURE__.shopSetup());
      expect(s.shop.find(item => item.id === 'armor')).toMatchObject({ priceText: '$ 350', disabled: false });
      s = await activateModal(page, 'shop-item-armor', last.touch);
      expect(s.money).toBe(50);
      expect(s.shop.find(item => item.id === 'armor')).toMatchObject({ status: 'owned', disabled: true });
      expect(s.shop.find(item => item.id === 'he')).toMatchObject({ status: 'funds', disabled: true });
      expect(s.paint.some(p => p.visible && p.text.includes(last.zh ? '已购买' : 'Purchased'))).toBe(true);
      s = await revealModal(page, 'shop-item-he');
      const disabled = s.regions.find(r => r.id === 'shop-item-he')!;
      expect(disabled.disabled).toBe(true);
      await page.touchscreen.tap(disabled.x + disabled.w / 2, disabled.y + disabled.h / 2);
      s = await modalSnapshot(page); expect(s.money).toBe(50); expect(s.fireHeld).toBe(false);
      s = await page.evaluate(() => (window as any).__CS_MODAL_FIXTURE__.refusePurchase());
      expect(s.paint.some(p => p.visible && p.text.includes(last.zh ? '无法购买' : 'Cannot buy'))).toBe(true);
      assertPaint(s);
      await page.screenshot({ path: testInfo.outputPath('shop-owned-funds-feedback.png') });
      expect(errors).toEqual([]);
    } finally { await closeModalFixture(page); }
  });
});
