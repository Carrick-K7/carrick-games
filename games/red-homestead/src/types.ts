/** Pure, JSON-safe schema. Coordinates are integer tile origins; time/durations are seconds.
 * Rendering, wall-clock time, storage, audio and assets deliberately live outside this module.
 */
export type WorldMode = 'session' | 'homestead';
export type EconomyMode = 'classic' | 'creative';
export type TerrainKind = 'grass' | 'snow' | 'water' | 'rock' | 'road' | 'ore' | 'sand' | 'void';
export type BuildingKind =
  | 'yard' | 'power' | 'refinery' | 'house' | 'apartment' | 'market' | 'park'
  | 'clinic' | 'school' | 'workshop' | 'warehouse' | 'greenhouse' | 'station'
  | 'library' | 'fountain' | 'road' | 'lamp' | 'tree' | 'harbor' | 'wind' | 'silo';
export type UnitKind = 'mcv' | 'miner' | 'engineer' | 'truck';
export interface Point { x: number; y: number }
export interface TerrainCell {
  kind: TerrainKind;
  /** Integer elevation 0..15. Navigation cannot cross cliffs or steps above one level. */
  height: number;
  /** Finite raw ore units; zero on every non-ore cell. */
  ore: number;
  /** TMP ramp type 0..20; zero/absent is flat. A one-level step requires a nonzero ramp endpoint. */
  ramp?: number;
}
export interface BuildingDefinition {
  kind: BuildingKind;
  labelZh: string;
  labelEn: string;
  footprint: { width: number; height: number };
  cost: number;
  buildTime: number;
  powerProduced: number;
  powerUsed: number;
  capacity: number;
  happiness: number;
  /** Passive revenue per simulated minute at full power. */
  income: number;
  /** Essential buildings continue construction normally during a power shortage. */
  essential: boolean;
  /** Only roads permit movement through their footprint. */
  walkable: boolean;
}
export interface UnitDefinition {
  kind: UnitKind;
  labelZh: string;
  labelEn: string;
  cost: number;
  /** Ground tiles per second; complete roads multiply movement by 1.5. */
  speed: number;
  producer: BuildingKind;
}
export interface Building extends Point {
  id: string;
  kind: BuildingKind;
  progress: number;
  /** Prevents spawning more than one complimentary miner per refinery. */
  minerSpawned: boolean;
  /** Workshop's finite goods inventory (0..10, 20 with a completed warehouse). */
  stock: number;
  /** Workshop production timer, paused when unpowered, full or unaffordable. */
  productionProgress: number;
}
export type UnitTask = 'idle' | 'move' | 'to-ore' | 'mining' | 'to-refinery' | 'unloading'
  | 'to-build' | 'building' | 'to-workshop' | 'loading' | 'to-market' | 'delivering';
export interface Unit extends Point {
  id: string;
  kind: UnitKind;
  task: UnitTask;
  /** Remaining orthogonal tile route, excluding current tile. */
  path: Point[];
  /** Fraction of travel to path[0]; x/y remain at the last reached tile. */
  moveProgress: number;
  /** Work/unload/retry timer in seconds; saved rather than reconstructed. */
  timer: number;
  /** Miner: raw ore units (0..20); truck: crates (0..1); others: zero. */
  cargo: number;
  target: Point | null;
  targetId: string | null;
}
export interface WorldStats {
  money: number;
  powerProduced: number;
  powerUsed: number;
  population: number;
  capacity: number;
  happiness: number;
  /** Current recurring civic income per simulated minute, excluding mining/deliveries. */
  income: number;
}
export interface WorldSource {
  kind: 'ra2-local';
  /** Lowercase SHA-256 fingerprints only; decoded images/source bytes never enter a world. */
  bundleId: string;
  mapHash: string;
  label: string;
  theater: string;
}
export interface World {
  schemaVersion: 2;
  source: WorldSource | null;
  /** Optional local artwork bundle fingerprint, including for builtin development maps. */
  materialsId: string | null;
  id: string;
  name: string;
  mode: WorldMode;
  economy: EconomyMode;
  mapId: string;
  time: number;
  status: 'playing' | 'ended';
  money: number;
  /** Shared monotonic numeric suffix for b-N and u-N IDs. */
  nextId: number;
  width: number;
  height: number;
  /** Row-major, exactly width * height cells. */
  terrain: TerrainCell[];
  buildings: Building[];
  units: Unit[];
  /** Fixed-step remainder; restores do not use wall-clock elapsed time. */
  accumulator: number;
  /** Fractional population; getStats rounds down for display. */
  population: number;
  /** Uncredited fractional currency from civic income. */
  incomeRemainder: number;
  /** Auditable cumulative amounts, excluding initial money and refunds. */
  oreDelivered: number;
  goodsDelivered: number;
}
export interface CreateImportedWorldOptions {
  mode: WorldMode;
  economy: EconomyMode;
  name?: string;
}
export interface CreateWorldOptions extends CreateImportedWorldOptions {
  mapId: string;
}
export type ActionCode = 'ok' | 'ended' | 'invalid-kind' | 'out-of-bounds' | 'invalid-position'
  | 'blocked-terrain' | 'occupied' | 'unit-in-way' | 'insufficient-funds' | 'needs-yard'
  | 'deploy-mcv' | 'building-limit' | 'unit-limit' | 'id-limit' | 'not-found'
  | 'needs-shore' | 'needs-producer' | 'no-exit';
export interface ActionResult { ok: boolean; reason: ActionCode }
export interface MapDefinition {
  id: string;
  labelZh: string;
  labelEn: string;
  descriptionZh: string;
  descriptionEn: string;
  width: number;
  height: number;
  seed: number;
  spawn: Point;
  /** These are original development fixtures, never original/replicated RA2 maps. */
  provenance: 'original-development';
}
