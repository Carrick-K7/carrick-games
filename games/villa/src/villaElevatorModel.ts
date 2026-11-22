import * as THREE from 'three';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import { IndexedFittingBuilder, cabinetPull, panel, piercedPanel, surround, vessel } from './villaFittingGeometry.js';
import { VILLA_ELEVATOR, type VillaElevatorState } from './villaElevator.js';
import { millSection } from './villaArchitecturalStock.js';
import { cabinKeys, cabinSteel, linerBlank, trackedSill } from './villaCabinDetail.js';

/** Scene-owned meshes/textures; the scene's normal disposal traversal owns cleanup.
 * Collision, arrival alignment and passenger support belong to villaElevator.ts.
 */
export function createVillaElevatorModel(parent: THREE.Object3D): {
  update(state: VillaElevatorState): boolean;
} {
  const e = VILLA_ELEVATOR;
  // This model authors its geometry in the shaft's own frame; the root below
  // translates that frame onto the real shaft. Convert world coordinates with
  // these rather than re-deriving offsets by hand.
  const originX = e.centerX, originZ = e.centerZ + 6.3;
  const localX = (worldX: number) => worldX - originX;
  const localZ = (worldZ: number) => worldZ - originZ;
  const shaft = new IndexedFittingBuilder(parent, 'villa-elevator');
  // Authored around the original shaft centre (0, -6.3); one translation moves
  // the whole tower to its swapped location without rewriting ~40 literals.
  shaft.root.position.set(originX, 0, originZ);
  const bronze = villaMaterial('#8d7051', .36, .72);
  const brushed = cabinSteel();
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
  // Engraving alone is ink. Unprinted pixels expose the real satin face/lens
  // below it; a black rectangular sticker must not cover a circular plunger.
  const labels = new THREE.MeshBasicMaterial({ map: texture, alphaTest: .30, toneMapped: false });
  // One atlas: cell (0,0) is the dynamic floor display; the rest are button legends.
  const label = (b: VillaModelBuilder, row: number, x: number, y: number, z: number,
    width: number, height: number, yaw = 0) => {
    const g = new THREE.PlaneGeometry(width, height);
    const uv = g.getAttribute('uv');
    const span = 32 / 256;
    for (let i = 0; i < uv.count; i++) {
      // Sample the SAME row/column that receives the painted glyph. Match the
      // physical lens aspect ratio, rather than stretching a narrow UV sliver.
      uv.setX(i, .5 + (uv.getX(i) - .5) * span * width / height);
      uv.setY(i, 1 - row * span - (1 - uv.getY(i)) * span);
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
  for (const sign of [-1, 1]) {
    shaft.box(sign * 1.011, top / 2, -6.85, .012, top, .071, dark, 0);
    shaft.box(sign * .996, top / 2, -6.85, .020, top, .012, brushed, .002);
    for (const y of [.52, 3.88, 7.46]) shaft.box(sign * 1.023, y, -6.85, .034, .092, .121, bronze, .003);
  }

  type Leaf = { root: THREE.Group; travel: number; amount: number };
  const makeDoors = (parentNode: THREE.Object3D, name: string, y: number, z: number): Leaf[] =>
    [-1, 1].flatMap(direction => [0, 1].map(track => {
      const width = e.doorWidth / 4;
      const start = track * width;
      const center = direction * (start + width / 2);
      const depth = z + track * .014;
      const side = direction < 0 ? 'left' : 'right';
      const leaf = new IndexedFittingBuilder(parentNode, `${name}-${side}-${track === 0 ? 'inner' : 'outer'}`);
      leaf.root.position.y = y;
      // Four rigid .325m leaves telescope on separate 10mm-deep tracks.
      // Inner leaves travel .66m; outer leaves travel .33m, stacking inside ±.985m.
      // The moving kick plate clears the top of the sill; only its guide gib
      // enters the milled slot. No change to leaf travel or the safety gate.
      const carLeaf=name==='elevator-car-door', foot=carLeaf?.014:0;
      leaf.box(center,(.44+foot)/2,depth,width,.44-foot,.010,brushed,.001);
      if(carLeaf) leaf.box(center,.0093,depth,.085,.011,.0028,dark,0);
      leaf.box(center, 2.265, depth, width, .05, .010, brushed, .001);
      // An extruded sash and compression seals return onto BOTH faces of the single
      // glass. Depth stays below the 14mm track pitch even at full telescope.
      leaf.geometry(surround(width, 1.802, .005, [[0, -.004], [0, .004], [.002, .005], [.017, .005],
        [.021, .003], [.024, .002], [.024, -.002], [.020, -.003], [.017, -.005], [.002, -.005], [0, -.004]], 2), brushed, [center, 1.34, depth]);
      leaf.geometry(surround(width - .044, 1.758, .004, [[0, -.003], [0, .003], [.004, .002],
        [.004, -.002], [0, -.003]], 2), dark, [center, 1.34, depth]);
      leaf.geometry(new THREE.PlaneGeometry(width - .047, 1.755), glass, [center, 1.34, depth]);
      for (const face of [-1, 1]) for (const y of [.085, .101])
        leaf.box(center, y, depth + face * .0051, width - .043, .003, .001, dark, 0);
      leaf.box(direction*(start+.004),(2.29+foot)/2,depth,.008,2.29-foot,.012,dark,0);
      return { root: leaf.finish(), travel: direction * (track === 0 ? .66 : .33), amount: -1 };
    }));
  const landings: Leaf[][] = [];
  for (const [floor, y] of e.floors.entries()) {
    const headerHeight = Math.min(3.6, top - y) - 2.3;
    for (const x of [-.875, .875]) {
      // Hollow pocket, not a solid block intersecting the parked leaves. The
      // jamb lips hide their ends; between the skins both tracks remain free.
      // The folded face catches light at a 4 mm arris. Its hems stop outside
      // the two moving tracks; the dark pocket remains visible at the mouth.
      shaft.geometry(linerBlank(.45,2.30,.37+x),brushed,[x,y+1.15,-5.047]);
      shaft.box(x, y + 1.15, -5.151, .45, 2.3, .018, bronze, .003);
      shaft.box(x + Math.sign(x) * .216, y + 1.15, -5.1, .018, 2.3, .091, bronze, .002);
      shaft.box(x, y + 2.294, -5.1, .45, .012, .091, bronze, .002);
    }
    shaft.geometry(new THREE.PlaneGeometry(2.08, headerHeight), glass,
      [0, y + 2.3 + headerHeight / 2, -5.1]);
    shaft.geometry(millSection('x',2.08,[[-.06,0],[.058,0],[.063,.006],[.063,.095],[.058,.100],[-.059,.100],[-.059,.091],
      [.052,.091],[.052,.013],[-.043,.013],[-.043,.021],[-.060,.021]]),brushed,[0,y+2.3,-5.1]);
    shaft.geometry(millSection('x',e.doorWidth,[[-.051,0],[-.041,.001],[-.035,.008],[.035,.008],[.039,.002],[.048,.002],[.05,.012],[-.051,.012]]),dark,[0,y+2.301,-5.099]);
    shaft.geometry(trackedSill(e.doorWidth,false),brushed,[0,y,-5.016]);
    shaft.geometry(panel(.39,.108,.012,.025,.003),dark,[0,y+2.349,-5.029]);
    label(shaft, 0, 0, y + 2.349, -5.016, .30, .081);
    // Small natural call station: raised circular button and numeric landing label.
    shaft.box(.865, y + 1.13, -5.025, .115, .235, .03, brushed, .006);
    shaft.geometry(vessel([[.020, 0], [.030, .001], [.032, .004], [.031, .008], [.026, .010], [.024, .008], [.023, .011],
      [.021, .013], [0, .013]], 20), bronze, [.865, y + 1.09, -5.008], [Math.PI / 2, 0, 0]);
    label(shaft, floor + 1, .865, y + 1.195, -5.008, .052, .038);
    label(shaft, 4, .865, y + 1.09, -4.994, .038, .025);
    landings.push(makeDoors(shaft.root, `elevator-landing-${floor}-door`, y, -5.076));
  }
  shaft.finish();

  const car = new IndexedFittingBuilder(shaft.root, 'elevator-car');
  // Floor top is exactly state.y; the entire thickness travels below the passenger.
  // The car lives under the translated shaft root, so its floor uses local Z.
  car.box(localX((e.carMinX + e.carMaxX) / 2), -.055, localZ((e.carMinZ + e.carMaxZ) / 2),
    e.carMaxX - e.carMinX, .11, e.carMaxZ - e.carMinZ, stone, .004);
  car.box(0, -.125, -6.24, 1.89, .03, 2.25, bronze, 0);
  const vents: [number, number, number, number][] = [];
  for (const x of [-.66, .66]) for (let i = 0; i < 6; i++) vents.push([x, .42 + i * .050, .105, .010]);
  car.geometry(piercedPanel(1.96, 2.30, .09, vents), stone, [0, 2.395, -6.25], [-Math.PI / 2, 0, 0]);
  for (const x of [-.66, .66]) car.box(x, 2.436, -6.792, .235, .005, .308, bronze, 0);
  for (const x of [-.84, .84]) {
    car.box(x, 2.347, -6.25, .048, .014, 1.92, brushed, .003);
    car.box(x, 2.338, -6.25, .029, .007, 1.896, warm, .002);
  }
  // No second full-height side glass: slim cabin edge posts preserve sightlines.
  for (const x of [-.966, .966]) {
    for (const z of [-7.35, -5.15]) car.box(x, 1.175, z, .028, 2.35, .028, bronze, .003);
    car.box(x, .055, -6.25, .028, .11, 2.22, bronze, .003);
  }
  // Three drawn blanks over a dark backing. Their visible face sits on the
  // original liner plane. Small corner wraps turn the brushing into the side
  // reveals; the entire side window between the posts remains clear.
  car.box(0,1.175,-7.383,1.93,2.35,.004,dark,0);
  for(let i=-1;i<=1;i++) car.geometry(linerBlank(.632,2.189,.29+i*.17),brushed,[i*.638,1.235,-7.370]);
  for(const side of [-1,1]) {
    car.geometry(linerBlank(.174,2.189,.54),brushed,[side*.969,1.235,-7.270],[0,-side*Math.PI/2,0]);
    car.geometry(linerBlank(.28,2.292,.25+side*.2),brushed,[side*.810,1.167,-5.154],[0,Math.PI,0]);
  }
  car.geometry(millSection('x',1.916,[[-.010,.003],[.012,.003],[.016,.008],[.016,.125],[.011,.132],[-.009,.132],[-.009,.125],[.009,.125],[.009,.012],[-.010,.012]]),bronze,[0,0,-7.369]);
  car.geometry(cabinetPull(1.648, .077, .0205), bronze, [0, 1.02, -7.367]);
  for (const x of [-.824, .824]) car.geometry(vessel([[.024, 0], [.029, .002], [.030, .005], [.027, .009], [.021, .011]], 16), brushed,
    [x, 1.02, -7.367], [Math.PI / 2, 0, 0]);
  car.geometry(millSection('x',1.96,[[-.038,0],[-.026,.002],[-.024,.018],[.023,.018],[.027,.002],[.038,0],[.038,.076],[-.038,.076]]),brushed,[0,2.300,-5.117]);
  // Flush COP on the rear-facing return, deep display bezel above the plungers.
  car.geometry(panel(.218,.638,.016,.025,.003),brushed,[.823,1.266,-5.170]);
  car.geometry(surround(.183,.106,.011,[[0,0],[0,.004],[.004,.007],[.009,.007],[.013,.002],[.013,0]],3),bronze,[.823,1.492,-5.183],[0,Math.PI,0]);
  car.geometry(panel(.158,.082,.006,.004),dark,[.823,1.492,-5.183]);
  label(car,0,.823,1.492,-5.1855,.145,.074,Math.PI);
  // Braille number sign (dots 3,4,5,6), followed by each distinct digit.
  for(let row=0;row<3;row++) {
    const y=1.335-row*.105, digit=row===0?[1,4]:row===1?[1,2]:[1];
    for(const [cell,dots] of [[0,[3,4,5,6]],[1,digit]] as const) for(const dot of dots) {
      const x=.897-cell*.009-(dot>3?.0028:0), dy=.003-(dot-1)%3*.003;
      car.geometry(vessel([[.00085,0],[.00082,.00045],[.00048,.00075],[0,.0008]],8),dark,[x,y+dy,-5.183],[-Math.PI/2,0,0]);
    }
  }
  const seatKeys=cabinKeys(car,brushed,bronze,dark,label);
  // Tiled car floor: warm stone tiles with visible grout and a bronze threshold
  // strip, so the cabin reads as a finished interior rather than bare ground.
  // A 4x4 field inside the cabin only: the previous loop added its running
  // offset twice, which pushed tiles out of the car and into the lobby floor.
  const tileCols = 4, tileRows = 4, grout = .012, tileY = .003;
  const fieldXSpan = e.carMaxX - e.carMinX - .06, fieldRear=localZ(e.carMinZ)+.06, sillCenter=-5.1255;
  const fieldZ=sillCenter-.042-fieldRear;
  const tileW = (fieldXSpan - grout * (tileCols - 1)) / tileCols, tileD = (fieldZ - grout * (tileRows - 1)) / tileRows;
  const fieldX = localX((e.carMinX + e.carMaxX) / 2), fieldZc = fieldRear + fieldZ/2;
  for (let row = 0; row < tileRows; row++) for (let col = 0; col < tileCols; col++) {
    car.box(fieldX - fieldXSpan / 2 + tileW / 2 + col * (tileW + grout), tileY,
      fieldZc - fieldZ / 2 + tileD / 2 + row * (tileD + grout), tileW, .008, tileD, tile, .0015);
  }
  car.geometry(trackedSill(1.91,true),brushed,[0,0,sillCenter]);
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
    ctx.clearRect(0,0,256,256);
    ctx.fillStyle = '#ffde99'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 29px Arial, sans-serif';
    const arrow = state.phase === 'moving' ? (state.target > state.floor ? '↑' : '↓') : '';
    ctx.fillText(`${state.floor + 1}${arrow}`,128,16);
    ctx.font='bold 27px Arial, sans-serif';
    const cell=(row:number,glyph:string)=>ctx.fillText(glyph,128,row*32+16);
    for(let floor=1;floor<=3;floor++) {
      // Inlaid numerals remain legible under an unlit directional return. The
      // destination changes to amber until arrival; no additional lit surface.
      ctx.fillStyle=state.floor!==state.target&&state.target===floor-1?'#ffe4a1':'#f3f2e9';cell(floor,String(floor));
    }
    ctx.fillStyle='#fff2c7';cell(4,'●');
    // Opposed chevrons and the central door seam: read as OPEN/CLOSE, not
    // previous/next. Keep the signs inside the round press faces on both keys.
    for(const row of [5,6]) {
      const y=row*32+16;ctx.strokeStyle='#e4ece5';ctx.lineWidth=2.8;
      ctx.beginPath();ctx.moveTo(128,y-8);ctx.lineTo(128,y+8);
      for(const side of [-1,1]) {const x=128+side*6, d=side*(row===5?-1:1);
        ctx.moveTo(x+d*3.4,y-5.5);ctx.lineTo(x-d*2.1,y);ctx.lineTo(x+d*3.4,y+5.5);
      } ctx.stroke();
    }
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
      seatKeys(state);updateDisplay(state);
      return changed;
    },
  };
}
