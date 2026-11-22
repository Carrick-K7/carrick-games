import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createVillaActivities } from '../src/villaActivities.js';
import { createVillaDriving } from '../src/villaDriving.js';
import { createVillaPickup } from '../src/villaPickup.js';
import { createVillaSuv } from '../src/villaSuv.js';
import { createVillaScooter } from '../src/villaScooter.js';
import { createVillaVehicle } from '../src/villaVehicle.js';
import { createVillaPickupModel } from '../src/villaPickupModel.js';
import { createVillaSuvModel } from '../src/villaSuvModel.js';
import { createVillaScooterModel } from '../src/villaScooterModel.js';
import { createVillaDrivingCourse } from '../src/villaDrivingCourse.js';
import { createVillaTerrainGeometry } from '../src/villaTerrainModel.js';
import { courseSurface } from '../src/villaFloorFinish.js';
import { VILLA_GARAGE_EXTENT as garage } from '../src/villaEstateLayout.js';

const scene=new THREE.Group();
const meshes=(root:THREE.Object3D)=>{const out:THREE.Mesh[]=[];root.traverse(o=>{if(o instanceof THREE.Mesh)out.push(o);});return out;};
const targets:THREE.Object3D[]=[];
const specs=[
  {id:'sedan',root:'villa-vehicle',track:.875,axle:1.46,tris:93_600,draws:53,light:[.375,.68,.692]},
  {id:'pickup',root:'villa-pickup',track:.967,axle:1.725,tris:93_480,draws:42,light:[.747,.896,1.076]},
  {id:'suv',root:'villa-suv',track:.858,axle:1.45,tris:95_700,draws:43,light:[.405,.735,.902]},
  {id:'scooter',root:'rideableElectricScooter',track:0,axle:.65,tris:16_650,draws:24,light:null},
] as const;
type Move=(x:number,z:number,yaw?:number,travel?:number)=>void;
const move={} as Record<typeof specs[number]['id'],Move>;
const down=new THREE.Vector3(0,-1,0);
const floorY=(x:number,z:number)=>new THREE.Raycaster(new THREE.Vector3(x,1,z),down,0,2).intersectObjects(targets,false)[0]!.point.y;
const cast=(frame:THREE.Object3D,from:number[],dir:number[],targets:THREE.Object3D[],far=2)=>new THREE.Raycaster(
  frame.localToWorld(new THREE.Vector3().fromArray(from)),new THREE.Vector3().fromArray(dir).transformDirection(frame.matrixWorld),0,far).intersectObjects(targets,true);
const tyreMeshes=(root:THREE.Object3D)=>meshes(root).filter(m=>m.morphTargetInfluences?.length===1);

beforeAll(()=>{
  const floor=new THREE.MeshBasicMaterial();
  const lawn=new THREE.Mesh(createVillaTerrainGeometry('shared'),floor);lawn.name='estate-lawn';scene.add(lawn);
  const paving=new THREE.Mesh(courseSurface((garage.minX+garage.maxX)/2,.015,(garage.minZ+garage.maxZ)/2,
    garage.maxX-garage.minX,garage.maxZ-garage.minZ,3.8,2.4,.009,.005),floor);scene.add(paving);
  createVillaDrivingCourse(scene); targets.push(lawn,paving,...meshes(scene.getObjectByName('garden-road')!).filter(m=>
    ['estate-road-shoulder','estate-road-asphalt'].includes(m.material.name)));
  const sedan=createVillaVehicle(scene),pickup=createVillaPickupModel(scene),suv=createVillaSuvModel(scene),bike=createVillaScooterModel(scene);
  move.sedan=(x,z,yaw=0)=>sedan.update(0,{...createVillaActivities(),driving:{...createVillaDriving(),x,z,yaw}});
  move.pickup=(x,z,yaw=0)=>pickup.update(0,{pickup:{...createVillaPickup(),x,z,yaw}});
  move.suv=(x,z,yaw=0)=>suv.update(0,{suv:{...createVillaSuv(),x,z,yaw}});
  move.scooter=(x,z,yaw=0,travel=0)=>bike.update(0,{scooter:{...createVillaScooter(),x,z,yaw,wheelTravel:travel}});
  scene.updateMatrixWorld(true);
});
afterAll(()=>{
  const materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
  for(const m of meshes(scene)){m.geometry.dispose();for(const mat of Array.isArray(m.material)?m.material:[m.material])materials.add(mat);}
  for(const m of materials){Object.values(m).forEach(v=>{if(v instanceof THREE.Texture)textures.add(v);});m.dispose();}
  textures.forEach(t=>t.dispose());scene.clear();
});

describe.each(specs)('$id moving exterior',spec=>{
  it('puts real, flattened contact lands and a transparent-edged underbody footprint on the three different render finishes',()=>{
    const root=scene.getObjectByName(spec.root)!,skins=tyreMeshes(root),shadow=scene.getObjectByName(root.name+'/moving-contact') as THREE.Mesh;
    expect(skins).toHaveLength(spec.track?4:2);expect(shadow.castShadow).toBe(false);expect(shadow.material.depthWrite).toBe(false);
    // Actual garage tile, multi-road apron asphalt and clipped lawn; do not compare
    // against the simulation's deliberately finish-agnostic y=0 on all three sites.
    for(const [x,z,expected] of [[37.5,-3,.015],[39.6,3.5,.048],[54.2,7,-.022]]){
      move[spec.id](x,z,expected===.048?Math.PI/2:0);scene.updateMatrixWorld(true);
      for(const skin of skins){
        const hub=skin.getWorldPosition(new THREE.Vector3()),ground=floorY(hub.x,hub.z);
        expect(ground).toBeCloseTo(expected,4);
        const shadowHit=new THREE.Raycaster(new THREE.Vector3(hub.x,1,hub.z),down).intersectObject(shadow)[0]!;
        expect(shadowHit.point.y-ground).toBeGreaterThan(0);expect(shadowHit.point.y-ground).toBeLessThan(.008);
        const v=new THREE.Vector3(),contact=new THREE.Box3();let min=Infinity;
        for(let i=0;i<skin.geometry.getAttribute('position').count;i++){
          skin.getVertexPosition(i,v);const wy=v.clone().applyMatrix4(skin.matrixWorld).y;min=Math.min(min,wy);
          if(Math.abs(wy-ground)<.001)contact.expandByPoint(v);
        }
        expect(Math.abs(min-ground)).toBeLessThan(.001);
        const size=contact.getSize(v);expect(size.z).toBeGreaterThan(spec.track?.115:.063);expect(size.x).toBeGreaterThan(spec.track?.048:.030);
      }
      expect(shadow.position.x).toBe(x);expect(shadow.position.z).toBe(z);
    }
    const map=shadow.material.map as THREE.DataTexture, image=map.image;
    const opacity=(u:number,v:number)=>image.data[4*(Math.floor(v*image.height)*image.width+Math.floor(u*image.width))+3];
    const p=shadow.geometry.getAttribute('position');const w=Math.abs(p.getX(0)),h=Math.abs(p.getZ(0));
    expect(opacity(.5+spec.track/(2*w),.5+spec.axle/(2*h))).toBeGreaterThan(172);
    expect(opacity(.5,.5)).toBeGreaterThan(70);expect(opacity(.5,.5)).toBeLessThan(145);
    expect(opacity(.01,.01)).toBe(0);
  });
  it('keeps the complete mover, contact draw and owned finish pixels within tighter model budgets',()=>{
    const root=scene.getObjectByName(spec.root)!,parts=[...meshes(root),scene.getObjectByName(root.name+'/moving-contact') as THREE.Mesh];
    const triangles=parts.reduce((sum,m)=>sum+(m.geometry.index?.count??m.geometry.getAttribute('position').count)/3,0);
    expect(triangles).toBeLessThanOrEqual(spec.tris);expect(parts.length).toBeLessThanOrEqual(spec.draws);
    const maps=new Set<THREE.Texture>();for(const m of parts)for(const value of Object.values(m.material))if(value instanceof THREE.Texture)maps.add(value);
    expect([...maps].reduce((sum,t)=>sum+t.image.width*t.image.height,0)).toBeLessThanOrEqual(spec.track?17_408:18_688);
    const tyres=tyreMeshes(root);expect(new Set(tyres.map(m=>m.material)).size).toBe(1);expect(new Set(tyres.map(m=>m.geometry)).size).toBe(1);
    const tread=tyres[0].material as THREE.MeshStandardMaterial;
    expect(tread.metalness).toBe(0);expect(tread.roughness).toBeGreaterThan(.8);expect(tread.bumpMap).toBe(tread.map);
    const uv=tyres[0].geometry.getAttribute('uv');let min=Infinity,max=-Infinity;
    for(let i=0;i<uv.count;i++){min=Math.min(min,uv.getY(i));max=Math.max(max,uv.getY(i));}
    expect(max-min).toBeGreaterThanOrEqual(13);expect(tread.map!.wrapT).toBe(THREE.RepeatWrapping);
    if(spec.track){
      const paint=parts.find(m=>m.material instanceof THREE.MeshPhysicalMaterial && m.material.clearcoatRoughnessMap)!.material as THREE.MeshPhysicalMaterial;
      const alloy=parts.find(m=>m.material.name==='wheel/turned-alloy')!.material as THREE.MeshStandardMaterial;
      expect(paint.clearcoat).toBeGreaterThan(.46);expect(alloy.metalness).toBeGreaterThan(paint.metalness+.29);
    }
  });
  if(spec.light)it('shows alternating reflector facets to a visitor behind the car, rather than one planar emissive sticker',()=>{
    move[spec.id](37.5,-3);scene.updateMatrixWorld(true);const root=scene.getObjectByName(spec.root)!,[start,end,y]=spec.light!;
    for(const side of [-1,1]){
      const slopes:number[]=[];for(let i=0;i<46;i++){
        const hit=cast(root,[side*(start+(end-start)*i/45),y,-3.2],[0,0,1],[root])[0];const mat=(hit?.object as THREE.Mesh)?.material;
        if(mat instanceof THREE.MeshPhysicalMaterial && mat.color.r>3*mat.color.g && mat.clearcoat>.8)slopes.push(hit.face!.normal.x*side);
      }
      expect(slopes.length).toBeGreaterThan(33);
      expect(slopes.slice(1).filter((s,i)=>s-slopes[i]>.15).length).toBeGreaterThanOrEqual(4);
      expect(slopes.slice(1).filter((s,i)=>slopes[i]-s>.15).length).toBeGreaterThanOrEqual(4);
    }
  });
});

it('loads each wheel independently when just one side is on the driveway',()=>{
  move.sedan(29.6,8);scene.updateMatrixWorld(true);const wheels=tyreMeshes(scene.getObjectByName('villa-vehicle')!);
  const heights=wheels.map(m=>{const h=m.getWorldPosition(new THREE.Vector3());return floorY(h.x,h.z);});
  expect(Math.max(...heights)-Math.min(...heights)).toBeGreaterThan(.060);
  for(const [i,m] of wheels.entries()){
    const h=m.getWorldPosition(new THREE.Vector3());const hit=new THREE.Raycaster(new THREE.Vector3(h.x,-.10,h.z+.025),new THREE.Vector3(0,1,0)).intersectObject(m)[0]!;
    expect(hit.point.y).toBeCloseTo(heights[i],3);
  }
});

it('keeps the scooter brake drillings open and the caliper fixed as the alloy and tread pass the contact patch',()=>{
  const root=scene.getObjectByName('rideableElectricScooter')!,rotor=root.getObjectByName('scooterFrontWheel')!,fork=root.getObjectByName('scooterSteeringFork')!;
  const skin=tyreMeshes(rotor)[0],tread=(skin.material as THREE.MeshStandardMaterial).map!;
  for(const travel of [0,1.713,-.519,0]){
    move.scooter(54.2,7,0,travel);scene.updateMatrixWorld(true);
    for(let i=0;i<12;i++){
      const a=i*Math.PI/6,r=i%2?.095:.085,y=r*Math.sin(a),z=r*Math.cos(a);
      expect(cast(rotor,[-.150,y,z],[1,0,0],[rotor],.102)).toHaveLength(0);
      expect(cast(rotor,[-.150,y+.0065,z],[1,0,0],[rotor],.102)[0]).toBeDefined();
    }
    const jaw=cast(fork,[-.15,.063,-.079],[1,0,0],[fork.getObjectByName('scooterHandlebars')!],.09)[0]!;
    expect(fork.worldToLocal(jaw.point.clone()).x).toBeLessThan(-.072);
    expect(tread.offset.y===0).toBe(travel===0);
    expect(new THREE.Vector3(0,1,0).transformDirection(skin.matrixWorld).y).toBeCloseTo(1,7);
  }
});

it('exposes the rubber step mat and the dark controller plenum between separate lanced enamel lips',()=>{
  const body=scene.getObjectByName('scooterBody')!;scene.updateMatrixWorld(true);
  for(const x of [-.09,.055])for(const z of [-.17,-.059,.153]){
    const m=(cast(body,[x,.40,z],down.toArray(),[body],.10)[0].object as THREE.Mesh).material;
    expect(m.name).not.toBe('scooter/stoved-enamel');
  }
  for(const z of [-.530,-.465]){
    const hits=Array.from({length:51},(_,i)=>cast(body,[-.40,.43+i*.002,z],[1,0,0],[body],.27)[0]);
    const lip=hits.map(h=>(h.object as THREE.Mesh).material.name==='scooter/stoved-enamel');
    expect(lip.filter((lit,i)=>i>0&&!lit&&lip[i-1]).length).toBeGreaterThanOrEqual(3);
    expect(lip.filter(Boolean).length).toBeGreaterThan(22);
  }
});
