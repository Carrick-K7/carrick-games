import { afterEach, describe, expect, it } from 'vitest';
import { CsEngine } from '../src/csEngine.js';

const engines: any[] = [];
afterEach(() => engines.splice(0).forEach(engine => engine.dispose()));

describe('objective countdown presentation, not weapon-action prose', () => {
  for (const zh of [false, true]) for (const kind of ['plant', 'defuse']) {
    it(`${zh ? 'ZH' : 'EN'} ${kind} rounds displayed seconds without changing the action`, () => {
      const e: any = new CsEngine({ isZh: () => zh }); engines.push(e);
      e.player = e.makeActor('ct', 'YOU', true); e.all = [e.player];
      e.mode = 'defusal'; e.phase = 'active'; e.matchActive = true;
      e.bomb = { elapsed: 0, status: 'carried', canPlant: () => kind === 'plant', canDefuse: () => kind === 'defuse',
        action: { actor: e.player, kind, duration: 3.2, progress: 1.73 } };
      e.computeHud();
      const label = kind === 'plant' ? (zh ? '正在安放' : 'Planting') : (zh ? '正在拆除' : 'Defusing');
      expect(e.hud.objectiveAction.text).toBe(`${label} · 2s`);
      expect(e.hud.objectiveAction.progress01).toBeCloseTo(1.73 / 3.2);
      expect(e.bomb.action.progress).toBe(1.73);
      e.bomb.action.progress = 3.2; e.computeHud();
      expect(e.hud.objectiveAction.text).toBe(`${label} · 0s`);
    });
  }
});
