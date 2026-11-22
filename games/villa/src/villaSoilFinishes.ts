import * as THREE from 'three';
import { VILLA_GROUND_SCANS } from './villaGroundScanData.js';

export type GroundSwatch=keyof typeof VILLA_GROUND_SCANS;
/** Bridge makers chart UVs in metres along each sawn face (including a separate end-cut
 * range); the paths have continuous metre X/Z charts. Reuse, don't re-upload, each swatch. */
export function dressSurveyedHardscape(root:THREE.Object3D,maps:Record<GroundSwatch,THREE.Texture>){
  root.traverse(o=>{if(!(o instanceof THREE.Mesh)||!(o.material instanceof THREE.MeshStandardMaterial))return;
    const m=o.material;
    if(m.name==='estate-walking-gravel'||m.name==='stream-walking-gravel'){m.map=maps.gravel;m.color.set(0xffffff);}
    if(m.name==='stream-bridge-timber'||m.name==='stream-bridge-framing'){
      m.map=maps.timber;m.color.set(m.name==='stream-bridge-timber'?0xf5f1e7:0xd1cec3);
      const uv=o.geometry.getAttribute('uv');if(uv)for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)/2.5,uv.getY(i)/.35);
    }
  });
}
const fallback:Record<GroundSwatch,readonly [string,number,number]>={turf:['#596f40',512,512],gravel:['#a69a83',1024,1024],timber:['#927552',1024,256]};
/** Decode bundled photo studies, not mutable network assets. Keep a valid first paint and
 * fixed GPU dimensions; all three asynchronous completions are bound to this scene. */
export function courtyardSwatches(onReady:()=>void){
  type Outcome = 'decoded' | 'failed' | 'cancelled';
  let live=true;
  const maps={} as Record<GroundSwatch,THREE.Texture>, pending=new Set<()=>void>(), tasks:Promise<void>[]=[];
  const outcomes:Record<GroundSwatch,Outcome>={turf:'failed',gravel:'failed',timber:'failed'};
  for(const kind of Object.keys(fallback) as GroundSwatch[]){
    const [tone,w,h]=fallback[kind],canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const c=canvas.getContext('2d')!;
    const stamp=document.createElement('canvas');stamp.width=stamp.height=48;const ink=stamp.getContext('2d')!;ink.fillStyle=tone;ink.fillRect(0,0,48,48);
    let seed=kind==='timber'?17:57;for(let i=0;i<740;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;ink.fillStyle=i%3?'rgba(242,230,194,.065)':'rgba(21,30,16,.12)';ink.fillRect((seed>>>10)%48,(seed>>>22)%48,kind==='timber'?7:1,1);}
    c.fillStyle=c.createPattern(stamp,'repeat')??tone;c.fillRect(0,0,w,h);
    const tex=new THREE.CanvasTexture(canvas);tex.name=`exterior/${kind}`;tex.colorSpace=THREE.SRGBColorSpace;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
    tex.minFilter=THREE.LinearMipmapLinearFilter;tex.magFilter=THREE.LinearFilter;tex.anisotropy=4;maps[kind]=tex;
    if(kind==='turf')tex.repeat.setScalar(2.5/1.25); // the unchanged terrain chart is metres / 2.5
    if (typeof Image==='undefined')continue;
    tasks.push(new Promise<void>(done=>{
      let image:HTMLImageElement;
      try { image=new Image(); } catch { done(); return; }
      const cancel=()=>finish('cancelled');
      const finish=(outcome:Outcome)=>{
        if(!pending.delete(cancel))return;
        image.onload=image.onerror=null;
        outcomes[kind]=outcome; done();
      };
      pending.add(cancel);
      image.onload=()=>{
        // A previously queued load can arrive after an error or scene disposal.
        if(!pending.has(cancel))return;
        if(image.naturalWidth!==w||image.naturalHeight!==h){finish('failed');return;}
        try { c.drawImage(image,0,0,w,h); } catch { finish('failed');return; }
        tex.needsUpdate=true;finish('decoded');onReady();
      };
      image.onerror=()=>finish('failed');
      try { image.decoding='async';image.src=VILLA_GROUND_SCANS[kind]; } catch { finish('failed'); }
    }));
  }
  return {maps,ready:Promise.all(tasks).then(()=>outcomes),dispose(){
    if(!live)return;live=false;
    for(const cancel of pending)cancel();
    for(const tex of Object.values(maps))tex.dispose();
  }};
}
