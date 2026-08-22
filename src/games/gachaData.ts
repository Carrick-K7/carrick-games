/*
 * Gacha prize pool configuration.
 *
 * ⚠️ CONTENT SLOTS — edit this file to design your own prizes.
 * The five CS:GO-style rarity tiers and their official odds are fixed
 * below; the per-tier item lists are simple placeholders (蓝1-15,
 * 紫1-8, 粉1-5, 红1-3, 金1-2) and can be renamed or replaced freely.
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
  emoji: string;
  /** Relative probability inside the tier (normalized at roll time). */
  weight: number;
}

/* ───────── Tiers (CS:GO grading) ───────── */

export const GACHA_TIERS: GachaTier[] = [
  {
    id: 'milspec', name: 'Mil-Spec', nameZh: '军规',
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
    id: 'rarespecial', name: 'Rare Special', nameZh: '稀有特殊',
    color: '#E4AE39', glow: 'rgba(228,174,57,0.75)',
    odds: 0.0026,
  },
];

export const GACHA_TIER_MAP: ReadonlyMap<GachaTierId, GachaTier> = new Map(
  GACHA_TIERS.map((tier) => [tier.id, tier]),
);

export const GACHA_TIER_ORDER: GachaTierId[] = ['milspec', 'restricted', 'classified', 'covert', 'rarespecial'];

/* ───────── Prize pool (placeholder content — replace freely) ───────── */

const BLUE_EMOJIS = ['🔷', '🔹', '🧊', '💠', '🟦', '📘', '🫧', '🌊', '🧿', '🎽', '💙', '🥶', '🎿', '🪣', '🧢'];
const PURPLE_EMOJIS = ['🟣', '💜', '🪐', '🍇', '🦄', '🧞', '💟', '🔮'];
const PINK_EMOJIS = ['🌸', '🎀', '💗', '🩷', '🎠'];
const RED_EMOJIS = ['🔥', '💥', '🩸'];
const GOLD_EMOJIS = ['👑', '🏆'];

function buildTier(id: GachaTierId, zhName: string, enName: string, count: number, emojis: string[]): GachaItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${id}-${index + 1}`,
    name: `${enName} ${index + 1}`,
    nameZh: `${zhName} ${index + 1}`,
    emoji: emojis[index % emojis.length],
    weight: 1,
  }));
}

export const GACHA_POOL: Record<GachaTierId, GachaItem[]> = {
  milspec: buildTier('milspec', '蓝', 'Blue', 15, BLUE_EMOJIS),   // 蓝 1-15
  restricted: buildTier('restricted', '紫', 'Purple', 8, PURPLE_EMOJIS),     // 紫 1-8
  classified: buildTier('classified', '粉', 'Pink', 5, PINK_EMOJIS),         // 粉 1-5
  covert: buildTier('covert', '红', 'Red', 3, RED_EMOJIS),        // 红 1-3
  rarespecial: buildTier('rarespecial', '金', 'Gold', 2, GOLD_EMOJIS),       // 金 1-2
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
