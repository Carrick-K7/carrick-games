import { expect, test } from '@playwright/test';
import { choose, cleanErrors, instances, lifecycleFixture, moduleSource, publicCapabilityUrl, ready, report, settle } from '../apps/shell/tests/lifecycle-fixture';

// These are generic synthetic API-1 modules, not native/game implementations.
// Root placement intentionally enters the real pinned-games Shell CI cell.
test.afterEach(async ({ page }) => {
  await page.evaluate(() => {
    for (const control of (window as any).__lifecycleProbe?.controls ?? []) control.resolve?.();
  }).catch(() => undefined); // Page may already be closed by a failed navigation.
  await page.unrouteAll({ behavior: 'wait' });
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
