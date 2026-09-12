import { expect, type Page } from '@playwright/test';

// Observe painted labels through the real canvas transform, rather than
// duplicating the HUD's hit-test geometry or reaching into game instances.
export async function observeLabels(page: Page) {
  await page.addInitScript(() => {
    const labels: Record<string, { x: number; y: number; at: number }> = {};
    (window as any).__paintedHudLabels = labels;
    const fill = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
      if (this.canvas.id === 'gameCanvas') {
        const m = this.getTransform(), r = this.canvas.getBoundingClientRect();
        labels[text] = { x: r.x + (m.a * x + m.c * y + m.e) * r.width / this.canvas.width,
          y: r.y + (m.b * x + m.d * y + m.f) * r.height / this.canvas.height, at: performance.now() };
      }
      if (maxWidth === undefined) fill.call(this, text, x, y);
      else fill.call(this, text, x, y, maxWidth);
    };
  });
}
export async function painted(page: Page, pattern: RegExp) {
  return page.evaluate(source => {
    const re = new RegExp(source);
    return Object.entries((window as any).__paintedHudLabels ?? {})
      .filter(([text, p]: [string, any]) => re.test(text) && performance.now() - p.at < 1000
        && p.x >= 0 && p.x < innerWidth && p.y >= 58 && p.y < innerHeight - 12)
      .map(([, p]) => p as { x: number; y: number })[0] ?? null;
  }, pattern.source);
}
export async function tapLabel(page: Page, pattern: RegExp) {
  await expect.poll(() => painted(page, pattern)).not.toBeNull();
  const p = (await painted(page, pattern))!;
  await page.touchscreen.tap(p.x + 8, p.y);
}
export async function cancelTap(page: Page, x: number, y: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await cdp.detach();
}
export async function swipe(page: Page, x: number, fromY: number, toY: number) {
  const cdp = await page.context().newCDPSession(page);
  const point = (y: number) => [{ x, y, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(fromY) });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove', touchPoints: point(fromY + (toY - fromY) * i / 8),
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
