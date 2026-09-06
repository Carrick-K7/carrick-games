import { expect, test, type Page } from '@playwright/test';

async function openGuide(page: Page, id: string) {
  await page.goto(`/#/${id}`);
  await expect(page.locator('#startOverlay')).toBeVisible({ timeout: 45_000 });
  await page.locator('#overflowBtn').click();
  await page.locator('#helpBtn').click();
  await expect(page.locator('#helpOverlay')).toBeVisible();
  await expect(page.locator('#overflowMenu')).toBeHidden();
}

test.describe('unified operation guides', () => {
  test.setTimeout(120_000);
  test('all game families use the same reference style, in one position without refitting', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    let commonStyle: unknown;
    for (const id of ['snake', 'wordle', 'cs', 'cs-kimi', 'villa']) {
      await openGuide(page, id);
      const guide = page.locator('#helpOverlay'), canvas = page.locator('#gameCanvas');
      const before = await canvas.boundingBox();
      const g = (await guide.boundingBox())!;
      expect(g.x).toBe(12);
      expect(g.y).toBeGreaterThanOrEqual(68);
      expect(g.width).toBe(560);
      expect((await page.locator('#keyboardPanel .vkey').first().boundingBox())!.x).toBe(g.x + 17);
      const bottom = 720 - g.y - g.height;
      expect(bottom).toBe(['cs', 'cs-kimi', 'villa'].includes(id) ? 160 : 12);
      await expect(page.locator('#helpGameName')).toHaveText(await page.locator('#selectedGameLabel').innerText());
      await expect(guide).toHaveAttribute('role', 'region');
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
      await expect(page.locator('#helpReturnBtn')).toBeInViewport();
      expect(await canvas.boundingBox()).toEqual(before);
      // Guide scrolling/activation must not start gameplay or leak to game keys.
      await page.evaluate(() => {
        (window as any).__guideKeyLeaks = 0;
        window.addEventListener('keydown', () => (window as any).__guideKeyLeaks++);
      });
      await page.locator('#guideBody').focus();
      await page.keyboard.press('ArrowUp'); await page.keyboard.press('Space');
      expect(await page.evaluate(() => (window as any).__guideKeyLeaks)).toBe(0);
      await expect(page.locator('#startOverlay')).toBeVisible();
      await page.locator('#helpCloseBtn').focus(); await page.keyboard.press('Escape');
      await expect(guide).toBeHidden(); await expect(page.locator('#overflowBtn')).toBeFocused();
    }
  });

  test('rotation keeps a scrollable guide and changes to a protected bottom sheet', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 }); await openGuide(page, 'villa');
    const count = await page.locator('#gameCanvas').getAttribute('data-game-prepare-count');
    for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 667, height: 375 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(size);
      await expect(page.locator('#helpOverlay')).toHaveAttribute('role', 'dialog');
      await expect(page.locator('main')).toHaveAttribute('inert', '');
      const b = (await page.locator('#helpOverlay').boundingBox())!;
      expect(b.x).toBe(Math.max(0, (size.width - 720) / 2)); expect(b.width).toBe(Math.min(720, size.width));
      expect(b.y).toBeGreaterThanOrEqual(75); expect(b.y + b.height).toBe(size.height);
      await page.locator('#guideBody').evaluate(el => el.scrollTop = el.scrollHeight);
      await expect(page.locator('#guideNotes p').last()).toBeInViewport();
      await expect(page.locator('#helpCloseBtn')).toBeInViewport();
      await expect(page.locator('#helpReturnBtn')).toBeInViewport();
      await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-prepare-count', count!);
      await page.locator('#helpReturnBtn').focus(); await page.keyboard.press('Tab');
      await expect(page.locator('#helpCloseBtn')).toBeFocused();
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.locator('#helpOverlay')).toHaveAttribute('role', 'region');
    // 3D reading remains protected from accidental firing/cursor capture.
    await expect(page.locator('main')).toHaveAttribute('inert', '');
    await page.keyboard.press('Control+k');
    await expect(page.locator('#helpOverlay')).toBeHidden();
    await page.locator('.game-list-item[data-id="snake"]').click();
    await expect(page.locator('#helpOverlay')).toBeHidden();
  });
});

test.describe('touch control guide', () => {
  test.setTimeout(120_000);
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test('one bottom sheet replaces keyboard keys, blocks touch-through, and dismisses safely', async ({ page }, testInfo) => {
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
      await expect(page.locator('#startOverlay')).toBeVisible();
      await expect(page.locator('main')).not.toHaveAttribute('inert', '');
    }
  });
});
