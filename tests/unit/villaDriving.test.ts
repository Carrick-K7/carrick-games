import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createVillaActivities, VILLA_CAR } from '../../src/games/villaActivities.js';
import { advanceVillaDriving, createVillaDriving, isVillaVehicleCollider, villaCarAnchors, villaCarExitClear, villaCarFootprint, villaCarOverlaps, villaDrivingPoseBlocked, VILLA_SCENIC_ROAD } from '../../src/games/villaDriving.js';
import { createVillaVehicle } from '../../src/games/villaVehicle.js';
import { createVillaDrivingCourse } from '../../src/games/villaDrivingCourse.js';
import { moveVillaPlayer, villaCollides, villaSupportAt, VILLA_WALL_COLLIDERS, type VillaCollider } from '../../src/games/villaWorld.js';
const idle = { throttle: 0, steer: 0, brake: false, handbrake: false };
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
  it('distinguishes handbrake, service brake and coasting, with both brakes overriding throttle', () => {
    const coast = createVillaDriving(), service = createVillaDriving(), hand = createVillaDriving();
    for (const state of [coast, service, hand]) Object.assign(state, { x: 0, z: 25, speed: 7 });
    tick(coast, idle, .25); tick(service, { ...idle, throttle: 1, brake: true }, .25); tick(hand, { ...idle, throttle: 1, handbrake: true }, .25);
    expect(hand.speed).toBeLessThan(service.speed); expect(service.speed).toBeLessThan(coast.speed); expect(coast.speed).toBeLessThan(7);
    expect(hand.handbrake).toBe(true); expect(service.handbrake).toBe(false); expect(coast.handbrake).toBe(false);
    expect(hand.speed).toBeCloseTo(7 - 8.5 * .25); expect(service.speed).toBeCloseTo(7 - 5.5 * .25);
    tick(hand, { ...idle, throttle: 1, handbrake: true }, 1); expect(hand.speed).toBe(0);
    const stopped = hand.distance; tick(hand, { ...idle, throttle: 1, handbrake: true }); expect(hand.distance).toBe(stopped);
    // Omitted optional handbrake must clear it, not retain a latched brake.
    advanceVillaDriving(hand, { throttle: 1, steer: 0, brake: false }, .25, []);
    expect(hand.handbrake).toBe(false); expect(hand.speed).toBeGreaterThan(0); expect(hand.distance).toBeGreaterThan(stopped);
  });
  it('stops reverse travel with either brake and recentres analog steering on release', () => {
    for (const input of [{ ...idle, brake: true }, { ...idle, handbrake: true }]) {
      const state = createVillaDriving(); Object.assign(state, { x: 0, z: 25, speed: -3, steering: .3 });
      advanceVillaDriving(state, input, 1 / 120, []); expect(state.speed).toBeGreaterThan(-3); expect(state.speed).toBeLessThan(0);
      tick(state, input); expect(state.speed).toBe(0); expect(state.steering).toBe(0);
    }
    const state = createVillaDriving(); advanceVillaDriving(state, { ...idle, steer: .5 }, 1 / 120, []);
    expect(state.steering).toBeGreaterThan(0); expect(state.steering).toBeLessThan(.28);
    tick(state, { ...idle, steer: .5 }, .25); expect(state.steering).toBeCloseTo(.28);
    advanceVillaDriving(state, idle, 1 / 120, []); expect(state.steering).toBeGreaterThan(0); expect(state.steering).toBeLessThan(.28);
    tick(state, idle, .25); expect(state.steering).toBe(0);
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

describe('Villa scenic road and vehicle transforms', () => {
  it('keeps a free-driving session without retired examination counters or scores', () => {
    const state = createVillaDriving();
    expect(Object.keys(state).sort()).toEqual(['x', 'z', 'yaw', 'speed', 'steering', 'distance', 'collisions', 'contact', 'handbrake'].sort());
    tick(state, { ...idle, throttle: 1 });
    expect(state.distance).toBeGreaterThan(0); expect(state.handbrake).toBe(false);
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
  it('projects the real top marker clockwise for right steer from the actual +Z-facing driver seat without spinning the shaft or car', () => {
    const scene = new THREE.Group(), vehicle = createVillaVehicle(scene), activities = createVillaActivities(), driving = createVillaDriving();
    const car = scene.getObjectByName('villa-vehicle')!, mount = scene.getObjectByName('vehicle-steering')!, wheel = scene.getObjectByName('vehicle-steering-wheel')!, marker = scene.getObjectByName('vehicle-wheel-top-marker')!, cabin = scene.getObjectByName('vehicle-cabin')!;
    expect(wheel.parent).toBe(mount); expect(marker.parent).toBe(wheel); expect(mount.rotation.x).toBe(.30);
    const camera = new THREE.PerspectiveCamera(64, 16 / 9, .01, 100);
    camera.position.set(VILLA_CAR.seat.x, VILLA_CAR.seat.y + VILLA_CAR.eyeHeight, VILLA_CAR.seat.z);
    camera.lookAt(camera.position.clone().add(new THREE.Vector3(0, 0, 1))); camera.updateMatrixWorld(true);
    const project = () => {
      vehicle.update(0, { ...activities, driving }); scene.updateMatrixWorld(true);
      const center = wheel.getWorldPosition(new THREE.Vector3()).project(camera), top = marker.getWorldPosition(new THREE.Vector3()).project(camera);
      return new THREE.Vector2(top.x - center.x, top.y - center.y);
    };
    const neutral = project(), shaftMatrix = mount.matrixWorld.clone(), bodyMatrix = car.matrixWorld.clone(), cabinMatrix = cabin.matrixWorld.clone();
    expect(neutral.x).toBeCloseTo(0); expect(neutral.y).toBeGreaterThan(0);
    tick(driving, { ...idle, steer: .2 }, .15); const right = project();
    expect(wheel.rotation.z).toBeCloseTo(driving.steering * 4.5);
    // NDC is +X right/+Y up: the top marker moving right is clockwise.
    expect(right.x).toBeGreaterThan(0); expect(neutral.cross(right)).toBeLessThan(0);
    expect(mount.matrixWorld.equals(shaftMatrix)).toBe(true); expect(car.matrixWorld.equals(bodyMatrix)).toBe(true); expect(cabin.matrixWorld.equals(cabinMatrix)).toBe(true);
    expect(mount.rotation.z).toBe(0); expect(wheel.rotation.x).toBe(0); expect(wheel.rotation.y).toBe(0);
    tick(driving, { ...idle, steer: -.2 }, .2); const left = project();
    expect(left.x).toBeLessThan(0); expect(neutral.cross(left)).toBeGreaterThan(0);
    tick(driving, idle, .2); const released = project();
    expect(driving.steering).toBe(0); expect(wheel.rotation.z).toBe(0); expect(released.x).toBeCloseTo(neutral.x); expect(released.y).toBeCloseTo(neutral.y);
    expect(mount.matrixWorld.equals(shaftMatrix)).toBe(true); expect(car.matrixWorld.equals(bodyMatrix)).toBe(true);
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
  it('provides a clear driveway and a wide continuous oval with only three island-tree colliders', () => {
    const scene = new THREE.Group(), course = createVillaDrivingCourse(scene), road = VILLA_SCENIC_ROAD;
    expect(course.colliders).toHaveLength(3); expect(road.width).toBeGreaterThan(8); expect(road.drivewayWidth).toBeGreaterThan(8);
    expect(scene.getObjectByName('villa-driving-course')?.userData).toMatchObject({ kind: 'scenic-loop', examination: false, roadWidth: road.width });
    for (const tree of course.colliders) {
      expect(tree.maxX - tree.minX).toBeCloseTo(.3); expect(tree.maxZ - tree.minZ).toBeCloseTo(.3);
      const x = (tree.minX + tree.maxX) / 2, z = (tree.minZ + tree.maxZ) / 2;
      expect(((x - road.x) / (road.radiusX - road.width / 2)) ** 2 + ((z - road.z) / (road.radiusZ - road.width / 2)) ** 2).toBeLessThan(1);
      expect(villaDrivingPoseBlocked({ x, z, yaw: 0 }, course.colliders)).toBe(true);
    }
    for (let z = 3; z <= 34; z++) expect(villaDrivingPoseBlocked({ x: 16.2, z, yaw: 0 }, course.colliders)).toBe(false);
    // Sample the tangent-aligned car on the centre and both broad road lanes.
    for (let i = 0; i < 96; i++) {
      const angle = i / 96 * Math.PI * 2, dx = -road.radiusX * Math.sin(angle), dz = road.radiusZ * Math.cos(angle), length = Math.hypot(dx, dz);
      for (const offset of [-2.2, 0, 2.2]) {
        const pose = { x: road.x + road.radiusX * Math.cos(angle) + dz / length * offset,
          z: road.z + road.radiusZ * Math.sin(angle) - dx / length * offset, yaw: Math.atan2(dx, dz) };
        expect(villaDrivingPoseBlocked(pose, course.colliders)).toBe(false);
      }
    }
    scene.traverse(node => expect(/cone|checkpoint|exam-sign|parking-bay/i.test(node.name)).toBe(false));
    const state = createVillaDriving(); state.distance = 123; course.update(state);
    expect(scene.getObjectByName('villa-driving-course')?.userData.distance).toBe(123);
  });
});
