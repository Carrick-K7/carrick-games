import * as THREE from 'three';
import { POOL } from './villaEstateLayout.js';

const W=POOL.maxX-POOL.minX,L=POOL.maxZ-POOL.minZ;
export const POOL_SURFACE_Y=-.035;
export const POOL_RIPPLE_METRES=[2.80,2.32] as const;
const TAU=2*Math.PI;
const cycle=(t:number,seconds:number)=>(t%seconds)/seconds;
/** Hand the SAME phases to the water and submerged tile. The two material variants
 * never own competing timers. Modulo moves by whole texture repeats or a whole
 * turn, so a long play session cannot accumulate UV jitter or jump at the seam. */
export function poolCirculation(){
  const phase={value:new THREE.Vector4()},rain={value:0};
  return {phase,rain,update(elapsed:number,rainLevel=0){
    if(!Number.isFinite(elapsed))return;
    const t=Math.max(0,elapsed);
    phase.value.set(cycle(t,23),cycle(t,71),cycle(t,39),cycle(t,5.8));
    if(Number.isFinite(rainLevel))rain.value=Math.max(0,Math.min(1,rainLevel));
  }};
}
export type PoolCirculation=ReturnType<typeof poolCirculation>;
/** Canonical clear-water surface at t=0 for bounds, tooling and the initial mesh.
 * Mesh distances are metres from the middle of the water plane in its local XY. */
export function restingPoolHeight(x:number,y:number){
  const margin=Math.min(W/2-Math.abs(x),L/2-Math.abs(y)),t=Math.min(1,Math.max(0,margin/.48));
  return t*t*(3-2*t)*(.008*Math.sin(2.94*x+3.1*y)+.005*Math.cos(4.28*x-2.4*y));
}
export const POOL_PHASES_GLSL='uniform vec4 poolPhase; uniform float poolRain;';
const dims=`vec2(${W.toFixed(2)},${L.toFixed(2)})`;
export const POOL_CREST_GLSL=`${POOL_PHASES_GLSL}
  vec3 poolCrest(vec2 p){
    vec2 toEdge=.5*${dims}-abs(p);
    float k=clamp(min(toEdge.x,toEdge.y)/.48,0.,1.);
    float edge=k*k*(3.-2.*k), rate=6.*k*(1.-k)/.48;
    vec2 gradEdge=rate*(toEdge.x<toEdge.y ? vec2(-sign(p.x),0.) : vec2(0.,-sign(p.y)));
    float a=dot(p,vec2(2.94,3.10))-${TAU}*poolPhase.w;
    float b=dot(p,vec2(4.28,-2.40))+${TAU}*poolPhase.z;
    float h=.008*sin(a)+.005*cos(b);
    vec2 gradient=.008*cos(a)*vec2(2.94,3.10)-.005*sin(b)*vec2(4.28,-2.40);
    return vec3(edge*gradient+h*gradEdge,h*edge)*(1.+.18*poolRain);
  }`;
/** Gentle crossing wave trains. Four modeled wall return nozzles project to the
 * two bands at 22% and 78% along the basin. Only there does inward shear curl
 * the ripples. Never translate the rim, grout, lily pads or specular highlight. */
export const POOL_OPTICS_GLSL=`${POOL_PHASES_GLSL}
  vec3 poolOptics(sampler2D slopes,vec2 metres){
    vec2 span=${dims},q=metres/vec2(${POOL_RIPPLE_METRES[0]},${POOL_RIPPLE_METRES[1]});
    float wall=min(metres.x,span.x-metres.x);
    float lane=min(abs(metres.y-.22*span.y),abs(metres.y-.78*span.y));
    float jet=(1.-smoothstep(.15,1.9,wall))*(1.-smoothstep(.10,1.15,lane));
    float kick=jet*sin(wall*4.2+metres.y*1.15-${TAU}*poolPhase.w);
    vec2 bend=vec2((metres.x<span.x*.5?1.:-1.)*.062*kick,.021*kick);
    vec4 a=texture2D(slopes,q-poolPhase.xy+bend);
    const mat2 turn=mat2(.8,-.6,.6,.8);
    vec4 b=texture2D(slopes,(turn*q)*1.29+vec2(.27,.43)+vec2(poolPhase.z,-poolPhase.x)-.55*bend);
    vec2 mainSlope=2.*a.rg-1.,crossSlope=transpose(turn)*(2.*b.rg-1.);
    return vec3((.78*mainSlope+.38*crossSlope)*(1.+.36*jet+.28*poolRain),
      clamp(.73*a.a+.38*b.a+.12*a.a*b.a,0.,1.));
  }`;
