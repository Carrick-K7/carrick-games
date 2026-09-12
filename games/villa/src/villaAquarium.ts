import * as THREE from 'three';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import { VILLA_AQUARIUM } from './villaLivingLayout.js';

/** Locally authored proportions informed by Miyuki medaka and wild-type dwarf shrimp.
 * Medaka: https://medaka.fr/especes-varietes/medaka-miyuki-longfin-fiche-complete-oryzias-latipes/
 * Shrimp colour: https://nas.er.usgs.gov/queries/FactSheet.aspx?SpeciesID=2257
 * “Black-shell” is a broad trade name, NOT an assertion that every animal is one species.
 */
export const VILLA_AQUARIUM_LIFE = {
  fish: { count: 10, species: 'Oryzias latipes', variety: 'Miyuki-style ornamental medaka', physicalLengthCm: [3.5, 4.5], displayLength: 0.13,
    features: ['slender top-view silhouette', 'blue-silver dorsal stripe', 'small upturned mouth', 'rear-set dorsal and anal fins', 'thin translucent fins'] },
  shrimp: { count: 6, tradeName: 'black-shell dwarf shrimp', species: 'Neocaridina-type dwarf shrimp; trade identity not asserted',
    colour: 'translucent dark-brown / olive', displayLength: 0.09,
    features: ['segmented abdomen', 'rostrum', 'antennae', 'walking legs', 'tail fan', 'substrate grazing'] },
} as const;

/** All live animals are instanced per material/part: 10 fish + 6 shrimp, not 150 draw calls. */
export function createVillaAquariumLife(parent: THREE.Object3D) {
  const root = new THREE.Group(); root.name = 'aquarium/life'; root.userData = { ...VILLA_AQUARIUM_LIFE }; parent.add(root);
  const silver = villaMaterial('#9baeb1', 0.24, 0.42), stripe = villaMaterial('#b9e6f7', 0.13, 0.78);
  const eyes = villaMaterial('#182325', 0.22), fins = villaMaterial('#b9d5d1', 0.34, 0.13);
  fins.transparent = true; fins.opacity = 0.43; fins.depthWrite = false; fins.side = THREE.DoubleSide;
  const shell = villaMaterial('#3c4030', 0.53, 0.04); shell.transparent = true; shell.opacity = 0.77; shell.depthWrite = false;
  const appendage = villaMaterial('#74735a', 0.58); appendage.transparent = true; appendage.opacity = 0.6; appendage.depthWrite = false;
  const plates = villaMaterial('#252c21', 0.59);
  const template = new THREE.Group();
  const triangle = (b: VillaModelBuilder, points: number[], material: THREE.Material) => {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3)); b.geometry(geometry, material);
  };
  const fish = new VillaModelBuilder(template, 'medaka-template');
  // A tapered fusiform body, flattened slightly across the back. No round goldfish belly.
  const rings = [[-0.057, 0.0028], [-0.041, 0.006], [-0.02, 0.009], [0.01, 0.01], [0.035, 0.0078], [0.049, 0.004], [0.056, 0.0015]];
  const points: number[] = [], indices: number[] = [];
  rings.forEach(([x, r], i) => {
    for (let j = 0; j < 10; j++) { const a = j * Math.PI / 5; points.push(x, Math.sin(a) * r, Math.cos(a) * r * 0.76); }
    if (i) for (let j = 0; j < 10; j++) { const a = (i - 1) * 10 + j, b = (i - 1) * 10 + (j + 1) % 10, c = i * 10 + j, d = i * 10 + (j + 1) % 10; indices.push(a, c, b, b, c, d); }
  });
  const body = new THREE.BufferGeometry(); body.setAttribute('position', new THREE.Float32BufferAttribute(points, 3)); body.setIndex(indices); body.computeVertexNormals(); fish.geometry(body, silver);
  fish.ellipsoid(0.001, 0.0095, 0, 0.044, 0.0017, 0.0025, stripe);
  for (const side of [-1, 1]) {
    fish.ellipsoid(0.037, 0.0034, side * 0.0065, 0.0032, 0.0031, 0.0015, eyes);
    fish.ellipsoid(0.038, 0.0041, side * 0.0075, 0.0008, 0.0008, 0.0004, stripe);
    triangle(fish, [0.025, 0.001, side * 0.006, 0.01, -0.003, side * 0.019, 0.003, 0.001, side * 0.008], fins);
    // Short pelvic fins below the midbody.
    triangle(fish, [0, -0.007, side * 0.003, -0.018, -0.015, side * 0.008, -0.013, -0.005, side * 0.004], fins);
  }
  // Dorsal and long anal fins sit well behind the body midpoint, as in medaka.
  triangle(fish, [-0.022, 0.008, 0, -0.031, 0.024, 0, -0.051, 0.006, 0], fins);
  triangle(fish, [-0.01, -0.008, 0, -0.025, -0.023, 0, -0.052, -0.008, 0], fins);
  fish.beam([0.052, 0.003, -0.0018], [0.057, 0.0055, 0.0018], 0.0007, eyes, 5); // tiny upturned mouth
  fish.finish();
  const tail = new VillaModelBuilder(template, 'medaka-tail');
  triangle(tail, [0, 0, 0, -0.026, 0.017, 0.0006, -0.03, -0.015, 0.0006], fins);
  for (const y of [-0.012, 0, 0.014]) tail.beam([0, 0, 0], [-0.027, y, 0], 0.00038, fins, 4);
  tail.finish();

  const shrimp = new VillaModelBuilder(template, 'shrimp-template');
  shrimp.ellipsoid(0.016, 0.014, 0, 0.019, 0.011, 0.01, shell);
  for (let i = 0; i < 5; i++) {
    const x = -0.004 - i * 0.009, y = 0.013 - i * i * 0.00033;
    shrimp.ellipsoid(x, y, 0, 0.008, 0.009 - i * 0.0008, 0.008 - i * 0.0007, shell);
    shrimp.beam([x - 0.003, y + 0.007 - i * 0.0006, -0.004], [x - 0.003, y + 0.007 - i * 0.0006, 0.004], 0.0006, plates, 5);
  }
  for (const side of [-1, 1]) {
    shrimp.beam([0.027, 0.02, side * 0.002], [0.049, 0.021, 0], 0.0012, shell, 5); // toothed narrow rostrum
    shrimp.beam([0.028, 0.013, side * 0.003], [0.057, 0.022, side * 0.017], 0.0005, appendage, 4);
    shrimp.beam([0.057, 0.022, side * 0.017], [0.069, 0.016, side * 0.023], 0.0004, appendage, 4);
    shrimp.ellipsoid(0.03, 0.019, side * 0.007, 0.0018, 0.0018, 0.0018, eyes);
    for (let i = 0; i < 5; i++) {
      const x = 0.019 - i * 0.007;
      shrimp.beam([x, 0.01, side * 0.006], [x - 0.004, 0.005, side * 0.013], 0.00075, appendage, 4);
      shrimp.beam([x - 0.004, 0.005, side * 0.013], [x + 0.004, 0.001, side * 0.016], 0.00055, appendage, 4);
    }
    triangle(shrimp, [-0.043, 0.006, 0, -0.055, 0.002, side * 0.015, -0.052, 0.005, side * 0.004], appendage);
  }
  shrimp.finish();
  const claws = new VillaModelBuilder(template, 'shrimp-grazing-legs');
  for (const side of [-1, 1]) {
    claws.beam([0.024, 0.007, side * 0.005], [0.033, 0.002, side * 0.012], 0.0008, appendage, 4);
    claws.beam([0.033, 0.002, side * 0.012], [0.038, 0.004, side * 0.007], 0.0006, appendage, 4);
  }
  claws.finish();
  function instances(builder: VillaModelBuilder, count: number) {
    return builder.root.children.filter((n): n is THREE.Mesh => n instanceof THREE.Mesh).map(part => {
      const batch = new THREE.InstancedMesh(part.geometry, part.material, count); batch.name = `aquarium/${builder.root.name}`;
      batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage); batch.frustumCulled = false; batch.castShadow = false; root.add(batch); return batch;
    });
  }
  const fishBatches = instances(fish, 10), tailBatches = instances(tail, 10), shrimpBatches = instances(shrimp, 6), clawBatches = instances(claws, 6);
  template.clear(); // Geometry/materials now belong to the scene's instance meshes.
  const fishMarkers = Array.from({ length: 10 }, (_, i) => {
    const m = new THREE.Object3D(); m.name = `Aquarium fish ${i + 1}`; m.userData = { ...VILLA_AQUARIUM_LIFE.fish, index: i, bodyLength: 0.113, bodyHeight: 0.02, bodyWidth: 0.0152 }; root.add(m); return m;
  });
  const shrimpMarkers = Array.from({ length: 6 }, (_, i) => {
    const m = new THREE.Object3D(); m.name = `aquarium/shrimp-${i + 1}`; m.userData = { ...VILLA_AQUARIUM_LIFE.shrimp, index: i }; root.add(m); return m;
  });
  const bubbleMat = new THREE.MeshBasicMaterial({ color: '#c7f8f1', transparent: true, opacity: 0.38, depthWrite: false });
  const bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(0.018, 6, 5), bubbleMat, 18);
  bubbles.name = 'aquarium/bubbles'; bubbles.instanceMatrix.setUsage(THREE.DynamicDrawUsage); bubbles.frustumCulled = false; root.add(bubbles);
  const dummy = new THREE.Object3D(), joint = new THREE.Object3D(), jointMatrix = new THREE.Matrix4();
  let foodBlend = 0;
  const allBatches = [...fishBatches, ...tailBatches, ...shrimpBatches, ...clawBatches, bubbles];
  const shrimpSites = [[-1.28, 1.08, -0.12], [-0.85, 0.856, 0.26], [-0.18, 0.856, -0.13], [0.5, 1.08, -0.12], [0.99, 0.856, 0.25], [1.22, 1.08, -0.12]];
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
      joint.position.set(-0.057, 0, 0); joint.rotation.y = Math.sin(t * 8 + i) * 0.29; joint.updateMatrix();
      jointMatrix.multiplyMatrices(marker.matrix, joint.matrix); tailBatches.forEach(batch => batch.setMatrixAt(i, jointMatrix));
    });
    shrimpMarkers.forEach((marker, i) => {
      const [x, y, z] = shrimpSites[i], a = t * 0.21 + i * 2.2;
      const dx = Math.sin(a) * 0.025, dz = Math.cos(a) * 0.016;
      const support = y > 1 ? 0.91 + 0.17 * Math.sqrt(Math.max(0, 1 - (dx / 0.18) ** 2 - (dz / 0.17) ** 2)) : y;
      marker.position.set(VILLA_AQUARIUM.x + x + dx, support, VILLA_AQUARIUM.z + z + dz);
      marker.rotation.set(0, i * 1.7 + Math.sin(a * 0.4) * 0.24, Math.sin(t * 1.7 + i) * 0.025); marker.updateMatrix();
      shrimpBatches.forEach(batch => batch.setMatrixAt(i, marker.matrix));
      joint.position.set(0, Math.sin(t * 5.2 + i) * 0.002, 0); joint.rotation.set(0, Math.sin(t * 4.1 + i) * 0.14, 0); joint.updateMatrix();
      jointMatrix.multiplyMatrices(marker.matrix, joint.matrix); clawBatches.forEach(batch => batch.setMatrixAt(i, jointMatrix));
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
