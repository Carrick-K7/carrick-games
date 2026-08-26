// Counter-Strike — a first-person CS 1.6 port on fy_iceworld.
//
// Classic CS 1.6 rule set on the famous four-room ice arena: T vs CT
// elimination rounds, $800 start money, guns under every spawn, the exposed
// center buyzone, armor + helmet, grenades, headshots, kill feed, radar, and
// a first-to-3 match. The renderer is a HiDPI raycaster (procedural ice
// textures, billboard soldiers, per-stripe depth); weapons, damage tables,
// prices, rates, movement speeds, and the buy menu follow the CS 1.6
// references in counterstrikeRules.ts.

import {
  BaseGame,
  createDefaultGameHost,
  type GameHost,
  type GameShellSnapshot,
} from '../core/game.js';
import { Sfx } from './counterstrikeAudio.js';
import { getGrenadeSprite, getSoldierFrames, getWallTexture, getWeaponSprite } from './counterstrikeAssets.js';
import { CounterStrikeScene3D } from './counterstrikeScene3d.js';
import {
  BUY_ZONE_RECT,
  CT_SPAWNS,
  ICEBERG_MAP,
  MAP_COLS,
  MAP_PIXEL_X,
  MAP_PIXEL_Y,
  MAP_ROWS,
  T_SPAWNS,
  TILE,
  TileKind,
  castRay,
  findMapPath,
  hasLineOfSight,
  nearestWalkableTile,
  inBuyZone,
  isSolidTile,
  solidCircle,
  wallTintAt,
  type MapPathPoint,
} from './counterstrikeMap.js';
import {
  BUY_CATEGORIES,
  CROUCH_MULT,
  ECONOMY,
  ROUND,
  SPEED_SCALE,
  WALK_MULT,
  WEAPONS,
  applyDamage,
  buyItemsForTeam,
  clampMoney,
  computeDamage,
  lossMoney,
  matchScore,
  matchWinner,
  rollHitZone,
  type BuyMenuItem,
  type HitZone,
  type Team,
  type WeaponDef,
  type WeaponId,
} from './counterstrikeRules.js';

const W = 1280;
const H = 720;
const HALF_FOV_TAN = Math.tan(((66 * Math.PI) / 180) / 2);
const MAX_DIST = 3200;
const FOG_START = 900;
/** Bullets travel until a wall; falloff handles the rest (CS 1.6 behavior). */
const MAX_SHOT_DIST = Math.hypot(MAP_PIXEL_X, MAP_PIXEL_Y);
const WALL_H = TILE; // 60
const EYE = 56;       // CS eye height (~0.9 of a player's 72 units)
const EYE_CROUCH = 38;
const PITCH_MAX = 0.52; // vertical look limit (~30°)
const PLAYER_RADIUS = 15;
const SOLDIER_H = 66; // world height of a soldier sprite (≈72 map units)
const BOT_VISION = 960;
const MAX_HP = ROUND.maxHp;
const MAX_ARMOR = ROUND.maxArmor;
const MOUSE_SENS = 0.0022;

const CT_BOT_NAMES = ['Gordon', 'Shephard', 'Riley'];
const T_BOT_NAMES = ['Sasha', 'Vlad', 'Rustam', 'Yuri'];

const WEAPON_SHORT: Record<WeaponId, string> = {
  knife: 'KNIFE',
  glock: 'GLOCK',
  usp: 'USP',
  p228: 'P228',
  deagle: 'DEAGLE',
  fiveseven: '5-7',
  elite: 'ELITES',
  m3: 'M3',
  xm1014: 'XM1014',
  tmp: 'TMP',
  mac10: 'MAC10',
  mp5: 'MP5',
  ump45: 'UMP',
  p90: 'P90',
  galil: 'GALIL',
  famas: 'FAMAS',
  ak47: 'AK-47',
  sg552: 'SG552',
  m4a1: 'M4A1',
  aug: 'AUG',
  scout: 'SCOUT',
  awp: 'AWP',
  g3sg1: 'G3SG1',
  sg550: 'SG550',
  m249: 'M249',
};

type Phase = 'freeze' | 'live' | 'post' | 'matchOver';
type SlotKind = 'primary' | 'secondary' | 'knife' | 'nade';
type NadeKind = 'he' | 'flash' | 'smoke';

interface SlotWeapon {
  def: WeaponDef;
  mag: number;
  reserve: number;
  silenced: boolean;
  burst: boolean;
}

interface Fighter {
  team: Team;
  name: string;
  isBot: boolean;
  x: number;
  y: number;
  angle: number;
  hp: number;
  armor: number;
  helmet: boolean;
  money: number;
  alive: boolean;
  keepLoadout: boolean;
  primary: SlotWeapon | null;
  pistols: SlotWeapon[];
  knife: SlotWeapon;
  nades: { he: number; flash: number; smoke: number };
  nadeSel: NadeKind;
  slot: SlotKind;
  pistolIndex: number;
  lastSlot: SlotKind;
  fireCd: number;
  reloadT: number;
  reloading: boolean;
  recoil: number;
  muzzle: number;
  moving: boolean;
  walkPhase: number;
  flashT: number;
  walk: boolean;
  crouch: boolean;
  kills: number;
  deaths: number;
  hitFlash: number;
  deadT: number;
  altSwing: boolean;
  skill: number;
  path: MapPathPoint[] | null;
  pathI: number;
  repathT: number;
  lastSeenX: number;
  lastSeenY: number;
  lastSeenT: number;
  aimErr: number;
  hasTarget: boolean;
  strafeDir: number;
  strafeT: number;
  burstLeft: number;
  burstPause: number;
  roamX: number;
  roamY: number;
  roamT: number;
  variant: number;
}

interface GroundItem {
  x: number;
  y: number;
  kind: 'weapon' | 'nade';
  weaponId?: WeaponId;
  nade?: NadeKind;
  mag: number;
  reserve: number;
  fixed: boolean;
}

interface Tracer {
  x1: number;
  y1: number;
  z1: number;
  x2: number;
  y2: number;
  z2: number;
  life: number;
  maxLife: number;
  color: string;
}

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

interface SmokeCloud {
  x: number;
  y: number;
  r: number;
  maxR: number;
  life: number;
  maxLife: number;
}

interface Grenade {
  x: number;
  y: number;
  vx: number;
  vy: number;
  type: NadeKind;
  fuse: number;
  age: number;
  owner: Fighter;
}

interface FeedEntry {
  text: string;
  color: string;
  life: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const shuffle = <T,>(arr: T[]): T[] => {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

export class CounterStrikeGame extends BaseGame {
  private fighters: Fighter[] = [];
  private ground: GroundItem[] = [];
  private tracers: Tracer[] = [];
  private particles: Particle[] = [];
  private smokes: SmokeCloud[] = [];
  private grenades: Grenade[] = [];
  private feed: FeedEntry[] = [];

  private px = 0;
  private py = 0;
  private angle = 0;
  private pitch = 0;
  private shakeT = 0;
  private shakeMag = 0;

  private phase: Phase = 'freeze';
  private phaseTimer = ROUND.freezeTime;
  private roundTimer = ROUND.roundTime;
  private liveT = 0;
  private postTimer = 0;
  private round = 0;
  private ctWins = 0;
  private tWins = 0;
  private ctLossStreak = 0;
  private tLossStreak = 0;
  private roundKillBase = new Map<Fighter, number>();
  private roundWinner: Team | null = null;
  private roundDraw = false;
  private liveMsg = 0;
  private buyHintT = 0;
  private gameOver = false;
  private paused = false;

  private keys = new Set<string>();
  private firing = false;
  private triggerPulse = false;
  private mouseX = 0;
  private mouseY = 0;
  private scoreboardHeld = false;

  private buyOpen = false;
  private buyCat = -1;
  private hoverCat = -1;
  private hoverItem = -1;

  private hitmarker = 0;
  private hitmarkerKill = false;
  private damageFlash = 0;

  private touchMode = false;
  private moveTouch: { id: number; ax: number; ay: number; dx: number; dy: number } | null = null;
  private lookTouch: { id: number; lastX: number; lastY: number } | null = null;
  private fireTouch: { id: number } | null = null;
  private reloadTouch: { id: number } | null = null;

  private lookDrag: { lastX: number; lastY: number; moved: number } | null = null;
  private hudStateCache = '';
  private readonly sfx = new Sfx();
  private boundBlur: (() => void) | null = null;
  private boundContextMenu: ((e: Event) => void) | null = null;
  private boundPointerLockChange: (() => void) | null = null;

  private readonly renderCanvas = document.createElement('canvas');
  private readonly renderCtx = this.renderCanvas.getContext('2d');
  private zBuffer = new Float32Array(640);
  private rw = 640;
  private rh = 360;
  private scene3d: CounterStrikeScene3D | null = null;
  private scene3dDisabled = false;

  constructor(host?: GameHost) {
    super(host ?? createDefaultGameHost('gameCanvas', W, H));
    this.touchMode =
      typeof window !== 'undefined' &&
      ('ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0);
  }

  override getShellSnapshot(): GameShellSnapshot {
    return { score: this.playerScore() };
  }

  // ── Setup ──────────────────────────────────────────────────────────────────

  private makeWeapon(id: WeaponId): SlotWeapon {
    const def = WEAPONS[id];
    return { def, mag: def.mag, reserve: def.reserve, silenced: false, burst: false };
  }

  private makeFighter(team: Team, name: string, isBot: boolean, skill: number): Fighter {
    return {
      team,
      name,
      isBot,
      x: 0,
      y: 0,
      angle: team === 'CT' ? 0 : Math.PI,
      hp: MAX_HP,
      armor: 0,
      helmet: false,
      money: ECONOMY.startMoney,
      alive: true,
      keepLoadout: false,
      primary: null,
      pistols: [],
      knife: this.makeWeapon('knife'),
      nades: { he: 0, flash: 0, smoke: 0 },
      nadeSel: 'he',
      slot: 'secondary',
      pistolIndex: 0,
      lastSlot: 'primary',
      fireCd: 0,
      reloadT: 0,
      reloading: false,
      recoil: 0,
      muzzle: 0,
      moving: false,
      walkPhase: 0,
      flashT: 0,
      walk: false,
      crouch: false,
      kills: 0,
      deaths: 0,
      hitFlash: 0,
      deadT: 0,
      altSwing: false,
      skill,
      path: null,
      pathI: 0,
      repathT: 0,
      lastSeenX: 0,
      lastSeenY: 0,
      lastSeenT: 99,
      aimErr: 0.2,
      hasTarget: false,
      strafeDir: 1,
      strafeT: 0,
      burstLeft: 0,
      burstPause: 0,
      roamX: 0,
      roamY: 0,
      roamT: 0,
      variant: Math.random() < 0.5 ? 0 : 1,
    };
  }

  private defaultLoadout(f: Fighter) {
    f.primary = null;
    f.pistols = [this.makeWeapon(f.team === 'CT' ? 'usp' : 'glock')];
    f.knife = this.makeWeapon('knife');
    f.nades = { he: 0, flash: 0, smoke: 0 };
    f.nadeSel = 'he';
    f.slot = 'secondary';
    f.pistolIndex = 0;
    f.lastSlot = 'primary';
    f.armor = 0;
    f.helmet = false;
  }

  init() {
    this.fighters = [
      this.makeFighter('CT', 'YOU', false, 0.8),
      ...CT_BOT_NAMES.map((name, i) => this.makeFighter('CT', name, true, 0.55 + i * 0.08)),
      ...T_BOT_NAMES.map((name, i) => this.makeFighter('T', name, true, 0.55 + i * 0.08)),
    ];
    this.ground = [];
    this.tracers = [];
    this.particles = [];
    this.smokes = [];
    this.grenades = [];
    this.feed = [];
    this.round = 0;
    this.ctWins = 0;
    this.tWins = 0;
    this.ctLossStreak = 0;
    this.tLossStreak = 0;
    this.gameOver = false;
    this.paused = false;
    this.keys.clear();
    this.firing = false;
    this.triggerPulse = false;
    this.buyOpen = false;
    this.buyCat = -1;
    this.scoreboardHeld = false;
    this.hitmarker = 0;
    this.hitmarkerKill = false;
    this.damageFlash = 0;
    this.clearTouch();
    this.bindLifecycle();
    this.resetScoreReport();
    this.hudStateCache = '';
    this.startRound(1);
    this.syncDebugState();
  }

  private bindLifecycle() {
    if (!this.boundBlur) {
      this.boundBlur = () => this.clearTransientInput();
      window.addEventListener('blur', this.boundBlur);
      this.registerCleanup(() => {
        if (this.boundBlur) window.removeEventListener('blur', this.boundBlur);
        this.boundBlur = null;
      });
    }
    if (!this.boundContextMenu) {
      this.boundContextMenu = (e: Event) => e.preventDefault();
      this.canvas.addEventListener('contextmenu', this.boundContextMenu);
      this.registerCleanup(() => {
        if (this.boundContextMenu) this.canvas.removeEventListener('contextmenu', this.boundContextMenu);
        this.boundContextMenu = null;
      });
    }
    if (!this.boundPointerLockChange) {
      this.boundPointerLockChange = () => {
        if (document.pointerLockElement !== this.canvas) {
          this.firing = false;
          this.triggerPulse = false;
          this.lookDrag = null;
        }
      };
      document.addEventListener('pointerlockchange', this.boundPointerLockChange);
      this.registerCleanup(() => {
        if (this.boundPointerLockChange) {
          document.removeEventListener('pointerlockchange', this.boundPointerLockChange);
        }
        this.boundPointerLockChange = null;
      });
    }
  }

  private clearTransientInput() {
    this.keys.clear();
    this.firing = false;
    this.triggerPulse = false;
    this.scoreboardHeld = false;
    this.lookDrag = null;
    this.clearTouch();
  }

  private clearTouch() {
    this.moveTouch = null;
    this.lookTouch = null;
    this.fireTouch = null;
    this.reloadTouch = null;
  }

  destroy() {
    this.stop();
    this.sfx.close();
    this.scene3d?.dispose();
    this.scene3d = null;
  }

  override stop() {
    super.stop();
    try {
      if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    } catch {
      // best-effort
    }
  }

  private player(): Fighter {
    return this.fighters[0];
  }

  private playerScore(): number {
    const p = this.player();
    return p.kills * 150 + this.ctWins * 500;
  }

  private eye(): number {
    return this.player().crouch ? EYE_CROUCH : EYE;
  }

  private syncDebugState() {
    const alive = this.fighters.filter((f) => f.alive).length;
    const p = this.player();
    const t0 = this.fighters[4];
    const allPts = this.fighters
      .map((f) => `${f.x.toFixed(0)},${f.y.toFixed(0)}${f.alive ? '' : ',x'}`)
      .join(';');
    const key = `${this.round},${this.phase},${p.kills},${alive},${this.gameOver ? 1 : 0}|CTW${this.ctWins},TW${this.tWins}|${this.px.toFixed(0)},${this.py.toFixed(0)},$${p.money},a${((this.angle * 180) / Math.PI).toFixed(0)},p${((this.pitch * 180) / Math.PI).toFixed(0)}|${t0.x.toFixed(0)},${t0.y.toFixed(0)}|${allPts}`;
    if (key !== this.hudStateCache) {
      this.hudStateCache = key;
      this.canvas.dataset.counterstrikeState = key;
    }
  }

  // ── Rounds ─────────────────────────────────────────────────────────────────

  private startRound(number: number) {
    this.round = number;
    this.phase = 'freeze';
    this.phaseTimer = ROUND.freezeTime;
    this.roundTimer = ROUND.roundTime;
    this.liveT = 0;
    this.postTimer = 0;
    this.roundWinner = null;
    this.roundDraw = false;
    this.liveMsg = 0;
    this.buyHintT = 0;
    this.buyOpen = false;
    this.buyCat = -1;
    this.grenades = [];
    this.tracers = [];
    this.particles = [];
    this.smokes = [];

    // Ground guns at the real map's armoury rows: one per spawn column,
    // two rows per team (the knives/USPs/rifles row and the SMG row).
    this.ground = [
      ...CT_SPAWNS.map((sp) => ({ ...this.groundWeapon(sp.x, sp.y, sp.weapon), fixed: true })),
      ...T_SPAWNS.map((sp) => ({ ...this.groundWeapon(sp.x, sp.y, sp.weapon), fixed: true })),
    ];

    this.roundKillBase = new Map(this.fighters.map((f) => [f, f.kills] as const));
    const ctSpawns = shuffle(CT_SPAWNS).slice(0, 4);
    const tSpawns = shuffle(T_SPAWNS).slice(0, 4);
    for (let i = 0; i < 4; i++) {
      this.respawnFighter(this.fighters[i], ctSpawns[i]);
    }
    for (let i = 0; i < 4; i++) {
      this.respawnFighter(this.fighters[4 + i], tSpawns[i]);
    }
    this.syncDebugState();
  }

  private groundWeapon(x: number, y: number, weaponId: WeaponId): GroundItem {
    const def = WEAPONS[weaponId];
    return { x, y, kind: 'weapon', weaponId, mag: def.mag, reserve: def.reserve, fixed: false };
  }

  private respawnFighter(f: Fighter, spawn: { x: number; y: number; weapon: WeaponId }) {
    f.x = spawn.x;
    f.y = spawn.y;
    f.angle = f.team === 'CT' ? 0 : Math.PI;
    f.hp = MAX_HP;
    f.alive = true;
    f.deadT = 0;
    f.hitFlash = 0;
    f.flashT = 0;
    f.fireCd = 0;
    f.reloadT = 0;
    f.reloading = false;
    f.recoil = 0;
    f.muzzle = 0;
    f.moving = false;
    f.walk = false;
    f.crouch = false;
    f.path = null;
    f.pathI = 0;
    f.hasTarget = false;
    f.burstLeft = 0;
    f.aimErr = 0.2;
    f.roamT = 0;
    f.lastSeenT = 99;
    f.strafeT = 0;
    if (!f.keepLoadout) this.defaultLoadout(f);

    const def = WEAPONS[spawn.weapon];
    if (def.slot === 'primary') {
      if (!f.primary) {
        f.primary = this.makeWeapon(spawn.weapon);
        f.slot = 'primary';
      }
    } else {
      f.pistols.push(this.makeWeapon(spawn.weapon));
      f.pistolIndex = f.pistols.length - 1;
      f.slot = 'secondary';
    }
    this.removeGroundItemAt(spawn.x, spawn.y, spawn.weapon);
    if (f === this.player()) {
      this.px = spawn.x;
      this.py = spawn.y;
      this.angle = 0;
    }
  }

  private removeGroundItemAt(x: number, y: number, weaponId: WeaponId) {
    const index = this.ground.findIndex(
      (item) => item.kind === 'weapon' && item.weaponId === weaponId && Math.hypot(item.x - x, item.y - y) < TILE * 3,
    );
    if (index >= 0) this.ground.splice(index, 1);
  }

  private beginLive() {
    this.phase = 'live';
    this.roundTimer = ROUND.roundTime;
    this.liveT = 0;
    this.liveMsg = 1.2;
    this.buyOpen = false;
    this.buyCat = -1;
    this.firing = false;
    this.triggerPulse = false;
    this.sfx.roundStart();
  }

  private finishRound(winner: Team | null) {
    if (this.phase === 'post' || this.phase === 'matchOver') return;
    this.roundWinner = winner;
    this.roundDraw = winner === null;
    this.phase = 'post';
    this.postTimer = ROUND.postTime;
    this.keys.clear();
    this.firing = false;
    this.triggerPulse = false;
    this.buyOpen = false;

    for (const f of this.fighters) f.keepLoadout = f.alive;

    if (!winner) {
      this.sfx.roundDraw();
      this.syncDebugState();
      return;
    }

    const ctWon = winner === 'CT';
    if (ctWon) {
      this.ctWins++;
      this.ctLossStreak = 0;
      this.tLossStreak++;
    } else {
      this.tWins++;
      this.tLossStreak = 0;
      this.ctLossStreak++;
    }
    for (const f of this.fighters) {
      const won = f.team === winner;
      f.money = clampMoney(f.money + (won ? ECONOMY.winMoney : lossMoney(ctWon ? this.tLossStreak : this.ctLossStreak)));
    }

    if (ctWon) this.sfx.roundWon();
    else this.sfx.roundLost();

    const champion = matchWinner({ ctWins: this.ctWins, tWins: this.tWins });
    if (champion) {
      this.phase = 'matchOver';
      this.gameOver = true;
      const won = champion === 'CT';
      this.sfx.matchEnd(won);
      this.submitScoreOnce(matchScore(this.player().kills, this.ctWins, won));
    }
    this.syncDebugState();
  }

  private aliveCount(team: Team): number {
    return this.fighters.filter((f) => f.team === team && f.alive).length;
  }

  // ── Buying (buytime, center buyzone only) ─────────────────────────────────

  private canBuy(): boolean {
    const p = this.player();
    const buyWindow =
      this.phase === 'freeze' ||
      (this.phase === 'live' && this.liveT <= ROUND.buyTime);
    return (
      buyWindow &&
      !this.gameOver &&
      !this.paused &&
      p.alive &&
      inBuyZone(this.px, this.py)
    );
  }

  private toggleBuy() {
    if (this.buyOpen) {
      this.buyOpen = false;
      this.buyCat = -1;
      return;
    }
    if (!this.canBuy()) {
      this.sfx.denied();
      this.buyHintT = 1.6;
      return;
    }
    this.buyOpen = true;
    this.buyCat = -1;
    this.hoverCat = 0;
    this.hoverItem = -1;
  }

  private buyItemAt(catIndex: number, itemIndex: number) {
    const p = this.player();
    const category = BUY_CATEGORIES[catIndex];
    if (!category) return;
    const items = buyItemsForTeam(category, p.team);
    const item = items[itemIndex];
    if (!item) return;
    this.purchaseItem(p, item);
  }

  private purchaseItem(f: Fighter, item: BuyMenuItem) {
    if (f.money < item.price) {
      this.sfx.denied();
      return;
    }
    if (item.kind === 'weapon' && item.weaponId) {
      const def = WEAPONS[item.weaponId];
      if (def.team !== 'both' && def.team !== f.team) {
        this.sfx.denied();
        return;
      }
      if (def.slot === 'primary') {
        if (f.primary) {
          this.sfx.denied();
          return;
        }
        f.money -= item.price;
        f.primary = this.makeWeapon(def.id);
        f.slot = 'primary';
      } else {
        f.money -= item.price;
        f.pistols.push(this.makeWeapon(def.id));
        f.pistolIndex = f.pistols.length - 1;
        f.slot = 'secondary';
      }
      this.sfx.buy();
      return;
    }
    if (item.kind === 'ammo') {
      if (item.ammo === 'primary') {
        if (!f.primary) {
          this.sfx.denied();
          return;
        }
        f.money -= item.price;
        f.primary.reserve = f.primary.def.reserve;
      } else {
        if (f.pistols.length === 0) {
          this.sfx.denied();
          return;
        }
        f.money -= item.price;
        for (const pistol of f.pistols) pistol.reserve = pistol.def.reserve;
      }
      this.sfx.buy();
      return;
    }
    if (item.kind === 'equip' && item.equip) {
      switch (item.equip) {
        case 'kevlar':
          if (f.armor >= MAX_ARMOR) return this.sfx.denied();
          f.money -= item.price;
          f.armor = MAX_ARMOR;
          break;
        case 'vesthelm':
          if (f.armor >= MAX_ARMOR && f.helmet) return this.sfx.denied();
          f.money -= item.price;
          f.armor = MAX_ARMOR;
          f.helmet = true;
          break;
        case 'flash':
          if (f.nades.flash >= 2) return this.sfx.denied();
          f.money -= item.price;
          f.nades.flash++;
          break;
        case 'he':
          if (f.nades.he >= 1) return this.sfx.denied();
          f.money -= item.price;
          f.nades.he++;
          break;
        case 'smoke':
          if (f.nades.smoke >= 1) return this.sfx.denied();
          f.money -= item.price;
          f.nades.smoke++;
          break;
        default:
          f.money -= item.price; // defuser / nightvision: authentic, purely cosmetic here
          break;
      }
      this.sfx.buy();
    }
  }

  // ── Input ──────────────────────────────────────────────────────────────────

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    this.sfx.prime();
    if (e instanceof KeyboardEvent) {
      if (e.type === 'keydown' && !e.repeat) {
        const key = e.key.toLowerCase();
        if (this.gameOver) {
          if (this.isRestartInput(e)) this.init();
          return;
        }
        if (key === 'p') {
          this.paused = !this.paused;
          if (this.paused) {
            this.clearTransientInput();
            try {
              if (document.pointerLockElement === this.canvas) document.exitPointerLock();
            } catch {
              // best-effort
            }
          }
          return;
        }
        if (key === 'm') {
          this.sfx.enabled = !this.sfx.enabled;
          return;
        }
        if (this.paused) return;

        if (this.buyOpen) {
          if (key === 'b' || key === 'escape') {
            this.buyOpen = false;
            this.buyCat = -1;
            return;
          }
          if (key === '0') {
            this.buyCat = -1;
            return;
          }
          const digit = Number(key);
          if (digit >= 1 && digit <= 8) {
            if (this.buyCat === -1) {
              this.buyCat = digit - 1;
              this.hoverCat = digit - 1;
              this.hoverItem = 0;
            } else {
              this.buyItemAt(this.buyCat, digit - 1);
              this.buyCat = -1;
            }
            return;
          }
          return;
        }

        if (key === 'b') {
          this.toggleBuy();
          return;
        }
        if (key === 'tab') {
          e.preventDefault();
          this.scoreboardHeld = true;
          return;
        }
        if (key === 'escape') {
          if (document.pointerLockElement !== this.canvas) {
            this.paused = true;
            this.clearTransientInput();
          }
          return;
        }
        if (this.phase === 'live' && this.player().alive) {
          if (key === 'r') this.startReload(this.player());
          else if (key === '1') this.switchSlot(this.player(), 'primary');
          else if (key === '2') this.cyclePistol(this.player());
          else if (key === '3') this.switchSlot(this.player(), 'knife');
          else if (key === '4') this.cycleNade(this.player());
          else if (key === 'q') this.switchSlot(this.player(), this.player().lastSlot);
          else if (key === 'g') this.dropWeapon(this.player());
          else if (key === 'e') this.swapGroundWeapon(this.player());
          else if (key === ' ') {
            e.preventDefault();
            if (this.player().slot === 'nade') this.throwNade(this.player());
          }
        }
      }
      if (e.type === 'keydown') {
        if (e.key === 'Tab') e.preventDefault();
        if (
          [' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) &&
          !this.gameOver
        ) {
          e.preventDefault();
        }
        this.keys.add(e.key.toLowerCase());
      } else if (e.type === 'keyup') {
        const key = e.key.toLowerCase();
        this.keys.delete(key);
        if (key === 'tab') this.scoreboardHeld = false;
      }
      return;
    }

    if (e instanceof MouseEvent) {
      if (this.gameOver) {
        if (this.isRestartInput(e)) this.init();
        return;
      }
      if (this.paused) return;

      if (e.type === 'mousemove') {
        const point = this.canvasPoint(e.clientX, e.clientY);
        this.mouseX = point.x;
        this.mouseY = point.y;
        if (this.buyOpen) this.updateBuyHover(point.x, point.y);
        if (document.pointerLockElement === this.canvas) {
          this.angle += e.movementX * MOUSE_SENS;
          this.pitch = clamp(this.pitch - e.movementY * MOUSE_SENS * 0.75, -PITCH_MAX, PITCH_MAX);
        } else if (this.lookDrag) {
          const dx = e.clientX - this.lookDrag.lastX;
          const dy = e.clientY - this.lookDrag.lastY;
          this.angle += dx * MOUSE_SENS * 1.6;
          this.pitch = clamp(this.pitch - dy * MOUSE_SENS * 1.2, -PITCH_MAX, PITCH_MAX);
          this.lookDrag.moved += Math.abs(dx) + Math.abs(dy);
          this.lookDrag.lastX = e.clientX;
          this.lookDrag.lastY = e.clientY;
        }
        return;
      }
      if (e.type === 'mousedown') {
        const point = this.canvasPoint(e.clientX, e.clientY);
        if (e.button === 2) {
          const p = this.player();
          if (p.alive && this.phase === 'live') this.altFire(p);
          return;
        }
        if (e.button !== 0) return;
        if (this.buyOpen) {
          this.clickBuyMenu(point.x, point.y);
          return;
        }
        const locked = document.pointerLockElement === this.canvas;
        this.lookDrag = { lastX: e.clientX, lastY: e.clientY, moved: 0 };
        if (!locked) {
          try {
            const lockRequest = this.canvas.requestPointerLock();
            void lockRequest.catch(() => {});
          } catch {
            // pointer lock unavailable — drag-to-look fallback still works
          }
        }
        const p = this.player();
        if (locked && p.alive && this.phase === 'live') {
          this.firing = true;
          this.triggerPulse = true;
        }
        return;
      }
      if (e.type === 'mouseup' && e.button === 0) {
        const drag = this.lookDrag;
        this.lookDrag = null;
        if (
          document.pointerLockElement !== this.canvas &&
          drag &&
          drag.moved < 6 &&
          this.phase === 'live' &&
          this.player().alive
        ) {
          this.triggerPulse = true;
        }
        this.firing = false;
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
          const point = this.canvasPoint(t.clientX, t.clientY);
          if (this.buyOpen) {
            this.clickBuyMenu(point.x, point.y);
            continue;
          }
          const fireHit = Math.hypot(point.x - (this.width - 104), point.y - (this.height - 100)) <= 58;
          const reloadHit = Math.hypot(point.x - (this.width - 104), point.y - (this.height - 196)) <= 44;
          if (point.x < this.width * 0.45 && !fireHit && !reloadHit) {
            if (!this.moveTouch) {
              this.moveTouch = { id: t.identifier, ax: point.x, ay: point.y, dx: 0, dy: 0 };
            }
          } else if (fireHit) {
            if (this.phase === 'live' && this.player().alive) {
              this.fireTouch = { id: t.identifier };
              this.firing = true;
              this.triggerPulse = true;
            }
          } else if (reloadHit) {
            this.reloadTouch = { id: t.identifier };
            this.startReload(this.player());
          } else if (!this.lookTouch) {
            this.lookTouch = { id: t.identifier, lastX: point.x, lastY: point.y };
          }
        }
      } else if (e.type === 'touchmove' && !this.paused) {
        for (const t of e.changedTouches) {
          const point = this.canvasPoint(t.clientX, t.clientY);
          if (this.moveTouch && t.identifier === this.moveTouch.id) {
            const dx = point.x - this.moveTouch.ax;
            const dy = point.y - this.moveTouch.ay;
            const len = Math.hypot(dx, dy);
            const maxR = 66;
            if (len > maxR) {
              this.moveTouch.dx = (dx / len) * maxR;
              this.moveTouch.dy = (dy / len) * maxR;
            } else {
              this.moveTouch.dx = dx;
              this.moveTouch.dy = dy;
            }
          } else if (this.lookTouch && t.identifier === this.lookTouch.id) {
            this.angle += (point.x - this.lookTouch.lastX) * 0.008;
            this.pitch = clamp(this.pitch - (point.y - this.lookTouch.lastY) * 0.005, -PITCH_MAX, PITCH_MAX);
            this.lookTouch.lastX = point.x;
            this.lookTouch.lastY = point.y;
          }
        }
      } else if (e.type === 'touchend' || e.type === 'touchcancel') {
        for (const t of e.changedTouches) {
          if (this.moveTouch && t.identifier === this.moveTouch.id) this.moveTouch = null;
          if (this.lookTouch && t.identifier === this.lookTouch.id) this.lookTouch = null;
          if (this.fireTouch && t.identifier === this.fireTouch.id) {
            this.fireTouch = null;
            this.firing = false;
          }
          if (this.reloadTouch && t.identifier === this.reloadTouch.id) this.reloadTouch = null;
        }
      }
    }
  }

  private clickBuyMenu(x: number, y: number) {
    const rect = this.buyMenuRect();
    if (x < rect.x || x > rect.x + rect.w || y < rect.y || y > rect.y + rect.h) return;
    const rowY = rect.y + 64;
    const rowH = 25;
    const catRows = 8;
    if (this.buyCat === -1) {
      if (x < rect.x + rect.w / 2) {
        const row = Math.floor((y - rowY) / rowH);
        if (row >= 0 && row < catRows) {
          this.buyCat = row;
          this.hoverCat = row;
          this.hoverItem = 0;
        }
        return;
      }
      return;
    }
    if (x >= rect.x + rect.w / 2) {
      const category = BUY_CATEGORIES[this.buyCat];
      const items = buyItemsForTeam(category, this.player().team);
      const row = Math.floor((y - rowY) / rowH);
      if (row >= 0 && row < items.length) {
        this.buyItemAt(this.buyCat, row);
        this.buyCat = -1;
      }
    } else {
      this.buyCat = -1;
    }
  }

  private updateBuyHover(x: number, y: number) {
    const rect = this.buyMenuRect();
    const rowY = rect.y + 64;
    const rowH = 25;
    if (x < rect.x || x > rect.x + rect.w || y < rowY || y > rect.y + rect.h) {
      this.hoverCat = -1;
      this.hoverItem = -1;
      return;
    }
    const row = Math.floor((y - rowY) / rowH);
    if (this.buyCat === -1) {
      this.hoverCat = x < rect.x + rect.w / 2 && row >= 0 && row < 8 ? row : -1;
      this.hoverItem = -1;
    } else {
      this.hoverCat = this.buyCat;
      this.hoverItem = x >= rect.x + rect.w / 2 && row >= 0 ? row : -1;
    }
  }

  private buyMenuRect() {
    const w = 480;
    const h = 292;
    return { x: (W - w) / 2, y: (H - h) / 2 - 14, w, h };
  }

  // ── Weapons ────────────────────────────────────────────────────────────────

  private activeWeapon(f: Fighter): SlotWeapon | null {
    if (f.slot === 'primary') return f.primary ?? f.knife;
    if (f.slot === 'secondary') return f.pistols[f.pistolIndex] ?? f.knife;
    if (f.slot === 'knife') return f.knife;
    return f.pistols[f.pistolIndex] ?? f.knife;
  }

  private switchSlot(f: Fighter, slot: SlotKind) {
    if (this.gameOver || this.paused || !f.alive) return;
    if (this.phase !== 'live') return;
    if (slot === 'primary' && !f.primary) {
      this.sfx.denied();
      return;
    }
    if (f.slot !== slot) f.lastSlot = f.slot;
    f.slot = slot;
    f.reloading = false;
    f.reloadT = 0;
    this.sfx.switchWeapon();
  }

  private cyclePistol(f: Fighter) {
    if (f.pistols.length <= 1) {
      if (f.pistols.length === 0) {
        this.sfx.denied();
        return;
      }
      return;
    }
    f.pistolIndex = (f.pistolIndex + 1) % f.pistols.length;
    if (f.slot !== 'secondary') {
      f.lastSlot = f.slot;
      f.slot = 'secondary';
    }
    f.reloading = false;
    f.reloadT = 0;
    this.sfx.switchWeapon();
  }

  private cycleNade(f: Fighter) {
    const order: NadeKind[] = ['he', 'flash', 'smoke'];
    if (f.nades.he + f.nades.flash + f.nades.smoke === 0) {
      this.sfx.denied();
      return;
    }
    let next = order[(order.indexOf(f.nadeSel) + 1) % order.length];
    let guard = 0;
    while (f.nades[next] <= 0 && guard < 3) {
      next = order[(order.indexOf(next) + 1) % order.length];
      guard++;
    }
    f.nadeSel = next;
    if (f.slot !== 'nade') f.lastSlot = f.slot;
    f.slot = 'nade';
    f.reloading = false;
    f.reloadT = 0;
    this.sfx.switchWeapon();
  }

  private altFire(f: Fighter) {
    const w = this.activeWeapon(f);
    if (!w) return;
    if (w.def.id === 'knife') {
      f.altSwing = true;
      this.fireShot(f, f.angle);
      f.altSwing = false;
      return;
    }
    if (w.def.id === 'glock') {
      w.burst = !w.burst;
      this.sfx.switchWeapon();
      return;
    }
    if (w.def.id === 'usp' || w.def.id === 'm4a1') {
      w.silenced = !w.silenced;
      this.sfx.switchWeapon();
    }
  }

  private startReload(f: Fighter) {
    const w = this.activeWeapon(f);
    if (!w || w.def.reload <= 0) return;
    if (f.reloading || this.gameOver || this.paused || !f.alive || this.phase !== 'live') return;
    if (w.mag >= w.def.mag || w.reserve <= 0) {
      if (w.mag === 0) this.sfx.empty();
      return;
    }
    f.reloading = true;
    f.reloadT = w.def.reload;
    this.sfx.reload();
  }

  private finishReload(f: Fighter) {
    const w = this.activeWeapon(f);
    if (!w) {
      f.reloading = false;
      return;
    }
    const need = w.def.mag - w.mag;
    const take = Math.min(need, w.reserve);
    w.mag += take;
    w.reserve -= take;
    f.reloading = false;
    if (!f.isBot) this.sfx.reloadEnd();
  }

  private dropWeapon(f: Fighter) {
    if (this.gameOver || this.paused || !f.alive || this.phase !== 'live') return;
    if (f.slot === 'primary') {
      if (!f.primary) return this.sfx.denied();
      const w = f.primary;
      this.ground.push({
        x: f.x, y: f.y, kind: 'weapon', weaponId: w.def.id, mag: w.mag, reserve: w.reserve, fixed: false,
      });
      f.primary = null;
      f.slot = 'secondary';
      f.lastSlot = 'primary';
      if (!f.isBot) this.sfx.dropWeapon();
      return;
    }
    if (f.slot === 'secondary') {
      if (f.pistols.length === 0) return this.sfx.denied();
      const w = f.pistols[f.pistolIndex];
      this.ground.push({
        x: f.x, y: f.y, kind: 'weapon', weaponId: w.def.id, mag: w.mag, reserve: w.reserve, fixed: false,
      });
      f.pistols.splice(f.pistolIndex, 1);
      f.pistolIndex = Math.min(f.pistolIndex, f.pistols.length - 1);
      f.slot = 'knife';
      if (!f.isBot) this.sfx.dropWeapon();
      return;
    }
    this.sfx.denied();
  }

  private swapGroundWeapon(f: Fighter) {
    if (this.gameOver || this.paused || !f.alive || this.phase !== 'live') return;
    const near = this.ground.find(
      (item) => item.kind === 'weapon' && item.weaponId && WEAPONS[item.weaponId].slot === 'primary' &&
        Math.hypot(item.x - f.x, item.y - f.y) < 22,
    );
    if (!near || !near.weaponId) return;
    if (f.primary) {
      this.ground.push({
        x: f.x, y: f.y, kind: 'weapon', weaponId: f.primary.def.id, mag: f.primary.mag, reserve: f.primary.reserve, fixed: false,
      });
    }
    const take = this.makeWeapon(near.weaponId);
    take.mag = near.mag;
    take.reserve = near.reserve;
    f.primary = take;
    this.ground.splice(this.ground.indexOf(near), 1);
    f.slot = 'primary';
    if (!f.isBot) this.sfx.pickup();
  }

  private throwNade(f: Fighter) {
    if (this.gameOver || this.paused || !f.alive || this.phase !== 'live') return;
    const kind = f.nadeSel;
    if (f.nades[kind] <= 0) {
      this.sfx.denied();
      return;
    }
    f.nades[kind]--;
    const dir = f === this.player() ? this.angle : f.angle;
    const speed = 640;
    this.grenades.push({
      x: f.x + Math.cos(dir) * 14,
      y: f.y + Math.sin(dir) * 14,
      vx: Math.cos(dir) * speed,
      vy: Math.sin(dir) * speed,
      type: kind,
      fuse: kind === 'he' ? 1.5 : kind === 'flash' ? 1.4 : 1.8,
      age: 0,
      owner: f,
    });
    if (f.nades.he + f.nades.flash + f.nades.smoke <= 0) f.slot = 'knife';
    this.sfx.throwPin();
  }

  private fireShot(shooter: Fighter, angle: number) {
    const w = this.activeWeapon(shooter);
    if (!w) return;
    if (w.def.slot === 'knife') {
      this.melee(shooter, shooter.altSwing);
      return;
    }
    if (shooter.slot === 'nade') return;
    if (w.mag <= 0) {
      if (!shooter.isBot) {
        this.sfx.empty();
        this.startReload(shooter);
      }
      return;
    }
    w.mag--;
    shooter.fireCd = w.def.interval;
    shooter.recoil = Math.min(0.26, shooter.recoil + w.def.kick);
    shooter.muzzle = 0.055;
    if (shooter === this.player()) {
      // Subtle fire shake — CS kicks the view, it doesn't rattle the screen.
      this.shakeT = 0.09;
      this.shakeMag = 1.4 + shooter.recoil * 6;
    }

    const moveMul = shooter.moving ? (shooter.walk ? 1.35 : 1.9) : 1;
    const crouchMul = shooter.crouch ? 0.55 : 1;
    const spread = w.def.spread * moveMul * crouchMul + shooter.recoil * 0.55;

    const pellets = w.def.pellets;
    for (let p = 0; p < pellets; p++) {
      const a = angle + (Math.random() - 0.5) * 2 * spread;
      const dirX = Math.cos(a);
      const dirY = Math.sin(a);
      // Bullets fly until they hit a wall (CS has no range cap); the weapon's
      // `range` value only drives damage falloff (see computeDamage).
      const wallHit = castRay(shooter.x, shooter.y, dirX, dirY, MAX_SHOT_DIST);

      let best: Fighter | null = null;
      let bestT = wallHit.dist;
      for (const target of this.fighters) {
        if (!target.alive || target.team === shooter.team) continue;
        const dx = target.x - shooter.x;
        const dy = target.y - shooter.y;
        const t = dx * dirX + dy * dirY;
        if (t <= 0 || t >= bestT) continue;
        const perp = Math.abs(dx * dirY - dy * dirX);
        if (perp > PLAYER_RADIUS) continue;
        best = target;
        bestT = t;
      }

      if (best) {
        this.tracers.push({
          x1: shooter.x + dirX * 14, y1: shooter.y + dirY * 14, z1: EYE - 8,
          x2: best.x, y2: best.y, z2: EYE - 8,
          life: 0.07, maxLife: 0.07, color: '#ffe9a8',
        });
        const zone = rollHitZone(shooter.moving, shooter.crouch);
        this.damageFighter(best, shooter, w.def, zone, bestT);
      } else {
        this.tracers.push({
          x1: shooter.x + dirX * 14, y1: shooter.y + dirY * 14, z1: EYE - 8,
          x2: shooter.x + dirX * (wallHit.dist - 2), y2: shooter.y + dirY * (wallHit.dist - 2), z2: EYE - 8,
          life: 0.07, maxLife: 0.07, color: '#ffe9a8',
        });
        this.spawnImpact(shooter.x + dirX * (wallHit.dist - 2), shooter.y + dirY * (wallHit.dist - 2));
      }
    }
    this.sfx.shoot(w.def.sound, w.silenced);
  }

  private melee(shooter: Fighter, stab: boolean) {
    shooter.fireCd = stab ? 0.9 : 0.45;
    const range = WEAPONS.knife.range;
    const arc = 0.75;
    let hitTarget: Fighter | null = null;
    for (const target of this.fighters) {
      if (!target.alive || target.team === shooter.team) continue;
      const dist = Math.hypot(target.x - shooter.x, target.y - shooter.y);
      if (dist > range + PLAYER_RADIUS) continue;
      let delta = Math.atan2(target.y - shooter.y, target.x - shooter.x) - shooter.angle;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      if (Math.abs(delta) > arc) continue;
      hitTarget = target;
      break;
    }
    this.sfx.knife();
    if (!hitTarget) return;
    const zone = rollHitZone(shooter.moving, shooter.crouch);
    const base = WEAPONS.knife.dmg[zone];
    const stabDmg: Record<HitZone, number> = { head: 220, chest: 55, stomach: 65, legs: 39 };
    const dmg = stab ? stabDmg[zone] : base;
    const target = hitTarget;
    const falloff = 1;
    const armorApplies = zone !== 'legs' && target.armor > 0 && (zone !== 'head' || target.helmet);
    if (armorApplies) {
      const through = (stab ? 180 : WEAPONS.knife.armorDmg[zone === 'head' ? 'head' : zone === 'chest' ? 'chest' : 'stomach']) * falloff;
      const result = { dmg: Math.max(1, Math.round(through)), armorDmg: Math.max(0, Math.round(dmg - through)) };
      this.applyHit(target, shooter, 'knife', zone, result);
    } else {
      this.applyHit(target, shooter, 'knife', zone, { dmg: Math.round(dmg), armorDmg: 0 });
    }
  }

  private damageFighter(victim: Fighter, shooter: Fighter, def: WeaponDef, zone: HitZone, dist: number) {
    const result = computeDamage(def, zone, { armor: victim.armor, helmet: victim.helmet }, dist);
    this.applyHit(victim, shooter, def.id, zone, result);
  }

  private applyHit(
    victim: Fighter,
    shooter: Fighter,
    weaponId: WeaponId,
    zone: HitZone,
    result: { dmg: number; armorDmg: number },
    killLabel?: string,
    killReward?: number,
  ) {
    if (!victim.alive) return;
    const applied = applyDamage(victim.hp, victim.armor, result);
    victim.armor = applied.armor;
    victim.hp = applied.hp;
    victim.hitFlash = 0.1;
    this.spawnBlood(victim.x, victim.y);
    if (shooter === this.player()) {
      this.hitmarker = 0.14;
      this.hitmarkerKill = false;
      if (zone === 'head') this.sfx.headshot();
      else this.sfx.hit();
    }
    if (victim === this.player()) {
      this.damageFlash = 0.35;
      this.sfx.hurt();
    }
    if (applied.dead) this.killFighter(victim, shooter, weaponId, zone, killLabel, killReward);
  }

  private killFighter(
    victim: Fighter,
    killer: Fighter,
    weaponId: WeaponId,
    zone: HitZone,
    killLabel?: string,
    killReward?: number,
  ) {
    victim.alive = false;
    victim.deadT = 0;
    victim.deaths++;
    killer.kills++;
    killer.money = clampMoney(killer.money + (killReward ?? WEAPONS[weaponId].killReward));
    if (killer === this.player()) this.hitmarkerKill = true;
    if (victim === this.player()) {
      this.firing = false;
      this.triggerPulse = false;
    }
    const w = this.activeWeapon(victim);
    if (w && w.def.slot !== 'knife') {
      this.ground.push({
        x: victim.x, y: victim.y, kind: 'weapon', weaponId: w.def.id, mag: w.mag, reserve: w.reserve, fixed: false,
      });
    }
    const teamColor = victim.team === 'CT' ? '#7fb2ff' : '#ff9a8a';
    const label = killLabel ?? WEAPON_SHORT[weaponId];
    this.pushFeed(
      `${killer.name}  [${label}]  ${victim.name}${zone === 'head' ? '  *HEADSHOT*' : ''}`,
      teamColor,
      teamColor,
    );
    this.sfx.kill();
  }

  private pushFeed(text: string, color: string, _accent: string) {
    this.feed.unshift({ text, color, life: 5 });
    if (this.feed.length > 6) this.feed.length = 6;
  }

  private spawnBlood(x: number, y: number) {
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 24 + Math.random() * 60;
      this.particles.push({
        x, y, z: 4 + Math.random() * 10,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        vz: 30 + Math.random() * 60,
        life: 0.4,
        maxLife: 0.4,
        size: 2 + Math.random() * 2,
        color: '#b3212e',
      });
    }
  }

  private spawnImpact(x: number, y: number) {
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 10 + Math.random() * 40;
      this.particles.push({
        x, y, z: 6 + Math.random() * 6,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        vz: 20 + Math.random() * 30,
        life: 0.25,
        maxLife: 0.25,
        size: 1.5 + Math.random() * 2,
        color: '#e8f2fa',
      });
    }
  }

  // ── Movement ───────────────────────────────────────────────────────────────

  private moveFighter(f: Fighter, vx: number, vy: number, dt: number, speed: number) {
    if (!f.alive) {
      f.moving = false;
      return;
    }
    const len = Math.hypot(vx, vy);
    if (len < 0.01) {
      f.moving = false;
      return;
    }
    const mult = (f.walk ? WALK_MULT : 1) * (f.crouch ? CROUCH_MULT : 1);
    const nx = vx / len;
    const ny = vy / len;
    const dx = nx * speed * mult * dt;
    const dy = ny * speed * mult * dt;
    if (!solidCircle(f.x + dx, f.y, PLAYER_RADIUS)) f.x += dx;
    if (!solidCircle(f.x, f.y + dy, PLAYER_RADIUS)) f.y += dy;
    f.moving = true;
    f.walkPhase += speed * mult * dt * 0.05;
    if (f === this.player() && !f.crouch) this.sfx.footstep(false);
  }

  private separateFighters() {
    for (const a of this.fighters) {
      if (!a.alive) continue;
      for (const b of this.fighters) {
        if (a === b || !b.alive) continue;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d = Math.hypot(dx, dy);
        if (d > 0.001 && d < PLAYER_RADIUS * 2) {
          const push = ((PLAYER_RADIUS * 2 - d) / (PLAYER_RADIUS * 2)) * 0.4;
          const px = (dx / d) * push;
          const py = (dy / d) * push;
          if (!solidCircle(a.x + px, a.y, PLAYER_RADIUS)) a.x += px;
          if (!solidCircle(a.x, a.y + py, PLAYER_RADIUS)) a.y += py;
        }
      }
    }
  }

  // ── Visibility ─────────────────────────────────────────────────────────────

  private smokeBlocks(x1: number, y1: number, x2: number, y2: number): boolean {
    for (const s of this.smokes) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((s.x - x1) * dx + (s.y - y1) * dy) / len2));
      const cx = x1 + dx * t;
      const cy = y1 + dy * t;
      if (Math.hypot(s.x - cx, s.y - cy) < s.r) return true;
    }
    return false;
  }

  private visibleTo(viewer: Fighter, target: Fighter): boolean {
    if (!target.alive) return false;
    const dist = Math.hypot(target.x - viewer.x, target.y - viewer.y);
    if (dist > BOT_VISION) return false;
    if (!hasLineOfSight(viewer.x, viewer.y, target.x, target.y)) return false;
    if (this.smokeBlocks(viewer.x, viewer.y, target.x, target.y)) return false;
    return true;
  }

  private seenByTeam(target: Fighter, team: Team): boolean {
    for (const f of this.fighters) {
      if (f.team !== team || !f.alive) continue;
      if (this.visibleTo(f, target)) return true;
    }
    return false;
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  update(dt: number) {
    if (this.paused || this.gameOver) return;

    this.updateFx(dt);
    this.updateGrenades(dt);

    if (this.phase === 'freeze') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) this.beginLive();
      this.syncDebugState();
      return;
    }

    if (this.phase === 'post') {
      this.postTimer -= dt;
      if (this.postTimer <= 0) this.startRound(this.round + 1);
      this.syncDebugState();
      return;
    }

    if (this.phase === 'live') {
      this.roundTimer -= dt;
      this.liveT += dt;
      this.liveMsg = Math.max(0, this.liveMsg - dt);
      this.buyHintT = Math.max(0, this.buyHintT - dt);
      if (this.roundTimer <= 0) {
        // Time runs out: more survivors wins; equal survivors fall back
        // to the side with more round kills.
        const ctAlive = this.aliveCount('CT');
        const tAlive = this.aliveCount('T');
        let winner: Team | null = ctAlive > tAlive ? 'CT' : tAlive > ctAlive ? 'T' : null;
        if (!winner) {
          let ctKills = 0;
          let tKills = 0;
          for (const f of this.fighters) {
            const diff = f.kills - (this.roundKillBase.get(f) ?? f.kills);
            if (f.team === 'CT') ctKills += diff;
            else tKills += diff;
          }
          winner = ctKills > tKills ? 'CT' : tKills > ctKills ? 'T' : null;
        }
        if (!winner) {
          // Last-resort tiebreaks so a round always resolves: surviving HP,
          // then alternation by round number.
          let ctHp = 0;
          let tHp = 0;
          for (const f of this.fighters) {
            if (!f.alive) continue;
            if (f.team === 'CT') ctHp += f.hp;
            else tHp += f.hp;
          }
          if (ctHp !== tHp) {
            winner = ctHp > tHp ? 'CT' : 'T';
          } else {
            winner = this.round % 2 === 1 ? 'CT' : 'T';
          }
        }
        this.finishRound(winner);
        return;
      }

      this.updatePlayer(dt);
      for (let i = 1; i < this.fighters.length; i++) this.updateBot(this.fighters[i], dt);
      this.separateFighters();
      this.pickupScan();

      if (this.aliveCount('T') === 0) {
        this.finishRound('CT');
        return;
      }
      if (this.aliveCount('CT') === 0) {
        this.finishRound('T');
        return;
      }
      this.syncDebugState();
    }
  }

  private updatePlayer(dt: number) {
    const p = this.player();
    p.fireCd = Math.max(0, p.fireCd - dt);
    p.recoil = Math.max(0, p.recoil - dt * 0.5);
    p.muzzle = Math.max(0, p.muzzle - dt);
    p.flashT = Math.max(0, p.flashT - dt);
    this.damageFlash = Math.max(0, this.damageFlash - dt * 0.9);
    this.hitmarker = Math.max(0, this.hitmarker - dt);
    this.shakeT = Math.max(0, this.shakeT - dt);

    if (!p.alive) return;

    if (p.reloading) {
      p.reloadT -= dt;
      if (p.reloadT <= 0) this.finishReload(p);
    }

    // First-person movement: forward/strafe relative to the view angle.
    let fx = 0;
    let fy = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) fy += 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) fy -= 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) fx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) fx += 1;
    if (this.moveTouch) {
      fx = this.moveTouch.dx / 66;
      fy = -this.moveTouch.dy / 66;
    }
    p.walk = this.keys.has('shift');
    p.crouch = this.keys.has('control') || this.keys.has('ctrl');
    const w = this.activeWeapon(p);
    const speed = (w ? w.def.speedUnits : 250) * SPEED_SCALE;
    const len = Math.hypot(fx, fy);
    if (len > 0.01) {
      const cos = Math.cos(this.angle);
      const sin = Math.sin(this.angle);
      const worldX = cos * (fy / len) + -sin * (fx / len);
      const worldY = sin * (fy / len) + cos * (fx / len);
      this.moveFighter(p, worldX, worldY, dt, speed);
      this.px = p.x;
      this.py = p.y;
    } else {
      p.moving = false;
    }

    // Keep the fighter's facing in lockstep with the view angle: melee arcs,
    // radar cones, and any angle consumer expect it (p.angle was previously
    // only set at spawn, so knife swings fired along the spawn direction).
    p.angle = this.angle;

    // Firing.
    if (p.flashT <= 0 && !p.reloading && p.fireCd <= 0) {
      if (p.slot === 'nade') {
        if (this.triggerPulse) {
          this.triggerPulse = false;
          this.throwNade(p);
        }
      } else {
        const weapon = this.activeWeapon(p);
        if (weapon) {
          // The player's shots must follow the view angle, not the fighter's
          // spawn-facing angle — p.angle is only set at spawn (line 588) and
          // never tracks the mouse. (throwNade already uses this.angle.)
          if (weapon.def.auto) {
            if (this.firing || this.triggerPulse) this.fireShot(p, this.angle);
          } else if (this.triggerPulse) {
            this.triggerPulse = false;
            this.fireShot(p, this.angle);
          }
        }
      }
    }
    this.triggerPulse = false;
  }

  private updateBot(bot: Fighter, dt: number) {
    bot.fireCd = Math.max(0, bot.fireCd - dt);
    bot.recoil = Math.max(0, bot.recoil - dt * 0.5);
    bot.muzzle = Math.max(0, bot.muzzle - dt);
    bot.flashT = Math.max(0, bot.flashT - dt);
    bot.hitFlash = Math.max(0, bot.hitFlash - dt);
    if (!bot.alive) {
      bot.deadT += dt;
      return;
    }

    if (bot.reloading) {
      bot.reloadT -= dt;
      if (bot.reloadT <= 0) this.finishReload(bot);
    }
    const weapon = this.activeWeapon(bot);
    if (!weapon) return;
    const speed = weapon.def.speedUnits * SPEED_SCALE;

    if (bot.flashT > 0) {
      bot.angle += dt * 0.8;
      this.moveFighter(bot, Math.cos(bot.angle), Math.sin(bot.angle), dt, speed * 0.3);
      return;
    }

    const target = this.botAcquire(bot);
    if (target) {
      if (!bot.hasTarget) bot.aimErr = 0.3 - bot.skill * 0.2;
      bot.hasTarget = true;
      bot.lastSeenX = target.x;
      bot.lastSeenY = target.y;
      bot.lastSeenT = 0;
    } else {
      bot.hasTarget = false;
      bot.aimErr = Math.max(0.22, bot.aimErr);
      bot.lastSeenT += dt;
    }

    if (target) {
      this.botCombat(bot, target, dt, speed);
      return;
    }

    if (bot.lastSeenT < 2.2) {
      this.botNavigate(bot, bot.lastSeenX, bot.lastSeenY, dt, speed * 0.9);
      if (Math.hypot(bot.lastSeenX - bot.x, bot.lastSeenY - bot.y) < 24) bot.lastSeenT = 3;
      return;
    }
    this.botRoam(bot, dt, speed);
  }

  private botAcquire(bot: Fighter): Fighter | null {
    let best: Fighter | null = null;
    let bestD = Infinity;
    for (const f of this.fighters) {
      if (f.team === bot.team || !f.alive) continue;
      if (!this.visibleTo(bot, f)) continue;
      const d = Math.hypot(f.x - bot.x, f.y - bot.y);
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    return best;
  }

  private preferredRange(weapon: WeaponDef): number {
    if (weapon.slot === 'knife') return 0;
    switch (weapon.sound) {
      case 'sniper': return 420;
      case 'rifle': return 300;
      case 'mg': return 260;
      case 'shotgun': return 80;
      case 'smg': return 170;
      default: return 150;
    }
  }

  private botCombat(bot: Fighter, target: Fighter, dt: number, speed: number) {
    const weapon = this.activeWeapon(bot);
    if (!weapon) return;
    const dx = target.x - bot.x;
    const dy = target.y - bot.y;
    const dist = Math.hypot(dx, dy);
    const targetAngle = Math.atan2(dy, dx);

    bot.aimErr = Math.max(0.02 + (1 - bot.skill) * 0.05, bot.aimErr - dt * (0.5 + bot.skill));

    let delta = targetAngle - bot.angle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    bot.angle += delta * Math.min(1, dt * 9);
    const aimOff = Math.abs(delta);

    const pref = this.preferredRange(weapon.def);
    bot.strafeT -= dt;
    if (bot.strafeT <= 0) {
      bot.strafeT = 0.8 + Math.random() * 1.4;
      bot.strafeDir = Math.random() < 0.5 ? -1 : 1;
    }
    const strafeX = -Math.sin(targetAngle) * bot.strafeDir;
    const strafeY = Math.cos(targetAngle) * bot.strafeDir;
    let moveX = strafeX * 0.7;
    let moveY = strafeY * 0.7;
    const towardX = dx / Math.max(1, dist);
    const towardY = dy / Math.max(1, dist);
    if (dist > pref + 40) {
      moveX += towardX * 0.9;
      moveY += towardY * 0.9;
    } else if (dist < Math.max(24, pref - 60)) {
      moveX -= towardX * 0.8;
      moveY -= towardY * 0.8;
    }
    this.moveFighter(bot, moveX, moveY, dt, speed);

    if (weapon.def.slot === 'knife') {
      if (dist < 30 && bot.fireCd <= 0) {
        bot.altSwing = Math.random() < 0.4;
        this.fireShot(bot, bot.angle + (Math.random() - 0.5) * 0.3);
      }
      return;
    }
    if (weapon.mag <= 0) {
      this.startReload(bot);
      return;
    }
    if (aimOff > 0.07 + bot.aimErr * 2) return;
    if (!this.visibleTo(bot, target)) return;

    if (weapon.def.auto) {
      if (bot.burstLeft > 0) {
        if (bot.fireCd <= 0) {
          bot.burstLeft--;
          this.fireShot(bot, bot.angle + (Math.random() - 0.5) * 2 * bot.aimErr);
        }
        if (bot.burstLeft <= 0) bot.burstPause = 0.28 + Math.random() * 0.5;
      } else {
        bot.burstPause -= dt;
        if (bot.burstPause <= 0 && bot.fireCd <= 0) {
          bot.burstLeft = 3 + Math.floor(Math.random() * 5);
        }
      }
    } else if (bot.fireCd <= 0) {
      this.fireShot(bot, bot.angle + (Math.random() - 0.5) * 2 * bot.aimErr);
      const pause = weapon.def.interval + 0.35 + Math.random() * 0.6;
      bot.fireCd = Math.max(weapon.def.interval, pause);
    }
  }

  private botNavigate(bot: Fighter, tx: number, ty: number, dt: number, speed: number) {
    bot.repathT -= dt;
    if (!bot.path || bot.repathT <= 0) {
      bot.repathT = 0.4;
      bot.path = findMapPath(bot.x, bot.y, tx, ty);
      bot.pathI = 0;
    }
    if (!bot.path) return;
    while (bot.pathI < bot.path.length) {
      const wp = bot.path[bot.pathI];
      if (Math.hypot(wp.x - bot.x, wp.y - bot.y) < 10) {
        bot.pathI++;
        continue;
      }
      const a = Math.atan2(wp.y - bot.y, wp.x - bot.x);
      this.moveFighter(bot, Math.cos(a), Math.sin(a), dt, speed);
      bot.angle = a;
      return;
    }
    bot.path = null;
  }

  // Fixed sweep points so bots systematically cover the whole arena
  // instead of randomly circling: crossing, both ends, both flanks.
  private static readonly SWEEP_POINTS: [number, number][] = [
    [720, 840], [720, 250], [720, 1430], [135, 840], [1305, 840],
    [150, 200], [1290, 200], [150, 1480], [1290, 1480],
  ];

  private botRoam(bot: Fighter, dt: number, speed: number) {
    bot.roamT -= dt;
    if (bot.roamT <= 0 || !bot.path || bot.pathI >= bot.path.length) {
      const roll = Math.random();
      let tx: number;
      let ty: number;
      if (roll < 0.65) {
        const pick = CounterStrikeGame.SWEEP_POINTS[
          Math.floor(Math.random() * CounterStrikeGame.SWEEP_POINTS.length)
        ] as [number, number];
        tx = pick[0];
        ty = pick[1];
      } else {
        // Push into the enemy end of the arena.
        tx = 90 + Math.random() * (MAP_PIXEL_X - 180);
        ty = bot.team === 'CT'
          ? 120 + Math.random() * 320
          : MAP_PIXEL_Y - 440 + Math.random() * 320;
      }
      const spot = nearestWalkableTile(
        Math.floor(tx / TILE),
        Math.floor(ty / TILE),
      );
      tx = (spot.col + 0.5) * TILE;
      ty = (spot.row + 0.5) * TILE;
      bot.roamT = 2.5 + Math.random() * 3;
      bot.roamX = tx;
      bot.roamY = ty;
      bot.path = findMapPath(bot.x, bot.y, tx, ty);
      bot.pathI = 0;
      return;
    }
    this.botNavigate(bot, bot.roamX, bot.roamY, dt, speed);
  }

  // ── Pickups ────────────────────────────────────────────────────────────────

  private pickupScan() {
    for (const f of this.fighters) {
      if (!f.alive) continue;
      for (let i = this.ground.length - 1; i >= 0; i--) {
        const item = this.ground[i];
        if (Math.hypot(item.x - f.x, item.y - f.y) > 20) continue;
        if (item.kind === 'weapon' && item.weaponId) {
          const def = WEAPONS[item.weaponId];
          let taken = false;
          if (def.slot === 'primary') {
            if (!f.primary) {
              const w = this.makeWeapon(def.id);
              w.mag = item.mag;
              w.reserve = item.reserve;
              f.primary = w;
              if (f.slot !== 'primary') f.slot = 'primary';
              taken = true;
            }
          } else {
            const w = this.makeWeapon(def.id);
            w.mag = item.mag;
            w.reserve = item.reserve;
            f.pistols.push(w);
            f.pistolIndex = f.pistols.length - 1;
            if (f.slot !== 'primary' || !f.primary) f.slot = 'secondary';
            taken = true;
          }
          if (taken) {
            this.ground.splice(i, 1);
            if (!f.isBot) this.sfx.pickup();
          }
        } else if (item.kind === 'nade' && item.nade) {
          const kind = item.nade;
          const cap = kind === 'flash' ? 2 : 1;
          if (f.nades[kind] < cap) {
            f.nades[kind]++;
            this.ground.splice(i, 1);
            if (!f.isBot) this.sfx.pickup();
          }
        }
      }
    }
  }

  // ── Grenades and FX ────────────────────────────────────────────────────────

  private updateGrenades(dt: number) {
    for (const g of [...this.grenades]) {
      g.age += dt;
      g.fuse -= dt;
      const nx = g.x + g.vx * dt;
      const ny = g.y + g.vy * dt;
      if (isSolidTile(Math.floor(nx / TILE), Math.floor(ny / TILE))) {
        if (isSolidTile(Math.floor(nx / TILE), Math.floor(g.y / TILE))) g.vx *= -0.55;
        if (isSolidTile(Math.floor(g.x / TILE), Math.floor(ny / TILE))) g.vy *= -0.55;
      } else {
        g.x = nx;
        g.y = ny;
      }

      if (g.type === 'he') {
        let contact: Fighter | null = null;
        if (g.age > 0.2) {
          for (const f of this.fighters) {
            if (!f.alive) continue;
            if (Math.hypot(f.x - g.x, f.y - g.y) < PLAYER_RADIUS + 5) {
              contact = f;
              break;
            }
          }
        }
        if (g.fuse <= 0 || contact) {
          this.explodeHE(g);
          this.grenades.splice(this.grenades.indexOf(g), 1);
        }
      } else if (g.fuse <= 0) {
        if (g.type === 'flash') this.popFlash(g);
        else this.popSmoke(g);
        this.grenades.splice(this.grenades.indexOf(g), 1);
      }
    }
  }

  private explodeHE(g: Grenade) {
    this.sfx.explosion();
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 190;
      this.particles.push({
        x: g.x,
        y: g.y,
        z: 4 + Math.random() * 16,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        vz: 30 + Math.random() * 120,
        life: 0.5,
        maxLife: 0.5,
        size: 2 + Math.random() * 4,
        color: i % 3 === 0 ? '#f07b72' : i % 3 === 1 ? '#f5c46a' : '#ffffff',
      });
    }
    for (const f of this.fighters) {
      if (!f.alive) continue;
      const d = Math.hypot(f.x - g.x, f.y - g.y);
      if (d > 210) continue;
      if (!hasLineOfSight(g.x, g.y, f.x, f.y)) continue;
      const falloff = 1 - 0.75 * (d / 210);
      const armored = f.armor > 0;
      const dmg = Math.round((armored ? 45 : 98) * falloff);
      const result = { dmg: Math.max(1, dmg), armorDmg: armored ? Math.max(0, Math.round(53 * falloff)) : 0 };
      this.applyHit(f, g.owner, 'usp', 'stomach', result, 'HE GRENADE', 300);
    }
    this.pushFeed(`${g.owner.name}  [HE GRENADE]  BOOM`, '#ffd24a', '#ffd24a');
  }

  private popFlash(g: Grenade) {
    this.sfx.flashPop();
    for (const f of this.fighters) {
      if (!f.alive) continue;
      const d = Math.hypot(f.x - g.x, f.y - g.y);
      if (d > 230) continue;
      if (!hasLineOfSight(g.x, g.y, f.x, f.y)) continue;
      const facing = Math.cos(f.angle - Math.atan2(g.y - f.y, g.x - f.x));
      const strength = (facing > 0.35 ? 2.2 : 1.1) * (1 - d / 270);
      f.flashT = Math.max(f.flashT, Math.min(2.6, strength + 0.15));
    }
  }

  private popSmoke(g: Grenade) {
    this.sfx.smokePop();
    this.smokes.push({ x: g.x, y: g.y, r: 12, maxR: 190, life: 18, maxLife: 18 });
  }

  private updateFx(dt: number) {
    for (const tr of this.tracers) tr.life -= dt;
    this.tracers = this.tracers.filter((tr) => tr.life > 0);
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vz -= 420 * dt;
      if (p.z < 0) p.z = 0;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const s of this.smokes) {
      s.life -= dt;
      s.r = Math.min(s.maxR, s.r + dt * (s.maxR / 1.6));
    }
    this.smokes = this.smokes.filter((s) => s.life > 0);
    for (const entry of this.feed) entry.life -= dt;
    this.feed = this.feed.filter((entry) => entry.life > 0);
  }

  // ── 3D projection helpers ──────────────────────────────────────────────────

  private project(wx: number, wy: number, h: number): { x: number; y: number; depth: number } | null {
    const dirX = Math.cos(this.angle);
    const dirY = Math.sin(this.angle);
    const planeX = -dirY * HALF_FOV_TAN;
    const planeY = dirX * HALF_FOV_TAN;
    const dx = wx - this.px;
    const dy = wy - this.py;
    const invDet = 1 / (planeX * dirY - dirX * planeY);
    const tx = invDet * (dirY * dx - dirX * dy);
    const ty = invDet * (-planeY * dx + planeX * dy);
    if (ty <= 0.05) return null;
    const shift = Math.sin(this.pitch) * this.rh * 0.9;
    return {
      x: (this.rw / 2) * (1 + tx / ty),
      y: this.rh / 2 - ((h - this.eye()) * this.rh) / ty + shift,
      depth: ty,
    };
  }

  // ── Drawing ────────────────────────────────────────────────────────────────

  /** Shadowed HUD text so white/yellow readouts stay crisp over bright ice. */
  private hudText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    align: CanvasTextAlign,
    font: string,
    fill: string,
    shadow = true,
  ) {
    ctx.font = font;
    ctx.textAlign = align;
    if (shadow) {
      ctx.fillStyle = 'rgba(6,12,24,0.72)';
      ctx.fillText(text, x + 2, y + 2);
    }
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  }

  draw(ctx: CanvasRenderingContext2D) {
    const use3d = !this.isPixelMode() && this.ensureScene3D();
    if (use3d) {
      this.drawWorld3D(ctx);
    } else {
      this.drawWorldLegacy(ctx);
      this.drawProjectedFx(ctx);
    }
    this.drawViewmodel(ctx);
    this.drawHud(ctx);
    if (this.buyOpen) this.drawBuyMenu(ctx);
    if (this.scoreboardHeld && !this.gameOver) this.drawScoreboard(ctx);
    if (this.touchMode && !this.paused && !this.gameOver) this.drawTouchControls(ctx);

    if (this.paused) {
      const zh = this.isZhLang();
      ctx.fillStyle = 'rgba(6,12,24,0.55)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#f1f5f9';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 34px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(zh ? '已暂停' : 'PAUSED', W / 2, H / 2 - 22);
      ctx.font = '17px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = 'rgba(241,245,249,0.8)';
      ctx.fillText(zh ? '按 P 继续' : 'PRESS P TO RESUME', W / 2, H / 2 + 22);
    }

    if (this.gameOver) {
      const zh = this.isZhLang();
      const won = this.ctWins >= ROUND.winScore;
      this.drawResultOverlay(ctx, {
        title: won ? 'COUNTER-TERRORISTS WIN' : 'TERRORISTS WIN',
        tone: won ? 'success' : 'danger',
        details: [
          `${zh ? '比分' : 'SCORE'} CT ${this.ctWins} : ${this.tWins} T`,
          `${zh ? '击杀' : 'KILLS'} ${this.player().kills}    ${zh ? '死亡' : 'DEATHS'} ${this.player().deaths}`,
          `${zh ? '得分' : 'POINTS'} ${this.playerScore()}`,
        ],
        hint: zh ? '点击或按空格重新开始' : 'CLICK OR PRESS SPACE TO RESTART',
      });
    }
  }

  /** Lazily create the WebGL scene; falls back to the raycaster when unavailable. */
  private ensureScene3D(): boolean {
    if (this.scene3dDisabled) return false;
    if (!this.scene3d) {
      try {
        this.scene3d = new CounterStrikeScene3D();
      } catch {
        this.scene3d = null;
      }
      if (!this.scene3d || !this.scene3d.ok) {
        this.scene3d?.dispose();
        this.scene3d = null;
        this.scene3dDisabled = true;
        return false;
      }
    }
    return true;
  }

  /** Modern mode: render the world with Three.js, then blit into the 2D canvas. */
  private drawWorld3D(ctx: CanvasRenderingContext2D) {
    const scene = this.scene3d;
    if (!scene) return;
    scene.resize(W, H, this.canvas.width / W);
    const p = this.player();
    scene.sync({
      camX: this.px,
      camY: this.py,
      camAngle: this.angle,
      pitch: this.pitch,
      eye: this.eye(),
      moving: p.moving,
      walkPhase: p.walkPhase,
      fighters: this.fighters.map((f, i) => ({
        id: i,
        isPlayer: f === p,
        x: f.x,
        y: f.y,
        angle: f.angle,
        team: f.team,
        variant: f.variant,
        alive: f.alive,
        deadT: f.deadT,
        walkPhase: f.walkPhase,
        moving: f.moving,
        muzzle: f.muzzle,
        crouch: f.crouch,
        hitFlash: f.hitFlash,
        helmet: f.helmet,
        recoil: f.recoil,
      })),
      ground: this.ground.map((g) => ({ x: g.x, y: g.y, kind: g.kind, weaponId: g.weaponId, nade: g.nade })),
      grenades: this.grenades.map((g) => ({ x: g.x, y: g.y, type: g.type })),
      smokes: this.smokes.map((s) => ({ x: s.x, y: s.y, r: s.r, maxR: s.maxR, life: s.life, maxLife: s.maxLife })),
      tracers: this.tracers.slice(-24),
      particles: this.particles.slice(-384),
    });
    scene.render();

    const glCanvas = scene.canvas;
    if (!glCanvas) return;
    ctx.imageSmoothingEnabled = true;
    let shakeX = 0;
    let shakeY = 0;
    if (this.shakeT > 0) {
      const k = this.shakeT / 0.09;
      shakeX = (Math.random() - 0.5) * 2 * this.shakeMag * k;
      shakeY = (Math.random() - 0.5) * 2 * this.shakeMag * k;
    }
    ctx.drawImage(glCanvas, shakeX, shakeY, W, H);
  }

  /** Pixel mode / no-WebGL fallback: the original raycaster. */
  private drawWorldLegacy(ctx: CanvasRenderingContext2D) {
    const pixel = this.isPixelMode();
    this.rw = pixel ? 320 : 640;
    this.rh = pixel ? 180 : 360;
    if (this.renderCanvas.width !== this.rw) {
      this.renderCanvas.width = this.rw;
      this.renderCanvas.height = this.rh;
    }
    const rctx = this.renderCtx;
    if (!rctx) return;

    this.drawWorld(rctx);

    ctx.imageSmoothingEnabled = !pixel;
    let shakeX = 0;
    let shakeY = 0;
    if (this.shakeT > 0) {
      const k = this.shakeT / 0.09;
      shakeX = (Math.random() - 0.5) * 2 * this.shakeMag * k;
      shakeY = (Math.random() - 0.5) * 2 * this.shakeMag * k;
    }
    ctx.drawImage(this.renderCanvas, 0, 0, this.rw, this.rh, shakeX, shakeY, W, H);
  }

  private drawWorld(rctx: CanvasRenderingContext2D) {
    const rw = this.rw;
    const rh = this.rh;

    // Ice sky.
    const sky = rctx.createLinearGradient(0, 0, 0, rh);
    sky.addColorStop(0, '#9cc4e8');
    sky.addColorStop(0.6, '#cfe2f2');
    sky.addColorStop(1, '#e9f2fa');
    rctx.fillStyle = sky;
    rctx.fillRect(0, 0, rw, rh);

    const dirX = Math.cos(this.angle);
    const dirY = Math.sin(this.angle);
    const planeX = -dirY * HALF_FOV_TAN;
    const planeY = dirX * HALF_FOV_TAN;
    const shift = Math.sin(this.pitch) * rh * 0.9;

    for (let col = 0; col < rw; col++) {
      const camX = (2 * col) / rw - 1;
      const rayX = dirX + planeX * camX;
      const rayY = dirY + planeY * camX;
      const hit = castRay(this.px, this.py, rayX, rayY, MAX_DIST);
      this.zBuffer[col] = hit.dist;

      const lineHeight = (rh * WALL_H) / Math.max(hit.dist, 1e-4);
      const wallTop = rh / 2 - lineHeight / 2 + shift;
      const wallBot = rh / 2 + lineHeight / 2 + shift;
      const fog = Math.max(0, Math.min(1, (hit.dist - FOG_START) / (MAX_DIST - FOG_START)));

      // Ice floor.
      const floorShade = Math.max(0.62, 0.92 - hit.dist / (MAX_DIST * 1.7));
      const fr = Math.round((198 + fog * 36) * floorShade);
      const fg = Math.round((218 + fog * 30) * floorShade);
      const fb = Math.round((233 + fog * 18) * floorShade);
      rctx.fillStyle = `rgb(${fr},${fg},${fb})`;
      rctx.fillRect(col, Math.max(0, wallBot), 1, rh - Math.max(0, wallBot));

      if (hit.dist < MAX_DIST - 0.5 && hit.kind !== TileKind.Floor) {
        const tint = wallTintAt(hit.col, hit.row);
        const tex = getWallTexture(tint);
        const texX = Math.min(63, Math.floor(hit.wallX * 64));
        rctx.drawImage(tex, texX, 0, 1, 64, col, wallTop, 1, lineHeight);
        if (hit.side === 1) {
          rctx.fillStyle = 'rgba(40,70,100,0.22)';
          rctx.fillRect(col, wallTop, 1, lineHeight);
        }
        if (fog > 0.02) {
          rctx.fillStyle = `rgba(233,242,250,${fog * 0.9})`;
          rctx.fillRect(col, wallTop, 1, lineHeight);
        }
      } else {
        rctx.fillStyle = `rgba(233,242,250,${0.75 + fog * 0.25})`;
        rctx.fillRect(col, wallTop, 1, lineHeight);
      }
    }

    this.drawSprites(rctx);
    this.drawSmokes(rctx);
  }

  private drawSprites(rctx: CanvasRenderingContext2D) {
    const rh = this.rh;
    const dirX = Math.cos(this.angle);
    const dirY = Math.sin(this.angle);
    const planeX = -dirY * HALF_FOV_TAN;
    const planeY = dirX * HALF_FOV_TAN;

    interface SpriteItem {
      depth: number;
      x: number;
      y: number;
      h: number; // world height of the sprite
      liftY: number; // world height the sprite base floats above the ground
      groundY: number;
      tex: HTMLCanvasElement;
      flash?: boolean;
      playerName?: string;
    }

    const sprites: SpriteItem[] = [];
    const player = this.player();

    for (const f of this.fighters) {
      const frames = getSoldierFrames(f.team, f.variant);
      if (!f.alive) {
        if (f.deadT > 2.2) continue;
        sprites.push({ depth: 0, x: f.x, y: f.y, h: 8, liftY: 0, groundY: 0, tex: frames.dead });
        continue;
      }
      let frame: HTMLCanvasElement;
      if (f.muzzle > 0) {
        frame = frames.frames[3];
      } else if (f.moving) {
        const step = Math.floor(f.walkPhase * 2) % 2;
        frame = frames.frames[step === 0 ? 1 : 2];
      } else {
        frame = frames.frames[0];
      }
      const item: SpriteItem = {
        depth: 0, x: f.x, y: f.y, h: SOLDIER_H, liftY: 0, groundY: 0, tex: frame,
        flash: f.muzzle > 0,
      };
      if (f === player) item.playerName = f.name;
      sprites.push(item);
    }

    for (const item of this.ground) {
      const tex = item.kind === 'weapon' && item.weaponId
        ? getWeaponSprite(item.weaponId)
        : item.nade
          ? getGrenadeSprite(item.nade)
          : null;
      if (!tex) continue;
      sprites.push({ depth: 0, x: item.x, y: item.y, h: 6, liftY: 0, groundY: 0, tex });
    }

    for (const g of this.grenades) {
      sprites.push({ depth: 0, x: g.x, y: g.y, h: 5, liftY: 6, groundY: 0, tex: getGrenadeSprite(g.type) });
    }

    // Compute depth and screen position.
    for (const sp of sprites) {
      const dx = sp.x - this.px;
      const dy = sp.y - this.py;
      const invDet = 1 / (planeX * dirY - dirX * planeY);
      const ty = invDet * (-planeY * dx + planeX * dy);
      if (ty <= 0.05) {
        sp.depth = -1;
        continue;
      }
      sp.depth = ty;
      const proj = this.project(sp.x, sp.y, 0);
      if (!proj) {
        sp.depth = -1;
        continue;
      }
      sp.groundY = proj.y;
    }
    sprites.sort((a, b) => b.depth - a.depth);

    for (const sp of sprites) {
      if (sp.depth <= 0.05) continue;
      const ty = sp.depth;
      const proj = this.project(sp.x, sp.y, 0);
      if (!proj) continue;
      const centerX = proj.x;
      const spriteH = Math.max(2, (rh * sp.h) / ty);
      const aspect = sp.tex.width / sp.tex.height;
      const spriteW = spriteH * aspect;
      const top = sp.groundY - (rh * sp.liftY) / ty - spriteH;
      const drawStartY = Math.floor(top);
      const drawStartX = Math.floor(centerX - spriteW / 2);
      const drawEndX = Math.min(this.rw, drawStartX + spriteW);
      const texW = sp.tex.width;
      const texH = sp.tex.height;
      for (let stripe = Math.max(0, drawStartX); stripe < drawEndX; stripe++) {
        if (ty >= this.zBuffer[stripe]) continue;
        const texX = Math.floor(((stripe - drawStartX) / spriteW) * texW);
        rctx.drawImage(
          sp.tex,
          Math.min(texW - 1, texX), 0, 1, texH,
          stripe, drawStartY, 1, spriteH,
        );
      }
      if (sp.flash) {
        rctx.fillStyle = 'rgba(255,214,110,0.95)';
        rctx.beginPath();
        rctx.arc(centerX + spriteW * 0.2, drawStartY + spriteH * 0.55, Math.max(2, spriteH * 0.09), 0, Math.PI * 2);
        rctx.fill();
      }
      if (sp.playerName) {
        rctx.fillStyle = 'rgba(255,255,255,0.9)';
        rctx.font = `${Math.max(6, Math.round(spriteH * 0.16))}px ui-monospace, SFMono-Regular, monospace`;
        rctx.textAlign = 'center';
        rctx.fillText(sp.playerName, centerX, drawStartY - 4);
      }
    }
  }

  private drawSmokes(rctx: CanvasRenderingContext2D) {
    const rh = this.rh;
    for (const s of this.smokes) {
      const proj = this.project(s.x, s.y, s.maxR / 2);
      if (!proj) continue;
      const radius = (rh * s.r) / proj.depth;
      if (radius < 1) continue;
      const centerY = proj.y;
      const drawStartX = Math.max(0, Math.floor(proj.x - radius));
      const drawEndX = Math.min(this.rw, Math.ceil(proj.x + radius));
      for (let stripe = drawStartX; stripe < drawEndX; stripe++) {
        if (proj.depth >= this.zBuffer[stripe]) continue;
        const off = (stripe - proj.x) / radius;
        if (Math.abs(off) > 1) continue;
        const alpha = Math.sqrt(Math.max(0, 1 - off * off)) * 0.5;
        rctx.fillStyle = `rgba(196,202,212,${alpha.toFixed(3)})`;
        rctx.fillRect(stripe, Math.floor(centerY - radius), 1, Math.ceil(radius * 2));
      }
    }
  }

  private drawProjectedFx(ctx: CanvasRenderingContext2D) {
    const sx = W / this.rw;
    const sy = H / this.rh;
    for (const tr of this.tracers) {
      const a = this.project(tr.x1, tr.y1, tr.z1);
      const b = this.project(tr.x2, tr.y2, tr.z2);
      if (!a || !b) continue;
      const alpha = Math.max(0, tr.life / tr.maxLife) * 0.85;
      ctx.strokeStyle = tr.color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.x * sx, a.y * sy);
      ctx.lineTo(b.x * sx, b.y * sy);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (const p of this.particles) {
      const proj = this.project(p.x, p.y, p.z);
      if (!proj) continue;
      const size = Math.max(1.5, (p.size * 40) / proj.depth) * sx;
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(proj.x * sx, proj.y * sy, size, size);
      ctx.globalAlpha = 1;
    }
  }

  /**
   * CS 1.6-style viewmodel: gun anchored low-right, muzzle toward the
   * crosshair, right hand on the grip and the left hand under the forend.
   * Silhouettes follow the real weapons (AK's curved mag + wood, AWP's big
   * scope + long barrel, P90's top mag, Deagle's long slide, ...).
   */
  private drawViewmodel(ctx: CanvasRenderingContext2D) {
    const p = this.player();
    if (this.gameOver || !p.alive || this.phase !== 'live') return;
    const w = this.activeWeapon(p);
    if (!w) return;
    const bobY = p.moving ? Math.sin(p.walkPhase * 2.4) * 4 : 0;
    const swayX = p.moving ? Math.cos(p.walkPhase * 1.2) * 5 : 0;
    const reloadDip = p.reloading ? Math.sin((1 - p.reloadT / w.def.reload) * Math.PI) * 0.5 : 0;

    const id = w.def.id;
    if (id === 'elite') {
      // Dual Berettas: one at each lower corner, angled inward.
      this.vmWithTransform(ctx, W - 150 + swayX, H - 34, -1.3, -0.30 - p.recoil * 1.4 + reloadDip, () => this.vmEliteSide(ctx, false));
      this.vmWithTransform(ctx, 150 + swayX * 0.6, H - 34, 1.3, -(-0.30 - p.recoil * 1.4 + reloadDip), () => this.vmEliteSide(ctx, true));
      return;
    }

    ctx.save();
    ctx.translate(W - 168 + swayX, H - 42);
    ctx.scale(-1.32, 1.32);
    ctx.rotate(-0.235 - p.recoil * 1.35 + reloadDip);
    ctx.translate(-p.recoil * 110, -bobY * 0.6);

    let muzzleX = 90;
    let muzzleY = -22;
    if (id === 'knife') {
      this.vmKnife(ctx);
    } else if (w.def.slot === 'secondary') {
      muzzleX = this.vmPistol(ctx, id, w.silenced);
      muzzleY = -30;
    } else {
      muzzleX = this.vmLongGun(ctx, id, w.silenced);
      muzzleY = -30;
    }

    if (p.muzzle > 0 && id !== 'knife') {
      const size = 22 + p.muzzle * 380;
      ctx.fillStyle = 'rgba(255,224,130,0.95)';
      ctx.beginPath();
      ctx.arc(muzzleX + 10, muzzleY, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,246,214,0.95)';
      ctx.beginPath();
      ctx.arc(muzzleX + 10, muzzleY, size * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Apply the mirrored CS anchor transform around a painter. */
  private vmWithTransform(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, scale: number, rot: number,
    paint: () => void,
  ) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, Math.abs(scale));
    ctx.rotate(rot);
    paint();
    ctx.restore();
  }

  // ── Viewmodel parts (local space: +X = muzzle direction, y down) ────────

  private vmHand(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number) {
    // CT-issue dark glove.
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = '#3c414a';
    ctx.fillRect(-8, -7, 17, 15);
    ctx.fillStyle = '#2b2f36';
    ctx.fillRect(-8, 4, 17, 4);
    ctx.restore();
  }

  private vmKnife(ctx: CanvasRenderingContext2D) {
    // Combat knife, blade up, held in the right hand.
    ctx.fillStyle = '#c7d3e0';
    ctx.beginPath();
    ctx.moveTo(8, -58);
    ctx.lineTo(26, -96);
    ctx.lineTo(30, -96);
    ctx.lineTo(20, -52);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#8ea2b5';
    ctx.fillRect(8, -58, 6, 46); // flat of the blade
    ctx.fillStyle = '#23262c';
    ctx.fillRect(6, -14, 22, 8); // guard
    ctx.fillStyle = '#4a3b2c';
    ctx.fillRect(9, -8, 16, 30); // handle
    this.vmHand(ctx, 17, 22, 0);
  }

  /** Pistols. Returns the muzzle X in local space. */
  private vmPistol(ctx: CanvasRenderingContext2D, id: WeaponId, silenced: boolean): number {
    const twoTone = id === 'p228';
    const slideCol = twoTone ? '#b9c2cc' : '#2a2d33';
    const frameCol = '#1e2126';
    const gripCol = '#3d332a';
    const longSlide = id === 'deagle';
    const slideLen = longSlide ? 74 : id === 'glock' ? 50 : 56;
    const slideH = longSlide ? 15 : 13;

    // grip + trigger guard
    ctx.fillStyle = gripCol;
    ctx.beginPath();
    ctx.moveTo(-16, -18);
    ctx.lineTo(4, -18);
    ctx.lineTo(10, 34);
    ctx.lineTo(-8, 34);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = frameCol;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(16, -6, 9, -Math.PI * 0.55, Math.PI * 0.55);
    ctx.stroke();
    // frame + slide
    ctx.fillStyle = frameCol;
    ctx.fillRect(-18, -24, 34, 8);
    ctx.fillStyle = slideCol;
    ctx.fillRect(-20, -24 - slideH, slideLen, slideH);
    if (longSlide) {
      ctx.fillStyle = '#c8ccd2';
      ctx.fillRect(-20, -24 - slideH, slideLen, 4); // deagle chrome rib
    }
    // hammer + rear sight
    ctx.fillStyle = frameCol;
    ctx.fillRect(-24, -24 - slideH + 2, 5, 8);
    ctx.fillRect(-20, -26 - slideH, 6, 3);
    ctx.fillRect(-20 + slideLen - 6, -26 - slideH, 4, 3); // front sight
    if (silenced) {
      // iconic USP/M4 suppressor
      ctx.fillStyle = '#23262b';
      ctx.fillRect(slideLen - 22, -21 - slideH, 34, 10);
      ctx.fillStyle = '#31353c';
      ctx.fillRect(slideLen - 22, -21 - slideH, 34, 3);
      this.vmHand(ctx, -1, 34, 0);
      return slideLen + 12;
    }
    this.vmHand(ctx, -1, 34, 0);
    return slideLen - 20;
  }

  /** Dual Beretta 92 — one side (mirrored placement handled by caller). */
  private vmEliteSide(ctx: CanvasRenderingContext2D, left: boolean) {
    ctx.fillStyle = '#c2c9d1';
    ctx.fillRect(-18, -36, 52, 12);           // open-top slide (silver)
    ctx.fillStyle = '#23262b';
    ctx.fillRect(-4, -34, 24, 5);             // exposed barrel slot
    ctx.fillRect(-18, -24, 30, 7);            // frame
    ctx.fillStyle = '#3d332a';
    ctx.beginPath();
    ctx.moveTo(-14, -18);
    ctx.lineTo(2, -18);
    ctx.lineTo(8, 30);
    ctx.lineTo(-6, 30);
    ctx.closePath();
    ctx.fill();
    this.vmHand(ctx, 0, 30, 0);
    void left;
  }

  /** Machine pistols (MAC-10 / TMP): stockless boxy body, big mag, strap. */
  private vmMachinePistol(ctx: CanvasRenderingContext2D, id: WeaponId): number {
    const metal = '#2a2d33';
    const dark = '#1b1e23';
    // Receiver — one tall slab, no stock, no separate handguard.
    ctx.fillStyle = metal;
    ctx.fillRect(-24, -36, 62, 26);
    ctx.fillStyle = dark;
    ctx.fillRect(-24, -14, 62, 6);                 // lower edge
    ctx.fillRect(36, -32, 22, 8);                  // short threaded barrel
    ctx.fillRect(-8, -42, 14, 6);                  // top cocking tabs
    if (id === 'mac10') {
      // Big straight mag and the iconic front strap the off-hand holds.
      ctx.fillStyle = dark;
      ctx.fillRect(4, -10, 13, 34);
      ctx.strokeStyle = '#4a4038';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(30, -10);
      ctx.quadraticCurveTo(40, 8, 32, 24);
      ctx.stroke();
    } else {
      // TMP: slimmer mag + foregrip
      ctx.fillStyle = dark;
      ctx.fillRect(6, -10, 11, 26);
      ctx.fillRect(30, -10, 7, 16);
    }
    // Grip
    ctx.fillStyle = '#33291f';
    ctx.beginPath();
    ctx.moveTo(-16, -10);
    ctx.lineTo(-2, -10);
    ctx.lineTo(3, 26);
    ctx.lineTo(-10, 26);
    ctx.closePath();
    ctx.fill();
    this.vmHand(ctx, -4, 24, 0);                       // right on grip
    this.vmHand(ctx, 26, id === 'mac10' ? 10 : 4, -0.4); // left on strap/foregrip
    return 58;
  }

  /** Long guns (shotgun/smg/rifle/sniper/mg). Returns muzzle X. */
  private vmLongGun(ctx: CanvasRenderingContext2D, id: WeaponId, silenced: boolean): number {
    if (id === 'mac10' || id === 'tmp') return this.vmMachinePistol(ctx, id);
    const metal = '#26292f';
    const metalDark = '#1b1e23';
    const wood = '#7a4e2d';
    const olive = '#55603d';
    const polymer = '#33373e';

    const has = (...ids: WeaponId[]) => ids.includes(id);
    const isAk = has('ak47', 'galil');
    const isBullpup = has('p90', 'famas', 'aug');
    const isSniper = has('scout', 'awp', 'g3sg1', 'sg550');

    const bodyCol = isAk ? metal : id === 'awp' || id === 'scout' ? olive : id === 'aug' || id === 'p90' ? olive : metal;
    const furnCol = isAk || id === 'm3' ? wood : bodyCol;
    const barrelLen =
      id === 'awp' ? 150 : isSniper ? 128 : has('m4a1', 'sg552', 'aug', 'famas') ? 108 :
      isAk ? 104 : has('m249') ? 112 : has('m3', 'xm1014') ? 96 :
      has('mp5') ? 74 : has('ump45', 'p90') ? 66 : 58;

    const gripX = isBullpup ? 34 : 0; // bullpup: action behind the trigger

    // Stock (behind the receiver, except bullpups)
    if (id === 'm4a1' || id === 'mp5') {
      ctx.fillStyle = metalDark;
      ctx.fillRect(gripX - 58, -26, 26, 12); // slim stock
    } else if (isAk) {
      ctx.fillStyle = furnCol;
      ctx.beginPath();                        // wooden stock sloping down
      ctx.moveTo(gripX - 62, -24);
      ctx.lineTo(gripX - 34, -30);
      ctx.lineTo(gripX - 34, -8);
      ctx.lineTo(gripX - 62, -4);
      ctx.closePath();
      ctx.fill();
    } else if (isSniper) {
      ctx.fillStyle = bodyCol;
      ctx.beginPath();                        // stock with cheek rest
      ctx.moveTo(gripX - 60, -26);
      ctx.lineTo(gripX - 32, -30);
      ctx.lineTo(gripX - 32, -6);
      ctx.lineTo(gripX - 52, -6);
      ctx.lineTo(gripX - 60, -14);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(gripX - 52, -32, 14, 6);
    } else if (!isBullpup) {
      ctx.fillStyle = metalDark;
      ctx.fillRect(gripX - 52, -26, 22, 14);
    }

    // Receiver
    ctx.fillStyle = bodyCol;
    ctx.fillRect(gripX - 34, -34, 74, 26);
    if (id === 'xm1014') ctx.fillRect(gripX - 34, -34, 84, 30); // bulkier

    // Magazine
    ctx.fillStyle = metalDark;
    if (isAk) {
      // The iconic curved 30-rounder.
      ctx.beginPath();
      ctx.moveTo(gripX + 10, -10);
      ctx.quadraticCurveTo(gripX + 16, 26, gripX + 36, 36);
      ctx.lineTo(gripX + 46, 28);
      ctx.quadraticCurveTo(gripX + 28, 18, gripX + 24, -10);
      ctx.closePath();
      ctx.fill();
    } else if (id === 'p90') {
      // Top-mounted translucent 50-round strip.
      ctx.fillStyle = '#8d9aa8';
      ctx.fillRect(gripX - 20, -42, 78, 7);
      ctx.fillStyle = 'rgba(233,236,240,0.65)';
      ctx.fillRect(gripX - 20, -42, 78, 2.5);
    } else if (id === 'm249') {
      ctx.fillStyle = '#3f4a35';              // ammo box
      ctx.fillRect(gripX + 4, -8, 30, 26);
    } else if (id === 'mp5') {
      ctx.beginPath();                        // curved SMG mag
      ctx.moveTo(gripX + 12, -10);
      ctx.quadraticCurveTo(gripX + 16, 18, gripX + 28, 26);
      ctx.lineTo(gripX + 36, 20);
      ctx.quadraticCurveTo(gripX + 26, 12, gripX + 24, -10);
      ctx.closePath();
      ctx.fill();
    } else if (!isBullpup) {
      ctx.fillRect(gripX + 8, -10, 14, isSniper ? 16 : 26); // straight box mag
    } else {
      ctx.fillRect(gripX - 6, -10, 13, 22);   // bullpup mag behind grip
    }

    // Handguard + barrel
    ctx.fillStyle = furnCol;
    ctx.fillRect(gripX + 40, -32, 52, 20);
    ctx.fillStyle = metalDark;
    ctx.fillRect(gripX + 88, -28, barrelLen - 52, 8);
    if (id === 'awp' || id === 'g3sg1') ctx.fillRect(gripX + 88, -29, barrelLen - 40, 10); // heavy barrel

    // Pump / foregrip / bolt details
    if (id === 'm3') {
      ctx.fillStyle = wood;
      ctx.fillRect(gripX + 46, -10, 30, 9);   // pump under the tube
    }
    if (id === 'mp5') {
      ctx.fillStyle = metalDark;
      ctx.fillRect(gripX + 46, -10, 8, 18);   // foregrip
    }
    if (isSniper) {
      ctx.fillStyle = metalDark;
      ctx.fillRect(gripX + 34, -26, 10, 5);   // bolt handle
    }

    // Top furniture: scope / carry handle / rail
    if (isSniper || has('sg552', 'sg550', 'aug')) {
      ctx.fillStyle = '#1f2227';              // scope tube
      const scopeL = id === 'awp' ? 46 : 36;
      ctx.fillRect(gripX - 16, -48, scopeL, 12);
      ctx.fillStyle = '#3d4c5c';
      ctx.fillRect(gripX - 16, -48, 6, 12);   // objective bell
      ctx.fillStyle = metalDark;
      ctx.fillRect(gripX + 2, -36, 6, 4);     // mount
    } else if (has('m4a1', 'famas')) {
      ctx.fillStyle = metalDark;              // carry handle
      ctx.fillRect(gripX - 22, -44, 46, 10);
      ctx.fillRect(gripX - 22, -44, 6, 20);
      ctx.fillRect(gripX + 18, -44, 6, 20);
    } else if (id === 'm249') {
      ctx.fillStyle = metalDark;              // feed cover
      ctx.fillRect(gripX - 30, -40, 60, 7);
    }

    // Front sight
    if (isAk || id === 'm4a1') {
      ctx.fillStyle = metalDark;
      ctx.fillRect(gripX + 86 + (barrelLen - 60), -38, 4, 12);
    }

    // Suppressor (USP/M4A1 attach state)
    let muzzleX = gripX + 88 + barrelLen - 52;
    if (silenced && (id === 'm4a1')) {
      ctx.fillStyle = '#23262b';
      ctx.fillRect(muzzleX - 4, -31, 34, 12);
      ctx.fillStyle = '#31353c';
      ctx.fillRect(muzzleX - 4, -31, 34, 4);
      muzzleX += 30;
    }

    // Hands: right on the grip, left under the handguard.
    this.vmHand(ctx, gripX - 4, 24, 0);       // right
    this.vmHand(ctx, gripX + 58, -2, -0.5);   // left at the forend

    return muzzleX;
  }

  private drawHud(ctx: CanvasRenderingContext2D) {
    const zh = this.isZhLang();
    const font = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    const mono = 'ui-monospace, SFMono-Regular, monospace';
    ctx.textBaseline = 'middle';

    // ── Top center: round timer + team scores.
    const timerText = this.phase === 'live'
      ? `${Math.floor(this.roundTimer / 60)}:${String(Math.ceil(this.roundTimer % 60)).padStart(2, '0')}`
      : this.phase === 'freeze'
        ? `FREEZE ${Math.ceil(this.phaseTimer)}`
        : '';
    ctx.fillStyle = 'rgba(8,16,30,0.58)';
    ctx.fillRect(W / 2 - 140, 14, 280, 46);
    this.hudText(ctx, `CT ${this.ctWins}`, W / 2 - 126, 37, 'left', `bold 19px ${font}`, '#7fb2ff');
    this.hudText(ctx, timerText, W / 2, 37, 'center', `bold 26px ${mono}`, '#f5f5f0');
    this.hudText(ctx, `${this.tWins} T`, W / 2 + 126, 37, 'right', `bold 19px ${font}`, '#ff9a8a');

    // Round / phase label.
    ctx.textAlign = 'center';
    ctx.font = `15px ${font}`;
    const label = this.phase === 'freeze'
      ? (zh ? '冻结时间 · 购买区在地图中央' : 'FREEZE · BUYZONE IS IN THE CENTER')
      : this.phase === 'live' && this.liveT <= ROUND.buyTime
        ? (zh ? `购买时间 ${Math.ceil(ROUND.buyTime - this.liveT)}s · 中央购买区` : `BUY TIME ${Math.ceil(ROUND.buyTime - this.liveT)}s · CENTER BUYZONE`)
        : this.phase === 'live'
          ? (zh ? `回合 ${this.round} · 先到 ${ROUND.winScore} 回合获胜` : `ROUND ${this.round} · FIRST TO ${ROUND.winScore}`)
          : '';
    this.hudText(ctx, label, W / 2, 76, 'center', `15px ${font}`, 'rgba(241,245,249,0.92)');

    if (this.liveMsg > 0) {
      this.hudText(ctx, zh ? '冲! 冲! 冲!' : 'GO GO GO!', W / 2, 138, 'center', `bold 32px ${font}`, `rgba(255,240,170,${Math.min(1, this.liveMsg)})`);
    }

    if (this.buyHintT > 0) {
      this.hudText(ctx, zh ? '购买区在地图中央!' : 'BUYZONE IS IN THE CENTER!', W / 2, 168, 'center', `bold 17px ${font}`, `rgba(255,210,74,${Math.min(1, this.buyHintT)})`);
    }

    if (this.canBuy() && !this.buyOpen) {
      this.hudText(ctx, zh ? '按 B 购买 (购买区内)' : 'PRESS B TO BUY (IN BUYZONE)', W / 2, H / 2 + 120, 'center', `bold 16px ${font}`, 'rgba(255,210,74,0.95)');
    }

    // ── Kill feed (top right).
    ctx.textAlign = 'right';
    this.feed.forEach((entry, i) => {
      ctx.globalAlpha = Math.min(1, entry.life);
      ctx.font = `bold 14px ${font}`;
      ctx.fillStyle = 'rgba(8,16,30,0.52)';
      const width = ctx.measureText(entry.text).width + 18;
      ctx.fillRect(W - width - 12, 12 + i * 23, width, 21);
      this.hudText(ctx, entry.text, W - 20, 23 + i * 23, 'right', `bold 14px ${font}`, entry.color, false);
      ctx.globalAlpha = 1;
    });

    // ── Radar (top left).
    this.drawRadar(ctx);

    // ── Bottom-left: health + armor.
    const p = this.player();
    const hpY = H - 32;
    ctx.fillStyle = '#e23b3b';
    ctx.fillRect(18, hpY - 12, 20, 20);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(23, hpY - 6, 10, 10);
    ctx.fillRect(21, hpY - 2, 14, 2);
    this.hudText(ctx, String(p.hp), 48, hpY, 'left', `bold 32px ${mono}`, p.hp > 60 ? '#e8f4ff' : p.hp > 30 ? '#ffd24a' : '#ff6a5e');
    ctx.fillStyle = '#7fa8d4';
    ctx.fillRect(104, hpY - 11, 17, 17);
    ctx.fillStyle = '#dbe9f7';
    ctx.fillRect(110, hpY - 6, 5, 8);
    this.hudText(ctx, String(p.armor), 128, hpY, 'left', `bold 22px ${mono}`, '#bcd4ec');
    this.hudText(ctx, zh ? '护甲' : 'ARMOR', 128, hpY + 20, 'left', `13px ${font}`, 'rgba(241,245,249,0.8)');

    // ── Bottom-right: weapon name, ammo, money.
    const w = this.activeWeapon(p);
    if (w) {
      this.hudText(ctx, p.slot === 'nade' ? `${p.nadeSel.toUpperCase()} × ${p.nades[p.nadeSel]}` : w.def.name, W - 22, H - 62, 'right', `bold 17px ${font}`, '#ffd24a');
    }
    if (w && w.def.slot !== 'knife' && p.slot !== 'nade') {
      this.hudText(ctx, `${w.mag} / ${w.reserve}`, W - 22, H - 32, 'right', `bold 28px ${mono}`, w.mag === 0 ? '#ff6a5e' : '#f5f5f0');
    }
    this.hudText(ctx, `$${p.money}`, W - 22, H - 12, 'right', `bold 22px ${mono}`, '#8ee04d');

    if (p.reloading && w) {
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(W - 190, H - 50, 168, 6);
      ctx.fillStyle = '#ffd24a';
      ctx.fillRect(W - 190, H - 50, 168 * Math.min(1, 1 - p.reloadT / w.def.reload), 6);
    }

    if (!this.sfx.enabled) {
      this.hudText(ctx, zh ? '静音' : 'MUTED', 20, 130, 'left', `14px ${font}`, 'rgba(241,245,249,0.85)');
    }

    // ── Crosshair (only while alive).
    if (p.alive) {
      const spreadPx = this.crosshairGap();
      const cx = W / 2;
      const cy = H / 2;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy - spreadPx - 10); ctx.lineTo(cx, cy - spreadPx - 1);
      ctx.moveTo(cx, cy + spreadPx + 1); ctx.lineTo(cx, cy + spreadPx + 10);
      ctx.moveTo(cx - spreadPx - 10, cy); ctx.lineTo(cx - spreadPx - 1, cy);
      ctx.moveTo(cx + spreadPx + 1, cy); ctx.lineTo(cx + spreadPx + 10, cy);
      ctx.stroke();
      ctx.strokeStyle = '#00e05a';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#00e05a';
      ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);

      if (this.hitmarker > 0) {
        const a = this.hitmarker / 0.14;
        ctx.strokeStyle = this.hitmarkerKill ? `rgba(255,90,80,${a})` : `rgba(255,255,255,${a})`;
        ctx.lineWidth = 2.5;
        const r = 12;
        ctx.beginPath();
        ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx - r + 6, cy - r + 6);
        ctx.moveTo(cx - r, cy + r); ctx.lineTo(cx - r + 6, cy + r - 6);
        ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx + r - 6, cy - r + 6);
        ctx.moveTo(cx + r, cy + r); ctx.lineTo(cx + r - 6, cy + r - 6);
        ctx.stroke();
      }
    }

    // ── Damage vignette.
    if (this.damageFlash > 0 || (p.hp < 35 && p.alive)) {
      const pulse = p.hp < 35 && p.alive ? 0.12 + Math.sin(performance.now() / 300) * 0.07 : 0;
      const alpha = Math.max(this.damageFlash * 0.8, pulse);
      if (alpha > 0.01) {
        const grad = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.7);
        grad.addColorStop(0, 'rgba(220,50,50,0)');
        grad.addColorStop(1, `rgba(220,50,50,${Math.min(0.6, alpha)})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
      }
    }

    // ── Flash overlay.
    if (p.flashT > 0 && p.alive) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(0.92, p.flashT / 2.2)})`;
      ctx.fillRect(0, 0, W, H);
    }

    // ── Spectate banner.
    if (!p.alive && !this.gameOver) {
      ctx.fillStyle = 'rgba(8,16,30,0.62)';
      ctx.fillRect(0, H / 2 - 46, W, 92);
      ctx.textAlign = 'center';
      ctx.font = `bold 28px ${font}`;
      ctx.fillStyle = '#ff9a8a';
      ctx.fillText(zh ? '你阵亡了' : 'YOU WERE KILLED', W / 2, H / 2 - 16);
      ctx.font = `16px ${font}`;
      ctx.fillStyle = 'rgba(241,245,249,0.88)';
      ctx.fillText(zh ? '观战中 — 回合结束时自动进入下一回合' : 'SPECTATING — NEXT ROUND STARTS AUTOMATICALLY', W / 2, H / 2 + 18);
    }

    // ── Round result banner.
    if (this.phase === 'post' && !this.gameOver) {
      const text = this.roundDraw
        ? (zh ? '回合平局' : 'ROUND DRAW')
        : this.roundWinner === 'CT'
          ? (zh ? '反恐精英获胜!' : 'Counter-Terrorists Win!')
          : (zh ? '恐怖分子获胜!' : 'Terrorists Win!');
      const color = this.roundDraw ? '#ffd24a' : this.roundWinner === 'CT' ? '#7fb2ff' : '#ff9a8a';
      ctx.fillStyle = 'rgba(8,16,30,0.62)';
      ctx.fillRect(0, 160, W, 84);
      ctx.textAlign = 'center';
      ctx.font = `bold 32px ${font}`;
      ctx.fillStyle = color;
      ctx.fillText(text, W / 2, 190);
      ctx.font = `16px ${font}`;
      ctx.fillStyle = 'rgba(241,245,249,0.88)';
      ctx.fillText(zh ? `下一回合 ${Math.ceil(this.postTimer)}` : `NEXT ROUND ${Math.ceil(this.postTimer)}`, W / 2, 222);
    }
  }

  private crosshairGap(): number {
    const p = this.player();
    const w = this.activeWeapon(p);
    if (!w) return 8;
    const moveMul = p.moving ? (p.walk ? 1.35 : 1.9) : p.crouch ? 0.55 : 1;
    const angular = w.def.spread * moveMul + p.recoil * 0.55;
    // rw/2 (640) over tan(half FOV 33°) → screen pixels per radian ≈ 985
    return 4 + angular * 985 + (p.moving ? 2 : 0);
  }

  private drawRadar(ctx: CanvasRenderingContext2D) {
    const size = 100;
    const mx = 10;
    const my = 10;
    const sx = size / MAP_PIXEL_X;
    const sy = size / MAP_PIXEL_Y;
    ctx.fillStyle = 'rgba(16,38,22,0.75)';
    ctx.fillRect(mx - 3, my - 3, size + 6, size + 6);
    ctx.fillStyle = 'rgba(160,200,170,0.35)';
    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        if (ICEBERG_MAP[r][c] !== TileKind.Wall) continue;
        ctx.fillRect(mx + c * TILE * sx, my + r * TILE * sy, TILE * sx - 0.3, TILE * sy - 0.3);
      }
    }
    ctx.strokeStyle = 'rgba(255,210,74,0.5)';
    ctx.strokeRect(
      mx + BUY_ZONE_RECT.x * sx,
      my + BUY_ZONE_RECT.y * sy,
      BUY_ZONE_RECT.w * sx,
      BUY_ZONE_RECT.h * sy,
    );

    const player = this.player();
    const spectator = !player.alive;
    for (const f of this.fighters) {
      if (!f.alive) continue;
      if (f.team === 'CT') {
        ctx.fillStyle = f === player ? '#ffffff' : '#6fa4f0';
        ctx.fillRect(mx + f.x * sx - 2, my + f.y * sy - 2, 4, 4);
      } else if (spectator || this.seenByTeam(f, 'CT')) {
        ctx.fillStyle = '#ff7a66';
        ctx.fillRect(mx + f.x * sx - 2, my + f.y * sy - 2, 4, 4);
      }
    }
    ctx.save();
    ctx.translate(mx + this.px * sx, my + this.py * sy);
    ctx.rotate(this.angle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(5.5, 0);
    ctx.lineTo(-3.5, -3.5);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-3.5, 3.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawBuyMenu(ctx: CanvasRenderingContext2D) {
    const zh = this.isZhLang();
    const font = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    const mono = 'ui-monospace, SFMono-Regular, monospace';
    const rect = this.buyMenuRect();
    const p = this.player();

    ctx.fillStyle = 'rgba(10,18,32,0.9)';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = 'rgba(255,210,74,0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold 21px ${font}`;
    ctx.fillStyle = '#ffd24a';
    ctx.fillText(zh ? '购买装备 (BUY EQUIPMENT)' : 'BUY EQUIPMENT', rect.x + rect.w / 2, rect.y + 24);
    ctx.font = `bold 15px ${mono}`;
    ctx.fillStyle = '#8ee04d';
    ctx.fillText(`$${p.money}`, rect.x + rect.w / 2, rect.y + 46);

    const rowY = rect.y + 64;
    const rowH = 25;
    const leftX = rect.x + 10;
    const rightX = rect.x + rect.w / 2 + 8;

    BUY_CATEGORIES.forEach((category, i) => {
      const y = rowY + i * rowH;
      const hover = this.buyCat === -1 && this.hoverCat === i;
      const active = this.buyCat === i;
      ctx.fillStyle = active ? 'rgba(255,210,74,0.28)' : hover ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.03)';
      ctx.fillRect(leftX - 2, y - 11, rect.w / 2 - 12, rowH);
      ctx.textAlign = 'left';
      ctx.font = `15px ${font}`;
      ctx.fillStyle = active ? '#ffd24a' : '#e8eef5';
      ctx.fillText(`${i + 1}  ${zh ? category.labelZh : category.label}`, leftX + 8, y);
    });

    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.moveTo(rect.x + rect.w / 2, rect.y + 56);
    ctx.lineTo(rect.x + rect.w / 2, rect.y + rect.h - 10);
    ctx.stroke();

    if (this.buyCat >= 0) {
      const category = BUY_CATEGORIES[this.buyCat];
      const items = buyItemsForTeam(category, p.team);
      items.forEach((item, i) => {
        const y = rowY + i * rowH;
        const hover = this.hoverItem === i;
        const affordable = p.money >= item.price;
        ctx.fillStyle = hover ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.03)';
        ctx.fillRect(rightX - 2, y - 11, rect.w / 2 - 12, rowH);
        ctx.textAlign = 'left';
        ctx.font = `14px ${font}`;
        ctx.fillStyle = affordable ? '#e8eef5' : 'rgba(232,238,245,0.4)';
        ctx.fillText(`${i + 1}  ${item.name}`, rightX + 8, y);
        ctx.textAlign = 'right';
        ctx.font = `13px ${mono}`;
        ctx.fillStyle = affordable ? '#8ee04d' : 'rgba(142,224,77,0.4)';
        ctx.fillText(`$${item.price}`, rect.x + rect.w - 14, y);
      });
    }

    ctx.textAlign = 'center';
    ctx.font = `12px ${font}`;
    ctx.fillStyle = 'rgba(232,238,245,0.7)';
    ctx.fillText(
      zh ? '数字键选择 · B/ESC 关闭 · 0 返回' : 'NUMBER KEYS · B/ESC CLOSE · 0 BACK',
      rect.x + rect.w / 2,
      rect.y + rect.h - 16,
    );
  }

  private drawScoreboard(ctx: CanvasRenderingContext2D) {
    const font = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    const mono = 'ui-monospace, SFMono-Regular, monospace';
    const bw = 440;
    const bx = (W - bw) / 2;
    const by = 92;
    const bh = 320;
    ctx.fillStyle = 'rgba(8,16,30,0.92)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = 'rgba(255,210,74,0.5)';
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold 21px ${font}`;
    ctx.fillStyle = '#ffd24a';
    ctx.fillText(`CT ${this.ctWins} : ${this.tWins} T`, bx + bw / 2, by + 26);

    const cols: { team: Team; title: string; color: string; x: number }[] = [
      { team: 'CT', title: 'COUNTER-TERRORISTS', color: '#7fb2ff', x: bx + 24 },
      { team: 'T', title: 'TERRORISTS', color: '#ff9a8a', x: bx + bw / 2 + 16 },
    ];
    for (const col of cols) {
      ctx.textAlign = 'left';
      ctx.font = `bold 14px ${font}`;
      ctx.fillStyle = col.color;
      ctx.fillText(col.title, col.x, by + 52);
      const members = this.fighters.filter((f) => f.team === col.team);
      members.forEach((f, i) => {
        const y = by + 78 + i * 32;
        const dead = !f.alive;
        ctx.fillStyle = dead ? 'rgba(232,238,245,0.4)' : '#e8eef5';
        ctx.font = `14px ${font}`;
        ctx.fillText(f.name, col.x, y);
        ctx.font = `13px ${mono}`;
        ctx.textAlign = 'right';
        ctx.fillText(`${f.kills}/${f.deaths}`, col.x + 142, y);
        ctx.fillStyle = '#8ee04d';
        ctx.fillText(`$${f.money}`, col.x + 198, y);
        ctx.textAlign = 'left';
      });
    }
  }

  private drawTouchControls(ctx: CanvasRenderingContext2D) {
    const zh = this.isZhLang();
    if (this.moveTouch) {
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.moveTouch.ax, this.moveTouch.ay, 66, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.arc(this.moveTouch.ax + this.moveTouch.dx, this.moveTouch.ay + this.moveTouch.dy, 30, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(104, H - 104, 66, 0, Math.PI * 2);
      ctx.stroke();
    }
    const fireActive = !!this.fireTouch;
    ctx.fillStyle = fireActive ? 'rgba(240,90,80,0.75)' : 'rgba(240,90,80,0.4)';
    ctx.beginPath();
    ctx.arc(W - 104, H - 100, 52, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 16px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(zh ? '开火' : 'FIRE', W - 104, H - 100);
    const reloadActive = !!this.reloadTouch;
    ctx.fillStyle = reloadActive ? 'rgba(57,197,187,0.75)' : 'rgba(57,197,187,0.4)';
    ctx.beginPath();
    ctx.arc(W - 104, H - 196, 36, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(zh ? '换弹' : 'R', W - 104, H - 196);
    ctx.font = '13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(zh ? '左:移动  右:视角' : 'LEFT: MOVE  RIGHT: LOOK', W / 2, H - 16);
  }
}
