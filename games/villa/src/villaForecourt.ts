import * as THREE from 'three';
import { VILLA_FRONT_LINK, VILLA_ENTRY_SPUR, villaRoadCrossSection } from './villaDrivingCourse.js';
import { VILLA_SCENIC_ROAD } from './villaDriving.js';
import { subtractVillaPolygon } from './villaTerrainModel.js';
import { VillaModelBuilder } from './villaModel.js';

type Point={x:number;z:number};
const area=(p:Point[])=>p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length]!;return sum+a.x*b.z-a.z*b.x;},0)/2;
const rect=(x0:number,x1:number,z0:number,z1:number):Point[]=>[{x:x0,z:z0},{x:x1,z:z0},{x:x1,z:z1},{x:x0,z:z1}];
const pathShoulders = () => {
  const pieces: Point[][]=[];
  for(const path of [VILLA_FRONT_LINK,VILLA_ENTRY_SPUR]) for(let i=1;i<path.length;i++){
    const [a,b]=villaRoadCrossSection(path,i-1,VILLA_SCENIC_ROAD.width+.9),[c,d]=villaRoadCrossSection(path,i,VILLA_SCENIC_ROAD.width+.9);
    const q=[a,b,d,c]; if(area(q)<0)q.reverse(); pieces.push(q);
  }
  return pieces;
};
/** The strip to the south door ends against the real shoulder. No stone needle shows on the
 * tarmac when viewed obliquely and no path lamp stands in a driving lane. */
export function createEntryPaving(b:VillaModelBuilder,stone:THREE.Material,grout:THREE.Material) {
  const road=pathShoulders();
  const clip=(poly:Point[])=>road.reduce((bits,q)=>bits.flatMap(part=>subtractVillaPolygon(part,q).filter(p=>Math.abs(area(p))>.00005)),[poly]);
  function stoneBlock(p:Point[],top:number,bottom:number,bevel:number) {
    const vert:number[]=[],uv:number[]=[];
    const c=p.reduce((s,v)=>({x:s.x+v.x/p.length,z:s.z+v.z/p.length}),{x:0,z:0});
    const inset=p.map(v=>{const dx=c.x-v.x,dz=c.z-v.z,fac=Math.min(.08,bevel/(Math.hypot(dx,dz)||1));return {x:v.x+dx*fac,z:v.z+dz*fac};});
    const put=(v:Point,y:number)=>{vert.push(v.x,y,v.z);uv.push(v.x/2.5,v.z/2.5);};
    for(let i=1;i<p.length-1;i++){put(inset[0]!,top);put(inset[i+1]!,top);put(inset[i]!,top);}
    for(let i=0;i<p.length;i++){
      const j=(i+1)%p.length,low=top-bevel;
      put(inset[i]!,top);put(p[j]!,low);put(p[i]!,low);put(inset[i]!,top);put(inset[j]!,top);put(p[j]!,low);
      put(p[i]!,low);put(p[j]!,bottom);put(p[i]!,bottom);put(p[i]!,low);put(p[j]!,low);put(p[j]!,bottom);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vert,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();return g;
  }
  for(const [x0,x1,z0,z1] of [[-1.96,1.96,9.135,15.05],[1.96,14.5,9.90,12.10]]){
    for(const p of clip(rect(x0,x1,z0,z1)))b.geometry(stoneBlock(p,.015,-.035,.001),grout);
    for(let z=z0,row=0;z<z1-.02;z+=.62,row++)for(let x=x0-(row%2)*.55;x<x1-.02;x+=1.1){
      const l=Math.max(x0,x)+.003,r=Math.min(x1,x+1.1)-.003;
      if(r-l<.014)continue;
      for(const p of clip(rect(l,r,z+.003,Math.min(z+.62,z1)-.003)))b.geometry(stoneBlock(p,.030,.014,.004),stone);
    }
  }
}
/** Small lanterns follow the planted edge and step stones, not the former truncated rectilinear path. */
export const ENTRY_LANTERNS = [[-2.2,10.05],[2.27,10.05],[-.97,13.39],[-5.55,10.67],[-9.1,10.67],[8.7,10.18]] as const;
