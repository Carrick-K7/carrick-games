import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import type { GameCatalog, GameRelease } from '@carrick/game-sdk/catalog';

export type FixtureOptions = {
  destroy?: 'held' | 'legacy' | 'throw' | 'reject' | 'foreign' | 'foreign-promise' | 'getter';
  createReport?: string | string[];
  prepareReport?: string | string[];
  startReport?: string | string[];
  restartReport?: string | string[];
  failAt?: 'create' | 'prepare' | 'start' | 'restart' | 'demo' | 'action';
  requireCapability?: boolean;
  stopThrows?: boolean;
};
export const publicCapabilityUrl = '/__shell-lifecycle-fixture/public-capability.js';

export function moduleSource(release: GameRelease, options: FixtureOptions = {}) {
  return `
    import { hasGameLifecycle } from ${JSON.stringify(publicCapabilityUrl)};
    export const id = ${JSON.stringify(release.id)};
    export const version = ${JSON.stringify(release.version)};
    export const apiVersion = 1;
    export function create(host) {
      const probe = window.__lifecycleProbe ||= { instances: [], hosts: [], controls: [] };
      const options = ${JSON.stringify(options)};
      const item = { id, serial: probe.instances.length + 1, prepare: 0, start: 0, stop: 0, destroy: 0,
        input: 0, ticks: 0, paused: false, capture: 0, writers: 0,
        capability: hasGameLifecycle(host), protocol: host.lifecycle?.protocol, version: host.lifecycle?.version,
        awaitsDestroy: host.lifecycle?.awaitsDestroy };
      probe.instances.push(item); probe.hosts.push(host);
      const control = {}; probe.controls.push(control);
      if (options.requireCapability && !hasGameLifecycle(host)) {
        const notice = document.createElement('div'); notice.dataset.lifecycleCompatibility = 'true';
        notice.textContent = 'Reload Carrick Games before opening persistent play.';
        document.getElementById('gameApp').append(notice);
        return { init(){}, update(){}, draw(){}, prepare(){}, start(){}, restart(){}, stop(){},
          destroy(){ notice.remove(); }, renderFrame(){}, handleInput(){}, getShellSnapshot(){return {};}, getFrameTelemetry(){return null;} };
      }
      // Synthetic resource counter, not a VM or storage implementation.
      if (options.requireCapability) item.writers++;
      const report = state => { for (const value of Array.isArray(state) ? state : [state]) if (value) host.lifecycle?.report(value); };
      const fail = method => { if (options.failAt === method) throw new Error('fixture ' + method + ' failure'); };
      const onInput = () => item.input++;
      let timer;
      host.presentation?.setActions([{ id: 'fixture-action', label: 'Fixture action', labelZh: '测试操作', run() { fail('action'); } }]);
      report(options.createReport); fail('create');
      return {
        init(){}, update(){}, draw(){}, renderFrame(){}, handleInput(){},
        prepare(){ item.prepare++; report(options.prepareReport); fail('prepare'); },
        start(){ item.start++; window.addEventListener('keydown', onInput); timer = setInterval(() => { if (!item.paused) item.ticks++; }, 10); report(options.startReport); fail('start'); },
        restart(){ report(options.restartReport); fail('restart'); },
        startDemo(){ fail('demo'); },
        setPresentationPaused(paused){ item.paused = paused; host.canvas.dataset.gamePresentation = paused ? 'paused' : 'active'; },
        restorePointerCapture(){ item.capture++; },
        setViewport(viewport){ host.canvas.style.width = viewport.width + 'px'; host.canvas.style.height = viewport.height + 'px'; },
        getShellSnapshot(){return {};}, getFrameTelemetry(){return null;},
        stop(){ item.stop++; clearInterval(timer); window.removeEventListener('keydown', onInput); if (options.stopThrows) throw new Error('fixture stop failure'); },
        destroy(){
          item.destroy++;
          report('running'); // Synchronous stale authority must already be revoked.
          if (options.destroy === 'throw') throw new Error('fixture close throw');
          if (options.destroy === 'reject') return Promise.reject(new Error('fixture close reject'));
          if (options.destroy === 'getter') return { get then(){ throw new Error('fixture then getter'); } };
          if (options.destroy === 'legacy' || !options.destroy) return;
          if (options.destroy === 'foreign' || options.destroy === 'foreign-promise') {
            const frame = document.createElement('iframe'); frame.hidden = true; document.getElementById('gameApp').append(frame);
            const realm = frame.contentWindow;
            const held = new realm.Promise((resolve, reject) => { control.resolve = () => { frame.remove(); resolve(); }; control.reject = () => { frame.remove(); reject(new Error('fixture foreign reject')); }; });
            const value = options.destroy === 'foreign-promise' ? held : new realm.Function('held', 'return { then(resolve, reject) { held.then(resolve, reject); } };')(held);
            item.nativePromise = value instanceof Promise;
            return value;
          }
          return new Promise((resolve, reject) => { control.resolve = resolve; control.reject = () => reject(new Error('fixture held rejection')); });
        }
      };
    }
  `;
}

export async function lifecycleFixture(page: Page, options: Record<string, FixtureOptions> = {}) {
  const revision = 'c'.repeat(40);
  const catalog: GameCatalog = { schemaVersion: 1, apiVersion: 1, generation: 0, games: ['gacha', 'alpha', 'beta'].map((id, order) => {
    const assetBase = `/games/${id}/1.0.0/${revision}/`;
    return { id, order, group: 'casual', name: id, nameZh: id, desc: 'Lifecycle fixture', descZh: '生命周期测试',
      canvasSize: { width: 400, height: 400 }, icon: `${assetBase}icon.svg`,
      controls: { keyboard: [{ keys: ['Space'], action: 'Test', actionZh: '测试' }], touch: [] },
      apiVersion: 1, version: '1.0.0', revision, assetBase, entry: `${assetBase}entry.js`, styles: [`${assetBase}style.css`],
      generation: 0, sequence: 0, handledRevision: revision };
  }) };
  const sources = new Map(catalog.games.map(game => [game.entry, moduleSource(game, options[game.id])]));
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('cg-lang', 'en');
    (window as any).__lifecycleUnhandled = [];
    window.addEventListener('unhandledrejection', event => (window as any).__lifecycleUnhandled.push(String(event.reason)));
  });
  await page.route('**/games/index.json', route => route.fulfill({ json: catalog }));
  await page.route(`**${publicCapabilityUrl}`, route => route.fulfill({ contentType: 'text/javascript', body: ts.transpileModule(
    readFileSync(resolve(import.meta.dirname, '../../../packages/lifecycle/src/index.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } },
  ).outputText }));
  await page.route(`**/${revision}/**`, route => {
    const path = new URL(route.request().url()).pathname;
    if (sources.has(path)) return route.fulfill({ contentType: 'text/javascript', body: sources.get(path)! });
    if (path.endsWith('.css')) return route.fulfill({ contentType: 'text/css', body: '/* exact instance-owned test stylesheet */' });
    return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"/>' });
  });
  return { catalog, sources, errors, game: (id: string) => catalog.games.find(game => game.id === id)! };
}

export async function instances(page: Page): Promise<any[]> {
  return page.evaluate(() => (window as any).__lifecycleProbe?.instances ?? []);
}
export async function choose(page: Page, id: string) {
  if (!(await page.locator('#gameLibrary').getAttribute('class'))?.includes('open')) await page.locator('#siteBrand').click();
  await page.locator(`.game-list-item[data-id="${id}"]`).click();
}
export async function ready(page: Page, id: string, running = true) {
  await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-id', id);
  await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', String(running));
  await expect(page.locator('#loadingOverlay')).not.toHaveClass(/active/);
}
export async function settle(page: Page, index = 0, reject = false) {
  await page.evaluate(({ index, reject }) => (window as any).__lifecycleProbe.controls[index][reject ? 'reject' : 'resolve'](), { index, reject });
}
export async function report(page: Page, index: number, state: string) {
  await page.evaluate(({ index, state }) => (window as any).__lifecycleProbe.hosts[index].lifecycle.report(state), { index, state });
}
export async function cleanErrors(page: Page, errors: string[]) {
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => (window as any).__lifecycleUnhandled)).toEqual([]);
}
