import * as THREE from 'three';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import { millSection, turnSection, type Section } from './villaArchitecturalStock.js';
import type { VillaSurfaces } from './villaEnvelope.js';
import { dressTimber, exteriorTimber } from './villaWeatheredFinish.js';
import { VILLA_RAMPS, VILLA_RAILS, villaTreadLayers, type VillaCollider } from './villaWorld.js';

const grip: Section = [[-.018,-.021],[.018,-.021],[.031,-.014],[.035,-.004],[.035,.010],[.028,.021],[.014,.026],[-.014,.026],[-.028,.021],[-.035,.010],[-.035,-.004],[-.031,-.014]];
const post: Section = [[-.018,-.017],[.018,-.017],[.018,.011],[.010,.018],[-.011,.018],[-.018,.011]];
const shoe: Section = [[-.044,0],[.044,0],[.044,.052],[.037,.065],[.019,.072],[.011,.072],[.011,.050],[-.011,.050],[-.011,.072],[-.023,.072],[-.044,.056]];

export function createVillaStairAndGuards(parent: THREE.Object3D, m: VillaSurfaces, glow: (id: string)=> THREE.Material) {
  const b=new VillaModelBuilder(parent,'villa-stair-and-balustrades');
  const nosing=m.oak.clone();nosing.color.set('#dbbc90');
  const metal=villaMaterial('#584e43',.38,.56);
  for(const r of VILLA_RAMPS) {
    const front=Math.sign(r.startZ-r.endZ), x=(r.minX+r.maxX)/2, w=r.maxX-r.minX;
    for(let i=0;i<12;i++) {
      const z = r.startZ+(r.endZ-r.startZ)*(i+.5)/12;
      const top = r.bottom+(r.top-r.bottom)*(i+1)/12, layer=villaTreadLayers(top);
      const part=(section:Section, span:number, material:THREE.Material)=>b.geometry(millSection('x',span,section.map(([d,y])=>[front*d,y])),material,[x,top,z]);
      // Return under the lip, back-cut riser and separate end-grain nose. These meet edge to edge;
      // the top remains at the measured walking height, the underside clears the lower flight.
      part([[-.25,layer.bodyBottom-top],[.201,layer.bodyBottom-top],[.226,-.134],[.226,-.064],[.24,-.052],[.24,-.04],[-.25,-.04]],w,m.plaster);
      part([[-.25,-.04],[.218,-.04],[.218,0],[-.25,0]],w+.055,m.oak);
      part([[.218,-.04],[.234,-.04],[.245,-.034],[.25,-.024],[.25,-.013],[.245,-.004],[.235,0],[.218,0]],w+.055,nosing);
      if(i%3===0) part([[.226,-.086],[.234,-.083],[.234,-.072],[.226,-.070]],w*.66,glow(`gallery-${Math.round(r.base/3.6)}`));
      // Folded side shoes support the treads from the side, never taking away headroom
      // under the open flights. The back of each shoe enters the structural tread.
      const cleat: Section=[[-.013,-.032],[.019,-.032],[.027,-.023],[.027,.005],[.016,.005],[.010,-.019],[-.013,-.019]];
      for(const side of [-1,1]) {
        b.geometry(millSection('z',.265,cleat.map(([dx,dy])=>[side*dx,dy])),metal,[x+side*(w/2+.004),layer.bodyBottom+.048,z]);
      }
    }
    for(const edge of [r.minX-.045,r.maxX+.045]) {
      const angle=-Math.atan((r.top-r.bottom)/(r.endZ-r.startZ));
      const steelWeb: Section=[[-.022,-.075],[.022,-.075],[.022,-.060],[.008,-.055],[.008,.039],[.022,.046],[.022,.059],[-.022,.059],[-.022,.046],[-.008,.039],[-.008,-.055],[-.022,-.060]];
      b.geometry(millSection('z',Math.hypot(r.top-r.bottom,r.endZ-r.startZ),steelWeb),metal,[edge,(r.top+r.bottom)/2-.040,(r.endZ+r.startZ)/2],[angle,0,0]);
      b.geometry(millSection('z',Math.hypot(r.top-r.bottom,r.endZ-r.startZ),grip),m.oak,[edge,(r.top+r.bottom)/2+1.06,(r.endZ+r.startZ)/2],[angle,0,0]);
      for(let i=0;i<=12;i+=2){
        const t=i/12,y=r.bottom+(r.top-r.bottom)*t,z=r.startZ+(r.endZ-r.startZ)*t;
        // The posts meet a real tread at its outer side. A broad shoe and little saddle bear the timber rail.
        b.geometry(millSection('y',1.038,post),metal,[edge,y+.519,z]);
        b.geometry(turnSection([[.036,0],[.039,.005],[.039,.015],[.029,.022],[.021,.025]],12),metal,[edge,y,z]);
        b.geometry(millSection('z',.070,[[-.026,-.012],[.026,-.012],[.032,-.004],[.032,.003],[-.032,.003],[-.032,-.004]]),metal,[edge,y+1.039,z],[angle,0,0]);
      }
    }
  }
  for(const base of [0,3.6]) b.geometry(millSection('x',3.8,[[-.7,-.10],[.66,-.10],[.70,-.062],[.70,.084],[.69,.10],[-.7,.10]]),m.oak,[1.2,base+1.7,-6.2]);
  for(const r of VILLA_RAILS.filter(s=>s.maxZ-s.minZ>1||s.maxX-s.minX>1)) {
    const w=r.maxX-r.minX,d=r.maxZ-r.minZ,h=r.maxY-r.minY, length=Math.max(w,d), n=Math.ceil(length/1.85), step=length/n;
    b.at((r.minX+r.maxX)/2,r.minY,(r.minZ+r.maxZ)/2,w>d?0:Math.PI/2,()=>{
      b.geometry(millSection('x',length,shoe),metal,[0,0,0]);
      b.geometry(millSection('x',length,grip),metal,[0,h,0]);
      for(let i=0;i<n;i++){
        // Each real 18mm laminated pane terminates in the base shoe, with a visible panel joint.
        const x=-length/2+step*(i+.5);
        b.box(x,(h+.040)/2,0,step-.017,h-.077,.018,m.glass,0);
        for(const side of [-1,1]) {
          const px=x+side*(step/2-.095);
          b.geometry(millSection('y',.065,[[-.036,-.015],[.036,-.015],[.036,.015],[.025,.020],[-.025,.020],[-.036,.015]]),metal,[px,.135,0]);
        }
      }
    });
  }
  return b.finish();
}

export function createVillaPergola(parent: THREE.Object3D,m:VillaSurfaces,light:THREE.Material) {
  const b=new VillaModelBuilder(parent,'villa-mortised-pergola'), colliders:VillaCollider[]=[], timber=exteriorTimber(m);
  let cut=0;
  const postSection:Section=[[-.064,-.08],[.064,-.08],[.08,-.064],[.08,.064],[.064,.08],[-.064,.08],[-.08,.064],[-.08,-.064]];
  for(const x of [-10.3,-3.1]) for(const z of [1.3,7]) {
    // Standoff shoe keeps end grain above the roof. The inset neck enters the carrying beam.
    b.geometry(millSection('y',.016,postSection.map(([u,v])=>[u*1.53,v*1.53])),m.bronze,[x,7.208,z]);
    b.geometry(millSection('y',.077,postSection.map(([u,v])=>[u*.68,v*.68])),m.bronze,[x,7.2545,z]);
    // The shoe is visibly narrower than the end grain. Two cheek plates and a
    // real side pin bear on the post, leaving an aired/draining gap beneath it.
    const pin:Section=[[0,0],[.019,0],[.019,.004],[.014,.009],[0,.009]];
    for(const side of [-1,1]) {
      const cheek:Section=[[-.062,0],[.062,0],[.062,.137],[.048,.156],[-.048,.156],[-.062,.137]];
      b.geometry(millSection('x',.008,cheek),m.bronze,[x+side*.084,7.216,z]);
      b.geometry(turnSection(pin,10),m.bronze,[x+side*.088,7.334,z],[0,0,-side*Math.PI/2]);
    }
    b.geometry(dressTimber(millSection('y',2.574,postSection),'y',cut++),timber,[x,8.58,z]);
    b.geometry(dressTimber(millSection('y',.114,postSection.map(([u,v])=>[u*.78,v*.80])),'y',cut++),timber,[x,9.924,z]);
    colliders.push({minX:x-.08,maxX:x+.08,minZ:z-.08,maxZ:z+.08,minY:7.2,maxY:9.9});
    const side=z<4?1:-1;
    const hanger: Section=[[-.066,-.034],[.063,-.034],[.084,-.015],[.084,.028],[-.015,.045],[-.066,.026]];
    b.geometry(millSection('x',.079,hanger),m.bronze,[x,9.795,z+side*.055]);
    const knee:Section=[[.016,0],[.385,.362],[.385,.412],[.265,.412],[.205,.341],[.145,.273],[.106,.235],[.065,.214],[.016,.197]];
    const brace=dressTimber(millSection('x',.072,knee.map(([u,v])=>[u*side,v])),'z',cut++);
    const p=brace.getAttribute('position'), uv=brace.getAttribute('uv');
    for(let j=0;j<p.count;j++) uv.setXY(j,(p.getY(j)+p.getZ(j)*side)*Math.SQRT1_2/2.5,(p.getX(j)+(p.getY(j)-p.getZ(j)*side)*Math.SQRT1_2)/.35);
    b.geometry(brace,timber,[x,9.44,z]);
    for(const dx of [-.081,.081]) b.geometry(turnSection([[.014,0],[.018,.002],[.018,.006],[.014,.009],[0,.009]],8),m.bronze,[x+dx,9.76,z],[0,0,dx>0?-Math.PI/2:Math.PI/2]);
  }
  for(const x of [-10.3,-3.1]) b.geometry(dressTimber(millSection('z',6.27,[[-.10,-.098],[-.083,-.116],[.083,-.116],[.10,-.098],[.10,.055],[.063,.055],[.063,.106],[-.063,.106],[-.063,.055],[-.10,.055]]),'z',cut++),timber,[x,9.95,4.15]);
  const rafter:Section=[[-3.93,.062],[-3.88,.085],[3.88,.085],[3.93,.062],[3.90,.016],[3.84,.002],[3.76,-.053],
    [3.69,-.074],[3.66,-.074],[3.66,-.040],[3.53,-.040],[3.53,-.074],[-3.53,-.074],[-3.53,-.040],[-3.66,-.040],[-3.66,-.074],[-3.69,-.074],[-3.76,-.053],[-3.84,.002],[-3.90,.016]];
  for(let z=1.1;z<=7.2;z+=.4) b.geometry(dressTimber(millSection('z',.112,rafter),'x',cut++,(_x,_y,_z,ny)=>ny>.65?1.05:.96),timber,[-6.7,10.055,z]);
  for(const z of [1.4,6.9]) {
    const path=Array.from({length:19},(_,i)=>new THREE.Vector3(-10.25+7.1*i/18,9.8-.42*Math.sin(Math.PI*i/18),z));
    b.geometry(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path),24,.009,6,false),m.bronze);
    for(let i=0;i<path.length;i+=2) {const v=path[i]!;
      b.geometry(turnSection([[.015,-.052],[.020,-.044],[.022,-.025],[.019,-.010],[.008,0]],12),m.bronze,[v.x,v.y,v.z]);
      b.geometry(turnSection([[0,-.138],[.020,-.134],[.031,-.119],[.035,-.103],[.030,-.084],[.019,-.070],[.014,-.050],[.014,-.043]],16),light,[v.x,v.y,v.z]);
    }
  }
  b.finish();return colliders;
}
