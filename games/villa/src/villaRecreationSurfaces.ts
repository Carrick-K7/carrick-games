import * as THREE from 'three';
import type { FurnitureKit } from './villaFurnitureForms.js';

type RGB = readonly [number, number, number];
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const hash = (x: number, y: number) => {
  let h = Math.imul(x, 0x45d9f3b) ^ Math.imul(y, 0x27d4eb2d);
  h = Math.imul(h ^ h >>> 15, 0x85ebca6b); return ((h ^ h >>> 13) >>> 0) / 4294967296;
};
function noise(x: number, y: number) {
  const i = Math.floor(x), j = Math.floor(y), a = x - i, b = y - j;
  const u = a * a * (3 - 2 * a), v = b * b * (3 - 2 * b);
  return lerp(lerp(hash(i,j),hash(i+1,j),u),lerp(hash(i,j+1),hash(i+1,j+1),u),v);
}
function raster(width: number, height: number, sample: (x: number, y: number) => RGB) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const c = sample(x,y), i = (y * width + x) * 4;
    for (let k = 0; k < 3; k++) data[i+k] = Math.max(0, Math.min(255, Math.round(c[k])));
    data[i+3] = 255;
  }
  const map = new THREE.DataTexture(data,width,height,THREE.RGBAFormat);
  map.colorSpace = THREE.SRGBColorSpace; map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true; map.anisotropy = 4; map.needsUpdate = true; return map;
}
const blend = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0],b[0],t), lerp(a[1],b[1],t), lerp(a[2],b[2],t)];

/** A private travel-film still: wind on an inlet, a lug sail and three receding
 * headlands seen into the last light. Make the grain, lens falloff and the print
 * ONCE. Light comes from this same image, not a point light or a white decal. */
export function inletPrint() {
  const w=512, h=208;
  // Sample the contours once per column, not through a shader on each visitor frame.
  const ridge = (u:number, seed:number) => .56*noise(4*u, seed)+.29*noise(12*u,seed+1)+.15*noise(49*u,seed+2);
  const bands = Array.from({length:w},(_,x)=>{
    const u=x/(w-1); return [.51 + .126*ridge(u,4) + .044*Math.cos(9*u),
      .424 + .145*ridge(u,11)+.075*Math.cos(8*u+.2), .408 + .083*ridge(u,23)+.089*u**2];
  });
  const texture = raster(w,h,(x,y)=>{
    const u=x/(w-1), v=y/(h-1), [far,mid,near]=bands[x];
    const haze = Math.exp(-(((u-.31)/.19)**2 + ((v-.64)/.18)**2));
    const cloud = noise(u*5+2,v*19+7)*.6 + noise(u*21,v*60)*.4;
    let c = blend([231,191,151], [104,137,155], clamp((v-.47)*1.75));
    c = blend(c,[247,222,180],clamp(haze*.43+.26*clamp((cloud-.38)*2)));
    if (v < far) c = blend([160,151,145],[190,170,153],clamp((far-v)*8+.32*cloud));
    if (v < mid) c = blend([113,126,126],[159,149,137],clamp((mid-v)*5+.25*cloud));
    if (v < near) c = blend([58,86,88],[103,114,106],clamp(.23+noise(u*37,v*21)*.42+(near-v)*3));
    const horizon=.397+.018*Math.cos(u*4+.6)-.018*u;
    if (v < horizon) {
      const distance=clamp(1-v/horizon), ripple=noise(u*36+noise(v*75,3)*5,v*192);
      const glitter=clamp(1-Math.abs(u-.31-.032*Math.sin(v*50))/(.011+.17*distance))*(.46+ .54*ripple);
      c=blend([151,154,140],[63,101,108],distance*.69 + .23*(1-ripple));
      c=blend(c,[236,205,161],.56*glitter+.11*ripple);
      // The low dark spit cuts in from the near right bank. Bright little
      // interruptions along it are exposed shingle, not a stripe across the bay.
      const spit=.13+.095*u+.036*noise(u*20,9);
      if(u>.72 && v<spit && v>spit-.18*(u-.72)) c=blend([67,77,70],[126,120,98],ripple*.62);
    }
    const du=u-.412, dv=v-.246; // a small cream sail, mast and its broken reflection
    if(dv>0 && dv<.140 && du<0 && du>-.044*(1-dv/.14)) c=blend([196,179,145],[234,212,170],clamp(.75+du*10));
    if(dv>.007 && dv<.111 && du>.002 && du<.028*(1-(dv-.007)/.104)) c=[206,177,133];
    if(Math.abs(du)<.0016 && dv>-.006 && dv<.147) c=[95,83,72];
    if(dv<-.001 && dv>-.012 && Math.abs(du+.005)<.045*(1+dv*34)) c=[64,75,74];
    if(dv<-.016 && dv>-.091 && Math.abs(du+.008)<.020*(1+dv*9) && hash(4, y)>.47) c=blend(c,[216,189,151],.38);
    const vignette=1-.14*(1.7*(u-.5)**2 + (v-.5)**2), grain=(hash(x,y)-.5)*8;
    return [c[0]*vignette+grain,c[1]*vignette+grain,c[2]*vignette+grain];
  });
  texture.name='Inlet, last crossing · original projection print'; return texture;
}

const samples = ['saddle','runner','brick','rush','beech','felt','drawer','pad'] as const;
type Sample = typeof samples[number];
// All eight fittings share a single 512² opaque, mipmapped material batch.
// The 2-pixel guard around each chart is excluded when generating UVs.
function studioAtlas() {
  const palette: RGB[]=[[102,135,122],[89,95,91],[175,121,93],[145,155,126],[183,145,101],[112,116,108],[106,123,113],[152,158,151]];
  const scratches = Array.from({length:44},(_,i)=>({x:hash(i,72)*260-10, y:hash(i,33)*123, length:4+hash(i,54)*35, slope:(hash(i,19)-.52)*1.5}));
  const texture = raster(512,512,(x,y)=>{
    const col=x>>8, row=y>>7, tile=row*2+col, i=x%256, j=y%128, base=palette[tile];
    const u=i/255,v=j/127, grain=hash(i+17*tile,j), cloud=noise(i/33+3,j/20);
    let f=(grain-.5)*7 + (cloud-.5)*7;
    if(tile===0) { // mildly polished vinyl in the middle, folded double-needle seams towards either edge
      f+=(Math.abs(Math.sin(i*.82+j*.30))+Math.sin(j*2.1)) * 2.5 + 14*Math.sin(v*Math.PI)*Math.sin(u*Math.PI);
      const d=Math.min(j,127-j);
      if(d<2) f-=15; if(d===5 || d===8) f+=(i%9<5?24:-10);
    } else if(tile===7) {
      f+=8*Math.cos(u*Math.PI*2)+6*(noise(i*.022,j*2)-.5)+(grain>.96?13:0);
    } else if(tile===1) {
      // Bonded rubber tread, opposing diagonal crowns, a softer running track down its centre.
      const chevron=(i+(j<64 ? j : -j)*.63)%8;
      f+=(chevron<1.7?-13:chevron<3?6:0)+(tile===1?12:3)*Math.sin(v*Math.PI)**4;
      if(Math.min(j,127-j)<5) f-=8;
    } else if(tile===2 || tile===3) {
      const selvedge=Math.min(j,127-j), rib=(i+(j%4)*.5)%4;
      f+=(rib<1.4?-11:3)+6*Math.sin(v*Math.PI);
      if(selvedge<4) f-=13; if(selvedge>=6 && selvedge<=7) f+=17;
      if(i>15 && i<239 && (Math.abs(j-21)<.65 || Math.abs(j-106)<.65)) f+=9;
    } else if(tile===4) {
      // Face-laminated beech with end-to-end strips, not a fresh monotone plank.
      const strip=Math.floor(j/15.8), drift=1.7*Math.sin(u*5+strip)+.9*Math.sin(u*14+strip);
      f+=(hash(strip,44)-.5)*23 + 12*(noise(i*.019+strip*6,(j+drift)*.81)-.46);
      if((j+.35)%15.8<.85) f-=24;
      for(const s of scratches) {const dx=i-s.x;if(dx>0 && dx<s.length && Math.abs(j-(s.y+s.slope*dx))<.62) f-=24*(1-dx/s.length);}
      f+=9*Math.exp(-((v-.19)**2)/.016)*Math.sin(u*Math.PI);
    } else if(tile===5) {
      f+=(i%4<1?-9:2)+(j%3===1?7:-4)+(hash(i>>1,j)-.5)*11;
    } else {
      const edge=Math.min(i,255-i,j,127-j);
      if(edge<2) f+=grain>.71?40:-12;
      f+=9*(noise(i/31,j/15)-.5);
    }
    return [base[0]+f,base[1]+f*.94,base[2]+f*.81];
  });
  texture.name='Recreation materials · eight physical cuts'; return texture;
}

const fittings = new WeakMap<FurnitureKit,THREE.MeshStandardMaterial>();
export function equipmentSurface(k:FurnitureKit) {
  let m=fittings.get(k);
  if(!m){m=new THREE.MeshStandardMaterial({map:studioAtlas(), roughness:.83});m.name='Recreation surface charts'; fittings.set(k,m);}
  return m;
}

/** Select chart and unwrap a real piece before the room batch bakes its transform.
 * No repeating atlas outside a chart, nor sourcing UVs from world coordinates. */
export function wrapCut(g:THREE.BufferGeometry, sample:Sample, plane:'xz'|'zx'|'xy'|'zy'='xz') {
  const chart=samples.indexOf(sample), p=g.getAttribute('position');
  g.computeBoundingBox(); const bb=g.boundingBox!, size=bb.getSize(new THREE.Vector3());
  const uv=new Float32Array(p.count*2), a=plane[0] as 'x'|'z', b=plane[1] as 'x'|'y'|'z';
  for(let i=0;i<p.count;i++) {
    const u=((a==='x'?p.getX(i):p.getZ(i))-bb.min[a])/(size[a]||1);
    const v=((b==='z'?p.getZ(i):b==='x'?p.getX(i):p.getY(i))-bb.min[b])/(size[b]||1);
    uv[i*2]=(256*(chart%2)+2+252*u)/512; uv[i*2+1]=(128*(chart>>1)+2+124*v)/512;
  }
  g.setAttribute('uv',new THREE.BufferAttribute(uv,2));return g;
}

/** Quarter-sawn grain in a light, travelling band. Its colour modulates an
 * existing wood finish, rather than replacing oak/walnut with the same brown. */
export function finishingVeneer() {
  const map=raster(256,128,(x,y)=>{
    const a=2*Math.PI*x/256,b=2*Math.PI*y/128;
    const growth=y+.8*Math.sin(a*2+b*2)+2.1*Math.sin(a+b)+3.1*Math.cos(b*3);
    const f=211+9*Math.cos(growth*2*Math.PI/12.8)+8*Math.sin(growth*2*Math.PI/4.0)+5*(hash(x>>2,y)-.5)
      +9*Math.sin(b*3+Math.sin(a*2))+(hash(x,y)>.87?-12:0);
    return [f+9,f,f-6];
  });map.wrapS=map.wrapT=THREE.RepeatWrapping;map.name='Sawn grain and open pores';return map;
}

/** Baize has a fine raised nap and longer, overlapping brush passes. The cloth
 * itself stays exactly planar for the aiming/contact datum. */
export function baizeGrain() {
  const map=raster(256,256,(x,y)=>{
    const offset=3*Math.sin(y*Math.PI*2/256)+1.5*Math.cos(y*Math.PI*6/256), tuft=hash((x+(y>>3))%256,y>>1);
    const hand=8*Math.sin((x+offset)*Math.PI*6/256)+4*Math.cos((x+offset)*Math.PI*14/256);
    const f=217+hand+11*(tuft-.5)+9*(hash(x,y)-.5)+3*Math.sin((x-y)*Math.PI/2);
    return [f-8,f+7,f];
  });map.wrapS=map.wrapT=THREE.RepeatWrapping;map.name='Directional brushed baize';return map;
}
