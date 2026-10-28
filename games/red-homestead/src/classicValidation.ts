import { BUILDING_KINDS, UNIT_KINDS } from './content.js';
import type { ClassicBundle, ClassicImage, ClassicMapData, ClassicSpriteBinding, ClassicTile } from './classicTypes.js';
import type { BuildingKind, UnitKind, TerrainCell } from './types.js';
export const CLASSIC_IMAGE_BUDGET = 96 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/;
const imageKey = (key: unknown): key is string => typeof key === 'string' && /^[a-zA-Z0-9_:.\/-]{1,160}$/.test(key) && key !== '__proto__' && key !== 'constructor' && key !== 'prototype';
function obj(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid-classic-object'); return value as Record<string, unknown>; }
function num(value: unknown, min: number, max: number, integer = true): number { if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) throw new Error('invalid-classic-number'); return value; }
function text(value: unknown, max = 160): string { if (typeof value !== 'string' || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new Error('invalid-classic-text'); return value; }
function array(value: unknown, max: number): unknown[] { if (!Array.isArray(value) || value.length > max) throw new Error('invalid-classic-array'); return value; }
export function validateClassicBundle(input: unknown): ClassicBundle {
  const raw = obj(input);
  if (raw.schemaVersion !== 1 || typeof raw.id !== 'string' || !HASH.test(raw.id)) throw new Error('unsupported-classic-bundle');
  const images: Record<string, ClassicImage> = Object.create(null);
  const rawImages = obj(raw.images), keys = Object.keys(rawImages); if (keys.length > 8192) throw new Error('classic-image-count');
  let bytes = 0;
  for (const key of keys) {
    if (!imageKey(key)) throw new Error('classic-image-key');
    const image = obj(rawImages[key]), width = num(image.width, 1, 4096), height = num(image.height, 1, 4096);
    if (width * height > 4_194_304 || !(image.rgba instanceof Uint8ClampedArray) || image.rgba.length !== width * height * 4) throw new Error('classic-image-pixels');
    bytes += image.rgba.length; if (bytes > CLASSIC_IMAGE_BUDGET) throw new Error('classic-image-budget');
    images[key] = { width, height, rgba: image.rgba, anchorX: num(image.anchorX, -8192, 8192, false), anchorY: num(image.anchorY, -8192, 8192, false) };
  }
  const binding = (value: unknown): ClassicSpriteBinding => {
    const b = obj(value); if (!imageKey(b.image) || !images[b.image]) throw new Error('classic-missing-image');
    const out: ClassicSpriteBinding = { image: b.image, sourceName: text(b.sourceName) };
    if (b.shadow !== undefined) { if (!imageKey(b.shadow) || !images[b.shadow]) throw new Error('classic-missing-shadow'); out.shadow = b.shadow; }
    if (b.facings !== undefined) {
      const facings = array(b.facings, 8); if (facings.length !== 8 || facings.some(key => !imageKey(key) || !images[key])) throw new Error('classic-facing-count'); out.facings = facings as string[];
    }
    return out;
  };
  const buildings: ClassicBundle['buildings'] = {}, units: ClassicBundle['units'] = {};
  for (const [key, value] of Object.entries(obj(raw.buildings))) { if (!BUILDING_KINDS.includes(key as BuildingKind)) throw new Error('classic-building-kind'); buildings[key as BuildingKind] = binding(value); }
  for (const [key, value] of Object.entries(obj(raw.units))) { if (!UNIT_KINDS.includes(key as UnitKind)) throw new Error('classic-unit-kind'); units[key as UnitKind] = binding(value); }
  let map: ClassicMapData | null = null;
  if (raw.map !== null) {
    const m = obj(raw.map), width = num(m.width, 4, 256), height = num(m.height, 4, 256);
    if (typeof m.rawMapHash !== 'string' || !HASH.test(m.rawMapHash)) throw new Error('classic-map-hash');
    const rawTerrain = array(m.terrain, 65536); if (rawTerrain.length !== width * height) throw new Error('classic-map-size');
    const terrain: TerrainCell[] = rawTerrain.map(value => {
      const c = obj(value); if (!['grass','snow','water','rock','road','ore','sand','void'].includes(String(c.kind))) throw new Error('classic-terrain-kind');
      const out = { kind: c.kind, height: num(c.height, 0, 15), ore: num(c.ore, 0, 100000) } as TerrainCell;
      if (c.ramp !== undefined) (out as TerrainCell & { ramp: number }).ramp = num(c.ramp, 0, 20);
      if (out.kind !== 'ore' && out.ore !== 0) throw new Error('classic-ore-cell'); return out;
    });
    const tiles: ClassicTile[] = array(m.tiles, 196608).map(value => {
      const t = obj(value); if (!imageKey(t.image) || !images[t.image] || !['ground','overlay','scenery'].includes(String(t.layer))) throw new Error('classic-tile-image');
      const out: ClassicTile = { x: num(t.x, 0, width - 1), y: num(t.y, 0, height - 1), height: num(t.height, 0, 15), image: t.image, layer: t.layer as ClassicTile['layer'] };
      if (t.ore !== undefined) { if (typeof t.ore !== 'boolean') throw new Error('classic-ore-flag'); out.ore = t.ore; } return out;
    });
    const spawn = obj(m.spawn), x = num(spawn.x, 0, width - 3), y = num(spawn.y, 0, height - 3);
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) if (['void','water','rock','ore'].includes(terrain[(y + dy) * width + x + dx]!.kind)) throw new Error('classic-spawn-blocked');
    map = { width, height, terrain, tiles, spawn: { x, y }, theater: text(m.theater, 20), title: text(m.title, 120), rawMapHash: m.rawMapHash };
  }
  const warnings = array(raw.warnings, 512).map(value => text(value, 500));
  const sourceFiles = array(raw.sourceFiles, 12000).map(value => text(value, 512));
  return { schemaVersion: 1, id: raw.id, label: text(raw.label, 120), images, buildings, units, map, warnings, sourceFiles };
}
export function classicBytes(bundle: ClassicBundle): number { return Object.values(bundle.images).reduce((sum, image) => sum + image.rgba.byteLength, 0); }
