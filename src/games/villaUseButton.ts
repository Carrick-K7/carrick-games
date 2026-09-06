export interface VillaUseButtonState {
  visible: boolean;
  x: number; y: number; radius: number;
  width: number; height: number;
  label: string;
}

/** Native, accessible touch target above the painted circle. No canvas input forwarding. */
export function createVillaUseButton(canvas: HTMLCanvasElement, onUse: () => void) {
  const doc = canvas.ownerDocument, view = doc.defaultView;
  const button = doc.createElement('button');
  button.type = 'button'; button.hidden = true; button.setAttribute('data-villa-use', 'true');
  button.style.cssText = 'position:fixed;z-index:30;box-sizing:border-box;border:0;border-radius:50%;padding:0;margin:0;background:transparent;color:transparent;appearance:none;-webkit-appearance:none;touch-action:none;cursor:pointer;outline-offset:2px;';
  let state: VillaUseButtonState | null = null, destroyed = false, suppressClickUntil = 0;
  const contacts = new Set<number>();
  const sync = () => {
    if (destroyed) return;
    if (!state?.visible || !canvas.isConnected || doc.hidden) { button.hidden = true; button.style.display = 'none'; contacts.clear(); return; }
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) { button.hidden = true; button.style.display = 'none'; return; }
    // The shared app root is the native fullscreen element, so an overlay inside
    // it stays visible and accessible in fullscreen; never escape to outside nodes.
    const parent = canvas.closest('#gameApp') ?? doc.body;
    if (button.parentNode !== parent) parent.appendChild(button);
    let zIndex = 30;
    for (let node: HTMLElement | null = canvas; node && node !== parent && node !== doc.body; node = node.parentElement)
      zIndex = Math.max(zIndex, Number.parseInt(view?.getComputedStyle(node).zIndex ?? '0') || 0);
    button.style.zIndex = String(Math.min(2147483647, zIndex + 1));
    button.hidden = false; button.style.display = 'block'; button.setAttribute('aria-label', state.label);
    button.style.left = `${rect.left + (state.x - state.radius) * rect.width / state.width}px`;
    button.style.top = `${rect.top + (state.y - state.radius) * rect.height / state.height}px`;
    button.style.width = `${state.radius * 2 * rect.width / state.width}px`;
    button.style.height = `${state.radius * 2 * rect.height / state.height}px`;
  };
  const touchStart = (event: TouchEvent) => {
    event.preventDefault(); event.stopPropagation();
    const alreadyDown = contacts.size > 0;
    for (const touch of Array.from(event.changedTouches)) contacts.add(touch.identifier);
    suppressClickUntil = Date.now() + 800;
    if (!destroyed && state?.visible && !alreadyDown && contacts.size) onUse();
  };
  const touchEnd = (event: TouchEvent) => {
    event.preventDefault(); event.stopPropagation();
    if (event.type === 'touchcancel') contacts.clear();
    else for (const touch of Array.from(event.changedTouches)) contacts.delete(touch.identifier);
    suppressClickUntil = Date.now() + 800;
  };
  const click = (event: MouseEvent) => {
    event.preventDefault(); event.stopPropagation();
    // Safari compatibility clicks must not immediately undo a touch toggle.
    // Keyboard and assistive activation use detail=0 and remain available.
    if (!destroyed && state?.visible && (event.detail === 0 || Date.now() >= suppressClickUntil)) onUse();
  };
  const key = (event: KeyboardEvent) => {
    // Let the native button synthesize one click, not the game's Space/jump shortcut.
    if (event.key === ' ' || event.key === 'Enter') event.stopPropagation();
  };
  const cancel = () => { contacts.clear(); sync(); };
  view?.addEventListener('blur', cancel); doc.addEventListener('visibilitychange', cancel);
  button.addEventListener('touchstart', touchStart, { passive: false });
  button.addEventListener('touchend', touchEnd, { passive: false });
  button.addEventListener('touchcancel', touchEnd, { passive: false });
  button.addEventListener('click', click);
  button.addEventListener('keydown', key); // Keyup must bubble so previously held game keys can be released.
  view?.addEventListener('scroll', sync, true); view?.addEventListener('resize', sync);
  view?.visualViewport?.addEventListener('scroll', sync); view?.visualViewport?.addEventListener('resize', sync);
  return {
    update(next: VillaUseButtonState) { state = next; sync(); },
    hide() { if (state) state = { ...state, visible: false }; sync(); },
    destroy() {
      if (destroyed) return;
      destroyed = true; contacts.clear(); button.remove();
      button.removeEventListener('touchstart', touchStart); button.removeEventListener('touchend', touchEnd);
      button.removeEventListener('touchcancel', touchEnd); button.removeEventListener('click', click);
      button.removeEventListener('keydown', key);
      view?.removeEventListener('blur', cancel); doc.removeEventListener('visibilitychange', cancel);
      view?.removeEventListener('scroll', sync, true); view?.removeEventListener('resize', sync);
      view?.visualViewport?.removeEventListener('scroll', sync); view?.visualViewport?.removeEventListener('resize', sync);
    },
  };
}
