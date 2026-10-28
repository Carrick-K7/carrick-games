import { describe, expect, it, vi } from 'vitest';
import {
  build, canBuild, createWorld, demolish, deployBase, endSession, getBuilding, getStats,
  moveUnit, produceUnit, stepWorld, validateWorld,
} from '../src/simulation.js';
import { BUILDINGS, BUILDING_KINDS, GOODS_COST, GOODS_PRICE, LIMITS, MINER_CAPACITY, ORE_PRICE, UNITS } from '../src/content.js';
import { MAPS, createTerrain } from '../src/maps.js';
import type { Building, BuildingKind, Unit, World } from '../src/types.js';

const fresh = (economy: World['economy'] = 'classic', mode: World['mode'] = 'homestead', mapId = 'cedar-bay') => createWorld({ economy, mode, mapId });
const clone = <T>(input: T): T => JSON.parse(JSON.stringify(input));
function advance(world: World, seconds: number): void {
  for (let i = 0; i < Math.floor(seconds); i++) stepWorld(world, 1);
  if (seconds % 1) stepWorld(world, seconds % 1);
}
function until(world: World, predicate: () => boolean, maxSeconds = 120): void {
  for (let i = 0; i < maxSeconds * 10 && !predicate(); i++) stepWorld(world, 0.1);
  expect(predicate(), 'condition must become true within simulated deadline').toBe(true);
}
function base(economy: World['economy'] = 'classic'): World {
  const world = fresh(economy);
  expect(deployBase(world)).toBe(true);
  return world;
}
/** Direct completion is used only in isolated fixtures; integration cases exercise real construction. */
function completeBuilding(world: World, kind: BuildingKind, x: number, y: number): Building {
  expect(build(world, kind, x, y)).toEqual({ ok: true, reason: 'ok' });
  const building = getBuilding(world, x, y)!;
  building.progress = 1;
  return building;
}
function miningWorld(economy: World['economy'] = 'classic'): World {
  const world = base(economy);
  completeBuilding(world, 'power', 2, 2);
  completeBuilding(world, 'refinery', 10, 3);
  stepWorld(world, 0.1);
  return world;
}
function enclose(world: World, unit: Unit): void {
  for (const [x, y] of [[unit.x - 1, unit.y], [unit.x + 1, unit.y], [unit.x, unit.y - 1], [unit.x, unit.y + 1]]) {
    if (x >= 0 && y >= 0 && x < world.width && y < world.height) world.terrain[y * world.width + x] = { kind: 'rock', height: 1, ore: 0 };
  }
}

 describe('original development content and world creation', () => {
  it.each(MAPS)('$id is reproducible, modest and explicitly non-original-game', map => {
    const a = fresh('classic', 'homestead', map.id), b = fresh('classic', 'homestead', map.id);
    expect(a.terrain).toEqual(b.terrain);
    expect(a.terrain).not.toBe(b.terrain);
    expect(a.width).toBe(36); expect(a.height).toBe(36);
    expect(map.provenance).toBe('original-development');
    expect(map.labelZh).toContain('原创练习场');
    expect(map.descriptionEn).toContain('Not an original game map');
    expect(a.terrain.some(cell => cell.ore > 0)).toBe(true);
    expect(a.units).toHaveLength(1); expect(a.units[0].kind).toBe('mcv');
    expect(deployBase(a)).toBe(true);
    expect(build(a, 'power', 2, 2).ok).toBe(true);
    expect(build(a, 'refinery', 10, 3).ok).toBe(true);
    advance(a, 65);
    expect(a.oreDelivered).toBeGreaterThan(0);
    expect(validateWorld(clone(a))).toEqual(a);
  });

  it('has a typed, finite, localized utility-only catalogue', () => {
    expect(BUILDING_KINDS.length).toBeGreaterThanOrEqual(20);
    for (const kind of BUILDING_KINDS) {
      const data = BUILDINGS[kind];
      expect(data.kind).toBe(kind); expect(data.labelZh.length).toBeGreaterThan(0); expect(data.labelEn.length).toBeGreaterThan(0);
      expect(data.cost).toBeGreaterThan(0); expect(data.buildTime).toBeGreaterThan(0);
      expect(data.footprint.width).toBeGreaterThan(0); expect(data.footprint.height).toBeGreaterThan(0);
    }
    expect(Object.keys(UNITS).sort()).toEqual(['engineer', 'mcv', 'miner', 'truck']);
    expect(JSON.stringify(fresh())).not.toMatch(/damage|weapon|ammo|health/);
  });

  it('validates creation options and makes independent JSON-safe worlds', () => {
    expect(() => createWorld({ mode: 'battle', economy: 'classic', mapId: 'cedar-bay' } as never)).toThrow('invalid-mode');
    expect(() => createWorld({ mode: 'session', economy: 'infinite', mapId: 'cedar-bay' } as never)).toThrow('invalid-economy');
    expect(() => fresh('classic', 'session', 'classic-map-name')).toThrow('invalid-map');
    expect(() => createWorld({ mode: 'session', economy: 'classic', mapId: 'cedar-bay', name: '  ' })).toThrow('invalid-name');
    const a = fresh(), b = fresh();
    expect(a.id).not.toBe(b.id); expect(a.id).toMatch(/^[a-z0-9-]{1,100}$/);
    expect(a.schemaVersion).toBe(2); expect(a.source).toBeNull(); expect(a.materialsId).toBeNull();
    expect(validateWorld(clone(a))).toEqual(a);
    a.terrain[0].height = 4;
    expect(b.terrain).toEqual(createTerrain(MAPS[0]));
  });
});

describe('build, deploy, money and power', () => {
  it('requires MCV deployment and consumes it exactly once without a construction charge', () => {
    const world = fresh(), money = world.money;
    expect(build(world, 'house', 2, 2).reason).toBe('needs-yard');
    expect(deployBase(world)).toBe(true); expect(deployBase(world)).toBe(false);
    expect(world.units).toHaveLength(0); expect(world.buildings).toHaveLength(1);
    expect(world.buildings[0]).toMatchObject({ kind: 'yard', x: 6, y: 6, progress: 1 });
    expect(world.money).toBe(money);
    expect(build(world, 'yard', 2, 2).reason).toBe('deploy-mcv');
  });

  it('charges once, uses the complete footprint, and leaves failed commands unchanged', () => {
    const world = base(), money = world.money;
    expect(canBuild(world, 'house', 2, 2).ok).toBe(true); expect(world.money).toBe(money);
    expect(build(world, 'house', 2, 2).ok).toBe(true); expect(world.money).toBe(money - BUILDINGS.house.cost);
    expect(getBuilding(world, 3, 3)).toBe(getBuilding(world, 2, 2));
    const snapshot = clone(world);
    for (const [kind, x, y, reason] of [
      ['house', 3, 3, 'occupied'], ['house', -1, 2, 'out-of-bounds'], ['house', 35, 35, 'out-of-bounds'],
      ['house', NaN, 2, 'invalid-position'], ['house', 1.5, 2, 'invalid-position'],
      ['house', 14, 8, 'blocked-terrain'], ['house', 34, 2, 'blocked-terrain'],
      ['tank', 2, 8, 'invalid-kind'],
    ] as const) expect(build(world, kind as BuildingKind, x, y).reason).toBe(reason);
    expect(world).toEqual(snapshot);
    world.money = 0;
    expect(build(world, 'power', 10, 11).reason).toBe('insufficient-funds');
  });

  it('does not construct on units, but roads permit movement and cannot overlap other buildings', () => {
    const world = base('creative');
    expect(produceUnit(world, 'engineer').ok).toBe(true);
    const engineer = world.units[0];
    expect(build(world, 'tree', engineer.x, engineer.y).reason).toBe('unit-in-way');
    expect(build(world, 'road', engineer.x, engineer.y).ok).toBe(true);
    expect(build(world, 'tree', engineer.x, engineer.y).reason).toBe('occupied');
    expect(build(world, 'road', 6, 6).reason).toBe('occupied');
    expect(validateWorld(clone(world))).toEqual(world);
  });

  it('only allows a harbor on a land footprint touching water', () => {
    const world = base('creative');
    expect(build(world, 'harbor', 2, 2).reason).toBe('needs-shore');
    let placed = false;
    for (let y = 0; y < world.height && !placed; y++) for (let x = 0; x < world.width && !placed; x++) {
      if (canBuild(world, 'harbor', x, y).ok) placed = build(world, 'harbor', x, y).ok;
    }
    expect(placed).toBe(true); expect(validateWorld(clone(world))).toEqual(world);
  });

  it('finishes construction after elapsed simulation time, not immediately', () => {
    const world = base();
    expect(build(world, 'power', 2, 2).ok).toBe(true);
    const power = getBuilding(world, 2, 2)!;
    advance(world, 6); expect(power.progress).toBeCloseTo(0.5); expect(getStats(world).powerProduced).toBe(10);
    advance(world, 6); expect(power.progress).toBe(1); expect(getStats(world).powerProduced).toBe(130);
  });

  it('slows nonessential builds in low power but never stalls the first power plant', () => {
    const world = base('creative');
    completeBuilding(world, 'refinery', 10, 3);
    completeBuilding(world, 'apartment', 2, 11);
    expect(build(world, 'house', 10, 11).ok).toBe(true);
    expect(build(world, 'power', 2, 2).ok).toBe(true);
    advance(world, 8);
    expect(getBuilding(world, 10, 11)!.progress).toBeLessThan(0.4);
    expect(getBuilding(world, 2, 2)!.progress).toBeCloseTo(8 / 12);
    advance(world, 4); expect(getBuilding(world, 2, 2)!.progress).toBe(1);
    advance(world, 8); expect(getBuilding(world, 10, 11)!.progress).toBe(1);
  });

  it('refunds half once and frees occupied space', () => {
    const world = base();
    build(world, 'house', 2, 2);
    const building = getBuilding(world, 2, 2)!, before = world.money;
    expect(demolish(world, building.id).ok).toBe(true);
    expect(world.money).toBe(before + 150); expect(getBuilding(world, 2, 2)).toBeUndefined();
    expect(demolish(world, building.id).reason).toBe('not-found'); expect(world.money).toBe(before + 150);
  });

  it('creative spending is free but balances remain finite and bounded', () => {
    const world = miningWorld('creative');
    world.money = LIMITS.money;
    expect(build(world, 'apartment', 2, 11).ok).toBe(true);
    expect(produceUnit(world, 'engineer').ok).toBe(true);
    advance(world, 200);
    expect(world.money).toBe(LIMITS.money); expect(Number.isFinite(world.money)).toBe(true);
    expect(validateWorld(clone(world))).toEqual(world);
  });

  it('civic housing and amenities sustain income after every ore tile is exhausted', () => {
    const world = base();
    completeBuilding(world, 'power', 2, 2); completeBuilding(world, 'house', 2, 6);
    completeBuilding(world, 'market', 10, 12); completeBuilding(world, 'park', 2, 11);
    for (const cell of world.terrain) cell.ore = 0;
    const before = world.money;
    advance(world, 300);
    const stats = getStats(world);
    expect(stats.population).toBe(12); expect(stats.capacity).toBe(12);
    expect(stats.happiness).toBeGreaterThan(55); expect(stats.income).toBeGreaterThan(70);
    expect(world.money).toBeGreaterThan(before + 300); expect(world.oreDelivered).toBe(0);
    expect(validateWorld(clone(world))).toEqual(world);
  });
});

describe('finite ore and physical delivery', () => {
  it('spawns exactly one complimentary miner per refinery completion', () => {
    const world = base();
    build(world, 'power', 2, 2); build(world, 'refinery', 10, 3);
    advance(world, 19); expect(world.units).toHaveLength(0);
    advance(world, 1); expect(world.units.filter(u => u.kind === 'miner')).toHaveLength(1);
    advance(world, 200); expect(world.units.filter(u => u.kind === 'miner')).toHaveLength(1);
    const restored = validateWorld(clone(world));
    advance(restored, 60); expect(restored.units.filter(u => u.kind === 'miner')).toHaveLength(1);
  });

  it('collects on the ore tile and credits a finite partial load once, only on delivery', () => {
    const world = miningWorld();
    for (const cell of world.terrain) cell.ore = 0;
    world.terrain[8 * world.width + 14].ore = 3;
    const miner = world.units[0], initialMoney = world.money;
    until(world, () => miner.cargo > 0);
    expect(miner.x).toBe(14); expect(miner.y).toBe(8); expect(world.oreDelivered).toBe(0);
    until(world, () => world.oreDelivered === 3);
    const deliveryTime = world.time;
    expect(miner.cargo).toBe(0); expect(world.terrain.reduce((sum, c) => sum + c.ore, 0)).toBe(0);
    expect(world.money - initialMoney).toBe(3 * ORE_PRICE + Math.floor(world.time / 2));
    const afterDelivery = world.money;
    advance(world, 120);
    expect(world.oreDelivered).toBe(3); expect(miner.cargo).toBe(0);
    expect(world.money - afterDelivery).toBe(60); expect(world.time).toBeCloseTo(deliveryTime + 120);
  });

  it('cannot mine remote ore when enclosed before arrival', () => {
    const world = miningWorld(), miner = world.units[0];
    enclose(world, miner);
    const ore = world.terrain.reduce((sum, c) => sum + c.ore, 0), position = { x: miner.x, y: miner.y };
    advance(world, 60);
    expect(miner).toMatchObject(position); expect(miner.cargo).toBe(0); expect(world.oreDelivered).toBe(0);
    expect(world.terrain.reduce((sum, c) => sum + c.ore, 0)).toBe(ore);
  });

  it('retains cargo without payment when trapped on the return trip', () => {
    const world = miningWorld(), miner = world.units[0];
    until(world, () => miner.task === 'to-refinery');
    expect(miner.cargo).toBe(MINER_CAPACITY);
    enclose(world, miner);
    const before = world.money;
    advance(world, 60);
    expect(miner.cargo).toBe(MINER_CAPACITY); expect(world.oreDelivered).toBe(0);
    expect(world.money - before).toBe(30); // Only the yard's recurring civic income.
  });

  it('does not pay into a demolished refinery and can deliver to a replacement', () => {
    const world = miningWorld(), miner = world.units[0];
    until(world, () => miner.task === 'to-refinery');
    expect(demolish(world, world.buildings.find(b => b.kind === 'refinery')!.id).ok).toBe(true);
    expect(miner.targetId).toBeNull(); expect(validateWorld(clone(world))).toEqual(world);
    advance(world, 20); expect(world.oreDelivered).toBe(0); expect(miner.cargo).toBe(MINER_CAPACITY);
    completeBuilding(world, 'refinery', 10, 3);
    until(world, () => world.oreDelivered >= MINER_CAPACITY);
    expect(miner.cargo).toBe(0);
  });

  it('defers a complimentary miner when all exits are blocked and does not charge twice', () => {
    const world = base('creative');
    completeBuilding(world, 'refinery', 10, 3);
    for (const [x, y] of [[10, 2], [11, 2], [12, 2], [10, 5], [11, 5], [12, 5], [9, 3], [9, 4], [13, 3], [13, 4]]) build(world, 'tree', x, y);
    advance(world, 2); expect(world.units).toHaveLength(0);
    expect(produceUnit(world, 'miner').reason).toBe('no-exit');
    demolish(world, getBuilding(world, 10, 2)!.id);
    advance(world, 1); expect(world.units).toHaveLength(1);
  });
});

describe('queued pathfinding and civil units', () => {
  it('queues MCV movement rather than teleporting and rejects water/rock/building goals', () => {
    const world = fresh(), mcv = world.units[0];
    expect(moveUnit(world, mcv.id, 10, 6)).toBe(true);
    expect(mcv.x).toBe(6); expect(mcv.path).toHaveLength(4);
    advance(world, 1); expect(mcv.x).toBe(7);
    advance(world, 3); expect(mcv.x).toBe(10); expect(mcv.task).toBe('idle');
    expect(moveUnit(world, mcv.id, 34, 2)).toBe(false);
    world.terrain[5 * world.width + 10].kind = 'rock';
    expect(moveUnit(world, mcv.id, 10, 5)).toBe(false);
    expect(moveUnit(world, mcv.id, NaN, 6)).toBe(false); expect(moveUnit(world, 'missing', 10, 6)).toBe(false);
    expect(deployBase(world)).toBe(true);
    produceUnit(world, 'engineer');
    expect(moveUnit(world, world.units[0].id, 10, 6)).toBe(false);
  });

  it('reroutes around buildings placed after a command without crossing their footprint', () => {
    const world = base('creative');
    produceUnit(world, 'engineer');
    const engineer = world.units[0];
    expect(moveUnit(world, engineer.id, 12, 5)).toBe(true);
    const blocked = engineer.path[0];
    expect(build(world, 'tree', blocked.x, blocked.y).ok).toBe(true);
    // This transient route is a valid save: path revalidation occurs on the next tick.
    expect(validateWorld(clone(world))).toEqual(world);
    for (let i = 0; i < 45; i++) {
      stepWorld(world, 0.1);
      expect(engineer.x !== blocked.x || engineer.y !== blocked.y).toBe(true);
    }
    expect(engineer).toMatchObject({ x: 12, y: 5 });
  });

  it('roads increase actual traversal speed without blocking a unit', () => {
    const plain = fresh(), road = clone(plain);
    for (let x = 6; x <= 12; x++) road.terrain[6 * road.width + x].kind = 'road';
    moveUnit(plain, plain.units[0].id, 13, 6); moveUnit(road, road.units[0].id, 13, 6);
    advance(plain, 2); advance(road, 2);
    expect(road.units[0].x).toBeGreaterThan(plain.units[0].x);
  });

  it('engineers must arrive at a construction perimeter before contributing work', () => {
    const assisted = base('creative'), solo = clone(assisted);
    expect(produceUnit(assisted, 'engineer').ok).toBe(true);
    build(assisted, 'apartment', 10, 11); build(solo, 'apartment', 10, 11);
    advance(assisted, 1); advance(solo, 1);
    expect(getBuilding(assisted, 10, 11)!.progress).toBe(getBuilding(solo, 10, 11)!.progress);
    advance(assisted, 11); advance(solo, 11);
    expect(getBuilding(assisted, 10, 11)!.progress).toBeGreaterThan(getBuilding(solo, 10, 11)!.progress);
    expect(assisted.units[0].task).toBe('building');
    expect(validateWorld(clone(assisted))).toEqual(assisted);
  });

  it('workshops pay for finite goods and trucks physically deliver them to a market', () => {
    const world = base();
    completeBuilding(world, 'power', 2, 2);
    const workshop = completeBuilding(world, 'workshop', 2, 11);
    completeBuilding(world, 'market', 10, 12);
    expect(produceUnit(world, 'truck').ok).toBe(true);
    const before = world.money;
    advance(world, 60);
    expect(world.goodsDelivered).toBeGreaterThan(0);
    expect(world.money - before).toBe(70 + world.goodsDelivered * GOODS_PRICE - 3 * GOODS_COST);
    expect(workshop.stock + world.units[0].cargo + world.goodsDelivered).toBe(3);
    expect(validateWorld(clone(world))).toEqual(world);
  });

  it('loaded trucks cannot sell remotely when their route is blocked', () => {
    const world = base();
    completeBuilding(world, 'power', 2, 2); completeBuilding(world, 'workshop', 2, 11); completeBuilding(world, 'market', 10, 12);
    produceUnit(world, 'truck');
    const truck = world.units[0];
    until(world, () => truck.task === 'to-market');
    enclose(world, truck); advance(world, 60);
    expect(truck.cargo).toBe(1); expect(world.goodsDelivered).toBe(0);
  });

  it('stops workshop production at finite storage capacity', () => {
    const world = base('creative');
    completeBuilding(world, 'power', 2, 2);
    const workshop = completeBuilding(world, 'workshop', 2, 11);
    advance(world, 300); expect(workshop.stock).toBe(10);
    completeBuilding(world, 'warehouse', 10, 12);
    advance(world, 300); expect(workshop.stock).toBe(20);
    demolish(world, getBuilding(world, 10, 12)!.id);
    advance(world, 30); expect(workshop.stock).toBe(20); expect(validateWorld(clone(world))).toEqual(world);
  });
});

describe('fixed time, ending and save equivalence', () => {
  it('clamps oversized deltas, ignores invalid deltas, and preserves substep remainder', () => {
    const world = fresh(), original = clone(world);
    for (const dt of [NaN, Infinity, -Infinity, -1, 0]) stepWorld(world, dt);
    expect(world).toEqual(original);
    stepWorld(world, 0.04); expect(world.time).toBe(0); expect(world.accumulator).toBeCloseTo(0.04);
    stepWorld(world, 0.06); expect(world.time).toBeCloseTo(0.1);
    stepWorld(world, 86_400); expect(world.time).toBeCloseTo(1.1);
  });

  it('produces identical state with equivalent frame partitions', () => {
    const a = miningWorld(), b = clone(a);
    for (let i = 0; i < 300; i++) stepWorld(a, 0.1);
    for (let i = 0; i < 600; i++) stepWorld(b, 0.05);
    expect(a).toEqual(b);
  });

  it('makes every command and step inert after ending a session', () => {
    const world = fresh('classic', 'session');
    deployBase(world); build(world, 'house', 2, 2); produceUnit(world, 'engineer');
    endSession(world);
    const original = clone(world);
    advance(world, 100); stepWorld(world, Infinity);
    expect(build(world, 'house', 10, 11).reason).toBe('ended');
    expect(canBuild(world, 'house', 10, 11).reason).toBe('ended');
    expect(demolish(world, world.buildings[0].id).reason).toBe('ended');
    expect(produceUnit(world, 'engineer').reason).toBe('ended');
    expect(moveUnit(world, world.units[0].id, 10, 11)).toBe(false); expect(deployBase(world)).toBe(false);
    endSession(world); expect(world).toEqual(original);
    expect(validateWorld(clone(world))).toEqual(world);
  });

  it('does not accidentally end homestead mode', () => {
    const world = fresh(); endSession(world); expect(world.status).toBe('playing');
    advance(world, 2); expect(world.time).toBeCloseTo(2);
  });

  it('roundtrips in-flight ore, work, inventory and fractions with exact subsequent economics', () => {
    const original = miningWorld();
    completeBuilding(original, 'workshop', 2, 11); completeBuilding(original, 'market', 10, 12);
    completeBuilding(original, 'house', 2, 6);
    produceUnit(original, 'truck'); produceUnit(original, 'engineer');
    build(original, 'park', 14, 14);
    advance(original, 23.37);
    const saved = clone(original);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 365 * 86_400_000);
    let restored: World;
    try { restored = validateWorld(saved); } finally { clock.mockRestore(); }
    expect(restored!).toEqual(original); expect(restored!.terrain).not.toBe(saved.terrain);
    expect(restored!.units[0].path).not.toBe(saved.units[0].path);
    for (const dt of [0.02, 0.11, 1, 0.87, ...Array<number>(120).fill(1)]) {
      stepWorld(original, dt); stepWorld(restored!, dt);
      expect(restored!).toEqual(original);
    }
  });

  it('purely migrates complete schema-1 state without changing any time or economic number', () => {
    const original = miningWorld();
    completeBuilding(original, 'workshop', 2, 11); completeBuilding(original, 'market', 10, 12);
    completeBuilding(original, 'house', 2, 6); produceUnit(original, 'truck'); produceUnit(original, 'engineer');
    build(original, 'park', 14, 14); advance(original, 23.37);
    const legacy: Record<string, unknown> = clone(original);
    legacy.schemaVersion = 1; delete legacy.source; delete legacy.materialsId;
    const before = clone(legacy);
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => { throw new Error('migration-must-not-read-clock'); });
    let migrated: World;
    try { migrated = validateWorld(legacy); } finally { clock.mockRestore(); }
    expect(legacy).toEqual(before);
    expect(migrated!).toEqual(original);
    expect(migrated!.schemaVersion).toBe(2); expect(migrated!.source).toBeNull(); expect(migrated!.materialsId).toBeNull();
    expect(migrated!.terrain).not.toBe(legacy.terrain); expect(migrated!.units).not.toBe(legacy.units);
    for (const dt of [0.02, 0.11, 1, 0.87, ...Array<number>(60).fill(1)]) {
      stepWorld(original, dt); stepWorld(migrated!, dt);
      expect(migrated!).toEqual(original);
    }
    expect(validateWorld(clone(migrated!))).toEqual(original);
  });

  it('does not repair missing or unexpected legacy fields with invented defaults', () => {
    const legacy: Record<string, unknown> = clone(fresh());
    legacy.schemaVersion = 1; delete legacy.source; delete legacy.materialsId;
    for (const key of ['time', 'money', 'nextId', 'accumulator', 'population', 'incomeRemainder', 'oreDelivered', 'goodsDelivered']) {
      const incomplete = clone(legacy); delete incomplete[key];
      expect(() => validateWorld(incomplete)).toThrow('invalid-world:');
    }
    for (const key of ['source', 'materialsId', 'weapon', 'rgba']) {
      expect(() => validateWorld({ ...legacy, [key]: null })).toThrow('invalid-world:');
    }
    const incompleteUnit = clone(legacy) as { units: Record<string, unknown>[] };
    delete incompleteUnit.units[0].timer;
    expect(() => validateWorld(incompleteUnit)).toThrow('data-required');
  });

  it('validates each in-flight state throughout a multi-unit economy', () => {
    const world = miningWorld('creative');
    completeBuilding(world, 'workshop', 2, 11); completeBuilding(world, 'market', 10, 12);
    produceUnit(world, 'truck'); produceUnit(world, 'engineer');
    build(world, 'apartment', 16, 13);
    for (let i = 0; i < 500; i++) {
      stepWorld(world, 0.1);
      expect(validateWorld(clone(world))).toEqual(world);
    }
  });
});

describe('bounded, hostile save validation and limits', () => {
  const corruptions: [string, (world: World) => void][] = [
    ['schema version', w => { (w as { schemaVersion: number }).schemaVersion = 3; }],
    ['unknown map', w => { w.mapId = 'not-a-map'; }],
    ['oversized dimensions', w => { w.width = 10_000; }],
    ['nonfinite money', w => { w.money = Infinity; }],
    ['negative money', w => { w.money = -1; }],
    ['fractional money', w => { w.money = 0.5; }],
    ['overflow money', w => { w.money = LIMITS.money + 1; }],
    ['nonfinite time', w => { w.time = NaN; }],
    ['negative time', w => { w.time = -1; }],
    ['bad accumulator', w => { w.accumulator = 0.1; }],
    ['bad income remainder', w => { w.incomeRemainder = 1; }],
    ['excess population', w => { w.population = 100; }],
    ['invalid mode', w => { w.mode = 'battle' as never; }],
    ['invalid economy', w => { w.economy = 'infinite' as never; }],
    ['ended homestead', w => { w.status = 'ended'; }],
    ['short terrain', w => { w.terrain.pop(); }],
    ['unknown terrain', w => { w.terrain[0].kind = 'lava' as never; }],
    ['nonfinite height', w => { w.terrain[0].height = NaN; }],
    ['negative ore', w => { w.terrain[0].ore = -1; }],
    ['invented ore', w => { w.terrain[0].ore = 500; }],
    ['oversized name', w => { w.name = 'x'.repeat(81); }],
    ['invalid id', w => { w.id = '../save'; }],
    ['nonmonotonic id', w => { w.nextId = 1; }],
    ['building kind', w => { w.buildings[0].kind = 'cannon' as never; }],
    ['building coordinate', w => { w.buildings[0].x = 0.1; }],
    ['building bounds', w => { w.buildings[0].x = 35; }],
    ['building progress', w => { w.buildings[0].progress = 1.01; }],
    ['building stock', w => { w.buildings[0].stock = 10; }],
    ['building spawn state', w => { w.buildings[0].minerSpawned = true; }],
    ['building overlap', w => { const b = clone(w.buildings[0]); b.id = `b-${w.nextId++}`; w.buildings.push(b); }],
    ['duplicate ids', w => { w.buildings.push(clone(w.buildings[0])); }],
    ['unit kind', w => { w.units[0].kind = 'tank' as never; }],
    ['unit position', w => { w.units[0].x = Infinity; }],
    ['unit blocked', w => { w.units[0].x = 6; w.units[0].y = 6; }],
    ['unit cargo', w => { w.units[0].cargo = 1; }],
    ['unit task', w => { w.units[0].task = 'mining'; }],
    ['unit dangling target', w => { w.units[0].targetId = 'b-999'; }],
    ['unit move remainder', w => { w.units[0].moveProgress = 0.5; }],
    ['too many buildings', w => { w.buildings = Array(LIMITS.buildings + 1).fill(w.buildings[0]); }],
    ['too many units', w => { w.units = Array(LIMITS.units + 1).fill(w.units[0]); }],
    ['weapon state', w => { Object.assign(w.units[0], { weapon: 'rifle' }); }],
  ];
  it.each(corruptions)('rejects %s with a field-specific error', (_name, corrupt) => {
    const world = base(); produceUnit(world, 'engineer');
    corrupt(world);
    expect(() => validateWorld(world)).toThrow(/^invalid-world:/);
  });

  it('rejects non-objects, cycles, exotic prototypes, sparse arrays and accessor side effects', () => {
    for (const input of [null, 3, [], 'save', undefined]) expect(() => validateWorld(input)).toThrow('invalid-world:');
    const cycle = fresh(); Object.assign(cycle, { weapon: cycle });
    expect(() => validateWorld(cycle)).toThrow('unexpected-fields');
    const prototype = fresh(); Object.setPrototypeOf(prototype, { money: 1 });
    expect(() => validateWorld(prototype)).toThrow('plain-object-required');
    const sparse = fresh(); delete (sparse.terrain as unknown[])[0];
    expect(() => validateWorld(sparse)).toThrow('sparse-or-extra-fields');
    const getter = vi.fn(() => 999), accessor = fresh();
    Object.defineProperty(accessor, 'money', { get: getter });
    expect(() => validateWorld(accessor)).toThrow('data-required'); expect(getter).not.toHaveBeenCalled();
  });

  it('rejects diagonal, looping, remote and dangling routes', () => {
    const source = fresh(); moveUnit(source, source.units[0].id, 12, 6);
    for (const corrupt of [
      (u: Unit) => { u.path[0] = { x: 8, y: 7 }; },
      (u: Unit) => { u.path[1] = { x: 6, y: 6 }; },
      (u: Unit) => { u.target = { x: 13, y: 6 }; },
      (u: Unit) => { u.path = []; },
      (u: Unit) => { u.targetId = 'b-20'; },
    ]) {
      const world = clone(source); corrupt(world.units[0]);
      expect(() => validateWorld(world)).toThrow('invalid-world:');
    }
  });

  it('enforces build, unit and monotonic ID limits before mutation', () => {
    const world = base('creative');
    const existing = world.buildings[0];
    world.buildings = Array(LIMITS.buildings).fill(existing);
    expect(build(world, 'tree', 2, 2).reason).toBe('building-limit');
    world.buildings = [existing];
    produceUnit(world, 'engineer');
    world.units = Array(LIMITS.units).fill(world.units[0]);
    expect(produceUnit(world, 'engineer').reason).toBe('unit-limit');
    world.units = []; world.nextId = LIMITS.nextId;
    expect(build(world, 'tree', 2, 2).reason).toBe('id-limit');
    expect(produceUnit(world, 'engineer').reason).toBe('id-limit');
  });
});
