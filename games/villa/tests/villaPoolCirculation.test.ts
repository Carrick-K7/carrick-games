import * as THREE from 'three';
import {afterAll,describe,expect,it} from 'vitest';
import {POOL} from '../src/villaEstateLayout.js';
import {createVillaPoolside} from '../src/villaPoolside.js';
import type {VillaSurfaces} from '../src/villaEnvelope.js';
import {createVillaPoolFinishMaps} from '../src/villaWeatheredPool.js';
import {poolCirculation,POOL_SURFACE_Y,POOL_RIPPLE_METRES,restingPoolHeight} from '../src/villaPoolCirculation.js';

const scene=new THREE.Scene(),m=Object.fromEntries(['oak','stone','plaster','glass','bronze','roof'].map(k=>[k,new THREE.MeshStandardMaterial()])) as VillaSurfaces;
const fx=createVillaPoolFinishMaps(),flow=poolCirculation(), water=createVillaPoolside(scene,m,fx.tile,fx.ripple,m.bronze,flow);
const basin=scene.getObjectByName('villa-terraces-and-pool')!.children.find(o=>o instanceof THREE.Mesh&&o.material.name==='pool/fired-mosaic') as THREE.Mesh<THREE.BufferGeometry,THREE.MeshLambertMaterial>;
const shader=(mat:THREE.Material,lib:'phong'|'lambert')=>{const model=THREE.ShaderLib[lib],s={uniforms:THREE.UniformsUtils.clone(model.uniforms),vertexShader:model.vertexShader,fragmentShader:model.fragmentShader};mat.onBeforeCompile(s as Parameters<typeof mat.onBeforeCompile>[0],{} as THREE.WebGLRenderer);return s;};
afterAll(()=>{const mats=new Set<THREE.Material>(),tex=new Set<THREE.Texture>();scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])mats.add(m);}});for(const m of mats){for(const v of Object.values(m))if(v instanceof THREE.Texture)tex.add(v);m.dispose();}tex.forEach(t=>t.dispose());});

describe('pool circulation through the existing inlet fittings',()=>{
  it('gives surface and bed the same two travelling charts and clock without allocating another map',()=>{
    const top=shader(water.material,'phong'),bed=shader(basin.material,'lambert');expect(top.uniforms.poolPhase).toBe(flow.phase);expect(bed.uniforms.poolPhase).toBe(flow.phase);
    expect(top.uniforms.poolRain).toBe(bed.uniforms.poolRain);expect(bed.uniforms.poolNormalFocus!.value).toBe(water.material.normalMap);
    for(const s of [top,bed]){expect(s.fragmentShader).toContain('vec3 poolOptics');expect(s.fragmentShader).toContain('texture2D(slopes,q-poolPhase.xy+bend)');}
    expect(top.fragmentShader).toContain('tbn*normalize');expect(bed.fragmentShader).toContain('vMapUv + distortion');
    const k=water.material.customProgramCacheKey(),version=fx.ripple.version,pos=water.geometry.getAttribute('position') as THREE.BufferAttribute;
    const atStart=pos.array.slice();flow.update(12,.2);flow.update(13.5,.7);expect(fx.ripple.version).toBe(version);expect(pos.array).toEqual(atStart);expect(water.material.customProgramCacheKey()).toBe(k);
  });
  it('advances at metre rates, not RAF count; time reversal, wrap and pause preserve the same phase',()=>{
    const a=poolCirculation(),b=poolCirculation(),identity=a.phase.value,P=POOL_RIPPLE_METRES;for(let i=0;i<=75;i++)a.update(i*.016,.4);b.update(75*.016,.4);
    expect(a.phase.value.toArray()).toEqual(b.phase.value.toArray());const t0=a.phase.value.clone();a.update(75*.016+.5,.4);
    expect((a.phase.value.x-t0.x)*P[0]).toBeCloseTo(.5*P[0]/23,9);expect((a.phase.value.y-t0.y)*P[1]).toBeCloseTo(.5*P[1]/71,9);
    a.update(12345678,1.5);expect(a.phase.value.toArray().every(x=>x>=0&&x<1)).toBe(true);expect(a.rain.value).toBe(1);
    a.update(75*.016,.4);a.update(75*.016,.4);a.update(NaN,1);expect(a.phase.value).toBe(identity);expect(identity.toArray()).toEqual(t0.toArray());expect(a.rain.value).toBe(.4);
    a.update(22.99999);const left=a.phase.value.x;a.update(23.00001);expect(1-left+a.phase.value.x).toBeCloseTo(.00002/23,9);a.update(-1,-1);expect(a.phase.value.toArray()).toEqual([0,0,0,0]);expect(a.rain.value).toBe(0);
  });
  it('keeps the mean waterline and all four rim edges pinned while the open surface changes shape',()=>{
    const [w,h]=[POOL.maxX-POOL.minX,POOL.maxZ-POOL.minZ],p=water.geometry.getAttribute('position');let high=0,low=0,edge=0;
    for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);expect(z).toBeCloseTo(restingPoolHeight(x,y),6);if(Math.abs(Math.abs(x)-w/2)<.0001||Math.abs(Math.abs(y)-h/2)<.0001){expect(Math.abs(z)).toBeLessThan(1e-8);edge++;}high=Math.max(high,z);low=Math.min(low,z);}
    expect(edge).toBe(140);expect(high-low).toBeGreaterThan(.024);expect(water.position.y).toBe(POOL_SURFACE_Y);expect(water.geometry.boundingBox!.max.z).toBeGreaterThanOrEqual(.013*1.18-1e-8);
    const s=shader(water.material,'phong');expect(s.vertexShader).toContain('transformed.z=poolRelief.z');expect(s.vertexShader).toContain('objectNormal=normalize(vec3(-poolRelief.xy,1.))');
    const first=flow.phase.value.clone();flow.update(26.24);expect(flow.phase.value.equals(first)).toBe(false);expect(water.position.y).toBe(POOL_SURFACE_Y);
  });
});
