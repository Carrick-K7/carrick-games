import { describe, expect, it } from 'vitest';
import { GAMES } from '../support/catalog.ts';
import { renderTouchGuide, renderGuideMode } from '../../apps/shell/src/ui/control-guide.js';
import { renderVirtualKeyboard } from '../../apps/shell/src/ui/virtual-keyboard.js';

// Cross-game metadata audit. Synthetic presentation fixtures live in apps/shell/tests.
describe('one catalog-driven control guide for every game', () => {
  for (const game of GAMES) for (const zh of [false, true]) {
    it(`${game.id} ${zh ? 'zh' : 'en'} renders complete keyboard and touch guidance`, () => {
      const keyboard = renderVirtualKeyboard(game.controls, zh, false);
      expect(keyboard.match(/class="input-map-row"/g)?.length ?? 0).toBe(game.controls.keyboard?.length ?? 0);
      expect(keyboard).not.toContain('<button');
      const touch = renderTouchGuide(game.controls, zh);
      expect(touch.match(/class="guide-touch-row"/g)?.length ?? 0).toBe(game.controls.touch?.length ?? 0);
      for (const entry of game.controls.keyboard ?? []) expect(zh ? entry.actionZh : entry.action).not.toBe('');
      for (const entry of game.controls.touch ?? []) expect(zh ? entry.actionZh : entry.action).not.toBe('');
      const groups = [game.controls, ...(game.controls.sections ?? [])];
      const allKeyboard = groups.flatMap(group => group.keyboard ?? []);
      const allTouch = groups.flatMap(group => group.touch ?? []);
      const groupedKeyboard = renderGuideMode(game.controls, zh, 'keyboard');
      expect(groupedKeyboard.match(/class="input-map-row"/g)?.length ?? 0).toBe(allKeyboard.length);
      expect(groupedKeyboard).not.toContain('<button');
      expect(renderGuideMode(game.controls, zh, 'touch').match(/class="guide-touch-row"/g)?.length ?? 0).toBe(allTouch.length);
      for (const entry of [...allKeyboard, ...allTouch]) expect(zh ? entry.actionZh : entry.action).not.toBe('');
    });
  }
  it.skipIf(!GAMES.some(game => game.id === 'villa') || !GAMES.some(game => game.id === 'cs'))('keeps Villa activity instructions in the common catalog instead of a separate panel', () => {
    const villa = GAMES.find(g => g.id === 'villa')!;
    expect(renderGuideMode(villa.controls, false, 'keyboard')).toContain('Snooker practice');
    expect(renderGuideMode(villa.controls, true, 'touch')).toContain('斯诺克练习');
    expect(renderGuideMode(villa.controls, false, 'keyboard')).toContain('Toggle the shared controls guide');
    const villaKeys = [villa.controls, ...(villa.controls.sections ?? [])].flatMap(group => group.keyboard ?? []);
    expect(villaKeys.some(row => row.keys.includes('F'))).toBe(false);
    const cs = GAMES.find(g => g.id === 'cs')!;
    const csKeys = [cs.controls, ...(cs.controls.sections ?? [])].flatMap(group => group.keyboard ?? []);
    expect(csKeys.find(row => row.keys.includes('F'))?.action.toLowerCase()).toContain('inspect');
  });
});
