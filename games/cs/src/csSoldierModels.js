import * as T from 'three';
import {chargingGrip} from './csWeaponDeploy.js';

// Authored anatomy and clothing, referenced to Valve's SAS / Phoenix turnarounds.
// Model coordinates are metres, with soles at zero and forward along -Z.
const UP=new T.Vector3(0,1,0);
function weave(){const a=new Uint8Array(64*64*4);let seed=813;for(let i=0;i<4096;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const x=i%64,y=i>>6,v=214+(seed%16)+((x+y)%2?12:0);a.set([v,v,v,255],i*4);}const t=new T.DataTexture(a,64,64);t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(5,5);t.colorSpace=T.SRGBColorSpace;t.needsUpdate=true;return t;}
const fabric=weave();
const mat=(color,roughness=.88,metalness=0,cloth=false)=>new T.MeshStandardMaterial({color,roughness,metalness,...(cloth?{map:fabric}:{})});
const shared={rubber:mat(0x151918,.94),hardware:mat(0x72796e,.48,.48),glove:mat(0x2c302b,.97),skin:mat(0xac7f5e,.86),eye:mat(0x252b29,.26),glass:mat(0x4d6866,.22,.36)};
// Each faction wears one matching long-sleeve uniform. Armour stays invisible.
const uniform=(color,foldColor)=>{const cloth=mat(color,.94,0,true);return {cloth,pants:cloth,hood:cloth,fold:mat(foldColor,.96,0,true),boot:mat(0x343534,.88)};};
const palettes={ct:uniform(0x364958,0x30414f),t:uniform(0x94846a,0x86775e)};
function mesh(g,geo,m,x=0,y=0,z=0){const o=new T.Mesh(geo,m);o.position.set(x,y,z);g.add(o);return o;}
function ellipsoid(g,m,p,s){const o=mesh(g,new T.SphereGeometry(1,16,10),m,...p);o.scale.set(...s);return o;}
function rounded(g,m,p,size,r=.008){const [w,h,d]=size,s=new T.Shape(),x=-w/2,y=-h/2;r=Math.min(r,w*.2,h*.2,d*.35);s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);const geo=new T.ExtrudeGeometry(s,{depth:d-2*r,bevelEnabled:true,bevelSize:r,bevelThickness:r,bevelSegments:2,curveSegments:3,steps:1});geo.translate(0,0,-d/2+r);return mesh(g,geo,m,...p);}
function rod(g,m,a,b,r1,r2=r1){const start=new T.Vector3(...a),end=new T.Vector3(...b),d=end.clone().sub(start),o=mesh(g,new T.CylinderGeometry(r2,r1,d.length(),12),m);o.position.copy(start.add(end).multiplyScalar(.5));o.quaternion.setFromUnitVectors(UP,d.normalize());return o;}
function disc(g,m,x,y,z,r,depth){const o=mesh(g,new T.CylinderGeometry(r,r,depth,20),m,x,y,z);o.rotation.x=Math.PI/2;return o;}
// Tailored ring profiles avoid the swollen capsule silhouette of the old model.
function loft(g,m,rings,segments=18,fold=.0){const p=[],uv=[],idx=[];for(let j=0;j<rings.length;j++){const [y,rx,rz,cx=0,cz=0]=rings[j];for(let i=0;i<=segments;i++){const a=i/segments*Math.PI*2,f=1+fold*Math.sin(a*5+j*1.9);p.push(cx+Math.cos(a)*rx*f,y,cz+Math.sin(a)*rz*f);uv.push(i/segments,j/(rings.length-1));if(j&&i){const k=j*(segments+1)+i;idx.push(k-1,k,k-segments-1,k-1,k-segments-1,k-segments-2);}}}for(const j of [0,rings.length-1]){const [y,,,x=0,z=0]=rings[j],c=p.length/3;p.push(x,y,z);uv.push(.5,.5);for(let i=0;i<segments;i++){const k=j*(segments+1)+i;idx.push(c,...(j?[k+1,k]:[k,k+1]));}}if(rings.at(-1)[0]<rings[0][0])for(let i=0;i<idx.length;i+=3){const n=idx[i+1];idx[i+1]=idx[i+2];idx[i+2]=n;}const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(p,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(idx);geo.computeVertexNormals();return mesh(g,geo,m);}
function batch(g){const buckets=new Map();for(const o of [...g.children]){if(!o.isMesh)continue;o.updateMatrix();const c=o.geometry.clone().applyMatrix4(o.matrix),geo=c.index?c.toNonIndexed():c;if(c!==geo)c.dispose();let b=buckets.get(o.material);if(!b){b={p:[],n:[],uv:[]};buckets.set(o.material,b);}for(const [k,a]of [['p','position'],['n','normal'],['uv','uv']])for(const x of geo.attributes[a].array)b[k].push(x);geo.dispose();o.geometry.dispose();g.remove(o);}for(const [m,b]of buckets){const geo=new T.BufferGeometry();for(const [k,a,n]of [['p','position',3],['n','normal',3],['uv','uv',2]])geo.setAttribute(a,new T.Float32BufferAttribute(b[k],n));mesh(g,geo,m);}}
function hand(g){const h=new T.Group();g.add(h);ellipsoid(h,shared.glove,[0,0,0],[.033,.040,.024]);for(let i=0;i<4;i++){const y=.024-i*.015;rod(h,shared.glove,[-.025,y,-.015],[.019,y,-.026],.007);rounded(h,shared.rubber,[.014,y,-.03],[.012,.01,.01],.002);}rod(h,shared.glove,[-.032,.026,.014],[-.026,.002,-.018],.010);batch(h);return h;}
function makeLimb(g,palette,side,isCT){const shoulder=new T.Group();shoulder.position.set(side*.238,1.435,-.012);g.add(shoulder);const upper=new T.Group(),fore=new T.Group();shoulder.add(upper,fore);
  loft(upper,palette.cloth,[[-.282,.055,.058],[-.255,.074,.068],[-.19,.077,.075],[-.09,.085,.078],[0,.081,.075]],18,.012);
  loft(fore,palette.cloth,[[-.249,.033,.033],[-.21,.041,.039],[-.13,.055,.049],[-.028,.064,.055],[0,.061,.054]],18,.012);
  loft(fore,palette.fold,[[-.250,.034,.034],[-.225,.037,.036]],18);
  const palm=hand(shoulder);batch(upper);batch(fore);shoulder.userData={upper,fore,hand:palm,side};return shoulder;
}
function shoeSurface(g,m,sections){
  const rings=sections.map(([z,rx,bottom,top])=>[z,rx,(top-bottom)/2,0,-(bottom+top)/2]);
  const o=loft(g,m,rings,24);o.rotation.x=Math.PI/2;return o;
}
function pointSegment(object,from,to,length){const d=to.clone().sub(from);object.position.copy(from);object.quaternion.setFromUnitVectors(new T.Vector3(0,-1,0),d.clone().normalize());object.scale.y=d.length()/length;}
function armTo(arm,target){const {upper,fore,hand,side}=arm.userData,wrist=target.clone().sub(arm.position),distance=wrist.length(),axis=wrist.clone().normalize(),upperLength=.282,lowerLength=.245;
  const d=Math.min(upperLength+lowerLength-.008,Math.max(.085,distance)),along=(upperLength**2-lowerLength**2+d*d)/(2*d),bend=Math.sqrt(Math.max(.001,upperLength**2-along**2));
  const pole=new T.Vector3(side*.22,-1,.25);pole.addScaledVector(axis,-pole.dot(axis)).normalize();const elbow=axis.clone().multiplyScalar(along).addScaledVector(pole,bend);
  pointSegment(upper,new T.Vector3(),elbow,upperLength);pointSegment(fore,elbow,wrist,lowerLength);hand.position.copy(wrist);hand.rotation.set(.2,side*.18,-side*.16);
}
export function poseSoldierWeapon(g,pose={}){
  const model=g.userData.gun;if(!model)return;model.updateMatrix();const r=model.userData.rig;
  for(const [i,anchor] of [[0,r.restLeft],[1,r.restRight]]){
    const target=anchor.clone();
    if(i===0&&pose.leftMag)target.lerp(new T.Vector3(-.027,-.045,.014).applyEuler(r.magazine.rotation).add(r.magazine.position),pose.leftMag);
    if(i===0&&pose.leftRack)target.lerp(chargingGrip(r,pose),pose.leftRack);
    if(i===0&&r.id==='m3')target.z+=pose.pump||0;
    if(i===1&&pose.rightBolt)target.lerp(new T.Vector3(.065,-.021,0).applyEuler(r.boltHandle.rotation).add(r.boltHandle.position).add(r.bolt.position),pose.rightBolt);
    if(i===1&&pose.rightRack)target.lerp(chargingGrip(r,pose),pose.rightRack);
    target.multiply(r.core.scale).applyMatrix4(model.matrix);armTo(g.userData.arms[i],target);
  }
}
export function attachSoldierWeapon(g,model){model.scale.setScalar(1);model.position.set(.060,1.29,-.205);model.rotation.y=.22;g.add(model);g.userData.gun=model;poseSoldierWeapon(g);}
export function buildSoldier(team,makeWeapon){const g=new T.Group(),ct=team==='ct',p=palettes[team]||palettes.ct;
  loft(g,p.cloth,[[.90,.172,.107],[.97,.182,.119],[1.07,.177,.119],[1.23,.211,.133],[1.36,.232,.127,0,-.014],[1.43,.221,.110,0,-.018],[1.49,.112,.078,0,-.007]],20,.014);
  loft(g,p.pants,[[.815,.146,.105],[.90,.176,.116],[.96,.173,.104]],20,.022);
  // Armour is a gameplay stat. The outer silhouette is a fitted combat jacket,
  // with no plate carrier, backpack, radio antenna or rear belt pouches.
  // Shallow seams only: no projecting pockets, belts, holsters or armour pieces.
  for(const [a,b] of [[[1.00,-.120],[1.23,-.135]],[[1.23,-.135],[1.37,-.142]],[[1.37,-.142],[1.47,-.087]]])rod(g,p.fold,[0,...a],[0,...b],.0015);
  // Collar and neck overlap cleanly: there is no exposed stretched neck.
  loft(g,p.hood,[[1.455,.065,.057],[1.557,.066,.061]],18);
  for(const side of [-1,1]){const collar=rounded(g,p.cloth,[side*.071,1.49,-.054],[.078,.065,.035]);collar.rotation.z=side*.45;}
  const head=new T.Group();head.name='head-rig';head.position.set(0,1.675,-.010);g.add(head);
  loft(head,p.hood,[[-.147,.056,.052,0,.015],[-.112,.068,.065,0,-.003],[-.060,.080,.079,0,-.006],[.004,.085,.086],[.066,.084,.085,0,.006],[.103,.063,.062,0,.012],[.121,.018,.026,0,.015]],20,.008);
  for(const side of [-1,1]){ellipsoid(head,shared.skin,[side*.033,.012,-.081],[.023,.010,.008]);ellipsoid(head,shared.eye,[side*.032,.012,-.089],[.006,.005,.0025]);}
  batch(head);
  const legs=[];for(const side of [-1,1]){const leg=new T.Group();leg.position.set(side*.116,.878,side>0?.025:-.025);g.add(leg);
    loft(leg,p.pants,[[0,.096,.097],[-.085,.108,.108,side*.014,0],[-.18,.103,.101,side*.021,-.022],[-.30,.085,.085,side*.026,-.035],[-.425,.074,.071,side*.029,-.046]],18,.012);
    const knee=new T.Group();knee.position.set(side*.029,-.417,-.045);leg.add(knee);leg.userData.knee=knee;
    loft(knee,p.pants,[[.014,.074,.071],[-.055,.079,.079,0,.002],[-.17,.077,.071,0,.023],[-.28,.060,.053,0,.051],[-.343,.057,.049,0,.052]],18,.012);
    const foot=new T.Group();foot.name='shoe';knee.add(foot);
    // Heel and instep flow down into a low toe box; a thin sole follows the foot.
    shoeSurface(foot,p.boot,[[-.145,.012,-.434,-.423],[-.128,.043,-.440,-.398],[-.066,.057,-.443,-.380],[.010,.058,-.443,-.354],[.068,.050,-.442,-.336],[.121,.039,-.440,-.367],[.128,.019,-.432,-.386]]);
    shoeSurface(foot,shared.rubber,[[-.149,.012,-.448,-.435],[-.130,.044,-.457,-.439],[-.066,.060,-.458,-.440],[.010,.061,-.458,-.440],[.070,.054,-.458,-.440],[.126,.043,-.452,-.436],[.134,.017,-.443,-.434]]);
    loft(foot,p.boot,[[-.399,.047,.052,0,.066],[-.326,.049,.045,0,.056]],18);
    batch(foot);
    batch(knee);batch(leg);legs.push(leg);
  }
  const arms=[makeLimb(g,p,-1,ct),makeLimb(g,p,1,ct)];
  batch(g);g.userData={team,legs,arms,head,baseScale:1,groundOffset:-.003,gun:null};attachSoldierWeapon(g,makeWeapon(ct?'m4a1':'ak47'));
  g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});return g;
}
