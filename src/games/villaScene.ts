import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { furnishVilla, type VillaFurnishingState } from './villaFurnishings.js';
import { createVillaVehicle } from './villaVehicle.js';
import { createVillaGaming } from './villaGaming.js';
import { createVillaElevatorModel } from './villaElevatorModel.js';
import { createVillaElevatorColliders, villaElevatorShaftContains, type VillaElevatorState } from './villaElevator.js';
import type { VillaActivityState } from './villaActivities.js';
import { isVillaVehicleCollider, type VillaDrivingState } from './villaDriving.js';
import { createVillaDrivingCourse } from './villaDrivingCourse.js';
import type { VillaRaceState } from './villaRacing.js';
import type { VillaSnookerState } from './villaSnooker.js';
import { createVillaSnookerModel } from './villaSnookerModel.js';
import {
  EYE_HEIGHT, POOL, villaTreadLayers, VILLA_BLOCKS, VILLA_RAMPS, VILLA_RAILS, VILLA_WALL_COLLIDERS,
  type VillaCollider, type VillaMaterial, type VillaPosition,
} from './villaWorld.js';

export interface VillaView extends VillaPosition { yaw: number; pitch: number; eyeHeight?: number; fov?: number }
export type VillaSceneState = VillaFurnishingState & VillaActivityState & {
  elevator: VillaElevatorState; driving: VillaDrivingState; race: VillaRaceState;
  snooker: VillaSnookerState; snookerActive: boolean;
};

/** Small studio/sky reflection probe; all pixels are authored locally, no asset fetches. */
function reflectionProbe(): THREE.CubeTexture {
  const images = Array.from({ length: 6 }, (_, side) => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, '#d5e4ec'); g.addColorStop(0.48, '#c9c7bb'); g.addColorStop(0.52, '#7b7166'); g.addColorStop(1, '#746957');
    ctx.fillStyle = side === 2 ? '#e9e6dc' : side === 3 ? '#75664e' : g; ctx.fillRect(0, 0, 64, 64);
    if (side !== 2 && side !== 3) {
      ctx.fillStyle = '#f5eee0'; ctx.fillRect(6, 10, 18, 32); ctx.fillRect(40, 10, 18, 32);
      ctx.fillStyle = '#a29883'; ctx.fillRect(13, 10, 1, 32); ctx.fillRect(48, 10, 1, 32);
    }
    return c;
  });
  const map = new THREE.CubeTexture(images); map.colorSpace = THREE.SRGBColorSpace; map.needsUpdate = true; return map;
}

function texture(kind: 'oak' | 'stone' | 'plaster' | 'grass' | 'water' | 'tile'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  let seed = 73;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  ctx.fillStyle = { oak: '#bd9872', stone: '#d7cdbb', plaster: '#f0e6d5', grass: '#728554', water: '#a7d1d0', tile: '#8cbfc0' }[kind];
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4200; i++) {
    const light = random() > 0.5;
    ctx.fillStyle = light ? 'rgba(255,249,224,.065)' : 'rgba(51,37,23,.065)';
    ctx.fillRect(random() * 256, random() * 256, kind === 'grass' ? 2 : 1, kind === 'grass' ? 5 : 1);
  }
  if (kind === 'oak') {
    for (let i = 0; i < 240; i++) {
      const y = random() * 256;
      ctx.strokeStyle = `rgba(82,45,19,${random() * 0.1})`;
      ctx.beginPath(); ctx.moveTo(0, y);
      ctx.bezierCurveTo(80, y - 7 * random(), 160, y + 7 * random(), 256, y); ctx.stroke();
    }
    ctx.strokeStyle = '#a7815d'; ctx.lineWidth = 0.7;
    for (let y = 0; y < 256; y += 32) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y);
      ctx.moveTo((y * 7) % 256, y); ctx.lineTo((y * 7) % 256, y + 32); ctx.stroke();
    }
  }
  if (kind === 'tile') {
    ctx.strokeStyle = 'rgba(230,244,231,.5)'; ctx.lineWidth = 1.5;
    for (let p = 0; p <= 256; p += 16) {
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, 256); ctx.moveTo(0, p); ctx.lineTo(256, p); ctx.stroke();
    }
  }
  if (kind === 'water' || kind === 'tile') {
    for (let i = 0; i < 36; i++) {
      ctx.strokeStyle = kind === 'water' ? 'rgba(255,255,255,.25)' : 'rgba(255,255,232,.12)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x <= 256; x += 4) {
        const y = (i * 19 + Math.sin(x * 0.047 + i) * 9 + Math.sin(x * 0.016 + i * 2) * 12) % 256;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

export class VillaScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly colliders: VillaCollider[];
  readonly lowSpec: boolean;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(64, 1.6, 0.065, 240);
  private readonly sun = new THREE.DirectionalLight(0xffddad, 2.4);
  private readonly hemi = new THREE.HemisphereLight(0xe1e6e5, 0x8f775e, 2);
  private readonly ambient = new THREE.AmbientLight(0xffe2bd, 0.34);
  private readonly lamps: THREE.PointLight[] = [];
  private readonly furnishings: ReturnType<typeof furnishVilla>;
  private readonly vehicle: ReturnType<typeof createVillaVehicle>;
  private readonly gaming: ReturnType<typeof createVillaGaming>;
  private readonly elevator: ReturnType<typeof createVillaElevatorModel>;
  private readonly course: ReturnType<typeof createVillaDrivingCourse>;
  private readonly snooker: ReturnType<typeof createVillaSnookerModel>;
  readonly drivingObstacles: VillaCollider[];
  private readonly elevatorCollisions = createVillaElevatorColliders();
  private readonly environment = reflectionProbe();
  private lastStateKey = '';
  private readonly water: THREE.Mesh;
  private readonly waterMap: THREE.CanvasTexture;
  private readonly sky: THREE.ShaderMaterial;
  private readonly glow: THREE.MeshStandardMaterial;
  private disposed = false;
  private contextLost = false;
  private lastEvening: boolean | null = null;
  private readonly cachedFrame = document.createElement('canvas');
  private lastDrawAt = -Infinity;
  private cachedTime = -1;
  private softwareInputFrames = 0;
  private readonly onContextLost = (event: Event) => { event.preventDefault(); this.contextLost = true; };
  private readonly onContextRestored = () => { this.contextLost = false; this.renderer.shadowMap.needsUpdate = true; };

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: false });
    const gl = this.renderer.getContext();
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : '';
    this.lowSpec = /swiftshader|llvmpipe|software|subzero/i.test(gpu);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.13;
    this.renderer.shadowMap.enabled = !this.lowSpec;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.camera.rotation.order = 'YXZ';
    this.scene.fog = new THREE.Fog(0xd6cbbb, 60, 170);
    this.scene.add(this.hemi, this.ambient, this.sun);
    // Keep the reflection probe on hardware; CPU rasterizers retain diffuse
    // room lighting and baked contacts without paying for IBL on every surface.
    this.scene.environment = this.lowSpec ? null : this.environment;
    this.scene.environmentIntensity = 0.32;
    this.sun.position.set(-24, 26, 24);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -29, right: 29, top: 29, bottom: -29, near: 0.5, far: 100 });
    this.sun.shadow.camera.updateProjectionMatrix();
    // Small bias protects the 11cm soffit; large bias detached shadows from the treads.
    this.sun.shadow.bias = -0.00006;
    this.sun.shadow.normalBias = 0.012;

    this.sky = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color('#7c9cae') }, horizon: { value: new THREE.Color('#f7d6b0') },
        sunColor: { value: new THREE.Color('#ffe1ac') },
      },
      vertexShader: `varying vec3 vPosition;
        void main() {
          vPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `varying vec3 vPosition;
        uniform vec3 top;
        uniform vec3 horizon;
        uniform vec3 sunColor;
        void main() {
          vec3 p = normalize(vPosition);
          float h = pow(max(p.y, 0.0), 0.6);
          vec3 c = mix(horizon, top, h);
          float s = max(dot(p, normalize(vec3(-24., 26., 24.))), 0.0);
          c += sunColor * (pow(s, 160.) * .5 + pow(s, 1500.) * 2.);
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(190, 24, 12), this.sky));

    const oak = texture('oak'), stone = texture('stone'), plaster = texture('plaster');
    const materials: Record<VillaMaterial, THREE.MeshStandardMaterial> = {
      oak: new THREE.MeshStandardMaterial({ map: oak, roughness: 0.67 }),
      stone: new THREE.MeshStandardMaterial({ map: stone, roughness: 0.88 }),
      plaster: new THREE.MeshStandardMaterial({ map: plaster, roughness: 0.95 }),
      glass: new THREE.MeshStandardMaterial({ color: 0xc5dfe0, roughness: 0.13, metalness: 0.15, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide }),
      bronze: new THREE.MeshStandardMaterial({ color: 0x554a3c, roughness: 0.42, metalness: 0.42 }),
      roof: new THREE.MeshStandardMaterial({ color: 0xa99b83, roughness: 0.8 }),
    };
    const stairNosing = materials.oak.clone(); stairNosing.color.set('#dac5a7'); stairNosing.name = 'Oak tread end grain';
    this.glow = new THREE.MeshStandardMaterial({ color: 0xffebc7, emissive: 0xffbe66, emissiveIntensity: 2, roughness: 0.45 });
    const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const batch = (geo: THREE.BufferGeometry, material: THREE.Material) => {
      const list = batches.get(material) ?? []; list.push(geo); batches.set(material, list);
    };
    const box = (x: number, y: number, z: number, w: number, h: number, d: number, material: THREE.Material) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      geo.translate(x, y, z);
      // World-space grain scale on every face avoids stretched plank textures.
      const pos = geo.getAttribute('position'), normal = geo.getAttribute('normal'), uv = geo.getAttribute('uv');
      for (let i = 0; i < pos.count; i++) {
        const a = Math.abs(normal.getY(i)) > 0.5 ? pos.getX(i) : Math.abs(normal.getX(i)) > 0.5 ? pos.getZ(i) : pos.getX(i);
        const b = Math.abs(normal.getY(i)) > 0.5 ? pos.getZ(i) : pos.getY(i);
        uv.setXY(i, a / 2.5, b / 2.5);
      }
      batch(geo, material);
    };
    const beam = (a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material) => {
      const delta = b.clone().sub(a);
      const geo = new THREE.CylinderGeometry(radius, radius, delta.length(), 8);
      geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
      geo.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      batch(geo, material);
    };
    for (const b of VILLA_BLOCKS) box(b.x, b.y, b.z, b.w, b.h, b.d, materials[b.material]);
    // Thin floating oak treads, not columns filling down to the floor. This leaves
    // full headroom between stacked flights and matches villaSupportAt's soffits.
    for (const r of VILLA_RAMPS) {
      for (let i = 0; i < 12; i++) {
        const z = r.startZ + (r.endZ - r.startZ) * (i + 0.5) / 12;
        const top = r.bottom + (r.top - r.bottom) * (i + 1) / 12;
        const layer = villaTreadLayers(top), x = (r.minX + r.maxX) / 2, w = r.maxX - r.minX;
        box(x, (layer.bodyBottom + layer.bodyTop) / 2, z, w, layer.bodyTop - layer.bodyBottom, 0.5, materials.plaster);
        const front = Math.sign(r.startZ - r.endZ), finishY = (layer.finishBottom + layer.finishTop) / 2;
        // The 2cm end-grain lip meets (never overlays) the main cap, making each
        // descending step legible without reintroducing coplanar z-fighting.
        box(x, finishY, z - front * 0.01, w + 0.055, layer.finishTop - layer.finishBottom, 0.48, materials.oak);
        box(x, finishY, z + front * 0.24, w + 0.055, layer.finishTop - layer.finishBottom, 0.02, stairNosing);
        // Recessed warm strip below the nosing, never a glowing patch on the walking face.
        if (i % 3 === 0) box(x, top - 0.065, z + Math.sign(r.startZ - r.endZ) * 0.251, w * 0.66, 0.012, 0.009, this.glow);
      }
      for (const x of [r.minX - 0.045, r.maxX + 0.045]) {
        beam(new THREE.Vector3(x, r.bottom + 1.06, r.startZ), new THREE.Vector3(x, r.top + 1.06, r.endZ), 0.033, materials.oak);
        for (let i = 0; i <= 12; i += 2) {
          const y = r.bottom + (r.top - r.bottom) * i / 12, z = r.startZ + (r.endZ - r.startZ) * i / 12;
          box(x, y + 0.54, z, 0.028, 1.04, 0.028, materials.bronze);
        }
      }
    }
    for (const base of [0, 3.6]) box(4.2, base + 1.7, -6.2, 3.8, 0.2, 1.4, materials.oak);
    // Only non-stair-step rails need an additional visible horizontal balustrade.
    for (const r of VILLA_RAILS.filter(r => r.maxZ - r.minZ > 1 || r.maxX - r.minX > 1)) {
      const x = (r.minX + r.maxX) / 2, z = (r.minZ + r.maxZ) / 2;
      const w = r.maxX - r.minX, d = r.maxZ - r.minZ, h = r.maxY - r.minY;
      box(x, r.minY + h / 2, z, w, h, d, materials.glass);
      box(x, r.maxY, z, Math.max(w, 0.045), 0.045, Math.max(d, 0.045), materials.bronze);
      const length = Math.max(w, d), count = Math.ceil(length / 2);
      for (let i = 0; i <= count; i++) box(w > d ? r.minX + w * i / count : x, r.minY + h / 2, d > w ? r.minZ + d * i / count : z, 0.035, h, 0.035, materials.bronze);
    }
    this.colliders = [...VILLA_WALL_COLLIDERS, ...VILLA_RAILS];

    // Garden lawn surrounds a genuinely recessed tiled pool (no lawn under the water).
    const grass = new THREE.MeshStandardMaterial({ map: texture('grass'), roughness: 1 });
    box(0, -1.2, 0, 360, 0.12, 360, grass);
    for (const [minX, maxX, minZ, maxZ] of [[-25, -22, -17, 24], [-14.5, 25, -17, 24], [-22, -14.5, -17, -6], [-22, -14.5, 5, 24]]) {
      box((minX + maxX) / 2, -0.08, (minZ + maxZ) / 2, maxX - minX, 0.12, maxZ - minZ, grass);
    }
    // Extend the front lawn to the private driving course, beyond the old garden.
    box(1.5, -.08, 41, 54, .12, 34, grass);
    box(26.5, -.08, 3.5, 3, .12, 41, grass);
    // Concrete in the attached garage and pale tile in the upstairs wet room.
    box(16, -0.025, -3, 8, 0.08, 10, materials.stone);
    box(9.25, 3.61, -4, 5.45, 0.025, 9.8, materials.stone);
    box(0, -0.015, 15.9, 3.8, 0.055, 13.5, materials.stone);
    box(16.2, -0.015, 11.7, 5.9, 0.055, 20, materials.stone);
    box(8, -0.015, 11, 13, 0.055, 2.2, materials.stone);
    box(-13.15, -0.01, 0, 2.2, 0.06, 20, materials.stone);
    for (let i = 0; i < 11; i++) box(-2.5 - i * 1.16, 0.008, 11.5, 0.92, 0.07, 1.2, materials.stone);
    for (let i = 0; i < 7; i++) box(0, 0.018, 10.5 + i * 1.7, 3.55, 0.02, 0.018, materials.bronze);
    const poolTile = new THREE.MeshStandardMaterial({ map: texture('tile'), roughness: 0.42 });
    const cx = (POOL.minX + POOL.maxX) / 2, cz = (POOL.minZ + POOL.maxZ) / 2;
    box(cx, -1.04, cz, 7.5, 0.14, 11, poolTile);
    for (const x of [POOL.minX, POOL.maxX]) {
      box(x, -0.51, cz, 0.15, 1.1, 11.2, poolTile);
      box(x, 0.045, cz, 0.36, 0.15, 11.6, materials.stone);
    }
    for (const z of [POOL.minZ, POOL.maxZ]) {
      box(cx, -0.51, z, 7.5, 1.1, 0.15, poolTile);
      box(cx, 0.045, z, 7.7, 0.15, 0.36, materials.stone);
    }
    this.waterMap = texture('water');
    this.waterMap.repeat.set(3, 4);
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(7.3, 10.8), new THREE.MeshPhongMaterial({
      color: 0x5aaeb6, specular: 0xffecc8, shininess: 110, transparent: true, opacity: 0.64,
      bumpMap: this.waterMap, bumpScale: 0.065, side: THREE.DoubleSide, depthWrite: false,
    }));
    this.water.rotation.x = -Math.PI / 2; this.water.position.set(cx, -0.035, cz); this.scene.add(this.water);
    // Stainless pool ladder.
    for (const x of [cx - 0.4, cx + 0.4]) {
      beam(new THREE.Vector3(x, -0.75, 4.5), new THREE.Vector3(x, 0.55, 4.5), 0.035, materials.bronze);
      beam(new THREE.Vector3(x, 0.55, 4.5), new THREE.Vector3(x, 0.55, 5.35), 0.035, materials.bronze);
      beam(new THREE.Vector3(x, 0.55, 5.35), new THREE.Vector3(x, 0.03, 5.35), 0.035, materials.bronze);
    }
    for (let y = -0.65; y <= 0.1; y += 0.25) box(cx, y, 4.5, 0.85, 0.03, 0.13, materials.bronze);

    // Rooftop pergola, warm festoon lights and perimeter garden fence.
    for (const x of [-10.3, -3.1]) for (const z of [1.3, 7]) {
      box(x, 8.55, z, 0.16, 2.7, 0.16, materials.oak);
      this.colliders.push({ minX: x - 0.08, maxX: x + 0.08, minZ: z - 0.08, maxZ: z + 0.08, minY: 7.2, maxY: 9.9 });
    }
    for (const x of [-10.3, -3.1]) box(x, 9.95, 4.15, 0.2, 0.22, 6.2, materials.oak);
    for (let z = 1.1; z <= 7.2; z += 0.4) box(-6.7, 10.05, z, 7.8, 0.15, 0.12, materials.oak);
    for (const z of [1.4, 6.9]) {
      for (let i = 0; i < 18; i++) {
        const x = -10.25 + i * 7.1 / 17, nextX = -10.25 + (i + 1) * 7.1 / 17;
        const y = 9.8 - Math.sin(i / 17 * Math.PI) * 0.42;
        if (i < 17) beam(new THREE.Vector3(x, y, z), new THREE.Vector3(nextX, 9.8 - Math.sin((i + 1) / 17 * Math.PI) * 0.42, z), 0.009, materials.bronze);
        if (i % 2 === 0) { const g = new THREE.SphereGeometry(0.045, 8, 6); g.translate(x, y - 0.085, z); batch(g, this.glow); }
      }
    }
    for (let z = -16; z <= 23; z += 2) for (const x of [-24.8, 24.8]) box(x, 0.6, z, 0.12, 1.2, 0.12, materials.oak);
    for (const x of [-24.8, 24.8]) for (const y of [0.35, 0.9]) box(x, y, 3.5, 0.075, 0.085, 40, materials.oak);
    for (let x = -24; x <= 24; x += 2) box(x, 0.6, -16.8, 0.12, 1.2, 0.12, materials.oak);
    for (const y of [0.35, 0.9]) box(0, y, -16.8, 49.5, 0.085, 0.075, materials.oak);
    // The visible old garden fence must remain solid after expanding the grounds.
    for (const x of [-24.8, 24.8]) this.colliders.push({ minX: x - .06, maxX: x + .06, minZ: -16.8, maxZ: 23.5, minY: 0, maxY: 1.2 });
    this.colliders.push({ minX: -24.8, maxX: 24.8, minZ: -16.86, maxZ: -16.74, minY: 0, maxY: 1.2 });
    // A wider boundary encloses the practice lawn; the driveway stays unobstructed.
    for (const x of [-24.8, 27.8]) {
      for (let z = 25; z <= 57; z += 2) box(x, .6, z, .12, 1.2, .12, materials.oak);
      for (const y of [.35, .9]) box(x, y, 41, .075, .085, 32, materials.oak);
      this.colliders.push({ minX: x - .06, maxX: x + .06, minZ: 25, maxZ: 57, minY: 0, maxY: 1.2 });
    }
    for (let x = -24; x <= 27; x += 2) box(x, .6, 57, .12, 1.2, .12, materials.oak);
    for (const y of [.35, .9]) box(1.5, y, 57, 52.6, .085, .075, materials.oak);
    this.colliders.push({ minX: -24.8, maxX: 27.8, minZ: 56.94, maxZ: 57.06, minY: 0, maxY: 1.2 });
    for (const z of [11, 15, 19]) for (const x of [-2.3, 2.3]) {
      box(x, 0.3, z, 0.11, 0.6, 0.11, materials.bronze);
      box(x, 0.56, z, 0.115, 0.08, 0.115, this.glow);
    }
    // Recessed warm lighting, deliberately few unshadowed local lights.
    for (const [x, y, z] of [[-4.5, 2.85, 3], [0, 6.45, 1.5], [-6.7, 9.45, 4.1]]) {
      const lamp = new THREE.PointLight(0xffd097, 16, 14, 2); lamp.position.set(x, y, z); this.lamps.push(lamp); this.scene.add(lamp);
    }
    for (const y of [3.28, 6.88]) {
      for (const x of [-10, -5, 0, 8]) for (const z of [-6.5, 1.7, 7.5]) {
        if (!villaElevatorShaftContains(x, z)) box(x, y, z, 0.24, 0.03, 0.24, this.glow);
      }
      box(-1.7, y, 0, 0.025, 0.04, 17.4, this.glow);
    }
    for (const [material, geometries] of batches) {
      const merged = mergeGeometries(geometries);
      if (merged) {
        const mesh = new THREE.Mesh(merged, material); mesh.castShadow = !material.transparent && material !== this.glow; mesh.receiveShadow = true; this.scene.add(mesh);
      }
      geometries.forEach(g => g.dispose());
    }
    // A quiet distant landscape beyond the property, not an empty void.
    const hillMat = new THREE.MeshStandardMaterial({ color: 0x728b7e, roughness: 1 });
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2;
      const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), hillMat);
      hill.position.set(Math.cos(a) * 108, -6, Math.sin(a) * 108);
      hill.scale.set(24 + i % 3 * 8, 13 + i % 4 * 4, 25); this.scene.add(hill);
    }
    this.furnishings = furnishVilla(this.scene);
    this.vehicle = createVillaVehicle(this.scene);
    this.gaming = createVillaGaming(this.scene);
    this.elevator = createVillaElevatorModel(this.scene);
    this.course = createVillaDrivingCourse(this.scene);
    this.snooker = createVillaSnookerModel(this.scene);
    this.colliders.push(...this.furnishings.colliders, ...this.vehicle.colliders, ...this.gaming.colliders, ...this.elevatorCollisions.colliders, ...this.course.colliders);
    this.drivingObstacles = this.colliders.filter(c => !isVillaVehicleCollider(c));
    this.addContactShadows([...this.furnishings.colliders, ...this.gaming.colliders]);
    // Room names belong to the optional floor plan/HUD, never pasted onto the house.
  }

  /** Cheap baked contact occlusion keeps furniture grounded even on software GL. */
  private addContactShadows(colliders: readonly VillaCollider[]) {
    const c = document.createElement('canvas'); c.width = c.height = 96;
    const ctx = c.getContext('2d')!;
    const gradient = ctx.createRadialGradient(48, 48, 8, 48, 48, 47);
    gradient.addColorStop(0, 'rgba(43,32,19,.38)');
    gradient.addColorStop(0.58, 'rgba(43,32,19,.22)');
    gradient.addColorStop(1, 'rgba(43,32,19,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 96, 96);
    const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
    const parts = colliders.map(collider => {
      const g = new THREE.PlaneGeometry((collider.maxX - collider.minX) * 1.42, (collider.maxZ - collider.minZ) * 1.42);
      g.rotateX(-Math.PI / 2);
      g.translate((collider.minX + collider.maxX) / 2, collider.minY + 0.039, (collider.minZ + collider.maxZ) / 2);
      return g;
    });
    const geometry = mergeGeometries(parts);
    parts.forEach(g => g.dispose());
    if (geometry) this.scene.add(new THREE.Mesh(geometry, material));
    else { material.dispose(); map.dispose(); }
  }

  /** Advance door collisions even between cached software-GL frames. */
  updateActivities(time: number, state: VillaSceneState) {
    if (this.vehicle.update(time, state)) this.renderer.shadowMap.needsUpdate = true;
    this.elevatorCollisions.update(state.elevator);
    if (this.elevator.update(state.elevator)) this.renderer.shadowMap.needsUpdate = true;
    if (this.snooker.update(state.snooker, state.snookerActive)) this.renderer.shadowMap.needsUpdate = true;
    this.course.update(state.driving);
  }

  get carDoorProgress(): number { return this.vehicle.doorProgress; }

  /** A small in-world interaction badge, never visible through walls or behind the camera. */
  projectInteraction(point: VillaPosition, width: number, height: number): { x: number; y: number } | null {
    const origin = this.camera.position, end = new THREE.Vector3(point.x, point.y, point.z);
    for (const c of this.colliders) {
      if (point.x >= c.minX && point.x <= c.maxX && point.y >= c.minY && point.y <= c.maxY && point.z >= c.minZ && point.z <= c.maxZ) continue;
      let lo = 0, hi = .96;
      for (const [axis, min, max] of [['x', c.minX, c.maxX], ['y', c.minY, c.maxY], ['z', c.minZ, c.maxZ]] as const) {
        const delta = end[axis] - origin[axis];
        if (Math.abs(delta) < 1e-7) { if (origin[axis] < min || origin[axis] > max) { lo = 1; break; } }
        else { const a = (min - origin[axis]) / delta, b = (max - origin[axis]) / delta; lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b)); }
      }
      if (lo <= hi && hi > .05) return null;
    }
    end.project(this.camera);
    return end.z >= -1 && end.z <= 1 && Math.abs(end.x) < .88 && Math.abs(end.y) < .7
      ? { x: (end.x + 1) * width / 2, y: (1 - end.y) * height / 2 } : null;
  }

  render(ctx: CanvasRenderingContext2D, width: number, height: number, pixelRatio: number, view: VillaView, time: number, state: VillaSceneState): boolean {
    if (this.disposed || this.contextLost) return false;
    const scale = this.lowSpec ? 0.55 : Math.min(1.5, pixelRatio);
    const w = Math.round(width * scale), h = Math.round(height * scale);
    const now = performance.now();
    const stateKey = `${state.evening}/${state.gaming}/${state.fireplace}/${state.carDoorOpen}/${state.seated}/${state.screenSource}/${state.displayLights}/${state.elevator.phase}/${state.elevator.target}/${state.snookerActive}`;
    this.updateActivities(time, state);
    // Guarantee input-only RAFs even if browser compositing AFTER render() took
    // longer than the time budget. A wall-clock cap alone starves real key events
    // on SwiftShader. Long manual time jumps and activity changes still draw now.
    if (this.lowSpec && this.cachedFrame.width === w && this.cachedFrame.height === h
      && (this.softwareInputFrames > 0 || now - this.lastDrawAt < 1000 / 24)
      && time >= this.cachedTime && time - this.cachedTime < 0.5 && this.lastStateKey === stateKey) {
      this.softwareInputFrames = Math.max(0, this.softwareInputFrames - 1);
      ctx.drawImage(this.cachedFrame, 0, 0, width, height); return true;
    }
    if (this.renderer.domElement.width !== w || this.renderer.domElement.height !== h) this.renderer.setSize(w, h, false);
    this.camera.aspect = width / height; this.camera.fov = view.fov ?? 64; this.camera.updateProjectionMatrix();
    this.camera.position.set(view.x, view.y + (view.eyeHeight ?? EYE_HEIGHT), view.z);
    this.camera.rotation.set(view.pitch, view.yaw, 0);
    if (this.lastEvening !== state.evening) {
      this.lastEvening = state.evening;
      this.sky.uniforms.top.value.set(state.evening ? '#748fa7' : '#82b0d0');
      this.sky.uniforms.horizon.value.set(state.evening ? '#f2c9a4' : '#e1e6db');
      this.sun.color.set(state.evening ? 0xffd09a : 0xfff0da);
      this.sun.intensity = state.evening ? 2.45 : 2.9;
      this.hemi.intensity = state.evening ? 1.7 : 2.15;
      this.ambient.intensity = state.evening ? 0.38 : 0.25;
      this.glow.emissiveIntensity = state.evening ? 2.1 : 0.7;
      this.lamps.forEach(l => { l.intensity = state.evening ? 23 : 8; });
    }
    this.waterMap.offset.set(Math.sin(time * 0.025) * 0.12, time * 0.012 % 1);
    this.water.position.y = -0.035 + Math.sin(time * 0.8) * 0.008;
    this.furnishings.update(time, state);
    this.gaming.update(time, state);
    this.renderer.render(this.scene, this.camera);
    this.lastStateKey = stateKey;
    if (this.lowSpec) {
      if (this.cachedFrame.width !== w || this.cachedFrame.height !== h) { this.cachedFrame.width = w; this.cachedFrame.height = h; }
      this.cachedFrame.getContext('2d')!.drawImage(this.renderer.domElement, 0, 0);
      ctx.drawImage(this.cachedFrame, 0, 0, width, height);
      this.lastDrawAt = performance.now(); this.cachedTime = time; this.softwareInputFrames = 6;
    } else ctx.drawImage(this.renderer.domElement, 0, 0, width, height);
    return true;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    this.scene.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) geometries.add(object.geometry);
      if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points || object instanceof THREE.Sprite) {
        (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => materials.add(m));
      }
    });
    materials.forEach(m => { Object.values(m).forEach(value => { if (value instanceof THREE.Texture) textures.add(value); }); m.dispose(); });
    textures.forEach(t => t.dispose()); geometries.forEach(g => g.dispose());
    this.environment.dispose();
    this.sun.shadow.map?.dispose();
    this.renderer.dispose(); this.renderer.forceContextLoss(); this.scene.clear();
    this.cachedFrame.width = this.cachedFrame.height = 0;
  }
}
