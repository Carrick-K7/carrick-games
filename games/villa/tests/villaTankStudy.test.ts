import { afterAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createVillaTankStudy } from '../src/villaTankStudy.js';
import { createVillaAquariumLife } from '../src/villaAquarium.js';
import { VILLA_AQUARIUM as A } from '../src/villaLivingLayout.js';

let s=14029,calls=0;const random=()=>{calls++;s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
const world=new THREE.Group(),tank=createVillaTankStudy(world,random),life=createVillaAquariumLife(world);world.updateMatrixWorld(true);
const parts=tank.children.filter((m):m is THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>=>m instanceof THREE.Mesh),
  part=(suffix:string)=>parts.find(m=>m.material.name==='tank / '+suffix)!;
type V=[number,number,number];
const ray=(which:THREE.Mesh[],origin:V,direction:V,far:number)=>new THREE.Raycaster(new THREE.Vector3(origin[0]+A.x,origin[1],origin[2]+A.z),new THREE.Vector3(...direction),0,far).intersectObjects(which,false);
const down=(m:THREE.Mesh,x:number,z:number)=>ray([m],[x,2.16,z],[0,-1,0],1.44)[0];
afterAll(()=>{const mats=new Set<THREE.Material>(),tex=new Set<THREE.Texture>();world.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>mats.add(m));}});mats.forEach(m=>{Object.values(m).forEach(t=>{if(t instanceof THREE.Texture)tex.add(t);});m.dispose();});tex.forEach(t=>t.dispose());world.clear();});

describe('double-aspect planted medaka tank, measured from the actual buffers',()=>{
  it('leaves both end and both long sight lines open through two 12 mm panes and one water boundary; returns the seams at the corners',()=>{
    const glass=part('low iron glass'), water=part('water depth'),seal=part('silicone return');
    for(const [dx,dz] of [[1,0],[-1,0],[0,-1],[0,1]]) {
      const hits=ray(parts,[dx*1.9,1.57,dz*1.9],[-dx,0,-dz],3.78);
      // Some test rays on a mesh's triangle diagonal have the same intersection twice.
      const at=new Map(hits.map(h=>[`${h.object.uuid}/${h.distance.toFixed(5)}`,h]));
      expect([...at.values()].filter(h=>h.object===glass)).toHaveLength(2);
      expect([...at.values()].filter(h=>h.object===water)).toHaveLength(1);
      expect([...at.values()].some(h=>!(h.object as typeof glass).material.transparent)).toBe(false);
      const glassFaces=[...at.values()].filter(h=>h.object===glass);
      expect(glassFaces[1].distance-glassFaces[0].distance).toBeCloseTo(dx?3.316:.954,4);
    }
    expect(glass.material.side).toBe(THREE.FrontSide);expect(glass.material.opacity).toBeLessThan(.07);
    expect(water.material.side).toBe(THREE.FrontSide);expect(water.material.depthWrite).toBe(false);
    const den=water.geometry.getAttribute('color'),pos=water.geometry.getAttribute('position'),n=water.geometry.getAttribute('normal');
    const density=(end:boolean,lower:boolean)=>{const v=[];for(let i=0;i<pos.count;i++)if((pos.getY(i)<1)===lower&&(Math.abs(n.getX(i))>.9)===end)v.push(den.getW(i)*water.material.opacity);return Math.min(...v);};
    expect(density(true,false)).toBeGreaterThan(density(false,false)*1.45);expect(density(false,true)).toBeGreaterThan(density(false,false)*1.45);
    for(const side of [-1,1])for(const end of [-1,1]) {
      const contact=ray([seal],[side*1.648,1.4,end*.425],[0,0,end],.06)[0];expect(contact).toBeDefined();
      expect(Math.abs(contact.point.z-A.z)).toBeLessThan(.471);
      expect(ray([seal],[side*1.63,1.4,end*.425],[0,0,end],.06)).toHaveLength(0);
    }
  });
  it('holds menisci to the wet glass, a bounded ripple at each aerator and an exposed section of real, undulating granular bed',()=>{
    const surface=part('water surface'),bed=part('planted substrate'),edge=down(surface,.03,.4706).point.y;
    expect(edge).toBeGreaterThan(2.039);expect(edge-down(surface,.03,.439).point.y).toBeGreaterThan(.003);
    expect(surface.material.forceSinglePass).toBe(true);expect(surface.material.depthWrite).toBe(false);
    const waterP=surface.geometry.getAttribute('position'),heights:number[]=[];
    for(let i=0;i<waterP.count;i++)if(Math.abs(waterP.getX(i)+1.42)<.20&&Math.abs(waterP.getZ(i)+.21)<.16) heights.push(waterP.getY(i));
    expect(Math.max(...heights)-Math.min(...heights)).toBeGreaterThan(.005);
    const channel=down(bed,0,.00).point.y,bank=down(bed,-1.03,-.22).point.y;
    expect(bank-channel).toBeGreaterThan(.098);
    for(const side of [-1,1]) {
      expect(ray([bed],[.12,.76,side*.64],[0,0,-side],.2)[0].point.z-A.z).toBeCloseTo(side*.471,5);
      expect(down(bed,.12,side*.463).point.y).toBeGreaterThan(.773);
    }
    const grain=bed.material.map as THREE.DataTexture;expect(grain).toBe(bed.material.bumpMap);expect(grain.image.width).toBe(128);expect(grain.generateMipmaps).toBe(true);expect(grain.wrapS).toBe(THREE.RepeatWrapping);
    const at=(x:number)=>down(bed,x,.02).uv!.x;
    expect(at(.51)-at(-.39)).toBeCloseTo(5,4); // five 0.18 m swatches: grains, not boulders
    const positions=part('branching bogwood').geometry.getAttribute('position');let buried=0,high=0;
    for(let i=0;i<positions.count;i+=5) {
      const x=positions.getX(i),z=positions.getZ(i),h=positions.getY(i)-down(bed,x,z).point.y;
      if(h<0)buried++;if(h>.34)high++;
    }
    expect(buried).toBeGreaterThan(10);expect(high).toBeGreaterThan(10);
    const plants=part('rooted leaves'), p=plants.geometry.getAttribute('position');
    expect(plants.material.side).toBe(THREE.DoubleSide);let west=0,east=0;
    for(let i=0;i<p.count;i++)if(p.getY(i)>1.13){if(p.getZ(i)<-.18)west++;if(p.getZ(i)>.18)east++;}
    expect(Math.min(west,east)).toBeGreaterThan(20);
  });
  it('keeps the planted detail batched, deterministic, inside its actual cabinet, with neither a reflector pass nor another physical light',()=>{
    expect(calls).toBe(3*48+3*7);expect(parts).toHaveLength(8);let tris=0;
    for(const m of parts) {
      expect(m.geometry.index).not.toBeNull();tris+=m.geometry.index!.count/3;
      expect(m.material).toBeInstanceOf(THREE.MeshStandardMaterial);expect(m.material).not.toBeInstanceOf(THREE.MeshPhysicalMaterial);
      m.geometry.computeBoundingBox();const box=m.geometry.boundingBox!;
      expect(box.min.x).toBeGreaterThanOrEqual(-A.width/2);expect(box.max.x).toBeLessThanOrEqual(A.width/2);
      expect(box.min.z).toBeGreaterThanOrEqual(-A.depth/2);expect(box.max.z).toBeLessThanOrEqual(A.depth/2);
      expect(box.min.y).toBeGreaterThan(.729);expect(box.max.y).toBeLessThan(2.17);
      if(['tank / river stone','tank / rooted leaves','tank / branching bogwood'].includes(m.material.name)) {
        expect(Math.max(Math.abs(box.min.x),box.max.x)).toBeLessThan(1.652);
        expect(Math.max(Math.abs(box.min.z),box.max.z)).toBeLessThan(.471);
      }
    }
    expect(tris).toBeLessThanOrEqual(9_600);expect(tank.children.some(o=>o instanceof THREE.Light)).toBe(false);
    const moving=life.root.children.filter((o):o is THREE.InstancedMesh=>o instanceof THREE.InstancedMesh);
    expect(moving.reduce((sum,m)=>sum+(m.geometry.index?.count??m.geometry.getAttribute('position').count)*m.count/3,0)).toBeLessThanOrEqual(18_850);
  });
  it('actually renders ten 35–45 mm fish, with mirrored opercular markings and fin rays denser than their translucent tips',()=>{
    const all=life.root.children.filter((o):o is THREE.InstancedMesh=>o instanceof THREE.InstancedMesh && o.name!=='aquarium/bubbles');
    const body=all.filter(b=>b.name==='aquarium/medaka-template'),eye=body.find(b=>(b.material as THREE.MeshStandardMaterial).color.getHexString()==='233239')!;
    const plates=eye.geometry.getAttribute('position'),z:number[]=[],y:number[]=[];
    for(let i=0;i<plates.count;i++)if(plates.getX(i)>.023 && plates.getX(i)<.030) {z.push(plates.getZ(i));y.push(plates.getY(i));}
    expect(Math.min(...z)).toBeLessThan(-.006);expect(Math.max(...z)).toBeGreaterThan(.006);expect(Math.max(...y)-Math.min(...y)).toBeGreaterThan(.009);
    const tail=all.find(b=>b.name==='aquarium/medaka-tail')!, rgba=tail.geometry.getAttribute('color');let lo=1,hi=0;
    for(let i=0;i<rgba.count;i++){lo=Math.min(lo,rgba.getW(i));hi=Math.max(hi,rgba.getW(i));}expect(lo).toBeLessThan(.31);expect(hi).toBeGreaterThan(.94);
    const skin=body.find(b=>(b.material as THREE.MeshStandardMaterial).name.startsWith('medaka / blue flank'))!.geometry.getAttribute('color');let dark=1,pearl=0;
    for(let i=0;i<skin.count;i++){dark=Math.min(dark,skin.getX(i));pearl=Math.max(pearl,skin.getX(i));}expect(pearl/dark).toBeGreaterThan(2.0);
    const mat=new THREE.Matrix4(), point=new THREE.Vector3();
    for(const t of [0,3.5]) {life.update(t,.08,t>0);
      for(let i=0;i<10;i++) {
        const marker=life.root.getObjectByName(`Aquarium fish ${i+1}`)!, heading=new THREE.Vector3(1,0,0).applyEuler(marker.rotation);let low=Infinity,high=-Infinity;
        for(const b of [...body,tail]) {expect(b.count).toBe(10);b.getMatrixAt(i,mat);const p=b.geometry.getAttribute('position');
          for(let j=0;j<p.count;j++){const x=point.fromBufferAttribute(p,j).applyMatrix4(mat).sub(marker.position).dot(heading);low=Math.min(low,x);high=Math.max(high,x);}
        }
        expect(high-low).toBeGreaterThan(.035);expect(high-low).toBeLessThan(.045);
      }
    }
  });
});
