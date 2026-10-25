import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as T from 'three';
import { CLASSIC_MAPS } from '../src/csClassicMaps.js';
import { DECORATIVE_KINDS } from '../src/csMapDecorations.js';
import { AuthoredWorld, AUTHORED_HULL } from '../src/csAuthoredWorld.js';

type Body = {pos:T.Vector3;vy:number;grounded:boolean};
const worlds: Record<string, AuthoredWorld> = {};
const position = (raw: number[]) => new T.Vector3(raw[0],raw[1],raw[2]);
function travel(world: AuthoredWorld, body: Body, target: T.Vector3, label: string) {
  const dx=target.x-body.pos.x,dz=target.z-body.pos.z;
  const limit=Math.ceil(Math.hypot(dx,dz)/3.2*30)+90;
  for(let i=0;i<limit;i++){
    const dx=target.x-body.pos.x,dz=target.z-body.pos.z,len=Math.hypot(dx,dz);
    if(len<.08&&Math.abs(target.y-body.pos.y)<.15)return;
    const step=Math.min(len,3.2/30);
    world.move(body,len?dx/len*step:0,len?dz/len*step:0,1/30);
  }
  expect(body.pos.distanceTo(target),`${label}: stopped at ${body.pos.toArray()} for ${target.toArray()}`).toBeLessThan(.17);
}

beforeAll(async()=>{
  for(const id of Object.keys(CLASSIC_MAPS)){
    worlds[id]=new AuthoredWorld(new T.Scene(),{id});
    await worlds[id].load();
  }
});
afterAll(()=>Object.values(worlds).forEach(w=>w.dispose()));

describe.each(Object.keys(CLASSIC_MAPS))('%s original authored world',id=>{
  it('loads offline in under two seconds, with bounded single-material batches',()=>{
    const w=worlds[id];
    expect(w.stats.loadMs).toBeLessThan(2000);
    expect(w.stats.drawCalls).toBeLessThanOrEqual(12);
    expect(w.stats.triangles).toBeLessThan(50000);
    expect(w.nodes.length).toBeGreaterThan(1000);
    expect(w.nodes.length).toBeLessThan(5000);
    expect(w.reachable.size).toBe(w.nodes.length);
    expect(w.radarTriangles.length).toBeGreaterThan(100);
    const kinds=new Set<string>();
    for(const child of w.mapGroup.children as T.Mesh[]){
      expect(Array.isArray(child.material)).toBe(false);
      expect(child.castShadow&&child.receiveShadow).toBe(true);
      expect(child.geometry.groups).toHaveLength(0);
      expect(child.userData.uvMeters).toBe(child.userData.materialKind!=='foliage');
      const kind=child.userData.materialKind;
      expect(kinds.has(kind)).toBe(false);kinds.add(kind);
      expect(['plaster','sandstone','brick','cobble','concrete','wood','metal','roof','snow',...DECORATIVE_KINDS]).toContain(kind);
      const p=child.geometry.attributes.position,uv=child.geometry.attributes.uv;
      expect(p.count).toBe(uv.count);
      expect([...uv.array].every(Number.isFinite)).toBe(true);
    }
  });

  it('connects every spawn to each reachable A/B planting floor using real engine movement',()=>{
    const w=worlds[id];
    expect(w.bombSites.map(s=>s.id)).toEqual(['A','B']);
    for(const team of ['ct','t']){
      expect(w.spawns[team].length).toBeGreaterThanOrEqual(5);
      for(const [i,spawn] of w.spawns[team].entries()){
        expect(w.canStand(spawn.pos.x,spawn.pos.y,spawn.pos.z)).toBe(true);
        expect(w.buyZones.some(zone=>zone.team===team&&zone.box.containsPoint(spawn.pos.clone().add(new T.Vector3(0,.4,0))))).toBe(true);
        for(const site of w.bombSites){
          const path=w.path(spawn.pos,site.pos);
          expect(path.length).toBeGreaterThan(0);
          const body:Body={pos:spawn.pos.clone(),vy:0,grounded:true};
          for(const point of path)travel(w,body,point,`${team}${i} to ${site.id}`);
          travel(w,body,site.pos,`${team}${i} plant ${site.id}`);
          expect(site.box.containsPoint(body.pos)).toBe(true);
          expect(w.ground(site.pos.x,site.pos.z,site.pos.y+.2)).toBeCloseTo(site.pos.y,3);
          expect(body.grounded).toBe(true);
        }
      }
    }
  });

  it('walks every entire named tactical route directly, without pathfinding teleports',()=>{
    const w=worlds[id];
    for(const [site,routes] of Object.entries(w.tacticalRoutes))for(const [name,raw] of Object.entries(routes)){
      const route=raw as number[][],body:Body={pos:position(route[0]),vy:0,grounded:true};
      for(const [i,p] of route.entries()){
        expect(w.canStand(p[0],p[1]+.03,p[2]),`${site}/${name} waypoint ${i}`).toBe(true);
        travel(w,body,position(p),`${site}/${name} segment ${i}`);
      }
      expect(w.bombSites.find(s=>s.id===site).box.containsPoint(body.pos)).toBe(true);
    }
  });

  it('blocks both bullets and the exact .42m actor hull with site cover',()=>{
    const w=worlds[id],p=id==='de_inferno'?new T.Vector3(17,0,-13):new T.Vector3(-22,0,-16);
    const eye=p.clone().add(new T.Vector3(-4,1,0)),end=p.clone().add(new T.Vector3(4,1,0));
    expect(w.lineClear(eye,end)).toBe(false);
    const hit=w.raycast(eye,new T.Vector3(1,0,0),8);
    expect(hit).not.toBeNull();expect(hit.face.normal.toArray()).toEqual([-1,0,0]);
    expect(hit.object.matrixWorld.equals(new T.Matrix4())).toBe(true);
    const body:Body={pos:p.clone().add(new T.Vector3(-4,0,0)),vy:0,grounded:true};
    for(let i=0;i<90;i++)w.move(body,.1,0,1/30);
    expect(body.pos.x).toBeLessThan(hit.point.x-.40);
    const wallX=hit.point.x;
    expect(w.canStand(wallX-.421,0,p.z)).toBe(true);
    expect(w.canStand(wallX-.419,0,p.z)).toBe(false);
    const over=p.clone().add(new T.Vector3(-4,3,0));
    expect(w.lineClear(over,p.clone().add(new T.Vector3(4,3,0)))).toBe(true);
  });

  it('cannot escape over boundary walls, tunnel sideways, or fall through supported floors',()=>{
    const w=worlds[id],b=w.bounds;
    expect(w.canStand(b.minX-2,0,b.minZ-2)).toBe(false);
    expect(w.canStand(b.minX-2,12,b.minZ-2)).toBe(false);
    expect(w.ground(b.minX-2,b.minZ-2)).toBeNull();
    const spawn=w.spawns.t[0].pos,body:Body={pos:spawn.clone(),vy:0,grounded:true};
    for(let i=0;i<100;i++)w.move(body,-.4,.1,1/30,i%20===0);
    expect(w.footprintSupported(body.pos.x,body.pos.z)).toBe(true);
    expect(body.pos.y).toBeGreaterThanOrEqual(0);
    expect(w.canStand(body.pos.x,body.pos.y,body.pos.z)).toBe(true);
    // A huge horizontal input is swept in <=.10m increments, not teleported.
    const tunnel:Body={pos:spawn.clone(),vy:0,grounded:true};w.move(tunnel,-100,0,1/30);
    expect(w.footprintSupported(tunnel.pos.x,tunnel.pos.z)).toBe(true);
    expect(tunnel.pos.distanceTo(spawn)).toBeLessThan(30);
  });

  it('spatial ray traversal matches exhaustive primitive tracing, including diagonal and vertical rays',()=>{
    const w=worlds[id],rays=Array.from({length:140},(_,i)=>{
      const n=w.nodes[(i*53)%w.nodes.length],origin=new T.Vector3(n.x,n.y+1.4,n.z);
      const dir=i%10===0?new T.Vector3(0,-1,0):new T.Vector3(Math.sin(i*1.73),Math.cos(i*.61)*.4,Math.cos(i*1.73)).normalize();
      return {origin,dir};
    });
    const indexed=rays.map(({origin,dir})=>w.raycast(origin,dir,130));
    const original=w.rayCells;
    try{
      w.rayCells=function*(){yield {distance:0,colliders:this.collisionBoxes};};
      for(const [i,{origin,dir}] of rays.entries()){
        const hit=w.raycast(origin,dir,130),fast=indexed[i];
        expect(!!fast,`ray ${i}`).toBe(!!hit);
        if(hit){expect(fast.distance).toBeCloseTo(hit.distance,7);expect(fast.point.distanceTo(hit.point)).toBeLessThan(1e-7);}
      }
    }finally{w.rayCells=original;}
  });

  it('has useful callouts and an independent presentation camera',()=>{
    const w=worlds[id];
    expect(w.locationAt(w.bombSites[0].pos)).toBe('Bombsite A');
    expect(w.locationAt(w.bombSites[1].pos,true)).toBe('B 包点');
    expect(w.previewCamera.position).toHaveLength(3);
    expect(w.previewCamera.target).toHaveLength(3);
    expect(w.previewCamera.fov).toBeGreaterThan(40);
  });
});

describe('mechanics and distinct architecture',()=>{
  it('retains Italian banana/mid/arch routes versus Mirage mid/connector/market routes',()=>{
    const inferno=worlds.de_inferno,mirage=worlds.de_mirage;
    expect(Object.keys(inferno.tacticalRoutes.A)).toEqual(['short','long','apartments']);
    expect(Object.keys(inferno.tacticalRoutes.B)).toEqual(['banana']);
    expect(Object.keys(mirage.tacticalRoutes.A)).toEqual(['ramp','palace','connector']);
    expect(Object.keys(mirage.tacticalRoutes.B)).toEqual(['apartments','short']);
    expect(inferno.landmarks.map(l=>l.kind)).toEqual(expect.arrayContaining(['bellTower','fountain','laundry','cypress']));
    expect(mirage.landmarks.map(l=>l.kind)).toEqual(expect.arrayContaining(['palm','minaret','canopy']));
    expect(inferno.floorCells).not.toEqual(mirage.floorCells);
    expect(inferno.locationAt(new T.Vector3(-29,0,4))).toBe('Banana');
    expect(mirage.locationAt(new T.Vector3(29,0,4))).toBe('B Apartments');
    const banana=inferno.tacticalRoutes.B.banana;
    expect(Math.max(...banana.map(p=>p[0]))-Math.min(...banana.map(p=>p[0]))).toBeGreaterThan(18);
  });

  it('supports 1.8m standing / .9m crouching and prevents jumping through an apartment ceiling',()=>{
    const w=worlds.de_inferno;
    expect(AUTHORED_HULL).toEqual({radius:.42,standing:1.8,crouching:.9,step:.46});
    // Physical table on the raised apartment floor: standing blocked, crouch fits.
    expect(w.canStand(18,1.201,5)).toBe(false);
    expect(w.canStand(18,1.201,5,true)).toBe(true);
    const body:Body={pos:new T.Vector3(16,1.201,5),vy:0,grounded:true};
    let maximum=body.pos.y;
    for(let i=0;i<90;i++){
      w.move(body,0,0,1/60,i===0);maximum=Math.max(maximum,body.pos.y);
      expect(w.canStand(body.pos.x,body.pos.y,body.pos.z)).toBe(true);
    }
    expect(maximum).toBeGreaterThan(1.7);
    expect(maximum+1.8).toBeLessThanOrEqual(3.8+.001);
    expect(body.grounded).toBe(true);expect(body.pos.y).toBeCloseTo(1.201,3);
  });

  it('walks CT stairs to the elevated Window, drops to Mid, and physically returns via CT',()=>{
    const w=worlds.de_mirage,body:Body={pos:new T.Vector3(-1.5,0,-32),vy:0,grounded:true};
    for(const raw of [[-1.5,1.8,-24],[-1.5,1.8,-22],[2,1.8,-22],[2,2.1,-19.5],[2,2.4,-18.05],[2,2.65,-17],[2,0,-14]])
      travel(w,body,position(raw),'Window CT stair / interior boost / drop');
    expect(w.ground(2,-16,3)).toBe(0); // no fabricated exterior walk-up staircase
    const path=w.path(body.pos,new T.Vector3(2,2.1,-19.5));
    expect(path.length).toBeGreaterThan(10);
    for(const point of path)travel(w,body,point,'Window legitimate CT return');
    travel(w,body,new T.Vector3(2,2.1,-19.5),'Window supported camera perch');
    expect(body.grounded).toBe(true);
  });
});

describe('authored instance resource ownership',()=>{
  it('rejects an unknown definition before attaching scene resources',()=>{
    const scene=new T.Scene();
    expect(()=>new AuthoredWorld(scene,{id:'unknown'})).toThrow('Unknown authored map');
    expect(scene.children).toHaveLength(0);
  });

  it('creates hidden-able groups synchronously and performs no network load',async()=>{
    const scene=new T.Scene(),world=new AuthoredWorld(scene,{id:'de_inferno'}),fetchSpy=vi.spyOn(globalThis,'fetch');
    try{
      expect(scene.children).toEqual([world.environment,world.mapGroup]);
      world.environment.visible=false;world.mapGroup.visible=false;
      await world.load();await world.load();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(world.mapGroup.visible).toBe(false);expect(world.environment.visible).toBe(false);
      expect(world.mapGroup.children.length+world.environment.children.length).toBe(world.stats.drawCalls);
    }finally{fetchSpy.mockRestore();world.dispose();}
  });

  it('disposes owned shared buffers and all material textures exactly once, not borrowed palettes',async()=>{
    const scene=new T.Scene(),world=new AuthoredWorld(scene,{id:'de_mirage'});await world.load();
    const geometries=(world.mapGroup.children as T.Mesh[]).map(m=>m.geometry),geometryDispose=geometries.map(g=>vi.spyOn(g,'dispose'));
    const originals=[...world.materials],originalDispose=originals.map(m=>vi.spyOn(m,'dispose'));
    const borrowed=new T.MeshStandardMaterial(),borrowedDispose=vi.spyOn(borrowed,'dispose');
    world.applyMaterialPalette(()=>borrowed);
    expect(originalDispose.every(spy=>spy.mock.calls.length===1)).toBe(true);
    world.dispose();world.dispose();
    expect(geometryDispose.every(spy=>spy.mock.calls.length===1)).toBe(true);
    expect(originalDispose.every(spy=>spy.mock.calls.length===1)).toBe(true);
    expect(borrowedDispose).not.toHaveBeenCalled();borrowed.dispose();
    expect(scene.children).toHaveLength(0);expect(world.mapGroup.children).toHaveLength(0);
    expect(world.materials).toHaveLength(0);expect(world.solids).toHaveLength(0);
    expect(world.nodes).toHaveLength(0);expect(world.grid.size+world.levels.size+world.collisionGrid.size+world.floorCells.size).toBe(0);
    await expect(world.load()).rejects.toThrow('disposed');
  });

  it('releases every owned texture slot once when materials share a texture',async()=>{
    const world=new AuthoredWorld(new T.Scene(),{id:'de_inferno'});await world.load();
    const texture=new T.Texture(),textureDispose=vi.spyOn(texture,'dispose');
    const a=new T.MeshStandardMaterial({map:texture,normalMap:texture}),b=new T.MeshStandardMaterial({roughnessMap:texture});
    const ad=vi.spyOn(a,'dispose'),bd=vi.spyOn(b,'dispose');
    world.applyMaterialPalette((kind:string)=>kind==='wood'?a:b,{owned:true});
    // Replacing one of several meshes must not dispose a material still used by
    // another material family, nor a texture still shared with live materials.
    world.applyMaterialPalette({plaster:a},{owned:true});
    expect(bd).not.toHaveBeenCalled();expect(textureDispose).not.toHaveBeenCalled();
    world.dispose();world.dispose();
    expect(textureDispose).toHaveBeenCalledTimes(1);expect(ad).toHaveBeenCalledTimes(1);expect(bd).toHaveBeenCalledTimes(1);
  });
});
