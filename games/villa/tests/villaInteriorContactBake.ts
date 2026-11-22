/** Independent static-geometry contact survey, offline only. Run `vite-node games/villa/tests/villaInteriorContactBake.ts --check-room-contact`.
 * --write-room-contact explicitly regenerates the compact field. The analytical projection reads the same
 * metre-scale, fixed opaque triangles used by the renderer; no texture or lighting is sampled. */
import * as THREE from 'three';
import { readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { furnishVilla } from '../src/villaFurnishings.js';
import { createVillaGaming } from '../src/villaGaming.js';
import { packHeightfield } from './bake-exterior-sun.mjs';
import { VILLA_INDOOR_CONTACT_GRID as grid } from '../src/villaInteriorContactGrid.js';
const rootName='Villa furnishings · oak, linen & terracotta';
const fixedOwners:ReadonlySet<string>=new Set([rootName,'Kitchen/fridge-freezer','villa-tea-bar','villa-snooker-table','villa-suite-fittings','Bedroom/openable-wardrobe','Villa master bedroom','villaGaming','aquarium / planted glasswork']);
export function isFixedRoomPart(m:THREE.Mesh){return !(m instanceof THREE.InstancedMesh)&&!Array.isArray(m.material)&&!m.material.transparent&&!m.material.alphaTest&&m.castShadow&&m.geometry.userData.villaRigidBatch===true&&!!m.parent&&fixedOwners.has(m.parent.name)&&(m.parent.name!==rootName||m.name==='Batched villa details');}
// The emitters need a canvas to *describe* other materials, but no canvas colour is used for this measurement.
function analyticScene(){
  const old=globalThis.document;const context=new Proxy({} as CanvasRenderingContext2D,{get:(_t,key)=>key==='measureText'?()=>({width:1}):()=>({addColorStop(){}}),set:()=>true});
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({getContext:()=>context})}});
  try{const scene=new THREE.Scene();furnishVilla(scene);createVillaGaming(scene);scene.updateMatrixWorld(true);return scene;}
  finally{if(old)Object.defineProperty(globalThis,'document',{configurable:true,value:old});else Reflect.deleteProperty(globalThis,'document');}
}
export function getTriangles(scene:THREE.Scene){
  const buffers:number[][]=[[],[]],v=new THREE.Vector3(),temp=new Float32Array(9);
  scene.traverse(o=>{if(!(o instanceof THREE.Mesh)||!isFixedRoomPart(o))return;
    const p=o.geometry.getAttribute('position'),idx=o.geometry.index,lo=o.geometry.drawRange.start,hi=Math.min(idx?.count??p.count,lo+o.geometry.drawRange.count);
    for(let i=lo;i+2<hi;i+=3){for(let j=0;j<3;j++){v.fromBufferAttribute(p,idx?idx.getX(i+j):i+j).applyMatrix4(o.matrixWorld);temp.set([v.x,v.y,v.z],3*j);}
      if(Math.min(temp[0]!,temp[3]!,temp[6]!)>51||Math.max(temp[0]!,temp[3]!,temp[6]!)< -24.2||Math.min(temp[2]!,temp[5]!,temp[8]!)>9.02||Math.max(temp[2]!,temp[5]!,temp[8]!)< -18.21)continue;
      const minY=Math.min(temp[1]!,temp[4]!,temp[7]!),maxY=Math.max(temp[1]!,temp[4]!,temp[7]!);
      for(let floor=0;floor<2;floor++){const y=floor*3.6;if(maxY<y+grid.low||minY>y+grid.high)continue;
        for(let j=0;j<3;j++)buffers[floor]!.push(temp[j*3]!,temp[j*3+1]!-y,temp[j*3+2]!);}
    }
  });return buffers.map(a=>new Float32Array(a));
}
/** First surface seen looking up the oblique ray. Near-plane clipping is done at
 * the actual triangle intersection, not per triangle origin. Flat floor rugs, old
 * contact decals and bench feet below the probe never turn the entire rug black. */
export function nearestSurvey(tris:Float32Array,dx:number,dz:number){
  const {w,h,p,x0,z0}=grid,map=new Float32Array(w*h).fill(9),s=1/p;
  for(let i=0;i<tris.length;i+=9){
    const ay=tris[i+1]!,by=tris[i+4]!,cy=tris[i+7]!;
    const ax=(tris[i]!-dx*ay-x0)*s-.5,az=(tris[i+2]!-dz*ay-z0)*s-.5;
    const bx=(tris[i+3]!-dx*by-x0)*s-.5,bz=(tris[i+5]!-dz*by-z0)*s-.5;
    const cx=(tris[i+6]!-dx*cy-x0)*s-.5,cz=(tris[i+8]!-dz*cy-z0)*s-.5;
    const x1=Math.max(0,Math.ceil(Math.min(ax,bx,cx))),x2=Math.min(w-1,Math.floor(Math.max(ax,bx,cx)));
    const z1=Math.max(0,Math.ceil(Math.min(az,bz,cz))),z2=Math.min(h-1,Math.floor(Math.max(az,bz,cz)));
    if(x2<x1||z2<z1)continue;const ixx=bx-ax,ixz=bz-az,jxx=cx-ax,jxz=cz-az,det=ixx*jxz-ixz*jxx;if(Math.abs(det)<.000001)continue;
    const inv=1/det;for(let z=z1;z<=z2;z++)for(let x=x1;x<=x2;x++){
      const u=((x-ax)*jxz-(z-az)*jxx)*inv,v=((z-az)*ixx-(x-ax)*ixz)*inv;
      if(u<-.00002||v<-.00002||u+v>1.00002)continue;const y=ay+u*(by-ay)+v*(cy-ay),id=z*w+x;
      if(y>=grid.low&&y<=grid.high&&y<map[id]!)map[id]=y;
    }
  }return map;
}
export function develop(tris:Float32Array){
  const count=grid.w*grid.h,field=new Uint8Array(count*2).fill(255),occlusion=new Float32Array(count),direct=nearestSurvey(tris,-24/26,24/26);
  // Two stratified elevation cones and the zenith. Near blockers generate sharp,
  // dark contacts. A tabletop a metre above the floor blocks only part of the sky.
  const rays:[[number,number],...Array<[number,number]>]=[[0,0]];
  for(const [s,n,rotation] of [[.51,8,0],[1.27,8,.37]])for(let i=0;i<n!;i++){const a=i*2*Math.PI/n!+rotation!;rays.push([s!*Math.cos(a),s!*Math.sin(a)]);}
  for(const [dx,dz] of rays){const d=nearestSurvey(tris,dx,dz),slant=Math.hypot(dx,1,dz);for(let i=0;i<count;i++)if(d[i]!<grid.high)occlusion[i]!+=Math.exp(-d[i]!*slant*1.06);}
  for(let i=0;i<count;i++){
    const mean=occlusion[i]!/rays.length;field[2*i]=Math.round(255*(1-.83*mean));
    field[2*i+1]=direct[i]!<grid.high?Math.round(255*Math.min(1,.12+.05*direct[i]!)):255;
  }return field;
}
async function main(){
  const write=process.argv.includes('--write-room-contact');if(write&&process.argv.includes('--check-room-contact'))throw Error('Select just one contact-bake mode');
  const all=getTriangles(analyticScene()),hash=(b:ArrayBufferView)=>createHash('sha256').update(new Uint8Array(b.buffer,b.byteOffset,b.byteLength)).digest('hex');
  if(all.some(t=>t.length<90_000))throw Error('Unpopulated contact study');
  const result=Buffer.concat(all.map(t=>Buffer.from(develop(t)))),plane=grid.w*grid.h*2;
  // Store channels as independent scanline planes so vacant floor areas compress together.
  const planar=Buffer.alloc(result.length);for(let f=0;f<2;f++)for(let j=0;j<2;j++)for(let i=0;i<plane/2;i++)planar[f*plane+j*plane/2+i]=result[f*plane+2*i+j]!;
  const packed=packHeightfield(planar),shape=all.map(t=>[t.length/9,hash(t)]),url=new URL('../src/villaInteriorContactData.ts',import.meta.url);
  const text=`// Fixed floor furniture only. Regenerate with tests/villaInteriorContactBake.ts --write-room-contact.\n// Triangle counts and position fingerprints: ${JSON.stringify(shape)}. Raw field: ${hash(planar)}.\nexport const VILLA_CONTACT_BYTES:string='${packed.toString('base64')}';\n`;
  if(write)await writeFile(url,text);else if(await readFile(url,'utf8')!==text)throw Error('Fixed furniture contact data out of date. No source was changed.');
  console.log(JSON.stringify({shape,packed:packed.length,bytes:planar.length,sha256:hash(planar)}));
}
if(process.argv.includes('--write-room-contact') || process.argv.includes('--check-room-contact'))await main();
