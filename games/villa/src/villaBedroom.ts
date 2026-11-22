import * as THREE from 'three';
import { villaMaterial } from './villaModel.js';
import { cabinetPull, panel, surround, vessel, type Section }  from './villaFittingGeometry.js';
import { FittedCaseBuilder, fittedVeneer, wovenCloth } from './villaCabinetDressings.js';
import { createVillaRoomMirror } from './villaInteriorMirror.js';
import type { VillaCollider } from './villaWorld.js';

import { createVillaWardrobe, VILLA_MASTER_WARDROBE, type VillaWardrobeState } from './villaWardrobe.js';
import { registerVillaSeatCollider, villaRelaxSeat } from './villaSeating.js';
export { VILLA_MASTER_WARDROBE } from './villaWardrobe.js';
import { VILLA_MASTER_VANITY, VILLA_MASTER_MIRROR, VILLA_MASTER_STOOL } from './villaBedroomLayout.js';
export { VILLA_MASTER_VANITY, VILLA_MASTER_MIRROR, VILLA_MASTER_STOOL } from './villaBedroomLayout.js';
export const VILLA_VANITY_ACCESSORIES = ['brush-cup', 'lipstick', 'compact', 'perfume-bottle', 'jewelry-tray'] as const;

/** Scene-owned joinery; controller owns pure wardrobe state, no DOM or render targets. */
export function createVillaBedroom(parent: THREE.Object3D): { colliders: VillaCollider[]; update(state?: VillaWardrobeState, lightOn?: boolean): boolean } {
  const b = new FittedCaseBuilder(parent, 'Villa master bedroom');
  const oak = fittedVeneer('#b69771', 0xfff1dd), shadowOak = fittedVeneer('#786047', 0x9b806a);
  const linen = wovenCloth('#e4ddca', 'oxford'), sage = villaMaterial('#98a18a', .80);
  const brass = villaMaterial('#b99b65', 0.34, 0.72), stone = villaMaterial('#eee5d6', 0.43);
  // A restrained diffuse component keeps the mirror readable on software GL,
  // whose scene deliberately omits the expensive environment prefilter.
  const mirror = createVillaRoomMirror('master', '#d1dfe0'); mirror.name = 'Bedroom polished mirror';
  const glow = villaMaterial('#fff0d7', 0.55); glow.emissive.set('#ffddb0'); glow.emissiveIntensity = 0.65;
  const charcoal = villaMaterial('#484039', 0.75), rose = villaMaterial('#b66c75', 0.63);
  const porcelain = villaMaterial('#e6e2d7', .22);
  const crystal = new THREE.MeshStandardMaterial({color:0xffffff,roughness:.135,metalness:.08,flatShading:true,
    vertexColors:true,transparent:true,depthWrite:false}); crystal.name = 'Vanity/cut crystal';
  stone.userData.villaInteriorFinish='limestone'; stone.userData.villaInteriorSwatchTint=0xfff8ee;
  const facets = (sections:Section[],tint:string,alpha:number,sides=10) => {
    const g=vessel(sections,sides,.68), color=new THREE.Color(tint), count=g.getAttribute('position').count, rgba=new Float32Array(count*4);
    for(let i=0;i<count;i++){rgba[i*4]=color.r;rgba[i*4+1]=color.g;rgba[i*4+2]=color.b;rgba[i*4+3]=alpha;}
    g.setAttribute('color',new THREE.BufferAttribute(rgba,4)); return g;
  };
  const marker = (kind: string, x: number, y: number, z: number, data: Record<string, unknown> = {}) => {
    const node = new THREE.Object3D(); node.name = `Bedroom/${kind}`; node.position.set(x, y, z);
    node.userData = { kind, ...data }; b.root.add(node); return node;
  };
  const w = VILLA_MASTER_WARDROBE;
  const wardrobe = createVillaWardrobe(b.root); b.colliders.push(...wardrobe.colliders);

  const v = VILLA_MASTER_VANITY;
  marker('dressing-table', v.x, v.y, v.z, { openKneeSpace: true, kneeWidth: v.kneeWidth, kneeHeight: v.kneeHeight, drawers: 2 });
  b.at(v.x, v.y, v.z, 0, () => {
    // Table is open underneath: independent legs/drawers, not a solid cabinet box.
    const legX = v.width / 2 - .115, legZ = v.depth / 2 - .095;
    for (const x of [-legX, legX]) for (const z of [-legZ, legZ]) {
      b.geometry(vessel([[.036, .028], [.042, .070], [.037, .096], [.028, .152], [.032, .51], [.041, .615],
        [.040, .645], [.034, .65], [.039, .659], [.040, .72], [0, .73]], 14), oak, [x, 0, z]);
      b.geometry(vessel([[0, 0], [.034, 0], [.042, .005], [.044, .013], [.043, .064], [.045, .068],
        [.045, .073], [.039, .076]], 16), brass, [x, 0, z]);
      b.collide(x, 0, z, 0.09, 0.73, 0.09);
    }
    const braceZ = -v.depth / 2 + .068;
    b.box(0, 0.68, braceZ, v.width - .19, 0.12, 0.07, oak, 0.008);
    b.collide(0, 0.62, braceZ, v.width - .19, 0.12, 0.07);
    const drawerWidth = (v.width - v.kneeWidth) / 2 - .045;
    const drawerX = v.kneeWidth / 2 + .015 + drawerWidth / 2;
    for (const x of [-drawerX, drawerX]) {
      const faceZ = v.depth / 2 - .052;
      for (const edge of [-1, 1]) b.box(x + edge * (drawerWidth / 2 - .015), .645, 0, .03, .24, v.depth - .1, oak, .006);
      b.box(x, .539, 0, drawerWidth - .055, .028, v.depth - .10, oak, .005);
      b.box(x, .645, -faceZ + .016, drawerWidth - .055, .202, .03, shadowOak, .005);
      b.geometry(surround(drawerWidth, .24, .02, [[0, -.02], [0, .012], [.006, .017], [.024, .017], [.033, .008], [.033, -.014]], 3), oak, [x, .645, faceZ]);
      b.geometry(panel(drawerWidth - .052, .188, .017, .021, .003), sage, [x, .645, faceZ]);
      b.geometry(cabinetPull(.182, .033, .009), brass, [x, .665, faceZ + .009]);
      b.collide(x, 0.525, 0.015, drawerWidth, 0.24, v.depth - .01);
    }
    b.box(0, 0.743, 0, v.width - 0.07, 0.055, v.depth - 0.04, oak, 0.017);
    b.box(0, 0.789, 0, v.width, 0.062, v.depth, stone, 0.027);
    b.collide(0, 0.715, 0, v.width, 0.105, v.depth);

    // Two orderly accessory groups leave a generous clear worktop in the middle.
    const trayX = -v.width / 2 + .48, perfumeX = trayX - .18, lipstickX = trayX + .08;
    const compactX = v.width / 2 - .62, cupX = v.width / 2 - .25;
    marker('jewelry-tray', v.x + trayX, v.y + v.height, v.z + .08);
    b.geometry(vessel([[0, 0], [.222, 0, .105], [.247, .005, .125], [.262, .014, .141], [.270, .039, .145],
      [.268, .044, .143], [.262, .045, .137], [.251, .019, .127], [.229, .014, .108], [0, .014]], 32, .48), porcelain, [trayX, .82, .07]);
    for (const [dx, dz, size] of [[.165, .024, .026], [.18, -.035, .017]]) {
      b.geometry(new THREE.TorusGeometry(size, .003, 7, 20), brass, [trayX + dx, .838, .07 + dz], [Math.PI / 2, 0, .12]);
    }
    marker('perfume-bottle', v.x + perfumeX, v.y + v.height, v.z + .035);
    // A double-wall decanter: thick heel, shoulder, neck and returned clear lip.
    // The amber fill has its own level inside, not an opaque tan bottle painted gold.
    b.geometry(facets([[0,0],[.060,0,.043],[.071,.011,.054],[.073,.03,.055],[.073,.136,.055],
      [.061,.153,.046],[.026,.169,.022],[.025,.190,.022],[.019,.190,.016],[.019,.172,.016],[.059,.146,.044],
      [.066,.132,.050],[.066,.025,.050],[.054,.018,.038],[0,.018]],'#e9f3f0',.34),crystal,[perfumeX,.834,.035]);
    b.geometry(facets([[0,.019],[.053,.019,.037],[.065,.026,.049],[.065,.104,.049],[.063,.102,.047],[0,.102]],'#bd8149',.85),crystal,[perfumeX,.834,.035]);
    b.geometry(facets([[.016,-.014,.014],[.017,.008,.015],[.022,.014,.019],[.039,.025,.027],[.045,.049,.030],
      [.031,.066,.024],[.020,.076,.016],[0,.078]],'#e9e0ce',.69,8),crystal,[perfumeX,1.022,.035]);
    b.geometry(vessel([[.023,0],[.028,.002],[.028,.011],[.024,.013],[.021,.011]],14),brass,[perfumeX,1.009,.035]);
    marker('lipstick', v.x + lipstickX, v.y + v.height, v.z + .11);
    b.geometry(vessel([[0, 0], [.022, 0], [.026, .003], [.026, .048], [.027, .050], [.027, .056], [.023, .058],
      [.022, .091], [.019, .092], [.018, .074]], 20), brass, [lipstickX, .834, .11]);
    const bullet = vessel([[.017, 0], [.018, .012], [.018, .041], [.017, .046], [.014, .048], [.010, .0495], [0, .050]], 20);
    const points = bullet.getAttribute('position');
    for (let i = 0; i < points.count; i++) {
      const y = points.getY(i); points.setY(i, y + THREE.MathUtils.smoothstep(y, .012, .041) * points.getX(i) * .85);
    }
    bullet.computeVertexNormals(); b.geometry(bullet, rose, [lipstickX, .919, .11]);
    marker('compact', v.x + compactX, v.y + v.height, v.z + .1, { open: true });
    b.geometry(vessel([[0, 0], [.071, 0], [.081, .004], [.085, .010], [.085, .027], [.082, .031],
      [.071, .031], [.067, .025], [.066, .010], [0, .010]]), brass, [compactX, .82, .1]);
    b.cylinder(compactX, .838, .1, .066, .066, .014, rose, undefined, 28);
    const lidAngle = Math.PI / 2 - .18;
    b.geometry(vessel([[0, -.007], [.071, -.007], [.083, -.003], [.085, .002], [.084, .008],
      [.076, .011], [.070, .008], [.067, .004], [0, .004]]), brass, [compactX, .922, .003], [lidAngle, 0, 0]);
    b.cylinder(compactX, .923, .008, .069, .069, .0035, mirror, [lidAngle, 0, 0], 28);
    b.beam([compactX - .036, .842, .016], [compactX + .036, .842, .016], .0065, brass, 10);
    marker('brush-cup', v.x + cupX, v.y + v.height, v.z - .13, { brushes: 5 });
    b.geometry(vessel([[0,.004],[.047,.004],[.050,0],[.057,0],[.062,.006],[.061,.016],
      [.069,.147],[.071,.156],[.069,.161],[.064,.162],[.061,.157],[.059,.141],[.050,.021],[.045,.014],[0,.014]],20),porcelain,[cupX,.82,-.13]);
    // A fan, powder mop, shader, lip and angled brow brush. Each complete tool
    // leans from the floor; ferrule, handle and tip have the same local axis.
    for(const [dx,dz,length,tilt,twist,breadth,depth] of [
      [-.017,-.013,.264,.205,-.16,.040,.012],[.014,-.021,.299,-.16,.07,.029,.025],
      [-.009,.011,.211,.094,.15,.015,.009],[.021,-.002,.234,-.16,-.10,.011,.008],[-.018,.020,.188,.26,.19,.026,.008],
    ]) {
      const position:[number,number,number]=[cupX+dx,.834,-.13+dz],rotation:[number,number,number]=[twist,0,tilt];
      b.geometry(vessel([[0,0],[.003,.001],[.005,.02],[.0075,length-.047],[.008,length-.021]],9),shadowOak,position,rotation);
      b.geometry(vessel([[.008,length-.025],[.010,length-.024],[.009,length-.019],[breadth*.58,length+.005,depth*.76],
        [breadth*.63,length+.010,depth*.81]],10),brass,position,rotation);
      b.geometry(vessel([[breadth*.58,length+.009,depth*.75],[breadth*.77,length+.024,depth*.91],
        [breadth,length+.043,depth],[breadth*.85,length+.055,depth*.77],[breadth*.42,length+.065,depth*.45,.004],
        [0,length+.068,0,.006]],12),charcoal,position,rotation);
    }
    // A horn comb lying on its spine, with open spaces between tapered teeth.
    const combX = cupX-.30;
    b.geometry(panel(.216,.029,.011,.008,.0015),shadowOak,[combX,.826,-.124],[-Math.PI/2,0,.12]);
    for(let i=0;i<12;i++) b.geometry(new THREE.ConeGeometry(.0055,.045+(i%3)*.002,4).rotateX(Math.PI/2), shadowOak,
      [combX-.073+.012*i,.825,-.093]);
  });

  const m = VILLA_MASTER_MIRROR;
  marker('dressing-mirror', m.x, m.y, m.z, { reflection: 'finite-room-reflection', renderTarget: false, litTrim: true });
  b.at(m.x, m.y, m.z, 0, () => {
    b.geometry(surround(m.width, m.height, .15, [[0, -.023], [0, .019], [.006, .028], [.015, .031],
      [.025, .027], [.030, .030], [.035, .042], [.045, .046], [.057, .037], [.064, .026], [.060, -.018], [0, -.023]]), oak);
    b.geometry(surround(m.width - .090, m.height - .090, .105, [[0, .037], [.001, .046], [.004, .049],
      [.009, .047], [.013, .040], [.014, .032], [0, .032], [0, .037]]), brass);
    b.geometry(panel(m.width - .106, m.height - .106, .097, .012, .002), mirror, [0, 0, .034]);
    for (const x of [-m.width / 2 + .12, m.width / 2 - .12]) b.geometry(panel(.011, m.height - .3, .005, .005), glow, [x, 0, .042]);
    b.collide(0, -m.height / 2, 0.015, m.width, m.height, 0.095);
  });
  const s = VILLA_MASTER_STOOL;
  marker('dressing-stool', s.x, s.y, s.z, { upholstery: 'linen', movable: false });
  b.at(s.x, s.y, s.z, 0, () => {
    for (const x of [-0.205, 0.205]) for (const z of [-0.175, 0.175]) {
      b.beam([x * 1.07, 0.015, z * 1.07], [x, 0.37, z], 0.027, oak, 8);
      b.cylinder(x * 1.07, 0.032, z * 1.07, 0.028, 0.028, 0.055, brass, [0, 0, 0], 8);
    }
    const w = s.width / 2, d = s.depth / 2;
    b.geometry(vessel([[0, .326], [w - .055, .326, d - .055], [w - .029, .336, d - .029],
      [w - .025, .360, d - .025], [w - .032, .375, d - .032], [0, .375]], 32, .38), oak);
    b.geometry(vessel([[0, .364], [w - .043, .364, d - .043], [w - .014, .371, d - .014],
      [w, .389, d], [w, .422, d], [w - .008, .446, d - .008], [w - .027, .467, d - .027],
      [w - .059, .480, d - .059], [w * .61, .487, d * .61], [0, s.height]], 32, .38), linen);
    b.geometry(vessel([[w - .002, .380, d - .002], [w + .001, .381, d + .001], [w + .002, .384, d + .002],
      [w + .001, .387, d + .001], [w - .001, .388, d - .001]], 32, .38), sage);
    b.collide(0, 0, 0, s.width + 0.004, s.height, s.depth + 0.004);
    registerVillaSeatCollider(b.colliders[b.colliders.length - 1], 'stool-dressing');
  });
  const seat = villaRelaxSeat('stool-dressing')!;
  const seatMarker = new THREE.Object3D(); seatMarker.name = 'relax-seat/stool-dressing';
  seatMarker.position.set(seat.seat.x, seat.seat.y, seat.seat.z); seatMarker.userData = { ...seat, modelOrigin: seat.origin }; b.root.add(seatMarker);
  b.finish();
  b.root.userData.bedroom = { wardrobeBays: w.bays, wardrobeDoors: 10, dressingTable: true, mirror: true, accessories: [...VILLA_VANITY_ACCESSORIES] };
  return { colliders: b.colliders, update(state, lightOn = true) {
    glow.emissiveIntensity = lightOn ? 0.65 : 0;
    return wardrobe.update(state, lightOn);
  } };
}
