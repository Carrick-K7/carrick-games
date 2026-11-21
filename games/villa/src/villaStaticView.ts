import * as THREE from 'three';

/** Secondary box test for rigid material batches. A bounding sphere around a long, shallow
 * house spans well beyond its walls; on the bridge the sphere can intersect the visitor's
 * frustum while the entire batch is behind the camera. This only changes submission, never
 * detail level, simulation, or which rooms are permitted to show through a window. */
export class VillaStaticView {
  private readonly candidates: THREE.Mesh[] = [];
  private readonly hidden: THREE.Mesh[] = [];
  private readonly cameraMatrix = new THREE.Matrix4();
  private readonly localClip = new THREE.Matrix4();
  private readonly frustum = new THREE.Frustum();
  constructor(root: THREE.Object3D) {
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh) || !object.frustumCulled || object instanceof THREE.InstancedMesh || object instanceof THREE.SkinnedMesh || object.morphTargetInfluences) return;
      const g = object.geometry;
      if (!g.userData.villaRigidBatch || (g.index?.count ?? g.getAttribute('position').count) < 900) return;
      g.computeBoundingBox(); this.candidates.push(object);
    });
  }
  /** Always restore flags, including on a failed security read/render. For updated sun maps
   * off-camera casters must still participate: shadow cameras have a different frustum. */
  draw(renderer: THREE.WebGLRenderer, root: THREE.Scene, camera: THREE.PerspectiveCamera) {
    const shadows = renderer.shadowMap;
    if (shadows.enabled && (shadows.autoUpdate || shadows.needsUpdate)) { renderer.render(root,camera); return; }
    camera.updateWorldMatrix(true,false); this.cameraMatrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    try {
      for (const mesh of this.candidates) {
        if (!mesh.visible) continue;
        mesh.updateWorldMatrix(true,false);
        this.localClip.multiplyMatrices(this.cameraMatrix,mesh.matrixWorld);
        this.frustum.setFromProjectionMatrix(this.localClip,camera.coordinateSystem);
        if (!this.frustum.intersectsBox(mesh.geometry.boundingBox!)) { this.hidden.push(mesh); mesh.visible=false; }
      }
      renderer.render(root,camera);
    } finally {
      for (const mesh of this.hidden) mesh.visible=true;
      this.hidden.length=0;
    }
  }
}
