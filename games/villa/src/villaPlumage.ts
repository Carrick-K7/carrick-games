import * as THREE from 'three';
import { NatureMesh, turn, type P3 } from './villaNatureGeometry.js';
import type { VillaPetId } from './villaPets.js';
import { Surface, axialFur, drapedHide, eyelids, faceOf, fade, fibreUV, form, noise, section, tint, vaneUV, type Sections, type UV } from './villaCoatSurface.js';

const palette = (id: VillaPetId) => id === 'parrot-blue' ? {
  crown:0x77a6b1, nape:0x4c7888, breast:0x8cafb0, throat:0xcad2c2, primary:0x435d72, secondary:0x577889, covert:0x668d98,
} : {crown:0x94a569, nape:0x617d56, breast:0x919e69, throat:0xc6c38c, primary:0x405c59, secondary:0x627e67, covert:0x7a9266};
// Horizontal sections: height, centre of mass in Z, lateral radius, dorsoventral radius.
const thorax:Sections=[[.088,-.038,0,0],[.110,-.029,.052,.065],[.148,-.026,.073,.082],[.191,-.018,.086,.099],
  [.235,-.011,.096,.104],[.279,.000,.098,.103],[.312,.009,.089,.095],[.341,.014,.073,.082],[.377,.018,.058,.069],[.406,.018,.035,.045],[.422,.021,0,0]];
const skull:Sections=[[-.112,-.037,0,0],[-.097,-.028,.043,.049],[-.074,-.014,.065,.070],[-.048,.000,.077,.084],
  [-.018,.008,.081,.088],[.012,.010,.082,.082],[.038,.009,.078,.072],[.055,.004,.067,.062],[.072,-.005,.052,.050],
  [.087,-.011,.034,.035],[.095,-.013,.018,.022],[.101,-.016,0,0]];
const horizontal=(rows:Sections,n:number)=>{
  const m=new NatureMesh();m.skin(rows.map(([y,z,w,d])=>w?Array.from({length:n},(_,i):P3=>[w*Math.sin(turn*i/n),y,z+d*Math.cos(turn*i/n)]):[[0,y,z]]));return m.geometry();
};
const bell=(v:number)=>Math.exp(-v*v);
const onBreast=(y:number,a:number,lift:number):P3=>{
  const [,z,w,d]=section(thorax,y), side=Math.sin(a), front=Math.cos(a);
  // Paired pectorals flow forward of the shoulder. Their lower flank folds over
  // the thigh before the shank emerges; the sternum is not the point of an egg.
  const muscle=bell((y-.241)/.090), flanks=bell((y-.150)/.046)*bell((Math.abs(side)-.76)/.26);
  return [(w+lift)*side*(1+.09*muscle*front),y-.021*flanks,z+(d+lift)*front+.014*muscle*bell((Math.abs(side)-.46)/.27)*front];
};
const vec=(p:P3)=>new THREE.Vector3(...p);
type Feather='contour'|'covert'|'primary'|'tail';
/** A single cambered vane. Broad, rounded contour tips, asymmetric remiges and
 * longer rectrices have distinct outlines. The rachis is in the skin/UV frame:
 * no wire spines, chain of cylinders or detached decorations. */
function vane(c:Surface,kind:Feather,centre:(t:number)=>P3,facing:P3,width:number,pigment:number,seed:number,hand:number){
  const m=new NatureMesh(), shades:number[]=[], uv:UV[]=[];
  const flight=kind==='primary', tail=kind==='tail', short=kind==='contour';
  const margin = short ? [[.24,.59],[.55,1],[.83,.81],[.94,.44]] : kind==='covert' ? [[.23,.53],[.51,1],[.75,.96],[.92,.47]]
    : [[.17,.61],[.37,.98],[.61,.94],[.79,.72],[.92,.36]];
  const rootV=.04+.11*noise(seed), tipV=.88+.08*noise(seed+7), roll=(noise(seed+11)-.5)*.24, skew=(noise(seed+17)-.5)*.16;
  const tone=(s:number,t:number,under=false)=>tint(tint(pigment,0x38494a,(1-t)*.22+(under?.28:0)+Math.max(0,-s)*.15),0xc3bc9e,
    (short?.10:kind==='covert'?.26:.12)*fade(t,.60,.94)+.077*Math.max(0,s)*t);
  const pole=(t:number):P3[]=>{shades.push(tone(0,t));uv.push(vaneUV(.5,rootV+t*(tipV-rootV)));return [centre(t)];};
  const rings:P3[][]=[pole(0)];
  for(const [t,w] of margin){
    const p=vec(centre(t)), dir=vec(centre(Math.min(1,t+.02))).sub(vec(centre(Math.max(0,t-.02)))).normalize();
    const lateral=vec(facing).cross(dir).normalize(), outward=dir.clone().cross(lateral).normalize();
    lateral.applyAxisAngle(dir,roll*t);outward.applyAxisAngle(dir,roll*t);
    const row = (s:number,arch:number,under=false):P3=>{
      const narrow=flight?.43:tail?.76:short?.93:.73, asym=s*hand>0?narrow:1;
      const l=width*(s*asym*w + (skew+.09*hand)*Math.sin(Math.PI*t));
      shades.push(tone(s,t,under));uv.push(vaneUV(.5+.47*s,rootV+t*(tipV-rootV)));
      return p.clone().addScaledVector(lateral,l).addScaledVector(outward,arch*width*w).toArray();
    };
    rings.push([row(1,short?.04:.02),row(0,short?.17:flight?.18:.27),row(-1,-.12),row(0,-.14,true)]);
  }
  rings.push(pole(1));
  if (short) {
    // The underside of each throat/breast contour is buried in the bird. Only
    // the free wing/tail vanes need a second lit side during flight.
    const rows = rings.map(r => r.map(v => m.point(v)));
    for (let i = 1; i < rows.length; i++) for (let j = 0; j < 2; j++) {
      const a = rows[i-1], b = rows[i];
      if (a.length === 1) m.tri(a[0], b[j+1], b[j]);
      else if (b.length === 1) m.tri(a[j], a[j+1], b[0]);
      else { m.tri(a[j], a[j+1], b[j]); m.tri(a[j+1], b[j+1], b[j]); }
    }
  } else m.skin(rings);
  c.put(m.geometry(),(_x,_y,_z,i)=>shades[i],(_x,_y,_z,i)=>uv[i]);
}
function longVane(c:Surface,type:Feather,p:P3,tip:P3,face:P3,w:number,pigment:number,seed:number,hand:number,bow:number,wrist=0){
  const at=(t:number):P3=>{
    const arc=Math.sin(Math.PI*t);
    return [p[0]+t*(tip[0]-p[0])+face[0]*bow*arc,p[1]+t*(tip[1]-p[1])+(face[1]*bow-wrist)*arc,
      p[2]+t*(tip[2]-p[2])+(face[2]*bow+wrist)*arc];
  };
  vane(c,type,at,face,w,pigment,seed,hand);
}
export function featheredBody(c:Surface,id:VillaPetId){
  const p=palette(id);
  const pigment=(x:number,y:number,z:number)=>{
    const [,cz]=section(thorax,y),front=fade(z-cz,-.045,.067),throat=front*fade(y,.226,.353),shadow=(1-fade(y,.118,.222))*.23;
    return tint(tint(tint(p.nape,p.breast,front),p.throat,throat*.95),p.primary,shadow+.07*(.5+.5*Math.sin(31*z+22*x)));
  };
  const shell=new NatureMesh(); shell.skin(thorax.map(([y,z,w])=>w ? Array.from({length:20},(_,i)=>onBreast(y,turn*i/20,0)) : [[0,y,z]]));
  c.put(shell.geometry(),pigment,(x,y,z)=>fibreUV(.12+.75*Math.atan2(Math.abs(x),z-section(thorax,y)[1])/Math.PI,.1+.76*fade(.409-y,0,.316)));
  // The throat feathers part at the keel and sweep down to opposite flanks.
  for(const side of [-1,1]) for(const [row,count] of [3,2,2].entries()) for(let j=0;j<count;j++){
    const a=side*(.17+j*.34+(row%2?.15:0)+.045*noise(13*j+row+side)),y=.353-.039*row+.006*Math.sin(j*2+row+side),l=.053+.010*noise(j+41*row);
    const at=(t:number):P3=>onBreast(y-l*t,a+side*(.17+.035*j)*t,-.004+.008*t+.002*Math.sin(Math.PI*t));
    const tone=tint(pigment(...at(.70)),p.nape,.11+.08*j);vane(c,'contour',at,[Math.sin(a),.13,Math.cos(a)],.017+.004*noise(j*7+row),tone,row*53+j+613,side);
  }
}
function hookedBill(c:Surface,blue:boolean){
  // The culmen initially climbs out of the forehead and turns *back* past
  // the bite. A separate lower mandible hinges wider behind the tapered hook.
  const upper:Sections=[[-.073,.099,0,0],[-.067,.108,.004,.004],[-.055,.115,.009,.008],[-.040,.112,.018,.016],
    [-.024,.103,.027,.025],[-.005,.096,.034,.029],[.010,.088,.038,.026],[.021,.078,.034,.022],[.029,.069,.027,.016],[.033,.064,0,0]];
  c.put(horizontal(upper,16),(x,y,z)=>{
    const horn=tint(blue?0xbacac6:0xaeb3a1,blue?0x415864:0x495950,(1-fade(y,-.060,.002))*.97);
    return tint(horn,0x63716b,.44*fade(Math.abs(x),.010,.034)+.24*(1-fade(z,.085,.119)));
  });
  c.put(form([[.049,-.042,0,0],[.063,-.043,.028,.019],[.079,-.044,.035,.021],[.095,-.045,.029,.019],
    [.108,-.045,.017,.013],[.115,-.040,.008,.008],[.118,-.034,0,0]],14),
    (x,y,z)=>tint(0x64635a,0xa49479,fade(y,-.060,-.041)*(.76-.30*fade(z,.089,.113))+.13*fade(Math.abs(x),.020,.031)));
  const m=new NatureMesh(), tones:number[]=[], wax=blue?0x91acad:0xbdb88c;
  // A low transverse band at the base of the horn, broader than it is tall.
  // Seat its perimeter in the bill, returning down into the oval nares.
  const edge=[[0,.005],[.42,.002],[.79,.004],[.98,.009],[.97,.016],[.73,.022],[.35,.025],[0,.024],[0,.016],[0,.009]];
  for(const side of [-1,1]){
    const outline=side>0?edge:[...edge].reverse();
    const loop=(band:number):P3[]=>outline.map(([u,y])=>{
      const x=u*section(upper,y)[2], a=Math.atan2((y-.013)/.013,(x-.015)/.018), ca=Math.cos(a),sa=Math.sin(a);
      const xx=band===0?x:.015+(band===1?.0065:.0044)*ca, h=band===0?y:.013+(band===1?.0040:.0026)*sa+.0017*ca;
      const [,cz,w,d]=section(upper,h), z=cz+d*Math.sqrt(Math.max(0,1-(xx/w)**2));
      tones.push(band===0?tint(wax,0xb1a087,.36):band===1?wax:0x75675e);
      return [side*xx,h,z+(band===0?-.0016:band===1?.008:.0032)];
    });
    const [,cz,w,d]=section(upper,.013);
    m.skin([loop(0),loop(1),loop(2),[[side*.015,.013,cz+d*Math.sqrt(1-(.015/w)**2)+.001]]]); tones.push(0x534e48);
  }
  c.put(m.geometry(),(_x,_y,_z,i)=>tones[i]);
}
export function featheredHead(c:Surface,id:VillaPetId){
  const p=palette(id), blue=id==='parrot-blue';
  const rings=skull.map(([z,cy,w,h]):P3[]=>!w?[[0,cy,z]]:Array.from({length:20},(_,i):P3=>{
    const a=-turn*i/20, side=Math.sin(a), up=Math.cos(a), face=fade(z,-.043,.038), cheek=bell((up+.29)/.39)*face;
    const brow=bell((up-.54)/.27)*bell((z-.036)/.041), orbit=bell((up-.20)/.23)*bell((z-.058)/.029);
    return [side*(w+.008*brow+.014*cheek-.006*orbit),cy+h*up+(blue?.001:.007)*brow,
      z+face*(.008*brow+.009*cheek-.012*up*up)];
  }));
  const head=drapedHide(skull.map(row=>row[0]),rings), face=faceOf(head.geometry);
  const pigment=(x:number,y:number,z:number)=>{
    const cap=fade(y,-.026,.070), mask=fade(z,-.037,.061)*(1-fade(y,.017,.057));
    const malar=bell((y+.016-.12*z)/.032)*fade(Math.abs(x),.027,.062)*fade(z,-.039,.037);
    const orbit=bell((z-.057)/.029)*bell((y-.021)/.020), temple=bell((z-.019)/.045)*bell((y+.004)/.017);
    const crown=tint(tint(p.nape,p.crown,.27+.73*cap),p.secondary,.24*temple), face=tint(crown,p.throat,.70*mask);
    return tint(tint(face,blue?0xb7b6c0:0xc8ad88,.77*malar),blue?0xcfcec1:0xd0c29b,.53*orbit);
  };
  c.put(head.geometry,pigment,axialFur(skull));
  for(const side of [-1,1]){
    eyelids(c,side,(s,y,l)=>face(side,s,y,l),.060,.022,.0095,.0075,tint(p.crown,0xc9bd9d,.60),0xc0ab88,.61,.13);
    for(let k=0;k<4;k++){
      const z=.087-k*.015, y=-.007+.002*k, at=(t:number):P3=>face(side,z-(.043+.005*k)*t,y-(.030+.003*k)*t,-.002+.006*t);
      vane(c,'contour',at,[side*.84,-.06,.55],.012+.0013*k,tint(p.throat,p.secondary,.17+.16*k),821+k,side);
    }
  }
  hookedBill(c,blue);
}
export function tuckedWing(c:Surface,id:VillaPetId,side:number){
  const p=palette(id),face:P3=[side*.94,.12,.32];
  const rows:Sections=[[-.123,-.064,0,0],[-.100,-.060,.016,.030],[-.068,-.043,.027,.049],[-.031,-.020,.035,.060],
    [.006,.000,.036,.061],[.034,.008,.032,.054],[.056,.011,.023,.039],[.069,.009,.015,.025],[.076,.006,0,0]];
  c.put(form(rows,14,(x,y,z)=>[x+side*(.005-.010*fade(z,.025,.072)),y,z]),
    (x,y,z)=>tint(tint(p.covert,p.secondary,1-fade(y+.32*z,-.062,.022)),p.nape,.28*(1-fade(side*x,-.012,.025))),axialFur(rows));
  // A swept wrist and graduated remiges, not a fringe cut off on one plane.
  // The outboard tips reach down AND back when folded. Turning the existing
  // shoulder into flight exposes a pointed hand-wing and a shorter inner fan.
  for(let j=0;j<7;j++){
    const f=j/6,arc=Math.sin(f*Math.PI),root:P3=[side*(.020-.013*f),-.007-.056*f,.051-.116*f];
    const tip:P3=[side*(.008-.038*f),-.190+.097*f-.013*arc,-.184+.045*f-.027*arc];
    longVane(c,'primary',root,tip,face,.021+.005*arc,tint(p.primary,p.secondary,.12+.57*f),37+j,side,.018,.019*(1-f));
  }
  for(let j=0;j<5;j++){
    const f=j/4,root:P3=[side*(.016+.007*f),.030-.044*f,.046-.074*f],tip:P3=[side*(.046-.025*f),-.084+.021*f,-.031-.085*f];
    longVane(c,'covert',root,tip,face,.023+.003*Math.sin(f*Math.PI),tint(p.secondary,p.covert,.27+.34*f),78+j,side,.020,.015);
  }
  // The high mantle tiles overlap the proximal remiges. The leading alula
  // curls around the thumb, presenting a different lit plane head-on.
  for(let j=0;j<4;j++){
    const f=j/3,root:P3=[side*.007,.044-.017*f,.044-.073*f],tip:P3=[side*(.045-.012*f),-.028-.020*f,.002-.075*f];
    longVane(c,'covert',root,tip,[side*.89,.21,.41],.022,tint(p.covert,p.crown,.21+.18*f),98+j,side,.019);
  }
  longVane(c,'covert',[side*.002,.035,.058],[side*.037,-.058,.018],[side*.73,.13,.67],.017,p.secondary,127,side,.021,.006);
}
export function rectrices(c:Surface,id:VillaPetId){
  const p=palette(id);
  for(const j of [-2,2,-1,1,0]){
    const k=Math.abs(j);longVane(c,'tail',[j*.006,.005,.020],[j*.015-.001*(j%2),-.074+.009*k,-.183+.025*k],[0,1,0],.018-.001*k,
      tint(p.primary,j===0?p.nape:p.secondary,.33+.14*k),177+j,Math.sign(j)||1,.006);
  }
}
export function birdFoot(c:Surface,side:number){
  // The feather cuff flows down into a slightly swept, scaled tarsus. Each
  // flexed digit and its hooked claw share one shell instead of two closed rods.
  c.cord((_x,y)=>tint(tint(0x88815f,0x686356,1-fade(y,-.082,-.056)),0x706b60,.23*fade(y,-.020,.008)),
    [[0,.014,-.009,.016],[side*.001,-.022,-.011,.013],[side*.002,-.056,-.010,.008],[0,-.081,-.004,.0085],[0,-.093,.002,.012]],6);
  for(let toe=0;toe<4;toe++){
    const front=toe<2,z=front?(toe%2?.044:.050):(toe%2?-.030:-.035),x=side*(toe%2?.019:-.013);
    c.cord((_x,y,s)=>tint(0x91816a,0x49483f,fade(Math.abs(s/z),.81,1.1)+.14*(1-fade(y,-.107,-.099))),
      [[0,-.091,.001,.0068],[x*.42,-.099,z*.44,.0060],[x*.76,-.102,z*.76,.0067],
        [x,-.105,z,.0042],[x,-.108,z*1.13,.0025],[x-side*.001,-.116,z*1.17,0]],4);
  }
}
