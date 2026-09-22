import { expect, type Page } from '@playwright/test';
import { gameAssetUrl, gameModuleUrl } from '../../../tests/support/releases';

export interface AimViewport {
  width: number;
  height: number;
  dpr: number;
  safeArea: { top: number; right: number; bottom: number; left: number };
}
export interface AimShot {
  zoom: 0 | 1 | 2;
  hit: 'body' | 'head';
  kill: boolean;
  feedback: 'off' | 'visual' | 'full';
  ammo?: number;
  reserve?: number;
}
export interface AimPaint {
  op: 'stroke' | 'fill' | 'fillRect' | 'text' | 'image';
  index: number;
  alpha: number;
  color: string;
  segments: { from: [number, number]; to: [number, number] }[];
  arcs: { x: number; y: number; r: number }[];
  evenodd?: boolean;
  text?: string;
  bounds?: { x: number; y: number; w: number; h: number };
}
export interface AimSnapshot {
  fixture: 'real-snow-raycast-frozen-actors';
  width: number;
  height: number;
  dpr: number;
  backing: { width: number; height: number };
  safeArea: AimViewport['safeArea'];
  camera: { fov: number; aspect: number; gunAspect: number };
  ray: { x: number; y: number; head: boolean; target: boolean; distance: number } | null;
  damage: number;
  ammoSpent: number;
  alive: boolean;
  clock: number;
  opacity: number;
  hitKind: string;
  confirmation: string;
  scope: boolean;
  audioHits: { head: boolean; killed: boolean }[];
  paint: AimPaint[];
  lane: { from: number[]; to: number[] };
}

/**
 * Game-owned isolated host, NOT a shell/private-scene API or a full-map combat
 * smoke. It loads the actual pinned CS ESM release, Snow BSP and skinned actors.
 * Only actor placement/health, aim and shot randomness are deterministic. Snow
 * occlusion, engine.fire/hitActor/damageActor and the entire CsGame draw stay real.
 * TypeScript-private engine/hudView access is confined to this test fixture.
 */
export async function openAimingFixture(page: Page, viewport: AimViewport) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  await page.route('**/__cs_aiming_fixture__', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><style>html,body{margin:0;overflow:hidden;background:#0c141c}#gameApp{position:relative;width:100vw;height:100vh}#gameCanvas{position:absolute;display:block;touch-action:none}</style></head><body><main id="gameApp"><canvas id="gameCanvas" tabindex="0"></canvas></main></body></html>',
  }));
  await page.goto('/__cs_aiming_fixture__');
  await page.evaluate(async ({ entry, assetBase, viewport }) => {
    const { CsGame } = await import(/* @vite-ignore */ entry);
    const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    // No pointer lock is requested by this isolated host; no browser gesture is
    // being simulated and no shell capture behavior is claimed by these tests.
    canvas.requestPointerLock = () => undefined as any;
    localStorage.removeItem('cs.controls.v1');
    const game = new CsGame({
      canvas, logicalWidth: viewport.width, logicalHeight: viewport.height,
      isDarkTheme: () => true, isZhLang: () => false, isPixelMode: () => false,
      getRecord: () => null, reportScore: () => {}, requestShellRender: () => {},
      assetUrl: (path: string) => new URL(path, new URL(assetBase, location.href)).href,
    });
    const e = game.engine;
    let currentViewport = viewport;
    game.setViewport(viewport);
    // Deliberately do not start a free-running simulation. Screenshots and
    // redraws are taken under the actual SDK presentation-pause contract.
    game.setPresentationPaused(true);
    game.prepare();
    (window as any).__CS_AIM_FIXTURE__ = {
      ready: () => e.ready && !e.bootLoading,
      bootError: () => e.bootError,
      install() {
        e.selectedMode = 'tdm';
        e.startMatch();
        e.phase = 'active';
        e.clock = 10;
        e.hideCenter();
        const player = e.player;
        const target = e.bots.find((b: any) => b.team !== player.team);
        if (!target?.mesh?.userData.skinned) throw new Error('Expected real loaded enemy soldier');
        for (const [index, bot] of e.bots.entries()) {
          // Keep enemy teammates alive so a lethal fixture shot cannot end an
          // elimination round/un-scope. Move them outside every weapon range;
          // presentation pause freezes their AI and their meshes stay hidden.
          bot.alive = true;
          bot.pos.set(1000 + index * 4, 0, 1000);
          bot.mesh.visible = false;
        }
        // Find a reproducible unobstructed standing-height lane using the real
        // Snow navigation and BSP, rather than making world.raycast return null.
        // Side-offset checks leave clearance for the off-centre gun muzzle too.
        let lane: { from: any; to: any } | null = null;
        for (const spawn of e.world.spawns.ct) {
          for (const node of e.world.nodes) {
            if (e.world.reachable && !e.world.reachable.has(node.id)) continue;
            const to = player.pos.clone().set(node.x, node.y, node.z);
            const distance = Math.hypot(to.x - spawn.pos.x, to.z - spawn.pos.z);
            if (distance < 5 || distance > 9 || Math.abs(to.y - spawn.pos.y) > .2) continue;
            const eye = spawn.pos.clone(); eye.y += 1.61;
            const clear = [1.0, 1.66].every(height => {
              const aim = to.clone(); aim.y += height;
              return [[0, 0], [.6, 0], [-.6, 0], [0, .6], [0, -.6]].every(([x, z]) => {
                const origin = eye.clone(); origin.x += x; origin.z += z;
                const delta = aim.clone().sub(origin), length = delta.length();
                return !e.world.raycast(origin, delta.normalize(), length);
              });
            });
            if (clear) { lane = { from: spawn.pos.clone(), to }; break; }
          }
          if (lane) break;
        }
        if (!lane) throw new Error('No clear real Snow aiming lane; do not silently disable map occlusion');
        const chosenLane = lane;
        const audioHits: { head: boolean; killed: boolean }[] = [];
        const audioHit = e.audio.hit;
        e.audio.hit = function (head: boolean, killed: boolean) {
          audioHits.push({ head, killed });
          return audioHit.call(this, head, killed);
        };
        const ctx = canvas.getContext('2d')!;
        let recording = false;
        let paint: AimPaint[] = [];
        let segments: AimPaint['segments'] = [];
        let arcs: AimPaint['arcs'] = [];
        let cursor: [number, number] | null = null;
        const point = (x: number, y: number): [number, number] => {
          const m = ctx.getTransform();
          return [(m.a * x + m.c * y + m.e) / currentViewport.dpr,
            (m.b * x + m.d * y + m.f) / currentViewport.dpr];
        };
        const record = (op: AimPaint['op'], extra: Partial<AimPaint> = {}) => {
          if (!recording) return;
          paint.push({ op, index: paint.length, alpha: ctx.globalAlpha,
            color: String(op === 'stroke' ? ctx.strokeStyle : ctx.fillStyle),
            segments: segments.map(s => ({ from: [...s.from], to: [...s.to] })),
            arcs: arcs.map(a => ({ ...a })), ...extra });
        };
        // Observe only this persistent canvas, and still invoke native drawing.
        // Record actual transformed CSS pixels, not the geometry helper's result.
        const wrap = (name: string, before: (...args: any[]) => void) => {
          const original = (ctx as any)[name].bind(ctx);
          (ctx as any)[name] = (...args: any[]) => { before(...args); return original(...args); };
        };
        wrap('beginPath', () => { segments = []; arcs = []; cursor = null; });
        wrap('moveTo', (x, y) => { cursor = point(x, y); });
        wrap('lineTo', (x, y) => {
          const to = point(x, y);
          if (cursor) segments.push({ from: cursor, to });
          cursor = to;
        });
        wrap('arc', (x, y, r) => {
          const p = point(x, y), edge = point(x + r, y);
          arcs.push({ x: p[0], y: p[1], r: Math.hypot(edge[0] - p[0], edge[1] - p[1]) });
        });
        wrap('stroke', () => record('stroke'));
        wrap('fill', rule => record('fill', { evenodd: rule === 'evenodd' }));
        wrap('fillRect', (x, y, w, h) => {
          const a = point(x, y), b = point(x + w, y + h);
          record('fillRect', { bounds: { x: a[0], y: a[1], w: b[0] - a[0], h: b[1] - a[1] } });
        });
        wrap('fillText', (text, x, y) => {
          const metrics = ctx.measureText(String(text));
          const a = point(x - metrics.actualBoundingBoxLeft, y - metrics.actualBoundingBoxAscent);
          const b = point(x + metrics.actualBoundingBoxRight, y + metrics.actualBoundingBoxDescent);
          record('text', { text: String(text), bounds: { x: a[0], y: a[1], w: b[0] - a[0], h: b[1] - a[1] } });
        });
        wrap('drawImage', () => record('image'));
        const capture = () => {
          paint = [];
          recording = true;
          try { game.renderFrame(); } finally { recording = false; }
          return paint;
        };
        let shotData: Pick<AimSnapshot, 'damage' | 'ammoSpent' | 'ray'> = { damage: 0, ammoSpent: 0, ray: null };
        let hitPoint: any = null;
        const snapshot = (): AimSnapshot => {
          if (hitPoint && shotData.ray) {
            e.camera.updateMatrixWorld(true);
            const projected = hitPoint.clone().project(e.camera);
            shotData.ray.x = (projected.x + 1) * currentViewport.width / 2;
            shotData.ray.y = (1 - projected.y) * currentViewport.height / 2;
          }
          return ({
          fixture: 'real-snow-raycast-frozen-actors', width: currentViewport.width, height: currentViewport.height,
          dpr: currentViewport.dpr, safeArea: currentViewport.safeArea,
          backing: { width: canvas.width, height: canvas.height },
          camera: { fov: e.camera.fov, aspect: e.camera.aspect, gunAspect: e.gunCamera.aspect },
          ...shotData, alive: target.alive, clock: e.clock, opacity: e.hud.hitOpacity,
          hitKind: e.hud.hitKind, confirmation: e.hud.hitConfirmation, scope: e.hud.scope,
          audioHits: [...audioHits], paint: capture(),
          lane: { from: chosenLane.from.toArray(), to: chosenLane.to.toArray() },
          });
        };
        Object.assign((window as any).__CS_AIM_FIXTURE__, {
          shoot(shot: AimShot) {
            e.clearEffects();
            e.clearCorpses();
            e.hud.killfeed = [];
            e.hud.notice = null;
            e.hideCenter();
            e.phase = 'active';
            // Reset prior confirmation through the real settings path, never
            // assign hitOpacity or call showHitFeedback to fabricate a hit.
            e.setHitFeedback('off');
            e.setHitFeedback(shot.feedback);
            audioHits.length = 0;
            player.pos.copy(chosenLane.from);
            player.grounded = true;
            player.moveVel.set(0, 0, 0);
            player.moveSpeed = 0;
            player.cooldown = 0;
            player.reload = 0;
            player.shotsFired = 0;
            player.spawnShield = 0;
            target.pos.copy(chosenLane.to);
            target.alive = true;
            target.health = shot.kill ? (shot.hit === 'head' ? 100 : 1) : (shot.hit === 'head' ? 400 : 100);
            target.armor = 0;
            target.spawnShield = 0;
            target.crouching = false;
            target.ragdoll = null;
            target.mesh.visible = true;
            target.mesh.position.copy(target.pos);
            target.mesh.rotation.set(0, Math.atan2(player.pos.x - target.pos.x, player.pos.z - target.pos.z), 0);
            if (target.mesh.userData.gun) target.mesh.userData.gun.visible = true;
            player.inventory.primary = e.inventoryWeapon(shot.zoom ? 'g3sg1' : 'm4a1');
            if (shot.ammo !== undefined) player.inventory.primary.ammo = shot.ammo;
            if (shot.reserve !== undefined) player.inventory.primary.reserve = shot.reserve;
            player.slot = 'primary';
            e.setGun(false);
            e.recoil = e.kickPitch = e.kickYaw = 0;
            e.crouching = false;
            const aim = target.pos.clone(); aim.y += shot.hit === 'head' ? 1.66 : 1.0;
            const direction = aim.sub(e.eyeOf(player)).normalize();
            player.pitch = Math.asin(direction.y);
            player.yaw = Math.atan2(-direction.x, -direction.z);
            e.zoom = shot.zoom;
            // Use engine FOV convergence, not a separately constructed camera.
            e.syncPlayerView(2, false);
            e.camera.updateMatrixWorld(true);
            e.computeHud();
            const health = target.health, ammo = e.weaponOf(player).ammo;
            shotData = { damage: 0, ammoSpent: 0, ray: null };
            hitPoint = null;
            const hitActor = e.hitActor;
            e.hitActor = function (origin: any, dir: any, max: number, shooter: any) {
              const hit = hitActor.call(this, origin, dir, max, shooter);
              if (shooter === player && hit) {
                hitPoint = origin.clone().addScaledVector(dir, hit.distance);
                const projected = hitPoint.clone().project(e.camera);
                shotData.ray = { x: (projected.x + 1) * currentViewport.width / 2,
                  y: (1 - projected.y) * currentViewport.height / 2,
                  head: hit.head, target: hit.actor === target, distance: hit.distance };
              }
              return hit;
            };
            const random = Math.random;
            try {
              // Choose the base ray deterministically; the engine still applies
              // its real spread/recoil formulas, trace, BSP block and damage.
              Math.random = () => .5;
              e.fire();
            } finally { Math.random = random; e.hitActor = hitActor; }
            shotData.damage = health - target.health;
            shotData.ammoSpent = ammo - e.weaponOf(player).ammo;
            game.setPresentationPaused(true);
            return snapshot();
          },
          snapshot,
          advanceWeapon(seconds: number) {
            // Controlled player-only time, retaining real weapon/action code;
            // NPCs and the SDK presentation remain frozen by this fixture.
            e.fireHeld = false; e.shotPressed = false;
            for (let left = Math.max(0, Math.min(10, seconds)); left > 0;) {
              const dt = Math.min(1 / 60, left); e.clock += dt; e.updatePlayer(dt); left -= dt;
            }
            e.computeHud();
            const weapon = e.weaponOf(player);
            return { ammo: weapon.ammo, reserve: weapon.reserve, reloading: player.reload > 0,
              reloadState: e.hud.reloadState, fireHeld: e.fireHeld, shotPressed: e.shotPressed, paint: capture() };
          },
          resize(next: AimViewport) {
            currentViewport = next;
            game.setViewport(next);
            return snapshot();
          },
          destroy: () => game.destroy(),
        });
        // Keep the real SDK loop alive but presentation-paused: time spent in
        // Playwright/screenshot readback must not advance combat or fade hits.
        game.start();
      },
    };
  }, { entry: gameModuleUrl('cs'), assetBase: gameAssetUrl('cs', ''), viewport });
  await expect.poll(() => page.evaluate(() => {
    const fixture = (window as any).__CS_AIM_FIXTURE__;
    if (fixture.bootError()) throw new Error(fixture.bootError());
    return fixture.ready();
  }), { timeout: 60_000 }).toBe(true);
  await page.evaluate(() => (window as any).__CS_AIM_FIXTURE__.install());
  return { errors };
}

export const fireAimingShot = (page: Page, shot: AimShot): Promise<AimSnapshot> =>
  page.evaluate(shot => (window as any).__CS_AIM_FIXTURE__.shoot(shot), shot);
export const readAimingSnapshot = (page: Page): Promise<AimSnapshot> =>
  page.evaluate(() => (window as any).__CS_AIM_FIXTURE__.snapshot());
export const resizeAimingFixture = (page: Page, viewport: AimViewport): Promise<AimSnapshot> =>
  page.evaluate(viewport => (window as any).__CS_AIM_FIXTURE__.resize(viewport), viewport);
export const closeAimingFixture = (page: Page): Promise<void> =>
  page.evaluate(() => (window as any).__CS_AIM_FIXTURE__?.destroy?.());
