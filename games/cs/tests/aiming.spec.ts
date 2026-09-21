import { expect, test } from '@playwright/test';
import {
  closeAimingFixture, fireAimingShot, openAimingFixture, readAimingSnapshot, resizeAimingFixture,
  type AimPaint, type AimShot, type AimSnapshot, type AimViewport,
} from './aiming.fixture';

const shapes = [
  { name: 'desktop', width: 1280, height: 720, touch: false, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } },
  { name: 'small-phone', width: 320, height: 568, touch: true, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } },
  { name: 'notched-phone', width: 390, height: 844, touch: true, safeArea: { top: 47, right: 0, bottom: 34, left: 0 } },
  { name: 'short-landscape', width: 568, height: 320, touch: true, safeArea: { top: 0, right: 8, bottom: 21, left: 44 } },
];
const shots: (AimShot & { name: string })[] = [
  { name: 'hip-body-full', zoom: 0, hit: 'body', kill: false, feedback: 'full' },
  { name: 'scope1-body-full', zoom: 1, hit: 'body', kill: false, feedback: 'full' },
  { name: 'scope1-head-visual', zoom: 1, hit: 'head', kill: false, feedback: 'visual' },
  { name: 'scope2-head-kill-full', zoom: 2, hit: 'head', kill: true, feedback: 'full' },
  { name: 'scope2-body-off', zoom: 2, hit: 'body', kill: false, feedback: 'off' },
  // Last shot remains visible during the live-instance resize check.
  { name: 'scope2-body-kill-visual', zoom: 2, hit: 'body', kill: true, feedback: 'visual' },
];

function markerSegments(s: AimSnapshot) {
  const x = s.width / 2, y = s.height / 2;
  return s.paint.filter(p => p.op === 'stroke' && p.alpha > 0).flatMap(p => p.segments).filter(line => {
    const dx = Math.abs(line.to[0] - line.from[0]), dy = Math.abs(line.to[1] - line.from[1]);
    return dx > .5 && Math.abs(dx - dy) < .001
      && [line.from, line.to].every(([px, py]) => Math.abs(px - x) <= 24 && Math.abs(py - y) <= 24);
  });
}
function overlaps(a: NonNullable<AimPaint['bounds']>, b: NonNullable<AimPaint['bounds']>, gap = 0) {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x
    && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
}
function assertMarkerAndRay(s: AimSnapshot, visible: boolean) {
  expect(s.fixture).toBe('real-snow-raycast-frozen-actors');
  expect(s.ammoSpent).toBe(1);
  expect(s.damage).toBeGreaterThan(0); // A recorded ray alone is not proof of an unblocked hit.
  expect(s.ray?.target).toBe(true);
  expect(s.ray?.distance).toBeGreaterThan(1);
  expect(s.ray!.x).toBeCloseTo(s.width / 2, 5);
  expect(s.ray!.y).toBeCloseTo(s.height / 2, 5);
  expect(s.camera.aspect).toBeCloseTo(s.width / s.height, 8);
  expect(s.camera.gunAspect).toBeCloseTo(s.camera.aspect, 8);
  expect(s.backing).toEqual({ width: s.width * s.dpr, height: s.height * s.dpr });
  const marker = markerSegments(s);
  if (!visible) {
    expect(s.opacity).toBe(0);
    expect(marker).toEqual([]);
    expect(s.paint.filter(p => p.op === 'text' && /^(HEADSHOT(?: KILL)?|KILL)$/.test(p.text ?? ''))).toEqual([]);
    return;
  }
  expect(s.opacity).toBe(1);
  // Outline/foreground may paint the same vector twice. Geometry is four arms,
  // regardless of batching, stroke colour, line thickness or font metrics.
  const unique = [...new Map(marker.map(line => [JSON.stringify(line), line])).values()];
  expect(unique).toHaveLength(4);
  const points = unique.flatMap(line => [line.from, line.to]);
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(s.ray!.x, 5);
  expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(s.ray!.y, 5);
  for (const [x, y] of points) {
    expect(points.some(([xx, yy]) => Math.abs(xx - (s.width - x)) < .001
      && Math.abs(yy - (s.height - y)) < .001)).toBe(true);
  }
  // Text remains valid for confirmations/pips, never for the central marker.
  expect(s.paint.filter(p => p.op === 'text' && p.text === '×' && p.bounds
    && Math.abs(p.bounds.x + p.bounds.w / 2 - s.width / 2) < 24
    && Math.abs(p.bounds.y + p.bounds.h / 2 - s.height / 2) < 50)).toEqual([]);
}
function assertScopeAndCaptions(s: AimSnapshot) {
  const scopeMasks = s.paint.filter(p => p.op === 'fill' && p.evenodd
    && p.arcs.some(a => Math.abs(a.x - s.width / 2) < .001 && Math.abs(a.y - s.height / 2) < .001));
  if (s.scope) {
    expect(scopeMasks).toHaveLength(1);
    const mask = scopeMasks[0];
    const crosslines = s.paint.find(p => p.op === 'stroke' && p.segments.length === 2
      && p.segments.every(line => Math.hypot(line.to[0] - line.from[0], line.to[1] - line.from[1]) > 50)
      && p.segments.every(line => Math.abs((line.from[0] + line.to[0]) / 2 - s.width / 2) < .001
        && Math.abs((line.from[1] + line.to[1]) / 2 - s.height / 2) < .001));
    expect(crosslines).toBeDefined();
    expect(crosslines!.index).toBeGreaterThan(mask.index);
    // Scope mask AND crosslines must be behind every HUD caption and panel,
    // not drawn after the score/radar/feedback and painting over those surfaces.
    for (const text of s.paint.filter(p => p.op === 'text')) expect(text.index).toBeGreaterThan(crosslines!.index);
    for (const fill of s.paint.filter(p => (p.op === 'fill' || p.op === 'fillRect') && !p.evenodd)) {
      expect(fill.index).toBeGreaterThan(crosslines!.index);
    }
  } else expect(scopeMasks).toHaveLength(0);

  const captions = s.paint.filter(p => p.op === 'text' && /^(?:[12]× zoom|HEADSHOT(?: KILL)?|KILL)$/.test(p.text ?? ''));
  expect(captions.filter(p => /zoom$/.test(p.text!))).toHaveLength(s.scope ? 1 : 0);
  expect(captions.filter(p => !/zoom$/.test(p.text!))).toHaveLength(s.opacity > 0 && s.confirmation ? 1 : 0);
  const marker = markerSegments(s).flatMap(line => [line.from, line.to]);
  const radius = marker.length ? Math.max(...marker.map(([x, y]) => Math.max(Math.abs(x - s.width / 2), Math.abs(y - s.height / 2)))) + 3 : 4;
  const aimBounds = { x: s.width / 2 - radius, y: s.height / 2 - radius, w: radius * 2, h: radius * 2 };
  for (const caption of captions) {
    expect(caption.bounds).toBeDefined();
    const box = caption.bounds!;
    expect(box.x).toBeGreaterThanOrEqual(s.safeArea.left);
    expect(box.y).toBeGreaterThanOrEqual(s.safeArea.top);
    expect(box.x + box.w).toBeLessThanOrEqual(s.width - s.safeArea.right);
    expect(box.y + box.h).toBeLessThanOrEqual(s.height - s.safeArea.bottom);
    expect(overlaps(box, aimBounds)).toBe(false);
    const collisions = s.paint.filter(p => p !== caption && p.op === 'text' && p.text?.trim() && p.bounds
      && overlaps(box, p.bounds, 1));
    expect(collisions.map(p => p.text), `Caption ${caption.text} must not overlap other HUD text`).toEqual([]);
  }
}

for (const shape of shapes) for (const dpr of [1, 2]) {
  test.describe(`CS aiming isolated real-Snow fixture · ${shape.name} · DPR ${dpr}`, () => {
    test.use({ viewport: { width: shape.width, height: shape.height }, deviceScaleFactor: dpr,
      hasTouch: shape.touch, isMobile: shape.touch });
    test('real fire, scope layers and paused feedback stay aligned with camera projection', async ({ page }, testInfo) => {
      test.setTimeout(150_000);
      const viewport: AimViewport = { width: shape.width, height: shape.height, safeArea: shape.safeArea, dpr };
      const { errors } = await openAimingFixture(page, viewport);
      try {
        let previous: AimSnapshot | null = null;
        for (const shot of shots) await test.step(shot.name, async () => {
          const s = await fireAimingShot(page, shot);
          await page.screenshot({ path: testInfo.outputPath(`cs-aim-${shape.name}-dpr${dpr}-${shot.name}.png`) });
          assertMarkerAndRay(s, shot.feedback !== 'off');
          expect(s.ray!.head).toBe(shot.hit === 'head');
          expect(s.alive).toBe(!shot.kill);
          expect(s.scope).toBe(shot.zoom > 0);
          expect(s.camera.fov).toBeCloseTo(shot.zoom === 2 ? 10 : shot.zoom === 1 ? 40 : 76, 6);
          if (shot.feedback !== 'off') {
            expect(s.hitKind).toBe(shot.kill ? 'kill' : shot.hit);
            expect(s.confirmation).toBe(shot.kill ? (shot.hit === 'head' ? 'HEADSHOT KILL' : 'KILL') : shot.hit === 'head' ? 'HEADSHOT' : '');
          }
          expect(s.audioHits).toEqual(shot.feedback === 'full' ? [{ head: shot.hit === 'head', killed: shot.kill }] : []);
          assertScopeAndCaptions(s);
          await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-presentation', 'paused');
          // Capture/redraw cannot age out the hit, including slow software GL.
          const frozen = await readAimingSnapshot(page);
          expect({ clock: frozen.clock, opacity: frozen.opacity, damage: frozen.damage, alive: frozen.alive })
            .toEqual({ clock: s.clock, opacity: s.opacity, damage: s.damage, alive: s.alive });
          assertMarkerAndRay(frozen, shot.feedback !== 'off');
          previous = frozen;
        });
        const initial = previous! as AimSnapshot;
        // Same instance: rotate/change height and asymmetric safe insets without
        // a fresh shot, a reset match, or an independently constructed camera.
        const resized = { width: shape.touch ? 568 : 1100, height: shape.touch ? 320 : 640, dpr,
          safeArea: { top: 9, right: 6, bottom: 21, left: 38 } };
        await page.setViewportSize({ width: resized.width, height: resized.height });
        const after = await resizeAimingFixture(page, resized);
        await page.screenshot({ path: testInfo.outputPath(`cs-aim-${shape.name}-dpr${dpr}-paused-resize.png`) });
        expect({ clock: after.clock, opacity: after.opacity, damage: after.damage, alive: after.alive, lane: after.lane })
          .toEqual({ clock: initial.clock, opacity: initial.opacity, damage: initial.damage, alive: initial.alive, lane: initial.lane });
        assertMarkerAndRay(after, true);
        assertScopeAndCaptions(after);
        expect(errors).toEqual([]);
      } finally { await closeAimingFixture(page); }
    });
  });
}
