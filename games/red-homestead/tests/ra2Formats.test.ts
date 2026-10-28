import { describe, expect, it } from 'vitest';
import { RA2_LIMITS, Ra2FormatError, decodePalette, decodeShp, decodeTmp, mixFilenameId, parseMapIni, parseMix } from '../src/ra2/index.js';
import type { Ra2ErrorCode } from '../src/ra2/index.js';

// All binary fixtures below are constructed here. No original-game bytes/assets are used.
function view(data: Uint8Array) { return new DataView(data.buffer, data.byteOffset, data.byteLength); }
function put16(data: Uint8Array, at: number, value: number) { view(data).setUint16(at, value, true); }
function put32(data: Uint8Array, at: number, value: number) { view(data).setUint32(at, value, true); }
function putI32(data: Uint8Array, at: number, value: number) { view(data).setInt32(at, value, true); }
function paletteBytes(): Uint8Array {
  const data = new Uint8Array(768);
  for (let i = 0; i < 256; i++) data.set([i % 64, (i * 2) % 64, (i * 3) % 64], i * 3);
  return data;
}
const palette = decodePalette(paletteBytes());
function errorCode(action: () => unknown, code: Ra2ErrorCode) {
  try { action(); expect.unreachable('Expected a typed format error'); }
  catch (error) { expect(error).toBeInstanceOf(Ra2FormatError); expect((error as Ra2FormatError).code).toBe(code); }
}
function wrapped(data: Uint8Array) {
  const outer = new Uint8Array(data.length + 23).fill(0xfe);
  outer.set(data, 11);
  return outer.subarray(11, 11 + data.length);
}
interface FrameSpec { width?: number; height?: number; x?: number; y?: number; compression?: number; data?: number[]; empty?: boolean }
function shp(specs: FrameSpec[], width = 8, height = 4): Uint8Array {
  const start = 8 + 24 * specs.length;
  const data = new Uint8Array(start + specs.reduce((sum, frame) => sum + (frame.data?.length ?? 0), 0));
  put16(data, 2, width); put16(data, 4, height); put16(data, 6, specs.length);
  let cursor = start;
  specs.forEach((frame, i) => {
    const p = 8 + 24 * i;
    put16(data, p, frame.x ?? 1); put16(data, p + 2, frame.y ?? 1);
    put16(data, p + 4, frame.width ?? 4); put16(data, p + 6, frame.height ?? 1);
    data[p + 8] = frame.compression ?? 1;
    data.set([0xcd, 0xcd, 0xcd], p + 9); // alignment padding is not compression flags
    data.set([11, 22, 33], p + 12);
    put32(data, p + 20, frame.empty ? 0 : cursor);
    data.set(frame.data ?? [], cursor); cursor += frame.data?.length ?? 0;
  });
  return data;
}
function tmp(width: 48 | 60 = 60, extras = false): Uint8Array {
  const height = width / 2, packed = width * height / 2;
  const start = 24; // two index slots, one absent
  const z = 52 + packed, extra = z + packed, extraZ = extra + 6;
  const data = new Uint8Array(start + (extras ? extraZ + 6 : 52 + packed));
  put32(data, 0, 2); put32(data, 4, 1); put32(data, 8, width); put32(data, 12, height); put32(data, 16, start);
  putI32(data, start, -10); putI32(data, start + 4, 12);
  data[start + 40] = 3; data[start + 41] = 9; data[start + 42] = 2;
  data.set([1, 2, 3, 4, 5, 6], start + 43);
  data.fill(2, start + 52, start + 52 + packed);
  data[start + 52] = 0; // index zero INSIDE the base diamond is still covered
  if (extras) {
    put32(data, start + 8, extra); put32(data, start + 12, z); put32(data, start + 16, extraZ);
    putI32(data, start + 20, -12); putI32(data, start + 24, -5);
    put32(data, start + 28, 3); put32(data, start + 32, 2); data[start + 36] = 3;
    data.fill(7, start + z, start + extra);
    data.set([0, 1, 2, 3, 4, 0], start + extra); data.fill(8, start + extraZ);
  }
  return data;
}
interface MixSpec { id?: number; name?: string; data: number[] }
function mix(specs: MixSpec[], advanced = false, checksum = false): Uint8Array {
  const prefix = advanced ? 4 : 0, dataSize = specs.reduce((n, spec) => n + spec.data.length, 0);
  const body = prefix + 6 + specs.length * 12, data = new Uint8Array(body + dataSize + (checksum ? 20 : 0));
  if (advanced) put32(data, 0, checksum ? 0x10000 : 0);
  put16(data, prefix, specs.length); put32(data, prefix + 2, dataSize);
  let relative = 0;
  specs.forEach((spec, i) => {
    const p = prefix + 6 + i * 12;
    put32(data, p, spec.id ?? mixFilenameId(spec.name!)); put32(data, p + 4, relative); put32(data, p + 8, spec.data.length);
    data.set(spec.data, body + relative); relative += spec.data.length;
  });
  return data;
}
const mapText = `[Basic]\nNewINIFormat=4\nName=Synthetic local map\n[Map]\nSize=0,0,80,60\nLocalSize=2,3,76,55\nTheater=SNOW\n`;
const encode = (text: string) => new TextEncoder().encode(text);

describe('RA2 PAL', () => {
  it('expands 256 RGB VGA entries into opaque RGBA without changing the input', () => {
    const data = paletteBytes(); data.set([0, 32, 63], 0);
    const result = decodePalette(wrapped(data));
    expect(result).toBeInstanceOf(Uint8ClampedArray); expect(result.length).toBe(1024);
    expect([...result.slice(0, 4)]).toEqual([0, 130, 255, 255]);
    expect(result[1023]).toBe(255); expect(data[2]).toBe(63);
  });
  it('rejects short, oversized and non-VGA palettes', () => {
    errorCode(() => decodePalette(new Uint8Array(767)), 'TRUNCATED');
    errorCode(() => decodePalette(new Uint8Array(769)), 'INVALID_FORMAT');
    const data = paletteBytes(); data[767] = 64;
    errorCode(() => decodePalette(data), 'INVALID_FORMAT');
    errorCode(() => decodePalette([] as unknown as Uint8Array), 'INVALID_INPUT');
  });
});

describe('TS/RA2 SHP', () => {
  it.each([0, 1])('decodes raw compression %i with cropped bounds and radar color', compression => {
    const file = decodeShp(wrapped(shp([{ compression, data: [0, 1, 2, 3] }])), palette);
    expect([file.width, file.height]).toEqual([8, 4]);
    expect(file.frames[0]).toMatchObject({ x: 1, y: 1, width: 4, height: 1, compression, radarColor: [11, 22, 33] });
    expect([...file.frames[0].indices]).toEqual([0, 1, 2, 3]);
    expect(file.frames[0].rgba[3]).toBe(compression === 0 ? 255 : 0);
    expect([...file.frames[0].rgba.slice(4, 8)]).toEqual([...palette.slice(4, 8)]);
  });
  it('decodes compression 2 length-prefixed raw rows and their omitted transparent tail', () => {
    const frame = decodeShp(shp([{ compression: 2, height: 2, data: [5, 0, 1, 0, 3, 6, 0, 4, 5, 6, 7] }]), palette).frames[0];
    expect([...frame.indices]).toEqual([1, 0, 3, 0, 4, 5, 6, 7]);
  });
  it('decodes compression 3 runs separately for each row including empty rows', () => {
    const frame = decodeShp(shp([{ compression: 3, height: 3, data: [6, 0, 1, 0, 2, 3, 4, 0, 0, 4, 2, 0] }]), palette).frames[0];
    expect([...frame.indices]).toEqual([1, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
  it('keeps offset-zero and zero-area frames transparent', () => {
    const file = decodeShp(shp([{ compression: 0, empty: true }, { width: 0, height: 0, empty: true }]), palette);
    expect(file.frames[0].rgba.every(value => value === 0)).toBe(true);
    expect(file.frames[1].indices.length).toBe(0);
  });
  it('never guesses shadows, but provides explicit second-half pairing and black alpha', () => {
    const data = shp([{ data: [2, 3, 4, 5] }, { compression: 3, data: [6, 0, 0, 1, 1, 1] }]);
    const ordinary = decodeShp(data, palette);
    expect(ordinary.shadowCandidate).toBe(true); expect(ordinary.frames[1].isShadow).toBe(false);
    expect([...ordinary.frames[1].rgba.slice(4, 8)]).toEqual([...palette.slice(4, 8)]);
    const shadowed = decodeShp(data, palette, { shadowFrames: 'second-half', shadowOpacity: 96 });
    expect(shadowed.frames[0].shadowFrame).toBe(1); expect(shadowed.frames[1].shadowOf).toBe(0);
    expect([...shadowed.frames[1].rgba.slice(4, 8)]).toEqual([0, 0, 0, 96]);
    expect(shadowed.frames[1].rgba[3]).toBe(0);
  });
  it('rejects impossible shadow framing and invalid options/palettes', () => {
    errorCode(() => decodeShp(shp([{ data: [1, 2, 3, 4] }]), palette, { shadowFrames: 'second-half' }), 'INVALID_FORMAT');
    errorCode(() => decodeShp(shp([{ data: [1, 2, 3, 4] }, { data: [1, 2, 1, 1] }]), palette, { shadowFrames: 'second-half' }), 'INVALID_FORMAT');
    errorCode(() => decodeShp(shp([{ empty: true }]), palette, { shadowOpacity: NaN }), 'INVALID_INPUT');
    errorCode(() => decodeShp(shp([{ empty: true }]), new Uint8ClampedArray(4)), 'INVALID_INPUT');
  });
  it.each([
    { data: [4, 0, 0, 0], code: 'INVALID_FORMAT' }, // zero-length run
    { data: [4, 0, 0, 5], code: 'INVALID_FORMAT' }, // crosses row
    { data: [3, 0, 0], code: 'TRUNCATED' }, // missing count
    { data: [1, 0], code: 'INVALID_FORMAT' }, // prefix below two
    { data: [7, 0, 1, 2], code: 'TRUNCATED' },
    { data: [7, 0, 1, 2, 3, 4, 5], code: 'INVALID_FORMAT' }, // excess literals
  ])('rejects malformed RLE scanline $data', ({ data, code }) => {
    errorCode(() => decodeShp(shp([{ compression: 3, data }]), palette), code as Ra2ErrorCode);
  });
  it('rejects scanline crossing into another frame and accepts reused offsets safely', () => {
    const cross = shp([{ compression: 3, data: [6, 0, 1] }, { data: [2, 3, 4, 5] }]);
    errorCode(() => decodeShp(cross, palette), 'TRUNCATED');
    const reused = shp([{ data: [2, 3, 4, 5] }, { empty: true }]);
    put32(reused, 8 + 24 + 20, view(reused).getUint32(28, true));
    expect([...decodeShp(reused, palette).frames[1].indices]).toEqual([2, 3, 4, 5]);
  });
  it('rejects malformed header, offsets, bounds, unsupported format and oversized dimensions', () => {
    errorCode(() => decodeShp(new Uint8Array(7), palette), 'TRUNCATED');
    const short = shp([{ data: [1, 2, 3] }]);
    errorCode(() => decodeShp(short, palette), 'TRUNCATED');
    const offset = shp([{ data: [1, 2, 3, 4] }]); put32(offset, 28, 8);
    errorCode(() => decodeShp(offset, palette), 'INVALID_OFFSET');
    put32(offset, 28, 0xffffffff); errorCode(() => decodeShp(offset, palette), 'INVALID_OFFSET');
    errorCode(() => decodeShp(shp([{ x: 7, data: [1, 2, 3, 4] }]), palette), 'INVALID_FORMAT');
    errorCode(() => decodeShp(shp([{ compression: 7, data: [] }]), palette), 'UNSUPPORTED');
    errorCode(() => decodeShp(shp([{ empty: true }], 65535, 65535), palette), 'LIMIT_EXCEEDED');
    const foreign = shp([{ empty: true }]); put16(foreign, 0, 100);
    errorCode(() => decodeShp(foreign, palette), 'UNSUPPORTED');
  });
  it('preflights repeated-offset/empty-frame decompression bombs before allocation', () => {
    const data = shp(Array.from({ length: 8 }, () => ({ width: 2048, height: 2048, x: 0, y: 0, empty: true })), 2048, 2048);
    errorCode(() => decodeShp(data, palette), 'LIMIT_EXCEEDED');
    const counts = new Uint8Array(8); put16(counts, 2, 1); put16(counts, 4, 1); put16(counts, 6, RA2_LIMITS.maxFrames + 1);
    errorCode(() => decodeShp(counts, palette), 'LIMIT_EXCEEDED');
  });
  it('rejects every truncated raw-frame prefix with a typed error', () => {
    const data = shp([{ data: [1, 2, 3, 4] }]);
    for (let length = 0; length < data.length; length++) expect(() => decodeShp(data.subarray(0, length), palette)).toThrow(Ra2FormatError);
  });
});

describe('TS/RA2 TMP', () => {
  it.each([48, 60] as const)('decodes the exact %i-wide diamond and absent index slots', width => {
    const file = decodeTmp(wrapped(tmp(width)), palette), tile = file.tiles[0]!;
    expect(file.tiles[1]).toBeNull(); expect(file.tileWidth).toBe(width);
    expect(tile.coverage.reduce((sum, n) => sum + n, 0)).toBe(width * width / 4);
    const rows = Array.from({ length: width / 2 }, (_, y) => tile.coverage.slice(y * width, (y + 1) * width).reduce((a, b) => a + b, 0));
    expect(rows[0]).toBe(4); expect(rows[width / 4 - 1]).toBe(width); expect(rows.at(-2)).toBe(4); expect(rows.at(-1)).toBe(0);
    expect(tile.rgba[3]).toBe(0); expect(tile.rgba[(width / 2 - 2) * 4 + 3]).toBe(255);
    expect(tile).toMatchObject({ x: -10, y: 12, elevation: 3, landType: 9, slopeType: 2, radarLeft: [1, 2, 3], radarRight: [4, 5, 6] });
    expect(file.bounds).toEqual({ x: -10, y: 12, width, height: width / 2 });
  });
  it('decodes relative-offset Z planes and signed extra graphics with transparent zeros', () => {
    const file = decodeTmp(tmp(60, true), palette), tile = file.tiles[0]!;
    expect(tile.zData![28]).toBe(7); expect(tile.zData![0]).toBe(0);
    expect(tile.extra).toMatchObject({ x: -12, y: -5, width: 3, height: 2 });
    expect([...tile.extra!.indices]).toEqual([0, 1, 2, 3, 4, 0]);
    expect([...tile.extra!.zData!]).toEqual([8, 8, 8, 8, 8, 8]);
    expect(tile.extra!.rgba[3]).toBe(0); expect(tile.extra!.rgba[7]).toBe(255);
    expect(file.bounds).toEqual({ x: -12, y: -5, width: 62, height: 47 });
  });
  it('does not pretend to decode damaged bridge variants or inactive optional planes', () => {
    const data = tmp(); data[24 + 36] = 0xfc; put32(data, 24 + 8, 0xffffffff);
    const tile = decodeTmp(data, palette).tiles[0]!;
    expect(tile.damagedData).toBe('unsupported'); expect(tile.extra).toBeUndefined(); expect(tile.zData).toBeUndefined();
  });
  it('rejects invalid cell/plane offsets, overlaps and truncated planes', () => {
    const cell = tmp(); put32(cell, 16, 20); errorCode(() => decodeTmp(cell, palette), 'INVALID_OFFSET');
    const plane = tmp(60, true); put32(plane, 24 + 8, 0xffffffff); errorCode(() => decodeTmp(plane, palette), 'INVALID_OFFSET');
    put32(plane, 24 + 8, 52); errorCode(() => decodeTmp(plane, palette), 'INVALID_OFFSET');
    const z = tmp(60, true); put32(z, 24 + 12, 0); errorCode(() => decodeTmp(z, palette), 'INVALID_OFFSET');
    const trunc = tmp(60, true); errorCode(() => decodeTmp(trunc.subarray(0, trunc.length - 1), palette), 'INVALID_OFFSET');
    errorCode(() => decodeTmp(tmp().subarray(0, 100), palette), 'TRUNCATED');
  });
  it('rejects dimensions, tile-count and output-bounds bombs', () => {
    const data = tmp(); put32(data, 0, 0xffffffff); errorCode(() => decodeTmp(data, palette), 'LIMIT_EXCEEDED');
    const tile = tmp(); put32(tile, 8, 64); errorCode(() => decodeTmp(tile, palette), 'UNSUPPORTED');
    const extra = tmp(60, true); put32(extra, 24 + 28, 4096); put32(extra, 24 + 32, 4096);
    errorCode(() => decodeTmp(extra, palette), 'LIMIT_EXCEEDED');
    const bounds = tmp(60, true); putI32(bounds, 24 + 20, -0x7fffffff);
    errorCode(() => decodeTmp(bounds, palette), 'LIMIT_EXCEEDED');
  });
});

describe('RA2 MIX archives', () => {
  it.each([
    ['A', 0xeb978531], ['AB', 0x421faa6e], ['ABC', 0x33aff496], ['ABCD', 0xdb1720a5],
    ['rules.ini', 0xf025a96c], ['local.pal', 0xcc6316bd], ['tile.tmp', 0x88b0310c],
  ])('computes padded uppercase filename CRC for %s (independent Python zlib vectors)', (name, id) => {
    expect(mixFilenameId(name as string)).toBe(id);
  });
  it.each([false, true])('indexes basic/advanced=%s headers and resolves names without filesystem access', advanced => {
    const data = mix([{ name: 'rules.ini', data: [1, 2, 3] }, { name: 'local.pal', data: [4, 5] }], advanced);
    const archive = parseMix(wrapped(data));
    expect(archive.header).toBe(advanced ? 'advanced' : 'basic');
    expect(archive.entries[0].offset).toBe((advanced ? 4 : 0) + 30);
    expect([...archive.getByName('RuLeS.InI')!]).toEqual([1, 2, 3]);
    expect([...archive.getById(0xcc6316bd)!]).toEqual([4, 5]);
    expect(archive.getByName('absent')).toBeUndefined();
    expect(Object.isFrozen(archive.entries[0])).toBe(true);
  });
  it('supports empty archives and explicitly labels an unverified checksum trailer', () => {
    expect(parseMix(mix([])).entries).toHaveLength(0);
    expect(parseMix(mix([], true)).entries).toHaveLength(0);
    const data = mix([{ name: 'local.pal', data: [1] }], true, true);
    expect(parseMix(data).checksum).toBe('present-unverified');
    errorCode(() => parseMix(data.subarray(0, data.length - 1)), 'TRUNCATED');
  });
  it.each([0x20000, 0x30000])('rejects encrypted header %# before reading encrypted bytes', flags => {
    const encrypted = new Uint8Array(4); put32(encrypted, 0, flags);
    errorCode(() => parseMix(encrypted), 'UNSUPPORTED');
  });
  it('rejects unknown flags, invalid offsets, duplicate hashes and inconsistent body size', () => {
    const flags = new Uint8Array(4); put32(flags, 0, 0x40000); errorCode(() => parseMix(flags), 'UNSUPPORTED');
    const data = mix([{ name: 'local.pal', data: [1, 2] }]); put32(data, 10, 0xffffffff);
    errorCode(() => parseMix(data), 'INVALID_OFFSET');
    errorCode(() => parseMix(mix([{ id: 42, data: [1] }, { id: 42, data: [2] }])), 'INVALID_FORMAT');
    const body = mix([{ id: 1, data: [1] }]); put32(body, 2, 0); errorCode(() => parseMix(body), 'INVALID_FORMAT');
    const overlap = mix([{ id: 1, data: [1, 2] }, { id: 2, data: [3, 4] }]); put32(overlap, 22, 1);
    errorCode(() => parseMix(overlap), 'INVALID_OFFSET');
  });
  it('rejects malformed lookup names and every truncated body prefix', () => {
    for (const name of ['', 'x\0y', '中', 'x'.repeat(256)]) errorCode(() => mixFilenameId(name), 'INVALID_INPUT');
    const data = mix([{ name: 'local.pal', data: [1, 2] }], true);
    for (let i = 0; i < data.length; i++) expect(() => parseMix(data.subarray(0, i))).toThrow(Ra2FormatError);
  });
});

describe('RA2 map metadata only', () => {
  it('whitelists safe sections, dimensions, theater and original cell placements', () => {
    const parsed = parseMapIni(encode(mapText + `[Units]\na=Americans,MTNK,256,70,90,64,Guard,<none>\n[Infantry]\nb=Russians,E2,200,61,72,2,Guard,96,<none>\n[Structures]\nc=Neutral,GAPOWR,100,31,42,128,<none>\n[Aircraft]\nd=Americans,ORCA,256,50,60,32\n[Terrain]\n42031=TREE01\n[Waypoints]\n0=90070\n[General]\nBuildSpeed=999\n[Triggers]\n0=unsafe\n`));
    expect(parsed.kind).toBe('metadata-only'); expect(parsed.theater).toBe('SNOW');
    expect(parsed.size).toEqual({ x: 0, y: 0, width: 80, height: 60 });
    expect(parsed.placements).toHaveLength(5);
    expect(parsed.placements[0]).toMatchObject({ kind: 'unit', type: 'MTNK', x: 70, y: 90, health: 256, facing: 64 });
    expect(parsed.placements[1]).toMatchObject({ kind: 'infantry', subCell: 2, facing: 96 });
    expect(parsed.placements[4]).toMatchObject({ kind: 'terrain', type: 'TREE01', x: 31, y: 42 });
    expect(parsed.waypoints).toEqual([{ id: 0, x: 70, y: 90 }]);
    expect(parsed.sections.general).toBeUndefined(); expect(parsed.ignoredSections).toEqual(['general', 'triggers']);
    expect(Object.getPrototypeOf(parsed.sections)).toBeNull(); expect(Object.getPrototypeOf(parsed.sections.map)).toBeNull();
    expect(parsed.terrain.status).toBe('absent');
  });
  it('marks IsoMapPack5 as unsupported without inventing tiles or interpreting its payload', () => {
    const parsed = parseMapIni(encode(mapText + '[IsoMapPack5]\n1=not-even-base64\n'));
    expect(parsed.terrain).toEqual({ status: 'unsupported', format: 'IsoMapPack5', reason: 'SEPARATE_TERRAIN_DECODER', decoder: 'decodeMapTerrain' });
    expect(parsed.sections.isomappack5).toBeUndefined(); expect(parsed).not.toHaveProperty('tiles');
  });
  it('handles BOM, comments, CRLF and inert excluded sections', () => {
    const parsed = parseMapIni(encode('\ufeff' + mapText.replaceAll('\n', '\r\n') + '[__proto__]\npolluted=yes\n[Map]\nNotAllowed=/etc/passwd ; never read\n'));
    expect(parsed.sections.map.notallowed).toBeUndefined(); expect(parsed.ignoredSections).toContain('__proto__');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it.each([
    '[Map]\n__proto__=bad', '[Map]\nconstructor=bad', '[Map]\nSize=0,0,1,1',
    '[Units]\n0=Neutral,E1,999,1,1,0', '[Infantry]\n0=Neutral,E1,256,1,1,9,Guard,0',
  ])('rejects unsafe, duplicate or out-of-range metadata: %s', suffix => {
    errorCode(() => parseMapIni(encode(mapText + suffix)), 'INVALID_FORMAT');
  });
  it('rejects invalid dimensions, coordinate formats, unsupported theaters and binary text', () => {
    errorCode(() => parseMapIni(encode(mapText.replace('80,60', '999999,60'))), 'INVALID_FORMAT');
    errorCode(() => parseMapIni(encode(mapText.replace('SNOW', 'CUSTOM'))), 'UNSUPPORTED');
    errorCode(() => parseMapIni(encode(mapText.replace('NewINIFormat=4', 'NewINIFormat=3'))), 'UNSUPPORTED');
    errorCode(() => parseMapIni(encode(mapText + '\0')), 'INVALID_FORMAT');
    errorCode(() => parseMapIni(new Uint8Array([0xff, 0xfe])), 'INVALID_FORMAT');
    errorCode(() => parseMapIni(encode(mapText + '[Waypoints]\n0=NaN')), 'INVALID_FORMAT');
  });
  it('enforces bounded text, lines and retained metadata entries', () => {
    errorCode(() => parseMapIni(new Uint8Array(RA2_LIMITS.maxMapBytes + 1)), 'LIMIT_EXCEEDED');
    errorCode(() => parseMapIni(encode(mapText + ';' + 'x'.repeat(RA2_LIMITS.maxLineLength))), 'LIMIT_EXCEEDED');
    errorCode(() => parseMapIni(encode(mapText + '\n'.repeat(RA2_LIMITS.maxMapLines))), 'LIMIT_EXCEEDED');
    const entries = Array.from({ length: RA2_LIMITS.maxMapEntries }, (_, i) => `${i}=Neutral,E1,256,1,1,0`).join('\n');
    errorCode(() => parseMapIni(encode(mapText + '[Units]\n' + entries)), 'LIMIT_EXCEEDED');
  });
});

describe('bounded malformed input behavior', () => {
  it('rejects oversized graphics input before parsing and bad byte argument types', () => {
    const large = new Uint8Array(RA2_LIMITS.maxInputBytes + 1);
    errorCode(() => decodeShp(large, palette), 'LIMIT_EXCEEDED');
    errorCode(() => decodeTmp(large, palette), 'LIMIT_EXCEEDED');
    errorCode(() => parseMix(null as unknown as Uint8Array), 'INVALID_INPUT');
    errorCode(() => parseMapIni('path.ini' as unknown as Uint8Array), 'INVALID_INPUT');
  });
  it('rejects transferred/detached byte buffers with a typed input error', () => {
    const data = new Uint8Array(8);
    structuredClone(data.buffer, { transfer: [data.buffer] });
    errorCode(() => parseMix(data), 'INVALID_INPUT');
    errorCode(() => decodePalette(data), 'INVALID_INPUT');
  });
  it('returns only typed errors on deterministic synthetic noise', () => {
    let seed = 0x1badb002;
    for (let trial = 0; trial < 300; trial++) {
      const data = new Uint8Array(trial % 129);
      for (let i = 0; i < data.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; data[i] = seed >>> 24; }
      for (const decode of [() => decodeShp(data, palette), () => decodeTmp(data, palette), () => parseMix(data)]) {
        try { decode(); } catch (error) { expect(error).toBeInstanceOf(Ra2FormatError); }
      }
    }
  });
});
