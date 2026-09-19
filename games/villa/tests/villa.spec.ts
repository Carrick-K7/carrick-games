import { test, expect } from '@playwright/test';
import { gameModuleUrl } from '../../../tests/support/releases';
import { VILLA_AQUARIUM } from '../src/villaLivingLayout';
import { VILLA_GARAGE_BAYS } from '../src/villaEstateLayout';

function villaModule(): string {
  return gameModuleUrl('villa');
}

test.describe('Warm Villa', () => {
  test('real shell renders the home, supports walking and map, and cleans up on switch', async ({ page }) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
    await page.goto('/#/villa');
    const canvas = page.locator('#gameCanvas');
    // Cold software-WebGL setup can outlast the generic 5s locator timeout.
    await expect(canvas).toHaveAttribute('data-villa-renderer', 'webgl', { timeout: 45_000 });
    await expect(canvas).toHaveAttribute('data-game-running', 'true');
    // Entering plays immediately; the first canvas click grants mouse capture.
    await canvas.click();
    const colors = await canvas.evaluate((c: HTMLCanvasElement) => {
      const ctx = c.getContext('2d')!;
      const values = new Set<string>();
      for (let y = 100; y < c.height - 80; y += Math.max(1, Math.floor(c.height / 35))) {
        for (let x = 30; x < c.width - 30; x += Math.max(1, Math.floor(c.width / 45))) {
          values.add(Array.from(ctx.getImageData(x, y, 1, 1).data).join(','));
        }
      }
      return values.size;
    });
    expect(colors).toBeGreaterThan(150);
    // Release capture before a locator screenshot's scroll/stability action.
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => document.pointerLockElement)).toBeNull();
    await canvas.screenshot({ path: 'test-results/villa-exterior.png' });
    await page.keyboard.press('h');
    await expect(canvas).toHaveAttribute('data-villa-position', '{"x":0,"y":0,"z":11.5}');
    await page.keyboard.down('w');
    await expect.poll(async () => JSON.parse((await canvas.getAttribute('data-villa-position'))!).z).toBeLessThan(11.25);
    await page.keyboard.up('w');
    await page.keyboard.press('m');
    await expect(canvas).toHaveAttribute('data-villa-map', 'true');
    const beforeMap = await canvas.getAttribute('data-villa-position');
    await page.keyboard.press('3');
    await page.keyboard.down('w');
    await page.waitForTimeout(150);
    await page.keyboard.up('w');
    expect(await canvas.getAttribute('data-villa-position')).toBe(beforeMap);
    await page.keyboard.press('Escape');
    await expect(canvas).toHaveAttribute('data-villa-map', 'false');
    await expect(canvas).toHaveAttribute('data-villa-time', 'evening');
    for (const time of ['night', 'day', 'evening']) {
      await page.keyboard.press('t');
      await expect(canvas).toHaveAttribute('data-villa-time', time);
    }
    const lookBefore = await canvas.getAttribute('data-villa-look');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width * 0.5, box!.y + box!.height * 0.5);
    // Mouse movement alone changes view; no held button or drag gesture.
    await page.mouse.move(box!.x + box!.width * 0.66, box!.y + box!.height * 0.53, { steps: 4 });
    await expect.poll(() => canvas.getAttribute('data-villa-look')).not.toBe(lookBefore);
    await page.keyboard.press('Control+k');
    await page.locator('.game-list-item[data-id="snake"]').click();
    await expect(canvas).not.toHaveAttribute('data-villa-renderer', /.+/);
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');
    expect(errors).toEqual([]);
  });

  test('furnished controller walks both stairs up and down, enters every room, and interacts', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/#/snake');
    const result = await page.evaluate(async ({ moduleUrl, aquariumApproach, garageBay }) => {
      const { VillaGame } = await import(moduleUrl);
      const canvas = document.createElement('canvas');
      canvas.style.width = '1120px'; canvas.style.height = '700px'; document.body.append(canvas);
      let scores = 0;
      const game = new VillaGame({ canvas, logicalWidth: 1120, logicalHeight: 700, isDarkTheme: () => false, isZhLang: () => true, isPixelMode: () => false, getRecord: () => null, reportScore: () => scores++, requestShellRender: () => {} }) as any;
      game.prepare(); game.start(); cancelAnimationFrame(game.animationId);
      const key = (key: string, type = 'keydown') => game.handleInput(new KeyboardEvent(type, { key }));
      const walk = (x: number, z: number) => {
        // Real movement through the controller, never changing the player's position.
        for (const axis of ['x', 'z']) {
          const target = axis === 'x' ? x : z;
          let budget = 500;
          while (Math.abs(game.position[axis] - target) > 0.005 && budget-- > 0) {
            const diff = target - game.position[axis];
            game.yaw = axis === 'x' ? (diff > 0 ? -Math.PI / 2 : Math.PI / 2) : (diff > 0 ? Math.PI : 0);
            key('w'); game.update(Math.min(0.05, Math.abs(diff) / 2.75)); key('w', 'keyup');
          }
          if (budget <= 0) throw new Error(`Walk blocked before ${x},${z}: ${JSON.stringify(game.position)}`);
        }
      };
      key('h'); walk(0.04, 1.4);
      const floors: number[] = [];
      const ascend = () => { walk(0.04, -6.2); walk(2.06, -6.2); walk(2.06, 1.4); floors.push(game.position.y); };
      ascend();
      walk(0, 1.4); walk(0, 2.6); walk(-4.9, 2.6); // inside the moved master wall
      const masterHudText: string[] = [], originalFillText = game.ctx.fillText;
      game.ctx.fillText = (text: string) => masterHudText.push(text);
      game.drawHud(game.ctx); game.ctx.fillText = originalFillText;
      const masterMapLabel = game.utilityButtons().find((button: any) => button.id === 'map')?.label ?? '';
      const masterRoomHudLabels = masterHudText.filter(text => text.includes('主卧'));
      // The location/map badge is intentional; no extra or duplicate room HUD label is.
      const masterHudHasRoomLabel = masterRoomHudLabels.length > 1 || masterRoomHudLabels.some(text => text !== masterMapLabel);
      // The new west wing is physically toured: master balcony, ensuite,
      // dressing room, its guest doorway, and the guest's north gallery door.
      walk(-12.5, 2.6); walk(-12.5, 8.1); walk(-7.3, 8.1); walk(-7.3, 10);
      walk(-7.3, 8.1); walk(-12.5, 8.1); walk(-12.5, 2.6); walk(-1.5, 2.6);
      walk(-1.5, -3.65); walk(-8, -3.65); walk(-8, -4.9); walk(-16, -4.9);
      walk(-16, -10.5); walk(-13, -10.5); walk(-13, -16); walk(-1.5, -16);
      walk(6.4, -16); walk(6.4, -13.4); walk(10.5, -13.4); // study
      walk(6.4, -13.4); walk(6.4, -4.8); walk(6.8, -4.8);
      const useBathDoor = (id: string) => {
        game.yaw = -Math.PI / 2;
        if (game.hotspot()?.id !== id) throw new Error(`Door approach targets ${game.hotspot()?.id}, not ${id}`);
        key('e'); for (let i = 0; i < 22; i++) game.update(.05);
      };
      useBathDoor('bath-door-west');
      const westOpened = game.state.bathDoors.progressW === 1;
      // Pass beyond the open west leaf tips before turning around the tub.
      walk(9.85, -4.8); walk(9.85, -7.1); walk(13.4, -7.1); walk(13.4, -2); walk(15.8, -2);
      useBathDoor('bath-door-east');
      const eastOpened = game.state.bathDoors.progressE === 1;
      walk(18.2, -2); walk(22, -2); walk(22, -10.2); // reading hall -> massage
      walk(22, 5); walk(4.2, 5); walk(4.2, 1.4); walk(2.06, 1.4); ascend();
      game.scene.softwareInputFrames = 0; game.scene.lastDrawAt = -Infinity; game.renderFrame();
      const roofImage = canvas.toDataURL('image/png');
      const descend = () => { walk(2.06, -6.2); walk(0.04, -6.2); walk(0.04, 1.4); floors.push(game.position.y); };
      descend(); walk(2.06, 1.4); descend();
      // All north ground-floor zones, using actual furnished doorways.
      walk(-1.5, 1.4); walk(-1.5, -14.3); walk(-5, -14.3); walk(-14.4, -14.3); // laundry, tea
      walk(-1.5, -14.3); walk(-1.5, -10); walk(7.2, -10); walk(7.2, 0); // gym, snooker
      walk(21.5, 0); walk(21.5, -10.2); walk(21.5, 1.4); // cinema, cleared lounge
      walk(4.2, 1.4); walk(4.2, 4); // gaming room
      walk(4.2, 1.4); walk(garageBay.x, 1.4); // internally connected garage
      // Route round the stairwell and the aquarium cabinet (x=0 and x=-3.2 at
      // z=1.4 are now the lower flight and the aligned aquarium respectively).
      walk(0, 1.4); walk(-1.5, 1.4); walk(-1.5, -2.8); walk(-3.2, -2.8); // kitchen
      walk(-1.5, -2.8); walk(-1.5, 2.2); walk(aquariumApproach.x, 2.2); walk(aquariumApproach.x, aquariumApproach.z);
      const aquariumTarget = game.hotspot()?.id, aquariumApproachSafe = game.canFit(1.75); key('e');
      const fed = game.state.fedUntil > game.time;
      walk(aquariumApproach.x, 2.2); walk(-6, 2.2); walk(-10, 2.2); key('e');
      // Far west of the sofa and the aquarium cabinet, straight along the aisle.
      walk(-6, 2.2); walk(-20, 2.2); walk(-20, 6.5); // living room
      const fireOff = !game.state.fireplace;
      game.renderFrame();
      const interiorImage = canvas.toDataURL('image/png');
      const visited = [...game.visited];
      const beforeBlur = { ...game.position };
      key('w'); window.dispatchEvent(new Event('blur')); game.update(0.05);
      const blurStopped = JSON.stringify(beforeBlur) === JSON.stringify(game.position);
      game.destroy();
      const cleaned = game.scene === null && !canvas.hasAttribute('data-villa-renderer');
      canvas.remove();
      return { floors, westOpened, eastOpened, aquariumTarget, aquariumApproachSafe, fed, fireOff, visited, scores, blurStopped, cleaned, masterHudHasRoomLabel, masterMapLabel, masterRoomHudLabels, roofImage, interiorImage };
    }, { moduleUrl: villaModule(), aquariumApproach: VILLA_AQUARIUM.approach, garageBay: VILLA_GARAGE_BAYS[2] });
    expect(result.floors[0]).toBeCloseTo(3.6, 4);
    expect(result.floors[1]).toBeCloseTo(7.2, 4);
    expect(result.floors[2]).toBeCloseTo(3.6, 4);
    expect(result.floors[3]).toBeCloseTo(0, 4);
    expect(result.visited).toEqual(expect.arrayContaining(['living', 'kitchen', 'tea-room', 'utility', 'gym', 'snooker', 'cinema', 'east-lounge',
      'gaming', 'garage', 'master', 'balcony', 'guest', 'wardrobe', 'ensuite', 'study', 'bath', 'reading-hall', 'massage', 'terrace', 'stairs']));
    expect(result.westOpened && result.eastOpened).toBe(true);
    expect(result.masterMapLabel).toContain('主卧');
    expect(result.masterRoomHudLabels).toEqual([result.masterMapLabel]);
    expect(result.masterHudHasRoomLabel).toBe(false);
    expect(result.aquariumTarget).toBe('aquarium'); expect(result.aquariumApproachSafe).toBe(true);
    expect(result.fed).toBe(true);
    expect(result.fireOff).toBe(true);
    expect(result.blurStopped).toBe(true);
    expect(result.cleaned).toBe(true);
    expect(result.scores).toBe(0);
    await test.info().attach('roof', { body: Buffer.from(result.roofImage.split(',')[1], 'base64'), contentType: 'image/png' });
    await test.info().attach('interior', { body: Buffer.from(result.interiorImage.split(',')[1], 'base64'), contentType: 'image/png' });
  });

  test('two-finger touch keeps independent movement and look and clears cancelled input', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/#/snake');
    const result = await page.evaluate(async (moduleUrl) => {
      const { VillaGame } = await import(moduleUrl);
      const canvas = document.createElement('canvas');
      canvas.style.width = '1120px'; canvas.style.height = '700px'; document.body.append(canvas);
      const game = new VillaGame({ canvas, logicalWidth: 1120, logicalHeight: 700, isDarkTheme: () => true, isZhLang: () => false, isPixelMode: () => false, getRecord: () => null, reportScore: () => {}, requestShellRender: () => {} }) as any;
      game.prepare(); game.start(); cancelAnimationFrame(game.animationId);
      game.handleInput(new KeyboardEvent('keydown', { key: 'h' }));
      const rect = canvas.getBoundingClientRect();
      const touch = (identifier: number, x: number, y: number) => new Touch({ identifier, target: canvas, clientX: rect.left + x, clientY: rect.top + y });
      const send = (type: string, values: Touch[]) => game.handleInput(new TouchEvent(type, { changedTouches: values, cancelable: true }));
      send('touchstart', [touch(1, 200, 500), touch(2, 850, 390)]);
      send('touchmove', [touch(1, 200, 430), touch(2, 930, 400)]);
      const before = { ...game.position };
      game.update(0.05);
      const moved = Math.hypot(game.position.x - before.x, game.position.z - before.z) > 0.03;
      const looked = Math.abs(game.yaw) > 0.1;
      send('touchend', [touch(2, 930, 400)]);
      const independent = game.joystick?.id === 1 && game.lookTouch === null;
      canvas.dispatchEvent(new Event('touchcancel'));
      const p = { ...game.position }; game.update(0.05);
      const cancelled = game.joystick === null && game.lookTouch === null && JSON.stringify(p) === JSON.stringify(game.position);
      game.destroy(); canvas.remove();
      return { moved, looked, independent, cancelled };
    }, villaModule());
    expect(result).toEqual({ moved: true, looked: true, independent: true, cancelled: true });
  });
});
