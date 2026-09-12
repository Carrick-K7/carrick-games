import * as T from 'three';
import {REFERENCE_WEAPONS} from './csReferenceWeaponData.js';

function surface(color,metalness,roughness,kind='metal'){
  const m=new T.MeshStandardMaterial({color,metalness,roughness});
  m.onBeforeCompile=s=>{
    s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vSurface;').replace('#include <begin_vertex>','#include <begin_vertex>\nvSurface=position;');
    s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vSurface;').replace('#include <color_fragment>',`#include <color_fragment>
      ${kind==='wood'?'float grain=sin(vSurface.y*790.0+sin(vSurface.z*34.0)*7.0+sin(vSurface.y*86.0)*4.0); diffuseColor.rgb*=0.85+0.13*grain;':kind==='rubber'?'float check=sin(vSurface.y*3100.0+vSurface.z*2100.0)*sin(vSurface.y*3100.0-vSurface.z*2100.0);diffuseColor.rgb*=0.91+0.09*check;':'float brush=sin(vSurface.y*6900.0+sin(vSurface.z*210.0)*.3);diffuseColor.rgb*=0.96+0.025*brush;'}`);
  };m.customProgramCacheKey=()=>kind;return m;
}
const materials={steel:surface(0x454b4c,.56,.40),magsteel:surface(0x383e3e,.48,.49),wood:surface(0x82441e,.03,.48,'wood'),gripwood:surface(0x33231c,.03,.72,'wood'),silver:surface(0xabb3b1,.62,.32),rubber:surface(0x151d1a,0,.91,'rubber'),dark:surface(0x242a29,.27,.51)};
const decode=(text,Type)=>{const bytes=Uint8Array.from(atob(text),x=>x.charCodeAt(0));return new Type(bytes.buffer);};
const templates=new Map();
function template(id){if(templates.has(id))return templates.get(id);const data=REFERENCE_WEAPONS[id],parts=data.batches.map(b=>{const values=decode(b.vertices,Float32Array),interleaved=new T.InterleavedBuffer(values,8),geo=new T.BufferGeometry();geo.setAttribute('position',new T.InterleavedBufferAttribute(interleaved,3,0));geo.setAttribute('normal',new T.InterleavedBufferAttribute(interleaved,3,3));geo.setAttribute('uv',new T.InterleavedBufferAttribute(interleaved,2,6));geo.setIndex(new T.BufferAttribute(decode(b.indices,Uint16Array),1));geo.computeBoundingBox();return{part:b.part,material:materials[b.material],geo};});templates.set(id,parts);return parts;}
export function buildReferenceWeapon(r){const data=REFERENCE_WEAPONS[r.id];if(!data)return false;const barrel=new T.Group();barrel.name='fixed-polygonal-barrel';if(r.id==='deagle')r.fixed.add(barrel);
  for(const [name,pivot] of Object.entries(data.anchors))r[name].position.set(...pivot);
  for(const p of template(r.id)){const mesh=new T.Mesh(p.geo.clone(),p.material);(p.part==='barrel'?barrel:r[p.part]).add(mesh);}
  if(r.id==='ak47'){
    r.restRight.set(.010,-.078,.143);r.restLeft.set(-.015,-.030,-.176);r.ejectPort.set(.023,.032,-.042);r.muzzle.set(0,.020,-.51051);
  }else{
    r.restRight.set(.011,-.060,.063);r.restLeft.set(-.021,-.059,.050);r.ejectPort.set(.017,.027,.004);r.muzzle.set(.00093,.021,-.16667);
  }
  r.reference='Valve CS:GO Workbench geometry';r.imported=true;return true;
}
