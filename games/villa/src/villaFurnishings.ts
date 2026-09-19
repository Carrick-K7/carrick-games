import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { VILLA_SNOOKER } from './villaActivities.js';
import { createVillaSnookerTable } from './villaSnookerModel.js';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import { createVillaFaucet } from './villaFaucet.js';
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
        c.strokeStyle = i % 4 ? '#ffffff18' : '#49361e18';
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
  function orb(x: number, y: number, z: number, sx: number, sy: number, sz: number, material: THREE.Material, rz = 0) {
    const g = new THREE.SphereGeometry(1, 10, 7); g.scale(sx, sy, sz); put(g, material, x, y, z, 0, 0, rz);
  }
  function cyl(x: number, y: number, z: number, rt: number, rb: number, h: number, material: THREE.Material, rx = 0, rz = 0) {
    put(new THREE.CylinderGeometry(rt, rb, h, 16), material, x, y, z, rx, 0, rz);
  }
  function rod(a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material) {
    const g = new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), 7); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())); const mid = a.clone().add(b).multiplyScalar(0.5); put(g, material, mid.x, mid.y, mid.z);
  }
  function hit(x: number, y: number, z: number, w: number, h: number, d: number, seatId?: string) {
    const b = new THREE.Box3(new THREE.Vector3(x - w / 2, y, z - d / 2), new THREE.Vector3(x + w / 2, y + h, z + d / 2)).applyMatrix4(frame);
    const collider = { minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z, minY: b.min.y, maxY: b.max.y };
    colliders.push(collider); if (seatId) registerVillaSeatCollider(collider, seatId);
  }
  function legs(w: number, d: number, h: number, material = walnut, radius = 0.055) {
    for (const x of [-w / 2 + 0.13, w / 2 - 0.13]) for (const z of [-d / 2 + 0.13, d / 2 - 0.13]) cyl(x, h / 2, z, radius * 0.8, radius, h, material);
  }
  function table(w: number, d: number, h = 0.76, material = oak) { legs(w, d, h - 0.09); box(0, h - 0.05, 0, w, 0.1, d, material, 0.05); hit(0, 0, 0, w, h, d); }
  function chair(material = sage, seatId?: string) {
    legs(0.6, 0.62, 0.46); box(0, 0.47, 0, 0.62, 0.13, 0.64, material, 0.06); box(0, 0.78, 0.27, 0.61, 0.63, 0.12, material, 0.07); hit(0, 0, 0, 0.65, 1.1, 0.68, seatId);
    if (seatId) seatMarker(seatId, 0.65, 0.68);
  }
  function cushion(x: number, y: number, z: number, material: THREE.Material, yaw = 0) {
    at(x, y, z, yaw, () => { box(0, 0, 0, 0.55, 0.52, 0.22, material, 0.1); box(0, 0, 0.117, 0.45, 0.42, 0.012, material, 0.045); });
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
  function sofa(w = 3.4, material = linen, chaise = false, seatId?: string) {
    legs(w, 1.2, 0.2); box(0, 0.32, 0, w, 0.37, 1.26, material, 0.12); box(0, 0.85, 0.5, w, 0.82, 0.28, material, 0.11);
    for (const x of [-w / 2 + 0.13, w / 2 - 0.13]) box(x, 0.62, 0, 0.28, 0.65, 1.3, material, 0.11);
    const n = Math.max(1, Math.round(w / 1.1));
    for (let i = 0; i < n; i++) { const x = -w / 2 + 0.3 + (i + 0.5) * (w - 0.6) / n; box(x, 0.56, -0.1, (w - 0.63) / n, 0.23, 0.98, material, 0.075); box(x, 0.92, 0.31, (w - 0.65) / n, 0.55, 0.22, material, 0.09); }
    cushion(-w / 2 + 0.65, 0.86, 0.12, terra, 0.14); if (w > 1.6) cushion(w / 2 - 0.65, 0.86, 0.11, sage, -0.17); hit(0, 0, 0, w, 1.26, 1.3, seatId);
    if (chaise) { box(-w / 2 + 0.63, 0.36, -1.05, 1.24, 0.48, 1.4, material, 0.13); box(-w / 2 + 0.63, 0.61, -1.03, 1.17, 0.15, 1.33, material, 0.07); hit(-w / 2 + 0.63, 0, -1.05, 1.24, 0.7, 1.4, seatId); }
    if (seatId) seatMarker(seatId, w, 1.3);
  }
  function plant(x: number, y: number, z: number, s = 1, flowers = false) {
    at(x, y, z, 0, () => {
      const profile = [new THREE.Vector2(0.17 * s, 0), new THREE.Vector2(0.23 * s, 0.34 * s), new THREE.Vector2(0.25 * s, 0.36 * s), new THREE.Vector2(0.23 * s, 0.39 * s), new THREE.Vector2(0.2 * s, 0.36 * s)];
      put(new THREE.LatheGeometry(profile, 14), terra, 0, 0, 0); cyl(0, 0.35 * s, 0, 0.2 * s, 0.2 * s, 0.035 * s, soil);
      for (let i = 0; i < 7; i++) {
        const a = i * 2.4, h = (0.63 + random() * 0.48) * s, px = Math.cos(a) * 0.25 * s, pz = Math.sin(a) * 0.25 * s;
        rod(new THREE.Vector3(0, 0.35 * s, 0), new THREE.Vector3(px, h, pz), 0.012 * s, leaf);
        orb(px, h - 0.05 * s, pz, 0.1 * s, 0.23 * s, 0.06 * s, i % 2 ? leaf : leafLight, Math.cos(a) * 0.7);
        if (flowers) for (let p = 0; p < 5; p++) orb(px + Math.cos(p * 1.256) * 0.045 * s, h + 0.08 * s, pz + Math.sin(p * 1.256) * 0.045 * s, 0.047 * s, 0.035 * s, 0.047 * s, p % 2 ? coral : cream);
      }
    });
  }
  function books(x: number, y: number, z: number, count = 6) {
    for (let i = 0; i < count; i++) { const h = 0.23 + random() * 0.15; box(x + i * 0.1, y + h / 2, z, 0.08, h, 0.22, bookMats[i % bookMats.length], 0.005); box(x + i * 0.1, y + h * 0.75, z + 0.114, 0.06, 0.015, 0.008, brass, 0); }
  }
  function shelf(w = 2.1) {
    for (const x of [-w / 2, w / 2]) box(x, 1.17, 0, 0.08, 2.34, 0.38, oak); box(0, 1.17, -0.18, w, 2.34, 0.04, walnut, 0);
    for (let i = 0; i < 5; i++) { box(0, 0.15 + i * 0.48, 0, w, 0.06, 0.4, oak); books(-w / 2 + 0.12, 0.19 + i * 0.48, 0, Math.floor(w * 6)); } hit(0, 0, 0, w + 0.1, 2.34, 0.43);
  }
  function lamp(tall = false) {
    const h = tall ? 1.65 : 0.52; cyl(0, 0.025, 0, tall ? 0.23 : 0.14, tall ? 0.23 : 0.14, 0.05, brass); cyl(0, h / 2, 0, 0.025, 0.025, h, brass);
    cyl(0, h, 0, tall ? 0.22 : 0.15, tall ? 0.34 : 0.23, tall ? 0.42 : 0.3, linen); cyl(0, h - (tall ? 0.215 : 0.155), 0, tall ? 0.29 : 0.18, tall ? 0.29 : 0.18, 0.012, lampGlow);
  }
  function artwork(x: number, y: number, z: number, w: number, h: number, yaw = 0) {
    at(x, y, z, yaw, () => { box(0, 0, 0, w, h, 0.065, walnut); box(0, 0, 0.039, w - 0.11, h - 0.11, 0.014, cream, 0); put(new THREE.PlaneGeometry(w - 0.21, h - 0.21), artMat, 0, 0, 0.05); });
  }
  function tea(x: number, y: number, z: number) {
    cyl(x, y + 0.015, z, 0.14, 0.14, 0.025, white); cyl(x, y + 0.085, z, 0.075, 0.06, 0.13, white); cyl(x, y + 0.151, z, 0.062, 0.062, 0.003, walnut); put(new THREE.TorusGeometry(0.05, 0.013, 5, 10), white, x + 0.086, y + 0.09, z);
  }
  function bed(definition: typeof VILLA_BEDS[number]) {
    const { origin, yaw, width: w, id } = definition;
    at(origin.x, origin.y, origin.z, yaw, () => {
      legs(w, 3.7, 0.22); box(0, 0.34, 0, w + 0.13, 0.35, 3.75, oak, 0.1); box(0, 0.62, 0, w, 0.37, 3.55, linen, 0.13); box(0, 0.96, 1.87, w + 0.32, 1.65, 0.2, sage, 0.12);
      for (let i = 0; i < 7; i++) box(-w / 2 + i * w / 6, 1.06, 1.749, 0.018, 1.34, 0.02, linen, 0.008);
      box(0, 0.83, -0.58, w + 0.05, 0.14, 2.32, cream, 0.06); box(0, 0.925, -1, w + 0.07, 0.075, 0.8, terra, 0.025);
      box(0, 0.95, 1.25, definition.pillowWidth, 0.24, 0.65, linen, 0.1);
      const pillow = new THREE.Object3D(); pillow.name = `${id}/pillow`;
      pillow.position.set(definition.pillow.x, definition.pillow.y, definition.pillow.z);
      pillow.userData = { count: 1, centered: true, width: definition.pillowWidth }; root.add(pillow);
      hit(0, 0, 0, w + 0.15, 0.98, 3.8, id); seatMarker(id, w + 0.15, 3.8);
      for (const side of [-1, 1]) at(side * (w / 2 + 0.55), 0, 1.27, 0, () => {
        box(0, 0.3, 0, 0.72, 0.6, 0.65, oak, 0.045); box(0, 0.42, -0.335, 0.59, 0.23, 0.025, cream); cyl(0, 0.43, -0.36, 0.023, 0.023, 0.04, brass, Math.PI / 2); at(0, 0.61, 0, 0, () => lamp()); hit(0, 0, 0, 0.72, 0.6, 0.65);
      });
    });
  }

  // Living room. The chaise is on the west, preserving the route to the aquarium.
  at(-8, 0, 5.8, 0, () => sofa(4.2, linen, true, 'sofa-living')); box(-8, 0.018, 3.9, 6.1, 0.028, 4.15, rugMat, 0.01);
  at(-7.6, 0, 3.55, 0, () => { table(2.2, 1.25, 0.44, walnut); box(-0.45, 0.49, 0.06, 0.55, 0.08, 0.42, sage); box(-0.42, 0.545, 0.02, 0.47, 0.04, 0.35, cream); tea(0.6, 0.45, 0.13); plant(0.05, 0.45, -0.25, 0.46, true); });
  at(-10.8, 0, 6.8, 0, () => lamp(true)); plant(-3, 0, 7.9, 1.45);
  // The live lawn cat occasionally visits; no duplicate static animal on the sofa.
  // A full chimney breast supports the mantel and artwork between living/dining.
  box(VILLA_FIREPLACE_WALL.x, 1.7, VILLA_FIREPLACE_WALL.centerZ, 2.5, 3.4, VILLA_FIREPLACE_WALL.depth, cream, 0);
  hit(VILLA_FIREPLACE_WALL.x, 0, VILLA_FIREPLACE_WALL.centerZ, 2.5, 3.4, VILLA_FIREPLACE_WALL.depth);
  box(-10, 0.13, 0.37, 2.85, 0.26, 0.88, stone); box(-10, 0.73, 0.12, 2.42, 1.28, 0.48, dark);
  for (const x of [-11.22, -8.78]) box(x, 0.84, 0.36, 0.3, 1.43, 0.72, cream); box(-10, 1.52, 0.36, 2.85, 0.18, 0.83, cream);
  for (let i = 0; i < 4; i++) cyl(-10.7 + i * 0.44, 0.35, 0.49, 0.105, 0.12, 0.65, walnut, Math.PI / 2, i % 2 ? 0.22 : -0.22);
  artwork(-10, 2.24, 0.15, 2.25, 1.08); hit(-10, 0, 0.35, 2.88, 1.61, 0.9);
  const flameMat = new THREE.MeshBasicMaterial({ color: '#ffc36a', transparent: true, opacity: 0.78, depthWrite: false, blending: THREE.AdditiveBlending });
  const flames: THREE.Mesh[] = [];
  for (let i = 0; i < 7; i++) { const f = new THREE.Mesh(new THREE.SphereGeometry(1, 7, 5), flameMat); f.position.set(-10.7 + i * 0.23, 0.66, 0.51 + (i % 2) * 0.08); f.scale.set(0.115, 0.31, 0.075); root.add(f); flames.push(f); }
  const fireLight = new THREE.PointLight('#ffae62', 2.5, 6, 2); fireLight.position.set(-10, 1, 0.95); root.add(fireLight);

  // Aquarium: real transparent panels, fine substrate and individually animated fish.
  const glass = new THREE.MeshStandardMaterial({ color: '#bfedf0', roughness: 0.09, metalness: 0.12, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide });
  const water = new THREE.MeshStandardMaterial({ color: '#56b9be', roughness: 0.15, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
  at(VILLA_AQUARIUM.x, 0, VILLA_AQUARIUM.z, 0, () => {
    // Rear flush with the shared wall datum; front is recessed so pulls remain inside the live footprint.
    box(0, 0.325, -0.03, 3.4, 0.65, 0.97, walnut, 0.06);
    for (const x of [-1.1, 0, 1.1]) { box(x, 0.34, 0.473, 1.055, 0.5, 0.026, oak); box(x + 0.36, 0.43, 0.5, 0.11, 0.025, 0.025, brass); }
    box(0, 0.69, 0, 3.43, 0.09, 1.03, black); box(0, 2.135, 0, 3.43, 0.07, 1.03, black); box(0, 0.77, 0, 3.24, 0.09, 0.89, stone);
    for (const x of [-1.66, 1.66]) box(x, 1.425, 0, 0.025, 1.4, 0.98, glass, 0);
    for (const z of [-0.48, 0.48]) box(0, 1.425, z, 3.34, 1.4, 0.015, glass, 0);
    box(0, 2.035, 0, 3.28, 0.012, 0.94, water, 0);
    for (let i = 0; i < 48; i++) orb((random() - 0.5) * 3.15, 0.83, (random() - 0.5) * 0.83, 0.025 + random() * 0.035, 0.025, 0.032, i % 2 ? cream : stone);
    for (const x of [-1.28, 0.5, 1.22]) {
      orb(x, 0.91, -0.12, 0.18, 0.17, 0.17, stone);
      for (let i = 0; i < 5; i++) { const px = x + (i - 2) * 0.095, h = 0.3 + random() * 0.57; rod(new THREE.Vector3(px, 0.8, -0.22), new THREE.Vector3(px + 0.08, 0.8 + h, -0.2), 0.014, leaf); orb(px + 0.06, 0.86 + h * 0.66, -0.2, 0.053, h * 0.45, 0.027, leafLight, -0.2); }
    }
    hit(0, 0, 0, VILLA_AQUARIUM.width, 2.17, VILLA_AQUARIUM.depth);
  });
  const aquariumLight = new THREE.PointLight('#81ded9', 1.6, 4.5, 2); aquariumLight.name = 'aquarium/light'; aquariumLight.position.set(VILLA_AQUARIUM.x, 1.8, VILLA_AQUARIUM.z); root.add(aquariumLight);
  const aquariumLife = createVillaAquariumLife(root);

  // Fitted kitchen: low splashback stays below the two north windows. The
  // cooker/hood and upper cabinetry attach only to the solid central pier.
  const tile = mat('#d5ded2', 0.25), ovenGlass = mat('#142023', 0.16, 0.3);
  const kitchenLed = mat('#fff1cd', 0.35); kitchenLed.emissive.set('#ffd497'); kitchenLed.emissiveIntensity = 0.75;
  const fridge = createVillaFridge(root); colliders.push(...fridge.colliders);
  for (let i = 0; i < 6; i++) at(-10.55 + i * 1.22, 0, -8.35, 0, () => {
    box(0, 0.105, 0, 1.19, 0.17, 0.86, dark, 0);
    box(0, 0.5, 0, 1.19, 0.78, 1, sage);
    // Leave a genuine opening through the stone for the recessed sink.
    if (i === 4) {
      for (const x of [-0.5, 0.5]) box(x, 0.94, 0, 0.23, 0.1, 1.08, white, 0.01);
      for (const z of [-0.42, 0.42]) box(0, 0.94, z, 0.77, 0.1, 0.24, white, 0.01);
    } else box(0, 0.94, 0, 1.23, 0.1, 1.08, white, 0.015);
    if (i !== 2 && i !== 5) {
      for (const x of [-0.29, 0.29]) {
        box(x, 0.49, 0.517, 0.56, 0.69, 0.032, oak, 0.012); box(x, 0.49, 0.54, 0.47, 0.59, 0.026, sage, 0.008);
        box(x + (x < 0 ? 0.17 : -0.17), 0.72, 0.566, 0.025, 0.16, 0.035, brass, 0.007);
      }
    }
    hit(0, 0, 0, 1.22, 0.99, 1.08);
  });
  // Individually grouted ceramic tiles; no opaque panels across glazing.
  for (let row = 0; row < 2; row++) for (let col = 0; col < 25; col++)
    box(-11.05 + col * 0.285, 1.06 + row * 0.14, -8.89, 0.277, 0.132, 0.025, tile, 0.004);
  for (let row = 0; row < 5; row++) for (let col = 0; col < 8; col++)
    box(-8.85 + col * 0.285, 1.34 + row * 0.14, -8.89, 0.277, 0.132, 0.025, tile, 0.004);
  // The tall fridge-freezer is a real openable model owned by villaWardrobe, so
  // a second static steel box here only hid its doors and clipped their swing.
  // Built-in oven below a four-zone ceramic hob.
  box(-8.11, 0.5, -7.806, 1.07, 0.71, 0.07, steel, 0.015); box(-8.11, 0.44, -7.76, 0.88, 0.43, 0.018, ovenGlass, 0.014);
  box(-8.11, 0.67, -7.705, 0.74, 0.035, 0.075, steel, 0.01);
  for (const x of [-8.48, -7.74]) cyl(x, 0.8, -7.752, 0.035, 0.035, 0.03, black, Math.PI / 2);
  box(-8.11, 0.8, -7.75, 0.15, 0.037, 0.012, kitchenLed, 0.002);
  box(-8.11, 1, -8.32, 1.04, 0.027, 0.76, black, 0.018);
  for (const x of [-8.38, -7.84]) for (const z of [-8.53, -8.18]) put(new THREE.TorusGeometry(0.115, 0.009, 5, 18), steel, x, 1.018, z, Math.PI / 2);
  box(-8.11, 2.04, -8.52, 1.18, 0.13, 0.74, steel, 0.018); box(-8.11, 2.5, -8.72, 0.46, 0.82, 0.34, steel, 0.01);
  box(-8.11, 1.968, -8.5, 0.8, 0.01, 0.36, dark, 0); box(-8.11, 1.96, -8.22, 0.72, 0.013, 0.028, kitchenLed, 0);
  for (let i = 0; i < 8; i++) box(-8.43 + i * 0.09, 1.959, -8.5, 0.018, 0.009, 0.3, steel, 0);
  at(-7.01, 0, -8.6, 0, () => {
    box(0, 2.22, 0, 0.87, 1.08, 0.57, cream, 0.015);
    box(0, 2.51, 0.295, 0.8, 0.42, 0.035, sage, 0.01); box(0.3, 2.42, 0.33, 0.025, 0.14, 0.03, brass);
    box(0, 2, 0.305, 0.79, 0.42, 0.04, steel, 0.009); box(-0.08, 1.99, 0.332, 0.52, 0.3, 0.018, ovenGlass, 0.012);
    box(0.22, 2, 0.36, 0.023, 0.22, 0.036, steel); box(0.32, 2.11, 0.334, 0.063, 0.033, 0.012, kitchenLed, 0);
    box(0, 1.675, 0.19, 0.75, 0.015, 0.04, kitchenLed, 0);
  });
  // Integrated dishwasher with recessed controls and stainless pull.
  box(-4.45, 0.49, -7.813, 1.1, 0.73, 0.052, steel, 0.014); box(-4.45, 0.64, -7.77, 0.74, 0.038, 0.05, black, 0.008);
  box(-4.45, 0.81, -7.781, 0.96, 0.07, 0.016, dark, 0.003); box(-4.16, 0.813, -7.77, 0.05, 0.013, 0.01, kitchenLed, 0);
  // Sink has a low basin floor, raised metal sides and a swan-neck mixer.
  box(-5.67, 0.906, -8.35, 0.76, 0.015, 0.59, steel, 0.035);
  for (const x of [-6.055, -5.285]) box(x, 0.957, -8.35, 0.028, 0.112, 0.65, steel, 0.008);
  for (const z of [-8.66, -8.04]) box(-5.67, 0.957, z, 0.78, 0.112, 0.028, steel, 0.008);
  cyl(-5.67, 0.919, -8.35, 0.043, 0.043, 0.007, dark);
  cyl(-5.67, 1.18, -8.77, 0.023, 0.023, 0.36, steel);
  put(new THREE.TorusGeometry(0.135, 0.023, 7, 16, Math.PI), steel, -5.67, 1.355, -8.635, 0, Math.PI / 2);
  cyl(-5.67, 1.31, -8.5, 0.024, 0.024, 0.09, steel);
  const faucet = createVillaFaucet(root);
  const teaBar = createVillaTeaBar(root); colliders.push(...teaBar.colliders);
  // Cookware: pot with lid/handles, kettle, chopping board and safe knife block.
  cyl(-8.38, 1.125, -8.53, 0.135, 0.12, 0.21, steel); cyl(-8.38, 1.239, -8.53, 0.145, 0.145, 0.025, steel); orb(-8.38, 1.275, -8.53, 0.037, 0.027, 0.037, black);
  for (const x of [-8.56, -8.2]) box(x, 1.17, -8.53, 0.09, 0.035, 0.075, black, 0.01);
  cyl(-10.3, 1.012, -8.35, 0.16, 0.16, 0.035, black); orb(-10.3, 1.19, -8.35, 0.15, 0.18, 0.13, steel);
  rod(new THREE.Vector3(-10.2, 1.19, -8.35), new THREE.Vector3(-10.05, 1.32, -8.35), 0.033, steel);
  put(new THREE.TorusGeometry(0.115, 0.022, 6, 14, Math.PI * 1.4), black, -10.42, 1.24, -8.35, 0, 0, 0.9);
  box(-9.4, 1.01, -8.23, 0.63, 0.035, 0.4, oak, 0.03, 0.12);
  box(-9.15, 1.13, -8.65, 0.2, 0.27, 0.21, walnut, 0.018);
  for (let i = 0; i < 3; i++) { box(-9.22 + i * 0.067, 1.31, -8.65, 0.016, 0.19, 0.056, steel, 0); box(-9.22 + i * 0.067, 1.43, -8.65, 0.026, 0.13, 0.048, black, 0.007); }
  plant(-10.85, 0.99, -8.45, 0.43);
  root.userData.kitchen = { components: ['fitted sage cabinetry', 'stone counters', 'four-zone hob', 'wall-mounted extractor', 'built-in oven', 'microwave', 'fridge-freezer', 'dishwasher', 'recessed sink', 'swan-neck tap', 'ceramic backsplash', 'warm under-cabinet LEDs', 'pot', 'kettle', 'cutting board', 'knife block', 'island', 'two bar stools', 'dining place settings'], extractorCenter: [-8.11, 2.04, -8.52], solidWallSpan: [-9, -6.4] };
  at(-5.2, 0, -5.6, 0, () => {
    box(0, 0.46, 0, 2.5, 0.92, 1.22, oak); box(0, 0.97, 0, 2.7, 0.11, 1.43, white); hit(0, 0, 0, 2.7, 1.03, 1.43); cyl(0.55, 1.055, 0, 0.25, 0.16, 0.1, cream);
    for (let i = 0; i < 5; i++) orb(0.4 + (i % 3) * 0.13, 1.15, -0.07 + Math.floor(i / 3) * 0.12, 0.085, 0.08, 0.08, i % 2 ? coral : leafLight);
  });
  for (const [i, x] of [-5.85, -4.55].entries()) at(x, 0, -4.48, 0, () => {
    legs(0.47, 0.47, 0.7, walnut, 0.035); box(0, 0.73, 0, 0.52, 0.1, 0.49, linen, 0.05);
    for (const z of [-0.16, 0.16]) box(0, 0.29, z, 0.35, 0.025, 0.025, brass, 0.006);
    hit(0, 0, 0, 0.54, 0.8, 0.51, `stool-kitchen-${i + 1}`); seatMarker(`stool-kitchen-${i + 1}`, 0.54, 0.51);
  });
  at(-8.5, 0, -2.8, 0, () => {
    table(2.8, 1.35); plant(0, 0.77, 0, 0.42, true);
    for (const x of [-0.83, 0.83]) for (const z of [-1.08, 1.08]) {
      at(x, 0, z, z < 0 ? Math.PI : 0, () => chair(sage, `chair-dining-${(x < 0 ? 0 : 2) + (z < 0 ? 1 : 2)}`));
      const pz = z < 0 ? -0.37 : 0.37;
      box(x, 0.818, pz, 0.63, 0.009, 0.48, linen, 0.01);
      cyl(x, 0.829, pz, 0.19, 0.175, 0.018, white); cyl(x, 0.84, pz, 0.137, 0.14, 0.007, cream);
      for (const dx of [-0.25, 0.25]) box(x + dx, 0.833, pz, 0.018, 0.012, 0.27, steel, 0.004);
    }
  });
  for (const x of [-8.9, -7.95, -5.2]) { cyl(x, 2.95, -3.2, 0.012, 0.012, 1, black); cyl(x, 2.4, -3.2, 0.13, 0.3, 0.28, brass); cyl(x, 2.253, -3.2, 0.25, 0.25, 0.015, lampGlow); }

  // Detailed PC, cockpit and glazed collections are scene-owned villaGaming models.

  // Snooker: six apertures pierce cloth AND slate, not painted-on pockets.
  const snookerWalnut = mat('#382218', 0.42); snookerWalnut.map = oak.map;
  const snookerTable = createVillaSnookerTable(root); colliders.push(...snookerTable.colliders);
  // Cue rack relocated onto the cinema's west wall after the gym/snooker divider
  // came down: still west of the play line and outside the cue sweep.
  for (const y of [0.3, 1.53]) box(16.8, y, -12, 0.15, 0.12, 1.06, snookerWalnut, 0.015);
  for (let i = 0; i < 5; i++) {
    const z = -12.4 + i * 0.2;
    cyl(16.66, 0.62, z, 0.016, 0.022, 0.6, snookerWalnut); cyl(16.66, 1.25, z, 0.007, 0.016, 0.66, oak);
    cyl(16.66, 1.59, z, 0.008, 0.008, 0.025, cream); cyl(16.66, 1.608, z, 0.008, 0.008, 0.011, blue);
  }
  hit(16.8, 0, -12, 0.25, 1.65, 1.08);
  root.userData.snooker = { ...VILLA_SNOOKER, ballCount: 22, redCount: 15, colorCount: 6, whiteCount: 1, pocketCount: 6, baulkOffset: 0.737, dRadius: 0.292,
    // Derived from the same table constants the model builds from, so a moved
    // or resized table cannot leave a stale hand-copied collider behind.
    collider: { minX: VILLA_SNOOKER.center.x - VILLA_SNOOKER.width / 2, maxX: VILLA_SNOOKER.center.x + VILLA_SNOOKER.width / 2,
      minZ: VILLA_SNOOKER.center.z - VILLA_SNOOKER.length / 2, maxZ: VILLA_SNOOKER.center.z + VILLA_SNOOKER.length / 2,
      minY: VILLA_SNOOKER.center.y, maxY: VILLA_SNOOKER.center.y + 0.92 },
    cueRack: { x: 16.8, z: -12, cueCount: 5 } };

  // First floor bedrooms and library.
  bed(VILLA_BEDS[0]); box(-8, 3.617, 5.3, 5.4, 0.026, 5.4, rugMat, 0);
  // ---- The rooms the doubled plan added ----
  // Ground-floor tea room (was the study): a low ceremonial tea table with a
  // full service, floor cushions, a tea-ware shelf and a bonsai on its stand.
  at(-18.6, 0, -13.6, 0, () => {
    at(0, 0, -2.2, 0, () => {
      for (const [x, z] of [[-0.72, -0.48], [0.72, -0.48], [-0.72, 0.48], [0.72, 0.48]]) cyl(x, 0.19, z, 0.045, 0.055, 0.38, walnut);
      box(0, 0.4, 0, 1.9, 0.06, 1.25, walnut, 0.03);
      box(0, 0.445, 0, 1.55, 0.025, 0.95, dark, 0.01);
      cyl(-0.5, 0.58, -0.25, 0.16, 0.185, 0.26, black);
      cyl(-0.5, 0.73, -0.25, 0.06, 0.09, 0.035, black);
      orb(-0.5, 0.77, -0.25, 0.028, 0.05, 0.028, brass);
      orb(0.1, 0.53, -0.28, 0.14, 0.095, 0.12, terra);
      rod(new THREE.Vector3(0.2, 0.56, -0.28), new THREE.Vector3(0.38, 0.53, -0.2), 0.016, terra);
      rod(new THREE.Vector3(0.02, 0.6, -0.32), new THREE.Vector3(0.02, 0.6, -0.12), 0.012, dark);
      for (const [x, z] of [[0.42, 0.12], [0.58, 0.28], [0.34, 0.36], [0.62, 0.06]]) cyl(x, 0.49, z, 0.045, 0.036, 0.06, cream);
      hit(0, 0, 0, 1.95, 0.62, 1.3);
    });
    for (const [x, z, yaw] of [[-1.75, -2.2, Math.PI / 2], [1.75, -2.7, -Math.PI / 2], [0.1, -0.35, Math.PI]] as const) {
      at(x, 0, z, yaw, () => { box(0, 0.09, 0, 0.74, 0.18, 0.74, terra, 0.09); box(0, 0.195, 0.03, 0.52, 0.08, 0.52, linen, 0.06); });
    }
    at(-5.29, 0, 2.2, 0, () => {
      box(0, 1.05, 0, 0.34, 2.1, 3, walnut, 0.02);
      for (let i = 0; i < 4; i++) {
        box(0.09, 0.34 + i * 0.52, 0, 0.3, 0.035, 2.84, oak, 0.01);
        for (let c = 0; c < 4; c++) cyl(0.24, 0.44 + i * 0.52, -1.15 + c * 0.6, 0.05, 0.038, 0.09, i % 2 ? cream : sage);
      }
      hit(0, 0, 0, 0.4, 2.1, 3.05);
    });
    at(-2.6, 0, -4.05, 0, () => { cyl(0, 0.22, 0, 0.26, 0.32, 0.44, walnut); plant(0, 0.44, 0, 0.6); });
    at(2.8, 0, -4.1, 0, () => lamp(true));
  });
  box(-18.6, 0.017, -12.4, 5.4, 0.028, 4, rugMat, 0.01);
  plant(-14.2, 0, -16.6, 1.35); plant(-22.8, 0, -10.4, 1.2);
  // Ground-floor laundry and utility room: a matched front-loader washer and
  // heat-pump dryer under a shelf run, plus a folding table and basket.
  at(-7.5, 0, -13.6, 0, () => {
    const laundryUnit = (x: number, z: number, dryer: boolean) => {
      box(x, 0.47, z, 0.64, 0.94, 0.7, white, 0.035);
      // Porthole: steel rim, dark glass, and a visible drum behind it.
      cyl(x, 0.5, z + 0.352, 0.215, 0.215, 0.025, steel, Math.PI / 2);
      cyl(x, 0.5, z + 0.368, 0.17, 0.17, 0.012, dark, Math.PI / 2);
      cyl(x, 0.5, z + 0.378, 0.12, 0.12, 0.006, steel, Math.PI / 2);
      // Control panel: dial, buttons and a small glow display.
      box(x, 0.86, z + 0.348, 0.58, 0.11, 0.025, steel, 0.01);
      cyl(x + 0.19, 0.86, z + 0.362, 0.036, 0.036, 0.014, white, Math.PI / 2);
      for (let i = 0; i < 3; i++) cyl(x - 0.02 - i * 0.09, 0.87, z + 0.362, 0.014, 0.014, 0.008, dark, Math.PI / 2);
      box(x - 0.14, 0.845, z + 0.364, 0.1, 0.035, 0.005, lampGlow, 0.003);
      // Detergent drawer with a chrome pull, and a plinth under the feet.
      box(x - 0.14, 0.73, z + 0.35, 0.3, 0.075, 0.018, steel, 0.008);
      box(x, 0.03, z, 0.56, 0.06, 0.6, steel, 0.012);
      if (dryer) box(x + 0.24, 0.5, z + 0.355, 0.07, 0.09, 0.01, steel, 0.006);
    };
    laundryUnit(-2.6, -3.3, false); laundryUnit(-1.5, -3.3, true);
    at(1.2, 0, -3.6, 0, () => { table(3.4, 0.72, 0.9, oak); box(0, 0.95, 0, 2.6, 0.06, 0.5, steel, 0.02); box(-0.6, 1.0, 0, 0.42, 0.05, 0.4, steel, 0.02); });
    for (let i = 0; i < 4; i++) box(-3.9, 0.5 + i * 0.6, 1.6, 0.36, 0.04, 2.6, oak, 0.01);
    box(-4.05, 1.1, 1.6, 0.1, 2.4, 0.1, steel, 0.01);
    box(3.6, 0.24, 2.9, 1.1, 0.48, 0.72, sage, 0.04);
  });
  // Hall runner by the lift lobby warms the stone strip behind the stairs, and a
  // robot vacuum works its cleaning loop there.
  box(1.1, 0.022, -12.4, 3.4, 0.028, 8.6, rugMat, 0.01);
  let vacuumLidar: THREE.Mesh | undefined;
  const vacuum = new THREE.Group(); vacuum.name = 'robot-vacuum'; root.add(vacuum);
  {
    const shell = villaMaterial('#e8e6e1', .38), vacTrim = villaMaterial('#2a2e31', .5), lens = villaMaterial('#1b2124', .2, .3);
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, y: number, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(0, y, z); vacuum.add(m); return m; };
    add(new THREE.CylinderGeometry(.175, .18, .09, 24), shell, .047);
    add(new THREE.CylinderGeometry(.181, .181, .028, 24, 1, true), vacTrim, .052);
    add(new THREE.CylinderGeometry(.172, .172, .02, 24), vacTrim, .012);
    add(new THREE.CylinderGeometry(.048, .054, .045, 16), vacTrim, .115);
    vacuumLidar = add(new THREE.CylinderGeometry(.05, .05, .014, 16), shell, .144);
    add(new THREE.CylinderGeometry(.03, .03, .006, 12), lens, .1);
    add(new THREE.BoxGeometry(.05, .008, .02), vacTrim, .095, .13);
    for (const x of [-0.05, 0.05]) add(new THREE.CylinderGeometry(.014, .014, .006, 10), x < 0 ? vacTrim : shell, .095, x);
  }
  // Charging dock against the lift-shaft wall, just off the cleaning loop.
  box(4.35, 0.045, -8.5, 0.34, 0.09, 0.2, villaMaterial('#2a2e31', .5), 0.02);
  at(-11.4, 0, -9.9, 0, () => lamp(true));
  // Ground-floor gym: weight rack, cable crossover, dumbbell tree, kettlebells,
  // a treadmill, one bench and a neat row of yoga mats, under a wall mirror.
  at(11.3, 0, -13.6, 0, () => {
    // Freestanding weight rack and plate trees, parallel to the north wall.
    box(-4.2, 0.5, -3.3, 2.6, 1, 0.16, steel, 0.02);
    for (let i = 0; i < 5; i++) box(-5.1 + i * 0.45, 0.55, -3.12, 0.08, 1.1, 0.08, dark, 0.01);
    hit(-4.2, 0, -3.3, 2.7, 1.1, 0.3);
    // Cable crossover: two towers with weight stacks, top pulleys and a bar.
    at(1.2, 0, -4.05, 0, () => {
      for (const side of [-1, 1]) {
        box(side * 0.85, 1.1, 0, 0.5, 2.2, 0.62, dark, 0.03);
        for (let i = 0; i < 8; i++) box(side * 0.85, 0.5 + i * 0.21, 0.3, 0.36, 0.05, 0.1, black, 0.008);
        cyl(side * 0.85, 2.14, 0.24, 0.06, 0.06, 0.05, steel, Math.PI / 2);
        rod(new THREE.Vector3(side * 0.85, 1.9, 0.24), new THREE.Vector3(side * 0.85, 1.1, 0.4), 0.012, steel);
        box(side * 0.85, 1.06, 0.42, 0.3, 0.05, 0.12, steel, 0.01);
      }
      box(0, 2.28, 0, 2.2, 0.08, 0.08, steel, 0.02);
      hit(0, 0, 0, 2.25, 2.3, 0.7);
    });
    // Dumbbell tree: two tiers of paired dumbbells with knurled handles.
    at(-2.6, 0, -1.15, 0, () => {
      box(0, 0.24, 0, 1.5, 0.1, 0.5, dark, 0.02); box(0, 0.66, 0, 1.5, 0.1, 0.5, dark, 0.02);
      for (const side of [-1, 1]) box(side * 0.72, 0.45, 0, 0.08, 0.9, 0.08, steel, 0.01);
      for (let i = 0; i < 3; i++) {
        const x = -0.45 + i * 0.45, r = 0.055 + i * 0.008;
        cyl(x, 0.34, 0, 0.022, 0.022, 0.24, steel, 0, Math.PI / 2);
        for (const s of [-1, 1]) cyl(x + s * 0.12, 0.34, 0, r, r, 0.09, black, 0, Math.PI / 2);
        cyl(x, 0.76, 0, 0.02, 0.02, 0.22, steel, 0, Math.PI / 2);
        for (const s of [-1, 1]) cyl(x + s * 0.11, 0.76, 0, 0.05, 0.05, 0.08, black, 0, Math.PI / 2);
      }
      hit(0, 0, 0, 1.6, 0.95, 0.6);
    });
    // Kettlebells lined up by the rack.
    for (let i = 0; i < 4; i++) { const x = -0.4 + i * 0.34, r = 0.09 + i * 0.012; orb(x, r, -1.15, r, r * 1.15, r, black); cyl(x, r * 2.1, -1.15, 0.018, 0.022, 0.09, steel, 0, Math.PI / 2); }
    // Treadmill facing north, with rails and a real console.
    at(2.7, 0, -2.4, 0, () => {
      box(0, 0.14, 0, 0.62, 0.18, 1.8, dark, 0.03);
      box(0, 0.19, 0, 0.5, 0.04, 1.6, black, 0.01);
      for (const side of [-1, 1]) {
        rod(new THREE.Vector3(side * 0.27, 0.22, -0.72), new THREE.Vector3(side * 0.27, 1.02, -0.8), 0.02, steel);
        rod(new THREE.Vector3(side * 0.27, 1.02, -0.8), new THREE.Vector3(side * 0.27, 1.05, 0.6), 0.016, steel);
      }
      box(0, 1.14, -0.84, 0.6, 0.3, 0.12, black, 0.03);
      box(0, 1.16, -0.9, 0.46, 0.18, 0.03, steel, 0.01);
    });
    hit(2.7, 0, -2.4, 0.7, 1.3, 1.9);
    // Yoga mats in a tidy, evenly spaced row, each with its rolled end east.
    for (let i = 0; i < 3; i++) {
      const x = -1.9 + i * 1.35;
      box(x, 0.012, 0.9, 0.62, 0.024, 1.75, i % 2 ? sage : terra, 0.008);
      box(x + 0.95, 0.065, 0.9, 0.22, 0.11, 0.62, i % 2 ? sage : terra, 0.05);
    }
    // One bench, not a row of chairs.
    box(-3.6, 0.22, 1.4, 0.5, 0.44, 1.9, dark, 0.04); box(-3.6, 0.5, 1.4, 0.34, 0.14, 1.7, sage, 0.03);
    hit(-3.6, 0, 1.4, 0.5, 0.6, 1.9);
    // Mirror on the north wall's solid stretch between the two windows, facing
    // the treadmill across the room instead of floating over the floor.
    box(4.2, 1.45, -4.57, 2.4, 1.9, 0.06, steel, 0.01);
  });
  // The east lounge (起居厅) is deliberately left bare for now: an unfurnished
  // hall the family can arrange later. Only the cinema's plant keeps its spot.
  plant(26.4, 0, -14.6, 1.3);
  // Upstairs study: writing desk under the north light, books on both returns.
  at(12.5, 3.6, -13.6, 0, () => {
    at(0, 0, -3.1, 0, () => { table(2, 0.92, 0.75, oak); box(-0.46, 0.81, 0, 0.4, 0.03, 0.28, cream); orb(0.42, 0.84, 0.05, 0.1, 0.12, 0.1, brass); });
    at(0, 0, -2.1, Math.PI, () => chair(sage));
    for (const x of [-3.6, 3.6]) { box(x, 1.1, -3.3, 1.8, 2.2, 0.32, walnut, 0.02); for (let i = 0; i < 4; i++) box(x, 0.4 + i * 0.52, -3.16, 1.7, 0.035, 0.26, oak, 0.01); }
  });
  box(12.5, 3.617, -11.4, 4.8, 0.028, 3.2, rugMat, 0.01);
  // Upstairs dressing room (moved here with the guest swap): wardrobe runs, an
  // island and a full-height mirror, now in the band south of the guest room.
  at(-18.6, 3.6, -4.5, 0, () => {
    at(0, 0, -4.05, 0, () => { box(0, 1.25, 0, 8.4, 2.5, 0.5, walnut, 0.02); for (let i = 0; i < 6; i++) box(-3.5 + i * 1.4, 1.25, 0.26, 0.03, 2.4, 0.03, brass, 0.004); });
    at(-5.32, 0, 0.4, 0, () => box(0, 1.25, 0, 0.5, 2.5, 5.6, walnut, 0.02));
    at(0, 0, 0.6, 0, () => { box(0, 0.52, 0, 2.4, 0.9, 1.1, oak, 0.05); box(0, 0.99, 0, 2.5, 0.06, 1.2, stone, 0.03); });
    at(3.4, 0, 1.1, 0, () => { box(0, 0.9, 0, 0.08, 1.8, 1.2, steel, 0.01); box(0, 0.95, 0.07, 0.05, 1.7, 1.1, white, 0.01); });
    plant(4.4, 0, -3.6, 1.2);
  });
  // Upstairs ensuite (moved with the same swap): double vanity, small bath, a
  // glass-front shower and a mirror on the gallery wall.
  at(-8.6, 3.6, -4.5, 0, () => {
    at(0, 0, -3.6, 0, () => { box(0, 0.42, 0, 4.2, 0.84, 0.62, white, 0.05); box(0, 0.87, 0, 4.3, 0.06, 0.68, stone, 0.03); box(1.2, 0.95, 0, 0.5, 0.08, 0.4, steel, 0.03); });
    at(-3.4, 0, 2.6, Math.PI / 2, () => { box(0, 0.26, 0, 1.7, 0.52, 0.8, white, 0.06); box(0, 0.56, 0, 1.6, 0.08, 0.72, stone, 0.04); });
    at(2.8, 0, 2.4, 0, () => { box(0, 1.1, 0, 1.1, 2.2, 1.1, white, 0.05); box(0, 0.95, 0.58, 0.92, 1.9, 0.06, steel, 0.01); });
    at(4.1, 0, -1.4, 0, () => box(0, 0.9, 0, 0.5, 1.8, 0.04, steel, 0.01));
    plant(-3.8, 0, -3.4, 1);
  });
  // The lounge's old indoor fountain went with the rest of the east lounge's
  // furniture when that hall was cleared for now.
  // Ground-floor home cinema in the north-east band: a 5.2 m screen over a real
  // AV rack, tower L/R + surround speakers with acoustic panels, and a tiered
  // leather row — a three-seat sofa, a double loveseat and a single recliner.
  const avGlow = mat('#8fb8c9', .3); avGlow.emissive.set('#6fb3c9'); avGlow.emissiveIntensity = .8;
  const acoustic = mat('#3a3f3c', .95);
  at(22.6, 0, -13.6, 0, () => {
    at(0, 0, -4, 0, () => { box(0, 1.3, 0, 5.6, 2.6, 0.24, dark, 0.02); box(0, 1.35, 0.14, 5.2, 2.2, 0.05, white, 0.02); });
    // AV rack under the screen: centre channel on a walnut console, a receiver
    // with a glow display, a source deck and a vinyl nook.
    at(0, 0, -3.9, 0, () => {
      box(0, 0.36, 0, 3.2, 0.72, 0.52, walnut, 0.03);
      box(0, 0.735, 0, 3.26, 0.03, 0.56, dark, 0.02);
      box(0, 0.96, -0.04, 1.3, 0.32, 0.32, dark, 0.03);
      for (let i = 0; i < 3; i++) cyl(-0.26 + i * 0.26, 0.96, 0.13, 0.052, 0.052, 0.02, steel, Math.PI / 2);
      box(-1.02, 0.52, 0.05, 0.9, 0.17, 0.36, black, 0.02);
      box(-1.02, 0.525, 0.235, 0.74, 0.08, 0.012, avGlow, 0.004);
      for (const x of [-1.3, -0.74]) cyl(x, 0.635, 0.24, 0.032, 0.032, 0.014, steel, Math.PI / 2);
      box(-1.02, 0.26, 0.05, 0.9, 0.15, 0.36, black, 0.02);
      box(0.95, 0.5, 0.02, 1.05, 0.32, 0.36, dark, 0.02);
      hit(0, 0, -0.1, 3.3, 1.1, 0.75);
    });
    for (const side of [-1, 1]) {
      // Tower speakers: three real drivers plus a tweeter on a plinth.
      at(side * 3.5, 0, -3.95, 0, () => {
        box(0, 0.56, 0, 0.44, 1.12, 0.4, dark, 0.03);
        for (const [y, r] of [[0.34, 0.125], [0.63, 0.105], [0.87, 0.065]]) { cyl(0, y, 0.21, r, r, 0.02, black, Math.PI / 2); cyl(0, y, 0.222, r * 0.55, r * 0.55, 0.008, steel, Math.PI / 2); }
        box(0, 0.045, 0, 0.4, 0.09, 0.36, steel, 0.012);
        hit(0, 0, 0, 0.5, 1.15, 0.46);
      });
      // Surround speakers high on the side walls, angled toward the row, over
      // fabric acoustic panels.
      at(side * 5.42, 2.0, -0.6, side > 0 ? -0.6 : 0.6, () => box(0, 0, 0, 0.24, 0.4, 0.3, dark, 0.02));
      for (let i = 0; i < 4; i++) box(side * 5.54, 1.5, -3.2 + i * 1.8, 0.07, 1.5, 1.1, acoustic, 0.02);
    }
    // Tiered leather seating, all three seats registered as sittable.
    at(0, 0, 0.7, 0, () => sofa(2.6, terra, false, 'sofa-cinema-three'));
    at(3.3, 0, 1.0, 0.55, () => sofa(1.9, terra, false, 'sofa-cinema-double'));
    at(-3.3, 0, 1.0, -0.55, () => {
      // Plush recliner: deep seat, angled backrest, winged headrest, arms.
      box(0, 0.28, 0, 1.06, 0.3, 1.0, terra, 0.08);
      box(0, 0.47, 0.06, 0.94, 0.17, 0.8, terra, 0.07);
      box(0, 0.8, -0.4, 1.0, 0.74, 0.28, terra, 0.09);
      box(0, 1.22, -0.5, 0.62, 0.3, 0.22, terra, 0.08);
      box(-0.55, 0.56, -0.02, 0.2, 0.62, 0.9, terra, 0.07);
      box(0.55, 0.56, -0.02, 0.2, 0.62, 0.9, terra, 0.07);
      hit(0, 0, 0, 1.3, 1.35, 1.1, 'chair-cinema-single');
      seatMarker('chair-cinema-single', 1.06, 1.0);
    });
    box(0, 0.02, 2.6, 6.6, 0.03, 3.4, rugMat, 0.01);
    // Powered subwoofer in the east corner with a bass port and glow LED.
    at(4.6, 0, -2.2, 0, () => { box(0, 0.31, 0, 0.52, 0.62, 0.5, black, 0.03); cyl(0, 0.3, 0.26, 0.14, 0.14, 0.02, steel, Math.PI / 2); box(0.2, 0.5, 0.252, 0.06, 0.02, 0.01, avGlow, 0.003); hit(0, 0, 0, 0.56, 0.62, 0.54); });
  });
  at(26.6, 0, -10.2, 0, () => lamp(true));
  // Upstairs massage room (was the play & hobby room — its mattress is gone):
  // a padded massage table with a face cradle, a warm-towel shelf, oil and
  // stone bowls, soft lighting and a bench for robes.
  at(22.6, 3.6, -13.6, 0, () => {
    at(0, 0, -0.6, 0, () => {
      for (const [x, z] of [[-0.72, -0.8], [0.72, -0.8], [-0.72, 0.8], [0.72, 0.8]]) cyl(x, 0.35, z, 0.05, 0.065, 0.7, walnut);
      box(0, 0.76, 0, 1.86, 0.1, 1.98, walnut, 0.03);
      box(0, 0.9, 0, 2, 0.16, 2.14, cream, 0.07);
      box(0, 1, 0.78, 0.94, 0.12, 0.42, cream, 0.06);
      box(0, 0.99, -0.88, 0.64, 0.12, 0.3, sage, 0.06);
      box(0.55, 1.01, -0.1, 0.4, 0.07, 0.28, walnut, 0.02);
      for (let i = 0; i < 3; i++) orb(0.45 + i * 0.11, 1.08, -0.1, 0.045, 0.038, 0.045, stone);
      hit(0, 0, 0, 2.1, 1.1, 2.24);
    });
    at(-4.1, 0, -3.8, 0, () => {
      for (let i = 0; i < 3; i++) box(0, 0.42 + i * 0.58, 0, 1.7, 0.05, 0.44, oak);
      box(-0.45, 0.6, 0, 0.52, 0.17, 0.38, linen, 0.05); box(0.4, 1.18, 0, 0.52, 0.17, 0.38, sage, 0.05); box(-0.25, 1.78, 0, 0.6, 0.15, 0.38, linen, 0.05);
      box(0.55, 0.62, 0, 0.18, 0.12, 0.18, brass, 0.02); box(0.55, 1.2, 0, 0.18, 0.12, 0.18, brass, 0.02);
      hit(0, 0, 0, 1.8, 1.9, 0.5);
    });
    at(3.9, 0, -3.9, 0, () => { box(0, 0.3, 0, 1.3, 0.44, 0.5, oak, 0.05); box(0, 0.56, 0, 1.36, 0.09, 0.56, cream, 0.05); hit(0, 0, 0, 1.4, 0.65, 0.6); });
    at(4.1, 0, 1.9, 0, () => lamp()); plant(-4.3, 0, 1.8, 1.25); plant(4.3, 0, 3.9, 1.1);
    at(-2.1, 0, 2.6, 0.3, () => { box(0, 0.26, 0, 0.5, 0.52, 0.5, walnut, 0.05); box(0, 0.55, 0, 0.56, 0.06, 0.56, stone, 0.04); orb(0, 0.62, 0, 0.1, 0.06, 0.1, water); hit(0, 0, 0, 0.6, 0.65, 0.6); });
  });
  box(22.6, 3.617, -11.6, 5.2, 0.028, 4, rugMat, 0.01);
  at(19.4, 3.6, -10.4, 0, () => lamp(true)); plant(26.8, 3.6, -16.6, 1.3);
  // Upstairs guest suite: sofa, low table and a reading corner.
  at(24.6, 3.6, 6.9, 0, () => sofa(3.2, linen, false, 'sofa-east-suite'));
  at(24.6, 3.6, 4.4, 0, () => { table(1.5, 0.9, 0.42, walnut); tea(0.34, 0.43, 0); plant(-0.35, 0.43, 0, 0.42, true); });
  box(24.6, 3.617, 5.6, 5, 0.028, 4, rugMat, 0.01);
  at(27.2, 3.6, -4.6, 0, () => lamp(true)); plant(18.6, 3.6, -16.6, 1.45);
  const bedroom = createVillaBedroom(root); colliders.push(...bedroom.colliders);
  const bathDoorModel = createVillaBathDoorModel(root);
  at(-5.2, 3.6, 8, 0, () => sofa(1.25, sage, false, 'sofa-master')); at(-4.45, 3.6, 6.75, 0, () => lamp(true)); at(-5.4, 3.6, 4.7, 0, () => { table(0.7, 0.7, 0.48); tea(0, 0.49, 0); }); artwork(-4.25, 5.65, 5.1, 2.1, 1.2, -Math.PI / 2);
  // Soft gathered linen curtains flank the glazing without blocking the balcony door.
  for (const x of [-11.05, -8.97, -5.72, -2.8]) {
    for (let i = 0; i < 4; i++) cyl(x + (i - 1.5) * 0.075, 5.13, 8.72, 0.055, 0.065, 2.77, linen);
  }
  bed(VILLA_BEDS[1]);
  // Guest bedroom, now the whole north strip after the swap: bedside reading
  // table, chair and a bookcase against the north wall.
  at(-5.4, 3.6, -14.75, 0, () => { table(1.75, 0.75); books(-0.75, 0.77, -0.08, 4); at(0.62, 0.77, -0.05, 0, () => lamp()); box(0, 0.775, 0.1, 0.55, 0.013, 0.33, cream, 0); });
  at(-5.3, 3.6, -13.2, 0, () => chair(sage, 'chair-guest')); at(-9.8, 3.6, -17.55, 0, () => shelf(2.4)); plant(-5.2, 3.6, -16.4, 1.1);
  // Reading hall (阅读厅): every element of the old family room moved here after
  // its walls came down. North half is the library, south half the lounge.
  at(20.5, 3.6, -8.62, 0, () => shelf(1.9)); at(24.7, 3.6, -8.62, 0, () => shelf(2.8));
  at(17.68, 3.6, -1.1, -Math.PI / 2, () => shelf(2.2)); at(17.68, 3.6, 2.2, -Math.PI / 2, () => shelf(2.2));
  at(20.8, 3.6, -4.6, 0, () => { table(1.75, 0.8, 0.46); tea(0.28, 0.47, 0); books(-0.4, 0.47, 0, 3); }); box(21, 3.617, -4.6, 4.2, 0.028, 3, rugMat, 0);
  at(18.6, 3.6, -4.6, -Math.PI / 2, () => sofa(1.4, linen, false, 'sofa-library-west'));
  at(23.1, 3.6, -4.6, Math.PI / 2, () => sofa(1.5, terra, false, 'sofa-library-east'));
  plant(18.2, 3.6, -8.1, 1.55); at(18.9, 3.6, -6.9, 0, () => lamp(true)); plant(26.9, 3.6, -8.1, 1.4);
  // South lounge corner: the original guest-suite sofa plus the moved bay sofa.
  at(20.2, 3.6, 6.4, 0.5, () => sofa(1.3, linen, false, 'sofa-library-bay'));
  at(20.4, 3.6, 3.2, 0, () => { table(1.15, 0.75, 0.46); tea(0.3, 0.47, 0); books(-0.36, 0.47, 0, 3); });
  box(21, 3.617, 5, 3.4, 0.028, 3, rugMat, 0);
  plant(18, 3.6, 8.1, 1.4); at(19.2, 3.6, 1.6, 0, () => lamp(true));

  // Bathroom: the tub grew 50 % in both plan dimensions and a walk-in shower
  // with frosted panels fills the north-east corner.
  const frosted = mat('#cfe4e8', .12); frosted.transparent = true; frosted.opacity = .32; frosted.roughness = .3; frosted.depthWrite = false;
  at(11.4, 3.6, -4.4, 0, () => {
    box(0, 0.17, 0, 2.4, 0.34, 4.35, white, 0.16);
    for (const x of [-1.05, 1.05]) box(x, 0.44, 0, 0.3, 0.6, 4.2, white, 0.09);
    for (const z of [-2.02, 2.02]) box(0, 0.44, z, 2.1, 0.6, 0.3, white, 0.09);
    box(0, 0.24, 0, 1.98, 0.04, 3.65, water, 0.02);
    cyl(0.9, 0.88, -1.68, 0.025, 0.025, 0.6, brass);
    cyl(0.645, 1.17, -1.68, 0.025, 0.025, 0.51, brass, 0, Math.PI / 2);
    box(0, 0.77, 0.9, 2.2, 0.055, 0.34, oak); tea(0.3, 0.8, 0.9);
    hit(0, 0, 0, 2.45, 0.8, 4.4);
  });
  // Walk-in shower: tiled tray, two frosted panels with chrome stabilizers, a
  // rain head on a wall arm and a linear drain. Entry gaps face the door.
  at(15.85, 3.6, -7.85, 0, () => {
    box(0, 0.06, 0, 1.9, 0.12, 1.9, stone, 0.02);
    cyl(0, 0.14, 0, 0.07, 0.07, 0.02, steel);
    box(-0.925, 1.2, 0, 0.05, 2.15, 1.9, frosted, 0.02);
    box(-0.925, 2.32, 0, 0.07, 0.05, 1.95, steel);
    box(-0.475, 1.2, 0.925, 0.95, 2.15, 0.05, frosted, 0.02);
    box(-0.475, 2.32, 0.925, 1.0, 0.05, 0.07, steel);
    hit(-0.925, 0, 0, 0.1, 2.4, 1.9);
    hit(-0.475, 0, 0.925, 0.95, 2.4, 0.1);
  });
  cyl(16.62, 2.06, -7.85, 0.022, 0.022, 0.5, steel, 0, Math.PI / 2);
  cyl(16.38, 2.28, -7.85, 0.14, 0.14, 0.025, steel);
  for (let i = 0; i < 4; i++) cyl(16.38, 2.24, -7.85, 0.004, 0.004, 0.05, steel);
  at(14.2, 3.6, -1.65, -Math.PI / 2, () => {
    box(0, 0.42, 0, 1.9, 0.84, 0.85, oak); box(0, 0.89, 0, 2, 0.1, 0.94, white); cyl(0, 1.015, 0, 0.31, 0.23, 0.2, white); cyl(0, 1.12, 0, 0.24, 0.24, 0.007, stone); cyl(0, 1.13, -0.32, 0.022, 0.022, 0.42, brass); cyl(0, 1.34, -0.22, 0.022, 0.022, 0.2, brass, Math.PI / 2);
    box(0, 1.96, -0.39, 1.48, 1.38, 0.05, brass); box(0, 1.96, -0.355, 1.37, 1.27, 0.018, steel, 0.01);
    for (let i = 0; i < 3; i++) cyl(-0.7, 1 + i * 0.105, 0.06, 0.06, 0.06, 0.3, linen, Math.PI / 2); hit(0, 0, 0, 2, 0.97, 0.94);
  });
  at(9.4, 3.6, -8.08, 0, () => {
    box(0, 0.47, 0, 1.1, 0.94, 1, white); cyl(0, 0.44, 0.516, 0.34, 0.34, 0.05, steel, Math.PI / 2); cyl(0, 0.44, 0.548, 0.26, 0.26, 0.025, black, Math.PI / 2); box(0, 1.01, 0, 1.22, 0.09, 1.08, oak); for (let i = 0; i < 3; i++) box(0.1, 1.1 + i * 0.09, 0, 0.64, 0.085, 0.5, i % 2 ? sage : linen, 0.03); hit(0, 0, 0, 1.22, 1.06, 1.1);
  });

  // Roof terrace leaves the stair opening completely vacant.
  at(-7, 7.2, 5.5, 0, () => sofa(4.15, sage, true, 'sofa-roof')); at(-7, 7.2, 3.4, 0, () => { table(1.85, 1.05, 0.43); tea(0.5, 0.44, 0); plant(-0.3, 0.44, 0, 0.45, true); }); box(-7, 7.217, 4.3, 5.8, 0.028, 4.4, rugMat, 0);
  at(-6, 7.2, -4.5, 0, () => {
    cyl(0, 0.36, 0, 0.07, 0.07, 0.72, black); cyl(0, 0.04, 0, 0.48, 0.48, 0.08, black); cyl(0, 0.77, 0, 0.88, 0.88, 0.1, oak); hit(0, 0, 0, 1.76, 0.83, 1.76); plant(0, 0.83, 0, 0.42, true);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; at(Math.sin(a) * 1.3, 0, Math.cos(a) * 1.3, a, () => chair(sage, `chair-roof-${i + 1}`)); }
  });
  // Three BBQ grills beside the east roof lounge, each with a hinged lid that
  // opens and closes (grill hotspots toggle them individually).
  const grillLids: THREE.Group[] = [];
  const buildGrill = (x: number, z: number) => {
    at(x, 7.2, z, 0, () => {
      legs(1.65, 0.85, 0.77, black, 0.045);
      box(0, 0.63, 0, 1.5, 0.45, 0.78, black, 0.06);
      box(0, 0.885, 0, 1.56, 0.05, 0.84, steel, 0.03);
      for (let i = 0; i < 5; i++) cyl(-0.6 + i * 0.3, 0.915, 0, 0.012, 0.012, 0.8, steel, 0, Math.PI / 2);
      for (const sx of [-1.06, 1.06]) box(sx, 0.86, 0, 0.5, 0.07, 0.76, oak);
      hit(0, 0, 0, 2.62, 1.27, 0.93);
    });
    // Lid pivot sits on the hinge line at the grill's back edge.
    const lidPivot = new THREE.Group();
    lidPivot.position.set(x, 8.13, z - 0.42);
    lidPivot.userData = { animated: true, progress: 0 };
    root.add(lidPivot);
    const lid = new VillaModelBuilder(lidPivot, 'grill-lid');
    lid.at(0, 0, 0, 0, () => {
      lid.box(0, 0.05, 0.42, 1.56, 0.1, 0.8, steel, 0.04);
      lid.box(0, 0.13, 0.42, 1.38, 0.09, 0.68, steel, 0.06);
      lid.box(0, 0.21, 0.74, 0.67, 0.035, 0.05, black);
      cyl(0, 0.16, 0.32, 0.045, 0.045, 0.02, black, Math.PI / 2);
    });
    lid.finish();
    grillLids.push(lidPivot);
  };
  buildGrill(10.4, -6.4); buildGrill(13.4, -6.4); buildGrill(11.9, -9.2);
  // East roof lounge: the table sits against the south parapet so the walking
  // route from the pavilion to the lounge stays open.
  at(14.4, 7.2, 4.3, 0, () => {
    table(1.5, 0.95, 0.43); tea(0.4, 0.44, 0); tea(-0.4, 0.44, 0); plant(0, 0.44, 0.18, 0.38, true);
    at(0, 0, -1.45, 0, () => chair(sage, 'chair-roof-east-1'));
    at(0, 0, 1.45, Math.PI, () => chair(sage, 'chair-roof-east-2'));
  });
  box(14, 7.217, 7.4, 3.4, 0.028, 2.8, rugMat, 0);
  for (const [x, z] of [[-10.8, 7.9], [-3, 7.9], [10.7, 7.9], [10.7, -8], [-10.6, -7.9], [-3, -7.9]]) plant(x, 7.2, z, 1.3, true);

  // Workbench and its tool board, in the garage's north strip beside the
  // estate's rear bench: a workshop bench belongs in the workshop, never on the
  // snooker lounge's wall. The hollow, opening-door sedan lives in villaVehicle.
  at(34.6, 0, -11.24, 0, () => {
    table(4.3, 0.91, 0.91); box(0, 1.74, -0.32, 4.15, 1.17, 0.075, walnut);
    for (let i = 0; i < 10; i++) { const x = -1.8 + i * 0.39; box(x, 1.73 + (i % 3) * 0.08, -0.25, 0.045, 0.4, 0.06, steel); if (i % 2) box(x, 1.95 + (i % 3) * 0.08, -0.25, 0.2, 0.09, 0.085, steel); else box(x, 1.53, -0.25, 0.085, 0.14, 0.09, terra); }
    box(-1.3, 1.08, 0, 0.6, 0.33, 0.4, terra); box(-1.3, 1.28, 0, 0.25, 0.05, 0.05, black); box(1.25, 1.03, 0, 0.48, 0.24, 0.3, steel);
  });
  at(19.3, 0, -5.6, -Math.PI / 2, () => {
    for (const x of [-0.85, 0.85]) box(x, 1.2, 0, 0.06, 2.4, 0.58, steel);
    for (let level = 0; level < 4; level++) { box(0, 0.2 + level * 0.64, 0, 1.7, 0.06, 0.6, steel); for (const x of [-0.43, 0.43]) { box(x, 0.42 + level * 0.64, 0, 0.72, 0.37, 0.48, level % 2 ? sage : oak); box(x, 0.44 + level * 0.64, 0.247, 0.2, 0.065, 0.01, cream, 0); } } hit(0, 0, 0, 1.8, 2.4, 0.64);
  });

  // Both loungers face -Z across the widened west pool from its dry south deck.
  for (const id of ['lounger-west', 'lounger-east']) {
    const seat = villaRelaxSeat(id)!;
    at(seat.seat.x, 0, seat.origin.z, seat.yaw, () => {
      legs(0.94, 2.42, 0.28); box(0, 0.32, 0, 0.91, 0.14, 2.32, oak);
      for (let i = 0; i < 12; i++) box(0, 0.42, -1.05 + i * 0.18, 0.87, 0.06, 0.135, linen, 0.02);
      put(new RoundedBoxGeometry(0.9, 0.12, 0.86, 2, 0.035), linen, 0, 0.64, 0.9, -0.55); box(0, 0.86, 1.1, 0.65, 0.16, 0.34, sage, 0.07); hit(0, 0, 0, 0.97, 1, 2.7, id);
      seatMarker(id, 0.97, 2.7);
    });
  }
  at(-18.45, 0, 11.5, 0, () => {
    cyl(0, 0.065, 0, 0.42, 0.48, 0.13, stone); cyl(0, 1.3, 0, 0.037, 0.037, 2.6, walnut); put(new THREE.ConeGeometry(1.65, 0.53, 10, 1, true), linen, 0, 2.63, 0);
    for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5; rod(new THREE.Vector3(0, 2.895, 0), new THREE.Vector3(Math.cos(a) * 1.65, 2.365, Math.sin(a) * 1.65), 0.014, oak); }
    hit(0, 0, 0, 0.96, 0.13, 0.96); hit(0, 0.13, 0, 0.074, 2.5, 0.074);
  });
  for (const x of [-3, 3]) { plant(x, 0, 10.3, 1.25, true); hit(x, 0, 10.3, 0.6, 0.48, 0.6); }
  // The same ten perimeter tree sites are now planted by villaGarden.
  // West pool hedge: a row fully outside the facade, never straddling the west
  // glazing, which used to leave green orbs growing through the window frames.
  for (let i = 0; i < 28; i++) orb(i < 14 ? VILLA_WEST_WALL.outer - .55 : VILLA_ESTATE_BOUNDS.maxX - 1.15, 0.49, -12 + (i % 14) * 2.45, i < 14 ? .5 : .72, 0.55 + random() * 0.25, .82, i % 3 ? leaf : leafLight);
  for (const [x, z] of [[-9, 11], [-10.5, 16], [7, 11], [8.5, 18], [-22.6, 11.5]]) { plant(x, 0, z, 1, true); plant(x + 0.8, 0, z + 0.3, 0.65, true); }
  hit(-22.6, 0, 11.5, .5, .39, .5); hit(-21.8, 0, 11.8, .325, .2535, .325);
  // These two existing pots share the pets' lawn: preserve their solid footprints.
  hit(-10.5, 0, 16, .5, .39, .5); hit(-9.7, 0, 16.3, .325, .2535, .325);

  // Static geometry is merged per material, not per chair/slat/book/leaf.
  let staticVertices = 0;
  for (const [material, parts] of batches) {
    const geometry = mergeGeometries(parts, false); for (const part of parts) part.dispose();
    if (!geometry) continue; geometry.computeBoundingSphere(); staticVertices += geometry.getAttribute('position').count;
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
    const dt = Math.max(0, t - previousTime); previousTime = t;
    aquariumLife.update(t, dt, feeding);
    const shadowChanged = bedroom.update(state.wardrobes, state.roomLights?.master !== false)
      || fridge.update(state.wardrobes);
    if (state.bathDoors) bathDoorModel.update(state.bathDoors);
    // The robot vacuum loops the hall; the LiDAR turret keeps spinning.
    const va = t * 0.22;
    vacuum.position.set(4.4 + Math.sin(va) * 0.85, 0, -10.3 + Math.cos(va) * 0.85);
    vacuum.rotation.y = Math.atan2(Math.cos(va), -Math.sin(va));
    if (vacuumLidar) vacuumLidar.rotation.y = t * 5;
    // Grill lids ease toward their open/closed targets.
    for (let i = 0; i < grillLids.length; i++) {
      const target = state.grillLids?.[i] ? 1 : 0;
      const current = grillLids[i].userData.progress as number;
      const next = current + Math.sign(target - current) * Math.min(Math.abs(target - current), dt / 0.7);
      grillLids[i].userData.progress = next;
      grillLids[i].rotation.x = -1.25 * next;
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
