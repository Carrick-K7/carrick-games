// Counter-Strike — a faithful single-map CS 1.6 port on fy_iceworld.
//
// Top-down team-deathmatch rounds with the classic CS 1.6 rule set: T vs CT,
// $800 start money, weapon pickups under every spawn, the exposed center
// buyzone, round wins/loss bonuses, armor + helmet, grenades, headshots, and
// a first-to-3 match. Weapons, damage tables (armored/unarmored), prices,
// rates, movement speeds, and the buy menu follow the CS 1.6 references in
// counterstrikeRules.ts.

import {
  BaseGame,
  createDefaultGameHost,
  type GameHost,
  type GameShellSnapshot,
} from '../core/game.js';
import { Sfx } from './counterstrikeAudio.js';
import {
  BUY_ZONE_RECT,
  CT_SPAWNS,
  ICEBERG_MAP,
  MAP_COLS,
  MAP_ROWS,
  MAP_PIXEL,
  NADE_PICKUPS,
  T_SPAWNS,
  TILE,
  TileKind,
  findMapPath,
  hasLineOfSight,
  inBuyZone,
  isSolidTile,
  raycastWall,
  solidCircle,
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

const W = MAP_PIXEL; // 480
const H = MAP_PIXEL;
const PLAYER_RADIUS = 11;
const BOT_VISION = 320;
const MAX_HP = ROUND.maxHp;
const MAX_ARMOR = ROUND.maxArmor;

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
  private roundWinner: Team | null = null;
  private roundDraw = false;
  private liveMsg = 0;
  private buyHintT = 0;
  private gameOver = false;
  private paused = false;

  private keys = new Set<string>();
  private firing = false;
  private triggerPulse = false;
  private aimX = 0;
  private aimY = 0;
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
  private aimTouch: { id: number; lastX: number; lastY: number; moved: number } | null = null;
  private fireTouch: { id: number } | null = null;

  private floorShades: number[] = [];
  private hudStateCache = '';
  private readonly sfx = new Sfx();
  private boundBlur: (() => void) | null = null;
  private boundContextMenu: ((e: Event) => void) | null = null;

  constructor(host?: GameHost) {
    super(host ?? createDefaultGameHost('gameCanvas', W, H));
    this.touchMode =
      typeof window !== 'undefined' &&
      ('ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0);
    this.floorShades = Array.from(
      { length: MAP_COLS * MAP_ROWS },
      (_, i) => 0.86 + ((i * 17 + Math.floor(i / MAP_COLS) * 7) % 13) / 100,
    );
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
  }

  private clearTransientInput() {
    this.keys.clear();
    this.firing = false;
    this.triggerPulse = false;
    this.scoreboardHeld = false;
    this.clearTouch();
  }

  private clearTouch() {
    this.moveTouch = null;
    this.aimTouch = null;
    this.fireTouch = null;
  }

  destroy() {
    this.stop();
    this.sfx.close();
  }

  private player(): Fighter {
    return this.fighters[0];
  }

  private playerScore(): number {
    const p = this.player();
    return p.kills * 150 + this.ctWins * 500;
  }

  private syncDebugState() {
    const alive = this.fighters.filter((f) => f.alive).length;
    const t0 = this.fighters[4];
    const p = this.player();
    const key = `${this.round},${this.phase},${p.kills},${alive},${this.gameOver ? 1 : 0}|${p.x.toFixed(0)},${p.y.toFixed(0)},$${p.money}|${t0.x.toFixed(0)},${t0.y.toFixed(0)}`;
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

    // Rebuild the fixed pickups: every spawn gun + scattered grenades.
    this.ground = [
      ...CT_SPAWNS.map((sp) => ({ ...this.groundWeapon(sp.x, sp.y, sp.weapon), fixed: true })),
      ...T_SPAWNS.map((sp) => ({ ...this.groundWeapon(sp.x, sp.y, sp.weapon), fixed: true })),
      ...NADE_PICKUPS.map((n) => ({
        x: n.x, y: n.y, kind: 'nade' as const, nade: n.nade, mag: 0, reserve: 0, fixed: true,
      })),
    ];

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

    // Claim the gun under the spawn, like the real fy_iceworld.
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
      this.aimX = f.x + 60;
      this.aimY = f.y;
    }
  }

  private removeGroundItemAt(x: number, y: number, weaponId: WeaponId) {
    const index = this.ground.findIndex(
      (item) => item.kind === 'weapon' && item.weaponId === weaponId && Math.hypot(item.x - x, item.y - y) < TILE * 0.7,
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
      f.money = clampMoney(f.money + (won ? ECONOMY.winMoney : lossMoney(won ? 0 : (ctWon ? this.tLossStreak : this.ctLossStreak))));
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

  // ── Buying (freezetime, center buyzone only) ───────────────────────────────

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
      inBuyZone(p.x, p.y)
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
          if (this.paused) this.clearTransientInput();
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
        const p = this.player();
        this.aimX = point.x;
        this.aimY = point.y;
        if (p.alive) p.angle = Math.atan2(point.y - p.y, point.x - p.x);
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
        const p = this.player();
        if (!p.alive) return;
        if (this.phase === 'live') {
          this.firing = true;
          this.triggerPulse = true;
        }
        return;
      }
      if (e.type === 'mouseup' && e.button === 0) {
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
          if (point.x < this.width * 0.4 && point.y > this.height * 0.35) {
            if (!this.moveTouch) {
              this.moveTouch = { id: t.identifier, ax: point.x, ay: point.y, dx: 0, dy: 0 };
            }
          } else if (Math.hypot(point.x - (this.width - 62), point.y - (this.height - 62)) <= 46) {
            if (!this.fireTouch) {
              this.fireTouch = { id: t.identifier };
              const p = this.player();
              if (p.alive && this.phase === 'live') {
                this.firing = true;
                this.triggerPulse = true;
              }
            }
          } else if (point.x >= this.width - 120 && point.y >= this.height - 160 && point.y <= this.height - 100) {
            this.startReload(this.player());
          } else if (!this.aimTouch) {
            this.aimTouch = { id: t.identifier, lastX: point.x, lastY: point.y, moved: 0 };
          }
        }
      } else if (e.type === 'touchmove' && !this.paused) {
        for (const t of e.changedTouches) {
          const point = this.canvasPoint(t.clientX, t.clientY);
          if (this.moveTouch && t.identifier === this.moveTouch.id) {
            const dx = point.x - this.moveTouch.ax;
            const dy = point.y - this.moveTouch.ay;
            const len = Math.hypot(dx, dy);
            const maxR = 56;
            if (len > maxR) {
              this.moveTouch.dx = (dx / len) * maxR;
              this.moveTouch.dy = (dy / len) * maxR;
            } else {
              this.moveTouch.dx = dx;
              this.moveTouch.dy = dy;
            }
          } else if (this.aimTouch && t.identifier === this.aimTouch.id) {
            const p = this.player();
            this.aimTouch.moved += Math.abs(point.x - this.aimTouch.lastX) + Math.abs(point.y - this.aimTouch.lastY);
            this.aimTouch.lastX = point.x;
            this.aimTouch.lastY = point.y;
            this.aimX = point.x;
            this.aimY = point.y;
            if (p.alive) p.angle = Math.atan2(point.y - p.y, point.x - p.x);
          }
        }
      } else if (e.type === 'touchend' || e.type === 'touchcancel') {
        for (const t of e.changedTouches) {
          if (this.moveTouch && t.identifier === this.moveTouch.id) this.moveTouch = null;
          if (this.fireTouch && t.identifier === this.fireTouch.id) {
            this.fireTouch = null;
            this.firing = false;
          }
          if (this.aimTouch && t.identifier === this.aimTouch.id) {
            if (this.aimTouch.moved < 8) {
              const p = this.player();
              if (p.alive && this.phase === 'live') {
                this.firing = true;
                this.triggerPulse = true;
                this.firing = false;
              }
            }
            this.aimTouch = null;
          }
        }
      }
    }
  }

  private clickBuyMenu(x: number, y: number) {
    const rect = this.buyMenuRect();
    if (x < rect.x || x > rect.x + rect.w || y < rect.y || y > rect.y + rect.h) return;
    const rowY = rect.y + 56;
    const rowH = 21;
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
    const rowY = rect.y + 56;
    const rowH = 21;
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
    const w = 400;
    const h = 246;
    return { x: (W - w) / 2, y: (H - h) / 2 - 10, w, h };
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
    const target = { x: this.aimX, y: this.aimY };
    const dir = Math.atan2(target.y - f.y, target.x - f.x);
    const dist = Math.hypot(target.x - f.x, target.y - f.y);
    const speed = Math.min(300, Math.max(120, dist * 1.4));
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
    shooter.recoil = Math.min(0.2, shooter.recoil + w.def.kick);
    shooter.muzzle = 0.055;

    const moveMul = shooter.moving ? (shooter.walk ? 1.35 : 1.9) : 1;
    const crouchMul = shooter.crouch ? 0.55 : 1;
    const spread = w.def.spread * moveMul * crouchMul + shooter.recoil * 0.55;

    const pellets = w.def.pellets;
    for (let p = 0; p < pellets; p++) {
      const a = angle + (Math.random() - 0.5) * 2 * spread;
      const dirX = Math.cos(a);
      const dirY = Math.sin(a);
      const wallDist = raycastWall(shooter.x, shooter.y, dirX, dirY, w.def.range);

      let best: Fighter | null = null;
      let bestT = wallDist;
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
          x1: shooter.x + dirX * 14,
          y1: shooter.y + dirY * 14,
          x2: best.x,
          y2: best.y,
          life: 0.07,
          maxLife: 0.07,
          color: '#ffe9a8',
        });
        const zone = rollHitZone(shooter.moving, shooter.crouch);
        this.damageFighter(best, shooter, w.def, zone, bestT);
      } else {
        this.tracers.push({
          x1: shooter.x + dirX * 14,
          y1: shooter.y + dirY * 14,
          x2: shooter.x + dirX * (wallDist - 2),
          y2: shooter.y + dirY * (wallDist - 2),
          life: 0.07,
          maxLife: 0.07,
          color: '#ffe9a8',
        });
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
    // Drop the active weapon, like CS.
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
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.4,
        maxLife: 0.4,
        size: 2 + Math.random() * 2,
        color: '#b3212e',
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
    if (!f.isBot && !f.crouch) this.sfx.footstep(false);
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
        this.finishRound(null);
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

    if (!p.alive) return;

    if (p.reloading) {
      p.reloadT -= dt;
      if (p.reloadT <= 0) this.finishReload(p);
    }

    let fx = 0;
    let fy = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) fy -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) fy += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) fx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) fx += 1;
    if (this.moveTouch) {
      fx = this.moveTouch.dx / 56;
      fy = this.moveTouch.dy / 56;
    }
    p.walk = this.keys.has('shift');
    p.crouch = this.keys.has('control') || this.keys.has('ctrl');
    const w = this.activeWeapon(p);
    const speed = (w ? w.def.speedUnits : 250) * SPEED_SCALE;
    this.moveFighter(p, fx, fy, dt, speed);

    if (this.firing || this.triggerPulse) {
      if (p.flashT <= 0 && !p.reloading && p.fireCd <= 0) {
        if (p.slot === 'nade') {
          if (this.triggerPulse) {
            this.triggerPulse = false;
            this.throwNade(p);
          }
        } else if (this.firing) {
          if (this.firing && p.fireCd <= 0) {
            const weapon = this.activeWeapon(p);
            if (weapon) {
              if (weapon.def.auto) {
                if (p.fireCd <= 0) this.fireShot(p, p.angle);
              } else if (this.triggerPulse) {
                this.triggerPulse = false;
                this.fireShot(p, p.angle);
              }
            }
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

    // Blinded bots wander slowly and hold fire.
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

    // Investigate last known position, then roam.
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
      case 'sniper': return 250;
      case 'rifle': return 185;
      case 'mg': return 160;
      case 'shotgun': return 55;
      case 'smg': return 105;
      default: return 95;
    }
  }

  private botCombat(bot: Fighter, target: Fighter, dt: number, speed: number) {
    const weapon = this.activeWeapon(bot);
    if (!weapon) return;
    const dx = target.x - bot.x;
    const dy = target.y - bot.y;
    const dist = Math.hypot(dx, dy);
    const targetAngle = Math.atan2(dy, dx);

    // Acquiring a target: aim error starts wide and settles.
    bot.aimErr = Math.max(0.02 + (1 - bot.skill) * 0.05, bot.aimErr - dt * (0.5 + bot.skill));

    let delta = targetAngle - bot.angle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    bot.angle += delta * Math.min(1, dt * 9);
    const aimOff = Math.abs(delta);

    // Movement: strafe and keep the weapon's preferred range.
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

    // Shooting.
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

  private botRoam(bot: Fighter, dt: number, speed: number) {
    bot.roamT -= dt;
    if (bot.roamT <= 0 || !bot.path || bot.pathI >= bot.path.length) {
      const roll = Math.random();
      let tx: number;
      let ty: number;
      if (roll < 0.45) {
        tx = (7.5 + Math.random()) * TILE;
        ty = (7.5 + Math.random()) * TILE;
      } else {
        const cx = bot.team === 'CT' ? 10.5 : 4.5;
        const spread = bot.team === 'CT' ? 1 : -1;
        tx = (cx + spread * Math.random() * 3) * TILE;
        ty = (Math.random() < 0.5 ? 3.5 : 11.5 + Math.random()) * TILE;
      }
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
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.5,
        maxLife: 0.5,
        size: 2 + Math.random() * 4,
        color: i % 3 === 0 ? '#f07b72' : i % 3 === 1 ? '#f5c46a' : '#ffffff',
      });
    }
    for (const f of this.fighters) {
      if (!f.alive) continue;
      const d = Math.hypot(f.x - g.x, f.y - g.y);
      if (d > 110) continue;
      if (!hasLineOfSight(g.x, g.y, f.x, f.y)) continue;
      const falloff = 1 - 0.75 * (d / 110);
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
      if (d > 160) continue;
      if (!hasLineOfSight(g.x, g.y, f.x, f.y)) continue;
      const facing = Math.cos(f.angle - Math.atan2(g.y - f.y, g.x - f.x));
      const strength = (facing > 0.35 ? 2.2 : 1.1) * (1 - d / 190);
      f.flashT = Math.max(f.flashT, Math.min(2.6, strength + 0.15));
    }
  }

  private popSmoke(g: Grenade) {
    this.sfx.smokePop();
    this.smokes.push({ x: g.x, y: g.y, r: 8, maxR: 44, life: 18, maxLife: 18 });
  }

  private updateFx(dt: number) {
    for (const tr of this.tracers) tr.life -= dt;
    this.tracers = this.tracers.filter((tr) => tr.life > 0);
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
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

  // ── Drawing ────────────────────────────────────────────────────────────────

  draw(ctx: CanvasRenderingContext2D) {
    this.drawMap(ctx);
    this.drawGround(ctx);
    for (const s of this.smokes) {
      ctx.fillStyle = 'rgba(190,196,204,0.5)';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    this.drawFighters(ctx);
    for (const g of this.grenades) {
      ctx.fillStyle = g.type === 'he' ? '#3a5f3a' : g.type === 'flash' ? '#c7ced9' : '#8a8f98';
      ctx.beginPath();
      ctx.arc(g.x, g.y, 4, 0, Math.PI * 2);
      ctx.fill();
      if (g.type === 'he' && g.fuse < 0.7 && Math.floor(g.fuse * 12) % 2 === 0) {
        ctx.fillStyle = '#f5c46a';
        ctx.beginPath();
        ctx.arc(g.x, g.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const tr of this.tracers) {
      ctx.globalAlpha = Math.max(0, tr.life / tr.maxLife) * 0.8;
      ctx.strokeStyle = tr.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(tr.x1, tr.y1);
      ctx.lineTo(tr.x2, tr.y2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
      ctx.globalAlpha = 1;
    }

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
      ctx.font = 'bold 28px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(zh ? '已暂停' : 'PAUSED', W / 2, H / 2 - 18);
      ctx.font = '14px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = 'rgba(241,245,249,0.8)';
      ctx.fillText(zh ? '按 P 继续' : 'PRESS P TO RESUME', W / 2, H / 2 + 18);
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

  private drawMap(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#0e1a26';
    ctx.fillRect(0, 0, W, H);
    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        const kind = ICEBERG_MAP[r][c];
        const x = c * TILE;
        const y = r * TILE;
        const shade = this.floorShades[r * MAP_COLS + c];
        if (kind === TileKind.Floor) {
          const leftHalf = c < 8;
          const base = leftHalf ? [207, 229, 246] : [233, 222, 219];
          ctx.fillStyle = `rgb(${Math.round(base[0] * shade)},${Math.round(base[1] * shade)},${Math.round(base[2] * shade)})`;
          ctx.fillRect(x, y, TILE, TILE);
        } else {
          const leftHalf = c < 8;
          const base = leftHalf ? [170, 205, 232] : [214, 183, 180];
          ctx.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.fillRect(x, y, TILE, 4);
          ctx.fillStyle = 'rgba(20,40,60,0.22)';
          ctx.fillRect(x, y + TILE - 3, TILE, 3);
        }
      }
    }
    // Team side markers.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 44px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = 'rgba(80,130,200,0.22)';
    ctx.fillText('CT', 3.75 * TILE, 8 * TILE);
    ctx.fillStyle = 'rgba(210,90,70,0.22)';
    ctx.fillText('T', 12.25 * TILE, 8 * TILE);

    // Center buyzone.
    ctx.fillStyle = 'rgba(255,210,74,0.14)';
    ctx.fillRect(BUY_ZONE_RECT.x, BUY_ZONE_RECT.y, BUY_ZONE_RECT.w, BUY_ZONE_RECT.h);
    ctx.strokeStyle = 'rgba(255,210,74,0.55)';
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(BUY_ZONE_RECT.x + 0.5, BUY_ZONE_RECT.y + 0.5, BUY_ZONE_RECT.w - 1, BUY_ZONE_RECT.h - 1);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,210,74,0.9)';
    ctx.font = 'bold 15px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('$', BUY_ZONE_RECT.x + BUY_ZONE_RECT.w / 2, BUY_ZONE_RECT.y + BUY_ZONE_RECT.h / 2 + 1);
  }

  private drawGround(ctx: CanvasRenderingContext2D) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    for (const item of this.ground) {
      if (item.kind === 'weapon' && item.weaponId) {
        ctx.save();
        ctx.translate(item.x, item.y);
        ctx.rotate(0.5);
        ctx.fillStyle = '#232a35';
        ctx.fillRect(-8, -2.5, 16, 5);
        ctx.fillStyle = '#39424f';
        ctx.fillRect(4, -1.5, 9, 3);
        ctx.fillStyle = '#4a3b2c';
        ctx.fillRect(1, 2.5, 3, 5);
        ctx.restore();
        ctx.fillStyle = 'rgba(15,23,42,0.55)';
        ctx.fillRect(item.x - 20, item.y - 26, 40, 12);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px ui-monospace, SFMono-Regular, monospace';
        ctx.fillText(WEAPON_SHORT[item.weaponId], item.x, item.y - 17);
      } else if (item.kind === 'nade' && item.nade) {
        ctx.fillStyle = item.nade === 'he' ? '#2f6b34' : item.nade === 'flash' ? '#c7ced9' : '#6f757f';
        ctx.beginPath();
        ctx.arc(item.x, item.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px ui-monospace, SFMono-Regular, monospace';
        ctx.fillText(item.nade === 'he' ? 'HE' : item.nade === 'flash' ? 'FLASH' : 'SMOKE', item.x, item.y - 9);
      }
    }
  }

  private drawFighters(ctx: CanvasRenderingContext2D) {
    const player = this.player();
    const spectator = !player.alive;

    // Sort so we draw the player on top.
    const drawOrder = [...this.fighters].sort((a, b) => (a === player ? 1 : 0) - (b === player ? 1 : 0));

    ctx.textBaseline = 'alphabetic';
    for (const f of drawOrder) {
      const isEnemy = f !== player && f.team !== player.team;
      // Hide enemies the player's team cannot currently see (fog of war).
      if (isEnemy && !spectator && !this.seenByTeam(f, player.team)) continue;
      if (!f.alive) {
        if (f.deadT > 2.2) continue;
        ctx.globalAlpha = Math.max(0, 1 - f.deadT / 2.2);
        ctx.fillStyle = f.team === 'CT' ? '#5a6f88' : '#7a5a52';
        ctx.beginPath();
        ctx.arc(f.x, f.y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(15,23,42,0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalAlpha = 1;
        continue;
      }
      const color = f.team === 'CT' ? (f === player ? '#4f8bff' : '#2f6ff2') : '#d94f43';
      const radius = f.crouch ? 9 : 11;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(f.x, f.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(12,20,32,0.65)';
      ctx.lineWidth = 2;
      ctx.stroke();
      if (f === player) {
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      // Aim direction + gun.
      const tipX = f.x + Math.cos(f.angle) * (radius + 8);
      const tipY = f.y + Math.sin(f.angle) * (radius + 8);
      ctx.strokeStyle = '#1c232d';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(f.x + Math.cos(f.angle) * radius * 0.4, f.y + Math.sin(f.angle) * radius * 0.4);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
      if (f.muzzle > 0) {
        ctx.fillStyle = 'rgba(255,224,130,0.95)';
        ctx.beginPath();
        ctx.arc(tipX, tipY, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      if (f.hitFlash > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.beginPath();
        ctx.arc(f.x, f.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      if (f.flashT > 0) {
        ctx.fillStyle = '#ffe9a8';
        ctx.font = 'bold 10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('!', f.x, f.y - radius - 8);
      }
      if (f.helmet) {
        ctx.strokeStyle = 'rgba(255,255,255,0.65)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(f.x, f.y, radius - 2, Math.PI, Math.PI * 2);
        ctx.stroke();
      }
      if (!f.isBot || spectator) {
        ctx.fillStyle = f === player ? '#ffffff' : 'rgba(240,245,255,0.85)';
        ctx.font = '10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(f === player ? 'YOU' : f.name, f.x, f.y - radius - 8);
      }
    }
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
    ctx.fillStyle = 'rgba(8,16,30,0.55)';
    ctx.fillRect(W / 2 - 96, 8, 192, 34);
    ctx.textAlign = 'left';
    ctx.font = `bold 15px ${font}`;
    ctx.fillStyle = '#7fb2ff';
    ctx.fillText(`CT ${this.ctWins}`, W / 2 - 88, 26);
    ctx.textAlign = 'center';
    ctx.font = `bold 18px ${mono}`;
    ctx.fillStyle = '#f5f5f0';
    ctx.fillText(timerText, W / 2, 26);
    ctx.textAlign = 'right';
    ctx.font = `bold 15px ${font}`;
    ctx.fillStyle = '#ff9a8a';
    ctx.fillText(`${this.tWins} T`, W / 2 + 88, 26);

    // Round / phase label.
    ctx.textAlign = 'center';
    ctx.font = `12px ${font}`;
    ctx.fillStyle = 'rgba(241,245,249,0.85)';
    const label = this.phase === 'freeze'
      ? (zh ? '冻结时间 · 购买区在地图中央' : 'FREEZE · BUYZONE IS IN THE CENTER')
      : this.phase === 'live' && this.liveT <= ROUND.buyTime
        ? (zh ? `购买时间 ${Math.ceil(ROUND.buyTime - this.liveT)}s · 购买区在地图中央` : `BUY TIME ${Math.ceil(ROUND.buyTime - this.liveT)}s · CENTER BUYZONE`)
        : this.phase === 'live'
          ? (zh ? `回合 ${this.round} · 先到 ${ROUND.winScore} 回合获胜` : `ROUND ${this.round} · FIRST TO ${ROUND.winScore}`)
          : '';
    ctx.fillText(label, W / 2, 52);

    if (this.liveMsg > 0) {
      ctx.font = `bold 24px ${font}`;
      ctx.fillStyle = `rgba(255,240,170,${Math.min(1, this.liveMsg)})`;
      ctx.fillText(zh ? '冲! 冲! 冲!' : 'GO GO GO!', W / 2, 92);
    }

    if (this.buyHintT > 0) {
      ctx.fillStyle = `rgba(255,210,74,${Math.min(1, this.buyHintT)})`;
      ctx.font = `bold 13px ${font}`;
      ctx.fillText(zh ? '购买区在地图中央!' : 'BUYZONE IS IN THE CENTER!', W / 2, 112);
    }

    // ── Kill feed (top right).
    ctx.textAlign = 'right';
    ctx.font = `11px ${font}`;
    this.feed.forEach((entry, i) => {
      ctx.globalAlpha = Math.min(1, entry.life);
      ctx.fillStyle = 'rgba(8,16,30,0.5)';
      const width = ctx.measureText(entry.text).width + 12;
      ctx.fillRect(W - width - 8, 10 + i * 17, width, 16);
      ctx.fillStyle = entry.color;
      ctx.fillText(entry.text, W - 14, 18 + i * 17);
      ctx.globalAlpha = 1;
    });

    // ── Radar (top left).
    this.drawRadar(ctx);

    // ── Bottom-left: health + armor.
    const p = this.player();
    const hpY = H - 24;
    ctx.fillStyle = '#e23b3b';
    ctx.fillRect(14, hpY - 8, 14, 14);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(18, hpY - 4, 6, 6);
    ctx.fillRect(16, hpY - 2, 10, 2);
    ctx.textAlign = 'left';
    ctx.font = `bold 22px ${mono}`;
    ctx.fillStyle = p.hp > 60 ? '#e8f4ff' : p.hp > 30 ? '#ffd24a' : '#ff6a5e';
    ctx.fillText(String(p.hp), 34, hpY + 1);
    ctx.fillStyle = '#7fa8d4';
    ctx.fillRect(74, hpY - 8, 12, 12);
    ctx.fillStyle = '#dbe9f7';
    ctx.fillRect(78, hpY - 5, 4, 6);
    ctx.font = `bold 15px ${mono}`;
    ctx.fillStyle = '#bcd4ec';
    ctx.fillText(String(p.armor), 92, hpY + 1);
    ctx.font = `11px ${font}`;
    ctx.fillStyle = 'rgba(241,245,249,0.75)';
    ctx.fillText(zh ? '护甲' : 'ARMOR', 92, hpY + 13);

    // ── Bottom-right: weapon name, ammo, money.
    const w = this.activeWeapon(p);
    ctx.textAlign = 'right';
    ctx.font = `bold 13px ${font}`;
    ctx.fillStyle = '#ffd24a';
    if (w) ctx.fillText(p.slot === 'nade' ? `${p.nadeSel.toUpperCase()} × ${p.nades[p.nadeSel]}` : w.def.name, W - 16, H - 48);
    ctx.font = `bold 19px ${mono}`;
    if (w && w.def.slot !== 'knife' && p.slot !== 'nade') {
      ctx.fillStyle = w.mag === 0 ? '#ff6a5e' : '#f5f5f0';
      ctx.fillText(`${w.mag} / ${w.reserve}`, W - 16, H - 26);
    }
    ctx.font = `bold 15px ${mono}`;
    ctx.fillStyle = '#8ee04d';
    ctx.fillText(`$${p.money}`, W - 16, H - 10);

    if (p.reloading && w) {
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(W - 130, H - 40, 114, 5);
      ctx.fillStyle = '#ffd24a';
      ctx.fillRect(W - 130, H - 40, 114 * Math.min(1, 1 - p.reloadT / w.def.reload), 5);
    }

    if (!this.sfx.enabled) {
      ctx.textAlign = 'left';
      ctx.font = `11px ${font}`;
      ctx.fillStyle = 'rgba(241,245,249,0.8)';
      ctx.fillText(zh ? '静音' : 'MUTED', 14, 78);
    }

    // ── Crosshair at the aim point.
    const spreadPx = this.crosshairGap();
    const cx = this.aimX;
    const cy = this.aimY;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - spreadPx - 7); ctx.lineTo(cx, cy - spreadPx - 1);
    ctx.moveTo(cx, cy + spreadPx + 1); ctx.lineTo(cx, cy + spreadPx + 7);
    ctx.moveTo(cx - spreadPx - 7, cy); ctx.lineTo(cx - spreadPx - 1, cy);
    ctx.moveTo(cx + spreadPx + 1, cy); ctx.lineTo(cx + spreadPx + 7, cy);
    ctx.stroke();
    ctx.strokeStyle = '#00e05a';
    ctx.lineWidth = 1;
    ctx.stroke();

    if (this.hitmarker > 0) {
      const a = this.hitmarker / 0.14;
      ctx.strokeStyle = this.hitmarkerKill ? `rgba(255,90,80,${a})` : `rgba(255,255,255,${a})`;
      ctx.lineWidth = 2;
      const r = 9;
      ctx.beginPath();
      ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx - r + 5, cy - r + 5);
      ctx.moveTo(cx - r, cy + r); ctx.lineTo(cx - r + 5, cy + r - 5);
      ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx + r - 5, cy - r + 5);
      ctx.moveTo(cx + r, cy + r); ctx.lineTo(cx + r - 5, cy + r - 5);
      ctx.stroke();
    }

    // ── Damage vignette.
    if (this.damageFlash > 0 || p.hp < 35) {
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
      ctx.fillStyle = 'rgba(8,16,30,0.6)';
      ctx.fillRect(0, H / 2 - 34, W, 68);
      ctx.textAlign = 'center';
      ctx.font = `bold 20px ${font}`;
      ctx.fillStyle = '#ff9a8a';
      ctx.fillText(zh ? '你阵亡了' : 'YOU WERE KILLED', W / 2, H / 2 - 14);
      ctx.font = `13px ${font}`;
      ctx.fillStyle = 'rgba(241,245,249,0.85)';
      ctx.fillText(zh ? '观战中 — 回合结束时自动进入下一回合' : 'SPECTATING — NEXT ROUND STARTS AUTOMATICALLY', W / 2, H / 2 + 12);
    }

    // ── Round result banner.
    if (this.phase === 'post' && !this.gameOver) {
      const text = this.roundDraw
        ? (zh ? '回合平局' : 'ROUND DRAW')
        : this.roundWinner === 'CT'
          ? (zh ? '反恐精英获胜!' : 'Counter-Terrorists Win!')
          : (zh ? '恐怖分子获胜!' : 'Terrorists Win!');
      const color = this.roundDraw ? '#ffd24a' : this.roundWinner === 'CT' ? '#7fb2ff' : '#ff9a8a';
      ctx.fillStyle = 'rgba(8,16,30,0.6)';
      ctx.fillRect(0, 118, W, 66);
      ctx.textAlign = 'center';
      ctx.font = `bold 24px ${font}`;
      ctx.fillStyle = color;
      ctx.fillText(text, W / 2, 142);
      ctx.font = `13px ${font}`;
      ctx.fillStyle = 'rgba(241,245,249,0.85)';
      ctx.fillText(zh ? `下一回合 ${Math.ceil(this.postTimer)}` : `NEXT ROUND ${Math.ceil(this.postTimer)}`, W / 2, 166);
    }
  }

  private crosshairGap(): number {
    const p = this.player();
    const w = this.activeWeapon(p);
    if (!w) return 6;
    const base = w.def.spread * 1300 + 2;
    const moving = p.moving && !p.walk ? 7 : p.moving ? 3.5 : 0;
    return base + moving + p.recoil * 140;
  }

  private drawRadar(ctx: CanvasRenderingContext2D) {
    const size = 84;
    const mx = 8;
    const my = 8;
    const scale = size / MAP_PIXEL;
    ctx.fillStyle = 'rgba(16,38,22,0.75)';
    ctx.fillRect(mx - 3, my - 3, size + 6, size + 6);
    ctx.fillStyle = 'rgba(160,200,170,0.35)';
    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        if (ICEBERG_MAP[r][c] !== TileKind.Wall) continue;
        ctx.fillRect(mx + c * TILE * scale, my + r * TILE * scale, TILE * scale - 0.4, TILE * scale - 0.4);
      }
    }
    ctx.strokeStyle = 'rgba(255,210,74,0.5)';
    ctx.strokeRect(
      mx + BUY_ZONE_RECT.x * scale,
      my + BUY_ZONE_RECT.y * scale,
      BUY_ZONE_RECT.w * scale,
      BUY_ZONE_RECT.h * scale,
    );

    const player = this.player();
    const spectator = !player.alive;
    for (const f of this.fighters) {
      if (!f.alive) continue;
      if (f.team === 'CT') {
        ctx.fillStyle = f === player ? '#ffffff' : '#6fa4f0';
        ctx.fillRect(mx + f.x * scale - 2, my + f.y * scale - 2, 4, 4);
      } else if (spectator || this.seenByTeam(f, 'CT')) {
        ctx.fillStyle = '#ff7a66';
        ctx.fillRect(mx + f.x * scale - 2, my + f.y * scale - 2, 4, 4);
      }
    }
    // Player heading wedge.
    ctx.save();
    ctx.translate(mx + player.x * scale, my + player.y * scale);
    ctx.rotate(player.angle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(4.5, 0);
    ctx.lineTo(-3, -3);
    ctx.lineTo(-1.5, 0);
    ctx.lineTo(-3, 3);
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
    ctx.font = `bold 18px ${font}`;
    ctx.fillStyle = '#ffd24a';
    ctx.fillText(zh ? '购买装备 (BUY EQUIPMENT)' : 'BUY EQUIPMENT', rect.x + rect.w / 2, rect.y + 20);
    ctx.font = `bold 13px ${mono}`;
    ctx.fillStyle = '#8ee04d';
    ctx.fillText(`$${p.money}`, rect.x + rect.w / 2, rect.y + 38);

    const rowY = rect.y + 56;
    const rowH = 21;
    const leftX = rect.x + 8;
    const rightX = rect.x + rect.w / 2 + 6;

    // Left: categories.
    BUY_CATEGORIES.forEach((category, i) => {
      const y = rowY + i * rowH;
      const hover = this.buyCat === -1 && this.hoverCat === i;
      const active = this.buyCat === i;
      ctx.fillStyle = active ? 'rgba(255,210,74,0.28)' : hover ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.03)';
      ctx.fillRect(leftX - 2, y - 9, rect.w / 2 - 10, rowH);
      ctx.textAlign = 'left';
      ctx.font = `13px ${font}`;
      ctx.fillStyle = active ? '#ffd24a' : '#e8eef5';
      ctx.fillText(`${i + 1}  ${zh ? category.labelZh : category.label}`, leftX + 6, y);
    });

    // Right: items of the selected category.
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.moveTo(rect.x + rect.w / 2, rect.y + 48);
    ctx.lineTo(rect.x + rect.w / 2, rect.y + rect.h - 8);
    ctx.stroke();

    if (this.buyCat >= 0) {
      const category = BUY_CATEGORIES[this.buyCat];
      const items = buyItemsForTeam(category, p.team);
      items.forEach((item, i) => {
        const y = rowY + i * rowH;
        const hover = this.hoverItem === i;
        const affordable = p.money >= item.price;
        ctx.fillStyle = hover ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.03)';
        ctx.fillRect(rightX - 2, y - 9, rect.w / 2 - 10, rowH);
        ctx.textAlign = 'left';
        ctx.font = `12px ${font}`;
        ctx.fillStyle = affordable ? '#e8eef5' : 'rgba(232,238,245,0.4)';
        ctx.fillText(`${i + 1}  ${item.name}`, rightX + 6, y);
        ctx.textAlign = 'right';
        ctx.font = `11px ${mono}`;
        ctx.fillStyle = affordable ? '#8ee04d' : 'rgba(142,224,77,0.4)';
        ctx.fillText(`$${item.price}`, rect.x + rect.w - 12, y);
      });
    }

    ctx.textAlign = 'center';
    ctx.font = `11px ${font}`;
    ctx.fillStyle = 'rgba(232,238,245,0.7)';
    ctx.fillText(
      zh ? '数字键选择 · B/ESC 关闭 · 0 返回' : 'NUMBER KEYS · B/ESC CLOSE · 0 BACK',
      rect.x + rect.w / 2,
      rect.y + rect.h - 12,
    );
  }

  private drawScoreboard(ctx: CanvasRenderingContext2D) {
    const font = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    const mono = 'ui-monospace, SFMono-Regular, monospace';
    const bw = 340;
    const bx = (W - bw) / 2;
    const by = 70;
    const bh = 252;
    ctx.fillStyle = 'rgba(8,16,30,0.92)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = 'rgba(255,210,74,0.5)';
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold 16px ${font}`;
    ctx.fillStyle = '#ffd24a';
    ctx.fillText(`CT ${this.ctWins} : ${this.tWins} T`, bx + bw / 2, by + 18);

    const cols: { team: Team; title: string; color: string; x: number }[] = [
      { team: 'CT', title: 'COUNTER-TERRORISTS', color: '#7fb2ff', x: bx + 18 },
      { team: 'T', title: 'TERRORISTS', color: '#ff9a8a', x: bx + bw / 2 + 10 },
    ];
    for (const col of cols) {
      ctx.textAlign = 'left';
      ctx.font = `bold 12px ${font}`;
      ctx.fillStyle = col.color;
      ctx.fillText(col.title, col.x, by + 38);
      const members = this.fighters.filter((f) => f.team === col.team);
      members.forEach((f, i) => {
        const y = by + 58 + i * 26;
        const dead = !f.alive;
        ctx.fillStyle = dead ? 'rgba(232,238,245,0.4)' : '#e8eef5';
        ctx.font = `12px ${font}`;
        ctx.fillText(f.name, col.x, y);
        ctx.font = `11px ${mono}`;
        ctx.textAlign = 'right';
        ctx.fillText(`${f.kills}/${f.deaths}`, col.x + 110, y);
        ctx.fillStyle = '#8ee04d';
        ctx.fillText(`$${f.money}`, col.x + 152, y);
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
      ctx.arc(this.moveTouch.ax, this.moveTouch.ay, 56, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.arc(this.moveTouch.ax + this.moveTouch.dx, this.moveTouch.ay + this.moveTouch.dy, 24, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(78, H - 78, 56, 0, Math.PI * 2);
      ctx.stroke();
    }
    const fireActive = !!this.fireTouch;
    ctx.fillStyle = fireActive ? 'rgba(240,90,80,0.75)' : 'rgba(240,90,80,0.4)';
    ctx.beginPath();
    ctx.arc(W - 62, H - 62, 44, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(zh ? '开火' : 'FIRE', W - 62, H - 62);
    ctx.fillStyle = 'rgba(57,197,187,0.4)';
    ctx.fillRect(W - 120, H - 148, 100, 26);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(zh ? '换弹 R' : 'RELOAD R', W - 70, H - 135);
  }
}
