import { expect, test, type Page } from '@playwright/test';

async function openGuide(page: Page, id: string) {
  await page.goto(`/#/${id}`);
  await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true', { timeout: 45_000 });
  if (id === 'cs') await expect.poll(() => page.evaluate(() => (window as any).__CSX_DEBUG__?.info()?.ready), { timeout: 60_000 }).toBe(true);
  // The shared ? shortcut works in every shell state, including pointer capture.
  await page.keyboard.press('Shift+Slash');
  await expect(page.locator('#helpOverlay')).toBeVisible();
  await expect(page.locator('#overflowMenu')).toBeHidden();
}

test.describe('unified operation guides', () => {
  test.setTimeout(120_000);
  test('all game families drop the same reference panel under the top-right utilities', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    let commonStyle: unknown;
    for (const id of ['snake', 'wordle', 'cs', 'cs-kimi', 'villa']) {
      await openGuide(page, id);
      const guide = page.locator('#helpOverlay'), canvas = page.locator('#gameCanvas');
      const before = await canvas.boundingBox();
      const g = (await guide.boundingBox())!;
      expect(g.x).toBe(708); // 1280 - 12 margin - 560 width
      expect(g.y).toBe(64); // under the 44px utility row
      expect(g.width).toBe(560);
      expect((await page.locator('#keyboardPanel .vkey').first().boundingBox())!.x).toBe(g.x + 17);
      expect(g.y + g.height).toBeLessThanOrEqual(708);
      await expect(page.locator('#helpGameName')).toHaveText(await page.locator('#selectedGameLabel').innerText());
      await expect(guide).toHaveAttribute('role', 'dialog');
      const style = await guide.evaluate(el => {
        const s = getComputedStyle(el), h = getComputedStyle(el.querySelector('h2')!);
        return { font: s.fontFamily, border: s.borderRadius, color: s.color, background: s.backgroundColor, title: h.fontSize };
      });
      if (commonStyle) expect(style).toEqual(commonStyle); else commonStyle = style;
      await page.mouse.move(0, 0);
      await page.screenshot({ path: testInfo.outputPath(`guide-${id}-desktop.png`) });
      const closeBox = await page.locator('#helpCloseBtn').boundingBox();
      await page.locator('#guideBody').evaluate(el => el.scrollTop = el.scrollHeight);
      expect(await page.locator('#helpCloseBtn').boundingBox()).toEqual(closeBox);
      await expect(page.locator('#helpBtn')).toBeInViewport();
      expect(await canvas.boundingBox()).toEqual(before);
      // Guide scrolling/activation must not start gameplay or leak to game keys.
      await page.evaluate(() => {
        (window as any).__guideKeyLeaks = 0;
        window.addEventListener('keydown', () => (window as any).__guideKeyLeaks++);
      });
      await page.locator('#guideBody').focus();
      await page.keyboard.press('ArrowUp'); await page.keyboard.press('Space');
      expect(await page.evaluate(() => (window as any).__guideKeyLeaks)).toBe(0);
      await expect(canvas).toHaveAttribute('data-game-running', 'true');
      await page.locator('#helpCloseBtn').focus(); await page.keyboard.press('Escape');
      await expect(guide).toBeHidden(); await expect(canvas).toBeFocused();
    }
  });

  test('rotation keeps a scrollable guide anchored under the utilities', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 }); await openGuide(page, 'villa');
    const count = await page.locator('#gameCanvas').getAttribute('data-game-prepare-count');
    for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 667, height: 375 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(size);
      await expect(page.locator('#helpOverlay')).toHaveAttribute('role', 'dialog');
      await expect(page.locator('main')).toHaveAttribute('inert', '');
      // Narrow/short screens widen the panel to 720px; roomy desktops cap at 560.
      const wide = size.width > 720 && size.height > 480;
      const width = Math.min(wide ? 560 : 720, size.width - 24);
      // The shell coalesces VisualViewport refits onto the next animation frame.
      // A dialog role is already present before rotation, so it is not a resize signal.
      await expect.poll(async () => {
        const b = (await page.locator('#helpOverlay').boundingBox())!;
        return { x: b.x, y: b.y, width: b.width };
      }).toEqual({ x: size.width - 12 - width, y: 64, width });
      await page.locator('#guideBody').evaluate(el => el.scrollTop = el.scrollHeight);
      await expect(page.locator('#guideNotes p').last()).toBeInViewport();
      await expect(page.locator('#helpCloseBtn')).toBeInViewport();
      await expect(page.locator('#helpBtn')).toBeInViewport();
      await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-prepare-count', count!);
      await page.locator('#helpBtn').focus(); await page.keyboard.press('Tab');
      await expect(page.locator('#overflowBtn')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.locator('#helpCloseBtn')).toBeFocused();
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.locator('#helpOverlay')).toHaveAttribute('role', 'dialog');
    // 3D reading remains protected from accidental firing/cursor capture.
    await expect(page.locator('main')).toHaveAttribute('inert', '');
    await page.locator('#overflowBtn').click();
    await expect(page.locator('#helpOverlay')).toBeHidden();
    await expect(page.locator('#overflowMenu')).toBeVisible();
    await page.locator('#gamePickerBtn').click();
    await page.locator('.game-list-item[data-id="snake"]').click();
    await expect(page.locator('#helpOverlay')).toBeHidden();
  });
});

test('read help mid-game without losing a life, then continue immediately from the keyboard', async ({ page }) => {
  await page.goto('/#/snake');
  const canvas = page.locator('#gameCanvas');
  await expect(canvas).toHaveAttribute('data-game-running', 'true', { timeout: 45_000 });
  await page.keyboard.press('Shift+Slash');
  await expect(page.locator('#helpOverlay')).toBeVisible();
  await expect(canvas).toHaveAttribute('data-game-presentation', 'paused');
  const image = await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await page.waitForTimeout(2500); // Long enough for an unpaused snake to hit the wall.
  expect(await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL())).toBe(image);
  await expect(canvas).not.toHaveAttribute('data-game-result', /.+/);
  await page.locator('#helpCloseBtn').click();
  await expect(canvas).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL())).not.toBe(image);
  await expect(page.locator('#helpOverlay')).toBeHidden();
  await expect(canvas).toHaveAttribute('data-game-prepare-count', '1');
});

test.describe('touch control guide', () => {
  test.setTimeout(120_000);
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test('one top sheet replaces keyboard keys, blocks touch-through, and dismisses safely', async ({ page }, testInfo) => {
    for (const id of ['snake', 'cs', 'villa']) {
      await openGuide(page, id);
      await expect(page.locator('#helpOverlay')).toHaveAttribute('aria-modal', 'true');
      await expect(page.locator('#keyboardPanel')).toBeHidden();
      await expect(page.locator('.guide-touch-rows')).toBeVisible();
      await expect(page.locator('main')).toHaveAttribute('inert', '');
      await expect(page.locator('#guideBackdrop')).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`guide-${id}-touch.png`) });
      await page.locator('#guideBackdrop').tap({ position: { x: 3, y: 3 } });
      await expect(page.locator('#helpOverlay')).toBeHidden();
      await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');
      await expect(page.locator('#gameCanvas')).toBeFocused();
      await expect(page.locator('main')).not.toHaveAttribute('inert', '');
      await page.locator('#helpBtn').tap();
      await expect(page.locator('#helpBtn')).toHaveAttribute('aria-expanded', 'true');
      await page.locator('#helpBtn').tap();
      await expect(page.locator('#helpOverlay')).toBeHidden();
      await expect(page.locator('#gameCanvas')).toBeFocused();
    }
  });
});
