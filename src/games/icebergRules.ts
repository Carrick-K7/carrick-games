// Iceberg Strike — pure CS-style rule tables and match logic.
// No DOM, no rendering: weapon stats, economy, damage model, round/match
// state evaluation. Shared by the game, the bot brains, and unit tests.

export type TeamSide = 'CT' | 'T';

export type WeaponSlot = 'primary' | 'secondary' | 'melee' | 'grenade';

export type WeaponId =
  | 'knife'
  | 'usp'
  | 'glock'
  | 'deagle'
  | 'mp5'
  | 'ak47'
  | 'm4a1'
  | 'awp'
  | 'hegrenade';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  nameZh: string;
  slot: WeaponSlot;
  price: number;
  /** Side restriction for buying; null = both teams. */
  team: TeamSide | null;
  /** Base torso damage at point blank. */
  dmg: number;
  /** Headshot multiplier. */
  headMult: number;
  /** Seconds between shots. */
  rate: number;
  mag: number;
  reserve: number;
  reload: number;
  /** Radians of spread when standing still (scope off for AWP). */
  spreadStand: number;
  /** Extra radians at full move speed. */
  spreadMove: number;
  /** Recoil accumulation per shot. */
  kick: number;
  auto: boolean;
  /** Tiles per second movement speed while held. */
  speed: number;
  /** Money for a kill with this weapon. */
  killReward: number;
  /** Damage falloff reference distance in tiles. */
  range: number;
  /** Scope zoom factor (AWP); 0 = no scope. */
  zoom: number;
  /** Melee reach in tiles (knife); 0 = hitscan. */
  melee: number;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  knife: {
    id: 'knife', name: 'KNIFE', nameZh: '匕首', slot: 'melee', price: 0, team: null,
    dmg: 40, headMult: 2, rate: 0.45, mag: Infinity, reserve: Infinity, reload: 0,
    spreadStand: 0, spreadMove: 0, kick: 0, auto: false, speed: 4.5,
    killReward: 1500, range: 2, zoom: 0, melee: 1.35,
  },
  usp: {
    id: 'usp', name: 'USP', nameZh: 'USP', slot: 'secondary', price: 0, team: 'CT',
    dmg: 30, headMult: 4, rate: 0.18, mag: 12, reserve: 100, reload: 1.6,
    spreadStand: 0.010, spreadMove: 0.030, kick: 0.012, auto: false, speed: 4.3,
    killReward: 300, range: 14, zoom: 0, melee: 0,
  },
  glock: {
    id: 'glock', name: 'GLOCK-18', nameZh: '格洛克18', slot: 'secondary', price: 0, team: 'T',
    dmg: 25, headMult: 4, rate: 0.15, mag: 20, reserve: 120, reload: 1.7,
    spreadStand: 0.012, spreadMove: 0.034, kick: 0.010, auto: false, speed: 4.3,
    killReward: 300, range: 13, zoom: 0, melee: 0,
  },
  deagle: {
    id: 'deagle', name: 'DESERT EAGLE', nameZh: '沙漠之鹰', slot: 'secondary', price: 700, team: null,
    dmg: 53, headMult: 4, rate: 0.30, mag: 7, reserve: 35, reload: 1.9,
    spreadStand: 0.008, spreadMove: 0.040, kick: 0.030, auto: false, speed: 4.2,
    killReward: 300, range: 16, zoom: 0, melee: 0,
  },
  mp5: {
    id: 'mp5', name: 'MP5', nameZh: 'MP5 冲锋枪', slot: 'primary', price: 1500, team: null,
    dmg: 26, headMult: 4, rate: 0.08, mag: 30, reserve: 120, reload: 2.1,
    spreadStand: 0.014, spreadMove: 0.026, kick: 0.009, auto: true, speed: 4.1,
    killReward: 600, range: 13, zoom: 0, melee: 0,
  },
  ak47: {
    id: 'ak47', name: 'AK-47', nameZh: 'AK-47', slot: 'primary', price: 2500, team: 'T',
    dmg: 40, headMult: 5, rate: 0.10, mag: 30, reserve: 90, reload: 2.2,
    spreadStand: 0.011, spreadMove: 0.042, kick: 0.016, auto: true, speed: 3.9,
    killReward: 300, range: 18, zoom: 0, melee: 0,
  },
  m4a1: {
    id: 'm4a1', name: 'M4A1', nameZh: 'M4A1', slot: 'primary', price: 3100, team: 'CT',
    dmg: 38, headMult: 4.5, rate: 0.09, mag: 30, reserve: 90, reload: 2.2,
    spreadStand: 0.010, spreadMove: 0.038, kick: 0.014, auto: true, speed: 3.9,
    killReward: 300, range: 18, zoom: 0, melee: 0,
  },
  awp: {
    id: 'awp', name: 'AWP', nameZh: 'AWP 狙击枪', slot: 'primary', price: 4750, team: null,
    dmg: 110, headMult: 4, rate: 1.45, mag: 5, reserve: 30, reload: 3.2,
    spreadStand: 0.060, spreadMove: 0.090, kick: 0.05, auto: false, speed: 3.4,
    killReward: 100, range: 30, zoom: 2.6, melee: 0,
  },
  hegrenade: {
    id: 'hegrenade', name: 'HE GRENADE', nameZh: '高爆手雷', slot: 'grenade', price: 300, team: null,
    dmg: 90, headMult: 1, rate: 0.6, mag: 1, reserve: 0, reload: 0,
    spreadStand: 0, spreadMove: 0, kick: 0, auto: false, speed: 4.4,
    killReward: 300, range: 2.6, zoom: 0, melee: 0,
  },
};

export const STARTING_PISTOL: Record<TeamSide, WeaponId> = { CT: 'usp', T: 'glock' };

export interface EquipmentDef {
  id: 'kevlar' | 'helmet' | 'kit';
  name: string;
  nameZh: string;
  price: number;
  team: TeamSide | null;
}

export const EQUIPMENT: EquipmentDef[] = [
  { id: 'kevlar', name: 'KEVLAR VEST', nameZh: '防弹衣', price: 650, team: null },
  { id: 'helmet', name: 'HELMET', nameZh: '头盔', price: 350, team: null },
  { id: 'kit', name: 'DEFUSE KIT', nameZh: '拆弹工具包', price: 400, team: 'CT' },
];

// ─── Economy ────────────────────────────────────────────────────────────────

export const ECONOMY = {
  startMoney: 800,
  maxMoney: 16000,
  winElimination: 3250,
  winDefuse: 3500,
  winExplosion: 3500,
  winTimeout: 3250,
  lossBase: 1400,
  lossStep: 500,
  lossMax: 3400,
  /** T side still earns this on a lost round if the bomb was planted. */
  lossPlantedBonus: 800,
  plantBonus: 300,
  defuseBonus: 300,
} as const;

/** Loser-side income for a round, given their consecutive loss streak. */
export function lossMoney(streak: number): number {
  const steps = Math.min(4, Math.max(0, streak));
  return Math.min(ECONOMY.lossMax, ECONOMY.lossBase + steps * ECONOMY.lossStep);
}

export function clampMoney(value: number): number {
  return Math.max(0, Math.min(ECONOMY.maxMoney, Math.round(value)));
}

// ─── Damage model ───────────────────────────────────────────────────────────

export type HitZone = 'head' | 'body' | 'legs';

export interface DamageResult {
  hp: number;
  armor: number;
  dead: boolean;
  /** Actual health damage dealt (after armor). */
  dealt: number;
}

/**
 * CS-style damage: headshots multiply, legs shave, kevlar absorbs half of
 * body damage and helmets soften headshots. Armor points deplete by the
 * amount absorbed.
 */
export function computeDamage(
  weapon: WeaponDef,
  zone: HitZone,
  dist: number,
  armor: number,
  helmet: boolean,
): { dmg: number; armorDmg: number } {
  const falloff = Math.max(0.55, 1 - 0.35 * (dist / Math.max(1, weapon.range)));
  let dmg = weapon.dmg * falloff;
  let absorbRate = 0;
  if (zone === 'head') {
    dmg *= weapon.headMult;
    if (helmet && armor > 0) absorbRate = 0.45;
  } else if (zone === 'legs') {
    dmg *= 0.75;
  } else if (armor > 0) {
    absorbRate = 0.5;
  }
  const absorbed = Math.min(armor, dmg * absorbRate);
  dmg -= absorbed;
  return { dmg: Math.max(1, Math.round(dmg)), armorDmg: Math.round(absorbed) };
}

export function applyDamage(
  hp: number,
  armor: number,
  dmg: number,
  armorDmg: number,
): DamageResult {
  const nextArmor = Math.max(0, armor - armorDmg);
  const nextHp = Math.max(0, hp - dmg);
  return { hp: nextHp, armor: nextArmor, dead: nextHp <= 0, dealt: dmg };
}

// ─── Round / match logic ────────────────────────────────────────────────────

export const ROUND = {
  freezeTime: 3,
  liveTime: 100,
  bombTime: 30,
  endTime: 4.2,
  plantTime: 3.2,
  defuseWithKit: 5,
  defuseNoKit: 10,
  maxHp: 100,
  maxArmor: 100,
  /** Regulation rounds per half (MR12). */
  halfRounds: 12,
  maxRounds: 24,
  winScore: 13,
  suddenDeathMoney: 5000,
} as const;

export type RoundEndReason =
  | 'elimination'   // a team was wiped before any plant
  | 'defuse'        // CT defused
  | 'explosion'     // bomb went off
  | 'timeout'       // timer expired before a plant
  | 'hunted';       // bomb planted, then the losing side was wiped

export interface RoundState {
  ctAlive: number;
  tAlive: number;
  bombPlanted: boolean;
  bombExploded: boolean;
  bombDefused: boolean;
  timeLeft: number;
}

/** Evaluate whether a round is over and who takes it. */
export function evaluateRound(state: RoundState): { winner: TeamSide; reason: RoundEndReason } | null {
  if (state.bombDefused) return { winner: 'CT', reason: 'defuse' };
  if (state.bombExploded) return { winner: 'T', reason: 'explosion' };
  if (state.ctAlive <= 0) return { winner: 'T', reason: state.bombPlanted ? 'hunted' : 'elimination' };
  if (state.tAlive <= 0 && !state.bombPlanted) return { winner: 'CT', reason: 'elimination' };
  if (!state.bombPlanted && state.timeLeft <= 0) return { winner: 'CT', reason: 'timeout' };
  return null;
}

export interface MatchState {
  ctWins: number;
  tWins: number;
  round: number; // 1-based number of the round about to be played / in progress
}

/** True when the round about to start opens the second half. */
export function isHalftimeRound(round: number): boolean {
  return round === ROUND.halfRounds + 1;
}

/**
 * Decide the match winner. First to 13 within 24 rounds; at 12-12 the
 * 25th sudden-death round decides. Returns null while the match is open.
 */
export function matchWinner(match: MatchState): TeamSide | null {
  if (match.ctWins >= ROUND.winScore) return 'CT';
  if (match.tWins >= ROUND.winScore) return 'T';
  if (match.round > ROUND.maxRounds) {
    // Sudden death: the first win past 12-12 ends it (handled by winScore),
    // but a hard cap guards against any drift.
    if (match.ctWins !== match.tWins) return match.ctWins > match.tWins ? 'CT' : 'T';
  }
  return null;
}

/** True when the next round is the 12-12 sudden-death decider. */
export function isSuddenDeathRound(match: MatchState): boolean {
  return match.round === ROUND.maxRounds + 1;
}

// ─── Bot identities ─────────────────────────────────────────────────────────

export const CT_BOT_NAMES = ['Bot Adrian', 'Bot Dennis', 'Bot Miles', 'Bot Viktor'];
export const T_BOT_NAMES = ['Bot Rascal', 'Bot Weasel', 'Bot Lunatic', 'Bot Maniac', 'Bot Splinter'];

/** Player-facing score: kills and round wins with a victory bonus. */
export function matchScore(kills: number, teamRoundWins: number, won: boolean): number {
  return kills * 150 + teamRoundWins * 200 + (won ? 1500 : 0);
}
