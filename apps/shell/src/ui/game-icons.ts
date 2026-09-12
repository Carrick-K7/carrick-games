import { escapeHtml, sameOriginImageUrl } from './html.js';

const fallback = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>';

/** Every icon belongs to a release; no game IDs or game-specific artwork live in the shell. */
export function renderGameIcon(icon: string): string {
  const source = sameOriginImageUrl(icon);
  if (!source) return fallback;
  const url = new URL(source);
  if (!/^\/games\/[A-Za-z0-9_./+-]+$/.test(url.pathname) || url.search || url.hash || url.pathname.split('/').includes('..')) return fallback;
  // The lazy image activates a same-color mask on success; missing art keeps the generic fallback.
  return `<span class="asset-game-icon" aria-hidden="true">${fallback}<span class="game-icon-mask"></span><img class="game-icon-image" src="${escapeHtml(source)}" alt="" width="52" height="52" loading="lazy" decoding="async"></span>`;
}
