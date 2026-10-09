import { expect, type Page } from '@playwright/test';
import { gameAssetUrl, gameModuleUrl } from '../../../tests/support/releases';
import type { AimPaint, AimViewport } from './aiming.fixture';

export type MinimalHudScenario = 'quiet' | 'busy' | 'high-ammo' | 'death' | 'scope';
export interface MinimalHudSnapshot {
  evidence: 'controlled-hud-state-real-snow-native-canvas';
  scenario: MinimalHudScenario;
  clock: number;
  map: string;
  worldLoaded: boolean;
  renderFrame: number;
  alive: boolean;
  scope: boolean;
  location: string;
  scopeLabel: string;
  zh: boolean;
  paint: AimPaint[];
  targets: { id: string; x: number; y: number; w: number; h: number }[];
  viewport: AimViewport;
  backing: { width: number; height: number };
}

/**
 * Isolated game-owned render fixture, not a combat/buy/pointer-lock smoke.
 * Imports the actual CS release and renders its real Snow map. Only the HUD
 * scenarios, actor placement and time are controlled. Native canvas methods
 * still paint; observations wrap this one instance, with no production hooks.
 */
export async function openMinimalHudFixture(page: Page, viewport: AimViewport, touch: boolean) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.route('**/__cs_minimal_hud_fixture__', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><style>html,body{margin:0;overflow:hidden;background:#0c141c}#gameApp{position:relative;width:100vw;height:100vh}#gameCanvas{position:absolute;display:block;touch-action:none}</style></head><body><main id="gameApp"><canvas id="gameCanvas" tabindex="0"></canvas></main></body></html>',
  }));
  await page.goto('/__cs_minimal_hud_fixture__');
  await page.evaluate(async ({ entry, assetBase, viewport, touch }) => {
    const { CsGame } = await import(/* @vite-ignore */ entry);
    const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    // No trusted pointer-lock gesture is claimed by this controlled render host.
    canvas.requestPointerLock = () => undefined as any;
    localStorage.removeItem('cs.controls.v1');
    let zh = false;
    const game = new CsGame({
      canvas, logicalWidth: viewport.width, logicalHeight: viewport.height,
      isDarkTheme: () => true, isZhLang: () => zh, isPixelMode: () => false,
      getRecord: () => null, reportScore: () => {}, requestShellRender: () => {},
      assetUrl: (path: string) => new URL(path, new URL(assetBase, location.href)).href,
    });
    const e = game.engine, hud = game.hudView;
    game.setViewport(viewport); game.setPresentationPaused(true); game.prepare();
    (window as any).__CS_MINIMAL_HUD_FIXTURE__ = {
      ready: () => e.ready && !e.bootLoading,
      bootError: () => e.bootError,
      install() {
        e.selectedMode = 'tdm'; e.startMatch(); e.phase = 'active'; e.clock = 10;
        if (e.selectedMap !== 'fy_snow' || !e.world?.spawns?.ct?.length) throw new Error('Expected real loaded Snow map');
        for (const [index, bot] of e.bots.entries()) {
          bot.alive = true; bot.pos.set(1000 + index * 4, 0, 1000); bot.mesh.visible = false;
        }
        const player = e.player;
        player.pos.copy(e.world.spawns.ct[0].pos);
        player.yaw = e.world.spawns.ct[0].yaw ?? 0; player.pitch = 0;
        player.moveVel.set(0, 0, 0); player.moveSpeed = 0; player.grounded = true;
        e.touchMode = touch;
        const ctx = canvas.getContext('2d')!;
        let recording = false, scenario: MinimalHudScenario = 'quiet';
        let paint: AimPaint[] = [], targets: MinimalHudSnapshot['targets'] = [];
        let segments: AimPaint['segments'] = [], arcs: AimPaint['arcs'] = [], cursor: [number, number] | null = null;
        const point = (x: number, y: number): [number, number] => {
          const m = ctx.getTransform();
          return [(m.a * x + m.c * y + m.e) / viewport.dpr, (m.b * x + m.d * y + m.f) / viewport.dpr];
        };
        const record = (op: AimPaint['op'], extra: Partial<AimPaint> = {}) => {
          if (recording) paint.push({ op, index: paint.length, alpha: ctx.globalAlpha,
            color: String(op === 'stroke' ? ctx.strokeStyle : ctx.fillStyle),
            segments: op === 'stroke' || op === 'fill' ? segments.map(s => ({ from: [...s.from], to: [...s.to] })) : [],
            arcs: op === 'stroke' || op === 'fill' ? arcs.map(a => ({ ...a })) : [], ...extra });
        };
        const wrap = (name: string, before: (...args: any[]) => void) => {
          const original = (ctx as any)[name].bind(ctx);
          (ctx as any)[name] = (...args: any[]) => { before(...args); return original(...args); };
        };
        wrap('beginPath', () => { segments = []; arcs = []; cursor = null; });
        wrap('moveTo', (x, y) => { cursor = point(x, y); });
        wrap('lineTo', (x, y) => { const to = point(x, y); if (cursor) segments.push({ from: cursor, to }); cursor = to; });
        wrap('arc', (x, y, r) => { const p = point(x, y), edge = point(x + r, y); arcs.push({ x: p[0], y: p[1], r: Math.hypot(edge[0] - p[0], edge[1] - p[1]) }); });
        wrap('stroke', () => record('stroke'));
        wrap('fill', (pathOrRule, rule) => {
          const path2d = pathOrRule instanceof Path2D;
          record('fill', { evenodd: (path2d ? rule : pathOrRule) === 'evenodd', path2d, ...(path2d ? { segments: [], arcs: [] } : {}) });
        });
        wrap('fillRect', (x, y, w, h) => {
          const a = point(x, y), b = point(x + w, y + h);
          record('fillRect', { bounds: { x: a[0], y: a[1], w: b[0] - a[0], h: b[1] - a[1] } });
        });
        wrap('fillText', (text, x, y) => {
          const m = ctx.measureText(String(text));
          const a = point(x - m.actualBoundingBoxLeft, y - m.actualBoundingBoxAscent);
          const b = point(x + m.actualBoundingBoxRight, y + m.actualBoundingBoxDescent);
          record('text', { text: String(text), bounds: { x: a[0], y: a[1], w: b[0] - a[0], h: b[1] - a[1] } });
        });
        wrap('drawImage', (source, ...args) => {
          const [x, y, w, h] = args.length >= 4 ? args.slice(-4) : [args[0], args[1], source.naturalWidth ?? source.width, source.naturalHeight ?? source.height];
          const a = point(x, y), b = point(x + w, y + h);
          record('image', { src: source instanceof HTMLImageElement ? source.src : undefined,
            bounds: { x: a[0], y: a[1], w: b[0] - a[0], h: b[1] - a[1] } });
        });
        // Observe drawn target envelopes before draw() removes paused input regions.
        // Never re-enable paused controls or substitute geometry for native paint.
        const drawTouch = hud.drawTouchControls.bind(hud);
        hud.drawTouchControls = (...args: any[]) => {
          drawTouch(...args);
          if (recording) targets = hud.regions.filter((r: any) => r.id?.startsWith('touch-')).map(({ id, x, y, w, h }: any) => ({ id, x, y, w, h }));
        };
        const snapshot = (): MinimalHudSnapshot => {
          paint = []; targets = []; recording = true;
          try { game.renderFrame(); } finally { recording = false; }
          return { evidence: 'controlled-hud-state-real-snow-native-canvas', scenario, clock: e.clock,
            map: e.selectedMap, worldLoaded: !!e.world?.bspNodes?.length, renderFrame: e.renderer.info.render.frame,
            alive: player.alive, scope: e.hud.scope, location: e.hud.location, scopeLabel: e.hud.scopeLabel, zh,
            paint, targets, viewport, backing: { width: canvas.width, height: canvas.height } };
        };
        Object.assign((window as any).__CS_MINIMAL_HUD_FIXTURE__, {
          scenario(next: MinimalHudScenario, chinese = false) {
            scenario = next; zh = chinese; e.clock = 10; e.round++; e.phase = 'active';
            e.mode = 'elimination'; e.scores = { ct: 12, t: 9 }; e.hideCenter();
            e.clearEffects(); e.clearCorpses(); e.hud.killfeed = []; e.selectedPickup = null;
            e.hitOpacity = 0; e.damageOpacity = 0; e.grenadePrime = null;
            player.alive = next !== 'death'; player.health = player.alive ? 100 : 0;
            player.armor = 100; player.money = 16000; player.kills = 65; player.grenades = 2;
            player.reload = 0; player.cooldown = 0; player.spawnShield = 0;
            const weaponId = next === 'scope' ? 'g3sg1' : next === 'high-ammo' ? 'm249' : 'ak47';
            player.inventory.primary = e.inventoryWeapon(weaponId);
            player.inventory.primary.ammo = next === 'high-ammo' ? 100 : 30;
            player.inventory.primary.reserve = next === 'high-ammo' ? 200 : 90;
            player.inventory.bomb = e.inventoryWeapon('c4'); player.slot = 'primary';
            e.setGun(false); e.zoom = next === 'scope' ? 2 : 0; e.syncPlayerView(2, false);
            e.computeHud(); e.updateAlive();
            Object.assign(e.hud, { money: '$16000', timerText: '1:05', notice: null, center: null, pickup: null,
              objective: null, objectiveAction: null, reloadState: '', scoreboardOpen: false, matchEnd: null });
            if (next === 'busy') {
              player.reload = 1; e.hud.reloadState = zh ? '换弹 · 1s' : 'Reload · 1s';
              e.hud.objective = { text: zh ? '防守 A / B' : 'Defend A / B' };
              e.hud.objectiveAction = { text: zh ? '拆除 B' : 'Defusing B', progress01: .6 };
              e.hud.notice = { text: zh ? '队友正在支援' : 'Team support inbound' };
              e.hud.pickup = { name: 'M4A1', verb: 'Swap' };
              e.hud.killfeed = [{ aName: 'ALPHA', aTeam: 'ct', aMe: false, bName: 'BRAVO', bTeam: 't', weaponId: 'ak47', weaponIconId: 'ak47', weapon: 'AK-47', head: false, time: e.clock }];
            }
            if (next === 'death') {
              // Deliberately stale input verifies the renderer, not death mechanics.
              player.reload = 2; e.hud.reloadState = zh ? '换弹 · 2s' : 'Reload · 2s';
              e.hud.center = { kicker: 'RESPAWNING', title: zh ? '复活 2s' : 'Respawn 2s', detail: 'Team DM' };
            }
            return snapshot();
          },
          snapshot,
          advance(seconds: number) {
            if (!Number.isFinite(seconds) || seconds < 0 || seconds > 10) throw new Error('Invalid controlled clock advance');
            e.clock += seconds;
            return snapshot();
          },
          scopeOff() { e.zoom = 0; e.hud.scope = false; return snapshot(); },
          destroy: () => game.destroy(),
        });
        game.start();
      },
    };
  }, { entry: gameModuleUrl('cs'), assetBase: gameAssetUrl('cs', ''), viewport, touch });
  await expect.poll(() => page.evaluate(() => {
    const fixture = (window as any).__CS_MINIMAL_HUD_FIXTURE__;
    if (fixture.bootError()) throw new Error(fixture.bootError());
    return fixture.ready();
  }), { timeout: 60_000 }).toBe(true);
  await page.evaluate(() => (window as any).__CS_MINIMAL_HUD_FIXTURE__.install());
  return { errors };
}
export const setMinimalHudScenario = (page: Page, scenario: MinimalHudScenario, zh = false): Promise<MinimalHudSnapshot> =>
  page.evaluate(({ scenario, zh }) => (window as any).__CS_MINIMAL_HUD_FIXTURE__.scenario(scenario, zh), { scenario, zh });
export const readMinimalHud = (page: Page): Promise<MinimalHudSnapshot> =>
  page.evaluate(() => (window as any).__CS_MINIMAL_HUD_FIXTURE__.snapshot());
export const advanceMinimalHud = (page: Page, seconds: number): Promise<MinimalHudSnapshot> =>
  page.evaluate(seconds => (window as any).__CS_MINIMAL_HUD_FIXTURE__.advance(seconds), seconds);
export const closeMinimalHudFixture = (page: Page): Promise<void> =>
  page.evaluate(() => (window as any).__CS_MINIMAL_HUD_FIXTURE__?.destroy?.());
