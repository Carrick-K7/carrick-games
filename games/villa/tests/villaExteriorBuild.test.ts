import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createVillaEnvelope, type VillaSurfaces } from '../src/villaEnvelope.js';
import { createVillaPoolside } from '../src/villaPoolside.js';
import { createVillaPoolFinishMaps, POOL_TILE_SHEET } from '../src/villaWeatheredPool.js';
import { gardenReflection } from '../src/villaWeatheredFinish.js';
import { createVillaPergola } from '../src/villaCirculationModel.js';
import { createVillaDrivingCourse } from '../src/villaDrivingCourse.js';
import { VILLA_SCENIC_ROAD } from '../src/villaDriving.js';
import { POOL } from '../src/villaEstateLayout.js';
import { canvasWeave, fabricPanel } from '../src/villaOutdoorJoinery.js';
import { createVillaOutdoorModel } from '../src/villaOutdoorModel.js';
import { VILLA_SWING } from '../src/villaOutdoor.js';
import { mineralAggregate } from '../src/villaWeatheredDrive.js';

const scene=new THREE.Scene(), fx=createVillaPoolFinishMaps();
const m=Object.fromEntries(['oak','stone','plaster','glass','bronze','roof','exteriorTimber'].map(k=>[k,new THREE.MeshStandardMaterial({transparent:k==='glass'})])) as VillaSurfaces;
let shell:THREE.Group,deck:THREE.Object3D,pergola:THREE.Object3D,road:THREE.Object3D;
const meshes=(root:THREE.Object3D)=>{const out:THREE.Mesh[]=[];root.traverse(o=>{if(o instanceof THREE.Mesh)out.push(o);});return out;};
beforeAll(()=>{
  shell=createVillaEnvelope(scene,m);createVillaPoolside(scene,m,fx.tile,fx.ripple,m.bronze);createVillaPergola(scene,m,m.bronze);createVillaDrivingCourse(scene);createVillaOutdoorModel(scene);
  deck=scene.getObjectByName('villa-terraces-and-pool')!;pergola=scene.getObjectByName('villa-mortised-pergola')!;road=scene.getObjectByName('garden-road')!;scene.updateMatrixWorld(true);
});
afterAll(()=>{
  const mats=new Set<THREE.Material>(), maps=new Set<THREE.Texture>();
  for(const o of meshes(scene)){o.geometry.dispose();for(const t of Array.isArray(o.material)?o.material:[o.material]) mats.add(t);}
  mats.forEach(t=>{for(const value of Object.values(t))if(value instanceof THREE.Texture)maps.add(value);t.dispose();});maps.forEach(t=>t.dispose());scene.clear();
});
function ray(root:THREE.Object3D,p:[number,number,number],dir:[number,number,number],far=3) {
  return new THREE.Raycaster(new THREE.Vector3(...p),new THREE.Vector3(...dir),0,far).intersectObject(root,true)[0];
}
const down=(o:THREE.Object3D,x:number,y:number,z:number)=>ray(o,[x,y,z],[0,-1,0]);

describe('exterior: completed surfaces at actual metre scale',()=>{
  it('returns sheet mosaic through the cove without a collapsed, doubled or stretched texture axis',()=>{
    const basin=meshes(deck).find(o=>(o.material as THREE.Material).name==='pool/fired-mosaic')!, g=basin.geometry;
    const p=g.getAttribute('position'),uv=g.getAttribute('uv'),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
    for(let i=0;i<p.count;i+=3){
      a.fromBufferAttribute(p,i); b.fromBufferAttribute(p,i+1).sub(a);c.fromBufferAttribute(p,i+2).sub(a);
      const physical=b.cross(c).length(), s=uv.getX(i),t=uv.getY(i);
      const unfolded=POOL_TILE_SHEET**2*Math.abs((uv.getX(i+1)-s)*(uv.getY(i+2)-t)-(uv.getX(i+2)-s)*(uv.getY(i+1)-t));
      expect(physical).toBeGreaterThan(.0001);expect(unfolded/physical).toBeCloseTo(1,3);
    }
    expect(down(deck,POOL.minX+.007,.1,1)!.point.y).toBeGreaterThan(down(deck,POOL.minX+.19,.1,1)!.point.y+.046);
    const cx=(POOL.minX+POOL.maxX)/2, drain=POOL.minZ+2.05;
    expect(down(deck,cx,.1,drain)!.point.y-down(deck,cx+.012,.1,drain)!.point.y).toBeGreaterThan(.021);
  });
  it('has recessed mortar below the stone arris, solid board edges and voids down to the deck bed',()=>{
    const cx=(POOL.minX+POOL.maxX)/2, edge=POOL.maxZ;
    // The south run has eight full stones with a mortar joint at the centre.
    const face=down(deck,cx+.095,.2,edge+.21)!,joint=down(deck,cx,.2,edge+.21)!;
    expect(face.point.y-joint.point.y).toBeGreaterThan(.008);
    const start=edge+.367, pitch=(edge+4-start)/24,x=cx+1.17,z=start+6*pitch;
    const board=down(deck,x,.2,z+pitch/2)!, slot=down(deck,x,.2,z)!;
    expect((board.object as THREE.Mesh).material).toBe(m.exteriorTimber);
    expect(board.point.y-slot.point.y).toBeGreaterThan(.036);
    // Probe horizontally into the exposed board flank below its routed arris.
    expect(ray(deck,[x,-.010,z],[0,0,1],.02)?.distance).toBeCloseTo(.003,4);
    const along=down(deck,x+.19,.2,z+pitch/2)!;
    expect(along.uv!.x-board.uv!.x).toBeCloseTo(.19/2.5,4);expect(along.uv!.y).toBeCloseTo(board.uv!.y,5);
  });
  it('fits the outer coated glazing to the pavilion outside, independent of the transparent interior face',()=>{
    const west=-1.15,z=-2.64;
    const exterior=ray(shell,[west-.5,8.65,z],[1,0,0])!,interior=ray(shell,[west+.5,8.65,z],[-1,0,0])!;
    expect((exterior.object as THREE.Mesh).material).toBe(m.glass);expect((interior.object as THREE.Mesh).material).toBe(m.glass);
    expect(exterior.uv!.x).toBeGreaterThan(3);expect(exterior.uv!.x).toBeLessThan(4);
    expect(interior.uv!.x).toBeGreaterThan(6);expect(interior.uv!.x).toBeLessThan(7);
    expect(interior.point.x-exterior.point.x).toBeCloseTo(.035,5);
    const water=(scene.getObjectByName('villa-pool-water') as THREE.Mesh).material as THREE.MeshPhongMaterial;
    expect(water.map).toBe(m.glass.map);expect(water.map).toBe(gardenReflection(scene));expect(water.normalMap).toBe(fx.ripple);
    expect(water.depthWrite).toBe(false);expect(water.opacity).toBeLessThan(.3);
  });
  it('carries the post above a drained foot and the long grain parallel to each rafter notch',()=>{
    const x=-3.1,z=1.3,front=(y:number)=>ray(pergola,[x,y,z+.30],[0,0,-1],.6)!.point.z-z;
    expect(front(7.208)).toBeGreaterThan(.117);expect(front(7.26)).toBeLessThan(.059);expect(front(7.42)).toBeCloseTo(.080,4);
    const a=down(pergola,-6.70,10.5,1.1)!,b=down(pergola,-6.2,10.5,1.1)!;
    expect((a.object as THREE.Mesh).material).toBe(m.exteriorTimber);expect(b.uv!.x-a.uv!.x).toBeCloseTo(.5/2.5,4);expect(b.uv!.y).toBeCloseTo(a.uv!.y,4);
  });
  it('lays paint along the actual grade at 100 mm, with a sloping irregular gravel toe, not a second hidden highway',()=>{
    const r=VILLA_SCENIC_ROAD, x=r.x, outer=r.z+r.radiusZ+r.width/2;
    const paint=meshes(road).find(o=>(o.material as THREE.Material).name==='estate-road-edge-paint')!;
    const stripe=paint.geometry.getAttribute('position'), widths=new Set<number>();
    for(let i=0;i<stripe.count;i++)if(Math.abs(stripe.getX(i)-x)<.0001&&Math.abs(stripe.getZ(i)-outer)<.4)widths.add(stripe.getZ(i));
    expect(widths.size).toBe(2);expect(Math.max(...widths)-Math.min(...widths)).toBeCloseTo(.100,4);
    const shoulder=meshes(road).find(o=>(o.material as THREE.Material).name==='estate-road-shoulder')!;
    expect(down(shoulder,x,1,r.z+r.radiusZ)).toBeUndefined(); // no duplicate lane underneath
    const inner=down(shoulder,x,1,outer+.02)!,toe=down(shoulder,x,1,outer+.24)!;
    expect(inner.point.y-toe.point.y).toBeGreaterThan(.014);
    const asphalt=meshes(road).find(o=>(o.material as THREE.Material).name==='estate-road-asphalt')!;
    const a=down(asphalt,x,1,outer-1.8)!,b=down(asphalt,x+.25,1,outer-1.8)!;
    expect(b.uv!.x-a.uv!.x).toBeCloseTo(.25/.61,4);expect(b.uv!.y).toBeCloseTo(a.uv!.y,4);
  });
  it('keeps panel weave measured across a sag and leaves matching UVs on the reverse, not all-zero fallback UVs',()=>{
    const g=fabricPanel((u,v)=>[u-.5,.41-.09*Math.sin(Math.PI*u)*Math.sin(Math.PI*v),v*.52],[0,-.012,0]);
    const chair=new THREE.Mesh(g,m.oak), a=down(chair,-.16,1,.26)!, b=down(chair,.16,1,.26)!, reverse=ray(chair,[-.16,0,.26],[0,1,0])!;
    expect((b.uv!.x-a.uv!.x)*.16).toBeGreaterThanOrEqual(.320);expect((b.uv!.x-a.uv!.x)*.16).toBeLessThan(.323);
    expect(a.uv!.distanceTo(reverse.uv!)).toBeLessThan(.001);expect(a.point.y-reverse.point.y).toBeCloseTo(.012,4);g.dispose();
  });
  it('seats the swing ropes in real blind bores on the original animated pin axis',()=>{
    const brass=meshes(scene.getObjectByName('villa-swing-seat')!).find(o=>(o.material as THREE.MeshStandardMaterial).color.getHexString()==='a38a63')!;
    const s=VILLA_SWING;
    for(const side of [-1,1]){
      const x=s.x+side*.57,y=s.y+s.pivotHeight;
      // Start below the swage, testing the socket itself, not the cap of the rope
      // that fills it. The lip of the sleeve ends 42 mm below the pivot datum.
      const bore=ray(brass,[x,y-.055,s.z],[0,1,0],.09)!, lip=ray(brass,[x+.014,y-.055,s.z],[0,1,0],.09)!;
      expect(bore.point.y).toBeCloseTo(y,5);expect(bore.point.y-lip.point.y).toBeCloseTo(.042,4);
    }
  });
  it('owns finite mipmapped repeat textures and deterministic non-flat normal/focus/fired-clay samples',()=>{
    const copy=createVillaPoolFinishMaps(), cloth=canvasWeave(),grit=mineralAggregate();
    try {
      const probe=gardenReflection(scene), all=[fx.tile,fx.ripple,probe,cloth,grit], pixels=(t:THREE.DataTexture)=>t.image.data as Uint8Array;
      expect(all.reduce((v,t)=>v+pixels(t).byteLength,0)).toBeLessThanOrEqual(600*1024);
      expect(all.every(t=>t.generateMipmaps&&t.wrapS===THREE.RepeatWrapping&&t.minFilter===THREE.LinearMipmapLinearFilter)).toBe(true);
      for(const key of ['tile','ripple'] as const)expect(Buffer.from(pixels(fx[key])).equals(Buffer.from(pixels(copy[key])))).toBe(true);
      const bytes=pixels(fx.ripple); let min=255,max=0,strong=0;
      for(let i=0;i<bytes.length;i+=4){min=Math.min(min,bytes[i+3]);max=Math.max(max,bytes[i+3]);if(Math.abs(bytes[i]-128)>7)strong++;}
      expect(max-min).toBeGreaterThan(180);expect(strong).toBeGreaterThan(bytes.length/45);expect(fx.ripple.colorSpace).toBe(THREE.NoColorSpace);
      // Adjacent fired tiles differ, even away from their grout line.
      const chips=pixels(fx.tile);const centers=Array.from({length:8},(_,i)=>chips[(16*256+16+32*i)*4]);expect(Math.max(...centers)-Math.min(...centers)).toBeGreaterThan(14);
    }finally{copy.tile.dispose();copy.ripple.dispose();cloth.dispose();grit.dispose();}
  });
});
