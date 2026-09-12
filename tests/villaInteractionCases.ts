import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { VILLA_TEA_BAR } from '../src/games/villaLivingLayout';

const moduleUrl = () => process.env.VILLA_MODULE_URL || '/' + JSON.parse(readFileSync(join(process.cwd(), 'dist/.vite/manifest.json'), 'utf8'))['src/games/villa.ts'].file;

export async function mount(page: Page) {
  await page.goto('/#/snake');
  await page.evaluate(async url => {
    const { VillaGame } = await import(url), canvas = document.createElement('canvas');
    canvas.id = 'villa-native-input'; Object.assign(canvas.style, { position: 'fixed', top: '20px', left: '10px', zIndex: '10000' }); document.body.append(canvas);
    const f: any = { zh: true, words: [], calls: 0, use: null, trusted: [] };
    const g = new VillaGame({ canvas, logicalWidth: 1120, logicalHeight: 700, isDarkTheme: () => false, isZhLang: () => f.zh,
      isPixelMode: () => false, getRecord: () => null, reportScore: () => { throw new Error('Villa cannot score'); }, requestShellRender: () => {} }) as any;
    g.prepare(); g.start(); cancelAnimationFrame(g.animationId); g.setDisplayScale(Math.min(370, innerWidth - 20)); f.g = g;
    const interact = g.interact.bind(g); g.interact = () => { f.calls++; interact(); };
    const ctx = canvas.getContext('2d')!, fill = ctx.fillText;
    ctx.fillText = (text: string, x: number, y: number, maxWidth?: number) => {
      f.words.push(text);
      if (['互动', '离开', 'Use', 'Exit'].includes(text)) {
        // Measure the PAINTED label through the current context transform, not hit-test internals.
        const m = ctx.getTransform(), r = canvas.getBoundingClientRect();
        f.use = { x: r.x + (m.a * x + m.c * y + m.e) * r.width / canvas.width,
          y: r.y + (m.b * x + m.d * y + m.f) * r.height / canvas.height };
      }
      if (maxWidth === undefined) fill.call(ctx, text, x, y); else fill.call(ctx, text, x, y, maxWidth);
    };
    document.addEventListener('touchstart', e => { if ((e.target as Element)?.closest?.('[data-villa-use]')) f.trusted.push(e.isTrusted); }, { capture: true });
    f.tick = (n = 1) => { for (let i = 0; i < n; i++) g.update(.05); };
    f.render = () => { f.words = []; g.scene.softwareInputFrames = 0; g.scene.lastDrawAt = -Infinity; g.renderFrame(); };
    f.scooterHome = structuredClone(g.state.scooter);
    f.pose = (x: number, z: number) => {
      g.init(); g.enterCarAt = g.exitCarAt = g.closeCarAt = Infinity;
      g.state.seated = null; g.state.relaxSeatId = null; g.state.carDoorOpen = false; g.transition = null;
      Object.assign(g.state.scooter, f.scooterHome);
      g.position = { x, y: 0, z }; g.eyeY = 0; g.yaw = 0; g.pitch = -.2; f.tick(2); f.render();
    };
    f.pose(-5.67, -7.2); (window as any).villaInput = f;
  }, moduleUrl());
}
export async function tapPaintedUse(page: Page, offsetY = 0, compatibilityClick = false) {
  const point = await page.evaluate(offsetY => {
    const f = (window as any).villaInput, p = { x: f.use.x, y: f.use.y + offsetY };
    if (!document.elementFromPoint(p.x, p.y)?.closest('[data-villa-use]')) throw new Error('Painted interaction is not covered by its native button');
    return p;
  }, offsetY);
  await page.touchscreen.tap(point.x, point.y);
  await page.evaluate(compatibilityClick => {
    if (compatibilityClick) document.querySelector('[data-villa-use]')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    const f = (window as any).villaInput; f.tick(); f.render();
  }, compatibilityClick);
}
export async function dispose(page: Page) {
  await page.evaluate(() => { const f = (window as any).villaInput; if (f) { f.g.destroy(); f.g.canvas.remove(); } });
  await expect(page.locator('[data-villa-use]')).toHaveCount(0);
}

export function registerVillaInteractionTests() {
  test('real phone shell uses a native, single-fire interaction control', async ({ page }) => {
    test.setTimeout(90_000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('/#/villa');
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-villa-renderer', 'webgl', { timeout: 45_000 });
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');
    await page.waitForFunction(() => document.getElementById('gameCanvas')?.dataset.villaTarget === 'pet-dog');
    const button = page.locator('button[data-villa-use]'); await expect(button).toBeVisible(); await button.tap();
    await page.waitForFunction(() => JSON.parse(document.getElementById('gameCanvas')!.dataset.villaPets!).find((p: any) => p.id === 'dog').feedCount === 1);
    await button.tap();
    await page.waitForFunction(() => /吃饱|full/.test(document.getElementById('gameCanvas')!.dataset.villaUseFeedback!));
    expect(await page.locator('#gameCanvas').evaluate(c => JSON.parse(c.dataset.villaPets!).find((p: any) => p.id === 'dog').feedCount)).toBe(1);
    await page.goto('/#/snake'); await expect(page.locator('[data-villa-use]')).toHaveCount(0); expect(errors).toEqual([]);
  });

  test('painted button activates every fixture family once, including Safari tap and native keyboard activation', async ({ page }) => {
    test.setTimeout(120_000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await mount(page);
    try {
      await tapPaintedUse(page, 0, true);
      expect(await page.evaluate(() => { const f = (window as any).villaInput; return { on: f.g.state.faucetOn, calls: f.calls, trusted: f.trusted }; })).toEqual({ on: true, calls: 1, trusted: [true] });
      await tapPaintedUse(page); expect(await page.evaluate(() => (window as any).villaInput.g.state.faucetOn)).toBe(false);
      // Native keyboard/assistive button activation must not become Space/jump.
      await page.locator('[data-villa-use]').focus(); await page.keyboard.press('Space');
      expect(await page.evaluate(() => { const f = (window as any).villaInput; return [f.calls, f.g.state.faucetOn, f.g.motion.velocity]; })).toEqual([3, true, 0]);
      const scooterApproach = await page.evaluate(() => {
        const home = (window as any).villaInput.scooterHome;
        return { x: home.x + 1, z: home.z - .23 };
      });
      const cases: Array<[number, number, string, string]> = [
        [VILLA_TEA_BAR.approach.x, VILLA_TEA_BAR.approach.z, 'tea-bar', 'tea'], [-10, 2.2, 'fireplace', 'fire'], [6.65, 4.9, 'gaming', 'pc'],
        [4.55, -3.88, 'elevator', 'lift'], [18.55, -2.45, 'car', 'door'],
        [-5.25, 5.45, 'sofa-living', 'sofa'], [-21.25, 9.5, 'lounger-west', 'lounger'],
        [scooterApproach.x, scooterApproach.z, 'scooter', 'scooter'], [-16.5, 14.3, 'pet-parrot-blue', 'blue'],
        [8.15, 6.2, 'racing', 'race'],
      ];
      for (const [x, z, target, action] of cases) {
        const clean = await page.evaluate(({ x, z, action }) => {
          const f = (window as any).villaInput; f.pose(x, z);
          if (action === 'blue') {
            // A deliberately grounded feeding fixture; retain both birds' authored X/Z positions.
            const bird = f.g.state.pets.pets.find((p: any) => p.id === 'parrot-blue');
            Object.assign(bird, { y: 0, flightHeight: 0, verticalSpeed: 0, wingFold: 0, speed: 0, mode: 'idle', timer: 100,
              targetX: bird.x, targetZ: bird.z });
            f.tick(2); f.render();
          }
          return { seat: f.g.state.seated, relax: f.g.state.relaxSeatId,
            scooterReset: JSON.stringify(f.g.state.scooter) === JSON.stringify(f.scooterHome),
            scooterApproachSafe: action !== 'scooter' || f.g.canFit(1.75),
            accessIdle: [f.g.enterCarAt, f.g.exitCarAt, f.g.closeCarAt].every(t => t === Infinity) };
        }, { x, z, action });
        expect(clean, `${action} fixture reset`).toEqual({ seat: null, relax: null, scooterReset: true, scooterApproachSafe: true, accessIdle: true });
        expect(await page.evaluate(() => (window as any).villaInput.g.hotspot()?.id), action).toBe(target);
        if (action === 'tea') expect(await page.evaluate(() => {
          const g = (window as any).villaInput.g;
          return { phase: g.state.tea.phase, fill: g.state.tea.fill, liquidVisible: g.scene.scene.getObjectByName('tea-bar/liquid').visible, safe: g.canFit(1.75) };
        })).toEqual({ phase: 'empty', fill: 0, liquidVisible: false, safe: true });
        const before = await page.evaluate(() => (window as any).villaInput.calls);
        const trustedBefore = await page.evaluate(() => (window as any).villaInput.trusted.length);
        await tapPaintedUse(page);
        const result = await page.evaluate(({ action, target, trustedBefore }) => {
          const f = (window as any).villaInput, g = f.g;
          const changed = action === 'tea' ? g.state.tea.phase === 'brewing' && g.state.tea.fill > 0 && g.state.tea.fill < 1 && g.state.teaUntil > g.time
            : action === 'fire' ? !g.state.fireplace : action === 'pc' ? !g.state.gaming
            : action === 'lift' ? g.state.elevator.phase !== 'closed' : action === 'door' ? g.state.carDoorOpen
            : action === 'sofa' || action === 'lounger' ? g.state.seated === action && g.state.relaxSeatId === target
            : action === 'scooter' ? g.state.seated === 'scooter' && g.state.relaxSeatId === null
            : action === 'blue' ? g.state.pets.pets.find((p: any) => p.id === 'parrot-blue').feedCount === 1
            : g.state.seated === 'racing';
          return { calls: f.calls, changed, trusted: f.trusted.slice(trustedBefore) };
        }, { action, target, trustedBefore });
        expect(result, action).toEqual({ calls: before + 1, changed: true, trusted: [true] });
        if (action === 'door') {
          expect(await page.evaluate(() => {
            const f = (window as any).villaInput; f.tick(40); f.render();
            return { seated: f.g.state.seated, open: f.g.state.carDoorOpen, calls: f.calls };
          })).toEqual({ seated: 'car', open: false, calls: before + 1 });
        } else if (action === 'sofa' || action === 'lounger' || action === 'scooter') {
          expect(await page.evaluate(() => {
            const f = (window as any).villaInput; f.tick(12); f.render();
            return { seat: f.g.canvas.dataset.villaSeat, relax: f.g.canvas.dataset.villaRelaxSeat,
              scooterSpeed: JSON.parse(f.g.canvas.dataset.villaScooter).speed, settled: f.g.transition === null };
          })).toEqual({ seat: action, relax: action === 'scooter' ? '' : target, scooterSpeed: 0, settled: true });
          const exitTrustedBefore = await page.evaluate(() => (window as any).villaInput.trusted.length);
          await tapPaintedUse(page);
          expect(await page.evaluate(({ exitTrustedBefore, action }) => {
            const f = (window as any).villaInput; f.tick(12); f.render();
            const exits = action === 'sofa' ? [[-5.25, 5.45], [-6.1, 4.6]]
              : action === 'lounger' ? [[-21.25, 9.5], [-20.2, 10.85]]
                : [1, -1].map(side => [f.scooterHome.x + side, f.scooterHome.z - .23]);
            const p = f.g.position;
            return { seat: f.g.state.seated, relax: f.g.state.relaxSeatId, snapshot: f.g.canvas.dataset.villaSeat,
              snapshotRelax: f.g.canvas.dataset.villaRelaxSeat, safe: f.g.canFit(1.75), settled: f.g.transition === null,
              authoredExit: p.y === 0 && exits.some(([x, z]) => Math.hypot(p.x - x, p.z - z) < 1e-6),
              calls: f.calls, trusted: f.trusted.slice(exitTrustedBefore) };
          }, { exitTrustedBefore, action })).toEqual({ seat: null, relax: null, snapshot: 'none', snapshotRelax: '', safe: true, settled: true,
            authoredExit: true, calls: before + 2, trusted: [true] });
        } else if (action === 'blue') {
          const snapshot = await page.evaluate(() => {
            const f = (window as any).villaInput, pets = JSON.parse(f.g.canvas.dataset.villaPets);
            return { blue: pets.find((p: any) => p.id === 'parrot-blue'),
              others: pets.filter((p: any) => p.id !== 'parrot-blue').map((p: any) => p.feedCount), sequence: f.g.state.pets.feedSequence };
          });
          expect(snapshot.blue).toMatchObject({ id: 'parrot-blue', kind: 'parrot', feedCount: 1 });
          expect(snapshot.blue.cooldown).toBeGreaterThan(0); expect(snapshot.others).toEqual([0, 0, 0, 0, 0]); expect(snapshot.sequence).toBe(1);
          await tapPaintedUse(page);
          expect(await page.evaluate(() => {
            const f = (window as any).villaInput;
            return { count: f.g.state.pets.pets.find((p: any) => p.id === 'parrot-blue').feedCount, sequence: f.g.state.pets.feedSequence, calls: f.calls };
          })).toEqual({ count: 1, sequence: 1, calls: before + 2 });
        }
      }
      // A key held before focus enters the native control must still be released.
      await page.evaluate(() => { const f = (window as any).villaInput; f.tick(16); f.g.canvas.tabIndex = 0; f.render(); });
      await page.locator('#villa-native-input').focus(); await page.keyboard.down('Space');
      expect(await page.evaluate(() => (window as any).villaInput.g.keys.has(' '))).toBe(true);
      await page.locator('[data-villa-use]').focus(); await page.keyboard.up('Space');
      expect(await page.evaluate(() => (window as any).villaInput.g.keys.has(' '))).toBe(false);
      expect(errors).toEqual([]);
    } finally { await dispose(page); }
  });

  test('failed actions remain readable and narrow Exit, rotation, cancellation and quiet-mode recovery remain usable', async ({ page }) => {
    test.setTimeout(120_000); await page.setViewportSize({ width: 360, height: 780 }); await mount(page);
    try {
      await page.evaluate(() => { const f = (window as any).villaInput; f.g.activate('home'); f.tick(); f.render(); }); await tapPaintedUse(page);
      expect(await page.evaluate(() => (window as any).villaInput.words.join(''))).toContain('请靠近');
      await page.evaluate(() => { const f = (window as any).villaInput; f.pose(-5.67, -7.2); f.g.motion.offset = .04; f.g.position.y = .04; f.render(); }); await tapPaintedUse(page);
      expect(await page.evaluate(() => (window as any).villaInput.words.join(''))).toContain('请先落地');
      // The wider door arc now accepts the spot it used to refuse, so the
      // refusal text is gone: a real action must start instead of a dead end.
      await page.evaluate(() => { const f = (window as any).villaInput; f.pose(18.55, -2.45); }); await tapPaintedUse(page);
      const doorWords = await page.evaluate(() => (window as any).villaInput.words.join(''));
      expect(doorWords).toContain('开门');
      await page.evaluate(() => { const f = (window as any).villaInput; f.pose(-5.67, -7.2); f.g.activate('immersion'); f.render(); });
      await expect(page.locator('[data-villa-use]')).toBeHidden();
      await page.evaluate(() => { const f = (window as any).villaInput; f.g.activate('immersion'); f.render(); });
      // A cancelled contact can arrive with an empty changedTouches list on focus loss.
      await page.evaluate(() => {
        const button = document.querySelector('[data-villa-use]')!, start = new Event('touchstart', { bubbles: true, cancelable: true });
        Object.defineProperty(start, 'changedTouches', { value: [{ identifier: 91 }] }); button.dispatchEvent(start);
        const cancel = new Event('touchcancel', { bubbles: true, cancelable: true }); Object.defineProperty(cancel, 'changedTouches', { value: [] }); button.dispatchEvent(cancel);
      });
      const before = await page.evaluate(() => (window as any).villaInput.calls); await tapPaintedUse(page);
      expect(await page.evaluate(() => (window as any).villaInput.calls)).toBe(before + 1);
      await page.setViewportSize({ width: 844, height: 390 });
      await page.evaluate(() => { const f = (window as any).villaInput; f.g.setDisplayScale(550); f.render(); }); await tapPaintedUse(page);
      await page.setViewportSize({ width: 360, height: 780 });
      await page.evaluate(() => { const f = (window as any).villaInput; f.g.setDisplayScale(340); f.pose(9.15, -.95); }); await tapPaintedUse(page);
      await page.evaluate(() => { const f = (window as any).villaInput; f.tick(12); f.g.activate('shoot'); f.tick(); f.render(); });
      expect(await page.evaluate(() => (window as any).villaInput.g.state.snooker.moving)).toBe(true);
      await tapPaintedUse(page, -20); // Previously this visible upper cap hit Shot on narrow phones.
      expect(await page.evaluate(() => (window as any).villaInput.g.state.snookerActive)).toBe(false);
    } finally { await dispose(page); }
  });
}
