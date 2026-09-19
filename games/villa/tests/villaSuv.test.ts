import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { advanceVillaSuv, createVillaSuv, isVillaSuvCollider, villaSuvAnchors, villaSuvExitClear, villaSuvFootprint, villaSuvOverlaps, villaSuvPoseBlocked, villaSuvSafeExit, VILLA_SUV, VILLA_SUV_LIMITS } from '../src/villaSuv.js';
import { createVillaSuvModel } from '../src/villaSuvModel.js';
import { createVillaVehicle } from '../src/villaVehicle.js';
import { createVillaPickupModel } from '../src/villaPickupModel.js';
import { createVillaDriving, isVillaVehicleCollider, villaCarOverlaps } from '../src/villaDriving.js';
import { VILLA_ESTATE_BOUNDS, VILLA_GARAGE_EXTENT, villaTerrainOrientation } from '../src/villaEstateLayout.js';
import { VILLA_CAR } from '../src/villaActivities.js';
import { POOL, VILLA_WALL_COLLIDERS, type VillaCollider } from '../src/villaWorld.js';
const idle = { throttle: 0, steer: 0, brake: false, handbrake: false };
const tick = (state: ReturnType<typeof createVillaSuv>, input = idle, seconds = 1, obstacles: readonly VillaCollider[] = []) => { for (let i = 0; i < Math.round(seconds * 120); i++) advanceVillaSuv(state, input, 1 / 120, obstacles); };
const dispose = (root: THREE.Object3D) => { const materials = new Set<THREE.Material>(); root.traverse(n => { if (n instanceof THREE.Mesh) { n.geometry.dispose(); (Array.isArray(n.material) ? n.material : [n.material]).forEach(m => materials.add(m)); } }); materials.forEach(m => m.dispose()); };

describe('Villa coupe-SUV independent driving profile and safety', () => {
  it('has distinct dimensions, wheelbase and anchors and leaves the reserved garage bay', () => {
    const state = createVillaSuv(); expect(state).toMatchObject({ x: VILLA_SUV.center.x, z: VILLA_SUV.center.z, yaw: 0, speed: 0 });
    const a = villaSuvAnchors(state); expect(a.seat).toEqual(VILLA_SUV.seat); expect(a.exit).toEqual(VILLA_SUV.exit); expect(a.body).toEqual(VILLA_SUV.body);
    expect(VILLA_SUV_LIMITS.wheelbase).toBeCloseTo(2.9, 3); expect(VILLA_SUV.eyeHeight).toBeGreaterThan(1.4);
    tick(state, { ...idle, throttle: 1 }, 6, VILLA_WALL_COLLIDERS);
    expect(state.z).toBeGreaterThan(23); expect(state.x).toBe(VILLA_SUV.center.x); expect(state.collisions).toBe(0); expect(state.speed).toBeLessThanOrEqual(VILLA_SUV_LIMITS.maxSpeed);
  });
  it('blocks pool and property edges and contains the entire SUV inside the estate', () => {
    expect(villaSuvPoseBlocked({ x: (POOL.minX + POOL.maxX) / 2, z: 0, yaw: 0 }, [])).toBe(true);
    expect(villaSuvPoseBlocked({ x: VILLA_ESTATE_BOUNDS.maxX - .5, z: 30, yaw: 0 }, [])).toBe(true);
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const corners = villaSuvFootprint({ x: 20, z: 60, yaw });
      for (const c of corners) {
        expect(c.x).toBeGreaterThan(VILLA_ESTATE_BOUNDS.minX); expect(c.x).toBeLessThan(VILLA_ESTATE_BOUNDS.maxX);
        expect(c.z).toBeGreaterThan(VILLA_ESTATE_BOUNDS.minZ); expect(c.z).toBeLessThan(VILLA_ESTATE_BOUNDS.maxZ);
      }
    }
  });
  it('registers only its own stable identities, ignores itself and collides with both other vehicles', () => {
    const scene = new THREE.Group(); const suv = createVillaSuvModel(scene), sedan = createVillaVehicle(scene), pickup = createVillaPickupModel(scene);
    try {
      for (const collider of [...sedan.colliders, ...pickup.colliders]) expect(isVillaSuvCollider(collider)).toBe(false);
      for (const collider of suv.colliders) expect(isVillaSuvCollider(collider)).toBe(true);
      const pose = { ...createVillaSuv() };
      // In its own bay it touches neither neighbour, and it ignores its own shell.
      expect(sedan.colliders.some(b => villaSuvOverlaps(pose, b))).toBe(false);
      expect(pickup.colliders.some(b => villaSuvOverlaps(pose, b))).toBe(false);
      expect(suv.colliders.some(b => villaSuvOverlaps(pose, b))).toBe(false);
      // Dropped onto the sedan's space, it does collide with the sedan.
      const ontoSedan = { ...pose, x: VILLA_CAR.center.x, z: VILLA_CAR.center.z };
      expect(sedan.colliders.some(b => villaSuvOverlaps(ontoSedan, b))).toBe(true);
    } finally { dispose(scene); }
  });
  it('keeps a hollow cabin within dimensions and opens only the driver door without moving the shell', () => {
    const scene = new THREE.Group(); const suv = createVillaSuvModel(scene), activities = { suv: createVillaSuv(), suvDoorOpen: false };
    try {
      const body = new THREE.Box3().setFromObject(scene.getObjectByName('villa-suv')!);
      expect(body.max.x - body.min.x).toBeLessThanOrEqual(VILLA_SUV_LIMITS.halfWidth * 2 + .35);
      expect(body.max.z - body.min.z).toBeLessThanOrEqual(VILLA_SUV_LIMITS.halfLength * 2 + .35);
      expect(body.max.y - body.min.y).toBeLessThanOrEqual(VILLA_SUV_LIMITS.height + .1);
      const driver = scene.getObjectByName('suv-driver-door')!, passenger = scene.getObjectByName('suv-passenger-door')!;
      const shell = new THREE.Box3().setFromObject(scene.getObjectByName('villa-suv')!);
      for (let i = 0; i < 40; i++) suv.update(i * .05, { ...activities, suvDoorOpen: true });
      expect(suv.doorProgress).toBeGreaterThan(0);
      expect(driver.rotation.y).not.toBe(0); expect(passenger.rotation.y).toBe(0);
      const after = new THREE.Box3().setFromObject(scene.getObjectByName('villa-suv')!);
      expect(after.min.x).toBeCloseTo(shell.min.x, 3); expect(after.min.z).toBeCloseTo(shell.min.z, 3);
    } finally { dispose(scene); }
  });
  it('offers genuinely swept supported side exits, not free endpoints across walls', () => {
    const pose = { ...createVillaSuv() };
    // A wall over the driver-side exit blocks it; open ground leaves it clear.
    const wall = { minX: 49.0, maxX: 50.5, minZ: -3.3, maxZ: -2.5, minY: 0, maxY: 2 };
    expect(villaSuvExitClear(pose, [wall], 1)).toBe(false);
    expect(villaSuvExitClear(pose, [], 1)).toBe(true);
    const exit = villaSuvSafeExit(pose, []);
    expect(exit).toEqual(VILLA_SUV.exit);
    expect(villaSuvExitClear(pose, [], -1)).toBe(true);
  });
  it('spins only a hub-centred rotor on the fixed shaft at every steering angle and car yaw', () => {
    const scene = new THREE.Group(), model = createVillaSuvModel(scene), state = createVillaSuv();
    try {
      const car = scene.getObjectByName('villa-suv')!, column = scene.getObjectByName('suv-steering-column')!;
      const wheel = scene.getObjectByName('suv-steering-wheel')!, marker = scene.getObjectByName('suv-wheel-top-marker')!;
      expect(wheel.parent).toBe(column); expect(marker.parent).toBe(wheel);
      expect(column.position.toArray()).toEqual([.52, 1.06, .40]); expect(column.rotation.x).toBeCloseTo(Math.atan2(.22, .26));
      expect(wheel.position.toArray()).toEqual([0, 0, 0]);
      const identities = [...model.colliders], point = new THREE.Vector3(), matrix = new THREE.Matrix4();
      for (const pose of [
        { x: state.x, z: state.z, yaw: 0 }, { x: state.x, z: state.z, yaw: 1.2 }, { x: 14, z: 127, yaw: -1.1 },
      ]) {
        Object.assign(state, pose, { steering: 0 }); model.update(0, { suv: state }); scene.updateMatrixWorld(true);
        const fixed = column.matrixWorld.clone(), shell = car.matrixWorld.clone(), bounds = new THREE.Box3().setFromObject(car);
        const colliders = model.colliders.map(c => ({ ...c })), anchors = villaSuvAnchors(state);
        const expectedHub = car.localToWorld(new THREE.Vector3(.52, 1.06, .40));
        const expectedBase = car.localToWorld(new THREE.Vector3(.52, .84, .66));
        const inverseCar = car.matrixWorld.clone().invert();
        for (const steering of [-.55, -.21, 0, .3, .55]) {
          state.steering = steering; model.update(1, { suv: state }); scene.updateMatrixWorld(true);
          expect(wheel.getWorldPosition(new THREE.Vector3()).distanceTo(expectedHub)).toBeLessThan(1e-9);
          expect(column.localToWorld(new THREE.Vector3(0, 0, Math.hypot(.22, .26))).distanceTo(expectedBase)).toBeLessThan(1e-9);
          expect(marker.getWorldPosition(new THREE.Vector3()).distanceTo(expectedHub)).toBeCloseTo(.19, 8);
          const rotorAxis = new THREE.Vector3(0, 0, 1).transformDirection(wheel.matrixWorld);
          expect(rotorAxis.dot(expectedBase.clone().sub(expectedHub).normalize())).toBeCloseTo(1, 9);
          expect(column.matrixWorld.equals(fixed)).toBe(true); expect(car.matrixWorld.equals(shell)).toBe(true);
          expect(wheel.rotation.x).toBe(0); expect(wheel.rotation.y).toBe(0); expect(wheel.rotation.z).toBeCloseTo(steering * 4.5);
          expect(model.colliders).toEqual(colliders); model.colliders.forEach((c, i) => expect(c).toBe(identities[i]));
          expect(villaSuvAnchors(state)).toEqual(anchors); expect(new THREE.Box3().setFromObject(car).equals(bounds)).toBe(true);
          // Measure real mesh vertices in vehicle space, not inverse-transformed
          // world AABBs, which would falsely grow on rotated/sloping terrain.
          const rotorBounds = new THREE.Box3();
          wheel.traverse(node => {
            if (!(node instanceof THREE.Mesh)) return;
            matrix.multiplyMatrices(inverseCar, node.matrixWorld);
            const vertices = node.geometry.getAttribute('position');
            for (let i = 0; i < vertices.count; i++) rotorBounds.expandByPoint(point.fromBufferAttribute(vertices, i).applyMatrix4(matrix));
          });
          expect(rotorBounds.min.x).toBeGreaterThan(.30); expect(rotorBounds.max.x).toBeLessThan(.74);
          expect(rotorBounds.min.y).toBeGreaterThan(.87); expect(rotorBounds.max.y).toBeLessThan(1.25);
          expect(rotorBounds.min.z).toBeGreaterThan(.23); expect(rotorBounds.max.z).toBeLessThan(.57);
        }
      }
    } finally { dispose(scene); }
  });
  it.each([0, .8, -2.1])('projects right/left steering clockwise/counterclockwise from the actual seated camera at yaw %s', yaw => {
    const scene = new THREE.Group(), model = createVillaSuvModel(scene), state = { ...createVillaSuv(), yaw };
    try {
      const car = scene.getObjectByName('villa-suv')!, column = scene.getObjectByName('suv-steering-column')!;
      const wheel = scene.getObjectByName('suv-steering-wheel')!, marker = scene.getObjectByName('suv-wheel-top-marker')!;
      const seat = villaSuvAnchors(state).seat, camera = new THREE.PerspectiveCamera(64, 16 / 9, .01, 100);
      camera.position.set(seat.x, seat.y + VILLA_SUV.eyeHeight, seat.z);
      camera.rotation.set(0, yaw + VILLA_SUV.yaw, 0, 'YXZ'); camera.updateMatrixWorld(true);
      const project = () => {
        model.update(0, { suv: state }); scene.updateMatrixWorld(true);
        const center = wheel.getWorldPosition(new THREE.Vector3()).project(camera), top = marker.getWorldPosition(new THREE.Vector3()).project(camera);
        return new THREE.Vector2(top.x - center.x, top.y - center.y);
      };
      const neutral = project(), fixed = column.matrixWorld.clone(), body = car.matrixWorld.clone();
      expect(neutral.x).toBeCloseTo(0); expect(neutral.y).toBeGreaterThan(0);
      tick(state, { ...idle, steer: .2 }, .15); const right = project();
      expect(wheel.rotation.z).toBeGreaterThan(0); expect(right.x).toBeGreaterThan(0); expect(neutral.cross(right)).toBeLessThan(0);
      tick(state, { ...idle, steer: -.2 }, .2); const left = project();
      expect(wheel.rotation.z).toBeLessThan(0); expect(left.x).toBeLessThan(0); expect(neutral.cross(left)).toBeGreaterThan(0);
      tick(state, idle, .2); const released = project();
      expect(state.steering).toBe(0); expect(wheel.rotation.z).toBe(0);
      expect(released.distanceTo(neutral)).toBeLessThan(1e-9);
      expect(column.matrixWorld.equals(fixed)).toBe(true); expect(car.matrixWorld.equals(body)).toBe(true);
    } finally { dispose(scene); }
  });
  it('keeps the steering transform finite for bad clocks and non-finite steering input', () => {
    const scene = new THREE.Group(), model = createVillaSuvModel(scene), state = createVillaSuv();
    try {
      const wheel = scene.getObjectByName('suv-steering-wheel')!;
      state.steering = .3; model.update(1, { suv: state }); const snapshot = wheel.matrixWorld.clone();
      for (const time of [NaN, Infinity, -Infinity]) {
        state.steering = -.3; expect(model.update(time, { suv: state })).toBe(false);
        expect(wheel.matrixWorld.equals(snapshot)).toBe(true);
      }
      for (const steering of [NaN, Infinity, -Infinity]) {
        state.steering = steering; model.update(2, { suv: state });
        expect(wheel.matrixWorld.elements.every(Number.isFinite)).toBe(true);
        expect(Math.abs(wheel.rotation.z)).toBeLessThanOrEqual(.55 * 4.5);
      }
    } finally { dispose(scene); }
  });
  it('has real opaque roof and hood coverage from above, not an open-topped body', () => {
    const scene = new THREE.Group(); createVillaSuvModel(scene);
    try {
      const car = scene.getObjectByName('villa-suv')!; scene.updateMatrixWorld(true);
      const ray = (point: THREE.Vector3, direction: THREE.Vector3, far = 4) => new THREE.Raycaster(
        point.applyMatrix4(car.matrixWorld), direction.transformDirection(car.matrixWorld), 0, far,
      ).intersectObject(car, true);
      // Keep the audit over authored opaque panels, not the deliberately glazed
      // front/rear windscreens or headlight lenses at the bonnet's outer edges.
      for (const x of [-.7, -.35, 0, .35, .7]) for (const z of [-1.85, -1.5, -1, -.5, -.15]) {
        const hit = ray(new THREE.Vector3(x, 3, z), new THREE.Vector3(0, -1, 0))[0];
        expect(hit).toBeDefined(); expect((hit.object as THREE.Mesh).material).toMatchObject({ name: 'gentian-clearcoat', transparent: false });
        expect(hit.point.y - car.position.y).toBeCloseTo(1.58 + (z + .02) * .18 / 1.96, 5);
      }
      for (const x of [-.5, -.25, 0, .25, .5]) for (const z of [.65, .9, 1.2, 1.6, 2.1, 2.3]) {
        const hit = ray(new THREE.Vector3(x, 3, z), new THREE.Vector3(0, -1, 0))[0];
        expect(hit).toBeDefined(); expect((hit.object as THREE.Mesh).material).toMatchObject({ name: 'gentian-clearcoat', transparent: false });
        expect(hit.point.y - car.position.y).toBeGreaterThan(1); expect(hit.point.y - car.position.y).toBeLessThan(1.21);
      }
      // The recessed fascia and bright headlight lenses also have geometry;
      // the apparent white cut-outs in a garage view are not absent front faces.
      for (const x of [0, .45, .8, .95]) for (const y of [.84, .94, 1.02]) {
        const hit = ray(new THREE.Vector3(x, y, 3.2), new THREE.Vector3(0, 0, -1), 6)[0];
        expect(hit).toBeDefined(); expect((hit.object as THREE.Mesh).material).toMatchObject({ transparent: false });
        const local = car.worldToLocal(hit.point.clone());
        expect(local.z).toBeGreaterThan(2); expect(local.z).toBeLessThan(2.6);
      }
    } finally { dispose(scene); }
  });
  it('closes the confirmed roof/header seams without covering window or door openings', () => {
    const scene = new THREE.Group(), model = createVillaSuvModel(scene), state = { ...createVillaSuv(), yaw: .6 };
    try {
      const car = scene.getObjectByName('villa-suv')!, headers = scene.getObjectByName('suv-roof-headers')!;
      expect(headers.parent).toBe(car);
      headers.traverse(node => {
        if (!(node instanceof THREE.Mesh)) return;
        const bounds = new THREE.Box3().setFromBufferAttribute(node.geometry.getAttribute('position') as THREE.BufferAttribute);
        expect(bounds.min.x).toBeGreaterThanOrEqual(-.900001); expect(bounds.max.x).toBeLessThanOrEqual(.900001);
        expect(bounds.min.y).toBeGreaterThanOrEqual(1.419999); expect(bounds.max.y).toBeLessThanOrEqual(1.580001);
        expect(bounds.min.z).toBeGreaterThanOrEqual(-1.720001); expect(bounds.max.z).toBeLessThanOrEqual(.100001);
        expect(Array.from(node.geometry.getAttribute('normal').array).every(Number.isFinite)).toBe(true);
      });
      for (const open of [false, true]) {
        model.update(0, { suv: state, suvDoorOpen: open }); scene.updateMatrixWorld(true);
        const ray = (point: THREE.Vector3, direction: THREE.Vector3) => new THREE.Raycaster(
          point.applyMatrix4(car.matrixWorld), direction.transformDirection(car.matrixWorld), 0, 4,
        ).intersectObject(car, true)[0];
        // These horizontal rays previously passed between side-glass tops and
        // roof rails (6–40mm gaps), right through both sides of the whole model.
        for (const side of [-1, 1]) for (const [z, y] of [[-1, 1.4548241758241758], [-.5, 1.4862213500784929], [-.1, 1.5113390894819467]]) {
          const hit = ray(new THREE.Vector3(side * 2, y, z), new THREE.Vector3(-side, 0, 0));
          expect(hit).toBeDefined(); expect(hit.object.parent).toBe(headers);
          expect((hit.object as THREE.Mesh).material).toMatchObject({ name: 'gentian-clearcoat', transparent: false });
          const local = car.worldToLocal(hit.point.clone()); expect(local.x * side).toBeGreaterThan(.8);
        }
        // Windscreen-to-roof header: intercept at the leading edge, not at the
        // roof underside further inside the cabin behind an unsealed seam.
        for (const side of [-1, 1]) {
          const hit = ray(new THREE.Vector3(side * .7, 1.57, 1), new THREE.Vector3(0, 0, -1));
          expect(hit.object.parent).toBe(headers);
          const local = car.worldToLocal(hit.point.clone()); expect(local.z).toBeGreaterThan(-.05); expect(local.z).toBeLessThan(-.02);
        }
        // Clear panes stay glazed, not converted to opaque headers. The moving
        // driver's leaf remains the sole door animation; the trim stays above.
        const windscreen = ray(new THREE.Vector3(0, 1.32, 1), new THREE.Vector3(0, 0, -1));
        expect((windscreen.object as THREE.Mesh).material).toMatchObject({ name: 'coupe-suv-glazing', transparent: true });
        if (!open) for (const side of [-1, 1]) {
          const window = ray(new THREE.Vector3(side * 2, 1.3, -.5), new THREE.Vector3(-side, 0, 0));
          expect((window.object as THREE.Mesh).material).toMatchObject({ name: 'coupe-suv-glazing', transparent: true });
        }
      }
    } finally { dispose(scene); }
  });
  it('tilts to the shared terrain while live colliders and seated anchors follow the same height', () => {
    const scene = new THREE.Group(); const suv = createVillaSuvModel(scene), state = { ...createVillaSuv(), x: 14, z: 127 };
    try {
      const terrain = villaTerrainOrientation(state.x, state.z, state.yaw);
      suv.update(1, { suv: state, suvDoorOpen: false });
      const root = scene.getObjectByName('villa-suv')!;
      expect(root.position.y).toBeCloseTo(terrain.y, 4); expect(root.rotation.x).toBeCloseTo(terrain.pitch, 4);
      const anchors = villaSuvAnchors(state);
      expect(Number.isFinite(anchors.seat.y)).toBe(true);
    } finally { dispose(scene); }
  });
});
