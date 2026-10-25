import * as T from 'three';

// Rivet head + slot relief, measured from the authored rigid stock. Contact
// must sit outside this hardware, not merely outside the thinner blade face.
export const BUTTERFLY_CONTACT_RADIUS=.00665;

// Work in the hand's own skeleton coordinates. Applying a world-space skin
// transform and then cancelling its parent exposes float skin-weight rounding
// to camera translation and makes paused contact drift. Local matrices also
// keep this solve independent of any other model's render/update callbacks.
function boneMatrix(bone,group){
  bone.updateMatrix();const matrix=bone.matrix.clone();
  for(let p=bone.parent;p&&p!==group;p=p.parent){p.updateMatrix();matrix.premultiply(p.matrix);}
  return matrix;
}
function bonePoint(hand,name){return new T.Vector3().setFromMatrixPosition(boneMatrix(hand.bones[name+'_'+hand.side],hand.group)).multiplyScalar(hand.scale).applyQuaternion(hand.group.quaternion).add(hand.group.position);}
function skin(hand){
  const matrices=hand.skeleton.bones.map((bone,i)=>boneMatrix(bone,hand.group).multiply(hand.skeleton.boneInverses[i]));
  const g=hand.mesh.geometry,indices=g.attributes.skinIndex,weights=g.attributes.skinWeight;
  return i=>{
    const base=new T.Vector3().fromBufferAttribute(g.attributes.position,i),p=new T.Vector3();
    for(let k=0;k<4;k++){const weight=weights.getComponent(i,k);if(weight)p.addScaledVector(base.clone().applyMatrix4(matrices[indices.getComponent(i,k)]),weight);}
    return p.multiplyScalar(hand.scale).applyQuaternion(hand.group.quaternion).add(hand.group.position);
  };
}
function padVertices(hand,name){
  // This cache contains only this instance's topology indices, never a bound
  // callback/skeleton from the first constructed hand.
  const cache=hand.butterflyContactVertices||(hand.butterflyContactVertices={});
  if(cache[name])return cache[name];
  const g=hand.mesh.geometry,indices=g.attributes.skinIndex,weights=g.attributes.skinWeight,result=[];
  for(let i=0;i<indices.count;i++){
    let weight=0;for(let k=0;k<4;k++)if(hand.skeleton.bones[indices.getComponent(i,k)].name.startsWith(name))weight+=weights.getComponent(i,k);
    if(weight>.6)result.push(i);
  }
  cache[name]=result;return result;
}
export function butterflyTangContact(hand){
  const vertex=skin(hand),points=padVertices(hand,'index_').map(vertex);
  const surface=points.reduce((a,b)=>b.x<a.x?b:a).clone();
  // A supporting plane keeps adjacent pad triangles outside the tang too.
  // A centreline ray alone touched one triangle but cut through its neighbours.
  // Soft weights make the in-plane anchor continuous when supporting vertices
  // exchange; the extremal surface still meets the rivet support plane.
  let total=0;const anchor=new T.Vector3();
  for(const p of points){const w=Math.exp(-(p.x-surface.x)/.0008);anchor.addScaledVector(p,w);total+=w;}
  anchor.multiplyScalar(1/total);anchor.x=surface.x-BUTTERFLY_CONTACT_RADIUS;
  return {surface,center:anchor,surfaceFound:points.length>0};
}
function aimBone(hand,name,child,target){
  const bone=hand.bones[name+'_'+hand.side],origin=bonePoint(hand,name);
  const from=bonePoint(hand,child).sub(origin).normalize(),to=target.clone().sub(origin).normalize();
  const current=new T.Quaternion().setFromRotationMatrix(boneMatrix(bone,hand.group));
  const parent=new T.Quaternion().setFromRotationMatrix(boneMatrix(bone.parent,hand.group));
  const frame=hand.group.quaternion;
  const delta=new T.Quaternion().setFromUnitVectors(from,to);
  bone.quaternion.copy(parent.invert().multiply(frame.clone().invert()).multiply(delta).multiply(frame).multiply(current));
}
function rotateThumbRoot(hand,delta){
  const bone=hand.bones['thumb_01_'+hand.side];
  const current=new T.Quaternion().setFromRotationMatrix(boneMatrix(bone,hand.group));
  const parent=new T.Quaternion().setFromRotationMatrix(boneMatrix(bone.parent,hand.group));
  const frame=hand.group.quaternion;
  bone.quaternion.copy(parent.invert().multiply(frame.clone().invert()).multiply(delta).multiply(frame).multiply(current));
  hand.group.updateMatrixWorld(true);hand.skeleton.update();
}
function releaseThumb(hand,amount,sweep){
  if(!amount)return;
  // Clear the upright free shaft as well as the folded blade: lift and turn
  // the released thumb around the mechanism's side before opposing the tang.
  const delta=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),1.6*Math.sin(Math.PI*sweep)*amount)
    .multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),T.MathUtils.lerp(1.2,-.95,sweep)*amount));
  rotateThumbRoot(hand,delta);
}
function thumbGap(hand,center){
  const g=hand.mesh.geometry,vertex=skin(hand),selected=new Set(padVertices(hand,'thumb_'));
  if(!hand.butterflyThumbTriangles){
    hand.butterflyThumbTriangles=[];
    for(let i=0;i<g.index.count;i+=3){const ids=[0,1,2].map(k=>g.index.getX(i+k));if(ids.some(id=>selected.has(id)))hand.butterflyThumbTriangles.push(ids);}
  }
  const points=new Map(),point=i=>{if(!points.has(i))points.set(i,vertex(i));return points.get(i);};
  const ray=new T.Ray(),hit=new T.Vector3();let gap=Infinity;
  for(const y of [-.0018,0,.0018])for(const z of [-.0018,0,.0018]){
    ray.set(center.clone().add(new T.Vector3(0,y,z)),new T.Vector3(-1,0,0));
    for(const ids of hand.butterflyThumbTriangles)if(ray.intersectTriangle(...ids.map(point),false,hit))gap=Math.min(gap,ray.origin.distanceTo(hit));
  }
  return gap;
}
function pinchThumb(hand,contact,blend,support){
  if(support===0){contact.thumbGap=null;return;}
  const names=['thumb_01','thumb_02','thumb_03'],original=names.map(name=>hand.bones[name+'_'+hand.side].quaternion.clone());
  const root=bonePoint(hand,'thumb_01'),l1=root.distanceTo(bonePoint(hand,'thumb_02')),l2=bonePoint(hand,'thumb_02').distanceTo(bonePoint(hand,'thumb_03'));
  // Route the thumb around the lower tang edge, not through its steel face.
  // A two-link joint solve preserves every source phalanx length. The distal
  // pad opposes the index at the tang's rivet, outside its actual hardware.
  const end=contact.center.clone().add(new T.Vector3(-.004,-.012,.025));
  const axis=end.clone().sub(root),distance=T.MathUtils.clamp(axis.length(),Math.abs(l1-l2)+1e-6,l1+l2-1e-6);axis.normalize();
  end.copy(root).addScaledVector(axis,distance);
  const along=(l1*l1-l2*l2+distance*distance)/(2*distance);
  const pole=new T.Vector3(0,-1,1);pole.addScaledVector(axis,-pole.dot(axis)).normalize();
  const elbow=root.clone().addScaledVector(axis,along).addScaledVector(pole,Math.sqrt(Math.max(0,l1*l1-along*along)));
  let tipX=-.019,gap=Infinity,lastX=null,lastError=0;
  for(let iteration=0;iteration<8;iteration++){
    names.forEach((name,i)=>hand.bones[name+'_'+hand.side].quaternion.copy(original[i]));
    aimBone(hand,'thumb_01','thumb_02',elbow);aimBone(hand,'thumb_02','thumb_03',end);
    aimBone(hand,'thumb_03','thumb_04_leaf',contact.center.clone().add(new T.Vector3(tipX,.008,-.009)));
    gap=thumbGap(hand,contact.center);
    if(!Number.isFinite(gap)||Math.abs(gap-BUTTERFLY_CONTACT_RADIUS)<.00002)break;
    const error=gap-BUTTERFLY_CONTACT_RADIUS;
    const next=lastX!==null&&Math.abs(error-lastError)>1e-7?tipX-error*(tipX-lastX)/(error-lastError):tipX+error*1.6;
    lastX=tipX;lastError=error;tipX=T.MathUtils.clamp(T.MathUtils.clamp(next,tipX-.012,tipX+.012),-.055,-.001);
  }
  // During the blade-down flick the thumb is released; the index supports the
  // rivet. Do not report the prospective opposing fit as an actual contact.
  contact.thumbGap=support===1&&blend>=.5&&Number.isFinite(gap)?gap:null;
  names.forEach((name,i)=>{const bone=hand.bones[name+'_'+hand.side];bone.quaternion.copy(original[i].slerp(bone.quaternion,T.MathUtils.smoothstep(blend*2,0,1)*support));});
  // Regrip around the tang's lower edge, not by slerping a fingertip straight
  // through the broad blade face. The detour vanishes at both contact states.
  rotateThumbRoot(hand,new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-Math.sin(Math.PI*support)));
  hand.group.updateMatrixWorld(true);hand.skeleton.update();
}

export function placeButterflyContact(rig,motion,hand){
  const blend=motion.knifeContact,blade=motion.butterflyBlade;
  // Closed-channel seating differs by 6 mm from the open paired-handle fit;
  // it prevents the retained fingertips entering the folded blade channel.
  rig.knifePivot.position.set(motion.knifeSeat,0,-.011);
  rig.knifePivot.quaternion.copy(rig.knifeRest)
    .multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),motion.knifeYaw))
    .multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),motion.knifeSpin-blade*blend));
  if(hand)releaseThumb(hand,motion.knifeThumbOut,motion.knifeThumbSweep);
  if(blend>0&&hand){
    const key=[motion.knifeIndexOpen,motion.knifeSplay].join(',');
    if(hand.butterflyContactSample?.key!==key)hand.butterflyContactSample={key,contact:butterflyTangContact(hand)};
    const target=hand.butterflyContactSample.contact,bladeAngle=blade*(1-blend)+motion.knifeSpin;
    // The first tang rivet is a real surface anchor. Transfer positions first,
    // then fit the thumb to the CURRENT rivet, never to a future keypose.
    const local=new T.Vector3(0,.051,0).applyQuaternion(rig.knifePivot.quaternion);
    rig.knifePivot.position.lerp(target.center.clone().sub(local),blend);
    // Handoff follows a raised arc above the index; a straight Cartesian
    // interpolation would drag the tang through the curling finger.
    rig.knifePivot.position.y+=.026*Math.sin(Math.PI*blend);
    const contact={...target,center:rig.knifePivot.position.clone().add(local)};
    const thumbKey=[key,motion.knifeThumb,motion.knifeThumbOut,motion.knifeThumbSweep,motion.knifeThumbPin,blend,bladeAngle,...contact.center.toArray()].join(',');
    if(hand.butterflyThumbSample?.key!==thumbKey){
      pinchThumb(hand,contact,blend,motion.knifeThumbPin);
      hand.butterflyThumbSample={key:thumbKey,gap:contact.thumbGap,rotations:[1,2,3].map(j=>hand.bones['thumb_0'+j+'_'+hand.side].quaternion.clone())};
    }else{
      [1,2,3].forEach((j,i)=>hand.bones['thumb_0'+j+'_'+hand.side].quaternion.copy(hand.butterflyThumbSample.rotations[i]));
      contact.thumbGap=hand.butterflyThumbSample.gap;hand.group.updateMatrixWorld(true);hand.skeleton.update();
    }
    rig.butterflyContact=contact;
  }else rig.butterflyContact=null;
}
