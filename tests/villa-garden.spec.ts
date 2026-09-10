import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { VILLA_TEA_BAR } from '../src/games/villaLivingLayout';
import { VILLA_PET_IDS, VILLA_PET_LABELS } from '../src/games/villaPets';

const moduleUrl = () => '/' + JSON.parse(readFileSync(join(process.cwd(), 'dist/.vite/manifest.json'), 'utf8'))['src/games/villa.ts'].file;
async function mount(page: Page, touch = false) {
  await page.goto('/#/snake');
  await page.evaluate(async ({ url, touch, teaApproach }) => {
    const { VillaGame } = await import(url), canvas = document.createElement('canvas');
    canvas.id = 'villa-garden-test'; Object.assign(canvas.style, { position: 'fixed', top: '20px', left: '10px', zIndex: '10000' }); document.body.append(canvas);
    const game = new VillaGame({ canvas, logicalWidth: 1120, logicalHeight: 700, isDarkTheme: () => false, isZhLang: () => false,
      isPixelMode: () => false, getRecord: () => null, reportScore: () => { throw new Error('Villa cannot submit scores'); }, requestShellRender: () => {} }) as any;
    game.prepare(); game.start(); cancelAnimationFrame(game.animationId); game.setDisplayScale(touch ? 370 : 1000);
    const key = (key: string, down = true) => game.handleInput(new KeyboardEvent(down ? 'keydown' : 'keyup', { key }));
    const press = (k: string) => { key(k); key(k, false); };
    const tick = (n = 1) => { for (let i = 0; i < n; i++) game.update(.05); };
    const render = () => { game.scene.softwareInputFrames = 0; game.scene.lastDrawAt = -Infinity; game.renderFrame(); };
    const walk = (x: number, z: number) => {
      for (const axis of ['x', 'z']) {
        const target = axis === 'x' ? x : z; let budget = 600;
        while (Math.abs(game.position[axis] - target) > .005 && budget-- > 0) {
          const d = target - game.position[axis]; game.yaw = axis === 'x' ? (d > 0 ? -Math.PI / 2 : Math.PI / 2) : (d > 0 ? Math.PI : 0);
          key('w'); game.update(Math.min(.05, Math.abs(d) / 2.75)); key('w', false);
        }
        if (budget <= 0) throw new Error(`Blocked walking to ${x},${z}: ${JSON.stringify(game.position)}`);
      }
      tick();
    };
    const sink = () => { press('h'); walk(0, 1.4); walk(-1.5, 1.4); walk(-1.5, -2.1); walk(-1.5, -7.1); walk(-5.67, -7.1); game.yaw = 0; game.pitch = -.2; tick(); };
    const teaFromSink = () => {
      // Walk the west aisle around the back-aligned cabinets, not through the tank.
      walk(-1.5, -7.1); walk(-1.5, -1.05); walk(-1.25, -1.05); walk(-1.25, 1.45);
      walk(teaApproach.x, 1.45); walk(teaApproach.x, teaApproach.z); game.yaw = 0; game.pitch = -.2; tick();
    };
    // A small four-neighbour test navigator still uses actual WASD/controller collision.
    // It can walk around a vegetable bed to a moving pet, rather than teleporting either.
    const approach = (petId: string) => {
      // Include the actual front entrance/living aisle now that cats and dogs visit indoors.
      const columns = 56, rows = 48;
      for (let attempt = 0; attempt < 4; attempt++) {
        const pet = game.state.pets.pets.find((p: any) => p.id === petId);
        if (game.hotspot()?.id === `pet-${petId}` && Math.hypot(game.position.x - pet.x, game.position.z - pet.z) < 1.15) return;
        const point = (id: number) => ({ x: -21 + (id % columns) * .4, y: 0, z: 3.8 + Math.floor(id / columns) * .4 });
        const start = Math.round((game.position.z - 3.8) / .4) * columns + Math.round((game.position.x + 21) / .4);
        const queue = [start], previous = new Map<number, number>([[start, -1]]); let goal = -1;
        const free = (p: any) => game.canFit(1.75, p);
        for (let i = 0; i < queue.length && goal < 0; i++) {
          const id = queue[i], p = point(id), distance = Math.hypot(p.x - pet.x, p.z - pet.z);
          if (distance < 1.05 && game.state.pets.pets.every((other: any) => other === pet || Math.hypot(p.x - other.x, p.z - other.z) > distance)
            && [0, .25, .5, .75, 1].every(t => free({ x: p.x + (pet.x - p.x) * t, y: 0, z: p.z + (pet.z - p.z) * t }))) { goal = id; break; }
          for (const next of [id - 1, id + 1, id - columns, id + columns]) {
            const q = point(next);
            if (next < 0 || next >= columns * rows || Math.abs(q.x - p.x) > .41 || previous.has(next) || !free(q)
              || !free({ x: (p.x + q.x) / 2, y: 0, z: (p.z + q.z) / 2 })) continue;
            previous.set(next, id); queue.push(next);
          }
        }
        if (goal < 0) throw new Error(`No walking route to ${petId}`);
        const route: number[] = []; for (let id = goal; id >= 0; id = previous.get(id)!) route.push(id);
        for (const id of route.reverse()) { const p = point(id); walk(p.x, p.z); }
        tick(70); // Acceleration-limited descent and wing folding settle before feeding.
      }
      throw new Error(`Could not approach ${petId}: ${JSON.stringify(game.state.pets.pets)}`);
    };
    if (touch) for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) canvas.addEventListener(type, () => tick(), { passive: false });
    (window as any).garden = { game, key, press, tick, walk, sink, teaFromSink, render, approach };
  }, { url: moduleUrl(), touch, teaApproach: VILLA_TEA_BAR.approach });
}
async function dispose(page: Page) {
  await page.evaluate(() => { const f = (window as any).garden; if (f) { f.game.destroy(); f.game.canvas.remove(); delete (window as any).garden; } });
}

test('villa garden: walk to the real kitchen sink and toggle an animated, draining tap', async ({ page }) => {
  test.setTimeout(90_000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await mount(page);
  try {
    const result = await page.evaluate(() => {
      const { game, press, tick, sink, render } = (window as any).garden; sink(); render();
      const target = game.canvas.dataset.villaTarget, safe = game.canFit(1.75), water = game.scene.scene.getObjectByName('kitchen-tap-water');
      const off = !water.visible; press('e'); tick(1); render(); const on = water.visible && game.canvas.dataset.villaFaucet === 'on';
      const a = Array.from(game.scene.scene.getObjectByName('kitchen-tap-drops').instanceMatrix.array); tick(5); render();
      const moving = a.some((v, i) => v !== game.scene.scene.getObjectByName('kitchen-tap-drops').instanceMatrix.array[i]);
      game.handleInput(new KeyboardEvent('keydown', { key: 'e', repeat: true })); const repeatsIgnored = game.state.faucetOn;
      const prompt = game.canvas.dataset.villaPrompt; press('i'); render(); const quiet = !game.canvas.dataset.villaPrompt;
      press('i'); press('e'); render(); const closed = !water.visible && game.canvas.dataset.villaFaucet === 'off';
      press('e'); game.init(); render(); const reset = !water.visible && !game.state.faucetOn;
      game.destroy(); const cleaned = !Object.keys(game.canvas.dataset).some(k => k.startsWith('villa'));
      return { target, safe, off, on, moving, repeatsIgnored, prompt, quiet, closed, reset, cleaned };
    });
    expect(result.target).toBe('faucet'); expect(result.prompt).toBe('faucet');
    for (const [key, value] of Object.entries(result)) if (typeof value === 'boolean') expect(value, key).toBe(true);
    expect(errors).toEqual([]);
  } finally { await dispose(page); }
});

test('villa garden: authored plants, open aisles and six independently feedable pets, including visiting cats/dogs and both rabbits', async ({ page }) => {
  test.setTimeout(120_000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await mount(page);
  try {
    const result = await page.evaluate(petIds => {
      const { game, press, tick, walk, approach, render } = (window as any).garden;
      const garden = game.scene.scene.getObjectByName('Villa garden'), species: Record<string, string[]> = {};
      garden.traverse((o: any) => { if (o.userData.kind) (species[o.userData.kind] ??= []).push(o.userData.species); });
      const start = game.state.pets.pets.map((p: any) => ({ x: p.x, z: p.z })); press('h'); tick(400);
      const roamed = game.state.pets.pets.every((p: any, i: number) => Math.hypot(p.x - start[i].x, p.z - start[i].z) > .1);
      // The central cross-shaped aisle is physically walkable, not painted over solid beds.
      const potsSolid = !game.canFit(1.75, { x: -10.5, y: 0, z: 16 }) && !game.canFit(1.75, { x: -9.7, y: 0, z: 16.3 });
      walk(-12.6, 11.5); walk(-12.6, 15.3); walk(-7.8, 15.3); walk(-7.8, 22.3); walk(-7.8, 19.4); walk(-12.6, 19.4); walk(-12.6, 13.8);
      const fed: string[] = [], visibleFood: string[] = [], labels: Array<{ id: string; prompt: string }> = [];
      const rabbits = game.state.pets.pets.filter((p: any) => p.kind === 'rabbit').map((p: any) => ({ id: p.id, sex: p.sex }));
      for (const id of petIds) {
        approach(id); const pet = game.state.pets.pets.find((p: any) => p.id === id), before = pet.feedCount;
        labels.push({ id, prompt: game.hotspot()?.name ?? '' });
        const otherCounts = game.state.pets.pets.filter((p: any) => p !== pet).map((p: any) => p.feedCount);
        press('e'); if (pet.feedCount === before + 1) fed.push(id);
        press('e'); if (pet.feedCount !== before + 1) throw new Error('Repeated feed was not bounded');
        if (JSON.stringify(otherCounts) !== JSON.stringify(game.state.pets.pets.filter((p: any) => p !== pet).map((p: any) => p.feedCount))) throw new Error('Feeding changed a different pet');
        tick(26); render(); if (game.scene.scene.getObjectByName(`${id}/food-plate`).visible) visibleFood.push(id);
      }
      press('i'); render(); const quiet = !game.canvas.dataset.villaPrompt;
      const finite = game.state.pets.pets.every((p: any) => [p.x, p.y, p.z].every(Number.isFinite));
      const synced = game.state.pets.pets.every((p: any) => { const model = game.scene.scene.getObjectByName(`villa-pet-${p.id}`); return model.userData.peaceful && Math.abs(model.position.x - p.x) < 1e-8; });
      game.init(); const reset = game.state.pets.feedSequence === 0 && game.state.pets.pets.every((p: any) => p.feedCount === 0 && !p.fed);
      return { species, roamed, fed, visibleFood, labels, rabbits, quiet, finite, synced, reset, potsSolid };
    }, VILLA_PET_IDS);
    expect(new Set(result.species['fruit-tree'])).toEqual(new Set(['cherry', 'orange', 'mango', 'apple', 'pear', 'lemon']));
    expect(result.species['fruit-tree']).toHaveLength(10); expect(result.species['flower-planter']).toHaveLength(6); expect(result.species['vegetable-bed']).toHaveLength(4);
    expect(result.fed).toHaveLength(6); expect(result.fed).toEqual(VILLA_PET_IDS); expect(result.visibleFood).toEqual(result.fed);
    expect(result.rabbits).toEqual([{ id: 'rabbit', sex: 'male' }, { id: 'rabbit-female', sex: 'female' }]);
    for (const label of result.labels) expect(label.prompt.toLowerCase()).toContain(VILLA_PET_LABELS[label.id as keyof typeof VILLA_PET_LABELS].en.toLowerCase());
    for (const key of ['roamed', 'quiet', 'finite', 'synced', 'reset', 'potsSolid'] as const) expect(result[key], key).toBe(true);
    expect(errors).toEqual([]);
  } finally { await dispose(page); }
});

test('villa garden: sedan stops before peaceful animals without pushing or harming them', async ({ page }) => {
  await mount(page);
  try {
    const result = await page.evaluate(() => {
      const { game, key, tick } = (window as any).garden;
      // Deliberate safety fixture, away from roads: a resting rabbit in front of the car.
      for (const pet of game.state.pets.pets) { pet.mode = 'eating'; pet.timer = 100; }
      // Keep the car beyond the deck umbrella, with the male rabbit ahead on open lawn.
      game.state.pets.pets.find((p: any) => p.id === 'rabbit').z = 18.5;
      // The sixth pet otherwise starts inside this deliberately relocated car.
      Object.assign(game.state.pets.pets.find((p: any) => p.id === 'rabbit-female'), { x: -20, z: 18.5 });
      Object.assign(game.state.driving, { x: -18, z: 14.5, yaw: 0, speed: 0, steering: 0 });
      game.enterCarAt = game.exitCarAt = game.closeCarAt = Infinity;
      game.state.seated = 'car'; game.position = { x: -17.57, y: 0, z: 14.55 }; game.yaw = Math.PI;
      game.scene.updateActivities(game.time, game.state); game.scene.updatePets(game.time, game.state.pets);
      const startBody = game.scene.vehicle.colliders[0];
      const initialPetsClear = game.scene.pets.drivingColliders.every((pet: any) => startBody.maxX <= pet.minX || startBody.minX >= pet.maxX
        || startBody.maxZ <= pet.minZ || startBody.minZ >= pet.maxZ);
      const before = game.state.pets.pets.map((p: any) => [p.x, p.z]); key('w'); tick(120); key('w', false);
      const car = game.state.driving, body = game.scene.vehicle.colliders[0], rabbit = game.state.pets.pets.find((p: any) => p.id === 'rabbit');
      return { initialPetsClear, contact: car.contact, speed: car.speed, advanced: car.z > 14.5, stoppedBefore: body.maxZ <= rabbit.z - .4 + .01,
        unchanged: game.state.pets.pets.every((p: any, i: number) => p.x === before[i][0] && p.z === before[i][1]),
        walkingClear: game.canFit(1.75, { x: rabbit.x, y: 0, z: rabbit.z }) };
    });
    expect(result).toEqual({ initialPetsClear: true, contact: true, speed: 0, advanced: true, stoppedBefore: true, unchanged: true, walkingClear: true });
  } finally { await dispose(page); }
});

test('villa garden: native coarse taps feed a pet, switch the faucet and restore quiet controls', async ({ browser }) => {
  test.setTimeout(90_000);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage(); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  try {
    await mount(page, true);
    const use = async () => {
      const p = await page.evaluate(() => { const g = (window as any).garden.game, r = g.canvas.getBoundingClientRect(), s = g.uiScale();
        return { x: r.x + (g.width - 38 * s) * r.width / g.width, y: r.y + (g.height - 75 * s) * r.height / g.height }; });
      await page.touchscreen.tap(p.x, p.y);
    };
    // Start beside the puppy, using the real touch path only for the action.
    await page.evaluate(() => { const { game, tick } = (window as any).garden; game.position = { x: -16, y: 0, z: 19.5 }; game.eyeY = 0; tick(2); });
    await use();
    expect(await page.evaluate(() => (window as any).garden.game.state.pets.pets[0].feedCount)).toBe(1);
    await page.evaluate(() => (window as any).garden.sink()); await use();
    expect(await page.evaluate(() => (window as any).garden.game.canvas.dataset.villaFaucet)).toBe('on');
    await use(); expect(await page.evaluate(() => (window as any).garden.game.canvas.dataset.villaFaucet)).toBe('off');
    const immersion = await page.evaluate(() => { const g = (window as any).garden.game, b = g.buttons().find((b: any) => b.id === 'immersion'), r = g.canvas.getBoundingClientRect();
      return { x: r.x + (b.x + b.w / 2) * r.width / g.width, y: r.y + (b.y + b.h / 2) * r.height / g.height }; });
    await page.touchscreen.tap(immersion.x, immersion.y);
    expect(await page.evaluate(() => (window as any).garden.game.immersive)).toBe(true);
    const restore = await page.evaluate(() => { const g = (window as any).garden.game, b = g.buttons()[0], r = g.canvas.getBoundingClientRect();
      return { x: r.x + (b.x + b.w / 2) * r.width / g.width, y: r.y + (b.y + b.h / 2) * r.height / g.height }; });
    await page.touchscreen.tap(restore.x, restore.y); await use();
    expect(await page.evaluate(() => (window as any).garden.game.canvas.dataset.villaFaucet)).toBe('on');
    await page.evaluate(() => (window as any).garden.teaFromSink());
    expect(await page.evaluate(() => { const g = (window as any).garden.game; return [g.hotspot()?.id, g.state.tea.phase, g.canFit(1.75)]; })).toEqual(['tea-bar', 'empty', true]);
    await use();
    expect(await page.evaluate(() => (window as any).garden.game.canvas.dataset.villaTea)).toBe('brewing');
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test('villa home: walk upstairs to fitted wardrobes and dressing table without losing bed or balcony access', async ({ page }) => {
  test.setTimeout(90_000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await mount(page);
  try {
    const result = await page.evaluate(() => {
      const { game, press, walk, render } = (window as any).garden;
      press('h'); walk(0.04, 1.4); walk(0.04, -6.2); walk(2.06, -6.2); walk(2.06, 1.4);
      walk(0, 1.4); walk(0, 2.6); walk(-3.4, 2.6); walk(-8.6, 2.6); walk(-8.6, 1.65);
      const floor = game.position.y, world = game.scene.scene, row = world.getObjectByName('Bedroom/wardrobe-row').userData;
      const table = world.getObjectByName('Bedroom/dressing-table').userData, mirror = world.getObjectByName('Bedroom/dressing-mirror').userData;
      const cosmetics = ['brush-cup', 'lipstick', 'compact', 'perfume-bottle', 'jewelry-tray'].every(id => !!world.getObjectByName('Bedroom/' + id));
      walk(-8.6, 2.6); walk(-4.35, 2.6); walk(-4.35, 2.2); const vanityAccess = game.canFit(1.75);
      // Walk round the bed's west side and through the existing balcony opening.
      walk(-4.35, 2.6); walk(-11.1, 2.6); walk(-11.1, 8.15); walk(-7.5, 8.15); walk(-7.5, 9.6);
      const balcony = game.position.y === 3.6 && game.position.z > 9; render();
      const positions = world.getObjectByName('villa-contact-shadows').geometry.getAttribute('position');
      let floorShadows = true; for (let i = 0; i < positions.count; i++) if (![.039, 3.639, 7.239].some(y => Math.abs(y - positions.getY(i)) < .081)) floorShadows = false;
      return { floor, row, table, mirror, cosmetics, vanityAccess, balcony, floorShadows };
    });
    expect(result.floor).toBeCloseTo(3.6); expect(result.row).toMatchObject({ bays: 5, doors: 10, wall: 'north' });
    expect(result.table).toMatchObject({ openKneeSpace: true, drawers: 2 }); expect(result.mirror).toMatchObject({ renderTarget: false, litTrim: true });
    for (const key of ['cosmetics', 'vanityAccess', 'balcony', 'floorShadows'] as const) expect(result[key], key).toBe(true);
    expect(errors).toEqual([]);
  } finally { await dispose(page); }
});

test('villa home: safely walk to tea, progressively brew, retain a ready cup, drink empty and bound repeat/range/reset actions', async ({ page }) => {
  test.setTimeout(90_000); await mount(page);
  try {
    const result = await page.evaluate(teaApproach => {
      const { game, sink, teaFromSink, walk, press, tick, render } = (window as any).garden; sink(); teaFromSink(); render();
      const target = game.canvas.dataset.villaTarget, safeApproach = game.canFit(1.75);
      const steam = game.scene.scene.getObjectByName('tea-bar/steam'), liquid = game.scene.scene.getObjectByName('tea-bar/liquid');
      const cup = game.scene.scene.getObjectByName('tea-bar/drinking-cup'), restPosition = cup.position.clone();
      const atRest = () => cup.position.equals(restPosition) && cup.rotation.x === 0;
      const initiallyEmpty = !steam.visible && !liquid.visible && game.canvas.dataset.villaTea === 'empty' && game.state.tea.fill === 0;
      press('e'); render();
      const started = steam.visible && game.canvas.dataset.villaTea === 'brewing' && game.state.tea.fill === 0, until = game.state.teaUntil;
      const first = Array.from(steam.instanceMatrix.array); tick(8); render();
      const moving = first.some((v, i) => v !== steam.instanceMatrix.array[i]), firstFill = game.state.tea.fill, firstLiquidY = liquid.position.y;
      tick(24); render();
      const progressive = firstFill > 0 && game.state.tea.fill > firstFill && game.state.tea.fill < 1 && liquid.visible && liquid.position.y > firstLiquidY;
      const brewing = JSON.stringify(game.state.tea); press('e');
      game.handleInput(new KeyboardEvent('keydown', { key: 'e', repeat: true }));
      const bounded = game.state.teaUntil === until && JSON.stringify(game.state.tea) === brewing;
      press('i'); render(); const quiet = !game.canvas.dataset.villaPrompt; press('i'); tick(220); render();
      const ready = !steam.visible && liquid.visible && atRest() && game.canvas.dataset.villaTea === 'ready' && game.state.tea.fill === 1;
      const full = JSON.stringify(game.state.tea), fullLiquidY = liquid.position.y; tick(240); render();
      const persistent = JSON.stringify(game.state.tea) === full && liquid.visible && atRest();
      press('h'); press('e'); const remote = JSON.stringify(game.state.tea) === full && game.state.teaUntil === until;
      // Stay within the tea's horizontal reach, but on clear floor above the wardrobe doors.
      game.position = { x: teaApproach.x, y: 3.6, z: teaApproach.z + .4 }; game.eyeY = 3.6; tick(2);
      const upstairsClear = game.canFit(1.75); press('e');
      const upstairs = upstairsClear && game.position.y === 3.6 && JSON.stringify(game.state.tea) === full && game.state.teaUntil === until;
      press('h'); walk(0, 2.2); walk(teaApproach.x, 2.2); walk(teaApproach.x, teaApproach.z);
      press('e'); const drinkStarted = game.state.tea.phase === 'drinking'; tick(28); render();
      const drinking = game.state.tea.phase === 'drinking' && game.state.tea.fill > 0 && game.state.tea.fill < 1
        && cup.position.y > restPosition.y + .4 && cup.rotation.x > .7 && liquid.visible && liquid.position.y < fullLiquidY;
      const sip = JSON.stringify(game.state.tea); press('e'); const drinkBounded = JSON.stringify(game.state.tea) === sip;
      tick(60); render();
      const emptied = game.canvas.dataset.villaTea === 'empty' && game.state.tea.fill === 0 && !liquid.visible && !steam.visible && atRest();
      press('e'); tick(8); render(); const brewingBeforeReset = game.state.tea.phase === 'brewing' && game.state.tea.fill > 0 && liquid.visible;
      game.init(); render();
      const reset = !steam.visible && !liquid.visible && atRest() && game.state.teaUntil === 0 && game.canvas.dataset.villaTea === 'empty'
        && game.state.tea.phase === 'empty' && game.state.tea.fill === 0;
      return { target, safeApproach, initiallyEmpty, started, moving, progressive, bounded, quiet, ready, persistent, remote, upstairs,
        drinkStarted, drinking, drinkBounded, emptied, brewingBeforeReset, reset };
    }, VILLA_TEA_BAR.approach);
    expect(result.target).toBe('tea-bar'); for (const [key, value] of Object.entries(result)) if (typeof value === 'boolean') expect(value, key).toBe(true);
  } finally { await dispose(page); }
});
