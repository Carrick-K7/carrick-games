/** Shared CSS-pixel safe area and the responsive game's shell-chrome reserve. */
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

/** Brand/help/menu row; fixed-layout games retain their own left brand anchor. */
export const SHELL_BUTTON_SIZE = 44;
export const SHELL_BUTTON_MARGIN = 12;
export const SHELL_CLUSTER_WIDTH = 96 + 8 + SHELL_BUTTON_SIZE * 2 + 8;

export interface HudRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function rectsOverlap(a: HudRect, b: HudRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Only the shared brand/help/menu reserve, without any game's HUD layout. */
export function computeShellReserve(W: number, safe?: Partial<HudSafeArea> | null): HudRect {
  const s = normalizeSafeArea(safe);
  return {
    x: W - s.right - SHELL_BUTTON_MARGIN - SHELL_CLUSTER_WIDTH,
    y: s.top + SHELL_BUTTON_MARGIN,
    w: SHELL_CLUSTER_WIDTH,
    h: SHELL_BUTTON_SIZE,
  };
}
