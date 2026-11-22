import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createVillaRoomMirror, decodeVillaMirrorPlate, installVillaRoomMirrors, setVillaMirrorWeights } from '../src/villaInteriorMirror.js';
import { mirrorPlateDirection, VILLA_MIRROR_BUDGET, VILLA_MIRROR_LAYERS, VILLA_MIRROR_ROOMS, VILLA_MIRROR_SITES, VILLA_MIRROR_SIZE, type MirrorRoom } from '../src/villaMirrorPlateLayout.js';
import { VILLA_MIRROR_FRAGMENT, VILLA_MIRROR_LOOKUP } from '../src/villaMirrorPlateOptics.js';
import { furnishVilla } from '../src/villaFurnishings.js';
import { capturePolicy, faceLookup, faces, measureGlass, opaque, projectFaces, toWorld } from './bake-room-mirrors-render.mjs';
import { mirrorOptions, plateHeader, roomSources, verifyMirrorEntry, verifyReceipt } from './bake-room-mirrors.mjs';
import { sampleMirrorShader } from './bake-room-mirrors-optics.mjs';

// No browser/network/build/store in the normal unit gate. A held decoder is
// intentional here; a separate test below reads and authenticates the REAL plates.
vi.mock('../src/villaMirrorPlateData.js', () => ({ VILLA_MIRROR_PLATES:{master:'QUJD',dressing:'RkZH',ensuite:'SElL',bath:'TE1O',gym:'T1BR'} }));
afterEach(()=>vi.unstubAllGlobals());
const digest=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
const V=(a:readonly number[])=>new THREE.Vector3(a[0],a[1],a[2]);
function fixture(rooms: readonly MirrorRoom[]) {
  const scene=new THREE.Scene(), geometry=new THREE.PlaneGeometry(), silver=rooms.map(r=>createVillaRoomMirror(r));
  const wall=new THREE.MeshStandardMaterial(); scene.add(new THREE.Mesh(geometry,wall));
  for(const m of silver) scene.add(new THREE.Mesh(geometry,m));
  return {scene,silver,wall,close(){geometry.dispose();silver.forEach(m=>m.dispose());wall.dispose();scene.clear();}};
}
function images() {
  const views:ImageStub[]=[];
  class ImageStub {
    naturalWidth:number=VILLA_MIRROR_SIZE; naturalHeight:number=VILLA_MIRROR_SIZE*4; src='';
    onload:(()=>void)|null=null; onerror:(()=>void)|null=null;
    constructor(){views.push(this);} removeAttribute(){this.src='';}
  }
  const control={alpha:255, throws:false}, canvases:{width:number;height:number}[]=[];
  vi.stubGlobal('Image',ImageStub);
  vi.stubGlobal('document',{createElement:()=>{
    const c={width:0,height:0,getContext:()=>({drawImage:()=>{if(control.throws)throw Error('unavailable pixels');},getImageData:()=>{
      const data=new Uint8ClampedArray(c.width*c.height*4).fill(255);data[3]=control.alpha;return {data};
    }})};canvases.push(c);return c;
  }});
  return {views,control,canvases};
}
function shader(m:THREE.MeshStandardMaterial) {
  const lib=THREE.ShaderLib.standard;
  const result={uniforms:{},vertexShader:lib.vertexShader,fragmentShader:lib.fragmentShader} as Parameters<typeof m.onBeforeCompile>[0];
  m.onBeforeCompile(result,{} as THREE.WebGLRenderer);return result;
}
const tick=async()=>{await Promise.resolve();await Promise.resolve();};

describe('offline furnished mirror optics',()=>{
  it('finds a room-sized facing silver surface at each surveyed datum in the actual furnishings, not its trim',()=>{
    const scene=new THREE.Scene(), context=new Proxy({},{get:()=>()=>undefined,set:()=>true});
    vi.stubGlobal('document',{createElement:()=>({getContext:()=>context})});
    try {
      furnishVilla(scene);scene.updateMatrixWorld(true);
      const {result,materials}=measureGlass(scene,VILLA_MIRROR_SITES,new THREE.PerspectiveCamera());
      expect([...materials.keys()]).toEqual([...VILLA_MIRROR_ROOMS]);
      for(const room of VILLA_MIRROR_ROOMS){
        const site=VILLA_MIRROR_SITES[room], n=V(site.axis), e=V(site.eye), pane=materials.get(room)!;
        const ray=new THREE.Raycaster(e.clone().addScaledVector(n,.25),n.clone().negate(),0,.39);
        const meshes:THREE.Mesh[]=[];scene.traverse(o=>{if(o instanceof THREE.Mesh&&o.material===pane)meshes.push(o);});
        const hit=ray.intersectObjects(meshes)[0];expect(hit).toBeDefined();
        expect(hit.face!.normal.clone().transformDirection(hit.object.matrixWorld).dot(n)).toBeGreaterThan(.98);
        expect(result[room].extent[0]).toBeCloseTo(capturePolicy.measuredGlass[room][0],1);
        expect(pane.transparent).toBe(false);expect(pane.userData.villaMirrorRoom).toBe(room);
      }
      const unrelated=new THREE.MeshStandardMaterial();scene.add(new THREE.Mesh(new THREE.PlaneGeometry(8,5),unrelated));
      expect(unrelated.userData.villaMirrorRoom).toBeUndefined();
    } finally {
      const g=new Set<THREE.BufferGeometry>(),m=new Set<THREE.Material>(),t=new Set<THREE.Texture>();
      scene.traverse(o=>{if(o instanceof THREE.Mesh){g.add(o.geometry);for(const mat of Array.isArray(o.material)?o.material:[o.material])m.add(mat);}});
      m.forEach(mat=>{for(const v of Object.values(mat))if(v instanceof THREE.Texture)t.add(v);mat.dispose();});t.forEach(x=>x.dispose());g.forEach(x=>x.dispose());scene.clear();
    }
  });
  it('projects real face coverage across quadrant boundaries; camera right, top row, and oblique azimuth are not flipped',()=>{
    const core=16,border=2,n=65,s=core+2*border,raw=faces.map((face:{look:number[];right:number[];up:number[]})=>{
      const out=new Uint8Array(s*s*4),eye=V(face.look),right=V(face.right),up=V(face.up);
      for(let j=0;j<s;j++)for(let i=0;i<s;i++){
        const d=eye.clone().addScaledVector(right,(2*i+1-s)/core).addScaledVector(up,(2*j+1-s)/core).normalize();
        out.set([Math.round(119+82*d.x),Math.round(117+72*d.y),Math.round(95+95*d.z),255],4*(s*j+i));
      }return out;
    });
    const rgba=projectFaces(raw,core,border,n);expect(opaque(rgba,n*n*4)).toBe(true);
    for(let j=0;j<n;j+=4)for(let i=0;i<n;i+=4){
      const [x,y,z]=mirrorPlateDirection((i+.5)/n,(j+.5)/n), p=4*(j*n+i);
      for(const [k,want] of [119+82*x,117+72*y,95+95*z].entries())expect(Math.abs(rgba[p+k]-want)).toBeLessThan(2.1);
    }
    // Hemisphere FRONT points out into the room, not towards the mirror backing.
    const camera=new THREE.PerspectiveCamera();for(const site of Object.values(VILLA_MIRROR_SITES)){
      camera.position.set(...site.eye);camera.up.set(0,1,0);camera.lookAt(V(site.eye).add(V(site.axis)));camera.updateMatrixWorld(true);
      expect(V(toWorld([1,0,0],site.axis)).distanceTo(new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion))).toBeLessThan(1e-8);
    }
    expect(faceLookup([1,0,0],core,border)[0]).toBe(1);expect(faceLookup([0,-1,0],core,border)[0]).toBe(4);
    raw[4][31]=0;expect(()=>projectFaces(raw,core,border,n)).toThrow(/nonopaque/);
  });
  it('uses independent day/night and real room-switch endpoints including the wardrobe switch',()=>{
    const w=new THREE.Vector4(), home={darkness:0,rain:0,roomLights:{master:true,wardrobe:false,dressing:true},lightLevels:{master:1,wardrobe:0}};
    setVillaMirrorWeights(w,'master',home);expect(w.toArray()).toEqual([0,1,0,0]);
    setVillaMirrorWeights(w,'dressing',home);expect(w.toArray()).toEqual([1,0,0,0]);
    home.darkness=1;setVillaMirrorWeights(w,'dressing',home);expect(w.toArray()).toEqual([0,0,1,0]);
    setVillaMirrorWeights(w,'master',home);expect(w.toArray()).toEqual([0,0,0,1]);
    home.darkness=.44;home.lightLevels.wardrobe=.4;setVillaMirrorWeights(w,'dressing',home);
    expect(w.x+w.y+w.z+w.w).toBeCloseTo(1,9);expect(w.y+w.w).toBeCloseTo(.4,9);
    const clear=w.x+w.y;home.rain=1;setVillaMirrorWeights(w,'dressing',home);expect(w.x+w.y).toBeLessThan(clear);
  });
});

describe('instance-bound mirror plates',()=>{
  it('decodes serially, reuses the one per-room map on repeated material slots, and retires its own GL/CPU data exactly once',async()=>{
    const {views,canvases}=images(), a=fixture(VILLA_MIRROR_ROOMS), b=fixture(['master']);
    a.scene.add(new THREE.Mesh(a.scene.children[0] instanceof THREE.Mesh?a.scene.children[0].geometry:undefined,a.silver[0]));
    const prev=a.silver[0].onBeforeCompile,previousKey=a.silver[0].customProgramCacheKey, redraw=vi.fn(), other=vi.fn();
    a.silver[0].onBeforeCompile=(s)=>{s.uniforms.villaExisting={value:31};};const before=a.silver[0].onBeforeCompile;
    const handle=installVillaRoomMirrors(a.scene,redraw);const retired=installVillaRoomMirrors(b.scene,other);
    try {
      expect(views).toHaveLength(2); const stale=views[1].onload!;
      retired.dispose();await retired.ready;stale();expect(retired.states.master).toBe('cancelled');expect(other).not.toHaveBeenCalled();
      handle.update({darkness:1,rain:0,lightLevels:{},roomLights:{}});
      for(const [i,room] of VILLA_MIRROR_ROOMS.entries()){
        const im=views[i===0?0:i+1];expect(im.src).toMatch(/^data:image\/webp;base64,/);expect(im.onload).toBeTypeOf('function');
        im.onload!();await tick();expect(im.onload).toBeNull();expect(handle.states[room]).toBe('decoded');
      }
      await handle.ready;expect(redraw).toHaveBeenCalledTimes(5);expect(canvases.every(c=>c.width===0&&c.height===0)).toBe(true);
      const shaders=a.silver.map(shader), maps=shaders.map(s=>s.uniforms.villaMirrorPlate.value as THREE.DataArrayTexture);
      expect(shaders[0].uniforms.villaExisting.value).toBe(31);expect(shaders[0].uniforms.villaMirrorWeights.value.toArray()).toEqual([0,0,1,0]);
      expect(shaders[0].fragmentShader).toContain(VILLA_MIRROR_LOOKUP);expect(a.wall.onBeforeCompile).toBe(prev);
      expect(new Set(maps).size).toBe(5);for(const m of maps){expect(m.isDataArrayTexture).toBe(true);expect(m.isRenderTargetTexture).toBe(false);expect(m.flipY).toBe(false);expect(m.image.depth).toBe(4);expect(m.generateMipmaps).toBe(true);expect(m.colorSpace).toBe(THREE.SRGBColorSpace);}
      const dispose=maps.map(m=>vi.spyOn(m,'dispose')),keep=a.silver.map(m=>vi.spyOn(m,'dispose'));
      handle.dispose();handle.dispose();dispose.forEach(s=>expect(s).toHaveBeenCalledTimes(1));keep.forEach(s=>expect(s).not.toHaveBeenCalled());
      expect(maps.every(m=>m.image.data===null)).toBe(true);expect(shaders.every(s=>s.uniforms.villaMirrorPlate.value===null)).toBe(true);
      expect(a.silver[0].onBeforeCompile).toBe(before);expect(a.silver[0].customProgramCacheKey).toBe(previousKey);
    } finally {handle.dispose();retired.dispose();a.close();b.close();}
  });
  it('continues with polished silver on invalid extent, alpha, decode/draw failures, and discards late completions',async()=>{
    const {views,control}=images(),a=fixture(VILLA_MIRROR_ROOMS),ready=vi.fn(),handle=installVillaRoomMirrors(a.scene,ready);
    try {
      views[0].naturalHeight--;views[0].onload!();await tick();control.alpha=127;views[1].onload!();await tick();
      control.alpha=255;control.throws=true;views[2].onload!();await tick();views[3].onerror!();await tick();
      const last=views[4].onload!;handle.dispose();last();await handle.ready;
      expect(Object.values(handle.states)).toEqual(['failed','failed','failed','failed','cancelled']);expect(ready).not.toHaveBeenCalled();
      expect(a.silver.every(m=>m.onBeforeCompile===THREE.Material.prototype.onBeforeCompile)).toBe(true);
      expect(await decodeVillaMirrorPlate('bath','A'.repeat(4*(VILLA_MIRROR_BUDGET.perRoomBytes/3+1)),new AbortController().signal)).toBeNull();expect(views).toHaveLength(5);
    } finally {handle.dispose();a.close();}
  });
});

describe('attested room photograph provenance',()=>{
  it('allows a source write only with explicit local origin, full revision and independently matching immutable entry bytes',()=>{
    const b=Buffer.from('pinned game'), hash=digest(b), env={VILLA_AUDIT_BASE:'http://127.0.0.1:8191',VILLA_AUDIT_REVISION:'a0'.repeat(20),VILLA_AUDIT_ENTRY_SHA256:hash};
    expect(mirrorOptions([],{}).mode).toBe('--check');expect(mirrorOptions(['--write'],env).mode).toBe('--write');
    for(const k of Object.keys(env))expect(()=>mirrorOptions(['--write'],{...env,[k]:undefined})).toThrow();
    for(const bad of ['http://example.invalid','http://user@localhost','https://localhost/?other=1','file:///tmp/','http://localhost/not-origin'])expect(()=>mirrorOptions(['--write'],{...env,VILLA_AUDIT_BASE:bad})).toThrow();
    for(const args of [['--write','master'],['--source','../master'],['--study'],['--check','--write']])expect(()=>mirrorOptions(args,env)).toThrow();
    expect(verifyMirrorEntry(hash,hash,b,b)).toBe(hash);const wrong=Buffer.from('rebuilt');
    for(const [pin,d,served,disk] of [[digest(wrong),hash,b,b],[hash,hash,b,wrong],[hash,hash,wrong,b],[hash,digest(wrong),b,b]] as const)expect(()=>verifyMirrorEntry(pin,d,served,disk)).toThrow();
  });
  it('authenticates all shipped room plates, independent capture inputs, provenance, budgets and night response',async()=>{
    const data=await vi.importActual<typeof import('../src/villaMirrorPlateData.js')>('../src/villaMirrorPlateData.js');
    const receipt=JSON.parse(readFileSync(new URL('./bake-room-mirrors.provenance.json',import.meta.url),'utf8'));
    const records=receipt.rooms.map((r:{room:MirrorRoom})=>({...r,encoded:data.VILLA_MIRROR_PLATES[r.room]})), result=roomSources(records);
    verifyReceipt(receipt,result);expect(data.VILLA_MIRROR_SOURCE_SHA256).toBe(result.sourceSha256);
    expect(readFileSync(new URL('../src/villaMirrorPlateData.ts',import.meta.url),'utf8')).toBe(result.source);
    expect(result.source).not.toContain(receipt.authoring.entrySha256);expect(result.source).not.toContain(receipt.authoring.revision);
    const digests=new Set();let gpuBytes=0;
    for(const r of receipt.rooms){
      const dataBytes=Buffer.from(data.VILLA_MIRROR_PLATES[r.room as MirrorRoom],'base64');expect(plateHeader(dataBytes)).toEqual([384,1536]);
      expect(digest(dataBytes)).toBe(r.encodedSha256);expect(dataBytes.length).toBe(r.bytes);expect(new Set(r.projectedSHA256).size).toBe(4);
      expect(r.stats[2].mean).toBeLessThan(r.stats[0].mean);expect(r.stats[2].mean).toBeLessThan(r.stats[3].mean);digests.add(r.encodedSha256);
      let n:number=VILLA_MIRROR_SIZE;for(;;){gpuBytes+=4*VILLA_MIRROR_LAYERS.length*n*n;if(n===1)break;n=Math.max(1,n>>1);}
    }
    expect(digests.size).toBe(5);expect(gpuBytes).toBeLessThanOrEqual(VILLA_MIRROR_BUDGET.gpuBytes);
    // Chromium's sRGB ICC is retained, not silently stripped. Neither an alpha
    // flag nor a tampered transfer profile can masquerade as the attested plate.
    const transport=Buffer.from(data.VILLA_MIRROR_PLATES.master,'base64');
    if(transport.toString('ascii',12,16)==='VP8X') {
      const alpha=Buffer.from(transport);alpha[20]|=0x10;expect(()=>plateHeader(alpha)).toThrow(/ICC/);
      const wrongICC=Buffer.from(transport);wrongICC[38]^=1;expect(()=>plateHeader(wrongICC)).toThrow(/ICC/);
    }
    expect(receipt.rooms.some((r:{stats:{partial:number;minAlpha:number}[]})=>r.stats.some(s=>s.partial>0&&s.minAlpha<255))).toBe(true);
    const change=structuredClone(records);change[0].facesSHA256[1][2]='01'.repeat(32);expect(roomSources(change).sourceSha256).not.toBe(result.sourceSha256);
  });
});

/** Independent CPU optical solution (actual slab ray vs shader's fast exit).
 * World-position and camera translate together for one pair: an infinite cube
 * reflection would produce identical pixels, the finite opposite wall cannot. */
function chartSample(room:MirrorRoom,pointX:number,eyeX:number,eyeY:number,back=false) {
  const s=VILLA_MIRROR_SITES[room],e=V(s.eye),n=V(s.axis),up=new THREE.Vector3(0,1,0),right=n.clone().cross(up);
  const p=e.clone().addScaledVector(right,pointX).addScaledVector(n,-.02),eye=p.clone().addScaledVector(right,eyeX).addScaledVector(up,eyeY).addScaledVector(n,back?-2:2);
  const cam=new THREE.PerspectiveCamera();cam.position.copy(eye);cam.lookAt(p);cam.updateMatrixWorld(true);
  const i=p.clone().sub(eye).normalize(),r=i.clone().reflect(n),lo=V(s.lo),hi=V(s.hi);
  const start=p.clone().clamp(lo.clone().addScalar(.0001),hi.clone().addScalar(-.0001)),hit=new THREE.Vector3();
  new THREE.Ray(start,r).intersectBox(new THREE.Box3(lo,hi),hit);hit.sub(e);
  const x=hit.dot(right),y=hit.y,L1=Math.abs(x)+Math.abs(y)+Math.max(0,hit.dot(n));
  const uv=[.5+.5*(x+y)/L1,.5+.5*(x-y)/L1],q=uv.map(v=>(Math.max(0,Math.min(63,Math.floor(64*v)))+.5)/64);
  const weights=[.175,.075,.525,.225];
  const result=back?[.3,.3,.3]:[.12+.70*q[0],.08+.76*q[1],weights.reduce((sum,w,k)=>sum+w*(.10+.16*k),0)].map((v,i)=>.014*.3+[.927,.953,.941][i]*v);
  return {expected:result,uniforms:{cameraPosition:eye.toArray(),vViewPosition:p.clone().applyMatrix4(cam.matrixWorldInverse).negate().toArray(),normal:n.clone().transformDirection(cam.matrixWorldInverse).toArray(),villaMirrorEye:s.eye,villaMirrorAxis:s.axis,villaMirrorLo:s.lo,villaMirrorHi:s.hi},matrix:cam.matrixWorldInverse.toArray(),weights};
}
it.skipIf(process.env.VILLA_MIRROR_GL!=='1')('renders the actual silver GLSL against all five finite rooms, rotated cameras, reversed winding and translated rays',async()=>{
  const cases=VILLA_MIRROR_ROOMS.flatMap(room=>[[0,0,0],[.62,0,0],[0,.7,-.31],[0,-.7,.31],[.18,-4,1.4],[0,.1,.1,true]].map(([p,x,y,b])=>chartSample(room,Number(p),Number(x),Number(y),!!b)));
  const rgba=await sampleMirrorShader(cases,VILLA_MIRROR_LOOKUP,VILLA_MIRROR_FRAGMENT);
  for(const [i,p] of rgba.entries()) {expect(p[3]).toBe(255);for(let k=0;k<3;k++)expect(Math.abs(p[k]/255-cases[i].expected[k])).toBeLessThan(.014);}
  expect(rgba[1][0]-rgba[0][0]).toBeGreaterThan(2);expect(rgba[3][0]-rgba[2][0]).toBeGreaterThan(8);
},30000);
