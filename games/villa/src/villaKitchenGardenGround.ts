import * as THREE from 'three';
import { NatureMesh, type P3 } from './villaNatureGeometry.js';
import { stockUV } from './villaHorticultureAtlas.js';
import { clamp01, sample01 } from './villaWeatheredFinish.js';

export type KitchenSite = { x: number; z: number; phase: number; stage: number };
/** Keep the two drill lines legible. Vary actual root positions, leaf count,
 * aspect and development rather than just spinning a fixed plant on a grid. */
export function kitchenSites(seed: number): KitchenSite[] {
  return Array.from({length:10},(_,i)=>({
    x:(i%5-2)*.466+(i<5?-.041:.045)+(sample01(i,seed+9)-.5)*.096,
    z:(i<5?-1:1)*.347+(sample01(i,seed+77)-.5)*.10,
    phase:sample01(i+61,seed)*2*Math.PI, stage:.17+.81*sample01(i+97,seed+31),
  }));
}
// Centimetres of relief over the whole earth skin. The trough BETWEEN two
// heaped rows and the tapering ends are part of that same continuous surface.
function height(x:number,z:number,w:number,d:number,seed:number,roof:boolean) {
  const end=clamp01((w/2-Math.abs(x))/.29), a=seed*.13;
  const grain=.0048*Math.cos(9*x+4*z+a)+.0036*Math.sin(13*z-8*x-.47*a)+.0025*Math.cos(21*x+7*z);
  if(roof) return .375+grain+.008*(1-(2*z/d)**2)*(1-(2*x/w)**2);
  const row=Math.min(Math.abs(z-.35-.021*Math.sin(3*x+a)),Math.abs(z+.35+.024*Math.cos(3.6*x-.8*a)));
  const ridge=Math.exp(-((row/.175)**2));
  return .205+grain+end*ridge*(.063+.013*Math.cos(5*x+a))+.010*(1-(2*z/d)**2);
}
export function kitchenGround(width:number,depth:number,seed:number,roof=false) {
  const nx=roof ? width>depth ? 15:5:20, nz=roof ? depth>width ? 15:5:12;
  const xAt=(i:number)=>width*(i/nx-.5),zAt=(j:number)=>depth*(j/nz-.5);
  const ys=Array.from({length:nz+1},(_,j)=>Array.from({length:nx+1},(_,i)=>height(xAt(i),zAt(j),width,depth,seed,roof)));
  // Sample the actual two triangles in the grid cell: stalks and even a tiny
  // splinter land on the emitted surface rather than a second analytic mound.
  const yAt=(x:number,z:number)=>{
    const u=clamp01(x/width+.5)*nx,v=clamp01(z/depth+.5)*nz,i=Math.min(nx-1,Math.floor(u)),j=Math.min(nz-1,Math.floor(v));
    const fx=u-i,fz=v-j;
    return fx+fz<1 ? ys[j][i]*(1-fx-fz)+ys[j][i+1]*fx+ys[j+1][i]*fz : ys[j+1][i+1]*(fx+fz-1)+ys[j][i+1]*(1-fz)+ys[j+1][i]*(1-fx);
  };
  return {width,depth,nx,nz,xAt,zAt,ys,yAt,seed};
}
export type KitchenGround = ReturnType<typeof kitchenGround>;
export function turnKitchenSoil(m:NatureMesh, bed:KitchenGround, sites:readonly {x:number;z:number}[]) {
  const {nx,nz,ys,xAt,zAt,seed}=bed, tileX=5, tileZ=nz===12?4:5;
  for(let sz=0;sz<nz;sz+=tileZ)for(let sx=0;sx<nx;sx+=tileX){
    let prev:number[]=[];
    for(let j=0;j<=tileZ;j++){
      const row:number[]=[];
      for(let i=0;i<=tileX;i++){
        const x=xAt(sx+i),z=zAt(sz+j),y=ys[sz+j][sx+i],root2=sites.reduce((d,p)=>Math.min(d,(x-p.x)**2+(z-p.z)**2),10);
        const damp=.17*Math.exp(-root2/.014),rim=.11*Math.exp(-12*Math.min(bed.width/2-Math.abs(x),bed.depth/2-Math.abs(z)));
        row.push(m.point([x,y,z],.93+.09*sample01(sx+i+seed,sz+j)-damp-rim,stockUV('loam',i/tileX,j/tileZ)));
      }
      for(let k=0;j>0 && k<tileX;k++){m.tri(prev[k],row[k],prev[k+1]);m.tri(prev[k+1],row[k],row[k+1]);}
      prev=row;
    }
  }
}
const soilTones=[0x614b38,0x4b3c30,0x725643,0x8a7158,0xa39780,0x87725a],mulchTones=[0x907654,0x785638,0xb19870,0x745941,0xa58058];
const colors=(arr:number[])=>arr.map((hex):P3=>{const c=new THREE.Color(hex);return [c.r,c.g,c.b];});
const crumbs=colors(soilTones),splinters=colors(mulchTones);
const tint=(rgb:P3,f:number):P3=>[rgb[0]*f,rgb[1]*f,rgb[2]*f];
/** Small clasts cast their own silhouettes. Split bark chips have a longitudinal
 * crease and a broken end; these are not thousands of identical soil pyramids. */
export function scatterKitchenLitter(m:NatureMesh,w:number,d:number,yAt:(x:number,z:number)=>number,seed:number,n:number,round=false) {
  for(let k=0;k<n;k++) {
    const x=(sample01(seed+k,501)-.5)*(w-.047),z=(sample01(k,seed+312)-.5)*(d-.047);
    if(round && (x/(w*.46))**2+(z/(d*.46))**2>1)continue;
    const y=yAt(x,z), r=sample01(k+270,seed),a=sample01(k+914,seed)*Math.PI*2,f=Math.cos(a),g=Math.sin(a);
    const at=(along:number,across:number,h:number):P3=>[x+f*along-g*across,y+h,z+g*along+f*across];
    if(r<.64) {
      const len=.005+.015*sample01(k+37,seed),wid=len*(.48+.51*sample01(k+5,seed+1)),rise=len*(.37+.30*sample01(k,seed));
      const rgb=crumbs[Math.floor(crumbs.length*sample01(seed,k+605))],cap=m.point(at(-.15*len,.09*wid,rise),1,undefined,tint(rgb,1.06));
      const points=[[-1,-.31],[-.26,.95],[.79,.73],[1,-.43],[.1,-1]].map(([u,v],i)=>m.point(at(u*len,v*wid,-.001),1,undefined,tint(rgb,.74+.16*Math.cos(i+seed))));
      for(let j=0;j<5;j++)m.tri(cap,points[j],points[(j+1)%5]);
    } else {
      const len=.013+.032*sample01(k+81,seed),wid=len*(.11+.14*sample01(k+3,seed)),rgb=splinters[Math.floor(splinters.length*sample01(k+17,seed))];
      const p=[[-1,.01,.001],[-.39,.92,.001],[.88,.65,.0004],[1,-.38,.001],[.03,-1,.0008],[-.25,0,.0035]]
        .map(([u,v,h],j)=>m.point(at(u*len,v*wid,h),1,undefined,tint(rgb,j===5?1.19:.80+.1*Math.cos(j))));
      for(let j=0;j<5;j++)m.tri(p[5],p[j],p[(j+1)%5]);
    }
  }
}
