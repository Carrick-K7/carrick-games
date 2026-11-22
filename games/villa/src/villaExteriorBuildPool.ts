import * as THREE from 'three';
import { POOL } from './villaEstateLayout.js';
import { millSection, type Section } from './villaArchitecturalStock.js';
import { VillaModelBuilder } from './villaModel.js';
import { dressTimber } from './villaWeatheredFinish.js';
import { POOL_TILE_SHEET } from './villaWeatheredPool.js';

type P = [number,number,number];
/** Return the walls into the floor with a radiused sanitary cove. At its lowest
 * level the mosaic actually stops at the drain throat, not under a painted grate. */
export function linedPool(b:VillaModelBuilder, ceramic:THREE.Material, steel:THREE.Material, dark:THREE.Material) {
  const pos:number[] = [], uv:number[]=[], bottom = -.970;
  const rect = (x0:number,x1:number,z0:number,z1:number,y:number):P[] => [[x0,y,z0],[x1,y,z0],[x1,y,z1],[x0,y,z1]];
  const quad=(a:P,c:P,d:P,e:P,side=-1,from=0,to=0)=>{
    const points=[a,c,d,e];for(const i of [0,1,2,0,2,3]){
      const p=points[i], arc=i===0||i===3?from:to; pos.push(...p);
      const x=side===3?arc:side===1?POOL.maxX-POOL.minX-arc:p[0]-POOL.minX;
      const z=side===0?arc:side===2?POOL.maxZ-POOL.minZ-arc:p[2]-POOL.minZ;
      uv.push(x/POOL_TILE_SHEET,z/POOL_TILE_SHEET);
    }
  };
  // Unroll the cove by physical arc length into the same UV field as the floor:
  // a diagonally facing tile must not collapse to (z,z) at the projection change.
  const profile=[[0,.016],[0,-.879],[.008,-.916],[.029,-.945],[.060,-.964],[.094,bottom]], unfolded=profile.map(()=>0);
  unfolded[profile.length-1]=.094;
  for(let k=profile.length-2;k>=0;k--)unfolded[k]=unfolded[k+1]-Math.hypot(profile[k+1][0]-profile[k][0],profile[k+1][1]-profile[k][1]);
  let upper:P[] = [];
  for(const [k,[inset,y]] of profile.entries()) {
    const layer = rect(POOL.minX+inset,POOL.maxX-inset,POOL.minZ+inset,POOL.maxZ-inset,y);
    if (upper.length) for (let i=0;i<4;i++) {const j=(i+1)%4;quad(upper[i],layer[i],layer[j],upper[j],i,unfolded[k-1],unfolded[k]);}
    upper=layer;
  }
  const [x0,,z0]=upper[0], [x1,,z1]=upper[2];
  const cx=(x0+x1)/2, cz=POOL.minZ+2.05, half=.117;
  for (const [l,r,n,s] of [[x0,cx-half,z0,z1],[cx+half,x1,z0,z1],[cx-half,cx+half,z0,cz-half],[cx-half,cx+half,cz+half,z1]]) {
    const p=rect(l,r,n,s,bottom);quad(p[0],p[3],p[2],p[1]);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals(); b.geometry(g,ceramic);
  b.box(cx,bottom-.034,cz,.236,.016,.236,dark,0);
  for (const side of [-1,1]) {
    b.box(cx+side*(half-.007),bottom-.005,cz,.014,.012,.234,steel,0);
    b.box(cx,bottom-.005,cz+side*(half-.007),.206,.012,.014,steel,0);
  }
  for(let i=-4;i<=4;i++) b.box(cx+i*.024,bottom-.006,cz,.013,.012,.207,steel,0);
}

/** 35 mm crowned decking and two cross-running border boards. True expansion
 * gaps expose the dark substructure, never the image of a second board underneath. */
export function poolDeck(b:VillaModelBuilder, cedar:THREE.Material, substructure:THREE.Material) {
  const x0=POOL.minX-.30,x1=POOL.maxX+.50,z0=POOL.maxZ+.367,z1=POOL.maxZ+4, width=x1-x0;
  b.box((x0+x1)/2,-.037,(z0+z1)/2,width-.034,.035,z1-z0-.034,substructure,0);
  const profile=(w:number):Section=>[[-w/2,-.015],[w/2,-.015],[w/2,.016],[w/2-.003,.019],[0,.020],[-w/2+.003,.019],[-w/2,.016]];
  const border=.128,gap=.006,clear=x0+border+gap, end=x1-border-gap;
  for(const [i,x] of [x0+border/2,x1-border/2].entries()) {
    b.geometry(dressTimber(millSection('z',z1-z0,profile(border)),'z',157+i,(_x,_y,z)=>.90+.055*z/(z1-z0)),cedar,[x,0,(z0+z1)/2]);
  }
  // Butt cuts land on 420 mm joist centres; stagger them between adjacent courses.
  const n=24, pitch=(z1-z0)/n, span=2.94;
  for(let row=0;row<n;row++) {
    const z=z0+(row+.5)*pitch, offset=clear-((row*3)%7)*.42;
    for(let j=0;offset+j*span<end;j++) {
      const l=Math.max(clear,offset+j*span+gap/2), r=Math.min(end,offset+(j+1)*span-gap/2);
      if(r<=l)continue;
      const x=(l+r)/2;
      const g=dressTimber(millSection('x',r-l,profile(pitch-gap)),'x',201+row*17+j,(u,_y,v,ny)=>{
        const poolDistance=z+v-POOL.maxZ, ladderDistance=x+u-(POOL.maxX+POOL.minX)/2;
        const damp=Math.exp(-.5*(ladderDistance/1.13)**2-1.1*(poolDistance/.94)**2);
        return (ny>.45?1:.91) * (1-.25*damp) - .13*Math.exp(-poolDistance*2.1);
      });
      b.geometry(g,cedar,[x,0,z]);
    }
  }
}
