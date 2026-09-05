import { describe, expect, it } from 'vitest';
import {
  CAR_DOOR_SECONDS, VILLA_CAR, VILLA_RACING, VILLA_RUN_SPEED, VILLA_SNOOKER,
  VILLA_WALK_SPEED, createVillaActivities, nextVillaScreen,
} from '../../src/games/villaActivities';
import {
  PLAYER_RADIUS, STAIR_FINISH_THICKNESS, STAIR_TREAD_THICKNESS, VILLA_BLOCKS,
  VILLA_ENTRANCE, VILLA_RAILS, VILLA_RAMPS, VILLA_WALL_COLLIDERS,
  moveVillaPlayer, nearestVillaHotspot, villaCollides, villaRoomAt, villaSupportAt,
  villaTreadLayers, type VillaCollider, type VillaPosition,
} from '../../src/games/villaWorld';

const architecture = [...VILLA_WALL_COLLIDERS, ...VILLA_RAILS];
const garageCollision = [...architecture, VILLA_CAR.body];
type Waypoint = readonly [number, number];

/** Walk every segment through the public support/collision resolver, no teleporting. */
function follow(start: VillaPosition, points: readonly Waypoint[], colliders: readonly VillaCollider[]) {
  let p = { ...start };
  for (const [x, z] of points) {
    const count = Math.max(1, Math.ceil(Math.hypot(x - p.x, z - p.z) / 0.07));
    const dx = (x - p.x) / count, dz = (z - p.z) / count;
    for (let i = 0; i < count; i++) {
      p = moveVillaPlayer(p, dx, dz, colliders);
      expect(p.y).toBeCloseTo(0, 8);
      expect(villaSupportAt(p.x, p.z, p.y)).toBeCloseTo(0, 8);
      expect(villaCollides(p, colliders)).toBe(false);
    }
    expect(p.x, `route endpoint x=${x}, z=${z}`).toBeCloseTo(x, 7);
    expect(p.z, `route endpoint x=${x}, z=${z}`).toBeCloseTo(z, 7);
  }
  return p;
}

const treads = VILLA_RAMPS.flatMap((ramp, flight) => Array.from({ length: 12 }, (_, step) => ({
  flight, step, top: ramp.bottom + (ramp.top - ramp.bottom) * (step + 1) / 12,
})));

describe('Villa separated structural tread and oak finish', () => {
  it('covers all 48 treads in the four flights', () => {
    expect(VILLA_RAMPS).toHaveLength(4);
    expect(treads).toHaveLength(48);
    expect(STAIR_TREAD_THICKNESS).toBe(0.15);
    expect(STAIR_FINISH_THICKNESS).toBe(0.04);
  });
  it.each(treads)('flight $flight tread $step joins body top to finish bottom, not finish top', ({ top }) => {
    const layer = villaTreadLayers(top);
    expect(layer.bodyTop).toBeCloseTo(layer.finishBottom, 12);
    expect(layer.bodyTop).toBeLessThan(layer.finishTop);
    expect(layer.bodyTop).not.toBe(layer.finishTop);
    expect(layer.finishTop).toBe(top);
    expect(layer.finishTop - layer.bodyBottom).toBeCloseTo(0.15, 12);
    expect(layer.bodyTop - layer.bodyBottom).toBeCloseTo(0.11, 12);
    expect(layer.finishTop - layer.finishBottom).toBeCloseTo(0.04, 12);
  });
});

describe('Villa activity defaults and screen inputs', () => {
  it('returns independently mutable state with the expected defaults', () => {
    const first = createVillaActivities(), second = createVillaActivities();
    expect(first).not.toBe(second);
    expect(first).toEqual({ carDoorOpen: false, seated: null, screenSource: 'pc', displayLights: true });
    first.carDoorOpen = true; first.seated = 'car'; first.screenSource = 'switch'; first.displayLights = false;
    expect(second).toEqual({ carDoorOpen: false, seated: null, screenSource: 'pc', displayLights: true });
    expect(createVillaActivities()).toEqual(second);
    expect(CAR_DOOR_SECONDS).toBe(0.65);
  });
  it('cycles PC → PlayStation → Switch → PC without mutating activity state', () => {
    const state = createVillaActivities();
    const ps = nextVillaScreen(state.screenSource), handheld = nextVillaScreen(ps), pc = nextVillaScreen(handheld);
    expect([ps, handheld, pc]).toEqual(['ps', 'switch', 'pc']);
    expect(nextVillaScreen(pc)).toBe('ps');
    expect(state.screenSource).toBe('pc');
  });
});

describe('Villa walking and running collision integration', () => {
  it('travels further running for the same elapsed time in a clear gallery', () => {
    expect(VILLA_WALK_SPEED).toBe(2.75); expect(VILLA_RUN_SPEED).toBe(5.8);
    const start = { x: 0, y: 0, z: 6 }, seconds = 0.5;
    const walk = moveVillaPlayer(start, 0, -VILLA_WALK_SPEED * seconds, architecture);
    const run = moveVillaPlayer(start, 0, -VILLA_RUN_SPEED * seconds, architecture);
    expect(start.z - walk.z).toBeCloseTo(1.375, 8);
    expect(start.z - run.z).toBeCloseTo(2.9, 8);
    expect(run.z).toBeLessThan(walk.z);
    expect(villaCollides(run, architecture)).toBe(false);
    expect(start).toEqual({ x: 0, y: 0, z: 6 });
  });
  it.each([VILLA_WALK_SPEED, VILLA_RUN_SPEED])('does not tunnel through a thin exterior wall at %s m/s', speed => {
    const p = moveVillaPlayer({ x: -8.11, y: 0, z: -7 }, 0, -speed * 2, architecture);
    expect(p.z).toBeGreaterThanOrEqual(-8.89 + PLAYER_RADIUS);
    expect(p.z).toBeLessThan(-8.5);
    expect(villaCollides(p, architecture)).toBe(false);
    expect(p.y).toBe(0);
  });
  it('stops a large running displacement at the car body rather than crossing it', () => {
    expect(villaCollides(VILLA_CAR.exit, garageCollision)).toBe(false);
    expect(villaCollides(VILLA_CAR.seat, [VILLA_CAR.body])).toBe(true);
    const p = moveVillaPlayer(VILLA_CAR.exit, -VILLA_RUN_SPEED, 0, garageCollision);
    expect(p.x).toBeGreaterThanOrEqual(VILLA_CAR.body.maxX + PLAYER_RADIUS);
    expect(p.x).toBeLessThan(VILLA_CAR.body.maxX + PLAYER_RADIUS + 0.09);
    expect(p.z).toBe(VILLA_CAR.exit.z);
    expect(villaCollides(p, garageCollision)).toBe(false);
  });
});

describe('Villa seats, exits and driver-side access', () => {
  it('keeps the car seat inside a metre-scale body and its exit beyond the driver side', () => {
    const { body, seat, exit, door, center } = VILLA_CAR;
    expect(body.maxX - body.minX).toBeCloseTo(1.92);
    expect(body.maxZ - body.minZ).toBeCloseTo(4.72);
    expect(body.maxY - body.minY).toBeCloseTo(1.48);
    expect((body.minX + body.maxX) / 2).toBeCloseTo(center.x);
    expect((body.minZ + body.maxZ) / 2).toBeCloseTo(center.z);
    expect(seat.x).toBeGreaterThan(center.x); expect(seat.x).toBeLessThan(body.maxX);
    expect(seat.z).toBeGreaterThan(body.minZ); expect(seat.z).toBeLessThan(body.maxZ);
    expect(door.x).toBeGreaterThan(body.maxX);
    expect(exit.x - body.maxX).toBeGreaterThan(PLAYER_RADIUS);
    expect(exit.x + PLAYER_RADIUS).toBeLessThan(19.89);
    expect(VILLA_CAR.eyeHeight).toBe(1.16); expect(VILLA_CAR.yaw).toBe(Math.PI);
  });
  it('reaches the driver exit through the internal garage door and walks back without crossing the car', () => {
    const route: Waypoint[] = [[0, 1.3], [8, 1.3], [8, 0.5], [18.55, 0.5], [VILLA_CAR.exit.x, VILLA_CAR.exit.z]];
    const p = follow(VILLA_ENTRANCE, route, garageCollision);
    expect(p.x).toBeCloseTo(VILLA_CAR.exit.x); expect(p.z).toBeCloseTo(VILLA_CAR.exit.z);
    expect(villaRoomAt(p).id).toBe('garage');
    expect(nearestVillaHotspot(p)?.id).toBe('car');
    follow(p, [[18.55, 0.5], [8, 0.5], [8, 1.3], [0, 1.3], [VILLA_ENTRANCE.x, VILLA_ENTRANCE.z]], garageCollision);
  });
  it('keeps both seats and exits supported and clear of architectural walls', () => {
    for (const p of [VILLA_CAR.seat, VILLA_CAR.exit, VILLA_RACING.seat, VILLA_RACING.exit]) {
      expect(p.y).toBe(0);
      expect(villaSupportAt(p.x, p.z, p.y)).toBe(0);
      expect(villaCollides(p, architecture)).toBe(false);
    }
    // Seating intentionally enters the car collider; ordinary walking must not.
    expect(villaCollides(VILLA_CAR.seat, garageCollision)).toBe(true);
    expect(villaCollides(VILLA_CAR.exit, garageCollision)).toBe(false);
  });
  it('reaches the racing exit through its room door, with seat facing the screen', () => {
    const p = follow(VILLA_ENTRANCE, [[0, 1.3], [4.2, 1.3], [4.2, 4.8], [8.15, 4.8], [VILLA_RACING.exit.x, VILLA_RACING.exit.z]], architecture);
    expect(villaRoomAt(p).id).toBe('gaming'); expect(nearestVillaHotspot(p)?.id).toBe('racing');
    const seat = follow(p, [[VILLA_RACING.seat.x, VILLA_RACING.seat.z]], architecture);
    expect(VILLA_RACING.screen.x).toBeCloseTo(seat.x, 8);
    expect(VILLA_RACING.screen.z).toBeGreaterThan(seat.z);
    expect(VILLA_RACING.screen.y).toBeGreaterThan(VILLA_RACING.eyeHeight);
    expect(VILLA_RACING.seat.x - VILLA_RACING.exit.x).toBeCloseTo(1.65);
    expect(VILLA_RACING.eyeHeight).toBe(1.12); expect(VILLA_RACING.yaw).toBe(Math.PI);
  });
  it('offers the car hotspot only on the driver side, not from inside or across the body', () => {
    expect(nearestVillaHotspot(VILLA_CAR.exit)?.id).toBe('car');
    expect(nearestVillaHotspot({ x: VILLA_CAR.body.maxX + PLAYER_RADIUS + 0.02, y: 0, z: VILLA_CAR.door.z })?.id).toBe('car');
    for (const p of [VILLA_CAR.seat, VILLA_CAR.center, { x: VILLA_CAR.body.minX - PLAYER_RADIUS - 0.02, y: 0, z: VILLA_CAR.door.z }]) {
      expect(nearestVillaHotspot(p)?.id).not.toBe('car');
    }
    expect(nearestVillaHotspot({ ...VILLA_CAR.exit, y: 3.6 })?.id).not.toBe('car');
  });
});

describe('Villa snooker dimensions and actual mounting walls', () => {
  it('uses the full-size playing dimensions within its outer footprint and clear circulation', () => {
    expect(VILLA_SNOOKER).toEqual({ center: { x: 9.15, y: 0, z: -3.8 }, width: 2.16, length: 4.06, playingWidth: 1.778, playingLength: 3.569, height: 0.86 });
    const { center, width, length, playingWidth, playingLength } = VILLA_SNOOKER;
    expect(playingWidth).toBeLessThan(width); expect(playingLength).toBeLessThan(length);
    expect(center.x - width / 2 - 6.3).toBeGreaterThan(1.5);
    expect(12 - center.x - width / 2).toBeGreaterThan(1.5);
    expect(1.3 - center.z - length / 2).toBeGreaterThan(1.5);
    expect(center.z - length / 2 + 9).toBeGreaterThan(1.5);
    expect(villaRoomAt(center).id).toBe('snooker');
  });
  it.each([
    { name: 'cue rack', x: 10.45, y: 1.4, z: -9 },
    { name: 'extractor hood', x: -8.11, y: 2.04, z: -9 },
  ])('$name is mounted to solid plaster rather than glazing or an opening', ({ x, y, z }) => {
    const covering = VILLA_BLOCKS.filter(b => Math.abs(x - b.x) <= b.w / 2 && Math.abs(y - b.y) <= b.h / 2 && Math.abs(z - b.z) <= b.d / 2);
    expect(covering.some(b => b.solid && b.material === 'plaster')).toBe(true);
    expect(covering.some(b => b.material === 'glass')).toBe(false);
    expect(VILLA_WALL_COLLIDERS.some(c => x >= c.minX && x <= c.maxX && y >= c.minY && y <= c.maxY && z >= c.minZ && z <= c.maxZ)).toBe(true);
  });
});
