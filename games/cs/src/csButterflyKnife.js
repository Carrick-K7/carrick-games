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

// Rigid balisong with two linked X hinges. Grip/contact ownership can transfer
// from the safe handle to the blade tang; no part changes length or scale.
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
// Compatibility game durations, NOT measured Valve animation durations. The
// UNKNOWNTech draw references are explicitly slow motion; WEBE's normal-speed
// inspect establishes phase order, not a native end boundary or hold-input rule.
export const BUTTERFLY_DEPLOY_DURATION=1.05;
export const BUTTERFLY_INSPECT_DURATION=3.4;
export const BUTTERFLY_DRAW_CUES=[{at:.07,sound:'draw'}];
export const BUTTERFLY_INSPECT_CUES=[{at:.03,sound:'inspect-start'},{at:.63,sound:'inspect-end'}];
// Reference scope: UNKNOWNTech irTzzUBfzGQ draw 1/2; WEBE 2vhjVz4wtgU
// 31–33s and H5gnk59aNRQ 15s establish ONE inspect family. No rare loops,
// third inspect or original selection probabilities have been verified.
export const BUTTERFLY_VARIANTS=Object.freeze({draw:2,inspect:1});
export const normalizeButterflyVariant=(action,value)=>action==='draw'&&value===1?1:0;
export function chooseButterflyVariant(action,random=Math.random){
  const count=BUTTERFLY_VARIANTS[action];
  if(!count)throw new Error('Unknown butterfly action: '+action);
  const value=random();return Number.isFinite(value)?Math.min(count-1,Math.max(0,Math.floor(value*count))):0;
}
export function sampleButterflyMotion(pose,{deployProgress,inspectProgress,shotAge,knifeHeavy,butterflyDrawVariant=0,butterflyInspectVariant=0}){
  Object.assign(pose,{ejectAge:99,knifeSpin:0,knifeYaw:0,knifeSeat:0,knifeThumbOut:0,knifeThumbSweep:0,knifeThumbPin:1,knifeContact:0,knifeIndexOpen:0,knifeSplay:0,knifeFingerFan:0,knifeOpen:0,knifeThumb:0,knifeLowerLeft:0,knifeElbowIn:0,knifeAttack:0,butterflyBlade:0,butterflyHandle:0,knifeBaseOffset:[-.07,.10,.06]});
  pose.offset=[...pose.knifeBaseOffset];pose.rotation=[0,0,0];const q=grip();
  if(deployProgress>=0&&deployProgress<1){
    const t=deployProgress,alternate=normalizeButterflyVariant('draw',butterflyDrawVariant)===1;
    const raise=1-curve(t,[[0,0],[.18,1],[1,1]]),turn=env(t,0,.16,.65,.94);
    // Closed entry → free handle up → blade opens → gather/regrip. Draw 2
    // explicitly releases the palm before the blade-down / handle-up phase.
    // These normalized knot times are authored, not the slow video's seconds.
    const u=curve(t,[[0,0],[.10,0],[.32,.50],[.60,1],[1,1]]);
    pose.butterflyBlade=-Math.PI*(1-u);pose.butterflyHandle=Math.PI*(1+u);
    pose.knifeYaw=-Math.PI*(1-curve(t,[[0,0],[.34,0],[.69,1],[1,1]]));
    pose.knifeSeat=.006*(1-curve(t,[[0,0],[.26,0],[.60,1],[1,1]]));
    pose.offset[0]+=.020*raise-.018*turn;pose.offset[1]+=.040*raise+.025*turn;
    const drawPalm=grip(.15,2.60,-.42).slerp(grip(.08,1.10,-.42),curve(t,[[0,0],[.10,0],[.24,1],[1,1]]));
    q.slerp(alternate?drawPalm:grip(-.12,1.75,-.30),turn);
    const release=env(t,.035,.10,.54,.79);
    pose.knifeOpen=release;pose.knifeThumb=.18*release;
    pose.knifeIndexOpen=(alternate?.25:.08)*release;pose.knifeSplay=.7*release;
    pose.knifeLowerLeft=.04*turn;
    if(alternate){
      // UNKNOWNTech early-52/53: free handle above, blade still down beside
      // the thumb. early-54: blade up with BOTH handles in a V over the palm.
      pose.butterflyBlade=curve(t,[[0,-Math.PI],[.29,-Math.PI],[.52,-.42],[.62,-.42],[.80,0],[1,0]]);
      pose.butterflyHandle=curve(t,[[0,Math.PI],[.10,Math.PI],[.25,2*Math.PI],[.29,2*Math.PI],[.52,2*Math.PI-.86],[.62,2*Math.PI-.86],[.80,2*Math.PI],[1,2*Math.PI]]);
      pose.knifeContact=env(t,.12,.24,.80,.92);pose.knifeFingerFan=pose.knifeContact;
      pose.knifeSpin=t<=.29?-Math.PI*pose.knifeContact:curve(t,[[.29,-Math.PI],[.52,0],[1,0]]);
      pose.knifeYaw=-Math.PI*(1-curve(t,[[0,0],[.12,0],[.24,1],[1,1]]));
      pose.knifeThumbOut=env(t,.02,.10,.52,.62);
      pose.knifeThumbSweep=env(t,.27,.36,.62,.70);
      pose.knifeThumbPin=curve(t,[[0,0],[.43,0],[.52,1],[1,1]]);
      // Do not slide the retained index or close the lower fingers through a
      // still-free shaft. Gather first (.80), transfer the joined pair (.92),
      // then catch. These are presentation phases, not new combat/input locks.
      pose.knifeOpen=env(t,.04,.10,.92,1);
      pose.knifeIndexOpen=curve(t,[[0,0],[.04,0],[.10,.8],[.24,.8],[.29,.1],[.80,.1],[.92,0],[1,0]]);
      pose.knifeThumb=.18*env(t,.04,.10,.80,.92);
    }
  }else if(shotAge>=0&&shotAge<(knifeHeavy?.85:.48)){
    const t=shotAge/(knifeHeavy?.85:.48),strike=curve(t,[[0,0],[.10,.1],[.27,1],[.43,.85],[1,0]]);
    pose.knifeAttack=strike;pose.offset[0]-=(knifeHeavy?.09:.26)*strike;pose.offset[1]+=(knifeHeavy?.045:.026)*strike;pose.offset[2]-=(knifeHeavy?.20:.09)*strike;
    pose.rotation=knifeHeavy?[.06*strike,.13*strike,-.12*strike]:[.10*strike,.25*strike,.85*strike];
    if(knifeHeavy)q.slerp(grip(-.1,1.3,-.88),strike);
  }else if(inspectProgress>=0&&inspectProgress<1&&shotAge>.5){
    const t=inspectProgress,lift=env(t,0,.15,.80,1);
    // One verified family, also for stale/invalid legacy inspect IDs. Wrist
    // edge → palm release → broad-face sweep → edge → tang-supported V hold.
    const present=env(t,.05,.16,.79,.97);
    pose.offset[0]-=.080*lift;pose.offset[1]+=.090*lift;pose.offset[2]+=.024*present;
    pose.knifeContact=env(t,.08,.14,.96,1);
    pose.butterflyBlade=curve(t,[[0,0],[.08,0],[.15,-.65],[.23,-1.05],[.30,-.05],[.44,-.28],[.77,-.28],[.96,0],[1,0]]);
    pose.butterflyHandle=curve(t,[[0,0],[.08,0],[.15,-1.35],[.23,-2.25],[.30,-.10],[.44,-.35],[.77,-.35],[.96,0],[1,0]]);
    pose.knifeSpin=curve(t,[[0,0],[.08,-.10],[.15,-.60],[.23,.15],[.30,-.12],[.44,0],[1,0]]);
    // Release through the edge-on sweep instead of briefly closing into the
    // rotating steel at .28. Re-open for return and catch only after gathering.
    pose.knifeOpen=curve(t,[[0,0],[.08,.25],[.15,1],[.32,1],[.44,.82],[.77,.82],[.80,1],[.96,1],[1,0]]);
    pose.knifeIndexOpen=.10*present;pose.knifeThumb=.18*present;pose.knifeSplay=present;pose.knifeFingerFan=present;
    const edge=env(t,.01,.075,.085,.15)+env(t,.23,.30,.32,.44);
    // Calibrated in the actual 62-degree weapon camera: yaw 2.8 made the
    // held blade edge-on and showed the back of the glove. Only the transient
    // roll uses that orientation; the sustained hold presents the broad face.
    // WEBE 32.5's held V is about 40 degrees in projection, not the former
    // 74-degree fan. These calibrated hinge angles retain the same tang pin;
    // the wrist roll puts BOTH handle ends down-left and the broad blade up-right.
    q.slerp(grip(.08,1.10,-.65),present).slerp(grip(-.10,2.80,-.10),Math.min(1,edge));
    pose.knifeLowerLeft=.10*lift;pose.knifeElbowIn=.04*lift;
  }
  pose.knifeGrip=q.toArray();return pose;
}
