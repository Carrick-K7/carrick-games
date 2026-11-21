import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createVillaGaming } from '../src/villaGaming.js';
import { VILLA_RACING } from '../src/villaActivities.js';

type Pt=[number,number,number];
const scene=new THREE.Group(); let equipment:THREE.Mesh[],figures:THREE.Mesh[],gallery:THREE.Object3D;
const meshes=(root:THREE.Object3D)=>{const list:THREE.Mesh[]=[];root.traverse(o=>{if(o instanceof THREE.Mesh)list.push(o);});return list;};
const ray=(objects:THREE.Mesh[],origin:Pt,direction:Pt,far:number)=>new THREE.Raycaster(new THREE.Vector3(...origin),new THREE.Vector3(...direction),.00001,far).intersectObjects(objects);
const groundY=(x:number,y:number,z:number,far:number)=>ray(equipment,[x,y,z],[0,-1,0],far)[0]?.point.y;
const galleryRay=(parts:THREE.Mesh[],origin:Pt,dir:Pt,far:number)=>new THREE.Raycaster(gallery.localToWorld(new THREE.Vector3(...origin)),new THREE.Vector3(...dir).transformDirection(gallery.matrixWorld),.00001,far).intersectObjects(parts);
beforeAll(()=>{
  const ctx=new Proxy({}, { get:(_,key)=>key==='createLinearGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true });
  vi.stubGlobal('document',{createElement:()=>({width:0,height:0,getContext:()=>ctx})});
  createVillaGaming(scene);scene.updateMatrixWorld(true);
  const room=scene.getObjectByName('villaGaming')!;equipment=room.children.filter(m=>m instanceof THREE.Mesh) as THREE.Mesh[];
  gallery=scene.getObjectByName('originalAnimeFigureWall')!;figures=meshes(gallery);
});
afterAll(()=>{
  const materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
  for(const m of meshes(scene)){m.geometry.dispose();materials.add(m.material as THREE.Material);}
  for(const m of materials){Object.values(m).forEach(v=>{if(v instanceof THREE.Texture)textures.add(v);});m.dispose();}
  textures.forEach(t=>t.dispose());scene.clear();vi.unstubAllGlobals();
});

describe('Villa gaming hardware in the assembled room',()=>{
  it('exposes seven shaped blades and seven gaps through each clear PC intake, and a pierced exhaust lid',()=>{
    const carriers=equipment.filter(m=>m.material instanceof THREE.MeshStandardMaterial&&m.material.color.getHex()===0x20272b);
    for(let f=0;f<3;f++) {
      const cy=.8+.115+f*.124;
      const covered=Array.from({length:100},(_,i)=>{const a=i*Math.PI/50;
        return ray(carriers,[8.12+.037*Math.cos(a),cy+.037*Math.sin(a),4.02],[0,0,-1],.035).length>0;
      });
      expect(covered.filter((v,i)=>v&&!covered[(i+99)%100])).toHaveLength(7);
      // The transparent pane is in front of the impeller, not opaque glass-coloured paint.
      const hit=ray(equipment,[8.12,cy,4.08],[0,0,-1],.10)[0];expect(((hit.object as THREE.Mesh).material as THREE.Material).transparent).toBe(true);
    }
    const z=3.84+.095-3*.027;
    expect(groundY(8.145,1.30,z+.0135,.12)).toBeCloseTo(1.276,3);
    expect(groundY(8.145,1.30,z,.12)).toBeLessThan(1.260);
  });
  it('gives a key a dish, the long spacebar a convex thumb face, and the mouse a shell split',()=>{
    const escX=6.70, escZ=3.950;
    expect(groundY(escX+.009,.89,escZ,.08)!-groundY(escX,.89,escZ,.08)!).toBeGreaterThan(.0010);
    const spaceX=6.89125,spaceZ=4.112;
    expect(groundY(spaceX,.89,spaceZ,.08)!-groundY(spaceX+.071,.89,spaceZ,.08)!).toBeGreaterThan(.0010);
    const mouse=7.48,nose=3.964;
    const middle=groundY(mouse,.89,nose,.10),button=groundY(mouse+.012,.89,nose,.10);
    expect(button!-middle!).toBeGreaterThan(.004);
  });
  it('cuts both harness eyes all the way through the simulator seat, beside a solid wrapped shoulder',()=>{
    const {x,z}=VILLA_RACING.seat;
    const back=(offset:number)=>ray(equipment,[x+offset,1.044,z+.015],[0,0,-1],.40);
    expect(back(-.104)).toHaveLength(0);expect(back(.104)).toHaveLength(0);
    expect(back(.012)[0]?.distance).toBeGreaterThan(.22);expect(back(.012)[0]?.distance).toBeLessThan(.35);
    const lip=groundY(x+.530,.25,7.42,.14),channel=groundY(x+.5,.25,7.42,.14);
    expect(lip!-channel!).toBeGreaterThan(.03);
  });
  it('shows the folded crown and undercut of console wings above the deck, and the lower dock wall below its screen',()=>{
    const centre=groundY(9.29,.69,8.53,.14)!,wing=groundY(9.46,.69,8.60,.14)!;
    expect(wing-centre).toBeGreaterThan(.012);
    const face=ray(equipment,[10.32,.68,8.34],[0,0,1],.24)[0];
    expect((face.object as THREE.Mesh).material).toBeInstanceOf(THREE.MeshBasicMaterial);
    const lower=ray(equipment,[10.32,.57,8.34],[0,0,1],.24)[0];
    expect(lower.point.z).toBeLessThan(face.point.z-.032);
  });
  it('retains a closed transparent case face across all three existing decorative bays',()=>{
    for(const y of [.66,1.52,2.28]) for(const x of [9.51,10.70]) {
      const hit=ray(equipment,[x,y,3.72],[0,0,-1],.5)[0];expect(hit).toBeDefined();
      expect(((hit.object as THREE.Mesh).material as THREE.Material).transparent).toBe(true);
      expect(hit.point.z).toBeCloseTo(3.514,3);
    }
  });
});

describe('physical collection details',()=>{
  it('keeps rolled hems, collars, hair tips and bow loops lit from their own side of the fold',()=>{
    const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),n=new THREE.Vector3();
    let smallest=1, zeroArea=0, nonUnit=0;
    for(const part of figures){
      const p=part.geometry.getAttribute('position'),ns=part.geometry.getAttribute('normal');
      for(let i=0;i<p.count;i+=3){
        a.fromBufferAttribute(p,i); b.fromBufferAttribute(p,i+1).sub(a); c.fromBufferAttribute(p,i+2).sub(a);
        b.cross(c); if(b.lengthSq()<1e-25){zeroArea++;continue;} b.normalize();
        for(let k=0;k<3;k++){
          n.fromBufferAttribute(ns,i+k); smallest=Math.min(smallest,n.dot(b)); if(Math.abs(n.length()-1)>.001)nonUnit++;
        }
      }
    }
    expect(zeroArea).toBe(0);expect(nonUnit).toBe(0);expect(smallest).toBeGreaterThanOrEqual(-.001);
  });
  it('turns the dress hem onto an inner lining without closing across the legs',()=>{
    const piece=gallery.getObjectByName('originalAnimeFigure-0')!.position;
    const dress=figures.filter(m=>(m.material as THREE.Material).name==='anime-display-sage');
    // Look up inside Hazel’s hem, away from her boots; a disc at the hem fails.
    expect(galleryRay(dress,[piece.x+.060,piece.y+.110,piece.z+.004],[0,1,0],.056)).toHaveLength(0);
    const side=galleryRay(dress,[piece.x+.060,piece.y+.155,piece.z+.004],[1,0,0],.080)[0];
    expect(side?.distance).toBeGreaterThan(.020);expect(side?.distance).toBeLessThan(.053);
    expect(side.face!.normal.x).toBeLessThan(-.55); // lining, not back-face rendering
  });
  it('forms an open cloth loop on a head bow, with a physical wrapped outer edge',()=>{
    const piece=gallery.getObjectByName('originalAnimeFigure-0')!.position;
    const bow=figures.filter(m=>(m.material as THREE.Material).name==='anime-display-rose');
    const x=piece.x-.011*.45+.043+.0015+.020*.57, y=piece.y+.652+.00057;
    const probe=(dy:number)=>galleryRay(bow,[x,y+dy,piece.z+.012],[0,0,-1],.026);
    expect(probe(0)).toHaveLength(0);
    expect(probe(.0048).length).toBeGreaterThan(0);
  });
});
