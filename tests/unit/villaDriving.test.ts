import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createVillaActivities, VILLA_CAR } from '../../src/games/villaActivities.js';
import { advanceVillaDriving, createVillaDriving, isVillaVehicleCollider, villaCarAnchors, villaCarExitClear, villaCarFootprint, villaCarOverlaps, villaDrivingPoseBlocked, VILLA_DRIVING_COURSE } from '../../src/games/villaDriving.js';
import { createVillaVehicle } from '../../src/games/villaVehicle.js';
import { createVillaDrivingCourse } from '../../src/games/villaDrivingCourse.js';
import { moveVillaPlayer, villaCollides, villaSupportAt, VILLA_WALL_COLLIDERS, type VillaCollider } from '../../src/games/villaWorld.js';
const idle = { throttle: 0, steer: 0, brake: false };
const tick = (state: ReturnType<typeof createVillaDriving>, input = idle, seconds = 1, obstacles: readonly VillaCollider[] = []) => {
  for (let i = 0; i < Math.round(seconds * 120); i++) advanceVillaDriving(state, input, 1 / 120, obstacles);
};
const box = (minX: number, maxX: number, minZ: number, maxZ: number, minY = 0, maxY = 1): VillaCollider => ({ minX, maxX, minZ, maxZ, minY, maxY });

describe('Villa driving physics', () => {
  it('starts in the existing seat, drives out of the actual garage and reaches the yard', () => {
    const state = createVillaDriving();
    expect(state).toMatchObject({ x: 16.2, z: -2.6, yaw: 0, speed: 0 });
    tick(state, { ...idle, throttle: 1 }, 6, VILLA_WALL_COLLIDERS);
    expect(state.z).toBeGreaterThan(25); expect(state.x).toBe(16.2);
    expect(state.speed).toBeLessThanOrEqual(7); expect(state.collisions).toBe(0);
  });
  it('reverses slowly, brakes smoothly without changing direction, and coasts', () => {
    const state = createVillaDriving(); tick(state, { ...idle, throttle: -1 }, 1);
    expect(state.z).toBeLessThan(-2.6); expect(state.speed).toBeLessThan(0);
    const speed = state.speed; advanceVillaDriving(state, { ...idle, brake: true }, 1 / 60, []);
    expect(state.speed).toBeGreaterThan(speed); expect(state.speed).toBeLessThan(0);
    tick(state, { ...idle, brake: true }); expect(state.speed).toBe(0);
    state.speed = 2; tick(state); expect(state.speed).toBeGreaterThan(0); expect(state.speed).toBeLessThan(2);
  });
  it('turns right with decreasing yaw and reverses the steering direction in reverse', () => {
    const forward = createVillaDriving(); tick(forward, { ...idle, throttle: 1, steer: 1 });
    expect(forward.yaw).toBeLessThan(0); expect(forward.x).toBeLessThan(16.2);
    const reverse = createVillaDriving(); tick(reverse, { ...idle, throttle: -1, steer: 1 }); expect(reverse.yaw).toBeGreaterThan(0);
    const stationary = createVillaDriving(); tick(stationary, { ...idle, steer: -1 }); expect(stationary.yaw).toBe(0);
  });
  it('tests the oriented footprint, not its enclosing AABB, and includes corner contacts', () => {
    const pose = { x: 0, z: 20, yaw: Math.PI / 4 };
    expect(villaCarOverlaps(pose, box(-2.3, -2.1, 22.1, 22.3))).toBe(false);
    const corner = villaCarFootprint(pose)[2];
    expect(villaCarOverlaps(pose, box(corner.x - 0.03, corner.x + 0.03, corner.z - 0.03, corner.z + 0.03))).toBe(true);
    expect(villaCarOverlaps(pose, box(-2, 2, 18, 22, 2, 4))).toBe(false);
    expect(villaCarOverlaps(pose, box(-2, 2, 18, 22, -0.1, 0.01))).toBe(false);
  });
  it('cannot tunnel through thin walls, keeps contact feedback and can reverse away', () => {
    const state = createVillaDriving(); state.x = 0; state.z = 20; state.speed = 7;
    const wall = box(-5, 5, 23, 23.01);
    advanceVillaDriving(state, { ...idle, throttle: 1 }, 10, [wall]);
    expect(state.z + 2.36).toBeLessThan(23); expect(state.speed).toBe(0); expect(state.contact).toBe(true);
    expect(state.collisions).toBe(1);
    tick(state, { ...idle, throttle: 1 }, 1, [wall]); expect(state.collisions).toBe(1);
    tick(state, { ...idle, throttle: -1 }, 1, [wall]); expect(state.contact).toBe(false); expect(state.z).toBeLessThan(23 - 2.36 - 0.5);
  });
  it('contains the entire vehicle in world bounds and excludes the pool', () => {
    expect(villaDrivingPoseBlocked({ x: 26.5, z: 30, yaw: 0 }, [])).toBe(true);
    expect(villaDrivingPoseBlocked({ x: 0, z: 54, yaw: 0 }, [])).toBe(true);
    expect(villaDrivingPoseBlocked({ x: -18, z: 0, yaw: 0 }, [])).toBe(true);
  });
  it('ignores invalid time and sanitizes inputs', () => {
    const state = createVillaDriving(), original = { ...state };
    advanceVillaDriving(state, idle, NaN, []); advanceVillaDriving(state, idle, -1, []); expect(state).toEqual(original);
    advanceVillaDriving(state, { throttle: NaN, steer: Infinity, brake: false }, 0.1, []); expect(Number.isFinite(state.x)).toBe(true);
  });
});

describe('Villa practice goals and vehicle transforms', () => {
  it('requires genuine reverse travel, containment and a stationary dwell for reverse parking', () => {
    const state = createVillaDriving(); Object.assign(state, { x: -6, z: 31.5 });
    tick(state); expect(state.reverseParked).toBe(false);
    tick(state, { ...idle, throttle: -1 }, 1.1);
    tick(state, { ...idle, brake: true }, 1.5);
    expect(state.reverseParked).toBe(true);
  });
  it('requires a fully contained and aligned stopped parallel park', () => {
    const state = createVillaDriving(); Object.assign(state, { x: -5, z: 48, yaw: 0 }); tick(state); expect(state.parallelParked).toBe(false);
    state.yaw = Math.PI / 2; tick(state); expect(state.parallelParked).toBe(true); expect(state.progress).toContain('Practice 1/4');
  });
  it('visits S and corner checkpoints in order, rather than awarding the last point alone', () => {
    const state = createVillaDriving(); Object.assign(state, VILLA_DRIVING_COURSE.sPoints[3], { speed: 1 });
    advanceVillaDriving(state, idle, 0.01, []); expect(state.sCheckpoint).toBe(0);
    for (const points of [VILLA_DRIVING_COURSE.sPoints, VILLA_DRIVING_COURSE.cornerPoints]) for (const point of points) {
      Object.assign(state, point, { speed: 1 }); advanceVillaDriving(state, idle, 0.01, []);
    }
    expect(state.sCheckpoint).toBe(4); expect(state.cornerCheckpoint).toBe(4); expect(state.progress).toContain('Practice 2/4');
    expect(createVillaDriving()).toMatchObject({ sCheckpoint: 0, cornerCheckpoint: 0, reverseParked: false, parallelParked: false });
  });
  it('rotates existing ground anchors in the same convention as Three', () => {
    const state = createVillaDriving(); const anchors = villaCarAnchors(state);
    expect(anchors.seat.x).toBeCloseTo(VILLA_CAR.seat.x); expect(anchors.exit.z).toBeCloseTo(VILLA_CAR.exit.z);
    Object.assign(state, { x: 0, z: 20, yaw: Math.PI / 2 });
    const rotated = villaCarAnchors(state); expect(rotated.seat.x).toBeCloseTo(0.05); expect(rotated.seat.z).toBeCloseTo(19.57);
    expect(rotated.exit.x).toBeCloseTo(0.15); expect(rotated.exit.z).toBeCloseTo(17.65); expect(rotated.door.y).toBe(0);
  });
  it('updates both collider objects in place, preserves legacy reset and excludes its own body', () => {
    const scene = new THREE.Group(), vehicle = createVillaVehicle(scene), activities = createVillaActivities();
    const [body, door] = vehicle.colliders; expect(body).toEqual(VILLA_CAR.body); expect(isVillaVehicleCollider(body)).toBe(true);
    const driving = createVillaDriving(); Object.assign(driving, { x: 0, z: 30, yaw: Math.PI / 2 });
    expect(vehicle.update(0, { ...activities, driving })).toBe(true);
    expect(vehicle.colliders[0]).toBe(body); expect(vehicle.colliders[1]).toBe(door);
    expect(body.minX).toBeCloseTo(-2.36); expect(body.minZ).toBeCloseTo(29.04);
    expect(door.minZ).toBeGreaterThan(28); expect(door.maxX).toBeLessThan(1);
    expect(villaDrivingPoseBlocked(driving, vehicle.colliders)).toBe(false);
    vehicle.update(1, { ...activities, carDoorOpen: true, driving }); expect(vehicle.doorProgress).toBe(1);
    vehicle.update(0, activities); expect(vehicle.doorProgress).toBe(0); expect(body).toEqual(VILLA_CAR.body);
    expect(scene.getObjectByName('villa-vehicle')?.rotation.y).toBe(0);
  });
  it.each([30, 45, 60])('allows walking to and exiting an angled car at %s degrees', degrees => {
    const root = new THREE.Group(), vehicle = createVillaVehicle(root);
    const state = { ...createVillaDriving(), x: 0, z: 30, yaw: degrees * Math.PI / 180 };
    vehicle.update(0, { ...createVillaActivities(), carDoorOpen: true, driving: state });
    const { seat, exit } = villaCarAnchors(state);
    expect(villaCollides(exit, vehicle.colliders, 1.75)).toBe(false);
    expect(villaCollides(seat, [vehicle.colliders[0]], 1.75)).toBe(true);
    expect(villaCarExitClear(state, vehicle.colliders)).toBe(true);
    const start = { x: exit.x + Math.cos(state.yaw), y: 0, z: exit.z - Math.sin(state.yaw) };
    const walked = moveVillaPlayer(start, exit.x - start.x, exit.z - start.z, vehicle.colliders);
    expect(walked.x).toBeCloseTo(exit.x); expect(walked.z).toBeCloseTo(exit.z);
    const pivot = root.getObjectByName('vehicle-driver-door')!;
    const point = new THREE.Vector3(-0.072, 0.5, -0.6).applyMatrix4(pivot.matrixWorld);
    expect(villaCollides({ x: point.x, y: 0, z: point.z }, [vehicle.colliders[1]], 1.75)).toBe(true);
    // Door-specific narrow phase follows both hinge animation and body rotation.
    vehicle.update(1, { ...createVillaActivities(), driving: state });
    expect(villaCollides({ x: point.x, y: 0, z: point.z }, [vehicle.colliders[1]], 1.75)).toBe(false);
    vehicle.update(0, createVillaActivities());
    expect(vehicle.colliders[0]).toEqual(VILLA_CAR.body);
    expect(villaCollides(exit, vehicle.colliders, 1.75)).toBe(false);
  });
  it('rejects a garage-wall crossing despite a supported and unobstructed endpoint', () => {
    const vehicle = createVillaVehicle(new THREE.Group());
    const state = { ...createVillaDriving(), x: 18.5, z: -0.8 };
    vehicle.update(0, { ...createVillaActivities(), carDoorOpen: true, driving: state });
    const obstacles = [...VILLA_WALL_COLLIDERS, ...vehicle.colliders], exit = villaCarAnchors(state).exit;
    expect(villaDrivingPoseBlocked(state, obstacles)).toBe(false);
    expect(villaSupportAt(exit.x, exit.z, 0)).toBe(0);
    expect(villaCollides(exit, obstacles, 1.75)).toBe(false);
    expect(villaCarExitClear(state, obstacles)).toBe(false);
    expect(villaCarExitClear(createVillaDriving(), obstacles)).toBe(true);
  });
  it('sweeps the person radius and standing headroom, including thin intervening obstacles', () => {
    const state = { ...createVillaDriving(), x: 0, z: 30 };
    expect(villaCarExitClear(state, [])).toBe(true);
    expect(villaCarExitClear(state, [box(1.601, 1.602, 29.8, 30.8)])).toBe(false);
    expect(villaCarExitClear(state, [box(1.5, 1.6, 30.42, 30.43)])).toBe(false); // shoulder, not center line
    expect(villaCarExitClear(state, [box(1.5, 1.6, 30.1, 30.4, 1.6, 1.7)])).toBe(false);
    expect(villaCarExitClear(state, [box(1.5, 1.6, 30.1, 30.4, 2, 2.1)])).toBe(true);
    expect(villaCarExitClear(state, [box(1.5, 1.6, 30.1, 30.4, -0.1, 0)])).toBe(true);
    expect(villaCarExitClear({ ...state, x: -13, z: 0, yaw: Math.PI }, [])).toBe(false); // pool
    expect(villaCarExitClear({ ...state, x: 29 }, [])).toBe(false); // property edge
    expect(villaCarExitClear({ ...state, yaw: NaN }, [])).toBe(false);
  });
  it('provides a clear driveway and physically reachable course fixtures', () => {
    const course = createVillaDrivingCourse(new THREE.Group());
    expect(course.colliders.length).toBeGreaterThan(10);
    for (let z = 3; z <= 30; z++) expect(villaDrivingPoseBlocked({ x: 16.2, z, yaw: 0 }, course.colliders)).toBe(false);
    expect(villaDrivingPoseBlocked({ x: -6, z: 31, yaw: 0 }, course.colliders)).toBe(false);
    expect(villaDrivingPoseBlocked({ x: -5, z: 48, yaw: Math.PI / 2 }, course.colliders)).toBe(false);
    for (const point of VILLA_DRIVING_COURSE.cornerPoints) expect(villaDrivingPoseBlocked({ ...point, yaw: point.z === 47 ? -Math.PI / 2 : 0 }, course.colliders)).toBe(false);
  });
});
