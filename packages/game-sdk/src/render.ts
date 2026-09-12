export interface RetroPalette {
  bg: string;
  bg2: string;
  grid: string;
  gridStrong: string;
  panel: string;
  panel2: string;
  border: string;
  text: string;
  muted: string;
  primary: string;
  cyan: string;
  green: string;
  red: string;
  amber: string;
  orange: string;
  blue: string;
  violet: string;
  shadow: string;
}

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface GameResultOverlayOptions {
  title: string;
  details?: string[];
  hint?: string;
  tone?: 'success' | 'danger' | 'neutral';
}

const MAX_CANVAS_PIXEL_RATIO = 2;
export const MAX_CANVAS_BACKING_PIXELS = 8_294_400;

/** One uniform scale: bounded memory without stretching display geometry. */
export function canvasBackingScale(logicalWidth: number, logicalHeight: number, cssWidth: number, dpr = 1): number {
  if (![logicalWidth, logicalHeight, cssWidth].every(n => Number.isFinite(n) && n > 0)) return 1;
  const density = Number.isFinite(dpr) ? Math.max(1, Math.min(MAX_CANVAS_PIXEL_RATIO, dpr)) : 1;
  return Math.min(cssWidth / logicalWidth * density, Math.sqrt(MAX_CANVAS_BACKING_PIXELS / (logicalWidth * logicalHeight)));
}

export function isPixelMode(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.getAttribute('data-style-mode') === 'pixel';
}

const UI_FONT_STACK = `system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;

export function getCanvasPixelRatio(): number {
  if (typeof window === 'undefined') return 1;
  const ratio = window.devicePixelRatio || 1;
  return Math.max(1, Math.min(MAX_CANVAS_PIXEL_RATIO, ratio));
}

export function configureHiDpiCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  logicalWidth: number,
  logicalHeight: number
): number {
  const pixelRatio = getCanvasPixelRatio();
  canvas.dataset.logicalWidth = String(logicalWidth);
  canvas.dataset.logicalHeight = String(logicalHeight);
  canvas.dataset.pixelRatio = String(pixelRatio);
  canvas.dataset.renderStyle = 'minimal-hd';
  canvas.width = Math.round(logicalWidth * pixelRatio);
  canvas.height = Math.round(logicalHeight * pixelRatio);
  canvas.style.width = `${logicalWidth}px`;
  canvas.style.height = `${logicalHeight}px`;
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.imageSmoothingEnabled = true;
  return pixelRatio;
}

/**
 * Fit the canvas to a CSS display width chosen by the shell layout. The
 * logical coordinate system never changes; the backing store is re-sized to
 * `cssWidth * devicePixelRatio` so the upscaled picture stays sharp.
 * Returns the effective logical-to-backing scale.
 */
export function setCanvasDisplaySize(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  logicalWidth: number,
  logicalHeight: number,
  cssWidth: number,
  dpr = getCanvasPixelRatio(),
): number {
  const backingScale = canvasBackingScale(logicalWidth, logicalHeight, cssWidth, dpr);
  canvas.dataset.logicalWidth = String(logicalWidth);
  canvas.dataset.logicalHeight = String(logicalHeight);
  canvas.dataset.pixelRatio = String(backingScale);
  const width = Math.max(1, Math.floor(logicalWidth * backingScale));
  const height = Math.max(1, Math.floor(logicalHeight * backingScale));
  // Identical notifications must not clear a static game's current frame.
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${(cssWidth * logicalHeight) / logicalWidth}px`;
  ctx.setTransform(backingScale, 0, 0, backingScale, 0, 0);
  ctx.imageSmoothingEnabled = true;
  return backingScale;
}

export function getLogicalCanvasSize(canvas: HTMLCanvasElement): { width: number; height: number } {
  const pixelRatio = Number(canvas.dataset.pixelRatio) || 1;
  const width = Number(canvas.dataset.logicalWidth) || canvas.width / pixelRatio;
  const height = Number(canvas.dataset.logicalHeight) || canvas.height / pixelRatio;
  return { width, height };
}

export function getCanvasPoint(
  canvas: HTMLCanvasElement,
  logicalWidth: number,
  logicalHeight: number,
  clientX: number,
  clientY: number
): CanvasPoint {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * logicalWidth,
    y: ((clientY - rect.top) / rect.height) * logicalHeight,
  };
}

export function getRetroPalette(dark: boolean): RetroPalette {
  if (dark) {
    return {
      bg: '#07111d',
      bg2: '#0d1728',
      grid: 'rgba(57,197,187,0.08)',
      gridStrong: 'rgba(57,197,187,0.22)',
      panel: 'rgba(9,18,32,0.92)',
      panel2: 'rgba(15,31,52,0.92)',
      border: 'rgba(57,197,187,0.42)',
      text: '#f8fafc',
      muted: '#93a8bd',
      primary: '#39C5BB',
      cyan: '#38bdf8',
      green: '#4ade80',
      red: '#fb7185',
      amber: '#facc15',
      orange: '#fb923c',
      blue: '#60a5fa',
      violet: '#a78bfa',
      shadow: 'rgba(0,0,0,0.45)',
    };
  }
  return {
    bg: '#f7fbfb',
    bg2: '#e7f4f3',
    grid: 'rgba(13,148,136,0.10)',
    gridStrong: 'rgba(13,148,136,0.25)',
    panel: 'rgba(255,255,255,0.94)',
    panel2: 'rgba(228,244,243,0.94)',
    border: 'rgba(13,148,136,0.42)',
    text: '#0f172a',
    muted: '#5d7480',
    primary: '#0d9488',
    cyan: '#0284c7',
    green: '#16a34a',
    red: '#dc2626',
    amber: '#ca8a04',
    orange: '#ea580c',
    blue: '#2563eb',
    violet: '#7c3aed',
    shadow: 'rgba(15,23,42,0.16)',
  };
}

export function drawRetroBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: RetroPalette,
  gridSize = 24
) {
  ctx.save();
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, palette.bg);
  grad.addColorStop(1, palette.bg2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = palette.grid;
  ctx.lineWidth = 1;
  for (let x = 0.5; x <= width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0.5; y <= height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.fillStyle = palette.grid;
  for (let i = 0; i < 72; i++) {
    const x = (i * 97) % width;
    const y = (i * 53) % height;
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.restore();
}

export function fillRoundedPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  palette: RetroPalette,
  radius = 8
) {
  const pixel = isPixelMode();
  ctx.save();
  const grad = ctx.createLinearGradient(x, y, x, y + height);
  grad.addColorStop(0, palette.panel);
  grad.addColorStop(1, palette.panel2);
  ctx.fillStyle = grad;
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = pixel ? 2 : 1;
  ctx.shadowColor = pixel ? 'rgba(0,0,0,0.55)' : palette.shadow;
  ctx.shadowBlur = pixel ? 0 : 14;
  ctx.shadowOffsetY = 4;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, pixel ? Math.min(radius, 4) : radius);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.stroke();
  ctx.restore();
}

/** Word wrapping also handles unspaced CJK and never splits a surrogate pair. */
export function wrapCanvasText(ctx: Pick<CanvasRenderingContext2D, 'measureText'>, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = '';
    for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth) { line = candidate; continue; }
      if (line) { lines.push(line); line = ''; }
      for (const character of word) {
        if (line && ctx.measureText(line + character).width > maxWidth) { lines.push(line); line = ''; }
        line += character;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

export interface ResultPanelLayout {
  width: number;
  height: number;
  fit: number;
  unit: number;
  rows: { text: string; y: number; font: string; role: 'title' | 'detail' | 'hint' }[];
}

/** Text sizes are CSS-pixel based, even when a fixed board is scaled down. */
export function measureResultPanel(
  ctx: Pick<CanvasRenderingContext2D, 'measureText' | 'font'>,
  width: number,
  height: number,
  options: GameResultOverlayOptions,
  cssScale = 1,
): ResultPanelLayout {
  const unit = 1 / (Number.isFinite(cssScale) && cssScale > 0 ? cssScale : 1);
  const panelWidth = Math.max(1, Math.min(width - Math.min(width / 5, 24 * unit), 360 * unit));
  const padding = Math.min(panelWidth / 8, 24 * unit);
  const contentWidth = Math.max(1, panelWidth - padding * 2);
  const rows: ResultPanelLayout['rows'] = [];
  let y = 24 * unit;
  const add = (text: string, size: number, leading: number, role: 'title' | 'detail' | 'hint') => {
    const font = `${role === 'title' ? 650 : 500} ${size * unit}px ${UI_FONT_STACK}`;
    ctx.font = font;
    for (const line of wrapCanvasText(ctx, text, contentWidth)) {
      rows.push({ text: line, y: y + leading * unit / 2, font, role });
      y += leading * unit;
    }
  };
  add(options.title, 24, 30, 'title');
  const details = (options.details ?? []).filter(Boolean).slice(0, 3);
  if (details.length) y += 12 * unit;
  details.forEach((detail, index) => { if (index) y += 4 * unit; add(detail, 14, 21, 'detail'); });
  if (options.hint) { y += 16 * unit; add(options.hint, 14, 20, 'hint'); }
  const panelHeight = y + 20 * unit;
  // Very short canvases still retain the complete result instead of clipping it.
  const fit = Math.min(1, Math.max(1, height - Math.min(height / 5, 16 * unit)) / panelHeight);
  return { width: panelWidth, height: panelHeight, fit, unit, rows };
}

export function drawGameResultOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: RetroPalette,
  options: GameResultOverlayOptions
) {
  ctx.save();
  const cssWidth = ctx.canvas?.getBoundingClientRect?.().width;
  const panel = measureResultPanel(ctx, width, height, options, cssWidth && cssWidth > 0 ? cssWidth / width : 1);
  const hex = /^#([a-f\d]{6})$/i.exec(palette.bg)?.[1];
  const dark = !!hex && (parseInt(hex.slice(0, 2), 16) * .299 + parseInt(hex.slice(2, 4), 16) * .587 + parseInt(hex.slice(4, 6), 16) * .114) < 128;
  const text = dark ? '#EDF5F1' : '#14231F';
  const muted = dark ? '#A6B9AF' : '#5B6E66';
  ctx.fillStyle = dark ? 'rgba(5,12,9,.66)' : 'rgba(20,35,31,.38)';
  ctx.fillRect(0, 0, width, height);
  ctx.translate(width / 2, height / 2);
  ctx.scale(panel.fit, panel.fit);
  const left = -panel.width / 2, top = -panel.height / 2;
  ctx.fillStyle = dark ? '#151F1B' : '#FFFFFF';
  ctx.strokeStyle = dark ? 'rgba(237,245,241,.16)' : 'rgba(20,35,31,.14)';
  ctx.lineWidth = panel.unit;
  ctx.shadowColor = dark ? 'rgba(0,0,0,.3)' : 'rgba(20,35,31,.16)';
  ctx.shadowBlur = 18 * panel.unit;
  ctx.shadowOffsetY = 6 * panel.unit;
  ctx.beginPath();
  ctx.roundRect(left, top, panel.width, panel.height, Math.min(20 * panel.unit, panel.width / 4));
  ctx.fill();
  ctx.shadowBlur = ctx.shadowOffsetY = 0;
  ctx.stroke();
  // Outcome uses a small accent, never an alarming wall of colored score text.
  ctx.fillStyle = options.tone === 'danger' ? palette.red : options.tone === 'success' ? palette.green : palette.primary;
  ctx.beginPath();
  ctx.roundRect(-16 * panel.unit, top + 12 * panel.unit, 32 * panel.unit, 3 * panel.unit, 1.5 * panel.unit);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const row of panel.rows) {
    ctx.font = row.font;
    ctx.fillStyle = row.role === 'hint' ? muted : text;
    ctx.fillText(row.text, 0, top + row.y);
  }
  ctx.restore();
}
