import * as THREE from 'three';

type IndexData = Uint16Array | Uint32Array;
interface Chunk { start: number; end: number; box: THREE.Box3 }

/** Render-only triangle ranges for a large, world-spanning rigid material batch. The
 * original mesh, order of triangles, UV seams, collision queries and material remain intact.
 * Authored nearby parts tend to be consecutive. Keeping that order avoids depth-tie changes
 * and allows whole runs to be copied, rather than sorting or visiting every triangle per RAF. */
export class VillaVisibleRanges {
  private readonly chunks: Chunk[] = [];
  private readonly previous: Uint8Array;
  private readonly current: Uint8Array;
  private readonly full: IndexData;
  private readonly visible: IndexData;
  readonly proxy: THREE.BufferGeometry;
  private readonly attribute: THREE.BufferAttribute;
  private lastCount = -1;
  static forMesh(mesh: THREE.Mesh, roomScale=false): VillaVisibleRanges | null {
    const g=mesh.geometry, p=g.getAttribute('position');
    if (!g.userData.villaRigidBatch || !p || (g.index?.count??p.count)<(roomScale?6144:24_576) || Array.isArray(mesh.material) || mesh.material.transparent || !mesh.material.depthWrite ||
      mesh instanceof THREE.InstancedMesh || mesh instanceof THREE.SkinnedMesh || mesh.morphTargetInfluences || Object.keys(g.morphAttributes).length ||
      g.drawRange.start!==0 || g.drawRange.count!==Infinity || g.groups.length) return null;
    g.computeBoundingBox(); const box=g.boundingBox!;
    const span=Math.max(box.max.x-box.min.x,box.max.z-box.min.z);
    if (span<(roomScale?2:12)) return null;
    return new VillaVisibleRanges(g,p,span>=12 && (g.index?.count??p.count)>=24_576);
  }
  private constructor(private readonly source:THREE.BufferGeometry,p:THREE.BufferAttribute|THREE.InterleavedBufferAttribute,private readonly estateSpan:boolean) {
    const chunkTriangles=estateSpan?192:96;
    const n=source.index?.count??p.count, Idx=p.count<=65535?Uint16Array:Uint32Array;
    if (source.index?.array instanceof Uint32Array || source.index?.array instanceof Uint16Array) this.full=source.index.array;
    else {this.full=new Idx(n);for(let i=0;i<n;i++)this.full[i]=source.index?source.index.getX(i):i;}
    this.visible=new Idx(n);
    this.proxy=new THREE.BufferGeometry(); this.proxy.name='villa/visible-triangle-ranges';
    for(const [key,attribute] of Object.entries(source.attributes))this.proxy.setAttribute(key,attribute);
    this.attribute=new THREE.BufferAttribute(this.visible,1).setUsage(THREE.DynamicDrawUsage);this.proxy.setIndex(this.attribute);
    this.proxy.boundingBox=source.boundingBox;source.computeBoundingSphere();this.proxy.boundingSphere=source.boundingSphere;
    // Divide contiguous runs on geometric discontinuities. Upper and lower limits keep both
    // loose boxes (scattered items sharing a finish) and the per-camera tests bounded.
    let box=new THREE.Box3(),start=0;
    const tri=new THREE.Box3(),pt=new THREE.Vector3();
    for(let i=0;i<n;i+=3){
      tri.makeEmpty();for(let j=0;j<3;j++)tri.expandByPoint(pt.fromBufferAttribute(p,this.full[i+j]!));
      const size=i-start;
      if(size>=3*chunkTriangles || (size>=3*32 && (tri.min.x>box.max.x+2 || tri.min.z>box.max.z+2 || tri.min.y>box.max.y+1.1 ||
        tri.max.x<box.min.x-2 || tri.max.z<box.min.z-2 || tri.max.y<box.min.y-1.1))){
        this.chunks.push({start,end:i,box:box.expandByScalar(.06)});box=new THREE.Box3();start=i;
      }
      box.union(tri);
    }
    if(start<n)this.chunks.push({start,end:n,box:box.expandByScalar(.06)});
    this.previous=new Uint8Array(this.chunks.length);this.previous.fill(2);this.current=new Uint8Array(this.chunks.length);
  }
  /** null = no visible range; the actual immutable source is returned when nothing worthwhile
   * can be omitted. Only the index buffer changes, and only after the visible set changes. */
  select(frustum:THREE.Frustum, hidden?: (localBounds:THREE.Box3)=>boolean):THREE.BufferGeometry|null {
    // Room-sized continuous pieces keep their crossing faces as a whole for wall
    // depth; partition them only against the actual camera frustum.
    if(!this.estateSpan) hidden=undefined;
    let count=0,changed=false;
    for(let k=0;k<this.chunks.length;k++){
      const q=this.chunks[k]!,v=frustum.intersectsBox(q.box) && !hidden?.(q.box)?1:0;this.current[k]=v;if(v)count+=q.end-q.start;
      if(v!==this.previous[k])changed=true;
    }
    if(!count)return null;
    if(count>this.full.length*.90)return this.source;
    if(changed || count!==this.lastCount){
      let out=0,first=-1;for(let i=0;i<=this.chunks.length;i++){
        if(i<this.chunks.length && this.current[i]){if(first<0)first=this.chunks[i]!.start;}
        else if(first>=0){const end=this.chunks[i-1]!.end;this.visible.set(this.full.subarray(first,end),out);out+=end-first;first=-1;}
      }
      this.previous.set(this.current);this.lastCount=count;
      this.attribute.clearUpdateRanges();this.attribute.addUpdateRange(0,count);this.attribute.needsUpdate=true;this.proxy.setDrawRange(0,count);
    }
    return this.proxy;
  }
  dispose(){this.proxy.dispose();}
}
