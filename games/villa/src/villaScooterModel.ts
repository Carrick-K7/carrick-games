import * as THREE from 'three';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import { PLAYER_RADIUS, setVillaColliderNarrowPhase, type VillaCollider } from './villaWorld.js';
import { createVillaScooter, registerVillaScooterColliders, villaScooterAnchors, VILLA_SCOOTER_LIMITS, type VillaScooterState } from './villaScooter.js';
import { villaTerrainOrientation } from './villaEstateLayout.js';
import { bentRail, ovalLoop, roundedLoop, sectionLoft, turnedSection, type P3 } from './villaVehicleSections.js';

/** A mudguard pressed over the tyre, with returned edges and a free underside.
 * Its transverse crown widens through the spray area, then tapers at the tip. */
function mudguard(b: VillaModelBuilder, y: number, z: number, rear: boolean, mat: THREE.Material) {
  const rows = Array.from({length:25},(_,i)=>{
    const t=i/24,a=(rear ? -1.34+t*2.45 : -1.13+t*2.47), w=.061+.024*Math.sin(t*Math.PI);
    const crown=[[-1,.249],[-.94,.263],[-.62,.278],[0,.285],[.62,.278],[.94,.263],[1,.249],
      [.91,.249],[.84,.259],[.58,.270],[0,.277],[-.58,.270],[-.84,.259],[-.91,.249]];
    return crown.map(([x,r]):P3=>[x*w,y+Math.cos(a)*r,z+Math.sin(a)*r]);
  }); b.geometry(sectionLoft(rows),mat);
}

/** Scene-owned procedural electric step-through. All animation is a pure view of
 * state (distance drives tyres), so resetting or changing sessions leaves no drift.
 * Returned plain collider references are stable and mutated in place on update.
 */
export function createVillaScooterModel(parent: THREE.Object3D): {
  colliders: VillaCollider[];
  update(time: number, state: { scooter?: VillaScooterState; seated?: string | null }): boolean;
} {
  const root = new THREE.Group(); root.name = 'rideableElectricScooter'; parent.add(root);
  const lean = new THREE.Group(); lean.name = 'scooterLean'; root.add(lean);
  const body = new VillaModelBuilder(lean, 'scooterBody');
  const sage = villaMaterial('#8ca99b', .35, .35), trim = villaMaterial('#dce1d7', .4, .3);
  const rubber = villaMaterial('#242a2a', .9), steel = villaMaterial('#87928f', .3, .75);
  const dark = villaMaterial('#303b3b', .48, .35);
  const lens = new THREE.MeshStandardMaterial({ color: '#fff3ce', emissive: '#fff0c5', emissiveIntensity: .8, roughness: .2 });
  const rearLens = new THREE.MeshStandardMaterial({ color: '#e56250', emissive: '#db3b28', emissiveIntensity: .35, roughness: .2 });
  const mirror = villaMaterial('#a8c2c6', .12, .85);
  // Low battery tray, generous open step-through and ribbed floor mat.
  const tray=(w:number,l:number,y:number)=>roundedLoop(w,l,.096,5).map(([x,z]):P3=>
    [x*(.89+.10*Math.cos((z+.09)*8)),y+.028*(z/.44)**4,z]);
  body.geometry(sectionLoft([tray(.315,.81,.206),tray(.371,.843,.228),tray(.403,.86,.27),tray(.390,.845,.347)]),sage);
  body.geometry(sectionLoft([tray(.358,.726,.343),tray(.348,.717,.356)]),rubber);
  for(let i=0;i<8;i++) { const z=-.236+i*.068;body.geometry(bentRail([[-.14,.359,z-.007],[0,.359,z+.004],[.14,.359,z-.007]],.0038,6),dark); }
  for (const side of [-1, 1]) {
    body.beam([side * .14, .3, -.4], [side * .13, .62, -.51], .026, steel);
    body.beam([side * .14, .3, .29], [side * .105, .81, .5], .026, steel);
  }
  // Rear motor/battery cowl and a single padded bench: visibly not a bicycle.
  const cowl=(y:number,rx:number,rz:number,z:number)=>ovalLoop(rx,rz,32,.71).map(([x,v]):P3=>[x*(1-.16*v/rz),y+.018*(v/rz)**2,z+v]);
  body.geometry(sectionLoft([cowl(.284,.128,.238,-.448),cowl(.382,.195,.281,-.486),
    cowl(.526,.236,.319,-.514),cowl(.626,.223,.317,-.518),cowl(.681,.185,.287,-.491)]),sage);
  for(const side of [-1,1]) body.geometry(bentRail([[side*.155,.529,-.746],[side*.225,.542,-.598],
    [side*.229,.55,-.467],[side*.209,.569,-.361]],.0045,7),trim);
  const saddle=(y:number,rx:number,rz:number)=>ovalLoop(rx,rz,32,.67).map(([x,v]):P3=>
    [x*(1-.21*v/rz),y+.015*(v/rz)**2+.008*(x/rx)**2-.013*v/rz,-.478+v]);
  body.geometry(sectionLoft([saddle(.674,.17,.27),saddle(.696,.204,.296),saddle(.734,.207,.298),saddle(.751,.193,.28),saddle(.754,.159,.24)]),rubber);
  const piping=saddle(.734,.209,.299);body.geometry(bentRail([...piping,piping[0]],.0032,6),dark);
  body.geometry(sectionLoft([[-.783,.19,.046],[-.825,.158,.053],[-.835,.141,.039]].map(([z,w,h])=>
    roundedLoop(w,h,.015).map(([x,y]):P3=>[x,.625+y,z+.13*x*x]))),rearLens);
  body.geometry(bentRail([[-.164,.696,-.655],[-.202,.750,-.729],[-.196,.781,-.797],[-.137,.79,-.840],
    [0,.791,-.853],[.137,.79,-.840],[.196,.781,-.797],[.202,.750,-.729],[.164,.696,-.655]],.013,9),steel);
  // Curved shin shield rises only in front, preserving the open footwell.
  const apron = (width:number,z:number,y:number,turn:number,skin:number):P3[] => {
    const strip=(a:number,d:number):P3=>[a*width,y+.017*(1-a*a),z+turn*(1-a*a)-d];
    return [...Array.from({length:13},(_,i)=>strip((i-6)/6,0)),...Array.from({length:13},(_,i)=>strip((6-i)/6,skin))];
  };
  body.geometry(sectionLoft([apron(.159,.262,.336,.078,.017),apron(.207,.287,.432,.110,.019),
    apron(.232,.326,.620,.133,.021),apron(.210,.368,.792,.094,.021),apron(.132,.394,.922,.048,.023)]),sage);
  body.geometry(sectionLoft([apron(.124,.287,.441,.058,.011),apron(.180,.307,.574,.092,.016),
    apron(.168,.347,.706,.075,.014),apron(.140,.369,.802,.054,.014)]),dark);
  body.geometry(bentRail([[0,.59,.365],[0,.571,.337],[0,.585,.322],[0,.597,.324]],.008,8),trim);
  body.geometry(sectionLoft([[.215,.065,.051],[.222,.080,.058],[.226,.072,.050]].map(([x,w,h])=>
    roundedLoop(w,h,.014).map(([z,y]):P3=>[x,.52+y,-.407+z]))),dark);
  body.beam([-.085, .285, -.29], [-.085, .235, -.65], .035, steel);
  body.beam([.085, .285, -.29], [.085, .235, -.65], .035, steel);
  for (const side of [-1, 1]) body.beam([side * .15, .57, -.52], [side * .09, .235, -.65], .018, dark);
  // Small rear wheel mudguard, open underneath rather than a solid covering.
  mudguard(body,.235,-.65,true,sage);
  body.finish();
  const tyre = (parentNode: THREE.Object3D, name: string) => {
    const w = new VillaModelBuilder(parentNode, name), radius = VILLA_SCOOTER_LIMITS.wheelRadius;
    w.geometry(turnedSection([[-.034,.145],[-.049,.162],[-.054,.195],[-.043,.22],[-.022,radius],
      [.022,radius],[.043,.22],[.054,.195],[.049,.162],[.034,.145]],40),rubber);
    w.geometry(turnedSection([[-.043,.146],[-.039,.152],[.039,.152],[.043,.146],[.035,.134],[-.035,.134]],36),steel);
    for(let i=0;i<6;i++) {
      const a=i*Math.PI/3;
      w.geometry(sectionLoft([[.139,.022,.24],[.108,.018,.25],[.077,.016,.18],[.039,.022,.06]].map(([r,h,sweep])=>
        ovalLoop(h,.016,8,.68).map(([t,x]):P3=>[x+(r-.08)*.16,Math.cos(a+sweep)*r-Math.sin(a+sweep)*t,Math.sin(a+sweep)*r+Math.cos(a+sweep)*t]))),steel);
    }
    const motor=name==='scooterRearWheel';
    w.cylinder(0,0,0,motor?.099:.044,motor?.093:.048,motor?.084:.077,dark,[0,0,Math.PI/2],24);
    if(motor) for(const side of [-1,1]) w.geometry(turnedSection([[side*.040,.09],[side*.045,.085],[side*.045,.067],[side*.041,.065]],28),steel);
    w.cylinder(0,0,0,.026,.026,.116,steel,[0,0,Math.PI/2],16);
    w.finish(); return w.root;
  };
  const rear = tyre(lean, 'scooterRearWheel'); rear.position.set(0, .235, -.65);
  const front = new THREE.Group(); front.name = 'scooterSteeringFork'; front.position.set(0, .235, .65); lean.add(front);
  const fork = new VillaModelBuilder(front, 'scooterHandlebars');
  for (const side of [-1, 1]) {
    fork.beam([side * .077, 0, 0], [side * .077, .39, -.105], .022, steel);
    fork.beam([side * .077, .19, -.052], [side * .077, .47, -.12], .025, dark);
  }
  fork.beam([0, .38, -.105], [0, .83, -.2], .032, steel);
  mudguard(fork,0,0,false,sage);
  const nacelle=(y:number,w:number,d:number)=>ovalLoop(w,d,26,.7).map(([x,z]):P3=>[x,y-z*.15,z-.19]);
  fork.geometry(sectionLoft([nacelle(.775,.136,.082),nacelle(.808,.182,.10),nacelle(.856,.19,.101),
    nacelle(.897,.163,.09),nacelle(.905,.123,.066)]),sage);
  const port=(w:number,h:number,z:number)=>roundedLoop(w,h,h*.47).map(([x,y]):P3=>[x,.84+y,z-x*x*1.34]);
  fork.geometry(sectionLoft([port(.253,.084,-.115),port(.258,.087,-.098),port(.241,.071,-.094)],true,false),trim);
  fork.geometry(sectionLoft([port(.241,.071,-.094),port(.225,.058,-.089)]),lens);
  const instrument=(w:number,d:number,h:number)=>roundedLoop(w,d,.018).map(([x,z]):P3=>[x,.901+h-z*.17,-.219+z]);
  fork.geometry(sectionLoft([instrument(.159,.082,0),instrument(.154,.081,.008),instrument(.135,.064,.010)],true,false),dark);
  fork.geometry(sectionLoft([instrument(.135,.064,.010),instrument(.128,.059,.011)]),mirror);
  for(let i=0;i<4;i++) fork.geometry(bentRail([[.028+i*.005,.913,-.215],[.028+i*.005,.916,-.229]],.0012,5),trim);
  fork.geometry(bentRail([[-.345,.846,-.225],[-.245,.849,-.212],[-.165,.833,-.18],[0,.829,-.17],
    [.165,.833,-.18],[.245,.849,-.212],[.345,.846,-.225]],.014,8),steel);
  for (const side of [-1, 1]) {
    fork.geometry(turnedSection([[-.061,.014],[-.061,.029],[-.055,.029],[-.050,.020],[-.033,.021],
      [-.031,.019],[-.026,.021],[.011,.021],[.015,.019],[.020,.022],[.055,.023],[.060,.019],[.060,.014]].map(([x,r])=>[side*x,r]),18),rubber,[side*.313,.846,-.225]);
    fork.box(side * .234, .848, -.233, .035, .044, .054, dark, .007);
    fork.geometry(bentRail([[side*.225,.837,-.251],[side*.235,.837,-.271],[side*.278,.833,-.283],
      [side*.33,.829,-.279],[side*.355,.831,-.274]],.0055,8),steel);
    fork.geometry(bentRail([[side*.234,.862,-.222],[side*.246,.904,-.212],[side*.308,1.003,-.155],[side*.366,1.042,-.13]],.006,8),steel);
    fork.ellipsoid(side * .367, 1.047, -.13, .065, .043, .019, dark);
    fork.ellipsoid(side * .367, 1.047, -.149, .055, .034, .004, mirror);
  }
  fork.finish();
  const frontWheel = tyre(front, 'scooterFrontWheel');
  const standBuilder = new VillaModelBuilder(lean, 'scooterFoldingStand');
  standBuilder.root.position.set(.14, .345, -.38);
  standBuilder.beam([0, 0, 0], [.15, -.305, -.035], .012, steel);
  standBuilder.box(.15, -.31, -.035, .095, .016, .07, dark, .003); standBuilder.finish();
  const stand = standBuilder.root;
  root.userData = { rideable: true, electric: true, stepThrough: true, wheels: 2, front: '+Z', dynamicTransforms: ['scooterFrontWheel', 'scooterRearWheel', 'scooterSteeringFork', 'scooterFoldingStand', 'scooterLean'] };
  const fallback = createVillaScooter();
  const collider: VillaCollider = { ...villaScooterAnchors(fallback).body }, colliders = [collider];
  registerVillaScooterColliders(colliders);
  let pose = { x: fallback.x, z: fallback.z, yaw: fallback.yaw }, previous = '';
  const inverse = new THREE.Matrix4(), query = new THREE.Vector3();
  // Pedestrians use a tighter rounded OBB, not the broadphase's rotated AABB.
  setVillaColliderNarrowPhase(collider, (p, height) => {
    if (p.y >= collider.maxY || p.y + height <= collider.minY) return false;
    query.set(p.x, p.y, p.z).applyMatrix4(inverse);
    const { x, z } = query;
    return Math.hypot(Math.max(0, Math.abs(x) - VILLA_SCOOTER_LIMITS.halfWidth), Math.max(0, Math.abs(z) - VILLA_SCOOTER_LIMITS.halfLength)) < PLAYER_RADIUS;
  });
  const update = (_time: number, state: { scooter?: VillaScooterState; seated?: string | null }): boolean => {
    const candidate = state.scooter ?? fallback;
    const scooter = [candidate.x, candidate.z, candidate.yaw].every(Number.isFinite) ? candidate : fallback;
    const speed = Number.isFinite(scooter.speed) ? Math.max(-VILLA_SCOOTER_LIMITS.maxReverse, Math.min(VILLA_SCOOTER_LIMITS.maxSpeed, scooter.speed)) : 0;
    const steering = Number.isFinite(scooter.steering) ? Math.max(-.5, Math.min(.5, scooter.steering)) : 0;
    const distance = Number.isFinite(scooter.distance) ? scooter.distance : 0;
    const wheelTravel = Number.isFinite(scooter.wheelTravel) ? scooter.wheelTravel! : distance;
    const mounted = state.seated === 'scooter';
    const signature = [scooter.x, scooter.z, scooter.yaw, speed, steering, wheelTravel, mounted, scooter.handbrake].join('/');
    if (signature === previous) return false;
    previous = signature; pose = { x: scooter.x, z: scooter.z, yaw: scooter.yaw };
    const terrain = villaTerrainOrientation(pose.x, pose.z, pose.yaw);
    root.position.set(pose.x, terrain.y, pose.z); root.rotation.set(terrain.pitch, pose.yaw, terrain.roll, terrain.order);
    lean.rotation.z = mounted ? Math.max(-.1, Math.min(.1, steering * speed * .032)) : 0;
    front.rotation.y = steering === 0 ? 0 : -steering;
    frontWheel.rotation.x = rear.rotation.x = (wheelTravel / VILLA_SCOOTER_LIMITS.wheelRadius) % (Math.PI * 2);
    stand.rotation.x = mounted ? -1.4 : 0;
    rearLens.emissiveIntensity = scooter.handbrake ? 1.4 : .35;
    root.updateWorldMatrix(true, false); inverse.copy(root.matrixWorld).invert();
    Object.assign(collider, villaScooterAnchors(pose).body);
    return true;
  };
  update(0, {});
  return { colliders, update };
}
