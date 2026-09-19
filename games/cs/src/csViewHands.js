import * as T from 'three';
import {VIEW_HANDS} from './csViewHandData.js';

// Retain the anatomical mesh and fixed-length skeleton of the shipped soldier.
// Finger opening changes joint rotations, never phalanx lengths or palm scale.
export function createViewHand(material,side='r',fitted=false){
 const palmY=y=>y-.025*T.MathUtils.smoothstep(y,.025,.105);
 const data=VIEW_HANDS[side],group=new T.Group(),bones=data.bones.map(d=>{
  const b=new T.Bone();b.name=d.name;b.position.fromArray(d.position);if(fitted&&d.parent===0)b.position.y=palmY(b.position.y);b.quaternion.fromArray(d.quaternion);return b;
 });
 data.bones.forEach((d,i)=>{if(d.parent<0)group.add(bones[i]);else bones[d.parent].add(bones[i]);});
 const positions=fitted?data.position.map((v,i)=>i%3===1?palmY(v):v):data.position;
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new T.Float32BufferAttribute(data.normal,3));
 geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(data.skinIndex,4));geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(data.skinWeight,4));geometry.setIndex(data.index);
 if(fitted)geometry.computeVertexNormals();
 group.updateMatrixWorld(true);const skeleton=new T.Skeleton(bones),mesh=new T.SkinnedMesh(geometry,material);mesh.name='anatomical-'+side+'-glove';mesh.frustumCulled=false;mesh.bind(skeleton);group.add(mesh);
 // The source uses a long stylized palm. Shorten only the metacarpal span;
 // the three phalanges keep the source proportions and articulated lengths.
 // Firearm hands fit both the palm surface and its joints before binding, so
 // shortening the palm cannot leave stretched webbing at the knuckles.
 if(!fitted)for(const bone of bones)if(/^(index|middle|ring|pinky)_01_/.test(bone.name))bone.position.y-=.025;
 const rig={group,mesh,skeleton,bones:Object.fromEntries(bones.map(b=>[b.name,b])),rest:bones.map(b=>b.quaternion.clone()),data,side,scale:.85};group.scale.setScalar(rig.scale);group.name='karambit-'+side+'-hand';return rig;
}

export function poseViewHand(rig,{open=0,thumb=0,relaxed=false,inspect=0,indexCurl=inspect,fingerCurls=null}={}){
 const {bones,side}=rig;
 for(let i=0;i<rig.skeleton.bones.length;i++)rig.skeleton.bones[i].quaternion.copy(rig.rest[i]);
 for(const name of ['index','middle','ring','pinky']){
  const extension=name==='index'&&!relaxed?0:open;
  const closed=fingerCurls?.[name]||(name==='index'?[T.MathUtils.lerp(.12,.72,indexCurl),T.MathUtils.lerp(.40,1.22,indexCurl),1.05]:[T.MathUtils.lerp(name==='pinky'?.24:.18,.82,inspect),T.MathUtils.lerp(.48,1.25,inspect),T.MathUtils.lerp(1.05,.72,inspect)]);
  for(let j=1;j<=3;j++){
   const bone=bones[name+'_0'+j+'_'+side];rig.group.updateMatrixWorld(true);
   const angle=T.MathUtils.lerp(closed[j-1],relaxed?[.20,.30,.14][j-1]:[.08,.14,.08][j-1],extension)*(side==='r'?1:-1);
   const axis=new T.Vector3(0,0,1).applyQuaternion(bones['hand_'+side].getWorldQuaternion(new T.Quaternion()));
   const q=new T.Quaternion().setFromAxisAngle(axis,angle).multiply(bone.getWorldQuaternion(new T.Quaternion()));
   bone.quaternion.copy(bone.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(q));bone.updateWorldMatrix(false,true);
  }
 }
 for(let j=1;j<=3;j++){
  const bone=bones['thumb_0'+j+'_'+side],i=rig.skeleton.bones.indexOf(bone),grip=rig.data.bones[i].grip;
  if(grip)bone.quaternion.fromArray(grip).slerp(rig.rest[i],thumb*.82);
 }
 rig.group.updateMatrixWorld(true);rig.skeleton.update();
}

export function poseFirearmHand(rig,style,reach=0){
 const base=style==='underhand'?[.48,.86,.56]:style==='pistol'?[.55,.93,.55]:[.59,.96,.58],fingerCurls={};
 for(const [i,name]of ['index','middle','ring','pinky'].entries()){
  fingerCurls[name]=base.map((angle,j)=>T.MathUtils.lerp(angle+(j===0?i*.035:0),[.40,.76,.52][j],reach));
  if(rig.side==='r'&&name==='index')fingerCurls[name]=[.24,.62,.38].map((angle,j)=>T.MathUtils.lerp(angle,[.40,.76,.52][j],reach));
 }
 poseViewHand(rig,{fingerCurls,thumb:T.MathUtils.lerp(.16,.30,reach)});
}

export function handPoint(rig,name){return rig.group.worldToLocal(rig.bones[name+'_'+rig.side].getWorldPosition(new T.Vector3())).multiplyScalar(rig.scale);}

export function poseClassicKnifeGrip(rig){
 rig.group.position.set(0,0,0);rig.group.quaternion.identity();
 poseViewHand(rig,{inspect:.88,indexCurl:.88,thumb:0});
 // A closed forward grip: the handle crosses the finger row, with the blade
 // leaving the index/thumb side. There is no ring attachment or reverse flip.
 const row=handPoint(rig,'index_01').sub(handPoint(rig,'pinky_01')).normalize();
 const back=new T.Vector3(0,-1,0).addScaledVector(row,row.y).normalize();
 const source=new T.Matrix4().makeBasis(new T.Vector3().crossVectors(row,back),row,back);
 rig.group.quaternion.setFromRotationMatrix(source.transpose());
 rig.group.position.copy(new T.Vector3(-.037,.077,.003).applyQuaternion(rig.group.quaternion).negate());
 const wrist=new T.Vector3(-.006,.008,.009).multiplyScalar(rig.scale).applyQuaternion(rig.group.quaternion).add(rig.group.position);
 const knuckles=handPoint(rig,'middle_01').applyQuaternion(rig.group.quaternion).add(rig.group.position);
 return {wrist,palm:wrist.clone().lerp(knuckles,.60),forward:knuckles.sub(wrist).normalize()};
}

export function poseButterflyKnifeGrip(rig,motion={}){
 poseClassicKnifeGrip(rig);
 const open=motion.knifeOpen||0;
 // Index and thumb retain a pinch on the safe handle; the other fingers
 // release before the free handle swings, then close only after the catch.
 poseViewHand(rig,{fingerCurls:{index:[.70,1.14,.97].map((v,i)=>T.MathUtils.lerp(v,[.60,1.50,1.20][i],open)),middle:[.79,1.15,.80],ring:[.83,1.19,.81],pinky:[.87,1.20,.80]},open,thumb:motion.knifeThumb||0});
 const thumb=rig.bones.thumb_01_r,frame=rig.group.parent?.getWorldQuaternion(new T.Quaternion())||new T.Quaternion();
 const axis=new T.Vector3(0,1,0).applyQuaternion(frame).applyQuaternion(thumb.parent.getWorldQuaternion(new T.Quaternion()).invert());
 thumb.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(axis,-.85*open));
 rig.group.position.z-=.029;rig.group.position.x+=.004+.016*open;rig.group.position.y-=.035*open;
 // Keep the curled index at the same retained-handle contact while the other
 // fingers open. This prevents the hand sliding away during a finger roll.
 const index=handPoint(rig,'index_03').applyQuaternion(rig.group.quaternion).add(rig.group.position);
 rig.group.position.add(new T.Vector3(.012,.002,-.032).sub(index).multiplyScalar(open));
 rig.group.updateMatrixWorld(true);rig.skeleton.update();
 const wrist=new T.Vector3(-.006,.008,.009).multiplyScalar(rig.scale).applyQuaternion(rig.group.quaternion).add(rig.group.position);
 const knuckles=handPoint(rig,'middle_01').applyQuaternion(rig.group.quaternion).add(rig.group.position);
 return {wrist,palm:wrist.clone().lerp(knuckles,.60),forward:knuckles.sub(wrist).normalize()};
}

export function poseKnifeGrip(rig,motion,ring){
 rig.group.position.set(0,0,0);rig.group.quaternion.identity();
 // Keep a loose index hook in the ring. Curling it with the gripping fingers
 // rolled the palm through the handle during the close inspection hold.
 poseViewHand(rig,{open:motion.knifeOpen,thumb:motion.knifeThumb,inspect:motion.knifeElbowIn,indexCurl:motion.knifeElbowIn*.56});
 const a=handPoint(rig,'index_02'),b=handPoint(rig,'index_03'),axis=b.clone().sub(a).normalize();
 const row=handPoint(rig,'index_01').sub(handPoint(rig,'pinky_01'));row.addScaledVector(axis,-row.dot(axis)).normalize();
 const source=new T.Matrix4().makeBasis(axis,row,new T.Vector3().crossVectors(axis,row));
 const target=new T.Matrix4().makeBasis(new T.Vector3(-1,0,0),new T.Vector3(0,1,0),new T.Vector3(0,0,-1));
 rig.group.quaternion.setFromRotationMatrix(target.multiply(source.transpose()));
 rig.group.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),.55));
 rig.group.position.copy(ring).sub(a.clone().lerp(b,.60).applyQuaternion(rig.group.quaternion));
 const point=name=>handPoint(rig,name).applyQuaternion(rig.group.quaternion).add(rig.group.position);
 const wrist=new T.Vector3(-.006,.008,.009).multiplyScalar(rig.scale).applyQuaternion(rig.group.quaternion).add(rig.group.position),knuckles=point('middle_01');
 return{wrist,palm:wrist.clone().lerp(knuckles,.60),forward:knuckles.sub(wrist).normalize(),indexA:a.applyQuaternion(rig.group.quaternion).add(rig.group.position),indexB:b.applyQuaternion(rig.group.quaternion).add(rig.group.position)};
}
