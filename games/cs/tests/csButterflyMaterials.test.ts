import { describe, expect, it } from 'vitest';
import { butterflyMaterials } from '../src/csButterflyMaterials.js';
import { karambitMaterials } from '../src/csKarambitMaterials.js';
import { makeWeapon } from '../src/csWeapons.js';
import { freeGeometry } from '../src/csEngine.js';
import * as T from 'three';

describe('butterfly material ownership', () => {
  it('uses a small static local probe and distinct satin/edge/matte finishes', () => {
    const m = butterflyMaterials(); expect(butterflyMaterials()).toBe(m);
    const map = m.satin.envMap!;
    expect(map).toBe(m.bevel.envMap); expect(map).toBe(m.liner.envMap);
    expect(map).not.toBe(karambitMaterials().face.envMap);
    expect(map.image.width).toBe(256); expect(map.image.height).toBe(128);
    expect(map.image.data.byteLength).toBe(256 * 128 * 8);
    expect(map.mapping).toBe(T.EquirectangularReflectionMapping);
    expect(map.colorSpace).toBe(T.LinearSRGBColorSpace);
    expect(m.bevel.roughness).toBeLessThan(m.satin.roughness);
    expect(m.grip.envMap).toBeNull(); expect(m.grip.metalness).toBeLessThan(.1);
    for (const material of Object.values(m)) expect(material.userData.ownedCsWeaponMaterial).not.toBe(true);
  });
  it('does not dispose shared butterfly finishes with an instance or alter other knife materials', () => {
    const materials = butterflyMaterials(), other = karambitMaterials();
    const snapshot = Object.values(other).map(m => [m.uuid, m.color.getHex(), m.metalness, m.roughness, m.envMap?.uuid]);
    let disposals = 0; const disposed = () => { disposals++; };
    Object.values(materials).forEach(m => m.addEventListener('dispose', disposed));
    materials.satin.envMap!.addEventListener('dispose', disposed);
    try {
      for (let i = 0; i < 3; i++) {
        const knife = makeWeapon('knife', true, 'butterfly');
        const seen = new Set<any>(); knife.traverse((o: any) => { for (const m of [].concat(o.material || [])) seen.add(m); });
        expect(seen.has(materials.satin)).toBe(true); expect(seen.has(materials.bevel)).toBe(true);
        freeGeometry(knife);
      }
      expect(disposals).toBe(0);
      expect(Object.values(other).map(m => [m.uuid, m.color.getHex(), m.metalness, m.roughness, m.envMap?.uuid])).toEqual(snapshot);
    } finally {
      Object.values(materials).forEach(m => m.removeEventListener('dispose', disposed));
      materials.satin.envMap!.removeEventListener('dispose', disposed);
    }
  });
});
