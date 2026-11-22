import * as THREE from 'three';
import type { VillaModelBuilder } from './villaModel.js';
import { NatureMesh, add3, collar, mix3, polar, stemAtHeight, type P3 } from './villaNatureGeometry.js';
import { HORNBEAM_TWIG_BOW, newTip, plantSeed, plantSurface, prepareShootFinish, ShootRanks } from './villaHedgeShoots.js';

/** Young trained Carpinus. Raised, fluted butt blends into the stem; an uneven
 * set of ascending scaffolds carries fanned secondary wood and short, leafy
 * herringbone shoots. The light windows are spaces between branches. */
export function islandHornbeam(b: VillaModelBuilder, x: number, y: number, z: number, height: number, bark: THREE.Material, leaf: THREE.Material) {
  const seed = x*.71+z*.39, random=plantSeed(seed), wood = new NatureMesh(), tips = new NatureMesh(), ranks = new ShootRanks('hornbeam');
  prepareShootFinish(leaf as THREE.MeshStandardMaterial,'hornbeam');
  const lean = random()*Math.PI*2, shootSide = random()*Math.PI*2;
  const bole: P3[] = [[0,-.026,0],polar(lean+.56,.030,.23),polar(lean+.26,.074,.89),polar(lean-.25,.040,1.40),
    polar(lean+.32,.129,2.16),polar(lean+.44,.185,2.78),polar(lean-.19,.141,3.44),polar(lean-.57,.182,3.81)];
  wood.stem(bole.map((p,i)=>collar(p,[.170,.116,.100,.092,.076,.057,.032,.009][i])),9,.19,lean,true);
  // Buttress toes flatten into the sward. Cuts are on stubs at real forks,
  // never a collar around the entire bole or decorative horizontal stripes.
  for(let i=0;i<4;i++) {
    const a = i*1.56+lean+(random()-.5)*.46, start = stemAtHeight(bole,.29+.14*random());
    wood.stem([collar(start,.060),collar(polar(a,.115,.078),.065),collar(polar(a,.20+.058*random(),-.020),0)],5,.12,a,true);
  }
  const lower = 1.33 + random()*.25, phase = random()*6.28;
  // Old headed growth flushes in knots: one close pair, then a longer length
  // of clear leader. The three trees do not carry the same number of whorls.
  const scaffoldCount = 8 + Math.floor(random()*3), stations = [0];
  for (let i=1; i<scaffoldCount; i++) stations.push(stations[i-1] + .27 + random()**1.5);
  for(let i=0;i<scaffoldCount;i++) {
    const t=stations[i]/stations[scaffoldCount-1], heading=phase+i*2.39+(random()-.5)*.82, twist=(random()-.5)*.69;
    const fork=stemAtHeight(bole,lower+t*1.84);
    const shoulder=.58-.30*t+.215*Math.sin(Math.PI*t), lead=.88+.23*Math.cos(heading-shootSide);
    const reach=shoulder*lead;
    const rise=.36+.27*random()+.14*t, elbow=add3(fork,polar(heading-.19,reach*.44,rise*.50));
    const wrist=add3(fork,polar(heading+twist*.40,reach,rise)), cut=add3(wrist,polar(heading+twist,.12+.055*random(),.080+.13*random()));
    wood.stem([collar(fork,.060-.032*t),collar(elbow,.040-.020*t),collar(wrist,.022-.012*t),collar(cut,.010-.004*t)],6,.11,heading,true);
    // Short, leafy spurs break from older wood inside the crown as well as
    // the ends of the boughs. Keep an occasional window at a pruned crotch.
    for (const side of [-1,1]) {
      const a=mix3(fork,elbow,.26+.53*random()), dir=heading+side*(.84+.45*random());
      ranks.shoot(a,add3(a,polar(dir,.28+.14*random(),.18+.13*random())),.153+.032*random(),dir+.28,i%4);
    }
    const laterals = i%4===3 ? 2 : i%4===1 ? 4 : 3;
    for(let j=0;j<laterals;j++) {
      const hand=j%2?-1:1, dir=heading+hand*(.43+.70*random())+(j>=2?-.23:.12);
      const base=j===0?mix3(elbow,wrist,.24+random()*.27):j===1?mix3(elbow,wrist,.69+random()*.17):mix3(wrist,cut,j===2?.42:.94);
      const run=(.33+.19*random())*(1-.50*t), climb=(j===2?.25:.17)+.16*random()-.11*t;
      const mid=add3(base,polar(dir-hand*.17,run*.49,climb*.64)), end=add3(base,polar(dir+hand*.18,run,climb));
      wood.stem([collar(base,.019-.007*t),collar(mid,.012),collar(end,.0035)],4,.04,dir,true);
      for(let k=0;k<6;k++) {
        const a = k<3 ? mix3(base,mid,.14+.36*k) : mix3(mid,end,.13+.40*(k-3));
        const head = dir+(k%2?1:-1)*(.75+.73*random()), radius=(.29+.18*random())*(1-.28*t);
        const sweep = k%3===1 ? -.12-.16*random() : .10+.24*random();
        const whippy = add3(a,polar(head,radius,sweep+(k===5?.10:0)-.07*t));
        const roll = random()*Math.PI*2, color = Math.floor(4*random());
        ranks.shoot(a,whippy,.157+.056*random(),roll,color);
        if (k===0 || k===4) {
          if (k===0) {
            const bend=mix3(a,whippy,.5); bend[1]+=HORNBEAM_TWIG_BOW;
            wood.stem([collar(a,.0057),collar(bend,.0031),collar(whippy,0)],3,0,0,true);
          }
          // A terminal leaf breaks the sheared outline and shows its pleated,
          // toothed margin in relief even from directly below the rank.
          newTip(tips,whippy,polar(head+.46,.097+.046*random(),.015-.064*random()),.031,roll*.64,true);
        }
      }
    }
  }
  for(let i=0;i<5;i++) {
    const a=stemAtHeight(bole,3.49+.058*i), dir=lean+i*1.84;
    const end=add3(a,polar(dir,.14+.085*random(),.23+.11*random()));
    ranks.shoot(a,end,.107,dir+.43,i%4);
    newTip(tips,end,polar(dir+.79,.075,.043),.022,dir*.47);
  }
  // Smooth silver-grey ribs on older wood, warm oxskin in the grooves. A
  // baked modulation of the course's own bark colour, not an extra draw/map.
  const trunk = plantSurface(wood,true), pos = trunk.getAttribute('position'), colors: number[] = [];
  for (let i=0; i<pos.count; i++) {
    const y=pos.getY(i), axis=stemAtHeight(bole,y), dx=pos.getX(i)-axis[0], dz=pos.getZ(i)-axis[2];
    const angle=Math.atan2(dz,dx), old=Math.max(0,1-Math.hypot(dx,dz)*2.7);
    const shade=(.96+.13*old*Math.cos(3*angle+.42*y+lean))*(1-.19*Math.exp(-Math.max(y,0)/.16));
    colors.push(shade*(1+.07*old),shade*(1+.25*old),shade*(1+.40*old));
  }
  trunk.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  if (!bark.vertexColors) { bark.vertexColors=true; bark.needsUpdate=true; }
  const parts=[[trunk,bark],[ranks.geometry(),leaf],[plantSurface(tips,false),leaf]] as const;
  // Match the familiar height and verge clearance of the stock planted on the
  // island. The small stretch here is applied to boughs, stems and leaves alike.
  let peak=0, radius=0;
  for(const [g] of parts) { const p=g.getAttribute('position'); for(let i=0;i<p.count;i++) {peak=Math.max(peak,p.getY(i));radius=Math.max(radius,Math.hypot(p.getX(i),p.getZ(i)));} }
  const sx=Math.min(1,1.36/radius)*height/4.08, sy=height/peak;
  b.at(x,y,z,0,()=>{ for(const [g,m] of parts) b.geometry(g.scale(sx,sy,sx),m); });
}
