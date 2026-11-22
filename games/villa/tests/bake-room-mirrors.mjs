/** Offline only. Never starts a server or builds the game. From the repo root:
 *   VILLA_AUDIT_BASE=http://127.0.0.1:8187 node games/villa/tests/bake-room-mirrors.mjs
 *   VILLA_AUDIT_BASE=... VILLA_AUDIT_DIST=/absolute/frozen/store VILLA_AUDIT_REVISION=<40sha> VILLA_AUDIT_ENTRY_SHA256=<64hex> node games/villa/tests/bake-room-mirrors.mjs --write
 * The optional DIST override is a read-only store root containing games/index.json.
 * No flag / --check never writes ANY files. --source master explicitly saves a
 * sightline from the camera at the silver; --study master saves actual compiled
 * glass views after the embedded photographs have been built (ignored test-results).
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bakeOptions, villaRelease, verifyEntryDigest } from './bake-exterior-sun.mjs';
import { VILLA_MIRROR_SITES, VILLA_MIRROR_ROOMS, VILLA_MIRROR_LAYERS, VILLA_MIRROR_LIGHT, VILLA_MIRROR_SIZE, VILLA_MIRROR_BUDGET } from '../src/villaMirrorPlateLayout.ts';
import { capturePolicy, faces } from './bake-room-mirrors-render.mjs';
const assert=(ok,why)=>{if(!ok)throw Error(why);};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const hex64=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const sourceFile=new URL('../src/villaMirrorPlateData.ts',import.meta.url);
const receiptFile=new URL('./bake-room-mirrors.provenance.json',import.meta.url);
const helperFile=new URL('./bake-room-mirrors-render.mjs',import.meta.url);
const studyDir=new URL('../test-results/room-mirrors/',import.meta.url);
export const recipe={format:'villa-room-radiance-v1', projection:'hemioctahedral square, top-down straight RGBA, independent layers',
  capture:'SwiftShader WebGL2; actual furnished renderer, room field, emissives, per-eye physical light slots, clear sky. Exposure-one Reinhard in sRGB. Browser composite over opaque zero radiance preserves cutout coverage. No HUD or animation.',
  core:512,border:2,size:VILLA_MIRROR_SIZE,quality:.91,faces,sites:VILLA_MIRROR_SITES,lights:VILLA_MIRROR_LIGHT,layers:VILLA_MIRROR_LAYERS,policy:capturePolicy};

export function mirrorOptions(args, env) {
  const study=args.length===2 && ['--source','--study'].includes(args[0]) && (args[1]==='all'||VILLA_MIRROR_ROOMS.includes(args[1]));
  const opt=bakeOptions(study?['--check']:args,env), mode=study?args[0]:opt.mode;
  const expected=env.VILLA_AUDIT_ENTRY_SHA256;
  assert(expected===undefined ? mode!=='--write' : hex64(expected),'VILLA_AUDIT_ENTRY_SHA256 must be an independent full entry digest (required for --write)');
  assert(mode!=='--write'||!!env.VILLA_AUDIT_BASE,'Set VILLA_AUDIT_BASE explicitly to the frozen loopback preview for --write');
  const store=env.VILLA_AUDIT_DIST??fileURLToPath(new URL('../../../dist/',import.meta.url));
  assert(isAbsolute(store),'VILLA_AUDIT_DIST must be an absolute local store path');
  return {...opt,mode,room:study?args[1]:null,expected,store:resolve(store)};
}
async function previewBytes(url,mime,limit) {
  const r=await fetch(url,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(30_000)});
  assert(r.url===url&&r.status===200&&mime.test(r.headers.get('content-type')??''),`Bad immutable response: ${url}, ${r.status}, ${r.headers.get('content-type')}`);
  assert(Number(r.headers.get('content-length')??0)<=limit,'Oversize preview resource');
  const b=Buffer.from(await r.arrayBuffer());assert(b.length>0&&b.length<=limit,'Empty/oversized preview response');return b;
}
export function verifyMirrorEntry(pinned,inventory,served,onDisk) {
  const digest=verifyEntryDigest(inventory,served,onDisk);
  assert(pinned===undefined||digest===pinned,'Independent Villa entry SHA-256 does not match the immutable module');
  return digest;
}
async function attest(opt) {
  const json=/^application\/json(?:;|$)/i, js=/^(?:application|text)\/(?:java|ecma)script(?:;|$)/i;
  const get=(url,mime,limit)=>Promise.all([previewBytes(opt.origin+url,mime,limit),readFile(resolve(opt.store,'.'+url))]);
  const [catalog,localCatalog]=await get('/games/index.json',json,1<<20);
  assert(catalog.equals(localCatalog),'Preview catalog does not match the frozen local store');
  const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
  const release=villaRelease(JSON.parse(catalog),pkg.version,opt.revision);
  const [desc,localDesc]=await get(release.base+'game.json',json,1<<20),d=JSON.parse(desc);
  assert(desc.equals(localDesc)&&d.kind==='game'&&d.schemaVersion===1&&d.apiVersion===1&&d.id==='villa'&&d.meta?.id==='villa'&&d.version===release.version&&d.revision===release.revision&&d.entry==='entry.js','Immutable local/served descriptors disagree with Villa catalog');
  const [body,disk]=await get(release.entry,js,32<<20);
  const entrySha256=verifyMirrorEntry(opt.expected,d.files?.[d.entry],body,disk);
  return {release,body,auth:{version:d.version,revision:d.revision,entrySha256,descriptorSha256:sha(desc),catalogSha256:sha(catalog)}};
}

/** Strict transport: one still VP8 image. Chromium may additionally write its
 * sRGB canvas ICC profile; preserve it unchanged, and reject other metadata,
 * alpha planes, animation, truncation or a mismatched extended canvas size. */
export function plateHeader(bytes) {
  assert(bytes.length>=30&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.readUInt32LE(4)+8===bytes.length&&bytes.toString('ascii',8,12)==='WEBP','Incomplete WebP plate');
  let offset=12, canvas;
  const chunk=tag=>{
    assert(offset+8<=bytes.length&&bytes.toString('ascii',offset,offset+4)===tag,'Unexpected WebP chunk; expected '+tag);
    const size=bytes.readUInt32LE(offset+4),end=offset+8+size;assert(end+(size%2)<=bytes.length,'Truncated WebP chunk');
    const out=bytes.subarray(offset+8,end);offset=end+(size%2);return out;
  };
  if(bytes.toString('ascii',offset,offset+4)==='VP8X'){
    const x=chunk('VP8X');assert(x.length===10&&x.readUInt32LE(0)===0x20,'Extended plate should carry ONLY an ICC profile');
    canvas=[1+x.readUIntLE(4,3),1+x.readUIntLE(7,3)];
    assert(sha(chunk('ICCP'))==='12afb4d9953adee0607d347daee5b78b18d6b3cab2d572b88970703f5edb37bc','Unexpected/non-sRGB encoder ICC profile');
  }
  const vp8=chunk('VP8 ');assert(offset===bytes.length&&vp8.length>=10&&!(vp8[0]&1)&&vp8.readUIntLE(3,3)===0x2a019d,'Not one opaque still VP8 keyframe');
  const size=[vp8.readUInt16LE(6)&0x3fff,vp8.readUInt16LE(8)&0x3fff];assert(!canvas||size.every((n,i)=>n===canvas[i]),'Conflicting VP8 dimensions');return size;
}
export function roomSources(captures) {
  assert(captures.length===VILLA_MIRROR_ROOMS.length,'Need all five furnished room captures');
  const rooms=[], entries=[]; let totalBytes=0;
  for(const [i,c] of captures.entries()) {
    assert(c.room===VILLA_MIRROR_ROOMS[i] && c.facesSHA256.length===4&&c.facesSHA256.every(a=>a.length===5&&a.every(hex64))&&c.projectedSHA256.length===4&&c.projectedSHA256.every(hex64),'Invalid room order/hemisphere capture fingerprint');
    const bytes=Buffer.from(c.encoded,'base64'), [w,h]=plateHeader(bytes);
    assert(bytes.toString('base64')===c.encoded&&bytes.length<=VILLA_MIRROR_BUDGET.perRoomBytes&&w===recipe.size&&h===recipe.size*4,'Wrong plate size/encoding');
    totalBytes+=bytes.length; rooms.push({room:c.room,glass:c.glass,facesSHA256:c.facesSHA256,projectedSHA256:c.projectedSHA256,encodedSha256:sha(bytes),bytes:bytes.length,stats:c.stats});
    entries.push(`  ${c.room}: '${c.encoded}'`);
  }
  assert(totalBytes<=VILLA_MIRROR_BUDGET.totalBytes,'Room plate byte budget exceeded');
  // The input fingerprint includes the actual pre-encoding radiance and camera recipe,
  // NOT entry.js/revision: those consume this very data. Record the authenticated
  // authoring build only in the non-runtime companion receipt.
  const sourceSha256=sha(JSON.stringify({recipe,rooms:rooms.map(({room,glass,facesSHA256,projectedSHA256})=>({room,glass,facesSHA256,projectedSHA256}))}));
  const source=`// Generated by tests/bake-room-mirrors.mjs --write from furnished WebGL room captures.\n`+
    `// Input SHA-256: exact capture recipe, glass targets, ordered raw faces and projected RGBA (NOT the consuming entry).\n`+
    `import type { MirrorRoom } from './villaMirrorPlateLayout.js';\n`+
    `export const VILLA_MIRROR_SOURCE_SHA256 = '${sourceSha256}';\n`+
    `export const VILLA_MIRROR_PLATES: Readonly<Record<MirrorRoom,string>> = {\n${entries.join(',\n')},\n};\n`;
  return {source,sourceSha256,rooms,totalBytes};
}
export function verifyReceipt(receipt,result) {
  assert(receipt.format===recipe.format&&receipt.sourceSha256===result.sourceSha256&&receipt.generatedSha256===sha(result.source)&&receipt.totalBytes===result.totalBytes&&
    JSON.stringify(receipt.rooms)===JSON.stringify(result.rooms)&&/^[a-f0-9]{40}$/.test(receipt.authoring?.revision)&&
    ['entrySha256','descriptorSha256','catalogSha256','renderHelperSha256','bakerSha256'].every(k=>hex64(receipt.authoring[k])),'Missing/inconsistent original (non-runtime) authoring receipt');
}

async function main() {
  const opt=mirrorOptions(process.argv.slice(2),process.env), first=await attest(opt), helper=await readFile(helperFile);
  const {chromium}=await import('@playwright/test');
  const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try {
    const page=await browser.newPage({serviceWorkers:'block'}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',msg=>{if(msg.type()==='error'&&/shader|webgl|three\./i.test(msg.text()))errors.push(msg.text());});
    const fixture=opt.origin+'/__villa-room-mirrors', moduleUrl=fixture+'/render.mjs';
    await page.route('**/*',route=>{
      const u=route.request().url();
      if(u===fixture)return route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><main id="gameApp"><canvas></canvas></main>'});
      // Pin actual imported module bytes. Only this local, test-owned recipe is
      // additionally served. Unknown game chunks/assets cannot silently change art.
      if(u===opt.origin+first.release.entry)return route.fulfill({contentType:'text/javascript',body:first.body});
      if(u===moduleUrl)return route.fulfill({contentType:'text/javascript',body:helper});
      errors.push('Unexpected asset '+u);return route.abort();
    });
    await page.goto(fixture);
    const gpu=await page.evaluate(async({release,recipe,moduleUrl})=>{
      window.tool=await import(moduleUrl);window.cap=await window.tool.startCapture({release,recipe});return window.cap.gpu;
    },{release:first.release,recipe,moduleUrl});
    const authoring={...first.auth,chromium:browser.version(),gpu,renderHelperSha256:sha(helper),bakerSha256:sha(await readFile(fileURLToPath(import.meta.url)))};
    try {
      if(opt.room) {
        const output=[];
        for(const room of opt.room==='all'?VILLA_MIRROR_ROOMS:[opt.room]) for(const mode of opt.mode==='--source'?['source']:['left','centre','right','night']){
          const r=await page.evaluate(({room,mode})=>window.tool.eyeView(window.cap,room,mode),{room,mode});
          const path=new URL(`${room}-${mode}.png`,studyDir); output.push({path,png:Buffer.from(r.png,'base64'),eye:r.eye,optics:r.optics});
        }
        assert(!errors.length,errors.join('\n')); await mkdir(studyDir,{recursive:true});
        for(const {path,png,eye,optics} of output) {await writeFile(path,png);console.log(JSON.stringify({path:fileURLToPath(path),eye,optics,sha256:sha(png),...first.auth}));}
        return;
      }
      const captures=[];
      for(const room of VILLA_MIRROR_ROOMS){
        const c=await page.evaluate(room=>window.tool.captureRoom(window.cap,room),room);captures.push(c);
        assert(!errors.length,errors.join('\n')); console.log(JSON.stringify({room,layers:c.stats,encodedBytes:Buffer.from(c.encoded,'base64').length}));
      }
      const result=roomSources(captures), receipt={format:recipe.format,authoring,sourceSha256:result.sourceSha256,generatedSha256:sha(result.source),totalBytes:result.totalBytes,rooms:result.rooms};
      const last=await attest(opt);assert(JSON.stringify(last.auth)===JSON.stringify(first.auth),'Pinned preview changed while capturing; nothing written');
      if(opt.mode==='--write'){
        verifyReceipt(receipt,result);await writeFile(sourceFile,result.source);await writeFile(receiptFile,JSON.stringify(receipt,null,2)+'\n');
      } else {
        assert(await readFile(sourceFile,'utf8')===result.source,'Mirror plate source/pixels stale; check never writes');
        verifyReceipt(JSON.parse(await readFile(receiptFile,'utf8')),result);
      }
      console.log(JSON.stringify({mode:opt.mode,...first.auth,sourceSha256:result.sourceSha256,totalBytes:result.totalBytes,chromium:authoring.chromium,gpu}));
    } finally {await page.evaluate(()=>window.cap.game.destroy());}
  } finally {await browser.close();}
}
if(import.meta.main)await main();
