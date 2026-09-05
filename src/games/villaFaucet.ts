import * as THREE from 'three';

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
  const lever = new THREE.Mesh(new THREE.BoxGeometry(.14, .025, .035), new THREE.MeshStandardMaterial({ color: 0xadb5b4, roughness: .25, metalness: .78 }));
  lever.position.x = .07; handle.add(lever);

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
