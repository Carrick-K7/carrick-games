import * as THREE from 'three';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import { VILLA_ELEVATOR, type VillaElevatorState } from './villaElevator.js';

/** Scene-owned meshes/textures; the scene's normal disposal traversal owns cleanup.
 * Collision, arrival alignment and passenger support belong to villaElevator.ts.
 */
export function createVillaElevatorModel(parent: THREE.Object3D): {
  update(state: VillaElevatorState): boolean;
} {
  const e = VILLA_ELEVATOR;
  const shaft = new VillaModelBuilder(parent, 'villa-elevator');
  // Authored around the original shaft centre (0, -6.3); one translation moves
  // the whole tower to its swapped location without rewriting ~40 literals.
  shaft.root.position.set(e.centerX, 0, e.centerZ + 6.3);
  const bronze = villaMaterial('#8d7051', .36, .72);
  const brushed = villaMaterial('#ac9b82', .48, .68);
  const oak = villaMaterial('#b18a60', .64);
  const grain = villaMaterial('#95724f', .7);
  const stone = villaMaterial('#e3dacb', .57);
  // Warm ceramic tile for the car floor, with a slightly darker grout tone.
  const tile = villaMaterial('#d8cfc0', .42);
  const dark = villaMaterial('#302b26', .55, .3);
  const glass = new THREE.MeshStandardMaterial({
    color: '#dce7df', transparent: true, opacity: .12, roughness: .16,
    metalness: .12, depthWrite: false, side: THREE.DoubleSide,
  });
  // Single-pass glazing avoids doubling translucent faces and needs no transmission pass.
  glass.forceSinglePass = true;
  const warm = new THREE.MeshStandardMaterial({
    color: '#fff0d5', emissive: '#ffe0a0', emissiveIntensity: .65, roughness: .6,
  });
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Villa elevator needs a 2D canvas');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const labels = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  // One atlas: cell (0,0) is the dynamic floor display; the rest are button legends.
  const label = (b: VillaModelBuilder, row: number, x: number, y: number, z: number,
    width: number, height: number, yaw = 0) => {
    const g = new THREE.PlaneGeometry(width, height);
    const uv = g.getAttribute('uv');
    const top = row === 0 ? 0 : 32 / 256 + (row - 1) * 32 / 256;
    const span = 32 / 256;
    for (let i = 0; i < uv.count; i++) {
      // Crop each square atlas cell around its glyph, keeping natural proportions.
      uv.setX(i, .5 + (uv.getX(i) - .5) * 12 / 256);
      uv.setY(i, 1 - top - (1 - uv.getY(i)) * span);
    }
    b.geometry(g, labels, [x, y, z], [0, yaw, 0]);
  };

  const top = 10.1;
  // A recessed foundation under the car, not garden turf or a walkable floor.
  shaft.box(0, -.36, -6.3, 2.08, .12, 2.28, dark, 0);
  // Thin glass occupies the collision planes, not solid duplicated wall volumes.
  // Facade faces extend to -5.04, matching the specified z=-5.1, depth=.12 collider.
  for (const x of [-1.04, 1.04]) {
    shaft.geometry(new THREE.PlaneGeometry(2.28, top), glass, [x, top / 2, -6.3], [0, Math.PI / 2, 0]);
    for (const z of [-7.44, -5.16]) shaft.box(x, top / 2, z, .09, top, .09, bronze, .006);
  }
  shaft.geometry(new THREE.PlaneGeometry(2.08, top), glass, [0, top / 2, -7.44]);
  shaft.geometry(new THREE.PlaneGeometry(2.08, 2.28), glass, [0, top - .01, -6.3], [-Math.PI / 2, 0, 0]);
  shaft.box(0, top - .045, -5.1, 2.08, .09, .12, bronze, .005);
  for (const y of [0.045, 3.6, 7.2, top - .045]) {
    shaft.box(0, y, -7.44, 2.08, .075, .08, bronze, .004);
    for (const x of [-1.04, 1.04]) shaft.box(x, y, -6.3, .075, .075, 2.28, bronze, .004);
  }
  // Recessed vertical guide tracks read through the glass; no extra shaft floors.
  for (const x of [-.995, .995]) shaft.box(x, top / 2, -6.85, .018, top, .045, dark, 0);

  type Leaf = { root: THREE.Group; travel: number; amount: number };
  const makeDoors = (parentNode: THREE.Object3D, name: string, y: number, z: number): Leaf[] =>
    [-1, 1].flatMap(direction => [0, 1].map(track => {
      const width = e.doorWidth / 4;
      const start = track * width;
      const center = direction * (start + width / 2);
      const depth = z + track * .014;
      const side = direction < 0 ? 'left' : 'right';
      const leaf = new VillaModelBuilder(parentNode, `${name}-${side}-${track === 0 ? 'inner' : 'outer'}`);
      leaf.root.position.y = y;
      // Four rigid .325m leaves telescope on separate 10mm-deep tracks.
      // Inner leaves travel .66m; outer leaves travel .33m, stacking inside ±.985m.
      leaf.box(center, .22, depth, width, .44, .01, brushed, 0);
      leaf.box(center, 2.265, depth, width, .05, .01, brushed, 0);
      for (const x of [start + .012, start + width - .012]) {
        leaf.box(direction * x, 1.345, depth, .024, 1.79, .01, brushed, 0);
      }
      leaf.geometry(new THREE.PlaneGeometry(width - .048, 1.79), glass, [center, 1.345, depth]);
      leaf.box(direction * (start + .004), 1.145, depth, .008, 2.29, .012, dark, 0);
      return { root: leaf.finish(), travel: direction * (track === 0 ? .66 : .33), amount: -1 };
    }));
  const landings: Leaf[][] = [];
  for (const [floor, y] of e.floors.entries()) {
    const headerHeight = Math.min(3.6, top - y) - 2.3;
    for (const x of [-.875, .875]) {
      // Opaque pockets hide the retracted door ends, flush with the shaft facade.
      shaft.box(x, y + 1.15, -5.1, .45, 2.3, .12, bronze, .006);
    }
    shaft.geometry(new THREE.PlaneGeometry(2.08, headerHeight), glass,
      [0, y + 2.3 + headerHeight / 2, -5.1]);
    shaft.box(0, y + 2.345, -5.1, 2.08, .09, .12, bronze, .005);
    shaft.box(0, y + 2.41, -5.1, .28, .075, .12, dark, .005);
    label(shaft, 0, 0, y + 2.41, -5.039, .23, .055);
    // Small natural call station: raised circular button and numeric landing label.
    shaft.box(.865, y + 1.13, -5.025, .115, .235, .03, brushed, .006);
    shaft.cylinder(.865, y + 1.09, -5.002, .028, .028, .014, bronze, [Math.PI / 2, 0, 0], 12);
    label(shaft, floor + 1, .865, y + 1.195, -5.008, .052, .038);
    label(shaft, 4, .865, y + 1.09, -4.994, .038, .025);
    landings.push(makeDoors(shaft.root, `elevator-landing-${floor}-door`, y, -5.076));
  }
  shaft.finish();

  const car = new VillaModelBuilder(shaft.root, 'elevator-car');
  // Floor top is exactly state.y; the entire thickness travels below the passenger.
  // The car lives under the translated shaft root, so its floor uses local Z.
  car.box(0, -.055, (e.carMinZ + e.carMaxZ) / 2 - e.centerZ,
    e.carMaxX - e.carMinX, .11, e.carMaxZ - e.carMinZ, stone, .004);
  car.box(0, -.125, -6.24, 1.89, .03, 2.25, bronze, 0);
  car.box(0, 2.395, -6.25, 1.96, .09, 2.3, stone, .005);
  for (const x of [-.84, .84]) car.box(x, 2.345, -6.25, .035, .009, 1.9, warm, .002);
  // No second full-height side glass: slim cabin edge posts preserve sightlines.
  for (const x of [-.966, .966]) {
    for (const z of [-7.35, -5.15]) car.box(x, 1.175, z, .028, 2.35, .028, bronze, .003);
    car.box(x, .055, -6.25, .028, .11, 2.22, bronze, .003);
  }
  // Oak liner is only 10mm thick: 1.904m between posts, 2.25m rear-to-door clear.
  car.box(0, 1.175, -7.375, 1.93, 2.35, .01, oak, 0);
  for (let i = -4; i <= 4; i++) car.box(i * .205, 1.175, -7.369, .004, 2.31, .001, grain, 0);
  car.beam([-.83, 1.02, -7.285], [.83, 1.02, -7.285], .018, bronze, 10);
  for (const x of [-.75, .75]) car.beam([x, 1.02, -7.365], [x, 1.02, -7.285], .012, bronze, 8);
  car.box(0, 2.34, -5.12, 1.96, .08, .055, bronze, .003);
  // Rear-facing control station on the right front return, visible from inside.
  car.box(.823, 1.26, -5.17, .17, .59, .027, brushed, .006);
  label(car, 0, .823, 1.48, -5.184, .132, .063, Math.PI);
  // Manual call panel: the top floor sits at the top, and the door buttons sit
  // under the numbers, exactly like a real car operating panel.
  for (let row = 0; row < 3; row++) {
    const floor = 2 - row, y = 1.335 - row * .105;
    car.cylinder(.823, y, -5.19, .034, .034, .018, bronze, [Math.PI / 2, 0, 0], 12);
    label(car, floor + 1, .823, y, -5.2, .05, .038, Math.PI);
  }
  // Door buttons: open (left arrow) and close (right arrow) under the numbers.
  for (const [index, cell] of [[0, 5], [1, 6]] as const) {
    const x = .823 + (index === 0 ? -.035 : .035);
    car.cylinder(x, 1.02, -5.19, .027, .027, .016, brushed, [Math.PI / 2, 0, 0], 12);
    label(car, cell, x, 1.02, -5.198, .038, .032, Math.PI);
  }
  // Tiled car floor: warm stone tiles with visible grout and a bronze threshold
  // strip, so the cabin reads as a finished interior rather than bare ground.
  const tiles = [1.86, .42, .42, .42, .42], tileDepth = 2.3 / 4;
  for (let depth = 0; depth < 4; depth++) for (let across = 0; across < 5; across++) {
    const x = -.93 + tiles[0] / 2 + (across === 0 ? 0 : tiles.slice(0, across).reduce((a, b) => a + b, 0) + across * .012);
    const width = across === 0 ? tiles[0] : tiles[across];
    car.box(x, .003, -6.25 - 1.15 + tileDepth / 2 + depth * tileDepth, width, .008, tileDepth - .012, tile, .0015);
  }
  car.box(0, .012, -5.155, 1.9, .006, .05, bronze, .002);
  const carDoors = makeDoors(car.root, 'elevator-car-door', 0, -5.114);
  car.finish();

  const setDoor = (leaf: Leaf, amount: number): boolean => {
    if (leaf.amount === amount) return false;
    leaf.amount = amount;
    leaf.root.position.x = leaf.travel * amount;
    return true;
  };
  let displayKey = '';
  const updateDisplay = (state: VillaElevatorState) => {
    const key = `${state.floor}/${state.target}/${state.phase}`;
    if (key === displayKey) return;
    displayKey = key;
    ctx.fillStyle = '#302b26'; ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#ffe9bc'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '600 24px Arial, sans-serif';
    const arrow = state.phase === 'moving' ? (state.target > state.floor ? '↑' : '↓') : '';
    ctx.fillText(`${state.floor + 1}${arrow}`, 16, 17);
    // Static button legends: floors 1..3, the call dot, and the door arrows.
    ctx.font = '600 22px Arial, sans-serif';
    const cell = (row: number, glyph: string) => ctx.fillText(glyph, 16 + (row % 8) * 32, 33 + Math.floor(row / 8) * 32 + 16);
    for (let floor = 1; floor <= 3; floor++) cell(floor, String(floor));
    ctx.fillStyle = '#ffd08a'; cell(4, '●');
    ctx.fillStyle = '#9fdcb4'; cell(5, '◀'); cell(6, '▶');
    texture.needsUpdate = true;
  };
  return {
    update(state) {
      let changed = car.root.position.y !== state.y;
      car.root.position.y = state.y;
      const aligned = Math.abs(state.y - e.floors[state.floor]) < .001;
      const operating = state.phase === 'opening' || state.phase === 'open' || state.phase === 'closing';
      const amount = aligned && operating ? THREE.MathUtils.clamp(state.door, 0, 1) : 0;
      for (const leaf of carDoors) changed = setDoor(leaf, amount) || changed;
      for (const [floor, leaves] of landings.entries()) {
        for (const leaf of leaves) changed = setDoor(leaf, floor === state.floor ? amount : 0) || changed;
      }
      updateDisplay(state);
      return changed;
    },
  };
}
