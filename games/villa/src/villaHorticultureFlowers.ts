import type { CropPaint } from './villaCropArt.js';
import type { VILLA_FLOWER_SPECIES } from './villaGarden.js';
import { NatureMesh, NaturePalette, add3, collar, margin, mix3, polar, turn, type P3 } from './villaNatureGeometry.js';
import { LEAF } from './villaHorticultureAtlas.js';
import { addLamina, sliver } from './villaHorticultureLeaves.js';

type Flower = typeof VILLA_FLOWER_SPECIES[number];
const scale = (p: P3,s: number): P3 => [p[0]*s,p[1]*s,p[2]*s];
const golden = 2.399963;
/** Bowl sections have an actual petal shoulder, rolled sides and a returning
 * margin. The youngest inner whorl is deeper and the light comes in from above. */
function tepal(m: NatureMesh, at: P3, a: number, radius: number, height: number, width: number, roll: number, shade: number) {
  const f=Math.cos(a), g=Math.sin(a); let prev=[m.point(at,shade*.67)];
  for(const [t,w] of (height<.085 ? [[.26,.68],[.70,1],[.91,.73]] : [[.22,.52],[.51,.96],[.77,1],[.94,.73]])) {
    const ring=[];
    for(const s of [-1,0,1]) {
      const across=s*w*width, flare=radius*(.94*Math.sin(t*Math.PI*.64)+.06*t) - Math.abs(s)*w*width*.52;
      const h=height*t+roll*s*t + width*.11*Math.abs(s)*t;
      const tone=shade*(.69+.28*t + (s===0 ? -.045 : .081));
      ring.push(m.point([at[0]+f*flare-g*across,at[1]+h,at[2]+g*flare+f*across],tone));
    }
    for(let k=0;k<2;k++) {
      if(prev.length===1) m.tri(prev[0],ring[k+1],ring[k]);
      else { m.tri(prev[k],prev[k+1],ring[k]); m.tri(prev[k+1],ring[k+1],ring[k]); }
    }
    prev=ring;
  }
  const tip=m.point(add3(at,polar(a,radius*.89,height)),shade*1.09); m.tri(prev[0],prev[1],tip); m.tri(prev[1],prev[2],tip);
}
/** Four facets suffice for a 2–4 cm ray or sterile hydrangea sepal. Its two
 * margins and lifted rib have different normals even at a grazing angle. */
function bract(m:NatureMesh, p:P3, d:P3, across:P3, arch:P3, shade:number) {
  const end=add3(p,d),shoulder=add3(p,scale(d,.61)),rib=m.point(add3(shoulder,arch),shade*1.08);
  const root=m.point(p,shade*.78),l=m.point(add3(shoulder,across),shade),r=m.point(add3(shoulder,scale(across,-1)),shade*.95),tip=m.point(end,shade*1.04);
  m.tri(root,r,rib);m.tri(root,rib,l);m.tri(l,rib,tip);m.tri(rib,r,tip);
}
function rayFlower(art:NaturePalette,paint:CropPaint,at:P3,sun:boolean,phase:number,size:number) {
  const r=(sun?.054:.016)*size;
  const normal:P3=sun ? [.07*Math.sin(phase),.26,-.963] : [.08*Math.cos(phase),.992,.09];
  const u:P3=[1,0,0],v:P3=[0,-normal[2],normal[1]],ray=(a:number,d:number):P3=>add3(scale(u,Math.cos(a)*d),scale(v,Math.sin(a)*d));
  const disk=art.get(sun?paint.dark:paint.gold);
  const place=(x:number,y:number,z:number)=>add3(at,add3(add3(scale(u,x),scale(v,z)),scale(normal,y)));
  disk.round([[-r*.24,0],[-r*.06,r],[r*.15,r*.81],[r*.24,0]],sun?11:8,place);
  for(let j=0;j<(sun?18:14);j++) {
    const a=j*golden+phase, foot=add3(at,ray(a,r*.72)), dir=add3(ray(a+.08,(sun?.064:.034)*size*(1+.14*Math.sin(j*2.5))),scale(normal,.006*size));
    const m=art.get(sun?paint.gold:paint.white); m.tone=.92+.11*Math.cos(j+phase);
    bract(m,foot,dir,ray(a+Math.PI/2,(sun?.014:.0066)*size),scale(normal,(.006+.002*Math.cos(j))*size),m.tone);
  }
  // The central florets form a raised spiral disk, not a label or a flat spot.
  for(let j=0;j<(sun?11:3);j++) {
    const a=j*golden,t=Math.sqrt(j/(sun?11:3))*.89,foot=add3(add3(at,ray(a,t*r)),scale(normal,r*(.224-t*.10)));
    const m=art.get(sun?paint.rust:paint.gold);
    m.tri(m.point(add3(foot,ray(a,r*.043)),.76),m.point(add3(foot,ray(a+2.16,r*.049)),.97),m.point(add3(foot,scale(normal,r*.082)),1.06));
  }
}
export function growGardenBloom(art:NaturePalette, species:Flower, paint:CropPaint, h:number, phase:number, open:number, companions:boolean) {
  const stalk=art.get(paint.green), leaves=art.get(paint.light), base:P3=[0,-.014,0];
  const knee=polar(phase,.016+h*.030,h*.50), head=polar(phase+.23,.021+h*.064,h);
  const sun=species==='sunflower', tulip=species==='tulip', lav=species==='lavender', rose=species==='rose', hyd=species==='hydrangea';
  const r=sun?.009:hyd||tulip?.0065:.0045;
  stalk.tone=.90+.07*Math.sin(phase); stalk.stem([collar(base,r*1.28),collar(knee,r),collar(head,r*.62)],5,0,0,true);
  const leafCount=lav?8:tulip?3:hyd?6:rose?3:5;
  for(let i=0;i<leafCount;i++) {
    const angle=phase + (hyd ? Math.floor(i/2)*1.69+i%2*Math.PI : i*golden), t=tulip?.035+i*.092:hyd?.33+Math.floor(i/2)*.235:lav?.04+.051*i:.12+i*(rose?.24:.15);
    const p=t<.50?mix3(base,knee,t*2):mix3(knee,head,t*2-1);
    if(rose) {
      const end=add3(p,polar(angle,.113+i*.007,.045)); stalk.stem([collar(p,.0034),collar(end,0)],3,0,0,true);
      for(let j=0;j<5;j++) addLamina(leaves,mix3(p,end,.23+.18*j),{shape:'leaflet',chart:LEAF.herb,phase:angle+(j===4?0:j%2?1.03:-1.02),
        rise:.012-.004*j, reach:.046+.005*Math.sin(j+phase),width:.017,arch:.007,twist:.29*Math.cos(j),shade:.91+.029*j});
      if(i===0) stalk.blade(p,polar(angle+2.7,.013,-.015),.005,margin.spur);
    } else if(tulip) {
      addLamina(leaves,p,{shape:'strap',chart:LEAF.strap,phase:angle,reach:(.108+.044*Math.sin(phase+i))*(1.12-.12*i),rise:h*(.54+.074*i),
        width:.043+.011*Math.cos(i),arch:.032,belly:.040,cup:.58,twist:.75*Math.sin(angle+.6),shade:.91+.046*i});
    } else {
      const reach=lav?.065:hyd?.148:sun?.173:.092;
      addLamina(leaves,p,{shape:lav?'spear':hyd||sun?'ovate':'leaflet',chart:lav?LEAF.strap:LEAF.herb,phase:angle,
        reach:reach*(.84+.20*Math.cos(i+phase)),rise:lav?.057:hyd?-.026:sun?-.031:.036,arch:lav?.007:.029,
        width:lav?.008:hyd?.057:sun?.067:.025,cup:-.19,twist:.40*Math.cos(angle),shade:lav?1.05:.89+.14*t});
    }
  }
  if(lav) {
    for(let j=0;j<(open>.45?4:3);j++) {
      const a=phase+j*golden,p=mix3(base,knee,j===0?1:.22),tip=j===0?head:add3(head,polar(a,.075+.018*j,-.025*j));
      if(j)stalk.stem([collar(p,.0035),collar(tip,0)],3,0,0,true);
      const lower=add3(tip,polar(a,-.016,-.109-.022*open));
      for(let k=0;k<5;k++) {
        const v=k/4,origin=mix3(lower,tip,v),stemEnd=add3(origin,[0,.007,0]);
        for(let n=0;n<3;n++) {
          const dir=a+n*turn/3+k*2.18;
          const puff=art.get((j+k)%5===0?paint.blue:paint.purple); puff.tone=.76+.26*v+.10*Math.cos(dir);
          sliver(puff,origin,add3(origin,polar(dir,.011-.004*v,.006)),add3(origin,polar(dir,.014-.006*v,.015+.003*v)),.008-.002*v,puff.tone);
        }
        if(k===4)sliver(stalk, origin,mix3(origin,stemEnd,.45),stemEnd,.0016);
      }
    }
  } else if(hyd) {
    const joint=add3(head,[0,-.055,0]),count=10+Math.floor(open*3);
    for(let j=0;j<count;j++) {
      const a=j*golden+phase,t=Math.sqrt(j/count),p=add3(head,polar(a,t*(.095+.024*open),.053*(1-t*t)));
      stalk.stem([collar(joint,.0029),collar(p,0)],3,0,0,true);
      for(let k=0;k<4;k++) {
        const dir=a+k*Math.PI/2,puff=art.get(j%4?paint.blue:paint.purple); puff.tone=.79+.24*(1-t)+.1*Math.sin(j);
        bract(puff,p,polar(dir,.026+.006*open,.007-.013*Math.cos(dir)),polar(dir+Math.PI/2,.015,.002),[0,.005,0],puff.tone);
      }
      art.get(paint.white).blade(p,[.002,.009,0],.004,margin.spur);
    }
  } else if(rose || tulip) {
    for(let i=0;i<5;i++)stalk.blade(add3(head,[0,-.007,0]),polar(phase+turn*i/5,tulip?.019:.045,.025),.010,margin.lance,.003);
    const rings=tulip?2:3;
    for(let ring=0;ring<rings;ring++) {
      const n=tulip?3:5-ring;
      for(let j=0;j<n;j++) {
        const a=phase+j*turn/n+ring*(tulip?Math.PI/3:1.06);
        const paintInside=tulip?(Math.sin(phase*1.76)<-.48?paint.gold:paint.pink):ring===2?paint.rust:paint.pink;
        tepal(art.get(paintInside), add3(head,polar(a,.003+.001*ring,.005*ring)),a,
          (tulip?.035+.029*open:.057+.024*open)*(1-ring*(tulip?.19:.27)),(tulip?.126+.016*ring:.048+.012*ring)*(tulip?1:.89+.21*open),
          (tulip?.039+.007*open:.044)*(1-ring*.15),.005*Math.sin(a),.94+.065*Math.cos(j+phase));
      }
    }
    if(tulip && open>.5) for(let k=0;k<5;k++) {
      const p=add3(head,polar(phase+turn*k/5,.010,.045)),tip=add3(p,[.001,.024,0]);
      sliver(art.get(paint.rust),p,mix3(p,tip,.54),tip,.0018);
      art.get(paint.dark).blade(tip,[.002,.008,0],.0028,margin.spur);
    }
    if(rose && open>.58) {
      const bud=add3(knee,polar(phase+1.89,.102,h*.26));stalk.stem([collar(knee,.004),collar(bud,.0027)],4,0,0,true);
      for(let j=0;j<3;j++)tepal(art.get(paint.pink),bud,phase+turn*j/3,.017,.040,.014,0,.82);
    }
  } else {
    rayFlower(art,paint,head,sun,phase,.83+.25*open);
    if(!sun && companions && open>.42) for(let j=0;j<(open>.79?2:1);j++) {
      const tip=add3(knee,polar(phase+j*2.95,.081+.027*j,h*(.32+.05*j)));
      stalk.stem([collar(knee,.0031),collar(tip,.002)],3,0,0,true);rayFlower(art,paint,tip,false,phase+j,.72+.10*j);
    }
  }
}
