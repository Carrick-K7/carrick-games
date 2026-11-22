import * as THREE from 'three';

const SHELL = 'villa-fabric-and-joinery', INSET = .025, LIMIT = 48;
const identity = new THREE.Matrix4(), stock = THREE.Material.prototype.onBeforeCompile;
const lighting = new WeakMap<THREE.Material, typeof stock>();
/** Called by the surveyed-sun installer, not inferred from a shader name/cache key. */
export function allowVillaWallLighting(material: THREE.Material, originalHook: typeof stock) {
  if (originalHook === stock && lighting.has(material)) lighting.set(material, material.onBeforeCompile);
}
function opaque(m: THREE.MeshStandardMaterial) {
  for (const key in m.defines) if (key !== 'STANDARD' || m.defines[key] !== '') return false;
  return m.constructor === THREE.MeshStandardMaterial && m.visible && !m.transparent && m.opacity === 1 && !m.alphaMap &&
    m.alphaTest === 0 && !m.alphaHash && !m.alphaToCoverage && !m.displacementMap && !m.wireframe && !m.clippingPlanes?.length &&
    m.depthTest && m.depthWrite && m.colorWrite && m.depthFunc === THREE.LessEqualDepth && m.blending === THREE.NormalBlending &&
    !m.polygonOffset && !m.stencilWrite && m.side === THREE.FrontSide && m.onBeforeRender === THREE.Material.prototype.onBeforeRender &&
    (m.onBeforeCompile === stock || m.onBeforeCompile === lighting.get(m));
}
function fixed(mesh: THREE.Mesh, g: THREE.BufferGeometry) {
  for (const key in g.morphAttributes) return false;
  return mesh.constructor === THREE.Mesh && mesh.count === 1 && mesh.matrixWorld.equals(identity) && !mesh.morphTargetInfluences &&
    !mesh.animations.length && !mesh.userData.animated && mesh.onBeforeRender === THREE.Object3D.prototype.onBeforeRender &&
    mesh.onAfterRender === THREE.Object3D.prototype.onAfterRender && g.constructor === THREE.BufferGeometry &&
    g.userData.villaRigidBatch === true && !g.userData.animated && !g.indirect && !g.groups.length && g.drawRange.start === 0 && g.drawRange.count === Infinity;
}
type Indices = Uint16Array | Uint32Array;
type Face = { start: number; corners: number; n: number; u: number; v: number; sign: number; box: THREE.Box3; center: THREE.Vector3; w: number; h: number;
  score: number; behind: number; u0: number; u1: number; v0: number; v1: number; du: number; dv: number; j0: number; j1: number };
type Source = { mesh: THREE.Mesh; g: THREE.BufferGeometry; mat: THREE.MeshStandardMaterial; pos: THREE.BufferAttribute; data: Float32Array;
  idx: THREE.BufferAttribute | null; ids?: Indices; pv: number; iv?: number; faces: Face[] };
const turn = (a: number,b: number,c: number) => ((b&1)-(a&1))*((c>>1)-(a>>1))-((c&1)-(a&1))*((b>>1)-(a>>1));

/** Each bit denotes one of the four exact UV corners (not texture coordinates).
 * Sharing an edge, as opposed to a diagonal, does NOT cover a rectangle. */
function rectangles(p: Float32Array, ids: Indices | undefined, limit: number) {
  const faces: Face[] = [], corner = new Int8Array(6), count = ids?.length ?? p.length/3;
  const at = (i: number) => 3*(ids ? ids[i] : i);
  for (let i=0; i+5<count && faces.length<limit; i+=3) {
    const a=at(i), b=at(i+1), c=at(i+2);
    let n=0; while(n<3 && (p[a+n]!==p[b+n] || p[a+n]!==p[c+n])) n++;
    if(n===3) continue;
    const u=(n+1)%3, v=(n+2)%3, plane=p[a+n];
    const x=Math.min(p[a+u],p[b+u],p[c+u]), X=Math.max(p[a+u],p[b+u],p[c+u]);
    const y=Math.min(p[a+v],p[b+v],p[c+v]), Y=Math.max(p[a+v],p[b+v],p[c+v]), w=X-x, h=Y-y;
    if(!(w>=.65 && h>=.65 && w*h>=2) || Math.max(Math.abs(x),Math.abs(X),Math.abs(y),Math.abs(Y),Math.abs(plane))>1024) continue;
    let first=0, second=0, corners=0;
    for(let j=0;j<6;j++) {
      const k=at(i+j), s=p[k+u], t=p[k+v];
      if(p[k+n]!==plane || (s!==x && s!==X) || (t!==y && t!==Y)) { second=0; break; }
      corner[j]=Number(s===X)+2*Number(t===Y); corners|=corner[j]<<(2*j);
      if(j<3) first|=1<<corner[j]; else second|=1<<corner[j];
    }
    const diagonal=first & second, sign=turn(corner[0],corner[1],corner[2]);
    if((first|second)!==15 || (diagonal!==9 && diagonal!==6) || sign!==turn(corner[3],corner[4],corner[5])) continue;
    const box=new THREE.Box3(); box.min.setComponent(n,plane).setComponent(u,x).setComponent(v,y); box.max.setComponent(n,plane).setComponent(u,X).setComponent(v,Y);
    const length=Math.hypot(w,h); // Unit wall-plane normal to the emitted diagonal: 00—11 or 10—01.
    faces.push({start:i,corners,n,u,v,sign,box,center:box.getCenter(new THREE.Vector3()),w,h,du:h/length,dv:(diagonal===9?-w:w)/length,
      score:0,behind:0,u0:0,u1:0,v0:0,v1:0,j0:0,j1:0}); i+=3;
  }
  return faces;
}
// A same-array edit before first upload need not increment BufferAttribute.version.
// Recheck only potential winners' six submitted vertices; no full-stream scan per view.
function stillSubmitted(r: Face, p: Float32Array, ids?: Indices) {
  const {n,u,v,box,start,corners}=r, fixed=box.min.getComponent(n);
  for(let j=0;j<6;j++) {
    const k=3*(ids?ids[start+j]:start+j), mask=corners>>(2*j);
    if(p[k+n]!==fixed || p[k+u]!==((mask&1)?box.max:box.min).getComponent(u) || p[k+v]!==((mask&2)?box.max:box.min).getComponent(v)) return false;
  }
  return true;
}
function uncut(faces: THREE.Plane[], r: Face) {
  for(let i=0;i<4;i++) { // Side planes of a viewport narrowed by one physical pixel on each edge.
    const p=faces[i], radius=(Math.abs(p.normal.getComponent(r.u))*r.w+Math.abs(p.normal.getComponent(r.v))*r.h)/2;
    if(!(p.distanceToPoint(r.center)>radius)) return false;
  }
  return true;
}
/** At the wall the side-plane residual U - slope*t is just metres from that edge.
 * A one-pixel shift at fixed view Z moves along camera right/up. Bound the change in
 * this linear form at the farthest wall Z, including BOTH axes (square pixel footprint). */
function pixelPad(r: Face, du: number, dv: number, slope: number, basis: number[], px: number, py: number) {
  const k=r.sign*slope;
  return INSET+px*Math.abs(du*basis[r.u]+dv*basis[r.v]+k*basis[r.n])+py*Math.abs(du*basis[4+r.u]+dv*basis[4+r.v]+k*basis[4+r.n]);
}
function insetSlope(r: Face, axis: number, edgeFromEye: number, d: number, inward: number, basis: number[], px: number, py: number) {
  const slope=edgeFromEye/d;
  return slope+inward*pixelPad(r,Number(axis===r.u),Number(axis===r.v),slope,basis,px,py)/d;
}

/** Main-camera submission test only. Caller supplies complete world-space target bounds,
 * ordinary depth-tested surfaces, and bypasses shadows, renderer clipping and other passes. */
export class VillaWallVisibility {
  private readonly chain: THREE.Object3D[]=[];
  private readonly sources: Source[]=[];
  private readonly active: Face[]=[];
  private readonly frustum=new THREE.Frustum(); private readonly clip=new THREE.Matrix4();
  private readonly eye=[0,0,0]; private readonly lo=[0,0,0]; private readonly hi=[0,0,0];
  constructor(root: THREE.Object3D) {
    const shell=root.getObjectByName(SHELL); if(!shell || Object.getPrototypeOf(shell)!==THREE.Group.prototype) return;
    for(let a: THREE.Object3D|null=shell; a; a=a.parent) {
      const proto=Object.getPrototypeOf(a); if(proto!==THREE.Group.prototype && proto!==THREE.Scene.prototype && proto!==THREE.Object3D.prototype) return;
      this.chain.push(a);
    }
    let budget=2048;
    for(const mesh of shell.children) {
      if(!(mesh instanceof THREE.Mesh) || mesh.name!==SHELL+'/surface' || !(mesh.material instanceof THREE.MeshStandardMaterial)) continue;
      mesh.updateWorldMatrix(true,false);
      const g=mesh.geometry, mat=mesh.material, pos=g.getAttribute('position'), idx=g.index;
      if(!fixed(mesh,g) || !opaque(mat) || mat.onBeforeCompile!==stock || !(pos instanceof THREE.BufferAttribute) || pos.itemSize!==3 ||
        pos.normalized || pos.gpuType!==THREE.FloatType || pos.usage!==THREE.StaticDrawUsage || pos.onUploadCallback!==THREE.BufferAttribute.prototype.onUploadCallback ||
        !(pos.array instanceof Float32Array) || !(pos.array.buffer instanceof ArrayBuffer)) continue;
      const ids=idx?.array;
      if(idx && (idx.itemSize!==1 || idx.normalized || idx.usage!==THREE.StaticDrawUsage || idx.onUploadCallback!==THREE.BufferAttribute.prototype.onUploadCallback ||
        !(ids instanceof Uint16Array || ids instanceof Uint32Array) || !(ids.buffer instanceof ArrayBuffer))) continue;
      const indices=ids as Indices|undefined;
      // Out-of-range invalidates a draw; a WebGL2 restart would shift triangle boundaries.
      if(indices?.some(id=>id>=Math.min(pos.count,indices.BYTES_PER_ELEMENT===2?0xffff:0xffffffff))) continue;
      const faces=rectangles(pos.array,indices,budget); if(!faces.length) continue;
      this.sources.push({mesh,g,mat,pos,data:pos.array,idx,ids:indices,pv:pos.version,iv:idx?.version,faces}); lighting.set(mat,stock);
      if(!(budget-=faces.length)) break;
    }
  }
  prepare(camera: THREE.PerspectiveCamera, width=0, height=0): boolean {
    const active=this.active; active.length=0;
    if(!(Number.isSafeInteger(width) && Number.isSafeInteger(height) && width>2 && height>2)) return false;
    if(!this.sources.length || camera.constructor!==THREE.PerspectiveCamera || camera.parent || !camera.matrixAutoUpdate || !camera.matrixWorldAutoUpdate ||
      camera.scale.x!==1 || camera.scale.y!==1 || camera.scale.z!==1 || !(Math.abs(camera.quaternion.lengthSq()-1)<1e-10) || camera.reversedDepth || camera.coordinateSystem!==THREE.WebGLCoordinateSystem) return false;
    const {near,far}=camera, p=camera.projectionMatrix.elements;
    if(!(near>0 && far>near && p[0]>0 && p[5]>0) || !p.every(Number.isFinite) ||
      p[1]||p[2]||p[3]||p[4]||p[6]||p[7]||p[8]||p[9]||p[12]||p[13]||p[15]||p[11]!==-1 || p[10]!==-(far+near)/(far-near) || p[14]!==-2*far*near/(far-near)) return false;
    for(let i=0;i<this.chain.length;i++) {
      const a=this.chain[i]; if(a.parent!==(this.chain[i+1]??null) || !a.visible || a.animations.length || a.userData.animated ||
        a.onBeforeRender!==THREE.Object3D.prototype.onBeforeRender || (a instanceof THREE.Scene && a.overrideMaterial)) return false;
    }
    camera.updateWorldMatrix(true,false); camera.position.toArray(this.eye);
    if(!this.eye.every(x=>Math.abs(x)<=1024)) return false;
    const view=camera.matrixWorldInverse.elements, basis=camera.matrixWorld.elements;
    this.clip.copy(camera.projectionMatrix); this.clip.elements[0]/=1-2/width; this.clip.elements[5]/=1-2/height;
    this.frustum.setFromProjectionMatrix(this.clip.multiply(camera.matrixWorldInverse));
    for(const {mesh,g,mat,pos,data,idx,ids,pv,iv,faces} of this.sources) {
      mesh.updateWorldMatrix(true,false);
      if(mesh.parent!==this.chain[0] || !mesh.visible || !mesh.layers.test(camera.layers) || mesh.geometry!==g || mesh.material!==mat ||
        !fixed(mesh,g) || !opaque(mat) || g.getAttribute('position')!==pos || pos.array!==data || pos.version!==pv ||
        pos.itemSize!==3 || pos.count*3!==data.length || pos.normalized || g.index!==idx || idx?.array!==ids || idx?.count!==ids?.length || idx?.version!==iv ||
        (mesh.frustumCulled && g.boundingSphere && !this.frustum.intersectsSphere(g.boundingSphere))) continue;
      for(const r of faces) {
        const {n,u,v,box,center,w,h}=r, d=r.sign*(this.eye[n]-box.min.getComponent(n));
        if(d<=INSET || !uncut(this.frustum.planes,r)) continue;
        const z=-(view[2]*center.x+view[6]*center.y+view[10]*center.z+view[14]);
        const dz=(Math.abs(view[4*u+2])*w+Math.abs(view[4*v+2])*h)/2;
        if(!(z-dz>near+INSET && z+dz<far-INSET)) continue; // Test the full face before insetting.
        const score=w*h*d/(z*z*z); let j=active.length;
        if(j===LIMIT) { if(score<=active[j-1].score) continue; j--; }
        if(!stillSubmitted(r,data,ids)) continue;
        const px=2*(z+dz)/(p[0]*width), py=2*(z+dz)/(p[5]*height);
        // 1/Zwall is linear in screen coordinates. Reserve its full pixel slope plus two 16-bit depth steps.
        const gap=(px*Math.abs(basis[n])+py*Math.abs(basis[4+n]))/d+2*(z+dz)*(far-near)/(65535*near*far); if(gap>=1) continue;
        r.behind=Math.max(d+INSET,d/(1-gap)); r.score=score;
        const joint=(r.du*(center.getComponent(u)-this.eye[u])+r.dv*(center.getComponent(v)-this.eye[v]))/d;
        const jointPad=pixelPad(r,r.du,r.dv,joint,basis,px,py)/d; r.j0=joint-jointPad; r.j1=joint+jointPad;
        r.u0=insetSlope(r,u,box.min.getComponent(u)-this.eye[u],d,1,basis,px,py); r.u1=insetSlope(r,u,box.max.getComponent(u)-this.eye[u],d,-1,basis,px,py);
        r.v0=insetSlope(r,v,box.min.getComponent(v)-this.eye[v],d,1,basis,px,py); r.v1=insetSlope(r,v,box.max.getComponent(v)-this.eye[v],d,-1,basis,px,py);
        if(!(r.u1>r.u0 && r.v1>r.v0)) continue;
        while(j && active[j-1].score<score) { active[j]=active[j-1]; j--; } active[j]=r;
      }
    }
    return active.length!==0;
  }
  hidden(worldBox: THREE.Box3): boolean {
    const lo=this.lo, hi=this.hi; worldBox.min.toArray(lo); worldBox.max.toArray(hi);
    for(let i=0;i<3;i++) { if(!(lo[i]<=hi[i] && lo[i]>=-2048 && hi[i]<=2048)) return false; lo[i]-=this.eye[i]; hi[i]-=this.eye[i]; }
    for(const r of this.active) {
      const {n,u,v,u0,u1,v0,v1}=r, a=r.sign>0?-hi[n]:lo[n], b=r.sign>0?-lo[n]:hi[n];
      // For every target point: u0*t < U < u1*t (and similarly V), where t is
      // normal distance from the eye. These are exact extrema of four linear forms
      // over the complete box. Never combine coverage from different faces.
      if(a>r.behind && lo[u]>u0*(u0>0?b:a) && hi[u]<u1*(u1>0?a:b) && lo[v]>v0*(v0>0?b:a) && hi[v]<v1*(v1>0?a:b)) {
        const {du,dv,j0,j1}=r; // The complete box must lie in ONE real triangle, clear of the common diagonal.
        if(du*lo[u]+dv*(dv>0?lo[v]:hi[v])>j1*(j1>0?b:a) || du*hi[u]+dv*(dv>0?hi[v]:lo[v])<j0*(j0>0?a:b)) return true;
      }
    }
    return false;
  }
}
