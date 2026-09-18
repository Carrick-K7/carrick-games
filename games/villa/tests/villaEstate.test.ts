import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { furnishVilla } from '../src/villaFurnishings.js';
import { VILLA_EAST_WALL as EAST, VILLA_NORTH_WALL as NORTH, VILLA_SOUTH_WALL as SOUTH, VILLA_WEST_WALL as WEST } from '../src/villaEstateLayout.js';
import { VILLA_ESTATE_BOUNDS, VILLA_ESTATE_FIELDS, VILLA_ESTATE_FENCE_SEGMENTS, VILLA_GARAGE_BAYS, VILLA_GARAGE_EXTENT, VILLA_POND, VILLA_SCOOTER_PARKING, villaEstateContains, villaPondContains, villaPondIntersectsPolygon, villaTerrainBounds, villaTerrainHeight, villaTerrainLocalPoint, villaTerrainNormal, villaTerrainOrientation } from '../src/villaEstateLayout.js';
import { createVillaEstateModel } from '../src/villaEstateModel.js';
import { createVillaTerrainGeometry, createVillaEstateFence } from '../src/villaTerrainModel.js';
import { createVillaDrivingCourse, VILLA_SOUTH_ROAD_SAMPLES, villaDistanceToRoad } from '../src/villaDrivingCourse.js';
import { villaDrivingPoseBlocked, villaCarAnchors, villaCarExitClear, createVillaDriving, advanceVillaDriving } from '../src/villaDriving.js';
import { villaPickupPoseBlocked } from '../src/villaPickup.js';
import { villaSupportAt, VILLA_WALL_COLLIDERS, POOL } from '../src/villaWorld.js';
import { VILLA_ESTATE_ROAD_PATHS, VILLA_GARAGE_DRIVE } from '../src/villaDrivingCourse';
import { VILLA_SCENIC_ROAD } from '../src/villaDriving';
import { VILLA_ESTATE_BUILDINGS, VILLA_GARAGE_EXTENT } from '../src/villaEstateLayout';
import { POOL } from '../src/villaWorld';
import { VILLA_GARDEN_TREES } from '../src/villaGarden';
const dispose = (root: THREE.Object3D) => {
  const materials = new Set<THREE.Material>(); root.traverse(node => { if (node instanceof THREE.Mesh) { node.geometry.dispose(); (Array.isArray(node.material) ? node.material : [node.material]).forEach(m => materials.add(m)); } }); materials.forEach(m => m.dispose());
};

describe('Villa authoritative estate terrain and layout', () => {
  it('keeps the estate flat under the house, pool and garden and spans the enlarged plot', () => {
    expect(VILLA_ESTATE_BOUNDS).toEqual({ minX: -40, maxX: 62, minZ: -26, maxZ: 162 });
    for (let x = -38; x <= 60; x += 2) for (let z = -24; z <= 35; z++) expect(villaTerrainHeight(x, z)).toBe(0);
    expect(VILLA_GARAGE_BAYS.map(b => b.x)).toEqual([32.4, 37.7, 42.2, 46.9]); expect(VILLA_GARAGE_EXTENT.maxX).toBe(51);
    expect(VILLA_SCOOTER_PARKING.x).toBeGreaterThan(VILLA_GARAGE_EXTENT.maxX + 2);
    expect(villaEstateContains(0, 151)).toBe(true); expect(villaEstateContains(62, 160, .1)).toBe(false);
    expect(POOL).toEqual({ minX: -36.4, maxX: -27.7, minZ: -7.5, maxZ: 6.5 });
  });
  it('has low continuous comfortable slopes and a level pond shelf, never a discrete hill step', () => {
    let maximum = 0, slope = 0;
    for (let x = -38; x < 60; x += 1.5) for (let z = 35; z < 162; z += 1.5) {
      const y = villaTerrainHeight(x, z), n = villaTerrainNormal(x, z); maximum = Math.max(maximum, y); slope = Math.max(slope, Math.hypot(n.x, n.z) / n.y);
      expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(2.8);
      expect(Math.abs(villaTerrainHeight(x, z + .01) - y)).toBeLessThan(.003);
    }
    expect(maximum).toBeGreaterThan(1.7); expect(slope).toBeLessThan(.16);
    for (const [x, z] of [[-13, 77.5], [-6, 77.5], [-13, 67], [-13, 88]]) expect(villaTerrainHeight(x, z)).toBe(0);
    expect(villaTerrainHeight(10, 35.001)).toBeLessThan(1e-8);
  });
  it('uses precisely the same terrain normal, transform and posed bounds as Three YXZ', () => {
    for (const yaw of [0, .7, Math.PI / 2, -2.3]) {
      const pose = { x: 24, z: 103, yaw }, t = villaTerrainOrientation(pose.x, pose.z, yaw), object = new THREE.Object3D(); object.position.set(pose.x, t.y, pose.z); object.rotation.set(t.pitch, yaw, t.roll, t.order); object.updateMatrixWorld();
      const normal = new THREE.Vector3(0, 1, 0).transformDirection(object.matrixWorld), shared = villaTerrainNormal(pose.x, pose.z);
      expect(normal.distanceTo(new THREE.Vector3(shared.x, shared.y, shared.z))).toBeLessThan(1e-10);
      const p = new THREE.Vector3(.43, 1.48, 2.36).applyMatrix4(object.matrixWorld), q = villaTerrainLocalPoint(pose, .43, 1.48, 2.36);
      expect(p.distanceTo(new THREE.Vector3(q.x, q.y, q.z))).toBeLessThan(1e-10);
      const actual = new THREE.Box3(new THREE.Vector3(-.96, 0, -2.36), new THREE.Vector3(.96, 1.48, 2.36)).applyMatrix4(object.matrixWorld), b = villaTerrainBounds(pose, .96, 2.36, 1.48);
      expect(b.minX).toBeCloseTo(actual.min.x, 10); expect(b.minY).toBeCloseTo(actual.min.y, 10); expect(b.maxZ).toBeCloseTo(actual.max.z, 10);
    }
  });
  it('excludes the pond from support and polygon edges without replacing it with a large square wall', () => {
    expect(villaPondContains(-13, 77.5)).toBe(true); expect(villaPondContains(-6, 77.5, .23)).toBe(true); expect(villaPondContains(-19.9, 67.1)).toBe(false);
    expect(villaSupportAt(-13, 77.5, 0)).toBeNull(); expect(villaSupportAt(-6.1, 77.5, 0)).toBeNull();
    expect(villaPondIntersectsPolygon([{ x: -25, z: 60 }, { x: 0, z: 60 }, { x: 0, z: 95 }, { x: -25, z: 95 }])).toBe(true);
    expect(villaPondIntersectsPolygon([{ x: -7, z: 65 }, { x: -5.9, z: 65 }, { x: -5.9, z: 90 }, { x: -7, z: 90 }])).toBe(true);
    expect(villaDrivingPoseBlocked({ x: -13, z: 77.5, yaw: 0 }, [])).toBe(true);
    expect(villaCarExitClear({ x: -4.9, z: 77.5, yaw: Math.PI }, [])).toBe(false);
  });
  it('provides terrain support and exits all the way south without snapping downhill to zero', () => {
    const car = { ...createVillaDriving(), x: 20, z: 122, speed: 5 };
    for (let i = 0; i < 240; i++) {
      const before = villaCarAnchors(car).seat.y; advanceVillaDriving(car, { throttle: 1, steer: 0, brake: false }, 1 / 120, []);
      const anchors = villaCarAnchors(car); expect(anchors.seat.y).toBe(villaTerrainHeight(anchors.seat.x, anchors.seat.z)); expect(Math.abs(anchors.seat.y - before)).toBeLessThan(.02);
      expect(villaSupportAt(anchors.exit.x, anchors.exit.z, anchors.exit.y, 1.75)).toBeCloseTo(anchors.exit.y, 10);
    }
    expect(car.z).toBeGreaterThan(132); expect(car.collisions).toBe(0); expect(villaCarExitClear(car, [])).toBe(true);
  });
});

describe('Villa estate terrain-sampled static models and scenic routes', () => {
  it('integrates a single terrain lawn with genuine water holes and fence chunks outside the support boundary', () => {
    const geometry = createVillaTerrainGeometry(), scene = new THREE.Group(), wood = new THREE.MeshStandardMaterial(), fence = createVillaEstateFence(scene, wood);
    try {
      expect(geometry.userData).toMatchObject({ gridMetres: 1, openings: ['building', 'pool', 'pond'] });
      const positions = geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i += 3) {
        let x = 0, z = 0;
        for (let j = 0; j < 3; j++) {
          x += positions.getX(i + j) / 3; z += positions.getZ(i + j) / 3;
          expect(positions.getY(i + j)).toBeCloseTo(villaTerrainHeight(positions.getX(i + j), positions.getZ(i + j)) - .022, 5);
        }
        expect(x > POOL.minX + 1e-5 && x < POOL.maxX - 1e-5 && z > POOL.minZ + 1e-5 && z < POOL.maxZ - 1e-5).toBe(false);
        expect(((x - VILLA_POND.x) / VILLA_POND.radiusX) ** 2 + ((z - VILLA_POND.z) / VILLA_POND.radiusZ) ** 2).toBeGreaterThan(.998);
      }
      expect(fence.colliders.length).toBeGreaterThan(50);
      for (const c of fence.colliders) {
        expect(c.maxX < VILLA_ESTATE_BOUNDS.minX || c.minX > VILLA_ESTATE_BOUNDS.maxX || c.maxZ < VILLA_ESTATE_BOUNDS.minZ || c.minZ > VILLA_ESTATE_BOUNDS.maxZ).toBe(true);
        expect(c.maxY - c.minY).toBeGreaterThanOrEqual(1.19);
      }
    } finally { geometry.dispose(); dispose(scene); }
  }, 20_000);
  it('joins the original oval tangents into a broad flowing south drive with no hazards in either lane', () => {
    const scene = new THREE.Group(), course = createVillaDrivingCourse(scene), estate = createVillaEstateModel(scene), obstacles = [...VILLA_WALL_COLLIDERS, ...course.colliders, ...estate.colliders];
    try {
      expect(VILLA_SOUTH_ROAD_SAMPLES[0]).toEqual({ x: 21, z: 39 }); expect(VILLA_SOUTH_ROAD_SAMPLES.at(-1)).toEqual({ x: -9, z: 39 });
      expect(Math.max(...VILLA_SOUTH_ROAD_SAMPLES.map(p => p.z))).toBeGreaterThanOrEqual(150);
      for (let i = 1; i < VILLA_SOUTH_ROAD_SAMPLES.length - 1; i += 3) {
        const p = VILLA_SOUTH_ROAD_SAMPLES[i], a = VILLA_SOUTH_ROAD_SAMPLES[i - 1], b = VILLA_SOUTH_ROAD_SAMPLES[i + 1], yaw = Math.atan2(b.x - a.x, b.z - a.z);
        expect(villaDistanceToRoad(p.x, p.z)).toBeLessThan(.001);
        for (const side of [-2, 0, 2]) {
          const pose = { x: p.x + Math.cos(yaw) * side, z: p.z - Math.sin(yaw) * side, yaw };
          expect(villaDrivingPoseBlocked(pose, obstacles), `sedan ${i}/${side}`).toBe(false); expect(villaPickupPoseBlocked(pose, obstacles), `pickup ${i}/${side}`).toBe(false);
        }
      }
    } finally { dispose(scene); }
  });
  it('keeps every road edge clear of the buildings, water and every tree trunk', () => {
    // The shoulder is wider than the asphalt; clip the OUTER edge, not the line.
    const half = VILLA_SCENIC_ROAD.width / 2 + .45;
    for (const [i, path] of VILLA_ESTATE_ROAD_PATHS.entries()) {
      const w = (path === VILLA_GARAGE_DRIVE ? VILLA_SCENIC_ROAD.drivewayWidth : VILLA_SCENIC_ROAD.width) / 2 + .45;
      for (let k = 1; k < path.length; k++) {
        const a = path[k - 1], b = path[k], dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
        const steps = Math.max(1, Math.ceil(len / .5));
        for (let s = 0; s <= steps; s++) {
          const t = s / steps, x = a.x + dx * t, z = a.z + dz * t;
          for (const side of [-1, 1]) {
            const ex = x + (dz / len) * side * w, ez = z - (dx / len) * side * w;
            const H = VILLA_ESTATE_BUILDINGS[0], G = VILLA_GARAGE_EXTENT;
            expect(ex > H.minX && ex < H.maxX && ez > H.minZ && ez < H.maxZ, `road ${i} edge in house ${ex.toFixed(1)},${ez.toFixed(1)}`).toBe(false);
            expect(ex > G.minX + .05 && ex < G.maxX - .05 && ez > G.minZ + .05 && ez < G.maxZ - .05, `road ${i} edge in garage ${ex.toFixed(1)},${ez.toFixed(1)}`).toBe(false);
            expect(ex > POOL.minX - .3 && ex < POOL.maxX + .3 && ez > POOL.minZ - .3 && ez < POOL.maxZ + .3, `road ${i} edge in pool ${ex.toFixed(1)},${ez.toFixed(1)}`).toBe(false);
            for (const tree of VILLA_GARDEN_TREES) expect(Math.hypot(ex - tree.x, ez - tree.z), `road ${i} edge near ${tree.species}`).toBeGreaterThan(.9);
          }
        }
      }
    }
  });
  it('samples every asphalt vertex at exact shared height with upward normals and keeps static batching', () => {
    const scene = new THREE.Group(); createVillaDrivingCourse(scene); createVillaEstateModel(scene);
    let roadVertices = 0, meshes = 0;
    try {
      scene.traverse(node => {
        expect(/cone|checkpoint|exam-sign/i.test(node.name)).toBe(false);
        if (!(node instanceof THREE.Mesh)) return; meshes++;
        if ((node.material as THREE.Material).name !== 'estate-road-asphalt') return;
        const positions = node.geometry.getAttribute('position'), normals = node.geometry.getAttribute('normal');
        for (let i = 0; i < positions.count; i++) {
          const y = positions.getY(i) - villaTerrainHeight(positions.getX(i), positions.getZ(i)); expect(y).toBeGreaterThan(.035); expect(y).toBeLessThan(.055); expect(normals.getY(i)).toBeGreaterThan(.98); roadVertices++;
        }
      });
      expect(roadVertices).toBeGreaterThan(10000); expect(meshes).toBeLessThan(35);
      expect(VILLA_ESTATE_FIELDS).toHaveLength(3); expect(scene.getObjectByName('estate-natural-pond')?.userData.waterY).toBe(VILLA_POND.waterY);
      expect(scene.getObjectByName('garage-charging-pedestal')?.userData.count).toBe(1);
      // The fence runs just outside the estate bounds, whatever those are.
    for (const f of VILLA_ESTATE_FENCE_SEGMENTS) expect([VILLA_ESTATE_BOUNDS.minX - .3, VILLA_ESTATE_BOUNDS.maxX + .3]).toContain(f.from.x);
    } finally { dispose(scene); }
  });
  it('seats every rolling or parked workshop prop on the slab, with nothing hovering', () => {
    const scene = new THREE.Group(), estate = createVillaEstateModel(scene); scene.updateMatrixWorld(true);
    try {
      // Wheel cylinders, the jack body and the tyre stack all touch y=0 now:
      // batched meshes merge the props, so check the geometry's lowest vertices.
      const lows: number[] = [];
      for (const top of ['garage-maintenance-equipment', 'garage-charging-pedestal']) {
        const node = scene.getObjectByName(top)!;
        node.traverse(child => {
          if (!(child instanceof THREE.Mesh)) return;
          const pos = child.geometry.getAttribute('position');
          for (let i = 0; i < pos.count; i++) {
            const y = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(child.matrixWorld).y;
            if (y < 0.4) lows.push(y);
          }
        });
      }
      expect(lows.length).toBeGreaterThan(10);
      for (const y of lows) expect(y, `prop vertex bottoms at y=${y.toFixed(3)}`).toBeGreaterThan(-0.005);
      expect(Math.min(...lows)).toBeLessThan(0.02); // and at least one truly rests on the slab
    } finally {
      scene.traverse(n => { if (n instanceof THREE.Mesh) { n.geometry.dispose(); const m = n.material; (Array.isArray(m) ? m : [m]).forEach(x => x.dispose()); } });
    }
  });
  it('keeps every garage door sweep corridor, reserved bay and both scooter approaches clear of workshop props', () => {
    const scene = new THREE.Group(), estate = createVillaEstateModel(scene);
    try {
      for (const bay of VILLA_GARAGE_BAYS) for (let z = -2.6; z <= 9; z += .3) expect(villaPickupPoseBlocked({ x: bay.x, z, yaw: 0 }, estate.colliders)).toBe(false);
      for (const x of [VILLA_SCOOTER_PARKING.x - 1, VILLA_SCOOTER_PARKING.x + 1]) expect(estate.colliders.some(b => x > b.minX - .23 && x < b.maxX + .23 && 6.77 > b.minZ - .23 && 6.77 < b.maxZ + .23)).toBe(false);
    } finally { dispose(scene); }
  });
  it('never lets a furniture run straddle an exterior wall, which is how shelf, wardrobe, bench and board runs used to clip through the facade', () => {
    const paint = new Proxy({}, { get: () => () => undefined, set: () => true });
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => paint }) });
    const scene = new THREE.Scene();
    try { furnishVilla(scene); } finally { vi.unstubAllGlobals(); }
    scene.updateMatrixWorld(true);
    // Material batches merge whole rooms into one mesh, so the check has to run
    // per triangle: a triangle reaching past BOTH faces of a 0.2 m wall is a run
    // punched through the facade, while the wall's own triangles stay inside it.
    const walls = [
      { axis: 'x' as const, outer: WEST.outer, inner: WEST.inner, sign: -1, label: 'west', crossLo: NORTH.outer, crossHi: SOUTH.outer },
      { axis: 'x' as const, outer: EAST.outer, inner: EAST.inner, sign: 1, label: 'east', crossLo: NORTH.outer, crossHi: SOUTH.outer },
      { axis: 'z' as const, outer: NORTH.outer, inner: NORTH.inner, sign: -1, label: 'north', crossLo: WEST.outer, crossHi: EAST.outer },
      { axis: 'z' as const, outer: SOUTH.outer, inner: SOUTH.inner, sign: 1, label: 'south', crossLo: WEST.outer, crossHi: EAST.outer },
      // The garage shell is its own envelope east of the house, so workshop
      // furniture cannot be built through those walls either.
      { axis: 'z' as const, outer: VILLA_GARAGE_EXTENT.minZ - .11, inner: VILLA_GARAGE_EXTENT.minZ + .11, sign: -1, label: 'garage north', crossLo: VILLA_GARAGE_EXTENT.minX, crossHi: VILLA_GARAGE_EXTENT.maxX },
      { axis: 'z' as const, outer: VILLA_GARAGE_EXTENT.maxZ + .11, inner: VILLA_GARAGE_EXTENT.maxZ - .11, sign: 1, label: 'garage south', crossLo: VILLA_GARAGE_EXTENT.minX, crossHi: VILLA_GARAGE_EXTENT.maxX },
      { axis: 'x' as const, outer: VILLA_GARAGE_EXTENT.maxX + .11, inner: VILLA_GARAGE_EXTENT.maxX - .11, sign: 1, label: 'garage east', crossLo: VILLA_GARAGE_EXTENT.minZ, crossHi: VILLA_GARAGE_EXTENT.maxZ },
    ];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const offences = new Set<string>();
    let checked = 0;
    scene.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      const position = node.geometry.getAttribute('position'), index = node.geometry.index;
      const count = index ? index.count : position.count;
      for (let i = 0; i < count; i += 3) {
        const [ia, ib, ic] = index ? [index.getX(i), index.getX(i + 1), index.getX(i + 2)] : [i, i + 1, i + 2];
        a.fromBufferAttribute(position, ia).applyMatrix4(node.matrixWorld);
        b.fromBufferAttribute(position, ib).applyMatrix4(node.matrixWorld);
        c.fromBufferAttribute(position, ic).applyMatrix4(node.matrixWorld);
        checked++;
        for (const wall of walls) {
          const values = [a[wall.axis], b[wall.axis], c[wall.axis]];
          const lo = Math.min(...values), hi = Math.max(...values);
          const outside = wall.sign < 0 ? lo < wall.outer - .02 : hi > wall.outer + .02;
          const inside = wall.sign < 0 ? hi > wall.inner + .02 : lo < wall.inner - .02;
          if (!outside || !inside) continue;
          // A facade only exists where the house does, so poolside furniture west
          // of the wing must not be blamed for spanning the south wall's plane.
          const cross = wall.axis === 'x' ? [a.z, b.z, c.z] : [a.x, b.x, c.x];
          if (Math.min(...cross) < wall.crossLo || Math.max(...cross) > wall.crossHi) continue;
          offences.add(`${node.name || node.type} span ${lo.toFixed(2)}..${hi.toFixed(2)} straddles the ${wall.label} wall`);
        }
      }
    });
    expect(checked).toBeGreaterThan(10000);
    expect([...offences]).toEqual([]);
    scene.traverse(n => { if (n instanceof THREE.Mesh) { n.geometry.dispose(); const m = n.material; (Array.isArray(m) ? m : [m]).forEach(x => x.dispose()); } });
  });
});
