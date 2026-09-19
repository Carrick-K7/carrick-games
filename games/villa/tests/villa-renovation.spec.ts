import { test, expect, type Page } from '@playwright/test';
import { gameModuleUrl } from '../../../tests/support/releases';
import { VILLA_SUV } from '../src/villaSuv.js';

async function fixture(page: Page) {
  await page.route('**/__villa-renovation', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body style="margin:0"><main id="gameApp" style="position:relative;width:960px;height:600px"><canvas id="gameCanvas" tabindex="0"></canvas></main></body></html>' }));
  await page.goto('/__villa-renovation');
  await page.evaluate(async url => {
    const { VillaGame } = await import(url);
    const canvas = document.querySelector('canvas')!;
    const game = new VillaGame({ canvas, logicalWidth: 960, logicalHeight: 600, isDarkTheme: () => false, isZhLang: () => true,
      isPixelMode: () => false, getRecord: () => null, reportScore() {}, requestShellRender() {} }) as any;
    game.prepare(); game.start(); cancelAnimationFrame(game.animationId);
    (window as any).__villaRenovation = game;
  }, gameModuleUrl('villa'));
}

test('native audio activation, mute, pause and destroy follow the game lifecycle', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await fixture(page);
  expect(await page.evaluate(() => {
    const g = (window as any).__villaRenovation;
    for (let i = 0; i < 30; i++) g.update(.05);
    g.handleInput(new KeyboardEvent('keydown', { key: 'w' })); g.keys.clear();
    return g.audio.ctx === null;
  })).toBe(true);
  await page.keyboard.press('w');
  await expect.poll(() => page.evaluate(() => (window as any).__villaRenovation.audio.ctx?.state)).toBe('running');
  await page.evaluate(() => { const g = (window as any).__villaRenovation; g.update(.05); g.setTerminal(true); });
  await page.locator('[data-villa-terminal-tab="settings"]').click();
  const sound = page.locator('[data-villa-sound]');
  await sound.click(); await expect(sound).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => {
    const a = (window as any).__villaRenovation.audio;
    return { master: a.master.gain.value, ambient: a.ambience, engine: a.engine, voices: a.voices.size };
  })).toEqual({ master: 0, ambient: null, engine: null, voices: 0 });
  await sound.click(); await expect(sound).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await page.evaluate(() => { const g = (window as any).__villaRenovation; g.update(.05); g.setPresentationPaused(true); });
  expect(await page.evaluate(() => (window as any).__villaRenovation.audio.master.gain.value)).toBe(0);
  await page.evaluate(() => (window as any).__villaRenovation.setPresentationPaused(false));
  // Programmatic resume is silent until another trusted input.
  expect(await page.evaluate(() => (window as any).__villaRenovation.audio.master.gain.value)).toBe(0);
  await page.keyboard.press('w');
  await page.evaluate(() => { const g = (window as any).__villaRenovation; g.audio.elevatorArrive(); window.dispatchEvent(new Event('blur')); });
  expect(await page.evaluate(() => (window as any).__villaRenovation.audio.master.gain.value)).toBe(0);
  const closed = await page.evaluate(async () => {
    const g = (window as any).__villaRenovation, context = g.audio.ctx;
    g.stop(); const silent = g.audio.master.gain.value === 0;
    g.destroy(); await new Promise(resolve => setTimeout(resolve, 50));
    return { silent, state: context.state };
  });
  expect(closed).toEqual({ silent: true, state: 'closed' }); expect(errors).toEqual([]);
});

test('SUV boards by the real driver-door action, clears bay four, then exits safely', async ({ page }) => {
  test.setTimeout(90_000); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await fixture(page);
  const result = await page.evaluate(exit => {
    const g = (window as any).__villaRenovation;
    g.position = { ...exit }; g.eyeY = exit.y; g.yaw = Math.PI / 2; g.pitch = -.1;
    const key = (key: string, type = 'keydown') => g.handleInput(new KeyboardEvent(type, { key }));
    const tick = (n: number) => { for (let i = 0; i < n; i++) g.update(.05); };
    const target = g.hotspot()?.id; key('e'); key('e', 'keyup'); tick(80);
    const seated = g.state.seated === 'suv' && !g.state.suvDoorOpen;
    const started = { ...g.state.suv };
    key('w'); tick(60); key('w', 'keyup'); key(' '); tick(45); key(' ', 'keyup');
    const cleared = g.state.suv.z > 5 && g.state.suv.collisions === started.collisions;
    key('e'); key('e', 'keyup'); tick(80);
    const safeExit = g.state.seated === null && g.canFit(1.75) && !g.state.suvDoorOpen;
    g.destroy(); return { target, seated, cleared, safeExit };
  }, VILLA_SUV.exit);
  expect(result).toEqual({ target: 'suv', seated: true, cleared: true, safeExit: true }); expect(errors).toEqual([]);
});

test('first real mobile tap unlocks audio only in an active touch gesture', async ({ browser }) => {
  test.setTimeout(60_000);
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 430, height: 780 } });
  try {
    const page = await context.newPage(); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await fixture(page);
    expect(await page.evaluate(() => (window as any).__villaRenovation.audio.ctx === null)).toBe(true);
    await page.touchscreen.tap(300, 300);
    await expect.poll(() => page.evaluate(() => (window as any).__villaRenovation.audio.ctx?.state)).toBe('running');
    await page.evaluate(() => (window as any).__villaRenovation.destroy());
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test('bath doors block closed, open with Use from both sides and never close through the player; grill lids reset', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await fixture(page);
  const result = await page.evaluate(() => {
    const g = (window as any).__villaRenovation;
    // Explicit fixture placement isolates door mechanics; the full-map tour in
    // villa.spec.ts reaches these rooms by walking and stairs, not this helper.
    const pose = (x: number, z: number, floor = 3.6) => { g.position = { x, y: floor, z }; g.eyeY = floor; g.transition = null; g.motion.offset = g.motion.velocity = 0; g.yaw = -Math.PI / 2; g.keys.clear(); };
    const tick = (n = 24) => { for (let i = 0; i < n; i++) g.update(.05); };
    const use = () => { g.handleInput(new KeyboardEvent('keydown', { key: 'e' })); g.handleInput(new KeyboardEvent('keyup', { key: 'e' })); };
    pose(6.8, -4.8); g.keys.add('w'); tick(); g.keys.clear(); const closedBlocks = g.position.x < 8.2;
    pose(6.8, -4.8); const westTarget = g.hotspot()?.id; use(); tick(); const westOpened = g.state.bathDoors.progressW === 1;
    g.keys.add('w'); tick(18); g.keys.clear(); const crossedWest = g.position.x > 8.6;
    pose(8.18, -4.8); use(); tick(30); const held = g.state.bathDoors.progressW;
    const safeWhenOccupied = held > 0 && !g.state.bathDoors.west && g.canFit(1.75);
    pose(6.8, -4.8); tick(); const closedAfterClearing = g.state.bathDoors.progressW === 0;
    pose(15.8, -2); const eastTarget = g.hotspot()?.id; use(); tick(); const eastOpened = g.state.bathDoors.progressE === 1;
    pose(18.2, -2); use(); tick(); const eastClosedFromHall = g.state.bathDoors.progressE === 0;
    const grills = [[10.4, -5.4], [13.4, -5.4], [11.9, -8.2]];
    const grillTargets = [];
    for (const [x, z] of grills) { pose(x, z, 7.2); grillTargets.push(g.hotspot()?.id); use(); tick(); }
    const root = g.scene.scene, lids = [1, 2, 3].map(i => root.getObjectByName(`roof-grill-lid-${i}`));
    const openedGrills = lids.every(lid => Math.abs(lid.rotation.x + 1.25) < .001);
    g.restart(); cancelAnimationFrame(g.animationId);
    const reset = lids.every(lid => lid.rotation.x === 0) && g.state.bathDoors.progressW === 0 && g.state.bathDoors.progressE === 0;
    g.destroy();
    return { closedBlocks, westTarget, eastTarget, westOpened, crossedWest, safeWhenOccupied, closedAfterClearing, eastOpened, eastClosedFromHall, grillTargets, openedGrills, reset };
  });
  expect(result).toEqual({ closedBlocks: true, westTarget: 'bath-door-west', eastTarget: 'bath-door-east', westOpened: true, crossedWest: true,
    safeWhenOccupied: true, closedAfterClearing: true, eastOpened: true, eastClosedFromHall: true,
    grillTargets: ['grill-west', 'grill-centre', 'grill-east'], openedGrills: true, reset: true });
  expect(errors).toEqual([]);
});
