import { describe, expect, it, vi } from 'vitest';
import * as T from 'three';
import { AuthoredWorld } from '../src/csAuthoredWorld.js';
import { bakeWorldReflectionX, staticFormShade } from '../src/csAuthoredSpace.js';
import { upgradeWorldMaterials } from '../src/csMapPresentation.js';
import { MAPS } from '../src/csMaps.js';

const resolver=(path: string)=>`https://example.test/cs/${path}`;
const loader=async()=>({texture:new T.Texture({width:512,height:512} as any)});

describe('owned reference map decoration contracts',()=>{
  it('keeps sky instance-owned, hidden with the world and within total geometry/texture budgets',async()=>{
    const scene=new T.Scene(),w=new AuthoredWorld(scene,MAPS.de_mirage,resolver),fetch=vi.spyOn(globalThis,'fetch');
    w.environment.visible=false;w.mapGroup.visible=false;
    try{
      await w.load();
      expect(fetch).not.toHaveBeenCalled();expect(scene.background).toBeNull();
      expect(w.environment.visible).toBe(false);expect(w.mapGroup.visible).toBe(false);
      const sky=w.environment.getObjectByName('world-owned-sky') as T.Mesh<T.BufferGeometry,T.MeshBasicMaterial>;
      expect(sky.parent).toBe(w.environment);expect(sky.material.fog).toBe(false);expect(sky.material.depthWrite).toBe(false);
      expect(sky.material.toneMapped).toBe(false);expect(sky.material.side).toBe(T.BackSide);
      const meshes=[...w.mapGroup.children,...w.environment.children] as T.Mesh[];
      expect(w.stats.drawCalls).toBe(meshes.length);expect(meshes.length).toBeLessThanOrEqual(12);
      const triangles=meshes.reduce((n,m)=>n+(m.geometry.index?.count??m.geometry.attributes.position.count)/3,0);
      expect(w.stats.triangles).toBe(triangles);expect(triangles).toBeLessThan(50000);
      const textures=new Set([...w.ownedMaterials].map(m=>m.map).filter(Boolean));
      expect(textures.size).toBe(3);
      expect([...textures].reduce((n,t)=>n+t.userData.gpuBytes,0)).toBe(w.decorativeTextureBytes);
      expect(w.decorativeTextureBytes).toBeLessThan(1024*1024);
      for(const texture of textures)expect(texture.userData.originalProcedural).toBe(true);
      const pixels=sky.material.map.image.data as Uint8Array;
      expect(new Set(Array.from(pixels).filter((_,i)=>i%4!==3)).size).toBeGreaterThan(70);
      const horizon=new T.Color(MAPS.de_mirage.atmosphere.sky).convertLinearToSRGB(),zenith=new T.Color(MAPS.de_mirage.atmosphere.zenith).convertLinearToSRGB();
      let strongestCloud=0;
      for(let y=0;y<128;y++)for(let x=0;x<256;x++){
        const elevation=Math.max(0,(y/127-.5)*2),base=(horizon.r+(zenith.r-horizon.r)*elevation)*255;
        strongestCloud=Math.max(strongestCloud,(pixels[4*(y*256+x)]-base)/(246-base));
      }
      expect(strongestCloud).toBeGreaterThan(.04);expect(strongestCloud).toBeLessThan(.14); // faint wisps, never a bright orb
      const eye=new T.Vector3(2,3.7,-19.5);
      for(const [x,y,z] of [[4.12,3.7,-17.43],[-.12,3.7,-17.43],[2,4.85,-17.43],[2,2.57,-17.43],[3.95,3.7,-17],[.05,3.7,-17]]){
        const target=new T.Vector3(x,y,z),ray=new T.Raycaster(eye,target.clone().sub(eye).normalize(),0,eye.distanceTo(target)+.2);
        const hit=ray.intersectObjects(w.mapGroup.children,false)[0];
        expect(hit,`interior timber at ${x},${y},${z}`).toBeDefined();expect(hit.object.userData.materialKind).toBe('wood');
      }
      const foliage=w.materialMeshes.get('foliage').material;
      expect(foliage.alphaTest).toBe(.5);expect(foliage.transparent).toBe(false);
      const alpha=Array.from(foliage.map.image.data as Uint8Array).filter((_,i)=>i%4===3);
      expect(alpha.filter(a=>a===0).length).toBeGreaterThan(1000);expect(alpha.filter(a=>a===255).length).toBeGreaterThan(1000);
    }finally{fetch.mockRestore();w.dispose();}
  });

  it('preserves owned material identities/custom UVs through photographic upgrades and disposes every resource once',async()=>{
    const w=new AuthoredWorld(new T.Scene(),MAPS.de_inferno,resolver);await w.load();
    const custom=[...w.materialMeshes.values()].filter(m=>m.userData.ownedMapDecoration);
    const materials=custom.map(m=>m.material),uv=custom.map(m=>m.geometry.attributes.uv.array.slice());
    const owned=[...w.ownedMaterials].filter(m=>m.userData.ownedMapDecoration);
    const textures=[...new Set(owned.map(m=>m.map).filter(Boolean))];
    const materialDispose=owned.map(m=>vi.spyOn(m,'dispose')),textureDispose=textures.map(t=>vi.spyOn(t,'dispose'));
    const sky=w.environment.children[0] as T.Mesh,skyDispose=vi.spyOn(sky.geometry,'dispose');
    try{
      const base=await upgradeWorldMaterials(w,resolver,{detail:false,loadTexture:loader});
      expect(base.gpuBytes+w.decorativeTextureBytes).toBeLessThan(13*1024*1024);
      for(let i=0;i<custom.length;i++){
        expect(custom[i].material).toBe(materials[i]);expect(custom[i].geometry.attributes.uv.array).toEqual(uv[i]);
        expect(custom[i].material.userData.worldMaterialPalette).toBeUndefined();
      }
      w.materialPalette.applyQuality({detail:true});const full=await w.materialPalette.load();
      expect(full.gpuBytes+w.decorativeTextureBytes).toBeLessThan(48*1024*1024);
      expect(materialDispose.every(s=>s.mock.calls.length===0)).toBe(true);
      expect(textureDispose.every(s=>s.mock.calls.length===0)).toBe(true);
      w.dispose();w.dispose();
      expect(materialDispose.every(s=>s.mock.calls.length===1)).toBe(true);
      expect(textureDispose.every(s=>s.mock.calls.length===1)).toBe(true);expect(skyDispose).toHaveBeenCalledTimes(1);
    }finally{w.dispose();vi.restoreAllMocks();}
  });

  it('preserves exact authored UV corner correspondence when mirroring triangle winding',()=>{
    const w=new AuthoredWorld(new T.Scene(),{id:'de_mirage'});
    w.bounds={minX:0,maxX:2,minZ:0,maxZ:2,minY:0};w.center=new T.Vector3(1,0,1);w.radarTriangles=[];
    w.appendGeometry('foliage',new T.PlaneGeometry(2,3),0xffffff,{preserveUV:true});
    const b=w._buckets.get('foliage'),original=[...b.uvs];
    bakeWorldReflectionX(w);
    for(let i=0;i<original.length;i+=6)expect(b.uvs.slice(i,i+6)).toEqual([...original.slice(i,i+2),...original.slice(i+4,i+6),...original.slice(i+2,i+4)]);
    expect(b.uvMode).toBe('authored');w.dispose();
  });

  it('uses only mild nondirectional foot/soffit occlusion rather than a competing sun',()=>{
    expect(staticFormShade(1,0,0,3)).toBe(staticFormShade(-1,0,0,3));
    expect(staticFormShade(0,0,1,3)).toBe(staticFormShade(0,0,-1,3));
    expect(staticFormShade(0,0,1,0)).toBeGreaterThan(.85);
    expect(staticFormShade(0,-1,0,5)).toBeLessThan(staticFormShade(0,1,0,5));
  });
});
