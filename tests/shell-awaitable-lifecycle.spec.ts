import { expect, test, type Page } from '@playwright/test';
import { choose, cleanErrors, instances, lifecycleFixture, moduleSource, publicCapabilityUrl, ready, report, settle } from '../apps/shell/tests/lifecycle-fixture';
import { preparationFixture } from '../apps/shell/tests/preparation-fixture';
import { releaseInputDeclaration, waitForLocalInputPresentation, assertLocalInputInteractive, exerciseLocalFileChooser } from './support/local-input-preparation';

// These are generic synthetic API-1 modules, not native/game implementations.
// Root placement intentionally enters the real pinned-games Shell CI cell.
test.afterEach(async ({ page }) => {
  await page.evaluate(() => {
    for (const control of (window as any).__lifecycleProbe?.controls ?? []) control.resolve?.();
  }).catch(() => undefined); // Page may already be closed by a failed navigation.
  await page.unrouteAll({ behavior: 'wait' });
});

test.describe('negotiated required local input preparation', () => {
  async function openPrepared(page: Page, options: Parameters<typeof preparationFixture>[1] = {}) {
    const fixture = await preparationFixture(page, options);
    await page.goto('/#/alpha');
    await waitForLocalInputPresentation(page, (await releaseInputDeclaration(page, fixture.release))!);
    return fixture;
  }
  const attemptReport = (page: Page, index?: number) => page.evaluate(index => (window as any).__lifecycleProbe.controls[0].report(index), index);
  const freshReport = (page: Page) => page.evaluate(() => { const control = (window as any).__lifecycleProbe.controls[0]; control.begin(); return control.report(); });
  test('verified resource and interactive file control are ready without running or saving a success preference', async ({ page }) => {
    const fixture = await preparationFixture(page);
    const failures: string[] = [], resources: string[] = [];
    page.on('response', response => { if (response.status() >= 400) failures.push(response.url()); });
    page.on('request', request => { const path = new URL(request.url()).pathname; if (path.startsWith(fixture.release.assetBase)) resources.push(path); });
    await page.goto('/#/gacha'); await ready(page, 'gacha');
    await choose(page, 'alpha');
    const declaration = await releaseInputDeclaration(page, fixture.release); expect(declaration).toBeDefined();
    expect(await waitForLocalInputPresentation(page, declaration!)).toBe('awaiting-input');
    expect((await instances(page))[1]).toMatchObject({ checked: true, capability: true, vm: 0, writers: 0, prepare: 1, start: 1 });
    const canvas = page.locator('#gameCanvas');
    await expect(canvas).toHaveAttribute('data-game-id', fixture.release.id);
    await expect(canvas).toHaveAttribute('data-game-version', fixture.release.version);
    await expect(canvas).toHaveAttribute('data-game-revision', fixture.release.revision);
    await expect(canvas).toHaveAttribute('data-game-asset-base', fixture.release.assetBase);
    expect(await page.locator('link[data-game-stylesheet]').evaluateAll(nodes => nodes.map(node => new URL((node as HTMLLinkElement).href).pathname).sort())).toEqual([...fixture.release.styles].sort());
    expect(resources).toContain(fixture.release.entry);
    expect(resources).toContain(`${fixture.release.assetBase}required-input.dat`);
    expect(failures).toEqual([]);
    expect(await page.evaluate(() => localStorage.getItem('cg-last-game'))).toBe('gacha');
    await exerciseLocalFileChooser(page);
    await assertLocalInputInteractive(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await assertLocalInputInteractive(page);
    await page.locator('#helpBtn').click();
    await expect(page.locator('#gameCanvas')).not.toHaveAttribute('data-game-preparation', 'awaiting-input');
    await page.locator('#helpCloseBtn').click(); await assertLocalInputInteractive(page);
    await choose(page, 'alpha'); await assertLocalInputInteractive(page);
    expect((await instances(page))[1]).toMatchObject({ prepare: 1, start: 1, destroy: 0, vm: 0, writers: 0 });
    await cleanErrors(page, fixture.errors);
  });

  for (const [index, declaration] of [undefined, null, { protocol: 'carrick-local-input-preparation', version: 2, kind: 'files' },
    { protocol: 'carrick-local-input-preparation', version: 1, kind: 'other' },
    { protocol: 'carrick-local-input-preparation', version: 1, kind: 'files', verified: true }].entries()) {
    test(`invalid declaration ${index} fails preflight before old teardown`, async ({ page }) => {
      const fixture = await preparationFixture(page, { declaration });
      await page.goto('/#/gacha'); await ready(page, 'gacha');
      await choose(page, 'alpha'); await expect(page.locator('#loadError')).toBeVisible();
      expect((await instances(page)).map(item => item.id)).toEqual(['gacha']);
      expect((await instances(page))[0]).toMatchObject({ destroy: 0, stop: 0, paused: true });
      await expect(page.locator('#resumePreviousBtn')).toHaveText('Resume previous game');
      await page.locator('#resumePreviousBtn').click(); await ready(page, 'gacha');
      await expect(page.locator('link[data-game-stylesheet]')).toHaveCount(1);
      await cleanErrors(page, fixture.errors);
    });
  }

  test('undeclared loading games do not receive preparation or become ready from a lifecycle-v1 string', async ({ page }) => {
    const fixture = await preparationFixture(page, { undeclared: true });
    await page.goto('/#/alpha');
    await expect.poll(async () => (await instances(page))[0]?.checked).toBe(true);
    expect(await releaseInputDeclaration(page, fixture.release)).toBeUndefined();
    expect((await instances(page))[0].capability).toBe(false);
    await report(page, 0, 'awaiting-input');
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'false');
    await expect(page.locator('#gameCanvas')).not.toHaveAttribute('data-game-preparation-protocol', /.+/);
    await expect(page.locator('#gameCanvas')).not.toHaveAttribute('data-game-preparation', /.+/);
    expect(await page.evaluate(() => localStorage.getItem('cg-last-game'))).toBeNull();
    await cleanErrors(page, fixture.errors);
  });

  test('a held owned prerequisite remains loading until actual verified bytes arrive', async ({ page }) => {
    const fixture = await preparationFixture(page);
    let release!: () => void, requested = false;
    const held = new Promise<void>(resolve => { release = resolve; });
    await page.route(`**${fixture.release.assetBase}required-input.dat`, async route => { requested = true; await held; await route.fulfill({ contentType: 'application/octet-stream', body: fixture.resourceBody }); });
    try {
      await page.goto('/#/alpha'); await expect.poll(() => requested).toBe(true);
      expect((await instances(page))[0]).toMatchObject({ checked: false, vm: 0, writers: 0 });
      expect(await attemptReport(page)).toBe(false);
      await expect(page.locator('#gameCanvas')).not.toHaveAttribute('data-game-preparation', 'awaiting-input');
      await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'false');
      release(); await waitForLocalInputPresentation(page, (await releaseInputDeclaration(page, fixture.release))!);
      expect((await instances(page))[0].checked).toBe(true);
      await cleanErrors(page, fixture.errors);
    } finally { release(); }
  });

  test('game-authored preparation attributes cannot substitute for an accepted host receipt', async ({ page }) => {
    const fixture = await preparationFixture(page);
    let release!: () => void, requested = false;
    const held = new Promise<void>(resolve => { release = resolve; });
    await page.route(`**${fixture.release.assetBase}required-input.dat`, async route => { requested = true; await held; await route.fulfill({ contentType: 'application/octet-stream', body: fixture.resourceBody }); });
    try {
      await page.goto('/#/alpha'); await expect.poll(() => requested).toBe(true);
      await page.evaluate(() => {
        const control = (window as any).__lifecycleProbe.controls[0];
        (document.getElementById(control.inputId) as HTMLInputElement).disabled = false;
        const canvas = document.getElementById('gameCanvas')!;
        canvas.dataset.gamePreparation = 'awaiting-input'; canvas.dataset.gamePreparationInput = control.inputId;
      });
      await expect(page.locator('#gameCanvas')).not.toHaveAttribute('data-game-preparation', 'awaiting-input');
      expect((await instances(page))[0].checked).toBe(false);
      release(); await waitForLocalInputPresentation(page, (await releaseInputDeclaration(page, fixture.release))!);
      await cleanErrors(page, fixture.errors);
    } finally { release(); }
  });

  for (const resource of ['404', 'bad-hash'] as const) {
    test(`required resource ${resource} never becomes awaiting-input`, async ({ page }) => {
      const fixture = await preparationFixture(page, { resource });
      await page.goto('/#/alpha'); await expect(page.locator('#loadError')).toBeVisible();
      expect((await instances(page))[0]).toMatchObject({ checked: false, vm: 0, writers: 0, destroy: 1 });
      expect((await instances(page))[0].error).toMatch(/fixture-required-input-(http|integrity)/);
      expect(await attemptReport(page)).toBe(false);
      await expect(page.locator('#gameCanvas')).not.toHaveAttribute('data-game-preparation', /.+/);
      await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'false');
      await cleanErrors(page, fixture.errors);
    });
  }

  for (const input of ['missing', 'duplicate', 'not-file', 'outside-root', 'disabled', 'fieldset-disabled', 'hidden', 'inert', 'covered', 'pointer-none', 'visibility-hidden', 'opacity-zero', 'offscreen', 'pre-existing'] as const) {
    test(`${input} input cannot claim preparation readiness`, async ({ page }) => {
      const fixture = await preparationFixture(page, { input });
      let index = 0;
      if (input === 'pre-existing') {
        await page.goto('/#/gacha'); await ready(page, 'gacha');
        await page.evaluate(() => { const input = document.createElement('input'); input.id = 'preexisting-files'; input.type = 'file'; document.getElementById('gameApp')!.append(input); });
        await choose(page, 'alpha'); index = 1;
      } else await page.goto('/#/alpha');
      await expect.poll(async () => (await instances(page))[index]?.checked).toBe(true);
      expect((await instances(page))[index]).toMatchObject({ capability: true, vm: 0, writers: 0 });
      expect(await page.evaluate(index => (window as any).__lifecycleProbe.controls[index].report(), index)).toBe(false);
      await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'false');
      await expect(page.locator('#gameCanvas')).not.toHaveAttribute('data-game-preparation', 'awaiting-input');
      await cleanErrors(page, fixture.errors);
    });
  }

  test('an input with pointer-events auto inside a pointer-none wrapper remains genuinely interactive', async ({ page }) => {
    const fixture = await preparationFixture(page, { input: 'parent-pointer-none' });
    await page.goto('/#/alpha');
    await expect.poll(async () => (await instances(page))[0]?.checked).toBe(true);
    const inputId = await page.evaluate(() => (window as any).__lifecycleProbe.controls[0].inputId);
    const input = page.locator(`[id=${JSON.stringify(inputId)}]`);
    await expect(input).toHaveCount(1); await expect(input).toBeVisible(); await expect(input).toBeEnabled();
    expect(await input.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { self: getComputedStyle(element).pointerEvents, parent: getComputedStyle(element.parentElement!).pointerEvents,
        hit: document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === element };
    })).toEqual({ self: 'auto', parent: 'none', hit: true });
    const accepted = await attemptReport(page);
    const choosing = page.waitForEvent('filechooser');
    await input.click();
    const chooser = await choosing;
    expect(await chooser.element().evaluate(element => element.id)).toBe(inputId);
    await chooser.setFiles([]);
    expect(accepted, 'the actual native chooser opened; ancestor pointer-none must not veto the enabled input').toBe(true);
    await assertLocalInputInteractive(page);
    expect((await instances(page))[0]).toMatchObject({ vm: 0, writers: 0 });
    expect(await page.evaluate(() => localStorage.getItem('cg-last-game'))).toBeNull();
    await cleanErrors(page, fixture.errors);
  });

  test('an explicitly visible input inside a visibility-hidden wrapper remains genuinely interactive', async ({ page }) => {
    const fixture = await preparationFixture(page, { input: 'parent-visibility-hidden' });
    await page.goto('/#/alpha');
    await expect.poll(async () => (await instances(page))[0]?.checked).toBe(true);
    const inputId = await page.evaluate(() => (window as any).__lifecycleProbe.controls[0].inputId);
    const input = page.locator(`[id=${JSON.stringify(inputId)}]`);
    await expect(input).toHaveCount(1); await expect(input).toBeVisible(); await expect(input).toBeEnabled();
    expect(await input.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { self: getComputedStyle(element).visibility, parent: getComputedStyle(element.parentElement!).visibility,
        hit: document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === element };
    })).toEqual({ self: 'visible', parent: 'hidden', hit: true });
    const accepted = await attemptReport(page);
    const choosing = page.waitForEvent('filechooser');
    await input.click(); const chooser = await choosing;
    expect(await chooser.element().evaluate(element => element.id)).toBe(inputId);
    await chooser.setFiles([]);
    expect(accepted, 'native chooser opened from the visible descendant; ancestor visibility must not veto it').toBe(true);
    await assertLocalInputInteractive(page);
    expect((await instances(page))[0]).toMatchObject({ vm: 0, writers: 0 });
    await cleanErrors(page, fixture.errors);
  });

  test('overlay and repaired input require an explicit report, never automatic readiness', async ({ page }) => {
    const fixture = await openPrepared(page, { autoReportAfterOverlay: false });
    const inputId = await page.locator('#gameCanvas').getAttribute('data-game-preparation-input');
    await page.locator('#helpBtn').click(); expect(await attemptReport(page)).toBe(false);
    await page.locator('#helpCloseBtn').click();
    await expect(page.locator('#gameCanvas')).not.toHaveAttribute('data-game-preparation', /.+/);
    expect(await attemptReport(page)).toBe(true);
    await page.locator(`[id=${JSON.stringify(inputId)}]`).evaluate((input: HTMLInputElement) => { input.disabled = true; });
    await expect(page.locator('#gameCanvas')).not.toHaveAttribute('data-game-preparation', /.+/);
    await page.locator(`[id=${JSON.stringify(inputId)}]`).evaluate((input: HTMLInputElement) => { input.disabled = false; });
    await expect(page.locator('#gameCanvas')).not.toHaveAttribute('data-game-preparation', /.+/);
    expect(await attemptReport(page)).toBe(true);
    await cleanErrors(page, fixture.errors);
  });

  for (const mutation of ['replace', 'reinsert'] as const) {
    test(`${mutation} with the same input ID cannot revive an old attempt`, async ({ page }) => {
      const fixture = await openPrepared(page);
      const accepted = await page.evaluate(mutation => { const control = (window as any).__lifecycleProbe.controls[0]; control[mutation](); return control.report(0); }, mutation);
      expect(accepted).toBe(false);
      await expect(page.locator('#gameCanvas')).not.toHaveAttribute('data-game-preparation', /.+/);
      expect(await freshReport(page)).toBe(true);
      expect(await attemptReport(page, 0)).toBe(false);
      await assertLocalInputInteractive(page);
      await cleanErrors(page, fixture.errors);
    });
  }

  test('a newer navigation fences old reports while retaining the same instance on Return', async ({ page }) => {
    const fixture = await openPrepared(page);
    let release!: () => void, requested = false;
    const held = new Promise<void>(resolve => { release = resolve; });
    await page.route(`**${fixture.game('beta').entry}`, async route => { requested = true; await held; await route.fulfill({ contentType: 'text/javascript', body: fixture.sources.get(fixture.game('beta').entry)! }); });
    try {
      await choose(page, 'beta'); await expect.poll(() => requested).toBe(true);
      expect(await attemptReport(page, 0)).toBe(false);
      await expect(page.locator('#gameCanvas')).not.toHaveAttribute('data-game-preparation', /.+/);
      await choose(page, 'alpha'); await assertLocalInputInteractive(page);
      expect(await attemptReport(page, 0)).toBe(false);
      release();
      await expect(page.locator('link[data-game-stylesheet]')).toHaveCount(1);
      expect((await instances(page)).map(item => item.id)).toEqual(['alpha']);
      expect((await instances(page))[0].destroy).toBe(0);
      await cleanErrors(page, fixture.errors);
    } finally { release(); }
  });

  test('lifecycle reports and restart invalidate receipts; failed stays latched', async ({ page }) => {
    const fixture = await openPrepared(page);
    for (const state of ['loading', 'stopped']) {
      await report(page, 0, state);
      await expect(page.locator('#gameCanvas')).not.toHaveAttribute('data-game-preparation', /.+/);
      expect(await attemptReport(page)).toBe(false);
      expect(await freshReport(page)).toBe(true);
    }
    await report(page, 0, 'running');
    await expect(page.locator('#gameCanvas')).not.toHaveAttribute('data-game-preparation', /.+/);
    expect(await attemptReport(page)).toBe(false);
    await page.locator('#overflowBtn').click(); await page.locator('#restartBtn').click();
    await assertLocalInputInteractive(page);
    expect(await attemptReport(page, 0)).toBe(false);
    await report(page, 0, 'failed'); await expect(page.locator('#loadError')).toBeVisible();
    expect(await freshReport(page)).toBe(false);
    await report(page, 0, 'running');
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'false');
    await expect(page.locator('#gameCanvas')).not.toHaveAttribute('data-game-preparation', /.+/);
    await cleanErrors(page, fixture.errors);
  });

  for (const destroy of ['held', 'reject'] as const) {
    test(`preparation cannot bypass ${destroy} destruction`, async ({ page }) => {
      const fixture = await openPrepared(page, { destroy });
      await choose(page, 'beta'); await expect.poll(async () => (await instances(page))[0]?.destroy).toBe(1);
      expect(await freshReport(page)).toBe(false); expect(await attemptReport(page, 0)).toBe(false);
      await expect(page.locator('#gameCanvas')).not.toHaveAttribute('data-game-preparation', /.+/);
      if (destroy === 'held') {
        expect(await instances(page)).toHaveLength(1);
        await settle(page); await ready(page, 'beta');
      } else {
        await expect(page.locator('#loadErrorMessage')).toContainText('could not close');
        expect(await instances(page)).toHaveLength(1);
        await choose(page, 'gacha'); await ready(page, 'gacha');
      }
      expect((await instances(page))[0].destroy).toBe(1);
      await cleanErrors(page, fixture.errors);
    });
  }

  test('a destroyed input attempt cannot set preparation state on a new instance', async ({ page }) => {
    const fixture = await preparationFixture(page);
    await page.goto('/#/alpha');
    await waitForLocalInputPresentation(page, (await releaseInputDeclaration(page, fixture.release))!);
    await choose(page, 'beta'); await ready(page, 'beta');
    const accepted = await page.evaluate(() => (window as any).__lifecycleProbe.controls[0].report(0));
    expect(accepted).toBe(false);
    await expect(page.locator('#gameCanvas')).not.toHaveAttribute('data-game-preparation-protocol', /.+/);
    await expect(page.locator('#gameCanvas')).not.toHaveAttribute('data-game-preparation', /.+/);
    await ready(page, 'beta'); await cleanErrors(page, fixture.errors);
  });
});

for (const destroy of ['held', 'foreign', 'foreign-promise'] as const) {
  test(`declared capability really awaits ${destroy} destroy before create, with synchronous revocation`, async ({ page }) => {
    const fixture = await lifecycleFixture(page, { gacha: { destroy } });
    await page.goto('/#/gacha'); await ready(page, 'gacha');
    expect((await instances(page))[0]).toMatchObject({ capability: true, protocol: 'carrick-game-lifecycle', version: 1, awaitsDestroy: true });
    await page.keyboard.press('a');
    await choose(page, 'alpha');
    await expect.poll(async () => (await instances(page))[0]?.destroy).toBe(1);
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'false');
    await expect(page.locator('#reloadAppBtn')).toBeVisible();
    await expect(page.locator('#chooseAnotherBtn')).toBeVisible();
    await expect(page.locator('#resumePreviousBtn')).toBeHidden();
    const before = (await instances(page))[0];
    expect(before.stop).toBe(1);
    if (destroy !== 'held') expect(before.nativePromise).toBe(false);
    await page.keyboard.press('a');
    await report(page, 0, 'running');
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'false');
    await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
    expect(await instances(page)).toHaveLength(1);
    expect((await instances(page))[0]).toMatchObject({ input: before.input, ticks: before.ticks, destroy: 1 });
    await expect(page.locator('link[data-game-stylesheet]')).toHaveCount(2);
    await settle(page); await ready(page, 'alpha');
    expect((await instances(page)).map(item => item.id)).toEqual(['gacha', 'alpha']);
    await expect(page.locator('link[data-game-stylesheet]')).toHaveCount(1);
    await expect(page.locator('link[data-game-stylesheet]')).toHaveAttribute('data-game-stylesheet', fixture.game('alpha').styles[0]);
    await cleanErrors(page, fixture.errors);
  });
}

for (const destroy of ['throw', 'reject', 'getter'] as const) {
  test(`destroy ${destroy} is honest failure, no Resume, and navigation recovers`, async ({ page }) => {
    const fixture = await lifecycleFixture(page, { gacha: { destroy } });
    await page.goto('/#/gacha'); await ready(page, 'gacha');
    await choose(page, 'alpha');
    await expect(page.locator('#loadErrorMessage')).toContainText('could not close');
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'false');
    await expect(page.locator('#resumePreviousBtn')).toHaveText('Restart previous game');
    await expect(page.locator('#reloadAppBtn')).toBeVisible();
    expect(await instances(page)).toHaveLength(1);
    expect((await instances(page))[0].destroy).toBe(1);
    await expect(page.locator('link[data-game-stylesheet]')).toHaveCount(0);
    await page.locator('#chooseAnotherBtn').click();
    await choose(page, 'beta'); await ready(page, 'beta');
    expect((await instances(page)).map(item => item.id)).toEqual(['gacha', 'beta']);
    await cleanErrors(page, fixture.errors);
  });
}

test('stop throw still drains held destroy once, and both failures forbid replacement', async ({ page }) => {
  const fixture = await lifecycleFixture(page, { gacha: { stopThrows: true, destroy: 'held' } });
  await page.goto('/#/gacha'); await ready(page, 'gacha');
  await choose(page, 'alpha'); await expect.poll(async () => (await instances(page))[0]?.destroy).toBe(1);
  await choose(page, 'beta'); await expect(page.locator('link[data-game-stylesheet]')).toHaveCount(3);
  expect(await instances(page)).toHaveLength(1);
  expect((await instances(page))[0]).toMatchObject({ stop: 1, destroy: 1 });
  await settle(page, 0, true);
  await expect(page.locator('#loadErrorMessage')).toContainText('could not close');
  await expect(page.locator('#resumePreviousBtn')).toHaveText('Restart previous game');
  expect(await instances(page)).toHaveLength(1);
  await page.locator('#retryLoadBtn').click(); await ready(page, 'beta');
  await cleanErrors(page, fixture.errors);
});

test('rejection settled during newer CSS preflight cannot be skipped by that intent', async ({ page }) => {
  const fixture = await lifecycleFixture(page, { gacha: { destroy: 'held' } });
  let release!: () => void, requested = false;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**${fixture.game('beta').styles[0]}`, async route => {
    requested = true; await held; await route.fulfill({ contentType: 'text/css', body: '/* held until after rejection */' });
  });
  try {
    await page.goto('/#/gacha'); await ready(page, 'gacha');
    await choose(page, 'alpha'); await expect.poll(async () => (await instances(page))[0]?.destroy).toBe(1);
    await choose(page, 'beta'); await expect.poll(() => requested).toBe(true);
    await expect(page.locator('#reloadAppBtn')).toBeVisible();
    await expect(page.locator('#chooseAnotherBtn')).toBeVisible();
    await expect(page.locator('#resumePreviousBtn')).toBeHidden();
    await expect(page.locator('link[data-game-stylesheet]')).toHaveCount(3);
    await settle(page, 0, true);
    await expect(page.locator('link[data-game-stylesheet]')).toHaveCount(1);
    release();
    await expect(page.locator('#loadErrorMessage')).toContainText('could not close');
    expect((await instances(page)).map(item => item.id)).toEqual(['gacha']);
    await expect(page.locator('link[data-game-stylesheet]')).toHaveCount(0);
    await page.locator('#retryLoadBtn').click(); await ready(page, 'beta');
    await cleanErrors(page, fixture.errors);
  } finally { release(); }
});

test('hash discovery reserves the close checkpoint before fetching its catalog', async ({ page }) => {
  const fixture = await lifecycleFixture(page, { gacha: { destroy: 'held' } });
  await page.goto('/#/gacha'); await ready(page, 'gacha');
  await choose(page, 'alpha'); await expect.poll(async () => (await instances(page))[0]?.destroy).toBe(1);
  let release!: () => void, requested = false;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/games/index.json', async route => {
    requested = true; await held; await route.fulfill({ json: fixture.catalog });
  });
  try {
    await page.evaluate(() => { location.hash = '#/beta'; });
    await expect.poll(() => requested).toBe(true);
    await settle(page, 0, true);
    await expect(page.locator('link[data-game-stylesheet]')).toHaveCount(0);
    release();
    await expect(page.locator('#loadErrorMessage')).toContainText('could not close');
    expect(await instances(page)).toHaveLength(1);
    await page.locator('#retryLoadBtn').click(); await ready(page, 'beta');
    await cleanErrors(page, fixture.errors);
  } finally { release(); }
});

test('ABA selection during close mounts only the newest intent and keeps its exact shared style lease', async ({ page }) => {
  const fixture = await lifecycleFixture(page, { gacha: { destroy: 'held' } });
  await page.goto('/#/gacha'); await ready(page, 'gacha');
  await choose(page, 'alpha'); await expect.poll(async () => (await instances(page))[0]?.destroy).toBe(1);
  await choose(page, 'beta'); await expect(page.locator('link[data-game-stylesheet]')).toHaveCount(3);
  await choose(page, 'gacha');
  // Same URL is ref-counted, not a second link or evidence of same instance.
  await expect(page.locator('link[data-game-stylesheet]')).toHaveCount(3);
  await page.locator('#siteBrand').click();
  await expect(page.locator('#gameLibrary')).toHaveClass(/open/);
  await page.locator('#searchInput').fill('alpha');
  await settle(page); await ready(page, 'gacha');
  await expect(page.locator('#gameLibrary')).toHaveClass(/open/);
  await expect(page.locator('#searchInput')).toHaveValue('alpha');
  await expect(page.locator('#searchInput')).toBeFocused();
  expect((await instances(page)).map(item => item.id)).toEqual(['gacha', 'gacha']);
  expect((await instances(page))[0].destroy).toBe(1);
  await report(page, 0, 'failed'); await report(page, 0, 'stopped');
  await ready(page, 'gacha');
  await expect(page.locator('link[data-game-stylesheet]')).toHaveCount(1);
  await expect(page.locator('link[data-game-stylesheet]')).toHaveAttribute('data-game-stylesheet', fixture.game('gacha').styles[0]);
  await cleanErrors(page, fixture.errors);
});

test('CSS preflight keeps the old paused instance resumable; cancellation cannot later close it', async ({ page }) => {
  const fixture = await lifecycleFixture(page);
  let release!: () => void, requested = false;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**${fixture.game('alpha').styles[0]}`, async route => {
    requested = true; await held;
    await route.fulfill({ contentType: 'text/css', body: '/* delayed candidate */' });
  });
  try {
    await page.goto('/#/gacha'); await ready(page, 'gacha');
    await choose(page, 'alpha'); await expect.poll(() => requested).toBe(true);
    expect((await instances(page))[0]).toMatchObject({ paused: true, destroy: 0, stop: 0 });
    await choose(page, 'gacha'); await ready(page, 'gacha');
    release();
    await expect(page.locator('link[data-game-stylesheet]')).toHaveCount(1);
    expect(await instances(page)).toHaveLength(1);
    expect((await instances(page))[0]).toMatchObject({ paused: false, destroy: 0, stop: 0 });
    await cleanErrors(page, fixture.errors);
  } finally { release(); }
});

for (const resource of ['entry', 'css'] as const) {
  test(`${resource} preflight failure keeps the old paused game honestly resumable`, async ({ page }) => {
    const fixture = await lifecycleFixture(page);
    const candidate = fixture.game('alpha');
    await page.route(`**${resource === 'entry' ? candidate.entry : candidate.styles[0]}`, route => route.abort());
    await page.goto('/#/gacha'); await ready(page, 'gacha');
    await choose(page, 'alpha');
    await expect(page.locator('#loadError')).toBeVisible();
    await expect(page.locator('#resumePreviousBtn')).toHaveText('Resume previous game');
    expect((await instances(page))[0]).toMatchObject({ destroy: 0, stop: 0, paused: true });
    await page.locator('#resumePreviousBtn').click(); await ready(page, 'gacha');
    expect((await instances(page))[0]).toMatchObject({ destroy: 0, stop: 0, paused: false });
    await expect(page.locator('link[data-game-stylesheet]')).toHaveCount(1);
    await cleanErrors(page, fixture.errors);
  });
}

for (const state of ['loading', 'stopped'] as const) {
  for (const initial of [true, false]) {
    test(`retained ${state} instance recovery preserves ${initial ? 'the initial scene' : 'the current scene instead of an older game'}`, async ({ page }) => {
      const current = initial ? 'gacha' : 'alpha', candidateId = initial ? 'alpha' : 'beta';
      const fixture = await lifecycleFixture(page, { [current]: { startReport: state } });
      const candidate = fixture.game(candidateId);
      await page.route(`**${initial ? candidate.styles[0] : candidate.entry}`, route => route.abort());
      await page.goto('/#/gacha'); await ready(page, 'gacha', !initial);
      if (!initial) { await choose(page, current); await ready(page, current, false); }
      const index = initial ? 0 : 1;
      const before = (await instances(page))[index];
      await choose(page, candidateId);
      await expect(page.locator('#loadError')).toBeVisible();
      expect((await instances(page))[index]).toMatchObject({ serial: before.serial, destroy: 0, stop: 0, paused: true });
      const recoveryLabel = await page.locator('#resumePreviousBtn').textContent();
      await page.locator('#resumePreviousBtn').click();
      await ready(page, current, false);
      expect(recoveryLabel).toBe('Return to current game');
      expect(await instances(page)).toHaveLength(index + 1);
      expect((await instances(page))[index]).toMatchObject({ serial: before.serial, prepare: 1, start: 1, destroy: 0, stop: 0, paused: false, capture: 0 });
      await expect(page.locator('link[data-game-stylesheet]')).toHaveCount(1);
      await expect(page.locator('link[data-game-stylesheet]')).toHaveAttribute('data-game-stylesheet', fixture.game(current).styles[0]);
      expect(await page.evaluate(() => localStorage.getItem('cg-last-game'))).toBe(initial ? null : 'gacha');
      await cleanErrors(page, fixture.errors);
    });
  }
}

for (const state of ['loading', 'stopped'] as const) {
  test(`current ${state} card returns to the same pinned instance even after a newer catalog release appears`, async ({ page }) => {
    const fixture = await lifecycleFixture(page, { gacha: { startReport: state } });
    await page.goto('/#/gacha'); await ready(page, 'gacha', false);
    const before = (await instances(page))[0];
    const next = fixture.game('gacha');
    next.version = '2.0.0'; next.revision = 'd'.repeat(40); next.handledRevision = next.revision;
    next.assetBase = `/games/gacha/${next.version}/${next.revision}/`;
    next.entry = `${next.assetBase}entry.js`; next.styles = [`${next.assetBase}style.css`]; next.icon = `${next.assetBase}icon.svg`;
    next.name = 'gacha updated'; next.generation++; next.sequence++;
    const fetched: string[] = [];
    await page.route(`**${next.assetBase}**`, route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('.js')) { fetched.push(path); return route.fulfill({ contentType: 'text/javascript', body: moduleSource(next, { startReport: state }) }); }
      if (path.endsWith('.css')) return route.fulfill({ contentType: 'text/css', body: '/* newer candidate */' });
      return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"/>' });
    });
    await page.locator('#siteBrand').click();
    const card = page.locator('.game-list-item[data-id="gacha"]');
    await expect(card.locator('.game-list-name')).toHaveText('gacha updated');
    const status = await card.locator('.game-list-status').textContent();
    const label = await card.getAttribute('aria-label');
    await card.click(); await ready(page, 'gacha', false);
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-version', '1.0.0');
    expect(await instances(page)).toHaveLength(1);
    expect((await instances(page))[0]).toMatchObject({ serial: before.serial, prepare: 1, start: 1, destroy: 0, stop: 0, capture: 0 });
    expect(fetched).toEqual([]);
    expect(status).toBe('Current'); expect(label).toBe('gacha updated — Return');
    await page.locator('#overflowBtn').click();
    await expect(page.locator('#updateGameBtn')).toBeVisible();
    await expect(page.locator('#updateGameBtn')).toContainText('v2.0.0');
    await page.locator('#updateGameBtn').click();
    await ready(page, 'gacha', false);
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-version', '2.0.0');
    expect(await instances(page)).toHaveLength(2);
    expect((await instances(page))[0].destroy).toBe(1);
    await cleanErrors(page, fixture.errors);
  });
}

test('live report changes refresh recovery and current-card labels without losing the retained scene', async ({ page }) => {
  const fixture = await lifecycleFixture(page);
  await page.route(`**${fixture.game('alpha').styles[0]}`, route => route.abort());
  await page.goto('/#/gacha'); await ready(page, 'gacha');
  await choose(page, 'alpha'); await expect(page.locator('#loadError')).toBeVisible();
  await expect(page.locator('#resumePreviousBtn')).toHaveText('Resume previous game');
  await report(page, 0, 'stopped');
  await expect(page.locator('#resumePreviousBtn')).toHaveText('Return to current game');
  await page.locator('#resumePreviousBtn').click(); await ready(page, 'gacha', false);
  await page.locator('#siteBrand').click();
  const card = page.locator('.game-list-item[data-id="gacha"]');
  await card.focus();
  await expect(card.locator('.game-list-status')).toHaveText('Current');
  await report(page, 0, 'running');
  await expect(card.locator('.game-list-status')).toHaveText('Playing');
  await expect(card).toBeFocused();
  await report(page, 0, 'loading');
  await expect(card.locator('.game-list-status')).toHaveText('Current');
  await expect(card).toHaveAttribute('aria-label', 'gacha — Return');
  await expect(card).toBeFocused();
  await card.click(); await ready(page, 'gacha', false);
  expect(await instances(page)).toHaveLength(1);
  expect((await instances(page))[0]).toMatchObject({ prepare: 1, start: 1, destroy: 0, stop: 0, capture: 0 });
  await cleanErrors(page, fixture.errors);
});

test('hash return to the retained stopped instance cancels candidate preflight without recreation', async ({ page }) => {
  const fixture = await lifecycleFixture(page, { gacha: { startReport: 'stopped' } });
  let release!: () => void, requested = false;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**${fixture.game('alpha').styles[0]}`, async route => {
    requested = true; await held; await route.fulfill({ contentType: 'text/css', body: '/* held candidate */' });
  });
  try {
    await page.goto('/#/gacha'); await ready(page, 'gacha', false);
    await page.evaluate(() => { location.hash = '#/alpha'; });
    await expect.poll(() => requested).toBe(true);
    await page.evaluate(() => { location.hash = '#/gacha'; });
    await ready(page, 'gacha', false);
    release();
    await expect(page.locator('link[data-game-stylesheet]')).toHaveCount(1);
    expect(await instances(page)).toHaveLength(1);
    expect((await instances(page))[0]).toMatchObject({ prepare: 1, start: 1, destroy: 0, stop: 0, capture: 0 });
    await cleanErrors(page, fixture.errors);
  } finally { release(); }
});

test('a null-target default navigation survives the older loading instance reporting failed during catalog discovery', async ({ page }) => {
  const fixture = await lifecycleFixture(page, { alpha: { startReport: 'loading' } });
  await page.goto('/#/gacha'); await ready(page, 'gacha');
  await choose(page, 'alpha'); await ready(page, 'alpha', false);
  let release!: () => void, requested = false;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/games/index.json', async route => {
    requested = true; await held; await route.fulfill({ json: fixture.catalog });
  });
  try {
    await page.evaluate(() => { location.hash = ''; });
    await expect.poll(() => requested).toBe(true);
    await report(page, 1, 'failed');
    await expect.poll(async () => (await instances(page))[1]?.destroy).toBe(1);
    release();
    await ready(page, 'gacha');
    expect((await instances(page)).map(item => item.id)).toEqual(['gacha', 'alpha', 'gacha']);
    await cleanErrors(page, fixture.errors);
  } finally { release(); }
});

test('a current async failed report revokes its owner immediately and drains cleanup before navigation', async ({ page }) => {
  const fixture = await lifecycleFixture(page, { gacha: { destroy: 'held' } });
  await page.goto('/#/gacha'); await ready(page, 'gacha');
  await report(page, 0, 'failed');
  await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'false');
  await expect(page.locator('#resumePreviousBtn')).toHaveText('Restart previous game');
  expect((await instances(page))[0]).toMatchObject({ destroy: 1, stop: 1 });
  await choose(page, 'alpha'); await expect(page.locator('link[data-game-stylesheet]')).toHaveCount(2);
  expect(await instances(page)).toHaveLength(1);
  await settle(page); await ready(page, 'alpha');
  await report(page, 0, 'failed'); await ready(page, 'alpha');
  await cleanErrors(page, fixture.errors);
});

test('legacy synchronous destroy and no reports preserve normal autoplay', async ({ page }) => {
  const fixture = await lifecycleFixture(page, { gacha: { destroy: 'legacy' } });
  await page.goto('/#/gacha'); await ready(page, 'gacha');
  await choose(page, 'alpha'); await ready(page, 'alpha');
  expect((await instances(page))[0]).toMatchObject({ destroy: 1, stop: 1 });
  await page.locator('#overflowBtn').click(); await page.locator('#restartBtn').click();
  await ready(page, 'alpha');
  await cleanErrors(page, fixture.errors);
});

for (const phase of ['create', 'prepare', 'start'] as const) {
  test(`synchronous ${phase} loading report is not overwritten by autoplay success`, async ({ page }) => {
    const fixture = await lifecycleFixture(page, { gacha: { [`${phase}Report`]: 'loading' } });
    await page.goto('/#/gacha'); await ready(page, 'gacha', false);
    expect(await page.evaluate(() => localStorage.getItem('cg-last-game'))).toBeNull();
    await report(page, 0, 'running'); await ready(page, 'gacha');
    expect(await page.evaluate(() => localStorage.getItem('cg-last-game'))).toBe('gacha');
    await report(page, 0, 'stopped'); await ready(page, 'gacha', false);
    await report(page, 0, 'running'); await ready(page, 'gacha');
    await cleanErrors(page, fixture.errors);
  });
  test(`synchronous ${phase} failed report cannot become a fake running instance`, async ({ page }) => {
    const fixture = await lifecycleFixture(page, { gacha: { [`${phase}Report`]: 'failed' } });
    await page.goto('/#/gacha');
    await expect(page.locator('#loadError')).toBeVisible();
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'false');
    expect((await instances(page))[0]).toMatchObject({ destroy: 1,
      prepare: phase === 'create' ? 0 : 1, start: phase === 'start' ? 1 : 0 });
    await choose(page, 'alpha'); await ready(page, 'alpha');
    await report(page, 0, 'running'); await report(page, 0, 'failed'); await ready(page, 'alpha');
    await cleanErrors(page, fixture.errors);
  });
}

test('an asynchronously failed loading selection never replaces the last successful preference', async ({ page }) => {
  const fixture = await lifecycleFixture(page, { alpha: { startReport: 'loading' } });
  await page.goto('/#/gacha'); await ready(page, 'gacha');
  await choose(page, 'alpha'); await ready(page, 'alpha', false);
  expect(await page.evaluate(() => localStorage.getItem('cg-last-game'))).toBe('gacha');
  await report(page, 1, 'failed');
  await expect(page.locator('#loadError')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('cg-last-game'))).toBe('gacha');
  await choose(page, 'beta'); await ready(page, 'beta');
  expect(await page.evaluate(() => localStorage.getItem('cg-last-game'))).toBe('beta');
  await cleanErrors(page, fixture.errors);
});

test('failed report is terminal even if the same synchronous start then reports running', async ({ page }) => {
  const fixture = await lifecycleFixture(page, { gacha: { startReport: ['failed', 'running'] } });
  await page.goto('/#/gacha');
  await expect.poll(async () => (await instances(page))[0]?.destroy).toBe(1);
  await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'false');
  await expect(page.locator('#loadError')).toBeVisible();
  await choose(page, 'alpha'); await ready(page, 'alpha');
  await cleanErrors(page, fixture.errors);
});

test('restart loading report remains non-running until explicit report', async ({ page }) => {
  const fixture = await lifecycleFixture(page, { gacha: { restartReport: 'loading' } });
  await page.goto('/#/gacha'); await ready(page, 'gacha');
  await page.locator('#overflowBtn').click(); await page.locator('#restartBtn').click();
  await ready(page, 'gacha', false);
  await report(page, 0, 'running'); await ready(page, 'gacha');
  await cleanErrors(page, fixture.errors);
});

for (const failAt of ['prepare', 'start', 'restart', 'demo', 'action'] as const) {
  test(`${failAt} failure awaits partial-instance cleanup before any replacement`, async ({ page }) => {
    const fixture = await lifecycleFixture(page, { gacha: { failAt, destroy: 'held' } });
    await page.goto('/#/gacha');
    if (failAt !== 'prepare' && failAt !== 'start') {
      await ready(page, 'gacha'); await page.locator('#overflowBtn').click();
      await page.locator(failAt === 'restart' ? '#restartBtn' : failAt === 'demo' ? '#demoBtn' : '[data-action-id="fixture-action"]').click();
    }
    await expect.poll(async () => (await instances(page))[0]?.destroy).toBe(1);
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'false');
    await choose(page, 'alpha'); await expect(page.locator('link[data-game-stylesheet]')).toHaveCount(2);
    expect(await instances(page)).toHaveLength(1);
    await settle(page); await ready(page, 'alpha');
    await expect(page.locator('link[data-game-stylesheet]')).toHaveCount(1);
    await report(page, 0, 'failed'); await ready(page, 'alpha');
    expect((await instances(page))[0].destroy).toBe(1);
    await cleanErrors(page, fixture.errors);
  });
}

test('late async failed report closes only its owner and preserves a newer preflight intent', async ({ page }) => {
  const fixture = await lifecycleFixture(page, { gacha: { destroy: 'held' } });
  let release!: () => void, requested = false;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**${fixture.game('alpha').styles[0]}`, async route => {
    requested = true; await held; await route.fulfill({ contentType: 'text/css', body: '/* delayed */' });
  });
  try {
    await page.goto('/#/gacha'); await ready(page, 'gacha');
    await choose(page, 'alpha'); await expect.poll(() => requested).toBe(true);
    await report(page, 0, 'failed');
    expect((await instances(page))[0].destroy).toBe(1);
    release(); await settle(page); await ready(page, 'alpha');
    await page.evaluate(() => {
      const host = (window as any).__lifecycleProbe.hosts[0];
      host.lifecycle.report('failed'); host.reportScore(777777); host.presentation.openControls();
      host.presentation.setActions([{ id: 'stale', label: 'stale', labelZh: '旧', run() {} }]);
    });
    await ready(page, 'alpha');
    await expect(page.locator('#helpOverlay')).toBeHidden();
    await expect(page.locator('[data-action-id="stale"]')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('cg-records') ?? '')).not.toContain('777777');
    await cleanErrors(page, fixture.errors);
  } finally { release(); }
});

test('same-instance trusted overlay dismissal alone can restore capture; teardown cannot', async ({ page }) => {
  const fixture = await lifecycleFixture(page, { gacha: { destroy: 'held' } });
  await page.addInitScript(() => {
    let locked: Element | null = null;
    Object.defineProperty(document, 'pointerLockElement', { get: () => locked });
    document.exitPointerLock = () => { locked = null; };
    (window as any).__fixtureCapture = () => { locked = document.getElementById('gameCanvas'); };
  });
  await page.goto('/#/gacha'); await ready(page, 'gacha');
  await page.evaluate(() => (window as any).__fixtureCapture());
  await page.locator('#helpBtn').click(); await page.locator('#helpCloseBtn').click();
  expect((await instances(page))[0].capture).toBe(1);
  await page.evaluate(() => (window as any).__fixtureCapture());
  await page.locator('#helpBtn').click(); await page.keyboard.press('Escape');
  expect((await instances(page))[0].capture).toBe(1);
  await page.evaluate(() => (window as any).__fixtureCapture());
  await choose(page, 'alpha'); await expect.poll(async () => (await instances(page))[0]?.destroy).toBe(1);
  await page.locator('#siteBrand').click(); await page.locator('#libraryCloseBtn').click();
  await settle(page); await ready(page, 'alpha');
  expect((await instances(page)).map(item => item.capture)).toEqual([1, 0]);
  await cleanErrors(page, fixture.errors);
});

test('API-1 metadata cannot preflight capability: a future adapter must fail closed before acquiring resources', async ({ page }) => {
  const fixture = await lifecycleFixture(page, { alpha: { requireCapability: true } });
  await page.goto('/#/gacha'); await ready(page, 'gacha');
  expect(fixture.game('alpha').apiVersion).toBe(1);
  const result = await page.evaluate(async ({ entry, capabilityUrl }) => {
    const { hasGameLifecycle } = await import(capabilityUrl);
    const { create } = await import(entry);
    const current = (window as any).__lifecycleProbe.hosts[0];
    const oldHost = { ...current, lifecycle: undefined };
    const before = (window as any).__lifecycleProbe.instances.length;
    const refused = create(oldHost); // Old Shell may still get this far.
    const notice = document.querySelector('[data-lifecycle-compatibility]')?.textContent;
    const item = (window as any).__lifecycleProbe.instances.at(-1);
    const destroyReturn = refused.destroy();
    return { oldAccepted: hasGameLifecycle(oldHost), before, created: (window as any).__lifecycleProbe.instances.length,
      writers: item.writers, notice, synchronous: destroyReturn === undefined };
  }, { entry: fixture.game('alpha').entry, capabilityUrl: publicCapabilityUrl });
  expect(result).toMatchObject({ oldAccepted: false, before: 1, created: 2, writers: 0, synchronous: true });
  expect(result.notice).toContain('Reload Carrick Games');
  await cleanErrors(page, fixture.errors);
});


async function expectCurrentCard(page: Page, id: string | null, running = false) {
  const current = page.locator('.game-list-item[aria-current="true"]');
  await expect(current).toHaveCount(id === null ? 0 : 1);
  await expect(page.locator('.game-list-item.active')).toHaveCount(id === null ? 0 : 1);
  await expect(page.locator('.game-list-status')).toHaveCount(id === null ? 0 : 1);
  if (id !== null) {
    await expect(current).toHaveAttribute('data-id', id);
    await expect(current).toHaveClass(/active/);
    await expect(current).toHaveAttribute('aria-label', `${id} — ${running ? 'Continue' : 'Return'}`);
    await expect(current.locator('.game-list-status')).toHaveText(running ? 'Playing' : 'Current');
  }
}

test('closed-library failure has no current card after reopening the chooser', async ({ page }) => {
  const fixture = await lifecycleFixture(page, { alpha: { startReport: 'loading' } });
  await page.goto('/#/gacha'); await ready(page, 'gacha');
  await page.locator('#siteBrand').click();
  await expectCurrentCard(page, 'gacha', true);
  await page.locator('.game-list-item[data-id="alpha"]').click(); await ready(page, 'alpha', false);
  await expect(page.locator('#gameLibrary')).not.toHaveClass(/open/);
  await report(page, 1, 'failed');
  await expect(page.locator('#loadError')).toBeVisible();
  await expect.poll(async () => (await instances(page))[1]?.destroy).toBe(1);
  await page.locator('#chooseAnotherBtn').click();
  await expect(page.locator('#gameLibrary')).toHaveClass(/open/);
  await expectCurrentCard(page, null);
  await expect(page.locator('.game-list-item[data-id="alpha"]')).toHaveAttribute('aria-label', 'alpha — Play');
  await cleanErrors(page, fixture.errors);
});

test('hidden and visible cards have one renderer-owned current state through lifecycle transitions', async ({ page }) => {
  const fixture = await lifecycleFixture(page, { alpha: { startReport: 'loading' } });
  await page.goto('/#/gacha'); await ready(page, 'gacha');
  await expectCurrentCard(page, 'gacha', true);
  await choose(page, 'alpha'); await ready(page, 'alpha', false);
  await expectCurrentCard(page, 'alpha');
  await report(page, 1, 'stopped'); await expectCurrentCard(page, 'alpha');
  await report(page, 1, 'running'); await expectCurrentCard(page, 'alpha', true);
  await page.locator('#siteBrand').click();
  await expectCurrentCard(page, 'alpha', true);
  await report(page, 1, 'loading'); await expectCurrentCard(page, 'alpha');
  await page.locator('.game-list-item[data-id="beta"]').click(); await ready(page, 'beta');
  await expectCurrentCard(page, 'beta', true);
  await report(page, 1, 'running'); await report(page, 1, 'failed');
  await expectCurrentCard(page, 'beta', true);
  await report(page, 2, 'failed');
  await expect(page.locator('#loadError')).toBeVisible();
  await expectCurrentCard(page, null);
  await page.locator('#chooseAnotherBtn').click(); await expectCurrentCard(page, null);
  await choose(page, 'gacha'); await ready(page, 'gacha');
  await expectCurrentCard(page, 'gacha', true);
  await cleanErrors(page, fixture.errors);
});

test('hidden lifecycle renders retain chooser query, scroll and real artwork readiness', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 640 });
  const fixture = await lifecycleFixture(page, { parking: { startReport: 'loading' } }, scrollingFixtureIds);
  await page.goto('/#/gacha'); await ready(page, 'gacha');
  await page.locator('#siteBrand').click();
  await page.locator('#searchInput').fill('fixture');
  await page.locator('[data-category="casual"]').click();
  const card = page.locator('.game-list-item[data-id="parking"]');
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator('.asset-game-icon')).toHaveAttribute('data-image-ready', 'true');
  const original = (await card.elementHandle())!, artwork = (await card.locator('.game-icon-image').elementHandle())!;
  const scroll = await page.locator('#gameList').evaluate(element => element.scrollTop);
  expect(scroll).toBeGreaterThan(0);
  await card.click(); await ready(page, 'parking', false);
  await expectCurrentCard(page, 'parking');
  await report(page, 1, 'stopped'); await expectCurrentCard(page, 'parking');
  await report(page, 1, 'loading'); await expectCurrentCard(page, 'parking');
  await page.locator('#siteBrand').click();
  await expect(page.locator('#searchInput')).toHaveValue('fixture');
  await expect(page.locator('[data-category="casual"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.locator('#gameList').evaluate(element => element.scrollTop)).toBe(scroll);
  expect(await original.evaluate(element => element.isConnected)).toBe(true);
  expect(await artwork.evaluate(element => element.isConnected && !(element as HTMLImageElement).hidden)).toBe(true);
  await expect(card.locator('.asset-game-icon')).toHaveAttribute('data-image-ready', 'true');
  await expectCurrentCard(page, 'parking');
  await cleanErrors(page, fixture.errors);
});

// Keep the exact locator.scrollIntoViewIfNeeded action used by the shared
// gameplay/gameover/mobile tests. A fixture-only moving target holds its stable
// check open across an explicitly released update, not a timing retry or sleep.
async function scrollAcrossUpdate(page: Page, id: string, update: () => Promise<void>) {
  const selector = `.game-list-item[data-id="${id}"]`;
  const card = page.locator(selector), original = (await card.elementHandle())!;
  const animation = await page.addStyleTag({ content: `
    @keyframes fixture-scroll-stability { from { transform: translateX(0); } to { transform: translateX(24px); } }
    ${selector} { animation: fixture-scroll-stability 300ms linear infinite !important; }
  ` });
  expect(await card.evaluate(async element => {
    await Promise.all(element.getAnimations().map(animation => animation.ready));
    const before = element.getBoundingClientRect().x;
    await new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done())));
    return element.getBoundingClientRect().x !== before;
  }), 'fixture movement must be active before starting the native stable check').toBe(true);
  let settled = false;
  const scrolling = card.scrollIntoViewIfNeeded().then(() => null, error => String(error)).finally(() => { settled = true; });
  let result: string | null = null;
  try {
    // The native action remains in its stable-element check while the target
    // visibly moves for eight frames. The update then happens inside that action.
    await page.evaluate(async () => {
      for (let i = 0; i < 8; i++) await new Promise<void>(done => requestAnimationFrame(() => done()));
    });
    expect(settled, 'the real scroll action must still be in progress at update time').toBe(false);
    await update();
  } finally {
    await animation.evaluate(element => element.remove());
    result = await scrolling;
  }
  expect(result, 'catalog/lifecycle updates must not detach the active native scroll target').toBeNull();
  expect(await original.evaluate(element => element.isConnected && element === document.querySelector(`.game-list-item[data-id="${element.getAttribute('data-id')}"]`))).toBe(true);
  await expect(card).toBeInViewport();
}

const scrollingFixtureIds = ['gacha', ...Array.from({ length: 16 }, (_, i) => `fixture-${i}`), 'parking'];

test.describe('stable catalog DOM during native card scrolling', () => {
  test.use({ viewport: { width: 390, height: 640 } });

  test('held default import completes legacy start while another card is scrolling', async ({ page }) => {
    const fixture = await lifecycleFixture(page, {}, scrollingFixtureIds);
    let release!: () => void, requested = false;
    const held = new Promise<void>(resolve => { release = resolve; });
    await page.route(`**${fixture.game('gacha').entry}`, async route => {
      requested = true; await held;
      await route.fulfill({ contentType: 'text/javascript', body: fixture.sources.get(fixture.game('gacha').entry)! });
    });
    try {
      await page.goto('/'); await expect.poll(() => requested).toBe(true);
      await page.keyboard.press('Control+k');
      await expect(page.locator('.game-list-item')).toHaveCount(scrollingFixtureIds.length);
      expect(await page.locator('#gameList').evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
      expect(await instances(page)).toHaveLength(0);
      await scrollAcrossUpdate(page, 'parking', async () => {
        release(); await ready(page, 'gacha');
        await expect(page.locator('.game-list-item[data-id="gacha"] .game-list-status')).toHaveText('Playing');
      });
      await expect(page.locator('#gameLibrary')).toHaveClass(/open/);
      await page.locator('.game-list-item[data-id="parking"]').click(); await ready(page, 'parking');
      expect((await instances(page)).map(item => item.id)).toEqual(['gacha', 'parking']);
      await cleanErrors(page, fixture.errors);
    } finally { release(); }
  });

  test('current lifecycle report updates its label without replacing the unrelated scrolling card', async ({ page }) => {
    const fixture = await lifecycleFixture(page, { gacha: { startReport: 'loading' } }, scrollingFixtureIds);
    await page.goto('/'); await ready(page, 'gacha', false);
    await page.keyboard.press('Control+k');
    expect(await page.locator('#gameList').evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    await scrollAcrossUpdate(page, 'parking', async () => {
      await report(page, 0, 'running');
      await expect(page.locator('.game-list-item[data-id="gacha"] .game-list-status')).toHaveText('Playing');
    });
    await page.locator('.game-list-item[data-id="parking"]').click(); await ready(page, 'parking');
    await cleanErrors(page, fixture.errors);
  });

  for (const changedId of ['gacha', 'parking']) {
    test(`held catalog changes ${changedId} copy visibly while parking scroll keeps its native target`, async ({ page }) => {
      const fixture = await lifecycleFixture(page, {}, scrollingFixtureIds);
      await page.goto('/'); await ready(page, 'gacha');
      let release!: () => void, requested = false;
      const held = new Promise<void>(resolve => { release = resolve; });
      await page.route('**/games/index.json', async route => {
        requested = true; await held; await route.fulfill({ json: fixture.catalog });
      });
      try {
        await page.keyboard.press('Control+k'); await expect.poll(() => requested).toBe(true);
        const changed = fixture.game(changedId);
        changed.name = `${changedId} refreshed`;
        changed.desc = 'Lifecycle fixture refreshed description';
        await scrollAcrossUpdate(page, 'parking', async () => {
          release();
          await expect(page.locator(`.game-list-item[data-id="${changedId}"] .game-list-name`)).toHaveText(changed.name);
          await expect(page.locator(`.game-list-item[data-id="${changedId}"] .game-list-desc`)).toHaveText(changed.desc);
        });
        expect((await instances(page))[0]).toMatchObject({ id: 'gacha', prepare: 1, start: 1, destroy: 0, paused: true });
        await page.locator('.game-list-item[data-id="parking"]').click(); await ready(page, 'parking');
        await expect(page.locator('#selectedGameLabel')).toHaveText(fixture.game('parking').name);
        await cleanErrors(page, fixture.errors);
      } finally { release(); }
    });
  }

  test('the current scrolling card updates in place and retains failed artwork until its source changes', async ({ page }) => {
    const fixture = await lifecycleFixture(page, { gacha: { startReport: 'loading' } }, scrollingFixtureIds);
    const current = fixture.game('gacha'); current.order = 100;
    current.cover = { src: `${current.assetBase}failed.svg`, width: 640, height: 400 };
    await page.route(`**${current.cover.src}`, route => route.abort());
    await page.goto('/'); await ready(page, 'gacha', false);
    await page.keyboard.press('Control+k');
    const card = page.locator('.game-list-item[data-id="gacha"]');
    await card.scrollIntoViewIfNeeded();
    await expect(card.locator('.game-list-cover')).toHaveAttribute('data-image-ready', 'false');
    const original = (await card.elementHandle())!, artwork = (await card.locator('.game-cover-image').elementHandle())!;
    await page.locator('#gameList').evaluate(element => { element.scrollTop = 0; });
    await scrollAcrossUpdate(page, 'gacha', async () => {
      await report(page, 0, 'running');
      await expect(card.locator('.game-list-status')).toHaveText('Playing');
    });
    expect(await artwork.evaluate(element => element.isConnected && (element as HTMLImageElement).hidden)).toBe(true);
    await expect(card.locator('.game-list-cover')).toHaveAttribute('data-image-ready', 'false');
    await card.click(); await ready(page, 'gacha');
    expect(await instances(page)).toHaveLength(1);
    current.cover.src = `${current.assetBase}recovered.svg`;
    await page.keyboard.press('Control+k');
    await expect(card.locator('.game-cover-image')).toHaveAttribute('src', new URL(current.cover.src, page.url()).href);
    await card.scrollIntoViewIfNeeded();
    await expect(card.locator('.game-list-cover')).toHaveAttribute('data-image-ready', 'true');
    expect(await original.evaluate(element => element.isConnected)).toBe(true);
    expect(await artwork.evaluate(element => element.isConnected)).toBe(false);
    await expect(card.locator('.game-cover-image')).toBeVisible();
    expect((await instances(page))[0]).toMatchObject({ prepare: 1, start: 1, destroy: 0 });
    await cleanErrors(page, fixture.errors);
  });

  test('real catalog removals, ordering and empty results preserve surviving cards, query, focus and scroll', async ({ page }) => {
    const fixture = await lifecycleFixture(page, {}, scrollingFixtureIds);
    await page.goto('/'); await ready(page, 'gacha');
    await page.keyboard.press('Control+k');
    await page.locator('#searchInput').fill('fixture');
    await page.locator('[data-category="casual"]').click();
    const card = page.locator('.game-list-item[data-id="parking"]');
    await card.scrollIntoViewIfNeeded();
    const original = (await card.elementHandle())!;
    const unchanged = (await page.locator('.game-list-item[data-id="fixture-12"]').elementHandle())!;
    await page.locator('#libraryCloseBtn').click();
    let release!: () => void, requested = false;
    const held = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/games/index.json', async route => {
      requested = true; await held; await route.fulfill({ json: fixture.catalog });
    });
    try {
      await page.keyboard.press('Control+k'); await expect.poll(() => requested).toBe(true);
      await card.focus();
      const scroll = await page.locator('#gameList').evaluate(element => element.scrollTop);
      expect(scroll).toBeGreaterThan(0);
      await page.locator('#gameList').evaluate(element => {
        const removed: string[] = [];
        (window as any).__catalogRemovedTargets = removed;
        new MutationObserver(records => {
          for (const record of records) for (const node of record.removedNodes) {
            if (node instanceof HTMLElement && ['parking', 'fixture-12'].includes(node.dataset.id ?? '')) removed.push(node.dataset.id!);
          }
        }).observe(element, { childList: true });
      });
      fixture.catalog.games = fixture.catalog.games.filter(game => game.id !== 'fixture-0');
      const added = { ...fixture.game('fixture-1'), id: 'added', order: 18, name: 'Added fixture', nameZh: '新增测试', assetBase: `/games/added/1.0.0/${'c'.repeat(40)}/` };
      added.entry = `${added.assetBase}entry.js`; added.icon = `${added.assetBase}icon.svg`; added.styles = [];
      fixture.catalog.games.push(added); fixture.sources.set(added.entry, moduleSource(added));
      fixture.game('fixture-2').order = 0;
      fixture.game('gacha').order = 1;
      fixture.game('parking').name = 'Parking revised';
      release();
      await expect(card.locator('.game-list-name')).toHaveText('Parking revised');
      await expect(page.locator('.game-list-item[data-id="fixture-0"]')).toHaveCount(0);
      await expect(page.locator('.game-list-item[data-id="added"]')).toBeAttached();
      await expect(page.locator('.game-list-item').first()).toHaveAttribute('data-id', 'fixture-2');
      expect(await original.evaluate(element => element.isConnected)).toBe(true);
      expect(await unchanged.evaluate(element => element.isConnected)).toBe(true);
      expect(await page.evaluate(() => (window as any).__catalogRemovedTargets)).toEqual([]);
      await expect(card).toBeFocused();
      await expect(page.locator('#searchInput')).toHaveValue('fixture');
      await expect(page.locator('[data-category="casual"]')).toHaveAttribute('aria-pressed', 'true');
      expect(await page.locator('#gameList').evaluate(element => element.scrollTop)).toBe(scroll);
      await page.locator('#searchInput').fill('no-matches-anywhere');
      await expect(page.locator('.game-list-item')).toHaveCount(0);
      await expect(page.locator('[data-clear-search]')).toBeVisible();
      await page.locator('[data-clear-search]').click();
      await expect(page.locator('.game-list-item')).toHaveCount(scrollingFixtureIds.length);
      await expect(page.locator('#searchInput')).toHaveValue('');
      await expect(page.locator('#searchInput')).toBeFocused();
      await cleanErrors(page, fixture.errors);
    } finally { release(); }
  });
});
