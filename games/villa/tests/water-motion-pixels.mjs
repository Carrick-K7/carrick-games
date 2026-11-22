// Offline measurements from original PNGs only. ffmpeg is an explicit manual-study
// prerequisite; no image decoder dependency is added to the game or workspaces.
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const W=640,H=360,N=W*H;
const sha=b=>createHash('sha256').update(b).digest('hex');
const json=(f,x)=>writeFile(f,JSON.stringify(x,null,2)+'\n');
const ff=(args,opt={})=>execFileSync('ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-threads','1','-filter_threads','1',...args],{maxBuffer:128<<20,...opt});
export function decode(file,n=1,pixels=N) {
  const b=ff(['-i',file,'-frames:v',String(n),'-f','rawvideo','-pix_fmt','rgb24','-threads','1','pipe:1']);
  assert.equal(b.length,n*pixels*3,'Bad original image dimensions/count: '+file);return b;
}
const q=(a,f)=>a[Math.min(a.length-1,Math.floor((a.length-1)*f))];
const round=x=>Math.round(x*10000)/10000;
const summary=array=>{const a=array.sort();return {mean:round(a.reduce((s,v)=>s+v,0)/a.length),p25:round(q(a,.25)),median:round(q(a,.5)),p75:round(q(a,.75)),p90:round(q(a,.9)),p99:round(q(a,.99))};};
function inPoly(x,y,p){let inside=false;for(let i=0,j=p.length-1;i<p.length;j=i++){
  const [xi,yi]=p[i],[xj,yj]=p[j];if((yi>y)!==(yj>y) && x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;
}return inside;}
function maskFromID(b,w,h){const m=new Uint8Array(w*h);for(let i=0;i<m.length;i++)m[i]=Number(b[3*i]===255);return m;}
function overlap(a,b){let joint=0,either=0;for(let i=0;i<a.length;i++){joint+=a[i]&&b[i];either+=a[i]||b[i];}return round(joint/either);}
function regions(ids,pose,w=W,h=H) {
  const all=new Uint8Array(w*h);all.fill(1);
  for(const m of ids)for(let i=0;i<all.length;i++)all[i]&=m[i];
  const inner=[],open=[],land=[],flags=new Uint8Array(w*h);let dryRequested=0;
  for(let y=3;y<h-3;y++)for(let x=3;x<w-3;x++){
    const i=y*w+x;
    if(pose.land.some(([l,t,r,b])=>x>=l&&x<r&&y>=t&&y<b)){dryRequested++;
      if(ids.every(m=>!m[i])){land.push(i);flags[i]=2;}}
    if(!all[i])continue;
    let clean=true;for(let j=-3;j<=3 && clean;j++)for(let k=-3;k<=3;k++)if(!all[i+j*w+k]){clean=false;break;}
    if(clean){inner.push(i);if(inPoly(x+.5,y+.5,pose.open)){open.push(i);flags[i]=1;}}
  }
  assert(land.length>.95*dryRequested && land.length>800,'Dry control covers water or is too small');
  assert(open.length>w*h*.07 && inner.length>open.length,'Open-water sample is too small/wrong');
  return {inner,open,land,flags};
}
const luma=(b,k)=>(.2126*b[k]+.7152*b[k+1]+.0722*b[k+2]);
// Per-pixel temporal distribution (not a histogram over a moving crop). Robust
// 10th–90th percentile span suppresses individual specular impulses. Also keep
// RMS about each pixel's own mean in RGB and Y', plus explicit flash checks.
function variability(b,pixels,n,stride=N) {
  const ySd=new Float32Array(pixels.length),rgbSd=ySd.slice(),spans=ySd.slice(),tval=new Float32Array(n);
  const white=new Uint32Array(n),meanY=new Float64Array(n),jump=new Uint32Array(n);
  let changed=0,above2=0;
  for(let i=0;i<pixels.length;i++){
    const p=3*pixels[i];let sy=0,sy2=0,sr=0,sg=0,sb=0,ss=0,maxDelta=0;
    for(let f=0,k=p;f<n;f++,k+=3*stride){const r=b[k],g=b[k+1],blue=b[k+2],y=luma(b,k);
      meanY[f]+=y;white[f]+=Number(Math.min(r,g,blue)>=245);if(f)jump[f]+=Number(Math.abs(y-tval[f-1])>32);
      tval[f]=y;sy+=y;sy2+=y*y;sr+=r;sg+=g;sb+=blue;ss+=r*r+g*g+blue*blue;
      maxDelta=Math.max(maxDelta,Math.abs(r-b[p]),Math.abs(g-b[p+1]),Math.abs(blue-b[p+2]));
    }
    tval.sort();spans[i]=q(tval,.90)-q(tval,.1);above2+=Number(spans[i]>=2);changed+=Number(maxDelta>0);
    ySd[i]=Math.sqrt(Math.max(0,(sy2-sy*sy/n)/n)); rgbSd[i]=Math.sqrt(Math.max(0,(ss-(sr*sr+sg*sg+sb*sb)/n)/(3*n)));
  }
  const count=pixels.length, means=Array.from(meanY,x=>x/count);
  return {pixels:count,lumaSigma:summary(ySd),rgbSigma:summary(rgbSd),lumaP90minusP10:summary(spans),
    fractionEverChanged:round(changed/count),fractionSpanAtLeast2:round(above2/count),
    maxNearWhiteFraction:round(Math.max(...white)/count),maxFractionAdjacentJumpOver32:round(Math.max(...jump)/count),
    maxFrameMeanJump:round(means.slice(1).reduce((a,v,i)=>Math.max(a,Math.abs(v-means[i])),0)),frameMeanYRange:[round(Math.min(...means)),round(Math.max(...means))]};
}
function difference(b,c,pixels){let sum=0,max=0,changed=0;for(const p of pixels){let d=0;for(let k=3*p;k<3*p+3;k++)d=Math.max(d,Math.abs(b[k]-c[k]));sum+=d;max=Math.max(max,d);changed+=Number(d>0);}return {meanMaxRgbDelta:round(sum/pixels.length),max,fractionChanged:round(changed/pixels.length)};}

function direction(b,chart,flags,n,fps){
  const {rows,dx}=chart,cols=rows[0].length,lanes=[];
  for(const row of rows){const a=new Float32Array(n*cols),valid=new Uint8Array(cols);
    for(let i=0;i<cols;i++){
      if(!row[i])continue;const [u,v]=row[i],x=Math.floor(u),y=Math.floor(v),fx=u-x,fy=v-y,base=y*W+x;
      const corners=[base,base+1,base+W,base+W+1];if(corners.some(p=>flags[p]!==1))continue;
      valid[i]=1;let mean=0;
      for(let f=0;f<n;f++){const k=3*(f*N+base);const value=(1-fy)*((1-fx)*luma(b,k)+fx*luma(b,k+3)) + fy*((1-fx)*luma(b,k+W*3)+fx*luma(b,k+W*3+3));
        a[f*cols+i]=value;mean+=value;}
      mean/=n;for(let f=0;f<n;f++)a[f*cols+i]-=mean; // Remove stationary bottom/shadow/colour gradient.
    }lanes.push({a,valid});
  }
  const lags=[];
  for(const lag of [4,8,12]){const dt=lag/fps,limit=Math.floor(.66*dt/dx),scores=[];
    // One common support for the WHOLE shift curve; no shift gets to drop an
    // inconvenient dark rock, clipped boundary or lane endpoint independently.
    const eligible=lanes.map(({a,valid})=>{const stations=[];let consecutive=0;
      for(let i=0;i<cols;i++){consecutive=valid[i]?consecutive+1:0;if(consecutive>=2*limit+1)stations.push(i-limit);}return {a,stations};});
    for(let s=-limit;s<=limit;s++){let xy=0,xx=0,yy=0,count=0;
      for(const {a,stations} of eligible)for(const i of stations){
        for(let f=0;f<n-lag;f++){const x=a[f*cols+i],y=a[(f+lag)*cols+i+s];xy+=x*y;xx+=x*x;yy+=y*y;count++;}}
      scores.push({shiftMetres:round(s*dx),metresPerSecond:round(s*dx/dt),correlation:xx*yy>0?round(xy/Math.sqrt(xx*yy)):null,count,rms:count?round(Math.sqrt(xx/count)):0});
    }
    const top=scores.toSorted((a,c)=>(c.correlation??-2)-(a.correlation??-2))[0],zero=scores[limit],reverse=scores[2*limit-scores.indexOf(top)];
    lags.push({dt,best:top,atZero:zero.correlation,atReverse:reverse.correlation,curve:scores.map(x=>[x.metresPerSecond,x.correlation])});
  }
  const confident=lags.filter(({best:b,atZero,atReverse})=>b.count>1000 && b.rms>.25 && b.correlation>.42 && b.correlation-Math.max(atZero,atReverse)>.052 && Math.abs(b.metresPerSecond)>.055);
  const vote=sign=>confident.filter(l=>Math.sign(l.best.metresPerSecond)===sign).length;
  return {method:'Per-station temporal residual Y′, bilinear samples on nine measured XZ lanes. Positive motion pairs F(t,x) with F(t+dt,x+d), NOT with x−d. Correlation curve includes both signs and zero.',
    result:vote(1)>=2?'downstream +X':vote(-1)>=2?'upstream −X':'indeterminate',lags};
}

function regionImage(original,flags,p){const b=Buffer.from(original.subarray(0,flags.length*3));
  for(let i=0,k=0;i<flags.length;i++,k+=3){const m=flags[i];if(!m)continue;const c=m===1?[30,201,255]:[255,163,57];
    for(let j=0;j<3;j++)b[k+j]=Math.round(b[k+j]*.59+c[j]*.41);}
  ff(['-f','rawvideo','-pix_fmt','rgb24','-s',`${W}x${H}`,'-i','pipe:0','-frames:v','1','-threads','1','-y',p],{input:b});
}
export async function analyseShot(dir,record,fps) {
  const n=record.samples.length, b=decode(path.join(dir,'frame-%03d.png'),n), ids=record.ids.map(q=>maskFromID(decode(path.join(dir,`id-${String(q.i).padStart(3,'0')}.png`)),W,H));
  const {inner,open,land,flags}=regions(ids,record.pose);
  const alt=decode(path.join(dir,'clock-alternate.png')), replay=decode(path.join(dir,'clock-repeat.png'));
  const out={open:variability(b,open,n),allVisibleInner:variability(b,inner,n),dryControl:variability(b,land,n),
    coverage:ids.map((m,i)=>({frame:record.ids[i].i,pixels:record.ids[i].count,intersectionOverUnionWithFirst:overlap(ids[0],m)})),
    maxHorizontalMatrixDrift:round(Math.max(...record.samples.flatMap(s=>[Math.abs(s.waterMatrix[12]-record.samples[0].waterMatrix[12]),Math.abs(s.waterMatrix[14]-record.samples[0].waterMatrix[14])]))),
    datumYRange:[Math.min(...record.samples.map(s=>s.waterMatrix[13])),Math.max(...record.samples.map(s=>s.waterMatrix[13]))],
    clock:{alternateOpen:difference(b,alt,open),alternateDry:difference(b,alt,land),exactRepeatOpen:difference(b,replay,open),exactRepeatVisible:difference(b,replay,inner),exactRepeatDry:difference(b,replay,land),wholeRepeat:difference(b,replay,Array.from({length:N},(_,i)=>i)),wholeRepeatPngIdentical:record.repeat.exact}};
  if(record.pose.id==='creek') {
    out.direction=direction(b,JSON.parse(await readFile(path.join(dir,'transects.json'),'utf8')),flags,n,fps);
    if(record.play){const play=record.play.samples.map((_,i)=>decode(path.join(dir,`play-world-${i}.png`)));
      const cw=1164,ch=655,shown=record.play.samples.map((_,i)=>decode(path.join(dir,`play-canvas-${i}.png`),1,cw*ch));
      const shared=indices=>indices.map(i=>Math.floor((Math.floor(i/W)+.5)*ch/H)*cw+Math.floor((i%W+.5)*cw/W));
      const wetShared=shared(open),dryShared=shared(land),pair=(images,index)=>images.slice(1).map((p,i)=>difference(images[i],p,index));
      out.realPlay={displayedTimes:record.play.samples.map(p=>p.displayedTime),wallMs:record.play.wallMs,pause:record.play.pause,
        adjacentOpen:pair(play,open),adjacentDry:pair(play,land),sharedCanvasOpen:pair(shown,wetShared),sharedCanvasDry:pair(shown,dryShared)};}
  }
  regionImage(b,flags,path.join(dir,'regions.png'));await json(path.join(dir,'pixels.json'),out);
  assert(out.clock.exactRepeatVisible.max===0 && out.clock.exactRepeatDry.max===0,'Non-deterministic water/dry exact-clock replay');
  return out;
}
export function analyseSmall(dir,pose,times) {
  const w=528,h=330,n=times.length,m=maskFromID(decode(path.join(dir,'id.png'),1,w*h),w,h);
  // Same lens/eye, different aspect: horizontal projection scales with image
  // HEIGHT around frame centre, not with W′/W. Take only actually tagged pixels.
  const x=v=>(v-W/2)*(w/(960/600))/(W/(1164/655))+w/2,y=v=>v*h/H;
  const p={open:pose.open.map(([u,v])=>[x(u),y(v)]),land:pose.land.map(([a,b,c,d])=>[x(a),y(b),x(c),y(d)])};
  const {open,land}=regions([m],p,w,h);const b=decode(path.join(dir,'sample-%02d.png'),n,w*h);
  return {width:w,height:h,logical:[960,600],times,open:variability(b,open,n,w*h),dryControl:variability(b,land,n,w*h)};
}
export async function compareAndExport(root) {
  const beforeDir=path.join(root,'before'),afterDir=path.join(root,'after');
  const load=f=>readFile(f,'utf8').then(JSON.parse);
  const before=await load(path.join(beforeDir,'study.json')),after=await load(path.join(afterDir,'study.json'));
  assert.notEqual(before.identity.entrySha256,after.identity.entrySha256,'Not two distinct releases');
  assert.deepEqual(before.errors,[]);assert.deepEqual(after.errors,[]);
  const names=['creek','pond','pool'],fps=20,n=48;
  assert.deepEqual(after.rows.map(r=>r.pose.id),names);assert.deepEqual(before.rows.map(r=>r.pose.id),names);
  assert.equal(after.gpu,before.gpu);assert.equal(after.chromium,before.chromium);
  for(let i=0;i<3;i++){const a=after.rows[i],b=before.rows[i];assert.deepEqual(a.pose,b.pose);assert.deepEqual(a.matrix,b.matrix);assert.equal(a.fov,b.fov);assert.equal(a.aspect,b.aspect);
    assert.equal(b.samples.length,n);assert.deepEqual(a.samples.map(s=>s.time),b.samples.map(s=>s.time));}
  const m0=await analyseStudy(beforeDir),m1=await analyseStudy(afterDir),r=m1.shots,c=r.creek;
  const smaller=await load(path.join(afterDir,'creek-528','check.json'));
  const checks={sameEyesLensAndClock:true,exactClockRepeats:names.every(k=>r[k].clock.exactRepeatVisible.max===0 && r[k].clock.exactRepeatDry.max===0),
    stableDryControls:names.every(k=>r[k].dryControl.fractionEverChanged<.002 && r[k].clock.alternateDry.fractionChanged<.002),
    anchored:names.every(k=>r[k].maxHorizontalMatrixDrift===0 && r[k].datumYRange[0]===r[k].datumYRange[1] && r[k].coverage.every(x=>x.intersectionOverUnionWithFirst>.975)),
    supportedCameraAndWaterHazard:after.rows.every(p=>p.site.approach?.standingFitSamples===13 && p.site.approach.unsupportedLookTarget.length===2),
    noSurfaceFlash:names.every(k=>r[k].open.maxNearWhiteFraction<.01 && r[k].open.maxFrameMeanJump<3 && r[k].open.maxFractionAdjacentJumpOver32<.10),
    downstream:c.direction.result==='downstream +X',clearerCreek:c.open.lumaSigma.mean>m0.shots.creek.open.lumaSigma.mean*1.35 && c.open.lumaP90minusP10.median>=4,
    quieterPondAndPool:['pond','pool'].every(k=>r[k].open.lumaSigma.mean<c.open.lumaSigma.mean*.85 && r[k].open.rgbSigma.mean<c.open.rgbSigma.mean*.85),
    pondAndPoolNotFrozen:['pond','pool'].every(k=>r[k].open.lumaP90minusP10.p75>=1 && r[k].open.fractionEverChanged>.25),
    realPlay:[...c.realPlay.adjacentOpen,...c.realPlay.sharedCanvasOpen].every(d=>d.meanMaxRgbDelta>1 && d.fractionChanged>.3) && [...c.realPlay.adjacentDry,...c.realPlay.sharedCanvasDry].every(d=>d.fractionChanged<.002),
    pausedGameAndPresentedPictures:c.realPlay.pause?.bothPicturesBitExact===true && c.realPlay.pause.resumedDt>0,
    nativeSmallerRaster:smaller.width===528 && smaller.height===330 && smaller.open.lumaP90minusP10.median>=4 && smaller.dryControl.fractionEverChanged<.002};
  const clip=path.join(root,'villa-water-motion.mp4');
  const inputs=names.flatMap(id=>['-framerate',String(fps),'-start_number','0','-i',path.join(afterDir,id,'frame-%03d.png')]);
  ff([...inputs,'-filter_complex_threads','1','-filter_complex','[0:v][1:v][2:v]concat=n=3:v=1:a=0,format=yuv420p[v]','-map','[v]','-frames:v',String(n*3),'-fps_mode','passthrough','-an','-c:v','libx264','-threads','2','-preset','slow','-crf','16','-movflags','+faststart',
    '-metadata','title','Warm Villa — creek, pond, pool; fixed eye, game-clock time','-y',clip]);
  // Decode the actual shipping-format movie and compare every corresponding original.
  // This catches stale glob/duplicate shot/order errors, and motion lost to compression.
  const film=decode(clip,3*n),encoded=[];
  for(let j=0;j<3;j++){const dir=path.join(afterDir,names[j]),src=decode(path.join(dir,'frame-%03d.png'),n);
    const b=film.subarray(j*n*N*3,(j+1)*n*N*3),masks=after.rows[j].ids.map(q=>maskFromID(decode(path.join(dir,`id-${String(q.i).padStart(3,'0')}.png`)),W,H)),reg=regions(masks,after.rows[j].pose);
    let worst=0;for(let f=0;f<n;f++){let sad=0,count=0;for(let k=f*N*3;k<(f+1)*N*3;k+=17){sad+=Math.abs(src[k]-b[k]);count++;}worst=Math.max(worst,sad/count);}
    const delta=variability(b,reg.open,n),ratio=delta.lumaSigma.mean/r[names[j]].open.lumaSigma.mean;
    encoded.push({shot:names[j],maxFrameMeanAbsRgbError:round(worst),decodedMotionRatio:round(ratio)});
  }
  checks.codecPreservesShots=encoded.every(e=>e.maxFrameMeanAbsRgbError<5 && e.decodedMotionRatio>.62 && e.decodedMotionRatio<1.48);
  const probe=spawnSync('ffmpeg',['-nostdin','-hide_banner','-nostats','-loglevel','info','-threads','1','-i',clip,'-filter_threads','1','-vf','showinfo','-f','null','-'],{encoding:'utf8'});
  assert.equal(probe.status,0,'Cannot verify movie timestamps');
  const pts=Array.from(probe.stderr.matchAll(/\bn:\s*\d+\s+pts:\s*-?\d+\s+pts_time:([\d.eE+-]+)/g),m=>Number(m[1]));
  checks.actualDecodedCadence=pts.length===n*3 && pts.every((t,i)=>Math.abs(t-i/fps)<1e-5);
  const movie=await readFile(clip),result={before:before.identity,after:after.identity,checks,passed:Object.values(checks).every(Boolean),
    levels:names.map(k=>({shot:k,beforeMeanLumaSigma:m0.shots[k].open.lumaSigma.mean,afterMeanLumaSigma:r[k].open.lumaSigma.mean,afterMedianP90minusP10:r[k].open.lumaP90minusP10.median})),
    direction:c.direction.result,playableEyes:after.rows.map(x=>({id:x.pose.id,eye:x.eye,yaw:x.site.yaw,pitch:x.site.pitch})),film:{filename:path.basename(clip),codec:'H.264/yuv420p',width:W,height:H,fps,frames:n*3,seconds:n*3/fps,sha256:sha(movie),bytes:movie.length,shotOrder:names,decoded:encoded},
    limits:'Three stationary day/clear software-rendered poses, not all sightlines, hardware FPS, or exhaustive flashing safety. Clip is fixed-step inspection; separate play-world and play-canvas snapshots observe the genuine unmodified SDK loop.'};
  await json(path.join(root,'comparison.json'),result);console.log(JSON.stringify(result,null,2));assert(result.passed,'Study acceptance failed; inspect comparison.json, not the frame count');return result;
}
export async function analyseStudy(dir) {
  const receipt=JSON.parse(await readFile(path.join(dir,'study.json'),'utf8')),out={identity:receipt.identity,method:'Native 8-bit sRGB pixels; luma Y′=.2126R+.7152G+.0722B. Open: prelocked polygon ∩ eroded visible mesh ID at three epochs. Dry: calibrated land/object patches outside target ID. Tagged renders never enter the film.',shots:{}};
  for(const r of receipt.rows){const d=path.join(dir,r.pose.id);
    for(let i=0;i<r.samples.length;i++)assert.equal(sha(await readFile(path.join(d,`frame-${String(i).padStart(3,'0')}.png`))),r.samples[i].sha256,'Changed original screenshot');
    const s=out.shots[r.pose.id]=await analyseShot(d,r,20);console.log(r.pose.id,'median central 80% Y′ span',s.open.lumaP90minusP10.median,'mean σY′',s.open.lumaSigma.mean,'dry changed',s.dryControl.fractionEverChanged,s.direction?.result??'');
  }await json(path.join(dir,'measurements.json'),out);return out;
}
