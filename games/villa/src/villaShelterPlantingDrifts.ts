import * as THREE from 'three';
import { villaTerrainGroundHeight } from './villaEstateLayout.js';
import { SHELTER_MESHES } from './villaShelterPlantingMeshes.js';

export const shelterTurn=Math.PI*2;
export function shelterRandom(seed:number){let s=seed>>>0;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/4294967296;};}
type Pair=readonly[number,number];
interface Drift {name:string; curves:[Pair,Pair,Pair]; shrubs:number; ferns:number; spread:number; seed:number}
// Two converging crescents at the base of the tree, broken by a patch of open grass.
// The separate bank is set back west of the large fields, not planted around their perimeter.
const DRIFTS:readonly Drift[]=[
  {name:'west-heel',curves:[[-35.6,16.2],[-32.1,15.4],[-30.0,18.0]],shrubs:3,ferns:5,spread:.85,seed:1681},
  {name:'under-the-stool',curves:[[-31.4,18.6],[-28.4,20.2],[-28.7,23.3]],shrubs:5,ferns:8,spread:.77,seed:302},
  {name:'west-return',curves:[[-30.9,21.8],[-34.8,22.1],[-33.9,26.6]],shrubs:4,ferns:7,spread:.89,seed:4287},
  {name:'field-bank',curves:[[-33.5,54.1],[-31.6,54.8],[-30.3,56.8]],shrubs:2,ferns:4,spread:.72,seed:7651},
];
interface Prototype {p:Float32Array;n:Float32Array;uv:Float32Array;idx:Uint16Array}
// byte strings and all decoded GPU resources belong to this release/scene. No network, async
// callback, cache sharing between Villa instances, or instancing work in the animation loop.
function prototypes():Prototype[]{return SHELTER_MESHES.map(({count,bytes})=>{
  const raw=Uint8Array.from(atob(bytes),c=>c.charCodeAt(0)),v=new DataView(raw.buffer),p=new Float32Array(count*3),n=new Float32Array(count*3),uv=new Float32Array(count*2);let o=0;
  for(let i=0;i<count;i++){
    for(let k=0;k<3;k++,o+=2)p[3*i+k]=v.getInt16(o,true)/8000;
    for(let k=0;k<3;k++,o++)n[3*i+k]=v.getInt8(o)/127;
    for(let k=0;k<2;k++,o+=2)uv[2*i+k]=v.getUint16(o,true)/65535;
  }
  const idx=new Uint16Array((raw.byteLength-o)/2);for(let i=0;i<idx.length;i++,o+=2)idx[i]=v.getUint16(o,true);
  return {p,n,uv,idx};
});}
interface Plant {x:number; y:number; z:number; yaw:number; scale:number; vertical:number; shade:number; id:number}
function stake(d:Drift):Plant[]{
  const rand=shelterRandom(d.seed),[a,b,c]=d.curves,plants:Plant[]=[];
  for(const fern of [false,true]){
    const count=fern?d.ferns:d.shrubs;
    for(let i=0;i<count;i++){
      const t=(i+.15+.70*rand())/count, u=1-t, dx=u*(b[0]-a[0])+t*(c[0]-b[0]),dz=u*(b[1]-a[1])+t*(c[1]-b[1]);
      const length=Math.hypot(dx,dz),edge=(fern?.60+rand()*.43:(rand()-.5)*.54)*d.spread*(i%3===1?-1:1);
      const x=u*u*a[0]+2*u*t*b[0]+t*t*c[0]-dz/length*edge, z=u*u*a[1]+2*u*t*b[1]+t*t*c[1]+dx/length*edge;
      const id=(fern?0:4)+(i+Math.floor(rand()*3)+d.seed)%4;
      plants.push({x,y:villaTerrainGroundHeight(x,z)-.014,z,yaw:rand()*shelterTurn,scale:fern?.88+.64*rand():.76+.35*rand(),vertical:.86+.27*rand(),shade:.77+.36*rand(),id});
    }
  }
  return plants;
}
export function shelterUnderstorey(parent:THREE.Group,material:THREE.Material){
  const templates=prototypes();
  for(const d of DRIFTS){
    const plants=stake(d),count=plants.reduce((s,t)=>s+templates[t.id]!.p.length/3,0),triple=plants.reduce((s,t)=>s+templates[t.id]!.idx.length,0);
    const pos=new Float32Array(count*3),normal=new Float32Array(count*3),uvs=new Float32Array(count*2),tint=new Float32Array(count*3),indices=new Uint16Array(triple);
    // Local cells keep bounding spheres/frustum tests tight. Bake placement once; keep original UV seams.
    const [ox,oz]=d.curves[1];let k=0,j=0;
    for(const t of plants){const m=templates[t.id]!,first=k,co=Math.cos(t.yaw),sn=Math.sin(t.yaw),fern=t.id<4,s=t.scale;
      for(let i=0;i<m.p.length/3;i++,k++){
        const px=m.p[3*i]!,py=m.p[3*i+1]!,pz=m.p[3*i+2]!,nx=m.n[3*i]!,ny=m.n[3*i+1]!/t.vertical,nz=m.n[3*i+2]!,norm=Math.hypot(nx,ny,nz)||1;
        pos.set([t.x-ox+s*(co*px+sn*pz), t.y+s*t.vertical*py, t.z-oz+s*(co*pz-sn*px)],3*k);
        normal.set([(co*nx+sn*nz)/norm,ny/norm,(co*nz-sn*nx)/norm],3*k);
        uvs[2*k]=fern?.0005+.499*m.uv[2*i]!:.5005+.249*m.uv[2*i]!;uvs[2*k+1]=.001+.998*m.uv[2*i+1]!;
        const v=t.shade*(.86+.14*Math.min(1,Math.max(0,py/(fern?.28:.85))));tint.set([v*(fern?.96:1.02),v,v*(fern?.99:1.02)],3*k);
      }
      for(const i of m.idx)indices[j++]=first+i;
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('normal',new THREE.BufferAttribute(normal,3));g.setAttribute('uv',new THREE.BufferAttribute(uvs,2));g.setAttribute('color',new THREE.BufferAttribute(tint,3));g.setIndex(new THREE.BufferAttribute(indices,1));g.computeBoundingBox();g.computeBoundingSphere();
    const mesh=new THREE.Mesh(g,material);mesh.name=`shelter/drift/${d.name}`;mesh.position.set(ox,0,oz);mesh.castShadow=mesh.receiveShadow=true;
    mesh.userData.plantings=plants.map(p=>({x:p.x,y:p.y,z:p.z,variant:SHELTER_MESHES[p.id]!.name}));parent.add(mesh);
  }
}
