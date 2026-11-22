import * as THREE from 'three';
import { VILLA_FRONT_LINK, VILLA_ENTRY_SPUR, villaRoadToe } from './villaDrivingCourse.js';
import { stoneTint } from './villaWeatheredFinish.js';
import { VILLA_SCENIC_ROAD } from './villaDriving.js';
import { subtractVillaPolygon } from './villaTerrainModel.js';
import { VillaModelBuilder } from './villaModel.js';

type Point={x:number;z:number};
const area=(p:Point[])=>p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length]!;return sum+a.x*b.z-a.z*b.x;},0)/2;
const rect=(x0:number,x1:number,z0:number,z1:number):Point[]=>[{x:x0,z:z0},{x:x1,z:z0},{x:x1,z:z1},{x:x0,z:z1}];
const pathShoulders = () => {
  const pieces: Point[][]=[];
  for(const path of [VILLA_FRONT_LINK,VILLA_ENTRY_SPUR]) for(let i=1;i<path.length;i++){
    const [a,b]=villaRoadToe(path,i-1,VILLA_SCENIC_ROAD.width),[c,d]=villaRoadToe(path,i,VILLA_SCENIC_ROAD.width);
    const q=[a,b,d,c]; if(area(q)<0)q.reverse(); pieces.push(q);
  }
  return pieces;
};
/** The strip to the south door ends against the real shoulder. No stone needle shows on the
 * tarmac when viewed obliquely and no path lamp stands in a driving lane. */
export function createEntryPaving(b:VillaModelBuilder,stone:THREE.Material,grout:THREE.Material) {
  const limestone=stone.vertexColors?stone:stone.clone(); limestone.vertexColors=true;
  const bounds=(p:Point[])=>({x0:Math.min(...p.map(v=>v.x)),x1:Math.max(...p.map(v=>v.x)),z0:Math.min(...p.map(v=>v.z)),z1:Math.max(...p.map(v=>v.z))});
  const road=pathShoulders().map(q=>({q,...bounds(q)}));
  const clip=(poly:Point[])=>road.reduce((bits,h)=>bits.flatMap(part=>{
    const r=bounds(part);if(r.x1<=h.x0||r.x0>=h.x1||r.z1<=h.z0||r.z0>=h.z1)return [part];
    return subtractVillaPolygon(part,h.q).filter(p=>Math.abs(area(p))>.00005);
  }),[poly]);
  function stoneBlock(p:Point[],top:number,bottom:number,bevel:number) {
    const vert:number[]=[],uv:number[]=[];
    const c=p.reduce((s,v)=>({x:s.x+v.x/p.length,z:s.z+v.z/p.length}),{x:0,z:0});
    const inset=p.map(v=>{const dx=c.x-v.x,dz=c.z-v.z,fac=Math.min(.08,bevel/(Math.hypot(dx,dz)||1));return {x:v.x+dx*fac,z:v.z+dz*fac};});
    const put=(v:Point,y:number,u=v.x,t=v.z)=>{vert.push(v.x,y,v.z);uv.push(u/2.5,t/2.5);};
    for(let i=1;i<p.length-1;i++){put(inset[0]!,top);put(inset[i+1]!,top);put(inset[i]!,top);}
    for(let i=0;i<p.length;i++){
      const j=(i+1)%p.length,low=top-bevel;
      put(inset[i]!,top);put(p[j]!,low);put(p[i]!,low);put(inset[i]!,top);put(inset[j]!,top);put(p[j]!,low);
      const u=Math.abs(p[i]!.x-p[j]!.x)>Math.abs(p[i]!.z-p[j]!.z)?'x':'z';
      const side=(k:number,y:number)=>put(p[k]!,y,p[k]![u],y);
      side(i,low);side(j,bottom);side(i,bottom);side(i,low);side(j,low);side(j,bottom);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vert,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();return g;
  }
  const joint=.008;
  function pave(l:number,r:number,n:number,s:number,id:number){
    if(r-l<=joint+.006||s-n<=joint+.006)return;
    for(const p of clip(rect(l+joint/2,r-joint/2,n+joint/2,s-joint/2))){
      const g=stoneBlock(p,.030,.014,.004), v=g.getAttribute('position');
      b.geometry(stoneTint(g,id,j=>v.getY(j)>.029?.99:.83),limestone);
    }
  }
  for(const [x0,x1,z0,z1] of [[-1.96,1.96,9.135,15.05],[1.96,14.5,9.90,12.10]]){
    for(const p of clip(rect(x0,x1,z0,z1)))b.geometry(stoneBlock(p,.015,-.035,.001),grout);
    // A single soldier edge contains the running bond at the lawn. Cut both
    // faces against the changing gravel toe; no ornamental kerb in the drive.
    const entry=x0<0, left=x0+(entry?.171:0),right=x1-(entry?.171:0), south=z1-(entry?0:.171);
    if(entry)for(let j=0,z=z0;z<z1;j++,z+=.53){
      pave(x0,left,z,Math.min(z+.53,z1),101+j);pave(right,x1,z,Math.min(z+.53,z1),37+j);
    }else for(let j=0,x=x0;x<x1;j++,x+=.53)pave(x,Math.min(x+.53,x1),south,z1,27+j);
    for(let z=z0,row=0;z<south-.02;z+=.60,row++)for(let x=left-(row%2)*.55,col=0;x<right-.02;x+=1.1,col++)
      pave(Math.max(left,x),Math.min(right,x+1.1),z,Math.min(z+.60,south),53*row+col);
  }
}
/** Small lanterns follow the planted edge and step stones, not the former truncated rectilinear path. */
export const ENTRY_LANTERNS = [[-2.2,10.05],[2.27,10.05],[-.97,13.39],[-5.55,10.67],[-9.1,10.67],[8.7,10.18]] as const;
