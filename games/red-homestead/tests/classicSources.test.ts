import { describe, expect, it } from 'vitest';
import { ClassicSourceError, SOURCE_LIMITS, SourceLibrary, normalizeSourceName } from '../src/classicSources.js';
import { mixFilenameId } from '../src/ra2/mix.js';

// Synthetic archives only; neither proprietary assets nor third-party code are embedded.
function mix(entries: [string, Uint8Array][]): Uint8Array {
  const start = 6 + entries.length * 12, size = entries.reduce((n, entry) => n + entry[1].length, 0);
  const bytes = new Uint8Array(start + size), view = new DataView(bytes.buffer);
  view.setUint16(0, entries.length, true); view.setUint32(2, size, true);
  let at = 0;
  entries.forEach(([name, data], i) => {
    view.setUint32(6 + 12 * i, mixFilenameId(name), true);
    view.setUint32(10 + 12 * i, at, true); view.setUint32(14 + 12 * i, data.length, true);
    bytes.set(data, start + at); at += data.length;
  });
  return bytes;
}
const payload = new Uint8Array([1, 2, 3]);
describe('bounded local SourceLibrary', () => {
  it('normalizes case and both path separators, retaining exact source provenance', () => {
    const library = new SourceLibrary(new Map([['My Selection\\TERRAIN/ClEar01.TeM', payload]]));
    expect(library.get('clear01.tem')).toBe(payload);
    expect(library.has('/another/path/CLEAR01.TEM')).toBe(true);
    expect(library.provenance('CLEAR01.TEM')).toBe('My Selection\\TERRAIN/ClEar01.TeM');
    expect(library.knownNames()).toEqual(['clear01.tem']);
    expect(library.has('other.tmp')).toBe(false);
  });
  it('rejects ambiguous loose basenames, even when bytes happen to be identical', () => {
    expect(() => new SourceLibrary(new Map([['a/isoTEM.pal', payload], ['b/isotem.PAL', payload]]))).toThrow(/Ambiguous.*isotem.pal/);
  });
  it('indexes explicitly named nested unencrypted MIX resources through known hashes', () => {
    const library = new SourceLibrary(new Map([['Game/RA2.MIX', mix([['local.mix', mix([['temperat.ini', payload]])]])]]));
    expect(library.get('TEMPERAT.INI')).toEqual(payload);
    expect(library.provenance('temperat.ini')).toBe('Game/RA2.MIX/local.mix/temperat.ini');
    expect(library.knownNames()).toContain('temperat.ini');
    expect(library.knownNames()).not.toContain('clear01.tem');
  });
  it('does not recursively sniff unknown archive entries', () => {
    const library = new SourceLibrary(new Map([['selected.mix', mix([['unknown.mix', mix([['hidden.shp', payload]])]])]]));
    expect(library.get('hidden.shp')).toBeUndefined();
    expect(library.get('unknown.mix')).toBeInstanceOf(Uint8Array);
  });
  it('rejects loose/archive and archive/archive collisions instead of imposing a load order', () => {
    const archive = mix([['clear01.tem', payload]]);
    const loose = new SourceLibrary(new Map([['pack.mix', archive], ['CLEAR01.TEM', payload]]));
    expect(() => loose.has('clear01.tem')).toThrow(/Ambiguous.*clear01.tem/);
    const packed = new SourceLibrary(new Map([['one.mix', archive], ['two.mix', archive]]));
    expect(() => packed.get('clear01.tem')).toThrow(/one.mix\/clear01.tem.*two.mix\/clear01.tem/);
  });
  it('diagnoses encryption without decrypting or hiding unrelated loose files', () => {
    const bytes = new Uint8Array(4); new DataView(bytes.buffer).setUint32(0, 0x20000, true);
    const library = new SourceLibrary(new Map([['encrypted.mix', bytes], ['plain.pal', payload]]));
    expect(library.warnings.join(' ')).toMatch(/encrypted.mix.*encrypted MIX.*unsupported/);
    expect(library.get('plain.pal')).toBe(payload);
  });
  it('fails malformed archives with their actual filename', () => {
    expect(() => new SourceLibrary(new Map([['bad.mix', new Uint8Array(1)]]))).toThrow(/bad.mix/);
  });
  it('bounds nested depth and archive count independently of zero-copy data', () => {
    let bytes = mix([['leaf.ini', payload]]);
    for (let i = 0; i < SOURCE_LIMITS.archiveDepth; i++) bytes = mix([['local.mix', bytes]]);
    expect(() => new SourceLibrary(new Map([['root.mix', bytes]]))).toThrow(/nesting exceeds 4/);
    const files = new Map(Array.from({ length: SOURCE_LIMITS.archives + 1 }, (_, i) => [`a${i}.mix`, mix([])] as const));
    expect(() => new SourceLibrary(files)).toThrow(/archive count limit/);
  });
  it.each(['../clear.tem', 'a/../clear.tem', 'a\\..\\clear.tem', 'x\u0000.pal', 'a/', '__bad?:.tmp'])('rejects unsafe paths %s', path => {
    expect(() => normalizeSourceName(path)).toThrow(ClassicSourceError);
  });
  it('bounds local file count', () => {
    const files = new Map(Array.from({ length: SOURCE_LIMITS.files + 1 }, (_, i) => [`${i}.shp`, new Uint8Array()] as const));
    expect(() => new SourceLibrary(files)).toThrow(/files/);
  });
});
