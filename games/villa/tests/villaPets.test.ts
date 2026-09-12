import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  advanceVillaPets, createVillaPets, feedVillaPet, nearestVillaPet, villaPetLabel, VILLA_PET_IDS, VILLA_PET_SHELTERS,
  VILLA_PET_VISIT_ROUTE, VILLA_PET_FEED_COOLDOWN, VILLA_PET_FOOD, VILLA_PET_KINDS, VILLA_PET_LABELS, VILLA_PET_LAWN, VILLA_PET_RADIUS,
  type VillaPet, type VillaPetsState,
} from '../src/villaPets';
import { furnishVilla } from '../src/villaFurnishings';
import { createVillaPetModel } from '../src/villaPetModel';
import { VILLA_WALL_COLLIDERS, VILLA_RAILS, type VillaCollider } from '../src/villaWorld';
import { createVillaGarden } from '../src/villaGarden';
import { createVillaEstateModel } from '../src/villaEstateModel';
import { createVillaVehicle } from '../src/villaVehicle';
import { createVillaPickupModel } from '../src/villaPickupModel';
import { createVillaScooterModel } from '../src/villaScooterModel';

// Fixed 10–15 minute simulations check correctness, not a 5s wall-clock budget.
// Shared CI runners need headroom without reducing steps or collision assertions.
const LONG_SIMULATION_TIMEOUT = 15_000;

const box = (minX: number, maxX: number, minZ: number, maxZ: number, maxY = 1): VillaCollider => ({ minX, maxX, minZ, maxZ, minY: 0, maxY });
const vegetables = box(-11.6, -4.1, 17, 22, 0.42);
const actualBeds = [[-10, 18], [-5.8, 18], [-10, 21], [-5.8, 21]].map(([x, z]) => box(x - 1.3, x + 1.3, z - 0.775, z + 0.775, 0.42));
// Actual exterior tree bounds, plus a trunk inside the lawn to exercise avoidance.
const obstacles = [...VILLA_WALL_COLLIDERS, ...actualBeds, box(-14.25, -13.75, 22.55, 23.05, 2.9), box(-19.25, -18.75, 18.75, 19.25, 2.9), box(-10.8, -10.2, 15.7, 16.3, 0.6)];
function safe(state: VillaPetsState, colliders = obstacles): void {
  for (const p of state.pets) {
    expect([p.x, p.y, p.z, p.yaw, p.timer, p.gait, p.cooldown].every(Number.isFinite)).toBe(true);
    const visiting = p.visit !== 'lawn';
    expect(p.x - VILLA_PET_RADIUS).toBeGreaterThanOrEqual(VILLA_PET_LAWN.minX - 1e-8);
    expect(p.x + VILLA_PET_RADIUS).toBeLessThanOrEqual(visiting ? 0.6 : VILLA_PET_LAWN.maxX + 1e-8);
    expect(p.z - VILLA_PET_RADIUS).toBeGreaterThanOrEqual(visiting ? 3.9 : VILLA_PET_LAWN.minZ - 1e-8);
    expect(p.z + VILLA_PET_RADIUS).toBeLessThanOrEqual(VILLA_PET_LAWN.maxZ + 1e-8);
    for (const c of colliders) {
      if (c.maxY <= 0.025 || c.minY >= 1.65) continue;
      const overlap = p.x + VILLA_PET_RADIUS >= c.minX && p.x - VILLA_PET_RADIUS <= c.maxX
        && p.z + VILLA_PET_RADIUS >= c.minZ && p.z - VILLA_PET_RADIUS <= c.maxZ;
      expect(overlap, `${p.kind} overlapping ${JSON.stringify(c)}`).toBe(false);
    }
    for (const other of state.pets) if (other !== p) expect(Math.hypot(p.x - other.x, p.z - other.z)).toBeGreaterThanOrEqual(0.85 - 1e-8);
  }
}
function aim(p: VillaPet, x: number, z: number): void { p.mode = 'exploring'; p.timer = 100; p.targetX = x; p.targetZ = z; }
function follow(state: VillaPetsState, p: VillaPet, dt = 1 / 30): void {
  advanceVillaPets(state, dt, [], { x: p.x + 0.8, y: 0, z: p.z });
}

describe('peaceful villa lawn pets', () => {
  it('starts six independently identified pets, preserving five IDs and adding a female rabbit', () => {
    const a = createVillaPets(), b = createVillaPets();
    expect(a.pets.map(p => p.kind)).toEqual(['dog', 'cat', 'parrot', 'rabbit', 'parrot', 'rabbit']);
    expect(a.pets.map(p => p.id)).toEqual(['dog', 'cat', 'parrot', 'rabbit', 'parrot-blue', 'rabbit-female']);
    expect(new Set(a.pets.map(p => p.seed)).size).toBe(6);
    expect(a.pets[3].sex).toBe('male'); expect(a.pets[5].sex).toBe('female');
    expect(villaPetLabel(a.pets[3]).en).toBe('Male rabbit'); expect(villaPetLabel(a.pets[5]).en).toBe('Female rabbit');
    expect(a).toEqual(b); expect(a.pets[0]).not.toBe(b.pets[0]);
    expect(new Set(a.pets.map(p => `${p.x}/${p.z}`)).size).toBe(6);
    expect(a.pets.every(p => !p.fed && p.feedCount === 0 && p.cooldown === 0)).toBe(true);
    safe(a);
    a.pets[0].fed = true; expect(createVillaPets()).toEqual(b);
  });

  it('exports bilingual species/food copy and a successful-feed-only cache token', () => {
    const state = createVillaPets();
    for (const kind of VILLA_PET_KINDS) for (const text of Object.values(VILLA_PET_LABELS[kind])) expect(text.length).toBeGreaterThan(0);
    expect(state.feedSequence).toBe(0);
    follow(state, state.pets[0]); expect(state.feedSequence).toBe(0);
    expect(feedVillaPet(state, 'dog')).toBe(true); expect(state.feedSequence).toBe(1);
    expect(feedVillaPet(state, 'dog')).toBe(false); expect(state.feedSequence).toBe(1);
    follow(state, state.pets[1]); expect(feedVillaPet(state, 'cat')).toBe(true);
    expect(state.feedSequence).toBe(2);
    advanceVillaPets(state, 2, []); expect(state.feedSequence).toBe(2);
    expect(createVillaPets().feedSequence).toBe(0);
  });

  it.each(VILLA_PET_KINDS)('%s calmly waits near a visible visitor, then resumes roaming when they leave', kind => {
    const state = createVillaPets(), pet = state.pets.find(p => p.kind === kind)!;
    state.pets = [pet]; aim(pet, -4, 20);
    if (kind === 'parrot') { pet.y = 0.65; pet.flightHeight = 0.65; }
    const start = { x: pet.x, z: pet.z }, visitor = { x: pet.x - 1.5, y: 0, z: pet.z };
    advanceVillaPets(state, 0.1, [], visitor);
    expect({ x: pet.x, z: pet.z }).toEqual(start); expect(pet.mode).toBe('idle');
    if (kind === 'parrot') { expect(pet.y).toBeLessThan(0.65); expect(pet.y).toBeGreaterThan(0.5); }
    for (let i = 0; i < 120; i++) advanceVillaPets(state, 0.1, [], visitor);
    expect({ x: pet.x, z: pet.z }).toEqual(start); expect(pet.mode).toBe('idle');
    expect(pet.y).toBe(0); expect(nearestVillaPet(state, visitor)).toBe(pet);
    for (let i = 0; i < 60; i++) advanceVillaPets(state, 0.1, []);
    expect(Math.hypot(pet.x - start.x, pet.z - start.z)).toBeGreaterThan(0.25);
  });

  it('ignores invalid dt without corrupting state or doing unbounded catchup', () => {
    const state = createVillaPets(), before = structuredClone(state);
    for (const dt of [NaN, Infinity, -Infinity, -1, 0]) advanceVillaPets(state, dt, obstacles);
    expect(state).toEqual(before);
    advanceVillaPets(state, Number.MAX_VALUE, obstacles);
    expect(state.time).toBeCloseTo(2); safe(state);
  });

  it('wanders deterministically, rests, flies/lands and hops safely for fifteen minutes', () => {
    const a = createVillaPets(), b = createVillaPets(), starts = a.pets.map(p => ({ ...p }));
    const distances = a.pets.map(() => 0), modes = new Set<string>(); let birdHigh = false, birdLanded = false, rabbitHop = false;
    for (let tick = 0; tick < 3600; tick++) {
      const previous = a.pets.map(p => ({ ...p }));
      advanceVillaPets(a, 0.25, obstacles); advanceVillaPets(b, 0.25, obstacles);
      a.pets.forEach((p, i) => {
        distances[i] += Math.hypot(p.x - previous[i].x, p.z - previous[i].z); modes.add(p.mode);
        expect(Math.hypot(p.x - previous[i].x, p.z - previous[i].z)).toBeLessThanOrEqual(0.66 * 0.25 + 1e-8);
      });
      birdHigh ||= a.pets[2].y > 0.3;
      birdLanded ||= birdHigh && a.pets[2].y === 0;
      rabbitHop ||= a.pets[3].y > 0.05;
      if (tick % 15 === 0) safe(a);
    }
    expect(a).toEqual(b); distances.forEach((d, i) => expect(d, a.pets[i].id).toBeGreaterThan(25));
    expect(modes).toEqual(new Set(['idle', 'exploring']));
    expect(birdHigh && birdLanded && rabbitHop).toBe(true);
    expect(a.pets.every(p => !('health' in p) && !('attack' in p) && !('damage' in p))).toBe(true);
    expect(a.pets.some((p, i) => Math.hypot(p.x - starts[i].x, p.z - starts[i].z) > 2)).toBe(true);
  }, LONG_SIMULATION_TIMEOUT);

  it('eases takeoff and landing with bounded vertical acceleration, curved heading and gradual wing folding', () => {
    const state = createVillaPets(), bird = state.pets[2]; state.pets = [bird];
    bird.x = -16; bird.z = 16; bird.yaw = 0; aim(bird, -10, 16); bird.flightHeight = 0.65;
    const h = 1 / 30;
    for (let i = 0; i < 90; i++) {
      const y = bird.y, velocity = bird.verticalSpeed, yaw = bird.yaw, fold = bird.wingFold;
      advanceVillaPets(state, h, []);
      expect(Math.abs(bird.y - y)).toBeLessThanOrEqual(0.48 * h + 1e-8);
      expect(Math.abs(bird.verticalSpeed - velocity)).toBeLessThanOrEqual(1.4 * h + 1e-8);
      expect(Math.abs(bird.yaw - yaw)).toBeLessThanOrEqual(2.4 * h + 1e-8);
      expect(Math.abs(bird.wingFold - fold)).toBeLessThanOrEqual(4 * h + 1e-8);
    }
    expect(bird.y).toBeGreaterThan(0.5); expect(bird.wingFold).toBe(1);
    const visitor = { x: bird.x, y: 0, z: bird.z };
    advanceVillaPets(state, h, [], visitor); expect(bird.y).toBeGreaterThan(0.4);
    for (let i = 0; i < 240; i++) advanceVillaPets(state, h, [], visitor);
    expect(bird.y).toBe(0); expect(bird.verticalSpeed).toBe(0); expect(bird.wingFold).toBe(0);
  });

  it('sweeps long movement against hair-thin walls and low vegetable barriers, including flight', () => {
    for (const kind of VILLA_PET_KINDS) {
      const state = createVillaPets(), pet = state.pets.find(p => p.kind === kind)!;
      state.pets = [pet]; pet.x = -13; pet.z = 18;
      aim(pet, -5, 18); if (kind === 'parrot') { pet.y = 0.65; pet.flightHeight = 0.65; }
      const wall = box(-12.3, -12.299, 12.8, 22, 0.06);
      for (let i = 0; i < 40; i++) {
        advanceVillaPets(state, 120, [wall, vegetables]);
        expect(pet.x + VILLA_PET_RADIUS).toBeLessThan(wall.minX);
        safe(state, [wall, vegetables]);
      }
    }
  });

  it('yields instead of pushing or fighting when two pets meet head-on', () => {
    const state = createVillaPets(); state.pets = state.pets.slice(0, 2);
    const [dog, cat] = state.pets; dog.x = -17; dog.z = 18; cat.x = -14; cat.z = 18;
    aim(dog, -14, 18); aim(cat, -17, 18);
    for (let i = 0; i < 600; i++) { advanceVillaPets(state, 1 / 30, []); safe(state, []); }
    expect(state.pets).toHaveLength(2);
  });

  it('does not step into a moving car box and waits if an external box is inserted over it', () => {
    const state = createVillaPets(); state.pets = state.pets.slice(0, 1);
    const pet = state.pets[0], car = box(-14.5, -12, 16.5, 19.5, 1.45);
    aim(pet, -12, 18);
    for (let i = 0; i < 80; i++) {
      // Move the car away, never onto the pet (controller owns vehicle stopping).
      car.minX += 0.005; car.maxX += 0.005;
      advanceVillaPets(state, 0.05, [car]); safe(state, [car]);
    }
    const before = { x: pet.x, z: pet.z };
    const overlap = box(pet.x - 1, pet.x + 1, pet.z - 1, pet.z + 1, 1.45);
    advanceVillaPets(state, 2, [overlap]);
    expect({ x: pet.x, z: pet.z }).toEqual(before);
  });

  it('visits the actual furnished living room through the front doorway and returns without tunnelling', () => {
    // Texture painting is irrelevant to collider extraction; no browser/WebGL needed.
    const paint = new Proxy({}, { get: () => () => undefined, set: () => true });
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => paint }) });
    const scene = new THREE.Scene();
    let furniture: ReturnType<typeof furnishVilla>;
    try { furniture = furnishVilla(scene); } finally { vi.unstubAllGlobals(); }
    const colliders = [...obstacles, ...furniture.colliders];
    for (let edge = 1; edge < VILLA_PET_VISIT_ROUTE.length; edge++) {
      const a = VILLA_PET_VISIT_ROUTE[edge - 1], b = VILLA_PET_VISIT_ROUTE[edge];
      for (let i = 0; i <= 100; i++) {
        const x = a[0] + (b[0] - a[0]) * i / 100, z = a[1] + (b[1] - a[1]) * i / 100;
        const hit = colliders.filter(c => c.maxY > 0.025 && c.minY < 1.65 && x + 0.4 >= c.minX && x - 0.4 <= c.maxX && z + 0.4 >= c.minZ && z - 0.4 <= c.maxZ);
        expect(hit, `route edge ${edge}`).toEqual([]);
      }
    }
    const state = createVillaPets(), visits = new Set<string>(), returns = new Set<string>();
    for (let frame = 0; frame < 2400; frame++) {
      const before = state.pets.map(p => ({ x: p.x, z: p.z }));
      advanceVillaPets(state, 0.25, colliders);
      state.pets.forEach((p, i) => {
        if ((p.z - 9) * (before[i].z - 9) < 0) expect(Math.abs(p.x)).toBeLessThan(1.05);
        if (p.visit === 'living') { visits.add(p.id); expect(p.x).toBeLessThan(-2); expect(p.z).toBeLessThan(9); }
        if (visits.has(p.id) && p.visit === 'lawn') returns.add(p.id);
        expect(Math.hypot(p.x - before[i].x, p.z - before[i].z)).toBeLessThanOrEqual(0.66 * 0.25 + 1e-8);
      });
      if (frame % 8 === 0) safe(state, colliders);
    }
    expect([...visits].sort()).toEqual(['cat', 'dog']); expect([...returns].sort()).toEqual(['cat', 'dog']);
    scene.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose(); } });
  }, LONG_SIMULATION_TIMEOUT);

  it('waits at a newly closed front door and resumes its route only after reopening', () => {
    const state = createVillaPets(); state.pets = [state.pets[0]];
    const pet = state.pets[0]; pet.visitTimer = 0;
    for (let i = 0; i < 400 && pet.z > 10.2; i++) advanceVillaPets(state, 0.25, VILLA_WALL_COLLIDERS);
    expect(pet.visit).toBe('outbound'); expect(pet.z).toBeLessThan(10.2);
    const closed = [...VILLA_WALL_COLLIDERS, box(-1.45, 1.45, 8.99, 9.01, 3)];
    for (let i = 0; i < 300; i++) { advanceVillaPets(state, 0.25, closed); expect(pet.z).toBeGreaterThan(9.4); }
    for (let i = 0; i < 300 && pet.visit !== 'living'; i++) advanceVillaPets(state, 0.25, VILLA_WALL_COLLIDERS);
    expect(pet.visit).toBe('living');
  });

  it('feeds the second parrot by stable ID without sharing cooldowns or reactions', () => {
    const state = createVillaPets(), first = state.pets[2], second = state.pets[4];
    follow(state, second); expect(nearestVillaPet(state, state.visitor!)!.id).toBe('parrot-blue');
    expect(feedVillaPet(state, 'parrot')).toBe(false);
    expect(feedVillaPet(state, 'parrot-blue')).toBe(true);
    expect(first.feedCount).toBe(0); expect(first.cooldown).toBe(0);
    expect(second.feedCount).toBe(1); expect(second.cooldown).toBe(8);
    follow(state, first); expect(feedVillaPet(state, 'parrot')).toBe(true);
    const scene = new THREE.Scene(), model = createVillaPetModel(scene);
    first.mode = 'eating'; second.mode = 'eating'; model.update(1, state);
    const a = scene.getObjectByName('parrot/food-plate')!, b = scene.getObjectByName('parrot-blue/food-plate')!;
    expect(a).not.toBe(b); expect(a.visible && b.visible).toBe(true); expect(a.position.equals(b.position)).toBe(false);
    const anchor = b.position.clone(); first.mode = 'idle'; model.update(2, state);
    expect(a.visible).toBe(false); expect(b.visible).toBe(true); expect(b.position.equals(anchor)).toBe(true);
    expect(model.drivingColliders).toHaveLength(6);
  });

  it('requires ground proximity and line of sight, not upstairs or through walls', () => {
    const state = createVillaPets(), pet = state.pets[0], p = { x: pet.x - 1, y: 0, z: pet.z };
    expect(nearestVillaPet(state, p)).toBe(pet);
    expect(nearestVillaPet(state, { ...p, y: 3.6 })).toBeNull();
    expect(nearestVillaPet(state, { ...p, x: -40 })).toBeNull();
    expect(nearestVillaPet(state, { ...p, x: NaN })).toBeNull();
    const wall = box(pet.x - 0.51, pet.x - 0.5, pet.z - 2, pet.z + 2, 3);
    expect(nearestVillaPet(state, p, [wall])).toBeNull();
    advanceVillaPets(state, 0.01, [wall], p);
    expect(feedVillaPet(state, 'dog')).toBe(false);
    expect(nearestVillaPet(state, p)).toBeNull();
    expect(feedVillaPet(createVillaPets(), 'dog')).toBe(false);
  });

  it('does not offer an airborne parrot and clears stale visitor permission', () => {
    const state = createVillaPets(), pet = state.pets[2];
    pet.y = 0.65;
    const p = { x: pet.x, y: 0, z: pet.z };
    expect(nearestVillaPet(state, p)).toBeNull();
    advanceVillaPets(state, 0.01, [], p); expect(feedVillaPet(state, 'parrot')).toBe(false);
    pet.y = 0; advanceVillaPets(state, 0.01, []);
    expect(feedVillaPet(state, 'parrot')).toBe(false);
  });

  it.each(VILLA_PET_KINDS)('feeds %s its own food, rejects spam, repeats after cooldown and resets', kind => {
    const state = createVillaPets(), pet = state.pets.find(p => p.kind === kind)!;
    for (let feed = 1; feed <= 3; feed++) {
      let accepted = false;
      for (let frame = 0; frame < 1800; frame++) {
        follow(state, pet); if (feedVillaPet(state, kind)) { accepted = true; break; }
      }
      expect(accepted).toBe(true); expect(pet.fed).toBe(true);
      expect(pet.food).toBe(VILLA_PET_FOOD[kind]); expect(pet.feedCount).toBe(feed);
      expect(pet.mode).toBe('approaching'); expect(pet.cooldown).toBe(VILLA_PET_FEED_COOLDOWN);
      const timer = pet.timer;
      for (let i = 0; i < 30; i++) expect(feedVillaPet(state, kind)).toBe(false);
      expect(pet.timer).toBe(timer);
      const modes = new Set<string>();
      for (let i = 0; i < 180; i++) { follow(state, pet); modes.add(pet.mode); }
      expect(modes.has('eating') && modes.has('happy') && modes.has('idle')).toBe(true);
      expect(feedVillaPet(state, kind)).toBe(false);
    }
    const reset = createVillaPets().pets.find(p => p.kind === kind)!;
    expect(reset.feedCount).toBe(0); expect(reset.fed).toBe(false); expect(reset.cooldown).toBe(0);
  });
});

describe('continuous rain shelter in the actual furnished estate', () => {
  let scene: THREE.Scene, colliders: VillaCollider[];
  beforeAll(() => {
    const paint = new Proxy({}, { get: () => () => undefined, set: () => true });
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => paint }) });
    scene = new THREE.Scene(); let furnishing: ReturnType<typeof furnishVilla>;
    try { furnishing = furnishVilla(scene); } finally { vi.unstubAllGlobals(); }
    colliders = [...VILLA_WALL_COLLIDERS, ...VILLA_RAILS, ...furnishing.colliders, ...createVillaGarden(scene).colliders,
      ...createVillaEstateModel(scene).colliders, ...createVillaVehicle(scene).colliders, ...createVillaPickupModel(scene).colliders,
      ...createVillaScooterModel(scene).colliders];
  });
  afterAll(() => {
    const gs = new Set<THREE.BufferGeometry>(), ms = new Set<THREE.Material>();
    scene.traverse(o => { if (o instanceof THREE.Mesh) { gs.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) ms.add(m); } });
    gs.forEach(g => g.dispose()); ms.forEach(m => { if ('map' in m && m.map instanceof THREE.Texture) m.map.dispose(); m.dispose(); }); scene.clear();
  });
  const assertSafe = (state: VillaPetsState, before: { x: number; z: number }[], boxes = colliders) => {
    state.pets.forEach((p, i) => {
      expect([p.x, p.y, p.z, p.yaw, p.wingFold].every(Number.isFinite)).toBe(true);
      expect(Math.hypot(p.x - before[i].x, p.z - before[i].z)).toBeLessThanOrEqual(0.66 * 0.25 + 1e-8);
      const collision = boxes.find(c => c.maxY > 0.025 && c.minY < 1.65 && p.x + 0.4 >= c.minX && p.x - 0.4 <= c.maxX && p.z + 0.4 >= c.minZ && p.z - 0.4 <= c.maxZ);
      expect(collision, `${p.id} at ${p.x},${p.z}`).toBeUndefined();
      for (const other of state.pets) if (other !== p) expect(Math.hypot(p.x - other.x, p.z - other.z)).toBeGreaterThanOrEqual(0.85 - 1e-8);
    });
  };
  it('shelters all six at distinct dry destinations, folds birds before the doorway, then continuously returns to lawn', () => {
    const state = createVillaPets();
    for (const bird of state.pets.filter(p => p.kind === 'parrot')) { bird.y = 0.65; bird.flightHeight = 0.65; bird.wingFold = 1; }
    const landedAtDoor = new Set<string>(); let reached = false;
    for (let frame = 0; frame < 2400; frame++) {
      const before = state.pets.map(p => ({ x: p.x, z: p.z }));
      advanceVillaPets(state, 0.25, colliders, undefined, { raining: true });
      assertSafe(state, before);
      state.pets.forEach((p, i) => {
        if (before[i].z > 2 && p.z <= 2 && p.x > 12) {
          expect(p.x).toBeGreaterThan(24.5); expect(p.x).toBeLessThan(27.6);
          if (p.kind === 'parrot') { expect(p.y).toBe(0); expect(p.wingFold).toBe(0); landedAtDoor.add(p.id); }
        }
        if (p.sheltered) {
          expect(p.shelterSite).toBe(VILLA_PET_SHELTERS[p.id].site);
          expect(p.z).toBeLessThan(p.shelterSite === 'garage' ? 1.4 : 8.4);
          if (p.shelterSite === 'garage') { expect(p.x).toBeGreaterThan(12.5); expect(p.x).toBeLessThan(34.2); }
          else { expect(p.x).toBeGreaterThan(-11.4); expect(p.x).toBeLessThan(-2.4); }
        }
      });
      if (state.pets.every(p => p.shelterPhase === 'resting')) { reached = true; break; }
    }
    expect(reached, JSON.stringify(state.pets.map(p => ({ id: p.id, x: p.x, z: p.z, phase: p.shelterPhase, route: p.shelterRoute, waypoint: p.shelterWaypoint })))).toBe(true);
    expect(state.pets.every(p => p.sheltered)).toBe(true); expect(landedAtDoor.size).toBe(2);
    const rest = state.pets.map(p => [p.x, p.z]);
    for (let i = 0; i < 40; i++) advanceVillaPets(state, 0.25, colliders, undefined, { raining: true });
    expect(state.pets.map(p => [p.x, p.z])).toEqual(rest);
    const cat = state.pets[1];
    advanceVillaPets(state, 0.01, colliders, { x: cat.x, y: 0, z: cat.z - 1.4 }, { raining: true });
    expect(feedVillaPet(state, 'cat')).toBe(true);
    for (let i = 0; i < 100; i++) advanceVillaPets(state, 0.25, colliders, undefined, { raining: true });
    expect(cat.feedCount).toBe(1); expect(cat.shelterPhase).toBe('resting'); expect(cat.sheltered).toBe(true);
    expect(Math.hypot(cat.x - VILLA_PET_SHELTERS.cat.x, cat.z - VILLA_PET_SHELTERS.cat.z)).toBeLessThan(0.25);
    const returned = new Set<string>();
    for (let frame = 0; frame < 2400 && returned.size < 6; frame++) {
      const before = state.pets.map(p => ({ x: p.x, z: p.z }));
      advanceVillaPets(state, 0.25, colliders, undefined, { raining: false }); assertSafe(state, before);
      state.pets.forEach(p => { if (p.shelterPhase === 'none' && p.visit === 'lawn' && !p.sheltered) returned.add(p.id); });
    }
    expect([...returned].sort(), JSON.stringify(state.pets.map(p => ({ id: p.id, x: p.x, z: p.z, phase: p.shelterPhase })))).toEqual([...VILLA_PET_IDS].sort());
  }, 30_000);

  it('replans from mid-roam/indoor visits and preserves a feeding reaction when the rain begins', () => {
    const state = createVillaPets();
    for (let i = 0; i < 600; i++) advanceVillaPets(state, 0.25, colliders);
    const rabbit = state.pets[5]; rabbit.mode = 'eating'; rabbit.timer = 1.8; rabbit.feedCount = 2; rabbit.cooldown = 4;
    advanceVillaPets(state, 0.1, colliders, undefined, { raining: true });
    expect(rabbit.mode).toBe('eating'); expect(rabbit.feedCount).toBe(2); expect(rabbit.shelterPhase).toBe('seeking');
    for (let i = 0; i < 2400 && !state.pets.every(p => p.shelterPhase === 'resting'); i++) {
      const before = state.pets.map(p => ({ x: p.x, z: p.z })); advanceVillaPets(state, 0.25, colliders, undefined, { raining: true }); assertSafe(state, before);
    }
    expect(state.pets.every(p => p.sheltered && p.shelterPhase === 'resting'), JSON.stringify(state.pets.map(p => ({ id: p.id, x: p.x, z: p.z, phase: p.shelterPhase })))).toBe(true);
    expect(rabbit.feedCount).toBe(2);
    // Changing one's mind mid-return still replans from the actual position.
    for (let i = 0; i < 90; i++) advanceVillaPets(state, 0.25, colliders, undefined, { raining: false });
    for (let i = 0; i < 2400 && !state.pets.every(p => p.shelterPhase === 'resting'); i++) {
      const before = state.pets.map(p => ({ x: p.x, z: p.z })); advanceVillaPets(state, 0.25, colliders, undefined, { raining: true }); assertSafe(state, before);
    }
    expect(state.pets.every(p => p.shelterPhase === 'resting')).toBe(true);
  }, 30_000);

  it('waits at an actual newly blocked doorway and resumes only after reopening, without escape teleports', () => {
    const state = createVillaPets(); state.pets = [state.pets[0]]; const dog = state.pets[0];
    for (let i = 0; i < 800 && dog.z > 10.2; i++) advanceVillaPets(state, 0.25, colliders, undefined, { raining: true });
    expect(dog.z).toBeLessThan(10.2);
    const closed = [...colliders, box(-1.45, 1.45, 8.99, 9.01, 3)];
    for (let i = 0; i < 200; i++) {
      const before = [{ x: dog.x, z: dog.z }]; advanceVillaPets(state, 0.25, closed, undefined, { raining: true });
      assertSafe(state, before, closed); expect(dog.z).toBeGreaterThan(9.4); expect(dog.sheltered).toBe(false);
    }
    for (let i = 0; i < 300 && !dog.sheltered; i++) advanceVillaPets(state, 0.25, colliders, undefined, { raining: true });
    expect(dog.shelterSite).toBe('living'); expect(dog.sheltered).toBe(true);
    const obstructed = [...colliders, box(dog.x - 0.7, dog.x + 0.7, dog.z - 0.7, dog.z + 0.7)];
    const before = { x: dog.x, z: dog.z }; advanceVillaPets(state, 2, obstructed, undefined, { raining: false });
    expect({ x: dog.x, z: dog.z }).toEqual(before);
  }, 30_000);

  it('preserves independent rabbit labels, feeds, stationary dishes, feet and live driving identities', () => {
    const state = createVillaPets(), male = state.pets[3], female = state.pets[5], root = new THREE.Group(), model = createVillaPetModel(root);
    expect(villaPetLabel(male).zh).not.toBe(villaPetLabel(female).zh);
    follow(state, female); expect(feedVillaPet(state, 'rabbit-female')).toBe(true); expect(male.feedCount).toBe(0);
    expect(female.food).toBe('hay and greens'); expect(female.cooldown).toBe(8);
    follow(state, male); expect(feedVillaPet(state, 'rabbit')).toBe(true);
    male.mode = female.mode = 'eating'; model.update(1, state);
    const a = root.getObjectByName('rabbit/food-plate')!, b = root.getObjectByName('rabbit-female/food-plate')!;
    expect(a).not.toBe(b); expect(a.visible && b.visible).toBe(true); expect(a.position.equals(b.position)).toBe(false);
    expect(model.drivingColliders[3]).not.toBe(model.drivingColliders[5]);
    expect(root.getObjectByName('rabbit/legs-0')).not.toBe(root.getObjectByName('rabbit-female/legs-0'));
    expect(root.getObjectByName('villa-pet-rabbit')!.userData.sex).toBe('male'); expect(root.getObjectByName('villa-pet-rabbit-female')!.userData.sex).toBe('female');
    expect(root.getObjectByName('villa-pet-rabbit')!.userData.appearance).not.toBe(root.getObjectByName('villa-pet-rabbit-female')!.userData.appearance);
    const geometry = (id: string) => (root.getObjectByName(`${id}/body/surface`) as THREE.Mesh).geometry;
    expect(Array.from(geometry('rabbit').getAttribute('color').array)).not.toEqual(Array.from(geometry('rabbit-female').getAttribute('color').array));
    const anchor = b.position.clone(); male.mode = 'idle'; model.update(2, state); expect(a.visible).toBe(false); expect(b.position.equals(anchor)).toBe(true);
    root.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }); root.clear();
  });
});

describe('scene-owned villa pet geometry without WebGL', () => {
  it('has named species/parts, recognisable small geometry, bounded draws and no shadow casters/lights', () => {
    const scene = new THREE.Scene(), model = createVillaPetModel(scene);
    const state = createVillaPets(); model.update(0, state); scene.updateMatrixWorld(true);
    let meshes = 0, lights = 0;
    scene.traverse(o => {
      if (o instanceof THREE.Light) lights++;
      if (o instanceof THREE.Mesh) {
        meshes++; expect(o.castShadow).toBe(false);
        expect(o.geometry.getAttribute('position').count).toBeGreaterThan(10);
        o.geometry.computeBoundingBox(); expect(o.geometry.boundingBox!.isEmpty()).toBe(false);
      }
    });
    expect(meshes).toBeLessThanOrEqual(46); expect(lights).toBe(0);
    let visibleMeshes = 0;
    scene.traverseVisible(o => { if (o instanceof THREE.Mesh) visibleMeshes++; });
    expect(visibleMeshes).toBe(40); // Six independent food batches are hidden until eating.
    for (const kind of VILLA_PET_KINDS) {
      const root = scene.getObjectByName(`villa-pet-${kind}`)!;
      expect(root.userData).toMatchObject({ petKind: kind, peaceful: true, food: VILLA_PET_FOOD[kind] });
      expect(root.getObjectByName(`${kind}/head`)).toBeTruthy(); expect(root.getObjectByName(`${kind}/tail`)).toBeTruthy();
      const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
      expect(size.y).toBeGreaterThan(0.3); expect(size.y).toBeLessThan(0.65);
      expect(size.x).toBeLessThan(0.85); expect(size.z).toBeLessThan(0.85);
    }
    expect(scene.getObjectByName('parrot/wing-left')).toBeTruthy();
    expect(scene.getObjectByName('rabbit/legs-0')).toBeTruthy();
  });

  it('paints cat stripes on the curved body surface instead of floating geometry', () => {
    const scene = new THREE.Scene(); createVillaPetModel(scene);
    const body = scene.getObjectByName('cat/body/surface') as THREE.Mesh;
    const positions = body.geometry.getAttribute('position'), colors = body.geometry.getAttribute('color');
    const stripe = new THREE.Color(0x756658); let marked = 0;
    for (let i = 0; i < positions.count; i++) {
      if (Math.abs(colors.getX(i) - stripe.r) > 1e-6 || Math.abs(colors.getY(i) - stripe.g) > 1e-6) continue;
      marked++;
      const onBody = (positions.getX(i) / 0.105) ** 2 + ((positions.getY(i) - 0.235) / 0.13) ** 2 + ((positions.getZ(i) + 0.035) / 0.195) ** 2;
      expect(onBody).toBeCloseTo(1, 5);
    }
    expect(marked).toBeGreaterThan(30);
  });

  it('animates separate alternating toes and smoothly folds independent bird wings', () => {
    const scene = new THREE.Scene(), model = createVillaPetModel(scene), state = createVillaPets();
    const bird = state.pets[2]; bird.speed = 0.3; bird.gait = Math.PI / 2;
    model.update(1, state);
    const left = scene.getObjectByName('parrot/foot-left')!, right = scene.getObjectByName('parrot/foot-right')!;
    expect(left.rotation.x).toBeGreaterThan(0); expect(right.rotation.x).toBeLessThan(0);
    expect(left.position.y).toBeGreaterThan(right.position.y);
    expect(left.children).toHaveLength(1); expect(right.children).toHaveLength(1);
    bird.y = 0.5; bird.wingFold = 1; bird.wingPhase = 1;
    model.update(2, state);
    expect(scene.getObjectByName('parrot/wing-left')!.rotation.z).not.toBe(0);
    expect(scene.getObjectByName('parrot-blue/wing-left')!.rotation.z).toBeCloseTo(0);
    expect(left.rotation.x).toBe(1.05); expect(right.rotation.x).toBe(1.05);
    bird.y = 0; bird.wingFold = 0; bird.speed = 0; model.update(3, state);
    expect(scene.getObjectByName('parrot/wing-left')!.rotation.z).toBeCloseTo(0);
    expect(left.rotation.x).toBe(0);
  });

  it.each(['parrot', 'parrot-blue'])('%s keeps actual tail feathers embedded and tucks actual toes backward through flight and landing', id => {
    const scene = new THREE.Scene(), model = createVillaPetModel(scene), state = createVillaPets();
    const bird = state.pets.find(p => p.id === id)!;
    const body = scene.getObjectByName(`${id}/body`)!;
    const tail = scene.getObjectByName(`${id}/tail`)!;
    const feet = ['left', 'right'].map(side => scene.getObjectByName(`${id}/foot-${side}`)!);
    // Read authored mesh vertices, not marker/pivot positions. The world->body
    // transform includes each part's animation while cancelling the bird's
    // translation, yaw, torso pitch and bank for an anatomical-space comparison.
    const verticesInBody = (part: THREE.Object3D, toesOnly = false): THREE.Vector3[] => {
      const points: THREE.Vector3[] = [], inverseBody = body.matrixWorld.clone().invert();
      part.traverse(node => {
        if (!(node instanceof THREE.Mesh)) return;
        const positions = node.geometry.getAttribute('position');
        const toBody = inverseBody.clone().multiply(node.matrixWorld);
        for (let i = 0; i < positions.count; i++) {
          // The toe ellipsoids extend below local y=-.09; the shank does not.
          if (toesOnly && positions.getY(i) >= -.091) continue;
          points.push(new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(toBody));
        }
      });
      return points;
    };
    const poses = [
      { name: 'standing', y: 0, speed: 0, verticalSpeed: 0, bank: 0, wingFold: 0, wingPhase: 0, yaw: .7 },
      { name: 'climbing', y: .3, speed: .45, verticalSpeed: .48, bank: 0, wingFold: 1, wingPhase: .8, yaw: -1.2 },
      { name: 'banked flight left', y: .65, speed: .66, verticalSpeed: 0, bank: -.18, wingFold: 1, wingPhase: 3.8, yaw: 2.3 },
      { name: 'banked flight right', y: .65, speed: .66, verticalSpeed: -.1, bank: .18, wingFold: 1, wingPhase: 5.1, yaw: -2.6 },
      { name: 'landing approach', y: .09, speed: .12, verticalSpeed: -.48, bank: .06, wingFold: .35, wingPhase: 1.7, yaw: 1.5 },
      { name: 'landed', y: 0, speed: 0, verticalSpeed: 0, bank: 0, wingFold: 0, wingPhase: 0, yaw: -.4 },
    ];
    let standingToes: THREE.Vector3[][] = [];
    try {
      for (const [index, pose] of poses.entries()) {
        const { name, ...animation } = pose;
        Object.assign(bird, animation, { x: -16 + index * .3, z: 17 - index * .2, mode: 'exploring', gait: 1.4 });
        model.update(index + .25, state); scene.updateMatrixWorld(true);
        const feathers = verticesInBody(tail);
        expect(feathers.length, name).toBeGreaterThan(20);
        const torsoDistances = feathers.map(p => (p.x / .095) ** 2 + ((p.y - .23) / .145) ** 2 + (p.z / .105) ** 2);
        // Require meaningful penetration into the analytic torso, not a barely
        // touching group origin that could hide detached visible geometry.
        expect(Math.min(...torsoDistances), name).toBeLessThan(.95);
        expect(torsoDistances.filter(d => d < 1 - 1e-5).length, name).toBeGreaterThan(5);
        const toes = feet.map(foot => verticesInBody(foot, true));
        toes.forEach(points => expect(points.length).toBeGreaterThan(20));
        if (index === 0) standingToes = toes;
        for (let side = 0; side < toes.length; side++) {
          expect(toes[side].length).toBe(standingToes[side].length);
          for (let i = 0; i < toes[side].length; i++) {
            const point = toes[side][i], ground = standingToes[side][i];
            expect([point.x, point.y, point.z].every(Number.isFinite)).toBe(true);
            if (pose.y > .025) {
              // Bird front is +Z. Every sampled airborne toe folds behind the
              // torso centre and rises from its standing location, beneath the belly.
              expect(point.z, `${name}: rearward toe`).toBeLessThan(0);
              expect(point.z, `${name}: rearward vs ground`).toBeLessThan(ground.z - .025);
              expect(point.y, `${name}: raised toe`).toBeGreaterThan(ground.y + .01);
              expect(point.y, `${name}: beneath torso`).toBeLessThan(.23);
            } else {
              expect(point.distanceTo(ground), name).toBeLessThan(1e-6);
            }
          }
        }
      }
    } finally {
      const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
      scene.traverse(node => { if (node instanceof THREE.Mesh) { geometries.add(node.geometry); (Array.isArray(node.material) ? node.material : [node.material]).forEach(m => materials.add(m)); } });
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); scene.clear();
    }
  });

  it.each(VILLA_PET_KINDS)('shows a stationary species-appropriate %s dish only while eating and clears it on reset', kind => {
    const scene = new THREE.Scene(), model = createVillaPetModel(scene), state = createVillaPets();
    const pet = state.pets.find(p => p.kind === kind)!;
    const dish = scene.getObjectByName(`${kind}/food-plate`)!;
    expect(dish.parent).toBe(scene); expect(dish.visible).toBe(false);
    expect(dish.userData).toMatchObject({ petKind: kind, food: VILLA_PET_FOOD[kind], role: 'pet-food' });
    expect(dish.userData.contents).toEqual(kind === 'rabbit' ? ['hay', 'greens'] : kind === 'parrot' ? ['seeds'] : ['kibble']);
    expect(dish.children).toHaveLength(1); // Plate, rim and contents merged into one draw.
    follow(state, pet); expect(feedVillaPet(state, kind)).toBe(true);
    const dishBefore = dish.position.clone();
    for (let i = 0; i < 90 && pet.mode === 'approaching'; i++) {
      model.update(state.time, state);
      expect(dish.visible).toBe(false); expect(dish.position.equals(dishBefore)).toBe(true);
      follow(state, pet);
    }
    expect(pet.mode).toBe('eating'); model.update(state.time, state);
    expect(dish.visible).toBe(true); expect(dish.position.y).toBe(0);
    const anchor = dish.position.clone(), yaw = dish.rotation.y;
    for (let i = 0; i < 15; i++) {
      follow(state, pet); model.update(state.time, state);
      expect(dish.visible).toBe(true); expect(dish.position.equals(anchor)).toBe(true); expect(dish.rotation.y).toBe(yaw);
    }
    for (let i = 0; i < 90; i++) { follow(state, pet); model.update(state.time, state); }
    expect(dish.visible).toBe(false);
    // Restart during an active visible reaction must also clear it immediately.
    pet.mode = 'eating'; model.update(state.time, state); expect(dish.visible).toBe(true);
    model.update(0, createVillaPets()); expect(dish.visible).toBe(false);
  });

  it('keeps animated ears, tails and wings inside the conservative driving footprint at every heading', () => {
    const scene = new THREE.Scene(), model = createVillaPetModel(scene), state = createVillaPets();
    for (let frame = 0; frame < 90; frame++) {
      state.pets.forEach(p => {
        p.x = 0; p.z = 0; p.yaw = frame * Math.PI / 13;
        p.mode = frame % 3 === 0 ? 'happy' : frame % 3 === 1 ? 'eating' : 'exploring';
        p.speed = frame % 2 ? 0.5 : 0; p.gait = frame * 0.4; p.y = p.kind === 'parrot' ? 0.65 : 0;
        p.wingFold = frame % 3 / 2; p.wingPhase = frame * 0.7; p.verticalSpeed = Math.sin(frame) * 0.48; p.bank = Math.sin(frame) * 0.18;
      });
      model.update(frame / 13, state); scene.updateMatrixWorld(true);
      state.pets.forEach(p => {
        const bounds = new THREE.Box3().setFromObject(scene.getObjectByName(`villa-pet-${p.id}`)!, true);
        expect(bounds.min.x).toBeGreaterThanOrEqual(-VILLA_PET_RADIUS);
        expect(bounds.max.x).toBeLessThanOrEqual(VILLA_PET_RADIUS);
        expect(bounds.min.z).toBeGreaterThanOrEqual(-VILLA_PET_RADIUS);
        expect(bounds.max.z).toBeLessThanOrEqual(VILLA_PET_RADIUS);
        expect(bounds.max.y).toBeLessThanOrEqual(p.y + 0.61);
      });
    }
  });

  it('updates six plain driving boxes in place, animates parts and keeps all resources traversable', () => {
    const scene = new THREE.Scene(), model = createVillaPetModel(scene), state = createVillaPets();
    const array = model.drivingColliders, refs = [...array];
    const tail = scene.getObjectByName('dog/tail')!;
    model.update(0, state); const firstWag = tail.rotation.y;
    for (let i = 0; i < 120; i++) { advanceVillaPets(state, 1 / 30, obstacles); model.update(state.time, state); }
    expect(tail.rotation.y).not.toBe(firstWag);
    expect(model.drivingColliders).toBe(array);
    state.pets.forEach((pet, i) => {
      const c = array[i]; expect(c).toBe(refs[i]); expect(Object.getPrototypeOf(c)).toBe(Object.prototype);
      expect((c.minX + c.maxX) / 2).toBeCloseTo(pet.x); expect((c.minZ + c.maxZ) / 2).toBeCloseTo(pet.z);
      expect(c.maxY).toBeGreaterThan(pet.y + 0.5);
      const root = scene.getObjectByName(`villa-pet-${pet.id}`)!;
      expect(root.position.toArray()).toEqual([pet.x, pet.y, pet.z]);
    });
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    scene.traverse(o => { if (o instanceof THREE.Mesh) { geometries.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m); } });
    expect(geometries.size).toBe(46); expect(materials.size).toBe(2);
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); scene.clear();
    expect(scene.children).toHaveLength(0);
  });
});
