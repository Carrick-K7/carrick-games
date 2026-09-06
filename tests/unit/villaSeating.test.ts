import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { furnishVilla } from '../../src/games/villaFurnishings';
import { VILLA_AQUARIUM, VILLA_RELAX_SEATS, villaRelaxSeat } from '../../src/games/villaSeating';
import { VILLA_TEA_BAR } from '../../src/games/villaTeaBar';
import { VILLA_WALL_COLLIDERS, VILLA_RAILS, villaCollides, villaSupportAt, type VillaCollider } from '../../src/games/villaWorld';

let scene: THREE.Scene, furniture: ReturnType<typeof furnishVilla>, colliders: VillaCollider[];
beforeAll(() => {
  // Exercise real geometry and collider authoring without installing a browser/canvas.
  const paint = new Proxy({}, { get: () => () => undefined, set: () => true });
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => paint }) });
  try { scene = new THREE.Scene(); furniture = furnishVilla(scene); }
  finally { vi.unstubAllGlobals(); }
  colliders = [...VILLA_WALL_COLLIDERS, ...VILLA_RAILS, ...furniture.colliders];
});
afterAll(() => {
  const materials = new Set<THREE.Material>();
  scene?.traverse(o => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose(); for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
    }
  });
  materials.forEach(m => { if (m instanceof THREE.MeshStandardMaterial) m.map?.dispose(); m.dispose(); });
  scene?.clear();
});

describe('authored villa relaxation seats', () => {
  it('looks up exactly five sofas and two loungers without aliasing unknown IDs', () => {
    expect(VILLA_RELAX_SEATS.map(s => s.id)).toEqual(['sofa-living', 'sofa-master', 'sofa-library-west', 'sofa-library-east', 'sofa-roof', 'lounger-west', 'lounger-east']);
    expect(VILLA_RELAX_SEATS.filter(s => s.kind === 'sofa')).toHaveLength(5);
    for (const seat of VILLA_RELAX_SEATS) expect(villaRelaxSeat(seat.id)).toBe(seat);
    for (const missing of [null, undefined, '', 'sofa', 'unknown']) expect(villaRelaxSeat(missing)).toBeNull();
  });

  it.each(VILLA_RELAX_SEATS)('$id has supported, reachable approaches and safe stand-up alternatives', seat => {
    expect(villaSupportAt(seat.approach.x, seat.approach.z, seat.approach.y)).toBeCloseTo(seat.approach.y);
    expect(villaCollides(seat.approach, colliders, 1.75), seat.id).toBe(false);
    expect(Math.hypot(seat.approach.x - seat.seat.x, seat.approach.z - seat.seat.z)).toBeLessThan(1.8);
    expect(seat.exits.length).toBeGreaterThanOrEqual(2);
    for (const exit of seat.exits) {
      expect(villaSupportAt(exit.x, exit.z, exit.y)).toBeCloseTo(exit.y);
      expect(villaCollides(exit, colliders, 1.75), `${seat.id} ${JSON.stringify(exit)}`).toBe(false);
      expect(exit.y).toBe(seat.seat.y);
    }
    // One blocked candidate must not force teleporting into the chair/table.
    const first = seat.exits[0];
    const occupied = [...colliders, { minX: first.x - 0.24, maxX: first.x + 0.24, minZ: first.z - 0.24, maxZ: first.z + 0.24, minY: first.y, maxY: first.y + 1.8 }];
    expect(seat.exits.some(exit => !villaCollides(exit, occupied, 1.75))).toBe(true);
    expect(seat.eyeHeight).toBeGreaterThan(0.8); expect(seat.eyeHeight).toBeLessThan(1.3);
    expect(Math.abs(seat.pitch)).toBeLessThan(0.2);
  });

  it('ties every authored seat to a metadata-only marker and actual furniture footprint', () => {
    for (const seat of VILLA_RELAX_SEATS) {
      const marker = scene.getObjectByName(`relax-seat/${seat.id}`)!;
      expect(marker).toBeTruthy(); expect(marker.children).toHaveLength(0);
      expect(marker).not.toBeInstanceOf(THREE.Mesh);
      expect(marker.position.toArray()).toEqual([seat.seat.x, seat.seat.y, seat.seat.z]);
      expect(marker.rotation.y).toBe(seat.yaw);
      expect(marker.userData).toMatchObject({ id: seat.id, kind: seat.kind, seat: seat.seat, approach: seat.approach });
      expect(villaCollides(seat.seat, furniture.colliders, 1.75)).toBe(true);
    }
    expect(villaRelaxSeat('sofa-master')!.yaw).toBe(-0.3);
    expect(villaRelaxSeat('sofa-library-west')!.yaw).toBe(0.4);
    expect(villaRelaxSeat('sofa-library-east')!.yaw).toBe(-0.4);
  });

  it('faces both south-deck loungers across the west pool, clear of water and the old side path', () => {
    for (const [index, id] of ['lounger-west', 'lounger-east'].entries()) {
      const seat = villaRelaxSeat(id)!, marker = scene.getObjectByName(`relax-seat/${id}`)!;
      expect(marker.userData.modelOrigin).toEqual({ x: index ? -16.7 : -20.2, y: 0, z: 9 });
      expect(seat.yaw).toBe(0); // camera forward (0,0,-1), toward pool z<=6.5
      expect(seat.seat.z).toBeGreaterThan(6.5 + 1.35);
      expect(seat.seat.x).toBeGreaterThan(-23.2); expect(seat.seat.x).toBeLessThan(-14.5);
    }
    for (const z of [-3, 1]) expect(villaCollides({ x: -13.04, y: 0, z }, furniture.colliders, 1.75)).toBe(false);
  });
});

describe('aligned aquarium cabinet and moving contents', () => {
  it('shares the tea-bar centerline with exact cabinet bounds and clear living-side access', () => {
    expect(VILLA_AQUARIUM.z).toBe(VILLA_TEA_BAR.z);
    expect(VILLA_AQUARIUM.x).toBe(-3.5);
    expect(VILLA_AQUARIUM.x - VILLA_AQUARIUM.width / 2).toBeGreaterThan(VILLA_TEA_BAR.x + VILLA_TEA_BAR.width / 2);
    expect(villaCollides(VILLA_AQUARIUM.approach, colliders, 1.75)).toBe(false);
    expect(villaSupportAt(VILLA_AQUARIUM.approach.x, VILLA_AQUARIUM.approach.z, 0)).toBe(0);
    const tank = furniture.colliders.find(c => Math.abs(c.maxY - 2.17) < 1e-8 && Math.abs((c.minX + c.maxX) / 2 - VILLA_AQUARIUM.x) < 1e-8)!;
    expect(tank).toBeTruthy(); expect(tank.maxX - tank.minX).toBeCloseTo(VILLA_AQUARIUM.width);
    expect(tank.maxZ - tank.minZ).toBeCloseTo(VILLA_AQUARIUM.depth);
    expect((tank.maxZ + tank.minZ) / 2).toBeCloseTo(-0.6);
    expect(scene.getObjectByName('aquarium/cabinet')!.position.z).toBe(-0.6);
    expect(scene.getObjectByName('aquarium/light')!.position.toArray()).toEqual([-3.5, 1.8, -0.6]);
  });

  it('keeps every animated fish and bubble inside the relocated tank when idle or fed', () => {
    const bubbles = scene.getObjectByName('aquarium/bubbles') as THREE.InstancedMesh;
    const matrix = new THREE.Matrix4(), point = new THREE.Vector3();
    for (let tick = 0; tick < 120; tick++) {
      const time = tick / 4;
      furniture.update(time, { evening: tick > 60, fireplace: false, gaming: true, fedUntil: tick > 30 ? 100 : 0 });
      for (let i = 1; i <= 10; i++) {
        const fish = scene.getObjectByName(`Aquarium fish ${i}`)!;
        expect(Math.abs(fish.position.x - VILLA_AQUARIUM.x)).toBeLessThan(1.3);
        expect(Math.abs(fish.position.z - VILLA_AQUARIUM.z)).toBeLessThan(0.31);
        expect(fish.position.y).toBeGreaterThan(0.9); expect(fish.position.y).toBeLessThan(2);
      }
      for (let i = 0; i < bubbles.count; i++) {
        bubbles.getMatrixAt(i, matrix); point.setFromMatrixPosition(matrix);
        expect(Math.abs(point.x - VILLA_AQUARIUM.x)).toBeLessThan(VILLA_AQUARIUM.width / 2);
        expect(Math.abs(point.z - VILLA_AQUARIUM.z)).toBeLessThan(VILLA_AQUARIUM.depth / 2);
      }
    }
  });
});
