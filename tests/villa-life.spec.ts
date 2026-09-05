import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GameHost } from '../src/core/game';

const moduleUrl = () => '/' + JSON.parse(readFileSync(join(process.cwd(), 'dist/.vite/manifest.json'), 'utf8'))['src/games/villa.ts'].file;

/** One manually stepped real Villa controller/scene per test; no wall-clock physics waits. */
async function mount(page: Page, touch = false) {
  await page.goto('/#/snake');
  await page.evaluate(async ({ url, touch }) => {
    const { VillaGame } = await import(url);
    const canvas = document.createElement('canvas'); canvas.id = 'villa-life';
    Object.assign(canvas.style, { position: 'fixed', top: '20px', left: '10px', zIndex: '10000' });
    document.body.append(canvas);
    const host: GameHost = { canvas, logicalWidth: 1120, logicalHeight: 700, isDarkTheme: () => false,
      isZhLang: () => false, isPixelMode: () => false, getRecord: () => null,
      reportScore: () => { throw new Error('Villa must not submit a competitive score'); }, requestShellRender: () => {} };
    const game = new VillaGame(host) as any;
    game.prepare(); game.start(); cancelAnimationFrame(game.animationId);
    game.setDisplayScale(touch ? 370 : 1000);
    const key = (key: string, type = 'keydown') => game.handleInput(new KeyboardEvent(type, { key }));
    const press = (name: string) => { key(name); key(name, 'keyup'); };
    const tick = (n: number) => { for (let i = 0; i < n; i++) game.update(.05); };
    const walk = (x: number, z: number) => {
      for (const axis of ['x', 'z']) {
        const target = axis === 'x' ? x : z; let budget = 600;
        while (Math.abs(game.position[axis] - target) > .005 && budget-- > 0) {
          const difference = target - game.position[axis];
          game.yaw = axis === 'x' ? (difference > 0 ? -Math.PI / 2 : Math.PI / 2) : (difference > 0 ? Math.PI : 0);
          const speed = 2.75 * (1 - game.motion.stance * .52);
          key('w'); game.update(Math.min(.05, Math.abs(difference) / speed)); key('w', 'keyup');
        }
        if (budget <= 0) throw new Error(`Blocked walking to (${x},${z}): ${JSON.stringify(game.position)}`);
      }
    };
    const toSnooker = () => { press('h'); walk(0, 1.3); walk(9.15, 1.3); walk(9.15, -.95); };
    if (touch) for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
      canvas.addEventListener(type, () => {
        // BaseGame already delivers native touch input: forwarding again would
        // toggle C twice. RAF is stopped, so give each packet one simulation
        // frame so a quick touchscreen.tap exercises held aim/power controls too.
        game.update(.05);
      }, { passive: false });
    }
    (window as any).villaLife = { game, key, press, tick, walk, toSnooker };
    press('h');
  }, { url: moduleUrl(), touch });
}
async function dispose(page: Page) {
  await page.evaluate(() => {
    const fixture = (window as any).villaLife;
    if (fixture) { fixture.game.destroy(); fixture.game.canvas.remove(); delete (window as any).villaLife; }
  });
}

// The shared Playwright configuration uses one GPU worker; cases remain independent.

test('villa life: walk to the furnished snooker table, aim, shoot real balls, reset and safely leave', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await mount(page);
  try {
    const result = await page.evaluate(() => {
      const { game, key, press, tick, toSnooker } = (window as any).villaLife;
      toSnooker(); const entry = { ...game.position }, target = game.canvas.dataset.villaTarget;
      press('e'); tick(10);
      const active = game.state.snookerActive, view = game.view();
      const mesh = game.scene.scene.getObjectByName('snooker-dynamic-balls');
      if (!mesh?.isInstancedMesh) throw new Error('Missing actual dynamic snooker InstancedMesh');
      const guide = game.scene.scene.getObjectByName('snooker-world-aim-guide');
      const cue = game.scene.scene.getObjectByName('snooker-active-cue');
      const initialAim = game.state.snooker.aim, initialPower = game.state.snooker.power;
      key('ArrowRight'); key('ArrowUp'); tick(5); key('ArrowRight', 'keyup'); key('ArrowUp', 'keyup');
      const arrowChanged = game.state.snooker.aim > initialAim && game.state.snooker.power > initialPower;
      const beforeMouse = { aim: game.state.snooker.aim, power: game.state.snooker.power };
      const rect = game.canvas.getBoundingClientRect(); game.mouseLookEnabled = true;
      if (document.pointerLockElement === game.canvas) {
        document.dispatchEvent(new MouseEvent('mousemove', { movementX: 60, movementY: -40 }));
      } else {
        game.handleInput(new MouseEvent('mousemove', { clientX: rect.x + rect.width * .5, clientY: rect.y + rect.height * .5 }));
        game.handleInput(new MouseEvent('mousemove', { clientX: rect.x + rect.width * .55, clientY: rect.y + rect.height * .45 }));
      }
      const mouseChanged = game.state.snooker.aim > beforeMouse.aim && game.state.snooker.power > beforeMouse.power;
      // R restores the tested default break without assigning any ball positions.
      press('r'); tick(1);
      const readyGuide = guide.visible && cue.visible;
      const beforeMatrix = Array.from(mesh.instanceMatrix.array) as number[];
      press(' '); const started = game.state.snooker.moving && game.state.snooker.shots === 1;
      tick(4);
      const physicalMotion = (Array.from(mesh.instanceMatrix.array) as number[]).some((v, i) => Math.abs(v - beforeMatrix[i]) > .001);
      const hiddenDuringShot = !guide.visible && !cue.visible;
      let budget = 520;
      while (game.state.snooker.moving && budget-- > 0) tick(1);
      const settled = !game.state.snooker.moving && game.state.snooker.balls.every((b: any) => b.vx === 0 && b.vz === 0);
      press('r'); tick(1);
      const reset = game.state.snooker.shots === 0 && game.state.snooker.score === 0 && game.state.snooker.balls.length === 22
        && game.state.snooker.balls.every((b: any) => !b.potted && b.x === b.homeX && b.z === b.homeZ);
      press('e'); tick(10);
      const exit = { ...game.position }, safeExit = !game.state.snookerActive && game.canFit(1.75) && !guide.visible && !cue.visible;
      return { target, entry, active, view, arrowChanged, mouseChanged, readyGuide, started, physicalMotion,
        hiddenDuringShot, settled, reset, exit, safeExit, telemetry: JSON.parse(game.canvas.dataset.villaSnooker) };
    });
    expect(result.target).toBe('snooker'); expect(result.entry.x).toBeCloseTo(9.15); expect(result.entry.z).toBeCloseTo(-.95);
    expect(result.view.y + result.view.eyeHeight).toBeLessThan(3.4); expect(result.view.fov).toBe(96);
    expect(result.view.pitch).toBeCloseTo(-Math.PI / 2);
    for (const flag of ['active', 'arrowChanged', 'mouseChanged', 'readyGuide', 'started', 'physicalMotion', 'hiddenDuringShot', 'settled', 'reset', 'safeExit'] as const) expect(result[flag], flag).toBe(true);
    expect(result.exit).toEqual(result.entry); expect(result.telemetry).toMatchObject({ active: false, moving: false, shots: 0 });
    expect(errors).toEqual([]);
  } finally { await dispose(page); }
});

test('villa life: crouching slows walking, jumping moves feet, and low stairs prevent standing', async ({ page }) => {
  test.setTimeout(90_000); await mount(page);
  try {
    const result = await page.evaluate(() => {
      const { game, key, press, tick, walk } = (window as any).villaLife;
      const start = game.position.z;
      key('s'); tick(10); key('s', 'keyup'); const standingDistance = game.position.z - start;
      press('h'); press('c'); tick(1); const partialStance = game.motion.stance; tick(19);
      const crouchStart = game.position.z; key('s'); key('Shift'); tick(10); key('s', 'keyup'); key('Shift', 'keyup');
      const crouchedDistance = game.position.z - crouchStart, crouchEye = JSON.parse(game.canvas.dataset.villaMotion).eyeHeight;
      press('h'); const base = game.position.y; press(' '); tick(3);
      const airborne = game.position.y - base, offset = game.motion.offset, velocity = game.motion.velocity;
      press(' '); const noDoubleJump = game.motion.velocity === velocity;
      let peak = airborne, falling = false;
      for (let i = 0; i < 30; i++) { const oldY = game.position.y; tick(1); peak = Math.max(peak, game.position.y - base); falling ||= game.position.y < oldY; }
      const landed = game.position.y === base && game.motion.offset === 0 && game.motion.velocity === 0;
      press('h'); walk(0, 1.3); walk(5.2, 1.3); walk(5.2, -4);
      press('c'); tick(20); walk(5.2, -6.2);
      const underLanding = { ...game.position }; press('c'); tick(2);
      const blockedStanding = game.motion.crouched && game.motion.stance === 1;
      walk(5.2, -4); press('c'); tick(20);
      const stoodOutside = !game.motion.crouched && game.motion.stance === 0;
      return { standingDistance, crouchedDistance, partialStance, crouchEye, airborne, offset, noDoubleJump, peak, falling, landed, underLanding, blockedStanding, stoodOutside };
    });
    expect(result.partialStance).toBeGreaterThan(0); expect(result.partialStance).toBeLessThan(1);
    expect(result.crouchedDistance / result.standingDistance).toBeCloseTo(.48, 2); expect(result.crouchEye).toBeCloseTo(.9);
    expect(result.airborne).toBeGreaterThan(.4); expect(result.airborne).toBeCloseTo(result.offset);
    expect(result.peak).toBeGreaterThan(.95); expect(result.peak).toBeLessThan(1);
    expect(result.underLanding.y).toBe(0); expect(result.underLanding.z).toBeCloseTo(-6.2);
    for (const flag of ['noDoubleJump', 'falling', 'landed', 'blockedStanding', 'stoodOutside'] as const) expect(result[flag], flag).toBe(true);
  } finally { await dispose(page); }
});

test('villa life: immersive HUD contains only floor/room and an occupied lift stays open until departure', async ({ page }) => {
  test.setTimeout(90_000); await mount(page);
  try {
    const result = await page.evaluate(() => {
      const { game, press, tick, walk } = (window as any).villaLife;
      const context = game.canvas.getContext('2d') as CanvasRenderingContext2D;
      const original = context.fillText;
      const hudText = () => {
        const texts: string[] = [];
        context.fillText = (text: string) => { texts.push(text); };
        try { game.drawHud(context); } finally { context.fillText = original; }
        return texts;
      };
      press('i'); const immersiveText = hudText(), immersive = game.canvas.dataset.villaImmersive;
      const promptHidden = game.canvas.dataset.villaPrompt === '';
      const onlyImmersionControl = game.buttons().length === 1 && game.buttons()[0].id === 'immersion';
      press('i'); const normalText = hudText(), restored = game.canvas.dataset.villaImmersive === 'false' && game.buttons().some((b: any) => b.id === 'map');
      walk(0, -4.3); press('e'); tick(18); walk(0, -6.2); tick(140);
      const heldOpen = game.state.elevator.phase === 'open' && game.state.elevator.door === 1 && game.state.elevator.idleFor === 0;
      walk(0, -4.3); tick(60); const beforeTimeout = game.state.elevator.phase === 'open';
      const y = game.state.elevator.y; let noTravel = true;
      for (let i = 0; i < 50; i++) { tick(1); noTravel &&= game.state.elevator.phase !== 'moving' && game.state.elevator.y === y; }
      const closed = game.state.elevator.phase === 'closed' && game.state.elevator.door === 0;
      press('e'); tick(18); const reopened = game.state.elevator.phase === 'open' && game.state.elevator.y === y;
      return { immersiveText, immersive, promptHidden, onlyImmersionControl, normalText, restored, heldOpen, beforeTimeout, noTravel, closed, reopened };
    });
    expect(result.immersive).toBe('true'); expect(result.immersiveText).toEqual(['1F · Welcome home']);
    expect(result.normalText.length).toBeGreaterThan(1); expect(result.normalText).toContain('M  Floor plan');
    for (const flag of ['promptHidden', 'onlyImmersionControl', 'restored', 'heldOpen', 'beforeTimeout', 'noTravel', 'closed', 'reopened'] as const) expect(result[flag], flag).toBe(true);
  } finally { await dispose(page); }
});

test('villa life: nearby badges attach to visible props and disappear behind obstructions or out of view', async ({ page }) => {
  test.setTimeout(90_000); await mount(page);
  try {
    const result = await page.evaluate(() => {
      const { game, walk, tick } = (window as any).villaLife;
      walk(0, 1.4); walk(4.2, 1.4); walk(4.2, 6.45); walk(3.4, 6.45);
      game.yaw = Math.PI / 2; game.pitch = -.02; tick(10);
      const render = () => { game.scene.softwareInputFrames = 0; game.scene.lastDrawAt = -Infinity; game.renderFrame(); return game.canvas.dataset.villaPrompt; };
      const visible = render(); const image = game.canvas.toDataURL();
      // A temporary blocking slab exercises the same collider ray test as actual walls.
      game.scene.colliders.push({ minX: 2.9, maxX: 2.95, minZ: 5.4, maxZ: 7.5, minY: 0, maxY: 2.8 });
      const occluded = render(); game.scene.colliders.pop();
      game.yaw = -Math.PI / 2; const behind = render();
      walk(4.8, 6.45); game.yaw = Math.PI / 2; tick(10); const distant = render();
      return { visible, occluded, behind, distant, image };
    });
    expect(result.visible).toBe('figures'); expect(result.occluded).toBe(''); expect(result.behind).toBe(''); expect(result.distant).toBe('');
    await test.info().attach('original-chibi-interaction-badge', { body: Buffer.from(result.image.split(',')[1], 'base64'), contentType: 'image/png' });
  } finally { await dispose(page); }
});

test('villa life: coarse taps operate crouch/jump and snooker buttons with scaled coordinates and cancellation', async ({ browser }) => {
  test.setTimeout(90_000);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  try {
    await mount(page, true);
    const button = async (id: string) => page.evaluate(id => {
      const { game } = (window as any).villaLife;
      const b = game.buttons().find((b: any) => b.id === id); if (!b) throw new Error(`Missing touch button ${id}`);
      const r = game.canvas.getBoundingClientRect(), x = r.x + (b.x + b.w / 2) * r.width / game.width, y = r.y + (b.y + b.h / 2) * r.height / game.height;
      const logical = game.canvasPoint(x, y);
      return { x, y, w: b.w * r.width / game.width, h: b.h * r.height / game.height,
        mappingCorrect: Math.abs(logical.x - b.x - b.w / 2) < .001 && Math.abs(logical.y - b.y - b.h / 2) < .001 };
    }, id);
    const tap = async (id: string) => {
      const b = await button(id); expect(b.mappingCorrect).toBe(true); expect(b.w).toBeGreaterThanOrEqual(43); expect(b.h).toBeGreaterThanOrEqual(43);
      await page.touchscreen.tap(b.x, b.y);
    };
    await tap('crouch');
    expect(await page.evaluate(() => (window as any).villaLife.game.motion.crouched)).toBe(true);
    await tap('jump');
    expect(await page.evaluate(() => (window as any).villaLife.game.position.y)).toBeGreaterThan(0);
    await page.evaluate(() => { const f = (window as any).villaLife; f.tick(30); f.toSnooker(); f.press('e'); f.tick(10); });
    const before = await page.evaluate(() => { const s = (window as any).villaLife.game.state.snooker; return { aim: s.aim, power: s.power }; });
    await tap('aim-right'); await tap('power-up');
    const after = await page.evaluate(() => { const f = (window as any).villaLife, s = f.game.state.snooker; return { aim: s.aim, power: s.power, held: f.game.touchActions.size }; });
    expect(after.aim).toBeGreaterThan(before.aim); expect(after.power).toBeGreaterThan(before.power); expect(after.held).toBe(0);
    // Chromium protocol emits genuine touchstart/touchcancel packets for an
    // interrupted held control; ordinary actions above use touchscreen.tap.
    const client = await context.newCDPSession(page), heldButton = await button('aim-left');
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: heldButton.x, y: heldButton.y, id: 7 }] });
    expect(await page.evaluate(() => (window as any).villaLife.game.touchActions.size)).toBe(1);
    await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    const released = await page.evaluate(() => {
      const f = (window as any).villaLife, aim = f.game.state.snooker.aim; f.tick(10);
      return { held: f.game.touchActions.size, stable: aim === f.game.state.snooker.aim, lookReleased: f.game.lookTouch === null, joystickReleased: f.game.joystick === null };
    });
    expect(released).toEqual({ held: 0, stable: true, lookReleased: true, joystickReleased: true }); await client.detach();
    await tap('shoot');
    expect(await page.evaluate(() => { const s = (window as any).villaLife.game.state.snooker; return s.shots === 1 && s.moving; })).toBe(true);
    await tap('reset-activity');
    expect(await page.evaluate(() => { const s = (window as any).villaLife.game.state.snooker; return s.shots === 0 && !s.moving && s.balls.every((b: any) => !b.potted); })).toBe(true);
    const feedback = await page.evaluate(() => {
      const game = (window as any).villaLife.game, ctx = game.canvas.getContext('2d');
      const oldText = ctx.fillText, oldLanguage = game.isZhLang;
      const capture = (zh: boolean, complete: boolean) => {
        game.isZhLang = () => zh;
        Object.assign(game.state.snooker, { phase: complete ? 'complete' : 'aiming', foul: complete ? null : 'Cue ball potted', score: complete ? 147 : -4, target: complete ? 'black' : 'red' });
        const text: string[] = []; ctx.fillText = (line: string) => text.push(line); game.drawHud(ctx); return text.join(' | ');
      };
      try { return { foulEn: capture(false, false), foulZh: capture(true, false), clearEn: capture(false, true), clearZh: capture(true, true) }; }
      finally { ctx.fillText = oldText; game.isZhLang = oldLanguage; }
    });
    expect(feedback.foulEn).toContain('Foul'); expect(feedback.foulEn).toContain('Scratch'); expect(feedback.foulEn).toContain('65%');
    expect(feedback.foulZh).toContain('犯规'); expect(feedback.foulZh).toContain('白球落袋');
    expect(feedback.clearEn).toContain('Cleared'); expect(feedback.clearEn).toContain('Tap Reset'); expect(feedback.clearEn).toContain('147');
    expect(feedback.clearZh).toContain('清台'); expect(feedback.clearZh).toContain('点重摆');
    await tap('immersion');
    expect(await page.evaluate(() => (window as any).villaLife.game.canvas.dataset.villaImmersive)).toBe('true');
    await tap('immersion');
    expect(await page.evaluate(() => (window as any).villaLife.game.buttons().some((b: any) => b.id === 'shoot'))).toBe(true);
  } finally { await context.close(); }
});
