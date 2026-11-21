import * as THREE from 'three';
import type { VillaModelBuilder } from './villaModel.js';
import { mix, ovalLoop, roundedLoop, sectionLoft, type P2, type P3 } from './villaVehicleSections.js';
type Mat=THREE.Material;
const between=(a:P3,b:P3,t:number):P3=>[mix(a[0],b[0],t),mix(a[1],b[1],t),mix(a[2],b[2],t)];

/** One stitched sleeve follows the actual shoulder/elbow/hand landmarks of its
 * sculpture. Ring frames follow the bend; the lining/cuff shares its own hem. */
export function figureSleeve(b:VillaModelBuilder,shoulder:P3,elbow:P3,wrist:P3,cloth:Mat,cuff:Mat,coat:boolean) {
  const p=[shoulder,between(shoulder,elbow,.24),between(shoulder,elbow,.72),elbow,between(elbow,wrist,.23),
    between(elbow,wrist,.62),between(elbow,wrist,.86),between(elbow,wrist,.95),wrist];
  const widths=coat?[.021,.024,.021,.018,.020,.017,.015,.015,.013]:[.018,.022,.019,.016,.018,.016,.013,.014,.012];
  const rings=p.map((point,i)=>{
    const t=new THREE.Vector3(...p[Math.min(i+1,p.length-1)]).sub(new THREE.Vector3(...p[Math.max(0,i-1)])).normalize();
    const x=new THREE.Vector3(0,0,1).cross(t).normalize(),z=t.clone().cross(x);
    return ovalLoop(widths[i],widths[i]*.91,14,.87).map(([a,c])=>new THREE.Vector3(...point).addScaledVector(x,a).addScaledVector(z,c).toArray() as P3);
  });
  b.geometry(sectionLoft(rings.slice(0,7),true,false),cloth);
  b.geometry(sectionLoft(rings.slice(6),false,true),cuff);
}

export function figureLegAndBoot(b:VillaModelBuilder,side:number,hip:P3,knee:P3,ankle:P3,trousers:boolean,trouserMat:Mat,shoe:Mat,buckle:Mat) {
  // Trousers break at the knee, narrow at the ankle and enter the boot. The
  // runner's rear leg keeps its original forward knee and weight-bearing foot.
  const joints=[ankle,between(ankle,knee,.22),between(ankle,knee,.65),knee,between(knee,hip,.18),between(knee,hip,.62),hip];
  const widths=trousers?[.017,.021,.024,.020,.023,.028,.029]:[.012,.015,.019,.016,.018,.021,.023];
  b.geometry(sectionLoft(joints.map(([cx,cy,cz],i)=>ovalLoop(widths[i],widths[i]*.93,14,.87).map(([x,z]):P3=>[cx+x,cy+.002*(z/widths[i]),cz+z]))),trouserMat);
  // Heel, toe-box, instep and high shaft, including a flat supporting outsole
  // at exactly plinth height. No ellipsoid foot passes through a flat sole.
  const boot=(y:number,w:number,d:number,offset:number,lift=0)=>ovalLoop(1,1,20,.72).map(([u,v]):P3=>[
    ankle[0]+u*w*(1+.075*v)+.0016*side*v, y+lift*v, ankle[2]+offset+v*d]);
  b.geometry(sectionLoft([boot(.034,.022,.037,.018),boot(.037,.025,.040,.018),boot(.043,.025,.040,.018),
    boot(.054,.024,.039,.018,-.003),boot(.066,.022,.032,.012,-.007),boot(.083,.018,.019,.002),
    boot(.116,.020,.018,0),boot(.137,.022,.019,0,.002),boot(.143,.021,.018,0,.002)]),shoe);
  const strap=(w:number,d:number,y:number)=>ovalLoop(w,d,16,.86).map(([x,z]):P3=>[x+ankle[0],y+.0028*side*x/w,z+ankle[2]]);
  b.geometry(sectionLoft([strap(.021,.019,.118),strap(.022,.020,.121),strap(.022,.020,.128)],false,false),shoe);
  b.box(ankle[0]+side*.021,.125,ankle[2]+.001,.003,.008,.011,buckle,.001);
}

/** Hair meets the forehead along a swept hairline, not the equator of a ball.
 * The last ring is deliberately level at the collection's common crown datum. */
export function figureCrown(b:VillaModelBuilder,x:number,hair:Mat,crop:boolean,wind:boolean) {
  const ring=(r:number,d:number,h:number,part:number)=>ovalLoop(1,1,24).map(([u,v]):P3=>[
    x+r*u+(wind?.004*u*u:0), h+part*(.032*Math.max(0,v)-.008*(1-v)/2+.005*u), -.006+v*d]);
  b.geometry(sectionLoft([ring(.039,.034,crop?.616:.602,1),ring(.045,.041,.625,.68),
    ring(.046,.040,.648,.30),ring(.039,.036,.665,.14),ring(.025,.023,.679,0),ring(.005,.006,.684,0)]),hair);
}

/** Almond-shaped lacquer inlays follow the original tapered face. The white,
 * iris and familiar two catchlights share the cheek curvature; these are not
 * separate eyeballs hanging in front of a flat face. */
export function figureFeatures(b:VillaModelBuilder,x:number,s:number,ivory:Mat,iris:Mat,ink:Mat,blush:Mat,hair:Mat) {
  const skinZ=(u:number,y:number)=>{
    const r=y<.617?Math.max(0,Math.min(1,(y-.590)/.027)):Math.min(1,(y-.617)/.024);
    const rx=y<.617?mix(.035,.041,r):mix(.041,.040,r),rz=y<.617?mix(.028,.035,r):mix(.035,.033,r);
    return .008+rz*Math.sqrt(Math.max(.01,1-(u/rx)**2));
  };
  const mark=(cx:number,cy:number,w:number,h:number,depth:number,mat:Mat,almond=false)=>{
    const edge=(f:number,d:number)=>ovalLoop(w*f,h*f,16).map(([du,dv]):P3=>{
      const u=cx+du,y=cy+dv*(almond?1-.38*(du/w)**2:1)+(almond?.075*s*du:0);
      return [x+u,y,skinZ(u,y)+depth+d];
    });
    b.geometry(sectionLoft([edge(1,-.0005),edge(1,0),edge(.70,.00045),edge(.25,.00065)],false,true,[0,0,1]),mat);
  };
  const cx=s*.0185;
  mark(cx,.614,.0124,.0075,.0013,ivory,true); mark(cx,.6138,.0051,.0062,.0021,iris);
  mark(cx,.6137,.0026,.0049,.0029,ink); mark(s*.016,.6171,.0023,.0023,.0037,ivory);
  mark(s*.0209,.6113,.0011,.0012,.0038,ivory); mark(.027*s,.5948,.0052,.0022,.0014,blush,true);
  const line=(pts:P2[],mat:Mat,r:number)=>{
    const p=pts.map(([u,y]):P3=>[x+s*u,y,skinZ(s*u,y)+.0018]);
    b.geometry(sectionLoft(p.map(([a,y,z],i)=>ovalLoop(r*(i===0||i===p.length-1?.36:1),r*.7,7).map(([dy,dz]):P3=>[a,y+dy,z+dz]))),mat);
  };
  line([[.0065,.6148],[.012,.6199],[.019,.6214],[.027,.6199],[.032,.6207]],ink,.0015);
  line([[.010,.630],[.018,.6325],[.026,.632],[.030,.6305]],hair,.0016);
}

/** Bow loops are double-faced folded ribbons; daylight passes through each
 * loop. The two contrasting surfaces meet at a wrapped knot. */
export function figureBow(b:VillaModelBuilder,x:number,y:number,z:number,width:number,height:number,fabric:Mat) {
  for(const side of [-1,1]) {
    const loop=(length:number,rise:number,depth:number,inset=0)=>ovalLoop(1,1,14).map(([u,v]):P3=>{
      const a=(1+u)/2;return [x+side*(.0015+inset+a*length),y+v*rise*(.24+.76*a)+side*.001*a,z+depth+.0025*Math.sin(Math.PI*a)];});
    b.geometry(sectionLoft([loop(width,height,-.002),loop(width,height,.002),loop(width*.76,height*.40,.002,width*.08),
      loop(width*.76,height*.40,-.002,width*.08),loop(width,height,-.002)],false,false),fabric);
  }
  b.geometry(sectionLoft([[-.003,.0028],[0,.0041],[.004,.0034]].map(([a,r])=>ovalLoop(r,height*.52,10).map(([dx,dy]):P3=>[x+dx,y+dy,z+a]))),fabric);
}

/** Cabinetmaker's rebated shelf. The board supports the sculptures on a level
 * face; below its nose are a bevel, bead and cove rather than a square slab. */
export function galleryShelf(b:VillaModelBuilder,w:number,d:number,y:number,h:number,wood:Mat,inlay:Mat){
  const a=h/2,c=d/2;
  const section:P2[]=[[-c,-a],[-c,a],[c-.018,a],[c-.006,a*.72],[c-.003,a*.39],[c,a*.22],
    [c,-a*.19],[c-.007,-a*.47],[c-.014,-a*.54],[c-.016,-a]];
  b.geometry(sectionLoft([-1,1].map(s=>section.map(([z,dy]):P3=>[s*w/2,y+dy,z]))),wood);
  b.geometry(sectionLoft([-1,1].map(s=>[[c-.005,-a*.18],[c+.0003,-a*.15],[c+.0003,a*.09],[c-.003,a*.10]]
    .map(([z,dy]):P3=>[s*(w/2-.016),y+dy,z]))),inlay);
}
/** Padded presentation backboards with a routed reveal. Installed behind a
 * closed case; no changes to anything exhibited on the supports. */
export function galleryLiner(b:VillaModelBuilder,x:number,y:number,z:number,w:number,h:number,back:Mat,edge:Mat){
  const ring=(ww:number,hh:number,offset:number)=>roundedLoop(ww,hh,.035,4).map(([a,c]):P3=>[x+a,y+c,z+offset]);
  b.geometry(sectionLoft([ring(w,h,0),ring(w-.009,h-.009,.007),ring(w-.032,h-.032,.007),ring(w-.044,h-.044,.003)],true,false),edge);
  b.geometry(sectionLoft([ring(w-.044,h-.044,.003),ring(w-.058,h-.058,.006)]),back);
}
