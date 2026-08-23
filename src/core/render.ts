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

export function isPixelMode(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.getAttribute('data-style-mode') === 'pixel';
}

const PIXEL_FONT_STACK = `'Press Start 2P', system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
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
  cssWidth: number
): number {
  const displayScale = Math.max(0.2, cssWidth / logicalWidth);
  const backingScale = Math.min(displayScale * getCanvasPixelRatio(), 6);
  canvas.dataset.pixelRatio = String(backingScale);
  canvas.width = Math.round(logicalWidth * backingScale);
  canvas.height = Math.round(logicalHeight * backingScale);
  canvas.style.width = `${Math.round(cssWidth)}px`;
  canvas.style.height = `${Math.round((cssWidth * logicalHeight) / logicalWidth)}px`;
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

export function drawGameResultOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: RetroPalette,
  options: GameResultOverlayOptions
) {
  const details = (options.details || []).filter(Boolean).slice(0, 3);
  const panelWidth = Math.min(Math.max(220, width - 40), 360);
  const panelHeight = 92 + details.length * 24 + (options.hint ? 30 : 0);
  const panelX = (width - panelWidth) / 2;
  const panelY = (height - panelHeight) / 2;
  const toneColor = options.tone === 'success'
    ? palette.green
    : options.tone === 'danger'
      ? palette.red
      : palette.primary;

  ctx.save();
  ctx.fillStyle = 'rgba(2,6,23,0.68)';
  ctx.fillRect(0, 0, width, height);
  fillRoundedPanel(ctx, panelX, panelY, panelWidth, panelHeight, palette, 14);

  const pixel = isPixelMode();
  const fontStack = pixel ? PIXEL_FONT_STACK : UI_FONT_STACK;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = toneColor;
  ctx.font = pixel ? `16px ${fontStack}` : `bold 24px ${fontStack}`;
  ctx.fillText(options.title, width / 2, panelY + 34);

  ctx.fillStyle = palette.text;
  ctx.font = pixel ? `10px ${fontStack}` : `14px ${fontStack}`;
  details.forEach((line, index) => {
    ctx.fillText(line, width / 2, panelY + 68 + index * 24);
  });

  if (options.hint) {
    ctx.fillStyle = palette.muted;
    ctx.font = pixel ? `9px ${fontStack}` : `12px ${fontStack}`;
    ctx.fillText(options.hint, width / 2, panelY + panelHeight - 20);
  }
  ctx.restore();
}
