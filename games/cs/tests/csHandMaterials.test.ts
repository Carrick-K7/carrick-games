import { afterEach, describe, expect, it } from 'vitest';
import * as T from 'three';
import { CsEngine, freeGeometry } from '../src/csEngine.js';
import { makeWeapon } from '../src/csWeapons.js';

const models: T.Object3D[] = [];
afterEach(() => models.splice(0).forEach(freeGeometry));
function model(id: string, hands = true, knife = 'classic') {
  const result = makeWeapon(id, hands, knife);
  models.push(result);
  return result;
}
function materials(root: T.Object3D): T.MeshStandardMaterial[] {
  const result = new Set<T.MeshStandardMaterial>();
  root.traverse(object => {
    if (!(object instanceof T.Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material instanceof T.MeshStandardMaterial) result.add(material);
    }
  });
  return [...result];
}
function finish(material: T.MeshStandardMaterial) {
  return [material.color.getHex(), material.metalness, material.roughness];
}
function materialSnapshot(root: T.Object3D) {
  return materials(root).map(finish).sort((a, b) => a[0] - b[0]);
}
function handFinishes(object: T.Object3D) {
  const rig = object.userData.rig;
  if (rig.knifeRight) return {
    glove: rig.knifeRight.mesh.material as T.MeshStandardMaterial,
    sleeve: rig.knifeForearm.material as T.MeshStandardMaterial,
    cuff: rig.knifeCuff.material as T.MeshStandardMaterial,
  };
  return {
    glove: rig.right.skin.mesh.material as T.MeshStandardMaterial,
    sleeve: rig.right.arm.material as T.MeshStandardMaterial,
    cuff: rig.right.cuff.material as T.MeshStandardMaterial,
  };
}

describe('first-person hand material scope', () => {
  it.each([
    ['ak47', 'classic'], ['deagle', 'classic'], ['he', 'classic'],
    ['knife', 'classic'], ['knife', 'karambit'], ['knife', 'butterfly'],
  ])('uses restrained matte glove/sleeve colors for %s / %s', (id, knife) => {
    const object = model(id, true, knife), { glove, sleeve, cuff } = handFinishes(object);
    expect(finish(glove)).toEqual([0x3b3932, 0, .96]);
    expect(finish(sleeve)).toEqual([0x4a4c42, 0, .98]);
    expect(finish(cuff)).toEqual([0x171a19, 0, .96]);
    expect(glove).not.toBe(sleeve); expect(glove).not.toBe(cuff); expect(sleeve).not.toBe(cuff);
    for (const material of [glove, sleeve, cuff]) {
      expect(material.type).toBe('MeshStandardMaterial');
      expect(material.emissive.getHex()).toBe(0);
      expect(material.toneMapped).toBe(true);
      expect(material.map).toBeNull(); expect(material.normalMap).toBeNull();
      expect(material.vertexColors).toBe(false);
      expect(material.userData.ownedCsWeaponMaterial).not.toBe(true);
    }
  });

  it('also uses the same palette on the primitive C4 hands without recoloring straps', () => {
    const c4 = model('c4'), rig = c4.userData.rig;
    for (const side of [rig.left, rig.right]) {
      expect(materialSnapshot(side.hand)).toEqual([[0x171a19, 0, .96], [0x3b3932, 0, .96]]);
      expect(finish(side.arm.material)).toEqual([0x4a4c42, 0, .98]);
    }
    expect(materialSnapshot(rig.core)).toEqual([
      [0x111719, .45, .53], [0x171a19, 0, .96], [0x276076, .68, .15],
      [0x66714b, .04, .89], [0x697375, .82, .33], [0xb49449, .74, .31],
    ]);
  });

  it.each(['ak47', 'deagle', 'he', 'c4'])('keeps %s weapon materials independent of the hand palette', id => {
    const world = model(id, false), view = model(id);
    expect(materialSnapshot(view.userData.rig.core)).toEqual(materialSnapshot(world.userData.rig.core));
    const bodyMaterials = materials(view.userData.rig.core);
    for (const material of bodyMaterials) {
      expect([0x3b3932, 0x4a4c42]).not.toContain(material.color.getHex());
    }
    if (id !== 'c4') {
      const { glove, sleeve } = handFinishes(view);
      expect(bodyMaterials).not.toContain(glove); expect(bodyMaterials).not.toContain(sleeve);
    }
  });

  it('does not dispose shared hand/cuff materials when another view model is released', () => {
    const surviving = model('he'), shared = handFinishes(surviving);
    const snapshot = Object.values(shared).map(finish);
    let disposals = 0;
    const disposed = () => { disposals++; };
    Object.values(shared).forEach(material => material.addEventListener('dispose', disposed));
    try {
      for (const id of ['ak47', 'deagle', 'knife']) {
        const temporary = makeWeapon(id, true, 'classic');
        try {
          const finishes = handFinishes(temporary);
          expect(finishes.glove).toBe(shared.glove);
          expect(finishes.sleeve).toBe(shared.sleeve);
          expect(finishes.cuff).toBe(shared.cuff);
        } finally { freeGeometry(temporary); }
      }
      expect(disposals).toBe(0);
      expect(Object.values(shared).map(finish)).toEqual(snapshot);
    } finally {
      Object.values(shared).forEach(material => material.removeEventListener('dispose', disposed));
    }
  });

  it('retains the separate first-person and map lighting without initializing a renderer', () => {
    const engine = new CsEngine({ canvas: {}, assetUrl: (path: string) => path });
    const lights = (scene: T.Scene) => scene.children.filter(object => object instanceof T.Light).map(object => {
      const light = object as T.Light;
      return [light.type, light.color.getHex(), light.intensity,
        light instanceof T.HemisphereLight ? light.groundColor.getHex() : null,
        light.position.toArray()];
    });
    try {
      const before = { gun: lights(engine.gunScene), map: lights(engine.scene) };
      expect(before.gun).toEqual([
        ['HemisphereLight', 0xf2f8ff, 2.4, 0x54718b, [0, 1, 0]],
        ['DirectionalLight', 0xffedcf, 3, null, [-2, 4, 3]],
      ]);
      expect(before.map).toEqual([
        ['HemisphereLight', 0xe1f0ff, 2.3, 0x687d8d, [0, 1, 0]],
        ['DirectionalLight', 0xffeeda, 2.7, null, [-25, 48, 18]],
      ]);
      engine.gunScene.add(model('he'), model('knife'));
      expect({ gun: lights(engine.gunScene), map: lights(engine.scene) }).toEqual(before);
      expect(engine.renderer).toBeNull();
    } finally { engine.dispose(); }
  });
});
