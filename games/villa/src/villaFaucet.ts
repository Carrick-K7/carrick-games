import * as THREE from 'three';
import { formedTube, type PathStation } from './villaFittingGeometry.js';
import type { FurnitureKit } from './villaFurnitureForms.js';
import { pantryPart } from './villaPantryFinish.js';

/** Deck escutcheon, swivel joint, swan neck and rolled aerator nose. The whole casting
 * has a bore, including the down-facing outlet at local (0,.275,.27). One steel draw. */
export function villaKitchenSpoutGeometry() {
  const path: PathStation[] = [[0, 0, 0, .054], [0, .007, 0, .055], [0, .014, 0, .05],
    [0, .018, 0, .035], [0, .027, 0, .033], [0, .09, 0, .033], [0, .096, 0, .030],
    [0, .105, 0, .031], [0, .109, 0, .030], [0, .113, 0, .0235], [0, .365, 0, .0215]];
  for (let i = 1; i <= 16; i++) {
    const a = i * Math.PI / 16; path.push([0, .365 + .135 * Math.sin(a), .135 * (1 - Math.cos(a)), .0215]);
  }
  path.push([0, .309, .27, .022], [0, .305, .27, .0245], [0, .299, .27, .025],
    [0, .296, .27, .024], [0, .292, .27, .025], [0, .278, .27, .025], [0, .275, .27, .023]);
  return formedTube(path, 18, .004, [1, 0, 0]);
}
export function putKitchenSpout(k: FurnitureKit) {
  pantryPart(k, villaKitchenSpoutGeometry(), 'nickel', -5.67, .99, -8.77, 0, 0, 0, 'face');
}

/** Matches the existing recessed kitchen basin and swan-neck spout, in metres. */
export const VILLA_FAUCET = {
  approach: { x: -5.67, y: 0, z: -7.2 },
  outlet: { x: -5.67, y: 1.265, z: -8.5 },
  impactY: .927,
  handle: { x: -5.59, y: 1.06, z: -8.77 },
  basin: { minX: -6.04, maxX: -5.3, minZ: -8.645, maxZ: -8.055 },
} as const;

/** Scene-owned meshes only: no timers, audio contexts, texture fetches or flooding. */
export function createVillaFaucet(parent: THREE.Object3D): { update(time: number, on: boolean): void } {
  const root = new THREE.Group(); root.name = 'kitchen-interactive-faucet'; parent.add(root);
  root.userData = { kind: 'kitchen-tap', outlet: { ...VILLA_FAUCET.outlet }, drainsIntoBasin: true };
  const handle = new THREE.Group(); handle.name = 'kitchen-tap-handle';
  handle.position.copy(VILLA_FAUCET.handle); root.add(handle);
  const lever = new THREE.Mesh(formedTube([[-.065, 0, 0, .019], [-.042, 0, 0, .024], [-.029, 0, 0, .026],
    [-.026, 0, 0, .021], [-.009, 0, 0, .021], [.002, .003, 0, .018], [.017, .011, 0, .011, .015],
    [.048, .024, 0, .008, .014], [.12, .033, 0, .008, .017], [.137, .034, 0, .007, .014], [.14, .034, 0, .004, .01]]),
    new THREE.MeshStandardMaterial({ color: 0xbdb9aa, roughness: .43, metalness: .66 }));
  handle.add(lever);

  const flow = new THREE.Group(); flow.name = 'kitchen-tap-water'; root.add(flow);
  const length = VILLA_FAUCET.outlet.y - VILLA_FAUCET.impactY;
  const water = new THREE.MeshBasicMaterial({ color: 0xa5e9f4, transparent: true, opacity: .62, depthWrite: false });
  const highlight = new THREE.MeshBasicMaterial({ color: 0xe9ffff, transparent: true, opacity: .72, depthWrite: false });
  const stream = new THREE.Mesh(new THREE.CylinderGeometry(.012, .014, length, 8), water);
  stream.name = 'kitchen-tap-stream'; stream.position.set(VILLA_FAUCET.outlet.x, VILLA_FAUCET.impactY + length / 2, VILLA_FAUCET.outlet.z); flow.add(stream);
  const glint = new THREE.Mesh(new THREE.CylinderGeometry(.004, .006, length, 6), highlight);
  glint.position.copy(stream.position); glint.position.x += .005; flow.add(glint);
  const ripple = new THREE.Mesh(new THREE.RingGeometry(.8, 1, 24), water);
  ripple.name = 'kitchen-tap-ripple'; ripple.rotation.x = -Math.PI / 2;
  ripple.position.set(VILLA_FAUCET.outlet.x, VILLA_FAUCET.impactY + .002, VILLA_FAUCET.outlet.z); flow.add(ripple);
  const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(.009, 6, 4), highlight, 8);
  drops.name = 'kitchen-tap-drops'; drops.frustumCulled = false; flow.add(drops);
  const dummy = new THREE.Object3D();
  const update = (time: number, on: boolean) => {
    flow.visible = on; handle.rotation.z = on ? -.48 : 0; root.userData.on = on;
    if (!on) return;
    const t = Number.isFinite(time) ? time : 0;
    stream.scale.x = stream.scale.z = 1 + Math.sin(t * 23) * .08;
    ripple.scale.setScalar(.025 + ((t * 1.7 % 1 + 1) % 1) * .075);
    for (let i = 0; i < drops.count; i++) {
      const progress = ((t * 2.8 + i / drops.count) % 1 + 1) % 1;
      const a = i * 2.4, spread = Math.sin(progress * Math.PI) * .012;
      dummy.position.set(VILLA_FAUCET.outlet.x + Math.sin(a) * spread,
        VILLA_FAUCET.outlet.y - length * progress, VILLA_FAUCET.outlet.z + Math.cos(a) * spread);
      dummy.scale.set(.65, 1.5, .65); dummy.updateMatrix(); drops.setMatrixAt(i, dummy.matrix);
    }
    drops.instanceMatrix.needsUpdate = true;
  };
  update(0, false);
  return { update };
}
