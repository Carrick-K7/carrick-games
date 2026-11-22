import * as THREE from 'three';
import { board, casting, loft, oval, rail, type FurnitureKit, type Point } from './villaFurnitureForms.js';
import { HOUSE_PRINT, inkUV, type PrintTile } from './villaDomesticArt.js';

/** A cut unit with a square bed, small bruised arris and a flat, independently
 * lit face. Embedded firebrick has no invisible rear face down in its mortar. */
function unit(outline:number[][],depth:number,arris:number,back=true){
  const xy=outline.map(([x,y])=>new THREE.Vector2(x,y));if(THREE.ShapeUtils.isClockWise(xy))xy.reverse();
  const centre=xy.reduce((v,p)=>v.add(p),new THREE.Vector2()).multiplyScalar(1/xy.length);
  const n=xy.length, pts:number[]=[],uv:number[]=[];
  const layers=[xy.map(p=>[p.x,p.y,-depth/2]),xy.map(p=>[p.x,p.y,depth/2-arris]),xy.map(p=>{
    const v=centre.clone().sub(p),sx=Math.sign(v.x)*Math.min(Math.abs(v.x)*.4,arris*.68),sy=Math.sign(v.y)*Math.min(Math.abs(v.y)*.4,arris*.82);return [p.x+sx,p.y+sy,depth/2];
  })];
  function tri(a:number[],b:number[],c:number[]){for(const p of [a,b,c]){pts.push(...p);uv.push(p[0],p[1]);}}
  for(let j=0;j<2;j++)for(let i=0;i<n;i++){const l=layers[j],u=layers[j+1],next=(i+1)%n;tri(l[i],l[next],u[next]);tri(l[i],u[next],u[i]);}
  for(const [a,b,c] of THREE.ShapeUtils.triangulateShape(xy,[])){tri(layers[2][a],layers[2][b],layers[2][c]);if(back)tri(layers[0][c],layers[0][b],layers[0][a]);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();return g;
}
const rect=(w:number,h:number,chip:number)=>[[-w/2,-h/2],[w/2-chip,-h/2],[w/2,-h/2+chip*.72],[w/2,h/2],[-w/2+chip*.47,h/2],[-w/2,h/2-chip*.42]];
function masonryUV(g:THREE.BufferGeometry,w:number,h:number,variant:number,tile:PrintTile){
  const p=g.getAttribute('position'),uv=g.getAttribute('uv'),n=g.getAttribute('normal');
  for(let i=0;i<p.count;i++){
    const x=Math.abs(n.getZ(i))>.4 ? .5+p.getX(i)/w :.5+p.getZ(i)/(w*.66);
    const y=Math.abs(n.getY(i))>.8 ? .5+p.getZ(i)/(h*1.2):.5+p.getY(i)/h;
    const offset=.02+.065*((variant+13)%4);uv.setXY(i,...inkUV(tile,offset+.72*(variant&1?1-x:x),.03+.14*((variant+28)%3)+.67*y));
  }
  return g;
}
function firebrick(k:FurnitureKit,press:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number,no:number,yaw=0){
  const g=unit(rect(w,h,.005+(no+5)%4*.0013),d,.0035,false);
  k.put(masonryUV(g,w,h,no,HOUSE_PRINT.brick),press,x,y,z,0,yaw);
}
function fuel(k:FurnitureKit,press:THREE.Material,x:number,y:number,z:number,len:number,r:number,yaw:number,roll:number,no:number){
  const outline=[[-.88,-.59],[-.31,-.85],[.38,-.93],[.84,-.61],[1,.06],[.47,.64],[-.19,.86],[-.65,.55],[-.42,.31],[-.81,.39]],N=outline.length;
  const pts:number[]=[],uv:number[]=[];
  const ring=(j:number)=>outline.map(([a,b],i)=>[r*(a*(.95+.04*j)+.043*Math.sin(i+j*2+no)), r*(b+.08*Math.cos(i*.86+j+no)),len*(j/2-.5)+(j!==1?.011*Math.sin(i*2.1+no):0)]);
  const ends=[ring(0),ring(1),ring(2)];
  const add=(points:number[][],chart:[number,number][],tile:PrintTile)=>{points.forEach((p,i)=>{pts.push(...p);uv.push(...inkUV(tile,...chart[i]));});};
  for(let j=0;j<2;j++)for(let i=0;i<N;i++){
    const n=(i+1)%N,l=ends[j],h=ends[j+1],u0=i/N,u1=(i+1)/N,v0=j/2,v1=(j+1)/2;
    add([l[i],l[n],h[n]],[[u0,v0],[u1,v0],[u1,v1]],HOUSE_PRINT.char);add([l[i],h[n],h[i]],[[u0,v0],[u1,v1],[u0,v1]],HOUSE_PRINT.char);
  }
  for(const j of [0,2]){
    const p=ends[j],center=[0,0,len*(j/2-.5)+(j===0?.009:-.007)];
    for(let i=0;i<N;i++){const a=j===2?i:(i+1)%N,b=j===2?(i+1)%N:i;
      add([center,p[a],p[b]],[[.47,.46],[.5+p[a][0]/(2.29*r),.5+p[a][1]/(2.29*r)],[.5+p[b][0]/(2.29*r),.5+p[b][1]/(2.29*r)]],HOUSE_PRINT.endGrain);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();
  k.put(g,press,x,y,z,0,yaw,roll);
}
export function fireplace(k:FurnitureKit,backZ:number,press:THREE.Material=k.m.dark){
  const {m,put,box}=k,spring=.941,a=.932,b=.387;
  const arc=(u:number,outer=false)=>[(a+(outer?.221:0))*Math.cos(u),spring+(b+(outer?.176:0))*Math.sin(u)];
  const outline=[[-1.25,.018],[-1.25,3.4],[1.25,3.4],[1.25,.018],[a,.018],...Array.from({length:17},(_,i)=>arc(i*Math.PI/16)),[-a,.018]];
  put(casting(outline,.42),m.cream,0,0,backZ+.21);
  box(0,.711,backZ+.03,1.94,1.36,.06,m.dark,0);
  const from=-.924,to=.924,rh=.160,pitch=.318;
  for(let row=0;row<7;row++)for(let col=-1;col<7;col++){
    const x0=Math.max(from,from+(col+(row%2)*.5)*pitch),x1=Math.min(to,from+(col+1+(row%2)*.5)*pitch);
    if(x1-x0<.04)continue;
    firebrick(k,press,(x0+x1)/2,.286+row*rh,backZ+.083,x1-x0-.005,rh-.005,.047,row+col+4);
  }
  for(const side of [-1,1]){
    // The former black pier liner stood proud of all its stone. Here the
    // return is BEHIND the jamb and reads down the throat, not on the ashlar.
    box(side*.949,.622,.169,.057,.84,.872,m.dark,0);
    for(let r=0;r<5;r++)for(let c=-1;c<3;c++){
      const z0=Math.max(-.216,-.216+(c+.5*(r%2))*.339),z1=Math.min(.624,-.216+(c+1+.5*(r%2))*.339);
      if(z1-z0<.04)continue;
      firebrick(k,press,side*.912,.286+r*rh,(z0+z1)/2,z1-z0-.005,rh-.005,.044,r*3+c+7,-side*Math.PI/2);
    }
    // Ashlar bed joints: three staggered stones, not black painted grooves.
    for(let j=0;j<3;j++){
      const w=.276+(j===0?.035:j===2?.011:0),h=j===0?.225:.229;
      put(unit(rect(w,h,.009+j*.003),.696,.009),m.stone,side*(a+w/2),.221+.115+.235*j,.292+(j===1?.006:0));
    }
    put(board(.351,.739,.063,.017,.014),m.stone,side*1.076,spring+.005,.308);
  }
  const n=13;
  for(let i=0;i<n;i++){
    const u=i*Math.PI/n+.0022,v=(i+1)*Math.PI/n-.0022,key=i===6,mid=(u+v)/2,top=arc(mid,true);if(key)top[1]+=.034;
    put(unit([arc(u),arc(mid),arc(v),arc(v,true),top,arc(u,true)],key?.647:.620,.0038),m.stone,0,0,.325+(i%3)*.0018);
  }
  for(const x of [-1.13,1.13])put(casting([[-.127,.006],[.128,.006],[.13,.321],[.071,.317],[.041,.248],[-.012,.182],[-.062,.125],[-.127,.108]],.158),m.stone,x,1.153,.310,0,-Math.PI/2);
  put(board(2.69,.713,.074,.025,.026),m.stone,0,1.482,.308);
  put(board(2.825,.780,.080,.031,.018),m.stone,0,1.551,.310);
  // Three properly cut flagstones on a low bed. The internal joints return
  // down the nosing; limestone, firebrick and soft lime are different surfaces.
  put(board(2.77,.823,.151,.051,.024),m.stone,0,.076,.338);
  const cuts=[-1.417,-.432,.526,1.417];
  for(let i=0;i<3;i++){
    const l=cuts[i],r=cuts[i+1];put(unit(rect(r-l-.005,.849,i===1?.005:.031),.070,.0052),m.stone,(r+l)/2,.186,.339,-Math.PI/2);
  }
  const ashRing=(s:number,y:number)=>oval(1.68*s,.594*s,y,19).map(([x,yy,z],i):Point=>[x*(1+.047*Math.sin(i*1.7)),yy+.0018*Math.sin(i*2.37),z*(1+.091*Math.cos(i*2.1))]);
  const ash=loft([ashRing(1,.221),ashRing(.94,.230),ashRing(.62,.248),ashRing(.22,.242)],false,true),ap=ash.getAttribute('position'),au=ash.getAttribute('uv');
  for(let i=0;i<ap.count;i++)au.setXY(i,...inkUV(HOUSE_PRINT.ash,.5+ap.getX(i)/1.81,.5+ap.getZ(i)/.70));put(ash,press,0,0,.344);
  for(let i=0;i<12;i++){
    const w=.033+.027*((i*13)%7)/6,h=.011+.012*(i%4),angle=i*2.38;
    const cl=loft([oval(w*1.2,w*.68,0,5),oval(w,w*.63,h*.52,5),oval(w*.39,w*.28,h,5)],false,true);
    put(cl,i%4?m.dark:m.stone,Math.cos(angle)*(.22+.045*i),.237,.347+Math.sin(angle)*.233,0,angle);
  }
  for(const x of [-.616,.616]){
    rail(k,[x,.224,.127],[x,.325,.211],.019,m.black,6);rail(k,[x,.224,.590],[x,.325,.534],.019,m.black,6);
    rail(k,[x,.321,.135],[x,.324,.61],.020,m.black,6);
  }
  for(let i=0;i<4;i++)rail(k,[-.730,.328,.183+i*.113],[.730,.328,.183+i*.113],.014,m.black,6);
  fuel(k,press,-.165,.414,.32,1.046,.088,1.61,.014,1);fuel(k,press,.103,.409,.483,1.175,.077,1.46,-.032,3);
  fuel(k,press,.124,.495,.37,.859,.070,1.10,-.065,5);
}
export const HEARTH_FLAMES=[[-.531,.411,.331,.094,.257],[-.317,.442,.453,.133,.362],[-.068,.481,.337,.115,.327],[.177,.453,.432,.160,.445],[.443,.456,.422,.093,.269]] as const;
/** The hot band clings to the fuel. Thin, asymmetric copper tips, a brighter
 * inner foot and a cool shaded reverse under additive light, not seven identical
 * opaque yellow shapes. Geometry and vertex colour stay fixed during the tick. */
export function flameTongue(index:number){
  const sign=index%2?1:-1;
  const ring=(s:number,y:number,dx:number,dz:number)=>oval(2*s,1.63*s,y,7).map(([x,yy,z],i):Point=>[dx+x*(1+.09*Math.sin(i+index)), yy+.034*s*Math.sin(i*2.1+index),dz+z]);
  const g=loft([ring(.21,.0,0,0),ring(.80,.13,.03,0),ring(.91,.29,-sign*.10,.02),ring(.49,.48,sign*.06,0),ring(.32,.69,sign*.26,.05),ring(.12,.86,sign*.18,-.03),ring(.017,1.06,sign*.43,-.06)]);
  const p=g.getAttribute('position'),rgb:number[]=[];
  for(let i=0;i<p.count;i++){
    const t=Math.max(0,Math.min(1,p.getY(i))),edge=Math.min(1,Math.abs(p.getX(i))*.85),hot=Math.max(0,1-Math.abs(t-.21)*2.25)*(1-edge*.64);
    rgb.push(.47+.52*hot-.19*t,.13+.51*hot-.075*t,.016+.15*hot);
  }
  g.setAttribute('color',new THREE.Float32BufferAttribute(rgb,3));return g;
}
