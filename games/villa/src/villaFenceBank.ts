import * as THREE from 'three';
import {VILLA_ESTATE_BOUNDS as B, villaTerrainGroundHeight} from './villaEstateLayout.js';
import {VILLA_STREAM_CUTOUTS} from './villaStream.js';
import {subtractVillaPolygon} from './villaTerrainModel.js';

type XZ={x:number;z:number};
const rings=[0,.16,.26,.46,.94,1.52,2.22] as const;
/** The gameplay boundary stops inside the fence. Its visual turf continues beneath the
 * posts, then rolls down to meet the lower outlying meadow. Keep the stream/bank cuts
 * open all the way out; this is only land, never extra walkable/driveable area. */
export function createVillaFenceBankGeometry(){
  const pos:number[]=[],uv:number[]=[],idx:number[]=[];
  const dist=(x:number,z:number)=>Math.max(B.minX-x,x-B.maxX,B.minZ-z,z-B.maxZ,0);
  const height=(x:number,z:number)=>{const d=dist(x,z),land=villaTerrainGroundHeight(x,z),toe=Math.max(0,Math.min(1,(d-.46)/1.76));return (land-.022*(1-Math.min(1,d/.25)))*(1-toe*toe*(3-2*toe))-1.145*toe*toe*(3-2*toe);};
  const lw=B.maxX-B.minX,ld=B.maxZ-B.minZ;
  const point=(side:number,u:number,d:number):XZ=>{
    if(side===0)return {x:B.minX-d+u*(lw+2*d),z:B.minZ-d};
    if(side===1)return {x:B.maxX+d,z:B.minZ-d+u*(ld+2*d)};
    if(side===2)return {x:B.maxX+d-u*(lw+2*d),z:B.maxZ+d};
    return {x:B.minX-d,z:B.maxZ+d-u*(ld+2*d)};
  };
  for(let side=0;side<4;side++){
    const count=side%2?ld:lw;
    for(let j=0;j<count;j++)for(let k=1;k<rings.length;k++){
      const poly=[point(side,j/count,rings[k-1]!),point(side,(j+1)/count,rings[k-1]!),point(side,(j+1)/count,rings[k]!),point(side,j/count,rings[k]!)];
      const minX=Math.min(...poly.map(p=>p.x)),minZ=Math.min(...poly.map(p=>p.z)),maxX=Math.max(...poly.map(p=>p.x)),maxZ=Math.max(...poly.map(p=>p.z));
      let pieces=[poly];for(const {bounds:r,polygon}of VILLA_STREAM_CUTOUTS){if(maxX<=r.minX||minX>=r.maxX||maxZ<=r.minZ||minZ>=r.maxZ)continue;pieces=pieces.flatMap(p=>subtractVillaPolygon(p,polygon));}
      for(const piece of pieces){const start=pos.length/3;for(const p of piece){pos.push(p.x,height(p.x,p.z),p.z);uv.push(p.x/2.5,p.z/2.5);}
        for(let i=1;i<piece.length-1;i++){const a=piece[0]!,b=piece[i]!,c=piece[i+1]!,det=(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);if(Math.abs(det)>1e-9)idx.push(start,start+(det<0?i:i+1),start+(det<0?i+1:i));}}
    }
  }const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();g.userData.villaRigidBatch=true;return g;
}
