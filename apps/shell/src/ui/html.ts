/** Text and image metadata never become executable markup. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

/** The runtime resolves release-local paths; the UI additionally rejects foreign/active URLs. */
export function sameOriginImageUrl(value: string, base = typeof location === 'undefined' ? 'https://games.carrick7.com/' : location.href): string | null {
  try {
    const origin = new URL(base);
    const url = new URL(value, origin);
    if (!value.trim() || !['https:', 'http:'].includes(url.protocol) || url.origin !== origin.origin || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}
