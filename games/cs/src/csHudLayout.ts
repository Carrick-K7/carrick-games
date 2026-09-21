// csHudLayout.ts — pure responsive layout math for the CS canvas HUD.
//
// The HUD (csHud.ts) draws menus, overlays and touch controls into the game
// canvas at the live CSS viewport size delivered through BaseGame.setViewport.
// This module keeps all viewport-shape decisions in pure functions so the
// layout can be unit-tested without a DOM: safe-area insets, the reserved
// top-right brand/help/menu reserve (the retained 200px clearance), breakpoints and
// internal scroll state for menus that do not fit short screens.

import {
  normalizeSafeArea, computeShellReserve, rectsOverlap,
  type HudSafeArea, type HudRect,
} from '@carrick/game-sdk/layout';
export {
  normalizeSafeArea, ZERO_SAFE_AREA, SHELL_BUTTON_SIZE, SHELL_BUTTON_MARGIN, SHELL_CLUSTER_WIDTH,
  computeShellReserve, rectsOverlap, type HudSafeArea, type HudRect,
} from '@carrick/game-sdk/layout';

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
  const shellReserve = computeShellReserve(W, s);
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

/** Aiming follows the world camera, not the safe-area/content-box center. */
export function aimGeometry(W: number, H: number) {
  const x = W / 2, y = H / 2;
  return { x, y, scopeRadius: Math.min(W, H) * .42,
    clearance: { x: x - 18, y: y - 18, w: 36, h: 36 } };
}

export function aimClearanceRect(L: HudLayout): HudRect {
  return aimGeometry(L.W, L.H).clearance;
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

/** Menu title/subtitle and optional right-aligned FPS share the space left of chrome. */
export function menuHeaderLayout(L: HudLayout, statusWidth: number) {
  const statusX = L.shellReserve.x - 12;
  const titleWidth = Math.max(0, Math.min(80, statusX - L.left));
  const subtitleX = L.left + 80;
  const showStatus = L.availW >= 500 && statusX - statusWidth >= subtitleX + 12;
  const subtitleRight = showStatus ? statusX - statusWidth - 12 : statusX;
  return { titleWidth, subtitleX, subtitleWidth: Math.max(0, Math.min(190, subtitleRight - subtitleX)), statusX, showStatus };
}

/** Shared modal bounds: the safe content box below the unchanged shell row. */
export function overlayBounds(L: HudLayout): HudRect {
  const y = Math.min(L.bottom, Math.max(L.top, L.contentTop));
  return { x: L.left, y, w: L.availW, h: Math.max(0, L.bottom - y) };
}

/** Center in safe content, not W/2 or H/2 (which drift on notched screens). */
export function overlayRect(L: HudLayout, desiredW: number, desiredH: number): HudRect {
  const bounds = overlayBounds(L);
  const w = Math.min(bounds.w, Math.max(0, desiredW));
  const h = Math.min(bounds.h, Math.max(0, desiredH));
  return { x: bounds.x + (bounds.w - w) / 2, y: bounds.y + (bounds.h - h) / 2, w, h };
}

/** Radar size/position is shared with the score, touch and feedback geometry. */
export function radarRect(L: HudLayout): HudRect {
  let size = L.short ? Math.round(Math.min(96, Math.max(64, L.availH * 0.33)))
    : L.compact ? Math.max(88, Math.min(148, Math.round(Math.min(L.W, L.H) * 0.28))) : 148;
  // The normal 320px radar ends at x102, before the x108 utility reserve.
  // With a large side inset it cannot stay there: put score first, then radar.
  const docked = L.left + size + 6 > L.shellReserve.x;
  const y = docked ? L.contentTop + 58 : L.top, aim = aimClearanceRect(L);
  if (docked && rectsOverlap({ x: L.left, y, w: size, h: size + (L.short ? 0 : 24) }, aim)) {
    // Preserve an aiming lane on short, heavily inset portrait windows instead
    // of letting a docked radar/caption force every touch action into that lane.
    size = Math.max(56, Math.min(size, aim.x - L.left - 8));
  }
  return { x: L.left, y, w: size, h: size };
}

/** Short landscape keeps the score beside the radar, not across its controls. */
export function scoreStripRect(L: HudLayout, radarSize: number): HudRect {
  const radar = radarRect(L);
  const radarRight = L.left + radarSize + 12;
  const besideW = Math.max(0, Math.min(300, L.shellReserve.x - 8 - radarRight));
  // A 44px landscape side notch leaves 145px here on a 568px screen.
  // Docking the strip below the radar instead would put it directly over aim.
  const beside = (!L.compact || L.short) && besideW >= (L.short ? 140 : 160) && radar.y === L.top;
  const w = beside ? besideW : L.availW;
  return {
    x: beside ? Math.max(radarRight, Math.min(L.left + (L.availW - w) / 2, L.shellReserve.x - 8 - w)) : L.left,
    y: beside ? L.top - 4 : radar.y > L.top ? L.contentTop : L.top + radarSize + 30,
    w,
    h: 46,
  };
}

export function scoreboardRect(L: HudLayout, rowCount: number): HudRect {
  return overlayRect(L, 620, 156 + Math.max(0, rowCount) * 28);
}

export interface HudTableColumn { x: number; w: number }

/** Flexible name column, bounded numeric/status slots; no desktop x-220 offsets. */
export function scoreboardColumns(panel: HudRect): Record<'name' | 'kills' | 'deaths' | 'status', HudTableColumn> {
  const pad = Math.min(20, panel.w * 0.05), gap = Math.min(8, panel.w * 0.02);
  const available = Math.max(0, panel.w - pad * 2 - gap * 3);
  const numeric = Math.min(48, available * 0.15);
  const statusW = Math.min(80, available * 0.24);
  const name = { x: panel.x + pad, w: available - numeric * 2 - statusW };
  const kills = { x: name.x + name.w + gap, w: numeric };
  const deaths = { x: kills.x + kills.w + gap, w: numeric };
  const status = { x: deaths.x + deaths.w + gap, w: statusW };
  return { name, kills, deaths, status };
}

/** Use one scroll region for both teams; headers/close/footer remain fixed. */
export function scoreboardBodyLayout(panel: HudRect, rowCount: number) {
  const rowHeight = 28, teamHeaderHeight = 32;
  const headerH = Math.min(72, panel.h), footerH = Math.min(20, Math.max(0, panel.h - headerH));
  const pad = Math.min(12, panel.w / 2);
  const body = { x: panel.x + pad, y: panel.y + headerH, w: Math.max(0, panel.w - pad * 2), h: Math.max(0, panel.h - headerH - footerH) };
  const contentH = Math.max(0, rowCount) * rowHeight + teamHeaderHeight * 2;
  return { body, rowHeight, teamHeaderHeight, contentH, maxScroll: Math.max(0, contentH - body.h) };
}

/** Bottom-left health/armor/money panel; short screens use fewer content rows. */
export function healthPanelRect(L: HudLayout): HudRect {
  const w = Math.min(L.short ? 210 : 230, L.compact ? L.availW * 0.44 : L.availW);
  const h = L.short ? 62 : 78;
  return { x: L.left, y: L.bottom - h, w, h };
}

/** Bottom-right weapon/ammo panel; drawing must honor the returned height. */
export function weaponPanelRect(L: HudLayout): HudRect {
  const w = Math.min(300, L.compact ? L.availW * 0.5 : L.availW);
  const h = L.short ? 76 : 100;
  return { x: L.right - w, y: L.bottom - h, w, h };
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
function preferredTouchControls(L: HudLayout, opts: { hasBuy?: boolean } = {}): TouchControlsLayout {
  const right = L.right;
  const hp = healthPanelRect(L);
  const wp = weaponPanelRect(L);
  const radar = radarRect(L);

  if (L.short) {
    // A single bottom-aligned row keeps seven real >=44px actions clear even
    // on a 568x320 notched phone. Pause/buy cannot use their portrait top row:
    // that row intersects FIRE at this height. Leave a look band above it.
    const smallIds: TouchButtonId[] = ['jump', 'reload', 'use', 'switch', 'pause', ...(opts.hasBuy ? ['buy' as const] : [])];
    const joyD = Math.min(88, Math.max(TOUCH_TARGET, hp.y - GAP - radar.y - radar.h - GAP));
    const jx = hp.x + joyD / 2, jy = hp.y - GAP - joyD / 2;
    const joystick = { cx: jx, cy: jy, r: Math.max(22, Math.min(36, joyD / 2 - 8)), hit: { x: hp.x, y: jy - joyD / 2, w: joyD, h: joyD } };
    const fireD = Math.max(TOUCH_TARGET, Math.min(FIRE_R * 2, wp.y - GAP - L.contentTop,
      L.availW - joyD - smallIds.length * (TOUCH_TARGET + GAP) - GAP));
    const actionBottom = wp.y - GAP;
    const buttons: TouchButton[] = [{ id: 'fire', cx: right - fireD / 2, cy: actionBottom - fireD / 2, r: fireD / 2 }];
    let bx = right - fireD - GAP - TOP_R;
    for (const id of smallIds) {
      buttons.push({ id, cx: bx, cy: actionBottom - TOP_R, r: TOP_R });
      bx -= TOUCH_TARGET + GAP;
    }
    const strip = scoreStripRect(L, radar.w);
    const lookX = Math.max(joystick.hit.x + joyD, radar.x + radar.w) + GAP;
    const lookY = Math.max(L.contentTop, strip.y + strip.h + GAP);
    const lookW = right - fireD - GAP - lookX;
    const lookH = actionBottom - TOUCH_TARGET - GAP - lookY;
    const look = lookW >= 40 && lookH >= 24 ? [{ x: lookX, y: lookY, w: lookW, h: lookH }] : [];
    return { joystick, buttons, look };
  }

  // Side insets can reduce a 320px viewport below the original 296px usable
  // width. Shrink the generous joystick pad, never the small action targets.
  const joyHit = Math.min(JOY_R + JOY_PAD, Math.max(TOUCH_TARGET / 2, (L.availW - 152) / 2));
  const jx = hp.x + joyHit;
  const jy = hp.y - GAP - joyHit;
  const joystick = { cx: jx, cy: jy, r: Math.max(22, Math.min(JOY_R, joyHit - 12)), hit: { x: jx - joyHit, y: jy - joyHit, w: joyHit * 2, h: joyHit * 2 } };
  const topY = radar.y > L.top ? radar.y : L.contentTop;
  const fireR = Math.max(TOP_R, Math.min(FIRE_R, (wp.y - 120 - (topY + TOUCH_TARGET + GAP)) / 2));
  const fireCx = right - fireR;
  const fireCy = wp.y - GAP - fireR;
  const buttons: TouchButton[] = [{ id: 'fire', cx: fireCx, cy: fireCy, r: fireR }];
  const fireLeft = fireCx - fireR;
  const fireTop = fireCy - fireR;

  {
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

  // With a docked radar, the score owns contentTop; utilities sit beside radar.
  const topCy = topY + TOP_R;
  buttons.push({ id: 'pause', cx: L.W - 46 - L.safe.right, cy: topCy, r: TOP_R });
  if (opts.hasBuy) buttons.push({ id: 'buy', cx: L.W - 110 - L.safe.right, cy: topCy, r: TOP_R });

  // Look zone: bands that are disjoint from every control by construction.
  // Band 1 spans the full right width above the button cluster; band 2 (when
  // wide enough) continues below band 1 but only left of the cluster.
  const cluster = buttons.filter(b => b.id !== 'pause' && b.id !== 'buy');
  const clusterTop = Math.min(...cluster.map(b => b.cy - b.r));
  const clusterLeft = Math.min(...cluster.map(b => b.cx - b.r));
  const lookX = Math.max(joystick.hit.x + joystick.hit.w, radar.x + radar.w) + GAP;
  const score = scoreStripRect(L, radar.w);
  const lookY = Math.max(topY + TOP_R * 2 + GAP, score.y + score.h + GAP); // below score and pause/buy
  const look: HudRect[] = [];
  const band1H = clusterTop - GAP - lookY;
  if (band1H >= 24 && right - lookX >= 40) look.push({ x: lookX, y: lookY, w: right - lookX, h: band1H });
  const band2Y = lookY + Math.max(0, band1H);
  const band2W = clusterLeft - GAP - lookX;
  const band2H = Math.min(hp.y, wp.y) - GAP - band2Y;
  if (band2W >= 40 && band2H >= 24) look.push({ x: lookX, y: band2Y, w: band2W, h: band2H });
  if (!look.length) {
    // A docked radar can leave no full-width band above the topmost action.
    // Keep aiming possible in the gap beside that action instead of returning
    // an empty set of look regions on heavily inset 320px portrait screens.
    const blocked = [joystick.hit, ...buttons.map(buttonHit), { ...radar, h: radar.h + 24 }, { ...score, h: score.h + 8 }, hp, wp];
    const bounds = overlayBounds(L);
    const band = freeHudSlot(bounds, blocked, L.availW, 44, 40, lookY)
      ?? freeHudSlot(bounds, blocked, L.availW, 24, 40, lookY);
    if (band) look.push(band);
  }

  return { look, joystick, buttons };
}

/** Preserve the familiar arrangement when its targets and aim are all clear. */
export function computeTouchControls(L: HudLayout, opts: { hasBuy?: boolean } = {}): TouchControlsLayout {
  const preferred = preferredTouchControls(L, opts), aim = aimClearanceRect(L);
  const radar = radarRect(L), score = scoreStripRect(L, radar.w), hp = healthPanelRect(L), wp = weaponPanelRect(L);
  const bounds = overlayBounds(L);
  const fixed = [L.shellReserve, { ...radar, h: radar.h + (L.short ? 0 : 24) }, { ...score, h: score.h + 8 }, hp, wp];
  const visible = [preferred.joystick.hit, ...preferred.buttons.map(buttonHit)];
  const valid = preferred.look.length > 0 && visible.every((r, i) =>
    r.x >= L.left && r.y >= L.top && r.x + r.w <= L.right && r.y + r.h <= L.bottom
    && ![aim, ...fixed, ...visible.slice(0, i)].some(other => rectsOverlap(r, other)));
  if (valid) return preferred;
  // Dense landscape needs a split row on either side of aim. Reclaim generous
  // joystick padding/fire diameter before reducing gaps; never shrink a target
  // below 44px. The slot search can also use a second row when height permits.
  let best: TouchControlsLayout | null = null;
  for (const compact of [false, true]) {
    for (const gap of [GAP, 4]) {
      const joyD = compact ? TOUCH_TARGET : preferred.joystick.hit.w;
      const hit = { x: L.left, y: hp.y - GAP - joyD, w: joyD, h: joyD };
      if (hit.y < bounds.y || [...fixed, aim].some(r => rectsOverlap(hit, r))) continue;
      const joystick = { cx: hit.x + joyD / 2, cy: hit.y + joyD / 2,
        r: Math.min(preferred.joystick.r, joyD / 2), hit };
      const blocked = [...fixed, aim, hit], buttons: TouchButton[] = [];
      for (const button of preferred.buttons) {
        const diameter = compact ? TOUCH_TARGET : button.r * 2;
        const rect = freeHudSlot(bounds, blocked, diameter, diameter, diameter,
          button.cy - button.r, true, gap);
        if (!rect) continue;
        buttons.push({ id: button.id, cx: rect.x + diameter / 2, cy: rect.y + diameter / 2, r: diameter / 2 });
        blocked.push(rect);
      }
      // Invisible look regions may cross aim: they do not hide the target.
      const lookObstacles = [...fixed, hit, ...buttons.map(buttonHit)];
      const band = freeHudSlot(bounds, lookObstacles, L.availW, 44, 40, score.y + score.h + GAP, false, gap)
        ?? freeHudSlot(bounds, lookObstacles, L.availW, 24, 40, score.y + score.h + GAP, false, gap);
      const result = { joystick, buttons, look: band ? [band] : [] };
      if (band && buttons.length === preferred.buttons.length) return result;
      if (!best || buttons.length > best.buttons.length || (buttons.length === best.buttons.length && band)) best = result;
    }
  }
  // On physically unsupported tiny viewports, retain only safely placed
  // controls rather than silently covering the aim point with a fallback.
  if (best) return best;
  const hit = { x: Math.min(L.left, aim.x - TOUCH_TARGET), y: Math.max(L.top, hp.y - GAP - TOUCH_TARGET),
    w: TOUCH_TARGET, h: TOUCH_TARGET };
  const joystick = { cx: hit.x + TOUCH_TARGET / 2, cy: hit.y + TOUCH_TARGET / 2, r: TOUCH_TARGET / 2, hit };
  const buttons = preferred.buttons.filter(b => ![aim, hit, ...fixed].some(r => rectsOverlap(buttonHit(b), r)));
  const band = freeHudSlot(bounds, [...fixed, hit, ...buttons.map(buttonHit)], L.availW, 24, 40, L.contentTop);
  return { joystick, buttons, look: band ? [band] : [] };
}

export interface MatchFeedbackOptions {
  touch?: boolean;
  hasBuy?: boolean;
  objective?: boolean;
  objectiveAction?: boolean;
  center?: boolean;
  notice?: boolean;
  pickup?: boolean;
  killfeedCount?: number;
  /** Requested outer caption widths, including the caller's text padding. */
  hitConfirmationWidth?: number;
  scopeLabelWidth?: number;
}

export interface MatchFeedbackLayout {
  objective: HudRect | null;
  objectiveAction: HudRect | null;
  center: HudRect | null;
  notice: HudRect | null;
  pickup: HudRect | null;
  hitConfirmation: HudRect | null;
  scopeLabel: HudRect | null;
  killfeed: HudRect[];
}

/** Find a readable free horizontal slot; avoid shrinking fonts to fit collisions. */
function freeHudSlot(bounds: HudRect, blocked: HudRect[], width: number, height: number, minWidth: number, preferredY: number, alignRight = false, gap = GAP, preferredX?: number): HudRect | null {
  if (height > bounds.h || minWidth > bounds.w) return null;
  const clampY = (y: number) => Math.max(bounds.y, Math.min(bounds.y + bounds.h - height, y));
  const ys = new Set([bounds.y, clampY(preferredY), bounds.y + bounds.h - height]);
  for (const rect of blocked) {
    ys.add(clampY(rect.y - gap - height));
    ys.add(clampY(rect.y + rect.h + gap));
  }
  let best: HudRect | null = null, bestCost = Infinity;
  for (const y of ys) {
    let slots = [{ left: bounds.x, right: bounds.x + bounds.w }];
    for (const rect of blocked) {
      if (y >= rect.y + rect.h + gap || y + height <= rect.y - gap) continue;
      const left = rect.x - gap, right = rect.x + rect.w + gap;
      slots = slots.flatMap(slot => {
        if (right <= slot.left || left >= slot.right) return [slot];
        return [{ left: slot.left, right: Math.min(slot.right, left) }, { left: Math.max(slot.left, right), right: slot.right }]
          .filter(part => part.right - part.left >= minWidth);
      });
    }
    for (const slot of slots) {
      const w = Math.min(width, slot.right - slot.left);
      if (w < minWidth) continue;
      const centerX = preferredX ?? bounds.x + (bounds.w - w) / 2;
      const x = alignRight ? slot.right - w : Math.max(slot.left, Math.min(slot.right - w, centerX));
      const cost = (Math.min(width, bounds.w) - w) * 2 + Math.abs(y - preferredY) + Math.abs(x - (alignRight ? bounds.x + bounds.w - w : centerX)) * 0.2;
      if (cost < bestCost) { best = { x, y, w, h: height }; bestCost = cost; }
    }
  }
  return best;
}

/**
 * Shared match feedback avoids the radar, score/pips, health/ammo and visible
 * touch controls. Invisible look bands are intentionally NOT visual obstacles.
 * Priority: objective action, hit confirmation, scope caption, center result,
 * objective, pickup, notice, feed. Lower-priority entries return null / fewer
 * feed rows rather than overpaint critical HUD. No fallback may cover aim.
 */
export function matchFeedbackLayout(L: HudLayout, options: MatchFeedbackOptions = {}): MatchFeedbackLayout {
  const bounds = overlayBounds(L), radar = radarRect(L), score = scoreStripRect(L, radar.w);
  const aim = aimGeometry(L.W, L.H);
  const blocked: HudRect[] = [
    aim.clearance,
    { ...radar, h: radar.h + (L.short ? 0 : 24) },
    { ...score, h: score.h + 8 },
    healthPanelRect(L), weaponPanelRect(L),
  ];
  if (options.touch) {
    const controls = computeTouchControls(L, { hasBuy: options.hasBuy });
    blocked.push(controls.joystick.hit, ...controls.buttons.map(buttonHit));
  }
  const result: MatchFeedbackLayout = { objective: null, objectiveAction: null, center: null, notice: null, pickup: null,
    hitConfirmation: null, scopeLabel: null, killfeed: [] };
  const topY = Math.max(L.contentTop, score.y + score.h + 16);
  const place = (w: number, h: number, minW: number, y = topY, right = false) => {
    const rect = freeHudSlot(bounds, blocked, w, h, Math.min(minW, bounds.w), y, right);
    if (rect) blocked.push(rect);
    return rect;
  };
  if (options.objectiveAction) {
    // Extreme short-height + top/bottom inset combinations have one 24px
    // lane. Keep the action label/progress visible; draw from rect.h, not 40.
    result.objectiveAction = place(360, 40, 160) ?? place(240, 40, 96) ?? place(360, 24, 96);
  }
  const caption = (requestedWidth: number | undefined, preferredY: number) => {
    if (typeof requestedWidth !== 'number' || !Number.isFinite(requestedWidth) || requestedWidth <= 0) return null;
    const width = Math.min(requestedWidth, bounds.w);
    if (width <= 0) return null;
    const rect = freeHudSlot(bounds, blocked, width, 22, width, preferredY, false, GAP, aim.x - width / 2)
      ?? freeHudSlot(bounds, blocked, width, 22, Math.min(width, 80), preferredY, false, GAP, aim.x - width / 2);
    if (rect) blocked.push(rect);
    return rect;
  };
  result.hitConfirmation = caption(options.hitConfirmationWidth, aim.clearance.y + aim.clearance.h + GAP);
  result.scopeLabel = caption(options.scopeLabelWidth, aim.y + aim.scopeRadius + GAP);
  if (options.center) {
    const y = Math.max(topY, bounds.y + bounds.h * 0.18);
    result.center = place(560, 80, 160, y) ?? place(560, 56, 160, y);
  }
  if (options.objective) result.objective = place(460, 30, 140);
  if (options.pickup) result.pickup = place(240, 32, 120, Math.min(healthPanelRect(L).y, weaponPanelRect(L).y) - 48);
  if (options.notice) result.notice = place(460, 32, 140, topY + 42);
  for (let i = 0; i < Math.min(5, Math.max(0, options.killfeedCount ?? 0)); i++) {
    const row = place(300, 22, 160, L.contentTop + i * 30, true);
    if (!row) break;
    result.killfeed.push(row);
  }
  return result;
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
