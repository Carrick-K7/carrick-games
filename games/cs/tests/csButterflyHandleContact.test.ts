import * as T from 'three';
import {afterEach,describe,expect,it} from 'vitest';
import {makeWeapon} from '../src/csWeapons.js';
import {applyWeaponAnimation,sampleWeaponMotion} from '../src/csWeaponMotion.js';
import {resolveButterflyPresentation} from '../src/csButterflyPresentation.js';

const models:T.Object3D[]=[];
afterEach(()=>{for(const m of models.splice(0))m.traverse((o:any)=>{if(o.geometry&&!o.geometry.userData.sharedCharacter)o.geometry.dispose();o.skeleton?.dispose();});});
const EPS=1e-7;
function fixture(){
  const model=makeWeapon('knife',true,'butterfly');models.push(model);
  const rig=model.userData.rig,metal:any[]=[];
  rig.butterflyHandle.traverse((mesh:any)=>{
    if(!mesh.isMesh||!['butterfly-satin-steel','butterfly-dark-liner'].includes(mesh.material?.name))return;
    const g=mesh.geometry,a=g.attributes.position,index=g.index;g.computeBoundingBox();
    const triangles=[];
    for(let i=0;i<(index?.count??a.count);i+=3){
      const vertices=[0,1,2].map(k=>new T.Vector3().fromBufferAttribute(a,index?index.getX(i+k):i+k));
      triangles.push({vertices,minY:Math.min(...vertices.map(p=>p.y)),maxY:Math.max(...vertices.map(p=>p.y)),minZ:Math.min(...vertices.map(p=>p.z)),maxZ:Math.max(...vertices.map(p=>p.z))});
    }
    metal.push({mesh,box:g.boundingBox.clone(),triangles});
  });
  return {model,rig,metal};
}
// Actual per-material metal solids, including channel/bolt bores, not a handle
// bbox or blade-only proxy. Bounds merely reject work. Both signs of X stock,
// the fasteners, liner and latch remain in the tested geometry.
function penetrations(f:ReturnType<typeof fixture>){
  f.model.updateMatrixWorld(true);const h=f.rig.knifeRight;h.skeleton.update();
  const skin=Array.from({length:h.mesh.geometry.attributes.position.count},(_,i)=>h.mesh.getVertexPosition(i,new T.Vector3()));
  const ray=new T.Ray(),hit=new T.Vector3(),hits:any[]=[];
  for(const {mesh,box,triangles} of f.metal){
    const transform=mesh.matrixWorld.clone().invert().multiply(h.mesh.matrixWorld);
    for(let i=0;i<skin.length;i++){
      const p=skin[i].clone().applyMatrix4(transform);if(!box.containsPoint(p))continue;
      ray.set(new T.Vector3(box.min.x-.01,p.y,p.z),new T.Vector3(1,0,0));const xs:number[]=[];
      for(const t of triangles){
        if(p.y<t.minY||p.y>t.maxY||p.z<t.minZ||p.z>t.maxZ)continue;
        if(ray.intersectTriangle(t.vertices[0],t.vertices[1],t.vertices[2],false,hit))xs.push(hit.x);
      }
      xs.sort((a,b)=>a-b);const unique=xs.filter((x,j)=>j===0||Math.abs(x-xs[j-1])>1e-8);
      for(let j=0;j+1<unique.length;j+=2)if(p.x>unique[j]+EPS&&p.x<unique[j+1]-EPS){
        hits.push({vertex:i,bone:h.skeleton.bones[h.mesh.geometry.attributes.skinIndex.getX(i)].name,material:mesh.material.name,depth:Math.min(p.x-unique[j],unique[j+1]-p.x),point:p.toArray()});
      }
    }
  }
  return hits;
}
const ease=(t:number)=>t*t*(3-2*t);
function historical(f:ReturnType<typeof fixture>,kind:'draw'|'inspect'){
  const state=kind==='draw'?{animationTime:10,deployProgress:.66,butterflyDrawVariant:1}:{animationTime:10,inspectProgress:.28};
  const raw=sampleWeaponMotion('knife',{knifeModel:'butterfly',...state});
  // Restore the specific too-early finger catch and tang release, not an
  // unrelated legacy idle grasp.
  raw.knifeOpen=kind==='draw'?1-ease((.66-.54)/(.79-.54)):1+(.45-1)*ease((.28-.23)/(.30-.23));
  if(kind==='draw'){
    const retained=1-ease((.66-.62)/(.82-.62));
    raw.knifeContact=retained;raw.knifeFingerFan=retained;
    raw.knifeIndexOpen=.1*retained;raw.knifeThumb=.18*retained;
  }
  resolveButterflyPresentation(f.rig,raw,state);applyWeaponAnimation(f.model,state);
}

describe('released butterfly free-handle metal versus actual glove skin',()=>{
  it('detects the independently reported draw2 catch witness inside satin steel',()=>{
    const f=fixture();historical(f,'draw');const hits=penetrations(f);
    const witness=hits.find(h=>h.vertex===436&&h.material==='butterfly-satin-steel');
    expect(witness).toBeDefined();expect(witness.depth).toBeGreaterThan(.0008);
    expect(hits.filter(h=>h.material==='butterfly-satin-steel').length).toBeGreaterThanOrEqual(20);
  });
  it('detects the former inspect ring-finger closure during the free-handle sweep',()=>{
    const f=fixture();historical(f,'inspect');
    expect(penetrations(f).some(h=>h.bone.startsWith('ring_')&&h.material==='butterfly-satin-steel'&&h.depth>EPS)).toBe(true);
  });
  it('keeps tang support and released fingers until the two rigid shafts are gathered',()=>{
    for(const state of [{deployProgress:.66,butterflyDrawVariant:1},{deployProgress:.80,butterflyDrawVariant:1},{inspectProgress:.28},{inspectProgress:.90},{inspectProgress:.96}]){
      const p=sampleWeaponMotion('knife',{knifeModel:'butterfly',...state});
      expect(p.knifeContact).toBe(1);expect(p.knifeOpen).toBe(1);
    }
    for(const state of [{deployProgress:.80,butterflyDrawVariant:1},{inspectProgress:.96}]){
      const p=sampleWeaponMotion('knife',{knifeModel:'butterfly',...state});
      expect(p.butterflyBlade).toBe(0);
      expect(Math.sin(p.butterflyHandle)).toBeCloseTo(0,12);
      expect(Math.cos(p.butterflyHandle)).toBeCloseTo(1,12);
    }
  });
  it('keeps moving free-handle metal out of the released fingers through sweep, presentation and gathering',()=>{
    const f=fixture(),states:any[]=[];
    for(let i=58;i<=192;i++)states.push({deployProgress:i/240,butterflyDrawVariant:1});
    for(let i=36;i<=230;i++)states.push({inspectProgress:i/240});
    states.push({deployProgress:.24,butterflyDrawVariant:1},{inspectProgress:.96},{deployProgress:.65,butterflyDrawVariant:1},{deployProgress:.66,butterflyDrawVariant:1},{deployProgress:.67,butterflyDrawVariant:1},{deployProgress:.68,butterflyDrawVariant:1},{inspectProgress:.28});
    const failures:any[]=[];
    for(const state of states){
      applyWeaponAnimation(f.model,state);const hits=penetrations(f);
      if(hits.length)failures.push({state,count:hits.length,bones:[...new Set(hits.map(h=>h.bone))],deepest:Math.max(...hits.map(h=>h.depth)),witness:hits[0].point});
    }
    // Includes the complete moving free-shaft gather through draw2 .80 and
    // inspect .96. Only after those endpoints are the shafts fully paired and
    // transferred into the old idle/combat grasp; that legacy grasp is not a
    // new loose-handle intersection. No continuous swept-triangle proof.
    expect(failures).toEqual([]);
  },30000);
});
