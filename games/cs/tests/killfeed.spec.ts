import { expect, test, type Page } from '@playwright/test';
import {
  closeAimingFixture, fireAimingShot, openAimingFixture, readAimingPixels, readAimingSnapshot, recordControlledKillfeed,
  type AimPaint, type AimSnapshot, type ControlledKillfeed,
} from './aiming.fixture';

type Bounds = NonNullable<AimPaint['bounds']>;
const GOLD = '#d8c08b', WHITE = '#f0f3f5';
function displayedName(s: AimSnapshot, name: string) {
  return s.paint.find(p => p.op === 'text' && p.bounds && (p.text === name
    || (p.text?.endsWith('…') && name.startsWith(p.text.slice(0, -1)))));
}
function killIcon(s: AimSnapshot) {
  const event = s.killfeed.at(-1);
  if (!event) return undefined;
  const a = displayedName(s, event.aName), b = displayedName(s, event.bName);
  if (!a?.bounds || !b?.bounds) return undefined;
  return s.paint.find(p => p.op === 'image' && p.src?.endsWith(`/assets/ui/weapons/${event.weaponIconId ?? event.weaponId}.svg`)
    && p.bounds && p.index > a.index && p.index < b.index);
}
function contains(outer: Bounds, inner: Bounds) {
  return inner.x >= outer.x - .01 && inner.y >= outer.y - .01
    && inner.x + inner.w <= outer.x + outer.w + .01 && inner.y + inner.h <= outer.y + outer.h + .01;
}
function rowEvidence(s: AimSnapshot) {
  const event = s.killfeed.at(-1)!;
  const a = displayedName(s, event.aName), b = displayedName(s, event.bName);
  expect(a?.bounds).toBeDefined(); expect(b?.bounds).toBeDefined();
  // Observe the real row backplate rather than reusing the layout's expected
  // result. This also gives a bounded crop for the native Path2D pixel evidence.
  const plate = s.paint.filter(p => p.op === 'fillRect' && p.bounds && p.bounds.h > 4 && p.index < a!.index
    && contains(p.bounds, a!.bounds!) && contains(p.bounds, b!.bounds!)).at(-1);
  expect(plate?.bounds).toBeDefined();
  return { row: plate!.bounds!, a: a!, b: b!, content: s.paint.filter(p => p.index > a!.index && p.index < b!.index) };
}
async function assertRow(page: Page, s: AimSnapshot, image?: AimPaint) {
  const event = s.killfeed.at(-1)!, evidence = rowEvidence(s), cells = [evidence.a.bounds!, evidence.b.bounds!];
  const glyphs = evidence.content.filter(p => p.op === 'fill' && p.path2d);
  const heads = glyphs.filter(p => p.color === GOLD), utilities = glyphs.filter(p => p.color === WHITE);
  expect(s.paint.some(p => p.op === 'text' && p.text === 'HS')).toBe(false);
  expect(heads).toHaveLength(event.head ? 1 : 0);
  let headPixels = null, utilityPixels = null;
  if (event.head) {
    expect(heads[0].evenodd).toBe(true);
    expect(heads[0].segments).toEqual([]); expect(heads[0].arcs).toEqual([]);
    // Native Path2D contours cannot be introspected; prove actual gold pixels,
    // bounded to 16px and disjoint from names/art, on the real final canvas.
    headPixels = await readAimingPixels(page, evidence.row, [216, 192, 139]);
    expect(headPixels.count).toBeGreaterThan(8); expect(headPixels.bounds).not.toBeNull();
    expect(headPixels.bounds!.w).toBeLessThanOrEqual(16); expect(headPixels.bounds!.h).toBeLessThanOrEqual(16);
    cells.push(headPixels.bounds!);
  }
  const utility = event.weaponIconId === 'he' || event.weaponIconId === 'c4';
  expect(utilities).toHaveLength(utility ? 1 : 0);
  if (utility) {
    expect(utilities[0].evenodd).toBe(true); expect(image).toBeUndefined();
    utilityPixels = await readAimingPixels(page, evidence.row, [240, 243, 245]);
    expect(utilityPixels.count).toBeGreaterThan(8); expect(utilityPixels.bounds).not.toBeNull();
    expect(utilityPixels.bounds!.w).toBeLessThanOrEqual(16); expect(utilityPixels.bounds!.h).toBeLessThanOrEqual(16);
    cells.push(utilityPixels.bounds!);
  } else {
    expect(image?.bounds).toBeDefined();
    expect(image!.bounds!.h).toBeLessThanOrEqual(16.01); expect(image!.bounds!.w).toBeGreaterThan(8);
    cells.push(image!.bounds!);
  }
  // Fallback labels must be gone once exact weapon art / original utility art
  // paints. Attacker and victim are the only texts in the observed row sequence.
  expect(evidence.content.filter(p => p.op === 'text')).toEqual([]);
  cells.sort((a, b) => a.x - b.x);
  for (const [i, cell] of cells.entries()) {
    expect(contains(evidence.row, cell)).toBe(true);
    expect(cell.x).toBeGreaterThanOrEqual(s.safeArea.left);
    expect(cell.y).toBeGreaterThanOrEqual(s.safeArea.top);
    expect(cell.x + cell.w).toBeLessThanOrEqual(s.width - s.safeArea.right);
    expect(cell.y + cell.h).toBeLessThanOrEqual(s.height - s.safeArea.bottom);
    if (i) expect(cell.x).toBeGreaterThan(cells[i - 1].x + cells[i - 1].w);
  }
  return { cells, row: evidence.row, headPixels, utilityPixels };
}

for (const shape of [
  { width: 1280, height: 720, dpr: 1, touch: false, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } },
  { width: 320, height: 568, dpr: 2, touch: true, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } },
  { width: 568, height: 320, dpr: 2, touch: true, safeArea: { top: 0, right: 8, bottom: 21, left: 44 } },
]) test.describe(`CS killfeed silhouette ${shape.width}x${shape.height}`, () => {
  test.use({ viewport: { width: shape.width, height: shape.height }, deviceScaleFactor: shape.dpr, hasTouch: shape.touch, isMobile: shape.touch });
  test('a real headshot keeps its killing gun and non-text headshot glyph after switching weapons', async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const { errors } = await openAimingFixture(page, shape);
    try {
      const shot = await fireAimingShot(page, { zoom: 1, hit: 'head', kill: true, feedback: 'full' });
      expect(shot.damage).toBeGreaterThan(0); expect(shot.alive).toBe(false);
      expect(shot.killfeedEvidence).toBe('real-fire');
      expect(shot.killfeed.at(-1)).toMatchObject({ weaponId: 'g3sg1', weaponIconId: 'g3sg1', head: true });
      await expect.poll(async () => !!killIcon(await readAimingSnapshot(page))).toBe(true);
      const loaded = await readAimingSnapshot(page), image = killIcon(loaded)!;
      const before = await assertRow(page, loaded, image);
      await page.screenshot({ path: testInfo.outputPath('headshot-killfeed-silhouette.png') });
      await page.evaluate(() => (window as any).__CS_AIM_FIXTURE__.switchToPistol());
      const switched = await readAimingSnapshot(page), retained = killIcon(switched)!;
      expect(retained).toBeDefined(); expect(retained.src).toBe(image.src); expect(retained.bounds).toEqual(image.bounds);
      expect(switched.killfeed).toEqual(loaded.killfeed);
      const after = await assertRow(page, switched, retained);
      expect(after).toEqual(before);
      await page.screenshot({ path: testInfo.outputPath('killfeed-after-switch.png') });
      expect(errors).toEqual([]);
    } finally { await closeAimingFixture(page); }
  });
});

const controlledCases: (ControlledKillfeed & { label: string; iconId: string; aspect?: number })[] = [
  { label: 'classic', weaponId: 'knife', knifeModel: 'classic', iconId: 'knife-classic', aspect: 754 / 614 },
  { label: 'karambit', weaponId: 'knife', knifeModel: 'karambit', iconId: 'knife-karambit', aspect: 855 / 605 },
  { label: 'butterfly', weaponId: 'knife', knifeModel: 'butterfly', iconId: 'knife-butterfly', aspect: 733 / 616 },
  { label: 'bot-classic', weaponId: 'knife', knifeModel: 'butterfly', bot: true, iconId: 'knife-classic', aspect: 754 / 614 },
  { label: 'he', weaponId: 'he', iconId: 'he' },
  { label: 'c4', weaponId: 'c4', iconId: 'c4' },
];
for (const shape of [
  { width: 1280, height: 720, dpr: 2, touch: false, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } },
  { width: 320, height: 568, dpr: 2, touch: true, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } },
]) test.describe(`CS controlled killfeed record rendering ${shape.width}px DPR2`, () => {
  test.use({ viewport: { width: shape.width, height: shape.height }, deviceScaleFactor: shape.dpr, hasTouch: shape.touch, isMobile: shape.touch });
  test('all knife appearances and HE/C4 symbols retain identity, real aspect and separate cells', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const { errors } = await openAimingFixture(page, shape);
    try {
      for (const record of controlledCases) await test.step(record.label, async () => {
        const recorded = await recordControlledKillfeed(page, record);
        expect(recorded.killfeedEvidence).toBe('controlled-record-render');
        // This controlled record proves rendering, not a melee/raycast/explosion
        // kill. Dedicated CPU tests already traverse all actual damage sources.
        expect(recorded).toMatchObject({ damage: 0, ammoSpent: 0, ray: null, alive: true });
        expect(recorded.killfeed).toHaveLength(1);
        expect(recorded.killfeed[0]).toMatchObject({ weaponId: record.weaponId, weaponIconId: record.iconId, head: false });
        if (record.aspect) await expect.poll(async () => !!killIcon(await readAimingSnapshot(page))).toBe(true);
        const loaded = await readAimingSnapshot(page), image = killIcon(loaded);
        const before = await assertRow(page, loaded, image);
        if (record.aspect) expect(image!.bounds!.w / image!.bounds!.h).toBeCloseTo(record.aspect, 6);
        await page.screenshot({ path: testInfo.outputPath(`controlled-record-${record.label}.png`) });
        await page.evaluate(model => {
          const fixture = (window as any).__CS_AIM_FIXTURE__;
          fixture.changeKnifeModel(model); fixture.switchToPistol();
        }, record.knifeModel === 'butterfly' ? 'karambit' : 'butterfly');
        const switched = await readAimingSnapshot(page), retained = killIcon(switched);
        expect(switched.killfeed).toEqual(loaded.killfeed);
        expect(retained?.src).toBe(image?.src); expect(retained?.bounds).toEqual(image?.bounds);
        const after = await assertRow(page, switched, retained);
        expect(after).toEqual(before);
      });
      expect(errors).toEqual([]);
    } finally { await closeAimingFixture(page); }
  });
});
