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
import { createVillaSuvModel } from './villaSuvModel.js';
import { isVillaPickupCollider, type VillaPickupState } from './villaPickup.js';
import { isVillaSuvCollider, type VillaSuvState } from './villaSuv.js';
import { createVillaEstateModel } from './villaEstateModel.js';
import { createVillaStreamModel, createVillaPeripheralLandscape } from './villaStreamModel.js';
import { VILLA_ESTATE_BOUNDS } from './villaEstateLayout.js';
import { createVillaEnvelope } from './villaEnvelope.js';
import { createVillaStairAndGuards, createVillaPergola } from './villaCirculationModel.js';
import { createVillaPoolside } from './villaPoolside.js';
import {poolCirculation} from './villaPoolCirculation.js';
import { createVillaPoolFinishMaps } from './villaWeatheredPool.js';
import { addVillaDistantRidges } from './villaDistantRidges.js';
import { VillaStaticView } from './villaStaticView.js';
import { indexVillaRigidSurfaces } from './villaIndexedSurface.js';
import { VillaFrameReadback } from './villaFrameReadback.js';
import { fixedVillaContactColliders } from './villaBakedContact.js';
import { createVillaEstateFence, createVillaTerrainGeometry } from './villaTerrainModel.js';
import { createVillaScooterModel } from './villaScooterModel.js';
import { isVillaScooterCollider, type VillaScooterState } from './villaScooter.js';
import { createVillaDrivingCourse } from './villaDrivingCourse.js';
import type { VillaRaceState } from './villaRacing.js';
import type { VillaSnookerState } from './villaSnooker.js';
import { createVillaSnookerModel } from './villaSnookerModel.js';
import { createVillaGarden } from './villaGarden.js';
import { createCultivatedGround, tintManagedLawn } from './villaGardenFloor.js';
import { createVillaFenceBankGeometry } from './villaFenceBank.js';
import { courtyardSwatches, dressSurveyedHardscape } from './villaSoilFinishes.js';
import { installVillaRoomMirrors } from './villaInteriorMirror.js';
import {insideOccupiedFabric} from './villaMillFinish.js';
import { interiorSwatches, bindRoomSurfaces } from './villaInteriorSurfaces.js';
import { addSurveyedSun } from './villaSolarSurvey.js';
import { installVillaOrchardLight } from './villaOrchardSurface.js';
import { createVillaShelterPlanting } from './villaShelterPlanting.js';
import { createVillaPetModel } from './villaPetModel.js';
import type { VillaPetsState } from './villaPets.js';
import { createVillaHome, villaAtmosphere, VILLA_SECURITY_CAMERAS, type VillaHomeState } from './villaHome.js';
import { createVillaHomeModel } from './villaHomeModel.js';
import { createVillaOutdoor, type VillaOutdoorState } from './villaOutdoor.js';
import { createVillaOutdoorModel } from './villaOutdoorModel.js';
import {
  EYE_HEIGHT, VILLA_SPAWN, VILLA_RAILS, VILLA_WALL_COLLIDERS,
  type VillaCollider, type VillaMaterial, type VillaPosition,
} from './villaWorld.js';

export interface VillaView extends VillaPosition { yaw: number; pitch: number; roll?: number; eyeHeight?: number; fov?: number }
export type VillaSceneState = VillaFurnishingState & VillaActivityState & {
  elevator: VillaElevatorState; driving: VillaDrivingState; scooter: VillaScooterState; race: VillaRaceState;
  /** Optional only for old scene snapshots; each model supplies its own spawn. */
  pickup?: VillaPickupState; suv?: VillaSuvState;
  home?: VillaHomeState; outdoor?: VillaOutdoorState;
  snooker: VillaSnookerState; snookerActive: boolean; pets: VillaPetsState;
};

/** Discrete inputs only. Animation clocks, rain/light blends, wardrobe progress,
 * swing angle and carried-chair/player motion must NEVER bypass the six RAFs. */
export function villaSceneInputKey(state: VillaSceneState): string {
  const wardrobes = Object.entries(state.wardrobes?.wardrobes ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([id, w]) => `${id}:${w.open}`).join(',');
  const camp = state.outdoor?.camping;
  const camping = !camp ? 'legacy' : camp.carried ? 'carried' : `placed:${camp.x},${camp.y},${camp.z},${camp.yaw}`;
  // Targets invalidate a cached input frame immediately; eased fractions still
  // obey the same bounded animation cadence as wardrobes and vehicles.
  const doors = `${!!state.bathDoors?.west},${!!state.bathDoors?.east}`;
  const grills = (state.grillLids ?? [false, false, false]).map(Number).join(',');
  return `${state.evening}/${state.gaming}/${state.fireplace}/${state.carDoorOpen}/${!!state.pickupDoorOpen}/${!!state.suvDoorOpen}/${state.seated}/${state.screenSource}/${state.displayLights}/${state.elevator.phase}/${state.elevator.target}/${state.snookerActive}/${!!state.faucetOn}/${state.pets?.feedSequence ?? 0}/${state.teaUntil ?? 0}/${state.home?.revision ?? 0}/${state.tea?.phase ?? 'idle'}/${wardrobes}/${state.snooker.aimAssist !== false}/${state.aquariumOn !== false}/${camping}/${doors}/${grills}`;
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

function texture(kind: 'oak' | 'stone' | 'plaster'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  let seed = 73;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  ctx.fillStyle = { oak: '#bd9872', stone: '#d7cdbb', plaster: '#f0e6d5' }[kind];
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4200; i++) {
    const light = random() > 0.5;
    ctx.fillStyle = light ? 'rgba(255,249,224,.065)' : 'rgba(51,37,23,.065)';
    ctx.fillRect(random() * 256, random() * 256, 1, 1);
  }
  if (kind === 'oak') {
    for (let i = 0; i < 240; i++) {
      const y = random() * 256;
      ctx.strokeStyle = `rgba(82,45,19,${random() * 0.1})`;
      ctx.beginPath(); ctx.moveTo(0, y);
      ctx.bezierCurveTo(80, y - 7 * random(), 160, y + 7 * random(), 256, y); ctx.stroke();
    }
    // Board ends and V-joints are now physical. Keep only the medullary rays on the wood
    // itself, or a frame member/board would carry a second, unrelated set of plank outlines.
    for (let i = 0; i < 110; i++) {
      const x = random()*256, y = random()*256, span = 1.4+random()*9;
      ctx.strokeStyle = 'rgba(241,215,161,.16)'; ctx.lineWidth = .48+random()*.64;
      ctx.beginPath(); ctx.moveTo(x,y); ctx.quadraticCurveTo(x+span*.45,y+.42,x+span,y-.24); ctx.stroke();
    }
  } else if (kind === 'stone') {
    // Sparse travertine pores follow the bedding direction; no painted stone joints.
    for (let i=0;i<500;i++) {
      const x=random()*256,y=random()*256;
      ctx.fillStyle=`rgba(118,99,73,${.05+random()*.12})`;ctx.beginPath();
      ctx.ellipse(x,y,.4+random()*2.2,.23+random()*.45,-.16,0,2*Math.PI);ctx.fill();
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
  // A fractional scale alone still rasterises millions of pixels at large desktop sizes.
  // Budget only the offscreen world on positively identified software GL, not the HUD,
  // camera, geometry or the hardware path. 640×360 is the 16:9 software ceiling.
  const MAX_RENDER_PIXELS = lowSpec ? 230_400 : 4_200_000;
  if (w * h > MAX_RENDER_PIXELS) {
    const shrink = Math.sqrt(MAX_RENDER_PIXELS / (w * h));
    w = Math.max(2, Math.floor(w * shrink)); h = Math.max(2, Math.floor(h * shrink));
  }
  return { w, h };
}

export class VillaScene {
  get cameraAspect(): number { return this.camera.aspect; }

  /** Projection belongs to the host viewport, even during a terminal feed or cached-input
   * frame. The next actual frame must use this aspect, even if rounding kept the raster size. */
  setPrimaryAspect(width: number, height: number) {
    if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))) return;
    const aspect = width / height;
    if (this.camera.aspect !== aspect) { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); }
    if (width === this.requestedWidth && height === this.requestedHeight) return;
    this.requestedWidth=width; this.requestedHeight=height;
    if (this.lowSpec && this.readback && this.cachedAspect>0 && this.lastStateKey) {
      if(this.readback.pending) this.readback.cancel();
      this.resizing=true; this.resizeLead=true; this.softwareInputFrames=0;
    } else this.invalidateCameraFrame();
  }
  /** A restart, material change or superseding cut invalidates the actual pixels, not just their camera. */
  invalidateCameraFrame() {
    if (this.readback?.pending) this.readback.cancel();
    this.homeCutKey = null;
    this.lastStateKey=''; this.softwareInputFrames=0; this.inputLeadSpent=false; this.resizing=this.resizeLead=false;
  }

  /** Unlike a continuous refresh, Home must NEVER display the previous location while the GPU is busy. */
  beginHomeCameraCut(destination: VillaSceneState) {
    const hasPrevious = this.cachedAspect > 0 && Number.isFinite(this.lastDrawAt) && (this.lastStateKey || this.homeCutKey);
    this.invalidateCameraFrame(); // Retire even a prior Home ticket with an identical state key.
    if (hasPrevious && this.lowSpec && this.readback && !this.disposed && !this.contextLost) {
      this.homeCutKey = villaSceneInputKey(destination);
    }
  }

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
  private readonly stream: ReturnType<typeof createVillaStreamModel>;
  private readonly staticView: VillaStaticView;
  private readonly fallbackHome = createVillaHome();
  private readonly fallbackOutdoor = createVillaOutdoor();
  private primaryView: VillaView = { ...VILLA_SPAWN, yaw: 0, pitch: 0, eyeHeight: EYE_HEIGHT };
  private readonly furnishings: ReturnType<typeof furnishVilla>;
  private readonly vehicle: ReturnType<typeof createVillaVehicle>;
  private readonly pickup: ReturnType<typeof createVillaPickupModel>;
  private readonly suv: ReturnType<typeof createVillaSuvModel>;
  private readonly scooter: ReturnType<typeof createVillaScooterModel>;
  private readonly gaming: ReturnType<typeof createVillaGaming>;
  private readonly elevator: ReturnType<typeof createVillaElevatorModel>;
  private readonly course: ReturnType<typeof createVillaDrivingCourse>;
  private readonly snooker: ReturnType<typeof createVillaSnookerModel>;
  private readonly pets: ReturnType<typeof createVillaPetModel>;
  readonly drivingObstacles: VillaCollider[];
  readonly pickupObstacles: VillaCollider[];
  readonly suvObstacles: VillaCollider[];
  readonly scooterObstacles: VillaCollider[];
  private readonly elevatorCollisions = createVillaElevatorColliders();
  private readonly environment = reflectionProbe();
  private lastStateKey = '';
  // Non-null from an explicit Home cut until its first matching destination pixels are installed.
  private homeCutKey: string | null = null;
  private readonly poolFlow=poolCirculation();
  private readonly updatePond: ReturnType<typeof createVillaEstateModel>['updatePond'];
  private readonly roomMirrors: ReturnType<typeof installVillaRoomMirrors>;
  private readonly roomSwatches: ReturnType<typeof interiorSwatches>;
  private readonly groundSwatches: ReturnType<typeof courtyardSwatches>;
  private readonly surveyedSun: ReturnType<typeof addSurveyedSun>;
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
  private readonly queuedCamera = new THREE.PerspectiveCamera();
  private readback: VillaFrameReadback | null = null;
  private requestedWidth=0; private requestedHeight=0; private cachedAspect=0;
  private resizing=false; private resizeLead=false;
  private queuedTime = -1;
  private queuedWidth=0; private queuedHeight=0;
  private lastInputTime = -1;
  private lastDrawAt = -Infinity;
  private cachedTime = -1;
  private softwareInputFrames = 0;
  private inputLeadSpent = false;

  /** A new movement gesture may arrive on the very RAF due to do a slow CPU draw.
   * Give simulation/input at most three cached RAFs to respond first. Auto-repeat or
   * changing direction cannot postpone the next picture indefinitely. Actions/resize
   * still invalidate the cache unconditionally; never synthesize displacement or dt. */
  beginMovementInput() {
    if (!this.lowSpec || this.inputLeadSpent || !this.lastStateKey) return;
    this.softwareInputFrames = Math.max(this.softwareInputFrames,3);
    this.inputLeadSpent = true;
  }
  private readonly onContextLost = (event: Event) => {
    event.preventDefault(); this.contextLost = true; this.securityKey = '';
    this.readback?.dispose(); this.readback = null;
    this.invalidateCameraFrame();
  };
  private readonly onContextRestored = () => {
    this.contextLost = false; this.renderer.shadowMap.needsUpdate = true;
    const gl = this.renderer.getContext();
    this.readback = 'fenceSync' in gl ? new VillaFrameReadback(gl) : null;
    this.queuedTime = this.lastInputTime = -1;
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
    this.readback = 'fenceSync' in gl ? new VillaFrameReadback(gl) : null; // No buffer allocation on the hardware path.
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
    // Opaque depth is already known when shading the backdrop. Particularly on CPU GL,
    // do not evaluate this sky shader behind every wall, then cover it again with the ground.
    skyDome.renderOrder = 10_000;
    skyDome.position.set(estateX, 0, estateZ); this.scene.add(skyDome);

    const finishReady=()=>{this.invalidateCameraFrame();this.securityKey='';};
    this.groundSwatches=courtyardSwatches(finishReady);
    // The pale fallback and each commissioned surface depict the SAME room and
    // camera. Let the next ordinary refresh pick them up; five sequential mirror
    // decodes must not each cancel Home or force a synchronous GL readback.
    const indoorReady=()=>{this.securityKey='';};this.roomSwatches=interiorSwatches(indoorReady);
    const exteriorTimber=new THREE.MeshStandardMaterial({map:this.groundSwatches.maps.timber,roughness:.93,vertexColors:true});exteriorTimber.name='weathered-garden-joinery';
    const oak = texture('oak'), stone = texture('stone'), plaster = texture('plaster');
    const materials: Record<VillaMaterial, THREE.MeshStandardMaterial> & {exteriorTimber:THREE.MeshStandardMaterial} = {
      exteriorTimber,
      oak: new THREE.MeshStandardMaterial({ map: oak, roughness: 0.67 }),
      stone: new THREE.MeshStandardMaterial({ map: stone, roughness: 0.88 }),
      plaster: new THREE.MeshStandardMaterial({ map: plaster, roughness: 0.95 }),
      glass: new THREE.MeshStandardMaterial({ color: 0xc5dfe0, roughness: 0.13, metalness: 0.15, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide }),
      bronze: new THREE.MeshStandardMaterial({ color: 0x554a3c, roughness: 0.42, metalness: 0.42 }),
      roof: new THREE.MeshStandardMaterial({ color: 0xa99b83, roughness: 0.8 }),
    };
    this.homeModel = createVillaHomeModel(this.scene);
    const glow = (id: string) => this.homeModel.glow(id);
    createVillaEnvelope(this.scene, materials);
    createVillaStairAndGuards(this.scene, materials, glow);
    this.colliders = [...VILLA_WALL_COLLIDERS, ...VILLA_RAILS, ...createVillaPergola(this.scene, materials, glow('terrace'))];
    const poolFinishes=createVillaPoolFinishMaps();
    createVillaPoolside(this.scene,materials,poolFinishes.tile,poolFinishes.ripple,glow('garden'),this.poolFlow);
    const grass = new THREE.MeshStandardMaterial({ map:this.groundSwatches.maps.turf,roughness:.99,vertexColors:true });grass.name='living-lawn';
    const meadow = new THREE.Mesh(tintManagedLawn(createVillaTerrainGeometry('shared')), grass); meadow.name = 'estate-lawn'; meadow.receiveShadow = true; this.scene.add(meadow);
    const bankMesh=new THREE.Mesh(tintManagedLawn(createVillaFenceBankGeometry()),grass);bankMesh.name='estate-turf-shoulder';bankMesh.receiveShadow=true;this.scene.add(bankMesh);
    const distantTurf=grass.clone();distantTurf.vertexColors=false;distantTurf.color.set('#aaad8c');
    const distantGround = new THREE.Mesh(new THREE.PlaneGeometry(680,680), distantTurf);
    distantGround.geometry.getAttribute('uv').setXY(0,0,272).setXY(1,272,272).setXY(2,0,0).setXY(3,272,0);
    distantGround.renderOrder=9_999; distantGround.rotation.x = -Math.PI/2; distantGround.position.set(estateX,-1.14,estateZ); this.scene.add(distantGround);
    const fenceWood=new THREE.MeshStandardMaterial({map:this.groundSwatches.maps.timber,color:0xb7ab97,roughness:.96,vertexColors:true});fenceWood.name='garden-fence-seasoned-stock';
    const fence = createVillaEstateFence(this.scene,fenceWood); this.colliders.push(...fence.colliders);
    const gardenGravel=new THREE.MeshStandardMaterial({map:this.groundSwatches.maps.gravel,color:0xffffff,roughness:.99,vertexColors:true});gardenGravel.name='garden-workcourt-grit';
    createCultivatedGround(this.scene,gardenGravel);
    const shelterPlanting=createVillaShelterPlanting(this.scene);this.colliders.push(...shelterPlanting.colliders);
    addVillaDistantRidges(this.scene, estateX, estateZ);
    this.furnishings = furnishVilla(this.scene);
    this.vehicle = createVillaVehicle(this.scene);
    this.pickup = createVillaPickupModel(this.scene);
    this.suv = createVillaSuvModel(this.scene);
    this.scooter = createVillaScooterModel(this.scene);
    this.gaming = createVillaGaming(this.scene);
    this.elevator = createVillaElevatorModel(this.scene);
    this.course = createVillaDrivingCourse(this.scene);
    this.snooker = createVillaSnookerModel(this.scene);
    const garden = createVillaGarden(this.scene), estate = createVillaEstateModel(this.scene);
    this.updatePond=estate.updatePond;
    this.stream = createVillaStreamModel(this.scene); createVillaPeripheralLandscape(this.scene);
    dressSurveyedHardscape(this.scene,this.groundSwatches.maps);
    this.outdoorModel = createVillaOutdoorModel(this.scene);
    this.outdoorModel.update(this.fallbackOutdoor, this.primaryView, this.primaryView.yaw);
    this.pets = createVillaPetModel(this.scene);
    this.colliders.push(...this.furnishings.colliders, ...this.vehicle.colliders, ...this.pickup.colliders, ...this.suv.colliders, ...this.scooter.colliders, ...this.gaming.colliders, ...this.elevatorCollisions.colliders, ...this.course.colliders, ...garden.colliders, ...estate.colliders, ...this.stream.colliders, ...this.outdoorModel.colliders);
    // Keep live identities: each vehicle ignores ONLY itself, collides with both
    // other vehicles, and stops before pets (walkers do not collide with pets).
    this.drivingObstacles = [...this.colliders.filter(c => !isVillaVehicleCollider(c)), ...this.pets.drivingColliders];
    this.pickupObstacles = [...this.colliders.filter(c => !isVillaPickupCollider(c)), ...this.pets.drivingColliders];
    this.suvObstacles = [...this.colliders.filter(c => !isVillaSuvCollider(c)), ...this.pets.drivingColliders];
    this.scooterObstacles = [...this.colliders.filter(c => !isVillaScooterCollider(c)), ...this.pets.drivingColliders];
    this.addContactShadows([...this.furnishings.colliders, ...this.gaming.colliders, ...garden.colliders]);
    // Rig setup is now complete: re-index only immutable, nondeforming source arrays.
    // Bounding/range preparation must see the final uploaded attributes and triangle stream.
    indexVillaRigidSurfaces(this.scene);
    this.staticView = new VillaStaticView(this.scene);
    // Fragment-only sunlight sampling is installed after conservative static range classification.
    // It never moves a vertex or changes the bounds used for primary and security views.
    bindRoomSurfaces(this.scene,this.roomSwatches.maps);
    installVillaOrchardLight(this.scene);
    this.surveyedSun=addSurveyedSun(this.scene);
    this.roomMirrors=installVillaRoomMirrors(this.scene,indoorReady);
    // Room names belong to the optional floor plan/HUD, never pasted onto the house.
  }

  private drawWorld(camera: THREE.PerspectiveCamera) {
    if (this.staticView) this.staticView.draw(this.renderer,this.scene,camera);
    else this.renderer.render(this.scene,camera); // Renderer-only fixtures do not construct a world.
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
    const parts = fixedVillaContactColliders(this.scene, colliders).filter(collider => [0, 3.6, 7.2].some(y => Math.abs(collider.minY - y) < .08) && !insideOccupiedFabric((collider.minX+collider.maxX)*.5,Math.max(0,collider.minY),(collider.minZ+collider.maxZ)*.5)).map(collider => {
      const g = new THREE.PlaneGeometry((collider.maxX - collider.minX) * 1.42, (collider.maxZ - collider.minZ) * 1.42);
      g.rotateX(-Math.PI / 2);
      g.translate((collider.minX + collider.maxX) / 2, collider.minY + 0.039, (collider.minZ + collider.maxZ) / 2);
      return g;
    });
    const geometry = parts.length ? mergeGeometries(parts) : null;
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
    if (this.suv.update(time, state)) this.renderer.shadowMap.needsUpdate = true;
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
  get suvDoorProgress(): number { return this.suv.doorProgress; }

  /** A small in-world interaction badge, never visible through walls or behind the camera. */
  projectInteraction(point: VillaPosition, width: number, height: number): { x: number; y: number } | null {
    if (this.homeCutKey) return null; // No world is on screen to attach a badge to.
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
    const a = villaAtmosphere(home); this.roomMirrors?.update(home);
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
    if(this.surveyedSun){this.surveyedSun.strength.value=.87*(1-.83*a.rain)*(1-.70*a.night);this.surveyedSun.room.setAtmosphere(a.sun,a.rain,a.night); }
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
    // Read the simulation clock only on an actual world or security pass. No independent RAF, input-key revision or texture uploads.
    this.poolFlow.update(time,home.rain);this.stream.update(time,home.rain);this.updatePond(time,home.rain);
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
      this.drawWorld(this.securityCamera);
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

  /** The game has already painted its theme-neutral background. Leave it under the live HUD
   * during Home instead of showing the wrong location. A resize may reframe the old world. */
  private showWaitingWorld(ctx: CanvasRenderingContext2D,width:number,height:number) {
    if (this.homeCutKey) return;
    const w=this.resizing && this.cachedAspect>0 ? height*this.cachedAspect : width;
    ctx.drawImage(this.cachedFrame,(width-w)/2,0,w,height);
  }

  render(ctx: CanvasRenderingContext2D, width: number, height: number, pixelRatio: number, view: VillaView, time: number, state: VillaSceneState): boolean {
    if (this.disposed || this.contextLost) return false;
    const { w, h } = villaRendererSize(width, height, pixelRatio, this.lowSpec);
    const now = performance.now();
    const stateKey = villaSceneInputKey(state);
    this.primaryView = { ...view };
    this.updateActivities(time, state, view, view.yaw);
    const validState = this.lowSpec && this.lastStateKey===stateKey;
    if (!validState) this.resizing=this.resizeLead=false;
    const hasFrame = validState && this.cachedFrame.width===w && this.cachedFrame.height===h;
    const validPrevious = hasFrame || (validState && this.resizing && this.cachedAspect>0);
    if(this.resizeLead && validPrevious) {
      // The viewport callback owns layout and projection, not a synchronous software raster.
      // Give the browser one paint at the new size before submitting a fresh frame for it.
      this.resizeLead=false; this.showWaitingWorld(ctx,width,height); return true;
    }
    const uninterrupted = time>=this.lastInputTime && time-this.lastInputTime<.5;
    this.lastInputTime = time;
    const canQueue = this.lowSpec && uninterrupted && Number.isFinite(this.lastDrawAt);
    if (this.homeCutKey && (!canQueue || this.homeCutKey !== stateKey)) this.invalidateCameraFrame();
    if (this.readback?.pending) {
      if (!canQueue || (!validPrevious && !this.homeCutKey) || this.queuedWidth!==w || this.queuedHeight!==h
        || this.queuedCamera.aspect !== width / height) {
        // A resize (even with identical rounded raster), clock jump or semantic change supersedes the ticket.
        this.readback.cancel(); this.homeCutKey=null;
      } else {
        const frame = this.readback.poll();
        if (frame === 'waiting') { this.showWaitingWorld(ctx,width,height); return true; }
        if (frame) {
          if(this.cachedFrame.width!==w || this.cachedFrame.height!==h) {this.cachedFrame.width=w;this.cachedFrame.height=h;}
          this.cachedFrame.getContext('2d')!.putImageData(frame,0,0);
          this.cachedAspect=this.queuedCamera.aspect; this.resizing=false;
          this.camera.copy(this.queuedCamera,false); // project hints from the displayed camera, not the queued one
          this.lastStateKey=stateKey; this.homeCutKey=null;
          this.cachedTime=this.queuedTime; this.lastDrawAt=now; this.softwareInputFrames=6; this.inputLeadSpent=false;
          ctx.drawImage(this.cachedFrame,0,0,width,height); return true;
        }
        // Readback unavailable: finish this frame through the original synchronous bridge.
        this.readback.dispose(); this.readback=null; this.homeCutKey=null;
      }
    }
    // Guarantee input-only RAFs even if browser compositing AFTER render() took
    // longer than the time budget. A wall-clock cap alone starves real key events
    // on SwiftShader. Long manual time jumps and activity changes still draw now.
    if (!this.resizing && this.lowSpec && this.cachedFrame.width === w && this.cachedFrame.height === h
      && (this.softwareInputFrames > 0 || now - this.lastDrawAt < 1000 / 24)
      && time >= this.cachedTime && time - this.cachedTime < 0.5 && this.lastStateKey === stateKey) {
      this.softwareInputFrames = Math.max(0, this.softwareInputFrames - 1);
      ctx.drawImage(this.cachedFrame, 0, 0, width, height); return true;
    }
    if (this.renderer.domElement.width !== w || this.renderer.domElement.height !== h) this.renderer.setSize(w, h, false);
    // Home may queue its destination WITHOUT a displayable old frame. Every other
    // invalidation, cold start, forced snapshot or unsupported bridge seeds synchronously.
    const defer = this.readback && canQueue && (validPrevious || !!this.homeCutKey);
    const camera = defer ? this.queuedCamera.copy(this.camera,false) : this.camera;
    camera.aspect = width / height; camera.fov = view.fov ?? 64; camera.updateProjectionMatrix();
    camera.position.set(view.x, view.y + (view.eyeHeight ?? EYE_HEIGHT), view.z);
    camera.rotation.set(view.pitch, view.yaw, view.roll ?? 0, 'YXZ');
    this.prepareVisuals(time, state, camera.position);
    this.drawWorld(camera);
    if (defer) {
      if (this.readback!.submit(w,h)) {
        this.queuedTime=time; this.queuedWidth=w; this.queuedHeight=h; this.showWaitingWorld(ctx,width,height); return true;
      }
      this.readback!.dispose(); this.readback=null; this.camera.copy(camera,false);
    }
    this.lastStateKey = stateKey; this.homeCutKey = null;
    if (this.lowSpec) {
      if (this.cachedFrame.width !== w || this.cachedFrame.height !== h) { this.cachedFrame.width = w; this.cachedFrame.height = h; }
      this.cachedFrame.getContext('2d')!.drawImage(this.renderer.domElement, 0, 0);
      this.cachedAspect=this.camera.aspect; this.resizing=false;
      ctx.drawImage(this.cachedFrame, 0, 0, width, height);
      this.lastDrawAt = performance.now(); this.cachedTime = time; this.softwareInputFrames = 6; this.inputLeadSpent = false;
    } else ctx.drawImage(this.renderer.domElement, 0, 0, width, height);
    return true;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.readback?.dispose(); this.readback=null; this.homeCutKey=null;
    this.roomMirrors?.dispose();this.staticView?.dispose();this.surveyedSun?.dispose();
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
    if (this.groundSwatches){for(const t of Object.values(this.groundSwatches.maps))textures.delete(t);this.groundSwatches.dispose();}
    if (this.roomSwatches){for(const t of Object.values(this.roomSwatches.maps))textures.delete(t);this.roomSwatches.dispose();}
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
