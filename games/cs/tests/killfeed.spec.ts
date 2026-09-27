import { expect, test } from '@playwright/test';
import { closeAimingFixture, fireAimingShot, openAimingFixture, readAimingSnapshot, type AimPaint, type AimSnapshot } from './aiming.fixture';

function displayedName(s: AimSnapshot, name: string) {
  return s.paint.find(p => p.op === 'text' && p.bounds && (p.text === name
    || (p.text?.endsWith('…') && name.startsWith(p.text.slice(0, -1)))));
}
function killIcon(s: AimSnapshot) {
  const event = s.killfeed.at(-1);
  if (!event) return undefined;
  const a = displayedName(s, event.aName), b = displayedName(s, event.bName);
  if (!a?.bounds || !b?.bounds) return undefined;
  const cy = a.bounds.y + a.bounds.h / 2;
  return s.paint.find(p => p.op === 'image' && p.src?.endsWith(`/assets/ui/weapons/${event.weaponId}.svg`) && p.bounds
    && p.bounds.x >= a.bounds!.x + a.bounds!.w && p.bounds.x + p.bounds.w <= b.bounds!.x
    && Math.abs(p.bounds.y + p.bounds.h / 2 - cy) < 3);
}
function assertRow(s: AimSnapshot, image: AimPaint) {
  const event = s.killfeed.at(-1)!;
  const names = [displayedName(s, event.aName)!, displayedName(s, event.bName)!];
  const hs = s.paint.find(p => p.op === 'text' && p.text === 'HS')!;
  expect(hs).toBeDefined(); expect(image.bounds!.h).toBeLessThanOrEqual(16.01);
  expect(image.bounds!.w).toBeGreaterThan(20);
  const cells = [...names.map(p => p.bounds!), image.bounds!, hs.bounds!].sort((a, b) => a.x - b.x);
  for (const [i, cell] of cells.entries()) {
    expect(cell.x).toBeGreaterThanOrEqual(s.safeArea.left);
    expect(cell.y).toBeGreaterThanOrEqual(s.safeArea.top);
    expect(cell.x + cell.w).toBeLessThanOrEqual(s.width - s.safeArea.right);
    expect(cell.y + cell.h).toBeLessThanOrEqual(s.height - s.safeArea.bottom);
    if (i) expect(cell.x).toBeGreaterThan(cells[i - 1].x + cells[i - 1].w);
  }
}

for (const shape of [
  { width: 1280, height: 720, dpr: 1, touch: false, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } },
  { width: 320, height: 568, dpr: 2, touch: true, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } },
  { width: 568, height: 320, dpr: 2, touch: true, safeArea: { top: 0, right: 8, bottom: 21, left: 44 } },
]) test.describe(`CS killfeed silhouette ${shape.width}x${shape.height}`, () => {
  test.use({ viewport: { width: shape.width, height: shape.height }, deviceScaleFactor: shape.dpr, hasTouch: shape.touch, isMobile: shape.touch });
  test('a real headshot keeps its killing gun silhouette after switching weapons', async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const { errors } = await openAimingFixture(page, shape);
    try {
      const shot = await fireAimingShot(page, { zoom: 1, hit: 'head', kill: true, feedback: 'full' });
      expect(shot.damage).toBeGreaterThan(0); expect(shot.alive).toBe(false);
      expect(shot.killfeed.at(-1)).toMatchObject({ weaponId: 'g3sg1', head: true });
      await expect.poll(async () => !!killIcon(await readAimingSnapshot(page))).toBe(true);
      const loaded = await readAimingSnapshot(page), image = killIcon(loaded)!;
      assertRow(loaded, image);
      await page.screenshot({ path: testInfo.outputPath('headshot-killfeed-silhouette.png') });
      await page.evaluate(() => (window as any).__CS_AIM_FIXTURE__.switchToPistol());
      const switched = await readAimingSnapshot(page), retained = killIcon(switched)!;
      expect(retained).toBeDefined(); expect(retained.src).toBe(image.src);
      expect(switched.killfeed).toEqual(loaded.killfeed);
      assertRow(switched, retained);
      await page.screenshot({ path: testInfo.outputPath('killfeed-after-switch.png') });
      expect(errors).toEqual([]);
    } finally { await closeAimingFixture(page); }
  });
});
