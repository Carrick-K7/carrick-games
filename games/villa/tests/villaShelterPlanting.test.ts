import * as THREE from 'three';
import { afterAll, describe, expect, it } from 'vitest';
import { createVillaShelterPlanting } from '../src/villaShelterPlanting.js';
import { SHELTER_MESHES } from '../src/villaShelterPlantingMeshes.js';
import { kitchenCourtDistance } from '../src/villaGardenFloor.js';
import { VILLA_ESTATE_ROAD_PATHS, VILLA_GARAGE_DRIVE, villaRoadToe } from '../src/villaDrivingCourse.js';
import { VILLA_SCENIC_ROAD } from '../src/villaDriving.js';
import { POOL, VILLA_BUILDING_GROUND_CUTS, VILLA_ESTATE_FIELDS, villaEstateContains, villaPondContains, villaTerrainGroundHeight } from '../src/villaEstateLayout.js';
import { VILLA_STREAM_BOUNDS } from '../src/villaStream.js';
import { VILLA_PET_LAWN } from '../src/villaPets.js';
import { VILLA_GARDEN_TREES } from '../src/villaGarden.js';

const world=new THREE.Group(),{colliders}=createVillaShelterPlanting(world);world.updateMatrixWorld(true);
const root=world.getObjectByName('villa-shelter-planting')!,meshes:THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>[]=[];
root.traverse(o=>{if(o instanceof THREE.Mesh)meshes.push(o);});
const woody=meshes.find(m=>m.name.includes('root-flare'))!,leaves=meshes.find(m=>m.name.includes('leaf-bearing'))!,patches=meshes.filter(m=>m.name.includes('/drift/'));
const triangles=(m:THREE.Mesh)=>m.geometry.index!.count/3;
const uvAlpha=(uv:THREE.Vector2)=>{const t=leaves.material.map! as THREE.DataTexture,{width,height,data}=t.image;return data![4*(Math.min(height-1,Math.floor(uv.y*height))*width+Math.min(width-1,Math.floor(uv.x*width)))+3]!/255;};
afterAll(()=>{const mats=new Set(meshes.map(m=>m.material));for(const m of meshes)m.geometry.dispose();for(const m of mats){m.map?.dispose();m.dispose();}world.clear();});

describe('Villa western shelter planting',()=>{
  it('keeps a bounded set of static, cullable meshes and owned color/coverage scans',()=>{
    expect(root.parent).toBe(world);expect(patches).toHaveLength(4);expect(meshes).toHaveLength(8);
    const total=meshes.reduce((s,m)=>s+triangles(m),0);expect(total).toBeGreaterThan(15000);expect(total).toBeLessThanOrEqual(35000);
    for(const m of meshes){expect(m.frustumCulled&&m.castShadow&&m.receiveShadow).toBe(true);expect(m.geometry.boundingSphere).toBeTruthy();expect(m.geometry.getAttribute('uv').count).toBe(m.geometry.getAttribute('position').count);expect(m.geometry.index).not.toBeNull();}
    const t=leaves.material.map! as THREE.DataTexture;expect(t.isDataTexture).toBe(true);expect(t.image.width).toBe(1024);expect(t.image.height).toBe(512);expect(t.colorSpace).toBe(THREE.SRGBColorSpace);expect(t.generateMipmaps).toBe(true);expect(t.flipY).toBe(false);
    expect(leaves.material.transparent).toBe(false);expect(leaves.material.alphaTest).toBeGreaterThan(.2);expect(patches.every(p=>p.material===leaves.material)).toBe(true);
    const regions=[[0,512,0,512],[512,768,0,512],...[0,1,2,3].map(i=>[768+(i%2)*128,896+(i%2)*128,Math.floor(i/2)*256,(1+Math.floor(i/2))*256])];
    for(const [x0,x1,y0,y1] of regions){let tissue=0,gaps=0;const tones=new Set<string>();for(let y=y0!;y<y1!;y+=2)for(let x=x0!;x<x1!;x+=2){const i=4*(y*1024+x),d=t.image.data!;if(d[i+3]!>100){tissue++;tones.add(`${d[i]},${d[i+1]},${d[i+2]}`);}else gaps++;}
      expect(tissue/(gaps+tissue)).toBeGreaterThan(.10);expect(gaps/(gaps+tissue)).toBeGreaterThan(.16);expect(tones.size).toBeGreaterThan(12);}
    expect(woody.material.map!.wrapT).toBe(THREE.RepeatWrapping);
  });
  it('places all eight posed donor variants on actual ground; no dry moat or hovering shrub',()=>{
    const used=new Set<string>();let count=0;
    for(const m of patches){const a=m.geometry.getAttribute('position'),uv=m.geometry.getAttribute('uv');let first=0;
      for(const t of m.userData.plantings as {x:number;y:number;z:number;variant:string}[]){const def=SHELTER_MESHES.find(v=>v.name===t.variant)!;used.add(def.name);count++;
        let min=Infinity,max=-Infinity,radius=0,closest=Infinity;
        for(let i=first;i<first+def.count;i++){const p=m.localToWorld(new THREE.Vector3().fromBufferAttribute(a,i)),h=p.y-villaTerrainGroundHeight(p.x,p.z);min=Math.min(min,h);max=Math.max(max,h);radius=Math.max(radius,Math.hypot(p.x-t.x,p.z-t.z));closest=Math.min(closest,Math.hypot(p.x-t.x,p.z-t.z,h));
          if(i%37===0){const u=uv.getX(i);if(def.name.startsWith('fern'))expect(u).toBeLessThan(.5);else expect(u>=.5&&u<.75).toBe(true);}}
        expect(t.y).toBeCloseTo(villaTerrainGroundHeight(t.x,t.z)-.014,6);expect(min).toBeLessThan(.02);expect(min).toBeGreaterThan(-.15);expect(max).toBeGreaterThan(.14);expect(radius).toBeGreaterThan(.19);expect(closest).toBeLessThan(.091);first+=def.count;
      }expect(first).toBe(a.count);
    }expect(count).toBe(38);expect(used.size).toBe(8);
  });
  it('puts no stems, soft growth or canopy over the court, vehicle ribbons, water, deck, beds or pet lawn',()=>{
    const staticBounds=[...VILLA_BUILDING_GROUND_CUTS,...VILLA_ESTATE_FIELDS,VILLA_PET_LAWN,VILLA_STREAM_BOUNDS,{...POOL,maxZ:POOL.maxZ+4}];
    // These are the actual outside shoulders, not an estimate made from a centreline or spawn point.
    const toes=VILLA_ESTATE_ROAD_PATHS.flatMap(path=>{const width=path===VILLA_GARAGE_DRIVE?VILLA_SCENIC_ROAD.drivewayWidth:VILLA_SCENIC_ROAD.width;
      const edges=path.map((_,i)=>villaRoadToe(path,i,width));return edges.slice(1).map((q,i)=>{const p=[...edges[i]!,...q];return{minX:Math.min(...p.map(v=>v.x)),maxX:Math.max(...p.map(v=>v.x)),minZ:Math.min(...p.map(v=>v.z)),maxZ:Math.max(...p.map(v=>v.z))};});});
    for(const m of meshes){const b=new THREE.Box3().setFromObject(m);for(const k of [...staticBounds,...toes])expect(b.max.x<k.minX-.38||b.min.x>k.maxX+.38||b.max.z<k.minZ-.38||b.min.z>k.maxZ+.38).toBe(true);
      for(const x of [b.min.x,b.max.x])for(const z of [b.min.z,b.max.z]){expect(villaEstateContains(x,z,.45)).toBe(true);expect(kitchenCourtDistance(x,z)).toBeGreaterThan(5);expect(villaPondContains(x,z,3)).toBe(false);}}
    expect(colliders).toHaveLength(9);for(const c of colliders){expect(c.maxX-c.minX).toBeLessThan(.96);expect(c.maxZ-c.minZ).toBeLessThan(.91);expect(c.maxY).toBeLessThan(2.5);
      for(const t of VILLA_GARDEN_TREES)expect(Math.hypot((c.maxX+c.minX)/2-t.x,(c.maxZ+c.minZ)/2-t.z)).toBeGreaterThan(5);}
  });
  it('has real rooted wood at trunk-ray height, and locally fixed leaves at different depths with sky breaks',()=>{
    const bounds=new THREE.Box3().setFromObject(leaves);expect(bounds.min.y).toBeGreaterThan(2.05);expect(bounds.max.y).toBeGreaterThan(6.2);expect(bounds.max.x-bounds.min.x).toBeGreaterThan(6.9);
    for(let i=0;i<3;i++) {const c=colliders[i*3+1]!,x=(c.minX+c.maxX)/2,y=(c.minY+c.maxY)/2;const ray=new THREE.Raycaster(new THREE.Vector3(x,y,c.maxZ+1.7),new THREE.Vector3(0,0,-1),0,3);const hits=ray.intersectObject(woody);expect(hits.some(hit=>hit.point.z>=c.minZ-.08&&hit.point.z<=c.maxZ+.08)).toBe(true);}
    const direction=new THREE.Vector3(-24,26,24).normalize(); let open=0,hit=0,deep=0;
    for(let z=14;z<25;z+=.55)for(let x=-28;x<-14;x+=.55){const origin=new THREE.Vector3(x,.04,z);const intersections=new THREE.Raycaster(origin,direction,0,15).intersectObject(leaves).filter(s=>s.uv&&uvAlpha(s.uv)>.31);
      if(intersections.length){hit++;if(intersections.at(-1)!.distance-intersections[0]!.distance>.48)deep++;}else open++;}
    expect(hit).toBeGreaterThan(20);expect(open).toBeGreaterThan(hit);expect(deep).toBeGreaterThan(4);
  });
});
