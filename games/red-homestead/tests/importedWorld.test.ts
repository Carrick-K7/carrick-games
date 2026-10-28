import { describe, expect, it, vi } from 'vitest';
import {
  build, canBuild, createImportedWorld, createWorld, demolish, deployBase, endSession,
  findPath, getBuilding, moveUnit, produceUnit, stepWorld, validateWorld,
} from '../src/simulation.js';
import { BUILDINGS, ORE_PRICE } from '../src/content.js';
import type { ClassicMapData } from '../src/classicTypes.js';
import type { BuildingKind, Point, TerrainCell, World } from '../src/types.js';

const MAP_HASH = 'a1'.repeat(32), BUNDLE_HASH = 'b2'.repeat(32), OTHER_HASH = 'c3'.repeat(32);
const clone = <T>(input: T): T => JSON.parse(JSON.stringify(input));
function mapFixture(width = 24, height = 20): ClassicMapData {
  const terrain = Array.from({ length: width * height }, (_, i): TerrainCell => ({
    kind: i % width === 0 || i % width === width - 1 || i < width || i >= width * (height - 1) ? 'void' : 'grass', height: 0, ore: 0,
  }));
  return {
    width, height, terrain, spawn: { x: 2, y: 2 }, title: 'Local peaceful test map', theater: 'TEMPERATE', rawMapHash: MAP_HASH,
    tiles: [{ x: 2, y: 2, height: 0, image: 'decoded-ground-only-in-cache', layer: 'ground' }],
  };
}
const create = (map = mapFixture(), economy: World['economy'] = 'classic', mode: World['mode'] = 'homestead') => createImportedWorld({ mode, economy }, map, BUNDLE_HASH);
const cell = (world: Pick<World, 'width' | 'terrain'>, x: number, y: number) => world.terrain[y * world.width + x];
function advance(world: World, seconds: number): void {
  for (let i = 0; i < Math.floor(seconds); i++) stepWorld(world, 1);
  if (seconds % 1) stepWorld(world, seconds % 1);
}
function until(world: World, predicate: () => boolean, seconds = 120): void {
  for (let i = 0; i < seconds * 10 && !predicate(); i++) stepWorld(world, 0.1);
  expect(predicate(), 'real simulated arrival must occur before the deadline').toBe(true);
}
function completed(world: World, kind: BuildingKind, x: number, y: number): void {
  expect(build(world, kind, x, y).ok).toBe(true);
  getBuilding(world, x, y)!.progress = 1;
}
function miningMap(): ClassicMapData {
  const map = mapFixture();
  map.terrain[8 * map.width + 17] = { kind: 'ore', height: 0, ore: 7 };
  return map;
}
function miningWorld(map = miningMap()): World {
  const world = create(map);
  expect(deployBase(world)).toBe(true);
  completed(world, 'power', 2, 8); completed(world, 'refinery', 10, 3);
  stepWorld(world, 0.1);
  return world;
}
function corridor(): ClassicMapData {
  const map = mapFixture(8, 6);
  map.terrain = map.terrain.map(() => ({ kind: 'void', height: 0, ore: 0 }));
  for (let x = 1; x <= 6; x++) map.terrain[2 * map.width + x] = { kind: 'grass', height: x < 4 ? 0 : 1, ore: 0 };
  map.spawn = { x: 1, y: 2 };
  return map;
}

describe('local map world creation and resource-free schema 2', () => {
  it('copies verified geometry, preserves grid coordinates and creates exactly one real MCV', () => {
    const map = miningMap(); cell(map, 6, 6).ramp = 20;
    const world = createImportedWorld({ mode: 'session', economy: 'creative', name: '  My local home  ' }, map, BUNDLE_HASH);
    expect(world).toMatchObject({
      schemaVersion: 2, materialsId: BUNDLE_HASH, mapId: `ra2-${MAP_HASH}`, width: 24, height: 20,
      mode: 'session', economy: 'creative', money: 6000, time: 0, name: 'My local home',
      source: { kind: 'ra2-local', bundleId: BUNDLE_HASH, mapHash: MAP_HASH, label: map.title, theater: 'TEMPERATE' },
    });
    expect(world.id).toMatch(/^[a-z0-9-]{1,100}$/);
    expect(world.terrain).toEqual(map.terrain); expect(world.terrain).not.toBe(map.terrain);
    expect(world.terrain[0]).not.toBe(map.terrain[0]); expect(world.units).toHaveLength(1);
    expect(world.units[0]).toMatchObject({ kind: 'mcv', x: 2, y: 2, task: 'idle', path: [], cargo: 0 });
    expect(world.buildings).toEqual([]);
    const encoded = JSON.stringify(world);
    expect(encoded).not.toMatch(/decoded-ground|tiles|rgba|sourceFiles|images/);
    expect(validateWorld(JSON.parse(encoded))).toEqual(world);
    map.terrain[0].height = 15; map.spawn.x = 10;
    expect(world.terrain[0].height).toBe(0); expect(world.units[0].x).toBe(2);
    expect(deployBase(world)).toBe(true); expect(deployBase(world)).toBe(false);
  });

  it('allows a builtin world to remember local artwork without claiming an imported map', () => {
    const world = createWorld({ mode: 'homestead', economy: 'classic', mapId: 'cedar-bay' });
    expect(world.materialsId).toBeNull(); expect(world.source).toBeNull();
    world.materialsId = BUNDLE_HASH;
    expect(validateWorld(clone(world))).toEqual(world);
    cell(world, 0, 0).height = 2;
    expect(() => validateWorld(world)).toThrow('map-mismatch');
  });

  it('validates creation options and source fingerprints before producing a world', () => {
    const map = mapFixture();
    expect(() => createImportedWorld({ mode: 'battle', economy: 'classic' } as never, map, BUNDLE_HASH)).toThrow('invalid-mode');
    expect(() => createImportedWorld({ mode: 'session', economy: 'infinite' } as never, map, BUNDLE_HASH)).toThrow('invalid-economy');
    expect(() => createImportedWorld({ mode: 'session', economy: 'classic', name: '' }, map, BUNDLE_HASH)).toThrow('invalid-name');
    for (const hash of ['', '../bundle', 'x'.repeat(64), 'A'.repeat(64), 'f'.repeat(63), 'f'.repeat(65)]) {
      expect(() => createImportedWorld({ mode: 'session', economy: 'classic' }, map, hash)).toThrow('invalid-sha256');
      expect(() => create({ ...map, rawMapHash: hash })).toThrow('invalid-sha256');
    }
  });

  it.each([3, 257, 0, -1, 4.5, Infinity, NaN])('rejects invalid imported dimension %s', value => {
    const map = mapFixture();
    expect(() => create({ ...map, width: value })).toThrow('invalid-world:map.width:');
    expect(() => create({ ...map, height: value })).toThrow('invalid-world:map.height:');
  });

  it('accepts the minimum 4x4 and maximum 256x256 grids without trimming their coordinates', () => {
    for (const size of [4, 256]) {
      const world = create(mapFixture(size, size));
      expect(world.width).toBe(size); expect(world.terrain).toHaveLength(size * size);
      expect(validateWorld(clone(world))).toEqual(world);
    }
  });

  it('blocks void origins, noninteger spawns and out-of-range spawns', () => {
    for (const spawn of [{ x: 0, y: 2 }, { x: -1, y: 2 }, { x: 24, y: 2 }, { x: 2, y: 20 }, { x: 2.5, y: 2 }]) {
      expect(() => create({ ...mapFixture(), spawn })).toThrow('invalid-world:map.spawn');
    }
  });
});

describe('void, elevation and readonly bounded navigation', () => {
  it('blocks void placement/path destinations and map edges without wrapping rows', () => {
    const world = create();
    expect(deployBase(world)).toBe(true);
    expect(canBuild(world, 'house', 22, 6).reason).toBe('blocked-terrain');
    expect(canBuild(world, 'house', 23, 6).reason).toBe('out-of-bounds');
    expect(canBuild(world, 'house', 3, 18).reason).toBe('blocked-terrain');
    for (const point of [{ x: 0, y: 4 }, { x: -1, y: 4 }, { x: 24, y: 4 }, { x: 4, y: 20 }, { x: 1.5, y: 4 }, { x: NaN, y: 4 }]) {
      expect(findPath(world, { x: 5, y: 5 }, point)).toBeNull();
      expect(findPath(world, point, { x: 5, y: 5 })).toBeNull();
    }
    expect(findPath(world, { x: 0, y: 4 }, { x: 0, y: 4 })).toBeNull();
    expect(findPath(world, { x: 5, y: 5 }, { x: 5, y: 5 })).toEqual([]);
    const thin = create(mapFixture(4, 6));
    expect(findPath(thin, { x: 2, y: 2 }, { x: 1, y: 3 })).toHaveLength(2);
  });

  it('requires a nonzero ramp at either endpoint of a one-level step and never crosses larger cliffs', () => {
    const world = create(corridor()), from = { x: 1, y: 2 }, to = { x: 6, y: 2 };
    expect(findPath(world, from, to)).toBeNull();
    cell(world, 3, 2).ramp = 0;
    expect(findPath(world, from, to)).toBeNull();
    for (const ramp of [1, 20]) {
      cell(world, 3, 2).ramp = ramp;
      expect(findPath(world, from, to)).toHaveLength(5); expect(findPath(world, to, from)).toHaveLength(5);
    }
    delete cell(world, 3, 2).ramp; cell(world, 4, 2).ramp = 1;
    expect(findPath(world, from, to)).toHaveLength(5);
    for (let x = 4; x <= 6; x++) cell(world, x, 2).height = 2;
    expect(findPath(world, from, to)).toBeNull();
  });

  it('applies the same slope rules to queued movement and saved routes', () => {
    const map = corridor(); cell(map, 3, 2).ramp = 1;
    const world = create(map), mcv = world.units[0];
    expect(moveUnit(world, mcv.id, 6, 2)).toBe(true);
    expect(validateWorld(clone(world))).toEqual(world);
    const invalid = clone(world); delete cell(invalid, 3, 2).ramp;
    expect(() => validateWorld(invalid)).toThrow('route-terrain');
    advance(world, 4); expect(mcv).toMatchObject({ x: 6, y: 2, task: 'idle' });
    expect(moveUnit(world, mcv.id, 1, 2)).toBe(true);
    delete cell(world, 3, 2).ramp;
    advance(world, 5);
    expect(mcv.x).toBeGreaterThanOrEqual(4); expect(mcv.task).toBe('idle');
  });

  it('requires flat building foundations and does not spawn or work across a cliff', () => {
    const world = create(); expect(deployBase(world)).toBe(true);
    cell(world, 9, 9).height = 1;
    expect(build(world, 'house', 8, 8).reason).toBe('blocked-terrain');
    const perimeter: Point[] = [
      { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 }, { x: 2, y: 5 }, { x: 3, y: 5 }, { x: 4, y: 5 },
      { x: 1, y: 2 }, { x: 1, y: 3 }, { x: 1, y: 4 }, { x: 5, y: 2 }, { x: 5, y: 3 }, { x: 5, y: 4 },
    ];
    for (const point of perimeter) cell(world, point.x, point.y).height = 1;
    expect(produceUnit(world, 'engineer').reason).toBe('no-exit');
    cell(world, 2, 1).ramp = 1;
    expect(produceUnit(world, 'engineer').ok).toBe(true); expect(world.units[0]).toMatchObject({ x: 2, y: 1 });
    expect(validateWorld(clone(world))).toEqual(world);
    const invalid = clone(world); cell(invalid, 3, 3).height = 1;
    expect(() => validateWorld(invalid)).toThrow('blocked-terrain');
    const voidWorld = create(); expect(deployBase(voidWorld)).toBe(true);
    for (const point of perimeter) cell(voidWorld, point.x, point.y).kind = 'void';
    expect(produceUnit(voidWorld, 'engineer').reason).toBe('no-exit');
  });

  it('reflects building placement, demolition and direct terrain edits after previous queries', () => {
    const world = create(); expect(deployBase(world)).toBe(true);
    const from = { x: 5, y: 7 }, to = { x: 10, y: 7 }, before = clone(world);
    expect(findPath(world, from, to)).toHaveLength(5); expect(world).toEqual(before);
    expect(build(world, 'tree', 7, 7).ok).toBe(true);
    const route = findPath(world, from, to)!;
    expect(route).toHaveLength(7); expect(route).not.toContainEqual({ x: 7, y: 7 });
    expect(demolish(world, getBuilding(world, 7, 7)!.id).ok).toBe(true);
    expect(findPath(world, from, to)).toHaveLength(5);
    cell(world, 7, 7).kind = 'void';
    expect(findPath(world, from, to)).toHaveLength(7);
    expect(validateWorld(clone(world))).toEqual(world);
    expect(Object.keys(world).sort()).toEqual(Object.keys(before).sort());
  });

  it('finds deterministic shortest routes on 65536 cells with bounded reusable scratch', () => {
    const world = create(mapFixture(256, 256)), start = { x: 1, y: 1 }, target = { x: 254, y: 254 };
    const before = JSON.stringify(world);
    const route = findPath(world, start, target)!;
    expect(route).toHaveLength(506); expect(route.at(-1)).toEqual(target);
    for (let i = 0; i < 8; i++) expect(findPath(world, start, target)).toEqual(route);
    expect(JSON.stringify(world)).toBe(before);
    for (let y = 0; y < 256; y++) cell(world, 128, y).kind = 'void';
    expect(findPath(world, start, target)).toBeNull();
    cell(world, 128, 128).kind = 'grass';
    expect(findPath(world, start, target)).toHaveLength(506);
  });
});

describe('imported economy remains physical and saveable', () => {
  it('mines finite imported ore, pays exactly once on actual delivery and roundtrips mid-trip', () => {
    const world = miningWorld(), initialMoney = world.money, miner = world.units[0];
    until(world, () => miner.task === 'to-refinery');
    expect(miner.cargo).toBe(7); expect(world.oreDelivered).toBe(0); expect(cell(world, 17, 8).ore).toBe(0);
    const restored = validateWorld(clone(world)); expect(restored).toEqual(world);
    for (let i = 0; i < 1200; i++) {
      stepWorld(world, 0.1); stepWorld(restored, 0.1);
    }
    expect(restored).toEqual(world); expect(world.oreDelivered).toBe(7); expect(miner.cargo).toBe(0);
    expect(world.money - initialMoney).toBe(7 * ORE_PRICE + Math.floor(world.time / 2));
    expect(validateWorld(clone(restored))).toEqual(world);
    expect(world.units.filter(unit => unit.kind === 'miner')).toHaveLength(1);
  });

  it('cannot mine a straight-cliff plateau but reaches and returns through a real ramp', () => {
    const map = miningMap();
    for (let y = 1; y < map.height - 1; y++) for (let x = 15; x < map.width - 1; x++) cell(map, x, y).height = 1;
    const world = miningWorld(map), money = world.money;
    advance(world, 50);
    expect(world.oreDelivered).toBe(0); expect(world.units[0].cargo).toBe(0); expect(cell(world, 17, 8).ore).toBe(7);
    expect(world.money - money).toBe(25); // Only the yard income, no unreachable mining revenue.
    cell(world, 15, 8).ramp = 1;
    until(world, () => world.oreDelivered === 7);
    expect(validateWorld(clone(world))).toEqual(world);
  });

  it('keeps a full miner unpaid when its return ramp disappears', () => {
    const map = miningMap();
    for (let y = 1; y < map.height - 1; y++) for (let x = 15; x < map.width - 1; x++) cell(map, x, y).height = 1;
    cell(map, 15, 8).ramp = 1;
    const world = miningWorld(map), miner = world.units[0];
    until(world, () => miner.task === 'to-refinery'); delete cell(world, 15, 8).ramp;
    const before = world.money; advance(world, 60);
    expect(miner.cargo).toBe(7); expect(world.oreDelivered).toBe(0); expect(world.money - before).toBe(30);
  });

  it('does not let engineers help or trucks deliver through an adjacent straight cliff', () => {
    const world = create(mapFixture(), 'creative'); expect(deployBase(world)).toBe(true);
    completed(world, 'power', 8, 2); completed(world, 'workshop', 2, 8);
    for (let y = 13; y < 16; y++) for (let x = 15; x < 17; x++) cell(world, x, y).height = 1;
    expect(build(world, 'apartment', 15, 13).ok).toBe(true);
    expect(produceUnit(world, 'engineer').ok).toBe(true);
    advance(world, 5);
    const engineer = world.units.find(unit => unit.kind === 'engineer')!;
    expect(engineer.task).toBe('idle');
    expect(getBuilding(world, 15, 13)!.progress).toBeCloseTo(5 / BUILDINGS.apartment.buildTime);
    cell(world, 14, 13).ramp = 1;
    until(world, () => engineer.task === 'building', 15);
    expect(engineer).toMatchObject({ x: 14, y: 13 });
    expect(validateWorld(clone(world))).toEqual(world);
    advance(world, 10);
    expect(demolish(world, getBuilding(world, 15, 13)!.id).ok).toBe(true);
    // Move the real engineer out of the target footprint before creating the market.
    expect(moveUnit(world, engineer.id, 7, 7)).toBe(true); advance(world, 10);
    delete cell(world, 14, 13).ramp;
    completed(world, 'market', 15, 13);
    expect(produceUnit(world, 'truck').ok).toBe(true);
    const truck = world.units.find(unit => unit.kind === 'truck')!;
    advance(world, 45);
    expect(truck.cargo).toBe(1); expect(world.goodsDelivered).toBe(0);
    expect(validateWorld(clone(world))).toEqual(world);
    cell(world, 14, 13).ramp = 1;
    until(world, () => world.goodsDelivered > 0);
    expect(validateWorld(clone(world))).toEqual(world);
  });

  it('keeps creative spending free, homesteads running and ended sessions fully frozen', () => {
    const home = create(mapFixture(), 'creative'); expect(deployBase(home)).toBe(true);
    const money = home.money;
    expect(build(home, 'house', 8, 8).ok).toBe(true); expect(home.money).toBe(money);
    expect(demolish(home, getBuilding(home, 8, 8)!.id).ok).toBe(true); expect(home.money).toBe(money);
    endSession(home); advance(home, 2); expect(home.time).toBeCloseTo(2);
    const session = create(mapFixture(), 'classic', 'session'); expect(deployBase(session)).toBe(true);
    expect(produceUnit(session, 'engineer').ok).toBe(true);
    endSession(session); const frozen = clone(session);
    advance(session, 100);
    expect(build(session, 'house', 8, 8).reason).toBe('ended');
    expect(demolish(session, session.buildings[0].id).reason).toBe('ended');
    expect(produceUnit(session, 'engineer').reason).toBe('ended');
    expect(moveUnit(session, session.units[0].id, 12, 12)).toBe(false); expect(deployBase(session)).toBe(false);
    expect(session).toEqual(frozen); expect(validateWorld(frozen)).toEqual(session);
  });
});

describe('strict imported save trust boundary', () => {
  const corruptions: [string, (world: World) => void][] = [
    ['missing source', w => { delete (w as Partial<World>).source; }],
    ['missing materialsId', w => { delete (w as Partial<World>).materialsId; }],
    ['null imported source', w => { w.source = null; }],
    ['null imported materials', w => { w.materialsId = null; }],
    ['different materials hash', w => { w.materialsId = OTHER_HASH; }],
    ['invalid materials hash', w => { w.materialsId = 'local-file'; }],
    ['invalid map fingerprint', w => { w.source!.mapHash = 'x'.repeat(64); }],
    ['uppercase map fingerprint', w => { w.source!.mapHash = 'A'.repeat(64); }],
    ['invalid bundle fingerprint', w => { w.source!.bundleId = 'b'.repeat(63); }],
    ['map fingerprint mismatch', w => { w.mapId = `ra2-${OTHER_HASH}`; }],
    ['unknown source kind', w => { w.source!.kind = 'remote' as never; }],
    ['unknown theater', w => { w.source!.theater = 'UNKNOWN'; }],
    ['bad source label', w => { w.source!.label = '\u0000'; }],
    ['oversized source label', w => { w.source!.label = 'a'.repeat(121); }],
    ['unknown root body', w => { Object.assign(w, { rgba: [] }); }],
    ['unknown source body', w => { Object.assign(w.source!, { images: {} }); }],
    ['unknown terrain body', w => { Object.assign(w.terrain[0], { tile: 4 }); }],
    ['unknown unit body', w => { Object.assign(w.units[0], { weapon: 'rifle' }); }],
    ['missing old numeric field', w => { delete (w as Partial<World>).oreDelivered; }],
    ['width overflow', w => { w.width = 257; }],
    ['height underflow', w => { w.height = 3; }],
    ['short terrain', w => { w.terrain.pop(); }],
    ['unrecognized terrain', w => { cell(w, 8, 8).kind = 'unknown' as never; }],
    ['ore on void', w => { w.terrain[0].ore = 1; }],
    ['ore on grass', w => { cell(w, 8, 8).ore = 1; }],
    ['excess ore', w => { cell(w, 8, 8).kind = 'ore'; cell(w, 8, 8).ore = 100_001; }],
    ['fractional ore', w => { cell(w, 8, 8).kind = 'ore'; cell(w, 8, 8).ore = 0.5; }],
    ['negative height', w => { cell(w, 8, 8).height = -1; }],
    ['excess height', w => { cell(w, 8, 8).height = 16; }],
    ['fractional height', w => { cell(w, 8, 8).height = 0.1; }],
    ['nonfinite height', w => { cell(w, 8, 8).height = Infinity; }],
    ['negative ramp', w => { cell(w, 8, 8).ramp = -1; }],
    ['excess ramp', w => { cell(w, 8, 8).ramp = 21; }],
    ['fractional ramp', w => { cell(w, 8, 8).ramp = 1.5; }],
    ['undefined ramp', w => { cell(w, 8, 8).ramp = undefined; }],
    ['nonfinite ramp', w => { cell(w, 8, 8).ramp = NaN; }],
    ['void unit', w => { w.units[0].x = 0; }],
    ['out of bounds unit', w => { w.units[0].x = w.width; }],
  ];
  it.each(corruptions)('rejects %s instead of repairing or importing untrusted state', (_label, corrupt) => {
    const world = create(); corrupt(world);
    expect(() => validateWorld(world)).toThrow('invalid-world:');
  });

  it('validates all imported terrain limits at creation, not only at save loading', () => {
    const map = mapFixture(); cell(map, 8, 8).height = 15; cell(map, 8, 8).ramp = 20;
    cell(map, 8, 8).kind = 'ore'; cell(map, 8, 8).ore = 100_000;
    expect(validateWorld(clone(create(map))).terrain).toEqual(map.terrain);
    cell(map, 8, 8).ramp = 21; expect(() => create(map)).toThrow('ramp');
    delete cell(map, 8, 8).ramp; cell(map, 8, 8).ore = 100_001; expect(() => create(map)).toThrow('ore');
    cell(map, 8, 8).ore = 1; cell(map, 8, 8).kind = 'unknown' as never; expect(() => create(map)).toThrow('kind');
  });

  it('rejects accessor source/terrain state without invoking getters', () => {
    const getter = vi.fn(() => BUNDLE_HASH), world = create();
    Object.defineProperty(world.source!, 'bundleId', { get: getter });
    expect(() => validateWorld(world)).toThrow('data-required'); expect(getter).not.toHaveBeenCalled();
    const other = create(); Object.defineProperty(other.terrain[0], 'ramp', { get: getter });
    expect(() => validateWorld(other)).toThrow('data-required'); expect(getter).not.toHaveBeenCalled();
  });

  it('rejects a forged void building and void-crossing route while preserving legal depleted ore', () => {
    const world = create(); expect(deployBase(world)).toBe(true);
    cell(world, 2, 2).kind = 'void'; expect(() => validateWorld(world)).toThrow('blocked-terrain');
    const moving = create(); expect(moveUnit(moving, moving.units[0].id, 12, 2)).toBe(true);
    cell(moving, 6, 2).kind = 'void'; expect(() => validateWorld(moving)).toThrow('route-terrain');
    const map = miningMap(); cell(map, 17, 8).ore = 0;
    expect(validateWorld(create(map)).terrain[8 * map.width + 17]).toEqual({ kind: 'ore', height: 0, ore: 0 });
  });

  it('retains existing money charges and unknown building-state rejection', () => {
    const world = create(), initial = world.money; expect(deployBase(world)).toBe(true);
    expect(build(world, 'house', 8, 8).ok).toBe(true); expect(world.money).toBe(initial - BUILDINGS.house.cost);
    Object.assign(world.buildings[0], { health: 100 });
    expect(() => validateWorld(world)).toThrow('unexpected-fields');
  });
});
