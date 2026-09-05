import { describe, expect, it } from 'vitest';
import {
  ELEVATOR_IDLE_SECONDS, VILLA_ELEVATOR, advanceVillaElevator, createVillaElevator, createVillaElevatorColliders, idleVillaElevator,
  requestVillaElevator, villaElevatorCabinContains, villaElevatorDoorwayObstructed,
  villaElevatorShaftContains, villaElevatorSupportAt, type VillaElevatorState,
} from '../../src/games/villaElevator';
import {
  PLAYER_RADIUS, VILLA_BLOCKS, VILLA_RAILS, VILLA_WALL_COLLIDERS,
  moveVillaPlayer, villaCollides, villaSupportAt, type VillaPosition,
} from '../../src/games/villaWorld';

const floors = VILLA_ELEVATOR.floors;
const trips = [[0, 1], [0, 2], [1, 0], [1, 2], [2, 0], [2, 1]] as const;
function atFloor(floor: number, open = false): VillaElevatorState {
  return { ...createVillaElevator(), floor, target: floor, y: floors[floor], fromY: floors[floor],
    phase: open ? 'open' : 'closed', door: open ? 1 : 0 };
}
function untilOpen(state: VillaElevatorState) {
  for (let step = 0; step < 1000 && state.phase !== 'open'; step++) advanceVillaElevator(state, .02);
  expect(state.phase).toBe('open');
}
function world(state: VillaElevatorState) {
  const gates = createVillaElevatorColliders();
  gates.update(state);
  const colliders = [...VILLA_WALL_COLLIDERS, ...VILLA_RAILS, ...gates.colliders];
  const support = (x: number, z: number, y: number) =>
    villaElevatorSupportAt(state, x, z, y) ?? villaSupportAt(x, z, y);
  const move = (p: VillaPosition, dx: number, dz: number) => moveVillaPlayer(p, dx, dz, colliders, support);
  return { gates, colliders, support, move };
}
function walk(state: VillaElevatorState, start: VillaPosition, route: readonly (readonly [number, number])[]) {
  const w = world(state);
  let p = { ...start };
  for (const [x, z] of route) {
    const count = Math.max(1, Math.ceil(Math.hypot(x - p.x, z - p.z) / .05));
    const dx = (x - p.x) / count, dz = (z - p.z) / count;
    for (let i = 0; i < count; i++) {
      const next = w.move(p, dx, dz);
      expect(Math.abs(next.y - p.y)).toBeLessThanOrEqual(.3);
      expect(villaCollides(next, w.colliders)).toBe(false);
      p = next;
    }
    expect(p.x, `route x=${x}, z=${z}`).toBeCloseTo(x, 6);
    expect(p.z, `route x=${x}, z=${z}`).toBeCloseTo(z, 6);
  }
  return p;
}

describe('Villa elevator state machine', () => {
  it('starts closed at ground level and opens a same-floor call without travelling', () => {
    const state = createVillaElevator();
    expect(state).toEqual({ y: 0, floor: 0, target: 0, phase: 'closed', door: 0,
      fromY: 0, travel: 0, riding: false, idleFor: 0 });
    expect(requestVillaElevator(state, 0)).toBe(true);
    expect(state.phase).toBe('opening');
    untilOpen(state);
    expect(state).toMatchObject({ y: 0, floor: 0, target: 0, door: 1, travel: 0, riding: false });
    const before = { ...state };
    expect(requestVillaElevator(state, 0)).toBe(true);
    advanceVillaElevator(state, 10);
    expect(state).toEqual(before);
  });

  it.each(trips)('travels %i → %i monotonically with eased movement and aligned opening', (from, to) => {
    const state = atFloor(from, true);
    expect(requestVillaElevator(state, to, true)).toBe(true);
    expect(state).toMatchObject({ phase: 'closing', target: to, riding: true });
    const direction = Math.sign(to - from), distance = Math.abs(floors[to] - floors[from]);
    const duration = distance / 1.2 + .8;
    const deltas: number[] = [];
    let sawMotion = false, sawArrival = false;
    for (let step = 0; step < 1000 && state.phase !== 'open'; step++) {
      const previous = { ...state };
      advanceVillaElevator(state, .02);
      expect((state.y - previous.y) * direction).toBeGreaterThanOrEqual(-1e-10);
      expect(state.y).toBeGreaterThanOrEqual(Math.min(floors[from], floors[to]));
      expect(state.y).toBeLessThanOrEqual(Math.max(floors[from], floors[to]));
      if (previous.phase === 'closing') {
        expect(state.y).toBe(floors[from]);
        expect(state.door).toBeLessThanOrEqual(previous.door);
      }
      if (previous.phase === 'moving') {
        const t = Math.min(1, state.travel / duration);
        expect(state.y).toBeCloseTo(floors[from] + (floors[to] - floors[from]) * t * t * (3 - 2 * t), 10);
        deltas.push(Math.abs(state.y - previous.y));
        expect(Math.abs(state.y - previous.y)).toBeLessThanOrEqual(1.8 * .02 + 1e-10);
      }
      if (state.phase === 'moving') {
        sawMotion = true;
        expect(state.door).toBe(0);
        expect(state.floor).toBe(from);
        expect(state.riding).toBe(true);
      }
      if (state.phase === 'opening' || state.phase === 'open') {
        sawArrival = true;
        expect(state.y).toBe(floors[to]);
        expect(state.floor).toBe(to);
        if (previous.phase === 'moving') expect(state.door).toBe(0);
      }
      if (state.door > 0) expect(state.y).toBe(floors[state.floor]);
    }
    expect(sawMotion && sawArrival).toBe(true);
    expect(state).toMatchObject({ phase: 'open', floor: to, target: to, y: floors[to], door: 1, riding: false });
    // The first and last motion steps are eased, rather than a constant-speed snap.
    const peak = Math.max(...deltas);
    expect(deltas[0]).toBeLessThan(peak / 10);
    expect(deltas[deltas.length - 1]).toBeLessThan(peak / 10);
  });

  it.each(trips)('keeps an empty call %i → %i unoccupied throughout', (from, to) => {
    const state = atFloor(from);
    expect(requestVillaElevator(state, to)).toBe(true);
    for (let step = 0; step < 1000 && state.phase !== 'open'; step++) {
      advanceVillaElevator(state, .02);
      expect(state.riding).toBe(false);
    }
    expect(state).toMatchObject({ phase: 'open', floor: to, y: floors[to] });
  });

  it.each([-1, 3, 1.5, NaN, Infinity, -Infinity])('rejects invalid destination %s without mutation', floor => {
    const state = atFloor(1, true), before = { ...state };
    expect(requestVillaElevator(state, floor, true)).toBe(false);
    expect(state).toEqual(before);
  });
  it.each(['opening', 'closing', 'moving'] as const)('rejects new requests while %s', phase => {
    const state = { ...atFloor(0), phase, target: 2, riding: true }, before = { ...state };
    for (const floor of [0, 1, 2]) {
      expect(requestVillaElevator(state, floor)).toBe(false);
      expect(state).toEqual(before);
    }
  });
  it('reverses obstructed closing without moving or retaining the cancelled rider request', () => {
    const state = atFloor(1, true);
    requestVillaElevator(state, 2, true);
    advanceVillaElevator(state, .1);
    const door = state.door;
    advanceVillaElevator(state, .02, true);
    expect(state).toMatchObject({ phase: 'opening', y: floors[1], floor: 1, target: 1, riding: false, door });
    untilOpen(state);
    expect(state.y).toBe(floors[1]);
  });
  it.each([0, -.1, NaN, Infinity, -Infinity])('treats unsafe/zero dt=%s as a no-op in every phase', dt => {
    for (const phase of ['closed', 'opening', 'open', 'closing', 'moving'] as const) {
      const state = { ...atFloor(1), phase, target: 2, door: .5, travel: .4 };
      const before = { ...state };
      advanceVillaElevator(state, dt, true);
      expect(state).toEqual(before);
    }
  });
  it('caps very large finite timesteps and creates independent reset states', () => {
    const a = createVillaElevator(), b = createVillaElevator();
    expect(a).not.toBe(b);
    requestVillaElevator(a, 2, true);
    advanceVillaElevator(a, .02);
    const small = { ...a };
    advanceVillaElevator(a, 100);
    advanceVillaElevator(small, .1);
    expect(a).toEqual(small);
    expect(b).toEqual(createVillaElevator());
  });
});

describe('Villa elevator idle closure', () => {
  it.each([0, 1, 2])('closes an empty car on floor %i after four seconds without phantom travel', floor => {
    const s = atFloor(floor, true);
    expect(ELEVATOR_IDLE_SECONDS).toBe(4);
    for (let i = 0; i < 39; i++) idleVillaElevator(s, .1, false, false);
    expect(s.phase).toBe('open'); expect(s.idleFor).toBeCloseTo(3.9);
    idleVillaElevator(s, .1, false, false);
    expect(s).toMatchObject({ phase: 'closing', target: floor, riding: false, idleFor: 0 });
    for (let i = 0; i < 100; i++) {
      advanceVillaElevator(s, .02); idleVillaElevator(s, .02, false, false);
      expect(s.phase).not.toBe('moving'); expect(s.y).toBe(floors[floor]); expect(s.travel).toBe(0);
    }
    expect(s).toMatchObject({ phase: 'closed', door: 0, floor, target: floor });
  });
  it.each([[true, false], [false, true], [true, true]])('holds open with occupied=%s obstructed=%s', (occupied, obstructed) => {
    const s = atFloor(0, true); s.idleFor = 3.9;
    for (let i = 0; i < 120; i++) {
      idleVillaElevator(s, .1, occupied, obstructed); advanceVillaElevator(s, .1, obstructed);
      expect(s).toMatchObject({ phase: 'open', door: 1, idleFor: 0 });
    }
    for (let i = 0; i < 39; i++) idleVillaElevator(s, .1, false, false);
    expect(s.phase).toBe('open');
    idleVillaElevator(s, .1, false, false); expect(s.phase).toBe('closing');
  });
  it.each([[true, false], [false, true]])('reopens idle closure for re-entry occupied=%s obstructed=%s', (occupied, obstructed) => {
    const s = atFloor(1, true); s.idleFor = 3.95;
    idleVillaElevator(s, .1, false, false); advanceVillaElevator(s, .1);
    expect(s.door).toBeLessThan(1);
    const door = s.door; idleVillaElevator(s, .02, occupied, obstructed);
    expect(s).toMatchObject({ phase: 'opening', door, target: 1, idleFor: 0, riding: false });
    untilOpen(s); expect(s.y).toBe(floors[1]); expect(s.travel).toBe(0);
  });
  it('a same-floor call cancels idle closure or resets the open timer', () => {
    const s = atFloor(2, true); s.idleFor = 3.9;
    expect(requestVillaElevator(s, 2)).toBe(true); expect(s.idleFor).toBe(0);
    s.idleFor = 3.95; idleVillaElevator(s, .1, false, false); advanceVillaElevator(s, .1);
    expect(requestVillaElevator(s, 2)).toBe(true); expect(s.phase).toBe('opening');
    untilOpen(s); expect(s).toMatchObject({ y: floors[2], floor: 2, target: 2, travel: 0 });
  });
  it('does not cancel an intentional occupied journey or count idle time during travel', () => {
    const s = atFloor(0, true); requestVillaElevator(s, 2, true);
    idleVillaElevator(s, .1, true, false);
    expect(s).toMatchObject({ phase: 'closing', target: 2, riding: true });
    for (let i = 0; i < 1000 && s.phase !== 'open'; i++) {
      idleVillaElevator(s, .02, true, false); advanceVillaElevator(s, .02);
      expect(s.idleFor).toBe(0);
    }
    expect(s).toMatchObject({ phase: 'open', floor: 2, y: floors[2] });
  });
  it.each([0, -.1, NaN, Infinity, -Infinity])('ignores invalid idle timestep %s on an empty open car', dt => {
    const s = atFloor(1, true); s.idleFor = 2;
    const before = { ...s }; idleVillaElevator(s, dt, false, false); expect(s).toEqual(before);
  });
  it('caps large idle dt and clears stale idle time outside the open phase', () => {
    const s = atFloor(1, true); idleVillaElevator(s, 100, false, false); expect(s.idleFor).toBe(.1);
    for (const phase of ['closed', 'closing', 'opening', 'moving'] as const) {
      const state = { ...s, phase, idleFor: 3 };
      idleVillaElevator(state, .02, false, false); expect(state.idleFor).toBe(0);
    }
  });
});

describe('Villa elevator support and safety gates', () => {
  it.each([0, 1, 2])('blocks every landing except fully open aligned floor %i', floor => {
    const gates = createVillaElevatorColliders();
    for (const phase of ['closed', 'opening', 'open', 'closing', 'moving'] as const) {
      for (const door of [0, .5, .999, 1]) for (const offset of [0, .01]) {
        const state = { ...atFloor(floor), phase, door, y: floors[floor] + offset };
        gates.update(state);
        for (const [landing, y] of floors.entries()) {
          const open = landing === floor && phase === 'open' && door === 1 && offset === 0;
          expect(villaCollides({ x: 0, y, z: VILLA_ELEVATOR.frontZ }, gates.colliders)).toBe(!open);
        }
      }
    }
  });
  it('updates independent collider sets without sharing mutable gate objects', () => {
    const a = createVillaElevatorColliders(), b = createVillaElevatorColliders();
    a.update(atFloor(0, true));
    expect(villaCollides({ x: 0, y: 0, z: -5.1 }, a.colliders)).toBe(false);
    expect(villaCollides({ x: 0, y: 0, z: -5.1 }, b.colliders)).toBe(true);
  });
  it('keeps the mutable cabin ceiling attached between floors and rejects head penetration', () => {
    const gates = createVillaElevatorColliders();
    const ceiling = gates.colliders.find(c => Math.abs(c.minY - 2.3) < 1e-8 && Math.abs(c.maxY - 2.48) < 1e-8)!;
    expect(ceiling).toBeDefined();
    for (const y of [0, 1.8, 3.6, 5.4, 7.2]) {
      gates.update({ ...createVillaElevator(), y });
      expect(ceiling.minY).toBeCloseTo(y + 2.3); expect(ceiling.maxY).toBeCloseTo(y + 2.48);
      expect(villaCollides({ x: 0, y, z: -6.3 }, gates.colliders, 1.75)).toBe(false);
      expect(villaCollides({ x: 0, y: y + .5, z: -6.3 }, gates.colliders, 1.75)).toBe(false);
      expect(villaCollides({ x: 0, y: y + .65, z: -6.3 }, gates.colliders, 1.75)).toBe(true);
    }
    const independent = createVillaElevatorColliders();
    expect(villaCollides({ x: 0, y: .65, z: -6.3 }, independent.colliders, 1.75)).toBe(true);
    expect(villaCollides({ x: 0, y: .65, z: -6.3 }, gates.colliders, 1.75)).toBe(false);
  });
  it('removes static support throughout the shaft on all floors and between floors', () => {
    for (const y of [0, 1.8, 3.6, 5.4, 7.2]) for (const x of [-1, 0, 1]) for (const z of [-7.45, -6.3, -5.11]) {
      expect(villaElevatorShaftContains(x, z)).toBe(true);
      expect(villaSupportAt(x, z, y)).toBeNull();
    }
  });
  it.each([0, 1.8, 3.6, 5.4, 7.2])('supports passengers only at the car at y=%s', y => {
    const state = { ...createVillaElevator(), y };
    expect(villaElevatorSupportAt(state, 0, -6.3, y)).toBe(y);
    expect(villaElevatorSupportAt(state, 0, -6.3, y + .29)).toBe(y);
    for (const oldY of [y + .31, y - .31, NaN, Infinity]) expect(villaElevatorSupportAt(state, 0, -6.3, oldY)).toBeNull();
    for (const [x, z] of [[-1, -6.3], [1, -6.3], [0, -7.41], [0, -5.03]]) {
      expect(villaElevatorSupportAt(state, x, z, y)).toBeNull();
    }
    for (const floorY of floors) if (Math.abs(floorY - y) > .3) {
      expect(world(state).support(0, -6.3, floorY)).toBeNull();
    }
    expect(villaElevatorCabinContains({ x: 0, y, z: -6.3 }, state)).toBe(true);
    expect(villaElevatorCabinContains({ x: 0, y: y + .3, z: -6.3 }, state)).toBe(false);
  });
  it('detects a doorway footprint but not a rider safely inside or on another landing', () => {
    const state = atFloor(1, true);
    for (const [x, z] of [[0, -5.1], [.8, -5.3], [-.8, -4.9]]) {
      expect(villaElevatorDoorwayObstructed({ x, y: floors[1], z }, state)).toBe(true);
    }
    for (const p of [{ x: 0, y: floors[1], z: -6.3 }, { x: 1, y: floors[1], z: -5.1 }, { x: 0, y: 0, z: -5.1 }]) {
      expect(villaElevatorDoorwayObstructed(p, state)).toBe(false);
    }
  });
});

describe('Villa elevator physical world integration', () => {
  it.each([0, 1, 2])('walks both ways through open floor %i and stops at its closed portal', floor => {
    const state = atFloor(floor, true), y = floors[floor];
    const start = { x: 0, y, z: -4.3 };
    const inside = walk(state, start, [[0, -6.3]]);
    expect(inside.y).toBe(y);
    expect(walk(state, inside, [[0, -4.3]])).toEqual(start);
    const w = world(atFloor(floor));
    const stopped = w.move(start, 0, -2);
    expect(stopped.z).toBeGreaterThanOrEqual(-5.04 + PLAYER_RADIUS - 1e-8);
    expect(stopped.z).toBeLessThan(start.z);
    expect(villaCollides(stopped, w.colliders)).toBe(false);
    const withoutCarSupport = moveVillaPlayer(start, 0, -2, world(state).colliders);
    expect(withoutCarSupport.z).toBeGreaterThan(VILLA_ELEVATOR.frontZ);
  });
  it.each([0, 1, 2])('does not tunnel through floor %i gates or the open cabin rear at high speed', floor => {
    const start = { x: 0, y: floors[floor], z: -4.3 };
    for (const carFloor of [0, 1, 2]) {
      const w = world(atFloor(carFloor));
      const stopped = w.move(start, 0, -50);
      expect(stopped.z).toBeGreaterThanOrEqual(-5.04 + PLAYER_RADIUS - 1e-8);
      expect(stopped.y).toBe(start.y);
      expect(villaCollides(stopped, w.colliders)).toBe(false);
    }
    const open = world(atFloor(floor, true)), inside = open.move(start, 0, -50);
    expect(inside.z).toBeLessThan(-6.3);
    expect(inside.z).toBeGreaterThanOrEqual(-7.38 + PLAYER_RADIUS - 1e-8);
    expect(villaCollides(inside, open.colliders)).toBe(false);
  });
  it.each([0, 1, 2])('preserves both narrow bypass routes around the shaft on floor %i', floor => {
    for (const x of [-1.5, 1.5]) {
      const start = { x, y: floors[floor], z: -4.3 };
      const end = walk(atFloor(0), start, [[x, -8]]);
      expect(end.y).toBe(start.y);
      expect(walk(atFloor(0), end, [[x, -4.3]]).z).toBeCloseTo(start.z, 6);
    }
  });
  it('preserves continuous staircase ascent and descent with the elevator enclosure present', () => {
    const state = createVillaElevator();
    const ascent = [[3.2, -6.2], [5.2, -6.2], [5.2, 1.3]] as const;
    const descent = [[5.2, -6.2], [3.2, -6.2], [3.2, 1.3]] as const;
    let p = walk(state, { x: 3.2, y: 0, z: 1.3 }, ascent);
    expect(p.y).toBeCloseTo(floors[1], 6);
    p = walk(state, p, [[3.2, 1.3], ...ascent]);
    expect(p.y).toBeCloseTo(floors[2], 6);
    p = walk(state, p, descent);
    expect(p.y).toBeCloseTo(floors[1], 6);
    p = walk(state, p, [[5.2, 1.3], ...descent]);
    expect(p.y).toBeCloseTo(0, 6);
  });
  it.each(floors)('keeps rendered floor slabs at y=%s completely outside the shaft', y => {
    const slabs = VILLA_BLOCKS.filter(b => !b.solid && Math.abs(b.y + b.h / 2 - y) < 1e-8);
    expect(slabs.length).toBeGreaterThanOrEqual(4);
    for (const slab of slabs) {
      const overlapX = Math.min(slab.x + slab.w / 2, VILLA_ELEVATOR.maxX) - Math.max(slab.x - slab.w / 2, VILLA_ELEVATOR.minX);
      const overlapZ = Math.min(slab.z + slab.d / 2, VILLA_ELEVATOR.maxZ) - Math.max(slab.z - slab.d / 2, VILLA_ELEVATOR.minZ);
      expect(overlapX > 1e-8 && overlapZ > 1e-8, `slab at (${slab.x}, ${slab.z}) overlaps shaft`).toBe(false);
    }
    const covers = (x: number, z: number) => slabs.some(b => Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2);
    for (const [x, z] of [[-1.5, -6.3], [1.5, -6.3], [0, -4.3], [0, -8]]) expect(covers(x, z)).toBe(true);
  });
});
