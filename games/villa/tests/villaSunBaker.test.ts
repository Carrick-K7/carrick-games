import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { bakeField, bakeOptions, packHeightfield, surveySource, verifyEntryDigest, villaRelease } from './bake-exterior-sun.mjs';
import { unpackSurvey, VILLA_SUN_FIELD } from '../src/villaSolarSurvey.js';

// Offline contract only. No scene, browser, preview, local dist or generated file write.
const version = '1.2.3', revision = 'ab'.repeat(20), base = `/games/villa/${version}/${revision}/`;
const entry = { id: 'villa', version, revision, apiVersion: 1, assetBase: base, entry: base + 'entry.js' };
const catalog = (games: object[]) => ({ schemaVersion: 1, apiVersion: 1, games });
const digest = (b: Buffer) => createHash('sha256').update(b).digest('hex');

describe('offline sun survey contract', () => {
  it('defaults to read-only check; only --write + an explicit full revision can request a write', () => {
    expect(bakeOptions([], {}).mode).toBe('--check');
    expect(bakeOptions(['--check'], {}).mode).toBe('--check');
    expect(bakeOptions(['--write'], { VILLA_AUDIT_REVISION: revision }).mode).toBe('--write');
    for (const [args, env] of [[['--write'], {}], [['--write'], { VILLA_AUDIT_REVISION: 'abc' }],
      [['--check'], { VILLA_AUDIT_REVISION: '' }], [['--check','--write'], {}], [['--writ'], {}]] as const)
      expect(() => bakeOptions(args, env)).toThrow();
    for (const base of ['https://not-local.invalid', 'http://localhost@elsewhere.invalid', 'http://user@localhost',
      'ftp://localhost', 'http://localhost/other/', 'http://localhost/?revision=stale'])
      expect(() => bakeOptions([], { VILLA_AUDIT_BASE: base })).toThrow();
  });
  it('rejects wrong project versions, ambiguous catalog identity and redirected/mutable entry paths', () => {
    expect(villaRelease(catalog([entry]), version, revision).base).toBe(base);
    for (const games of [[], [entry, entry], [{...entry, version: '1.2.2'}], [{...entry, apiVersion: 2}],
      [{...entry, entry: 'https://elsewhere.invalid' + entry.entry}], [{...entry, assetBase: '/games/villa/' }]])
      expect(() => villaRelease(catalog(games), version, revision)).toThrow();
    expect(() => villaRelease(catalog([entry]), version, 'ee'.repeat(20))).toThrow();
  });
  it('requires both the actual served module AND this checkout’s immutable module to match inventory', () => {
    const good = Buffer.from('export const id="villa"'), wrong = Buffer.from('different build'), sha = digest(good);
    expect(verifyEntryDigest(sha, good, good)).toBe(sha);
    for (const [a,b] of [[good,wrong],[wrong,good],[wrong,wrong]]) expect(() => verifyEntryDigest(sha, a, b)).toThrow();
  });
  it('matches the runtime field basis/extent and packs boundary cases for its decoder', () => {
    const { sun, ...bounds } = bakeField;
    expect({ ...bounds, dx: sun[0]/sun[1], dz: sun[2]/sun[1] }).toEqual(VILLA_SUN_FIELD);
    for (const n of [1,2,3,127,128,129,255,256,257]) {
      const repeat = Buffer.alloc(n,31), literals = Buffer.from(Array.from({length:n}, (_,i) => i % 7));
      const raw = Buffer.concat([literals,repeat,Buffer.from([2,2]),literals,repeat]);
      const packed = packHeightfield(raw);
      expect(Buffer.from(unpackSurvey(packed,raw.length)).equals(raw)).toBe(true);
      expect(packHeightfield(raw).equals(packed)).toBe(true);
    }
  });
  it('separates ordered source provenance from the encoded bytes and embeds both exact digests', () => {
    const packed = packHeightfield(Buffer.from([11,11,11,0,0,29]));
    const a = { path: [['mesh',0]], positions: 'geometry A' }, b = { path: [['mesh',1]], alphaUV: 'chart B' };
    const { source, sourceSha256, encodedSha256 } = surveySource([a,b],packed);
    expect(sourceSha256).toMatch(/^[a-f0-9]{64}$/); expect(encodedSha256).toBe(digest(packed));
    for (const part of [sourceSha256,encodedSha256,packed.toString('base64')]) expect(source).toContain(`'${part}'`);
    expect(surveySource([a,b],packed).source).toBe(source);
    expect(surveySource([b,a],packed).sourceSha256).not.toBe(sourceSha256);
    expect(surveySource([a,{...b,alphaUV:'different chart'}],packed).sourceSha256).not.toBe(sourceSha256);
    const other = surveySource([a,b],Buffer.from([128,77]));
    expect(other.sourceSha256).toBe(sourceSha256); expect(other.encodedSha256).not.toBe(encodedSha256);
  });
});
