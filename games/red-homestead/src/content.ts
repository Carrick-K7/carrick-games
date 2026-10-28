import type { BuildingDefinition, BuildingKind, UnitDefinition, UnitKind } from './types.js';

const definition = (
  kind: BuildingKind, labelZh: string, labelEn: string, width: number, height: number,
  cost: number, buildTime: number, powerProduced = 0, powerUsed = 0,
  capacity = 0, happiness = 0, income = 0, essential = false,
): BuildingDefinition => ({
  kind, labelZh, labelEn, footprint: { width, height }, cost, buildTime,
  powerProduced, powerUsed, capacity, happiness, income, essential, walkable: kind === 'road',
});

/** Original simulation balance, not a claim of original game data or asset availability. */
export const BUILDINGS: Readonly<Record<BuildingKind, BuildingDefinition>> = {
  yard: definition('yard', '建设基地', 'Construction yard', 3, 3, 1800, 15, 10, 0, 0, 0, 30, true),
  power: definition('power', '发电厂', 'Power plant', 2, 2, 600, 12, 120, 0, 0, 0, 0, true),
  refinery: definition('refinery', '矿石精炼厂', 'Ore refinery', 3, 2, 1400, 20, 0, 25, 0, 0, 0, true),
  house: definition('house', '民居', 'House', 2, 2, 300, 8, 0, 3, 12),
  apartment: definition('apartment', '公寓', 'Apartment', 2, 3, 900, 18, 0, 10, 48),
  market: definition('market', '集市', 'Market', 2, 2, 700, 14, 0, 8, 0, 4, 40),
  park: definition('park', '社区公园', 'Community park', 2, 2, 180, 5, 0, 0, 0, 7),
  clinic: definition('clinic', '诊所', 'Clinic', 2, 2, 550, 12, 0, 8, 0, 8),
  school: definition('school', '学校', 'School', 3, 2, 800, 16, 0, 10, 0, 8),
  workshop: definition('workshop', '民用工坊', 'Civil workshop', 3, 2, 1100, 20, 0, 15),
  warehouse: definition('warehouse', '仓库', 'Warehouse', 2, 2, 450, 10, 0, 4),
  greenhouse: definition('greenhouse', '温室', 'Greenhouse', 2, 3, 450, 12, 0, 5, 0, 3, 25),
  station: definition('station', '社区车站', 'Community station', 2, 2, 500, 12, 0, 5, 0, 4, 12),
  library: definition('library', '图书馆', 'Library', 2, 2, 600, 14, 0, 8, 0, 8),
  fountain: definition('fountain', '喷泉', 'Fountain', 1, 1, 140, 4, 0, 2, 0, 3),
  road: definition('road', '道路', 'Road', 1, 1, 15, 0.2, 0, 0, 0, 0, 0, true),
  lamp: definition('lamp', '路灯', 'Street lamp', 1, 1, 60, 3, 0, 1, 0, 1),
  tree: definition('tree', '绿化树', 'Planted tree', 1, 1, 25, 2, 0, 0, 0, 1),
  harbor: definition('harbor', '民用港务站', 'Civil harbor office', 3, 2, 1000, 18, 0, 10, 0, 3, 55),
  wind: definition('wind', '风力发电机', 'Wind turbine', 1, 2, 350, 9, 45, 0, 0, 0, 0, true),
  silo: definition('silo', '储藏筒仓', 'Storage silo', 1, 1, 180, 6, 0, 2, 0, 0, 8),
};
export const BUILDING_KINDS = Object.keys(BUILDINGS) as BuildingKind[];
export const BUILDING_CATALOG = BUILDINGS;
export const UNITS: Readonly<Record<UnitKind, UnitDefinition>> = {
  mcv: { kind: 'mcv', labelZh: '机动建设车', labelEn: 'Mobile construction vehicle', cost: 1800, speed: 1.8, producer: 'workshop' },
  miner: { kind: 'miner', labelZh: '采矿车', labelEn: 'Ore miner', cost: 800, speed: 2.2, producer: 'refinery' },
  engineer: { kind: 'engineer', labelZh: '工程师', labelEn: 'Engineer', cost: 200, speed: 2.5, producer: 'yard' },
  truck: { kind: 'truck', labelZh: '运输卡车', labelEn: 'Supply truck', cost: 350, speed: 2.8, producer: 'workshop' },
};
export const UNIT_KINDS = Object.keys(UNITS) as UnitKind[];
export const UNIT_CATALOG = UNITS;
export const LIMITS = Object.freeze({ buildings: 400, units: 64, money: 1_000_000_000, time: 1_000_000_000, nextId: 1_000_000_000 });
export const FIXED_STEP = 0.1;
export const MAX_DELTA = 1;
export const ORE_PRICE = 10;
export const MINER_CAPACITY = 20;
export const GOODS_COST = 10;
export const GOODS_PRICE = 35;
export const GOODS_TIME = 20;
