import { describe, expect, it } from 'vitest';
import { RA2_LIMITS, Ra2FormatError, decodeLzo1x, decodeMapTerrain, decodeMapPreview, parseMapIni } from '../src/ra2/index.js';
import type { Ra2ErrorCode } from '../src/ra2/index.js';

// Hand-encoded synthetic instruction streams, never game bytes or third-party encoder output.
const EOF = [17, 0, 0];
function literalBody(data: Uint8Array): number[] {
  if (data.length <= 238 && data.length > 0) return [17 + data.length, ...data];
  if (!data.length) return [];
  const header = [0];
  let extra = data.length - 18;
  while (extra > 255) { header.push(0); extra -= 255; }
  header.push(extra);
  return [...header, ...data];
}
function literalStream(data: Uint8Array): Uint8Array { return new Uint8Array([...literalBody(data), ...EOF]); }
function errorCode(action: () => unknown, expected: Ra2ErrorCode) {
  try { action(); expect.unreachable('Expected a typed decoding failure'); }
  catch (error) { expect(error).toBeInstanceOf(Ra2FormatError); expect((error as Ra2FormatError).code).toBe(expected); }
}
function put16(bytes: Uint8Array, at: number, value: number) { new DataView(bytes.buffer).setUint16(at, value, true); }
function put32(bytes: Uint8Array, at: number, value: number) { new DataView(bytes.buffer).setUint32(at, value, true); }
function chunk(bytes: Uint8Array, declared: number): Uint8Array {
  const output = new Uint8Array(bytes.length + 4);
  put16(output, 0, bytes.length); put16(output, 2, declared); output.set(bytes, 4); return output;
}
function combine(parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((sum, item) => sum + item.length, 0));
  let p = 0; for (const part of parts) { output.set(part, p); p += part.length; } return output;
}
function pack(data: Uint8Array, split = data.length): Uint8Array {
  const chunks = [];
  for (let at = 0; at < data.length; at += split) { const part = data.subarray(at, at + split); chunks.push(chunk(literalStream(part), part.length)); }
  return combine(chunks);
}
const header = '[Basic]\nNewINIFormat=4\n[Map]\nSize=0,0,3,2\nTheater=SNOW\n';
const utf8 = (s: string) => new TextEncoder().encode(s);
const b64 = (bytes: Uint8Array) => btoa(Array.from(bytes, n => String.fromCharCode(n)).join(''));
function mapString(payload: Uint8Array, mapHeader = header): string { return mapHeader + '[IsoMapPack5]\n1=' + b64(payload) + '\n'; }
function map(payload: Uint8Array, mapHeader = header): Uint8Array { return utf8(mapString(payload, mapHeader)); }
function cells(entries: { x: number; y: number; tile?: number; sub?: number; level?: number; ice?: number }[]): Uint8Array {
  const output = new Uint8Array(entries.length * 11 + 4);
  entries.forEach((entry, i) => {
    const at = i * 11;
    put16(output, at, entry.x); put16(output, at + 2, entry.y); put32(output, at + 4, entry.tile ?? 7);
    output[at + 8] = entry.sub ?? 1; output[at + 9] = entry.level ?? 3; output[at + 10] = entry.ice ?? 0;
  });
  return output;
}

describe('bounded LZO1X v0', () => {
  it.each([0, 1, 2, 3, 4, 17, 18, 21, 238, 239, 273, 274, 4096, 8192])('decodes an independently hand-built %i-byte literal stream', size => {
    const input = Uint8Array.from({ length: size }, (_, i) => (i * 29 + 3) & 255);
    expect(decodeLzo1x(literalStream(input), size)).toEqual(input);
  });
  it('supports ordinary state-zero literal instructions after a match', () => {
    expect([...decodeLzo1x(new Uint8Array([18, 65, 64, 0, 1, 66, 67, 68, 69, ...EOF]), 8)]).toEqual([65, 65, 65, 65, 66, 67, 68, 69]);
  });
  it.each([3, 4, 5, 6, 7, 8])('decodes a short-distance M2 match of length %i', count => {
    const input = new Uint8Array([18, 81, (count - 1) << 5, 0, ...EOF]);
    expect([...decodeLzo1x(input, count + 1)]).toEqual(Array(count + 1).fill(81));
  });
  it('expands overlapping dictionary matches bytewise', () => {
    expect([...decodeLzo1x(new Uint8Array([19, 65, 66, 228, 0, ...EOF]), 10)]).toEqual([65, 66, 65, 66, 65, 66, 65, 66, 65, 66]);
  });
  it.each([0, 1, 2, 3])('copies the %i trailing literals carried by a match', tail => {
    const literals = [11, 12, 13].slice(0, tail);
    expect([...decodeLzo1x(new Uint8Array([18, 9, 64 | tail, 0, ...literals, ...EOF]), 4 + tail)]).toEqual([9, 9, 9, 9, ...literals]);
  });
  it('decodes the state-dependent two-byte and far three-byte M1 forms', () => {
    expect([...decodeLzo1x(new Uint8Array([18, 7, 0, 0, ...EOF]), 3)]).toEqual([7, 7, 7]);
    const seed = Uint8Array.from({ length: 2049 }, (_, i) => i & 255);
    const input = new Uint8Array([...literalBody(seed), 1, 0, 99, 0, 0, ...EOF]);
    const expected = combine([seed, new Uint8Array([0, 1, 2, 99, 99, 99])]);
    expect(decodeLzo1x(input, expected.length)).toEqual(expected);
  });
  it('decodes M3 length and 16-bit distance fields, including extended lengths', () => {
    const seed = Uint8Array.from({ length: 257 }, (_, i) => i & 255);
    const input = new Uint8Array([...literalBody(seed), 35, 0, 4, ...EOF]); // 5 bytes from distance 257
    expect(decodeLzo1x(input, 262)).toEqual(combine([seed, seed.subarray(0, 5)]));
    expect(decodeLzo1x(new Uint8Array([18, 33, 32, 1, 0, 0, ...EOF]), 35)).toEqual(new Uint8Array(35).fill(33));
    expect(decodeLzo1x(new Uint8Array([18, 33, 32, 0, 1, 0, 0, ...EOF]), 290)).toEqual(new Uint8Array(290).fill(33));
  });
  it.each([16385, 32768, 49151])('decodes M4 distance %i, including its high-distance bit', distance => {
    const seed = Uint8Array.from({ length: distance }, (_, i) => (i + 19) & 255);
    const high = distance >= 32768, operand = (distance - 16384 - (high ? 16384 : 0)) << 2;
    const input = new Uint8Array([...literalBody(seed), high ? 25 : 17, operand & 255, operand >>> 8, ...EOF]);
    expect(decodeLzo1x(input, distance + 3)).toEqual(combine([seed, seed.subarray(0, 3)]));
  });
  it.each([1, 2, 3])('copies %i literal tails from M3/M4 16-bit operands', tail => {
    const extras = [19, 20, 21].slice(0, tail);
    const short = new Uint8Array([18, 9, 33, tail, 0, ...extras, ...EOF]);
    expect([...decodeLzo1x(short, 4 + tail)]).toEqual([9, 9, 9, 9, ...extras]);
    const seed = new Uint8Array(16385).fill(9);
    const far = new Uint8Array([...literalBody(seed), 17, 4 | tail, 0, ...extras, ...EOF]);
    expect(decodeLzo1x(far, seed.length + 3 + tail)).toEqual(combine([seed, new Uint8Array([9, 9, 9, ...extras])]));
  });
  it('decodes M4 extended-length matches', () => {
    const seed = new Uint8Array(16385).fill(6);
    expect(decodeLzo1x(new Uint8Array([...literalBody(seed), 16, 1, 4, 0, ...EOF]), 16395)).toEqual(new Uint8Array(16395).fill(6));
  });
  it('rejects dictionary lookbehind before output and extended-length bombs', () => {
    errorCode(() => decodeLzo1x(new Uint8Array([18, 1, 68, 0, ...EOF]), 4), 'INVALID_OFFSET');
    errorCode(() => decodeLzo1x(new Uint8Array([21, 1, 2, 3, 4, 0, 0, ...EOF]), 7), 'INVALID_OFFSET');
    errorCode(() => decodeLzo1x(new Uint8Array([0, 0, 0, 0, 1, ...EOF]), 4), 'INVALID_FORMAT');
    errorCode(() => decodeLzo1x(new Uint8Array([18, 1, 224, 0, ...EOF]), 4), 'INVALID_FORMAT');
  });
  it('requires an exact EOF, exact size, no trailing bytes and no v1 extensions', () => {
    errorCode(() => decodeLzo1x(new Uint8Array([18, 1, ...EOF, 9]), 1), 'INVALID_FORMAT');
    errorCode(() => decodeLzo1x(new Uint8Array([18, 1, ...EOF]), 2), 'INVALID_FORMAT');
    errorCode(() => decodeLzo1x(new Uint8Array([18, 1, 18, 0, 0]), 1), 'INVALID_FORMAT');
    errorCode(() => decodeLzo1x(new Uint8Array([18, 1, 17, 1, 0]), 1), 'INVALID_FORMAT');
    errorCode(() => decodeLzo1x(new Uint8Array([17, 1, ...EOF]), 0), 'UNSUPPORTED');
  });
  it('rejects every truncated prefix and validates caller allocation limits', () => {
    const full = literalStream(new Uint8Array(300).fill(1));
    for (let i = 0; i < full.length; i++) expect(() => decodeLzo1x(full.subarray(0, i), 300)).toThrow(Ra2FormatError);
    errorCode(() => decodeLzo1x(full, -1), 'INVALID_INPUT');
    errorCode(() => decodeLzo1x(full, NaN), 'INVALID_INPUT');
    errorCode(() => decodeLzo1x(full, RA2_LIMITS.maxLzoOutputBytes + 1), 'LIMIT_EXCEEDED');
    errorCode(() => decodeLzo1x(new Uint8Array(RA2_LIMITS.maxLzoInputBytes + 1), 0), 'LIMIT_EXCEEDED');
  });
});

describe('embedded PreviewPack only', () => {
  function preview(data: Uint8Array, dimensions = '0,0,2,1', split = data.length): Uint8Array {
    return utf8('[Preview]\nSize=' + dimensions + '\n[PreviewPack]\n1=' + b64(pack(data, split)));
  }
  it('decodes BGR888 across chunk boundaries and converts to opaque RGBA without a palette', () => {
    const result = decodeMapPreview(preview(new Uint8Array([10, 20, 30, 40, 50, 60]), '4,5,2,1', 4));
    expect(result).toMatchObject({ kind: 'embedded-preview', source: 'PreviewPack', x: 4, y: 5, width: 2, height: 1, chunkCount: 2, notTerrain: true });
    expect([...result.bgr]).toEqual([10, 20, 30, 40, 50, 60]);
    expect([...result.rgba]).toEqual([30, 20, 10, 255, 60, 50, 40, 255]);
    expect(result).not.toHaveProperty('tiles');
  });
  it('is independent of scripts and unparsed terrain data', () => {
    const data = combine([preview(new Uint8Array(6)), utf8('\n[Waypoints]\n50=-2872\n[IsoMapPack5]\n1=bogus\n')]);
    expect(decodeMapPreview(data).width).toBe(2);
  });
  it.each(['0,0,0,1', '0,0,-1,2', '0,0,1', '0,0,NaN,1', '0,0,1.5,1'])('rejects invalid preview size %s', size => {
    errorCode(() => decodeMapPreview(preview(new Uint8Array(6), size)), 'INVALID_FORMAT');
  });
  it.each(['0,0,1025,1', '0,0,1,1025', '999999,0,2,1', '0,0,999999,999999'])('rejects preview allocation bombs %s', size => {
    errorCode(() => decodeMapPreview(preview(new Uint8Array(6), size)), 'LIMIT_EXCEEDED');
  });
  it('rejects missing/ambiguous dimensions and undersized or oversized pixel planes', () => {
    errorCode(() => decodeMapPreview(utf8('[PreviewPack]\n1=AAAA')), 'UNSUPPORTED');
    errorCode(() => decodeMapPreview(utf8('[Preview]\nSize=0,0,2,1\n')), 'UNSUPPORTED');
    errorCode(() => decodeMapPreview(utf8('[Preview]\nSize=0,0,2,1\nSize=0,0,2,1')), 'INVALID_FORMAT');
    errorCode(() => decodeMapPreview(utf8('[Preview]\nSize=0,0,2,1\n[Preview]\nSize=0,0,2,1')), 'INVALID_FORMAT');
    errorCode(() => decodeMapPreview(preview(new Uint8Array(5))), 'INVALID_FORMAT');
    errorCode(() => decodeMapPreview(preview(new Uint8Array(7))), 'LIMIT_EXCEEDED');
  });
});

describe('IsoMapPack5 terrain records', () => {
  it('decodes real tile records across chunk boundaries without inventing omitted cells', () => {
    const raw = cells([{ x: 1, y: 3, tile: 7 }, { x: 2, y: 2, tile: 0xffff, sub: 0, level: 0 }, { x: 3, y: 1, tile: 0xffffffff, sub: 9, level: 14, ice: 1 }]);
    const result = decodeMapTerrain(map(pack(raw, 10)));
    expect(result).toMatchObject({ kind: 'terrain-tiles', source: 'IsoMapPack5', theater: 'SNOW', tileCount: 3, declaredCellCount: 10, omittedCellCount: 7, chunkCount: 4, unpackedBytes: 37, requiresTheaterMapping: true });
    expect(result.tiles[0]).toEqual({ x: 1, y: 3, tileIndex: 7, subTileIndex: 1, level: 3, iceGrowth: 0 });
    expect(result.tiles[2]).toEqual({ x: 3, y: 1, tileIndex: 0xffffffff, subTileIndex: 9, level: 14, iceGrowth: 1 });
    expect(parseMapIni(map(pack(raw))).kind).toBe('metadata-only');
  });
  it('supports a properly terminated empty record set without synthesizing clear art', () => {
    const terrain = decodeMapTerrain(map(pack(new Uint8Array(4))));
    expect(terrain.tiles).toEqual([]); expect(terrain.omittedCellCount).toBe(10);
  });
  it('orders numeric packed line indices, handles comments and honors the explicit text encoding', () => {
    const encoded = b64(pack(cells([{ x: 1, y: 3 }])));
    const source = header + '[IsoMapPack5]\n2=' + encoded.slice(7) + '; comment\n1=' + encoded.slice(0, 7) + '\n';
    expect(decodeMapTerrain(utf8(source)).tileCount).toBe(1);
    const legacy = combine([new Uint8Array([59, 32, 0xe9, 10]), utf8(source)]);
    errorCode(() => decodeMapTerrain(legacy), 'INVALID_FORMAT');
    expect(decodeMapTerrain(legacy, { encoding: 'windows-1252' }).tileCount).toBe(1);
    const chinese = combine([new Uint8Array([59, 32, 0xd6, 0xd0, 10]), utf8(source)]);
    expect(decodeMapTerrain(chinese, { encoding: 'gb18030' }).tileCount).toBe(1);
  });
  it('rejects duplicate/out-of-bounds cells and record-count bombs', () => {
    errorCode(() => decodeMapTerrain(map(pack(cells([{ x: 1, y: 3 }, { x: 1, y: 3 }])))), 'INVALID_FORMAT');
    for (const x of [0, 6, 65535]) errorCode(() => decodeMapTerrain(map(pack(cells([{ x, y: 3 }])))), 'INVALID_FORMAT');
    errorCode(() => decodeMapTerrain(map(pack(cells(Array.from({ length: 11 }, () => ({ x: 1, y: 3 })))))), 'LIMIT_EXCEEDED');
    errorCode(() => decodeMapTerrain(map(pack(cells([{ x: 1, y: 3 }])), header.replace('0,0,3,2', '1,0,3,2'))), 'UNSUPPORTED');
  });
  it('supports exact end-of-buffer records and isolates off-map script waypoints from terrain', () => {
    const raw = cells([{ x: 1, y: 3 }]).subarray(0, 11);
    const data = map(pack(raw), header + '[Waypoints]\n50=-2872\n');
    const decoded = decodeMapTerrain(data);
    expect(decoded.termination).toBe('end-of-buffer'); expect(decoded.tileCount).toBe(1);
    errorCode(() => parseMapIni(data), 'INVALID_FORMAT'); // strict metadata semantics are unchanged
    errorCode(() => decodeMapTerrain(map(pack(cells([{ x: 1, y: 1 }])))), 'INVALID_FORMAT');
  });
  it('requires whole 11-byte records and validates any four-byte zero-coordinate terminator', () => {
    errorCode(() => decodeMapTerrain(map(pack(new Uint8Array(14)))), 'INVALID_FORMAT');
    const raw = cells([{ x: 1, y: 3 }]); raw[raw.length - 1] = 1;
    errorCode(() => decodeMapTerrain(map(pack(raw))), 'INVALID_FORMAT');
    errorCode(() => decodeMapTerrain(map(pack(cells([{ x: 0, y: 0 }])))), 'INVALID_FORMAT');
  });
  it.each(['AB==', '====', 'AAA', 'AA A', 'AA-A', 'AA_A', 'AAAA=AAA', 'AAA=AAAA'])('rejects malformed or noncanonical Base64 %s', value => {
    errorCode(() => decodeMapTerrain(utf8(header + '[IsoMapPack5]\n1=' + value)), 'INVALID_FORMAT');
  });
  it.each(['2=AAAA', '01=AAAA', '0=AAAA', '-1=AAAA', '1=AAAA\n1=AAAA', '1=AAAA\n[IsoMapPack5]\n1=AAAA', '1='])('rejects ambiguous or missing packed line keys %s', body => {
    errorCode(() => decodeMapTerrain(utf8(header + '[IsoMapPack5]\n' + body)), 'INVALID_FORMAT');
  });
  it('rejects absent data, zero chunks, oversized output and truncated chunk headers/payloads', () => {
    errorCode(() => decodeMapTerrain(utf8(header)), 'UNSUPPORTED');
    errorCode(() => decodeMapTerrain(map(new Uint8Array(3))), 'TRUNCATED');
    errorCode(() => decodeMapTerrain(map(new Uint8Array(4))), 'INVALID_FORMAT');
    errorCode(() => decodeMapTerrain(map(chunk(new Uint8Array(EOF), 8193))), 'LIMIT_EXCEEDED');
    const payload = pack(cells([{ x: 1, y: 3 }]));
    errorCode(() => decodeMapTerrain(map(payload.subarray(0, payload.length - 1))), 'TRUNCATED');
    const short = chunk(new Uint8Array([18, 1, ...EOF]), 15);
    errorCode(() => decodeMapTerrain(map(short)), 'INVALID_FORMAT');
  });
  it('preflights chunk-count and declared output budgets before allocating/decompressing', () => {
    const repeated = combine(Array.from({ length: RA2_LIMITS.maxPackChunks + 1 }, () => chunk(new Uint8Array([18, 0, ...EOF]), 1)));
    errorCode(() => decodeMapTerrain(map(repeated, header.replace('3,2', '80,83'))), 'LIMIT_EXCEEDED');
    errorCode(() => decodeMapTerrain(map(chunk(new Uint8Array(EOF), 8192))), 'LIMIT_EXCEEDED');
  });
  it('handles deterministic truncated/malformed synthetic noise only with typed failures', () => {
    let random = 0x13579bdf;
    for (let t = 0; t < 500; t++) {
      const bytes = Uint8Array.from({ length: t % 99 }, () => { random = (Math.imul(random, 1103515245) + 12345) >>> 0; return random >>> 24; });
      try { decodeLzo1x(bytes, t % 301); } catch (error) { expect(error).toBeInstanceOf(Ra2FormatError); }
    }
  });
});
