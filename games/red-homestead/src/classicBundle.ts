import type { BuildingKind, UnitKind } from './types.js';
import type { ClassicBundle, ClassicImage, ClassicImportOptions, LocalSourceFiles } from './classicTypes.js';
import { SourceLibrary } from './classicSources.js';
import { compileClassicMap } from './classicMap.js';
import { decodePalette, decodeShp, decodeVxl, decodeHva } from './ra2/index.js';
import { rasterizeVoxelPreview } from './voxelPreview.js';
import { validateClassicBundle, CLASSIC_IMAGE_BUDGET } from './classicValidation.js';

/** These assets have no attacking body parts. Never load TUR/BARL files or weapon rules. */
const BUILDING_SOURCES: Partial<Record<BuildingKind, string[]>> = {
  yard: ['gacnst', 'nacnst'], power: ['gapowr', 'napowr'], refinery: ['garefn', 'narefn'],
  workshop: ['gaweap', 'naweap'], house: ['cahse01', 'cahse02'], apartment: ['canewy01', 'canewy02'],
  clinic: ['cahosp'], warehouse: ['caind01'], library: ['gatech', 'gatech01'],
};
const UNIT_SOURCES: Partial<Record<UnitKind, string[]>> = {
  mcv: ['mcv', 'amcv', 'smcv'], miner: ['cmin'], truck: ['trucka', 'truckb'],
};
function names(base: string, theater: string) {
  const code = ({ TEMPERATE: 't', SNOW: 'a', URBAN: 'u', NEWURBAN: 'n', DESERT: 'd', LUNAR: 'l' } as Record<string, string>)[theater] ?? 't';
  return [...new Set([base.slice(0, 1) + code + base.slice(2), base])].map(name => `${name}.shp`);
}
async function sha(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}
export async function compileClassicBundle(files: LocalSourceFiles, options: ClassicImportOptions = {}): Promise<ClassicBundle> {
  if (files.size === 0 || files.size > 12000) throw new Error('source-file-count');
  let total = 0;
  for (const data of files.values()) { total += data.length; if (total > 256 * 1024 * 1024) throw new Error('source-input-budget'); }
  const library = new SourceLibrary(files);
  const bundle: ClassicBundle = { schemaVersion: 1, id: '', label: options.label?.trim().slice(0, 80) || 'Local classic materials', images: Object.create(null), buildings: {}, units: {}, map: null, warnings: [], sourceFiles: [] };
  let imageBytes = 0;
  const addImage = (key: string, image: ClassicImage) => {
    const next = imageBytes + image.rgba.byteLength - (bundle.images[key]?.rgba.byteLength ?? 0);
    if (next > CLASSIC_IMAGE_BUDGET) throw new Error('classic-image-budget');
    bundle.images[key] = image; imageBytes = next;
  };
  const checkRemaining = () => { if (imageBytes >= CLASSIC_IMAGE_BUDGET) throw new Error('classic-image-budget'); };
  if (options.mapFile) {
    const result = await compileClassicMap(files, options);
    bundle.map = result.map;
    for (const [key, image] of Object.entries(result.images)) addImage(key, image);
    bundle.warnings.push(...result.warnings);
  }
  const theater = bundle.map?.theater ?? options.theater ?? 'TEMPERATE';
  const suffix = ({ TEMPERATE: 'tem', SNOW: 'sno', URBAN: 'urb', NEWURBAN: 'ubn', DESERT: 'des', LUNAR: 'lun' } as Record<string, string>)[theater] ?? 'tem';
  const paletteName = `unit${suffix}.pal`, paletteData = library.get(paletteName);
  if (paletteData) {
    const palette = decodePalette(paletteData); bundle.sourceFiles.push(paletteName);
    for (const [kind, candidates] of Object.entries(BUILDING_SOURCES)) {
      let found: { name: string; bytes: Uint8Array } | undefined;
      for (const candidate of candidates!) {
        for (const name of names(candidate, theater)) { const bytes = library.get(name); if (bytes) { found = { name, bytes }; break; } }
        if (found) break;
      }
      if (!found) continue;
      checkRemaining();
      const shp = decodeShp(found.bytes, palette);
      const frame = shp.frames.find(frame => frame.width > 0 && frame.height > 0);
      if (!frame) throw new Error(`empty-peaceful-building:${found.name}`);
      const key = `building:${kind}`;
      // Bottom-centred presentation is explicit; original art.ini per-building offsets are not claimed.
      addImage(key, { width: frame.width, height: frame.height, rgba: frame.rgba, anchorX: frame.width / 2, anchorY: frame.height - 7 });
      bundle.buildings[kind as BuildingKind] = { image: key, sourceName: found.name }; bundle.sourceFiles.push(found.name);
    }
    for (const [kind, candidates] of Object.entries(UNIT_SOURCES)) {
      const name = candidates!.find(name => library.has(`${name}.vxl`) && library.has(`${name}.hva`));
      if (!name) continue;
      const model = decodeVxl(library.get(`${name}.vxl`)!), animation = decodeHva(library.get(`${name}.hva`)!);
      // Exclude unexpected integrated weapons, rather than assuming every uploaded model is peaceful.
      if (model.limbs.some(limb => /turret|barrel|missile|weapon|gun/i.test(limb.name))) { bundle.warnings.push(`weapon-like-section-skipped:${name}`); continue; }
      const facings: string[] = [];
      for (let facing = 0; facing < 8; facing++) {
        checkRemaining();
        const image = rasterizeVoxelPreview(model, animation, palette, 0, facing * Math.PI / 4);
        const key = `unit:${kind}:${facing}`;
        addImage(key, image as ClassicImage); facings.push(key);
      }
      bundle.units[kind as UnitKind] = { image: facings[0]!, facings, sourceName: `${name}.vxl` };
      bundle.sourceFiles.push(`${name}.vxl`, `${name}.hva`);
    }
    if (Object.keys(bundle.units).length) bundle.warnings.push('voxel-lighting:palette-only; original VPL normal shading is not implemented');
    if (Object.keys(bundle.buildings).length) bundle.warnings.push('building-alignment:bottom-centred; original art.ini per-building offsets are not fully reproduced');
  } else bundle.warnings.push(`peaceful-sprites-not-loaded:missing ${paletteName}`);
  if (!bundle.map && !Object.keys(bundle.buildings).length && !Object.keys(bundle.units).length) throw new Error('no-supported-peaceful-materials: include matching UNIT palette and supported building SHP or unarmed VXL/HVA pairs');
  bundle.warnings.push(...library.warnings);
  bundle.sourceFiles = [...new Set([...bundle.sourceFiles, ...(options.mapFile ? [options.mapFile] : [])])].sort();
  // Identity follows used decoded content, never directory names or unrelated selected files.
  // Re-importing identical resources from a renamed folder restores the same saved home.
  const inventory: { key: string; width: number; height: number; anchorX: number; anchorY: number; hash: string }[] = [];
  for (const [key, image] of Object.entries(bundle.images).sort(([a], [b]) => a.localeCompare(b))) inventory.push({ key, width: image.width, height: image.height, anchorX: image.anchorX, anchorY: image.anchorY, hash: await sha(new Uint8Array(image.rgba.buffer, image.rgba.byteOffset, image.rgba.byteLength)) });
  bundle.id = await sha(new TextEncoder().encode(JSON.stringify({ compiler: 1, inventory, map: bundle.map, buildings: bundle.buildings, units: bundle.units, theater })));
  return validateClassicBundle(bundle);
}
