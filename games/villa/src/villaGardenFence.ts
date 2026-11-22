import * as THREE from 'three';
import { NatureMesh, type P3 } from './villaNatureGeometry.js';
import type { VillaModelBuilder } from './villaModel.js';
/** Keep the long field boundary open; only the sides facing the house and the windy
 * corners of the north kitchen garden carry a run of narrow feather-edge pales. */
export function shelteredBay(x:number,z:number,alongX:boolean){return alongX ? z < -58 && (x < -21 || x > 36) : z>-26 && z<32;}
export function addVillaPales(b:VillaModelBuilder,a:P3,end:P3,wood:THREE.Material){
 const dx=end[0]-a[0],dz=end[2]-a[2],length=Math.hypot(dx,dz),ux=dx/length,uz=dz/length,nx=-uz,nz=ux,n=Math.max(1,Math.round((length-.115)/.145)),step=(length-.115)/n;
 const m=new NatureMesh(),seed=a[0]*.439+a[2]*.328;
 const sample=(j:number)=>{const v=Math.sin(seed*3.71+j*17.943)*43758.54;return v-Math.floor(v);};
 for(let j=0;j<n;j++){
   const mid=.0575+(j+.5)*step,half=(step-.012-sample(j+88)*.010)/2,baseY=a[1]+(end[1]-a[1])*mid/length,top=1.03+sample(j)*.070,bottom=.067+sample(j+4)*.018,phase=sample(j+14)*.87;
   // The 18–24 mm plank laps against both rails; saw bevel on the top sheds water.
   const corners:readonly (readonly [number,number])[]=[[-half,bottom],[half,bottom],[half,top-.022],[half-.020,top],[-half+.012,top-.006],[-half,top-.027]];
   const layer=(d:number,face:number)=>corners.map(([s,h],k)=>{const setback=d+(d>.05?.004*(s/half):0);const p:P3=[a[0]+ux*(mid+s)+nx*setback,baseY+h,a[2]+uz*(mid+s)+nz*setback],wet=Math.exp(-h/.19),light=(.85+.15*sample(j+18))*(1-.20*wet)*face;
     return m.point(p,light,[h/2.5+phase,s/.35+phase],[light*(1-.035*wet),light*.993,light*(.94+.08*wet)]);});
   const front=layer(.054,1),back=layer(.032,.91);
   for(let k=1;k<corners.length-1;k++){m.tri(front[0]!,front[k]!,front[k+1]!);m.tri(back[0]!,back[k+1]!,back[k]!);}
   for(let k=0;k<corners.length;k++){const i=(k+1)%corners.length;m.tri(front[k]!,back[k]!,back[i]!);m.tri(front[k]!,back[i]!,front[i]!);}
 }
 // Recalculate per-face normals: no pillowy interpolation around thin sawn edges.
 const g=m.geometry(true),flat=g.toNonIndexed();g.dispose();flat.computeVertexNormals();b.geometry(flat,wood);
}
