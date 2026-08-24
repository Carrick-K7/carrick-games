// counterstrikeScene3d.ts — real-3D renderer for Counter-Strike (modern mode).
//
// The game simulation (positions, hit detection, bots, economy) stays 2D on
// the fy_iceworld tile map; this module renders that state with Three.js:
// extruded ice-block walls with the procedural textures from
// counterstrikeAssets, a lit ice floor with shadows, a gradient sky dome,
// low-poly articulated soldiers, tracers, smoke billboards, and particles.
// The WebGL canvas is blitted into the game's 2D canvas each frame, so the
// shell contract (HiDPI canvas, HUD, overlays, e2e pixel probes) is intact.

import * as THREE from 'three';
import { getCanvasPixelRatio } from '../core/render.js';
import { getGrenadeSprite, getWallTexture, getWeaponSprite } from './counterstrikeAssets.js';
import {
  BUY_ZONE_RECT,
  ICEBERG_MAP,
  MAP_COLS,
  MAP_PIXEL_X,
  MAP_PIXEL_Y,
  MAP_ROWS,
  TILE,
  TileKind,
  wallTintAt,
  type WallTint,
} from './counterstrikeMap.js';
import type { Team, WeaponId } from './counterstrikeRules.js';

type NadeKind = 'he' | 'flash' | 'smoke';

export interface Scene3DFighter {
  id: number;
  isPlayer: boolean;
  x: number;
  y: number;
  angle: number;
  team: Team;
  variant: number;
  alive: boolean;
  deadT: number;
  walkPhase: number;
  moving: boolean;
  muzzle: number;
  crouch: boolean;
  hitFlash: number;
  helmet: boolean;
  recoil: number;
}

export interface Scene3DGroundItem {
  x: number;
  y: number;
  kind: 'weapon' | 'nade';
  weaponId?: WeaponId;
  nade?: NadeKind;
}

export interface Scene3DGrenade {
  x: number;
  y: number;
  type: NadeKind;
}

export interface Scene3DSmoke {
  x: number;
  y: number;
  r: number;
  maxR: number;
  life: number;
  maxLife: number;
}

export interface Scene3DTracer {
  x1: number; y1: number; z1: number;
  x2: number; y2: number; z2: number;
  life: number;
  maxLife: number;
  color: string;
}

export interface Scene3DParticle {
  x: number; y: number; z: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

export interface Scene3DState {
  camX: number;
  camY: number;
  camAngle: number;
  pitch: number;
  eye: number;
  moving: boolean;
  walkPhase: number;
  fighters: Scene3DFighter[];
  ground: Scene3DGroundItem[];
  grenades: Scene3DGrenade[];
  smokes: Scene3DSmoke[];
  tracers: Scene3DTracer[];
  particles: Scene3DParticle[];
}

// Visual wall height: the legacy raycaster centered walls on the horizon, so
// they read as tall barriers; the 3D scene needs walls above eye level (56)
// to feel like fy_iceworld's corridors. Gameplay collision stays 2D tile-based
// and is unaffected by this visual height.
const WALL_H = 78;
const SKY_TOP = '#6fa8dc';
const SKY_MID = '#9cc4e8';
const SKY_HORIZON = '#e9f2fa';
const FOG_COLOR = '#dfeaf5';

const SOLDIER_COLORS = {
  // CS 1.6 flavor — CT: navy fatigues + helmet; T: olive jacket + balaclava.
  CT: {
    jacket: ['#2b4364', '#263b58'],
    jacketDark: ['#1f3049', '#1b2a40'],
    pants: '#25344a',
    boots: '#1c222b',
    headgear: '#22344c',
    skin: '#e8b98a',
  },
  T: {
    jacket: ['#5a5e42', '#50543a'],
    jacketDark: ['#464a33', '#3e422d'],
    pants: '#3a3c33',
    boots: '#2a2620',
    headgear: '#26241f',
    skin: '#dfb08a',
  },
} as const;

function makeCanvasTexture(canvas: HTMLCanvasElement, repeat = 1): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 4;
  return tex;
}

/** Procedural ice floor: pale base, tonal drift, fine cracks, skate marks. */
function makeIceFloorTexture(): HTMLCanvasElement {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, '#c3d7ea');
  g.addColorStop(0.5, '#cfdff0');
  g.addColorStop(1, '#bcd2e6');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 900; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = rnd() * 2.2 + 0.4;
    ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(120,150,190,0.08)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 26; i++) {
    ctx.strokeStyle = `rgba(255,255,255,${0.05 + rnd() * 0.1})`;
    ctx.lineWidth = 0.6 + rnd();
    ctx.beginPath();
    const x = rnd() * size;
    const y = rnd() * size;
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rnd() - 0.5) * 90, y + (rnd() - 0.5) * 90);
    ctx.stroke();
  }
  for (let i = 0; i < 10; i++) {
    ctx.strokeStyle = `rgba(110,140,180,${0.06 + rnd() * 0.08})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    const x = rnd() * size;
    const y = rnd() * size;
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + 30, y + 12, x + 55, y - 18, x + 90, y + 8);
    ctx.stroke();
  }
  return canvas;
}

/** Vertical gradient sky dome texture. */
function makeSkyTexture(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, SKY_TOP);
    g.addColorStop(0.55, SKY_MID);
    g.addColorStop(0.8, SKY_HORIZON);
    g.addColorStop(1, SKY_HORIZON);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 16, 256);
  }
  return canvas;
}

function makeRadialSpriteTexture(inner: string, outer: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }
  return canvas;
}

/* ------------------------------------------------------------------ */
/* Soldier model                                                       */
/* ------------------------------------------------------------------ */

class SoldierModel {
  readonly group = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly legL: THREE.Group;
  private readonly legR: THREE.Group;
  private readonly armR: THREE.Group;
  private readonly gun: THREE.Group;
  private readonly muzzleSprite: THREE.Sprite;
  private readonly muzzleLight: THREE.PointLight;
  private readonly mats: THREE.MeshStandardMaterial[] = [];
  private deadSpin = 1;

  constructor(team: Team, variant: number) {
    const colors = SOLDIER_COLORS[team];
    const mat = (color: string): THREE.MeshStandardMaterial => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.06 });
      this.mats.push(m);
      return m;
    };
    const jacket = mat(colors.jacket[variant % 2]);
    const jacketDark = mat(colors.jacketDark[variant % 2]);
    const pants = mat(colors.pants);
    const boots = mat(colors.boots);
    const skin = mat(colors.skin);
    const headgear = mat(colors.headgear);
    const vest = mat(team === 'CT' ? '#1d2634' : '#38342a');
    const gunMat = mat('#22262d');
    gunMat.metalness = 0.5;
    gunMat.roughness = 0.45;

    const box = (
      w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number,
    ): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      return mesh;
    };

    // CS 1.6-flavored proportions, facing +X: total height ~70 (eye 56),
    // legs ~34 (49%), torso 22, head 10 — slimmer than the old blocky build.
    this.legL = new THREE.Group();
    this.legL.position.set(0, 34, -5.5);
    this.legL.add(box(8, 30, 8, pants, 0, -15, 0));
    this.legL.add(box(10, 5, 9, boots, 1.5, -31.5, 0));
    this.legR = new THREE.Group();
    this.legR.position.set(0, 34, 5.5);
    this.legR.add(box(8, 30, 8, pants, 0, -15, 0));
    this.legR.add(box(10, 5, 9, boots, 1.5, -31.5, 0));

    const torso = new THREE.Group();
    torso.add(box(15, 22, 19, jacket, 0, 45, 0));            // torso 34..56
    torso.add(box(4, 15, 15, vest, 6.6, 45, 0));             // chest rig
    torso.add(box(3, 13, 14, vest, -6.9, 45, 0));            // back plate
    torso.add(box(15.5, 3.5, 19.5, jacketDark, 0, 35.5, 0)); // belt line

    // Head — CT: navy helmet with brim and goggle band; T: balaclava with a
    // skin eye slit. This is the silhouette that reads "CS 1.6".
    const head = new THREE.Group();
    head.add(box(10, 10, 10, skin, 0, 62, 0));
    if (team === 'CT') {
      head.add(box(11.6, 5.4, 11.6, headgear, 0, 67.2, 0));       // helmet dome
      head.add(box(12.6, 2.2, 12.6, headgear, 0, 64.6, 0));       // helmet brim
      head.add(box(1.4, 2.6, 8.4, mat('#12181f'), 5.2, 63.2, 0)); // goggles
    } else {
      head.add(box(10.8, 10.6, 10.8, headgear, 0, 62.4, 0));      // balaclava wrap
      head.add(box(1.4, 2.4, 7.2, skin, 5.3, 64, 0));             // eye slit
    }
    torso.add(head);

    // Rifle held at chest height on the near-centerline; it kicks back with
    // recoil. Tip at local (33, 51, 2) is where the muzzle flash anchors.
    this.gun = new THREE.Group();
    this.gun.position.set(0, 51, 0);
    this.gun.add(box(27, 4.5, 4.5, gunMat, 18, 0, 2));  // barrel + receiver
    this.gun.add(box(5, 8, 4, gunMat, 8, -4.5, 2));     // magazine
    this.gun.add(box(6, 6, 5, jacketDark, 2, 0.5, 2));  // stock
    torso.add(this.gun);

    // Both hands on the rifle: right to the grip, left to the forend.
    this.armR = new THREE.Group();
    this.armR.position.set(0, 51, 11);
    this.armR.rotation.y = 0.42;
    this.armR.add(box(14, 6, 6, jacket, 6, 0, 0));
    torso.add(this.armR);

    const armL = new THREE.Group();
    armL.position.set(0, 51, -11);
    armL.rotation.y = -0.62;
    armL.add(box(16, 6, 6, jacket, 7, 0, 0));
    armL.add(box(5, 5, 5, skin, 15.5, 0, 0)); // left hand under the forend
    torso.add(armL);

    this.body.add(this.legL, this.legR, torso);
    this.group.add(this.body);

    const flashTex = makeCanvasTexture(makeRadialSpriteTexture('rgba(255,230,150,1)', 'rgba(255,140,40,0)'));
    this.muzzleSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: flashTex,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }));
    this.muzzleSprite.scale.set(26, 26, 1);
    this.muzzleSprite.visible = false;
    this.muzzleLight = new THREE.PointLight(0xffc86e, 0, 220, 1.8);
    this.muzzleLight.position.set(33, 51, 2);
    this.group.add(this.muzzleSprite, this.muzzleLight);
    this.deadSpin = Math.random() > 0.5 ? 1 : -1;
  }

  update(f: Scene3DFighter, time: number): void {
    this.group.position.set(f.x, 0, f.y);
    if (!f.alive) {
      const fall = Math.min(1, f.deadT * 2.6);
      const eased = 1 - (1 - fall) * (1 - fall);
      this.body.rotation.z = 0;
      this.body.rotation.x = eased * (Math.PI / 2) * this.deadSpin;
      this.body.position.y = -eased * 20;
      this.muzzleSprite.visible = false;
      this.muzzleLight.intensity = 0;
      const fade = f.deadT > 1.3 ? Math.max(0, 1 - (f.deadT - 1.3) / 0.9) : 1;
      for (const m of this.mats) {
        m.transparent = fade < 1;
        m.opacity = fade;
      }
      return;
    }

    this.body.rotation.x = 0;
    this.body.position.y = 0;
    for (const m of this.mats) {
      m.transparent = false;
      m.opacity = 1;
      m.emissive.setHex(0xff3333);
      m.emissiveIntensity = f.hitFlash > 0 ? Math.min(1, (f.hitFlash / 0.1) * 0.85) : 0;
    }

    this.group.rotation.y = -f.angle;
    this.group.scale.y = f.crouch ? 0.74 : 1;

    if (f.moving) {
      // walkPhase advances ~12 units/s at run speed; 0.45 half-cycles per
      // unit lands at ~2.7 steps/s — a human run cadence, not a vibration.
      const stepPhase = f.walkPhase * Math.PI * 0.45;
      const swing = Math.sin(stepPhase) * 0.45;
      this.legL.rotation.z = swing;
      this.legR.rotation.z = -swing;
      this.body.position.y = Math.abs(Math.sin(stepPhase)) * 0.9;
    } else {
      this.legL.rotation.z *= 0.8;
      this.legR.rotation.z *= 0.8;
      this.body.position.y = Math.sin(time * 1.6 + f.id) * 0.5; // idle breath
    }
    // Rifle kicks back under recoil.
    this.gun.position.x = -Math.min(0.26, f.recoil) * 26;

    const flashing = f.muzzle > 0;
    this.muzzleSprite.visible = flashing;
    if (flashing) {
      const s = 20 + Math.random() * 14;
      this.muzzleSprite.scale.set(s, s, 1);
      this.muzzleLight.intensity = 30;
    } else {
      this.muzzleLight.intensity = 0;
    }
    // Flash stays anchored at the muzzle tip in group space (facing +X).
    this.muzzleSprite.position.set(33, 51, 2);
  }

  dispose(): void {
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const m = obj.material;
        if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
        else m.dispose();
      }
    });
  }
}

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

const MAX_TRACERS = 24;
const MAX_SMOKE_PUFFS = 48;
const MAX_GROUND_SPRITES = 24;
const MAX_GRENADES = 8;
const POINT_CAP = 384;

/** Probe whether WebGL is software-rendered before creating the real context. */
function detectSoftwareGL(): boolean {
  let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  try {
    const probe = document.createElement('canvas');
    gl = probe.getContext('webgl2') ?? probe.getContext('webgl');
    if (!gl) return false;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const name = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
    return /swiftshader|llvmpipe|software|subzero/i.test(name);
  } catch {
    return false;
  } finally {
    try {
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {
      // best-effort probe cleanup
    }
  }
}

export class CounterStrikeScene3D {
  readonly ok: boolean;
  private readonly renderer: THREE.WebGLRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private sky: THREE.Mesh | null = null;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly soldiers = new Map<number, SoldierModel>();
  private readonly tracerPool: THREE.Mesh[] = [];
  private readonly smokeTexture: THREE.CanvasTexture;
  private readonly smokePool: THREE.Sprite[] = [];
  private readonly groundPool: THREE.Sprite[] = [];
  private readonly grenadePool: THREE.Mesh[] = [];
  private readonly spriteTexCache = new Map<HTMLCanvasElement, THREE.CanvasTexture>();
  private readonly pointsAdd: THREE.Points;
  private readonly pointsPlain: THREE.Points;
  private readonly posAdd = new Float32Array(POINT_CAP * 3);
  private readonly colAdd = new Float32Array(POINT_CAP * 3);
  private readonly posPlain = new Float32Array(POINT_CAP * 3);
  private readonly colPlain = new Float32Array(POINT_CAP * 3);
  private lastW = 0;
  private lastH = 0;
  private lastRatio = 0;
  private time = 0;
  private lastFrameAt = 0;
  /** Software rasterizers (SwiftShader/llvmpipe) and weak GPUs: cheap path. */
  private readonly lowSpec: boolean = false;

  constructor() {
    // Software GL (CI, GPU-less machines) renders WebGL at seconds-per-frame
    // pace, which would slow the game simulation itself (frame deltas are
    // clamped). Those environments stay on the legacy raycaster — zero cost,
    // fully playable. `?cs3d=force` / `?cs3d=off` override for debugging.
    const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
    const override = params?.get('cs3d') ?? null;
    const lowSpec = detectSoftwareGL();
    if (override === 'off' || (lowSpec && override !== 'force')) {
      this.ok = false;
      this.camera = new THREE.PerspectiveCamera();
      this.smokeTexture = makeCanvasTexture(document.createElement('canvas'));
      this.pointsAdd = new THREE.Points();
      this.pointsPlain = new THREE.Points();
      return;
    }
    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !lowSpec,
        powerPreference: 'high-performance',
      });
    } catch {
      renderer = null;
    }
    if (!renderer) {
      this.ok = false;
      this.camera = new THREE.PerspectiveCamera();
      this.smokeTexture = makeCanvasTexture(document.createElement('canvas'));
      this.pointsAdd = new THREE.Points();
      this.pointsPlain = new THREE.Points();
      return;
    }
    this.renderer = renderer;
    this.ok = true;
    this.lowSpec = lowSpec;
    renderer.shadowMap.enabled = !this.lowSpec;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if (this.lowSpec) {
      renderer.toneMapping = THREE.NoToneMapping;
    } else {
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.06;
    }

    const aspect = 1280 / 720;
    const vFov = (2 * Math.atan(Math.tan((66 * Math.PI) / 360) / aspect) * 180) / Math.PI;
    this.camera = new THREE.PerspectiveCamera(vFov, aspect, 2, 4200);
    this.camera.rotation.order = 'YXZ';

    this.scene.background = new THREE.Color(SKY_MID);
    this.scene.fog = new THREE.Fog(FOG_COLOR, 480, 2300);

    // Sky dome
    const skyTex = makeCanvasTexture(makeSkyTexture());
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(3600, 24, 14),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }),
    );
    this.sky = sky;
    this.scene.add(sky);

    // Lights
    const hemi = new THREE.HemisphereLight(0xd6e7f8, 0xeef4fb, 1.15);
    const sun = new THREE.DirectionalLight(0xfff5e8, 2.1);
    sun.position.set(MAP_PIXEL_X * 0.3, 1500, -MAP_PIXEL_Y * 0.35);
    sun.target.position.set(MAP_PIXEL_X / 2, 0, MAP_PIXEL_Y / 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const cam = sun.shadow.camera;
    cam.left = -1300;
    cam.right = 1300;
    cam.top = 1300;
    cam.bottom = -1300;
    cam.near = 200;
    cam.far = 3400;
    sun.shadow.bias = -0.0004;
    this.scene.add(hemi, sun, sun.target);

    // Floor (with apron reaching into the fog)
    const floorTex = makeCanvasTexture(makeIceFloorTexture(), 1);
    floorTex.repeat.set((MAP_PIXEL_X + 2200) / 256, (MAP_PIXEL_Y + 2200) / 256);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(MAP_PIXEL_X + 2200, MAP_PIXEL_Y + 2200),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.5, metalness: 0.08 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(MAP_PIXEL_X / 2, 0, MAP_PIXEL_Y / 2);
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Buy zone decal
    const zone = new THREE.Mesh(
      new THREE.PlaneGeometry(BUY_ZONE_RECT.w, BUY_ZONE_RECT.h),
      new THREE.MeshBasicMaterial({ color: 0x39c5bb, transparent: true, opacity: 0.07, depthWrite: false }),
    );
    zone.rotation.x = -Math.PI / 2;
    zone.position.set(BUY_ZONE_RECT.x + BUY_ZONE_RECT.w / 2, 0.4, BUY_ZONE_RECT.y + BUY_ZONE_RECT.h / 2);
    this.scene.add(zone);

    // Walls: one InstancedMesh per tint
    const byTint = new Map<WallTint, number[]>();
    for (let row = 0; row < MAP_ROWS; row++) {
      for (let col = 0; col < MAP_COLS; col++) {
        if (ICEBERG_MAP[row][col] !== TileKind.Wall) continue;
        const tint = wallTintAt(col, row);
        const list = byTint.get(tint) ?? [];
        list.push(col, row);
        byTint.set(tint, list);
      }
    }
    for (const [tint, cells] of byTint) {
      const tex = makeCanvasTexture(getWallTexture(tint));
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.62, metalness: 0.05 });
      const geo = new THREE.BoxGeometry(TILE, WALL_H, TILE);
      // Tile the texture vertically on the side faces so it stays square
      // instead of stretching across the taller wall.
      const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
      const vRepeat = WALL_H / TILE;
      for (let i = 0; i < uv.count; i++) {
        const face = Math.floor(i / 4); // px nx py ny pz nz
        if (face === 2 || face === 3) continue;
        uv.setY(i, uv.getY(i) * vRepeat);
      }
      uv.needsUpdate = true;
      const mesh = new THREE.InstancedMesh(geo, mat, cells.length / 2);
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < cells.length; i += 2) {
        m4.makeTranslation(cells[i] * TILE + TILE / 2, WALL_H / 2, cells[i + 1] * TILE + TILE / 2);
        mesh.setMatrixAt(i / 2, m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }

    // Tracer pool: stretched additive boxes
    const tracerGeo = new THREE.BoxGeometry(1.1, 1.1, 1);
    for (let i = 0; i < MAX_TRACERS; i++) {
      const mesh = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({
        color: 0xffe2a8,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      mesh.visible = false;
      this.tracerPool.push(mesh);
      this.scene.add(mesh);
    }

    // Smoke puff pool
    this.smokeTexture = makeCanvasTexture(makeRadialSpriteTexture('rgba(206,212,222,0.85)', 'rgba(196,202,212,0)'));
    for (let i = 0; i < MAX_SMOKE_PUFFS; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.smokeTexture,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }));
      sprite.visible = false;
      this.smokePool.push(sprite);
      this.scene.add(sprite);
    }

    // Ground item sprite pool
    for (let i = 0; i < MAX_GROUND_SPRITES; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
      sprite.visible = false;
      this.groundPool.push(sprite);
      this.scene.add(sprite);
    }

    // Grenade pool
    const nadeGeo = new THREE.SphereGeometry(3, 10, 8);
    const nadeMat = new THREE.MeshStandardMaterial({ color: 0x2f3b2f, roughness: 0.55, metalness: 0.3 });
    for (let i = 0; i < MAX_GRENADES; i++) {
      const mesh = new THREE.Mesh(nadeGeo, nadeMat);
      mesh.visible = false;
      mesh.castShadow = true;
      this.grenadePool.push(mesh);
      this.scene.add(mesh);
    }

    // Particle points (additive sparks / plain blood & debris)
    this.pointsAdd = this.makePoints(this.posAdd, this.colAdd, THREE.AdditiveBlending);
    this.pointsPlain = this.makePoints(this.posPlain, this.colPlain, THREE.NormalBlending);
    this.scene.add(this.pointsAdd, this.pointsPlain);
  }

  private makePoints(pos: Float32Array, col: Float32Array, blending: THREE.Blending): THREE.Points {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: 5,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending,
      depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    return points;
  }

  get canvas(): HTMLCanvasElement | null {
    return this.renderer ? this.renderer.domElement : null;
  }

  resize(w: number, h: number, backingRatio?: number): void {
    if (!this.renderer) return;
    const ratio = this.lowSpec ? 0.75 : (backingRatio ?? getCanvasPixelRatio());
    if (w === this.lastW && h === this.lastH && ratio === this.lastRatio) return;
    this.lastW = w;
    this.lastH = h;
    this.lastRatio = ratio;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  sync(state: Scene3DState): void {
    if (!this.renderer) return;

    // Camera (subtle view bob while moving — a fraction of the old
    // ~8Hz/1.3-unit bob, which read as screen shake).
    const bob = state.moving ? Math.sin(state.walkPhase * Math.PI * 0.45) * 0.5 : 0;
    this.camera.position.set(state.camX, state.eye + bob, state.camY);
    // The sky dome follows the camera — a fixed dome centered at the world
    // origin puts the gradient's bright band off to one side (a pale blob).
    this.sky?.position.set(state.camX, 0, state.camY);
    this.camera.rotation.y = -state.camAngle - Math.PI / 2;
    // Game pitch > 0 means "look up"; three's rotation.x > 0 pitches up too.
    this.camera.rotation.x = state.pitch;

    // Soldiers
    const seen = new Set<number>();
    for (const f of state.fighters) {
      if (f.isPlayer) continue;
      seen.add(f.id);
      let model = this.soldiers.get(f.id);
      if (!model) {
        model = new SoldierModel(f.team, f.variant);
        this.soldiers.set(f.id, model);
        this.scene.add(model.group);
      }
      model.group.visible = f.alive || f.deadT <= 2.2;
      model.update(f, this.time);
    }
    for (const [id, model] of this.soldiers) {
      if (!seen.has(id)) {
        model.group.visible = false;
      }
    }

    // Ground items
    for (let i = 0; i < this.groundPool.length; i++) {
      const sprite = this.groundPool[i];
      const item = state.ground[i];
      if (!item) {
        sprite.visible = false;
        continue;
      }
      const tex = item.kind === 'weapon' && item.weaponId
        ? getWeaponSprite(item.weaponId)
        : item.nade
          ? getGrenadeSprite(item.nade)
          : null;
      if (!tex) {
        sprite.visible = false;
        continue;
      }
      const mat = sprite.material;
      if (mat.map?.image !== tex) {
        let cached = this.spriteTexCache.get(tex);
        if (!cached) {
          cached = makeCanvasTexture(tex);
          this.spriteTexCache.set(tex, cached);
        }
        mat.map = cached;
        mat.needsUpdate = true;
      }
      const aspect = tex.width / tex.height;
      const hgt = item.kind === 'weapon' ? 13 : 11;
      sprite.scale.set(hgt * aspect, hgt, 1);
      sprite.position.set(item.x, 7, item.y);
      sprite.visible = true;
    }

    // Grenades in flight
    for (let i = 0; i < this.grenadePool.length; i++) {
      const mesh = this.grenadePool[i];
      const g = state.grenades[i];
      if (!g) {
        mesh.visible = false;
        continue;
      }
      mesh.position.set(g.x, 8, g.y);
      mesh.visible = true;
    }

    // Smoke clouds (cluster of puffs per cloud)
    let puff = 0;
    for (const s of state.smokes) {
      const lifeK = Math.min(1, s.life / (s.maxLife * 0.4));
      const growK = Math.min(1, (1 - s.life / s.maxLife) * 3);
      const r = s.r * (0.4 + 0.6 * growK);
      const puffs = 5;
      for (let k = 0; k < puffs && puff < this.smokePool.length; k++, puff++) {
        const sprite = this.smokePool[puff];
        const ang = (k / puffs) * Math.PI * 2 + s.x * 0.01;
        const rr = k === 0 ? 0 : r * 0.55;
        sprite.position.set(
          s.x + Math.cos(ang) * rr,
          r * 0.55 + (k % 2) * r * 0.28,
          s.y + Math.sin(ang) * rr,
        );
        const size = r * (k === 0 ? 2.3 : 1.7);
        sprite.scale.set(size, size, 1);
        sprite.material.opacity = 0.5 * lifeK;
        sprite.visible = true;
      }
    }
    for (; puff < this.smokePool.length; puff++) {
      this.smokePool[puff].visible = false;
    }

    // Tracers
    for (let i = 0; i < this.tracerPool.length; i++) {
      const mesh = this.tracerPool[i];
      const tr = state.tracers[i];
      if (!tr || tr.life <= 0) {
        mesh.visible = false;
        continue;
      }
      const v1 = new THREE.Vector3(tr.x1, tr.z1, tr.y1);
      const v2 = new THREE.Vector3(tr.x2, tr.z2, tr.y2);
      const len = v1.distanceTo(v2);
      if (len < 2) {
        mesh.visible = false;
        continue;
      }
      mesh.position.copy(v1).add(v2).multiplyScalar(0.5);
      mesh.lookAt(v2);
      mesh.scale.set(1, 1, len);
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.color.set(tr.color);
      mat.opacity = Math.min(1, (tr.life / tr.maxLife) * 0.9);
      mesh.visible = true;
    }

    // Particles: blood uses normal blending, everything else additive glow.
    let ai = 0;
    let pi = 0;
    const tmp = new THREE.Color();
    for (const p of state.particles) {
      tmp.set(p.color);
      const isBlood = p.color === '#b3212e';
      if (isBlood && pi < POINT_CAP) {
        this.posPlain[pi * 3] = p.x;
        this.posPlain[pi * 3 + 1] = p.z;
        this.posPlain[pi * 3 + 2] = p.y;
        this.colPlain[pi * 3] = tmp.r;
        this.colPlain[pi * 3 + 1] = tmp.g;
        this.colPlain[pi * 3 + 2] = tmp.b;
        pi++;
      } else if (!isBlood && ai < POINT_CAP) {
        this.posAdd[ai * 3] = p.x;
        this.posAdd[ai * 3 + 1] = p.z;
        this.posAdd[ai * 3 + 2] = p.y;
        this.colAdd[ai * 3] = tmp.r;
        this.colAdd[ai * 3 + 1] = tmp.g;
        this.colAdd[ai * 3 + 2] = tmp.b;
        ai++;
      }
    }
    this.pointsAdd.geometry.setDrawRange(0, ai);
    this.pointsPlain.geometry.setDrawRange(0, pi);
    (this.pointsAdd.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.pointsAdd.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    (this.pointsPlain.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.pointsPlain.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  render(): void {
    if (!this.renderer) return;
    const now = performance.now();
    const dt = this.lastFrameAt > 0 ? Math.min(0.1, (now - this.lastFrameAt) / 1000) : 0.016;
    this.lastFrameAt = now;
    this.time += dt;
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    for (const model of this.soldiers.values()) model.dispose();
    this.soldiers.clear();
    for (const tex of this.spriteTexCache.values()) tex.dispose();
    this.spriteTexCache.clear();
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
    }
  }
}
