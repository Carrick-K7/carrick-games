import type { GuideContent } from './control-guide.js';
import { normalizeKey } from './keyboard-input.js';
import { escapeHtml as escapeGuideText } from './html.js';

function keycap(label: string, interactive: boolean): string {
  const key = escapeGuideText(normalizeKey(label)), text = escapeGuideText(label);
  return interactive
    ? `<button class="vkey" type="button" data-key="${key}" aria-label="${text}">${text}</button>`
    : `<kbd class="vkey" data-key="${key}">${text}</kbd>`;
}

/** Render real mappings only. The common guide always requests read-only keycaps. */
export function renderVirtualKeyboard(controls: GuideContent, zh: boolean, interactive = true): string {
  const rows = (controls.keyboard ?? []).map((entry) => `
    <div class="input-map-row">
      <span class="input-map-keys">${entry.keys.map(key => keycap(key, interactive)).join('')}</span>
      <span class="input-map-action">${escapeGuideText(zh ? entry.actionZh : entry.action)}</span>
    </div>
  `).join('');

  return `
    <div class="compact-inputs">
      <div class="input-map-rows">${rows}</div>
    </div>
  `;
}
