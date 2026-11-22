import { writeFile } from 'node:fs/promises';
import type { ConsoleMessage, Page, Request, Response, TestInfo } from '@playwright/test';

/** Observe a cold launch without routing requests, importing a module, changing the
 * canvas, or polling the main thread. The Node-side observations survive a stuck tab. */
export async function observeVillaColdShell(page: Page, info: TestInfo, launch: (mark: (name: string) => void, waitForReady: (limit: number) => Promise<void>) => Promise<void>) {
  const start = performance.now(), prefix = 'villa:cold-shell ', origin = info.project.use.baseURL && new URL(info.project.use.baseURL).origin;
  let notify!: (at: number) => void;
  const delivered = new Promise<number>(resolve => { notify = resolve; });
  // The deadline uses the worker's monotonic clock. A busy tab cannot pass by
  // delivering a late observation, even if its next polling tick is delayed.
  const waitForReady = (limit: number) => new Promise<void>((resolve,reject) => {
    const deadline = performance.now()+limit;
    const fail = () => reject(Error(`No usable Villa WebGL frame observed within ${limit}ms`));
    const timer = setTimeout(fail,limit);
    delivered.then(at => { clearTimeout(timer); if (at<=deadline) resolve(); else fail(); });
  });
  const events: { ms: number; event: string; detail?: unknown }[] = [];
  const mark = (event: string, detail?: unknown) => {
    if (events.length < 64) events.push({ ms: Math.round(performance.now() - start), event, detail });
  };
  // Only the document, shell JS, discovery, and real immutable Villa entry. Never
  // capture headers, query strings, bodies, third-party traffic, or frame imagery.
  const resource = (r: Request) => {
    if (r.url().length > 512 || !/^https?:/.test(r.url())) return;
    const url = new URL(r.url()); if (url.origin !== origin) return;
    const p = url.pathname;
    if (p === '/' || p === '/games/index.json' || /^\/shell\/[a-f0-9]{40}\/assets\/[^/]+\.js$/.test(p) || /^\/games\/villa\/[^/]+\/[a-f0-9]{40}\/entry\.js$/.test(p)) return p;
  };
  const requested = (r: Request) => { const path = resource(r); if (path) mark('request', path); };
  const response = (r: Response) => { const path = resource(r.request()); if (path) mark('response', { path, status:r.status() }); };
  const done = (r: Request) => { const path = resource(r); if (path) { const { responseStart, responseEnd } = r.timing(); mark('request-finished', { path, responseStart, responseEnd }); } };
  const failed = (r: Request) => { const path = resource(r); if (path) mark('request-failed', { path, reason:r.failure()?.errorText.slice(0,160) }); };
  let issues = 0;
  const consoleEvent = (msg: ConsoleMessage) => {
    if (msg.type() === 'info' && msg.text().startsWith(prefix)) mark('page milestone', msg.text().slice(prefix.length, prefix.length + 640));
    else if ((msg.type() === 'error' || msg.type() === 'warning') && issues++ < 6) mark('console ' + msg.type(), msg.text().slice(0,240));
  };
  const errorEvent = (e: Error) => mark('pageerror', e.message.slice(0,240));
  const crash = () => mark('page crash');
  page.on('request', requested).on('response', response).on('requestfinished', done).on('requestfailed', failed)
    .on('console', consoleEvent).on('pageerror', errorEvent).on('crash', crash);
  let ready = false;
  try {
    await page.exposeBinding('__villaQaFirstWorld', ({frame}, state) => {
      const url=new URL(frame.url());
      if(frame!==page.mainFrame() || url.origin!==origin || url.hash!=='#/villa') return;
      if(state.id==='villa' && state.renderer==='webgl' && state.running==='true' && state.prepared>0 && !state.inert && state.overlay===false &&
        state.renderWidth>0 && state.renderHeight>0 && state.aspect>0){ mark('usable real world observed',state); notify(performance.now()); }
    });
    await page.addInitScript(tag => {
      if (window !== window.top) return;
      // This records a DOM state only when the browser can yield. In particular,
      // request-finished means bytes received, NOT that JS/GL preparation has run.
      document.addEventListener('DOMContentLoaded', () => {
        const c = document.querySelector<HTMLCanvasElement>('#gameCanvas'); if (!c) return;
        const status = document.getElementById('loadingStatus'), error = document.getElementById('loadError'), overlay = document.getElementById('loadingOverlay');
        let previous = '', count = 0;
        const inspect = () => {
          const state = { id:c.dataset.gameId, prepare:c.dataset.gamePrepareCount, renderer:c.dataset.villaRenderer,
            running:c.dataset.gameRunning, size:[c.width,c.height], inert:c.inert, overlay:overlay?.classList.contains('active'),
            status:status?.textContent?.trim().slice(0,90), error:error?.hidden === false ? document.getElementById('loadErrorMessage')?.textContent?.trim().slice(0,90) : undefined };
          const key = JSON.stringify(state);
          if (key !== previous && count<12) { previous = key; count++; console.info(tag + JSON.stringify({ pageMs:Math.round(performance.now()), ...state })); }
          if (state.running === 'true' && !state.inert && state.overlay === false && state.renderer==='webgl') {
            const w=window as unknown as {__GAME_VIEWPORT_DEBUG__?:{info:()=>{renderWidth?:number;renderHeight?:number;cameraAspect?:number}|null};__villaQaFirstWorld:(x:unknown)=>Promise<void>};
            const world=w.__GAME_VIEWPORT_DEBUG__?.info();
            if(world?.renderWidth && world.renderHeight && world.cameraAspect){
              void w.__villaQaFirstWorld({id:state.id,renderer:state.renderer,running:state.running,prepared:Number(state.prepare),inert:state.inert,overlay:state.overlay,
                renderWidth:world.renderWidth,renderHeight:world.renderHeight,aspect:world.cameraAspect}).catch(()=>{});
              watcher.disconnect();
            }
          }
        };
        const watcher = new MutationObserver(inspect);
        watcher.observe(c, { attributes:true, attributeFilter:['data-game-id','data-game-prepare-count','data-villa-renderer','data-game-running','inert'] });
        if (overlay) watcher.observe(overlay, { attributes:true, attributeFilter:['class'] });
        if (status) watcher.observe(status, { childList:true });
        if (error) watcher.observe(error, { attributes:true, attributeFilter:['hidden'] });
        inspect();
      }, { once:true });
    }, prefix);
    mark('navigate'); await launch(mark,waitForReady); ready = true;
  } finally {
    page.off('request', requested).off('response', response).off('requestfinished', done).off('requestfailed', failed)
      .off('console', consoleEvent).off('pageerror', errorEvent).off('crash', crash);
    // Never ask a timed-out tab for a screenshot or a final evaluate: either could
    // obscure the failed assertion. Persist even for the list reporter's failed-evidence upload.
    try {
      const path = info.outputPath('villa-cold-shell.json');
      await writeFile(path, JSON.stringify({ browser:page.context().browser()?.browserType().name(), ready, events }, null, 2));
      await info.attach('villa-cold-shell', { path, contentType:'application/json' });
    } catch (e) { console.warn('Could not attach cold-shell observations:', String(e)); }
  }
}
