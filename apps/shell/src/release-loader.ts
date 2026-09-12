import { HOST_API_VERSION, releaseResource, type GameModule, type GameRelease } from '@carrick/game-sdk/catalog';
import type { Game } from '@carrick/game-sdk/game';

const modules = new Map<string, Promise<GameModule>>();
const failedImports = new Map<string, number>();
const MAX_IMPORT_ATTEMPTS = 3;
export class ReleaseReloadRequiredError extends Error {
  constructor() { super('The browser could not recover this module graph. Reload the application.'); }
}
interface Stylesheet { element: HTMLLinkElement; ready: Promise<void>; users: number; dispose(): void }
const stylesheets = new Map<string, Stylesheet>();

export function validateModule(value: unknown, release: GameRelease): GameModule {
  const module = value as Partial<GameModule> | null;
  if (!module || module.apiVersion !== HOST_API_VERSION || module.id !== release.id || module.version !== release.version || typeof module.create !== 'function') {
    throw new Error('Game module does not match its published descriptor');
  }
  return module as GameModule;
}
export function validateGame(value: unknown): Game {
  if (!value || typeof value !== 'object') throw new Error('Invalid game instance');
  for (const method of ['prepare', 'start', 'restart', 'stop', 'destroy', 'renderFrame', 'getShellSnapshot', 'getFrameTelemetry', 'handleInput']) {
    if (typeof (value as Record<string, unknown>)[method] !== 'function') throw new Error(`Game is missing ${method}()`);
  }
  return value as Game;
}
export function importGame(release: GameRelease): Promise<GameModule> {
  const cached = modules.get(release.entry);
  if (cached) return cached;
  const failures = failedImports.get(release.entry) ?? 0;
  if (failures >= MAX_IMPORT_ATTEMPTS) return Promise.reject(new ReleaseReloadRequiredError());
  // Native ESM caches failed fetches too. A bounded fresh entry identity repairs
  // transient entry failures without changing its canonical release/asset base.
  // A poisoned transitive chunk may still require the explicit full reload.
  const url = new URL(release.entry, window.location.origin);
  if (failures) url.searchParams.set('__carrick_retry', String(failures));
  const promise: Promise<GameModule> = import(/* @vite-ignore */ url.href).then(value => validateModule(value, release)).catch(error => {
    const count = failures + 1;
    failedImports.set(release.entry, count);
    if (modules.get(release.entry) === promise) modules.delete(release.entry);
    throw count >= MAX_IMPORT_ATTEMPTS ? new ReleaseReloadRequiredError() : error;
  });
  modules.set(release.entry, promise);
  return promise;
}
function acquireStylesheet(url: string): { ready: Promise<void>; release(): void } {
  let sheet = stylesheets.get(url);
  if (!sheet) {
    const element = document.createElement('link');
    element.rel = 'stylesheet';
    element.href = url;
    element.dataset.gameStylesheet = url;
    let rejectPending: (reason: Error) => void = () => {};
    let settled = false;
    let timer = 0;
    const ready = new Promise<void>((resolve, reject) => {
      rejectPending = reject;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        element.onload = element.onerror = null;
        if (error) reject(error); else resolve();
      };
      element.onload = () => finish();
      element.onerror = () => finish(new Error('Game stylesheet failed to load'));
      timer = window.setTimeout(() => finish(new Error('Game stylesheet loading timed out')), 30_000);
    });
    sheet = {
      element, ready, users: 0,
      dispose() {
        window.clearTimeout(timer);
        element.onload = element.onerror = null;
        element.remove();
        if (!settled) { settled = true; rejectPending(new Error('Game stylesheet released')); }
      },
    };
    stylesheets.set(url, sheet);
    document.head.append(element);
  }
  const owned = sheet;
  owned.users++;
  let released = false;
  return {
    ready: owned.ready,
    release() {
      if (released) return;
      released = true;
      if (--owned.users === 0) {
        owned.dispose();
        if (stylesheets.get(url) === owned) stylesheets.delete(url);
      }
    },
  };
}
export interface PreparedRelease { module: GameModule; releaseStyles(): void }
export async function prepareRelease(release: GameRelease, signal: AbortSignal): Promise<PreparedRelease> {
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  const leases = release.styles.map(acquireStylesheet);
  const cleanup = () => leases.forEach(lease => lease.release());
  let abort: () => void = () => {};
  const cancelled = new Promise<never>((_, reject) => {
    abort = () => reject(new DOMException('Cancelled', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
  });
  try {
    const ready = Promise.all([importGame(release), ...leases.map(lease => lease.ready)]);
    const [module] = await Promise.race([ready, cancelled]);
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    return { module: module as GameModule, releaseStyles: cleanup };
  } catch (error) { cleanup(); throw error; }
  finally { signal.removeEventListener('abort', abort); }
}
export function assetResolver(release: GameRelease): (path: string) => string {
  // This closure belongs to exactly one host, including its late async work.
  const origin = window.location.origin;
  return path => releaseResource(path, release.assetBase, origin);
}
