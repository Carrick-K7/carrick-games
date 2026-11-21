import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createVillaEnvelope, type VillaSurfaces } from '../src/villaEnvelope.js';
import { createVillaPergola, createVillaStairAndGuards } from '../src/villaCirculationModel.js';
import { createVillaPoolside } from '../src/villaPoolside.js';
import { courseSurface } from '../src/villaFloorFinish.js';
import { VILLA_SOUTH_WALL, POOL } from '../src/villaEstateLayout.js';
import { VILLA_RAMPS, villaTreadLayers, VILLA_OPENING_SCHEDULE } from '../src/villaWorld.js';
import { VillaStaticView } from '../src/villaStaticView.js';
import { ENTRY_LANTERNS } from '../src/villaForecourt.js';
import { createVillaDrivingCourse } from '../src/villaDrivingCourse.js';
import { VILLA_HOME_LIGHTS } from '../src/villaHome.js';

const model=new THREE.Scene();
const mats=Object.fromEntries(['oak','stone','plaster','glass','bronze','roof'].map(id=>[id,new THREE.MeshStandardMaterial({transparent:id==='glass'})])) as VillaSurfaces;
let shell:THREE.Group, stair:THREE.Group, pool:THREE.Mesh;
const targets=(root:THREE.Object3D)=>{const result:THREE.Mesh[]=[];root.traverse(o=>{if(o instanceof THREE.Mesh)result.push(o);});return result;};
const shot=(root:THREE.Object3D,a:[number,number,number],dir:[number,number,number],dist:number)=>new THREE.Raycaster(new THREE.Vector3(...a),new THREE.Vector3(...dir),0,dist).intersectObjects(targets(root),false);
beforeAll(()=>{
  shell=createVillaEnvelope(model,mats);stair=createVillaStairAndGuards(model,mats,()=>mats.bronze);
  createVillaPergola(model,mats,mats.glass);pool=createVillaPoolside(model,mats,new THREE.Texture(),new THREE.Texture(),mats.glass);model.updateMatrixWorld(true);
});
afterAll(()=>{
  const materials=new Set<THREE.Material>(), maps=new Set<THREE.Texture>();
  for(const part of targets(model)){part.geometry.dispose();for(const m of Array.isArray(part.material)?part.material:[part.material])materials.add(m);}
  materials.forEach(m=>{for(const value of Object.values(m))if(value instanceof THREE.Texture) maps.add(value);m.dispose();});maps.forEach(t=>t.dispose());model.clear();
});
describe('physical envelope and fittings',()=>{
  it('keeps a continuous 2.9m south passage below the returned porch, with separate slats and recessed soffit',()=>{
    for(const x of [-1.43,-.7,0,.7,1.43])for(const y of [.2,1.65,2.55]) expect(shot(shell,[x,y,11.31],[0,0,-1],2.76)).toHaveLength(0);
    // These are metres on either side of the same slat edge, below the front lip of the canopy.
    const below= (x:number,z:number)=>shot(shell,[x,2.40,z],[0,1,0],.95)[0]!.point.y;
    expect(below(-1.05,10.50)).toBeLessThan(below(-.97,10.50)-.05);
    expect(below(-2.65,9.31)).toBeLessThan(below(-2.65,10.50)-.06);
  });
  it('fits separate pressure caps, rebates, clear panes and a draining sill along the same real opening',()=>{
    const op=VILLA_OPENING_SCHEDULE.find(s=>s.axis==='x'&&s.fixed===VILLA_SOUTH_WALL.inner&&s.base===0&&s.from===-12)!;
    const pitch=(op.to-op.from)/Math.ceil((op.to-op.from)/1.65), x=op.from+pitch;
    const zFront=(dx:number)=>shot(shell,[x+dx,1.7,9.45],[0,0,-1],.72)[0]!;
    expect(zFront(0).point.z).toBeGreaterThan(9.06);
    expect((zFront(.039).object as THREE.Mesh).material).toBe(mats.glass);
    expect(zFront(.039).point.z).toBeCloseTo(9.0175,4);
    expect(shot(shell,[x,1.7,8.65],[0,0,1],.72)[0]!.point.z).toBeLessThan(8.94);
    const top=(z:number)=>shot(shell,[x+.23,.42,z],[0,-1,0],.29)[0]!.point.y;
    expect(top(9.14)).toBeGreaterThan(top(9.17));
  });
  it('preserves the real sloped stair supports and leaves the shaft open at every tier',()=>{
    for(const r of VILLA_RAMPS)for(let i=0;i<12;i++){
      const z=r.startZ+(r.endZ-r.startZ)*(i+.5)/12,x=(r.minX+r.maxX)/2,top=r.bottom+(r.top-r.bottom)*(i+1)/12;
      expect(shot(stair,[x,top+.10,z],[0,-1,0],.22)[0]?.point.y).toBeCloseTo(top,5);
      expect(shot(stair,[x,top-.26,z],[0,1,0],.20)[0]?.point.y).toBeCloseTo(villaTreadLayers(top).bodyBottom,5);
    }
    for(const y of [3.6,7.2]) expect(shot(shell,[4.55,y+.04,-5.7],[0,-1,0],.27)).toHaveLength(0);
  });
  it('carves board joints into actual geometry, with running bond and continuous tops across a clipped slab',()=>{
    const s=courseSurface(0,0,0,4,2,1.2,.3,.01,.004), slab=new THREE.Mesh(s,mats.oak);
    const down=(x:number,z:number)=>shot(slab,[x,.1,z],[0,-1,0],.2)[0];
    expect(down(.15,.16)!.point.y).toBeCloseTo(0,7); expect(down(.15,.30)).toBeUndefined();
    expect(down(1.2,.16)).toBeUndefined(); expect(down(1.2,.46)!.point.y).toBeCloseTo(0,7);
    expect(down(1.206,.16)!.point.y).toBeLessThan(-.001);s.dispose();
  });
  it('terminates the entrance paving against the road and leaves the entire base of every path light off the shoulder',()=>{
    const roads=new THREE.Group();createVillaDrivingCourse(roads);roads.updateMatrixWorld(true);
    const sites=[...ENTRY_LANTERNS,...VILLA_HOME_LIGHTS.find(l=>l.id==='garden')!.fixtures.map(p=>[p.x,p.z] as const)];
    for(const [x,z] of sites) for(let j=0;j<12;j++){
      const a=Math.PI*j/6;
      expect(shot(roads,[x+.139*Math.cos(a),.49,z+.139*Math.sin(a)],[0,-1,0],.52),`lamp ${x}/${z} intersects a road`).toHaveLength(0);
    }
    const deck=model.getObjectByName('villa-terraces-and-pool')!;
    expect(shot(deck,[0,.12,11],[0,-1,0],.15)[0]?.point.y).toBeCloseTo(.030,4);
    expect(shot(deck,[0,.12,14],[0,-1,0],.15)).toHaveLength(0);
    expect(shot(roads,[0,.12,14],[0,-1,0],.15).length).toBeGreaterThan(0);
    const materials=new Set<THREE.Material>();for(const o of targets(roads)){materials.add(o.material as THREE.Material);o.geometry.dispose();}materials.forEach(m=>m.dispose());
  });
  it('forms a genuinely bent pool ladder and a bounded wet surface without a floor across the waterline',()=>{
    const x=(POOL.minX+POOL.maxX)/2, z=POOL.maxZ-.5, deck=model.getObjectByName('villa-terraces-and-pool')!;
    expect(shot(deck,[x-.4,.82,z+.4],[0,-1,0],.5)[0]!.point.y).toBeGreaterThan(.58);
    expect(shot(deck,[x-.4,.82,z+.04],[0,-1,0],.5)[0]!.point.y).toBeLessThan(.53);
    expect(shot(deck,[x,1,0],[0,-1,0],1.6)).toHaveLength(0);
    const p=pool.geometry.getAttribute('position');let amp=0;
    for(let i=0;i<p.count;i++){if(Math.abs(p.getX(i))>(POOL.maxX-POOL.minX)/2-.001||Math.abs(p.getY(i))>(POOL.maxZ-POOL.minZ)/2-.001)expect(Math.abs(p.getZ(i))).toBeLessThan(.0001);amp=Math.max(amp,p.getZ(i));}
    expect(amp).toBeGreaterThan(.009);
  });
});

describe('rigid batch tight visibility',()=>{
  it('culls an entirely rearward long batch, but restores it for another view, fresh shadow maps and failed passes',()=>{
    const scene=new THREE.Scene(), geo=new THREE.BoxGeometry(80,2,3,12,5,6),mat=new THREE.MeshStandardMaterial(); geo.userData.villaRigidBatch=true;
    const parent=new THREE.Group();scene.add(parent);const mesh=new THREE.Mesh(geo,mat);parent.add(mesh);parent.position.z=22;
    const camera=new THREE.PerspectiveCamera(64,1.6,.065,650);camera.updateMatrixWorld();mesh.updateWorldMatrix(true,false);
    const f=new THREE.Frustum().setFromProjectionMatrix(camera.projectionMatrix);expect(f.intersectsObject(mesh)).toBe(true); // old loose-sphere behavior
    const index=new VillaStaticView(scene), visible:boolean[]=[];
    const r={shadowMap:{enabled:false,autoUpdate:false,needsUpdate:false},render:()=>{visible.push(mesh.visible);}};
    const draw=()=>index.draw(r as unknown as THREE.WebGLRenderer,scene,camera);
    draw();expect(visible.pop()).toBe(false);expect(mesh.visible).toBe(true);
    camera.rotation.y=Math.PI; draw();expect(visible.pop()).toBe(true);
    camera.rotation.y=0;r.shadowMap.enabled=true;r.shadowMap.needsUpdate=true;draw();expect(visible.pop()).toBe(true);
    r.shadowMap.enabled=false;r.render=()=>{expect(mesh.visible).toBe(false);throw Error('aborted camera');};expect(draw).toThrow('aborted camera');expect(mesh.visible).toBe(true);
    mesh.visible=false;r.render=()=>{visible.push(mesh.visible);};draw();expect(mesh.visible).toBe(false);
    mat.dispose();geo.dispose();
  });
});
