import { afterEach, describe, expect, it, vi } from 'vitest';
import * as T from 'three';
import { CsEngine } from '../src/csEngine.js';
import { BUTTERFLY_DEPLOY_DURATION, BUTTERFLY_INSPECT_DURATION, BUTTERFLY_VARIANTS } from '../src/csButterflyKnife.js';

const engines: any[] = [];
afterEach(() => { engines.splice(0).forEach(e => e.dispose()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function arena() {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
  const e: any = new CsEngine({ canvas: {}, isZh: () => false }); engines.push(e);
  e.world = { theme: 'snow', spawns: { ct: [{ pos: new T.Vector3() }], t: [{ pos: new T.Vector3(0, 0, -3) }] },
    raycast: vi.fn(() => null), ground: () => 0, canStand: () => true, lineClear: () => true, dispose() {} };
  e.player = e.makeActor('ct', 'YOU', true); const target = e.makeActor('t', 'TARGET', false);
  target.armor = 0; target.health = 100; e.player.grounded = true;
  e.all = [e.player, target]; e.bots = [target]; e.clock = 20; e.phase = 'active'; e.mode = 'tdm'; e.matchActive = true;
  e.controlSettings.knifeModel = 'butterfly'; e.player.slot = 'knife'; e.setGun(false);
  e.hitActor = vi.fn(() => ({ actor: target, distance: 1, head: false }));
  e.player.inspectAt = e.clock - 3.4 * .5; e.player.butterflyInspectVariant = 2;
  e.syncPlayerView(0, false);
  return { e, target };
}

describe('butterfly visual refinement preserves immediate combat', () => {
  it.each([false, true])('damage/range/cooldown remain unchanged during inspect interruption; heavy=%s', heavy => {
    const { e, target } = arena();
    const tip = () => e.gun.userData.rig.butterflyBlade.localToWorld(e.gun.userData.rig.knifeTip.clone());
    const before = tip(), clock = e.clock;
    e.fire(heavy); // Actual command; no simulation time is advanced for damage.
    expect(e.clock).toBe(clock); expect(target.health).toBe(heavy ? 10 : 60);
    expect(e.player.cooldown).toBe(heavy ? 1 : .5);
    expect(e.weaponOf(e.player).readyAt).toBe(clock + (heavy ? 1 : .5));
    expect(e.hitActor.mock.calls[0][2]).toBe(heavy ? 1.5 : 1.8);
    expect(e.player.inspectAt).toBe(-99); expect(e.weaponOf(e.player).shotAt).toBe(clock);
    e.syncPlayerView(0, false);
    expect(tip().distanceTo(before)).toBeLessThan(1e-10);
    const hp = target.health; e.fire(heavy); expect(target.health).toBe(hp);
  });
  it('keeps pause/deploy guards and original authored action durations/counts', () => {
    const { e, target } = arena(); e.phase = 'paused'; e.fire(); expect(target.health).toBe(100);
    e.phase = 'active'; e.beginDeploy(e.player); e.fire(); expect(target.health).toBe(100);
    expect(e.player.deployFor).toBe(1.05);
    expect(BUTTERFLY_DEPLOY_DURATION).toBe(1.05); expect(BUTTERFLY_INSPECT_DURATION).toBe(3.4);
    expect(BUTTERFLY_VARIANTS).toEqual({ draw: 2, inspect: 3 });
  });
});
