import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createVillaBedroom, VILLA_MASTER_VANITY as V } from '../src/villaBedroom.js';
import { createVillaWardrobes, VILLA_MASTER_WARDROBE as W } from '../src/villaWardrobe.js';
import { createVillaSuiteFittings } from '../src/villaSuiteFittings.js';
import { createVillaBathDoorModel } from '../src/villaBathDoors.js';
import { bathFittings, treatmentTable, spaStorage, treatmentSupplies } from '../src/villaInteriorBath.js';
import { IndexedFittingBuilder } from '../src/villaFittingGeometry.js';
import type { FurnitureKit } from '../src/villaFurnitureForms.js';

type P = [number, number, number];
const vec = (p:P) => new THREE.Vector3(...p);
function parts(root:THREE.Object3D, match=(_:THREE.MeshStandardMaterial,__:THREE.Mesh)=>true) {
  const list:THREE.Mesh[]=[];
  root.traverse(o=>{if(o instanceof THREE.Mesh && match(o.material as THREE.MeshStandardMaterial,o)) list.push(o);});
  return list;
}
function ray(list:THREE.Mesh[], a:P, b:P, frame?:THREE.Matrix4) {
  const from=vec(a), to=vec(b);if(frame){from.applyMatrix4(frame);to.applyMatrix4(frame);}
  return new THREE.Raycaster(from,to.clone().sub(from).normalize(),0,to.distanceTo(from)).intersectObjects(list,false);
}
const material=(h:THREE.Intersection)=>(h.object as THREE.Mesh).material as THREE.MeshStandardMaterial;
const roots:THREE.Group[]=[];
function scene(){const r=new THREE.Group();roots.push(r);return r;}
function measurements(root:THREE.Object3D) {
  let triangles=0, vertices=0, draws=0;
  for(const m of parts(root)) { const g=m.geometry;vertices+=g.getAttribute('position').count;draws++;
    triangles+=(g.index?.count??g.getAttribute('position').count)/3*(m instanceof THREE.InstancedMesh ? m.count : 1); }
  return {triangles,vertices,draws};
}
const bedroomRoot=scene(), suiteRoot=scene(), doorsRoot=scene(), bathRoot=scene(), spaRoot=scene();
let bedroom:ReturnType<typeof createVillaBedroom>;
const makeKit=(root:THREE.Group) => {
  const b=new IndexedFittingBuilder(root,'fixture-section'), m=Object.fromEntries(['oak','walnut','linen','sage','terra','cream','brass','black','steel','white','stone','dark','leaf','leafLight','soil','blue','coral','lampGlow'].map(name=>{
    const mat=new THREE.MeshStandardMaterial();mat.name=name;return [name,mat];
  })) as FurnitureKit['m'];
  const kit:FurnitureKit={m, put:(g,m,x,y,z,rx=0,ry=0,rz=0)=>b.geometry(g,m,[x,y,z],[rx,ry,rz]),at:b.at.bind(b),
    box:(x,y,z,w,h,d,m,r,yaw)=>b.at(x,y,z,yaw??0,()=>b.box(0,0,0,w,h,d,m,r)),hit:b.collide.bind(b)};
  return {kit,b};
};
beforeAll(()=>{
  bedroom=createVillaBedroom(bedroomRoot);createVillaSuiteFittings(suiteRoot);createVillaBathDoorModel(doorsRoot);
  const {kit,b}=makeKit(bathRoot), water=new THREE.MeshStandardMaterial({transparent:true,opacity:.16}), screen=new THREE.MeshStandardMaterial({transparent:true});
  // The kitchen-owned washer and its contents have their own test. All wet
  // assemblies are built through the actual authoring callbacks at villa scale.
  const at=kit.at;kit.at=(x,y,z,a,run)=>{if(x!==9.4||z!==-8.08)at(x,y,z,a,run);};
  bathFittings(kit,water,screen,kit.m.black);b.finish();
  const spa=makeKit(spaRoot);treatmentTable(spa.kit);spa.kit.at(2,0,0,0,()=>spaStorage(spa.kit));
  spa.kit.at(-2,0,0,0,()=>treatmentSupplies(spa.kit));spa.b.finish();
  for(const root of roots) root.updateMatrixWorld(true);
});
afterAll(()=>{
  const gs=new Set<THREE.BufferGeometry>(),ms=new Set<THREE.Material>(),ts=new Set<THREE.Texture>();
  for(const r of roots){for(const m of parts(r)){gs.add(m.geometry);for(const mat of Array.isArray(m.material)?m.material:[m.material])ms.add(mat);}r.clear();}
  for(const m of ms){for(const v of Object.values(m))if(v instanceof THREE.Texture)ts.add(v);m.dispose();}ts.forEach(t=>t.dispose());gs.forEach(g=>g.dispose());
});

describe('inhabited fitted suite: functional sections on scene-owned finished triangles',()=>{
  it('bears on the metal rail and timber shoulders rather than dangling below or poking through the cloth',()=>{
    const clothes=parts(bedroomRoot,(m,o)=>!(o instanceof THREE.InstancedMesh)&&m.userData.fittedCloth&&m.color.getHex()===0xe4ddca);
    const stock=parts(bedroomRoot,(m,o)=>!(o instanceof THREE.InstancedMesh)&&m.userData.villaInteriorFinish==='oak');
    const metal=parts(bedroomRoot,(m,o)=>!(o instanceof THREE.InstancedMesh)&&m.metalness>.5);
    const x=W.x-W.width/2+.26-.043,z=W.z+.157, rail=W.y+1.98;
    const f=new THREE.Matrix4().makeRotationY(-.54).setPosition(x,W.y+1.905,z);
    for(const side of [-1,1])for(const off of [.06,.08,.10,.12,.14]) {
      const a:P=[side*off,.055,0],b:P=[side*off,-.075,0];
      const cloth=ray(clothes,a,b,f)[0], support=ray(stock,a,b,f)[0];
      expect(cloth).toBeDefined();expect(support).toBeDefined();
      const separation=cloth.point.y-support.point.y;expect(separation).toBeGreaterThan(.0002);expect(separation).toBeLessThan(.0024);
    }
    const crown=ray(metal,[x+.022,rail+.05,z],[x+.022,rail,z])[0];
    const bearing=ray(metal,[x,rail+.004,z],[x,rail+.028,z])[0];
    expect(bearing.point.y-crown.point.y).toBeGreaterThan(-.0001);expect(bearing.point.y-crown.point.y).toBeLessThan(.0006);
    expect(ray(metal,[x+.006,rail+.0118,z],[x+.006,rail+.027,z])).toHaveLength(0);
    const patterns=parts(bedroomRoot,(m,o)=>m.userData.fittedCloth&&!(o instanceof THREE.InstancedMesh)).map(m=>(m.material as THREE.MeshStandardMaterial).map!);
    expect(new Set(patterns.map(p=>p.name)).size).toBeGreaterThanOrEqual(4);
    for(const p of patterns){expect(p).toBeInstanceOf(THREE.DataTexture);expect(p.wrapS).toBe(THREE.RepeatWrapping);expect(p.generateMipmaps).toBe(true);}
  });

  it('keeps the folded trousers inside the cardigan above its hem, exposed as two legs below it',()=>{
    const frame=new THREE.Matrix4().makeRotationY(-.69).setPosition(W.x-W.width/2+2.5*.52-.043,W.y+1.905,W.z+.157);
    const fabric=parts(bedroomRoot,(m,o)=>!(o instanceof THREE.InstancedMesh)&&m.userData.fittedCloth&&m.map?.name==='suite yarn/houndstooth');
    const trousers=parts(bedroomRoot,(m,o)=>!(o instanceof THREE.InstancedMesh)&&m.userData.fittedCloth&&m.map?.name==='suite yarn/oxford');
    let pairs=0;
    for(const side of [-1,1]) for(const y of [-.47,-.40,-.31,-.24,-.17]) for(const x of [-.074,-.044,.023,.059,.080]) {
      const a:P=[x,y,side*.112],b:P=[x,y,-side*.112], leg=ray(trousers,a,b,frame)[0];if(!leg)continue;
      const jacket=ray(fabric,a,b,frame)[0];expect(jacket).toBeDefined();expect(leg.distance-jacket.distance).toBeGreaterThan(.002);pairs++;
    }
    expect(pairs).toBeGreaterThan(25);
    for(const x of [-.070,.070]) expect(ray(trousers,[x,-.78,.11],[x,-.78,-.11],frame).length).toBeGreaterThan(0);
    expect(ray(trousers,[0,-.78,.11],[0,-.78,-.11],frame)).toHaveLength(0);
  });

  it('takes a doubled strap, its keeper, the inside veneer and outside pull through the same hinge transform',()=>{
    const state=createVillaWardrobes(), leaf=bedroomRoot.getObjectByName('wardrobe/door-1')!, doors=parts(bedroomRoot,(_,o)=>o instanceof THREE.InstancedMesh);
    const complete=parts(bedroomRoot,(m,o)=>o instanceof THREE.InstancedMesh&&m.userData.fittedCloth);
    let start:THREE.Vector3|undefined;
    for(const progress of [0,.46,1]){
      state.wardrobes[W.id].progress=progress;bedroom.update(state);bedroomRoot.updateMatrixWorld(true);
      const f=leaf.matrixWorld,inv=f.clone().invert(),a:P=[-.103,-.063,-.07], b:P=[-.103,-.063,0];
      const sling=ray(doors,a,b,f)[0];expect(material(sling).userData.fittedCloth).toBe(true);
      const marker=sling.point.clone().applyMatrix4(inv);expect(marker.z).toBeLessThan(-.018);expect(marker.z).toBeGreaterThan(-.028);
      if(!start)start=sling.point;else if(progress===1)expect(start.distanceTo(sling.point)).toBeGreaterThan(.18);
      // A loop has *two* plies under its keeper and one below its short hem.
      expect(ray(complete,[-.103,.18,-.04],[-.103,.18,-.014],f).length).toBeGreaterThanOrEqual(2);
      expect(ray(complete,[-.103,.10,-.04],[-.103,.10,-.014],f)).toHaveLength(1);
      const veneer=(x:number,y:number,side:number)=>ray(doors,[x,y,side*.15],[x,y,0],f)[0];
      const back=veneer(.12,.31,-1), front=veneer(.12,.31,1);expect(material(back).userData.villaInteriorFinish).toBe('oak');
      expect(front.uv!.distanceTo(back.uv!)).toBeGreaterThan(.4);
      // Measure both faces in the dimensions of the real 1.80m by .18m swatch.
      for(const side of [-1,1]){const u=veneer(.12,.49,side).uv!,v=veneer(.138,.31,side).uv!, uv=veneer(.12,.31,side).uv!;
        expect(u.x-uv.x).toBeCloseTo(.1,4);expect(u.y-uv.y).toBeCloseTo(0,4);expect(Math.abs(v.y-uv.y)).toBeCloseTo(.1,4);}
    }
  });

  it('shows a real clear cut-crystal wall, partial fill with a horizontal level, and a separate seated stopper',()=>{
    const crystal=parts(bedroomRoot,m=>m.name==='Vanity/cut crystal');expect(crystal).toHaveLength(1);
    const m=crystal[0].material as THREE.MeshStandardMaterial;expect(m.transparent).toBe(true);expect(m.depthWrite).toBe(false);expect(m.flatShading).toBe(true);
    const x=V.x-V.width/2+.48-.18,z=V.z+.035,base=V.y+.834,attr=crystal[0].geometry.getAttribute('color');
    const alpha=(h:THREE.Intersection)=>attr.getW(h.face!.a);
    const outside=ray(crystal,[x,base+.13,z+.14],[x,base+.13,z-.14]);
    expect(outside).not.toHaveLength(0);expect(Math.max(...outside.map(alpha))).toBeLessThan(.4);
    const low=ray(crystal,[x,base+.07,z+.14],[x,base+.07,z-.14]);expect(low.some(h=>alpha(h)>.8)).toBe(true);
    for(const dx of [-.025,.017,.037]){const level=ray(crystal,[x+dx,base+.135,z+.008],[x+dx,base+.074,z+.008])[0];
      expect(alpha(level)).toBeGreaterThan(.8);expect(level.point.y-base).toBeCloseTo(.102,3);}
    const stopper=ray(crystal,[x,base+.31,z+.004],[x,base+.208,z+.004])[0];
    expect(stopper.point.y-base).toBeGreaterThan(.25);expect(alpha(stopper)).toBeCloseTo(.69,2);
  });

  it('leaves bored wastes under both baths and the shared sink; the curved contact line rises above the middle of the water',()=>{
    const bath=parts(bathRoot,m=>!m.transparent), suite=parts(suiteRoot,m=>!m.transparent);
    const down=(x:number,z:number,start:number,end:number,list:THREE.Mesh[])=>ray(list,[x,3.6+start,z],[x,3.6+end,z]);
    // Miss both arms of the cross-strainer and pass through two thicknesses of ceramic.
    expect(down(11.412,-5.098,.25,-.001,bath)).toHaveLength(0);expect(down(-11.539,-6.921,.215,.037,suite)).toHaveLength(0);
    expect(down(13.694,.380,1.01,.826,bath)).toHaveLength(0);
    const lip=down(11.442,-5.11,.25,.11,bath)[0];expect(material(lip).name).toBe('steel');
    const pool=parts(bathRoot,m=>m.transparent), center=down(11.4,-4.4,.5,.25,pool)[0],edge=down(12.281,-4.4,.50,.25,pool)[0];
    expect(center.point.y-3.6).toBeCloseTo(.3225,4);expect(edge.point.y-center.point.y).toBeGreaterThan(.0020);
    const bank=down(12.285,-4.4,.5,.25,bath)[0];expect(bank.point.y).toBeGreaterThan(edge.point.y);
  });

  it('forms room-facing vertical flutes on a thicker honest smooth-sided shower sheet, not a mirror material',()=>{
    const pane=parts(suiteRoot,m=>m.transparent&&m.roughness>.25), x=-5.45-.86, y=4.83;
    const front:number[]=[], back:number[]=[];
    for(let i=0;i<=24;i++){
      const z=-1.37+i*.004;
      const dry=ray(pane,[x-.06,y,z],[x+.06,y,z])[0],wet=ray(pane,[x+.06,y,z],[x-.06,y,z])[0];
      expect(material(dry).metalness).toBe(0);expect(material(dry).depthWrite).toBe(false);
      front.push(dry.point.x);back.push(wet.point.x);expect(wet.point.x-dry.point.x).toBeGreaterThan(.0139);
    }
    expect(Math.max(...front)-Math.min(...front)).toBeGreaterThan(.004);
    expect(Math.max(...back)-Math.min(...back)).toBeLessThan(.00001);
    const returns=parts(suiteRoot,m=>Boolean(m.userData.villaMirrorRoom));expect(returns).toHaveLength(2);
    for(const mirror of returns){const m=mirror.material as THREE.MeshStandardMaterial;expect(m.transparent).toBe(false);expect(m.roughness).toBeLessThan(.1);}
  });

  it('rests a full hanging towel on its rail, with a shorter return, an air gap and an integrated border',()=>{
    const textiles=parts(bathRoot,m=>['linen','sage'].includes(m.name)), chrome=parts(bathRoot,m=>m.name==='steel');
    const x=12.48-.22, y=3.6+1.39, z=-8.87+.104;
    const crown=ray(textiles,[x,y+.07,z],[x,y-.03,z])[0], bar=ray(chrome,[x,y+.07,z],[x,y-.03,z])[0];
    expect(crown.point.y-bar.point.y).toBeGreaterThan(.003);expect(crown.point.y-bar.point.y).toBeLessThan(.0055);
    for(const dy of [-.22,-.40]){
      const front=ray(textiles,[x,y+dy,z+.12],[x,y+dy,z-.12])[0],back=ray(textiles,[x,y+dy,z-.12],[x,y+dy,z+.12])[0];
      expect(front.point.z-back.point.z).toBeGreaterThan(.040);
      expect(ray(textiles,[x-.008,y+dy,z],[x+.008,y+dy,z])).toHaveLength(0);
    }
    // Read the woven bands on the *draped* fall, not a nominal unbent Y coordinate.
    let runs=0,active=false;const widths:number[]=[];
    for(let i=0;i<=40;i++){const h=y-.70-i*.003, cloth=ray(textiles,[x,h,z+.13],[x,h,z-.13])[0];expect(cloth).toBeDefined();
      if(material(cloth).name==='sage'){if(!active){widths.push(0);runs++;}widths[runs-1]+=.003;active=true;}else active=false;}
    expect(runs).toBe(2);expect(Math.max(...widths)).toBeGreaterThan(.022);expect(Math.min(...widths)).toBeLessThan(.016);
    expect(ray(textiles,[x,y-.73,z-.13],[x,y-.73,z])).toHaveLength(0);
  });

  it('keeps the face cradle open, supports the treatment cover and stores real cloth inside a slotted bin',()=>{
    const spa=parts(spaRoot), padding=parts(spaRoot,m=>m.name==='cream'),web=parts(spaRoot,m=>m.name==='sage');
    expect(ray(spa,[0,1.15,-1.209],[0,.68,-1.209])).toHaveLength(0);expect(ray(padding,[.121,1.15,-1.189],[.121,.7,-1.189]).length).toBeGreaterThan(0);
    for(const x of [-.22,.02,.22]){const pad=ray(padding,[x,1.15,.273],[x,.84,.273])[0],under=ray(web,[x,.84,.273],[x,.96,.273])[0];
      expect(under.point.y-pad.point.y).toBeGreaterThan(-.0005);expect(under.point.y-pad.point.y).toBeLessThan(.0025);}
    // Look through the left finger slot: it is not a dark mark on solid stock.
    expect(ray(spa,[1.28,1.196,.011],[1.35,1.196,.011])).toHaveLength(0);
    expect(ray(spa,[1.28,1.196,.09],[1.35,1.196,.09]).length).toBeGreaterThan(0);
    const bin=ray(spa,[1.65,1.31,.031],[1.65,1.02,.031])[0];expect(material(bin).name).toBe('linen');
    const lid=ray(spa,[-1.858,.85,-.069],[-1.858,.7,-.069])[0];expect(material(lid).name).toBe('dark');
  });

  it('fits within the measured b80e specialist budgets without borrowing draws from the static furniture',()=>{
    const wardrobe=measurements(bedroomRoot.getObjectByName('Bedroom/openable-wardrobe')!);
    const b=measurements(bedroomRoot),s=measurements(suiteRoot),d=measurements(doorsRoot);
    for(const [actual,t,v,n] of [[wardrobe,58560,43398,12],[b,70154,55382,24],[s,82176,82719,12],[d,18408,34944,21]] as const){
      expect(actual.triangles).toBeLessThanOrEqual(t);expect(actual.vertices).toBeLessThanOrEqual(v);expect(actual.draws).toBeLessThanOrEqual(n);
    }
    // Baseline includes the three wetroom kit functions but not the service-table props.
    // The new bodies, returns, fabrics and all the contents they carry fit even that allowance.
    expect(b.triangles+s.triangles+d.triangles+measurements(bathRoot).triangles+measurements(spaRoot).triangles).toBeLessThanOrEqual(70154+82176+18408+14146);
  });
});
