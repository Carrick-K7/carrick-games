import * as THREE from 'three';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import { PLAYER_RADIUS, setVillaColliderNarrowPhase, type VillaCollider } from './villaWorld.js';
import { createVillaScooter, registerVillaScooterColliders, villaScooterAnchors, VILLA_SCOOTER_LIMITS, type VillaScooterState } from './villaScooter.js';
import { villaTerrainOrientation } from './villaEstateLayout.js';
import { bentRail, ovalLoop, roundedLoop, sectionLoft, turnedSection, type P3 } from './villaVehicleSections.js';
import { motorContact, motorTyreStock } from './villaMotorFinish.js';
import { coachLine, coachSheet } from './villaCoachwork.js';
import { scooterBench, scooterLegShield, scooterMirror, scooterInstruments, scooterNeedleAngle, scooterHandControl } from './villaScooterPresswork.js';

/** A mudguard pressed over the tyre, with returned edges and a free underside.
 * Its transverse crown widens through the spray area, then tapers at the tip. */
function mudguard(b: VillaModelBuilder, y: number, z: number, rear: boolean, mat: THREE.Material) {
  const rows = Array.from({length:19},(_,i)=>{
    const t=i/18,a=(rear ? -1.34+t*2.45 : -1.13+t*2.47), w=.061+.024*Math.sin(t*Math.PI);
    const crown=[[-1,.249],[-.94,.263],[-.62,.278],[0,.285],[.62,.278],[.94,.263],[1,.249],
      [.91,.249],[.84,.259],[.58,.270],[0,.277],[-.58,.270],[-.84,.259],[-.91,.249]];
    return crown.map(([x,r]):P3=>[x*w,y+Math.cos(a)*r,z+Math.sin(a)*r]);
  }); b.geometry(sectionLoft(rows),mat);
}

/** Cast vinyl grain is shallower and less directional than vulcanised tread.
 * The 36 mm swatch repeats across the bench, including the upholstered roll. */
function saddleVinyl(g: THREE.BufferGeometry) {
  const n=48, pixels=new Uint8Array(n*n*4);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++) {
    const ox=x+.79*Math.sin(y*Math.PI/6),oy=y+.71*Math.cos(x*Math.PI/8);
    const pebble=.5+.5*Math.sin(ox*Math.PI*.5)*Math.sin(oy*Math.PI*.5);
    const h=Math.round(185+pebble*51+8*((x*37+y*11+x*y*7)%17)/17);
    pixels.set([h,h,h,255],4*(y*n+x));
  }
  const map=new THREE.DataTexture(pixels,n,n);map.name='saddle/embossed-vinyl';map.wrapS=map.wrapT=THREE.RepeatWrapping;
  map.generateMipmaps=true;map.minFilter=THREE.LinearMipmapLinearFilter;map.magFilter=THREE.LinearFilter;map.needsUpdate=true;
  const mat=new THREE.MeshStandardMaterial({color:0x46413b,roughness:.71,bumpMap:map,bumpScale:.00043,roughnessMap:map});
  mat.name='saddle/grained-vinyl';
  const p=g.getAttribute('position'),uv=new Float32Array(p.count*2);
  for(let i=0;i<p.count;i++){uv[2*i]=(p.getX(i)+.64*p.getY(i))/.036;uv[2*i+1]=p.getZ(i)/.036;}
  g.setAttribute('uv',new THREE.BufferAttribute(uv,2));return mat;
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
  const sage = new THREE.MeshPhysicalMaterial({color:0x88a79a,metalness:.12,roughness:.41,clearcoat:.82,clearcoatRoughness:.18});
  const trim = villaMaterial('#d4d8c9', .32, .42), rubber = villaMaterial('#303332', .88);
  const steel = villaMaterial('#a9adaa', .34, .63), dark = villaMaterial('#3c4542', .61, .17);
  sage.name='scooter/stoved-enamel'; steel.name='scooter/satin-alloy'; rubber.name='scooter/moulded-elastomer';
  const radius=VILLA_SCOOTER_LIMITS.wheelRadius, stock=motorTyreStock(radius,radius,.107,'scooter',0x252928);
  const lens = new THREE.MeshPhysicalMaterial({ color: '#eae7d4', emissive: '#e7ddb9', emissiveIntensity: .63, roughness: .26, clearcoat:.92,clearcoatRoughness:.10 });
  const rearLens = new THREE.MeshPhysicalMaterial({ color: '#af382e', emissive: '#b93223', emissiveIntensity: .35, roughness: .31,clearcoat:.88,clearcoatRoughness:.12 });
  // Silver retains a readable diffuse edge on unprobed software GL, instead of
  // turning into the same black disk as its gasket. Hardware still catches IBL.
  const mirror = villaMaterial('#b6c8c8', .21, .38);
  // Low battery tray, generous open step-through and ribbed floor mat.
  const tray=(w:number,l:number,y:number,bow=0)=>roundedLoop(w,l,.096,5).map(([x,z]):P3=>
    [x*(.89+.10*Math.cos((z+.09)*8)),y+bow*(z/.44)**4,z]);
  // Return the pressing INTO the mat rebate. The old bowed cap bridged over
  // the centre of the pad and swallowed most of its rubber ribs in the side view.
  body.geometry(sectionLoft([tray(.315,.81,.206,.028),tray(.371,.843,.228,.028),tray(.403,.86,.27,.02),
    tray(.393,.846,.343),tray(.349,.758,.348),tray(.345,.754,.337)],true,false),sage);
  body.geometry(sectionLoft([tray(.345,.754,.337),tray(.344,.752,.350),tray(.333,.742,.355)]),rubber);
  for(let i=0;i<8;i++) {const z=-.246+i*.064;body.geometry(bentRail([[-.126,.357,z-.020],[-.066,.357,z+.002],
    [0,.357,z+.012],[.066,.357,z+.002],[.126,.357,z-.020]],.0037,6),dark);}
  for(const side of [-1,1]) body.geometry(bentRail([[side*.138,.259,-.370],[side*.172,.259,-.253],[side*.189,.263,-.074],
    [side*.180,.272,.102],[side*.150,.284,.279]],.007,7),trim);
  for (const side of [-1, 1]) {
    body.beam([side * .14, .3, -.4], [side * .13, .62, -.51], .026, steel);
  }
  // Rear motor/battery cowl and a single padded bench: visibly not a bicycle.
  const cowl=(y:number,rx:number,rz:number,z:number)=>ovalLoop(rx,rz,32,.71).map(([x,v]):P3=>[x*(1-.16*v/rz),y+.018*(v/rz)**2,z+v]);
  const press: [number,number,number,number][] = [[.284,.128,.238,-.448],[.382,.195,.281,-.486],
    [.526,.236,.319,-.514],[.626,.223,.317,-.518],[.681,.185,.287,-.491]];
  body.geometry(sectionLoft(press.map(p=>cowl(...p))),sage);
  // Fitted left controller air inlet: a dark plenum below the seat, with a
  // rolled rim and four lanced lips. Their mouths open rearwards/downwards.
  // Follow the die rather than placing parallel stickers across a curved cowl.
  const skin=(side:number,y:number,z:number,lift:number):P3=>{
    const next=press.findIndex(p=>p[0]>y),i=next<0?press.length-1:Math.max(1,next);
    const a=press[i-1],b=press[i],t=(y-a[0])/(b[0]-a[0]);
    const rx=a[1]+(b[1]-a[1])*t,rz=a[2]+(b[2]-a[2])*t,cz=a[3]+(b[3]-a[3])*t,s=(z-cz)/rz;
    const x=rx*(1-.16*s)*(1-Math.abs(s)**(2/.71))**(.71/2);
    return [side*(x+lift),y+.018*s*s,z];
  };
  const vent=(w:number,h:number,lift:number)=>roundedLoop(w,h,.035,4).map(([z,y])=>skin(-1,.480+y+.048*z,-.531+z,lift));
  body.geometry(sectionLoft([vent(.302,.140,0),vent(.303,.140,.008),vent(.287,.125,.010),vent(.274,.113,.004)],true,false,[-1,0,0]),sage);
  body.geometry(sectionLoft([vent(.274,.113,.004),vent(.268,.108,.0045)],false,false,[-1,0,0]),dark);
  body.geometry(coachSheet(10,4,(u,v)=>{
    const z=(u-.5)*(.235+.036*Math.sin(v*Math.PI));return skin(-1,.480+(v-.5)*.111+.048*z,-.531+z,.006);
  },[-1,0,0]),dark);
  for(let i=0;i<4;i++){
    const y=.441+i*.025,w=.115-Math.abs(1.5-i)*.008;
    body.geometry(coachSheet(8,3,(u,v)=>{const z=(2*u-1)*w;
      return skin(-1,y+.048*z+v*.017,-.531+z+.012*v,.007+.014*(1-v)*Math.sin(Math.PI*u));},[-1,0,0]),sage);
  }
  for(const side of [-1,1]){
    coachLine(body,t=>skin(side,.590+.02*t,-.705+.35*t,.003),trim,.0037,12);
    coachLine(body,t=>skin(side,.646+.010*Math.sin(t*Math.PI),-.737+.462*t,.0008),dark,.0033,20);
  }
  scooterBench(body,saddleVinyl,rubber,dark,steel);
  const tailPort=(z:number,w:number,h:number)=>roundedLoop(w,h,.015).map(([x,y]):P3=>[x,.625+y,z+.43*x*x]);
  body.geometry(sectionLoft([tailPort(-.792,.205,.062),tailPort(-.836,.189,.063),tailPort(-.840,.173,.051)],true,false),dark);
  body.geometry(sectionLoft([tailPort(-.839,.173,.051),tailPort(-.847,.159,.044),tailPort(-.850,.144,.032)]),rearLens);
  for(const y of [-.008,.008])coachLine(body,t=>{const x=(t-.5)*.135;return [x,.625+y,-.852+.43*x*x];},rearLens,.0018,10);
  body.geometry(bentRail([[-.164,.696,-.655],[-.202,.750,-.729],[-.196,.781,-.797],[-.137,.79,-.840],
    [0,.791,-.853],[.137,.79,-.840],[.196,.781,-.797],[.202,.750,-.729],[.164,.696,-.655]],.013,9),steel);
  scooterLegShield(body,sage,dark,trim);
  body.geometry(bentRail([[0,.607,.443],[0,.593,.399],[0,.603,.382],[0,.618,.386]],.007,7),trim);
  body.geometry(sectionLoft([[.215,.065,.051],[.222,.080,.058],[.226,.072,.050]].map(([x,w,h])=>
    roundedLoop(w,h,.014).map(([z,y]):P3=>[x,.52+y,-.407+z]))),dark);
  for (const side of [-1,1]) {
    body.beam([side*.085,.285,-.29],[side*.085,.235,-.65],.035,steel);
    body.beam([side*.149,.55,-.53],[side*.106,.324,-.617],.022,dark);
    body.beam([side*.110,.342,-.610],[side*.090,.240,-.649],.013,steel);
    body.cylinder(side*.101,.237,-.650,.015,.015,.020,dark,[0,0,Math.PI/2],8);
  }
  // Hub-motor phase lead is clamped to the swingarm, not wound round the rotating hub.
  body.geometry(bentRail([[-.108,.245,-.652],[-.122,.225,-.630],[-.124,.236,-.589],[-.111,.263,-.510],
    [-.111,.270,-.422],[-.122,.285,-.382],[-.125,.327,-.370]],.0052,8),rubber);
  // Small rear wheel mudguard, open underneath rather than a solid covering.
  mudguard(body,.235,-.65,true,sage);
  body.finish();
  const tyre = (parentNode: THREE.Object3D, name: string) => {
    const w = new VillaModelBuilder(parentNode, name), casing=stock.mount(w.root,[0,0,0]);
    w.geometry(turnedSection([[-.043,.146],[-.039,.152],[.039,.152],[.043,.146],[.035,.134],[-.035,.134]],36),steel);
    for(let i=0;i<6;i++) {
      const a=i*Math.PI/3;
      w.geometry(sectionLoft([[.139,.022,.24],[.108,.018,.25],[.077,.016,.18],[.039,.022,.06]].map(([r,h,sweep])=>
        ovalLoop(h,.016,8,.68).map(([t,x]):P3=>[x+(r-.08)*.16,Math.cos(a+sweep)*r-Math.sin(a+sweep)*t,Math.sin(a+sweep)*r+Math.cos(a+sweep)*t]))),steel);
    }
    const motor=name==='scooterRearWheel';
    w.cylinder(0,0,0,motor?.099:.044,motor?.093:.048,motor?.084:.077,dark,[0,0,Math.PI/2],24);
    if(motor) for(const side of [-1,1]) w.geometry(turnedSection([[side*.040,.09],[side*.045,.085],[side*.045,.067],[side*.041,.065]],28),steel);
    else {
      // Punched stainless rotor, with real daylight through the drillings.
      // The rotor and its carrier spin; the caliper castings stay on the fork.
      const rotor=new THREE.Shape();rotor.absarc(0,0,.106,0,2*Math.PI,false);
      const bore=new THREE.Path();bore.absarc(0,0,.072,0,2*Math.PI,true);rotor.holes.push(bore);
      for(let i=0;i<12;i++){
        const a=i*Math.PI/6,r=i%2?.095:.085, hole=new THREE.Path();
        hole.absarc(r*Math.cos(a),r*Math.sin(a),.0037,0,2*Math.PI,true);rotor.holes.push(hole);
      }
      const disc=new THREE.ExtrudeGeometry(rotor,{depth:.004,bevelEnabled:false,curveSegments:6,steps:1});
      w.geometry(disc,steel,[-.053,0,0],[0,-Math.PI/2,0]);
      for(let i=0;i<5;i++){
        const a=i*Math.PI*.4;w.beam([-.049,.034*Math.cos(a),.034*Math.sin(a)],[-.054,.076*Math.cos(a+.23),.076*Math.sin(a+.23)],.008,dark,7);
      }
    }
    w.cylinder(0,0,0,.026,.026,.116,steel,[0,0,Math.PI/2],16);
    w.finish(); return {rotor:w.root,casing};
  };
  const rear = tyre(lean, 'scooterRearWheel'); rear.rotor.position.set(0, .235, -.65);
  const front = new THREE.Group(); front.name = 'scooterSteeringFork'; front.position.set(0, .235, .65); lean.add(front);
  const fork = new VillaModelBuilder(front, 'scooterHandlebars');
  const amber = new THREE.MeshPhysicalMaterial({color:0xc07831,emissive:0x7e3714,emissiveIntensity:.11,roughness:.36,clearcoat:.9,clearcoatRoughness:.13});
  for (const side of [-1, 1]) {
    fork.beam([side*.077,0,0],[side*.077,.204,-.055],.022,dark);
    fork.beam([side*.077,.197,-.053],[side*.077,.425,-.115],.0155,steel);
    fork.beam([side*.077,.191,-.052],[side*.077,.206,-.056],.024,rubber);
    fork.beam([side*.077,.386,-.104],[side*.077,.47,-.12],.024,dark);
    const plate=(x:number,w:number,h:number)=>roundedLoop(w,h,.008).map(([z,y]):P3=>[side*x,.150+y,-.041+z-.27*y]);
    fork.geometry(sectionLoft([plate(.095,.034,.075),plate(.101,.032,.073),plate(.102,.025,.065)],true,false,[side,0,0]),rubber);
    fork.geometry(sectionLoft([plate(.102,.025,.065),plate(.104,.021,.059)],false,true,[side,0,0]),amber);
  }
  const jaw=(x:number,w:number,h:number)=>roundedLoop(w,h,.015).map(([z,y]):P3=>[x,.067+y+.50*z,-.079+z-.31*y]);
  fork.geometry(sectionLoft([jaw(-.044,.034,.051),jaw(-.049,.048,.063),jaw(-.067,.052,.068),jaw(-.076,.042,.052)],true,true,[-1,0,0]),dark);
  fork.beam([-.075,.045,-.012],[-.066,.076,-.071],.009,steel);
  fork.geometry(bentRail([[-.077,.088,-.085],[-.087,.107,-.104],[-.087,.144,-.104],[-.093,.285,-.105],[-.088,.439,-.141],
    [-.071,.555,-.161],[-.058,.681,-.219],[-.093,.766,-.263],[-.178,.784,-.265],[-.228,.837,-.254]],.0046,7),rubber);
  const clamp=(width:number,y:number,depth:number)=>ovalLoop(width,depth,18,.69).map(([x,z]):P3=>[x,y-.016*(x/width)**2,-.112+z]);
  fork.geometry(sectionLoft([clamp(.093,.389,.024),clamp(.108,.400,.033),clamp(.104,.424,.034),clamp(.091,.431,.027)]),dark);
  fork.beam([0, .414, -.110], [0, .83, -.2], .031, steel);
  mudguard(fork,0,0,false,sage);
  const nacelle=(y:number,w:number,d:number)=>ovalLoop(w,d,26,.7).map(([x,z]):P3=>[x,y-z*.15,z-.19]);
  fork.geometry(sectionLoft([nacelle(.775,.136,.082),nacelle(.808,.182,.10),nacelle(.856,.19,.101),
    nacelle(.897,.163,.09),nacelle(.905,.123,.066)]),sage);
  const port=(w:number,h:number,z:number)=>roundedLoop(w,h,h*.47).map(([x,y]):P3=>[x,.84+y,z-x*x*1.52]);
  fork.geometry(sectionLoft([port(.277,.100,-.112),port(.280,.102,-.087),port(.269,.090,-.082)],true,false),rubber);
  fork.geometry(sectionLoft([port(.269,.090,-.082),port(.264,.087,-.075),port(.247,.072,-.074)],false,false),trim);
  fork.geometry(sectionLoft([port(.247,.072,-.074),port(.236,.062,-.070)]),lens);
  const flutes=coachSheet(24,4,(u,v)=>{const x=(u-.5)*(.192+.035*Math.sin(Math.PI*v));
    return [x,.84+(v-.5)*.055,-.069-x*x*1.52+.005*Math.sin(Math.PI*v)+.0026*(1-2*Math.abs((u*12%1)-.5))];},[0,0,1]);
  const face=flutes.toNonIndexed();flutes.dispose();face.computeVertexNormals();fork.geometry(face,lens);
  const speedPointer=scooterInstruments(fork,front,dark,rubber,trim,amber);
  fork.geometry(bentRail([[-.345,.846,-.225],[-.245,.849,-.212],[-.165,.833,-.18],[0,.829,-.17],
    [.165,.833,-.18],[.245,.849,-.212],[.345,.846,-.225]],.014,8),steel);
  for (const side of [-1, 1]) {
    fork.geometry(turnedSection([[-.061,.014],[-.061,.029],[-.055,.029],[-.050,.020],[-.033,.021],
      [-.031,.019],[-.026,.021],[.011,.021],[.015,.019],[.020,.022],[.055,.023],[.060,.019],[.060,.014]].map(([x,r])=>[side*x,r]),14),rubber,[side*.313,.846,-.225]);
    scooterHandControl(fork,side,dark,rubber,steel);
    fork.geometry(bentRail([[side*.234,.862,-.222],[side*.246,.904,-.212],[side*.308,1.003,-.155],[side*.366,1.042,-.13]],.006,8),steel);
    scooterMirror(fork,side,dark,mirror);
  }
  fork.finish();
  const frontWheel = tyre(front, 'scooterFrontWheel');
  const updateContact=motorContact(root,[rear.casing,frontWheel.casing],0,.65,.84);
  const standBuilder = new VillaModelBuilder(lean, 'scooterFoldingStand');
  standBuilder.root.position.set(.14, .345, -.38);
  standBuilder.beam([0, 0, 0], [.15, -.333, -.035], .012, steel);
  // A flared all-steel landing shoe is welded to the arm. One material batch
  // here funds the independently moving speedometer without adding a draw.
  const shoe=(y:number,w:number,d:number)=>roundedLoop(w,d,.009,2).map(([x,z]):P3=>[.15+x,y,-.035+z+x*.18]);
  standBuilder.geometry(sectionLoft([shoe(-.345,.073,.055),shoe(-.339,.078,.058),shoe(-.334,.054,.040),shoe(-.328,.024,.025)]),steel);standBuilder.finish();
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
    speedPointer.rotation.y=scooterNeedleAngle(speed);
    const spin = (wheelTravel / VILLA_SCOOTER_LIMITS.wheelRadius) % (Math.PI * 2);
    frontWheel.rotor.rotation.x = rear.rotor.rotation.x = spin;
    // Spokes, hub and rotor roll. The mould travels into a load patch which
    // stays on the ROAD, not a flat spot rotating up over the mudguard.
    frontWheel.casing.mesh.rotation.x=rear.casing.mesh.rotation.x=-spin;
    stock.rubber.map!.offset.y=-spin*stock.repeats/(Math.PI*2);
    updateContact();
    stand.rotation.x = mounted ? -1.4 : 0;
    rearLens.emissiveIntensity = scooter.handbrake ? 1.4 : .35;
    root.updateWorldMatrix(true, false); inverse.copy(root.matrixWorld).invert();
    Object.assign(collider, villaScooterAnchors(pose).body);
    return true;
  };
  update(0, {});
  return { colliders, update };
}
