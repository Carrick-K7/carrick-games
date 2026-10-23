import { expect, type Page } from '@playwright/test';
import { gameAssetUrl, gameModuleUrl } from '../../../tests/support/releases';

/** Seed before construction, without erasing other saved controls or reseeding on reload. */
export async function seedButterflyPreference(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('cg-lang', 'en');
    if (localStorage.getItem('cs.controls.v1') === null) {
      localStorage.setItem('cs.controls.v1', JSON.stringify({ knifeModel: 'butterfly', startingPistol: 'default', sensitivity: .91 }));
    }
  });
}

/** Isolated driver of the actual immutable release; no imported source engine or runtime hook. */
export async function openButterflyPreferenceFixture(page: Page, map: string) {
  await seedButterflyPreference(page);
  await page.route('**/__cs_butterfly_preference__', route => route.fulfill({ contentType: 'text/html', body:
    '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><style>html,body{margin:0;overflow:hidden;background:#192127}canvas{display:block}</style></head><body><main id="gameApp"><canvas id="gameCanvas"></canvas></main></body></html>' }));
  await page.goto('/__cs_butterfly_preference__');
  await page.evaluate(async ({ entry, base }) => {
    const { CsGame } = await import(/* @vite-ignore */ entry);
    const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    // The fixture has no trusted capture gesture. Input commands still use the real engine.
    canvas.requestPointerLock = () => undefined as any;
    const game = new CsGame({ canvas, logicalWidth: 960, logicalHeight: 540,
      isDarkTheme: () => true, isZhLang: () => false, isPixelMode: () => false,
      getRecord: () => null, reportScore: () => {}, requestShellRender: () => {},
      assetUrl: (path: string) => new URL(path, new URL(base, location.href)).href });
    const e = game.engine, ctx = canvas.getContext('2d')!;
    // Fast simulation must not enqueue sixty seconds of sounds on AudioContext's
    // wall clock. Disable playback only; AI, physics, actors, weapons and rendering stay real.
    e.audio.enabled = false;
    game.setViewport({ width: 960, height: 540, dpr: 1, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } });
    // No RAF loop: prepare initializes the real map/assets; step owns simulation and paint cadence.
    game.prepare();
    let ticks = 0, startClock = 0, playerShots = 0, botShots = 0, switches = 0, renders = 0;
    const visited = new Set<string>(), moved = new Set<number>(), continuity: any[] = [];
    let origins: any[] = [], lastShots: number[] = [];
    const finite = () => {
      let valid = e.all.every((a: any) => a.pos.toArray().every(Number.isFinite));
      e.gun?.traverse((node: any) => { valid &&= node.matrixWorld.elements.every(Number.isFinite); });
      return valid;
    };
    const snapshot = () => ({ map: e.selectedMap, mode: e.mode, phase: e.phase, clock: e.clock,
      elapsed: e.clock - startClock, ticks, playerShots, botShots, switches, renders,
      renderFrame: e.renderer.info.render.frame, actors: e.all.length,
      skinnedBots: e.bots.filter((b: any) => !!b.mesh?.userData.skinned).length,
      moved: moved.size, visited: [...visited], finite: finite(), continuity,
      preference: e.controlSettings.knifeModel, sensitivity: e.controlSettings.sensitivity,
      weapon: e.weaponOf(e.player).id, rig: e.gun.userData.rig.id,
      isolated: e.gun.userData.rig.id === 'knife' || !e.gun.userData.rig.butterflyPresentation,
      persisted: JSON.parse(localStorage.getItem('cs.controls.v1')!).knifeModel });
    const switchTo = (slot: string) => {
      const before = e.player.slot; e.switchWeapon(slot);
      if (before !== e.player.slot) switches++;
    };
    const shoot = () => {
      const w = e.weaponOf(e.player), ammo = w.ammo;
      e.fire();
      if (w.id !== 'knife' && w.ammo < ammo) playerShots++;
    };
    (window as any).__CS_BUTTERFLY_PREFERENCE__ = {
      ready: () => e.ready && !e.bootLoading, error: () => e.bootError,
      async start(map: string) {
        if (e.controlSettings.knifeModel !== 'butterfly') throw new Error('Saved preference was not loaded before construction');
        if (map !== e.selectedMap && !await e.loadMap(map)) throw new Error(`Map failed: ${map}`);
        await e.world.materialPalette.load();
        e.selectMode('tdm'); e.setKillLimit(100); e.startMatch();
        e.phase = 'active'; e.hideCenter(); // Only skip the initial four-second freeze.
        // Dust TDM normally equips a rifle. Use the ordinary switch path to the saved-preference pistol.
        switchTo('pistol');
        startClock = e.clock; origins = e.bots.map((b: any) => b.pos.clone());
        lastShots = e.bots.map((b: any) => b.lastShot);
        game.draw(ctx); renders++;
        return snapshot();
      },
      step() {
        // Two simulation seconds per call, one fresh frame per batch. Every tick
        // still executes the real updatePlayer/syncPlayerView and all nine AIs.
        for (let i = 0; i < 60; i++, ticks++) {
          const cycle = ticks % 360;
          if (cycle === 60) switchTo('knife');
          if (cycle === 100) e.inspectWeapon();
          if (cycle === 114 && e.player.alive && e.weaponOf(e.player).id === 'knife'
              && e.player.inspectAt >= startClock && e.clock - e.player.inspectAt < 1) {
            const r = e.gun.userData.rig;
            const before = JSON.parse(JSON.stringify(r.butterflyPresentation?.displayed ?? null));
            const inspectedAt = e.player.inspectAt;
            e.fire(); e.syncPlayerView(0, false);
            const after = r.butterflyPresentation?.displayed;
            if (e.player.inspectAt === -99 && before && after) {
              const keys = ['offset', 'rotation', 'knifeGrip'];
              const delta = Math.max(...keys.flatMap(key => before[key].map((v: number, n: number) => Math.abs(v - after[key][n]))),
                ...['knifeSpin', 'butterflyBlade', 'butterflyHandle'].map(key => Math.abs(before[key] - after[key])));
              continuity.push({ clock: e.clock, inspectedAt, phase: r.butterflyPresentation.phase.kind, delta });
            }
          }
          if (cycle === 132 || cycle === 300 || cycle === 0) switchTo('pistol');
          if (cycle === 180) switchTo('primary');
          if (cycle === 240) switchTo('grenade');
          if (ticks % 15 === 0 && !['knife', 'he', 'c4'].includes(e.weaponOf(e.player).id)) shoot();
          e.update(1 / 30);
          visited.add(e.gun.userData.rig.id);
          for (let n = 0; n < e.bots.length; n++) {
            const b = e.bots[n];
            if (b.pos.distanceTo(origins[n]) > .5) moved.add(n);
            if (b.lastShot > lastShots[n]) botShots++;
            lastShots[n] = b.lastShot;
          }
          if (e.phase === 'match-end') throw new Error('Match ended before the 60-second regression completed');
          const r = e.gun.userData.rig;
          if (r.id !== 'knife' && r.butterflyPresentation) throw new Error(`Butterfly presentation leaked onto ${r.id}`);
        }
        game.draw(ctx); renders++;
        return snapshot();
      },
      destroy: () => game.destroy(),
    };
  }, { entry: gameModuleUrl('cs'), base: gameAssetUrl('cs', '') });
  await expect.poll(() => page.evaluate(() => {
    const f = (window as any).__CS_BUTTERFLY_PREFERENCE__;
    if (f.error()) throw new Error(f.error());
    return f.ready();
  }), { timeout: 60_000 }).toBe(true);
  return page.evaluate(map => (window as any).__CS_BUTTERFLY_PREFERENCE__.start(map), map);
}
