import * as THREE from 'three';
import { sample01 } from './villaWeatheredFinish.js';
import type { VillaBlock } from './villaWorld.js';
import { TIMBER_METRES } from './villaMillFinish.js';

type Pt = readonly [number,number];
type Rect = readonly [number,number,number,number];
export type FloorTrade = 'plank'|'parquet'|'washed'|'terrazzo'|'rubber'|'wool';
/** Continuous finish courses only where they are built: there are no straight boards
 * secretly passing through the patterned floor or print of mortar on a cut stone. */
export function villaFloorTrade(x:number,z:number,y:number):FloorTrade {
  if(y<1) {
    if(x>=17 && z < -9)return 'wool';
    if(x>=5.65 && x<17 && z< -9)return 'rubber';
    if((x>=-13 && x<-2 && z< -9)||(x>=-11.9&&x< -2&&z>=-9&&z< -4.6))return 'terrazzo';
    if(x<-2 && z>=-9)return 'parquet';
    if(x<-13 && z< -9)return 'washed';
  } else {
    if((x>=8&&x<17&&z>=-9&&z<1)||(x>=-13&&x< -4&&z>=-9&&z<0))return 'terrazzo';
    if(x>=17 && z>=-9)return 'parquet';
    if(x<-4 && z<0 || x>=17&&z< -9)return 'washed';
  }
  return 'plank';
}
function crop(poly:Pt[],axis:0|1,value:number,pos:boolean):Pt[]{
  const out:Pt[]=[];for(let i=0;i<poly.length;i++){
    const a=poly[i]!,b=poly[(i+1)%poly.length]!,d1=(pos?1:-1)*(a[axis]-value),d2=(pos?1:-1)*(b[axis]-value);
    if(d1>=-1e-9)out.push(a);
    if((d1>1e-9&&d2< -1e-9)||(d1< -1e-9&&d2>1e-9)){
      const t=d1/(d1-d2);out.push(axis===0?[value,a[1]+t*(b[1]-a[1])]:[a[0]+t*(b[0]-a[0]),value]);
    }
  }return out;
}
function clip(poly:Pt[],r:Rect){return crop(crop(crop(crop(poly,0,r[0],true),0,r[1],false),1,r[2],true),1,r[3],false);}
class LaidCourse {
  private pos:number[]=[];private uv:number[]=[];private color:number[]=[];
  constructor(readonly trade:FloorTrade,readonly y:number){}
  piece(poly:Pt[],dir:Pt,seed:number,r:Rect){
    const clipped=clip(poly,r);if(clipped.length<3)return;
    const span=clipped.reduce((a,p,i)=>a+p[0]*clipped[(i+1)%clipped.length]![1]-p[1]*clipped[(i+1)%clipped.length]![0],0);if(Math.abs(span)<.000004)return;
    const wood=this.trade==='parquet'||this.trade==='plank'||this.trade==='washed';
    const grade=sample01(seed,77), grain=sample01(seed,759),key=sample01(seed,101),val=wood?.82+.18*grade:.92+.08*grade,
      tint=this.trade==='washed'?[.86,.83,.79]:wood?[.96,.945,.922]:[1,1,1];
    const put=(p:Pt,h:number,edge=1)=>{const [x,z]=p;
      this.pos.push(x,h,z);this.uv.push((x*dir[0]+z*dir[1])/(wood?TIMBER_METRES[0]:1)+grain,(z*dir[0]-x*dir[1])/(wood?TIMBER_METRES[1]:1)+key);
      this.color.push(val*tint[0]!*edge,val*tint[1]!*edge,val*tint[2]!*edge);};
    // Polygon is clockwise in XZ for an upward normal. Sides are only placed at
    // real board boundaries, not in the middle of a plank clipped by a slab joint.
    if(span>0)clipped.reverse();
    for(let i=1;i+1<clipped.length;i++){put(clipped[0]!,this.y);put(clipped[i]!,this.y);put(clipped[i+1]!,this.y);}
    for(let i=0;i<clipped.length;i++){
      const a=clipped[i]!,b=clipped[(i+1)%clipped.length]!;
      if((Math.abs(a[0]-b[0])<1e-6 && (Math.abs(a[0]-r[0])<1e-6||Math.abs(a[0]-r[1])<1e-6))||(Math.abs(a[1]-b[1])<1e-6 && (Math.abs(a[1]-r[2])<1e-6||Math.abs(a[1]-r[3])<1e-6)))continue;
      const low=this.y-(wood?.0032:.0045),e=wood?.80:.86;
      put(a,this.y);put(a,low,e);put(b,low,e);put(a,this.y);put(b,low,e);put(b,this.y);
    }
  }
  region(r:Rect){
    if(this.trade==='parquet'){
      // A true mitred chevron: paired boards meet along the upright spine. 805 mm
      // between spines, 158 mm across the grain, independent timber cut on both sides.
      const w=.805,p=.224,j=.0018,d=Math.SQRT1_2;
      for(let i=Math.floor(r[0]/w);i<Math.ceil(r[1]/w);i++){
        const sign=(i&1)?-1:1, left=i*w+j/2,right=(i+1)*w-j/2,h=sign*w;
        for(let k=Math.floor((r[2]-w)/p)-1;k<=Math.ceil((r[3]+w)/p)+1;k++){
          const z=k*p+(sign<0?w:0),a=z+sign*j/2+j/2,b=z+h-sign*j/2+j/2;
          this.piece([[left,a],[left,a+p-j],[right,b+p-j],[right,b]],[d,sign*d],i*3817+k,r);
        }
      }
    }else{
      const timber=this.trade==='plank'||this.trade==='washed', tile=this.trade==='terrazzo';
      const pitch=timber?.182:tile?.596:this.trade==='wool'?1.60:1.00,length=timber?2.24:tile?1.19:pitch,j=timber?.0018:tile?.0035:.0016;
      for(let row=Math.floor(r[2]/pitch);row<Math.ceil(r[3]/pitch);row++){
        const z=row*pitch,off=timber?length*sample01(row,33):tile?((row&1)*length/2):0;
        for(let col=Math.floor((r[0]-off)/length);col<Math.ceil((r[1]-off)/length);col++){
          const x=col*length+off;this.piece([[x+j/2,z+j/2],[x+j/2,z+pitch-j/2],[x+length-j/2,z+pitch-j/2],[x+length-j/2,z+j/2]],[1,0],row*2141+col,r);
        }
      }
    }
  }
  finish(){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(this.pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(this.uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(this.color,3));g.computeVertexNormals();return g;}
}
export function cutInteriorFloor(v:Pick<VillaBlock,'x'|'z'|'w'|'d'>,top:number){
  const cuts=(a:number,b:number,values:number[])=>[a,...values.filter(k=>k>a+.00001&&k<b-.00001),b];
  const xx=cuts(v.x-v.w/2,v.x+v.w/2,[-13,-11.9,-4,-2,5.65,8,17]),zz=cuts(v.z-v.d/2,v.z+v.d/2,[-9,-4.6,0,1]);
  const parts=new Map<FloorTrade,LaidCourse>();for(let i=1;i<xx.length;i++)for(let j=1;j<zz.length;j++){
    const r:Rect=[xx[i-1]!,xx[i]!,zz[j-1]!,zz[j]!],kind=villaFloorTrade((r[0]+r[1])/2,(r[2]+r[3])/2,top);
    let b=parts.get(kind);if(!b){b=new LaidCourse(kind,top);parts.set(kind,b);}b.region(r);
  }return Array.from(parts,([trade,b])=>({trade,geometry:b.finish()}));
}
