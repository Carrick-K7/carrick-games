import * as THREE from 'three';
import {describe,it,expect,afterEach,vi} from 'vitest';
import {cutInteriorFloor,villaFloorTrade} from '../src/villaInteriorFlooring.js';
import {wetWallPanel,faceInteriorWalls,roomFinishes} from '../src/villaRoomLining.js';
import {chartMillStock,bindMillMaterial,insideOccupiedFabric} from '../src/villaMillFinish.js';
import {interiorSwatches,ROOM_FINISH_DATA} from '../src/villaInteriorSurfaces.js';
import {VILLA_INTERIOR_SWATCHES} from '../src/villaInteriorSwatchData.js';
import {VillaModelBuilder} from '../src/villaModel.js';
import {VILLA_BLOCKS} from '../src/villaWorld.js';

const hit=(o:THREE.Object3D,p:number[],d:number[],far=4)=>new THREE.Raycaster(new THREE.Vector3(...p),new THREE.Vector3(...d),0,far).intersectObject(o,true)[0];
afterEach(()=>vi.unstubAllGlobals());
describe('indoor material construction, not a replacement render',()=>{
  it('mitres two pieces of oak in opposing fibre directions at a real open joint',()=>{
    const m=new THREE.MeshStandardMaterial(), gs=cutInteriorFloor({x:-16.1,z:2,w:4,d:3},0),o=new THREE.Mesh(gs[0]!.geometry,m);
    try {
      expect(gs.map(g=>g.trade)).toEqual(['parquet']);
      const spine=-20*.805,x=spine,z=2.15,tex=(u:number,v:number)=>hit(o,[u,.12,v],[0,-1,0],.16)?.uv;
      expect(tex(x,z)).toBeUndefined();expect(hit(o,[x+.023,.12,z],[0,-1,0],.16)!.point.y).toBe(0);
      const du0=tex(x-.035,z+.002)!.x-tex(x-.035,z)!.x, du1=tex(x+.035,z+.002)!.x-tex(x+.035,z)!.x;
      expect(du0*du1).toBeLessThan(0);expect(Math.abs(du1)).toBeCloseTo(.002*Math.SQRT1_2/1.80,6);
      const a=gs[0]!.geometry.getAttribute('color');expect(new Set(Array.from({length:a.count},(_,i)=>a.getX(i))).size).toBeGreaterThan(20);
    } finally{gs.forEach(({geometry})=>geometry.dispose());m.dispose();}
  });
  it('cuts the dry/wet transition into one support, with no second wooden face under a tile or across the east stair opening',()=>{
    const b={x:-10.6,z:-4.6,w:2,d:2},gs=cutInteriorFloor(b,0),mat=new THREE.MeshStandardMaterial(),o=new THREE.Group();
    try{for(const {trade,geometry} of gs){const mesh=new THREE.Mesh(geometry,mat);mesh.name=trade;o.add(mesh);}
      expect(hit(o,[-10.5,.2,-5.10],[0,-1,0])!.object.name).toBe('terrazzo');expect(hit(o,[-10.5,.2,-4.13],[0,-1,0])!.object.name).toBe('parquet');
      expect(hit(o,[-10.5,.2,-5.10],[0,-1,0])!.point.y).toBe(0);expect(villaFloorTrade(11,-13,0)).toBe('rubber');expect(villaFloorTrade(22,-15,0)).toBe('wool');
      const hole=VILLA_BLOCKS.filter(v=>v.assembly==='storey-slab'&&v.y<4).every(v=>!(.2>v.x-v.w/2&&.2<v.x+v.w/2&&-3>v.z-v.d/2&&-3<v.z+v.d/2));expect(hole).toBe(true);
    }finally{gs.forEach(({geometry})=>geometry.dispose());mat.dispose();}
  });
  it('shapes each ceramic shoulder against the recessed bed without an extra skin across grout',()=>{
    const g=wetWallPanel(1.2,1.17),m=new THREE.MeshStandardMaterial(),o=new THREE.Mesh(g,m);
    try{const depth=(x:number)=>hit(o,[x,.2,.1],[0,0,-1],.15)?.point.z;expect(depth(-.36)).toBeUndefined();expect(depth(-.36+.0026)!).toBeGreaterThan(.002);expect(depth(-.36+.0026)!).toBeLessThan(depth(-.36+.018)!-.001);}
    finally{g.dispose();m.dispose();}
  });
  it('assigns just the occupied side of the exact existing plaster block, leaving the garden side untouched',()=>{
    const root=new THREE.Scene(),b=new VillaModelBuilder(root,'test envelope'),f=roomFinishes(),outside=new THREE.MeshStandardMaterial();
    const v=VILLA_BLOCKS.find(v=>v.material==='plaster'&&v.z===9&&v.w>.05&&v.h>3&&v.x < -12)!;faceInteriorWalls(b,v,f,outside);b.finish();
    try{expect((hit(root,[v.x,1,9.7],[0,0,-1],1)!.object as THREE.Mesh).material).toBe(outside);expect((hit(root,[v.x,1,8],[0,0,1],1.3)!.object as THREE.Mesh).material).toBe(f.wall);}
    finally{root.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});for(const m of new Set([...Object.values(f.floor),f.wall,f.ceiling,f.rail,f.tile,f.ceramicJoint,f.reveals,f.board,outside])){m.map?.dispose();m.dispose();}}
  });
  it('charts face grain once at metric gauge, distinguishes sawn ends, and preserves original roof UVs',()=>{
    const g=new THREE.BoxGeometry(1.5,.09,.28),o=g.clone();const original=new Float32Array(o.getAttribute('uv').array);
    try{chartMillStock(g,'oak',true,13);chartMillStock(o,'oak',false,4);const flag=g.getAttribute('uv1'),uv=g.getAttribute('uv'),p=g.getAttribute('position'),n=g.getAttribute('normal');
      const top=Array.from({length:p.count},(_,i)=>i).filter(i=>n.getY(i)>.9);const i=top[0]!,j=top.find(k=>Math.abs(p.getX(k)-p.getX(i))>1)!;
      expect(Math.abs(uv.getX(i)-uv.getX(j))).toBeCloseTo(1.5/1.8,5);expect(flag.getX(i)).toBeGreaterThan(.8);
      expect(Array.from({length:flag.count},(_,i)=>flag.getY(i)).filter(v=>v===1)).toHaveLength(8);expect(o.getAttribute('uv').array).toEqual(original);expect(o.getAttribute('uv1').getX(0)).toBe(-1);
      expect(insideOccupiedFabric(1,7.21,-3)).toBe(false);expect(insideOccupiedFabric(-35,0,4)).toBe(false);expect(insideOccupiedFabric(34,.8,-6)).toBe(true);
    }finally{g.dispose();o.dispose();}
  });
  it('uses target-size fallbacks, local-only decoded samples, failure and cancelled callbacks on the original texture only',async()=>{
    const imgs:Img[]=[];class Img{naturalWidth=0;naturalHeight=0;decoding='';onload:(()=>void)|null=null;onerror:(()=>void)|null=null;set src(url:string){expect(Object.values(VILLA_INTERIOR_SWATCHES)).toContain(url);imgs.push(this);}}
    const ctx={fillRect:vi.fn(),drawImage:vi.fn()};vi.stubGlobal('Image',Img);vi.stubGlobal('document',{createElement:()=>({getContext:()=>ctx})});const cb=vi.fn(),s=interiorSwatches(cb);const allocated=Object.values(s.maps),events=allocated.map(t=>{const f=vi.fn();t.addEventListener('dispose',f);return f;});
    const [o,t,p]=imgs;[o!.naturalWidth,o!.naturalHeight]=ROOM_FINISH_DATA.oak;o!.onload!();t!.naturalWidth=t!.naturalHeight=1;t!.onload!();const late=p!.onload!;s.dispose();s.dispose();late();
    expect(await s.ready).toEqual({oak:'decoded',limestone:'failed',plaster:'cancelled'});expect(cb).toHaveBeenCalledTimes(1);expect(ctx.drawImage).toHaveBeenCalledTimes(1);events.forEach(f=>expect(f).toHaveBeenCalledTimes(1));
    const mat=new THREE.MeshStandardMaterial();bindMillMaterial(mat,s.maps.oak,'oak');expect(mat.customProgramCacheKey()).toContain('domestic-workpiece');mat.dispose();
  });
});
