import * as THREE from 'three';
import { NatureMesh, mix3, type P3 } from './villaNatureGeometry.js';
import { stockUV } from './villaHorticultureAtlas.js';
import { clamp01, sample01 } from './villaWeatheredFinish.js';

const cross=(a:P3,b:P3):P3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const normalize=(p:P3):P3=>{const n=Math.hypot(...p)||1;return[p[0]/n,p[1]/n,p[2]/n];};
const delta=(a:P3,b:P3):P3=>[b[0]-a[0],b[1]-a[1],b[2]-a[2]];
const color=(n:number):P3=>{const c=new THREE.Color(n);return [c.r,c.g,c.b];};
const stain=(rgb:P3,v:number):P3=>[rgb[0]*v,rgb[1]*v,rgb[2]*v];
const caneColor=color(0xa38a63),juteColor=color(0x92816a),ironColor=color(0x574e44);
const stockFaces=['face0','face1','face2','face3'] as const;
const tau=Math.PI*2;
function span(m:NatureMesh,lo:number[],hi:number[],seam=false) {
  const sides=lo.length-(seam?1:0);
  for(let j=0;j<sides;j++){const k=seam?j+1:(j+1)%sides;m.tri(lo[j],lo[k],hi[j]);m.tri(lo[k],hi[k],hi[j]);}
}
/** A particular piece of sawn stock, with fibres running between the cuts.
 * Hard normals on the wide planed faces, narrow worn arrises, its own slightly
 * bowed edge, and a separately charted cross cut at each end (also post tops). */
function board(m:NatureMesh,start:P3,end:P3,thick:number,high:number,seed:number,lower:boolean) {
  const line=delta(start,end),length=Math.hypot(...line),axis=normalize(line),across=normalize(cross(Math.abs(axis[1])>.9?[0,0,-1]:[0,1,0],axis)),up=cross(axis,across);
  const w=thick*.5,h=high*.5,c=Math.min(.0035,thick*.072,high*.05),grain0=.035+.09*sample01(seed,11),face=stockFaces[seed%4];
  const tone=(.87+.18*sample01(seed,41))*(lower?.90:1),sag=length>.60?.004*(sample01(seed,418)-.46):0;
  const at=(u:number,v:number,t:number):P3=>[start[0]+t*line[0]+u*across[0]+v*up[0],start[1]+t*line[1]+u*across[1]+v*up[1]+4*t*(1-t)*sag,start[2]+t*line[2]+u*across[2]+v*up[2]];
  const section=[[-w+c,-h],[w-c,-h],[w,-h+c],[w,h-c],[w-c,h],[-w+c,h],[-w,h-c],[-w,-h+c]];
  for(let j=0;j<section.length;j++) {
    const p=section[j],q=section[(j+1)%section.length]; let last:number[]=[];
    for(const t of length>.61?[0,.52,1]:[0,1]) {
      const next=[p,q].map(([u,v])=>{
        const shade=tone*(.96+.066*(v/h)+.026*(u/w))*(lower?1-.18*clamp01((-v/h-.42)/.58):1);
        return m.point(at(u,v,t),shade,stockUV(face,grain0+t*length/3.32,.50+(u*.79+v)/.22+.035*Math.sin(seed)));
      });
      if(last.length){m.tri(last[0],last[1],next[0]);m.tri(last[1],next[1],next[0]);} last=next;
    }
  }
  for(const t of [0,1]) {
    const cx=.36+.31*sample01(seed,72),cy=.38+.27*sample01(seed,186),endTone=tone*(Math.abs(axis[1])>.9?1.13:.85);
    const ring=section.map(([u,v])=>m.point(at(u,v,t),endTone,stockUV('end',cx+u/.23,cy+v/.23)));
    const center=m.point(at(0,0,t),endTone*1.03,stockUV('end',cx,cy));
    for(let j=0;j<ring.length;j++){const k=(j+1)%ring.length;if(t)m.tri(center,ring[j],ring[k]);else m.tri(center,ring[k],ring[j]);}
  }
}
/** A continuously tapering twig/cord/fastener, not a blown-up cylinder. */
function rod(m:NatureMesh,path:P3[],radii:number[],col:P3,sides=5) {
  const overall=normalize(delta(path[0],path[path.length-1])),ref:P3=Math.abs(overall[2])>.87?[1,0,0]:[0,0,1];
  let last:number[]=[];
  path.forEach((p,i)=>{
    const tangent=normalize(delta(path[Math.max(0,i-1)],path[Math.min(path.length-1,i+1)])),u=normalize(cross(ref,tangent)),v=cross(tangent,u);
    const ring=Array.from({length:sides},(_,j)=>{
      const a=tau*j/sides,r=radii[i],x=r*Math.cos(a),y=r*Math.sin(a);
      return m.point([p[0]+u[0]*x+v[0]*y,p[1]+u[1]*x+v[1]*y,p[2]+u[2]*x+v[2]*y],1,undefined,stain(col,.93+.13*Math.cos(a)));
    });
    if(last.length)span(m,last,ring); last=ring;
  });
  const end=m.point(path[path.length-1],1,undefined,stain(col,1.16)); for(let j=0;j<sides;j++)m.tri(end,last[j],last[(j+1)%sides]);
}
function nail(m:NatureMesh,x:number,y:number,z:number,sign:number,alongX:boolean) {
  const at=(d:number):P3=>[x+(alongX?0:sign*d),y,z+(alongX?sign*d:0)];
  rod(m,[at(-.0005),at(.0012)], [.0044,.0040],ironColor,6);
}
export function buildBedStock(wood:NatureMesh,bits:NatureMesh,w:number,d:number,seed:number) {
  const thick=.041, post=.078;
  for(let course=0;course<2;course++) {
    // The joints alternate which side runs through. One repaired long course
    // butts on a central backer; the course above bridges that joint.
    const high=course?.138:.130,y=course?.211:.073;
    for(const sign of [-1,1]) {
      const z=sign*(d/2-thick*.5),x=sign*(w/2-thick*.5),xEnd=w/2-(course?thick+.001:0),zEnd=d/2-(course?0:thick+.001);
      const joint=.14*(1+Math.sin(seed+sign));
      if((seed+course+(sign>0?1:0))%3===0) {
        board(wood,[-xEnd,y,z],[joint-.002,y,z],thick,high,seed+course+11,course===0);
        board(wood,[joint+.002,y,z],[xEnd,y,z],thick,high,seed+course+28,course===0);
        board(wood,[joint,.012,sign*(d/2-thick-.022)],[joint,.259,sign*(d/2-thick-.022)],.091,.044,seed+31,false);
        for(const off of [-.023,.023])nail(bits,joint+off,y+.009,sign*d/2,sign,true);
      } else board(wood,[-xEnd,y,z],[xEnd,y,z],thick,high,seed+course+(sign>0?1:12),course===0);
      board(wood,[x,y,-zEnd],[x,y,zEnd],thick,high,seed+course+(sign>0?42:23),course===0);
      for(const end of [-1,1]){
        nail(bits,end*(w/2-thick-post*.5),y+.013,sign*d/2,sign,true);
        nail(bits,sign*w/2,y-.008,end*(d/2-thick-post*.5),sign,false);
      }
    }
  }
  for(const sx of [-1,1])for(const sz of [-1,1]){
    const x=sx*(w/2-thick-post/2+.0008),z=sz*(d/2-thick-post/2+.0008),id=seed+3*sx+sz+25;
    board(wood,[x,.004,z],[x,.290+.005*sample01(id,34),z],post,post,id,false);
  }
}
function cane(m:NatureMesh,pts:P3[],r:number,sides:number) {
  const rgb=stain(caneColor,.90+.10*Math.cos(pts[0][0]*12+pts[0][2]*.7));
  rod(m,pts,pts.map((_,i)=>r*(1-.36*i/(pts.length-1))),rgb,sides);
  // Slightly dark, swollen nodes with realistic 20–28 cm internodes.
  for(let i=1;i<pts.length;i++) {
    const p=pts[i-1],q=pts[i],len=Math.hypot(...delta(p,q)),n=Math.floor(len/.246);
    for(let j=0;j<n;j++){
      const t=(j+.74)/(n+.18),rad=r*(1-.36*(i-1+t)/(pts.length-1));
      rod(m,[mix3(p,q,t-.0027/len),mix3(p,q,t+.0027/len)],[rad*1.08,rad*1.12],stain(rgb,.70),sides);
    }
  }
}
export function buildTomatoTrellis(m:NatureMesh) {
  // Two raked end trestles carry a single ridge rail. The two lower courses
  // are fine jute observation-height lines, not a cage of fence-sized bars.
  for(const s of [-1,1])for(const z of [-1,1])cane(m,[[s*1.074,.21,z*.212],[s*1.066,.90,z*.110],[s*1.056,1.567,z*.014]],.013,6);
  cane(m,[[-1.145,1.525,.007],[-.01,1.539,-.012],[1.146,1.525,.007]],.016,7);
  for(const s of [-1,1]) {
    const x=s*1.06;
    for(let k=0;k<3;k++) rod(m,[[x-.021,1.513+k*.006,.019],[x+.013,1.534+k*.006,.024],[x+.019,1.546+k*.005,-.013],[x-.019,1.525+k*.005,-.020]], [.0027,.0027,.0027,.0026],juteColor,4);
    rod(m,[[x-.014,1.53,.023],[x-.030,1.50,.028],[x-.021,1.466,.027]], [.0027,.0025,.0017],juteColor,4);
  }
  for(const [y,z] of [[.746,.134],[1.122,-.078]]) rod(m,[[-1.066,y,z],[-.51,y-.011,z],[.18,y-.017,z+.005],[1.061,y,z]],[.0029,.0026,.0027,.0029],juteColor,4);
}
export function stakeTomato(m:NatureMesh, x:number,z:number,y:number, ties:P3[]) {
  const start:P3=[.026,-.015,.006],end:P3=[.016,1.53-y,-z+.006],mid=mix3(start,end,.53);mid[0]+=.007;
  cane(m,[start,mid,end],.0074,5);
  for(const p of ties) {
    const t=(p[1]-start[1])/(end[1]-start[1]), q=t<.53?mix3(start,mid,t/.53):mix3(mid,end,(t-.53)/.47);
    rod(m,[[p[0]-.006,p[1]+.002,p[2]],[p[0],p[1]-.006,p[2]-.007],[q[0]+.006,q[1]-.003,q[2]-.006],[q[0]+.006,q[1]+.004,q[2]+.005],[p[0],p[1]+.005,p[2]+.006],[p[0]-.006,p[1]+.002,p[2]]], [.0024,.0024,.0023,.0023,.0022,.0021],juteColor,4);
  }
  // A turn of twine fastens each climbing stake to the ridge it actually hits.
  const railY=1.538-.013*Math.abs(x),p=mix3(start,end,clamp01((railY-y-start[1])/(end[1]-start[1])));
  rod(m,[[p[0]-.008,p[1]-.009,p[2]+.012],[p[0]+.006,p[1]+.015,p[2]+.006],[p[0]+.007,p[1]+.009,p[2]-.014],[p[0]-.009,p[1]-.009,p[2]-.004]], [.0023,.0023,.0024,.0023],juteColor,4);
}

function roundedRect(w:number,d:number,r:number):P3[] {
  const corners:P3[]=[];
  for(let i=0;i<4;i++) {
    const a=Math.PI/4-i*Math.PI/2,cx=Math.sign(Math.cos(a))*(w/2-r),cz=Math.sign(Math.sin(a))*(d/2-r);
    for(let j=0;j<3;j++){const b=a+Math.PI/4-j*Math.PI/4;corners.push([cx+r*Math.cos(b),0,cz+r*Math.sin(b)]);}
  }
  return corners;
}
/** Fired-clay troughs and pots are hollow vessels: a recessed plinth, slightly
 * battered body, thrown moulding and overhung lip return down the inside. */
export function buildClayVessel(m:NatureMesh,w:number,d:number,round:boolean,seed:number) {
  const profile=round ? [[.004,.66],[.025,.69],[.035,.67],[.292,.921],[.298,.982],[.329,1],[.341,.967],[.341,.885],[.273,.844]] :
    [[.004,.83],[.026,.87],[.040,.852],[.055,.891],[.382,.972],[.394,1],[.422,1],[.430,.980],[.430,.909],[.359,.884]];
  const levels=profile.length;
  let last:number[]=[];
  for(let i=0;i<levels;i++) {
    const [h,s]=profile[i],ww=round?w*s:w-(1-s)*.78,dd=round?d*s:d-(1-s)*.78;
    const points=round?Array.from({length:12},(_,k):P3=>[ww/2*Math.cos(-tau*k/12),0,dd/2*Math.sin(-tau*k/12)]):roundedRect(ww,dd,.049*s);
    const ring=[...points,points[0]].map(([x,,z],j)=>{
      const surface=.92+.10*h/(round?.34:.43),wash=.030*Math.sin(3*x+5*z+seed)+.035*Math.cos(5*x-z-seed);
      return m.point([x,h,z],(surface+wash)*(i>=levels-3?.85:i===1||i===4?.88:1),stockUV('clay',j/points.length,h/(round?.341:.43)));
    });
    if(last.length)span(m,last,ring,true);
    else {
      const bottom=m.point([0,h,0],.70,stockUV('clay',.43,.05));
      for(let j=0;j<points.length;j++)m.tri(bottom,ring[j+1],ring[j]);
    }
    last=ring;
  }
}
export function potCompost(m:NatureMesh,y:number) {
  const n=14,r=.211,p=m.point([0,y+.003,0],.85,stockUV('loam',.51,.52));
  const ring=Array.from({length:n},(_,j)=>{
    const a=-tau*j/n,x=r*Math.cos(a),z=r*Math.sin(a);return m.point([x,y-.002,z],.79+.08*Math.sin(j),stockUV('loam',.5+x*1.85,.5+z*1.85));
  });
  for(let j=0;j<n;j++)m.tri(p,ring[j],ring[(j+1)%n]);
}
