import * as THREE from 'three';
import { sheet, stock, turn, type FurnitureKit, type Point, type PutSurface } from './villaFurnitureForms.js';
import { outdoorPlanter } from './villaHedgePlanters.js';
import { plantSeed } from './villaHedgeShoots.js';
import { HOUSE_PRINT, inkUV, printChart } from './villaDomesticArt.js';
import { NatureMesh, polar, type P3 } from './villaNatureGeometry.js';

/** Thin folded lamina; its reverse is the underside of the same leaf. */
export function leafBlade(width: number, length: number, arch: number) {
  return sheet([-1, 0, 1], width < .046 ? [-1, -.50, .14, .70, 1] : [-1, -.63, -.14, .38, .81, 1], (u, v) => {
    const t = (v + 1) / 2, span = width * (.016 + .984 * Math.sin(t * Math.PI) ** .80) * (1.16 - t * .34);
    return [u * span + .11 * width * Math.sin(t * Math.PI), length * (.60 * t + arch * Math.sin(t * Math.PI)) + .16 * span * (1 - Math.abs(u)) + u * span * t * .21, length * (.62 * t + .32 * t * t)];
  }, true);
}
type Station = [number, number, number, number];
interface Grow {
  put: PutSurface;
  at: FurnitureKit['at'];
  m: FurnitureKit['m'];
  twig(stations: Station[], m: THREE.Material): void;
  random(): number;
}
/** Wax-leaved ZZ plant. Each bowed rachis carries opposite, diminishing pinnae;
 * their sockets coincide with real stations on that stem, not points in space. */
function compoundFronds({ put, at, m, twig, random }: Grow) {
  const turn = random() * .8;
  for (let f = 0; f < 5; f++) at(0, 0, 0, turn + f * 2.4, () => {
    const height = .49 + .34 * random(), reach = .205 + .14 * random();
    const ts = [0, .22, .42, .59, .74, .88, 1];
    const shaft: Station[] = ts.map(t => [.022 * Math.sin(Math.PI * t + f) * t, height * t, .045 + reach * t ** 1.56, .0041 + .010 * (1 - t) ** 1.6]);
    twig(shaft, m.leaf);
    for (let j = 2; j < shaft.length - 1; j++) {
      const [x, y, z] = shaft[j], t = ts[j];
      for (const side of [-1, 1]) {
        const len = (.221 - .091 * t) * (.92 + .13 * random()), width = .052 - .021 * t;
        put(leafBlade(width, len, .14), j === 5 || (j + f) % 5 === 0 ? m.leafLight : m.leaf,
          x, y, z, .53 - t * .25, side * (1.08 - t * .26), side * .13);
      }
    }
    const tip = shaft[shaft.length - 1]; put(leafBlade(.027, .119, .11), m.leafLight, tip[0], tip[1], tip[2], -.12);
  });
}
/** Broad paired lobes attach at the basal notch of each heart leaf. The pointed
 * drip tip turns down; the leaf blade doesn't stand vertically on its petiole. */
function heartLeaf(width: number, length: number) {
  return sheet(width < .05 ? [-1, 0, 1] : [-1, -.42, 0, .42, 1], width < .05 ? [-1, -.69, -.25, .41, 1] : [-1, -.79, -.46, -.09, .34, .72, 1], (u, v) => {
    const t = (v + 1) / 2, belly = Math.sin(Math.PI * t) ** .63 * (1.52 - .94 * t);
    const lobe = Math.abs(u) ** 1.3 * Math.exp(-(((t - .16) / .19) ** 2));
    return [u * width * (.015 + belly), length * (.19 * Math.sin(t * Math.PI) - .23 * t * t) - .19 * width * u * u * belly,
      length * (t - .21 * lobe)];
  }, true);
}
function canePlant({ put, at, m, twig, random }: Grow, herb: boolean) {
  const stems = herb ? 3 : 2, turn = random();
  for (let f = 0; f < stems; f++) at(0, 0, 0, f * 2.4 + turn, () => {
    const h = (herb ? .266 : .622) * (1 + .16 * random() - .15 * f), reach = herb ? .123 : .203;
    const nodes: Station[] = [[0, 0, .024, herb ? .010 : .020], [.012, h * .24, .042, .011], [-.007, h * .51, reach * .39, .009], [.024, h * .75, reach * .67, .007], [.034, h, reach, .004]];
    twig(nodes, herb ? m.leaf : m.walnut);
    for (let j = 1; j < nodes.length; j++) {
      const [x, y, z] = nodes[j];
      at(x, y, z, (j % 2 ? -.98 : .90) + .24 * j, () => {
        const length = herb ? .117 - j * .008 : .258 - .023 * j, offset = herb ? .046 : .091;
        twig([[0, 0, 0, .006], [0, .027, offset * .48, .004], [0, .044, offset, .0035]], m.leaf);
        put(heartLeaf(herb ? .046 : .089, length), j === 4 ? m.leafLight : m.leaf, 0, .044, offset, j === 4 ? -.42 : .03, 0, (f % 2 ? -.11 : .14));
        if (herb && j < 4) put(heartLeaf(.038, length * .81), m.leafLight, 0, .006, .009, -.25, Math.PI, -.13);
      });
    }
  });
}
function blossom(radius: number, opening: number) {
  // Five individually cupped petals with open notches. The petal is a thin
  // membrane, not a solid of revolution; opposite windings finish both faces.
  const xyz: number[] = [], uv: number[] = [], ids: number[] = [];
  const petal: Point[] = [[0, -.11, .51], [-.078, -.37, .032], [-.397, -.054, .54], [-.216, .304, .95], [.207, .318, 1], [.406, -.063, .58], [.073, -.37, .032]];
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * .4, s = Math.sin(a), c = Math.cos(a);
    for (const under of [false, true]) {
      const base = xyz.length / 3;
      for (const [x, y, z] of petal) {
        xyz.push((x * c + z * s) * radius * opening, (y + (1 - opening) * z - (under ? .008 : 0)) * radius, (-x * s + z * c) * radius * opening);
        uv.push(.5 + x, z);
      }
      for (let j = 1; j <= 6; j++) { const n = j % 6 + 1; ids.push(base, base + (under ? n : j), base + (under ? j : n)); }
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(xyz, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(ids); g.computeVertexNormals(); return g;
}
function floweringSpray({ put, at, m, twig, random }: Grow, floor: boolean) {
  // Floor sprays rise in slender wands. On a table the woody twigs instead fan
  // out, dip over the rim, then turn their flowering tips back into the light.
  const offset = random() * .97;
  for (let f = 0; f < (floor ? 4 : 3); f++) at(0, 0, 0, f * 2.4 + offset, () => {
    const reach = (floor ? .199 : .343) * (.92 + random() * .18), h = (floor ? .579 : .232) * (.80 + random() * .42);
    const j: Point = [-.019, h * .57, reach * .55], tip: Point = [.041, h, reach];
    twig([[0, 0, .029, .011], [.008, h * .35, reach * .24, .009], [...j, .007], [.011, h * .71, reach * .81, .005], [...tip, .003]], m.walnut);
    for (const side of [-1, 1]) {
      const end: Point = [j[0] + side * (.080 + .06 * random()), h * (.69 + .15 * random()), reach * .88];
      twig([[...j, .005], [j[0] + side * .065, h * .59, reach * .80, .004], [...end, .0026]], m.leaf);
      put(leafBlade(.028, floor ? .128 : .092, .19), side > 0 ? m.leaf : m.leafLight, j[0] + side * .061, h * .59, reach * .80, .52, side * .82, side * .12);
      const size = .038 + .007 * random(), tilt = .15 + .30 * random();
      const bloom = side > 0 && f % 2 ? turn([[.004, -.007], [.015, .005], [.016, .014], [.009, .024], [0, .027]], 7) : blossom(size, side > 0 ? .79 : .99);
      put(bloom, (f + side) % 3 === 0 ? m.cream : m.coral, ...end, tilt, side * .45, side * .49);
    }
    put(leafBlade(.035, .141, .2), m.leaf, -.010, h * .49, reach * .44, .45, -.79);
    put(blossom(.043, 1), f % 2 ? m.coral : m.cream, ...tip, .18, .13, -.26);
  });
}
export function planter(k: FurnitureKit, s: number, flowering: boolean, random: () => number, outdoor = false) {
  if (outdoor && flowering) { outdoorPlanter(k, s, random); return; }
  const put: PutSurface = (g, m, x, y, z, rx, ry, rz) => k.put(g.scale(s, s, s), m, x * s, y * s, z * s, rx, ry, rz);
  const at: FurnitureKit['at'] = (x, y, z, a, make) => k.at(x * s, y * s, z * s, a, make);
  const grow: Grow = { put, at, m: k.m, random, twig: (p, m) => put(stock(p, 5), m, 0, 0, 0) };
  const table = s < .8, m = k.m;
  // A low belly and inturned mouth hold the cut sprays; larger rooted plants
  // have straight nursery sides and a sturdy projecting hand-thrown rim.
  const profile: [number, number][] = table && flowering ? [[0, .010], [.110, .010], [.120, 0], [.143, 0], [.153, .029], [.205, .066], [.239, .137], [.246, .212], [.231, .264], [.181, .304], [.166, .325], [.179, .340], [.181, .355], [.165, .362], [.148, .348], [.145, .316]] :
    [[0, .012], [.136, .012], [.146, 0], [.168, 0], [.171, .034], [.183, .071], [.222, .233], [.231, .313], [.247, .331], [.251, .361], [.241, .382], [.222, .383], [.211, .368], [.205, .327]];
  put(turn(profile, table ? 12 : 16), m.terra, 0, 0, 0);
  const mouth = table && flowering ? .148 : .210, base = table && flowering ? .319 : .335;
  put(turn([[mouth, 0], [mouth * .72, .009], [0, .006]], 12), m.soil, 0, base, 0);
  at(0, base + .005, 0, 0, () => {
    if (flowering) floweringSpray(grow, !table);
    else if (s >= 1.32) compoundFronds(grow);
    else canePlant(grow, table);
  });
}

export type RoomSpecimen='zamioculcas'|'rubber-fig'|'cast-iron'|'bowstring-hemp'|'basil'|'flowering-quince';
/** A drawing in longitudinal stations and margin widths. Socket indents, a
 * raised midrib and a turned drip tip survive even in the unlit clay study. */
function figLeaf(size:number,half:number,basil=false){
  // Each side of the raised midrib is one gently cupped leaf plane. Resolution
  // belongs in the changing outline and rolled tip, not parallel cross strips.
  return sheet([-1,0,1],[-1,-.76,-.38,.08,.47,.75,.91,1],(u,v)=>{
    const t=(v+1)*.5, belly=(.012+.988*Math.sin(Math.PI*t)**.64)*(1.16-t*.31);
    return [u*half*belly+.075*half*Math.sin(t*Math.PI*1.32),size*(.236*Math.sin(t*Math.PI)-.215*t*t)+half*belly*((1-Math.abs(u))*.16-u*u*.13+(basil?.06*Math.cos(t*23)*u*u:0)),t*size];
  },true);
}
/** A coriaceous, blunt-shouldered Ficus elastica blade. The young upper rib
 * sits proud of the waxy pelt, and the lower costa runs out from the petiole
 * like a keel. Both optical faces follow the SAME directed vein chart. */
function figBlade(put:PutSurface,press:THREE.Material,rib:THREE.Material,len:number,half:number,turn:number,lean:number,roll:number,y:number,z:number){
  const stations=[0,.07,.18,.37,.57,.76,.89,.96,1];
  const point=(u:number,t:number,under:boolean):Point=>{
    const spread=Math.max(.002,Math.sin(Math.PI*t)**.67)*(1.14-t*.34)*(1+.046*u*Math.sin(4*t+turn));
    const bow=Math.sin(Math.PI*t),ridge=(1-Math.abs(u))*.145*half*spread;
    return [half*spread*u+half*.20*bow*Math.sin(3.7*t+turn),len*(.183*bow-.215*t*t)-half*spread*.17*u*u+ridge+half*.105*u*bow*Math.sin(4*t+turn)-(under?.0011*bow*(1-u*u):0),len*t+half*.045*u*bow];
  };
  for(const under of [false,true]){
    const chart=sheet([-1,-.32,0,.38,1],stations.map(t=>2*t-1),(u,v)=>point(u,(v+1)/2,under),true);
    if(under){const ix=chart.index!;for(let i=0;i<ix.count;i+=3){const b=ix.getX(i+1);ix.setX(i+1,ix.getX(i+2));ix.setX(i+2,b);}chart.computeVertexNormals();}
    put(printChart(chart,under?HOUSE_PRINT.figLower:HOUSE_PRINT.figUpper),press,0,y,z,lean,0,roll);
  }
  const costa:Station[]=[0,.15,.39,.68,.91].map(t=>{const [x,yy,zz]=point(0,t,true),r=.0026*(1-.88*t);return [x,yy-r*.58,zz,r];});
  put(stock(costa,4),rib,0,y,z,lean,0,roll);
}
function rubberFig({m,put,at,random}:Grow,press:THREE.Material){
  at(0,0,0,random()*1.71,()=>{
    const tall:Station[]=[[-.038,-.006,.009,.029],[-.034,.065,.013,.024],[-.050,.176,.022,.020],[-.033,.300,.051,.018],[.003,.438,.061,.015],[.016,.561,.044,.013],[.003,.683,.068,.010],[.046,.779,.101,.007],[.048,.821,.093,.004]];
    const arm:Station[]=[[tall[2][0],tall[2][1],tall[2][2],.014],[-.097,.253,-.019,.012],[-.107,.358,-.038,.011],[-.154,.465,-.062,.009],[-.171,.555,-.047,.007],[-.157,.648,-.031,.0035]];
    const bark=(p:Station[],sides:number)=>put(printChart(stock(p,sides),HOUSE_PRINT.figBark),press,0,0,0);
    for(let root=0;root<4;root++){
      const a=root*1.57+.16,foot=polar(a,.111+.016*random(),.002),knee=polar(a,.061,.012);
      bark([[tall[0][0],.046,tall[0][2],.012],[knee[0]-.022,knee[1],knee[2],.008],[foot[0]-.011,foot[1],foot[2],.001]],6);
    }
    for(const [idx,nodes] of [tall,arm].entries()){
      // The previous stipule leaves an annular scar at each internode. This is
      // a slight swelling of the same cane, not a ring floating around it.
      const p:Station[]=[];
      nodes.forEach((v,j)=>{
        if(j>0&&j<nodes.length-1){const prev=nodes[j-1],t=.956;
          p.push([prev[0]+(v[0]-prev[0])*t,prev[1]+(v[1]-prev[1])*t,prev[2]+(v[2]-prev[2])*t,v[3]*1.08]);}
        p.push(v);
      });bark(p,7);
      for(let j=idx?1:2;j<nodes.length-1;j++){
        const [x,y,z]=nodes[j],az=j*2.41+idx*.93;
        at(x,y,z,az,()=>{
          const sy=.025+random()*.015,sz=.045+random()*.033;
          const petiole:Station[]=[[0,0,0,.0052],[.004,sy*.38,sz*.38,.0044],[.002,sy*.91,sz*.79,.004],[0,sy,sz,.0031]];
          put(printChart(stock(petiole,5),HOUSE_PRINT.figBark),press,0,0,0);
          const young=j===nodes.length-2,len=(.238+.052*random())*(young?.86:1),angle=(young?-.64:-.13)+.20*(random()-.5);
          figBlade(put,press,young?m.leafLight:m.leaf,len,(.066+.023*random())*(young?.9:1),idx+j,angle,(random()-.5)*.59,sy,sz);
        });
      }
      const top=nodes[nodes.length-1];
      put(stock([[0,0,0,.004],[.003,.026,.003,.008],[.012,.060,.006,.006],[.017,.086,.013,.0008]],6),m.terra,top[0],top[1],top[2]);
    }
  });
}
function swordPlant({m,put,at,twig,random}:Grow,aspidistra:boolean){
  const n=aspidistra?9:11;
  for(let i=0;i<n;i++)at(0,0,0,i*2.399+random()*.22,()=>{
    const foot=.017+random()*.051, stalk=aspidistra?.112+random()*.18:.026, reach=aspidistra?.22+random()*.16:.059+random()*.11;
    const h=(aspidistra?.37:.61)*(.65+random()*.56),w=aspidistra?.067:.046;
    twig([[0,0,foot,.0062],[0,stalk*.71,foot+.030,.0046],[0,stalk,foot+.046,.0034]],m.leaf);
    const blade=sheet([-1,0,1],[-1,-.74,-.28,.2,.60,.86,1],(u,v)=>{
      const t=(v+1)*.5,belly=.018+.982*(aspidistra?Math.sin(t*Math.PI)**.78:Math.sin(t*Math.PI*.96+.02)**.52*(1-.4*t));
      const roll=t*(i%2?.63:-.41),x=w*u*belly;
      return [x*Math.cos(roll)+.027*t*t*Math.sin(i),stalk+h*(aspidistra?Math.sin(t*1.89):t)-.12*w*u*u,foot+.046+reach*t**1.5+x*Math.sin(roll)+w*belly*(aspidistra?.22:-.32)*(1-Math.abs(u))];
    },true);
    put(blade,i%4===1?m.leafLight:m.leaf,0,0,0);
  });
}
function culinaryBasil({m,put,at,twig,random}:Grow){
  for(let i=0;i<4;i++)at(0,0,0,i*2.36+.16*random(),()=>{
    const h=.172+.128*random(),z=.064+.057*random();twig([[0,0,.019,.006],[0,h*.5,z*.64,.004],[0,h,z,.0018]],m.leaf);
    for(let j=0;j<3;j++)for(const hand of [-1,1]){
      const t=.36+j*.27;put(figLeaf(.107-j*.019,.041-j*.006,true),j===2?m.leafLight:m.leaf,0,t*h,.019+(z-.019)*t**.71,-.57+j*.08,j*Math.PI*.46+hand*Math.PI*.5,hand*.08);
    }
  });
}
function soilCrumbs(put:PutSurface,m:FurnitureKit['m'],random:()=>number,r:number,y:number){
  // Low, irregular, broken pieces of bark and a few damp clods. The bottom
  // corners enter the mounded surface; perlite is not a carpet of white triangles.
  const bark=new NatureMesh(),humus=new NatureMesh();
  for(let j=0;j<12;j++){
    const a=j*2.39, p=polar(a,r*(.22+.69*Math.sqrt(random())),y+.001),len=.007+random()*.014,w=.0025+random()*.003;
    const mesh=j%3?bark:humus,bx=Math.cos(a)*len,bz=Math.sin(a)*len,nx=-Math.sin(a)*w,nz=Math.cos(a)*w;
    const foot=mesh.point([p[0]-bx+nx,p[1]-.002,p[2]-bz+nz]),a1=mesh.point([p[0]-bx*.7-nx,p[1]-.001,p[2]-bz*.7-nz]);
    const end=mesh.point([p[0]+bx-nx,p[1],p[2]+bz-nz]),end1=mesh.point([p[0]+bx*.72+nx,p[1]-.002,p[2]+bz*.72+nz]),spine=mesh.point([p[0]+nx*.28,p[1]+w*.82,p[2]+nz*.28]);
    mesh.tri(foot,spine,a1);mesh.tri(a1,spine,end);mesh.tri(end,spine,end1);mesh.tri(end1,spine,foot);
  }
  put(bark.geometry(),m.soil,0,0,0);put(humus.geometry(),m.dark,0,0,0);
}
/** Only called for explicitly indoor pots. Roof vases and lawn pots continue
 * through the original planter(), with their original deterministic stream. */
export function insidePlanter(k:FurnitureKit,s:number,species:RoomSpecimen,seed:number,press:THREE.Material){
  const m=k.m,random=plantSeed(seed),put:PutSurface=(g,mat,x,y,z,rx,ry,rz)=>k.put(g.scale(s,s,s),mat,x*s,y*s,z*s,rx,ry,rz);
  const at:FurnitureKit['at']=(x,y,z,a,make)=>k.at(x*s,y*s,z*s,a,make),grow:Grow={put,at,m,random,twig:(p,mat)=>put(stock(p,5),mat,0,0,0)};
  const cut=species==='flowering-quince',chalk=species==='cast-iron'||species==='rubber-fig',h=cut?.324:species==='basil'?.273:species==='bowstring-hemp'?.311:.371;
  const r=cut?.217:species==='basil'?.192:species==='bowstring-hemp'?.217:.245,inner=cut?r*.46:r*.885;
  if(!cut){
    const saucer=turn([[0,0],[r*.70,0],[r*.85,.008],[r*.88,.031],[r*.85,.036],[r*.79,.015],[0,.012]],14);
    put(saucer,chalk?m.cream:m.terra,0,0,0);
  }
  const clay: [number,number][]=cut?[[0,0],[r*.46,0],[r*.56,.015],[r*.84,h*.21],[r,h*.48],[r*.93,h*.70],[r*.50,h*.91],[r*.48,h*.973],[r*.56,h],[inner,h+.002],[inner*.96,h*.943],[inner*.98,h*.85]]:
    [[0,0],[r*.60,0],[r*.64,h*.038],[r*.67,h*.12],[r*.91,h*.80],[r*.94,h*.87],[r,h*.894],[r,h*.958],[r*.97,h],[inner,h],[inner*.98,h*.955],[inner*.967,h*.847]];
  const lift=cut?0:.012;put(turn(clay,cut?16:14),cut?m.blue:chalk?m.cream:m.terra,0,lift,0);
  const soilY=lift+h*(cut?.864:.881);
  const soil=turn([[inner*.984,0],[inner*.75,.007],[inner*.39,.010],[0,.0085]],14);
  if(!cut){const pos=soil.getAttribute('position'),uv=soil.getAttribute('uv');for(let i=0;i<pos.count;i++)uv.setXY(i,...inkUV(HOUSE_PRINT.loam,.5+pos.getX(i)/(inner*2),.5+pos.getZ(i)/(inner*2)));}
  put(soil,cut?m.dark:press,0,soilY,0);
  if(!cut)soilCrumbs(put,m,random,inner,soilY+.008);
  at(0,soilY+.005,0,0,()=>{
    if(cut)floweringSpray(grow,false);
    else if(species==='zamioculcas')compoundFronds(grow);
    else if(species==='rubber-fig')rubberFig(grow,press);
    else if(species==='basil')culinaryBasil(grow);
    else swordPlant(grow,species==='cast-iron');
  });
}
