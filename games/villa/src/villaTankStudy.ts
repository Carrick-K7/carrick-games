import * as THREE from 'three';
import { IndexedFittingBuilder } from './villaFittingGeometry.js';
import { millSection } from './villaArchitecturalStock.js';
import { NatureMesh, margin, type P3, type Collar } from './villaNatureGeometry.js';
import { finishTexture, sample01 } from './villaWeatheredFinish.js';
import { VILLA_AQUARIUM } from './villaLivingLayout.js';

// Local metres from the centre of the existing double-aspect cabinet. The
// interior of a pane ends exactly at the silicone and the water meniscus.
const X=1.652, Z=.471, base=.735, line=2.035, crown=2.124;
const bank=(x:number,z:number)=>Math.exp(-(((x+1.02)/.51)**2+((z+.22)/.30)**2))+.8*Math.exp(-(((x-.99)/.44)**2+((z-.20)/.28)**2));
const bedY=(x:number,z:number)=>.800+.117*bank(x,z)+.010*Math.sin(5*x+2*z)+.005*Math.cos(11*z-3*x);

/** One small packed-gravel swatch in physical UVs. Each cell has its own
 * grain centre/mineral value; a dark, narrow contact sits BETWEEN grains. */
function riverGravel() {
  const size=128,cells=20,data=new Uint8Array(size*size*4), wrap=(n:number)=>(n%cells+cells)%cells;
  const seeds=Array.from({length:cells*cells},(_,i)=>[.18+.64*sample01(i,12),.18+.64*sample01(i,13),sample01(i,93),sample01(i,94)]);
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const a=(x+.5)*cells/size,b=(y+.5)*cells/size,u=Math.floor(a),v=Math.floor(b);let d=10, next=10, chosen=seeds[0];
    for(let j=v-1;j<=v+1;j++) for(let i=u-1;i<=u+1;i++) {
      const s=seeds[wrap(i)+wrap(j)*cells], q=(a-i-s[0])**2+(b-j-s[1])**2;
      if(q<d){next=d;d=q;chosen=s;}else if(q<next) next=q;
    }
    const contact=Math.max(0,1-7*(next-d)), l=194+53*chosen[2]-37*contact-12*Math.min(1,d)+6*sample01(x,y), ochre=chosen[3]-.5, i=4*(y*size+x);
    data[i]=l+8*ochre;data[i+1]=l;data[i+2]=l-10*ochre;data[i+3]=255;
  }
  return finishTexture('tank / 0.18 m of mixed river grit',size,size,data);
}
function substrate() {
  const m=new NatureMesh(),rows:number[][]=[], nx=40,nz=12, sand=new THREE.Color('#d9c6a5'), silt=new THREE.Color('#726659'), mix=new THREE.Color();
  const point=(x:number,y:number,z:number,wall=false)=>{
    const gravel=THREE.MathUtils.clamp(.27+.59*Math.sin(2.27*x-1.85*z+.54)+bank(x,z)*.74,0,1);
    mix.copy(sand).lerp(silt,gravel).multiplyScalar(wall?.65:.95+.045*Math.sin(35*x+21*z));
    return m.point([x,y,z],1,wall?[(x+z)/.18,y/.18]:[x/.18,z/.18],[mix.r,mix.g,mix.b]);
  };
  for(let j=0;j<=nz;j++) {
    const row:number[]=[],z=Z*(2*j/nz-1);
    for(let i=0;i<=nx;i++) {const x=X*(2*i/nx-1);row.push(point(x,bedY(x,z),z));}
    if(j) for(let i=0;i<nx;i++) {const a=rows[j-1][i],b=rows[j-1][i+1];m.tri(a,row[i],b);m.tri(row[i],row[i+1],b);}
    rows.push(row);
  }
  // The actual section against all four panes; no solid plinth hiding the front face.
  const border=[...rows[0],...rows.slice(1).map(r=>r[nx]),...rows[nz].slice(0,-1).reverse(),...rows.slice(1,-1).reverse().map(r=>r[0])];
  const lower=border.map(i=>{const x=m.positions[i*3],z=m.positions[i*3+2];return [point(x,base,z,true),point(x,m.positions[i*3+1],z,true)];});
  lower.forEach(([a,b],i)=>{const [c,d]=lower[(i+1)%lower.length];m.tri(a,b,d);m.tri(a,d,c);});
  return m.geometry(true);
}

function waterTop() {
  const g=new NatureMesh(), rows:number[][]=[];
  // Keep actual returns at the panes; the narrow edge bands are millimetres,
  // not a centimetre-scale polyline floating across the side glass.
  const axis=(half:number,n:number)=>[-half,-half+.006,...Array.from({length:n+1},(_,i)=>(2*i/n-1)*(half-.024)),half-.006,half];
  const xs=axis(X,48),zs=axis(Z,16);
  zs.forEach((z,j)=>{const row:number[]=[];
    xs.forEach((x,i)=>{
      const d=Math.min(X-Math.abs(x),Z-Math.abs(z)), fall=1-Math.exp(-d/.036);
      let ripple=.0008*Math.sin(5*x+9*z)+.00065*Math.cos(7*x-11*z);
      for(const a of [-1.42,1.38]) {const r=Math.hypot(x-a,z+.21);ripple+=.0031*Math.cos(r*47)*Math.exp(-r*3.6);}
      row.push(g.point([x,line+.0055*Math.exp(-d/.007)+fall*ripple,z]));
      if(i&&j) {const a=rows[j-1][i-1],b=rows[j-1][i];g.tri(a,row[i-1],b);g.tri(row[i-1],row[i],b);}
    });rows.push(row);
  });return g.geometry();
}
/** Only the entry side of the water column tints a view; there is no second
 * blended exit face. End-on sight lines traverse 3.3 m, broadside less than
 * one metre. Vertices carry optical density, not the image of the room beyond. */
function waterSides() {
  const p:number[]=[],rgba:number[]=[],idx:number[]=[];
  const low=new THREE.Color('#52908b'),high=new THREE.Color('#9dbfba');
  const corners=[[-X,-Z],[-X,Z],[X,Z],[X,-Z]];
  for(let j=0;j<4;j++) {
    const a=corners[j],b=corners[(j+1)%4], end=a[0]===b[0], n=p.length/3;
    for(const y of [base,line+.0055]) for(const [x,z] of [a,b]) {
      p.push(x,y,z);const c=y===base?low:high;rgba.push(c.r,c.g,c.b,(end?.96:.62)*(y===base?1:.63));
    }
    idx.push(n,n+1,n+3,n,n+3,n+2);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('color',new THREE.Float32BufferAttribute(rgba,4));g.setIndex(idx);g.computeVertexNormals();return g;
}

/** Strata emerge from the gravel rather than levitating above it. Separate
 * low stones, a twisted root with buried toes, and rooted/epiphytic leaves
 * form two islands; the centre and the upper water stay open both ways. */
function aquascape(b:IndexedFittingBuilder, random:()=>number) {
  // Preserve the surrounding furnishing maker's deterministic stream (3
  // samples per washed cobble, one per crown), including downstream planting.
  const gravel=Array.from({length:48},()=>[random(),random(),random()]);
  const shoots=Array.from({length:21},()=>random());
  const rock=new NatureMesh(),roots=new NatureMesh(),foliage=new NatureMesh();foliage.membrane=true;
  function stone(x:number,z:number,sx:number,sy:number,sz:number,seed:number) {
    const n=6+(seed%3),y=bedY(x,z)-sy*.30,turn=sample01(seed,137)*6.28;
    const ring=Array.from({length:n},(_,i)=>{const a=turn-2*Math.PI*(i+.25*sample01(i,seed))/n,l=.85+.25*sample01(i,seed+11);return [Math.cos(a)*l,Math.sin(a)*l];});
    const rows:P3[][]=[[[x,y-.005,z]]];
    for(const [h,scale,shift] of [[.12,.89,.00],[.42,1,.06],[.80,.76,.15],[.91,.64,.21]]) rows.push(ring.map(([u,v],i):P3=>
      [x+sx*(u*scale+shift),y+sy*(h+.16*u+.055*Math.sin(i+seed)),z+sz*(v*scale-.05*h)]));
    rows.push([[x+sx*.26,y+sy,z+sz*.09]]);rock.tone=.69+.31*sample01(seed,38);rock.skin(rows,(j,i)=>j===3?.76+.15*sample01(i,seed):.87+.12*sample01(i,seed+31));
  }
  gravel.forEach(([size,u,v],i)=>stone((u-.5)*3.16,(v-.5)*.83,.010+size*.016,.009+size*.010,.008+size*.010,i));
  for(const [x,z,sx,sy,sz,seed] of [[-1.11,-.14,.202,.215,.12,55],[-1.34,.016,.115,.123,.106,57],[-.81,-.275,.135,.177,.12,58],
    [.95,.115,.215,.226,.135,62],[1.26,.29,.167,.146,.121,63],[.68,.224,.104,.10,.077,65],[-.32,.11,.072,.059,.051,66]]) stone(x,z,sx,sy,sz,seed);
  const rootPath=(path:Collar[],seed:number)=>{roots.tone=.78+.22*sample01(seed,391);roots.stem(path,8,.11+sample01(seed,29)*.07,seed*.83,true);};
  for(const [x,z,side] of [[-1.08,-.24,1],[1.09,.19,-1]]) {
    // Upright snag in the rear-left bank, a lower, longer piece fallen across
    // the front-right shoal. Their exposed wood does not mirror across the path.
    const at=(u:number,h:number,v:number,r:number):Collar=>{
      const px=x+u*side*(side>0?.88:1.18), pz=z+v+(side>0?-.025:.065)*Math.sin(4*u);
      return [px,bedY(px,pz)+h*(side>0?1.12:.63),pz,r*(side>0?.90:1.02)];
    };
    const trunk=[at(-.24,-.023,.026,.024),at(-.13,.086,.015,.059),at(.015,.155,-.017,.083),at(.12,.249,-.042,.053),at(.27,.290,-.047,.037),
        at(.41,.345,-.050,.024),at(.53,.455,-.072,.015),at(.63,.477,-.089,.008),at(.71,.511,-.106,0)];
    rootPath(trunk,71+side);
    for(let j=0;j<6;j++) {const a=j*1.07+.2,l=.21+.082*sample01(j,41),c=Math.cos(a),s=Math.sin(a);
      rootPath([trunk[2],at(.04+c*l*.32,.087,s*.08,.039),at(.05+c*l*.82,.036,s*.17,.025),at(.05+c*l,.045,s*.18,.013),at(.07+c*l*1.25,-.012,s*.21,.004)],j+31);}
    rootPath([trunk[3],at(.20,.32,.009,.025),at(.29,.363,.048,.014),at(.35,.430,.074,0)],44+side);
    rootPath([trunk[5],at(.48,.380,-.124,.013),at(.57,.375,-.150,.007),at(.66,.420,-.161,0)],56+side);
    if(side>0) {
      const crotch=at(.146,.403,-.105,.016);
      rootPath([trunk[3],at(.115,.328,-.081,.028),crotch,at(.130,.491,-.150,.009),at(.180,.568,-.164,.003),at(.214,.582,-.172,0)],93);
      rootPath([crotch,at(.232,.475,-.100,.009),at(.304,.504,-.099,.005),at(.340,.558,-.130,0)],94);
    } else rootPath([trunk[4],at(.320,.315,.054,.021),at(.42,.243,.121,.012),at(.53,.103,.163,.006),at(.55,-.006,.172,0)],97);
    // Anubias-like epiphytes hold to a wet shoulder. Separate petioles carry
    // broad, cupped leaves above the twig; they do not sprout out of thin air.
    for(const j of side>0?[2,3,5]:[2,4]) {
      const [px,py,pz,r]=trunk[j];
      for(let k=0;k<6;k++) {
        const a=k*2.40+j+.7*side, ux=Math.cos(a),uz=Math.sin(a),v=.044+.035*sample01(j,k), h=.046+.033*sample01(k,j);
        const stem:Collar=[px+ux*v,py+r*.83+h,pz+uz*v,.0028];
        roots.stem([[px,py+r*.52,pz,.0045],stem],5,0,0,true);
        foliage.tone=.91+.09*sample01(j,k+14);foliage.blade([stem[0],stem[1],stem[2]],[ux*(v+.024),h*.54,uz*(v+.024)],
          .021+.009*sample01(k,j+14),margin.ovate,.019,.32*Math.sin(a),.25,.009,[ux*.15,1,uz*.15]);
      }
    }
  }
  // Strapgrass and shorter crypt rosettes emerge directly from the gravel.
  shoots.forEach((s,i)=>{
    const side=i%2===0?-1:1, x=side*(.76+.70*sample01(i,47)),z=side*(.18+.17*sample01(i,55)),y=bedY(x,z)-.004;
    const tall=i%3===0, n=tall?6:5;
    for(let k=0;k<n;k++) {
      const a=k*2.4+s*5, extent=.045+.089*sample01(k,i+55),height=(tall?.21:.079)+(tall?.27:.145)*sample01(i,k+467);
      foliage.tone=.68+.32*sample01(i,k+66);foliage.blade([x,y,z],[Math.sin(a)*extent,height,Math.cos(a)*extent],
        tall?.007+s*.005:.010+s*.011,tall?margin.strap:margin.ovate,.017,.8*Math.sin(a),.29,.015*Math.cos(a),[Math.sin(a+.64),0,Math.cos(a+.64)]);
    }
  });
  const wet=new THREE.MeshStandardMaterial({color:'#77786c',roughness:.69,vertexColors:true});wet.name='tank / river stone';
  const bogwood=new THREE.MeshStandardMaterial({color:'#85664c',roughness:.76,vertexColors:true});bogwood.name='tank / branching bogwood';
  const herb=new THREE.MeshStandardMaterial({color:'#91a567',roughness:.69,vertexColors:true,side:THREE.DoubleSide});herb.name='tank / rooted leaves';
  const wood=roots.geometry(true), colors=wood.getAttribute('color'),normals=wood.getAttribute('normal'),p=wood.getAttribute('position');
  for(let i=0;i<p.count;i++){const top=.79+.21*normals.getY(i),f=colors.getX(i)*top*(.92+.08*Math.sin(42*p.getX(i)-53*p.getZ(i)));colors.setXYZ(i,f*1.04,f,f*.91);}
  const leaves=foliage.geometry(true),shade=leaves.getAttribute('color'),lv=leaves.getAttribute('position');
  for(let i=0;i<lv.count;i++){const t=THREE.MathUtils.clamp((lv.getY(i)-bedY(lv.getX(i),lv.getZ(i)))*1.9,0,1),f=shade.getX(i)*(.67+.35*t);
    shade.setXYZ(i,f*(.80+.45*t),f*1.15,f*(.92-.28*t));}
  b.geometry(rock.geometry(true),wet);b.geometry(wood,bogwood);b.geometry(leaves,herb);
}

export function createVillaTankStudy(parent:THREE.Object3D,random:()=>number) {
  const b=new IndexedFittingBuilder(parent,'aquarium / planted glasswork');b.root.position.set(VILLA_AQUARIUM.x,0,VILLA_AQUARIUM.z);
  const glass=new THREE.MeshStandardMaterial({color:'#d1e1dd',roughness:.12,metalness:.07,transparent:true,opacity:.059,depthWrite:false});glass.name='tank / low iron glass';
  const seal=new THREE.MeshStandardMaterial({color:'#516764',roughness:.59,metalness:0});seal.name='tank / silicone return';
  const column=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.42,vertexColors:true,transparent:true,opacity:.26,depthWrite:false});column.name='tank / water depth';
  const surface=new THREE.MeshStandardMaterial({color:'#9bbdb7',roughness:.12,metalness:.20,transparent:true,opacity:.23,depthWrite:false,side:THREE.DoubleSide});
  surface.forceSinglePass=true;surface.name='tank / water surface';
  // FrontSide on closed glass stock emits only its entering face, from either
  // viewing aisle. No transmission, second back-face pass or opaque backdrop.
  const mid=(base+crown)/2;
  for(const s of [-1,1]) {
    b.box(0,mid,s*(Z+.006),2*X+.024,crown-base,.012,glass,0);
    b.box(s*(X+.006),mid,0,.012,crown-base,2*Z,glass,0);
    for(const t of [-1,1]) {
      const fillet: [number,number][]=[[0,0],[-.012,0],[-.007,-.001],[-.004,-.003],[-.002,-.006],[0,-.012]];
      b.geometry(millSection('y',crown-base,fillet.map(([u,v])=>[s*u,t*v])),seal,[s*X,mid,t*Z]);
    }
  }
  b.geometry(waterSides(),column);b.geometry(waterTop(),surface);
  const grain=riverGravel(),bed=new THREE.MeshStandardMaterial({map:grain,bumpMap:grain,bumpScale:.0011,roughness:.79,vertexColors:true});bed.name='tank / planted substrate';
  b.geometry(substrate(),bed);aquascape(b,random);return b.finish();
}
