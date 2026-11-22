import { villaRegression } from './villaBrowserCases';
import { expect, test, type Page } from '@playwright/test';
import { gameModuleUrl } from '../../../tests/support/releases';
import { openVillaFixturePage } from './villaBrowserHost';
import { VILLA_CAR } from '../src/villaActivities';

/** One-key parking through the real game loop: no scene stubbing, the shipped
 *  autopilot drives the shipped car along the shipped roads. */
async function fixture(page: Page) {
  await openVillaFixturePage(page);
  const url = gameModuleUrl('villa');
  await page.evaluate(async url => {
    const { VillaGame } = await import(url);
    const canvas = document.createElement('canvas'); document.body.append(canvas);
    const game = new VillaGame({ canvas, logicalWidth: 1120, logicalHeight: 700, isDarkTheme: () => false, isZhLang: () => false,
      isPixelMode: () => false, getRecord: () => null, reportScore: () => {}, requestShellRender: () => {} }) as any;
    game.prepare(); game.start(); cancelAnimationFrame(game.animationId);
    (window as any).__villaPark = { game, canvas };
  }, url);
}

villaRegression('one-key parking drives a car from the estate back into its own bay', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const canvas = page.locator('canvas[data-villa-park]');
  await test.step('one-key parking refuses a car that is already home and offers the ones outside', async () => {
    // The original startup snapshot and its deadline belong here, before the route fixture moves anything.
    await fixture(page);
    const initial = JSON.parse((await canvas.getAttribute('data-villa-park'))!);
    expect(initial.map((v: any) => v.id)).toEqual(['car', 'pickup', 'suv']);
    expect(initial.every((v: any) => v.parked && v.canPark && !v.active)).toBe(true);
    expect(await page.evaluate(() => (window as any).__villaPark.game.state.park.car.active)).toBe(false);
    await page.keyboard.press('v');
    await expect(canvas).toHaveAttribute('data-villa-use-feedback', 'No car nearby that can park itself.');
    expect(JSON.parse((await canvas.getAttribute('data-villa-park'))!)).toEqual(initial);
  }, { timeout: 120_000 });

  const before = await page.evaluate(() => {
    const { game, canvas } = (window as any).__villaPark;
    Object.assign(game.state.driving, { x: 34, z: 20, yaw: 0, speed: 0, steering: 0 });
    game.publishState();
    return JSON.parse(canvas.dataset.villaPark);
  });
  expect(before.filter((v: any) => v.canPark && !v.parked).map((v: any) => v.id)).toEqual(['car']);
  await page.keyboard.press('v');
  const result = await page.evaluate(() => {
    const { game, canvas } = (window as any).__villaPark as { game: any; canvas: HTMLCanvasElement };
    const engaged = game.state.park.car.active;
    let steps = 0;
    for (; steps < 60 * 300 && game.state.park.car.active; steps++) game.update(1 / 60);
    const parked = { x: game.state.driving.x, z: game.state.driving.z, yaw: game.state.driving.yaw };
    game.publishState();
    return { engaged, steps, parked, after: JSON.parse(canvas.dataset.villaPark ?? '[]'), collisions: game.state.driving.collisions, failed: game.state.park.car.failed };
  });
  // Refusal must not prevent a subsequently eligible sedan from returning without a collision.
  expect(result.engaged, JSON.stringify(result)).toBe(true);
  expect(Math.hypot(result.parked.x - 32.4, result.parked.z - (-2.6)), JSON.stringify(result)).toBeLessThan(.1);
  expect(result.collisions, JSON.stringify(result)).toBe(0);
  expect(result.failed).toBe('');
  expect(result.after.find((v: any) => v.id === 'car')).toMatchObject({ parked: true, active: false });

  // The on-foot selector omits all parked cars. From inside this very sedan, V
  // targets it explicitly: require the actual own-bay refusal, not an unhandled key.
  await page.evaluate(door => {
    const { game } = (window as any).__villaPark;
    game.position = { ...door }; game.eyeY = door.y; game.yaw = Math.PI / 2; game.pitch = -.12;
    game.update(.05);
  }, VILLA_CAR.exit);
  await expect(canvas).toHaveAttribute('data-villa-target', 'car');
  await page.keyboard.press('e');
  await page.evaluate(() => { const { game } = (window as any).__villaPark; for (let i = 0; i < 40; i++) game.update(.05); });
  await expect(canvas).toHaveAttribute('data-villa-seat', 'car');
  await page.keyboard.press('v');
  await expect(canvas).toHaveAttribute('data-villa-use-feedback', 'That car is already in its own bay.');
  expect(JSON.parse((await canvas.getAttribute('data-villa-park'))!)).toEqual(result.after);
  expect(errors).toEqual([]);
});

villaRegression('one-key parking drives home from the scenic oval now the front link is clear', async ({ page }) => {
  test.setTimeout(300_000);
  await fixture(page);
  const result = await page.evaluate(() => {
    const { game, canvas } = (window as any).__villaPark as { game: any; canvas: HTMLCanvasElement };
    // This approach crosses the front link, whose west arm used to run through
    // the vegetable patch and made the car refuse the whole estate.
    Object.assign(game.state.driving, { x: 24, z: 34, yaw: -.4, speed: 0, steering: 0 });
    game.handleInput(new KeyboardEvent('keydown', { key: 'v' }));
    let steps = 0;
    for (; steps < 60 * 300 && game.state.park.car.active; steps++) game.update(1 / 60);
    return { engaged: steps > 0, steps, parked: { x: game.state.driving.x, z: game.state.driving.z },
      collisions: game.state.driving.collisions, failed: game.state.park.car.failed,
      telemetry: JSON.parse(canvas.dataset.villaPark ?? '[]') };
  });
  expect(result.engaged, JSON.stringify(result)).toBe(true);
  expect(result.failed).toBe('');
  expect(Math.hypot(result.parked.x - 32.4, result.parked.z + 2.6), JSON.stringify(result)).toBeLessThan(.1);
  expect(result.collisions).toBe(0);
  expect(result.telemetry.find((v: any) => v.id === 'car')).toMatchObject({ parked: true, active: false });
});
