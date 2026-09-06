import { describe, expect, it } from 'vitest';
import { GAMES, type GameMeta } from '../../src/games/catalog.js';
import { renderTouchGuide, renderGuideNotes } from '../../src/ui/control-guide.js';
import { renderVirtualKeyboard } from '../../src/ui/virtual-keyboard.js';

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
    });
  }
  it('escapes content and offers interactive keycaps only when requested', () => {
    const controls: GameMeta['controls'] = {
      keyboard: [{ keys: ['<', '"'], action: '<unsafe & text>', actionZh: '<操作>' }],
      touch: [{ icon: 'tap', action: '<script>not markup</script>', actionZh: '<轻点>' }],
      notes: [{ text: '<img onerror="bad">', textZh: '<说明>' }],
    };
    expect(renderVirtualKeyboard(controls, false)).toContain('<button');
    expect(renderVirtualKeyboard(controls, false)).toContain('&lt;unsafe &amp; text&gt;');
    expect(renderTouchGuide(controls, false)).not.toContain('<script>');
    expect(renderGuideNotes(controls, false)).not.toContain('<img');
    expect(renderGuideNotes(controls, true)).toContain('&lt;说明&gt;');
  });
  it('keeps Villa activity instructions in the common catalog instead of a separate panel', () => {
    const villa = GAMES.find(g => g.id === 'villa')!;
    expect(renderGuideNotes(villa.controls, false)).toContain('Snooker:');
    expect(renderGuideNotes(villa.controls, true)).toContain('斯诺克');
    expect(renderVirtualKeyboard(villa.controls, false)).toContain('Toggle controls');
    expect(villa.controls.keyboard?.some(row => row.keys.includes('F'))).toBe(false);
    const cs = GAMES.find(g => g.id === 'cs')!;
    expect(cs.controls.keyboard?.find(row => row.keys.includes('F'))?.action.toLowerCase()).toContain('inspect');
  });
});
