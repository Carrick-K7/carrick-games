export interface PokerRect { x: number; y: number; w: number; h: number }
export interface PokerLayout {
  left: number; width: number; top: number; compact: boolean; wide: boolean; opponentCardHeight: number;
  opponents: { x: number; y: number; width: number }[];
  board: PokerRect; human: PokerRect;
  dock: PokerRect; columns: number; statusY: number;
}

/** CSS-pixel UI geometry; resizing never changes the cards or betting state. */
export function pokerLayout(width: number, height: number, safe = { top: 0, right: 0, bottom: 0, left: 0 }): PokerLayout {
  const available = width - safe.left - safe.right;
  const w = Math.min(880, available - 24);
  const left = safe.left + (available - w) / 2;
  const wide = w >= 760 && height - safe.top - safe.bottom >= 540;
  const top = Math.max(safe.top + 64, (height - (wide ? 620 : 660)) / 2);
  const compact = height - safe.top - safe.bottom < 500 && w >= 440;
  const tight = !compact && height - safe.top - safe.bottom < 540;
  const columns = !compact && w < 480 ? 2 : 4;
  const dockH = columns === 2 ? 104 : 48;
  const bottom = wide ? Math.min(height - safe.bottom - 12, top + 608) : height - safe.bottom - 12;
  const dockY = bottom - dockH;
  const statusY = dockY - 14;
  const humanY = compact ? dockY - 82 : dockY - (tight ? 94 : wide ? 132 : 116);
  const opponentY = top + (compact ? 22 : tight ? 30 : 38);
  const boardW = Math.min(compact ? w * 0.52 : w - 16, wide ? 360 : 332);
  const cardH = compact ? 52 : wide ? 88 : Math.max(48, Math.min(76, (humanY - opponentY - 86) * 0.5));
  const opponentCardHeight = compact || tight ? 28 : wide ? 48 : 36;
  const boardY = compact ? humanY + 8 : Math.max(
    opponentY + 28 + opponentCardHeight + 17 + 42,
    (opponentY + 88 + humanY - cardH + 4) / 2,
  );
  return {
    left, width: w, top, compact, wide, opponentCardHeight,
    opponents: [0, 1, 2].map(i => ({
      x: wide ? left + w * [0.13, 0.5, 0.87][i] : left + w * (i + 0.5) / 3,
      y: wide && i !== 1 ? boardY - 14 : opponentY,
      width: wide ? 150 : w / 3 - 8,
    })),
    board: { x: compact ? left + 8 : left + (w - boardW) / 2, y: boardY, w: boardW, h: cardH },
    human: { x: compact ? left + w * 0.62 : left + w / 2 - 126, y: humanY, w: compact ? w * 0.38 : 252, h: compact ? 58 : tight ? 60 : wide ? 88 : 72 },
    dock: { x: left, y: dockY, w, h: dockH }, columns, statusY,
  };
}
