import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createVillaAnimeFigureDisplay, createVillaGaming, VILLA_ANIME_FIGURES } from '../src/villaGaming.js';
import { createVillaActivities, VILLA_RACING } from '../src/villaActivities.js';
import { villaSeatColliderId } from '../src/villaSeating.js';

function dispose(root: THREE.Object3D) {
  const materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  root.traverse(n => {
    if (!(n instanceof THREE.Mesh)) return;
    n.geometry.dispose();
    for (const m of Array.isArray(n.material) ? n.material : [n.material]) {
      materials.add(m); for (const value of Object.values(m)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
}
function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const result: THREE.Mesh[] = []; root.traverse(n => { if (n instanceof THREE.Mesh) result.push(n); }); return result;
}
function canvasStub() {
  const ctx = new Proxy({}, { get: (_, name) => name === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}, set: () => true });
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) });
}
afterEach(() => vi.unstubAllGlobals());

describe('Villa original adult anime collector display', () => {
  it('has nine distinct adult designs, full-coverage outfits and common collector poses', () => {
    const scene = new THREE.Group(), display = createVillaAnimeFigureDisplay(scene);
    expect(VILLA_ANIME_FIGURES).toHaveLength(9); expect(new Set(display.figureNames).size).toBe(9);
    expect(VILLA_ANIME_FIGURES.every(d => d.age >= 25 && /dress|coat|jacket/.test(d.clothing))).toBe(true);
    expect(new Set(VILLA_ANIME_FIGURES.map(d => d.hairstyle)).size).toBe(9);
    expect(new Set(VILLA_ANIME_FIGURES.map(d => d.pose))).toEqual(new Set(['contrapposto', 'greeting hand', 'holding book', 'shoulder bag', 'flowing cape', 'flowing dress']));
    expect(display.root.userData).toMatchObject({ compartments: 9, originalDesigns: true, adultFigures: true, modestClothing: true, facing: '+X' });
    expect(display.root.getObjectByName('originalChibiGirlWall')).not.toBeInstanceOf(THREE.Mesh);
    const markers = display.root.children.filter(n => n.name.startsWith('originalAnimeFigure-'));
    expect(markers).toHaveLength(9);
    for (const marker of markers) {
      expect(marker.userData.headsTall).toBeGreaterThanOrEqual(5); expect(marker.userData.headsTall).toBeLessThanOrEqual(6);
      expect(marker.userData.baseHeight).toBe(marker.userData.soleHeight); expect(marker.userData.baseOnShelf).toBe(true);
    }
    dispose(scene);
  });
  it('verifies the actual slender silhouette including its hair crown, and fits every compartment', () => {
    const scene = new THREE.Group(), display = createVillaAnimeFigureDisplay(scene), surfaces = meshes(display.root);
    for (let index = 0; index < 9; index++) {
      const marker = display.root.getObjectByName(`originalAnimeFigure-${index}`)!, x = marker.position.x, base = marker.position.y;
      const body = new THREE.Box3(), head = new THREE.Box3(), shoulders = new THREE.Box3();
      for (const mesh of surfaces) {
        const material = mesh.material as THREE.MeshStandardMaterial;
        if (material.transparent || !material.name || material.name === 'anime-display-walnut' || material.name === 'anime-display-brass') continue;
        const p = mesh.geometry.getAttribute('position');
        for (let i = 0; i < p.count; i++) {
          const point = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
          if (Math.abs(point.x - x) > 0.3 || point.z < -0.125 || point.z > 0.13 || point.y < base + 0.033 || point.y > base + 0.74) continue;
          body.expandByPoint(point);
          // Exclude a raised greeting hand and loose ponytail from face width.
          if (point.y >= base + 0.56 && material.name === 'anime-display-skin' && Math.abs(point.x - x) < 0.065) head.expandByPoint(point);
          if (point.y >= base + 0.475 && point.y <= base + 0.51) shoulders.expandByPoint(point);
        }
      }
      expect(body.max.y - base).toBeCloseTo(0.684, 3);
      const ratio = (body.max.y - body.min.y) / (body.max.y - (base + 0.56));
      expect(ratio).toBeGreaterThan(5); expect(ratio).toBeLessThan(6);
      expect(head.max.x - head.min.x).toBeLessThan((shoulders.max.x - shoulders.min.x) * 0.8);
      expect(body.max.y).toBeLessThan([0.8315, 1.6515, 2.4965][Math.floor(index / 3)]);
      expect(body.max.z).toBeLessThan(0.23); expect(body.min.z).toBeGreaterThan(-0.17);
    }
    dispose(scene);
  });
  it('puts both closed shoe soles directly on each base, without floating statues', () => {
    const scene = new THREE.Group(), display = createVillaAnimeFigureDisplay(scene); scene.updateMatrixWorld(true);
    const shoeSurfaces = meshes(display.root).filter(m => (m.material as THREE.Material).name === 'anime-display-ink');
    const ray = new THREE.Raycaster();
    for (let i = 0; i < 9; i++) {
      const marker = display.root.getObjectByName(`originalAnimeFigure-${i}`)!;
      for (const [x, z] of [[-0.052, 0.046], [0.04, 0.021]]) {
        const local = new THREE.Vector3(marker.position.x + x, marker.position.y + 0.025, marker.position.z + z);
        ray.set(local.applyMatrix4(display.root.matrixWorld), new THREE.Vector3(0, 1, 0));
        const hit = ray.intersectObjects(shoeSurfaces)[0]; expect(hit).toBeDefined();
        expect(hit.point.y - marker.position.y).toBeCloseTo(0.034, 5);
      }
    }
    dispose(scene);
  });
  it('batches materials, contains finite normals and vertices, and uses no imported assets', () => {
    const scene = new THREE.Group(), light = new THREE.MeshStandardMaterial({ emissive: '#ffc575', emissiveIntensity: 0.8 });
    const display = createVillaAnimeFigureDisplay(scene, light), surfaces = meshes(display.root);
    expect(surfaces.length).toBeLessThanOrEqual(18);
    expect(surfaces.reduce((sum, m) => sum + m.geometry.getAttribute('position').count / 3, 0)).toBeLessThan(100000);
    expect(surfaces.some(m => m.material === light)).toBe(true);
    for (const mesh of surfaces) {
      const material = mesh.material as THREE.MeshStandardMaterial; expect(material.map).toBeNull();
      for (const name of ['position', 'normal']) {
        const attribute = mesh.geometry.getAttribute(name);
        expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);
      }
    }
    scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(display.root);
    expect(bounds.max.x).toBeCloseTo(2.564, 3); expect(bounds.min.z).toBeCloseTo(4.6, 3); expect(bounds.max.z).toBeCloseTo(8.3, 3);
    dispose(scene);
  });
});

describe('Villa gaming integration stays functional', () => {
  it('registers the unmoved PC chair and retains cabinet lights, replicas, media and rally rig', () => {
    canvasStub();
    const root = new THREE.Group(), gaming = createVillaGaming(root);
    const chair = root.getObjectByName('ergonomicGamingChair')!;
    expect(chair.position.toArray()).toEqual([7.25, 0, 5.1]); expect(chair.userData).toMatchObject({ seatId: 'chair-pc', sitable: true, cushionHeight: 0.55, yaw: 0 });
    const chairColliders = gaming.colliders.filter(c => villaSeatColliderId(c) === 'chair-pc'); expect(chairColliders).toHaveLength(1);
    expect(chairColliders[0].minX).toBeCloseTo(6.9); expect(chairColliders[0].maxZ).toBeCloseTo(5.475);
    const cockpit = root.getObjectByName('racingCockpit')!;
    expect(cockpit.position.toArray()).toEqual([VILLA_RACING.seat.x, 0, VILLA_RACING.seat.z]);
    expect(root.getObjectByName('mechanicalKeyboard')!.userData.keyboardKeys).toBe(87);
    expect(root.getObjectByName('lockedReplicaCabinet')!.userData.replicaNames).toEqual(['AK47', 'MosinNagant', 'MP5K']);
    expect(root.getObjectByName('consoleMediaShelf')!.userData.consoleSources).toEqual(['pc', 'ps', 'switch']);
    const display = root.getObjectByName('originalAnimeFigureWall')!;
    const light = meshes(display).map(m => m.material as THREE.MeshStandardMaterial).find(m => m.emissive?.getHexString() === 'ffc575')!;
    expect(light).toBeDefined();
    const state = { ...createVillaActivities(), gaming: true };
    gaming.update(0, state); expect(light.emissiveIntensity).toBe(0.8);
    state.displayLights = false; gaming.update(0, state); expect(light.emissiveIntensity).toBe(0);
    for (const source of ['pc', 'ps', 'switch'] as const) { state.screenSource = source; expect(gaming.update(1, state)).toBe(false); }
    state.displayLights = true; gaming.update(2, state); expect(light.emissiveIntensity).toBe(0.8);
    dispose(root);
  });
});
