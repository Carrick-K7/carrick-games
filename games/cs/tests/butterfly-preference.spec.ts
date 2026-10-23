import { expect, test, type Page } from '@playwright/test';
import { gameAssetUrl } from '../../../tests/support/releases';
import { activateUi } from './ui.fixture';
import { openButterflyPreferenceFixture, seedButterflyPreference } from './butterfly-preference.fixture';

test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
test.setTimeout(180_000);
const state = (page: Page) => page.evaluate(() => (window as any).__CSX_DEBUG__?.info() ?? { ready: false });

function observeRelease(page: Page) {
  const errors: string[] = [], assets = new Set<string>(), foreign: string[] = [];
  const base = gameAssetUrl('cs', '');
  page.on('pageerror', error => errors.push(error.stack || error.message));
  page.on('response', response => {
    const path = new URL(response.url()).pathname;
    if (path.startsWith(base) && response.status() >= 400) errors.push(`${response.status()} ${path}`);
    if (/\.(glb|bsp|wad)$/.test(path)) {
      assets.add(path);
      if (!path.startsWith(base)) foreign.push(path);
    }
  });
  return { errors, assets, foreign };
}
function assertActorsLoaded(evidence: ReturnType<typeof observeRelease>) {
  expect([...evidence.assets].some(path => path.endsWith('/characters/ct-sample.glb'))).toBe(true);
  expect([...evidence.assets].some(path => path.endsWith('/characters/t-sample.glb'))).toBe(true);
  expect(evidence.foreign).toEqual([]);
  expect(evidence.errors).toEqual([]);
}

test('saved butterfly survives app reload and Snow pistol draw/idle, knife inspect and pistol return', async ({ page }, testInfo) => {
  const evidence = observeRelease(page);
  await seedButterflyPreference(page);
  await page.goto('/#/cs');
  await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true', { timeout: 60_000 });
  await expect.poll(async () => (await state(page)).ready, { timeout: 60_000 }).toBe(true);
  expect((await state(page)).settings).toMatchObject({ knifeModel: 'butterfly', sensitivity: .91 });
  // The init script only seeds absent storage: this reload must actually retain it.
  await page.reload();
  await expect.poll(async () => (await state(page)).ready, { timeout: 60_000 }).toBe(true);
  expect((await state(page)).settings).toMatchObject({ knifeModel: 'butterfly', sensitivity: .91 });
  await activateUi(page, 'menu-map-fy_snow');
  await activateUi(page, 'menu-mode-tdm');
  await activateUi(page, 'menu-start');
  await expect.poll(async () => (await state(page)).skinnedBots).toBe(9);
  await page.evaluate(() => (window as any).__CSX_DEBUG__.skipFreeze());
  const initial = await state(page);
  expect(initial).toMatchObject({ map: 'fy_snow', weapon: 'usp', knifeModel: 'butterfly' });
  const progress = async (after: number, seconds: number) => {
    await expect.poll(async () => {
      expect(evidence.errors, 'no runtime exception while the real shell advances').toEqual([]);
      return (await state(page)).clock;
    }, { timeout: 30_000 }).toBeGreaterThan(after + seconds);
  };
  // Old guard fails here at the USP draw→idle boundary, before any knife input.
  await progress(initial.clock, 1.2);
  expect((await state(page)).weapon).toBe('usp');
  await page.screenshot({ path: testInfo.outputPath('snow-saved-butterfly-pistol-idle.png') });
  await page.keyboard.press('3');
  await expect.poll(async () => (await state(page)).weapon).toBe('knife');
  const knife = await state(page);
  expect(knife.knifeModel).toBe('butterfly');
  await progress(knife.clock, 1.1);
  await page.keyboard.press('f');
  await expect.poll(async () => (await state(page)).inspectAt).toBeGreaterThan(knife.clock);
  const inspect = await state(page);
  await progress(inspect.clock, .25);
  await page.screenshot({ path: testInfo.outputPath('snow-saved-butterfly-inspect.png') });
  await page.keyboard.press('2');
  await expect.poll(async () => (await state(page)).weapon).toBe('usp');
  const returned = await state(page);
  await progress(returned.clock, 1.2);
  await page.screenshot({ path: testInfo.outputPath('snow-saved-butterfly-pistol-return.png') });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cs.controls.v1')!).knifeModel)).toBe('butterfly');
  assertActorsLoaded(evidence);
  await testInfo.attach('saved-preference-live-shell-clocks', { body: Buffer.from(JSON.stringify({ initial, knife, inspect, returned, final: await state(page) }, null, 2)), contentType: 'application/json' });
});

for (const map of ['fy_snow', 'de_dust2']) {
  test(`saved butterfly: ${map} advances sixty real simulation seconds with bots and normal weapon commands`, async ({ page }, testInfo) => {
    const evidence = observeRelease(page), records: any[] = [];
    try {
      let s = await openButterflyPreferenceFixture(page, map);
      records.push(s);
      expect(s).toMatchObject({ map, mode: 'tdm', weapon: 'usp', rig: 'usp', preference: 'butterfly', sensitivity: .91, persisted: 'butterfly', actors: 10, skinnedBots: 9 });
      // 1,800 real engine ticks, 30 fresh rendered gameplay frames, bounded by
      // simulation clock rather than wall-time sleeps or a spoofed clock assignment.
      for (let batch = 1; batch <= 30; batch++) {
        const previous = s;
        s = await page.evaluate(() => (window as any).__CS_BUTTERFLY_PREFERENCE__.step());
        records.push(s);
        expect(s.clock - previous.clock).toBeCloseTo(2, 7);
        expect(s.elapsed).toBeCloseTo(batch * 2, 7);
        expect(s.renderFrame).toBeGreaterThan(previous.renderFrame);
        expect(s).toMatchObject({ preference: 'butterfly', persisted: 'butterfly', finite: true, isolated: true, actors: 10, skinnedBots: 9 });
        expect(evidence.errors).toEqual([]);
        if ([1, 2, 15, 30].includes(batch)) await page.screenshot({ path: testInfo.outputPath(`${map}-${batch * 2}s.png`) });
      }
      expect(s.ticks).toBe(1800);
      expect(s.elapsed).toBeGreaterThanOrEqual(60 - 1e-7);
      expect(s.moved).toBeGreaterThan(0);
      expect(s.botShots).toBeGreaterThan(0);
      expect(s.playerShots).toBeGreaterThan(0);
      expect(s.switches).toBeGreaterThan(2);
      expect(s.visited).toEqual(expect.arrayContaining(['usp', 'knife']));
      expect(s.continuity.length, 'actual butterfly inspect→slash still uses same-clock presentation continuity').toBeGreaterThan(0);
      for (const transition of s.continuity) {
        expect(transition.phase).toBe('slash');
        expect(transition.delta).toBeLessThan(1e-7);
      }
      assertActorsLoaded(evidence);
    } finally {
      await testInfo.attach(`${map}-real-simulation-clock-and-frames`, { body: Buffer.from(JSON.stringify(records, null, 2)), contentType: 'application/json' });
      await page.evaluate(() => (window as any).__CS_BUTTERFLY_PREFERENCE__?.destroy());
    }
  });
}
