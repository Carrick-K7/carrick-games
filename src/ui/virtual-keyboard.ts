import type { VirtualKeySpec } from "../games/catalog.js";
import { normalizeKey } from './keyboard-input.js';

/**
 * Compact keyboard panel: only the keys the current game actually uses.
 * Arrow keys render as a directional cluster; everything else is a chip.
 * The full 60% ANSI keyboard was dropped — it cost a whole screen band and
 * mostly showed keys that do nothing.
 */

const ARROW_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

const KEY_LABELS: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  ' ': 'Space',
  Escape: 'Esc',
  Control: 'Ctrl',
  Mouse: '🖱',
};

function keyLabel(normalizedKey: string): string {
  const mapped = KEY_LABELS[normalizedKey];
  if (mapped) return mapped;
  return normalizedKey.length === 1 ? normalizedKey.toUpperCase() : normalizedKey;
}

function chip(normalizedKey: string, label: string, extraClass = ''): string {
  return `<div class="vkey vk-chip${extraClass}" data-key="${normalizedKey}">${label}</div>`;
}

function arrowCluster(present: Set<string>): string {
  if (![...ARROW_KEYS].some((k) => present.has(k))) return '';
  const cell = (key: string, area: string) =>
    present.has(key)
      ? `<div class="vkey vk-arrow" style="grid-area:${area}" data-key="${key}">${keyLabel(key)}</div>`
      : `<div class="vk-arrow-spacer" style="grid-area:${area}"></div>`;
  return `<div class="vk-arrows">
    ${cell('ArrowUp', 'up')}
    ${cell('ArrowLeft', 'left')}
    ${cell('ArrowDown', 'down')}
    ${cell('ArrowRight', 'right')}
  </div>`;
}

export function renderVirtualKeyboard(activeKeys: string[], panelKeys?: VirtualKeySpec[]) {
  if (panelKeys?.length) {
    return `
      <div class="vkeyboard vkeyboard-compact" id="vkeyboard">
        <div class="vkeyboard-row vk-wrap">
          ${panelKeys.map((key) => {
            const normalizedKey = normalizeKey(key.key);
            return `<div class="vkey vk-chip ${key.classes || ''}" data-key="${normalizedKey}">${key.label}</div>`;
          }).join('')}
        </div>
      </div>
    `;
  }

  const seen = new Set<string>();
  const used: string[] = [];
  for (const raw of activeKeys) {
    const key = normalizeKey(raw);
    if (seen.has(key)) continue;
    seen.add(key);
    used.push(key);
  }
  if (!used.length) return '';

  const arrows = arrowCluster(seen);
  const others = used.filter((k) => !ARROW_KEYS.has(k));

  return `
    <div class="vkeyboard vkeyboard-keys" id="vkeyboard">
      <div class="vkeyboard-row vk-wrap">
        ${arrows}
        ${others.map((k) => chip(k, keyLabel(k))).join('')}
      </div>
    </div>
  `;
}
