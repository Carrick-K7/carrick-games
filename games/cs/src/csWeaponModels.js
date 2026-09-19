import * as T from 'three';
import {buildReferenceWeapon} from './csReferenceWeapons.js';
import {createViewHand,poseViewHand,poseFirearmHand,poseClassicKnifeGrip} from './csViewHands.js';
import {DEFAULT_KNIFE_MODEL,normalizeKnifeModel} from './csKnifeStyles.js';
import {buildButterflyKnife} from './csButterflyKnife.js';
import {karambitMaterials} from './csKarambitMaterials.js';

const mat=(color,metalness=.0,roughness=.7)=>new T.MeshStandardMaterial({color,metalness,roughness});
const M={steel:mat(0x30373a,.8,.35),dark:mat(0x111719,.45,.53),edge:mat(0x697375,.82,.33),polymer:mat(0x252925,.06,.88),olive:mat(0x66714b,.04,.89),wood:mat(0x824521,.03,.61),woodLight:mat(0xa16531,.02,.66),knifeScale:mat(0x6e705b,.06,.82),rubber:mat(0x171a19,.0,.96),brass:mat(0xb49449,.74,.31),glass:mat(0x276076,.68,.15),glove:mat(0x333c39,.02,.96),sleeve:mat(0x3b4b51,.0,.98)};
const Y=new T.Vector3(0,1,0);
function mesh(g,geo,material,x=0,y=0,z=0){const o=new T.Mesh(geo,material);o.position.set(x,y,z);g.add(o);return o;}
function box(g,x,y,z,w,h,l,m=M.steel){return mesh(g,new T.BoxGeometry(w,h,l),m,x,y,z);}
function cylinder(g,x,y,z,r,l,m=M.steel){const o=mesh(g,new T.CylinderGeometry(r,r,l,18),m,x,y,z);o.rotation.x=Math.PI/2;return o;}
function sphere(g,x,y,z,r,m=M.steel){return mesh(g,new T.SphereGeometry(r,14,10),m,x,y,z);}
function rod(g,from,to,r,m=M.steel){const a=new T.Vector3(...from),b=new T.Vector3(...to),d=b.clone().sub(a);const o=mesh(g,new T.CylinderGeometry(r,r,d.length(),12),m);o.position.copy(a.add(b).multiplyScalar(.5));o.quaternion.setFromUnitVectors(Y,d.normalize());return o;}
// Extruded side profiles preserve curves, open guards and stock cutouts in the
// longitudinal plane. The small bevel catches light without bloating dimensions.
function profile(g,points,width,m=M.steel,holes=[]){const sh=new T.Shape();points.forEach(([z,y],i)=>i?sh.lineTo(z,y):sh.moveTo(z,y));sh.closePath();for(const ring of holes){const p=new T.Path();ring.forEach(([z,y],i)=>i?p.lineTo(z,y):p.moveTo(z,y));p.closePath();sh.holes.push(p);}const geo=new T.ExtrudeGeometry(sh,{depth:width,bevelEnabled:true,bevelSize:.0012,bevelThickness:.0012,bevelSegments:2,steps:1,curveSegments:12});geo.rotateY(-Math.PI/2);geo.translate(width/2,0,0);return mesh(g,geo,m);}
function screw(g,x,y,z,r=.005){const o=cylinder(g,x,y,z,r,.003,M.edge);o.rotation.set(0,0,Math.PI/2);box(g,x+Math.sign(x)*.002,y,z,.002,.0015,r*1.4,M.dark);}
function bands(g,zStart,zEnd,y,width){for(let z=zStart;z<zEnd;z+=.017)box(g,0,y,z,width,.008,.008,M.dark);}
function rail(g,zStart,zEnd,y,width=.034){box(g,0,y-.006,(zStart+zEnd)/2,width*.78,.012,zEnd-zStart,M.steel);bands(g,zStart,zEnd,y,width);}
function guard(g,z=.075){profile(g,[[z-.051,-.037],[z+.039,-.038],[z+.03,-.104],[z-.041,-.104],[z-.055,-.084]],.018,M.dark,[[[z-.040,-.05],[z-.043,-.08],[z-.033,-.092],[z+.02,-.092],[z+.027,-.05]]]);rod(g,[0,-.048,z],[0,-.083,z-.006],.004,M.steel);}
function grip(g,z=.135,m=M.polymer){profile(g,[[z-.033,-.035],[z+.028,-.029],[z+.058,-.159],[z+.007,-.172],[z-.024,-.083]],.045,m);for(const x of [-.024,.024])for(let j=0;j<5;j++)box(g,x,-.072-j*.017,z+.015+j*.004,.002,.003,.030,M.rubber);}
function muzzle(g,z,r=.018){cylinder(g,0,.02,z,r,.042,M.dark);cylinder(g,0,.02,z-.022,r*.60,.002,M.rubber);for(const x of [-r,r])box(g,x,.02,z,.001,.010,.023,M.rubber);}
function scope(g,z=-.045,size=1){const y=.135;for(const s of [-1,1]){box(g,0,.071,z+s*.082,.031,.052,.023,M.dark);const ring=cylinder(g,0,y,z+s*.082,.030,.021,M.steel);ring.scale.x=1.05;screw(g,.033,y,z+s*.082);}
  cylinder(g,0,y,z,.021,.30*size,M.dark);cylinder(g,0,y,z-.161*size,.038,.069,M.dark);cylinder(g,0,y,z+.156*size,.029,.057,M.rubber);cylinder(g,0,y,z-.197*size,.031,.0015,M.glass);cylinder(g,0,y,z+.185*size,.023,.0015,M.glass);
  const turret=cylinder(g,0,y+.032,z,.017,.028,M.dark);turret.rotation.x=0;const windage=cylinder(g,.033,y,z,.014,.025,M.steel);windage.rotation.set(0,0,Math.PI/2);for(let i=0;i<6;i++)cylinder(g,0,y,z+.125+i*.009,.030,.003,M.steel);
}
function batch(g){const buckets=new Map();for(const o of [...g.children]){if(!o.isMesh)continue;o.updateMatrix();const copied=o.geometry.clone().applyMatrix4(o.matrix);const geo=copied.index?copied.toNonIndexed():copied;if(geo!==copied)copied.dispose();let b=buckets.get(o.material);if(!b){b={p:[],n:[],uv:[]};buckets.set(o.material,b);}for(const [key,attr]of[['p','position'],['n','normal'],['uv','uv']])for(const n of geo.attributes[attr].array)b[key].push(n);geo.dispose();o.geometry.dispose();g.remove(o);}for(const [material,b]of buckets){const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(b.p,3));geo.setAttribute('normal',new T.Float32BufferAttribute(b.n,3));geo.setAttribute('uv',new T.Float32BufferAttribute(b.uv,2));mesh(g,geo,material);}}
function part(core,name,x=0,y=0,z=0){const g=new T.Group();g.name=name;g.position.set(x,y,z);core.add(g);return g;}

function boltRifle(r,id){const g=r.fixed,light=id==='scout';
  profile(g,[[.437,.015],[.415,.060],[.264,.060],[.213,.015],[.125,-.017],[-.01,-.022],[-.298,-.018],[-.342,-.039],[-.34,-.085],[-.08,-.083],[.07,-.055],[.13,-.137],[.197,-.149],[.217,-.092],[.33,-.085],[.43,-.101]],.065,M.olive,[[[.17,-.028],[.139,-.052],[.164,-.104],[.192,-.106],[.20,-.065]]]);
  box(g,0,-.024,.436,.074,.158,.024,M.rubber);box(g,0,.071,.335,.066,.027,.127,M.polymer);cylinder(g,0,.022,-.49,.0125,.456,M.steel);muzzle(g,-.731,.017);
  cylinder(g,0,.023,-.13,.024,.24,M.steel);box(g,.023,.04,.023,.004,.027,.092,M.rubber);rail(g,-.163,.112,.064,.038);scope(g,-.042,light?.88:1.08);guard(g,.113);
  r.magazine.position.set(0,-.07,-.047);profile(r.magazine,[[-.044,.011],[.045,.009],[.041,-.102],[-.038,-.107]],.047,M.dark);box(r.magazine,0,-.105,0,.052,.008,.09,M.steel);
  for(const x of [-.025,.025])for(const z of [-.023,.023])box(r.magazine,x,-.046,z,.002,.077,.007,M.edge);
  r.bolt.position.set(0,.026,.085);cylinder(r.bolt,0,0,0,.017,.127,M.edge);r.boltHandle.position.set(0,0,.033);rod(r.boltHandle,[.006,0,0],[.062,-.017,0],.006,M.steel);sphere(r.boltHandle,.065,-.021,0,.016,M.dark);
  for(const x of [-.027,.027]){rod(g,[x,-.072,-.28],[x*1.6,-.099,-.515],.008,M.dark);sphere(g,x,-.072,-.28,.012,M.steel);box(g,x*1.6,-.105,-.50,.021,.013,.051,M.rubber);}
  for(const x of [-.035,.035])for(const z of [-.255,.233,.386])screw(g,x,-.037,z,.006);
  r.restRight.set(.018,-.091,.173);r.restLeft.set(-.016,-.093,-.225);r.ejectPort.set(.036,.038,.03);r.muzzle.set(0,.02,-.755);
  if(light)r.core.scale.setScalar(.90);
}
function rifle(r,id,w){const g=r.fixed,isAK=id==='ak47',isM4=id==='m4a1',isBullpup=id==='aug',smg=['mp5','tmp','mac10','p90'].includes(id),p90=id==='p90',belt=id==='m249',shot=!!w.pellets;
  const length=smg?.18:.255,width=smg?.043:.058;
  profile(g,[[-length/2,.045],[length/2-.018,.045],[length/2,.025],[length/2,-.039],[-length/2,-.043]],width,M.steel);
  box(g,.5*width+.002,.009,-.012,.002,.024,.073,M.rubber);for(const x of [-1,1])for(const z of [-.081,.096])screw(g,x*(width/2+.003),.005,z);
  if(isAK){cylinder(g,0,.034,-.01,.024,.24,M.dark);profile(g,[[.118,.025],[.225,.018],[.376,.02],[.386,-.126],[.285,-.1],[.202,-.047],[.12,-.026]],.052,M.wood);box(g,0,-.054,.386,.057,.15,.017,M.rubber);
    profile(g,[[-.30,.015],[-.29,.044],[-.14,.035],[-.13,-.042],[-.29,-.044]],.056,M.wood);cylinder(g,0,.063,-.264,.012,.26,M.steel);for(const x of [-.029,.029])for(let i=0;i<4;i++)box(g,x,-.013+i*.01,-.216,.001,.002,.13,M.woodLight);
  }else if(isM4){cylinder(g,0,.028,.195,.017,.18,M.dark);profile(g,[[.225,.05],[.362,.048],[.367,-.089],[.34,-.113],[.269,-.071],[.217,-.057]],.046,M.polymer,[[[.249,.012],[.263,-.041],[.338,-.077],[.340,.012]]]);box(g,0,-.029,.369,.051,.17,.014,M.rubber);for(let i=0;i<5;i++)cylinder(g,0,.027,.13+i*.014,.019,.006,M.steel);rail(g,-.123,.111,.055,.033);
  }else if(isBullpup||p90){profile(g,[[.115,.052],[.32,.031],[.345,-.134],[.2,-.139],[.1,-.05]],.065,isBullpup?M.olive:M.polymer);box(g,0,-.045,.339,.069,.181,.021,M.rubber);
  }else if(smg){for(const x of [-.02,.02])rod(g,[x,.018,.1],[x,.019,.284],.006,M.steel);box(g,0,-.023,.293,.05,.119,.019,M.rubber);
  }else{profile(g,[[.13,.02],[.208,.016],[.385,-.009],[.385,-.129],[.269,-.11],[.181,-.045],[.128,-.025]],.053,shot?M.polymer:M.olive);box(g,0,-.071,.39,.057,.129,.018,M.rubber);}
  const front=smg?-.205:-.243,frontLen=smg?.16:.215,barrelEnd=smg?-.354:(shot?-.604:-.513);
  if(!isAK){const destination=shot?r.pump:g;profile(destination,[[front-frontLen/2,.031],[front+frontLen/2,.035],[front+frontLen/2,-.038],[front-frontLen/2,-.038]],smg?.049:.058,M.polymer);for(const x of [-1,1])for(let i=0;i<7;i++)box(destination,x*.030,-.002,front-frontLen*.42+i*frontLen*.13,.003,.033,.006,M.rubber);if(isM4||belt)rail(destination,front-frontLen/2,front+frontLen/2,.044,.051);}
  cylinder(g,0,.02,(front+barrelEnd)/2,.010,Math.abs(barrelEnd-front),M.steel);muzzle(g,barrelEnd,.015);
  if(w.silencer){r.suppressor=part(r.core,'suppressor');cylinder(r.suppressor,0,.02,barrelEnd-.079,.020,.155,M.dark);for(let i=0;i<4;i++)cylinder(r.suppressor,0,.02,barrelEnd-.012-i*.007,.021,.003,M.steel);cylinder(r.suppressor,0,.02,barrelEnd-.158,.012,.002,M.rubber);r.muzzleBare=new T.Vector3(0,.02,barrelEnd-.025);}
  const gripZ=isBullpup?-.023:p90?-.065:.091;grip(g,gripZ,isAK?M.wood:M.polymer);guard(g,gripZ-.055);
  if(!shot){r.magazine.position.set(0,-.042,isBullpup?.172:p90?-.059:-.037);
    if(p90){box(r.magazine,0,.119,0,.054,.026,.337,M.olive);for(let i=0;i<16;i++)cylinder(r.magazine,0,.118,-.143+i*.018,.006,.048,M.brass).rotation.set(0,0,Math.PI/2);box(r.magazine,0,.139,0,.056,.008,.337,M.polymer);}
    else if(belt){box(r.magazine,0,-.105,0,.15,.18,.14,M.olive);box(r.magazine,0,-.189,0,.157,.012,.15,M.polymer);for(let i=0;i<6;i++)box(r.magazine,.077,-.04-i*.024,0,.003,.008,.10,M.polymer);}
    else{const curve=isAK?-.048:smg?-.009:-.016,magLen=smg?.18:.185,magWidth=smg?.025:.043;profile(r.magazine,[[-.036,.013],[.034,.013],[.037+curve,-magLen*.66],[.033+curve*1.4,-magLen],[-.032+curve,-magLen-.012],[-.039+curve*.3,-magLen*.48]],magWidth,isAK?M.steel:M.dark);for(const x of [-1,1])for(let j=0;j<3;j++)rod(r.magazine,[x*(magWidth/2+.001),-.03,-.021+j*.02],[x*(magWidth/2+.001),-magLen+.02,curve-.021+j*.02],.002,M.edge);}
  }else{cylinder(g,0,-.029,-.35,.012,.46,M.dark);box(g,0,-.047,-.027,.026,.004,.064,M.rubber);r.shell=part(r.core,'loading-shell');cylinder(r.shell,0,0,0,.009,.041,M.brass);cylinder(r.shell,0,0,-.018,.0094,.007,M.rubber);r.shell.visible=false;}
  if(belt){r.cover.position.set(0,.045,-.07);box(r.cover,0,0,.061,.073,.027,.177,M.dark);for(let i=0;i<7;i++)cylinder(g,-.046-i*.008,.009,-.032,.004,.05,M.brass);for(const x of [-.023,.023])rod(g,[x,-.03,-.35],[x*2,-.101,-.49],.007,M.steel);}
  const leftCharge=['mp5','g3sg1','sg552','aug','p90'].includes(id),topCharge=id==='mac10';
  const chargeZ={mp5:-.161,g3sg1:-.184,sg552:-.009,aug:-.127,p90:-.061,mac10:-.022};
  r.bolt.position.set(isM4||topCharge?0:leftCharge?-.030:.030,topCharge?.066:isM4?.047:.024,chargeZ[id]??(isM4?.113:.063));
  if(!topCharge)cylinder(r.bolt,0,0,-.036,.010,.075,M.edge);
  box(r.bolt,isM4||topCharge?0:leftCharge?-.018:.018,topCharge?.004:0,.006,isM4?.055:topCharge?.028:.029,topCharge?.021:.012,.020,M.dark);
  if(!w.scope&&!w.optics&&!p90){box(g,0,.066,.064,.029,.025,.015,M.dark);profile(g,[[front-.062,.019],[front-.04,.094],[front-.019,.019]],.009,M.dark,[[[front-.048,.036],[front-.04,.067],[front-.031,.036]]]);}
  if(w.scope||w.optics)scope(g,w.optics?-.035:-.03,w.optics?.67:.91);
  r.restRight.set(.014,-.096,gripZ+.025);r.restLeft.set(-.016,-.066,front+.021);r.ejectPort.set(width*.55,.027,-.023);r.muzzle.set(0,.02,barrelEnd-(w.silencer?.16:.025));
  if(p90)r.core.scale.setScalar(.76);else if(id==='mac10')r.core.scale.setScalar(.68);else if(id==='tmp')r.core.scale.setScalar(.78);
}
function desertEagle(r){
  const g=r.fixed,metal=M.edge;
  // Mark XIX, 6-inch silhouette: 273 mm overall, 159 mm tall, 32 mm wide.
  // The polygonal barrel stays fixed; the rear slide and lower rails reciprocate.
  profile(g,[[-.172,-.006],[-.151,-.020],[-.036,-.023],[.019,-.024],[.026,-.037],[.049,-.093],[.096,-.104],[.099,-.090],[.078,-.024],[.091,-.009],[.076,.003],[-.159,.003]],.028,metal);
  const barrel=part(g,'fixed-polygonal-barrel');
  const octagon=new T.CylinderGeometry(.018,.018,.152,8);octagon.rotateX(Math.PI/2);octagon.rotateZ(Math.PI/8);mesh(barrel,octagon,metal,0,.023,-.098);
  profile(barrel,[[-.175,.019],[-.175,.038],[-.163,.046],[-.030,.046],[-.020,.032],[-.026,.011]],.024,metal);
  cylinder(barrel,0,.023,-.1755,.0067,.0015,M.rubber);cylinder(barrel,0,.023,-.176,.0082,.0008,M.dark);
  box(barrel,0,.048,-.151,.013,.004,.042,M.steel);box(barrel,0,.054,-.158,.005,.010,.009,M.dark);
  box(barrel,0,.048,-.063,.018,.003,.061,metal);for(const z of [-.084,-.060])box(barrel,0,.050,z,.019,.001,.004,M.dark);
  cylinder(g,0,.024,-.013,.011,.052,M.steel);
  r.slide.position.set(0,.018,0);
  profile(r.slide,[[-.013,-.016],[-.013,.022],[.004,.029],[.075,.029],[.086,.010],[.081,-.020]],.031,metal);
  for(const x of [-.0145,.0145]){
    box(r.slide,x,-.024,-.053,.004,.010,.222,metal);
    for(let i=0;i<9;i++){const serration=box(r.slide,x*1.12,.007,.018+i*.0058,.0016,.026,.0018,M.dark);serration.rotation.x=-.22;}
    const safety=profile(r.slide,[[.039,.010],[.064,.010],[.069,.001],[.051,-.009],[.041,-.006]],.003,M.steel);safety.position.x=x*1.17;
    screw(r.slide,x*1.17,.007,.058,.004);
  }
  box(r.slide,0,.034,.064,.025,.008,.011,M.dark);box(r.slide,0,.038,.064,.008,.005,.012,metal);
  profile(g,[[.076,.027],[.084,.044],[.095,.041],[.091,.027],[.083,.012]],.010,M.dark);
  profile(g,[[.071,-.015],[.092,-.004],[.097,-.001],[.094,-.012],[.081,-.023]],.022,metal);
  // Rounded, open guard and curved trigger, both separate from the deep grip.
  profile(g,[[-.040,-.025],[-.031,-.047],[-.019,-.065],[.009,-.068],[.030,-.055],[.033,-.027]],.014,metal,[[[-.029,-.033],[-.021,-.052],[.004,-.057],[.021,-.049],[.021,-.033]]]);
  profile(g,[[.009,-.024],[.005,-.038],[.009,-.047],[.015,-.050],[.011,-.052],[.003,-.048],[-.002,-.038],[.001,-.024]],.005,M.dark);
  for(const x of [-1,1]){
    const panel=profile(g,[[.035,-.032],[.069,-.027],[.091,-.087],[.052,-.096],[.026,-.049]],.003,M.rubber);panel.position.x=x*.015;
    // A diamond checkering surface, magazine catch and slide-stop lever.
    for(let row=0;row<12;row++)for(let col=0;col<5;col++){const y=-.039-row*.0038,z=.038+col*.0055+row*.0018;const dot=box(g,x*.0172,y,z,.0008,.0012,.0012,M.polymer);dot.rotation.x=Math.PI/4;}
    screw(g,x*.0178,-.065,.064,.0042);
    const emblem=cylinder(g,x*.0176,-.060,.062,.009,.0008,M.polymer);emblem.rotation.set(0,0,Math.PI/2);
  }
  box(g,-.017,-.015,.005,.004,.006,.024,M.dark);screw(g,-.018,-.030,.020,.0035);
  r.magazine.position.set(0,-.097,.066);profile(r.magazine,[[-.023,.067],[.010,.066],[.025,-.006],[-.013,-.011]],.024,M.dark);box(r.magazine,0,-.006,.006,.033,.007,.046,M.rubber);
  r.restRight.set(.010,-.056,.060);r.restLeft.set(-.021,-.055,.037);r.ejectPort.set(.017,.035,-.008);r.muzzle.set(0,.023,-.177);
  r.reference='Magnum Research Desert Eagle Mark XIX 6-inch';batch(barrel);
}
function mp9(r){const g=r.fixed;
  profile(g,[[-.151,.030],[-.123,.050],[.058,.050],[.075,.022],[.063,-.030],[-.125,-.030]],.039,M.polymer);rail(g,-.111,.055,.056,.024);
  cylinder(g,0,.017,-.157,.011,.047,M.steel);cylinder(g,0,.017,-.182,.006,.003,M.rubber);
  grip(g,.011);guard(g,-.040);grip(g,-.119);r.magazine.position.set(0,-.118,.037);box(r.magazine,0,-.052,0,.023,.12,.036,M.dark);
  for(const x of [-.019,.019]){rod(g,[x,.023,.066],[x,.019,.228],.004,M.steel);rod(g,[x,-.031,.066],[x,-.061,.228],.004,M.steel);}box(g,0,-.027,.232,.031,.10,.012,M.rubber);
  box(g,.021,.009,-.010,.003,.018,.058,M.dark);r.bolt.position.set(0,.043,.072);box(r.bolt,0,0,0,.033,.012,.016,M.steel);
  r.restRight.set(.012,-.093,.034);r.restLeft.set(-.016,-.094,-.10);r.ejectPort.set(.024,.019,-.018);r.muzzle.set(0,.017,-.184);
}
function pistol(r,id,w){const g=r.fixed,eagle=false,front=-.124,width=.031;
  profile(g,[[front,.01],[.077,.01],[.077,-.021],[.102,-.121],[.043,-.141],[.017,-.045],[front,-.031]],width,M.polymer);guard(g,-.003);
  for(const x of [-1,1]){for(let i=0;i<8;i++)box(g,x*(width/2+.002),-.052-i*.009,.055+i*.002,.002,.003,.036,M.rubber);screw(g,x*(width/2+.003),-.091,.074,.005);}
  r.slide.position.set(0,.031,0);profile(r.slide,[[front-.007,.019],[.068,.019],[.077,.006],[.073,-.018],[front-.007,-.018]],width+.006,eagle?M.edge:M.steel);box(r.slide,(width+.006)/2+.001,.003,-.038,.002,.02,.041,M.dark);for(const x of [-1,1])for(let i=0;i<7;i++)box(r.slide,x*(width/2+.004),0,.025+i*.006,.002,.030,.002,M.dark);
  box(r.slide,0,.029,front+.012,.007,.012,.010,M.dark);box(r.slide,0,.029,.054,.023,.012,.010,M.dark);for(const x of [-.007,.007])box(r.slide,x,.03,.060,.004,.004,.001,M.edge);cylinder(g,0,.032,front+.058,eagle?.010:.007,.134,M.steel);cylinder(g,0,.032,front-.009,eagle?.006:.004,.003,M.rubber);
  if(w.silencer){r.suppressor=part(r.core,'suppressor');cylinder(r.suppressor,0,.031,front-.068,.017,.124,M.dark);cylinder(r.suppressor,0,.031,front-.133,.011,.002,M.rubber);r.muzzleBare=new T.Vector3(0,.031,front-.009);}
  r.magazine.position.set(0,-.119,.061);profile(r.magazine,[[-.020,.103],[.016,.101],[.032,-.013],[-.012,-.02]],width*.83,M.dark);box(r.magazine,0,-.016,.01,width+.004,.009,.052,M.polymer);r.restRight.set(.012,-.074,.067);r.restLeft.set(-.021,-.071,.038);r.ejectPort.set(.019,.043,-.04);r.muzzle.set(0,.031,front-(w.silencer?.13:.009));
}
let classicGrip;
function classicKnife(r){
  const frame=part(r.core,'classic-knife-grip-frame');r.knifeFrame=frame;
  const pivot=part(frame,'classic-knife-grip');r.knifePivot=pivot;
  const body=part(pivot,'classic-knife-body');
  // Authored CS 1.6 silhouette: broad clipped point, short toothed spine,
  // bright cutting bevel, small guard and a dark, straight scale handle.
  const handle=[[-.013,-.064],[.014,-.064],[.020,-.050],[.016,-.023],[.017,.034],[.013,.060],[-.014,.060],[-.020,.034],[-.018,-.028],[-.021,-.050]];
  profile(body,handle,.014,M.steel);
  profile(body,handle.map(([z,y])=>[z*.90,y*.93]),.018,M.rubber);
  const inlay=[[-.010,-.050],[.010,-.050],[.010,.047],[-.010,.047],[-.014,.027],[-.012,-.029]];
  const scaleMaterial=M.knifeScale;
  for(const sign of [-1,1]){
    const panel=profile(body,inlay,.0015,scaleMaterial);panel.position.x=sign*.010;
    for(const y of [-.039,.033])screw(body,sign*.0125,y,0,.0034);
    for(let i=0;i<7;i++)rod(body,[sign*.0117,-.022+i*.006,-.009],[sign*.0117,-.019+i*.006,.009],.00055,M.dark);
  }
  profile(body,[[-.034,.059],[.034,.059],[.032,.068],[-.030,.072]],.025,M.steel);
  const blade=part(pivot,'classic-knife-blade');r.knifeBlade=blade;
  const outline=[[-.017,.068],[.018,.068],[.022,.093]];
  for(let i=0;i<7;i++){const y=.094+i*.008;outline.push([.022,y],[.017,y+.003],[.022,y+.006]);}
  outline.push([.022,.185],[-.004,.265],[-.019,.236],[-.030,.194],[-.030,.088],[-.021,.074]);
  profile(blade,outline,.0025,M.edge);
  profile(blade,[[-.013,.072],[.015,.072],[.015,.182],[-.004,.254],[-.013,.223],[-.020,.188],[-.020,.095]],.0052,M.steel);
  batch(blade);batch(body);
  if(!classicGrip){
    const hand=createViewHand(M.glove,'r'),grip=poseClassicKnifeGrip(hand);
    classicGrip={...grip,rotation:hand.group.quaternion.clone()};hand.mesh.geometry.dispose();hand.skeleton.dispose();
  }
  r.knifePalm=classicGrip.palm.clone();r.knifeHandRotation=classicGrip.rotation.clone();
  r.knifeTip=new T.Vector3(0,.265,-.004);r.knifeRest=pivot.quaternion.clone();
  frame.rotation.set(.10,1.10,-.20,'YXZ');
  r.restRight.copy(r.knifePalm).applyQuaternion(frame.quaternion);r.restLeft.set(-.27,-.05,.025);
  r.muzzle.copy(r.knifeTip).applyQuaternion(frame.quaternion);
}
function karambit(r){
  const metal=karambitMaterials();
  // Original game mesh: reverse grip, open index ring, curved scales and a
  // separately bevelled claw. The long-knife slab/guard are not reused.
  const frame=part(r.core,'karambit-grip-frame');r.knifeFrame=frame;
  const pivot=part(frame,'karambit-ring-pivot',0,.037,.028);r.knifePivot=pivot;
  const g=part(pivot,'karambit-body',0,-.037,-.028);
  const ring=mesh(g,new T.TorusGeometry(.0147,.0035,12,40),metal.ring,0,.037,.028);ring.rotation.y=Math.PI/2;
  profile(g,[[.010,.023],[.044,.023],[.057,.007],[.059,-.031],[.044,-.074],[.012,-.087],[-.002,-.070],[.003,-.044],[-.002,-.025],[.003,-.008]],.013,metal.frame);
  const handle=[[.012,.016],[.039,.017],[.049,.003],[.049,-.029],[.037,-.067],[.013,-.075],[.008,-.060],[.013,-.042],[.008,-.025],[.013,-.009]];
  profile(g,handle,.021,M.rubber);
  for(const x of [-.013,.013]){
    for(const [z,y]of [[.028,.007],[.029,-.054]])screw(g,x,y,z,.0034);
    for(let i=0;i<6;i++)rod(g,[x,-.009-i*.008,.021],[x,-.015-i*.008,.041],.0009,M.dark);
  }
  const blade=new T.Shape();blade.moveTo(.030,-.072);blade.quadraticCurveTo(.022,-.147,-.066,-.184);blade.quadraticCurveTo(-.119,-.202,-.154,-.176);blade.quadraticCurveTo(-.072,-.178,-.027,-.105);blade.quadraticCurveTo(-.014,-.078,.001,-.066);blade.lineTo(.030,-.072);
  const bladeGroup=part(g,'karambit-blade');r.knifeBlade=bladeGroup;
  profile(bladeGroup,blade.getPoints(18).map(p=>[p.x,p.y]),.0045,metal.edge);
  const flat=new T.Shape();flat.moveTo(.017,-.079);flat.quadraticCurveTo(.006,-.139,-.071,-.175);flat.quadraticCurveTo(-.117,-.193,-.145,-.179);flat.quadraticCurveTo(-.072,-.178,-.030,-.111);flat.quadraticCurveTo(-.014,-.084,.017,-.079);
  profile(bladeGroup,flat.getPoints(18).map(p=>[p.x,p.y]),.0058,metal.face);
  bladeGroup.scale.z=.85;bladeGroup.position.z=.003;
  batch(bladeGroup);batch(g);r.knifePalm=new T.Vector3(.034,-.014,.028);r.restLeft.set(-.30,-.020,-.07);
  r.knifeTip=new T.Vector3(0,-.176,-.154*.85+.003);r.knifeRest=pivot.quaternion.clone();
  // The blade exits the little-finger side of the fist. In the right-handed
  // view its hook is outside the wrist and curls upward, not into the forearm.
  frame.rotation.set(0,-Math.PI/2,1.16,'ZYX');
  r.restRight.copy(r.knifePalm).applyQuaternion(frame.quaternion);
  r.muzzle.copy(r.knifeTip).applyQuaternion(frame.quaternion);
}
function makeKnifeHands(g,r){
  r.knifeRight=createViewHand(M.glove,'r');r.knifeFrame.add(r.knifeRight.group);
  r.knifeIndex=new T.Vector3(0,.037,.028);r.knifeWrist=new T.Vector3();
  r.knifeCuff=mesh(g,new T.CylinderGeometry(.034,.037,.043,16),M.rubber);
  r.knifeForearm=mesh(g,new T.CylinderGeometry(.027,.050,1,16),M.sleeve);
  if(r.knifeModel!=='karambit')r.knifeUpperArm=mesh(g,new T.CylinderGeometry(.049,.062,1,16),M.sleeve);
  r.knifeElbow=new T.Vector3(.43,-.29,.24);r.knifeElbowRest=r.knifeElbow.clone();
  const root=part(g,'karambit-off-hand-root'),skin=createViewHand(M.glove,'l'),left=skin.group;root.add(left);
  poseViewHand(skin,{open:1,thumb:.80,relaxed:true});
  left.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(new T.Vector3(0,-1,0),new T.Vector3(0,0,-1),new T.Vector3(1,0,0)));
  left.rotateY(-.18);left.rotateZ(-.10);
  const cuff=mesh(root,new T.CylinderGeometry(.034,.037,.043,16),M.rubber),arm=mesh(root,new T.CylinderGeometry(.027,.050,1,16),M.sleeve);
  const rest=new T.Vector3(-.27,-.05,.025);left.position.copy(rest);
  r.knifeLeft={root,hand:left,skin,arm,cuff,elbow:new T.Vector3(-.52,-.24,.30),rest};
}
function makeArm(g,side,rest){const hand=part(g,side+'-hand');const palm=sphere(hand,0,0,0,.034,M.glove);palm.scale.set(.77,1.10,.74);for(let i=0;i<4;i++){const finger=mesh(hand,new T.CapsuleGeometry(.007,.028,4,8),M.glove,0,.022-i*.014,-.020);finger.rotation.z=Math.PI/2;box(hand,.017,.022-i*.014,-.018,.008,.008,.017,M.rubber);}const thumb=mesh(hand,new T.CapsuleGeometry(.009,.023,4,8),M.glove,side==='right'?-.022:.022,.013,.014);thumb.rotation.z=side==='right'?-.5:.5;const wrist=mesh(hand,new T.CylinderGeometry(.025,.030,.029,12),M.rubber,0,-.042,.02);wrist.rotation.x=-.5;batch(hand);
  const arm=mesh(g,new T.CylinderGeometry(.032,.058,1,14),M.sleeve);const elbow=new T.Vector3(side==='right'?.22:-.19,-.30,.34);hand.position.copy(rest);return{hand,arm,elbow,rest:rest.clone()};
}
function makeGripArm(g,side,rest,style){
  const left=side==='left',skin=createViewHand(M.glove,left?'l':'r',true),hand=skin.group;g.add(hand);
  const gripStyle=left?style:'pistol';poseFirearmHand(skin,gripStyle);
  const under=left&&style==='underhand',y=under?new T.Vector3(.60,.20,-.775).normalize():new T.Vector3(0,-.45,-.893).normalize();
  // Both palms face into the weapon. The left glove already has mirrored
  // anatomy; mirroring its frame again pointed its fingers away from the grip.
  const x=under?new T.Vector3(0,1,0).addScaledVector(y,-y.y).normalize():new T.Vector3(1,0,0);
  const rotation=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,new T.Vector3().crossVectors(x,y)));
  const magazineRotation=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(new T.Vector3(1,0,0),new T.Vector3(0,.25,-.968).normalize(),new T.Vector3(0,.968,.25).normalize()));
  const arm=mesh(g,new T.CylinderGeometry(.028,.052,1,16),M.sleeve),cuff=mesh(g,new T.CylinderGeometry(.031,.034,.038,16),M.rubber);
  const upperArm=mesh(g,new T.CylinderGeometry(.050,.064,1,16),M.sleeve);
  return{hand,skin,arm,cuff,upperArm,gripStyle,elbow:new T.Vector3(left?-.27:.25,-.30,.31),rest:rest.clone(),rotation,magazineRotation,palm:new T.Vector3(0,.056,.005).multiplyScalar(skin.scale)};
}
export function buildWeapon(id,w,hands=false,knifeModel=DEFAULT_KNIFE_MODEL){
  const g=new T.Group(),core=part(g,'weapon-core'),fixed=part(core,'receiver'),magazine=part(core,'magazine'),action=part(core,'bolt'),boltHandle=part(action,'bolt-handle'),slide=part(core,'slide'),cover=part(core,'feed-cover'),pump=part(core,'fore-end');
  const r={id,knifeModel:normalizeKnifeModel(knifeModel),core,fixed,magazine,bolt:action,boltHandle,slide,cover,pump,restLeft:new T.Vector3(),restRight:new T.Vector3(),ejectPort:new T.Vector3(),muzzle:new T.Vector3()};
  const reference=buildReferenceWeapon(r);
  if(reference&&id==='m249'){
    r.belt=part(core,'linked-ammunition');
    for(let i=0;i<7;i++){const x=-.10+i*.009,y=.018+Math.sin(i/6*Math.PI/2)*.023;cylinder(r.belt,x,y,-.008,.0038,.039,M.brass);const tip=mesh(r.belt,new T.ConeGeometry(.0037,.012,10),M.brass,x,y,-.034);tip.rotation.x=-Math.PI/2;box(r.belt,x,y+.001,.003,.008,.002,.009,M.dark);}
    batch(r.belt);
  }
  if(reference&&['m3','xm1014'].includes(id)){
    r.shell=part(core,'loading-shell');const hull=mat(0x813b27,.08,.65);hull.userData.ownedCsWeaponMaterial=true;
    cylinder(r.shell,0,0,0,.0095,.040,hull);cylinder(r.shell,0,0,.019,.010,.009,M.brass);batch(r.shell);r.shell.visible=false;
  }
  if(id==='c4'){
    // A compact game prop: taped blocks, an olive carrier and a readable keypad.
    box(fixed,0,-.02,0,.205,.10,.265,M.olive);for(const z of [-.078,.078])box(fixed,0,-.012,z,.212,.115,.029,M.rubber);
    box(fixed,0,.049,-.018,.12,.035,.156,M.dark);box(fixed,0,.069,-.064,.091,.003,.043,M.glass);
    for(let row=0;row<4;row++)for(let col=0;col<3;col++)box(fixed,(col-1)*.027,.069,-.022+row*.020,.018,.006,.012,M.edge);
    for(const x of [-.082,.082])rod(fixed,[x,.048,-.10],[x*.5,.051,-.065],.003,M.brass);
    r.restLeft.set(-.104,-.015,.019);r.restRight.set(.104,-.010,.039);r.muzzle.set(0,.08,-.10);batch(fixed);
  }
  if(!reference&&id!=='c4'){if(w.boltAction)boltRifle(r,id);else if(id==='tmp')mp9(r);else if(w.pistol)pistol(r,id,w);else if(id==='he'){
    const body=new T.LatheGeometry([new T.Vector2(0,-.043),new T.Vector2(.021,-.040),new T.Vector2(.031,-.030),new T.Vector2(.035,-.009),new T.Vector2(.034,.016),new T.Vector2(.027,.034),new T.Vector2(.016,.041),new T.Vector2(0,.041)],32);
    mesh(fixed,body,M.olive);const stripe=mesh(fixed,new T.CylinderGeometry(.031,.033,.006,32),mat(0xb8a54b,.05,.83),0,.024,0);stripe.material.userData.ownedCsWeaponMaterial=true;
    mesh(fixed,new T.CylinderGeometry(.013,.016,.015,20),M.dark,0,.047,0);
    for(const y of [-.02,.008])mesh(fixed,new T.TorusGeometry(.034,.0007,5,32),M.dark,0,y,0).rotation.x=Math.PI/2;
    r.lever=part(fixed,'safety-lever',0,.055,0);
    profile(r.lever,[[-.014,.006],[.026,.006],[.042,-.024],[.043,-.077],[.038,-.077],[.037,-.026],[.022,.001],[-.014,.001]],.012,M.edge);
    r.pin=part(fixed,'grenade-pin');rod(r.pin,[-.020,.050,0],[.016,.050,0],.0017,M.edge);
    mesh(r.pin,new T.TorusGeometry(.011,.0015,8,24),M.edge,-.028,.050,0).rotation.y=Math.PI/2;
    r.restRight.set(.018,-.009,.028);r.restLeft.set(-.17,-.07,.08);r.supportGrip='pistol';r.muzzle.set(0,.025,-.04);
  }else if(id==='armor'){box(fixed,0,0,0,.42,.49,.14,M.olive);for(let i=-1;i<=1;i++)box(fixed,i*.13,-.04,-.095,.10,.19,.063,M.dark);}else if(id==='knife'){if(r.knifeModel==='butterfly')buildButterflyKnife(r,{part,profile,mesh,rod,screw,batch,M});else(r.knifeModel==='classic'?classicKnife:karambit)(r);}else rifle(r,id,w);
    for(const p of [fixed,magazine,action,boltHandle,slide,cover,pump,r.shell,r.suppressor].filter(Boolean))batch(p);
  }
  for(const p of [magazine,action,boltHandle,slide,cover,pump]){p.userData.restPosition=p.position.clone();p.userData.restQuaternion=p.quaternion.clone();}
  if(hands&&id==='knife')makeKnifeHands(g,r);
  else if(hands&&id!=='armor'){const firearm=(!w.utility&&id!=='knife')||id==='he',style=r.supportGrip||(w.pistol||id==='tmp'?'vertical':'underhand'),arm=firearm?makeGripArm:makeArm;r.left=arm(g,'left',r.restLeft.clone().multiply(core.scale),style);r.right=arm(g,'right',r.restRight.clone().multiply(core.scale),style);const casing=part(g,'ejected-case');cylinder(casing,0,0,0,.0045,w.pistol?.019:.030,M.brass);batch(casing);r.casing=casing;casing.visible=false;
    if(id==='he')for(const a of [r.left,r.right]){
      const left=a===r.left,y=new T.Vector3(left?.62:-.40,.60,-.65).normalize(),x=new T.Vector3(0,0,left?1:-1);x.addScaledVector(y,-x.dot(y)).normalize();
      a.rotation.setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,new T.Vector3().crossVectors(x,y)));a.grenadeArm=true;
    }
  }
  r.muzzleSuppressed=r.muzzle.clone();g.userData={rig:r,id};g.traverse(o=>{if(o.isMesh){o.castShadow=!hands;o.receiveShadow=!hands;}});return g;
}
