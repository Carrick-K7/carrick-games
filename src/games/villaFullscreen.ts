export interface VillaFullscreen {
  toggle(): void;
  /** True while fullscreen owns sizing; the caller must skip its ordinary fit. */
  resize(): boolean;
  destroy(): void;
  readonly active: boolean;
}

const ASPECT = 1120 / 700;
export function villaFullscreenFit(width: number, height: number): { width: number; height: number } {
  if (![width, height].every(n => Number.isFinite(n) && n > 0)) return { width: 0, height: 0 };
  const w = Math.min(width, height * ASPECT);
  return { width: w, height: w / ASPECT };
}

interface Session {
  host: HTMLDivElement;
  marker: Comment;
  parent: Node;
  next: ChildNode | null;
  style: string | null;
  width: number;
  focus: Element | null;
  nativeSeen: boolean;
  pending: boolean;
  fittedWidth: number;
  dpr: number;
}

/** Villa-only fullscreen. No shared DOM/CSS is changed except the owned canvas.
 * onFit must call BaseGame.setDisplayScale directly (not a fullscreen-aware override).
 * onChange(false) runs AFTER original DOM/styles are restored, allowing a caller
 * to reapply a newer shell fit if the viewport changed while fullscreen was open.
 */
export function createVillaFullscreen(
  canvas: HTMLCanvasElement,
  onFit: (cssWidth: number) => void,
  onChange?: (active: boolean) => void,
): VillaFullscreen {
  const doc = canvas.ownerDocument, view = doc.defaultView;
  let current: Session | null = null, destroyed = false, pendingRequests = 0;
  let observer: MutationObserver | null = null;
  // Retain only hosts with unsettled native requests/exits, never every old entry.
  const retired = new Set<Session>();
  const set = (element: HTMLElement, values: Record<string, string>) => {
    for (const [key, value] of Object.entries(values)) element.style.setProperty(key, value, 'important');
  };
  const shellOpen = () => {
    const menu = doc.getElementById('overflowMenu');
    return !!doc.getElementById('gameLibrary')?.classList.contains('open') || !!(menu && !menu.hidden);
  };
  const tidy = () => {
    for (const s of retired) if (!s.pending && doc.fullscreenElement !== s.host) retired.delete(s);
  };
  const restoreMenuFocus = () => {
    if (destroyed || current || doc.fullscreenElement) return;
    const library = doc.getElementById('gameLibrary'), active = doc.activeElement;
    // Native fullscreen teardown can drop the search focus requested by the shell.
    // Repair only that lost focus, never another field/button the user chose.
    if (library?.classList.contains('open') && (!active || active === doc.body || active === canvas || active === library || !active.isConnected))
      doc.getElementById('searchInput')?.focus({ preventScroll: true });
  };
  const exitNative = (host: HTMLElement) => {
    if (doc.fullscreenElement !== host) return; // Never exit somebody else's fullscreen.
    try { Promise.resolve(doc.exitFullscreen?.()).then(restoreMenuFocus, restoreMenuFocus); }
    catch { queueMicrotask(restoreMenuFocus); } // Detachment can already have ended native fullscreen.
  };
  const leave = () => {
    const s = current; if (!s) return;
    current = null; observer?.disconnect(); observer = null;
    if (s.pending || doc.fullscreenElement === s.host) retired.add(s);
    const ownedCanvas = canvas.parentNode === s.host;
    const restoreFocus = !!doc.activeElement && s.host.contains(doc.activeElement);
    if (ownedCanvas) {
      // A shell menu's newly focused search input must not lose focus here.
      if (doc.pointerLockElement === canvas) { try { doc.exitPointerLock?.(); } catch { /* Already released. */ } }
      if (s.marker.parentNode) s.marker.parentNode.insertBefore(canvas, s.marker);
      else s.parent.insertBefore(canvas, s.next?.parentNode === s.parent ? s.next : null);
      try { if (s.width > 0) onFit(s.width); }
      finally {
        if (s.style === null) canvas.removeAttribute('style'); else canvas.setAttribute('style', s.style);
      }
    }
    s.marker.remove(); exitNative(s.host); s.host.remove(); tidy();
    if (restoreFocus && ownedCanvas && s.focus?.isConnected && 'focus' in s.focus) {
      (s.focus as HTMLElement).focus({ preventScroll: true });
    }
    // If an external owner already took the canvas, never overwrite its sizing.
    if (ownedCanvas) onChange?.(false);
  };
  const resize = (): boolean => {
    const s = current;
    if (!s || !view || destroyed) return false;
    if (shellOpen()) { leave(); return false; }
    // Native fullscreen fills the layout viewport; a mobile visual viewport can
    // still report its pre-entry browser chrome/zoom until a later event.
    const viewport = doc.fullscreenElement === s.host ? null : view.visualViewport;
    const width = viewport?.width ?? view.innerWidth, height = viewport?.height ?? view.innerHeight;
    const fit = villaFullscreenFit(width, height);
    if (!fit.width) return true; // Hidden/zero-sized viewports are not valid resize requests.
    set(s.host, { left: `${viewport?.offsetLeft ?? 0}px`, top: `${viewport?.offsetTop ?? 0}px`, width: `${width}px`, height: `${height}px` });
    const dpr = view.devicePixelRatio || 1;
    if (s.fittedWidth !== fit.width || s.dpr !== dpr) {
      s.fittedWidth = fit.width; s.dpr = dpr; onFit(fit.width);
    }
    // BaseGame writes normal-priority width/height; apply these AFTER the callback.
    // Border/padding and object-fit letterboxing must not offset touch hit testing.
    set(canvas, {
      width: `${fit.width}px`, height: `${fit.height}px`, 'max-width': 'none', 'max-height': 'none',
      'min-width': '0', 'min-height': '0', margin: '0', padding: '0', border: '0', 'border-radius': '0',
      'box-shadow': 'none', display: 'block', 'box-sizing': 'content-box', flex: 'none',
      position: 'static', transform: 'none', 'object-fit': 'fill',
    });
    return true;
  };
  const fullscreenChanged = () => {
    // A cancelled request can finish after a newer fallback session has started.
    for (const s of retired) if (doc.fullscreenElement === s.host) { exitNative(s.host); return; }
    const s = current;
    if (s) {
      if (doc.fullscreenElement === s.host) { s.nativeSeen = true; resize(); }
      else if (s.nativeSeen || doc.fullscreenElement) leave();
    }
    tidy();
  };
  const escape = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && current) leave();
    // Do not swallow Escape: Villa still needs to clear keys/release mouse capture.
  };
  const enter = () => {
    if (destroyed || current || !view || !doc.body || !canvas.parentNode || shellOpen() || doc.fullscreenElement) return;
    const host = doc.createElement('div'), marker = doc.createComment('villa fullscreen canvas position');
    host.setAttribute('data-villa-fullscreen', 'true');
    set(host, {
      position: 'fixed', inset: 'auto', display: 'flex', 'align-items': 'center', 'justify-content': 'center',
      background: '#151a17', margin: '0', padding: '0', border: '0', overflow: 'hidden',
      'z-index': '2147483647', isolation: 'isolate', 'box-sizing': 'border-box',
    });
    const s: Session = { host, marker, parent: canvas.parentNode, next: canvas.nextSibling,
      style: canvas.getAttribute('style'), width: canvas.getBoundingClientRect().width,
      focus: doc.activeElement, nativeSeen: false, pending: false, fittedWidth: -1, dpr: -1 };
    s.parent.insertBefore(marker, canvas); doc.body.appendChild(host); host.appendChild(canvas); current = s;
    resize();
    if (current !== s || destroyed) return;
    onChange?.(true);
    if (current !== s || destroyed) return;
    if (shellOpen()) { leave(); return; }
    if (typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(() => { if (current && shellOpen()) leave(); });
      for (const id of ['gameLibrary', 'overflowMenu']) {
        const panel = doc.getElementById(id);
        if (panel) observer.observe(panel, { attributes: true, attributeFilter: ['class', 'hidden', 'aria-hidden'] });
      }
    }
    // Keep a usable full-viewport fallback if native fullscreen is unsupported,
    // rejected, or a previous cancelled native request is still settling.
    if (!host.requestFullscreen || doc.fullscreenEnabled === false || pendingRequests) return;
    s.pending = true; pendingRequests++;
    const settle = () => {
      s.pending = false; pendingRequests--;
      if (current !== s || destroyed) exitNative(s.host);
      else if (doc.fullscreenElement === s.host) { s.nativeSeen = true; resize(); }
      else if (s.nativeSeen) leave();
      tidy();
    };
    try { Promise.resolve(host.requestFullscreen()).then(settle, settle); }
    catch { settle(); }
  };
  doc.addEventListener('fullscreenchange', fullscreenChanged);
  doc.addEventListener('keydown', escape, true);
  view?.addEventListener('resize', resize);
  view?.visualViewport?.addEventListener('resize', resize);
  view?.visualViewport?.addEventListener('scroll', resize);
  return {
    get active() { return current !== null; },
    toggle() { if (current) leave(); else enter(); },
    resize,
    destroy() {
      if (destroyed) return;
      destroyed = true; leave(); observer?.disconnect(); observer = null;
      doc.removeEventListener('fullscreenchange', fullscreenChanged);
      doc.removeEventListener('keydown', escape, true);
      view?.removeEventListener('resize', resize);
      view?.visualViewport?.removeEventListener('resize', resize);
      view?.visualViewport?.removeEventListener('scroll', resize);
      for (const s of retired) exitNative(s.host);
      // Native promise handlers retain their individual session until settlement.
      retired.clear();
    },
  };
}
