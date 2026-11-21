import * as THREE from 'three';
import type { VillaModelBuilder } from './villaModel.js';
import { coachPanel } from './villaCoachwork.js';
import { bentRail, mix, ovalLoop, roundedLoop, sectionLoft, turnedSection, type P2, type P3 } from './villaVehicleSections.js';

type Mat = THREE.Material;
const tau = Math.PI * 2;

/** A pierced plate, including the material on the inside of each cut edge. The
 * outline is authored in xy; z is thickness. An optional deformation is applied
 * to front, returns and reverse together, so no seams open at the cutouts. */
function plate(contour:P2[], holes:P2[][], thickness:number, form?: (x:number,y:number,z:number)=>P3) {
  const path = (loop:P2[]) => loop.map(([x,y]) => new THREE.Vector2(x,y));
  const shape = new THREE.Shape(path(contour));
  for(const hole of holes) shape.holes.push(new THREE.Path(path(hole)));
  const g=new THREE.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:false});
  if(form) {
    const p=g.getAttribute('position'); for(let i=0;i<p.count;i++) p.setXYZ(i,...form(p.getX(i),p.getY(i),p.getZ(i)));
    g.computeVertexNormals();
  }
  return g;
}

export function workstation(b:VillaModelBuilder,wood:Mat,shell:Mat,metal:Mat,rubber:Mat) {
  // A bevelled plywood edge and two bored cable exits. Sleeves turn down
  // into the actual holes; cables no longer have to cross a painted dot.
  const top=roundedLoop(2.70,.85,.035),ports=[-.12,.53];
  const holes=ports.map(x=>ovalLoop(.037,.023,24).map(([a,c]):P2=>[x+a,.337+c]));
  b.geometry(plate(top,holes,.049,(x,z,t)=>{
    const edge=Math.abs(x)>1.32||Math.abs(z)>.394;
    return [x*(edge&&t<.001?.993:1),z*(edge&&t<.001?.976:1),t];
  }),wood,[7.25,.7535,3.84],[-Math.PI/2,0,0]);
  for(const x of ports){
    const ring=(w:number,d:number,h:number)=>ovalLoop(w,d,24).map(([a,z]):P3=>[7.25+x+a,h,3.503+z]);
    b.geometry(sectionLoft([ring(.039,.025,.801),ring(.038,.025,.804),ring(.034,.020,.804),ring(.033,.019,.754)],false,false,[0,1,0]),shell);
  }
  for(const x of [6.08,8.42]){
    const gable:P2[]=[[-.35,.059],[-.345,.105],[-.262,.697],[-.222,.755],[.223,.755],[.260,.699],[.298,.145],[.353,.098],[.354,.059]];
    const knee:P2[]=[[-.281,.129],[-.206,.675],[-.180,.704],[.177,.704],[.199,.680],[.241,.130]];
    b.geometry(plate(gable,[knee],.041),shell,[x-.021,0,3.84],[0,Math.PI/2,0]);
    for(const z of [3.552,4.128]) b.cylinder(x,.033,z,.037,.044,.063,rubber,undefined,12);
  }
  b.box(7.25,.593,3.537,2.33,.038,.038,metal,.006);
}
export function monitorArm(b:VillaModelBuilder,x:number,z:number,base:Mat,metal:Mat){
  b.box(x,.815,3.453,.101,.025,.086,base,.009);
  b.cylinder(x,.917,3.454,.014,.018,.184,metal);
  const a:P3=[x,1.008,3.454],k:P3=[x+.095,1.097,3.477],e:P3=[x,1.168,z-.014];
  b.geometry(bentRail([a,[x+.033,1.050,3.46],k],.013,8),base);
  b.geometry(bentRail([k,[x+.082,1.112,3.507],e],.013,8),metal);
  for(const p of [a,k,e])b.cylinder(...p,.021,.021,.033,base,[0,0,Math.PI/2],16);
}

export function screenEnclosure(b:VillaModelBuilder,w:number,h:number,black:Mat,metal:Mat) {
  const ring=(ww:number,hh:number,r:number,z:number)=>roundedLoop(ww,hh,r,4).map(([x,y]):P3=>[x,y,z]);
  // The LCD is not a decal on a box. A stamped back pan rolls over into the
  // bezel; the active plane sits just behind a narrow front lip.
  b.geometry(sectionLoft([ring(w*.78,h*.82,.029,-.003),ring(w+.038,h+.038,.018,.019),
    ring(w+.054,h+.054,.016,.052),ring(w+.050,h+.050,.014,.070),ring(w-.001,h-.001,.003,.070),
    ring(w-.001,h-.001,.003,.064)],true,false),black);
  // Discreet bottom chin and a recessed cable tunnel on the back of the head.
  b.geometry(sectionLoft([ring(w*.26,.009,.003,.066),ring(w*.25,.007,.003,.071)]),metal,[0,-h/2-.012,0]);
  b.geometry(plate(roundedLoop(w*.29,h*.32,.023),[roundedLoop(w*.11,.021,.008).map(([x,y])=>[x,y-h*.07])],.016),black,[0,-h*.08,-.017]);
}

export function consoleShell(b:VillaModelBuilder,black:Mat,white:Mat,blue:Mat) {
  const core=(w:number,d:number,h:number)=>roundedLoop(w,d,.029).map(([x,z]):P3=>[x,h+.013*x,z]);
  b.geometry(sectionLoft([core(.421,.254,-.044),core(.462,.276,-.033),core(.453,.272,.038),core(.428,.258,.049)]),black);
  // Opposed wings rise at the tips but pinch in at the exhaust gap. Both
  // broad faces and their rounded, variable-width returns are explicit.
  for(const sign of [-1,1]) coachPanel(b,(u,v)=>{
    const a=2*u-1,c=2*v-1;
    return [a*(.239+.017*c*c)+.008*c,sign*(.050+.018*(a+.2)**2+.008*c*c)+.004*c,
      c*(.140+.016*a*a)-.010*a];
  },white,[0,sign,0],[0,-sign*.008,0],14,8);
  for(let i=0;i<17;i++){
    const x=-.178+i*.021; b.geometry(bentRail([[x,.025,-.130],[x+.003,.031,-.140],[x+.005,.038,-.138]],.0022,6),black);
  }
  b.geometry(bentRail([[-.176,.038,-.136],[-.087,.037,-.139],[.014,.036,-.139],[.092,.036,-.140]],.002,6),blue);
}

export function gamepad(b:VillaModelBuilder,shell:Mat,dark:Mat,metal:Mat) {
  const bridge=(w:number,h:number,z:number)=>ovalLoop(w,h,24,.71).map(([x,y]):P3=>[x,y+.003*(x/w)**2,z]);
  b.geometry(sectionLoft([bridge(.049,.013,-.041),bridge(.071,.024,-.018),bridge(.086,.026,.012),bridge(.078,.018,.040)]),shell);
  for(const s of [-1,1]){
    b.geometry(sectionLoft([[-.082,.014,.012,.073],[-.070,.024,.019,.074],[-.049,.029,.025,.071],
      [-.014,.030,.028,.061],[.014,.027,.025,.060],[.031,.019,.018,.063]].map(([z,w,h,off])=>
      ovalLoop(w,h,18,.81).map(([x,y]):P3=>[s*(off+x),y+z*.11,z]))),shell);
    b.cylinder(s*.032,.026,-.008,.010,.014,.012,dark);
    b.geometry(turnedSection([[-.002,.009],[-.0005,.013],[.002,.013],[.003,.010],[-.001,.008]],16),dark,[s*.032,.034,-.008],[0,0,Math.PI/2]);
  }
  const touch=(w:number,d:number,h:number)=>roundedLoop(w,d,.006).map(([x,z]):P3=>[x,h-z*.14,z+.018]);
  b.geometry(sectionLoft([touch(.054,.027,.023),touch(.050,.025,.029)]),dark);
  for(let i=0;i<4;i++){
    const a=i*Math.PI/2;
    b.cylinder(.061+.012*Math.cos(a),.029,.016+.012*Math.sin(a),.0041,.0046,.006,metal,undefined,10);
    b.at(-.061,.027,.017,a,()=>b.geometry(sectionLoft([[.003,0],[.009,.007],[.009,.012]].map(([w,z])=>
      roundedLoop(w,.005,.0016).map(([x,y]):P3=>[x,y,z]))),dark));
  }
}

/** Desktop charging dock is an open slot with a real floor, back wall and
 * short front lip below the active display. */
export function mediaDock(b:VillaModelBuilder,shell:Mat) {
  const section:P2[]=[[-.067,0],[.058,0],[.071,.010],[.071,.149],[.061,.155],[.024,.147],
    [.020,.107],[-.009,.107],[-.015,.114],[-.057,.114],[-.068,.101]];
  b.geometry(sectionLoft([[-.155,.91],[-.148,1],[.148,1],[.155,.91]].map(([x,f])=>
    section.map(([z,y]):P3=>[x,y*f,z]))),shell);
}

export function mouseShell(b:VillaModelBuilder,shell:Mat,grip:Mat,bright:Mat) {
  // Width, centre and crown change down the mouse. The flared thumb foot on
  // -X blends into the arched palm rest; the nose drops below two click leaves.
  const sections=[[-.068,.022,.016,.001],[-.055,.032,.022,.002],[-.025,.037,.026,.003],[-.005,.038,.033,.003],
    [.018,.043,.049,.002],[.039,.041,.052,-.003],[.058,.032,.040,-.004],[.069,.016,.018,-.003]];
  b.geometry(sectionLoft(sections.map(([z,w,h,off])=>[
    [-.82*w+off,.002,z],[-w+off,.008,z],[-.88*w+off,h*.63,z],[-.51*w+off,h*.95,z],[off,h,z],
    [off+.52*w,h*.91,z],[off+.91*w,h*.61,z],[off+w,h*.25,z],[off+.86*w,.002,z]])),shell);
  for(const side of [-1,1]) {
    b.geometry(sectionLoft([[-.069,.019,.017],[-.057,.031,.026],[-.031,.036,.034],[-.012,.036,.038],[.005,.031,.040]].map(([z,w,h])=>{
      const gap=.0015+.005*Math.exp(-((z+.035)**2)/.00014);
      return [[side*gap,h-.003,z],[side*w,h-.010,z],[side*(w+.0008),h-.006,z],
        [side*w*.81,h+.001,z],[side*(w*.40+gap*.60),h+.004,z],[side*gap,h+.001,z]];
    })),grip);
  }
  b.cylinder(0,.035,-.036,.011,.011,.009,bright,[0,0,Math.PI/2],16);
  b.geometry(turnedSection([[-.005,.008],[-.005,.011],[-.003,.0125],[.003,.0125],[.005,.011],[.005,.008]],20),grip,[0,.035,-.036]);
  for(const z of [-.007,.012]) b.geometry(sectionLoft(ovalSwitch(-.036,.024,z)),bright);
  function ovalSwitch(x:number,y:number,z:number) {return [[0,.009,.003],[-.002,.009,.003],[-.003,.007,.0025]].map(([d,w,h])=>
    ovalLoop(w,h,14,.7).map(([a,c]):P3=>[x+d-.08*a,y+c,z+a]));}
}

/** Swept impeller rooted at its boss; a pitched section takes light differently
 * at inlet and tip. The sculpted rounded-square frame has a real round throat. */
export function pcFan(b:VillaModelBuilder,r:number,frame:Mat,blade:Mat,bright:Mat,glow:Mat,lit=true) {
  const ring=(rad:number,z:number,e:number)=>ovalLoop(rad,rad,32,e).map(([x,y]):P3=>[x,y,z]);
  b.geometry(sectionLoft([ring(r*1.10,-.008,.43),ring(r*1.12,.001,.43),ring(r*1.09,.006,.43),ring(r*.96,.006,1),
    ring(r*.942,-.003,1),ring(r*.953,-.008,1),ring(r*1.10,-.008,.43)],false,false),frame);
  const rim=turnedSection([[-.001,r*1.017],[.001,r*1.022],[.002,r*1.006],[.001,r*.991],[-.001,r*.990]],32);
  b.geometry(rim,lit?glow:bright,[0,0,.006],[0,-Math.PI/2,0]);
  for(let i=0;i<7;i++) {
    const start=i*tau/7;
    coachPanel(b,(u,v)=>{const rad=r*mix(.19,.921,v),a=start+v*.56+(u-.5)*mix(.64,.44,v);
      return [Math.cos(a)*rad,Math.sin(a)*rad,-.0015+r*(.09*(u-.5)+.026*Math.sin(Math.PI*v))];},blade,[0,0,1],[0,0,-.0015],3,6);
  }
  const boss=(rad:number,z:number)=>ovalLoop(rad,rad,20).map(([x,y]):P3=>[x,y,z]);
  b.geometry(sectionLoft([boss(r*.22,-.007),boss(r*.235,.0015),boss(r*.18,.004)]),bright);
  for(const x of [-1,1])for(const y of [-1,1]) b.cylinder(x*r*.90,y*r*.90,.006,r*.052,r*.076,.003,frame,[Math.PI/2,0,0],8);
}

export function pcChassis(b:VillaModelBuilder,frame:Mat,steel:Mat,glass:Mat,pad:Mat) {
  const horizontal=(w:number,l:number,h:number)=>roundedLoop(w,l,.023,4).map(([x,z]):P3=>[x,h,z]);
  b.geometry(sectionLoft([horizontal(.301,.381,.003),horizontal(.320,.399,.012),horizontal(.320,.399,.027),
    horizontal(.299,.378,.035)]),frame);
  // The top exhaust is milled through the folded lid; the radiator underneath
  // can actually be seen between the lands, unlike dark stripes on a solid roof.
  const slots:P2[][]=[];
  for(let i=0;i<8;i++)slots.push(roundedLoop(.189,.013,.006).map(([x,y])=>[x,y-.095+i*.027]));
  b.geometry(plate(roundedLoop(.312,.395,.022),slots,.010),frame,[0,.466,0],[-Math.PI/2,0,0]);
  b.geometry(plate(roundedLoop(.311,.45,.015),[roundedLoop(.209,.030,.007).map(([x,y])=>[x,y+.072]),
    roundedLoop(.178,.022,.005).map(([x,y])=>[x,y+.121])],.009),frame,[0,.243,-.197]);
  // Folded unequal-angle stiles physically support the two clear sheets.
  for(const x of [-1,1])for(const z of [-1,1]){
    const cross:P2[]=[[0,0],[.021,0],[.021,.0035],[.004,.0035],[.004,.021],[0,.021]];
    b.geometry(sectionLoft([.024,.468].map(y=>cross.map(([a,c]):P3=>[x*(.156-a),y,z*(.196-c)]))),steel);
    b.geometry(sectionLoft([.002,-.010,-.015].map((h,i)=>horizontal(.035-i*.002,.041-i*.003,h))),pad,[x*.13,0,z*.166]);
  }
  b.box(-.153,.246,.001,.003,.428,.377,glass,0);
  b.box(.001,.246,.199,.303,.428,.003,glass,0);
}

export function headsetAndMic(b:VillaModelBuilder,black:Mat,pad:Mat,steel:Mat,liner:Mat) {
  b.at(7.70,.8025,3.65,0,()=>{
    const base=(w:number,d:number,h:number)=>roundedLoop(w,d,.025).map(([x,z]):P3=>[x,h,z]);
    b.geometry(sectionLoft([base(.128,.114,0),base(.134,.121,.007),base(.114,.103,.018)]),black);
    b.geometry(bentRail([[0,.018,-.027],[0,.220,-.027],[0,.274,-.023],[0,.280,.001],[0,.276,.016]],.006,8),steel);
    for(const [r,thick,wide,mat] of [[.077,.004,.014,steel],[.068,.007,.019,pad]] as const){
      b.geometry(sectionLoft(Array.from({length:23},(_,i)=>{const a=.04+i/22*(Math.PI-.08);
        return roundedLoop(thick,wide,thick*.38,2).map(([dr,z]):P3=>[Math.cos(a)*(r+dr),.220+Math.sin(a)*(r+dr),z]);})),mat);
    }
    for(const side of [-1,1]){
      // End yoke wraps behind the swivel; ear cushions turn inward around a
      // bowl with a smaller recessed soundcloth disc, not a pair of spheres.
      b.geometry(bentRail([[side*.075,.225,0],[side*.079,.217,-.019],[side*.076,.195,-.030],
        [side*.073,.187,-.023],[side*.073,.187,0]],.0035,7),steel);
      const disk=(x:number,h:number,d:number)=>ovalLoop(h,d,24,.85).map(([y,z]):P3=>[side*x,.187+y,z]);
      b.geometry(sectionLoft([disk(.087,.032,.024),disk(.082,.042,.030),disk(.066,.046,.034),disk(.063,.044,.033)]),black);
      b.geometry(sectionLoft([disk(.063,.044,.033),disk(.057,.045,.033),disk(.051,.041,.029),disk(.050,.030,.019),
        disk(.053,.024,.015),disk(.060,.024,.015)],true,false),pad);
      b.geometry(sectionLoft([disk(.061,.026,.017),disk(.060,.024,.016)]),liner);
    }
  });
  const a:P3=[6.02,.83,3.76],k:P3=[6.08,1.08,3.80],end:P3=[6.38,1.035,3.96];
  b.cylinder(a[0],.811,a[2],.027,.034,.017,black,undefined,16);
  for(const off of [-.011,.011]) {b.beam([a[0]+off,a[1],a[2]],[k[0]+off,k[1],k[2]],.005,black,8);
    b.beam([k[0],k[1]+off,k[2]],[end[0],end[1]+off,end[2]],.005,black,8);}
  for(const p of [a,k,end]) b.cylinder(...p,.016,.016,.020,steel,[0,0,Math.PI/2],12);
  b.geometry(bentRail([[6.369,1.03,3.952],[6.352,1.014,3.953],[6.353,.978,3.958],[6.377,.965,3.960],[6.404,.975,3.96]],.003,8),steel);
  b.at(6.38,.985,3.96,0,()=>{
    const shell=(r:number,y:number)=>ovalLoop(r,r,20).map(([x,z]):P3=>[x,y,z]);
    b.geometry(sectionLoft([shell(.012,-.048),shell(.019,-.040),shell(.021,.012),shell(.019,.020)]),black);
    b.geometry(sectionLoft([shell(.020,.014),shell(.021,.035),shell(.016,.046),shell(.011,.048)]),pad);
    for(let i=0;i<5;i++)b.geometry(turnedSection([[-.001,.0202],[0,.0215],[.001,.0202],[0,.019]],20),steel,[0,.016+i*.004,0],[0,0,Math.PI/2]);
  });
}

/** Open saddle-backed shells for two different types of chair: a pierced one-
 * piece race shell, or an office back on a swivel spider with arm pads. */
export function gamingSeat(b:VillaModelBuilder,racing:boolean,foam:Mat,black:Mat,piping:Mat,metal:Mat){
  const pan=(rx:number,rz:number,h:number,wings:number)=>ovalLoop(1,1,32,.55).map(([u,v]):P3=>
    [u*rx*(1+.05*v),h+wings*u**4*(1-.19*v*v)+.014*v*v,v*rz+.012]);
  b.geometry(sectionLoft([pan(.205,.201,.420,0),pan(.242,.227,.438,.015),pan(.246,.236,.485,.063),
    pan(.224,.215,.515,.065),pan(.182,.187,.527,.013),pan(.118,.148,.534,0)],true,true),foam);
  for(const side of [-1,1]) b.geometry(bentRail([[side*.188,.535,-.184],[side*.211,.546,-.136],[side*.216,.558,-.032],
    [side*.221,.568,.078],[side*.208,.564,.156]],.0038,8),piping);
  // Outline in x/y, with shaped lumbar scoop and forward shoulder wings.
  const half:P2[]=racing?[[.179,.50],[.201,.54],[.204,.65],[.178,.78],[.216,.94],[.253,1.033],[.243,1.105],
    [.173,1.130],[.145,1.239],[.122,1.289],[.080,1.302]]:
    [[.157,.518],[.186,.574],[.193,.707],[.184,.827],[.213,.994],[.212,1.106],[.184,1.154],[.104,1.164]];
  const outline:P2[]=[...half,...[...half].reverse().map(([x,y]):P2=>[-x,y])];
  const holes:P2[][]=racing?[-1,1].map(s=>roundedLoop(.100,.040,.015).map(([x,y])=>[s*.104+x,1.044+y+.12*s*x])):[];
  const profile=(x:number,y:number)=>.148+.21*(y-.52)-.080*(Math.abs(x)/.25)**2-.036*Math.exp(-((y-.72)**2)/.007);
  b.geometry(plate(outline,holes,.035,(x,y,z)=>[x,y,profile(x,y)+z]),black);
  if(racing) for(const side of [-1,1]){
    const lip=(w:number,h:number,off:number)=>roundedLoop(w,h,.014).map(([a,c]):P3=>{
      const x=side*.104+a,y=1.044+c+.12*side*a;return [x,y,profile(x,y)+off];});
    b.geometry(sectionLoft([lip(.107,.047,-.001),lip(.105,.045,-.005),lip(.099,.039,-.005),lip(.099,.039,.004)],false,false,[0,0,-1]),piping);
  }
  const bolster=(a:number,h:number,d:number)=>ovalLoop(a,h,24,.64).map(([x,y]):P3=>[x,y, d-.026*(1-(x/a)**2)]);
  for(const [y,w,h,mat] of [[.709,.150,.108,foam],[.901,.156,.076,foam],[racing?1.213:1.221,.134,.074,foam]] as const){
    if(!racing&&y>1.18)for(const x of [-.071,.071])b.beam([x,1.134,.287],[x,1.226,.300],.008,metal);
    b.geometry(sectionLoft([bolster(w*.91,h*.91,.029),bolster(w,h,.004),bolster(w*.94,h*.96,-.014),
      bolster(w*.78,h*.80,-.025)]),mat,[0,y,profile(0,y)]);
  }
  if(racing) return;
  for(const s of [-1,1]){
    b.geometry(bentRail([[s*.225,.452,.090],[s*.278,.477,.088],[s*.303,.610,.080],[s*.303,.664,.052]],.014,8),metal);
    const rest=(w:number,l:number,h:number)=>roundedLoop(w,l,.031).map(([x,z]):P3=>[s*.299+x,h+.012*(z/.14)**2,-.027+z]);
    b.geometry(sectionLoft([rest(.068,.222,.658),rest(.087,.257,.674),rest(.083,.266,.697),rest(.068,.24,.704)]),foam);
  }
  b.cylinder(0,.279,0,.025,.035,.291,metal);
  for(let i=0;i<5;i++) b.at(0,0,0,i*tau/5,()=>{
    const spar=(z:number,w:number,h:number,y:number)=>roundedLoop(w,h,.009).map(([x,v]):P3=>[x,y+v,z]);
    b.geometry(sectionLoft([spar(.013,.065,.064,.167),spar(.096,.055,.048,.139),spar(.245,.037,.026,.084),spar(.306,.040,.038,.077)]),black);
    b.cylinder(0,.065,.305,.014,.016,.035,metal);
    for(const x of [-.020,.020]) b.geometry(turnedSection([[-.010,.017],[-.009,.033],[-.004,.038],[.006,.038],[.011,.033],[.011,.017]],18),foam,[x,.040,.314]);
    b.cylinder(0,.04,.314,.019,.019,.053,black,[0,0,Math.PI/2],16);
  });
}

/** Pierced, folded aluminium rail and pedal faces. No filled box down the
 * central T-slot: the channel side, fold and floor are visible from the seat. */
export function rigRail(b:VillaModelBuilder,x:number,z:number,length:number,metal:Mat){
  const section:P2[]=[[-.039,-.043],[.039,-.043],[.039,.043],[.011,.043],[.011,.031],[.022,.031],[.022,.010],
    [-.022,.010],[-.022,.031],[-.011,.031],[-.011,.043],[-.039,.043]];
  b.geometry(sectionLoft([-1,1].map(s=>section.map(([dx,y]):P3=>[x+dx,.15+y,z+s*length/2]))),metal);
}
export function rallyWheelTrim(b:VillaModelBuilder,grip:Mat,metal:Mat,index:Mat) {
  const gripSection=(a:number,thickness=0):P3[]=>{
    const c=Math.cos(a),s=Math.sin(a), thumb=Math.max(0,c*c*(.62+.38*Math.sin(2*a)));
    return ovalLoop(.018+.005*thumb+thickness,.020+.005*thumb+thickness,12,.83).map(([r,z]):P3=>
      [(r+.178-.003*thumb)*c,(r+.178-.003*thumb)*s,z]);
  };
  b.geometry(sectionLoft(Array.from({length:73},(_,i)=>gripSection(tau*i/72)),false,false),grip);
  b.geometry(sectionLoft([-.059,-.035,.035,.059].map(a=>gripSection(Math.PI/2+a,.001)),false,false),index);
  for(const a of [0,Math.PI,-Math.PI/2]) {
    const outline:P2[]=[[.029,-.027],[.101,-.021],[.153,-.019],[.168,-.010],[.168,.015],[.149,.024],[.085,.024],[.032,.030]];
    b.geometry(plate(outline,[roundedLoop(.048,.011,.005).map(([x,y])=>[.117+x,y])],.010,
      (x,y,z)=>[x,y,z-.015+.011*(x/.165)**2]),metal,[0,0,0],[0,0,a]);
  }
  b.cylinder(0,0,-.009,.049,.046,.039,grip,[Math.PI/2,0,0],24);
  for(const s of [-1,1]) {
    const paddle:P2[]=[[.072,-.025],[.106,-.040],[.134,-.032],[.143,.044],[.132,.073],[.107,.079],[.100,.031],[.073,.015]];
    b.geometry(plate(paddle.map(([x,y])=>[s*x,y]),[ovalLoop(.007,.016,12).map(([x,y])=>[s*(.121+x),.044+y])],.006,
      (x,y,z)=>[x,y,z+.025+.018*(Math.abs(x)/.145)**2]),metal);
    for(const x of [.066,.087]) b.cylinder(s*x,.009,-.019,.006,.007,.008,index,[Math.PI/2,0,0],12);
  }
}

export function pedalFace(b:VillaModelBuilder,x:number,y:number,z:number,i:number,metal:Mat,pad:Mat){
  const w=i===2?.084:.109,h=i===2?.180:.151;
  const outline=roundedLoop(w,h,.020,4), holes:P2[][]=[];
  for(let j=0;j<3;j++)holes.push(roundedLoop(w*.48,.012,.005).map(([a,c])=>[a,c+(j-1)*h*.25]));
  const bend=(a:number,c:number,d:number):P3=>[a,c,d+.008*(a/(w/2))**2+.003*(c/(h/2))**2];
  b.geometry(plate(outline,holes,.009,bend),metal,[x,y,z],[-.50,0,0]);
  for(const s of [-1,1]) b.geometry(bentRail([-.054,0,.053].map(c=>[s*w*.37,c,.0015] as P3),.0024,6),pad,[x,y,z-.001],[-.50,0,0]);
}
