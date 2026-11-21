import * as THREE from 'three';
import { type VillaModelBuilder } from './villaModel.js';
import { coachLine, coachPanel, coachSheet, type coachHull } from './villaCoachwork.js';
import { mix, ovalLoop, roundedLoop, sectionLoft, type P3, type P2 } from './villaVehicleSections.js';

type DoorStyle = 'fastback' | 'utility' | 'touring';
/** Door furniture is mounted in the same frame as the outer leaf. Distances in
 * X follow the steel at the sampled height, not the nominal width of the car. */
export function trimDoor(b: VillaModelBuilder, hull: ReturnType<typeof coachHull>, side: number, style: DoorStyle,
  z0: number, z1: number, y0: number, y1: number,
  upholstery: THREE.Material, arm: THREE.Material, dark: THREE.Material, bright: THREE.Material, inlay: THREE.Material) {
  const utes = style === 'utility', gt = style === 'touring';
  const at = (u: number, v: number, inset: number): P3 => {
    const z = mix(z0,z1,u),y=mix(y0,y1,v), low=hull.lower(z);
    const p=hull.side(side,z,(y-low)/(hull.section(z).belt-low)); p[0]-=side*inset;return p;
  };
  const baseInset = (u:number,v:number)=>.048+.013*Math.sin(Math.PI*u)*Math.sin(Math.PI*v);
  // Rolled upper cap and bevel around the armboard are part of the panel,
  // including the painted jamb-to-card return visible through the open door.
  const board=(u:number,v:number) => {
    const uu=.5+(u-.5)*(.964+.034*Math.sin(Math.PI*v));
    return at(uu,v,baseInset(uu,v)-.008*Math.cos(2*Math.PI*v));
  };
  coachPanel(b,board,upholstery,[-side,0,0],[side*.026,0,0],14,8);
  const trimV=(u:number)=> utes ? .84-.065*Math.cos(Math.PI*u) : gt ? .84-.10*Math.sin(u*Math.PI*1.4) : .82-.095*Math.sin(Math.PI*u);
  coachPanel(b,(u,v)=>{const s=mix(.035,.965,u);return at(s,trimV(s)+v*(utes?.045:.068),.061);},inlay,[-side,0,0],[side*.014,0,0],18,2);
  coachLine(b,t=>{const u=mix(.035,.965,t);return at(u,trimV(u)+.003,.063);},bright,.0026,18);
  // A bucket with a closed outer foot, turned mouth, inner wall and a deep
  // floor. A downward probe inside the lip can reach the bottom of the pocket.
  const binMiddle=utes?.42:gt?.365:.39, binLength=(z1-z0)*(utes?.50:.48);
  const binRing=(span:number, depth:number, v:number, offset:number) => roundedLoop(binLength*span,depth,.018).map(([z,dx]):P3=>{
    const u = binMiddle+z/(z1-z0); return at(u,v+.023*(z/binLength),offset+dx);
  });
  const mouth=utes?.36:gt?.37:.345;
  b.geometry(sectionLoft([binRing(.92,.043,.075,.084),binRing(1,.073,mouth-.028,.090),
    binRing(.997,.073,mouth,.090),binRing(.969,.056,mouth+.012,.090),binRing(.953,.050,mouth-.010,.090),
    binRing(.89,.036,.115,.085)]),dark);
  // A two-ended padded bridge, with a finger-width return to the panel at
  // each end. The narrowing of the casting and the swept rail differ by car.
  const handle=(u:number,v:number):P3=>{
    const end=Math.sin(Math.PI*u), a=mix(utes?.23:.21,gt?.70:.73,u);
    const height=.54+(utes?.105:gt?.13:.074)*u+(utes?.018:.035)*end;
    return at(a,height+v*(utes?.093:.083),.061+.068*Math.sin(Math.PI*u)**.72);
  };
  coachPanel(b,handle,arm,[-side,0,0],[side*.019,0,0],16,3);
  coachLine(b,t=>handle(t,.95),gt?bright:arm,.004,18);
  // Angled switch shelf (flat rocker in the pickup, paired touch lands on the
  // passenger cars). Each key is a single clipped section, not a painted box.
  coachPanel(b,(u,v)=>at(mix(.58,.79,u),.625+.077*u+.022*v,.052+.059*v),dark,[0,1,0],[0,-.017,0],6,2);
  for(let i=0;i<(utes?1:2);i++) coachPanel(b,(u,v)=>at(.60+i*.078+.057*u,.651+i*.028+.019*u+.012*v,.072+.027*v),
    utes?bright:inlay,[0,1,0],[0,-.008,0],3,2);
  const sz=gt?.807:.835, cy=.40, ry=utes?.074:.059;
  // Recessed cloth diaphragm framed by a rolled trim and slats clipped to
  // the ellipse. No open sightline through the door or duplicated window pane.
  const grille=(u:number,v:number,d:number)=>at(sz+u/(z1-z0),cy+v/(y1-y0),d);
  b.geometry(sectionLoft([.78,1,1,.91].map((r,i)=>ovalLoop(ry*1.12*r,ry*r,22).map(([a,c])=>grille(a,c,[.049,.066,.071,.070][i])))),dark);
  for(let i=-3;i<=3;i++) {
    const h=i*ry*.213, w=ry*1.02*Math.sqrt(1-(h/ry)**2);
    coachLine(b,t=>grille(mix(-w,w,t),h,.073),inlay,.0018,4);
  }
}

/** Folded mirror stalk, painted outer cap and a bezel returning to a recessed
 * mirror face towards the occupant (-Z). Every station belongs to the leaf. */
export function doorMirror(b:VillaModelBuilder,side:number,stem:P3,head:P3,w:number,h:number,d:number,
  style:DoorStyle,paint:THREE.Material,dark:THREE.Material,metal:THREE.Material) {
  const [x,y,z]=head;
  coachPanel(b,(u,v)=>[side*mix(stem[0],x-w*.23,u),mix(stem[1],y-h*.13,u)+v*.020-.006*Math.sin(Math.PI*u),
    mix(stem[2],z+d*.10,u)+.011*Math.sin(Math.PI*u)],dark,[0,0,-1],[0,0,.022],5,1);
  const section=(ww:number,hh:number,depth:number,off=0)=>roundedLoop(ww,hh,Math.min(ww,hh)*(style==='utility'?.22:.36),3)
    .map(([a,c]):P3=>[side*(x+a+off),y+c+.09*a,z+depth+.16*a]);
  const lip=section(w,h,-d*.30);
  b.geometry(sectionLoft([section(w*.46,h*.55,d*.56),section(w*.84,h*.91,d*.36),section(w,h,d*.12),lip],true,false),paint);
  const glass=section(w*.82,h*.76,-d*.39);
  b.geometry(sectionLoft([lip,section(w*.98,h*.98,-d*.46),section(w*.86,h*.79,-d*.47),glass],false,false,[0,0,-1]),dark);
  b.geometry(sectionLoft([glass,section(w*.64,h*.58,-d*.41)],false,true,[0,0,-1]),metal);
}

/** Console carcass has no lid beneath its cup holders. A perforated deck and
 * a folded well with a bottom at depth form each opening physically. */
export function cupConsole(b:VillaModelBuilder, z:number, length:number, width:number, bottom:number, y:number, cups:readonly number[],
  side:THREE.Material, deck:THREE.Material, liner:THREE.Material, metal:THREE.Material) {
  const loop=(w:number,l:number,h:number)=>roundedLoop(w,l,.038).map(([x,d]):P3=>[x,h,z+d]);
  b.geometry(sectionLoft([loop(width*.71,length*.83,bottom),loop(width*.85,length*.96,bottom+.05),
    loop(width,length,y-.022),loop(width,length,y)],true,false),side);
  // Shape XY -> world X/-Z; an extrusion of positive depth goes upward.
  const shape=new THREE.Shape(roundedLoop(width,length,.038).map(([x,d])=>new THREE.Vector2(x,d)));
  for(const c of cups){const hole=new THREE.Path();hole.absarc(0,z-c,.052,0,Math.PI*2,true);shape.holes.push(hole);}
  b.geometry(new THREE.ExtrudeGeometry(shape,{depth:.008,bevelEnabled:false,curveSegments:12}),deck,[0,y-.007,z],[-Math.PI/2,0,0]);
  for(const c of cups){
    const ring=(r:number,h:number)=>ovalLoop(r,r,24).map(([x,d]):P3=>[x,h,c+d]);
    b.geometry(sectionLoft([ring(.054,y-.0005),ring(.0538,y+.004),ring(.049,y+.004),ring(.0465,y-.003)],false,false,[0,1,0]),metal);
    b.geometry(sectionLoft([ring(.0465,y-.003),ring(.045,y-.016),ring(.038,y-.077)],false,true,[0,1,0]),liner);
  }
}

/** Thumb pod on a rotating spoke. A recessed control face is bounded by its
 * own rolled lip; the utility wheel gets a long rocker, the others two lands. */
export function wheelThumbPod(b:VillaModelBuilder,side:number,x:number,y:number,z:number,utility:boolean,
  housing:THREE.Material,edge:THREE.Material,mark:THREE.Material) {
  const loop=(w:number,h:number,depth:number)=>roundedLoop(w,h,.006).map(([u,v]):P3=>[
    side*(x+u),y+v+.13*u,z+depth-.016*u]);
  const contact=loop(.041,.025,-.0015);
  b.geometry(sectionLoft([loop(.047,.033,.013),loop(.049,.034,.006),loop(.048,.033,0),
    loop(.042,.026,-.0025),contact],true,false),edge);
  b.geometry(sectionLoft([contact,loop(.036,.020,.0005)],false,true,[0,0,-1]),housing);
  if(utility) b.geometry(sectionLoft([loop(.028,.010,-.0003),loop(.024,.009,-.003),loop(.019,.006,-.0045)]),mark);
  else for(const dy of [-.006,.005]) coachLine(b,t=>[side*(x+(t-.5)*.019),y+dy+.002*(t-.5),z-.0025],mark,.001,4);
}

/** Native-size raised markings on the actual cockpit glass. Paths are curved
 * roads with a junction and an oriented vehicle cursor, not a copied UI bitmap. */
export function cabinMap(b:VillaModelBuilder,x:number,y:number,z:number,w:number,h:number,
  ink:THREE.Material,cursor:THREE.Material,style:DoorStyle) {
  const p=(a:number,c:number,d=0):P3=>[x+a*w,y+c*h,z-d];
  const road=(points:P2[],girth:number,mat:THREE.Material,d=0)=>{
    const curve=new THREE.CatmullRomCurve3(points.map(([a,c])=>new THREE.Vector3(a*w,c*h,0)));
    b.geometry(coachSheet(18,1,(u,v)=>{const pt=curve.getPoint(u),t=curve.getTangent(u);return [x+pt.x+(v-.5)*girth*t.y,
      y+pt.y-(v-.5)*girth*t.x,z-d];},[0,0,-1]),mat);
  };
  road([[-.47,-.23],[-.33,-.17],[-.24,.02],[-.08,.18],[.037,.17],[.13,.40]],.003,ink);
  road([[-.43,.38],[-.31,.18],[-.24,.02],[-.1,-.11],[.04,-.24],[.18,-.22]],.0015,ink);
  road([[-.29,-.40],[-.25,-.24],[-.21,-.17],[-.14,-.04],[-.08,.18]],.0016,ink);
  const pointer=new THREE.Shape([new THREE.Vector2(0,.015),new THREE.Vector2(.008,-.010),new THREE.Vector2(0,-.006),new THREE.Vector2(-.008,-.010)]);
  b.geometry(new THREE.ShapeGeometry(pointer),cursor,p(-.22,.018,.0016),[0,Math.PI,.4]);
  const boundary=style==='utility'?.23:.19;
  b.geometry(coachSheet(1,1,(u,v)=>p(boundary+.003*u,mix(-.43,.43,v)),[0,0,-1]),ink);
  const n=style==='fastback'?3:2;
  for(let i=0;i<n;i++) {
    const yy=.24-i*(n===2?.33:.235);
    b.geometry(coachSheet(8,1,(u,v)=>p(.29+u*.14,yy+v*.018+.008*Math.sin(u*Math.PI),.0005),[0,0,-1]),ink);
    b.geometry(coachSheet(6,1,(u,v)=>p(.29+u*(i===1?.07:.10),yy-.051+v*.028,.0006),[0,0,-1]),cursor);
  }
}
