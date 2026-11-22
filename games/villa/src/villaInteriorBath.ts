import * as THREE from 'three';
import { bent, board, casting, circleXY, loft, oval, rail, rectRing, rectXY, sheet, stock, turn, type FurnitureKit, type Point, type PutSurface } from './villaFurnitureForms.js';
import { pull, vessel } from './villaFurnitureJoinery.js';
import { towelRoll } from './villaFurnitureTextiles.js';
import { formedTube, vessel as sectionVessel } from './villaFittingGeometry.js';
import { reededGlass } from './villaBathDoors.js';
import { createVillaRoomMirror } from './villaInteriorMirror.js';
import { frontLoader } from './villaInteriorKitchen.js';

export function foldedTowel(w: number, d: number, h: number) {
  // Side view of a single terry piece doubled back on itself. The fold bulges
  // on the closed side, the opposite side exposes the hollow between its hems.
  const p = [[-.47, 0], [.43, 0], [.49, .10], [.5, .26], [.46, .39], [-.35, .41], [-.37, .46], [-.35, .52], [.38, .53], [.44, .6], [.45, .74], [.39, .81], [-.39, .82], [-.42, .87], [-.37, .92], [.385, .92], [.385, 1], [-.43, 1], [-.49, .93], [-.495, .80], [-.445, .704], [.33, .69], [.34, .65], [-.408, .64], [-.482, .56], [-.48, .405], [-.407, .31], [.39, .295], [.411, .23], [.383, .163], [-.47, .157]];
  return casting(p.map(([z, y]) => [z * d, y * h]), w).rotateY(Math.PI / 2);
}

/** Different border yarns share one continuous cut. Closing the cloth at every
 * dye change wastes internal walls and gives neighbours discontinuous normals. */
function wovenSections(put: PutSurface, columns: number[], groups: [number[], THREE.Material][],
  point: (u:number,v:number,under:boolean) => Point, chart: (u:number,v:number) => [number,number], x=0, y=0, z=0) {
  const rows=[groups[0][0][0]], yarn: THREE.Material[]=[];
  for (const [stations,m] of groups) for (const next of stations.slice(1)) { rows.push(next); yarn.push(m); }
  const cut=sheet(columns,rows,point), index=cut.index!, p=cut.getAttribute('position'), n=cut.getAttribute('normal');
  const half=columns.length*rows.length, byStock=new Map<THREE.Material,number[]>();
  for (let i=0;i<index.count;i+=3) {
    const a=index.getX(i), b=index.getX(i+1), c=index.getX(i+2);
    const row=Math.min(Math.floor(Math.min(a%half,b%half,c%half)/columns.length),yarn.length-1), m=yarn[row];
    if (!byStock.has(m)) byStock.set(m,[]);
    byStock.get(m)!.push(a,b,c);
  }
  for (const [m,indices] of byStock) {
    const xyz:number[]=[], normals:number[]=[], uv:number[]=[], remap=new Map<number,number>();
    const elements=indices.map(i=>{
      const old=remap.get(i); if(old!==undefined) return old;
      const j=i%half, k=xyz.length/3; xyz.push(p.getX(i),p.getY(i),p.getZ(i)); normals.push(n.getX(i),n.getY(i),n.getZ(i));
      uv.push(...chart(columns[j%columns.length],rows[Math.floor(j/columns.length)])); remap.set(i,k); return k;
    });
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(xyz,3));
    g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3)); g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2)); g.setIndex(elements);
    put(g,m,x,y,z);
  }
  cut.dispose();
}

/** Hem, back fall, wrapped crown and front fall are a continuous cut of cloth.
 * r is the actual support radius, not an imaginary hump on a flat towel. */
export function hangingTowel(put:PutSurface, body:THREE.Material, border:THREE.Material,
  width:number, front:number, rear:number, r:number, cx=0, cy=0, cz=0, phase=0) {
  const circumference=Math.PI*(r+.0027), length=rear+circumference+front;
  const crown=(distance:number,u:number,under:boolean):Point=>{
    const axial=distance-rear, t=(r+.0027), thickness=under?.00045:.0050;
    const a=Math.max(-Math.PI/2,Math.min(Math.PI/2,-Math.PI/2+axial/t));
    const hanging=axial<0 ? -axial : Math.max(0,axial-circumference), end=axial<0?rear:front;
    const fullness=hanging/end, side=Math.sin(a), wave=Math.cos(u*Math.PI*2.45+phase)+.43*Math.sin(u*Math.PI*4.2+fullness);
    const y=(r+thickness)*Math.cos(a)-hanging + fullness*fullness*(.012*Math.cos(u*2.6+phase)+.011*u);
    const drift=fullness*(.014*Math.sin(phase+.4)+.016*u*fullness);
    return [u*width/2+drift, y, (r+thickness)*side +fullness*side*(.009+.014*wave)+.011*u*fullness];
  };
  const us=width<.45?[-1,-.55,0,.52,1]:[-1,-.76,-.47,-.19,.16,.47,.78,1];
  const groups:[number[],THREE.Material][]=[[[0,.035,rear*.47,rear],body],
    [[rear,rear+circumference*.25,rear+circumference*.5,rear+circumference*.75,rear+circumference],body],
    [[rear+circumference,length-front*.52,length-.102],body],[[length-.102,length-.074],border],
    [[length-.074,length-.060],body],[[length-.060,length-.049],border],[[length-.049,length-.010,length],body]];
  wovenSections(put,us,groups,(u,d,under)=>crown(d,u,under),(u,d)=>[u*width/2,d],cx,cy,cz);
}

/** Returns and escutcheons seat the bar against the north panel. Back face of
 * each escutcheon is exactly wallZ, 104mm behind the towel centre. */
export function mountedTowels(put:PutSurface, metal:THREE.Material, web:THREE.Material, binding:THREE.Material,
  x:number,y:number,wallZ:number,span:number, width:number, length:number,pair=false) {
  const z=wallZ+.104,r=.017;
  for(const side of [-1,1]) put(turn([[0,0],[.034,0],[.036,.003],[.036,.008],[.026,.012],[0,.012]],9),metal,
    x+side*span/2,y,wallZ,Math.PI/2);
  put(formedTube([[-span/2,0,-.099,.014],[-span/2,0,-.023,.014],[-span/2+.004,0,-.010,r],
    [-span/2+.018,0,0,r],[span/2-.018,0,0,r],[span/2-.004,0,-.010,r],[span/2,0,-.023,.014],
    [span/2,0,-.099,.014]],8,0,[0,1,0]),metal,x,y,z);
  hangingTowel(put,web,binding,width,length,length*.68,r,x-(pair?width*.32:.035),y,z,.47);
  if(pair) hangingTowel(put,binding,web,width*.52,length*.68,length*.42,r,x+width*.56,y,z,1.81);
}

const bathStation=(w:number,d:number,y:number,rise=0,cz=0)=>oval(w,d,y,32,.76).map(([x,yy,z]):Point=>{
  const t=z/(d/2); return [x*(1-.034*t), yy+rise*Math.abs(t)**3*(1+.16*t),cz+z];
});
export function tubShell() {
  return loft([bathStation(.067,.067,.018,0,-.71),bathStation(1.38,2.79,.018),bathStation(1.54,3.02,.049),bathStation(1.65,3.17,.129,.009),
    bathStation(1.91,3.72,.32,.018),bathStation(2.22,4.10,.60,.054),bathStation(2.343,4.27,.674,.067),bathStation(2.35,4.277,.706,.069),
    bathStation(2.319,4.25,.725,.064),bathStation(2.216,4.131,.724,.063),bathStation(2.159,4.065,.690,.058),
    bathStation(1.97,3.78,.49,.030),bathStation(1.76,3.40,.323),bathStation(1.54,3.04,.218),bathStation(1.23,2.56,.170),
    bathStation(.86,1.84,.157),bathStation(.099,.099,.149,0,-.71),bathStation(.067,.067,.148,0,-.71),
    bathStation(.067,.067,.018,0,-.71)],false,false);
}
/** The flared ceramic inner wall is the water's contact curve. A shallow
 * concave meniscus returns to a calm level. Low-amplitude waves deform the
 * normals but do not turn the surface into blue terrain. */
export function bathWater() {
  const rings=[bathStation(1.764,3.409,.326),bathStation(1.758,3.395,.3234),bathStation(1.731,3.356,.3225),
    ...[.62,.27].map((q,j)=>bathStation(1.731*q,3.356*q,.3225).map(([x,y,z],i):Point=>
      [x,y+.00065*Math.sin(i*.70+j*.84)*Math.sin(i*2*Math.PI/32),z])),bathStation(.050,.080,.3225)];
  return loft(rings,false,true);
}

export function bathFittings(k: FurnitureKit, water: THREE.Material, screen: THREE.Material, glass: THREE.Material) {
  const { at, put, box, m, hit } = k;
  at(11.4, 3.6, -4.4, 0, () => {
    put(tubShell(), m.white, 0, 0, 0);
    put(bathWater(), water, 0, 0, 0);
    // A removable cross-strainer at the real discharge bore, not a coin painted on a ceramic cap.
    put(turn([[.027,-.055],[.033,-.055],[.034,-.002],[.047,0],[.050,.003],[.049,.006],[.030,.005],[.027,.001]],12),m.steel,0,.149,-.71);
    for(const yaw of [0,Math.PI/2]) put(new THREE.BoxGeometry(.057,.003,.004),m.steel,0,.146,-.71,0,yaw);
    // Installed filler: free-standing chrome, exposed union and porcelain index levers; open aerator faces down into the bowl.
    put(turn([[0,0],[.092,0],[.092,.012],[.083,.024],[.059,.031],[.041,.036],[0,.036]],12),m.steel,1.03,.001,-1.68);
    put(formedTube([[1.03,.03,-1.68,.040],[1.03,.111,-1.68,.034],[1.03,.93,-1.68,.031],[1.022,1.055,-1.68,.031],
      [.984,1.113,-1.68,.031],[.91,1.143,-1.68,.031],[.664,1.143,-1.68,.029],[.613,1.131,-1.68,.029],[.583,1.095,-1.68,.028],
      [.578,1.053,-1.68,.029]],10,.004,[0,0,1]),m.steel,0,0,0);
    put(turn([[.026,0],[.031,.003],[.032,.021],[.028,.025],[.024,.023],[.024,0]],10),m.steel,.578,1.043,-1.68);
    for(const side of [-1,1]) {
      const z=-1.68+side*.085;
      rail(k,[1.03,.889,-1.68],[1.03,.889,z],.031,m.steel);
      put(turn([[0,0],[.03,0],[.032,.005],[.021,.021],[0,.021]],9),m.steel,1.03,.889,z,side*Math.PI/2);
      rail(k,[1.03,.889,z+side*.017],[.95,.942,z+side*.017],.012,m.white);
    }
    // End blocks grip the tub lip; spaced oak strips bridge over the water.
    for (const x of [-1.069, 1.069]) put(board(.116, .383, .077, .022), m.walnut, x, .743, .9);
    for (let i = 0; i < 5; i++) put(board(2.214, .056, .036, .014, .007), m.oak, 0, .787, .752 + .075 * i);
    // A shallow dish and handled bath brush, not a place setting balanced on the slats.
    put(sectionVessel([[0,0],[.105,.001,.067],[.128,.014,.085],[.130,.025,.086],
      [.119,.025,.075],[.110,.012,.065],[0,.012]],12,.59),m.white,.41,.805,.89);
    put(sectionVessel([[0,0],[.080,.001,.040],[.087,.014,.045],[.078,.035,.041],[.048,.041,.028],[0,.042]],10,.58),m.sage,.42,.817,.89);
    put(sectionVessel([[0,0],[.079,.001,.056],[.084,.024,.061],[.077,.040,.056],[0,.046]],10),m.linen,-.20,.805,.875);
    put(board(.174,.119,.015,.050,.006),m.oak,-.20,.852,.875);
    put(stock([[-.54,.842,.894,.017],[-.51,.850,.892,.019],[-.298,.856,.876,.013],[-.268,.852,.875,.015]],8),m.oak,0,0,0);
    hit(0, 0, 0, 2.45, .8, 4.4);
  });
  at(15.85, 3.6, -7.85, 0, () => {
    put(loft([rectRing(1.88, 1.88, .033, .003), rectRing(1.90, 1.90, .040, .099), rectRing(1.886, 1.886, .038, .128),
      rectRing(1.809, 1.809, .05, .129), rectRing(1.77, 1.77, .060, .109), rectRing(.692, .124, .031, .068, .188, -.538), rectRing(.647, .078, .02, .058, .188, -.538)]), m.stone, 0, 0, 0);
    put(board(.625, .068, .014, .016), m.dark, .188, .068, -.538);
    for (let i = 0; i < 12; i++) rail(k, [-.092 + i * .051, .078, -.572], [-.092 + i * .051, .078, -.506], .003, m.steel, 5);
    // The walk-in has one continuous clean face toward the shower and deep
    // flutes toward the room, with a half return leaving a 93cm entrance.
    if(screen instanceof THREE.MeshStandardMaterial){screen.color.set('#bdd2cf');screen.roughness=.36;screen.opacity=.63;screen.side=THREE.FrontSide;}
    put(reededGlass(1.9,2.15,.012,.052,.0054,true),screen,-.925,1.2,0,0,-Math.PI/2);
    put(reededGlass(.93,2.15,.012,.052,.0054,true),screen,-.475,1.2,.925);
    for(const z of [-.849,.866]) for(const y of [.194,2.246]) put(board(.052,.077,.054,.008),m.steel,-.925,y,z);
    rail(k,[-.925,2.285,-.949],[-.925,2.285,.936],.012,m.steel);
    rail(k,[-.925,2.285,.925],[-.009,2.285,.925],.012,m.steel);
    // Waterproof back liner anchored to the receptor. Individual courses, a
    // shallow eased edge and a usable caddy make the installation read from the tub.
    for(let col=0;col<3;col++) for(let row=0;row<5;row++)
      box((col-1)*.622,.337+row*.433,-.928,.617,.429,.028,m.stone,0);
    put(board(.73,.17,.027,.014),m.steel,-.38,1.003,-.827);
    for(const [x,r,h] of [[-.59,.040,.175],[-.45,.030,.142]]){
      put(turn([[0,0],[r,0],[r,.025],[r,h*.76],[r*.61,h*.85],[r*.43,h*.87],[r*.43,h],[0,h]],10),m.sage,x,1.017,-.816);
      put(turn([[0,0],[r*.47,0],[r*.47,.018],[0,.018]],10),m.dark,x,1.014+h,-.816);
    }
    for(const y of [.81,1.93]) {
      put(turn([[0,0],[.046,0],[.046,.005],[.037,.011],[.023,.016]],12),m.steel,.44,y,-.913,Math.PI/2);
      rail(k,[.44,y,-.9],[.44,y,-.807],.014,m.steel);
    }
    put(formedTube([[.44,.722,-.804,.020],[.44,2.07,-.804,.020],[.435,2.18,-.784,.021],[.418,2.237,-.723,.021],
      [.39,2.270,-.64,.021],[.215,2.270,-.051,.021],[.203,2.260,-.01,.021],[.20,2.237,0,.022]],10,0,[1,0,0]),m.steel,0,0,0);
    put(turn([[.126,0],[.151,.002],[.158,.011],[.155,.025],[.124,.030],[.041,.037],[.022,.050]],16),m.steel,.2,2.195,0);
    const nozzles=Array.from({length:9},(_,i)=>{
      const a=i*2.4,r=i?.103*Math.sqrt(i/8):0;return circleXY(Math.cos(a)*r,Math.sin(a)*r,.0048,6);
    });
    put(casting(circleXY(0,0,.130,16),.003,nozzles),m.steel,.2,2.195,0,-Math.PI/2);
    put(turn([[0,0],[.076,0],[.079,.011],[.058,.02],[.040,.038],[.035,.052],[0,.052]],14),m.steel,.44,1.03,-.909,Math.PI/2);
    rail(k,[.44,1.03,-.858],[.36,.976,-.819],.012,m.steel);
    hit(-.925, 0, 0, .1, 2.4, 1.9); hit(-.475, 0, .925, .95, 2.4, .1);
  });
  at(13.7, 3.6, .42, Math.PI, () => {
    // No invisible cabinet lid under the waste. Drawer runners stop either
    // side of the trap, and both stone and ceramic have the same plumbing bore.
    for(const x of [-.914,.914]) box(x,.456,-.024,.050,.809,.79,m.oak,0);
    box(0,.117,0,1.849,.050,.79,m.walnut,0);box(0,.449,-.40,1.83,.749,.025,m.walnut,0);
    for(const x of [-.46,.46])for(const y of [.338,.657]){
      put(board(.893,.295,.035,.018,.006).rotateX(Math.PI/2),m.oak,x,y,.366);
      pull(k,x,y+.045,.384,.179,.028,m.steel);
    }
    put(casting(rectXY(2,.94,.05),.075,[circleXY(0,-.031,.036,18)]),m.white,0,.9025,0,-Math.PI/2);
    put(sectionVessel([[.029,0],[.129,0,.110],[.184,.016,.150],[.252,.059,.199],[.303,.134,.244],
      [.320,.166,.251],[.317,.178,.249],[.301,.179,.239],[.290,.154,.228],[.238,.095,.186],
      [.157,.046,.125],[.076,.030,.064],[.028,.022],[.028,0]],20),m.white,0,.94,.031);
    put(turn([[.021,-.026],[.025,-.026],[.027,.018],[.036,.021],[.036,.024],[.023,.024],[.021,.018],[.021,-.026]],10),m.steel,0,.94,.031);
    put(formedTube([[0,.939,-.306,.040],[0,.964,-.306,.040],[0,.977,-.306,.028],[0,1.25,-.306,.025],
      [0,1.288,-.292,.023],[0,1.306,-.253,.023],[0,1.306,-.149,.022],[0,1.291,-.127,.022],
      [0,1.266,-.126,.022]],9,.0035,[1,0,0]),m.steel,0,0,0);
    pull(k,.042,1.078,-.306,.087,.013,m.steel,true);
    const mirror = rectXY(1.48, 1.38, .242);
    put(casting(mirror, .046, [rectXY(1.429, 1.329, .223)]), m.brass, 0, 1.96, -.372);
    put(casting(rectXY(1.440, 1.340, .227), .015), createVillaRoomMirror('bath'), 0, 1.96, -.367);
    put(foldedTowel(.40,.292,.061),m.linen,-.65,.94,.064,0,.13);
    put(foldedTowel(.35,.274,.063),m.sage,-.66,1.001,.048,0,.06);
    hit(0, 0, 0, 2, .97, .94);
  });
  at(12.48,3.6,-8.87,0,()=> {
    mountedTowels(put,m.steel,m.linen,m.sage,0,1.39,0,1.29,.65,.84,true);
    hit(0,.52,.071,1.36,.92,.15);
  });
  at(9.4, 3.6, -8.08, 0, () => {
    frontLoader(k, 1.09, .991, .946, glass, false, m.blue);
    put(board(1.22, 1.08, .090, .035, .023), m.oak, 0, 1.01, 0);
    for (let i = 0; i < 3; i++) put(foldedTowel(.64 - i * .027, .49, .080), i % 2 ? m.sage : m.linen, .1 + i * .009, 1.055 + i * .080, 0, 0, i * .02);
    hit(0, 0, 0, 1.22, 1.06, 1.1);
  });
}

export function treatmentTable(k: FurnitureKit) {
  const { m, put, box } = k;
  for (const z of [-.73, .73]) {
    for (const x of [-.342, .342]) bent(k, m.walnut, [[x, .009, z * 1.08, .035], [x * .98, .10, z * 1.04, .038], [x * .85, .41, z, .049], [x * .93, .715, z * .96, .046]]);
    box(0, .308, z, .644, .056, .056, m.oak, 0);
  }
  for (const x of [-.286, .286]) {
    box(x, .287, 0, .055, .06, 1.51, m.oak, 0);
    rail(k, [x, .326, -.64], [x, .685, -.25], .012, m.brass);
    rail(k, [x, .326, .64], [x, .685, .25], .012, m.brass);
  }
  for (const x of [-.197,0,.197]) box(x,.334,0,.168,.031,1.39,m.oak,0);
  put(foldedTowel(.42,.33,.086),m.linen,.014,.350,-.19,0,.06);
  put(board(.862, 2.055, .095, .116), m.walnut, 0, .732, 0);
  // The table has a thin bottom board and boxed foam with a piped shoulder,
  // not a bench seat sagging under an absent sitter. Its fitted crown is level.
  put(loft([rectRing(.842,2.04,.104,.779),rectRing(.890,2.116,.124,.794),rectRing(.909,2.130,.128,.808),
    rectRing(.909,2.130,.128,.867),rectRing(.917,2.139,.130,.873),rectRing(.911,2.133,.128,.880),
    rectRing(.877,2.094,.123,.900),rectRing(.830,2.044,.114,.912),rectRing(.797,2.004,.108,.914)]),m.cream,0,0,0);
  // A warm woven runner crosses the flat crown and falls down the sides at
  // unequal lengths. Left/right edge distances follow the actual piped bolster.
  const cross=[[-.463,.628],[-.462,.870],[-.460,.878],[-.441,.902],[-.416,.915],[-.398,.918],
    [-.19,.918],[.19,.918],[.398,.918],[.416,.915],[.441,.902],[.460,.878],[.462,.870],[.463,.760]];
  const columns=cross.map((_,i)=>i);
  wovenSections(put,columns,[[[-1,-.86],m.linen],[[-.86,-.80],m.sage],[[-.80,-.75],m.linen],[[-.75,.18,.64,1],m.sage]],(u,v,under)=>{
    const [x,y]=cross[u], drop=Math.max(0,.878-y), curl=drop*.038*Math.cos(v*19+(x<0?1:3));
    const back=under?.0034:0, side=Math.sign(x), wall=Math.min(1,Math.max(0,(Math.abs(x)-.395)/.065));
    return [x+side*(curl-wall*back),y+drop*.09*v-(1-wall)*back,.242+v*.49+.024*x+.044*drop*Math.sin(2*v)];
  }, (u,v)=>[.462+cross[u][0],v*.49]);
  // A loose hand towel rests on the near end, clear of the removable head cradle.
  put(foldedTowel(.47,.28,.079),m.linen,-.055,.918,.591,0,-.15);
  for (const x of [-.123, .123]) bent(k, m.steel, [[x, .766, -.945, .011], [x, .77, -1.108, .011], [x * .94, .82, -1.195, .012]]);
  // Padded crescent with a genuine breathing aperture *and* throat opening.
  const ring = Array.from({ length: 17 }, (_, i) => {
    const a = (-.32 + i / 16 * 1.64) * Math.PI, c = Math.cos(a), s = Math.sin(a), r = .042 * (.70 + .30 * Math.sin(i / 16 * Math.PI));
    return Array.from({ length: 8 }, (_, j): Point => {
      const b = j / 8 * Math.PI * 2;
      return [c * (.121 + r * Math.cos(b)), .853 + .047 * Math.sin(b), -1.189 - s * (.133 + r * Math.cos(b))];
    });
  });
  put(loft(ring), m.cream, 0, 0, 0);
}

/** A single service tray, not three identical upright bottles. The glazed
 * stoneware pump has a separate collar and outlet; the balm tin stands open,
 * its lid beside it, with a turned beech spatula resting across the tray. */
export function treatmentSupplies(k: FurnitureKit) {
  const {put,m}=k, y=.70;
  put(sectionVessel([[0,.001],[.198,0,.127],[.222,.005,.147],[.230,.020,.156],[.228,.027,.153],
    [.217,.024,.142],[.209,.009,.134],[0,.009]],14,.50),m.walnut,0,y,0);
  put(turn([[0,0],[.033,0],[.042,.008],[.043,.106],[.040,.125],[.027,.144],[.017,.146],[.017,.164]],10),m.white,-.119,y+.009,-.027);
  put(turn([[.0435,.001],[.044,.003],[.0435,.034]],10),m.sage,-.119,y+.054,-.027);
  put(turn([[.015,0],[.021,0],[.021,.017],[.009,.020],[.008,.034]],9),m.steel,-.119,y+.165,-.027);
  put(formedTube([[0,0,0,.008],[0,.009,0,.011],[.008,.013,0,.010],[.044,.012,0,.008],[.047,.008,0,.007]],6,.002,[0,0,1]),m.dark,-.119,y+.197,-.027);
  put(turn([[0,0],[.057,0],[.064,.006],[.064,.049],[.061,.054],[.055,.053],[.054,.016],[0,.014]],10),m.steel,.034,y+.009,.004);
  put(turn([[.054,0],[.053,.003],[.033,.005],[.013,.004],[0,.002]],10),m.cream,.034,y+.047,.004);
  put(turn([[.059,0],[.064,0],[.066,.005],[.066,.016],[.063,.019],[0,.019]],10),m.dark,.142,y+.009,-.069);
  put(board(.144,.019,.006,.009,.002),m.oak,.112,y+.012,.074,0,.30);
}

export function spaStorage(k: FurnitureKit) {
  const { m, put, box } = k;
  for (const x of [-.85, .85]) box(x,.98,-.016,.058,1.96,.458,m.walnut,0);
  for (let i = 0; i < 6; i++) box(-.716 + i * .288, .98, -.217, .275, 1.92, .044, m.oak, 0);
  for (let i = 0; i < 3; i++) {
    const y = .42 + .58 * i;
    put(board(1.70, .444, .045, .022), m.oak, 0, y, 0);
    if (i === 1) {
      // A folded-linen bin, with a routed hand hole *through* each end;
      // sheet ends remain visible above the lower front. No solid block inside.
      const bin=-.35;
      box(bin,y+.031,.014,.68,.016,.348,m.walnut,0);
      for(const side of [-1,1]) put(casting([[-.173,-.108],[.173,-.108],[.173,.108],[-.173,.108]],.013,[rectXY(.106,.034,.016,0,.056)]),
        m.oak,bin+side*.333,y+.14,.014,0,Math.PI/2);
      box(bin,y+.081,.182,.65,.116,.013,m.oak,0);
      box(bin,y+.137,-.152,.65,.226,.012,m.oak,0);
      for(let t=0;t<2;t++) put(foldedTowel(.51-t*.04,.302,.094),t?m.linen:m.sage,bin+.019*t,y+.040+.094*t,.011);
      put(sectionVessel([[0,0],[.071,0],[.084,.010],[.121,.069],[.122,.077],[.114,.075],[.078,.027],[0,.014]],12),m.stone,.43,y+.023,.019);
    } else {
      const count=i===0?3:1;
      for(let t=0;t<count;t++) put(foldedTowel(.55-t*.025,.355,.077),t===1?m.sage:m.linen,-.32+.013*t,y+.023+.077*t,.006*t,0,.027*t);
      if(i===2) put(towelRoll(.28,.071),m.linen,.445,y+.095,.023,0,Math.PI/2);
      else put(sectionVessel([[0,0],[.129,0,.094],[.148,.010,.116],[.154,.102,.124],
        [.150,.11,.121],[.138,.107,.110],[.130,.020,.101],[0,.015]],14,.57),m.cream,.46,y+.023,.014);
    }
  }
}
