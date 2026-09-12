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
    key('h'); walk(0, 1.4); walk(4.55, 1.4); walk(4.55, -3.8); key('w'); tick(15); key('w', 'keyup');
    const gateStopped = game.position.z > -4.32;
    key('e'); tick(8); key('w'); tick(4); key('w', 'keyup');
    const partialGateStopped = game.position.z > -4.32;
    tick(6); walk(4.55, -5.8);
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
    walk(4.55, -3.8); const roofExit = { ...game.position };
    // Leave by the swapped staircase, then summon the now-empty car downstairs.
    walk(4.55, 2); walk(2.06, 2); walk(2.06, 1.4); // clear the pavilion's side-wall corner before entering
    walk(2.06, -6.2); walk(0.04, -6.2); walk(0.04, 1.4);
    const stairsStillWork = Math.abs(game.position.y - 3.6) < .01;
    walk(0.04, 1.4); walk(4.55, -3.8); key('e');
    const waitingY = game.position.y; let waitBudget = 240;
    while (game.state.elevator.phase !== 'open' && waitBudget-- > 0) game.update(.05);
    const emptyCall = waitBudget > 0 && game.position.y === waitingY && game.state.elevator.floor === 1 && !game.state.elevator.riding;
    walk(4.55, -5.8); const down = journey(0); walk(4.55, -3.8); const groundExit = { ...game.position };
    // A body crossing the sill must never trigger departure.
    walk(4.55, -4.0); key('3'); const sillSafe = game.state.elevator.phase === 'open' && !game.state.elevator.riding;
    walk(4.55, -5.8); key('3'); tick(35); key('h');
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

test('villa car panel lists floors top-first and drives real open/close buttons', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/#/snake');
  const url = '/' + JSON.parse(readFileSync(join(process.cwd(), 'dist/.vite/manifest.json'), 'utf8'))['src/games/villa.ts'].file;
  const result = await page.evaluate(async url => {
    const { VillaGame } = await import(url);
    const canvas = document.createElement('canvas'); document.body.append(canvas);
    const game = new VillaGame({ canvas, logicalWidth: 1120, logicalHeight: 700, isDarkTheme: () => false, isZhLang: () => false,
      isPixelMode: () => false, getRecord: () => null, reportScore: () => {}, requestShellRender: () => {} }) as any;
    game.prepare(); game.start(); cancelAnimationFrame(game.animationId);
    const panel = () => game.buttons().filter((b: any) => b.id.startsWith('elevator-'));
    game.state.elevator.riding = true; game.state.elevator.phase = 'open'; game.state.elevator.door = 1;
    game.position = { x: 4.55, y: 0, z: -5.8 }; game.eyeY = 0;
    const buttons = panel().map((b: any) => ({ id: b.id, label: b.label, x: b.x, y: b.y, w: b.w, h: b.h }));
    const floors = buttons.slice(0, 3), doors = buttons.slice(3);
    const topFirst = buttons.map((b: any) => b.id).join(',') === 'elevator-2,elevator-1,elevator-0,elevator-open,elevator-close';
    const oneRow = floors.every((b: any) => b.y === floors[0].y) && doors[0].y > floors[0].y;
    const ordered = floors.map((b: any) => b.x).every((x: number, i: number) => i === 0 || x > floors[i - 1].x);
    const bigEnough = buttons.every((b: any) => Math.min(b.w, b.h) >= 44);
    // Real clicks on the painted panel: a manual floor starts a trip, Close shuts the doors early.
    const hit = (id: string) => { const b = panel().find((x: any) => x.id === id); game.activate(id); return !!b; };
    hit('elevator-2');
    const called = game.state.elevator.target === 2;
    game.state.elevator.phase = 'open'; game.state.elevator.door = 1; game.state.elevator.target = game.state.elevator.floor;
    hit('elevator-close');
    const closed = game.state.elevator.phase === 'closing';
    hit('elevator-open');
    const opened = game.state.elevator.phase === 'opening' || game.state.elevator.phase === 'open';
    game.destroy(); canvas.remove();
    return { topFirst, oneRow, ordered, bigEnough, called, closed, opened, labels: buttons.map((b: any) => b.label) };
  }, url);
  expect(result.labels).toEqual(['3F', '2F', '1F', 'Open', 'Close']);
  for (const flag of ['topFirst', 'oneRow', 'ordered', 'bigEnough', 'called', 'closed', 'opened'] as const) expect(result[flag], flag).toBe(true);
  expect(errors).toEqual([]);
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
      key('h'); walk(0, 1.4); walk(4.55, 1.4); walk(4.55, -3.8); key('e'); tick(18);
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
  test.setTimeout(180_000);
  // Test live keyboard travel, not oversized software-renderer throughput.
  // Full viewport/DPR coverage lives in game-window.spec.ts.
  await page.setViewportSize({ width: 960, height: 540 });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/#/villa'); const canvas = page.locator('#gameCanvas');
  await expect(canvas).toHaveAttribute('data-villa-renderer', 'webgl', { timeout: 30_000 });
  await expect(canvas).toHaveAttribute('data-game-running', 'true');
  // Entering plays immediately; the first canvas click grants mouse capture.
  await canvas.click();
  await page.waitForFunction(() => document.pointerLockElement === document.getElementById('gameCanvas'));
  await page.keyboard.press('h');
  // The swapped lift sits east of the hall and the staircase now fills x~0, so
  // walk the west aisle, cross SOUTH of the open stairwell, then turn north.
  // Keys are real native presses; the stop condition is checked inside the page
  // on every poll, so a fast run cannot overshoot a half-metre doorway while
  // Node-side polling catches up.
  // Real key presses still drive the trip; the fixture only removes the long
  // walk to the lift, because holding a key while Node polls cannot stop inside
  // the half-metre doorway and overshoots into the pocket behind the x=-2 wall.
  // Each leg runs inside the page: one native key is held and the live telemetry
  // is sampled between simulation frames, so the walker stops right at the
  // threshold instead of overshooting while a Node round trip is in flight.
  const walk = await page.evaluate(async () => {
    const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    const position = () => JSON.parse(canvas.dataset.villaPosition!) as { x: number; y: number; z: number };
    const press = (key: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key }));
    const release = (key: string) => window.dispatchEvent(new KeyboardEvent('keyup', { key }));
    const legs: Array<[string, (p: { x: number; y: number; z: number }) => boolean, string]> = [
      ['w', p => p.z < 7.9, 'front doorway'],
      ['w', p => p.z < 1.3, 'hall, clear of the flight'],
      ['d', p => p.x > 4.45, 'east across the hall'],
      ['w', p => p.z < -3.35, 'lift doorway'],
    ];
    for (const [key, done, label] of legs) {
      press(key);
      const deadline = performance.now() + 30_000;
      while (!done(position()) && performance.now() < deadline) await new Promise(r => setTimeout(r, 16));
      release(key);
      if (!done(position())) return { stuck: `${label} at ${JSON.stringify(position())}` };
    }
    return { at: position(), room: canvas.dataset.villaRoom, hotspot: null };
  });
  expect(walk.stuck ?? '', JSON.stringify(walk)).toBe('');
  expect(walk.room).toBe('gallery');
  await page.keyboard.press('e');
  await page.waitForFunction(() => JSON.parse(document.getElementById('gameCanvas')!.dataset.villaElevator!).phase === 'open');
  await page.keyboard.down('w');
  await page.waitForFunction(() => JSON.parse(document.getElementById('gameCanvas')!.dataset.villaPosition!).z < -5.5);
  await page.keyboard.up('w'); await page.keyboard.press('2');
  await expect.poll(async () => JSON.parse((await canvas.getAttribute('data-villa-elevator'))!), {
    message: 'The real floor-selection key must begin a passenger trip',
  }).toMatchObject({ target: 2, riding: true });
  await page.waitForFunction(() => { const e = JSON.parse(document.getElementById('gameCanvas')!.dataset.villaElevator!); return e.floor === 2 && e.phase === 'open'; }, null, { timeout: 60_000 });
  await expect(canvas).toHaveAttribute('data-villa-floor', '2');
  // Walk out of the car and keep going until the room really changes, rather
  // than a fixed distance that can leave the player still inside the lift zone.
  await page.keyboard.down('s');
  await page.waitForFunction(() => (document.getElementById('gameCanvas') as HTMLCanvasElement).dataset.villaRoom !== 'elevator', null, { timeout: 30_000 });
  await page.keyboard.up('s'); await page.keyboard.press('Escape');
  expect(JSON.parse((await canvas.getAttribute('data-villa-position'))!).y).toBe(3.6);
  await expect(canvas).not.toHaveAttribute('data-villa-room', 'elevator');
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/villa-elevator-shell.png' });
});
