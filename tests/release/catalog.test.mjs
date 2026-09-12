import test from 'node:test';
import assert from 'node:assert/strict';
import { gameAssetBase, parseCatalog, parseGameMeta, parseGameRelease, releaseResource } from '../../packages/game-sdk/src/catalog.ts';

const sha = 'a'.repeat(40);
const base = gameAssetBase('sample', '1.0.0', sha);
const meta = {
  id: 'sample', group: 'puzzle', order: 2, icon: 'icon.svg', name: 'Sample', nameZh: '示例', desc: 'A sample game.', descZh: '示例游戏。',
  canvasSize: { width: 400, height: 400 }, controls: { keyboard: [{ keys: ['Space'], action: 'Restart', actionZh: '重新开始' }] },
};
const release = () => ({ ...structuredClone(meta), apiVersion: 1, version: '1.0.0', revision: sha, assetBase: base, entry: `${base}entry.js`, icon: `${base}icon.svg`, styles: [`${base}assets/style.css`], generation: 1, sequence: 1001, handledRevision: sha });
const origin = 'https://games.carrick7.com';

test('pure source metadata contains no loader or shell import', () => {
  const parsed = parseGameMeta({ ...meta, loader: 'untrusted', html: '<script>' });
  assert.equal(parsed.id, 'sample');
  assert.equal('loader' in parsed, false);
  assert.equal('html' in parsed, false);
});
test('release identity pins module, art and CSS to one immutable prefix', () => {
  const parsed = parseGameRelease(release(), origin);
  assert.equal(parsed.entry, `${base}entry.js`);
  assert.equal(parsed.styles[0], `${base}assets/style.css`);
  assert.equal(releaseResource('audio/start.wav', base, origin), `${base}audio/start.wav`);
});
test('resource resolver rejects traversal, other origins, queries and mismatched versions', () => {
  for (const path of ['../../entry.js', '/cs/assets/map.bsp', '//evil.invalid/a.js', 'https://evil.invalid/a.js', 'entry.js?new=1', 'entry.js#part', '%2e%2e/entry.js', 'assets/%2f.js']) {
    assert.throws(() => releaseResource(path, base, origin), path);
  }
  assert.throws(() => parseGameRelease({ ...release(), entry: base.replace('1.0.0', '1.1.0') + 'entry.js' }, origin));
});
test('protocol support is explicit rather than <= host version', () => {
  for (const apiVersion of [0, 2, '1', null]) assert.throws(() => parseGameRelease({ ...release(), apiVersion }, origin));
});
test('one invalid descriptor cannot hide valid games', () => {
  const { catalog, rejected } = parseCatalog({ schemaVersion: 1, apiVersion: 1, games: [release(), { ...release(), id: 'broken', apiVersion: 7 }] }, origin);
  assert.equal(catalog.games.length, 1);
  assert.equal(rejected.length, 1);
  assert.throws(() => parseCatalog({ schemaVersion: 2, apiVersion: 1, games: [] }, origin));
});
test('duplicate IDs are never rendered as distinct games', () => {
  const { catalog, rejected } = parseCatalog({ schemaVersion: 1, apiVersion: 1, games: [release(), release()] }, origin);
  assert.equal(catalog.games.length, 1);
  assert.equal(rejected.length, 1);
});
test('optional device notes, sections and covers preserve metadata without HTML', () => {
  const input = release();
  input.controls.notes = [{ text: 'Tap to move.', textZh: '点击移动。', audience: 'touch' }];
  input.controls.sections = [{ title: 'More', titleZh: '更多', notes: [{ text: 'Press E.', textZh: '按 E。', audience: 'keyboard' }] }];
  input.cover = { src: `${base}cover.webp`, width: 640, height: 400, focalPoint: { x: .5, y: .4 } };
  const parsed = parseGameRelease(input, origin);
  assert.equal(parsed.controls.notes[0].audience, 'touch');
  assert.equal(parsed.controls.sections[0].titleZh, '更多');
  assert.equal(parsed.cover.src, input.cover.src);
});
test('Wordle can describe the complete alphabet in one control row', () => {
  const keys = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index));
  const parsed = parseGameMeta({ ...meta, controls: { keyboard: [{ keys, action: 'Enter a letter', actionZh: '输入字母' }] } });
  assert.equal(parsed.controls.keyboard[0].keys.length, 26);
});
test('catalog metadata validates dimension, identity and control limits', () => {
  assert.throws(() => parseGameMeta({ ...meta, id: '../shell' }));
  assert.throws(() => parseGameMeta({ ...meta, canvasSize: { width: Infinity, height: 1 } }));
  assert.throws(() => parseGameMeta({ ...meta, controls: { keyboard: [{ keys: [], action: 'Move', actionZh: '移动' }] } }));
  assert.throws(() => parseGameMeta({ ...meta, controls: { notes: [{ text: 'A', textZh: '甲', audience: 'fake' }] } }));
});
