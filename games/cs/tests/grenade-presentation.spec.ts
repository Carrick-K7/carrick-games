import { expect, test } from '@playwright/test';
import { openGrenadePresentation, grenadePose, closeGrenadePresentation } from './grenade-presentation.fixture';

test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
test('grenade grip, pin pull and three throw strengths render finite real keyframes', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const { errors } = await openGrenadePresentation(page);
  try {
    let frame = 0;
    const states: [string, number, number][] = [['idle', 0, 1], ['pin', .4, 1], ['pin', 1, 1]];
    for (const strength of [0, .5, 1]) for (const t of [.18, .38, .48, .8]) states.push(['throw', t, strength]);
    for (const [stage, t, strength] of states) {
      const s = await grenadePose(page, stage, t, strength);
      expect(s.evidence).toBe('real-release-grenade-presentation'); expect(s.id).toBe('he'); expect(s.finite).toBe(true);
      expect(s.frame).toBeGreaterThan(frame); frame = s.frame;
      expect(s.wristBend).toBeLessThanOrEqual(.620001);
      expect(s.fixedVisible).toBe(stage !== 'throw' || t < .22 / .56);
      await page.screenshot({ path: testInfo.outputPath(`${stage}-${strength}-${t}.png`) });
    }
    for (const id of ['usp', 'ak47', 'knife', 'c4']) {
      await page.evaluate(id => (window as any).__CS_GRENADE_PRESENTATION__.equip(id), id);
      await page.screenshot({ path: testInfo.outputPath(`hands-${id}.png`) });
    }
    // Exercise the engine-owned release boundary, not just sampled poses.
    await page.evaluate(() => (window as any).__CS_GRENADE_PRESENTATION__.begin(1));
    const advance = (seconds: number): Promise<any> => page.evaluate(seconds => (window as any).__CS_GRENADE_PRESENTATION__.advance(seconds), seconds);
    await advance(.5);
    await page.evaluate(() => (window as any).__CS_GRENADE_PRESENTATION__.release(1));
    const before = await advance(.219); expect(before).toMatchObject({ id: 'he', fixedVisible: true, grenades: 0, count: 2 });
    const after = await advance(.002); expect(after).toMatchObject({ id: 'he', fixedVisible: false, grenades: 1, count: 1 });
    expect(await advance(0)).toMatchObject({ grenades: 1, count: 1 });
    const recovered = await advance(.34); expect(recovered).toMatchObject({ id: 'usp', grenades: 1, count: 1 });
    expect(errors).toEqual([]);
  } finally { await closeGrenadePresentation(page); }
});

for (const [width, height] of [[320, 568], [844, 390]]) test.describe(`grenade hand framing ${width}x${height}`, () => {
  test.use({ viewport: { width, height }, deviceScaleFactor: 1 });
  test('pin and throw keyframes stay finite on narrow and short viewports', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const { errors } = await openGrenadePresentation(page, width, height);
    try {
      for (const [stage, t] of [['idle', 0], ['pin', .4], ['throw', .18], ['throw', .48], ['throw', .8]] as [string, number][]) {
        const s = await grenadePose(page, stage, t);
        expect(s.id).toBe('he'); expect(s.finite).toBe(true); expect(s.frame).toBeGreaterThan(0);
        await page.screenshot({ path: testInfo.outputPath(`${stage}-${t}.png`) });
      }
      expect(errors).toEqual([]);
    } finally { await closeGrenadePresentation(page); }
  });
});
