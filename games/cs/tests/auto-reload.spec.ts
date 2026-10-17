import { expect, test } from '@playwright/test';
import { closeAimingFixture, fireAimingShot, openAimingFixture, type AimPaint } from './aiming.fixture';

// Actual 320×568 no-inset weapon envelope, in CSS pixels (not DPR-scaled).
const weapon = { x: 160, y: 480, w: 148, h: 76 };
const reloadLines = (paint: AimPaint[]) => paint.filter(p => p.op === 'fillRect' && p.bounds?.h === 2
  && p.bounds.x >= weapon.x && p.bounds.x + p.bounds.w <= weapon.x + weapon.w
  && p.bounds.y >= weapon.y && p.bounds.y + p.bounds.h <= weapon.y + weapon.h);
function assertQuietWeaponText(paint: AimPaint[]) {
  expect(reloadLines(paint)).toEqual([]);
  const text = paint.filter(p => p.op === 'text').map(p => p.text ?? '');
  expect(text.filter(t => /^[1-5]$/.test(t))).toEqual([]);
  expect(text.filter(t => /Deploy|Reload(?:ing)?\s*[·:]?\s*\d|Burst|Semi-auto|Suppress|换弹(?:中)?\s*[·:]?\s*\d|取出武器|三连发|半自动|消音|Releasing grip|Magazine (?:out|in)|Chambering|Recovering|移手解锁|取出弹匣|装入弹匣|复位上膛|恢复持枪/i.test(t))).toEqual([]);
}

test.describe('CS automatic empty-magazine reload', () => {
  test.setTimeout(120_000);
  test.use({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  test('last real shot starts a timed reload without another input or a HUD progress indicator', async ({ page }, testInfo) => {
    const { errors } = await openAimingFixture(page, { width: 320, height: 568, dpr: 2, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } });
    try {
      const shot = await fireAimingShot(page, { zoom: 0, hit: 'body', kill: false, feedback: 'visual', ammo: 1, reserve: 7 });
      expect(shot.ammoSpent).toBe(1); expect(shot.damage).toBeGreaterThan(0);
      assertQuietWeaponText(shot.paint);
      const advance = (seconds: number) => page.evaluate(seconds => (window as any).__CS_AIM_FIXTURE__.advanceWeapon(seconds), seconds);
      const loading = await advance(.2);
      expect(loading.reloading).toBe(true); expect(loading.ammo).toBe(0); expect(loading.reserve).toBe(7);
      expect(loading.fireHeld).toBe(false); expect(loading.shotPressed).toBe(false);
      expect(loading.paint.some((p: AimPaint) => p.op === 'text' && p.text === loading.reloadState)).toBe(false);
      expect(loading.paint.some((p: AimPaint) => p.op === 'text' && p.text === '0 / 7')).toBe(true);
      assertQuietWeaponText(loading.paint);
      const frozen = await advance(0);
      expect(frozen).toEqual(loading);
      expect(frozen).toMatchObject({ ammo: 0, reserve: 7, reloading: true });
      await page.screenshot({ path: testInfo.outputPath('compact-auto-reload-no-indicator.png') });

      // M4A1 empty reload is 2.2 + .3 seconds; ammunition transfers at 71%,
      // independent of HUD paint or the wall time spent taking screenshots.
      const beforeInsert = await advance(1.4);
      expect(beforeInsert).toMatchObject({ ammo: 0, reserve: 7, reloading: true });
      assertQuietWeaponText(beforeInsert.paint);
      const inserted = await advance(.5);
      expect(inserted).toMatchObject({ ammo: 7, reserve: 0, reloading: true });
      assertQuietWeaponText(inserted.paint);
      expect(inserted.paint.some((p: AimPaint) => p.op === 'text' && p.text === '7 / 0')).toBe(true);
      const finishing = await advance(.3);
      expect(finishing).toMatchObject({ ammo: 7, reserve: 0, reloading: true });
      assertQuietWeaponText(finishing.paint);
      const done = await advance(.3);
      expect(done.reloading).toBe(false); expect(done.ammo).toBe(7); expect(done.reserve).toBe(0);
      expect(done.fireHeld).toBe(false); expect(done.shotPressed).toBe(false);
      expect(reloadLines(done.paint)).toEqual([]); assertQuietWeaponText(done.paint);
      await page.screenshot({ path: testInfo.outputPath('compact-auto-reload-complete.png') });
      await fireAimingShot(page, { zoom: 0, hit: 'body', kill: false, feedback: 'visual', ammo: 1, reserve: 0 });
      const exhausted = await advance(5);
      expect(exhausted).toMatchObject({ ammo: 0, reserve: 0, reloading: false });
      expect(reloadLines(exhausted.paint)).toEqual([]); assertQuietWeaponText(exhausted.paint);
      const switched = await page.evaluate(() => (window as any).__CS_AIM_FIXTURE__.switchToPistol());
      assertQuietWeaponText(switched.paint); expect(reloadLines(switched.paint)).toEqual([]);
      assertQuietWeaponText((await advance(.1)).paint);
      expect(errors).toEqual([]);
    } finally { await closeAimingFixture(page); }
  });
});
