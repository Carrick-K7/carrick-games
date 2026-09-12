/** Shared drawing/hit geometry keeps the compact snooker Exit clear of Shot.
 * Display safe-area insets (notch/system bars) push the circle inward. */
export function villaUseCircle(width: number, height: number, scale: number, snooker: boolean, safe?: { right: number; bottom: number }) {
  return { x: width - 38 * scale - (safe?.right ?? 0), y: height - (snooker ? 38 : 75) * scale - (safe?.bottom ?? 0), radius: 29 * scale };
}

/** Two readable lines, preserving feedback rather than replacing it with an unrelated hint. */
export function wrapVillaTouchHint(text: string, maxWidth: number, measure: (text: string) => number): string[] {
  const lines: string[] = [];
  let remaining = text.trim();
  while (remaining && lines.length < 2) {
    if (measure(remaining) <= maxWidth) { lines.push(remaining); break; }
    const chars = Array.from(remaining);
    let count = 0;
    while (count < chars.length && measure(chars.slice(0, count + 1).join('')) <= maxWidth) count++;
    count = Math.max(1, count);
    if (lines.length === 1) {
      let last = chars.slice(0, count).join('').trimEnd();
      while (last && measure(last + '…') > maxWidth) last = Array.from(last).slice(0, -1).join('').trimEnd();
      lines.push(last + '…'); break;
    }
    const fit = chars.slice(0, count).join(''), wordBreak = fit.lastIndexOf(' ');
    if (wordBreak > fit.length / 2) count = Array.from(fit.slice(0, wordBreak)).length;
    lines.push(chars.slice(0, count).join('').trimEnd()); remaining = chars.slice(count).join('').trimStart();
  }
  return lines.length ? lines : [''];
}
