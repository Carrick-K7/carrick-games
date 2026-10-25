import { expect, type Page } from '@playwright/test';
import { gameAssetUrl, gameModuleUrl } from '../../../tests/support/releases';

export type ButterflyAction = 'idle' | 'draw' | 'inspect' | 'slash' | 'stab';
export async function openButterflyFixture(page: Page, width = 1280, height = 720) {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/__cs_butterfly_fixture__', route => route.fulfill({ contentType: 'text/html',
    body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><style>html,body{margin:0;overflow:hidden;background:#192127}canvas{display:block;touch-action:none}</style></head><body><main id="gameApp"><canvas id="gameCanvas"></canvas></main></body></html>' }));
  await page.goto('/__cs_butterfly_fixture__');
  await page.evaluate(async ({ entry, assetBase, width, height }) => {
    const { CsGame } = await import(/* @vite-ignore */ entry);
    const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    canvas.requestPointerLock = () => undefined as any;
    localStorage.removeItem('cs.controls.v1');
    const game = new CsGame({ canvas, logicalWidth: width, logicalHeight: height,
      isDarkTheme: () => true, isZhLang: () => false, isPixelMode: () => false,
      getRecord: () => null, reportScore: () => {}, requestShellRender: () => {},
      assetUrl: (path: string) => new URL(path, new URL(assetBase, location.href)).href });
    const e = game.engine;
    game.setViewport({ width, height, dpr: 1, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } });
    game.setPresentationPaused(true); game.prepare();
    const duration = { idle: 1, draw: 1.05, inspect: 3.4, slash: .48, stab: .85 };
    let frames = 0;
    const pose = (action: ButterflyAction, t: number, variant = 0) => {
      const p = e.player, w = e.weaponOf(p);
      e.phase = 'active'; e.settingsOpen = e.buyOpen = e.mapOpen = false; e.radioMenu = null;
      e.clock = 20 + t * duration[action]; e.zoom = e.recoil = e.kickPitch = e.kickYaw = e.viewBob = 0;
      e.keys.clear(); e.fireHeld = e.shotPressed = false;
      p.reload = 0; p.inspectAt = action === 'inspect' ? 20 : -99;
      p.deployAt = action === 'draw' ? 20 : -99; p.deployWeapon = 'knife'; p.deployFor = 1.05;
      p.butterflyDrawVariant = variant; p.butterflyInspectVariant = variant;
      p.moveSpeed = 0; p.moveVel.set(0, 0, 0);
      w.shotAt = action === 'slash' || action === 'stab' ? 20 : -99; w.knifeHeavy = action === 'stab';
      e.hideCenter(); e.hud.notice = null; e.selectedPickup = null;
      return paint(action, t, variant);
    };
    const paint = (action: string, t: number, variant: number) => {
      const p = e.player, r = e.gun.userData.rig;
      e.syncPlayerView(0, false); e.computeHud();
      const ctx = canvas.getContext('2d')!; game.draw(ctx); frames++;
      const point = (node: any, local = p.pos.clone().set(0, 0, 0)) => node.localToWorld(local).toArray();
      const projected = (node: any, local = p.pos.clone().set(0, 0, 0)) => {
        const v = node.localToWorld(local).project(e.gunCamera); return [(v.x + 1) * width / 2, (1 - v.y) * height / 2, v.z];
      };
      const knifeBounds = {minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity,vertices:0};
      const bladeBounds = {minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity,vertices:0};
      r.knifePivot.traverse((node: any) => {
        const positions = node.geometry?.attributes?.position;
        if (!positions) return;
        for (let i=0;i<positions.count;i++) {
          const v=p.pos.clone().fromBufferAttribute(positions,i).applyMatrix4(node.matrixWorld).project(e.gunCamera);
          const x=(v.x+1)*width/2,y=(1-v.y)*height/2;
          knifeBounds.minX=Math.min(knifeBounds.minX,x); knifeBounds.maxX=Math.max(knifeBounds.maxX,x);
          knifeBounds.minY=Math.min(knifeBounds.minY,y); knifeBounds.maxY=Math.max(knifeBounds.maxY,y);knifeBounds.vertices++;
          if(node.name==='butterfly-ground-blade'){
            bladeBounds.minX=Math.min(bladeBounds.minX,x);bladeBounds.maxX=Math.max(bladeBounds.maxX,x);
            bladeBounds.minY=Math.min(bladeBounds.minY,y);bladeBounds.maxY=Math.max(bladeBounds.maxY,y);bladeBounds.vertices++;
          }
        }
      });
      return { evidence: 'controlled-action-sampling-real-release-renderer', action, t, variant, clock: e.clock, frames, renderFrame: e.renderer.info.render.frame,
        knifeBounds, bladeBounds,
        map: e.selectedMap, knife: r.knifeModel, fov: e.gunCamera.fov,
        bladeAngle: r.butterflyBlade.rotation.x, handleAngle: r.butterflyHandle.rotation.x,
        spin: r.knifePivot.rotation.x, tip: point(r.butterflyBlade, r.knifeTip.clone()),
        hinge: point(r.butterflyHandle), pivot: point(r.knifePivot), wristBend: r.knifeWristBend,
        tipScreen: projected(r.butterflyBlade, r.knifeTip.clone()),
        handleTipScreen: projected(r.butterflyHandle, p.pos.clone().set(0, -.133, 0)),
        wristScreen: projected(r.knifeFrame, r.knifeWrist.clone()),
        referencePose: r.butterflyPresentation?.displayed ?? null,
        finite: e.gun.matrixWorld.elements.every(Number.isFinite) };
    };
    (window as any).__CS_BUTTERFLY_FIXTURE__ = {
      ready: () => e.ready && !e.bootLoading, error: () => e.bootError,
      install() {
        e.selectedMode = 'tdm'; e.startMatch(); e.phase = 'active';
        e.controlSettings.knifeModel = 'butterfly'; e.player.slot = 'knife'; e.setGun(false);
        e.player.yaw = 0; e.player.pitch = 0;
        for (const bot of e.bots) bot.mesh.visible = false;
        return pose('idle', 0);
      },
      pose,
      isolateViewModel() {
        // Reference inspection only: retain every held-knife/hand mesh and the
        // shipped gun lights/projection; remove the unrelated world and HUD.
        for (const child of e.scene.children) if (!child.isLight && !child.isCamera) child.visible = false;
        e.scene.background.setHex(0xaec9dc); e.scene.fog = null;
        // Inspect the shipped meshes at the output's actual pixel resolution,
        // not an upscaled software-budget buffer; this is not an FPS benchmark.
        e.renderer.setPixelRatio(1); e.renderer.setSize(width, height, false);
        game.hudView.draw = () => {};
      },
      interrupt(kind: 'slash' | 'stab' | 'inspect') {
        e.player.cooldown = 0; e.weaponOf(e.player).readyAt = 0;
        if (kind === 'inspect') e.inspectWeapon(); else e.fire(kind === 'stab');
        return { ...paint('interrupt-' + kind, 0, e.player.butterflyInspectVariant),
          cooldown: e.player.cooldown, inspectAt: e.player.inspectAt, shotAt: e.weaponOf(e.player).shotAt };
      },
      advance(seconds: number) { e.clock += seconds; return paint('transition', seconds, e.player.butterflyInspectVariant); },
      destroy: () => game.destroy(),
    };
  }, { entry: gameModuleUrl('cs'), assetBase: gameAssetUrl('cs', ''), width, height });
  await expect.poll(() => page.evaluate(() => {
    const f = (window as any).__CS_BUTTERFLY_FIXTURE__; if (f.error()) throw new Error(f.error()); return f.ready();
  }), { timeout: 60_000 }).toBe(true);
  await page.evaluate(() => (window as any).__CS_BUTTERFLY_FIXTURE__.install());
  return { errors };
}
export const sampleButterflyFrame = (page: Page, action: ButterflyAction, t: number, variant = 0): Promise<any> =>
  page.evaluate(({ action, t, variant }) => (window as any).__CS_BUTTERFLY_FIXTURE__.pose(action, t, variant), { action, t, variant });
export const closeButterflyFixture = (page: Page) => page.evaluate(() => (window as any).__CS_BUTTERFLY_FIXTURE__?.destroy());
