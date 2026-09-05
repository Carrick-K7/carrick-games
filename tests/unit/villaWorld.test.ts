import { describe, expect, it } from 'vitest';
import {
  EYE_HEIGHT, PLAYER_RADIUS, STAIR_TREAD_THICKNESS, STOREY, VILLA_BLOCKS, VILLA_ENTRANCE, VILLA_HOTSPOTS,
  VILLA_RAILS, VILLA_RAMPS, VILLA_ROOMS, VILLA_SPAWN, VILLA_WALL_COLLIDERS,
  moveVillaPlayer, nearestVillaHotspot, villaCollides, villaFloor, villaRoomAt, villaSupportAt,
  type VillaCollider, type VillaPosition,
} from '../../src/games/villaWorld';

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
const ascent = [[3.2, -6.2], [5.2, -6.2], [5.2, 1.3]] as const;
const descent = [[5.2, -6.2], [3.2, -6.2], [3.2, 1.3]] as const;

describe('Villa continuous staircase routes', () => {
  it.each([0.05, 0.1])('walks ground → bedrooms → roof and back with %sm steps', step => {
    let p = walk({ x: 3.2, y: 0, z: 1.3 }, ascent, step);
    expect(p.y).toBeCloseTo(STOREY, 6);
    p = walk(p, [[3.2, 1.3], ...ascent], step);
    expect(p.y).toBeCloseTo(2 * STOREY, 6);
    p = walk(p, descent, step);
    expect(p.y).toBeCloseTo(STOREY, 6);
    p = walk(p, [[5.2, 1.3], ...descent], step);
    expect(p.y).toBeCloseTo(0, 6);
  });
  it.each([0, STOREY])('ascends independently from base %s', base => {
    expect(walk({ x: 3.2, y: base, z: 1.3 }, ascent).y).toBeCloseTo(base + STOREY, 6);
  });
  it.each([STOREY, 2 * STOREY])('descends independently from floor height %s', top => {
    expect(walk({ x: 5.2, y: top, z: 1.3 }, descent).y).toBeCloseTo(top - STOREY, 6);
  });
  it.each([0, STOREY])('selects the correct stacked flight and landing on base %s', base => {
    expect(villaSupportAt(3.2, -2.5, base + 0.9)).toBeCloseTo(base + 0.9);
    expect(villaSupportAt(4.2, -6.2, base + 1.8)).toBeCloseTo(base + 1.8);
    expect(villaSupportAt(5.2, -2.5, base + 2.7)).toBeCloseTo(base + 2.7);
  });
  it('lets a player at the exact first-floor height step down onto the lower stacked flight', () => {
    expect(villaSupportAt(5.2, 0.49, STOREY)).toBeCloseTo(3.597, 6);
    const p = moveVillaPlayer({ x: 5.2, y: STOREY, z: 0.55 }, 0, -0.1, architecture);
    expect(p.z).toBeCloseTo(0.45, 6);
    expect(p.y).toBeLessThan(STOREY);
    expect(p.y).toBeGreaterThan(3.5);
  });
  it.each([0.05, 0.1])('walks under the high floating flight but stops before head clipping (%sm)', step => {
    const start = { x: 5.2, y: 0, z: 1.3 };
    let p = walk(start, [[5.2, -4]], step);
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
    expect(walk(p, [[5.2, 1.3]], step).y).toBe(0);
  });
  it('keeps the full player footprint below actual stepped tread undersides while underneath', () => {
    // villaScene builds twelve 0.5m treads per flight, at the upper height of each segment.
    // Compare the walk surface to those discrete slabs, not just its smooth ramp proxy.
    let p = { x: 5.2, y: 0, z: 1.3 };
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
    expect(villaSupportAt(5.2, -2.5, 0)).toBe(0);
    expect(villaSupportAt(5.2, -5.4, 0)).toBeNull();
    expect(villaSupportAt(4.2, -6.2, 0)).toBeNull();
    expect(villaSupportAt(3.2, -2.5, 0)).toBeNull();
    expect(villaSupportAt(5.2, -2.5, 2.7)).toBeCloseTo(2.7);
  });
  it('cannot clip the low first flight, cut across the divider, or enter the well sideways', () => {
    expect(villaSupportAt(3.2, -5, 0)).toBeNull();
    expect(villaSupportAt(4.2, -6.2, 0)).toBeNull();
    const lower = moveVillaPlayer({ x: 3.2, y: 0.9, z: -2.5 }, 2, 0, architecture);
    expect(lower.x).toBeLessThan(4.08);
    expect(lower.y).toBeCloseTo(0.9);
    for (const y of [STOREY, 2 * STOREY]) {
      const p = moveVillaPlayer({ x: 1, y, z: -3 }, 4, 0, architecture);
      expect(p.x).toBeLessThan(2.15);
      expect(p.y).toBe(y);
    }
  });
});

describe('Villa doors and furniture-free room reachability', () => {
  const doors = [
    { name: 'front entrance', from: [0, 0, 11.5], to: [0, 7.5] },
    { name: 'rear garden entrance', from: [0, 0, -10.5], to: [0, -7.5] },
    { name: 'pool garden entrance', from: [-13, 0, 3.8], to: [-10.5, 3.8] },
    { name: 'internal garage entrance', from: [10.5, 0, 0.5], to: [13.5, 0.5] },
    { name: 'garage rolling door', from: [16, 0, 3.5], to: [16, 0.5] },
    { name: 'gaming room', from: [4.2, 0, 1.5], to: [4.2, 4.5] },
    { name: 'primary bedroom', from: [-0.5, STOREY, 2.6], to: [-3.5, 2.6] },
    { name: 'guest bedroom', from: [-0.5, STOREY, -3.6], to: [-3.5, -3.6] },
    { name: 'library', from: [4.2, STOREY, 1.5], to: [4.2, 4.5] },
    { name: 'bathroom', from: [8.3, STOREY, 2], to: [8.3, -0.5] },
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
      { route: [[0, -4], [-5, -4]], room: 'kitchen' },
      { route: [[0, 1.3], [4.2, 1.3], [4.2, 5]], room: 'gaming' },
      { route: [[0, 1.3], [8, 1.3], [8, 0.5], [16, 0.5]], room: 'garage' },
    ];
    for (const { route, room } of destinations) {
      expect(villaRoomAt(walk(VILLA_ENTRANCE, route)).id).toBe(room);
    }
  });
  it('connects upstairs stair exit to both bedrooms, bathroom, library and balcony', () => {
    const destinations: { route: Waypoint[]; room: string }[] = [
      { route: [[0, 1.3], [0, 2.6], [-5, 2.6]], room: 'master' },
      { route: [[0, 1.3], [0, -3.6], [-5, -3.6]], room: 'guest' },
      // Clear the bathroom wall's 0.11m half-thickness plus player radius before turning east.
      { route: [[5.2, 1.6], [8.3, 1.6], [8.3, -3]], room: 'bath' },
      { route: [[4.2, 1.3], [4.2, 5]], room: 'library' },
      { route: [[0, 1.3], [0, 2.6], [-7.3, 2.6], [-7.3, 10]], room: 'balcony' },
    ];
    for (const { route, room } of destinations) {
      expect(villaRoomAt(walk({ x: 5.2, y: STOREY, z: 1.3 }, route)).id).toBe(room);
    }
  });
});

describe('Villa collision, support and safe boundaries', () => {
  it('blocks exterior walls and transparent windows on each occupied storey', () => {
    for (const y of [0, STOREY]) {
      for (const x of [-5.5, 11.5]) {
        const start = { x, y, z: 7 };
        expect(villaCollides(start, architecture)).toBe(false);
        const p = moveVillaPlayer(start, 0, 5, architecture);
        expect(p.z).toBeLessThan(9 - PLAYER_RADIUS);
        expect(villaCollides(p, architecture)).toBe(false);
      }
      const west = moveVillaPlayer({ x: -10, y, z: -4 }, -5, 0, architecture);
      expect(west.x).toBeGreaterThan(-12 + PLAYER_RADIUS);
    }
  });
  it('blocks the pool and property bounds even without walls', () => {
    expect(moveVillaPlayer({ x: -13, y: 0, z: 0 }, -12, 0, []).x).toBeGreaterThan(-14.5 + PLAYER_RADIUS);
    expect(moveVillaPlayer({ x: 0, y: 0, z: 22 }, 0, 10, []).z).toBeLessThanOrEqual(23.5);
    for (const [x, z] of [[-25, 0], [25, 0], [0, -17], [0, 24], [-18, 0]]) {
      expect(villaSupportAt(x, z, 0)).toBeNull();
    }
  });
  it('keeps balcony and roof safe on all exposed edges', () => {
    const edges = [
      { p: { x: -5, y: STOREY, z: 10 }, dx: 0, dz: 8, axis: 'z', min: 9, max: 11.45 },
      { p: { x: -10, y: STOREY, z: 10 }, dx: -8, dz: 0, axis: 'x', min: -11.45, max: -9 },
      { p: { x: 0, y: STOREY, z: 10 }, dx: 8, dz: 0, axis: 'x', min: -1, max: 1.45 },
      { p: { x: 0, y: 7.2, z: 7 }, dx: 0, dz: 8, axis: 'z', min: 6, max: 8.95 },
      { p: { x: 0, y: 7.2, z: -7 }, dx: 0, dz: -8, axis: 'z', min: -8.95, max: -6 },
      { p: { x: -10, y: 7.2, z: 3 }, dx: -8, dz: 0, axis: 'x', min: -11.95, max: -9 },
      { p: { x: 10, y: 7.2, z: 3 }, dx: 8, dz: 0, axis: 'x', min: 9, max: 11.95 },
    ] as const;
    for (const { p, dx, dz, axis, min, max } of edges) {
      const next = moveVillaPlayer(p, dx, dz, architecture);
      expect(next[axis]).toBeGreaterThan(min);
      expect(next[axis]).toBeLessThan(max);
      expect(next.y).toBe(p.y);
      expect(villaCollides(next, architecture)).toBe(false);
    }
    expect(villaSupportAt(13, 4, 7.2)).toBeNull();
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
      for (const [x, z] of [[3.2, -3], [5.2, -3], [4.2, -6.2]]) expect(covers(x, z)).toBe(false);
      for (const [x, z] of [[0, 0], [8, 0], [4.2, -8], [4.2, 1.3]]) expect(covers(x, z)).toBe(true);
    }
  });
});

describe('Villa room and interaction classification', () => {
  it.each(VILLA_ROOMS)('classifies the center of $id in both languages', room => {
    const result = villaRoomAt({ x: (room.minX + room.maxX) / 2, y: room.floor * STOREY, z: (room.minZ + room.maxZ) / 2 });
    expect(result.id).toBe(room.id);
    expect(result.name).toBe(room.name);
    expect(result.zh).toBe(room.zh);
  });
  it('classifies spawn, entrance, stairs and gallery, and clamps floor indices', () => {
    expect(villaRoomAt(VILLA_SPAWN).id).toBe('garden');
    expect(villaRoomAt(VILLA_ENTRANCE).id).toBe('garden');
    expect(villaRoomAt({ x: 0, y: STOREY, z: 2 }).id).toBe('gallery');
    expect(villaRoomAt({ x: 3.2, y: 1.8, z: -4 }).id).toBe('stairs');
    expect([-10, 0, 3.6, 7.2, 100].map(villaFloor)).toEqual([0, 0, 1, 2, 2]);
  });
  it.each(VILLA_HOTSPOTS)('finds $id locally but never from another floor', hotspot => {
    expect(nearestVillaHotspot(hotspot)?.id).toBe(hotspot.id);
    expect(nearestVillaHotspot({ ...hotspot, y: hotspot.y + STOREY })).toBeNull();
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
