import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as T from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CsEngine } from '../src/csEngine.js';
import { MAPS } from '../src/csMaps.js';
import { BOMB_RULES } from '../src/csBombMode.js';
import { chooseRespawn, shuffledTeamSpawns } from '../src/csTactics.js';
import { SnowWorld } from '../src/csWorld.js';
import { WEAPONS } from '../src/csWeapons.js';

const teams = ['ct', 't'] as const;
const spawnAt = (x: number, y = 0, z = 0) => ({ pos: new T.Vector3(x, y, z), yaw: 0 });
const actorAt = (team = 'ct', x = 0, y = .04, z = 0) => ({ team, pos: new T.Vector3(x, y, z), alive: true, crouching: false });
const poolSnapshot = (world: any) => teams.map(team => world.spawns[team].map((s: any) => ({ pos: s.pos.toArray(), yaw: s.yaw })));
function sequence(values: number[]) {
  let i = 0;
  return vi.fn(() => {
    if (i === values.length) throw new Error('Unexpected RNG draw');
    return values[i++];
  });
}
function flatWorld(ct = [spawnAt(0), spawnAt(3), spawnAt(6)], t = [spawnAt(100)]) {
  return {
    spawns: { ct, t }, theme: 'snow', size: 100, center: new T.Vector3(), nodes: [],
    canStand: vi.fn(() => true), supportHeight: vi.fn(() => 0), lineClear: vi.fn(() => false),
    ground: () => 0, raycast: () => null, path: () => [], update: vi.fn(),
    pickups: [], bombSites: [], buyZones: [], dispose: vi.fn(),
  };
}
const engines: any[] = [];
function engine(world: any) {
  // No init/render call: real engine, Three geometry and spawning, without a GPU,
  // DOM, network loaders, routes or an artificial replacement spawn method.
  const e: any = new CsEngine({ isZh: () => false });
  e.world = world; e.ready = true;
  vi.spyOn(e.audio, 'init').mockImplementation(() => {});
  engines.push(e);
  return e;
}
afterEach(() => {
  for (const e of engines.splice(0)) e.dispose();
  vi.restoreAllMocks();
});
function asset(path: string) {
  const bytes = readFileSync(join(process.cwd(), 'games/cs/public', path));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
function realWorld(id: keyof typeof MAPS) {
  const meta = MAPS[id], world = new SnowWorld(new T.Scene(), meta);
  for (const wad of 'wads' in meta ? meta.wads : []) world.parseWAD(asset(wad));
  world.parseBSP(asset(meta.asset));
  return world;
}

describe('independent team spawn shuffles', () => {
  it('uses every Fisher–Yates choice, independently per team, without mutating the source', () => {
    const world = flatWorld([spawnAt(0), spawnAt(3), spawnAt(6)], [spawnAt(20), spawnAt(23), spawnAt(26)]);
    const before = poolSnapshot(world);
    Object.freeze(world.spawns.ct); Object.freeze(world.spawns.t);
    const random = sequence([0, 0, .999, .999]);
    const result = shuffledTeamSpawns(world, random);
    expect(result.ct).toEqual([world.spawns.ct[1], world.spawns.ct[2], world.spawns.ct[0]]);
    expect(result.t).toEqual(world.spawns.t);
    expect(result.ct).not.toBe(world.spawns.ct); expect(result.t).not.toBe(world.spawns.t);
    expect(random).toHaveBeenCalledTimes(4);
    expect(poolSnapshot(world)).toEqual(before);
  });

  it('enumerates all six three-slot permutations exactly once, rather than using a random sort', () => {
    const world = flatWorld([spawnAt(0), spawnAt(3), spawnAt(6)]);
    const permutations = new Set<string>();
    for (let last = 0; last < 3; last++) for (let second = 0; second < 2; second++) {
      const random = sequence([(last + .5) / 3, (second + .5) / 2]);
      const pool = shuffledTeamSpawns(world, random).ct;
      expect(new Set(pool).size).toBe(3);
      expect(random).toHaveBeenCalledTimes(2);
      permutations.add(pool.map(s => s.pos.x).join(','));
    }
    expect(permutations.size).toBe(6);
  });
});

describe('safe randomized TDM respawn choices', () => {
  it('lets every equal-score slot be selected with an injected RNG, without mutating actors or pools', () => {
    const world = flatWorld(), actor = actorAt(), before = poolSnapshot(world), pos = actor.pos.clone();
    actor.alive = false;
    for (let i = 0; i < world.spawns.ct.length; i++) {
      expect(chooseRespawn(world, actor, [actor], () => (i + .5) / world.spawns.ct.length)).toBe(world.spawns.ct[i]);
    }
    expect(actor.pos).toEqual(pos); expect(actor.alive).toBe(false); expect(poolSnapshot(world)).toEqual(before);
  });

  it('randomizes similarly safe scores but excludes substantially closer or exposed enemy camps', () => {
    const world = flatWorld([spawnAt(20), spawnAt(26), spawnAt(28)]), actor = actorAt(), enemy = actorAt('t');
    expect(chooseRespawn(world, actor, [enemy], () => 0)).toBe(world.spawns.ct[1]);
    expect(chooseRespawn(world, actor, [enemy], () => .999)).toBe(world.spawns.ct[2]);
    world.lineClear.mockReturnValue(true);
    // With line of sight, the 2m difference incurs another 4 points of exposure;
    // only the farthest slot remains within the original risk score's top band.
    for (const r of [0, .25, .5, .999]) expect(chooseRespawn(world, actor, [enemy], () => r)).toBe(world.spawns.ct[2]);
  });

  it('retains the crowding penalty even outside physical overlap distance', () => {
    const world = flatWorld([spawnAt(0), spawnAt(10)]), actor = actorAt(), friend = actorAt('ct', 1);
    for (const r of [0, .5, .999]) expect(chooseRespawn(world, actor, [friend], () => r)).toBe(world.spawns.ct[1]);
  });

  it.each(teams)('excludes occupied positions for living %s actors, not corpses or the respawning actor', team => {
    const world = flatWorld([spawnAt(0)]), actor = actorAt(), blocker = actorAt(team, .79);
    expect(chooseRespawn(world, actor, [actor, blocker], () => 0)).toBeNull();
    blocker.alive = false;
    expect(chooseRespawn(world, actor, [actor, blocker], () => 0)).toBe(world.spawns.ct[0]);
    blocker.alive = true; blocker.pos.x = .81;
    expect(chooseRespawn(world, actor, [blocker], () => 0)).toBe(world.spawns.ct[0]);
  });

  it('checks vertical body overlap, allowing a separate floor but not a partially intersecting body', () => {
    const world = flatWorld([spawnAt(0)]), actor = actorAt(), blocker = actorAt('ct', 0, 1.7);
    expect(chooseRespawn(world, actor, [blocker], () => 0)).toBeNull();
    blocker.pos.y = 2;
    expect(chooseRespawn(world, actor, [blocker], () => 0)).toBe(world.spawns.ct[0]);
    blocker.pos.y = -1; blocker.crouching = true;
    expect(chooseRespawn(world, actor, [blocker], () => 0)).toBe(world.spawns.ct[0]);
    blocker.crouching = false;
    expect(chooseRespawn(world, actor, [blocker], () => 0)).toBeNull();
  });

  it('rejects blocked standing hulls and unsupported locations; never falls back to the first invalid slot', () => {
    const world = flatWorld(), actor = actorAt(), random = vi.fn(() => 0);
    world.canStand.mockImplementation((x: number) => x !== 0);
    world.supportHeight.mockImplementation((x: number) => x === 3 ? null : 0);
    expect(chooseRespawn(world, actor, [], random)).toBe(world.spawns.ct[2]);
    expect(world.canStand).toHaveBeenCalledWith(0, .04, 0, false);
    expect(world.supportHeight).toHaveBeenCalledWith(3, .04, 0, .1, false);
    random.mockClear(); world.supportHeight.mockReturnValue(null);
    expect(chooseRespawn(world, actor, [], random)).toBeNull();
    expect(random).not.toHaveBeenCalled();
    world.spawns.ct = [];
    expect(chooseRespawn(world, actor, [], random)).toBeNull();
  });
});

describe('real authored Snow and Dust spawn pools (CPU only)', () => {
  for (const id of ['fy_snow', 'de_dust2'] as const) {
    for (const team of teams) {
      it(`${id} ${team}: every authored slot is reachable by the RNG, supported, distinct and reserved once`, () => {
        const world = realWorld(id), actor = actorAt(team), before = poolSnapshot(world);
        try {
          const pool = world.spawns[team], reserved: ReturnType<typeof actorAt>[] = [];
          expect(pool).toHaveLength(id === 'fy_snow' ? 16 : 20);
          for (let i = 0; i < pool.length; i++) {
            expect(chooseRespawn(world, actor, [], () => (i + .5) / pool.length)).toBe(pool[i]);
            const spawn = chooseRespawn(world, actor, reserved, () => 0);
            expect(spawn).not.toBeNull();
            const { x, y, z } = spawn.pos;
            expect(world.canStand(x, y + .04, z, false)).toBe(true);
            expect(world.supportHeight(x, y + .04, z, .1, false)).not.toBeNull();
            expect(world.spawns[team === 'ct' ? 't' : 'ct']).not.toContain(spawn);
            for (const other of reserved) expect(Math.hypot(x - other.pos.x, z - other.pos.z)).toBeGreaterThanOrEqual(.8);
            reserved.push(actorAt(team, x, y + .04, z));
          }
          expect(chooseRespawn(world, actor, reserved, () => 0)).toBeNull();
          expect(poolSnapshot(world)).toEqual(before);
        } finally { world.dispose(); }
      });
    }

    for (const mode of MAPS[id].modes) for (const selectedTeam of teams) {
      it(`${id} ${mode}, player ${selectedTeam}: new match and next round independently reassign both squads`, () => {
        const random = vi.spyOn(Math, 'random').mockReturnValue(.999);
        const world = realWorld(id), before = poolSnapshot(world), e = engine(world);
        e.selectedMap = id; e.selectedMode = mode; e.selectedTeam = selectedTeam;
        const verify = (r: number) => {
          const expected = shuffledTeamSpawns(world, () => r);
          for (const team of teams) {
            const squad = e.all.filter((a: any) => a.team === team);
            expect(squad).toHaveLength(5);
            expect(new Set(squad.map((a: any) => a.pos.toArray().join(','))).size).toBe(5);
            squad.forEach((a: any, i: number) => {
              expect(a.pos).toEqual(expected[team][i].pos.clone().add(new T.Vector3(0, .04, 0)));
              expect(world.canStand(a.pos.x, a.pos.y, a.pos.z, false)).toBe(true);
              expect(a).toMatchObject({ alive: true, spawnShield: 0, respawnAt: 0 });
            });
          }
          expect(e.phase).toBe('freeze'); expect(e.freezeTime).toBe(4);
          expect(e.roundTime).toBe(mode === 'defusal' ? BOMB_RULES.roundTime : 105);
          expect(poolSnapshot(world)).toEqual(before);
        };
        e.startMatch(); verify(.999);
        const first = e.all.map((a: any) => a.pos.clone());
        const player = e.player;
        player.money = 4321; player.kills = 3; player.deaths = 2;
        player.inventory.primary = e.inventoryWeapon('awp'); player.inventory.primary.ammo = 3;
        player.armor = 37; player.helmet = true; player.defuseKit = selectedTeam === 'ct'; player.grenades = 1;
        player.inventory.grenade = e.inventoryWeapon('he');
        const inventory = player.inventory;
        random.mockReturnValue(0); e.nextRound(); verify(0);
        e.all.forEach((a: any, i: number) => expect(a.pos).not.toEqual(first[i]));
        expect(player).toMatchObject({ money: 4321, kills: 3, deaths: 2, spawnCount: 2 });
        if (mode === 'defusal') {
          expect(player.inventory).toBe(inventory);
          expect(player.inventory.primary).toMatchObject({ id: 'awp', ammo: 3 });
          expect(player).toMatchObject({ armor: 37, helmet: true, defuseKit: selectedTeam === 'ct', grenades: 1 });
          expect(e.bomb.status).toBe('carried'); expect(e.bomb.carrier.team).toBe('t');
        }
        random.mockReturnValue(.5); e.startMatch(); verify(.5);
        expect(e.round).toBe(1); expect(e.player).not.toBe(player);
        expect(e.player).toMatchObject({ money: 800, kills: 0, deaths: 0, spawnCount: 1 });
        expect(e.scores).toEqual({ ct: 0, t: 0 }); expect(e.matchElapsed).toBe(0);
      });
    }
  }
});

function respawnArena() {
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const e = engine(flatWorld([spawnAt(0), spawnAt(3)]));
  e.mode = 'tdm'; e.phase = 'active'; e.matchActive = true; e.clock = 10; e.matchElapsed = 40;
  e.player = e.makeActor('ct', 'YOU', true);
  const bot = e.makeActor('ct', 'ALLY'), enemy = e.makeActor('t', 'ENEMY');
  enemy.pos.set(100, .04, 0);
  e.bots = [bot, enemy]; e.all = [e.player, bot, enemy];
  return { e, bot, enemy };
}

describe('engine respawn scheduling and reservations', () => {
  it('reserves simultaneous player/bot spawns sequentially, preserving death delay, pause, money, loadout and protection', () => {
    const { e, bot, enemy } = respawnArena(), player = e.player;
    e.selectedPistol = 'deagle';
    for (const [actor, id] of [[player, 'awp'], [bot, 'm4a1']]) {
      actor.inventory.primary = e.inventoryWeapon(id); actor.inventory.primary.ammo = 1; actor.slot = 'primary';
      actor.money = 5432; actor.kills = 4;
      expect(e.damageActor(actor, 1000, enemy, 'ak47')).toBe(true);
      expect(actor).toMatchObject({ alive: false, health: 0, deaths: 1, deathTime: 10, respawnAt: 13, respawnWeapon: id });
    }
    expect(e.scores).toEqual({ ct: 0, t: 2 });
    // Keep real clock/phase/spawning logic; movement and combat are unrelated to
    // a frozen stationary respawn fixture and must not move our reservations.
    for (const method of ['updateAI', 'updatePlayer', 'updateSpectator', 'updateGrenades', 'updateRagdolls']) vi.spyOn(e, method).mockImplementation(() => {});
    e.pauseGame();
    for (let i = 0; i < 100; i++) e.update(.04);
    expect(e.clock).toBe(10); expect(e.matchElapsed).toBe(40);
    expect(player.alive).toBe(false); expect(bot.alive).toBe(false);
    e.resumeGame(false);
    for (let i = 0; i < 74; i++) e.update(.04);
    expect(e.clock).toBeCloseTo(12.96); expect(player.alive).toBe(false); expect(bot.alive).toBe(false);
    e.update(.03); expect(player.alive).toBe(false);
    e.update(.02);
    expect(player.pos).toEqual(new T.Vector3(0, .04, 0)); expect(bot.pos).toEqual(new T.Vector3(3, .04, 0));
    for (const [actor, id] of [[player, 'awp'], [bot, 'm4a1']]) {
      expect(actor).toMatchObject({ alive: true, health: 100, armor: 100, helmet: true, grenades: 1, defuseKit: false,
        money: 5432, kills: 4, deaths: 1, deathTime: 0, respawnAt: 0, spawnCount: 1, slot: 'primary' });
      expect(actor.inventory.primary).toMatchObject({ id, ammo: (WEAPONS as any)[id].mag, reserve: (WEAPONS as any)[id].reserve });
      expect(actor.inventory.grenade.id).toBe('he'); expect(actor.inventory.knife.id).toBe('knife');
      expect(actor.spawnShield).toBeCloseTo(e.clock + 1.2);
      expect(e.damageActor(actor, 5, enemy, 'ak47')).toBe(false);
    }
    expect(player.inventory.pistol.id).toBe('deagle'); expect(bot.inventory.pistol.id).toBe('usp');
    expect(e.corpses).toHaveLength(1); // The human death mesh is retained, not lost on respawn.
    expect(e.scores).toEqual({ ct: 0, t: 2 }); expect(e.matchElapsed).toBeCloseTo(43.01);
    e.clock = player.spawnShield;
    expect(e.damageActor(player, 5, enemy, 'ak47')).toBe(true);
  });

  it('defers excess due respawns unchanged until a reserved slot opens, instead of overlapping actors', () => {
    const { e, bot, enemy } = respawnArena();
    const waiting = e.makeActor('ct', 'WAITING'); e.bots.push(waiting); e.all.push(waiting);
    for (const a of [e.player, bot, waiting]) { a.alive = false; a.health = 0; a.respawnAt = 10; a.deathTime = 7; a.deaths = 2; }
    const inventory = waiting.inventory, position = waiting.pos.clone(), updateAlive = vi.spyOn(e, 'updateAlive');
    e.updateRespawns();
    expect(e.player.alive).toBe(true); expect(bot.alive).toBe(true); expect(enemy.alive).toBe(true);
    expect(waiting).toMatchObject({ alive: false, health: 0, respawnAt: 10, deathTime: 7, deaths: 2, spawnCount: 0, spawnShield: 0, money: 800 });
    expect(waiting.inventory).toBe(inventory); expect(waiting.pos).toEqual(position);
    expect(updateAlive).toHaveBeenCalledTimes(1);
    e.updateRespawns(); expect(waiting.alive).toBe(false); expect(updateAlive).toHaveBeenCalledTimes(1);
    e.player.pos.set(20, .04, 0); e.updateRespawns();
    expect(waiting.alive).toBe(true); expect(waiting.pos).toEqual(new T.Vector3(0, .04, 0));
    expect(waiting.inventory.primary.id).toBe('m4a1'); expect(waiting.spawnShield).toBeCloseTo(11.2);
    expect(updateAlive).toHaveBeenCalledTimes(2); expect(e.clock).toBe(10);
  });

  it('uses the real human crouch posture when checking a lower-floor blocker', () => {
    const { e, bot } = respawnArena();
    e.world.spawns.ct = [spawnAt(0)];
    e.player.pos.set(0, -1, 0); e.player.crouching = false;
    bot.alive = false; bot.respawnAt = 10;
    e.crouching = false; e.updateRespawns();
    expect(bot.alive).toBe(false);
    e.crouching = true; e.updateRespawns();
    expect(bot.alive).toBe(true);
    expect(bot.pos).toEqual(new T.Vector3(0, .04, 0));
  });

  it('reports safe-slot waiting honestly in both death and teammate spectator HUDs', () => {
    const { e, bot } = respawnArena();
    e.player.alive = false; e.player.respawnAt = 13;
    e.clock = 11.2; e.autoSpectateDelay = 1;
    e.updateSpectator(0);
    expect(e.hud.center.title).toBe('2s to respawn');
    e.clock = 14;
    e.updateSpectator(0);
    expect(e.hud.center.title).toBe('Waiting for a safe spawn');
    e.autoSpectateDelay = 0; e.spectating = bot;
    e.updateSpectator(0);
    expect(e.hud.center.title).toBe('Waiting for a safe spawn');
  });

  it('does not respawn in another mode, a non-active phase, before the deadline, or at invalid locations', () => {
    const { e } = respawnArena(), player = e.player;
    player.alive = false; player.respawnAt = 10;
    const spawn = vi.spyOn(e, 'spawnActor');
    for (const mode of ['elimination', 'defusal']) { e.mode = mode; e.updateRespawns(); }
    e.mode = 'tdm';
    for (const phase of ['paused', 'freeze', 'round-end', 'match-end', 'menu']) { e.phase = phase; e.updateRespawns(); }
    e.phase = 'active'; e.clock = 9.99; e.updateRespawns();
    e.clock = 10; e.world.canStand.mockReturnValue(false); e.updateRespawns();
    expect(spawn).not.toHaveBeenCalled(); expect(player.alive).toBe(false); expect(player.respawnAt).toBe(10);
    e.world.canStand.mockReturnValue(true); e.world.supportHeight.mockReturnValue(null); e.updateRespawns();
    expect(spawn).not.toHaveBeenCalled(); expect(player.respawnAt).toBe(10);
  });
});
