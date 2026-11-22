import * as THREE from 'three';
import { NatureMesh, turn, type Collar, type P3 } from './villaNatureGeometry.js';
import type { VillaPetId } from './villaPets.js';
import { Surface, axialFur, clamp, coatLocks, eyelids, fade, fibreUV, form, hide, section, tint, wetKeratin, type Sections, type PointOnHide } from './villaCoatSurface.js';

const dogBody: Sections = [[-.24,.247,0,0],[-.212,.236,.080,.078],[-.161,.236,.129,.113],[-.080,.247,.114,.105],[-.016,.257,.107,.097],[.017,.255,.117,.114],
  [.050,.251,.13,.136],[.103,.258,.112,.134],[.143,.286,.086,.101],[.174,.308,.062,.071],[.194,.318,0,0]];
const rabbitBody: Sections = [[-.234,.198,0,0],[-.216,.191,.064,.081],[-.172,.194,.124,.132],[-.143,.204,.138,.149],[-.111,.208,.144,.153],[-.083,.208,.141,.147],
  [-.035,.200,.130,.124],[.030,.189,.113,.101],[.087,.217,.098,.090],[.13,.252,.074,.077],[.158,.273,0,0]];
const skull: Record<'cat'|'rabbit'|'dog', Sections> = {
  dog: [[-.100,.003,0,0],[-.084,.001,.067,.062],[-.052,.008,.095,.084],[-.014,.014,.103,.091],[.022,.014,.096,.088],
    [.051,.006,.081,.065],[.073,-.014,.062,.045],[.090,-.024,.053,.039],[.116,-.028,.056,.035],[.139,-.031,.043,.028],[.153,-.027,.029,.021],[.157,-.027,0,0]],
  cat: [[-.092,.005,0,0],[-.076,.010,.060,.063],[-.043,.014,.092,.079],[-.011,.015,.102,.087],[.021,.011,.099,.078],
    [.047,.004,.083,.065],[.065,-.008,.068,.054],[.081,-.023,.061,.041],[.093,-.026,.054,.032],[.103,-.024,.035,.025],[.110,-.020,.018,.016],[.114,-.020,0,0]],
  rabbit: [[-.096,.004,0,0],[-.076,.010,.064,.065],[-.039,.010,.094,.086],[-.001,.009,.103,.091],[.037,.004,.101,.083],
    [.061,-.005,.087,.069],[.081,-.015,.071,.059],[.106,-.026,.058,.041],[.123,-.028,.041,.033],[.134,-.021,.024,.021],[.138,-.023,0,0]],
};
const breed = (id: VillaPetId) => id === 'dog' ? 'dog' : id === 'cat' ? 'cat' : 'rabbit';
const colors = (id: VillaPetId) => id === 'dog' ? {base:0xb68457, dark:0x785942, pale:0xdfcdb1} : id === 'cat' ? {base:0xa1988a, dark:0x5d5b58, pale:0xddd2bd}
  : id === 'rabbit-female' ? {base:0xc5c3bc, dark:0x918f88, pale:0xe6e0d3} : {base:0xd5c2a6, dark:0xa3947d, pale:0xe9dec9};

function mammalPigment(id: VillaPetId) {
  const {base,dark,pale} = colors(id), cat = id === 'cat', dog = id === 'dog';
  return (x: number, y: number, z: number) => {
    const mottling = .48 + .21 * Math.sin(z * 44 + 9 * y + .8 * Math.sin(x * 34)) + .15 * Math.sin(x * 44 + y * 53 - z * 17);
    if (cat) {
      // Mackerel bars fork and fade over the curved mantle; a broken white bib
      // rises between the shoulders. The pigment stays in the hair-bearing skin.
      const arc = z + .021 * Math.sin(27 * z + x * 11) * (1 - fade(y, .23, .34)) + .014 * Math.sin(y * 27 + x * 9);
      const distance = Math.min(Math.abs(arc + .122), Math.abs(arc + .060), Math.abs(arc + .001), Math.abs(arc - .045));
      if (z > -.167 && z < .051 && y > .226 && distance < .0095) return 0x756658;
      const saddle = tint(base, dark, fade(y, .18, .36) * (.44 + .48 * mottling));
      const bars = tint(saddle, 0x625b53, (1 - fade(distance, .008, .027)) * fade(y, .19, .25) * .78);
      return tint(bars, pale, fade(z - (y - .235) * .66 + .014 * Math.sin(x * 73), .059, .100) * .92 + (1 - fade(y, .125, .175)) * .77);
    }
    const cape = fade(y, dog ? .225 : .200, dog ? .334 : .324) * (dog ? .40 + mottling * .64 : .20 + mottling * .42);
    const back = tint(base, dark, cape), chest = fade(z - (y - .24) * .68 + .02 * Math.sin(x * 40), .096, .148);
    return tint(back, pale, chest * (dog ? .94 : .49) + (1 - fade(y, .113, .183)) * (dog ? .62 : .89));
  };
}
const catForm = (x: number, y: number, z: number): P3 => {
  const front = Math.max(0, (z - .09) / .105), hip = Math.max(0, (-z - .14) / .055);
  const tuck = clamp((-y - .03) / .10) * Math.exp(-((z + .055) ** 2) / .0024);
  return [x * (1 - .24 * front + .18 * hip), y + .235 + .058 * front + .012 * hip + .027 * tuck, z - .035];
};
export function mammalBody(c: Surface, id: VillaPetId) {
  const pigment = mammalPigment(id), dog = id === 'dog', cat = id === 'cat';
  let sample: PointOnHide;
  if (cat) {
    // Keep the continuous tucked rib-cage skin rather than wrapping painted wire rings around it.
    const g = new THREE.SphereGeometry(1,16,28); g.rotateX(Math.PI/2); g.scale(.105,.13,.195);
    const p = g.getAttribute('position'); for (let i=0;i<p.count;i++) p.setXYZ(i,...catForm(p.getX(i),p.getY(i),p.getZ(i)));
    g.computeVertexNormals(); c.put(g,pigment,(x,y,z)=>fibreUV(.10 + .78*Math.atan2(Math.abs(x)/.105,(y-.235)/.13)/Math.PI - .08*Math.sin((z+.23)*8), .08 + .84*(.16-z)/.39));
    sample = (z,a) => { const r = Math.sqrt(clamp(1 - ((z+.035)/.195)**2)); return catForm(.105*r*Math.sin(a),.13*r*Math.cos(a),z+.035); };
  } else {
    const rows = dog ? dogBody : rabbitBody; c.put(form(rows,18),pigment,axialFur(rows)); sample=hide(rows);
  }
  // The short saddle lies close; only the nape, lower flank, bib and breeches
  // carry a broken edge. No loose hair quads scattered in the air.
  coatLocks(c,sample,pigment,[[.130,.035,.70,.66,8,cat?.012:.017], [.086,-.145,2.00,.48,11,dog?.018:.015],
    [-.082,-.167,1.22,.74,7,.014],[.113,.054,2.44,.74,5,.018]],cat?161:dog?113:227);
}

function pinna(c: Surface, id: VillaPetId, side: number) {
  const {base,dark,pale} = colors(id), m = new NatureMesh(), cat = id === 'cat', female = id === 'rabbit-female';
  if (id === 'dog') {
    // The ear first rolls OUT from its root, folds across the cheek, then turns
    // IN toward the jaw. Its leading lip and furred back aren't two oval paddles.
    const stations = [[-.103,.097,-.032,0,0],[-.093,.108,-.035,.006,.025],[-.073,.116,-.039,.009,.043],[-.042,.118,-.037,.011,.053],
      [-.005,.113,-.034,.013,.058],[.029,.107,-.027,.017,.056],[.051,.095,-.022,.022,.042],[.063,.083,-.019,.014,.025],[.065,.076,-.020,0,0]];
    m.skin(stations.map(([y,cx,cz,d,w])=>!w?[[side*cx,y,cz]]:Array.from({length:14},(_,i):P3=>{
      const a=-turn*i/14, along=Math.sin(a), out=side*Math.cos(a), lip=Math.exp(-(((along-.70)/.24)**2));
      return [side*(cx + d*out - .008*lip*fade(.04-y,0,.11)),y + .003*along,cz+w*along];
    })));
    c.put(m.geometry(),(x,y,z)=>tint(tint(0x77533e,0xa87951,fade(y,.012,.065)*.52),0x624a40,(1-fade(Math.abs(x),.084,.116))*.6+fade(z,-.013,.012)*.29),
      (_x,y,z)=>fibreUV(.11+.80*(z+.094)/.127,.10+.80*(.065-y)/.168));
    return;
  }
  const stations = cat ? [[.049,.043,.028],[.079,.045,.029],[.109,.036,.022],[.140,.020,.014],[.161,.005,.005]]
    : [[.054,.023,.025],[.085,.031,.027],[.138,.040,.026],[.192,.035,.020],[.232,.022,.013],[.253,.006,.005]];
  const pos = (x: number, h: number, z: number):P3 => [side*(cat?.055+.15*h:.040+h*(female?.28:.08))+x,h*(female?.93:1),
    -.015-.105*h-.008*fade(h,.12,.25)*(side+1)*.5+z];
  const cross = [[-1,0],[-.88,.52],[-.72,.78],[-.46,.40],[0,.18],[.43,.38],[.72,.76],[.89,.48],[1,0],[.70,-.72],[0,-.97],[-.67,-.74]];
  const rings:P3[][] = [[pos(0,.043,0)],...stations.map(([h,w,d])=>cross.map(([x,z])=>pos(x*w,h,z*d))),[pos(0,stations[stations.length-1][0]+.003,0)]];
  m.skin(rings); const last=m.positions.length/3-1;
  c.put(m.geometry(),(_x,y,_z,i)=>{
    if(i===0 || i===last) return tint(base,pale,.19); const j=(i-1)%cross.length;
    const inside=j>=2&&j<=6, t=fade(y,.065,cat?.124:.145);
    return inside ? tint(tint(dark,cat?0xa88378:0xba9189,.61+t*.37),pale,j===2||j===6?.28:.01) : tint(base,pale,(j===1||j===7?.45:.10)*t);
  }, (_x,y,_z,i)=>fibreUV(.1+.78*(i===0||i===last?.5:(cross[(i-1)%cross.length][0]+1)*.5),.90-.8*fade(y,.04,cat?.163:.255)));
}

function nose(c: Surface, tip: number, y: number, width: number, h: number, dog: boolean) {
  const m=new NatureMesh(), n=16;
  m.skin([[ [0,y,tip-.016] ], ...[[-.011,.74],[-.005,1],[.001,.91],[.003,.63]].map(([z,r])=>Array.from({length:n},(_,i):P3=>{
    const a=turn*i/n, sx=Math.cos(a),sy=Math.sin(a), notch=Math.exp(-(((Math.abs(sx)-.65)/.19)**2 + ((sy-.05)/.56)**2));
    return [width*sx*(.82+.23*sy)*r,y+h*sy*r,tip+z-.0024*notch];
  })), [[0,y+.001,tip+.0038]]]);
  c.put(m.geometry(),(x,yy,z)=>{
    const wing=Math.abs(x)/width, fy=(yy-y)/h;
    return tint(dog?0x524a42:0xbf8e84,dog?0x252725:0x876b63,(1-fade(Math.abs(wing-.61),.08,.34))*(1-fade(Math.abs(fy-.06),.12,.65))+.25*(1-fade(z,tip-.01,tip)));
  },dog?wetKeratin:undefined);
}
export function mammalHead(c: Surface, id: VillaPetId) {
  const kind=breed(id), dog=kind==='dog', cat=kind==='cat', rows=skull[kind], {base,dark,pale}=colors(id), end=rows[rows.length-1][0];
  const deform=(x:number,y:number,z:number):P3=>{
    // The whisker pads open towards the sides and a shallow cleft divides the upper lip.
    const pad=fade(z,dog?.074:.052,end-.026)*(1-fade(y,-.039,.003)), cleft=1-fade(Math.abs(x),.002,.022);
    return [x*(1+.14*pad), y+.005*cleft*pad, z-.0055*cleft*pad];
  };
  const underlying = hide(rows), sample:PointOnHide=(z,a)=>deform(...underlying(z,a));
  const face=(side:number,z:number,y:number,lift:number):P3=>{
    const [,cy,w,h]=section(rows,z), x=side*w*Math.sqrt(clamp(1-((y-cy)/(h||1))**2)), p=deform(x,y,z);
    return [p[0]+side*lift*.88,p[1]+.08*lift,p[2]+.44*lift];
  };
  const pigment=(x:number,y:number,z:number)=>{
    const stipple=.50+.24*Math.sin(80*x+38*y-19*z)+.18*Math.sin(z*74+y*61);
    if(dog){
      const earRoot=fade(Math.abs(x),.067,.092)*(1-fade(z,-.018,.058));
      const blaze=(1-fade(Math.abs(x+.004+.006*Math.sin(z*48)),.010,.035))*fade(z,-.023,.083);
      const brindle=tint(base,dark,.11+.18*stipple+earRoot*.53);
      return tint(brindle,pale,blaze*.74+fade(z,.069,.134)*(.47+.37*(1-fade(y,-.039,.019)))+(1-fade(y,-.077,-.054))*.66);
    }
    if(cat){
      const mantle=tint(base,dark,(.27+.31*stipple)*fade(y,-.037,.031));
      const brow=Math.abs(Math.abs(x)-(.024+.25*Math.max(0,.073-z)+.013*Math.sin(40*z)));
      const temple=(1-fade(Math.abs(y+.003+.35*z-.16*Math.abs(x)),.005,.019))*fade(Math.abs(x),.055,.090);
      const marked=tint(mantle,dark,(1-fade(brow,.005,.015))*fade(y,.043,.073)+temple*.65);
      return tint(marked,pale,fade(z,.060,.102)*.79 + (1-fade(y,-.045,-.018))*.57);
    }
    const shaded=tint(base,dark,(.15+.36*stipple)*fade(y,-.014,.074)+fade(Math.abs(x),.060,.102)*(1-fade(z,-.012,.07))*.19);
    return tint(shaded,pale,.55*fade(z,.067,.134)+.58*(1-fade(y,-.056,-.013)));
  };
  c.put(form(rows,20,deform),pigment,axialFur(rows));
  coatLocks(c,sample,pigment,[[.070,-.046,1.87,.94,9,dog?.012:.016],[.039,-.049,2.33,.85,6,.015],[.005,-.048,.78,.38,4,.010]],cat?439:dog?337:509);
  for(const side of [-1,1]){
    pinna(c,id,side);
    const z=dog?.055:cat?.048:.047, y=dog?.023:cat?.026:.018;
    eyelids(c,side,(s,h,l)=>face(side,s,h,l),z,y,dog?.016:cat?.018:.0155,dog?.0127:cat?.0125:.0117,pigment(...face(side,z,y,0)),cat?0x9d9d71:dog?0xa2835c:0x87725d,cat?.23:.54,cat?.29:.10);
    const mouthY=dog?-.029:-.022;
    c.cord(dog?0x776250:cat?0x8a7567:0xa78e7d,[[0,mouthY-.009,end+.0007,.0014],[side*.002,mouthY-.022,end-.005,.0013],
      [...face(side,end-.013,mouthY-.030,.001),.0013],[...face(side,end-.029,mouthY-.031,0),0]],4);
    for(let i=0;i<(dog?2:3);i++){
      const start=face(side,end-(dog?.029:.027)-i*.005,-.033+.005*i,.0016), w=dog?.042:cat?.074:.056;
      const p1:P3=[start[0]+side*w*.40,start[1]+.003+i*.001,start[2]+.003];
      c.cord(dog?0xa6937c:0xc6bbae,[[...start,.00076],[...p1,.00060],[start[0]+side*w,start[1]+.008-.007*i,start[2]-.015-.009*i,0]],3);
    }
  }
  nose(c,end,dog?-.027:-.021,dog?.029:cat?.019:.0175,dog?.015:.0105,dog);
}

export function mammalTail(c: Surface,id: VillaPetId) {
  const {base,dark,pale}=colors(id), cat=id==='cat';
  if(breed(id)==='rabbit'){
    const rows:Sections=[[-.091,.018,0,0],[-.078,.022,.038,.038],[-.057,.020,.053,.053],[-.031,.011,.059,.056],[-.006,.005,.054,.048],[.017,0,.033,.032],[.030,0,0,0]];
    const tone=(_x:number,y:number,z:number)=>tint(pale,base,.50*fade(z,-.085,-.028)*fade(y,-.026,.035));
    c.put(form(rows,14),tone,axialFur(rows)); coatLocks(c,hide(rows),tone,[[-.019,-.061,.87,.30,6,.011],[-.011,-.060,1.97,.68,7,.012]],757); return;
  }
  const path:Collar[]=cat?[[0,0,.024,.029],[.003,.013,-.027,.029],[.018,.065,-.064,.026],[.041,.137,-.059,.022],[.057,.171,-.030,.019],[.055,.166,.001,.012],[.044,.156,.009,0]]
    :[[0,0,.023,.038],[0,.014,-.035,.041],[.008,.043,-.089,.030],[.015,.079,-.128,.018],[.017,.101,-.132,0]];
  const m=new NatureMesh(); m.stem(path,12,.037,.29);
  c.put(m.geometry(),(x,y,z)=>cat?tint(base,dark,.34+.59*fade(y+.006*Math.sin(90*x),.134,.157)+.31*(1-fade(Math.abs(y-.085),.005,.019)))
    :tint(tint(base,dark,fade(y-z,.03,.13)*.41),pale,1-fade(z+.008*Math.sin(73*x),-.125,-.101)),
    (x,y,z)=>fibreUV(.16+.68*clamp(.5+x/.11),.10+.80*clamp((y-z)/.235)));
}

export function mammalLegs(c: Surface,id: VillaPetId,pair: number) {
  const cat=id==='cat', rabbit=breed(id)==='rabbit', {base,dark,pale}=colors(id);
  for(const side of [-1,1]){
    const fore=(pair===0?side:-side)>0,z=fore?.102:-.126,x=side*(cat?.078:.087);
    // Bury the narrow proximal ends well inside the rib cage. A shoulder blade
    // runs down/forward; a wider thigh folds back at the hock. Neither ends in
    // a cut-off cylinder perched ON the flank when viewed from above.
    const joint:Collar[]=fore?[[x*(rabbit?.30:.42),.286,z-(rabbit?.018:.043),.012],[x*.68,.246,z-.031,.035],[x*.91,.205,z-.019,.043],
      [x,.164,z-.019,.033],[x,.108,z-.001,.022],[x,.063,z+.008,.017],[x,.034,z+.024,.022]]
      :[[x*.49,.290,z-.018,.013],[x*.70,.246,z-.008,rabbit?.051:.039],[x*.94,.200,z+.011,rabbit?.060:.049],
        [x*1.04,.151,z+(rabbit?.053:.038),rabbit?.048:.039],[x*1.02,.099,z-.006,.028],[x,.064,z-(rabbit?.043:.030),.019],[x,.032,z-.022,.018]];
    const sock=cat?.074:rabbit?.091:.055, skin = new NatureMesh(), lower=joint[joint.length-1], upper=joint[0];
    skin.skin([[[lower[0],lower[1],lower[2]]], ...joint.slice().reverse().map(([cx,y,cz,r])=>Array.from({length:9},(_,i):P3=>{
      const a=-turn*i/9, muscle=fade(y,.113,.205);
      return [cx+r*Math.cos(a)*(1-.12*muscle), y, cz+r*Math.sin(a)*(1+(fore?.22:.43)*muscle)];
    })),[[upper[0],upper[1],upper[2]]]]);
    c.put(skin.geometry(),(ax,y,s)=>tint(tint(base,dark,fade(y,.13,.221)*(.18+.11*Math.sin(31*s))),pale,1-fade(y+.010*Math.sin(49*s+61*ax),sock-.015,sock+.015)),
      (ax,y,s)=>fibreUV(.14+.70*clamp(.50+(ax-x+.26*(s-z))/.094),.1+.78*fade(.239-y,0,.210)));
    const last=joint[joint.length-1], len=rabbit&&!fore?.063:cat?.034:.039, centre=last[2]+(rabbit&&!fore?.021:.010);
    const heel:Sections=[[-len,.018,0,0],[-.74*len,.020,.019,.016],[-.24*len,.023,.026,.021],[.25*len,.023,.030,.020],[.66*len,.019,.028,.015],[.82*len,.016,.018,.011],[.87*len,.016,0,0]];
    const paw=(ax:number,y:number,s:number)=>tint(pale,base,.19+.22*fade(y,.015,.042)+.09*Math.sin(ax*95+s*30));
    c.put(form(heel,10),paw,axialFur(heel),[x,0,centre]);
    // A broad, planted metacarpus feeds four interleaved digits; no row of spheres.
    for (const n of [-1.5,-.5,.5,1.5]) {
      const long=len*(1.12-.13*Math.abs(n)),w=.0105-.0009*Math.abs(n),d=n*.013;
      const toes:Sections=[[len*.13,.022,0,0],[len*.49,.020,w,.015],[long*.85,.016,w*.87,.012],[long,.014,w*.39,.007],[long+.002,.014,0,0]];
      c.put(form(toes,7,(a,y,s)=>[a+d*(.55+.45*s/long),y,s]),(ax,y,s)=>tint(paw(ax,y,s),dark,.16*(1-fade(y,.01,.021))+.10*(1-fade(s,len*.4,len*.69))),
        (_a,y,s)=>fibreUV(.27+.36*fade(y,.002,.036),.40+.46*fade(s,0,long)),[x,0,centre]);
    }
  }
}
