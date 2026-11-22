import * as THREE from 'three';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import { millSection, turnSection, type Section } from './villaArchitecturalStock.js';
import { glazedBasin, surfaceWater } from './villaWeatheredPool.js';
import { clamp01, dressedCourses, exteriorTimber, stoneTint } from './villaWeatheredFinish.js';
import { linedPool, poolDeck } from './villaExteriorBuildPool.js';
import { courseSurface } from './villaFloorFinish.js';
import { POOL, VILLA_WEST_WALL as W, VILLA_GARAGE_EXTENT as G } from './villaEstateLayout.js';
import { makePathLantern } from './villaLightFixtures.js';
import { createEntryPaving, ENTRY_LANTERNS } from './villaForecourt.js';
import type { VillaSurfaces } from './villaEnvelope.js';

/** Equipment remains outside the analytically unsupported water rectangle. No ladder or
 * drain creates a new step, no visual fill caps the basin or occupies a lounger footprint. */
export function createVillaPoolside(parent:THREE.Object3D,m:VillaSurfaces,tileMap:THREE.Texture,ripple:THREE.Texture, gardenLight:THREE.Material) {
  const b=new VillaModelBuilder(parent,'villa-terraces-and-pool'), w=POOL.maxX-POOL.minX,l=POOL.maxZ-POOL.minZ;
  const cx=(POOL.minX+POOL.maxX)/2,cz=(POOL.minZ+POOL.maxZ)/2;
  const ceramic=glazedBasin(tileMap,ripple), steel=villaMaterial('#b7c2be',.29,.49);
  const deep=villaMaterial('#454d46',.81), grout=villaMaterial('#8d8574',.97);
  const copingStone=m.stone.clone(); copingStone.vertexColors=true; copingStone.roughness=.85; copingStone.name='exterior/honed-limestone';
  function pave(x:number,top:number,z:number,width:number,depth:number,brick:number,row:number,planted=false){
    b.box(x,top-.033,z,width,.050,depth,grout,0);
    const flags=courseSurface(x,top,z,width,depth,brick,row,.009,.005);
    if(planted) b.geometry(dressedCourses(flags,brick,row,top,(px,pz)=>clamp01(1-(width/2-Math.abs(px-x))/.15)*(.67+.33*Math.cos(1.8*pz))),copingStone);
    else b.geometry(flags,m.stone);
  }
  pave((G.minX+G.maxX)/2,.015,(G.minZ+G.maxZ)/2,G.maxX-G.minX,G.maxZ-G.minZ,3.8,2.4);
  pave(12.5,3.6225,-4,9,10,.71,.47);
  createEntryPaving(b,copingStone,grout);
  pave(W.outer-1.5,.02,0,2.2,20,1.42,.81,true);
  for(let i=0;i<11;i++) {
    const x=-2.5-i*1.16;
    b.geometry(millSection('x',.92,[[-.60,-.028],[.60,-.028],[.60,.027],[.578,.043],[-.578,.043],[-.60,.027]]),m.stone,[x,0,11.5]);
  }
  // Recessed tesserae, a dark mosaic waterline and individual coping stones with a
  // sloped wet face, a rounded outer edge and an underside drip. None bridges the pool.
  linedPool(b,ceramic,steel,deep);
  for(const side of [-1,1]) {
    const edgeX=cx+side*w/2,edgeZ=cz+side*l/2;
    const lip:Section=[[0,-.026],[.056,-.026],[.056,-.014],[.073,-.014],[.073,-.027],[.34,-.027],[.36,-.012],[.36,.032],[.35,.047],[.31,.054],[.036,.060],[.017,.055],[.003,.040],[0,.025]];
    for(const alongX of [false,true]){
      const len=alongX?w+.72:l, n=Math.ceil(len/1.18),yaw=alongX?(side===1?0:Math.PI):(side===1?Math.PI/2:-Math.PI/2);
      b.at(alongX?cx:edgeX,0,alongX?edgeZ:cz,yaw,()=>{
        // Mortar is recessed from the wet return and from both arrises. A look
        // through a joint sees mortar here, never grass or a cedar plank end.
        b.geometry(millSection('x',len,[[.008,-.012],[.348,-.012],[.348,.040],[.025,.048],[.008,.030]]),grout);
        for(let i=0;i<n;i++) {
          const at=-len/2+(i+.5)*len/n, g=millSection('x',len/n-.007,lip), p=g.getAttribute('position'), uv=g.getAttribute('uv');
          const id=(alongX?47:2)+(side+1)*73+i;
          for(let j=0;j<p.count;j++)uv.setX(j,uv.getX(j)+at/2.5);
          stoneTint(g,id,j=>.98-.27*Math.exp(-p.getZ(j)/.078));
          b.geometry(g,copingStone,[at,0,0]);
        }
      });
    }
    for(const s of [-.28,.28]){
      // Ceramic return with a recessed eyeball outlet, oriented into the pool.
      const outlet=turnSection([[.021,-.005],[.021,.006],[.026,.012],[.047,.012],[.054,.006],[.054,0]],24);
      b.geometry(outlet,steel,[edgeX-side*.006,-.38,cz+s*l],[0,0,side*Math.PI/2]);
    }
  }
  poolDeck(b,exteriorTimber(m),deep);
  for (const x of [cx-.40,cx+.40]) {
    // Set the anchor into the body of the coping, not halfway over its joint with timber.
    const rear=POOL.maxZ+.220,inner=POOL.maxZ-.5, footing=.0562;
    // A bent rail is one continuous tube (not three cylinders with severed square corners).
    const path=new THREE.CurvePath<THREE.Vector3>();
    const p=(y:number,z:number)=>new THREE.Vector3(x,y,z);
    path.add(new THREE.LineCurve3(p(-.73,inner),p(.26,inner)));
    path.add(new THREE.CubicBezierCurve3(p(.26,inner),p(.46,inner),p(.565,inner+.15),p(.565,inner+.29)));
    path.add(new THREE.LineCurve3(p(.565,inner+.29),p(.565,rear-.29)));
    path.add(new THREE.CubicBezierCurve3(p(.565,rear-.29),p(.565,rear-.12),p(.448,rear),p(.29,rear)));
    path.add(new THREE.LineCurve3(p(.29,rear),p(footing,rear)));
    b.geometry(new THREE.TubeGeometry(path,44,.030,10,false),steel);
    b.geometry(turnSection([[.031,0],[.068,0],[.071,.006],[.066,.015],[.041,.026],[.033,.034],[.031,.034]],22),steel,[x,footing,rear],[-.022,0,0]);
    b.geometry(turnSection([[0,-.010],[.031,-.010],[.032,.004],[.030,.008]],16),deep,[x,-.733,inner]);
  }
  for(let y=-.65;y<=.11;y+=.25) {
    const nosed:Section=[[-.070,-.016],[.047,-.016],[.065,-.009],[.069,.004],[.063,.015],[-.065,.015],[-.072,.006]];
    b.geometry(millSection('x',.81,nosed),steel,[cx,y,POOL.maxZ-.5]);
    for(const d of [-.036,.005,.046]) b.geometry(millSection('x',.65,[[-.004,0],[.004,0],[.003,.002],[-.003,.002]]),deep,[cx,y+.015,POOL.maxZ-.5+d]);
  }
  for(const [x,z] of ENTRY_LANTERNS) {
    b.geometry(turnSection([[0,0],[.137,0],[.137,.021],[.128,.034],[0,.034]],20),m.stone,[x,-.012,z]);
    b.at(x,.022,z,0,()=>makePathLantern(b,0,0,.61,m.bronze,gardenLight));
  }
  b.finish();
  const wave=new THREE.PlaneGeometry(w,l,28,42), p=wave.getAttribute('position');
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),margin=Math.min(w/2-Math.abs(x),l/2-Math.abs(y));
    p.setZ(i,Math.min(1,Math.max(0,margin)*3)*(.008*Math.sin(2.94*x+3.1*y)+.005*Math.cos(4.28*x-2.40*y)));
  }
  wave.computeVertexNormals();
  const water=new THREE.Mesh(wave,surfaceWater(parent,ripple,w,l));
  water.name='villa-pool-water';water.rotation.x=-Math.PI/2;water.position.set(cx,-.035,cz);parent.add(water);return water;
}
