// Browser half of the manual study. No runtime import, global game API or new shader clock.
const check = (ok, why) => { if (!ok) throw Error(why); };
const bytes = c => c.toDataURL('image/png').split(',')[1];
export async function openStudy(release) {
  const abi = await import(release.entry);
  check(abi.id === 'villa' && abi.version === release.version && abi.apiVersion === 1, 'Wrong imported Villa ABI');
  const g = abi.create({canvas:document.querySelector('canvas'), logicalWidth:1164, logicalHeight:655,
    isDarkTheme:()=>false, isZhLang:()=>false, isPixelMode:()=>false, getRecord:()=>null, reportScore(){}, requestShellRender(){}, assetUrl:p=>release.base+p});
  await g.prepare(); g.start(); cancelAnimationFrame(g.animationId); g.audio?.setEnabled(false);
  const s = g.scene, gl = s.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
  check(s.lowSpec && gl instanceof WebGL2RenderingContext && /swiftshader/i.test(gpu), 'Use the calibrated SwiftShader world raster');
  for (const [handle, keys] of [[s.groundSwatches,['turf','gravel','timber']], [s.roomSwatches,['oak','limestone','plaster']], [s.roomMirrors,['master','dressing','ensuite','bath','gym']]]) {
    const ready = await handle?.ready, states = handle?.states ?? ready;
    check(keys.every(k=>states?.[k] === 'decoded'), 'Missing/mismatched release art: ' + JSON.stringify(states));
  }
  const {width:w, height:h} = s.cachedFrame;
  check(w === 640 && h === 360, `Expected the actual 640×360 world buffer, got ${w}×${h}`);
  warmDay(g);
  return {g,s,gpu,w,h};
}
// Start from the normal evening entrance. Use the game's own setting action and
// let daylight settle; changing exposure while filming would be a false positive.
function warmDay(g) {
  for (let i=0; i<3 && g.state.home.timeOfDay!=='day'; i++) g.activate('time');
  for (let i=0; i<240; i++) g.update(.05);
}
export function beginClip(cap, pose) {
  // Reuse the loaded renderer. Reset the game model and its own time rather
  // than rebuilding the heavy Three scene or leaking additional browser RAFs.
  const {g}=cap;
  if(cap.pose){g.init();warmDay(g);}
  return place(cap,pose);
}
export function place(cap, pose, shell=false) {
  const {g,s} = cap, {x,z,tx,tz,pitch,crouch} = pose;
  g.keys.clear(); g.position = {x,y:0,z};
  const support = g.supportAt(x,z,0,1.75);
  check(support !== null, `Unsupported camera ${pose.id} at ${x},${z}`);
  g.position.y = g.eyeY = support; g.yaw = Math.atan2(x-tx,z-tz); g.pitch = pitch;
  Object.assign(g.motion, {offset:0,velocity:0,crouched:!!crouch,stance:Number(!!crouch)});
  check(g.canFit(crouch ? 1.05 : 1.75) && g.canFit(1.75), `Camera cannot stand on ${pose.id}`);
  const home=g.state.home;
  check(home.weather==='clear' && home.rain===0 && (shell ? home.timeOfDay==='evening' && home.darkness===.43 : home.timeOfDay==='day' && home.darkness===0), 'Expected a settled clear lighting endpoint');
  const water = s.scene.getObjectByName(pose.mesh);
  check(water?.isMesh && !Array.isArray(water.material), 'Missing water mesh: ' + pose.mesh);
  cap.water = water; cap.pose = pose;
  let approach;
  if(['creek','pond','pool'].includes(pose.id)){
    // Test a continuous dry-side approach with Villa's own body-radius and
    // overhead/solid obstacles, never an unobstructed flying camera.
    const run=Math.hypot(x-tx,z-tz),points=[];let y=support;
    for(let i=0;i<=12;i++){
      const u=x+(x-tx)/run*i*.08,v=z+(z-tz)/run*i*.08; y=g.supportAt(u,v,y,1.75);
      check(y!==null && g.canFit(1.75,{x:u,y,z:v}), 'Blocked dry approach to '+pose.id);points.push([u,y,v]);
    }
    check(g.supportAt(tx,tz,support,1.75)===null,'Look target is not game-excluded water');
    approach={testedDryMetres:.96,stepMetres:.08,standingFitSamples:points.length,from:points.at(-1),toward:points[0],unsupportedLookTarget:[tx,tz]};
  }
  return {position:{...g.position}, floorSupport:support, stance:crouch?'crouched':'standing', fitsStanding:true, eyeHeight:crouch ? .9 : 1.65,
    yaw:g.yaw, pitch:g.pitch, mesh:water.name, material:water.material.name,approach};
}
// Explicit inspection samples only. Advance the REAL update(dt); cache invalidation is
// solely to read one fresh primary camera picture per scheduled sample on software GL.
export function fresh(cap, dt = 0) {
  const {g,s,w,h} = cap;
  if (dt) g.update(dt);
  const n = s.renderer.info.render.frame;
  s.invalidateCameraFrame(); g.renderFrame();
  check(s.cachedTime === g.time && s.renderer.info.render.frame > n && !s.readback?.pending, 'Stale world frame');
  const eye = g.view(), cam = s.camera;
  check(Math.abs(cam.position.y-eye.y-eye.eyeHeight) < 1e-6 && cam.position.x === eye.x && cam.position.z === eye.z && Math.abs(cam.rotation.x-eye.pitch) < 1e-8 && Math.abs(cam.rotation.y-eye.yaw) < 1e-8, 'Wrong primary eye');
  check(s.cachedFrame.width === w && s.cachedFrame.height === h, 'World raster changed');
  check(!s.renderer.info.programs.some(p=>p.diagnostics && !p.diagnostics.runnable), 'Non-runnable shader');
  return {time:g.time, eye:cam.position.toArray(), fov:cam.fov, aspect:cam.aspect, matrix:cam.matrixWorld.elements.slice(), frame:s.renderer.info.render.frame, waterMatrix:cap.water.matrixWorld.elements.slice(), png:bytes(s.cachedFrame)};
}

// Diagnostic draw ONLY, after a genuine frame. Preserve water geometry, shader's
// vertex transform, sidedness, draw order, depth test and the other scene objects
// (rocks/reeds/ladder/bridge). Replace just the target's final fragment output.
// Antialiasing/mixed coverage does not earn a water label. No tagged draw is film.
export function surfaceId(cap) {
  const {s,water,w,h} = cap, original = water.material, tag = original.clone();
  tag.onBeforeCompile = (shader,r) => {
    original.onBeforeCompile.call(original,shader,r);
    const last='#include <dithering_fragment>';
    check(shader.fragmentShader.includes(last),'Unrecognised water shader');
    shader.fragmentShader=shader.fragmentShader.replace(last,last+'\n gl_FragColor = vec4(1.,0.,1.,1.);');
  };
  tag.customProgramCacheKey = ()=>'villa-water-visible-ID:'+original.customProgramCacheKey();
  try {
    water.material=tag; s.drawWorld(s.camera);
    const c=document.createElement('canvas'); c.width=w;c.height=h;
    const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(s.renderer.domElement,0,0);
    const im=ctx.getImageData(0,0,w,h); let count=0;
    for(let k=0;k<im.data.length;k+=4){const d=im.data, waterOnly=d[k]===255 && d[k+1]===0 && d[k+2]===255;
      d[k]=d[k+1]=d[k+2]=waterOnly?255:0;d[k+3]=255;count+=Number(waterOnly);}
    ctx.putImageData(im,0,0); check(count>w*h*.06,'Too little visible target water: '+count);return {count,png:bytes(c)};
  } finally {water.material=original;tag.dispose();}
}

// A -> B -> EXACT A. Hold simulation state fixed in these separate diagnostic
// draws. Pass time through the same primary VillaScene.render as game.draw;
// never set game.time, a texture offset or a material's time uniform.
export function repeatClock(cap) {
  const {g,s}=cap,t=g.time,c=document.createElement('canvas');c.width=g.width;c.height=g.height;
  const ctx=c.getContext('2d');
  const draw=time=>{s.invalidateCameraFrame();s.render(ctx,g.width,g.height,g.pixelRatio,g.view(),time,g.state);
    check(s.cachedTime===time && !s.readback?.pending,'Stale replay');return bytes(s.cachedFrame);};
  const a=s.camera.matrixWorld.toArray(), waterA=cap.water.matrixWorld.toArray();
  const alternate=draw(t+.677), cameraB=s.camera.matrixWorld.toArray(), waterBY=cap.water.matrixWorld.elements[13];
  const repeat=draw(t),cameraA2=s.camera.matrixWorld.toArray(),waterA2=cap.water.matrixWorld.toArray();
  check(a.every((v,i)=>v===cameraB[i] && v===cameraA2[i]) && waterA.every((v,i)=>v===waterA2[i]),'Clock replay altered camera or water transform at identical time');
  return {firstTime:t,alternateTime:t+.677,alternate,repeat,cameraMatrixExact:true,waterMatrixExact:true,waterY:[waterA[13],waterBY,waterA2[13]]};
}

// Read the actual bank-to-bank strips in this pinned geometry. Project several
// fixed world-space lanes through the interior, not screen-right = downstream.
// At every X interpolate between the measured pairs. The output uses pixel
// CENTRES (top-left origin) for bilinear sampling of the native lossless frame.
export function transects(cap) {
  const {water,s,pose,w,h}=cap, pos=water.geometry.getAttribute('position'), sections=[];
  const uv=water.geometry.getAttribute('uv'), signed=water.geometry.getAttribute('waterSection'), p=s.camera.position.clone();
  for(let i=0;i<pos.count;i+=2){
    const a=p.fromBufferAttribute(pos,i).applyMatrix4(water.matrixWorld).toArray(), b=p.fromBufferAttribute(pos,i+1).applyMatrix4(water.matrixWorld).toArray();
    check(Math.abs(a[0]-b[0])<.001 && a[2]<b[2] && Math.abs(a[1]+.12)<1e-5 && Math.abs(b[1]+.12)<1e-5 && (i===0||a[0]>sections.at(-1).x),'Changed physical bank topology');
    check(signed ? signed.getZ(i)===-1 && signed.getZ(i+1)===1 : uv.getY(i)===0 && uv.getY(i+1)===1,'Not opposite stream banks');
    sections.push({x:a[0],a,b});
  }
  const dx=.0125, first=pose.x-5, columns=801;
  const fractions=[.18,.26,.34,.42,.50,.58,.66,.74,.82], rows=fractions.map(f=>{
    let j=0; const row=[];
    for(let i=0;i<columns;i++){
      const x=first+i*dx;while(j+2<sections.length && sections[j+1].x<x)j++;
      const a=sections[j],b=sections[j+1],t=(x-a.x)/(b.x-a.x),interp=k=>(a.a[k]*(1-f)+a.b[k]*f)*(1-t)+(b.a[k]*(1-f)+b.b[k]*f)*t;
      p.set(x,interp(1),interp(2)).project(s.camera);
      const u=(.5+.5*p.x)*w-.5,v=(.5-.5*p.y)*h-.5;
      row.push(p.z>0 && p.z<1 && u>=1 && v>=1 && u<w-2 && v<h-2 ? [+u.toFixed(4),+v.toFixed(4)] : null);
    }return row;
  });return {x0:first,dx,fractions,rows};
}

// Change the game viewport itself, NOT an offline scale of a photograph.
export function setRaster(cap, small) {
  const width=small?960:1164,height=small?600:655;
  cap.g.setViewport({width,height,dpr:1,safeArea:{top:0,right:0,bottom:0,left:0}});
  cap.w=small?528:640;cap.h=small?330:360;
}

// Independent natural presentation smoke. Placement is the only initial fixture.
// Observe ALREADY displayed frames while the unmodified SDK RAF, game.update and
// cached/queued software readback run freely; NO invalidation, manual dt or draws.
export async function observePlay(cap, shell=false) {
  const {g,s}=cap, initial=g.time, begin=performance.now(), samples=[];let callbacks=0;
  if(!shell)g.start();
  try {
    while(performance.now()-begin<60000 && samples.length<3){
      await new Promise(requestAnimationFrame);callbacks++;
      if(s.cachedTime-initial<.15 || (samples.length && s.cachedTime-samples.at(-1).displayedTime<.32))continue;
      const cam=s.camera;
      check(g.running && !g.presentationPaused && !g.keys.size && !document.hidden,'Unexpected play input/pause');
      if(Math.abs(cam.position.x-cap.pose.x)>1e-7 || Math.abs(cam.position.z-cap.pose.z)>1e-7){check(shell && !samples.length,'Wrong displayed play camera');continue;}
      samples.push({displayedTime:s.cachedTime, gameTime:g.time, wallMs:performance.now()-begin, eye:cam.position.toArray(),
        matrix:cam.matrixWorld.elements.slice(), world:bytes(s.cachedFrame), sharedCanvas:bytes(g.canvas)});
    }
    check(samples.length===3,'Natural presentation did not produce three spaced, completed frames');
    if(shell)return {callbacks,wallMs:performance.now()-begin,samples}; // Its own native menu owns pause/resume.
    const pausedAt=g.time,displayedAt=s.cachedTime,world=bytes(s.cachedFrame),shown=bytes(g.canvas),start=performance.now();
    g.setPresentationPaused(true);
    try {for(let i=0;i<12;i++)await new Promise(requestAnimationFrame);
      check(g.time===pausedAt && s.cachedTime===displayedAt && bytes(s.cachedFrame)===world && bytes(g.canvas)===shown,'SDK presentation pause did not freeze the presented picture and game clock');
    }finally{g.setPresentationPaused(false);}
    // Resume resets lastTime to performance.now(). The browser can deliver an
    // already-timestamped RAF next; that update correctly advances zero seconds.
    const pauseWallMs=performance.now()-start,resumeSteps=[];let previous=pausedAt;
    for(let i=0;i<4;i++){
      const raf=await new Promise(requestAnimationFrame),dt=g.time-previous;
      resumeSteps.push({raf,gameTime:g.time,dt});check(dt>=0 && dt<=.050001,`Out-of-bounds SDK resume step ${dt}`);
      if(dt>0)break;previous=g.time;
    }
    check(g.time>pausedAt,'SDK resume did not advance in four observed RAFs');
    return {callbacks,wallMs:performance.now()-begin,samples,pause:{source:'VillaGame.setPresentationPaused on running SDK RAF',pausedAt,displayedAt,pauseWallMs,pausedCallbacks:12,bothPicturesBitExact:true,resumedDt:g.time-pausedAt,resumeSteps}};
  } finally {if(!shell)cancelAnimationFrame(g.animationId);}
}
