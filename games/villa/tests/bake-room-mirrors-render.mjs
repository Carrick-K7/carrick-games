/** Authoring page only. This exact local helper is fulfilled in memory by the
 * attested Playwright fixture. No SDK export, live hook or three.js copy. */
const assert = (x, why) => { if (!x) throw Error(why); };
const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const digest = async a => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a)), b => b.toString(16).padStart(2,'0')).join('');
export const faces = [
  { name:'front', look:[0,0,1],  up:[0,1,0],  right:[1,0,0] },
  { name:'right', look:[1,0,0],  up:[0,1,0],  right:[0,0,-1] },
  { name:'left',  look:[-1,0,0], up:[0,1,0],  right:[0,0,1] },
  { name:'up',    look:[0,1,0],  up:[0,0,-1], right:[1,0,0] },
  { name:'down',  look:[0,-1,0], up:[0,0,1],  right:[1,0,0] },
];
const furniture = 'Villa furnishings · oak, linen & terracotta';
export const capturePolicy = {
  // Unknown roots do NOT acquire permission to appear in a permanent reflection.
  // The closed privacy leaves and closed master wardrobe are real geometry.
  staticRoots:['villa-fabric-and-joinery','villa-stair-and-balustrades','villa-mortised-pergola','villa-terraces-and-pool',
    'villa-estate-fence','villa-smart-home',furniture,'Villa garden','villa-driving-course','villa-estate-additions',
    'villa-north-stream','villa-peripheral-copses','villa-shelter-planting','villa-cultivated-ground','villa-distant-ridges',
    'estate-lawn','estate-turf-shoulder','villa-contact-shadows'],
  furniture:['Batched villa details','Villa master bedroom','villa-suite-fittings','villa-snooker-table','bath-doors'],
  measuredGlass:{master:[2.394,1.274],dressing:[1.416,2.316],ensuite:[4.037,1.217],bath:[1.440,1.340],gym:[2.357,1.857]},
  excluded:'players, pets/dishes/shadows, aquarium life, all vehicles, carried chair/swing, vacuum, moving balls/cue, screens, rain, all silver',
};

/** Local camera right/up/front --> Villa world. This yields -X screen-right
 * for the +Z-facing mirror capture, as does Three's actual camera.lookAt(). */
export function toWorld([x,y,z], axis) { return [-axis[2]*x+axis[0]*z, y, axis[0]*x+axis[2]*z]; }
export function faceLookup(d, core, border) {
  let k=0, front=d[2];
  for(let i=1;i<faces.length;i++) { const v=dot(d,faces[i].look); if(v>front){front=v;k=i;} }
  const c=(core+2*border-1)/2, f=faces[k];
  // readPixels starts at the BOTTOM. A 2px rendered guard band supplies real
  // samples for bilinear footprints either side of a 90-degree face edge.
  return [k,c+core*.5*dot(d,f.right)/front,c+core*.5*dot(d,f.up)/front];
}
export function projectedLookup(u,v,core,border) {
  const x=u+v-1, y=u-v;
  return faceLookup([x,y,Math.max(0,1-Math.abs(x)-Math.abs(y))],core,border);
}
export function opaque(bytes,length) {
  if (bytes.length !== length) return false;
  for (let i=3;i<length;i+=4) if (bytes[i]!==255) return false;
  return true;
}

/** Decode exposure-one Reinhard/sRGB to actual scene radiance before bilinear
 * filtering. Each sample comes from one of FIVE furnished GL views, not art. */
export function projectFaces(raw, core, border, n) {
  const side=core+2*border;
  assert(raw.length===5 && raw.every(b=>opaque(b,side*side*4)), 'Wrong extent or nonopaque GL face');
  const light=Float64Array.from({length:256},(_,i)=>{const s=i/255,c=s<=.04045?s/12.92:((s+.055)/1.055)**2.4;return c/Math.max(1-c,1/64);});
  const encode=E=>{const c=E/(1+E);return 255*(c<=.0031308?12.92*c:1.055*c**(1/2.4)-.055);};
  const rgba=new Uint8ClampedArray(n*n*4);
  for(let j=0;j<n;j++) for(let i=0;i<n;i++) {
    const [f,s,t]=projectedLookup((i+.5)/n,(j+.5)/n,core,border), x=Math.floor(s), y=Math.floor(t);
    const p=raw[f], a=4*(y*side+x), fy=t-y, fx=s-x, q=(j*n+i)*4;
    for(let k=0;k<3;k++) rgba[q+k]=encode((1-fy)*((1-fx)*light[p[a+k]]+fx*light[p[a+k+4]])+fy*((1-fx)*light[p[a+k+side*4]]+fx*light[p[a+k+side*4+4]]));
    rgba[q+3]=255;
  }
  return rgba;
}

export function measureGlass(scene, sites, camera) {
  scene.updateMatrixWorld(true);
  const result={}, materials=new Map(), point=camera.position.clone(), normal=point.clone();
  for(const [room,site] of Object.entries(sites)) {
    const ax=site.axis, right=toWorld([1,0,0],ax), lo=[Infinity,Infinity], hi=[-Infinity,-Infinity];
    const found=new Set(); let vertices=0, faceOffset=-Infinity;
    scene.traverseVisible(o=>{
      if(!o.isMesh) return;
      const mats=(Array.isArray(o.material)?o.material:[o.material]).filter(m=>m.userData.villaMirrorRoom===room);
      if(!mats.length) return;
      assert(!Array.isArray(o.material)&&!o.isInstancedMesh, `Unreviewed glass grouping: ${room}`);
      mats.forEach(m=>found.add(m)); const p=o.geometry.getAttribute('position'), n=o.geometry.getAttribute('normal');
      for(let i=0;i<p.count;i++) {
        normal.fromBufferAttribute(n,i).transformDirection(o.matrixWorld);
        if(dot(normal.toArray(),ax)<.97) continue;
        point.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);
        const w=point.toArray().map((v,k)=>v-site.eye[k]), t=dot(w,ax);
        if(Math.abs(t)>.13) continue; // exclude the separate little tilted makeup compact in the same material batch
        const v=[dot(w,right),w[1]];
        for(let j=0;j<2;j++) {lo[j]=Math.min(lo[j],v[j]);hi[j]=Math.max(hi[j],v[j]);}
        vertices++; faceOffset=Math.max(faceOffset,t);
      }
    });
    const extent=hi.map((x,i)=>x-lo[i]);
    assert(found.size===1 && vertices>=4 && extent.every((v,i)=>Math.abs(v-capturePolicy.measuredGlass[room][i])<.08)
      && hi.every((v,i)=>Math.abs(v+lo[i])<.08) && faceOffset<=.005, `Wrong mirror site/face: ${room}, width,height=${extent}, offset=${faceOffset}`);
    result[room]={extent:extent.map(v=>+v.toFixed(4)), faceOffset:+faceOffset.toFixed(5), vertices};
    materials.set(room,[...found][0]);
  }
  return { result, materials };
}

export async function startCapture({release, recipe}) {
  const abi=await import(release.entry);
  assert(abi.id==='villa' && abi.version===release.version && abi.apiVersion===1,'Imported Villa ABI disagrees with pinned descriptor');
  const game=new abi.VillaGame({canvas:document.querySelector('canvas'),logicalWidth:640,logicalHeight:400,
    isDarkTheme:()=>false,isZhLang:()=>false,isPixelMode:()=>false,getRecord:()=>null,reportScore(){},requestShellRender(){},assetUrl:p=>release.base+p});
  try {
    await game.prepare(); // intentionally NO start/RAF, simulation advances or input
    const owner=game.scene, scene=owner?.scene, renderer=owner?.renderer;
    assert(scene && renderer && !game.running,'Offline survey needs the actual stopped Villa renderer');
    for(const [handle,keys] of [[owner.groundSwatches,['turf','gravel','timber']],[owner.roomSwatches,['oak','limestone','plaster']]]) {
      const state=await handle?.ready;
      assert(state && keys.every(k=>state[k]==='decoded'),'Refusing to photograph missing/fallback surface samples: '+JSON.stringify(state));
    }
    const daylight=owner.surveyedSun?.room?.map;
    assert(daylight?.isData3DTexture && daylight.image.data?.length>1000,'Furnished room daylight field missing');
    const gl=renderer.getContext(), info=gl.getExtension('WEBGL_debug_renderer_info'), gpu=info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL);
    assert(gl instanceof WebGL2RenderingContext && /SwiftShader/i.test(gpu) && gl.getContextAttributes().alpha===false && renderer.outputColorSpace==='srgb',`Unexpected capture GL path: ${gpu}`);
    if(owner.roomMirrors) await owner.roomMirrors.ready; // ignored during capture; only the independently baked study needs them
    const panes=measureGlass(scene,recipe.sites,owner.camera), furnitureRoot=scene.getObjectByName(furniture);
    assert(furnitureRoot && capturePolicy.furniture.every(n=>furnitureRoot.children.some(o=>o.name===n)), 'Incomplete fitted furniture roots');
    const keepRoots=new Set(capturePolicy.staticRoots), keptDirect=o=>o===owner.sun||o===owner.hemi||o===owner.ambient||
      (!o.name&&o.isMesh&&(o.material===owner.sky||o.geometry.type==='PlaneGeometry'&&o.renderOrder===9999));
    const exclude=[];
    for(const o of scene.children) if(!keptDirect(o)&&!keepRoots.has(o.name)) exclude.push(o);
    for(const o of furnitureRoot.children) if(!capturePolicy.furniture.includes(o.name)) exclude.push(o);
    // Keep actual road mesh and hardware, but no driving state or transient under it.
    for(const o of scene.getObjectByName('villa-driving-course')?.children??[]) if(o.name!=='garden-road') exclude.push(o);
    const s=game.state;
    Object.assign(s,{seated:null,snookerActive:false,fireplace:false,faucetOn:false,aquariumOn:false,gaming:false,displayLights:false});
    Object.assign(s.bathDoors,{west:false,east:false,progressW:0,progressE:0});
    for(const hinge of Object.values(s.wardrobes.wardrobes)) Object.assign(hinge,{open:false,progress:0});
    s.grillLids.fill(false);
    for(const name of ['west-near','west-far','east-near','east-far']) {
      const o=scene.getObjectByName('bath-door-'+name);
      assert(o?.userData.openFraction===0&&o.position.z===o.userData.closedZ,'Unsealed privacy leaf: '+name);
      let frit=false; o.traverse(child=>{if(child.isMesh&&child.material.name==='bath-door-privacy-frit'&&!child.material.transparent)frit=true;});
      assert(frit,'Missing opaque privacy treatment: '+name);
    }
    // As in actual play, soft CPU GL uses room daylight, cutouts, alpha blending,
    // emissive fittings and the six room slots, not another live shadow pass/IBL.
    assert(owner.lowSpec && !renderer.shadowMap.enabled && !scene.environment,'Expected game software lighting path');
    return { game,owner,scene,renderer,gl,gpu,recipe,panes,exclude,cam:owner.camera.clone(),initialTone:renderer.toneMapping };
  } catch (e) { await game.destroy(); throw e; }
}

function lighting(cap,room,layer,position) {
  const {game,owner,recipe}=cap, s=game.state, home=s.home, dark=layer>=2, lit=(layer&1)!==0;
  Object.assign(home,{timeOfDay:dark?'night':'day',darkness:+dark,weather:'clear',rain:0}); s.evening=dark;
  const lamp=recipe.lights[room]; assert(lamp in home.roomLights && lamp in home.lightLevels, 'Wrong switched lamp: '+room);
  for(const k of Object.keys(home.roomLights)) { home.roomLights[k]=lit&&k===lamp; home.lightLevels[k]=Number(home.roomLights[k]); }
  owner.updateActivities(0,s);
  owner.prepareVisuals(0,s,position); // actual material updates, atmosphere, room-light slots and exposure
  assert((owner.scene.getObjectByName('villa-home-light-slot-0')?.intensity>0)===lit,'Switch did not reach physical room-light slots');
  for(const o of cap.exclude) o.visible=false;
  for(const m of cap.panes.materials.values()) m.visible=false; // opaque backplate/frame remains; never bake another reflection
}

function aim(cap,xyz,look,up,fov,w,h) {
  const {cam,renderer}=cap;
  renderer.setPixelRatio(1); renderer.setSize(w,h,false); renderer.setRenderTarget(null); renderer.setScissorTest(false);
  cam.position.set(...xyz); cam.up.set(...up); cam.lookAt(xyz[0]+look[0],xyz[1]+look[1],xyz[2]+look[2]);
  cam.fov=fov; cam.aspect=w/h; cam.near=.02; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
  const real=cam.getWorldDirection(cam.position.clone()).toArray();
  assert(dot(real,look)/Math.hypot(...look)>.99999999, 'Incorrect optical camera basis');
}
function draw(cap) {
  const {gl,owner,renderer,cam}=cap, frame=renderer.info.render.frame;
  owner.drawWorld(cam);
  assert(renderer.info.render.frame>frame && renderer.info.render.calls>0 && renderer.info.render.triangles>100,'No actual furnished WebGL draw');
  const pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
  gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
  const error=gl.getError(); assert(!error&&!gl.isContextLost(),'Lost/failed mirror readback: '+error);
  return pixels;
}
function summary(bytes) {
  let s=0, ss=0; const hist=new Uint32Array(256);
  for(let i=0;i<bytes.length;i+=4){const y=.2126*bytes[i]+.7152*bytes[i+1]+.0722*bytes[i+2];s+=y;ss+=y*y;hist[Math.round(y)]++;}
  const n=bytes.length/4, mean=s/n;
  return {mean:+mean.toFixed(3),sd:+Math.sqrt(ss/n-mean*mean).toFixed(3),levels:hist.reduce((n,x)=>n+Number(x>0),0)};
}
const urlOf=(canvas,format,quality)=>{const s=canvas.toDataURL('image/'+format,quality), prefix='data:image/'+format+';base64,';assert(s.startsWith(prefix),'Browser did not encode '+format);return s.slice(prefix.length);};
// Independent optical audit of the visible IN-GAME silver. Empty or occluded
// geometry, a fixed painted UV, a room mixup, day at night or Y inversion must
// not pass just because the artist could save an attractive frame. The extra
// ID pass and all readbacks below exist only in this offline study.
function auditPane(cap,room,actual) {
  const {cam,renderer,recipe}=cap, m=cap.panes.materials.get(room), {eye,axis,lo,hi}=recipe.sites[room];
  const compile=m.onBeforeCompile, key=m.customProgramCacheKey, k=key.call(m), shader={vertexShader:'',fragmentShader:'',uniforms:{}};
  compile.call(m,shader,renderer);
  const map=shader.uniforms.villaMirrorPlate?.value, weights=shader.uniforms.villaMirrorWeights?.value?.toArray();
  assert(map?.isDataArrayTexture && map.name==='room-radiance/'+room && map.image.depth===4 && weights, 'Wrong or absent installed texture: '+room);
  let mask;
  try {
    m.onBeforeCompile=(s,r)=>{compile.call(m,s,r);s.fragmentShader=s.fragmentShader.replace('#include <dithering_fragment>','#include <dithering_fragment>\n gl_FragColor = vec4(1.,0.,1.,1.);');};
    m.customProgramCacheKey=()=>k+'|offline-mirror-id';m.needsUpdate=true; mask=draw(cap);
  } finally {m.onBeforeCompile=compile;m.customProgramCacheKey=key;m.needsUpdate=true;}
  const w=cap.gl.drawingBufferWidth,h=cap.gl.drawingBufferHeight, pixels=map.image.data, size=map.image.width,
    right=toWorld([1,0,0],axis), origin=cam.position.toArray(), face=cap.panes.result[room].faceOffset,
    plane=eye.map((v,k)=>v+axis[k]*face), at=cam.position.clone();
  const linear=Float64Array.from({length:256},(_,i)=>{const s=i/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;});
  const a=[],b=[];let covered=0;
  for(let y=2;y<h-2;y+=3)for(let x=2;x<w-2;x+=3){
    const j=4*(y*w+x);if(mask[j]<254||mask[j+1]>1||mask[j+2]<254)continue;covered++;
    const d=at.set((x+.5)*2/w-1,(y+.5)*2/h-1,.5).unproject(cam).sub(cam.position).normalize().toArray(), n=dot(d,axis);
    if(n>=-.001)continue;
    const t=dot(plane.map((v,k)=>v-origin[k]),axis)/n, p=origin.map((v,k)=>v+t*d[k]);
    // Stay well inside the flat face and away from anti-aliased trim/compact.
    const q=p.map((v,k)=>v-plane[k]), [width,height]=cap.panes.result[room].extent;
    if(Math.abs(dot(q,right))>width*.45||Math.abs(q[1])>height*.45)continue;
    const r=d.map((v,k)=>v-2*n*axis[k]), start=p.map((v,k)=>Math.max(lo[k]+.0001,Math.min(hi[k]-.0001,v)));
    const exit=Math.min(...r.map((v,k)=>Math.abs(v)<1e-10?Infinity:((v>0?hi:lo)[k]-start[k])/v));
    const hit=start.map((v,k)=>v+exit*r[k]-eye[k]), sx=dot(hit,right),sy=hit[1],len=Math.abs(sx)+Math.abs(sy)+Math.max(0,dot(hit,axis));
    const ix=Math.max(0,Math.min(size-1,Math.floor(size*(.5+.5*(sx+sy)/len)))),iy=Math.max(0,Math.min(size-1,Math.floor(size*(.5+.5*(sx-sy)/len))));
    let predicted=0;
    for(let layer=0;layer<4;layer++)if(weights[layer])for(let k=0;k<3;k++){
      const c=linear[pixels[4*((layer*size+iy)*size+ix)+k]];predicted+=weights[layer]*[.2126,.7152,.0722][k]*c/Math.max(1-c,1/64);
    }
    // Compress highlights before comparing to the real ACES display value.
    a.push((predicted/(1+predicted))**.48); b.push((.2126*actual[j]+.7152*actual[j+1]+.0722*actual[j+2])/255);
  }
  assert(covered*9>w*h*.025 && a.length>400, 'Actual glass is hidden/off camera: '+room);
  const mean=v=>v.reduce((z,x)=>z+x,0)/v.length, A=mean(a),B=mean(b);
  let aa=0,bb=0,ab=0;for(let i=0;i<a.length;i++){aa+=(a[i]-A)**2;bb+=(b[i]-B)**2;ab+=(a[i]-A)*(b[i]-B);}
  const correlation=ab/Math.sqrt(aa*bb),sd=Math.sqrt(bb/b.length);
  assert(correlation>.77 && sd>.014, `Visible ${room} glass does not match its finite room lookup (correlation ${correlation}, sd ${sd})`);
  return {pixels:a.length,visibleFraction:+(covered*9/(w*h)).toFixed(4),glassLuma:+B.toFixed(4),sd:+sd.toFixed(4),correlation:+correlation.toFixed(4)};
}
export function eyeView(cap,room,mode) {
  // Explicit, separate study output; never used as a plate or as its source SHA.
  const {recipe,renderer}=cap, {eye,axis}=recipe.sites[room], from=mode==='source', offset=mode==='left'?-.70:mode==='right'?.70:0;
  const add=toWorld([offset, from?0:.035, from?0:2.08],axis), p=eye.map((v,i)=>v+add[i]);
  lighting(cap,room,mode==='night'?2:1,{x:p[0],y:p[1],z:p[2]});
  if(!from) {
    assert(cap.owner.roomMirrors?.states?.[room]==='decoded',room+' has no installed photograph; rebuild the candidate before the glass study');
    cap.panes.materials.get(room).visible=true;
  }
  renderer.toneMapping=cap.initialTone;
  // From the room camera look towards the actual bed/island, rather than a
  // detail-free patch of plaster straight across a very wide bedroom.
  const target=from?toWorld(room==='master'?[-.80,-.16,1]:[0,-.10,1],axis):eye.map((v,i)=>v-p[i]);
  aim(cap,p,target,[0,1,0],from?80:51,768,480); const rgba=draw(cap);
  assert(opaque(rgba,768*480*4), 'Incomplete study frame');
  const png=urlOf(renderer.domElement,'png'); // save BEFORE the optional ID mask draw
  return {png,eye:p,stats:summary(rgba),optics:from?null:auditPane(cap,room,rgba)};
}
export async function captureRoom(cap,room) {
  const {recipe,renderer}=cap, {eye,axis}=recipe.sites[room], {core,border,size:n,quality}=recipe;
  const side=core+2*border, fov=2*Math.atan(side/core)*180/Math.PI, facesSHA256=[], projectedSHA256=[], stats=[];
  const atlas=document.createElement('canvas'); atlas.width=n; atlas.height=4*n;
  const ctx=atlas.getContext('2d'); assert(ctx,'No authoring canvas');
  try {
    for(let layer=0;layer<4;layer++) {
      lighting(cap,room,layer,{x:eye[0],y:eye[1],z:eye[2]});
      renderer.toneMapping=2; // Three.ReinhardToneMapping: E/(1+E). Keep actual lit geometry, not display-mapped ACES pixels.
      renderer.toneMappingExposure=1;
      const raw=[], hashes=[];
      for(const face of faces){
        aim(cap,eye,toWorld(face.look,axis),toWorld(face.up,axis),fov,side,side);
        const pixels=draw(cap); assert(cap.gl.drawingBufferWidth===side&&cap.gl.drawingBufferHeight===side,'Wrong capture resolution');
        raw.push(pixels); hashes.push(await digest(pixels));
      }
      const rgba=projectFaces(raw,core,border,n), data=new ImageData(rgba,n,n);
      ctx.putImageData(data,0,layer*n); facesSHA256.push(hashes); projectedSHA256.push(await digest(rgba)); stats.push(summary(rgba));
      assert(stats[layer].sd>4 && stats[layer].levels>35, `Blank/underexposed room ${room}/${layer}: ${JSON.stringify(stats[layer])}`);
    }
    assert(stats[2].mean<stats[0].mean && stats[2].mean<stats[3].mean, `Off/night optics did not get darker: ${room} ${JSON.stringify(stats)}`);
    return {room,glass:cap.panes.result[room],facesSHA256,projectedSHA256,stats,encoded:urlOf(atlas,'webp',quality)};
  } finally { atlas.width=atlas.height=0; }
}
