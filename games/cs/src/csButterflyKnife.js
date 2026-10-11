import * as T from 'three';
import {createViewHand,poseButterflyKnifeGrip} from './csViewHands.js';
import {butterflyMaterials} from './csButterflyMaterials.js';

const {satin,bevel,liner,grip:gripMaterial}=butterflyMaterials();
const hingeDistance=.016,bladeHalf=.0016,edgeHalf=.00012;
const circle=(z,y,r,n=20)=>Array.from({length:n},(_,i)=>[z+Math.cos(i*2*Math.PI/n)*r,y+Math.sin(i*2*Math.PI/n)*r]);

// Millimetre-scale knife parts must not inherit the firearm profile helper's
// fixed 1.2 mm bevel. Width is the flat stock thickness, excluding this bevel.
function knifeProfile(g,points,width,material,holes=[],edge=.00018){
  const sh=new T.Shape();points.forEach(([z,y],i)=>i?sh.lineTo(z,y):sh.moveTo(z,y));sh.closePath();
  for(const ring of holes){const hole=new T.Path();ring.forEach(([z,y],i)=>i?hole.lineTo(z,y):hole.moveTo(z,y));hole.closePath();sh.holes.push(hole);}
  const geo=new T.ExtrudeGeometry(sh,{depth:width,bevelEnabled:edge>0,bevelSize:edge,bevelThickness:edge,bevelSegments:2,steps:1});
  geo.rotateY(-Math.PI/2);geo.translate(width/2,0,0);
  const mesh=new T.Mesh(geo,material);g.add(mesh);return mesh;
}

// One closed ground blade: broad flat faces, sloping bevels, a thin real edge,
// and two bored pivot holes. There is no bright slab hidden under a second slab.
function groundBlade(outline){
  const outer=outline.map(([z,y])=>new T.Vector2(z,y));
  const inner=outer.map(p=>new T.Vector2(.007+(p.x-.007)*.78,.050+(p.y-.050)*.94));
  const rim=outer.map(p=>{const tang=1-T.MathUtils.smoothstep(p.y,.015,.027),spine=T.MathUtils.smoothstep(p.x,.006,.010);return edgeHalf+(bladeHalf-edgeHalf)*tang+(.00105-edgeHalf)*spine*(1-tang);});
  const holes=[0,hingeDistance].map(z=>circle(z,0,.00155).map(p=>new T.Vector2(...p)));
  const points=[[],[]],xyz=(p,x)=>new T.Vector3(x,p.y,p.x);
  function triangle(a,b,c,normal,material){
    if(new T.Vector3().crossVectors(b.clone().sub(a),c.clone().sub(a)).dot(normal)<0)[b,c]=[c,b];
    points[material].push(...a.toArray(),...b.toArray(),...c.toArray());
  }
  function quad(a,b,c,d,normal,material){triangle(a,b,c,normal,material);triangle(a,c,d,normal,material);}
  const capPoints=[...inner,...holes.flat()];
  for(const side of [-1,1]){
    const normal=new T.Vector3(side,0,0);
    for(const [a,b,c] of T.ShapeUtils.triangulateShape(inner,holes))triangle(xyz(capPoints[a],side*bladeHalf),xyz(capPoints[b],side*bladeHalf),xyz(capPoints[c],side*bladeHalf),normal,0);
    for(let i=0;i<outer.length;i++){
      const j=(i+1)%outer.length;
      quad(xyz(inner[i],side*bladeHalf),xyz(inner[j],side*bladeHalf),xyz(outer[j],side*rim[j]),xyz(outer[i],side*rim[i]),normal,1);
    }
  }
  const direction=T.ShapeUtils.isClockWise(outer)?-1:1;
  for(let i=0;i<outer.length;i++){
    const j=(i+1)%outer.length,a=outer[i],b=outer[j],normal=new T.Vector3(0,-(b.x-a.x),b.y-a.y).multiplyScalar(direction);
    quad(xyz(a,-rim[i]),xyz(b,-rim[j]),xyz(b,rim[j]),xyz(a,rim[i]),normal,1);
  }
  for(const hole of holes){
    const center=hole.reduce((v,p)=>v.add(p),new T.Vector2()).multiplyScalar(1/hole.length);
    for(let i=0;i<hole.length;i++){
      const a=hole[i],b=hole[(i+1)%hole.length],normal=new T.Vector3(0,center.y-(a.y+b.y)/2,center.x-(a.x+b.x)/2);
      quad(xyz(a,-bladeHalf),xyz(b,-bladeHalf),xyz(b,bladeHalf),xyz(a,bladeHalf),normal,0);
    }
  }
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(points.flat(),3));geo.computeVertexNormals();
  geo.addGroup(0,points[0].length/3,0);geo.addGroup(points[0].length/3,points[1].length/3,1);
  return geo;
}

// Authored balisong. Both hinge axes are X; the retained handle is fixed to the
// hand. The free handle travels around the upper side of that retained handle.
export function buildButterflyKnife(r,{part,mesh,rod,batch,M}){
  const frame=part(r.core,'butterfly-grip-frame');r.knifeFrame=frame;
  const pivot=part(frame,'butterfly-grip-pivot',0,0,-.011);r.knifePivot=pivot;
  const body=part(pivot,'butterfly-linkage',0,0,.011);
  const safe=part(body,'butterfly-safe-handle',0,.051,-.011);
  const blade=part(body,'butterfly-blade-hinge',0,.051,-.011);r.butterflyBlade=blade;
  const bite=part(blade,'butterfly-bite-handle',0,0,hingeDistance);r.butterflyHandle=bite;
  function fastener(g,y,radius){
    rod(g,[-.0059,y,0],[.0059,y,0],.0013,liner);
    for(const side of [-1,1]){
      const head=mesh(g,new T.CylinderGeometry(radius,radius,.0009,20),satin,side*.00605,y,0);head.rotation.z=Math.PI/2;
      rod(g,[side*.00653,y-.00035,-radius*.50],[side*.00653,y+.00035,radius*.50],.00012,liner);
    }
  }
  function handle(g,latch=false){
    const shape=new T.Shape();shape.moveTo(-.0046,.0038);shape.quadraticCurveTo(-.004,.0063,0,.0063);shape.quadraticCurveTo(.0065,.0063,.0065,.0005);
    shape.lineTo(.0065,-.012);shape.bezierCurveTo(.0068,-.050,.0074,-.090,.0069,-.127);shape.quadraticCurveTo(.0066,-.138,.0032,-.138);
    shape.lineTo(-.0032,-.138);shape.quadraticCurveTo(-.0066,-.138,-.0069,-.127);shape.bezierCurveTo(-.0074,-.090,-.0068,-.050,-.0065,-.012);shape.quadraticCurveTo(-.0065,.001,-.0046,.0038);shape.closePath();
    const outline=shape.getPoints(12).map(p=>[p.x,p.y]);
    const holes=[circle(0,0,.00155),...[-.029,-.041,-.110,-.122].map(y=>circle(0,y,.00155))];
    for(const side of [-1,1]){
      const plate=knifeProfile(g,outline,.0016,satin,holes);plate.position.x=side*.0046;plate.name='butterfly-handle-plate';
      const inset=new T.Shape();inset.moveTo(-.0038,-.052);inset.quadraticCurveTo(0,-.050,.0038,-.052);inset.lineTo(.0042,-.097);inset.quadraticCurveTo(0,-.102,-.0042,-.097);inset.closePath();
      const panel=knifeProfile(g,inset.getPoints(10).map(p=>[p.x,p.y]),.0007,gripMaterial,[],.00010);panel.position.x=side*.0059;
      for(let j=0;j<5;j++)rod(g,[side*.00636,-.060-j*.007,-.0028],[side*.00636,-.058-j*.007,.0028],.00014,liner);
    }
    // The end spacer is beyond the folded blade; the pivot axle passes through
    // real bores in the blade and both steel plates rather than through stock.
    rod(g,[-.0046,-.133,0],[.0046,-.133,0],.00225,liner);
    fastener(g,0,.0027);fastener(g,-.133,.00175);
    if(latch){
      // Released latch in its open detent. It is not falsely shown bridging the
      // two handles while the hand is opening the knife.
      const tab=part(g,'butterfly-latch',0,-.134,0);
      rod(tab,[-.003,-.001,0],[.003,-.001,0],.0011,liner);
      rod(tab,[0,-.001,0],[0,-.013,.003],.00085,satin);
      rod(tab,[-.0035,-.013,.003],[.0035,-.013,.003],.00085,satin);
    }
    batch(g);
  }
  handle(safe);handle(bite,true);
  const bladeMesh=part(blade,'butterfly-blade');r.knifeBlade=bladeMesh;
  const shape=new T.Shape();shape.moveTo(-.0045,-.0065);shape.lineTo(.0205,-.0065);shape.quadraticCurveTo(.022,0,.020,.010);
  shape.bezierCurveTo(.014,.034,.014,.061,.016,.083);shape.quadraticCurveTo(.013,.102,.006,.128);
  shape.bezierCurveTo(-.003,.113,-.006,.095,-.005,.075);shape.bezierCurveTo(-.004,.055,-.0015,.038,-.002,.022);shape.lineTo(-.0045,.006);shape.closePath();
  const outline=shape.getPoints(18).slice(0,-1).map(p=>[p.x,p.y]);
  const ground=mesh(bladeMesh,groundBlade(outline),[satin,bevel]);ground.name='butterfly-ground-blade';
  // A fine surface etch, not an extruded imitation of a recessed fuller. Its
  // 25-micron relief remains well inside the open handle channel.
  for(const side of [-1,1]){
    const etch=knifeProfile(bladeMesh,[[.0058,.036],[.00625,.036],[.010,.082],[.00955,.082]],.00002,liner,[],0);etch.position.x=side*.001615;etch.name='butterfly-blade-etch';
  }
  const hand=createViewHand(M.glove,'r'),contact=poseButterflyKnifeGrip(hand,{});
  r.knifePalm=contact.palm.clone();r.knifeHandRotation=hand.group.quaternion.clone();hand.mesh.geometry.dispose();hand.skeleton.dispose();
  pivot.rotation.y=Math.PI; // Keep the free handle on the open side of the wrist.
  r.knifeRest=pivot.quaternion.clone();r.knifeTip=new T.Vector3(0,.128,.006);r.restLeft.set(-.27,-.05,.025);
  frame.rotation.set(.06,1.05,.43,'ZYX');r.restRight.copy(r.knifePalm).applyQuaternion(frame.quaternion);
  blade.updateWorldMatrix(true,false);r.muzzle.copy(r.core.worldToLocal(blade.localToWorld(r.knifeTip.clone())));
}

const curve=(t,keys)=>{if(t<=keys[0][0])return keys[0][1];for(let i=1;i<keys.length;i++)if(t<=keys[i][0]){const [a,x]=keys[i-1],[b,y]=keys[i],u=(t-a)/(b-a);return x+(y-x)*u*u*(3-2*u);}return keys.at(-1)[1];};
const env=(t,a,b,c,d)=>curve(t,[[a,0],[b,1],[c,1],[d,0]]);
const grip=(p=.06,y=1.05,r=.43)=>new T.Quaternion().setFromEuler(new T.Euler(p,y,r,'ZYX'));
export const BUTTERFLY_DEPLOY_DURATION=1.05;
export const BUTTERFLY_INSPECT_DURATION=3.4;
export const BUTTERFLY_DRAW_CUES=[{at:.07,sound:'draw'}];
export const BUTTERFLY_INSPECT_CUES=[{at:.03,sound:'inspect-start'},{at:.63,sound:'inspect-end'}];
// Authored alternatives, not extracted Valve tracks or original probabilities.
export const BUTTERFLY_VARIANTS=Object.freeze({draw:2,inspect:3});
export function chooseButterflyVariant(action,random=Math.random){
  const count=BUTTERFLY_VARIANTS[action];
  if(!count)throw new Error('Unknown butterfly action: '+action);
  return Math.min(count-1,Math.max(0,Math.floor(random()*count)));
}
export function sampleButterflyMotion(pose,{deployProgress,inspectProgress,shotAge,knifeHeavy,butterflyDrawVariant=0,butterflyInspectVariant=0}){
  Object.assign(pose,{ejectAge:99,knifeSpin:0,knifeOpen:0,knifeThumb:0,knifeLowerLeft:0,knifeElbowIn:0,knifeAttack:0,butterflyBlade:0,butterflyHandle:0,knifeBaseOffset:[-.025,.015,-.16]});
  pose.offset=[...pose.knifeBaseOffset];pose.rotation=[0,0,0];const q=grip();
  if(deployProgress>=0&&deployProgress<1){
    const t=deployProgress,alternate=butterflyDrawVariant===1;
    const raise=1-curve(t,[[0,0],[.24,1],[1,1]]),turn=env(t,.04,.20,.59,.85);
    // Enter with the latch already released and the knife partially opened.
    // A full closed-to-open arc in this fixed view-grip would strike the cuff;
    // this actual clear path finishes the opening, without masking any pieces.
    const u=.40+.60*curve(t,alternate?[[0,0],[.09,0],[.30,.48],[.59,1],[1,1]]:[[0,0],[.10,0],[.36,.55],[.67,1],[1,1]]);
    // Negative blade opening takes the free pivot ABOVE the retained shaft.
    // Coupled angles move its handle outwards, up, then down on the other side.
    // The +2PI catch is physically the same orientation as the idle zero.
    pose.butterflyBlade=-Math.PI*(1-u);pose.butterflyHandle=Math.PI*(1+u);
    pose.offset[0]+=.040*raise-.018*turn;pose.offset[1]-=.17*raise-.025*turn;
    q.slerp(alternate?grip(.16,1.18,.22):grip(-.04,1.20,.12),turn);
    pose.knifeOpen=.22*env(t,.06,.18,.65,.81);pose.knifeThumb=.10*env(t,.06,.18,.65,.81);pose.knifeLowerLeft=.04*turn;
  }else if(shotAge>=0&&shotAge<(knifeHeavy?.85:.48)){
    const t=shotAge/(knifeHeavy?.85:.48),strike=curve(t,[[0,0],[.10,.1],[.27,1],[.43,.85],[1,0]]);
    pose.knifeAttack=strike;pose.offset[0]-=(knifeHeavy?.09:.26)*strike;pose.offset[1]+=(knifeHeavy?.045:.026)*strike;pose.offset[2]-=(knifeHeavy?.20:.09)*strike;
    pose.rotation=knifeHeavy?[.06*strike,.13*strike,-.12*strike]:[.10*strike,.25*strike,.85*strike];
    if(knifeHeavy)q.slerp(grip(-.1,1.3,-.88),strike);
  }else if(inspectProgress>=0&&inspectProgress<1&&shotAge>.5){
    const t=inspectProgress,lift=env(t,0,.18,.80,1),present=env(t,.18,.32,.70,.88);
    pose.offset[0]-=.040*lift;pose.offset[1]+=.065*lift;pose.offset[2]+=.024*present;
    let fan=env(t,.12,.27,.68,.84)*.48;
    if(butterflyInspectVariant===1)fan=env(t,.12,.30,.60,.83)*.68;
    if(butterflyInspectVariant===2)fan=.36*env(t,.10,.24,.37,.49)+.50*env(t,.46,.60,.72,.88);
    // Keep the safe handle in the closed grip. Only the free handle fans away
    // from it; there are no ungrounded index rolls or whole-knife spins.
    pose.butterflyHandle=-fan;pose.knifeOpen=.20*present;pose.knifeThumb=.09*present;
    q.slerp(butterflyInspectVariant===1?grip(.10,1.36,.22):grip(.03,1.27,.10),lift);
    pose.knifeLowerLeft=.10*lift;pose.knifeElbowIn=.04*lift;
  }
  pose.knifeGrip=q.toArray();return pose;
}
