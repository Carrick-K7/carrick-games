import * as THREE from 'three';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import { VILLA_RACING, type VillaActivityState, type VillaScreenSource } from './villaActivities.js';
import type { VillaCollider } from './villaWorld.js';
import { createVillaRace, drawVillaRace, VILLA_RACE_WHEEL_TURN, type VillaRaceState } from './villaRacing.js';
import { registerVillaSeatCollider } from './villaSeating.js';
import { consoleShell, gamepad, gamingSeat, headsetAndMic, mediaDock, monitorArm, mouseShell, pcChassis, pcFan, pedalFace, rallyWheelTrim, rigRail, screenEnclosure, workstation } from './villaGamingEquipment.js';
import { bentRail, keySections, ovalLoop, roundedLoop, sectionLoft, turnedSection, type P3 } from './villaVehicleSections.js';
import { coachPanel } from './villaCoachwork.js';
import { figureBow, figureCrown, figureFeatures, figureLegAndBoot, figureSleeve, galleryLiner, galleryShelf } from './villaGamingCollection.js';

type V3 = [number, number, number];

/** Fixed shaft tilt and independent wheel-local Z spin. The driver looks +Z,
 * so world -X projects to screen right: POSITIVE local Z is driver-clockwise.
 * Exported for projection tests using the same authored geometry as the rig.
 */
export function createVillaRallyWheel(parent: THREE.Object3D, rubber = villaMaterial('#20272b', .87), steel = villaMaterial('#697782', .28, .8), markerMaterial = villaMaterial('#e7c95d', .5)) {
  const mount = new THREE.Group(); mount.name = 'racingWheelShaft';
  mount.position.set(VILLA_RACING.seat.x, 1.045, 6.825); mount.rotation.x = .25; parent.add(mount);
  const shaft = new VillaModelBuilder(mount, 'fixedRacingShaft');
  shaft.cylinder(0, 0, .12, .025, .025, .24, steel, [Math.PI / 2, 0, 0]); shaft.finish();
  const wheel = new VillaModelBuilder(mount, 'interactiveRacingWheel');
  rallyWheelTrim(wheel,rubber,steel,markerMaterial);
  const marker = new THREE.Object3D(); marker.name = 'racingWheelTopMarker'; marker.position.set(0, .178, -.022); wheel.root.add(marker);
  wheel.finish();
  mount.traverse(node => { if (node instanceof THREE.Mesh) node.castShadow = false; });
  return { mount, spin: wheel.root, marker, setSteer(steer: number) {
    wheel.root.rotation.z = (Number.isFinite(steer) ? Math.max(-1, Math.min(1, steer)) : 0) * VILLA_RACE_WHEEL_TURN;
  } };
}

/** One original collector-sculpture design. `base` selects its tinted display
 *  plinth, `hairVolume` adds swept twin-tails and `prop` a held instrument. */
export interface VillaAnimeFigure {
  name: string; age: number;
  hair: 'chestnut' | 'silver' | 'copper' | 'plum' | 'ink' | 'gold';
  hairstyle: string;
  outfit: 'sage' | 'navy' | 'rose' | 'cream' | 'ochre';
  clothing: string; pose: string;
  base?: 'tealBase' | 'blueBase' | 'plumBase';
  hairVolume?: 'twin-tails';
  prop?: 'flute';
}
export const VILLA_ANIME_FIGURES: readonly VillaAnimeFigure[] = [
  { name: 'Hazel / seed curator', age: 28, hair: 'chestnut', hairstyle: 'layered bob', outfit: 'sage', clothing: 'ankle dress and cardigan', pose: 'contrapposto', base: 'tealBase', hairVolume: 'twin-tails' },
  { name: 'Alba / observatory guide', age: 27, hair: 'silver', hairstyle: 'side ponytail', outfit: 'navy', clothing: 'long coat and trousers', pose: 'greeting hand', base: 'blueBase' },
  { name: 'Poppy / botanical author', age: 31, hair: 'copper', hairstyle: 'low braid', outfit: 'rose', clothing: 'ankle dress and cardigan', pose: 'holding book', base: 'plumBase', prop: 'flute' },
  { name: 'Violet / city archivist', age: 29, hair: 'plum', hairstyle: 'swept bob', outfit: 'cream', clothing: 'long coat and trousers', pose: 'shoulder bag', base: 'plumBase' },
  { name: 'Maren / landscape architect', age: 32, hair: 'ink', hairstyle: 'swept bun', outfit: 'navy', clothing: 'high-collar dress and cape', pose: 'flowing cape', base: 'blueBase', hairVolume: 'twin-tails' },
  { name: 'Saffron / morning baker', age: 26, hair: 'gold', hairstyle: 'soft waves', outfit: 'ochre', clothing: 'ankle dress and cardigan', pose: 'holding book', base: 'tealBase' },
  { name: 'Fern / kite artisan', age: 30, hair: 'chestnut', hairstyle: 'short crop', outfit: 'cream', clothing: 'layered jacket and trousers', pose: 'greeting hand', base: 'tealBase' },
  { name: 'Rosie / garden designer', age: 28, hair: 'plum', hairstyle: 'long layers', outfit: 'sage', clothing: 'high-collar flowing dress', pose: 'flowing dress', base: 'blueBase', hairVolume: 'twin-tails' },
  { name: 'Dove / mural painter', age: 25, hair: 'silver', hairstyle: 'wind-swept layers', outfit: 'rose', clothing: 'long coat and trousers', pose: 'shoulder bag', base: 'plumBase' },
];

/** Original adult anime collector sculptures, not licensed characters or chibi.
 * Research: https://bishoujoseries.com/about/ (Japanese-styled character statues),
 * https://www.goodsmile.com/en/product/1139934/DR. (original scale figure), and
 * https://www.goodsmile.com/en/product/1145953/Saori%2BDress%2B1%2B7%2BScale%2BFigure
 * (sculpted dress + supplied stand). Only general collector presentation is used;
 * no artwork, character designs, downloaded images, textures or meshes are copied.
 * A shared batch per material keeps nine detailed figures and the case inexpensive.
 */
export function createVillaAnimeFigureDisplay(parent: THREE.Object3D, sharedLight?: THREE.MeshStandardMaterial) {
  const b = new VillaModelBuilder(parent, 'originalAnimeFigureWall');
  b.root.position.set(2.32, 0, 6.45); b.root.rotation.y = Math.PI / 2;
  const palette = {
    walnut: '#584131', ink: '#242932', cream: '#ebe6db', skin: '#f2d2bb', blush: '#b87e79',
    sage: '#466759', navy: '#3f536f', rose: '#a87383', ochre: '#a4804e',
    chestnut: '#554038', copper: '#98644e', silver: '#bdc7ce', plum: '#695971', gold: '#c1a373', brass: '#ad926c',
    tealBase: '#5fc8c2', blueBase: '#7fb2e8', plumBase: '#a98fc4',
  };
  const materials = Object.fromEntries(Object.entries(palette).map(([key, hex]) => {
    const material = villaMaterial(hex, key === 'brass' ? 0.4 : 0.65, key === 'brass' ? 0.5 : 0);
    material.name = `anime-display-${key}`; return [key, material];
  })) as Record<keyof typeof palette, THREE.MeshStandardMaterial>;
  const glass = new THREE.MeshPhysicalMaterial({ color: '#d6faff', transparent: true, opacity: 0.13, roughness: 0.07, metalness: 0.04, depthWrite: false, side: THREE.DoubleSide });
  glass.name = 'anime-display-glass';
  const light = sharedLight ?? new THREE.MeshStandardMaterial({ color: '#ffe4b2', emissive: '#ffc575', emissiveIntensity: 0.8 });
  const { walnut, ink, cream, skin, blush, brass } = materials;
  type Ring = { y: number; x?: number; z?: number; rx: number; rz: number; pleat?: number; lift?: number };
  // Closed sculpted lofts give tapered jaws, fitted opaque layers and real drapery,
  // rather than scaling a sphere for every body part.
  const loft = (rings: Ring[], material: THREE.Material, segments = 18, hem = false) => {
    const outline=(r:Ring):V3[]=>Array.from({length:segments},(_,i)=>{
      const a=i*Math.PI*2/segments, pleat=1+(r.pleat??0)*Math.cos(a*6);
      return [(r.x??0)+Math.cos(a)*r.rx*pleat,r.y+(r.lift??0)*Math.sin(a+.8),(r.z??0)+Math.sin(a)*r.rz*pleat];
    });
    if(hem){
      // Trace the drape down from the waist, curl under the hem, then rise up
      // on the lining. Looking up a skirt sees cloth and legs, not a solid disc.
      const down=[...rings].sort((a,b)=>b.y-a.y), end=down[down.length-1];
      const inner=down.map(r=>({...r,rx:r.rx-.003,rz:r.rz-.003,y:r.y+.0015})).reverse();
      b.geometry(sectionLoft([...down,{...end,y:end.y-.0006,rx:end.rx-.0012,rz:end.rz-.0012},...inner].map(outline),false,false),material);
    }else b.geometry(sectionLoft(rings.map(outline)),material);
  };
  // Tapered, curved hair ribbons have attached roots and pointed strand ends.
  const lock = (points: V3[], width: number, material: THREE.Material) => {
    const curve = new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
    const tangent=curve.getTangent(0), side=new THREE.Vector3().crossVectors(tangent,
      Math.abs(tangent.z)>.9?new THREE.Vector3(0,1,0):new THREE.Vector3(0,0,1)).normalize();
    const rings=Array.from({length:10},(_,i)=>{
      const t=i/9,p=curve.getPoint(t),next=curve.getTangent(t),q=new THREE.Quaternion().setFromUnitVectors(tangent,next);
      side.applyQuaternion(q); tangent.copy(next);
      const back=tangent.clone().cross(side),taper=(.55+.45*Math.sin(t*Math.PI))*(1-t*.97);
      return ovalLoop(width*taper,.007*taper,6).map(([u,v])=>p.clone().addScaledVector(side,u).addScaledVector(back,v).toArray() as P3);
    });
    b.geometry(sectionLoft(rings),material);
  };
  const figureNames: string[] = [];
  VILLA_ANIME_FIGURES.forEach((design, index) => {
    const x = (index % 3 - 1) * 1.22, shelfY = [0.0535, 0.8685, 1.6885][Math.floor(index / 3)];
    const outfit = materials[design.outfit], hair = materials[design.hair], trousers = design.clothing.includes('trousers');
    const sway = index % 2 ? -0.011 : 0.011, headX = -sway * 0.45;
    b.at(x, shelfY, -0.006, 0, () => {
      const plinth=(r:number,y:number,sides:number)=>ovalLoop(r,r,sides).map(([dx,dz]):P3=>[dx,y,dz]);
      b.geometry(sectionLoft([plinth(.144,.012,32),plinth(.158,.019,32),plinth(.160,.026,32),
        plinth(.156,.030,32),plinth(.151,.034,32)]),walnut);
      b.geometry(turnedSection([[-.0018,.155],[0,.157],[.0018,.155],[0,.153]],32),brass,[0,.0305,0],[0,0,Math.PI/2]);
      // Contrapposto: one straight supporting leg, the other knee relaxed. Opaque
      // tights/trousers enter closed boots; BOTH soles touch the display base.
      for (const side of [-1, 1]) {
        const ankle: V3 = [side * 0.04 + (side < 0 ? -0.012 : 0), 0.085, side < 0 ? 0.025 : 0];
        const knee: V3 = [side * 0.033 + sway, 0.22, side < 0 ? 0.018 : 0];
        figureLegAndBoot(b,side,[side*.032+sway,.34,0],knee,ankle,trousers,trousers?outfit:ink,ink,brass);
      }
      const flowing = design.pose === 'flowing dress' || design.pose === 'flowing cape';
      if (!trousers || design.clothing.includes('coat')) {
        loft([
          { y: trousers ? 0.21 : 0.137, x: flowing ? 0.023 : 0, z: flowing ? -0.006 : 0, rx: flowing ? 0.125 : trousers ? 0.083 : 0.097, rz: flowing ? 0.071 : 0.056, pleat: 0.07, lift: flowing ? 0.014 : 0.004 },
          { y: 0.265, x: sway * 0.5, rx: 0.077, rz: 0.047, pleat: 0.045 },
          { y: 0.335, x: sway, rx: 0.055, rz: 0.037, pleat: 0.02 },
          { y: 0.388, x: sway, rx: 0.038, rz: 0.03 },
        ], outfit, 24, true);
      }
      loft([{ y: 0.329, x: sway, rx: 0.052, rz: 0.037 }, { y: 0.386, x: sway, rx: 0.039, rz: 0.03 }, { y: 0.456, rx: 0.055, rz: 0.035 }, { y: 0.495, rx: 0.064, rz: 0.03 }, { y: 0.518, rx: 0.027, rz: 0.024 }], outfit);
      b.cylinder(0, 0.519, 0, 0.022, 0.028, 0.023, cream, [0, 0, 0], 14);
      b.cylinder(headX, 0.543, 0, 0.014, 0.017, 0.041, skin, [0, 0, 0], 12);
      // Folded collars sit on the existing shoulders. The long coat has wide
      // notched lapels; cardigans have rounded tips; cape collars stand higher.
      const tailored=design.clothing.includes('coat'), highCollar=design.clothing.includes('collar');
      for(const side of [-1,1]) coachPanel(b,(u,v)=>{
        const fold=tailored?(v<.57?.022:.015):.005+.014*Math.sin(.17+Math.PI*v*.80);
        return [side*(.009+.020*(1-v)+u*fold)+sway*v*.53,
          .513-v*(highCollar?.030:tailored?.066:.041)+.0015*u,
          .023+.014*v-.007*u+.002*Math.sin(u*Math.PI)];
      },cream,[0,0,1],[0,0,-.003],2,7);
      for (const [i,y] of [.413,.44,.467].entries()) b.geometry(turnedSection([[-.0008,.0026],[0,.003],
        [.001,.0026],[.001,.0008],[-.0008,.0008]],10),brass,[sway*.5,y,.0325+i*.0005],[0,-Math.PI/2,0]);
      if (design.pose === 'flowing cape') {
        // A closed, scalloped back cape meets both shoulders; its hem curves out.
        loft([{ y: 0.242, x: 0.018, z: -0.068, rx: 0.127, rz: 0.029, pleat: 0.08, lift: 0.014 }, { y: 0.365, x: 0.008, z: -0.047, rx: 0.093, rz: 0.019, pleat: 0.04 }, { y: 0.493, z: -0.021, rx: 0.065, rz: 0.016 }, { y: 0.507, z: -0.012, rx: 0.042, rz: 0.017 }], cream, 24);
      }
      for (const side of [-1, 1]) {
        const waving = design.pose === 'greeting hand' && side === 1;
        const book = design.pose === 'holding book';
        const elbow: V3 = [side * (waving ? 0.104 : 0.087), waving ? 0.456 : 0.407, book ? 0.031 : 0.004];
        const wrist: V3 = waving ? [0.117, 0.568, 0.024] : book ? [side * 0.049, 0.373, 0.079] : design.pose === 'shoulder bag' && side === 1 ? [0.108, 0.335, 0.022] : [side * (flowing ? 0.11 : 0.069), flowing ? 0.363 : 0.347, 0.035];
        figureSleeve(b,[side*.058,.49,0],elbow,wrist,outfit,cream,trousers);
        const handY = wrist[1] + (waving ? 0.01 : -0.007);
        b.ellipsoid(wrist[0], handY, wrist[2], 0.01, 0.015, 0.009, skin);
        b.ellipsoid(wrist[0] - side * 0.009, handY - 0.002, wrist[2] + 0.004, 0.004, 0.008, 0.004, skin);
        if (waving) for (let finger = 0; finger < 3; finger++) b.beam([wrist[0] - 0.006 + finger * 0.005, handY + 0.009, wrist[2]], [wrist[0] - 0.009 + finger * 0.008, handY + 0.024 - Math.abs(finger - 1) * 0.003, wrist[2]], 0.0023, skin, 6);
      }
      // Tapered chin and restrained almond eyes. Even INCLUDING the hair crown,
      // this is a 5.2-head adult silhouette, not a one-third-height toy head.
      loft([{ y: 0.56, x: headX, z: 0.008, rx: 0.008, rz: 0.009 }, { y: 0.572, x: headX, z: 0.008, rx: 0.023, rz: 0.02 }, { y: 0.59, x: headX, z: 0.008, rx: 0.035, rz: 0.028 }, { y: 0.617, x: headX, z: 0.008, rx: 0.041, rz: 0.035 }, { y: 0.641, x: headX, z: 0.006, rx: 0.04, rz: 0.033 }, { y: 0.666, x: headX, rx: 0.026, rz: 0.022 }, { y: 0.673, x: headX, rx: 0.007, rz: 0.008 }], skin, 20);
      figureCrown(b,headX,hair,design.hairstyle==='short crop',design.hairstyle.startsWith('wind'));
      for (const side of [-1, 1]) {
        b.ellipsoid(headX + side * 0.04, 0.605, 0.003, 0.007, 0.012, 0.009, skin);
        figureFeatures(b,headX,side,cream,outfit,ink,blush,hair);
      }
      b.ellipsoid(headX, 0.598, 0.042, 0.0032, 0.0045, 0.004, skin);
      // A small upturned smile instead of a straight line.
      b.beam([headX - 0.0055, 0.579, 0.0318], [headX - 0.0005, 0.5765, 0.0325], 0.0013, blush, 4);
      b.beam([headX - 0.0005, 0.5765, 0.0325], [headX + 0.005, 0.579, 0.0318], 0.0013, blush, 4);
      // Four asymmetrical pointed bangs attach to the cap; side locks overlap roots.
      for (let i = 0; i < 4; i++) {
        const xx = headX - 0.031 + i * 0.019;
        lock([[xx - 0.006, 0.676, 0.007], [xx, 0.659, 0.032], [xx + 0.012, 0.636 - (i % 2) * 0.008, 0.04]], 0.019, hair);
      }
      // A colour-matched bow on the crown, and two sparkles at cheek height.
      {
        const bowSide = index % 2 ? -1 : 1, bx = headX + bowSide * 0.043, by = 0.652, bz = -0.004;
        figureBow(b,bx,by,bz,.020,.010,materials.rose);
      }
      const sparkle = (sx: number, sy: number, sz: number, size: number) => {
        b.beam([sx - size, sy, sz], [sx + size, sy, sz], 0.0015, materials.cream, 3);
        b.beam([sx, sy - size, sz], [sx, sy + size, sz], 0.0015, materials.cream, 3);
      };
      sparkle(headX + (index % 2 ? -0.115 : 0.115), 0.662, 0.03, 0.012);
      const long = /long|waves|wind/.test(design.hairstyle), bob = design.hairstyle.includes('bob');
      for (const side of [-1, 1]) for (let layer = 0; layer < (long ? 3 : 2); layer++) {
        const endY = long ? 0.467 + layer * 0.028 : bob ? 0.561 + layer * 0.01 : 0.588 + layer * 0.015;
        const wind = design.hairstyle.startsWith('wind') ? 0.024 : 0;
        lock([[headX + side * 0.033, 0.661, -0.01 - layer * 0.011], [headX + side * 0.046, 0.606, -0.001 - layer * 0.011], [headX + side * (long ? 0.057 : 0.044) + wind, endY + 0.031, -0.016 - layer * 0.01], [headX + side * 0.042 + wind, endY, -0.013 - layer * 0.01]], 0.019, hair);
      }
      if (design.hairstyle === 'side ponytail') {
        b.ellipsoid(headX + 0.037, 0.66, -0.035, 0.018, 0.018, 0.02, hair);
        for (let i = 0; i < 3; i++) lock([[headX + 0.04, 0.66, -0.035], [headX + 0.072 + i * 0.004, 0.623, -0.041], [headX + 0.085, 0.558, -0.045 - i * 0.009], [headX + 0.061, 0.524 + i * 0.009, -0.047]], 0.021, hair);
        b.box(headX + 0.055, 0.647, -0.025, 0.018, 0.01, 0.008, outfit, 0.002);
      }
      // Collector styling: a tinted display base, a ruffled skirt tier with a bow,
      // detached sleeve cuffs and the swept hair volume that reads as a scale
      // figure rather than a mannequin. All original geometry and colour.
      const baseMat = design.base ?? 'tealBase';
      b.geometry(sectionLoft([plinth(.161,0,12),plinth(.168,.004,12),plinth(.169,.012,12),plinth(.161,.018,12)]),materials[baseMat]);
      for(const side of [-1,1]) lock([[sway+side*.012,.335,.038],[sway+side*.057,.306,.041],
        [sway+side*.069,.263,.039],[sway+side*.062,.230,.034]],.012,trousers?outfit:cream);
      // Frilled skirt tier with a bow at the waist, over the dress only.
      if (!trousers) {
        loft([
          { y: 0.322, rx: 0.063, rz: 0.049, pleat: 0.05 },
          { y: 0.287, x: sway, rx: 0.093, rz: 0.069, pleat: 0.09, lift: 0.006 },
          { y: 0.251, x: sway, rx: 0.105, rz: 0.077, pleat: 0.115, lift: 0.011 },
        ], materials.cream, 24, true);
        figureBow(b,sway,.326,.038,.029,.013,materials.rose);
      }
      // Twin-tails: the swept volume that makes a scale figure read at a glance.
      if (design.hairVolume === 'twin-tails') for (const side of [-1, 1]) {
        b.ellipsoid(headX + side * 0.041, 0.664, -0.026, 0.02, 0.02, 0.022, hair);
        for (let i = 0; i < 3; i++) lock([
          [headX + side * 0.045, 0.668, -0.028],
          [headX + side * (0.074 + i * 0.005), 0.626, -0.032],
          [headX + side * (0.088 + i * 0.007), 0.542 - i * 0.02, -0.036],
          [headX + side * (0.06 + i * 0.013), 0.45 - i * 0.028, -0.032],
        ], 0.024, hair);
        b.box(headX + side * 0.056, 0.652, -0.03, 0.021, 0.011, 0.01, materials.rose, 0.002);
      }
      // A held instrument, as on the reference figure, kept as pure display geometry.
      if (design.prop === 'flute') {
        b.cylinder(0.045, 0.372, 0.082, 0.006, 0.006, 0.19, materials.brass, [0, 0, Math.PI / 2.35], 10);
        for (const dz of [-0.03, 0.045]) b.ellipsoid(0.045 + dz, 0.375, 0.083, 0.007, 0.007, 0.005, materials.ink);
      }
      if (design.hairstyle === 'low braid') {
        for (let i = 0; i < 3; i++) lock([[headX - 0.028, 0.635, -0.036], [headX - 0.046 + Math.sin(i * 2) * 0.008, 0.565, -0.026], [headX - 0.05 + Math.cos(i * 2) * 0.008, 0.504, -0.014], [headX - 0.046, 0.473, -0.011]], 0.018, hair);
        b.box(headX - 0.046, 0.487, -0.007, 0.024, 0.009, 0.012, outfit, 0.002);
      }
      if (design.hairstyle === 'swept bun') {
        b.ellipsoid(headX - 0.018, 0.645, -0.049, 0.029, 0.028, 0.022, hair);
        for (let i = 0; i < 3; i++) lock([[headX + 0.025, 0.668, -0.023], [headX - 0.013, 0.671 - i * 0.006, -0.055], [headX - 0.037, 0.63, -0.049]], 0.009, hair);
      }
      if (design.pose === 'holding book') {
        const bookFace=(w:number,h:number,z:number)=>roundedLoop(w,h,.003).map(([x,y]):P3=>[x,.372+y,z-.003*(x/.047)**2]);
        b.geometry(sectionLoft([bookFace(.085,.086,.076),bookFace(.087,.086,.080),bookFace(.083,.085,.091)]),cream);
        b.geometry(sectionLoft([bookFace(.092,.092,.073),bookFace(.094,.095,.075)]),outfit);
        b.geometry(sectionLoft([bookFace(.094,.095,.092),bookFace(.093,.094,.094)]),outfit);
        const spine=[[-.039,.073],[-.046,.070],[-.051,.075],[-.051,.089],[-.047,.094],[-.039,.095],[-.042,.091],[-.047,.087],[-.047,.077],[-.042,.075]];
        b.geometry(sectionLoft([.3245,.4195].map(y=>spine.map(([x,z]):P3=>[x,y,z]))),walnut);
        b.geometry(bentRail([[-.008,.352,.094],[-.002,.363,.095],[.010,.380,.094],[.018,.388,.094]],.0016,6),brass);
        b.box(.022,.326,.090,.005,.016,.002,outfit,0);
      }
      if (design.pose === 'shoulder bag') {
        const bag=(w:number,d:number,y:number)=>roundedLoop(w,d,.009).map(([x,z]):P3=>[.108+x,y+.085*x,.026+z]);
        b.geometry(sectionLoft([bag(.052,.030,.243),bag(.070,.041,.251),bag(.072,.040,.290),bag(.064,.025,.316)]),walnut);
        coachPanel(b,(u,v)=>[.108+(u-.5)*(.065-.006*v),.318-v*(.025+.012*Math.sin(u*Math.PI)),
          .030+.017*Math.sin(v*Math.PI/2)+.003*v],outfit,[0,0,1],[0,0,-.003],8,4);
        b.geometry(bentRail([[.081,.313,.025],[.087,.331,.025],[.096,.340,.024],[.118,.339,.024],[.129,.330,.024],[.135,.316,.025]],.003,6),walnut);
        coachPanel(b,(u,v)=>{const x=-.038+.130*v;return [x+(u-.5)*.007,.497-.178*v,.021+.024*Math.sin(Math.PI*v)+.005*v];},
          walnut,[0,0,1],[0,0,-.002],1,12);
      }
      if (design.pose === 'flowing dress' || design.pose === 'contrapposto') {
        const hx = design.pose === 'flowing dress' ? -0.11 : -0.069, hy = design.pose === 'flowing dress' ? 0.36 : 0.344;
        b.beam([hx, hy - 0.016, 0.037], [hx + 0.009, hy + 0.05, 0.037], 0.002, materials.sage, 6);
        for (let petal = 0; petal < 5; petal++) {
          const a = petal * Math.PI * 2 / 5;
          b.ellipsoid(hx + 0.009 + Math.cos(a) * 0.008, hy + 0.05 + Math.sin(a) * 0.008, 0.037, 0.006, 0.007, 0.003, cream);
        }
      }
    });
    figureNames.push(design.name);
    const marker = new THREE.Object3D(); marker.name = `originalAnimeFigure-${index}`; marker.position.set(x, shelfY, -0.006);
    marker.userData = { character: design.name, characterAge: design.age, style: 'adult anime bishoujo', authored3D: true, originalDesigns: true, modestClothing: true, hairstyle: design.hairstyle, clothing: design.clothing, pose: design.pose, bodyHeight: 0.65, headHeight: 0.124, headsTall: 0.65 / 0.124, baseHeight: 0.034, soleHeight: 0.034, baseOnShelf: true };
    b.root.add(marker);
  });
  b.box(0, 1.27, -0.207, 3.7, 2.5, 0.045, walnut);
  b.box(0, 1.27, -0.18, 3.6, 2.4, 0.015, ink);
  for (const x of [-1.825, 1.825]) b.box(x, 1.27, 0, 0.05, 2.5, 0.48, walnut);
  for (const y of [.035,.85,1.67,2.515]) galleryShelf(b,3.7,.48,y,.037,walnut,brass);
  for(const x of [-1.22,0,1.22]) for(const [level,y] of [.447,1.26,2.087].entries()) {
    galleryLiner(b,x,y,-.168,1.147,level===2?.766:.728,ink,walnut);
    // Label escutcheons belong to the cabinet rail, not the feet of the pieces.
    b.geometry(sectionLoft([[-.009,.147,.022],[0,.158,.030],[.003,.148,.024]].map(([d,w,h])=>
      roundedLoop(w,h,.008).map(([xx,yy]):P3=>[x+xx,y-(level===2?.397:.387)+yy,.231+d]))),brass);
  }
  for (const x of [-0.61, 0.61]) b.box(x, 1.27, 0, 0.025, 2.46, 0.44, walnut);
  for (const y of [0.81, 1.63, 2.47]) b.box(0, y, -0.135, 3.58, 0.015, 0.018, light, 0.002);
  for (let i = 0; i < 3; i++) b.box((i - 1) * 1.22, 1.275, 0.241, 1.19, 2.43, 0.006, glass, 0);
  b.root.userData = { figureNames, compartments: 9, variants: 9, originalDesigns: true, adultFigures: true, modestClothing: true, facing: '+X', frontMaxX: 2.564, proportions: '5.2 heads including hair', hairstyles: 'shaped tapered strands', lights: 'shared display switch' };
  // Retain the old named cabinet anchor for existing scene integrations; it is
  // non-rendering metadata only and no chibi geometry remains in the case.
  const legacy = new THREE.Object3D(); legacy.name = 'originalChibiGirlWall'; legacy.userData = b.root.userData; b.root.add(legacy);
  b.finish();
  return { root: b.root, figureNames, colliders: [{ minX: 2.075, maxX: 2.565, minZ: 4.6, maxZ: 8.3, minY: 0, maxY: 2.52 }] };
}

/** Authored, nonfunctional display replicas and virtual-input gaming furniture.
 * Geometry is batched by material, with one steerable wheel group; the owner disposes the scene.
 * Time is seconds. Texture/emissive updates never require shadow invalidation.
 */
export function createVillaGaming(parent: THREE.Object3D): {
  colliders: VillaCollider[];
  update(time: number, state: VillaActivityState & { gaming: boolean; race?: VillaRaceState }): boolean;
} {
  const b = new VillaModelBuilder(parent, 'villaGaming');
  const black = villaMaterial('#12191e', .43, .25);
  const rubber = villaMaterial('#20272b', .87);
  const steel = villaMaterial('#697782', .28, .8);
  const walnut = villaMaterial('#68452e', .62);
  const wood = villaMaterial('#925937', .48);
  const white = villaMaterial('#e8edf0', .42);
  const grey = villaMaterial('#8eabb2', .47, .25);
  const turquoise = villaMaterial('#21c6c5', .36, .17);
  const blue = villaMaterial('#268ee2', .45);
  const red = villaMaterial('#ed585f', .45);
  const green = villaMaterial('#133f35', .6);
  const orange = villaMaterial('#fa842d', .5);
  const glass = new THREE.MeshPhysicalMaterial({ color: '#d6faff', transparent: true, opacity: .13, roughness: .07, metalness: .04, depthWrite: false, side: THREE.DoubleSide });
  const warm = new THREE.MeshStandardMaterial({ color: '#ffe4b2', emissive: '#ffc575', emissiveIntensity: .8 });
  const rgb = new THREE.MeshStandardMaterial({ color: '#54dedc', emissive: '#25d3dd', emissiveIntensity: 1.1 });
  const rgbPink = new THREE.MeshStandardMaterial({ color: '#eab9fc', emissive: '#bb56ff', emissiveIntensity: .8 });
  const mark = (name: string, position: V3, data: Record<string, unknown> = {}) => {
    const node = new THREE.Object3D(); node.name = name; node.position.set(...position); node.userData = data; b.root.add(node); return node;
  };
  const ring = (x: number, y: number, z: number, radius: number, tube: number, mat: THREE.Material, rotation: V3 = [0, 0, 0]) =>
    b.geometry(new THREE.TorusGeometry(radius, tube, 6, 24), mat, [x, y, z], rotation);
  const cable = (points: V3[], radius: number, mat: THREE.Material) => {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    b.geometry(new THREE.TubeGeometry(curve, 20, radius, 6, false), mat);
  };
  const silhouette = (points: [number, number][], depth: number, mat: THREE.Material, pos: V3) => {
    const shape = new THREE.Shape(); points.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y)); shape.closePath();
    b.geometry(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 }), mat, pos);
  };
  const canvas = (width: number, height: number) => {
    const element = document.createElement('canvas'); element.width = width; element.height = height;
    const ctx = element.getContext('2d'); if (!ctx) throw new Error('Villa gaming needs a 2D canvas');
    const map = new THREE.CanvasTexture(element); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
    return { ctx, map };
  };
  const screen = (name: string, x: number, y: number, z: number, w: number, h: number, map: THREE.Texture, yaw = 0) => {
    const mat = new THREE.MeshBasicMaterial({ map, toneMapped: false });
    b.at(x, y, z, yaw, () => {
      screenEnclosure(b,w,h,black,steel);
      b.geometry(new THREE.PlaneGeometry(w, h), mat, [0, 0, .068]);
    });
    mark(name, [x, y, z]); return mat;
  };

  // Walnut desk: wall side -Z, user +Z. The northern doorway is untouched.
  workstation(b,walnut,black,steel,rubber);
  b.box(7.08, .808, 3.99, 1.14, .012, .43, rubber, .005);
  b.collide(7.25, 0, 3.84, 2.7, .81, .85);
  mark('pcDesk', [7.25, 0, 3.84], { width: 2.7, depth: .85 });

  // Physical 87-key TKL layout with sculpted individual caps and a shared legend atlas.
  const legend = canvas(1024, 512);
  legend.ctx.clearRect(0, 0, 1024, 512);
  legend.ctx.fillStyle = '#e3edf0'; legend.ctx.font = '500 27px Arial, sans-serif';
  legend.ctx.textAlign = 'center'; legend.ctx.textBaseline = 'middle';
  const rows: { z: number; start: number; keys: [string, number][] }[] = [
    { z: -.085, start: 0, keys: [['Esc', 1], ['', .5], ...['F1', 'F2', 'F3', 'F4'].map(k => [k, 1] as [string, number]), ['', .3], ...['F5', 'F6', 'F7', 'F8'].map(k => [k, 1] as [string, number]), ['', .3], ...['F9', 'F10', 'F11', 'F12'].map(k => [k, 1] as [string, number])] },
    { z: -.047, start: 0, keys: [...['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='].map(k => [k, 1] as [string, number]), ['Back', 2]] },
    { z: -.016, start: 0, keys: [['Tab', 1.5], ...'QWERTYUIOP'.split('').map(k => [k, 1] as [string, number]), ['[', 1], [']', 1], ['\\', 1.5]] },
    { z: .015, start: 0, keys: [['Caps', 1.75], ...'ASDFGHJKL'.split('').map(k => [k, 1] as [string, number]), [';', 1], ["'", 1], ['Enter', 2.25]] },
    { z: .046, start: 0, keys: [['Shift', 2.25], ...'ZXCVBNM'.split('').map(k => [k, 1] as [string, number]), [',', 1], ['.', 1], ['/', 1], ['Shift', 2.75]] },
    { z: .077, start: 0, keys: [['Ctrl', 1.25], ['Win', 1.25], ['Alt', 1.25], [' ', 6.25], ['Alt', 1.25], ['Fn', 1.25], ['Menu', 1.25], ['Ctrl', 1.25]] },
  ];
  const keyMat = new THREE.MeshBasicMaterial({ map: legend.map, transparent: true, depthWrite: false });
  let keyCount = 0;
  const key = (label: string, x: number, z: number, width = .025) => {
    const y = .842 + (-z + .08) * .045;
    const cap = keySections(width,.027,label === ' ' ? -.0015 : .0023);
    b.geometry(cap.skirt,label === 'Esc' ? turquoise : black,[x,y,z]);
    // The legend follows the dish (or the space bar's convex thumb face),
    // rather than a floating rectangular plane above its high edges.
    const legendFace=cap.face.clone(); b.geometry(cap.face,label === 'Esc' ? turquoise : rubber,[x,y,z]);
    const column = keyCount % 16, row = Math.floor(keyCount / 16);
    legend.ctx.fillText(label, column * 64 + 32, row * 64 + 31, 61);
    const uv = legendFace.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (column + uv.getX(i)) / 16, 1 - (row + 1 - uv.getY(i)) / 8);
    b.geometry(legendFace,keyMat,[x,y+.00015,z]); keyCount++;
  };
  b.at(6.94, 0, 4.035, 0, () => {
    b.box(.01, .826, 0, .59, .028, .207, steel, .006);
    for (const row of rows) {
      let u = row.start;
      for (const [label, width] of row.keys) { if (label) key(label, -.255 + (u + width / 2) * .03, row.z, width * .03 - .004); u += width; }
    }
    for (const [i, label] of ['Prt', 'Scr', 'Pau'].entries()) key(label, .215 + i * .03, -.085);
    for (const [i, label] of ['Ins', 'Home', 'PgUp', 'Del', 'End', 'PgDn'].entries()) key(label, .215 + (i % 3) * .03, -.047 + Math.floor(i / 3) * .031);
    key('↑', .245, .046); for (const [i, label] of ['←', '↓', '→'].entries()) key(label, .215 + i * .03, .077);
  });
  legend.map.needsUpdate = true;
  mark('mechanicalKeyboard', [6.94, .83, 4.035], { keyboardKeys: keyCount, layout: 'TKL', individuallySculpted: true, legends: 'canvas-atlas' });
  // Mouse shell, independent split buttons, central scroll wheel, side buttons and cable.
  b.at(7.48,.814,4.02,0,()=>mouseShell(b,black,rubber,steel));
  cable([[7.48,.834,3.953],[7.5,.813,3.82],[7.65,.808,3.66],[7.766,.808,3.521],[7.78,.785,3.502],[7.78,.738,3.503]],.003,black);
  cable([[6.96,.834,3.933],[6.98,.813,3.76],[7.07,.808,3.641],[7.123,.808,3.523],[7.13,.787,3.503],[7.13,.735,3.503]],.003,rubber);
  mark('ergonomicMouse', [7.48, .84, 4.02], { splitButtons: true, scrollWheel: true, sideButtons: 2, wired: true });
  const pcCanvas = canvas(768, 432);
  const pcMonitorMat = screen('pcMonitor', 7.05, 1.17, 3.62, .77, .433, pcCanvas.map);
  const sideMonitorMat = screen('secondaryMonitor', 6.25, 1.17, 3.69, .52, .33, pcCanvas.map, .18);
  monitorArm(b,6.25,3.69,black,steel); monitorArm(b,7.05,3.62,black,steel);
  // Headset on a simple desk stand, microphone on an articulated arm.
  headsetAndMic(b,black,rubber,steel,grey);

  // Open interior showcase PC. Only the bottom, rear and top are opaque panels.
  b.at(8.12, .8, 3.84, 0, () => {
    pcChassis(b,black,steel,glass,rubber);
    // Motherboard: a real ATX board rather than a bare green slab. Dark PCB with
    // visible traces, VRM heatsinks, socket and pump block, four RAM slots (two
    // populated), chipset and M.2 shields, the 24-pin run and a rear I/O shroud.
    const pcb = black;
    b.box(.134, .265, -.03, .010, .355, .30, pcb, 0);
    for (const y of [.10, .16, .22, .28, .34, .40]) b.box(.1285, y, -.03, .0016, .0026, .292, green, 0);
    for (const z of [-.155, -.10, -.045, .01]) b.box(.1285, .265, z, .0016, .35, .0026, green, 0);
    // Top-edge VRM heatsinks and the rear I/O shroud.
    b.box(.115, .425, -.115, .034, .052, .09, steel, .004);
    b.box(.115, .425, -.015, .034, .052, .088, steel, .004);
    b.box(.118, .40, .118, .03, .12, .056, black, .003);
    for (let i = 0; i < 5; i++) b.box(.103, .355 + i * .018, .118, .006, .009, .038, steel);
    // Socket, retention frame and the AIO pump block over it.
    b.box(.118, .305, -.10, .026, .058, .058, steel);
    b.box(.108, .305, -.10, .014, .05, .05, black);
    b.cylinder(.09, .305, -.10, .032, .032, .028, black, [0, 0, Math.PI / 2], 16);
    ring(.0755, .305, -.10, .026, .0035, rgb, [0, Math.PI / 2, 0]);
    b.cylinder(.072, .305, -.10, .021, .021, .006, steel, [0, 0, Math.PI / 2], 16);
    // Four DIMM slots; the two nearest the socket carry heatspreaders.
    for (let i = 0; i < 4; i++) {
      const z = -.045 + i * .026;
      b.box(.118, .305, z, .012, .1, .009, i < 2 ? black : steel);
      if (i < 2) { b.box(.106, .305, z, .013, .096, .011, rgbPink, 0); b.box(.098, .305, z, .004, .09, .009, steel); }
    }
    // Chipset heatsink and the M.2 shield with its retaining screw.
    b.box(.118, .175, -.075, .026, .05, .07, steel, .004);
    b.box(.118, .135, -.02, .022, .028, .09, black, .003);
    b.cylinder(.106, .135, .026, .005, .005, .004, steel, [0, 0, Math.PI / 2], 8);
    // 24-pin ATX run plus the EPS bundle, dressed along the tray.
    b.box(.118, .255, .108, .022, .05, .02, black);
    cable([[.115, .262, .1], [.128, .22, .07], [.132, .17, .04]], .009, grey);
    b.box(.118, .415, .06, .02, .024, .024, black);
    cable([[.112, .412, .055], [.126, .37, .02], [.132, .3, -.005]], .007, grey);
    const gpu=(w:number,d:number,y:number)=>roundedLoop(w,d,.017).map(([x,z]):P3=>[x,y,z-.025]);
    b.geometry(sectionLoft([gpu(.242,.256,.174),gpu(.259,.273,.178),gpu(.249,.266,.186)]),steel);
    for(let i=0;i<17;i++) b.box(0,.157,-.148+i*.0152,.246,.030,.0026,steel,0);
    for(const x of [-.127,.127]) b.box(x,.155,-.025,.006,.042,.268,black,.003);
    b.box(-.132,.164,-.025,.005,.006,.229,rgb,.002);
    for(const z of [-.092,.043]) {
      // A small radial impeller under each fin bank exhausts into the case.
      const r=.047;
      b.geometry(turnedSection([[-.003,r+.003],[.003,r+.003],[.004,r-.002],[-.003,r-.002]],26),black,[0,.130,z],[0,0,Math.PI/2]);
      b.cylinder(0,.129,z,.011,.011,.010,black,[0,0,0],16);
      for(let j=0;j<7;j++) coachPanel(b,(u,v)=>{const a=j*Math.PI*2/7+v*.52+(u-.5)*.43,d=r*(.16+.77*v);
        return [d*Math.cos(a),.130+.003*(u-.5),z+d*Math.sin(a)];},rubber,[0,-1,0],[0,.0015,0],2,4);
    }
    b.box(.02, .067, -.08, .21, .065, .2, rubber);
    // Three front intake fans visible through the completely clear front sheet.
    for (let i = 0; i < 3; i++) {
      const y = .115 + i * .124;
      b.at(0,y,.160,0,()=>pcFan(b,.053,black,rubber,steel,rgb));
    }
    b.box(0, .432, -.045, .245, .025, .22, steel);
    cable([[.078, .33, -.115], [.015, .385, -.145], [-.07, .4, -.1], [-.075, .435, .005]], .007, rubber);
    cable([[.078, .29, -.11], [-.035, .32, -.15], [-.11, .415, -.1], [-.055, .435, .015]], .007, rubber);
    for (let i = 0; i < 4; i++) cable([[.06 + i * .009, .13, .075], [.08 + i * .009, .09, .1], [.11, .08, -.12]], .003, i % 2 ? grey : rubber);
    b.box(0, .48, .125, .03, .004, .015, rgb);
  });
  mark('panoramicGamingPC', [8.12, .8, 3.84], { fanCount: 3, glassSides: 2, components: ['motherboard', 'GPU', 'RAM', 'AIO', 'PSU', 'cables'], size: [.32, .48, .4] });

  // Ergonomic chair, facing -Z towards the PC; cockpit seat reuses the bucket form facing +Z.
  const bucket = (x:number,z:number,yaw:number,racing:boolean) => b.at(x,0,z,yaw,()=>gamingSeat(b,racing,rubber,black,turquoise,steel));
  bucket(7.25, 5.1, 0, false); b.collide(7.25, 0, 5.1, .7, 1.31, .75);
  registerVillaSeatCollider(b.colliders[b.colliders.length - 1], 'chair-pc');
  mark('ergonomicGamingChair', [7.25, 0, 5.1], { seatId: 'chair-pc', sitable: true, cushionHeight: .55, yaw: 0, wheels: 5, headrest: true, lumbar: true, armrests: 2 });

  // North-wall locked replica cabinet, warm rim light, three horizontal display bays.
  b.at(10.35, 0, 3.3, 0, () => {
    b.box(0, 1.4, -.185, 2.9, 2.55, .045, walnut);
    b.box(0, 1.4, -.153, 2.77, 2.43, .018, rubber);
    for (const x of [-1.43, 1.43]) b.box(x, 1.4, 0, .04, 2.55, .42, walnut);
    for (const y of [.125,2.675]) galleryShelf(b,2.9,.42,y,.045,walnut,steel);
    for(const [y,h] of [[.60,.79],[1.42,.77],[2.22,.72]]) galleryLiner(b,0,y,-.142,2.72,h,rubber,wood);
    for (const y of [.2,1,1.83,2.61]) {
      b.geometry(bentRail([[-1.378,y+.025,-.110],[-1.363,y,-.112],[-1.344,y-.002,-.112],
        [1.344,y-.002,-.112],[1.363,y,-.112],[1.378,y+.025,-.110]],.006,8),warm);
    }
    b.box(0, 1.4, .211, 2.82, 2.46, .006, glass, 0);
    b.box(0, 1.4, .219, .017, 2.46, .014, black);
    b.box(.045, 1.31, .232, .035, .065, .021, steel, .006);
    b.cylinder(.045, 1.31, .245, .009, .009, .005, black, [Math.PI / 2, 0, 0], 10);
    for (const y of [.74, 1.59, 2.33]) for (const x of [-.6, .55]) {
      b.beam([x, y - .06, -.14], [x, y - .06, .02], .009, steel);
      b.beam([x, y - .06, .02], [x, y, .02], .009, black);
    }
    // Pure exterior silhouettes: no ammunition, mechanism, or functional parts.
    b.at(-1.17, 2.22, -.045, 0, () => {
      silhouette([[0, -.1], [.37, -.025], [.46, .04], [.4, .13], [.06, .11], [0, .04]], .07, wood, [0, 0, 0]);
      b.box(.77, .055, .04, .66, .13, .095, black, .008);
      b.box(1.24, .06, .04, .37, .12, .09, wood, .014);
      b.beam([1.08, .15, .04], [1.6, .15, .04], .015, steel);
      b.beam([1.4, .07, .04], [2.13, .07, .04], .022, black);
      b.box(1.95, .125, .04, .027, .15, .04, steel, .002);
      b.beam([2.13, .07, .04], [2.16, .07, .04], .024, orange);
      // Curved 30-round magazine: a swept banana profile, not a rectangle.
      silhouette([[.9, -.005], [1.0, -.005], [1.05, -.13], [1.12, -.27], [1.14, -.38],
        [1.06, -.4], [1.0, -.29], [.95, -.15], [.89, -.03]], .05, black, [0, 0, .015]);
      for (let i = 0; i < 3; i++) b.beam([.92 + i * .012, -.1, .046], [.97 + i * .022, -.34, .046], .0035, steel);
      // Trigger, guard, magazine release and selector lever on the receiver side.
      silhouette([[.86, -.02], [.9, -.02], [.895, -.085], [.865, -.09]], .02, steel, [0, 0, .052]);
      silhouette([[.84, -.005], [.93, -.005], [.925, -.115], [.905, -.12], [.9, -.03], [.85, -.03]], .014, black, [0, 0, .03]);
      b.box(.83, -.055, .052, .03, .028, .012, black, .002);
      b.box(1.02, .03, .052, .07, .014, .01, steel, .002);
      // Pistol grip raked back, with a steel buttplate and sling loops.
      silhouette([[.59, 0], [.71, -.015], [.67, -.22], [.56, -.19]], .07, wood, [0, 0, .01]);
      b.box(1.87, .09, .04, .022, .17, .09, steel, .003);
      for (const x of [1.9, .3]) { b.beam([x, .0, .04], [x, .06, .04], .006, steel); ring(x, .0, .04, .016, .003, steel, [0, Math.PI / 2, 0]); }
      // Front sight post with ears, rear tangent leaf and the slant brake.
      b.box(1.9, .155, .04, .02, .045, .03, steel, .002);
      for (const dz of [-.018, .018]) b.box(1.9, .168, .04 + dz, .014, .022, .008, steel, .001);
      b.box(1.18, .125, .04, .07, .02, .05, steel, .002);
      silhouette([[2.12, .05], [2.2, .06], [2.19, .1], [2.11, .09]], .04, steel, [0, 0, .0]);
      ring(.77, -.079, .055, .055, .006, steel);
    });
    b.at(-1.28, 1.48, -.045, 0, () => {
      silhouette([[0, -.09], [.38, -.055], [.66, .025], [1.89, .025], [1.89, .095], [.7, .09], [.4, .045], [.03, .13]], .074, wood, [0, 0, 0]);
      b.beam([.59, .118, .037], [2.5, .118, .037], .017, steel);
      b.box(.76, .114, .038, .4, .075, .09, black, .004);
      // Two barrel bands, the bolt with its turned-down handle, and sling slots.
      for (const x of [1.35, 1.77]) { b.box(x, .055, .038, .045, .115, .085, steel, .002); b.beam([x - .02, .115, .038], [x + .02, .115, .038], .008, steel); }
      b.beam([.88, .14, .075], [.9, .065, .125], .009, steel); b.ellipsoid(.9, .065, .125, .021, .021, .021, black);
      b.cylinder(.9, .075, .098, .008, .008, .05, steel, [Math.PI / 2, 0, 0], 10);
      for (const x of [1.02, 2.1]) b.beam([x, -.02, .038], [x + .06, -.02, .038], .005, steel);
      // Trigger and guard under the receiver, hooded front sight, steel buttplate.
      silhouette([[.8, .02], [.84, .02], [.835, -.05], [.805, -.055]], .018, steel, [0, 0, .048]);
      silhouette([[.78, .03], [.87, .03], [.865, -.075], [.845, -.08], [.84, .045], [.79, .045]], .012, black, [0, 0, .028]);
      b.box(2.28, .1, .037, .022, .04, .028, steel, .002);
      for (const dz of [-.016, .016]) b.box(2.28, .112, .037 + dz, .015, .02, .007, steel, .001);
      b.box(.06, .052, .037, .022, .105, .078, steel, .003);
      ring(.69, -.045, .06, .055, .007, black);
      b.box(2.32, .153, .037, .03, .09, .03, black, .002);
      b.beam([2.5, .118, .037], [2.53, .118, .037], .018, orange);
    });
    b.at(-.63, .64, -.04, 0, () => {
      b.box(.48, .1, .04, .75, .18, .11, black, .009);
      b.box(.08, .08, .04, .1, .21, .13, rubber, .01);
      b.box(.38, .214, .04, .27, .025, .04, steel, .004);
      b.box(.92, .1, .04, .15, .13, .1, rubber, .008);
      b.beam([.98, .1, .04], [1.14, .1, .04], .022, black);
      b.beam([1.14, .1, .04], [1.165, .1, .04], .024, orange);
      silhouette([[.25, .02], [.4, .02], [.36, -.23], [.22, -.21]], .08, rubber, [0, 0, 0]);
      // Curved magazine with witness ribs.
      silhouette([[.6, -.115], [.68, -.115], [.7, -.21], [.76, -.3], [.7, -.325], [.66, -.24], [.61, -.16]], .045, black, [0, 0, .018]);
      for (let i = 0; i < 3; i++) b.box(.585 + i * .012, -.19 - i * .04, .062, .012, .07, .006, steel, .001);
      // Trigger, guard, selector drum and magazine release.
      silhouette([[.6, -.02], [.64, -.02], [.635, -.08], [.605, -.085]], .016, steel, [0, 0, .046]);
      silhouette([[.58, -.005], [.67, -.005], [.665, -.1], [.645, -.105], [.64, -.02], [.59, -.02]], .011, black, [0, 0, .026]);
      b.cylinder(.5, -.02, .052, .014, .014, .022, steel, [0, 0, Math.PI / 2], 10);
      ring(.47, -.045, .055, .056, .006, black);
      // Drum front sight, rear aperture and the cocking handle tube.
      b.cylinder(.99, .217, .04, .028, .028, .03, steel, [0, 0, Math.PI / 2], 12);
      ring(.99, .217, .04, .02, .006, black, [Math.PI / 2, 0, 0]);
      b.box(.66, .245, .04, .05, .022, .04, steel, .002);
      b.cylinder(.86, .17, .062, .011, .011, .055, steel, [0, 0, Math.PI / 2], 8);
      for (let i = 0; i < 3; i++) b.box(.9, .1 + i * .028, .07, .02, .008, .006, steel, .001);
      // Extending stock rails collapsed along the receiver.
      for (const dz of [-.045, .045]) b.beam([.3, .13, .04 + dz], [.72, .13, .04 + dz], .008, steel);
      b.box(.31, .13, .04, .03, .11, .11, rubber, .006);
    });
  });
  b.collide(10.35, .125, 3.3, 2.9, 2.55, .44);
  mark('lockedReplicaCabinet', [10.35, 1.4, 3.3], { locked: true, decorativeOnly: true, replicaNames: ['AK47', 'MosinNagant', 'MP5K'], orangeMuzzleTips: true });

  const figureDisplay = createVillaAnimeFigureDisplay(b.root, warm);
  const figureNames = figureDisplay.figureNames;
  b.colliders.push(...figureDisplay.colliders);

  // Independent aluminium-profile FFB simulator; central seating reference is shared.
  const sx = VILLA_RACING.seat.x, sz = VILLA_RACING.seat.z;
  bucket(sx, sz, Math.PI, true);
  for (const x of [sx - .5, sx + .5]) {
    rigRail(b,x,6.86,2.48,steel);
    for (const z of [5.7, 6.25, 7.85]) b.box(x, .055, z, .14, .06, .16, rubber);
    b.beam([x, .2, 6.83], [x, .94, 7.06], .029, steel);
    b.box(x, .52, 6.06, .035, .45, .2, black);
  }
  for (const z of [5.7, 6.35, 7.92]) b.box(sx, .16, z, 1.06, .085, .06, steel, .002);
  b.box(sx, .93, 7.065, 1.1, .055, .35, black);
  const wheelbase=(w:number,h:number,z:number)=>roundedLoop(w,h,.032,4).map(([x,y]):P3=>[sx+x,1.023+y,z]);
  b.geometry(sectionLoft([wheelbase(.244,.127,6.928),wheelbase(.289,.148,6.953),wheelbase(.308,.151,7.093),wheelbase(.272,.130,7.205)]),black);
  for(let i=0;i<7;i++) b.geometry(bentRail([[sx-.109+i*.036,1.087,6.96],[sx-.109+i*.036,1.108,6.988],
    [sx-.109+i*.036,1.108,7.099],[sx-.109+i*.036,1.093,7.170]],.0038,6),steel);
  // The FFB base, shaft and dashboard stay fixed; only the circular rim spins.
  const wheel = createVillaRallyWheel(b.root, rubber, steel);
  b.box(sx, .24, 7.66, .67, .045, .64, black);
  for (let i = 0; i < 3; i++) {
    const x = sx - .22 + i * .22;
    b.beam([x, .27, 7.82], [x, .43, 7.59], .013, steel);
    pedalFace(b,x,.404,7.593,i,steel,rubber);
  }
  b.box(10.5, .68, 6.72, .32, .045, .3, steel);
  b.beam([10.46, .18, 6.72], [10.46, .68, 6.72], .025, steel);
  const boot=(w:number,d:number,h:number)=>roundedLoop(w,d,Math.min(w,d)*.35).map(([x,z]):P3=>[10.5+x,h,6.72+z]);
  b.geometry(sectionLoft([boot(.151,.161,.704),boot(.160,.174,.718),boot(.141,.155,.764),boot(.127,.139,.778)]),black);
  b.geometry(sectionLoft([boot(.116,.123,.777),boot(.124,.131,.791),boot(.090,.090,.797),
    boot(.098,.099,.809),boot(.067,.068,.819),boot(.073,.076,.828),boot(.035,.039,.844)]),rubber);
  b.beam([10.5,.834,6.72],[10.5,.950,6.72],.009,steel);
  b.geometry(sectionLoft([boot(.034,.034,.923),boot(.048,.048,.935),boot(.062,.062,.958),
    boot(.056,.055,.977),boot(.031,.029,.985)]),black);
  b.collide(9.8, 0, 6.86, 1.16, 1.28, 2.48);
  registerVillaSeatCollider(b.colliders[b.colliders.length - 1], 'racing');
  b.collide(10.5, 0, 6.72, .33, .99, .31);
  registerVillaSeatCollider(b.colliders[b.colliders.length - 1], 'racing');
  mark('racingCockpit', [sx, 0, sz], { seat: VILLA_RACING.seat, exit: VILLA_RACING.exit, forward: '+Z', bounds: { minX: 9.22, maxX: 10.665, minZ: 5.62, maxZ: 8.1 }, pedals: 3, paddleShifters: 2, gearShifter: true });

  // Freestanding large display in front of glazing, with actual device silhouettes below.
  const tvCanvas = canvas(960, 540);
  screen('racingLargeScreen', VILLA_RACING.screen.x, VILLA_RACING.screen.y, VILLA_RACING.screen.z, 3.8, 2.1, tvCanvas.map, Math.PI);
  for (const x of [9.05, 10.55]) {
    b.box(x, .81, 8.66, .055, 1.51, .06, black);
    b.box(x, .055, 8.58, .42, .07, .57, black);
  }
  b.box(9.8, .46, 8.54, 2.1, .055, .55, walnut);
  b.collide(9.8, 0, 8.56, 3.85, 3.025, .66);
  // PS5-inspired sculpted white side wings around a black core, lying horizontally.
  b.at(9.29,.558,8.53,0,()=>consoleShell(b,black,white,blue));
  b.at(9.72,.517,8.42,-.10,()=>gamepad(b,white,black,grey));
  b.at(10.32,.487,8.552,0,()=>mediaDock(b,black));
  b.box(10.32, .68, 8.555, .29, .172, .024, black, .007);
  for (const side of [-1, 1]) {
    const x = 10.32 + side * .174;
    const grip=(w:number,h:number,z:number)=>roundedLoop(w,h,.023,5).map(([a,y]):P3=>[x+a+side*.0017*Math.cos(y*33),.680+y,z]);
    b.geometry(sectionLoft([grip(.047,.160,8.572),grip(.056,.171,8.568),grip(.057,.169,8.546),grip(.051,.162,8.541)]),side<0?blue:red);
    b.cylinder(x, side < 0 ? .71 : .65, 8.535, .012, .012, .009, black, [Math.PI / 2, 0, 0], 10);
    for (let i = 0; i < 4; i++) b.cylinder(x + Math.cos(i * Math.PI / 2) * .011, (side < 0 ? .65 : .717) + Math.sin(i * Math.PI / 2) * .011, 8.535, .0035, .0035, .007, black, [Math.PI / 2, 0, 0], 6);
  }
  const handheld = canvas(256, 144); handheld.ctx.fillStyle = '#68d7e1'; handheld.ctx.fillRect(0, 0, 256, 144);
  handheld.ctx.fillStyle = '#92d779'; handheld.ctx.beginPath(); handheld.ctx.ellipse(126, 89, 86, 35, 0, 0, Math.PI * 2); handheld.ctx.fill();
  handheld.ctx.fillStyle = '#fff0c6'; handheld.ctx.fillRect(107, 55, 39, 33); handheld.ctx.fillStyle = '#dd7260'; handheld.ctx.beginPath(); handheld.ctx.moveTo(100, 57); handheld.ctx.lineTo(126, 35); handheld.ctx.lineTo(153, 57); handheld.ctx.fill(); handheld.map.needsUpdate = true;
  const handheldMat = new THREE.MeshBasicMaterial({ map: handheld.map, toneMapped: false });
  b.geometry(new THREE.PlaneGeometry(.26, .144), handheldMat, [10.32, .68, 8.54], [0, Math.PI, 0]);
  cable([[9.29, .54, 8.68], [9.3, .42, 8.78], [9.8, .43, 8.76], [9.8, 1.13, 8.65]], .005, black);
  cable([[10.32, .53, 8.65], [10.3, .42, 8.76], [9.86, .43, 8.76], [9.86, 1.13, 8.65]], .004, black);
  mark('consoleMediaShelf', [9.8, .46, 8.54], { consoleSources: ['pc', 'ps', 'switch'], virtualInputSelection: true, devices: ['PS5-style console and dual-grip controller', 'Switch-style handheld, red/blue Joy-Cons and dock'] });

  // Source-specific graphics are drawn, not external streams or artwork.
  const polygon = (ctx: CanvasRenderingContext2D, color: string, pts: [number, number][]) => {
    ctx.fillStyle = color; ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill();
  };
  const fallbackRace = createVillaRace();
  const drawSource = (ctx: CanvasRenderingContext2D, source: VillaScreenSource, t: number, width: number, height: number, race = fallbackRace) => {
    ctx.save(); ctx.scale(width / 960, height / 540);
    if (source === 'pc') {
      drawVillaRace(ctx, 960, 540, race);
    } else if (source === 'ps') {
      const sky = ctx.createLinearGradient(0, 0, 960, 540); sky.addColorStop(0, '#062774'); sky.addColorStop(1, '#3974bd'); ctx.fillStyle = sky; ctx.fillRect(0, 0, 960, 540);
      for (let i = 0; i < 72; i++) { ctx.fillStyle = `rgba(220,240,255,${.35 + .25 * Math.sin(i + t)})`; ctx.fillRect((i * 137) % 960, (i * 79) % 370, 2, 2); }
      ctx.fillStyle = '#729ee5'; ctx.beginPath(); ctx.arc(692, 236, 130, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#b6d6ff'; ctx.lineWidth = 9; ctx.beginPath(); ctx.ellipse(692, 238, 198, 42, -.4, 0, Math.PI * 2); ctx.stroke();
      polygon(ctx, '#e0edfa', [[660, 196], [687, 225], [625, 218], [575, 225]]);
      ctx.fillStyle = '#f2f7ff'; ctx.font = '22px Arial'; ctx.fillText('Games    Media', 40, 43); ctx.font = '37px Arial'; ctx.fillText('Beyond the blue', 42, 208); ctx.font = '18px Arial'; ctx.fillText('A new constellation awaits', 44, 245);
      for (let i = 0; i < 5; i++) { ctx.fillStyle = ['#89abdf', '#193c73', '#a1b9dc', '#305da0', '#456fa5'][i]!; ctx.fillRect(42 + i * 174, 365, 157, 120); ctx.strokeStyle = '#e5f5ff'; ctx.lineWidth = 3; ctx.strokeRect(54 + i * 174, 382, 132, 69); ctx.fillStyle = '#eaf6ff'; ctx.font = '14px Arial'; ctx.fillText(['Continue', 'Explore', 'Library', 'Friends', 'Settings'][i]!, 61 + i * 174, 474); }
    } else {
      ctx.fillStyle = '#79dce5'; ctx.fillRect(0, 0, 960, 540);
      for (let i = 0; i < 12; i++) { ctx.strokeStyle = '#b9f3ea'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse((i * 171 + t * 9) % 1040 - 40, 230 + (i * 57) % 260, 28, 5, 0, 0, Math.PI); ctx.stroke(); }
      ctx.fillStyle = '#efdaa2'; ctx.beginPath(); ctx.ellipse(490, 313, 270, 125, -.08, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#91c866'; ctx.beginPath(); ctx.ellipse(490, 289, 232, 101, -.08, 0, Math.PI * 2); ctx.fill();
      for (const [x, y] of [[370, 205], [612, 229], [550, 172]]) { ctx.fillStyle = '#956d45'; ctx.fillRect(x - 7, y, 14, 56); ctx.fillStyle = '#4c9e67'; ctx.beginPath(); ctx.arc(x, y - 8, 35, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#fff2cd'; ctx.fillRect(445, 257, 79, 66); polygon(ctx, '#df8270', [[431, 259], [484, 214], [537, 259]]); ctx.fillStyle = '#967256'; ctx.fillRect(474, 284, 24, 39);
      ctx.fillStyle = '#f8fcf1'; ctx.font = '30px Arial'; ctx.fillText('Island days', 40, 56); ctx.font = '17px Arial'; ctx.fillText('Welcome home', 43, 83);
      for (let i = 0; i < 6; i++) { ctx.fillStyle = '#fff6dd'; ctx.beginPath(); ctx.arc(295 + i * 76, 480, 27, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = ['#80b665', '#e99474', '#65bbc9'][i % 3]!; ctx.fillRect(283 + i * 76, 468, 24, 24); }
    }
    ctx.restore();
  };
  drawSource(pcCanvas.ctx, 'pc', 0, 768, 432); pcCanvas.map.needsUpdate = true;
  drawSource(tvCanvas.ctx, 'pc', 0, 960, 540); tvCanvas.map.needsUpdate = true;
  b.root.userData = { keyboardKeys: keyCount, fanCount: 3, replicaNames: ['AK47', 'MosinNagant', 'MP5K'], figureNames, originalDesigns: true, modestClothing: true, consoleSources: ['pc', 'ps', 'switch'], virtualInputs: true, playableRacing: true, dynamicTransforms: ['interactiveRacingWheel'] };
  b.finish();
  let lastTick = -1, lastGaming: boolean | undefined, lastLights: boolean | undefined, lastSource: VillaScreenSource | undefined;
  return {
    colliders: b.colliders,
    update(time, state) {
      const tick = Math.floor(time * (state.screenSource === 'pc' ? 30 : 12));
      wheel.setSteer(state.race?.steer ?? 0);
      if (state.gaming !== lastGaming || state.displayLights !== lastLights) {
        rgb.emissiveIntensity = state.gaming && state.displayLights ? 1.1 : 0;
        rgbPink.emissiveIntensity = state.gaming && state.displayLights ? .8 : 0;
        rgb.color.set(state.gaming && state.displayLights ? '#54dedc' : '#253338');
        rgbPink.color.set(state.gaming && state.displayLights ? '#eab9fc' : '#30313a');
        warm.emissiveIntensity = state.displayLights ? .8 : 0;
        warm.color.set(state.displayLights ? '#ffe4b2' : '#665b49');
        pcMonitorMat.color.set(state.gaming ? '#ffffff' : '#030607'); sideMonitorMat.color.copy(pcMonitorMat.color);
      }
      if (tick !== lastTick || lastSource !== state.screenSource || lastGaming !== state.gaming) {
        drawSource(tvCanvas.ctx, state.screenSource, time, 960, 540, state.race); tvCanvas.map.needsUpdate = true;
        if (state.gaming) { drawSource(pcCanvas.ctx, 'pc', time, 768, 432, state.race); pcCanvas.map.needsUpdate = true; }
      }
      lastTick = tick; lastGaming = state.gaming; lastLights = state.displayLights; lastSource = state.screenSource;
      return false;
    },
  };
}
