import { describe, expect, it } from 'vitest';
import { pokerLayout } from '../src/texasholdLayout';

const views = [[320, 480], [320, 568], [390, 844], [480, 320], [568, 320], [640, 320], [844, 390], [1440, 900], [2560, 1440]];
describe('poker layout', () => {
  for (const [width, height] of views) it(`keeps the hand, board and controls separated at ${width}x${height}`, () => {
    const l = pokerLayout(width, height);
    expect(l.top).toBeGreaterThanOrEqual(64);
    expect(l.dock.y + l.dock.h).toBeLessThanOrEqual(height - 12);
    expect(l.dock.w / l.columns - 8).toBeGreaterThanOrEqual(44);
    expect(l.human.y + l.human.h).toBeLessThan(l.statusY - 8);
    if (l.compact) {
      expect(l.board.x + l.board.w).toBeLessThan(l.human.x - 8);
      expect(l.board.y + l.board.h).toBeLessThan(l.statusY);
    } else {
      expect(l.board.y + l.board.h).toBeLessThanOrEqual(l.human.y - 8);
      const middle = l.opponents[1];
      expect(middle.y + 28 + l.opponentCardHeight + 17).toBeLessThanOrEqual(l.board.y - 40);
    }
  });
  it('uses compact geometry for a notched short landscape', () => {
    const l = pokerLayout(667, 375, { top: 0, left: 44, right: 44, bottom: 21 });
    expect(l.compact).toBe(true);
    expect(l.left).toBeGreaterThanOrEqual(44);
    expect(l.dock.x + l.dock.w).toBeLessThanOrEqual(623);
    expect(l.dock.y + l.dock.h).toBeLessThanOrEqual(342);
  });
});
