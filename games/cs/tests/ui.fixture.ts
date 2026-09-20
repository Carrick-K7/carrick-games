import { expect, type Page } from '@playwright/test';

export async function uiRegion(page: Page, id: string, minHeight = 40) {
  return page.evaluate(({ id, minHeight }) => {
    const ui = (window as any).__CSX_DEBUG__?.ui?.();
    const region = ui?.regions.find((r: any) => r.id === id && !r.disabled && r.h >= minHeight);
    const rect = document.getElementById('gameCanvas')!.getBoundingClientRect();
    if (!region) return null;
    return { ...region, clientX: rect.x + (region.x + region.w / 2) * rect.width / ui.width,
      clientY: rect.y + (region.y + region.h / 2) * rect.height / ui.height };
  }, { id, minHeight });
}
/** Click the current visible, enabled game-owned target, never legacy pixels. */
export async function activateUi(page: Page, id: string, touch = false) {
  await expect.poll(() => uiRegion(page, id), { timeout: 15_000 }).not.toBeNull();
  const r = (await uiRegion(page, id))!;
  if (touch) await page.touchscreen.tap(r.clientX, r.clientY);
  else await page.mouse.click(r.clientX, r.clientY);
}
