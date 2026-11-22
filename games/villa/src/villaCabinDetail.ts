import * as THREE from 'three';
import { millSection, type Section } from './villaArchitecturalStock.js';
import { finishTexture, sample01 } from './villaWeatheredFinish.js';
import { IndexedFittingBuilder, vessel } from './villaFittingGeometry.js';
import type { VillaModelBuilder } from './villaModel.js';
import type { VillaElevatorState } from './villaElevator.js';

/** The hairline runs parallel to the long side of each folded blank. A single
 * small, mip-filtered brushing chart serves the whole lift, including in CPU GL
 * where there is no room environment map. No pictures of reflected rooms. */
export function cabinSteel() {
  const w=128,h=64, data=new Uint8Array(w*h*4);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
    const q=x/w*8, cell=Math.floor(q), t=q-cell, line=sample01(y,317),
      grain=THREE.MathUtils.lerp(sample01(cell,y),sample01((cell+1)%8,y),t*t*(3-2*t));
    const l=Math.round(209+21*line+16*grain+3*sample01(x,y)), i=4*(y*w+x);
    data[i]=l;data[i+1]=l+1;data[i+2]=l+1;data[i+3]=255;
  }
  const brush=finishTexture('cabin / drawn stainless hairline',w,h,data);
  const steel=new THREE.MeshStandardMaterial({color:'#e3e8e4',map:brush,roughness:.44,metalness:.44});
  steel.name='cabin / satin folded stainless'; return steel;
}

/** Vertical folded and hemmed liner. The side of the die and the folded stop
 * leave a real shadow joint at the back, not a black line over a solid face. */
export function linerBlank(width:number,height:number,grainOffset:number) {
  const a=width/2, section:Section=[[-a+.017,-.010],[-a+.003,-.010],[-a,-.007],[-a,-.003],[-a+.004,.001],
    [-a+.010,.003],[a-.010,.003],[a-.004,.001],[a,-.003],[a,-.007],[a-.003,-.010],[a-.017,-.010],
    [a-.017,-.007],[a-.006,-.007],[a-.005,-.005],[a-.006,-.003],[a-.011,-.001],[-a+.011,-.001],
    [-a+.006,-.003],[-a+.005,-.005],[-a+.006,-.007],[-a+.017,-.007]];
  const g=millSection('y',height,section), p=g.getAttribute('position'), uv=g.getAttribute('uv');
  for(let i=0;i<p.count;i++) uv.setXY(i,grainOffset+p.getY(i)/.68,(p.getX(i)+p.getZ(i))/.165+grainOffset);
  return g;
}

/** One continuous sill extrusion. Its two track grooves have a bottom below
 * the crown and vertical returns, rather than black strips on a flat doorstep. */
export function trackedSill(width:number, car:boolean) {
  const section:Section=car ? [[-.042,-.004],[.042,-.004],[.042,.007],[.033,.009],[.028,.009],[.028,.002],[.023,.002],[.023,.009],
    [.014,.009],[.014,.002],[.009,.002],[.009,.009],[-.003,.009],[-.006,.007],[-.009,.009],[-.017,.009],[-.020,.007],[-.023,.009],[-.034,.009],[-.042,.005]] :
    [[-.020,-.004],[.020,-.004],[.020,.004],[.014,.008],[.006,.008],[.006,.003],[.002,.003],[.002,.008],[-.006,.008],[-.006,.003],[-.010,.003],[-.010,.008],[-.017,.008],[-.020,.006]];
  return millSection('x',width,section);
}

type Legend = (b:VillaModelBuilder,row:number,x:number,y:number,z:number,w:number,h:number,yaw?:number)=>void;
/** Independent plungers in fixed, annular bezels. The five steel faces share
 * one instanced draw; their engraved legends share one four-vertex-per-key draw.
 * Both move the same 4 mm into the bore. Never register a second input handler. */
export function cabinKeys(car:IndexedFittingBuilder, steel:THREE.Material, ring:THREE.Material, rubber:THREE.Material, label:Legend) {
  const keys = [[.823,1.335,.034,3],[.823,1.230,.034,2],[.823,1.125,.034,1],
    [.788,1.020,.026,5],[.858,1.020,.026,6]] as const;
  const keysZ=-5.1835,cap=vessel([[.94,0],[1,.001],[1,.007],[.94,.010],[.83,.0115],[0,.0115]],24), pCap=cap.getAttribute('position');
  const capUV=new Float32Array(pCap.count*2);for(let i=0;i<pCap.count;i++){capUV[2*i]=.4+pCap.getX(i)*.12;capUV[2*i+1]=.53+pCap.getZ(i)*.21;}
  cap.setAttribute('uv',new THREE.BufferAttribute(capUV,2));const faces=new THREE.InstancedMesh(cap,steel,keys.length);
  faces.name='elevator-car / button plungers';faces.instanceMatrix.setUsage(THREE.DynamicDrawUsage);faces.receiveShadow=true;car.root.add(faces);
  const labels=new IndexedFittingBuilder(car.root,'elevator-car / key engravings'), dummy=new THREE.Object3D();
  for(const [x,y,r,row] of keys) {
    // Isolate the bore from the metal crown: the seal is still visible round a depressed key.
    car.geometry(vessel([[r+.001,0],[r+.009,0],[r+.010,.002],[r+.009,.005],[r+.006,.0065],[r+.003,.006],[r+.001,.004],[r+.001,0]],24),ring,[x,y,keysZ],[-Math.PI/2,0,0]);
    car.geometry(vessel([[r-.001,.001],[r+.0012,.001],[r+.0012,.004],[r-.001,.004]],20),rubber,[x,y,keysZ],[-Math.PI/2,0,0]);
    label(labels,row,x,y,keysZ-.0118,r*1.64,r*1.54,Math.PI);
  }
  labels.finish();const glyph=(labels.root.children[0] as THREE.Mesh).geometry, p=glyph.getAttribute('position');
  // Exact layout of five independent PlaneGeometry quads; the indexer must not
  // reauthor this dynamic stream. The static display lenses use a separate batch.
  delete glyph.userData.villaRigidBatch;(p as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
  let prior=-2;
  const seat=(active:number)=>{
    if(prior===active) return;prior=active;
    keys.forEach(([x,y,r],i)=>{
      const travel=i===active?.004:0;
      dummy.position.set(x,y,keysZ+travel);dummy.scale.set(r,1,r);dummy.rotation.set(-Math.PI/2,0,0);dummy.updateMatrix();faces.setMatrixAt(i,dummy.matrix);
      for(let j=4*i;j<4*i+4;j++) p.setZ(j,keysZ-.0118+travel);
    });
    p.needsUpdate=true;faces.instanceMatrix.needsUpdate=true;
  };
  seat(-1);
  // Keep ordinary frustum rejection (also at the other end of the estate).
  // The bounded key travel moves inside these conservative, car-local bounds.
  for(const moving of [faces,glyph]) {moving.computeBoundingBox();moving.computeBoundingSphere();moving.boundingBox!.max.z+=.004;moving.boundingSphere!.radius+=.004;}
  // A selected floor stays latched until arrival. Door keys briefly seat while
  // the mechanism starts, then spring back. State remains owned by the lift.
  return (s:VillaElevatorState)=>seat(s.target!==s.floor&&(s.phase==='moving'||s.phase==='closing')?2-s.target:
    s.phase==='opening'&&s.door<.30?3:s.phase==='closing'&&s.door>.70?4:-1);
}
