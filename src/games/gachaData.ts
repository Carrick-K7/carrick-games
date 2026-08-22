/*
 * Gacha prize pool configuration.
 *
 * ⚠️ CONTENT SLOTS — edit this file to design your own prizes.
 * The five CS:GO-style rarity tiers and their official odds are fixed
 * below; only the per-tier item lists are placeholder content and can
 * be freely replaced, extended, or trimmed (at least one item per tier).
 *
 * Odds follow Valve's published case-opening probabilities (CS:GO 2019
 * disclosure, still used by CS2):
 *   Mil-Spec 79.92% / Restricted 15.98% / Classified 3.20% /
 *   Covert 0.64% / Rare Special (knife & gloves) 0.26%.
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

export const GACHA_POOL: Record<GachaTierId, GachaItem[]> = {
  milspec: [
    { id: 'ak-blueprint', name: 'AK-47 | Blueprint', nameZh: 'AK-47 | 蓝图', emoji: '🔫' },
    { id: 'm4-frost', name: 'M4A4 | Frost Line', nameZh: 'M4A4 | 霜线', emoji: '🔧' },
    { id: 'awp-steel', name: 'AWP | Steel Mesh', nameZh: 'AWP | 钢网', emoji: '🎯' },
    { id: 'glock-navy', name: 'Glock-18 | Navy Sheen', nameZh: 'Glock-18 | 海军光泽', emoji: '🪖' },
  ],
  restricted: [
    { id: 'ak-rail', name: 'AK-47 | Rail', nameZh: 'AK-47 | 铁轨', emoji: '🔫' },
    { id: 'deagle-violet', name: 'Desert Eagle | Violet Vortex', nameZh: '沙漠之鹰 | 紫涡', emoji: '💜' },
    { id: 'ump-prism', name: 'UMP-45 | Prism', nameZh: 'UMP-45 | 棱镜', emoji: '🔷' },
    { id: 'm4-toxic', name: 'M4A1-S | Toxic Touch', nameZh: 'M4A1-S | 毒触', emoji: '☣️' },
  ],
  classified: [
    { id: 'ak-neon', name: 'AK-47 | Neon Rider', nameZh: 'AK-47 | 霓虹骑士', emoji: '🎆' },
    { id: 'awp-violet', name: 'AWP | Hyper Beast', nameZh: 'AWP | 超能兽', emoji: '👾' },
    { id: 'm4-leopard', name: 'M4A4 | Leopard', nameZh: 'M4A4 | 豹纹', emoji: '🐆' },
    { id: 'p250-born', name: 'P250 | Born Ashes', nameZh: 'P250 | 烬火', emoji: '🔥' },
  ],
  covert: [
    { id: 'ak-fire', name: 'AK-47 | Fire Serpent', nameZh: 'AK-47 | 火蛇', emoji: '🐍' },
    { id: 'awp-dragon', name: 'AWP | Dragon Lore', nameZh: 'AWP | 巨龙传说', emoji: '🐉' },
    { id: 'm4-gold', name: 'M4A4 | Howl', nameZh: 'M4A4 | 咆哮', emoji: '🐺' },
    { id: 'deagle-blaze', name: 'Desert Eagle | Blaze', nameZh: '沙漠之鹰 | 烈焰', emoji: '💥' },
  ],
  rarespecial: [
    { id: 'knife-fade', name: 'Karambit | Fade', nameZh: '爪刀 | 渐变之色', emoji: '🔪' },
    { id: 'knife-marble', name: 'Butterfly Knife | Marble Fade', nameZh: '蝴蝶刀 | 大理石渐变', emoji: '🦋' },
    { id: 'gloves-sport', name: 'Sport Gloves | Vice', nameZh: '运动手套 | 罪恶', emoji: '🧤' },
    { id: 'knife-gamma', name: 'M9 Bayonet | Gamma Doppler', nameZh: 'M9 刺刀 | 伽马多普勒', emoji: '🌟' },
  ],
};

/* ───────── Rolling ───────── */

export interface GachaRoll {
  tier: GachaTier;
  item: GachaItem;
}

/** Roll a tier by official odds, then an item uniformly within the tier. */
export function rollGachaItem(rng: () => number = Math.random): GachaRoll {
  const rolled = rollGachaTier(rng);
  const tier = GACHA_TIER_MAP.get(rolled)!;
  const pool = GACHA_POOL[tier.id];
  const item = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  return { tier, item };
}

function rollGachaTier(rng: () => number): GachaTierId {
  const r = Math.min(Math.max(rng(), 0), 1 - Number.EPSILON);
  let cursor = 0;
  for (const tier of GACHA_TIERS) {
    cursor += tier.odds;
    if (r < cursor) return tier.id;
  }
  return GACHA_TIERS[GACHA_TIERS.length - 1].id; // defensive; odds sum to 1
}

/** True when all tier odds add up to exactly 1 (within epsilon). */
export function gachaOddsAreValid(epsilon = 1e-9): boolean {
  const sum = GACHA_TIERS.reduce((acc, tier) => acc + tier.odds, 0);
  return Math.abs(sum - 1) <= epsilon;
}
