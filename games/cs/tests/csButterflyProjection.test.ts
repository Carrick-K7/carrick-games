import * as T from 'three';
import {afterEach,describe,expect,it} from 'vitest';
import {makeWeapon} from '../src/csWeapons.js';
import {applyWeaponAnimation,placeWeaponView,WEAPON_VIEW_FOV} from '../src/csWeaponMotion.js';

const models:T.Object3D[]=[];
afterEach(()=>{for(const m of models.splice(0))m.traverse((o:any)=>{if(o.geometry&&!o.geometry.userData.sharedCharacter)o.geometry.dispose();o.skeleton?.dispose();});});
function fixture(t=.5){
  const model=makeWeapon('knife',true,'butterfly');models.push(model);
  const motion=applyWeaponAnimation(model,{inspectProgress:t});placeWeaponView(model,motion);model.updateMatrixWorld(true);
  const camera=new T.PerspectiveCamera(WEAPON_VIEW_FOV,16/9,.01,4);
  const screen=(point:T.Vector3)=>{const p=point.clone().project(camera);return new T.Vector2((p.x+1)*640,(1-p.y)*360);};
  return {model,rig:model.userData.rig,camera,screen};
}
function bladeProjection(f:ReturnType<typeof fixture>){
  const mesh=f.model.getObjectByName('butterfly-ground-blade') as T.Mesh,positions=mesh.geometry.attributes.position;
  const pin=f.screen(f.rig.butterflyBlade.localToWorld(new T.Vector3()));
  const tip=f.screen(f.rig.butterflyBlade.localToWorld(f.rig.knifeTip.clone()));
  const axis=tip.clone().sub(pin),length=axis.length(),normal=new T.Vector2(-axis.y,axis.x).normalize();
  const points=Array.from({length:positions.count},(_,i)=>f.screen(mesh.localToWorld(new T.Vector3().fromBufferAttribute(positions,i))));
  // The cutting blade, not its wider tang or a long axis-aligned bbox. Width
  // is measured perpendicular to the ACTUAL projected tip/pivot centreline.
  const widths=points.filter((_,i)=>positions.getY(i)>.025).map(p=>p.dot(normal));
  let area=0;
  // Group zero contains both real broad faces, excluding bevel side walls.
  for(let i=0;i<mesh.geometry.groups[0].count;i+=3){
    const [a,b,c]=points.slice(i,i+3);area+=Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))/2;
  }
  return {length,width:Math.max(...widths)-Math.min(...widths),area:area/2,pin,tip};
}

function holdDirections(f:ReturnType<typeof fixture>){
  const p=bladeProjection(f),safe=f.model.getObjectByName('butterfly-safe-handle')!;
  const safeEnd=f.screen(safe.localToWorld(new T.Vector3(0,-.138,0)));
  const freeEnd=f.screen(f.rig.butterflyHandle.localToWorld(new T.Vector3(0,-.138,0)));
  const angle=(end:T.Vector2)=>Math.atan2(end.y-p.pin.y,end.x-p.pin.x)*180/Math.PI;
  const a=safeEnd.clone().sub(p.pin),b=freeEnd.clone().sub(p.pin);
  const spread=Math.acos(T.MathUtils.clamp(a.dot(b)/(a.length()*b.length()),-1,1))*180/Math.PI;
  return {...p,safeEnd,freeEnd,bladeAngle:angle(p.tip),safeAngle:angle(safeEnd),freeAngle:angle(freeEnd),spread};
}

describe('butterfly reference-facing view projection',()=>{
  it.each([.46,.50,.65,.75])('presents a broad, adequately framed blade during the sustained inspect hold at %s',t=>{
    const f=fixture(t),p=bladeProjection(f);
    // WEBE 32.5s shows a broad blade, not a steel needle. These conservative
    // width/area ratios reject edge-on evasion without pretending that this
    // model's outline is an exact copy of the reference cosmetic geometry.
    expect(WEAPON_VIEW_FOV).toBe(62);
    expect(p.width/p.length).toBeGreaterThan(.10);
    expect(p.area/(p.length*p.length)).toBeGreaterThan(.06);
    expect(p.length/720).toBeGreaterThan(.25);expect(p.length/720).toBeLessThan(.45);
    expect(p.tip.x).toBeGreaterThan(p.pin.x);expect(p.tip.y).toBeLessThan(p.pin.y);
    expect(p.tip.x).toBeLessThan(1280*.90);expect(p.tip.y).toBeGreaterThan(720*.08);
    expect(p.pin.x).toBeGreaterThan(1280*.5);expect(p.pin.y).toBeLessThan(720*.65);
    // Read from WEBE dense-32.5: blade ~-50deg, safe ~116deg, free ~156deg
    // in screen coordinates. Allow a few degrees for outline/endpoint and
    // perspective differences; neither a vertical safe handle nor horizontal
    // free handle is the observed held silhouette. Broadside checks above
    // must pass AT THE SAME POSE, so edge-on foreshortening cannot fake the V.
    const hold=holdDirections(f);
    expect(hold.bladeAngle).toBeGreaterThan(-56);expect(hold.bladeAngle).toBeLessThan(-44);
    expect(hold.safeAngle).toBeGreaterThan(110);expect(hold.safeAngle).toBeLessThan(122);
    expect(hold.freeAngle).toBeGreaterThan(150);expect(hold.freeAngle).toBeLessThan(163);
    expect(hold.spread).toBeGreaterThan(34);expect(hold.spread).toBeLessThan(46);
    for(const end of [hold.safeEnd,hold.freeEnd]){expect(end.x).toBeLessThan(hold.pin.x);expect(end.y).toBeGreaterThan(hold.pin.y);}
  });
  it('rejects an over-wide handle fan even when the blade is broadside and visible',()=>{
    const f=fixture();f.rig.butterflyBlade.rotation.x=-.42;f.rig.butterflyHandle.rotation.x=-.86;f.model.updateMatrixWorld(true);
    const p=holdDirections(f);
    expect(p.area/(p.length*p.length)).toBeGreaterThan(.06);
    expect(p.spread).toBeGreaterThan(60);
  });
  it('rejects the previously rendered edge-on hold instead of accepting mere visibility',()=>{
    const f=fixture();f.rig.knifeFrame.quaternion.setFromEuler(new T.Euler(.08,2.80,-.48,'ZYX'));f.model.updateMatrixWorld(true);
    const p=bladeProjection(f);expect(p.area/(p.length*p.length)).toBeLessThan(.03);
  });
  it('faces the open palm toward the viewer and exposes three released finger surfaces',()=>{
    const f=fixture(),hand=f.rig.knifeRight;
    const point=(name:string)=>hand.bones[name+'_r'].getWorldPosition(new T.Vector3());
    const wrist=f.rig.knifeFrame.localToWorld(f.rig.knifeWrist.clone());
    const row=point('index_01').sub(point('pinky_01')),forward=point('middle_01').sub(wrist);
    const palmNormal=row.cross(forward).normalize();
    expect(palmNormal.dot(point('middle_01').negate().normalize())).toBeGreaterThan(.75);
    const g=hand.mesh.geometry,indices=g.attributes.skinIndex,weights=g.attributes.skinWeight;
    f.model.traverse((o:any)=>{if(o.isSkinnedMesh)o.computeBoundingSphere();});
    const ray=new T.Raycaster(),palm=f.screen(point('middle_01'));
    for(const finger of ['middle','ring','pinky']){
      const root=f.screen(point(finger+'_01')),tip=f.screen(point(finger+'_04_leaf'));
      expect(tip.x).toBeLessThan(palm.x-35);
      expect(root.distanceTo(tip)).toBeGreaterThan(720*.06);
      const visible=new Set<string>();
      for(let i=0;i<indices.count;i++){
        let distal=0;
        for(let k=0;k<4;k++)if(new RegExp('^'+finger+'_(03|04)').test(hand.skeleton.bones[indices.getComponent(i,k)].name))distal+=weights.getComponent(i,k);
        if(distal<.65)continue;
        const p=hand.mesh.getVertexPosition(i,new T.Vector3()).applyMatrix4(hand.mesh.matrixWorld),screen=f.screen(p);
        if(screen.x<0||screen.x>1280||screen.y<0||screen.y>720)continue;
        const distance=p.length();ray.set(new T.Vector3(),p.clone().normalize());
        const hit=ray.intersectObject(f.model,true)[0];
        if(hit?.object===hand.mesh&&hit.distance>distance-.001)visible.add(Math.round(screen.x/2)+','+Math.round(screen.y/2));
      }
      // Actual skin surfaces must survive hand/knife/sleeve occlusion. A bone
      // point behind a closed fist or an off-screen finger does not count.
      expect(visible.size,finger).toBeGreaterThanOrEqual(6);
    }
  });
  it('keeps the closed draw entry on screen rather than starting with an empty frame',()=>{
    const f=fixture();const motion=applyWeaponAnimation(f.model,{deployProgress:0});placeWeaponView(f.model,motion);f.model.updateMatrixWorld(true);
    const safe=f.model.getObjectByName('butterfly-safe-handle')!;
    for(const y of [0,-.069,-.133]){
      const p=f.screen(safe.localToWorld(new T.Vector3(0,y,0)));
      expect(p.x).toBeGreaterThan(1280*.4);expect(p.x).toBeLessThan(1280*.95);
      expect(p.y).toBeGreaterThan(720*.3);expect(p.y).toBeLessThan(720*.95);
    }
  });
});
