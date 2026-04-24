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

const MAX_CANVAS_PIXEL_RATIO = 2;

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
  canvas.dataset.renderStyle = 'hd-retro';
  canvas.width = Math.round(logicalWidth * pixelRatio);
  canvas.height = Math.round(logicalHeight * pixelRatio);
  canvas.style.width = `${logicalWidth}px`;
  canvas.style.height = `${logicalHeight}px`;
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.imageSmoothingEnabled = false;
  return pixelRatio;
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

export function drawScanlines(ctx: CanvasRenderingContext2D, width: number, height: number, dark: boolean) {
  ctx.save();
  ctx.globalAlpha = dark ? 0.13 : 0.07;
  ctx.fillStyle = dark ? '#000000' : '#ffffff';
  for (let y = 0; y < height; y += 4) {
    ctx.fillRect(0, y, width, 1);
  }
  ctx.restore();
}

export function drawRetroFinish(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: RetroPalette,
  dark: boolean
) {
  ctx.save();
  drawScanlines(ctx, width, height, dark);

  const vignette = ctx.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.28,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.72
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, dark ? 'rgba(0,0,0,0.28)' : 'rgba(13,148,136,0.08)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, width - 2, height - 2);

  ctx.strokeStyle = palette.gridStrong;
  ctx.lineWidth = 1;
  const tick = Math.min(28, Math.max(14, Math.floor(Math.min(width, height) * 0.06)));
  const inset = 8.5;
  ctx.beginPath();
  ctx.moveTo(inset, inset + tick);
  ctx.lineTo(inset, inset);
  ctx.lineTo(inset + tick, inset);
  ctx.moveTo(width - inset - tick, inset);
  ctx.lineTo(width - inset, inset);
  ctx.lineTo(width - inset, inset + tick);
  ctx.moveTo(inset, height - inset - tick);
  ctx.lineTo(inset, height - inset);
  ctx.lineTo(inset + tick, height - inset);
  ctx.moveTo(width - inset - tick, height - inset);
  ctx.lineTo(width - inset, height - inset);
  ctx.lineTo(width - inset, height - inset - tick);
  ctx.stroke();

  ctx.restore();
}

export function drawPixelFrame(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  palette: RetroPalette
) {
  ctx.save();
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);
  ctx.strokeStyle = palette.gridStrong;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 5.5, y + 5.5, width - 11, height - 11);
  ctx.restore();
}

export function drawNeonRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  radius = 4
) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(x + 2, y + 2, Math.max(0, width - 4), 2);
  ctx.restore();
}

export function drawGlowText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  font: string,
  align: CanvasTextAlign = 'left'
) {
  ctx.save();
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
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
  ctx.save();
  const grad = ctx.createLinearGradient(x, y, x, y + height);
  grad.addColorStop(0, palette.panel);
  grad.addColorStop(1, palette.panel2);
  ctx.fillStyle = grad;
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 1;
  ctx.shadowColor = palette.shadow;
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 4;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.stroke();
  ctx.restore();
}
