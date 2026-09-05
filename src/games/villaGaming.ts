import * as THREE from 'three';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import { VILLA_RACING, type VillaActivityState, type VillaScreenSource } from './villaActivities.js';
import type { VillaCollider } from './villaWorld.js';
import { createVillaRace, drawVillaRace, type VillaRaceState } from './villaRacing.js';

type V3 = [number, number, number];

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
  const skin = villaMaterial('#ffe0ca', .65);
  const pink = villaMaterial('#ee87b7', .5);
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
      b.box(0, 0, .035, w + .055, h + .055, .055, black);
      b.geometry(new THREE.PlaneGeometry(w, h), mat, [0, 0, .068]);
    });
    mark(name, [x, y, z]); return mat;
  };

  // Walnut desk: wall side -Z, user +Z. The northern doorway is untouched.
  b.box(7.25, .775, 3.84, 2.7, .055, .85, walnut);
  for (const x of [6.08, 8.42]) {
    b.box(x, .395, 3.84, .055, .73, .63, black);
    b.box(x, .05, 3.84, .12, .07, .73, black);
  }
  b.box(7.25, .58, 3.5, 2.31, .055, .04, steel);
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
    b.box(x, y, z, width, .021, .027, label === 'Esc' ? turquoise : black, .004);
    // Raised shoulders plus smaller softly rounded face read as profiled keycaps.
    b.box(x, y + .01, z - .001, width * .86, .006, .023, label === 'Esc' ? turquoise : rubber, .002);
    const column = keyCount % 16, row = Math.floor(keyCount / 16);
    legend.ctx.fillText(label, column * 64 + 32, row * 64 + 31, 61);
    const geometry = new THREE.PlaneGeometry(width * .83, .022);
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (column + uv.getX(i)) / 16, 1 - (row + 1 - uv.getY(i)) / 8);
    b.geometry(geometry, keyMat, [x, y + .0135, z - .001], [-Math.PI / 2, 0, 0]); keyCount++;
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
  b.ellipsoid(7.48, .837, 4.02, .044, .028, .071, black);
  for (const x of [7.457, 7.5]) b.ellipsoid(x, .85, 3.985, .02, .012, .034, rubber);
  b.cylinder(7.48, .861, 3.985, .012, .012, .011, steel, [0, 0, Math.PI / 2], 14);
  for (const z of [4.012, 4.036]) b.box(7.437, .845, z, .008, .007, .017, grey, .003);
  cable([[7.48, .843, 3.953], [7.5, .815, 3.82], [7.37, .812, 3.69], [7.48, .79, 3.48]], .003, black);
  cable([[6.96, .834, 3.933], [6.98, .815, 3.76], [7.13, .812, 3.68], [7.17, .76, 3.44]], .003, rubber);
  mark('ergonomicMouse', [7.48, .84, 4.02], { splitButtons: true, scrollWheel: true, sideButtons: 2, wired: true });
  const pcCanvas = canvas(768, 432);
  const pcMonitorMat = screen('pcMonitor', 7.05, 1.17, 3.62, .77, .433, pcCanvas.map);
  const sideMonitorMat = screen('secondaryMonitor', 6.25, 1.17, 3.69, .52, .33, pcCanvas.map, .18);
  for (const x of [6.25, 7.05]) {
    b.box(x, .803, 3.46, .11, .03, .1, steel);
    b.beam([x, .81, 3.45], [x, 1.06, 3.45], .019, black);
    b.beam([x, 1.06, 3.45], [x + .12, 1.16, 3.5], .018, steel);
    b.beam([x + .12, 1.16, 3.5], [x, 1.17, 3.59], .016, black);
  }
  // Headset on a simple desk stand, microphone on an articulated arm.
  b.box(7.7, .824, 3.65, .12, .025, .11, black);
  b.beam([7.7, .84, 3.65], [7.7, 1.06, 3.65], .009, steel);
  b.geometry(new THREE.TorusGeometry(.071, .012, 7, 20, Math.PI), rubber, [7.7, 1.035, 3.65]);
  for (const x of [7.626, 7.774]) b.ellipsoid(x, 1.01, 3.65, .02, .045, .034, black);
  b.beam([6.02, .82, 3.76], [6.08, 1.08, 3.8], .009, black);
  b.beam([6.08, 1.08, 3.8], [6.38, 1.02, 3.96], .009, black);
  b.cylinder(6.38, .98, 3.96, .021, .021, .087, rubber);

  // Open interior showcase PC. Only the bottom, rear and top are opaque panels.
  b.at(8.12, .8, 3.84, 0, () => {
    b.box(0, .018, 0, .32, .035, .4, black);
    b.box(0, .465, 0, .32, .027, .4, black);
    b.box(0, .24, -.19, .32, .45, .018, black);
    b.box(-.151, .245, 0, .009, .425, .38, glass, 0);
    b.box(0, .245, .201, .315, .425, .004, glass, 0);
    for (const x of [-.145, .145]) for (const z of [-.18, .18]) b.box(x, -.006, z, .028, .025, .03, rubber);
    b.box(.133, .27, -.035, .015, .32, .275, green, 0);
    b.box(.115, .31, -.095, .018, .084, .078, steel);
    b.box(.095, .31, -.095, .035, .068, .068, black);
    ring(.074, .31, -.095, .026, .003, rgb, [0, Math.PI / 2, 0]);
    for (const z of [-.03, -.005]) { b.box(.103, .345, z, .027, .16, .012, black); b.box(.084, .345, z, .007, .155, .008, rgbPink); }
    b.box(0, .155, -.025, .26, .047, .27, black);
    b.box(0, .183, -.025, .252, .009, .264, steel);
    b.box(-.132, .16, -.025, .009, .018, .25, rgb);
    for (const z of [-.103, .043]) {
      ring(0, .127, z, .047, .005, steel, [Math.PI / 2, 0, 0]);
      b.cylinder(0, .126, z, .014, .014, .012, black);
    }
    b.box(.02, .067, -.08, .21, .065, .2, rubber);
    // Three front intake fans visible through the completely clear front sheet.
    for (let i = 0; i < 3; i++) {
      const y = .115 + i * .124;
      ring(0, y, .16, .052, .004, rgb); ring(0, y, .154, .055, .003, black);
      b.cylinder(0, y, .154, .013, .013, .014, steel, [Math.PI / 2, 0, 0]);
      for (let j = 0; j < 7; j++) {
        const a = j * Math.PI * 2 / 7;
        b.geometry(new THREE.BoxGeometry(.024, .012, .006), rubber, [Math.cos(a) * .032, y + Math.sin(a) * .032, .152], [0, 0, a + .55]);
      }
    }
    b.box(0, .432, -.045, .245, .025, .22, steel);
    cable([[.078, .33, -.115], [.015, .385, -.145], [-.07, .4, -.1], [-.075, .435, .005]], .007, rubber);
    cable([[.078, .29, -.11], [-.035, .32, -.15], [-.11, .415, -.1], [-.055, .435, .015]], .007, rubber);
    for (let i = 0; i < 4; i++) cable([[.06 + i * .009, .13, .075], [.08 + i * .009, .09, .1], [.11, .08, -.12]], .003, i % 2 ? grey : rubber);
    b.box(0, .48, .125, .03, .004, .015, rgb);
  });
  mark('panoramicGamingPC', [8.12, .8, 3.84], { fanCount: 3, glassSides: 2, components: ['motherboard', 'GPU', 'RAM', 'AIO', 'PSU', 'cables'], size: [.32, .48, .4] });

  // Ergonomic chair, facing -Z towards the PC; cockpit seat reuses the bucket form facing +Z.
  const bucket = (x: number, z: number, yaw: number, racing: boolean) => b.at(x, 0, z, yaw, () => {
    b.box(0, .47, .015, .49, .12, .48, rubber, .045);
    b.box(0, .537, .015, .37, .025, .35, black, .01);
    b.geometry(new THREE.BoxGeometry(.43, .66, .105), rubber, [0, .85, .22], [.12, 0, 0]);
    b.box(0, 1.2, .265, .3, .2, .12, black, .03);
    b.box(0, 1.08, .165, .245, .1, .075, turquoise, .02);
    b.box(0, .7, .155, .3, .14, .09, black, .025);
    for (const side of [-1, 1]) {
      b.beam([side * .215, .59, .15], [side * .225, 1.12, .25], .044, black);
      b.beam([side * .24, .51, -.17], [side * .245, .57, .17], .04, turquoise);
      b.beam([side * .195, .71, .122], [side * .205, 1.05, .188], .006, turquoise);
      if (!racing) {
        b.box(side * .31, .69, -.035, .085, .045, .27, rubber, .012);
        b.beam([side * .28, .46, .075], [side * .31, .67, .05], .017, steel);
      }
    }
    if (!racing) {
      b.cylinder(0, .27, 0, .026, .038, .31, steel);
      for (let i = 0; i < 5; i++) {
        const a = i * Math.PI * 2 / 5, x1 = Math.sin(a) * .32, z1 = Math.cos(a) * .32;
        b.beam([0, .17, 0], [x1, .085, z1], .019, black);
        b.cylinder(x1, .047, z1, .039, .039, .065, rubber, [0, 0, Math.PI / 2], 12);
      }
    }
  });
  bucket(7.25, 5.1, 0, false); b.collide(7.25, 0, 5.1, .7, 1.31, .75);
  mark('ergonomicGamingChair', [7.25, 0, 5.1], { wheels: 5, headrest: true, lumbar: true, armrests: 2 });

  // North-wall locked replica cabinet, warm rim light, three horizontal display bays.
  b.at(10.35, 0, 3.3, 0, () => {
    b.box(0, 1.4, -.185, 2.9, 2.55, .045, walnut);
    b.box(0, 1.4, -.153, 2.77, 2.43, .018, rubber);
    for (const x of [-1.43, 1.43]) b.box(x, 1.4, 0, .04, 2.55, .42, walnut);
    for (const y of [.125, 2.675]) b.box(0, y, 0, 2.9, .045, .42, walnut);
    for (const y of [.2, 1, 1.83, 2.61]) b.box(0, y, -.11, 2.79, .012, .018, warm, .003);
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
      silhouette([[.84, -.01], [1.04, -.01], [1.03, -.2], [1.1, -.37], [.97, -.42], [.86, -.27]], .066, black, [0, 0, .012]);
      for (let i = 0; i < 3; i++) b.beam([.88 + i * .035, -.08, .08], [.96 + i * .025, -.32, .08], .004, steel);
      silhouette([[.59, 0], [.71, -.015], [.67, -.22], [.56, -.19]], .07, wood, [0, 0, .01]);
      ring(.77, -.079, .055, .055, .006, steel);
    });
    b.at(-1.28, 1.48, -.045, 0, () => {
      silhouette([[0, -.09], [.38, -.055], [.66, .025], [1.89, .025], [1.89, .095], [.7, .09], [.4, .045], [.03, .13]], .074, wood, [0, 0, 0]);
      b.beam([.59, .118, .037], [2.5, .118, .037], .017, steel);
      b.box(.76, .114, .038, .4, .075, .09, black, .004);
      for (const x of [1.35, 1.77]) b.box(x, .055, .038, .045, .115, .085, steel, .002);
      b.beam([.88, .14, .075], [.9, .065, .125], .009, steel); b.ellipsoid(.9, .065, .125, .021, .021, .021, black);
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
      b.box(.62, -.14, .04, .105, .35, .075, black, .006);
      b.box(.91, -.06, .04, .085, .25, .085, rubber, .017);
      for (let i = 0; i < 4; i++) b.box(.91, -.13 + i * .041, .085, .078, .009, .008, steel, .002);
      ring(.47, -.045, .055, .056, .006, black); ring(.99, .217, .04, .035, .008, steel, [0, Math.PI / 2, 0]);
    });
  });
  b.collide(10.35, .125, 3.3, 2.9, 2.55, .44);
  mark('lockedReplicaCabinet', [10.35, 1.4, 3.3], { locked: true, decorativeOnly: true, replicaNames: ['AK47', 'MosinNagant', 'MP5K'], orangeMuzzleTips: true });

  // Nine original garden-club girls, sculpted here from primitives. No IP references.
  // Oversized rounded heads, cheerful faces, full sleeves and ankle coverage.
  const figureNames: string[] = [];
  const chibiDesigns = [
    { name: 'Hazel / seed keeper', hair: wood, style: 'bob', outfit: green, clothing: 'long dress and cardigan', pose: 'seed pouch' },
    { name: 'Alba / cloud reader', hair: white, style: 'side bun', outfit: blue, clothing: 'overalls and long-sleeve shirt', pose: 'wave' },
    { name: 'Poppy / picnic planner', hair: villaMaterial('#ad543b', .7), style: 'braid', outfit: pink, clothing: 'long dress and cardigan', pose: 'book' },
    { name: 'Violet / letter writer', hair: villaMaterial('#7e6b98', .7), style: 'bob', outfit: white, clothing: 'cardigan and trousers', pose: 'wave' },
    { name: 'Maren / pebble finder', hair: black, style: 'side bun', outfit: grey, clothing: 'overalls and long-sleeve shirt', pose: 'seed pouch' },
    { name: 'Saffron / morning baker', hair: villaMaterial('#d9ae63', .7), style: 'curls', outfit: orange, clothing: 'long dress and cardigan', pose: 'book' },
    { name: 'Fern / kite maker', hair: villaMaterial('#547464', .7), style: 'braid', outfit: white, clothing: 'cardigan and trousers', pose: 'wave' },
    { name: 'Rosie / berry gardener', hair: pink, style: 'curls', outfit: green, clothing: 'overalls and long-sleeve shirt', pose: 'seed pouch' },
    { name: 'Dove / little painter', hair: grey, style: 'bob', outfit: red, clothing: 'long dress and cardigan', pose: 'book' },
  ];
  const chibiGirl = (x: number, y: number, index: number) => b.at(x, y, -.006, 0, () => {
    const design = chibiDesigns[index]!, dress = design.clothing.startsWith('long dress'), overalls = design.clothing.startsWith('overalls');
    b.cylinder(0, .023, 0, .145, .145, .035, walnut, [0, 0, 0], 18);
    ring(0, .042, 0, .124, .004, design.outfit, [Math.PI / 2, 0, 0]);
    for (const side of [-1, 1]) {
      // Opaque leggings/trousers run into substantial closed sneakers.
      b.cylinder(side * .043, .17, 0, .031, .029, .22, overalls ? design.outfit : grey, [0, 0, 0], 10);
      b.ellipsoid(side * .044, .064, .025, .039, .025, .056, white);
      b.box(side * .044, .047, .027, .078, .012, .102, rubber, .004);
      b.box(side * .044, .084, .041, .044, .009, .025, design.outfit, .003);
    }
    if (dress) b.cylinder(0, .232, 0, .059, .099, .29, design.outfit, [0, 0, 0], 16);
    b.cylinder(0, .355, 0, .071, .066, .17, overalls ? white : design.outfit, [0, 0, 0], 14);
    if (overalls) {
      b.box(0, .322, .06, .093, .113, .026, design.outfit, .006);
      for (const side of [-1, 1]) b.beam([side * .038, .427, .046], [side * .033, .328, .079], .009, design.outfit, 6);
      b.box(0, .319, .079, .046, .032, .009, white, .003);
    } else {
      b.beam([0, .422, .068], [0, .307, .068], .0035, white, 6);
      for (const yy of [.33, .365, .4]) b.ellipsoid(.012, yy, .071, .005, .005, .003, walnut);
    }
    // High round collar: no exposed torso, shoulders or neckline.
    b.cylinder(0, .435, 0, .035, .047, .023, white, [0, 0, 0], 12);
    b.ellipsoid(0, .535, -.019, .111, .11, .087, design.hair);
    b.ellipsoid(0, .527, .02, .102, .096, .079, skin);
    b.ellipsoid(0, .596, -.006, .109, .051, .084, design.hair);
    for (let i = 0; i < 4; i++) b.ellipsoid(-.071 + i * .044, .577 + Math.sin(i) * .006, .073, .032, .032, .021, design.hair);
    for (const side of [-1, 1]) {
      b.ellipsoid(side * .095, .538, -.012, .024, .059, .064, design.hair);
      b.ellipsoid(side * .034, .53, .095, .014, .019, .006, black);
      b.ellipsoid(side * .034 - .004, .536, .101, .0045, .006, .0015, white);
      b.ellipsoid(side * .066, .508, .083, .014, .006, .003, pink);
      const waving = design.pose === 'wave' && side === 1;
      const elbow: V3 = [side * .106, waving ? .423 : .338, .018];
      const hand: V3 = [side * (waving ? .142 : .065), waving ? .484 : .305, .09];
      b.beam([side * .063, .407, 0], elbow, .028, overalls ? white : design.outfit);
      b.beam(elbow, hand, .025, overalls ? white : design.outfit);
      b.ellipsoid(...hand, .022, .022, .019, skin);
    }
    // A tiny curved smile, rather than an idol microphone or headset.
    b.geometry(new THREE.TorusGeometry(.014, .0025, 5, 10, Math.PI), walnut, [0, .507, .098], [0, 0, Math.PI]);
    if (design.style === 'side bun') b.ellipsoid(.106, .609, -.029, .046, .043, .043, design.hair);
    if (design.style === 'braid') for (let i = 0; i < 4; i++) b.ellipsoid(-.109 + (i % 2) * .01, .489 - i * .03, -.021, .024, .024, .029, design.hair);
    if (design.style === 'curls') for (const side of [-1, 1]) for (let i = 0; i < 3; i++) b.ellipsoid(side * .1, .562 - i * .032, -.003, .026, .025, .043, design.hair);
    if (design.pose === 'book') {
      b.box(0, .307, .101, .115, .084, .023, walnut, .003);
      b.box(0, .307, .115, .104, .072, .009, white, .002);
      b.beam([0, .275, .122], [0, .34, .122], .002, design.outfit, 6);
    }
    if (design.pose === 'seed pouch') {
      b.ellipsoid(0, .293, .099, .047, .045, .025, walnut);
      b.ellipsoid(0, .297, .123, .009, .015, .004, green);
    }
    figureNames.push(design.name);
    mark(`originalChibiGirl-${index}`, [2.32, y, 6.45 - x], { character: design.name, authored3D: true, originalDesigns: true, modestClothing: true, hairstyle: design.style, clothing: design.clothing, pose: design.pose });
  });
  b.at(2.32, 0, 6.45, Math.PI / 2, () => {
    b.box(0, 1.27, -.207, 3.7, 2.5, .045, walnut);
    b.box(0, 1.27, -.18, 3.6, 2.4, .015, rubber);
    for (const x of [-1.825, 1.825]) b.box(x, 1.27, 0, .05, 2.5, .48, walnut);
    for (const y of [.035, .85, 1.67, 2.515]) b.box(0, y, 0, 3.7, .037, .48, walnut);
    for (const x of [-.61, .61]) b.box(x, 1.27, 0, .025, 2.46, .44, walnut);
    for (const y of [.81, 1.63, 2.47]) b.box(0, y, -.135, 3.58, .015, .018, warm, .002);
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) chibiGirl((col - 1) * 1.22, .065 + row * .82, row * 3 + col);
    for (let i = 0; i < 3; i++) b.box((i - 1) * 1.22, 1.275, .241, 1.19, 2.43, .006, glass, 0);
  });
  b.collide(2.32, 0, 6.45, .49, 2.52, 3.7);
  mark('originalChibiGirlWall', [2.32, 0, 6.45], { figureNames, compartments: 9, variants: 9, originalDesigns: true, modestClothing: true, facing: '+X', frontMaxX: 2.564 });

  // Independent aluminium-profile FFB simulator; central seating reference is shared.
  const sx = VILLA_RACING.seat.x, sz = VILLA_RACING.seat.z;
  bucket(sx, sz, Math.PI, true);
  for (const x of [sx - .5, sx + .5]) {
    b.box(x, .15, 6.86, .075, .1, 2.48, steel, .003);
    b.box(x, .177, 6.86, .02, .008, 2.43, black, .001);
    for (const z of [5.7, 6.25, 7.85]) b.box(x, .055, z, .14, .06, .16, rubber);
    b.beam([x, .2, 6.83], [x, .94, 7.06], .029, steel);
    b.box(x, .52, 6.06, .035, .45, .2, black);
  }
  for (const z of [5.7, 6.35, 7.92]) b.box(sx, .16, z, 1.06, .085, .06, steel, .002);
  b.box(sx, .93, 7.065, 1.1, .055, .35, black);
  b.box(sx, 1.01, 7.05, .32, .16, .31, black);
  for (let i = 0; i < 5; i++) b.box(sx - .11 + i * .055, 1.095, 7.065, .02, .01, .21, steel, .001);
  // Only the wheel is transformable: three material batches, no per-button meshes.
  const wheelMount = new THREE.Group(); wheelMount.position.set(sx, 1.045, 6.825); wheelMount.rotation.x = -.25; b.root.add(wheelMount);
  const wheel = new VillaModelBuilder(wheelMount, 'interactiveRacingWheel');
  wheel.geometry(new THREE.TorusGeometry(.178, .018, 6, 24), rubber);
  wheel.cylinder(0, 0, .014, .057, .057, .055, rubber, [Math.PI / 2, 0, 0]);
  for (const a of [0, Math.PI, Math.PI * 1.5]) wheel.beam([0, 0, 0], [Math.cos(a) * .16, Math.sin(a) * .16, 0], .013, steel);
  wheel.box(0, .174, 0, .022, .023, .03, turquoise, .003);
  for (const side of [-1, 1]) {
    wheel.box(side * .092, .016, .055, .047, .125, .014, steel, .008);
    for (const x of [.068, .105]) wheel.cylinder(side * x, .019, -.025, .009, .009, .009, turquoise, [Math.PI / 2, 0, 0], 8);
  }
  wheel.finish();
  wheel.root.traverse(node => { if (node instanceof THREE.Mesh) node.castShadow = false; });
  b.box(sx, .24, 7.66, .67, .045, .64, black);
  for (let i = 0; i < 3; i++) {
    const x = sx - .22 + i * .22;
    b.beam([x, .27, 7.82], [x, .43, 7.59], .013, steel);
    b.geometry(new THREE.BoxGeometry(.115, .19, .018), steel, [x, .4, 7.61], [-.5, 0, 0]);
    for (let j = 0; j < 3; j++) b.box(x, .346 + j * .04, 7.575 - j * .018, .09, .009, .006, rubber, .001);
  }
  b.box(10.5, .68, 6.72, .32, .045, .3, steel);
  b.beam([10.46, .18, 6.72], [10.46, .68, 6.72], .025, steel);
  b.box(10.5, .74, 6.72, .15, .1, .17, black);
  b.beam([10.5, .78, 6.72], [10.5, .94, 6.72], .012, steel);
  b.ellipsoid(10.5, .96, 6.72, .035, .037, .035, black);
  b.collide(9.8, 0, 6.86, 1.16, 1.28, 2.48);
  b.collide(10.5, 0, 6.72, .33, .99, .31);
  mark('racingCockpit', [sx, 0, sz], { seat: VILLA_RACING.seat, exit: VILLA_RACING.exit, forward: '+Z', bounds: { minX: 9.22, maxX: 10.665, minZ: 5.55, maxZ: 8.1 }, pedals: 3, paddleShifters: 2, gearShifter: true });

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
  b.box(9.29, .55, 8.53, .48, .105, .29, black, .025);
  for (const y of [.491, .615]) {
    b.geometry(new THREE.BoxGeometry(.515, .018, .31), white, [9.29, y, 8.525], [0, -.07, -.035]);
  }
  b.box(9.28, .558, 8.377, .27, .007, .005, blue, .001);
  b.box(9.39, .522, 8.377, .14, .006, .005, black, .001);
  const controller = (x: number, y: number, z: number) => {
    b.ellipsoid(x, y, z, .09, .028, .045, white);
    for (const side of [-1, 1]) {
      b.ellipsoid(x + side * .065, y - .005, z - .037, .032, .029, .052, white);
      b.cylinder(x + side * .032, y + .027, z - .008, .012, .012, .011, black, [0, 0, 0], 10);
    }
    b.box(x, y + .027, z + .014, .045, .006, .03, black, .003);
    b.box(x - .06, y + .026, z + .018, .027, .007, .008, black, .002);
    b.box(x - .06, y + .026, z + .018, .008, .007, .027, black, .002);
    for (let i = 0; i < 4; i++) b.cylinder(x + .061 + Math.cos(i * Math.PI / 2) * .012, y + .028, z + .018 + Math.sin(i * Math.PI / 2) * .012, .0038, .0038, .006, grey, [0, 0, 0], 6);
  };
  controller(9.72, .525, 8.42);
  b.box(10.32, .56, 8.6, .29, .15, .082, black, .009); // dock
  b.box(10.32, .68, 8.555, .29, .172, .024, black, .007);
  for (const side of [-1, 1]) {
    const x = 10.32 + side * .174;
    b.box(x, .68, 8.555, .055, .17, .027, side < 0 ? blue : red, .011);
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
      wheel.root.rotation.z = -(state.race?.steer ?? 0) * .55;
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
