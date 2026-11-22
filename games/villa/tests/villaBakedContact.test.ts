import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { fixedVillaContactColliders } from '../src/villaBakedContact.js';
import { createVillaBathDoorModel, createVillaBathDoors } from '../src/villaBathDoors.js';
import { createVillaFridge, createVillaWardrobe, createVillaWardrobes, VILLA_MASTER_WARDROBE } from '../src/villaWardrobe.js';
import { VillaScene } from '../src/villaScene.js';
import type { VillaCollider } from '../src/villaWorld.js';

afterEach(() => vi.unstubAllGlobals());

it('never bakes a moving bath or wardrobe leaf at its closed position, but preserves stationary cabinet contacts by identity', () => {
  const scene = new THREE.Scene(), bath = createVillaBathDoorModel(scene), closet = createVillaWardrobe(scene), fridge = createVillaFridge(scene);
  const moving = new Set([...bath.doorColliders, ...closet.doorColliders]);
  const far = bath.doorColliders[3]!;
  const oldZ = (far.minZ + far.maxZ) / 2;
  // A distinct stationary box with exactly the same six numbers must not be lost.
  const twin = { ...far }, all = [...bath.colliders, ...closet.colliders, ...fridge.colliders, twin];
  const expected = all.filter(c => !moving.has(c));
  const verifyIdentities = () => {
    const fixed = fixedVillaContactColliders(scene, all);
    expect(moving.size).toBe(14); expect(fixed).toHaveLength(expected.length);
    expected.forEach((c, i) => expect(fixed[i]).toBe(c));
    expect(fixed).toContain(twin); expect(fixed).toContain(fridge.colliders[0]);
    for (const c of moving) expect(fixed).not.toContain(c);
  };
  try {
    verifyIdentities();
    const paint = { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} };
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => paint }) });
    const renderer = Object.assign(Object.create(VillaScene.prototype), { scene }) as { addContactShadows(parts: readonly VillaCollider[]): void };
    // Inspect the actual authored decal vertices, not metadata or draw-call totals.
    renderer.addContactShadows([...moving]); expect(scene.getObjectByName('villa-contact-shadows')).toBeUndefined();
    renderer.addContactShadows(all);
    const mesh = scene.getObjectByName('villa-contact-shadows') as THREE.Mesh;
    const pos = mesh.geometry.getAttribute('position');
    const atFloor = expected.filter(c => [0, 3.6, 7.2].some(y => Math.abs(c.minY - y) < .08));
    expect(pos.count).toBe(atFloor.length * 4);
    atFloor.forEach((c, i) => {
      let x = 0, y = 0, z = 0;
      for (let k = 4 * i; k < 4 * i + 4; k++) { x += pos.getX(k); y += pos.getY(k); z += pos.getZ(k); }
      expect(x / 4).toBeCloseTo((c.minX + c.maxX) / 2, 5); expect(z / 4).toBeCloseTo((c.minZ + c.maxZ) / 2, 5);
      expect(y / 4).toBeCloseTo(c.minY + .039, 5);
    });
    const doors = createVillaBathDoors(); doors.west = doors.east = true; doors.progressW = doors.progressE = 1; bath.update(doors);
    const hinges = createVillaWardrobes(); hinges.wardrobes[VILLA_MASTER_WARDROBE.id]!.progress = 1; closet.update(hinges);
    expect(oldZ - (far.minZ + far.maxZ) / 2).toBeCloseTo(4.51, 3); verifyIdentities();
  } finally {
    const geometry = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    scene.traverse(o => { if (o instanceof THREE.Mesh) { geometry.add(o.geometry); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m)); } });
    for (const m of materials) { if (m instanceof THREE.MeshBasicMaterial) m.map?.dispose(); m.dispose(); }
    geometry.forEach(g => g.dispose());
  }
});
