import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const moduleUrl = () => '/' + JSON.parse(readFileSync(join(process.cwd(), 'dist/.vite/manifest.json'), 'utf8'))['src/games/villa.ts'].file;

test('villa elevator carries a walking passenger continuously, interlocks landings and preserves stairs', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/#/snake');
  const result = await page.evaluate(async url => {
    const { VillaGame } = await import(url);
    const canvas = document.createElement('canvas'); document.body.append(canvas);
    let scores = 0;
    const game = new VillaGame({ canvas, logicalWidth: 1120, logicalHeight: 700, isDarkTheme: () => false, isZhLang: () => true, isPixelMode: () => false, getRecord: () => null, reportScore: () => scores++, requestShellRender: () => {} }) as any;
    game.prepare(); game.start(); cancelAnimationFrame(game.animationId);
    const key = (key: string, type = 'keydown') => game.handleInput(new KeyboardEvent(type, { key }));
    const tick = (n: number) => { for (let i = 0; i < n; i++) game.update(.05); };
    const walk = (x: number, z: number) => {
      for (const axis of ['x', 'z']) {
        const target = axis === 'x' ? x : z; let budget = 600;
        while (Math.abs(game.position[axis] - target) > .005 && budget-- > 0) {
          const diff = target - game.position[axis];
          game.yaw = axis === 'x' ? (diff > 0 ? -Math.PI / 2 : Math.PI / 2) : (diff > 0 ? Math.PI : 0);
          key('w'); game.update(Math.min(.05, Math.abs(diff) / 2.75)); key('w', 'keyup');
        }
        if (budget <= 0) throw new Error('Walk blocked at ' + JSON.stringify(game.position));
      }
    };
    const car = game.scene.scene.getObjectByName('elevator-car');
    const leaf = (floor: number) => game.scene.scene.getObjectByName(`elevator-landing-${floor}-door-right-inner`);
    key('h'); walk(0, -4.3); key('w'); tick(15); key('w', 'keyup');
    const gateStopped = game.position.z > -4.82;
    key('e'); tick(8); key('w'); tick(4); key('w', 'keyup');
    const partialGateStopped = game.position.z > -4.82;
    tick(6); walk(0, -6.2);
    const journey = (floor: number) => {
      key(String(floor + 1)); const x = game.position.x, z = game.position.z;
      key('w'); key('Shift'); key('ArrowLeft');
      let continuous = false, aligned = true, sealed = true, budget = 240, previous = game.position.y;
      const initialYaw = game.yaw;
      while (game.state.elevator.phase !== 'open' && budget-- > 0) {
        game.update(.05);
        const lift = game.state.elevator;
        continuous ||= Math.abs(lift.y / 3.6 - Math.round(lift.y / 3.6)) > .05;
        aligned &&= Math.abs(game.position.y - lift.y) < 1e-9 && Math.abs(car.position.y - lift.y) < 1e-9 && Math.abs(lift.y - previous) < .12;
        if (lift.phase === 'moving') sealed &&= [0, 1, 2].every(i => leaf(i).position.x === 0);
        previous = lift.y;
      }
      key('w', 'keyup'); key('Shift', 'keyup'); key('ArrowLeft', 'keyup');
      if (budget <= 0) throw new Error('Elevator failed to arrive');
      return { continuous, aligned, sealed, stationaryXZ: game.position.x === x && game.position.z === z, canLook: game.yaw !== initialYaw, y: game.position.y, door: leaf(floor).position.x };
    };
    const up = journey(2); game.yaw = Math.PI; game.pitch = .02; game.time++; game.renderFrame();
    const cabinImage = canvas.toDataURL();
    walk(0, -4.3); const roofExit = { ...game.position };
    // Leave by the original staircase, then summon the now-empty car downstairs.
    walk(0, 2); walk(5.2, 2); walk(5.2, 1.4); // clear the pavilion's side-wall corner before entering
    walk(5.2, -6.2); walk(3.2, -6.2); walk(3.2, 1.4);
    const stairsStillWork = Math.abs(game.position.y - 3.6) < .01;
    walk(0, 1.4); walk(0, -4.3); key('e');
    const waitingY = game.position.y; let waitBudget = 240;
    while (game.state.elevator.phase !== 'open' && waitBudget-- > 0) game.update(.05);
    const emptyCall = waitBudget > 0 && game.position.y === waitingY && game.state.elevator.floor === 1 && !game.state.elevator.riding;
    walk(0, -6.2); const down = journey(0); walk(0, -4.3); const groundExit = { ...game.position };
    // A body crossing the sill must never trigger departure.
    walk(0, -5.2); key('3'); const sillSafe = game.state.elevator.phase === 'open' && !game.state.elevator.riding;
    walk(0, -6.2); key('3'); tick(35); key('h');
    const homeResets = game.state.elevator.phase === 'closed' && car.position.y === 0 && !game.state.elevator.riding && game.position.z === 11.5;
    game.init(); const restartResets = game.state.elevator.y === 0 && game.state.elevator.door === 0;
    game.destroy(); const cleaned = !canvas.dataset.villaElevator; canvas.remove();
    return { gateStopped, partialGateStopped, up, down, roofExit, groundExit, stairsStillWork, emptyCall, sillSafe, homeResets, restartResets, cleaned, scores, cabinImage };
  }, moduleUrl());
  for (const flag of ['gateStopped', 'partialGateStopped', 'stairsStillWork', 'emptyCall', 'sillSafe', 'homeResets', 'restartResets', 'cleaned'] as const) expect(result[flag], flag).toBe(true);
  for (const trip of [result.up, result.down]) {
    expect(trip).toMatchObject({ continuous: true, aligned: true, sealed: true, stationaryXZ: true, canLook: true });
    expect(trip.door).toBeCloseTo(.66, 5);
  }
  expect(result.up.y).toBe(7.2); expect(result.down.y).toBe(0);
  expect(result.roofExit.y).toBe(7.2); expect(result.groundExit.y).toBe(0);
  expect(result.scores).toBe(0); expect(errors).toEqual([]);
  await test.info().attach('elevator-roof-cabin', { body: Buffer.from(result.cabinImage.split(',')[1], 'base64'), contentType: 'image/png' });
});

test('villa elevator floor buttons accept real coarse-pointer taps', async ({ browser }) => {
  test.setTimeout(60_000);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  try {
    await page.goto('/#/snake');
    const button = await page.evaluate(async url => {
      const { VillaGame } = await import(url);
      const canvas = document.createElement('canvas'); canvas.id = 'lift-touch';
      Object.assign(canvas.style, { position: 'fixed', top: '20px', left: '10px', zIndex: '10000' }); document.body.append(canvas);
      const game = new VillaGame({ canvas, logicalWidth: 1120, logicalHeight: 700, isDarkTheme: () => false, isZhLang: () => true, isPixelMode: () => false, getRecord: () => null, reportScore: () => {}, requestShellRender: () => {} }) as any;
      game.prepare(); game.start(); cancelAnimationFrame(game.animationId); game.setDisplayScale(370);
      (window as any).liftGame = game;
      for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) canvas.addEventListener(type, e => game.handleInput(e), { passive: false });
      const key = (key: string, type = 'keydown') => game.handleInput(new KeyboardEvent(type, { key }));
      const tick = (n: number) => { for (let i = 0; i < n; i++) game.update(.05); };
      key('h'); key('w'); tick(125); key('w', 'keyup'); key('e'); tick(18);
      key('w'); tick(9); key('w', 'keyup'); game.renderFrame();
      const b = game.buttons().find((b: any) => b.id === 'elevator-2'); if (!b) throw new Error('No cabin floor button');
      const r = canvas.getBoundingClientRect();
      return { x: r.x + (b.x + b.w / 2) * r.width / 1120, y: r.y + (b.y + b.h / 2) * r.height / 700, w: b.w * r.width / 1120, h: b.h * r.height / 700 };
    }, moduleUrl());
    expect(button.w).toBeGreaterThanOrEqual(44); expect(button.h).toBeGreaterThanOrEqual(43);
    await page.touchscreen.tap(button.x, button.y);
    const state = await page.evaluate(() => {
      const game = (window as any).liftGame;
      const accepted = game.state.elevator.target === 2 && game.state.elevator.riding;
      for (let i = 0; i < 210; i++) game.update(.05);
      const result = { accepted, y: game.position.y, phase: game.state.elevator.phase };
      game.destroy(); game.canvas.remove(); return result;
    });
    expect(state).toEqual({ accepted: true, y: 7.2, phase: 'open' });
  } finally { await context.close(); }
});

test('villa shell supports a real keyboard elevator trip and walking out', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/#/villa'); const canvas = page.locator('#gameCanvas');
  await expect(canvas).toHaveAttribute('data-villa-renderer', 'webgl', { timeout: 30_000 });
  await page.locator('#startOverlay').click();
  await page.waitForFunction(() => document.pointerLockElement === document.getElementById('gameCanvas'));
  await page.keyboard.press('h');
  await page.keyboard.down('Shift'); await page.keyboard.down('w');
  await page.waitForFunction(() => JSON.parse(document.getElementById('gameCanvas')!.dataset.villaPosition!).z < -4.1, null, { timeout: 45_000 });
  await page.keyboard.up('w'); await page.keyboard.up('Shift'); await page.keyboard.press('e');
  await page.waitForFunction(() => JSON.parse(document.getElementById('gameCanvas')!.dataset.villaElevator!).phase === 'open');
  await page.keyboard.down('w');
  await page.waitForFunction(() => JSON.parse(document.getElementById('gameCanvas')!.dataset.villaPosition!).z < -5.75);
  await page.keyboard.up('w'); await page.keyboard.press('2');
  await page.waitForFunction(() => { const e = JSON.parse(document.getElementById('gameCanvas')!.dataset.villaElevator!); return e.floor === 2 && e.phase === 'open'; }, null, { timeout: 60_000 });
  await expect(canvas).toHaveAttribute('data-villa-floor', '2');
  await page.keyboard.down('s');
  await page.waitForFunction(() => JSON.parse(document.getElementById('gameCanvas')!.dataset.villaPosition!).z > -4.7);
  await page.keyboard.up('s'); await page.keyboard.press('Escape');
  expect(JSON.parse((await canvas.getAttribute('data-villa-position'))!).y).toBe(3.6);
  await expect(canvas).not.toHaveAttribute('data-villa-room', 'elevator');
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/villa-elevator-shell.png' });
});
