// Original gun reports: separate pressure, crack, action and outdoor reflections.
export const SHOT_PROFILES={
  ak47:[112,.84,.95,.075,.42,920],m4a1:[142,.68,.79,.058,.33,1340],
  awp:[68,1.26,1.13,.115,.65,710],deagle:[87,1.02,1.03,.093,.48,1570],
  mp5:[178,.43,.53,.038,.25,1730],tmp:[192,.45,.67,.032,.25,1940],
  p90:[209,.47,.78,.034,.28,1840],mac10:[158,.54,.68,.041,.29,1520],
  sg552:[123,.75,.89,.064,.37,1120],aug:[135,.66,.86,.057,.35,1450],
  scout:[95,.95,.98,.082,.51,1080],g3sg1:[101,.89,.94,.078,.46,970],
  m3:[76,1.1,.87,.10,.47,680],xm1014:[90,1.,.83,.089,.43,810],
  m249:[118,.85,.92,.071,.37,1270],usp:[176,.46,.68,.044,.27,1760],glock:[203,.42,.73,.033,.26,2070]
};
// No pitched oscillator: muzzle pressure is an aperiodic, short broadband event.
export const SHOT_VARIANTS=6;
export function synthesizeShot(id,sampleRate=44100,variant=0,suppressed=false){
  if(!Number.isFinite(sampleRate)||sampleRate<8000||sampleRate>192000)throw new RangeError('Unsupported sample rate');
  const [body,weight,crackLevel,decayTime,tail,metal]=SHOT_PROFILES[id]||SHOT_PROFILES.ak47;
  const bolt=['awp','scout','m3'].includes(id),pistol=['deagle','usp','glock'].includes(id);
  const duration=suppressed?.32:tail+.30,n=Math.ceil(duration*sampleRate);
  const dry=new Float32Array(n),reflection=new Float32Array(n);
  let seed=(variant+1)*16331;for(const c of id)seed=(Math.imul(seed,31)+c.charCodeAt(0))>>>0;
  const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2147483648-1;};
  const coeff=f=>1-Math.exp(-2*Math.PI*f/sampleRate);
  const gasC=coeff(suppressed?2200:2600+metal),lowC=coeff(380+body*2),subC=coeff(65),airC=coeff(1800),dcC=coeff(28);
  const width=(id==='awp'?.0018:pistol?.0007:.0011)*(1+rand()*.09);
  const gasDecay=decayTime*(suppressed?.27:.32),actionAt=(pistol?.039:.027)+rand()*.003;
  // Uneven short gas jets prevent the uniform noise/sine envelope of a drum synthesizer.
  const jets=Array.from({length:7},(_,j)=>({at:.0015+j*.0027+Math.abs(rand())*.002,level:(.16+Math.abs(rand())*.16)/(1+j*.5),decay:.0006+Math.abs(rand())*.0018}));
  let gas=0,low=0,sub=0,air=0,dc=0;
  for(let i=0;i<n;i++){
    const t=i/sampleRate,w=rand(),w2=rand();gas+=gasC*(w-gas);low+=lowC*(w-low);sub+=subC*(low-sub);
    const attack=Math.min(1,t/.00008);
    // Bipolar shock front, not a repeating bass note or pitch sweep.
    const front=(1-t/width)*Math.exp(-t/width)*weight*(suppressed?.045:.75);
    const crack=(w-gas)*Math.exp(-t/(pistol?.0018:.0032))*crackLevel*(suppressed?.035:1.1);
    let jet=0;for(const j of jets){const u=t-j.at;if(u>=0)jet+=j.level*Math.exp(-u/j.decay);}
    const blast=((gas-low)*.82+(low-sub)*.65)*weight*(Math.exp(-t/gasDecay)+jet)*(suppressed?.14:1.12);
    const c=t-actionAt,close=t-actionAt-(pistol?.026:.019);
    // Bolt-action and pump cycles are emitted by their animation, never faked immediately after firing.
    const action=bolt?0:(c<0?0:(w-gas)*.15*Math.exp(-c/.003))+(close<0?0:(w2*.10+gas*.08)*Math.exp(-close/.002));
    const raw=(front+crack+blast+action)*attack;dc+=dcC*(raw-dc);dry[i]=raw-dc;
    air+=airC*(dry[i]-air);reflection[i]=air;
  }
  const left=new Float32Array(n),right=new Float32Array(n);
  // Dense, irregular outdoor scattering replaces the old five rhythmic slapbacks.
  const taps=Array.from({length:32},(_,j)=>{const delay=.018+(j/31)**1.45*(tail*.74)+Math.abs(rand())*.006;return {l:Math.round(delay*sampleRate),r:Math.round((delay+.001+Math.abs(rand())*.008)*sampleRate),g:(suppressed?.008:.035)*Math.exp(-delay/(tail*.28)),side:rand()*.35};});
  let peak=0;
  for(let i=0;i<n;i++){
    let l=dry[i],r=dry[i];for(const a of taps){if(i>=a.l)l+=reflection[i-a.l]*a.g*(1+a.side);if(i>=a.r)r+=reflection[i-a.r]*a.g*(1-a.side);}
    const fade=Math.min(1,(n-1-i)/(sampleRate*.025));left[i]=l*fade;right[i]=r*fade;peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));
  }
  const gain=(suppressed?(id==='mp5'?.50:.25):.88)/Math.max(.5,peak);
  for(let i=0;i<n;i++){left[i]*=gain;right[i]*=gain;}
  return {sampleRate,left,right};
}
