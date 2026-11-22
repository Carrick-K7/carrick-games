import * as THREE from 'three';
import { VILLA_CONTACT_BYTES } from './villaInteriorContactData.js';
import { VILLA_INDOOR_CONTACT_GRID as g } from './villaInteriorContactGrid.js';

export function createIndoorContacts(unpack:(src:Uint8Array,expected:number)=>Uint8Array){
  const size=g.w*g.h,field=unpack(Uint8Array.from(atob(VILLA_CONTACT_BYTES),c=>c.charCodeAt(0)),size*4),pixels=new Uint8Array(field.length);
  for(let f=0;f<2;f++)for(let i=0;i<size;i++){
    pixels[2*(f*size+i)]=field[(f*2)*size+i]!;pixels[2*(f*size+i)+1]=field[(f*2+1)*size+i]!;
  }
  const map=new THREE.DataTexture(pixels,g.w,g.h*2,THREE.RGFormat);map.name='villa/fixed-floor-irradiance-and-sun';map.minFilter=map.magFilter=THREE.LinearFilter;map.generateMipmaps=false;map.needsUpdate=true;return map;
}
export const VILLA_FLOOR_CONTACT_GLSL=`uniform sampler2D villaFloorContact;
 vec2 villaFixedFloor(vec3 p,float inRoom){
    if(inRoom<.5 || p.y>=7.1)return vec2(1.0);
    float level=p.y>=3.5?1.:0.,h=p.y-3.6*level;
    if(h<-.02 || h>.18)return vec2(1.0);
    vec2 u=(p.xz-vec2(${g.x0},${g.z0}))/vec2(${g.w*g.p},${g.h*g.p});
    if(any(lessThan(u,vec2(.001)))||any(greaterThan(u,vec2(.999))))return vec2(1.0);
    // Decay away from the receiver plane; no phantom shadow on high shelves,
    // moving leaves or the underside of the floor above. No lookup outdoors.
    return mix(texture2D(villaFloorContact,vec2(u.x,(level+u.y)*.5)).rg,vec2(1.0),smoothstep(.041,.18,h));
 }`;
