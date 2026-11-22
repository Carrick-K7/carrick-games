import * as THREE from 'three';
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {cinemaEquipment} from '../src/villaInteriorCinema.js';
import {gymEquipment} from '../src/villaInteriorGym.js';
import {stockroom,vacuumModel,workshop} from '../src/villaInteriorWorkshop.js';
import {createVillaSnookerTable,createVillaSnookerModel} from '../src/villaSnookerModel.js';
import {createVillaSnooker,VILLA_SNOOKER_BALL_RADIUS} from '../src/villaSnooker.js';
import {createVillaActivities,VILLA_SNOOKER} from '../src/villaActivities.js';
import {createVillaRace} from '../src/villaRacing.js';
import {createVillaGaming} from '../src/villaGaming.js';
import type {FurnitureKit} from '../src/villaFurnitureForms.js';

type XYZ=[number,number,number];
const root=new THREE.Group();
const group=()=>{const g=new THREE.Group();root.add(g);return g;};
const cinema=group(),gym=group(),joinery=group(),stores=group(),dock=group(),vacuum=group(),brush=group(),billiards=group(),studio=group();
let gaming:ReturnType<typeof createVillaGaming>, cue:ReturnType<typeof createVillaSnookerModel>, table:THREE.Group;
// Capture the exact authored profiles with their room transforms. Don't infer
// a grip aperture, textile chart, drawer pull or screen from semantic markers.
function kit(home:THREE.Group):FurnitureKit {
  let frame:THREE.Object3D=home;
  const m=Object.fromEntries('oak walnut linen sage terra cream brass black steel white stone dark leaf leafLight soil blue coral lampGlow'.split(' ').map(n=>[n,new THREE.MeshStandardMaterial()])) as FurnitureKit['m'];
  const k:FurnitureKit={m,hit(){},at(x,y,z,a,fn){const prev=frame,g=new THREE.Group();prev.add(g);g.position.set(x,y,z);g.rotation.y=a;frame=g;fn();frame=prev;},
    put(g,m,x,y,z,rx=0,ry=0,rz=0){const mesh=new THREE.Mesh(g,m);mesh.position.set(x,y,z);mesh.rotation.set(rx,ry,rz);frame.add(mesh);},
    box(x,y,z,w,h,d,m,_r,yaw=0){k.put(new THREE.BoxGeometry(w,h,d),m,x,y,z,0,yaw);}};return k;
}
const ray=(object:THREE.Object3D,o:XYZ,d:XYZ,far:number)=>new THREE.Raycaster(new THREE.Vector3(...o),new THREE.Vector3(...d).normalize(),.00001,far).intersectObject(object,true)[0];
const material=(hit:THREE.Intersection)=>(hit.object as THREE.Mesh).material as THREE.MeshStandardMaterial;
function sample(hit:THREE.Intersection) {
  const map=material(hit).map as THREE.DataTexture, {data,width,height}=map.image;
  const u=THREE.MathUtils.clamp(hit.uv!.x,0,.99999), v=THREE.MathUtils.clamp(hit.uv!.y,0,.99999), i=4*(Math.floor(v*height)*width+Math.floor(u*width));
  return Array.from(data.slice(i,i+3));
}
beforeAll(()=>{
  cinemaEquipment(kit(cinema),new THREE.MeshStandardMaterial(),new THREE.MeshStandardMaterial());gymEquipment(kit(gym));workshop(kit(joinery));stockroom(kit(stores));
  const k=kit(dock);vacuumModel(k,vacuum,brush,k.m.white,k.m.dark,k.m.black);
  table=createVillaSnookerTable(billiards).root;cue=createVillaSnookerModel(billiards);
  const ctx=new Proxy({},{get:(_,s)=>s==='createLinearGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true});
  vi.stubGlobal('document',{createElement:()=>({getContext:()=>ctx})});
  try{gaming=createVillaGaming(studio);}finally{vi.unstubAllGlobals();}
  root.updateMatrixWorld(true);
});
afterAll(()=>{
  const mats=new Set<THREE.Material>(), maps=new Set<THREE.Texture>();
  root.traverse(n=>{if(n instanceof THREE.Mesh || n instanceof THREE.Line){n.geometry.dispose();for(const m of Array.isArray(n.material)?n.material:[n.material]) mats.add(m);}});
  for(const m of mats){Object.values(m).forEach(v=>{if(v instanceof THREE.Texture)maps.add(v);});m.dispose();}maps.forEach(m=>m.dispose());root.clear();
});

describe('inhabited recreation hardware, at its actual exposed surfaces',()=>{
  it('puts a grain-bearing emitted image on the bowed screen, inside a non-emitting mask and folded wings',()=>{
    const front=(x:number,y:number)=>ray(cinema,[x,y,-3.55],[0,0,-1],1.01);
    const sky=front(-.59,2.788),water=front(-.59,1.201),mask=front(2.695,2.418);
    expect(sky.uv!.y).toBeGreaterThan(water.uv!.y+.68);expect(material(sky).emissiveMap).toBe(material(sky).map);expect(material(sky).emissiveIntensity).toBeGreaterThan(.65);
    expect(material(mask).emissiveMap).toBeNull();expect(mask.point.z).toBeGreaterThan(sky.point.z+.015);
    const top=sample(sky),bottom=sample(water);expect(top[2]-bottom[2]).toBeGreaterThan(22);
    const print=material(sky).map as THREE.DataTexture,{data,width,height}=print.image;
    const offset=4*(Math.floor(height*.84)*width+Math.floor(width*.54));const local=Array.from({length:10},(_,i)=>data[offset+4*i]);
    expect(new Set(local).size).toBeGreaterThan(3);expect(print.generateMipmaps).toBe(true);
    const folds=Array.from({length:25},(_,i)=>front(3.10+i*.043,1.724).point.z);expect(Math.max(...folds)-Math.min(...folds)).toBeGreaterThan(.038);
  });
  it('threads a supported crossover and leaves an actual treadmill belt return, daylight and a crowned vinyl pad',()=>{
    const x=2.05,z=-4.05-.15;
    expect(ray(gym,[x+.038,1.54,z],[0,0,-1],.095)).toBeUndefined();expect(ray(gym,[x+.120,1.54,z],[0,0,-1],.095)).toBeDefined();
    const top=ray(gym,[2.71,.318,-2.32],[0,-1,0],.15),lower=ray(gym,[2.71,.08,-2.32],[0,1,0],.12);
    expect(top.point.y-lower.point.y).toBeGreaterThan(.084);
    expect(ray(gym,[2.53,.176,-2.32],[1,0,0],.337)).toBeUndefined();
    const center=ray(gym,[-3.6,.78,1.672],[0,-1,0],.38),shoulder=ray(gym,[-3.486,.78,1.672],[0,-1,0],.38);
    expect(shoulder.point.y-center.point.y).toBeGreaterThan(.0035);
    expect(sample(center)[1]-sample(center)[0]).toBeGreaterThan(16);expect(Math.abs(sample(top)[1]-sample(top)[0])).toBeLessThan(10);
  });
  it('bores right through the dog row, projects a divided tool drawer, and exposes the air below its handle',()=>{
    for(const i of [1,4,6]){
      const x=-1.72+i*.466;
      expect(ray(joinery,[x,.961,.292],[0,-1,0],.16)).toBeUndefined();
      const hit=ray(joinery,[x+.034,.961,.292],[0,-1,0],.16);expect(hit.point.y).toBeCloseTo(.9105,4);
      expect(sample(hit)[0]-sample(hit)[2]).toBeGreaterThan(48);
    }
    const low=ray(joinery,[.799,.315,.6],[0,0,-1],.4),open=ray(joinery,[.799,.642,.6],[0,0,-1],.4);
    expect(open.point.z-low.point.z).toBeCloseTo(.098,3);
    // Cross the finger passage just behind the bail but in front of the drawer.
    expect(ray(joinery,[.799+.31,.319,.316],[1,0,0],.074)).toBeUndefined();
    expect(ray(joinery,[.799+.31,.340,.333],[0,-1,0],.038)).toBeDefined();
    const optic=ray(vacuum,[-.035,.125,-.038],[0,-1,0],.11),roof=ray(vacuum,[.081,.125,.007],[0,-1,0],.11);
    expect(roof.point.y-optic.point.y).toBeGreaterThan(.006);expect(new THREE.Box3().setFromObject(vacuum).max.y).toBeLessThan(.087);
  });
  it('wraps hide down the rail to a rolled brass binding and puts a directional pore sample on the actual cloth',()=>{
    const c=table.position;
    const hide=ray(table,[c.x+1.14,.858,c.z],[-1,0,0],.10),band=ray(table,[c.x+1.14,.818,c.z],[-1,0,0],.10);
    expect(hide).toBeDefined();expect(material(hide).roughness).toBeGreaterThan(.65);
    expect(band).toBeDefined();expect(material(band).metalness).toBeGreaterThan(.40);expect(band.point.x).toBeGreaterThan(hide.point.x);
    const cloth=ray(table,[c.x+.246,1.04,c.z-.42],[0,-1,0],.25);expect(cloth.point.y).toBeCloseTo(VILLA_SNOOKER.height,5);
    const tex=material(cloth).map as THREE.DataTexture,bytes=tex.image.data;expect(tex.image.width).toBe(256);
    const mean=(i:number,across:boolean)=>{let sum=0;for(let j=0;j<256;j++)sum+=bytes[(across?j*256+i:i*256+j)*4+1];return sum/256;};
    const brushLine=Array.from({length:64},(_,i)=>mean(i*4,true)),across=Array.from({length:64},(_,i)=>mean(i*4,false));
    expect(Math.max(...brushLine)-Math.min(...brushLine)).toBeGreaterThan(13);expect(Math.max(...across)-Math.min(...across)).toBeLessThan(4);
  });
  it('keeps the spherical highlight view-dependent and the cloth contact on the same resting instance',()=>{
    const spheres=billiards.getObjectByName('snooker-dynamic-balls') as THREE.InstancedMesh, s=createVillaSnooker();
    const contact=billiards.getObjectByName('Snooker sphere contact on baize') as THREE.InstancedMesh;
    const ph=spheres.material as THREE.MeshPhongMaterial;expect(ph.envMap).toBeInstanceOf(THREE.CubeTexture);expect(ph.shininess).toBeGreaterThan(50);
    const faces=(ph.envMap as THREE.CubeTexture).image as THREE.DataTexture[];
    const ground=faces[3].image.data, sky=faces[2].image.data;
    expect(ground[1]-ground[0]).toBeGreaterThan(18);expect(Math.max(...sky)-Math.min(...sky)).toBeGreaterThan(100);
    s.balls[0].x=.112;s.balls[0].z=.235;cue.update(s,false);
    expect(contact.instanceMatrix).toBe(spheres.instanceMatrix);const m=new THREE.Matrix4();contact.getMatrixAt(0,m);
    contact.geometry.computeBoundingBox();const bedContact=contact.geometry.boundingBox!.max.y+m.elements[13];
    expect(bedContact-VILLA_SNOOKER.height).toBeGreaterThan(0);expect(bedContact-VILLA_SNOOKER.height).toBeLessThan(.001);
    expect(m.elements[13]-VILLA_SNOOKER_BALL_RADIUS).toBeCloseTo(VILLA_SNOOKER.height,5);
    const alpha=contact.geometry.getAttribute('color');expect(alpha.getW(0)).toBeGreaterThan(.4);expect(alpha.getW(alpha.count-1)).toBe(0);
    s.balls[0].potted=true;cue.update(s,false);contact.getMatrixAt(0,m);expect(m.elements[0]).toBe(0);
  });
  it('uses two distinct opaque desktop plates and inked key faces, and never uploads an idle texture again',()=>{
    const face=(x:number,z:number)=>ray(studio,[x,1.17,z+.29],[0,0,-1],.37);
    const p=material(face(7.05,3.62)).map!,side=material(face(6.25,3.69)).map!;
    const key=ray(studio,[6.70,.890,3.950],[0,-1,0],.12);expect(material(key).transparent).toBe(false);expect(material(key).map).toBeInstanceOf(THREE.CanvasTexture);
    expect(key.uv!.x).toBeLessThan(1/16);expect(key.uv!.y).toBeGreaterThan(7/8);
    expect(p).not.toBe(side);
    const tv=material(ray(studio,[9.8,2.025,8.04],[0,0,1],.61)).map!;
    const state={...createVillaActivities(),gaming:true,race:createVillaRace()};
    const versions=()=>[p.version,side.version,tv.version];const base=versions();
    for(let i=0;i<12;i++)gaming.update(i/10,state);
    expect(versions()).toEqual(base);state.race.distance=27;gaming.update(2,state);expect(versions()).toEqual([base[0],base[1],base[2]+1]);
    const hub=ray(studio,[7.498,.752,3.536],[0,-1,0],.10), power=ray(studio,[8.282,.092,3.538],[0,-1,0],.11);
    expect(hub.point.y).toBeCloseTo(.734,2);expect(power.point.y).toBeGreaterThan(.017);
  });
});
