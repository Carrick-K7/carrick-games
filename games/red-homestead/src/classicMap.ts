import type { ClassicImage, ClassicImportOptions, ClassicMapData, ClassicTile, LocalSourceFiles } from './classicTypes.js';
import type { Point, TerrainCell, TerrainKind } from './types.js';
import { SourceLibrary, normalizeSourceName } from './classicSources.js';
import { readMapHeader, readMapLines } from './ra2/map.js';
import { decodeMapTerrain } from './ra2/mapTerrain.js';
import { decodePalette } from './ra2/palette.js';
import { decodeTmp } from './ra2/tmp.js';
import type { TmpFile, TmpTile } from './ra2/tmp.js';
import { decodeShp } from './ra2/shp.js';
import { decodeOverlayPack } from './ra2/lcw.js';

export class ClassicMapError extends Error {
  readonly name = 'ClassicMapError';
  readonly recoverable = true;
}
function reject(message: string): never { throw new ClassicMapError(message); }
const THEATERS = {
  TEMPERATE: { ini: ['temperat.ini', 'temperatmd.ini'], extension: 'tem', clear: 'grass' },
  SNOW: { ini: ['snow.ini', 'snowmd.ini'], extension: 'sno', clear: 'snow' },
  URBAN: { ini: ['urban.ini', 'urbanmd.ini'], extension: 'urb', clear: 'grass' },
  NEWURBAN: { ini: ['urbannmd.ini'], extension: 'ubn', clear: 'grass' },
  DESERT: { ini: ['desertmd.ini'], extension: 'des', clear: 'sand' },
  LUNAR: { ini: ['lunarmd.ini'], extension: 'lun', clear: 'sand' },
} as const;
export const CLASSIC_MAP_LIMITS = Object.freeze({ dimension: 256, cells: 65536, images: 4096, decodedBytes: 96 * 1024 * 1024 });
type Ini = Map<string, Map<string, string>>;
type Warn = (message: string) => void;

/** Inert allowlist only. Unknown sections/keys cannot include files, alter rules or run scripts. */
function iniData(bytes: Uint8Array, name: string, options: ClassicImportOptions,
  allowed: (section: string, key: string) => boolean): { sections: Ini; names: Set<string> } {
  const sections: Ini = new Map(), names = new Set<string>();
  let section = '', entries = 0;
  for (const original of readMapLines(bytes, options)) {
    const line = original.split(';', 1)[0].trim();
    if (!line) continue;
    if (line.startsWith('[')) {
      const match = /^\[([^\[\]]{1,128})\]$/.exec(line);
      if (!match) reject(`${name}: malformed INI section`);
      section = match[1].trim().toLowerCase(); names.add(section);
      if (names.size > 4096) reject(`${name}: too many sections`);
    } else {
      const equal = line.indexOf('=');
      if (equal < 1) continue; // ignored data, not a permissive interpreter
      const key = line.slice(0, equal).trim().toLowerCase();
      if (!allowed(section, key)) continue;
      if (++entries > 32768 || key.length > 128 || ['__proto__', 'constructor', 'prototype'].includes(key)) reject(`${name}: unsafe or excessive INI keys`);
      let values = sections.get(section);
      if (!values) { values = new Map(); sections.set(section, values); }
      if (values.has(key)) reject(`${name}: ambiguous duplicate [${section}] ${key}`);
      values.set(key, line.slice(equal + 1).trim());
    }
  }
  return { sections, names };
}
function natural(text: string | undefined, max: number, context: string): number {
  if (text === undefined || !/^\d+$/.test(text) || !Number.isSafeInteger(Number(text)) || Number(text) > max) reject(`${context}: invalid bounded integer`);
  return Number(text);
}
function onlySource(library: SourceLibrary, names: readonly string[], required: boolean): string | undefined {
  const available = names.filter(name => library.has(name));
  if (available.length > 1) reject(`Ambiguous matching resources ${available.join(', ')}; select exactly one matching game/theater version`);
  if (!available.length && required) reject(`Missing local resource: ${names.length ? names.join(' or ') : 'original .map/.mpr (select mapFile explicitly for MIX contents)'}. Supply the matching file; no replacement terrain is generated.${library.warnings.length ? ` ${library.warnings.join(' ')}` : ''}`);
  return available[0];
}
function sourceDecode<T>(name: string, action: () => T): T {
  try { return action(); }
  catch (error) { reject(`${name}: ${error instanceof Error ? error.message : 'Invalid local resource'}`); }
}
interface TileTable { stems: string[]; clear: number | undefined }
/** https://www.modenc2.markjfox.net/IsoMapPack5 and /FileName : cumulative TilesInSet, 01-based filenames. */
function tileTable(bytes: Uint8Array, name: string, options: ClassicImportOptions, warn: Warn): TileTable {
  const { sections, names } = iniData(bytes, name, options, (section, key) =>
    (section === 'general' && key === 'cleartile') || (/^tileset\d{4}$/.test(section) && ['filename', 'tilesinset'].includes(key)));
  const numbered = [...names].filter(section => /^tileset\d{4}$/.test(section)).sort();
  if (!numbered.length) reject(`${name}: missing [TileSet0000] mapping`);
  const stems: string[] = [], starts: number[] = [];
  numbered.forEach((section, index) => {
    if (Number(section.slice(7)) !== index) reject(`${name}: missing [TileSet${String(index).padStart(4, '0')}]; cumulative tile indices would be ambiguous`);
    const values = sections.get(section);
    const count = natural(values?.get('tilesinset'), 99, `${name} [${section}] TilesInSet`);
    const prefix = values?.get('filename');
    if (count && (!prefix || !/^[A-Za-z0-9_-]{1,64}$/.test(prefix))) reject(`${name} [${section}]: missing/unsafe FileName prefix`);
    starts.push(stems.length);
    for (let tile = 1; tile <= count; tile++) stems.push(`${prefix!.toLowerCase()}${String(tile).padStart(2, '0')}`);
    if (stems.length > 65535) reject(`${name}: tile index table exceeds 65535 entries`);
  });
  const clearValue = sections.get('general')?.get('cleartile');
  if (clearValue === undefined) {
    warn(`${name}: [General] ClearTile absent; no default ground mapping is assumed.`);
    return { stems, clear: undefined };
  }
  // General roles name TILE SETS, not theater-global individual tile indices.
  // https://opents-developers.github.io/OpenTS/formats/theater-control/
  const clearSet = natural(clearValue, starts.length - 1, `${name} ClearTile`);
  const clear = starts[clearSet];
  if (!stems[clear] || (starts[clearSet + 1] !== undefined && starts[clearSet + 1] === clear)) reject(`${name}: ClearTile references an empty tileset`);
  return { stems, clear };
}

/** TMP landType values are format-specific, not the rules.ini LandType enumeration.
 * https://www.modenc2.markjfox.net/TMP#Explanation . Tunnels are conservatively blocked.
 */
export function classicLandType(value: number, clear: TerrainKind): TerrainKind {
  if ([0, 1, 13, 14].includes(value)) return clear;
  if ([2, 3, 4].includes(value)) return 'snow';
  if ([5, 7, 8, 15].includes(value)) return 'rock';
  if (value === 9) return 'water';
  if (value === 10) return 'sand';
  if ([6, 11, 12].includes(value)) return 'road';
  return reject(`Unknown TMP landType ${value}; terrain is not substituted`);
}

/** Composite this subcell, NOT the whole multi-cell template. Anchor is the diamond TOP vertex.
 * Signed extra offsets are relative to the TMP coordinate plane, not relative to its base image.
 */
export function composeClassicTile(tile: TmpTile): ClassicImage {
  const extra = tile.extra;
  const left = Math.min(tile.x, extra?.x ?? tile.x), top = Math.min(tile.y, extra?.y ?? tile.y);
  const right = Math.max(tile.x + tile.width, extra ? extra.x + extra.width : -Infinity);
  const bottom = Math.max(tile.y + tile.height, extra ? extra.y + extra.height : -Infinity);
  const width = right - left, height = bottom - top;
  if (width > 4096 || height > 4096 || width * height > 4 * 1024 * 1024) reject('TMP composite image exceeds pixel budget');
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (const image of extra ? [tile, extra] : [tile]) {
    for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
      const src = (y * image.width + x) * 4;
      if (!image.rgba[src + 3]) continue;
      const dst = ((image.y - top + y) * width + image.x - left + x) * 4;
      rgba.set(image.rgba.subarray(src, src + 4), dst);
    }
  }
  return { width, height, rgba, anchorX: tile.x + tile.width / 2 - left, anchorY: tile.y - top };
}
function inDiamond(x: number, y: number, width: number, height: number): boolean {
  return x > 0 && y > 0 && x + y >= width + 1 && x + y <= width + height * 2 && Math.abs(x - y) <= width - 1;
}
function findSpawn(terrain: TerrainCell[], side: number, waypoints: Map<string, string> | undefined, excluded: Set<number>, warn: Warn): Point {
  const targets: { id: number; x: number; y: number }[] = [];
  for (const [id, packed] of waypoints ?? []) {
    if (!/^\d+$/.test(id) || Number(id) > 701 || !/^\d+$/.test(packed) || Number(packed) > 511511) {
      warn('Negative/script or malformed waypoints were ignored, not executed.'); continue;
    }
    const position = Number(packed), x = position % 1000, y = Math.floor(position / 1000);
    if (x < side && y < side && terrain[y * side + x].kind !== 'void') targets.push({ id: Number(id), x, y });
  }
  targets.sort((a, b) => a.id - b.id);
  const target = targets[0] ?? { x: Math.floor(side / 2), y: Math.floor(side / 2) };
  let best: Point | undefined, distance = Infinity;
  for (let y = 1; y < side - 2; y++) for (let x = 1; x < side - 2; x++) {
    const height = terrain[y * side + x].height;
    let safe = true;
    for (let dy = 0; dy < 3 && safe; dy++) for (let dx = 0; dx < 3; dx++) {
      const index = (y + dy) * side + x + dx, cell = terrain[index];
      if (excluded.has(index) || ['void', 'water', 'rock', 'ore'].includes(cell.kind) || cell.height !== height || cell.ramp) { safe = false; break; }
    }
    if (!safe) continue;
    const squared = (x - target.x) ** 2 + (y - target.y) ** 2;
    if (squared < distance) { distance = squared; best = { x, y }; }
  }
  if (!best) reject('No safe 3x3 flat land for the peaceful MCV: water, cliffs, slopes, ore and unimplemented scenery are excluded.');
  if (!targets.length || distance) warn(`Spawn uses safe 3x3 land at (${best.x},${best.y})${targets.length ? ` nearest legal waypoint ${targets[0].id}` : '; no legal waypoint was available'}. Original heights were not flattened.`);
  return best;
}

/** Compile selected local MAP/MPR + theater INI + PAL + TMP. No fetch, engine script or thumbnail terrain.
 * Format research is documented above; source-code licensing never grants rights to game artwork.
 */
export async function compileClassicMap(files: LocalSourceFiles, options: ClassicImportOptions): Promise<{
  map: ClassicMapData; images: Record<string, ClassicImage>; warnings: string[];
}> {
  const library = new SourceLibrary(files), warnings: string[] = [], warned = new Set<string>();
  const warn: Warn = message => { if (!warned.has(message)) { warned.add(message); if (warnings.length < 255) warnings.push(message); else if (warnings.length === 255) warnings.push('Additional import diagnostics were suppressed after 255 messages.'); } };
  library.warnings.forEach(warn);
  const mapNames = library.knownNames().filter(name => /\.(map|mpr)$/.test(name));
  const mapName = options.mapFile ? normalizeSourceName(options.mapFile) : onlySource(library, mapNames, true)!;
  if (!/\.(map|mpr)$/.test(mapName)) reject(`${mapName}: select an original .map or .mpr file`);
  const bytes = library.get(mapName);
  if (!bytes) reject(`Missing local map: ${mapName}`);
  const header = sourceDecode(mapName, () => readMapHeader(bytes, options));
  if (options.theater && options.theater !== header.theater) reject(`${mapName}: selected theater ${options.theater} does not match original ${header.theater}`);
  const { width, height } = header.size, side = width + height + 1;
  if (side < 4 || side > CLASSIC_MAP_LIMITS.dimension || side * side > CLASSIC_MAP_LIMITS.cells) reject(`${mapName}: original-coordinate grid ${side}x${side} exceeds supported 4..256 / 65536 cells`);
  const theater = THEATERS[header.theater];
  const metadata = iniData(bytes, mapName, options, (section, key) =>
    (section === 'basic' && key === 'name') || section === 'waypoints' || section === 'terrain');
  const iniName = onlySource(library, theater.ini, true)!;
  const table = tileTable(library.get(iniName)!, iniName, options, warn);
  const paletteName = `iso${theater.extension}.pal`;
  onlySource(library, [paletteName], true);
  const palette = sourceDecode(paletteName, () => decodePalette(library.get(paletteName)!));
  const records = metadata.names.has('isomappack5') ? sourceDecode(mapName, () => decodeMapTerrain(bytes, options)).tiles : [];
  if (!metadata.names.has('isomappack5')) warn(`${mapName}: IsoMapPack5 absent; the documented blank-map rule fills only level-0 clear cells from ${iniName}, not PreviewPack.`);
  const terrain: TerrainCell[] = Array.from({ length: side * side }, () => ({ kind: 'void', height: 0, ore: 0 }));
  const tiles: ClassicTile[] = [], images: Record<string, ClassicImage> = Object.create(null);
  const cache = new Map<string, TmpFile>();
  let allocated = 0, imageCount = 0;
  const budget = (count: number) => { allocated += count; if (allocated > CLASSIC_MAP_LIMITS.decodedBytes) reject('Combined decoded map images exceed 96 MiB budget'); };
  const addImage = (key: string, image: ClassicImage) => {
    if (++imageCount > CLASSIC_MAP_LIMITS.images) reject('Map has more than 4096 unique images');
    budget(image.rgba.byteLength); images[key] = image;
  };
  const excluded = new Set<number>();
  const clearIndex = () => table.clear ?? reject(`${iniName}: missing [General] ClearTile mapping for omitted/sentinel cells; no ground is guessed`);
  const install = (x: number, y: number, index: number, subIndex: number, level: number) => {
    if (index === 0xffff) { index = clearIndex(); subIndex = 0; }
    const stem = table.stems[index];
    if (!stem) reject(`${iniName}: tile index ${index} at (${x},${y}) has no TileSet mapping; required TMP filename cannot be resolved`);
    const name = onlySource(library, [`${stem}.${theater.extension}`, `${stem}.tmp`], true)!;
    let file = cache.get(name);
    if (!file) {
      file = sourceDecode(name, () => decodeTmp(library.get(name)!, palette));
      if (file.tileWidth !== 60 || file.tileHeight !== 30) reject(`${name}: only RA2 60x30 tiles can be compiled into this scene`);
      for (const tile of file.tiles) if (tile) budget(tile.rgba.byteLength + tile.indices.byteLength + tile.coverage.byteLength + (tile.zData?.byteLength ?? 0) +
        (tile.extra ? tile.extra.rgba.byteLength + tile.extra.indices.byteLength + (tile.extra.zData?.byteLength ?? 0) : 0));
      cache.set(name, file);
    }
    const tile = file.tiles[subIndex];
    if (!tile) reject(`${name}: missing/null subTileIndex ${subIndex} for original cell (${x},${y})`);
    if (level > 15 || tile.slopeType > 20) reject(`${name}: unsupported level ${level} / ramp ${tile.slopeType} at (${x},${y})`);
    const kind = sourceDecode(name, () => classicLandType(tile.landType, theater.clear));
    terrain[y * side + x] = { kind, height: level, ore: 0, ...(tile.slopeType ? { ramp: tile.slopeType } : {}) };
    const key = `terrain:${name}:${subIndex}`;
    if (!images[key]) addImage(key, sourceDecode(name, () => composeClassicTile(tile)));
    tiles.push({ x, y, height: level, image: key, layer: 'ground' });
    if (tile.damagedData !== 'absent') { warn(`${name}: bridge/damaged state and per-pixel Z occlusion are not implemented; original base/extra art only.`); excluded.add(y * side + x); }
    if (tile.landType === 5) warn(`${name}: tunnel traversal/roof animations are unsupported; tunnel cells are blocked.`);
  };
  const occupied = new Set<number>();
  for (const cell of records) { install(cell.x, cell.y, cell.tileIndex, cell.subTileIndex, cell.level); occupied.add(cell.y * side + cell.x); }
  let omitted = 0;
  for (let y = 1; y < side; y++) for (let x = 1; x < side; x++) if (inDiamond(x, y, width, height) && !occupied.has(y * side + x)) {
    install(x, y, clearIndex(), 0, 0); omitted++;
  }
  if (omitted) warn(`${mapName}: ${omitted} omitted clear cells explicitly filled at level 0 using ${iniName} ClearTile -> ${table.stems[clearIndex()]}.${theater.extension} (or .tmp), source ${library.provenance(iniName)}.`);
  warn('Terrain uses deterministic base TMP variants. Tile animations, lighting, per-pixel Z occlusion and full original bridge behavior are not reproduced.');
  for (const section of ['units', 'infantry', 'structures', 'aircraft', 'triggers', 'events', 'actions', 'scripts', 'taskforces', 'teamtypes', 'tags', 'celltags']) {
    if (metadata.names.has(section)) warn(`${mapName}: [${section}] is ignored; no war units, original structures or scripts are imported/executed.`);
  }
  for (const [packed, type] of metadata.sections.get('terrain') ?? []) {
    if (/^\d+$/.test(packed)) { const n = Number(packed), x = n % 1000, y = Math.floor(n / 1000); if (x < side && y < side) excluded.add(y * side + x); }
    warn(`${mapName}: scenery ${type.slice(0, 64)} at ${packed} is not imported (requires matching local SHP/art mapping); no substitute scenery is drawn.`);
  }
  importOverlays(bytes, options, library, iniName.includes('md.'), theater.extension, terrain, side, tiles, images, excluded, palette, warn, budget, addImage);
  const spawn = findSpawn(terrain, side, metadata.sections.get('waypoints'), excluded, warn);
  const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer);
  const rawMapHash = Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('');
  return { map: { width: side, height: side, terrain, tiles, spawn, theater: header.theater,
    title: (metadata.sections.get('basic')?.get('name') || mapName).slice(0, 160), rawMapHash }, images, warnings };
}

function importOverlays(bytes: Uint8Array, options: ClassicImportOptions, library: SourceLibrary, md: boolean, extension: string,
  terrain: TerrainCell[], side: number, tiles: ClassicTile[], images: Record<string, ClassicImage>, excluded: Set<number>,
  palette: Uint8ClampedArray, warn: Warn, budget: (bytes: number) => void, addImage: (key: string, image: ClassicImage) => void): void {
  const indices = decodeOverlayPack(bytes, 'OverlayPack', options);
  const frames = decodeOverlayPack(bytes, 'OverlayDataPack', options);
  if (!indices) { warn('OverlayPack absent: no ore, bridge overlays or scenery overlays were synthesized.'); return; }
  if (!frames) warn('OverlayDataPack absent: overlay frames cannot be reproduced; no replacement graphics are drawn.');
  // Even without rules/art, an occupied overlay may be a wall/bridge: never deploy on it.
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    if (indices[x + 512 * y] !== 255) excluded.add(y * side + x);
  }
  const rulesName = md ? 'rulesmd.ini' : 'rules.ini', rulesBytes = library.get(rulesName);
  if (!rulesBytes) { warn(`Missing ${rulesName}: OverlayTypes IDs cannot be identified; ore and bridge/scenery overlays were not invented.`); return; }
  const rules = iniData(rulesBytes, rulesName, options, (section, key) => section === 'overlaytypes' || ['image', 'tiberium'].includes(key)).sections;
  // Overlay indices count LIST ENTRIES in declaration order, not the arbitrary INI keys.
  // Map retains insertion order; numeric key sorting/Object.values would silently corrupt this mapping.
  const types = [...(rules.get('overlaytypes')?.values() ?? [])];
  if (types.some(type => !/^[A-Za-z0-9_-]{1,64}$/.test(type)) || new Set(types.map(type => type.toLowerCase())).size !== types.length) {
    reject(`${rulesName}: empty/unsafe/duplicate OverlayTypes registrations are unsupported; refusing shifted overlay IDs`);
  }
  const artName = md ? 'artmd.ini' : 'art.ini', artBytes = library.get(artName);
  const art = artBytes ? iniData(artBytes, artName, options, (_section, key) => ['theater', 'image', 'palette'].includes(key)).sections : new Map<string, Map<string, string>>();
  const requests = new Map<string, { x: number; y: number; frame: number; ore: boolean }[]>();
  let resources = 0;
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const id = indices[x + 512 * y], cell = terrain[y * side + x];
    if (id === 255 || cell.kind === 'void') continue;
    const type = types[id];
    if (!type || !/^[A-Za-z0-9_-]{1,64}$/.test(type)) { excluded.add(y * side + x); warn(`${rulesName}: overlay index ${id} is missing/unsafe in [OverlayTypes]; artwork and behavior omitted.`); continue; }
    const rule = rules.get(type.toLowerCase());
    const image = rule?.get('image') ?? type;
    // RA2's ore is often registered as TIB01, with its artwork named separately.
    // The local Tiberium flag is DATA identifying a resource, never an instruction to grow it.
    // https://www.modenc2.markjfox.net/OverlayTypes
    const resource = /^(GOLD|GEM)\d{2}$/i.test(type) || /^(GOLD|GEM)\d{2}$/i.test(image) || /^(yes|true|1)$/i.test(rule?.get('tiberium') ?? '');
    if (!resource) { excluded.add(y * side + x); warn(`${rulesName}: overlay ${type} (including possible bridge/wall/scenery behavior) is unsupported and not drawn; no substitute art.`); continue; }
    if (['water', 'rock'].includes(cell.kind)) { warn(`${type} ore at (${x},${y}) lies on non-traversable TMP terrain and was not made mineable.`); continue; }
    const frame = frames?.[x + 512 * y];
    cell.kind = 'ore'; cell.ore = /^GEM\d{2}$/i.test(type) || /^GEM\d{2}$/i.test(image) ? 200 : 100; resources++;
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(image)) { warn(`${rulesName}: invalid Image for ${type}; resource artwork omitted.`); continue; }
    const definition = art.get(image.toLowerCase());
    const artImage = definition?.get('image') ?? image;
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(artImage)) { warn(`${artName}: unsafe Image for ${type}; resource artwork omitted.`); continue; }
    const theaterFlag = definition?.get('theater');
    const candidates = /^(yes|true|1)$/i.test(theaterFlag ?? '') ? [`${artImage}.${extension}`] : [`${artImage}.shp`, `${artImage}.${extension}`];
    const name = onlySource(library, candidates, false);
    if (!name) { warn(`Missing overlay art ${candidates.join(' or ')} for ${type}; finite ore remains at its original cell, with no replacement drawing.`); continue; }
    if (definition?.has('palette')) { warn(`${artName}: custom Palette for ${type} is unsupported; ${name} not drawn with a guessed palette.`); continue; }
    if (frame === undefined) continue;
    const entries = requests.get(name) ?? []; entries.push({ x, y, frame, ore: true }); requests.set(name, entries);
  }
  for (const [name, cells] of requests) {
    const file = sourceDecode(name, () => decodeShp(library.get(name)!, palette));
    budget(file.frames.reduce((sum, frame) => sum + frame.rgba.byteLength + frame.indices.byteLength, 0));
    for (const cell of cells) {
      const frame = file.frames[cell.frame];
      if (!frame || !frame.width || !frame.height || frame.dataOffset === 0) { warn(`${name}: missing overlay frame ${cell.frame}; no substitute art drawn.`); continue; }
      const key = `overlay:${name.toLowerCase()}:${cell.frame}`;
      if (!images[key]) addImage(key, { width: frame.width, height: frame.height, rgba: frame.rgba,
        anchorX: file.width / 2 - frame.x, anchorY: file.height / 2 - 15 - frame.y });
      tiles.push({ x: cell.x, y: cell.y, height: terrain[cell.y * side + cell.x].height, layer: 'overlay', image: key, ore: true });
    }
  }
  if (resources) warn(`${resources} resource cells identified from local ${rulesName} OverlayTypes and GOLD/GEM Image or Tiberium flag. Peaceful finite economy: ore=100 and GEM=200 units/cell; no regrowth, original combat or ore-spawn scripts.`);
}
