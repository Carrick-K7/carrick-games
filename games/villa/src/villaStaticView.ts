import * as THREE from 'three';
import { VillaVisibleRanges } from './villaVisibleRanges.js';

/** Secondary box test for rigid material batches. A bounding sphere around a long, shallow
 * house spans well beyond its walls; on the bridge the sphere can intersect the visitor's
 * frustum while the entire batch is behind the camera. This only changes submission, never
 * detail level, simulation, or which rooms are permitted to show through a window. */
export class VillaStaticView {
  private readonly candidates: Array<{mesh:THREE.Mesh; source:THREE.BufferGeometry; ranges:VillaVisibleRanges|null}> = [];
  private readonly hidden: THREE.Mesh[] = [];
  private readonly replaced: Array<{mesh:THREE.Mesh; source:THREE.BufferGeometry}> = [];
  private readonly cameraMatrix = new THREE.Matrix4();
  private readonly localClip = new THREE.Matrix4();
  private readonly frustum = new THREE.Frustum();
  constructor(root: THREE.Object3D) {
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh) || !object.frustumCulled || object instanceof THREE.InstancedMesh || object instanceof THREE.SkinnedMesh || object.morphTargetInfluences) return;
      const mats = Array.isArray(object.material) ? object.material : [object.material];
      // A custom shader or displacement map may move vertices beyond authored CPU bounds.
      if (mats.some(m => m instanceof THREE.ShaderMaterial || m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile || m.displacementMap)) return;
      const g = object.geometry;
      if (!g.userData.villaRigidBatch || (g.index?.count ?? g.getAttribute('position').count) < 900) return;
      g.computeBoundingBox(); this.candidates.push({mesh:object,source:g,ranges:VillaVisibleRanges.forMesh(object)});
    });
  }
  /** Always restore flags, including on a failed security read/render. For updated sun maps
   * off-camera casters must still participate: shadow cameras have a different frustum. */
  draw(renderer: THREE.WebGLRenderer, root: THREE.Scene, camera: THREE.PerspectiveCamera) {
    const shadows = renderer.shadowMap;
    if (shadows.enabled && (shadows.autoUpdate || shadows.needsUpdate)) { renderer.render(root,camera); return; }
    camera.updateWorldMatrix(true,false); this.cameraMatrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    try {
      for (const item of this.candidates) {
        const {mesh,source,ranges}=item;
        if (!mesh.visible) continue;
        mesh.updateWorldMatrix(true,false);
        this.localClip.multiplyMatrices(this.cameraMatrix,mesh.matrixWorld);
        this.frustum.setFromProjectionMatrix(this.localClip,camera.coordinateSystem);
        const geometry=this.frustum.intersectsBox(source.boundingBox!) ? (ranges ? ranges.select(this.frustum) : source) : null;
        if (!geometry) { this.hidden.push(mesh); mesh.visible=false; }
        else if(geometry!==source) {this.replaced.push(item);mesh.geometry=geometry;}
      }
      renderer.render(root,camera);
    } finally {
      for (const item of this.replaced) item.mesh.geometry=item.source;
      for (const mesh of this.hidden) mesh.visible=true;
      this.replaced.length=this.hidden.length=0;
    }
  }
  dispose() { for(const item of this.candidates) item.ranges?.dispose(); this.candidates.length=0; }
}
