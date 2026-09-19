import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {DEPLOY,chargingGrip,chargingRotation,reachChargingAction} from './csWeaponDeploy.js';

// Cache immutable URLs, never an active release base or an implicit team library.
const characterAssets=new Map();
const SCALE=1.005;

function disposeCharacterAsset(asset){
  const geometries=new Set(),materials=new Set(),textures=new Set(),skeletons=new Set(),images=new Set();
  for(const scene of asset.scenes||[asset.scene])scene.traverse(o=>{
    if(o.geometry)geometries.add(o.geometry);
    if(o.skeleton)skeletons.add(o.skeleton);
    for(const material of [].concat(o.material||[]))materials.add(material);
  });
  for(const material of materials)for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
  for(const texture of textures){if(texture.source?.data)images.add(texture.source.data);texture.dispose();}
  for(const image of images)image.close?.();
  for(const resource of [...skeletons,...geometries,...materials])resource.dispose();
}

// Parsing is pure with respect to game instances; callers retain the result.
export async function parseSoldierAsset(buffer,configureLoader){
  const loader=new GLTFLoader();configureLoader?.(loader);
  const asset=await loader.parseAsync(buffer,'');
  const clips=['Death01','Pistol_Idle_Loop','Idle_Loop','Walk_Loop','Jog_Fwd_Loop','Crouch_Fwd_Loop','Crouch_Idle_Loop','Jump_Loop'];
  const bones=['Head','neck_01','pelvis','spine_01','spine_03',...['l','r'].flatMap(side=>['clavicle','upperarm','lowerarm','hand','thigh','calf','foot'].map(name=>name+'_'+side))];
  if(bones.some(name=>!asset.scene.getObjectByName(name))||clips.some(name=>!asset.animations.some(c=>c.name===name))){disposeCharacterAsset(asset);throw new Error('Incomplete character asset');}
  asset.scene.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;o.frustumCulled=false;o.geometry.userData.sharedCharacter=true;for(const material of [].concat(o.material))material.userData.sharedCharacter=true;}});
  return asset;
}

function acquireCharacterAsset(url){
  let entry=characterAssets.get(url);
  if(!entry){
    entry={url,refs:0,asset:null,controller:new AbortController()};
    characterAssets.set(url,entry);
    entry.promise=(async()=>{
      const timer=setTimeout(()=>entry.controller.abort(),20000);
      try{
        const response=await fetch(url,{signal:entry.controller.signal});
        if(!response.ok)throw new Error('Character asset unavailable');
        const asset=await parseSoldierAsset(await response.arrayBuffer());
        // GLTF parsing itself cannot be aborted. Retire a late completion.
        if(!entry.refs||entry.controller.signal.aborted){disposeCharacterAsset(asset);throw new DOMException('Character load cancelled','AbortError');}
        entry.asset=asset;return asset;
      }catch(error){if(characterAssets.get(url)===entry)characterAssets.delete(url);throw error;}
      finally{clearTimeout(timer);}
    })();
  }
  entry.refs++;
  return entry;
}
function releaseCharacterAsset(entry){
  if(--entry.refs)return;
  if(characterAssets.get(entry.url)===entry)characterAssets.delete(entry.url);
  entry.controller.abort();
  if(entry.asset){disposeCharacterAsset(entry.asset);entry.asset=null;}
}

// One explicit lease per instance. Dispose after its actors/corpses are removed.
// An ordinary team failure keeps the other team and allows procedural fallback;
// later preloads retry failed URLs. An aborted instance never receives a library.
export async function preloadSoldiers(assetUrl,{signal}={}){
  if(typeof assetUrl!=='function')throw new TypeError('preloadSoldiers requires an instance assetUrl');
  if(signal?.aborted)throw signal.reason||new DOMException('Character load cancelled','AbortError');
  const urls=['ct','t'].map(team=>String(assetUrl('assets/characters/'+team+'-sample.glb')));
  const entries=urls.map(acquireCharacterAsset);
  let disposed=false,onAbort;
  const library={ct:null,t:null,urls:Object.freeze({ct:urls[0],t:urls[1]}),get disposed(){return disposed;},dispose(){
    if(disposed)return;disposed=true;signal?.removeEventListener('abort',onAbort);
    library.ct=library.t=null;for(const entry of entries)releaseCharacterAsset(entry);
  }};
  return new Promise((resolve,reject)=>{
    onAbort=()=>{library.dispose();reject(signal.reason||new DOMException('Character load cancelled','AbortError'));};
    signal?.addEventListener('abort',onAbort,{once:true});
    if(signal?.aborted)onAbort();
    Promise.all(entries.map(async(entry,i)=>{
      try{const asset=await entry.promise;if(!disposed)library[i?'t':'ct']=asset;}
      catch(error){if(!disposed)console.warn((i?'T':'CT')+' character:',error);}
    })).then(()=>{if(!disposed)resolve(library);});
  });
}

export function buildSkinnedSoldier(team,library){
  const template=!library?.disposed&&library?.[team];if(!template)return null;
  const g=new T.Group(),root=clone(template.scene);root.rotation.y=Math.PI;root.scale.setScalar(SCALE);g.add(root);
  const bones={};root.traverse(o=>{if(o.isBone)bones[o.name]=o;});
  g.updateMatrixWorld(true);
  const neckFacing=bones.neck_01.getWorldQuaternion(new T.Quaternion()),headFacing=bones.Head.getWorldQuaternion(new T.Quaternion());
  const mixer=new T.AnimationMixer(root),actions={};
  for(const clip of template.animations)actions[clip.name]=mixer.clipAction(clip);
  const rest=new Map(Object.values(bones).map(b=>[b,b.quaternion.clone()]));
  const restPositions=new Map(Object.values(bones).map(b=>[b,b.position.clone()]));
  const grip=new Map();for(const track of actions.Pistol_Idle_Loop.getClip().tracks){const bone=bones[track.name.split('.')[0]];if(bone&&/^(index|middle|ring|pinky|thumb)_/.test(bone.name)&&track.name.endsWith('.quaternion'))grip.set(bone,new T.Quaternion().fromArray(track.createInterpolant().evaluate(.3)));}
  const bindPosition={},bindFacing={};for(const [name,bone]of Object.entries(bones)){bindPosition[name]=bone.getWorldPosition(new T.Vector3());bindFacing[name]=bone.getWorldQuaternion(new T.Quaternion());}
  const meshes=[],soles=[];let skeleton;root.traverse(o=>{if(o.isSkinnedMesh){if(!skeleton)skeleton=o.skeleton;else o.skeleton=skeleton;meshes.push(o);if(o.name.startsWith('Boot_sole')||o.name.startsWith('Boot sole'))soles.push(o);}});
  const state={root,bones,mixer,actions,rest,grip,restPositions,bindPosition,bindFacing,meshes,soles,neckFacing,headFacing,current:null,dead:false,crouched:false,weaponYOffset:0,gaitPhase:0,moveBlend:0,gaitDirection:new T.Vector3(0,0,-1)};
  g.userData={team,skinned:state,groundOffset:0,gun:null,arms:[],legs:[],head:bones.Head};
  updateSkinnedSoldier(g,0,{speed:0,grounded:true});return g;
}

function switchAction(state,name,fade=.16){
  if(state.current===name)return;
  if(state.current)state.actions[state.current]?.fadeOut(fade);
  state.actions[name].reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(fade).play();
  if(!state.current)state.actions[name].stopFading();state.current=name;
}

function floorHeight(g,parts,stride){
  const inverse=new T.Matrix4().copy(g.matrixWorld).invert(),v=new T.Vector3();let floor=Infinity;
  for(const mesh of parts){
    mesh.skeleton.update();
    for(let i=0;i<mesh.geometry.attributes.position.count;i+=stride){
      mesh.getVertexPosition(i,v);v.applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);floor=Math.min(floor,v.y);
    }
  }
  return floor;
}

export function updateSkinnedSoldier(g,dt,{speed=0,crouched=false,grounded=true,velocity}={}){
  const s=g.userData.skinned;if(!s)return false;
  if(s.dead){s.mixer.stopAllAction();s.dead=false;s.current=null;}
  const name=!grounded?'Jump_Loop':crouched?(speed>.15?'Crouch_Fwd_Loop':'Crouch_Idle_Loop'):speed>1.8?'Jog_Fwd_Loop':speed>.15?'Walk_Loop':'Idle_Loop';
  switchAction(s,name);s.crouched=crouched;
  s.weaponYOffset=crouched?-.50:0;
  s.actions[name].setEffectiveTimeScale(speed>.15&&grounded?T.MathUtils.clamp(speed/(crouched?1.25:name==='Jog_Fwd_Loop'?2.7:1.35),.65,1.6):1);
  s.mixer.update(dt);s.root.position.y=-.005;g.updateMatrixWorld(true);
  if(grounded&&!crouched)groundedGait(g,dt,speed,velocity);
  else{
    // Preserve the source's bent legs while giving its upper chest a stable
    // firing frame. Its original kneeling clip rolls both shoulders forward.
    const chest=s.bones.spine_03,facing=g.getWorldQuaternion(new T.Quaternion());
    const rotation=new T.Quaternion().setFromEuler(new T.Euler(crouched?-.68:-.10,-.29,0,'YXZ'));
    chest.quaternion.copy(chest.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(facing.multiply(rotation).multiply(s.bindFacing.spine_03)));
    for(const side of ['l','r'])s.bones['clavicle_'+side].quaternion.copy(s.rest.get(s.bones['clavicle_'+side]));
    g.updateMatrixWorld(true);protractShoulder(g);
  }
  // Locomotion supplies the body. Keep the neck and gaze facing the firing
  // direction, including the deeply bent crouch in the source animation.
  const facing=g.getWorldQuaternion(new T.Quaternion());
  for(const [bone,rest]of [[s.bones.neck_01,s.neckFacing],[s.bones.Head,s.headFacing]]){
    bone.quaternion.copy(bone.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(facing.clone().multiply(rest)));bone.updateWorldMatrix(false,true);
  }
  if(grounded){const floor=floorHeight(g,s.soles,4);if(Number.isFinite(floor))s.root.position.y-=floor;}
  g.updateMatrixWorld(true);return true;
}

// A restrained, directional gait on the anatomical skeleton. Feet have a
// planted phase and a low swing arc; the torso does not inherit the source
// library's exaggerated hip sway, wide stance or high-knee jog.
function groundedGait(g,dt,speed,velocity){
  const s=g.userData.skinned,b=s.bones;
  for(const bone of Object.values(b)){bone.quaternion.copy(s.rest.get(bone));bone.position.copy(s.restPositions.get(bone));}
  const moving=speed>.15,blend=1-Math.exp(-dt*12);
  s.moveBlend=T.MathUtils.lerp(s.moveBlend,moving?1:0,blend);
  s.gaitSpeed=dt===0?speed:T.MathUtils.lerp(s.gaitSpeed??speed,speed,1-Math.exp(-dt*9));
  const run=T.MathUtils.clamp((s.gaitSpeed-1.4)/2,0,1),frequency=1.05+s.gaitSpeed*.36,stance=.63-run*.10;
  s.gaitPhase=(s.gaitPhase+dt*frequency*s.moveBlend)%1;
  if(velocity&&Math.hypot(velocity.x,velocity.z)>.1)s.gaitDirection.lerp(new T.Vector3(velocity.x,0,velocity.z).normalize(),blend).normalize();
  g.updateMatrixWorld(true);
  const cycle=s.gaitPhase*Math.PI*2,weight=Math.sin(cycle)*s.moveBlend;
  const pelvis=s.bindPosition.pelvis.clone();pelvis.y-=.034+run*.015*s.moveBlend;
  pelvis.x+=weight*.009;
  pelvis.y+=Math.cos(cycle*2)*.005*s.moveBlend;
  b.pelvis.position.copy(b.pelvis.parent.worldToLocal(g.localToWorld(pelvis)));
  g.updateMatrixWorld(true);
  const facing=g.getWorldQuaternion(new T.Quaternion());
  // A small weight transfer travels through hips and chest; the gun and gaze
  // remain stable through the existing hand/neck constraints.
  b.pelvis.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),weight*.035));g.updateMatrixWorld(true);
  const torso=new T.Quaternion().setFromEuler(new T.Euler(-.025-run*.045*s.moveBlend,-.29-weight*.018,weight*.007,'YXZ'));
  b.spine_01.quaternion.copy(b.spine_01.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(facing.clone().multiply(torso).multiply(s.bindFacing.spine_01)));
  g.updateMatrixWorld(true);
  protractShoulder(g);
  // During stance, local foot speed cancels travel speed. The old fixed
  // stride let the feet slide while the body moved at a different speed.
  const stride=Math.min(.88,s.gaitSpeed*stance/frequency)*s.moveBlend;
  s.footContacts={};
  for(const [side,phaseOffset,sign]of [['l',0,-1],['r',.5,1]]){
    const phase=(s.gaitPhase+phaseOffset)%1,swing=phase<stance?0:(phase-stance)/(1-stance);
    const slope=-(1-stance)/stance;
    const along=phase<stance?.5-phase/stance:-.5+slope*swing+(3-3*slope)*swing*swing+(-2+2*slope)*swing*swing*swing;
    const foot=s.bindPosition['foot_'+side].clone();foot.x=sign*.125;
    foot.z+=sign*.023*(1-s.moveBlend);foot.z+=s.gaitDirection.z*along*stride;foot.x+=s.gaitDirection.x*along*stride*.42;foot.x=sign*Math.max(.072,sign*foot.x);
    foot.y+=Math.sin(swing*Math.PI)**2*(.035+run*.025)*s.moveBlend;
    const contact=phase/stance,roll=(phase<stance?.11*(1-T.MathUtils.smoothstep(contact,0,.17))-.13*T.MathUtils.smoothstep(contact,.76,1):-.13*Math.cos(swing*Math.PI))*s.moveBlend;
    s.footContacts[side]=phase<stance;
    const turn=new T.Quaternion().setFromEuler(new T.Euler(roll,sign*-.035,0));
    const rotation=facing.clone().multiply(turn).multiply(s.bindFacing['foot_'+side]);
    solveLimb(g,b['thigh_'+side],b['calf_'+side],b['foot_'+side],g.localToWorld(foot),new T.Vector3(sign*.10,0,-1));
    const bone=b['foot_'+side];bone.quaternion.copy(bone.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(rotation));bone.updateWorldMatrix(false,true);
  }
  g.updateMatrixWorld(true);
}

function protractShoulder(g){
  const clavicle=g.userData.skinned.bones.clavicle_l,axis=new T.Vector3(0,1,0).transformDirection(g.matrixWorld);
  const protract=new T.Quaternion().setFromAxisAngle(axis,-.28);
  clavicle.quaternion.copy(clavicle.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(protract.multiply(clavicle.getWorldQuaternion(new T.Quaternion()))));
  g.updateMatrixWorld(true);
}

function aimBone(bone,child,point){
  const start=bone.getWorldPosition(new T.Vector3()),end=child.getWorldPosition(new T.Vector3());
  const delta=new T.Quaternion().setFromUnitVectors(end.sub(start).normalize(),point.clone().sub(start).normalize());
  const world=bone.getWorldQuaternion(new T.Quaternion()).premultiply(delta);
  bone.quaternion.copy(bone.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(world));
  bone.updateWorldMatrix(false,true);
}

function solveLimb(g,upper,lower,endBone,goal,pole){
  const start=upper.getWorldPosition(new T.Vector3()),elbow=lower.getWorldPosition(new T.Vector3()),wrist=endBone.getWorldPosition(new T.Vector3());
  const a=start.distanceTo(elbow),b=elbow.distanceTo(wrist),axis=goal.clone().sub(start),distance=T.MathUtils.clamp(axis.length(),.04,a+b-.004);axis.normalize();
  const along=(a*a-b*b+distance*distance)/(2*distance),bend=Math.sqrt(Math.max(0,a*a-along*along));
  pole.transformDirection(g.matrixWorld).addScaledVector(axis,-pole.dot(axis)).normalize();
  const middle=start.clone().addScaledVector(axis,along).addScaledVector(pole,bend);
  aimBone(upper,lower,middle);aimBone(lower,endBone,start.clone().addScaledVector(axis,distance));
}

function solveArm(g,suffix,palm,handWorld){
  const s=g.userData.skinned,upper=s.bones['upperarm_'+suffix],lower=s.bones['lowerarm_'+suffix],hand=s.bones['hand_'+suffix];
  const goal=palm.clone().sub(new T.Vector3(0,.062*SCALE,0).applyQuaternion(handWorld));
  solveLimb(g,upper,lower,hand,goal,new T.Vector3(suffix==='l'?-.45:.45,-1,.18));
  hand.quaternion.copy(hand.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(handWorld));
  hand.updateWorldMatrix(false,true);
  for(const name of ['index','middle','ring','pinky','thumb']){
    for(let i=1;i<=3;i++){const bone=s.bones[name+'_0'+i+'_'+suffix];if(bone)bone.quaternion.copy(name==='thumb'?(s.grip.get(bone)||s.rest.get(bone)):s.rest.get(bone));}
    hand.updateWorldMatrix(false,true);
    if(name==='thumb')continue;
    const axis=new T.Vector3(0,0,1).applyQuaternion(handWorld),trigger=name==='index'&&suffix==='r';
    for(let i=1;i<=3;i++){
      const bone=s.bones[name+'_0'+i+'_'+suffix];if(!bone)continue;
      const angle=(trigger?[.50,.78,.43]:[.82,1.12,.62])[i-1]*(suffix==='l'?-1:1);
      const curl=new T.Quaternion().setFromAxisAngle(axis,angle).multiply(bone.getWorldQuaternion(new T.Quaternion()));
      bone.quaternion.copy(bone.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(curl));bone.updateWorldMatrix(false,true);
    }
  }
}

export function poseSkinnedSoldierWeapon(g,pose={}){
  const s=g.userData.skinned,model=g.userData.gun;if(!s||!model||s.dead)return;
  const r=model.userData.rig;g.updateMatrixWorld(true);
  if(!r.thirdPerson){
    const box=new T.Box3(),inverse=model.matrixWorld.clone().invert();r.core.traverse(o=>{if(o.isMesh){o.geometry.computeBoundingBox();box.union(o.geometry.boundingBox.clone().applyMatrix4(inverse.clone().multiply(o.matrixWorld)));}});
    const compact=['deagle','usp','glock','mac10','knife','he','c4'].includes(r.id);
    const support=r.restLeft.clone();
    // The rear of the fore-end is reachable in a shouldered stance. First-person
    // grip anchors remain unchanged; these are local contacts for the full body.
    if(r.id==='ak47')support.z=-.112;
    if(r.id==='awp')support.z=-.065;
    if(r.id==='scout')support.z=-.048;
    if(['m4a1','sg552','g3sg1','m3','xm1014','m249'].includes(r.id))support.z=-.137;
    if(r.id==='m4a1')support.z=-.088;
    if(r.id==='m3')support.z=-.125;
    if(r.id==='g3sg1')support.z=-.095;
    if(r.id==='m249')support.set(-.040,-.085,.010);
    r.thirdPerson={compact,rear:new T.Vector3(0,-.018,box.max.z),support};
  }
  const profile=r.thirdPerson,rot=pose.rotation||[0,0,0],off=pose.offset||[0,0,0];
  model.rotation.set(rot[0]*.55,(profile.compact?0:.18)+rot[1]*.5,rot[2]*.55);
  if(profile.compact){
    const shoulder=g.worldToLocal(s.bones.upperarm_r.getWorldPosition(new T.Vector3()));
    model.position.set(r.id==='c4'?0:r.id==='mac10'?.10:.13,shoulder.y-(r.id==='knife'?.21:.12),r.id==='knife'?-.30:r.id==='mac10'?-.32:-.37);
  }else{
    const shoulder=g.worldToLocal(s.bones.upperarm_r.getWorldPosition(new T.Vector3()));
    shoulder.add(new T.Vector3(.012,-.015,r.id==='aug'?-.045:r.id==='p90'?-.10:-.075));
    model.position.copy(shoulder.sub(profile.rear.clone().applyQuaternion(model.quaternion)));
  }
  // First-person presentation shifts the gun toward the screen centre. A
  // shouldered world model must keep its stock outside the central torso.
  model.position.add(new T.Vector3(Math.max(-.03,off[0])*.25,off[1]*.25,Math.min(0,off[2])*.25));
  if(!profile.compact)model.position.x+=.030*Math.max(pose.leftMag||0,pose.leftRack||0,pose.rightRack||0,pose.rightBolt||0);
  model.updateMatrix();g.updateMatrixWorld(true);
  s.weaponGrips={};
  for(const [suffix,anchor]of [['l',r.restLeft],['r',r.restRight]]){
    const target=suffix==='l'?profile.support.clone():anchor.clone();
    if(suffix==='l'&&pose.leftMag)target.lerp(r.shell?r.shell.position.clone().add(new T.Vector3(-.015,-.015,.008)):(r.magGrip?.clone()||new T.Vector3(-.027,-.045,.014)).applyEuler(r.magazine.rotation).add(r.magazine.position),pose.leftMag);
    if(suffix==='l'&&pose.leftRack)reachChargingAction(target,chargingGrip(r,pose),pose.leftRack,DEPLOY[r.id]);
    if(suffix==='l'&&r.id==='m3')target.z+=pose.pump||0;
    if(suffix==='r'&&pose.rightBolt)reachChargingAction(target,new T.Vector3(...DEPLOY[r.id].grip).applyEuler(r.boltHandle.rotation).add(r.boltHandle.position).add(r.bolt.position),pose.rightBolt,DEPLOY[r.id]);
    if(suffix==='r'&&pose.rightRack)reachChargingAction(target,chargingGrip(r,pose),pose.rightRack,DEPLOY[r.id]);
    target.multiply(r.core.scale).applyMatrix4(model.matrix);g.localToWorld(target);
    s.weaponGrips[suffix]=target.clone();
    // The support hand follows the fore-end; the firing hand wraps down the grip.
    const knifeHand=r.id==='knife'&&suffix==='r';
    const under=suffix==='l'&&r.supportGrip==='underhand';
    const y=knifeHand?new T.Vector3(0,1,0):under?new T.Vector3(1,0,0):new T.Vector3(0,-.97,-.24);
    const x=knifeHand?new T.Vector3(0,0,-1):under?new T.Vector3(0,1,0):new T.Vector3(suffix==='l'?-1:1,0,0),z=new T.Vector3().crossVectors(x,y).normalize();
    const local=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y.normalize(),z));
    if(under){const down=new T.Vector3(0,-.97,-.24).normalize(),out=new T.Vector3(-1,0,0),reloadFacing=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(out,down,new T.Vector3().crossVectors(out,down)));local.slerp(reloadFacing,Math.max(pose.leftMag||0,pose.leftRack||0));}
    const rack=suffix==='l'?pose.leftRack||0:Math.max(pose.rightRack||0,pose.rightBolt||0);
    if(rack)local.slerp(chargingRotation(DEPLOY[r.id]?.wrist,suffix==='r'?pose.boltLift||0:0),rack);
    if(knifeHand){if(r.knifeModel!=='karambit')local.copy(r.knifeHandRotation);local.premultiply(r.knifeFrame.quaternion);}
    local.premultiply(model.getWorldQuaternion(new T.Quaternion()));solveArm(g,suffix,target,local);
  }
  g.updateMatrixWorld(true);
}

export function poseSkinnedSoldierDeath(g,age){
  const s=g.userData.skinned;if(!s)return false;
  const action=s.actions.Death01;
  if(!s.dead){
    s.mixer.stopAllAction();action.reset().setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();s.dead=true;s.current='Death01';
  }
  // Sample a real one-shot fall, then retain its last pose for corpse lifetime.
  action.paused=false;action.time=Math.min(age*1.3,action.getClip().duration-.001);s.mixer.update(0);action.paused=true;
  s.root.position.y=-.005;g.updateMatrixWorld(true);
  const floor=floorHeight(g,s.meshes,9);if(Number.isFinite(floor))s.root.position.y-=floor;
  g.updateMatrixWorld(true);return true;
}
