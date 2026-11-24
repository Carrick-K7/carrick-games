import { NatureMesh, turn, type Collar, type P3 } from './villaNatureGeometry.js';
import type { VillaPetId } from './villaPets.js';
import { Surface, axialFur, clamp, coatLocks, drapedHide, eyelids, faceOf, fade, fibreUV, form, hide, tint, wetKeratin, type Sections, type Section } from './villaCoatSurface.js';

// Croup, loin, rib cage, withers and throat. The front continues under the
// moving poll rather than ending in a point where a separate head would sit.
const dogBody: Sections = [[-.248,.230,0,0],[-.232,.232,.062,.077],[-.200,.244,.106,.107],[-.158,.250,.122,.120],
  [-.103,.250,.110,.106],[-.058,.250,.101,.091],[-.016,.252,.104,.098],[.018,.252,.121,.122],
  [.050,.250,.132,.138],[.082,.248,.129,.150],[.111,.264,.110,.143],[.143,.286,.087,.124],
  [.168,.303,.080,.114],[.193,.313,.063,.084],[.213,.308,.037,.048],[.223,.304,0,0]];
const rabbitBody: Sections = [[-.248,.166,0,0],[-.231,.167,.077,.102],[-.201,.171,.124,.136],[-.161,.182,.145,.163],
  [-.111,.183,.148,.173],[-.066,.177,.140,.150],[-.023,.175,.123,.140],[.022,.184,.108,.126],
  [.057,.193,.102,.115],[.087,.190,.094,.106],[.121,.205,.084,.107],[.152,.231,.079,.104],[.178,.250,.066,.081],[.199,.252,0,0]];
const catBody: Sections = [[-.245,.222,0,0],[-.226,.228,.058,.070],[-.204,.235,.079,.093],[-.180,.236,.084,.100],
  // Keep the tabby bars in their original continuous arched mantle. The lower
  // flank, breast and neck are not surfaces of that ellipsoid.
  ...[-.164,-.146,-.127,-.108,-.088,-.067,-.046,-.025,-.004,.015,.034,.051].map((z): Section => {
    const r=Math.sqrt(1-((z+.035)/.195)**2); return [z,.235,.105*r,.13*r];
  }),[.071,.249,.087,.111],[.096,.262,.079,.112],[.122,.278,.073,.115],
  [.148,.299,.064,.109],[.173,.321,.058,.088],[.193,.327,.044,.062],[.209,.329,0,0]];

// Profiles run along four different anatomical rails. They need not swell and
// collapse together as radii of revolution: e.g. the cheekbone can flare just
// below a recessed orbit, and the two fleshy whisker pads widen again past the stop.
// z, crest, chin; half-breadths at brow, orbit, cheek and jaw, in metres.
type FaceRib = readonly [number, number, number, number, number, number, number];
const skull: Record<'cat'|'rabbit'|'dog', readonly FaceRib[]> = {
  dog: [[-.169,-.040,-.040,0,0,0,0],[-.140,.007,-.100,.046,.058,.060,.044],[-.111,.048,-.104,.065,.078,.079,.061],
    [-.077,.080,-.096,.080,.094,.093,.071],[-.045,.102,-.085,.088,.103,.101,.078],[-.009,.110,-.091,.087,.098,.103,.081],
    [.024,.103,-.093,.081,.088,.099,.082],[.049,.085,-.090,.074,.076,.095,.078],[.067,.058,-.085,.063,.064,.083,.068],
    [.081,.031,-.079,.047,.050,.068,.056],[.101,.020,-.073,.039,.047,.060,.047],[.124,.014,-.067,.037,.047,.061,.048],
    [.145,.008,-.060,.033,.043,.054,.042],[.158,-.005,-.052,.025,.033,.039,.029],[.168,-.026,-.026,0,0,0,0]],
  cat: [[-.156,-.036,-.036,0,0,0,0],[-.127,.012,-.093,.037,.052,.054,.043],[-.097,.055,-.091,.057,.072,.074,.055],
    [-.064,.084,-.080,.073,.090,.092,.067],[-.031,.098,-.083,.077,.095,.102,.075],[.001,.100,-.085,.079,.087,.110,.081],
    [.027,.087,-.082,.077,.078,.106,.077],[.048,.071,-.077,.066,.064,.090,.063],[.063,.054,-.074,.051,.047,.071,.050],
    [.077,.033,-.069,.033,.037,.060,.044],[.092,.020,-.061,.025,.034,.053,.039],[.105,.008,-.054,.019,.028,.043,.032],
    [.116,-.005,-.043,.016,.020,.025,.018],[.120,-.020,-.020,0,0,0,0]],
  rabbit: [[-.153,-.032,-.032,0,0,0,0],[-.126,.008,-.096,.040,.060,.069,.055],[-.095,.051,-.099,.060,.079,.090,.074],
    [-.067,.079,-.095,.074,.092,.104,.082],[-.035,.096,-.093,.080,.097,.114,.089],[.000,.098,-.095,.082,.095,.117,.091],
    [.034,.081,-.092,.080,.090,.110,.089],[.054,.066,-.089,.072,.079,.100,.082],[.073,.049,-.084,.057,.065,.085,.070],
    [.090,.031,-.078,.040,.049,.076,.061],[.106,.017,-.072,.030,.044,.070,.055],[.117,.005,-.063,.023,.037,.056,.044],
    [.125,-.007,-.052,.014,.028,.040,.029],[.132,-.024,-.024,0,0,0,0]],
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
const bell = (v: number) => Math.exp(-v*v);
export function mammalBody(c: Surface, id: VillaPetId) {
  const pigment = mammalPigment(id), dog = id === 'dog', cat = id === 'cat';
  const rows = cat ? catBody : dog ? dogBody : rabbitBody, sides = 20;
  const rings = rows.map(([z,cy,w,h]): P3[] => !w ? [[0,cy,z]] : Array.from({length:sides},(_,i): P3 => {
    const a=-turn*i/sides, up=Math.cos(a), side=Math.sin(a), y=cy+h*up;
    const breast=bell((z-.092)/.081), loin=bell((z+.060)/.062), croup=bell((z+.145)/.080);
    // The shoulder blade runs obliquely back from the foreleg. Ribs round
    // out above a narrower brisket; the lower flank draws up in front of the hip.
    const blade=bell((z-.082+.039*up)/.037)*bell((up-.18)/.58);
    if (cat) {
      const below=1-fade(y,.164,.225), neck=fade(z,.052,.130);
      return [side*w*(1 - below*(.27*loin+.09*breast) + .13*blade*neck),
        y + below*(.051*loin-.021*breast) + .006*neck*up,
        z + .015*neck*up*up*(1-2*fade(up,-.3,.6))];
    }
    return [side*w*(1 + (dog?.095:.035)*blade + (dog?.065:.115)*croup*bell((up+.31)/.47) - .11*breast*Math.max(0,-up)),
      y + (dog?.019:.004)*loin*Math.max(0,-up) - (dog?.008:.011)*breast*bell((up+.73)/.36),
      // Preserve the lateral hip/chest cuts; sweep the breastbone ahead of them.
      z + (dog?.023:.016)*breast*up*up*(1-2*fade(up,-.3,.6))];
  }));
  const skin=drapedHide(rows.map(row=>row[0]), rings);
  c.put(skin.geometry,pigment,axialFur(rows));
  coatLocks(c,skin.at,pigment,[[.130,.035,.70,.66,7,cat?.012:.017], [.086,-.145,2.00,.48,8,dog?.018:.015],
    [-.082,-.167,1.22,.74,5,.014],[.113,.054,2.44,.74,3,.018]],cat?161:dog?113:227);
}

function pinna(c: Surface, id: VillaPetId, side: number) {
  const {base,dark,pale} = colors(id), m = new NatureMesh(), cat = id === 'cat', female = id === 'rabbit-female';
  if (id === 'dog') {
    // The ear first rolls OUT from its root, folds across the cheek, then turns
    // IN toward the jaw. Its leading lip and furred back aren't two oval paddles.
    const stations = [[-.121,.112,-.042,0,0],[-.118,.119,-.044,.006,.014],[-.110,.127,-.044,.009,.031],
      [-.088,.135,-.046,.012,.046],[-.055,.136,-.046,.012,.057],[-.020,.131,-.044,.013,.062],
      [.016,.125,-.038,.016,.061],[.045,.118,-.033,.020,.054],[.066,.104,-.028,.022,.043],
      [.077,.091,-.030,.017,.030],[.072,.072,-.033,0,0]];
    m.skin(stations.map(([y,cx,cz,d,w])=>!w?[[side*cx,y,cz]]:Array.from({length:16},(_,i):P3=>{
      const a=-turn*i/16, across=Math.sin(a), out=side*Math.cos(a), fold=fade(.075-y,0,.105);
      const curl=.018*across*across*fold, ridge=.008*bell((across-.47)/.28)*fold;
      return [side*(cx+d*out-curl+ridge), y+.009*across*fold, cz+w*across+.005*out*fold];
    })));
    c.put(m.geometry(),(x,y,z)=>tint(tint(0x825738,0xb3865d,fade(y,.026,.076)*.74),0x634934,
      (1-fade(Math.abs(x),.094,.126))*.52+.32*bell((z+.007)/.012)*fade(.067-y,0,.08)),
      (_x,y,z)=>fibreUV(.11+.80*(z+.110)/.144,.10+.80*(.077-y)/.198));
    return;
  }
  const stations = cat ? [[.044,.041,.030],[.065,.049,.036],[.085,.046,.034],[.111,.034,.027],[.138,.019,.016],[.157,.007,.006]]
    : [[.048,.023,.026],[.076,.030,.032],[.102,.034,.033],[.148,.040,.030],[.192,.035,.025],[.228,.026,.018],[.250,.014,.010],[.258,.006,.005]];
  const pos = (x: number, h: number, z: number):P3 => {
    const free=fade(h,.069,.253), centre=cat ? .048+.24*h : .029+h*(female?.29:.071)+.004*free;
    // The spoon twists about its root; the near and far ear do not have the
    // same back contour. At midlength both rims still stand ahead of the well.
    const sweep=cat ? -.024-.16*h : -.015-.14*h-(female?.026:.016)*free*free*(side>0?1:.51);
    return [side*centre+x,h*(female?.93:1),sweep+z-side*x*(cat?.22:.10)*free];
  };
  const cross = [[-1,0],[-.88,.69],[-.72,.89],[-.46,.21],[0,-.19],[.43,.20],[.72,.85],[.89,.61],[1,0],[.70,-.75],[0,-1.08],[-.67,-.80]];
  const rings:P3[][] = [[pos(0,.043,0)],...stations.map(([h,w,d])=>cross.map(([x,z])=>pos(x*w,h,z*d))),[pos(0,stations[stations.length-1][0]+.003,0)]];
  m.skin(rings); const last=m.positions.length/3-1;
  c.put(m.geometry(),(_x,y,_z,i)=>{
    if(i===0 || i===last) return tint(base,pale,.19); const j=(i-1)%cross.length;
    const inside=j>=2&&j<=6, t=fade(y,.065,cat?.124:.145);
    return inside ? tint(tint(dark,cat?0xa88378:0xba9189,.61+t*.37),pale,j===2||j===6?.28:.01) : tint(base,pale,(j===1||j===7?.45:.10)*t);
  }, (_x,y,_z,i)=>fibreUV(.1+.78*(i===0||i===last?.5:(cross[(i-1)%cross.length][0]+1)*.5),.90-.8*fade(y,.04,cat?.163:.255)));
}

function nose(c: Surface, tip: number, y: number, w: number, h: number, dog: boolean) {
  // A single rounded shield, curling under to the philtrum. The narial folds
  // are depressions in the same continuous face as the septum, not two bulbs.
  const m=new NatureMesh(), tones:number[]=[], across=[-1,-.79,-.56,-.32,0,.32,.56,.79,1], up=[-1,-.52,.04,.44,1];
  const rows=up.map(v=>across.map(u=>{
    const x=w*u*(.85+.18*v)*(1-.15*v*v), under=(1-v)*.5;
    const yy=y+h*(v*(1-.43*u*u)-.14*(1-u*u)*under), slit=bell((Math.abs(u)-.56)/.17)*bell((v-.06-.33*(Math.abs(u)-.56))/.24);
    const front=1-u*u, z=tip+h*(.40*front+.33*(1-v*v)-.56*(dog?1:.40)*slit-.20*under);
    tones.push(tint(dog?0x504b44:0xb99388,dog?0x292a28:0x9c7a70,.76*slit+.23*under));
    return m.point([x,yy,z]);
  }));
  for(let i=1;i<rows.length;i++) for(let j=1;j<across.length;j++) {
    const a=rows[i-1], b=rows[i]; m.tri(a[j-1],a[j],b[j]); m.tri(a[j-1],b[j],b[j-1]);
  }
  const rim=[...rows[0],...rows.slice(1).map(row=>row[row.length-1]),...rows[rows.length-1].slice(0,-1).reverse(),...rows.slice(1,-1).reverse().map(row=>row[0])];
  const base=rim.map(i=>{const [x,yy]=m.positions.slice(i*3,i*3+2); tones.push(dog?0x50483f:0xb79488);return m.point([x*.83,y+(yy-y)*.83,tip-h]);});
  rim.forEach((i,j)=>{const k=(j+1)%rim.length;m.tri(base[j],base[k],i);m.tri(base[k],rim[k],i);});
  c.put(m.geometry(),(_x,_y,_z,i)=>tones[i],dog?wetKeratin:undefined);
}
export function mammalHead(c: Surface, id: VillaPetId) {
  const kind=breed(id), dog=kind==='dog', cat=kind==='cat', rows=skull[kind], {base,dark,pale}=colors(id), end=rows[rows.length-1][0];
  const rings=rows.map(([z,crest,chin,brow,orbit,cheek,jaw]):P3[]=>{
    if(!brow) return [[0,crest,z]];
    const sweep=fade(z,-.160,-.075)*(1-fade(z,.067,end)), pad=fade(z,dog?.077:.054,end-.020);
    // Spine → eyebrow → socket → zygomatic arch → whisker bed → lower jaw.
    // The brows lead the cheek; the lip leads the chin. These are oblique
    // courses, not circles all terminating in one plane perpendicular to Z.
    const arc=[ [0,1,-.014], [brow*.47,.974,-.006], [brow*.80,.918,.005], [brow,.821,.014],
      [orbit,.641,.011], [cheek*.994,.505,-.004], [cheek,.365,-.012], [jaw*1.08,.207,-.009],
      [jaw*.90,.130,-.014], [jaw*.51,.042,-.020], [0,0,-.022] ];
    const p=(i:number,side:number):P3=>{
      const [w,t,dz]=arc[i], puffy=pad*bell((t-.42)/.19);
      // The side pads project on either side of the central nose, especially
      // on the short, split muzzle of a rabbit. The small chin returns behind.
      const padLead=dog?.010:cat?.013:.018;
      return [side*w,chin+(crest-chin)*t+(dog?.004:.007)*puffy,z+dz*sweep+padLead*puffy-.007*pad*bell(t/.18)];
    };
    return [...arc.map((_,i)=>p(i,-1)),...arc.slice(1,-1).reverse().map((_,i)=>p(arc.length-2-i,1))];
  });
  const skin=drapedHide(rows.map(row=>row[0]),rings), face=faceOf(skin.geometry);
  const fur: Sections=rows.map(([z,top,bottom,brow,orbit,cheek])=>[z,(top+bottom)/2,Math.max(brow,orbit,cheek),(top-bottom)/2]);
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
  const facialCoat=(x:number,y:number,z:number)=>{
    const baseColor=pigment(x,y,z), mantle=fade(Math.abs(x),.042,.086), eyeBand=bell((y-.030-.21*(z-.043))/.023);
    const mask=mantle*eyeBand*bell((z-.047)/.066), pad=fade(z,cat?.066:.088,end-.014)*(1-fade(y,-.032,.012));
    return tint(tint(baseColor,dark,mask*(dog?.36:cat?.51:.21)),pale,pad*(cat?.83:.58));
  };
  c.put(skin.geometry,facialCoat,axialFur(fur));
  coatLocks(c,skin.at,facialCoat,[[.053,-.051,1.95,.94,8,dog?.012:.019],[.024,-.062,2.30,.85,5,.017]],cat?439:dog?337:509);
  for(const side of [-1,1]){
    pinna(c,id,side);
    const z=dog?.054:.047, y=dog?.024:.023;
    eyelids(c,side,(s,h,l)=>face(side,s,h,l),z,y,dog?.015:cat?.017:.016,.014,
      facialCoat(...face(side,z,y,0)),cat?0xb0bb85:dog?0xb0936b:0xa48d76,cat?.22:dog?.51:.58,cat?.18:.08,
      cat?undefined:dog?0xe6bd82:0xd5b391);
    const mouth=(s:number,y:number,r:number):Collar=>[...face(side,end-s,y,.0014),r];
    c.cord(dog?0x715746:cat?0x827268:0xa08877,[[0,-.027,end+.0003,.0015],
      mouth(.006,-.039,.0017),mouth(.016,-.049,.0019),mouth(.031,-.053,.0018),mouth(.047,-.054,.0012),mouth(.060,-.048,0)],5);
    for(let i=0;i<(dog?2:3);i++){
      const start=face(side,end-(dog?.029:.027)-i*.005,-.038+.005*i,.0013), w=dog?.040:cat?.074:.056;
      const p1:P3=[start[0]+side*w*.40,start[1]+.004+i*.001,start[2]+.003];
      c.cord(dog?0xa6937c:0xc6bbae,[[...start,.00078],[...p1,.00065],[start[0]+side*w,start[1]+.008-.007*i,start[2]-.015-.009*i,0]],3);
    }
  }
  nose(c,end-(dog?.004:.002),-.018,dog?.033:cat?.019:.018,dog?.016:.010,dog);
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

/** One pad branches into four digits. The top and sole vertices of each web
 * are shared at the knuckles, but the toes turn, taper and terminate separately.
 * No closed toe bulbs or coplanar caps buried inside a second heel. */
function pawSkin(len:number, width:number, longHindFoot:boolean) {
  const m=new NatureMesh();
  const join=(a:number[],b:number[])=>{
    let i=0,j=0;
    while(i<a.length || j<b.length){
      const ia=a[i%a.length], ib=b[j%b.length];
      if(j===b.length || (i+1)*b.length<=(j+1)*a.length){ m.tri(ia,a[++i%a.length],ib); }
      else { m.tri(ia,b[++j%b.length],ib); }
    }
  };
  const heel=m.point([0,.018,-len]);
  const roll=Array.from({length:10},(_,i)=>{
    const a=turn*i/10; return m.point([width*.77*Math.cos(a),.022+.019*Math.sin(a),-.44*len]);
  });
  roll.forEach((p,i)=>m.tri(heel,roll[(i+1)%roll.length],p));
  const top:number[]=[],sole:number[]=[];
  for(let j=0;j<9;j++){
    const u=(j-4)/4, z=len*(.31-.09*u*u);
    top.push(m.point([u*width,.016+(.018*(1-u*u))*(j%2?1:.65),z]));
    sole.push(m.point([u*width,.0031+.003*u*u,z]));
  }
  join(roll,[...top].reverse().concat(sole));
  for(let toe=0;toe<4;toe++){
    const i=toe*2, axis=(toe-1.5)*.50, length=longHindFoot?1.19-.26*Math.abs(axis):1.05-.20*Math.abs(axis), x=axis*width;
    let web=[top[i+2],top[i+1],top[i],sole[i],sole[i+1],sole[i+2]];
    for(const [t,spread,high] of [[.58,.245,.032],[.86,.204,.024]]){
      const z=len*t*length, w=width*spread, mid=x*(1+.055*t), h=high-.003*Math.abs(axis);
      const ring=[[w,h*.59],[0,h],[-w,h*.59],[-w*.78,.007],[0,.0031],[w*.78,.007]].map(([dx,y])=>m.point([mid+dx,y,z]));
      join(web,ring); web=ring;
    }
    const tip=m.point([x*1.058,.010,len*length]); web.forEach((p,j)=>m.tri(p,web[(j+1)%6],tip));
  }
  return m.geometry();
}

export function mammalLegs(c: Surface,id: VillaPetId,pair: number) {
  const cat=id==='cat', rabbit=breed(id)==='rabbit', {base,dark,pale}=colors(id), bodyCoat=mammalPigment(id);
  for(const side of [-1,1]){
    const fore=(pair===0?side:-side)>0,z=fore?.102:-.126,x=side*(cat?.074:rabbit&&fore?.063:.087);
    // Bury the narrow proximal ends well inside the rib cage. A shoulder blade
    // runs down/forward; a wider thigh folds back at the hock. Neither ends in
    // a cut-off cylinder perched ON the flank when viewed from above.
    const joint:Collar[]=fore?[[x*(rabbit?.30:.42),.286,z-.038,.012],[x*.59,.251,z-.035,.031],[x*.75,.219,z-.015,cat?.031:.037],
      [x*.88,.181,z-.002,.034],[x*.96,.144,z-.013,.028],[x,.098,z-(rabbit?.014:.006),cat?.018:.022],[x,.059,z+(rabbit?0:.010),.018],[x,.031,z+(rabbit?.006:.022),.021]]
      :[[x*.46,.290,z-.018,.013],[x*.70,.246,z-.011,rabbit?.057:.043],[x*.97,.201,z+.015,rabbit?.071:.052],
        [x*1.06,.152,z+(rabbit?.050:.040),rabbit?.057:.042],[x*1.07,.116,z+(rabbit?.046:.022),rabbit?.047:.032],
        [x*1.03,.084,z-(rabbit?.028:.016),rabbit?.035:.025],[x,.060,z-(rabbit?.052:.039),.021],[x,.030,z-(rabbit?.012:.021),.018]];
    const sock=cat?.074:rabbit?.091:.055, skin = new NatureMesh(), lower=joint[joint.length-1], upper=joint[0];
    skin.skin([[[lower[0],lower[1],lower[2]]], ...joint.slice().reverse().map(([cx,y,cz,r])=>Array.from({length:9},(_,i):P3=>{
      const a=-turn*i/9, muscle=fade(y,.113,.205), blade=bell((y-.18)/.050);
      return [cx+r*Math.cos(a)*(1-.15*muscle), y+blade*(.014*side*Math.cos(a)-.009*Math.sin(a)), cz+r*Math.sin(a)*(1+(fore?.22:.43)*muscle)];
    })),[[upper[0],upper[1],upper[2]]]]);
    c.put(skin.geometry(),(ax,y,s)=>{
      const distal=tint(tint(base,dark,.11),pale,1-fade(y+.010*Math.sin(49*s+61*ax),sock-.018,sock+.019));
      return tint(distal,bodyCoat(ax,y,s),fade(y,.092,.170));
    },
      (ax,y,s)=>fibreUV(.14+.70*clamp(.50+(ax-x+.26*(s-z))/.094),.1+.78*fade(.239-y,0,.210)));
    const last=joint[joint.length-1], len=rabbit&&!fore?.072:cat?.036:.044, centre=last[2]+(rabbit&&!fore?.013:.012), width=cat?.027:rabbit?.031:.034;
    c.put(pawSkin(len,width,rabbit&&!fore),(ax,y,s)=>tint(tint(pale,base,.19+.24*fade(y,.015,.042)),dark,
      .16*fade(s,0,len)*(1-fade(y,.006,.016))+.11*Math.cos(ax/width*turn/.47)*fade(s,0,len)),
      (ax,_y,s)=>fibreUV(.14+.72*(.5+ax/(2*width)),.12+.75*(len-s)/(2*len)),[x,0,centre]);
  }
}
