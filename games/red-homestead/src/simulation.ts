import {
  BUILDINGS, BUILDING_KINDS, UNITS, UNIT_KINDS, LIMITS, FIXED_STEP, MAX_DELTA,
  MINER_CAPACITY, ORE_PRICE, GOODS_COST, GOODS_PRICE, GOODS_TIME,
} from './content.js';
import { createTerrain, getMap } from './maps.js';
import type { ClassicMapData } from './classicTypes.js';
import type {
  ActionCode, ActionResult, Building, BuildingKind, CreateImportedWorldOptions, CreateWorldOptions, Point,
  TerrainCell, Unit, UnitKind, UnitTask, World, WorldSource, WorldStats,
} from './types.js';
export type * from './types.js';

const EPSILON = 1e-9;
let worldSequence = 0;
const result = (reason: ActionCode = 'ok'): ActionResult => ({ ok: reason === 'ok', reason });
const buildingKind = (kind: unknown): kind is BuildingKind => typeof kind === 'string' && BUILDING_KINDS.includes(kind as BuildingKind);
const unitKind = (kind: unknown): kind is UnitKind => typeof kind === 'string' && UNIT_KINDS.includes(kind as UnitKind);
const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
const inside = (world: World, x: number, y: number) => x >= 0 && y >= 0 && x < world.width && y < world.height;
const integerPoint = (x: number, y: number) => Number.isSafeInteger(x) && Number.isSafeInteger(y);
const cellIndex = (world: World, point: Point) => point.y * world.width + point.x;
const complete = (building: Building) => building.progress === 1;
const impassable = (cell: TerrainCell) => cell.kind === 'water' || cell.kind === 'rock' || cell.kind === 'void';
/** Conservative first-pass TMP navigation: ramp presence, not the ramp's directional artwork.
 * Both directions are allowed on a one-level ramp; a straight cliff or >1 level is never crossed.
 */
function heightStep(world: World, from: number, to: number): boolean {
  const a = world.terrain[from], b = world.terrain[to], difference = Math.abs(a.height - b.height);
  return difference === 0 || (difference === 1 && ((a.ramp ?? 0) > 0 || (b.ramp ?? 0) > 0));
}
const addMoney = (world: World, amount: number) => { world.money = Math.min(LIMITS.money, world.money + amount); };
const pay = (world: World, amount: number) => { if (world.economy === 'classic') world.money -= amount; };
const canPay = (world: World, amount: number) => world.economy === 'creative' || world.money >= amount;

function newBuilding(world: World, kind: BuildingKind, x: number, y: number, progress = 0): Building {
  return { id: `b-${world.nextId++}`, kind, x, y, progress, minerSpawned: false, stock: 0, productionProgress: 0 };
}
function newUnit(world: World, kind: UnitKind, point: Point): Unit {
  return { id: `u-${world.nextId++}`, kind, ...point, task: 'idle', path: [], moveProgress: 0, timer: 0, cargo: 0, target: null, targetId: null };
}

function creationOptions(options: CreateImportedWorldOptions): void {
  if (!options || (options.mode !== 'session' && options.mode !== 'homestead')) throw new Error('invalid-mode');
  if (options.economy !== 'classic' && options.economy !== 'creative') throw new Error('invalid-economy');
  if (options.name !== undefined && (typeof options.name !== 'string' || !options.name.trim() || options.name.length > 80 || /[\u0000-\u001f\u007f]/.test(options.name))) throw new Error('invalid-name');
}

function initialWorld(options: CreateImportedWorldOptions, mapId: string, label: string, width: number, height: number,
  terrain: TerrainCell[], spawn: Point, source: WorldSource | null): World {
  const world: World = {
    schemaVersion: 2, source, materialsId: source?.bundleId ?? null,
    id: `rh-${mapId}-${Date.now().toString(36)}-${++worldSequence}`, name: options.name?.trim() ?? label.slice(0, 80),
    mode: options.mode, economy: options.economy, mapId, time: 0, status: 'playing', money: 6000,
    nextId: 1, width, height, terrain, buildings: [], units: [],
    accumulator: 0, population: 0, incomeRemainder: 0, oreDelivered: 0, goodsDelivered: 0,
  };
  world.units.push(newUnit(world, 'mcv', spawn));
  return world;
}

export function createWorld(options: CreateWorldOptions): World {
  creationOptions(options);
  const map = getMap(options.mapId);
  if (!map) throw new Error('invalid-map');
  return initialWorld(options, map.id, map.labelEn, map.width, map.height, createTerrain(map), map.spawn, null);
}

/** Accept compiler-verified map geometry, never retain its tiles, RGBA or source files.
 * The original map coordinates remain the simulation grid coordinates, including void margins.
 * Asset-cache availability is a presentation concern; a valid save alone cannot restore its artwork.
 */
export function createImportedWorld(options: CreateImportedWorldOptions, map: ClassicMapData, bundleId: string): World {
  creationOptions(options);
  const data = record(map, ['width', 'height', 'terrain', 'tiles', 'spawn', 'theater', 'title', 'rawMapHash'], 'map');
  const width = number(data.width, 4, 256, 'map.width', true), height = number(data.height, 4, 256, 'map.height', true);
  const source = worldSource({ kind: 'ra2-local', bundleId, mapHash: data.rawMapHash, label: data.title, theater: data.theater });
  const terrain = terrainCells(data.terrain, width * height);
  const spawn = point(data.spawn, { width, height }, 'map.spawn');
  if (impassable(terrain[spawn.y * width + spawn.x])) invalid('map.spawn', 'blocked-terrain');
  return initialWorld(options, `ra2-${source.mapHash}`, source.label, width, height, terrain, spawn, source);
}

export function getBuilding(world: World, x: number, y: number): Building | undefined {
  return world.buildings.find(building => {
    const size = BUILDINGS[building.kind].footprint;
    return x >= building.x && y >= building.y && x < building.x + size.width && y < building.y + size.height;
  });
}

function placement(world: World, kind: BuildingKind, x: number, y: number, ignoreUnit?: string): ActionResult {
  if (!integerPoint(x, y)) return result('invalid-position');
  const definition = BUILDINGS[kind];
  const { width, height } = definition.footprint;
  if (!inside(world, x, y) || !inside(world, x + width - 1, y + height - 1)) return result('out-of-bounds');
  let shore = false;
  for (let dy = 0; dy < height; dy++) for (let dx = 0; dx < width; dx++) {
    const px = x + dx, py = y + dy;
    const cell = world.terrain[py * world.width + px];
    if (impassable(cell) || cell.ore > 0 || (cell.kind === 'road' && kind !== 'road')
      || cell.height !== world.terrain[y * world.width + x].height) return result('blocked-terrain');
    if (getBuilding(world, px, py)) return result('occupied');
    if (!definition.walkable && world.units.some(unit => unit.id !== ignoreUnit && unit.x === px && unit.y === py)) return result('unit-in-way');
    for (const [nx, ny] of [[px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]]) {
      if (inside(world, nx, ny) && world.terrain[ny * world.width + nx].kind === 'water') shore = true;
    }
  }
  return result(kind === 'harbor' && !shore ? 'needs-shore' : 'ok');
}

export function canBuild(world: World, kind: BuildingKind, x: number, y: number): ActionResult {
  if (world.status !== 'playing') return result('ended');
  if (!buildingKind(kind)) return result('invalid-kind');
  if (kind === 'yard') return result('deploy-mcv');
  if (world.buildings.length >= LIMITS.buildings) return result('building-limit');
  if (world.nextId >= LIMITS.nextId) return result('id-limit');
  if (!world.buildings.some(building => building.kind === 'yard' && complete(building))) return result('needs-yard');
  const space = placement(world, kind, x, y);
  if (!space.ok) return space;
  return result(canPay(world, BUILDINGS[kind].cost) ? 'ok' : 'insufficient-funds');
}

export function build(world: World, kind: BuildingKind, x: number, y: number): ActionResult {
  const check = canBuild(world, kind, x, y);
  if (!check.ok) return check;
  pay(world, BUILDINGS[kind].cost);
  world.buildings.push(newBuilding(world, kind, x, y));
  return result();
}

export function demolish(world: World, id: string): ActionResult {
  if (world.status !== 'playing') return result('ended');
  const index = world.buildings.findIndex(building => building.id === id);
  if (index < 0) return result('not-found');
  const building = world.buildings[index];
  world.buildings.splice(index, 1);
  if (world.economy === 'classic') addMoney(world, Math.floor(BUILDINGS[building.kind].cost * 0.5));
  // Save files must not retain dangling target references after a synchronous command.
  for (const unit of world.units) if (unit.targetId === id) resetUnit(unit);
  world.population = Math.min(world.population, getStats(world).capacity);
  return result();
}

export function endSession(world: World): void {
  if (world.mode === 'session') world.status = 'ended';
}

export function getStats(world: World): WorldStats {
  let powerProduced = 0, powerUsed = 0, capacity = 0, amenity = 0;
  for (const building of world.buildings) if (complete(building)) {
    const data = BUILDINGS[building.kind];
    powerProduced += data.powerProduced; powerUsed += data.powerUsed; capacity += data.capacity;
    amenity += data.happiness;
  }
  const power = powerUsed === 0 ? 1 : Math.min(1, powerProduced / powerUsed);
  const population = Math.min(capacity, Math.floor(world.population));
  const happiness = Math.round(Math.max(10, Math.min(100, 55 + amenity - (1 - power) * 30)));
  let income = population * 1.8 * (0.5 + happiness / 200);
  for (const building of world.buildings) if (complete(building)) {
    const data = BUILDINGS[building.kind];
    income += data.income * (data.powerUsed === 0 ? 1 : power);
  }
  return { money: world.money, powerProduced, powerUsed, population, capacity, happiness, income };
}

function powerRatio(world: World): number {
  const stats = getStats(world);
  return stats.powerUsed === 0 ? 1 : Math.min(1, stats.powerProduced / stats.powerUsed);
}

/** Fresh occupancy per command/tick: public worlds remain mutable, so no stale blocked-grid cache.
 * Within a tick all units share this grid. Units do not block one another.
 */
function blockedGrid(world: World): Uint8Array {
  const blocked = new Uint8Array(world.terrain.length);
  for (let i = 0; i < blocked.length; i++) {
    if (impassable(world.terrain[i])) blocked[i] = 1;
  }
  for (const building of world.buildings) {
    const data = BUILDINGS[building.kind];
    if (data.walkable) continue;
    for (let y = building.y; y < building.y + data.footprint.height; y++) {
      for (let x = building.x; x < building.x + data.footprint.width; x++) blocked[y * world.width + x] = 1;
    }
  }
  return blocked;
}

interface Route { point: Point; path: Point[] }
interface SearchScratch { previous: Int32Array; queue: Int32Array; seen: Uint32Array; stamp: number }
// Scratch only, never cached geometry/routes: no save fields or invalidation contract is needed.
const searches = new WeakMap<World, SearchScratch>();
function routeTo(world: World, start: Point, goal: (index: number) => boolean, blocked = blockedGrid(world)): Route | null {
  if (!integerPoint(start.x, start.y) || !inside(world, start.x, start.y)) return null;
  const origin = cellIndex(world, start);
  if (blocked[origin]) return null;
  let scratch = searches.get(world);
  if (!scratch || scratch.queue.length !== blocked.length) {
    scratch = { previous: new Int32Array(blocked.length), queue: new Int32Array(blocked.length), seen: new Uint32Array(blocked.length), stamp: 0 };
    searches.set(world, scratch);
  }
  if (scratch.stamp === 0xffffffff) { scratch.seen.fill(0); scratch.stamp = 0; }
  const stamp = ++scratch.stamp, { previous, queue, seen } = scratch;
  let head = 0, tail = 1;
  queue[0] = origin; previous[origin] = origin; seen[origin] = stamp;
  while (head < tail) {
    const current = queue[head++];
    const x = current % world.width, y = Math.floor(current / world.width);
    if (goal(current)) {
      const path: Point[] = [];
      let back = current;
      while (back !== origin) {
        path.push({ x: back % world.width, y: Math.floor(back / world.width) });
        back = previous[back];
      }
      path.reverse();
      return { point: { x, y }, path };
    }
    // No per-visited-cell arrays/Point objects: bounded O(width*height) work on 256² maps.
    for (let direction = 0; direction < 4; direction++) {
      let index: number;
      if (direction === 0) { if (x + 1 === world.width) continue; index = current + 1; }
      else if (direction === 1) { if (y + 1 === world.height) continue; index = current + world.width; }
      else if (direction === 2) { if (x === 0) continue; index = current - 1; }
      else { if (y === 0) continue; index = current - world.width; }
      if (blocked[index] || seen[index] === stamp || !heightStep(world, current, index)) continue;
      previous[index] = current; seen[index] = stamp; queue[tail++] = index;
    }
  }
  return null;
}

/** Read-only orthogonal path, excluding start; [] when already there, null if invalid/unreachable.
 * It does not command units, change world state, cache occupancy, or serialize scratch memory.
 */
export function findPath(world: World, start: Point, target: Point): Point[] | null {
  if (!integerPoint(target.x, target.y) || !inside(world, target.x, target.y)) return null;
  const destination = cellIndex(world, target), blocked = blockedGrid(world);
  if (blocked[destination]) return null;
  return routeTo(world, start, index => index === destination, blocked)?.path ?? null;
}

function perimeter(world: World, building: Building): Point[] {
  const { width, height } = BUILDINGS[building.kind].footprint;
  const points: Point[] = [];
  for (let x = building.x; x < building.x + width; x++) {
    points.push({ x, y: building.y - 1 }, { x, y: building.y + height });
  }
  for (let y = building.y; y < building.y + height; y++) {
    points.push({ x: building.x - 1, y }, { x: building.x + width, y });
  }
  return points.filter(point => {
    if (!inside(world, point.x, point.y)) return false;
    const inner = {
      x: Math.max(building.x, Math.min(building.x + width - 1, point.x)),
      y: Math.max(building.y, Math.min(building.y + height - 1, point.y)),
    };
    // A neighboring tile across a cliff is not a door, delivery dock or engineer work site.
    return !impassable(world.terrain[cellIndex(world, point)]) && heightStep(world, cellIndex(world, inner), cellIndex(world, point));
  });
}
const adjacent = (world: World, unit: Point, building: Building) => perimeter(world, building).some(point => same(point, unit));
function spawnPoint(world: World, building: Building, blocked = blockedGrid(world)): Point | undefined {
  return perimeter(world, building).find(point => !blocked[cellIndex(world, point)] && !world.units.some(unit => same(unit, point)));
}

export function deployBase(world: World): boolean {
  if (world.status !== 'playing' || world.buildings.length >= LIMITS.buildings || world.nextId >= LIMITS.nextId) return false;
  const mcv = world.units.find(unit => unit.kind === 'mcv');
  if (!mcv || !placement(world, 'yard', mcv.x, mcv.y, mcv.id).ok) return false;
  world.units.splice(world.units.indexOf(mcv), 1);
  world.buildings.push(newBuilding(world, 'yard', mcv.x, mcv.y, 1));
  return true;
}

export function produceUnit(world: World, kind: UnitKind): ActionResult {
  if (world.status !== 'playing') return result('ended');
  if (!unitKind(kind)) return result('invalid-kind');
  if (world.units.length >= LIMITS.units) return result('unit-limit');
  if (world.nextId >= LIMITS.nextId) return result('id-limit');
  const data = UNITS[kind];
  const producers = world.buildings.filter(building => building.kind === data.producer && complete(building));
  if (producers.length === 0) return result('needs-producer');
  if (!canPay(world, data.cost)) return result('insufficient-funds');
  const blocked = blockedGrid(world);
  for (const producer of producers) {
    const point = spawnPoint(world, producer, blocked);
    if (!point) continue;
    pay(world, data.cost);
    world.units.push(newUnit(world, kind, point));
    return result();
  }
  return result('no-exit');
}

function resetUnit(unit: Unit, retry = 0): void {
  unit.task = 'idle'; unit.path = []; unit.moveProgress = 0; unit.timer = retry; unit.target = null; unit.targetId = null;
}

export function moveUnit(world: World, id: string, x: number, y: number): boolean {
  if (world.status !== 'playing' || !integerPoint(x, y) || !inside(world, x, y)) return false;
  const unit = world.units.find(candidate => candidate.id === id);
  if (!unit) return false;
  const destination = y * world.width + x, blocked = blockedGrid(world);
  if (blocked[destination]) return false;
  const route = routeTo(world, unit, index => index === destination, blocked);
  if (!route) return false;
  resetUnit(unit);
  if (route.path.length > 0) { unit.task = 'move'; unit.path = route.path; unit.target = route.point; }
  return true;
}

function assignRoute(unit: Unit, route: Route, travelling: UnitTask, arrived: UnitTask, targetId: string | null): void {
  unit.path = route.path; unit.target = route.point; unit.targetId = targetId;
  unit.task = route.path.length > 0 ? travelling : arrived; unit.timer = 0; unit.moveProgress = 0;
}

function routeBuilding(world: World, unit: Unit, predicate: (building: Building) => boolean, travelling: UnitTask, arrived: UnitTask, blocked: Uint8Array): boolean {
  const goals = new Map<number, Building>();
  for (const building of world.buildings) if (predicate(building)) {
    for (const point of perimeter(world, building)) {
      const index = cellIndex(world, point);
      if (!blocked[index] && !goals.has(index)) goals.set(index, building);
    }
  }
  if (goals.size === 0) return false;
  const route = routeTo(world, unit, index => goals.has(index), blocked);
  if (!route) return false;
  assignRoute(unit, route, travelling, arrived, goals.get(cellIndex(world, route.point))!.id);
  return true;
}

function planWork(world: World, unit: Unit, blocked: Uint8Array): void {
  let assigned = false;
  if (unit.kind === 'miner') {
    if (unit.cargo > 0) assigned = routeBuilding(world, unit, b => b.kind === 'refinery' && complete(b), 'to-refinery', 'unloading', blocked);
    else if (world.buildings.some(b => b.kind === 'refinery' && complete(b))) {
      const route = routeTo(world, unit, index => world.terrain[index].ore > 0, blocked);
      if (route) { assignRoute(unit, route, 'to-ore', 'mining', null); assigned = true; }
    }
  } else if (unit.kind === 'engineer') {
    assigned = routeBuilding(world, unit, b => !complete(b), 'to-build', 'building', blocked);
  } else if (unit.kind === 'truck') {
    assigned = unit.cargo > 0
      ? routeBuilding(world, unit, b => b.kind === 'market' && complete(b), 'to-market', 'delivering', blocked)
      : routeBuilding(world, unit, b => b.kind === 'workshop' && complete(b) && b.stock > 0, 'to-workshop', 'loading', blocked);
  }
  if (!assigned) resetUnit(unit, 2);
}

const arrival: Partial<Record<UnitTask, UnitTask>> = {
  move: 'idle', 'to-ore': 'mining', 'to-refinery': 'unloading', 'to-build': 'building', 'to-workshop': 'loading', 'to-market': 'delivering',
};
function tickUnit(world: World, unit: Unit, dt: number, blocked: Uint8Array, power: number): void {
  if (unit.path.length > 0) {
    const next = unit.path[0];
    if (blocked[cellIndex(world, next)] || !heightStep(world, cellIndex(world, unit), cellIndex(world, next))) {
      // A construction command may invalidate a previously queued route, but never teleport a unit.
      if (unit.task === 'move' && unit.target) {
        const target = { ...unit.target };
        if (!moveUnit(world, unit.id, target.x, target.y)) resetUnit(unit, 1);
      } else resetUnit(unit, 0.5);
      return;
    }
    const road = world.terrain[cellIndex(world, unit)].kind === 'road'
      || world.buildings.some(b => b.kind === 'road' && complete(b) && same(b, unit));
    unit.moveProgress += dt * UNITS[unit.kind].speed * (road ? 1.5 : 1);
    if (unit.moveProgress + EPSILON >= 1) {
      unit.x = next.x; unit.y = next.y; unit.path.shift(); unit.moveProgress = Math.max(0, unit.moveProgress - 1);
      if (unit.path.length === 0) {
        const arrived = arrival[unit.task] ?? 'idle';
        unit.moveProgress = 0; unit.timer = 0;
        if (arrived === 'idle') resetUnit(unit); else unit.task = arrived;
      }
    }
    return;
  }
  if (unit.task === 'idle') {
    unit.timer = Math.max(0, unit.timer - dt);
    if (unit.timer <= EPSILON && unit.kind !== 'mcv') planWork(world, unit, blocked);
    return;
  }
  if (unit.task === 'mining') {
    const cell = world.terrain[cellIndex(world, unit)];
    if (!unit.target || !same(unit, unit.target) || cell.ore === 0 || unit.cargo >= MINER_CAPACITY) { resetUnit(unit); return; }
    unit.timer += dt;
    if (unit.timer + EPSILON >= 0.5) {
      const amount = Math.min(2, cell.ore, MINER_CAPACITY - unit.cargo);
      cell.ore -= amount; unit.cargo += amount; unit.timer = Math.max(0, unit.timer - 0.5);
      if (cell.ore === 0 || unit.cargo === MINER_CAPACITY) resetUnit(unit);
    }
    return;
  }
  const target = world.buildings.find(b => b.id === unit.targetId);
  if (!target || !adjacent(world, unit, target)) { resetUnit(unit); return; }
  if (unit.task === 'building') {
    if (complete(target)) resetUnit(unit);
    return;
  }
  if (!complete(target)) { resetUnit(unit); return; }
  unit.timer += dt * power;
  if (unit.timer + EPSILON < 1) return;
  if (unit.task === 'unloading' && target.kind === 'refinery') {
    addMoney(world, unit.cargo * ORE_PRICE);
    world.oreDelivered = Math.min(LIMITS.money, world.oreDelivered + unit.cargo);
    unit.cargo = 0;
  } else if (unit.task === 'loading' && target.kind === 'workshop') {
    if (target.stock > 0 && unit.cargo === 0) { target.stock--; unit.cargo = 1; }
  } else if (unit.task === 'delivering' && target.kind === 'market') {
    addMoney(world, unit.cargo * GOODS_PRICE);
    world.goodsDelivered = Math.min(LIMITS.money, world.goodsDelivered + unit.cargo);
    unit.cargo = 0;
  }
  resetUnit(unit);
}

function fixedTick(world: World): void {
  const dt = FIXED_STEP;
  world.time = Math.min(LIMITS.time, world.time + dt);
  const power = powerRatio(world);
  // Construction completion changes neither footprints nor walkability. Share one occupancy
  // snapshot across deferred refinery spawns and every route search in this fixed tick.
  const blocked = blockedGrid(world);
  for (const building of world.buildings) {
    if (!complete(building)) {
      const data = BUILDINGS[building.kind];
      const helpers = world.units.filter(unit => unit.kind === 'engineer' && unit.task === 'building'
        && unit.targetId === building.id && adjacent(world, unit, building)).length;
      const speed = (data.essential ? 1 : Math.max(0.25, power)) * (1 + Math.min(helpers, 2) * 0.5);
      building.progress = Math.min(1, building.progress + dt * speed / data.buildTime);
      if (building.progress > 1 - EPSILON) building.progress = 1;
    }
    if (!complete(building)) continue;
    if (building.kind === 'refinery' && !building.minerSpawned && world.units.length < LIMITS.units && world.nextId < LIMITS.nextId) {
      const point = spawnPoint(world, building, blocked);
      if (point) { world.units.push(newUnit(world, 'miner', point)); building.minerSpawned = true; }
    }
    if (building.kind === 'workshop') {
      const storage = world.buildings.some(b => b.kind === 'warehouse' && complete(b)) ? 20 : 10;
      if (building.stock < storage && canPay(world, GOODS_COST)) {
        building.productionProgress += dt * power;
        if (building.productionProgress + EPSILON >= GOODS_TIME) {
          pay(world, GOODS_COST); building.stock++; building.productionProgress = Math.max(0, building.productionProgress - GOODS_TIME);
        }
      }
    }
  }
  for (const unit of world.units) tickUnit(world, unit, dt, blocked, power);
  const stats = getStats(world);
  const growth = dt * (stats.happiness / 100) * 0.8;
  world.population = Math.min(stats.capacity, world.population + growth);
  world.incomeRemainder += stats.income * dt / 60;
  const credit = Math.floor(world.incomeRemainder + EPSILON);
  if (credit > 0) { addMoney(world, credit); world.incomeRemainder = Math.max(0, world.incomeRemainder - credit); }
}

/** Seconds only. A large/resumed frame advances at most one second, never offline catch-up. */
export function stepWorld(world: World, dt: number): void {
  if (world.status !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
  world.accumulator += Math.min(MAX_DELTA, dt);
  let steps = 0;
  while (world.accumulator + EPSILON >= FIXED_STEP && steps < MAX_DELTA / FIXED_STEP + 1) {
    world.accumulator = Math.max(0, world.accumulator - FIXED_STEP);
    fixedTick(world); steps++;
  }
}

// Save validation is deliberately independent of browser storage and JSON parsing.
function invalid(path: string, reason: string): never { throw new Error(`invalid-world:${path}:${reason}`); }
function record(input: unknown, keys: readonly string[], path: string, optional: readonly string[] = []): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid(path, 'object-required');
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) invalid(path, 'plain-object-required');
  const own = Reflect.ownKeys(input);
  if (own.some(key => typeof key !== 'string' || (!keys.includes(key) && !optional.includes(key)))) invalid(path, 'unexpected-fields');
  for (const key of [...keys, ...optional.filter(key => Object.prototype.hasOwnProperty.call(input, key))]) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !('value' in descriptor)) invalid(`${path}.${key}`, 'data-required');
  }
  return input as Record<string, unknown>;
}
function list(input: unknown, max: number, path: string): unknown[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype || input.length > max) invalid(path, 'bounded-array-required');
  if (Reflect.ownKeys(input).length !== input.length + 1) invalid(path, 'sparse-or-extra-fields');
  for (let i = 0; i < input.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(i));
    if (!descriptor || !('value' in descriptor)) invalid(`${path}[${i}]`, 'data-required');
  }
  return input;
}
function number(input: unknown, min: number, max: number, path: string, integer = false): number {
  if (typeof input !== 'number' || !Number.isFinite(input) || input < min || input > max || (integer && !Number.isSafeInteger(input))) invalid(path, 'number-out-of-range');
  return input;
}
function text(input: unknown, max: number, path: string): string {
  if (typeof input !== 'string' || input.length === 0 || input.length > max || !input.trim() || /[\u0000-\u001f\u007f]/.test(input)) invalid(path, 'invalid-string');
  return input;
}
function oneOf<T extends string>(input: unknown, choices: readonly T[], path: string): T {
  if (typeof input !== 'string' || !choices.includes(input as T)) invalid(path, 'unknown-value');
  return input as T;
}
function boolean(input: unknown, path: string): boolean {
  if (typeof input !== 'boolean') invalid(path, 'boolean-required');
  return input;
}
function point(input: unknown, world: Pick<World, 'width' | 'height'>, path: string): Point {
  const data = record(input, ['x', 'y'], path);
  return { x: number(data.x, 0, world.width - 1, `${path}.x`, true), y: number(data.y, 0, world.height - 1, `${path}.y`, true) };
}
function fingerprint(input: unknown, path: string): string {
  if (typeof input !== 'string' || !/^[a-f0-9]{64}$/.test(input)) invalid(path, 'invalid-sha256');
  return input;
}
function worldSource(input: unknown): WorldSource {
  const source = record(input, ['kind', 'bundleId', 'mapHash', 'label', 'theater'], 'source');
  return {
    kind: oneOf(source.kind, ['ra2-local'], 'source.kind'),
    bundleId: fingerprint(source.bundleId, 'source.bundleId'), mapHash: fingerprint(source.mapHash, 'source.mapHash'),
    label: text(source.label, 120, 'source.label'),
    theater: oneOf(source.theater, ['TEMPERATE', 'SNOW', 'URBAN', 'NEWURBAN', 'DESERT', 'LUNAR'], 'source.theater'),
  };
}
function terrainCells(input: unknown, size: number, original?: TerrainCell[], legacy = false): TerrainCell[] {
  const terrain = list(input, size, 'terrain');
  if (terrain.length !== size) invalid('terrain', 'wrong-length');
  return terrain.map((inputCell, i): TerrainCell => {
    const path = `terrain[${i}]`, cell = record(inputCell, ['kind', 'height', 'ore'], path, legacy ? [] : ['ramp']);
    const result: TerrainCell = {
      kind: oneOf(cell.kind, ['grass', 'snow', 'water', 'rock', 'road', 'ore', 'sand', 'void'], `${path}.kind`),
      height: number(cell.height, 0, 15, `${path}.height`, true),
      ore: number(cell.ore, 0, original ? original[i].ore : 100_000, `${path}.ore`, true),
    };
    if (Object.prototype.hasOwnProperty.call(cell, 'ramp')) result.ramp = number(cell.ramp, 0, 20, `${path}.ramp`, true);
    if (result.kind !== 'ore' && result.ore !== 0) invalid(path, 'non-ore-resource');
    if (original && (result.kind !== original[i].kind || result.height !== original[i].height || result.ramp !== original[i].ramp)) invalid(path, 'map-mismatch');
    return result;
  });
}
const WORLD_KEYS = ['schemaVersion', 'id', 'name', 'mode', 'economy', 'mapId', 'time', 'status', 'money', 'nextId', 'width', 'height', 'terrain', 'buildings', 'units', 'accumulator', 'population', 'incomeRemainder', 'oreDelivered', 'goodsDelivered'];
const BUILDING_KEYS = ['id', 'kind', 'x', 'y', 'progress', 'minerSpawned', 'stock', 'productionProgress'];
const UNIT_KEYS = ['id', 'kind', 'x', 'y', 'task', 'path', 'moveProgress', 'timer', 'cargo', 'target', 'targetId'];
const TASKS: Readonly<Record<UnitKind, readonly UnitTask[]>> = {
  mcv: ['idle', 'move'],
  miner: ['idle', 'move', 'to-ore', 'mining', 'to-refinery', 'unloading'],
  engineer: ['idle', 'move', 'to-build', 'building'],
  truck: ['idle', 'move', 'to-workshop', 'loading', 'to-market', 'delivering'],
};

/** Validate an untrusted parsed save, reject unknown/weapon state, and return a detached clone.
 * All fixed-step/economic remainders survive exactly. No wall clock or offline progress is read.
 * Schema 1 is migrated purely to schema 2 with null source/materialsId; no missing state is defaulted.
 * Builtin terrain must match its authored map; only its finite ore amounts may decrease.
 * Imported geometry is self-contained and bounded, not authenticated by an unavailable asset cache.
 * A queued path may cross a newly placed building: the next tick safely replans it.
 */
export function validateWorld(input: unknown): World {
  const data = record(input, WORLD_KEYS, 'world', ['source', 'materialsId']);
  if (data.schemaVersion !== 1 && data.schemaVersion !== 2) invalid('schemaVersion', 'unsupported-version');
  const legacy = data.schemaVersion === 1;
  for (const key of ['source', 'materialsId']) {
    if (legacy && Object.prototype.hasOwnProperty.call(data, key)) invalid(key, 'unexpected-fields');
    if (!legacy && !Object.prototype.hasOwnProperty.call(data, key)) invalid(key, 'data-required');
  }
  const source = legacy || data.source === null ? null : worldSource(data.source);
  const materialsId = legacy || data.materialsId === null ? null : fingerprint(data.materialsId, 'materialsId');
  if (source && materialsId !== source.bundleId) invalid('materialsId', 'source-mismatch');
  const mapId = text(data.mapId, 68, 'mapId'), map = source === null ? getMap(mapId) : undefined;
  if (source === null && !map) invalid('mapId', 'unknown-map');
  if (source && mapId !== `ra2-${source.mapHash}`) invalid('mapId', 'source-mismatch');
  const width = number(data.width, map ? map.width : 4, map ? map.width : 256, 'width', true);
  const height = number(data.height, map ? map.height : 4, map ? map.height : 256, 'height', true);
  const id = text(data.id, 100, 'id');
  if (!/^[a-z0-9-]+$/.test(id)) invalid('id', 'invalid-id');
  const world: World = {
    schemaVersion: 2, source, materialsId, id, name: text(data.name, 80, 'name'),
    mode: oneOf(data.mode, ['session', 'homestead'], 'mode'),
    economy: oneOf(data.economy, ['classic', 'creative'], 'economy'), mapId,
    time: number(data.time, 0, LIMITS.time, 'time'), status: oneOf(data.status, ['playing', 'ended'], 'status'),
    money: number(data.money, 0, LIMITS.money, 'money', true), nextId: number(data.nextId, 1, LIMITS.nextId, 'nextId', true),
    width, height, terrain: [], buildings: [], units: [],
    accumulator: number(data.accumulator, 0, FIXED_STEP - Number.EPSILON, 'accumulator'),
    population: number(data.population, 0, LIMITS.buildings * 48, 'population'),
    incomeRemainder: number(data.incomeRemainder, 0, 1 - Number.EPSILON, 'incomeRemainder'),
    oreDelivered: number(data.oreDelivered, 0, LIMITS.money, 'oreDelivered', true),
    goodsDelivered: number(data.goodsDelivered, 0, LIMITS.money, 'goodsDelivered', true),
  };
  if (world.mode === 'homestead' && world.status === 'ended') invalid('status', 'homestead-cannot-end');
  world.terrain = terrainCells(data.terrain, width * height, map ? createTerrain(map) : undefined, legacy);
  const ids = new Set<string>();
  let largestId = 0;
  const entityId = (inputId: unknown, prefix: 'b' | 'u', path: string) => {
    const value = text(inputId, 24, path);
    if (!(prefix === 'b' ? /^b-[1-9]\d*$/ : /^u-[1-9]\d*$/).test(value)) invalid(path, 'invalid-id');
    const suffix = Number(value.slice(2));
    if (!Number.isSafeInteger(suffix) || suffix >= world.nextId) invalid(path, 'nonmonotonic-id');
    // Numeric suffixes also share one namespace, not only full string IDs.
    if (ids.has(String(suffix))) invalid(path, 'duplicate-id');
    ids.add(String(suffix)); largestId = Math.max(largestId, suffix);
    return value;
  };
  const occupied = new Uint8Array(width * height);
  world.buildings = list(data.buildings, LIMITS.buildings, 'buildings').map((inputBuilding, i): Building => {
    const path = `buildings[${i}]`, b = record(inputBuilding, BUILDING_KEYS, path);
    const kind = oneOf(b.kind, BUILDING_KINDS, `${path}.kind`), definition = BUILDINGS[kind];
    const building: Building = {
      id: entityId(b.id, 'b', `${path}.id`), kind,
      x: number(b.x, 0, width - definition.footprint.width, `${path}.x`, true),
      y: number(b.y, 0, height - definition.footprint.height, `${path}.y`, true),
      progress: number(b.progress, 0, 1, `${path}.progress`), minerSpawned: boolean(b.minerSpawned, `${path}.minerSpawned`),
      stock: number(b.stock, 0, 20, `${path}.stock`, true),
      productionProgress: number(b.productionProgress, 0, GOODS_TIME - Number.EPSILON * 16, `${path}.productionProgress`),
    };
    if ((kind !== 'refinery' || !complete(building)) && building.minerSpawned) invalid(path, 'invalid-miner-spawn');
    if ((kind !== 'workshop' || !complete(building)) && (building.stock !== 0 || building.productionProgress !== 0)) invalid(path, 'invalid-production');
    if (kind === 'yard' && !complete(building)) invalid(path, 'invalid-yard');
    let shore = false;
    for (let dy = 0; dy < definition.footprint.height; dy++) for (let dx = 0; dx < definition.footprint.width; dx++) {
      const x = building.x + dx, y = building.y + dy, index = y * width + x, cell = world.terrain[index];
      if (occupied[index]) invalid(path, 'overlap');
      if (impassable(cell) || cell.ore > 0 || (cell.kind === 'road' && kind !== 'road')
        || cell.height !== world.terrain[cellIndex(world, building)].height) invalid(path, 'blocked-terrain');
      occupied[index] = 1;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (inside(world, nx, ny) && world.terrain[ny * width + nx].kind === 'water') shore = true;
      }
    }
    if (kind === 'harbor' && !shore) invalid(path, 'needs-shore');
    return building;
  });
  const blocked = blockedGrid(world);
  world.units = list(data.units, LIMITS.units, 'units').map((inputUnit, i): Unit => {
    const path = `units[${i}]`, u = record(inputUnit, UNIT_KEYS, path);
    const kind = oneOf(u.kind, UNIT_KINDS, `${path}.kind`);
    const unit: Unit = {
      id: entityId(u.id, 'u', `${path}.id`), kind,
      x: number(u.x, 0, width - 1, `${path}.x`, true), y: number(u.y, 0, height - 1, `${path}.y`, true),
      task: oneOf(u.task, TASKS[kind], `${path}.task`),
      path: list(u.path, width * height - 1, `${path}.path`).map((p, j) => point(p, world, `${path}.path[${j}]`)),
      moveProgress: number(u.moveProgress, 0, 1 - Number.EPSILON, `${path}.moveProgress`),
      timer: number(u.timer, 0, 2, `${path}.timer`),
      cargo: number(u.cargo, 0, kind === 'miner' ? MINER_CAPACITY : kind === 'truck' ? 1 : 0, `${path}.cargo`, true),
      target: u.target === null ? null : point(u.target, world, `${path}.target`),
      targetId: u.targetId === null ? null : text(u.targetId, 24, `${path}.targetId`),
    };
    if (blocked[cellIndex(world, unit)]) invalid(path, 'unit-blocked');
    const visited = new Set<number>([cellIndex(world, unit)]);
    let previous: Point = unit;
    for (const p of unit.path) {
      const index = cellIndex(world, p), cell = world.terrain[index];
      if (Math.abs(previous.x - p.x) + Math.abs(previous.y - p.y) !== 1 || visited.has(index)) invalid(path, 'invalid-route');
      if (impassable(cell) || !heightStep(world, cellIndex(world, previous), index)) invalid(path, 'route-terrain');
      visited.add(index); previous = p;
    }
    const travelling = arrival[unit.task] !== undefined;
    if (travelling !== (unit.path.length > 0)) invalid(path, 'route-task-mismatch');
    if (unit.path.length === 0 && unit.moveProgress !== 0) invalid(path, 'orphan-move-progress');
    if (unit.task === 'idle') {
      if (unit.target !== null || unit.targetId !== null) invalid(path, 'idle-target');
    } else {
      if (!unit.target || !same(previous, unit.target)) invalid(path, 'target-route-mismatch');
      if (unit.task === 'move' || unit.task === 'to-ore' || unit.task === 'mining') {
        if (unit.targetId !== null) invalid(path, 'unexpected-building-target');
        if (unit.task !== 'move' && world.terrain[cellIndex(world, unit.target)].kind !== 'ore') invalid(path, 'invalid-ore-target');
      } else {
        const target = world.buildings.find(b => b.id === unit.targetId);
        if (!target || !adjacent(world, unit.target, target)) invalid(path, 'invalid-building-target');
        const expected = unit.task === 'to-refinery' || unit.task === 'unloading' ? 'refinery'
          : unit.task === 'to-workshop' || unit.task === 'loading' ? 'workshop'
          : unit.task === 'to-market' || unit.task === 'delivering' ? 'market' : null;
        if (expected !== null && (target.kind !== expected || !complete(target))) invalid(path, 'wrong-target-kind');
      }
    }
    if ((unit.task === 'to-ore' || unit.task === 'to-workshop' || unit.task === 'loading') && unit.cargo !== 0) invalid(path, 'unexpected-cargo');
    if (unit.task === 'mining' && unit.cargo >= MINER_CAPACITY) invalid(path, 'full-miner');
    if ((unit.task === 'to-refinery' || unit.task === 'unloading' || unit.task === 'to-market' || unit.task === 'delivering') && unit.cargo === 0) invalid(path, 'missing-cargo');
    if ((unit.task === 'move' || unit.task.startsWith('to-') || unit.task === 'building') && unit.timer !== 0) invalid(path, 'unexpected-timer');
    if (unit.task === 'mining' && unit.timer >= 0.5) invalid(path, 'invalid-mining-timer');
    if ((unit.task === 'loading' || unit.task === 'unloading' || unit.task === 'delivering') && unit.timer >= 1) invalid(path, 'invalid-work-timer');
    return unit;
  });
  if (world.nextId <= largestId) invalid('nextId', 'nonmonotonic-id');
  if (world.population > getStats(world).capacity) invalid('population', 'exceeds-capacity');
  return world;
}
