// Counter-Strike 1.6 rules — pure data and logic for the fy_iceworld port.
//
// Damage values are the community-standard CS 1.6 damage tables (standard
// damage and damage dealt through kevlar/helmet), see:
// https://bbs-mychat.com/reads.php?tid=972656
// Prices, magazines, and rates follow the CS 1.6 gun list:
// https://csdownload.net/counter-strike-1-6-guns-list/
// Movement speeds follow the classic plugin measurements:
// https://www.cs1-6.com/article/124.html
// Economy follows CS 1.6 rules ($800 start, $3250 win, $1400+$500 loss streak):
// https://otechworld.com/economy-in-cs-1-6-when-to-buy-and-save/

export type Team = 'CT' | 'T';
export type WeaponSlot = 'primary' | 'secondary' | 'knife' | 'nade';
export type HitZone = 'head' | 'chest' | 'stomach' | 'legs';
export type WeaponSound = 'pistol' | 'smg' | 'rifle' | 'sniper' | 'shotgun' | 'mg';

export type WeaponId =
  | 'knife'
  | 'glock'
  | 'usp'
  | 'p228'
  | 'deagle'
  | 'fiveseven'
  | 'elite'
  | 'm3'
  | 'xm1014'
  | 'tmp'
  | 'mac10'
  | 'mp5'
  | 'ump45'
  | 'p90'
  | 'galil'
  | 'famas'
  | 'ak47'
  | 'sg552'
  | 'm4a1'
  | 'aug'
  | 'scout'
  | 'awp'
  | 'g3sg1'
  | 'sg550'
  | 'm249';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  slot: WeaponSlot;
  team: Team | 'both';
  price: number;
  mag: number;
  reserve: number;
  interval: number; // seconds between shots
  reload: number; // seconds
  killReward: number;
  speedUnits: number; // CS movement speed in units/second
  spread: number; // aim error half-angle (radians), standing still
  kick: number; // recoil added per shot
  range: number; // max bullet range in pixels
  falloff: number; // damage fraction lost at max range
  auto: boolean;
  pellets: number; // shotgun pellet count
  dmg: Record<HitZone, number>; // unarmored damage per hit zone (per pellet)
  armorDmg: Record<'head' | 'chest' | 'stomach', number>; // damage dealt through armor
  sound: WeaponSound;
}

// The tile grid mirrors the original map at 1 tile = 64 map units, so
// pixels ≈ map units × 0.94; CS players run at up to 250 u/s.
export const SPEED_SCALE = 0.94;
export const WALK_MULT = 0.52; // walk (Shift) speed multiplier
export const CROUCH_MULT = 1 / 3; // crouch speed multiplier

function weapon(def: Omit<WeaponDef, 'id' | 'name' | 'slot' | 'team' | 'auto' | 'pellets' | 'sound'> & {
  id: WeaponId;
  name: string;
  slot: WeaponSlot;
  team: Team | 'both';
  auto?: boolean;
  pellets?: number;
  sound: WeaponSound;
}): WeaponDef {
  return { auto: false, pellets: 1, ...def };
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  knife: weapon({
    id: 'knife', name: 'Knife', slot: 'knife', team: 'both',
    price: 0, mag: 1, reserve: 0, interval: 0.45, reload: 0,
    killReward: 1500, speedUnits: 250, spread: 0, kick: 0, range: 48, falloff: 0,
    dmg: { head: 60, chest: 15, stomach: 18, legs: 11 },
    armorDmg: { head: 51, chest: 12, stomach: 15 },
    sound: 'pistol',
  }),
  glock: weapon({
    id: 'glock', name: '9x19mm Sidearm', slot: 'secondary', team: 'T',
    price: 400, mag: 20, reserve: 120, interval: 0.15, reload: 2.2,
    killReward: 300, speedUnits: 250, spread: 0.022, kick: 0.008, range: 430, falloff: 0.35,
    dmg: { head: 96, chest: 23, stomach: 28, legs: 17 },
    armorDmg: { head: 50, chest: 12, stomach: 15 },
    sound: 'pistol',
  }),
  usp: weapon({
    id: 'usp', name: 'KM .45 Tactical', slot: 'secondary', team: 'CT',
    price: 500, mag: 12, reserve: 100, interval: 0.15, reload: 2.4,
    killReward: 300, speedUnits: 250, spread: 0.02, kick: 0.009, range: 430, falloff: 0.35,
    dmg: { head: 132, chest: 33, stomach: 41, legs: 24 },
    armorDmg: { head: 66, chest: 16, stomach: 20 },
    sound: 'pistol',
  }),
  p228: weapon({
    id: 'p228', name: '228 Compact', slot: 'secondary', team: 'both',
    price: 600, mag: 13, reserve: 52, interval: 0.133, reload: 2.4,
    killReward: 300, speedUnits: 250, spread: 0.024, kick: 0.011, range: 430, falloff: 0.35,
    dmg: { head: 124, chest: 31, stomach: 36, legs: 23 },
    armorDmg: { head: 77, chest: 19, stomach: 24 },
    sound: 'pistol',
  }),
  deagle: weapon({
    id: 'deagle', name: 'Night Hawk .50C', slot: 'secondary', team: 'both',
    price: 650, mag: 7, reserve: 35, interval: 0.24, reload: 2.2,
    killReward: 300, speedUnits: 250, spread: 0.034, kick: 0.03, range: 500, falloff: 0.3,
    dmg: { head: 212, chest: 52, stomach: 65, legs: 38 },
    armorDmg: { head: 159, chest: 39, stomach: 49 },
    sound: 'pistol',
  }),
  fiveseven: weapon({
    id: 'fiveseven', name: 'ES Five-Seven', slot: 'secondary', team: 'CT',
    price: 750, mag: 20, reserve: 100, interval: 0.15, reload: 2.2,
    killReward: 300, speedUnits: 250, spread: 0.022, kick: 0.009, range: 430, falloff: 0.35,
    dmg: { head: 76, chest: 19, stomach: 23, legs: 14 },
    armorDmg: { head: 57, chest: 14, stomach: 17 },
    sound: 'pistol',
  }),
  elite: weapon({
    id: 'elite', name: '.40 Dual Elites', slot: 'secondary', team: 'T',
    price: 800, mag: 30, reserve: 120, interval: 0.133, reload: 2.5,
    killReward: 300, speedUnits: 250, spread: 0.03, kick: 0.01, range: 420, falloff: 0.4,
    dmg: { head: 140, chest: 34, stomach: 42, legs: 24 },
    armorDmg: { head: 73, chest: 18, stomach: 22 },
    sound: 'pistol',
  }),
  m3: weapon({
    id: 'm3', name: 'Leone 12 Gauge Super', slot: 'primary', team: 'both',
    price: 1700, mag: 8, reserve: 32, interval: 0.857, reload: 4.6,
    killReward: 300, speedUnits: 230, spread: 0.045, kick: 0.045, range: 200, falloff: 0.6,
    pellets: 8,
    dmg: { head: 86, chest: 21, stomach: 27, legs: 16 },
    armorDmg: { head: 61, chest: 11, stomach: 13 },
    sound: 'shotgun',
  }),
  xm1014: weapon({
    id: 'xm1014', name: 'Leone YG1265 Auto Shotgun', slot: 'primary', team: 'both',
    price: 3000, mag: 7, reserve: 32, interval: 0.333, reload: 3.4,
    killReward: 300, speedUnits: 240, spread: 0.05, kick: 0.04, range: 210, falloff: 0.55,
    pellets: 6, auto: true,
    dmg: { head: 76, chest: 19, stomach: 24, legs: 14 },
    armorDmg: { head: 43, chest: 11, stomach: 12 },
    sound: 'shotgun',
  }),
  tmp: weapon({
    id: 'tmp', name: 'Schmidt Machine Pistol', slot: 'primary', team: 'CT',
    price: 1250, mag: 30, reserve: 120, interval: 0.08, reload: 2.5,
    killReward: 300, speedUnits: 250, spread: 0.038, kick: 0.008, range: 460, falloff: 0.32,
    auto: true,
    dmg: { head: 76, chest: 19, stomach: 23, legs: 14 },
    armorDmg: { head: 38, chest: 9, stomach: 11 },
    sound: 'smg',
  }),
  mac10: weapon({
    id: 'mac10', name: 'Ingram MAC-10', slot: 'primary', team: 'T',
    price: 1400, mag: 30, reserve: 100, interval: 0.075, reload: 2.5,
    killReward: 300, speedUnits: 250, spread: 0.052, kick: 0.011, range: 440, falloff: 0.35,
    auto: true,
    dmg: { head: 112, chest: 28, stomach: 35, legs: 20 },
    armorDmg: { head: 53, chest: 13, stomach: 16 },
    sound: 'smg',
  }),
  mp5: weapon({
    id: 'mp5', name: 'KM Sub-Machine Gun', slot: 'primary', team: 'both',
    price: 1500, mag: 30, reserve: 120, interval: 0.1, reload: 2.6,
    killReward: 300, speedUnits: 250, spread: 0.04, kick: 0.01, range: 480, falloff: 0.3,
    auto: true,
    dmg: { head: 100, chest: 25, stomach: 31, legs: 18 },
    armorDmg: { head: 50, chest: 12, stomach: 15 },
    sound: 'smg',
  }),
  ump45: weapon({
    id: 'ump45', name: 'KM UMP45', slot: 'primary', team: 'both',
    price: 1700, mag: 25, reserve: 100, interval: 0.12, reload: 2.8,
    killReward: 300, speedUnits: 250, spread: 0.036, kick: 0.012, range: 480, falloff: 0.3,
    auto: true,
    dmg: { head: 112, chest: 28, stomach: 35, legs: 21 },
    armorDmg: { head: 58, chest: 14, stomach: 18 },
    sound: 'smg',
  }),
  p90: weapon({
    id: 'p90', name: 'ES C90', slot: 'primary', team: 'both',
    price: 2350, mag: 50, reserve: 100, interval: 0.09, reload: 3.3,
    killReward: 300, speedUnits: 245, spread: 0.042, kick: 0.009, range: 480, falloff: 0.3,
    auto: true,
    dmg: { head: 80, chest: 20, stomach: 25, legs: 15 },
    armorDmg: { head: 60, chest: 15, stomach: 18 },
    sound: 'smg',
  }),
  galil: weapon({
    id: 'galil', name: 'IDF Defender', slot: 'primary', team: 'T',
    price: 2000, mag: 35, reserve: 90, interval: 0.1, reload: 2.8,
    killReward: 300, speedUnits: 240, spread: 0.052, kick: 0.016, range: 640, falloff: 0.25,
    auto: true,
    dmg: { head: 116, chest: 29, stomach: 36, legs: 21 },
    armorDmg: { head: 89, chest: 22, stomach: 28 },
    sound: 'rifle',
  }),
  famas: weapon({
    id: 'famas', name: 'Clarion 5.56', slot: 'primary', team: 'CT',
    price: 2250, mag: 25, reserve: 90, interval: 0.1, reload: 2.8,
    killReward: 300, speedUnits: 240, spread: 0.05, kick: 0.015, range: 640, falloff: 0.25,
    auto: true,
    dmg: { head: 116, chest: 29, stomach: 36, legs: 21 },
    armorDmg: { head: 81, chest: 20, stomach: 25 },
    sound: 'rifle',
  }),
  ak47: weapon({
    id: 'ak47', name: 'CV-47', slot: 'primary', team: 'T',
    price: 2500, mag: 30, reserve: 90, interval: 0.1, reload: 2.5,
    killReward: 300, speedUnits: 221, spread: 0.055, kick: 0.022, range: 660, falloff: 0.25,
    auto: true,
    dmg: { head: 140, chest: 35, stomach: 43, legs: 26 },
    armorDmg: { head: 108, chest: 27, stomach: 33 },
    sound: 'rifle',
  }),
  sg552: weapon({
    id: 'sg552', name: 'Krieg 552', slot: 'primary', team: 'T',
    price: 3500, mag: 30, reserve: 90, interval: 0.1, reload: 2.8,
    killReward: 300, speedUnits: 235, spread: 0.048, kick: 0.017, range: 660, falloff: 0.25,
    auto: true,
    dmg: { head: 128, chest: 32, stomach: 40, legs: 24 },
    armorDmg: { head: 89, chest: 22, stomach: 28 },
    sound: 'rifle',
  }),
  m4a1: weapon({
    id: 'm4a1', name: 'Maverick M4A1 Carbine', slot: 'primary', team: 'CT',
    price: 3100, mag: 30, reserve: 90, interval: 0.1, reload: 3.0,
    killReward: 300, speedUnits: 230, spread: 0.046, kick: 0.016, range: 660, falloff: 0.25,
    auto: true,
    dmg: { head: 124, chest: 31, stomach: 38, legs: 23 },
    armorDmg: { head: 86, chest: 21, stomach: 27 },
    sound: 'rifle',
  }),
  aug: weapon({
    id: 'aug', name: 'Bullpup', slot: 'primary', team: 'CT',
    price: 3500, mag: 30, reserve: 90, interval: 0.1, reload: 2.9,
    killReward: 300, speedUnits: 240, spread: 0.046, kick: 0.015, range: 420, falloff: 0.25,
    auto: true,
    dmg: { head: 124, chest: 31, stomach: 38, legs: 23 },
    armorDmg: { head: 86, chest: 21, stomach: 27 },
    sound: 'rifle',
  }),
  scout: weapon({
    id: 'scout', name: 'Schmidt Scout', slot: 'primary', team: 'both',
    price: 2750, mag: 10, reserve: 90, interval: 0.6, reload: 2.7,
    killReward: 300, speedUnits: 260, spread: 0.012, kick: 0.03, range: 1500, falloff: 0.05,
    dmg: { head: 296, chest: 74, stomach: 92, legs: 55 },
    armorDmg: { head: 251, chest: 62, stomach: 78 },
    sound: 'sniper',
  }),
  awp: weapon({
    id: 'awp', name: 'Magnum Sniper Rifle', slot: 'primary', team: 'both',
    price: 4750, mag: 10, reserve: 30, interval: 1.46, reload: 3.6,
    killReward: 100, speedUnits: 210, spread: 0.005, kick: 0.05, range: 1500, falloff: 0.02,
    dmg: { head: 456, chest: 114, stomach: 142, legs: 85 },
    armorDmg: { head: 444, chest: 111, stomach: 138 },
    sound: 'sniper',
  }),
  g3sg1: weapon({
    id: 'g3sg1', name: 'D3/AU-1', slot: 'primary', team: 'T',
    price: 5000, mag: 20, reserve: 90, interval: 0.2, reload: 3.2,
    killReward: 300, speedUnits: 210, spread: 0.016, kick: 0.03, range: 1500, falloff: 0.08,
    auto: true,
    dmg: { head: 316, chest: 79, stomach: 98, legs: 59 },
    armorDmg: { head: 260, chest: 65, stomach: 81 },
    sound: 'sniper',
  }),
  sg550: weapon({
    id: 'sg550', name: 'Krieg 550 Commando', slot: 'primary', team: 'CT',
    price: 4200, mag: 30, reserve: 90, interval: 0.2, reload: 3.2,
    killReward: 300, speedUnits: 210, spread: 0.016, kick: 0.028, range: 1500, falloff: 0.08,
    auto: true,
    dmg: { head: 276, chest: 69, stomach: 86, legs: 51 },
    armorDmg: { head: 200, chest: 50, stomach: 62 },
    sound: 'sniper',
  }),
  m249: weapon({
    id: 'm249', name: 'ES M249 Para', slot: 'primary', team: 'both',
    price: 5750, mag: 100, reserve: 200, interval: 0.092, reload: 4.7,
    killReward: 300, speedUnits: 220, spread: 0.062, kick: 0.017, range: 560, falloff: 0.3,
    auto: true,
    dmg: { head: 124, chest: 31, stomach: 38, legs: 23 },
    // Faithful CS 1.6 quirk: the M249's damage table is identical with or
    // without armor in the standard damage charts.
    armorDmg: { head: 124, chest: 31, stomach: 38 },
    sound: 'mg',
  }),
};

// ── Economy ─────────────────────────────────────────────────────────────────

export const ECONOMY = {
  startMoney: 800,
  maxMoney: 16000,
  winMoney: 3250,
  lossBase: 1400,
  lossStep: 500,
  lossMax: 3400,
};

export function lossMoney(streak: number): number {
  return Math.min(ECONOMY.lossBase + Math.max(0, streak - 1) * ECONOMY.lossStep, ECONOMY.lossMax);
}

export function clampMoney(value: number): number {
  return Math.max(0, Math.min(ECONOMY.maxMoney, Math.round(value)));
}

// ── Equipment ───────────────────────────────────────────────────────────────

export type EquipId = 'kevlar' | 'vesthelm' | 'flash' | 'he' | 'smoke' | 'defuser' | 'nvgs';

export const EQUIPMENT: Record<EquipId, { name: string; price: number; team: Team | 'both' }> = {
  kevlar: { name: 'Kevlar Vest', price: 650, team: 'both' },
  vesthelm: { name: 'Kevlar + Helmet', price: 1000, team: 'both' },
  flash: { name: 'Flashbang', price: 200, team: 'both' },
  he: { name: 'HE Grenade', price: 300, team: 'both' },
  smoke: { name: 'Smoke Grenade', price: 300, team: 'both' },
  defuser: { name: 'Defusal Kit', price: 200, team: 'CT' },
  nvgs: { name: 'Nightvision', price: 1250, team: 'both' },
};

export const PRIMARY_AMMO_PRICE = 20;
export const SECONDARY_AMMO_PRICE = 25;

// ── Rounds ──────────────────────────────────────────────────────────────────

export const ROUND = {
  freezeTime: 4,
  buyTime: 15, // seconds into the live round that the center buyzone stays open
  roundTime: 40, // fy_iceworld rounds are quick and decisive
  postTime: 3,
  winScore: 2, // first team to two round wins takes the match (browser session pace)
  maxHp: 100,
  maxArmor: 100,
};

// ── Buy menu ────────────────────────────────────────────────────────────────
// Team-relative numbering, like the real CS 1.6 VGUI menu (a T sees "1-1
// Glock", a CT sees "1-1 USP"; both see the rest in the same order).

export interface BuyMenuItem {
  kind: 'weapon' | 'ammo' | 'equip';
  name: string;
  price: number;
  team: Team | 'both';
  weaponId?: WeaponId;
  ammo?: 'primary' | 'secondary';
  equip?: EquipId;
}

export interface BuyCategory {
  label: string;
  labelZh: string;
  items: BuyMenuItem[];
}

export const BUY_CATEGORIES: BuyCategory[] = [
  {
    label: 'Handguns', labelZh: '手枪', items: [
      { kind: 'weapon', name: '9x19mm Sidearm', price: 400, team: 'T', weaponId: 'glock' },
      { kind: 'weapon', name: 'KM .45 Tactical', price: 500, team: 'CT', weaponId: 'usp' },
      { kind: 'weapon', name: '228 Compact', price: 600, team: 'both', weaponId: 'p228' },
      { kind: 'weapon', name: 'Night Hawk .50C', price: 650, team: 'both', weaponId: 'deagle' },
      { kind: 'weapon', name: 'ES Five-Seven', price: 750, team: 'CT', weaponId: 'fiveseven' },
      { kind: 'weapon', name: '.40 Dual Elites', price: 800, team: 'T', weaponId: 'elite' },
    ],
  },
  {
    label: 'Shotguns', labelZh: '霰弹枪', items: [
      { kind: 'weapon', name: 'Leone 12 Gauge Super', price: 1700, team: 'both', weaponId: 'm3' },
      { kind: 'weapon', name: 'Leone YG1265 Auto Shotgun', price: 3000, team: 'both', weaponId: 'xm1014' },
    ],
  },
  {
    label: 'Sub-Machine Guns', labelZh: '冲锋枪', items: [
      { kind: 'weapon', name: 'Schmidt Machine Pistol', price: 1250, team: 'CT', weaponId: 'tmp' },
      { kind: 'weapon', name: 'Ingram MAC-10', price: 1400, team: 'T', weaponId: 'mac10' },
      { kind: 'weapon', name: 'KM Sub-Machine Gun', price: 1500, team: 'both', weaponId: 'mp5' },
      { kind: 'weapon', name: 'KM UMP45', price: 1700, team: 'both', weaponId: 'ump45' },
      { kind: 'weapon', name: 'ES C90', price: 2350, team: 'both', weaponId: 'p90' },
    ],
  },
  {
    label: 'Rifles', labelZh: '步枪', items: [
      { kind: 'weapon', name: 'Clarion 5.56', price: 2250, team: 'CT', weaponId: 'famas' },
      { kind: 'weapon', name: 'IDF Defender', price: 2000, team: 'T', weaponId: 'galil' },
      { kind: 'weapon', name: 'Schmidt Scout', price: 2750, team: 'CT', weaponId: 'scout' },
      { kind: 'weapon', name: 'CV-47', price: 2500, team: 'T', weaponId: 'ak47' },
      { kind: 'weapon', name: 'Maverick M4A1 Carbine', price: 3100, team: 'CT', weaponId: 'm4a1' },
      { kind: 'weapon', name: 'Schmidt Scout', price: 2750, team: 'T', weaponId: 'scout' },
      { kind: 'weapon', name: 'Bullpup', price: 3500, team: 'CT', weaponId: 'aug' },
      { kind: 'weapon', name: 'Krieg 552', price: 3500, team: 'T', weaponId: 'sg552' },
      { kind: 'weapon', name: 'Krieg 550 Commando', price: 4200, team: 'CT', weaponId: 'sg550' },
      { kind: 'weapon', name: 'Magnum Sniper Rifle', price: 4750, team: 'T', weaponId: 'awp' },
      { kind: 'weapon', name: 'Magnum Sniper Rifle', price: 4750, team: 'CT', weaponId: 'awp' },
      { kind: 'weapon', name: 'D3/AU-1', price: 5000, team: 'T', weaponId: 'g3sg1' },
    ],
  },
  {
    label: 'Machine Gun', labelZh: '机枪', items: [
      { kind: 'weapon', name: 'M249', price: 5750, team: 'both', weaponId: 'm249' },
    ],
  },
  {
    label: 'Primary Ammo', labelZh: '主武器弹药', items: [
      { kind: 'ammo', name: 'Primary Ammo', price: PRIMARY_AMMO_PRICE, team: 'both', ammo: 'primary' },
    ],
  },
  {
    label: 'Pistol Ammo', labelZh: '手枪弹药', items: [
      { kind: 'ammo', name: 'Pistol Ammo', price: SECONDARY_AMMO_PRICE, team: 'both', ammo: 'secondary' },
    ],
  },
  {
    label: 'Equipment', labelZh: '装备', items: [
      { kind: 'equip', name: 'Kevlar Vest', price: 650, team: 'both', equip: 'kevlar' },
      { kind: 'equip', name: 'Kevlar + Helmet', price: 1000, team: 'both', equip: 'vesthelm' },
      { kind: 'equip', name: 'Flashbang', price: 200, team: 'both', equip: 'flash' },
      { kind: 'equip', name: 'HE Grenade', price: 300, team: 'both', equip: 'he' },
      { kind: 'equip', name: 'Smoke Grenade', price: 300, team: 'both', equip: 'smoke' },
      { kind: 'equip', name: 'Defusal Kit', price: 200, team: 'CT', equip: 'defuser' },
      { kind: 'equip', name: 'Nightvision', price: 1250, team: 'both', equip: 'nvgs' },
    ],
  },
];

export function buyItemsForTeam(category: BuyCategory, team: Team): BuyMenuItem[] {
  return category.items.filter((item) => item.team === 'both' || item.team === team);
}

// ── Damage ──────────────────────────────────────────────────────────────────

export interface DamageTarget {
  armor: number;
  helmet: boolean;
}

export interface DamageResult {
  dmg: number; // damage applied to hit points
  armorDmg: number; // armor points consumed
}

const ZONE_WEIGHTS: [HitZone, number][] = [
  ['head', 0.1],
  ['chest', 0.42],
  ['stomach', 0.28],
  ['legs', 0.2],
];

/** Roll a hit zone. Standing still improves headshot odds, crouching more so. */
export function rollHitZone(moving: boolean, crouching: boolean): HitZone {
  let headW = ZONE_WEIGHTS[0][1];
  if (!moving) headW *= 1.6;
  if (crouching) headW *= 1.6;
  const weights: [HitZone, number][] = [
    ['head', headW],
    ['chest', ZONE_WEIGHTS[1][1]],
    ['stomach', ZONE_WEIGHTS[2][1]],
    ['legs', ZONE_WEIGHTS[3][1]],
  ];
  const total = weights.reduce((sum, entry) => sum + entry[1], 0);
  let roll = Math.random() * total;
  for (const [zone, weight] of weights) {
    roll -= weight;
    if (roll <= 0) return zone;
  }
  return 'chest';
}

/**
 * CS 1.6 damage model: armored hits use the through-armor tables; legs are
 * never protected by armor; head hits use the helmet table only with a helmet.
 * Damage falls off with distance per weapon.
 */
export function computeDamage(
  def: WeaponDef,
  zone: HitZone,
  target: DamageTarget,
  distance: number,
): DamageResult {
  // CS-style falloff: damage decays linearly with distance and keeps
  // decaying past the weapon's reference range (bullets are not range-capped),
  // floored at 25% so long shots still sting. `range` is in map units.
  const refDist = Math.max(1, def.range * SPEED_SCALE);
  const falloff = Math.max(0.25, 1 - def.falloff * (distance / refDist));
  const base = def.dmg[zone] * falloff;

  const armorApplies =
    zone !== 'legs' &&
    target.armor > 0 &&
    (zone !== 'head' || target.helmet);

  if (armorApplies) {
    const through = def.armorDmg[zone] * falloff;
    return {
      dmg: Math.max(1, Math.round(through)),
      armorDmg: Math.max(0, Math.round(base - through)),
    };
  }
  return { dmg: Math.max(1, Math.round(base)), armorDmg: 0 };
}

export function applyDamage(hp: number, armor: number, result: DamageResult): { hp: number; armor: number; dead: boolean } {
  const nextArmor = Math.max(0, armor - result.armorDmg);
  const nextHp = Math.max(0, hp - result.dmg);
  return { hp: nextHp, armor: nextArmor, dead: nextHp <= 0 };
}

// ── Match helpers ───────────────────────────────────────────────────────────

export type RoundOutcome = 'ctWin' | 'tWin' | 'draw';

export interface MatchScoreState {
  ctWins: number;
  tWins: number;
}

export function matchWinner(state: MatchScoreState): Team | null {
  if (state.ctWins >= ROUND.winScore) return 'CT';
  if (state.tWins >= ROUND.winScore) return 'T';
  return null;
}

export function matchScore(kills: number, ctWins: number, wonMatch: boolean): number {
  return kills * 150 + ctWins * 500 + (wonMatch ? 1000 : 0);
}
