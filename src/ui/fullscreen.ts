export interface GameFullscreen {
  readonly active: boolean;
  readonly pending: boolean;
  toggle(): void;
  destroy(): void;
}

/** The app root (including every menu), not a transient game canvas, owns native fullscreen. */
export function createGameFullscreen(
  root: HTMLElement,
  onChange: () => void,
  onFailure: () => void,
): GameFullscreen {
  const doc = root.ownerDocument;
  let pending = false;
  let wanted = false;
  let destroyed = false;
  const active = () => doc.fullscreenElement === root;
  const notify = () => { if (!destroyed) onChange(); };
  const exitOwned = () => {
    if (!active()) return;
    try { void Promise.resolve(doc.exitFullscreen()).catch(() => { if (!destroyed) onFailure(); }); }
    catch { if (!destroyed) onFailure(); }
  };
  const changed = () => {
    if (active() && (!wanted || destroyed)) exitOwned();
    if (!active() && !pending) wanted = false;
    notify();
  };
  doc.addEventListener('fullscreenchange', changed);
  return {
    get active() { return active(); },
    get pending() { return pending; },
    toggle() {
      if (destroyed) return;
      // Cancel an unsettled request; never launch overlapping native requests.
      if (pending) { wanted = false; exitOwned(); notify(); return; }
      if (active()) { wanted = false; exitOwned(); return; }
      if (!root.requestFullscreen || doc.fullscreenEnabled === false || doc.fullscreenElement) {
        onFailure(); return;
      }
      wanted = true;
      pending = true;
      notify();
      const settled = () => {
        pending = false;
        if (destroyed || !wanted) exitOwned();
        notify();
      };
      try {
        // Must stay in the button's trusted event stack, not after an await.
        void Promise.resolve(root.requestFullscreen()).then(settled, () => {
          if (!destroyed && wanted) onFailure();
          wanted = false;
          settled();
        });
      } catch {
        wanted = false;
        if (!destroyed) onFailure();
        settled();
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      wanted = false;
      doc.removeEventListener('fullscreenchange', changed);
      exitOwned();
      // A pending request retains settled(), which exits only this root if it arrives late.
    },
  };
}
