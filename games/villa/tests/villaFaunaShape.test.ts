import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createVillaPetModel } from '../src/villaPetModel.js';
import { createVillaPets } from '../src/villaPets.js';
import { createVillaAquariumLife } from '../src/villaAquarium.js';

const scenes: THREE.Group[] = [];
function scene() { const g = new THREE.Group(); scenes.push(g); return g; }
afterEach(() => { for (const g of scenes.splice(0)) { const mats = new Set<THREE.Material>(); g.traverse(n => { if (n instanceof THREE.Mesh) { n.geometry.dispose(); for (const m of Array.isArray(n.material) ? n.material : [n.material]) mats.add(m); } }); mats.forEach(m => m.dispose()); g.clear(); } });
const localPoints = (m: THREE.Mesh) => { const p = m.geometry.getAttribute('position'); return Array.from({length:p.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(p,i)); };
const size = (points: THREE.Vector3[]) => new THREE.Box3().setFromPoints(points).getSize(new THREE.Vector3());
const body = (r: THREE.Object3D, id: string) => r.getObjectByName(`${id}/body/surface`) as THREE.Mesh;
const span = (ps: THREE.Vector3[], z: number) => size(ps.filter(p => Math.abs(p.z-z)<.00001)).x;

// Geometry checks on the production, batched parts, not assertions on labels.
describe('contoured animal surfaces and moving attachments', () => {
  it('fades the actual contact surface monotonically to zero, shrinking only the bird footprint in flight', () => {
    const r = scene(), rig = createVillaPetModel(r), state = createVillaPets();
    const bird = r.getObjectByName('parrot/contact-shadow') as THREE.Mesh, dog = r.getObjectByName('dog/contact-shadow') as THREE.Mesh;
    const p = bird.geometry.getAttribute('position'), c = bird.geometry.getAttribute('color'), rings = new Map<number, number>();
    for (let i = 0; i < p.count; i++) rings.set(Math.round(100 * Math.hypot(p.getX(i), p.getY(i))), c.getW(i));
    const levels = [...rings].sort((a,b) => a[0]-b[0]); expect(levels.length).toBeGreaterThanOrEqual(5);
    expect(levels[0][1]).toBe(1); expect(levels.at(-1)![1]).toBe(0);
    for (let i = 1; i < levels.length; i++) expect(levels[i][1]).toBeLessThan(levels[i-1][1]);
    const before = bird.scale.x, ground = dog.scale.clone(); state.pets.find(p => p.id === 'parrot')!.y = .65; rig.update(1,state);
    expect(bird.scale.x).toBeLessThan(.65 * before); expect(dog.scale.equals(ground)).toBe(true);
    expect(bird.material).toBe(dog.material); expect(bird.geometry.getAttribute('color')).toBe(c);
  });
  it('gives the dog a tucked waist and chest and puts the rabbit haunch behind its shoulders', () => {
    const r=scene(); createVillaPetModel(r);
    const dog=localPoints(body(r,'dog')), rabbit=localPoints(body(r,'rabbit'));
    expect(span(dog,.050)).toBeGreaterThan(span(dog,-.016)*1.14);
    expect(span(dog,.050)).toBeGreaterThan(span(dog,.143)*1.32);
    expect(span(rabbit,-.111)).toBeGreaterThan(span(rabbit,.087)*1.37);
    const rear = rabbit.filter(p=>Math.abs(p.z+.111)<.00001), neck=rabbit.filter(p=>Math.abs(p.z-.087)<.00001);
    expect(size(rear).y).toBeGreaterThan(size(neck).y*1.6);
  });
  it('recesses the pinna between both lips of each long ear and splays the silver pair farther', () => {
    const r=scene(); createVillaPetModel(r);
    const widths:number[]=[];
    for(const id of ['rabbit','rabbit-female']) {
      const ps=localPoints(r.getObjectByName(`${id}/head/surface`) as THREE.Mesh), y=.192*(id==='rabbit' ? 1 : .93);
      const ring=ps.filter(p=>p.x>0 && Math.abs(p.y-y)<.00001), bounds=new THREE.Box3().setFromPoints(ring), x=bounds.getCenter(new THREE.Vector3()).x;
      const centre=ring.filter(p=>Math.abs(p.x-x)<.0001), lips=ring.filter(p=>Math.abs(Math.abs(p.x-x)-.035*.72)<.001);
      expect(Math.max(...lips.map(p=>p.z))-Math.max(...centre.map(p=>p.z))).toBeGreaterThan(.007); widths.push(x);
    }
    expect(widths[1]-widths[0]).toBeGreaterThan(.025);
  });
  it('bends actual hock/paw geometry through gait without moving or duplicating the whole diagonal batch', () => {
    const r=scene(), rig=createVillaPetModel(r), state=createVillaPets(), dog=state.pets.find(p=>p.kind==='dog')!;
    const limb=r.getObjectByName('dog/legs-0/surface') as THREE.Mesh, p=limb.geometry.getAttribute('position'), stable=limb.geometry;
    const vertices=(predicate:(p:THREE.Vector3)=>boolean)=>{const result:number[]=[];for(let i=0;i<p.count;i++)if(predicate(new THREE.Vector3().fromBufferAttribute(p,i)))result.push(i);return result;};
    const paw=vertices(v=>v.x<0 && v.y<.026), shoulder=vertices(v=>v.x<0 && v.y>.211);
    const rest=(ids:number[])=>ids.map(i=>new THREE.Vector3().fromBufferAttribute(p,i));
    const legsAtRest=rest(paw), rootsAtRest=rest(shoulder), read=(ids:number[])=>ids.map(i=>limb.getVertexPosition(i,new THREE.Vector3()));
    const mean=(ps:THREE.Vector3[])=>ps.reduce((a,v)=>a.add(v),new THREE.Vector3()).multiplyScalar(1/ps.length);
    const rootBefore=mean(rootsAtRest), base=mean(legsAtRest);
    dog.speed=.5; dog.gait=Math.PI/2; rig.update(.2,state);
    const f=mean(read(paw)), shoulderMotion=mean(read(shoulder)).distanceTo(rootBefore);
    dog.gait=3*Math.PI/2; rig.update(.3,state);
    const back=mean(read(paw));
    expect(Math.abs(f.z-back.z)).toBeGreaterThan(.048); expect(shoulderMotion).toBeLessThan(.022);
    expect(Math.abs(f.y-base.y)+Math.abs(back.y-base.y)).toBeGreaterThan(.004);
    expect(limb.geometry).toBe(stable); expect(limb.geometry.getAttribute('position')).toBe(p);
    dog.speed=0;rig.update(.4,state);expect(mean(read(paw)).distanceTo(base)).toBeLessThan(1e-8);
  });
  it('has a concave feeding well and raised lip under the appropriate actual food in all four dish types', () => {
    const r=scene(); createVillaPetModel(r);
    for(const id of ['dog','cat','rabbit','parrot']) {
      const m=r.getObjectByName(`${id}/food-plate/surface`) as THREE.Mesh, points=localPoints(m), rim:number[]=[], floor:number[]=[];
      // Keep only the continuous wheel-thrown clay surface: food in the well
      // does not turn it into a flat solid puck. Geometry is a single batch.
      const clay=id==='dog'?0x89acaa:id==='cat'?0xc88768:id==='rabbit'?0xc6a16c:0xe7dac1;
      const colors=m.geometry.getAttribute('color'), color=new THREE.Color(clay), glazed=new THREE.Color(0xe8d6ba);
      points.forEach((p,i)=>{const d=Math.hypot(p.x,p.z); if(Math.abs(colors.getX(i)-glazed.r)<1e-5 && d>.095)rim.push(p.y); if(Math.abs(colors.getX(i)-color.r)<1e-5&&d<.005)floor.push(p.y);});
      expect(rim.length).toBeGreaterThan(20); expect(floor.length).toBeGreaterThan(5); expect(Math.max(...rim)-Math.max(...floor)).toBeGreaterThan(.013);
      expect(points.filter(p=>p.y>.013&&Math.hypot(p.x,p.z)<.072).length).toBeGreaterThan(150);
    }
  });
  it('mates the reflective dorsal strip to the actual body skin and narrows into the hinged caudal peduncle', () => {
    const r=scene(), {root,update}=createVillaAquariumLife(r);
    const batches=root.children.filter((o):o is THREE.InstancedMesh=>o instanceof THREE.InstancedMesh && o.name==='aquarium/medaka-template');
    const stripe=batches.find(b=>(b.material as THREE.MeshStandardMaterial).metalness>.7)!, silver=batches.find(b=>(b.material as THREE.MeshStandardMaterial).color.getHexString()==='a9b8b4')!;
    const pts=localPoints(silver), marks=localPoints(stripe), key=(p:THREE.Vector3)=>p.toArray().map(n=>n.toFixed(7)).join('/'), skin=new Set(pts.map(key));
    const touching=marks.filter(p=>skin.has(key(p)));expect(new Set(touching.map(p=>p.x.toFixed(4))).size).toBeGreaterThanOrEqual(7);
    expect(size(touching).x).toBeGreaterThan(.083);expect(size(touching).z).toBeLessThan(.005);
    expect(size(pts.filter(p=>Math.abs(p.x-.003)<.0001)).z/size(pts.filter(p=>Math.abs(p.x+.051)<.0001)).z).toBeGreaterThan(3.3);
    const tail=root.getObjectByName('aquarium/medaka-tail') as THREE.InstancedMesh, marker=root.getObjectByName('Aquarium fish 1')!;
    const local=localPoints(tail);const outside=local.filter(p=>p.x<-.022), joint=local.filter(p=>p.x>.0025);
    expect(size(outside).y).toBeGreaterThan(size(joint).y*4.5);expect(size(outside).z).toBeGreaterThan(.001);
    for(const t of [.13,.41,.89]) {
      update(t,.1,false);const transform=new THREE.Matrix4();tail.getMatrixAt(0,transform);transform.premultiply(marker.matrix.clone().invert());
      const entering=joint.map(p=>p.clone().applyMatrix4(transform)).filter(v=>v.x>-.056 && Math.abs(v.y)<.0017 && Math.abs(v.z)<.00135);
      expect(entering.length).toBeGreaterThan(5);
    }
  });
  it('rotates attached pectoral fans independently of translation and yaw of the swimming fish', () => {
    const r=scene(),life=createVillaAquariumLife(r),root=life.root, m=root.getObjectByName('Aquarium fish 1')!;
    const batches=[-1,1].map(side=>root.getObjectByName(`aquarium/medaka-pectoral-${side}`) as THREE.InstancedMesh);
    const posed=(t:number)=>{life.update(t,.1,false);return batches.map(b=>{const x=new THREE.Matrix4();b.getMatrixAt(0,x);return x.premultiply(m.matrix.clone().invert());});};
    const poses=Array.from({length:16},(_,i)=>posed(i/12));
    for(let i=0;i<2;i++) {
      const fin=localPoints(batches[i]), tip=fin.reduce((a,b)=>a.lengthSq()>b.lengthSq()?a:b);
      const pivots=poses.map(p=>new THREE.Vector3().applyMatrix4(p[i])), tips=poses.map(p=>tip.clone().applyMatrix4(p[i]));
      expect(size(pivots).length()).toBeLessThan(.00001);
      expect(size(tips).length()).toBeGreaterThan(.004);
    }
  });
});
