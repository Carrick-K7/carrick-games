import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { openButterflyFixture, sampleButterflyFrame, closeButterflyFixture, type ButterflyAction } from './butterfly.fixture';

test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
test('butterfly action keyframes use the real release rig and renderer', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const { errors } = await openButterflyFixture(page);
  const records: any[] = [];
  try {
    for (const action of ['idle', 'draw', 'inspect', 'slash', 'stab'] as ButterflyAction[]) {
      const count = action === 'draw' ? 2 : 1; // Only the verified common inspect family.
      const times = action === 'idle' ? [0] : action === 'draw' ? [0, .15, .30, .45, .55, .70, 1]
        : action === 'inspect' ? [0, .08, .15, .35, .50, .75, .85, 1] : [0, .15, .27, .50, 1];
      for (let variant = 0; variant < count; variant++) for (const t of times) {
        const s = await sampleButterflyFrame(page, action, t, variant); records.push(s);
        expect(s.evidence).toBe('controlled-action-sampling-real-release-renderer');
        expect(s.knife).toBe('butterfly'); expect(s.finite).toBe(true);
        expect(s.renderFrame).toBeGreaterThan(records.length > 1 ? records.at(-2).renderFrame : 0);
        expect(s.wristBend).toBeLessThanOrEqual(.480001);
        expect(s.tip.every(Number.isFinite)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`${action}-${variant}-${Math.round(t * 100).toString().padStart(3, '0')}.png`) });
      }
    }
    const common = await sampleButterflyFrame(page, 'inspect', .5, 0);
    for (const staleVariant of [1, 2, 99]) {
      const normalized = await sampleButterflyFrame(page, 'inspect', .5, staleVariant);
      expect(normalized.tip).toEqual(common.tip); expect(normalized.pivot).toEqual(common.pivot);
      expect(normalized.bladeAngle).toBe(common.bladeAngle); expect(normalized.handleAngle).toBe(common.handleAngle);
    }
    for (const kind of ['slash', 'stab', 'inspect'] as const) {
      const before = await sampleButterflyFrame(page, 'inspect', .5, 2);
      const after = await page.evaluate(kind => (window as any).__CS_BUTTERFLY_FIXTURE__.interrupt(kind), kind);
      const distance = Math.hypot(...after.tip.map((v: number, i: number) => v - before.tip[i]));
      expect(distance, `same-clock ${kind} cannot teleport the displayed tip`).toBeLessThan(1e-7);
      if (kind !== 'inspect') expect(after.cooldown).toBe(kind === 'stab' ? 1 : .5);
      else expect(after.inspectAt).toBe(after.clock);
      for (let i = 1; i <= 12; i++) {
        const s = await page.evaluate(() => (window as any).__CS_BUTTERFLY_FIXTURE__.advance(1 / 60));
        expect(s.finite).toBe(true); records.push(s);
        if ([1, 4, 8, 12].includes(i)) await page.screenshot({ path: testInfo.outputPath(`interrupt-${kind}-${i}.png`) });
      }
    }
    await testInfo.attach('actual-action-frame-data', { body: Buffer.from(JSON.stringify(records, null, 2)), contentType: 'application/json' });
    // Optional deliverable recipe, not a test bypass: all checks above always run.
    // Frame timestamps use the authored simulation durations (30fps), not the
    // software renderer's variable wall-clock throughput. No audio is synthesized.
    if (process.env.CS_BUTTERFLY_MOTION_CAPTURE === '1') {
      const durations = { idle: .35, draw: 1.05, inspect: 3.4, slash: .48, stab: .85 };
      const sequence: [ButterflyAction, number][] = [['draw', 0], ['idle', 0], ['inspect', 0], ['idle', 0], ['draw', 1], ['idle', 0], ['slash', 0], ['idle', 0], ['stab', 0]];
      let frame = 0;
      for (const [action, variant] of sequence) {
        const count = Math.ceil(durations[action] * 30);
        for (let i = 0; i < count; i++) {
          await sampleButterflyFrame(page, action, i / count, variant);
          const image = await page.evaluate(() => (document.getElementById('gameCanvas') as HTMLCanvasElement).toDataURL('image/png').split(',')[1]);
          await writeFile(testInfo.outputPath(`motion-${String(frame++).padStart(4, '0')}.png`), Buffer.from(image, 'base64'));
        }
      }
    }
    expect(errors).toEqual([]);
  } finally { await closeButterflyFixture(page); }
});

for (const [width, height] of [[320, 568], [568, 320], [390, 844], [768, 1024]]) test.describe(`butterfly framing ${width}x${height}`, () => {
  test.use({ viewport: { width, height }, deviceScaleFactor: 1 });
  test('idle blade and tang-supported inspection stay framed across narrow views', async ({ page }, testInfo) => {
    const { errors } = await openButterflyFixture(page, width, height);
    try {
      for (const [action, t, variant] of [['idle', 0, 0], ['inspect', .15, 0], ['inspect', .26, 0], ['inspect', .5, 0], ['inspect', .5, 1], ['inspect', .65, 2]] as [ButterflyAction, number, number][]) {
        const s = await sampleButterflyFrame(page, action, t, variant);
        expect(s.tipScreen[0]).toBeGreaterThanOrEqual(0); expect(s.tipScreen[0]).toBeLessThanOrEqual(width);
        expect(s.tipScreen[1]).toBeGreaterThanOrEqual(0); expect(s.tipScreen[1]).toBeLessThanOrEqual(height);
        expect(s.tipScreen[2]).toBeGreaterThan(-1); expect(s.tipScreen[2]).toBeLessThan(1);
        // The tucked idle latch/handle tail may leave the lower frame, as in
        // first-person ready poses; every actual cutting-blade vertex must fit.
        // Released/held inspection needs the complete knife on portrait, and
        // the sustained V hold needs every rigid part on both orientations.
        const wholeKnife = action === 'inspect' && (width < height || t >= .44 && t <= .77);
        const bounds = wholeKnife ? s.knifeBounds : s.bladeBounds;
        expect(bounds.vertices).toBeGreaterThan(100);
        expect(bounds.minX).toBeGreaterThanOrEqual(0); expect(bounds.maxX).toBeLessThanOrEqual(width);
        expect(bounds.minY).toBeGreaterThanOrEqual(0); expect(bounds.maxY).toBeLessThanOrEqual(height);
        expect(s.fov).toBe(62);
        await page.screenshot({ path: testInfo.outputPath(`${action}-${variant}-${Math.round(t * 100)}.png`) });
      }
      expect(errors).toEqual([]);
    } finally { await closeButterflyFixture(page); }
  });
});
