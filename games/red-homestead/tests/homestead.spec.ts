import { test, expect, type Page } from '@playwright/test';

interface Snapshot { worldId: string; mode: string; started: boolean; time: number; money: number; status: string; paused: boolean; saveState: string; panel: string | null; width: number; height: number; camera: { x: number; y: number; zoom: number }; buildings: { kind: string; progress: number; x: number; y: number }[]; units: { kind: string; task: string; cargo: number }[] }
async function state(page: Page): Promise<Snapshot> {
  return page.evaluate(() => (window as unknown as { __GAME_VIEWPORT_DEBUG__: { info(): Snapshot } }).__GAME_VIEWPORT_DEBUG__.info());
}
async function start(page: Page, mode = 'session') {
  await page.goto('/#red-homestead');
  await page.locator(`[data-rh-action="new-${mode}"]`).waitFor();
  await page.locator('[data-rh-field="name"]').fill('A peaceful home');
  await page.locator(`[data-rh-action="new-${mode}"]`).click();
  await expect.poll(async () => (await state(page)).started).toBe(true);
}
async function place(page: Page, kind: string, x: number, y: number) {
  await page.locator('[data-rh-action="build"]').click();
  await page.locator(`[data-rh-action="build-${kind}"]`).click();
  const s = await state(page), rect = (await page.locator('#gameCanvas').boundingBox())!;
  const px = (x - y) * 30 * s.camera.zoom + s.camera.x, py = (x + y + 1) * 15 * s.camera.zoom + s.camera.y;
  await page.mouse.click(rect.x + px * rect.width / s.width, rect.y + py * rect.height / s.height);
  await page.keyboard.press('Escape');
}

test('development provenance is honest and both modes are reachable', async ({ page }) => {
  await page.goto('/#red-homestead');
  await expect(page.locator('[data-rh-action="new-session"]')).toBeVisible();
  await expect(page.locator('[data-rh-action="new-homestead"]')).toBeVisible();
  await expect(page.locator('.rh-note').first()).toContainText(/原创|original/);
  await page.locator('[data-rh-action="materials"]').click();
  await expect(page.locator('[data-rh-action="inspect-assets"]')).toBeVisible();
  await expect(page.locator('.rh-dialog')).toContainText(/VXL.*HVA/);
});

test('host window-targeted input release events are safe before and during play', async ({ page }) => {
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/#red-homestead');await page.locator('[data-rh-action="new-session"]').waitFor();
  const release=()=>page.evaluate(()=>{
    for(const key of ['ArrowLeft','ArrowRight','Escape'])window.dispatchEvent(new KeyboardEvent('keyup',{key,bubbles:true}));
    window.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
  });
  await release();await page.locator('[data-rh-action="new-session"]').click();await expect.poll(async()=>(await state(page)).started).toBe(true);
  const id=(await state(page)).worldId;await release();
  await page.locator('#helpBtn').click();await page.keyboard.press('Escape');
  expect((await state(page)).worldId).toBe(id);expect(errors).toEqual([]);
});

test('native deployment and building pay once and reject overlap', async ({ page }) => {
  await start(page); await page.locator('[data-rh-action="deploy"]').click();
  expect((await state(page)).buildings.map(b => b.kind)).toEqual(['yard']);
  await place(page, 'power', 10, 6);
  let s = await state(page); expect(s.buildings.map(b => b.kind)).toEqual(['yard', 'power']);
  expect(s.money).toBeLessThan(5410);
  await place(page, 'house', 10, 6);
  s = await state(page); expect(s.buildings).toHaveLength(2); expect(s.money).toBeLessThan(5410);
});

test('manual pause survives shell help and resizing does not reset the world', async ({ page }) => {
  await start(page); await page.locator('[data-rh-action="deploy"]').click();
  await page.locator('[data-rh-action="pause"]').click();
  const before = await state(page);
  await page.locator('#helpBtn').click(); await expect(page.locator('.rh-ui')).toBeHidden();
  await page.locator('#helpCloseBtn').click(); await expect(page.locator('.rh-ui')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const after = await state(page);
  expect(after.worldId).toBe(before.worldId); expect(after.time).toBe(before.time); expect(after.paused).toBe(true); expect(after.buildings).toEqual(before.buildings);
  await page.locator('[data-rh-action="pause"]').click();
  await expect.poll(async () => (await state(page)).time).toBeGreaterThan(before.time);
});

test('homestead survives reload without offline progress and exports valid data', async ({ page }) => {
  await start(page, 'homestead'); await page.locator('[data-rh-action="deploy"]').click();
  await place(page, 'power', 10, 6);
  await page.locator('[data-rh-action="worlds"]').click();
  await expect.poll(async () => (await state(page)).saveState).toBe('saved');
  const before = await state(page);
  const download = page.waitForEvent('download'); await page.locator('[data-rh-action="export"]').click();
  expect((await download).suggestedFilename()).toContain(before.worldId);
  await page.reload();
  const load = page.locator(`[data-rh-action="load-${before.worldId}"]`); await load.waitFor(); await load.click();
  await page.locator('[data-rh-action="pause"]').click();
  const restored = await state(page);
  expect(restored.worldId).toBe(before.worldId); expect(restored.buildings.map(b => b.kind)).toEqual(['yard', 'power']);
  expect(restored.time - before.time).toBeLessThan(1); expect(restored.time).toBeGreaterThanOrEqual(before.time);
});

test('ending a session freezes all simulation and can start again', async ({ page }) => {
  await start(page); await page.locator('[data-rh-action="deploy"]').click();
  await page.locator('[data-rh-action="worlds"]').click(); await page.locator('[data-rh-action="end"]').click();
  await page.locator('[data-rh-action="confirm-end"]').click();
  const before = await state(page); expect(before.status).toBe('ended');
  await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-result', 'success');
  // A shell overlay advances browser time but must not advance a terminal world.
  await page.locator('#helpBtn').click(); await page.locator('#helpCloseBtn').click();
  expect((await state(page)).time).toBe(before.time);
  await page.locator('#gameCanvas').click({ position: { x: 120, y: 160 } });
  await page.locator('[data-rh-action="new-session"]').click();
  expect((await state(page)).worldId).not.toBe(before.worldId);
});

test('storage failure is visible and does not claim a successful save', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { get() { throw new Error('Storage disabled for fixture'); } }); });
  await start(page, 'homestead');
  await expect.poll(async () => (await state(page)).saveState).toBe('error');
  await expect(page.locator('.rh-status')).toContainText(/保存失败|Save failed/);
});

test('320px touch layout has reachable native controls and dragging never builds', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 640 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await start(page); await page.locator('[data-rh-action="deploy"]').tap();
  const before = await state(page);
  for (const action of ['build', 'pause', 'worlds', 'zoom-in', 'zoom-out']) {
    const box = (await page.locator(`[data-rh-action="${action}"]`).boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(320); expect(box.y + box.height).toBeLessThanOrEqual(640);
  }
  await page.locator('[data-rh-action="build"]').tap(); await page.locator('[data-rh-action="build-house"]').tap();
  const canvas = page.locator('#gameCanvas');
  await canvas.dispatchEvent('touchstart', { touches: [{ identifier: 1, clientX: 160, clientY: 260 }], changedTouches: [{ identifier: 1, clientX: 160, clientY: 260 }] });
  await canvas.dispatchEvent('touchmove', { touches: [{ identifier: 1, clientX: 210, clientY: 330 }], changedTouches: [{ identifier: 1, clientX: 210, clientY: 330 }] });
  await canvas.dispatchEvent('touchend', { touches: [], changedTouches: [{ identifier: 1, clientX: 210, clientY: 330 }] });
  expect((await state(page)).buildings).toHaveLength(before.buildings.length);
  await context.close();
});

test('local synthetic sprites, voxels and maps decode in a worker without uploads', async ({ page }) => {
  const uploads: string[] = []; page.on('request', request => { if (request.method() === 'POST' || request.method() === 'PUT') uploads.push(request.url()); });
  await page.goto('/#red-homestead'); await page.locator('[data-rh-action="materials"]').click();
  const shp = Buffer.alloc(36); shp.writeUInt16LE(4, 2); shp.writeUInt16LE(1, 4); shp.writeUInt16LE(1, 6);
  shp.writeUInt16LE(4, 12); shp.writeUInt16LE(1, 14); shp[16] = 1; shp.writeUInt32LE(32, 28); shp.set([1, 2, 3, 4], 32);
  const palette = Buffer.alloc(768); palette[3] = 63;
  await page.locator('[data-rh-action="inspect-assets"]').setInputFiles([
    { name: 'synthetic.shp', mimeType: 'application/octet-stream', buffer: shp },
    { name: 'synthetic.pal', mimeType: 'application/octet-stream', buffer: palette },
  ]);
  const canvas = page.locator('.rh-inspector canvas'); await expect(canvas).toHaveAttribute('width', '4');
  expect(await canvas.evaluate(node => [...(node as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, 1, 1).data])).toEqual([255, 0, 0, 255]);
  expect(uploads).toEqual([]);
  const vxl = Buffer.alloc(937), tail = 845;
  vxl.write('Voxel Animation', 0, 'ascii'); vxl.writeUInt32LE(1, 16); vxl.writeUInt32LE(1, 20); vxl.writeUInt32LE(1, 24); vxl.writeUInt32LE(15, 28);
  vxl.write('body', 802, 'ascii'); vxl.writeUInt32LE(1, 822); vxl.writeInt32LE(0, 830); vxl.writeInt32LE(6, 834); vxl.set([1, 2, 1, 4, 1, 7, 2], 838);
  vxl.writeUInt32LE(4, tail + 4); vxl.writeUInt32LE(8, tail + 8); vxl.writeFloatLE(1 / 12, tail + 12);
  for (const at of [16, 36, 56, 76, 80]) vxl.writeFloatLE(1, tail + at);
  vxl.writeFloatLE(4, tail + 84); vxl.set([1, 1, 4, 4], tail + 88);
  const hva = Buffer.alloc(88); hva.writeUInt32LE(1, 16); hva.writeUInt32LE(1, 20); hva.write('body', 24, 'ascii');
  for (const at of [40, 60, 80]) hva.writeFloatLE(1, at);
  await page.locator('[data-rh-action="inspect-assets"]').setInputFiles([
    { name: 'synthetic.vxl', mimeType: 'application/octet-stream', buffer: vxl },
    { name: 'synthetic.hva', mimeType: 'application/octet-stream', buffer: hva },
    { name: 'synthetic.pal', mimeType: 'application/octet-stream', buffer: palette },
  ]);
  await expect(page.locator('.rh-inspector')).toContainText('palette-only lighting');
  await expect(page.locator('.rh-inspector canvas')).toHaveCount(1);
  const packed = (raw: Buffer) => {
    const lzo = Buffer.concat([Buffer.from([17 + raw.length]), raw, Buffer.from([17, 0, 0])]);
    const chunk = Buffer.alloc(4); chunk.writeUInt16LE(lzo.length, 0); chunk.writeUInt16LE(raw.length, 2);
    return Buffer.concat([chunk, lzo]).toString('base64');
  };
  const tile = Buffer.alloc(15); tile.writeUInt16LE(3, 0); tile.writeUInt16LE(3, 2); tile.writeUInt32LE(1, 4);
  const map = `[Map]\nSize=0,0,4,4\nTheater=SNOW\n[IsoMapPack5]\n1=${packed(tile)}\n[Preview]\nSize=0,0,1,1\n[PreviewPack]\n1=${packed(Buffer.from([0, 0, 255]))}\n`;
  await page.locator('[data-rh-action="inspect-assets"]').setInputFiles({ name: 'synthetic.map', mimeType: 'text/plain', buffer: Buffer.from(map) });
  await expect(page.locator('.rh-inspector')).toContainText('1 decoded cells');
  expect(await page.locator('.rh-inspector canvas').evaluate(node => [...(node as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, 1, 1).data])).toEqual([255, 0, 0, 255]);
  expect(uploads).toEqual([]);
  await page.locator('[data-rh-action="inspect-assets"]').setInputFiles({ name: 'truncated.shp', mimeType: 'application/octet-stream', buffer: Buffer.alloc(2) });
  await expect(page.locator('.rh-inspector .rh-error')).toBeVisible();
  await page.locator('[data-rh-action="back-worlds"]').click(); await expect(page.locator('[data-rh-action="new-session"]')).toBeVisible();
});

test('a stale browser tab cannot overwrite a newer home save', async ({ page, context }) => {
  await start(page, 'homestead'); await page.locator('[data-rh-action="worlds"]').click();
  await expect.poll(async () => (await state(page)).saveState).toBe('saved'); const id = (await state(page)).worldId;
  const other = await context.newPage(); await other.goto('/#red-homestead');
  await other.locator(`[data-rh-action="load-${id}"]`).click();
  await other.locator('[data-rh-action="worlds"]').click(); await expect.poll(async () => (await state(other)).saveState).toBe('saved');
  await page.locator('[data-rh-action="save"]').click(); await expect.poll(async () => (await state(page)).saveState).toBe('error');
  await expect(page.locator('.rh-status')).toContainText(/保存失败|Save failed/);
  await other.close();
});

test('restarting through world selection does not duplicate UI or input', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await start(page);
  await page.locator('[data-rh-action="worlds"]').click();
  await page.locator('[data-rh-action="new-session"]').click();
  await page.locator('[data-rh-action="deploy"]').click();
  await expect(page.locator('[data-rh-ui]')).toHaveCount(1);
  expect((await state(page)).buildings.map(b => b.kind)).toEqual(['yard']);
  expect(errors).toEqual([]);
});
