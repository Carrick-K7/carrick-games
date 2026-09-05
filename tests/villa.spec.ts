import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function villaModule(): string {
  const manifest = JSON.parse(readFileSync(join(process.cwd(), 'dist/.vite/manifest.json'), 'utf8'));
  return `/${manifest['src/games/villa.ts'].file}`;
}

test.describe('Warm Villa', () => {
  test('real shell renders the home, supports walking and map, and cleans up on switch', async ({ page }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
    await page.goto('/#/villa');
    const canvas = page.locator('#gameCanvas');
    await expect(page.locator('#startOverlay')).toHaveClass(/active/);
    await expect(canvas).toHaveAttribute('data-villa-renderer', 'webgl');
    await page.locator('#startOverlay').click();
    await expect(page.locator('#startOverlay')).not.toHaveClass(/active/);
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
    await page.keyboard.press('t');
    await expect(canvas).toHaveAttribute('data-villa-time', 'day');
    const lookBefore = await canvas.getAttribute('data-villa-look');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width * 0.5, box!.y + box!.height * 0.5);
    // Mouse movement alone changes view; no held button or drag gesture.
    await page.mouse.move(box!.x + box!.width * 0.66, box!.y + box!.height * 0.53, { steps: 4 });
    await expect.poll(() => canvas.getAttribute('data-villa-look')).not.toBe(lookBefore);
    await page.locator('#gamePickerBtn').click();
    await page.locator('.game-list-item[data-id="snake"]').click();
    await expect(canvas).not.toHaveAttribute('data-villa-renderer', /.+/);
    await expect(page.locator('#startOverlay')).toHaveClass(/active/);
    expect(errors).toEqual([]);
  });

  test('furnished controller walks both stairs up and down, enters every room, and interacts', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/#/snake');
    const result = await page.evaluate(async (moduleUrl) => {
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
      key('h'); walk(0, 1.4); walk(3.2, 1.4);
      const floors: number[] = [];
      const ascend = () => { walk(3.2, -6.2); walk(5.2, -6.2); walk(5.2, 1.4); floors.push(game.position.y); };
      ascend();
      walk(0, 1.4); walk(0, 2.6); walk(-3.4, 2.6); // master entry
      const masterHudText: string[] = [], originalFillText = game.ctx.fillText;
      game.ctx.fillText = (text: string) => masterHudText.push(text);
      game.drawHud(game.ctx); game.ctx.fillText = originalFillText;
      const masterHudHasRoomLabel = masterHudText.some(text => text.includes('主卧'));
      walk(0, 2.6); walk(0, -3.5); walk(-3.4, -3.5); // guest entry
      walk(0, -3.5); walk(0, 1.7); walk(8.2, 1.7); walk(8.2, -0.5); // bath entry
      walk(8.2, 1.7); walk(4.2, 1.7); walk(4.2, 4); // reading room entry
      walk(4.2, 1.4); walk(3.2, 1.4); ascend();
      game.renderFrame();
      const roofImage = canvas.toDataURL('image/png');
      const descend = () => { walk(5.2, -6.2); walk(3.2, -6.2); walk(3.2, 1.4); floors.push(game.position.y); };
      descend(); walk(5.2, 1.4); descend();
      walk(4.2, 1.4); walk(4.2, 4); // gaming room
      walk(4.2, 1.4); walk(13.4, 1.4); // internally connected garage
      walk(0, 1.4); walk(0, -2.8); walk(-3.2, -2.8); // kitchen
      walk(0, -2.8); walk(0, 2.2); walk(-3.5, 2.2); key('e');
      const fed = game.state.fedUntil > game.time;
      walk(-6, 2.2); walk(-10, 2.2); key('e');
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
      return { floors, fed, fireOff, visited, scores, blurStopped, cleaned, masterHudHasRoomLabel, roofImage, interiorImage };
    }, villaModule());
    expect(result.floors[0]).toBeCloseTo(3.6, 4);
    expect(result.floors[1]).toBeCloseTo(7.2, 4);
    expect(result.floors[2]).toBeCloseTo(3.6, 4);
    expect(result.floors[3]).toBeCloseTo(0, 4);
    expect(result.visited).toEqual(expect.arrayContaining(['living', 'kitchen', 'gaming', 'garage', 'master', 'guest', 'bath', 'library', 'terrace', 'stairs']));
    expect(result.masterHudHasRoomLabel).toBe(false);
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
