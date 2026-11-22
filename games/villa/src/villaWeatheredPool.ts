import * as THREE from 'three';
import { POOL } from './villaEstateLayout.js';
import { POOL_CREST_GLSL, POOL_OPTICS_GLSL, POOL_RIPPLE_METRES, type PoolCirculation } from './villaPoolCirculation.js';
import { clamp01, sample01, finishTexture, gardenReflection, reflectedFieldGLSL } from './villaWeatheredFinish.js';

export const POOL_TILE_SHEET = 8 * .10;
const [RIPPLE_X,RIPPLE_Z] = POOL_RIPPLE_METRES;
const tau = 2 * Math.PI;

/** An original 8x8 sheet of fired, submerged celadon tiles. Mortar is 3.5 mm,
 * not a white outline. The glaze pools at the edges of each individual tile.
 * One seamless tangent normal/caustic field for surface AND bottom; no video,
 * network image, render target or repaint during play. */
export function createVillaPoolFinishMaps() {
  const size = 256, chips = new Uint8Array(4 * size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = 4 * (y * size + x), a = x >> 5, b = y >> 5;
    const inner = Math.min((x % 32) + .5, 31.5 - (x % 32), (y % 32) + .5, 31.5 - (y % 32));
    const glaze = clamp01((inner - .13) / 1.02), pool = Math.max(0, 1 - Math.abs(inner - 1.8) / 2.7);
    const glazeRun = sample01(a, b + 73), kiln = 32 * (sample01(a + 19, b) - .5);
    const tone = kiln + 4 * Math.sin(tau * (x * 5 - y * 3) / size) + 2.7 * Math.sin(tau * (x * 8 + y * 5) / size) + 3 * (sample01(x, y) - .5) - 11 * pool;
    chips[i] = 150 + glaze * (104 + tone + 17 * glazeRun - 150);
    chips[i+1] = 157 + glaze * (156 + tone - 157);
    chips[i+2] = 144 + glaze * (149 + tone - 7 * glazeRun - 144); chips[i+3] = 255;
  }
  const n = 128, ripples = new Uint8Array(4 * n * n);
  // Periodic, intersecting windlets at three lengths. Derivatives are evaluated
  // on the *same* field instead of painting white squiggles onto a blue plane.
  const elevation = (u: number, v: number) => .009 * Math.sin(tau * (2*u + 3*v) + .77 * Math.sin(tau * (u - v)))
    + .006 * Math.sin(tau * (4*u - 2*v) + .65 * Math.sin(tau * (2*v + u)))
    + .0028 * Math.sin(tau * (7*v - 3*u) + .89 * Math.sin(tau * (u + v)));
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = (x + .5) / n, v = (y + .5) / n, e = 1/n, i = 4 * (y*n + x);
    const left = elevation(u-e,v), right = elevation(u+e,v), down = elevation(u,v-e), up = elevation(u,v+e), centre = elevation(u,v);
    const dx = (left-right) / (2 * e * RIPPLE_X), dy = (down-up) / (2 * e * RIPPLE_Z), len = Math.hypot(dx,dy,1);
    ripples[i] = 127.5*(1+dx/len); ripples[i+1] = 127.5*(1+dy/len); ripples[i+2] = 127.5*(1+1/len);
    const focus = -(left + right - 2*centre)/(e*RIPPLE_X)**2 - (up + down - 2*centre)/(e*RIPPLE_Z)**2;
    // Broad penumbrae between narrow caustic crests, not regularly spaced sinusoidal stripes.
    ripples[i+3] = Math.round(255 * (1 / (1 + (3 * (focus - .51))**2)));
  }
  return {tile: finishTexture('pool/kiln-glazed-tesserae',size,size,chips), ripple: finishTexture('pool/capillary-normal-focus',n,n,ripples,false)};
}

export function glazedBasin(tile: THREE.Texture, ripple: THREE.Texture, flow: PoolCirculation) {
  const ceramic = new THREE.MeshLambertMaterial({map:tile}); ceramic.name = 'pool/fired-mosaic';
  ceramic.onBeforeCompile = shader => {
    shader.uniforms.poolNormalFocus = { value: ripple }; shader.uniforms.poolPhase = flow.phase; shader.uniforms.poolRain=flow.rain;
    shader.vertexShader = shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 basinPosition;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nbasinPosition = position;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>',`#include <common>
        varying vec3 basinPosition; uniform sampler2D poolNormalFocus; ${POOL_OPTICS_GLSL}`)
      .replace('#include <map_fragment>',`
        float poolDepth = clamp((-.034 - basinPosition.y)/.94, 0., 1.);
        vec2 surfaceMetres = vec2(basinPosition.x - ${POOL.minX.toFixed(2)}, ${POOL.maxZ.toFixed(2)} - basinPosition.z);
        // Move the sampling footprint a little with depth, not the stone geometry.
        vec3 wav = poolOptics(poolNormalFocus,surfaceMetres + poolDepth * vec2(.063,-.081));
        vec2 distortion = wav.xy * (.012 + .17 * poolDepth);
        vec3 glaze = texture2D(map, vMapUv + distortion).rgb;
        float directSun = 0.;
        #if NUM_DIR_LIGHTS > 0
          directSun = clamp(dot(directionalLights[0].color, vec3(.25,.58,.17))*.62, 0., 1.);
        #endif
        // Water attenuates red with path length. The floor stays opaque; the water
        // above separately reflects the sky and reveals the real ladder depth.
        // The datum is the unfolded cove length: one whole darker firing below
        // the waterline, terminating on the tile joints rather than halfway across a tile.
        float border = smoothstep(-.232,-.228,basinPosition.y) * (1.-smoothstep(-.132,-.128,basinPosition.y));
        diffuseColor.rgb *= glaze * mix(vec3(1.),vec3(.57,.76,.74),border)
          * mix(vec3(1.),vec3(.70,.95,.93),poolDepth) * (1.0 + (.61*wav.z - .16)*directSun*poolDepth);
      `);
  };
  ceramic.customProgramCacheKey = ()=>'villa-submerged-glaze-flow-v2'; return ceramic;
}
export function surfaceWater(root: THREE.Object3D, ripple: THREE.Texture, w: number, l: number, flow:PoolCirculation) {
  ripple.repeat.set(w/RIPPLE_X,l/RIPPLE_Z);
  const paint = new THREE.MeshPhongMaterial({color:0x659a91, specular:0xd6dcd5, shininess:82, normalMap:ripple, normalScale:new THREE.Vector2(.76,.76),
    map:gardenReflection(root), transparent:true, opacity:.18, depthWrite:false});
  paint.name='pool/air-water-interface'; paint.onBeforeCompile = shader => {
    shader.uniforms.poolPhase=flow.phase;shader.uniforms.poolRain=flow.rain;
    shader.vertexShader = shader.vertexShader.replace('#include <common>',`#include <common>\n${POOL_CREST_GLSL}\nvarying vec2 poolSurfaceMetres;`)
      .replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>\nvec3 poolRelief=poolCrest(position.xy);objectNormal=normalize(vec3(-poolRelief.xy,1.));`)
      .replace('#include <begin_vertex>',`#include <begin_vertex>\ntransformed.z=poolRelief.z;poolSurfaceMetres=position.xy+vec2(${(w/2).toFixed(4)},${(l/2).toFixed(4)});`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec2 poolSurfaceMetres;\n${POOL_OPTICS_GLSL}`)
      .replace('#include <map_fragment>', '// map describes incident skylight, not surface pigment')
      .replace('#include <normal_fragment_maps>',`vec2 fineSlope=poolOptics(normalMap,poolSurfaceMetres).xy;
        normal=normalize(tbn*normalize(vec3(fineSlope*normalScale,1.)));`)
      .replace('#include <opaque_fragment>', `${reflectedFieldGLSL}
        float reflected = .024 + .93 * glancing;
        // Reflection and transmissive water colour are mixed in linear light;
        // actual tile/steps show through the other fraction of this one-sided skin.
        diffuseColor.a = .13 + reflected * .85;
        outgoingLight = mix(outgoingLight * .64, gardenLight, reflected / diffuseColor.a)
          + reflectedLight.directSpecular * .28;
        #include <opaque_fragment>`);
  };
  paint.customProgramCacheKey=()=>'villa-pool-air-interface-flow-v2'; return paint;
}
