import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { VILLA_SNOOKER } from './villaActivities.js';
import { createVillaSnookerTable } from './villaSnookerModel.js';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import { createVillaFaucet, villaKitchenSpoutGeometry } from './villaFaucet.js';
import { createVillaBedroom } from './villaBedroom.js';
import { createVillaTeaBar } from './villaTeaBar.js';
import { VILLA_AQUARIUM, VILLA_BEDS, VILLA_RELAX_SEATS, registerVillaSeatCollider, villaRelaxSeat } from './villaSeating.js';
import { VILLA_FIREPLACE_WALL } from './villaLivingLayout.js';
import { VILLA_ESTATE_BOUNDS, VILLA_WEST_WALL } from './villaEstateLayout.js';
import { createVillaAquariumLife } from './villaAquarium.js';
import type { VillaTeaState } from './villaTea.js';
import type { VillaWardrobeState } from './villaWardrobe.js';
import { createVillaBathDoorModel, type VillaBathDoorState } from './villaBathDoors.js';
import { villaRoomAt, type VillaCollider } from './villaWorld.js';
import { createVillaFridge } from './villaWardrobe.js';
import { createVillaSuiteFittings } from './villaSuiteFittings.js';
import { VILLA_BEDROOM_LAYOUT } from './villaBedroomLayout.js';
import { board, casting, fieldFrame, loft, rectRing, rectXY, sheet, turn, type FurnitureKit } from './villaFurnitureForms.js';
import { bench, bookcase, boundBook, cabinet, diningChair, joineryTable, lightFixture, teaSetting, vessel } from './villaFurnitureJoinery.js';
import { planter } from './villaFurniturePlanting.js';
import { bedstead, curtain, pillowForm, sofaFrame, towelRoll } from './villaFurnitureTextiles.js';
import { island, kitchenRun, placeSetting, utilityLaundry } from './villaInteriorKitchen.js';
import { fireplace, flameTongue } from './villaInteriorHearth.js';
import { cinemaEquipment, recliner } from './villaInteriorCinema.js';
import { gymEquipment } from './villaInteriorGym.js';
import { bathFittings, spaStorage, treatmentTable } from './villaInteriorBath.js';
import { grillCart, grillHood, parasol, patioTable, poolLounger } from './villaFurnitureTerrace.js';
import { stockroom, vacuumModel, workshop } from './villaInteriorWorkshop.js';
import { bonsai, cueStand, pebble, rugFringe, teaFurniture, teaShelf, topiary, woolRug, writingSet } from './villaFurnitureAccents.js';

export interface VillaFurnishingState {
  evening: boolean;
  fireplace: boolean;
  gaming: boolean;
  /** Expiry uses the same elapsed-seconds clock as update(). */
  fedUntil: number;
  faucetOn?: boolean;
  teaUntil?: number;
  tea?: VillaTeaState;
  wardrobes?: VillaWardrobeState;
  bathDoors?: VillaBathDoorState;
  grillLids?: boolean[];
  roomLights?: Readonly<Record<string, boolean>>;
  nightFactor?: number;
  aquariumOn?: boolean;
}

/** Procedural, scene-owned furnishings. The host disposes geometry/material/maps by traversal. */
export function furnishVilla(scene: THREE.Scene): {
  colliders: VillaCollider[];
  /** True only for changed wardrobe transforms (shadow refresh), not ambient clock ticks. */
  update(time: number, state: VillaFurnishingState): boolean;
} {
  const root = new THREE.Group();
  root.name = 'Villa furnishings · oak, linen & terracotta';
  scene.add(root);
  const colliders: VillaCollider[] = [];
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  let frame = new THREE.Matrix4();
  let seed = 8147;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  function texture(kind: 'oak' | 'linen' | 'rug' | 'art') {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const c = canvas.getContext('2d')!;
    c.fillStyle = kind === 'oak' ? '#b58b60' : kind === 'linen' ? '#e9dfca' : kind === 'rug' ? '#b39b7e' : '#efe4cf'; c.fillRect(0, 0, 256, 256);
    if (kind === 'oak') {
      for (let i = 0; i < 150; i++) {
        const y = random() * 256; c.strokeStyle = `rgba(65,33,13,${0.025 + random() * 0.12})`; c.lineWidth = 0.4 + random();
        c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(65, y + random() * 10, 170, y - random() * 10, 256, y + random() * 4); c.stroke();
      }
    } else if (kind === 'linen' || kind === 'rug') {
      for (let i = 0; i < 256; i += 2) {
        c.strokeStyle = kind === 'rug' ? (i % 4 ? '#ffffff18' : '#49361e18') : (i % 4 ? '#ffffff13' : '#49361e0b');
        c.beginPath(); c.moveTo(i, 0); c.lineTo(i, 256); c.stroke(); c.beginPath(); c.moveTo(0, i); c.lineTo(256, i); c.stroke();
      }
      if (kind === 'rug') {
        c.strokeStyle = '#eee1c4'; c.lineWidth = 5; c.strokeRect(13, 13, 230, 230); c.strokeStyle = '#765a44'; c.lineWidth = 2; c.strokeRect(23, 23, 210, 210);
        for (let x = 44; x < 230; x += 42) for (let y = 44; y < 230; y += 42) { c.beginPath(); c.moveTo(x, y - 13); c.lineTo(x + 10, y); c.lineTo(x, y + 13); c.lineTo(x - 10, y); c.closePath(); c.stroke(); }
      }
    } else if (kind === 'art') {
      c.fillStyle = '#c57653'; c.beginPath(); c.arc(169, 83, 38, 0, Math.PI * 2); c.fill();
      for (const [color, y] of [['#aeb09b', 149], ['#78816a', 181], ['#485951', 215]] as const) {
        c.fillStyle = color; c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(65, y - 65, 166, y + 40, 256, y - 32); c.lineTo(256, 256); c.lineTo(0, 256); c.fill();
      }
    }
    const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
  }
  const mat = (color: THREE.ColorRepresentation, roughness = 0.65, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const oak = mat('#ffffff'); oak.map = texture('oak');
  const walnut = mat('#73503b'); walnut.map = oak.map;
  const linen = mat('#ffffff', 0.93); linen.map = texture('linen');
  const sage = mat('#889583', 0.91), terra = mat('#bb7358', 0.86), cream = mat('#ede6d4', 0.7);
  const brass = mat('#b59962', 0.3, 0.7), black = mat('#242828', 0.45, 0.35), steel = mat('#adb5b4', 0.25, 0.78);
  const white = mat('#f5f0e5', 0.24), stone = mat('#bdb5a6', 0.86), dark = mat('#302f2b', 0.9);
  const leaf = mat('#41684b', 0.87), leafLight = mat('#7d9854', 0.85), soil = mat('#453528'), blue = mat('#527a89'), coral = mat('#e1aa83');
  // A leaf is a thin, folded lamina. Back-face lighting follows its real crease
  // without paying for a second closed plastic-looking leaf shell.
  leaf.side = leafLight.side = THREE.DoubleSide;
  const rugMat = mat('#ffffff', 1); rugMat.map = texture('rug');
  const artMat = mat('#ffffff'); artMat.map = texture('art');
  const bookMats = [terra, sage, blue, cream, walnut, coral];
  const lampGlow = mat('#ffedc5'); lampGlow.emissive.set('#ffc679'); lampGlow.emissiveIntensity = 0.35;
  const roomGlows = new Map<string, THREE.MeshStandardMaterial>();
  // One source of truth for which room a lamp belongs to, so a resized plan
  // cannot leave a fixture switching the wrong light.
  const roomAt = (p: THREE.Vector3) => villaRoomAt(p as { x: number; y: number; z: number }).id;
  function at(x: number, y: number, z: number, yaw: number, build: () => void) {
    const saved = frame; frame = frame.clone().multiply(new THREE.Matrix4().makeTranslation(x, y, z)).multiply(new THREE.Matrix4().makeRotationY(yaw)); build(); frame = saved;
  }
  function put(geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
    const transform = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
    if (material === lampGlow) {
      const room = roomAt(new THREE.Vector3(x, y, z).applyMatrix4(frame));
      if (!roomGlows.has(room)) {
        const glow = roomGlows.size ? lampGlow.clone() : lampGlow;
        glow.name = `furnishing-lamp/${room}`; roomGlows.set(room, glow);
      }
      material = roomGlows.get(room)!;
    }
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose(); g.applyMatrix4(frame.clone().multiply(transform));
    for (const key of Object.keys(g.attributes)) if (key !== 'position' && key !== 'normal' && key !== 'uv') g.deleteAttribute(key);
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    const batch = batches.get(material); if (batch) batch.push(g); else batches.set(material, [g]);
  }
  function box(x: number, y: number, z: number, w: number, h: number, d: number, material: THREE.Material, r = 0.035, yaw = 0) {
    put(r > 0 ? new RoundedBoxGeometry(w, h, d, r >= 0.08 ? 2 : 1, Math.min(r, w / 3, h / 3, d / 3)) : new THREE.BoxGeometry(w, h, d), material, x, y, z, 0, yaw);
  }
  function cyl(x: number, y: number, z: number, rt: number, rb: number, h: number, material: THREE.Material, rx = 0, rz = 0) {
    put(new THREE.CylinderGeometry(rt, rb, h, 16), material, x, y, z, rx, 0, rz);
  }
  function hit(x: number, y: number, z: number, w: number, h: number, d: number, seatId?: string) {
    const b = new THREE.Box3(new THREE.Vector3(x - w / 2, y, z - d / 2), new THREE.Vector3(x + w / 2, y + h, z + d / 2)).applyMatrix4(frame);
    const collider = { minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z, minY: b.min.y, maxY: b.max.y };
    colliders.push(collider); if (seatId) registerVillaSeatCollider(collider, seatId);
  }
  const kit: FurnitureKit = { put, box, at, hit, m: { oak, walnut, linen, sage, terra, cream, brass, black, steel, white, stone, dark, leaf, leafLight, soil, blue, coral, lampGlow } };
  function table(w: number, d: number, h = .76, material = oak) { joineryTable(kit, w, d, h, material); hit(0, 0, 0, w, h, d); }
  function chair(material = sage, seatId?: string) {
    diningChair(kit, material); hit(0, 0, 0, .65, 1.1, .68, seatId);
    if (seatId) seatMarker(seatId, .65, .68);
  }
  function bedroomBench(w: number, d: number, id: string) {
    bench(kit, w, d, .46, linen); hit(0, 0, 0, w, .54, d, id); seatMarker(id, w, d);
  }
  function seatMarker(id: string, width: number, depth: number): void {
    const definition = villaRelaxSeat(id)!;
    const marker = new THREE.Object3D(); marker.name = `relax-seat/${id}`;
    marker.position.set(definition.seat.x, definition.seat.y, definition.seat.z);
    marker.rotation.y = definition.yaw;
    const origin = new THREE.Vector3().applyMatrix4(frame);
    marker.userData = { ...definition, modelOrigin: { x: origin.x, y: origin.y, z: origin.z }, width, depth };
    root.add(marker); // Metadata only: furniture remains in its existing material batches.
  }
  function sofa(w = 3.4, material = linen, chaise = false, seatId?: string, cushions?: number) {
    const style = seatId === 'sofa-roof' ? 'terrace' : seatId?.startsWith('sofa-library-') ? 'reading' : seatId?.includes('cinema') ? 'cinema' : 'tailored';
    sofaFrame(kit, w, material, chaise, cushions ?? Math.max(1, Math.round(w / 1.1)), style);
    hit(0, 0, 0, w, 1.26, 1.3, seatId);
    if (chaise) hit(-w / 2 + .63, 0, -1.05, 1.24, .7, 1.4, seatId);
    if (seatId) seatMarker(seatId, w, 1.3);
  }
  function plant(x: number, y: number, z: number, s = 1, flowers = false, outdoor = false) {
    at(x, y, z, 0, () => planter(kit, s, flowers, random, outdoor));
  }
  function books(x: number, y: number, z: number, count = 6) {
    let edge = x - .035;
    for (let i = 0; i < count; i++) {
      const w = .053 + random() * .040, h = .231 + random() * .146, d = .182 + random() * .068;
      const lean = i === count - 1 && count > 3 ? -.11 : 0;
      boundBook(kit, edge + w / 2 + (lean ? .018 : 0), y, z + .009 * Math.sin(i * 2.4), w, h, d, bookMats[(i + count) % bookMats.length], false, lean);
      edge += w + .006;
    }
  }
  function rug(x: number, y: number, z: number, w: number, d: number, h: number) {
    put(woolRug(w, d - .112, h), rugMat, x, y, z);
    put(rugFringe(w, d, h), cream, x, y, z);
  }
  function shelf(w = 2.1) { bookcase(kit, w, books); hit(0, 0, 0, w + .1, 2.34, .43); }
  function lamp(tall = false) { lightFixture(kit, tall); }
  function artwork(x: number, y: number, z: number, w: number, h: number, yaw = 0) {
    at(x, y, z, yaw, () => {
      put(fieldFrame(w, h, .070, .044, true), walnut, 0, 0, 0);
      box(0, 0, -.012, w - .05, h - .05, .025, cream, 0);
      put(new THREE.PlaneGeometry(w - .21, h - .21), artMat, 0, 0, .002);
    });
  }
  function tea(x: number, y: number, z: number) { teaSetting(kit, x, y, z); }
  function bed(definition: typeof VILLA_BEDS[number]) {
    const { origin, yaw, width: w, id } = definition;
    at(origin.x, origin.y, origin.z, yaw, () => {
      bedstead(kit, w, definition.pillowWidth);
      const pillow = new THREE.Object3D(); pillow.name = `${id}/pillow`;
      pillow.position.set(definition.pillow.x, definition.pillow.y, definition.pillow.z);
      pillow.userData = { count: 1, centered: true, width: definition.pillowWidth }; root.add(pillow);
      hit(0, 0, 0, w + 0.15, 0.98, 3.8, id); seatMarker(id, w + 0.15, 3.8);
      for (const side of [-1, 1]) at(side * (w / 2 + 0.55), 0, 1.27, 0, () => {
        at(0, 0, 0, Math.PI, () => cabinet(kit, .72, .65, .60, 1, cream, oak));
        at(0, .60, 0, 0, () => lamp()); hit(0, 0, 0, .72, .6, .65);
      });
    });
  }

  // Living room. The chaise is on the west, preserving the route to the aquarium.
  at(-8, 0, 5.8, 0, () => sofa(4.2, linen, true, 'sofa-living')); rug(-8, 0.018, 3.9, 6.1, 4.15, 0.028);
  at(-7.6, 0, 3.55, 0, () => { table(2.2, 1.25, 0.44, walnut); boundBook(kit, -.45, .44, .06, .065, .54, .39, sage, true); at(-.43, .505, .025, .09, () => boundBook(kit, 0, 0, 0, .047, .46, .34, terra, true)); tea(.6, .44, .13); plant(.05, .44, -.25, 0.46, true); });
  at(-10.8, 0, 6.8, 0, () => lamp(true)); plant(-3, 0, 7.9, 1.45);
  // The live lawn cat occasionally visits; no duplicate static animal on the sofa.
  at(VILLA_FIREPLACE_WALL.x, 0, 0, 0, () => fireplace(kit, VILLA_FIREPLACE_WALL.backZ));
  hit(VILLA_FIREPLACE_WALL.x, 0, VILLA_FIREPLACE_WALL.centerZ, 2.5, 3.4, VILLA_FIREPLACE_WALL.depth);
  artwork(-10, 2.24, 0.15, 2.25, 1.08); hit(-10, 0, 0.35, 2.88, 1.61, 0.9);
  const flameMat = new THREE.MeshBasicMaterial({ color: '#ffc36a', transparent: true, opacity: 0.78, depthWrite: false, blending: THREE.AdditiveBlending });
  const flames: THREE.Mesh[] = [];
  for (let i = 0; i < 7; i++) { const f = new THREE.Mesh(flameTongue(i), flameMat); f.position.set(-10.7 + i * 0.23, 0.66, 0.51 + (i % 2) * 0.08); f.scale.set(0.115, 0.31, 0.075); root.add(f); flames.push(f); }
  const fireLight = new THREE.PointLight('#ffae62', 2.5, 6, 2); fireLight.position.set(-10, 1, 0.95); root.add(fireLight);

  // Aquarium: real transparent panels, fine substrate and individually animated fish.
  const glass = new THREE.MeshStandardMaterial({ color: '#bfedf0', roughness: 0.09, metalness: 0.12, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide });
  const water = new THREE.MeshStandardMaterial({ color: '#56b9be', roughness: 0.15, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
  at(VILLA_AQUARIUM.x, 0, VILLA_AQUARIUM.z, 0, () => {
    // Rear flush with the shared wall datum; front is recessed so pulls remain inside the live footprint.
    cabinet(kit, 3.40, 1.025, .65, 3, oak, walnut);
    put(board(3.43, 1.03, .09, .044, .022), black, 0, .69, 0);
    put(casting(rectXY(3.43, 1.03, .043), .067, [rectXY(3.285, .90, .036)]), black, 0, 2.135, 0, -Math.PI / 2);
    put(loft([rectRing(3.23, .89, .063, .734), rectRing(3.24, .891, .061, .780), rectRing(3.18, .831, .092, .809)]), stone, 0, 0, 0);
    for (const x of [-1.66, 1.66]) box(x, 1.425, 0, 0.025, 1.4, 0.98, glass, 0);
    for (const z of [-0.48, 0.48]) box(0, 1.425, z, 3.34, 1.4, 0.015, glass, 0);
    box(0, 2.035, 0, 3.28, 0.012, 0.94, water, 0);
    for (let i = 0; i < 48; i++) put(pebble(.045 + random() * .083, .038, .058, i), i % 2 ? cream : stone, (random() - .5) * 3.15, .823, (random() - .5) * .80, 0, i * 2.4);
    for (const x of [-1.28, 0.5, 1.22]) {
      put(pebble(.372, .279, .337, x * 7), stone, x, .914, -.112, 0, x);
      for (let i = 0; i < 7; i++) {
        const px = x + (i - 3) * .052, h = .22 + random() * .43, angle = i * 2.4;
        const blade = sheet([-1, 0, 1], [-1, -.6, -.2, .2, .6, 1], (u, v, under) => {
          const t = (v + 1) / 2;
          return [u * (.002 + .03 * Math.sin(t * Math.PI)) + .039 * Math.sin(t * 6 + i) * t, h * t, .037 * t * t + .011 * Math.cos(t * 4) - (under ? .002 : 0)];
        });
        put(blade, i % 2 ? leafLight : leaf, px, .80, -.20, 0, angle);
      }
    }
    hit(0, 0, 0, VILLA_AQUARIUM.width, 2.17, VILLA_AQUARIUM.depth);
  });
  const aquariumLight = new THREE.PointLight('#81ded9', 1.6, 4.5, 2); aquariumLight.name = 'aquarium/light'; aquariumLight.position.set(VILLA_AQUARIUM.x, 1.8, VILLA_AQUARIUM.z); root.add(aquariumLight);
  const aquariumLife = createVillaAquariumLife(root);

  // Fitted kitchen: low splashback stays below the two north windows. The
  // cooker/hood and upper cabinetry attach only to the solid central pier.
  const tile = mat('#d5ded2', 0.25), ovenGlass = mat('#142023', 0.16, 0.3);
  ovenGlass.transparent = true; ovenGlass.opacity = .32; ovenGlass.depthWrite = false;
  const kitchenLed = mat('#fff1cd', 0.35); kitchenLed.emissive.set('#ffd497'); kitchenLed.emissiveIntensity = 0.75;
  const fridge = createVillaFridge(root); colliders.push(...fridge.colliders);
  kitchenRun(kit, tile, ovenGlass, kitchenLed);
  put(villaKitchenSpoutGeometry(), steel, -5.67, .99, -8.77);
  const faucet = createVillaFaucet(root);
  const teaBar = createVillaTeaBar(root); colliders.push(...teaBar.colliders);
  plant(-10.85, 0.99, -8.45, 0.43);
  root.userData.kitchen = { components: ['fitted sage cabinetry', 'stone counters', 'four-zone hob', 'wall-mounted extractor', 'built-in oven', 'microwave', 'fridge-freezer', 'dishwasher', 'recessed sink', 'swan-neck tap', 'ceramic backsplash', 'warm under-cabinet LEDs', 'pot', 'kettle', 'cutting board', 'knife block', 'island', 'two bar stools', 'dining place settings'], extractorCenter: [-8.11, 2.04, -8.52], solidWallSpan: [-9, -6.4] };
  at(-5.2, 0, -5.6, 0, () => island(kit));
  for (const [i, x] of [-5.85, -4.55].entries()) at(x, 0, -4.48, 0, () => {
    diningChair(kit, linen, true);
    hit(0, 0, 0, 0.54, 0.8, 0.51, `stool-kitchen-${i + 1}`); seatMarker(`stool-kitchen-${i + 1}`, 0.54, 0.51);
  });
  at(-8.5, 0, -2.8, 0, () => {
    table(2.8, 1.35); plant(0, .76, 0, .42, true);
    for (const x of [-0.83, 0.83]) for (const z of [-1.08, 1.08]) {
      at(x, 0, z, z < 0 ? Math.PI : 0, () => chair(sage, `chair-dining-${(x < 0 ? 0 : 2) + (z < 0 ? 1 : 2)}`));
      const pz = z < 0 ? -0.37 : 0.37;
      at(x, .76, pz, z < 0 ? Math.PI : 0, () => placeSetting(kit));
    }
  });
  for (const x of [-8.9, -7.95, -5.2]) at(x, 0, -3.2, 0, () => {
    cyl(0, 3.00, 0, .009, .009, 1.01, black);
    put(turn([[.237, 2.255], [.295, 2.250], [.303, 2.26], [.298, 2.28], [.235, 2.317], [.145, 2.394], [.081, 2.48], [.049, 2.512], [.034, 2.557], [.012, 2.56]], 24), brass, 0, 0, 0);
    put(turn([[.253, 2.26], [.214, 2.29], [.093, 2.395], [.051, 2.392], [.039, 2.352], [.023, 2.329], [0, 2.326]], 20), lampGlow, 0, 0, 0);
  });

  // Detailed PC, cockpit and glazed collections are scene-owned villaGaming models.

  // Snooker: six apertures pierce cloth AND slate, not painted-on pockets.
  const snookerWalnut = mat('#382218', 0.42); snookerWalnut.map = oak.map;
  const snookerTable = createVillaSnookerTable(root); colliders.push(...snookerTable.colliders);
  // Cue rack relocated onto the cinema's west wall after the gym/snooker divider
  // came down: still west of the play line and outside the cue sweep.
  cueStand(kit, snookerWalnut);
  hit(16.8, 0, -12, 0.25, 1.65, 1.08);
  root.userData.snooker = { ...VILLA_SNOOKER, ballCount: 22, redCount: 15, colorCount: 6, whiteCount: 1, pocketCount: 6, baulkOffset: 0.737, dRadius: 0.292,
    // Derived from the same table constants the model builds from, so a moved
    // or resized table cannot leave a stale hand-copied collider behind.
    collider: { minX: VILLA_SNOOKER.center.x - VILLA_SNOOKER.width / 2, maxX: VILLA_SNOOKER.center.x + VILLA_SNOOKER.width / 2,
      minZ: VILLA_SNOOKER.center.z - VILLA_SNOOKER.length / 2, maxZ: VILLA_SNOOKER.center.z + VILLA_SNOOKER.length / 2,
      minY: VILLA_SNOOKER.center.y, maxY: VILLA_SNOOKER.center.y + 0.92 },
    cueRack: { x: 16.8, z: -12, cueCount: 5 } };

  // First floor bedrooms and library.
  const masterSuite = VILLA_BEDROOM_LAYOUT.master, guestSuite = VILLA_BEDROOM_LAYOUT.guest;
  bed(VILLA_BEDS[0]); rug(masterSuite.bed.x, 3.617, 3, 6.8, 5.7, .026);
  // ---- The rooms the doubled plan added ----
  // Ground-floor tea room (was the study): a low ceremonial tea table with a
  // full service, floor cushions, a tea-ware shelf and a bonsai on its stand.
  at(-18.6, 0, -13.6, 0, () => {
    at(0, 0, -2.2, 0, () => {
      teaFurniture(kit);
      hit(0, 0, 0, 1.95, 0.62, 1.3);
    });
    for (const [i, [x, z, yaw]] of ([[-1.75, -2.2, -Math.PI / 2], [1.75, -2.7, Math.PI / 2], [0.1, -0.35, 0]] as const).entries()) {
      const id = `stool-tea-${i + 1}`;
      at(x, 0, z, yaw, () => { put(pillowForm(.74, .74, .244), terra, 0, .123, 0); hit(0, 0, 0, .74, .235, .74, id); seatMarker(id, .74, .74); });
    }
    // Tea-ware faces west from the east partition's solid south return, never
    // across its door or the west picture window.
    at(5.27, 0, 2.85, Math.PI, () => {
      teaShelf(kit);
      hit(0, 0, 0, 0.4, 2.1, 3.05);
    });
    at(-2.6, 0, -4.05, 0, () => bonsai(kit));
    at(2.8, 0, -4.1, 0, () => lamp(true));
  });
  rug(-18.6, 0.017, -15.1, 6.2, 4.5, 0.028);
  plant(-14.2, 0, -16.6, 1.35); plant(-22.8, 0, -10.4, 1.2);
  // Ground-floor laundry and utility room: a matched front-loader washer and
  // heat-pump dryer under a shelf run, plus a folding table and basket.
  at(-7.5, 0, -13.6, 0, () => {
    utilityLaundry(kit, ovenGlass);
    at(1.2, 0, -3.6, 0, () => {
      table(3.4, .72, .9, oak);
      put(board(2.61, .51, .042, .085, .008), steel, 0, .921, 0);
      put(towelRoll(.38, .065), linen, -.76, 1.008, .014, 0, Math.PI / 2);
      put(towelRoll(.34, .058), sage, -.76, 1.003, -.109, 0, Math.PI / 2);
    });
  });
  // The upstairs hall runner is on 2F, behind the stair/lift core; the robot
  // stays on 1F. Neither decoration crosses a shaft or an entrance.
  rug(1.1, 3.622, -12.4, 3.4, 8.6, 0.028);
  // Original procedural design informed by the Saros 20's ~8cm low profile and
  // flush StarSight sensors, not an outdated tall spinning LiDAR tower.
  // Reference: https://global.roborock.com/pages/roborock-saros-20
  const vacuum = new THREE.Group(); vacuum.name = 'robot-vacuum'; root.add(vacuum);
  const vacuumBrush = new THREE.Group(); vacuumBrush.position.set(.145, .007, -.09); vacuum.add(vacuumBrush);
  {
    const shell = villaMaterial('#e8e6e1', .38), vacTrim = villaMaterial('#2a2e31', .5), lens = villaMaterial('#1b2124', .2, .3);
    vacuumModel(kit, vacuum, vacuumBrush, shell, vacTrim, lens);
    hit(4.45, 0, -7.36, .45, .51, .34);
  }
  at(-11.4, 0, -9.9, 0, () => lamp(true));
  // Ground-floor gym: weight rack, cable crossover, dumbbell tree, kettlebells,
  // a treadmill, one bench and a neat row of yoga mats, under a wall mirror.
  at(11.3, 0, -13.6, 0, () => {
    gymEquipment(kit);
  });
  // The east lounge (起居厅) is deliberately left bare for now: an unfurnished
  // hall the family can arrange later. Only the cinema's plant keeps its spot.
  plant(26.4, 0, -14.6, 1.3);
  // Upstairs study: writing desk under the north light, books on both returns.
  at(12.5, 3.6, -13.6, 0, () => {
    at(0, 0, -3.1, 0, () => { table(2.6, 1, 0.75, oak); at(-.43, .75, .035, -.14, () => writingSet(kit)); });
    at(0, 0, -1.95, 0, () => chair(sage));
    for (const x of [-3.1, 3.1]) at(x, 0, -3.3, 0, () => shelf(1.5));
  });
  rug(12.5, 3.617, -11.4, 4.8, 3.2, 0.028);
  // Fitted suite cabinetry, real double basins and shower: authored around the
  // doors, rather than solid placeholder boxes spanning glazing and passages.
  const suite = createVillaSuiteFittings(root); colliders.push(...suite.colliders);
  plant(-14.1, 3.6, -7.7, 1.1);
  // The lounge's old indoor fountain went with the rest of the east lounge's
  // furniture when that hall was cleared for now.
  // Ground-floor home cinema in the north-east band: a 5.2 m screen over a real
  // AV rack, tower L/R + surround speakers with acoustic panels, and a tiered
  // leather row — a three-seat sofa, a double loveseat and a single recliner.
  const avGlow = mat('#8fb8c9', .3); avGlow.emissive.set('#6fb3c9'); avGlow.emissiveIntensity = .8;
  const acoustic = mat('#3a3f3c', .95), cinemaLeather = mat('#976553', .48);
  at(22.6, 0, -13.6, 0, () => {
    cinemaEquipment(kit, acoustic, avGlow);
    // Tiered leather seating, all three seats registered as sittable.
    at(0, 0, 0.7, 0, () => sofa(2.6, cinemaLeather, false, 'sofa-cinema-three', 3));
    at(3.3, 0, 1.0, 0.55, () => sofa(1.9, cinemaLeather, false, 'sofa-cinema-double', 2));
    at(-3.3, 0, 1.0, -0.55, () => {
      recliner(kit, cinemaLeather);
      hit(0, 0, 0, 1.3, 1.35, 1.1, 'chair-cinema-single');
      seatMarker('chair-cinema-single', 1.06, 1.0);
    });
    rug(0, 0.02, 1.2, 9.7, 3.4, 0.03);
  });
  at(26.6, 0, -10.2, 0, () => lamp(true));
  // Upstairs massage room (was the play & hobby room — its mattress is gone):
  // a padded massage table with a face cradle, a warm-towel shelf, oil and
  // stone bowls, soft lighting and a bench for robes.
  at(22.6, 3.6, -13.6, 0, () => {
    at(0, 0, -0.6, 0, () => {
      treatmentTable(kit);
      hit(0, 0, -.06, .94, 1.08, 2.46);
    });
    at(1.45, 0, -.5, 0, () => {
      table(.62, .44, .7, walnut);
      for (let i = 0; i < 3; i++) put(pebble(.099, .059, .104, i), stone, -.17 + i * .15, .73, .08, 0, i * 2.4);
      for (const x of [-.16, .12]) { put(turn([[0, 0], [.033, 0], [.039, .008], [.040, .108], [.035, .136], [.018, .148], [.016, .173], [0, .173]], 14), brass, x, .700, -.1); put(turn([[0, 0], [.019, 0], [.020, .037], [.012, .041], [0, .041]], 10), dark, x, .869, -.1); }
    });
    at(-4.1, 0, -3.8, 0, () => {
      spaStorage(kit);
      hit(0, 0, 0, 1.8, 1.9, 0.5);
    });
    at(3.9, 0, -3.9, 0, () => { bench(kit, 1.36, .55, .548, cream); hit(0, 0, 0, 1.4, .65, .6); });
    at(4.1, 0, 1.9, 0, () => lamp()); plant(-4.3, 0, 1.8, 1.25); plant(4.3, 0, 3.9, 1.1);
    at(-2.1, 0, 2.6, .3, () => {
      joineryTable(kit, .54, .54, .47, walnut);
      put(vessel(.231, .159, .52, 18), stone, 0, .47, 0);
      put(turn([[.180, 0], [.180, .003], [0, .003]], 18), water, 0, .571, 0);
      hit(0, 0, 0, .6, .65, .6);
    });
  });
  rug(22.6, 3.617, -14, 4.4, 4.9, 0.028);
  at(19.4, 3.6, -10.4, 0, () => lamp(true)); plant(26.8, 3.6, -16.6, 1.3);
  // Upstairs guest suite: sofa, low table and a reading corner.
  at(24.6, 3.6, 6.9, 0, () => sofa(3.2, linen, false, 'sofa-east-suite'));
  at(24.6, 3.6, 4.4, 0, () => { table(1.5, 0.9, 0.42, walnut); tea(.34, .42, 0); plant(-.35, .42, 0, 0.42, true); });
  // One coherent lounge rug, not two overlapping coplanar rugs.
  rug(23, 3.617, 5.6, 9.2, 5.6, 0.028);
  at(27.2, 3.6, -4.6, 0, () => lamp(true)); plant(18.6, 3.6, -16.6, 1.45);
  const bedroom = createVillaBedroom(root); colliders.push(...bedroom.colliders);
  const bathDoorModel = createVillaBathDoorModel(root); colliders.push(...bathDoorModel.colliders);
  // Master suite: sleeping/vanity zone west, fitted storage north-east and a
  // real sitting group east. The entry and balcony routes stay outside the group.
  at(masterSuite.sofa.x, 3.6, masterSuite.sofa.z, masterSuite.sofa.yaw, () => sofa(masterSuite.sofa.width, sage, false, 'sofa-master', 2));
  at(masterSuite.chair.x, 3.6, masterSuite.chair.z, masterSuite.chair.yaw, () => chair(linen, 'chair-master-reading'));
  at(masterSuite.coffee.x, 3.6, masterSuite.coffee.z, 0, () => { table(masterSuite.coffee.width, masterSuite.coffee.depth, .43, walnut); tea(0, .43, -.3); books(-.25, .43, .3, 3); });
  rug(-10.7, 3.617, 6.1, 5.4, 4.1, .026);
  at(masterSuite.bench.x, 3.6, masterSuite.bench.z, Math.PI, () => bedroomBench(masterSuite.bench.width, masterSuite.bench.depth, 'bench-master'));
  at(-7.5, 3.6, 7.1, 0, () => lamp(true)); plant(-14.2, 3.6, 7, 1.3);
  // Low storage divider gives the large room a human-scale sleeping zone,
  // with clear passages at both ends. It is NOT a new enclosing room wall.
  at(-13.7, 3.6, 3.6, Math.PI / 2, () => {
    at(0, 0, 0, Math.PI, () => cabinet(kit, 2.8, .40, .904, 3, cream, stone));
    books(-.7, .905, -.02, 6); plant(.95, .905, 0, .46);
    hit(0, 0, 0, 2.84, 1.22, .44);
  });
  artwork(-4.25, 5.65, 5.1, 2.1, 1.2, -Math.PI / 2);
  // Soft gathered linen curtains flank the glazing without blocking the balcony door.
  for (const x of [-11.05, -8.97, -5.72, -2.8]) {
    put(curtain(.32, 2.77, 4), linen, x, 5.13, 8.72);
  }
  // Guest bed is against the south-west solid wall, far from the gallery door
  // at x=-4,z[-16.5,-13.5] AND clear of the dressing-room opening x[-19,-15].
  bed(VILLA_BEDS[1]); rug(guestSuite.bed.x, 3.617, -11.9, 5.6, 5.3, .028);
  at(guestSuite.desk.x, 3.6, guestSuite.desk.z, 0, () => {
    table(guestSuite.desk.width, guestSuite.desk.depth); books(-1.2, .76, -.06, 5);
    at(1.13, .76, -.10, 0, () => lamp()); at(0, .76, .09, .07, () => writingSet(kit, true));
    boundBook(kit, .21, .76, -.20, .024, .269, .158, walnut, true);
  });
  at(guestSuite.chair.x, 3.6, guestSuite.chair.z, guestSuite.chair.yaw, () => chair(sage, 'chair-guest'));
  at(guestSuite.sofa.x, 3.6, guestSuite.sofa.z, guestSuite.sofa.yaw, () => sofa(guestSuite.sofa.width, linen, false, 'sofa-guest-lounge', 3));
  at(guestSuite.coffee.x, 3.6, guestSuite.coffee.z, 0, () => { table(guestSuite.coffee.width, guestSuite.coffee.depth, .43, walnut); tea(.45, .43, 0); books(-.55, .43, 0, 4); });
  rug(-10.5, 3.617, -11.35, 5.4, 3.7, .028);
  at(-6.1, 3.6, -9.4, Math.PI, () => shelf(2.5));
  at(guestSuite.bench.x, 3.6, guestSuite.bench.z, 0, () => bedroomBench(guestSuite.bench.width, guestSuite.bench.depth, 'bench-guest-window'));
  artwork(-10.5, 5.65, -9.18, 2.7, 1.15, Math.PI);
  plant(-23.35, 3.6, -17.1, 1.25); at(-12.8, 3.6, -9.8, 0, () => lamp(true));
  // Narrow gathered panels frame, rather than cover, the north picture window.
  for (const x of [-21.9, -14.5]) put(curtain(.43, 2.77, 5), linen, x, 5.13, -17.96);
  // Reading hall (阅读厅): every element of the old family room moved here after
  // its walls came down. North half is the library, south half the lounge.
  // Keep the massage-room doorway (x20..23 at z=-9) and both sides of the
  // bathroom's east door completely free; all shelves now face the reader.
  at(18.45, 3.6, -8.62, 0, () => shelf(1.9)); at(25.45, 3.6, -8.62, 0, () => shelf(2.8));
  at(27.7, 3.6, 1.8, -Math.PI / 2, () => shelf(2.2));
  at(17.5, 3.6, 1.95, Math.PI / 2, () => shelf(2.2));
  at(20.8, 3.6, -4.6, 0, () => { table(1.75, 0.8, 0.46); tea(.28, .46, 0); books(-.4, .46, 0, 3); }); rug(21, 3.617, -4.6, 6.4, 3, 0.028);
  at(18.6, 3.6, -4.6, -Math.PI / 2, () => sofa(1.4, linen, false, 'sofa-library-west'));
  at(23.1, 3.6, -4.6, Math.PI / 2, () => sofa(1.5, terra, false, 'sofa-library-east'));
  plant(18.2, 3.6, -7.5, 1.55); at(18.9, 3.6, -6.9, 0, () => lamp(true)); plant(27.3, 3.6, -7.4, 1.4);
  // South lounge corner: the original guest-suite sofa plus the moved bay sofa.
  at(20.2, 3.6, 6.4, 0.5, () => sofa(1.3, linen, false, 'sofa-library-bay'));
  at(20.4, 3.6, 3.2, 0, () => { table(1.15, 0.75, 0.46); tea(.3, .46, 0); books(-.36, .46, 0, 3); });
  plant(18, 3.6, 8.1, 1.4); at(19.2, 3.6, 1.6, 0, () => lamp(true));

  // Bathroom: the tub grew 50 % in both plan dimensions and a walk-in shower
  // with frosted panels fills the north-east corner.
  const frosted = mat('#cfe4e8', .12); frosted.transparent = true; frosted.opacity = .32; frosted.roughness = .3; frosted.depthWrite = false;
  bathFittings(kit, water, frosted, ovenGlass);

  // Roof terrace leaves the stair opening completely vacant.
  at(-7, 7.2, 5.5, 0, () => sofa(4.15, sage, true, 'sofa-roof')); at(-7, 7.2, 3.4, 0, () => { table(1.85, 1.05, 0.43); tea(.5, .43, 0); plant(-.3, .43, 0, 0.45, true); }); rug(-7, 7.217, 4.3, 5.8, 4.4, 0.028);
  at(-6, 7.2, -4.5, 0, () => {
    patioTable(kit); hit(0, 0, 0, 1.76, .83, 1.76); plant(0, .821, 0, .42, true);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; at(Math.sin(a) * 1.3, 0, Math.cos(a) * 1.3, a, () => chair(sage, `chair-roof-${i + 1}`)); }
  });
  // Three BBQ grills beside the east roof lounge, each with a hinged lid that
  // opens and closes (grill hotspots toggle them individually).
  const grillLids: THREE.Group[] = [];
  const buildGrill = (x: number, z: number) => {
    at(x, 7.2, z, 0, () => grillCart(kit));
    // Lid pivot sits on the hinge line at the grill's back edge.
    const lidPivot = new THREE.Group(); lidPivot.name = `roof-grill-lid-${grillLids.length + 1}`;
    lidPivot.position.set(x, 8.13, z - 0.42);
    lidPivot.userData = { animated: true, progress: 0 };
    root.add(lidPivot);
    const lid = new VillaModelBuilder(lidPivot, 'grill-lid');
    grillHood(lid, kit);
    lid.finish();
    grillLids.push(lidPivot);
  };
  buildGrill(10.4, -6.4); buildGrill(13.4, -6.4); buildGrill(11.9, -9.2);
  // East roof lounge: the table sits against the south parapet so the walking
  // route from the pavilion to the lounge stays open.
  at(14.4, 7.2, 4.3, 0, () => {
    table(1.5, 0.95, 0.43); tea(.4, .43, 0); tea(-.4, .43, 0); plant(0, .43, .18, 0.38, true);
    at(0, 0, -1.45, 0, () => chair(sage, 'chair-roof-east-1'));
    at(0, 0, 1.45, Math.PI, () => chair(sage, 'chair-roof-east-2'));
  });
  rug(14, 7.217, 7.4, 3.4, 2.8, 0.028);
  // The botanical perimeter pots in villaGarden replace the old interior pot
  // row, avoiding doubled pots at the south parapet and beside the grills.

  // Workbench and its tool board, in the garage's north strip beside the
  // estate's rear bench: a workshop bench belongs in the workshop, never on the
  // snooker lounge's wall. The hollow, opening-door sedan lives in villaVehicle.
  at(34.6, 0, -11.24, 0, () => workshop(kit));
  // Storage belongs in the garage's northern service strip, not the deliberately
  // empty lounge. This span is between, not across, the workshop benches.
  at(40.2, 0, -11.15, 0, () => stockroom(kit));

  // Both loungers face -Z across the widened west pool from its dry south deck.
  for (const id of ['lounger-west', 'lounger-east']) {
    const seat = villaRelaxSeat(id)!;
    at(seat.seat.x, 0, seat.origin.z, seat.yaw, () => {
      poolLounger(kit); hit(0, 0, 0, .97, 1, 2.7, id);
      seatMarker(id, 0.97, 2.7);
    });
  }
  at(-18.45, 0, 11.5, 0, () => {
    parasol(kit);
    hit(0, 0, 0, 0.96, 0.13, 0.96); hit(0, 0.13, 0, 0.074, 2.5, 0.074);
  });
  for (const x of [-3, 3]) { plant(x, 0, 10.3, 1.25, true, true); hit(x, 0, 10.3, 0.6, 0.48, 0.6); }
  // The same ten perimeter tree sites are now planted by villaGarden.
  // West pool hedge: a row fully outside the facade, never straddling the west
  // glazing, which used to leave green orbs growing through the window frames.
  for (let i = 0; i < 28; i++) {
    const x = i < 14 ? VILLA_WEST_WALL.outer - .55 : VILLA_ESTATE_BOUNDS.maxX - 1.15;
    at(x, 0, -12 + i % 14 * 2.45, 0, () => topiary(kit, i < 14 ? .50 : .72, 1.03 + .19 * random(), i, i % 3 ? leaf : leafLight));
  }
  for (const [x, z] of [[-9, 11], [-10.5, 16], [7, 11], [8.5, 18], [-22.6, 11.5]]) { plant(x, 0, z, 1, true, true); plant(x + 0.8, 0, z + 0.3, 0.65, true, true); }
  hit(-22.6, 0, 11.5, .5, .39, .5); hit(-21.8, 0, 11.8, .325, .2535, .325);
  // These two existing pots share the pets' lawn: preserve their solid footprints.
  hit(-10.5, 0, 16, .5, .39, .5); hit(-9.7, 0, 16.3, .325, .2535, .325);

  // Static geometry is merged per material, not per chair/slat/book/leaf.
  let staticVertices = 0;
  for (const [material, parts] of batches) {
    const geometry = mergeGeometries(parts, false); for (const part of parts) part.dispose();
    if (!geometry) continue;
    geometry.userData.villaRigidBatch = true;
    geometry.computeBoundingSphere(); staticVertices += geometry.getAttribute('position').count;
    const mesh = new THREE.Mesh(geometry, material); mesh.name = 'Batched villa details'; mesh.castShadow = !material.transparent; mesh.receiveShadow = !material.transparent; root.add(mesh);
  }
  root.userData.relaxSeats = VILLA_RELAX_SEATS;
  root.userData.aquarium = VILLA_AQUARIUM;
  const aquariumMarker = new THREE.Object3D(); aquariumMarker.name = 'aquarium/cabinet';
  aquariumMarker.position.set(VILLA_AQUARIUM.x, 0, VILLA_AQUARIUM.z); aquariumMarker.userData = { ...VILLA_AQUARIUM };
  root.add(aquariumMarker);
  root.userData.furnishings = { colliders: colliders.length, staticBatches: batches.size, staticVertices, fish: aquariumLife.metadata.fish.count, pointLights: 2 };
  let previousTime = 0;
  const update = (time: number, state: VillaFurnishingState): boolean => {
    const t = Number.isFinite(time) ? Math.max(0, time) : 0, feeding = t < state.fedUntil;
    faucet.update(t, !!state.faucetOn); teaBar.update(t, state.tea ?? t < (state.teaUntil ?? 0));
    const reset = t === 0 || t < previousTime;
    const dt = reset ? 0 : Math.max(0, t - previousTime); previousTime = t;
    aquariumLife.update(t, dt, feeding);
    // Evaluate every updater before aggregating; short-circuit OR used to skip
    // fridge updates whenever the bedroom wardrobe was moving.
    const bedroomChanged = bedroom.update(state.wardrobes, state.roomLights?.master !== false);
    const fridgeChanged = fridge.update(state.wardrobes);
    const doorsChanged = bathDoorModel.update(state.bathDoors);
    let shadowChanged = bedroomChanged || fridgeChanged || doorsChanged;
    // A slow cleaning pass returns to its real dock, rather than orbiting forever.
    const cycle = t % 80;
    if (cycle < 6 || cycle >= 76) { vacuum.position.set(4.45, 0, -7.85); vacuum.rotation.y = 0; }
    else if (cycle < 10 || cycle >= 70) {
      const u = cycle < 10 ? (cycle - 6) / 4 : 1 - (cycle - 70) / 6;
      vacuum.position.set(4.45 - .05 * u, 0, -7.85 - 1.6 * u); vacuum.rotation.y = cycle < 10 ? Math.PI : 0;
    } else {
      const a = (cycle - 10) * Math.PI * 2 / 60;
      vacuum.position.set(4.4 + Math.sin(a) * .85, 0, -10.3 + Math.cos(a) * .85);
      vacuum.rotation.y = Math.atan2(Math.cos(a), -Math.sin(a));
    }
    vacuumBrush.rotation.y = cycle >= 6 && cycle < 76 ? t * 10 : 0;
    // Grill lids ease toward their open/closed targets.
    for (let i = 0; i < grillLids.length; i++) {
      const target = state.grillLids?.[i] ? 1 : 0;
      const current = grillLids[i].userData.progress as number;
      const next = reset ? target : current + Math.sign(target - current) * Math.min(Math.abs(target - current), dt / 0.7);
      shadowChanged ||= next !== current;
      grillLids[i].userData.progress = next;
      grillLids[i].rotation.x = next === 0 ? 0 : -1.25 * next;
    }
    for (let i = 0; i < flames.length; i++) { flames[i].visible = state.fireplace; flames[i].scale.y = 0.2 + 0.16 * (0.5 + Math.sin(t * 8 + i * 1.9) * 0.5); flames[i].position.y = 0.48 + flames[i].scale.y * 0.67; flames[i].rotation.z = Math.sin(t * 5 + i) * 0.16; }
    const night = state.nightFactor ?? (state.evening ? 1 : 0);
    fireLight.intensity = state.fireplace ? (1.8 + night * 1.7) * (0.9 + Math.sin(t * 11) * 0.06 + Math.sin(t * 7.3) * 0.04) : 0;
    for (const [room, glow] of roomGlows) glow.emissiveIntensity = state.roomLights?.[room] === false ? 0 : 0.2 + night * 1.3;
    aquariumLight.intensity = state.aquariumOn === false ? 0 : 1 + night * 1.1;
    return shadowChanged;
  };
  update(0, { evening: false, fireplace: true, gaming: true, fedUntil: 0 });
  return { colliders, update };
}
