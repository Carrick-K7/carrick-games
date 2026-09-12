/*
 * Gacha prize pool configuration.
 *
 * ⚠️ CONTENT SLOTS — edit this file to design your own prizes.
 * Five CS:GO-style rarity tiers with their official odds are fixed
 * below; the item lists sample real CS:GO pieces and can be renamed or
 * replaced freely. Each tier maps to a weapon family:
 *
 *   金 Rare Special → knife + gloves
 *   红 Covert       → sniper rifles
 *   粉 Classified   → rifles
 *   紫 Restricted   → SMGs
 *   蓝 Mil-Spec     → pistols
 *
 * Rolling is two-level:
 *   1. tier is picked by the official color odds (blue 79.92%, purple
 *      15.98%, pink 3.20%, red 0.64%, gold 0.26%);
 *   2. the item is picked inside that tier by the per-item `weight`
 *      below. Weights are relative and normalized at roll time; all
 *      placeholders currently share weight 1 (uniform inside the tier).
 *      Set different weights for an uneven distribution.
 *
 * Odds follow Valve's published case-opening probabilities (CS:GO 2019
 * disclosure, still used by CS2).
 */

export type GachaTierId = 'milspec' | 'restricted' | 'classified' | 'covert' | 'rarespecial';

export type WeaponKind = 'knife' | 'gloves' | 'sniper' | 'rifle' | 'smg' | 'pistol';

export interface GachaTier {
  id: GachaTierId;
  name: string;
  nameZh: string;
  color: string;
  glow: string;
  odds: number; // decimal probability, e.g. 0.7992 = 79.92%
}

export interface GachaItem {
  id: string;
  name: string;
  nameZh: string;
  kind: WeaponKind;
  /** Per-item icon silhouette id (see gachaWeaponIcons.ts); defaults to kind. */
  icon?: string;
  /** Relative probability inside the tier (normalized at roll time). */
  weight: number;
}

/* ───────── Tiers (CS:GO grading) ───────── */

export const GACHA_TIERS: GachaTier[] = [
  {
    id: 'milspec', name: 'Mil-Spec Grade', nameZh: '军规级',
    color: '#4B69FF', glow: 'rgba(75,105,255,0.55)',
    odds: 0.7992,
  },
  {
    id: 'restricted', name: 'Restricted', nameZh: '受限',
    color: '#8847FF', glow: 'rgba(136,71,255,0.55)',
    odds: 0.1598,
  },
  {
    id: 'classified', name: 'Classified', nameZh: '保密',
    color: '#D32CE6', glow: 'rgba(211,44,230,0.6)',
    odds: 0.032,
  },
  {
    id: 'covert', name: 'Covert', nameZh: '隐秘',
    color: '#EB4B4B', glow: 'rgba(235,75,75,0.62)',
    odds: 0.0064,
  },
  {
    id: 'rarespecial', name: 'Rare Special', nameZh: '罕见特殊',
    color: '#E4AE39', glow: 'rgba(228,174,57,0.75)',
    odds: 0.0026,
  },
];

export const GACHA_TIER_MAP: ReadonlyMap<GachaTierId, GachaTier> = new Map(
  GACHA_TIERS.map((tier) => [tier.id, tier]),
);

export const GACHA_TIER_ORDER: GachaTierId[] = ['milspec', 'restricted', 'classified', 'covert', 'rarespecial'];

export const GACHA_TIER_ORDER_HIGH_FIRST: GachaTierId[] = [...GACHA_TIER_ORDER].reverse();

/* ───────── Prize pool ─────────
 * Each tier is represented by its iconic CS weapons — no skin names. Gold
 * is the knives (butterfly / karambit), covert is the AWP and the autosniper,
 * classified the rifles, restricted the SMGs, milspec the pistols.
 */

export const GACHA_POOL: Record<GachaTierId, GachaItem[]> = {
  // 金 · 刀
  rarespecial: [
    { id: 'knife-butterfly', name: 'Butterfly Knife', nameZh: '蝴蝶刀', kind: 'knife', icon: 'butterfly', weight: 0.5 },
    { id: 'knife-karambit', name: 'Karambit', nameZh: '爪刀', kind: 'knife', icon: 'karambit', weight: 0.5 },
  ],
  // 红 · 狙击
  covert: [
    { id: 'awp', name: 'AWP', nameZh: 'AWP', kind: 'sniper', icon: 'awp', weight: 0.6 },
    { id: 'g3sg1', name: 'G3SG1', nameZh: 'G3SG1 连狙', kind: 'sniper', icon: 'g3sg1', weight: 0.4 },
  ],
  // 粉 · 步枪
  classified: [
    { id: 'ak47', name: 'AK-47', nameZh: 'AK-47', kind: 'rifle', icon: 'ak47', weight: 0.4 },
    { id: 'm4a4', name: 'M4A4', nameZh: 'M4A4', kind: 'rifle', icon: 'm4a4', weight: 0.35 },
    { id: 'm4a1s', name: 'M4A1-S', nameZh: 'M4A1-S', kind: 'rifle', icon: 'm4a1s', weight: 0.25 },
  ],
  // 紫 · 冲锋枪
  restricted: [
    { id: 'p90', name: 'P90', nameZh: 'P90', kind: 'smg', icon: 'p90', weight: 0.3 },
    { id: 'mp5sd', name: 'MP5-SD', nameZh: 'MP5-SD', kind: 'smg', icon: 'mp5', weight: 0.25 },
    { id: 'ump45', name: 'UMP-45', nameZh: 'UMP-45', kind: 'smg', icon: 'ump45', weight: 0.25 },
    { id: 'mac10', name: 'MAC-10', nameZh: 'MAC-10', kind: 'smg', icon: 'mac10', weight: 0.2 },
  ],
  // 蓝 · 手枪
  milspec: [
    { id: 'glock18', name: 'Glock-18', nameZh: 'Glock-18', kind: 'pistol', icon: 'glock', weight: 0.2 },
    { id: 'usps', name: 'USP-S', nameZh: 'USP-S', kind: 'pistol', icon: 'usp', weight: 0.2 },
    { id: 'deagle', name: 'Desert Eagle', nameZh: '沙漠之鹰', kind: 'pistol', icon: 'deagle', weight: 0.2 },
    { id: 'p250', name: 'P250', nameZh: 'P250', kind: 'pistol', icon: 'p250', weight: 0.2 },
    { id: 'fn57', name: 'Five-SeveN', nameZh: 'Five-SeveN', kind: 'pistol', icon: 'fn57', weight: 0.2 },
  ],
};

/* ───────── Rolling ───────── */

export interface GachaRoll {
  tier: GachaTier;
  item: GachaItem;
}

/**
 * Two-level roll: tier by official color odds, then item inside the tier
 * by weighted probability. Uses rng() first for the tier, then for the
 * item — deterministic sequences are supported for tests.
 */
export function rollGachaItem(rng: () => number = Math.random): GachaRoll {
  const tierId = rollGachaTier(rng);
  const tier = GACHA_TIER_MAP.get(tierId)!;
  const pool = GACHA_POOL[tierId];
  const totalWeight = pool.reduce((acc, item) => acc + item.weight, 0);
  const r = clamp01(rng()) * totalWeight;
  let cursor = 0;
  for (const item of pool) {
    cursor += item.weight;
    if (r <= cursor) return { tier, item };
  }
  return { tier, item: pool[pool.length - 1] };
}

/** Pick a tier by the official color odds. */
export function rollGachaTier(rng: () => number = Math.random): GachaTierId {
  const r = clamp01(rng());
  let cursor = 0;
  for (const tier of GACHA_TIERS) {
    cursor += tier.odds;
    if (r < cursor) return tier.id;
  }
  return GACHA_TIERS[GACHA_TIERS.length - 1].id; // defensive; odds sum to 1
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1 - Number.EPSILON);
}

/** True when all tier odds add up to exactly 1 (within epsilon). */
export function gachaOddsAreValid(epsilon = 1e-9): boolean {
  const sum = GACHA_TIERS.reduce((acc, tier) => acc + tier.odds, 0);
  return Math.abs(sum - 1) <= epsilon;
}
