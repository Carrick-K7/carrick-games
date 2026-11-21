// Allocation guard, not a rendering resolution: reject oversized frames rather than resample them.
const MAX_PIXELS = 4 * 1024 * 1024; // At most 16 MiB each for the PBO and the ImageData.
const MAX_SIDE = 16_384;
const PACK = [['PACK_ALIGNMENT', 4], ['PACK_ROW_LENGTH', 0], ['PACK_SKIP_PIXELS', 0], ['PACK_SKIP_ROWS', 0]] as const;
const REQUIRED = [
  'isContextLost', 'getParameter', 'pixelStorei', 'createBuffer', 'bindBuffer', 'bufferData', 'getBufferParameter',
  'readPixels', 'fenceSync', 'flush', 'clientWaitSync', 'getBufferSubData', 'deleteSync', 'deleteBuffer',
] as const;

/** Single-flight transfer of a complete default framebuffer. The caller owns scheduling and fallback. */
export class VillaFrameReadback {
  private readonly supported: boolean;
  private readonly savedPack = [4, 0, 0, 0];
  private disposed = false;
  private buffer: WebGLBuffer | null = null;
  private bytes = 0;
  private fence: WebGLSync | null = null;
  private width = 0;
  private height = 0;
  private image: ImageData | null = null;
  private words: Uint32Array | null = null;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.supported = typeof ImageData === 'function' && REQUIRED.every(name => typeof gl?.[name] === 'function');
  }

  get pending(): boolean { return this.fence !== null; }

  private packBinding(): WebGLBuffer | null {
    const binding = this.gl.getParameter(this.gl.PIXEL_PACK_BUFFER_BINDING);
    if (binding !== null && typeof binding !== 'object') throw new Error('Unknown pack buffer binding');
    return binding;
  }

  private bindOwnedBuffer(): void {
    const gl = this.gl;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.buffer);
    // A handle from before a context restore can be rejected without throwing. Never
    // resize, overwrite or download whichever other buffer happened to be bound.
    if (this.packBinding() !== this.buffer) throw new Error('Pack buffer unavailable');
  }

  private savePack(): void {
    for (let i = 0; i < PACK.length; i++) {
      const name = PACK[i][0], value = this.gl.getParameter(this.gl[name]);
      if (!Number.isInteger(value) || value < 0 || (name === 'PACK_ALIGNMENT' && value !== 1 && value !== 2 && value !== 4 && value !== 8)) {
        throw new Error('Unknown pixel pack state');
      }
      this.savedPack[i] = value;
    }
  }

  private setPack(restore: boolean): void {
    let failed = false;
    for (let i = 0; i < PACK.length; i++) {
      const name = PACK[i][0], tight = PACK[i][1], saved = this.savedPack[i];
      if (saved === tight) continue;
      try {
        this.gl.pixelStorei(this.gl[name], restore ? saved : tight);
        if (!restore && this.gl.getParameter(this.gl[name]) !== tight) failed = true;
      } catch { failed = true; } // Attempt all four restorations even if one fails during loss.
    }
    if (failed) throw new Error('Pixel pack state unavailable');
  }

  /** Queue immediately after drawing. A busy submission never replaces the outstanding frame. */
  submit(w: number, h: number): boolean {
    if (this.disposed || !this.supported) return false;
    const gl = this.gl;
    try {
      if (gl.isContextLost()) { this.cancel(); return false; }
      if (this.pending || !Number.isSafeInteger(w) || !Number.isSafeInteger(h)
        || w < 1 || h < 1 || w > MAX_SIDE || h > MAX_SIDE || w * h > MAX_PIXELS
        || w !== gl.drawingBufferWidth || h !== gl.drawingBufferHeight) return false;
      // Check the read source and transfer preconditions rather than draining the
      // renderer's shared GL error flags. READ and DRAW framebuffer bindings can
      // differ; refuse CCTV/offscreen or NONE instead of selecting another target.
      if (gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) !== null || gl.getParameter(gl.READ_BUFFER) !== gl.BACK) return false;
      const previous = this.packBinding();
      this.savePack();
      this.buffer ??= gl.createBuffer();
      if (!this.buffer) return false;
      try {
        this.bindOwnedBuffer();
        const bytes = w * h * 4;
        if (this.bytes !== bytes) {
          gl.bufferData(gl.PIXEL_PACK_BUFFER, bytes, gl.STREAM_READ);
          // WebGL allocation failure need not throw. Verify only on (re)allocation.
          if (gl.getBufferParameter(gl.PIXEL_PACK_BUFFER, gl.BUFFER_SIZE) !== bytes) throw new Error('Incomplete pack buffer');
          this.bytes = bytes;
        }
        try {
          this.setPack(false);
          gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, 0); // Byte offset into our PBO, never a CPU array.
          this.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
          if (!this.fence) throw new Error('Readback fence unavailable');
          gl.flush();
        } finally { this.setPack(true); }
      } finally { gl.bindBuffer(gl.PIXEL_PACK_BUFFER, previous); }
      if (gl.isContextLost()) { this.cancel(); return false; }
      this.width = w; this.height = h;
      return true;
    } catch { this.cancel(); return false; }
  }

  /** Result is borrowed until the next download. 'waiting' does not bind or download any buffer. */
  poll(): ImageData | 'waiting' | null {
    const gl = this.gl, fence = this.fence;
    if (!fence) return null;
    try {
      if (gl.isContextLost()) { this.cancel(); return null; }
      const status = gl.clientWaitSync(fence, 0, 0);
      if (gl.isContextLost() || !Number.isInteger(status)) { this.cancel(); return null; }
      if (status === gl.TIMEOUT_EXPIRED) return 'waiting';
      if (status !== gl.ALREADY_SIGNALED && status !== gl.CONDITION_SATISFIED) { this.cancel(); return null; }

      const w = this.width, h = this.height;
      if (!this.image || this.image.width !== w || this.image.height !== h || this.image.data.byteLength !== this.bytes) {
        this.image = new ImageData(w, h);
        this.words = new Uint32Array(this.image.data.buffer, this.image.data.byteOffset, w * h);
      }
      const previous = this.packBinding(); // May have changed since submit, e.g. during a security pass.
      try {
        this.bindOwnedBuffer();
        gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this.image.data);
      } finally { gl.bindBuffer(gl.PIXEL_PACK_BUFFER, previous); }
      if (gl.isContextLost()) { this.cancel(); return null; }
      this.fence = null;
      gl.deleteSync(fence);

      // Swap whole RGBA words in place: byte order is immaterial and no row views,
      // temporary rows or second full-size CPU store are allocated on later frames.
      const words = this.words!;
      for (let top = 0, bottom = (h - 1) * w; top < bottom; top += w, bottom -= w) {
        for (let x = 0; x < w; x++) {
          const pixel = words[top + x]; words[top + x] = words[bottom + x]; words[bottom + x] = pixel;
        }
      }
      return this.image;
    } catch { this.cancel(); return null; }
  }

  /** Deleting an in-flight buffer retires its storage on the GL timeline; never wait or reuse it. */
  cancel(): void {
    const fence = this.fence, buffer = this.buffer;
    this.fence = null; this.buffer = null; this.bytes = 0;
    this.image = null; this.words = null;
    try { if (fence) this.gl.deleteSync(fence); } catch { /* Already lost. */ }
    try { if (buffer) this.gl.deleteBuffer(buffer); } catch { /* Already lost. */ }
  }

  dispose(): void { this.disposed = true; this.cancel(); }
}
