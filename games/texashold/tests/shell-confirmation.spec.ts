import { test, expect, type Page } from '@playwright/test';

// Normal shell, real RAF and native browser input; no private game mutation.
test.use({ hasTouch: true });
const allIn = (page: Page) => page.locator('[data-texashold-actions] [data-action="all-in"]');
const info = (page: Page) => page.evaluate(() => (window as any).__GAME_VIEWPORT_DEBUG__.info());
async function ready(page: Page) {
  await page.goto('/#/texashold');
  await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');
  await expect(allIn(page)).toBeEnabled({ timeout: 15000 });
  return (await info(page)).chips[0];
}

test('native double click does not confirm and opening the shell menu cancels', async ({ page }) => {
  const chips = await ready(page);
  await allIn(page).dblclick();
  await expect.poll(async () => (await info(page)).allInConfirmation).toBe(true);
  expect((await info(page)).chips[0]).toBe(chips);
  await page.keyboard.press('?');
  await expect(page.locator('[data-texashold-actions]')).toBeHidden();
  expect((await info(page)).allInConfirmation).toBe(false);
  expect((await info(page)).chips[0]).toBe(chips);
  await page.keyboard.press('Escape');
  await expect(allIn(page)).toBeVisible();
  expect((await info(page)).allInConfirmation).toBe(false);
});

test('native held Enter cannot confirm; separate Enter does', async ({ page }) => {
  const chips = await ready(page);
  await allIn(page).focus();
  await page.keyboard.down('Enter');
  await page.keyboard.down('Enter');
  expect((await info(page)).allInConfirmation).toBe(true);
  expect((await info(page)).chips[0]).toBe(chips);
  await page.keyboard.up('Enter');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await info(page)).allInConfirmation).toBe(false);
  await expect.poll(async () => (await info(page)).chips[0]).toBe(0);
});

test('native global A then Enter confirms once with the shell running', async ({ page }) => {
  const chips = await ready(page);
  await page.locator('#gameCanvas').focus();
  await page.keyboard.down('a');
  await page.keyboard.down('a');
  expect((await info(page)).allInConfirmation).toBe(true);
  expect((await info(page)).chips[0]).toBe(chips);
  await page.keyboard.up('a');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await info(page)).allInConfirmation).toBe(false);
  await expect.poll(async () => (await info(page)).chips[0]).toBe(0);
});

test('native rapid touch taps cannot turn arming into confirmation', async ({ page }) => {
  const chips = await ready(page);
  const rect = await allIn(page).boundingBox();
  if (!rect) throw new Error('Missing all-in target');
  await page.touchscreen.tap(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.touchscreen.tap(rect.x + rect.width / 2, rect.y + rect.height / 2);
  expect((await info(page)).allInConfirmation).toBe(true);
  expect((await info(page)).chips[0]).toBe(chips);
});
