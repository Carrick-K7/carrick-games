import { decodePalette, decodeShp, decodeTmp, parseMix, decodeMapTerrain, decodeMapPreview, Ra2FormatError } from './ra2/index.js';
import { decodeVxl } from './ra2/vxl.js';
import { decodeHva } from './ra2/hva.js';
import { rasterizeVoxelPreview } from './voxelPreview.js';
export interface AssetRequest { kind: 'shp' | 'tmp' | 'mix' | 'vxl' | 'map'; bytes: ArrayBuffer; palette?: ArrayBuffer; animation?: ArrayBuffer }
export interface AssetPreview { width?: number; height?: number; rgba?: Uint8ClampedArray; summary: string }
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<AssetRequest>) => void) | null;
  postMessage(value: { ok: true; preview: AssetPreview } | { ok: false; error: string }, transfer?: Transferable[]): void;
};
scope.onmessage = ({ data }) => {
  try {
    if (!(data.bytes instanceof ArrayBuffer) || data.bytes.byteLength > 64 * 1024 * 1024) throw new Error('file-limit');
    const bytes = new Uint8Array(data.bytes);
    if (data.kind === 'mix') {
      const archive = parseMix(bytes);
      scope.postMessage({ ok: true, preview: { summary: `${archive.entries.length} entries\n${archive.entries.slice(0, 20).map(item => `${item.id.toString(16)} · ${item.size} bytes`).join('\n')}` } });
    } else if (data.kind === 'map') {
      const terrain = decodeMapTerrain(bytes);
      const summary = `${terrain.theater} · ${terrain.tileCount} decoded cells · ${terrain.chunkCount} chunks\nEmbedded preview only; theater assets are still required for a playable scene.`;
      try {
        const preview = decodeMapPreview(bytes);
        scope.postMessage({ ok: true, preview: { width: preview.width, height: preview.height, rgba: preview.rgba, summary } }, [preview.rgba.buffer as ArrayBuffer]);
      } catch (error) {
        if (error instanceof Ra2FormatError && error.code === 'UNSUPPORTED') scope.postMessage({ ok: true, preview: { summary } });
        else throw error;
      }
    } else {
      if (!(data.palette instanceof ArrayBuffer) || data.palette.byteLength !== 768) throw new Error('matching-palette-required');
      const palette = decodePalette(new Uint8Array(data.palette));
      const image = data.kind === 'shp' ? decodeShp(bytes, palette).frames.find(frame => frame.width > 0 && frame.height > 0)
        : data.kind === 'tmp' ? decodeTmp(bytes, palette).tiles.find(tile => tile != null)
        : data.kind === 'vxl' && data.animation ? rasterizeVoxelPreview(decodeVxl(bytes), decodeHva(new Uint8Array(data.animation)), palette) : undefined;
      if (!image) throw new Error('empty-or-unsupported-image');
      const rgba = new Uint8ClampedArray(image.rgba);
      scope.postMessage({ ok: true, preview: { width: image.width, height: image.height, rgba, summary: `${image.width} × ${image.height}${data.kind === 'vxl' ? ' · Geometry preview / palette-only lighting' : ''}` } }, [rgba.buffer]);
    }
  } catch (error) { scope.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) }); }
};
