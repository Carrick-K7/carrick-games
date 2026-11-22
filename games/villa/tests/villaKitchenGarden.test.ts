import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createVillaGarden, VILLA_ROOF_PLANTERS, VILLA_VEGETABLE_BEDS } from '../src/villaGarden.js';
import { leafUV, LEAF } from '../src/villaHorticultureAtlas.js';
import { pieces } from './villaOrchardSampling.js';

const root = new THREE.Group(), materials = new Set<THREE.MeshStandardMaterial>(), meshes: THREE.Mesh[] = [];
beforeAll(() => {
  createVillaGarden(root); root.updateMatrixWorld(true);
  root.traverse(m => { if (m instanceof THREE.Mesh) { meshes.push(m); materials.add(m.material as THREE.MeshStandardMaterial); } });
});
afterAll(() => {
  const maps = new Set<THREE.Texture>(); for (const m of materials) { if (m.map) maps.add(m.map); m.dispose(); }
  for (const m of meshes) m.geometry.dispose(); for (const t of maps) t.dispose(); root.clear();
});
const finish = (name: string) => meshes.find(m => (m.material as THREE.MeshStandardMaterial).name === name)!;
const stock = () => finish('garden/boards-compost-and-terracotta'), soft = () => finish('garden/soft-leaves'), skins = () => finish('garden/fruit-skins');
const stems = () => meshes.find(m => (m.material as THREE.MeshStandardMaterial).color.getHex() === 0x486644)!;
type Bed = typeof VILLA_VEGETABLE_BEDS[number];
const bedOf = (species: Bed['species']) => VILLA_VEGETABLE_BEDS.find(b => b.species === species)!;
const bounds = (b: Bed) => new THREE.Box3(new THREE.Vector3(b.x - b.w/2 - .24, .01, b.z - b.d/2 - .2), new THREE.Vector3(b.x + b.w/2 + .24, 1.7, b.z + b.d/2 + .2));
const ray = (m: THREE.Mesh, p: THREE.Vector3, d = new THREE.Vector3(0,-1,0), far = 3) => new THREE.Raycaster(p,d,0,far).intersectObject(m,false)[0];
const key = (v: THREE.Vector3) => `${v.x}/${v.y}/${v.z}`;
function attributes(m: THREE.Mesh, box: THREE.Box3) {
  const g = m.geometry, p = g.getAttribute('position'), uv = g.getAttribute('uv'), c = g.getAttribute('color');
  const data = new Map<string, {p:THREE.Vector3; u:number; v:number; r:number; g:number; b:number}>();
  const pos = new THREE.Vector3();
  for(let i=0;i<p.count;i++) {
    pos.fromBufferAttribute(p,i); if(!box.containsPoint(pos))continue;
    data.set(key(pos),{ p:pos.clone(), u:uv.getX(i), v:uv.getY(i), r:c.getX(i), g:c.getY(i), b:c.getZ(i) });
  }
  return data;
}
function tissueArea(m: THREE.Mesh, box: THREE.Box3) {
  const g=m.geometry, p=g.getAttribute('position'), index=g.index, tri=new THREE.Triangle(); let total=0;
  for (let i=0; i<(index?.count ?? p.count); i+=3) {
    tri.a.fromBufferAttribute(p,index ? index.getX(i):i); if (!box.containsPoint(tri.a)) continue;
    tri.b.fromBufferAttribute(p,index ? index.getX(i+1):i+1); tri.c.fromBufferAttribute(p,index ? index.getX(i+2):i+2); total+=tri.getArea();
  }
  return total;
}

describe('close-range kitchen garden surfaces', () => {
  it('lays broad wrapper hems over ten rooted heads, with a second whorl bending back over each heart', () => {
    const mesh=soft(), bed=bedOf('lettuce'), zone=bounds(bed), parts=pieces(mesh,zone), corners=attributes(mesh,zone);
    const heads: THREE.Vector3[]=[]; let wrappers=0, returned=0;
    for(const leaf of parts) {
      const tissue=leaf.points.map(p=>corners.get(key(p))!), foot=tissue.reduce((a,b)=>a.v<b.v?a:b), tile=Math.floor(foot.u*4);
      const dirt=ray(stock(),new THREE.Vector3(foot.p.x,1,foot.p.z))!.point.y;
      expect(Math.abs(foot.p.y-dirt)).toBeLessThan(.031);
      if(!heads.some(h=>h.distanceTo(foot.p)<.058)) heads.push(foot.p);
      // Chart V 0..1/2 is base→hem. A pointed wedge has no broad pair of
      // edge vertices still present in the distal fifth of its chart.
      const hem=tissue.filter(s=>s.v>.378), width=new THREE.Box3().setFromPoints(hem.map(s=>s.p)).getSize(new THREE.Vector3());
      if(tile===LEAF.wrapper || tile===LEAF.spent) { wrappers++; expect(Math.hypot(width.x,width.z)).toBeGreaterThan(.134); }
      if(tile===LEAF.heart) {
        const radius=(p:THREE.Vector3)=>Math.hypot(p.x-foot.p.x,p.z-foot.p.z);
        const apex=tissue.filter(s=>s.v>.46), mid=tissue.filter(s=>s.v>.23 && s.v<.30);
        if(Math.max(...mid.map(s=>radius(s.p))) > Math.min(...apex.map(s=>radius(s.p)))+.020) returned++;
      }
    }
    expect(heads).toHaveLength(10); expect(wrappers).toBeGreaterThanOrEqual(50); expect(returned).toBeGreaterThanOrEqual(25);
    expect(tissueArea(mesh,zone)).toBeGreaterThan(3); // measured one-sided area in square metres, not a marker leaf count
  });
  it('carries different ripening stages of tomatoes on axillary trusses and slender aubergines under the actual foliage', () => {
    for (const species of ['tomato','eggplant'] as const) {
      const zone=bounds(bedOf(species)), fruit=pieces(skins(),zone), flesh=attributes(skins(),zone), axes=[...attributes(stems(),zone).values()].map(s=>s.p);
      let green=0,red=0; const widths=new Set<number>(), heights=new Set<number>();
      expect(tissueArea(soft(),zone)).toBeGreaterThan(species==='tomato'?3.0:2.6);
      expect(fruit.length).toBeGreaterThanOrEqual(species==='tomato'?55:15);
      for(const f of fruit) {
        expect(f.manifold).toBe(true);
        const span=f.box.getSize(new THREE.Vector3()), width=Math.max(span.x,span.z), mid=f.box.getCenter(new THREE.Vector3());
        widths.add(Math.round(width/.004)); heights.add(Math.round(mid.y/.04));
        if(species==='tomato') { expect(width).toBeGreaterThan(.032); expect(width).toBeLessThan(.083); expect(span.y).toBeLessThan(width*1.13); }
        else { expect(span.y).toBeGreaterThan(.090); expect(span.y).toBeLessThan(.183); expect(span.y/width).toBeGreaterThan(1.38); }
        const c=flesh.get(key(f.points[0]))!; if(c.r>c.g*1.75)red++; if(c.g>c.r*.99)green++;
        const cap=f.points.filter(p=>p.y>f.box.max.y-.008);
        expect(cap.some(p=>axes.some(s=>Math.abs(s.x-p.x)<.009 && s.distanceToSquared(p)<.009**2)),`${species} cap to pedicel`).toBe(true);
      }
      expect(widths.size).toBeGreaterThan(4); expect(heights.size).toBeGreaterThan(5);
      if(species==='tomato') { expect(green).toBeGreaterThan(10); expect(red).toBeGreaterThan(20); }
    }
  });
  it('shows little more than the carrots’ shoulders and fine divided blades above the same ridges their roots enter', () => {
    const zone=bounds(bedOf('carrot')), roots=pieces(skins(),zone), greenery=pieces(stems(),zone);
    expect(roots).toHaveLength(10);
    for(const root of roots) {
      const p=root.box.getCenter(new THREE.Vector3()), dirt=ray(stock(),new THREE.Vector3(p.x,1,p.z))!.point.y;
      expect(root.box.max.y-dirt).toBeGreaterThan(.0003); expect(root.box.max.y-dirt).toBeLessThan(.019);
      expect(root.box.min.y).toBeLessThan(dirt-.10);
    }
    const lace=greenery.filter(g=>g.points.length===3 && g.box.getSize(new THREE.Vector3()).length()<.065);
    expect(lace.length).toBeGreaterThan(1000); // physically divided tertiary pinnae, not ten orange-rooted grass tufts
    const extent=new THREE.Box3(); for(const g of greenery)extent.union(g.box); expect(extent.max.y).toBeGreaterThan(.48);
  });
  it('maps branching veins and spent margins on the blade itself, not monochrome grain projected across an entire head', () => {
    const mat=soft().material as THREE.MeshStandardMaterial, map=mat.map as THREE.DataTexture;
    expect(map.name).toBe('kitchen-garden/leaf-lamina');expect(map.image.width).toBe(256);expect(map.image.height).toBe(256);
    expect(map.generateMipmaps && mat.vertexColors).toBe(true);expect(map.colorSpace).toBe(THREE.SRGBColorSpace);expect(mat.side).toBe(THREE.DoubleSide);
    const sample=(kind:number,s:number,t:number) => {const [u,v]=leafUV(kind,s,t),i=4*(Math.floor(v*256)*256+Math.floor(u*256));return Array.from(map.image.data.slice(i,i+3));};
    const mean=(ns:number[])=>ns.reduce((a,b)=>a+b,0)/ns.length;
    const ts=Array.from({length:25},(_,k)=>.2+k*.022);
    expect(mean(ts.map(t=>sample(LEAF.wrapper,0,t)[1]-sample(LEAF.wrapper,.5,t)[1]))).toBeGreaterThan(18);
    const chlorophyll=(kind:number,s:number)=>mean(ts.map(t=>{const [r,g]=sample(kind,s,t+.18);return g-r;}));
    expect(chlorophyll(LEAF.spent,.37)-chlorophyll(LEAF.spent,.97)).toBeGreaterThan(19);
    expect(chlorophyll(LEAF.wrapper,.97)).toBeGreaterThan(chlorophyll(LEAF.spent,.97)+17);
    const sideVeins=ts.map(t=>sample(LEAF.wrapper,.53,t)[1]);expect(Math.max(...sideVeins)-Math.min(...sideVeins)).toBeGreaterThan(13);
    const alpha=(s:number,t:number)=>{const [u,v]=leafUV(LEAF.spent,s,t);return map.image.data[4*(Math.floor(v*256)*256+Math.floor(u*256))+3];};
    expect(mat.alphaTest).toBeGreaterThan(.25); expect(ts.every(t=>alpha(.55,t)===255)).toBe(true);
    expect(Math.min(...ts.map(t=>alpha(.98,t)))).toBeLessThan(mat.alphaTest*255);
  });
  it('has narrow real board courses with a joint gap, cross-cut posts and relieved, planted-in earth', () => {
    for(const b of VILLA_VEGETABLE_BEDS) {
      const front=b.z+b.d/2, approach=(y:number)=>ray(stock(),new THREE.Vector3(b.x+.54,y,front+.21),new THREE.Vector3(0,0,-1),.31);
      expect(approach(.081)!.point.z).toBeCloseTo(front,3);expect(approach(.216)!.point.z).toBeCloseTo(front,3);
      const along=ray(stock(),new THREE.Vector3(b.x+.84,.081,front+.21),new THREE.Vector3(0,0,-1),.31)!;
      expect(Math.abs(along.uv!.x-approach(.081)!.uv!.x)).toBeGreaterThan(.060);
      expect(Math.abs(approach(.118)!.uv!.x-approach(.081)!.uv!.x)).toBeLessThan(.002); // fibres follow the long axis, not the world projection
      expect(approach(.140)?.point.z??-Infinity).toBeLessThan(front-.023);
      const cuts=[-1,1].flatMap(sx=>[-1,1].map(sz=>ray(stock(),new THREE.Vector3(b.x+sx*(b.w/2-.080),1,b.z+sz*(b.d/2-.080)))!));
      for(const h of cuts){expect(h.point.y).toBeGreaterThan(.282);expect(h.uv!.x).toBeLessThan(.25);expect(h.uv!.y).toBeGreaterThan(.50);}
      const rayY=(x:number,z:number)=>ray(stock(),new THREE.Vector3(b.x+x,1,b.z+z))!.point.y;
      expect(rayY(0,.35)-rayY(0,0)).toBeGreaterThan(.037); // one soil profile, not a box with two superimposed bars
      const side=rayY(.14,-.34),outer=rayY(.14,-.55); expect(side-outer).toBeGreaterThan(.020);
    }
    const b=VILLA_ROOF_PLANTERS.find(p=>p.species==='tulip')!,cast=(x:number)=>ray(stock(),new THREE.Vector3(b.x+x,b.y+1,b.z))!;
    expect(cast(b.w/2-.018).point.y-cast(0).point.y).toBeGreaterThan(.035); // returned clay rim with soil below it
    expect((stock().material as THREE.MeshStandardMaterial).map?.name).toBe('kitchen-garden/stock-and-loam');
  });
});
