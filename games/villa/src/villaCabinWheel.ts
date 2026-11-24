import * as THREE from 'three';
import type { VillaModelBuilder } from './villaModel.js';
import { ovalLoop, roundedLoop, sectionLoft, type P3 } from './villaVehicleSections.js';
import { wheelThumbPod } from './villaVehicleTrim.js';

type Wheel = 'fastback' | 'utility' | 'touring';
/** The wheel is viewed from -Z. A lightly oval hand section fattens at ten and
 * two, but the outside remains a circular wheel on the original fixed shaft. */
function grip(rad:number, style:Wheel) {
  const p:number[]=[], uv:number[]=[], ix:number[]=[], n=56,k=12;
  for(let i=0;i<n;i++){
    const a=i*2*Math.PI/n, s=Math.sin(a), c=Math.cos(a), thumb=Math.exp(-(((Math.abs(c)-.94)/.18)**2)-(((s-.30)/.38)**2));
    const grip=style==='utility'?.022:style==='fastback'?.019:.021;
    for(let j=0;j<k;j++){
      const v=j*2*Math.PI/k,cv=Math.cos(v),sv=Math.sin(v),r=rad+grip*cv-.012*thumb*Math.max(0,-cv)**2;
      p.push(c*r,s*r, (.022+.006*thumb)*sv-.003*thumb);uv.push(i/n,j/k);
      const n0=i*k+j,n1=((i+1)%n)*k+j,m0=i*k+(j+1)%k,m1=((i+1)%n)*k+(j+1)%k;
      ix.push(n0,n1,m0,n1,m1,m0);
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();return g;
}

/** Cast spoke webs, a dished two-piece airbag cover and key shelves all rotate
 * with the same boss. Different press tools, not different paint on one wheel. */
export function trimSteeringWheel(b:VillaModelBuilder,style:Wheel,rad:number,wrap:THREE.Material,cap:THREE.Material,bright:THREE.Material,topBand?:THREE.Material){
  const utility=style==='utility',touring=style==='touring';
  b.geometry(grip(rad,style),wrap);
  const axis=(side:number,length:number,mid:number,y:number,h:number,z:number,d:number):P3[]=>roundedLoop(h,d,Math.min(h,d)*.33,2).map(([a,c])=>[side*(length+.005*a/h),mid+y+a,z+c]);
  for(const side of [-1,1]){
    const web=(w:number,yy:number,h:number,z:number,d:number)=>axis(side,w,0,yy,h,z,d);
    b.geometry(sectionLoft([web(.037,-.012,.070,.004,.040),web(.065,.002,.055,.001,.040),web(.103,utility?.007:.013,.047,-.001,.040),
      web(rad-.034,.018,.037,.003,.032),web(rad-.002,.027,.053,.007,.029)],true,true,[side,0,0]),cap);
    const binding=[web(.067,-.019,.004,-.018,.007),web(.095,-.011,.006,-.022,.008),web(rad-.034,.002,.006,-.016,.007),web(rad-.015,.007,.0035,-.009,.004)];
    b.geometry(sectionLoft(binding,true,true,[side,0,0]),bright);
    wheelThumbPod(b,side,utility?.095:touring?.092:.085,utility?.009:touring?.015:.009,-.027,utility,cap,utility?cap:bright,bright);
  }
  const spoke=(y:number,x:number,w:number,z:number,d:number)=>roundedLoop(w,d,Math.min(w,d)*.32,2).map(([u,v]):P3=>[x+u,y,z+v]);
  if(utility){ // wide finger bridge, peeled metal just at its return
    b.geometry(sectionLoft([spoke(-rad+.005,0,.051,.005,.029),spoke(-.133,0,.034,.004,.027),spoke(-.093,0,.043,.002,.033),spoke(-.043,0,.084,0,.038)]),cap);
  } else for(const side of [-1,1]) {
    b.geometry(sectionLoft([spoke(-rad+.007,side*.032,.024,.004,.027),spoke(-.127,side*.030,.020,.005,.026),spoke(-.082,side*.039,.023,.005,.032),spoke(-.039,side*.057,.040,.004,.039)]),cap);
    b.geometry(sectionLoft([spoke(-rad+.010,side*.032,.012,-.008,.004),spoke(-.123,side*.031,.009,-.009,.004),spoke(-.077,side*.043,.014,-.012,.006),spoke(-.052,side*.049,.019,-.013,.009)]),bright);
  }
  const cushion=(w:number,hh:number,z:number):P3[]=>ovalLoop(w,hh,32,utility?.58:.74).map(([x,y])=>{
    const v=y/hh;return [x*(1+(utility?.11:.19)*v),-.010+y,z+.010*(x/.076)**2+.004*(1-y/.063)**2];
  });
  b.geometry(sectionLoft([cushion(.057,.046,.028),cushion(.074,.062,.014),cushion(.076,.063,-.013),cushion(.072,.062,-.021)],true,false,[0,0,-1]),cap);
  // Rolled seam, a short return and a crowned face rather than a flat cuboid.
  b.geometry(sectionLoft([cushion(.072,.062,-.021),cushion(.0705,.0605,-.020),cushion(.069,.059,-.023),cushion(.062,.055,-.028),cushion(.038,.037,-.040),cushion(.013,.013,-.044)],false,true,[0,0,-1]),touring?wrap:cap);
  if(topBand){ // Short registration band hugs the grip instead of standing up like a keycap.
    const cuff=Array.from({length:5},(_,i)=>{const a=Math.PI/2+(i-2)*.023;return ovalLoop(.0197,.0227,12).map(([u,z]):P3=>[(rad+u)*Math.cos(a),(rad+u)*Math.sin(a),z]);});
    b.geometry(sectionLoft(cuff,false,false),topBand);
  }
}
