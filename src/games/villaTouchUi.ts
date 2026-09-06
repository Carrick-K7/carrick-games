/** Shared drawing/hit geometry keeps the compact snooker Exit clear of Shot. */
export function villaUseCircle(width: number, height: number, scale: number, snooker: boolean) {
  return { x: width - 38 * scale, y: height - (snooker ? 38 : 75) * scale, radius: 29 * scale };
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
