import type { GameMeta } from '../games/catalog.js';

/** Catalog content is data; all games share this markup and the shell's styles. */
export function escapeGuideText(text: string): string {
  return text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

export function renderTouchGuide(controls: GameMeta['controls'], zh: boolean): string {
  const labels = zh
    ? { tap: '轻点', swipe: '滑动', 'swipe-up': '上滑', 'swipe-down': '下滑', 'swipe-left': '左滑', 'swipe-right': '右滑', hold: '按住' }
    : { tap: 'Tap', swipe: 'Drag', 'swipe-up': 'Swipe ↑', 'swipe-down': 'Swipe ↓', 'swipe-left': 'Swipe ←', 'swipe-right': 'Swipe →', hold: 'Hold' };
  if (!controls.touch?.length) return '';
  return `<h3 class="guide-section-title">${zh ? '触屏操作' : 'Touch controls'}</h3><ul class="guide-touch-rows">${controls.touch.map(entry =>
    `<li class="guide-touch-row"><span class="guide-gesture">${labels[entry.icon]}</span><span>${escapeGuideText(zh ? entry.actionZh : entry.action)}</span></li>`
  ).join('')}</ul>`;
}

export function renderGuideNotes(controls: GameMeta['controls'], zh: boolean): string {
  return (controls.notes ?? []).map(note => `<p>${escapeGuideText(zh ? note.textZh : note.text)}</p>`).join('');
}
