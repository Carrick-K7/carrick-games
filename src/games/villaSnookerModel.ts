import * as THREE from 'three';
import { VILLA_SNOOKER } from './villaActivities.js';
import { createVillaSnooker, VILLA_SNOOKER_BALL_RADIUS, type VillaSnookerState } from './villaSnooker.js';

/** Dynamic additions only: the furnished slate, cloth, pockets and cue rack stay intact.
 * Parent scene owns disposal, as with other scene-attached villa model resources.
 */
export function createVillaSnookerModel(parent: THREE.Object3D): { update(state: VillaSnookerState, active: boolean): boolean } {
  const root = new THREE.Group();
  root.name = 'villa-playable-snooker';
  root.position.set(VILLA_SNOOKER.center.x, VILLA_SNOOKER.center.y, VILLA_SNOOKER.center.z);
  parent.add(root);
  const radius = VILLA_SNOOKER_BALL_RADIUS;
  const height = VILLA_SNOOKER.height + radius;
  const colors = { white: '#fff9e6', red: '#b51f24', yellow: '#e9bd26', green: '#208844', brown: '#714028', blue: '#255bbb', pink: '#e99aa9', black: '#101113' };
  const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(radius, 20, 14), new THREE.MeshStandardMaterial({ roughness: 0.17, metalness: 0.02 }), 22);
  balls.name = 'snooker-dynamic-balls';
  balls.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // Instance transforms change after construction; avoid stale aggregate bounds.
  balls.frustumCulled = false;
  balls.castShadow = true;
  root.add(balls);
  const transform = new THREE.Object3D();
  const color = new THREE.Color();
  const guidePositions = new Float32Array(6);
  const guideGeometry = new THREE.BufferGeometry();
  guideGeometry.setAttribute('position', new THREE.BufferAttribute(guidePositions, 3));
  const guide = new THREE.Line(guideGeometry, new THREE.LineDashedMaterial({ color: '#f4efcb', dashSize: 0.042, gapSize: 0.027, transparent: true, opacity: 0.65, depthWrite: false }));
  guide.name = 'snooker-world-aim-guide';
  guide.frustumCulled = false;
  root.add(guide);
  const cue = new THREE.Group();
  cue.name = 'snooker-active-cue';
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0048, 0.012, 1.15, 10), new THREE.MeshStandardMaterial({ color: '#c6a875', roughness: 0.55 }));
  cue.add(shaft);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.012, 10), new THREE.MeshStandardMaterial({ color: '#568c94', roughness: 0.8 }));
  tip.position.y = 0.581;
  cue.add(tip);
  root.add(cue);
  const axis = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3();
  let previous = '';
  const update = (state: VillaSnookerState, active: boolean): boolean => {
    const key = `${active}/${state.moving}/${state.phase}/${state.aim}/${state.power}/${state.balls.map(b => `${b.id},${b.x},${b.z},${b.potted}`).join(';')}`;
    if (key === previous) return false;
    previous = key;
    balls.count = Math.min(22, state.balls.length);
    state.balls.slice(0, 22).forEach((b, i) => {
      transform.position.set(b.x, height, b.z);
      transform.scale.setScalar(b.potted ? 0 : 1);
      transform.updateMatrix();
      balls.setMatrixAt(i, transform.matrix);
      balls.setColorAt(i, color.set(colors[b.kind]));
    });
    balls.instanceMatrix.needsUpdate = true;
    if (balls.instanceColor) balls.instanceColor.needsUpdate = true;
    const white = state.balls.find(b => b.kind === 'white');
    guide.visible = cue.visible = active && !state.moving && state.phase !== 'complete' && !!white && !white.potted && Number.isFinite(state.aim);
    if (guide.visible && white) {
      const dx = Math.sin(state.aim), dz = -Math.cos(state.aim);
      let distance = 2.8;
      const halfX = VILLA_SNOOKER.playingWidth / 2 - radius, halfZ = VILLA_SNOOKER.playingLength / 2 - radius;
      if (Math.abs(dx) > 1e-8) distance = Math.min(distance, (Math.sign(dx) * halfX - white.x) / dx);
      if (Math.abs(dz) > 1e-8) distance = Math.min(distance, (Math.sign(dz) * halfZ - white.z) / dz);
      for (const b of state.balls) {
        if (b === white || b.potted) continue;
        const x = b.x - white.x, z = b.z - white.z;
        const along = x * dx + z * dz, across = x * dz - z * dx;
        const discriminant = 4 * radius * radius - across * across;
        if (along > 0 && discriminant >= 0) distance = Math.min(distance, Math.max(0, along - Math.sqrt(discriminant)));
      }
      distance = Math.max(radius, distance);
      guidePositions.set([white.x + dx * radius, height, white.z + dz * radius, white.x + dx * distance, height, white.z + dz * distance]);
      guideGeometry.attributes.position.needsUpdate = true;
      guide.computeLineDistances();
      const power = Number.isFinite(state.power) ? Math.max(0, Math.min(1, state.power)) : 0;
      const pullback = 0.64 + power * 0.18;
      cue.position.set(white.x - dx * pullback, height + 0.025, white.z - dz * pullback);
      direction.set(dx, -0.035, dz).normalize();
      cue.quaternion.setFromUnitVectors(axis, direction);
    }
    return true;
  };
  update(createVillaSnooker(), false);
  return { update };
}
