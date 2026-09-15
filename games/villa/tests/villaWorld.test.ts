import { describe, expect, it } from 'vitest';
import {
  EYE_HEIGHT, PLAYER_RADIUS, POOL, STAIR_TREAD_THICKNESS, STOREY, VILLA_BLOCKS, VILLA_ENTRANCE, VILLA_HOTSPOTS,
  VILLA_RAILS, VILLA_RAMPS, VILLA_ROOMS, VILLA_SPAWN, VILLA_WALL_COLLIDERS,
  moveVillaPlayer, nearestVillaHotspot, villaCollides, villaFloor, villaRoomAt, villaSupportAt,
  type VillaCollider, type VillaPosition,
} from '../src/villaWorld';
import { VILLA_ESTATE_BOUNDS, VILLA_PICKUP, villaTerrainHeight } from '../src/villaEstateLayout';
import { VILLA_EAST_WALL, VILLA_NORTH_WALL, VILLA_SOUTH_WALL, VILLA_WEST_WALL, VILLA_ESTATE_BOUNDS, VILLA_GARAGE_BAYS } from '../src/villaEstateLayout';
const WEST = VILLA_WEST_WALL, SOUTH = VILLA_SOUTH_WALL, NORTH = VILLA_NORTH_WALL, EAST = VILLA_EAST_WALL;

const architecture = [...VILLA_WALL_COLLIDERS, ...VILLA_RAILS];
type Waypoint = readonly [number, number];
// Follow real routes, never assigning the next floor height or teleporting to waypoints.
function walk(start: VillaPosition, points: readonly Waypoint[], step = 0.05) {
  let p = { ...start };
  for (const [x, z] of points) {
    const count = Math.max(1, Math.ceil(Math.hypot(x - p.x, z - p.z) / step));
    const dx = (x - p.x) / count;
    const dz = (z - p.z) / count;
    for (let i = 0; i < count; i++) {
      const next = moveVillaPlayer(p, dx, dz, architecture);
      expect(Math.abs(next.y - p.y), 'continuous vertical movement').toBeLessThanOrEqual(0.3);
      expect(villaCollides(next, architecture), 'route must not enter architecture').toBe(false);
      p = next;
    }
    expect(p.x, `waypoint x=${x}, z=${z}`).toBeCloseTo(x, 5);
    expect(p.z, `waypoint x=${x}, z=${z}`).toBeCloseTo(z, 5);
  }
  return p;
}
const ascent = [[0.04, -6.2], [2.06, -6.2], [2.06, 1.3]] as const;
const descent = [[2.06, -6.2], [0.04, -6.2], [0.04, 1.3]] as const;

describe('Villa continuous staircase routes', () => {
  it.each([0.05, 0.1])('walks ground → bedrooms → roof and back with %sm steps', step => {
    let p = walk({ x: 0.04, y: 0, z: 1.3 }, ascent, step);
    expect(p.y).toBeCloseTo(STOREY, 6);
    p = walk(p, [[0.04, 1.3], ...ascent], step);
    expect(p.y).toBeCloseTo(2 * STOREY, 6);
    p = walk(p, descent, step);
    expect(p.y).toBeCloseTo(STOREY, 6);
    p = walk(p, [[2.06, 1.3], ...descent], step);
    expect(p.y).toBeCloseTo(0, 6);
  });
  it.each([0, STOREY])('ascends independently from base %s', base => {
    expect(walk({ x: 0.04, y: base, z: 1.3 }, ascent).y).toBeCloseTo(base + STOREY, 6);
  });
  it.each([STOREY, 2 * STOREY])('descends independently from floor height %s', top => {
    expect(walk({ x: 2.06, y: top, z: 1.3 }, descent).y).toBeCloseTo(top - STOREY, 6);
  });
  it.each([0, STOREY])('selects the correct stacked flight and landing on base %s', base => {
    expect(villaSupportAt(0.04, -2.5, base + 0.9)).toBeCloseTo(base + 0.9);
    expect(villaSupportAt(1.2, -6.2, base + 1.8)).toBeCloseTo(base + 1.8);
    expect(villaSupportAt(2.06, -2.5, base + 2.7)).toBeCloseTo(base + 2.7);
  });
  it('lets a player at the exact first-floor height step down onto the lower stacked flight', () => {
    expect(villaSupportAt(2.06, 0.49, STOREY)).toBeCloseTo(3.597, 6);
    const p = moveVillaPlayer({ x: 2.06, y: STOREY, z: 0.55 }, 0, -0.1, architecture);
    expect(p.z).toBeCloseTo(0.45, 6);
    expect(p.y).toBeLessThan(STOREY);
    expect(p.y).toBeGreaterThan(3.5);
  });
  it.each([0.05, 0.1])('walks under the high floating flight but stops before head clipping (%sm)', step => {
    const start = { x: 2.06, y: 0, z: 1.3 };
    let p = walk(start, [[2.06, -4]], step);
    expect(p.y).toBe(0);
    // Continue toward the 1.8m landing. Its underside is too low to stand under.
    for (let i = 0; i < 60; i++) {
      p = moveVillaPlayer(p, 0, -step, architecture);
      expect(p.y, 'under-flight walking must not teleport onto a tread').toBe(0);
      const treadTop = 1.8 + (p.z + 5.5) * 0.3;
      expect(treadTop - STAIR_TREAD_THICKNESS).toBeGreaterThanOrEqual(EYE_HEIGHT + 0.1);
      expect(villaCollides(p, architecture)).toBe(false);
    }
    expect(p.z).toBeLessThan(-4.8);
    expect(p.z).toBeGreaterThanOrEqual(-5.5 + (EYE_HEIGHT + 0.1 + STAIR_TREAD_THICKNESS - 1.8) / 0.3);
    expect(walk(p, [[2.06, 1.3]], step).y).toBe(0);
  });
  it('keeps the full player footprint below actual stepped tread undersides while underneath', () => {
    // villaScene builds twelve 0.5m treads per flight, at the upper height of each segment.
    // Compare the walk surface to those discrete slabs, not just its smooth ramp proxy.
    let p = { x: 2.06, y: 0, z: 1.3 };
    for (let sample = 0; sample < 160; sample++) {
      p = moveVillaPlayer(p, 0, -0.05, architecture);
      expect(p.y).toBe(0);
      for (const ramp of VILLA_RAMPS) {
        if (p.x + PLAYER_RADIUS < ramp.minX || p.x - PLAYER_RADIUS > ramp.maxX) continue;
        for (let i = 0; i < 12; i++) {
          const centerZ = ramp.startZ + (ramp.endZ - ramp.startZ) * (i + 0.5) / 12;
          if (Math.abs(p.z - centerZ) > 0.25 + PLAYER_RADIUS) continue;
          const top = ramp.bottom + (ramp.top - ramp.bottom) * (i + 1) / 12;
          expect(top - STAIR_TREAD_THICKNESS, `tread ${i} over z=${p.z}`).toBeGreaterThanOrEqual(p.y + EYE_HEIGHT + 0.1);
        }
      }
    }
  });
  it('blocks low tread and landing headroom without treating tall flights as solid columns', () => {
    expect(villaSupportAt(2.06, -2.5, 0)).toBe(0);
    expect(villaSupportAt(2.06, -5.4, 0)).toBeNull();
    expect(villaSupportAt(1.2, -6.2, 0)).toBeNull();
    expect(villaSupportAt(0.04, -2.5, 0)).toBeNull();
    expect(villaSupportAt(2.06, -2.5, 2.7)).toBeCloseTo(2.7);
  });
  it('cannot clip the low first flight, cut across the divider, or enter the well sideways', () => {
    expect(villaSupportAt(0.04, -5, 0)).toBeNull();
    expect(villaSupportAt(1.2, -6.2, 0)).toBeNull();
    const lower = moveVillaPlayer({ x: 0.04, y: 0.9, z: -2.5 }, 2, 0, architecture);
    expect(lower.x).toBeLessThan(1.08);
    expect(lower.y).toBeCloseTo(0.9);
    for (const y of [STOREY, 2 * STOREY]) {
      const p = moveVillaPlayer({ x: -3, y, z: -3 }, 4, 0, architecture);
      expect(p.x).toBeLessThan(-0.85);
      expect(p.y).toBe(y);
    }
  });
});

describe('Villa doors and furniture-free room reachability', () => {
  const doors = [
    { name: 'front entrance', from: [0, 0, 11.5], to: [0, 7.5] },
    { name: 'rear garden entrance', from: [0, 0, -10.5], to: [0, -8] },
    { name: 'pool garden entrance', from: [-13, 0, 3.8], to: [-10.5, 3.8] },
    { name: 'internal garage entrance', from: [10.5, 0, 0.5], to: [13.5, 0.5] },
    { name: 'garage rolling door', from: [VILLA_GARAGE_BAYS[0].x, 0, 3.5], to: [VILLA_GARAGE_BAYS[0].x, 0] },
    { name: 'gaming room', from: [4.2, 0, 1.5], to: [4.2, 4.5] },
    { name: 'primary bedroom', from: [-0.5, STOREY, 2.6], to: [-3.5, 2.6] },
    { name: 'guest bedroom', from: [-1.5, STOREY, -3.6], to: [-3.5, -3.6] },
    { name: 'family room', from: [4.2, STOREY, 1.5], to: [4.2, 4.5] },
    { name: 'bathroom', from: [9.5, STOREY, 2], to: [9.5, -0.5] },
    { name: 'bedroom balcony', from: [-7.3, STOREY, 7.5], to: [-7.3, 10] },
  ];
  it.each(doors)('$name is passable in both directions', ({ from, to }) => {
    const start = { x: from[0], y: from[1], z: from[2] };
    const end = walk(start, [[to[0], to[1]]]);
    expect(end.y).toBeCloseTo(start.y);
    expect(walk(end, [[start.x, start.z]]).y).toBeCloseTo(start.y);
  });
  it('reaches every ground-floor room from the front entrance', () => {
    const destinations: { route: Waypoint[]; room: string }[] = [
      { route: [[0, 6], [-5, 6]], room: 'living' },
      { route: [[-1.5, -4], [-5, -4]], room: 'kitchen' },
      // The studio opens off the west aisle; the open stairwell blocks a straight line.
      { route: [[-1.4, 6], [-1.4, -12], [-5, -12]], room: 'utility' },
      // The study opens off the kitchen through its own cased opening.
      { route: [[0, 6], [-5, 6], [-18, 6], [-18, -13]], room: 'studio' },
      { route: [[0, 1.3], [4.2, 1.3], [4.2, 5]], room: 'gaming' },
      { route: [[0, 1.3], [8, 1.3], [8, 0.5], [VILLA_GARAGE_BAYS[2].x, 0.5]], room: 'garage' },
    ];
    for (const { route, room } of destinations) {
      expect(villaRoomAt(walk(VILLA_ENTRANCE, route)).id).toBe(room);
    }
  });
  it('connects upstairs stair exit to both bedrooms, bathroom, family room and balcony', () => {
    const destinations: { route: Waypoint[]; room: string }[] = [
      { route: [[2.06, 1.3], [0, 1.3], [0, 2.6], [-5, 2.6]], room: 'master' },
      { route: [[2.06, 1.3], [-1.5, 1.3], [-1.5, -3.6], [-5, -3.6]], room: 'guest' },
      // Clear the bathroom wall's 0.11m half-thickness plus player radius before turning east.
      { route: [[2.06, 1.3], [6.4, 1.6], [9.5, 1.6], [9.5, -3]], room: 'bath' },
      { route: [[2.06, 1.3], [4.2, 1.3], [4.2, 5]], room: 'family' },
      { route: [[2.06, 1.3], [0, 1.3], [0, 2.6], [-7.3, 2.6], [-7.3, 10]], room: 'balcony' },
    ];
    for (const { route, room } of destinations) {
      expect(villaRoomAt(walk({ x: 2.06, y: STOREY, z: 1.3 }, route)).id).toBe(room);
    }
  });
});

describe('Villa collision, support and safe boundaries', () => {
  it('keeps every room a room: one study per storey and no 22 m halls', () => {
    for (const floor of [0, STOREY]) {
      const rooms = VILLA_ROOMS.filter(room => room.floor === (floor ? 1 : 0) && room.id !== 'gallery' && room.id !== 'balcony');
      // The ground-floor study is 'studio' and the upstairs one 'study'.
      const studies = rooms.filter(room => room.zh.includes('书房'));
      expect(studies, `floor ${floor ? 1 : 0} studies`).toHaveLength(1);
      for (const room of rooms) {
        expect(Math.min(room.maxX - room.minX, room.maxZ - room.minZ), `${room.id} shorter side`).toBeGreaterThan(2.4);
        expect(Math.max(room.maxX - room.minX, room.maxZ - room.minZ), `${room.id} longer side`).toBeLessThanOrEqual(23);
      }
    }
  });
  it('opens a back door off the kitchen as well as the hall, so the stair core is not the only way out', () => {
    // A kitchen door in the west facade: crossing x=WEST.inner inside its span
    // must succeed while the wall itself still blocks elsewhere.
    const through = moveVillaPlayer({ x: WEST.inner + 1.2, y: 0, z: -3.1 }, -3, 0, architecture);
    expect(through.x).toBeLessThan(WEST.outer);
    const blocked = moveVillaPlayer({ x: WEST.inner + 1.2, y: 0, z: -6.5 }, -3, 0, architecture);
    expect(blocked.x).toBeGreaterThan(WEST.inner + PLAYER_RADIUS);
    // Both back doors are walkable, and neither is behind the stair opening.
    for (const z of [-3.1, -18]) {
      const out = moveVillaPlayer({ x: z < -9 ? 0 : WEST.inner + 1.2, y: 0, z: z < -9 ? z + 1.2 : z }, 0, z < -9 ? -3 : -3, architecture);
      expect(Number.isFinite(out.z)).toBe(true);
    }
    expect(villaRoomAt({ x: WEST.inner + 2, y: 0, z: -3.1 }).id).toBe('kitchen');
  });
  it('gives timber door reveals their own faces instead of coplanar plaster surfaces', () => {
    const timber = VILLA_BLOCKS.filter(b => b.material === 'oak' && b.solid && (Math.abs(b.h - 3.04) < 1e-6 || Math.abs(b.h - .08) < 1e-6));
    const plaster = VILLA_BLOCKS.filter(b => b.material === 'plaster');
    expect(timber.length).toBeGreaterThanOrEqual(30);
    for (const frame of timber) for (const wall of plaster) {
      const overlapY = Math.min(frame.y + frame.h / 2, wall.y + wall.h / 2) - Math.max(frame.y - frame.h / 2, wall.y - wall.h / 2);
      if (overlapY < 1e-6) continue;
      for (const [axis, size, other, otherSize] of [['x', 'w', 'z', 'd'], ['z', 'd', 'x', 'w']] as const) {
        const overlap = Math.min(frame[other] + frame[otherSize] / 2, wall[other] + wall[otherSize] / 2) - Math.max(frame[other] - frame[otherSize] / 2, wall[other] - wall[otherSize] / 2);
        if (overlap < 1e-6) continue;
        for (const sign of [-1, 1]) {
          const frameFace = frame[axis] + sign * frame[size] / 2, plasterFace = wall[axis] + sign * wall[size] / 2;
          expect(Math.abs(frameFace - plasterFace), `same-facing ${axis} reveal at ${frame.x},${frame.y},${frame.z}`).toBeGreaterThan(1e-6);
        }
      }
    }
  });
  it('blocks exterior walls and transparent windows on each occupied storey', () => {
    for (const y of [0, STOREY]) {
      for (const x of [-18, 11.5]) {
        const start = { x, y, z: 7 };
        expect(villaCollides(start, architecture)).toBe(false);
        const p = moveVillaPlayer(start, 0, 5, architecture);
        expect(p.z).toBeLessThan(SOUTH.inner - PLAYER_RADIUS);
        expect(villaCollides(p, architecture)).toBe(false);
      }
      const west = moveVillaPlayer({ x: -18, y, z: -6.5 }, -12, 0, architecture);
      expect(west.x).toBeGreaterThan(WEST.inner + PLAYER_RADIUS);
    }
  });
  it('blocks the pool and property bounds even without walls', () => {
    expect(moveVillaPlayer({ x: POOL.maxX + 0.6, y: 0, z: 0 }, -12, 0, []).x).toBeGreaterThan(POOL.maxX + PLAYER_RADIUS);
    expect(moveVillaPlayer({ x: 0, y: 0, z: 22 }, 0, 10, []).z).toBeCloseTo(32);
    expect(moveVillaPlayer({ x: 0, y: villaTerrainHeight(0, 161), z: 161 }, 0, 10, []).z).toBeLessThanOrEqual(VILLA_ESTATE_BOUNDS.maxZ);
    for (const [x, z] of [[-41, 0], [63, 0], [0, -27], [0, 163], [-32, 0]]) {
      expect(villaSupportAt(x, z, 0)).toBeNull();
    }
  });
  it('excludes the west pool from every side while keeping the south deck and pet lawn supported', () => {
    const mid = (POOL.minX + POOL.maxX) / 2, midZ = (POOL.minZ + POOL.maxZ) / 2;
    for (const [x, z] of [[POOL.minX + .4, midZ], [mid, POOL.minZ + .5], [mid, POOL.maxZ - .5], [POOL.maxX - .4, midZ]]) {
      expect(villaSupportAt(x, z, 0)).toBeNull();
    }
    const north = moveVillaPlayer({ x: mid, y: 0, z: POOL.minZ - 1.5 }, 0, 5, []);
    const south = moveVillaPlayer({ x: mid, y: 0, z: POOL.maxZ + 1.5 }, 0, -5, []);
    const west = moveVillaPlayer({ x: POOL.minX - 1.5, y: 0, z: midZ }, 5, 0, []);
    expect(north.z).toBeLessThanOrEqual(POOL.minZ - PLAYER_RADIUS);
    expect(south.z).toBeGreaterThanOrEqual(POOL.maxZ + PLAYER_RADIUS);
    expect(west.x).toBeLessThanOrEqual(POOL.minX - PLAYER_RADIUS);
    // The lounger deck followed the pool west and stays on level ground.
    for (const x of [-33.2, -29.7]) for (const z of [9, 10.85, 13.2, 18]) expect(villaSupportAt(x, z, 0)).toBe(0);
  });
  it('supports all inclusive expanded ground bounds and rejects positions just outside', () => {
    for (const [x, z] of [[VILLA_ESTATE_BOUNDS.minX, 20], [VILLA_ESTATE_BOUNDS.maxX, 20], [0, VILLA_ESTATE_BOUNDS.minZ], [0, 162], [25, 0], [0, 24], [VILLA_ESTATE_BOUNDS.maxX, 162]]) {
      const y = villaTerrainHeight(x, z); expect(villaSupportAt(x, z, y)).toBe(y);
    }
    for (const [x, z] of [[VILLA_ESTATE_BOUNDS.minX - .001, 20], [VILLA_ESTATE_BOUNDS.maxX + .001, 20], [0, VILLA_ESTATE_BOUNDS.minZ - .001], [0, 162.001]]) {
      expect(villaSupportAt(x, z, villaTerrainHeight(x, z))).toBeNull();
    }
    for (const [x, z, dx, dz] of [[VILLA_ESTATE_BOUNDS.minX + .5, 20, -5, 0], [VILLA_ESTATE_BOUNDS.maxX - .5, 20, 5, 0], [0, VILLA_ESTATE_BOUNDS.minZ + .5, 0, -5], [0, 161.5, 0, 5]]) {
      const p = moveVillaPlayer({ x, y: villaTerrainHeight(x, z), z }, dx, dz, []);
      expect(p.x).toBeGreaterThanOrEqual(VILLA_ESTATE_BOUNDS.minX); expect(p.x).toBeLessThanOrEqual(VILLA_ESTATE_BOUNDS.maxX);
      expect(p.z).toBeGreaterThanOrEqual(VILLA_ESTATE_BOUNDS.minZ); expect(p.z).toBeLessThanOrEqual(VILLA_ESTATE_BOUNDS.maxZ);
      expect(p.y).toBe(villaTerrainHeight(p.x, p.z)); expect(villaSupportAt(p.x, p.z, p.y)).toBe(p.y);
    }
  });
  it('allows crouched headroom under low stairs and enforces upper floor undersides', () => {
    for (const [x, z] of [[2.06, -5.4], [1.2, -5.6]]) {
      expect(villaSupportAt(x, z, 0)).toBeNull();
      expect(villaSupportAt(x, z, 0, 1.05)).toBe(0);
      expect(villaSupportAt(x, z, 0, 1.75)).toBeNull();
    }
    // Open ground-floor hall (x=0 is now the lower stair flight).
    expect(villaSupportAt(-3, 5, 0, 3.39)).toBe(0);
    expect(villaSupportAt(-3, 5, 0, 3.41)).toBeNull();
    expect(villaSupportAt(-3, 5, STOREY, 1.75)).toBe(STOREY);
    // Posture never manufactures support inside the swimming pool or empty shaft.
    for (const height of [1.05, 1.75, 2.4]) {
      expect(villaSupportAt((POOL.minX + POOL.maxX) / 2, 0, 0, height)).toBeNull();
      expect(villaSupportAt(4.55, -5.8, 0, height)).toBeNull();
    }
  });
  it('applies optional body height to collision and substepped movement', () => {
    const beam: VillaCollider = { minX: -1, maxX: 1, minZ: 14, maxZ: 15, minY: 1.3, maxY: 1.5 };
    const beneath = { x: 0, y: 0, z: 14.5 };
    expect(villaCollides(beneath, [beam], 1.05)).toBe(false);
    expect(villaCollides(beneath, [beam], 1.75)).toBe(true);
    const start = { x: 0, y: 0, z: 13 };
    const standing = moveVillaPlayer(start, 0, 3, [beam], villaSupportAt, 1.75);
    const crouched = moveVillaPlayer(start, 0, 3, [beam], villaSupportAt, 1.05);
    expect(standing.z).toBeLessThanOrEqual(14 - PLAYER_RADIUS);
    expect(crouched.z).toBeCloseTo(16); expect(crouched.y).toBe(0);
  });
  it('keeps balcony and roof safe on all exposed edges', () => {
    const edges = [
      { p: { x: -5, y: STOREY, z: 10 }, dx: 0, dz: 8, axis: 'z', min: 9, max: 11.45 },
      { p: { x: -10, y: STOREY, z: 10 }, dx: -8, dz: 0, axis: 'x', min: -11.45, max: -9 },
      { p: { x: 0, y: STOREY, z: 10 }, dx: 8, dz: 0, axis: 'x', min: -1, max: 1.45 },
      { p: { x: 0, y: 7.2, z: 7 }, dx: 0, dz: 8, axis: 'z', min: 6, max: SOUTH.outer - .25 },
      { p: { x: -3, y: 7.2, z: -16 }, dx: 0, dz: -8, axis: 'z', min: NORTH.outer + .25, max: -15 },
      { p: { x: -22, y: 7.2, z: 3 }, dx: -8, dz: 0, axis: 'x', min: WEST.outer + .25, max: -21 },
      { p: { x: 26, y: 7.2, z: 3 }, dx: 8, dz: 0, axis: 'x', min: 25, max: EAST.outer - .25 },
    ] as const;
    for (const { p, dx, dz, axis, min, max } of edges) {
      const next = moveVillaPlayer(p, dx, dz, architecture);
      expect(next[axis]).toBeGreaterThan(min);
      expect(next[axis]).toBeLessThan(max);
      expect(next.y).toBe(p.y);
      expect(villaCollides(next, architecture)).toBe(false);
    }
    // The storeys now reach x=16, so probe past the new east edge instead.
    expect(villaSupportAt(EAST.outer + 1, 4, 7.2)).toBeNull();
    expect(villaSupportAt(15.5, 4, 7.2)).toBe(7.2);
    expect(villaSupportAt(WEST.inner + 1, 4, 7.2)).toBe(7.2);
    expect(villaSupportAt(0, 12, STOREY)).toBeNull();
  });
  const furniture: VillaCollider = { minX: -6, maxX: -5, minZ: 1, maxZ: 4, minY: 0, maxY: 1 };
  it('prevents tunnelling through furniture and thin glass under large displacements', () => {
    expect(moveVillaPlayer({ x: -8, y: 0, z: 2 }, 15, 0, [furniture]).x).toBeLessThanOrEqual(-6 - PLAYER_RADIUS);
    expect(moveVillaPlayer({ x: -8, y: 0, z: 2 }, 15, 0, [{ ...furniture, maxX: -5.99 }]).x).toBeLessThan(-6);
    expect(villaCollides({ x: -5.5, y: STOREY, z: 2 }, [furniture])).toBe(false);
  });
  it('slides along furniture without entering it', () => {
    const p = moveVillaPlayer({ x: -6.5, y: 0, z: 1.5 }, 1, 1.5, [furniture]);
    expect(p.x).toBeLessThanOrEqual(-6 - PLAYER_RADIUS);
    expect(p.z).toBeCloseTo(3);
    expect(villaCollides(p, [furniture])).toBe(false);
  });
  it('accepts displacement, not normalized direction; preserves input and rejects invalid/huge movement', () => {
    const start = { x: 0, y: 0, z: 15 };
    const copy = { ...start };
    const moved = moveVillaPlayer(start, 1, 1, []);
    expect(moved.x).toBeCloseTo(1, 8);
    expect(moved.z).toBeCloseTo(16, 8);
    expect(moved.y).toBe(0);
    expect(start).toEqual(copy);
    for (const [dx, dz] of [[NaN, 1], [1, Infinity], [Infinity, 0], [200, 0]]) {
      expect(moveVillaPlayer(start, dx, dz, [])).toEqual(start);
    }
  });
  it('matches visual solids to collider bounds and keeps elevated slabs out of the stair hole', () => {
    expect(VILLA_WALL_COLLIDERS).toEqual(VILLA_BLOCKS.filter(b => b.solid).map(b => ({
      minX: b.x - b.w / 2, maxX: b.x + b.w / 2,
      minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2,
      minY: b.y - b.h / 2, maxY: b.y + b.h / 2,
    })));
    for (const y of [STOREY, 2 * STOREY]) {
      const slabs = VILLA_BLOCKS.filter(b => !b.solid && Math.abs(b.y + b.h / 2 - y) < 1e-8);
      expect(slabs.length).toBeGreaterThanOrEqual(4);
      const covers = (x: number, z: number) => slabs.some(b => Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2);
      for (const [x, z] of [[0.04, -3], [2.06, -3], [1.2, -6.2]]) expect(covers(x, z)).toBe(false);
      for (const [x, z] of [[0, 1], [8, 0], [4.55, -8], [4.55, 1.3]]) expect(covers(x, z)).toBe(true);
    }
  });
});

describe('Villa room and interaction classification', () => {
  it.each(VILLA_ROOMS)('classifies the center of $id in both languages', room => {
    // The terrace centre is now the stairwell opening, so probe its open floor.
    const centre = room.id === 'terrace' ? { x: 0, z: 5 } : { x: (room.minX + room.maxX) / 2, z: (room.minZ + room.maxZ) / 2 };
    const result = villaRoomAt({ x: centre.x, y: room.floor * STOREY, z: centre.z });
    expect(result.id).toBe(room.id);
    expect(result.name).toBe(room.name);
    expect(result.zh).toBe(room.zh);
  });
  it('classifies spawn, entrance, stairs and gallery, and clamps floor indices', () => {
    expect(villaRoomAt(VILLA_SPAWN).id).toBe('garden');
    expect(villaRoomAt(VILLA_ENTRANCE).id).toBe('garden');
    expect(villaRoomAt({ x: 0, y: STOREY, z: 2 }).id).toBe('gallery');
    expect(villaRoomAt({ x: 1.05, y: 1.8, z: -4 }).id).toBe('stairs');
    expect([-10, 0, 3.6, 7.2, 100].map(villaFloor)).toEqual([0, 0, 1, 2, 2]);
  });
  it.each(VILLA_HOTSPOTS)('finds $id locally without selecting fixtures on the wrong floor', hotspot => {
    // Pickup's door surface is inset inside its wider fenders: stand outside them.
    const probe = hotspot.id === 'pickup' ? { ...hotspot, x: VILLA_PICKUP.body.maxX + PLAYER_RADIUS } : hotspot;
    expect(nearestVillaHotspot(probe)?.id).toBe(hotspot.id);
    // New upstairs furniture can occupy the same X/Z. It is selectable only at
    // its own storey, never by identity inherited from the ground-floor fixture.
    const upper = { ...probe, y: hotspot.y + STOREY }, above = nearestVillaHotspot(upper);
    if (above) {
      expect(above.y).toBeCloseTo(upper.y, 6);
      if (hotspot.id !== 'elevator') expect(above.id).not.toBe(hotspot.id);
    }
    expect(nearestVillaHotspot({ ...probe, y: hotspot.y + STOREY / 2 })).toBeNull();
    expect(hotspot.name.length).toBeGreaterThan(0);
    expect(hotspot.zh.length).toBeGreaterThan(0);
  });
  it('selects nearest hotspot and enforces distance and height limits', () => {
    expect(nearestVillaHotspot({ x: -8.2, y: 0, z: 3.5 })?.id).toBe('tea');
    expect(nearestVillaHotspot({ x: 6.65, y: 0.39, z: 4.9 })?.id).toBe('gaming');
    expect(nearestVillaHotspot({ x: 6.65, y: 0.41, z: 4.9 })).toBeNull();
    expect(nearestVillaHotspot({ x: 11.5, y: 0, z: 6 })).toBeNull();
    expect(nearestVillaHotspot(VILLA_SPAWN)).toBeNull();
  });
});
