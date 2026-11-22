import * as THREE from 'three';
import { VILLA_GARDEN_TREES, VILLA_VEGETABLE_BEDS } from './villaGarden.js';
import { POOL, VILLA_BUILDING_GROUND_CUTS, VILLA_ESTATE_BOUNDS, VILLA_ESTATE_FIELDS, VILLA_ESTATE_VIEWPOINT, VILLA_POND, villaTerrainGroundHeight } from './villaEstateLayout.js';
import { VILLA_ESTATE_ROAD_PATHS, VILLA_GARAGE_DRIVE } from './villaDrivingCourse.js';
import { VILLA_SCENIC_ROAD } from './villaDriving.js';
import { VILLA_STREAM, VILLA_STREAM_BOUNDS, VILLA_STREAM_PATH, villaStreamContains, villaStreamSectionAt } from './villaStream.js';
import { NatureMesh } from './villaNatureGeometry.js';
import { lawnPatch, lawnPhotoUV } from './villaLawnFinish.js';

// A gardener can walk to all four sides of each raised bed. The dressing is part of
// the walking surface, NOT a fifth raised box or a collider across the pet route.
const sites=VILLA_VEGETABLE_BEDS;
const left=Math.min(...sites.map(s=>s.x-s.w/2))-.91, right=Math.max(...sites.map(s=>s.x+s.w/2))+.89;
const north=Math.min(...sites.map(s=>s.z-s.d/2))-.86, south=Math.max(...sites.map(s=>s.z+s.d/2))+.92;
const cx=(left+right)/2,cz=(north+south)/2,hx=(right-left)/2,hz=(south-north)/2;
const clamp=(x:number,a=0,b=1)=>Math.max(a,Math.min(b,x));
function rng(seed:number){let x=seed>>>0;return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};}
const colour=(hex:string)=>new THREE.Color(hex);
/** Signed metres to a slightly irregular spade-cut, rounded garden edging. */
export function kitchenCourtDistance(x:number,z:number){
  const r=.42,qx=Math.abs(x-cx)-(hx-r), qz=Math.abs(z-cz)-(hz-r);
  return Math.hypot(Math.max(0,qx),Math.max(0,qz))+Math.min(Math.max(qx,qz),0)-r + .027*Math.sin(x*2.5+z*1.2)+.012*Math.cos(z*5.8-x*.73);
}
function courtRadius(a:number){const x=Math.cos(a),z=Math.sin(a);let lo=0,hi=Math.hypot(hx,hz)+.2;for(let i=0;i<14;i++){const m=(lo+hi)*.5;if(kitchenCourtDistance(cx+m*x,cz+m*z)<0)lo=m;else hi=m;}return (lo+hi)*.5;}
const courtHeight=(x:number,z:number)=>.008+.0023*Math.sin(x*2.4+z*.7)+.0028*Math.cos(z*2.5-x*.7);
function surface(m:NatureMesh,x:number,y:number,z:number,c:THREE.Color,shade:number,scale=1){return m.point([x,y,z],1,[x/scale,z/scale],[c.r*shade,c.g*shade,c.b*shade]);}
function finish(root:THREE.Group,name:string,mesh:NatureMesh,mat:THREE.Material){if(!mesh.indices.length)return;const g=mesh.geometry(true);g.userData.villaRigidBatch=true;g.computeBoundingBox();g.computeBoundingSphere();const o=new THREE.Mesh(g,mat);o.name=name;o.receiveShadow=true;root.add(o);}
const neutral=new THREE.Color(1,1,1);
/** Aggregate is part-buried. Individual near-edge chips catch light and produce
 * parallax against the turf. Dense millimetre-scale gravel between them is sampled by its finish. */
function grit(mesh:NatureMesh,x:number,z:number,r:number,a:number,c:THREE.Color,random:()=>number,support:(x:number,z:number)=>number){
  const ring:number[]=[],top:number[]=[],long=r*(1+random()*.55), slope=random()*.24-.12, height=r*(.32+random()*.35);
  for(let j=0;j<5;j++){const b=a+j*Math.PI*.4+(random()-.5)*.28,k=.78+random()*.34,dx=Math.cos(b)*long*k,dz=Math.sin(b)*r*k;
    ring.push(surface(mesh,x+dx,support(x+dx,z+dz)-r*.24,z+dz,c,.66));
    const tx=x+dx*(.52+random()*.21),tz=z+dz*.66;top.push(surface(mesh,tx,support(tx,tz)+height*(.6+.28*random())+dx*slope,tz,c,.92+random()*.09));}
  const tx=x+long*.14,tz=z-r*.11,cap=surface(mesh,tx,support(tx,tz)+height,tz,c,1.01);
  for(let j=0;j<5;j++){const k=(j+1)%5;mesh.tri(ring[j]!,top[j]!,ring[k]!);mesh.tri(ring[k]!,top[j]!,top[k]!);mesh.tri(top[j]!,cap,top[k]!);}
}
function buildCourt(root:THREE.Group,mat:THREE.MeshStandardMaterial,clastic:NatureMesh,earth:NatureMesh){
  const m=new NatureMesh(),n=128,radii=Array.from({length:n},(_,i)=>courtRadius(i/n*Math.PI*2));
  const w=surface(m,cx,courtHeight(cx,cz),cz,neutral,1);
  const earlier:number[]=[];const edgeBase=colour('#4b4834');
  for(const f of [.28,.57,.82,.95,1,1.015]){
    const row:number[]=[];
    for(let i=0;i<n;i++){const a=i/n*Math.PI*2,d=radii[i]!*f,x=cx+Math.cos(a)*d,z=cz+Math.sin(a)*d;
      row.push(surface(m,x,f>1?-.023:courtHeight(x,z),z,neutral,(f>1?.66:.96)+.036*Math.sin(x*.85+z*1.26)));}
    for(let i=0;i<n;i++){const j=(i+1)%n;if(earlier.length){m.tri(earlier[i]!,earlier[j]!,row[i]!);m.tri(earlier[j]!,row[j]!,row[i]!);}else m.tri(w,row[j]!,row[i]!);}
    earlier.splice(0,earlier.length,...row);
  }
  finish(root,'garden-workcourt/compacted-gravel',m,mat);
  // The actual sloped edge is made of planar triangles, not the analytic courtHeight.
  // Along a radial spoke only eleven triangles can contain this sheet coordinate.
  const support=(x:number,z:number)=>{
    const theta=(Math.atan2(z-cz,x-cx)+Math.PI*2)%(Math.PI*2),j=Math.min(n-1,Math.floor(theta*n/(Math.PI*2))),v=m.positions,ids=m.indices;
    let y=villaTerrainGroundHeight(x,z)-.022;
    for(let ring=0;ring<6;ring++)for(let part=0;part<(ring?2:1);part++){
      const off=3*(ring?n+(ring-1)*2*n+2*j+part:j),i0=3*ids[off]!,i1=3*ids[off+1]!,i2=3*ids[off+2]!;
      const ax=v[i0]!,az=v[i0+2]!,ux=v[i1]!-ax,uz=v[i1+2]!-az,vx=v[i2]!-ax,vz=v[i2+2]!-az,den=ux*vz-uz*vx;
      const u=((x-ax)*vz-(z-az)*vx)/den,w=(ux*(z-az)-uz*(x-ax))/den;
      if(u>=-1e-7&&w>=-1e-7&&u+w<=1+1e-7){y=Math.max(y,v[i0+1]!+u*(v[i1+1]!-v[i0+1]!)+w*(v[i2+1]!-v[i0+1]!));break;}
    }return y;
  };
  const chips=['#a09885','#b5aa95','#998c77','#beb79f','#807b70','#9c9d8e','#b69c79'].map(colour), random=rng(7893031);
  for(let i=0;i<1190;i++){
    const a=random()*6.283185,r=courtRadius(a)+(random()**1.8-.23)*.32;
    const edge=i<475,x=edge?cx+Math.cos(a)*r:left+random()*(right-left),z=edge?cz+Math.sin(a)*r:north+random()*(south-north),d=kitchenCourtDistance(x,z);
    if(d>.22||(!edge&&d>-.03)||sites.some(b=>Math.abs(b.x-x)<b.w/2-.01&&Math.abs(b.z-z)<b.d/2-.01))continue;
    grit(clastic,x,z,.0048+random()**2*.012,random()*6.28,chips[Math.floor(random()*chips.length)]!,random,support);
  }
  // A broken, wetted soil edge between blades and stones; no solid kerb or painted dark outline.
  for(let i=0;i<n;i+=2){const a=i/n*2*Math.PI,b=a+.019+random()*.025;
    const p=(t:number,d:number,y:number)=>surface(earth,cx+Math.cos(t)*(courtRadius(t)+d),y,cz+Math.sin(t)*(courtRadius(t)+d),edgeBase,.79+random()*.22);
    const u=p(a,.006,-.011),v=p(a,.033+random()*.037,-.015),w=p(b,.009,-.012),s=p(b,.044,-.017);earth.tri(u,w,v);earth.tri(w,s,v);}
}
interface Segment {x:number;z:number;dx:number;dz:number;inv:number;radius:number}
function roadExclusion(){const cells=new Map<string,Segment[]>(),size=8;
  for(const road of VILLA_ESTATE_ROAD_PATHS)for(let i=1;i<road.length;i++){const a=road[i-1]!,b=road[i]!,dx=b.x-a.x,dz=b.z-a.z;
    const radius=(road===VILLA_GARAGE_DRIVE?VILLA_SCENIC_ROAD.drivewayWidth:VILLA_SCENIC_ROAD.width)/2+.57,seg={x:a.x,z:a.z,dx,dz,inv:1/(dx*dx+dz*dz||1),radius};
    const reach=radius+.16; // Also index the longest blade reaching over the verge.
    for(let ix=Math.floor((Math.min(a.x,b.x)-reach)/size);ix<=Math.floor((Math.max(a.x,b.x)+reach)/size);ix++)for(let iz=Math.floor((Math.min(a.z,b.z)-reach)/size);iz<=Math.floor((Math.max(a.z,b.z)+reach)/size);iz++){const k=`${ix},${iz}`;let v=cells.get(k);if(!v){v=[];cells.set(k,v);}v.push(seg);}}
  return(x:number,z:number,blade=false)=>{const s=cells.get(`${Math.floor(x/size)},${Math.floor(z/size)}`);return s?.some(v=>{const u=x-v.x,w=z-v.z,t=clamp((u*v.dx+w*v.dz)*v.inv);return (u-t*v.dx)**2+(w-t*v.dz)**2<(v.radius+(blade?.16:0))**2;})??false;};
}
function groundRoom(x:number,z:number,isRoad:(x:number,z:number)=>boolean){
  if(isRoad(x,z)||kitchenCourtDistance(x,z)<.035||VILLA_BUILDING_GROUND_CUTS.some(b=>x>b.minX-.20&&x<b.maxX+.20&&z>b.minZ-.2&&z<b.maxZ+.2))return false;
  if(x>POOL.minX-1.35&&x<POOL.maxX+1.5&&z>POOL.minZ-1.25&&z<POOL.maxZ+4.47)return false;
  if(z>9&&z<13.75&&x>-22&&x<17 || z>1.5&&z<23&&x>28&&x<52 || Math.abs(x)<2.7&&z>VILLA_STREAM_PATH.minZ-1&&z<VILLA_STREAM_PATH.maxZ+1)return false;
  if(VILLA_ESTATE_FIELDS.some(b=>x>b.minX-.26&&x<b.maxX+.26&&z>b.minZ-.26&&z<b.maxZ+.26))return false;
  if(((x-VILLA_POND.x)/10.2)**2+((z-VILLA_POND.z)/14.0)**2<1||villaStreamContains(x,z,.12,true))return false;
  if(Math.hypot(x-VILLA_ESTATE_VIEWPOINT.x,z-VILLA_ESTATE_VIEWPOINT.z)<4.5 || x>-15&&x<-11&&z>23&&z<64 || z>=88&&z<128&&Math.abs(x-(-5+(z-88)*.51))<2.4)return false;
  return true;
}
const potPairs = [[-10.5, 16], [-22.6, 11.5], [8.5, 18]] as const;
function clearPlantedFeet(x: number, z: number) {
  // The larger orchard collars may still carry short grass outside the trunks.
  for (const tree of VILLA_GARDEN_TREES) if (Math.max(Math.abs(x - tree.x), Math.abs(z - tree.z)) < .25 * tree.scale + .18) return false;
  for (const [px, pz] of potPairs) if (Math.max(Math.abs(x - px), Math.abs(z - pz)) < .43 ||
    Math.max(Math.abs(x - px - .8), Math.abs(z - pz - .3)) < .35) return false;
  // Mown up to the woody feet of the two clipped privet rows, not a sterile strip under their full canopies.
  const row = Math.round((z + 12) / 2.45);
  if (row >= 0 && row < 14 && Math.abs(z + 12 - row * 2.45) < .93 &&
    (Math.abs(x - (VILLA_BUILDING_GROUND_CUTS[0].minX - .55)) < .45 || Math.abs(x - (VILLA_ESTATE_BOUNDS.maxX - 1.15)) < .47)) return false;
  return true;
}
const green = colour('#65733d'), dry = colour('#9f925b'), young = colour('#718745');
const restedGreen = colour('#59734d'), cutGreen = colour('#6c7e52');
function groundGrowth(turf: NatureMesh, x: number, y: number, z: number, len: number, random: () => number, visible: boolean) {
  const patch = lawnPatch(x, z), local = restedGreen.clone().lerp(cutGreen, 1 - patch.fresh);
  // Keep each existing root, fan, swept edge and tip, including the original
  // draw sequence when a foot/road clearance omits a clump. Soil collars and
  // litter use this same stream; a withheld blade must not move the next tree.
  const a0 = random() * Math.PI * 2, n = 3 + Math.floor(random() * 4);
  for (let k = 0; k < n; k++) {
    const a = a0 + k * 2.399 + (random() - .5) * .54, h = len * (.58 + random() * .67), r = random() * .019;
    const dx = Math.cos(a) * h * .78, dz = Math.sin(a) * h * .78, w = h * (.036 + random() * .024);
    const weathered = random() < .10, tipLift = .68 + random() * .22;
    if (!visible) continue;
    const ox = x + Math.cos(a) * r, oz = z + Math.sin(a) * r;
    // Blend these few older cut ends back toward their living neighbours. Each
    // blade keeps one pigment and the same heel-to-tip lightness as before.
    const pigment = (weathered ? dry : (k & 1) ? green : young).clone().lerp(local, weathered ? .57 : .40);
    const point = (s: number, offset: number, lift: number, tone: number) =>
      surface(turf, ox + dx * s - dz / h * offset, y + h * lift, oz + dz * s + dx / h * offset, pigment, tone);
    const l = point(0, -w, 0, .56), r0 = point(0, w, 0, .56), lm = point(.36, -w * .66, .79, .93), rm = point(.36, w * .66, .77, .93);
    const tip = point(1, 0, tipLift, 1.05);
    turf.tri(l, lm, r0); turf.tri(r0, lm, rm); turf.tri(lm, tip, rm);
  }
}
function rootSkirt(soil:NatureMesh,litter:NatureMesh,turf:NatureMesh,x:number,z:number,s:number,random:()=>number,isRoad:ReturnType<typeof roadExclusion>){
  // Do not put a horizontal plate under a neighbouring porch/road or across a bank on a hill.
  const n=24,offset=random()*6.28;const soilCol=colour('#62533c'),outer=colour('#766e4c'),leafCol=colour('#88713e');const rings:number[][]=[];
  const variations=Array.from({length:n},(_,i)=>.95+.14*Math.sin(i*1.7+offset)+.08*random());
  for(const radial of [.09,.44,.78,1]){const row:number[]=[];
    for(let i=0;i<n;i++){const a=i/n*6.283185+offset,rx=Math.cos(a)*radial*variations[i]!*s*.86,rz=Math.sin(a)*radial*variations[i]!*s*.73,u=x+rx,v=z+rz;
      const h=villaTerrainGroundHeight(u,v)-.022+(radial===1?.001:.009+(.86-radial)*.025);
      row.push(surface(soil,u,h,v,radial>.75?outer:soilCol,.75+.22*random()));}
    rings.push(row);
  }
  for(let j=1;j<rings.length;j++)for(let i=0;i<n;i++){const k=(i+1)%n;soil.tri(rings[j-1]![i]!,rings[j-1]![k]!,rings[j]![i]!);soil.tri(rings[j-1]![k]!,rings[j]![k]!,rings[j]![i]!);}
  for(let j=0;j<65;j++){const a=random()*6.28,d=(.12+random()**.55*.77)*s,xx=x+Math.cos(a)*d,zz=z+Math.sin(a)*d*.86;
    if(!groundRoom(xx,zz,isRoad))continue;const y=villaTerrainGroundHeight(xx,zz)-.020+.013*Math.max(0,1-d/s);
    if(j%4===0){groundGrowth(turf,xx,y,zz,.075+random()*.062,random,openSward(xx,zz,true,isRoad));continue;}
    const dir=random()*6.28,l=.026+random()*.067,w=l*(.17+random()*.10),u=Math.cos(dir),v=Math.sin(dir),t=.66+random()*.32;
    const p=(d:number,e:number,h:number)=>surface(litter,xx+d*u-e*v,y+h,zz+d*v+e*u,leafCol,t);
    const base=p(-l*.5,0,.009),m=p(0,0,.013),lt=p(.006,w,.017+random()*.009),rt=p(-.002,-w,.012),tip=p(l*.54,w*.24,.009);litter.tri(base,lt,m);litter.tri(base,m,rt);litter.tri(lt,tip,m);litter.tri(m,tip,rt);
  }
}
// Broad lawn stations stop before the gravel/grit outside the cutout, not at the
// waterline or a guessed diagonal from the pond to its lookout. These masks only
// dress the floor: they never become a support surface or an obstacle.
function openSward(x: number, z: number, courtLip: boolean, isRoad: ReturnType<typeof roadExclusion>) {
  if (isRoad(x, z, true) || kitchenCourtDistance(x, z) < (courtLip ? .095 : .93) || !clearPlantedFeet(x, z)) return false;
  const b = VILLA_ESTATE_BOUNDS;
  if (Math.min(x - b.minX, b.maxX - x, z - b.minZ, b.maxZ - z) < .25) return false;
  if (z > VILLA_STREAM_BOUNDS.minZ - .2 && z < VILLA_STREAM_BOUNDS.maxZ + .2) {
    const s = villaStreamSectionAt(x);
    if (s && Math.abs(z - s.z) < s.halfWidth + VILLA_STREAM.bankWidth + .2) return false;
  }
  if (((x - VILLA_POND.x) / 10.55) ** 2 + ((z - VILLA_POND.z) / 14.35) ** 2 < 1) return false;
  const v = VILLA_ESTATE_VIEWPOINT;
  if (z > 86.5 && z < v.z + 1.5) {
    const trailX = z < 100 ? -5 + (z - 88) : z < 114 ? 7 + (z - 100) * 6 / 14 : 13 + (z - 114) / 13;
    if (Math.abs(x - trailX) < 1.8) return false;
  }
  if (x > v.x + 1.9 && x < v.x + 5.2 && z > v.z + 1.7 && z < v.z + 5.4) return false; // lookout boulders
  if (x > -27.2 && x < -24.6 && z > -10.2 && z < 10.2) return false; // pool-side flags
  return true;
}

function plantLawn(turf: NatureMesh, random: () => number, isRoad: ReturnType<typeof roadExclusion>) {
  const b = VILLA_ESTATE_BOUNDS;
  // Keep the established stations and their random stream, short in the garden
  // and a little longer on the pasture. Clearance can withhold growth in place,
  // never rejection-sample a replacement or shift the next planted station.
  for (let i = 0; i < 1850; i++) {
    let x = b.minX + (b.maxX - b.minX) * random(), z = b.minZ + (b.maxZ - b.minZ) * random();
    const lip = i < 360;
    if (lip) {
      const a = random() * Math.PI * 2, r = courtRadius(a) + .035 + random() ** 1.5 * .40;
      x = cx + Math.cos(a) * r; z = cz + Math.sin(a) * r;
    } else if (i < 1150) {
      x = random() > .5 ? b.minX + .3 + random() * 1.8 : b.maxX - .3 - random() * 1.8;
    }
    if (!groundRoom(x, z, isRoad)) continue;
    const len = lip ? .028 + random() * .045 : z < 35 ? .047 + random() * .059 : .09 + random() * .095;
    for (let j = 0; j < (lip ? 1 : 3); j++) {
      const a = random() * 6.28, r = random() * (lip ? .065 : .12), xx = x + Math.sin(a) * r, zz = z + Math.cos(a) * r;
      if (groundRoom(xx, zz, isRoad)) groundGrowth(turf, xx, villaTerrainGroundHeight(xx, zz) - .021, zz, len, random, openSward(xx, zz, lip, isRoad));
    }
  }
}
export function createCultivatedGround(parent:THREE.Object3D,gravel:THREE.MeshStandardMaterial){
  const root=new THREE.Group();root.name='villa-cultivated-ground';parent.add(root);const chips=new NatureMesh(),soil=new NatureMesh(),turf=new NatureMesh(),litter=new NatureMesh(),isRoad=roadExclusion();
  const granular=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}),grass=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.96,side:THREE.DoubleSide}), leaf=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide});
  granular.name='embedded-grit-and-loam';grass.name='rooted-verge-blades';leaf.name='fallen-leaf-litter';
  buildCourt(root,gravel,chips,soil);
  const rand=rng(849023);for(const t of VILLA_GARDEN_TREES)rootSkirt(soil,litter,turf,t.x,t.z,t.scale,rand,isRoad);
  plantLawn(turf,rand,isRoad);
  finish(root,'garden-substrate/stone-chips',chips,granular);finish(root,'garden-substrate/soil-collars',soil,granular);finish(root,'garden-substrate/grass-tillers',turf,grass);finish(root,'garden-substrate/leaf-litter',litter,leaf);return root;
}
/** Finish only: one metric chart for both the clipped estate and its separate fence shoulder.
 * The original metre grid, normals, winding, holes and support remain authoritative. */
export function tintManagedLawn(g: THREE.BufferGeometry) {
  const p = g.getAttribute('position'), uv = g.getAttribute('uv'), rgb = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), { value, fresh, meadow } = lawnPatch(x, z);
    // The scan already contains green blades and clipped ends. Vary reflectance
    // more than hue; even the driest open meadow keeps living green underneath.
    rgb[3 * i] = value * (.972 + .046 * (1 - fresh) + .026 * meadow);
    rgb[3 * i + 1] = value * (.995 + .018 * fresh);
    rgb[3 * i + 2] = value * (.955 + .053 * fresh - .025 * meadow);
    uv.setXY(i, ...lawnPhotoUV(x, z));
  }
  g.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
  return g;
}
