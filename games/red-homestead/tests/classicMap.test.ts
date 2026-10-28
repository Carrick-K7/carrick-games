import { describe, expect, it } from 'vitest';
import { classicLandType, compileClassicMap } from '../src/classicMap.js';

// Hand-built data fixtures only. No original map, palette, INI or artwork is redistributed.
const utf8 = (value: string) => new TextEncoder().encode(value);
const put16 = (bytes: Uint8Array, at: number, value: number) => new DataView(bytes.buffer).setUint16(at, value, true);
const put32 = (bytes: Uint8Array, at: number, value: number) => new DataView(bytes.buffer).setUint32(at, value, true);
const putSigned = (bytes: Uint8Array, at: number, value: number) => new DataView(bytes.buffer).setInt32(at, value, true);
const b64 = (bytes: Uint8Array) => btoa(Array.from(bytes, n => String.fromCharCode(n)).join(''));
interface Cell { x: number; y: number; tile?: number; sub?: number; level?: number }
function map(cells: Cell[] = [], suffix = '', w = 6, h = 6): Uint8Array {
  const raw = new Uint8Array(cells.length * 11 + 4);
  cells.forEach((cell, i) => {
    put16(raw, i * 11, cell.x); put16(raw, i * 11 + 2, cell.y); put32(raw, i * 11 + 4, cell.tile ?? 0);
    raw[i * 11 + 8] = cell.sub ?? 0; raw[i * 11 + 9] = cell.level ?? 0;
  });
  const prefix: number[] = [];
  if (raw.length <= 238) prefix.push(17 + raw.length);
  else { prefix.push(0); let left = raw.length - 18; while (left > 255) { prefix.push(0); left -= 255; } prefix.push(left); }
  const compressed = new Uint8Array([...prefix, ...raw, 17, 0, 0]), packed = new Uint8Array(compressed.length + 4);
  put16(packed, 0, compressed.length); put16(packed, 2, raw.length); packed.set(compressed, 4);
  return utf8(`[Basic]\nNewINIFormat=4\nName=Synthetic map\n[Map]\nSize=0,0,${w},${h}\nTheater=TEMPERATE\n[IsoMapPack5]\n1=${b64(packed)}\n${suffix}`);
}
interface TileSpec { land?: number; ramp?: number; extra?: boolean; empty?: boolean; x?: number; y?: number; damaged?: boolean }
function tmp(specs: TileSpec[] = [{}]): Uint8Array {
  const table = 16 + specs.length * 4;
  const length = specs.reduce((n, spec) => n + (spec.empty ? 0 : 952 + (spec.extra ? 6 : 0)), table);
  const bytes = new Uint8Array(length);
  put32(bytes, 0, specs.length); put32(bytes, 4, 1); put32(bytes, 8, 60); put32(bytes, 12, 30);
  let at = table;
  specs.forEach((spec, index) => {
    if (spec.empty) return;
    put32(bytes, 16 + index * 4, at); putSigned(bytes, at, spec.x ?? 0); putSigned(bytes, at + 4, spec.y ?? 0);
    bytes[at + 40] = 7; // TMP relative elevation is NOT added to map Level a second time
    bytes[at + 41] = spec.land ?? 0; bytes[at + 42] = spec.ramp ?? 0;
    bytes.fill(2, at + 52, at + 952); bytes[at + 52] = 0;
    if (spec.damaged) bytes[at + 36] = 4;
    if (spec.extra) {
      bytes[at + 36] |= 1; put32(bytes, at + 8, 952);
      putSigned(bytes, at + 20, (spec.x ?? 0) - 2); putSigned(bytes, at + 24, (spec.y ?? 0) - 3);
      put32(bytes, at + 28, 3); put32(bytes, at + 32, 2); bytes.set([0, 1, 2, 2, 1, 0], at + 952);
    }
    at += 952 + (spec.extra ? 6 : 0);
  });
  return bytes;
}
function palette(): Uint8Array { const bytes = new Uint8Array(768); bytes.set([63, 0, 0], 3); bytes.set([0, 63, 0], 6); return bytes; }
const INI = '[General]\nClearTile=0\n[TileSet0000]\nFileName=clear\nTilesInSet=1\n';
function files(source = map()): Map<string, Uint8Array> {
  return new Map([['folder/Fixture.MAP', source], ['THEATER/TEMPERAT.INI', utf8(INI)], ['pal/ISOTEM.PAL', palette()], ['tiles/CLEAR01.TEM', tmp()]]);
}
function overlay(values: [number, number, number][], section = 'OverlayPack'): string {
  const raw = new Uint8Array(512 * 512).fill(section === 'OverlayPack' ? 255 : 0);
  for (const [x, y, value] of values) raw[x + 512 * y] = value;
  const all: number[] = [];
  for (let offset = 0; offset < raw.length; offset += 8192) {
    const commands: number[] = [];
    for (let i = offset; i < offset + 8192;) {
      let end = i + 1;
      while (end < offset + 8192 && raw[end] === raw[i]) end++;
      commands.push(0xfe, (end - i) & 255, (end - i) >>> 8, raw[i]); i = end;
    }
    commands.push(0x80); all.push(commands.length & 255, commands.length >>> 8, 0, 32, ...commands);
  }
  return `[${section}]\n1=${b64(new Uint8Array(all))}\n`;
}
function shp(): Uint8Array {
  const bytes = new Uint8Array(36);
  put16(bytes, 2, 60); put16(bytes, 4, 30); put16(bytes, 6, 1);
  put16(bytes, 8, 10); put16(bytes, 10, 8); put16(bytes, 12, 2); put16(bytes, 14, 2);
  bytes[16] = 1; put32(bytes, 28, 32); bytes.set([2, 0, 1, 2], 32); return bytes;
}

describe('local original map compilation', () => {
  it('preserves original coordinates and level, explicitly fills omitted clear cells and leaves outside void', async () => {
    const result = await compileClassicMap(files(map([{ x: 5, y: 5, level: 3 }])), {});
    expect(result.map.width).toBe(13); expect(result.map.height).toBe(13);
    expect(result.map.terrain[0]).toEqual({ kind: 'void', height: 0, ore: 0 });
    expect(result.map.terrain[5 * 13 + 5]).toEqual({ kind: 'grass', height: 3, ore: 0 });
    expect(result.map.tiles.filter(tile => tile.layer === 'ground')).toHaveLength(66);
    expect(result.map.tiles.find(tile => tile.x === 5 && tile.y === 5)).toMatchObject({ height: 3, image: 'terrain:clear01.tem:0' });
    expect(result.images['terrain:clear01.tem:0']).toMatchObject({ width: 60, height: 30, anchorX: 30, anchorY: 0 });
    expect(result.map.rawMapHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.warnings.join(' ')).toMatch(/65 omitted clear cells.*temperat.ini.*clear01.tem.*THEATER\/TEMPERAT.INI/);
    expect(result.map.terrain.filter(cell => cell.kind !== 'void')).toHaveLength(66);
  });
  it('maps cumulative TilesInSet boundaries to 01-based filenames, not subcell counts or INI order', async () => {
    const selection = files(map([{ x: 5, y: 5, tile: 2, sub: 1 }]));
    selection.set('THEATER/TEMPERAT.INI', utf8('[TileSet0001]\nFileName=ROAD\nTilesInSet=2\n[TileSet0000]\nFileName=clear\nTilesInSet=2\n[General]\nClearTile=0'));
    selection.set('road01.tmp', tmp([{ land: 9 }, { land: 11, x: 30, y: 15 }]));
    const result = await compileClassicMap(selection, {});
    expect(result.map.terrain[5 * 13 + 5].kind).toBe('road');
    expect(result.map.tiles.find(tile => tile.x === 5 && tile.y === 5)?.image).toBe('terrain:road01.tmp:1');
    expect(result.images['terrain:road01.tmp:1']).toMatchObject({ anchorX: 30, anchorY: 0 });
  });
  it('handles clear sentinel and documented blank maps without using a thumbnail', async () => {
    const sentinel = await compileClassicMap(files(map([{ x: 5, y: 5, tile: 65535, sub: 99 }])), {});
    expect(sentinel.map.terrain[5 * 13 + 5].kind).toBe('grass');
    const blank = files(utf8('[Map]\nSize=0,0,6,6\nTheater=TEMPERATE\n[PreviewPack]\n1=not-an-image'));
    expect((await compileClassicMap(blank, {})).warnings.join(' ')).toMatch(/blank-map rule.*not PreviewPack/);
  });
  it('composites signed extra offsets with genuine base-index-zero opacity and extra transparency', async () => {
    const selection = files(); selection.set('tiles/CLEAR01.TEM', tmp([{ x: 20, y: 30, extra: true }]));
    const { images } = await compileClassicMap(selection, {}), image = images['terrain:clear01.tem:0'];
    expect(image).toMatchObject({ width: 62, height: 33, anchorX: 32, anchorY: 3 });
    expect([...image.rgba.slice(0, 8)]).toEqual([0, 0, 0, 0, 255, 0, 0, 255]);
    const firstBase = (3 * 62 + 30) * 4;
    expect([...image.rgba.slice(firstBase, firstBase + 4)]).toEqual([0, 0, 0, 255]);
    expect(image.rgba[(3 * 62 + 2) * 4 + 3]).toBe(0);
  });
  it.each([[0, 'grass'], [1, 'grass'], [2, 'snow'], [3, 'snow'], [4, 'snow'], [5, 'rock'], [6, 'road'],
    [7, 'rock'], [8, 'rock'], [9, 'water'], [10, 'sand'], [11, 'road'], [12, 'road'], [13, 'grass'], [14, 'grass'], [15, 'rock']] as const)
  ('maps documented TMP landType %i to %s', (value, kind) => expect(classicLandType(value, 'grass')).toBe(kind));
  it('reports actual missing filenames and never generates fallback terrain', async () => {
    const selection = files(map([{ x: 5, y: 5, tile: 1 }]));
    selection.set('THEATER/TEMPERAT.INI', utf8(INI + '[TileSet0001]\nTilesInSet=1\nFileName=cliff'));
    await expect(compileClassicMap(selection, {})).rejects.toThrow(/cliff01.tem or cliff01.tmp/);
    selection.delete('pal/ISOTEM.PAL');
    await expect(compileClassicMap(selection, {})).rejects.toThrow(/isotem.pal/);
  });
  it('requires the declared ClearTile set and resolves it cumulatively rather than as a tile index', async () => {
    const absent = files(); absent.set('THEATER/TEMPERAT.INI', utf8(INI.replace('ClearTile=0', '')));
    await expect(compileClassicMap(absent, {})).rejects.toThrow(/temperat.ini.*missing.*ClearTile/);
    const selection = files();
    selection.set('THEATER/TEMPERAT.INI', utf8('[General]\nClearTile=1\n[TileSet0000]\nTilesInSet=2\nFileName=water\n[TileSet0001]\nTilesInSet=1\nFileName=plain'));
    selection.set('plain01.tem', tmp());
    const result = await compileClassicMap(selection, {});
    expect(result.map.tiles.every(tile => tile.image === 'terrain:plain01.tem:0')).toBe(true);
  });
  it('rejects invalid global index, missing set, ambiguous version and unsafe prefixes', async () => {
    await expect(compileClassicMap(files(map([{ x: 5, y: 5, tile: 99 }])), {})).rejects.toThrow(/temperat.ini.*tile index 99/);
    const gap = files(); gap.set('THEATER/TEMPERAT.INI', utf8(INI + '[TileSet0002]\nTilesInSet=1\nFileName=x'));
    await expect(compileClassicMap(gap, {})).rejects.toThrow(/TileSet0001/);
    const prefix = files(); prefix.set('THEATER/TEMPERAT.INI', utf8(INI.replace('FileName=clear', 'FileName=../clear')));
    await expect(compileClassicMap(prefix, {})).rejects.toThrow(/unsafe FileName/);
    const ambiguous = files(); ambiguous.set('temperatmd.ini', utf8(INI));
    await expect(compileClassicMap(ambiguous, {})).rejects.toThrow(/Ambiguous.*temperat.ini.*temperatmd.ini/);
  });
  it.each([1, 7])('rejects null/out-of-range subTileIndex %i with its filename', async sub => {
    const selection = files(map([{ x: 5, y: 5, sub }])); selection.set('tiles/CLEAR01.TEM', tmp([{}, { empty: true }]));
    await expect(compileClassicMap(selection, {})).rejects.toThrow(new RegExp(`clear01.tem.*subTileIndex ${sub}`));
  });
  it('rejects unsupported land type, levels and ramps', async () => {
    const selection = files(); selection.set('tiles/CLEAR01.TEM', tmp([{ land: 16 }]));
    await expect(compileClassicMap(selection, {})).rejects.toThrow(/clear01.tem.*landType 16/);
    await expect(compileClassicMap(files(map([{ x: 5, y: 5, level: 16 }])), {})).rejects.toThrow(/level 16/);
    selection.set('tiles/CLEAR01.TEM', tmp([{ ramp: 21 }]));
    await expect(compileClassicMap(selection, {})).rejects.toThrow(/ramp 21/);
  });
  it('keeps slopes and height intact and moves spawn to the nearest genuinely flat 3x3 land', async () => {
    const selection = files(map([{ x: 5, y: 5, tile: 1, level: 4 }], '[Waypoints]\n0=5005\n50=-2872\n-1=6006'));
    selection.set('THEATER/TEMPERAT.INI', utf8(INI + '[TileSet0001]\nTilesInSet=1\nFileName=ramp'));
    selection.set('ramp01.tem', tmp([{ ramp: 4 }]));
    const { map: result, warnings } = await compileClassicMap(selection, {});
    expect(result.terrain[5 * 13 + 5]).toMatchObject({ ramp: 4, height: 4 });
    expect(result.spawn).not.toEqual({ x: 5, y: 5 });
    const { x, y } = result.spawn, level = result.terrain[y * 13 + x].height;
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) expect(result.terrain[(y + dy) * 13 + x + dx]).toEqual({ kind: 'grass', height: level, ore: 0 });
    expect(warnings.join(' ')).toMatch(/Negative\/script.*ignored/);
  });
  it('does not allow water or cliffs to serve as a fake deployment plateau', async () => {
    for (const land of [7, 9, 15]) { const selection = files(); selection.set('tiles/CLEAR01.TEM', tmp([{ land }])); await expect(compileClassicMap(selection, {})).rejects.toThrow(/No safe 3x3/); }
  });
  it('bounds the original-coordinate grid before decoding image data', async () => {
    await expect(compileClassicMap(files(map([], '', 128, 128)), {})).rejects.toThrow(/257x257/);
    const result = await compileClassicMap(files(map([], '', 128, 127)), {});
    expect(result.map.terrain).toHaveLength(65536); expect(result.map.width).toBe(256);
  });
  it('rejects map selection ambiguity and theater changes, and hashes actual map bytes', async () => {
    const selection = files(); selection.set('other.mpr', map());
    await expect(compileClassicMap(selection, {})).rejects.toThrow(/Ambiguous/);
    await expect(compileClassicMap(selection, { mapFile: 'fixture.map', theater: 'SNOW' })).rejects.toThrow(/does not match/);
    const a = await compileClassicMap(selection, { mapFile: 'fixture.map' });
    selection.set('folder/Fixture.MAP', map([], '; changed raw bytes'));
    const b = await compileClassicMap(selection, { mapFile: 'fixture.map' });
    expect(a.map.rawMapHash).not.toBe(b.map.rawMapHash);
  });
  it('ignores executable sections and war placements, diagnosing unsupported scenery and bridges', async () => {
    const selection = files(map([], '[Triggers]\n0=run evil code\n[Scripts]\n0=throw Error()\n[Units]\n0=unparsed combat placement\n[Terrain]\n7007=TREE01'));
    selection.set('tiles/CLEAR01.TEM', tmp([{ damaged: true }]));
    // All damaged bridge cells are excluded from spawn, demonstrating conservative behavior.
    await expect(compileClassicMap(selection, {})).rejects.toThrow(/No safe 3x3/);
    selection.set('tiles/CLEAR01.TEM', tmp());
    const result = await compileClassicMap(selection, {});
    expect(result.warnings.join(' ')).toMatch(/\[scripts\].*ignored/);
    expect(result.warnings.join(' ')).toMatch(/scenery TREE01.*not imported/);
    expect(result.map).not.toHaveProperty('units'); expect(result.map).not.toHaveProperty('scripts');
    expect(result.map.tiles.every(tile => tile.layer === 'ground')).toBe(true);
  });
});

describe('actual OverlayPack IDs and finite peaceful ore', () => {
  it('uses local OverlayTypes declaration order, original X+512Y locations and selected SHP frame', async () => {
    const selection = files(map([], overlay([[5, 5, 0], [6, 5, 1]]) + overlay([], 'OverlayDataPack')));
    selection.set('rules.ini', utf8('[OverlayTypes]\n99=GOLD01\n0=GEM01\n[GOLD01]\nImage=OREART\n[Scripts]\n0=do not execute'));
    selection.set('oreart.shp', shp()); selection.set('gem01.shp', shp());
    const result = await compileClassicMap(selection, {});
    expect(result.map.terrain[5 * 13 + 5]).toEqual({ kind: 'ore', ore: 100, height: 0 });
    expect(result.map.terrain[5 * 13 + 6]).toEqual({ kind: 'ore', ore: 200, height: 0 });
    expect(result.map.tiles.filter(tile => tile.layer === 'overlay')).toEqual([
      { x: 5, y: 5, height: 0, image: 'overlay:oreart.shp:0', layer: 'overlay', ore: true },
      { x: 6, y: 5, height: 0, image: 'overlay:gem01.shp:0', layer: 'overlay', ore: true },
    ]);
    expect(result.images['overlay:oreart.shp:0']).toMatchObject({ width: 2, height: 2, anchorX: 20, anchorY: -8 });
    expect(result.images['overlay:oreart.shp:0'].rgba[7]).toBe(0);
  });
  it('recognizes registered TIB artwork aliases and explicit local Tiberium data, never hardcoded IDs', async () => {
    const selection = files(map([], overlay([[5, 5, 0], [6, 5, 1], [7, 5, 2]]) + overlay([], 'OverlayDataPack')));
    selection.set('rules.ini', utf8('[OverlayTypes]\n1=TIB01\n2=CUSTOMORE\n3=UNDECLARED\n[TIB01]\nImage=GOLD01\n[CUSTOMORE]\nTiberium=yes\nImage=GEM01'));
    selection.set('gold01.shp', shp()); selection.set('gem01.shp', shp());
    const result = await compileClassicMap(selection, {});
    expect(result.map.terrain[5 * 13 + 5].ore).toBe(100);
    expect(result.map.terrain[5 * 13 + 6].ore).toBe(200);
    expect(result.map.terrain[5 * 13 + 7].ore).toBe(0);
    expect(result.map.tiles.filter(tile => tile.layer === 'overlay')).toHaveLength(2);
    selection.set('rules.ini', utf8('[OverlayTypes]\n1=GOLD01\n2=gold01'));
    await expect(compileClassicMap(selection, {})).rejects.toThrow(/duplicate OverlayTypes/);
  });
  it('does not guess resource IDs without rules.ini and warns about missing graphics', async () => {
    const selection = files(map([], overlay([[5, 5, 27]]) + overlay([], 'OverlayDataPack')));
    const missingRules = await compileClassicMap(selection, {});
    expect(missingRules.map.terrain.some(cell => cell.ore)).toBe(false);
    expect(missingRules.warnings.join(' ')).toMatch(/Missing rules.ini/);
    selection.set('folder/Fixture.MAP', map([], overlay([[5, 5, 0]]) + overlay([], 'OverlayDataPack')));
    selection.set('rules.ini', utf8('[OverlayTypes]\n0=GOLD01'));
    const missingArt = await compileClassicMap(selection, {});
    expect(missingArt.map.terrain[5 * 13 + 5].ore).toBe(100);
    expect(missingArt.map.tiles.some(tile => tile.layer === 'overlay')).toBe(false);
    expect(missingArt.warnings.join(' ')).toMatch(/Missing overlay art GOLD01.shp or GOLD01.tem/);
  });
  it('does not invent missing frames, overlay data or unimplemented bridge artwork', async () => {
    const selection = files(map([], overlay([[5, 5, 0], [6, 5, 1]]) + overlay([[5, 5, 3]], 'OverlayDataPack')));
    selection.set('rules.ini', utf8('[OverlayTypes]\n0=GOLD01\n1=BRIDGE1')); selection.set('gold01.shp', shp());
    const result = await compileClassicMap(selection, {});
    expect(result.warnings.join(' ')).toMatch(/gold01.shp: missing overlay frame 3/i);
    expect(result.warnings.join(' ')).toMatch(/BRIDGE1.*unsupported/);
    expect(result.map.tiles.every(tile => tile.layer === 'ground')).toBe(true);
    selection.set('folder/Fixture.MAP', map([], overlay([[5, 5, 0]])));
    expect((await compileClassicMap(selection, {})).warnings.join(' ')).toMatch(/OverlayDataPack absent/);
  });
});
