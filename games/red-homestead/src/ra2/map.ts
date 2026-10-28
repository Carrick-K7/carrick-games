import { BinaryReader, RA2_LIMITS, fail } from './binary.js';

export interface MapRect { x: number; y: number; width: number; height: number }
export interface MapPlacement {
  kind: 'unit' | 'infantry' | 'structure' | 'aircraft' | 'terrain';
  key: string;
  type: string;
  x: number;
  y: number;
  owner?: string;
  health?: number;
  facing?: number;
  subCell?: number;
}
export interface Ra2MapMetadata {
  /** This is never a playable/decoded map; triggers, rules, overlays and terrain are not imported. */
  kind: 'metadata-only';
  name?: string;
  theater: 'TEMPERATE' | 'SNOW' | 'URBAN' | 'NEWURBAN' | 'DESERT' | 'LUNAR';
  size: MapRect;
  localSize?: MapRect;
  placements: MapPlacement[];
  waypoints: { id: number; x: number; y: number }[];
  /** Unsupported by THIS metadata-only path. Use decoder for terrain; old reason remains for serialized-data compatibility. */
  terrain: { status: 'unsupported'; format: 'IsoMapPack5'; reason: 'LZO_NOT_IMPLEMENTED' | 'SEPARATE_TERRAIN_DECODER'; decoder?: 'decodeMapTerrain' } | { status: 'absent' };
  /** Lowercase whitelist section/key names; null-prototype records, no executable interpretation. */
  sections: Readonly<Record<string, Readonly<Record<string, string>>>>;
  ignoredSections: string[];
}
export interface MapParseOptions { encoding?: 'utf-8' | 'windows-1252' | 'gb18030' }

const WHITELIST = new Set(['basic', 'map', 'units', 'infantry', 'structures', 'aircraft', 'terrain', 'waypoints']);
const BASIC_KEYS = new Set(['name', 'newiniformat']);
const MAP_KEYS = new Set(['size', 'localsize', 'theater']);
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function integer(value: string | undefined, label: string, min: number, max: number): number {
  if (value === undefined || !/^-?\d+$/.test(value)) fail('INI', 'INVALID_FORMAT', `Invalid integer: ${label}`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) fail('INI', 'INVALID_FORMAT', `Out-of-range integer: ${label}`);
  return number;
}
function rect(value: string | undefined, label: string): MapRect {
  if (!value) fail('INI', 'INVALID_FORMAT', `Missing ${label}`);
  const parts = value.split(',').map(part => part.trim());
  if (parts.length !== 4) fail('INI', 'INVALID_FORMAT', `Expected four values in ${label}`);
  return { x: integer(parts[0], label, 0, 4095), y: integer(parts[1], label, 0, 4095),
    width: integer(parts[2], label, 1, 512), height: integer(parts[3], label, 1, 512) };
}
function identifier(value: string | undefined, label: string): string {
  if (!value || value.length > 128 || !/^[A-Za-z0-9_ .<>-]+$/.test(value)) fail('INI', 'INVALID_FORMAT', `Invalid ${label}`);
  return value;
}
function cell(value: string): { x: number; y: number } {
  const packed = integer(value, 'packed cell coordinate', 0, 4095999);
  return { x: packed % 1000, y: Math.floor(packed / 1000) };
}

/** Shared bounded text handling for metadata and the separate packed-terrain decoder. */
export function readMapLines(bytes: Uint8Array, options: MapParseOptions = {}): string[] {
  new BinaryReader(bytes, 'INI', RA2_LIMITS.maxMapBytes);
  if (!options || typeof options !== 'object') fail('INI', 'INVALID_INPUT', 'Invalid map options');
  const encoding = options.encoding ?? 'utf-8';
  if (!['utf-8', 'windows-1252', 'gb18030'].includes(encoding)) fail('INI', 'INVALID_INPUT', 'Unsupported text encoding option');
  let text: string;
  try { text = new TextDecoder(encoding, { fatal: true }).decode(bytes); }
  catch { fail('INI', 'INVALID_FORMAT', 'Invalid map text; select the correct text encoding'); }
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text)) fail('INI', 'INVALID_FORMAT', 'Map text contains binary/control bytes');
  const lines = text.replace(/^\ufeff/, '').split(/\r\n|\n|\r/, RA2_LIMITS.maxMapLines + 1);
  if (lines.length > RA2_LIMITS.maxMapLines) fail('INI', 'LIMIT_EXCEEDED', 'Map line limit exceeded');
  if (lines.some(line => line.length > RA2_LIMITS.maxLineLength)) fail('INI', 'LIMIT_EXCEEDED', 'Map line length limit exceeded');
  return lines;
}

/** Parse inert map metadata only. INI includes, rule overrides and scripts are not followed.
 * For terrain records explicitly call decodeMapTerrain; this API never decompresses them.
 */
export function parseMapIni(bytes: Uint8Array, options: MapParseOptions = {}): Ra2MapMetadata {
  return parseMapContainer(bytes, options, true);
}

/** Internal header-only path: packed graphics do not execute/import object or waypoint data. */
export function readMapHeader(bytes: Uint8Array, options: MapParseOptions = {}): Pick<Ra2MapMetadata, 'size' | 'localSize' | 'theater'> {
  const { size, localSize, theater } = parseMapContainer(bytes, options, false);
  return { size, localSize, theater };
}

function parseMapContainer(bytes: Uint8Array, options: MapParseOptions, includePlacements: boolean): Ra2MapMetadata {
  const lines = readMapLines(bytes, options);
  const sections: Record<string, Record<string, string>> = Object.create(null);
  const ignored = new Set<string>();
  let current = '', entries = 0, packedTerrain = false;
  for (const original of lines) {
    if (original.length > RA2_LIMITS.maxLineLength) fail('INI', 'LIMIT_EXCEEDED', 'Map line length limit exceeded');
    const line = original.split(';', 1)[0].trim();
    if (!line) continue;
    if (line.startsWith('[')) {
      const match = /^\[([^\[\]]{1,128})\]$/.exec(line);
      if (!match) fail('INI', 'INVALID_FORMAT', 'Malformed INI section');
      current = match[1].trim().toLowerCase();
      if (current === 'isomappack5') packedTerrain = true;
      if (WHITELIST.has(current)) sections[current] ??= Object.create(null) as Record<string, string>;
      else {
        ignored.add(current);
        if (ignored.size > 4096) fail('INI', 'LIMIT_EXCEEDED', 'Too many unknown INI sections');
      }
      continue;
    }
    if (!WHITELIST.has(current)) continue;
    const equal = line.indexOf('=');
    if (equal <= 0) fail('INI', 'INVALID_FORMAT', 'Malformed key/value in whitelisted INI section');
    const key = line.slice(0, equal).trim().toLowerCase(), value = line.slice(equal + 1).trim();
    if (!key || key.length > 128 || UNSAFE_KEYS.has(key)) fail('INI', 'INVALID_FORMAT', 'Unsafe/invalid INI key');
    if ((current === 'basic' && !BASIC_KEYS.has(key)) || (current === 'map' && !MAP_KEYS.has(key))) continue;
    if (++entries > RA2_LIMITS.maxMapEntries) fail('INI', 'LIMIT_EXCEEDED', 'Map metadata entry limit exceeded');
    if (Object.prototype.hasOwnProperty.call(sections[current], key)) fail('INI', 'INVALID_FORMAT', 'Duplicate INI metadata key');
    sections[current][key] = value;
  }
  const map = sections.map;
  if (!map) fail('INI', 'INVALID_FORMAT', 'Missing [Map] section');
  const version = sections.basic?.newiniformat;
  if (version !== undefined && integer(version, 'NewINIFormat', 0, 65535) !== 4) {
    fail('INI', 'UNSUPPORTED', 'Only TS/RA2 NewINIFormat=4 metadata is supported');
  }
  const theater = map.theater?.toUpperCase();
  if (!theater || !['TEMPERATE', 'SNOW', 'URBAN', 'NEWURBAN', 'DESERT', 'LUNAR'].includes(theater)) {
    fail('INI', 'UNSUPPORTED', 'Unknown or missing map theater');
  }
  const size = rect(map.size, 'Map.Size');
  const localSize = map.localsize === undefined ? undefined : rect(map.localsize, 'Map.LocalSize');
  if (localSize && (localSize.x < size.x || localSize.y < size.y ||
    localSize.x + localSize.width > size.x + size.width || localSize.y + localSize.height > size.y + size.height)) {
    fail('INI', 'INVALID_FORMAT', 'LocalSize exceeds Map.Size');
  }
  const placements: MapPlacement[] = [];
  const placementSections = { units: 'unit', infantry: 'infantry', structures: 'structure', aircraft: 'aircraft' } as const;
  for (const [section, kind] of includePlacements ? Object.entries(placementSections) : []) {
    for (const [key, value] of Object.entries(sections[section] ?? {})) {
      const fields = value.split(',').map(field => field.trim());
      if (fields.length < (kind === 'infantry' ? 8 : 6) || fields.length > 32) fail('INI', 'INVALID_FORMAT', 'Invalid placement field count');
      placements.push({ kind, key, owner: identifier(fields[0], 'owner'), type: identifier(fields[1], 'object type'),
        health: integer(fields[2], 'health', 0, 256), x: integer(fields[3], 'cell x', 0, 4095),
        y: integer(fields[4], 'cell y', 0, 4095), facing: integer(fields[kind === 'infantry' ? 7 : 5], 'facing', 0, 255),
        ...(kind === 'infantry' ? { subCell: integer(fields[5], 'infantry subcell', 0, 4) } : {}) });
    }
  }
  for (const [key, value] of includePlacements ? Object.entries(sections.terrain ?? {}) : []) {
    if (version === undefined) fail('INI', 'UNSUPPORTED', 'Terrain coordinate encoding requires explicit NewINIFormat=4');
    placements.push({ kind: 'terrain', key, type: identifier(value, 'terrain type'), ...cell(key) });
  }
  const waypoints = (includePlacements ? Object.entries(sections.waypoints ?? {}) : []).map(([key, value]) => ({
    id: integer(key, 'waypoint id', 0, 701), ...cell(value),
  }));
  for (const section of Object.values(sections)) Object.freeze(section);
  return { kind: 'metadata-only', name: sections.basic?.name, theater: theater as Ra2MapMetadata['theater'], size, localSize,
    placements, waypoints, sections: Object.freeze(sections), ignoredSections: [...ignored],
    terrain: packedTerrain ? { status: 'unsupported', format: 'IsoMapPack5', reason: 'SEPARATE_TERRAIN_DECODER', decoder: 'decodeMapTerrain' } : { status: 'absent' } };
}
