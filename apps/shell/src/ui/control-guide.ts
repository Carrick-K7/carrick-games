import type { ControlNote, ControlSection, GameControls, KeyboardControl, TouchControl } from '@carrick/game-sdk/catalog';
import { escapeHtml } from './html.js';
import { renderVirtualKeyboard } from './virtual-keyboard.js';

export type GuideMode = 'keyboard' | 'touch';
export type KeyboardGuideEntry = KeyboardControl;
export type TouchGuideEntry = TouchControl;
export type GuideNote = ControlNote;
export type GuideContent = Pick<GameControls, 'keyboard' | 'touch' | 'notes'>;
export type GuideSection = ControlSection;
export type GuideControls = GameControls;

/** Kept as an alias for existing callers; plain metadata is always escaped. */
export const escapeGuideText = escapeHtml;

export function renderTouchGuide(controls: GuideContent, zh: boolean): string {
  const labels = zh
    ? { tap: '轻点', swipe: '滑动', 'swipe-up': '上滑', 'swipe-down': '下滑', 'swipe-left': '左滑', 'swipe-right': '右滑', hold: '按住' }
    : { tap: 'Tap', swipe: 'Drag', 'swipe-up': 'Swipe ↑', 'swipe-down': 'Swipe ↓', 'swipe-left': 'Swipe ←', 'swipe-right': 'Swipe →', hold: 'Hold' };
  if (!controls.touch?.length) return '';
  return `<ul class="guide-touch-rows">${controls.touch.map(entry =>
    `<li class="guide-touch-row"><span class="guide-gesture">${labels[entry.icon]}</span><span>${escapeHtml(zh ? entry.actionZh : entry.action)}</span></li>`
  ).join('')}</ul>`;
}

export function renderGuideNotes(controls: GuideContent, zh: boolean, mode?: GuideMode): string {
  return (controls.notes ?? []).filter(note => !mode || !note.audience || note.audience === 'all' || note.audience === mode)
    .map(note => `<p>${escapeHtml(zh ? note.textZh : note.text)}</p>`).join('');
}

export function guideHasMode(controls: GuideControls, mode: GuideMode): boolean {
  return !!(controls[mode]?.length || controls.sections?.some(section => section[mode]?.length));
}

function disclosure(title: string, content: string): string {
  return `<details class="guide-details"><summary>${escapeHtml(title)}<span aria-hidden="true">⌄</span></summary><div class="guide-details-content">${content}</div></details>`;
}

/** At most three essentials; every other original mapping remains in a native disclosure. */
export function renderGuideMode(controls: GuideControls, zh: boolean, mode: GuideMode): string {
  const render = (content: GuideContent) => mode === 'keyboard'
    ? renderVirtualKeyboard(content, zh, false)
    : renderTouchGuide(content, zh);
  const entries = controls[mode] ?? [];
  const essentials: GuideContent = { [mode]: entries.slice(0, 3) };
  const remaining: GuideContent = { [mode]: entries.slice(3) };
  let html = entries.length ? `<section class="guide-basics"><h3 class="guide-section-title">${zh ? '基本操作' : 'The essentials'}</h3>${render(essentials)}</section>` : '';
  if (entries.length > 3) html += disclosure(zh ? '更多操作' : 'More controls', render(remaining));
  for (const section of controls.sections ?? []) {
    const notes = renderGuideNotes(section, zh, mode);
    if (!section[mode]?.length && !notes) continue;
    html += disclosure(zh ? section.titleZh : section.title, `${render(section)}${notes ? `<div class="guide-section-notes">${notes}</div>` : ''}`);
  }
  return html;
}

export function renderGuideNoteDisclosure(controls: GuideControls, zh: boolean, mode: GuideMode): string {
  const notes = renderGuideNotes(controls, zh, mode);
  return notes ? disclosure(zh ? '玩法与提示' : 'Good to know', notes) : '';
}
