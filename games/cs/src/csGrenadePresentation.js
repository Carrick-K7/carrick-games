import * as T from 'three';
import {GRENADE_RELEASE_TIME,GRENADE_RECOVER_TIME} from './csGrenade.js';
import {poseViewHand,handPoint} from './csViewHands.js';

const IDLE_OFFSET=[-.06,.055,-.02],IDLE_ROTATION=[-.08,.12,-.12];
const READY_OFFSET=[-.085,.10,.018],READY_ROTATION=[-.20,.16,-.18];
const release=GRENADE_RELEASE_TIME/GRENADE_RECOVER_TIME;
function curve(t,keys){if(t<=keys[0][0])return keys[0][1];for(let i=1;i<keys.length;i++){if(t<=keys[i][0]){const[a,x]=keys[i-1],[b,y]=keys[i],u=(t-a)/(b-a);return T.MathUtils.lerp(x,y,u*u*(3-2*u));}}return keys.at(-1)[1];}
const blend=(a,b,t)=>a.map((v,i)=>T.MathUtils.lerp(v,b[i],t));

/** Simulation-progress-only presentation. Launch/fuse/strength remain engine-owned. */
export function sampleGrenadeMotion(pose,{deployProgress=-1,grenadeProgress=-1,grenadeThrowProgress=-1,grenadeStrength=1}={}){
  pose.offset=[...IDLE_OFFSET];pose.rotation=[...IDLE_ROTATION];pose.ejectAge=99;
  if(deployProgress>=0&&deployProgress<1){
    const raise=curve(deployProgress,[[0,0],[.78,1],[1,1]]);
    pose.offset=blend([.005,-.265,.12],IDLE_OFFSET,raise);
    pose.rotation=blend([.24,.18,-.22],IDLE_ROTATION,raise);
  }
  if(grenadeProgress>=0){
    const t=T.MathUtils.clamp(grenadeProgress,0,1),hold=curve(t,[[0,0],[.23,1],[1,1]]);
    pose.offset=blend(IDLE_OFFSET,READY_OFFSET,hold);pose.rotation=blend(IDLE_ROTATION,READY_ROTATION,hold);
    pose.grenadeReach=curve(t,[[0,0],[.24,1],[.74,1],[1,0]]);
    pose.grenadePull=curve(t,[[0,0],[.28,0],[.72,1],[1,1]]);
  }
  if(grenadeThrowProgress>=0){
    const t=T.MathUtils.clamp(grenadeThrowProgress,0,1),low=1-T.MathUtils.clamp(grenadeStrength,0,1);
    const wind=curve(t,[[0,0],[.16,1],[.19,1],[release,0],[1,0]]);
    const swing=curve(t,[[0,0],[.16,0],[release,.95],[.58,1],[1,.75]]);
    const recover=curve(t,[[0,0],[.57,0],[1,1]]);
    pose.offset=[READY_OFFSET[0]+.065*wind-.055*swing,
      READY_OFFSET[1]+(.075-.16*low)*wind+(.015-.10*low)*swing-.30*recover,
      READY_OFFSET[2]+.055*wind-.20*swing-.03*recover];
    // Fingers follow the forward throw, not an upright palm-facing wave.
    pose.rotation=[READY_ROTATION[0]+.30*wind-(.65-.40*low)*swing,
      READY_ROTATION[1]-.16*swing,READY_ROTATION[2]-.15*swing];
    pose.grenadePull=1;pose.grenadeReach=0;pose.grenadeReleased=t>=release;
    pose.grenadeHandOpen=curve(t,[[0,0],[release-.035,0],[release+.10,.85],[.70,.85],[1,.55]]);
    pose.grenadeOffhandStable=true;
  }
  return pose;
}

/** Hook the index's distal segment through the actual ring, not the palm. */
export function grenadePinGrip(arm,motion,scale){
  const reach=motion.grenadeReach;
  poseViewHand(arm.skin,{relaxed:true,open:.65*(1-reach),thumb:.35*(1-reach),
    fingerCurls:{index:[.35,.75,.55],middle:[.85,1.10,.70],ring:[.90,1.10,.70],pinky:[.95,1.10,.70]}});
  const hook=handPoint(arm.skin,'index_02').lerp(handPoint(arm.skin,'index_03'),.65);
  const ring=new T.Vector3(-.028-.085*motion.grenadePull,.050,0).multiply(scale);
  const contact=ring.sub(hook.sub(arm.palm).applyQuaternion(arm.rotation));
  return arm.rest.clone().lerp(contact,reach);
}

/** The spare hand stays by the body while the throwing arm moves forward. */
export function stabilizeGrenadeOffhand(arm,motion,{pitch=0,yaw=0,roll=0}={}){
  const root=arm?.root;if(!root)return;
  root.position.set(0,0,0);root.quaternion.identity();
  if(!motion.grenadeOffhandStable)return;
  // Match placeWeaponView's componentwise Euler composition, including the
  // base look/recoil angles; authored-only inverse leaves a yaw-dependent drift.
  const rotation=v=>new T.Quaternion().setFromEuler(new T.Euler(pitch+v[0],yaw+v[1],roll+v[2]));
  const inverse=rotation(motion.rotation).invert();
  root.quaternion.copy(inverse).multiply(rotation(READY_ROTATION));
  root.position.fromArray(READY_OFFSET).sub(new T.Vector3(...motion.offset)).applyQuaternion(inverse);
}
