// Iceberg Strike — a compact CS-style bomb-defusal FPS on the single Iceberg
// map. The engine is a HiDPI raycaster; the rules are round/economy/objective
// based (buy phase, A/B execute, plant, defuse, first-to-two) rather than an
// endless tower-defense wave loop.

import {
  BaseGame,
  createDefaultGameHost,
  type GameHost,
  type GameShellSnapshot,
} from '../core/game.js';
import { Sfx } from './icebergAudio.js';
import { getBombSprite, getSoldierFrames, getWallTexture } from './icebergAssets.js';
import {
  BOMB_SITES,
  MAP_COLS,
  MAP_ROWS,
  PLAYER_START,
  T_SPAWN_POINTS,
  TileKind,
  findMapPath,
  isSolidTile,
  tileKindAt,
  type BombSite,
} from './icebergMap.js';
import { castRay, hasLineOfSight } from './icebergRaycast.js';
import {
  ECONOMY,
  EQUIPMENT,
  ROUND,
  WEAPONS,
  applyDamage,
  clampMoney,
  computeDamage,
  lossMoney,
  matchScore,
  type HitZone,
  type WeaponDef,
  type WeaponId,
} from './icebergRules.js';

const W = 960;
const H = 540;
const HALF_FOV_TAN = Math.tan(((66 * Math.PI) / 180) / 2);
const MAX_DIST = 18;
const FOG_START = 7;
const PLAYER_RADIUS = 0.26;
const WALK_SPEED = 3.4;
const SPRINT_SPEED = 5.4;
const MAX_HP = ROUND.maxHp;
const MAX_ARMOR = ROUND.maxArmor;
const MOUSE_SENS = 0.0022;
const ATTACKERS_PER_ROUND = 4;
const BUY_TIME = ROUND.freezeTime;
const ROUND_TIME = ROUND.liveTime;
const POST_ROUND_TIME = ROUND.endTime;
const PLANT_TIME = ROUND.plantTime;
const DEFUSE_TIME = ROUND.defuseNoKit;
const DEFUSE_KIT_TIME = ROUND.defuseWithKit;
const BOMB_TIME = ROUND.bombTime;
// Browser sessions use a compact first-to-two set while keeping the CS rule
// model (buy/freeze, A/B execute, plant/defuse, armor, economy, headshots).
const ROUNDS_TO_WIN = 2;

type RoundPhase = 'buy' | 'live' | 'planted' | 'post' | 'matchOver';
type Team = 'CT' | 'T';
type AttackerState = 'advance' | 'plant' | 'guard' | 'engage';

interface RuntimeWeapon {
  id: WeaponId;
  key: string;
  def: WeaponDef;
  mag: number;
  reserve: number;
  owned: boolean;
}

interface Attacker {
  x: number;
  y: number;
  hp: number;
  state: AttackerState;
  site: BombSite;
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
  guardX: number;
  guardY: number;
  plantT: number;
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

interface SnowFlake {
  x: number;
  y: number;
  size: number;
  drift: number;
  speed: number;
}

interface BombState {
  planted: boolean;
  x: number;
  y: number;
  site: BombSite | null;
}

export class IcebergGame extends BaseGame {
  private px = PLAYER_START.x;
  private py = PLAYER_START.y;
  private angle = PLAYER_START.angle;
  private keys = new Set<string>();
  private hp: number = MAX_HP;
  private armor: number = 0;
  private hasHelmet = false;
  private hasKit = false;
  private weapons: RuntimeWeapon[] = [];
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
  private defuses = 0;
  private money: number = ECONOMY.startMoney;
  private round = 0;
  private ctWins = 0;
  private tWins = 0;
  private ctLossStreak: number = 0;
  private phase: RoundPhase = 'buy';
  private phaseTimer = BUY_TIME;
  private roundTimer = ROUND_TIME;
  private bombTimer = BOMB_TIME;
  private postTimer = 0;
  private roundWinner: Team | null = null;
  private roundReason = '';
  private roundReasonZh = '';
  private targetSite: BombSite = BOMB_SITES[0];
  private bomb: BombState = { planted: false, x: 0, y: 0, site: null };
  private defuseProgress = 0;
  private defusing = false;
  private bombBeepT = 0;

  private attackers: Attacker[] = [];
  private tracers: Tracer[] = [];
  private particles: Particle[] = [];
  private zBuffer = new Float32Array(480);
  private gameOver = false;
  private paused = false;
  private playerDead = false;
  private damageFlash = 0;
  private hitmarker = 0;
  private hitmarkerKill = false;
  private lookDrag: { lastX: number; lastY: number; moved: number } | null = null;
  private moveTouch: { id: number; ax: number; ay: number; dx: number; dy: number } | null = null;
  private lookTouch: { id: number; lastX: number; lastY: number } | null = null;
  private fireTouch: { id: number } | null = null;
  private reloadTouch: { id: number } | null = null;
  private defuseTouch: { id: number } | null = null;
  private touchMode = false;
  private readonly sfx = new Sfx();
  private readonly renderCanvas = document.createElement('canvas');
  private readonly renderCtx = this.renderCanvas.getContext('2d');
  private snow: SnowFlake[] = [];
  private hudStateCache = '';
  private boundBlur: (() => void) | null = null;
  private boundPointerLockChange: (() => void) | null = null;

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

  private makeWeapons(): RuntimeWeapon[] {
    const ids: WeaponId[] = ['usp', 'mp5', 'm4a1'];
    return ids.map((id, index) => {
      const def = WEAPONS[id];
      return {
        id,
        key: String(index + 1),
        def,
        mag: def.mag,
        reserve: def.reserve,
        owned: id === 'usp',
      };
    });
  }

  init() {
    this.px = PLAYER_START.x;
    this.py = PLAYER_START.y;
    this.angle = PLAYER_START.angle;
    this.keys.clear();
    this.hp = MAX_HP;
    this.armor = 0;
    this.hasHelmet = false;
    this.hasKit = false;
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
    this.defuses = 0;
    this.money = ECONOMY.startMoney;
    this.round = 0;
    this.ctWins = 0;
    this.tWins = 0;
    this.ctLossStreak = 0;
    this.attackers = [];
    this.tracers = [];
    this.particles = [];
    this.gameOver = false;
    this.paused = false;
    this.playerDead = false;
    this.damageFlash = 0;
    this.hitmarker = 0;
    this.hitmarkerKill = false;
    this.clearTransientInput();
    this.resetScoreReport();
    this.hudStateCache = '';
    this.bindLifecycleListeners();
    this.startRound();
    this.syncDebugState();
  }

  private bindLifecycleListeners() {
    if (!this.boundBlur) {
      this.boundBlur = () => this.clearTransientInput();
      window.addEventListener('blur', this.boundBlur);
      this.registerCleanup(() => {
        if (this.boundBlur) window.removeEventListener('blur', this.boundBlur);
        this.boundBlur = null;
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
    this.lookDrag = null;
    this.moveTouch = null;
    this.lookTouch = null;
    this.fireTouch = null;
    this.reloadTouch = null;
    this.defuseTouch = null;
    this.defusing = false;
  }

  private syncDebugState() {
    const alive = this.attackers.filter((a) => !a.dead).length;
    const key = `${this.round},${alive},${this.kills},${this.hp},${this.gameOver ? 1 : 0}`;
    if (key !== this.hudStateCache) {
      this.hudStateCache = key;
      this.canvas.dataset.icebergState = key;
    }
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

  // ── Rounds, economy, and the bomb ─────────────────────────────────────────

  private startRound() {
    const lostLoadout = this.playerDead || !this.weapons.some((w) => w.owned);
    this.round++;
    this.phase = 'buy';
    this.phaseTimer = BUY_TIME;
    this.roundTimer = ROUND_TIME;
    this.bombTimer = BOMB_TIME;
    this.postTimer = 0;
    this.roundWinner = null;
    this.roundReason = '';
    this.roundReasonZh = '';
    this.targetSite = BOMB_SITES[(this.round - 1) % BOMB_SITES.length];
    this.bomb = { planted: false, x: 0, y: 0, site: null };
    this.defuseProgress = 0;
    this.defusing = false;
    this.bombBeepT = 0;
    this.attackers = [];
    this.playerDead = false;
    this.px = PLAYER_START.x;
    this.py = PLAYER_START.y;
    this.angle = PLAYER_START.angle;
    this.hp = MAX_HP;
    this.fireCooldown = 0;
    this.recoil = 0;
    this.muzzle = 0;
    this.reloading = false;

    // CS-style death penalty: losing the previous round costs equipment.
    if (lostLoadout) {
      this.weapons.forEach((w, i) => {
        w.owned = i === 0;
        w.mag = w.def.mag;
        w.reserve = w.def.reserve;
      });
      this.weaponIndex = 0;
      this.armor = 0;
      this.hasHelmet = false;
      this.hasKit = false;
    } else {
      for (const w of this.weapons) {
        if (w.owned) {
          w.mag = w.def.mag;
          w.reserve = w.def.reserve;
        }
      }
      if (!this.weapon().owned) this.weaponIndex = 0;
    }
    this.syncDebugState();
  }

  private beginLiveRound() {
    this.phase = 'live';
    this.roundTimer = ROUND_TIME;
    this.clearTransientInput();
    this.spawnAttackers();
  }

  private spawnAttackers() {
    const offset = (this.round - 1) % T_SPAWN_POINTS.length;
    const speed = this.round === 1 ? 2.05 : 2.35;
    for (let i = 0; i < ATTACKERS_PER_ROUND; i++) {
      const spot = T_SPAWN_POINTS[(offset + i) % T_SPAWN_POINTS.length];
      this.attackers.push(this.makeAttacker(spot.x, spot.y, i * 0.28, speed));
    }
  }

  private makeAttacker(x: number, y: number, spawnT: number, speed: number): Attacker {
    return {
      x,
      y,
      hp: 100,
      state: 'advance',
      site: this.targetSite,
      dir: Math.random() * Math.PI * 2,
      speed,
      walkPhase: Math.random() * 10,
      hitFlash: 0,
      shootTimer: 0.8 + Math.random() * 1.2,
      burstLeft: 0,
      burstT: 0,
      strafeT: Math.random() * 2,
      strafeDir: Math.random() < 0.5 ? -1 : 1,
      repathT: 0,
      path: null,
      pathI: 0,
      guardX: this.targetSite.x + (Math.random() - 0.5) * 1.6,
      guardY: this.targetSite.y + (Math.random() - 0.5) * 1.6,
      plantT: 0,
      variant: Math.random() < 0.5 ? 0 : 1,
      flashT: 0,
      dead: false,
      deadT: 0,
      spawnT,
    };
  }

  private finishRound(winner: Team, reason: string, reasonZh: string) {
    if (this.phase === 'post' || this.phase === 'matchOver') return;
    this.roundWinner = winner;
    this.roundReason = reason;
    this.roundReasonZh = reasonZh;
    this.clearTransientInput();
    this.defusing = false;

    if (winner === 'CT') {
      this.ctWins++;
      this.ctLossStreak = 0;
      const income = reason === 'BOMB DEFUSED'
        ? ECONOMY.winDefuse
        : reason === 'TIME EXPIRED'
          ? ECONOMY.winTimeout
          : ECONOMY.winElimination;
      this.money = clampMoney(this.money + income);
      this.score += 500;
      this.sfx.roundWon();
    } else {
      this.tWins++;
      this.money = clampMoney(this.money + lossMoney(this.ctLossStreak));
      this.ctLossStreak++;
      this.sfx.roundLost();
    }

    if (this.ctWins >= ROUNDS_TO_WIN || this.tWins >= ROUNDS_TO_WIN) {
      this.phase = 'matchOver';
      this.gameOver = true;
      try {
        if (document.pointerLockElement === this.canvas) document.exitPointerLock();
      } catch {
        // best-effort
      }
      this.score = matchScore(this.kills, this.ctWins, this.ctWins >= ROUNDS_TO_WIN) + this.defuses * 300;
      this.submitScoreOnce(this.score);
    } else {
      this.phase = 'post';
      this.postTimer = POST_ROUND_TIME;
    }
    this.syncDebugState();
  }

  private plantBomb(attacker: Attacker) {
    this.bomb = { planted: true, x: attacker.x, y: attacker.y, site: attacker.site };
    this.phase = 'planted';
    this.bombTimer = BOMB_TIME;
    this.bombBeepT = 0;
    for (const other of this.attackers) {
      if (!other.dead) other.state = 'guard';
    }
    this.sfx.plant();
  }

  private explodeBomb() {
    this.spawnExplosion(this.bomb.x, this.bomb.y);
    this.finishRound('T', 'BOMB DETONATED', '炸弹引爆');
  }

  private spawnExplosion(wx: number, wy: number) {
    const proj = this.project(wx, wy - 0.6);
    if (!proj) return;
    for (let i = 0; i < 42; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 70 + Math.random() * 210;
      this.particles.push({
        x: proj.x,
        y: proj.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 80,
        life: 0.9,
        maxLife: 0.9,
        size: 2 + Math.random() * 5,
        color: i % 3 === 0 ? '#f07b72' : i % 3 === 1 ? '#f5c46a' : '#ffffff',
      });
    }
  }

  private updateDefuse(dt: number) {
    if (!this.bomb.planted || this.playerDead || this.phase !== 'planted') {
      this.defuseProgress = 0;
      this.defusing = false;
      return;
    }
    const wantsDefuse =
      this.keys.has('e') || this.keys.has('E') || this.defuseTouch !== null;
    const closeEnough = Math.hypot(this.bomb.x - this.px, this.bomb.y - this.py) <= 1.15;
    if (!wantsDefuse || !closeEnough) {
      this.defuseProgress = Math.max(0, this.defuseProgress - dt * 2);
      this.defusing = false;
      return;
    }
    this.defusing = true;
    this.defuseProgress += dt;
    if (this.defuseProgress >= (this.hasKit ? DEFUSE_KIT_TIME : DEFUSE_TIME)) {
      this.defuses++;
      this.score += 300;
      this.money = clampMoney(this.money + ECONOMY.defuseBonus);
      this.sfx.defuse();
      this.finishRound('CT', 'BOMB DEFUSED', '炸弹拆除');
    }
  }

  private buyItem(slot: number) {
    if (this.phase !== 'buy') return;
    const kevlarPrice = EQUIPMENT.find((item) => item.id === 'kevlar')?.price ?? 650;
    const helmetPrice = EQUIPMENT.find((item) => item.id === 'helmet')?.price ?? 1000;
    const kitPrice = EQUIPMENT.find((item) => item.id === 'kit')?.price ?? 400;
    const buyWeapon = (index: number) => {
      const w = this.weapons[index];
      if (w.owned) {
        this.weaponIndex = index;
        this.sfx.switchWeapon();
        return;
      }
      if (this.money < w.def.price) {
        this.sfx.denied();
        return;
      }
      this.money -= w.def.price;
      w.owned = true;
      w.mag = w.def.mag;
      w.reserve = w.def.reserve;
      this.weaponIndex = index;
      this.sfx.buy();
    };

    if (slot === 1) buyWeapon(0);
    else if (slot === 2) buyWeapon(1);
    else if (slot === 3) buyWeapon(2);
    else if (slot === 4) {
      if (this.armor >= MAX_ARMOR) return;
      if (this.money < kevlarPrice) {
        this.sfx.denied();
        return;
      }
      this.money -= kevlarPrice;
      this.armor = MAX_ARMOR;
      this.sfx.buy();
    } else if (slot === 5) {
      if (this.hasKit) return;
      if (this.money < kitPrice) {
        this.sfx.denied();
        return;
      }
      this.money -= kitPrice;
      this.hasKit = true;
      this.sfx.buy();
    } else if (slot === 6) {
      if (this.hasHelmet && this.armor >= MAX_ARMOR) return;
      if (this.money < helmetPrice) {
        this.sfx.denied();
        return;
      }
      this.money -= helmetPrice;
      this.armor = MAX_ARMOR;
      this.hasHelmet = true;
      this.sfx.buy();
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
          if (this.paused) {
            this.clearTransientInput();
            try {
              if (document.pointerLockElement === this.canvas) document.exitPointerLock();
            } catch {
              // best-effort pointer-lock release when pausing
            }
          }
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
            this.clearTransientInput();
          }
          return;
        }
        if (this.phase === 'buy') {
          const slot = Number(key);
          if (slot >= 1 && slot <= 6) this.buyItem(slot);
          return;
        }
        if (this.phase === 'post') return;
        if (key === 'r' || key === 'R') this.startReload();
        else if (key === '1') this.switchWeapon(0);
        else if (key === '2') this.switchWeapon(1);
        else if (key === '3') this.switchWeapon(2);
      }
      if (this.paused || this.gameOver || this.phase === 'buy' || this.phase === 'post') return;
      if (e.type === 'keydown') {
        this.keys.add(e.key);
        if (e.key === ' ') {
          this.firing = true;
          this.triggerPulse = !this.weapon().def.auto;
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
            const lockRequest = this.canvas.requestPointerLock();
            void lockRequest.catch(() => {});
          } catch {
            // pointer lock unavailable — drag-to-look fallback still works
          }
        }
        if (locked && this.phase !== 'buy' && this.phase !== 'post') {
          this.firing = true;
          this.triggerPulse = !this.weapon().def.auto;
        }
      } else if (e.type === 'mouseup' && e.button === 0) {
        const drag = this.lookDrag;
        this.lookDrag = null;
        if (
          document.pointerLockElement !== this.canvas &&
          drag &&
          drag.moved < 6 &&
          this.phase !== 'buy' &&
          this.phase !== 'post'
        ) {
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
          if (this.phase === 'buy') {
            const menuX = this.width / 2 - 230;
            const menuY = 108;
            if (p.x >= menuX && p.x <= menuX + 460 && p.y >= menuY && p.y <= menuY + 236) {
              const row = Math.floor((p.y - (menuY + 82)) / 25);
              if (row >= 0 && row < 6) this.buyItem(row + 1);
              continue;
            }
          }
          const fireHit = Math.hypot(p.x - (this.width - 88), p.y - (this.height - 84)) <= 50;
          const reloadHit = Math.hypot(p.x - (this.width - 88), p.y - (this.height - 164)) <= 38;
          const defuseHit = this.bomb.planted && Math.hypot(p.x - (this.width - 190), p.y - (this.height - 84)) <= 42;
          if (p.x < this.width * 0.45) {
            if (!this.moveTouch) {
              this.moveTouch = { id: t.identifier, ax: p.x, ay: p.y, dx: 0, dy: 0 };
            }
          } else if (defuseHit) {
            this.defuseTouch = { id: t.identifier };
          } else if (reloadHit) {
            this.reloadTouch = { id: t.identifier };
            this.startReload();
          } else if (fireHit) {
            if (this.phase !== 'buy' && this.phase !== 'post') {
              this.fireTouch = { id: t.identifier };
              this.firing = true;
              this.triggerPulse = !this.weapon().def.auto;
            }
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
          if (this.moveTouch && t.identifier === this.moveTouch.id) this.moveTouch = null;
          if (this.lookTouch && t.identifier === this.lookTouch.id) this.lookTouch = null;
          if (this.fireTouch && t.identifier === this.fireTouch.id) {
            this.fireTouch = null;
            this.firing = false;
          }
          if (this.reloadTouch && t.identifier === this.reloadTouch.id) this.reloadTouch = null;
          if (this.defuseTouch && t.identifier === this.defuseTouch.id) this.defuseTouch = null;
        }
      }
    }
  }

  // ── Weapons ───────────────────────────────────────────────────────────────

  private weapon(): RuntimeWeapon {
    if (!this.weapons[this.weaponIndex]?.owned) return this.weapons[0];
    return this.weapons[this.weaponIndex];
  }

  private startReload() {
    const w = this.weapon();
    if (this.reloading || this.gameOver || this.paused) return;
    if (this.phase !== 'live' && this.phase !== 'planted') return;
    if (w.mag >= w.def.mag || w.reserve <= 0) {
      if (w.reserve <= 0 && w.mag === 0) this.sfx.empty();
      return;
    }
    this.reloading = true;
    this.reloadT = w.def.reload;
    this.triggerPulse = false;
    this.sfx.reload();
  }

  private switchWeapon(index: number) {
    if (this.paused || this.gameOver) return;
    if (this.phase !== 'live' && this.phase !== 'planted') return;
    if (index === this.weaponIndex) return;
    if (!this.weapons[index]?.owned) {
      this.sfx.denied();
      return;
    }
    this.weaponIndex = index;
    this.reloading = false;
    this.reloadT = 0;
    this.sfx.switchWeapon();
  }

  private tryFire() {
    if (this.gameOver || this.paused || this.reloading || this.playerDead) return;
    if (this.phase !== 'live' && this.phase !== 'planted') return;
    const w = this.weapon();
    if (this.fireCooldown > 0) return;
    if (w.mag <= 0) {
      this.sfx.empty();
      if (w.reserve > 0) this.startReload();
      this.fireCooldown = 0.25;
      return;
    }
    w.mag--;
    this.fireCooldown = w.def.rate;
    this.recoil = Math.min(1, this.recoil + w.def.kick);
    this.muzzle = 0.055;
    const spread = (this.moving ? w.def.spreadMove : w.def.spreadStand) + this.recoil * 0.6;
    const shotAngle = this.angle + (Math.random() - 0.5) * 2 * spread;
    const dirX = Math.cos(shotAngle);
    const dirY = Math.sin(shotAngle);
    const hit = castRay(this.px, this.py, dirX, dirY, MAX_DIST);

    let bestEnemy: Attacker | null = null;
    let bestT = hit.dist;
    for (const attacker of this.attackers) {
      if (attacker.dead || attacker.spawnT > 0) continue;
      const dx = attacker.x - this.px;
      const dy = attacker.y - this.py;
      const t = dx * dirX + dy * dirY;
      const perp = Math.abs(dx * dirY - dy * dirX);
      if (t > 0.2 && t < bestT && perp < 0.34) {
        bestEnemy = attacker;
        bestT = t;
      }
    }

    if (bestEnemy) {
      const zone = this.rollHitZone(bestT);
      const damage = computeDamage(w.def, zone, bestT, 0, false);
      bestEnemy.hp -= damage.dmg;
      bestEnemy.hitFlash = 0.12;
      bestEnemy.state = 'engage';
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
      if (zone === 'head') this.sfx.headshot();
      else this.sfx.hit();
      if (bestEnemy.hp <= 0) this.killAttacker(bestEnemy, w.def);
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

  private killAttacker(attacker: Attacker, weapon: WeaponDef) {
    attacker.dead = true;
    attacker.deadT = 0;
    this.kills++;
    this.score += 150;
    this.money = clampMoney(this.money + weapon.killReward);
    this.hitmarker = 0.2;
    this.hitmarkerKill = true;
    const proj = this.project(attacker.x, attacker.y - 0.8);
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

  private rollHitZone(dist: number): HitZone {
    const accuracy = this.moving ? 0.08 : 0.18;
    const legChance = this.moving ? 0.18 : 0.1;
    const roll = Math.random();
    if (dist < 14 && roll < accuracy) return 'head';
    if (roll > 1 - legChance) return 'legs';
    return 'body';
  }

  private hurtPlayer(dmg: number, armorDmg: number, fromX: number, fromY: number) {
    if (this.playerDead || this.gameOver) return;
    const result = applyDamage(this.hp, this.armor, dmg, armorDmg);
    this.armor = result.armor;
    this.hp = result.hp;
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
      this.playerDead = true;
      this.clearTransientInput();
      this.finishRound('T', 'CT ELIMINATED', 'CT 阵亡');
    }
    this.syncDebugState();
  }

  // ── Attackers ─────────────────────────────────────────────────────────────

  private updateAttacker(attacker: Attacker, dt: number) {
    if (attacker.spawnT > 0) {
      attacker.spawnT -= dt;
      return;
    }
    if (attacker.dead) {
      attacker.deadT += dt;
      return;
    }
    attacker.hitFlash = Math.max(0, attacker.hitFlash - dt);
    attacker.flashT = Math.max(0, attacker.flashT - dt);

    const dx = this.px - attacker.x;
    const dy = this.py - attacker.y;
    const dist = Math.hypot(dx, dy);
    const canSeePlayer =
      !this.playerDead && dist < 13 && hasLineOfSight(attacker.x, attacker.y, this.px, this.py);
    const siteDistance = Math.hypot(attacker.site.x - attacker.x, attacker.site.y - attacker.y);

    if (canSeePlayer) {
      attacker.state = 'engage';
      attacker.plantT = Math.max(0, attacker.plantT - dt);
    } else if (this.bomb.planted) {
      attacker.state = 'guard';
    } else if (siteDistance <= attacker.site.radius * 0.7) {
      attacker.state = 'plant';
    } else {
      attacker.state = 'advance';
    }

    if (attacker.state === 'engage') {
      this.faceToward(attacker, this.px, this.py, dt, 7);
      attacker.strafeT -= dt;
      if (attacker.strafeT <= 0) {
        attacker.strafeT = 1.2 + Math.random() * 1.8;
        attacker.strafeDir = Math.random() < 0.5 ? -1 : 1;
      }
      if (dist > 5.5) {
        attacker.repathT -= dt;
        if (attacker.repathT <= 0) {
          attacker.repathT = 0.35;
          attacker.path = findMapPath(attacker.x, attacker.y, this.px, this.py);
          attacker.pathI = 0;
        }
        this.followPath(attacker, dt, attacker.speed * 0.7);
      } else {
        const strafeDx = Math.sin(attacker.dir) * attacker.strafeDir * 0.3;
        const strafeDy = -Math.cos(attacker.dir) * attacker.strafeDir * 0.3;
        if (hasLineOfSight(attacker.x + strafeDx, attacker.y + strafeDy, this.px, this.py)) {
          this.moveAttacker(attacker, attacker.x + strafeDx, attacker.y + strafeDy, dt, 1.2);
        }
      }
      this.updateAttackerFire(attacker, dist, dt);
      return;
    }

    if (attacker.state === 'plant') {
      this.faceToward(attacker, attacker.site.x, attacker.site.y, dt, 5);
      attacker.plantT += dt;
      if (attacker.plantT >= PLANT_TIME) this.plantBomb(attacker);
      return;
    }

    if (attacker.state === 'guard') {
      const targetX = this.bomb.planted ? this.bomb.x : attacker.guardX;
      const targetY = this.bomb.planted ? this.bomb.y : attacker.guardY;
      const guardDist = Math.hypot(targetX - attacker.x, targetY - attacker.y);
      if (guardDist > 1.2) {
        attacker.repathT -= dt;
        if (attacker.repathT <= 0) {
          attacker.repathT = 0.45;
          attacker.path = findMapPath(attacker.x, attacker.y, targetX, targetY);
          attacker.pathI = 0;
        }
        this.followPath(attacker, dt, attacker.speed * 0.75);
      } else {
        this.faceToward(attacker, this.px, this.py, dt, 3);
      }
      if (canSeePlayer && dist < 13) this.updateAttackerFire(attacker, dist, dt);
      return;
    }

    attacker.repathT -= dt;
    if (attacker.repathT <= 0) {
      attacker.repathT = 0.35;
      attacker.path = findMapPath(attacker.x, attacker.y, attacker.site.x, attacker.site.y);
      attacker.pathI = 0;
    }
    this.followPath(attacker, dt, attacker.speed);
  }

  private updateAttackerFire(attacker: Attacker, dist: number, dt: number) {
    attacker.shootTimer -= dt;
    if (attacker.shootTimer <= 0 && dist < 13) {
      attacker.burstLeft = this.round <= 1 ? 2 : 3;
      attacker.burstT = 0;
      attacker.shootTimer = 999;
    }
    if (attacker.burstLeft > 0) {
      attacker.burstT -= dt;
      if (attacker.burstT <= 0) {
        attacker.burstLeft--;
        attacker.burstT = this.round <= 1 ? 0.22 : 0.18;
        this.attackerShoot(attacker, dist);
        if (attacker.burstLeft <= 0) {
          attacker.shootTimer = this.round <= 1 ? 1.2 + Math.random() * 0.8 : 1.0 + Math.random() * 0.7;
        }
      }
    }
  }

  private faceToward(entity: { dir: number; x: number; y: number }, tx: number, ty: number, dt: number, turnSpeed: number) {
    const targetAngle = Math.atan2(ty - entity.y, tx - entity.x);
    let delta = targetAngle - entity.dir;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    entity.dir += delta * Math.min(1, dt * turnSpeed);
  }

  private followPath(attacker: Attacker, dt: number, speed: number) {
    if (!attacker.path || attacker.pathI >= attacker.path.length) return;
    const wp = attacker.path[attacker.pathI];
    const dx = wp.x - attacker.x;
    const dy = wp.y - attacker.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.1) {
      attacker.pathI++;
      return;
    }
    this.faceToward(attacker, wp.x, wp.y, dt, 6);
    this.moveAttacker(
      attacker,
      attacker.x + (dx / d) * speed * dt,
      attacker.y + (dy / d) * speed * dt,
      dt,
      speed,
    );
  }

  private moveAttacker(attacker: Attacker, nx: number, ny: number, dt: number, speed: number) {
    const r = 0.3;
    let moved = false;
    if (!this.solidCircle(nx, attacker.y, r)) {
      attacker.x = nx;
      moved = true;
    }
    if (!this.solidCircle(attacker.x, ny, r)) {
      attacker.y = ny;
      moved = true;
    }
    for (const other of this.attackers) {
      if (other === attacker || other.dead) continue;
      const ddx = attacker.x - other.x;
      const ddy = attacker.y - other.y;
      const d = Math.hypot(ddx, ddy);
      if (d > 0.001 && d < 0.45) {
        const push = ((0.55 - d) / 0.55) * 0.6;
        const pushX = (ddx / d) * push * dt * 4;
        const pushY = (ddy / d) * push * dt * 4;
        if (!this.solidCircle(attacker.x + pushX, attacker.y, r)) attacker.x += pushX;
        if (!this.solidCircle(attacker.x, attacker.y + pushY, r)) attacker.y += pushY;
      }
    }
    const pdx = attacker.x - this.px;
    const pdy = attacker.y - this.py;
    const pd = Math.hypot(pdx, pdy);
    if (pd > 0.001 && pd < 0.7) {
      const push = ((0.7 - pd) / 0.7) * 0.5;
      const pushX = (pdx / pd) * push * dt * 4;
      const pushY = (pdy / pd) * push * dt * 4;
      if (!this.solidCircle(attacker.x + pushX, attacker.y, r)) attacker.x += pushX;
      if (!this.solidCircle(attacker.x, attacker.y + pushY, r)) attacker.y += pushY;
    }
    if (moved) attacker.walkPhase += speed * dt * 2.6;
  }

  private attackerShoot(attacker: Attacker, dist: number) {
    if (this.playerDead || (this.phase !== 'live' && this.phase !== 'planted')) return;
    attacker.flashT = 0.09;
    const movingPenalty = this.moving ? 1 : this.round === 1 ? 0.7 : 0.85;
    const spread = (0.05 + dist * 0.006) * movingPenalty;
    const ang = Math.atan2(this.py - attacker.y, this.px - attacker.x) + (Math.random() - 0.5) * 2 * spread;
    const dirX = Math.cos(ang);
    const dirY = Math.sin(ang);
    const dx = this.px - attacker.x;
    const dy = this.py - attacker.y;
    const t = dx * dirX + dy * dirY;
    const perp = Math.abs(dx * dirY - dy * dirX);
    const wall = castRay(attacker.x, attacker.y, dirX, dirY, dist + 0.4);
    if (t > 0 && perp < 0.3 && wall.dist >= dist - 0.2) {
      const weapon = WEAPONS[this.round === 1 ? 'glock' : 'ak47'];
      const zone: HitZone = Math.random() < 0.12 ? 'head' : 'body';
      const damage = computeDamage(weapon, zone, dist, this.armor, this.hasHelmet);
      this.hurtPlayer(damage.dmg, damage.armorDmg, attacker.x, attacker.y);
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
    if (this.playerDead || this.phase !== 'live' && this.phase !== 'planted') {
      this.moving = false;
      return;
    }
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
    if (this.paused || this.gameOver) return;

    this.updateFx(dt);

    if (this.phase === 'buy') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) this.beginLiveRound();
      this.syncDebugState();
      return;
    }

    if (this.phase === 'post') {
      this.postTimer -= dt;
      if (this.postTimer <= 0) this.startRound();
      this.syncDebugState();
      return;
    }

    if (this.phase === 'live') {
      this.roundTimer -= dt;
      if (this.roundTimer <= 0) {
        this.finishRound('CT', 'TIME EXPIRED', '时间耗尽');
        return;
      }
    } else if (this.phase === 'planted') {
      this.bombTimer -= dt;
      this.bombBeepT -= dt;
      if (this.bombBeepT <= 0) {
        this.bombBeepT = Math.max(0.28, this.bombTimer / BOMB_TIME);
        this.sfx.bombBeep();
      }
      if (this.bombTimer <= 0) {
        this.explodeBomb();
        return;
      }
    }

    this.movePlayer(dt);
    this.updateWeapon(dt);
    for (const attacker of this.attackers) this.updateAttacker(attacker, dt);
    this.attackers = this.attackers.filter((a) => !(a.dead && a.deadT > 1.6));
    this.updateDefuse(dt);

    if (this.phase === 'live' && this.attackers.length > 0 && this.attackers.every((a) => a.dead)) {
      this.finishRound('CT', 'T SIDE ELIMINATED', 'T 全部消灭');
    }

    this.damageFlash = Math.max(0, this.damageFlash - dt * 0.9);
    this.hitmarker = Math.max(0, this.hitmarker - dt);
    this.syncDebugState();
  }

  private updateWeapon(dt: number) {
    this.fireCooldown -= dt;
    this.recoil = Math.max(0, this.recoil - dt * 0.28);
    this.muzzle = Math.max(0, this.muzzle - dt);
    if (this.reloading) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const w = this.weapon();
        const need = w.def.mag - w.mag;
        const take = Math.min(need, w.reserve);
        w.mag += take;
        w.reserve -= take;
        this.reloading = false;
      }
    } else if (this.fireCooldown <= 0) {
      const w = this.weapon();
      if (w.def.auto && this.firing) {
        this.tryFire();
      } else if (!w.def.auto && this.triggerPulse) {
        this.triggerPulse = false;
        this.tryFire();
      }
    }
  }

  private updateFx(dt: number) {
    for (const tr of this.tracers) tr.life -= dt;
    this.tracers = this.tracers.filter((tr) => tr.life > 0);
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 160 * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
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

    interface SpriteItem {
      depth: number;
      x: number;
      y: number;
      tex: HTMLCanvasElement;
      scale: number;
      ground: boolean;
      flash?: boolean;
      flashX?: number;
    }
    const sprites: SpriteItem[] = [];
    if (this.bomb.planted) {
      sprites.push({ depth: 0, x: this.bomb.x, y: this.bomb.y - 0.28, tex: getBombSprite(), scale: 0.5, ground: false });
    }
    for (const attacker of this.attackers) {
      if (attacker.spawnT > 0) continue;
      const soldier = getSoldierFrames('T', attacker.variant);
      if (attacker.dead) {
        sprites.push({ depth: 0, x: attacker.x, y: attacker.y, tex: soldier.dead, scale: 1, ground: true });
        continue;
      }
      let frame: HTMLCanvasElement;
      if (attacker.flashT > 0) {
        frame = soldier.frames[3];
      } else if (attacker.state === 'plant') {
        frame = soldier.frames[0];
      } else {
        const step = Math.floor(attacker.walkPhase) % 2;
        frame = soldier.frames[step === 0 ? 1 : 2];
      }
      sprites.push({
        depth: 0,
        x: attacker.x,
        y: attacker.y - 0.45,
        tex: frame,
        scale: 1,
        ground: false,
        flash: attacker.flashT > 0,
      });
    }

    for (const sp of sprites) {
      const dx = sp.x - this.px;
      const dy = sp.y - this.py;
      const invDet = 1 / (planeX * dirY - dirX * planeY);
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
      const spriteH = Math.max(2, (rh / ty) * sp.scale);
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

    ctx.imageSmoothingEnabled = !pixel;
    ctx.drawImage(this.renderCanvas, 0, 0, rw, rh, 0, 0, W, H);

    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    for (const flake of this.snow) {
      ctx.fillRect(flake.x, flake.y, flake.size, flake.size);
    }

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

    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    this.drawViewmodel(ctx);
    this.drawHud(ctx, pixel);
    if (this.phase === 'buy') this.drawBuyMenu(ctx);
    if (this.phase === 'post') this.drawRoundResult(ctx);

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
      const won = this.ctWins >= ROUNDS_TO_WIN;
      this.drawResultOverlay(ctx, {
        title: won ? (zh ? '任务完成' : 'MISSION COMPLETE') : (zh ? '任务失败' : 'MISSION FAILED'),
        tone: won ? 'success' : 'danger',
        details: [
          `${zh ? '比分' : 'SCORE'} CT ${this.ctWins} : ${this.tWins} T`,
          `${zh ? '击杀' : 'KILLS'} ${this.kills}    ${zh ? '拆弹' : 'DEFUSES'} ${this.defuses}`,
          `${zh ? '得分' : 'POINTS'} ${this.score}`,
        ],
        hint: zh ? '点击或按空格重新开始' : 'CLICK OR PRESS SPACE',
      });
      return;
    }

    if (this.touchMode && !this.paused) this.drawTouchControls(ctx);
  }

  private drawViewmodel(ctx: CanvasRenderingContext2D) {
    if (this.gameOver || this.playerDead || this.phase === 'post') return;
    const bobY = this.moving ? Math.sin(this.walkPhase) * 5 : 0;
    const swayX = this.moving ? Math.cos(this.walkPhase * 0.5) * 6 : 0;
    ctx.save();
    ctx.translate(W / 2 + 46 + swayX, H + 34);
    ctx.rotate(-0.44 - this.recoil * 0.9);
    ctx.translate(0, -bobY);

    const w = this.weapon();
    const body = w.id === 'usp' ? '#2b3038' : w.id === 'mp5' ? '#263746' : '#222a34';
    const barrel = w.id === 'm4a1' ? 285 : w.id === 'mp5' ? 240 : 180;
    ctx.fillStyle = body;
    ctx.fillRect(-30, -26, 110, 30);
    ctx.fillStyle = '#1e232b';
    ctx.fillRect(40, -18, barrel, 20);
    ctx.fillStyle = '#333a45';
    ctx.fillRect(8, -12, 40, 52);
    ctx.fillStyle = '#232830';
    ctx.fillRect(-44, -30, 22, 34);

    ctx.fillStyle = '#d9a06f';
    ctx.beginPath();
    ctx.arc(52, 1, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(Math.min(176, barrel + 20), -6, 12, 0, Math.PI * 2);
    ctx.fill();

    if (this.muzzle > 0) {
      const size = 16 + this.muzzle * 320;
      ctx.fillStyle = 'rgba(255,224,130,0.95)';
      ctx.beginPath();
      ctx.arc(barrel + 44, -8, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,246,214,0.95)';
      ctx.beginPath();
      ctx.arc(barrel + 44, -8, size * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawHud(ctx: CanvasRenderingContext2D, pixel: boolean) {
    const zh = this.isZhLang();
    const font = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textBaseline = 'middle';

    // Top scoreboard / round timer.
    const timerText = this.phase === 'buy'
      ? `${Math.ceil(this.phaseTimer)}`
      : this.phase === 'planted'
        ? `${Math.ceil(this.bombTimer)}`
        : `${Math.ceil(this.roundTimer)}`;
    ctx.fillStyle = 'rgba(8,16,30,0.62)';
    ctx.fillRect(W / 2 - 170, 10, 340, 54);
    ctx.textAlign = 'center';
    ctx.font = `bold 18px ${font}`;
    ctx.fillStyle = '#8fd8ff';
    ctx.fillText(`CT ${this.ctWins}`, W / 2 - 122, 30);
    ctx.fillStyle = this.phase === 'planted' ? '#f07b72' : '#f1f5f9';
    ctx.fillText(timerText, W / 2, 30);
    ctx.fillStyle = '#f5c46a';
    ctx.fillText(`${this.tWins} T`, W / 2 + 122, 30);
    ctx.font = `12px ${font}`;
    ctx.fillStyle = 'rgba(241,245,249,0.78)';
    const phaseText = this.phase === 'buy'
      ? (zh ? '购买阶段' : 'BUY PHASE')
      : this.phase === 'planted'
        ? (zh ? `炸弹已安放 · ${this.bomb.site?.id ?? ''}` : `BOMB PLANTED · ${this.bomb.site?.id ?? ''}`)
        : (zh ? `${this.targetSite.id} 点执行` : `${this.targetSite.id} SITE EXECUTE`);
    ctx.fillText(phaseText, W / 2, 52);

    // Top-left match info.
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(8,16,30,0.55)';
    ctx.fillRect(12, 12, 174, 66);
    ctx.fillStyle = '#f1f5f9';
    ctx.font = `bold 16px ${font}`;
    ctx.fillText(`$${this.money}`, 22, 28);
    ctx.font = `13px ${font}`;
    ctx.fillStyle = 'rgba(241,245,249,0.75)';
    ctx.fillText(`${zh ? '回合' : 'ROUND'} ${this.round}   ${zh ? '击杀' : 'KILLS'} ${this.kills}`, 22, 50);
    ctx.fillText(`${zh ? '先到' : 'FIRST TO'} ${ROUNDS_TO_WIN}   ${zh ? '拆弹' : 'DEFUSES'} ${this.defuses}`, 22, 68);

    if (this.phase === 'live') {
      const alive = this.attackers.filter((a) => !a.dead).length;
      ctx.font = `12px ${font}`;
      ctx.fillStyle = 'rgba(241,245,249,0.8)';
      ctx.textAlign = 'center';
      ctx.fillText(zh ? `T 存活 ${alive}` : `T ALIVE ${alive}`, W / 2, 78);
    }

    // Objective / plant / defuse prompts.
    if (this.phase === 'live') {
      const planter = this.attackers.find((a) => !a.dead && a.plantT > 0);
      if (planter) {
        const pct = Math.min(1, planter.plantT / PLANT_TIME);
        this.drawCenterProgress(ctx, zh ? '正在安放炸弹' : 'PLANTING BOMB', pct, '#f07b72');
      }
    }
    if (this.phase === 'planted' && this.bomb.planted) {
      const dist = Math.hypot(this.bomb.x - this.px, this.bomb.y - this.py);
      if (dist <= 1.15) {
        this.drawCenterProgress(
          ctx,
          zh ? (this.hasKit ? '按住 E 拆弹 · 拆弹器' : '按住 E 拆弹') : (this.hasKit ? 'HOLD E · KIT' : 'HOLD E TO DEFUSE'),
          this.defuseProgress / (this.hasKit ? DEFUSE_KIT_TIME : DEFUSE_TIME),
          '#39C5BB',
        );
      } else {
        ctx.textAlign = 'center';
        ctx.font = `bold 15px ${font}`;
        ctx.fillStyle = '#f5c46a';
        ctx.fillText(zh ? `前往 ${this.bomb.site?.id} 点拆弹` : `GO TO ${this.bomb.site?.id} TO DEFUSE`, W / 2, 104);
      }
    }

    this.drawMinimap(ctx);

    // Bottom-left vitals.
    const hpX = 16;
    const hpY = H - 66;
    ctx.fillStyle = 'rgba(8,16,30,0.58)';
    ctx.fillRect(hpX - 6, hpY - 6, 218, 58);
    ctx.textAlign = 'left';
    ctx.font = `bold 18px ${font}`;
    const hpColor = this.hp > 60 ? '#5ee08a' : this.hp > 30 ? '#f5c46a' : '#f07b72';
    ctx.fillStyle = hpColor;
    ctx.fillText(String(this.hp), hpX + 2, hpY + 13);
    ctx.font = `12px ${font}`;
    ctx.fillStyle = 'rgba(241,245,249,0.75)';
    ctx.fillText(zh ? '生命' : 'HP', hpX + 40, hpY + 13);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(hpX, hpY + 25, 198, 8);
    ctx.fillStyle = hpColor;
    ctx.fillRect(hpX, hpY + 25, 198 * (this.hp / MAX_HP), 8);
    ctx.font = `bold 14px ${font}`;
    ctx.fillStyle = '#8fb3d6';
    ctx.fillText(String(this.armor), hpX + 2, hpY + 43);
    ctx.font = `12px ${font}`;
    ctx.fillStyle = 'rgba(241,245,249,0.75)';
    ctx.fillText(zh ? '护甲' : 'ARMOR', hpX + 34, hpY + 43);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(hpX, hpY + 52, 198, 5);
    ctx.fillStyle = '#8fb3d6';
    ctx.fillRect(hpX, hpY + 52, 198 * (this.armor / MAX_ARMOR), 5);

    // Bottom-right weapon/ammo.
    const w = this.weapon();
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(8,16,30,0.58)';
    ctx.fillRect(W - 230, H - 66, 218, 58);
    ctx.font = `bold 26px ${font}`;
    ctx.fillStyle = w.mag === 0 ? '#f07b72' : '#f1f5f9';
    ctx.fillText(String(w.mag), W - 42, H - 42);
    ctx.font = `13px ${font}`;
    ctx.fillStyle = 'rgba(241,245,249,0.75)';
    ctx.fillText(`/ ${w.reserve}`, W - 44, H - 24);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(241,245,249,0.85)';
    ctx.fillText(zh ? w.def.nameZh : w.def.name, W - 220, H - 42);
    ctx.fillStyle = 'rgba(241,245,249,0.6)';
    ctx.font = `12px ${font}`;
    ctx.fillText(this.hasKit ? (zh ? '拆弹器' : 'KIT') : (zh ? '无拆弹器' : 'NO KIT'), W - 220, H - 22);
    if (this.reloading) {
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(W - 220, H - 14, 196, 6);
      const pct = 1 - this.reloadT / w.def.reload;
      ctx.fillStyle = '#39C5BB';
      ctx.fillRect(W - 220, H - 14, 196 * pct, 6);
    }

    if (!this.sfx.enabled) {
      ctx.textAlign = 'left';
      ctx.font = `12px ${font}`;
      ctx.fillStyle = 'rgba(241,245,249,0.8)';
      ctx.fillText(zh ? '静音' : 'MUTED', 16, 96);
    }

    // Crosshair.
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

    void pixel;
  }

  private drawCenterProgress(ctx: CanvasRenderingContext2D, label: string, pct: number, color: string) {
    const font = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    const width = 280;
    const x = W / 2 - width / 2;
    const y = H - 126;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold 14px ${font}`;
    ctx.fillStyle = 'rgba(8,16,30,0.62)';
    ctx.fillRect(x - 14, y - 24, width + 28, 48);
    ctx.fillStyle = color;
    ctx.fillText(label, W / 2, y - 8);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x, y + 6, width, 8);
    ctx.fillStyle = color;
    ctx.fillRect(x, y + 6, width * Math.max(0, Math.min(1, pct)), 8);
  }

  private drawBuyMenu(ctx: CanvasRenderingContext2D) {
    const zh = this.isZhLang();
    const font = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    const x = W / 2 - 230;
    const y = 108;
    ctx.fillStyle = 'rgba(8,16,30,0.78)';
    ctx.fillRect(x, y, 460, 236);
    ctx.strokeStyle = 'rgba(143,179,214,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, 459, 235);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold 22px ${font}`;
    ctx.fillStyle = '#f1f5f9';
    ctx.fillText(zh ? '购买装备' : 'BUY EQUIPMENT', W / 2, y + 28);
    ctx.font = `13px ${font}`;
    ctx.fillStyle = '#f5c46a';
    ctx.fillText(`$${this.money}`, W / 2, y + 52);

    const rows = [
      `1  USP        $0`,
      `2  MP5        $1500`,
      `3  M4A1       $3100`,
      `4  ${zh ? '护甲' : 'ARMOR'}      $650`,
      `5  ${zh ? '拆弹器' : 'DEFUSE KIT'} $400`,
      `6  ${zh ? '头盔套装' : 'HELMET SET'} $1000`,
    ];
    ctx.textAlign = 'left';
    ctx.font = `15px ${font}`;
    rows.forEach((row, i) => {
      const ry = y + 82 + i * 25;
      const affordable =
        i === 0 || this.money >= (i === 1 ? 1500 : i === 2 ? 3100 : i === 3 ? 650 : i === 4 ? 400 : 1000);
      ctx.fillStyle = affordable ? 'rgba(241,245,249,0.92)' : 'rgba(241,245,249,0.35)';
      ctx.fillText(row, x + 58, ry);
    });
    ctx.textAlign = 'center';
    ctx.font = `12px ${font}`;
    ctx.fillStyle = 'rgba(241,245,249,0.72)';
    ctx.fillText(zh ? `进攻方将执行 ${this.targetSite.id} 点 · 冻结 ${Math.ceil(this.phaseTimer)} 秒` : `T SIDE EXECUTES ${this.targetSite.id} · FREEZE ${Math.ceil(this.phaseTimer)}s`, W / 2, y + 222);
  }

  private drawRoundResult(ctx: CanvasRenderingContext2D) {
    const zh = this.isZhLang();
    const font = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    const ctWon = this.roundWinner === 'CT';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(8,16,30,0.55)';
    ctx.fillRect(W / 2 - 220, 118, 440, 82);
    ctx.font = `bold 28px ${font}`;
    ctx.fillStyle = ctWon ? '#8fd8ff' : '#f07b72';
    ctx.fillText(ctWon ? (zh ? 'CT 赢得回合' : 'CT WIN ROUND') : (zh ? 'T 赢得回合' : 'T WIN ROUND'), W / 2, 146);
    ctx.font = `14px ${font}`;
    ctx.fillStyle = 'rgba(241,245,249,0.85)';
    ctx.fillText(zh ? this.roundReasonZh : this.roundReason, W / 2, 174);
    ctx.font = `12px ${font}`;
    ctx.fillText(zh ? `下一回合 ${Math.ceil(this.postTimer)}` : `NEXT ROUND ${Math.ceil(this.postTimer)}`, W / 2, 194);
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

    for (const site of BOMB_SITES) {
      ctx.fillStyle = this.targetSite.id === site.id && this.phase !== 'planted' ? 'rgba(245,196,106,0.8)' : 'rgba(245,196,106,0.45)';
      ctx.beginPath();
      ctx.arc(mx + site.x * scale, my + site.y * scale, site.radius * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#102033';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(site.id, mx + site.x * scale, my + site.y * scale);
    }

    if (this.bomb.planted) {
      ctx.fillStyle = Math.sin(performance.now() / 120) > 0 ? '#f07b72' : '#ffffff';
      ctx.beginPath();
      ctx.arc(mx + this.bomb.x * scale, my + this.bomb.y * scale, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const attacker of this.attackers) {
      if (attacker.dead) continue;
      ctx.fillStyle = '#f07b72';
      ctx.beginPath();
      ctx.arc(mx + attacker.x * scale, my + attacker.y * scale, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

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

    if (this.bomb.planted) {
      const defuseActive = !!this.defuseTouch;
      ctx.fillStyle = defuseActive ? 'rgba(57,197,187,0.8)' : 'rgba(57,197,187,0.45)';
      ctx.beginPath();
      ctx.arc(W - 190, H - 84, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(zh ? '拆弹' : 'USE', W - 190, H - 84);
    }
    ctx.font = '11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(zh ? '左:移动  右:视角' : 'LEFT: MOVE  RIGHT: AIM', W / 2, H - 14);
  }
}
