import { createHash } from 'node:crypto';
import type { Page } from '@playwright/test';
import { lifecycleFixture, publicCapabilityUrl } from './lifecycle-fixture';

export interface PreparationFixtureOptions {
  declaration?: unknown;
  undeclared?: boolean;
  input?: 'valid' | 'missing' | 'duplicate' | 'not-file' | 'outside-root' | 'disabled' | 'fieldset-disabled' | 'hidden' | 'inert' | 'covered' | 'pointer-none' | 'parent-pointer-none' | 'visibility-hidden' | 'parent-visibility-hidden' | 'opacity-zero' | 'offscreen' | 'pre-existing';
  resource?: 'ok' | '404' | 'bad-hash';
  destroy?: 'held' | 'reject';
  autoReportAfterOverlay?: boolean;
}
const resourceBody = 'owned local-input fixture resource v1';
const resourceHash = createHash('sha256').update(resourceBody).digest('hex');
const declaration = { protocol: 'carrick-local-input-preparation', version: 1, kind: 'files' };

/** Generic, test-only consumer. No VM/IDB, no copied SDK implementation and no
 * self-authored readiness markers: only the negotiated host writes those.
 */
export async function preparationFixture(page: Page, options: PreparationFixtureOptions = {}) {
  const fixture = await lifecycleFixture(page);
  const release = fixture.game('alpha');
  const declared = Object.hasOwn(options, 'declaration') ? options.declaration : declaration;
  const source = `
    import { hasLocalInputPreparation } from ${JSON.stringify(publicCapabilityUrl)};
    export const id = 'alpha', version = '1.0.0', apiVersion = 1;
    ${options.undeclared ? '' : `export const localInputPreparation = ${JSON.stringify(declared) ?? 'undefined'};`}
    export function create(host) {
      const options = ${JSON.stringify(options)};
      const probe = window.__lifecycleProbe ||= { instances: [], hosts: [], controls: [] };
      const index = probe.instances.length;
      const item = { id, serial: index + 1, prepare: 0, start: 0, stop: 0, destroy: 0,
        capability: hasLocalInputPreparation(host), checked: false, vm: 0, writers: 0, paused: false, inputEvents: 0 };
      probe.instances.push(item); probe.hosts.push(host);
      const control = { attempts: [] }; probe.controls.push(control);
      let input, layer, attempt, disposed = false, overlay = true;
      const abort = new AbortController();
      const inputId = options.input === 'pre-existing' ? 'preexisting-files' : 'required-alpha-' + item.serial;
      const begin = () => {
        if (!host.preparation) return;
        attempt = host.preparation.begin(inputId); control.attempts.push(attempt); return attempt;
      };
      const reportReady = (renew = false) => {
        if (!item.checked || disposed || overlay || !attempt || host.canvas.dataset.gameRunning === 'true') return false;
        if (attempt.report('awaiting-input')) return true;
        return renew ? !!begin()?.report('awaiting-input') : false;
      };
      const setup = () => {
        layer = document.createElement('section');
        layer.style.cssText = 'position:absolute;z-index:10;left:20px;top:100px;width:min(340px,calc(100% - 40px));padding:12px;background:#fff;color:#14231f';
        const label = document.createElement('label'); label.textContent = 'Choose required local files';
        input = options.input === 'pre-existing' ? document.getElementById(inputId) : document.createElement('input');
        input.type = options.input === 'not-file' ? 'text' : 'file'; input.id = inputId;
        input.style.cssText = 'display:block;width:100%;min-height:44px'; input.disabled = true;
        const fieldset = document.createElement('fieldset'); fieldset.style.cssText = 'border:0;padding:0;margin:0';
        label.append(input); fieldset.append(label); layer.append(fieldset);
        if (options.input !== 'missing') (options.input === 'outside-root' ? document.body : document.getElementById('gameApp')).append(layer);
        if (options.input === 'duplicate') layer.append(input.cloneNode());
        if (options.input === 'hidden') input.hidden = true;
        if (options.input === 'inert') fieldset.inert = true;
        if (options.input === 'fieldset-disabled') fieldset.disabled = true;
        if (options.input === 'pointer-none') input.style.pointerEvents = 'none';
        if (options.input === 'parent-pointer-none') { layer.style.pointerEvents = 'none'; input.style.pointerEvents = 'auto'; }
        if (options.input === 'visibility-hidden') input.style.visibility = 'hidden';
        if (options.input === 'parent-visibility-hidden') { layer.style.visibility = 'hidden'; input.style.visibility = 'visible'; input.setAttribute('aria-label', 'Choose required local files'); }
        if (options.input === 'opacity-zero') input.style.opacity = '0';
        if (options.input === 'offscreen') layer.style.left = '-1000px';
        if (options.input === 'covered') {
          const blocker = document.createElement('div'); blocker.style.cssText = 'position:absolute;inset:0;z-index:2;background:#ddd'; layer.append(blocker);
        }
        control.inputId = inputId;
        control.begin = begin;
        control.report = index => control.attempts[index ?? control.attempts.length - 1]?.report('awaiting-input') ?? false;
        control.replace = () => { const next = input.cloneNode(); input.replaceWith(next); input = next; };
        control.reinsert = () => { const parent = input.parentNode; input.remove(); parent.append(input); };
        control.restart = () => { begin(); reportReady(); };
        input.addEventListener('change', () => {
          item.inputEvents++; begin();
          // Empty filechooser selection/cancellation does not start a VM/writer.
          if (!input.files?.length) reportReady();
        }, { signal: abort.signal });
        host.lifecycle?.report('loading'); begin();
        void fetch(host.assetUrl('required-input.dat'), { signal: abort.signal }).then(async response => {
          if (!response.ok) throw new Error('fixture-required-input-http');
          const bytes = await response.arrayBuffer();
          const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
          if (hash !== ${JSON.stringify(resourceHash)}) throw new Error('fixture-required-input-integrity');
          if (disposed) return;
          item.checked = true; input.disabled = options.input === 'disabled'; reportReady();
        }).catch(error => { if (!disposed) { item.error = String(error); host.lifecycle?.report('failed'); } });
      };
      const paint = () => { const ctx = host.canvas.getContext('2d'); ctx.fillStyle = '#e6eae7'; ctx.fillRect(0, 0, host.canvas.width, host.canvas.height); };
      return { init(){}, update(){}, draw: paint, renderFrame: paint, handleInput(){},
        prepare(){ item.prepare++; host.canvas.dataset.gamePrepareCount = String(item.prepare); setup(); paint(); },
        start(){ item.start++; }, restart(){ control.restart(); },
        stop(){ item.stop++; },
        destroy(){ disposed = true; item.destroy++; abort.abort(); layer?.remove();
          if (options.destroy === 'reject') return Promise.reject(new Error('fixture preparation close rejected'));
          if (options.destroy === 'held') return new Promise((resolve,reject) => { control.resolve = resolve; control.reject = () => reject(new Error('fixture preparation close rejected')); });
        },
        setPresentationPaused(paused){ item.paused = paused; host.canvas.dataset.gamePresentation = paused ? 'paused' : 'active'; },
        onShellOverlayChange(open){ overlay = open; if (layer) layer.hidden = open; if (!open && options.autoReportAfterOverlay !== false) reportReady(true); },
        setViewport(viewport){ host.canvas.style.width = viewport.width + 'px'; host.canvas.style.height = viewport.height + 'px'; },
        getShellSnapshot(){return {};}, getFrameTelemetry(){return null;}
      };
    }
  `;
  fixture.sources.set(release.entry, source);
  await page.route(`**${release.assetBase}required-input.dat`, route => route.fulfill({
    status: options.resource === '404' ? 404 : 200, contentType: 'application/octet-stream',
    body: options.resource === 'bad-hash' ? 'not-the-expected-resource' : resourceBody,
  }));
  return { ...fixture, release, source, resourceBody };
}
