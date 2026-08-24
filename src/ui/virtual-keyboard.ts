import type { VirtualKeySpec } from "../games/catalog.js";
import { normalizeKey } from './keyboard-input.js';

export function renderVirtualKeyboard(activeKeys: string[], panelKeys?: VirtualKeySpec[]) {
  const enabledKeys = new Set(activeKeys);

  if (panelKeys?.length) {
    return `
      <div class="vkeyboard vkeyboard-compact" id="vkeyboard">
        <div class="vkeyboard-row">
          ${panelKeys.map((key) => {
            const normalizedKey = normalizeKey(key.key);
            return `<div class="vkey ${key.classes || ''}" data-key="${normalizedKey}">${key.label}</div>`;
          }).join('')}
        </div>
      </div>
    `;
  }

  const mk = (label: string, key: string, wClass: string, enabled: boolean) => {
    const normalizedKey = normalizeKey(key);
    const dataAttr = enabled ? ` data-key="${normalizedKey}"` : '';
    const cls = `${wClass} ${enabled ? '' : ' inactive'}`;
    return `<div class="vkey ${cls}"${dataAttr}>${label}</div>`;
  };

  const a = (key: string) => enabledKeys.has(normalizeKey(key));

  // Standard ANSI 60% layout (no numpad)
  return `
    <div class="vkeyboard" id="vkeyboard">
      <!-- Row 1: Numbers -->
      <div class="vkeyboard-row">
        ${mk('`', '`', 'w-1', a('`'))}
        ${mk('1', '1', 'w-1', a('1'))}
        ${mk('2', '2', 'w-1', a('2'))}
        ${mk('3', '3', 'w-1', a('3'))}
        ${mk('4', '4', 'w-1', a('4'))}
        ${mk('5', '5', 'w-1', a('5'))}
        ${mk('6', '6', 'w-1', a('6'))}
        ${mk('7', '7', 'w-1', a('7'))}
        ${mk('8', '8', 'w-1', a('8'))}
        ${mk('9', '9', 'w-1', a('9'))}
        ${mk('0', '0', 'w-1', a('0'))}
        ${mk('-', '-', 'w-1', a('-'))}
        ${mk('=', '=', 'w-1', a('='))}
        ${mk('←', 'Backspace', 'w-2', a('Backspace'))}
      </div>
      <!-- Row 2: QWERTY -->
      <div class="vkeyboard-row">
        ${mk('Tab', 'Tab', 'w-1-5', a('Tab'))}
        ${mk('Q', 'q', 'w-1', a('q'))}
        ${mk('W', 'w', 'w-1', a('w'))}
        ${mk('E', 'e', 'w-1', a('e'))}
        ${mk('R', 'r', 'w-1', a('r'))}
        ${mk('T', 't', 'w-1', a('t'))}
        ${mk('Y', 'y', 'w-1', a('y'))}
        ${mk('U', 'u', 'w-1', a('u'))}
        ${mk('I', 'i', 'w-1', a('i'))}
        ${mk('O', 'o', 'w-1', a('o'))}
        ${mk('P', 'p', 'w-1', a('p'))}
        ${mk('[', '[', 'w-1', a('['))}
        ${mk(']', ']', 'w-1', a(']'))}
        ${mk('\\', '\\', 'w-1-5', a('\\'))}
      </div>
      <!-- Row 3: ASDF -->
      <div class="vkeyboard-row">
        ${mk('Caps', 'CapsLock', 'w-1-75', a('CapsLock'))}
        ${mk('A', 'a', 'w-1', a('a'))}
        ${mk('S', 's', 'w-1', a('s'))}
        ${mk('D', 'd', 'w-1', a('d'))}
        ${mk('F', 'f', 'w-1', a('f'))}
        ${mk('G', 'g', 'w-1', a('g'))}
        ${mk('H', 'h', 'w-1', a('h'))}
        ${mk('J', 'j', 'w-1', a('j'))}
        ${mk('K', 'k', 'w-1', a('k'))}
        ${mk('L', 'l', 'w-1', a('l'))}
        ${mk(';', ';', 'w-1', a(';'))}
        ${mk("'", "'", 'w-1', a("'"))}
        ${mk('Enter', 'Enter', 'w-2-25', a('Enter'))}
      </div>
      <!-- Row 4: ZXCV + ↑ -->
      <div class="vkeyboard-row">
        ${mk('Shift', 'Shift', 'w-2-25', a('Shift'))}
        ${mk('Z', 'z', 'w-1', a('z'))}
        ${mk('X', 'x', 'w-1', a('x'))}
        ${mk('C', 'c', 'w-1', a('c'))}
        ${mk('V', 'v', 'w-1', a('v'))}
        ${mk('B', 'b', 'w-1', a('b'))}
        ${mk('N', 'n', 'w-1', a('n'))}
        ${mk('M', 'm', 'w-1', a('m'))}
        ${mk(',', ',', 'w-1', a(','))}
        ${mk('.', '.', 'w-1', a('.'))}
        ${mk('/', '/', 'w-1', a('/'))}
        ${mk('↑', 'ArrowUp', 'w-1', a('ArrowUp'))}
        ${mk('Shift', 'ShiftRight', 'w-1-75', a('Shift'))}
      </div>
      <!-- Row 5: Bottom row + ←↓→ -->
      <div class="vkeyboard-row">
        ${mk('Ctrl', 'Control', 'w-1-25', a('Control'))}
        ${mk('Win', 'Meta', 'w-1-25', a('Meta'))}
        ${mk('Alt', 'Alt', 'w-1-25', a('Alt'))}
        ${mk('Space', ' ', 'w-5-25', a(' '))}
        ${mk('Alt', 'AltGraph', 'w-1', a('AltGraph'))}
        ${mk('Fn', 'Fn', 'w-1', a('Fn'))}
        ${mk('Ctrl', 'ControlRight', 'w-1', a('Control'))}
        ${mk('←', 'ArrowLeft', 'w-1', a('ArrowLeft'))}
        ${mk('↓', 'ArrowDown', 'w-1', a('ArrowDown'))}
        ${mk('→', 'ArrowRight', 'w-1', a('ArrowRight'))}
      </div>
    </div>
  `;
}
