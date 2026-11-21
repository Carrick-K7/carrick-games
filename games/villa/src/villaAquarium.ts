import * as THREE from 'three';
import { medakaTemplates } from './villaMedakaArt.js';
import type { VillaModelBuilder } from './villaModel.js';
import { VILLA_AQUARIUM } from './villaLivingLayout.js';

/** Locally authored proportions informed by Miyuki medaka.
 * Medaka: https://medaka.fr/especes-varietes/medaka-miyuki-longfin-fiche-complete-oryzias-latipes/
 * (The dwarf shrimp were removed on request: their tiny appendage geometry read
 * as visual noise in the tank instead of animals.)
 */
export const VILLA_AQUARIUM_LIFE = {
  fish: { count: 10, species: 'Oryzias latipes', variety: 'Miyuki-style ornamental medaka', physicalLengthCm: [3.5, 4.5], displayLength: 0.13,
    features: ['slender top-view silhouette', 'blue-silver dorsal stripe', 'small upturned mouth', 'rear-set dorsal and anal fins', 'thin translucent fins'] },
} as const;

/** All live animals are instanced per material/part: 10 fish, not 150 draw calls. */
export function createVillaAquariumLife(parent: THREE.Object3D) {
  const root = new THREE.Group(); root.name = 'aquarium/life'; root.userData = { ...VILLA_AQUARIUM_LIFE }; parent.add(root);
  const template = new THREE.Group(), { fish, tail, fins } = medakaTemplates(template);
  function instances(builder: VillaModelBuilder, count: number) {
    return builder.root.children.filter((n): n is THREE.Mesh => n instanceof THREE.Mesh).map(part => {
      const batch = new THREE.InstancedMesh(part.geometry, part.material, count); batch.name = `aquarium/${builder.root.name}`;
      batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage); batch.frustumCulled = false; batch.castShadow = false; root.add(batch); return batch;
    });
  }
  const count = VILLA_AQUARIUM_LIFE.fish.count;
  const fishBatches = instances(fish, count), tailBatches = instances(tail, count), paired = fins.map(({ side, pivot, b }) => ({ side, pivot, batches: instances(b, count) }));
  template.clear(); // Geometry/materials now belong to the scene's instance meshes.
  const fishMarkers = Array.from({ length: count }, (_, i) => {
    const m = new THREE.Object3D(); m.name = `Aquarium fish ${i + 1}`; m.userData = { ...VILLA_AQUARIUM_LIFE.fish, index: i, bodyLength: 0.113, bodyHeight: 0.02, bodyWidth: 0.0152 }; root.add(m); return m;
  });
  const bubbleMat = new THREE.MeshBasicMaterial({ color: '#c7f8f1', transparent: true, opacity: 0.38, depthWrite: false });
  const bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(0.018, 6, 5), bubbleMat, 18);
  bubbles.name = 'aquarium/bubbles'; bubbles.instanceMatrix.setUsage(THREE.DynamicDrawUsage); bubbles.frustumCulled = false; root.add(bubbles);
  const dummy = new THREE.Object3D(), joint = new THREE.Object3D(), jointMatrix = new THREE.Matrix4();
  let foodBlend = 0;
  const allBatches = [...fishBatches, ...tailBatches, ...paired.flatMap(f => f.batches), bubbles];
  function update(time: number, dt: number, feeding: boolean) {
    const t = Number.isFinite(time) ? Math.max(0, time) % 3600 : 0;
    const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    if (time <= 0) foodBlend = 0;
    foodBlend += ((feeding ? 1 : 0) - foodBlend) * (1 - Math.exp(-step * 2.4));
    fishMarkers.forEach((marker, i) => {
      const a = t * (0.2 + i * 0.012) + i * 2.399, radius = 1.28 - foodBlend * 0.91, depth = 0.29 - foodBlend * 0.1;
      const cruisingY = 1.42 + Math.sin(a * 1.37 + i) * 0.32, eatingY = 1.86 + Math.sin(a * 2 + i) * 0.06;
      marker.position.set(VILLA_AQUARIUM.x + Math.cos(a) * radius, THREE.MathUtils.lerp(cruisingY, eatingY, foodBlend), VILLA_AQUARIUM.z + Math.sin(a) * depth);
      marker.rotation.set(0, Math.atan2(-Math.cos(a) * depth, -Math.sin(a) * radius), Math.sin(t * 2 + i) * 0.035);
      marker.scale.setScalar(0.86 + (i % 4) * 0.07); marker.updateMatrix();
      fishBatches.forEach(batch => batch.setMatrixAt(i, marker.matrix));
      joint.position.set(-0.057, 0, 0); joint.rotation.set(0, Math.sin(t * 8 + i) * 0.29, 0); joint.updateMatrix();
      jointMatrix.multiplyMatrices(marker.matrix, joint.matrix); tailBatches.forEach(batch => batch.setMatrixAt(i, jointMatrix));
      for (const f of paired) {
        const paddle = Math.sin(t * (5.1 + .08 * i) + i + f.side * .45);
        joint.position.set(...f.pivot); joint.rotation.set(f.side * (.10 + .16 * paddle), f.side * .22 * paddle, 0); joint.updateMatrix();
        jointMatrix.multiplyMatrices(marker.matrix, joint.matrix); f.batches.forEach(batch => batch.setMatrixAt(i, jointMatrix));
      }
    });
    for (let i = 0; i < bubbles.count; i++) {
      const phase = (t * 0.21 + i / 18) % 1;
      dummy.position.set(VILLA_AQUARIUM.x - 1.42 + Math.sin(t * 1.8 + i) * 0.055 + (i % 2) * 2.8, 0.86 + phase * 1.15, VILLA_AQUARIUM.z - 0.21 + Math.cos(i + t) * 0.05);
      dummy.scale.setScalar(0.55 + phase * 0.5); dummy.updateMatrix(); bubbles.setMatrixAt(i, dummy.matrix);
    }
    allBatches.forEach(batch => { batch.instanceMatrix.needsUpdate = true; });
  }
  update(0, 0, false);
  return { root, metadata: VILLA_AQUARIUM_LIFE, update };
}
