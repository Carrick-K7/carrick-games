import {expect,it} from 'vitest';
import metadata from '../game.json';
import {BUTTERFLY_VARIANTS} from '../src/csButterflyKnife.js';
it('describes the implemented reference scope truthfully in both help languages',()=>{
  expect(BUTTERFLY_VARIANTS).toEqual({draw:2,inspect:1});
  const notes=metadata.controls.sections.find(s=>s.id==='weapons')!.notes!;
  const note=notes.find(n=>n.text.includes('Butterfly'))!;
  expect(note.text).toContain('two draw sequences and one reference-led inspect sequence');
  expect(note.textZh).toContain('两种拔刀动作和一种参考原作重建的检视动作');
  expect(note.text).not.toMatch(/inspect animations have randomized variants/i);
  expect(note.audience).toBe('all');
});
