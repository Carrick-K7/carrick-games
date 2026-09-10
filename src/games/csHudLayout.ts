// csHudLayout.ts — pure responsive layout math for the CS canvas HUD.
//
// The HUD (csHud.ts) draws menus, overlays and touch controls into the game
// canvas at the live CSS viewport size delivered through BaseGame.setViewport.
// This module keeps all viewport-shape decisions in pure functions so the
// layout can be unit-tested without a DOM: safe-area insets, the reserved
// top-right brand/help/menu row (96/44/44px, 8px gaps), compact/short breakpoints and
// internal scroll state for menus that do not fit short screens.

export interface HudSafeArea {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const ZERO_SAFE_AREA: HudSafeArea = { top: 0, right: 0, bottom: 0, left: 0 };

export function normalizeSafeArea(sa?: Partial<HudSafeArea> | null): HudSafeArea {
  const edge = (v: unknown) => (Number.isFinite(v) && (v as number) > 0 ? (v as number) : 0);
  return {
    top: edge(sa?.top),
    right: edge(sa?.right),
    bottom: edge(sa?.bottom),
    left: edge(sa?.left),
  };
}

/** Shell chrome that floats over the top-right corner of the game canvas. */
export const SHELL_BUTTON_SIZE = 44;
export const SHELL_BUTTON_MARGIN = 12;
export const SHELL_CLUSTER_WIDTH = 96 + 8 + SHELL_BUTTON_SIZE * 2 + 8;

export interface HudLayout {
  W: number;
  H: number;
  safe: HudSafeArea;
  /** Base margin: roomier on desktop, tight on phones. */
  margin: number;
  /** Content edges, safe-area aware. */
  top: number;
  left: number;
  right: number;
  bottom: number;
  /** W < 700: single-column menu, docked score strip, slim HUD panels. */
  compact: boolean;
  /** H < 480: landscape phones — smaller radar/joystick, no footer hints. */
  short: boolean;
  /** W >= 1100 && H >= 640: the original two-column 1280x720 menu layout. */
  classicMenu: boolean;
  /** Rectangle reserved for the 200x44px brand/help/menu row. */
  shellReserve: { x: number; y: number; w: number; h: number };
  /** First y that is guaranteed clear of the shell reserve. */
  contentTop: number;
  /** Usable content width between safe-area-aware margins. */
  availW: number;
  /** Usable content height between safe-area-aware margins. */
  availH: number;
}

export function computeHudLayout(W: number, H: number, safe?: Partial<HudSafeArea> | null): HudLayout {
  const s = normalizeSafeArea(safe);
  const margin = W >= 940 ? 18 : 12;
  const top = margin + s.top;
  const left = margin + s.left;
  const right = W - margin - s.right;
  const bottom = H - margin - s.bottom;
  const shellReserve = {
    x: W - s.right - SHELL_BUTTON_MARGIN - SHELL_CLUSTER_WIDTH,
    y: s.top + SHELL_BUTTON_MARGIN,
    w: SHELL_CLUSTER_WIDTH,
    h: SHELL_BUTTON_SIZE,
  };
  return {
    W,
    H,
    safe: s,
    margin,
    top,
    left,
    right,
    bottom,
    compact: W < 700,
    short: H < 480,
    classicMenu: W >= 1100 && H >= 640,
    shellReserve,
    contentTop: shellReserve.y + shellReserve.h + 8,
    availW: Math.max(0, right - left),
    availH: Math.max(0, bottom - top),
  };
}

export function clampScroll(offset: number, max: number): number {
  if (!Number.isFinite(offset) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.min(Math.max(0, offset), max);
}

/**
 * Scroll offset for one internally scrolling canvas panel. `max` is
 * recomputed by the draw pass every frame; wheel and touch-drag feed deltas.
 * `drag(y, scale)` is content-space for background drags (drag up scrolls
 * down) and negated for scrollbar thumbs (drag down scrolls down).
 */
export class HudScroll {
  offset = 0;
  max = 0;
  private lastY: number | null = null;

  get active(): boolean {
    return this.max > 0.5;
  }

  setMax(max: number): void {
    this.max = Number.isFinite(max) ? Math.max(0, max) : 0;
    this.offset = clampScroll(this.offset, this.max);
  }

  wheel(deltaY: number): void {
    if (!this.active || !Number.isFinite(deltaY)) return;
    this.offset = clampScroll(this.offset + deltaY, this.max);
  }

  beginDrag(): void {
    this.lastY = null;
  }

  drag(y: number, scale = 1): void {
    if (!Number.isFinite(y)) return;
    if (this.lastY != null) this.offset = clampScroll(this.offset - (y - this.lastY) * scale, this.max);
    this.lastY = y;
  }

  endDrag(): void {
    this.lastY = null;
  }
}

/** Minimum touch-friendly control size. */
export const TOUCH_TARGET = 44;

// ── Shared HUD panel + touch-control geometry ──────────────────────────────
//
// The match HUD (csHud.ts) and the touch controls must never cover each
// other, so both are derived from these pure functions; the unit tests prove
// pairwise disjointness across the supported viewport matrix.

export interface HudRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function rectsOverlap(a: HudRect, b: HudRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Menu title/subtitle and optional right-aligned FPS share the space left of chrome. */
export function menuHeaderLayout(L: HudLayout, statusWidth: number) {
  const statusX = L.shellReserve.x - 12;
  const titleWidth = Math.max(0, Math.min(80, statusX - L.left));
  const subtitleX = L.left + 80;
  const showStatus = L.availW >= 500 && statusX - statusWidth >= subtitleX + 12;
  const subtitleRight = showStatus ? statusX - statusWidth - 12 : statusX;
  return { titleWidth, subtitleX, subtitleWidth: Math.max(0, Math.min(190, subtitleRight - subtitleX)), statusX, showStatus };
}

/** Score strip stays below the radar on phones, left of shell chrome otherwise. */
export function scoreStripRect(L: HudLayout, radarSize: number): HudRect {
  const radarRight = L.left + radarSize + 12;
  const w = L.compact ? L.availW : Math.min(300, L.availW, L.shellReserve.x - 8 - radarRight);
  return {
    x: L.compact ? L.left : Math.max(radarRight, Math.min(L.W / 2 - w / 2, L.shellReserve.x - 8 - w)),
    y: L.compact ? L.top + radarSize + 30 : L.top - 4,
    w,
    h: 46,
  };
}

/** Only panels intersecting the utility row dock below its unchanged 64px edge. */
export function scoreboardRect(L: HudLayout, rowCount: number): HudRect {
  const w = Math.min(620, L.availW), h = Math.min(180 + rowCount * 26, L.availH);
  const rect = { x: L.left + (L.availW - w) / 2, y: Math.max(L.top, L.H / 2 - h / 2), w, h };
  if (rectsOverlap(rect, L.shellReserve)) {
    rect.y = L.contentTop;
    rect.h = Math.min(h, L.bottom - rect.y);
  }
  return rect;
}

/** Bottom-left health/armor/money panel. */
export function healthPanelRect(L: HudLayout): HudRect {
  const w = Math.min(L.short ? 210 : 230, L.compact ? L.availW * 0.44 : L.availW);
  return { x: L.margin + L.safe.left, y: L.H - 78 - L.margin - L.safe.bottom, w, h: 78 };
}

/** Bottom-right weapon/ammo panel. */
export function weaponPanelRect(L: HudLayout): HudRect {
  const w = Math.min(300, L.compact ? L.availW * 0.5 : L.availW);
  return { x: L.W - w - L.margin - L.safe.right, y: L.H - 100 - L.margin - L.safe.bottom, w, h: 100 };
}

export type TouchButtonId = 'fire' | 'jump' | 'reload' | 'use' | 'switch' | 'pause' | 'buy';

export interface TouchButton {
  id: TouchButtonId;
  cx: number;
  cy: number;
  r: number;
}

export function buttonHit(b: TouchButton): HudRect {
  return { x: b.cx - b.r, y: b.cy - b.r, w: b.r * 2, h: b.r * 2 };
}

export interface TouchControlsLayout {
  /** One or two disjoint look bands (right-middle), each registered as 'look'. */
  look: HudRect[];
  joystick: { cx: number; cy: number; r: number; hit: HudRect };
  buttons: TouchButton[];
}

const FIRE_R = 44; // hit 88
const SMALL_R = 24; // hit 48
const TOP_R = 22; // hit 44
const JOY_R = 50;
const JOY_PAD = 20; // hit 140
const GAP = 8;

/**
 * Touch control geometry. Invariants (unit-tested):
 * - every hit rect is >= TOUCH_TARGET in both axes and inside the viewport;
 * - joystick / fire / small action / pause / buy / look hit rects are
 *   pairwise disjoint;
 * - nothing covers the health or weapon panels, and pause/buy stay clear of
 *   the shell's top-right button reserve.
 */
export function computeTouchControls(L: HudLayout, opts: { hasBuy?: boolean } = {}): TouchControlsLayout {
  const right = L.right;
  const hp = healthPanelRect(L);
  const wp = weaponPanelRect(L);

  // Joystick docks above the health panel; the fire cluster above the ammo panel.
  const joyHit = JOY_R + JOY_PAD;
  const jx = hp.x + joyHit;
  const jy = hp.y - GAP - joyHit;
  const joystick = { cx: jx, cy: jy, r: JOY_R, hit: { x: jx - joyHit, y: jy - joyHit, w: joyHit * 2, h: joyHit * 2 } };

  const fireCx = right - FIRE_R;
  const fireCy = wp.y - GAP - FIRE_R;
  const buttons: TouchButton[] = [{ id: 'fire', cx: fireCx, cy: fireCy, r: FIRE_R }];
  const fireLeft = fireCx - FIRE_R;
  const fireTop = fireCy - FIRE_R;

  if (L.short) {
    // Landscape phones lack vertical room above FIRE (pause/buy own the top
    // strip), so the small actions form a horizontal row left of FIRE.
    let bx = fireLeft - GAP - SMALL_R;
    for (const id of ['jump', 'reload', 'use', 'switch'] as const) {
      buttons.push({ id, cx: bx, cy: fireCy, r: SMALL_R });
      bx -= SMALL_R * 2 + GAP;
    }
  } else {
    // Tall screens: JMP left of FIRE; RLD/USE (+SWP) in rows above FIRE.
    buttons.push({ id: 'jump', cx: fireLeft - GAP - SMALL_R, cy: fireCy, r: SMALL_R });
    const rowCy = fireTop - GAP - SMALL_R;
    const colB = right - SMALL_R;
    const colA = colB - SMALL_R * 2 - GAP;
    const colC = colA - SMALL_R * 2 - GAP;
    if (colC - SMALL_R > joystick.hit.x + joystick.hit.w + GAP) {
      buttons.push({ id: 'reload', cx: colB, cy: rowCy, r: SMALL_R });
      buttons.push({ id: 'use', cx: colA, cy: rowCy, r: SMALL_R });
      buttons.push({ id: 'switch', cx: colC, cy: rowCy, r: SMALL_R });
    } else {
      // Narrow portrait: three columns would collide with the joystick.
      buttons.push({ id: 'reload', cx: colB, cy: rowCy, r: SMALL_R });
      buttons.push({ id: 'use', cx: colA, cy: rowCy, r: SMALL_R });
      buttons.push({ id: 'switch', cx: colB, cy: rowCy - SMALL_R * 2 - GAP, r: SMALL_R });
    }
  }

  // Pause / buy sit directly under the shell's top-right button reserve.
  const topCy = L.contentTop + TOP_R;
  buttons.push({ id: 'pause', cx: L.W - 46 - L.safe.right, cy: topCy, r: TOP_R });
  if (opts.hasBuy) buttons.push({ id: 'buy', cx: L.W - 110 - L.safe.right, cy: topCy, r: TOP_R });

  // Look zone: bands that are disjoint from every control by construction.
  // Band 1 spans the full right width above the button cluster; band 2 (when
  // wide enough) continues below band 1 but only left of the cluster.
  const cluster = buttons.filter(b => b.id !== 'pause' && b.id !== 'buy');
  const clusterTop = Math.min(...cluster.map(b => b.cy - b.r));
  const clusterLeft = Math.min(...cluster.map(b => b.cx - b.r));
  const lookX = joystick.hit.x + joystick.hit.w + GAP;
  const lookY = L.contentTop + TOP_R * 2 + GAP; // below pause/buy
  const look: HudRect[] = [];
  const band1H = clusterTop - GAP - lookY;
  if (band1H >= 24 && right - lookX >= 40) look.push({ x: lookX, y: lookY, w: right - lookX, h: band1H });
  const band2Y = lookY + Math.max(0, band1H);
  const band2W = clusterLeft - GAP - lookX;
  const band2H = Math.min(hp.y, wp.y) - GAP - band2Y;
  if (band2W >= 40 && band2H >= 24) look.push({ x: lookX, y: band2Y, w: band2W, h: band2H });

  return { look, joystick, buttons };
}

/**
 * Truncate `str` with an ellipsis so it fits `maxW` at the current ctx font.
 * Returns the original string when it already fits.
 */
export function ellipsize(ctx: CanvasRenderingContext2D, str: string, maxW: number): string {
  if (ctx.measureText(str).width <= maxW) return str;
  let lo = 0, hi = str.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(str.slice(0, mid) + '…').width <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return str.slice(0, lo) + '…';
}
