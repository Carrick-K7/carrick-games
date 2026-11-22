import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { furnishVilla } from '../src/villaFurnishings.js';
import { HOUSE_PRINT, HOUSE_TITLES, spineTile, type PrintTile } from '../src/villaDomesticArt.js';
import { VILLA_AQUARIUM } from '../src/villaLivingLayout.js';

type Point = [number, number, number];
const scene = new THREE.Scene(), meshes: THREE.Mesh[] = [], captions = new Set<string>();
let furniture: ReturnType<typeof furnishVilla>, prints: THREE.Mesh;
beforeAll(() => {
  // Observe the printable words without pretending that a Node shim is a GPU.
  const ctx = new Proxy({}, { get: (_,key) => key === 'fillText' ? (s:string)=>{captions.add(s);} : ()=>{}, set: ()=>true });
  vi.stubGlobal('document', {createElement:()=>({ getContext:()=>ctx })});
  try { furniture=furnishVilla(scene); } finally {vi.unstubAllGlobals();}
  scene.updateMatrixWorld(true);
  scene.traverse(o=>{if(o instanceof THREE.Mesh && o.name==='Batched villa details')meshes.push(o);});
  prints=meshes.find(m=>(m.material as THREE.MeshStandardMaterial).map?.name==='house-impressions / library press')!;
});
afterAll(()=>{
  const maps=new Set<THREE.Texture>(),mats=new Set<THREE.Material>();scene.traverse(o=>{if(o instanceof THREE.Mesh){
    o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])mats.add(m);
  }});
  mats.forEach(m=>{for(const v of Object.values(m))if(v instanceof THREE.Texture)maps.add(v);m.dispose();});maps.forEach(t=>t.dispose());scene.clear();
});
function ray(p:Point,dir:Point,far:number,objects:THREE.Mesh[]=meshes){
  return new THREE.Raycaster(new THREE.Vector3(...p),new THREE.Vector3(...dir).normalize(),0,far).intersectObjects(objects,false)[0];
}
const inTile=(uv:THREE.Vector2, [x,y,w,h]:PrintTile)=>uv.x*1024>x&&uv.x*1024<x+w&&(1-uv.y)*1024>y&&(1-uv.y)*1024<y+h;
const down=(x:number,y:number,z:number,far:number,objects:THREE.Mesh[]=meshes)=>ray([x,y,z],[0,-1,0],far,objects);
// Signature measured on the unchanged 1.12.0 roof models before the remodel.
// Quantise to 0.1 mm; preserve winding and material charts, ignore batch order.
function imprint(x: number, y: number, z: number, w: number, h: number, d: number) {
  const faces: string[] = [];
  for (const mesh of meshes) {
    const g = mesh.geometry, p = g.getAttribute('position'), n = g.getAttribute('normal'), u = g.getAttribute('uv');
    for (let i = 0; i < p.count; i += 3) {
      if (Math.abs(p.getX(i)-x)>w/2 || Math.abs(p.getY(i)-y)>h/2 || Math.abs(p.getZ(i)-z)>d/2) continue;
      const face: number[] = [];
      for (let j=i;j<i+3;j++) face.push(p.getX(j),p.getY(j),p.getZ(j),n.getX(j),n.getY(j),n.getZ(j),u.getX(j),u.getY(j));
      faces.push(face.map(v=>Math.round(v*1e4)).join(','));
    }
  }
  return [faces.length,createHash('sha256').update(faces.sort().join(';')).digest('hex')];
}

describe('domestic cabinetmaking in the furnished house',()=>{
  it('preserves the roof dining chair and its old low-table/flower arrangement',()=>{
    expect(imprint(-6,7.8,-3.2,.68,1.20,.70)).toEqual([1032,'699e72232803b250636f2c2d6b81953234b44c8bff6a3e0c4ca66229d5d5c9c4']);
    expect(imprint(-7,7.79,3.4,1.9,1.19,1.09)).toEqual([2707,'dff5d6befc0fa110d3b94eedfd88427e589f52323730842874c5e4ab68852b55']);
  });
  it('binds different printed editions to the actual shelf spines and leaves the north window uncovered',()=>{
    expect(prints).toBeDefined();expect(new Set(HOUSE_TITLES).size).toBe(HOUSE_TITLES.length);
    for(const title of HOUSE_TITLES)expect(captions.has(title)).toBe(true);
    const g=prints.geometry,p=g.getAttribute('position'),uv=g.getAttribute('uv'),normal=g.getAttribute('normal'),seen=new Set<number>();
    const tiles=HOUSE_TITLES.map((_,i)=>spineTile(i));
    for(let i=0;i<p.count;i+=3){
      if(p.getZ(i)>-17 || p.getZ(i)<-17.53 || p.getY(i)<4.19 || p.getY(i)>5.88 || p.getX(i)<8.16 || p.getX(i)>16.88 || normal.getZ(i)<.7)continue;
      const u=new THREE.Vector2((uv.getX(i)+uv.getX(i+1)+uv.getX(i+2))/3,(uv.getY(i)+uv.getY(i+1)+uv.getY(i+2))/3);
      const edition=tiles.findIndex(tile=>inTile(u,tile)); if(edition>=0)seen.add(edition);
    }
    expect(seen.size).toBeGreaterThan(14);
    for(const x of [10.05,10.48,14.9,15.45])expect(ray([x,5.12,-16.73],[0,0,-1],1.27)).toBeUndefined();
  });
  it('gives the study desk a real side drawer and keeps the central knee space free',()=>{
    const y=3.6+.504;
    for(const dx of [-.35,0,.34])expect(ray([12.5+dx,y,-16.07],[0,0,-1],.83)).toBeUndefined();
    expect(ray([11.616,y,-16.07],[0,0,-1],.65)?.point.z).toBeGreaterThan(-16.37);
    const mat=down(12.06,4.64,-16.53,.5)!,desk=down(13.08,4.64,-16.48,.5)!;
    expect(mat.point.y).toBeCloseTo(4.357,4);expect(desk.point.y).toBeCloseTo(4.35,4);
    const x=12.505,z=-16.572,ink=down(x,4.65,z,.42,[prints]);
    expect(ink).toBeDefined();expect(inTile(ink.uv!,HOUSE_PRINT.notes)).toBe(true);
    const walnut=meshes.filter(m=>(m.material as THREE.Material).userData.villaMillStock==='walnut');
    const cover=down(x,4.376,z,.035,walnut)!;
    const pages=meshes.filter(m=>(m.material as THREE.MeshStandardMaterial).color.getHex()===0xede6d4);
    const inner=ray([x,4.36,z],[0,1,0],.030,pages)!;
    expect(cover.point.y).toBeCloseTo(4.366,4);expect(inner.point.y-cover.point.y).toBeGreaterThanOrEqual(-.0005);expect(inner.point.y-cover.point.y).toBeLessThan(.0012);
  });
  it('mortises door rails around a set-back field and hangs the leaf beside a distinct jamb',()=>{
    // Centre aquarium door, approached from +Z. Probe the field, top rail,
    // hinge knuckle, pin leaf and fixed jamb in the finished assembly.
    const w=3.40,span=w-.097, pitch=span/3,leaf=pitch-.038,x=VILLA_AQUARIUM.x,z=VILLA_AQUARIUM.z+.65;
    const bottom=.130,h=.65-.106-.078, fieldY=bottom+h*.5;
    const front=(u:number,y:number)=>ray([x+u,y,z],[0,0,-1],1.36)!.point.z;
    expect(front(0,bottom+h-.024)-front(0,fieldY)).toBeCloseTo(.015,3);
    const hingeX=leaf*.5+.0015,hy=bottom+h*.82;
    expect(front(hingeX,hy)-front(hingeX+.012,hy-.052)).toBeGreaterThan(.008);
    expect(front(hingeX-.015,hy)-front(hingeX-.015,hy-.047)).toBeGreaterThan(.001);
    expect(front(hingeX+.008,hy)-front(hingeX+.008,hy-.047)).toBeGreaterThan(.001);
    // Between the leaf and jamb, the ray enters the carcase rather than
    // striking decorative paint. At the knuckle that same ray meets metal.
    expect(front(hingeX,hy)-front(hingeX,fieldY)).toBeGreaterThan(.034);
  });
  it('really cuts rear mortar joints, beds a layer of ash under the grate, and keeps cold wood when switched off',()=>{
    const seamX=-10.924+.318*3, shoot=(x:number,y:number)=>ray([x,y,.09],[0,0,-1],.58)!;
    const seam=shoot(seamX,.606),brick=shoot(seamX+.06,.606),bond=shoot(seamX,.766);
    expect(brick.point.z-seam.point.z).toBeGreaterThan(.037);expect(bond.point.z-seam.point.z).toBeGreaterThan(.037);
    expect(inTile(brick.uv!,HOUSE_PRINT.brick)).toBe(true);
    const ash=down(-10.23,.307,.342,.1,[prints])!;expect(inTile(ash.uv!,HOUSE_PRINT.ash)).toBe(true);
    const fuel=down(-10.18,.615,.326,.31,[prints])!;expect(inTile(fuel.uv!,HOUSE_PRINT.char)).toBe(true);expect(fuel.point.y-ash.point.y).toBeGreaterThan(.18);
    const fire:THREE.Mesh[]=[];scene.traverse(o=>{if(o instanceof THREE.Mesh && o.material instanceof THREE.MeshBasicMaterial && o.material.blending===THREE.AdditiveBlending && Math.abs(o.position.x+10)<.8)fire.push(o);});
    expect(fire.length).toBeGreaterThan(2);expect(fire.every(f=>f.geometry.hasAttribute('color'))).toBe(true);
    const state={evening:false,fireplace:false,gaming:false,fedUntil:0};furniture.update(2,state);
    try{expect(fire.every(f=>!f.visible)).toBe(true);expect(down(-10.18,.615,.326,.31,[prints])!.point.y).toBeCloseTo(fuel.point.y,5);}
    finally{furniture.update(0,{...state,fireplace:true});}
  });
  it('places distinct garden prints in the three actual frames and seats the indoor fig below a returning pot lip',()=>{
    for(const [p,d,tile] of [ [[-10,2.24,.54],[0,0,-1],HOUSE_PRINT.water], [[-4.60,5.65,5.1],[1,0,0],HOUSE_PRINT.herbarium], [[-10.5,5.65,-9.59],[0,0,1],HOUSE_PRINT.glasshouse] ] as [Point,Point,PrintTile][]){
      const paper=ray(p,d,.7,[prints]); expect(paper).toBeDefined();expect(inTile(paper.uv!,tile)).toBe(true);
    }
    const x=-14.2,y=3.6,z=7,s=1.30;
    const clay=meshes.filter(m=>(m.material as THREE.MeshStandardMaterial).color.getHex()===0xede6d4);
    const earth=down(x+.152*s,y+.39*s,z,.15*s,[prints])!,lip=down(x+.228*s,y+.65*s,z,.50*s,clay)!;
    expect(inTile(earth.uv!,HOUSE_PRINT.loam)).toBe(true);
    expect((lip.point.y-earth.point.y)/s).toBeGreaterThan(.032);expect((lip.point.y-earth.point.y)/s).toBeLessThan(.062);
    // Follow an actual front-face normal through a leaf in the foreground
    // specimen. The reverse ray must meet a different underside venation chart
    // within 1.5mm of the top, not the back of a thick polygon or blank card.
    const p=prints.geometry.getAttribute('position'),u=prints.geometry.getAttribute('uv');let leaves=0;
    for(let i=0;i<p.count;i+=3){
      const v=new THREE.Vector2(u.getX(i),u.getY(i));
      if(!inTile(v,HOUSE_PRINT.figUpper)||Math.abs(p.getX(i)-x)>.58*s||Math.abs(p.getZ(i)-z)>.58*s||p.getY(i)<y+.4*s||p.getY(i)>y+1.45*s)continue;
      const a=new THREE.Vector3().fromBufferAttribute(p,i),b=new THREE.Vector3().fromBufferAttribute(p,i+1),c=new THREE.Vector3().fromBufferAttribute(p,i+2);
      const normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize(),centre=a.add(b).add(c).multiplyScalar(1/3);
      const under=ray(centre.clone().addScaledVector(normal,-.005*s).toArray() as Point,normal.toArray() as Point,.006*s,[prints]);
      if(under&&inTile(under.uv!,HOUSE_PRINT.figLower)&&under.point.distanceTo(centre)<.0015*s&&normal.dot(under.face!.normal)<-.85)leaves++;
      if(leaves>=8)break;
    }
    expect(leaves).toBeGreaterThanOrEqual(8);
  });
});
