import * as THREE from 'three';
import { afterAll, describe, expect, it } from 'vitest';
import { addVillaIslandTree } from '../src/villaEstateCraft.js';
import { topiary } from '../src/villaFurnitureAccents.js';
import { planter } from '../src/villaFurniturePlanting.js';
import type { FurnitureKit } from '../src/villaFurnitureForms.js';
import { VillaModelBuilder } from '../src/villaModel.js';
import { plantRay, plantTexel } from './villaHedgeProbes.js';

const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
function material(color: number) { const m=new THREE.MeshStandardMaterial({color}); resources.add(m); return m; }
const paint = { leaf:material(0x41684b),leafLight:material(0x7d9854),walnut:material(0x73503b),terra:material(0xbb7358),soil:material(0x453528),coral:material(0xe1aa83),cream:material(0xede6d4) };
paint.leaf.side=paint.leafLight.side=THREE.DoubleSide;
function parcel(build: (kit: FurnitureKit, b: VillaModelBuilder)=>void) {
  const root=new THREE.Group(), b=new VillaModelBuilder(root,'section');
  const k={ m:paint, at:b.at.bind(b), put:(g,m,x,y,z,rx=0,ry=0,rz=0)=>b.geometry(g,m,[x,y,z],[rx,ry,rz]) } as FurnitureKit;
  build(k,b); b.finish(); root.updateMatrixWorld(true);
  const parts: THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>[]=[];
  root.traverse(o=>{ if (o instanceof THREE.Mesh) { parts.push(o); resources.add(o.geometry); if(o.material.map) resources.add(o.material.map); } });
  return parts;
}
afterAll(()=>{for(const r of resources)r.dispose();});
const hedge=(v: number)=>parcel(k=>topiary(k,v<14?.5:.72,1.12,v,v%3?paint.leaf:paint.leafLight));
const tris=(mesh: THREE.Mesh)=>(mesh.geometry.index?.count??mesh.geometry.getAttribute('position').count)/3;

interface Corner { p: THREE.Vector3; uv: THREE.Vector2 }
/** Recover blades/ranks from the FINAL batched triangles, after unindexing.
 * Separate adjacent ranks by their texture chart at their common twig edge. */
function components(g: THREE.BufferGeometry, charted: boolean): Corner[][] {
  const p=g.getAttribute('position'), uv=g.getAttribute('uv'), id=new Map<string,number>(), corners:Corner[]=[], parents:number[]=[];
  const root=(n:number):number=>parents[n]===n?n:(parents[n]=root(parents[n]));
  const corner=(i:number)=>{
    const key=[p.getX(i),p.getY(i),p.getZ(i),uv.getX(i),uv.getY(i)].join('/'); let n=id.get(key);
    if (n===undefined) { n=parents.length; id.set(key,n); parents.push(n);corners.push({p:new THREE.Vector3().fromBufferAttribute(p,i),uv:new THREE.Vector2().fromBufferAttribute(uv,i)}); }
    return n;
  };
  for(let i=0;i<(g.index?.count??p.count);i+=3){
    const a=g.index?.getX(i)??i; if((uv.getX(a)>2)!==charted)continue;
    const n=corner(a),m=corner(g.index?.getX(i+1)??i+1),l=corner(g.index?.getX(i+2)??i+2);
    parents[root(m)]=root(n);parents[root(l)]=root(n);
  }
  const groups=new Map<number,Corner[]>(); corners.forEach((v,i)=>{const n=root(i),part=groups.get(n)??[];part.push(v);groups.set(n,part);});return [...groups.values()];
}
const box=(part: Corner[])=>new THREE.Box3().setFromPoints(part.map(v=>v.p));
function surface(mesh: THREE.Mesh) {
  const g=mesh.geometry, p=g.getAttribute('position'), out: THREE.Triangle[]=[];
  for(let i=0;i<(g.index?.count??p.count);i+=3){ const read=(j:number)=>new THREE.Vector3().fromBufferAttribute(p,g.index?.getX(i+j)??i+j);out.push(new THREE.Triangle(read(0),read(1),read(2))); }
  return out;
}
const distanceTo=(p: THREE.Vector3, faces: THREE.Triangle[])=>{
  let d=Infinity;const q=new THREE.Vector3(); for(const face of faces)d=Math.min(d,p.distanceToSquared(face.closestPointToPoint(p,q)));return Math.sqrt(d);
};
function rankFacts(mesh: THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>, wood: THREE.Mesh) {
  const spans=components(mesh.geometry,true), map=mesh.material.map as THREE.DataTexture, supports=surface(wood);
  const axes=new Map<string,THREE.Vector3[]>(), ends:THREE.Vector3[]=[], lengths:number[]=[]; let leaves=0,attachment=0,minAxis=1;
  for(const part of spans) {
    const chart=new THREE.Box2().setFromPoints(part.map(p=>p.uv)), corner=(u:number,v:number)=>part.find(k=>k.uv.x===u&&k.uv.y===v)!.p;
    const base=corner(chart.min.x,chart.min.y), end=corner(chart.min.x,chart.max.y);
    const out=corner(chart.max.x,chart.min.y).clone().sub(base).normalize(), key=base.toArray().join('/');
    if(!axes.has(key)) { axes.set(key,[]);ends.push(end);attachment=Math.max(attachment,distanceTo(base,supports)); }
    axes.get(key)!.push(out);
    for (let j=0;j<=16;j++) minAxis=Math.min(minAxis,plantTexel(map,new THREE.Vector2(chart.min.x,chart.min.y+j*(chart.max.y-chart.min.y)/16),3)/255);
    // A transect partway along a blade must repeatedly enter and exit leaves.
    // The physical run width comes from the actual length of the bent shoot.
    const u=chart.min.x+.46*(chart.max.x-chart.min.x); let run=0;
    for(let j=0;j<=128;j++){
      const v=chart.min.y+(j+.5)/128*(chart.max.y-chart.min.y);
      const hit=j<128&&plantTexel(map,new THREE.Vector2(u,v),3)>=255*mesh.material.alphaTest;
      if(hit)run++;else if(run){leaves++;lengths.push(base.distanceTo(end)*run/128);run=0;}
    }
  }
  return { axes, ends, leaves, attachment, lengths, minAxis };
}
function apertures(parts: THREE.Mesh[], height: number, radius: number, zWidth: number, level=0) {
  const result:number[]=[];
  for(let axis=0;axis<2;axis++) {
    let air=0;
    for(let i=0;i<18;i++)for(let j=0;j<14;j++) {
      const u=((i+.38)/18*2-1)*(axis?radius:zWidth), y=(.24+(j+.41)/14*.62)*height;
      if(!plantRay(parts,axis?[u,y,-2]:[-2,y,u],axis?[0,0,1]:[1,0,0],4,level))air++;
    }
    result.push(air/(18*14));
  }
  return result;
}

describe('pruned estate foliage under transmitted light',()=>{
  it('carries small opposite blades in decussate ranks socketed to real wood, not a solid body under decals',()=>{
    const parts=hedge(0), woody=parts.find(p=>p.material===paint.walnut)!, leafy=parts.find(p=>p.material===paint.leafLight)!;
    const facts=rankFacts(leafy,woody), plain=components(parts.find(p=>p.material===paint.leaf)!.geometry,false);
    expect(facts.leaves).toBeGreaterThan(1000);expect(facts.attachment).toBeLessThan(.029);
    expect([...facts.axes.values()].filter(v=>v.length>=4&&v.some(d=>Math.abs(v[0].dot(d))<.5)).length).toBeGreaterThan(50);
    expect(facts.lengths.filter(w=>w>.010&&w<.078).length/facts.lengths.length).toBeGreaterThan(.88);
    expect(plain.length).toBeGreaterThan(8);expect(Math.max(...plain.map(p=>box(p).getSize(new THREE.Vector3()).length()))).toBeLessThan(.14);
    expect(facts.minAxis).toBeGreaterThan(.95);
    for(const blade of plain)expect(Math.min(...blade.flatMap(v=>facts.ends.map(end=>v.p.distanceTo(end))))).toBeLessThan(.0001);
    expect(parts.reduce((s,m)=>s+tris(m),0)).toBeLessThan(900);
    if(process.env.VILLA_PRUNING_PROFILE) console.info('Privet geometry:',{shoots:facts.axes.size,rankLeaves:facts.leaves,reliefTips:plain.length,attachment:facts.attachment,triangles:parts.reduce((s,m)=>s+tris(m),0)});
  });
  it('shows both daylight and leaf masses through wide and end views, including a minified software-size leaf rank',()=>{
    const fractions:number[]=[];
    for(const v of [0,4,16,19]) {
      const parts=hedge(v), w=v<14?.5:.72;
      const bounds=new THREE.Box3();for(const part of parts)bounds.expandByObject(part);
      expect(bounds.max.x).toBeLessThan(w);expect(bounds.min.x).toBeGreaterThan(-w);expect(Math.max(bounds.max.z,-bounds.min.z)).toBeLessThan(.82);
      const fresh=apertures(parts,1.12,w*.85,.69), distant=apertures(parts,1.12,w*.85,.69,2);fractions.push(...fresh,...distant);
      for(let i=0;i<2;i++)expect(Math.abs(fresh[i]-distant[i])).toBeLessThan(.15);
    }
    expect(Math.min(...fractions)).toBeGreaterThan(.04);expect(Math.max(...fractions)).toBeLessThan(.82);
    if(process.env.VILLA_PRUNING_PROFILE) console.info('Privet visible air fractions, broad/end at mips 0 and 2:',fractions);
  });
  it('preserves the ordinary indoor leaf finish, including the most reduced mip and every clamp-edge texel',()=>{
    hedge(1); const tex=paint.leafLight.map as THREE.DataTexture;
    expect(tex.image.width).toBeLessThanOrEqual(256); expect(paint.leaf.map).toBeNull();expect(paint.leafLight.depthWrite).toBe(true);expect(paint.leafLight.transparent).toBe(false);
    expect(tex.mipmaps!.at(-1)!.width).toBe(1);
    for(let level=0;level<tex.mipmaps!.length;level++) {
      const mip=tex.mipmaps![level];
      for(let y=0;y<mip.height;y++)for(let c=0;c<4;c++)expect(plantTexel(tex,new THREE.Vector2((y+.5)/mip.height,(y+.5)/mip.height),c,level)).toBe(255);
    }
    expect(tex.mipmaps!.reduce((n,m)=>n+(m.data as Uint8Array).byteLength,0)).toBeLessThanOrEqual(350000);
  });
  it('gives the three drive trees distinct trained profiles, open flutes and dense staggered leaf ranks without an extra finish',()=>{
    const bark=material(0x7c634a),green=material(0x526d49),profiles:number[]=[];
    for(const [x,z,h] of [[1,39,3.8],[6,40,4.2],[10,38,3.4]]){
      const parts=parcel((_k,b)=>addVillaIslandTree(b,x,0,z,h,bark,green));expect(parts.length).toBe(2);
      const wood=parts.find(p=>p.material===bark)!,canopy=parts.find(p=>p.material===green)!, facts=rankFacts(canopy,wood);
      expect(facts.leaves).toBeGreaterThan(1200);expect(facts.attachment).toBeLessThan(.085);expect(facts.axes.size).toBeGreaterThan(140);
      expect(parts.reduce((s,m)=>s+tris(m),0)).toBeLessThanOrEqual(3612);
      const bounds=new THREE.Box3().setFromObject(canopy);expect(bounds.max.y).toBeCloseTo(h,4);expect(bounds.min.y).toBeGreaterThan(.28*h);expect(bounds.min.y).toBeLessThan(.55*h);
      const sections=Array.from({length:24},(_,i)=>{
        const a=2*Math.PI*i/24, c=Math.cos(a), s=Math.sin(a);
        const hit=plantRay([wood],[x+c,.14*h,z+s],[-c,0,-s],1.2)!;
        return Math.hypot(hit.point.x-x,hit.point.z-z);
      });
      expect(Math.max(...sections)-Math.min(...sections)).toBeGreaterThan(.043);
      profiles.push((bounds.max.x-x+x-bounds.min.x)/(bounds.max.z-bounds.min.z));
      if(process.env.VILLA_PRUNING_PROFILE) console.info('Hornbeam geometry:',{height:h,shoots:facts.axes.size,rankLeaves:facts.leaves,attachment:facts.attachment,triangles:parts.reduce((s,m)=>s+tris(m),0)});
    }
    expect(Math.max(...profiles)-Math.min(...profiles)).toBeGreaterThan(.10);
  });
  it('supports separate potted umbels and cupped geranium leaves, with trailing sockets over the low bowl',()=>{
    for(const s of [1.25,.65]){
      const parts=parcel(k=>planter(k,s,true,()=>.42,true));const green=parts.find(p=>p.material===paint.leafLight)!,stems=surface(parts.find(p=>p.material===paint.leaf)!);
      const blades=components(green.geometry,true);expect(blades.length).toBeGreaterThanOrEqual(12);
      let maxReach=0;
      for(const part of blades){
        const b=box(part);maxReach=Math.max(maxReach,...part.map(p=>Math.hypot(p.p.x,p.p.z)/s));
        expect(b.getSize(new THREE.Vector3()).y/s).toBeGreaterThan(.019);
        const d=Math.min(...part.map(p=>distanceTo(p.p,stems)));expect(d/s).toBeLessThan(.006);
      }
      expect(maxReach).toBeGreaterThan(.28);expect(maxReach).toBeLessThan(.49);
      const blooms=[paint.coral,paint.cream].flatMap(m=>components(parts.find(o=>o.material===m)!.geometry,false));
      expect(blooms.length).toBeGreaterThanOrEqual(6);
      expect(Math.max(...blooms.map(f=>box(f).max.y))/s).toBeGreaterThan(s>1?.84:.55);
      expect(Math.max(...blooms.map(f=>Math.min(...f.map(v=>distanceTo(v.p,stems)))))/s).toBeLessThan(.01);
    }
  });
});
