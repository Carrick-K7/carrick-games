import * as THREE from 'three';

export type InteriorStock = 'oak' | 'walnut' | 'limestone';
export const TIMBER_METRES = [1.8,.18] as const;
const grainSeed = (n:number) => { const h=Math.imul(n^(n>>>15),0x45d9f3b);return ((h^(h>>>16))>>>0)/4294967296; };
export function insideOccupiedFabric(x:number,y:number,z:number) {
  return y<7.16 && y>=-.015 && ((x>=-24.20 && x<=28.2 && z>=-18.2 && z<=9) || (x>=28.15 && x<=51.05 && z>=-12.05 && z<=2.04 && y<3.43));
}
/** Chart one workpiece before it is turned and set in the room. Opposed sawn
 * cheeks use the same gauge; the thin edge doesn't receive a whole board image.
 * The secondary channel distinguishes end/face grain and indoor/outdoor members
 * sharing a single material batch. It does not reserve a second geometry/pass. */
export function chartMillStock(g:THREE.BufferGeometry, stock:InteriorStock, inside:boolean, part:number, manual=false) {
  const p=g.getAttribute('position'), n=g.getAttribute('normal'), uv=g.getAttribute('uv');
  const flags=new Float32Array(2*p.count);
  if(!inside){for(let i=0;i<p.count;i++)flags[2*i]=-1;g.setAttribute('uv1',new THREE.BufferAttribute(flags,2));return;}
  g.computeBoundingBox();const box=g.boundingBox!,size=box.getSize(new THREE.Vector3());
  const axis=size.y>size.x&&size.y>size.z?1:size.z>size.x?2:0;
  const phase=grainSeed(part*61+5), across=grainSeed(part*31+1), tint=.85+.15*grainSeed(part*17+7);
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i)),nz=Math.abs(n.getZ(i));
    const end=stock!=='limestone' && (axis===0?nx:axis===1?ny:nz)>.86;
    if(!manual){
      if(stock==='limestone'){uv.setXY(i,(nx>ny&&nx>nz?z:x)+phase,(ny>nx&&ny>nz?z:y)+across);}
      else {const along=axis===0?x:axis===1?y:z, a=axis===0?z:x,b=axis===1?z:y;
        uv.setXY(i,end?a+phase:along/TIMBER_METRES[0]+phase,end?b+across:(a+b)/TIMBER_METRES[1]+across);}
    }
    flags[2*i]=tint;flags[2*i+1]=end&&!manual?1:0;
  }
  g.setAttribute('uv1',new THREE.BufferAttribute(flags,2));
}
export function tagMillMaterial(m:THREE.MeshStandardMaterial,kind:InteriorStock){m.userData.villaMillStock=kind;return m;}

/** Keep the previous finish outside. The table maker, hedge, terrace and moving
 * scene still share the old material slots; a single identical shader handles all
 * instances of its kind. Install after the position/box/rigid triangle analysis. */
export function bindMillMaterial(m:THREE.MeshStandardMaterial,swatch:THREE.Texture,kind:InteriorStock){
  const prev=m.onBeforeCompile.bind(m), key=m.customProgramCacheKey();
  m.onBeforeCompile=(s,renderer)=>{prev(s,renderer);s.uniforms.villaMillMap={value:swatch};
    s.uniforms.villaMillStain={value:new THREE.Color(kind==='walnut'?0x9b775a:kind==='oak'?0xf1e8db:0xf3eee4)};
    s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\n#ifndef USE_UV1\nattribute vec2 uv1;\n#endif\nvarying vec4 vMill;')
      .replace('#include <uv_vertex>','#include <uv_vertex>\n vMill=vec4(uv,uv1);');
    s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D villaMillMap;uniform vec3 villaMillStain;varying vec4 vMill;')
      .replace('#include <map_fragment>',`if(vMill.z<0.) {\n#include <map_fragment>\n} else {\n  vec3 face=texture2D(villaMillMap,vMill.xy).rgb;\n  if(vMill.w>.5){vec2 q=vMill.xy*vec2(1.,1.12);float age=length(q)*310.+.8*sin(q.x*16.);float ring=cos(age)*(.7+.3*cos(.47*age));face*=.89+.11*ring/(1.+fwidth(age));}\n  diffuseColor.rgb=villaMillStain*face*vMill.z;\n}`);
  };m.customProgramCacheKey=()=>key+'|domestic-workpiece';m.needsUpdate=true;
}
