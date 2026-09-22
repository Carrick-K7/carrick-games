import { expect, test } from '@playwright/test';
import { closeAimingFixture, fireAimingShot, openAimingFixture } from './aiming.fixture';

test.describe('CS automatic empty-magazine reload', () => {
  test.setTimeout(120_000);
  test.use({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  test('last real shot starts a timed reload without another input and the compact HUD shows it', async ({ page }, testInfo) => {
    const { errors } = await openAimingFixture(page, { width: 320, height: 568, dpr: 2, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } });
    try {
      const shot = await fireAimingShot(page, { zoom: 0, hit: 'body', kill: false, feedback: 'visual', ammo: 1, reserve: 7 });
      expect(shot.ammoSpent).toBe(1); expect(shot.damage).toBeGreaterThan(0);
      const advance = (seconds: number) => page.evaluate(seconds => (window as any).__CS_AIM_FIXTURE__.advanceWeapon(seconds), seconds);
      const loading = await advance(.2);
      expect(loading.reloading).toBe(true); expect(loading.ammo).toBe(0); expect(loading.reserve).toBe(7);
      expect(loading.fireHeld).toBe(false); expect(loading.shotPressed).toBe(false);
      expect(loading.paint.some((p: any) => p.op === 'text' && p.text === loading.reloadState)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath('compact-auto-reload-progress.png') });
      const done = await advance(4);
      expect(done.reloading).toBe(false); expect(done.ammo).toBe(7); expect(done.reserve).toBe(0);
      expect(done.fireHeld).toBe(false); expect(done.shotPressed).toBe(false);
      await page.screenshot({ path: testInfo.outputPath('compact-auto-reload-complete.png') });
      await fireAimingShot(page, { zoom: 0, hit: 'body', kill: false, feedback: 'visual', ammo: 1, reserve: 0 });
      const exhausted = await advance(5);
      expect(exhausted).toMatchObject({ ammo: 0, reserve: 0, reloading: false });
      expect(errors).toEqual([]);
    } finally { await closeAimingFixture(page); }
  });
});
