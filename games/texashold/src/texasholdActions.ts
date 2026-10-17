export type PokerActionId = 'fold' | 'call' | 'raise' | 'all-in' | 'next' | 'cancel' | 'details';

export interface PokerAction {
  id: PokerActionId;
  label: string;
  enabled: boolean;
  primary?: boolean;
}

/** Native, game-owned controls. Layout values are CSS pixels in the canvas parent. */
export class PokerActions {
  private readonly root: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly details: HTMLDivElement;
  private readonly detailsTitle: HTMLDivElement;
  private readonly detailsBody: HTMLDivElement;
  private readonly buttons = new Map<PokerActionId, HTMLButtonElement>();
  private hidden = true;
  private dark: boolean | undefined;
  private destroyed = false;

  constructor(canvas: HTMLCanvasElement, onAction: (id: PokerActionId) => void) {
    const parent = canvas.parentElement;
    if (!parent) throw new Error('PokerActions requires a canvas parent');
    const document = canvas.ownerDocument;
    this.root = document.createElement('div');
    this.root.dataset.texasholdActions = '';
    this.root.hidden = true;
    this.root.style.cssText = 'position:absolute;display:none;gap:8px;box-sizing:border-box;z-index:2;';

    const style = document.createElement('style');
    style.textContent = `
      [data-texashold-actions] > button {
        background:var(--poker-surface);color:var(--poker-text);border-color:var(--poker-border);
        border-style:solid;cursor:pointer;
        transition:background-color 100ms ease,filter 100ms ease;
      }
      [data-texashold-actions] > button[data-primary] {
        background:var(--poker-accent);color:var(--poker-on-accent);border-color:var(--poker-accent);
      }
      [data-texashold-actions] > button:enabled:hover {
        box-shadow:inset 0 0 0 1px currentColor;
      }
      [data-texashold-actions] > button:enabled:active {
        filter:brightness(.92);
      }
      [data-texashold-actions] > button:disabled {
        background:var(--poker-disabled);color:var(--poker-muted);border-color:var(--poker-border);
        cursor:not-allowed;opacity:1;
      }
      [data-texashold-actions] > button:focus-visible {
        outline:3px solid var(--poker-accent);outline-offset:3px;
      }
      @media (prefers-reduced-motion:reduce) {
        [data-texashold-actions] > button { transition:none; }
      }
    `;
    this.status = document.createElement('div');
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    this.status.setAttribute('aria-atomic', 'true');
    this.status.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0;';
    // Readable between-hand context, not a second live announcement or a grid item.
    // The controller supplies details only while the nonmodal disclosure is open.
    this.details = document.createElement('div');
    this.details.dataset.texasholdDetails = '';
    let detailsId = 'texashold-details';
    for (let suffix = 1; document.getElementById(detailsId); suffix++) {
      detailsId = `texashold-details-${suffix}`;
    }
    this.details.id = detailsId;
    this.details.setAttribute('role', 'region');
    this.details.setAttribute('aria-labelledby', `${detailsId}-title`);
    // Keyboard users can focus and scroll long explanations without a focus trap.
    this.details.tabIndex = 0;
    this.details.hidden = true;
    this.details.style.cssText = 'position:absolute;bottom:calc(100% + 28px);left:50%;transform:translateX(-50%);box-sizing:border-box;width:100%;max-width:min(100%,440px);max-height:min(180px, calc(100dvh - 160px));overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--poker-border) transparent;padding:8px 12px;border:1px solid var(--poker-border);border-radius:8px;background:var(--poker-surface);color:var(--poker-text);font:400 14px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-variant-numeric:tabular-nums;white-space:normal;overflow-wrap:anywhere;';
    this.detailsTitle = document.createElement('div');
    this.detailsTitle.id = `${detailsId}-title`;
    this.detailsTitle.style.cssText = 'font-size:14px;font-weight:600;line-height:1.4;';
    this.detailsBody = document.createElement('div');
    this.detailsBody.style.cssText = 'margin-top:4px;color:var(--poker-muted);white-space:pre-line;';
    this.details.append(this.detailsTitle, this.detailsBody);
    this.root.append(style, this.details, this.status);

    // Keep native keyboard activation, but never let it become a gameplay/restart key.
    const stopActivationKey = (event: KeyboardEvent) => {
      if (event.key === ' ' || event.key === 'Enter' || event.code === 'Space') {
        event.stopPropagation();
        // A held native activation key must not arm and then confirm an action.
        if (event.type === 'keydown' && event.repeat) event.preventDefault();
      }
    };
    this.root.addEventListener('keydown', stopActivationKey);
    this.root.addEventListener('keyup', stopActivationKey);
    this.root.addEventListener('mousedown', event => event.stopPropagation());
    // Click alone covers mouse, touch, keyboard and assistive technology: no duplicate
    // pointerup activation and no action on a cancelled pointer gesture.
    this.root.addEventListener('click', event => {
      event.stopPropagation();
      if (this.destroyed || this.hidden) return;
      for (const [id, button] of this.buttons) {
        if (event.target === button && !button.disabled && !button.hidden) {
          // Require a separate intentional click to confirm, not a double-click.
          if (id === 'all-in' && event.detail > 1) return;
          onAction(id);
          return;
        }
      }
    });
    parent.append(this.root);
  }

  sync(options: {
    actions: PokerAction[];
    x: number;
    y: number;
    width: number;
    columns: number;
    dark: boolean;
    hidden: boolean;
    status: string;
    details?: { title: string; body: string };
  }): void {
    if (this.destroyed) return;
    const { actions, x, y, width, columns, dark, hidden, status, details } = options;
    this.hidden = hidden;
    if (this.root.hidden !== hidden) this.root.hidden = hidden;
    const layout: Record<string, string> = {
      display: hidden ? 'none' : 'grid',
      left: `${x}px`,
      top: `${y}px`,
      width: `${Math.max(0, width)}px`,
      'grid-template-columns': `repeat(${Number.isFinite(columns) ? Math.max(1, Math.floor(columns)) : 1}, minmax(0, 1fr))`,
    };
    for (const [property, value] of Object.entries(layout)) {
      if (this.root.style.getPropertyValue(property) !== value) this.root.style.setProperty(property, value);
    }
    if (this.dark !== dark) {
      this.dark = dark;
      const palette = {
        surface: dark ? '#151F1B' : '#FFFFFF',
        text: dark ? '#EDF5F1' : '#14231F',
        border: dark ? '#3A4C43' : '#C9D4CE',
        accent: dark ? '#5EEAD4' : '#0F766E',
        'on-accent': dark ? '#14231F' : '#FFFFFF',
        disabled: dark ? '#1C2923' : '#E9EEEB',
        muted: dark ? '#A6B9AF' : '#5B6E66',
      };
      for (const [name, value] of Object.entries(palette)) {
        this.root.style.setProperty(`--poker-${name}`, value);
      }
    }
    if (this.status.textContent !== status) this.status.textContent = status;
    const detailsHidden = hidden || !details;
    const returnDetailsFocus = detailsHidden && !hidden && this.details.contains(this.root.ownerDocument.activeElement)
      && actions.some(action => action.id === 'details' && action.enabled);
    if (this.details.hidden !== detailsHidden) this.details.hidden = detailsHidden;
    const detailsButton = this.buttons.get('details');
    if (detailsButton && detailsButton.getAttribute('aria-expanded') !== String(!detailsHidden)) {
      detailsButton.setAttribute('aria-expanded', String(!detailsHidden));
    }
    if (details) {
      if (this.detailsTitle.textContent !== details.title) this.detailsTitle.textContent = details.title;
      if (this.detailsBody.textContent !== details.body) this.detailsBody.textContent = details.body;
    }

    const focused = this.root.ownerDocument.activeElement;
    const present = new Set(actions.map(action => action.id));
    for (const [id, button] of this.buttons) {
      if (!present.has(id)) {
        if (!button.hidden) button.hidden = true;
        if (!button.disabled) button.disabled = true;
        if (button.style.display !== 'none') button.style.display = 'none';
      }
    }
    let cursor = this.status.nextSibling;
    for (const action of actions) {
      let button = this.buttons.get(action.id);
      if (!button) {
        button = this.root.ownerDocument.createElement('button');
        button.type = 'button';
        button.dataset.action = action.id;
        if (action.id === 'details') {
          button.setAttribute('aria-controls', this.details.id);
          button.setAttribute('aria-expanded', String(!detailsHidden));
        }
        button.style.cssText = 'appearance:none;box-sizing:border-box;min-width:0;width:100%;height:48px;margin:0;padding:0 8px;border-width:1px;border-radius:10px;font:500 14px/1.25 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-variant-numeric:tabular-nums;text-align:center;white-space:normal;overflow-wrap:anywhere;touch-action:manipulation;';
        this.buttons.set(action.id, button);
      }
      if (button.textContent !== action.label) button.textContent = action.label;
      if (button.hidden) button.hidden = false;
      const disabled = hidden || !action.enabled;
      if (button.disabled !== disabled) button.disabled = disabled;
      if (button.hasAttribute('data-primary') !== !!action.primary) {
        button.toggleAttribute('data-primary', !!action.primary);
      }
      if (button.style.display !== 'block') button.style.display = 'block';
      // Only change DOM order when the action list changes; stable frames keep focus.
      if (button !== cursor) this.root.insertBefore(button, cursor);
      cursor = button.nextSibling;
    }
    if (returnDetailsFocus) this.buttons.get('details')?.focus({ preventScroll: true });
    if (!hidden && focused === this.buttons.get('cancel') && !present.has('cancel')) {
      const allIn = this.buttons.get('all-in');
      if (allIn && !allIn.disabled && !allIn.hidden) allIn.focus({ preventScroll: true });
    }
    // Moving a retained button can blur it in older browsers; preserve logical focus
    // on reorder, but never steal focus back from a shell overlay or disabled action.
    if (!hidden && focused !== this.root.ownerDocument.activeElement) {
      for (const button of this.buttons.values()) {
        if (focused === button && !button.disabled && !button.hidden) {
          button.focus({ preventScroll: true });
          break;
        }
      }
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.hidden = true;
    this.root.remove();
    this.buttons.clear();
  }
}
