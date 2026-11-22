import { afterAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createVillaStairAndGuards } from '../src/villaCirculationModel.js';
import { createVillaElevatorModel } from '../src/villaElevatorModel.js';
import { createVillaElevator, requestVillaElevator, villaElevatorPanelButtons } from '../src/villaElevator.js';
import { createVillaHomeModel } from '../src/villaHomeModel.js';
import { createVillaHome, VILLA_HOME_LIGHTS } from '../src/villaHome.js';
import { VILLA_RAMPS, villaTreadLayers } from '../src/villaWorld.js';
import type { VillaSurfaces } from '../src/villaEnvelope.js';

const scene=new THREE.Scene(), meshes=(root:THREE.Object3D)=>{const a:THREE.Mesh[]=[];root.traverse(o=>{if(o instanceof THREE.Mesh)a.push(o);});return a;};
type V=[number,number,number];const cast=(targets:THREE.Mesh[],a:V,d:V,far:number)=>new THREE.Raycaster(new THREE.Vector3(...a),new THREE.Vector3(...d).normalize(),0,far).intersectObjects(targets,false);
const material=(h:THREE.Intersection)=>((h.object as THREE.Mesh).material as THREE.MeshStandardMaterial);
const triangles=(parts:THREE.Mesh[])=>parts.reduce((s,m)=>s+(m.geometry.index?.count??m.geometry.getAttribute('position').count)/3*(m instanceof THREE.InstancedMesh?m.count:1),0);
const surfaces=Object.fromEntries(['bronze','glass','oak','plaster','roof','stone'].map(id=>[id,new THREE.MeshStandardMaterial({transparent:id==='glass'})])) as VillaSurfaces;
const stair=createVillaStairAndGuards(scene,surfaces,()=>surfaces.bronze),stock=meshes(stair), hand=stock.filter(p=>(p.material as THREE.Material).name==='stair/oiled grip');
afterAll(()=>{const materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();for(const o of meshes(scene)){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}materials.forEach(m=>{Object.values(m).forEach(v=>{if(v instanceof THREE.Texture)textures.add(v);});m.dispose();});textures.forEach(t=>t.dispose());scene.clear();});

describe('interior fabrication in world metres',()=>{
  it('beds a bevelled tip and recessed slip strip in every measured tread without dropping the soffit',()=>{
    scene.updateMatrixWorld(true);expect(triangles(stock)).toBeLessThanOrEqual(29_650);
    for(const r of VILLA_RAMPS) for(let i=0;i<12;i++){
      const z=r.startZ+(r.endZ-r.startZ)*(i+.5)/12,x=(r.maxX+r.minX)/2,y=r.bottom+(r.top-r.bottom)*(i+1)/12, front=Math.sign(r.startZ-r.endZ);
      const down=(d:number)=>cast(stock,[x,y+.06,z+front*d],[0,-1,0],.12)[0];
      const board=down(.14),slot=down(.167),nose=down(.204),round=down(.2485);
      expect(board.point.y).toBeCloseTo(y,5);expect(material(slot)).not.toBe(material(board));expect(slot.point.y).toBeCloseTo(y-.0006,5);
      expect(material(nose).name).toBe('stair/end lipping');expect(nose.point.y).toBeCloseTo(y,5);expect(round.point.y).toBeLessThan(y-.009);
      expect(cast(stock,[x,y-.23,z],[0,1,0],.12)[0].point.y).toBeCloseTo(villaTreadLayers(y).bodyBottom,5);
    }
  });
  it('fits fingers around a 50 mm keyed inner grip, seats the bracket and follows all three hairpins without a break',()=>{
    const rail=(i:number)=>{const r=VILLA_RAMPS[i], dir=Math.sign(r.endZ-r.startZ);return {r,dir,x:dir<0?r.maxX+.010:r.minX-.010};};
    for(let i=0;i<VILLA_RAMPS.length;i++){
      const {r,dir,x}=rail(i),center=(t:number):V=>[x,r.bottom+t*(r.top-r.bottom)+1.025,r.startZ+t*(r.endZ-r.startZ)];
      const [,y,z]=center(.43),up=(dx:number)=>cast(hand,[x+dx,y-.075,z],[0,1,0],.12)[0];
      expect(up(.024)).toBeDefined();expect(up(-.024)).toBeDefined();expect(up(.0265)).toBeUndefined();
      expect(up(0).point.y-up(.010).point.y).toBeGreaterThan(.009); // groove is cut, not coloured
      const carrier=(t:number)=>{const [x,h,z]=center(t);return cast(stock,[x,h-.080,z],[0,1,0],.095)[0];};
      expect(material(carrier(.5)).metalness).toBeGreaterThan(.45);expect(material(carrier(.43)).name).toBe('stair/oiled grip');
      if(i===VILLA_RAMPS.length-1) continue;
      const radius=(rail(i+1).x-x)/2;
      for(let n=0;n<=20;n++){
        const a=n*Math.PI/20,hit=cast(hand,[x+radius*(1-Math.cos(a)),r.top+1.15,r.endZ+dir*Math.abs(radius)*Math.sin(a)],[0,-1,0],.23)[0];
        expect(hit,`missing turn ${i} at ${n}/20`).toBeDefined();expect(hit.point.y).toBeCloseTo(r.top+1.047,2);
      }
    }
  });
  it('folds stainless to a recessed cabin joint, with working threshold tracks and separately seated button faces and numerals',()=>{
    const ctx=new Proxy({},{get:()=>()=>undefined,set:()=>true});vi.stubGlobal('document',{createElement:()=>({getContext:()=>ctx})});
    let lift:ReturnType<typeof createVillaElevatorModel>;try{lift=createVillaElevatorModel(scene);}finally{vi.unstubAllGlobals();}
    const car=scene.getObjectByName('elevator-car')!, e=createVillaElevator();e.phase='open';e.door=1;lift.update(e);scene.updateMatrixWorld(true);
    expect(triangles(meshes(scene.getObjectByName('villa-elevator')!))).toBeLessThanOrEqual(27_150);
    const parts=meshes(car), origin=car.getWorldPosition(new THREE.Vector3()), here=(x:number,y:number,z:number):V=>[x+origin.x,y+origin.y,z+origin.z];
    const fromCar=(a:V,d:V,far:number)=>cast(parts,here(...a),d,far)[0];
    const field=fromCar([.0,1.60,-7.24],[0,0,-1],.19),seam=fromCar([.319,1.60,-7.24],[0,0,-1],.19);
    expect(material(field).name).toBe('cabin / satin folded stainless');expect(field.point.z-seam.point.z).toBeGreaterThan(.011);
    const steel=material(field),tex=steel.map as THREE.DataTexture, {data,width,height}=tex.image;
    expect(steel.metalness).toBeGreaterThan(.40);expect(steel.roughness).toBeGreaterThan(.30);expect(tex.generateMipmaps).toBe(true);
    let across=0,along=0;for(let y=0;y<height-1;y++)for(let x=0;x<width-1;x++){
      const i=(y*width+x)*4;along+=Math.abs(data[i+4]-data[i]);across+=Math.abs(data[i+4*width]-data[i]);
    }expect(across).toBeGreaterThan(2.5*along);
    const floor=(z:number)=>fromCar([.12,.042,z],[0,-1,0],.065).point.y;
    for(const z of [-5.114,-5.100]) expect(floor(z+.0045)-floor(z)).toBeGreaterThan(.006); // both telescope grooves
    const key=car.getObjectByName('elevator-car / button plungers') as THREE.InstancedMesh, labels=meshes(car.getObjectByName('elevator-car / key engravings')!);
    expect(key.count).toBe(5);expect(labels).toHaveLength(1);
    const depth=(targets:THREE.Mesh[])=>villaElevatorPanelButtons(e).map(v=>cast(targets,[v.x,v.y,v.z-.092],[0,0,1],.13)[0].point.z);
    const rest=depth([key]),engraved=depth(labels);expect(engraved[0]).toBeCloseTo(rest[0]-.0003,5);
    expect(requestVillaElevator(e,2,true)).toBe(true);lift.update(e);scene.updateMatrixWorld(true);
    for(const [i,z] of depth([key]).entries()){expect(z-rest[i]).toBeCloseTo(i===0?.004:0,5);expect(depth(labels)[i]-engraved[i]).toBeCloseTo(z-rest[i],6);}
    e.floor=e.target;e.phase='opening';e.door=.11;lift.update(e);scene.updateMatrixWorld(true);
    for(const [i,z] of depth([key]).entries())expect(z-rest[i]).toBeCloseTo(i===3?.004:0,5);
    e.phase='closing';e.door=.91;lift.update(e);scene.updateMatrixWorld(true);expect(depth([key])[4]-rest[4]).toBeCloseTo(.004,5);
  });
  it('seats an opal bowl below a rolled reflector, recesses the gallery lens behind a real glare baffle, and seals a ridged utility lens',()=>{
    const lamps=createVillaHomeModel(scene),root=scene.getObjectByName('villa-smart-home')!, parts=meshes(scene.getObjectByName('villa-room-light-fixtures')!);
    scene.updateMatrixWorld(true);
    const fixture=(id:string)=>VILLA_HOME_LIGHTS.find(r=>r.id===id)!.fixtures[0], below=(id:string,dx:number,dz:number)=>{
      const p=fixture(id);return cast(parts,[p.x+dx,p.y-.18,p.z+dz],[0,1,0],.42)[0];
    };
    const bowl=below('living',0,0),shade=below('living',.30,0);expect(material(bowl)).toBe(lamps.glow('living'));expect(material(shade).name).toBe('indoor light / fired enamel');
    expect(shade.point.y-bowl.point.y).toBeGreaterThan(.075);expect(triangles(parts)).toBeLessThanOrEqual(37_550);
    // Both opaque sections terminate on the very same ring. Reducing hidden
    // radial work must not turn the visible outline into a hexagon or uncover a seam.
    const living=fixture('living'),seat=(m:THREE.Mesh)=>{const p=m.geometry.getAttribute('position'),xz=new Set<string>();
      for(let i=0;i<p.count;i++){const x=p.getX(i)-living.x,z=p.getZ(i)-living.z;if(Math.abs(p.getY(i)-living.y-.005)<.0001 && Math.abs(Math.hypot(x,z)-.258)<.0001)xz.add(`${x.toFixed(4)},${z.toFixed(4)}`);}return xz;};
    expect(seat(bowl.object as THREE.Mesh).size).toBeGreaterThanOrEqual(26);expect(seat(bowl.object as THREE.Mesh)).toEqual(seat(shade.object as THREE.Mesh));
    const lens=below('gallery-1',.148,0), baffle=below('gallery-1',.148,.096), p=fixture('gallery-1');
    expect(material(lens)).toBe(lamps.glow('gallery-1'));expect(lens.point.y-baffle.point.y).toBeGreaterThan(.055);
    const oblique=cast(parts,[p.x+.448,p.y-.060,p.z],[-.30,.066,0],.36)[0];expect(material(oblique)).toBe(material(baffle));
    const rib=below('utility',0,.003),clip=below('utility',.467,0);expect(material(rib)).toBe(lamps.glow('utility'));expect(material(clip).name).toBe('indoor light / spun satin');
    expect(below('utility',0,.099).point.y-rib.point.y).toBeGreaterThan(.014);
    expect(root.children.filter(o=>o instanceof THREE.PointLight)).toHaveLength(6);expect(parts.length).toBeLessThanOrEqual(VILLA_HOME_LIGHTS.length+4);
    const state=createVillaHome();state.lightLevels.living=0;lamps.update(1,state,fixture('living'));expect(material(bowl).emissiveIntensity).toBe(0);
    state.lightLevels.living=1;lamps.update(2,state,fixture('living'));expect(material(bowl).emissiveIntensity).toBeGreaterThan(0);
  });
});
