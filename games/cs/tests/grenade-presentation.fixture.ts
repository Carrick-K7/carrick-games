import { expect, type Page } from '@playwright/test';
import { gameAssetUrl, gameModuleUrl } from '../../../tests/support/releases';

export async function openGrenadePresentation(page: Page, width = 1280, height = 720) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/__cs_grenade_presentation__', route => route.fulfill({ contentType: 'text/html', body:
    '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><style>html,body{margin:0;overflow:hidden;background:#192127}canvas{display:block;touch-action:none}</style></head><body><main id="gameApp"><canvas id="gameCanvas"></canvas></main></body></html>' }));
  await page.goto('/__cs_grenade_presentation__');
  await page.evaluate(async ({ entry, assetBase, width, height }) => {
    const { CsGame } = await import(/* @vite-ignore */ entry);
    const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    localStorage.removeItem('cs.controls.v1');
    const game = new CsGame({ canvas, logicalWidth: width, logicalHeight: height,
      isDarkTheme: () => true, isZhLang: () => false, isPixelMode: () => false,
      getRecord: () => null, reportScore: () => {}, requestShellRender: () => {},
      assetUrl: (path: string) => new URL(path, new URL(assetBase, location.href)).href });
    const e = game.engine;
    game.setViewport({ width, height, dpr: 1, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } });
    game.setPresentationPaused(true); game.prepare();
    const paint = () => {
      e.syncPlayerView(0, false); e.computeHud(); game.draw(canvas.getContext('2d')!);
      const r = e.gun.userData.rig;
      const point = (node: any) => node.getWorldPosition(e.player.pos.clone().set(0, 0, 0)).toArray();
      // Project real fixed HE mesh vertices, not just a finite transform matrix.
      const heHorizontal = { min: Infinity, max: -Infinity };
      if (r.id === 'he') r.fixed.traverse((node: any) => {
        const positions = node.geometry?.attributes.position;
        if (!positions) return;
        const v = e.player.pos.clone();
        for (let i = 0; i < positions.count; i++) {
          v.fromBufferAttribute(positions, i).applyMatrix4(node.matrixWorld).project(e.gunCamera);
          heHorizontal.min = Math.min(heHorizontal.min, v.x);
          heHorizontal.max = Math.max(heHorizontal.max, v.x);
        }
      });
      return { evidence: 'real-release-grenade-presentation', frame: e.renderer.info.render.frame, heHorizontal,
        clock: e.clock, id: r.id, fixedVisible: r.fixed.visible, pinVisible: r.pin?.visible,
        right: point(r.right?.hand ?? r.knifeRight.group), left: point(r.left?.hand ?? r.knifeLeft.hand),
        wristBend: r.right?.wristBend ?? r.knifeWristBend,
        finite: e.gun.matrixWorld.elements.every(Number.isFinite), grenades: e.grenades.length, count: e.player.grenades };
    };
    const equip = (id = 'he') => {
      e.phase = 'active'; e.settingsOpen = e.buyOpen = e.mapOpen = false; e.radioMenu = null; e.grenadePrime = null;
      e.clock = 20; e.zoom = e.recoil = e.kickPitch = e.kickYaw = e.viewBob = 0;
      const p = e.player; p.grenades = 2; p.lastSlot = 'pistol';
      p.slot = id === 'he' ? 'grenade' : id === 'knife' ? 'knife' : id === 'c4' ? 'bomb' : ['usp', 'deagle', 'glock'].includes(id) ? 'pistol' : 'primary';
      p.inventory[p.slot] = e.inventoryWeapon(id);
      e.setGun(false); p.deployAt = p.inspectAt = -99; p.cooldown = p.reload = 0;
      p.moveSpeed = 0; p.moveVel.set(0, 0, 0); p.yaw = p.pitch = 0;
      e.keys.clear(); e.fireHeld = e.shotPressed = false; e.hideCenter(); e.hud.notice = null; e.selectedPickup = null;
      return paint();
    };
    (window as any).__CS_GRENADE_PRESENTATION__ = {
      ready: () => e.ready && !e.bootLoading, error: () => e.bootError,
      install() { e.selectedMode = 'tdm'; e.startMatch(); for (const bot of e.bots) bot.mesh.visible = false; return equip(); },
      equip, paint,
      pose(stage: string, t: number, strength = 1) {
        equip();
        if (stage !== 'idle') {
          e.grenadePrime = { buttons: stage === 'pin' ? 1 : 0, strength, startAt: 20, readyAt: 20.5,
            released: stage === 'throw', throwAt: 20.5, cue: true };
          e.clock = stage === 'throw' ? 20.5 + t * .56 : 20 + t * .5;
        }
        return paint();
      },
      begin(button: number) { equip(); e.primeGrenade(button); return paint(); },
      release(button: number) { e.releaseGrenade(button); return paint(); },
      advance(seconds: number) { e.clock += seconds; e.updateGrenadePrime(); return paint(); },
      destroy: () => game.destroy(),
    };
  }, { entry: gameModuleUrl('cs'), assetBase: gameAssetUrl('cs', ''), width, height });
  await expect.poll(() => page.evaluate(() => {
    const f = (window as any).__CS_GRENADE_PRESENTATION__; if (f.error()) throw new Error(f.error()); return f.ready();
  }), { timeout: 60_000 }).toBe(true);
  await page.evaluate(() => (window as any).__CS_GRENADE_PRESENTATION__.install());
  return { errors };
}
export const grenadePose = (page: Page, stage: string, t: number, strength = 1): Promise<any> =>
  page.evaluate(({ stage, t, strength }) => (window as any).__CS_GRENADE_PRESENTATION__.pose(stage, t, strength), { stage, t, strength });
export const closeGrenadePresentation = (page: Page) => page.evaluate(() => (window as any).__CS_GRENADE_PRESENTATION__?.destroy());
