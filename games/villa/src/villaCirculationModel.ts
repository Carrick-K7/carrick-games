import * as THREE from 'three';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import { millSection, turnSection, type Section } from './villaArchitecturalStock.js';
import { turn as turnedPin } from './villaFurnitureForms.js';
import type { VillaSurfaces } from './villaEnvelope.js';
import { dressTimber, exteriorTimber, sample01 } from './villaWeatheredFinish.js';
import { VILLA_RAMPS, VILLA_RAILS, villaTreadLayers, type VillaCollider } from './villaWorld.js';

const grip: Section = [[-.018,-.021],[.018,-.021],[.031,-.014],[.035,-.004],[.035,.010],[.028,.021],[.014,.026],[-.014,.026],[-.028,.021],[-.035,.010],[-.035,-.004],[-.031,-.014]];
const post: Section = [[-.018,-.017],[.018,-.017],[.018,.011],[.010,.018],[-.011,.018],[-.018,.011]];
const shoe: Section = [[-.044,0],[.044,0],[.044,.052],[.037,.065],[.019,.072],[.011,.072],[.011,.050],[-.011,.050],[-.011,.072],[-.023,.072],[-.044,.056]];

// A 50 × 47 mm grasping section. The 11 mm underside key is milled into the
// timber, not a dark line: each post's brass tongue enters it from below.
const handstock: Section = [[-.006,-.025],[-.006,-.014],[.006,-.014],[.006,-.025],[.013,-.024],[.017,-.016],
  [.023,-.008],[.025,.001],[.023,.011],[.017,.019],[.008,.022],[-.008,.022],[-.017,.019],[-.023,.011],[-.025,.001],[-.023,-.008],[-.017,-.016],[-.013,-.024]];
const railHeight=1.025, offset=.035;
type RailPoint = [number,number,number];

/** Run the same section and its longitudinal grain through both turnbacks. Cross
 * sections stay vertical in plan, including where the incline levels into a bend. */
function sweepHandstock(path: RailPoint[]) {
  const p:number[]=[], uv:number[]=[], idx:number[]=[], centers=path.map(v=>new THREE.Vector3(...v));
  const right=new THREE.Vector3(), up=new THREE.Vector3(), section=handstock, n=section.length;
  const rings=centers.map((c,i)=>{
    const prev=centers[Math.max(0,i-1)], next=centers[Math.min(centers.length-1,i+1)];
    const tangent=c.clone().sub(prev).normalize().add(next.clone().sub(c).normalize()).normalize();
    right.set(tangent.z,0,-tangent.x).normalize(); up.crossVectors(tangent,right);
    return section.map(([x,y])=>c.clone().addScaledVector(right,x).addScaledVector(up,y).toArray());
  });
  // Share normals down the length, preserve the arrises across the milled slot.
  let around=0;
  for(let j=0;j<n;j++) {
    const k=(j+1)%n, next=around+Math.hypot(section[k][0]-section[j][0],section[k][1]-section[j][1]), base=p.length/3;
    let along=0;
    for(let i=0;i<rings.length;i++) {
      if(i) along+=centers[i].distanceTo(centers[i-1]);
      p.push(...rings[i][j],...rings[i][k]); uv.push(along/2.5,around/.32,along/2.5,next/.32);
      const a=base+2*i; if(i) idx.push(a-2,a-1,a+1,a-2,a+1,a);
    }
    around=next;
  }
  const cap=THREE.ShapeUtils.triangulateShape(section.map(([x,y])=>new THREE.Vector2(x,y)),[]);
  for(const i of [0,rings.length-1]) {
    const start=p.length/3; rings[i].forEach((v,j)=>{p.push(...v);uv.push(section[j][0]/.32,section[j][1]/.32);});
    for(const [a,b,c] of cap) idx.push(start+a,start+(i?b:c),start+(i?c:b));
  }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx);g.computeVertexNormals();return g;
}

export function createVillaStairAndGuards(parent: THREE.Object3D, m: VillaSurfaces, glow: (id: string)=> THREE.Material) {
  const b=new VillaModelBuilder(parent,'villa-stair-and-balustrades');
  const nosing=m.oak.clone();nosing.color.set('#bb966c');nosing.name='stair/end lipping';
  const hand=m.oak.clone();hand.color.set('#aa7f60');hand.roughness=.41;hand.name='stair/oiled grip';
  const tread=m.oak.clone();tread.roughness=.58;tread.name='stair / quartered tread';
  hand.userData.villaInteriorFinish=nosing.userData.villaInteriorFinish=tread.userData.villaInteriorFinish='oak';
  hand.userData.villaInteriorSwatchTint='#c09f88';nosing.userData.villaInteriorSwatchTint='#e9cfb4';tread.userData.villaInteriorSwatchTint='#f7eee0';
  const milled=(g:THREE.BufferGeometry,piece:number)=>{
    const p=g.getAttribute('position'),n=g.getAttribute('normal'),uv=g.getAttribute('uv'),u=sample01(piece,63),v=sample01(piece,35);
    for(let j=0;j<p.count;j++) {
      const a=p.getX(j),h=p.getY(j),d=p.getZ(j);
      uv.setXY(j,u+(Math.abs(n.getX(j))>.78?(d-h)/.4:a/1.8),v+(d+h)/.18);
    }return g;
  };
  const casting=villaMaterial('#42474a',.54,.32), brass=villaMaterial('#c1a47a',.34,.52),riser=villaMaterial('#b8ac95',.50,.28);
  const metal=villaMaterial('#584e43',.38,.56); // unchanged exterior guard stock
  const inner:RailPoint[]=[];
  for(const [flight,r] of VILLA_RAMPS.entries()) {
    const front=Math.sign(r.startZ-r.endZ), x=(r.minX+r.maxX)/2, w=r.maxX-r.minX;
    for(let i=0;i<12;i++) {
      const z = r.startZ+(r.endZ-r.startZ)*(i+.5)/12;
      const top = r.bottom+(r.top-r.bottom)*(i+1)/12, layer=villaTreadLayers(top);
      const part=(section:Section,span:number,material:THREE.Material)=>{
        const g=millSection('x',span,section.map(([d,y])=>[front*d,y]));
        b.geometry(material===tread||material===nosing?milled(g,24*flight+2*i+Number(material===nosing)):g,material,[x,top,z]);
      };
      // Return under the lip, back-cut riser and separate end-grain nose. These meet edge to edge;
      // the top remains at the measured walking height, the underside clears the lower flight.
      part([[-.25,layer.bodyBottom-top],[.196,layer.bodyBottom-top],[.212,-.135],[.212,-.045],[.217,-.040],[-.25,-.04]],w,m.plaster);
      // Non-slip insert beds IN a routed pocket 3 mm below the walking plane.
      part([[-.25,-.04],[.185,-.04],[.185,0],[.173,0],[.173,-.003],[.161,-.003],[.161,0],[-.25,0]],w+.055,tread);
      part([[.161,-.003],[.173,-.003],[.172,-.0006],[.162,-.0006]],w+.054,casting);
      part([[.185,-.040],[.219,-.040],[.228,-.046],[.240,-.042],[.250,-.029],[.250,-.014],[.245,-.006],[.232,0],[.185,0]],w+.055,nosing);
      // Bronze reveal under the lip; the sloped riser and 4 mm heel turn are one folded sheet.
      part([[.212,-.139],[.217,-.135],[.220,-.089],[.225,-.083],[.225,-.069],[.218,-.064],[.218,-.042],[.212,-.042]],w-.009,riser);
      if(i%3===0) part([[.225,-.082],[.226,-.081],[.226,-.072],[.225,-.071]],w*.66,glow(`gallery-${Math.round(r.base/3.6)}`));
      // Folded side shoes support the treads from the side, never taking away headroom
      // under the open flights. The back of each shoe enters the structural tread.
      const cleat: Section=[[-.021,-.013],[.050,-.013],[.057,-.002],[.057,.073],[.048,.081],[.042,.079],[.042,.005],[-.021,.005]];
      for(const side of [-1,1]) {
        b.geometry(millSection('z',.238,cleat.map(([dx,dy])=>[side*dx,dy])),casting,[x+side*w/2,layer.bodyBottom+.007,z]);
        // A pressed, chamfered hex head: the buried face and a duplicate pole
        // on every facet add no contact or silhouette.
        b.geometry(turnedPin([[.016,0],[.016,.003],[.011,.006],[0,.006]],6),brass,
          [x+side*(w/2+.057),layer.bodyBottom+.058,z],[0,0,-side*Math.PI/2]);
      }
    }
    const run=r.endZ-r.startZ, rise=r.top-r.bottom, dir=Math.sign(run);
    for(const side of [-1,1]) {
      const edge=side<0?r.minX-.045:r.maxX+.045, hx=edge-side*offset, angle=-Math.atan(rise/run);
      const steelWeb: Section=[[-.022,-.075],[.022,-.075],[.022,-.060],[.008,-.055],[.008,.039],[.022,.046],[.022,.059],[-.022,.059],[-.022,.046],[-.008,.039],[-.008,-.055],[-.022,-.060]];
      b.geometry(millSection('z',Math.hypot(rise,run),steelWeb),casting,[edge,(r.top+r.bottom)/2-.040,(r.endZ+r.startZ)/2],[angle,0,0]);
      const inboard=side===-dir, path:RailPoint[]=inboard?inner:[];
      if(!inboard || !flight) path.push([hx,r.bottom+railHeight,r.startZ]);
      for(const t of [.022,.978,1]) path.push([hx,r.bottom+railHeight+rise*t,r.startZ+run*t]);
      if(!inboard) b.geometry(sweepHandstock(path),hand);
      else if(flight+1<VILLA_RAMPS.length) {
        const next=VILLA_RAMPS[flight+1], nx=side>0?next.minX-.045+offset:next.maxX+.045-offset, radius=(nx-hx)/2;
        for(let j=1;j<=10;j++) { const a=Math.PI*j/10;path.push([hx+radius*(1-Math.cos(a)),r.top+railHeight,r.endZ+dir*Math.abs(radius)*Math.sin(a)]); }
      }
      for(let i=0;i<=12;i+=2){
        const t=i/12,y=r.bottom+rise*t,z=r.startZ+run*t;
        b.geometry(millSection('y',.938,post),casting,[edge,y+.469,z]);
        b.geometry(turnedPin([[.037,0],[.039,.013],[.026,.023],[.021,.025]],10),casting,[edge,y,z]);
        // A cast gooseneck shoulders against the post; its narrower tongue
        // disappears into the timber key. A hand fits behind the grip between saddles.
        const saddle: Section=[[-.016,-.094],[.015,-.094],[.017,-.077],[.035,-.067],[.040,-.054],[.040,-.011],
          [.030,-.011],[.030,-.047],[.025,-.054],[.002,-.060],[-.016,-.069]];
        b.geometry(millSection('z',.061,saddle.map(([d,h])=>[-side*d,h])),brass,[edge,y+railHeight,z],[angle,0,0]);
      }
    }
  }
  b.geometry(sweepHandstock(inner),hand);
  for(const base of [0,3.6]) b.geometry(milled(millSection('x',3.8,[[-.7,-.10],[.66,-.10],[.70,-.062],[.70,.084],[.69,.10],[-.7,.10]]),180+base*10),tread,[1.2,base+1.7,-6.2]);
  for(const r of VILLA_RAILS.filter(s=>s.maxZ-s.minZ>1||s.maxX-s.minX>1)) {
    const w=r.maxX-r.minX,d=r.maxZ-r.minZ,h=r.maxY-r.minY, length=Math.max(w,d), n=Math.ceil(length/1.85), step=length/n;
    b.at((r.minX+r.maxX)/2,r.minY,(r.minZ+r.maxZ)/2,w>d?0:Math.PI/2,()=>{
      b.geometry(millSection('x',length,shoe),metal,[0,0,0]);
      // Change only the inner gallery / half-landing guards. Roof edges and
      // bedroom balconies retain their original stock, sections and materials.
      const inside=r.minY<7.19 && r.minZ>-7.2 && r.maxZ<.65 && r.minX>-.96 && r.maxX<3.4;
      const rebated:Section=[[-.030,-.020],[-.013,-.032],[-.010,-.032],[-.010,-.013],[.010,-.013],[.010,-.032],[.013,-.032],
        [.030,-.020],[.033,-.006],[.031,.007],[.023,.017],[.010,.021],[-.010,.021],[-.023,.017],[-.031,.007],[-.033,-.006]];
      b.geometry(millSection('x',length,inside?rebated:grip),inside?hand:metal,[0,h,0]);
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
