import { describe, expect, it, vi } from 'vitest';
import { createGameFullscreen } from '../../src/ui/fullscreen';

class Doc extends EventTarget {
  fullscreenElement: unknown = null;
  fullscreenEnabled = true;
  native(element: unknown) { this.fullscreenElement = element; this.dispatchEvent(new Event('fullscreenchange')); }
  exitFullscreen = vi.fn(async () => { this.native(null); });
}
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
function fixture() {
  const doc = new Doc();
  const root = { ownerDocument: doc, requestFullscreen: vi.fn(async () => { doc.native(root); }) };
  const changed = vi.fn(), failed = vi.fn();
  const controller = createGameFullscreen(root as unknown as HTMLElement, changed, failed);
  return { doc, root, changed, failed, controller };
}

describe('shared app-root native fullscreen', () => {
  it('never requests automatically; the explicit action enters/exits the owned root', async () => {
    const { doc, root, controller } = fixture();
    expect(root.requestFullscreen).not.toHaveBeenCalled();
    controller.toggle();
    expect(root.requestFullscreen).toHaveBeenCalledOnce();
    await flush();
    expect(controller.active).toBe(true);
    expect(controller.pending).toBe(false);
    controller.toggle();
    await flush();
    expect(doc.exitFullscreen).toHaveBeenCalledOnce();
    expect(controller.active).toBe(false);
  });
  it('treats browser Escape as exit and never automatically re-enters', async () => {
    const { doc, root, controller } = fixture();
    controller.toggle(); await flush();
    doc.native(null); await flush();
    expect(controller.active).toBe(false);
    expect(root.requestFullscreen).toHaveBeenCalledOnce();
    controller.toggle(); await flush();
    expect(controller.active).toBe(true);
  });
  it('stays in webpage presentation when native support is absent/denied', async () => {
    const { doc, root, controller, failed } = fixture();
    doc.fullscreenEnabled = false;
    controller.toggle();
    expect(failed).toHaveBeenCalledOnce();
    expect(root.requestFullscreen).not.toHaveBeenCalled();
    doc.fullscreenEnabled = true;
    root.requestFullscreen.mockRejectedValueOnce(new Error('denied'));
    controller.toggle(); await flush();
    expect(failed).toHaveBeenCalledTimes(2);
    expect(controller.active).toBe(false);
    expect(controller.pending).toBe(false);
  });
  it('does not launch overlapping requests and exits a cancelled late entry', async () => {
    const { doc, root, controller } = fixture();
    const late = deferred();
    root.requestFullscreen.mockImplementationOnce(() => late.promise);
    controller.toggle(); controller.toggle();
    expect(root.requestFullscreen).toHaveBeenCalledOnce();
    doc.native(root); late.resolve(); await flush();
    expect(controller.active).toBe(false);
    expect(controller.pending).toBe(false);
  });
  it('cleans up a pending entry after destruction without notifying dead UI', async () => {
    const { doc, root, controller, changed } = fixture();
    const late = deferred();
    root.requestFullscreen.mockImplementationOnce(() => late.promise);
    controller.toggle(); controller.destroy(); controller.destroy();
    const calls = changed.mock.calls.length;
    doc.native(root); late.resolve(); await flush();
    expect(controller.active).toBe(false);
    expect(changed).toHaveBeenCalledTimes(calls);
  });
  it('never exits or replaces fullscreen owned by another element', () => {
    const { doc, root, controller, failed } = fixture();
    const other = {};
    doc.native(other);
    controller.toggle(); controller.destroy();
    expect(failed).toHaveBeenCalledOnce();
    expect(root.requestFullscreen).not.toHaveBeenCalled();
    expect(doc.exitFullscreen).not.toHaveBeenCalled();
    expect(doc.fullscreenElement).toBe(other);
  });
});
