import { expect, test } from '@playwright/test';
import {
  activateModal, closeModalFixture, modalSnapshot, modalSurface, openModalFixture,
  stepModal, type ModalSnapshot,
} from './modal-polish.fixture';

const basic = ['settings-close', 'settings-sensitivity', 'settings-sound-on', 'settings-sound-off',
  'settings-quality-high', 'settings-quality-low', 'settings-more', 'settings-done'];
const ids = (s: ModalSnapshot) => s.regions.flatMap(r => r.id ? [r.id] : []).sort();
const assertSimple = (s: ModalSnapshot, match = true) => {
  expect(ids(s)).toEqual([...basic, ...(match ? ['settings-menu'] : [])].sort());
  for (const r of s.regions.filter(r => r.id)) {
    expect(r.w, r.id!).toBeGreaterThanOrEqual(44); expect(r.h, r.id!).toBeGreaterThanOrEqual(44);
  }
};

test.describe('CS simple settings native input', () => {
  test.use({ viewport: { width: 1280, height: 720 }, hasTouch: true });
  test('Escape, touch Pause, collapsed controls and child panels preserve the same live match', async ({ page }, testInfo) => {
    test.setTimeout(150_000);
    const { errors } = await openModalFixture(page, { width: 1280, height: 720, dpr: 1,
      zh: false, touch: true, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } });
    try {
      let s = await modalSurface(page, 'active');
      const ammo = s.ammo, captures = s.captureRequests;
      await page.keyboard.down('Escape'); s = await modalSnapshot(page);
      expect(s.phase).toBe('paused'); assertSimple(s);
      await page.screenshot({ path: testInfo.outputPath('escape-basic-settings.png') });
      const clock = s.clock;
      await page.keyboard.down('Escape'); await page.keyboard.up('Escape');
      s = await stepModal(page, .08);
      expect(s.phase).toBe('paused'); expect(s.clock).toBe(clock);
      expect(s.captureRequests).toBe(captures);
      await page.keyboard.press('Escape'); s = await modalSnapshot(page);
      expect(s.phase).toBe('active'); expect(s.captureRequests).toBe(captures); expect(s.ammo).toBe(ammo);

      s = await activateModal(page, 'touch-pause', true); assertSimple(s);
      expect(s.phase).toBe('paused');
      for (const child of ['scoreboard', 'radio'] as const) {
        s = await activateModal(page, `settings-${child}`, true);
        expect(s.phase).toBe('paused'); expect(ids(s)).toContain(`${child}-close`);
        expect(ids(s).some(id => id.startsWith('settings-'))).toBe(false);
        const before = s.clock;
        s = await stepModal(page, .08); expect(s.clock).toBe(before);
        await page.keyboard.press('Escape'); s = await modalSnapshot(page);
        expect(s.phase).toBe('paused'); assertSimple(s);
        expect(s.captureRequests).toBe(captures);
      }

      // Fold changes must cancel pending touches even on a basic choice that
      // returns to the identical rectangle. Do NOT wheel/reveal while held:
      // that would independently cancel input and hide a broken fold revision.
      s = await activateModal(page, 'settings-more');
      const sound = s.regions.find(r => r.id === `settings-sound-${s.soundEnabled ? 'off' : 'on'}`)!;
      const soundBefore = s.soundEnabled;
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [
        { x: sound.x + sound.w / 2, y: sound.y + sound.h / 2, id: 1 },
      ] });
      for (let fold = 0; fold < 2; fold++) {
        const more = s.regions.find(r => r.id === 'settings-more')!;
        await page.mouse.click(more.x + more.w / 2, more.y + more.h / 2);
        s = await modalSnapshot(page);
        if (fold === 0) assertSimple(s);
      }
      expect(s.regions.find(r => r.id === sound.id)).toEqual(sound);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
      s = await modalSnapshot(page);
      expect(s.soundEnabled).toBe(soundBefore);
      expect(s.phase).toBe('paused'); expect(s.fireHeld).toBe(false); expect(s.ammo).toBe(ammo);
      expect(s.captureRequests).toBe(captures);

      s = await activateModal(page, 'settings-done', true);
      expect(s.phase).toBe('active');
      s = await modalSurface(page, 'settings'); assertSimple(s, false);
      const menuCaptures = s.captureRequests;
      s = await activateModal(page, 'settings-done', true);
      expect(s.phase).toBe('menu'); expect(ids(s)).toContain('menu-start');
      expect(s.captureRequests).toBe(menuCaptures);
      expect(errors).toEqual([]);
    } finally { await closeModalFixture(page); }
  });
});
