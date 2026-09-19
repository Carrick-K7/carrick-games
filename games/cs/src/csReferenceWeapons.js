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
const materials={steel:surface(0x3c4345,.56,.40),magsteel:surface(0x303639,.48,.49),wood:surface(0x663b24,.03,.60,'wood'),gripwood:surface(0x33231c,.03,.72,'wood'),silver:surface(0xabb3b1,.62,.32),rubber:surface(0x151d1a,0,.91,'rubber'),dark:surface(0x242a29,.27,.51),polymer:surface(0x353c34,.05,.83,'rubber'),smoke:surface(0x756b3d,.09,.43),sand:surface(0x9c9584,.23,.71),glass:surface(0x204357,.4,.21)};
const decode=(text,Type)=>{const bytes=Uint8Array.from(atob(text),x=>x.charCodeAt(0));return new Type(bytes.buffer);};
materials.novaPolymer=surface(0x252a29,.02,.84,'rubber');
materials.olive=surface(0x60654a,.02,.82,'rubber');
materials.strap=surface(0x34362d,0,.96,'rubber');
const templates=new Map();
function template(id){if(templates.has(id))return templates.get(id);const data=REFERENCE_WEAPONS[id],parts=data.batches.map(b=>{const values=decode(b.vertices,Float32Array),interleaved=new T.InterleavedBuffer(values,8),geo=new T.BufferGeometry();geo.setAttribute('position',new T.InterleavedBufferAttribute(interleaved,3,0));geo.setAttribute('normal',new T.InterleavedBufferAttribute(interleaved,3,3));geo.setAttribute('uv',new T.InterleavedBufferAttribute(interleaved,2,6));geo.setIndex(new T.BufferAttribute(decode(b.indices,Uint16Array),1));geo.computeBoundingBox();return{part:b.part,material:materials[b.material],geo};});templates.set(id,parts);return parts;}
export function buildReferenceWeapon(r){const data=REFERENCE_WEAPONS[r.id];if(!data)return false;const barrel=new T.Group();barrel.name='fixed-polygonal-barrel';if(r.id==='deagle')r.fixed.add(barrel);
  if(data.anchors.suppressor){r.suppressor=new T.Group();r.suppressor.name='removable-suppressor';r.fixed.add(r.suppressor);}
  for(const [name,pivot] of Object.entries(data.anchors))r[name].position.set(...pivot);
  for(const p of template(r.id)){const mesh=new T.Mesh(p.geo.clone(),p.material);(p.part==='barrel'?barrel:r[p.part]).add(mesh);}
  if(r.id==='ak47'){
    r.restRight.set(.010,-.078,.143);r.restLeft.set(-.010,-.034,-.151);r.ejectPort.set(.023,.032,-.042);r.muzzle.set(0,.020,-.51051);
    r.supportGrip='underhand';r.magGrip=new T.Vector3(-.013,-.059,-.002);
    r.magHinge=new T.Vector3(0,.042,-.003);
  }else if(r.id==='awp'){
    r.restRight.set(.012,-.103,.184);r.restLeft.set(-.015,-.022,-.165);r.ejectPort.set(.022,.025,.012);r.muzzle.set(0,.020,-.85268);
    r.supportGrip='underhand';r.magGrip=new T.Vector3(-.014,-.035,0);
  }else if(r.id==='g3sg1'){
    r.restRight.set(.012,-.090,.142);r.restLeft.set(-.016,-.013,-.173);r.ejectPort.set(.022,.026,.010);r.muzzle.set(0,.020,-.58623);
    r.supportGrip='underhand';r.magGrip=new T.Vector3(-.012,-.072,0);
  }else if(r.id==='tmp'){
    r.restRight.set(.013,-.061,.071);r.restLeft.set(-.014,-.057,-.071);r.ejectPort.set(.020,.028,-.018);r.muzzle.set(0,.020,-.14882);
    r.supportGrip='vertical';r.magGrip=new T.Vector3(-.012,-.077,0);
  }else if(r.id==='m249'){
    r.restRight.set(.012,-.099,.185);r.restLeft.set(-.023,-.042,-.177);r.ejectPort.set(.026,.020,-.047);r.muzzle.set(0,.020,-.648);
    r.supportGrip='underhand';r.magGrip=new T.Vector3(-.058,-.090,0);
  }else if(r.id==='glock'){
    r.restRight.set(.012,-.054,.053);r.restLeft.set(-.022,-.049,.015);r.ejectPort.set(.014,.020,.005);r.muzzle.set(0,.020,-.111);
    r.supportGrip='pistol';r.magGrip=new T.Vector3(-.012,-.032,0);
  }else if(r.id==='p90'){
    r.restRight.set(.013,-.062,.069);r.restLeft.set(-.018,-.067,-.077);r.ejectPort.set(0,-.068,.206);r.muzzle.set(0,.020,-.18842);
    r.supportGrip='loop';r.magGrip=new T.Vector3(-.026,.009,0);
  }else if(r.id==='mp5'){
    r.restRight.set(.012,-.078,.129);r.restLeft.set(-.014,-.030,-.161);r.ejectPort.set(.022,.034,.008);r.muzzle.set(0,.020,-.49385);
    r.supportGrip='underhand';r.magGrip=new T.Vector3(-.016,-.057,-.006);
  }else if(r.id==='scout'){
    r.restRight.set(.012,-.103,.194);r.restLeft.set(-.018,-.025,-.164);r.ejectPort.set(.026,.026,.040);r.muzzle.set(0,.020,-.72217);
    r.supportGrip='underhand';r.magGrip=new T.Vector3(-.018,.0,.0);
  }else if(r.id==='sg552'){
    r.restRight.set(.011,-.085,.131);r.restLeft.set(-.014,-.037,-.216);r.ejectPort.set(.024,.029,-.027);r.muzzle.set(-.00012,.020,-.55750);
    r.supportGrip='underhand';r.magGrip=new T.Vector3(-.017,-.050,-.004);
    r.magHinge=new T.Vector3(0,.037,-.006);
  }else if(r.id==='aug'){
    r.restRight.set(.012,-.077,.107);r.restLeft.set(-.014,-.070,-.082);r.ejectPort.set(.032,.034,.003);r.muzzle.set(0,.020,-.33920);
    r.supportGrip='vertical';r.magGrip=new T.Vector3(-.014,-.075,-.004);
  }else if(r.id==='mac10'){
    r.restRight.set(.012,-.061,.052);r.restLeft.set(-.017,-.036,-.113);r.ejectPort.set(.020,.021,.020);r.muzzle.set(0,.020,-.16535);
    r.supportGrip='vertical';r.magGrip=new T.Vector3(-.013,-.090,0);
  }else if(r.id==='m4a1'){
    r.restRight.set(.013,-.094,.127);r.restLeft.set(-.016,-.033,-.180);r.ejectPort.set(.025,.017,-.016);r.muzzle.set(-.001,.020,-.7356);
    r.muzzleBare=new T.Vector3(0,.020,-.525);r.supportGrip='underhand';r.magGrip=new T.Vector3(-.016,-.073,0);
  }else if(r.id==='usp'){
    r.restRight.set(.012,-.065,.067);r.restLeft.set(-.023,-.064,.022);r.ejectPort.set(.014,.027,-.007);r.muzzle.set(0,.020,-.3373);
    r.muzzleBare=new T.Vector3(0,.020,-.141);r.supportGrip='pistol';r.magGrip=new T.Vector3(-.013,-.034,.007);
  }else if(r.id==='m3'){
    r.restRight.set(.012,-.047,.138);r.restLeft.set(-.014,-.040,-.180);r.ejectPort.set(.018,.017,-.037);r.muzzle.set(0,.020,-.56012);
    r.supportGrip='underhand';r.shellLoadPoint=new T.Vector3(0,-.028,-.025);
  }else if(r.id==='xm1014'){
    r.restRight.set(.013,-.075,.143);r.restLeft.set(-.013,-.034,-.180);r.ejectPort.set(.024,.012,-.030);r.muzzle.set(0,.020,-.512);
    r.supportGrip='underhand';r.shellLoadPoint=new T.Vector3(0,-.028,-.023);
  }else{
    r.restRight.set(.011,-.060,.063);r.restLeft.set(-.021,-.059,.050);r.ejectPort.set(.017,.027,.004);r.muzzle.set(.00093,.021,-.16667);
  }
  r.reference='Valve CS:GO Workbench geometry';r.imported=true;return true;
}
