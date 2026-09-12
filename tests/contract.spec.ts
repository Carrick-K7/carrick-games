import { expect, test, type Page } from '@playwright/test';
import { builtCatalog } from './support/releases';
import type { GameCatalog, GameRelease } from '../packages/game-sdk/src/catalog';

const published = builtCatalog();
const target = process.env.GAME_ID;
const candidates = target && target !== 'shell' ? published.games.filter(game => game.id === target) : published.games;
if (!candidates.length) throw new Error(`No built candidate for GAME_ID=${target ?? '(all)'}`);

async function ready(page: Page, id: string) {
  const canvas = page.locator('#gameCanvas');
  await expect(canvas).toHaveAttribute('data-game-id', id, { timeout: 45_000 });
  await expect(canvas).toHaveAttribute('data-game-running', 'true', { timeout: 45_000 });
  await expect(page.locator('#loadingOverlay')).not.toHaveClass(/active/);
}
async function choose(page: Page, id: string) {
  if (!(await page.locator('#gameLibrary').getAttribute('class'))?.includes('open')) await page.locator('#siteBrand').click();
  await page.locator(`.game-list-item[data-id="${id}"]`).click();
}

for (const release of candidates) {
  test(`release ${release.id}: starts directly with owned resources and stable resize`, async ({ page }) => {
    test.setTimeout(60_000);
    const errors: string[] = [], failures: string[] = [], resources: string[] = [];
    const catalogArt = new Set(published.games.flatMap(game => [game.icon, game.cover?.src].filter((value): value is string => !!value)));
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      const path = new URL(response.url()).pathname;
      if (response.status() >= 400 && !path.endsWith('/favicon.ico')) failures.push(`${response.status()} ${path}`);
    });
    page.on('request', request => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith('/games/') && path !== '/games/index.json' && !catalogArt.has(path)) resources.push(path);
      if (path.startsWith('/cs/') || path.startsWith('/gacha/')) failures.push(`Legacy game asset path: ${path}`);
    });
    await page.goto(`/#/${release.id}`);
    await ready(page, release.id);
    const canvas = page.locator('#gameCanvas');
    await expect(canvas).toHaveAttribute('data-game-version', release.version);
    await expect(canvas).toHaveAttribute('data-game-revision', release.revision);
    await expect(canvas).toHaveAttribute('data-game-asset-base', release.assetBase);
    const prepareCount = await canvas.getAttribute('data-game-prepare-count');
    const styles = await page.locator('link[data-game-stylesheet]').evaluateAll(elements => elements.map(element => new URL((element as HTMLLinkElement).href).pathname).sort());
    expect(styles).toEqual([...release.styles].sort());
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(canvas).toHaveAttribute('data-game-prepare-count', prepareCount!);
    await page.locator('#helpBtn').click();
    await expect(canvas).toHaveAttribute('data-game-presentation', 'paused');
    await page.keyboard.press('Escape');
    await expect(canvas).toHaveAttribute('data-game-presentation', 'active');
    await expect(canvas).toHaveAttribute('data-game-prepare-count', prepareCount!);
    expect(resources).toContain(release.entry);
    expect(resources.filter(path => !path.startsWith(release.assetBase))).toEqual([]);
    expect(errors).toEqual([]);
    expect(failures).toEqual([]);
  });
}

// Fault injection belongs to the shell cell, not every independently released game.
if (!target || target === 'shell') {
  interface ProbeInstance { serial: number; id: string; prepared: number; started: number; destroyed: boolean; paused: boolean; manual: boolean }
  interface Probe { instances: ProbeInstance[]; hosts: unknown[]; serial: number }
  async function probe(page: Page): Promise<ProbeInstance[]> {
    return page.evaluate(() => (window as unknown as { __releaseProbe: Probe }).__releaseProbe.instances);
  }
  function moduleSource(release: GameRelease, fail?: 'create' | 'prepare' | 'start' | 'restart' | 'demo' | 'action', api = 1) {
    return `
      export const apiVersion = ${api};
      export const id = ${JSON.stringify(release.id)};
      export const version = ${JSON.stringify(release.version)};
      const probe = window.__releaseProbe ||= { instances: [], hosts: [], serial: 0, modules: [] };
      probe.modules.push(id + '@' + version);
      export function create(host) {
        const item = { id, serial: ++probe.serial, prepared: 0, started: 0, destroyed: false, paused: false, manual: false };
        probe.instances.push(item); probe.hosts.push(host);
        const publish = () => host.presentation?.setActions?.([{ id: 'probe-' + id, label: 'Action ' + id, labelZh: '操作 ' + id, checked: item.manual, run() { if (${JSON.stringify(fail)} === 'action') throw new Error('Injected action failure'); item.manual = !item.manual; publish(); } }]);
        publish();
        if (${JSON.stringify(fail)} === 'create') throw new Error('Injected constructor failure');
        const canvas = host.canvas, ctx = canvas.getContext('2d');
        const paint = () => { ctx.fillStyle = '#287c68'; ctx.fillRect(0, 0, canvas.width, canvas.height); };
        return {
          width: host.logicalWidth, height: host.logicalHeight,
          init() {}, update() {}, draw: paint, renderFrame: paint, handleInput() {},
          prepare() { item.prepared++; canvas.dataset.gamePrepareCount = String(item.prepared); if (${JSON.stringify(fail)} === 'prepare') throw new Error('Injected prepare failure'); paint(); },
          start() { item.started++; if (${JSON.stringify(fail)} === 'start') throw new Error('Injected start failure'); },
          restart() { if (${JSON.stringify(fail)} === 'restart') throw new Error('Injected restart failure'); item.prepared++; item.started++; },
          startDemo() { if (${JSON.stringify(fail)} === 'demo') throw new Error('Injected demo failure'); this.start(); }, stop() {},
          destroy() { item.destroyed = true; },
          setDisplayScale(width) { canvas.style.width = width + 'px'; canvas.style.height = width * host.logicalHeight / host.logicalWidth + 'px'; },
          setViewport(viewport) { this.setDisplayScale(Math.min(viewport.width, viewport.height * host.logicalWidth / host.logicalHeight)); },
          setPresentationPaused(paused) { item.paused = paused; canvas.dataset.gamePresentation = paused ? 'paused' : 'active'; },
          onShellOverlayChange() {},
          getShellSnapshot() { return { score: 0 }; }, getFrameTelemetry() { return null; }
        };
      }
    `;
  }
  async function fixture(page: Page) {
    const ids = ['gacha', 'snake', 'breakout'];
    // Synthetic API-1 metadata keeps shell recovery tests independent of which
    // real games happen to be published (or retired) alongside this shell.
    const revision = 'a'.repeat(40);
    const catalog: GameCatalog = { schemaVersion: 1, apiVersion: 1, generation: 0, games: ids.map((id, order) => {
      const assetBase = `/games/${id}/1.0.0/${revision}/`;
      return {
        id, order, group: 'casual', name: id, nameZh: `${id}中文`, desc: 'Fixture game', descZh: '测试游戏',
        canvasSize: { width: 400, height: 500 }, icon: `${assetBase}icon.svg`,
        controls: { keyboard: [{ keys: ['Space'], action: 'Restart', actionZh: '重新开始' }], touch: [{ icon: 'tap', action: 'Tap', actionZh: '轻点' }] },
        apiVersion: 1, version: '1.0.0', revision, assetBase, entry: `${assetBase}entry.js`, styles: [],
        generation: 0, sequence: 0, handledRevision: revision,
      };
    }) };
    const sources = new Map(catalog.games.map(game => [game.entry, moduleSource(game)]));
    await page.addInitScript(() => localStorage.setItem('cg-lang', 'en'));
    await page.route('**/games/index.json', route => route.fulfill({ json: catalog }));
    await page.route(`**/${revision}/icon.svg`, route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16"/></svg>' }));
    await page.route('**/games/**/entry.js*', route => {
      const body = sources.get(new URL(route.request().url()).pathname);
      return body === undefined ? route.continue() : route.fulfill({ contentType: 'text/javascript', body });
    });
    return { catalog, sources, game: (id: string) => catalog.games.find(game => game.id === id)! };
  }

  test('routing prefers an explicit link, then last successful game, then Gacha', async ({ page }) => {
    await fixture(page);
    await page.goto('/'); await ready(page, 'gacha');
    await choose(page, 'snake'); await ready(page, 'snake');
    // A query change forces a new document. A hash-only goto is deliberately a
    // same-document switch, where a previous live instance must be retained.
    await page.goto('/?visit=remembered'); await ready(page, 'snake');
    await page.goto('/?visit=explicit#/breakout'); await ready(page, 'breakout');
    await page.goto('/?visit=legacy#snake'); await ready(page, 'snake');
    await page.evaluate(() => localStorage.setItem('cg-last-game', 'removed'));
    await page.goto('/?visit=fallback'); await ready(page, 'gacha');
    await page.goto('/?visit=missing#/missing');
    await expect(page.locator('#loadError')).toBeVisible();
    await expect(page.locator('#gameCanvas')).not.toHaveAttribute('data-game-running', 'true');
    await page.locator('#chooseAnotherBtn').click();
    await choose(page, 'snake'); await ready(page, 'snake');
  });

  test('successful URL commits preserve real browser back and forward navigation', async ({ page }) => {
    await fixture(page);
    await page.goto('/?history=1'); await ready(page, 'gacha');
    await choose(page, 'snake'); await ready(page, 'snake');
    await page.goBack(); await ready(page, 'gacha');
    await page.goForward(); await ready(page, 'snake');
    expect((await probe(page)).map(item => item.id)).toEqual(['gacha', 'snake', 'gacha', 'snake']);
  });

  test('a hash changed during initial discovery mounts only the latest requested game', async ({ page }) => {
    const setup = await fixture(page);
    let release!: () => void, requests = 0;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/games/index.json', async route => { requests++; await gate; await route.fulfill({ json: setup.catalog }); });
    try {
      await page.goto('/#/gacha');
      await expect.poll(() => requests).toBe(1);
      await page.evaluate(async () => {
        const changed = new Promise(resolve => window.addEventListener('hashchange', resolve, { once: true }));
        location.hash = '#/snake'; await changed;
      });
      release(); await ready(page, 'snake');
      expect((await probe(page)).map(item => item.id)).toEqual(['snake']);
    } finally { release(); }
  });

  test('a delayed hash discovery cannot undo a newer library card selection', async ({ page }) => {
    const setup = await fixture(page);
    await page.goto('/#/gacha'); await ready(page, 'gacha');
    let release!: () => void, requests = 0;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const future = setup.game('breakout');
    future.version = '2.0.0'; future.revision = 'b'.repeat(40);
    future.assetBase = `/games/breakout/${future.version}/${future.revision}/`;
    future.entry = `${future.assetBase}entry.js`; future.icon = `${future.assetBase}icon.svg`;
    await page.route('**/games/index.json', async route => { requests++; await gate; await route.fulfill({ json: setup.catalog }); });
    try {
      await page.evaluate(() => { location.hash = '#/snake'; });
      await expect.poll(() => requests).toBe(1);
      await choose(page, 'breakout'); await ready(page, 'breakout');
      release();
      // This public UI marker is rendered only after discovery settles. Do not
      // assume application-build JS exposes source-module exports to tests.
      await expect(page.locator('#updateGameBtn')).toContainText('v2.0.0');
      await ready(page, 'breakout');
      expect((await probe(page)).map(item => item.id)).toEqual(['gacha', 'breakout']);
    } finally { release(); }
  });

  for (const failure of ['restart', 'demo', 'action'] as const) {
    test(`${failure} exceptions discard partial state and expose an honest fresh restart`, async ({ page }) => {
      const setup = await fixture(page), game = setup.game('gacha');
      setup.sources.set(game.entry, moduleSource(game, failure));
      await page.goto('/#/gacha'); await ready(page, 'gacha');
      await page.locator('#overflowBtn').click();
      await page.locator(failure === 'action' ? '[data-action-id="probe-gacha"]' : failure === 'demo' ? '#demoBtn' : '#restartBtn').click();
      await expect(page.locator('#loadError')).toBeVisible();
      await expect(page.locator('#resumePreviousBtn')).toHaveText('Restart previous game');
      await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'false');
      expect((await probe(page))[0].destroyed).toBe(true);
      await page.locator('#resumePreviousBtn').click(); await ready(page, 'gacha');
      expect((await probe(page))[1]).toMatchObject({ destroyed: false, prepared: 1, started: 1 });
    });
  }

  test('poisoned module dependencies exhaust bounded retries without losing the intact previous game', async ({ page }) => {
    const setup = await fixture(page), snake = setup.game('snake');
    setup.sources.set(snake.entry, `import './broken.js';\n${moduleSource(snake)}`);
    await page.route(`**${snake.assetBase}broken.js`, route => route.abort());
    const entries: string[] = [];
    page.on('request', request => { if (new URL(request.url()).pathname === snake.entry) entries.push(request.url()); });
    await page.goto('/#/gacha'); await ready(page, 'gacha');
    await choose(page, 'snake');
    await expect(page.locator('#loadError')).toBeVisible();
    for (let i = 0; i < 2; i++) {
      await page.locator('#retryLoadBtn').click();
      await expect(page.locator('#loadError')).toBeVisible();
    }
    await expect(page.locator('#retryLoadBtn')).toBeDisabled();
    await expect(page.locator('#loadErrorMessage')).toContainText('Reload the application');
    expect(entries).toHaveLength(3);
    expect(new Set(entries).size).toBe(3);
    await page.locator('#resumePreviousBtn').click(); await ready(page, 'gacha');
    expect(await probe(page)).toEqual([expect.objectContaining({ id: 'gacha', prepared: 1, started: 1, destroyed: false })]);
  });

  test('retry is local and stylesheet failure leaves the original paused session intact', async ({ page }) => {
    const setup = await fixture(page), snake = setup.game('snake');
    snake.styles = [`${snake.assetBase}delayed.css`];
    let fail = true;
    await page.route('**/delayed.css', route => fail ? route.abort('failed') : route.fulfill({ contentType: 'text/css', body: '.probe { color: teal; }' }));
    await page.goto('/#/gacha'); await ready(page, 'gacha');
    const original = (await probe(page))[0];
    await choose(page, 'snake');
    await expect(page.locator('#loadError')).toBeVisible();
    expect((await probe(page))[0]).toMatchObject({ serial: original.serial, destroyed: false, paused: true, started: 1 });
    await expect(page.locator('#resumePreviousBtn')).toHaveText('Resume previous game');
    await page.locator('#resumePreviousBtn').click();
    expect((await probe(page))[0]).toMatchObject({ destroyed: false, paused: false, started: 1 });
    await choose(page, 'snake'); await expect(page.locator('#loadError')).toBeVisible();
    fail = false;
    await page.locator('#retryLoadBtn').click(); await ready(page, 'snake');
    expect((await probe(page))[0]).toMatchObject({ serial: original.serial, destroyed: true });
    expect(await probe(page)).toHaveLength(2); // A full page reload would have reset the probe.
    expect(await page.locator('link[data-game-stylesheet]').count()).toBe(1);
  });

  for (const fail of ['create', 'prepare', 'start'] as const) {
    test(`${fail} failure after teardown offers restart, never a fictitious session resume`, async ({ page }) => {
      const setup = await fixture(page), snake = setup.game('snake');
      setup.sources.set(snake.entry, moduleSource(snake, fail));
      await page.goto('/#/gacha'); await ready(page, 'gacha');
      await choose(page, 'snake');
      await expect(page.locator('#loadError')).toBeVisible();
      await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'false');
      expect((await probe(page))[0].destroyed).toBe(true);
      await expect(page.locator('#resumePreviousBtn')).toHaveText('Restart previous game');
      await page.locator('#resumePreviousBtn').click(); await ready(page, 'gacha');
      const instances = await probe(page);
      expect(instances.filter(instance => instance.id === 'gacha')).toHaveLength(2);
      expect(instances.at(-1)).toMatchObject({ id: 'gacha', prepared: 1, started: 1, destroyed: false });
    });
  }

  test('late preflight completion cannot replace the newer game or steal focus', async ({ page }) => {
    const setup = await fixture(page), snake = setup.game('snake');
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route(`**${snake.entry}`, async route => { await gate; await route.fulfill({ contentType: 'text/javascript', body: moduleSource(snake) }); });
    try {
      await page.goto('/#/gacha'); await ready(page, 'gacha');
      await choose(page, 'snake');
      await expect(page.locator('#loadingOverlay')).toHaveClass(/active/);
      await choose(page, 'breakout'); await ready(page, 'breakout');
      await page.locator('#overflowBtn').click();
      release();
      await expect.poll(() => page.evaluate(() => (window as unknown as { __releaseProbe: { modules: string[] } }).__releaseProbe.modules)).toContain(`snake@${snake.version}`);
      await expect(page.locator('#overflowMenu')).toBeVisible();
      await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-id', 'breakout');
      await expect.poll(async () => (await probe(page)).filter(instance => instance.id === 'snake').length).toBe(0);
      expect(await page.evaluate(() => document.activeElement?.closest('#overflowMenu') !== null)).toBe(true);
    } finally { release(); }
  });

  test('a replaced toggle button keeps its menu open and preserves manual pause ownership', async ({ page }) => {
    await fixture(page);
    await page.goto('/#/gacha'); await ready(page, 'gacha');
    await page.locator('#overflowBtn').click();
    await page.locator('[data-action-id="probe-gacha"]').click();
    await expect(page.locator('[data-action-id="probe-gacha"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#overflowMenu')).toBeVisible();
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-presentation', 'paused');
    await page.keyboard.press('Escape');
    await choose(page, 'gacha');
    await expect(page.locator('#gameLibrary')).not.toHaveClass(/open/);
    expect(await probe(page)).toEqual([expect.objectContaining({ id: 'gacha', manual: true, paused: false, prepared: 1, started: 1 })]);
  });

  test('old hosts cannot change actions or score, and their asset URL stays instance-bound', async ({ page }) => {
    const setup = await fixture(page);
    await page.goto('/#/gacha'); await ready(page, 'gacha');
    await choose(page, 'snake'); await ready(page, 'snake');
    const before = await page.evaluate(() => localStorage.getItem('cg-records'));
    const url = await page.evaluate(() => {
      const host = (window as unknown as { __releaseProbe: { hosts: Array<{ assetUrl(path: string): string; reportScore(score: number): void; presentation: { setActions(actions: unknown[]): void } }> } }).__releaseProbe.hosts[0];
      host.reportScore(999999);
      host.presentation.setActions([{ id: 'stale', label: 'Stale action', labelZh: '旧动作', run() {} }]);
      return host.assetUrl('weapons/old.webp');
    });
    expect(url).toBe(`${setup.game('gacha').assetBase}weapons/old.webp`);
    expect(await page.evaluate(() => localStorage.getItem('cg-records'))).toBe(before);
    await page.locator('#overflowBtn').click();
    await expect(page.locator('[data-action-id="probe-snake"]')).toBeVisible();
    await expect(page.locator('[data-action-id="stale"]')).toHaveCount(0);
  });

  test('a refreshed catalog does not change running help/version or auto-restart the current card', async ({ page }) => {
    const setup = await fixture(page), old = structuredClone(setup.game('gacha'));
    await page.goto('/#/gacha'); await ready(page, 'gacha');
    const next = setup.game('gacha');
    const base = `/games/gacha/2.0.0/${'b'.repeat(40)}/`;
    Object.assign(next, { version: '2.0.0', revision: 'b'.repeat(40), assetBase: base, entry: `${base}entry.js`, styles: [], cover: undefined, icon: `${base}icon.svg`, name: 'New Gacha', nameZh: '新版抽卡' });
    setup.sources.set(next.entry, moduleSource(next));
    await page.route(`**${base}icon.svg`, route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>' }));
    await page.locator('#siteBrand').click();
    await expect(page.locator('.game-list-item[data-id="gacha"]')).toContainText('New Gacha');
    await page.locator('.game-list-item[data-id="gacha"]').click();
    expect(await probe(page)).toHaveLength(1);
    await page.locator('#helpBtn').click();
    await expect(page.locator('#helpGameName')).toContainText(old.name);
    await expect(page.locator('#helpGameVersion')).toContainText(old.version);
    await page.keyboard.press('Escape');
    await page.locator('#overflowBtn').click();
    await expect(page.locator('#menuGameVersion')).toContainText(old.version);
    await expect(page.locator('#updateGameBtn')).toBeVisible();
    await page.locator('#updateGameBtn').click(); await ready(page, 'gacha');
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-version', '2.0.0');
    expect(await probe(page)).toHaveLength(2);
  });

  test('a mismatched game module is isolated before the old instance is destroyed', async ({ page }) => {
    const setup = await fixture(page), snake = setup.game('snake');
    setup.sources.set(snake.entry, moduleSource(snake, undefined, 2));
    await page.goto('/#/gacha'); await ready(page, 'gacha');
    await choose(page, 'snake');
    await expect(page.locator('#loadError')).toBeVisible();
    expect(await probe(page)).toEqual([expect.objectContaining({ id: 'gacha', destroyed: false, started: 1 })]);
    await page.locator('#resumePreviousBtn').click(); await ready(page, 'gacha');
  });
}
