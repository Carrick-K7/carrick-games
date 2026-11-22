/** Manual game-owned QA. Reads a separately built, independently pinned loopback release;
 * never builds, starts a server, deploys or writes outside Villa's ignored test-results.
 * VILLA_AUDIT_BASE=http://127.0.0.1:8177 VILLA_AUDIT_VERSION=x.y.z VILLA_AUDIT_REVISION=<40hex> VILLA_AUDIT_ENTRY_SHA256=<64hex> \
 *   PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64 taskset -c 2,3 node games/villa/tests/water-motion-study.mjs before
 * Repeat with independent final pins and `after`. `compare` (no server) verifies both
 * PNG timelines, controls, flow direction and encodes+decodes villa-water-motion.mp4.
 * `calibrate` scouts supported poses; `pilot` is a shorter study in a digest-named
 * directory, NEVER a substitute for after. `before|after --small-only` reproduces the
 * extra logical 960×600 creek witness. Requires Node ≥22.18, installed Playwright
 * Chromium and ffmpeg with libx264. No dependency installation or water-uniform overrides.
 * Results are in ../test-results/watermeadow/. regions.png: blue = measured water,
 * ochre = measured dry controls; id-*.png: white = depth-tested water object only.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {chromium} from '@playwright/test';
import {bakeOptions,villaRelease} from './bake-exterior-sun.mjs';
import {analyseShot,analyseSmall,analyseStudy,compareAndExport} from './water-motion-pixels.mjs';

const root = fileURLToPath(new URL('../test-results/watermeadow/', import.meta.url));
const renderFile = new URL('./water-motion-scene.mjs', import.meta.url);
const sha = x => createHash('sha256').update(x).digest('hex');
const json = o => JSON.stringify(o,null,2)+'\n';
const save = (file,o) => writeFile(file,json(o));
const png = data => Buffer.from(data,'base64');
const fps=20, frames=48;
// Pixel polygons fixed by viewing the BEFORE frames, not by picking moving pixels.
// Each water polygon is ALSO intersected with an eroded visible mesh-ID mask.
export const poses = [
  {id:'creek',mesh:'villa-stream-water',x:8.8,z:-33.85,tx:8.3,tz:-36.5,pitch:-.46,crouch:true,
    open:[[170,150],[307,141],[598,163],[582,231],[454,237],[278,225],[119,206]], land:[[40,298,150,326],[425,60,555,82]]},
  {id:'pond',mesh:'estate-pond-water',x:-5.6,z:75.3,tx:-12,tz:78,pitch:-.26,
    open:[[143,172],[438,166],[510,220],[478,258],[204,281],[140,242]], land:[[12,117,112,127],[293,116,396,125]]},
  {id:'pool',mesh:'villa-pool-water',x:-34.2,z:7.6,tx:-32,tz:-1,pitch:-.35,
    open:[[217,133],[379,129],[513,177],[449,241],[361,306],[170,307],[102,267]], land:[[28,153,58,175],[427,29,493,52]]},
];
// Calibrate BEFORE deciding the shot, under a separate, explicitly named directory.
const scouting = [...poses,
  {...poses[0],id:'creek-far-bank',x:6.8,z:-32.7,tx:10,tz:-37,pitch:-.4},
  {...poses[0],id:'creek-bridge-bank',x:4.85,z:-34.7,tx:3.9,tz:-36.9,pitch:-.48},
  {...poses[0],id:'creek-side-on',x:12.4,z:-33.65,tx:12.5,tz:-36.0,pitch:-.48},
  {...poses[0],id:'bridge',x:1.80,z:-38.05,tx:8,tz:-36.25,pitch:-.36,crouch:false},
  {...poses[1],id:'pond-north',x:-13.8,z:66.6,tx:-11.4,tz:75.4,pitch:-.31},
];

async function immutable(origin,resource,mime) {
  const url = origin+resource, r = await fetch(url,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(30000)});
  assert(r.status===200 && r.url===url && mime.test(r.headers.get('content-type')??''),'Unexpected response '+url);
  return Buffer.from(await r.arrayBuffer());
}
export async function attest(env) {
  const {origin,revision} = bakeOptions(['--check'],env), version = env.VILLA_AUDIT_VERSION, expected = env.VILLA_AUDIT_ENTRY_SHA256;
  assert(env.VILLA_AUDIT_BASE && revision && version && /^[a-f0-9]{64}$/.test(expected),'Supply independent origin, version, revision and entry pins');
  const js = /^(?:application|text)\/(?:java|ecma)script\b/i, j = /^application\/json\b/i;
  const cat = await immutable(origin,'/games/index.json',j), release = villaRelease(JSON.parse(cat),version,revision);
  const desc = await immutable(origin,release.base+'game.json',j), d = JSON.parse(desc);
  assert(d.kind==='game' && d.apiVersion===1 && d.schemaVersion===1 && d.meta?.id==='villa' && d.id==='villa' && d.revision===revision && d.version===version && d.entry==='entry.js','Mixed immutable descriptor');
  const body = await immutable(origin,release.entry,js);
  assert(sha(body)===expected && d.files[d.entry]===expected,'Mismatched independently pinned entry bytes');
  return {origin,release,body,files:d.files,identity:{version,revision,entrySha256:expected,descriptorSha256:sha(desc),catalogSha256:sha(cat)}};
}

async function captureShot(page,out,pose,n=frames,smoke=true) {
  const dir=path.join(out,pose.id); await mkdir(dir,{recursive:true});
  const site=await page.evaluate(p=>study.beginClip(cap,p),pose);
  console.log('Locking shot',pose.id,site.position);
  const samples=[], ids=[]; let repeat,eye,matrix,first,fov,aspect;
  for(let i=0;i<n;i++) {
    const stamp=String(i).padStart(3,'0'), {png:data,...r}=await page.evaluate(dt=>study.fresh(cap,dt),i?1/fps:0);
    const original=png(data); await writeFile(path.join(dir,`frame-${stamp}.png`),original);
    if(!i){eye=r.eye;matrix=r.matrix;first=r.time;fov=r.fov;aspect=r.aspect;}
    assert.equal(r.fov,fov);assert.equal(r.aspect,aspect);
    assert.deepEqual(r.eye,eye,'Eye drift'); assert.deepEqual(r.matrix,matrix,'Camera drift');
    assert(Math.abs(r.time-first-i/fps)<1e-8,'Incorrect inspection speed');
    samples.push({time:r.time,frame:r.frame,waterMatrix:r.waterMatrix,sha256:sha(original)});
    if(i===0 || i===n/2 || i===n-1){
      const id=await page.evaluate(()=>study.surfaceId(cap));
      await writeFile(path.join(dir,`id-${stamp}.png`),png(id.png));ids.push({i,count:id.count});
    }
    if(!i) {
      assert(Math.abs(Math.atan2(pose.x-pose.tx,pose.z-pose.tz)-site.yaw)<1e-8);
      if(pose.id==='creek') await save(path.join(dir,'transects.json'),await page.evaluate(()=>study.transects(cap)));
      const a=await page.evaluate(()=>study.repeatClock(cap));
      await writeFile(path.join(dir,'clock-alternate.png'),png(a.alternate));
      await writeFile(path.join(dir,'clock-repeat.png'),png(a.repeat));
      // The pool shot also contains animated foliage. Keep a whole-image witness,
      // but enforce exact replay on all tagged water and selected dry controls below.
      repeat={firstTime:a.firstTime,alternateTime:a.alternateTime,cameraMatrixExact:a.cameraMatrixExact,waterMatrixExact:a.waterMatrixExact,waterY:a.waterY,first:sha(original),alternate:sha(png(a.alternate)),repeat:sha(png(a.repeat)),exact:original.equals(png(a.repeat))};
    }
  }
  let play;
  if(smoke && pose.id==='creek') {
    const r=await page.evaluate(()=>study.observePlay(cap));
    play={callbacks:r.callbacks,wallMs:r.wallMs,pause:r.pause,samples:[]};
    for(const [i,{world,sharedCanvas,...s}] of r.samples.entries()) {
      assert.deepEqual(s.eye,eye,'Natural play eye moved'); assert.deepEqual(s.matrix,matrix,'Natural play camera rotated');
      await writeFile(path.join(dir,`play-world-${i}.png`),png(world));await writeFile(path.join(dir,`play-canvas-${i}.png`),png(sharedCanvas));
      play.samples.push({...s,worldSha256:sha(png(world)),sharedCanvasSha256:sha(png(sharedCanvas))});
    }
  }
  const row={pose,site,eye,matrix,fov,aspect,ids,repeat,samples,play};
  await save(path.join(dir,'capture.json'),row);console.log('Captured',pose.id,site.position,ids,play?.samples.map(s=>s.displayedTime)??'');return row;
}

async function smallShot(page,out) {
  const pose=poses[0],dir=path.join(out,'creek-528');await mkdir(dir,{recursive:true});
  const site=await page.evaluate(p=>{const a=study.beginClip(cap,p);study.setRaster(cap,true);return a;},pose);
  const times=[],hashes=[];let matrix;
  for(let i=0;i<9;i++){
    const r=await page.evaluate(i=>{for(let j=0;j<(i?5:0);j++)cap.g.update(.05);return study.fresh(cap);},i);
    if(!i)matrix=r.matrix;assert.deepEqual(r.matrix,matrix);times.push(r.time); const b=png(r.png);hashes.push(sha(b));
    await writeFile(path.join(dir,`sample-${String(i).padStart(2,'0')}.png`),b);
    if(!i){const id=await page.evaluate(()=>study.surfaceId(cap));await writeFile(path.join(dir,'id.png'),png(id.png));}
  }
  await page.evaluate(()=>study.setRaster(cap,false));
  const result={site,matrix,hashes,...analyseSmall(dir,pose,times)};await save(path.join(dir,'check.json'),result);
  console.log('528×330 actual creek mean temporal σY′:',result.open.lumaSigma.mean);return result;
}
async function main(mode,flag) {
  assert(['calibrate','before','pilot','after'].includes(mode) && (!flag||flag==='--small-only'),'Usage: water-motion-study.mjs calibrate | before | pilot | after [--small-only] | compare');
  const pin = await attest(process.env), helper = await readFile(renderFile);
  const out = path.join(root,mode==='calibrate'?'calibration':mode==='pilot'?'pilot-'+pin.identity.entrySha256.slice(0,12):mode);
  if(mode==='after'){
    const before=JSON.parse(await readFile(path.join(root,'before','study.json'),'utf8'));
    assert(before.identity.revision!==pin.identity.revision && before.identity.entrySha256!==pin.identity.entrySha256,'Final after needs its own source revision + bytes; use pilot for an uncommitted studio build');
  }
  await mkdir(out,{recursive:true});
  const identity = path.join(out,'identity.json'), old = await readFile(identity,'utf8').catch(e=>{if(e.code!=='ENOENT')throw e;});
  if (old) assert.deepEqual(JSON.parse(old),pin.identity,`Refusing to overwrite evidence of another release: ${out}`);
  await save(identity,pin.identity);
  const errors = [], browser = await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try {
    const page = await browser.newPage({viewport:{width:1164,height:655},deviceScaleFactor:1,serviceWorkers:'block'});
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error' && /three\.|shader|webgl/i.test(m.text()))errors.push(m.text());});
    const fixture = pin.origin+'/__villa-water-study', module = fixture+'/scene.mjs';
    await page.route('**/*',async route=>{
      const u=route.request().url();
      if(u===fixture) return route.fulfill({contentType:'text/html',body:'<!DOCTYPE html><meta charset="utf-8"><link rel="icon" href="data:,"><main id="gameApp"><canvas id="gameCanvas"></canvas></main>'});
      if(u===module) return route.fulfill({contentType:'text/javascript',body:helper});
      if(u===pin.origin+pin.release.entry) return route.fulfill({contentType:'text/javascript',body:pin.body});
      errors.push('Unexpected asset '+u); return route.abort();
    });
    await page.goto(fixture);
    const gpu = await page.evaluate(async ({module,release})=>{window.study=await import(module);window.cap=await study.openStudy(release);return cap.gpu;},{module,release:pin.release});
    const rows=[];
    try {
      if(mode==='calibrate') for(const pose of scouting) {
        const value=await page.evaluate(pose=>{try {const site=study.place(cap,pose), {png,...frame}=study.fresh(cap);return {site,frame,png};} catch(e){return {error:e.message};}},pose);
        if (value.png){await writeFile(path.join(out,pose.id+'.png'),png(value.png));delete value.png;}
        rows.push({pose,...value}); console.log(pose.id,value.error??value.frame.eye);
      } else {
        if(flag!=='--small-only') for(const pose of poses){
          const r=await captureShot(page,out,pose,mode==='pilot'?32:frames,mode!=='pilot');rows.push(r);
          if(mode==='pilot'){const m=await analyseShot(path.join(out,pose.id),r,fps);console.log('Pilot',pose.id,m.open.lumaSigma.mean,m.direction?.result??'');}
        }
        await smallShot(page,out);
      }
      assert.deepEqual(errors,[]); assert.deepEqual((await attest(process.env)).identity,pin.identity,'Preview changed during capture');
      if(!flag)await save(path.join(out,'study.json'),{identity:pin.identity,origin:pin.origin,gpu,chromium:browser.version(),width:640,height:360,logical:[1164,655],fps,
        capture:'Lossless completed primary world raster, no HUD or upscaling. External 20 Hz inspection schedule calls real VillaGame.update(.05) then invalidates the software frame cache and renders the normal primary view. Not wall-clock FPS. Real-play PNGs separately observe untouched SDK RAF / normal software presentation.',rows,errors});
    } finally {await page.evaluate(()=>cap.g.destroy());}
  } finally {await browser.close();}
}
if(import.meta.main){
  if(process.argv[2]==='measure' && ['before','after'].includes(process.argv[3]))await analyseStudy(path.join(root,process.argv[3]));
  else if(process.argv[2]==='compare' && process.argv.length===3)await compareAndExport(root);
  else await main(process.argv[2],process.argv[3]);
}
