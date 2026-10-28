import type { BuildingKind, UnitKind, TerrainCell, Point } from './types.js';

/** Private browser-local material data. No source bytes are published or included in world exports. */
export interface ClassicImage {
  width: number; height: number; rgba: Uint8ClampedArray;
  /** Pixel origin measured from the top-left of this decoded image. */
  anchorX: number; anchorY: number;
}
export interface ClassicTile {
  x: number; y: number; height: number; image: string;
  layer: 'ground' | 'overlay' | 'scenery';
  /** Mining removes this presentation when the corresponding simulation cell is exhausted. */
  ore?: boolean;
}
export interface ClassicSpriteBinding {
  image: string; shadow?: string; facings?: string[];
  /** Only pre-reviewed peaceful body images can be bound to simulation objects. */
  sourceName: string;
}
export interface ClassicMapData {
  width: number; height: number; terrain: TerrainCell[]; tiles: ClassicTile[];
  spawn: Point; theater: string; title: string; rawMapHash: string;
}
export interface ClassicBundle {
  schemaVersion: 1;
  /** SHA-256 of a canonical inventory of input bytes, not the user's filesystem path. */
  id: string; label: string;
  images: Record<string, ClassicImage>;
  buildings: Partial<Record<BuildingKind, ClassicSpriteBinding>>;
  units: Partial<Record<UnitKind, ClassicSpriteBinding>>;
  map: ClassicMapData | null;
  warnings: string[];
  sourceFiles: string[];
}
export interface ClassicImportOptions {
  label?: string;
  mapFile?: string;
  theater?: 'TEMPERATE' | 'SNOW' | 'URBAN' | 'NEWURBAN' | 'DESERT' | 'LUNAR';
  encoding?: 'utf-8' | 'windows-1252' | 'gb18030';
}
export type LocalSourceFiles = ReadonlyMap<string, Uint8Array>;
