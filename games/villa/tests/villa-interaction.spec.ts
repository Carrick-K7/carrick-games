import { test, expect, devices } from '@playwright/test';
import { registerVillaInteractionTests, mount, tapPaintedUse, dispose } from './villaInteractionCases';

test.use({ ...devices['iPhone 13'], browserName: 'chromium', defaultBrowserType: 'chromium' });

test.describe('villa native interaction / chromium', registerVillaInteractionTests);

test.describe('villa native multi-touch', () => {
  test('Use works while another finger holds the movement stick, without stealing or latching it', async ({ page, context }) => {
    test.setTimeout(90_000); await mount(page); const cdp = await context.newCDPSession(page);
    try {
      const points = await page.evaluate(() => {
        const f = (window as any).villaInput, r = f.g.canvas.getBoundingClientRect();
        return { stick: { x: r.x + 80, y: r.y + r.height - 80, id: 11 }, use: { ...f.use, id: 22 } };
      });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points.stick] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points.stick, points.use] });
      expect(await page.evaluate(() => { const f = (window as any).villaInput; return { calls: f.calls, tap: f.g.state.faucetOn, stick: !!f.g.joystick, look: !!f.g.lookTouch }; }))
        .toEqual({ calls: 1, tap: true, stick: true, look: false });
      // Keep both contacts down: moving the stick must still work during Use.
      const before = await page.evaluate(() => (window as any).villaInput.g.position.z);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...points.stick, y: points.stick.y + 18 }, points.use] });
      await page.evaluate(() => (window as any).villaInput.tick(5));
      expect(await page.evaluate(() => (window as any).villaInput.g.position.z)).toBeGreaterThan(before + .02);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      expect(await page.evaluate(() => { const f = (window as any).villaInput, p = { ...f.g.position }; f.tick(5); return !f.g.joystick && JSON.stringify(p) === JSON.stringify(f.g.position); })).toBe(true);
      await page.evaluate(() => (window as any).villaInput.render()); await tapPaintedUse(page);
      expect(await page.evaluate(() => (window as any).villaInput.g.state.faucetOn)).toBe(false);
    } finally { await cdp.detach(); await dispose(page); }
  });
});
