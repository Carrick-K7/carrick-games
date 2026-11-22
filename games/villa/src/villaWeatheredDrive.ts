import * as THREE from 'three';
import { villaTerrainHeight } from './villaEstateLayout.js';
import { clamp01, finishTexture, sample01 } from './villaWeatheredFinish.js';

/** A repeat of sealed mineral fines with irregular, partly embedded stone chips.
 * The same sample has a different physical grain size on loose shoulder gravel. */
export function mineralAggregate() {
  const n=128, data=new Uint8Array(4*n*n);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const a=2*Math.PI*x/n,b=2*Math.PI*y/n,i=4*(y*n+x);
    const value=210+sample01(x,y+49)*18+4*Math.sin(2*a-b)*Math.cos(a+3*b);
    data.set([value,value,value-1,255],i);
  }
  for(let j=0;j<1780;j++) {
    const x=sample01(j,73)*n,y=sample01(j,103)*n,rx=.34+1.67*sample01(j,17)**2,ry=.43+1.35*sample01(j,203);
    const t=Math.PI*sample01(j,6),c=Math.cos(t),s=Math.sin(t),tone=168+78*sample01(j,113),warm=9*sample01(j,60)-3;
    for(let row=Math.floor(y-2);row<=y+2;row++)for(let col=Math.floor(x-2);col<=x+2;col++){
      const dx=col+.5-x,dy=row+.5-y,u=(dx*c+dy*s)/rx,v=(-dx*s+dy*c)/ry;
      const mix=clamp01((1-Math.max(Math.abs(v)*.84+Math.abs(u+.18*v)*.52,Math.abs(u)))*2.8);
      const i=4*(((row+n)%n)*n+(col+n)%n), value=tone+3*v;
      data[i]+=mix*(value+warm-data[i]);data[i+1]+=mix*(value-data[i+1]);data[i+2]+=mix*(value-warm-data[i+2]);
    }
  }
  return finishTexture('private-drive/hornfels-chips',n,n,data);
}

type P={x:number;z:number};
export function vergeWidth(p:P,side:number) {
  // Cut into, never beyond, the retained 450 mm driving clearance. Vary with
  // site coordinates, not station ID, so clipping and adjoining strips agree.
  return .335+.069*Math.sin(.72*p.z+.29*p.x+side)+.037*Math.sin(1.17*p.x-.39*p.z+side*2.8);
}
export type DriveRun = { points: readonly P[]; width: number; y: number; verge: boolean };
export type DriveStation={l:P;r:P;leftVerge:P;rightVerge:P};
type CrossSection=(path:readonly P[],i:number,width:number)=>[P,P];
const lerp=(a:P,b:P,t:number):P=>({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});
export function shoulderStation(path:readonly P[], i:number,width:number,section:CrossSection):DriveStation {
  const [l,r]=section(path,i,width), ux=(r.x-l.x)/width,uz=(r.z-l.z)/width;
  const lw=vergeWidth(l,-1),rw=vergeWidth(r,1);
  return {l,r,leftVerge:{x:l.x-ux*lw,z:l.z-uz*lw},rightVerge:{x:r.x+ux*rw,z:r.z+uz*rw}};
}

/** Only neighbouring lanes affect the join finish. A bounded station-length
 * subdivision follows terrain, but every original station/edge remains exact. */
export function roadStations(run:DriveRun,section:CrossSection) {
  const pts=run.points, out:DriveStation[]=[];let prev=shoulderStation(pts,0,run.width,section);out.push(prev);
  for(let i=1;i<pts.length;i++){
    const at=shoulderStation(pts,i,run.width,section), steps=Math.ceil(Math.hypot(pts[i].x-pts[i-1].x,pts[i].z-pts[i-1].z)/1.15);
    for(let k=1;k<steps;k++) {
      const t=k/steps;out.push({l:lerp(prev.l,at.l,t),r:lerp(prev.r,at.r,t),leftVerge:lerp(prev.leftVerge,at.leftVerge,t),rightVerge:lerp(prev.rightVerge,at.rightVerge,t)});
    }
    out.push(at);prev=at;
  }
  return out;
}
export function junctionMask(runs:readonly DriveRun[]) {
  type Seg={a:P;b:P;w:number;run:DriveRun}; const grid=new Map<string,Seg[]>(), cell=9;
  for(const run of runs) for(let i=1;i<run.points.length;i++) {
    const a=run.points[i-1],b=run.points[i],w=run.width/2+.5, seg={a,b,w:run.width/2,run};
    for(let row=Math.floor((Math.min(a.z,b.z)-w)/cell);row<=Math.floor((Math.max(a.z,b.z)+w)/cell);row++)
      for(let col=Math.floor((Math.min(a.x,b.x)-w)/cell);col<=Math.floor((Math.max(a.x,b.x)+w)/cell);col++) {
        const key=`${row}/${col}`, list=grid.get(key); if(list)list.push(seg);else grid.set(key,[seg]);
      }
  }
  return (x:number,z:number,run:DriveRun)=>{
    let coverage=0;
    for(const s of grid.get(`${Math.floor(z/cell)}/${Math.floor(x/cell)}`)??[]) {
      if(s.run===run)continue;
      const dx=s.b.x-s.a.x,dz=s.b.z-s.a.z,t=clamp01(((x-s.a.x)*dx+(z-s.a.z)*dz)/(dx*dx+dz*dz||1));
      coverage=Math.max(coverage,clamp01((s.w+.28-Math.hypot(x-s.a.x-t*dx,z-s.a.z-t*dz))/.57));
    }
    return coverage;
  };
}

/** Section geometry, rather than a full-width second gravel road hidden under
 * every driving lane. Asphalt retains both exact datums; the loose outer toe
 * tapers down into the lawn. Mineral dust fades into the seal at the join. */
export function driveRibbon(stations:readonly DriveStation[],run:DriveRun,finish:'asphalt'|'left'|'right',mask:ReturnType<typeof junctionMask>) {
  const p:number[]=[],uv:number[]=[],color:number[]=[],index:number[]=[];
  const asphalt=finish==='asphalt', left=finish==='left', ts=asphalt?[0,.038,.105,.27,.50,.73,.895,.962,1]:[0,.52,1];
  const c=new THREE.Color(), bed=new THREE.Color('#73746d'), dust=new THREE.Color('#a39984'), ballast=new THREE.Color('#aaa28c'), toe=new THREE.Color('#9a967a');
  stations.forEach((s,i)=>{
    for(const [j,t] of ts.entries()) {
      const {x,z}=asphalt?(j===ts.length-1?s.r:lerp(s.l,s.r,t)):left?lerp(s.leftVerge,s.l,t):lerp(s.r,s.rightVerge,t);
      const edge=asphalt?Math.min(t,1-t)*run.width:(left?t:1-t);
      const height=asphalt?run.y:(-.018+.045*edge);
      p.push(x,villaTerrainHeight(x,z)+height,z);
      const size=asphalt?.61:1.12;uv.push(x/size,z/size);
      const patina=.47*Math.sin(x*.64+z*.19)+.22*Math.sin(z*.82-x*.47)+.31*Math.cos(.13*x+.25*z);
      if(asphalt) {
        const intrusion=mask(x,z,run), dustWidth=.41+.19*patina;
        const edgeDust=run.verge?(.61+.09*patina)*(1-intrusion)*clamp01(1-edge/dustWidth):0;
        const lane=(Math.abs(t-.5)*run.width-1.95)/1.02, wheel=Math.exp(-lane*lane);
        c.copy(bed).lerp(dust,edgeDust).multiplyScalar(.98+.066*patina-.042*wheel);
      } else c.copy(toe).lerp(ballast,.21+.75*edge).multiplyScalar(.94+.07*patina);
      color.push(c.r,c.g,c.b);
      if(i&&j) {const k=(i-1)*ts.length+j-1;index.push(k,k+ts.length,k+1,k+1,k+ts.length,k+ts.length+1);}
    }
  });
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setAttribute('color',new THREE.Float32BufferAttribute(color,3));g.setIndex(index);g.computeVertexNormals();return g;
}

/** A worn 100 mm edge stripe applied to the graded pavement. Adjacent paint
 * quadrilaterals share stations instead of meeting as skew boxes at every turn. */
export function quietEdgePaint(stations:readonly DriveStation[], run:DriveRun, mask:ReturnType<typeof junctionMask>) {
  const p:number[]=[],uv:number[]=[],color:number[]=[], c=new THREE.Color('#c8c3b2');
  for(const side of [-1,1]) for(let i=1;i<stations.length;i++){
    const a=stations[i-1],b=stations[i];
    const inner=.22+.05,outer=.22-.05, mix=(s:DriveStation,d:number)=>lerp(s.l,s.r,side<0?d/run.width:1-d/run.width);
    const left=(s:DriveStation)=>mix(s,side<0?outer:inner), right=(s:DriveStation)=>mix(s,side<0?inner:outer);
    const ml=mix(a,.22),mr=mix(b,.22);
    if(mask(ml.x,ml.z,run)>.01||mask(mr.x,mr.z,run)>.01)continue;
    for(const v of [left(a),left(b),right(a),right(a),left(b),right(b)]){
      const tone=.88+.10*Math.sin(.66*v.z-.47*v.x)+.05*Math.cos(1.39*v.x+.23*v.z);
      p.push(v.x,villaTerrainHeight(v.x,v.z)+run.y+.004,v.z);uv.push(v.x/.61,v.z/.61);color.push(c.r*tone,c.g*tone,c.b*tone);
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(color,3));g.computeVertexNormals();return g;
}
