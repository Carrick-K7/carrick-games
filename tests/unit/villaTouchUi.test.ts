import { describe, expect, it } from 'vitest';
import { villaUseCircle, wrapVillaTouchHint } from '../../src/games/villaTouchUi.js';

describe('villa mobile interaction layout', () => {
  it('keeps the whole narrow-phone snooker Exit hit region clear of Shot', () => {
    for (const cssWidth of [320, 340, 355, 370, 390, 550]) {
      const s = Math.min(3.5, Math.max(1.2, 1120 / cssWidth));
      const exit = villaUseCircle(1120, 700, s, true), hit = exit.radius + 2 * s;
      expect(exit.y - hit).toBeGreaterThan(120 * s);
      expect(exit.y + hit).toBeLessThan(700);
      expect(exit.x + hit).toBeLessThan(1120);
      expect(hit * 2 * cssWidth / 1120).toBeGreaterThanOrEqual(44);
    }
  });
  it('preserves the walking interaction circle location', () => {
    expect(villaUseCircle(1120, 700, 3, false)).toEqual({ x: 1006, y: 475, radius: 87 });
  });
  const measure = (text: string) => Array.from(text).length * 12;
  it('keeps short feedback intact', () => {
    expect(wrapVillaTouchHint('水龙头关好了。', 300, measure)).toEqual(['水龙头关好了。']);
    expect(wrapVillaTouchHint('', 300, measure)).toEqual(['']);
  });
  it('wraps, rather than discarding, the actual out-of-range explanation', () => {
    const message = '请靠近出现提示的物品或小动物，再点互动。';
    const lines = wrapVillaTouchHint(message, 180, measure);
    expect(lines).toHaveLength(2); expect(lines.join('')).toBe(message);
    expect(lines.every(line => measure(line) <= 180)).toBe(true);
  });
  it('preserves English word boundaries and the important failure reason', () => {
    const message = 'Brake to a complete stop before getting out.';
    const lines = wrapVillaTouchHint(message, 300, measure);
    expect(lines.join(' ')).toBe(message);
    expect(lines.every(line => measure(line) <= 300)).toBe(true);
  });
  it('bounds very long unbroken text to two measured lines with an ellipsis', () => {
    const lines = wrapVillaTouchHint('abcdefghijklmnopqrstuvwxyz'.repeat(8), 120, measure);
    expect(lines).toHaveLength(2); expect(lines[1].endsWith('…')).toBe(true);
    expect(lines.every(line => measure(line) <= 120)).toBe(true);
  });
});
