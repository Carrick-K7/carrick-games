// Offline only (Node >=22.18); run: node games/cs/tests/export-hud-weapon-icons.mjs
// Runtime consumes game-owned SVG files, never imports this tool/shared source.
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WEAPON_SILHOUETTES, WEAPON_SILHOUETTE_DIMS } from '../../../packages/weapon-art/src/silhouettes.ts';

// Internal legacy IDs retain the visible names in this game's csWeapons.js:
// m4a1=M4A1-S (not M4A4), tmp=MP9, m3=Nova, scout=SSG 08, sg552=SG 553.
export const HUD_WEAPON_SOURCES = Object.freeze({
  ak47: 'ak47', m4a1: 'm4a1s', awp: 'awp', mp5: 'mp5', tmp: 'mp9', p90: 'p90',
  mac10: 'mac10', sg552: 'sg552', aug: 'aug', scout: 'scout', g3sg1: 'g3sg1',
  m3: 'm3', xm1014: 'xm1014', m249: 'm249', deagle: 'deagle', usp: 'usp', glock: 'glock',
});
const sourceFile = 'packages/weapon-art/src/silhouettes.ts';
const output = new URL('../public/assets/ui/weapons/', import.meta.url);
const sha256 = value => createHash('sha256').update(value).digest('hex');

function sourceViewBox(key) {
  // Relative-command rounding leaves some traces slightly off the nominal zero
  // center. Measure anchors/control points exactly as the shared DIMS contract
  // does, so a tight viewBox never clips those edges. Path bytes remain intact.
  const tokens = WEAPON_SILHOUETTES[key].match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/g);
  let i = 0, command = '', x = 0, y = 0, startX = 0, startY = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  while (i < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[i])) command = tokens[i++];
    const op = command.toLowerCase(), relative = command === op;
    if (op === 'z') { x = startX; y = startY; command = ''; continue; }
    if (!['m', 'l', 'c'].includes(op)) throw new Error(`Unsupported source command ${command}`);
    const count = op === 'c' ? 6 : 2, values = tokens.slice(i, i + count).map(Number);
    if (values.length !== count || !values.every(Number.isFinite)) throw new Error(`Invalid source path ${key}`);
    i += count;
    for (let j = 0; j < count; j += 2) {
      const px = values[j] + (relative ? x : 0), py = values[j + 1] + (relative ? y : 0);
      minX = Math.min(minX, px); minY = Math.min(minY, py);
      maxX = Math.max(maxX, px); maxY = Math.max(maxY, py);
    }
    x = values[count - 2] + (relative ? x : 0); y = values[count - 1] + (relative ? y : 0);
    if (op === 'm') { startX = x; startY = y; command = relative ? 'l' : 'L'; }
  }
  const [w, h] = WEAPON_SILHOUETTE_DIMS[key];
  if (Math.abs(maxX - minX - w) > 1e-6 || Math.abs(maxY - minY - h) > 1e-6) throw new Error(`Source dimension drift: ${key}`);
  return [Number(minX.toFixed(6)), Number(minY.toFixed(6)), w, h];
}

export function hudWeaponSvg(id) {
  if (!Object.hasOwn(HUD_WEAPON_SOURCES, id)) throw new Error(`No exact HUD firearm source for ${id}`);
  const key = HUD_WEAPON_SOURCES[id], path = WEAPON_SILHOUETTES[key];
  const dims = WEAPON_SILHOUETTE_DIMS[key];
  if (!path || !dims?.every(value => Number.isFinite(value) && value > 0)) throw new Error(`Invalid silhouette source: ${key}`);
  const [w, h] = dims, viewBox = sourceViewBox(key);
  // No transform, path simplification, aspect distortion, background, or stroke.
  // Integer intrinsic dimensions give HTMLImageElement a useful natural size.
  return `<!-- Derived unchanged from ${sourceFile} (${key}), traced from Valve inventory renders. See ../../../CREDITS.md. -->\n`
    + `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w * 1000)}" height="${Math.round(h * 1000)}" viewBox="${viewBox.join(' ')}" preserveAspectRatio="xMidYMid meet">\n`
    + `  <path fill="#f0f3f5" d="${path}"/>\n</svg>\n`;
}

export function hudWeaponManifest() {
  return {
    schemaVersion: 1,
    source: sourceFile,
    generator: 'games/cs/tests/export-hud-weapon-icons.mjs',
    attribution: 'Valve inventory-render traces; rights remain with their respective owners. See ../../../CREDITS.md.',
    fill: '#f0f3f5',
    orientation: 'Original source orientation; muzzle +x, grip +y.',
    weapons: Object.fromEntries(Object.entries(HUD_WEAPON_SOURCES).map(([id, sourceId]) => {
      const [w, h] = WEAPON_SILHOUETTE_DIMS[sourceId];
      return [id, { file: `${id}.svg`, sourceId, width: Math.round(w * 1000), height: Math.round(h * 1000),
        viewBox: sourceViewBox(sourceId), pathSha256: sha256(WEAPON_SILHOUETTES[sourceId]), svgSha256: sha256(hudWeaponSvg(id)) }];
    })),
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  // Compute and validate every output before writing; no network/browser/build.
  const files = Object.keys(HUD_WEAPON_SOURCES).map(id => [`${id}.svg`, hudWeaponSvg(id)]);
  const manifest = `${JSON.stringify(hudWeaponManifest(), null, 2)}\n`;
  await mkdir(output, { recursive: true });
  for (const [name, svg] of files) await writeFile(new URL(name, output), svg);
  await writeFile(new URL('manifest.json', output), manifest);
  console.log(`Exported ${files.length} exact CS HUD firearm SVGs and manifest.json.`);
}
