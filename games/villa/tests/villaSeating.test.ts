import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { furnishVilla } from '../src/villaFurnishings';
import { VILLA_AQUARIUM, VILLA_BEDS, VILLA_RELAX_SEATS, resolveVillaSeatPosition, villaBedRestPose, villaRelaxSeat, villaSeatColliderId, villaSeatExitCandidates } from '../src/villaSeating';
import { VILLA_FIREPLACE_WALL } from '../src/villaLivingLayout';
import { VILLA_TEA_BAR } from '../src/villaTeaBar';
import { VILLA_WALL_COLLIDERS, VILLA_RAILS, villaCollides, villaSupportAt, type VillaCollider } from '../src/villaWorld';

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
  it('preserves seven legacy IDs and covers dining, roof dining, stools, guest/PC chairs and both beds', () => {
    expect(VILLA_RELAX_SEATS.slice(0, 7).map(s => s.id)).toEqual(['sofa-living', 'sofa-master', 'sofa-library-west', 'sofa-library-east', 'sofa-roof', 'lounger-west', 'lounger-east']);
    expect(VILLA_RELAX_SEATS).toHaveLength(25);
    expect(new Set(VILLA_RELAX_SEATS.map(s => s.id)).size).toBe(25);
    expect(VILLA_RELAX_SEATS.filter(s => s.kind === 'chair')).toHaveLength(12);
    expect(VILLA_RELAX_SEATS.filter(s => s.kind === 'stool')).toHaveLength(3);
    expect(VILLA_RELAX_SEATS.filter(s => s.kind === 'bed')).toHaveLength(2);
    expect(VILLA_RELAX_SEATS.filter(s => s.kind === 'sofa')).toHaveLength(6);
    for (const seat of VILLA_RELAX_SEATS) expect(villaRelaxSeat(seat.id)).toBe(seat);
    for (const missing of [null, undefined, '', 'sofa', 'unknown']) expect(villaRelaxSeat(missing)).toBeNull();
  });

  it.each(VILLA_RELAX_SEATS)('$id has supported, reachable approaches and safe stand-up alternatives', seat => {
    expect(villaSupportAt(seat.approach.x, seat.approach.z, seat.approach.y)).toBeCloseTo(seat.approach.y);
    expect(villaCollides(seat.approach, colliders, 1.75), seat.id).toBe(false);
    const resolved = resolveVillaSeatPosition(seat, seat.approach);
    expect(Math.hypot(seat.approach.x - resolved.x, seat.approach.z - resolved.z)).toBeLessThan(seat.kind === 'bed' ? 2.8 : 1.8);
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
    for (const seat of VILLA_RELAX_SEATS.filter(s => s.controller !== 'pc')) {
      const marker = scene.getObjectByName(`relax-seat/${seat.id}`)!;
      expect(marker).toBeTruthy(); expect(marker.children).toHaveLength(0);
      expect(marker).not.toBeInstanceOf(THREE.Mesh);
      expect(marker.position.toArray()).toEqual([seat.seat.x, seat.seat.y, seat.seat.z]);
      expect(marker.rotation.y).toBe(seat.yaw);
      expect(marker.userData).toMatchObject({ id: seat.id, kind: seat.kind, seat: seat.seat, approach: seat.approach });
      expect(villaCollides(seat.seat, furniture.colliders, 1.75)).toBe(true);
      const own = furniture.colliders.filter(c => villaSeatColliderId(c) === seat.id);
      expect(own.length, seat.id).toBeGreaterThan(0);
      const others = colliders.filter(c => villaSeatColliderId(c) !== seat.id);
      const resolved = resolveVillaSeatPosition(seat, seat.approach);
      for (let i = 0; i <= 40; i++) {
        const t = i / 40, point = { x: seat.approach.x + (resolved.x - seat.approach.x) * t, y: seat.seat.y, z: seat.approach.z + (resolved.z - seat.approach.z) * t };
        expect(villaCollides(point, others, 1.75), `${seat.id} approach path ${i}`).toBe(false);
      }
    }
    expect(villaRelaxSeat('sofa-master')!.yaw).toBe(-0.3);
    expect(villaRelaxSeat('sofa-library-west')!.yaw).toBe(0.4);
    expect(villaRelaxSeat('sofa-library-east')!.yaw).toBe(-0.4);
  });

  it('projects both sofa ends onto actual cushion segments while small chairs stay centred', () => {
    for (const seat of VILLA_RELAX_SEATS) {
      const before = JSON.stringify(seat);
      if (seat.cushionSegment) {
        const [a, b] = seat.cushionSegment;
        expect(resolveVillaSeatPosition(seat, a)).toEqual(a);
        expect(resolveVillaSeatPosition(seat, b).x).toBeCloseTo(b.x);
        const mid = resolveVillaSeatPosition(seat, { x: (a.x + b.x) / 2, y: 99, z: (a.z + b.z) / 2 });
        expect(mid.x).toBeCloseTo(seat.seat.x); expect(mid.y).toBe(seat.seat.y);
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(0.2);
        const beyond = resolveVillaSeatPosition(seat, { x: b.x + (b.x - a.x) * 100, y: 0, z: b.z + (b.z - a.z) * 100 });
        expect(beyond.x).toBeCloseTo(b.x); expect(beyond.z).toBeCloseTo(b.z);
        expect(villaSeatExitCandidates(seat, mid, seat.exits[seat.exits.length - 1])[0]).toEqual(seat.exits[seat.exits.length - 1]);
      } else expect(resolveVillaSeatPosition(seat, { x: 999, y: 99, z: -999 })).toEqual(seat.seat);
      expect(JSON.stringify(seat)).toBe(before);
    }
  });

  it('authors ONE centered pillow per bed with matching head-near-pillow free-look rest pose', () => {
    for (const bed of VILLA_BEDS) {
      const marker = scene.getObjectByName(`${bed.id}/pillow`)!;
      expect(marker.userData).toMatchObject({ count: 1, centered: true }); expect(marker.position.x).toBe(bed.origin.x);
      expect(marker.position.toArray()).toEqual([bed.pillow.x, bed.pillow.y, bed.pillow.z]);
      const pose = villaBedRestPose(bed.id)!; expect(pose.freeLook).toBe(true); expect(pose.yaw).toBe(bed.yaw);
      expect(Math.hypot(pose.position.x - bed.pillow.x, pose.position.z - bed.pillow.z)).toBeLessThan(0.2);
      expect(pose.position.y + pose.eyeHeight).toBeGreaterThan(bed.pillow.y);
      expect(pose.exits.every(e => !villaCollides(e, colliders, 1.75))).toBe(true);
    }
    expect(villaBedRestPose('unknown')).toBeNull();
  });

  it('switches off room-specific luminous lamp surfaces without time-driven shadow invalidation', () => {
    const state = { evening: true, fireplace: false, gaming: true, fedUntil: 0, roomLights: { living: false, kitchen: true, master: false } };
    expect(furniture.update(1, state)).toBe(false); expect(furniture.update(1.1, state)).toBe(false);
    const glows = new Map<string, THREE.MeshStandardMaterial>();
    scene.traverse(o => { if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial && o.material.name.startsWith('furnishing-lamp/')) glows.set(o.material.name, o.material); });
    expect(glows.get('furnishing-lamp/living')!.emissiveIntensity).toBe(0);
    expect(glows.get('furnishing-lamp/master')!.emissiveIntensity).toBe(0);
    expect(glows.get('furnishing-lamp/kitchen')!.emissiveIntensity).toBeGreaterThan(1);
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
  it('aligns its back to the FIREPLACE wall rather than the unlike-depth tea cabinet centerline', () => {
    expect(VILLA_AQUARIUM.z - VILLA_AQUARIUM.depth / 2).toBeCloseTo(VILLA_FIREPLACE_WALL.backZ);
    expect(VILLA_TEA_BAR.z - VILLA_TEA_BAR.depth / 2).toBeCloseTo(VILLA_FIREPLACE_WALL.backZ);
    expect(VILLA_AQUARIUM.x).toBe(-3.98);
    expect(VILLA_AQUARIUM.x + VILLA_AQUARIUM.width / 2).toBeLessThan(-2.11);
    const chimney = furniture.colliders.find(c => c.minY === 0 && c.maxY === 3.4 && c.minX === -11.25)!;
    expect(chimney.minZ).toBeCloseTo(VILLA_FIREPLACE_WALL.backZ);
    expect(VILLA_AQUARIUM.x - VILLA_AQUARIUM.width / 2).toBeGreaterThan(VILLA_TEA_BAR.x + VILLA_TEA_BAR.width / 2);
    expect(villaCollides(VILLA_AQUARIUM.approach, colliders, 1.75)).toBe(false);
    expect(villaSupportAt(VILLA_AQUARIUM.approach.x, VILLA_AQUARIUM.approach.z, 0)).toBe(0);
    const tank = furniture.colliders.find(c => Math.abs(c.maxY - 2.17) < 1e-8 && Math.abs((c.minX + c.maxX) / 2 - VILLA_AQUARIUM.x) < 1e-8)!;
    expect(tank).toBeTruthy(); expect(tank.maxX - tank.minX).toBeCloseTo(VILLA_AQUARIUM.width);
    expect(tank.maxZ - tank.minZ).toBeCloseTo(VILLA_AQUARIUM.depth);
    expect(tank.minZ).toBeCloseTo(VILLA_FIREPLACE_WALL.backZ);
    expect((tank.maxZ + tank.minZ) / 2).toBeCloseTo(VILLA_AQUARIUM.z);
    expect(scene.getObjectByName('aquarium/cabinet')!.position.z).toBe(VILLA_AQUARIUM.z);
    expect(scene.getObjectByName('aquarium/light')!.position.toArray()).toEqual([VILLA_AQUARIUM.x, 1.8, VILLA_AQUARIUM.z]);
  });

  it('contains actual tank/cabinet triangles and drawer pulls inside the live cabinet footprint', () => {
    let vertices = 0;
    scene.traverse(o => {
      if (!(o instanceof THREE.Mesh) || o.name !== 'Batched villa details') return;
      const p = o.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        if (Math.abs(x - VILLA_AQUARIUM.x) > 1.8 || y < -0.001 || y > 2.18 || z < -0.4 || z > 0.85) continue;
        vertices++;
        expect(x).toBeGreaterThanOrEqual(VILLA_AQUARIUM.x - VILLA_AQUARIUM.width / 2 - 0.00001);
        expect(x).toBeLessThanOrEqual(VILLA_AQUARIUM.x + VILLA_AQUARIUM.width / 2 + 0.00001);
        expect(z).toBeGreaterThanOrEqual(VILLA_FIREPLACE_WALL.backZ - 0.00001);
        expect(z).toBeLessThanOrEqual(VILLA_AQUARIUM.z + VILLA_AQUARIUM.depth / 2 + 0.00001);
      }
    });
    expect(vertices).toBeGreaterThan(1000);
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
