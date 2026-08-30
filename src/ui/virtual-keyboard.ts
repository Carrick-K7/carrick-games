import type { GameMeta } from '../games/catalog.js';
import { normalizeKey } from './keyboard-input.js';

function keycap(label: string): string {
  const key = normalizeKey(label);
  return `<button class="vkey" type="button" data-key="${key}" aria-label="${label}">${label}</button>`;
}

/**
 * Render only the inputs the current game actually uses. The strip remains
 * interactive and mirrors real keyboard/mouse presses without drawing an
 * entire inactive keyboard.
 */
export function renderVirtualKeyboard(controls: GameMeta['controls'], zh: boolean): string {
  const rows = (controls.keyboard ?? []).map((entry) => `
    <div class="input-map-row">
      <span class="input-map-keys">${entry.keys.map(keycap).join('')}</span>
      <span class="input-map-action">${zh ? entry.actionZh : entry.action}</span>
    </div>
  `).join('');

  return `
    <div class="compact-inputs" id="vkeyboard">
      <div class="input-map-rows">${rows}</div>
      <div class="compact-mouse" id="vmouse" aria-label="${zh ? '鼠标输入' : 'Mouse input'}">
        <span class="compact-mouse-button compact-mouse-left" data-mbtn="0"></span>
        <span class="compact-mouse-button compact-mouse-right" data-mbtn="2"></span>
        <span class="compact-mouse-wheel" data-mbtn="1"></span>
      </div>
    </div>
  `;
}
