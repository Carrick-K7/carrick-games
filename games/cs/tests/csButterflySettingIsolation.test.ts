import { afterEach, describe, expect, it, vi } from 'vitest';
import * as T from 'three';
import { WEAPONS, makeWeapon } from '../src/csWeapons.js';
import { applyWeaponAnimation, sampleWeaponMotion } from '../src/csWeaponMotion.js';
import { CsEngine, freeGeometry } from '../src/csEngine.js';
import { DEFAULT_SETTINGS } from '../src/csSettings.js';

const models: T.Object3D[] = [], engines: any[] = [];
afterEach(() => { models.splice(0).forEach(freeGeometry); engines.splice(0).forEach(e => e.dispose()); vi.unstubAllGlobals(); });
const equipped = Object.keys(WEAPONS).filter(id => id !== 'knife' && id !== 'armor');

describe('butterfly preference stays isolated from other equipped weapons', () => {
  it('reproduces the persisted-preference startup transition through the real player-view entry', () => {
    vi.stubGlobal('localStorage', { getItem: (key: string) => key === 'cs.controls.v1' ? JSON.stringify({ ...DEFAULT_SETTINGS, knifeModel: 'butterfly' }) : null, setItem() {} });
    const e: any = new CsEngine({ canvas: {}, isZh: () => false }); engines.push(e);
    expect(e.controlSettings.knifeModel).toBe('butterfly');
    e.player = e.makeActor('ct', 'PLAYER', true); e.all = [e.player]; e.phase = 'active'; e.clock = 10;
    e.setGun();
    expect(e.gun.userData.rig.id).toBe('usp');
    e.clock = e.player.deployAt + e.player.deployFor - 1e-6;
    e.syncPlayerView(1 / 60, false);
    e.clock += 1 / 60;
    // Previously threw Quaternion.fromArray(undefined), matching the live stack,
    // because every rig carried the saved knifeModel preference.
    expect(() => e.syncPlayerView(1 / 60, false)).not.toThrow();
    expect(e.gun.userData.rig.butterflyPresentation).toBeUndefined();
  });

  it.each(equipped)('%s keeps its own pose across action boundaries with butterfly selected', id => {
    const model = makeWeapon(id, true, 'butterfly'); models.push(model);
    const states = [
      { animationTime: 1, deployProgress: .999999 },
      { animationTime: 1.01, deployProgress: -1 },
      { animationTime: 1.02, shotAge: 0 },
      { animationTime: 1.03, shotAge: .03 },
      { animationTime: 2, reloadProgress: .3, empty: true },
      { animationTime: 2.02, reloadProgress: .8, empty: true },
      { animationTime: 2.04, reloadProgress: -1 },
      { animationTime: 3, inspectProgress: .8 },
      { animationTime: 3.02, inspectProgress: -1 },
      ...(id === 'he' ? [{ animationTime: 4, grenadeProgress: 1 }, { animationTime: 4.02, grenadeProgress: 1, grenadeThrowProgress: .5 }] : []),
    ];
    for (const state of states) {
      const pose = applyWeaponAnimation(model, state);
      expect(pose).toEqual(sampleWeaponMotion(id, { ...state, knifeModel: 'butterfly' }));
      expect(model.userData.rig.butterflyPresentation).toBeUndefined();
      model.updateMatrixWorld(true);
      model.traverse(o => expect(o.matrixWorld.elements.every(Number.isFinite)).toBe(true));
    }
  });

  it('retains presentation continuity on the actual butterfly knife', () => {
    const model = makeWeapon('knife', true, 'butterfly'); models.push(model);
    applyWeaponAnimation(model, { animationTime: 1, inspectProgress: .5 });
    const before = model.userData.rig.butterflyPresentation.displayed;
    const after = applyWeaponAnimation(model, { animationTime: 1, shotAge: 0 });
    expect(after.offset).toEqual(before.offset);
    expect(model.userData.rig.butterflyPresentation).toBeDefined();
    expect(after.knifeGrip).toHaveLength(4);
  });
});
