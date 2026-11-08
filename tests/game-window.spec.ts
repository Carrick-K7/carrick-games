import { expect, test, type Page } from '@playwright/test';
import { GAMES } from './support/catalog';
import { builtCatalog } from './support/releases';
import { selectFixedSwitchGames, selectResponsiveWindowGames } from './support/shell-fixtures';
import { canvasViewportIssues } from './support/viewport-contract';

const responsiveGames = selectResponsiveWindowGames(GAMES);
const sizes = [
  { width: 1280, height: 720 }, { width: 1920, height: 1080 }, { width: 2560, height: 1080 },
  { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 320, height: 568 },
];
async function metrics(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#gameCanvas')!, root = document.getElementById('gameApp')!;
    const c = canvas.getBoundingClientRect(), r = root.getBoundingClientRect();
    return { canvas: { x: c.x, y: c.y, width: c.width, height: c.height }, root: { x: r.x, y: r.y, width: r.width, height: r.height },
      pixels: canvas.width * canvas.height,
      viewport: {
        mode: canvas.getAttribute('data-viewport-mode'),
        logicalWidth: Number(canvas.dataset.logicalWidth), logicalHeight: Number(canvas.dataset.logicalHeight),
        backingWidth: canvas.width, backingHeight: canvas.height, pixelRatio: Number(canvas.dataset.pixelRatio),
        cssWidth: c.width, cssHeight: c.height, offsetX: c.x - r.x, offsetY: c.y - r.y,
        viewportWidth: window.visualViewport?.width ?? innerWidth, viewportHeight: window.visualViewport?.height ?? innerHeight,
        devicePixelRatio: window.devicePixelRatio || 1,
      },
      overflow: document.documentElement.scrollHeight > document.documentElement.clientHeight || document.documentElement.scrollWidth > document.documentElement.clientWidth };
  });
}

test.describe('edge-to-edge game windows', () => {
  // Camera projection, gameplay-state snapshots and private renderer budgets
  // live in the CS / CS Kimi / Villa owning specs. Shell verifies only the
  // shared viewport of releases actually present in its tested catalog.
  for (const game of responsiveGames) {
    const id = game.id;
    test(`${id}: shared viewport fits all screen shapes without reinitializing`, async ({ page }, testInfo) => {
      test.setTimeout(120_000);
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      // Keep geometry independent of CDP pointer-lock recenter deltas.
      // Real capture/release is covered by the dedicated interaction specs.
      await page.addInitScript(() => Object.defineProperty(HTMLCanvasElement.prototype, 'requestPointerLock', { configurable: true, value: () => undefined }));
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(`/#/${id}`);
      await expect(page.locator('#gameCanvas')).toHaveAttribute('data-viewport-mode', 'responsive', { timeout: 45_000 });
      await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-id', id);
      await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');
      await page.keyboard.press('Escape');
      const prepared = await page.locator('#gameCanvas').getAttribute('data-game-prepare-count');
      for (const size of sizes) {
        await page.setViewportSize(size);
        await expect.poll(async () => {
          const m = await metrics(page);
          return Math.abs(m.canvas.width - size.width) < 1 && Math.abs(m.canvas.height - size.height) < 1
            && Math.abs(m.canvas.x) < 1 && Math.abs(m.canvas.y) < 1
            && canvasViewportIssues(m.viewport, game.canvasSize).length === 0;
        }).toBe(true);
        const m = await metrics(page);
        expect(m.overflow).toBe(false);
        expect(m.pixels).toBeLessThanOrEqual(8_294_400);
        expect(m.viewport.logicalWidth / m.viewport.logicalHeight).toBeCloseTo(size.width / size.height, 3);
        expect(canvasViewportIssues(m.viewport, game.canvasSize)).toEqual([]);
        await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-prepare-count', prepared!);
        await expect(page.locator('.app-header')).toBeHidden();
        await expect(page.locator('#keyboardPanel')).toBeHidden();
        await page.screenshot({ path: testInfo.outputPath(`${id}-${size.width}x${size.height}.png`) });
      }
      expect(errors).toEqual([]);
    });
  }

  test('F11 remains browser-owned in every shell state; resizing and switching stay independent', async ({ page }) => {
    const [current, board] = selectFixedSwitchGames(builtCatalog().games);
    await page.addInitScript(() => {
      (window as any).__nativeCalls = 0;
      Element.prototype.requestFullscreen = async () => { (window as any).__nativeCalls++; };
      document.exitFullscreen = async () => { (window as any).__nativeCalls++; };
    });
    await page.goto(`/#/${current.id}`);
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-id', current.id);
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');
    await expect(page.locator('#startOverlay, #fullscreenBtn, #resumeBtn, #helpReturnBtn, #fullscreenNotice')).toHaveCount(0);
    // Headless DOM keys cannot stand in for browser chrome fullscreen. Check
    // non-interception explicitly, and exercise the resulting resize separately.
    const f11 = async () => expect(await page.evaluate(() => (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'F11', code: 'F11', bubbles: true, cancelable: true }),
    ))).toBe(true);
    await f11();
    await page.locator('#helpBtn').click(); await f11();
    for (const size of [{ width: 1920, height: 1080 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(size);
      await expect(page.locator('#helpOverlay')).toBeVisible();
      await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-prepare-count', '1');
      expect((await metrics(page)).overflow).toBe(false);
    }
    await page.locator('#helpCloseBtn').click();
    await page.locator('#overflowBtn').click(); await f11();
    await page.locator('#gamePickerBtn').click(); await f11();
    await page.locator(`.game-list-item[data-id="${board.id}"]`).click();
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-id', board.id);
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');
    await expect(page.locator('#gameCanvas')).toBeFocused();
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-logical-width', String(board.canvasSize.width));
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-logical-height', String(board.canvasSize.height));
    expect(await page.evaluate(() => (window as any).__nativeCalls)).toBe(0);
    const m = await metrics(page);
    expect(Math.min(Math.abs(m.canvas.width - m.root.width), Math.abs(m.canvas.height - m.root.height))).toBeLessThan(1);
  });

  test('no fullscreen API is needed for entering, learning and rotating a game', async ({ page }) => {
    const [current] = selectFixedSwitchGames(builtCatalog().games);
    await page.addInitScript(() => {
      Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false });
      Object.defineProperty(Element.prototype, 'requestFullscreen', { configurable: true, value: undefined });
    });
    await page.goto(`/#/${current.id}`);
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-id', current.id);
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');
    await page.locator('#helpBtn').click();
    await page.locator('#helpCloseBtn').click();
    await expect(page.locator('#gameCanvas')).toBeFocused();
    await page.locator('#overflowBtn').click();
    await page.locator('#menuCloseBtn').click();
    await expect(page.locator('#gameCanvas')).toBeFocused();
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-prepare-count', '1');
    expect((await metrics(page)).overflow).toBe(false);
  });
});

test.describe('bounded high-density game windows', () => {
  test.use({ viewport: { width: 3840, height: 2160 }, deviceScaleFactor: 2 });
  test('available responsive games keep the shared canvas budget at 4K / DPR 2', async ({ page }) => {
    test.setTimeout(180_000);
    for (const game of responsiveGames) {
      await page.goto(`/#/${game.id}`);
      // Hash navigation retains the old running canvas during preflight. Spend
      // the existing startup budget waiting for this release, never its predecessor.
      await expect(page.locator(`#gameCanvas[data-game-id="${game.id}"]`)).toHaveAttribute('data-game-running', 'true', { timeout: 45_000 });
      await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-id', game.id);
      await expect(page.locator('#gameCanvas')).toHaveAttribute('data-viewport-mode', 'responsive');
      await expect.poll(async () => canvasViewportIssues((await metrics(page)).viewport, game.canvasSize), { timeout: 30_000 }).toEqual([]);
      const m = await metrics(page);
      expect(m.canvas).toEqual({ x: 0, y: 0, width: 3840, height: 2160 });
      expect(m.viewport.logicalWidth / m.viewport.logicalHeight).toBeCloseTo(16 / 9, 3);
      expect(m.pixels).toBeLessThanOrEqual(8_294_400);
      expect(m.overflow).toBe(false);
    }
  });
});
