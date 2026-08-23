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

export const GACHA_TIER_ORDER_HIGH_FIRST: GachaTierId[] = [...GACHA_TIER_ORDER].reverse();

/* ───────── Prize pool (sample CS:GO pieces — replace freely) ───────── */

export const GACHA_POOL: Record<GachaTierId, GachaItem[]> = {
  // 金 · 手套与刀
  rarespecial: [
    { id: 'karambit-fade', name: 'Karambit | Fade', nameZh: '爪刀 · 渐变', kind: 'knife', weight: 0.6 },
    { id: 'gloves-vice', name: 'Sport Gloves | Vice', nameZh: '运动手套 · 罪恶', kind: 'gloves', weight: 0.4 },
  ],
  // 红 · 狙击枪
  covert: [
    { id: 'awp-dragonlore', name: 'AWP | Dragon Lore', nameZh: 'AWP · 巨龙传说', kind: 'sniper', weight: 0.4 },
    { id: 'awp-gungnir', name: 'AWP | Gungnir', nameZh: 'AWP · 永恒之枪', kind: 'sniper', weight: 0.35 },
    { id: 'ssg-blood', name: 'SSG 08 | Blood in the Water', nameZh: 'SSG 08 · 水中血', kind: 'sniper', weight: 0.25 },
  ],
  // 粉 · 步枪
  classified: [
    { id: 'ak-fireserpent', name: 'AK-47 | Fire Serpent', nameZh: 'AK-47 · 火蛇', kind: 'rifle', weight: 0.25 },
    { id: 'm4-howl', name: 'M4A4 | Howl', nameZh: 'M4A4 · 咆哮', kind: 'rifle', weight: 0.25 },
    { id: 'ak-asiimov', name: 'AK-47 | Asiimov', nameZh: 'AK-47 · 阿斯莫夫', kind: 'rifle', weight: 0.2 },
    { id: 'm4-printstream', name: 'M4A1-S | Printstream', nameZh: 'M4A1-S · 印花', kind: 'rifle', weight: 0.2 },
    { id: 'famas-rollcage', name: 'FAMAS | Roll Cage', nameZh: 'FAMAS · 滚笼', kind: 'rifle', weight: 0.1 },
  ],
  // 紫 · 冲锋枪
  restricted: [
    { id: 'mp9-starlight', name: 'MP9 | Starlight Protector', nameZh: 'MP9 · 星辉卫士', kind: 'smg', weight: 0.15 },
    { id: 'mp7-neonply', name: 'MP7 | Neon Ply', nameZh: 'MP7 · 霓虹胶合', kind: 'smg', weight: 0.15 },
    { id: 'ump-prism', name: 'UMP-45 | Prism', nameZh: 'UMP-45 · 棱镜', kind: 'smg', weight: 0.14 },
    { id: 'p90-runhide', name: 'P90 | Run and Hide', nameZh: 'P90 · 奔逃', kind: 'smg', weight: 0.13 },
    { id: 'mp5-phosphor', name: 'MP5-SD | Phosphor', nameZh: 'MP5-SD · 磷光', kind: 'smg', weight: 0.12 },
    { id: 'mac-stalker', name: 'MAC-10 | Stalker', nameZh: 'MAC-10 · 潜行者', kind: 'smg', weight: 0.11 },
    { id: 'p90-freight', name: 'P90 | Freight', nameZh: 'P90 · 货运', kind: 'smg', weight: 0.1 },
    { id: 'ump-metalflowers', name: 'UMP-45 | Metal Flowers', nameZh: 'UMP-45 · 金属花', kind: 'smg', weight: 0.1 },
  ],
  // 蓝 · 手枪
  milspec: [
    { id: 'glock-fade', name: 'Glock-18 | Fade', nameZh: 'Glock-18 · 渐变', kind: 'pistol', weight: 0.08 },
    { id: 'deagle-blaze', name: 'Desert Eagle | Blaze', nameZh: '沙漠之鹰 · 烈焰', kind: 'pistol', weight: 0.08 },
    { id: 'usp-killconfirmed', name: 'USP-S | Kill Confirmed', nameZh: 'USP-S · 确认击杀', kind: 'pistol', weight: 0.08 },
    { id: 'fn57-casehardened', name: 'Five-SeveN | Case Hardened', nameZh: 'FN57 · 淬火', kind: 'pistol', weight: 0.08 },
    { id: 'p250-seeyalater', name: 'P250 | See Ya Later', nameZh: 'P250 · 后会有期', kind: 'pistol', weight: 0.08 },
    { id: 'tec9-fuel', name: 'Tec-9 | Fuel Injector', nameZh: 'Tec-9 · 燃油喷嘴', kind: 'pistol', weight: 0.08 },
    { id: 'cz75-xiangliu', name: 'CZ75-Auto | Xiangliu', nameZh: 'CZ75 · 相柳', kind: 'pistol', weight: 0.08 },
    { id: 'duals-melondrama', name: 'Dual Berettas | Melondrama', nameZh: '双持贝瑞塔 · 西瓜剧', kind: 'pistol', weight: 0.07 },
    { id: 'glock-neonoir', name: 'Glock-18 | Neo-Noir', nameZh: 'Glock-18 · 新黑色', kind: 'pistol', weight: 0.07 },
    { id: 'deagle-codered', name: 'Desert Eagle | Code Red', nameZh: '沙漠之鹰 · 红色代码', kind: 'pistol', weight: 0.07 },
    { id: 'usp-orion', name: 'USP-S | Orion', nameZh: 'USP-S · 猎户座', kind: 'pistol', weight: 0.07 },
    { id: 'fn57-monkey', name: 'Five-SeveN | Monkey Business', nameZh: 'FN57 · 猴戏', kind: 'pistol', weight: 0.06 },
    { id: 'p250-undertow', name: 'P250 | Undertow', nameZh: 'P250 · 暗流', kind: 'pistol', weight: 0.04 },
    { id: 'tec9-icecap', name: 'Tec-9 | Ice Cap', nameZh: 'Tec-9 · 冰盖', kind: 'pistol', weight: 0.03 },
    { id: 'duals-twinturbo', name: 'Dual Berettas | Twin Turbo', nameZh: '双持贝瑞塔 · 双涡轮', kind: 'pistol', weight: 0.01 },
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
