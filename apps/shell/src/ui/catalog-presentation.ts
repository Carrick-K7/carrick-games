import type { GameMeta } from '@carrick/game-sdk/catalog';
import { renderGameIcon } from './game-icons.js';
import { escapeHtml, sameOriginImageUrl } from './html.js';

/** Presentation consumes metadata, never the catalog loader or game implementation. */
export interface LibraryGame extends Pick<GameMeta, 'id' | 'name' | 'nameZh' | 'desc' | 'descZh' | 'icon' | 'controls'> {
  cover?: string | GameMeta['cover'];
}

const arrow = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 10h11m-4-4 4 4-4 4"/></svg>';
const check = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m3 8 3 3 7-7"/></svg>';

export function renderGameCard(game: LibraryGame, currentId: string | null, zh: boolean, currentRunning = true): string {
  const current = game.id === currentId;
  const name = zh ? game.nameZh : game.name;
  const description = zh ? game.descZh : game.desc;
  const rawCover = typeof game.cover === 'string' ? game.cover : game.cover?.src;
  const cover = rawCover ? sameOriginImageUrl(rawCover) : null;
  const focal = typeof game.cover === 'object' ? game.cover.focalPoint : undefined;
  const point = (value?: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value!)) * 100 : 50;
  const image = cover ? `<img class="game-cover-image" src="${escapeHtml(cover)}" alt="" width="640" height="400" loading="lazy" decoding="async" style="object-position:${point(focal?.x)}% ${point(focal?.y)}%">` : '';
  const keyboard = !!(game.controls.keyboard?.length || game.controls.sections?.some(section => section.keyboard?.length));
  const touch = !!(game.controls.touch?.length || game.controls.sections?.some(section => section.touch?.length));
  const input = keyboard && touch ? (zh ? '键鼠 / 触屏' : 'Keys / touch') : touch ? (zh ? '触屏操作' : 'Touch controls') : (zh ? '键鼠操作' : 'Keyboard & mouse');
  // A retained loading/stopped scene can be returned to without starting or
  // replacing it; only a real running receipt warrants Playing/Continue.
  const action = current ? currentRunning ? (zh ? '继续游戏' : 'Continue') : (zh ? '返回游戏' : 'Return') : (zh ? '开始玩' : 'Play');
  const status = currentRunning ? (zh ? '正在玩' : 'Playing') : (zh ? '当前游戏' : 'Current');
  return `<button class="game-list-item${current ? ' active' : ''}" type="button" data-id="${escapeHtml(game.id)}" aria-current="${current}" aria-label="${escapeHtml(`${name} — ${action}`)}" aria-describedby="game-description-${escapeHtml(game.id)}" title="${escapeHtml(description)}">
    <span class="game-list-cover" aria-hidden="true">
      <span class="game-list-icon">${renderGameIcon(game.icon)}</span>${image}
      ${current ? `<span class="game-list-status">${check}${status}</span>` : ''}
    </span>
    <span class="game-list-copy"><span class="game-list-name">${escapeHtml(name)}</span><span class="game-list-desc" id="game-description-${escapeHtml(game.id)}">${escapeHtml(description)}</span></span>
    <span class="game-list-bottom"><span class="game-list-input">${current ? action : input}</span><span class="game-list-arrow">${arrow}</span></span>
  </button>`;
}

/** Patch only render-owned differences. Comparing the previous template, not
 * the live DOM, keeps image readiness/error attributes added by load handlers.
 * This is deliberately limited to the inert markup emitted by renderGameCard.
 */
function patchCardNode(live: Node, before: Node, next: Node): void {
  if (before.isEqualNode(next)) return;
  if (before.nodeType !== next.nodeType
    || (before instanceof Element && next instanceof Element && before.tagName !== next.tagName)) {
    live.parentNode?.replaceChild(next.cloneNode(true), live);
    return;
  }
  if (!(live instanceof Element) || !(before instanceof Element) || !(next instanceof Element)) {
    live.nodeValue = next.nodeValue;
    return;
  }
  // A different icon/source is new artwork, not the old image's loaded/error
  // state. Unchanged artwork stays attached, even when status or copy changes.
  if (next.matches('.game-list-icon')
    || (next.matches('img') && before.getAttribute('src') !== next.getAttribute('src'))) {
    live.replaceWith(next.cloneNode(true));
    return;
  }
  if (next.matches('.game-list-cover')
    && before.querySelector('.game-cover-image')?.getAttribute('src') !== next.querySelector('.game-cover-image')?.getAttribute('src')) {
    live.removeAttribute('data-image-ready');
  }
  for (const { name } of Array.from(before.attributes)) {
    if (!next.hasAttribute(name)) live.removeAttribute(name);
  }
  for (const { name, value } of Array.from(next.attributes)) {
    if (before.getAttribute(name) !== value) live.setAttribute(name, value);
  }
  const liveChildren = Array.from(live.childNodes), oldChildren = Array.from(before.childNodes);
  const nextChildren = Array.from(next.childNodes);
  for (let index = 0; index < Math.max(oldChildren.length, nextChildren.length); index++) {
    const oldChild = oldChildren[index], nextChild = nextChildren[index], liveChild = liveChildren[index];
    if (!nextChild) liveChild?.parentNode?.removeChild(liveChild);
    else if (!oldChild || !liveChild) live.appendChild(nextChild.cloneNode(true));
    else patchCardNode(liveChild, oldChild, nextChild);
  }
}

/** Keep each surviving game's native button connected across discovery and
 * lifecycle updates. Removing a game/filter result is the only removal path;
 * changes elsewhere must not invalidate a pointer, focus or scroll action.
 */
export class GameListRenderer {
  private readonly templates = new WeakMap<Element, Element>();

  render(list: HTMLElement, markup: string): void {
    const template = document.createElement('template');
    template.innerHTML = markup;
    const key = (element: Element) => element.hasAttribute('data-id') ? `game:${element.getAttribute('data-id')}` : 'empty-results';
    const existing = new Map(Array.from(list.children).map(element => [key(element), element]));
    const desired = Array.from(template.content.children);
    const retained = new Set(desired.map(key));
    // Remove obsolete cards first, rather than moving every survivor around a
    // soon-to-be-removed sibling (which would transiently detach those targets).
    for (const [id, element] of existing) if (!retained.has(id)) element.remove();
    for (const [index, next] of desired.entries()) {
      const live = existing.get(key(next)) ?? next.cloneNode(true) as Element;
      if (existing.has(key(next))) patchCardNode(live, this.templates.get(live) ?? live.cloneNode(true), next);
      this.templates.set(live, next);
      // Do not move already-correct nodes: even a needless remove/reinsert can
      // disturb native focus. Real catalog reordering remains visible.
      if (list.children[index] !== live) list.insertBefore(live, list.children[index] ?? null);
    }
  }
}

/** Loading and failures preserve the same card geometry and usable fallback. */
export function settleArtworkImage(image: HTMLImageElement, loaded: boolean): void {
  if (!image.matches('.game-cover-image, .game-icon-image')) return;
  image.hidden = !loaded;
  if (image.matches('.game-icon-image')) {
    const mask = image.parentElement?.querySelector<HTMLElement>('.game-icon-mask');
    const source = loaded ? sameOriginImageUrl(image.currentSrc || image.src) : null;
    if (mask) mask.style.maskImage = source ? `url(${JSON.stringify(source)})` : 'none';
  }
  image.parentElement?.setAttribute('data-image-ready', String(loaded));
}

export function nextGridIndex(index: number, count: number, columns: number, key: string): number {
  if (!count) return -1;
  if (index < 0) return key === 'ArrowUp' || key === 'End' ? count - 1 : 0;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  const delta = key === 'ArrowDown' ? columns : key === 'ArrowUp' ? -columns : key === 'ArrowRight' ? 1 : -1;
  return Math.max(0, Math.min(count - 1, index + delta));
}
