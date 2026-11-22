import * as THREE from 'three';
import { VillaVisibleRanges } from './villaVisibleRanges.js';
import { VillaWallVisibility } from './villaWallVisibility.js';

type Slot = {mesh:THREE.Mesh; source:THREE.BufferGeometry; ranges:VillaVisibleRanges|null;
  material:THREE.Material|null; hook:THREE.Material['onBeforeCompile']|null; positions:THREE.BufferAttribute|null; version:number};

/** Secondary box test for rigid material batches. A bounding sphere around a long, shallow
 * house spans well beyond its walls; on the bridge the sphere can intersect the visitor's
 * frustum while the entire batch is behind the camera. This only changes submission, never
 * detail level, simulation, or which rooms are permitted to show through a window. */
export class VillaStaticView {
  private readonly candidates: Slot[] = [];
  private readonly viewport = new THREE.Vector4();
  private readonly hidden: THREE.Mesh[] = [];
  private readonly replaced: Array<{mesh:THREE.Mesh; source:THREE.BufferGeometry}> = [];
  private readonly cameraMatrix = new THREE.Matrix4();
  private readonly localClip = new THREE.Matrix4();
  private readonly frustum = new THREE.Frustum();
  private readonly walls: VillaWallVisibility | null;
  private readonly identity = new THREE.Matrix4();
  private readonly worldBounds = new THREE.Box3();
  private targetMatrix: THREE.Matrix4 | null = null;
  private readonly wallHides = (local: THREE.Box3) => this.walls!.hidden(this.targetMatrix ? this.worldBounds.copy(local).applyMatrix4(this.targetMatrix) : local);
  constructor(root: THREE.Object3D, softwareWallCulling = false) {
    this.walls = softwareWallCulling ? new VillaWallVisibility(root) : null;
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh) || !object.frustumCulled || object instanceof THREE.InstancedMesh || object instanceof THREE.SkinnedMesh || object.morphTargetInfluences) return;
      const mats = Array.isArray(object.material) ? object.material : [object.material];
      // A custom shader or displacement map may move vertices beyond authored CPU bounds.
      if (mats.some(m => m instanceof THREE.ShaderMaterial || m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile || m.displacementMap)) return;
      const g = object.geometry;
      if (!g.userData.villaRigidBatch || (g.index?.count ?? g.getAttribute('position').count) < 900) return;
      const material = !Array.isArray(object.material) ? object.material : null, p=g.getAttribute('position');
      const positions=p instanceof THREE.BufferAttribute && p.usage===THREE.StaticDrawUsage ? p : null;
      g.computeBoundingBox(); this.candidates.push({mesh:object,source:g,ranges:VillaVisibleRanges.forMesh(object,softwareWallCulling),
        material,hook:material?.onBeforeCompile ?? null,positions,version:positions?.version ?? -1});
    });
  }
  /** Called once, just after the Estate's position-preserving light, finish and fitted
   * mirror hooks were installed. Never infer future shader safety from a name or cache key. */
  sealEstateFinishes() {
    for (const item of this.candidates) if (item.material && item.mesh.material === item.material) item.hook = item.material.onBeforeCompile;
  }
  /** Always restore flags, including on a failed security read/render. For updated sun maps
   * off-camera casters must still participate: shadow cameras have a different frustum. */
  draw(renderer: THREE.WebGLRenderer, root: THREE.Scene, camera: THREE.PerspectiveCamera) {
    const shadows = renderer.shadowMap;
    if (shadows.enabled && (shadows.autoUpdate || shadows.needsUpdate)) { renderer.render(root,camera); return; }
    camera.updateWorldMatrix(true,false); this.cameraMatrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    // Occlusion depends on ordinary opaque depth; shadow cameras, diagnostic overrides
    // and client clipping can see/remove a wall which the visitor's eye cannot.
    const useWalls = this.walls && !shadows.enabled && !root.overrideMaterial && renderer.getRenderTarget?.()?.depthBuffer !== false && !renderer.localClippingEnabled &&
      !renderer.clippingPlanes?.length && !renderer.xr?.isPresenting && renderer.getCurrentViewport &&
      this.walls.prepare(camera,renderer.getCurrentViewport(this.viewport).z,this.viewport.w);
    try {
      for (const item of this.candidates) {
        const {mesh,source,ranges}=item;
        if (!mesh.visible || mesh.geometry !== source) continue;
        mesh.updateWorldMatrix(true,false);
        this.localClip.multiplyMatrices(this.cameraMatrix,mesh.matrixWorld);
        this.frustum.setFromProjectionMatrix(this.localClip,camera.coordinateSystem);
        const material = mesh.material;
        const test = useWalls && mesh.children.length === 0 && material === item.material && !Array.isArray(material) &&
          material.onBeforeCompile === item.hook && !('displacementMap' in material && material.displacementMap) && !mesh.morphTargetInfluences &&
          mesh.onBeforeRender===THREE.Object3D.prototype.onBeforeRender && material.onBeforeRender===THREE.Material.prototype.onBeforeRender &&
          item.positions?.version===item.version && source.getAttribute('position')===item.positions && material.depthTest && !material.polygonOffset && !material.stencilWrite &&
          (material.depthFunc === THREE.LessEqualDepth || material.depthFunc === THREE.LessDepth) ? this.wallHides : undefined;
        this.targetMatrix = test && !mesh.matrixWorld.equals(this.identity) ? mesh.matrixWorld : null;
        const box = source.boundingBox!;
        const geometry=this.frustum.intersectsBox(box) && !test?.(box) ? (ranges ? ranges.select(this.frustum,test) : source) : null;
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
