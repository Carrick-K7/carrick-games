import { describe, expect, it } from 'vitest';
import { decodeLcw, decodeOverlayPack, LcwFormatError, OVERLAY_CELLS } from '../src/ra2/lcw.js';
const bytes = (values: number[]) => new Uint8Array(values);
const text = (value: string) => new TextEncoder().encode(value);
function packedFill(value: number, length = OVERLAY_CELLS): string {
  const packed: number[] = [];
  for (let at = 0; at < length; at += 8192) {
    const count = Math.min(8192, length - at);
    packed.push(5, 0, count & 255, count >>> 8, 0xfe, count & 255, count >>> 8, value, 0x80);
  }
  return btoa(String.fromCharCode(...packed));
}
describe('independent LCW / Format80 decoder', () => {
  it('decodes literal and empty streams with exact terminators', () => {
    expect([...decodeLcw(bytes([0x83, 4, 5, 6, 0x80]), 3)]).toEqual([4, 5, 6]);
    expect(decodeLcw(bytes([0x80]), 0)).toEqual(new Uint8Array());
  });
  it('decodes relative short references with overlapping output', () => {
    expect([...decodeLcw(bytes([0x82, 7, 8, 0x50, 2, 0x80]), 10)]).toEqual([7, 8, 7, 8, 7, 8, 7, 8, 7, 8]);
  });
  it('decodes medium absolute references and the maximum medium length', () => {
    expect([...decodeLcw(bytes([0x83, 1, 2, 3, 0xc0, 1, 0, 0x80]), 6)]).toEqual([1, 2, 3, 2, 3, 2]);
    expect(decodeLcw(bytes([0x81, 9, 0xfd, 0, 0, 0x80]), 65)).toEqual(new Uint8Array(65).fill(9));
  });
  it('decodes repeat and long absolute references', () => {
    expect(decodeLcw(bytes([0xfe, 0, 2, 9, 0xff, 0, 1, 0, 0, 0x80]), 768)).toEqual(new Uint8Array(768).fill(9));
  });
  it('supports the leading zero flag for medium and long relative references', () => {
    expect([...decodeLcw(bytes([0, 0x83, 1, 2, 3, 0xc0, 2, 0, 0xff, 3, 0, 1, 0, 0x80]), 9)])
      .toEqual([1, 2, 3, 2, 3, 2, 2, 2, 2]);
  });
  it.each([
    [0x81, 1], [0x81, 1, 0x80, 2], [0x82, 1], [0xfe, 0, 0, 1, 0x80],
    [0xc0, 0, 0, 0x80], [0x81, 1, 0x00, 0, 0x80], [0, 0xc0, 1, 0, 0x80],
  ].map(data => [data]))('rejects truncated, trailing, zero-run or out-of-bounds bytes %j', data => {
    expect(() => decodeLcw(bytes(data), 1)).toThrow(LcwFormatError);
  });
  it('rejects every truncated prefix and incorrect sizes', () => {
    const full = bytes([0xfe, 0, 32, 0, 0x80]);
    for (let size = 0; size < full.length; size++) expect(() => decodeLcw(full.subarray(0, size), 8192)).toThrow();
    expect(() => decodeLcw(full, 8191)).toThrow(); expect(() => decodeLcw(full, 8193)).toThrow();
    expect(() => decodeLcw(full, NaN)).toThrow(); expect(() => decodeLcw(full, 8 * 1024 * 1024 + 1)).toThrow();
  });
});
describe('fixed-size local overlay sections', () => {
  it('decodes 32 chunk LCW packs, preserving blank versus absent', () => {
    const decoded = decodeOverlayPack(text('[OverlayPack]\n1=' + packedFill(255)), 'OverlayPack');
    expect(decoded?.length).toBe(OVERLAY_CELLS); expect(decoded?.every(value => value === 255)).toBe(true);
    expect(decodeOverlayPack(text('[Scripts]\n0=ignored'), 'OverlayPack')).toBeUndefined();
  });
  it('orders numeric lines and isolates scripts and unrelated packs', () => {
    const b64 = packedFill(7), map = `[OverlayDataPack]\n2=${b64.slice(7)}\n1=${b64.slice(0, 7)}\n[Scripts]\nx=bogus\n[IsoMapPack5]\n1=bogus`;
    expect(decodeOverlayPack(text(map), 'OverlayDataPack')?.[512 * 99 + 71]).toBe(7);
  });
  it.each([
    '[OverlayPack]\n1=AA=A', '[OverlayPack]\n1=AB==', '[OverlayPack]\n2=AAAA',
    '[OverlayPack]\n1=AAAA\n1=AAAA', '[OverlayPack]\n1=AAAA\n[OverlayPack]\n1=AAAA',
  ])('rejects ambiguous/invalid packed data %s', value => {
    expect(() => decodeOverlayPack(text(value), 'OverlayPack')).toThrow(LcwFormatError);
  });
  it('requires exactly 512x512 bytes, not map-sized packs', () => {
    expect(() => decodeOverlayPack(text('[OverlayPack]\n1=' + packedFill(0, 8192)), 'OverlayPack')).toThrow(/262144/);
    expect(() => decodeOverlayPack(text('[OverlayPack]\n1=' + packedFill(0, OVERLAY_CELLS + 1)), 'OverlayPack')).toThrow(/bounds/);
  });
});
