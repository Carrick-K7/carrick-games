// Game-owned canvas UI primitives. Text is measured with the font it is painted in.
import { ellipsize } from './csHudLayout.js';

export const UI = {
  surface: '#131e29', raised: '#1c2a37', selected: '#34404a', border: '#334452',
  text: '#edf3f7', dim: '#afbdc8', muted: '#8195a5', accent: '#f4b45f',
};
export const UI_FONT = '"Segoe UI", "PingFang SC", "Microsoft YaHei", Arial, sans-serif';
type Ctx = CanvasRenderingContext2D;

export function uiFont(ctx: Ctx, size = 14, bold = false) {
  ctx.font = `${bold ? '600 ' : ''}${size}px ${UI_FONT}`;
}
export function uiText(ctx: Ctx, value: string, x: number, y: number, size = 14,
  color: string = UI.text, align: CanvasTextAlign = 'left', bold = false, maxWidth?: number) {
  uiFont(ctx, size, bold);
  ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillStyle = color;
  ctx.fillText(maxWidth === undefined ? value : ellipsize(ctx, value, Math.max(0, maxWidth)), x, y);
}
export function uiRound(ctx: Ctx, x: number, y: number, w: number, h: number,
  fill: string, stroke?: string, radius = 12, lineWidth = 1) {
  if (w <= 0 || h <= 0) return;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, Math.min(radius, w / 2, h / 2));
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}
export function uiLines(ctx: Ctx, value: string, width: number, size = 13, maxLines = 3): string[] {
  uiFont(ctx, size);
  if (width <= 0 || maxLines <= 0) return [];
  const lines: string[] = []; let line = '';
  // Keep Latin words intact; CJK glyphs remain natural break opportunities.
  const tokens = value.match(/[A-Za-z0-9][A-Za-z0-9'’:/.-]*|[^\S\n]+|\n|[^\s]/gu) || [];
  for (const token of tokens) {
    if (token === '\n') { lines.push(line.trim()); line = ''; continue; }
    if (!line && /^\s+$/.test(token)) continue;
    if (line && ctx.measureText(line + token).width > width) { lines.push(line.trim()); line = ''; }
    if (/^\s+$/.test(token)) { if (line) line += ' '; continue; }
    if (ctx.measureText(token).width <= width) line += token;
    else for (const char of Array.from(token)) {
      if (line && ctx.measureText(line + char).width > width) { lines.push(line.trim()); line = ''; }
      line += char;
    }
  }
  if (line) lines.push(line.trim());
  if (lines.length > maxLines) {
    const remaining = lines.slice(maxLines - 1).join(' ');
    lines.splice(maxLines - 1, lines.length, ellipsize(ctx, remaining, width));
  }
  return lines;
}
export function uiParagraph(ctx: Ctx, value: string, x: number, top: number, width: number,
  size = 13, color: string = UI.dim, maxLines = 3, lineHeight = 20) {
  const lines = uiLines(ctx, value, width, size, maxLines);
  lines.forEach((line, i) => uiText(ctx, line, x, top + lineHeight * (i + .5), size, color));
  return lines.length * lineHeight;
}

export function uiButton(ctx: Ctx, x: number, y: number, w: number, h: number, label: string,
  opts: { selected?: boolean; primary?: boolean; disabled?: boolean; small?: boolean } = {}) {
  const fill = opts.disabled ? '#17212b' : opts.primary ? UI.accent : opts.selected ? UI.selected : UI.raised;
  uiRound(ctx, x + .5, y + .5, w - 1, h - 1, fill,
    opts.selected ? UI.accent : opts.primary ? undefined : UI.border, 9, opts.selected ? 1.5 : 1);
  uiText(ctx, label, x + w / 2, y + h / 2, opts.small ? 13 : 14,
    opts.disabled ? UI.muted : opts.primary ? '#211709' : opts.selected ? '#ffe1b4' : UI.text,
    'center', opts.primary || opts.selected, w - 16);
  // Shape as well as color identifies a selection, without stealing label width.
  if (opts.selected) {
    ctx.fillStyle = UI.accent;
    ctx.beginPath(); ctx.arc(x + w - 9, y + 9, 2.5, 0, Math.PI * 2); ctx.fill();
  }
}
