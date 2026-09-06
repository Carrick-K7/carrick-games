import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { advanceVillaScooter, villaScooterSafeExit, createVillaScooter, isVillaScooterCollider, registerVillaScooterColliders, villaScooterAnchors, villaScooterExitClear, villaScooterFootprint, villaScooterOverlaps, villaScooterPoseBlocked, VILLA_SCOOTER, VILLA_SCOOTER_BOUNDS, VILLA_SCOOTER_LIMITS } from '../../src/games/villaScooter.js';
import { createVillaScooterModel } from '../../src/games/villaScooterModel.js';
import { isVillaVehicleCollider, registerVillaVehicleColliders, villaCarOverlaps, VILLA_SCENIC_ROAD } from '../../src/games/villaDriving.js';
import { createVillaGarden } from '../../src/games/villaGarden.js';
import { VILLA_CAR } from '../../src/games/villaActivities.js';
import { moveVillaPlayer, villaCollides, villaSupportAt, VILLA_WALL_COLLIDERS, POOL, type VillaCollider } from '../../src/games/villaWorld.js';
const idle = { throttle: 0, steer: 0, brake: false, handbrake: false };
const open = () => ({ ...createVillaScooter(), x: 20, z: 25 });
const tick = (state: ReturnType<typeof createVillaScooter>, input = idle, seconds = 1, boxes: VillaCollider[] = []) => {
  for (let i = 0; i < Math.round(seconds * 120); i++) advanceVillaScooter(state, input, 1 / 120, boxes);
};
const box = (x: number, z: number, w = .3, d = .3, height = 1): VillaCollider => ({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, minY: 0, maxY: height });

describe('Villa electric scooter physics and safe interaction', () => {
  it('starts independently parked facing local +Z with the camera offset documented', () => {
    const a = createVillaScooter(), b = createVillaScooter();
    expect(a).toEqual({ x: VILLA_SCOOTER.center.x, z: VILLA_SCOOTER.center.z, yaw: 0, speed: 0, steering: 0, distance: 0, collisions: 0, contact: false, handbrake: false });
    expect(VILLA_SCOOTER).toEqual({ center: { x: 21.5, y: 0, z: 7 }, eyeHeight: 1.44, yaw: Math.PI });
    a.distance = 3; expect(b).toEqual(createVillaScooter()); expect(villaScooterPoseBlocked(b, [])).toBe(false);
  });
  it('keeps the real garden spawn, positive exit and from-south mounting approach clear of the lemon tree', () => {
    const scene = new THREE.Group(), garden = createVillaGarden(scene), model = createVillaScooterModel(scene), state = createVillaScooter();
    try {
      model.update(0, { scooter: state });
      const obstacles = [...VILLA_WALL_COLLIDERS, ...garden.colliders, ...model.colliders];
      const anchors = villaScooterAnchors(state), exit = anchors.exits[0]!;
      expect(exit.x).toBeGreaterThan(state.x); expect(exit.x).toBeCloseTo(22.5); expect(exit.z).toBeCloseTo(6.77);
      expect(villaScooterPoseBlocked(state, obstacles)).toBe(false); // own model is ignored, real trees/walls are not
      expect(model.colliders[0]!.minX).toBeGreaterThan(VILLA_CAR.center.x + VILLA_SCENIC_ROAD.drivewayWidth / 2);
      expect(villaSupportAt(exit.x, exit.z, 0, 1.8)).toBe(0);
      expect(villaCollides(exit, obstacles, 1.8)).toBe(false);
      expect(anchors.interaction).toEqual(exit);
      expect(villaCollides(anchors.interaction, obstacles, 1.8)).toBe(false);
      expect(villaScooterExitClear(state, obstacles, 1)).toBe(true);
      expect(villaScooterSafeExit(state, obstacles)).toEqual(exit);
      // Walk north from the south lawn using the real player movement solver,
      // retaining the scooter collider throughout the approach to its safe side.
      let visitor = { x: exit.x, y: 0, z: exit.z + 5 };
      expect(villaCollides(visitor, obstacles, 1.8)).toBe(false);
      for (let i = 0; i < 100; i++) {
        visitor = moveVillaPlayer(visitor, 0, -.05, obstacles, villaSupportAt, 1.8);
        expect(visitor.x).toBeCloseTo(exit.x); expect(visitor.y).toBe(0);
        expect(villaCollides(visitor, obstacles, 1.8)).toBe(false);
      }
      expect(visitor.z).toBeCloseTo(exit.z);
      // Mounting reverses the same swept exit corridor, excluding ONLY the
      // scooter's own body, not the preserved lemon trunk or villa walls.
      const mountingObstacles = obstacles.filter(c => !isVillaScooterCollider(c));
      for (let i = 1; i <= 40; i++) {
        const target = { x: exit.x + (anchors.seat.x - exit.x) * i / 40, y: 0, z: exit.z + (anchors.seat.z - exit.z) * i / 40 };
        visitor = moveVillaPlayer(visitor, target.x - visitor.x, target.z - visitor.z, mountingObstacles, villaSupportAt, 1.8);
        expect(visitor.x).toBeCloseTo(target.x); expect(visitor.z).toBeCloseTo(target.z);
        expect(villaSupportAt(visitor.x, visitor.z, 0, 1.8)).toBe(0);
        expect(villaCollides(visitor, mountingObstacles, 1.8)).toBe(false);
      }
      expect(visitor.x).toBeCloseTo(anchors.seat.x); expect(visitor.z).toBeCloseTo(anchors.seat.z);
      // Negative control: the retired x22 centre fit, but its positive standing
      // exit intersected the actual lemon tree. Keep this regression meaningful.
      const retired = { ...state, x: 22 }, oldExit = villaScooterAnchors(retired).exits[0]!;
      expect(villaScooterPoseBlocked(retired, mountingObstacles)).toBe(false);
      expect(villaCollides(oldExit, garden.colliders, 1.8)).toBe(true);
      expect(villaScooterExitClear(retired, mountingObstacles, 1)).toBe(false);
    } finally {
      const materials = new Set<THREE.Material>();
      scene.traverse(node => { if (node instanceof THREE.Mesh) { node.geometry.dispose(); (Array.isArray(node.material) ? node.material : [node.material]).forEach(m => materials.add(m)); } });
      materials.forEach(m => m.dispose());
    }
  });
  it('accelerates forwards under 22km/h and coasts without reversing', () => {
    const state = open(); tick(state, { ...idle, throttle: 1 }, 2);
    expect(state.speed).toBeGreaterThan(2); expect(state.z).toBeGreaterThan(27); expect(state.distance).toBeGreaterThan(2);
    const speed = state.speed; tick(state, idle); expect(state.speed).toBeLessThan(speed);
    state.speed = 100; advanceVillaScooter(state, { ...idle, throttle: 1 }, .01, []);
    expect(state.speed).toBeLessThanOrEqual(VILLA_SCOOTER_LIMITS.maxSpeed); expect(state.speed * 3.6).toBeLessThanOrEqual(22);
    tick(state, { ...idle, throttle: -1 }, 2); expect(state.speed).toBe(0);
    const position = { x: state.x, z: state.z }; tick(state, { ...idle, throttle: -1 }); expect({ x: state.x, z: state.z }).toEqual(position);
  });
  it('S/service brake and Space/handbrake override throttle, brake distinctly and release', () => {
    const s = open(), brake = open(), hand = open(); s.speed = brake.speed = hand.speed = 6;
    tick(s, { ...idle, throttle: -1 }, .5); tick(brake, { ...idle, throttle: 1, brake: true }, .5); tick(hand, { ...idle, throttle: 1, handbrake: true }, .5);
    expect(s.speed).toBeCloseTo(brake.speed); expect(hand.speed).toBeLessThan(s.speed); expect(hand.handbrake).toBe(true);
    tick(hand, { ...idle, handbrake: true }, 1); expect(hand.speed).toBe(0);
    tick(hand, { ...idle, throttle: 1 }, .25); expect(hand.handbrake).toBe(false); expect(hand.speed).toBeGreaterThan(0);
  });
  it('smooths analog steer, D/right decreases yaw and turns driver-right, release recentres', () => {
    const right = open(), left = open(), parked = open(); right.speed = left.speed = 3;
    tick(right, { ...idle, steer: .6 }, .25); tick(left, { ...idle, steer: -.6 }, .25);
    expect(right.yaw).toBeLessThan(0); expect(right.x).toBeLessThan(20); expect(left.yaw).toBeGreaterThan(0); expect(left.x).toBeGreaterThan(20);
    expect(right.steering).toBeGreaterThan(.2); expect(right.steering).toBeLessThan(.3);
    const before = right.steering; advanceVillaScooter(right, idle, 1 / 120, []); expect(right.steering).toBeLessThan(before); expect(right.steering).toBeGreaterThan(0);
    tick(right, idle); expect(Math.abs(right.steering)).toBeLessThan(.001);
    tick(parked, { ...idle, steer: 1 }); expect(parked.yaw).toBe(0); expect(parked.x).toBe(20); expect(parked.z).toBe(25);
  });
  it('ignores invalid dt, sanitizes analog input and caps/substeps stalled frames deterministically', () => {
    const state = open(), before = { ...state };
    for (const dt of [0, -1, NaN, Infinity]) advanceVillaScooter(state, { ...idle, throttle: 1 }, dt, []);
    expect(state).toEqual(before);
    advanceVillaScooter(state, { ...idle, throttle: NaN, steer: Infinity }, .1, []); expect(state.speed).toBe(0); expect(state.steering).toBe(0);
    const a = open(), b = open(); advanceVillaScooter(a, { ...idle, throttle: 5, steer: -8 }, 90, []); tick(b, { ...idle, throttle: 1, steer: -1 }, .25);
    expect(a.x).toBeCloseTo(b.x, 12); expect(a.z).toBeCloseTo(b.z, 12); expect(a.speed).toBeCloseTo(b.speed, 12); expect(a.distance).toBeCloseTo(b.distance, 12);
  });
  it('sweeps thin fences, low pets and car-size obstacles without tunnelling or repeated impact counts', () => {
    for (const obstacle of [box(20, 26.7, 3, .01, 2), box(20, 26.7, .3, .3, .3), box(20, 26.7, 1.8, 3.8, 1.5)]) {
      const state = open(); state.z = obstacle.minZ - VILLA_SCOOTER_LIMITS.halfLength - .5; state.speed = 6.1;
      advanceVillaScooter(state, { ...idle, throttle: 1 }, .25, [obstacle]);
      expect(state.contact).toBe(true); expect(state.speed).toBe(0); expect(state.collisions).toBe(1);
      expect(villaScooterFootprint(state).every(p => p.z < obstacle.minZ)).toBe(true);
      advanceVillaScooter(state, { ...idle, throttle: 1 }, .25, [obstacle]); expect(state.collisions).toBe(1);
      advanceVillaScooter(state, { ...idle, throttle: 1 }, .25, []); expect(state.contact).toBe(false); expect(state.speed).toBeGreaterThan(0);
    }
  });
  it('blocks pool, staircase, lift shaft, building walls and property edges without caller geometry', () => {
    for (const pose of [{ x: -18, z: 3, yaw: 0 }, { x: 3, z: 0, yaw: 0 }, { x: 0, z: -6.3, yaw: 0 }, { x: 12, z: 5, yaw: 0 }, { x: 27.2, z: 20, yaw: 0 }]) expect(villaScooterPoseBlocked(pose, [])).toBe(true);
    const state = { ...open(), x: POOL.maxX + VILLA_SCOOTER_LIMITS.halfLength + .6, z: 0, yaw: -Math.PI / 2, speed: 6.1 };
    advanceVillaScooter(state, { ...idle, throttle: 1 }, .25, []); expect(state.contact).toBe(true);
    expect(villaScooterFootprint(state).every(p => p.x > POOL.maxX)).toBe(true);
    const edge = { ...open(), x: VILLA_SCOOTER_BOUNDS.maxX - VILLA_SCOOTER_LIMITS.halfLength - .2, yaw: Math.PI / 2, speed: 6.1 };
    advanceVillaScooter(edge, { ...idle, throttle: 1 }, .25, []); expect(edge.contact).toBe(true);
    expect(villaScooterFootprint(edge).every(p => p.x <= VILLA_SCOOTER_BOUNDS.maxX)).toBe(true);
  });
  it('uses OBB corner contacts and standing rider headroom, excluding floor finishes', () => {
    const pose = { ...open(), yaw: Math.PI / 4 }, corner = villaScooterFootprint(pose)[2]!;
    expect(villaScooterOverlaps(pose, box(corner.x, corner.z, .04, .04))).toBe(true);
    expect(villaScooterOverlaps(pose, box(22, 27, .04, .04))).toBe(false);
    expect(villaScooterOverlaps(pose, { ...box(20, 25), minY: 1.5, maxY: 1.7 })).toBe(true);
    expect(villaScooterOverlaps(pose, { ...box(20, 25), minY: 1.9, maxY: 2.1 })).toBe(false);
    expect(villaScooterOverlaps(pose, { ...box(20, 25), minY: -.1, maxY: .02 })).toBe(false);
  });
  it('ignores only scooter-owned collider identities, never car ownership or copied objects', () => {
    const scooter = box(20, 25), car = box(20, 25); registerVillaScooterColliders([scooter]); registerVillaVehicleColliders([car]);
    expect(isVillaScooterCollider(scooter)).toBe(true); expect(isVillaVehicleCollider(scooter)).toBe(false); expect(isVillaScooterCollider(car)).toBe(false);
    expect(villaScooterOverlaps(open(), scooter)).toBe(false); expect(villaScooterOverlaps(open(), { ...scooter })).toBe(true); expect(villaScooterOverlaps(open(), car)).toBe(true);
    expect(villaCarOverlaps(open(), scooter)).toBe(true);
    expect(villaScooterSafeExit(open(), [scooter])).not.toBeNull();
    expect(villaScooterSafeExit(open(), [scooter, car])).toBeNull();
    expect(villaScooterSafeExit(open(), [{ ...scooter }])).toBeNull();
  });
  it('transforms ground seat/interaction anchors and offers a fully safe alternate exit', () => {
    const pose = open(), anchors = villaScooterAnchors(pose);
    expect(anchors.seat).toEqual({ x: 20, y: 0, z: 24.77 }); expect(anchors.exits).toHaveLength(2);
    expect(villaScooterSafeExit(pose, [])).toEqual(anchors.exits[0]);
    const blocked = box(20.7, 24.77, .04, .08, 1);
    expect(villaScooterExitClear(pose, [blocked], 1)).toBe(false); expect(villaScooterExitClear(pose, [blocked], -1)).toBe(true);
    expect(villaScooterSafeExit(pose, [blocked])).toEqual(anchors.exits[1]);
    expect(villaScooterSafeExit(pose, [blocked, box(19.3, 24.77)])).toBeNull();
    const rotated = villaScooterAnchors({ ...pose, yaw: Math.PI / 2 }); expect(rotated.exits[0]!.z).toBeCloseTo(24); expect(rotated.seat.x).toBeCloseTo(19.77);
    expect(villaScooterSafeExit({ ...pose, yaw: NaN }, [])).toBeNull();
  });
  it('rejects routes through walls, pets, overhead beams or pool even if their endpoint is free', () => {
    const pose = open(); const between = box(20.5, 24.77, .01, .1, .3);
    expect(villaScooterExitClear(pose, [between])).toBe(false);
    expect(villaScooterExitClear(pose, [{ ...between, minY: 1.4, maxY: 1.65 }])).toBe(false);
    expect(villaScooterExitClear({ ...pose, x: POOL.maxX + .35, z: 0 }, [], -1)).toBe(false);
    expect(villaScooterExitClear({ ...pose, x: 27.1 }, [], 1)).toBe(false);
  });
});

describe('Villa scene-owned electric scooter model', () => {
  it('animates bounded fork/lean, both tyres and folding stand with reset-safe state and stable colliders', () => {
    const scene = new THREE.Group(), model = createVillaScooterModel(scene), collider = model.colliders[0]!, reference = collider;
    const root = scene.getObjectByName('rideableElectricScooter')!, front = scene.getObjectByName('scooterFrontWheel')!, rear = scene.getObjectByName('scooterRearWheel')!, fork = scene.getObjectByName('scooterSteeringFork')!, lean = scene.getObjectByName('scooterLean')!, stand = scene.getObjectByName('scooterFoldingStand')!;
    expect(root.userData.wheels).toBe(2); expect(isVillaScooterCollider(collider)).toBe(true);
    const state = { ...open(), speed: 6, steering: .5, distance: 5 };
    expect(model.update(1, { scooter: state, seated: 'scooter' })).toBe(true);
    expect(fork.rotation.y).toBe(-.5); expect(lean.rotation.z).toBeGreaterThan(0); expect(Math.abs(lean.rotation.z)).toBeLessThanOrEqual(.1);
    expect(front.rotation.x).toBe(rear.rotation.x); expect(front.rotation.x).toBeCloseTo((5 / .235) % (Math.PI * 2)); expect(stand.rotation.x).not.toBe(0);
    expect(model.colliders[0]).toBe(reference); expect(collider).toEqual(villaScooterAnchors(state).body);
    expect(model.update(100, { scooter: state, seated: 'scooter' })).toBe(false);
    expect(model.update(101, { scooter: createVillaScooter() })).toBe(true);
    expect(root.position.x).toBe(VILLA_SCOOTER.center.x); expect(root.position.z).toBe(VILLA_SCOOTER.center.z); expect(front.rotation.x).toBe(0); expect(fork.rotation.y).toBe(0); expect(lean.rotation.z).toBe(0); expect(stand.rotation.x).toBe(0);
    scene.traverse(node => { if (node instanceof THREE.Mesh) { node.geometry.dispose(); (Array.isArray(node.material) ? node.material : [node.material]).forEach(m => m.dispose()); } });
  });
  it('places handlebar grips below the actual seated horizon and keeps animated geometry inside the conservative collider', () => {
    const scene = new THREE.Group(), model = createVillaScooterModel(scene), state = createVillaScooter();
    model.update(0, { scooter: state, seated: 'scooter' }); scene.updateMatrixWorld(true);
    const camera = new THREE.PerspectiveCamera(70, 16 / 9, .01, 100), seat = villaScooterAnchors(state).seat;
    camera.position.set(seat.x, VILLA_SCOOTER.eyeHeight, seat.z); camera.lookAt(camera.position.clone().add(new THREE.Vector3(0, 0, 1))); camera.updateMatrixWorld(true);
    const fork = scene.getObjectByName('scooterSteeringFork')!;
    for (const side of [-1, 1]) {
      const point = fork.localToWorld(new THREE.Vector3(side * .313, .846, -.225)).project(camera);
      expect(point.y).toBeLessThan(0); expect(point.y).toBeGreaterThan(-1); expect(Math.abs(point.x)).toBeLessThan(1);
    }
    for (const steering of [-.5, 0, .5]) {
      model.update(1, { scooter: { ...state, speed: 6.1, steering, distance: 1 }, seated: 'scooter' }); scene.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(scene), collider = model.colliders[0]!;
      expect(bounds.min.x).toBeGreaterThanOrEqual(collider.minX); expect(bounds.max.x).toBeLessThanOrEqual(collider.maxX);
      expect(bounds.min.z).toBeGreaterThanOrEqual(collider.minZ); expect(bounds.max.z).toBeLessThanOrEqual(collider.maxZ); expect(bounds.max.y).toBeLessThanOrEqual(collider.maxY);
    }
    scene.traverse(node => { if (node instanceof THREE.Mesh) { node.geometry.dispose(); (Array.isArray(node.material) ? node.material : [node.material]).forEach(m => m.dispose()); } });
  });
});
