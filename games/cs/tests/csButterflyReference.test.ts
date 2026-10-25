import * as T from 'three';
import {afterEach,describe,expect,it} from 'vitest';
import {makeWeapon} from '../src/csWeapons.js';
import {applyWeaponAnimation,sampleWeaponMotion} from '../src/csWeaponMotion.js';
import {BUTTERFLY_VARIANTS,BUTTERFLY_DEPLOY_DURATION,BUTTERFLY_INSPECT_DURATION,chooseButterflyVariant} from '../src/csButterflyKnife.js';

const models:T.Object3D[]=[];
const make=()=>{const m=makeWeapon('knife',true,'butterfly');models.push(m);return m;};
afterEach(()=>{for(const m of models.splice(0))m.traverse((o:any)=>{if(o.geometry&&!o.geometry.userData.sharedCharacter)o.geometry.dispose();o.skeleton?.dispose();});});
const pose=(state:any={})=>sampleWeaponMotion('knife',{knifeModel:'butterfly',...state});
function frameDirection(r:any,object:T.Object3D,vector:T.Vector3){
  return vector.transformDirection(object.matrixWorld).applyQuaternion(r.knifeFrame.getWorldQuaternion(new T.Quaternion()).invert());
}

// Ray parity against the ACTUAL ground blade triangles, including its bores,
// bevels and curved outline. A blade bbox is not a physical collision test.
function bladePenetrations(model:T.Object3D){
  const r=model.userData.rig,hand=r.knifeRight,blade=model.getObjectByName('butterfly-ground-blade') as T.Mesh;
  model.updateMatrixWorld(true);hand.skeleton.update();
  const positions=blade.geometry.attributes.position,triangles:T.Vector3[][]=[];
  for(let i=0;i<positions.count;i+=3)triangles.push([0,1,2].map(j=>new T.Vector3().fromBufferAttribute(positions,i+j)));
  const transform=blade.matrixWorld.clone().invert().multiply(hand.mesh.matrixWorld),ray=new T.Ray(),hit=new T.Vector3(),hits:any[]=[];
  for(let i=0;i<hand.mesh.geometry.attributes.position.count;i++){
    const p=hand.mesh.getVertexPosition(i,new T.Vector3()).applyMatrix4(transform);
    if(Math.abs(p.x)>.0017||p.y<-.007||p.y>.129||p.z<-.006||p.z>.023)continue;
    ray.set(new T.Vector3(-.02,p.y,p.z),new T.Vector3(1,0,0));const xs:number[]=[];
    for(const [a,b,c] of triangles)if(ray.intersectTriangle(a,b,c,false,hit))xs.push(hit.x);
    xs.sort((a,b)=>a-b);const unique=xs.filter((x,j)=>j===0||Math.abs(x-xs[j-1])>1e-8);
    for(let j=0;j+1<unique.length;j+=2)if(p.x>unique[j]+1e-7&&p.x<unique[j+1]-1e-7)hits.push({vertex:i,bone:hand.skeleton.bones[hand.mesh.geometry.attributes.skinIndex.getX(i)].name,depth:Math.min(p.x-unique[j],unique[j+1]-p.x),point:p.toArray()});
  }
  return hits;
}

describe('reference-led CSGO butterfly phase scope',()=>{
  it('keeps compatibility timing and only the two draws / one verified inspect family',()=>{
    // UNKNOWNTech draw clips are labelled SLOW. WEBE clock corroborates normal
    // inspect playback, but does not establish exact native ending/hold rules.
    expect(BUTTERFLY_VARIANTS).toEqual({draw:2,inspect:1});
    expect(BUTTERFLY_DEPLOY_DURATION).toBe(1.05);expect(BUTTERFLY_INSPECT_DURATION).toBe(3.4);
    for(const id of [1,2,-1,NaN,Infinity,null,undefined,'1'])for(const t of [.05,.15,.23,.30,.5,.9]){
      expect(pose({inspectProgress:t,butterflyInspectVariant:id})).toEqual(pose({inspectProgress:t,butterflyInspectVariant:0}));
    }
    for(const value of [0,.49,1,NaN,Infinity])expect(chooseButterflyVariant('inspect',()=>value)).toBe(0);
  });
  it('enters both draws fully closed, then releases before gathering the handles',()=>{
    for(const variant of [0,1]){
      const closed=pose({deployProgress:0,butterflyDrawVariant:variant});
      expect(closed.butterflyBlade).toBe(-Math.PI);expect(closed.butterflyHandle).toBe(Math.PI);
      expect(pose({deployProgress:.30,butterflyDrawVariant:variant}).knifeOpen).toBeGreaterThan(.6);
      // The catch now follows gathering instead of closing over a moving
      // free shaft; the last percent is nearly closed and ends at exact idle.
      expect(pose({deployProgress:.99,butterflyDrawVariant:variant}).knifeOpen).toBeLessThan(.05);
      expect(pose({deployProgress:1,butterflyDrawVariant:variant}).knifeOpen).toBe(0);
    }
    const m=make(),r=m.userData.rig,safe=m.getObjectByName('butterfly-safe-handle')!;
    applyWeaponAnimation(m,{deployProgress:.29,butterflyDrawVariant:1});m.updateMatrixWorld(true);
    expect(frameDirection(r,r.butterflyBlade,new T.Vector3(0,1,0)).y).toBeLessThan(-.99);
    expect(frameDirection(r,r.butterflyHandle,new T.Vector3(0,-1,0)).y).toBeGreaterThan(.99);
    expect(frameDirection(r,safe,new T.Vector3(0,-1,0)).y).toBeLessThan(-.99);
  });
  it('holds the blade upright at the tang with BOTH handles forming a downward V',()=>{
    const m=make(),r=m.userData.rig,safe=m.getObjectByName('butterfly-safe-handle')!;
    const motion=applyWeaponAnimation(m,{inspectProgress:.5});m.updateMatrixWorld(true);
    expect(motion.knifeContact).toBe(1);expect(motion.knifeOpen).toBeGreaterThan(.8);
    const blade=frameDirection(r,r.butterflyBlade,new T.Vector3(0,1,0));
    const a=frameDirection(r,safe,new T.Vector3(0,-1,0)),b=frameDirection(r,r.butterflyHandle,new T.Vector3(0,-1,0));
    expect(blade.y).toBeCloseTo(1,10);expect(a.y).toBeLessThan(-.5);expect(b.y).toBeLessThan(-.5);
    // Render review rejected the former ~74-degree fan. The reference V is
    // ~40 degrees projected; preserve a narrower real V, not a closed pair.
    expect(a.angleTo(b)).toBeGreaterThan(.5);expect(a.angleTo(b)).toBeLessThan(.8);
    expect(a.z*b.z).toBeLessThan(0);
    const tang=r.knifeFrame.worldToLocal(r.butterflyBlade.localToWorld(new T.Vector3(0,0,0)));
    expect(tang.distanceTo(r.butterflyContact.center)).toBeLessThan(1e-10);
    expect(r.butterflyContact.surfaceFound).toBe(true);
    expect(r.butterflyContact.surface.x-tang.x).toBeCloseTo(.00665,10); // actual outer rivet/slot surface
    expect(r.butterflyContact.thumbGap).toBeCloseTo(.00665,4);
  });
  it('keeps contact caches per hand and preserves every phalanx through the full rig solve',()=>{
    const a=make(),b=make(),ra=a.userData.rig,rb=b.userData.rig;
    const lengths=ra.knifeRight.skeleton.bones.map((bone:T.Bone)=>bone.position.length());
    applyWeaponAnimation(a,{inspectProgress:.5});
    const before=ra.knifeRight.skeleton.bones.map((bone:T.Bone)=>bone.quaternion.toArray());
    b.position.set(2,-3,4);b.rotation.set(.8,-.3,.6);b.scale.setScalar(1.2);
    applyWeaponAnimation(b,{inspectProgress:.23});
    expect(ra.knifeRight.butterflyContactSample).not.toBe(rb.knifeRight.butterflyContactSample);
    expect(ra.knifeRight.butterflyThumbSample).not.toBe(rb.knifeRight.butterflyThumbSample);
    expect(ra.knifeRight.skeleton.bones.map((bone:T.Bone)=>bone.quaternion.toArray())).toEqual(before);
    for(let i=0;i<=60;i++)for(const action of [0,1,2]){
      const state=action===2?{inspectProgress:i/60}:{deployProgress:i/60,butterflyDrawVariant:action};
      applyWeaponAnimation(a,state);
      expect(ra.knifeRight.skeleton.bones.map((bone:T.Bone)=>bone.position.length())).toEqual(lengths);
      expect(ra.knifeRight.group.scale.toArray()).toEqual([.85,.85,.85]);
    }
  });
  it('detects the former folded-blade-through-fingers fit rather than accepting its bounding box',()=>{
    const m=make();applyWeaponAnimation(m,{deployProgress:0});
    m.userData.rig.knifePivot.position.x=0;
    expect(bladePenetrations(m).length).toBeGreaterThan(5);
  });
  it('keeps actual glove surface vertices outside blade solids at dense phases and reference keyposes',()=>{
    // Samples real skin vertices against real steel, including pivot holes.
    // This is not a proof of continuous swept triangle/triangle clearance.
    const m=make(),failures:any[]=[];
    for(const action of [0,1,2])for(const t of [...new Set([...Array.from({length:241},(_,i)=>i/240),.08,.15,.23,.29,.32,.44,.5,.62,.8,.95])]){
      const state=action===2?{inspectProgress:t}:{deployProgress:t,butterflyDrawVariant:action};
      applyWeaponAnimation(m,state);const hits=bladePenetrations(m);
      if(hits.length)failures.push({state,count:hits.length,bones:[...new Set(hits.map(h=>h.bone))],deepest:Math.max(...hits.map(h=>h.depth))});
    }
    expect(failures).toEqual([]);
  });
});
