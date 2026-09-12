import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { advanceVillaPickup, createVillaPickup, isVillaPickupCollider, villaPickupAnchors, villaPickupExitClear, villaPickupFootprint, villaPickupOverlaps, villaPickupPoseBlocked, villaPickupSafeExit, VILLA_PICKUP, VILLA_PICKUP_LIMITS } from '../src/villaPickup.js';
import { createVillaPickupModel } from '../src/villaPickupModel.js';
import { createVillaVehicle } from '../src/villaVehicle.js';
import { createVillaDriving, isVillaVehicleCollider, villaCarOverlaps } from '../src/villaDriving.js';
import { createVillaScooterModel } from '../src/villaScooterModel.js';
import { createVillaScooter, isVillaScooterCollider, villaScooterOverlaps } from '../src/villaScooter.js';
import { createVillaActivities } from '../src/villaActivities.js';
import { VILLA_ESTATE_BOUNDS, villaTerrainHeight, villaTerrainOrientation } from '../src/villaEstateLayout.js';
import { VILLA_WALL_COLLIDERS, villaCollides, type VillaCollider } from '../src/villaWorld.js';
const idle = { throttle: 0, steer: 0, brake: false, handbrake: false };
const tick = (state: ReturnType<typeof createVillaPickup>, input = idle, seconds = 1, obstacles: readonly VillaCollider[] = []) => { for (let i = 0; i < Math.round(seconds * 120); i++) advanceVillaPickup(state, input, 1 / 120, obstacles); };
const dispose = (root: THREE.Object3D) => { const materials = new Set<THREE.Material>(); root.traverse(n => { if (n instanceof THREE.Mesh) { n.geometry.dispose(); (Array.isArray(n.material) ? n.material : [n.material]).forEach(m => materials.add(m)); } }); materials.forEach(m => m.dispose()); };
const box = (x: number, z: number, y = 0, w = .15, d = .15, h = 1): VillaCollider => ({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, minY: y, maxY: y + h });

describe('Villa pickup independent driving profile and safety', () => {
  it('has distinct dimensions, wheelbase and anchors and leaves the expanded second garage bay', () => {
    const state = createVillaPickup(); expect(state).toMatchObject({ x: 21.5, z: -2.6, yaw: 0, speed: 0 });
    const a = villaPickupAnchors(state); expect(a.seat).toEqual(VILLA_PICKUP.seat); expect(a.exit).toEqual(VILLA_PICKUP.exit); expect(a.body).toEqual(VILLA_PICKUP.body);
    expect(VILLA_PICKUP_LIMITS.wheelbase).toBeGreaterThan(3); expect(VILLA_PICKUP.eyeHeight).toBeGreaterThan(1.5);
    tick(state, { ...idle, throttle: 1 }, 6, VILLA_WALL_COLLIDERS); expect(state.z).toBeGreaterThan(23); expect(state.x).toBe(21.5); expect(state.collisions).toBe(0); expect(state.speed).toBeLessThanOrEqual(VILLA_PICKUP_LIMITS.maxSpeed);
  });
  it('retains common smooth brakes, bounded reverse and opposite reverse steering', () => {
    const forward = { ...createVillaPickup(), x: 10, z: 70 }, reverse = { ...forward };
    tick(forward, { ...idle, throttle: 1, steer: .6 }, 1); tick(reverse, { ...idle, throttle: -1, steer: .6 }, 1);
    expect(forward.yaw).toBeLessThan(0); expect(reverse.yaw).toBeGreaterThan(0); expect(reverse.speed).toBeLessThan(0);
    const speed = reverse.speed; advanceVillaPickup(reverse, { ...idle, throttle: 1 }, 1 / 120, []); expect(reverse.speed).toBeGreaterThan(speed); expect(reverse.speed).toBeLessThan(0);
    tick(reverse, { ...idle, handbrake: true }); expect(reverse.speed).toBe(0); const distance = reverse.distance; tick(reverse, { ...idle, throttle: 1, handbrake: true }); expect(reverse.distance).toBe(distance);
  });
  it('sweeps thin obstacles and low pets on hills, with terrain-relative height and no tunnelling', () => {
    const state = { ...createVillaPickup(), x: 18, z: 121, speed: 6.5 }, y = villaTerrainHeight(18, 124.4), obstacle = box(18, 124.4, y, 4, .012, .3);
    advanceVillaPickup(state, { ...idle, throttle: 1 }, 10, [obstacle]); expect(state.contact).toBe(true); expect(state.speed).toBe(0); expect(state.collisions).toBe(1);
    expect(villaPickupFootprint(state).every(p => p.z < obstacle.minZ)).toBe(true);
    expect(villaPickupOverlaps({ x: 18, z: 121, yaw: 0 }, box(18, 121, -1, 2, 2, .5))).toBe(false);
    expect(villaPickupOverlaps({ x: 18, z: 121, yaw: 0 }, box(18, 121, villaTerrainHeight(18, 121) + 1.7))).toBe(true);
    tick(state, { ...idle, throttle: -1 }, 1, [obstacle]); expect(state.contact).toBe(false);
  });
  it('blocks pool/pond and contains the entire pitched truck inside the extended estate', () => {
    expect(villaPickupPoseBlocked({ x: -18, z: 0, yaw: 0 }, [])).toBe(true);
    expect(villaPickupPoseBlocked({ x: -13, z: 77.5, yaw: 0 }, [])).toBe(true);
    expect(villaPickupPoseBlocked({ x: 0, z: VILLA_ESTATE_BOUNDS.maxZ - 1, yaw: .3 }, [])).toBe(true);
    expect(villaPickupPoseBlocked({ x: 32, z: 140, yaw: 0 }, [])).toBe(false);
  });
  it('offers genuinely swept supported +/- side exits, not free endpoints across walls or pets', () => {
    const state = { ...createVillaPickup(), x: 14, z: 118, yaw: .4 }, anchors = villaPickupAnchors(state), mid = { x: (anchors.seat.x + anchors.exit.x) / 2, z: (anchors.seat.z + anchors.exit.z) / 2 };
    expect(villaPickupSafeExit(state, [])).toEqual(anchors.exits[0]); expect(anchors.exit.y).toBe(villaTerrainHeight(anchors.exit.x, anchors.exit.z));
    const obstacle = box(mid.x, mid.z, villaTerrainHeight(mid.x, mid.z), .04, .1, .3);
    expect(villaPickupExitClear(state, [obstacle])).toBe(false); expect(villaPickupSafeExit(state, [obstacle])).toEqual(anchors.exits[1]);
    const second = anchors.exits[1]; expect(villaPickupSafeExit(state, [obstacle, box(second.x, second.z, second.y)])).toBeNull();
    expect(villaPickupSafeExit({ ...state, yaw: NaN }, [])).toBeNull();
  });
});

describe('Villa pickup model identities, automatic doors and terrain posing', () => {
  it('registers only its own stable identities and collides with BOTH other vehicles in all directions', () => {
    const scene = new THREE.Group(), pickup = createVillaPickupModel(scene), sedan = createVillaVehicle(scene), scooter = createVillaScooterModel(scene), pose = { x: 18, z: 112, yaw: .7 };
    try {
      pickup.update(0, { pickup: { ...createVillaPickup(), ...pose } }); sedan.update(0, { ...createVillaActivities(), driving: { ...createVillaDriving(), ...pose } }); scooter.update(0, { scooter: { ...createVillaScooter(), ...pose } });
      for (const c of pickup.colliders) { expect(isVillaPickupCollider(c)).toBe(true); expect(isVillaVehicleCollider(c)).toBe(false); expect(isVillaScooterCollider(c)).toBe(false); }
      expect(villaPickupPoseBlocked(pose, pickup.colliders)).toBe(false);
      expect(villaPickupPoseBlocked(pose, sedan.colliders)).toBe(true); expect(villaPickupPoseBlocked(pose, scooter.colliders)).toBe(true);
      expect(villaCarOverlaps(pose, pickup.colliders[0])).toBe(true); expect(villaScooterOverlaps(pose, pickup.colliders[0])).toBe(true);
      expect(villaPickupOverlaps(pose, { ...pickup.colliders[0] })).toBe(true);
    } finally { dispose(scene); }
  });
  it('keeps an open bed and hollow cabin within dimensions and opens only the driver door without moving the shell', () => {
    const scene = new THREE.Group(), model = createVillaPickupModel(scene), state = createVillaPickup(), root = scene.getObjectByName('villa-pickup')!, body = scene.getObjectByName('pickup-body')!, driver = scene.getObjectByName('pickup-driver-door')!, passenger = scene.getObjectByName('pickup-passenger-door')!;
    try {
      const references = [...model.colliders], bodyMatrix = body.matrixWorld.clone(); expect(root.userData.openCargoBed).toBe(true); expect(root.userData.hollowCabin).toBe(true);
      const closed = new THREE.Box3().setFromObject(root), bounds = model.colliders[0]; expect(closed.min.x).toBeGreaterThanOrEqual(bounds.minX); expect(closed.max.x).toBeLessThanOrEqual(bounds.maxX); expect(closed.max.y).toBeLessThanOrEqual(bounds.maxY + .001);
      expect(model.update(.3, { pickup: state, pickupDoorOpen: true })).toBe(true); expect(model.doorProgress).toBeGreaterThan(0); expect(model.doorProgress).toBeLessThan(1);
      model.update(1, { pickup: state, pickupDoorOpen: true }); expect(model.doorProgress).toBe(1); expect(driver.rotation.y).toBeLessThan(-1); expect(passenger.rotation.y).toBeCloseTo(0, 12);
      expect(body.matrixWorld.equals(bodyMatrix)).toBe(true); expect(model.colliders.every((c, i) => c === references[i])).toBe(true);
      expect(villaCollides(villaPickupAnchors(state).exit, model.colliders, 1.75)).toBe(false);
      expect(villaPickupExitClear(state, model.colliders)).toBe(true); expect(villaPickupExitClear(state, model.colliders, -1)).toBe(true);
      expect(model.update(100, { pickup: state, pickupDoorOpen: true })).toBe(false);
      model.update(0, { pickup: state }); expect(model.doorProgress).toBe(0); expect(driver.rotation.y).toBeCloseTo(0, 12); expect(passenger.rotation.y).toBeCloseTo(0, 12);
    } finally { dispose(scene); }
  });
  it('tilts to the shared terrain while live body/door colliders and seated anchors follow the same height', () => {
    const scene = new THREE.Group(), model = createVillaPickupModel(scene), pose = { ...createVillaPickup(), x: 24, z: 107, yaw: 1.1, steering: .2 };
    try {
      model.update(0, { pickup: pose, pickupDoorOpen: true }); const root = scene.getObjectByName('villa-pickup')!, t = villaTerrainOrientation(pose.x, pose.z, pose.yaw), anchors = villaPickupAnchors(pose);
      expect(root.position.y).toBe(t.y); expect(root.rotation.order).toBe('YXZ'); expect(root.rotation.x).toBe(t.pitch); expect(root.rotation.z).toBe(t.roll);
      expect(model.colliders[0].minY).toBeCloseTo(anchors.body.minY, 10); expect(model.colliders[0].maxY).toBeCloseTo(anchors.body.maxY, 10);
      expect(model.colliders[1].minY).toBeGreaterThan(0); expect(anchors.seat.y).toBe(villaTerrainHeight(anchors.seat.x, anchors.seat.z));
      expect(villaCollides(anchors.seat, model.colliders, 1.75)).toBe(true); expect(villaCollides(anchors.exit, model.colliders, 1.75)).toBe(false);
      expect(model.update(2, { pickup: pose, pickupDoorOpen: true })).toBe(false);
    } finally { dispose(scene); }
  });
});
