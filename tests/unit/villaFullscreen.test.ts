import { afterEach, describe, expect, it, vi } from 'vitest';
import { createVillaFullscreen, villaFullscreenFit } from '../../src/games/villaFullscreen';

class Style {
  private values = new Map<string, { value: string; priority: string }>();
  private raw: string | null = null;
  setProperty(key: string, value: string, priority = '') { this.raw = null; this.values.set(key, { value, priority }); }
  getPropertyValue(key: string) { return this.values.get(key)?.value ?? ''; }
  getPropertyPriority(key: string) { return this.values.get(key)?.priority ?? ''; }
  get cssText() { return this.raw ?? [...this.values].map(([key, v]) => `${key}: ${v.value}${v.priority ? ' !' + v.priority : ''};`).join(' '); }
  set cssText(text: string) {
    this.values.clear(); this.raw = text;
    for (const part of text.split(';')) {
      const colon = part.indexOf(':'); if (colon < 0) continue;
      const value = part.slice(colon + 1).trim(), priority = /!important$/.test(value) ? 'important' : '';
      this.values.set(part.slice(0, colon).trim(), { value: value.replace(/\s*!important$/, ''), priority });
    }
  }
}
class TrackedTarget extends EventTarget {
  registrations = new Map<string, Set<EventListenerOrEventListenerObject>>();
  addEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
    super.addEventListener(type, callback, options); if (!callback) return;
    const key = type + ':' + (typeof options === 'boolean' ? options : !!options?.capture);
    if (!this.registrations.has(key)) this.registrations.set(key, new Set()); this.registrations.get(key)!.add(callback);
  }
  removeEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions) {
    super.removeEventListener(type, callback, options); if (!callback) return;
    const key = type + ':' + (typeof options === 'boolean' ? options : !!options?.capture);
    this.registrations.get(key)?.delete(callback);
  }
  get listeners() { return [...this.registrations.values()].reduce((n, set) => n + set.size, 0); }
}
class NodeMock extends TrackedTarget {
  parentNode: NodeMock | null = null;
  children: NodeMock[] = [];
  constructor(readonly ownerDocument: DocumentMock) { super(); }
  get nextSibling() { const siblings = this.parentNode?.children; return siblings?.[siblings.indexOf(this) + 1] ?? null; }
  get isConnected(): boolean { return this === this.ownerDocument.body || !!this.parentNode?.isConnected; }
  insertBefore(node: NodeMock, reference: NodeMock | null) {
    node.remove(); const i = reference ? this.children.indexOf(reference) : this.children.length;
    if (i < 0) throw new Error('Not a child'); this.children.splice(i, 0, node); node.parentNode = this; return node;
  }
  appendChild(node: NodeMock) { return this.insertBefore(node, null); }
  remove() { if (this.parentNode) { const p = this.parentNode; p.children.splice(p.children.indexOf(this), 1); this.parentNode = null; } }
  contains(node: NodeMock): boolean { return this === node || this.children.some(c => c.contains(node)); }
}
class ElementMock extends NodeMock {
  style = new Style(); private attributes = new Map<string, string>();
  requestFullscreen?: () => Promise<void>;
  classList = { contains: (name: string) => (this.attributes.get('class') ?? '').split(' ').includes(name) };
  get hidden() { return this.attributes.has('hidden'); }
  setAttribute(key: string, value: string) { this.attributes.set(key, value); if (key === 'style') this.style.cssText = value; }
  getAttribute(key: string) { return key === 'style' ? (this.style.cssText || (this.attributes.has(key) ? '' : null)) : this.attributes.get(key) ?? null; }
  removeAttribute(key: string) { this.attributes.delete(key); if (key === 'style') this.style.cssText = ''; }
  getBoundingClientRect() { const width = parseFloat(this.style.getPropertyValue('width')) || 700; return { width, height: width * .625 }; }
  focus() { this.ownerDocument.activeElement = this; }
}
class ViewportMock extends TrackedTarget { width = 1920; height = 1080; offsetLeft = 0; offsetTop = 0; }
class WindowMock extends TrackedTarget { innerWidth = 1920; innerHeight = 1080; devicePixelRatio = 1; visualViewport: ViewportMock | null = null; }
class DocumentMock extends TrackedTarget {
  body = new ElementMock(this); defaultView = new WindowMock(); activeElement: ElementMock | null = null;
  fullscreenElement: ElementMock | null = null; pointerLockElement: ElementMock | null = null;
  fullscreenEnabled = true; request: ((host: ElementMock) => Promise<void>) | null = null;
  exitFullscreen = vi.fn(async () => { this.fullscreenElement = null; this.dispatchEvent(new Event('fullscreenchange')); });
  exitPointerLock = vi.fn(() => { this.pointerLockElement = null; });
  createElement() { const e = new ElementMock(this); if (this.request) e.requestFullscreen = () => this.request!(e); return e; }
  createComment() { return new NodeMock(this); }
  getElementById(id: string): ElementMock | null {
    const visit = (node: NodeMock): ElementMock | null => {
      if (node instanceof ElementMock && node.getAttribute('id') === id) return node;
      for (const child of node.children) { const found = visit(child); if (found) return found; } return null;
    };
    return visit(this.body);
  }
  native(element: ElementMock | null) { this.fullscreenElement = element; this.dispatchEvent(new Event('fullscreenchange')); }
}
class ObserverMock {
  static all: ObserverMock[] = [];
  targets: ElementMock[] = []; connected = true;
  constructor(readonly callback: () => void) { ObserverMock.all.push(this); }
  observe(target: ElementMock) { this.targets.push(target); }
  disconnect() { this.connected = false; }
  static flush() { for (const observer of [...this.all]) if (observer.connected) observer.callback(); }
}
const pending = () => { let resolve!: () => void, reject!: (error: Error) => void; const promise = new Promise<void>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
const make = () => {
  ObserverMock.all = []; vi.stubGlobal('MutationObserver', ObserverMock);
  const doc = new DocumentMock(), parent = doc.createElement(), before = doc.createElement(), canvas = doc.createElement(), after = doc.createElement();
  const library = doc.createElement(), menu = doc.createElement(), search = doc.createElement();
  library.setAttribute('id', 'gameLibrary'); menu.setAttribute('id', 'overflowMenu'); menu.setAttribute('hidden', ''); library.appendChild(search);
  doc.body.appendChild(parent); doc.body.appendChild(library); doc.body.appendChild(menu);
  parent.appendChild(before); parent.appendChild(canvas); parent.appendChild(after);
  const originalStyle = 'width: 700px; height: 437.5px; cursor: crosshair; --custom: preserved !important;';
  canvas.setAttribute('style', originalStyle); canvas.focus();
  const fit = vi.fn((width: number) => { canvas.style.setProperty('width', Math.round(width) + 'px'); canvas.style.setProperty('height', Math.round(width * .625) + 'px'); });
  const changed = vi.fn(); const helper = createVillaFullscreen(canvas as unknown as HTMLCanvasElement, fit, changed);
  const host = () => canvas.parentNode as ElementMock;
  return { doc, parent, before, canvas, after, library, menu, search, originalStyle, fit, changed, helper, host };
};
afterEach(() => vi.unstubAllGlobals());

describe('villa-only fullscreen', () => {
  it('maximizes an exact 1120:700 rectangle without stretching or inner letterboxing', () => {
    expect(villaFullscreenFit(1920, 1080)).toEqual({ width: 1728, height: 1080 });
    expect(villaFullscreenFit(1280, 1200)).toEqual({ width: 1280, height: 800 });
    expect(villaFullscreenFit(3840, 2160)).toEqual({ width: 3456, height: 2160 });
    for (const invalid of [0, -1, NaN, Infinity]) expect(villaFullscreenFit(invalid, 700)).toEqual({ width: 0, height: 0 });
  });
  it('uses a per-game fallback host, overrides shell CSS, and restores exact order/styles repeatedly', () => {
    const f = make();
    for (let i = 0; i < 3; i++) {
      f.helper.toggle(); expect(f.helper.active).toBe(true); expect(f.host().getAttribute('data-villa-fullscreen')).toBe('true');
      expect(f.canvas.style.getPropertyValue('width')).toBe('1728px'); expect(f.canvas.style.getPropertyValue('height')).toBe('1080px');
      expect(f.canvas.style.getPropertyPriority('height')).toBe('important'); expect(f.canvas.style.getPropertyValue('border')).toBe('0');
      expect(f.canvas.style.getPropertyValue('object-fit')).toBe('fill'); expect(f.doc.body.children).toHaveLength(4);
      f.helper.toggle(); expect(f.helper.active).toBe(false); expect(f.parent.children).toEqual([f.before, f.canvas, f.after]);
      expect(f.canvas.getAttribute('style')).toBe(f.originalStyle); expect(f.fit).toHaveBeenLastCalledWith(700); expect(f.doc.body.children).toHaveLength(3);
    }
    f.helper.destroy(); expect(f.helper.resize()).toBe(false);
  });
  it('handles native enter and Esc/native exit without leaving canvas or listeners behind', async () => {
    const f = make(); f.doc.request = async host => { f.doc.native(host); };
    f.helper.toggle(); await flush(); expect(f.doc.fullscreenElement).toBe(f.host()); expect(f.helper.active).toBe(true);
    f.doc.native(null); expect(f.helper.active).toBe(false); expect(f.canvas.parentNode).toBe(f.parent);
    f.helper.toggle(); await flush(); const escape = new Event('keydown'); Object.assign(escape, { key: 'Escape' }); f.doc.dispatchEvent(escape);
    expect(f.helper.active).toBe(false); expect(f.doc.fullscreenElement).toBe(null); expect(f.canvas.getAttribute('style')).toBe(f.originalStyle);
    f.helper.destroy(); expect(f.doc.listeners).toBe(0); expect(f.doc.defaultView.listeners).toBe(0);
  });
  it('uses the full native viewport rather than stale browser-chrome visual dimensions', async () => {
    const f = make(), viewport = new ViewportMock(); viewport.width = 1280; viewport.height = 640; viewport.offsetTop = 18;
    f.doc.defaultView.visualViewport = viewport; f.doc.request = async host => { f.doc.native(host); };
    f.helper.toggle(); await flush();
    expect(f.canvas.style.getPropertyValue('width')).toBe('1728px'); expect(f.canvas.style.getPropertyValue('height')).toBe('1080px');
    expect(f.host().style.getPropertyValue('top')).toBe('0px'); f.helper.destroy();
  });
  it('keeps fallback usable for missing, denied, throwing, or disabled native APIs', async () => {
    for (const mode of ['missing', 'reject', 'throw', 'disabled']) {
      const f = make();
      if (mode !== 'missing') f.doc.request = () => { if (mode === 'throw') throw new Error('denied'); return Promise.reject(new Error('denied')); };
      if (mode === 'disabled') f.doc.fullscreenEnabled = false;
      f.helper.toggle(); await flush(); expect(f.helper.active, mode).toBe(true); expect(f.canvas.style.getPropertyValue('width')).toBe('1728px');
      f.helper.destroy(); expect(f.canvas.parentNode).toBe(f.parent);
    }
  });
  it('cleans a native request that resolves after destruction or a game switch', async () => {
    const f = make(), request = pending(); f.doc.request = () => request.promise;
    f.helper.toggle(); const oldHost = f.host(); f.helper.destroy();
    f.doc.native(oldHost); request.resolve(); await flush();
    expect(f.doc.fullscreenElement).toBe(null); expect(f.doc.exitFullscreen).toHaveBeenCalledTimes(1);
    expect(f.canvas.parentNode).toBe(f.parent); expect(f.canvas.getAttribute('style')).toBe(f.originalStyle);
    expect(f.doc.body.children).toHaveLength(3); f.helper.toggle(); expect(f.helper.active).toBe(false);
  });
  it('keeps a newer fallback entry alive when an older cancelled native request settles', async () => {
    const f = make(), request = pending(), native = vi.fn(() => request.promise); f.doc.request = native;
    f.helper.toggle(); const oldHost = f.host(); f.helper.toggle(); f.helper.toggle(); const newHost = f.host();
    expect(newHost).not.toBe(oldHost); expect(native).toHaveBeenCalledTimes(1);
    f.doc.native(oldHost); request.resolve(); await flush();
    expect(f.helper.active).toBe(true); expect(f.host()).toBe(newHost); expect(f.doc.fullscreenElement).toBe(null);
    f.helper.destroy(); expect(f.canvas.getAttribute('style')).toBe(f.originalStyle);
  });
  it('does not enter over or exit another element’s native fullscreen', () => {
    const f = make(), foreign = f.doc.createElement(); f.doc.body.appendChild(foreign);
    f.doc.native(foreign); f.helper.toggle(); expect(f.helper.active).toBe(false); expect(f.canvas.parentNode).toBe(f.parent);
    f.doc.native(null); f.helper.toggle(); f.doc.native(foreign);
    expect(f.helper.active).toBe(false); expect(f.doc.fullscreenElement).toBe(foreign); expect(f.doc.exitFullscreen).not.toHaveBeenCalled(); f.helper.destroy();
  });
  it('refits for viewport/orientation/DPR changes without allowing an ordinary shell fit', () => {
    const f = make(), viewport = new ViewportMock(); f.doc.defaultView.visualViewport = viewport;
    // Use a second helper to capture visualViewport listeners at construction.
    f.helper.destroy(); const helper = createVillaFullscreen(f.canvas as unknown as HTMLCanvasElement, f.fit);
    helper.toggle(); const calls = f.fit.mock.calls.length; expect(helper.resize()).toBe(true); expect(f.fit).toHaveBeenCalledTimes(calls);
    viewport.width = 900; viewport.height = 1200; viewport.offsetLeft = 4; viewport.offsetTop = 12; viewport.dispatchEvent(new Event('resize'));
    expect(f.canvas.style.getPropertyValue('width')).toBe('900px'); expect(f.canvas.style.getPropertyValue('height')).toBe('562.5px');
    expect(f.host().style.getPropertyValue('left')).toBe('4px'); expect(f.host().style.getPropertyValue('top')).toBe('12px');
    f.doc.defaultView.devicePixelRatio = 2; helper.resize(); expect(f.fit).toHaveBeenLastCalledWith(900);
    const afterDpr = f.fit.mock.calls.length; viewport.width = 0; viewport.dispatchEvent(new Event('resize')); expect(f.fit).toHaveBeenCalledTimes(afterDpr);
    helper.destroy(); expect(viewport.listeners).toBe(0); expect(f.canvas.getAttribute('style')).toBe(f.originalStyle);
  });
  it('exits for shell menus without closing them or stealing search focus', () => {
    for (const panel of ['library', 'menu'] as const) {
      const f = make(); f.helper.toggle(); f.search.focus();
      if (panel === 'library') f.library.setAttribute('class', 'open'); else f.menu.removeAttribute('hidden'); ObserverMock.flush();
      expect(f.helper.active).toBe(false); expect(f.doc.activeElement).toBe(f.search);
      expect(panel === 'library' ? f.library.classList.contains('open') : !f.menu.hidden).toBe(true);
      expect(f.canvas.parentNode).toBe(f.parent); expect(ObserverMock.all.every(o => !o.connected)).toBe(true); f.helper.destroy();
    }
  });
  it('repairs search focus lost during native exit, without stealing a later choice or acting after destroy', async () => {
    for (const outcome of ['lost', 'chosen', 'destroyed']) {
      const f = make(), exited = pending(); f.search.setAttribute('id', 'searchInput');
      f.doc.request = async host => { f.doc.native(host); };
      f.doc.exitFullscreen.mockImplementation(() => { f.doc.native(null); return exited.promise; });
      f.helper.toggle(); await flush(); f.library.setAttribute('class', 'open'); ObserverMock.flush();
      const chosen = f.doc.createElement(); f.library.appendChild(chosen);
      f.doc.activeElement = outcome === 'chosen' ? chosen : f.doc.body;
      if (outcome === 'destroyed') f.helper.destroy();
      exited.resolve(); await flush();
      expect(f.doc.activeElement, outcome).toBe(outcome === 'lost' ? f.search : outcome === 'chosen' ? chosen : f.doc.body);
      f.helper.destroy();
    }
  });
  it('restores a detached original parent but never overwrites an externally reowned canvas', () => {
    const f = make(); f.helper.toggle(); f.parent.remove(); f.helper.destroy();
    expect(f.canvas.parentNode).toBe(f.parent); expect(f.canvas.isConnected).toBe(false);
    const other = make(); other.helper.toggle(); const owner = other.doc.createElement(); other.doc.body.appendChild(owner); owner.appendChild(other.canvas);
    other.canvas.setAttribute('style', 'width: 400px; height: 600px;'); const calls = other.fit.mock.calls.length;
    other.helper.destroy(); expect(other.canvas.parentNode).toBe(owner); expect(other.canvas.getAttribute('style')).toBe('width: 400px; height: 600px;');
    expect(other.fit).toHaveBeenCalledTimes(calls);
  });
  it('does not request native fullscreen or reattach observers after reentrant destruction', () => {
    const f = make(); f.helper.destroy(); const native = vi.fn(async () => {}); f.doc.request = native;
    const helper = createVillaFullscreen(f.canvas as unknown as HTMLCanvasElement, f.fit, active => { if (active) helper.destroy(); });
    helper.toggle(); expect(helper.active).toBe(false); expect(native).not.toHaveBeenCalled();
    expect(f.canvas.parentNode).toBe(f.parent); expect(f.canvas.getAttribute('style')).toBe(f.originalStyle);
    expect(f.doc.listeners).toBe(0); expect(f.doc.defaultView.listeners).toBe(0); expect(ObserverMock.all.every(o => !o.connected)).toBe(true);
  });
  it('restores before exit notification and releases only the owned pointer lock', () => {
    const f = make(); f.helper.destroy(); const notifications: boolean[] = [];
    const helper = createVillaFullscreen(f.canvas as unknown as HTMLCanvasElement, f.fit, active => {
      notifications.push(active); if (!active) { expect(f.canvas.parentNode).toBe(f.parent); expect(f.canvas.getAttribute('style')).toBe(f.originalStyle); }
    });
    helper.toggle(); f.doc.pointerLockElement = f.canvas; helper.toggle(); expect(f.doc.exitPointerLock).toHaveBeenCalledTimes(1);
    helper.toggle(); const foreign = f.doc.createElement(); f.doc.pointerLockElement = foreign; helper.destroy();
    expect(f.doc.pointerLockElement).toBe(foreign); expect(f.doc.exitPointerLock).toHaveBeenCalledTimes(1); expect(notifications).toEqual([true, false, true, false]);
  });
});
