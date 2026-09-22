import * as T from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CsEngine } from '../src/csEngine.js';
import { WEAPONS } from '../src/csWeapons.js';
import { actionCues, DEPLOY } from '../src/csWeaponDeploy.js';
import { reloadCues } from '../src/csWeaponMotion.js';

// As in csV28Engine.test: real Three geometry, gun rigs, engine/input/phase
// loops and reload accounting; substitute only GPU, audio and arena collision.
vi.mock('three', async importOriginal => {
  const actual = await importOriginal<typeof import('three')>();
  return { ...actual, WebGLRenderer: class {
    shadowMap = { enabled: true, type: 0 };
    setSize = vi.fn(); setPixelRatio = vi.fn(); setAnimationLoop = vi.fn(); dispose = vi.fn();
  } };
});

const engines: any[] = [];
beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) });
});
afterEach(() => {
  for (const e of engines.splice(0)) e.dispose();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});
function arena() {
  const e: any = new CsEngine({ canvas: {}, isZh: () => false, assetUrl: (path: string) => `https://example.test/cs/${path}` });
  engines.push(e);
  vi.spyOn(e.audio, 'preload').mockResolvedValue(undefined);
  vi.spyOn(e.audio, 'init').mockImplementation(() => {});
  vi.spyOn(e.audio, 'mechanic').mockReturnValue(false);
  vi.spyOn(e.audio, 'spatialMechanic').mockReturnValue(false);
  vi.spyOn(e.audio, 'shot').mockImplementation(() => {});
  vi.spyOn(e.audio, 'hit').mockImplementation(() => {});
  e.world = {
    theme: 'snow', size: 40, center: new T.Vector3(),
    spawns: { ct: [{ pos: new T.Vector3() }], t: [{ pos: new T.Vector3(20, 0, 0) }] },
    bombSites: [], buyZones: [], pickups: [], raycast: vi.fn(() => null), lineClear: () => true,
    ground: () => 0, canStand: () => true, update: vi.fn(), dispose: vi.fn(),
    move: (a: any, x: number, z: number) => { a.pos.x += x; a.pos.z += z; },
  };
  e.player = e.makeActor('ct', 'YOU', true); e.player.grounded = true;
  e.all = [e.player]; e.phase = 'active'; e.matchActive = true; e.clock = 10;
  e.freezeTime = e.transitionTime = 60; e.mouseLocked = true;
  return e;
}
function equip(e: any, id: keyof typeof WEAPONS, ammo = 0, reserve = 4) {
  const slot = id === 'knife' ? 'knife' : id === 'he' ? 'grenade' : id === 'c4' ? 'bomb' : (WEAPONS[id] as any).pistol ? 'pistol' : 'primary';
  const w = e.inventoryWeapon(id); w.ammo = ammo; w.reserve = reserve;
  e.player.inventory[slot] = w; e.player.slot = slot; e.player.cooldown = 0;
  e.setGun(false);
  return w;
}
function advance(e: any, seconds: number) {
  // Use the actual update loop's bounded frame time; never jump clock/reload.
  for (let left = seconds; left > 1e-9; left -= .01) e.update(Math.min(.01, left));
}
function until(e: any, condition: () => boolean, seconds = 8) {
  for (let frame = 0; frame < seconds * 100 && !condition(); frame++) e.update(.01);
  expect(condition(), 'condition reached through real engine frames').toBe(true);
}
function tap(e: any) { e.onMouseDown(0); e.update(.01); e.onMouseUp(0); }

describe('player empty-magazine automatic reload', () => {
  it('reloads after the last click without another input, once, with real timing, cues and reserve accounting', () => {
    const e = arena(), w = equip(e, 'deagle', 1, 3), start = vi.spyOn(e, 'beginReload');
    tap(e);
    expect(w.ammo).toBe(0); expect(w.reserve).toBe(3);
    expect(e.player.reload).toBe(0); expect(e.fireHeld).toBe(false); expect(e.shotPressed).toBe(false);
    advance(e, WEAPONS.deagle.rate - .02);
    expect(start).not.toHaveBeenCalled();
    until(e, () => e.player.reload > 0);
    expect(start).toHaveBeenCalledExactlyOnceWith(e.player);
    expect(e.player.reload).toBe(e.player.reloadTotal);
    expect(e.player.reloadTotal).toBeCloseTo(WEAPONS.deagle.reload + .30);
    expect(e.player).toMatchObject({ reloadSlot: 'pistol', reloadEmpty: true, reloadRounds: 3, reloadInserted: 0 });
    expect(w).toMatchObject({ ammo: 0, reserve: 3 });
    expect(e.hud.reloadState).toContain('Releasing grip');
    advance(e, e.player.reloadTotal * .65);
    expect(w).toMatchObject({ ammo: 0, reserve: 3 });
    advance(e, e.player.reloadTotal * .10);
    expect(w).toMatchObject({ ammo: 3, reserve: 0 });
    expect(e.player.reload).toBeGreaterThan(0);
    expect(w.readyAt).toBeGreaterThan(e.clock);
    advance(e, e.player.reload + .05);
    expect(e.player.reload).toBe(0); expect(e.player.reloadSlot).toBeNull();
    expect(w).toMatchObject({ ammo: 3, reserve: 0 });
    expect(e.audio.mechanic.mock.calls).toEqual(reloadCues('deagle', true, 3).map(cue => [cue.sound, 'deagle']));
    advance(e, 1);
    expect(start).toHaveBeenCalledTimes(1); expect(e.audio.shot).toHaveBeenCalledTimes(1);
  });

  it.each(['usp', 'glock', 'g3sg1', 'ak47'] as const)('handles a single last-shot %s click without follow-up fire', id => {
    const e = arena(), w = equip(e, id, 1, 2);
    tap(e); until(e, () => e.player.reload > 0);
    expect(w).toMatchObject({ ammo: 0, reserve: 2 });
    advance(e, e.player.reload + .03);
    expect(w).toMatchObject({ ammo: 2, reserve: 0 });
    expect(e.audio.shot).toHaveBeenCalledTimes(1); expect(e.shotPressed).toBe(false);
  });

  it('never starts or fabricates ammunition when the last shot leaves no reserve', () => {
    const e = arena(), w = equip(e, 'usp', 1, 0), start = vi.spyOn(e, 'beginReload');
    tap(e); advance(e, 5);
    expect(start).not.toHaveBeenCalled(); expect(e.player.reload).toBe(0);
    expect(w).toMatchObject({ ammo: 0, reserve: 0 }); expect(e.audio.mechanic).not.toHaveBeenCalled();
  });

  it('does not top up a partially loaded gun', () => {
    const e = arena(), w = equip(e, 'ak47', 2, 40), start = vi.spyOn(e, 'beginReload');
    tap(e); advance(e, 4);
    expect(w).toMatchObject({ ammo: 1, reserve: 40 }); expect(start).not.toHaveBeenCalled();
  });

  it.each(['ak47', 'awp', 'm3'] as const)('waits for an empty equipped %s deploy to finish', id => {
    const e = arena(), w = e.inventoryWeapon(id), start = vi.spyOn(e, 'beginReload');
    w.ammo = 0; w.reserve = 2; e.player.inventory.primary = w;
    e.switchWeapon('primary');
    const deployAt = e.player.deployAt;
    advance(e, DEPLOY[id].duration - .02);
    expect(e.isDeploying(e.player)).toBe(true); expect(start).not.toHaveBeenCalled();
    until(e, () => e.player.reload > 0);
    expect(e.clock).toBeGreaterThanOrEqual(deployAt + DEPLOY[id].duration);
    expect(start).toHaveBeenCalledExactlyOnceWith(e.player);
    expect(e.isDeploying(e.player)).toBe(false); expect(w).toMatchObject({ ammo: 0, reserve: 2 });
    advance(e, e.player.reload + .03);
    expect(w).toMatchObject({ ammo: 2, reserve: 0 });
  });

  it.each(['awp', 'scout'] as const)('finishes the scoped %s last-shot bolt cycle before reloading, without re-scoping', id => {
    const e = arena(), w = equip(e, id, 1, 2), start = vi.spyOn(e, 'beginReload');
    e.zoom = 2; tap(e);
    expect(e.zoom).toBe(0); expect(w.resumeScope).toBe(2); expect(w.cyclePending).toBe(true);
    advance(e, WEAPONS[id].rate - .02);
    expect(start).not.toHaveBeenCalled(); expect(e.isCycling(w)).toBe(true); expect(w.resumeScope).toBe(2);
    until(e, () => e.player.reload > 0);
    expect(w.cyclePending).toBe(false); expect(w.resumeScope).toBeFalsy(); expect(e.zoom).toBe(0);
    expect(e.audio.mechanic.mock.calls).toEqual(actionCues(id, 'cycle').map(cue => [cue.sound, id]));
    advance(e, e.player.reload + .03);
    expect(w).toMatchObject({ ammo: 2, reserve: 0 }); expect(e.zoom).toBe(0);
    expect(e.audio.shot).toHaveBeenCalledTimes(1); expect(e.shotPressed).toBe(false);
  });

  it('preserves nonempty bolt-action scope restoration and optics until auto reload actually starts', () => {
    const e = arena(), awp = equip(e, 'awp', 2, 5);
    e.zoom = 2; tap(e); advance(e, WEAPONS.awp.rate + .02);
    expect(awp.ammo).toBe(1); expect(e.zoom).toBe(2); expect(e.player.reload).toBe(0);
    const aug = equip(e, 'aug', 1, 4); e.zoom = 1; tap(e);
    expect(aug.ammo).toBe(0); expect(e.zoom).toBe(1);
    advance(e, WEAPONS.aug.rate - .02); expect(e.zoom).toBe(1);
    until(e, () => e.player.reload > 0); expect(e.zoom).toBe(0);
  });

  it('resumes held automatic rifle fire using existing input, only after the reload completes', () => {
    const e = arena(), w = equip(e, 'ak47', 1, 2);
    e.onMouseDown(0); e.update(.01);
    until(e, () => e.player.reload > 0);
    advance(e, e.player.reloadTotal * .8);
    expect(w).toMatchObject({ ammo: 2, reserve: 0 });
    expect(e.player.reload).toBeGreaterThan(0); expect(e.audio.shot).toHaveBeenCalledTimes(1);
    until(e, () => e.audio.shot.mock.calls.length === 2);
    expect(e.player.reload).toBe(0); expect(w.ammo).toBe(1); expect(e.shotPressed).toBe(false);
    e.onMouseUp(0);
    advance(e, 1); expect(e.audio.shot).toHaveBeenCalledTimes(2);
  });

  it('never synthesizes a semi-auto trigger press when the original press is held through reload', () => {
    const e = arena(), w = equip(e, 'deagle', 1, 2);
    e.onMouseDown(0); e.update(.01); until(e, () => e.player.reload > 0);
    advance(e, e.player.reload + 1);
    expect(w).toMatchObject({ ammo: 2, reserve: 0 }); expect(e.fireHeld).toBe(true);
    expect(e.shotPressed).toBe(false); expect(e.audio.shot).toHaveBeenCalledTimes(1);
    e.onMouseUp(0); tap(e);
    expect(w.ammo).toBe(1); expect(e.audio.shot).toHaveBeenCalledTimes(2);
  });

  it('clears an exhausted Glock burst without scheduling extra shots after reload', () => {
    const e = arena(), w = equip(e, 'glock', 1, 3);
    w.burst = true; tap(e);
    expect(w.burstRemaining).toBe(0);
    advance(e, .38); expect(e.player.reload).toBe(0);
    until(e, () => e.player.reload > 0); advance(e, e.player.reload + .1);
    expect(w).toMatchObject({ ammo: 3, reserve: 0, burstRemaining: 0 });
    expect(e.audio.shot).toHaveBeenCalledTimes(1);
  });

  it.each(['m3', 'xm1014'] as const)('protects empty %s shell insertion against held fire and preserves its normal interruption rules', id => {
    const e = arena(), w = equip(e, id, 1, 3), cancel = vi.spyOn(e, 'cancelReload');
    e.onMouseDown(0); e.update(.01); until(e, () => e.player.reload > 0);
    const total = e.player.reloadTotal, firstShell = reloadCues(id, true, 3).find(cue => cue.sound === 'shell')!.at;
    expect(total).toBeCloseTo(.55 + 3 * .42 + .45);
    advance(e, total * (firstShell - .02));
    expect(w).toMatchObject({ ammo: 0, reserve: 3 }); expect(e.player.reload).toBeGreaterThan(0);
    expect(cancel).not.toHaveBeenCalled(); expect(e.audio.shot).toHaveBeenCalledTimes(1);
    // Even a fresh click while empty cannot repeatedly reset shell loading.
    e.onMouseUp(0); e.onMouseDown(0); e.update(.01);
    expect(cancel).not.toHaveBeenCalled();
    if (id === 'xm1014') {
      until(e, () => cancel.mock.calls.length === 1);
      expect(w).toMatchObject({ ammo: 1, reserve: 2 }); expect(e.player.reload).toBe(0);
      expect(e.player.cooldown).toBeCloseTo(.18); expect(e.audio.shot).toHaveBeenCalledTimes(1);
      until(e, () => e.audio.shot.mock.calls.length === 4, 12);
      e.onMouseUp(0); advance(e, 2);
      expect(w).toMatchObject({ ammo: 0, reserve: 0 }); expect(e.player.reload).toBe(0);
      expect(e.audio.mechanic.mock.calls.filter(([sound]: string[]) => sound === 'shell')).toHaveLength(3);
    } else {
      advance(e, e.player.reload + .02);
      expect(w).toMatchObject({ ammo: 3, reserve: 0 }); expect(e.player.reload).toBe(0);
      expect(e.audio.shot).toHaveBeenCalledTimes(1); // Nova is not automatic.
      expect(e.audio.mechanic.mock.calls.filter(([sound]: string[]) => sound === 'shell')).toHaveLength(3);
      e.onMouseUp(0); tap(e); expect(w.ammo).toBe(2);
    }
  });

  it.each(['active', 'freeze', 'round-end'])('allows normal auto reload during %s', phase => {
    const e = arena(), w = equip(e, 'usp', 0, 1); e.phase = phase;
    e.update(.01); expect(e.player.reload).toBeGreaterThan(0);
    advance(e, e.player.reload + .03); expect(w).toMatchObject({ ammo: 1, reserve: 0 });
  });

  it.each(['menu', 'paused', 'match-end', 'spectate'])('does not start auto reload during %s', phase => {
    const e = arena(), w = equip(e, 'usp'), start = vi.spyOn(e, 'beginReload'); e.phase = phase;
    advance(e, 1);
    expect(start).not.toHaveBeenCalled(); expect(w).toMatchObject({ ammo: 0, reserve: 4 });
  });

  it.each(['dead', 'no match', 'disposed'])('does not start auto reload when %s', state => {
    const e = arena(), w = equip(e, 'usp'), start = vi.spyOn(e, 'beginReload');
    if (state === 'dead') e.player.alive = false;
    if (state === 'no match') e.matchActive = false;
    if (state === 'disposed') e.dispose();
    advance(e, 1);
    expect(start).not.toHaveBeenCalled(); expect(w).toMatchObject({ ammo: 0, reserve: 4 });
  });

  it.each(['buy', 'map', 'settings', 'pause'])('defers a last-shot reload across %s until gameplay resumes', overlay => {
    const e = arena(), w = equip(e, 'usp', 1, 4), start = vi.spyOn(e, 'beginReload');
    tap(e);
    if (overlay === 'buy') {
      e.world.theme = 'desert';
      e.world.buyZones = [{ team: 'ct', box: new T.Box3(new T.Vector3(-10, -10, -10), new T.Vector3(10, 10, 10)) }];
      e.toggleBuy();
    } else if (overlay === 'map') e.toggleMap();
    else if (overlay === 'settings') e.openSettings();
    else e.pauseGame(); // Also the existing shell-modal adapter path.
    const clock = e.clock;
    advance(e, 2);
    expect(start).not.toHaveBeenCalled(); expect(w).toMatchObject({ ammo: 0, reserve: 4 });
    expect(e.player.reload).toBe(0); expect(e.shotPressed).toBe(false);
    if (overlay === 'settings' || overlay === 'pause') expect(e.clock).toBe(clock);
    if (overlay === 'buy') e.closeBuy(false);
    else if (overlay === 'map') e.closeMap(false);
    else if (overlay === 'settings') e.closeSettings(false);
    else e.resumeGame(false);
    until(e, () => e.player.reload > 0); expect(start).toHaveBeenCalledExactlyOnceWith(e.player);
  });

  it('freezes an in-progress reload during manual/shell pause without restarting or duplicating ammunition', () => {
    const e = arena(), w = equip(e, 'usp', 0, 4), start = vi.spyOn(e, 'beginReload');
    e.update(.01); advance(e, .4); e.pauseGame();
    const clock = e.clock, remaining = e.player.reload;
    e.openSettings(); e.closeSettings(false); advance(e, 5);
    expect(e.phase).toBe('paused'); expect(e.clock).toBe(clock); expect(e.player.reload).toBe(remaining);
    expect(w).toMatchObject({ ammo: 0, reserve: 4 });
    e.resumeGame(false); advance(e, remaining + .03);
    expect(w).toMatchObject({ ammo: 4, reserve: 0 }); expect(start).toHaveBeenCalledTimes(1);
  });

  it.each(['knife', 'he', 'c4'] as const)('never reloads %s, even with synthetic reserve ammunition', id => {
    const e = arena(), w = equip(e, id, 0, 4), start = vi.spyOn(e, 'beginReload');
    if (id === 'he') e.player.grenades = 1;
    advance(e, 2);
    expect(start).not.toHaveBeenCalled(); expect(w).toMatchObject({ ammo: 0, reserve: 4 });
  });

  it('does not reload the stowed last-shot weapon or its replacement before their deploy finishes', () => {
    const e = arena(), old = equip(e, 'awp', 1, 3), start = vi.spyOn(e, 'beginReload');
    e.zoom = 2; tap(e); e.switchWeapon('pistol'); advance(e, 2);
    expect(start).not.toHaveBeenCalled(); expect(old).toMatchObject({ ammo: 0, reserve: 3, resumeScope: 0 });
    expect(e.player.inventory.pistol.ammo).toBe(WEAPONS.usp.mag); expect(e.zoom).toBe(0);
    e.switchWeapon('primary'); advance(e, DEPLOY.awp.duration - .02);
    expect(start).not.toHaveBeenCalled(); until(e, () => e.player.reload > 0);
    expect(start).toHaveBeenCalledExactlyOnceWith(e.player);
  });

  it('honors replacement weapon identity in the same slot instead of remembering an old empty gun', () => {
    const e = arena(), old = equip(e, 'ak47', 1, 3), start = vi.spyOn(e, 'beginReload');
    tap(e);
    const replacement = e.inventoryWeapon('ak47');
    e.player.inventory.primary = replacement; e.setGun(); advance(e, 2);
    expect(start).not.toHaveBeenCalled(); expect(old).toMatchObject({ ammo: 0, reserve: 3 });
    expect(replacement).toMatchObject({ ammo: WEAPONS.ak47.mag, reserve: WEAPONS.ak47.reserve });
  });

  it.each([false, true])('preserves switching cancellation after ammunition insertion=%s', inserted => {
    const e = arena(), w = equip(e, 'ak47', 0, 3), start = vi.spyOn(e, 'beginReload');
    e.update(.01); advance(e, e.player.reloadTotal * (inserted ? .75 : .2));
    e.switchWeapon('pistol'); advance(e, 4);
    expect(e.player.reload).toBe(0); expect(start).toHaveBeenCalledTimes(1);
    expect(w).toMatchObject(inserted ? { ammo: 3, reserve: 0 } : { ammo: 0, reserve: 3 });
    expect(e.player.inventory.pistol.ammo).toBe(WEAPONS.usp.mag);
  });

  it('preserves manual R top-up and does not restart a manual empty reload', () => {
    const e = arena(), w = equip(e, 'usp', 4, 2), start = vi.spyOn(e, 'beginReload');
    e.onKeyDown({ code: 'KeyR', repeat: false });
    expect(e.player.reloadTotal).toBe(WEAPONS.usp.reload);
    advance(e, e.player.reload + .03);
    expect(w).toMatchObject({ ammo: 6, reserve: 0 }); expect(start).toHaveBeenCalledTimes(1);
    w.ammo = 0; w.reserve = 2; e.reload(); const total = e.player.reload;
    advance(e, total + .03);
    expect(w).toMatchObject({ ammo: 2, reserve: 0 }); expect(start).toHaveBeenCalledTimes(2);
  });

  it('does not add automatic reload behavior to bots', () => {
    const e = arena(), b = e.makeActor('t', 'BOT'), w = e.weaponOf(b), start = vi.spyOn(e, 'beginReload');
    w.ammo = 0; w.reserve = 4;
    e.updateWeapon(b, 1);
    expect(start).not.toHaveBeenCalled(); expect(b.reload).toBe(0); expect(w).toMatchObject({ ammo: 0, reserve: 4 });
  });
});
