import * as T from 'three';
import {createViewHand,poseButterflyKnifeGrip} from './csViewHands.js';

const satin=new T.MeshStandardMaterial({color:0x92999a,metalness:.72,roughness:.36});
const bevel=new T.MeshStandardMaterial({color:0xaeb8b5,metalness:.8,roughness:.28});
const liner=new T.MeshStandardMaterial({color:0x3e4546,metalness:.65,roughness:.43});
const gripMaterial=new T.MeshStandardMaterial({color:0x323735,metalness:.05,roughness:.83});

// Authored balisong geometry. The safe handle, blade and bite handle form a
// two-hinge linkage; no part scales, detaches or rotates about its mesh centre.
export function buildButterflyKnife(r,{part,profile,mesh,rod,screw,batch,M}){
  const frame=part(r.core,'butterfly-grip-frame');r.knifeFrame=frame;
  const pivot=part(frame,'butterfly-grip-pivot',0,0,-.011);r.knifePivot=pivot;
  const body=part(pivot,'butterfly-linkage',0,0,.011);
  const safe=part(body,'butterfly-safe-handle',0,.051,-.011);
  const blade=part(body,'butterfly-blade-hinge',0,.051,-.011);r.butterflyBlade=blade;
  const bite=part(blade,'butterfly-bite-handle',0,0,.022);r.butterflyHandle=bite;
  function handle(g,latch=false){
    const shape=new T.Shape();shape.moveTo(-.007,.007);shape.quadraticCurveTo(-.014,.0,-.009,-.022);
    shape.bezierCurveTo(-.018,-.060,-.019,-.097,-.012,-.137);shape.lineTo(.001,-.139);
    shape.bezierCurveTo(-.005,-.099,-.004,-.060,.004,-.020);shape.quadraticCurveTo(.011,-.001,.007,.006);shape.closePath();
    const outline=shape.getPoints(16).map(p=>[p.x,p.y]);
    const holes=[[-.003,-.019],[-.005,-.031],[-.008,-.116],[-.007,-.128]].map(([z,y])=>Array.from({length:16},(_,i)=>[z+Math.cos(i*Math.PI/8)*.0022,y+Math.sin(i*Math.PI/8)*.0022]));
    for(const side of [-1,1]){
      const plate=profile(g,outline,.0018,satin,holes);plate.position.x=side*.0055;
      const inset=new T.Shape();inset.moveTo(-.007,-.043);inset.bezierCurveTo(-.013,-.071,-.014,-.090,-.009,-.106);inset.quadraticCurveTo(-.005,-.110,-.003,-.104);inset.bezierCurveTo(-.006,-.080,-.002,-.057,-.003,-.044);inset.closePath();
      const panel=profile(g,inset.getPoints(14).map(p=>[p.x,p.y]),.0010,gripMaterial);panel.position.x=side*.0072;
      screw(g,side*.008,0,0,.0043);screw(g,side*.008,-.134,-.006,.0017);
      for(let j=0;j<8;j++)rod(g,[side*.0077,-.005-j*.0021,.006],[side*.0077,-.006-j*.0021,.008],.0004,liner);
    }
    // Open U-channel leaves room for the blade between the two steel liners.
    rod(g,[-.006,-.133,-.006],[.006,-.133,-.006],.0032,liner);
    if(latch){const tab=part(g,'butterfly-latch',0,-.137,-.006);rod(tab,[0,0,0],[0,-.012,.002],.0017,satin);rod(tab,[-.004,-.012,.002],[.004,-.012,.002],.0017,satin);}
    batch(g);
  }
  handle(safe);handle(bite,true);
  const bladeMesh=part(blade,'butterfly-blade');r.knifeBlade=bladeMesh;
  const shape=new T.Shape();shape.moveTo(-.004,-.009);shape.lineTo(.026,-.006);shape.lineTo(.021,.012);
  shape.bezierCurveTo(.013,.035,.014,.066,.017,.087);shape.quadraticCurveTo(.005,.108,.007,.141);
  shape.bezierCurveTo(-.001,.130,-.012,.107,-.011,.080);shape.bezierCurveTo(-.010,.060,-.004,.038,-.004,.025);shape.closePath();
  profile(bladeMesh,shape.getPoints(24).map(p=>[p.x,p.y]),.0015,bevel);
  const flat=new T.Shape();flat.moveTo(.0,-.006);flat.lineTo(.022,-.005);flat.lineTo(.017,.012);
  flat.bezierCurveTo(.009,.035,.010,.066,.013,.087);flat.quadraticCurveTo(.003,.110,.007,.132);
  flat.bezierCurveTo(.003,.120,-.006,.100,-.006,.078);flat.lineTo(.002,.030);flat.closePath();
  profile(bladeMesh,flat.getPoints(20).map(p=>[p.x,p.y]),.0030,satin);
  // Narrow recessed fuller, jimped ricasso, tang pin and pivot hardware.
  for(const side of [-1,1]){
    const groove=profile(bladeMesh,[[.004,.037],[.0055,.037],[.011,.083],[.0095,.085]],.00035,M.dark);groove.position.x=side*.0028;
    screw(bladeMesh,side*.005,.008,.012,.0018);
  }
  for(let i=0;i<4;i++)rod(bladeMesh,[-.003,.026+i*.0026,-.006],[.003,.026+i*.0026,-.006],.0007,liner);
  batch(bladeMesh);bladeMesh.scale.y=.90;
  const hand=createViewHand(M.glove,'r'),contact=poseButterflyKnifeGrip(hand,{});
  r.knifePalm=contact.palm.clone();r.knifeHandRotation=hand.group.quaternion.clone();hand.mesh.geometry.dispose();hand.skeleton.dispose();
  r.knifeRest=pivot.quaternion.clone();r.knifeTip=new T.Vector3(0,.141*.90,.007);r.restLeft.set(-.27,-.05,.025);
  frame.rotation.set(.06,1.05,.43,'ZYX');r.restRight.copy(r.knifePalm).applyQuaternion(frame.quaternion);
  r.muzzle.copy(r.knifeTip).add(blade.position).applyQuaternion(frame.quaternion);
}

const curve=(t,keys)=>{if(t<=keys[0][0])return keys[0][1];for(let i=1;i<keys.length;i++)if(t<=keys[i][0]){const [a,x]=keys[i-1],[b,y]=keys[i],u=(t-a)/(b-a);return x+(y-x)*u*u*(3-2*u);}return keys.at(-1)[1];};
const env=(t,a,b,c,d)=>curve(t,[[a,0],[b,1],[c,1],[d,0]]);
const grip=(p=.06,y=1.05,r=.43)=>new T.Quaternion().setFromEuler(new T.Euler(p,y,r,'ZYX'));
export const BUTTERFLY_DEPLOY_DURATION=1.05;
export const BUTTERFLY_INSPECT_DURATION=3.4;
export const BUTTERFLY_DRAW_CUES=[{at:.07,sound:'draw'}];
export const BUTTERFLY_INSPECT_CUES=[{at:.03,sound:'inspect-start'},{at:.63,sound:'inspect-end'}];
// Authored alternatives, not extracted Valve tracks or original probabilities.
// Choose once at action start; the sampler must never draw random numbers.
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
    const t=deployProgress,raise=1-curve(t,[[0,0],[.20,1],[1,1]]),flip=env(t,.04,.16,.64,.82);
    pose.offset[0]+=.055*raise-.040*flip;pose.offset[1]-=.18*raise-.060*flip;pose.offset[2]+=.01*raise;
    // Release the free handle, wrist turnover, then a positive catch. The
    // whole knife rolls about the retained index grip, not just its blade.
    pose.butterflyBlade=curve(t,[[0,Math.PI],[.10,Math.PI],[.24,1.0],[.39,0],[1,0]]);
    pose.butterflyHandle=curve(t,[[0,Math.PI],[.10,Math.PI],[.23,1.9],[.37,.65],[.49,.65],[.66,0],[1,0]]);
    pose.knifeSpin=curve(t,[[0,0],[.26,0],[.39,-1.6],[.51,-4.6],[.64,-Math.PI*2],[1,-Math.PI*2]]);
    pose.knifeOpen=1-curve(t,[[0,0],[.61,0],[.79,1],[1,1]]);pose.knifeThumb=pose.knifeOpen*.70;
    q.slerp(grip(-.12,1.20,-.55),flip);pose.knifeLowerLeft=.12*flip;
    if(butterflyDrawVariant===1){
      // Wrist opening: the safe handle stays in the hand. Free handle rebounds
      // once before the fingers close, without an index rollover.
      pose.knifeSpin=0;
      pose.butterflyHandle=curve(t,[[0,Math.PI],[.10,Math.PI],[.28,.22],[.40,.88],[.54,.32],[.66,0],[1,0]]);
      q.copy(grip()).slerp(grip(.18,1.35,-.30),flip);
      pose.offset[0]+=.030*flip;pose.offset[1]-=.025*flip;
    }
  }else if(shotAge>=0&&shotAge<(knifeHeavy?.85:.48)){
    const t=shotAge/(knifeHeavy?.85:.48),strike=curve(t,[[0,0],[.10,.1],[.27,1],[.43,.85],[1,0]]);
    pose.knifeAttack=strike;pose.offset[0]-=(knifeHeavy?.09:.26)*strike;pose.offset[1]+=(knifeHeavy?.045:.026)*strike;pose.offset[2]-=(knifeHeavy?.20:.09)*strike;
    pose.rotation=knifeHeavy?[.06*strike,.13*strike,-.12*strike]:[.10*strike,.25*strike,.85*strike];
    if(knifeHeavy)q.slerp(grip(-.1,1.3,-.88),strike);
  }else if(inspectProgress>=0&&inspectProgress<1&&shotAge>.5){
    const t=inspectProgress,lift=env(t,0,.14,.84,1),present=env(t,.23,.34,.77,.91),roll=env(t,.045,.105,.235,.32)+env(t,.65,.70,.81,.90);
    pose.offset[0]-=.075*lift;pose.offset[1]+=.105*lift;pose.offset[2]+=.055*present;
    // Two brief finger rolls frame a long, stable fanned inspection. The
    // visible retained handle rotates with the blade around the index pinch.
    pose.knifeSpin=curve(t,[[0,0],[.055,0],[.115,-1.45],[.185,-4.85],[.26,-Math.PI*2],[.66,-Math.PI*2],[.72,-7.9],[.80,-11.3],[.86,-Math.PI*4],[1,-Math.PI*4]]);
    pose.butterflyBlade=curve(t,[[0,0],[.14,.18],[.27,0],[.72,0],[.79,.16],[.90,0],[1,0]]);
    pose.butterflyHandle=curve(t,[[0,0],[.045,.65],[.12,1.0],[.20,.24],[.30,1.05],[.65,1.05],[.71,1.0],[.80,.28],[.88,0],[1,0]]);
    pose.knifeOpen=Math.max(roll,.70*present);pose.knifeThumb=pose.knifeOpen*.80;
    q.slerp(grip(-.03,1.50,-.48),lift);q.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),-.16*roll));
    pose.knifeLowerLeft=.20*lift;pose.knifeElbowIn=.10*lift;
    if(butterflyInspectVariant===1){
      // Hinge-focused inspection: fan the free handle during the presentation,
      // followed by one index roll on the way back to the ready grip.
      pose.knifeSpin=curve(t,[[0,0],[.66,0],[.72,-1.62],[.80,-5.02],[.86,-Math.PI*2],[1,-Math.PI*2]]);
      pose.butterflyBlade=curve(t,[[0,0],[.14,.12],[.27,0],[.72,0],[.79,.16],[.90,0],[1,0]]);
      pose.butterflyHandle+=.24*env(t,.33,.41,.45,.53);
      q.copy(grip()).slerp(grip(.06,1.32,-.32),lift);
    }else if(butterflyInspectVariant===2){
      // Extra middle rollover: open the fingers before the rotation and catch
      // afterwards. All three rigid pieces retain their two physical hinges.
      const middle=env(t,.32,.36,.56,.62);
      pose.knifeSpin-=Math.PI*2*curve(t,[[0,0],[.36,0],[.46,.5],[.56,1],[1,1]]);
      pose.knifeOpen=Math.max(pose.knifeOpen,middle);pose.knifeThumb=pose.knifeOpen*.80;
      pose.butterflyHandle-=.55*middle;
      pose.offset[1]+=.018*middle;
    }
  }
  pose.knifeGrip=q.toArray();return pose;
}
