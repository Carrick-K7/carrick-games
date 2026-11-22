import * as THREE from 'three';
import { VILLA_INTERIOR_SWATCHES } from './villaInteriorSwatchData.js';
import { bindMillMaterial } from './villaMillFinish.js';

export const ROOM_FINISH_DATA={oak:[1024,256,'#c3a989'],limestone:[1024,1024,'#cfc3ac'],plaster:[512,512,'#ded5c6']} as const;
export type RoomSwatch=keyof typeof ROOM_FINISH_DATA;
const roles=Object.keys(ROOM_FINISH_DATA) as RoomSwatch[];
export function interiorSwatches(onReady:()=>void){
  type Outcome='decoded'|'failed'|'cancelled';
  const pending=new Set<()=>void>(),outcomes:Record<RoomSwatch,Outcome>={oak:'failed',limestone:'failed',plaster:'failed'};
  const maps={} as Record<RoomSwatch,THREE.CanvasTexture>,jobs:Promise<void>[]=[];let live=true;
  for(const k of roles){
    const [w,h,tone]=ROOM_FINISH_DATA[k],c=document.createElement('canvas');c.width=w;c.height=h;
    const ctx=c.getContext('2d')!;ctx.fillStyle=k==='plaster'?'#e2dfd8':tone;ctx.fillRect(0,0,w,h);
    const t=new THREE.CanvasTexture(c);t.name='interior-finish/'+k;t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;
    t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;maps[k]=t;
    if(typeof Image==='undefined')continue;
    jobs.push(new Promise<void>(done=>{
      let image:HTMLImageElement;try{image=new Image();}catch{done();return;}
      const cancel=()=>finish('cancelled');
      const finish=(s:Outcome)=>{if(!pending.delete(cancel))return;image.onload=image.onerror=null;outcomes[k]=s;done();};pending.add(cancel);
      image.onload=()=>{if(!pending.has(cancel))return;if(image.naturalWidth!==w||image.naturalHeight!==h){finish('failed');return;}
        try{
          ctx.drawImage(image,0,0,w,h);
          // Trowelled substrate under two thin limewash coats. Bare plaster's
          // full variegation makes a domestic soffit look damp at room distance.
          if(k==='plaster'){ctx.globalAlpha=.77;ctx.fillStyle='#e3dfd9';ctx.fillRect(0,0,w,h);ctx.globalAlpha=1;}
        }catch{finish('failed');return;}t.needsUpdate=true;finish('decoded');onReady();};
      image.onerror=()=>finish('failed');try{image.decoding='async';image.src=VILLA_INTERIOR_SWATCHES[k];}catch{finish('failed');}
    }));
  }
  return{maps,ready:Promise.all(jobs).then(()=>outcomes),dispose(){if(!live)return;live=false;for(const cancel of pending)cancel();for(const k of roles)maps[k].dispose();}};
}
/** Attach maps once, after all owners have built their sections. A dressing room
 * stile and a raised-panel cabinet share a swatch, not a single global grain axis.
 * Existing exterior paint isn't commissioned by a room's material role. */
export function bindRoomSurfaces(scene:THREE.Scene,maps:Record<RoomSwatch,THREE.Texture>){
  const seen=new Set<THREE.Material>();scene.traverse(o=>{
    if(!(o instanceof THREE.Mesh))return;
    for(const m of Array.isArray(o.material)?o.material:[o.material]){
      if(!(m instanceof THREE.MeshStandardMaterial)||seen.has(m))continue;seen.add(m);
      const k=m.userData.villaInteriorFinish as RoomSwatch,stock=m.userData.villaMillStock;
      if(stock){bindMillMaterial(m,maps[stock==='limestone'?'limestone':'oak'],stock);continue;}
      if(k&&roles.includes(k)){m.map=maps[k];m.color.set(m.userData.villaInteriorSwatchTint??0xffffff);m.needsUpdate=true;}
    }
  });
}
