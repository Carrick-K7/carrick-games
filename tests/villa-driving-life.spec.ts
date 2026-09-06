import { test, expect, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

async function fixture(page: Page) {
  await page.goto('/#/snake');
  const url = '/' + JSON.parse(readFileSync(join(process.cwd(), 'dist/.vite/manifest.json'), 'utf8'))['src/games/villa.ts'].file;
  await page.evaluate(async url => {
    const { VillaGame } = await import(url);
    const canvas = document.createElement('canvas'); document.body.append(canvas);
    let scores = 0;
    const game = new VillaGame({ canvas, logicalWidth: 1120, logicalHeight: 700, isDarkTheme: () => false, isZhLang: () => false, isPixelMode: () => false, getRecord: () => null, reportScore: () => scores++, requestShellRender: () => {} }) as any;
    game.prepare(); game.start(); cancelAnimationFrame(game.animationId);
    const key = (key: string, down = true) => game.handleInput(new KeyboardEvent(down ? 'keydown' : 'keyup', { key }));
    const tick = (n: number) => { for (let i = 0; i < n; i++) game.update(.05); };
    const pose = (p: { x: number; y: number; z: number }, yaw = 0, pitch = -.12) => {
      game.activate('home'); game.position = { ...p }; game.eyeY = p.y; game.yaw = yaw; game.pitch = pitch;
      game.scene.updateActivities(game.time, game.state); game.publishState();
    };
    const photo = () => { game.scene.softwareInputFrames = 0; game.scene.lastDrawAt = -Infinity; game.renderFrame(); return canvas.toDataURL(); };
    const walk = (x: number, z: number) => {
      for (const axis of ['x', 'z']) {
        const target = axis === 'x' ? x : z; let steps = 800;
        while (Math.abs(game.position[axis] - target) > .006 && steps-- > 0) {
          const diff = target - game.position[axis];
          game.yaw = axis === 'x' ? (diff > 0 ? -Math.PI / 2 : Math.PI / 2) : (diff > 0 ? Math.PI : 0);
          key('w'); game.update(Math.min(.05, Math.abs(diff) / 2.75)); key('w', false);
        }
        if (steps <= 0) throw new Error('Walking approach blocked: ' + JSON.stringify(game.position));
      }
    };
    const cleanup = () => { game.destroy(); const clean = !Object.keys(canvas.dataset).some(k => k.startsWith('villa')); canvas.remove(); return { clean, scores }; };
    tick(2); // Exercise real door interpolation, not the model's time-zero reset path.
    (window as any).__villaLife = { game, canvas, key, tick, pose, photo, walk, cleanup };
  }, url);
}
const attach = async (name: string, image: string) => {
  const path = test.info().outputPath(name + '.png');
  writeFileSync(path, Buffer.from(image.split(',')[1], 'base64'));
  await test.info().attach(name, { path, contentType: 'image/png' });
};

test('villa car uses one-action automatic doors, rotating cockpit wheel and safe cancellation', async ({ page }) => {
  test.setTimeout(90_000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await fixture(page);
  const r = await page.evaluate(() => {
    const { game: g, key, tick, pose, photo, cleanup } = (window as any).__villaLife;
    // Deliberate doorway fixture isolates the access sequence; the scenic-driving
    // regression separately walks the full real entrance-to-garage route.
    pose({ x: 18.55, y: 0, z: -2.45 }, Math.PI / 2);
    key('e'); const opening = g.state.carDoorOpen && g.state.seated === null && Number.isFinite(g.enterCarAt);
    const scheduled = g.enterCarAt, outside = { ...g.position };
    key('q'); key('e'); key('w'); key(' '); tick(5);
    const singleAction = g.enterCarAt === scheduled && g.position.x === outside.x && g.position.z === outside.z && g.motion.offset === 0;
    key('w', false); key(' ', false); tick(40);
    const entered = g.state.seated === 'car' && !g.state.carDoorOpen && g.scene.carDoorProgress === 0;
    key('d'); tick(3); key('d', false);
    const wheel = g.scene.scene.getObjectByName('vehicle-steering-wheel');
    const shaft = g.scene.scene.getObjectByName('vehicle-steering');
    const turnsRight = wheel.rotation.z > 0 && Math.abs(wheel.rotation.z - g.state.driving.steering * 4.5) < 1e-9 && shaft.rotation.z === 0;
    const cockpit = photo(); tick(20);
    const centred = wheel.rotation.z === 0;
    key('q'); tick(40);
    const exited = g.state.seated === null && !g.state.carDoorOpen && g.scene.carDoorProgress === 0 && g.canFit(1.75);
    const exit = { ...g.position };
    key('q'); tick(40); const boardedWithQ = g.state.seated === 'car';
    // A new obstacle arriving during door opening must not cause an unsafe exit.
    key('e'); tick(5);
    const wall = { minX: 18.25, maxX: 18.85, minZ: -2.8, maxZ: -2.1, minY: 0, maxY: 2 };
    const nc = g.scene.colliders.length, nd = g.scene.drivingObstacles.length;
    g.scene.colliders.push(wall); g.scene.drivingObstacles.push(wall); tick(40);
    const blocked = g.state.seated === 'car' && !g.state.carDoorOpen && g.scene.carDoorProgress === 0;
    g.scene.colliders.length = nc; g.scene.drivingObstacles.length = nd;
    key('e'); tick(40); key('e'); tick(3); key('h'); tick(45);
    const cancelled = g.state.seated === null && !g.state.carDoorOpen && g.enterCarAt === Infinity && g.exitCarAt === Infinity && g.position.z === 11.5;
    return { opening, singleAction, entered, turnsRight, centred, exited, exit, boardedWithQ, blocked, cancelled, cockpit, ...cleanup() };
  });
  for (const field of ['opening', 'singleAction', 'entered', 'turnsRight', 'centred', 'exited', 'boardedWithQ', 'blocked', 'cancelled', 'clean'] as const) expect(r[field], field).toBe(true);
  expect(r.exit).toEqual({ x: 18.55, y: 0, z: -2.45 }); expect(r.scores).toBe(0); expect(errors).toEqual([]);
  await attach('villa-updated-cockpit-steering', r.cockpit);
});

test('villa all sofas and pool-facing loungers support sitting, looking and safe standing', async ({ page }) => {
  test.setTimeout(90_000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await fixture(page);
  const r = await page.evaluate(() => {
    const { game: g, key, tick, pose, photo, cleanup } = (window as any).__villaLife;
    const furnishings = g.scene.scene.children.find((o: any) => o.userData.relaxSeats);
    const seats = furnishings.userData.relaxSeats, results = []; let poolView = '';
    g.touchMode = true;
    for (const seat of seats) {
      pose(seat.approach, seat.yaw, seat.pitch);
      const approachable = g.canFit(1.75) && g.hotspot()?.id === seat.id;
      key('e'); tick(12);
      const seated = g.state.seated === seat.kind && g.state.relaxSeatId === seat.id;
      const view = g.view(), position = { ...g.position }, yaw = g.yaw;
      const noPedals = !g.buttons().some((b: any) => ['brake', 'reset-activity', 'secondary', 'jump', 'crouch'].includes(b.id));
      if (seat.id === 'lounger-west') poolView = photo();
      key('w'); key(' '); key('arrowleft'); tick(5); key('w', false); key(' ', false); key('arrowleft', false);
      const anchored = JSON.stringify(position) === JSON.stringify(g.position) && g.motion.offset === 0 && g.yaw !== yaw;
      key('e'); tick(12);
      results.push({ id: seat.id, kind: seat.kind, approachable, seated, floor: view.y, height: view.eyeHeight, expectedFloor: seat.seat.y,
        expectedHeight: seat.eyeHeight, noPedals, anchored, stood: g.state.seated === null && g.canFit(1.75) && g.position.y === seat.seat.y });
    }
    const seat = seats.find((s: any) => s.id === 'sofa-master');
    pose(seat.approach, seat.yaw); key('e'); tick(12);
    const count = g.scene.colliders.length;
    for (const exit of seat.exits) g.scene.colliders.push({ minX: exit.x - .3, maxX: exit.x + .3, minZ: exit.z - .3, maxZ: exit.z + .3, minY: exit.y, maxY: exit.y + 2 });
    key('e'); tick(2); const blocked = g.state.relaxSeatId === seat.id;
    g.scene.colliders.length = count; key('e'); tick(12); const recovered = g.state.seated === null && g.canFit(1.75);
    const water = g.scene.scene.getObjectByName('villa-pool-water');
    const pool = { width: water.geometry.parameters.width, length: water.geometry.parameters.height, x: water.position.x, z: water.position.z };
    const tank = g.scene.scene.getObjectByName('aquarium/cabinet');
    const aquarium = { x: tank.position.x, z: tank.position.z };
    return { results, blocked, recovered, pool, aquarium, poolView, ...cleanup() };
  });
  expect(r.results).toHaveLength(7); expect(r.results.filter((s: any) => s.kind === 'sofa')).toHaveLength(5);
  for (const seat of r.results) {
    for (const field of ['approachable', 'seated', 'noPedals', 'anchored', 'stood']) expect(seat[field], seat.id + ':' + field).toBe(true);
    expect(seat.floor).toBe(seat.expectedFloor); expect(seat.height).toBe(seat.expectedHeight);
  }
  expect(r.blocked).toBe(true); expect(r.recovered).toBe(true); expect(r.clean).toBe(true); expect(r.scores).toBe(0);
  expect(r.pool.width).toBeCloseTo(8.7); expect(r.pool.length).toBe(14); expect(r.pool.x).toBeCloseTo(-18.85); expect(r.pool.z).toBe(-.5);
  expect(r.aquarium).toEqual({ x: -3.5, z: -.6 }); expect(errors).toEqual([]);
  await attach('villa-lounger-facing-enlarged-pool', r.poolView);
});

test('villa electric scooter has reachable parking, handbrake, steering and safe dismount/reset', async ({ page }) => {
  test.setTimeout(90_000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await fixture(page);
  const r = await page.evaluate(() => {
    const { game: g, key, tick, photo, walk, cleanup } = (window as any).__villaLife;
    const home = { ...g.state.scooter };
    key('h'); walk(home.x + 2.3, 11.5); walk(home.x + 2.3, home.z + 3.4);
    g.yaw = Math.atan2(2.3, 3.4); g.pitch = -.23; const exterior = photo();
    walk(home.x + 1, home.z + 3.4); walk(home.x + 1, home.z - .23); const target = g.hotspot()?.id;
    key('e'); tick(12); const mounted = g.state.seated === 'scooter'; const cockpit = photo();
    const scooter = g.scene.scene.getObjectByName('rideableElectricScooter');
    const self = g.scene.scooter.colliders[0], sedan = g.scene.vehicle.colliders[0];
    const colliders = g.scene.drivingObstacles.includes(self) && !g.scene.scooterObstacles.includes(self)
      && g.scene.scooterObstacles.includes(sedan) && !g.scene.drivingObstacles.includes(sedan);
    key('w'); tick(40); const moving = g.state.scooter.speed > 1 && g.state.scooter.z > 9;
    key('e'); const movingExitBlocked = g.state.seated === 'scooter';
    key('d'); tick(10); key('d', false); const right = g.state.scooter.yaw < 0 && g.state.scooter.x < home.x;
    key(' '); tick(24); const handbrake = g.state.scooter.handbrake && g.state.scooter.speed === 0;
    key(' ', false); tick(12); const release = !g.state.scooter.handbrake && g.state.scooter.speed > .3;
    key('w', false); key('s'); tick(30); key('s', false); const service = g.state.scooter.speed === 0;
    const synced = Math.abs(scooter.position.x - g.state.scooter.x) < 1e-9 && Math.abs(scooter.position.z - g.state.scooter.z) < 1e-9;
    key('r'); tick(12); const reset = g.state.scooter.x === home.x && g.state.scooter.z === home.z && g.state.scooter.speed === 0 && g.state.seated === 'scooter';
    key('e'); tick(12); const dismounted = g.state.seated === null && g.canFit(1.75);
    key('e'); tick(12);
    const nc = g.scene.colliders.length, ns = g.scene.scooterObstacles.length;
    const blockedSide = { minX: home.x + .75, maxX: home.x + 1.25, minZ: home.z - .5, maxZ: home.z + .1, minY: 0, maxY: 2 };
    g.scene.colliders.push(blockedSide); g.scene.scooterObstacles.push(blockedSide);
    key('e'); tick(12); const alternateExit = g.state.seated === null && Math.abs(g.position.x - (home.x - 1)) < 1e-9;
    key('e'); tick(12); const alternateReboard = g.state.seated === 'scooter';
    g.scene.colliders.length = nc; g.scene.scooterObstacles.length = ns;
    key('w'); tick(10); key('h'); tick(10);
    const homeStops = g.state.seated === null && g.state.scooter.speed === 0 && g.position.z === 11.5;
    return { target, mounted, colliders, moving, movingExitBlocked, right, handbrake, release, service, synced, reset, dismounted, alternateExit, alternateReboard, homeStops, exterior, cockpit, ...cleanup() };
  });
  expect(r.target).toBe('scooter');
  for (const field of ['mounted', 'colliders', 'moving', 'movingExitBlocked', 'right', 'handbrake', 'release', 'service', 'synced', 'reset', 'dismounted', 'alternateExit', 'alternateReboard', 'homeStops', 'clean'] as const) expect(r[field], field).toBe(true);
  expect(r.scores).toBe(0); expect(errors).toEqual([]);
  await attach('villa-electric-scooter-exterior', r.exterior); await attach('villa-electric-scooter-rider-view', r.cockpit);
});
