import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('villa upgrades are physical models with reachable car seats, simulator inputs and safe running', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
  await page.goto('/#/snake');
  const manifest = JSON.parse(readFileSync(join(process.cwd(), 'dist/.vite/manifest.json'), 'utf8'));
  const result = await page.evaluate(async url => {
    const { VillaGame } = await import(url);
    const canvas = document.createElement('canvas');
    canvas.style.width = '1120px'; canvas.style.height = '700px'; document.body.append(canvas);
    let scores = 0;
    const game = new VillaGame({ canvas, logicalWidth: 1120, logicalHeight: 700, isDarkTheme: () => false, isZhLang: () => true, isPixelMode: () => false, getRecord: () => null, reportScore: () => scores++, requestShellRender: () => {} }) as any;
    game.prepare(); game.start(); cancelAnimationFrame(game.animationId);
    const scene = game.scene, originalLowSpec = scene.lowSpec;
    scene.lowSpec = true; scene.softwareInputFrames = 0; scene.lastDrawAt = -Infinity;
    game.renderFrame(); const renderedFrame = scene.renderer.info.render.frame;
    // Simulate delayed browser compositing: cached input frames must still run
    // even when the previous draw's wall-clock budget has already expired.
    for (let i = 0; i < 3; i++) { scene.lastDrawAt = -Infinity; game.update(0.05); game.renderFrame(); }
    const yieldsInputFrames = scene.renderer.info.render.frame === renderedFrame;
    scene.lowSpec = originalLowSpec;
    const key = (key: string, type = 'keydown') => game.handleInput(new KeyboardEvent(type, { key }));
    const tick = (count: number) => { for (let i = 0; i < count; i++) game.update(0.05); };
    const walk = (x: number, z: number) => {
      for (const axis of ['x', 'z']) {
        const target = axis === 'x' ? x : z;
        let budget = 500;
        while (Math.abs(game.position[axis] - target) > 0.005 && budget-- > 0) {
          const diff = target - game.position[axis];
          game.yaw = axis === 'x' ? (diff > 0 ? -Math.PI / 2 : Math.PI / 2) : (diff > 0 ? Math.PI : 0);
          key('w'); game.update(Math.min(0.05, Math.abs(diff) / 2.75)); key('w', 'keyup');
        }
        if (budget <= 0) throw new Error(`Blocked walking to ${x},${z}: ${JSON.stringify(game.position)}`);
      }
    };
    const world = game.scene.scene;
    const vehicle = world.getObjectByName('villa-vehicle');
    const door = world.getObjectByName('vehicle-driver-door');
    const modelData: any = {};
    let invalidVertices = 0, meshCount = 0, tv: HTMLCanvasElement | null = null;
    world.traverse((o: any) => {
      if (o.userData.keyboardKeys && o.userData.consoleSources) modelData.gaming = o.userData;
      if (o.userData.snooker) modelData.snooker = o.userData.snooker;
      if (o.userData.kitchen) modelData.kitchen = o.userData.kitchen;
      if (o.isMesh) {
        meshCount++;
        for (const name of ['position', 'normal']) {
          const a = o.geometry.attributes[name]?.array;
          if (a) for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) invalidVertices++;
        }
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (m.map?.image?.width === 960 && m.map.image.height === 540) tv = m.map.image;
        }
      }
    });
    modelData.vehicle = vehicle.userData;

    key('h'); key('w'); tick(10); key('w', 'keyup'); const walking = 11.5 - game.position.z;
    key('h'); key('Shift'); key('w'); tick(10); key('w', 'keyup'); key('Shift', 'keyup'); const running = 11.5 - game.position.z;
    key('h'); key('m'); const beforePanel = JSON.stringify(game.position); key('w');
    const close = game.closeButton(); game.clickUi({ x: close.x + close.w / 2, y: close.y + close.h / 2 }); tick(1);
    const panelClearsMovement = JSON.stringify(game.position) === beforePanel && game.keys.size === 0;

    // Actual walking through furnished rooms; only the documented H action resets position.
    key('h'); walk(0, 1.4); walk(7.1, 1.4); walk(7.1, -3.8);
    const snookerVisited = game.visited.has('snooker');
    game.yaw = -Math.PI / 2; key('Shift'); key('w'); tick(12); key('w', 'keyup'); key('Shift', 'keyup');
    const tableBlocksRun = game.position.x < 7.86 && game.position.x > 7.5;
    walk(7.1, -3.8); walk(7.1, 1.4); walk(13.4, 1.4); walk(18.55, 1.4); walk(18.55, -2.45);
    key('e'); tick(14); const openAngle = door.rotation.y;
    const doorHasGlazing = door.children.some((o: any) => o.userData.kind === 'glazing');
    key('e'); key('q'); const doorStaysOpenDuringEntry = game.state.carDoorOpen;
    tick(27); const seat = game.state.seated;
    game.renderFrame(); const carImage = canvas.toDataURL('image/png');
    const seatEye = game.scene.camera.position.y;
    const seatedPosition = JSON.stringify(game.position);
    key('Shift'); key('w'); tick(12); key('w', 'keyup'); key('Shift', 'keyup');
    const seatedDoesNotWalk = JSON.stringify(game.position) === seatedPosition;
    key('q'); tick(14); const qOpens = door.rotation.y < -1.09;
    key('q'); tick(14); const qCloses = Math.abs(door.rotation.y) < 0.001;
    key('e'); tick(25); const exited = { seat: game.state.seated, ...game.position };
    walk(18.55, -1.3); key('e'); const fenderCannotEnter = game.state.seated === null;
    // A restart must reset both the visible door and its mutable collider immediately.
    game.init(); const restartDoorClosed = !game.state.carDoorOpen && game.scene.vehicle.doorProgress === 0 && door.rotation.y === 0;

    key('h'); walk(0, 1.4); walk(4.2, 1.4); walk(4.2, 6.2); walk(8.15, 6.2);
    key('e'); tick(12); const racingSeat = game.state.seated;
    const screenFrames: string[] = [], sources: string[] = [];
    for (let i = 0; i < 3; i++) {
      game.renderFrame(); sources.push(game.state.screenSource);
      screenFrames.push((tv as unknown as HTMLCanvasElement).toDataURL());
      key('q');
    }
    const screenImage = canvas.toDataURL('image/png');
    key('e'); tick(10);
    const racingExit = { seat: game.state.seated, ...game.position };
    walk(4.2, 6.2); walk(4.2, 6.45); walk(3.1, 6.45); key('e');
    const lightsOff = !game.state.displayLights;
    walk(4.2, 6.45); walk(4.2, 4.9); walk(6.65, 4.9); key('e');
    const pcOff = !game.state.gaming;
    game.destroy(); canvas.remove();
    return { modelData, invalidVertices, meshCount, yieldsInputFrames, walking, running, panelClearsMovement, snookerVisited, tableBlocksRun,
      openAngle, doorHasGlazing, doorStaysOpenDuringEntry, seat, seatEye, seatedDoesNotWalk, qOpens, qCloses, exited, fenderCannotEnter, restartDoorClosed,
      racingSeat, sources, distinctScreenFrames: new Set(screenFrames).size, racingExit, lightsOff, pcOff, scores, carImage, screenImage };
  }, `/${manifest['src/games/villa.ts'].file}`);
  expect(result.yieldsInputFrames).toBe(true);
  expect(result.invalidVertices).toBe(0);
  expect(result.meshCount).toBeGreaterThan(80);
  expect(result.modelData.vehicle.hollowCabin).toBe(true);
  expect(result.modelData.gaming).toMatchObject({ keyboardKeys: 87, fanCount: 3, replicaNames: ['AK47', 'MosinNagant', 'MP5K'], consoleSources: ['pc', 'ps', 'switch'], virtualInputs: true });
  expect(result.modelData.gaming.figureNames).toHaveLength(9);
  expect(result.modelData.snooker).toMatchObject({ ballCount: 22, redCount: 15, pocketCount: 6 });
  expect(result.modelData.kitchen.components).toEqual(expect.arrayContaining(['four-zone hob', 'wall-mounted extractor', 'fridge-freezer', 'dishwasher', 'recessed sink']));
  expect(result.walking).toBeCloseTo(1.375, 6); expect(result.running).toBeCloseTo(2.9, 6);
  expect(result.panelClearsMovement).toBe(true); expect(result.snookerVisited).toBe(true); expect(result.tableBlocksRun).toBe(true);
  expect(result.openAngle).toBeCloseTo(-1.1, 5); expect(result.doorHasGlazing).toBe(true);
  expect(result.doorStaysOpenDuringEntry).toBe(true);
  expect(result.seat).toBe('car'); expect(result.seatEye).toBeCloseTo(1.16, 5);
  expect(result.seatedDoesNotWalk).toBe(true); expect(result.qOpens).toBe(true); expect(result.qCloses).toBe(true);
  expect(result.exited).toMatchObject({ seat: null, x: 18.55, y: 0, z: -2.45 });
  expect(result.fenderCannotEnter).toBe(true); expect(result.restartDoorClosed).toBe(true);
  expect(result.racingSeat).toBe('racing'); expect(result.sources).toEqual(['pc', 'ps', 'switch']); expect(result.distinctScreenFrames).toBe(3);
  expect(result.racingExit).toMatchObject({ seat: null, x: 8.15, y: 0, z: 6.2 });
  expect(result.lightsOff).toBe(true); expect(result.pcOff).toBe(true); expect(result.scores).toBe(0); expect(errors).toEqual([]);
  await test.info().attach('sedan-driver-seat', { body: Buffer.from(result.carImage.split(',')[1], 'base64'), contentType: 'image/png' });
  await test.info().attach('simulator-screen', { body: Buffer.from(result.screenImage.split(',')[1], 'base64'), contentType: 'image/png' });
});
