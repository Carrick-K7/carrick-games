// CS-owned tactical UI. System fonts, original geometry and genuine game images;
// CS:GO/Panorama-inspired hierarchy, not copied Valve UI assets or a shell theme.
import { ellipsize } from './csHudLayout.js';

export const UI = {
  surface: '#1b242c', raised: '#26333e', selected: '#405363', hover: '#344652',
  border: 'rgba(191,207,218,.24)', separator: 'rgba(191,207,218,.16)',
  text: '#f0f3f5', dim: '#bac5cd', muted: '#92a2ae', accent: '#d9bf7b',
  ct: '#9ac9e3', t: '#d8c08b', cash: '#b6cf9f',
  primary: '#466b35', primaryHover: '#51763e',
  header: 'rgba(9,14,19,.52)', hud: 'rgba(8,13,18,.76)',
};
export const UI_FONT = '"Segoe UI", "PingFang SC", "Microsoft YaHei", Arial, sans-serif';
export const UI_NUMBER_FONT = '"Arial Narrow", "Roboto Condensed", "Bahnschrift", "Segoe UI", Arial, sans-serif';
export type UiTone = 'neutral' | 'ct' | 't';
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
export function uiNumber(ctx: Ctx, value: string, x: number, y: number, size: number,
  color: string = UI.text, align: CanvasTextAlign = 'left', maxWidth?: number) {
  ctx.save(); ctx.font = `600 ${size}px ${UI_NUMBER_FONT}`;
  ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillStyle = color;
  ctx.fillText(maxWidth === undefined ? value : ellipsize(ctx, value, Math.max(0, maxWidth)), x, y);
  ctx.restore();
}
export function uiRound(ctx: Ctx, x: number, y: number, w: number, h: number,
  fill: string, stroke?: string, radius = 2, lineWidth = 1) {
  if (w <= 0 || h <= 0) return;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, Math.min(radius, w / 2, h / 2));
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}
/** Quiet, square HUD strips rather than floating application cards. */
export function uiHudPlate(ctx: Ctx, x: number, y: number, w: number, h: number, accent?: string) {
  ctx.fillStyle = UI.hud; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = UI.separator; ctx.fillRect(x, y, w, 1);
  if (accent) { ctx.fillStyle = accent; ctx.fillRect(x, y, Math.min(36, w), 2); }
}
export function uiRule(ctx: Ctx, x: number, y: number, w: number, color: string = UI.separator) {
  ctx.fillStyle = color; ctx.fillRect(x, y, Math.max(0, w), 1);
}
export function uiLines(ctx: Ctx, value: string, width: number, size = 13, maxLines = 3): string[] {
  uiFont(ctx, size);
  if (width <= 0 || maxLines <= 0) return [];
  const lines: string[] = []; let line = '';
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
  opts: { selected?: boolean; primary?: boolean; disabled?: boolean; small?: boolean; hovered?: boolean; tone?: UiTone } = {}) {
  const accent = opts.tone === 'ct' ? UI.ct : opts.tone === 't' ? UI.t : UI.text;
  const fill = opts.disabled ? '#20282f' : opts.primary ? (opts.hovered ? UI.primaryHover : UI.primary)
    : opts.hovered ? UI.hover : opts.selected ? UI.selected : UI.raised;
  uiRound(ctx, x + .5, y + .5, w - 1, h - 1, fill, opts.primary ? '#789365' : UI.border, 1, 1);
  if (opts.selected && !opts.disabled) {
    ctx.fillStyle = accent; ctx.fillRect(x + 1, y + h - 3, w - 2, 2);
  }
  uiText(ctx, label, x + w / 2, y + h / 2, opts.small ? 13 : 14,
    opts.disabled ? UI.muted : opts.selected ? accent : UI.text, 'center', opts.primary || opts.selected,
    w - (opts.primary ? 42 : 16));
  if (opts.primary && !opts.disabled) {
    ctx.save(); ctx.strokeStyle = UI.text; ctx.lineWidth = 1.5; ctx.beginPath();
    ctx.moveTo(x + w - 22, y + h / 2 - 5); ctx.lineTo(x + w - 17, y + h / 2); ctx.lineTo(x + w - 22, y + h / 2 + 5); ctx.stroke(); ctx.restore();
  }
}
