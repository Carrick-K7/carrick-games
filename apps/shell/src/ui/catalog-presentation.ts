import type { GameMeta } from '@carrick/game-sdk/catalog';
import { renderGameIcon } from './game-icons.js';
import { escapeHtml, sameOriginImageUrl } from './html.js';

/** Presentation consumes metadata, never the catalog loader or game implementation. */
export interface LibraryGame extends Pick<GameMeta, 'id' | 'name' | 'nameZh' | 'desc' | 'descZh' | 'icon' | 'controls'> {
  cover?: string | GameMeta['cover'];
}

const arrow = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 10h11m-4-4 4 4-4 4"/></svg>';
const check = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m3 8 3 3 7-7"/></svg>';

export function renderGameCard(game: LibraryGame, currentId: string | null, zh: boolean): string {
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
  const action = current ? (zh ? '继续游戏' : 'Continue') : (zh ? '开始玩' : 'Play');
  return `<button class="game-list-item${current ? ' active' : ''}" type="button" data-id="${escapeHtml(game.id)}" aria-current="${current}" aria-label="${escapeHtml(`${name} — ${action}`)}" aria-describedby="game-description-${escapeHtml(game.id)}" title="${escapeHtml(description)}">
    <span class="game-list-cover" aria-hidden="true">
      <span class="game-list-icon">${renderGameIcon(game.icon)}</span>${image}
      ${current ? `<span class="game-list-status">${check}${zh ? '正在玩' : 'Playing'}</span>` : ''}
    </span>
    <span class="game-list-copy"><span class="game-list-name">${escapeHtml(name)}</span><span class="game-list-desc" id="game-description-${escapeHtml(game.id)}">${escapeHtml(description)}</span></span>
    <span class="game-list-bottom"><span class="game-list-input">${current ? action : input}</span><span class="game-list-arrow">${arrow}</span></span>
  </button>`;
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
