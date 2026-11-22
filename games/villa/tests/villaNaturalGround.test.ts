import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import * as THREE from 'three';
import { createCultivatedGround,kitchenCourtDistance,tintManagedLawn } from '../src/villaGardenFloor.js';
import { VILLA_VEGETABLE_BEDS } from '../src/villaGarden.js';
import { VILLA_SUN_BYTES } from '../src/villaSunSurveyData.js';
import { unpackSurvey,VILLA_SUN_FIELD } from '../src/villaSolarSurvey.js';
import { NatureMesh } from '../src/villaNatureGeometry.js';
import { createVillaFenceBankGeometry } from '../src/villaFenceBank.js';
import { addVillaPales,shelteredBay } from '../src/villaGardenFence.js';
import { VillaModelBuilder } from '../src/villaModel.js';
import { VILLA_BUILDING_GROUND_CUTS,villaPondContains,villaTerrainGroundHeight } from '../src/villaEstateLayout.js';
import { villaStreamContains } from '../src/villaStream.js';

describe('meter-scale courtyard and veil of garden ground',()=>{
  const parent=new THREE.Group(),gravel=new THREE.MeshStandardMaterial({vertexColors:true});let root:THREE.Group,mesh:THREE.Mesh;
  beforeAll(()=>{root=createCultivatedGround(parent,gravel);parent.updateMatrixWorld(true);mesh=root.getObjectByName('garden-workcourt/compacted-gravel') as THREE.Mesh;});
  afterAll(()=>{root.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();o.material.dispose();}});});
  const top=(x:number,z:number)=>new THREE.Raycaster(new THREE.Vector3(x,5,z),new THREE.Vector3(0,-1,0)).intersectObject(mesh)[0]?.point.y;
  it('bedding connects all four working aisles; its top is horizontal and the edge beds below the lawn',()=>{
    for(const b of VILLA_VEGETABLE_BEDS)for(const [dx,dz] of [[-1,0],[1,0],[0,-1],[0,1]]){
      const x=b.x+dx*(.29+b.w*.5),z=b.z+dz*(.29+b.d*.5);expect(kitchenCourtDistance(x,z)).toBeLessThan(0);expect(top(x,z)!).toBeGreaterThan(0);expect(top(x,z)!).toBeLessThan(.017);}
    expect(top(-7.9,19.5)).toBeGreaterThan(0);expect(top(-13.4,20.5)).toBeUndefined();
    const p=mesh.geometry.getAttribute('position'),uv=mesh.geometry.getAttribute('uv');let low=0;
    for(let i=0;i<p.count;i++){if(kitchenCourtDistance(p.getX(i),p.getZ(i))>.027 && p.getY(i)<-.021)low++;expect(uv.getX(i)).toBeCloseTo(p.getX(i),4);expect(uv.getY(i)).toBeCloseTo(p.getZ(i),4);}expect(low).toBeGreaterThan(80);
  });
  it('uses buried individual chips and bowed, grounded multi-plane tillers not a vertical turf fringe',()=>{
    const grit=(root.getObjectByName('garden-substrate/stone-chips') as THREE.Mesh).geometry,gs=(root.getObjectByName('garden-substrate/grass-tillers') as THREE.Mesh).geometry;
    const p=gs.getAttribute('position');expect(p.count%5).toBe(0);expect(p.count/5).toBeGreaterThan(1300);expect(gs.index!.count/3).toBeLessThan(70_000);
    for(let i=0;i<p.count;i+=5){const x=p.getX(i),z=p.getZ(i),y=p.getY(i);expect(villaPondContains(x,z)).toBe(false);expect(villaStreamContains(x,z,0,true)).toBe(false);expect(VILLA_BUILDING_GROUND_CUTS.some(b=>x>b.minX&&x<b.maxX&&z>b.minZ&&z<b.maxZ)).toBe(false);expect(Math.abs(y-(villaTerrainGroundHeight(x,z)-.021))).toBeLessThan(.051);expect(p.getY(i+2)).toBeGreaterThan(y+.009);expect(Math.hypot(p.getX(i+4)-x,p.getZ(i+4)-z)).toBeGreaterThan(.009);}
    const q=grit.getAttribute('position');expect(q.count%11).toBe(0);let r=0;for(let i=0;i<q.count;i+=11)for(let j=i+1;j<i+11;j++)r=Math.max(r,Math.hypot(q.getX(i)-q.getX(j),q.getZ(i)-q.getZ(j)));expect(r).toBeGreaterThan(.014);expect(r).toBeLessThan(.070);
    // Include the rolling apron, not just the planar middle. Exposed gravel must have
    // BOTH an embedded periphery and a visible face, never hover over the actual court mesh.
    for(let i=0;i<q.count;i+=11*7){let low=Infinity,high=-Infinity;for(let j=i;j<i+11;j++){
      const x=q.getX(j),z=q.getZ(j),surface=Math.max(villaTerrainGroundHeight(x,z)-.022,top(x,z)??-Infinity),h=q.getY(j)-surface;low=Math.min(low,h);high=Math.max(high,h);}
      expect(low).toBeLessThan(-.0003);expect(high).toBeGreaterThan(.0004);
    }
  });
  it('varies turf continuously without replacing physical surface indices or normals',()=>{const g=new THREE.PlaneGeometry(70,80,17,19);g.rotateX(-Math.PI/2);const p=g.attributes.position,n=g.attributes.normal,idx=g.index;tintManagedLawn(g);expect(g.attributes.position).toBe(p);expect(g.attributes.normal).toBe(n);expect(g.index).toBe(idx);const c=g.attributes.color!,v=Array.from({length:c.count},(_,i)=>c.getX(i));expect(Math.max(...v)-Math.min(...v)).toBeGreaterThan(.1);g.dispose();});
});

describe('wood joints, shade and botanical charts',()=>{
  it('supports boundary posts on all four sides before falling to the outer meadow, without sealing the stream mouth',()=>{
    const g=createVillaFenceBankGeometry(),mat=new THREE.MeshBasicMaterial(),m=new THREE.Mesh(g,mat),ray=new THREE.Raycaster();m.updateMatrixWorld();
    const top=(x:number,z:number)=>{ray.set(new THREE.Vector3(x,8,z),new THREE.Vector3(0,-1,0));return ray.intersectObject(m)[0]?.point.y;};
    for(const [x,z] of [[-40.3,19.2081],[-40.3,110],[62.3,7],[11,-58.3],[-.84,162.3]])expect(top(x,z)).toBeCloseTo(villaTerrainGroundHeight(x,z),3);
    const streamZ=-38+1.7*Math.sin(-40*.088); // sample actual channel polygon, not an approximate bank width
    let n=0;for(let z=streamZ-7;z<=streamZ+7;z+=.12){if(villaStreamContains(-40.5,z,0,true)){expect(top(-40.5,z)).toBeUndefined();n++;}}expect(n).toBeGreaterThan(12);
    expect(top(-42.2,20)!).toBeLessThan(-1.13);g.dispose();mat.dispose();
  });
  it('charts face grain along the pale, and leaves real gaps on the raked fence',()=>{
    const root=new THREE.Group(),builder=new VillaModelBuilder(root,'f'),m=new THREE.MeshStandardMaterial();addVillaPales(builder,[0,0,0],[2,.18,0],m);builder.finish();root.updateMatrixWorld(true);
    const geometry=(builder.root.children[0] as THREE.Mesh).geometry,ray=new THREE.Raycaster();let hit=0,miss=0;for(let i=0;i<160;i++){ray.set(new THREE.Vector3(.07+i/160*1.86,.74,.4),new THREE.Vector3(0,0,-1));if(ray.intersectObject(builder.root).length)hit++;else miss++;}expect(hit).toBeGreaterThan(110);expect(miss).toBeGreaterThan(9);expect(shelteredBay(-40.3,20,false)).toBe(true);expect(shelteredBay(-40.3,110,false)).toBe(false);const colors=geometry.attributes.color!;expect(colors.count).toBe(geometry.attributes.position!.count);geometry.dispose();m.dispose();
  });
  it('maps older uncharted vertices to neutral coordinates and does not lose per-point pigment',()=>{const g=new NatureMesh();g.point([0,0,0],.75);g.point([1,0,0],.8,[.3,.4],[.29,.62,.18]);g.point([0,1,0],.89);g.tri(0,1,2);const result=g.geometry(true);expect(result.attributes.uv!.getX(0)).toBe(0);expect(result.attributes.uv!.getY(1)).toBeCloseTo(.4);expect(result.attributes.color!.getX(0)).toBeCloseTo(.75);expect(result.attributes.color!.getY(1)).toBeCloseTo(.62);expect(result.attributes.color!.getZ(2)).toBeCloseTo(.89);result.dispose();});
  it('decodes literal and run packets exactly and rejects incomplete or overflowing data',()=>{expect([...unpackSurvey(new Uint8Array([129,91, 2,2,7,3]),5)]).toEqual([91,91,2,7,3]);for(const [arr,n] of [[[131,1],3],[[127,2],128],[[128],1],[[128,1],3]] as const)expect(()=>unpackSurvey(Uint8Array.from(arr),n)).toThrow();});
  it('stores a real solid house section and alternating branch shadow and clear sky to the northeast of the fruit tree',()=>{const f=VILLA_SUN_FIELD,a=unpackSurvey(Uint8Array.from(atob(VILLA_SUN_BYTES),x=>x.charCodeAt(0)),f.cols*f.rows);const y=(x:number,z:number)=>{const ix=Math.floor((x-f.left)*f.cols/f.width),iz=Math.floor((z-f.top)*f.rows/f.depth);return a[ix+iz*f.cols]!*(f.maxY-f.minY)/255+f.minY;};expect(y(4,-10)).toBeGreaterThan(6);const seen=[];for(let x=-13;x<=-6;x+=.20)for(let z=16;z<=23;z+=.20)seen.push(y(x,z));expect(seen.filter(k=>k>1.4).length).toBeGreaterThan(40);expect(seen.filter(k=>k<.2).length).toBeGreaterThan(65);});
});
