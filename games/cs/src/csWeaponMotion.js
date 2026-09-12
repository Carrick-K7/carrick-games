import * as T from 'three';
import {DEPLOY,chargingGrip} from './csWeaponDeploy.js';

export function reloadKind(id){return id==='p90'?'top':id==='m249'?'belt':['m3','xm1014'].includes(id)?'shell':['usp','glock','deagle'].includes(id)?'pistol':['awp','scout'].includes(id)?'bolt':'magazine';}
function curve(t,keys){if(t<=keys[0][0])return keys[0][1];for(let i=1;i<keys.length;i++){if(t<=keys[i][0]){const [a,x]=keys[i-1],[b,y]=keys[i],u=(t-a)/(b-a),v=u*u*(3-2*u);return x+(y-x)*v;}}return keys.at(-1)[1];}
const envelope=(t,a,b,c,d)=>curve(t,[[a,0],[b,1],[c,1],[d,0]]);

export function reloadCues(id,empty=false,rounds=1){
  const kind=reloadKind(id);
  if(kind==='shell')return [{at:.06,sound:'cloth'},...Array.from({length:rounds},(_,i)=>({at:.20+(i+.8)*.60/rounds,sound:'shell'})),{at:.90,sound:id==='m3'?'bolt-close':'cloth'}];
  return [{at:.10,sound:'cloth'},...(kind==='belt'?[{at:.16,sound:'cover'}]:[]),{at:.24,sound:'mag-out'},{at:.70,sound:'mag-in'},...((empty||kind==='bolt')?[{at:.83,sound:'bolt-open'},{at:.92,sound:'bolt-close'}]:[]),{at:.98,sound:'cloth'}];
}
export function reloadLabel(id,t,en=false){const kind=reloadKind(id);if(en){if(kind==='shell')return t<.16?'Preparing':t<.82?'Loading shells':'Closing';if(kind==='belt')return t<.2?'Opening cover':t<.48?'Removing box':t<.75?'Loading box':'Closing up';return t<.17?'Releasing grip':t<.45?'Magazine out':t<.73?'Magazine in':t<.94?'Chambering':'Recovering';}if(kind==='shell')return t<.16?'准备装填':t<.82?'逐发装填':'复位';if(kind==='belt')return t<.2?'打开机匣盖':t<.48?'移出弹箱':t<.75?'装入弹箱':'闭合上膛';return t<.17?'移手解锁':t<.45?'取出弹匣':t<.73?'装入弹匣':t<.94?'复位上膛':'恢复持枪';}

// All animation samples depend only on action progress. Pause, low frame rates,
// weapon switches and reload cancellation therefore cannot leave parts displaced.
export function sampleWeaponMotion(id,{reloadProgress=-1,empty=false,rounds=1,cycleProgress=-1,shotAge=99,ammo=1,inspectProgress=-1,deployProgress=-1,grenadeProgress=-1}={}){
  const kind=reloadKind(id),p=reloadProgress,cycling=cycleProgress>=0&&cycleProgress<1;
  const pose={offset:[0,0,0],rotation:[0,0,0],mag:[0,0,0],magAngle:0,magVisible:true,boltLift:0,boltTravel:0,slide:0,cover:0,pump:0,leftMag:0,leftRack:0,rightRack:0,rightBolt:0,shell:false,shellReach:0,ejectAge:99,grenadePull:0,grenadeReach:0};
  if(kind==='pistol')pose.slide=ammo===0?.033:curve(shotAge,[[0,0],[.027,.035],[.115,0]]);
  if((kind!=='bolt'&&kind!=='shell')||id==='xm1014')pose.ejectAge=shotAge-.025;
  if(cycling){const t=cycleProgress,hold=envelope(t,.12,.28,.79,.99);pose.offset=[-.025*hold,-.018*hold,.03*hold];pose.rotation=[-.035*hold,.045*hold,-.15*hold];
    if(kind==='bolt'){pose.boltLift=envelope(t,.21,.33,.76,.89);pose.boltTravel=curve(t,[[0,0],[.33,0],[.47,.105],[.57,.105],[.75,0],[1,0]]);pose.rightBolt=envelope(t,.11,.23,.88,.99);pose.ejectAge=(t-.43)*(id==='awp'?1.45:1.1);}
    if(id==='m3'){pose.pump=curve(t,[[0,0],[.22,0],[.46,.09],[.60,.09],[.83,0],[1,0]]);pose.ejectAge=(t-.42)*.9;}
  }
  if(p>=0&&p<1){const tilt=envelope(p,0,.14,.84,1),top=kind==='top',belt=kind==='belt';pose.offset=[-.045*tilt,.06*tilt,.035*tilt];pose.rotation=[.13*tilt,.16*tilt,-(kind==='pistol'?.40:top?.57:.34)*tilt];
    if(kind==='shell'){const local=T.MathUtils.clamp((p-.20)/.60,0,.999999)*Math.max(1,rounds),u=local%1;pose.rotation=[.2*tilt,.05*tilt,-.63*tilt];pose.shell=p>=.20&&p<.80;pose.shellReach=envelope(u,0,.47,.81,1);pose.leftMag=envelope(p,.08,.18,.81,.96);if(id==='m3')pose.pump=envelope(p,.83,.88,.92,.99)*.065;}
    else{const distance=curve(p,[[0,0],[.18,0],[.32,top?.13:.19],[.44,top?.31:.40],[.49,top?.31:.40],[.56,top?.20:.28],[.71,0],[1,0]]);pose.mag=[-.065*distance,(top?1:-1)*distance,top?.08*distance:.04*distance];pose.magAngle=(id==='ak47'?.42:kind==='pistol'?.12:.16)*Math.min(1,distance*5);pose.magVisible=p<.43||p>=.49;pose.leftMag=envelope(p,.05,.17,.72,.88);
      if(belt)pose.cover=envelope(p,.07,.18,.74,.86)*-1.35;
      if(kind==='bolt'){pose.boltLift=envelope(p,.75,.81,.92,.97);pose.boltTravel=envelope(p,.80,.85,.87,.93)*.105;pose.rightBolt=envelope(p,.73,.80,.96,1);}
      else if(empty){pose.leftRack=envelope(p,.73,.80,.92,.98);pose.boltTravel=envelope(p,.80,.85,.87,.93)*.07;if(kind==='pistol')pose.slide=.033*(1-curve(p,[[0,0],[.86,0],[.91,1],[1,1]]));}
    }
    pose.ejectAge=99;
  }
  if(inspectProgress>=0&&inspectProgress<1&&p<0&&!cycling&&shotAge>.2){const hold=envelope(inspectProgress,0,.20,.78,1),turn=curve(inspectProgress,[[0,0],[.22,-.5],[.46,-.5],[.62,.25],[.79,.25],[1,0]]);pose.offset=[-.12*hold,.08*hold,.055*hold];pose.rotation=[.15*hold,turn,-.72*hold];}
  if(deployProgress>=0&&deployProgress<1&&p<0){
    const d=DEPLOY[id],t=deployProgress,raise=1-curve(t,[[0,0],[.32,1],[1,1]]),hold=envelope(t,.12,.31,.79,1);
    pose.offset=[.055*raise-.027*hold,-.32*raise+.022*hold,.18*raise+.025*hold];pose.rotation=[.38*raise+.05*hold,.13*raise,d.tilt*hold+.10*raise];
    // Finish an interrupted firing cycle before drawing the same weapon again.
    if(!cycling){const rack=envelope(t,.38,.52,.61,.75),reach=envelope(t,.19,.36,.78,.95);
      if(d.action==='bolt'){pose.boltLift=envelope(t,.31,.41,.76,.88);pose.boltTravel=rack*d.travel;pose.rightBolt=reach;}
      else if(d.action==='pump')pose.pump=rack*d.travel;
      else if(d.action==='slide'){pose.slide=ammo>0?rack*d.travel:.033;pose.leftRack=reach;}
      else if(d.action==='charge'){pose.boltTravel=rack*d.travel;pose[d.hand==='right'?'rightRack':'leftRack']=reach;}
      pose.ejectAge=99;
    }
  }
  if(id==='he'&&grenadeProgress>=0){const t=Math.min(1,grenadeProgress);pose.grenadeReach=envelope(t,0,.20,.7,1);pose.grenadePull=curve(t,[[0,0],[.24,0],[.76,1],[1,1]]);pose.offset=[-.06,.065,.025];pose.rotation=[-.22,.12,-.16];pose.ejectAge=99;}
  return pose;
}
const unitY=new T.Vector3(0,1,0),tmp=new T.Vector3();
function moveArm(arm,target,turn=0){if(!arm)return;arm.hand.position.copy(target);arm.hand.rotation.set(.06,0,turn);const wrist=target.clone().add(new T.Vector3(0,-.039,.018)),direction=wrist.clone().sub(arm.elbow);arm.arm.position.copy(wrist.add(arm.elbow).multiplyScalar(.5));arm.arm.scale.y=direction.length();arm.arm.quaternion.setFromUnitVectors(unitY,direction.normalize());}
export function applyWeaponAnimation(model,state={}){
  const r=model?.userData.rig;if(!r)return null;const motion=sampleWeaponMotion(r.id,state),kind=reloadKind(r.id);
  if(r.suppressor){r.suppressor.visible=state.suppressed!==false;r.muzzle.copy(r.suppressor.visible?r.muzzleSuppressed:r.muzzleBare);}
  for(const o of [r.magazine,r.bolt,r.boltHandle,r.slide,r.cover,r.pump]){o.position.copy(o.userData.restPosition);o.quaternion.copy(o.userData.restQuaternion);o.visible=true;}
  r.magazine.position.add(new T.Vector3(...motion.mag));r.magazine.rotation.x=motion.magAngle;r.magazine.visible=motion.magVisible;r.bolt.position.z+=motion.boltTravel;r.boltHandle.rotation.z=motion.boltLift*1.12;r.slide.position.z+=motion.slide;r.cover.rotation.x=motion.cover;r.pump.position.z+=motion.pump;
  if(r.pin){r.pin.position.x=-.085*motion.grenadePull;r.pin.visible=motion.grenadePull<.98;}
  if(r.shell){r.shell.visible=motion.shell;r.shell.position.set(-.032*(1-motion.shellReach),-.17+.106*motion.shellReach,-.018);r.shell.rotation.x=(1-motion.shellReach)*.38;}
  if(r.left){const target=r.left.rest.clone();if(kind==='shell'){target.lerp(new T.Vector3(-.045,-.19+.11*motion.shellReach,-.006).multiply(r.core.scale),motion.leftMag);}else{const grip=kind==='top'?new T.Vector3(-.036,.12,0):kind==='belt'?new T.Vector3(-.081,-.10,0):new T.Vector3(-.027,-.045,.014);grip.applyEuler(r.magazine.rotation).add(r.magazine.position).multiply(r.core.scale);target.lerp(grip,motion.leftMag);}
    if(r.id==='he')target.lerp(new T.Vector3(-.032-.085*motion.grenadePull,.064,.012).multiply(r.core.scale),motion.grenadeReach);target.lerp(chargingGrip(r,motion).multiply(r.core.scale),motion.leftRack);if(r.id==='m3')target.z+=motion.pump*r.core.scale.z;moveArm(r.left,target,-.12-motion.leftMag*.25);
  }
  if(r.right){const handle=new T.Vector3(.065,-.021,0).applyEuler(r.boltHandle.rotation).add(r.boltHandle.position).add(r.bolt.position).multiply(r.core.scale);const target=r.right.rest.clone().lerp(handle,motion.rightBolt).lerp(chargingGrip(r,motion).multiply(r.core.scale),motion.rightRack);moveArm(r.right,target,motion.rightBolt*.8+motion.rightRack*.3);}
  if(r.casing){const t=motion.ejectAge;r.casing.visible=t>=0&&t<.43;if(r.casing.visible){r.casing.position.copy(r.ejectPort).multiply(r.core.scale).add(tmp.set(t*.65,t*.45-t*t*1.5,t*.18));r.casing.rotation.set(t*13,t*6,t*9);}}
  return motion;
}
