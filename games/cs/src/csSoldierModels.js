import * as T from 'three';
import {chargingGrip} from './csWeaponDeploy.js';
import {buildSkinnedSoldier,poseSkinnedSoldierWeapon} from './csSkinnedSoldier.js';

// Authored anatomy and clothing. CT follows the supplied olive tactical uniform;
// T follows the supplied arctic camouflage reference, with a visibly open face.
// Model coordinates are metres, with soles at zero and forward along -Z.
const UP=new T.Vector3(0,1,0);
function weave(){const a=new Uint8Array(64*64*4);let seed=813;for(let i=0;i<4096;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const x=i%64,y=i>>6,v=214+(seed%16)+((x+y)%2?12:0);a.set([v,v,v,255],i*4);}const t=new T.DataTexture(a,64,64);t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(5,5);t.colorSpace=T.SRGBColorSpace;t.needsUpdate=true;return t;}
const fabric=weave();
const mat=(color,roughness=.88,metalness=0,cloth=false)=>new T.MeshStandardMaterial({color,roughness,metalness,...(cloth?{map:fabric}:{})});
const shared={rubber:mat(0x1e2422,.94),hardware:mat(0x72796e,.48,.48),glove:mat(0x343a31,.97),skin:mat(0xb58b6c,.90),skinShade:mat(0x92725c,.94),brow:mat(0x39352f,.98),eye:mat(0x292d28,.43),eyeWhite:mat(0xb9bab0,.70),lip:mat(0x966e5c,.94),glass:mat(0x465a51,.23,.25)};
// A seamless, deterministic textile is generated locally; no downloaded texture
// or image decoder is needed. Broad irregular patches read as arctic camouflage.
function arcticCloth(){
  const size=256,data=new Uint8Array(size*size*4),swatches=[[226,230,225],[185,192,188],[123,133,127],[55,64,60]];
  const hash=(x,y,n)=>{const a=((x%n+n)%n)*374761393+((y%n+n)%n)*668265263;let v=Math.imul(a^(a>>>13),1274126177);return ((v^(v>>>16))>>>0)/4294967295;};
  const noise=(u,v,n)=>{const x=u*n,y=v*n,ix=Math.floor(x),iy=Math.floor(y),a=x-ix,b=y-iy,s=a*a*(3-2*a),t=b*b*(3-2*b);return T.MathUtils.lerp(T.MathUtils.lerp(hash(ix,iy,n),hash(ix+1,iy,n),s),T.MathUtils.lerp(hash(ix,iy+1,n),hash(ix+1,iy+1,n),s),t);};
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/size,v=y/size,n=noise(u,v,9)*.62+noise(u,v,21)*.27+noise(u,v,43)*.11;
    const color=swatches[n<.37?3:n<.455?2:n<.505?1:0],grain=((x+y)%2?1:-1)*2+(hash(x,y,size)-.5)*5;
    const k=(y*size+x)*4;for(let c=0;c<3;c++)data[k+c]=Math.max(0,Math.min(255,color[c]+grain));data[k+3]=255;
  }
  const texture=new T.DataTexture(data,size,size);texture.name='arctic-camouflage-local';texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.colorSpace=T.SRGBColorSpace;texture.needsUpdate=true;return texture;
}
const snowFabric=arcticCloth();
// Jacket, sleeves, hood and trousers share one textile. Armour stays invisible.
const uniform=(color,foldColor,bootColor,arctic=false)=>{const cloth=mat(color,.94,0,true);cloth.name=arctic?'arctic-uniform':'olive-uniform';cloth.userData.textile=true;if(arctic)cloth.map=snowFabric;return {cloth,pants:cloth,hood:cloth,fold:mat(foldColor,.96,0,true),boot:mat(bootColor,.92),lining:mat(arctic?0x626f6e:0x404734,.96),helmet:mat(0x424b35,.90,0,true)};};
const palettes={ct:uniform(0x626b49,0x515b3e,0x30362c),t:uniform(0xffffff,0x8b9995,0x343d3c,true)};
function mesh(g,geo,m,x=0,y=0,z=0){const o=new T.Mesh(geo,m);o.position.set(x,y,z);g.add(o);return o;}
function ellipsoid(g,m,p,s){const o=mesh(g,new T.SphereGeometry(1,16,10),m,...p);o.scale.set(...s);return o;}
function rounded(g,m,p,size,r=.008){const [w,h,d]=size,s=new T.Shape(),x=-w/2,y=-h/2;r=Math.min(r,w*.2,h*.2,d*.35);s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);const geo=new T.ExtrudeGeometry(s,{depth:d-2*r,bevelEnabled:true,bevelSize:r,bevelThickness:r,bevelSegments:2,curveSegments:3,steps:1});geo.translate(0,0,-d/2+r);return mesh(g,geo,m,...p);}
function rod(g,m,a,b,r1,r2=r1){const start=new T.Vector3(...a),end=new T.Vector3(...b),d=end.clone().sub(start),o=mesh(g,new T.CylinderGeometry(r2,r1,d.length(),12),m);o.position.copy(start.add(end).multiplyScalar(.5));o.quaternion.setFromUnitVectors(UP,d.normalize());return o;}
function disc(g,m,x,y,z,r,depth){const o=mesh(g,new T.CylinderGeometry(r,r,depth,20),m,x,y,z);o.rotation.x=Math.PI/2;return o;}
// Tailored ring profiles avoid the swollen capsule silhouette of the old model.
function loft(g,m,rings,segments=18,fold=.0){const p=[],uv=[],idx=[],circumference=Math.PI*rings.reduce((s,r)=>s+r[1]+r[2],0)/rings.length;for(let j=0;j<rings.length;j++){const [y,rx,rz,cx=0,cz=0]=rings[j];for(let i=0;i<=segments;i++){const a=i/segments*Math.PI*2,f=1+fold*Math.sin(a*5+j*1.9);p.push(cx+Math.cos(a)*rx*f,y,cz+Math.sin(a)*rz*f);uv.push(...(m.userData.textile?[i/segments*circumference/.48,y/.48]:[i/segments,j/(rings.length-1)]));if(j&&i){const k=j*(segments+1)+i;idx.push(k-1,k,k-segments-1,k-1,k-segments-1,k-segments-2);}}}for(const j of [0,rings.length-1]){const [y,,,x=0,z=0]=rings[j],c=p.length/3;p.push(x,y,z);uv.push(.5,.5);for(let i=0;i<segments;i++){const k=j*(segments+1)+i;idx.push(c,...(j?[k+1,k]:[k,k+1]));}}if(rings.at(-1)[0]<rings[0][0])for(let i=0;i<idx.length;i+=3){const n=idx[i+1];idx[i+1]=idx[i+2];idx[i+2]=n;}const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(p,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(idx);geo.computeVertexNormals();return mesh(g,geo,m);}
function batch(g){const buckets=new Map();for(const o of [...g.children]){if(!o.isMesh)continue;o.updateMatrix();const c=o.geometry.clone().applyMatrix4(o.matrix),geo=c.index?c.toNonIndexed():c;if(c!==geo)c.dispose();let b=buckets.get(o.material);if(!b){b={p:[],n:[],uv:[]};buckets.set(o.material,b);}for(const [k,a]of [['p','position'],['n','normal'],['uv','uv']])for(const x of geo.attributes[a].array)b[k].push(x);geo.dispose();o.geometry.dispose();g.remove(o);}for(const [m,b]of buckets){const geo=new T.BufferGeometry();for(const [k,a,n]of [['p','position',3],['n','normal',3],['uv','uv',2]])geo.setAttribute(a,new T.Float32BufferAttribute(b[k],n));mesh(g,geo,m);}}
function hand(g){const h=new T.Group();g.add(h);ellipsoid(h,shared.glove,[0,0,0],[.033,.040,.024]);for(let i=0;i<4;i++){const y=.024-i*.015;rod(h,shared.glove,[-.025,y,-.015],[.019,y,-.026],.007);rounded(h,shared.rubber,[.014,y,-.03],[.012,.01,.01],.002);}rod(h,shared.glove,[-.032,.026,.014],[-.026,.002,-.018],.010);batch(h);return h;}
function openHood(g,p){
  // Back and sides of a winter hood, with a real open face rather than a solid
  // balaclava with eyes pasted over it. The edge follows cheeks and forehead.
  const rings=[[-.145,.064,.059,.013,Math.PI/2],[-.118,.070,.070,.009,.95],[-.074,.081,.081,.005,.64],[.010,.086,.089,.008,.70],[.040,.085,.089,.009,.97],[.057,.081,.087,.010,1.22],[.069,.077,.083,.012,Math.PI/2],[.095,.065,.072,.016,Math.PI/2],[.115,.043,.048,.018,Math.PI/2],[.126,.008,.013,.020,Math.PI/2]],positions=[],uv=[],indices=[],segments=28;
  for(let j=0;j<rings.length;j++){
    const [y,rx,rz,cz,cut]=rings[j];
    for(let i=0;i<=segments;i++){const a=-cut+i/segments*(Math.PI+2*cut);positions.push(Math.cos(a)*rx,y,cz+Math.sin(a)*rz);uv.push(a*.17,y/.48);if(j&&i){const k=j*(segments+1)+i;indices.push(k-1,k,k-segments-1,k-1,k-segments-1,k-segments-2);}}
  }
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();mesh(g,geo,p.hood);
  for(const side of [-1,1])for(let j=1;j<rings.length-1;j++){
    const edge=r=>[side*Math.cos(r[4])*r[1],r[0],r[3]-Math.sin(r[4])*r[2]];
    rod(g,p.lining,edge(rings[j-1]),edge(rings[j]),.003);
  }
}
const faceRings=[[-.122,.037,.038,0,-.015],[-.108,.048,.046,0,-.014],[-.090,.058,.055,0,-.009],[-.065,.066,.062,0,-.002],[-.035,.071,.070,0,.003],[-.012,.073,.073,0,.006],[.010,.074,.074,0,.009],[.035,.073,.075,0,.011],[.065,.069,.071,0,.013],[.090,.052,.055,0,.016],[.108,.018,.024,0,.018]];
function facialRelief(x,y){
  const gaussian=(cx,cy,wx,wy)=>Math.exp(-(((x-cx)/wx)**2)-((y-cy)/wy)**2);
  return .013*gaussian(0,-.009,.009,.043)+.022*gaussian(0,-.043,.011,.011)
    +.004*(gaussian(-.035,-.038,.022,.028)+gaussian(.035,-.038,.022,.028))
    +.006*gaussian(0,-.102,.029,.014)+.003*gaussian(0,-.078,.025,.009)
    +.003*(gaussian(-.031,.015,.021,.008)+gaussian(.031,.015,.021,.008))
    -.003*(gaussian(-.030,.002,.018,.010)+gaussian(.030,.002,.018,.010));
}
function faceProfile(y){let j=1;while(j<faceRings.length-1&&faceRings[j][0]<y)j++;const a=faceRings[j-1],b=faceRings[j],t=T.MathUtils.clamp((y-a[0])/(b[0]-a[0]),0,1);return a.map((v,i)=>T.MathUtils.lerp(v,b[i],t));}
function faceSurface(x,y){const [,rx,rz,,cz]=faceProfile(y),front=Math.sqrt(Math.max(0,1-(x/rx)**2));return cz-rz*front-facialRelief(x,y)*front**6;}
function faceMesh(head){
  // Nose, cheekbones, brow and chin are one continuous surface, not separate
  // primitive shapes pasted onto the face. Small features follow that surface.
  const rings=Array.from({length:39},(_,i)=>faceProfile(-.122+i*.230/38));
  const face=loft(head,shared.skin,rings,40),positions=face.geometry.attributes.position;
  for(let i=0;i<positions.count;i++){
    const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i),[,rx,rz,,cz]=faceProfile(y);
    if(z<cz)positions.setZ(i,z-facialRelief(x,y)*Math.max(0,(cz-z)/rz)**6);
  }
  positions.needsUpdate=true;face.geometry.computeVertexNormals();
}
function buildHead(g,p,ct){
  const head=new T.Group();head.name='head-rig';head.position.set(0,1.675,-.010);g.add(head);
  faceMesh(head);
  for(const side of [-1,1]){
    ellipsoid(head,shared.skin,[side*.071,-.037,.001],[.010,.021,.010]);
    const x=side*.030,z=faceSurface(x,.002)-.0009;
    ellipsoid(head,shared.eyeWhite,[x,.002,z],[.010,.003,.0018]);
    ellipsoid(head,shared.eye,[x,.002,z-.0019],[.0028,.0028,.001]);
    rod(head,shared.skinShade,[side*.020,.006,faceSurface(side*.020,.006)-.001],[side*.040,.005,faceSurface(side*.040,.005)-.001],.0013);
    rod(head,shared.brow,[side*.017,.016,faceSurface(side*.017,.016)-.001],[side*.043,.015,faceSurface(side*.043,.015)-.001],.0017);
    ellipsoid(head,shared.skinShade,[side*.007,-.050,faceSurface(side*.007,-.050)-.0008],[.0025,.0012,.001]);
  }
  for(const side of [-1,1])rod(head,shared.lip,[0,-.078,faceSurface(0,-.078)-.001],[side*.020,-.076,faceSurface(side*.020,-.076)-.001],.0014);
  if(ct){
    loft(head,p.helmet,[[.023,.086,.088,0,.009],[.044,.094,.099,0,.010],[.083,.087,.094,0,.016],[.115,.064,.072,0,.020],[.135,.016,.023,0,.020]],24,.003);
    loft(head,p.lining,[[.019,.087,.089,0,.009],[.030,.090,.092,0,.010]],24);
    rounded(head,p.helmet,[0,.026,-.082],[.155,.012,.025],.003);
    // A small, shaped goggle frame leaves the nose and lower face exposed.
    for(const side of [-1,1]){
      const frame=rounded(head,shared.rubber,[side*.032,.008,-.069],[.058,.032,.014],.006);frame.rotation.y=-side*.18;
      const lens=rounded(head,shared.glass,[side*.032,.008,-.079],[.046,.021,.004],.004);lens.rotation.y=-side*.18;
      rod(head,p.lining,[side*.060,.008,-.064],[side*.080,.011,-.002],.004);
      rod(head,p.lining,[side*.078,.025,-.008],[side*.064,-.083,-.042],.0038);
      rod(head,p.lining,[side*.064,-.083,-.042],[side*.020,-.125,-.034],.0038);
    }
    rounded(head,shared.rubber,[0,.012,-.080],[.016,.010,.008],.003);
  }else openHood(head,p);
  batch(head);return head;
}
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
  if(g.userData.skinned){poseSkinnedSoldierWeapon(g,pose);return;}
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
export function attachSoldierWeapon(g,model){model.scale.setScalar(1);model.position.set(.060,1.29+(g.userData.skinned?.weaponYOffset||0),-.205);model.rotation.y=.22;g.add(model);g.userData.gun=model;poseSoldierWeapon(g);}
export function buildSoldier(team,makeWeapon,library){
  const sample=buildSkinnedSoldier(team,library);if(sample){attachSoldierWeapon(sample,makeWeapon(team==='ct'?'m4a1':'ak47'));return sample;}
  const g=new T.Group(),ct=team==='ct',p=palettes[team]||palettes.ct;
  loft(g,p.cloth,[[.90,.172,.107],[.97,.182,.119],[1.07,.177,.119],[1.23,.211,.133],[1.36,.232,.127,0,-.014],[1.43,.221,.110,0,-.018],[1.49,.112,.078,0,-.007]],20,.014);
  loft(g,p.pants,[[.815,.146,.105],[.90,.176,.116],[.96,.173,.104]],20,.022);
  // Armour is a gameplay stat. The outer silhouette is a fitted combat jacket,
  // with no plate carrier, backpack, radio antenna or rear belt pouches.
  // Shallow seams only: no projecting pockets, belts, holsters or armour pieces.
  for(const [a,b] of [[[1.00,-.120],[1.23,-.135]],[[1.23,-.135],[1.37,-.142]],[[1.37,-.142],[1.47,-.087]]])rod(g,p.fold,[0,...a],[0,...b],.0015);
  // A short visible neck and folded jacket collar replace the tall cloth tube.
  loft(g,shared.skin,[[1.475,.046,.043,0,.006],[1.572,.048,.045,0,.005]],18);
  loft(g,p.cloth,[[1.459,.073,.063],[1.505,.069,.059]],18);
  for(const side of [-1,1]){const collar=rounded(g,p.cloth,[side*.061,1.494,-.045],[.053,.062,.024]);collar.rotation.z=side*.34;}
  // Stitched shoulder and pocket outlines lie directly on the jacket surface.
  for(const side of [-1,1]){
    rod(g,p.fold,[side*.092,1.414,-.121],[side*.198,1.386,-.096],.0016);
    rod(g,p.fold,[side*.070,1.287,-.135],[side*.142,1.287,-.113],.0013);
    rod(g,p.fold,[side*.070,1.287,-.135],[side*.070,1.212,-.128],.0011);
    rod(g,p.fold,[side*.070,1.212,-.128],[side*.141,1.212,-.103],.0011);
  }
  const head=buildHead(g,p,ct);
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
