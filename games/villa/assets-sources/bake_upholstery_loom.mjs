// Original Villa rug cartoons, no image inputs/tools. Run `node games/villa/assets-sources/bake_upholstery_loom.mjs`.
// Areas are assignments of dyed yarn. Bake the costly curves/coverage to runs; pile and abrash are applied at scene construction.
import {writeFileSync} from 'node:fs';
const W=384,H=256, frac=x=>x-Math.floor(x), tri=x=>Math.abs(2*frac(x)-1), s=Math.sin,c=Math.cos,TAU=Math.PI*2;
const flower=(x,y)=>{const t=Math.atan2(y,x);return Math.hypot(x,y)/(.79+.20*c(6*t));};
function ink(n,x,y){
  const ax=Math.abs(x-.5)*2,ay=Math.abs(y-.5)*2,side=Math.min(x,1-x),end=Math.min(y,1-y),e=Math.min(side,end),along=side<end?y:x;
  if(e<.013)return 1;if(e<.018)return 3;if(e<.023)return 2;
  if(n===3){ // Natural undyed rush-wool: an irregularly grouped stripe and little comb teeth.
    if(side<.034)return 1;
    const a=Math.abs(ay-.735),b=Math.abs(ay-.568);
    if(a<.042)return a<.018?3:2;if(b<.013||Math.abs(ay-.89)<.014)return 4;
    if(ay>.78&&ay<.875)return Math.abs(ay-.797-.046*tri(x*32))<.012?4:2;
    return Math.abs(frac(y*22+.008*s(TAU*x))-.5)<.032?1:0;
  }
  if(e<.034)return 2;
  if(e<.079){ // Sinuous leafy running border between paired hairline guards.
    const p=frac(along*(side<end?30:36)),t=(e-.034)/.045,stem=.5+.25*s(TAU*p);
    if(Math.abs(stem-t)<.065)return 2;
    if(((p-.29)/.14)**2+((t-.30-(p-.29)*.82)/.14)**2<1 || ((p-.75)/.13)**2+((t-.68+(p-.75)*.81)/.14)**2<1)return 4;
    return 3;
  }
  if(e<.087)return 2;if(e<.093)return 1;
  if(n===0){ // The medallion, pendent finials and corner spandrels share slim almond-leaf profiles.
    const theta=Math.atan2((y-.5)*1.09,x-.5),rad=Math.hypot(ax,ay*1.09);
    const med=rad/(.309+.026*c(8*theta)+.019*c(4*theta)+.028*c(2*theta));
    if(med<1.04){
      if(med>.988)return 5;if(med>.915)return 1;if(med>.872)return 2;
      if(med<.45){const f=flower(ax,ay*1.1);return f<.045?3:f<.112?5:4;}
      const fr=med-(.64+.13*c(8*theta));if(Math.abs(fr)<.037)return 2;
      return med>.80?4:3;
    }
    const fin=((ax)/.057)**2+((ay-.405)/.084)**2;
    if(fin<1)return fin<.57?3:2;
    if(ax+ay>1.26+.041*c(20*ax)){const edge=ax+ay-.041*c(20*ax);if(edge<1.285)return 2;if(edge<1.315)return 1;if(edge<1.36)return 4;}
    // Small sprays grow TO the medallion; quiet, many-knot filler, not 40cm square pixel-flowers.
    const row=Math.floor(y*11),u=frac(x*12+(row&1)*.5)-.5,v=frac(y*11)-.5;
    if(flower(u,v*1.22)<.142)return (row&1)?2:4;
    if(Math.abs(u+.055+.22*v)<.024&&v<.04&&v>-.32)return 1;
    if(((u+.135)/.105)**2+((v+.20+.46*(u+.135))/.048)**2<1)return 4;
    return Math.abs(v-.35-.065*s(TAU*u))<.02?1:0;
  }
  if(n===1){ // Paired little buds on a meandering stem, spaced off a staggered loom repeat.
    const row=Math.floor(y*9),u=frac(x*11+(row&1)*.50),v=frac(y*9),stem=.44+.13*s(2.7*v-.3);
    if(v>.09&&v<.77&&Math.abs(u-stem)<.022)return 1;
    if(((u-stem+.080)/.100)**2+((v-.35+.64*(u-stem))/.065)**2<1 || ((u-stem-.103)/.115)**2+((v-.56-.68*(u-stem))/.074)**2<1)return 3;
    const bud=flower(u-stem,(v-.73)*1.05);if(bud<.065)return 4;if(bud<.14)return 5;
    return flower(u-.12,(v-.20)*1.27)<.057?2:0;
  }
  const row=Math.floor((y-.09)*6.2),u=frac((x-.5)*6.1+.5+.5*(row&1))-.5,v=frac((y-.09)*6.2)-.5;
  const dist=Math.abs(u)+Math.abs(v)*.81+.014*c(18*u);if(dist<.062)return 3;if(dist<.215)return row&1?4:2;
  if(dist<.258)return 3;if(dist<.30)return 5;if(Math.abs(Math.abs(v)-.404)<.013)return 1;
  return Math.abs(v)>.422&&Math.abs(u)>.30?2:0;
}
// Pack repeated runs of the drawing (including mirror-repeats and row spans).
function pack(src){const out=[],lit=[],dict=new Map();let i=0;
  function flush(){if(lit.length){out.push(lit.length-1,...lit);lit.length=0;}}
  const hash=j=>src[j]|(src[j+1]<<8)|(src[j+2]<<16);
  function remember(j){const key=hash(j),found=dict.get(key)??[];if(found.length===16)found.shift();found.push(j);dict.set(key,found);}
  while(i<src.length){let best=0,dist=0;const prev=dict.get(hash(i));if(prev)for(let k=prev.length-1;k>=0;k--){const p=prev[k];if(i-p>65535)break;let n=0;while(n<130&&i+n<src.length&&src[p+n]===src[i+n])n++;if(n>best){best=n;dist=i-p;}if(n===130)break;}
    if(best>=4){flush();out.push(128+best-3,dist&255,dist>>8);for(let k=0;k<best;k++)remember(i++);}
    else{lit.push(src[i]);remember(i++);if(lit.length===128)flush();}}
  flush();return Buffer.from(out).toString('base64');}
const art=[];
for(let n=0;n<4;n++){
  const out=[];
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const jitter=.29*s(y*.19+n)+.15*s(y*.74-n),a=ink(n,(x+.50+jitter)/W,(y+.50)/H);
    const aa=[ink(n,(x+.16+jitter)/W,(y+.19)/H),ink(n,(x+.8+jitter)/W,(y+.19)/H),ink(n,(x+.17+jitter)/W,(y+.81)/H),ink(n,(x+.82+jitter)/W,(y+.82)/H)];
    const b=aa.find(k=>k!==a)??a,weight=b===a?0:Math.min(3,aa.filter(k=>k===b).length),packed=a+(b<<3)+(weight<<6);
    out.push(packed);
  }
  art.push(pack(out));
}
const lines=art.map(data=>"  [\n"+data.match(/.{1,140}/g).map(s=>`    '${s}',`).join('\n')+"\n  ].join('')");
writeFileSync(new URL('../src/villaUpholsteryCartoons.ts',import.meta.url),`// Generated by assets-sources/bake_upholstery_loom.mjs (original dye cartoons).\nexport const rugCartoons = [\n${lines.join(',\n')}\n] as const;\n`);
