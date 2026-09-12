import * as T from 'three';

// Independently authored game profiles. Pitch/yaw are angular impulses in radians;
// view kick recovers separately from aim punch so sustained fire needs compensation.
const profile=(pitch,yaw,delay,recover,reset,view,move,growth,pattern)=>({pitch,yaw,delay,recover,reset,view,move,growth,pattern});
export const RECOIL={
  ak47:profile(.019,.013,.19,8,.55,8,.030,.00065,[[0,1],[-.1,1.12],[.12,1.18],[.28,1.16],[-.5,1.10],[-.8,1],[-1,.85],[-.8,.73],[.35,.7],[1.2,.65],[1.4,.62],[1.1,.58],[.4,.55],[-.6,.53],[-1.2,.5],[-1.1,.5]]),
  m4a1:profile(.012,.008,.16,11,.42,12,.028,.00036,[[0,1],[.06,1.05],[-.1,1.08],[-.25,1.03],[.3,.99],[.6,.92],[.75,.86],[.4,.82],[-.4,.76],[-.8,.73],[-.9,.7],[-.35,.68],[.5,.66],[.8,.64]]),
  awp:profile(.060,.004,.33,7,.95,5,.070,.002,[[.12,1],[-.12,1]]),
  mp5:profile(.008,.008,.12,13,.36,15,.015,.00034,[[0,.8],[.2,.94],[.4,1],[-.3,.97],[-.6,.92],[-.8,.86],[.4,.8],[.8,.76],[.5,.73],[-.5,.7]]),
  tmp:profile(.010,.011,.13,12,.39,17,.017,.00042,[[0,.9],[-.3,1.05],[-.5,1.1],[.6,1],[1,.9],[.7,.84],[-.9,.8],[-1,.76],[.7,.74]]),
  p90:profile(.009,.006,.15,12.5,.44,16,.018,.0003,[[0,1],[.2,1.08],[.5,1.04],[.3,.98],[-.5,.91],[-.7,.85],[-.6,.79],[.4,.77],[.8,.75],[.6,.72]]),
  mac10:profile(.013,.013,.14,10,.46,14,.019,.0006,[[0,1],[-.3,1.2],[.4,1.1],[.8,.96],[-.8,.9],[-1.2,.87],[-.4,.82],[1,.78],[1.2,.74]]),
  sg552:profile(.017,.014,.21,8.5,.58,9,.033,.0006,[[0,1],[.3,1.12],[.6,1.15],[.9,1.08],[1.1,.98],[.7,.9],[-.4,.84],[-.9,.78],[-1.1,.73],[-.7,.7],[.4,.66]]),
  aug:profile(.014,.010,.18,10,.49,11,.030,.00045,[[0,1],[-.2,1.04],[-.45,1.07],[-.6,1.02],[.3,.96],[.7,.91],[.8,.86],[.35,.8],[-.7,.76],[-.9,.73]]),
  scout:profile(.034,.005,.25,9,.8,7,.040,.0015,[[.2,1],[-.3,.95],[.15,1.02]]),
  g3sg1:profile(.030,.010,.24,7.5,.65,8,.055,.0018,[[0,1],[-.5,1.12],[.7,1.18],[-.6,1.2],[.8,1.2]]),
  m3:profile(.052,.009,.27,8,.88,5.5,.023,.001,[[.25,1],[-.4,.98],[.2,1.04]]),
  xm1014:profile(.036,.013,.22,8.7,.62,7.5,.025,.0013,[[0,1],[.5,1.1],[-.7,1.15],[.8,1.12],[-.6,1.1],[.4,1.08]]),
  m249:profile(.021,.019,.23,7,.7,9.5,.043,.00085,[[0,1],[-.4,1.15],[.6,1.22],[.8,1.18],[-.8,1.06],[-1.3,.98],[-.9,.9],[.8,.85],[1.5,.8],[1.2,.76],[-.6,.73],[-1.5,.7]]),
  deagle:profile(.057,.012,.32,7,.95,6,.055,.008,[[.18,1],[-.5,1.12],[.65,1.2],[-.7,1.25],[.55,1.25]]),
  usp:profile(.017,.004,.13,14,.33,14,.026,.0011,[[0,1],[.2,1.02],[-.3,1.06],[.35,1.04],[-.2,1]]),
  glock:profile(.014,.006,.12,15,.31,16,.020,.0015,[[0,1],[-.2,1.08],[.4,1.12],[-.5,1.1],[.4,1.08]])
};
export function shotRecoil(id,index){const p=RECOIL[id];if(!p)return{pitch:0,yaw:0,view:0};const loopStart=p.pattern.length>5?4:0,v=p.pattern[index<p.pattern.length?index:loopStart+(index-loopStart)%(p.pattern.length-loopStart)];return{pitch:p.pitch*v[1],yaw:p.yaw*v[0],view:p.pitch};}
export function recoverRecoil(id,state,age,dt){const p=RECOIL[id];if(!p)return{pitch:0,yaw:0,view:0};const factor=Math.exp(-p.recover*Math.min(dt,Math.max(0,age-p.delay)));return{pitch:state.pitch*factor,yaw:state.yaw*factor,view:state.view*Math.exp(-p.view*dt)};}

// View models and the world use different FOVs. Preserve the barrel's exact
// screen projection while converting its depth into a world-space muzzle.
export function viewMuzzle(model,viewCamera,worldCamera){
  model.updateWorldMatrix(true,true);viewCamera.updateMatrixWorld(true);worldCamera.updateMatrixWorld(true);
  const r=model.userData.rig,point=r.core.localToWorld(r.muzzle.clone()),ndc=point.clone().project(viewCamera);
  const depth=Math.max(.12,-point.clone().applyMatrix4(viewCamera.matrixWorldInverse).z),half=Math.tan(T.MathUtils.degToRad(worldCamera.fov*.5))*depth;
  return new T.Vector3(ndc.x*half*worldCamera.aspect,ndc.y*half,-depth).applyMatrix4(worldCamera.matrixWorld);
}
export function actorMuzzle(model,fallback){if(!model)return fallback.clone();model.updateWorldMatrix(true,true);const r=model.userData.rig;return r.core.localToWorld(r.muzzle.clone());}
export const KEY_ACTIONS={KeyR:'reload',KeyE:'use',KeyG:'drop',KeyQ:'lastinv',KeyF:'inspect',Digit1:'primary',Digit2:'pistol',Digit3:'knife',Digit4:'grenade',Digit5:'bomb',Digit6:'grenade',KeyB:'buy',KeyZ:'radio1',KeyX:'radio2',KeyC:'radio3'};
