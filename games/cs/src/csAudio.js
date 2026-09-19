import {RECORDED_REPORTS,RECORDED_MECHANICS,SAMPLE_FILES,SAMPLE_GAINS} from './csAudioRecordings.js';
export class GameAudio {
  constructor(assetUrl=path=>new URL(path,import.meta.url).href){this.assetUrl=assetUrl;this.ctx=null;this.enabled=true;this.master=null;this.noise=null;this.shotCount=0;this.handlingCount=0;this.knifeAction=null;this.samples=new Map();this.rawSamples=new Map();this.decoding=new Map();this.loadTask=null;this.lastLoad=-Infinity;this.loadErrors=new Set();this.disposed=false;this.controllers=new Set();}
  dispose(){
    if(this.disposed)return;this.disposed=true;this.enabled=false;this.stopKnifeAction();
    for(const controller of this.controllers)controller.abort();this.controllers.clear();
    this.samples.clear();this.rawSamples.clear();this.decoding.clear();this.loadErrors.clear();
    const context=this.ctx;this.ctx=null;this.master=null;this.noise=null;
    try{context?.close()?.catch(()=>{});}catch{}
  }
  init(){if(this.disposed)return;try{if(!this.ctx){this.ctx=new (window.AudioContext||window.webkitAudioContext)();this.master=this.ctx.createGain();this.master.gain.value=.31;const limiter=this.ctx.createDynamicsCompressor();limiter.threshold.value=-5;limiter.knee.value=3;limiter.ratio.value=12;limiter.attack.value=.001;limiter.release.value=.055;this.master.connect(limiter);limiter.connect(this.ctx.destination);this.noise=this.ctx.createBuffer(1,Math.ceil(this.ctx.sampleRate*.6),this.ctx.sampleRate);const a=this.noise.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=Math.random()*2-1;}this.preload();for(const [file,data] of this.rawSamples)this.decode(file,data);if(this.ctx.state==='suspended')this.ctx.resume().catch(()=>{});}catch{}}
  preload(){
    if(this.disposed||this.loadTask||this.rawSamples.size===SAMPLE_FILES.length||Date.now()-this.lastLoad<2500)return this.loadTask;
    this.lastLoad=Date.now();const pending=SAMPLE_FILES.filter(file=>!this.rawSamples.has(file));
    const worker=async()=>{while(pending.length&&!this.disposed){const file=pending.shift();for(let attempt=0;attempt<2&&!this.disposed;attempt++){try{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);this.controllers.add(controller);let data;try{const response=await fetch(this.assetUrl('assets/audio/'+file),{signal:controller.signal});if(!response.ok)throw new Error('Audio asset unavailable');data=await response.arrayBuffer();}finally{clearTimeout(timer);this.controllers.delete(controller);}if(this.disposed)return;this.rawSamples.set(file,data);if(this.ctx&&!await this.decode(file,data))throw new Error('Audio decode failed');this.loadErrors.delete(file);break;}catch{if(!this.disposed)this.loadErrors.add(file);}}}};
    // The manifest places all firearm reports before the handling effects.
    this.loadTask=Promise.all(Array.from({length:8},worker)).finally(()=>{this.loadTask=null;});return this.loadTask;
  }
  decode(file,data){
    if(this.disposed)return Promise.resolve(false);if(this.samples.has(file))return Promise.resolve(true);if(!this.ctx||!data)return Promise.resolve(false);if(this.decoding.has(file))return this.decoding.get(file);
    const context=this.ctx;
    const task=Promise.resolve().then(()=>this.disposed?null:context.decodeAudioData(data.slice(0))).then(buffer=>{if(this.disposed||!buffer)return false;this.samples.set(file,buffer);this.rawSamples.set(file,null);this.loadErrors.delete(file);return true;}).catch(()=>{this.rawSamples.delete(file);if(!this.disposed)this.loadErrors.add(file);return false;}).finally(()=>this.decoding.delete(file));this.decoding.set(file,task);return task;
  }
  choose(files,variant=0){if(!files?.length)return null;return this.samples.has(files[variant%files.length])?files[variant%files.length]:files.find(file=>this.samples.has(file))||null;}
  reportFile(id,suppressed,variant=0){return this.choose(RECORDED_REPORTS[id]?.[suppressed?'suppressed':'normal']||RECORDED_REPORTS[id]?.normal,variant);}
  report(id,suppressed,variant=0){const file=this.reportFile(id,suppressed,variant);return file?this.samples.get(file):null;}
  route(node,pan=0){if(this.ctx.createStereoPanner){const p=this.ctx.createStereoPanner();p.pan.value=Math.max(-1,Math.min(1,pan));node.connect(p);p.connect(this.master);return p;}node.connect(this.master);return null;}
  tone(freq,dur=.12,vol=.3,type='sine',end=0){if(!this.enabled||!this.ctx)return;const t=this.ctx.currentTime,o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;o.frequency.setValueAtTime(freq,t);if(end)o.frequency.exponentialRampToValueAtTime(end,t+dur);g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);o.connect(g);g.connect(this.master);o.start(t);o.stop(t+dur);}
  burst(dur,vol,low=1000,pan=0){if(!this.enabled||!this.ctx)return;const t=this.ctx.currentTime,s=this.ctx.createBufferSource(),g=this.ctx.createGain(),f=this.ctx.createBiquadFilter();s.buffer=this.noise;f.type='lowpass';f.frequency.value=low;g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);s.connect(f);f.connect(g);if(this.ctx.createStereoPanner){const p=this.ctx.createStereoPanner();p.pan.value=Math.max(-1,Math.min(1,pan));g.connect(p);p.connect(this.master);}else g.connect(this.master);s.start(t);s.stop(t+dur);}
  shot(id,volume=1,pan=0,suppressed,distance=0){
    if(!this.enabled||!this.ctx)return false;if(id==='knife'){this.burst(.12,.17*volume,3200,pan);return true;}
    const quiet=suppressed??['m4a1','usp','mp5'].includes(id),file=this.reportFile(id,quiet,this.shotCount++);
    // Missing assets retry. Never substitute the old synthetic gun reports.
    if(!file){this.preload();return false;}return this.playFile(file,volume,pan,distance);
  }
  stopKnifeAction(){if(this.knifeAction){try{this.knifeAction.stop();}catch{}this.knifeAction=null;}}
  playFile(file,volume=1,pan=0,distance=0,knifeAction=false){
    const buffer=this.samples.get(file);if(!this.enabled||!this.ctx||!buffer)return false;
    if(knifeAction)this.stopKnifeAction();
    const s=this.ctx.createBufferSource(),gain=this.ctx.createGain();if(knifeAction)this.knifeAction=s;s.buffer=buffer;s.playbackRate.value=1;gain.gain.value=volume*(SAMPLE_GAINS[file]??1);
    let filter=null;if(distance>0){filter=this.ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=Math.max(1600,15500*Math.exp(-distance/40));filter.Q.value=.5;s.connect(filter);filter.connect(gain);}else s.connect(gain);
    const panNode=this.route(gain,pan);s.onended=()=>{if(this.knifeAction===s)this.knifeAction=null;s.disconnect();filter?.disconnect();gain.disconnect();panNode?.disconnect();};s.start();return true;
  }
  step(){this.burst(.085,.12,650);}
  reload(){this.mechanic('mag-in');}
  mechanic(kind,id){
    if(!this.enabled||!this.ctx)return false;
    if(id&&RECORDED_MECHANICS[id]){const choices=RECORDED_MECHANICS[id][kind];if(!choices)return false;const file=this.choose(choices,this.handlingCount++);if(!file){this.preload();return false;}return this.playFile(file,.85,0,0,id==='butterfly'&&(kind==='draw'||kind.startsWith('inspect')));}
    const cues={'cloth':[.075,.07,1500,0],'mag-out':[.060,.14,3400,610],'mag-in':[.055,.21,4700,830],'bolt-lift':[.035,.10,4700,1400],'bolt-open':[.095,.16,5300,980],'bolt-close':[.055,.23,6500,1600],'bolt-lock':[.029,.13,4900,1300],'shell':[.048,.12,3900,720],'cover':[.075,.16,2600,520]};const [duration,volume,low,freq]=cues[kind]||cues.cloth;this.burst(duration,volume,low);if(freq)this.tone(freq,.014,volume*.10,'triangle',freq*.68);
  }
  spatialMechanic(kind,id,volume=1,pan=0,distance=0){const file=this.choose(RECORDED_MECHANICS[id]?.[kind],this.handlingCount++);if(!file){this.preload();return false;}return this.playFile(file,volume,pan,distance);}
  hit(head=false,killed=false){
    if(!this.enabled||!this.ctx)return false;
    const kind=head?'head':killed?'kill':'body',file=this.choose(RECORDED_MECHANICS.feedback?.[kind],this.handlingCount++);
    if(!file){this.preload();return false;}
    return this.playFile(file,killed?.75:head?.63:.52);
  }
  round(win,team='draw'){
    if(!this.enabled||!this.ctx)return false;
    const file=this.choose(RECORDED_MECHANICS.round?.[team]);
    if(!file){this.preload();return false;}return this.playFile(file,.72);
  }
}
