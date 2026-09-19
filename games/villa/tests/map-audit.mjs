/** Game-owned manual visual audit. Run after build:game -- villa.
 * Outputs stay OUTSIDE the repository by default. No shell screenshot fixtures
 * or user work are modified. The captured camera/frame is verified, never a
 * cached software-GL frame wearing a new HUD label.
 * VILLA_AUDIT_BASE=http://127.0.0.1:8091 node games/villa/tests/map-audit.mjs [name ...]
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const base = process.env.VILLA_AUDIT_BASE ?? 'http://127.0.0.1:8091';
const out = process.env.VILLA_AUDIT_OUT ?? '/tmp/carrick-villa-audit';
export const views = [
  ['entrance', 0, 0, 21, 0, 0, .1],
  ['pool', -26, 0, 11, -32, 0, -.08],
  ['orchard', -19.5, 0, 23, -14, 13, -.05],
  ['vegetables', -1, 0, 24, -8, 18, -.18],
  ['garage-apron', 48, 0, 12, 41, -1, -.02],
  ['garage', 49.7, 0, .6, 39, -5, -.05],
  ['suv', 50, 0, -1.1, 47, -3, -.08],
  ['living', -14, 0, 8, -7, 1, -.08],
  ['kitchen', -17, 0, -1.3, -7, -7, -.08],
  ['tea-room', -16, 0, -10.8, -19, -15.8, -.16],
  ['laundry', -4, 0, -11, -9, -16.8, -.1],
  ['gym', 7, 0, -10.5, 11.6, -16, -.08],
  ['snooker', 21, 0, 0, 11, -4, -.15],
  ['cinema', 24, 0, -10, 22.6, -17, -.03],
  ['gaming', 15.6, 0, 7.8, 7, 5, -.03],
  ['empty-lounge', 24, 0, 6.5, 20, -6, -.05],
  ['robot', 3.2, 0, -9, 4.45, -7.7, -.68],
  ['upstairs-hall', 6.9, 3.6, -9, 0, -12, -.08],
  ['master', -13, 3.6, 2.8, -6, 6, -.12],
  ['master-vanity', -5.5, 3.6, 3.4, -5.05, .6, -.18],
  ['guest', -14, 3.6, -10.5, -8, -14, -.06],
  ['dressing', -14, 3.6, -1.2, -19, -5.5, -.08],
  ['ensuite', -5, 3.6, -3.65, -10, -7, -.08],
  ['study', 15.8, 3.6, -10, 12.5, -16, -.08],
  ['bath', 9.2, 3.6, -.3, 14, -6, -.12],
  ['bath-west', 6.2, 3.6, -4.8, 12, -4.8, -.04],
  ['reading-hall', 26.5, 3.6, 7.5, 20, -4.6, -.03],
  ['massage', 24, 3.6, -10.5, 22.6, -14.5, -.05],
  ['balcony', -6, 3.6, 10.4, -10, 19, -.15],
  ['roof-stairs', .2, 7.2, 3.4, .5, -3, -.3],
  ['roof-west', -2, 7.2, 4, -18, -3, -.1],
  ['roof-east', 6, 7.2, -1, 13, -8, -.06],
  ['roof-flowers', 21, 7.2, 5, 26, -10, -.07],
  ['north-estate', -4, 0, 28, -8, 46, -.02],
  ['south-fields', -17, 0, 49, -10, 60, -.1],
  ['pond', -2, 0, 69, -14, 80, -.08],
  ['scenic-hills', 29, 0, 114, 20, 131, .02],
];
const selected = process.argv.slice(2);
const poses = views.filter(v => !selected.length || selected.includes(v[0]));
if (!poses.length) throw new Error('No matching audit views');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [], errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/__villa-audit', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body style="margin:0"><main id="gameApp"><canvas id="gameCanvas"></canvas></main></body></html>' }));
  await page.goto(`${base}/__villa-audit`);
  const release = await page.evaluate(async () => (await (await fetch('/games/index.json')).json()).games.find(g => g.id === 'villa'));
  await page.evaluate(async release => {
    const { VillaGame } = await import(release.entry);
    const canvas = document.querySelector('canvas');
    const g = new VillaGame({ canvas, logicalWidth: 960, logicalHeight: 600,
      isDarkTheme: () => false, isZhLang: () => true, isPixelMode: () => false,
      getRecord: () => null, reportScore() {}, requestShellRender() {}, assetUrl: p => release.assetBase + p });
    g.prepare(); g.start(); cancelAnimationFrame(g.animationId);
    g.audio?.setEnabled(false); g.keys.clear();
    g.state.home.timeOfDay = 'day'; g.state.home.darkness = 0;
    window.__auditGame = g;
  }, release);
  await page.evaluate(time => {
    const g = window.__auditGame;
    g.state.home.timeOfDay = time; g.state.home.darkness = time === 'night' ? 1 : time === 'evening' ? .43 : 0;
    g.state.evening = g.state.home.darkness > .2;
  }, process.env.VILLA_AUDIT_TIME ?? 'day');
  for (const pose of poses) {
    const record = await page.evaluate(pose => {
      const [name, x, y, z, tx, tz, pitch] = pose, g = window.__auditGame;
      g.state.seated = null; g.state.relaxSeatId = null; g.transition = null;
      g.motion.offset = 0; g.motion.velocity = 0;
      g.position = { x, y, z }; g.eyeY = y;
      g.yaw = Math.atan2(x - tx, z - tz); g.pitch = pitch;
      // Terrain-sampled outdoor positions settle at the actual support height.
      let support = g.supportAt(x, z, y, 1.75);
      if (support === null && y === 0 && z > 35) {
        // Terrain hills are not reachable from an artificial y=0 probe. Find
        // the actual local support, never photograph from under the road.
        for (let h = -2; h < 15 && support === null; h += .2) support = g.supportAt(x, z, h, 1.75);
      }
      if (support !== null && y === 0) g.position.y = g.eyeY = support;
      g.time += 1;
      g.scene.softwareInputFrames = 0; g.scene.lastDrawAt = -Infinity;
      const before = g.scene.renderer.info.render.frame;
      g.renderFrame();
      const after = g.scene.renderer.info.render.frame;
      if (after <= before) throw new Error(`${name}: stale GL frame`);
      const eye = g.view();
      if (Math.abs(g.scene.camera.position.x - eye.x) > .001 || Math.abs(g.scene.camera.position.z - eye.z) > .001) throw new Error(`${name}: wrong camera`);
      return { name, position: { ...g.position }, camera: g.scene.camera.position.toArray(), yaw: g.yaw,
        floorSupport: support, standable: g.canFit(1.75), frame: after,
        drawCalls: g.scene.renderer.info.render.calls, triangles: g.scene.renderer.info.render.triangles,
        png: g.canvas.toDataURL('image/png') };
    }, pose);
    const { png, ...info } = record;
    await writeFile(path.join(out, `${info.name}.png`), Buffer.from(png.split(',')[1], 'base64'));
    results.push(info); console.log(JSON.stringify(info));
  }
  await page.evaluate(() => window.__auditGame.destroy());
  await writeFile(path.join(out, 'audit.json'), JSON.stringify({ release: { version: release.version, revision: release.revision }, results, errors }, null, 2));
  if (errors.length) throw new Error(errors.join('\n'));
} finally { await browser.close(); }
console.log(`Audit images: ${out}`);
