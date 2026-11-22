import * as THREE from 'three';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import { millSection, slabFaces } from './villaArchitecturalStock.js';
import { cutInteriorFloor, type FloorTrade } from './villaInteriorFlooring.js';
import { insideOccupiedFabric } from './villaMillFinish.js';
import { finishTexture, sample01 } from './villaWeatheredFinish.js';
import type { VillaBlock } from './villaWorld.js';

function ordered(name:string,pigment:string,role:'oak'|'limestone'|'plaster',tint:string,r:number,vertex=false){
  const m=villaMaterial(pigment,r);m.name='inside/'+name;m.userData.villaInteriorFinish=role;m.userData.villaInteriorSwatchTint=tint;m.vertexColors=vertex;return m;
}
function everydayMat(kind:'wool'|'rubber'){
  const wool=kind==='wool',s=128,u=new Uint8Array(s*s*4);
  for(let y=0;y<s;y++)for(let x=0;x<s;x++){
    const yarn=wool?((x>>1)%2===((y>>1)%2)?.90:1.07):1;
    const grit=sample01(x,y),n=(wool?.79+.39*grit:grit>.92?1.77:.83+.29*grit)*yarn;
    const c=wool?[78,82,78]:[83,87,82];const i=(y*s+x)*4;u.set([n*c[0]!,n*c[1]!,n*c[2]!,255],i);
  }
  const m=villaMaterial('#ffffff',.99);m.name='inside/'+(wool?'cinema-loop-pile':'fitness-rubber');m.vertexColors=true;
  m.map=finishTexture(m.name,s,s,u);m.map.repeat.setScalar(wool?10:6);return m;
}
export function roomFinishes(){
  const plank=ordered('quartered-oak','white','oak','#f3e9de',.61,true),stone=ordered('honed-mineral-floor','#f1e5cf','limestone','#f3f0e8',.71,true);
  const floor:Record<FloorTrade,THREE.MeshStandardMaterial>={plank,parquet:plank,washed:plank,terrazzo:stone,wool:everydayMat('wool'),rubber:everydayMat('rubber')};
  return {floor,wall:ordered('lime-finish','#ddd9ce','plaster','#f6f7f3',.96,true),ceiling:ordered('chalk-soffit','#e9e6dc','plaster','#fffdf9',.98),
    rail:ordered('waxed-ash','#b8a58d','oak','#e3e3da',.66),board:ordered('limed-oak-wall','#a89475','oak','#e6ddd0',.67,true),
    reveals:villaMaterial('#726b61',.91), tile:villaMaterial('#c5d1c1',.32),ceramicJoint:villaMaterial('#b9b6a7',.91)};
}
export type RoomFinishes=ReturnType<typeof roomFinishes>;
export function putInteriorFloor(b:VillaModelBuilder,v:VillaBlock,top:number,m:RoomFinishes){
  for(const {trade,geometry} of cutInteriorFloor(v,top)){if(geometry.getAttribute('position').count)b.geometry(geometry,m.floor[trade]);else geometry.dispose();}
}
/** Assign the two sides of actual perimeter wall stock independently, never
 * wallpapering the garden elevation or duplicating an opening with a huge plane. */
export function faceInteriorWalls(b:VillaModelBuilder,v:VillaBlock,m:RoomFinishes,original:THREE.Material){
  const geometry=slabFaces(v.x,v.y,v.z,v.w,v.h,v.d),p=geometry.getAttribute('position'),n=geometry.getAttribute('normal'),indices=Array.from(geometry.index!.array);
  const inside:number[]=[],outside:number[]=[],uv=geometry.getAttribute('uv');const tints=new Float32Array(p.count*3).fill(1);
  for(let i=0;i<indices.length;i+=6){
    const a=indices[i]!,nx=n.getX(a),ny=n.getY(a),nz=n.getZ(a),x=v.x+nx*(v.w/2+.016),y=v.y+ny*(v.h/2+.016),z=v.z+nz*(v.d/2+.016);
    const interior=insideOccupiedFabric(x,y,z);(interior?inside:outside).push(...indices.slice(i,i+6));if(!interior)continue;
    const cinema=x>=17&&y<3.55&&z< -9,wet=y>=3.60&&x>8&&x<17&&z<1&&z> -9;
    const color=cinema?[.43,.46,.45]:wet?[.91,.95,.95]:[1,.99,.974];
    for(const j of new Set(indices.slice(i,i+6))){uv.setXY(j,uv.getX(j)*2.5,uv.getY(j)*2.5);tints.set(color,j*3);}
  }
  if(inside.length){const g=geometry.clone();g.clearGroups();g.setIndex(inside);g.setAttribute('color',new THREE.BufferAttribute(tints,3));b.geometry(g,m.wall);}
  if(outside.length){geometry.clearGroups();geometry.setIndex(outside);b.geometry(geometry,original);}else geometry.dispose();
}
/** Full-height ceramic jamb/tile relief: a tiny rolled shoulder and lowered grout bed,
 * instead of an image containing its own fictitious joints or a raised grout wire grid. */
export function wetWallPanel(w:number,h:number){
  const xyz:number[]=[],uv:number[]=[],color:number[]=[];const nx=Math.round(w/.24),ny=Math.round(h/.39),pw=w/nx,ph=h/ny;
  for(let iz=0;iz<ny;iz++)for(let ix=0;ix<nx;ix++){
    const x=-w/2+ix*pw,y=iz*ph,v=.88+.12*sample01(ix,iz+34), tint=.981+.04*sample01(ix,iz+16),gap=.0017;
    const rect=(e:number,depth:number)=>[[x+e,y+e,depth],[x+pw-e,y+e,depth],[x+pw-e,y+ph-e,depth],[x+e,y+ph-e,depth]];
    const a=rect(gap,.002),z=rect(gap+.0028,.0073+.0012*sample01(ix,iz+155));
    const tri=(u:number[],q:number[],s:number[],f:number)=>{for(const p of [u,q,s]){xyz.push(...p);uv.push(p[0]!,p[1]!);color.push(v*f*tint,v*f,v*f/tint);}};
    tri(z[0]!,z[1]!,z[2]!,1);tri(z[2]!,z[3]!,z[0]!,1);
    for(let i=0;i<4;i++){const j=(i+1)%4;tri(a[i]!,a[j]!,z[j]!,.95);tri(a[i]!,z[j]!,z[i]!,.95);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(xyz,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(color,3));g.computeVertexNormals();return g;
}
/** No wall cells across a window, threshold, hinge sweep or switch. Real lining and
 * rails only at the backs of installed furniture; the eastern empty hall stays empty. */
export function fitRoomLining(b:VillaModelBuilder,m:RoomFinishes){
  m.tile.name='inside/celadon-glaze';m.tile.vertexColors=true;
  const glazed=(x:number,y:number,z:number,yaw:number,w:number,h:number)=>b.at(x,y,z,yaw,()=>{
    b.box(0,h/2,0,w,h,.008,m.ceramicJoint,0);b.geometry(wetWallPanel(w,h),m.tile,[0,0,.004]);
    b.geometry(millSection('x',w,[[0,-.008],[.011,-.008],[.014,-.005],[.014,0],[0,0]]),m.rail,[0,h+.007,.001]);
  });
  glazed(12.5,3.609,-8.883,0,8.75,2.46);glazed(16.885,3.609,-6.71,-Math.PI/2,4.3,2.46);
  // Water-resistant lining also returns to the corner behind the two actual basins.
  glazed(-8.47,3.609,-8.882,0,8.79,1.42);
  // Tongue and groove lower wall, with a planted bolection cap and returned ends.
  // Wood is split into individually cut panels; the gaps see the wall backing.
  const dado=(x:number,y:number,z:number,w:number,h:number,yaw:number)=>b.at(x,y,z,yaw,()=>{
    b.box(0,h/2,-.002,w,h,.010,m.reveals,0);const count=Math.ceil(w/.197),pw=w/count;
    for(let i=0;i<count;i++){
      const left=-pw/2+.0018,right=pw/2-.0018;
      const g=millSection('y',h,[[left,0],[right,0],[right,.012],[right-.003,.017],[left+.003,.017],[left,.012]],'socketed'),p=g.getAttribute('position'),uv=g.getAttribute('uv'),rgb=new Float32Array(p.count*3),tone=.85+.14*sample01(i,77);
      for(let j=0;j<p.count;j++){uv.setXY(j,p.getY(j)/1.8+sample01(i,9),p.getX(j)/.18+sample01(i,5));rgb.set([tone,tone*.99,tone*.96],j*3);}
      g.setAttribute('color',new THREE.BufferAttribute(rgb,3));b.geometry(g,m.board,[-w/2+(i+.5)*pw,h/2,.002]);
    }
    b.geometry(millSection('x',w+.042,[[-.003,-.037],[.028,-.037],[.030,-.030],[.043,-.020],[.045,-.008],[.042,0],[-.003,0]]),m.rail,[0,h+.016,.000]);
  });
  dado(-17.75,3.607,.123,6.54,1.27,0);       // head of master bed, not its window wall
  dado(-10.50,3.607,-9.125,7.32,1.12,Math.PI); // quiet guest sitting area
  // Standard socket/switch faces are 86mm, not switches big enough to live on the floor.
  // Stations are held to solid doorway returns rather than floating by an approximate room centre.
  const switchFace=(x:number,y:number,z:number,yaw:number)=>b.at(x,y,z,yaw,()=>{
    b.box(0,0,.002,.086,.086,.007,m.rail,.002);b.box(0,0,.007,.060,.055,.005,m.reveals,0);
    b.box(0,-.001,.009,.051,.046,.005,m.ceramicJoint,.001);
  });
  switchFace(-1.77,1.13,8.882,Math.PI);switchFace(-15.34,1.13,-9.119,Math.PI);
  switchFace(-4.12,4.73,4.05,-Math.PI/2);switchFace(23.23,4.73,-8.88,0);
}
