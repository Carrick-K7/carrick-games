// Iceberg Strike — a CS2-inspired wave FPS set on the Iceberg map.
// Raycaster 3D renderer, billboard soldier enemies, rifles/pistols,
// waves of hostiles, pickups, minimap, and a compact HUD.
// Bright snow-and-ice look, no horror elements: enemies are regular
// winter soldiers and kills pop into a puff of snow.

import {
  BaseGame,
  createDefaultGameHost,
  type GameHost,
  type GameShellSnapshot,
} from '../core/game.js';
import {
  MAP_COLS,
  MAP_ROWS,
  PLAYER_START,
  PICKUP_SPOTS,
  SPAWN_POINTS,
  TileKind,
  isSolidTile,
  tileKindAt,
} from './icebergMap.js';

const W = 960;
const H = 540;
const HALF_FOV_TAN = Math.tan(((66 * Math.PI) / 180) / 2);
const MAX_DIST = 18;
const FOG_START = 7;
const PLAYER_RADIUS = 0.26;
const WALK_SPEED = 3.4;
const SPRINT_SPEED = 5.6;
const MAX_HP = 100;
const MOUSE_SENS = 0.0022;

// ─── Types ──────────────────────────────────────────────────────────────────

interface Weapon {
  name: string;
  nameZh: string;
  dmg: number;
  rate: number;
  magSize: number;
  mag: number;
  reserve: number;
  reload: number;
  spreadStand: number;
  spreadMove: number;
  kick: number;
  auto: boolean;
}

interface RayResult {
  dist: number;
  side: 0 | 1;
  wallX: number;
  kind: TileKind;
}

interface Enemy {
  x: number;
  y: number;
  hp: number;
  state: 'patrol' | 'chase' | 'attack';
  dir: number;
  speed: number;
  walkPhase: number;
  hitFlash: number;
  shootTimer: number;
  burstLeft: number;
  burstT: number;
  strafeT: number;
  strafeDir: number;
  repathT: number;
  path: { x: number; y: number }[] | null;
  pathI: number;
  targetX: number;
  targetY: number;
  offX: number;
  offY: number;
  lostT: number;
  variant: number;
  flashT: number;
  dead: boolean;
  deadT: number;
  spawnT: number;
}

interface Tracer {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
  maxLife: number;
  color: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

interface Pickup {
  x: number;
  y: number;
  kind: 'med' | 'ammo';
  t: number;
}

interface SnowFlake {
  x: number;
  y: number;
  size: number;
  drift: number;
  speed: number;
}

// ─── Procedural textures ────────────────────────────────────────────────────

function makeCanvas(w: number, h: number, pixelFn: (x: number, y: number) => [number, number, number]): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(w, h);
    const data = img.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const [r, g, b] = pixelFn(x, y);
        const idx = (y * w + x) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  return canvas;
}

function lerpColor(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

let wallTextures: Record<number, HTMLCanvasElement> | null = null;

function getWallTexture(kind: TileKind): HTMLCanvasElement {
  if (!wallTextures) {
    wallTextures = {};
    wallTextures[TileKind.IceWall] = makeCanvas(64, 64, (x, y) => {
      let c = lerpColor([216, 235, 249], [126, 165, 208], y / 63);
      if ((y * 7 + x * 13) % 53 < 2) c = lerpColor(c, [96, 133, 176], 0.85);
      if ((x * 31 + y * 17) % 97 < 2) c = lerpColor(c, [240, 248, 255], 0.7);
      if ((x * 5 + y * 3) % 61 < 1) c = lerpColor(c, [255, 255, 255], 0.5);
      return c;
    });
    wallTextures[TileKind.Crate] = makeCanvas(64, 64, (x, y) => {
      let c = lerpColor([190, 144, 102], [150, 106, 70], (y % 16) / 15);
      if (y % 16 < 1) c = lerpColor(c, [104, 72, 46], 0.9);
      if (x % 32 === 0 || x % 32 === 31) c = lerpColor(c, [104, 72, 46], 0.75);
      const plank = Math.floor(y / 16);
      if (plank % 2 === 0 && ((x + y) % 37) < 2) c = lerpColor(c, [222, 178, 132], 0.8);
      if (((x * 13 + y * 7) % 64) === 0) c = lerpColor(c, [70, 46, 28], 0.8);
      return c;
    });
    wallTextures[TileKind.Container] = makeCanvas(64, 64, (x, y) => {
      const band = Math.floor(x / 8) % 2 === 0;
      let c: [number, number, number] = band ? [74, 109, 148] : [86, 122, 162];
      if (y < 2 || y > 61) c = lerpColor(c, [150, 178, 208], 0.7);
      if (y > 30 && y < 34) c = lerpColor(c, [40, 62, 88], 0.6);
      if ((x * 3 + y * 5) % 71 < 1) c = lerpColor(c, [200, 220, 240], 0.35);
      return c;
    });
    wallTextures[TileKind.SnowBank] = makeCanvas(64, 64, (x, y) => {
      let c = lerpColor([250, 252, 254], [208, 224, 240], y / 63);
      if ((x * 11 + y * 7) % 41 < 1) c = lerpColor(c, [255, 255, 255], 0.6);
      if (y > 52) c = lerpColor(c, [176, 198, 222], 0.7);
      return c;
    });
  }
  return wallTextures[kind] ?? wallTextures[TileKind.IceWall];
}

interface SoldierFrames {
  frames: HTMLCanvasElement[]; // idle, walk1, walk2, shoot
  dead: HTMLCanvasElement;
}

let soldierFramesCache: SoldierFrames | null = null;

function makeSoldierCanvas(draw: (c: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (ctx) draw(ctx);
  return canvas;
}

function drawSoldierBody(c: CanvasRenderingContext2D, variant: number, frame: string) {
  const jacket = variant === 0 ? '#5d7185' : '#4e6378';
  const jacketDark = variant === 0 ? '#48596c' : '#3c4d60';
  const pants = '#44566b';
  const boots = '#2c333d';
  const helmet = '#36455c';
  const skin = '#e8b98a';

  // soft ground shadow
  c.fillStyle = 'rgba(15,35,55,0.20)';
  c.beginPath();
  c.ellipse(32, 93, 23, 7, 0, 0, Math.PI * 2);
  c.fill();

  const bob = frame === 'walk1' || frame === 'walk2' ? 1 : 0;

  // legs
  let legA: [number, number] = [15, 62];
  let legB: [number, number] = [39, 62];
  if (frame === 'walk1') {
    legA = [11, 66];
    legB = [43, 62];
  } else if (frame === 'walk2') {
    legA = [17, 62];
    legB = [37, 66];
  }
  c.fillStyle = pants;
  c.fillRect(legA[0], legA[1] - bob, 12, 34 - (legA[1] - 62));
  c.fillRect(legB[0], legB[1] - bob, 12, 34 - (legB[1] - 62));
  c.fillStyle = boots;
  c.fillRect(legA[0] - 1, 89 - bob, 15, 7);
  c.fillRect(legB[0] - 1, 89 - bob, 15, 7);

  // torso
  c.fillStyle = jacket;
  c.fillRect(9, 30 - bob, 46, 34);
  c.fillStyle = jacketDark;
  c.fillRect(9, 44 - bob, 46, 6);
  c.fillRect(21, 30 - bob, 8, 12);
  c.fillRect(35, 42 - bob, 12, 8);
  c.fillStyle = '#3c4655';
  c.fillRect(9, 62 - bob, 46, 4); // belt

  // scarf accent
  c.fillStyle = '#39C5BB';
  c.fillRect(24, 30 - bob, 16, 5);

  // rifle (held across chest)
  const raise = frame === 'shoot' ? -5 : 0;
  c.fillStyle = '#2b3038';
  c.save();
  c.translate(32, 46 - bob + raise);
  c.rotate(raise === 0 ? 0.03 : 0.22);
  c.fillRect(-24, -3, 48, 6);
  c.fillRect(14, -5, 10, 4);
  c.restore();

  // arms
  c.fillStyle = jacket;
  c.fillRect(7, 32 - bob, 10, 28);
  c.fillRect(47, 32 - bob, 10, 28);
  c.fillStyle = skin;
  c.fillRect(7, 46 - bob + raise, 10, 8);
  c.fillRect(47, 46 - bob + raise, 10, 8);

  // head
  c.fillStyle = skin;
  c.fillRect(20, 14 - bob, 24, 18);
  c.fillStyle = helmet;
  c.fillRect(16, 8 - bob, 32, 13);
  c.fillRect(14, 16 - bob, 36, 4);
}

function getSoldierFrames(): SoldierFrames {
  if (!soldierFramesCache) {
    const frames: HTMLCanvasElement[] = [];
    for (const frame of ['idle', 'walk1', 'walk2', 'shoot']) {
      frames.push(makeSoldierCanvas((c) => drawSoldierBody(c, 0, frame)));
    }
    const dead = makeSoldierCanvas((c) => {
      // soldier down in the snow — calm, non-gory
      c.fillStyle = 'rgba(15,35,55,0.20)';
      c.beginPath();
      c.ellipse(32, 56, 30, 9, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#5d7185';
      c.fillRect(8, 42, 40, 22);
      c.fillStyle = '#48596c';
      c.fillRect(8, 54, 40, 6);
      c.fillStyle = '#e8b98a';
      c.fillRect(6, 44, 12, 12);
      c.fillStyle = '#36455c';
      c.fillRect(4, 42, 12, 8);
      c.fillStyle = '#44566b';
      c.fillRect(46, 44, 14, 18);
      c.fillStyle = '#2c333d';
      c.fillRect(56, 42, 6, 20);
      c.fillStyle = '#2b3038';
      c.fillRect(2, 58, 26, 5);
    });
    soldierFramesCache = { frames, dead };
  }
  return soldierFramesCache;
}

let pickupSprites: Record<'med' | 'ammo', HTMLCanvasElement> | null = null;

function getPickupSprite(kind: 'med' | 'ammo'): HTMLCanvasElement {
  if (!pickupSprites) {
    const med = document.createElement('canvas');
    med.width = 40;
    med.height = 40;
    const mctx = med.getContext('2d');
    if (mctx) {
      mctx.fillStyle = 'rgba(15,35,55,0.20)';
      mctx.beginPath();
      mctx.ellipse(20, 35, 13, 4, 0, 0, Math.PI * 2);
      mctx.fill();
      mctx.fillStyle = '#f2f7fb';
      mctx.fillRect(6, 8, 28, 26);
      mctx.strokeStyle = '#2f6db4';
      mctx.lineWidth = 2;
      mctx.strokeRect(6.5, 8.5, 27, 25);
      mctx.fillStyle = '#e0453f';
      mctx.fillRect(16, 12, 8, 18);
      mctx.fillRect(11, 17, 18, 8);
    }
    const ammo = document.createElement('canvas');
    ammo.width = 40;
    ammo.height = 40;
    const actx = ammo.getContext('2d');
    if (actx) {
      actx.fillStyle = 'rgba(15,35,55,0.20)';
      actx.beginPath();
      actx.ellipse(20, 35, 13, 4, 0, 0, Math.PI * 2);
      actx.fill();
      actx.fillStyle = '#a97f4f';
      actx.fillRect(6, 8, 28, 26);
      actx.strokeStyle = '#6f4f2c';
      actx.lineWidth = 2;
      actx.strokeRect(6.5, 8.5, 27, 25);
      actx.fillStyle = '#c9a56f';
      actx.fillRect(10, 12, 20, 4);
      actx.fillRect(10, 20, 20, 4);
      actx.fillRect(10, 28, 20, 4);
    }
    pickupSprites = { med, ammo };
  }
  return pickupSprites[kind];
}

// ─── Raycaster helpers ──────────────────────────────────────────────────────

function castRay(px: number, py: number, dirX: number, dirY: number, maxDist: number): RayResult {
  let mapX = Math.floor(px);
  let mapY = Math.floor(py);
  const deltaX = dirX === 0 ? 1e30 : Math.abs(1 / dirX);
  const deltaY = dirY === 0 ? 1e30 : Math.abs(1 / dirY);
  const stepX = dirX < 0 ? -1 : 1;
  const stepY = dirY < 0 ? -1 : 1;
  let sideX = dirX < 0 ? (px - mapX) * deltaX : (mapX + 1 - px) * deltaX;
  let sideY = dirY < 0 ? (py - mapY) * deltaY : (mapY + 1 - py) * deltaY;
  let side: 0 | 1 = 0;
  let dist = 0;
  for (let i = 0; i < 96; i++) {
    if (sideX < sideY) {
      sideX += deltaX;
      mapX += stepX;
      side = 0;
    } else {
      sideY += deltaY;
      mapY += stepY;
      side = 1;
    }
    dist = side === 0 ? sideX - deltaX : sideY - deltaY;
    if (dist > maxDist) break;
    if (isSolidTile(mapX, mapY)) {
      let wallX = side === 0 ? py + dist * dirY : px + dist * dirX;
      wallX -= Math.floor(wallX);
      return { dist, side, wallX, kind: tileKindAt(mapX, mapY) };
    }
  }
  return { dist: maxDist, side, wallX: 0, kind: TileKind.Floor };
}

function hasLineOfSight(x1: number, y1: number, x2: number, y2: number): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-4) return true;
  const hit = castRay(x1, y1, dx / len, dy / len, len);
  return hit.dist >= len - 0.05;
}

// ─── Sound ──────────────────────────────────────────────────────────────────

class Sfx {
  enabled = true;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private ensure(): AudioContext | null {
    if (!this.enabled) return null;
    try {
      if (!this.ctx) {
        const AC: typeof AudioContext | undefined =
          window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return null;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.3;
        this.master.connect(this.ctx.destination);
        const len = Math.floor(this.ctx.sampleRate * 0.12);
        this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo = 0) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start();
      osc.stop(ctx.currentTime + dur + 0.02);
    } catch {
      // Audio is best-effort; never break gameplay over it.
    }
  }

  private noise(dur: number, vol: number, cutoff: number) {
    const ctx = this.ensure();
    if (!ctx || !this.master || !this.noiseBuffer) return;
    try {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      src.start();
      src.stop(ctx.currentTime + dur + 0.02);
    } catch {
      // best-effort
    }
  }

  shoot() {
    this.noise(0.09, 0.5, 2600);
    this.tone(170, 0.1, 'square', 0.25, 55);
  }

  enemyShot() {
    this.noise(0.06, 0.22, 1800);
    this.tone(300, 0.06, 'square', 0.1, 120);
  }

  hit() {
    this.tone(1150, 0.04, 'square', 0.18);
  }

  kill() {
    this.tone(150, 0.18, 'sine', 0.4, 55);
    this.tone(900, 0.05, 'square', 0.15);
  }

  hurt() {
    this.tone(120, 0.2, 'sine', 0.45, 60);
  }

  reload() {
    this.tone(750, 0.03, 'square', 0.2);
    this.tone(560, 0.03, 'square', 0.2);
  }

  empty() {
    this.tone(420, 0.03, 'square', 0.15);
  }

  pickup() {
    this.tone(660, 0.1, 'sine', 0.3, 990);
  }

  wave() {
    this.tone(440, 0.12, 'square', 0.2);
    this.tone(660, 0.16, 'square', 0.2);
  }

  switchWeapon() {
    this.tone(320, 0.04, 'square', 0.15);
  }

  close() {
    try {
      if (this.ctx && this.ctx.state !== 'closed') void this.ctx.close();
    } catch {
      // best-effort
    }
    this.ctx = null;
    this.master = null;
  }
}

// ─── Game ───────────────────────────────────────────────────────────────────

export class IcebergGame extends BaseGame {
  private px = PLAYER_START.x;
  private py = PLAYER_START.y;
  private angle = PLAYER_START.angle;
  private keys = new Set<string>();
  private hp = MAX_HP;
  private weapons: Weapon[] = [];
  private weaponIndex = 0;
  private firing = false;
  private triggerPulse = false;
  private reloading = false;
  private reloadT = 0;
  private fireCooldown = 0;
  private recoil = 0;
  private muzzle = 0;
  private moving = false;
  private walkPhase = 0;
  private score = 0;
  private kills = 0;
  private wave = 0;
  private waveState: 'intermission' | 'active' = 'intermission';
  private waveTimer = 5;
  private bannerKey: string | null = null;
  private bannerT = 0;
  private enemies: Enemy[] = [];
  private tracers: Tracer[] = [];
  private particles: Particle[] = [];
  private pickups: Pickup[] = [];
  private pickupRespawnT = 0;
  private zBuffer = new Float32Array(480);
  private gameOver = false;
  private paused = false;
  private damageFlash = 0;
  private hitmarker = 0;
  private hitmarkerKill = false;
  private lookDrag: { lastX: number; lastY: number; moved: number } | null = null;
  private moveTouch: { id: number; ax: number; ay: number; dx: number; dy: number } | null = null;
  private lookTouch: { id: number; lastX: number; lastY: number } | null = null;
  private fireTouch: { id: number } | null = null;
  private reloadTouch: { id: number } | null = null;
  private touchMode = false;
  private readonly sfx = new Sfx();
  private readonly renderCanvas = document.createElement('canvas');
  private readonly renderCtx = this.renderCanvas.getContext('2d');
  private snow: SnowFlake[] = [];
  private hudStateCache = '';

  constructor(host?: GameHost) {
    super(host ?? createDefaultGameHost('gameCanvas', W, H));
    this.touchMode =
      typeof window !== 'undefined' &&
      ('ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0);
    this.snow = Array.from({ length: 70 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      size: 0.6 + Math.random() * 1.4,
      drift: (Math.random() - 0.5) * 14,
      speed: 22 + Math.random() * 30,
    }));
  }

  override getShellSnapshot(): GameShellSnapshot {
    return { score: this.score };
  }

  private makeWeapons(): Weapon[] {
    return [
      {
        name: 'RIFLE',
        nameZh: '突击步枪',
        dmg: 16,
        rate: 0.105,
        magSize: 30,
        mag: 30,
        reserve: 150,
        reload: 1.9,
        spreadStand: 0.01,
        spreadMove: 0.032,
        kick: 0.011,
        auto: true,
      },
      {
        name: 'PISTOL',
        nameZh: '手枪',
        dmg: 26,
        rate: 0.26,
        magSize: 12,
        mag: 12,
        reserve: 60,
        reload: 1.2,
        spreadStand: 0.006,
        spreadMove: 0.018,
        kick: 0.014,
        auto: false,
      },
    ];
  }

  init() {
    this.px = PLAYER_START.x;
    this.py = PLAYER_START.y;
    this.angle = PLAYER_START.angle;
    this.keys.clear();
    this.hp = MAX_HP;
    this.weapons = this.makeWeapons();
    this.weaponIndex = 0;
    this.firing = false;
    this.triggerPulse = false;
    this.reloading = false;
    this.reloadT = 0;
    this.fireCooldown = 0;
    this.recoil = 0;
    this.muzzle = 0;
    this.moving = false;
    this.walkPhase = 0;
    this.score = 0;
    this.kills = 0;
    this.wave = 0;
    this.waveState = 'intermission';
    this.waveTimer = 5;
    this.bannerKey = 'getReady';
    this.bannerT = 5;
    this.enemies = [];
    this.tracers = [];
    this.particles = [];
    this.pickups = PICKUP_SPOTS.map((spot) => ({ x: spot.x, y: spot.y, kind: spot.kind, t: Math.random() * 10 }));
    this.pickupRespawnT = 8;
    this.gameOver = false;
    this.paused = false;
    this.damageFlash = 0;
    this.hitmarker = 0;
    this.hitmarkerKill = false;
    this.lookDrag = null;
    this.moveTouch = null;
    this.lookTouch = null;
    this.fireTouch = null;
    this.reloadTouch = null;
    this.resetScoreReport();
    this.hudStateCache = '';
    this.syncDebugState();
  }

  private syncDebugState() {
    const alive = this.enemies.filter((e) => !e.dead).length;
    const key = `${this.wave},${alive},${this.kills},${this.hp},${this.gameOver ? 1 : 0}`;
    if (key === this.hudStateCache) return;
    this.hudStateCache = key;
    this.canvas.dataset.icebergState = key;
  }

  destroy() {
    this.stop();
    this.sfx.close();
  }

  override stop() {
    super.stop();
    try {
      if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    } catch {
      // best-effort
    }
  }

  // ── Input ─────────────────────────────────────────────────────────────────

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    if (e instanceof KeyboardEvent) {
      if (this.gameOver) {
        if (this.isRestartInput(e)) this.init();
        return;
      }
      if (e.type === 'keydown' && !e.repeat) {
        const key = e.key;
        if (key === 'p' || key === 'P') {
          this.paused = !this.paused;
          return;
        }
        if (key === 'm' || key === 'M') {
          this.sfx.enabled = !this.sfx.enabled;
          return;
        }
        if (this.paused) return;
        if (key === 'Escape') {
          if (document.pointerLockElement !== this.canvas) {
            this.paused = true;
          }
          return;
        }
        if (key === 'r' || key === 'R') this.startReload();
        else if (key === '1') this.switchWeapon(0);
        else if (key === '2') this.switchWeapon(1);
      }
      if (this.paused || this.gameOver) return;
      if (e.type === 'keydown') {
        this.keys.add(e.key);
        if (e.key === ' ') {
          this.firing = true;
          this.triggerPulse = !this.weapon().auto;
        }
      } else if (e.type === 'keyup') {
        this.keys.delete(e.key);
        if (e.key === ' ') this.firing = false;
      }
      return;
    }

    if (e instanceof MouseEvent) {
      if (this.gameOver) {
        if (e.type === 'mousedown' && e.button === 0) this.init();
        return;
      }
      if (this.paused) return;
      if (e.type === 'mousedown' && e.button === 0) {
        const locked = document.pointerLockElement === this.canvas;
        this.lookDrag = { lastX: e.clientX, lastY: e.clientY, moved: 0 };
        if (!locked) {
          try {
            this.canvas.requestPointerLock();
          } catch {
            // pointer lock unavailable — drag-to-look fallback still works
          }
        }
        if (locked) {
          // already aiming with the mouse: the click itself fires
          this.firing = true;
          this.triggerPulse = !this.weapon().auto;
        }
      } else if (e.type === 'mouseup' && e.button === 0) {
        const drag = this.lookDrag;
        this.lookDrag = null;
        if (document.pointerLockElement !== this.canvas && drag && drag.moved < 6) {
          // no pointer lock: a clean click fires a single shot
          this.triggerPulse = false;
          this.tryFire();
        }
        this.firing = false;
      } else if (e.type === 'mousemove') {
        if (document.pointerLockElement === this.canvas) {
          this.angle += e.movementX * MOUSE_SENS;
        } else if (this.lookDrag) {
          const dx = e.clientX - this.lookDrag.lastX;
          this.angle += dx * MOUSE_SENS * 1.6;
          this.lookDrag.moved += Math.abs(dx);
          this.lookDrag.lastX = e.clientX;
          this.lookDrag.lastY = e.clientY;
        }
      }
      return;
    }

    if (e instanceof TouchEvent) {
      if (this.gameOver) {
        if (this.isRestartInput(e)) this.init();
        return;
      }
      if (e.type === 'touchstart' && !this.paused) {
        for (const t of e.changedTouches) {
          const p = this.canvasPoint(t.clientX, t.clientY);
          if (p.x < this.width * 0.45) {
            if (!this.moveTouch) {
              this.moveTouch = { id: t.identifier, ax: p.x, ay: p.y, dx: 0, dy: 0 };
            }
          } else if (p.y > this.height * 0.68 && p.x > this.width * 0.72) {
            this.fireTouch = { id: t.identifier };
            this.firing = true;
            this.triggerPulse = !this.weapon().auto;
          } else if (p.y > this.height * 0.68 && p.x > this.width * 0.52) {
            this.reloadTouch = { id: t.identifier };
            this.startReload();
          } else if (!this.lookTouch) {
            this.lookTouch = { id: t.identifier, lastX: p.x, lastY: p.y };
          }
        }
      } else if (e.type === 'touchmove' && !this.paused) {
        for (const t of e.changedTouches) {
          const p = this.canvasPoint(t.clientX, t.clientY);
          if (this.moveTouch && t.identifier === this.moveTouch.id) {
            const dx = p.x - this.moveTouch.ax;
            const dy = p.y - this.moveTouch.ay;
            const len = Math.hypot(dx, dy);
            const maxR = 58;
            if (len > maxR) {
              this.moveTouch.dx = (dx / len) * maxR;
              this.moveTouch.dy = (dy / len) * maxR;
            } else {
              this.moveTouch.dx = dx;
              this.moveTouch.dy = dy;
            }
          } else if (this.lookTouch && t.identifier === this.lookTouch.id) {
            this.angle += (p.x - this.lookTouch.lastX) * 0.008;
            this.lookTouch.lastX = p.x;
            this.lookTouch.lastY = p.y;
          }
        }
      } else if (e.type === 'touchend' || e.type === 'touchcancel') {
        for (const t of e.changedTouches) {
          if (this.moveTouch && t.identifier === this.moveTouch.id) {
            this.moveTouch = null;
          }
          if (this.lookTouch && t.identifier === this.lookTouch.id) {
            this.lookTouch = null;
          }
          if (this.fireTouch && t.identifier === this.fireTouch.id) {
            this.fireTouch = null;
            this.firing = false;
          }
          if (this.reloadTouch && t.identifier === this.reloadTouch.id) {
            this.reloadTouch = null;
          }
        }
      }
    }
  }

  // ── Weapons ───────────────────────────────────────────────────────────────

  private weapon(): Weapon {
    return this.weapons[this.weaponIndex];
  }

  private startReload() {
    const w = this.weapon();
    if (this.reloading || this.gameOver || this.paused) return;
    if (w.mag >= w.magSize || w.reserve <= 0) {
      if (w.reserve <= 0 && w.mag === 0) this.sfx.empty();
      return;
    }
    this.reloading = true;
    this.reloadT = w.reload;
    this.sfx.reload();
  }

  private switchWeapon(index: number) {
    if (this.paused || this.gameOver) return;
    if (index === this.weaponIndex) return;
    this.weaponIndex = index;
    this.reloading = false;
    this.reloadT = 0;
    this.sfx.switchWeapon();
  }

  private tryFire() {
    if (this.gameOver || this.paused || this.reloading) return;
    const w = this.weapon();
    if (this.fireCooldown > 0) return;
    if (w.mag <= 0) {
      this.sfx.empty();
      if (w.reserve > 0) this.startReload();
      this.fireCooldown = 0.25;
      return;
    }
    w.mag--;
    this.fireCooldown = w.rate;
    this.recoil = Math.min(1, this.recoil + w.kick);
    this.muzzle = 0.055;
    const spread = (this.moving ? w.spreadMove : w.spreadStand) + this.recoil * 0.6;
    const shotAngle = this.angle + (Math.random() - 0.5) * 2 * spread;
    const dirX = Math.cos(shotAngle);
    const dirY = Math.sin(shotAngle);
    const hit = castRay(this.px, this.py, dirX, dirY, MAX_DIST);

    // nearest enemy on the ray
    let bestEnemy: Enemy | null = null;
    let bestT = hit.dist;
    for (const en of this.enemies) {
      if (en.dead || en.spawnT > 0) continue;
      const dx = en.x - this.px;
      const dy = en.y - this.py;
      const t = dx * dirX + dy * dirY;
      const perp = Math.abs(dx * dirY - dy * dirX);
      if (t > 0.2 && t < bestT && perp < 0.34) {
        bestEnemy = en;
        bestT = t;
      }
    }

    if (bestEnemy) {
      bestEnemy.hp -= w.dmg;
      bestEnemy.hitFlash = 0.12;
      bestEnemy.state = 'chase';
      this.hitmarker = 0.14;
      this.hitmarkerKill = false;
      this.tracers.push({
        x1: this.px,
        y1: this.py,
        x2: bestEnemy.x,
        y2: bestEnemy.y,
        life: 0.09,
        maxLife: 0.09,
        color: '#ffe9a8',
      });
      this.sfx.hit();
      if (bestEnemy.hp <= 0) this.killEnemy(bestEnemy);
    } else {
      this.tracers.push({
        x1: this.px,
        y1: this.py,
        x2: this.px + dirX * hit.dist,
        y2: this.py + dirY * hit.dist,
        life: 0.09,
        maxLife: 0.09,
        color: '#ffe9a8',
      });
    }
    this.sfx.shoot();
  }

  private killEnemy(en: Enemy) {
    en.dead = true;
    en.deadT = 0;
    this.kills++;
    this.score += 100 + this.wave * 10;
    this.hitmarker = 0.2;
    this.hitmarkerKill = true;
    const proj = this.project(en.x, en.y - 0.8);
    if (proj) {
      for (let i = 0; i < 12; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 30 + Math.random() * 90;
        this.particles.push({
          x: proj.x,
          y: proj.y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - 40,
          life: 0.5,
          maxLife: 0.5,
          size: 2 + Math.random() * 3,
          color: '#ffffff',
        });
      }
    }
    this.sfx.kill();
  }

  private hurtPlayer(dmg: number, fromX: number, fromY: number) {
    if (this.gameOver) return;
    this.hp -= dmg;
    this.damageFlash = 0.4;
    this.sfx.hurt();
    const proj = this.project(fromX, fromY - 0.8);
    if (proj) {
      this.tracers.push({
        x1: fromX,
        y1: fromY - 0.8,
        x2: this.px,
        y2: this.py - 0.8,
        life: 0.1,
        maxLife: 0.1,
        color: '#ffd9a0',
      });
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.gameOver = true;
      this.firing = false;
      try {
        if (document.pointerLockElement === this.canvas) document.exitPointerLock();
      } catch {
        // best-effort
      }
      this.submitScoreOnce(this.score);
    }
  }

  // ── Waves / enemies ───────────────────────────────────────────────────────

  private startWave() {
    this.wave++;
    this.waveState = 'active';
    this.bannerKey = 'wave';
    this.bannerT = 2.2;
    const count = Math.min(2 + this.wave, 9);
    const byDistance = SPAWN_POINTS
      .slice()
      .sort((a, b) => {
        const da = Math.hypot(a.x - this.px, a.y - this.py);
        const db = Math.hypot(b.x - this.px, b.y - this.py);
        return da - db;
      });
    // Wave 1 gives the player breathing room: spawn from mid-far points only.
    const pool =
      this.wave === 1
        ? byDistance.filter((p) => {
            const d = Math.hypot(p.x - this.px, p.y - this.py);
            return d >= 7.5 && d <= 14;
          })
        : byDistance.filter((p) => Math.hypot(p.x - this.px, p.y - this.py) >= 5);
    const spawnSpeed = this.wave === 1 ? 2.1 : 2.6;
    for (let i = 0; i < count; i++) {
      const spot = pool[i % Math.max(1, pool.length)];
      this.enemies.push(this.makeEnemy(spot.x, spot.y, i * 0.35, spawnSpeed));
    }
    this.sfx.wave();
  }

  private makeEnemy(x: number, y: number, spawnT: number, speed: number): Enemy {
    return {
      x,
      y,
      hp: 100,
      state: 'chase',
      dir: Math.random() * Math.PI * 2,
      speed,
      walkPhase: Math.random() * 10,
      hitFlash: 0,
      shootTimer: 0.8 + Math.random() * 1.4,
      burstLeft: 0,
      burstT: 0,
      strafeT: Math.random() * 2,
      strafeDir: Math.random() < 0.5 ? -1 : 1,
      repathT: 0,
      path: null,
      pathI: 0,
      targetX: x,
      targetY: y,
      offX: (Math.random() - 0.5) * 2.8,
      offY: (Math.random() - 0.5) * 2.8,
      lostT: 0,
      variant: Math.random() < 0.5 ? 0 : 1,
      flashT: 0,
      dead: false,
      deadT: 0,
      spawnT,
    };
  }

  private waveCleared() {
    this.score += 100 + this.wave * 50;
    this.hp = Math.min(MAX_HP, this.hp + 15);
    this.waveState = 'intermission';
    this.waveTimer = 4;
    this.bannerKey = 'cleared';
    this.bannerT = 2.2;
  }

  private updateEnemy(en: Enemy, dt: number) {
    if (en.spawnT > 0) {
      en.spawnT -= dt;
      return;
    }
    if (en.dead) {
      en.deadT += dt;
      return;
    }
    en.hitFlash = Math.max(0, en.hitFlash - dt);
    en.flashT = Math.max(0, en.flashT - dt);

    const dx = this.px - en.x;
    const dy = this.py - en.y;
    const dist = Math.hypot(dx, dy);
    const los = dist < 15 && hasLineOfSight(en.x, en.y, this.px, this.py);

    if (en.state === 'attack' && (!los || dist > 13)) en.state = 'chase';
    if (los && dist < 13) {
      en.state = 'attack';
      en.lostT = 0;
    } else if (dist < 14) {
      en.state = 'chase';
      en.lostT = 0;
    } else {
      en.lostT += dt;
      if (en.lostT > 3) en.state = 'patrol';
    }

    if (en.state === 'attack') {
      const targetAngle = Math.atan2(dy, dx);
      let delta = targetAngle - en.dir;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      en.dir += delta * Math.min(1, dt * 6);

      en.strafeT -= dt;
      if (en.strafeT <= 0) {
        en.strafeT = 1.5 + Math.random() * 2;
        en.strafeDir = Math.random() < 0.5 ? -1 : 1;
      }
      // keep advancing along a fresh path while firing; stop at mid range
      en.repathT -= dt;
      if (en.repathT <= 0) {
        en.repathT = 0.4;
        en.path = this.findPath(en.x, en.y, this.px + en.offX, this.py + en.offY);
        en.pathI = 0;
      }
      if (dist > 6.5 && en.path && en.pathI < en.path.length) {
        this.followPath(en, dt, 1.5);
      } else {
        // strafe sideways only when it keeps line of sight
        const strafeDx = Math.sin(en.dir) * en.strafeDir * 0.3;
        const strafeDy = -Math.cos(en.dir) * en.strafeDir * 0.3;
        if (hasLineOfSight(en.x + strafeDx, en.y + strafeDy, this.px, this.py)) {
          this.moveEntity(en, en.x + strafeDx, en.y + strafeDy, dt, 1.2);
        }
      }

      // burst fire: short controlled bursts with a clear pause between them
      en.shootTimer -= dt;
      if (en.shootTimer <= 0 && dist < 13) {
        en.burstLeft = this.wave <= 2 ? 2 : 3;
        en.burstT = 0;
        en.shootTimer = 999;
      }
      if (en.burstLeft > 0) {
        en.burstT -= dt;
        if (en.burstT <= 0) {
          en.burstLeft--;
          en.burstT = 0.18;
          this.enemyShoot(en, dist);
          if (en.burstLeft <= 0) en.shootTimer = 1.3 + Math.random() * 0.7;
        }
      }
    } else if (en.state === 'chase') {
      en.repathT -= dt;
      if (en.repathT <= 0) {
        en.repathT = 0.35;
        en.path = this.findPath(en.x, en.y, this.px, this.py);
        en.pathI = 0;
      }
      this.followPath(en, dt, en.speed);
    } else {
      // patrol: wander toward a random far point
      en.repathT -= dt;
      if (
        en.repathT <= 0 ||
        (en.path && en.pathI >= en.path.length)
      ) {
        en.repathT = 3 + Math.random() * 3;
        en.targetX = Math.max(1.5, Math.min(MAP_COLS - 1.5, en.x + (Math.random() - 0.5) * 8));
        en.targetY = Math.max(1.5, Math.min(MAP_ROWS - 1.5, en.y + (Math.random() - 0.5) * 8));
        en.path = this.findPath(en.x, en.y, en.targetX, en.targetY);
        en.pathI = 0;
      }
      this.followPath(en, dt, 1.3);
    }
  }

  private findPath(sx: number, sy: number, tx: number, ty: number): { x: number; y: number }[] | null {
    const startC = Math.floor(sx);
    const startR = Math.floor(sy);
    const endC = Math.floor(tx);
    const endR = Math.floor(ty);
    if (isSolidTile(startC, startR) || isSolidTile(endC, endR)) return null;
    if (startC === endC && startR === endR) return [];
    const startKey = startC * 1000 + startR;
    const endKey = endC * 1000 + endR;
    const prev = new Map<number, number>();
    const visited = new Set<number>([startKey]);
    const queue: number[] = [startKey];
    let found = false;
    while (queue.length > 0) {
      const key = queue.shift() as number;
      if (key === endKey) {
        found = true;
        break;
      }
      const c = Math.floor(key / 1000);
      const r = key % 1000;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= MAP_COLS || nr >= MAP_ROWS) continue;
        if (isSolidTile(nc, nr)) continue;
        const nk = nc * 1000 + nr;
        if (visited.has(nk)) continue;
        visited.add(nk);
        prev.set(nk, key);
        queue.push(nk);
      }
    }
    if (!found) return null;
    const path: { x: number; y: number }[] = [];
    let key = endKey;
    while (key !== startKey) {
      const c = Math.floor(key / 1000);
      const r = key % 1000;
      path.push({ x: c + 0.5, y: r + 0.5 });
      key = prev.get(key) as number;
    }
    path.reverse();
    return path;
  }

  private followPath(en: Enemy, dt: number, speed: number) {
    if (!en.path || en.pathI >= en.path.length) return;
    const wp = en.path[en.pathI];
    const dx = wp.x - en.x;
    const dy = wp.y - en.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.1) {
      en.pathI++;
      return;
    }
    const targetAngle = Math.atan2(dy, dx);
    let delta = targetAngle - en.dir;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    en.dir += delta * Math.min(1, dt * 6);
    this.moveEntity(en, en.x + (dx / d) * speed * dt, en.y + (dy / d) * speed * dt, dt, speed);
  }

  private moveEntity(en: Enemy, nx: number, ny: number, dt: number, speed: number) {
    const r = 0.3;
    let moved = false;
    if (!this.solidCircle(nx, en.y, r)) {
      en.x = nx;
      moved = true;
    }
    if (!this.solidCircle(en.x, ny, r)) {
      en.y = ny;
      moved = true;
    }
    // separation from other enemies
    for (const other of this.enemies) {
      if (other === en || other.dead) continue;
      const ddx = en.x - other.x;
      const ddy = en.y - other.y;
      const d = Math.hypot(ddx, ddy);
      if (d > 0.001 && d < 0.45) {
        const push = ((0.55 - d) / 0.55) * 0.6;
        en.x += (ddx / d) * push * dt * 4;
        en.y += (ddy / d) * push * dt * 4;
      }
    }
    if (moved) en.walkPhase += speed * dt * 2.6;
  }

  private enemyShoot(en: Enemy, dist: number) {
    en.flashT = 0.09;
    const spread = 0.05 + dist * 0.006;
    const ang = Math.atan2(this.py - en.y, this.px - en.x) + (Math.random() - 0.5) * 2 * spread;
    const dirX = Math.cos(ang);
    const dirY = Math.sin(ang);
    const dx = this.px - en.x;
    const dy = this.py - en.y;
    const t = dx * dirX + dy * dirY;
    const perp = Math.abs(dx * dirY - dy * dirX);
    const wall = castRay(en.x, en.y, dirX, dirY, dist + 0.4);
    if (t > 0 && perp < 0.3 && wall.dist >= dist - 0.2) {
      const falloff = 1 - 0.25 * (dist / 13);
      const dmg = Math.round((8 + Math.random() * 5) * falloff);
      this.hurtPlayer(dmg, en.x, en.y);
    }
    this.sfx.enemyShot();
  }

  // ── Collision / movement ──────────────────────────────────────────────────

  private solidCircle(cx: number, cy: number, r: number): boolean {
    return (
      isSolidTile(Math.floor(cx - r), Math.floor(cy - r)) ||
      isSolidTile(Math.floor(cx + r), Math.floor(cy - r)) ||
      isSolidTile(Math.floor(cx - r), Math.floor(cy + r)) ||
      isSolidTile(Math.floor(cx + r), Math.floor(cy + r))
    );
  }

  private movePlayer(dt: number) {
    let fx = 0;
    let fy = 0;
    if (this.keys.has('w') || this.keys.has('W') || this.keys.has('ArrowUp')) fy += 1;
    if (this.keys.has('s') || this.keys.has('S') || this.keys.has('ArrowDown')) fy -= 1;
    if (this.keys.has('d') || this.keys.has('D') || this.keys.has('ArrowRight')) fx += 1;
    if (this.keys.has('a') || this.keys.has('A') || this.keys.has('ArrowLeft')) fx -= 1;

    if (this.moveTouch) {
      fx = this.moveTouch.dx / 58;
      fy = -this.moveTouch.dy / 58;
    }

    const len = Math.hypot(fx, fy);
    this.moving = len > 0.01;
    if (!this.moving) return;

    const sprint = this.keys.has('Shift') && fy > 0.5 && Math.abs(fx) < 0.5;
    const speed = sprint ? SPRINT_SPEED : WALK_SPEED;
    const nx = fx / len;
    const ny = fy / len;
    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);
    const dx = (cos * ny + -sin * nx) * speed * dt;
    const dy = (sin * ny + cos * nx) * speed * dt;

    if (!this.solidCircle(this.px + dx, this.py, PLAYER_RADIUS)) this.px += dx;
    if (!this.solidCircle(this.px, this.py + dy, PLAYER_RADIUS)) this.py += dy;

    this.walkPhase += speed * dt * 2.4;
  }

  // ── Update ────────────────────────────────────────────────────────────────

  update(dt: number) {
    for (const flake of this.snow) {
      flake.y += flake.speed * dt;
      flake.x += flake.drift * dt;
      if (flake.y > H) {
        flake.y = -4;
        flake.x = Math.random() * W;
      }
      if (flake.x > W + 4) flake.x = -4;
      if (flake.x < -4) flake.x = W + 4;
    }

    this.bannerT = Math.max(0, this.bannerT - dt);
    if (this.paused || this.gameOver) return;

    if (this.waveState === 'intermission') {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) this.startWave();
    } else if (
      this.waveState === 'active' &&
      this.enemies.length > 0 &&
      this.enemies.every((e) => e.dead)
    ) {
      this.waveCleared();
    }

    this.movePlayer(dt);

    // weapons
    this.fireCooldown -= dt;
    this.recoil = Math.max(0, this.recoil - dt * 0.28);
    this.muzzle = Math.max(0, this.muzzle - dt);
    if (this.reloading) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const w = this.weapon();
        const need = w.magSize - w.mag;
        const take = Math.min(need, w.reserve);
        w.mag += take;
        w.reserve -= take;
        this.reloading = false;
      }
    } else if (this.fireCooldown <= 0) {
      const w = this.weapon();
      if (w.auto && this.firing) {
        this.tryFire();
      } else if (!w.auto && this.triggerPulse) {
        this.triggerPulse = false;
        this.tryFire();
      }
    }

    // enemies
    for (const en of this.enemies) this.updateEnemy(en, dt);
    this.enemies = this.enemies.filter((e) => !(e.dead && e.deadT > 1.6));

    // tracers / particles
    for (const tr of this.tracers) tr.life -= dt;
    this.tracers = this.tracers.filter((tr) => tr.life > 0);
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 160 * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    // pickups
    this.pickupRespawnT -= dt;
    if (this.pickupRespawnT <= 0) {
      this.pickupRespawnT = 12;
      if (this.pickups.length < PICKUP_SPOTS.length) {
        const free = PICKUP_SPOTS.filter(
          (spot) => !this.pickups.some((p) => Math.floor(p.x) === Math.floor(spot.x) && Math.floor(p.y) === Math.floor(spot.y)),
        );
        if (free.length) {
          const spot = free[Math.floor(Math.random() * free.length)];
          this.pickups.push({ x: spot.x, y: spot.y, kind: spot.kind, t: Math.random() * 10 });
        }
      }
    }
    for (const p of this.pickups) p.t += dt;
    this.pickups = this.pickups.filter((p) => {
      if (Math.hypot(p.x - this.px, p.y - this.py) > 0.55) return true;
      if (p.kind === 'med') {
        if (this.hp >= MAX_HP) return true;
        this.hp = Math.min(MAX_HP, this.hp + 30);
      } else {
        const rifle = this.weapons[0];
        const pistol = this.weapons[1];
        if (rifle.reserve >= 240 && pistol.reserve >= 120) return true;
        rifle.reserve = Math.min(240, rifle.reserve + 60);
        pistol.reserve = Math.min(120, pistol.reserve + 24);
      }
      this.sfx.pickup();
      const proj = this.project(p.x, p.y - 0.5);
      if (proj) {
        for (let i = 0; i < 8; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 20 + Math.random() * 60;
          this.particles.push({
            x: proj.x,
            y: proj.y,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp - 30,
            life: 0.4,
            maxLife: 0.4,
            size: 2,
            color: p.kind === 'med' ? '#7ee08a' : '#f5c46a',
          });
        }
      }
      return false;
    });

    this.damageFlash = Math.max(0, this.damageFlash - dt * 0.9);
    this.hitmarker = Math.max(0, this.hitmarker - dt);
    this.syncDebugState();
  }

  // ── 3D projection helpers ─────────────────────────────────────────────────

  private project(wx: number, wy: number): { x: number; y: number; depth: number } | null {
    const dirX = Math.cos(this.angle);
    const dirY = Math.sin(this.angle);
    const planeX = -dirY * HALF_FOV_TAN;
    const planeY = dirX * HALF_FOV_TAN;
    const dx = wx - this.px;
    const dy = wy - this.py;
    const invDet = 1 / (planeX * dirY - dirX * planeY);
    const tx = invDet * (dirY * dx - dirX * dy);
    const ty = invDet * (-planeY * dx + planeX * dy);
    if (ty <= 0.06) return null;
    return { x: W / 2 * (1 + tx / ty), y: H / 2, depth: ty };
  }

  // ── Draw ──────────────────────────────────────────────────────────────────

  draw(ctx: CanvasRenderingContext2D) {
    const pixel = this.isPixelMode();
    const rw = pixel ? 320 : 480;
    const rh = pixel ? 180 : 270;
    if (this.renderCanvas.width !== rw) {
      this.renderCanvas.width = rw;
      this.renderCanvas.height = rh;
    }
    const rctx = this.renderCtx;
    if (!rctx) return;

    // sky
    const sky = rctx.createLinearGradient(0, 0, 0, rh);
    sky.addColorStop(0, '#9cc6ea');
    sky.addColorStop(0.7, '#d3e5f4');
    sky.addColorStop(1, '#eef5fa');
    rctx.fillStyle = sky;
    rctx.fillRect(0, 0, rw, rh);

    // distant ice mountains
    rctx.fillStyle = '#dbe9f5';
    rctx.beginPath();
    rctx.moveTo(0, rh / 2);
    rctx.lineTo(0, rh / 2 - 26);
    rctx.lineTo(rw * 0.16, rh / 2 - 64);
    rctx.lineTo(rw * 0.32, rh / 2 - 18);
    rctx.lineTo(rw * 0.48, rh / 2 - 52);
    rctx.lineTo(rw * 0.66, rh / 2 - 22);
    rctx.lineTo(rw * 0.82, rh / 2 - 58);
    rctx.lineTo(rw, rh / 2 - 16);
    rctx.lineTo(rw, rh / 2);
    rctx.closePath();
    rctx.fill();
    rctx.fillStyle = '#c6dcf0';
    rctx.beginPath();
    rctx.moveTo(rw * 0.16, rh / 2 - 64);
    rctx.lineTo(rw * 0.2, rh / 2 - 34);
    rctx.lineTo(rw * 0.12, rh / 2 - 34);
    rctx.closePath();
    rctx.fill();
    rctx.beginPath();
    rctx.moveTo(rw * 0.48, rh / 2 - 52);
    rctx.lineTo(rw * 0.53, rh / 2 - 26);
    rctx.lineTo(rw * 0.44, rh / 2 - 26);
    rctx.closePath();
    rctx.fill();

    // floor + walls per column
    const dirX = Math.cos(this.angle);
    const dirY = Math.sin(this.angle);
    const planeX = -dirY * HALF_FOV_TAN;
    const planeY = dirX * HALF_FOV_TAN;

    for (let col = 0; col < rw; col++) {
      const camX = (2 * col) / rw - 1;
      const rayX = dirX + planeX * camX;
      const rayY = dirY + planeY * camX;
      const hit = castRay(this.px, this.py, rayX, rayY, MAX_DIST);
      this.zBuffer[col] = hit.dist;

      const lineHeight = rh / Math.max(hit.dist, 1e-4);
      const wallTop = rh / 2 - lineHeight / 2;
      const wallBot = rh / 2 + lineHeight / 2;
      const fog = Math.max(0, Math.min(1, (hit.dist - FOG_START) / (MAX_DIST - FOG_START)));

      // floor
      const shade = 1 - fog * 0.65 + ((col * 13 + col * col * 7) % 5) / 100;
      const fr = Math.min(255, Math.round(224 * shade + fog * 30));
      const fg = Math.min(255, Math.round(234 * shade + fog * 24));
      const fb = Math.min(255, Math.round(244 * shade + fog * 20));
      rctx.fillStyle = `rgb(${fr},${fg},${fb})`;
      rctx.fillRect(col, Math.max(0, wallBot), 1, rh - Math.max(0, wallBot));

      if (hit.dist < MAX_DIST - 0.01 && hit.kind !== TileKind.Floor) {
        const tex = getWallTexture(hit.kind);
        const texX = Math.min(63, Math.floor(hit.wallX * 64));
        rctx.drawImage(tex, texX, 0, 1, 64, col, wallTop, 1, lineHeight);
        if (fog > 0.02) {
          rctx.fillStyle = `rgba(238,245,250,${fog * 0.92})`;
          rctx.fillRect(col, wallTop, 1, lineHeight);
        }
      } else if (hit.dist >= MAX_DIST - 0.01) {
        rctx.fillStyle = 'rgba(238,245,250,0.9)';
        rctx.fillRect(col, wallTop, 1, lineHeight);
      }
    }

    // sprites: pickups + enemies, far to near
    interface SpriteItem {
      depth: number;
      x: number;
      y: number;
      tex: HTMLCanvasElement;
      width: number;
      height: number;
      ground: boolean;
      flash?: boolean;
    }
    const sprites: SpriteItem[] = [];
    for (const p of this.pickups) {
      const tex = getPickupSprite(p.kind);
      sprites.push({ depth: 0, x: p.x, y: p.y - 0.35 + Math.sin(p.t * 2.4) * 0.08, tex, width: 40, height: 40, ground: false });
    }
    const soldier = getSoldierFrames();
    for (const en of this.enemies) {
      if (en.spawnT > 0) continue;
      if (en.dead) {
        sprites.push({ depth: 0, x: en.x, y: en.y, tex: soldier.dead, width: 64, height: 96, ground: true });
        continue;
      }
      let frame: HTMLCanvasElement;
      if (en.flashT > 0) {
        frame = soldier.frames[3];
      } else if (en.state === 'patrol' && !this.moving) {
        frame = soldier.frames[0];
      } else {
        const step = Math.floor(en.walkPhase) % 2;
        frame = soldier.frames[step === 0 ? 1 : 2];
      }
      sprites.push({ depth: 0, x: en.x, y: en.y - 0.45, tex: frame, width: 64, height: 96, ground: false, flash: en.flashT > 0 });
    }

    for (const sp of sprites) {
      const dx = sp.x - this.px;
      const dy = sp.y - this.py;
      const invDet = 1 / (planeX * dirY - dirX * planeY);
      const tx = invDet * (dirY * dx - dirX * dy);
      const ty = invDet * (-planeY * dx + planeX * dy);
      if (ty <= 0.06) continue;
      sp.depth = ty;
    }
    sprites.sort((a, b) => b.depth - a.depth);

    for (const sp of sprites) {
      const dx = sp.x - this.px;
      const dy = sp.y - this.py;
      const invDet = 1 / (planeX * dirY - dirX * planeY);
      const tx = invDet * (dirY * dx - dirX * dy);
      const ty = invDet * (-planeY * dx + planeX * dy);
      if (ty <= 0.06) continue;
      const screenX = Math.floor((rw / 2) * (1 + tx / ty));
      const spriteH = Math.max(2, rh / ty);
      const aspect = sp.tex.width / sp.tex.height;
      const spriteW = spriteH * aspect;
      const drawStartY = Math.floor(rh / 2 - spriteH / 2 + (sp.ground ? spriteH / 2 : 0));
      const drawStartX = Math.floor(screenX - spriteW / 2);
      const drawEndX = Math.min(rw, drawStartX + spriteW);
      for (let stripe = Math.max(0, drawStartX); stripe < drawEndX; stripe++) {
        if (ty >= this.zBuffer[stripe]) continue;
        const texX = Math.floor(((stripe - drawStartX) / spriteW) * sp.tex.width);
        rctx.drawImage(
          sp.tex,
          Math.min(sp.tex.width - 1, texX), 0, 1, sp.tex.height,
          stripe, drawStartY, 1, spriteH,
        );
      }
      if (sp.flash) {
        rctx.fillStyle = 'rgba(255,214,110,0.95)';
        rctx.beginPath();
        rctx.arc(screenX + spriteW * 0.18, drawStartY + spriteH * 0.42, Math.max(2, spriteH * 0.09), 0, Math.PI * 2);
        rctx.fill();
      }
    }

    // blit to screen
    ctx.imageSmoothingEnabled = !pixel;
    ctx.drawImage(this.renderCanvas, 0, 0, rw, rh, 0, 0, W, H);

    // snow
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    for (const flake of this.snow) {
      ctx.fillRect(flake.x, flake.y, flake.size, flake.size);
    }

    // tracers
    for (const tr of this.tracers) {
      const a = this.project(tr.x1, tr.y1);
      const b = this.project(tr.x2, tr.y2);
      if (!a || !b) continue;
      const alpha = Math.max(0, tr.life / tr.maxLife) * 0.85;
      ctx.strokeStyle = tr.color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // particles (screen space)
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    this.drawViewmodel(ctx);
    this.drawHud(ctx, pixel);

    if (this.paused) {
      ctx.fillStyle = 'rgba(6,12,24,0.55)';
      ctx.fillRect(0, 0, W, H);
      const zh = this.isZhLang();
      ctx.fillStyle = '#f1f5f9';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 30px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(zh ? '已暂停' : 'PAUSED', W / 2, H / 2 - 20);
      ctx.font = '15px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = 'rgba(241,245,249,0.8)';
      ctx.fillText(zh ? '按 P 继续' : 'PRESS P TO RESUME', W / 2, H / 2 + 22);
    }

    if (this.gameOver) {
      const zh = this.isZhLang();
      this.drawResultOverlay(ctx, {
        title: zh ? '任务失败' : 'MISSION FAILED',
        tone: 'danger',
        details: [
          `${zh ? '得分' : 'SCORE'} ${this.score}`,
          `${zh ? '击杀' : 'KILLS'} ${this.kills}    ${zh ? '波次' : 'WAVE'} ${this.wave}`,
        ],
        hint: zh ? '点击或按空格重新开始' : 'CLICK OR PRESS SPACE',
      });
      return;
    }

    if (this.touchMode) this.drawTouchControls(ctx);
  }

  private drawViewmodel(ctx: CanvasRenderingContext2D) {
    if (this.gameOver) return;
    const bobY = this.moving ? Math.sin(this.walkPhase) * 5 : 0;
    const swayX = this.moving ? Math.cos(this.walkPhase * 0.5) * 6 : 0;
    ctx.save();
    ctx.translate(W / 2 + 46 + swayX, H + 34);
    ctx.rotate(-0.44 - this.recoil * 0.9);
    ctx.translate(0, -bobY);

    ctx.fillStyle = '#2a2f38';
    ctx.fillRect(-30, -26, 110, 30);
    ctx.fillStyle = '#1e232b';
    ctx.fillRect(40, -18, 250, 20);
    ctx.fillStyle = '#333a45';
    ctx.fillRect(8, -12, 40, 52);
    ctx.fillStyle = '#232830';
    ctx.fillRect(-44, -30, 22, 34);

    ctx.fillStyle = '#d9a06f';
    ctx.beginPath();
    ctx.arc(52, 1, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(176, -6, 12, 0, Math.PI * 2);
    ctx.fill();

    if (this.muzzle > 0) {
      const size = 16 + this.muzzle * 320;
      ctx.fillStyle = 'rgba(255,224,130,0.95)';
      ctx.beginPath();
      ctx.arc(300, -8, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,246,214,0.95)';
      ctx.beginPath();
      ctx.arc(300, -8, size * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawHud(ctx: CanvasRenderingContext2D, pixel: boolean) {
    const zh = this.isZhLang();
    const font = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textBaseline = 'middle';

    // top-left: score + kills
    ctx.fillStyle = 'rgba(8,16,30,0.55)';
    ctx.fillRect(12, 12, 150, 46);
    ctx.fillStyle = '#f1f5f9';
    ctx.textAlign = 'left';
    ctx.font = `bold 16px ${font}`;
    ctx.fillText(`${zh ? '得分' : 'SCORE'} ${this.score}`, 22, 26);
    ctx.font = `13px ${font}`;
    ctx.fillStyle = 'rgba(241,245,249,0.75)';
    ctx.fillText(`${zh ? '击杀' : 'KILLS'} ${this.kills}   ${zh ? '波次' : 'WAVE'} ${this.wave}`, 22, 46);

    // top-center: wave banner / countdown
    ctx.textAlign = 'center';
    if (this.bannerT > 0 && this.bannerKey) {
      const alpha = Math.min(1, this.bannerT);
      ctx.globalAlpha = alpha;
      const title =
        this.bannerKey === 'wave'
          ? zh ? `第 ${this.wave} 波` : `WAVE ${this.wave}`
          : this.bannerKey === 'cleared'
            ? zh ? '波次清剿!' : 'WAVE CLEARED'
            : zh ? '准备战斗' : 'GET READY';
      const sub =
        this.bannerKey === 'wave'
          ? zh ? '敌军来袭' : 'ENEMIES INBOUND'
          : this.bannerKey === 'cleared'
            ? zh ? '+15 生命  波次奖励' : '+15 HP  WAVE BONUS'
            : zh ? '守住阵地' : 'HOLD THE LINE';
      ctx.font = `bold 30px ${font}`;
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(10,25,45,0.8)';
      ctx.shadowBlur = pixel ? 0 : 8;
      ctx.fillText(title, W / 2, 52);
      ctx.shadowBlur = 0;
      ctx.font = `13px ${font}`;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(sub, W / 2, 78);
      ctx.globalAlpha = 1;
    }
    if (this.waveState === 'intermission') {
      ctx.font = `12px ${font}`;
      ctx.fillStyle = 'rgba(241,245,249,0.8)';
      ctx.fillText(
        zh ? `下一波 ${Math.ceil(this.waveTimer)}` : `NEXT WAVE ${Math.ceil(this.waveTimer)}`,
        W / 2,
        96,
      );
    } else {
      const alive = this.enemies.filter((e) => !e.dead).length;
      ctx.font = `12px ${font}`;
      ctx.fillStyle = 'rgba(241,245,249,0.8)';
      ctx.fillText(zh ? `敌军 ${alive}` : `HOSTILES ${alive}`, W / 2, 96);
    }

    // opening controls hint — fades out once the fight gets going
    if (this.wave <= 1 && this.bannerT > 0 && !this.paused) {
      const hint =
        zh
          ? 'WASD 移动 · 鼠标瞄准 · 左键/空格射击 · R 换弹 · 1/2 切换武器'
          : 'WASD MOVE · MOUSE AIM · CLICK/SPACE FIRE · R RELOAD · 1/2 WEAPONS';
      ctx.font = `14px ${font}`;
      const width = ctx.measureText(hint).width;
      ctx.fillStyle = `rgba(8,16,30,${Math.min(0.62, this.bannerT * 0.35)})`;
      ctx.fillRect(W / 2 - width / 2 - 14, H - 96, width + 28, 30);
      ctx.fillStyle = `rgba(241,245,249,${Math.min(0.95, this.bannerT)})`;
      ctx.textAlign = 'center';
      ctx.fillText(hint, W / 2, H - 80);
    }

    // minimap
    this.drawMinimap(ctx);

    // bottom-left: HP
    const hpX = 16;
    const hpY = H - 52;
    ctx.fillStyle = 'rgba(8,16,30,0.55)';
    ctx.fillRect(hpX - 6, hpY - 4, 206, 44);
    ctx.textAlign = 'left';
    ctx.font = `bold 16px ${font}`;
    const hpColor = this.hp > 60 ? '#5ee08a' : this.hp > 30 ? '#f5c46a' : '#f07b72';
    ctx.fillStyle = hpColor;
    ctx.fillText(String(this.hp), hpX + 2, hpY + 16);
    ctx.font = `12px ${font}`;
    ctx.fillStyle = 'rgba(241,245,249,0.75)';
    ctx.fillText(zh ? '生命' : 'HP', hpX + 34, hpY + 16);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(hpX, hpY + 24, 190, 10);
    ctx.fillStyle = hpColor;
    ctx.fillRect(hpX, hpY + 24, 190 * (this.hp / MAX_HP), 10);

    // bottom-right: ammo
    const w = this.weapon();
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(8,16,30,0.55)';
    ctx.fillRect(W - 220, H - 62, 208, 54);
    ctx.font = `bold 26px ${font}`;
    ctx.fillStyle = w.mag === 0 ? '#f07b72' : '#f1f5f9';
    ctx.fillText(String(w.mag), W - 36, H - 34);
    ctx.font = `13px ${font}`;
    ctx.fillStyle = 'rgba(241,245,249,0.75)';
    ctx.fillText(`/ ${w.reserve}`, W - 44, H - 20);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(241,245,249,0.85)';
    ctx.fillText(zh ? w.nameZh : w.name, W - 210, H - 36);
    if (this.reloading) {
      ctx.fillStyle = 'rgba(241,245,249,0.85)';
      ctx.font = `12px ${font}`;
      ctx.fillText(zh ? '换弹中' : 'RELOADING', W - 210, H - 18);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(W - 210, H - 12, 180, 6);
      const ww = this.weapon();
      const pct = 1 - this.reloadT / ww.reload;
      ctx.fillStyle = '#39C5BB';
      ctx.fillRect(W - 210, H - 12, 180 * pct, 6);
    }

    // mute indicator
    if (!this.sfx.enabled) {
      ctx.textAlign = 'left';
      ctx.font = `12px ${font}`;
      ctx.fillStyle = 'rgba(241,245,249,0.8)';
      ctx.fillText(zh ? '静音' : 'MUTED', 16, 72);
    }

    // crosshair
    const spreadPx = 3 + ((this.moving ? 0.02 : 0.005) + this.recoil * 0.5) * 900;
    const cx = W / 2;
    const cy = H / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(cx - 1, cy - spreadPx - 9, 2, 8);
    ctx.fillRect(cx - 1, cy + spreadPx + 1, 2, 8);
    ctx.fillRect(cx - spreadPx - 9, cy - 1, 8, 2);
    ctx.fillRect(cx + spreadPx + 1, cy - 1, 8, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillRect(cx - 1, cy - spreadPx - 9, 1, 8);
    ctx.fillRect(cx - 1, cy + spreadPx + 1, 1, 8);
    ctx.fillRect(cx - spreadPx - 9, cy - 1, 8, 1);
    ctx.fillRect(cx + spreadPx + 1, cy - 1, 8, 1);
    ctx.fillRect(cx - 1, cy - 1, 2, 2);

    // hit marker
    if (this.hitmarker > 0) {
      const a = this.hitmarker / 0.2;
      ctx.strokeStyle = this.hitmarkerKill ? `rgba(255,90,80,${a})` : `rgba(255,255,255,${a})`;
      ctx.lineWidth = 2;
      const r = 10;
      ctx.beginPath();
      ctx.moveTo(cx - r, cy - r);
      ctx.lineTo(cx - r + 5, cy - r + 5);
      ctx.moveTo(cx - r, cy + r);
      ctx.lineTo(cx - r + 5, cy + r - 5);
      ctx.moveTo(cx + r, cy - r);
      ctx.lineTo(cx + r - 5, cy - r + 5);
      ctx.moveTo(cx + r, cy + r);
      ctx.lineTo(cx + r - 5, cy + r - 5);
      ctx.stroke();
    }

    // damage flash + low HP pulse
    if (this.damageFlash > 0 || this.hp < 35) {
      const pulse = this.hp < 35 ? 0.14 + Math.sin(performance.now() / 300) * 0.08 : 0;
      const alpha = Math.max(this.damageFlash * 0.8, pulse);
      if (alpha > 0.01) {
        const grad = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.72);
        grad.addColorStop(0, 'rgba(220,50,50,0)');
        grad.addColorStop(1, `rgba(220,50,50,${Math.min(0.6, alpha)})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
      }
    }
  }

  private drawMinimap(ctx: CanvasRenderingContext2D) {
    const scale = 5.5;
    const mw = MAP_COLS * scale;
    const mh = MAP_ROWS * scale;
    const mx = W - mw - 14;
    const my = 14;
    ctx.fillStyle = 'rgba(8,16,30,0.55)';
    ctx.fillRect(mx - 4, my - 4, mw + 8, mh + 8);
    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        const kind = tileKindAt(c, r);
        if (kind === TileKind.Floor) continue;
        ctx.fillStyle =
          kind === TileKind.IceWall ? '#8fb3d6'
            : kind === TileKind.Crate ? '#a98a63'
              : kind === TileKind.Container ? '#55779b'
                : '#cfe0ee';
        ctx.fillRect(mx + c * scale, my + r * scale, scale - 0.4, scale - 0.4);
      }
    }
    // pickups
    for (const p of this.pickups) {
      ctx.fillStyle = p.kind === 'med' ? '#5ee08a' : '#f5c46a';
      ctx.fillRect(mx + (p.x - 0.5) * scale + 1, my + (p.y - 0.5) * scale + 1, 3, 3);
    }
    // enemies
    for (const en of this.enemies) {
      if (en.dead) continue;
      ctx.fillStyle = '#f07b72';
      ctx.beginPath();
      ctx.arc(mx + en.x * scale, my + en.y * scale, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // player arrow
    ctx.save();
    ctx.translate(mx + this.px * scale, my + this.py * scale);
    ctx.rotate(this.angle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.lineTo(-3, -3);
    ctx.lineTo(-3, 3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawTouchControls(ctx: CanvasRenderingContext2D) {
    const zh = this.isZhLang();
    if (this.moveTouch) {
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.moveTouch.ax, this.moveTouch.ay, 58, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.arc(this.moveTouch.ax + this.moveTouch.dx, this.moveTouch.ay + this.moveTouch.dy, 26, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(92, H - 92, 58, 0, Math.PI * 2);
      ctx.stroke();
    }
    const fireActive = !!this.fireTouch;
    ctx.fillStyle = fireActive ? 'rgba(240,90,80,0.75)' : 'rgba(240,90,80,0.4)';
    ctx.beginPath();
    ctx.arc(W - 88, H - 84, 44, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 14px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(zh ? '开火' : 'FIRE', W - 88, H - 84);
    const reloadActive = !!this.reloadTouch;
    ctx.fillStyle = reloadActive ? 'rgba(57,197,187,0.75)' : 'rgba(57,197,187,0.4)';
    ctx.beginPath();
    ctx.arc(W - 88, H - 164, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(zh ? '换弹' : 'R', W - 88, H - 164);
    ctx.font = '11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(zh ? '左:移动  右:视角' : 'LEFT: MOVE  RIGHT: AIM', W / 2, H - 14);
  }
}
