import { test, expect, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { gameModuleUrl } from '../../../tests/support/releases';
import { VILLA_VERSION } from '../src/villaVersion';
import { VILLA_FIREPLACE_WALL, VILLA_TEA_BAR, VILLA_AQUARIUM } from '../src/villaLivingLayout';
import { VILLA_RELAX_SEATS } from '../src/villaSeating';
import { VILLA_MASTER_WARDROBE } from '../src/villaWardrobe';
import { VILLA_CAMPING_HOME, VILLA_SWING } from '../src/villaOutdoor';
import { VILLA_PICKUP } from '../src/villaEstateLayout';
import { VILLA_SCOOTER } from '../src/villaActivities';
import { POOL } from '../src/villaWorld';

const moduleUrl = () => process.env.VILLA_MODULE_URL || gameModuleUrl('villa');
const canvas = (page: Page) => page.locator('#villa-v110-life-test');
const terminal = (page: Page) => page.locator('div[data-villa-terminal]');
const diagnostics = new WeakMap<Page, { runtime: string[]; console: string[] }>();
const readState = async (page: Page, name: string) => JSON.parse((await canvas(page).getAttribute(`data-villa-${name}`))!);

/** Existing isolated-controller pattern: fixture positions select a test approach,
 * never perform an interaction. Every E/Q/P/W/S action below is native input;
 * bounded .05s updates avoid wall-clock assumptions on software WebGL. */
async function mount(page: Page) {
  page.setDefaultTimeout(15_000); const log = { runtime: [] as string[], console: [] as string[] }; diagnostics.set(page, log);
  page.on('pageerror', error => log.runtime.push(error.stack ?? error.message)); page.on('console', message => { if (message.type() === 'error') log.console.push(message.text()); });
  await page.goto('/#/snake');
  await page.evaluate(async ({ url, layout }) => {
    const { VillaGame } = await import(url), canvas = document.createElement('canvas'); canvas.id = 'villa-v110-life-test'; canvas.tabIndex = 0;
    Object.assign(canvas.style, { position: 'fixed', inset: '0', zIndex: '5' }); document.querySelector('#gameApp')!.append(canvas);
    const f: any = { scores: 0, layout };
    const g = new VillaGame({ canvas, logicalWidth: 1120, logicalHeight: 700, isDarkTheme: () => false, isZhLang: () => false,
      isPixelMode: () => false, getRecord: () => null, reportScore: () => f.scores++, requestShellRender: () => {} }) as any;
    g.prepare(); g.start(); cancelAnimationFrame(g.animationId); f.g = g;
    g.setViewport({ width: innerWidth, height: innerHeight, dpr: Math.min(2, devicePixelRatio), safeArea: { top: 0, right: 0, bottom: 0, left: 0 } });
    f.tick = (count = 1) => { for (let i = 0; i < count; i++) g.update(.05); };
    f.render = () => { g.scene.softwareInputFrames = 0; g.scene.lastDrawAt = -Infinity; g.scene.securityLastAt = -Infinity; g.renderFrame(); };
    f.pose = (p: { x: number; y: number; z: number }, yaw = 0, pitch = -.12) => {
      if (g.state.seated || g.state.snookerActive) throw new Error('Leave the previous activity with actual E before changing fixture approach');
      g.clearInput(); g.position = { ...p }; g.eyeY = p.y; g.yaw = yaw; g.pitch = pitch; g.transition = null;
      g.enterCarAt = g.exitCarAt = g.closeCarAt = Infinity; g.motion.offset = g.motion.velocity = 0;
      g.scene.updateActivities(g.time, g.state, g.position, g.yaw); g.publishState();
    };
    f.render(); canvas.focus(); (window as any).__villaV110 = f;
  }, { url: moduleUrl(), layout: { tea: VILLA_TEA_BAR, aquarium: VILLA_AQUARIUM, fireplace: VILLA_FIREPLACE_WALL, wardrobe: VILLA_MASTER_WARDROBE, seats: VILLA_RELAX_SEATS, camping: VILLA_CAMPING_HOME, swing: VILLA_SWING, pickup: VILLA_PICKUP, scooter: VILLA_SCOOTER, pool: POOL } });
  await expect(canvas(page)).toHaveAttribute('data-villa-version', VILLA_VERSION, { timeout: 60_000 });
  await expect(canvas(page)).toHaveAttribute('data-villa-renderer', 'webgl'); expect(await page.evaluate(() => (window as any).__villaV110.g.running)).toBe(true);
}
async function tick(page: Page, count = 1, render = false) { await page.evaluate(({ count, render }) => { const f = (window as any).__villaV110; f.tick(count); if (render) f.render(); }, { count, render }); }
async function cleanup(page: Page) {
  const screenshot = test.info().outputPath('villa-life-final-view.png'); await page.screenshot({ path: screenshot }); await test.info().attach('villa-life-final-view', { path: screenshot, contentType: 'image/png' });
  const log = diagnostics.get(page) ?? { runtime: [], console: [] }, logPath = test.info().outputPath('villa-browser-console.json');
  writeFileSync(logPath, JSON.stringify(log, null, 2)); await test.info().attach('villa-browser-console', { path: logPath, contentType: 'application/json' });
  const result = await page.evaluate(() => { const f = (window as any).__villaV110; if (!f) return { scores: 0, clean: true }; f.g.destroy(); const clean = !Object.keys(f.g.canvas.dataset).some(k => k.startsWith('villa')); f.g.canvas.remove(); delete (window as any).__villaV110; return { scores: f.scores, clean }; });
  expect(result).toEqual({ scores: 0, clean: true }); await expect(terminal(page)).toHaveCount(0); expect(log.runtime).toEqual([]);
}
async function photo(page: Page, name: string) {
  await tick(page, 0, true); const path = test.info().outputPath(`${name}.png`); await canvas(page).screenshot({ path }); await test.info().attach(name, { path, contentType: 'image/png' });
}

test('Villa1.1 table activities: aligned tea station brews, stays ready, drinks empty, and snooker starts with physical assistance', async ({ page }) => {
  test.setTimeout(120_000); await mount(page);
  try {
    const alignment = await page.evaluate(() => {
      const f = (window as any).__villaV110, layout = f.layout; f.pose(layout.tea.approach);
      const tank = f.g.scene.scene.getObjectByName('aquarium/cabinet');
      return { teaBack: layout.tea.z - layout.tea.depth / 2, tankBack: layout.aquarium.z - layout.aquarium.depth / 2, wallBack: layout.fireplace.backZ, tank: { x: tank.position.x, z: tank.position.z } };
    });
    expect(alignment.teaBack).toBeCloseTo(alignment.wallBack); expect(alignment.tankBack).toBeCloseTo(alignment.wallBack); expect(alignment.tank).toEqual({ x: VILLA_AQUARIUM.x, z: VILLA_AQUARIUM.z });
    await expect(canvas(page)).toHaveAttribute('data-villa-target', 'tea-bar'); await expect(canvas(page)).toHaveAttribute('data-villa-tea', 'empty');
    await page.keyboard.press('e'); await expect(canvas(page)).toHaveAttribute('data-villa-tea', 'brewing'); await tick(page, 100);
    const fill = Number(await canvas(page).getAttribute('data-villa-tea-fill')); expect(fill).toBeGreaterThan(0.45); expect(fill).toBeLessThan(0.55);
    await page.keyboard.press('e'); expect(Number(await canvas(page).getAttribute('data-villa-tea-fill'))).toBe(fill); // busy E must not reset brewing
    await tick(page, 110, true); await expect(canvas(page)).toHaveAttribute('data-villa-tea', 'ready'); await expect(canvas(page)).toHaveAttribute('data-villa-tea-fill', '1');
    await tick(page, 260); await expect(canvas(page)).toHaveAttribute('data-villa-tea', 'ready'); await expect(canvas(page)).toHaveAttribute('data-villa-tea-fill', '1');
    await page.keyboard.press('e'); await expect(canvas(page)).toHaveAttribute('data-villa-tea', 'drinking'); await tick(page, 28, true);
    const drinking = await page.evaluate(() => { const f = (window as any).__villaV110, cup = f.g.scene.scene.getObjectByName('tea-bar/drinking-cup'); return { fill: Number(f.g.canvas.dataset.villaTeaFill), phase: cup.userData.phase, modelFill: cup.userData.fill, tilt: cup.rotation.x }; });
    expect(drinking.fill).toBeGreaterThan(0); expect(drinking.fill).toBeLessThan(1); expect(drinking.phase).toBe('drinking'); expect(drinking.modelFill).toBeCloseTo(drinking.fill, 2); expect(Math.abs(drinking.tilt)).toBeGreaterThan(0.1);
    await photo(page, 'villa-v110-cup-lift-and-depletion'); await tick(page, 40); await expect(canvas(page)).toHaveAttribute('data-villa-tea', 'empty'); await expect(canvas(page)).toHaveAttribute('data-villa-tea-fill', '0');
    await page.evaluate(() => (window as any).__villaV110.pose({ x: 9.15, y: 0, z: -0.95 })); await page.keyboard.press('e'); await tick(page, 12, true);
    expect(await readState(page, 'snooker')).toMatchObject({ active: true, moving: false, aimAssist: true });
    const guide = await page.evaluate(() => {
      const world = (window as any).__villaV110.g.scene.scene, table = world.getObjectByName('villa-snooker-table'), line = world.getObjectByName('snooker-world-aim-guide');
      return { finish: table.userData.finish, visible: line.visible, count: line.geometry.drawRange.count, y: line.geometry.getAttribute('position').getY(0) };
    });
    expect(guide).toMatchObject({ finish: 'walnut', visible: true, count: 2 }); expect(guide.y).toBeGreaterThan(0.864); expect(guide.y).toBeLessThan(0.875);
    await photo(page, 'villa-v110-walnut-shot-assistance'); await page.keyboard.press('Space'); await tick(page, 1, true);
    expect((await readState(page, 'snooker')).moving).toBe(true); expect(await page.evaluate(() => (window as any).__villaV110.g.scene.scene.getObjectByName('snooker-world-aim-guide').visible)).toBe(false);
    await page.keyboard.press('r'); await tick(page, 1); expect(await readState(page, 'snooker')).toMatchObject({ shots: 0, moving: false, aimAssist: true }); await page.keyboard.press('e'); await tick(page, 12);
  } finally { await cleanup(page); }
});

test('Villa1.1 interiors: nearest sofa cushion, every seat kind, bed lie and real reversible wardrobe doors', async ({ page }) => {
  test.setTimeout(150_000); await mount(page);
  try {
    const couchPositions: number[] = [];
    for (const end of [0, 1]) {
      await page.evaluate(end => { const f = (window as any).__villaV110, sofa = f.layout.seats.find((s: any) => s.id === 'sofa-living'); f.pose({ x: sofa.cushionSegment[end].x, y: 0, z: sofa.seat.z - 1.05 }); }, end);
      await page.keyboard.press('e'); await tick(page, 12); await expect(canvas(page)).toHaveAttribute('data-villa-relax-seat', 'sofa-living');
      couchPositions.push((await readState(page, 'position')).x); await page.keyboard.press('e'); await tick(page, 12); await expect(canvas(page)).toHaveAttribute('data-villa-seat', 'none');
    }
    expect(couchPositions[1] - couchPositions[0]).toBeGreaterThan(2);
    for (const id of ['chair-dining-1', 'stool-kitchen-1', 'lounger-west', 'bed-master', 'chair-pc']) {
      const expected = VILLA_RELAX_SEATS.find(s => s.id === id)!;
      await page.evaluate(id => { const f = (window as any).__villaV110, seat = f.layout.seats.find((s: any) => s.id === id); f.pose(seat.approach, seat.yaw); }, id);
      await page.keyboard.press('e'); await tick(page, 12); await expect(canvas(page)).toHaveAttribute('data-villa-relax-seat', id); await expect(canvas(page)).toHaveAttribute('data-villa-seat', expected.kind);
      const before = await readState(page, 'position'); await page.keyboard.down('w'); await page.keyboard.press('Space'); await tick(page, 6); await page.keyboard.up('w');
      expect(await readState(page, 'position')).toEqual(before);
      const view = await page.evaluate(() => (window as any).__villaV110.g.view()); expect(view.eyeHeight).toBeCloseTo(expected.eyeHeight);
      if (id === 'bed-master') { expect(view.pitch).toBeGreaterThan(0.1); await photo(page, 'villa-v110-single-pillow-bed-rest'); }
      await page.keyboard.press('e'); await tick(page, 12); await expect(canvas(page)).toHaveAttribute('data-villa-seat', 'none'); expect(await page.evaluate(() => (window as any).__villaV110.g.canFit(1.75))).toBe(true);
    }
    const closed = await page.evaluate(() => {
      const f = (window as any).__villaV110; f.pose(f.layout.wardrobe.approach);
      const door = f.g.scene.scene.getObjectByName('wardrobe/door-1'); f.doorCollider = door.userData.collider;
      f.doorProbe = { x: door.position.x + 0.08, y: f.layout.wardrobe.y, z: door.position.z + 0.315 };
      return { bounds: { ...f.doorCollider }, blocked: !f.g.canFit(1.75, f.doorProbe), shared: f.g.scene.colliders.includes(f.doorCollider) };
    });
    expect(closed.shared).toBe(true); expect(closed.blocked).toBe(true); await expect(canvas(page)).toHaveAttribute('data-villa-target', 'wardrobe-master');
    await page.keyboard.press('e'); await tick(page, 5); const half = (await readState(page, 'wardrobes'))['wardrobe-master']; expect(half.open).toBe(true); expect(half.progress).toBeGreaterThan(0); expect(half.progress).toBeLessThan(1);
    await page.keyboard.press('e'); await tick(page, 6); expect((await readState(page, 'wardrobes'))['wardrobe-master']).toEqual({ open: false, progress: 0 });
    await page.keyboard.press('e'); await tick(page, 24, true); expect((await readState(page, 'wardrobes'))['wardrobe-master']).toEqual({ open: true, progress: 1 });
    const open = await page.evaluate(() => { const f = (window as any).__villaV110, door = f.g.scene.scene.getObjectByName('wardrobe/door-1'); return { bounds: { ...f.doorCollider }, same: door.userData.collider === f.doorCollider, clear: f.g.canFit(1.75, f.doorProbe), yaw: door.rotation.y }; });
    expect(open.same).toBe(true); expect(open.bounds).not.toEqual(closed.bounds); expect(open.clear).toBe(true); expect(Math.abs(open.yaw)).toBeGreaterThan(1.4);
    await photo(page, 'villa-v110-open-fitted-wardrobe'); await page.keyboard.press('e'); await tick(page, 24); expect((await readState(page, 'wardrobes'))['wardrobe-master'].progress).toBe(0);
  } finally { await cleanup(page); }
});

test('Villa1.1 vehicles: actual pickup entry, forward/brake/reverse/safe exit and scooter S reverse', async ({ page }) => {
  test.setTimeout(120_000); await mount(page);
  try {
    await page.evaluate(() => { const f = (window as any).__villaV110; f.pose(f.layout.pickup.exit, Math.PI / 2); });
    await expect(canvas(page)).toHaveAttribute('data-villa-target', 'pickup'); await page.keyboard.press('e'); await tick(page, 40); await expect(canvas(page)).toHaveAttribute('data-villa-seat', 'pickup'); await expect(canvas(page)).toHaveAttribute('data-villa-pickup-door', 'closed');
    const start = await readState(page, 'pickup'); await page.keyboard.down('w'); await tick(page, 20); const forward = await readState(page, 'pickup'); expect(forward.speed).toBeGreaterThan(0.5); expect(forward.z).toBeGreaterThan(start.z + 0.25);
    await page.keyboard.press('e'); await expect(canvas(page)).toHaveAttribute('data-villa-seat', 'pickup');
    await page.keyboard.up('w'); await page.keyboard.down('Space'); await tick(page, 24); await page.keyboard.up('Space'); expect((await readState(page, 'pickup')).speed).toBe(0);
    const stopped = await readState(page, 'pickup'); await page.keyboard.down('s'); await tick(page, 12); await page.keyboard.up('s'); const reversed = await readState(page, 'pickup'); expect(reversed.speed).toBeLessThan(-0.1); expect(reversed.z).toBeLessThan(stopped.z - 0.05);
    await page.keyboard.down('Space'); await tick(page, 24); await page.keyboard.up('Space'); await page.keyboard.press('e'); await tick(page, 40); await expect(canvas(page)).toHaveAttribute('data-villa-seat', 'none'); expect(await page.evaluate(() => (window as any).__villaV110.g.canFit(1.75))).toBe(true);
    await photo(page, 'villa-v110-driven-pickup-safe-exit');
    await page.evaluate(() => { const f = (window as any).__villaV110, p = f.layout.scooter.center; f.pose({ x: p.x + 1, y: p.y, z: p.z - .23 }); });
    await page.keyboard.press('e'); await tick(page, 12); await expect(canvas(page)).toHaveAttribute('data-villa-seat', 'scooter');
    const parked = await readState(page, 'scooter'); await page.keyboard.down('s'); await tick(page, 16); await page.keyboard.up('s'); const scooter = await readState(page, 'scooter');
    expect(scooter.speed).toBeLessThan(-0.1); expect(scooter.z).toBeLessThan(parked.z - .1);
    await page.keyboard.press('e'); await expect(canvas(page)).toHaveAttribute('data-villa-seat', 'scooter');
    await page.keyboard.down('Space'); await tick(page, 24); await page.keyboard.up('Space'); await page.keyboard.press('e'); await tick(page, 12);
    await expect(canvas(page)).toHaveAttribute('data-villa-seat', 'none'); expect(await page.evaluate(() => (window as any).__villaV110.g.canFit(1.75))).toBe(true);
  } finally { await cleanup(page); }
});

test('Villa1.1 garden furniture: Q carries, E refuses water then places/sits, and swing camera follows real damped motion', async ({ page }) => {
  test.setTimeout(120_000); await mount(page);
  try {
    await page.evaluate(() => { const f = (window as any).__villaV110, p = f.layout.camping; f.pose({ x: p.x, y: p.y, z: p.z - 1.1 }); });
    await expect(canvas(page)).toHaveAttribute('data-villa-target', 'camping-chair'); const home = (await readState(page, 'outdoor')).camping;
    await page.keyboard.press('q'); await tick(page, 1); expect((await readState(page, 'outdoor')).camping.carried).toBe(true);
    await page.evaluate(() => { const f = (window as any).__villaV110, p = f.layout.pool; f.pose({ x: (p.minX + p.maxX) / 2, y: 0, z: p.maxZ + 1.3 }); });
    await page.keyboard.press('e'); await tick(page, 1); expect((await readState(page, 'outdoor')).camping).toEqual({ ...home, carried: true });
    await page.evaluate(() => (window as any).__villaV110.pose({ x: -18.7, y: 0, z: 29.5 })); await page.keyboard.press('e'); await tick(page, 1);
    const placed = (await readState(page, 'outdoor')).camping; expect(placed).toMatchObject({ x: -18.7, y: 0, z: 28.25, yaw: 0, carried: false });
    await page.keyboard.press('e'); await tick(page, 12); await expect(canvas(page)).toHaveAttribute('data-villa-relax-seat', 'camping-chair');
    expect((await page.evaluate(() => (window as any).__villaV110.g.view())).eyeHeight).toBeCloseTo(1.1);
    await page.keyboard.press('e'); await tick(page, 12); await expect(canvas(page)).toHaveAttribute('data-villa-seat', 'none');
    await page.evaluate(() => { const f = (window as any).__villaV110, s = f.layout.swing; f.pose({ x: s.x, y: s.y, z: s.z - 1.4 }); }); await page.keyboard.press('e'); await tick(page, 12);
    await expect(canvas(page)).toHaveAttribute('data-villa-relax-seat', 'swing');
    const motion = await page.evaluate(() => {
      const f = (window as any).__villaV110, s = f.layout.swing; let minZ = Infinity, maxZ = -Infinity, maxError = 0;
      for (let i = 0; i < 100; i++) {
        f.tick(); const angle = f.g.state.outdoor.swingAngle, p = f.g.position;
        minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); maxError = Math.max(maxError, Math.abs(p.z - (s.z - s.chainLength * Math.sin(angle))), Math.abs(p.y - (s.y + s.chainLength * (1 - Math.cos(angle)))));
      }
      return { range: maxZ - minZ, maxError, eyeHeight: f.g.view().eyeHeight };
    });
    expect(motion.range).toBeGreaterThan(0.3); expect(motion.maxError).toBeLessThan(1e-5); expect(motion.eyeHeight).toBeCloseTo(1.16); await photo(page, 'villa-v110-swing-seated-view');
    await page.keyboard.press('e'); await tick(page, 12); await expect(canvas(page)).toHaveAttribute('data-villa-seat', 'none'); expect(await page.evaluate(() => (window as any).__villaV110.g.canFit(1.75))).toBe(true);
    await tick(page, 200, true); expect((await readState(page, 'outdoor')).swingAngle).toBe(0);
    expect(await page.evaluate(() => (window as any).__villaV110.g.scene.scene.getObjectByName('villa-swing-pivot').rotation.x)).toBe(0);
  } finally { await cleanup(page); }
});

test('Villa1.1 racing: a genuinely placed camping chair blocks entry without teleporting, and clearing it restores entry/exit', async ({ page }) => {
  test.setTimeout(120_000); await mount(page);
  try {
    await page.evaluate(() => { const f = (window as any).__villaV110, p = f.layout.camping; f.pose({ x: p.x, y: p.y, z: p.z - 1.1 }); });
    await page.keyboard.press('q'); await tick(page, 1); expect((await readState(page, 'outdoor')).camping.carried).toBe(true);
    await page.evaluate(() => (window as any).__villaV110.pose({ x: 8.5, y: 0, z: 7.45 })); await page.keyboard.press('e'); await tick(page, 1);
    expect((await readState(page, 'outdoor')).camping).toMatchObject({ x: 8.5, y: 0, z: 6.2, yaw: 0, carried: false });
    await page.evaluate(() => (window as any).__villaV110.pose({ x: 7.6, y: 0, z: 6.8 }));
    await expect(canvas(page)).toHaveAttribute('data-villa-target', 'racing'); const entry = await readState(page, 'position');
    await page.keyboard.press('e'); await tick(page, 12); await expect(canvas(page)).toHaveAttribute('data-villa-seat', 'none'); expect(await readState(page, 'position')).toEqual(entry);
    await expect(canvas(page)).toHaveAttribute('data-villa-use-feedback', /clear route/i); await photo(page, 'villa-racing-real-chair-blocks-entry');
    // Remove the same physical obstruction via Q, then put it safely back outdoors via E.
    await page.evaluate(() => (window as any).__villaV110.pose({ x: 8.5, y: 0, z: 7.45 })); await expect(canvas(page)).toHaveAttribute('data-villa-target', 'camping-chair');
    await page.keyboard.press('q'); await tick(page, 1); expect((await readState(page, 'outdoor')).camping.carried).toBe(true);
    await page.evaluate(() => (window as any).__villaV110.pose({ x: -18.7, y: 0, z: 29.5 })); await page.keyboard.press('e'); await tick(page, 1); expect((await readState(page, 'outdoor')).camping.carried).toBe(false);
    await page.evaluate(p => (window as any).__villaV110.pose(p), entry); await expect(canvas(page)).toHaveAttribute('data-villa-target', 'racing');
    await page.keyboard.press('e'); await tick(page, 12); await expect(canvas(page)).toHaveAttribute('data-villa-seat', 'racing');
    await page.keyboard.press('e'); await tick(page, 12); await expect(canvas(page)).toHaveAttribute('data-villa-seat', 'none'); expect(await readState(page, 'position')).toEqual(entry);
    expect(await page.evaluate(() => (window as any).__villaV110.g.canFit(1.75))).toBe(true); await photo(page, 'villa-racing-cleared-route-safe-exit');
  } finally { await cleanup(page); }
});

test('Villa1.1 rain: all six pets physically travel to dry rooms and remain feedable in a real security image', async ({ page }) => {
  test.setTimeout(180_000); await mount(page);
  try {
    const initial = await readState(page, 'pets'); expect(initial).toHaveLength(6); expect(initial.filter((p: any) => p.kind === 'rabbit').map((p: any) => p.sex).sort()).toEqual(['female', 'male']);
    await page.keyboard.press('p'); await page.locator('[data-villa-terminal-tab="weather"]').click(); await page.locator('[data-villa-weather="rain"]').click();
    const journey = await page.evaluate(() => {
      const f = (window as any).__villaV110, pets = f.g.state.pets.pets; let maxStep = 0, ticks = 0;
      for (; ticks < 12000 && !pets.every((p: any) => p.sheltered); ticks++) {
        const previous = pets.map((p: any) => ({ x: p.x, z: p.z })); f.tick();
        pets.forEach((p: any, i: number) => { maxStep = Math.max(maxStep, Math.hypot(p.x - previous[i].x, p.z - previous[i].z)); });
      }
      return { ticks, maxStep, pets: pets.map((p: any) => ({ id: p.id, x: p.x, z: p.z, sheltered: p.sheltered, site: p.shelterSite, phase: p.shelterPhase })) };
    });
    const journeyPath = test.info().outputPath('villa-pet-shelter-journey.json'); writeFileSync(journeyPath, JSON.stringify({ ...journey, simulationSeconds: journey.ticks * .05 }, null, 2));
    await test.info().attach('villa-pet-shelter-journey', { path: journeyPath, contentType: 'application/json' });
    expect(journey.ticks).toBeGreaterThan(20); expect(journey.ticks).toBeLessThan(12000); expect(journey.maxStep).toBeLessThan(0.2);
    expect(journey.pets.every((p: any) => p.sheltered)).toBe(true);
    for (const pet of journey.pets) {
      expect(['living', 'garage']).toContain(pet.site);
      if (pet.site === 'living') { expect(pet.x).toBeGreaterThan(-11.4); expect(pet.x).toBeLessThan(-2.4); expect(pet.z).toBeGreaterThan(0.65); expect(pet.z).toBeLessThan(8.4); }
      else { expect(pet.x).toBeGreaterThan(12.5); expect(pet.x).toBeLessThan(34.2); expect(pet.z).toBeGreaterThan(-7.4); expect(pet.z).toBeLessThan(1.4); }
    }
    await page.locator('[data-villa-terminal-close]').click();
    const chosen = await page.evaluate(() => {
      const f = (window as any).__villaV110;
      for (const pet of f.g.state.pets.pets) for (let i = 0; i < 16; i++) {
        const a = i * Math.PI / 8, p = { x: pet.x + Math.cos(a) * 1.25, y: 0, z: pet.z + Math.sin(a) * 1.25 };
        if (!f.g.canFit(1.75, p)) continue;
        f.pose(p, Math.atan2(p.x - pet.x, p.z - pet.z)); f.tick();
        if (f.g.hotspot()?.id === `pet-${pet.id}`) return { id: pet.id, count: pet.feedCount, camera: pet.shelterSite };
      }
      throw new Error('No physically reachable sheltered pet feeding approach');
    });
    await page.keyboard.press('e');
    expect((await readState(page, 'pets')).find((p: any) => p.id === chosen.id).feedCount).toBe(chosen.count + 1);
    // Feeding intentionally approaches first; wait in simulation time, not a .05s instant-reaction assertion.
    const reaction = await page.evaluate(id => {
      const f = (window as any).__villaV110, pet = f.g.state.pets.pets.find((p: any) => p.id === id); let ticks = 0;
      while (ticks < 160 && !['eating', 'happy'].includes(pet.mode)) { f.tick(); ticks++; }
      f.render(); return { mode: pet.mode, ticks, count: pet.feedCount };
    }, chosen.id);
    expect(reaction.ticks).toBeLessThan(160); expect(reaction.count).toBe(chosen.count + 1); expect(['eating', 'happy']).toContain(reaction.mode);
    await page.keyboard.press('p'); await page.locator('[data-villa-terminal-tab="cameras"]').click(); await page.locator(`[data-villa-camera="${chosen.camera}"]`).click(); await tick(page, 0, true);
    const feed = page.locator('canvas[data-villa-security-feed]');
    const colors = await feed.evaluate((c: HTMLCanvasElement) => {
      const pixels = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data, colors = new Set<string>();
      for (let y = 5; y < c.height; y += 9) for (let x = 5; x < c.width; x += 11) { const i = (y * c.width + x) * 4; colors.add(`${pixels[i] >> 3}/${pixels[i + 1] >> 3}/${pixels[i + 2] >> 3}`); } return colors.size;
    });
    expect(colors).toBeGreaterThan(35); const image = test.info().outputPath('villa-v110-sheltered-pet-feeding-live-camera.png'); await feed.screenshot({ path: image });
    await test.info().attach('villa-v110-sheltered-pet-feeding-live-camera', { path: image, contentType: 'image/png' });
  } finally { await cleanup(page); }
});
