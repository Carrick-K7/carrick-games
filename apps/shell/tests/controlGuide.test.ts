import { describe, expect, it } from 'vitest';
import type { GameControls } from '@carrick/game-sdk/catalog';
import { guideHasMode, renderGuideMode, renderTouchGuide, renderGuideNotes, renderGuideNoteDisclosure } from '../src/ui/control-guide.js';
import { renderVirtualKeyboard } from '../src/ui/virtual-keyboard.js';

describe('pure control-guide presentation', () => {
  it('escapes content and offers interactive keycaps only when requested', () => {
    const controls: GameControls = {
      keyboard: [{ keys: ['<', '"'], action: '<unsafe & text>', actionZh: '<操作>' }],
      touch: [{ icon: 'tap', action: '<script>not markup</script>', actionZh: '<轻点>' }],
      notes: [{ text: '<img onerror="bad">', textZh: '<说明>' }],
    };
    expect(renderVirtualKeyboard(controls, false)).toContain('<button');
    expect(renderVirtualKeyboard(controls, false)).toContain('&lt;unsafe &amp; text&gt;');
    expect(renderTouchGuide(controls, false)).not.toContain('<script>');
    expect(renderGuideNotes(controls, false)).not.toContain('<img');
    expect(renderGuideNotes(controls, true)).toContain('&lt;说明&gt;');
    const readonly = renderVirtualKeyboard(controls, false, false);
    expect(readonly).toContain('<kbd');
    expect(readonly).not.toContain('<button');
    expect(readonly).not.toContain('compact-mouse');
  });
  it('starts with at most three essentials and keeps every additional mapping in disclosure', () => {
    const controls: GameControls = { keyboard: Array.from({ length: 7 }, (_, i) => ({ keys: [`${i}`], action: `Action ${i}`, actionZh: `操作 ${i}` })) };
    const html = renderGuideMode(controls, false, 'keyboard');
    expect(html.split('<details')[0].match(/class="input-map-row"/g)).toHaveLength(3);
    expect(html.match(/class="input-map-row"/g)).toHaveLength(7);
    expect(html).toContain('<summary>More controls');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('vmouse');
  });
  it('supports localized sections and scoped notes without leaking keyboard prose into touch help', () => {
    const controls: GameControls = {
      touch: [{ icon: 'tap', action: 'Use', actionZh: '互动' }],
      notes: [
        { text: 'Press E', textZh: '按 E', audience: 'keyboard' },
        { text: 'Tap Use', textZh: '点击互动', audience: 'touch' },
        { text: 'Explore freely', textZh: '自由探索', audience: 'all' },
        { text: 'Take your time', textZh: '慢慢来' },
      ],
      sections: [{ title: 'Driving', titleZh: '驾驶', keyboard: [{ keys: ['W'], action: 'Accelerate', actionZh: '加速' }], touch: [{ icon: 'hold', action: 'Accelerate', actionZh: '加速' }], notes: [{ text: 'Use pedals', textZh: '使用踏板', audience: 'touch' }] }],
    };
    expect(guideHasMode(controls, 'keyboard')).toBe(true);
    expect(guideHasMode(controls, 'touch')).toBe(true);
    expect(renderGuideMode(controls, true, 'touch')).toContain('<summary>驾驶');
    expect(renderGuideMode(controls, false, 'keyboard')).not.toContain('Use pedals');
    expect(renderGuideMode(controls, false, 'touch')).toContain('Use pedals');
    const notes = renderGuideNoteDisclosure(controls, false, 'touch');
    expect(notes).not.toContain('Press E');
    expect(notes).toContain('Tap Use');
    expect(notes).toContain('Explore freely');
    expect(notes).toContain('Take your time');
  });
  it('bounds touch essentials while retaining every mapping and detects absent modes', () => {
    const controls: GameControls = { touch: Array.from({ length: 5 }, (_, i) => ({ icon: 'tap' as const, action: `Touch ${i}`, actionZh: `触屏 ${i}` })) };
    const html = renderGuideMode(controls, true, 'touch');
    expect(html.split('<details')[0].match(/class="guide-touch-row"/g)).toHaveLength(3);
    expect(html.match(/class="guide-touch-row"/g)).toHaveLength(5);
    expect(html).toContain('<summary>更多操作');
    expect(guideHasMode(controls, 'keyboard')).toBe(false);
    expect(guideHasMode(controls, 'touch')).toBe(true);
    expect(renderGuideMode(controls, false, 'keyboard')).toBe('');
  });
});
