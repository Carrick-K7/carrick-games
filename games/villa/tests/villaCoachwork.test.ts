import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createVillaVehicle } from '../src/villaVehicle.js';
import { createVillaPickupModel } from '../src/villaPickupModel.js';
import { createVillaSuvModel } from '../src/villaSuvModel.js';
import { createVillaActivities, VILLA_CAR } from '../src/villaActivities.js';
import { createVillaDriving } from '../src/villaDriving.js';
import { createVillaPickup, VILLA_PICKUP, VILLA_PICKUP_LIMITS } from '../src/villaPickup.js';
import { createVillaSuv, VILLA_SUV, VILLA_SUV_LIMITS } from '../src/villaSuv.js';
import { coachHull, coachCanopy } from '../src/villaCoachwork.js';

type Point = [number, number, number];
const specs = [
  { id: 'sedan', root: 'villa-vehicle', prefix: 'vehicle', limits: { halfWidth: .96, halfLength: 2.36, height: 1.48 }, seat: [.43, VILLA_CAR.eyeHeight, .05] as Point, roof: [-.8, -.4, 0], roofFloor: 1.39, hood: [1.05, 1.4, 1.8, 2.25], doorY: 1.13, frontY: 1.17, wheel: 'vehicle-steering-wheel', mount: 'vehicle-steering', marker: 'vehicle-wheel-top-marker', hub: [.43, .935, .62] as Point, rim: .174, axle: 1.46, hubY: .355, arch: .383, screen: [0, .94, .59] as Point },
  { id: 'pickup', root: 'villa-pickup', prefix: 'pickup', limits: VILLA_PICKUP_LIMITS, seat: [.52, VILLA_PICKUP.eyeHeight, .37] as Point, roof: [-.4, 0, .4], roofFloor: 1.88, hood: [1.3, 1.65, 2.2, 2.65], doorY: 1.57, frontY: 1.57, wheel: 'pickup-steering-wheel', mount: 'pickup-steering-mount', marker: 'pickup-wheel-top-marker', hub: [.52, 1.33, .8] as Point, rim: .183, axle: 1.725, hubY: .41, arch: .442, screen: [0, 1.34, .92] as Point },
  { id: 'suv', root: 'villa-suv', prefix: 'suv', limits: VILLA_SUV_LIMITS, seat: [.52, VILLA_SUV.eyeHeight, -.3] as Point, roof: [-1.15, -.65, 0], roofFloor: 1.60, hood: [1.02, 1.4, 1.8, 2.3], doorY: 1.44, frontY: 1.48, wheel: 'suv-steering-wheel', mount: 'suv-steering-column', marker: 'suv-wheel-top-marker', hub: [.52, 1.06, .4] as Point, rim: .19, axle: 1.45, hubY: .42, arch: .437, screen: [-.20, 1.20, .67] as Point },
] as const;
const scenes: THREE.Object3D[] = [];
function fixture(spec: typeof specs[number]) {
  const scene = new THREE.Group(); scenes.push(scene);
  const sedan = spec.id === 'sedan' ? createVillaVehicle(scene) : undefined;
  const pickup = spec.id === 'pickup' ? createVillaPickupModel(scene) : undefined;
  const suv = spec.id === 'suv' ? createVillaSuvModel(scene) : undefined;
  const model = (sedan ?? pickup ?? suv)!;
  const root = scene.getObjectByName(spec.root)!;
  const update = (open = false, steering = 0, yaw = 0, terrain = false) => {
    const pose = { steering, yaw, ...(terrain ? { x: 14, z: 127 } : {}) };
    sedan?.update(0, { ...createVillaActivities(), driving: { ...createVillaDriving(), ...pose }, carDoorOpen: open });
    pickup?.update(0, { pickup: { ...createVillaPickup(), ...pose }, pickupDoorOpen: open });
    suv?.update(0, { suv: { ...createVillaSuv(), ...pose }, suvDoorOpen: open });
    scene.updateMatrixWorld(true);
  };
  update();
  const ray = (from: Point, direction: Point, far = 6, targets: THREE.Object3D[] = [root]) => new THREE.Raycaster(
    root.localToWorld(new THREE.Vector3(...from)), new THREE.Vector3(...direction).transformDirection(root.matrixWorld), .0001, far,
  ).intersectObjects(targets, true);
  return { scene, root, model, update, ray };
}
function meshes(root: THREE.Object3D) { const out: THREE.Mesh[] = []; root.traverse(n => { if (n instanceof THREE.Mesh) out.push(n); }); return out; }
function material(hit: THREE.Intersection) { return (hit.object as THREE.Mesh).material as THREE.Material; }
function localBounds(root: THREE.Object3D, targets = meshes(root)) {
  const b = new THREE.Box3(), inv = root.matrixWorld.clone().invert(), p = new THREE.Vector3();
  for (const mesh of targets) {
    const matrix = inv.clone().multiply(mesh.matrixWorld), vertices = mesh.geometry.getAttribute('position');
    for (let i = 0; i < vertices.count; i++) b.expandByPoint(p.fromBufferAttribute(vertices, i).applyMatrix4(matrix));
  }
  return b;
}
afterEach(() => {
  for (const scene of scenes) {
    const materials = new Set<THREE.Material>();
    for (const mesh of meshes(scene)) { mesh.geometry.dispose(); (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(m => materials.add(m)); }
    materials.forEach(m => { Object.values(m).forEach(v => { if (v instanceof THREE.Texture) v.dispose(); }); m.dispose(); });
  }
  scenes.length = 0;
});

describe.each(specs)('$id fitted coachwork geometry', spec => {
  it('fits actual closed mesh vertices inside the declared envelope, including on terrain', () => {
    const f = fixture(spec);
    for (const [yaw, terrain] of [[0, false], [1.1, true]] as const) {
      f.update(false, 0, yaw, terrain);
      const b = localBounds(f.root);
      expect(b.min.x).toBeGreaterThanOrEqual(-spec.limits.halfWidth - .00001);
      expect(b.max.x).toBeLessThanOrEqual(spec.limits.halfWidth + .00001);
      expect(b.min.z).toBeGreaterThanOrEqual(-spec.limits.halfLength - .00001);
      expect(b.max.z).toBeLessThanOrEqual(spec.limits.halfLength + .00001);
      expect(b.min.y).toBeGreaterThanOrEqual(-.00001); expect(b.max.y).toBeLessThanOrEqual(spec.limits.height + .00001);
      expect(b.max.y).toBeGreaterThan(spec.limits.height - .05);
    }
  });
  it('has finite unit normals aligned with triangle winding and bounded real draw calls', () => {
    const f = fixture(spec), surfaces = meshes(f.root);
    expect(surfaces.length).toBeLessThanOrEqual(60);
    let count = 0, badNormals = 0, reversed = 0, degenerate = 0;
    const normalFailures: string[] = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), actual = new THREE.Vector3();
    for (const mesh of surfaces) {
      const p = mesh.geometry.getAttribute('position'), ns = mesh.geometry.getAttribute('normal');
      for (let i = 0; i < p.count; i++) {
        a.fromBufferAttribute(p, i); n.fromBufferAttribute(ns, i);
        if (![...a.toArray(), ...n.toArray()].every(Number.isFinite) || Math.abs(n.length() - 1) > .001) badNormals++;
      }
      for (let i = 0; i < p.count; i += 3) {
        a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
        actual.copy(b).sub(a).cross(c.sub(a));
        if (actual.lengthSq() < 1e-24) degenerate++;
        else {
          actual.normalize(); n.fromBufferAttribute(ns, i);
          if (actual.dot(n) < -.001) { reversed++; normalFailures.push(`${mesh.name} vertex ${i}: ${a.toArray()} dot ${actual.dot(n)}`); }
        }
        count++;
      }
    }
    expect(badNormals).toBe(0); expect(reversed, normalFailures.join('\n')).toBe(0); expect(degenerate).toBe(0);
    expect(count).toBeLessThan(100_000);
  });
  it('covers a genuinely crowned opaque roof and tapered hood with outward-facing surfaces', () => {
    const f = fixture(spec);
    for (const z of spec.roof) {
      const heights: number[] = [];
      for (const x of [-.64, 0, .64]) {
        const hit = f.ray([x, 3, z], [0, -1, 0])[0]; expect(hit).toBeDefined();
        expect(material(hit).transparent).toBe(false);
        const local = f.root.worldToLocal(hit.point.clone()); heights.push(local.y);
        expect(local.y).toBeGreaterThan(spec.roofFloor);
        expect(hit.face!.normal.y).toBeGreaterThan(.80);
      }
      expect(heights[1] - heights[0]).toBeGreaterThan(.012); expect(heights[1] - heights[2]).toBeGreaterThan(.012);
    }
    for (const z of spec.hood) for (const x of [-.42, 0, .42]) {
      const hit = f.ray([x, 3, z], [0, -1, 0])[0]; expect(hit).toBeDefined(); expect(material(hit).transparent).toBe(false);
      expect(hit.face!.normal.y).toBeGreaterThan(.7);
    }
    const near = f.root.worldToLocal(f.ray([0, 3, spec.hood[0]], [0, -1, 0])[0].point.clone());
    const far = f.root.worldToLocal(f.ray([0, 3, spec.hood[3]], [0, -1, 0])[0].point.clone());
    expect(near.y - far.y).toBeGreaterThan(.075);
  });
  it('intercepts real grazing rays across roof/side/windscreen seams without a far-side fallback', () => {
    const f = fixture(spec);
    const datums = spec.id === 'sedan' ? { front: .17, back: -.95, fw: .750, bw: .751, fy: 1.407, by: 1.40, crown: .060 }
      : spec.id === 'pickup' ? { front: .65, back: -.58, fw: .913, bw: .926, fy: 1.9, by: 1.9, crown: .047 }
        : { front: .13, back: -1.35, fw: .787, bw: .799, fy: 1.661, by: 1.61, crown: .047 };
    for (const side of [-1, 1]) for (let i = 1; i < 20; i++) {
      const t = i / 20, s = t * t * (3 - 2 * t), z = datums.back + (datums.front - datums.back) * t;
      const y = datums.by + (datums.fy - datums.by) * s;
      for (const dy of [-.013, -.005, 0, .005, .013]) {
        const hit = f.ray([side * 2, y + dy, z], [-side, 0, 0])[0];
        expect(hit, `side seam ${side}/${z}/${dy}`).toBeDefined();
        expect(f.root.worldToLocal(hit.point.clone()).x * side).toBeGreaterThan(.70);
      }
    }
    for (const front of [true, false]) for (let i = 2; i < 19; i++) {
      const t = i / 20, a = t * 2 - 1;
      const x = a * (front ? datums.fw : datums.bw), z = front ? datums.front : datums.back;
      const y = (front ? datums.fy : datums.by) + datums.crown * (1 - a * a), sign = front ? 1 : -1;
      for (const dz of [-.008, 0, .008]) {
        const target = new THREE.Vector3(x, y, z + dz), origin = target.clone().add(new THREE.Vector3(0, .7, sign * .7));
        const hit = f.ray(origin.toArray() as Point, [0, -Math.SQRT1_2, -sign * Math.SQRT1_2])[0];
        expect(hit).toBeDefined();
        expect(f.root.worldToLocal(hit.point.clone()).distanceTo(target)).toBeLessThan(.055);
      }
    }
  });
  it('has rounded front corners, a swept lower bumper and recessed front-facing optical geometry', () => {
    const f = fixture(spec);
    const dims = spec.id === 'sedan' ? { middle: .48, low: .29, high: .61, lamps: [.53, .65] }
      : spec.id === 'pickup' ? { middle: .81, low: .48, high: 1.00, lamps: [.79, .98] }
        : { middle: .65, low: .36, high: .82, lamps: [.75, .88] };
    const point = (x: number, y: number) => {
      const hit = f.ray([x, y, 3.5], [0, 0, -1])[0]; expect(hit).toBeDefined(); expect(material(hit).transparent).toBe(false);
      return f.root.worldToLocal(hit.point.clone());
    };
    for (const side of [-1, 1]) expect(point(0, dims.middle).z - point(side * .60, dims.middle).z).toBeGreaterThan(.035);
    expect(point(0, dims.high).z - point(0, dims.low).z).toBeGreaterThan(.025);
    let frontOptics = 0;
    for (const side of [-1, 1]) for (let row = 0; row < 10; row++) for (let column = 0; column < 11; column++) {
      const y = dims.lamps[0] + (dims.lamps[1] - dims.lamps[0]) * row / 9, x = side * (.35 + column * .039);
      const hit = f.ray([x, y, 3.5], [0, 0, -1])[0];
      if (hit && material(hit) instanceof THREE.MeshStandardMaterial && (material(hit) as THREE.MeshStandardMaterial).emissiveIntensity > .4) frontOptics++;
    }
    expect(frontOptics).toBeGreaterThan(8);
  });
  it('uses exterior smoke tint but retains low-opacity inner pane shader transmission', () => {
    const f = fixture(spec), hit = f.ray([0, spec.frontY, 3.5], [0, 0, -1])[0], glass = material(hit) as THREE.MeshPhysicalMaterial;
    expect(glass.transparent).toBe(true); expect(glass.opacity).toBeGreaterThanOrEqual(.60); expect(glass.depthWrite).toBe(false);
    const shader = { vertexShader: '', fragmentShader: '#include <alphatest_fragment>', uniforms: {} } as Parameters<typeof glass.onBeforeCompile>[0];
    glass.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.fragmentShader).toContain('gl_FrontFacing ? 1.0 : 0.20');
    expect(glass.forceSinglePass).toBe(true);
  });
  it('occludes upholstered door cards behind real exterior door skin from low and elevated views', () => {
    const f = fixture(spec), painted = spec.id === 'sedan' ? 'pearl-clearcoat' : spec.id === 'pickup' ? 'sage-utility-clearcoat' : 'gentian-clearcoat';
    const ys = spec.id === 'sedan' ? [.47, .61, .76] : spec.id === 'pickup' ? [.72, .86, 1.01] : [.52, .69, .84];
    for (const side of [-1, 1]) for (const y of ys) for (const z of [-.18, .02, .22, .42]) for (const slope of [0, -.15]) {
      const hit = f.ray([side * 2.5, y - slope * 1.6, z], [-side, slope, 0])[0];
      expect(hit).toBeDefined(); expect(material(hit).name, `${side}/${y}/${z}/${slope}`).toBe(painted);
    }
  });
  it('has transparent forward/side sightlines and real headroom at the unchanged seat eye', () => {
    const f = fixture(spec), eye = spec.seat;
    for (const direction of [[0, 0, 1], [1, 0, 0], [-1, 0, 0]] as Point[]) {
      const hit = f.ray([...eye], direction)[0]; expect(hit).toBeDefined(); expect(material(hit).transparent).toBe(true);
      expect(hit.distance).toBeGreaterThan(.22);
    }
    const roof = f.ray([...eye], [0, 1, 0])[0]; expect(roof).toBeDefined(); expect(material(roof).transparent).toBe(false);
    expect(roof.distance).toBeGreaterThan(.09); expect(roof.distance).toBeLessThan(.45);
    // The seat cushion is physically under the eye, not merely claimed in data.
    const seat = f.ray([...eye], [0, -1, 0])[0]; expect(seat).toBeDefined(); expect(material(seat).transparent).toBe(false);
    const y = f.root.worldToLocal(seat.point.clone()).y;
    expect(eye[1] - y).toBeGreaterThan(.52); expect(eye[1] - y).toBeLessThan(.90);
    for (const x of [-.58, .58]) {
      const floor = f.ray([x, eye[1] - .10, spec.id === 'pickup' ? .85 : .52], [0, -1, 0])[0];
      expect(floor).toBeDefined(); expect(material(floor).transparent).toBe(false);
    }
    const screenDirection = new THREE.Vector3(...spec.screen).sub(new THREE.Vector3(...eye));
    const screen = f.ray([...eye], screenDirection.normalize().toArray() as Point)[0]; expect(screen).toBeDefined();
    expect(material(screen), `${screen.object.parent?.name} at ${f.root.worldToLocal(screen.point.clone()).toArray()}`).toBeInstanceOf(THREE.MeshBasicMaterial);
  });
  it('carries the sole driver pane away with the door, preserves passenger closure and collider identities', () => {
    const f = fixture(spec), refs = [...f.model.colliders]; expect(refs.length).toBe(3);
    const ray = () => f.ray([2, spec.doorY, spec.id === 'pickup' ? .15 : -.10], [-1, 0, 0], 1.4);
    expect(material(ray()[0]).transparent).toBe(true);
    f.update(true);
    expect(f.model.doorProgress).toBe(1); expect(ray()).toHaveLength(0);
    expect(f.scene.getObjectByName(`${spec.prefix}-driver-door`)!.rotation.y).toBeLessThan(-1);
    expect(f.scene.getObjectByName(`${spec.prefix}-passenger-door`)!.rotation.y).toBe(0);
    const passenger = f.ray([-2, spec.doorY, spec.id === 'pickup' ? .15 : -.10], [1, 0, 0], 1.4)[0];
    expect(material(passenger).transparent).toBe(true);
    f.model.colliders.forEach((c, i) => expect(c).toBe(refs[i]));
    f.update(false); expect(material(ray()[0]).transparent).toBe(true);
    // No safety collider may be silently dropped or left below a raised pane.
    // Measure the real leaf vertices, not a rotated world-AABB approximation.
    for (const open of [false, true]) {
      f.update(open, 0, .73, true);
      for (const [name, index] of [['driver', 1], ['passenger', 2]] as const) {
        const door = f.scene.getObjectByName(`${spec.prefix}-${name}-door`)!, collider = f.model.colliders[index];
        const bounds = new THREE.Box3();
        for (const mesh of meshes(door)) {
          const vertices = mesh.geometry.getAttribute('position'), p = new THREE.Vector3();
          for (let i = 0; i < vertices.count; i++) bounds.expandByPoint(p.fromBufferAttribute(vertices, i).applyMatrix4(mesh.matrixWorld));
        }
        expect(bounds.min.x).toBeGreaterThanOrEqual(collider.minX - .00001); expect(bounds.max.x).toBeLessThanOrEqual(collider.maxX + .00001);
        expect(bounds.min.y).toBeGreaterThanOrEqual(collider.minY - .00001); expect(bounds.max.y).toBeLessThanOrEqual(collider.maxY + .00001);
        expect(bounds.min.z).toBeGreaterThanOrEqual(collider.minZ - .00001); expect(bounds.max.z).toBeLessThanOrEqual(collider.maxZ + .00001);
      }
    }
  });
  it('leaves actual tyre apertures, seals upper arches, and keeps hub-centred steering on terrain', () => {
    const f = fixture(spec);
    for (const side of [-1, 1]) {
      const wheel = f.ray([side * 2, spec.hubY, spec.axle], [-side, 0, 0])[0]; expect(wheel).toBeDefined();
      const localWheel = f.root.worldToLocal(wheel.point.clone()); expect(Math.abs(localWheel.x)).toBeGreaterThan(.85);
      const shoulder = f.ray([side * 2, spec.hubY + spec.arch + .045, spec.axle], [-side, 0, 0])[0];
      expect(shoulder).toBeDefined(); expect(material(shoulder).transparent).toBe(false);
      expect(shoulder.face!.normal.x * side).toBeGreaterThan(.7);
    }
    const wheel = f.scene.getObjectByName(spec.wheel)!, mount = f.scene.getObjectByName(spec.mount)!, marker = f.scene.getObjectByName(spec.marker)!;
    for (const yaw of [0, 1.2]) {
      f.update(false, 0, yaw, true); const fixed = mount.matrixWorld.clone();
      for (const steering of [-.5, 0, .5]) {
        f.update(false, steering, yaw, true);
        const hub = f.root.localToWorld(new THREE.Vector3(...spec.hub));
        expect(wheel.getWorldPosition(new THREE.Vector3()).distanceTo(hub)).toBeLessThan(1e-8);
        expect(marker.getWorldPosition(new THREE.Vector3()).distanceTo(hub)).toBeCloseTo(spec.rim, 8);
        expect(mount.matrixWorld.equals(fixed)).toBe(true); expect(wheel.rotation.z).toBeCloseTo(steering * 4.5);
      }
    }
  });
});

it('has a separate pickup bed with an open volume, low ribbed floor and four containing walls', () => {
  const f = fixture(specs[1]);
  for (const x of [-.55, 0, .55]) for (const z of [-2.5, -1.75, -1.0]) {
    const hit = f.ray([x, 3, z], [0, -1, 0])[0]; expect(hit.object.parent!.name).toBe('pickup-cargo-bed');
    expect(f.root.worldToLocal(hit.point.clone()).y).toBeGreaterThan(.75);
    expect(f.root.worldToLocal(hit.point.clone()).y).toBeLessThan(.81);
  }
  for (const direction of [[1, 0, 0], [-1, 0, 0], [0, 0, -1], [0, 0, 1]] as Point[]) {
    const hit = f.ray([0, 1.02, -1.75], direction)[0]; expect(hit).toBeDefined(); expect(material(hit).transparent).toBe(false);
    expect(hit.object.parent!.name).toBe('pickup-cargo-bed');
  }
});

it('joins roof/window/hood datums exactly instead of hiding open seams with disconnected trim', () => {
  const hull = coachHull([[-2.4, .8, .9], [-1.2, .95, 1], [1, .95, 1], [2.4, .8, .9]], [-1.45, 1.45], .4, .44, .3);
  const shape = { frontBase: 1, rearBase: -2, front: [.2, .8, 1.65] as const, rear: [-1.3, .8, 1.62] as const, crown: .05 };
  const c = coachCanopy(hull, shape);
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    expect(c.wind(true, t, 1)).toEqual(c.roof(t, 1)); expect(c.wind(false, t, 1)).toEqual(c.roof(t, 0));
    expect(c.wind(true, t, 0)).toEqual(hull.deck(t * 2 - 1, shape.frontBase));
    for (const side of [-1, 1]) {
      const roof = c.roof(side > 0 ? 1 : 0, t), window = c.window(side, roof[2], 1);
      expect(new THREE.Vector3(...roof).distanceTo(new THREE.Vector3(...window))).toBeLessThan(1e-10);
    }
  }
});
