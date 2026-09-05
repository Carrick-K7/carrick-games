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
    // Controller ticks deliberately do not redraw GL textures/transforms. Force
    // only snapshots, leaving the cached-input-frame regression above intact.
    const forceRender = () => { scene.softwareInputFrames = 0; scene.lastDrawAt = -Infinity; game.renderFrame(); };
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
    const figures: any[] = [], legacyFigureNames: string[] = [];
    let invalidVertices = 0, meshCount = 0, tv: HTMLCanvasElement | null = null;
    world.traverse((o: any) => {
      if (o.userData.keyboardKeys && o.userData.consoleSources) modelData.gaming = o.userData;
      if (/^originalChibiGirl-\d+$/.test(o.name)) figures.push(o.userData);
      if (/miku/i.test(o.name) || /miku/i.test(JSON.stringify(o.userData))) legacyFigureNames.push(o.name);
      if (o.name === 'originalChibiGirlWall') modelData.figureWall = o.userData;
      if (o.name === 'interactiveRacingWheel') modelData.wheel = { batches: o.children.length, castsShadow: o.children.some((child: any) => child.castShadow) };
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
    forceRender(); const carImage = canvas.toDataURL('image/png');
    const seatEye = game.scene.camera.position.y;
    const garagePose = { x: game.state.driving.x, z: game.state.driving.z, yaw: game.state.driving.yaw };
    const carChecks: any = {};
    key('Shift'); key('w'); tick(12); key('w', 'keyup'); key('Shift', 'keyup');
    const driven = { ...game.state.driving };
    carChecks.movesCar = Math.hypot(driven.x - garagePose.x, driven.z - garagePose.z) > .1 && driven.speed > 0;
    const seatX = driven.x + Math.cos(driven.yaw) * .43 + Math.sin(driven.yaw) * .05;
    const seatZ = driven.z - Math.sin(driven.yaw) * .43 + Math.cos(driven.yaw) * .05;
    carChecks.lockedToSeat = game.state.seated === 'car' && Math.abs(game.position.x - seatX) < 1e-6 && Math.abs(game.position.z - seatZ) < 1e-6;
    key(' '); tick(20); key(' ', 'keyup'); carChecks.brakes = game.state.driving.speed === 0;
    key('r'); tick(1);
    // Repeat the same throttle without Shift: driving is not avatar running.
    key('w'); tick(12); key('w', 'keyup');
    carChecks.shiftDoesNotBoost = Math.abs(game.state.driving.distance - driven.distance) < 1e-6 && Math.abs(game.state.driving.speed - driven.speed) < 1e-6;
    key(' '); tick(20); key(' ', 'keyup');
    key('r'); tick(1); forceRender();
    carChecks.resetToGarage = game.state.driving.speed === 0 && game.state.driving.distance === 0
      && game.state.driving.x === garagePose.x && game.state.driving.z === garagePose.z && game.state.driving.yaw === garagePose.yaw;
    // Legacy door/exit checks start stationary at the original garage anchors.
    key('q'); tick(14); const qOpens = door.rotation.y < -1.09;
    key('q'); tick(14); const qCloses = Math.abs(door.rotation.y) < 0.001;
    key('e'); tick(25); const exited = { seat: game.state.seated, ...game.position };
    walk(18.55, -1.3); key('e'); const fenderCannotEnter = game.state.seated === null;
    // A restart must reset both the visible door and its mutable collider immediately.
    game.init(); const restartDoorClosed = !game.state.carDoorOpen && game.scene.vehicle.doorProgress === 0 && door.rotation.y === 0;

    key('h'); walk(0, 1.4); walk(4.2, 1.4); walk(4.2, 6.2); walk(8.15, 6.2);
    // Entering the rig always selects the playable PC source, not a console demo.
    game.state.screenSource = 'switch';
    key('e'); tick(12); const racingSeat = game.state.seated;
    const racingChecks: any = { entrySource: game.state.screenSource };
    const racePosition = JSON.stringify(game.position);
    forceRender(); const parkedScreen = (tv as unknown as HTMLCanvasElement).toDataURL();
    key('w'); tick(20); key('w', 'keyup');
    racingChecks.accelerated = { speed: game.state.race.speed, distance: game.state.race.distance };
    forceRender(); racingChecks.pcScreenChanged = (tv as unknown as HTMLCanvasElement).toDataURL() !== parkedScreen;
    const laneBefore = game.state.race.lane;
    key('d'); tick(4); key('d', 'keyup');
    racingChecks.steeredRight = game.state.race.lane > laneBefore;
    forceRender(); const wheel = world.getObjectByName('interactiveRacingWheel');
    racingChecks.wheelFollowsSteer = Math.abs(wheel.rotation.z + game.state.race.steer * .55) < 1e-6 && Math.abs(wheel.rotation.z) > .1;
    const laneRight = game.state.race.lane;
    key('a'); tick(4); key('a', 'keyup');
    racingChecks.steeredLeft = game.state.race.lane < laneRight;
    const beforeBrake = game.state.race.speed;
    key('s'); tick(2); key('s', 'keyup');
    racingChecks.sBrakes = game.state.race.speed < beforeBrake;
    key(' '); tick(10); key(' ', 'keyup'); racingChecks.spaceStops = game.state.race.speed === 0;
    key('w'); tick(10); key('w', 'keyup');
    game.clearInput(); tick(10);
    racingChecks.clearInputStops = game.state.race.speed === 0 && game.keys.size === 0;
    key('d'); tick(4); key('d', 'keyup'); racingChecks.staysStoppedUntilThrottle = game.state.race.speed === 0;
    key('w'); tick(10); key('w', 'keyup'); racingChecks.freshThrottleRestarts = game.state.race.speed > 0;
    key('q'); const beforeInactive = JSON.stringify(game.state.race);
    key('w'); tick(5); key('w', 'keyup');
    racingChecks.consoleFreezesRace = JSON.stringify(game.state.race) === beforeInactive;
    key('q'); tick(3);
    racingChecks.switchFreezesRace = JSON.stringify(game.state.race) === beforeInactive;
    key('q');
    racingChecks.seatedDoesNotWalk = JSON.stringify(game.position) === racePosition;
    key('r'); tick(1);
    racingChecks.reset = { speed: game.state.race.speed, distance: game.state.race.distance, lane: game.state.race.lane, laps: game.state.race.laps, crashes: game.state.race.crashes };
    const screenFrames: string[] = [], sources: string[] = [];
    for (let i = 0; i < 3; i++) {
      forceRender(); sources.push(game.state.screenSource);
      screenFrames.push((tv as unknown as HTMLCanvasElement).toDataURL());
      key('q');
    }
    forceRender(); const screenImage = canvas.toDataURL('image/png');
    const beforeExitRace = JSON.stringify(game.state.race);
    key('e'); tick(10);
    racingChecks.exitFreezesRace = JSON.stringify(game.state.race) === beforeExitRace;
    const racingExit = { seat: game.state.seated, ...game.position };
    walk(4.2, 6.2); walk(4.2, 6.45); walk(3.1, 6.45); key('e');
    const lightsOff = !game.state.displayLights;
    walk(4.2, 6.45); walk(4.2, 4.9); walk(6.65, 4.9); key('e');
    const pcOff = !game.state.gaming;
    game.destroy(); canvas.remove();
    return { modelData, figures, legacyFigureNames, racingChecks, invalidVertices, meshCount, yieldsInputFrames, walking, running, panelClearsMovement, snookerVisited, tableBlocksRun,
      openAngle, doorHasGlazing, doorStaysOpenDuringEntry, seat, seatEye, carChecks, qOpens, qCloses, exited, fenderCannotEnter, restartDoorClosed,
      racingSeat, sources, distinctScreenFrames: new Set(screenFrames).size, racingExit, lightsOff, pcOff, scores, carImage, screenImage };
  }, `/${manifest['src/games/villa.ts'].file}`);
  expect(result.yieldsInputFrames).toBe(true);
  expect(result.invalidVertices).toBe(0);
  expect(result.meshCount).toBeGreaterThan(80);
  expect(result.modelData.vehicle.hollowCabin).toBe(true);
  expect(result.modelData.gaming).toMatchObject({ keyboardKeys: 87, fanCount: 3, replicaNames: ['AK47', 'MosinNagant', 'MP5K'], consoleSources: ['pc', 'ps', 'switch'], virtualInputs: true });
  expect(result.modelData.gaming).toMatchObject({ originalDesigns: true, modestClothing: true, playableRacing: true, dynamicTransforms: ['interactiveRacingWheel'] });
  expect(result.modelData.gaming.noDynamicTransforms).toBeUndefined();
  expect(result.modelData.gaming.figureNames).toHaveLength(9);
  expect(new Set(result.modelData.gaming.figureNames).size).toBe(9);
  expect(result.legacyFigureNames).toEqual([]);
  expect(result.modelData.figureWall).toMatchObject({ compartments: 9, variants: 9, originalDesigns: true, modestClothing: true, facing: '+X', frontMaxX: 2.564 });
  expect(result.figures).toHaveLength(9);
  expect(result.figures.map((figure: any) => figure.character).sort()).toEqual([...result.modelData.gaming.figureNames].sort());
  expect(new Set(result.figures.map((figure: any) => figure.hairstyle)).size).toBeGreaterThanOrEqual(3);
  for (const figure of result.figures) {
    expect(figure).toMatchObject({ authored3D: true, originalDesigns: true, modestClothing: true });
    expect(figure.clothing).toMatch(/long dress and cardigan|overalls and long-sleeve shirt|cardigan and trousers/);
    expect(figure.pose).toMatch(/^(wave|book|seed pouch)$/);
  }
  expect(result.modelData.wheel).toEqual({ batches: 3, castsShadow: false });
  expect(result.modelData.snooker).toMatchObject({ ballCount: 22, redCount: 15, pocketCount: 6 });
  expect(result.modelData.kitchen.components).toEqual(expect.arrayContaining(['four-zone hob', 'wall-mounted extractor', 'fridge-freezer', 'dishwasher', 'recessed sink']));
  expect(result.walking).toBeCloseTo(1.375, 6); expect(result.running).toBeCloseTo(2.9, 6);
  expect(result.panelClearsMovement).toBe(true); expect(result.snookerVisited).toBe(true); expect(result.tableBlocksRun).toBe(true);
  expect(result.openAngle).toBeCloseTo(-1.1, 5); expect(result.doorHasGlazing).toBe(true);
  expect(result.doorStaysOpenDuringEntry).toBe(true);
  expect(result.seat).toBe('car'); expect(result.seatEye).toBeCloseTo(1.16, 5);
  expect(result.carChecks).toEqual({ movesCar: true, lockedToSeat: true, brakes: true, shiftDoesNotBoost: true, resetToGarage: true });
  expect(result.qOpens).toBe(true); expect(result.qCloses).toBe(true);
  expect(result.exited).toMatchObject({ seat: null, x: 18.55, y: 0, z: -2.45 });
  expect(result.fenderCannotEnter).toBe(true); expect(result.restartDoorClosed).toBe(true);
  expect(result.racingSeat).toBe('racing'); expect(result.sources).toEqual(['pc', 'ps', 'switch']); expect(result.distinctScreenFrames).toBe(3);
  expect(result.racingChecks.entrySource).toBe('pc');
  expect(result.racingChecks.accelerated.speed).toBeGreaterThan(5);
  expect(result.racingChecks.accelerated.distance).toBeGreaterThan(2);
  expect(result.racingChecks).toMatchObject({ pcScreenChanged: true, steeredRight: true, steeredLeft: true, wheelFollowsSteer: true,
    sBrakes: true, spaceStops: true, clearInputStops: true, staysStoppedUntilThrottle: true, freshThrottleRestarts: true,
    consoleFreezesRace: true, switchFreezesRace: true, seatedDoesNotWalk: true, exitFreezesRace: true,
    reset: { speed: 0, distance: 0, lane: 0, laps: 0, crashes: 0 } });
  expect(result.racingExit).toMatchObject({ seat: null, x: 8.15, y: 0, z: 6.2 });
  expect(result.lightsOff).toBe(true); expect(result.pcOff).toBe(true); expect(result.scores).toBe(0); expect(errors).toEqual([]);
  await test.info().attach('sedan-driver-seat', { body: Buffer.from(result.carImage.split(',')[1], 'base64'), contentType: 'image/png' });
  await test.info().attach('simulator-screen', { body: Buffer.from(result.screenImage.split(',')[1], 'base64'), contentType: 'image/png' });
});
