// counterstrikeViewport.ts — responsive viewport math for Counter-Strike.
//
// Pure helpers (no DOM access) so the display rules stay unit-testable:
// the 1280x720 baseline, aspect-preserving FOV for the software raycaster,
// the WebGL backing budget, HUD/panel scaling, safe-area-aware touch
// controls, and space for the shared brand/help/menu row. Game state, physics, AI,
// and weapon simulation never read these values — display only.

import { SHELL_BUTTON_MARGIN, SHELL_BUTTON_SIZE, SHELL_CLUSTER_WIDTH } from '@carrick/game-sdk/layout';

export interface ViewportInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const CS_BASE_WIDTH = 1280;
export const CS_BASE_HEIGHT = 720;
export const CS_BASE_ASPECT = CS_BASE_WIDTH / CS_BASE_HEIGHT;
/** Horizontal half-FOV tangent at the 1280x720 baseline (66° horizontal FOV). */
export const CS_HALF_FOV_TAN = Math.tan(((66 * Math.PI) / 180) / 2);
/** WebGL backing-store budget in pixels (memory/fill-rate guard). */
export const SCENE_MAX_BACKING_PIXELS = 4_500_000;
/** Vertical clearance stays 56px: the wider brand/help/menu row is still 44px tall. */
export const SHELL_MENU_RESERVE = SHELL_BUTTON_SIZE + SHELL_BUTTON_MARGIN;
/** Minimum touch target edge in CSS px. */
export const MIN_TOUCH_TARGET = 44;

/** On phones, dock round information below the radar and shared utilities. */
export function roundHeaderY(width: number, height: number, insets?: Partial<ViewportInsets> | null): number {
  const safe = sanitizeInsets(insets), s = hudScale(width, height);
  const usableW = width - safe.left - safe.right;
  const headerRight = safe.left + usableW / 2 + 140 * s;
  const shellLeft = width - safe.right - SHELL_BUTTON_MARGIN - SHELL_CLUSTER_WIDTH;
  const dock = usableW < 500 || headerRight + 8 > shellLeft;
  return safe.top + (dock ? Math.max(88, 10 * s + Math.max(64, 100 * s) + 12) : 14 * s);
}

const clampNum = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const positive = (value: number, fallback: number): number =>
  Number.isFinite(value) && value > 0 ? value : fallback;

/** Safe-area insets from the shell viewport, sanitized (never negative). */
export function sanitizeInsets(insets?: Partial<ViewportInsets> | null): ViewportInsets {
  return {
    top: Math.max(0, Number(insets?.top) || 0),
    right: Math.max(0, Number(insets?.right) || 0),
    bottom: Math.max(0, Number(insets?.bottom) || 0),
    left: Math.max(0, Number(insets?.left) || 0),
  };
}

/** Uniform HUD scale: shrink on small screens, mild growth on large ones. */
export function hudScale(width: number, height: number): number {
  const w = positive(width, CS_BASE_WIDTH);
  const h = positive(height, CS_BASE_HEIGHT);
  return clampNum(Math.min(w / CS_BASE_WIDTH, h / CS_BASE_HEIGHT), 0.55, 1.3);
}

/**
 * Horizontal half-FOV tangent for a viewport aspect. The vertical FOV stays
 * pinned to the 16:9 baseline, so wider screens see more of the world and
 * narrower screens see less — geometry is never stretched.
 */
export function halfFovTanForAspect(aspect: number): number {
  const safeAspect = positive(aspect, CS_BASE_ASPECT);
  return CS_HALF_FOV_TAN * (safeAspect / CS_BASE_ASPECT);
}

/**
 * Software-raycaster buffer size at the real viewport aspect. Column cost
 * stays near the 640x360 baseline (320x180 in pixel mode); the buffer aspect
 * always matches the viewport aspect so the blit into the canvas preserves
 * proportions instead of stretching the 16:9 baseline.
 */
export function raycastBufferSize(
  width: number,
  height: number,
  pixelMode: boolean,
): { rw: number; rh: number } {
  const aspect = positive(width, CS_BASE_WIDTH) / positive(height, CS_BASE_HEIGHT);
  const rhBase = pixelMode ? 180 : 360;
  const rw = clampNum(Math.round(rhBase * aspect), 96, 1152);
  const rh = Math.max(54, Math.round(rw / aspect));
  return { rw, rh };
}

/**
 * Backing ratio for the 3D scene: the display density, capped so
 * width*height*ratio^2 stays within SCENE_MAX_BACKING_PIXELS.
 */
export function sceneBackingRatio(width: number, height: number, dpr: number): number {
  const w = positive(width, CS_BASE_WIDTH);
  const h = positive(height, CS_BASE_HEIGHT);
  const density = Number.isFinite(dpr) && dpr > 0 ? Math.min(dpr, 2) : 1;
  // The 1e-9 margin keeps width*height*ratio^2 strictly within budget despite
  // floating-point rounding at the cap.
  const maxRatio = Math.sqrt(SCENE_MAX_BACKING_PIXELS / (w * h)) * (1 - 1e-9);
  return clampNum(Math.min(density, maxRatio), 0.25, 2);
}

export interface BuyMenuLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  headerH: number;
  footerH: number;
  /** Desktop: the 25px baseline row pitch. Touch: always MIN_TOUCH_TARGET. */
  rowH: number;
  scale: number;
  /** Touch layout: 2-column category grid + full-width scrollable item list. */
  touch: boolean;
  /** Top of the body region (category grid or item list). */
  bodyY: number;
  bodyH: number;
  catCols: number;
  catRows: number;
  cellW: number;
  cellH: number;
  itemRowH: number;
  /** Item rows visible at once; the rest are reachable by internal scroll. */
  visibleItemRows: number;
}

/** Category rows; every team-filtered item list also fits in 8 rows. */
const BUY_ROWS = 8;

/**
 * Buy menu centered inside the safe area.
 *
 * Desktop/mouse keeps the original layout verbatim: 480px panel, 64px
 * header, 25px rows, categories left / items right.
 *
 * Touch restructures the same content so every control is a ≥44px target on
 * any viewport: a 2-column × 4-row category grid, then a full-width item
 * list with 44px rows and internal wheel/touch-drag scroll when the list is
 * taller than the body, plus persistent 44px Back/Close buttons in the
 * footer.
 */
export function buyMenuLayout(
  width: number,
  height: number,
  insets?: Partial<ViewportInsets> | null,
  touchMode = false,
): BuyMenuLayout {
  const safe = sanitizeInsets(insets);
  const w0 = positive(width, CS_BASE_WIDTH);
  const h0 = positive(height, CS_BASE_HEIGHT);
  const s = hudScale(w0, h0);
  const availW = Math.max(160, w0 - safe.left - safe.right - 16);
  const availH = Math.max(160, h0 - safe.top - safe.bottom - 16);

  if (touchMode) {
    const panelW = Math.min(availW, clampNum(w0 * 0.62, 300, 560));
    let headerH = Math.max(44, 52 * s);
    let footerH = 50; // 44px buttons + padding
    const minBody = 4 * MIN_TOUCH_TARGET; // category grid: 4 rows × ≥44px
    if (availH < minBody + headerH + footerH) {
      headerH = 36;
      footerH = 44;
    }
    const panelH = Math.min(availH, 560);
    const x = safe.left + 8 + (availW - panelW) / 2;
    const y = safe.top + 8 + (availH - panelH) / 2;
    const bodyY = y + headerH;
    const bodyH = panelH - headerH - footerH;
    return {
      x,
      y,
      w: panelW,
      h: panelH,
      headerH,
      footerH,
      rowH: MIN_TOUCH_TARGET,
      scale: s,
      touch: true,
      bodyY,
      bodyH,
      catCols: 2,
      catRows: 4,
      cellW: panelW / 2,
      cellH: bodyH / 4,
      itemRowH: MIN_TOUCH_TARGET,
      visibleItemRows: Math.max(1, Math.floor(bodyH / MIN_TOUCH_TARGET)),
    };
  }

  const headerH = 64 * s;
  const footerH = 30 * s;
  const rowFit = Math.max(18, (availH - headerH - footerH) / BUY_ROWS);
  const rowH = Math.min(25 * s, rowFit);
  const h = Math.min(availH, headerH + BUY_ROWS * rowH + footerH);
  const w = Math.min(480 * s, availW);
  const x = safe.left + 8 + (availW - w) / 2;
  const y = safe.top + 8 + (availH - h) / 2;
  return {
    x,
    y,
    w,
    h,
    headerH,
    footerH,
    rowH,
    scale: s,
    touch: false,
    bodyY: y + headerH,
    bodyH: BUY_ROWS * rowH,
    catCols: 1,
    catRows: BUY_ROWS,
    cellW: w / 2,
    cellH: rowH,
    itemRowH: rowH,
    visibleItemRows: BUY_ROWS,
  };
}

export interface BuyFooterButtons {
  back: { x: number; y: number; w: number; h: number };
  close: { x: number; y: number; w: number; h: number };
}

/** Persistent 44px Back/Close targets along the touch buy-menu footer. */
export function buyFooterButtons(layout: BuyMenuLayout): BuyFooterButtons {
  const pad = layout.footerH > MIN_TOUCH_TARGET ? 3 : 0;
  const h = layout.footerH - 2 * pad;
  const y = layout.y + layout.h - layout.footerH + pad;
  const gap = 8;
  const w = (layout.w - gap) / 2;
  return {
    back: { x: layout.x, y, w, h },
    close: { x: layout.x + w + gap, y, w, h },
  };
}

/** Max pixel scroll offset for a touch item list of `itemCount` rows. */
export function maxBuyScroll(itemCount: number, layout: BuyMenuLayout): number {
  const content = Math.max(0, itemCount) * layout.itemRowH;
  const visible = layout.visibleItemRows * layout.itemRowH;
  return Math.max(0, content - visible);
}

export interface PanelLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Uniform content scale: draw the base-sized panel scaled by this. */
  scale: number;
}

/**
 * Centered panel (scoreboard, dialogs) fitted into the safe area. Never
 * grows past its base size; vertically biased upward like the original HUD.
 */
export function centeredPanelLayout(
  width: number,
  height: number,
  insets: Partial<ViewportInsets> | null | undefined,
  baseW: number,
  baseH: number,
): PanelLayout {
  const safe = sanitizeInsets(insets);
  const availW = Math.max(120, positive(width, CS_BASE_WIDTH) - safe.left - safe.right - 16);
  const availH = Math.max(120, positive(height, CS_BASE_HEIGHT) - safe.top - safe.bottom - 16);
  let scale = clampNum(Math.min(1, availW / baseW, availH / baseH), 0.3, 1);
  let w = baseW * scale, h = baseH * scale;
  let x = safe.left + 8 + (availW - w) / 2;
  let y = safe.top + 8 + (availH - h) * 0.28;
  const shellLeft = positive(width, CS_BASE_WIDTH) - safe.right - SHELL_BUTTON_MARGIN - SHELL_CLUSTER_WIDTH;
  if (y < safe.top + SHELL_MENU_RESERVE && x + w > shellLeft) {
    // Prefer a small horizontal shift on landscape; no extra vertical reserve.
    if (shellLeft - 8 - w >= safe.left + 8) x = shellLeft - 8 - w;
    else {
      y = safe.top + SHELL_MENU_RESERVE + 8;
      scale = Math.min(scale, Math.max(0, positive(height, CS_BASE_HEIGHT) - safe.bottom - 8 - y) / baseH);
      w = baseW * scale; h = baseH * scale;
      x = safe.left + 8 + (availW - w) / 2;
    }
  }
  return { x, y, w, h, scale };
}

export interface TouchButton {
  x: number;
  y: number;
  /** Drawn radius. */
  r: number;
  /** Hit-test radius — always ≥ MIN_TOUCH_TARGET/2 (a 44px target). */
  hitR: number;
}

export interface TouchControlsLayout {
  scale: number;
  stickR: number;
  stickHint: { x: number; y: number };
  fire: TouchButton;
  reload: TouchButton;
  /** Buy-menu shortcut, drawn only while the player can buy. */
  buy: TouchButton;
  /** Left-region width that starts the movement stick. */
  moveRegionW: number;
}

/**
 * Touch controls anchored to the safe-area corners. Matches the original
 * 1280x720 layout exactly (fire at W-104/H-100 r52/hit58, reload above it
 * r36/hit44, stick hint at 104/H-104 r66) and keeps ≥44px hit targets on
 * small screens.
 */
export function touchControlsLayout(
  width: number,
  height: number,
  insets?: Partial<ViewportInsets> | null,
): TouchControlsLayout {
  const safe = sanitizeInsets(insets);
  const w = positive(width, CS_BASE_WIDTH);
  const h = positive(height, CS_BASE_HEIGHT);
  const s = clampNum(Math.min(w / CS_BASE_WIDTH, h / CS_BASE_HEIGHT), 0.62, 1.1);
  const fireR = Math.max(52 * s, 26);
  const reloadR = Math.max(36 * s, 20);
  const stickR = Math.max(66 * s, 40);
  const bx = w - safe.right - Math.max(104 * s, fireR + 18);
  const fire: TouchButton = {
    x: bx,
    y: h - safe.bottom - Math.max(100 * s, fireR + 16),
    r: fireR,
    hitR: Math.max(fireR + 6, MIN_TOUCH_TARGET / 2),
  };
  const reload: TouchButton = {
    x: bx,
    y: fire.y - Math.max(96 * s, fireR + reloadR + 8),
    r: reloadR,
    hitR: Math.max(reloadR + 8, MIN_TOUCH_TARGET / 2),
  };
  const buyR = Math.max(30 * s, 22);
  const buy: TouchButton = {
    x: bx,
    y: reload.y - Math.max(88 * s, reloadR + buyR + 8),
    r: buyR,
    hitR: Math.max(buyR + 6, MIN_TOUCH_TARGET / 2),
  };
  return {
    scale: s,
    stickR,
    stickHint: {
      x: safe.left + Math.max(104 * s, stickR + 16),
      y: h - safe.bottom - Math.max(104 * s, stickR + 16),
    },
    fire,
    reload,
    buy,
    moveRegionW: w * 0.45,
  };
}
