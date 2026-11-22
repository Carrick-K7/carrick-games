import * as THREE from 'three';
import { VillaModelBuilder } from './villaModel.js';
import { slabFaces, type Section } from './villaArchitecturalStock.js';
import { gardenReflection, reflectedFieldGLSL } from './villaWeatheredFinish.js';

/** The seal is inside the insulating unit, behind the real pressure cap.
 * Encode facing in the pane's UV island. Ordinary guard/partition UVs [0,1]
 * remain clear; looking OUT through a window does not mirror an outdoor tree. */
export function exteriorPane(w:number,h:number,depth:number) {
  const g=new THREE.BoxGeometry(w,h,depth), n=g.getAttribute('normal'), uv=g.getAttribute('uv');
  for(let i=0;i<uv.count;i++) {
    const face=n.getZ(i);
    uv.setX(i,uv.getX(i)+(face>.5?3:face<-.5?6:9));
  }
  return g;
}
export function fitExteriorGlass(root:THREE.Object3D, glass:THREE.MeshStandardMaterial) {
  glass.map=gardenReflection(root); glass.side=THREE.FrontSide; glass.depthWrite=false;
  glass.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>', '// One angular field across all fixed lights, not a map pasted into each frame.')
      .replace('#include <opaque_fragment>', `
        if (vMapUv.x >= 2.5) {
          bool outside = vMapUv.x < 4.5;
          if (outside) {
            ${reflectedFieldGLSL}
            // A neutral solar-control outer ply: still transmissive straight on,
            // strongly reflective looking along the facade. Lighting follows time.
            diffuseColor.a = .43 + .46 * glancing;
            outgoingLight = gardenLight * vec3(.74,.88,.90) + totalSpecular*.22;
          } else if (vMapUv.x < 7.5) {
            diffuseColor.a *= .73;
          } else {
            outgoingLight *= vec3(.36,.66,.54); diffuseColor.a=.64;
          }
          if (vMapUv.x < 7.5) {
            vec2 p=vec2(vMapUv.x-(outside?3.:6.),vMapUv.y);
            vec2 edge=min(p,vec2(1.)-p);
            float gasket=1.-smoothstep(.012,.017,min(edge.x,edge.y*1.65));
            outgoingLight=mix(outgoingLight,outgoingLight*vec3(.19,.26,.22),gasket);
            diffuseColor.a=mix(diffuseColor.a,.79,gasket);
          }
        }
        #include <opaque_fragment>`);
  };
  glass.customProgramCacheKey=()=>'villa-insulating-glass-v1';
}

/** A folded cap over a recessed roof edge. Four straight sides share the actual
 * mitres; no overlapping flush boxes or razor-thin decorative lines at corners. */
export function flashedRoof(b:VillaModelBuilder,x:number,y:number,z:number,w:number,h:number,d:number,
  roof:THREE.Material, metal:THREE.Material) {
  const half=h/2, top=y+half;
  b.geometry(slabFaces(x,y-.009,z,w-.092,h-.018,d-.092),roof);
  // [offset from nominal edge, height relative to roof top]. The lower hem
  // turns under clear of the fascia, leaving the drip in air, not on plaster.
  const profile:Section=[[-.077,-.018],[-.077,0],[-.004,0],[.010,-.011],[.010,-.048],
    [.019,-.056],[.013,-.066],[.002,-.059],[-.002,-.050],[-.007,-.019],[-.077,-.018]];
  const positions:number[]=[], tex:number[]=[];
  const ring=(r:number,height:number):[number,number,number][]=>[
    [x-w/2-r,top+height,z-d/2-r],[x+w/2+r,top+height,z-d/2-r],
    [x+w/2+r,top+height,z+d/2+r],[x-w/2-r,top+height,z+d/2+r]];
  for(let k=1;k<profile.length;k++){
    const a=ring(...profile[k-1]), c=ring(...profile[k]);
    for(let i=0;i<4;i++){
      const j=(i+1)%4;
      for(const p of [a[i],a[j],c[j],a[i],c[j],c[i]]){
        positions.push(...p);tex.push((i%2?p[2]:p[0])/2.5,p[1]/2.5);
      }
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(tex,2));g.computeVertexNormals();b.geometry(g,metal);
}
