import { afterEach, expect, test, vi } from 'vitest';
import { createDefaultGameHost } from '../src/game';

afterEach(() => vi.unstubAllGlobals());

test('isolated hosts capture the active release once, never a mutable global base', () => {
  const a = `/games/sample/1.0.0/${'a'.repeat(40)}/`;
  const b = `/games/sample/1.1.0/${'b'.repeat(40)}/`;
  const canvas = { dataset: { gameAssetBase: a } };
  vi.stubGlobal('document', { getElementById: () => canvas });
  vi.stubGlobal('window', { location: { origin: 'https://games.carrick7.com' } });
  const old = createDefaultGameHost('canvas', 400, 400);
  canvas.dataset.gameAssetBase = b;
  const next = createDefaultGameHost('canvas', 400, 400);
  expect(old.assetUrl?.('weapons/item.webp')).toBe(`${a}weapons/item.webp`);
  expect(next.assetUrl?.('weapons/item.webp')).toBe(`${b}weapons/item.webp`);
  expect(() => old.assetUrl?.('../other.js')).toThrow();
  expect(() => old.assetUrl?.('/cs/assets/map.bsp')).toThrow();
});

test('source-only canvas fixtures need no deployed resource prefix', () => {
  vi.stubGlobal('document', { getElementById: () => ({ dataset: {} }) });
  const host = createDefaultGameHost('canvas', 320, 480);
  expect(host.assetUrl).toBeUndefined();
  expect(host.logicalWidth).toBe(320);
  expect(host.logicalHeight).toBe(480);
});
