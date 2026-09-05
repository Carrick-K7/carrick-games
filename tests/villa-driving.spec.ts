import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const villaUrl = () => '/' + JSON.parse(readFileSync(join(process.cwd(), 'dist/.vite/manifest.json'), 'utf8'))['src/games/villa.ts'].file;

test('villa sedan drives out to the practice course, turns, safely exits at an angle and completes a corner', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/#/snake');
  const result = await page.evaluate(async url => {
    const { VillaGame } = await import(url);
    const canvas = document.createElement('canvas'); document.body.append(canvas);
    let scores = 0;
    const game = new VillaGame({ canvas, logicalWidth: 1120, logicalHeight: 700, isDarkTheme: () => false, isZhLang: () => false, isPixelMode: () => false, getRecord: () => null, reportScore: () => scores++, requestShellRender: () => {} }) as any;
    game.prepare(); game.start(); cancelAnimationFrame(game.animationId);
    const key = (key: string, down = true) => game.handleInput(new KeyboardEvent(down ? 'keydown' : 'keyup', { key }));
    const tick = (n: number) => { for (let i = 0; i < n; i++) game.update(.05); };
    const walk = (x: number, z: number) => {
      for (const axis of ['x', 'z']) {
        const target = axis === 'x' ? x : z; let budget = 600;
        while (Math.abs(game.position[axis] - target) > .005 && budget-- > 0) {
          const diff = target - game.position[axis]; game.yaw = axis === 'x' ? (diff > 0 ? -Math.PI / 2 : Math.PI / 2) : (diff > 0 ? Math.PI : 0);
          key('w'); game.update(Math.min(.05, Math.abs(diff) / 2.75)); key('w', false);
        }
        if (budget <= 0) throw new Error('Walking blocked: ' + JSON.stringify(game.position));
      }
    };
    const cruise = () => { key('w'); key(' ', game.state.driving.speed > 2.6); tick(1); };
    const until = (condition: () => boolean, max = 900) => { while (!condition() && max-- > 0) cruise(); if (max <= 0) throw new Error('Drive blocked: ' + JSON.stringify(game.state.driving)); };
    const stop = () => { key('w', false); key('d', false); key('a', false); key(' '); tick(24); key(' ', false); };
    key('h'); walk(0, 1.4); walk(13.4, 1.4); walk(18.55, 1.4); walk(18.55, -2.45);
    key('e'); tick(14); key('e'); tick(30);
    const seated = game.state.seated;
    until(() => game.state.driving.z > 29);
    const reachedCourse = game.state.driving.z, room = canvas.dataset.villaRoom;
    key('e'); key('q');
    const movingDoorSafe = game.state.seated === 'car' && !game.state.carDoorOpen && game.exitCarAt === Infinity;
    key('c'); const noCarCrouch = !game.motion.crouched;
    game.look(50, 0, .0023); const relativeLook = game.yaw - Math.PI - game.state.driving.yaw;
    until(() => game.state.driving.z >= 41.8);
    key('d'); until(() => game.state.driving.yaw <= -.72, 200); stop();
    const angle = game.state.driving.yaw;
    const lookFollowsBody = Math.abs((game.yaw - Math.PI - game.state.driving.yaw) - relativeLook) < 1e-6;
    const parked = { x: game.state.driving.x, z: game.state.driving.z, yaw: angle };
    key('e'); tick(25); const angledExit = game.state.seated === null;
    const exit = { ...game.position };
    walk(exit.x + Math.cos(angle) * .5, exit.z - Math.sin(angle) * .5); walk(exit.x, exit.z);
    key('e'); tick(30); const reentered = game.state.seated;
    key('d'); until(() => game.state.driving.yaw <= -1.48, 240); key('d', false);
    until(() => game.state.driving.x <= 9.2, 240); stop();
    const corner = game.state.driving.cornerCheckpoint;
    const vehicle = game.scene.scene.getObjectByName('villa-vehicle');
    const poseSynced = Math.abs(vehicle.position.x - game.state.driving.x) < 1e-9 && Math.abs(vehicle.position.z - game.state.driving.z) < 1e-9 && Math.abs(vehicle.rotation.y - game.state.driving.yaw) < 1e-9;
    game.scene.softwareInputFrames = 0; game.scene.lastDrawAt = -Infinity; game.renderFrame(); const image = canvas.toDataURL();
    const stopped = game.state.driving.speed === 0 && game.position.y === 0 && game.motion.offset === 0;
    key('r'); tick(30); const reset = { x: game.state.driving.x, z: game.state.driving.z, speed: game.state.driving.speed, seated: game.state.seated };
    key('w'); tick(16); game.clearInput(); tick(30); const blurStops = game.state.driving.speed === 0;
    key('h'); const home = { seat: game.state.seated, speed: game.state.driving.speed, z: game.position.z };
    game.destroy(); const cleaned = !Object.keys(canvas.dataset).some(k => k.startsWith('villa')); canvas.remove();
    return { seated, reachedCourse, room, movingDoorSafe, noCarCrouch, angle, lookFollowsBody, parked, angledExit, reentered, corner, poseSynced, stopped, reset, blurStops, home, scores, cleaned, image };
  }, villaUrl());
  expect(result.seated).toBe('car'); expect(result.reachedCourse).toBeGreaterThan(29); expect(result.room).toBe('driving-course');
  expect(result.movingDoorSafe).toBe(true); expect(result.noCarCrouch).toBe(true); expect(Math.abs(result.angle)).toBeGreaterThan(.7); expect(Math.abs(result.angle)).toBeLessThan(1.1);
  expect(result.lookFollowsBody).toBe(true); expect(result.angledExit).toBe(true); expect(result.reentered).toBe('car');
  expect(result.corner).toBe(4); expect(result.poseSynced).toBe(true); expect(result.stopped).toBe(true);
  expect(result.reset).toEqual({ x: 16.2, z: -2.6, speed: 0, seated: 'car' }); expect(result.blurStops).toBe(true);
  expect(result.home).toEqual({ seat: null, speed: 0, z: 11.5 }); expect(result.cleaned).toBe(true); expect(result.scores).toBe(0); expect(errors).toEqual([]);
  await test.info().attach('driving-practice-cockpit', { body: Buffer.from(result.image.split(',')[1], 'base64'), contentType: 'image/png' });
});

test('villa rejects an exit across the garage wall and stops at the rendered garden fence', async ({ page }) => {
  await page.goto('/#/snake');
  const result = await page.evaluate(async url => {
    const { VillaGame } = await import(url); const canvas = document.createElement('canvas'); document.body.append(canvas);
    const game = new VillaGame({ canvas, logicalWidth: 1120, logicalHeight: 700, isDarkTheme: () => false, isZhLang: () => false, isPixelMode: () => false, getRecord: () => null, reportScore: () => {}, requestShellRender: () => {} }) as any;
    game.prepare(); game.start(); cancelAnimationFrame(game.animationId);
    const key = (key: string, down = true) => game.handleInput(new KeyboardEvent(down ? 'keydown' : 'keyup', { key }));
    const tick = (n: number) => { for (let i = 0; i < n; i++) game.update(.05); };
    // Deliberate collision-fixture placement: the car fits, but its driver doorway faces an intact wall.
    Object.assign(game.state.driving, { x: 18.5, z: -.8, yaw: 0, speed: 0, steering: 0 });
    game.state.seated = 'car'; game.position = { x: 18.93, y: 0, z: -.75 }; game.yaw = Math.PI;
    game.scene.updateActivities(game.time, game.state);
    key('e'); key('q'); tick(30);
    const rejectsWallExit = game.state.seated === 'car' && !game.state.carDoorOpen && game.exitCarAt === Infinity;
    Object.assign(game.state.driving, { x: 21, z: 12, yaw: Math.PI / 2, speed: 0, steering: 0 });
    game.yaw = Math.PI * 1.5; game.scene.updateActivities(game.time, game.state);
    key('w'); tick(120); key('w', false);
    const fence = { x: game.state.driving.x, contact: game.state.driving.contact, speed: game.state.driving.speed };
    game.destroy(); canvas.remove(); return { rejectsWallExit, fence };
  }, villaUrl());
  expect(result.rejectsWallExit).toBe(true); expect(result.fence.x).toBeGreaterThan(21); expect(result.fence.x).toBeLessThan(22.5);
  expect(result.fence.contact).toBe(true); expect(result.fence.speed).toBe(0);
});
