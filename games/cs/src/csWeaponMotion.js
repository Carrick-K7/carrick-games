import * as T from 'three';
import {DEPLOY,chargingGrip,chargingRotation,reachChargingAction,actionPhase,actionCues} from './csWeaponDeploy.js';
import {poseKnifeGrip,poseClassicKnifeGrip,poseButterflyKnifeGrip,poseViewHand,poseFirearmHand} from './csViewHands.js';
import {DEFAULT_KNIFE_MODEL} from './csKnifeStyles.js';
import {sampleButterflyMotion,BUTTERFLY_INSPECT_DURATION} from './csButterflyKnife.js';

export function reloadKind(id){return id==='p90'?'top':id==='m249'?'belt':['m3','xm1014'].includes(id)?'shell':['usp','glock','deagle'].includes(id)?'pistol':['awp','scout'].includes(id)?'bolt':'magazine';}
function curve(t,keys){if(t<=keys[0][0])return keys[0][1];for(let i=1;i<keys.length;i++){if(t<=keys[i][0]){const [a,x]=keys[i-1],[b,y]=keys[i],u=(t-a)/(b-a),v=u*u*(3-2*u);return x+(y-x)*v;}}return keys.at(-1)[1];}
const envelope=(t,a,b,c,d)=>curve(t,[[a,0],[b,1],[c,1],[d,0]]);
function sampleAction(pose,id,t,mode='draw',lockedOpen=false){
  const d=DEPLOY[id];if(!d||d.action==='raise')return;
  const [contact,back,release,close,home]=actionPhase(id,mode);
  const liftEnd=contact+(back-contact)*.42;
  const pull=d.action==='bolt'?liftEnd:contact;
  const stroke=curve(t,[[0,0],[pull,0],[back,1],[release,1],[close,0],[1,0]]);
  const reach=envelope(t,Math.max(0,contact-.17),contact,d.action==='bolt'?close+(home-close)*.52:release,home);
  pose.handTravel=curve(t,[[0,0],[pull,0],[back,d.travel],[release,d.travel],[home,0],[1,0]]);
  if(d.action==='bolt'){
    // Unlock completely before translating; close the bolt before turning
    // the handle down. SSG 08 has its own shorter stroke and knob location.
    pose.boltLift=envelope(t,contact,liftEnd,close,close+(home-close)*.48);
    pose.boltTravel=stroke*d.travel;pose.rightBolt=reach;
  }else if(d.action==='pump')pose.pump=stroke*d.travel;
  else{
    pose[d.hand==='right'?'rightRack':'leftRack']=reach;
    if(d.action==='slide'){
      pose.slide=lockedOpen?.033:stroke*d.travel;
      if(lockedOpen)pose.handTravel=.033;
    }else{
      pose.boltTravel=stroke*d.travel;
      if(d.latch)pose.boltRoll=-.38*envelope(t,back,back+.045,release-.025,release+.04);
    }
  }
}
const knifeGrip=(yaw,roll)=>new T.Quaternion().setFromEuler(new T.Euler(0,yaw,roll,'ZYX'));
const knifeIdle=knifeGrip(-Math.PI/2,1.16),knifeDraw=knifeGrip(-.30,-.80);
const classicGrip=(pitch=.10,yaw=1.10,roll=-.20)=>new T.Quaternion().setFromEuler(new T.Euler(pitch,yaw,roll,'YXZ'));
function sampleClassicKnifeMotion(pose,{deployProgress,inspectProgress,shotAge,knifeHeavy}){
  Object.assign(pose,{ejectAge:99,knifeSpin:0,knifeOpen:0,knifeThumb:0,knifeLowerLeft:0,knifeElbowIn:0,knifeAttack:0,knifeBaseOffset:[-.02,.02,-.12]});
  pose.offset=[...pose.knifeBaseOffset];pose.rotation=[0,0,0];const grip=classicGrip();
  if(deployProgress>=0&&deployProgress<1){
    const t=deployProgress,raise=1-curve(t,[[0,0],[.56,1],[1,1]]),settle=envelope(t,.46,.64,.70,1);
    pose.offset[0]+=.07*raise;pose.offset[1]-=.24*raise-.009*settle;pose.offset[2]+=.055*raise;
    grip.slerp(classicGrip(.22,.82,-.48),raise);pose.knifeLowerLeft=.07*raise;
  }else if(shotAge>=0&&shotAge<(knifeHeavy?.85:.48)){
    const t=shotAge/(knifeHeavy?.85:.48),strike=curve(t,[[0,0],[.08,.06],[knifeHeavy?.28:.24,1],[.42,.86],[1,0]]);
    pose.knifeAttack=strike;
    pose.offset[0]-=(knifeHeavy?.075:.255)*strike;pose.offset[1]+=(knifeHeavy?.055:.025)*strike;pose.offset[2]-=(knifeHeavy?.16:.07)*strike;
    pose.rotation=knifeHeavy?[0,.10*strike,-.12*strike]:[.08*strike,.20*strike,.90*strike];
    if(knifeHeavy)grip.slerp(classicGrip(.08,1.25,-1.10),strike);
  }else if(inspectProgress>=0&&inspectProgress<1&&shotAge>.5){
    // A restrained examination retains the closed forward grip. CS 1.6 did
    // not have an F inspection; this keeps this game's existing F control.
    const t=inspectProgress,hold=envelope(t,0,.22,.73,1),turn=curve(t,[[0,0],[.24,1],[.44,1],[.64,-.35],[.80,-.35],[1,0]]);
    pose.offset[0]-=.055*hold;pose.offset[1]+=.05*hold;pose.offset[2]+=.025*hold;
    grip.slerp(classicGrip(.08,1.10+.50*turn,.10),hold);pose.knifeLowerLeft=.12*hold;
  }
  pose.knifeGrip=grip.toArray();return pose;
}
export const inspectDuration=(id,knifeModel=DEFAULT_KNIFE_MODEL)=>id==='knife'?(knifeModel==='butterfly'?BUTTERFLY_INSPECT_DURATION:knifeModel==='karambit'?3.8:2.5):2.5;
export const WEAPON_VIEW_FOV=62;
export function placeWeaponView(model,motion,{x=.25,y=-.225,z=-.40,pitch=.012,yaw=-.04,roll=0}={}){
  model.position.set(x+motion.offset[0],y+motion.offset[1],z+motion.offset[2]);
  model.rotation.set(pitch+motion.rotation[0],yaw+motion.rotation[1],roll+motion.rotation[2]);
}

export function reloadCues(id,empty=false,rounds=1){
  const kind=reloadKind(id);
  if(kind==='shell')return [{at:.06,sound:'cloth'},...Array.from({length:rounds},(_,i)=>({at:.20+(i+.8)*.60/rounds,sound:'shell'})),...(id==='m3'?[{at:.83,sound:'pump'}]:empty?actionCues(id,'reload'):[])];
  return [{at:.10,sound:'cloth'},...(kind==='belt'?[{at:.16,sound:'cover'}]:[]),{at:.24,sound:'mag-out'},{at:.70,sound:'mag-in'},...(kind==='belt'?[{at:.74,sound:'belt'},{at:.84,sound:'cover-close'}]:[]),...((empty||kind==='bolt')?actionCues(id,'reload'):[]),{at:.998,sound:'cloth'}];
}
export function reloadLabel(id,t,en=false){const kind=reloadKind(id);if(en){if(kind==='shell')return t<.16?'Preparing':t<.82?'Loading shells':'Closing';if(kind==='belt')return t<.2?'Opening cover':t<.48?'Removing box':t<.75?'Loading box':'Closing up';return t<.17?'Releasing grip':t<.45?'Magazine out':t<.73?'Magazine in':t<.94?'Chambering':'Recovering';}if(kind==='shell')return t<.16?'准备装填':t<.82?'逐发装填':'复位';if(kind==='belt')return t<.2?'打开机匣盖':t<.48?'移出弹箱':t<.75?'装入弹箱':'闭合上膛';return t<.17?'移手解锁':t<.45?'取出弹匣':t<.73?'装入弹匣':t<.94?'复位上膛':'恢复持枪';}

// All animation samples depend only on action progress. Pause, low frame rates,
// weapon switches and reload cancellation therefore cannot leave parts displaced.
export function sampleWeaponMotion(id,{reloadProgress=-1,empty=false,rounds=1,cycleProgress=-1,shotAge=99,knifeHeavy=false,butterflyDrawVariant=0,butterflyInspectVariant=0,knifeModel=DEFAULT_KNIFE_MODEL,ammo=1,inspectProgress=-1,deployProgress=-1,grenadeProgress=-1,grenadeThrowProgress=-1,grenadeStrength=1}={}){
  const kind=reloadKind(id),p=reloadProgress,cycling=(kind==='bolt'||id==='m3')&&cycleProgress>=0&&cycleProgress<1;
  const pose={offset:[0,0,0],rotation:[0,0,0],mag:[0,0,0],magAngle:0,magVisible:true,boltLift:0,boltTravel:0,boltRoll:0,handTravel:0,slide:0,cover:0,pump:0,leftMag:0,leftRack:0,rightRack:0,rightBolt:0,shell:false,shellReach:0,ejectAge:99,grenadePull:0,grenadeReach:0,grenadeReleased:false,grenadeHandOpen:0,coverReach:0};
  if(kind==='pistol')pose.slide=ammo===0?.033:curve(shotAge,[[0,0],[.027,.035],[.115,0]]);
  // Only reciprocating handles follow automatic fire; a rear M4/MP9 handle
  // or the AUG/MP5/P90 charging lever must not shuttle with every shot.
  if(['ak47','sg552','mac10','xm1014'].includes(id))pose.boltTravel=DEPLOY[id].travel*curve(shotAge,[[0,0],[.024,1],[.078,0]]);
  if((kind!=='bolt'&&kind!=='shell')||id==='xm1014')pose.ejectAge=shotAge-.025;
  if(cycling){const t=cycleProgress,hold=envelope(t,.12,.28,.79,.99);pose.offset=[-.10*hold,.038*hold,-.075*hold];pose.rotation=[-.035*hold,.045*hold,-.15*hold];
    if(kind==='bolt'){sampleAction(pose,id,t,'cycle');pose.ejectAge=(t-(id==='awp'?.43:.40))*(id==='awp'?1.45:1.1);}
    if(id==='m3'){sampleAction(pose,id,t,'cycle');pose.ejectAge=(t-.42)*.9;}
  }
  if(p>=0&&p<1){const tilt=envelope(p,0,.14,.84,1),top=kind==='top',belt=kind==='belt';pose.offset=[-.10*tilt,.075*tilt,-.065*tilt];pose.rotation=[.13*tilt,.16*tilt,-(kind==='pistol'?.40:top?.57:.34)*tilt];
    if(kind==='shell'){const local=T.MathUtils.clamp((p-.20)/.60,0,.999999)*Math.max(1,rounds),u=local%1;pose.rotation=[.2*tilt,.05*tilt,-.63*tilt];pose.shell=p>=.20&&p<.80;pose.shellReach=envelope(u,0,.47,.81,1);pose.leftMag=envelope(p,.08,.18,.79,.86);if(id==='m3')pose.pump=envelope(p,.86,.90,.93,.99)*.086;else if(empty)sampleAction(pose,id,p,'reload');}
    else{const distance=curve(p,[[0,0],[.18,0],[.32,top?.13:.19],[.44,top?.31:.40],[.49,top?.31:.40],[.56,top?.20:.28],[.71,0],[1,0]]);pose.mag=[-.065*distance,(top?1:-1)*distance,top?.08*distance:.04*distance];pose.magAngle=(id==='ak47'?.42:kind==='pistol'?.12:.16)*Math.min(1,distance*5);pose.magVisible=p<.43||p>=.49;pose.leftMag=envelope(p,.05,.17,.72,.88);
      if(belt){pose.cover=envelope(p,.07,.18,.77,.88)*-1.35;pose.coverReach=Math.max(envelope(p,.015,.07,.18,.24),envelope(p,.73,.77,.88,.93));pose.leftMag*=1-pose.coverReach;}
      if(kind==='bolt'||empty){
        sampleAction(pose,id,p,'reload');
        // Finish seating the magazine before the same hand goes to the action.
        if(DEPLOY[id].hand==='left')pose.leftMag=envelope(p,.05,.17,.69,.78);
        if(kind==='pistol'){pose.slide=.033*(1-curve(p,[[0,0],[.88,0],[.94,1],[1,1]]));pose.handTravel=.033*(1-curve(p,[[0,0],[.88,0],[.995,1],[1,1]]));}
      }
    }
    pose.ejectAge=99;
  }
  if(inspectProgress>=0&&inspectProgress<1&&p<0&&!cycling&&shotAge>.2){const hold=envelope(inspectProgress,0,.20,.78,1),turn=curve(inspectProgress,[[0,0],[.22,-.5],[.46,-.5],[.62,.25],[.79,.25],[1,0]]);pose.offset=[-.12*hold,.08*hold,.055*hold];pose.rotation=[.15*hold,turn,-.72*hold];}
  if(deployProgress>=0&&deployProgress<1&&p<0){
    const d=DEPLOY[id],t=deployProgress,raise=1-curve(t,[[0,0],[.32,1],[1,1]]),hold=envelope(t,.12,.31,.79,1);
    pose.offset=[.055*raise-.09*hold,-.32*raise+.095*hold,.18*raise-.070*hold];pose.rotation=[.38*raise+.05*hold,.13*raise,d.tilt*hold+.10*raise];
    // Finish an interrupted firing cycle before drawing the same weapon again.
    if(!cycling){sampleAction(pose,id,t,'draw',ammo===0);
      pose.ejectAge=99;
    }
  }
  if(id==='m3')pose.boltTravel=pose.pump;
  if(id==='he'){
    pose.ejectAge=99;
    if(deployProgress<0){pose.offset=[-.06,.055,-.02];pose.rotation=[-.08,.12,-.12];}
    if(grenadeProgress>=0){const t=Math.min(1,grenadeProgress);pose.grenadeReach=envelope(t,0,.23,.65,1);pose.grenadePull=curve(t,[[0,0],[.26,0],[.72,1],[1,1]]);pose.offset=[-.085,.10,.018];pose.rotation=[-.20,.16,-.18];}
    if(grenadeThrowProgress>=0){
      const t=grenadeThrowProgress,low=1-grenadeStrength,wind=envelope(t,0,.17,.22,.45),swing=curve(t,[[0,0],[.19,0],[.40,1],[.67,.7],[1,0]]);
      pose.offset=[-.085+.045*wind-.09*swing,.10+(.12-.20*low)*wind+(.075-.18*low)*swing,.018+.12*wind-.23*swing];
      pose.rotation=[-.20-(.45-.65*low)*wind+(.48-.85*low)*swing,.16-.20*swing,-.18+.22*swing];
      pose.grenadePull=1;pose.grenadeReach=0;pose.grenadeReleased=t>=.22/.56;pose.grenadeHandOpen=curve(t,[[0,0],[.26,0],[.41,1],[1,1]]);
    }
  }
  if(id==='knife'&&knifeModel==='butterfly')return sampleButterflyMotion(pose,{deployProgress,inspectProgress,shotAge,knifeHeavy,butterflyDrawVariant,butterflyInspectVariant});
  if(id==='knife'&&knifeModel!=='karambit')return sampleClassicKnifeMotion(pose,{deployProgress,inspectProgress,shotAge,knifeHeavy});
  if(id==='knife'){
    pose.ejectAge=99;pose.knifeSpin=0;pose.knifeOpen=0;pose.knifeThumb=0;pose.knifeLowerLeft=0;pose.knifeElbowIn=0;pose.knifeAttack=0;
    pose.offset=[-.10,.06,-.11];pose.rotation=[0,0,0];
    const grip=knifeIdle.clone();
    if(deployProgress>=0&&deployProgress<1){
      // The CS:GO draw enters from the lower right, flicks around the index
      // ring, catches early, then settles. Do not slowly spin an already raised
      // idle hand for the entire deploy interval.
      const t=deployProgress,raise=1-curve(t,[[0,0],[.34,1],[1,1]]),catching=envelope(t,.48,.59,.68,1);
      const flick=envelope(t,.04,.22,.48,.85);
      pose.offset[0]+=.10*raise-.012*catching-.035*flick;pose.offset[1]+=-.19*raise+.034*catching+.12*flick;pose.offset[2]+=.030*raise;
      // Keep the wrist angled through the ring flick. Returning it to the
      // idle frame before the blade had turned made the claw sweep below the
      // wrist and the open palm stand upright like a wave.
      grip.copy(knifeDraw).slerp(knifeIdle,curve(t,[[0,0],[.20,0],[.64,.88],[.88,1],[1,1]]));
      pose.knifeOpen=1-curve(t,[[0,0],[.49,0],[.67,1],[1,1]]);pose.knifeThumb=pose.knifeOpen;
      pose.knifeSpin=-Math.PI*(1-curve(t,[[0,0],[.10,0],[.46,1],[1,1]]));
      pose.knifeLowerLeft=.28*envelope(t,0,.14,.60,1);
    }else if(inspectProgress>=0&&inspectProgress<1&&shotAge>.5){
      // Multiple 2015/2016 CS:GO recordings show a close, palm-facing hold
      // after the flip. There is no separate front/back display midway.
      const t=inspectProgress,lift=envelope(t,0,.12,.82,1),present=envelope(t,.18,.32,.80,.98);
      const settle=envelope(t,.33,.55,.70,.82);
      grip.copy(knifeGrip(T.MathUtils.lerp(-Math.PI/2,1.43+.06*settle,present),T.MathUtils.lerp(1.16,-.10+.025*settle,present)));
      pose.offset[0]-=.045*present;pose.offset[1]+=.105*lift+.062*present;pose.offset[2]+=.195*present;
      pose.knifeSpin=-Math.PI*2*curve(t,[[0,0],[.035,0],[.18,1],[1,1]]);
      pose.knifeOpen=envelope(t,0,.025,.18,.28)+.06*present;
      pose.knifeThumb=Math.max(pose.knifeOpen,present);
      pose.knifeLowerLeft=.42*lift;
      pose.knifeElbowIn=present;
    }else if(shotAge>=0&&shotAge<(knifeHeavy?.85:.48)){
      const t=shotAge/(knifeHeavy?.85:.48),strike=curve(t,[[0,0],[knifeHeavy?.10:.08,.10],[knifeHeavy?.25:.24,1],[knifeHeavy?.38:.40,.86],[knifeHeavy?.64:.67,.25],[1,0]]);
      pose.knifeAttack=strike;
      pose.offset[0]-=(knifeHeavy?.075:.22)*strike;pose.offset[1]+=(knifeHeavy?.075:.04)*strike;pose.offset[2]-=(knifeHeavy?.20:.085)*strike;
      pose.rotation=knifeHeavy?[-.12*strike,.16*strike,-.22*strike]:[.06*strike,-.36*strike,-.72*strike];
      if(knifeHeavy)grip.slerp(knifeGrip(-.30,.82),.72*strike);
    }
    pose.knifeGrip=grip.toArray();
  }
  return pose;
}
const unitY=new T.Vector3(0,1,0),tmp=new T.Vector3();
function moveArm(arm,target,turn=0,mag=0,rack=0,style='side',lift=0){if(!arm)return;
  if(arm.skin){
    arm.hand.quaternion.copy(arm.rotation).slerp(arm.magazineRotation,mag);
    if(rack>0)arm.hand.quaternion.slerp(chargingRotation(style,lift),rack);
    const fingerPose=Math.round(rack*40)/40;
    if(arm.lastRack!==fingerPose){poseFirearmHand(arm.skin,arm.gripStyle,fingerPose);arm.lastRack=fingerPose;}
    arm.hand.position.copy(target).sub(arm.palm.clone().applyQuaternion(arm.hand.quaternion));
    const wrist=new T.Vector3(arm.skin.side==='r'?-.006:.006,.008,.009).multiplyScalar(arm.skin.scale).applyQuaternion(arm.hand.quaternion).add(arm.hand.position);
    const forward=new T.Vector3(0,1,0).applyQuaternion(arm.hand.quaternion),desired=wrist.clone().sub(arm.elbow).normalize(),bend=forward.angleTo(desired);
    const direction=forward.clone().applyQuaternion(new T.Quaternion().identity().slerp(new T.Quaternion().setFromUnitVectors(forward,desired),Math.min(1,.62/Math.max(bend,.001))));
    const elbow=wrist.clone().addScaledVector(direction,-.34);arm.wristBend=forward.angleTo(direction);arm.wrist=wrist.clone();
    connectSegment(arm.arm,elbow,wrist);
    const shoulder=new T.Vector3(arm.skin.side==='l'?-.52:.53,-.48,arm.grenadeArm?.14:.38);connectSegment(arm.upperArm,shoulder,elbow.clone().addScaledVector(direction,.012));
    const axis=direction.clone().negate();connectSegment(arm.cuff,wrist.clone().addScaledVector(axis,.020),wrist.clone().addScaledVector(axis,-.018));return;
  }
  arm.hand.position.copy(target);arm.hand.rotation.set(.06,0,turn);const wrist=target.clone().add(new T.Vector3(0,-.039,.018)),direction=wrist.clone().sub(arm.elbow);arm.arm.position.copy(wrist.add(arm.elbow).multiplyScalar(.5));arm.arm.scale.y=direction.length();arm.arm.quaternion.setFromUnitVectors(unitY,direction.normalize());}
function connectSegment(mesh,a,b){const d=b.clone().sub(a);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(unitY,d.clone().normalize());mesh.scale.y=d.length()/(mesh.geometry.parameters?.height||1);}
export function applyWeaponAnimation(model,state={}){
  const r=model?.userData.rig;if(!r)return null;const motion=sampleWeaponMotion(r.id,{...state,knifeModel:r.knifeModel}),kind=reloadKind(r.id);
  if(r.suppressor){r.suppressor.visible=state.suppressed!==false;r.muzzle.copy(r.suppressor.visible?r.muzzleSuppressed:r.muzzleBare);}
  for(const o of [r.magazine,r.bolt,r.boltHandle,r.slide,r.cover,r.pump]){o.position.copy(o.userData.restPosition);o.quaternion.copy(o.userData.restQuaternion);o.visible=true;}
  r.magazine.position.add(new T.Vector3(...motion.mag));r.magazine.rotation.x=motion.magAngle;r.magazine.visible=motion.magVisible;r.bolt.position.z+=motion.boltTravel;r.bolt.rotation.z=motion.boltRoll;r.boltHandle.rotation.z=motion.boltLift*1.12;r.slide.position.z+=motion.slide;r.cover.rotation.x=motion.cover;r.pump.position.z+=motion.pump;
  if(r.belt){const p=state.reloadProgress??-1;r.belt.visible=p<0||p<.23||p>=.74;}
  if(r.magHinge)r.magazine.position.add(r.magHinge).sub(r.magHinge.clone().applyQuaternion(r.magazine.quaternion));
  if(r.pin){r.pin.position.x=-.085*motion.grenadePull;r.pin.visible=motion.grenadePull<.98;r.fixed.visible=!motion.grenadeReleased;}
  if(r.knifePivot){
    r.knifeFrame.quaternion.fromArray(motion.knifeGrip);
    r.knifePivot.quaternion.copy(r.knifeRest).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),motion.knifeSpin));
    if(r.butterflyBlade){r.butterflyBlade.rotation.x=motion.butterflyBlade;r.butterflyHandle.rotation.x=motion.butterflyHandle;}
    r.restRight.copy(r.knifePalm).applyQuaternion(r.knifeFrame.quaternion);
    r.muzzle.copy(r.knifeTip).sub(r.knifePivot.position).applyQuaternion(r.knifePivot.quaternion).add(r.knifePivot.position).applyQuaternion(r.knifeFrame.quaternion);
    if(r.butterflyBlade){r.butterflyBlade.updateWorldMatrix(true,false);r.muzzle.copy(r.core.worldToLocal(r.butterflyBlade.localToWorld(r.knifeTip.clone())));}
    if(r.knifeRight){
      const grip=r.knifeModel==='classic'?poseClassicKnifeGrip(r.knifeRight):r.knifeModel==='butterfly'?poseButterflyKnifeGrip(r.knifeRight,motion):poseKnifeGrip(r.knifeRight,motion,r.knifeIndex);r.knifeWrist.copy(grip.wrist);r.knifePalm.copy(grip.palm);r.restRight.copy(grip.palm).applyQuaternion(r.knifeFrame.quaternion);r.knifeIndexLine=grip.indexA?[grip.indexA,grip.indexB]:null;
      const wrist=grip.wrist.clone().applyQuaternion(r.knifeFrame.quaternion),forward=grip.forward.clone().applyQuaternion(r.knifeFrame.quaternion);
      const desired=r.knifeElbowRest.clone().add(tmp.set(-.12,-.10,0).multiplyScalar(motion.knifeElbowIn)),direction=wrist.clone().sub(desired).normalize(),bend=forward.angleTo(direction);
      // The forearm follows the anatomical palm axis. Distribute the turn into
      // the arm instead of hiding a sharply bent wrist inside a sleeve.
      if(bend>.48)direction.copy(forward).applyQuaternion(new T.Quaternion().identity().slerp(new T.Quaternion().setFromUnitVectors(forward,wrist.clone().sub(desired).normalize()),.48/bend));
      r.knifeElbow.copy(wrist).addScaledVector(direction,-.43);r.knifeWristBend=forward.angleTo(direction);
      connectSegment(r.knifeForearm,r.knifeElbow,wrist);
      if(r.knifeUpperArm){
        // Continue the sleeve to the off-screen shoulder; a wide slash must
        // not expose a floating, capped forearm at the edge of the view.
        const shoulder=new T.Vector3(.65-motion.offset[0],-.50-motion.offset[1],.12-motion.offset[2]).applyQuaternion(new T.Quaternion().setFromEuler(new T.Euler(...motion.rotation)).invert());
        connectSegment(r.knifeUpperArm,shoulder,r.knifeElbow.clone().addScaledVector(direction,.012));
      }
      const sleeveDirection=r.knifeElbow.clone().sub(wrist).normalize();
      connectSegment(r.knifeCuff,wrist.clone().addScaledVector(sleeveDirection,.025),wrist.clone().addScaledVector(sleeveDirection,-.018));
      const left=r.knifeLeft;left.hand.position.copy(left.rest);left.hand.position.y-=motion.knifeLowerLeft;
      left.root.position.set(0,0,0);left.root.quaternion.identity();
      if(motion.knifeAttack>0){
        // Keep the off-hand relaxed while the striking hand turns the weapon.
        // Counter only the authored attack transform; camera sway still applies.
        left.root.quaternion.setFromEuler(new T.Euler(...motion.rotation)).invert();
        const base=motion.knifeBaseOffset||[-.10,.06,-.11];
        left.root.position.set(base[0]-motion.offset[0]-.07*motion.knifeAttack,base[1]-motion.offset[1]-.16*motion.knifeAttack,base[2]-motion.offset[2]).applyQuaternion(left.root.quaternion);
      }
      const leftWrist=new T.Vector3(.006,.008,.009).multiplyScalar(left.skin.scale).applyQuaternion(left.hand.quaternion).add(left.hand.position);
      connectSegment(left.arm,left.elbow,leftWrist);
      const leftDirection=left.elbow.clone().sub(leftWrist).normalize();
      connectSegment(left.cuff,leftWrist.clone().addScaledVector(leftDirection,.025),leftWrist.clone().addScaledVector(leftDirection,-.018));
    }
  }
  if(r.shell){r.shell.visible=motion.shell;const load=r.shellLoadPoint||new T.Vector3(0,-.064,-.018);r.shell.position.copy(load).add(new T.Vector3(-.032,-.106,0).multiplyScalar(1-motion.shellReach));r.shell.rotation.x=(1-motion.shellReach)*.38;}
  if(r.left){const target=r.left.rest.clone();if(kind==='shell'){target.lerp(r.shell.position.clone().add(new T.Vector3(-.015,-.015,.008)).multiply(r.core.scale),motion.leftMag);}else{const grip=r.magGrip?.clone()||(kind==='top'?new T.Vector3(-.036,.12,0):kind==='belt'?new T.Vector3(-.081,-.10,0):new T.Vector3(-.027,-.045,.014));grip.applyEuler(r.magazine.rotation).add(r.magazine.position).multiply(r.core.scale);target.lerp(grip,motion.leftMag);}
    if(r.id==='m249'){const cover=r.cover.position.clone().add(new T.Vector3(0,.018,.13).applyEuler(r.cover.rotation));target.lerp(cover.multiply(r.core.scale),motion.coverReach);}
    if(r.id==='he')target.lerp(new T.Vector3(-.032-.085*motion.grenadePull,.050,.012).multiply(r.core.scale),motion.grenadeReach);
    reachChargingAction(target,chargingGrip(r,motion).multiply(r.core.scale),motion.leftRack,DEPLOY[r.id]);
    if(r.id==='m3')target.z+=motion.pump*r.core.scale.z;
    moveArm(r.left,target,-.12-motion.leftMag*.25,motion.leftMag,motion.leftRack,DEPLOY[r.id]?.wrist);
  }
  if(r.right){const d=DEPLOY[r.id],handle=new T.Vector3(...(d?.grip||[.065,-.021,0])).applyEuler(r.boltHandle.rotation).add(r.boltHandle.position).add(r.bolt.position).multiply(r.core.scale),target=r.right.rest.clone();
    reachChargingAction(target,handle,motion.rightBolt,d);reachChargingAction(target,chargingGrip(r,motion).multiply(r.core.scale),motion.rightRack,d);
    moveArm(r.right,target,motion.rightBolt*.8+motion.rightRack*.3,0,Math.max(motion.rightBolt,motion.rightRack),d?.wrist,motion.boltLift);
  }
  if(r.id==='he'&&r.right?.skin){poseViewHand(r.right.skin,{open:motion.grenadeHandOpen,relaxed:true,thumb:motion.grenadeHandOpen,fingerCurls:{index:[.60,.96,.65],middle:[.62,.99,.65],ring:[.65,.99,.64],pinky:[.68,.96,.62]}});}
  if(r.casing){const t=motion.ejectAge;r.casing.visible=t>=0&&t<.43;if(r.casing.visible){r.casing.position.copy(r.ejectPort).multiply(r.core.scale).add(tmp.set(t*.65,t*.45-t*t*1.5,t*.18));r.casing.rotation.set(t*13,t*6,t*9);}}
  return motion;
}
