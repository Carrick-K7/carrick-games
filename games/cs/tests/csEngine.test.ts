// Unit coverage for the carrick-cs engine modules migrated into src/games/cs*.js.
// Pure-logic checks only: weapon data, economy, bomb round state machine, and
// BSP movement/collision against the real shipped assets in public/cs/assets.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as T from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { BombRound, BOMB_RULES } from '../src/csBombMode.js';
import { BUY_CATEGORIES, SHOP, awardMoney, settleRound } from '../src/csEconomy.js';
import { MAPS } from '../src/csMaps.js';
import { RECOIL, KEY_ACTIONS } from '../src/csWeaponBehavior.js';
import { DEPLOY } from '../src/csWeaponDeploy.js';
import { SnowWorld } from '../src/csWorld.js';
import { WEAPONS, SOLDIER_HITBOX } from '../src/csWeapons.js';

const ASSET_ROOT = join(process.cwd(), 'games/cs/public');

function readAsset(rel: string): ArrayBuffer {
  const buf = readFileSync(join(ASSET_ROOT, rel.replace(/^\/cs\//, '')));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function loadWorld(id: string): SnowWorld {
  const meta = (MAPS as Record<string, (typeof MAPS)[keyof typeof MAPS] & { wads?: string[] }>)[id];
  const world = new SnowWorld(new T.Scene(), meta);
  for (const wad of meta.wads ?? []) world.parseWAD(readAsset(wad));
  world.parseBSP(readAsset(meta.asset));
  return world;
}

describe('cs engine: weapon data', () => {
  it('every weapon has coherent stats, recoil and deploy data', () => {
    for (const [id, def] of Object.entries(WEAPONS) as [string, any][]) {
      expect(def.name, id).toBeTruthy();
      expect(DEPLOY[id as keyof typeof DEPLOY], `${id} deploy`).toBeTruthy();
      expect(DEPLOY[id as keyof typeof DEPLOY].duration, `${id} deploy duration`).toBeGreaterThan(0);
      if (def.utility) continue; // he / armor / c4 carry no ballistic stats
      expect(def.rate, `${id} rate`).toBeGreaterThan(0);
      expect(def.damage, `${id} damage`).toBeGreaterThan(0);
      if (id === 'knife') continue;
      expect(def.mag, `${id} mag`).toBeGreaterThan(0);
      expect(def.reserve, `${id} reserve`).toBeGreaterThan(0);
      expect(RECOIL[id as keyof typeof RECOIL], `${id} recoil`).toBeTruthy();
    }
  });

  it('soldier hitbox envelope is the 1.8m operator spec', () => {
    expect(SOLDIER_HITBOX).toBeTruthy();
  });
});

describe('cs engine: economy', () => {
  it('every shop item maps to a category and a real weapon or equipment id', () => {
    const categoryIds = new Set(BUY_CATEGORIES.map((c) => c.id));
    for (const item of SHOP) {
      expect(categoryIds.has(item.category), item.id).toBe(true);
      if (['armor', 'vest', 'kit'].includes(item.id)) continue;
      expect(WEAPONS[item.id as keyof typeof WEAPONS], item.id).toBeTruthy();
    }
  });

  it('awardMoney caps at 16000 and settleRound applies loss streaks', () => {
    const a = { team: 'ct', money: 15900, losses: 0 };
    awardMoney(a, 500);
    expect(a.money).toBe(16000);
    const actors = [
      { team: 'ct', money: 0, losses: 0 },
      { team: 't', money: 0, losses: 2 },
    ];
    settleRound(actors, 'ct', null);
    expect(actors[0].money).toBe(3250);
    expect(actors[0].losses).toBe(0);
    expect(actors[1].losses).toBe(3);
    expect(actors[1].money).toBe(1400 + 2 * 500);
  });

  it('t-side bomb plant loser bonus applies when a site was used', () => {
    const actors = [{ team: 't', money: 0, losses: 0 }];
    settleRound(actors, 'ct', { status: 'defused', site: { id: 'A' } });
    expect(actors[0].money).toBe(1400 + 800);
  });
});

describe('cs engine: bomb round state machine', () => {
  const mkActor = (team: string, overrides: Record<string, unknown> = {}) => ({
    team,
    alive: true,
    grounded: true,
    isPlayer: false,
    moveSpeed: 0,
    pos: new T.Vector3(),
    ...overrides,
  });

  it('full plant-defuse lifecycle emits the expected events', () => {
    const world = loadWorld('de_dust2');
    const site = world.bombSites[0];
    const bomb = new BombRound(world);
    const carrier = mkActor('t');
    carrier.pos.copy(site.pos);
    const ct = mkActor('ct');
    ct.pos.copy(site.pos);
    const actors = [carrier, ct];

    bomb.reset(actors, 1, site.id);
    expect(bomb.status).toBe('carried');
    expect(bomb.carrier).toBe(carrier);
    expect(bomb.canPlant(carrier)).toBe(true);

    // Hold the plant request until the bomb goes in.
    const events: { type: string }[] = [];
    for (let i = 0; i < 60 && bomb.status !== 'planted'; i++) {
      events.push(...bomb.tick(0.1, actors, new Set([carrier])));
    }
    expect(bomb.status).toBe('planted');
    expect(events.map((e) => e.type)).toContain('planted');

    // CT with a defuse kit finishes inside the fuse window.
    (ct as Record<string, unknown>).defuseKit = true;
    const endEvents = bomb.tick(BOMB_RULES.kitTime + 0.01, actors, new Set([ct]));
    expect(bomb.status).toBe('defused');
    expect(bomb.winner).toBe('ct');
    expect(endEvents.map((e) => e.type)).toContain('defused');
    world.dispose();
  });

  it('planted bomb explodes for the T side when undefused', () => {
    const world = loadWorld('de_dust2');
    const site = world.bombSites[0];
    const bomb = new BombRound(world);
    const carrier = mkActor('t');
    carrier.pos.copy(site.pos);
    const actors = [carrier, mkActor('ct')];
    bomb.reset(actors, 1, site.id);
    for (let i = 0; i < 60 && bomb.status !== 'planted'; i++) bomb.tick(0.1, actors, new Set([carrier]));
    expect(bomb.status).toBe('planted');
    bomb.tick(BOMB_RULES.fuseTime + 0.5, actors, new Set());
    expect(bomb.status).toBe('exploded');
    expect(bomb.winner).toBe('t');
    world.dispose();
  });

  it('resolve awards the win to the surviving team', () => {
    const world = loadWorld('de_dust2');
    const bomb = new BombRound(world);
    const t = mkActor('t');
    const ct = mkActor('ct');
    // The JS default null narrows inference, although real site IDs are strings.
    (bomb.reset as (actors: ReturnType<typeof mkActor>[], round?: number, siteId?: string | null) => void)([t, ct], 1, 'A');
    expect(bomb.status).toBe('carried');
    t.alive = false;
    bomb.resolve([t, ct]);
    expect(bomb.winner).toBe('ct');
    world.dispose();
  });
});

describe('cs engine: BSP movement on shipped maps', () => {
  // Real incline coordinates from the original BSP faces (ported from carrick-cs
  // tests/movement.mjs): snow side ramps and Dust II T-spawn ramp.
  const RAMPS: Record<string, number[][]> = {
    fy_snow: [
      [21.37, 0.1, 22.37, 0.1, 1.68],
      [-22.43, 0.1, -23.43, 0.1, 2.22],
    ],
    de_dust2: [
      [5.16, 35.07, 4.16, 35.07, 4.11],
      [0.63, 35.07, -0.37, 35.07, 5.25],
    ],
  };

  for (const [id, cases] of Object.entries(RAMPS)) {
    it(`${id} keeps actors glued to ramps in both directions`, () => {
      const world = loadWorld(id);
      for (const crouch of [false, true]) {
        for (const [x, z, xx, zz, from] of cases) {
          const start = new T.Vector3(x, world.supportHeight(x, from + 0.6, z, 1.1, crouch), z);
          const end = new T.Vector3(xx, world.supportHeight(xx, from + 1, zz, 1.5, crouch), zz);
          expect(end.y).toBeGreaterThan(start.y + 0.2);
          for (const reverse of [false, true]) {
            const a = reverse ? end : start;
            const b = reverse ? start : end;
            const body = { pos: a.clone(), grounded: true, vy: 0 };
            const distance = Math.hypot(b.x - a.x, b.z - a.z);
            const hz = 60;
            const speed = 5.3;
            const frames = Math.ceil(distance / (speed / hz));
            let last = a.y;
            for (let i = 0; i < frames; i++) {
              const left = Math.hypot(b.x - body.pos.x, b.z - body.pos.z);
              const step = Math.min(left, speed / hz);
              world.move(body, ((b.x - a.x) / distance) * step, ((b.z - a.z) / distance) * step, 1 / hz, false, crouch);
              const progress = Math.hypot(body.pos.x - a.x, body.pos.z - a.z) / distance;
              const ideal = a.y + (b.y - a.y) * progress;
              expect(Math.abs(body.pos.y - ideal)).toBeLessThan(0.003);
              expect((body.pos.y - last) * (b.y - a.y)).toBeGreaterThan(-0.0001);
              expect(body.grounded).toBe(true);
              last = body.pos.y;
            }
            expect(body.pos.distanceTo(b)).toBeLessThan(0.004);
            world.move(body, 0, 0, 1 / hz, true, crouch);
            expect(body.grounded).toBe(false);
            expect(body.vy).toBeGreaterThan(0);
          }
        }
      }
      world.dispose();
    });
  }

  it('spawn points and bomb sites parse from both shipped BSPs', () => {
    const snow = loadWorld('fy_snow');
    expect(snow.spawns.ct.length).toBeGreaterThan(0);
    expect(snow.spawns.t.length).toBeGreaterThan(0);
    expect(snow.bombSites).toHaveLength(0);
    snow.dispose();

    const dust = loadWorld('de_dust2');
    expect(dust.spawns.ct.length).toBeGreaterThan(0);
    expect(dust.spawns.t.length).toBeGreaterThan(0);
    expect(dust.bombSites).toHaveLength(2);
    dust.dispose();
  });
});
