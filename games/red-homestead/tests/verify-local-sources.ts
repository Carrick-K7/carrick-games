/** Optional, local-only format audit. Never copies downloaded source assets into a release. */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { decodePalette, decodeShp, decodeTmp, parseMix } from '../src/ra2/index.js';
import { decodeVxl } from '../src/ra2/vxl.js';
import { decodeHva, validateVoxelPair } from '../src/ra2/hva.js';
import { rasterizeVoxelPreview } from '../src/voxelPreview.js';
const directory = process.env.RA2_REFERENCE_DIR;
if (!directory) throw new Error('Set RA2_REFERENCE_DIR to the external reference assets directory');
const root = resolve(directory);
const sources = JSON.parse(readFileSync(join(root, 'sources.json'), 'utf8')) as { name: string; source: string; bytes: number; sha256: string }[];
function bytes(name: string) {
  const source = sources.find(source => source.name === name); assert.ok(source, `${name}: missing provenance`);
  const data = readFileSync(join(root, name)); assert.equal(data.byteLength, source.bytes);
  assert.equal(createHash('sha256').update(data).digest('hex'), source.sha256, `${name}: reference changed`);
  return new Uint8Array(data);
}
const unitPalette = decodePalette(bytes('unittem.pal')), terrainPalette = decodePalette(bytes('isotem.pal'));
const report: unknown[] = [];
for (const name of ['gatech01.shp', 'cala03.shp', 'cagard03.shp']) {
  const shp = decodeShp(bytes(name), unitPalette);
  assert.ok(shp.frames.some(frame => frame.rgba.some((value, index) => index % 4 === 3 && value > 0)));
  report.push({ name, canvas: [shp.width, shp.height], frames: shp.frames.length, firstFrame: [shp.frames[0]?.width, shp.frames[0]?.height] });
}
const tmp = decodeTmp(bytes('btrack01.tem'), terrainPalette);
assert.equal(tmp.tileWidth, 60); assert.equal(tmp.tileHeight, 30); assert.equal(tmp.tiles.filter(Boolean).length, 1);
report.push({ name: 'btrack01.tem', cells: tmp.tiles.filter(Boolean).length, size: [tmp.tileWidth, tmp.tileHeight] });
const vxl = decodeVxl(bytes('seas.vxl')), hva = decodeHva(bytes('seas.hva'));
validateVoxelPair(vxl, hva); assert.ok(vxl.voxelCount > 0);
const preview = rasterizeVoxelPreview(vxl, hva, unitPalette);
assert.ok(preview.rgba.some((value, index) => index % 4 === 3 && value > 0));
report.push({ name: 'seas geometry preview', size: [preview.width, preview.height], lighting: preview.lighting });
report.push({ name: 'seas.vxl + seas.hva', limbs: vxl.limbs.map(limb => ({ name: limb.name, size: [limb.sizeX, limb.sizeY, limb.sizeZ], voxels: limb.voxelCount })), frames: hva.frameCount });
const mix = parseMix(bytes('ares.mix')); assert.equal(mix.entries.length, 3);
report.push({ name: 'ares.mix', entries: mix.entries.map(entry => ({ id: entry.id, bytes: entry.size })) });
console.log(JSON.stringify({ externalReferenceRoot: root, scope: 'format verification, not original-byte or redistribution certification', report }, null, 2));
