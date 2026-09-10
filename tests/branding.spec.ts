import { test, expect } from '@playwright/test';

for (const mobile of [false, true]) {
  test.describe(`brand identity ${mobile ? 'phone' : 'desktop'}`, () => {
    test.use({ viewport: mobile ? { width: 320, height: 568 } : { width: 1440, height: 900 }, hasTouch: mobile, isMobile: mobile });
    test('entry, menu and library retain the full brand without a start gate', async ({ page }, info) => {
      await page.goto('/#/gacha');
      const canvas = page.locator('#gameCanvas'), brand = page.locator('#siteBrand');
      await expect(canvas).toHaveAttribute('data-game-running', 'true');
      await expect(page.locator('#startOverlay')).toHaveCount(0);
      await expect(brand).toBeVisible();
      await expect(brand).toHaveAccessibleName(/Carrick Games/);
      await expect(brand.locator('img')).toHaveAttribute('src', '/brand/logo.svg');
      await expect(brand).toContainText('Carrick Games');
      const count = await canvas.getAttribute('data-game-prepare-count');
      await expect.poll(() => page.evaluate(() => {
        const a = document.getElementById('siteBrand')!.getBoundingClientRect();
        const b = document.querySelector('.gacha-progress-hud')!.getBoundingClientRect();
        const c = document.getElementById('gameCanvas')!.getBoundingClientRect();
        return a.right <= b.left && b.bottom <= c.top && a.width === 96 && a.height === 44;
      })).toBe(true);
      await page.screenshot({ path: info.outputPath('branded-entry.png') });
      await brand.click();
      await expect(page.locator('.library-dialog')).toBeVisible();
      await expect(page.locator('.library-brand')).toHaveText('Carrick Games');
      await page.locator('#libraryCloseBtn').click();
      await expect(canvas).toBeFocused();
      await expect(canvas).toHaveAttribute('data-game-prepare-count', count!);
      await page.locator('#overflowBtn').click();
      await expect(page.locator('.wordmark')).toHaveText('Carrick Games');
      expect((await page.locator('.wordmark').innerText()).replace(/\s+/g, ' ').trim()).toBe('Carrick Games');
      await expect(page.locator('.wordmark img')).toHaveAttribute('src', '/brand/logo.svg');
      await page.locator('#overflowMenu').evaluate(async el => Promise.all(el.getAnimations({ subtree: true }).filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))));
      await page.screenshot({ path: info.outputPath('branded-menu.png') });
      await page.locator('#menuCloseBtn').click();
      await page.keyboard.press('Shift+Slash');
      await expect(page.locator('#helpOverlay')).toHaveAttribute('aria-owns', 'siteBrand helpBtn overflowBtn');
      await page.locator('#guideBody').focus();
      await page.keyboard.press('Tab');
      await expect(brand).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator('.library-dialog')).toBeVisible();
      await expect(page.locator('#helpOverlay')).toBeHidden();
    });
  });
}

test('the browser reads explicit install metadata and matching icon assets', async ({ page, request }) => {
  await page.goto('/#/snake');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/app.webmanifest');
  await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute('href', '/brand/logo.svg');
  await expect(page.locator('meta[name="application-name"]')).toHaveAttribute('content', 'Carrick Games');
  const response = await request.get('/app.webmanifest');
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest).toMatchObject({ name: 'Carrick Games', short_name: 'Carrick Games', id: '/', start_url: '/', scope: '/', display: 'standalone', theme_color: '#0d9488' });
  expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual(['192x192', '512x512', '512x512']);
  expect(manifest.icons.map((icon: { purpose: string }) => icon.purpose)).toEqual(['any', 'any', 'maskable']);
  const cdp = await page.context().newCDPSession(page);
  const result = await cdp.send('Page.getAppManifest');
  expect(result.url).toMatch(/\/app\.webmanifest$/);
  expect(result.errors).toEqual([]);
  expect(JSON.parse(result.data).name).toBe('Carrick Games');
  for (const icon of manifest.icons) {
    const r = await request.get(icon.src);
    expect(r.ok()).toBe(true);
    expect(r.headers()['content-type']).toContain('image/png');
    const png = await r.body(), size = Number(icon.sizes.split('x')[0]);
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(png.readUInt32BE(16)).toBe(size); expect(png.readUInt32BE(20)).toBe(size);
    const colors = await page.evaluate(async ({ src, size, maskable }) => {
      const img = new Image(); img.src = src; await img.decode();
      const svg = new Image(); svg.src = '/brand/logo.svg'; await svg.decode();
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d')!; ctx.drawImage(img, 0, 0);
      const center = [...ctx.getImageData(size / 2, size / 2, 1, 1).data];
      const corner = [...ctx.getImageData(0, 0, 1, 1).data];
      const actual = ctx.getImageData(0, 0, size, size).data;
      ctx.fillStyle = '#f6f7f5'; ctx.fillRect(0, 0, size, size);
      const scale = maskable ? .72 : .88, inset = size * (1 - scale) / 2;
      ctx.drawImage(svg, inset, inset, size * scale, size * scale);
      const reference = ctx.getImageData(0, 0, size, size).data;
      let mismatch = 0, union = 0, outsideSafeCircle = 0;
      for (let i = 0; i < actual.length; i += 4) {
        const a = actual[i] < 128, b = reference[i] < 128;
        if (a || b) union++; if (a !== b) mismatch++;
        if (actual[i] !== 246 || actual[i + 1] !== 247 || actual[i + 2] !== 245) {
          const pixel = i / 4, x = pixel % size + .5, y = Math.floor(pixel / size) + .5;
          if (Math.hypot(x - size / 2, y - size / 2) > size * .4) outsideSafeCircle++;
        }
      }
      return { center, corner, mismatch: mismatch / union, outsideSafeCircle };
    }, { src: icon.src, size, maskable: icon.purpose === 'maskable' });
    expect(colors.center).toEqual([13, 148, 136, 255]);
    expect(colors.corner).toEqual([246, 247, 245, 255]);
    // Different SVG rasterizers may antialias edges differently; the shape must match.
    expect(colors.mismatch).toBeLessThan(.025);
    if (icon.purpose === 'maskable') expect(colors.outsideSafeCircle).toBe(0);
  }
});
