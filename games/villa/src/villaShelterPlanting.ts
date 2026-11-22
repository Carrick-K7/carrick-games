import * as THREE from 'three';
import { villaTerrainGroundHeight } from './villaEstateLayout.js';
import { NatureMesh, type P3, type Collar } from './villaNatureGeometry.js';
import type { VillaCollider } from './villaWorld.js';
import { shelterFinishes } from './villaShelterPlantingMaterial.js';
import { shelterRandom, shelterTurn, shelterUnderstorey } from './villaShelterPlantingDrifts.js';

const STOOL={x:-27.9,z:22.45};
const v=(p:readonly number[])=>new THREE.Vector3(p[0],p[1],p[2]);
const at=(p:THREE.Vector3):P3=>[p.x,p.y,p.z];
const h=(a:number,reach:number,rise:number)=>new THREE.Vector3(Math.cos(a)*reach,rise,Math.sin(a)*reach);
const mix=(a:THREE.Vector3,b:THREE.Vector3,t:number)=>a.clone().lerp(b,t);
function emit(parent:THREE.Group,name:string,work:NatureMesh,material:THREE.Material){
  const geometry=work.geometry(true);geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.receiveShadow=mesh.castShadow=true;parent.add(mesh);return mesh;
}

/** Leader growth follows three different wound/weight histories. Stem #2 carries the highest
 * crown; #3 spreads laterally. Oblique real branch collars and open gaps show from below. */
const LEADERS:readonly (readonly Collar[])[]=[
  [[-.22,-.065,.07,.29],[-.29,.36,.08,.21],[-.39,1.14,.10,.17],[-.69,2.39,.20,.146],[-1.19,3.03,.48,.123],[-1.71,3.79,.78,.086],[-2.04,4.58,1.12,.051],[-2.56,5.19,1.39,.020]],
  [[.12,-.072,.13,.34],[.27,.42,.20,.23],[.44,1.26,.25,.193],[.53,2.34,.28,.16],[.43,3.42,.32,.126],[.50,4.55,.12,.092],[.82,5.58,-.04,.056],[.87,6.42,-.12,.023]],
  [[.01,-.066,-.17,.25],[.04,.37,-.28,.172],[.15,1.14,-.48,.151],[.42,2.40,-.82,.133],[1.06,2.91,-1.24,.108],[1.74,3.59,-1.47,.077],[2.40,4.08,-1.54,.048],[2.89,4.61,-1.36,.019]],
];

/** Tangent-frame collars share a continuous cylindrical chart. Cumulative metres, not ring
 * number, govern bark repeat. Small radial fluting ties roots into the older rough bark. */
function sleeve(work:NatureMesh,path:readonly THREE.Vector3[],radius:readonly number[],sides:number,phase:number,tone:number){
  let previous:number[]|undefined, distance=0;
  const axis=path[path.length-1]!.clone().sub(path[0]!).normalize();
  const ref=Math.abs(axis.z)>.82?new THREE.Vector3(1,0,0):new THREE.Vector3(0,0,1);
  for(let j=0;j<path.length;j++){
    const p=path[j]!, tangent=path[Math.min(path.length-1,j+1)]!.clone().sub(path[Math.max(0,j-1)]!).normalize();
    const u=ref.clone().cross(tangent).normalize(),w=tangent.clone().cross(u),ring:number[]=[];
    if(j)distance+=p.distanceTo(path[j-1]!);
    for(let k=0;k<=sides;k++){
      const angle=phase+k/sides*shelterTurn, r=radius[j]!*(1+.075*Math.cos(3*angle+j*.34)+.043*Math.sin(5*angle-j*.15));
      const pos=p.clone().addScaledVector(u,Math.cos(angle)*r).addScaledVector(w,Math.sin(angle)*r);
      ring.push(work.point(at(pos),tone*(.98+.045*Math.sin(2*angle+j*.21)),[phase+.72*k/sides,phase+.93*distance]));
    }
    if(previous)for(let k=0;k<sides;k++){work.tri(previous[k]!,previous[k+1]!,ring[k]!);work.tri(previous[k+1]!,ring[k+1]!,ring[k]!);}
    previous=ring;
  }
}

/** A local, arched shoot, not a treetop card. Nine UV vertices wrap a scanned-leaf twig
 * along a fixed 3D growth direction. Backfaces are lit. It never faces the camera. */
function spray(work:NatureMesh,base:THREE.Vector3,bearing:number,length:number,rise:number,chart:number,random:()=>number){
  const tip=base.clone().add(h(bearing,length,rise)),roll=(random()-.47)*2.64,twist=(random()-.5)*1.42;
  const axis=tip.clone().sub(base).normalize(), cross=new THREE.Vector3(-Math.sin(bearing),0,Math.cos(bearing));
  const bow=.043+random()*.112,lateral=(random()-.5)*.075, width=base.distanceTo(tip)*(.274+random()*.058);
  const exposure=.74+random()*.34+(base.y-4)*.019, hu=.968+random()*.078;
  const u0=.75+(chart%2)/8,v0=Math.floor(chart/2)*.5;let prior:number[]|undefined;
  for(const t of [0,.49,1]){
    const center=mix(base,tip,t).addScaledVector(cross,lateral*Math.sin(Math.PI*t));center.y+=bow*Math.sin(Math.PI*t);
    const side=cross.clone().applyAxisAngle(axis,roll+twist*t), normal=side.clone().cross(axis).normalize();const row:number[]=[];
    for(const s of [-1,0,1]){
      const p=center.clone().addScaledVector(side,s*width).addScaledVector(normal,(1-Math.abs(s))*(.005+.018*Math.sin(Math.PI*t)));
      const value=exposure*(.86+.14*t)*(s===0?1.025:1);row.push(work.point(at(p),1,[u0+(.009+(.5+.5*s)*.982)/8,v0+(.995-.99*t)*.5],[value*hu,value,value*.96]));
    }
    if(prior)for(let k=0;k<2;k++){work.tri(prior[k]!,prior[k+1]!,row[k]!);work.tri(prior[k+1]!,row[k+1]!,row[k]!);}prior=row;
  }
}

function shadeTree(parent:THREE.Group,finishes:ReturnType<typeof shelterFinishes>,colliders:VillaCollider[]){
  const root=new THREE.Group(),floor=villaTerrainGroundHeight(STOOL.x,STOOL.z);root.name='shelter/multi-stem-shade-tree';root.position.set(STOOL.x,floor,STOOL.z);parent.add(root);
  const bark=new NatureMesh(),leaves=new NatureMesh(),random=shelterRandom(1430702);
  // Buttress shoulders disappear into turf. Do not make the root flare or undergrowth a solid bed.
  for(let k=0;k<9;k++){
    const angle=k*2.399+random()*.29,foot=h(angle,.13+random()*.1,.11),mid=h(angle+.15,.39+random()*.18,.075),end=h(angle-.09,.68+random()*.35,-.046);
    sleeve(bark,[foot,mid,end],[.13,.068,.009],7,angle,.77+random()*.10);
  }
  function ramification(origin:THREE.Vector3,tip:THREE.Vector3,bearing:number,diam:number){
    const arm=tip.clone().sub(origin), elbow=origin.clone().addScaledVector(arm,.50).add(h(bearing+.8,.09,-.09));
    sleeve(bark,[origin,elbow,tip],[diam,diam*.65,.011],6,random()*4,.89+random()*.10);
    for(let k=0;k<4;k++){
      const t=.30+k*.18+random()*.12,stem=mix(t<.5?origin:elbow,t<.5?elbow:tip,t<.5?t*2:(t-.5)*2);
      const a=bearing+(k&1?1:-1)*(.43+random()*.76), reach=.55+.35*random(),point=stem.clone().add(h(a,reach,.22+.50*random()));
      const bend=mix(stem,point,.54).add(h(a+.8,.046,-.09));sleeve(bark,[stem,bend,point],[.024+.014*(1-t),.016,.0045],5,random()*5,.91);
      for(let j=0;j<4;j++){
        const u=.22+j*.222+random()*.07,takeoff=u<.54?mix(stem,bend,u/.54):mix(bend,point,(u-.54)/.46);
        const f=a+(j%2?1:-1)*random()*.97, stemTip=takeoff.clone().add(h(f,.27+.30*random(),random()*.34-.085));
        const mid=mix(takeoff,stemTip,.57).add(h(f+.5,.015,-.025));sleeve(bark,[takeoff,mid,stemTip],[.0095,.0057,.0018],3,random()*5,.90);
        for(let l=0;l<4;l++){
          const loc=mix(takeoff,stemTip,.18+l*.245),heading=f+(l%2?1:-1)*(.33+random()*.80);
          spray(leaves,loc,heading,.54+random()*.26,(random()-.46)*.58,Math.floor(random()*4),random);
        }
      }
    }
  }
  for(let j=0;j<LEADERS.length;j++){
    const leader=LEADERS[j]!, pts=leader.map(c=>v(c));sleeve(bark,pts,leader.map(c=>c[3]),13,random()*3,.94);
    for(let i=0;i<3;i++){
      const a=leader[i]!,b=leader[i+1]!, pad=Math.max(a[3],b[3])*.94;
      colliders.push({minX:STOOL.x+Math.min(a[0],b[0])-pad,maxX:STOOL.x+Math.max(a[0],b[0])+pad,minZ:STOOL.z+Math.min(a[2],b[2])-pad,maxZ:STOOL.z+Math.max(a[2],b[2])+pad,minY:floor+Math.min(a[1],b[1]),maxY:floor+b[1]});
    }
    // One sided, reaching scaffolds. Let the smaller south-eastern leader remain airy under its limb.
    const phases=[[3.95,1.91,3.18,1.30,2.84],[5.25,.91,3.71,1.91,5.86],[.41,4.68,5.54,1.07,5.91]][j]!;
    for(let q=0;q<5;q++){
      const start=pts[q+3]!, bearing=phases[q]!+(random()-.5)*.28,reach=(1.58+.52*random())*(q===4?.65:1),rise=.49+.74*random();
      const end=start.clone().add(h(bearing,reach,rise));ramification(start,end,bearing,.029+(4-q)*.011);
    }
  }
  emit(root,'shelter/root-flare-forks-and-twigs',bark,finishes.bark);
  emit(root,'shelter/fixed-leaf-bearing-shoots',leaves,finishes.foliage);
}

/** Small broadleaf stools weave through the narrow native shrubs. Fixed forklets have several
 * overlapping local sprays in three directions. The groundcover remains completely soft. */
function coppice(root:THREE.Group,finishes:ReturnType<typeof shelterFinishes>){
  const cell=new THREE.Group();cell.name='shelter/low-west-colony';cell.position.set(-31,0,20);root.add(cell);
  const stems=new NatureMesh(),blades=new NatureMesh(),rand=shelterRandom(31996);
  for(const [x,z,scale] of [[-30.8,18.85,1.04],[-29.95,19.6,.85],[-29.34,20.68,1.17],[-32.65,22.28,1.15],[-33.34,22.9,1.07],[-34.76,16.25,.92],[-34.0,16.5,.82]]){
    const base=new THREE.Vector3(x+31,villaTerrainGroundHeight(x,z)-.044,z-20),phase=rand()*6.28;
    for(let i=0;i<5;i++){
      const bearing=phase+i*2.399+rand()*.43,start=base.clone().add(h(bearing,.043,.008));
      const middle=start.clone().add(h(bearing,.13*scale,(.24+rand()*.12)*scale)),tip=middle.clone().add(h(bearing+.24,(.18+rand()*.16)*scale,(.29+rand()*.26)*scale));
      sleeve(stems,[start,middle,tip],[.019*scale,.011,.002],4,phase,.9);
      for(let j=0;j<6;j++){
        const base=mix(middle,tip,.08+j*.17),angle=bearing+(j%2?1:-1)*(.32+rand()*.99);
        spray(blades,base,angle,(.33+.16*rand())*scale,(.04+rand()*.26)*scale,(i+j)%4,rand);
      }
    }
  }
  emit(cell,'shelter/low-woody-forklets',stems,finishes.bark);emit(cell,'shelter/low-broadleaf-thickets',blades,finishes.foliage);
}

/** Static garden-owned construction. Only collide with the three woody stems below the first forks. */
export function createVillaShelterPlanting(parent:THREE.Object3D):{colliders:VillaCollider[]}{
  const root=new THREE.Group();root.name='villa-shelter-planting';parent.add(root);
  const colliders:VillaCollider[]=[],finishes=shelterFinishes();shadeTree(root,finishes,colliders);shelterUnderstorey(root,finishes.foliage);coppice(root,finishes);
  return {colliders};
}
