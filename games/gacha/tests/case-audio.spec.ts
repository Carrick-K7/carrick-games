import { test, expect, type Page } from '@playwright/test';

interface AudioRequest { file: string; status: number; url: string; type: string }

/** The recordings the page requested, keyed by file name. */
function recordAudioRequests(page: Page) {
  const audio = new Map<string, AudioRequest>();
  page.on('response', (response) => {
    const url = response.url();
    if (!/\/audio\/[a-z0-9-]+\.wav$/.test(url)) return;
    const file = url.split('/').pop()!;
    audio.set(file, { file, status: response.status(), url, type: response.headers()['content-type'] ?? '' });
  });
  return audio;
}

const REQUIRED = [
  'latch.wav', 'latch-heavy.wav', 'case-body.wav',
  'tick-1.wav', 'tick-2.wav', 'tick-3.wav',
  'thud.wav', 'knock.wav',
  'bell.wav', 'bell-grand.wav', 'bell-deep.wav',
  'pluck.wav', 'coins.wav', 'riser.wav', 'rattle.wav',
  'chime-low.wav', 'chime-mid.wav', 'chime-glass.wav', 'click.wav',
];

if (!process.env.GAME_ID || process.env.GAME_ID === 'gacha') {
  test.describe('Gacha recorded case-opening audio', () => {
    test('loads the full kit from its own release base and plays a pull without errors', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(String(error)));
      const audio = recordAudioRequests(page);

      await page.goto('/#/gacha');
      const canvas = page.locator('#gameCanvas');
      await expect(canvas).toHaveAttribute('data-game-running', 'true');
      // A trusted gesture lets the game open its audio context and fetch the kit.
      await canvas.click({ position: { x: 20, y: 20 } });
      await expect.poll(() => audio.size, { timeout: 20000 }).toBeGreaterThan(15);

      const requests = [...audio.values()];
      for (const request of requests) {
        expect(request.status, `${request.file} must be served`).toBe(200);
        expect(request.type, `${request.file} must be audio`).toMatch(/audio|octet-stream/);
      }
      // Every recording resolves beside the game's own entry, never a shared namespace.
      const bases = new Set(requests.map((request) => request.url.slice(0, request.url.lastIndexOf('/audio/'))));
      expect(bases.size).toBe(1);
      // The voices the arrangement depends on, not just any subset.
      for (const required of REQUIRED) expect([...audio.keys()], `${required} must be part of the kit`).toContain(required);

      // A complete pull with the recorded kit loaded stays clean.
      const box = (await canvas.boundingBox())!;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await expect(canvas).toHaveAttribute('data-gacha-screen', 'unlock');
      await expect(canvas).toHaveAttribute('data-gacha-screen', 'result', { timeout: 20000 });
      expect(errors).toEqual([]);
    });

    test('ships decodable, non-silent recordings', async ({ page }) => {
      const audio = recordAudioRequests(page);
      await page.goto('/#/gacha');
      const canvas = page.locator('#gameCanvas');
      await canvas.click({ position: { x: 20, y: 20 } });
      await expect.poll(() => audio.size, { timeout: 20000 }).toBeGreaterThan(15);

      const decoded = await page.evaluate(async (files: string[]) => {
        const context = new AudioContext();
        const results: { file: string; seconds: number; peak: number }[] = [];
        for (const file of files) {
          const url = [...performance.getEntriesByType('resource')]
            .map((entry) => entry.name)
            .find((name) => name.endsWith(`/audio/${file}`));
          if (!url) continue;
          const buffer = await context.decodeAudioData(await (await fetch(url)).arrayBuffer());
          let peak = 0;
          for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
            const data = buffer.getChannelData(ch);
            for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
          }
          results.push({ file, seconds: buffer.duration, peak });
        }
        void context.close();
        return results;
      }, REQUIRED);

      expect(decoded).toHaveLength(REQUIRED.length);
      for (const { file, seconds, peak } of decoded) {
        expect(seconds, `${file} must hold audio`).toBeGreaterThan(0.015);
        expect(peak, `${file} must not be silent`).toBeGreaterThan(0.2);
      }
    });

    test('keeps working when the recordings never arrive', async ({ page }) => {      // Deny the kit: the synthesized fallback must keep the pull playable.
      await page.route('**/audio/*.wav', (route) => route.abort());
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(String(error)));
      await page.goto('/#/gacha');
      const canvas = page.locator('#gameCanvas');
      await expect(canvas).toHaveAttribute('data-game-running', 'true');
      await canvas.click({ position: { x: 20, y: 20 } });
      const box = (await canvas.boundingBox())!;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await expect(canvas).toHaveAttribute('data-gacha-screen', 'unlock');
      await expect(canvas).toHaveAttribute('data-gacha-screen', 'result', { timeout: 20000 });
      expect(errors).toEqual([]);
    });
  });
}
