import * as THREE from 'three';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import { millSection, turnSection, slabFaces, type Section } from './villaArchitecturalStock.js';
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
  const ceramic=new THREE.MeshStandardMaterial({map:tileMap,roughness:.42}), steel=villaMaterial('#b4bfbb',.25,.67);
  const deep=villaMaterial('#34666c',.45), grout=villaMaterial('#938575',.92);
  const cedar=m.oak.clone();cedar.color.set('#b68d63');cedar.roughness=.79;
  function pave(x:number,top:number,z:number,width:number,depth:number,brick:number,row:number){
    b.box(x,top-.033,z,width,.050,depth,grout,0);
    b.geometry(courseSurface(x,top,z,width,depth,brick,row,.009,.005),m.stone);
  }
  pave((G.minX+G.maxX)/2,.015,(G.minZ+G.maxZ)/2,G.maxX-G.minX,G.maxZ-G.minZ,3.8,2.4);
  pave(12.5,3.6225,-4,9,10,.71,.47);
  createEntryPaving(b,m.stone,grout);
  pave(W.outer-1.5,.02,0,2.2,20,1.42,.81);
  for(let i=0;i<11;i++) {
    const x=-2.5-i*1.16;
    b.geometry(millSection('x',.92,[[-.60,-.028],[.60,-.028],[.60,.027],[.578,.043],[-.578,.043],[-.60,.027]]),m.stone,[x,0,11.5]);
  }
  // Recessed tesserae, a dark mosaic waterline and individual coping stones with a
  // sloped wet face, a rounded outer edge and an underside drip. None bridges the pool.
  b.geometry(slabFaces(cx,-1.04,cz,w+.3,.14,l+.3),ceramic);
  for(const side of [-1,1]) {
    const edgeX=cx+side*w/2,edgeZ=cz+side*l/2;
    b.geometry(slabFaces(edgeX+side*.075,-.51,cz,.15,1.1,l+.3),ceramic);
    b.geometry(slabFaces(cx,-.51,edgeZ+side*.075,w,1.1,.15),ceramic);
    for(const y of [-.214,-.172]) {
      b.box(edgeX-side*.0015,y,cz,.002,.018,l,deep,0);
      b.box(cx,y,edgeZ-side*.0015,w,.018,.002,deep,0);
    }
    const lip:Section=[[0,-.026],[.056,-.026],[.056,-.014],[.073,-.014],[.073,-.027],[.34,-.027],[.36,-.012],[.36,.032],[.35,.047],[.31,.054],[.036,.060],[.017,.055],[.003,.040],[0,.025]];
    for(const alongX of [false,true]){
      const len=alongX?w+.72:l, n=Math.ceil(len/1.18),yaw=alongX?(side===1?0:Math.PI):(side===1?Math.PI/2:-Math.PI/2);
      b.at(alongX?cx:edgeX,0,alongX?edgeZ:cz,yaw,()=>{
        for(let i=0;i<n;i++) b.geometry(millSection('x',len/n-.007,lip),m.stone,[-len/2+(i+.5)*len/n,0,0]);
      });
    }
    for(const s of [-.28,.28]){
      // Ceramic return with a recessed eyeball outlet, oriented into the pool.
      const outlet=turnSection([[.021,-.005],[.021,.006],[.026,.012],[.047,.012],[.054,.006],[.054,0]],24);
      b.geometry(outlet,steel,[edgeX-side*.006,-.38,cz+s*l],[0,0,side*Math.PI/2]);
    }
  }
  const deckMinX=POOL.minX-.3,deckMaxX=POOL.maxX+.5,deckMinZ=POOL.maxZ+.2,deckMaxZ=POOL.maxZ+4;
  const dx=(deckMinX+deckMaxX)/2,dz=(deckMinZ+deckMaxZ)/2,width=deckMaxX-deckMinX,depth=deckMaxZ-deckMinZ;
  b.box(dx,-.024,dz,width,.05,depth,cedar,0);
  b.geometry(courseSurface(dx,.020,dz,width,depth,2.82,.154,.007,.003),cedar);
  for (const x of [cx-.40,cx+.40]) {
    const rear=POOL.maxZ+.35,inner=POOL.maxZ-.5;
    // A bent rail is one continuous tube (not three cylinders with severed square corners).
    const path=new THREE.CurvePath<THREE.Vector3>();
    const p=(y:number,z:number)=>new THREE.Vector3(x,y,z);
    path.add(new THREE.LineCurve3(p(-.73,inner),p(.26,inner)));
    path.add(new THREE.CubicBezierCurve3(p(.26,inner),p(.46,inner),p(.565,inner+.15),p(.565,inner+.29)));
    path.add(new THREE.LineCurve3(p(.565,inner+.29),p(.565,rear-.29)));
    path.add(new THREE.CubicBezierCurve3(p(.565,rear-.29),p(.565,rear-.12),p(.448,rear),p(.29,rear)));
    path.add(new THREE.LineCurve3(p(.29,rear),p(.020,rear)));
    b.geometry(new THREE.TubeGeometry(path,54,.030,12,false),steel);
    b.geometry(turnSection([[.031,0],[.068,0],[.071,.006],[.066,.015],[.041,.026],[.033,.034],[.031,.034]],22),steel,[x,.021,rear]);
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
  ripple.repeat.set(w/2.5,l/2.75);
  const wave=new THREE.PlaneGeometry(w,l,44,64), p=wave.getAttribute('position');
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),margin=Math.min(w/2-Math.abs(x),l/2-Math.abs(y));
    p.setZ(i,Math.min(1,Math.max(0,margin)*3)*(.008*Math.sin(2.94*x+3.1*y)+.005*Math.cos(4.28*x-2.40*y)));
  }
  wave.computeVertexNormals();
  const water=new THREE.Mesh(wave,new THREE.MeshPhongMaterial({color:0x5baeb2,specular:0xffecc8,shininess:105,transparent:true,opacity:.55,bumpMap:ripple,bumpScale:.055,side:THREE.DoubleSide,depthWrite:false}));
  water.name='villa-pool-water';water.rotation.x=-Math.PI/2;water.position.set(cx,-.035,cz);parent.add(water);return water;
}
