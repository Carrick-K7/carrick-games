import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { VillaCollider } from './villaWorld.js';

export interface VillaFurnishingState {
  evening: boolean;
  fireplace: boolean;
  gaming: boolean;
  /** Expiry uses the same elapsed-seconds clock as update(). */
  fedUntil: number;
}

/** Procedural, scene-owned furnishings. The host disposes geometry/material/maps by traversal. */
export function furnishVilla(scene: THREE.Scene): {
  colliders: VillaCollider[];
  update(time: number, state: VillaFurnishingState): void;
} {
  const root = new THREE.Group();
  root.name = 'Villa furnishings · oak, linen & terracotta';
  scene.add(root);
  const colliders: VillaCollider[] = [];
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  let frame = new THREE.Matrix4();
  let seed = 8147;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  function texture(kind: 'oak' | 'linen' | 'rug' | 'art' | 'screen') {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const c = canvas.getContext('2d')!;
    c.fillStyle = kind === 'oak' ? '#b58b60' : kind === 'linen' ? '#e9dfca' : kind === 'rug' ? '#b39b7e' : kind === 'art' ? '#efe4cf' : '#101c31'; c.fillRect(0, 0, 256, 256);
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
    } else {
      const g = c.createLinearGradient(0, 0, 256, 256); g.addColorStop(0, '#173e5f'); g.addColorStop(0.5, '#33516d'); g.addColorStop(1, '#873f79'); c.fillStyle = g; c.fillRect(0, 0, 256, 256);
      c.strokeStyle = '#82f0dc'; c.lineWidth = 2;
      for (let i = 0; i < 7; i++) { c.beginPath(); c.moveTo(0, 175 + i * 12); c.lineTo(128, 72 + i * 8); c.lineTo(256, 175 + i * 12); c.stroke(); }
      c.fillStyle = '#f1f4ed'; c.font = '15px sans-serif'; c.fillText('AFTER HOURS', 21, 35); c.fillStyle = '#ffffff55'; c.fillRect(20, 43, 65, 2); c.fillRect(14, 238, 228, 6);
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
  const screenMat = mat('#ffffff', 0.25); screenMat.map = texture('screen'); screenMat.emissiveMap = screenMat.map; screenMat.emissive.set('#ffffff'); screenMat.emissiveIntensity = 0.6;
  const rgb = mat('#64b7d6', 0.3, 0.25); rgb.emissive.set('#4885ca'); rgb.emissiveIntensity = 1.2;
  function at(x: number, y: number, z: number, yaw: number, build: () => void) {
    const saved = frame; frame = frame.clone().multiply(new THREE.Matrix4().makeTranslation(x, y, z)).multiply(new THREE.Matrix4().makeRotationY(yaw)); build(); frame = saved;
  }
  function put(geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
    const transform = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
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
  function hit(x: number, y: number, z: number, w: number, h: number, d: number) {
    const b = new THREE.Box3(new THREE.Vector3(x - w / 2, y, z - d / 2), new THREE.Vector3(x + w / 2, y + h, z + d / 2)).applyMatrix4(frame);
    colliders.push({ minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z, minY: b.min.y, maxY: b.max.y });
  }
  function legs(w: number, d: number, h: number, material = walnut, radius = 0.055) {
    for (const x of [-w / 2 + 0.13, w / 2 - 0.13]) for (const z of [-d / 2 + 0.13, d / 2 - 0.13]) cyl(x, h / 2, z, radius * 0.8, radius, h, material);
  }
  function table(w: number, d: number, h = 0.76, material = oak) { legs(w, d, h - 0.09); box(0, h - 0.05, 0, w, 0.1, d, material, 0.05); hit(0, 0, 0, w, h, d); }
  function chair(material = sage) {
    legs(0.6, 0.62, 0.46); box(0, 0.47, 0, 0.62, 0.13, 0.64, material, 0.06); box(0, 0.78, 0.27, 0.61, 0.63, 0.12, material, 0.07); hit(0, 0, 0, 0.65, 1.1, 0.68);
  }
  function cushion(x: number, y: number, z: number, material: THREE.Material, yaw = 0) {
    at(x, y, z, yaw, () => { box(0, 0, 0, 0.55, 0.52, 0.22, material, 0.1); box(0, 0, 0.117, 0.45, 0.42, 0.012, material, 0.045); });
  }
  function sofa(w = 3.4, material = linen, chaise = false) {
    legs(w, 1.2, 0.2); box(0, 0.32, 0, w, 0.37, 1.26, material, 0.12); box(0, 0.85, 0.5, w, 0.82, 0.28, material, 0.11);
    for (const x of [-w / 2 + 0.13, w / 2 - 0.13]) box(x, 0.62, 0, 0.28, 0.65, 1.3, material, 0.11);
    const n = Math.max(1, Math.round(w / 1.1));
    for (let i = 0; i < n; i++) { const x = -w / 2 + 0.3 + (i + 0.5) * (w - 0.6) / n; box(x, 0.56, -0.1, (w - 0.63) / n, 0.23, 0.98, material, 0.075); box(x, 0.92, 0.31, (w - 0.65) / n, 0.55, 0.22, material, 0.09); }
    cushion(-w / 2 + 0.65, 0.86, 0.12, terra, 0.14); if (w > 1.6) cushion(w / 2 - 0.65, 0.86, 0.11, sage, -0.17); hit(0, 0, 0, w, 1.26, 1.3);
    if (chaise) { box(-w / 2 + 0.63, 0.36, -1.05, 1.24, 0.48, 1.4, material, 0.13); box(-w / 2 + 0.63, 0.61, -1.03, 1.17, 0.15, 1.33, material, 0.07); hit(-w / 2 + 0.63, 0, -1.05, 1.24, 0.7, 1.4); }
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
  function bed(x: number, floor: number, z: number, yaw: number, w = 2.55) {
    at(x, floor, z, yaw, () => {
      legs(w, 3.7, 0.22); box(0, 0.34, 0, w + 0.13, 0.35, 3.75, oak, 0.1); box(0, 0.62, 0, w, 0.37, 3.55, linen, 0.13); box(0, 0.96, 1.87, w + 0.32, 1.65, 0.2, sage, 0.12);
      for (let i = 0; i < 7; i++) box(-w / 2 + i * w / 6, 1.06, 1.749, 0.018, 1.34, 0.02, linen, 0.008);
      box(0, 0.83, -0.58, w + 0.05, 0.14, 2.32, cream, 0.06); box(0, 0.925, -1, w + 0.07, 0.075, 0.8, terra, 0.025);
      for (const px of [-w / 4, w / 4]) { box(px, 0.93, 1.14, w / 2 - 0.14, 0.22, 0.65, linen, 0.1); box(px, 1.06, 1.45, w / 2 - 0.19, 0.27, 0.53, cream, 0.11); }
      hit(0, 0, 0, w + 0.15, 0.98, 3.8);
      for (const side of [-1, 1]) at(side * (w / 2 + 0.55), 0, 1.27, 0, () => {
        box(0, 0.3, 0, 0.72, 0.6, 0.65, oak, 0.045); box(0, 0.42, -0.335, 0.59, 0.23, 0.025, cream); cyl(0, 0.43, -0.36, 0.023, 0.023, 0.04, brass, Math.PI / 2); at(0, 0.61, 0, 0, () => lamp()); hit(0, 0, 0, 0.72, 0.6, 0.65);
      });
    });
  }

  // Living room. The chaise is on the west, preserving the route to the aquarium.
  at(-8, 0, 5.8, 0, () => sofa(4.2, linen, true)); box(-8, 0.018, 3.9, 6.1, 0.028, 4.15, rugMat, 0.01);
  at(-7.6, 0, 3.55, 0, () => { table(2.2, 1.25, 0.44, walnut); box(-0.45, 0.49, 0.06, 0.55, 0.08, 0.42, sage); box(-0.42, 0.545, 0.02, 0.47, 0.04, 0.35, cream); tea(0.6, 0.45, 0.13); plant(0.05, 0.45, -0.25, 0.46, true); });
  at(-10.8, 0, 6.8, 0, () => lamp(true)); plant(-3, 0, 7.9, 1.45);
  // A tiny sleeping cat, not a collider.
  orb(-7.1, 0.84, 5.56, 0.32, 0.16, 0.24, coral); orb(-6.88, 0.89, 5.43, 0.14, 0.13, 0.13, coral);
  put(new THREE.ConeGeometry(0.063, 0.13, 4), coral, -6.96, 1.025, 5.43); put(new THREE.ConeGeometry(0.063, 0.13, 4), coral, -6.82, 1.025, 5.43); put(new THREE.TorusGeometry(0.23, 0.055, 6, 14, Math.PI * 1.5), coral, -7.17, 0.86, 5.51, Math.PI / 2);
  // A full chimney breast supports the mantel and artwork between living/dining.
  box(-10, 1.7, -0.1, 2.5, 3.4, 0.42, cream, 0);
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
  at(-3.5, 0, 0.6, 0, () => {
    box(0, 0.325, 0, 3.4, 0.65, 1, walnut, 0.06);
    for (const x of [-1.1, 0, 1.1]) { box(x, 0.34, 0.514, 1.055, 0.5, 0.026, oak); box(x + 0.36, 0.43, 0.539, 0.11, 0.025, 0.025, brass); }
    box(0, 0.69, 0, 3.43, 0.09, 1.03, black); box(0, 2.135, 0, 3.43, 0.07, 1.03, black); box(0, 0.77, 0, 3.24, 0.09, 0.89, stone);
    for (const x of [-1.66, 1.66]) box(x, 1.425, 0, 0.025, 1.4, 0.98, glass, 0);
    for (const z of [-0.48, 0.48]) box(0, 1.425, z, 3.34, 1.4, 0.015, glass, 0);
    box(0, 2.035, 0, 3.28, 0.012, 0.94, water, 0);
    for (let i = 0; i < 48; i++) orb((random() - 0.5) * 3.15, 0.83, (random() - 0.5) * 0.83, 0.025 + random() * 0.035, 0.025, 0.032, i % 2 ? cream : stone);
    for (const x of [-1.28, 0.5, 1.22]) {
      orb(x, 0.91, -0.12, 0.18, 0.17, 0.17, stone);
      for (let i = 0; i < 5; i++) { const px = x + (i - 2) * 0.095, h = 0.3 + random() * 0.57; rod(new THREE.Vector3(px, 0.8, -0.22), new THREE.Vector3(px + 0.08, 0.8 + h, -0.2), 0.014, leaf); orb(px + 0.06, 0.86 + h * 0.66, -0.2, 0.053, h * 0.45, 0.027, leafLight, -0.2); }
    }
    hit(0, 0, 0, 3.43, 2.17, 1.03);
  });
  const aquariumLight = new THREE.PointLight('#81ded9', 1.6, 4.5, 2); aquariumLight.position.set(-3.5, 1.8, 0.6); root.add(aquariumLight);
  const fish: THREE.Group[] = [], fishMaterials = ['#eaaa49', '#d77450', '#65b7bf', '#c4b8dc', '#e3d794'].map(c => mat(c, 0.35));
  for (let i = 0; i < 10; i++) {
    const f = new THREE.Group(); f.name = `Aquarium fish ${i + 1}`;
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 7), fishMaterials[i % 5]); body.scale.set(0.145, 0.078, 0.043); f.add(body);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.087, 0.12, 3), fishMaterials[i % 5]); tail.rotation.z = -Math.PI / 2; tail.scale.z = 0.36; tail.position.x = -0.17; f.add(tail);
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.085, 3), fishMaterials[i % 5]); fin.position.set(-0.02, 0.083, 0); fin.scale.z = 0.25; f.add(fin);
    for (const z of [-0.041, 0.041]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), black); eye.position.set(0.085, 0.02, z); f.add(eye); }
    f.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } }); f.scale.setScalar(0.73 + (i % 4) * 0.13); root.add(f); fish.push(f);
  }
  const bubbleMat = new THREE.MeshBasicMaterial({ color: '#c7f8f1', transparent: true, opacity: 0.38, depthWrite: false });
  const bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(0.018, 6, 5), bubbleMat, 18); bubbles.instanceMatrix.setUsage(THREE.DynamicDrawUsage); bubbles.frustumCulled = false; root.add(bubbles); const dummy = new THREE.Object3D();

  // Kitchen: framed sage fronts, stone counters and inset metal appliances.
  for (let i = 0; i < 6; i++) at(-10.55 + i * 1.22, 0, -8.15, 0, () => {
    box(0, 0.44, 0, 1.19, 0.88, 1, sage); box(0, 0.94, 0, 1.23, 0.1, 1.08, white); box(0, 0.47, 0.517, 1.04, 0.66, 0.032, oak); box(0, 0.47, 0.54, 0.91, 0.53, 0.026, sage); box(0, 0.72, 0.565, 0.28, 0.023, 0.033, brass);
    if (i !== 5) { box(0, 2.23, -0.13, 1.13, 0.86, 0.62, cream); box(0, 2.22, 0.195, 1.02, 0.73, 0.03, linen); box(0.34, 1.99, 0.23, 0.027, 0.2, 0.024, brass); }
    hit(0, 0, 0, 1.22, 0.99, 1.08);
  });
  at(-3.05, 0, -8.05, 0, () => {
    box(0, 1.12, 0, 1.12, 2.24, 1.12, steel, 0.08); box(0, 1.47, 0.58, 1.04, 1.37, 0.045, white); box(0, 0.38, 0.58, 1.04, 0.66, 0.045, white); box(-0.37, 1.43, 0.64, 0.035, 0.6, 0.06, steel); box(0, 0.64, 0.64, 0.57, 0.035, 0.05, steel); hit(0, 0, 0, 1.16, 2.25, 1.25);
  });
  box(-8.11, 0.51, -7.584, 0.96, 0.58, 0.035, black); box(-8.11, 0.49, -7.558, 0.78, 0.36, 0.022, steel); box(-8.11, 0.73, -7.515, 0.65, 0.035, 0.065, black); box(-8.11, 1, -8.1, 1.04, 0.027, 0.76, black);
  for (const x of [-8.38, -7.84]) for (const z of [-8.31, -7.96]) put(new THREE.TorusGeometry(0.115, 0.017, 5, 14), steel, x, 1.018, z, Math.PI / 2);
  box(-5.67, 1.004, -8.14, 0.8, 0.025, 0.65, steel); box(-5.67, 1.022, -8.14, 0.65, 0.018, 0.49, dark); cyl(-5.67, 1.21, -8.5, 0.025, 0.025, 0.45, steel); cyl(-5.67, 1.425, -8.34, 0.025, 0.025, 0.32, steel, Math.PI / 2); plant(-10.6, 0.99, -8.15, 0.56);
  at(-5.2, 0, -5.6, 0, () => {
    box(0, 0.46, 0, 2.5, 0.92, 1.22, oak); box(0, 0.97, 0, 2.7, 0.11, 1.43, white); hit(0, 0, 0, 2.7, 1.03, 1.43); cyl(0.55, 1.055, 0, 0.25, 0.16, 0.1, cream);
    for (let i = 0; i < 5; i++) orb(0.4 + (i % 3) * 0.13, 1.15, -0.07 + Math.floor(i / 3) * 0.12, 0.085, 0.08, 0.08, i % 2 ? coral : leafLight);
  });
  at(-8.5, 0, -2.8, 0, () => { table(2.8, 1.35); plant(0, 0.77, 0, 0.42, true); for (const x of [-0.83, 0.83]) for (const z of [-1.08, 1.08]) at(x, 0, z, z < 0 ? Math.PI : 0, () => chair()); });
  for (const x of [-8.9, -7.95, -5.2]) { cyl(x, 2.95, -3.2, 0.012, 0.012, 1, black); cyl(x, 2.4, -3.2, 0.13, 0.3, 0.28, brass); cyl(x, 2.253, -3.2, 0.25, 0.25, 0.015, lampGlow); }

  // Gaming studio: twin screens, keyboard, RGB fans and a swivel chair.
  at(8.5, 0, 3.82, 0, () => {
    table(3.55, 0.86, 0.78, walnut);
    for (const x of [-0.66, 0.65]) { box(x, 0.82, -0.03, 0.38, 0.035, 0.25, black); cyl(x, 1.03, -0.15, 0.03, 0.03, 0.4, black); box(x, 1.28, -0.14, 1.18, 0.69, 0.085, black); put(new THREE.PlaneGeometry(1.08, 0.59), screenMat, x, 1.28, -0.09); }
    box(-0.28, 0.799, 0.21, 0.77, 0.03, 0.26, black);
    for (let row = 0; row < 3; row++) for (let k = 0; k < 12; k++) box(-0.61 + k * 0.059, 0.82, 0.13 + row * 0.065, 0.043, 0.015, 0.04, k % 4 ? steel : rgb, 0.004);
    orb(0.38, 0.825, 0.24, 0.055, 0.03, 0.083, black); box(1.32, 1.09, 0.04, 0.45, 0.62, 0.63, black);
    for (const y of [0.94, 1.17]) { put(new THREE.TorusGeometry(0.081, 0.016, 6, 16), rgb, 1.32, y, 0.365); cyl(1.32, y, 0.367, 0.042, 0.042, 0.01, steel, Math.PI / 2); } box(-0.1, 0.713, 0.43, 2.9, 0.015, 0.018, rgb, 0);
  });
  at(8.4, 0, 5, Math.PI, () => {
    cyl(0, 0.28, 0, 0.045, 0.045, 0.5, steel);
    for (let i = 0; i < 5; i++) at(0, 0, 0, i * Math.PI * 0.4, () => { box(0, 0.12, 0.2, 0.055, 0.06, 0.45, black); orb(0, 0.075, 0.4, 0.075, 0.075, 0.04, black); });
    box(0, 0.51, 0, 0.68, 0.16, 0.69, black, 0.08); box(0, 1.01, 0.28, 0.67, 0.98, 0.2, blue, 0.09);
    for (const x of [-0.37, 0.37]) box(x, 0.75, 0, 0.08, 0.07, 0.48, black); hit(0, 0, 0, 0.8, 1.5, 0.86);
  });
  at(8, 0, 7.55, 0, () => sofa(2.8, blue)); at(11.5, 0, 6.1, -Math.PI / 2, () => shelf(1.85)); box(8, 0.019, 6.5, 4.1, 0.03, 3, rugMat, 0); plant(3, 0, 8, 1.3);

  // First floor bedrooms and library.
  bed(-8, 3.6, 5.5, 0); box(-8, 3.617, 5.3, 5.4, 0.026, 5.4, rugMat, 0);
  at(-11.1, 3.6, 2.05, Math.PI / 2, () => {
    box(0, 1.34, 0, 2.2, 2.68, 0.78, oak); for (const x of [-0.55, 0.55]) { box(x, 1.36, 0.405, 1.05, 2.51, 0.04, linen); box(x + (x < 0 ? 0.37 : -0.37), 1.2, 0.455, 0.03, 0.45, 0.04, brass); } hit(0, 0, 0, 2.2, 2.7, 0.88);
  });
  at(-4, 3.6, 6, -0.3, () => sofa(1.25, sage)); at(-3.05, 3.6, 6.75, 0, () => lamp(true)); at(-4, 3.6, 4.7, 0, () => { table(0.7, 0.7, 0.48); tea(0, 0.49, 0); }); artwork(-7, 5.65, 0.14, 2.1, 1.2, 0);
  // Soft gathered linen curtains flank the glazing without blocking the balcony door.
  for (const x of [-11.05, -8.97, -5.72, -2.8]) {
    for (let i = 0; i < 4; i++) cyl(x + (i - 1.5) * 0.075, 5.13, 8.72, 0.055, 0.065, 2.77, linen);
  }
  bed(-8, 3.6, -5.5, Math.PI, 2.1);
  at(-4.05, 3.6, -6.65, 0, () => { table(1.75, 0.75); books(-0.75, 0.77, -0.08, 4); at(0.62, 0.77, -0.05, 0, () => lamp()); box(0, 0.775, 0.1, 0.55, 0.013, 0.33, cream, 0); });
  at(-4.05, 3.6, -5.65, 0, () => chair()); at(-9.8, 3.6, -0.55, Math.PI, () => shelf(2.4)); plant(-3, 3.6, -8.1, 1.1);
  at(10.7, 3.6, 3.45, 0, () => shelf(1.9)); at(11.48, 3.6, 6.4, -Math.PI / 2, () => shelf(2.8)); at(6.9, 3.6, 6.9, -0.4, () => sofa(1.5, terra)); at(4.2, 3.6, 6.4, 0.4, () => sofa(1.4, linen));
  at(5.5, 3.6, 5.6, 0, () => { table(1.25, 0.8, 0.46); tea(0.28, 0.47, 0); books(-0.4, 0.47, 0, 3); }); box(5.7, 3.617, 6.3, 4.6, 0.028, 3.5, rugMat, 0); plant(3, 3.6, 8.1, 1.55); at(8.45, 3.6, 7.6, 0, () => lamp(true));

  // Bathroom/laundry, with an open tub basin and a metallic (non-render-target) mirror.
  at(10, 3.6, -5.8, 0, () => {
    box(0, 0.17, 0, 1.6, 0.34, 2.9, white, 0.16); for (const x of [-0.7, 0.7]) box(x, 0.44, 0, 0.2, 0.6, 2.8, white, 0.09); for (const z of [-1.3, 1.3]) box(0, 0.44, z, 1.38, 0.6, 0.2, white, 0.09);
    box(0, 0.24, 0, 1.32, 0.04, 2.43, water, 0.02); cyl(0.6, 0.88, -1.12, 0.025, 0.025, 0.6, brass); cyl(0.43, 1.17, -1.12, 0.025, 0.025, 0.34, brass, 0, Math.PI / 2); box(0, 0.77, 0.48, 1.63, 0.055, 0.3, oak); tea(0.25, 0.8, 0.48); hit(0, 0, 0, 1.65, 0.8, 2.95);
  });
  at(11.35, 3.6, -1.65, -Math.PI / 2, () => {
    box(0, 0.42, 0, 1.9, 0.84, 0.85, oak); box(0, 0.89, 0, 2, 0.1, 0.94, white); cyl(0, 1.015, 0, 0.31, 0.23, 0.2, white); cyl(0, 1.12, 0, 0.24, 0.24, 0.007, stone); cyl(0, 1.13, -0.32, 0.022, 0.022, 0.42, brass); cyl(0, 1.34, -0.22, 0.022, 0.022, 0.2, brass, Math.PI / 2);
    box(0, 1.96, -0.39, 1.48, 1.38, 0.05, brass); box(0, 1.96, -0.355, 1.37, 1.27, 0.018, steel, 0.01);
    for (let i = 0; i < 3; i++) cyl(-0.7, 1 + i * 0.105, 0.06, 0.06, 0.06, 0.3, linen, Math.PI / 2); hit(0, 0, 0, 2, 0.97, 0.94);
  });
  at(7.45, 3.6, -8.08, 0, () => {
    box(0, 0.47, 0, 1.1, 0.94, 1, white); cyl(0, 0.44, 0.516, 0.34, 0.34, 0.05, steel, Math.PI / 2); cyl(0, 0.44, 0.548, 0.26, 0.26, 0.025, black, Math.PI / 2); box(0, 1.01, 0, 1.22, 0.09, 1.08, oak); for (let i = 0; i < 3; i++) box(0.1, 1.1 + i * 0.09, 0, 0.64, 0.085, 0.5, i % 2 ? sage : linen, 0.03); hit(0, 0, 0, 1.22, 1.06, 1.1);
  });

  // Roof terrace leaves stair x[2.15,6.25], z[-7,.5] completely vacant.
  at(-7, 7.2, 5.5, 0, () => sofa(4.15, sage, true)); at(-7, 7.2, 3.4, 0, () => { table(1.85, 1.05, 0.43); tea(0.5, 0.44, 0); plant(-0.3, 0.44, 0, 0.45, true); }); box(-7, 7.217, 4.3, 5.8, 0.028, 4.4, rugMat, 0);
  at(-6, 7.2, -4.5, 0, () => {
    cyl(0, 0.36, 0, 0.07, 0.07, 0.72, black); cyl(0, 0.04, 0, 0.48, 0.48, 0.08, black); cyl(0, 0.77, 0, 0.88, 0.88, 0.1, oak); hit(0, 0, 0, 1.76, 0.83, 1.76); plant(0, 0.83, 0, 0.42, true);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; at(Math.sin(a) * 1.3, 0, Math.cos(a) * 1.3, a, () => chair()); }
  });
  at(8.5, 7.2, -6, 0, () => {
    legs(1.65, 0.85, 0.77, black, 0.045); box(0, 0.63, 0, 1.5, 0.45, 0.78, black, 0.06); box(0, 1.04, 0, 1.6, 0.42, 0.86, steel, 0.17); box(0, 1.1, 0.47, 0.67, 0.035, 0.055, black);
    for (const x of [-0.5, 0, 0.5]) cyl(x, 0.77, 0.42, 0.045, 0.045, 0.04, brass, Math.PI / 2); for (const x of [-1.06, 1.06]) box(x, 0.86, 0, 0.5, 0.07, 0.76, oak); hit(0, 0, 0, 2.62, 1.27, 0.93);
  });
  for (const [x, z] of [[-10.8, 7.9], [-3, 7.9], [10.7, 7.9], [10.7, -8], [-10.6, -7.9], [-3, -7.9]]) plant(x, 7.2, z, 1.3, true);

  // Garage car: curved paintwork, inset glazing, spokes, trim and headlights.
  const carPaint = mat('#315a60', 0.22, 0.6), carGlass = mat('#293e46', 0.12, 0.5), redLight = mat('#b63b2c', 0.25); redLight.emissive.set('#812318'); redLight.emissiveIntensity = 0.4;
  at(16.2, 0, -2.6, 0, () => {
    box(0, 0.57, 0, 2.14, 0.56, 4.36, carPaint, 0.22); box(0, 0.86, 0.88, 2.03, 0.29, 2.28, carPaint, 0.14); box(0, 1.15, -0.35, 1.82, 0.75, 2.28, carGlass, 0.26); box(0, 1.52, -0.4, 1.78, 0.12, 1.49, carPaint, 0.09);
    for (const x of [-0.93, 0.93]) { box(x, 1.19, -0.33, 0.058, 0.56, 0.095, carPaint); box(x, 1.16, -1.18, 0.08, 0.5, 0.12, carPaint); box(x * 1.1, 0.91, 0.53, 0.26, 0.15, 0.26, carPaint, 0.07); box(x * 1.105, 0.85, -0.3, 0.03, 0.035, 0.2, steel); }
    for (const x of [-1.055, 1.055]) for (const z of [-1.4, 1.35]) {
      cyl(x, 0.43, z, 0.42, 0.42, 0.28, black, 0, Math.PI / 2); cyl(x + Math.sign(x) * 0.153, 0.43, z, 0.29, 0.29, 0.025, steel, 0, Math.PI / 2); cyl(x + Math.sign(x) * 0.17, 0.43, z, 0.12, 0.12, 0.028, black, 0, Math.PI / 2);
      for (let i = 0; i < 5; i++) { const a = i * Math.PI * 0.4; rod(new THREE.Vector3(x + Math.sign(x) * 0.17, 0.43, z), new THREE.Vector3(x + Math.sign(x) * 0.17, 0.43 + Math.cos(a) * 0.26, z + Math.sin(a) * 0.26), 0.025, black); }
    }
    box(0, 0.51, 2.19, 1.93, 0.16, 0.09, black); box(0, 0.68, 2.19, 0.8, 0.23, 0.05, black);
    for (let i = 0; i < 5; i++) box(-0.3 + i * 0.15, 0.68, 2.223, 0.022, 0.18, 0.014, steel, 0);
    for (const x of [-0.76, 0.76]) { box(x, 0.81, 2.11, 0.45, 0.16, 0.12, lampGlow, 0.05); box(x, 0.8, -2.18, 0.45, 0.17, 0.07, redLight); } box(0, 0.47, 2.245, 0.44, 0.11, 0.015, cream, 0); hit(0, 0, 0, 2.4, 1.6, 4.55);
  });
  at(16.4, 0, -7.3, 0, () => {
    table(4.3, 0.91, 0.91); box(0, 1.74, -0.32, 4.15, 1.17, 0.075, walnut);
    for (let i = 0; i < 10; i++) { const x = -1.8 + i * 0.39; box(x, 1.73 + (i % 3) * 0.08, -0.25, 0.045, 0.4, 0.06, steel); if (i % 2) box(x, 1.95 + (i % 3) * 0.08, -0.25, 0.2, 0.09, 0.085, steel); else box(x, 1.53, -0.25, 0.085, 0.14, 0.09, terra); }
    box(-1.3, 1.08, 0, 0.6, 0.33, 0.4, terra); box(-1.3, 1.28, 0, 0.25, 0.05, 0.05, black); box(1.25, 1.03, 0, 0.48, 0.24, 0.3, steel);
  });
  at(19.3, 0, -5.6, -Math.PI / 2, () => {
    for (const x of [-0.85, 0.85]) box(x, 1.2, 0, 0.06, 2.4, 0.58, steel);
    for (let level = 0; level < 4; level++) { box(0, 0.2 + level * 0.64, 0, 1.7, 0.06, 0.6, steel); for (const x of [-0.43, 0.43]) { box(x, 0.42 + level * 0.64, 0, 0.72, 0.37, 0.48, level % 2 ? sage : oak); box(x, 0.44 + level * 0.64, 0.247, 0.2, 0.065, 0.01, cream, 0); } } hit(0, 0, 0, 1.8, 2.4, 0.64);
  });

  // Poolside loungers fit between the parent's pool edge x=-14 and house x=-12.
  for (const z of [-3, 1]) at(-13.04, 0, z, 0, () => {
    legs(0.94, 2.42, 0.28); box(0, 0.32, 0, 0.91, 0.14, 2.32, oak);
    for (let i = 0; i < 12; i++) box(0, 0.42, -1.05 + i * 0.18, 0.87, 0.06, 0.135, linen, 0.02);
    put(new RoundedBoxGeometry(0.9, 0.12, 0.86, 2, 0.035), linen, 0, 0.64, 0.9, -0.55); box(0, 0.86, 1.1, 0.65, 0.16, 0.34, sage, 0.07); hit(0, 0, 0, 0.97, 1, 2.7);
  });
  cyl(-13, 0.065, 6, 0.42, 0.48, 0.13, stone); cyl(-13, 1.3, 6, 0.037, 0.037, 2.6, walnut); put(new THREE.ConeGeometry(1.65, 0.53, 10, 1, true), linen, -13, 2.63, 6);
  for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5; rod(new THREE.Vector3(-13, 2.895, 6), new THREE.Vector3(-13 + Math.cos(a) * 1.65, 2.365, 6 + Math.sin(a) * 1.65), 0.014, oak); }
  for (const x of [-3, 3]) { plant(x, 0, 10.3, 1.25, true); hit(x, 0, 10.3, 0.6, 0.48, 0.6); }
  function tree(x: number, z: number, s: number) {
    cyl(x, 1.45 * s, z, 0.14 * s, 0.25 * s, 2.9 * s, walnut);
    for (let i = 0; i < 5; i++) { const a = i * 2.4, px = x + Math.cos(a) * 0.75 * s, pz = z + Math.sin(a) * 0.75 * s; rod(new THREE.Vector3(x, 1.7 * s, z), new THREE.Vector3(px, (2.6 + i * 0.16) * s, pz), 0.075 * s, walnut); orb(px, (3 + i * 0.13) * s, pz, 1.04 * s, 1.2 * s, 0.95 * s, i % 2 ? leaf : leafLight); } hit(x, 0, z, 0.5 * s, 2.9 * s, 0.5 * s);
  }
  for (const [x, z, s] of [[-23.2, -11, 1.25], [-23, 8.2, 1], [-22, 19, 1.25], [-14, 22.8, 1], [8, 23, 1.15], [23.2, 19, 1.2], [23.4, 7, 1], [22.7, -12, 1.2], [-8, -14.5, 1.15], [8, -14.5, 1.1]]) tree(x, z, s);
  for (let i = 0; i < 28; i++) orb(i < 14 ? -23.35 : 23.35, 0.49, -12 + (i % 14) * 2.45, 0.72, 0.55 + random() * 0.25, 0.82, i % 3 ? leaf : leafLight);
  for (const [x, z] of [[-9, 11], [-10.5, 16], [7, 11], [8.5, 18], [-19, 8]]) { plant(x, 0, z, 1, true); plant(x + 0.8, 0, z + 0.3, 0.65, true); }

  // Static geometry is merged per material, not per chair/slat/book/leaf.
  let staticVertices = 0;
  for (const [material, parts] of batches) {
    const geometry = mergeGeometries(parts, false); for (const part of parts) part.dispose();
    if (!geometry) continue; geometry.computeBoundingSphere(); staticVertices += geometry.getAttribute('position').count;
    const mesh = new THREE.Mesh(geometry, material); mesh.name = 'Batched villa details'; mesh.castShadow = !material.transparent; mesh.receiveShadow = !material.transparent; root.add(mesh);
  }
  root.userData.furnishings = { colliders: colliders.length, staticBatches: batches.size, staticVertices, fish: fish.length, pointLights: 2 };
  let wasGaming: boolean | undefined, wasEvening: boolean | undefined;
  let previousTime = 0, foodBlend = 0;
  const update = (time: number, state: VillaFurnishingState) => {
    const t = Number.isFinite(time) ? Math.max(0, time) : 0, feeding = t < state.fedUntil;
    const dt = Math.min(0.25, Math.max(0, t - previousTime)); previousTime = t;
    foodBlend += ((feeding ? 1 : 0) - foodBlend) * (1 - Math.exp(-dt * 2.4));
    fish.forEach((f, i) => {
      const a = t * (0.2 + i * 0.012) + i * 2.399, radius = 1.28 - foodBlend * 0.91, depth = 0.29 - foodBlend * 0.1;
      const cruisingY = 1.39 + Math.sin(a * 1.37 + i) * 0.35, eatingY = 1.81 + Math.sin(a * 2 + i) * 0.09;
      f.position.set(-3.5 + Math.cos(a) * radius, THREE.MathUtils.lerp(cruisingY, eatingY, foodBlend), 0.6 + Math.sin(a) * depth);
      f.rotation.y = Math.atan2(-Math.cos(a) * depth, -Math.sin(a) * radius); f.rotation.z = Math.sin(t * 2 + i) * 0.06; f.children[1].rotation.y = Math.sin(t * 8 + i) * 0.35;
    });
    for (let i = 0; i < 18; i++) { const phase = (t * 0.21 + i / 18) % 1; dummy.position.set(-4.92 + Math.sin(t * 1.8 + i) * 0.055 + (i % 2) * 2.8, 0.86 + phase * 1.15, 0.39 + Math.cos(i + t) * 0.05); dummy.scale.setScalar(0.55 + phase * 0.5); dummy.updateMatrix(); bubbles.setMatrixAt(i, dummy.matrix); } bubbles.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < flames.length; i++) { flames[i].visible = state.fireplace; flames[i].scale.y = 0.2 + 0.16 * (0.5 + Math.sin(t * 8 + i * 1.9) * 0.5); flames[i].position.y = 0.48 + flames[i].scale.y * 0.67; flames[i].rotation.z = Math.sin(t * 5 + i) * 0.16; }
    fireLight.intensity = state.fireplace ? (state.evening ? 3.5 : 1.8) * (0.9 + Math.sin(t * 11) * 0.06 + Math.sin(t * 7.3) * 0.04) : 0;
    if (wasGaming !== state.gaming) { screenMat.color.set(state.gaming ? '#ffffff' : '#101317'); screenMat.emissiveIntensity = state.gaming ? 0.7 : 0; rgb.emissiveIntensity = state.gaming ? 1.6 : 0; rgb.color.set(state.gaming ? '#64b7d6' : '#202c31'); wasGaming = state.gaming; }
    if (wasEvening !== state.evening) { lampGlow.emissiveIntensity = state.evening ? 1.5 : 0.2; aquariumLight.intensity = state.evening ? 2.1 : 1; wasEvening = state.evening; }
  };
  update(0, { evening: false, fireplace: true, gaming: true, fedUntil: 0 });
  return { colliders, update };
}
