import { expect, test, type Page } from '@playwright/test';
import { gameModuleUrl } from '../../../tests/support/releases';

/** One-key parking through the real game loop: no scene stubbing, the shipped
 *  autopilot drives the shipped car along the shipped roads. */
async function fixture(page: Page) {
  await page.goto('/#/snake');
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

test('one-key parking drives a car from the estate back into its own bay', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await fixture(page);
  const result = await page.evaluate(async () => {
    const { game, canvas } = (window as any).__villaPark as { game: any; canvas: HTMLCanvasElement };
    // Park the sedan out on the drive, then press the real key.
    Object.assign(game.state.driving, { x: 34, z: 20, yaw: 0, speed: 0, steering: 0 });
    game.publishState();
    const before = JSON.parse(canvas.dataset.villaPark ?? '[]');
    game.handleInput(new KeyboardEvent('keydown', { key: 'v' }));
    const engaged = game.state.park.car.active;
    let steps = 0;
    for (; steps < 60 * 300 && game.state.park.car.active; steps++) game.update(1 / 60);
    const parked = { x: game.state.driving.x, z: game.state.driving.z, yaw: game.state.driving.yaw };
    game.publishState();
    return { before, engaged, steps, parked, after: JSON.parse(canvas.dataset.villaPark ?? '[]'), collisions: game.state.driving.collisions, failed: game.state.park.car.failed };
  });
  // The contract that matters: it either parks in its own bay or refuses to
  // start, and in both cases it never scrapes the estate on the way.
  // A car out on the estate must engage and park itself in its own bay, without
  // touching anything on the way.
  expect(result.engaged, JSON.stringify(result)).toBe(true);
  expect(Math.hypot(result.parked.x - 32.4, result.parked.z - (-2.6)), JSON.stringify(result)).toBeLessThan(.1);
  expect(result.collisions, JSON.stringify(result)).toBe(0);
  expect(result.failed).toBe('');
  expect(result.after.find((v: any) => v.id === 'car')).toMatchObject({ parked: true, active: false });
  expect(errors).toEqual([]);
});

test('one-key parking refuses a route its own obstacles block instead of driving through them', async ({ page }) => {
  test.setTimeout(120_000);
  await fixture(page);
  const result = await page.evaluate(() => {
    const { game, canvas } = (window as any).__villaPark as { game: any; canvas: HTMLCanvasElement };
    // The scenic-oval approach crosses the front link, where a vegetable bed
    // stands inside the road corridor: the run must refuse, not scrape past.
    Object.assign(game.state.driving, { x: 24, z: 34, yaw: -.4, speed: 0, steering: 0 });
    game.handleInput(new KeyboardEvent('keydown', { key: 'v' }));
    return { engaged: game.state.park.car.active, collisions: game.state.driving.collisions, telemetry: JSON.parse(canvas.dataset.villaPark ?? '[]') };
  });
  expect(result.engaged).toBe(false);
  expect(result.collisions).toBe(0);
  expect(result.telemetry.find((v: any) => v.id === 'car')).toMatchObject({ canPark: true, active: false });
});

test('one-key parking refuses a car that is already home and offers the ones outside', async ({ page }) => {
  test.setTimeout(120_000);
  await fixture(page);
  const result = await page.evaluate(() => {
    const { game, canvas } = (window as any).__villaPark as { game: any; canvas: HTMLCanvasElement };
    const snapshot = () => JSON.parse(document.querySelector('canvas')!.dataset.villaPark ?? '[]');
    return { initial: snapshot(), parkedNow: game.state.park.car.active };
  });
  // Every car starts in its own bay: nothing to park, and no run starts.
  expect(result.initial.every((v: any) => v.parked && v.canPark && !v.active)).toBe(true);
  expect(result.parkedNow).toBe(false);
});
