import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  advanceVillaPets, createVillaPets, feedVillaPet, nearestVillaPet,
  VILLA_PET_FEED_COOLDOWN, VILLA_PET_FOOD, VILLA_PET_KINDS, VILLA_PET_LABELS, VILLA_PET_LAWN, VILLA_PET_RADIUS,
  type VillaPet, type VillaPetsState,
} from '../../src/games/villaPets';
import { createVillaPetModel } from '../../src/games/villaPetModel';
import { VILLA_WALL_COLLIDERS, type VillaCollider } from '../../src/games/villaWorld';

const box = (minX: number, maxX: number, minZ: number, maxZ: number, maxY = 1): VillaCollider => ({ minX, maxX, minZ, maxZ, minY: 0, maxY });
const vegetables = box(-11.6, -4.1, 17, 22, 0.42);
const actualBeds = [[-10, 18], [-5.8, 18], [-10, 21], [-5.8, 21]].map(([x, z]) => box(x - 1.3, x + 1.3, z - 0.775, z + 0.775, 0.42));
// Actual exterior tree bounds, plus a trunk inside the lawn to exercise avoidance.
const obstacles = [...VILLA_WALL_COLLIDERS, ...actualBeds, box(-14.25, -13.75, 22.55, 23.05, 2.9), box(-19.25, -18.75, 18.75, 19.25, 2.9), box(-10.8, -10.2, 15.7, 16.3, 0.6)];
function safe(state: VillaPetsState, colliders = obstacles): void {
  for (const p of state.pets) {
    expect([p.x, p.y, p.z, p.yaw, p.timer, p.gait, p.cooldown].every(Number.isFinite)).toBe(true);
    expect(p.x - VILLA_PET_RADIUS).toBeGreaterThanOrEqual(VILLA_PET_LAWN.minX - 1e-8);
    expect(p.x + VILLA_PET_RADIUS).toBeLessThanOrEqual(VILLA_PET_LAWN.maxX + 1e-8);
    expect(p.z - VILLA_PET_RADIUS).toBeGreaterThanOrEqual(VILLA_PET_LAWN.minZ - 1e-8);
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
  it('starts four distinct small species near spawn with fresh independent state', () => {
    const a = createVillaPets(), b = createVillaPets();
    expect(a.pets.map(p => p.kind)).toEqual(['dog', 'cat', 'parrot', 'rabbit']);
    expect(a).toEqual(b); expect(a.pets[0]).not.toBe(b.pets[0]);
    expect(new Set(a.pets.map(p => `${p.x}/${p.z}`)).size).toBe(4);
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
    const distances = [0, 0, 0, 0], modes = new Set<string>(); let birdHigh = false, birdLanded = false, rabbitHop = false;
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
    expect(a).toEqual(b); expect(distances.every(d => d > 25)).toBe(true);
    expect(modes).toEqual(new Set(['idle', 'exploring']));
    expect(birdHigh && birdLanded && rabbitHop).toBe(true);
    expect(a.pets.every(p => !('health' in p) && !('attack' in p) && !('damage' in p))).toBe(true);
    expect(a.pets.some((p, i) => Math.hypot(p.x - starts[i].x, p.z - starts[i].z) > 2)).toBe(true);
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
    expect(meshes).toBeLessThanOrEqual(28); expect(lights).toBe(0);
    let visibleMeshes = 0;
    scene.traverseVisible(o => { if (o instanceof THREE.Mesh) visibleMeshes++; });
    expect(visibleMeshes).toBe(24); // Four additional food batches are hidden until eating.
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

  it('joins each parrot foot to its belly with a batched shank', () => {
    const scene = new THREE.Scene(); createVillaPetModel(scene);
    const body = scene.getObjectByName('parrot/body/surface') as THREE.Mesh;
    const positions = body.geometry.getAttribute('position'), colors = body.geometry.getAttribute('color');
    const dark = new THREE.Color(0x382d2a);
    for (const side of [-1, 1]) {
      let top = 0, bottom = 0;
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
        if (Math.sign(x) !== side || Math.abs(colors.getX(i) - dark.r) > 1e-6) continue;
        if (Math.abs(y - 0.12) < 1e-6) {
          top++;
          expect((x / 0.095) ** 2 + ((y - 0.23) / 0.145) ** 2 + (z / 0.105) ** 2).toBeLessThan(1);
        }
        if (Math.abs(y - 0.03) < 1e-6) {
          bottom++;
          expect(((x - side * 0.042) / 0.018) ** 2 + ((y - 0.025) / 0.025) ** 2 + ((z - 0.032) / 0.055) ** 2).toBeLessThan(1);
        }
      }
      expect(top).toBeGreaterThan(8); expect(bottom).toBeGreaterThan(8);
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
      });
      model.update(frame / 13, state); scene.updateMatrixWorld(true);
      state.pets.forEach(p => {
        const bounds = new THREE.Box3().setFromObject(scene.getObjectByName(`villa-pet-${p.kind}`)!, true);
        expect(bounds.min.x).toBeGreaterThanOrEqual(-VILLA_PET_RADIUS);
        expect(bounds.max.x).toBeLessThanOrEqual(VILLA_PET_RADIUS);
        expect(bounds.min.z).toBeGreaterThanOrEqual(-VILLA_PET_RADIUS);
        expect(bounds.max.z).toBeLessThanOrEqual(VILLA_PET_RADIUS);
        expect(bounds.max.y).toBeLessThanOrEqual(p.y + 0.61);
      });
    }
  });

  it('updates four plain driving boxes in place, animates parts and keeps all resources traversable', () => {
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
      const root = scene.getObjectByName(`villa-pet-${pet.kind}`)!;
      expect(root.position.toArray()).toEqual([pet.x, pet.y, pet.z]);
    });
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    scene.traverse(o => { if (o instanceof THREE.Mesh) { geometries.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m); } });
    expect(geometries.size).toBe(28); expect(materials.size).toBe(2);
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); scene.clear();
    expect(scene.children).toHaveLength(0);
  });
});
