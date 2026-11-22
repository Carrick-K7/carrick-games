import * as THREE from 'three';
import type { CropPaint } from './villaCropArt.js';
import type { VILLA_VEGETABLE_SPECIES } from './villaGarden.js';
import { NatureMesh, NaturePalette, add3, collar, mix3, polar, stemAtHeight, turn, type P3 } from './villaNatureGeometry.js';
import { LEAF } from './villaHorticultureAtlas.js';
import { addLamina, butterLeaf, sliver, tomatoLeaflet } from './villaHorticultureLeaves.js';
import { clamp01 } from './villaWeatheredFinish.js';

const golden = 2.399963, wave = (a: number) => .5 + .5 * Math.sin(a);
type Kind = typeof VILLA_VEGETABLE_SPECIES[number];
const linear = (n: number): P3 => { const c = new THREE.Color(n); return [c.r, c.g, c.b]; };
const tomatoSkin = [0x788849,0xa8af67,0xd5ac66,0xe38152,0xcb553b,0xad4033].map(linear);
const eggSkin = [0x777053,0x7a596f,0x563d5b,0x473650].map(linear);
const carrotSkin = linear(0xb97b49), collarColor = linear(0x929356);
function pigment(scale: readonly P3[], age: number) {
  const f = clamp01(age) * (scale.length - 1), i = Math.floor(f); return mix3(scale[i], scale[Math.min(i + 1, scale.length - 1)], f - i);
}
/** A single skin with shoulders/calyx well and a slightly flattened blossom
 * scar. The actual section profile, not just an ellipsoid with a changed tint. */
function growFruit(m: NatureMesh, kind: 'tomato'|'eggplant'|'carrot', cap: P3, radius: number, height: number, angle: number, tint: P3) {
  const egg = kind === 'eggplant', carrot = kind === 'carrot';
  const sections = egg ? [[-1,0],[-.88,.74],[-.62,1],[-.34,.83],[-.060,.44],[-.025,0]] :
    carrot ? [[-1,0],[-.16,.76],[-.066,1],[-.009,.73],[-.012,0]] :
      [[-.97,0],[-.94,.53],[-.61,1],[-.26,.95],[-.015,.49],[-.059,0]];
  const sides = carrot ? 7 : radius < .029 ? 7 : 8;
  let prev: number[] = [];
  for (const [v, r] of sections) {
    const row: number[] = [];
    for (let k = 0; k < (r ? sides : 1); k++) {
      const a = -turn * k / sides + angle, lobe = 1 + (!egg && !carrot ? .024 + .065 * (1 + v) ** 2 : .020) * Math.cos(5 * a - angle);
      const drift = egg ? (-v * .30 + .095 * Math.sin(v * Math.PI)) * height : -.035 * v * height;
      const offset = polar(a, r * radius * lobe, v * height), p = add3(cap, add3(offset, polar(angle, drift, 0)));
      const blush = (egg ? .044 : .093) * Math.cos(a - angle) * r, shoulder = (1 + v) ** 3;
      const color: P3 = [tint[0] * (.94 + blush - .11 * shoulder), tint[1] * (.96 - blush + .09 * shoulder), tint[2] * (.95 - blush * .5)];
      row.push(m.point(p, 1, undefined, carrot ? mix3(color, collarColor, shoulder * .27) : color));
    }
    if (prev.length) for (let k = 0; k < sides; k++) {
      const j = (k + 1) % sides;
      if (prev.length === 1) m.tri(prev[0], row[j], row[k]);
      else if (row.length === 1) m.tri(prev[k], prev[j], row[0]);
      else { m.tri(prev[k], prev[j], row[k]); m.tri(prev[j], row[j], row[k]); }
    }
    prev = row;
  }
}

export function addButterhead(a: NaturePalette, root: P3, leaf: THREE.Material, newer: THREE.Material, phase: number, size: number, stage: number) {
  const counts = [5 + Number(stage > .61), 4 + Number(stage > .42), 3 + Number(stage > .71)];
  for (let whorl = 0; whorl < 3; whorl++) for (let j = 0; j < counts[whorl]; j++) {
    const angle = phase + whorl * 1.66 + j * turn / counts[whorl] + .12 * Math.sin(phase + j*2.3);
    const chart = whorl === 2 ? LEAF.heart : whorl === 1 ? LEAF.butter : j === 1 && Math.cos(phase) > .23 ? LEAF.spent : LEAF.wrapper;
    const base = add3(root, polar(angle, size*(.012 - .004*whorl), size*(.003 + .010*whorl)));
    butterLeaf(a.get(whorl ? newer : leaf), base, angle, size*(.93 + .12*stage), whorl, chart, .96 + .075*Math.sin(angle * 2), stage);
  }
}

function carrot(a: NaturePalette, paint: CropPaint, phase: number, age: number) {
  const c = .79 + .56 * age, crown: P3 = [0, .006 + .011 * age, 0];
  growFruit(a.get(paint.produce ?? paint.rust), 'carrot', crown, (.018 + .009 * age) * c, .150 * c, phase, carrotSkin);
  const fern = a.get(paint.green), count = 4 + Math.floor(age * 3.2);
  for (let j = 0; j < count; j++) {
    const angle = phase + golden * j, outside = j / count, reach = c * (.069 + .114 * outside), h = c * (.22 + .055 * wave(angle) - .09 * outside);
    const foot = add3(crown, polar(angle, .005, -.009)), mid = add3(foot, polar(angle, reach * .37, h * .65)), end = add3(foot, polar(angle + .11, reach, h));
    fern.tone = 1.07 + .23 * wave(angle); fern.stem([collar(foot,.0029 * c), collar(mid,.0021 * c), collar(end,0)], 3, 0, 0, true);
    // Two levels of subdivision: a fine primary rachis bears alternating pinnae;
    // each pinna in turn carries pointed leaflets. No broad orange roots on top.
    for (let k = 0; k < 7; k++) {
      const t = .29 + k * .099, p = t < .5 ? mix3(foot, mid, t * 2) : mix3(mid, end, t * 2 - 1), side = k % 2 ? -1 : 1;
      const dir = angle + side * (1.37 - .32 * t), len = c * (.080 - .046 * t);
      const tip = add3(p, polar(dir, len, len * (.55 - .15 * outside))), q = add3(mix3(p, tip, .54), [0, .006 * c, 0]);
      sliver(fern, p, q, tip, .0022 * c);
      for (let n = 0; n < 6; n++) {
        const s = .20 + n * .13, branch = s < .54 ? mix3(p, q, s / .54) : mix3(q, tip, (s - .54) / .46);
        const leafAngle = dir + (n % 2 ? -1 : 1) * .89, span = (.041 - .026 * s) * c;
        const high = add3(branch, polar(leafAngle, span, .42 * span));
        const shoulder = add3(mix3(branch, high, .41), polar(leafAngle + Math.PI / 2, .0048 * c, .0022 * c));
        fern.tri(fern.point(branch, 1.04), fern.point(shoulder, 1.19 + .15 * s), fern.point(high, 1.27));
      }
    }
  }
}

function compound(a: NaturePalette, paint: CropPaint, start: P3, angle: number, span: number, lift: number, shade: number) {
  const stalk = a.get(paint.green), leaf = a.get(paint.light);
  const mid = add3(start, polar(angle + .07, span * .47, lift + .029)), end = add3(start, polar(angle - .09, span, lift - span * .31));
  stalk.stem([collar(start,.0057), collar(mid,.0035), collar(end,0)], 3, 0, 0, true);
  const count = span > .284 ? 7 : 5;
  for (let j = 0; j < count; j++) {
    const terminal = j === count - 1, side = j % 2 ? -1 : 1, t = terminal ? 1 : .18 + j * .67 / (count - 2);
    const p = t < .47 ? mix3(start, mid, t / .47) : mix3(mid, end, (t - .47) / .53);
    const dir = terminal ? angle + .11 : angle + side * (1.42 - .31 * t), len = span * (terminal ? .55 : .58 - .15 * t) * (1 + .13 * Math.sin(angle + j));
    tomatoLeaflet(leaf,p,dir,len,len*(-.30 + .46*Math.sin(angle*2.2+j)),len*(.32+.035*Math.sin(t*5+angle)),shade+.052*t,LEAF.tomato);
  }
}
function star(m: NatureMesh, at: P3, angle: number, r: number, tipY: number, petalWidth: number, tone: number) {
  for (let k = 0; k < 5; k++) {
    const d = angle + k * turn / 5, mid = add3(at, polar(d, r * .53, tipY * .34 + r * .13)), tip = add3(at, polar(d + .18, r, tipY));
    sliver(m, at, mid, tip, petalWidth, tone);
  }
}
function truss(a: NaturePalette, paint: CropPaint, base: P3, az: number, stage: number, cluster: number) {
  const stem = a.get(paint.green), end = add3(base, polar(az, .16 + .06 * stage, -.034 - .024 * stage));
  const fork = add3(mix3(base, end, .51), [0, .042, 0]); stem.stem([collar(base,.0054),collar(fork,.0037),collar(end,0)],4,0,0,true);
  const n = 3 + (stage > .38 ? 1 : 0);
  for (let j = 0; j < n; j++) {
    const t = .24 + j * .72 / (n - 1), joint = t < .51 ? mix3(base, fork, t / .51) : mix3(fork, end, (t - .51) / .49);
    const dir = az + (j % 2 ? -1 : 1) * 1.15, cap = add3(joint, polar(dir, .030 + .013 * wave(az + j), -.038 - .035 * (1 - t)));
    const knuckle = add3(mix3(joint, cap, .45), [0,.010,0]); stem.stem([collar(joint,.0028),collar(knuckle,.0025),collar(cap,0)],3,0,0,true);
    const maturity = clamp01(.23 + .97 * stage - .29 * cluster - .31 * t + .12 * Math.sin(az + .91 * j));
    if (maturity < .16 && j === n - 1) { star(a.get(paint.gold),cap,az,.011,-.005,.0035,1); continue; }
    const r = .018 + .020 * maturity + .003 * Math.cos(az + 2 * j), depth = 1.60 + .19 * wave(az * 2 + j);
    growFruit(a.get(paint.produce ?? paint.rust), 'tomato', cap, r, r * depth, dir, pigment(tomatoSkin, maturity));
    star(stem, cap, dir, r * .76, -.012 + .008 * wave(j + az), .0032, .91);
  }
}
function tomato(a: NaturePalette, paint: CropPaint, phase: number, age: number, railZ: number) {
  const h = .62 + .43 * age, foot: P3 = [0, -.021, 0];
  const node = (t: number): P3 => [.070 * Math.sin(4.7 * t + phase) * Math.sin(2*t), h*t, railZ*h*t/1.34 + .058*Math.sin(t*6.4 + phase)*t];
  const primary = [foot, node(.24), node(.48), node(.76), node(1)], green = a.get(paint.green);
  green.tone = .98; green.stem(primary.map((p,i) => collar(p,.0137 - .0027*i)), 5, .05, phase, true);
  const sideAngle = phase + 2.12, branch = [primary[1], add3(node(.52), polar(sideAngle,.127,0)), add3(node(.85), polar(sideAngle + .23,.193,0))];
  green.stem(branch.map((p,i) => collar(p,.0099 - .0033*i)), 4,0,0,true);
  const leaves = 5 + Number(age > .48);
  for (let j = 0; j < leaves; j++) {
    const t = .115 + j * .845 / (leaves - 1), span = (.249 + .112*age) * (1 - .27*t) * (.93 + .16*wave(phase + j*2.19));
    compound(a,paint,stemAtHeight(primary,h*t),phase + golden*j + .14*Math.cos(phase+j), span, .043 + .051*t, .92 + .15*t);
  }
  for (let j = 0; j < 3; j++) compound(a,paint,stemAtHeight(branch,h*(.37+j*.215)),sideAngle+(j-1)*1.77,
    (.220 + .089*age)*(1-.090*j),.035+.019*j,.95+.047*j);
  const elbow=add3(node(.40),polar(sideAngle+2.83,.094,0)), axil=add3(elbow,polar(sideAngle+2.58,.078,h*.135));
  green.stem([collar(primary[1],.0078),collar(elbow,.0061),collar(axil,.0032)],4,0,0,true);
  compound(a,paint,axil,sideAngle+2.67,.208+.064*age,.022,.96);
  const n = age > .73 ? 3 : 2;
  for (let j = 0; j < n; j++) truss(a,paint,stemAtHeight(j === 1 ? branch : primary,h*(.39 + j*.20)),phase + 1.17 + j*2.66,age,j);
  return [stemAtHeight(primary,.43 * h), stemAtHeight(primary,.78 * h)];
}
function eggplant(a: NaturePalette, paint: CropPaint, phase: number, age: number) {
  const h = .39 + .28 * age, stem = a.get(paint.green), foot: P3 = [0,-.018,0];
  const knee = polar(phase,.051,h*.30), fork = polar(phase - .29,.083,h*.60), tip = polar(phase+.61,.123,h);
  const main = [foot,knee,fork,tip]; stem.tone = .89; stem.stem(main.map((p,i) => collar(p,.0130 - i*.0031)),5,.045,phase,true);
  const laterals: P3[][] = [];
  for (let k=0;k<2;k++) {
    const angle = phase + 2.10 + k * 2.52, start = stemAtHeight(main,h*(.20 + .13*k)), end = add3(start,polar(angle,.151+.063*age,h*.52));
    const bend = add3(start,polar(angle-.20,.099,h*.20)); laterals.push([start,bend,end]); stem.stem([collar(start,.0087),collar(bend,.0064),collar(end,.0028)],4,0,0,true);
  }
  for (let j=0;j<11;j++) {
    const upper = j===4||j===7||j===10, t = j<5 ? .155+.193*j : .29+.31*((j-5)%3), path = j<5 ? main : laterals[Math.floor((j-5)/3)];
    const p = stemAtHeight(path,j<5 ? h*t : path[0][1] + t*(path[2][1]-path[0][1])), angle = phase + golden*j;
    const joint = add3(p,polar(angle,.040+.017*age,.022)); stem.stem([collar(p,.0055),collar(joint,0)],3,0,0,true);
    const len = (.195+.099*age)*(.91+.18*wave(angle))*(upper?.72:1);
    addLamina(a.get(paint.light),joint,{chart:LEAF.eggplant,shape:'egg',phase:angle,reach:len,rise:len*(upper ? .22+.24*Math.sin(angle) : -.37+.38*Math.sin(angle)),
      arch:.21*len,width:len*(.37+.050*wave(j)),cup:-.21,twist:.64*Math.cos(angle+.3),shade:.89+.16*t});
  }
  const n = age>.72 ? 3 : age>.30 ? 2 : 1;
  for (let j=0;j<n;j++) {
    const p = j===2 ? fork : mix3(laterals[j][1],laterals[j][2],.52), dir = phase+j*2.13+1.60;
    const cap = add3(p,polar(dir,.048,-.035)), bend=add3(p,polar(dir,.029,.018));
    stem.stem([collar(p,.0052),collar(bend,.0042),collar(cap,.0058)],4,0,0,true);
    const ripe = clamp01(.43 + age*.58 - j*.19), length=.068+.104*ripe, r=.019+.021*ripe;
    growFruit(a.get(paint.produce ?? paint.plum),'eggplant',cap,r,length,dir,pigment(eggSkin,ripe));
    star(stem,cap,dir,r*.91,-.033,.0082,.93);
  }
  if(age<.65) {
    const p=add3(tip,polar(phase,.036,-.012));stem.stem([collar(tip,.0024),collar(p,.0018)],3,0,0,true);
    star(a.get(paint.purple),p,phase,.020,-.009,.006,1.06); sliver(a.get(paint.gold),p,add3(p,[0,-.005,0]),add3(p,[.002,-.009,0]),.0038);
  }
}
export function growKitchenPlant(a: NaturePalette, kind: Kind, paint: CropPaint, phase: number, age: number, railZ: number): P3[] {
  if (kind === 'tomato') return tomato(a,paint,phase,age,railZ);
  if (kind === 'lettuce') addButterhead(a,[0,-.009,0],paint.light,paint.light,phase,.70+.43*age,age);
  else if (kind === 'carrot') carrot(a,paint,phase,age);
  else eggplant(a,paint,phase,age);
  return [];
}
