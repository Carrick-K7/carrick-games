import * as THREE from 'three';
import { VILLA_SUN_BYTES } from './villaSunSurveyData.js';

/** The software bridge does not render a live shadow pass. Its outdoor sun uses a baked
 * orthographic depth field of the *actual fixed meshes*, including their cut-out leaves.
 * It is not a painted contact blob, and never freezes vehicles, animals or doors in place.
 * Hardware uses live shadows inside its measured shadow-camera window and this static
 * field only outside that window. It never applies the two direct shadows together. */
export const VILLA_SUN_FIELD={left:-48,top:-70,width:128,depth:256,cols:1024,rows:2048,minY:-2,maxY:16,dx:-24/26,dz:24/26} as const;
export function unpackSurvey(data:Uint8Array,size:number){
  const out=new Uint8Array(size);let i=0,n=0;
  while(i<data.length){const k=data[i++]!,len=(k&127)+1;if(n+len>size)throw new Error('oversized solar survey record');
    if(k&128){if(i>=data.length)throw new Error('incomplete solar survey run');out.fill(data[i++]!,n,n+len);}
    else {if(i+len>data.length)throw new Error('incomplete solar survey literal');out.set(data.subarray(i,i+len),n);i+=len;}n+=len;}
  if(n!==size)throw new Error('incomplete solar survey');return out;
}
export function addSurveyedSun(root:THREE.Scene){
  if(!VILLA_SUN_BYTES)return null;
  const f=VILLA_SUN_FIELD,bytes=Uint8Array.from(atob(VILLA_SUN_BYTES),c=>c.charCodeAt(0));
  const map=new THREE.DataTexture(unpackSurvey(bytes,f.rows*f.cols),f.cols,f.rows,THREE.RedFormat);map.name='estate/static-sun-heights';map.generateMipmaps=false;map.minFilter=map.magFilter=THREE.NearestFilter;map.needsUpdate=true;
  const strength={value:.90}, seen=new Set<THREE.Material>();
  const fn=`uniform sampler2D villaSunDepth; uniform float villaSunStrength; varying vec3 vEstateSun;
    float villaSunLit(vec2 p,float y){float h=texture2D(villaSunDepth,p).r;return 1.0-smoothstep(.02,.19,(h*${f.maxY-f.minY}.0+(${f.minY}.0))-y);}
    float estateSolarVisibility(){vec3 p=vEstateSun;
      if (p.y<7.16 && ((p.x>-24.25 && p.x<28.25 && p.z>-18.25 && p.z<9.02) || (p.x>28.15 && p.x<51.05 && p.z>-12.05 && p.z<2.04))) return 1.0;
      vec2 u=(p.xz-vec2(${f.dx},${f.dz})*p.y-vec2(${f.left}.0,${f.top}.0))/vec2(${f.width}.0,${f.depth}.0);
      if(any(lessThan(u,vec2(.001)))||any(greaterThan(u,vec2(.999))))return 1.;
      vec2 sz=vec2(${f.cols}.0,${f.rows}.0),px=u*sz-.5,fractXY=fract(px),q=(floor(px)+.5)/sz,stepUV=1./sz;float plane=p.y+.075;
      float sun=mix(mix(villaSunLit(q,plane),villaSunLit(q+vec2(stepUV.x,0.),plane),fractXY.x),mix(villaSunLit(q+vec2(0.,stepUV.y),plane),villaSunLit(q+stepUV,plane),fractXY.x),fractXY.y);
      return mix(1.,sun,villaSunStrength);
    }`;
  const reference='getDirectionalLightInfo( directionalLight, directLight );';
  const lights=THREE.ShaderChunk.lights_fragment_begin.replace(reference,reference+`\n{
    #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
      vec3 sunWindow = vDirectionalShadowCoord[0].xyz / vDirectionalShadowCoord[0].w;
      if (!all(greaterThanEqual(sunWindow,vec3(0.))) || !all(lessThanEqual(sunWindow,vec3(1.)))) directLight.color *= estateSolarVisibility();
    #else
      directLight.color *= estateSolarVisibility();
    #endif
  }`);
  const wireReceiver=(mat:THREE.Material)=>{
      if(seen.has(mat)||(!(mat instanceof THREE.MeshStandardMaterial)&&!(mat instanceof THREE.MeshLambertMaterial)&&!(mat instanceof THREE.MeshPhongMaterial)))return;seen.add(mat);
      const prev=mat.onBeforeCompile.bind(mat),key=mat.customProgramCacheKey();
      mat.onBeforeCompile=(shader,renderer)=>{prev(shader,renderer);shader.uniforms.villaSunDepth={value:map};shader.uniforms.villaSunStrength=strength;
        shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vEstateSun;').replace('#include <project_vertex>',`#include <project_vertex>
          vec4 vSunLocal=vec4(transformed,1.0);
          #ifdef USE_INSTANCING
            vSunLocal=instanceMatrix*vSunLocal;
          #endif
          vEstateSun=(modelMatrix*vSunLocal).xyz;`);
        shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+fn).replace('#include <lights_fragment_begin>',lights);};
      mat.customProgramCacheKey=()=>key+'|estate-survey-v1';mat.needsUpdate=true;
  };
  root.traverse(object=>{if(object instanceof THREE.Mesh&&object.receiveShadow)for(const mat of Array.isArray(object.material)?object.material:[object.material])wireReceiver(mat);});
  return{map,strength,wireReceiver,dispose(){seen.clear();map.dispose();}};
}
