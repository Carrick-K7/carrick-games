import type { Page } from '@playwright/test';
import type { GameRelease } from '@carrick/game-sdk/catalog';

/** A same-origin document for Villa's private controller/scene fixtures.
 * No shell, unrelated game, or failed-load overlay participates in native input. */
export async function openVillaFixturePage(page: Page) {
  await page.route('**/__villa-fixture', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
    <html><head><meta name="viewport" content="width=device-width, initial-scale=1">
    <style>html,body{margin:0;width:100%;height:100%}#gameApp{position:absolute;inset:0;pointer-events:none}#gameApp>*{pointer-events:auto}</style>
    </head><body><main id="gameApp"></main></body></html>` }));
  await page.goto('/__villa-fixture');
}

export const VILLA_SWITCH_ID = 'villa-test-destination';
const revision = 'b'.repeat(40);
const assetBase = `/games/${VILLA_SWITCH_ID}/1.0.0/${revision}/`;
const destination: GameRelease = {
  id: VILLA_SWITCH_ID, name: 'Villa lifecycle destination', nameZh: '别墅生命周期测试目标',
  desc: 'Villa-owned API-1 lifecycle fixture', descZh: '别墅自有 API-1 生命周期测试替身',
  group: 'casual', order: 999, canvasSize: { width: 400, height: 400 },
  icon: `${assetBase}icon.svg`, controls: { keyboard: [], touch: [] },
  apiVersion: 1, version: '1.0.0', revision, assetBase, entry: `${assetBase}entry.js`, styles: [],
  generation: 0, sequence: 0, handledRevision: revision,
};

/** Keep the real shell, Villa release, picker and destruction path. Only the
 * destination is a tiny owned ABI implementation, never another game's code. */
export async function installVillaSwitchTarget(page: Page) {
  await page.route('**/games/index.json', async route => {
    const response = await route.fetch();
    const catalog = await response.json();
    await route.fulfill({ response, json: { ...catalog, games: [...catalog.games, destination] } });
  });
  await page.route(`**${destination.icon}`, route => route.fulfill({ contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" fill="#0d9488"/></svg>' }));
  await page.route(`**${destination.entry}`, route => route.fulfill({ contentType: 'text/javascript', body: `
    export const id = ${JSON.stringify(VILLA_SWITCH_ID)}, version = '1.0.0', apiVersion = 1;
    export function create(host) {
      const canvas = host.canvas, ctx = canvas.getContext('2d');
      const paint = () => { ctx.fillStyle = '#0d9488'; ctx.fillRect(0, 0, canvas.width, canvas.height); };
      return {
        width: 400, height: 400,
        init() {}, update() {}, draw: paint, renderFrame: paint, handleInput() {},
        prepare() { canvas.dataset.gamePrepareCount = '1'; canvas.dataset.logicalWidth = '400'; canvas.dataset.logicalHeight = '400'; paint(); },
        start() { canvas.dataset.gameRunning = 'true'; paint(); },
        restart() { this.prepare(); this.start(); },
        stop() { canvas.dataset.gameRunning = 'false'; },
        destroy() { this.stop(); },
        setDisplayScale(width) { canvas.style.width = width + 'px'; canvas.style.height = width + 'px'; },
        setViewport(viewport) { canvas.width = canvas.height = Math.round(400 * viewport.dpr); this.setDisplayScale(Math.min(viewport.width, viewport.height)); paint(); },
        setPresentationPaused(paused) { canvas.dataset.gamePresentation = paused ? 'paused' : 'active'; },
        onShellOverlayChange() {}, getShellSnapshot() { return { score: 0 }; }, getFrameTelemetry() { return null; }
      };
    }
  ` }));
}
