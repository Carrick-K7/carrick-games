import * as THREE from 'three';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import type { VillaCollider } from './villaWorld.js';

/** Metres / seconds. Approach is on the kitchen side, clear of the dining chairs. */
export const VILLA_TEA_BAR = {
  x: -6.7, z: -0.6, width: 2.2, depth: 0.8, height: 0.95,
  approach: { x: -6.7, y: 0, z: -1.65 },
  anchor: { x: -6.7, y: 1.22, z: -0.79 },
  duration: 10,
} as const;
export interface VillaTeaBar {
  colliders: VillaCollider[];
  update(time: number, brewing: boolean): void;
}

/** Static material batches + one subtle steam instance batch; all scene-owned. */
export function createVillaTeaBar(parent: THREE.Object3D): VillaTeaBar {
  const b = new VillaModelBuilder(parent, 'villa-tea-bar');
  const oak = villaMaterial(0xba9166, 0.76), walnut = villaMaterial(0x735037, 0.79);
  const stone = villaMaterial(0xe3e0d5, 0.64), ceramic = villaMaterial(0xd2dfce, 0.32);
  const clay = villaMaterial(0x9e6546, 0.82), bronze = villaMaterial(0xbca16c, 0.36, 0.55);
  const dark = villaMaterial(0x393b35, 0.58), tea = villaMaterial(0x795325, 0.31);
  const named = (name: string, x: number, y: number, z: number, details: Record<string, unknown> = {}) => {
    const marker = new THREE.Object3D(); marker.name = `tea-bar/${name}`;
    marker.position.set(VILLA_TEA_BAR.x + x, y, VILLA_TEA_BAR.z + z);
    marker.userData = { component: name, ...details }; b.root.add(marker);
  };
  const ring = (x: number, y: number, z: number, radius: number, tube: number, material: THREE.Material, flat = false) => {
    b.geometry(new THREE.TorusGeometry(radius, tube, 6, 18), material, [x, y, z], flat ? [Math.PI / 2, 0, 0] : [0, 0, 0]);
  };
  b.at(VILLA_TEA_BAR.x, 0, VILLA_TEA_BAR.z, 0, () => {
    // Slightly recessed plinth and fronts keep pulls inside the stone footprint.
    b.box(0, 0.06, 0, 1.98, 0.12, 0.62, walnut);
    b.box(0, 0.5, 0, 2.12, 0.78, 0.7, oak);
    b.box(0, 0.915, 0, 2.2, 0.07, 0.8, stone, 0.022);
    b.box(0, 0.87, 0, 2.15, 0.018, 0.73, walnut, 0.004);
    // Three real drawer fronts and lower doors on the visitor-facing side.
    for (const x of [-0.69, 0, 0.69]) {
      b.box(x, 0.715, -0.355, 0.66, 0.225, 0.033, oak, 0.009);
      b.box(x, 0.363, -0.355, 0.66, 0.435, 0.033, oak, 0.009);
      b.box(x, 0.61, -0.374, 0.61, 0.009, 0.003, walnut, 0);
      for (const y of [0.745, 0.52]) {
        for (const dx of [-0.087, 0.087]) b.beam([x + dx, y, -0.365], [x + dx, y, -0.383], 0.007, bronze);
        b.beam([x - 0.095, y, -0.383], [x + 0.095, y, -0.383], 0.009, bronze);
      }
    }
    // Subtle oak end grain/slats, not applied textures or extra draw calls.
    for (const side of [-1, 1]) for (let i = 0; i < 7; i++) b.box(side * 1.064, 0.48, -0.26 + i * 0.087, 0.007, 0.68, 0.012, walnut, 0.002);
    named('cabinet', 0, 0.48, 0, { drawers: 3, doors: 3 });
    named('stone-counter', 0, 0.95, 0, { width: 2.2, depth: 0.8 });

    // Draining tea tray: dark recess beneath spaced bamboo/oak slats and rim.
    b.box(0.13, 0.965, -0.095, 1.14, 0.026, 0.47, walnut, 0.01);
    for (let i = 0; i < 13; i++) b.box(-0.37 + i * 0.083, 0.983, -0.095, 0.067, 0.018, 0.4, oak, 0.004);
    for (const z of [-0.327, 0.137]) b.box(0.13, 0.987, z, 1.14, 0.032, 0.018, walnut, 0.004);
    for (const x of [-0.433, 0.693]) b.box(x, 0.987, -0.095, 0.018, 0.032, 0.47, walnut, 0.004);
    named('tea-tray', 0.13, 0.99, -0.095, { slats: 13 });

    // Compact gooseneck kettle, low base, fitted lid and open loop handle.
    b.cylinder(-0.74, 0.967, 0.03, 0.157, 0.16, 0.034, dark);
    b.ellipsoid(-0.74, 1.119, 0.03, 0.14, 0.15, 0.137, bronze);
    b.cylinder(-0.74, 1.256, 0.03, 0.09, 0.104, 0.023, bronze);
    b.ellipsoid(-0.74, 1.283, 0.03, 0.027, 0.018, 0.025, walnut);
    ring(-0.9, 1.155, 0.03, 0.09, 0.017, walnut);
    const neck = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.63, 1.12, 0.03), new THREE.Vector3(-0.52, 1.19, 0.03),
      new THREE.Vector3(-0.48, 1.33, 0.03), new THREE.Vector3(-0.34, 1.35, 0.03),
      new THREE.Vector3(-0.29, 1.292, 0.03),
    ]);
    b.geometry(new THREE.TubeGeometry(neck, 20, 0.014, 7, false), bronze);
    b.cylinder(-0.29, 1.291, 0.03, 0.01, 0.01, 0.005, dark);
    named('gooseneck-kettle', -0.74, 1.12, 0.03, { curvedSpout: true, handle: true });

    // Yixing-style round teapot, fitted lid, finial, side handle and angled spout.
    b.ellipsoid(-0.065, 1.088, -0.018, 0.132, 0.093, 0.105, clay);
    b.cylinder(-0.065, 1.171, -0.018, 0.09, 0.098, 0.023, clay);
    b.ellipsoid(-0.065, 1.196, -0.018, 0.025, 0.019, 0.025, walnut);
    ring(-0.22, 1.107, -0.018, 0.067, 0.016, clay);
    b.beam([0.04, 1.065, -0.018], [0.17, 1.157, -0.018], 0.026, clay);
    b.cylinder(0.17, 1.16, -0.018, 0.018, 0.018, 0.008, dark);
    named('teapot', -0.065, 1.09, -0.018, { lid: true, handle: true, spout: true });

    for (const [i, x] of [0.25, 0.5].entries()) {
      b.cylinder(x, 1.006, -0.205, 0.071, 0.067, 0.014, ceramic);
      const profile = [[0, 0], [0.033, 0], [0.047, 0.056], [0.041, 0.056], [0.028, 0.013], [0, 0.013]].map(([r, y]) => new THREE.Vector2(r, y));
      b.geometry(new THREE.LatheGeometry(profile, 18), ceramic, [x, 1.013, -0.205]);
      b.cylinder(x, 1.057, -0.205, 0.039, 0.039, 0.002, tea);
      named(`cup-${i + 1}`, x, 1.069, -0.205, { openRim: true, teaSurface: true });
    }
    // Tea tins sit behind/right of the tray, never in the approach aisle.
    for (const [i, x] of [0.46, 0.77].entries()) {
      const h = i ? 0.245 : 0.195;
      b.cylinder(x, 0.95 + h / 2, 0.235, 0.087, 0.087, h, i ? ceramic : clay);
      b.cylinder(x, 0.952 + h, 0.235, 0.093, 0.093, 0.019, walnut);
      b.cylinder(x, 0.971 + h, 0.235, 0.022, 0.025, 0.021, bronze);
      b.box(x, 1.02, 0.146, 0.063, 0.048, 0.006, bronze, 0.005);
      named(`tea-canister-${i + 1}`, x, 1.06, 0.235, { fittedLid: true });
    }
    // Folded linen towel and bamboo tea scoop at the right end.
    b.box(0.89, 0.967, -0.145, 0.25, 0.027, 0.23, ceramic, 0.008);
    for (let i = 0; i < 4; i++) b.box(0.81 + i * 0.044, 0.982, -0.145, 0.005, 0.002, 0.2, stone, 0);
    b.beam([0.86, 0.998, -0.23], [0.93, 0.998, -0.073], 0.01, oak);
    b.ellipsoid(0.94, 0.998, -0.052, 0.023, 0.008, 0.035, oak);
    named('tea-tools', 0.89, 0.99, -0.145, { scoop: true, foldedTowel: true });
    b.collide(0, 0, 0, VILLA_TEA_BAR.width, VILLA_TEA_BAR.height, VILLA_TEA_BAR.depth);
  });
  const root = b.finish();
  root.userData = { activity: 'tea-brewing', duration: VILLA_TEA_BAR.duration, approach: { ...VILLA_TEA_BAR.approach }, anchor: { ...VILLA_TEA_BAR.anchor }, stool: false };

  const steamMaterial = new THREE.MeshBasicMaterial({ color: 0xe9eee7, transparent: true, opacity: 0.14, depthWrite: false });
  const steam = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 7, 5), steamMaterial, 12);
  steam.name = 'tea-bar/steam'; steam.userData = { effect: 'steam', sources: ['teapot', 'cup-1', 'cup-2'] };
  steam.castShadow = false; steam.receiveShadow = false; steam.frustumCulled = false;
  steam.instanceMatrix.setUsage(THREE.DynamicDrawUsage); root.add(steam);
  const dummy = new THREE.Object3D();
  const sources = [[-0.065, 1.21, -0.018], [0.25, 1.076, -0.205], [0.5, 1.076, -0.205]] as const;
  const update = (time: number, brewing: boolean): void => {
    steam.visible = brewing;
    if (!brewing) return;
    const t = Number.isFinite(time) ? ((time % 6.6) + 6.6) % 6.6 : 0;
    for (let i = 0; i < steam.count; i++) {
      const source = sources[i % sources.length], phase = (t / 2.2 + Math.floor(i / 3) / 4) % 1;
      const envelope = Math.sin(phase * Math.PI), scale = 0.012 + envelope * 0.026;
      dummy.position.set(VILLA_TEA_BAR.x + source[0] + Math.sin(phase * 5 + i) * 0.027 * envelope,
        source[1] + phase * 0.32, VILLA_TEA_BAR.z + source[2] + Math.cos(phase * 4 + i) * 0.018 * envelope);
      dummy.scale.set(scale * envelope, scale * 1.8 * envelope, scale * envelope); dummy.updateMatrix();
      steam.setMatrixAt(i, dummy.matrix);
    }
    steam.instanceMatrix.needsUpdate = true;
  };
  update(0, false);
  return { colliders: b.colliders, update };
}
