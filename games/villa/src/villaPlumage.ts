import * as THREE from 'three';
import { NatureMesh, turn, type P3 } from './villaNatureGeometry.js';
import type { VillaPetId } from './villaPets.js';
import { Surface, axialFur, clamp, eyelids, fade, fibreUV, form, noise, section, tint, vaneUV, wetKeratin, type Sections, type UV } from './villaCoatSurface.js';

const palette = (id: VillaPetId) => id === 'parrot-blue' ? {
  crown:0x6f9ca8, nape:0x4c7888, breast:0x90afb0, throat:0xb9c2ac, primary:0x435d72, secondary:0x577889, covert:0x668d98,
} : {crown:0x8c9d68, nape:0x617d56, breast:0x8e9a66, throat:0xb0ac73, primary:0x405c59, secondary:0x627e67, covert:0x7a9266};
// Horizontal sections: height, centre of mass in Z, lateral radius, dorsoventral radius.
const thorax:Sections=[[.094,-.034,0,0],[.115,-.034,.043,.051],[.148,-.029,.064,.067],[.191,-.019,.081,.082],
  [.241,-.010,.090,.096],[.281,.001,.088,.095],[.311,.009,.082,.086],[.347,.016,.065,.068],[.375,.022,.045,.046],[.392,.025,0,0]];
const skull:Sections=[[-.078,-.004,0,0],[-.066,.001,.041,.052],[-.040,.004,.064,.067],[-.014,.009,.074,.074],
  [.012,.011,.074,.070],[.036,.008,.066,.060],[.056,-.002,.053,.048],[.070,-.010,.037,.036],[.081,-.013,.019,.023],[.085,-.015,0,0]];
const horizontal=(rows:Sections,n:number)=>{
  const m=new NatureMesh();m.skin(rows.map(([y,z,w,d])=>w?Array.from({length:n},(_,i):P3=>[w*Math.sin(turn*i/n),y,z+d*Math.cos(turn*i/n)]):[[0,y,z]]));return m.geometry();
};
const onBreast=(y:number,a:number,lift:number):P3=>{ const [,z,w,d]=section(thorax,y);return [(w+lift)*Math.sin(a),y,z+(d+lift)*Math.cos(a)]; };
const vec=(p:P3)=>new THREE.Vector3(...p);
type Feather='contour'|'covert'|'primary'|'tail';
/** A single cambered vane. Broad, rounded contour tips, asymmetric remiges and
 * longer rectrices have distinct outlines. The rachis is in the skin/UV frame:
 * no wire spines, chain of cylinders or detached decorations. */
function vane(c:Surface,kind:Feather,centre:(t:number)=>P3,facing:P3,width:number,pigment:number,seed:number,hand:number){
  const m=new NatureMesh(), shades:number[]=[], uv:UV[]=[];
  const flight=kind==='primary', tail=kind==='tail', short=kind==='contour';
  const margin = short ? [[.24,.60],[.53,1],[.79,.94],[.93,.49]] : kind==='covert' ? [[.19,.48],[.45,.92],[.66,1],[.86,.69],[.95,.30]]
    : [[.17,.61],[.37,.98],[.61,.94],[.79,.72],[.92,.36]];
  const rootV=.04+.11*noise(seed), tipV=.88+.08*noise(seed+7), roll=(noise(seed+11)-.5)*.20, skew=(noise(seed+17)-.5)*.16;
  const tone=(s:number,t:number,under=false)=>tint(tint(pigment,0x454b43,(1-t)*.14+(under?.19:0)+Math.max(0,-s)*.09),0xb3b39a,(.045*t+.035*Math.max(0,s))*t);
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
    rings.push([row(1,-.04),row(0,short?.10:.13),row(-1,-.08),row(0,-.13,true)]);
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
function longVane(c:Surface,type:Feather,p:P3,tip:P3,face:P3,w:number,pigment:number,seed:number,hand:number,bow:number){
  const at=(t:number):P3=>[p[0]+t*(tip[0]-p[0])+face[0]*bow*Math.sin(Math.PI*t),p[1]+t*(tip[1]-p[1])+face[1]*bow*Math.sin(Math.PI*t),p[2]+t*(tip[2]-p[2])+face[2]*bow*Math.sin(Math.PI*t)];
  vane(c,type,at,face,w,pigment,seed,hand);
}
export function featheredBody(c:Surface,id:VillaPetId){
  const p=palette(id);
  const pigment=(x:number,y:number,z:number)=>{
    const [,cz]=section(thorax,y),front=fade(z-cz,-.045,.067),throat=front*fade(y,.226,.353),shadow=(1-fade(y,.118,.222))*.23;
    return tint(tint(tint(p.nape,p.breast,front),p.throat,throat*.95),p.primary,shadow+.07*(.5+.5*Math.sin(31*z+22*x)));
  };
  c.put(horizontal(thorax,20),pigment,(x,y,z)=>fibreUV(.12+.75*Math.atan2(Math.abs(x),z-section(thorax,y)[1])/Math.PI,.1+.76*fade(.387-y,0,.286)));
  // Each tract grows along the changing crop radius. Roots are sunk, thin tips
  // lift just enough to overlap the course below; don't plate the entire belly.
  for(const side of [-1,1]) for(const [row,count] of [3,3,2].entries()) for(let j=0;j<count;j++){
    const a=side*(.18+j*.32+(row%2?.13:0)+.055*noise(13*j+row+side)),y=.326-.034*row+.005*Math.sin(j*2+row+side),l=.041+.010*noise(j+41*row);
    const at=(t:number):P3=>onBreast(y-l*t,a+side*(.095+.026*j)*t,-.0022+.0035*t+.0015*Math.sin(Math.PI*t));
    const tone=tint(pigment(...at(.70)),p.breast,.12);vane(c,'contour',at,[Math.sin(a),.12,Math.cos(a)],.013+.0037*noise(j*7+row),tone,row*53+j+613,side);
  }
}
export function featheredHead(c:Surface,id:VillaPetId){
  const p=palette(id);
  const pigment=(x:number,y:number,z:number)=>{
    const crown=fade(y,-.019,.060),cheek=(1-fade(y,-.033,.012))*fade(z,-.031,.044), orbital=(1-fade(Math.abs(z-.040),.004,.025))*(1-fade(Math.abs(y-.013),.006,.021));
    return tint(tint(tint(p.nape,p.crown,.16+.81*crown),p.throat,.62*cheek),0xacaa8e,orbital*fade(Math.abs(x),.039,.067)*.55);
  };
  c.put(form(skull,20),pigment,axialFur(skull));
  const face=(side:number,z:number,y:number,lift:number):P3=>{const [,cy,w,h]=section(skull,z);return [side*(w*Math.sqrt(clamp(1-((y-cy)/(h||1))**2))+lift*.94),y+.06*lift,z+.31*lift];};
  for(const side of [-1,1]){
    eyelids(c,side,(s,y,l)=>face(side,s,y,l),.041,.016,.0090,.0073,tint(p.crown,0xb8b29d,.46),0xc0ab88,.60,.12);
    for(let k=0;k<3;k++){
      const z=.052-k*.014, y=-.013+k*.004;
      const at=(t:number):P3=>face(side,z-.032*t,y-(.018+.003*k)*t,-.0015+.0029*t);
      vane(c,'contour',at,[side*.91,.04,.40],.0084,tint(p.throat,p.nape,.29+.14*k),821+k,side);
    }
  }
  // The tomial edge overlaps the lower mandible. Horn changes from waxy at the
  // cere to smoked grey at the hook; the nares sit on the sloping upper surface.
  const upper:Sections=[[-.057,.104,0,0],[-.052,.105,.004,.003],[-.044,.105,.010,.006],[-.031,.099,.020,.012],
    [-.016,.093,.027,.019],[-.002,.084,.029,.020],[.008,.075,.025,.017],[.013,.068,.014,.009],[.014,.065,0,0]];
  c.put(horizontal(upper,18),(x,y,z)=>{
    const cere=fade(y,-.006,.012), tip=1-fade(y,-.053,-.015);
    return tint(tint(tint(0xb6a687,0x737568,tip*.95),0xaaa38e,cere),0x7f7b69,fade(Math.abs(x),.014,.027)*.43+.08*Math.sin(z*109+y*82));
  });
  c.put(form([[.055,-.039,0,0],[.069,-.039,.020,.014],[.082,-.040,.023,.016],[.092,-.040,.017,.012],[.101,-.036,.009,.006],[.103,-.034,0,0]],12),
    (_x,y,z)=>tint(0x78766c,0xaaa38e,fade(y,-.053,-.035)*.57*(1-fade(z,.095,.105))));
  for(const side of [-1,1]){
    const [,cz,w,d]=section(upper,.005),x=side*.013,z=cz+d*Math.sqrt(1-(x/w)**2);
    c.cord(0x67665d,[[x-side*.002,.0053,z,.0006],[x,.006,z+.0007,.0013],[x+side*.002,.0052,z+.0004,0]],4,wetKeratin);
  }
}
export function tuckedWing(c:Surface,id:VillaPetId,side:number){
  const p=palette(id),face:P3=[side,0,0];
  const rows:Sections=[[-.094,-.056,0,0],[-.077,-.047,.015,.035],[-.041,-.027,.024,.051],[-.005,-.012,.025,.052],
    [.025,-.003,.022,.043],[.046,-.001,.016,.027],[.056,-.004,0,0]];
  c.put(form(rows,12),(x,y,z)=>tint(tint(p.covert,p.secondary,1-fade(y+.28*z,-.059,.017)),p.nape,.22*fade(Math.abs(x),.009,.032)),axialFur(rows),[side*.002,0,0]);
  // Wrist and scapula remain inside the articulated shoulder. Overlap long
  // asymmetric primaries first, then greater/lesser coverts toward the shoulder.
  for(let j=0;j<6;j++){
    const f=j/5,p0:P3=[side*(.020+.004*f),-.018-.040*f,.020-.053*f],tip:P3=[side*(.014-.033*f),-.150+.044*f,-.110-.068*f];
    longVane(c,'primary',p0,tip,face,.018+.004*Math.sin(f*Math.PI),tint(p.primary,p.secondary,.18+.42*(1-f)),37+j,side,.015);
  }
  for(let j=0;j<5;j++){
    const f=j/4,root:P3=[side*.019,.022-.027*f,.032-.061*f],tip:P3=[side*(.035-.014*f),-.088+.008*f,-.053-.080*f];
    longVane(c,'covert',root,tip,face,.020+.002*Math.sin(f*Math.PI),tint(p.secondary,p.covert,.39+.22*noise(j+43)),78+j,side,.014);
  }
  for(let j=0;j<3;j++){
    const f=j/2,root:P3=[side*.012,.036-.009*f,.028-.048*f],tip:P3=[side*(.038-.009*f),-.039-.017*f,-.012-.059*f];
    longVane(c,'covert',root,tip,face,.018,tint(p.covert,p.crown,.12+.18*f),98+j,side,.013);
  }
}
export function rectrices(c:Surface,id:VillaPetId){
  const p=palette(id);
  for(const j of [-2,2,-1,1,0]){
    const k=Math.abs(j);longVane(c,'tail',[j*.006,.005,.020],[j*.015-.001*(j%2),-.074+.009*k,-.183+.025*k],[0,1,0],.018-.001*k,
      tint(p.primary,j===0?p.nape:p.secondary,.33+.14*k),177+j,Math.sign(j)||1,.006);
  }
}
export function birdFoot(c:Surface,side:number){
  // Preserve the two front / two rear flexed toes and their actual flight tuck.
  c.cord((x,y,z)=>tint(0x736e62,0x4e4c47,.22+.28*fade(y,-.075,.008)+.10*Math.sin(111*z+46*x)),[[0,.012,-.007,.011],[0,-.051,-.007,.008],[0,-.082,-.003,.009],[0,-.094,.001,.012]],7);
  for(let toe=0;toe<4;toe++){
    const front=toe<2,z=front?(toe%2?.044:.050):(toe%2?-.030:-.035),x=side*(toe%2?.019:-.013);
    c.cord(0x837a6a,[[0,-.091,.001,.008],[x*.48,-.098,z*.47,.0064],[x*.78,-.103,z*.79,.0068],[x,-.105,z,.0042]],5);
    c.cord(0x45443c,[[x,-.105,z,.0042],[x,-.108,z*1.13,.0028],[x-side*.001,-.116,z*1.17,0]],5);
  }
}
