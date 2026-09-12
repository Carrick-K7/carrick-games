import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { furnishVilla, type VillaFurnishingState } from './villaFurnishings.js';
import { createVillaVehicle } from './villaVehicle.js';
import { createVillaGaming } from './villaGaming.js';
import { createVillaElevatorModel } from './villaElevatorModel.js';
import { createVillaElevatorColliders, type VillaElevatorState } from './villaElevator.js';
import type { VillaActivityState } from './villaActivities.js';
import { isVillaVehicleCollider, type VillaDrivingState } from './villaDriving.js';
import { createVillaPickupModel } from './villaPickupModel.js';
import { isVillaPickupCollider, type VillaPickupState } from './villaPickup.js';
import { createVillaEstateModel } from './villaEstateModel.js';
import { VILLA_ESTATE_BOUNDS, VILLA_GARAGE_EXTENT } from './villaEstateLayout.js';
import { createVillaEstateFence, createVillaTerrainGeometry } from './villaTerrainModel.js';
import { createVillaScooterModel } from './villaScooterModel.js';
import { isVillaScooterCollider, type VillaScooterState } from './villaScooter.js';
import { createVillaDrivingCourse } from './villaDrivingCourse.js';
import type { VillaRaceState } from './villaRacing.js';
import type { VillaSnookerState } from './villaSnooker.js';
import { createVillaSnookerModel } from './villaSnookerModel.js';
import { createVillaGarden } from './villaGarden.js';
import { createVillaPetModel } from './villaPetModel.js';
import type { VillaPetsState } from './villaPets.js';
import { createVillaHome, villaAtmosphere, VILLA_SECURITY_CAMERAS, type VillaHomeState } from './villaHome.js';
import { createVillaHomeModel } from './villaHomeModel.js';
import { createVillaOutdoor, type VillaOutdoorState } from './villaOutdoor.js';
import { createVillaOutdoorModel } from './villaOutdoorModel.js';
import {
  EYE_HEIGHT, POOL, VILLA_SPAWN, villaTreadLayers, VILLA_BLOCKS, VILLA_RAMPS, VILLA_RAILS, VILLA_WALL_COLLIDERS,
  type VillaCollider, type VillaMaterial, type VillaPosition,
} from './villaWorld.js';

export interface VillaView extends VillaPosition { yaw: number; pitch: number; roll?: number; eyeHeight?: number; fov?: number }
export type VillaSceneState = VillaFurnishingState & VillaActivityState & {
  elevator: VillaElevatorState; driving: VillaDrivingState; scooter: VillaScooterState; race: VillaRaceState;
  /** Optional only for old scene snapshots; the pickup model supplies its spawn. */
  pickup?: VillaPickupState;
  home?: VillaHomeState; outdoor?: VillaOutdoorState;
  snooker: VillaSnookerState; snookerActive: boolean; pets: VillaPetsState;
};

/** Discrete inputs only. Animation clocks, rain/light blends, wardrobe progress,
 * swing angle and carried-chair/player motion must NEVER bypass the six RAFs. */
export function villaSceneInputKey(state: VillaSceneState): string {
  const wardrobes = Object.entries(state.wardrobes?.wardrobes ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([id, w]) => `${id}:${w.open}`).join(',');
  const camp = state.outdoor?.camping;
  const camping = !camp ? 'legacy' : camp.carried ? 'carried' : `placed:${camp.x},${camp.y},${camp.z},${camp.yaw}`;
  return `${state.evening}/${state.gaming}/${state.fireplace}/${state.carDoorOpen}/${!!state.pickupDoorOpen}/${state.seated}/${state.screenSource}/${state.displayLights}/${state.elevator.phase}/${state.elevator.target}/${state.snookerActive}/${!!state.faucetOn}/${state.pets?.feedSequence ?? 0}/${state.teaUntil ?? 0}/${state.home?.revision ?? 0}/${state.tea?.phase ?? 'idle'}/${wardrobes}/${state.snooker.aimAssist !== false}/${state.aquariumOn !== false}/${camping}`;
}
export const VILLA_SECURITY_FEED_SIZE = { width: 384, height: 216, intervalMs: 500 } as const;
/** Readback rows are bottom-up; the reusable canvas ImageData is top-down. */
export function villaFlipSecurityPixels(source: Uint8Array, destination: Uint8ClampedArray, width: number, height: number): void {
  const rowBytes = width * 4;
  for (let row = 0; row < height; row++) destination.set(source.subarray((height - 1 - row) * rowBytes, (height - row) * rowBytes), row * rowBytes);
}

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

/** WebGL target size: actual viewport aspect, capped so fullscreen stays in budget. */
export function villaRendererSize(width: number, height: number, pixelRatio: number, lowSpec: boolean) {
  const scale = lowSpec ? 0.55 : Math.min(1.5, pixelRatio);
  let w = Math.round(width * scale), h = Math.round(height * scale);
  const MAX_RENDER_PIXELS = 4_200_000;
  if (w * h > MAX_RENDER_PIXELS) {
    const shrink = Math.sqrt(MAX_RENDER_PIXELS / (w * h));
    w = Math.max(2, Math.floor(w * shrink)); h = Math.max(2, Math.floor(h * shrink));
  }
  return { w, h };
}

export class VillaScene {
  get cameraAspect(): number { return this.camera.aspect; }

  readonly renderer: THREE.WebGLRenderer;
  readonly colliders: VillaCollider[];
  readonly lowSpec: boolean;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(64, 1.6, 0.065, 650);
  private readonly sun = new THREE.DirectionalLight(0xffddad, 2.4);
  private readonly hemi = new THREE.HemisphereLight(0xe1e6e5, 0x8f775e, 2);
  private readonly ambient = new THREE.AmbientLight(0xffe2bd, 0.34);
  private readonly homeModel: ReturnType<typeof createVillaHomeModel>;
  private readonly outdoorModel: ReturnType<typeof createVillaOutdoorModel>;
  private readonly fallbackHome = createVillaHome();
  private readonly fallbackOutdoor = createVillaOutdoor();
  private primaryView: VillaView = { ...VILLA_SPAWN, yaw: 0, pitch: 0, eyeHeight: EYE_HEIGHT };
  private readonly furnishings: ReturnType<typeof furnishVilla>;
  private readonly vehicle: ReturnType<typeof createVillaVehicle>;
  private readonly pickup: ReturnType<typeof createVillaPickupModel>;
  private readonly scooter: ReturnType<typeof createVillaScooterModel>;
  private readonly gaming: ReturnType<typeof createVillaGaming>;
  private readonly elevator: ReturnType<typeof createVillaElevatorModel>;
  private readonly course: ReturnType<typeof createVillaDrivingCourse>;
  private readonly snooker: ReturnType<typeof createVillaSnookerModel>;
  private readonly pets: ReturnType<typeof createVillaPetModel>;
  readonly drivingObstacles: VillaCollider[];
  readonly pickupObstacles: VillaCollider[];
  readonly scooterObstacles: VillaCollider[];
  private readonly elevatorCollisions = createVillaElevatorColliders();
  private readonly environment = reflectionProbe();
  private lastStateKey = '';
  private readonly water: THREE.Mesh;
  private readonly waterMap: THREE.CanvasTexture;
  private readonly sky: THREE.ShaderMaterial;
  private disposed = false;
  private contextLost = false;
  private readonly atmosphereColor = new THREE.Color();
  private readonly securityCamera = new THREE.PerspectiveCamera(66, 16 / 9, .065, 650);
  private securityTarget: THREE.WebGLRenderTarget | null = null;
  private securitySceneTarget: THREE.WebGLRenderTarget | null = null;
  private securityOutput: OutputPass | null = null;
  private securityCanvas: HTMLCanvasElement | null = null;
  private securityContext: CanvasRenderingContext2D | null = null;
  private securityPixels: Uint8Array | null = null;
  private securityImage: ImageData | null = null;
  private securityKey = '';
  private securityLastAt = -Infinity;
  private securityLastTime = -Infinity;
  private readonly cachedFrame = document.createElement('canvas');
  private lastDrawAt = -Infinity;
  private cachedTime = -1;
  private softwareInputFrames = 0;
  private readonly onContextLost = (event: Event) => { event.preventDefault(); this.contextLost = true; this.securityKey = ''; };
  private readonly onContextRestored = () => {
    this.contextLost = false; this.renderer.shadowMap.needsUpdate = true;
    this.securityTarget?.dispose(); this.securityTarget = null;
    this.securitySceneTarget?.dispose(); this.securitySceneTarget = null;
    this.securityOutput?.dispose(); this.securityOutput = null;
    this.securityKey = ''; this.securityLastAt = -Infinity;
    this.softwareInputFrames = 0; this.lastStateKey = '';
  };

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
    this.scene.fog = new THREE.Fog(0xd6cbbb, 105, 330);
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
    const estateX = (VILLA_ESTATE_BOUNDS.minX + VILLA_ESTATE_BOUNDS.maxX) / 2, estateZ = (VILLA_ESTATE_BOUNDS.minZ + VILLA_ESTATE_BOUNDS.maxZ) / 2;
    const skyDome = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 12), this.sky);
    skyDome.position.set(estateX, 0, estateZ); this.scene.add(skyDome);

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
    this.homeModel = createVillaHomeModel(this.scene);
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
        if (i % 3 === 0) box(x, top - 0.065, z + Math.sign(r.startZ - r.endZ) * 0.251, w * 0.66, 0.012, 0.009, this.homeModel.glow(`gallery-${Math.round(r.base / 3.6)}`));
      }
      for (const x of [r.minX - 0.045, r.maxX + 0.045]) {
        beam(new THREE.Vector3(x, r.bottom + 1.06, r.startZ), new THREE.Vector3(x, r.top + 1.06, r.endZ), 0.033, materials.oak);
        for (let i = 0; i <= 12; i += 2) {
          const y = r.bottom + (r.top - r.bottom) * i / 12, z = r.startZ + (r.endZ - r.startZ) * i / 12;
          box(x, y + 0.54, z, 0.028, 1.04, 0.028, materials.bronze);
        }
      }
    }
    for (const base of [0, 3.6]) box(1.2, base + 1.7, -6.2, 3.8, 0.2, 1.4, materials.oak);
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
    box(estateX, -1.2, estateZ, 680, .12, 680, grass);
    // One shared, metre-sampled lawn with real pool and pond holes; no duplicate
    // flat south slab hides the rolling support or bridges the water opening.
    batch(createVillaTerrainGeometry(), grass);
    // Concrete spans all four garage bays; its shell belongs to World.
    const garage = VILLA_GARAGE_EXTENT;
    box((garage.minX + garage.maxX) / 2, -.025, (garage.minZ + garage.maxZ) / 2, garage.maxX - garage.minX, .08, garage.maxZ - garage.minZ, materials.stone);
    box(9.25, 3.61, -4, 5.45, 0.025, 9.8, materials.stone);
    box(0, -0.015, 15.9, 3.8, 0.055, 13.5, materials.stone);
    box(8, -0.015, 11, 13, 0.055, 2.2, materials.stone);
    box(-13.15, -0.01, 0, 2.2, 0.06, 20, materials.stone);
    for (let i = 0; i < 11; i++) box(-2.5 - i * 1.16, 0.008, 11.5, 0.92, 0.07, 1.2, materials.stone);
    for (let i = 0; i < 7; i++) box(0, 0.018, 10.5 + i * 1.7, 3.55, 0.02, 0.018, materials.bronze);
    const poolTile = new THREE.MeshStandardMaterial({ map: texture('tile'), roughness: 0.42 });
    const cx = (POOL.minX + POOL.maxX) / 2, cz = (POOL.minZ + POOL.maxZ) / 2;
    const poolWidth = POOL.maxX - POOL.minX, poolLength = POOL.maxZ - POOL.minZ;
    const wall = .15, coping = .36;
    // POOL describes the water opening. Walls and coping sit OUTSIDE it, so no
    // lawn or stone top spans the unsupported swimming area as dimensions grow.
    box(cx, -1.04, cz, poolWidth + wall * 2, .14, poolLength + wall * 2, poolTile);
    for (const side of [-1, 1]) {
      const edgeX = side < 0 ? POOL.minX : POOL.maxX, edgeZ = side < 0 ? POOL.minZ : POOL.maxZ;
      box(edgeX + side * wall / 2, -.51, cz, wall, 1.1, poolLength + wall * 2, poolTile);
      box(edgeX + side * coping / 2, .015, cz, coping, .09, poolLength, materials.stone);
      box(cx, -.51, edgeZ + side * wall / 2, poolWidth, 1.1, wall, poolTile);
      box(cx, .015, edgeZ + side * coping / 2, poolWidth + coping * 2, .09, coping, materials.stone);
    }
    // Thin ground finish under the relocated loungers, not a raised obstacle.
    // Top remains 2cm above ground support; no plank enters the water opening.
    const deckMinX = POOL.minX - .3, deckMaxX = POOL.maxX + .5;
    const deckMinZ = POOL.maxZ + .2, deckMaxZ = POOL.maxZ + 4;
    const deck = materials.oak.clone(); deck.color.set('#ba9570'); deck.roughness = .82; deck.name = 'Poolside cedar deck';
    const deckWidth = deckMaxX - deckMinX, deckLength = deckMaxZ - deckMinZ;
    const deckX = (deckMinX + deckMaxX) / 2, deckZ = (deckMinZ + deckMaxZ) / 2;
    box(deckX, -.02, deckZ, deckWidth, .04, deckLength, deck);
    const plankCount = Math.ceil(deckLength / .19), pitch = deckLength / plankCount;
    for (let i = 0; i < plankCount; i++) box(deckX, .008, deckMinZ + (i + .5) * pitch, deckWidth - .08, .024, pitch - .008, deck);
    for (const x of [deckMinX + .018, deckMaxX - .018]) box(x, .008, deckZ, .036, .024, deckLength, deck);
    this.waterMap = texture('water');
    this.waterMap.repeat.set(poolWidth / 2.5, poolLength / 2.75);
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(poolWidth, poolLength), new THREE.MeshPhongMaterial({
      color: 0x5aaeb6, specular: 0xffecc8, shininess: 110, transparent: true, opacity: 0.64,
      bumpMap: this.waterMap, bumpScale: 0.065, side: THREE.DoubleSide, depthWrite: false,
    }));
    this.water.name = 'villa-pool-water';
    this.water.rotation.x = -Math.PI / 2; this.water.position.set(cx, -0.035, cz); this.scene.add(this.water);
    // Stainless ladder follows the near pool edge and lands between the loungers.
    const ladderInsideZ = POOL.maxZ - .5, ladderDeckZ = POOL.maxZ + .35;
    for (const x of [cx - .4, cx + .4]) {
      beam(new THREE.Vector3(x, -.75, ladderInsideZ), new THREE.Vector3(x, .55, ladderInsideZ), .035, materials.bronze);
      beam(new THREE.Vector3(x, .55, ladderInsideZ), new THREE.Vector3(x, .55, ladderDeckZ), .035, materials.bronze);
      beam(new THREE.Vector3(x, .55, ladderDeckZ), new THREE.Vector3(x, .03, ladderDeckZ), .035, materials.bronze);
    }
    for (let y = -.65; y <= .1; y += .25) box(cx, y, ladderInsideZ, .85, .03, .13, materials.bronze);

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
        if (i % 2 === 0) { const g = new THREE.SphereGeometry(0.045, 8, 6); g.translate(x, y - 0.085, z); batch(g, this.homeModel.glow('terrace')); }
      }
    }
    // One continuous terrain-following estate perimeter; no internal x24.8 or
    // z57 fence remains across the expanded garage and south scenic road.
    const fence = createVillaEstateFence(this.scene, materials.oak);
    this.colliders.push(...fence.colliders);
    for (const z of [11, 15, 19]) for (const x of [-2.3, 2.3]) {
      box(x, 0.3, z, 0.11, 0.6, 0.11, materials.bronze);
      box(x, 0.56, z, 0.115, 0.08, 0.115, this.homeModel.glow('garden'));
    }
    // HomeModel supplies all room fixtures/gallery strips and its six shared
    // point-light slots. No duplicate fixed lamps or global always-on grid.
    for (const [material, geometries] of batches) {
      const merged = mergeGeometries(geometries);
      if (merged) {
        const mesh = new THREE.Mesh(merged, material); mesh.castShadow = !material.transparent && !material.name.startsWith('villa-lamp/'); mesh.receiveShadow = true; this.scene.add(mesh);
      }
      geometries.forEach(g => g.dispose());
    }
    // A quiet distant landscape beyond the property, not an empty void.
    const hillMat = new THREE.MeshStandardMaterial({ color: 0x728b7e, roughness: 1 });
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2;
      const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), hillMat);
      hill.position.set(estateX + Math.cos(a) * 145, -6, estateZ + Math.sin(a) * 195);
      hill.scale.set(24 + i % 3 * 8, 13 + i % 4 * 4, 25); this.scene.add(hill);
    }
    this.furnishings = furnishVilla(this.scene);
    this.vehicle = createVillaVehicle(this.scene);
    this.pickup = createVillaPickupModel(this.scene);
    this.scooter = createVillaScooterModel(this.scene);
    this.gaming = createVillaGaming(this.scene);
    this.elevator = createVillaElevatorModel(this.scene);
    this.course = createVillaDrivingCourse(this.scene);
    this.snooker = createVillaSnookerModel(this.scene);
    const garden = createVillaGarden(this.scene), estate = createVillaEstateModel(this.scene);
    this.outdoorModel = createVillaOutdoorModel(this.scene);
    this.outdoorModel.update(this.fallbackOutdoor, this.primaryView, this.primaryView.yaw);
    this.pets = createVillaPetModel(this.scene);
    this.colliders.push(...this.furnishings.colliders, ...this.vehicle.colliders, ...this.pickup.colliders, ...this.scooter.colliders, ...this.gaming.colliders, ...this.elevatorCollisions.colliders, ...this.course.colliders, ...garden.colliders, ...estate.colliders, ...this.outdoorModel.colliders);
    // Keep live identities: each vehicle ignores ONLY itself, collides with both
    // other vehicles, and stops before pets (walkers do not collide with pets).
    this.drivingObstacles = [...this.colliders.filter(c => !isVillaVehicleCollider(c)), ...this.pets.drivingColliders];
    this.pickupObstacles = [...this.colliders.filter(c => !isVillaPickupCollider(c)), ...this.pets.drivingColliders];
    this.scooterObstacles = [...this.colliders.filter(c => !isVillaScooterCollider(c)), ...this.pets.drivingColliders];
    this.addContactShadows([...this.furnishings.colliders, ...this.gaming.colliders, ...garden.colliders]);
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
    // Contact shadows belong on floors, not beneath elevated drawers or mirrors.
    const parts = colliders.filter(collider => [0, 3.6, 7.2].some(y => Math.abs(collider.minY - y) < .08)).map(collider => {
      const g = new THREE.PlaneGeometry((collider.maxX - collider.minX) * 1.42, (collider.maxZ - collider.minZ) * 1.42);
      g.rotateX(-Math.PI / 2);
      g.translate((collider.minX + collider.maxX) / 2, collider.minY + 0.039, (collider.minZ + collider.maxZ) / 2);
      return g;
    });
    const geometry = mergeGeometries(parts);
    parts.forEach(g => g.dispose());
    if (geometry) { const mesh = new THREE.Mesh(geometry, material); mesh.name = 'villa-contact-shadows'; this.scene.add(mesh); }
    else { material.dispose(); map.dispose(); }
  }

  /** Advance collisions even between cached frames or while terminal tabs skip
   * main rendering. A security camera is NEVER the carried-chair visitor. */
  updateActivities(time: number, state: VillaSceneState, position?: VillaPosition, yaw?: number) {
    if (position && [position.x, position.y, position.z].every(Number.isFinite)) {
      this.primaryView = { ...this.primaryView, x: position.x, y: position.y, z: position.z };
    }
    if (yaw !== undefined && Number.isFinite(yaw)) this.primaryView.yaw = yaw;
    if (this.outdoorModel.update(state.outdoor ?? this.fallbackOutdoor, this.primaryView, this.primaryView.yaw)) this.renderer.shadowMap.needsUpdate = true;
    // Wardrobe hinges and narrow phases must be current for the controller's
    // tentative-advance/overlap/rollback, including all six cached input frames.
    const home = this.homeState(state);
    if (this.furnishings.update(time, { ...state, roomLights: home.roomLights, nightFactor: home.darkness })) this.renderer.shadowMap.needsUpdate = true;
    if (this.vehicle.update(time, state)) this.renderer.shadowMap.needsUpdate = true;
    if (this.pickup.update(time, state)) this.renderer.shadowMap.needsUpdate = true;
    if (this.scooter.update(time, state)) this.renderer.shadowMap.needsUpdate = true;
    this.elevatorCollisions.update(state.elevator);
    if (this.elevator.update(state.elevator)) this.renderer.shadowMap.needsUpdate = true;
    if (this.snooker.update(state.snooker, state.snookerActive)) this.renderer.shadowMap.needsUpdate = true;
    this.course.update(state.driving);
    this.updatePets(time, state.pets);
  }

  /** Keep the vehicle-only pet bounds in sync without dirtying baked sun shadows. */
  updatePets(time: number, state: VillaPetsState) { if (state) this.pets.update(time, state); }

  get carDoorProgress(): number { return this.vehicle.doorProgress; }
  get pickupDoorProgress(): number { return this.pickup.doorProgress; }

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

  private homeState(state: VillaSceneState): VillaHomeState {
    if (state.home) return state.home;
    // Legacy fixtures retain their day/evening switch; real sessions supply
    // continuously blended Home state advanced by the controller.
    this.fallbackHome.timeOfDay = state.evening ? 'evening' : 'day';
    this.fallbackHome.darkness = state.evening ? .43 : 0;
    this.fallbackHome.revision = state.evening ? 1 : 0;
    return this.fallbackHome;
  }

  private primaryEye(): VillaPosition {
    const view = this.primaryView;
    return { x: view.x, y: view.y + (view.eyeHeight ?? EYE_HEIGHT), z: view.z };
  }

  /** Read blended Home values on actual rendered frames, never a new cache
   * revision for each tiny lighting/rain transition. */
  private updateAtmosphere(home: VillaHomeState): void {
    const a = villaAtmosphere(home);
    const blend = (color: THREE.Color, day: string, evening: string, night: string, rain: string) => {
      if (a.darkness <= .43) color.set(day).lerp(this.atmosphereColor.set(evening), a.darkness / .43);
      else color.set(evening).lerp(this.atmosphereColor.set(night), a.night);
      color.lerp(this.atmosphereColor.set(rain), a.rain * (1 - a.night * .58));
    };
    blend(this.sky.uniforms.top.value, '#82b0d0', '#748fa7', '#17283f', '#657681');
    blend(this.sky.uniforms.horizon.value, '#e1e6db', '#f2c9a4', '#49596e', '#8b9698');
    blend(this.sun.color, '#fff0da', '#ffd09a', '#aac5e7', '#cad4d9');
    blend(this.hemi.color, '#e1e6e5', '#cbd9e2', '#7e9bbd', '#a1b2bc');
    blend(this.hemi.groundColor, '#8f775e', '#927053', '#4d5965', '#707770');
    blend(this.ambient.color, '#ffe2bd', '#ffdec0', '#b3c7dd', '#c3ccd1');
    this.sky.uniforms.sunColor.value.copy(this.sun.color).multiplyScalar((1 - a.night * .82) * (1 - a.rain * .84));
    this.sun.intensity = a.sun; this.hemi.intensity = a.hemisphere; this.ambient.intensity = a.ambient;
    this.renderer.toneMappingExposure = a.exposure;
    this.scene.environmentIntensity = .32 * (1 - a.darkness * .72) * (1 - a.rain * .3);
    const fog = this.scene.fog as THREE.Fog;
    blend(fog.color, '#d6dbd1', '#d6c4ae', '#526175', '#8b999f'); fog.near = a.fogNear; fog.far = a.fogFar;
  }

  /** Shared actual-render preparation; CCTV cannot depend on a hidden main
   * render refreshing furnishings, pets, room lights, water or rain first. */
  private prepareVisuals(time: number, state: VillaSceneState, eye: VillaPosition): void {
    const home = this.homeState(state);
    this.updateAtmosphere(home); this.homeModel.update(time, home, eye);
    this.waterMap.offset.set(Math.sin(time * .025) * .12, time * .012 % 1);
    this.water.position.y = -.035 + Math.sin(time * .8) * .008;
    this.gaming.update(time, state);
  }

  /** A real selected scene camera, rendered only on demand and at most 2Hz.
   * Nothing is fetched and no synthetic replacement image is generated. */
  renderSecurityFeed(id: string, time: number, state: VillaSceneState): HTMLCanvasElement | null {
    if (this.disposed || this.contextLost || !Number.isFinite(time)) return null;
    if (this.renderer.getContext().isContextLost()) { this.securityKey = ''; return null; }
    const selected = VILLA_SECURITY_CAMERAS.find(camera => camera.id === id);
    if (!selected) return null;
    const home = this.homeState(state), key = `${id}/${home.revision}`, now = performance.now();
    if (key === this.securityKey && this.securityCanvas && time >= this.securityLastTime && now - this.securityLastAt < VILLA_SECURITY_FEED_SIZE.intervalMs) return this.securityCanvas;
    const { width, height } = VILLA_SECURITY_FEED_SIZE;
    if (!this.securityCanvas) {
      this.securityCanvas = document.createElement('canvas'); this.securityCanvas.width = width; this.securityCanvas.height = height;
      this.securityContext = this.securityCanvas.getContext('2d');
      if (!this.securityContext) { this.securityCanvas = null; return null; }
      this.securityImage = this.securityContext.createImageData(width, height); this.securityPixels = new Uint8Array(width * height * 4);
    }
    if (!this.securityTarget) {
      this.securityTarget = new THREE.WebGLRenderTarget(width, height, { format: THREE.RGBAFormat, type: THREE.UnsignedByteType, depthBuffer: false, stencilBuffer: false, samples: 0 });
      this.securityTarget.texture.generateMipmaps = false; this.securityTarget.texture.name = 'villa-live-security-feed';
      // Three intentionally bypasses tone mapping for ordinary render targets.
      // One tiny output blit applies the renderer's ACES/exposure/sRGB transform
      // before byte readback, rather than clipping bright raw-linear lighting.
      const hdr = this.renderer.extensions.has('EXT_color_buffer_float');
      this.securitySceneTarget = new THREE.WebGLRenderTarget(width, height, { format: THREE.RGBAFormat, type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType, depthBuffer: true, stencilBuffer: false, samples: 0 });
      this.securitySceneTarget.texture.generateMipmaps = false; this.securitySceneTarget.texture.name = 'villa-security-scene-linear';
      this.securityOutput = new OutputPass();
    }
    const renderer = this.renderer, previousTarget = renderer.getRenderTarget(), previousFace = renderer.getActiveCubeFace(), previousMip = renderer.getActiveMipmapLevel();
    const previousSize = renderer.getSize(new THREE.Vector2()), previousRatio = renderer.getPixelRatio();
    const previousViewport = renderer.getViewport(new THREE.Vector4()), previousScissor = renderer.getScissor(new THREE.Vector4()), previousScissorTest = renderer.getScissorTest();
    const primary = { ...this.primaryView }, eye = this.primaryEye();
    try {
      this.updateActivities(time, state); // cars, doors, pets, swing, carried chair
      this.prepareVisuals(time, state, selected.position);
      this.securityCamera.position.set(selected.position.x, selected.position.y, selected.position.z);
      this.securityCamera.up.set(0, 1, 0); this.securityCamera.lookAt(selected.target.x, selected.target.y, selected.target.z); this.securityCamera.updateMatrixWorld(true);
      renderer.setRenderTarget(this.securitySceneTarget); renderer.setScissorTest(false); renderer.clear(true, true, true);
      renderer.render(this.scene, this.securityCamera);
      this.securityOutput!.render(renderer, this.securityTarget, this.securitySceneTarget!, 0, false);
      renderer.readRenderTargetPixels(this.securityTarget, 0, 0, width, height, this.securityPixels!);
      if (this.contextLost || renderer.getContext().isContextLost()) { this.securityKey = ''; return null; }
      villaFlipSecurityPixels(this.securityPixels!, this.securityImage!.data, width, height);
      this.securityContext!.putImageData(this.securityImage!, 0, 0);
      this.securityKey = key; this.securityLastAt = performance.now(); this.securityLastTime = time;
      return this.securityCanvas;
    } catch {
      // Context loss/readback failure is a recoverable unavailable feed, never a
      // fake frozen image labelled live, and must not corrupt the main renderer.
      this.securityKey = ''; return null;
    } finally {
      this.primaryView = primary;
      // Recenter BOTH the six light slots and rain streak geometry, not only the
      // camera transform. The primary camera itself was never mutated.
      this.homeModel.update(time, home, eye);
      this.homeModel.setView(home, eye);
      try {
        if (renderer.getPixelRatio() !== previousRatio) renderer.setPixelRatio(previousRatio);
        const size = renderer.getSize(new THREE.Vector2());
        if (!size.equals(previousSize)) renderer.setSize(previousSize.x, previousSize.y, false);
        renderer.setRenderTarget(previousTarget, previousFace, previousMip);
        renderer.setViewport(previousViewport); renderer.setScissor(previousScissor); renderer.setScissorTest(previousScissorTest);
      } catch { /* A lost GL context is restored by the renderer's normal handler. */ }
    }
  }

  render(ctx: CanvasRenderingContext2D, width: number, height: number, pixelRatio: number, view: VillaView, time: number, state: VillaSceneState): boolean {
    if (this.disposed || this.contextLost) return false;
    const { w, h } = villaRendererSize(width, height, pixelRatio, this.lowSpec);
    const now = performance.now();
    const stateKey = villaSceneInputKey(state);
    this.primaryView = { ...view };
    this.updateActivities(time, state, view, view.yaw);
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
    this.camera.rotation.set(view.pitch, view.yaw, view.roll ?? 0, 'YXZ');
    this.prepareVisuals(time, state, this.camera.position);
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
    this.securityTarget?.dispose(); this.securityTarget = null;
    this.securitySceneTarget?.dispose(); this.securitySceneTarget = null;
    this.securityOutput?.dispose(); this.securityOutput = null;
    if (this.securityCanvas) this.securityCanvas.width = this.securityCanvas.height = 0;
    this.securityCanvas = null; this.securityContext = null; this.securityPixels = null; this.securityImage = null; this.securityKey = '';
    this.sun.shadow.map?.dispose();
    this.renderer.dispose(); this.renderer.forceContextLoss(); this.scene.clear();
    this.cachedFrame.width = this.cachedFrame.height = 0;
  }
}
