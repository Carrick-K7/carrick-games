import type { ClassicBundle, ClassicSpriteBinding, ClassicTile } from './classicTypes.js';
import type { World } from './types.js';
/** Each live instance owns its decoded-canvas cache and source bundle. */
export class ClassicView {
  private canvases = new Map<string, { canvas: HTMLCanvasElement; bytes: number }>();
  private bytes = 0;
  readonly tiles: ClassicTile[];
  private rows = new Map<number, ClassicTile[]>();
  constructor(readonly bundle: ClassicBundle) {
    this.tiles = [...(bundle.map?.tiles ?? [])].sort((a, b) => a.x + a.y - b.x - b.y || layer(a.layer) - layer(b.layer));
    for (const tile of this.tiles) { const depth = tile.x + tile.y; const row = this.rows.get(depth) ?? []; row.push(tile); this.rows.set(depth, row); }
  }
  private image(key: string) {
    const old = this.canvases.get(key);
    if (old) { this.canvases.delete(key); this.canvases.set(key, old); return old.canvas; }
    const image = this.bundle.images[key]; if (!image) return null;
    const size = image.width * image.height * 4;
    while (this.bytes + size > 32 * 1024 * 1024 && this.canvases.size) {
      const key = this.canvases.keys().next().value!; this.bytes -= this.canvases.get(key)!.bytes; this.canvases.delete(key);
    }
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(image.rgba), image.width, image.height), 0, 0);
    this.canvases.set(key, { canvas, bytes: size }); this.bytes += size; return canvas;
  }
  draw(ctx: CanvasRenderingContext2D, key: string, x = 0, y = 0) {
    const image = this.bundle.images[key], canvas = this.image(key); if (!image || !canvas) return false;
    ctx.drawImage(canvas, x - image.anchorX, y - image.anchorY); return true;
  }
  drawBinding(ctx: CanvasRenderingContext2D, binding: ClassicSpriteBinding, x = 0, y = 0, facing = 0) {
    if (binding.shadow) this.draw(ctx, binding.shadow, x, y);
    return this.draw(ctx, binding.facings?.[facing % 8] ?? binding.image, x, y);
  }
  drawDepth(ctx: CanvasRenderingContext2D, world: World, camera: { x: number; y: number; zoom: number }, width: number, height: number, depth: number) {
    for (const tile of this.rows.get(depth) ?? []) {
      if (tile.ore && world.terrain[tile.y * world.width + tile.x]?.ore === 0) continue;
      const image = this.bundle.images[tile.image]!;
      const x = (tile.x - tile.y) * 30 * camera.zoom + camera.x;
      const y = ((tile.x + tile.y) * 15 - tile.height * 15) * camera.zoom + camera.y;
      if (x + (image.width - image.anchorX) * camera.zoom < 0 || x - image.anchorX * camera.zoom > width
        || y + (image.height - image.anchorY) * camera.zoom < 0 || y - image.anchorY * camera.zoom > height) continue;
      ctx.save(); ctx.translate(x, y); ctx.scale(camera.zoom, camera.zoom); this.draw(ctx, tile.image); ctx.restore();
    }
  }
  getDiagnostics() { return { canvases: this.canvases.size, canvasBytes: this.bytes, tiles: this.tiles.length, buildings: Object.keys(this.bundle.buildings).length, units: Object.keys(this.bundle.units).length }; }
  destroy() { this.canvases.clear(); this.bytes = 0; }
}
function layer(value: ClassicTile['layer']) { return value === 'ground' ? 0 : value === 'overlay' ? 1 : 2; }
