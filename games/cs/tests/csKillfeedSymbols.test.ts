import * as T from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CsEngine } from '../src/csEngine.js';
import { WEAPONS } from '../src/csWeapons.js';

// Real engine, actors, damage and equipment paths; no init, GPU, network or DOM.
const engines: any[] = [];
beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value) });
});
afterEach(() => {
  for (const e of engines.splice(0)) e.dispose();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});
function arena(zh = false) {
  const e: any = new CsEngine({ isZh: () => zh });
  engines.push(e);
  e.player = e.makeActor('ct', 'YOU', true);
  e.all = [e.player]; e.phase = 'active'; e.mode = 'tdm'; e.clock = 10;
  e.world = {
    theme: 'snow', spawns: { ct: [{ pos: new T.Vector3() }], t: [{ pos: new T.Vector3(20, 0, 0) }] },
    raycast: () => null, lineClear: () => true, ground: () => 0,
  };
  return e;
}
function victim(e: any, team = 't') {
  const target = e.makeActor(team, 'TARGET');
  target.armor = 0; target.pos.set(0, 0, -2); e.all.push(target);
  return target;
}
const knives = [
  ['classic', 'Classic knife', '经典匕首'],
  ['karambit', 'Karambit', '爪刀'],
  ['butterfly', 'Butterfly knife', '蝴蝶刀'],
] as const;

function finishWithKnife(e: any, attacker = e.player, target = victim(e)) {
  // Two real slashes preserve the ordinary 40-damage mechanics and emit no
  // event. The final hit traverses damageActor -> addKill without mocking it.
  for (let i = 0; i < 2; i++) expect(e.damageActor(target, WEAPONS.knife.damage, attacker, 'knife')).toBe(true);
  expect(target.health).toBe(20); expect(target.alive).toBe(true);
  expect(e.hud.killfeed).toHaveLength(0);
  expect(e.damageActor(target, WEAPONS.knife.damage, attacker, 'knife')).toBe(true);
  expect(target.alive).toBe(false); expect(target.health).toBe(0); expect(target.deaths).toBe(1);
  expect(attacker.kills).toBe(1); expect(attacker.headshots).toBe(0); expect(attacker.damageDealt).toBe(100);
  expect(e.scores[attacker.team]).toBe(1); expect(e.hud.killfeed).toHaveLength(1);
  return e.hud.killfeed[0];
}

describe('CS event-owned killfeed identity', () => {
  for (const [model, en, zh] of knives) for (const chinese of [false, true]) {
    it(`${model} ${chinese ? 'ZH' : 'EN'}: historical knife survives real settings/equipment/language changes`, () => {
      const e = arena(chinese); e.setKnifeModel(model); e.switchWeapon('knife');
      expect(e.gun.userData.rig.knifeModel).toBe(model);
      const event = finishWithKnife(e);
      expect(event).toEqual({ aName: 'YOU', aTeam: 'ct', aMe: true, bName: 'TARGET', bTeam: 't',
        weaponId: 'knife', weaponIconId: `knife-${model}`, weapon: chinese ? zh : en, head: false, time: 10 });
      const historical = structuredClone(event);
      e.setKnifeModel(model === 'butterfly' ? 'karambit' : 'butterfly');
      expect(e.gun.userData.rig.knifeModel).not.toBe(model);
      e.switchWeapon('pistol'); e.isZh = () => !chinese; e.computeHud();
      expect(e.weaponOf(e.player).id).toBe('usp'); expect(e.gunId).toBe('usp');
      expect(e.hud.weaponName).toBe('USP-S');
      e.player.name = 'RENAMED'; e.player.team = 't';
      expect(e.hud.killfeed[0]).toEqual(historical);
      expect(e.damageActor(e.all[1], 100, e.player, 'knife')).toBe(false);
      expect(e.hud.killfeed).toHaveLength(1);
    });
  }

  for (const model of ['unknown', '__proto__', 'constructor', '', undefined, null]) {
    it(`normalizes malformed knife model ${String(model)} to classic in both identity and name`, () => {
      const e = arena(); e.controlSettings.knifeModel = model;
      e.addKill(e.player, { name: 'TARGET', team: 't' }, 'knife', false);
      expect(e.hud.killfeed[0]).toMatchObject({ weaponId: 'knife', weaponIconId: 'knife-classic', weapon: 'Classic knife' });
    });
  }

  for (const [model] of knives) {
    it(`bot knife remains classic while player's selected appearance is ${model}`, () => {
      const e = arena(); e.setKnifeModel(model);
      const bot = e.makeActor('t', 'BOT'), target = victim(e, 'ct'); e.all.push(bot); e.spectating = bot;
      const event = finishWithKnife(e, bot, target), historical = structuredClone(event);
      expect(event).toMatchObject({ aName: 'BOT', aTeam: 't', aMe: false,
        weaponId: 'knife', weaponIconId: 'knife-classic', weapon: 'Classic knife' });
      e.setKnifeModel('butterfly'); e.switchWeapon('knife'); e.spectating = null;
      expect(event).toEqual(historical);
    });
  }

  it('keeps every firearm raw ID, visible name and headshot flag, without inspecting current equipment', () => {
    const e = arena(); e.setKnifeModel('karambit'); e.switchWeapon('knife');
    const target = { name: 'TARGET', team: 't' };
    const firearms = Object.entries(WEAPONS).filter(([, w]) => !('utility' in w && w.utility) && w.mag > 0);
    expect(firearms).toHaveLength(17);
    const recorded: any[] = [];
    for (const [id, weapon] of firearms) {
      e.addKill(e.player, target, id, true); const event = e.hud.killfeed.at(-1); recorded.push(event);
      expect(event).toMatchObject({ weaponId: id, weaponIconId: id, weapon: weapon.name, head: true });
    }
    const historical = structuredClone(recorded);
    e.switchWeapon('pistol'); e.isZh = () => true; e.computeHud();
    expect(recorded).toEqual(historical);
    expect(e.hud.killfeed).toEqual(recorded.slice(-6));
  });

  it('retains the firearm source for a real headshot after switching to a knife', () => {
    const e = arena(), target = victim(e);
    expect(e.damageActor(target, 120, e.player, 'usp', true)).toBe(true);
    const event = e.hud.killfeed[0], historical = structuredClone(event);
    expect(event).toMatchObject({ weaponId: 'usp', weaponIconId: 'usp', weapon: 'USP-S', head: true });
    expect(e.player.headshots).toBe(1); expect(e.player.kills).toBe(1);
    e.setKnifeModel('butterfly'); e.switchWeapon('knife');
    expect(event).toEqual(historical);
  });

  it('HE detonation retains the grenade owner and source after throwing then switching to a pistol', () => {
    const e = arena(), target = victim(e);
    e.player.inventory.grenade = e.inventoryWeapon('he'); e.player.grenades = 1;
    e.switchWeapon('grenade'); e.clock += 2; e.player.cooldown = 0;
    e.throwGrenade(); expect(e.grenades).toHaveLength(1);
    expect(e.grenades[0].owner).toBe(e.player);
    e.switchWeapon('pistol'); expect(e.gunId).toBe('usp');
    // Deterministic impact position/fuse, but actual grenade source and damage.
    e.grenades[0].pos.copy(e.eyeOf(target)); e.grenades[0].fuse = 0;
    e.updateGrenades(0);
    expect(e.grenades).toHaveLength(0); expect(target.alive).toBe(false);
    expect(e.hud.killfeed).toHaveLength(1);
    expect(e.hud.killfeed[0]).toMatchObject({ aName: 'YOU', aMe: true, weaponId: 'he',
      weaponIconId: 'he', weapon: 'HE Grenade', head: false });
    expect(e.player.kills).toBe(1); expect(e.player.grenades).toBe(0);
    const historical = structuredClone(e.hud.killfeed[0]);
    e.setKnifeModel('karambit'); e.switchWeapon('knife');
    expect(e.hud.killfeed[0]).toEqual(historical);
  });

  it('C4 explosion uses the actual synthetic C4 damage source with no inventory or player appearance', () => {
    const e = arena(), target = victim(e);
    e.setKnifeModel('butterfly'); e.switchWeapon('knife'); e.player.pos.set(40, 0, 0);
    e.mode = 'defusal'; e.phase = 'round-end';
    e.bomb = { pos: new T.Vector3() };
    const damage = vi.spyOn(e, 'damageActor');
    e.handleBombEvents([{ type: 'exploded' }]);
    expect(target.alive).toBe(false); expect(e.player.alive).toBe(true);
    expect(e.hud.killfeed).toHaveLength(1);
    expect(e.hud.killfeed[0]).toMatchObject({ aName: 'C4', aTeam: 'ct', aMe: undefined,
      weaponId: 'c4', weaponIconId: 'c4', weapon: 'C4 Explosive', head: false });
    const source = damage.mock.calls[0][2] as any;
    expect(source.name).toBe('C4'); expect(source).not.toHaveProperty('isPlayer');
    expect(source).not.toHaveProperty('inventory'); expect(damage.mock.calls[0][3]).toBe('c4');
    expect(e.player.kills).toBe(0); expect(e.player.money).toBe(800);
    const historical = structuredClone(e.hud.killfeed[0]);
    e.bomb = null; e.setKnifeModel('classic'); e.switchWeapon('pistol');
    expect(e.hud.killfeed[0]).toEqual(historical);
  });

  it('leaves unknown event IDs and readable labels intact instead of assigning a fake profile', () => {
    const e = arena();
    e.addKill(e.player, { name: 'TARGET', team: 't' }, 'future-weapon', false);
    expect(e.hud.killfeed[0]).toMatchObject({ weaponId: 'future-weapon', weaponIconId: 'future-weapon',
      weapon: 'future-weapon', head: false });
  });
});
