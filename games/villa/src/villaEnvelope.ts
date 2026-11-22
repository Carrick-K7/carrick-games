import * as THREE from 'three';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import { millSection, slabFaces, type Section } from './villaArchitecturalStock.js';
import { courseSurface } from './villaFloorFinish.js';
import { faceInteriorWalls, fitRoomLining, putInteriorFloor, roomFinishes } from './villaRoomLining.js';
import { dressedCourses, dressTimber, exteriorTimber, stoneTint, sample01 } from './villaWeatheredFinish.js';
import { exteriorPane, fitExteriorGlass, flashedRoof } from './villaExteriorBuildEnvelope.js';
import { VILLA_BLOCKS, VILLA_OPENING_SCHEDULE, VILLA_SKIRTING_SPANS, type VillaMaterial, type VillaWallSpan } from './villaWorld.js';
import { VILLA_WEST_WALL as W, VILLA_EAST_WALL as E, VILLA_NORTH_WALL as N, VILLA_SOUTH_WALL as S, VILLA_GARAGE_EXTENT as G } from './villaEstateLayout.js';

export type VillaSurfaces = Record<VillaMaterial, THREE.MeshStandardMaterial> & {exteriorTimber?: THREE.MeshStandardMaterial};
const pavilion = VILLA_BLOCKS.find(v=>v.material==='roof' && v.y>7.2)!;
const outerSpan = (s: VillaWallSpan) => s.base>=7.2 || (s.axis==='x' ? s.fixed===S.inner || s.fixed===N.inner || s.fixed===G.minZ || s.fixed===G.maxZ : s.fixed===W.inner || s.fixed===E.inner || s.fixed===G.maxX);
const facadeFacing = (s: VillaWallSpan) => s.axis === 'x' ? (s.fixed === N.inner || s.fixed === G.minZ || (s.base>=7.2 && s.fixed<pavilion.z) ? Math.PI : 0)
  : s.fixed === W.inner || (s.base>=7.2 && s.fixed<pavilion.x) ? -Math.PI / 2 : Math.PI / 2;
function atSpan(b: VillaModelBuilder, s: VillaWallSpan, build: () => void) {
  const mid = (s.from + s.to) / 2;
  b.at(s.axis === 'x' ? mid : s.fixed, s.base, s.axis === 'z' ? mid : s.fixed, facadeFacing(s), build);
}
// The pressure cap and two continuous gasket grooves are the same extrusion,
// seen from the garden AND from a chair behind the glass. They enclose the cut glass edge.
const mullion: Section = [[-.027,-.064],[.027,-.064],[.027,-.049],[.018,-.043],[.018,-.027],[.025,-.027],[.025,-.014],[.011,-.014],
  [.011,.014],[.025,.014],[.025,.027],[.018,.027],[.018,.044],[.029,.049],[.029,.061],[.021,.068],[-.021,.068],[-.029,.061],
  [-.029,.049],[-.018,.044],[-.018,.027],[-.025,.027],[-.025,.014],[-.011,.014],[-.011,-.014],[-.025,-.014],[-.025,-.027],[-.018,-.027],[-.018,-.043],[-.027,-.049]];
const sill: Section = [[-.165,-.026],[-.155,-.033],[-.12,-.033],[-.12,-.021],[-.108,-.021],[-.108,-.033],
  [.105,-.033],[.105,-.020],[.115,-.020],[.115,-.034],[.167,-.034],[.175,-.022],[.175,.002],[.143,.012],[.025,.022],[-.156,.022],[-.165,.017]];
// A jamb is a single rebated piece of joinery, not a wood stripe over a doorway.
const jamb: Section = [[0,-.132],[.012,-.14],[.046,-.14],[.052,-.13],[.052,-.109],[.048,-.099],[.048,.098],[.054,.104],
  [.054,.131],[.045,.14],[.012,.14],[0,.129],[0,.076],[.009,.069],[.009,.052],[0,.046]];
const baseboard: Section = [[0,0],[.016,0],[.016,.070],[.013,.075],[.013,.08],[.006,.086],[0,.086]];
const stoneCourse: Section = [[0,0],[.039,0],[.039,.152],[.034,.163],[.021,.177],[0,.177]];
const coping: Section = [[-.225,-.094],[-.040,-.094],[.006,-.064],[.112,-.064],[.112,-.046],[.131,-.046],[.131,-.064],[.177,-.064],
  [.204,-.049],[.238,-.033],[.238,.075],[.219,.095],[-.225,.095]];

export function createVillaEnvelope(parent: THREE.Object3D, m: VillaSurfaces) {
  const shell = new VillaModelBuilder(parent, 'villa-fabric-and-joinery');
  const agedBronze = villaMaterial('#52473f', .43, .58), gasket = villaMaterial('#343736', .87);
  const interior = roomFinishes();
  const underside = villaMaterial('#ddd2bf', .94); underside.map = m.plaster.map;
  const oiledOak = m.oak.clone(); oiledOak.color.set('#b69472');
  const cutStone = m.stone.clone(); cutStone.color.set('#c4b5a1');
  const plinth=m.stone.clone(); plinth.vertexColors=true; plinth.roughness=.92; plinth.name='exterior/bedded-stone';
  const cedar=exteriorTimber(m); fitExteriorGlass(parent,m.glass);
  const ash = m.oak.clone(); ash.color.set('#d9c7ae');
  for (const v of VILLA_BLOCKS) {
    if (v.assembly === 'opening' || v.assembly === 'fin') continue;
    if (v.assembly === 'storey-slab' || v.assembly === 'ground-slab' || v.assembly === 'balcony-slab') {
      // Substrate stays just below the joints. Finished tops and soffits preserve exact support/clearance.
      const timber = v.material === 'oak', top = v.y+v.h/2, bed = timber ? .0035 : .008;
      shell.geometry(slabFaces(v.x,v.y-bed/2,v.z,v.w,v.h-bed,v.d,false,true),timber ? oiledOak : cutStone);
      const soffit=slabFaces(v.x,v.y,v.z,v.w,v.h,v.d,true);
      if(v.assembly==='storey-slab'){
        const uv=soffit.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*2.5,uv.getY(i)*2.5);
        shell.geometry(soffit,interior.ceiling);
      }else shell.geometry(soffit,underside);
      if(timber) putInteriorFloor(shell,v,top,interior);
      else {
        const length=1.48,pitch=.78;
        const flags=courseSurface(v.x,top,v.z,v.w,v.d,length,pitch,.007,.005);
        shell.geometry(dressedCourses(flags,length,pitch,top),plinth);
      }
    } else if (v.assembly === 'fascia') {
      const alongX = v.w > v.d, outside = alongX ? v.z > 0 : v.x > 0;
      const yaw = alongX ? (outside ? 0 : Math.PI) : (outside ? Math.PI / 2 : -Math.PI / 2);
      shell.at(v.x,v.y,v.z,yaw,() => shell.geometry(millSection('x',Math.max(v.w,v.d),coping),cutStone));
    } else if(v.material==='roof') {
      flashedRoof(shell,v.x,v.y,v.z,v.w,v.h,v.d,m.roof,agedBronze);
    } else if(v.material==='plaster' && v.y<7.16){
      faceInteriorWalls(shell,v,interior,m.plaster);
    } else if (v.assembly !== 'canopy') {
      shell.geometry(slabFaces(v.x,v.y,v.z,v.w,v.h,v.d), m[v.material]);
    }
  }
  for (const s of VILLA_OPENING_SCHEDULE) atSpan(shell,s,() => {
    const length = s.to - s.from, half = length / 2;
    if (s.door) {
      for (const side of [-1,1]) {
        const shape: Section = jamb.map(([w,d]) => [side * w,d]);
        shell.geometry(millSection('y',3.04,shape), oiledOak,[side*half,1.52,0]);
      }
      shell.geometry(millSection('x',length,jamb.map(([w,d])=>[d,w*1.48])),oiledOak,[0,2.96,0]);
      if(outerSpan(s)) shell.geometry(millSection('x',length,[[-.13,-.006],[.161,-.006],[.161,.002],[.098,.012],[-.105,.012],[-.13,.002]]),agedBronze,[0,0,0]);
      return;
    }
    const n = Math.ceil(length/1.65), step = length/n;
    shell.geometry(millSection('x',length+.045,sill),cutStone,[0,.300,0]);
    // Fixed lights are individually let into their glazing channels, not a thick transparent box
    // extending invisibly through every mullion. The crown, web and glazing beads enclose each edge.
    for (let i=0;i<n;i++) shell.geometry(exteriorPane(step-.034,2.622,.035),m.glass,[-half+(i+.5)*step,1.648,0]);
    for (let i=0;i<=n;i++){
      const intermediate=i>0&&i<n;
      // Hidden tag ends are *inside* both crossing pressure caps. Terminate
      // at the cap centre planes instead of triangulating a complex blind rebate.
      shell.geometry(millSection('y',intermediate?2.624:2.655,mullion,intermediate?'socketed':'closed'),agedBronze,[-half+i*step,intermediate?1.651:1.65,0]);
    }
    for (const y of [.339,2.963]) shell.geometry(millSection('x',length,mullion.map(([w,d])=>[d,w])),agedBronze,[0,y,0]);
    // One clearstory partition in each long bank breaks the grid without blocking the view.
    // A junction of two shallow cap rails, not another pane layered over the first.
    if (n >= 4) shell.geometry(millSection('x',step-.056,mullion.map(([w,d])=>[d,w*.73])),agedBronze,[half-step/2,2.426,0]);
    for (const side of [-1,1]) {
      // Interior and exterior head reveal: a recessed dark seal underneath a thin timber return.
      shell.geometry(millSection('x',length,[[-.030,-.017],[.029,-.017],[.037,-.010],[.037,.013],[-.030,.013]]),oiledOak,[0,2.997,side*.085]);
      shell.geometry(millSection('x',length,[[-.005,-.009],[.005,-.009],[.005,.009],[-.005,.009]]),gasket,[0,2.985,side*.047]);
    }
  });
  for (const s of VILLA_SKIRTING_SPANS) atSpan(shell,s,() => {
    const exterior = outerSpan(s), length = s.to-s.from;
    for (const side of [-1,1]) {
      if(exterior && side===1) {
        // A durable splash course, not timber skirting on the garden wall. Mortar
        // remains slightly recessed; capillary darkening is confined to the foot.
        const count=Math.ceil(length/1.28), step=length/count;
        for(let i=0;i<count;i++) {
          const at=-length/2+(i+.5)*step, g=millSection('x',Math.max(.005,step-.006),stoneCourse,'bedded'), p=g.getAttribute('position');
          shell.geometry(stoneTint(g,i+Math.round(s.from*17+s.fixed*23),j=>.98-(s.base===0?.28:.13)*Math.exp(-p.getY(j)/.046)),plinth,[at,.002,.11]);
        }
      } else shell.geometry(millSection('x',length,baseboard.map(([d,h])=>[side*d,h])),ash,[0,.002,side*.11]);
    }
  });
  // A cantilevered porch of folded oak: seven tall fins visibly turn out from the facade
  // into the sheltered soffit. Every upright stays against the solid pier beside the opening.
  const fins = VILLA_BLOCKS.filter(v=>v.assembly==='fin');
  const canopy = VILLA_BLOCKS.find(v=>v.assembly==='canopy')!;
  const left = Math.min(...fins.map(v=>v.x-v.w/2))-.106, right=canopy.x+canopy.w/2+.055;
  const front=canopy.z+canopy.d/2, back=canopy.z-canopy.d/2, top=canopy.y+canopy.h/2;
  const width = right-left, mid=(left+right)/2;
  const bronzeTray: Section=[[back,-.082],[front-.115,-.082],[front-.093,-.099],[front-.070,-.099],
    [front-.060,-.071],[front-.042,-.071],[front-.032,-.102],[front-.004,-.099],[front+.024,-.070],[front+.024,.009],[front-.005,.028],[back,.028]];
  shell.geometry(millSection('x',width,bronzeTray),agedBronze,[mid,top,0]);
  // Tapered forged brackets sit on the solid cheeks outside BOTH sides of the doorway.
  // The forked heel and raking underside carry the tray into the wall, not into an invisible post.
  for (const x of [left+.29, right-.24]) {
    const cheek: Section=[[S.inner+.09,top-.44],[S.inner+.155,top-.44],[S.inner+.212,top-.39],
      [S.inner+.70,top-.19],[front-.32,top-.115],[front-.23,top-.085],[S.inner+.09,top-.085]];
    shell.geometry(millSection('x',.082,cheek),agedBronze,[x,0,0]);
  }
  for (const [i,v] of fins.entries()) {
    const h=v.y+v.h/2;
    const blade: Section=[[-.034,-.066],[.034,-.066],[.034,.040],[.023,.071],[.005,.079],[-.013,.077],[-.034,.063]];
    shell.geometry(dressTimber(millSection('y',h-top-.047,blade),'y',i+10),cedar,[v.x,(h+top+.047)/2,v.z]);
    // A folded boot, with a smaller raised neck, keeps the vertical cut end out of
    // splash water and transfers its load to the plinth rather than leaving it in air.
    shell.box(v.x,.018,S.inner+.165,.087,.036,.150,agedBronze,0);
    shell.box(v.x,.041,S.inner+.165,.053,.010,.091,agedBronze,0);
  }
  const spacing=fins.length>1 ? fins[1]!.x-fins[0]!.x : .16;
  for(let i=0,x=fins[0]!.x; x<right-.048; i++,x=fins[0]!.x+i*spacing) {
    const low = i<fins.length, wall=S.inner;
    const rootY=low ? .045 : top-.159;
    const section: Section = [[wall+.098,rootY],[wall+.098,top-.079],[front-.052,top-.079],[front-.052,top-.114],
      [front-.083,top-.155],[wall+.505,top-.155],[wall+.423,top-.163],[wall+.348,top-.19],[wall+.286,top-.24],
      [wall+.238,top-(low?.312:.262)],[wall+.226,rootY]];
    const g=dressTimber(millSection('x',.073,section),'y',i+31,(_x,y)=>.97-.20*Math.exp(-y/.18));
    // The laminated lamella turns from the pier into the soffit; its fibre follows
    // that bend, not the 73 mm saw cut extruding its outline.
    const p=g.getAttribute('position'), uv=g.getAttribute('uv');
    for(let j=0;j<p.count;j++){
      const rise=p.getY(j)-rootY, run=p.getZ(j)-wall-.098;
      uv.setXY(j,(rise+run)/2.5+sample01(i,21),(p.getX(j)+Math.min(top-p.getY(j),run))/.35+sample01(i,32));
    }
    shell.geometry(g,cedar,[x,0,0]);
  }
  // A light-colored, board-lined acoustic raft singles out the northern reading area rather than
  // remodelling its open plan. Keep the authored light and all walking/door clearances below it.
  for (let i=0;i<13;i++) {
    const x=19.40+i*.52;
    shell.geometry(millSection('z',6.55,[[-.031,0],[.031,0],[.031,-.065],[.022,-.078],[-.02,-.078],[-.031,-.066]]),ash,[x,6.993,-5.02]);
  }
  fitRoomLining(shell,interior);
  shell.finish(); return shell.root;
}
