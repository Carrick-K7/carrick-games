import * as THREE from 'three';
import type { VillaModelBuilder } from './villaModel.js';
import { bentRail, ovalLoop, roundedLoop, sectionLoft, type P3 } from './villaVehicleSections.js';

// Sections run from the pillion's rolled rear edge to the narrow rider's nose.
// Top, tuck and welting share these datums, rather than piling two cushions up.
const bench = [
  [-.807,.056,.725,.782],[-.786,.139,.704,.799],[-.744,.192,.690,.812],
  [-.672,.214,.684,.816],[-.600,.220,.681,.810],[-.548,.213,.679,.794],
  [-.493,.202,.677,.770],[-.414,.188,.676,.750],[-.332,.176,.678,.744],
  [-.270,.159,.683,.748],[-.224,.137,.687,.750],[-.185,.100,.694,.741],[-.158,.041,.704,.727],
] as const;
function seatSection(z:number) {
  const i=bench.findIndex((s,i)=>i>0 && s[0]>=z), j=i<0?bench.length-1:i;
  const a=bench[j-1], b=bench[j], t=THREE.MathUtils.clamp((z-a[0])/(b[0]-a[0]),0,1);
  return [1,2,3].map(k=>THREE.MathUtils.lerp(a[k],b[k],t));
}
function upholsteredTop(z:number,u:number):P3 {
  const [w,lo,top]=seatSection(z), roll=THREE.MathUtils.smoothstep(z,-.585,-.41)*(1-THREE.MathUtils.smoothstep(z,-.27,-.158));
  return [u*w, top+(top-lo)*((.08+.24*roll)*4*u*u*(1-u*u)-.19*u**8),z];
}
export function scooterBench(b:VillaModelBuilder, vinyl:(g:THREE.BufferGeometry)=>THREE.Material, binding:THREE.Material, strap:THREE.Material, rivet:THREE.Material) {
  const ring=(s:typeof bench[number]):P3[]=>{
    const [z,w,lo,top]=s, h=top-lo;
    return [[-w*.86,lo,z],[-w*.98,lo+h*.17,z],[-w,lo+h*.54,z],
      ...[-.97,-.78,-.48,0,.48,.78,.97].map(u=>upholsteredTop(z,u)),
      [w,lo+h*.54,z],[w*.98,lo+h*.17,z],[w*.86,lo,z]];
  };
  const g=sectionLoft(bench.map(ring));b.geometry(g,vinyl(g));
  // Each welt follows the actual lower material turn. Leave the front skirt
  // clean where the thighs pass. The grab strap bears *on* the raised section.
  for(const side of [-1,1]) {
    const line=bench.map(([z,w,lo,top]):P3=>[side*(w+.001),lo+(top-lo)*.54,z]);
    b.geometry(bentRail(line,.0031,6),binding);
  }
  const bandZ=-.546;
  const across=[-1,-.97,-.78,-.48,0,.48,.78,.97,1];
  const section=(u:number):P3[]=>[[-.014,.001],[.014,.001],[.015,.004],[-.015,.004]].map(([fore,lift])=>{
    const z=bandZ+fore,[w,lo,top]=seatSection(z);
    if(Math.abs(u)===1) return [Math.sign(u)*(w+lift),lo+(top-lo)*.33,z];
    const p=upholsteredTop(z,u);return [p[0]+Math.sign(u)*lift*Math.abs(u)**4,p[1]+lift,z];
  });
  b.geometry(sectionLoft(across.map(section)),strap);
  const [w,lo,hi]=seatSection(bandZ);for(const side of [-1,1])b.cylinder(side*(w+.005),lo+(hi-lo)*.36,bandZ,.0058,.0058,.004,rivet,[0,0,Math.PI/2],10);
}

// An enamel pressing wraps around the steering head and flares at the rider's
// shins. Longitudinal folds, edge returns and the inner liner are true surfaces.
const shield = [
  [.306,.148,.260,.355],[.359,.173,.259,.385],[.444,.210,.271,.436],
  [.553,.236,.287,.477],[.655,.243,.301,.501],[.745,.238,.325,.508],
  [.817,.224,.350,.499],[.861,.204,.365,.485],[.894,.169,.378,.477],
  [.924,.106,.389,.467],[.937,.063,.396,.460],
] as const;
function shieldAt(y:number,u:number):P3 {
  let i=1;while(i<shield.length-1 && y>shield[i][0])i++;
  const a=shield[i-1],b=shield[i],v=THREE.MathUtils.clamp((y-a[0])/(b[0]-a[0]),0,1);
  const w=THREE.MathUtils.lerp(a[1],b[1],v),edge=THREE.MathUtils.lerp(a[2],b[2],v),nose=THREE.MathUtils.lerp(a[3],b[3],v);
  const x=Math.abs(u), wing=1-x*x, fold=.013*Math.exp(-(((x-.60)/.19)**2))*Math.sin(Math.PI*(y-.306)/.631);
  return [u*w,y+.012*wing,edge+(nose-edge)*wing-fold];
}
export function scooterLegShield(b:VillaModelBuilder,enamel:THREE.Material,liner:THREE.Material,trim:THREE.Material) {
  const xs=[-1,-.92,-.77,-.61,-.43,-.24,0,.24,.43,.61,.77,.92,1];
  const outer=shield.map(([y])=>{
    const front=xs.map(u=>shieldAt(y,u));
    const rear=[...xs].reverse().map((u):P3=>{const p=shieldAt(y,u);return [p[0],p[1]-.002,p[2]-.017-.010*Math.abs(u)**4];});
    return [...front,...rear];
  });
  b.geometry(sectionLoft(outer),enamel);
  // Rolled safety bead on the free edge, not a vertical tube floating in front of it.
  for(const side of [-1,1])b.geometry(bentRail(shield.map(([y]):P3=>{const p=shieldAt(y,side);return [p[0],p[1]-.001,p[2]-.009];}),.0043,6),trim);
  const inner=shield.slice(2,-2).map(([y])=>{
    const fore=[-1,-.80,-.48,0,.48,.80,1].map((u):P3=>{const p=shieldAt(y,u*.81);return [p[0],p[1],p[2]-.020-.013*(1-u*u)];});
    return [...fore,...[...fore].reverse().map(([x,h,z]):P3=>[x,h,z+.006])];
  });b.geometry(sectionLoft(inner),liner);
  // Formed horn cover: wide at the base and waisted at the steering head. Air
  // leaves sideways past the lanced lips; the dark plenum lies *behind* them.
  const rib=(y:number,w:number,depth:number):P3[]=>[[-1,0],[-.96,.46],[-.75,.83],[0,1],[.75,.83],[.96,.46],[1,0],[.80,-.12],[-.80,-.12]].map(([x,z])=>{
    const p=shieldAt(y,0);return [x*w,p[1],p[2]-.002+depth*z-.008*x*x];
  });
  const vents=[.485,.518,.551];
  let last=rib(.411,.026,.015);const base=rib(.449,.061,.027);
  b.geometry(sectionLoft([last,base],true,false,[0,1,0]),enamel);last=base;
  for(const y of vents){
    const w=.068-(y-.5)*.047, depth=.040+(y-.5)*.068;
    const low=rib(y-.006,w,depth), lip=rib(y+.006,w,depth+.006), high=rib(y+.013,w,depth);
    b.geometry(sectionLoft([last,low],false,true,[0,1,0]),enamel);
    // Only the two rolled shoulders and the recessed backing bridge the slot.
    // A ray through the mouth finds the plenum below the steel ahead of it.
    const cheeks=(r:P3[],s:number)=>s<0?[r[0],r[1],r[2],[r[2][0],r[2][1],r[0][2]-.002] as P3]:[r[4],r[5],r[6],[r[4][0],r[4][1],r[6][2]-.002] as P3];
    for(const side of [-1,1])b.geometry(sectionLoft([cheeks(low,side),cheeks(lip,side)],false,false,[0,1,0]),enamel);
    b.geometry(sectionLoft([lip,high],true,false,[0,1,0]),enamel);last=high;
  }
  b.geometry(sectionLoft([last,rib(.639,.058,.045),rib(.743,.038,.040),rib(.831,.027,.029),rib(.871,.015,.013)],false,true,[0,1,0]),enamel);
  const backing=(y:number):P3[]=>{const p=shieldAt(y,0);return [[-.059,p[1],p[2]+.005],[.059,p[1],p[2]+.005],[.059,p[1],p[2]],[0,p[1],p[2]-.002],[-.059,p[1],p[2]]];};
  b.geometry(sectionLoft([backing(.470),backing(.524),backing(.569)]),liner);
}

// Small moving instrument on the fork. The graduated sweep is in km/h; the
// pointer and the tick marks use this same tilted plane. No texture upload or HUD.
const dialAngle=.36, sin=Math.sin(dialAngle), cos=Math.cos(dialAngle), y0=.941, z0=-.222, cx=-.026;
const instrumentPoint=(x:number,fore:number,lift:number):P3=>[x,y0+fore*sin+lift*cos,z0+fore*cos-lift*sin];
export function scooterInstruments(b:VillaModelBuilder, fork:THREE.Object3D, dark:THREE.Material, rubber:THREE.Material, metal:THREE.Material, ivory:THREE.Material) {
  const face=(w:number,d:number,lift:number,r:number)=>roundedLoop(w,d,r,3).map(([x,z]):P3=>instrumentPoint(x,z,lift));
  b.geometry(sectionLoft([face(.182,.095,-.041,.027),face(.195,.105,-.014,.030),face(.187,.101,-.003,.030),face(.170,.082,-.007,.027)],true,false),dark);
  b.geometry(sectionLoft([face(.175,.086,-.006,.027),face(.170,.082,-.005,.026),face(.164,.078,-.010,.024)],false,false),metal);
  b.geometry(sectionLoft([face(.164,.078,-.010,.024),face(.162,.076,-.011,.024)],false,true,[0,cos,-sin]),rubber);
  for(let j=0;j<=10;j++){
    const a=scooterNeedleAngle(25*j/10/3.6),outer=.032,inner=j%2?.029:.025;
    b.beam(instrumentPoint(cx+inner*Math.sin(a),inner*Math.cos(a),-.009),instrumentPoint(cx+outer*Math.sin(a),outer*Math.cos(a),-.009),j%2?.00085:.0015,metal,5);
  }
  const icon=(w:number,h:number,lift:number)=>roundedLoop(w,h,.002,2).map(([x,z]):P3=>instrumentPoint(.047+x,z,lift));
  b.geometry(sectionLoft([icon(.041,.018,-.0095),icon(.041,.018,-.0078),icon(.035,.012,-.0078)],false,false,[0,cos,-sin]),metal);
  for(const dx of [-.011,0,.011])b.beam(instrumentPoint(.047+dx,-.003,-.008),instrumentPoint(.047+dx,.003,-.008),.0012,metal,5);
  const dial=new THREE.Group();dial.name='scooter-gauge-mount';dial.position.set(...instrumentPoint(cx,0,-.005));dial.rotation.x=-dialAngle;fork.add(dial);
  const rotor=new THREE.Mesh(sectionLoft([0,.0017].map(y=>[[-.003,y,-.006],[.003,y,-.006],[.0027,y,.004],[.00065,y,.027],[-.00065,y,.027],[-.0027,y,.004]] as P3[])),ivory);
  rotor.name='scooter-speed-pointer';rotor.castShadow=false;rotor.receiveShadow=true;dial.add(rotor);return rotor;
}
// From the seat the fork's +X projects left. Sweep clockwise from the lower
// left zero mark through vertical to the right, including in reverse travel.
export const scooterNeedleAngle=(metresPerSecond:number)=>Math.PI*2/3-Math.PI*4/3*THREE.MathUtils.clamp(Math.abs(metresPerSecond)*3.6/25,0,1);

/** A rider's fingers bear against a broad cast lever, not the tip of a wire.
 * The curved return and the pivot boss sit outside the switch pod. */
export function scooterHandControl(b:VillaModelBuilder,side:number,body:THREE.Material,keys:THREE.Material,metal:THREE.Material){
  const pod=(x:number,w:number,h:number)=>roundedLoop(w,h,.009,2).map(([z,y]):P3=>[side*x,.850+y,-.231+z+.15*y]);
  b.geometry(sectionLoft([pod(.204,.046,.041),pod(.215,.056,.052),pod(.239,.056,.052),pod(.251,.045,.042)]),body);
  const button=(x:number,up:number)=>roundedLoop(.019,.008,.003,1).map(([z,y]):P3=>[side*x,.869+up+y,-.246+z]);
  b.geometry(sectionLoft([button(.216,0),button(.218,.004),button(.236,.003)]),keys);
  const lever=(x:number,y:number,z:number,r:number,h:number):P3[]=>ovalLoop(r,h,8,.71).map(([a,b])=>[side*x,y+b,z+a]);
  b.geometry(sectionLoft([lever(.211,.840,-.253,.014,.009),lever(.229,.838,-.268,.012,.008),lever(.258,.833,-.285,.010,.007),
    lever(.309,.830,-.289,.008,.006),lever(.346,.833,-.282,.007,.006),lever(.361,.837,-.277,.0075,.006),lever(.366,.837,-.275,.003,.003)]),metal);
}

/** The ferrule wraps the stem. Mould parting edge and convex silver meet at the
 * same gasket. The asymmetric outer corner gives a useful lateral sightline. */
export function scooterMirror(b:VillaModelBuilder,side:number,dark:THREE.Material,glass:THREE.Material) {
  const loop=(scale:number,depth:number):P3[]=>ovalLoop(.066*scale,.041*scale,20,.78).map(([u,v]):P3=>{
    const w=u/.066;return [side*(.359+u),1.047+v+.014*w,-.134+depth+.021*w-.006*(v/.041)];
  });
  b.geometry(sectionLoft([loop(.30,.017),loop(.79,.017),loop(1,.006),loop(1,-.008),loop(.90,-.009)],true,false,[0,0,-1]),dark);
  b.geometry(sectionLoft([loop(.90,-.009),loop(.64,-.012),loop(.26,-.014)],false,true,[0,0,-1]),glass);
}
