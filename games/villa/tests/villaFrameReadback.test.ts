import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VillaFrameReadback } from '../src/villaFrameReadback.js';

class BufferHandle {
  data = new Uint8Array(0);
  ready = false;
  deleted = false;
}
class FenceHandle {
  deleted = false;
  constructor(readonly buffer: BufferHandle) {}
}
const images: TestImage[] = [];
class TestImage {
  readonly data: Uint8ClampedArray;
  constructor(readonly width: number, readonly height: number) {
    this.data = new Uint8ClampedArray(width * height * 4);
    images.push(this);
  }
}

/** Stateful WebGL2 subset: pack layout affects actual bytes, a signal belongs to a
 * specific queued buffer, and touching another pass's buffer fails even inside a caught GL call. */
class MockGL {
  readonly PIXEL_PACK_BUFFER = 0x88eb; readonly PIXEL_PACK_BUFFER_BINDING = 0x88ed;
  readonly PACK_ALIGNMENT = 0x0d05; readonly PACK_ROW_LENGTH = 0x0d02;
  readonly PACK_SKIP_PIXELS = 0x0d04; readonly PACK_SKIP_ROWS = 0x0d03;
  readonly STREAM_READ = 0x88e1; readonly BUFFER_SIZE = 0x8764;
  readonly READ_FRAMEBUFFER_BINDING = 0x8caa; readonly READ_BUFFER = 0x0c02; readonly BACK = 0x0405;
  readonly RGBA = 0x1908; readonly UNSIGNED_BYTE = 0x1401; readonly SYNC_GPU_COMMANDS_COMPLETE = 0x9117;
  readonly ALREADY_SIGNALED = 0x911a; readonly TIMEOUT_EXPIRED = 0x911b; readonly CONDITION_SATISFIED = 0x911c; readonly WAIT_FAILED = 0x911d;
  readonly buffers: BufferHandle[] = [];
  readonly fences: FenceHandle[] = [];
  readonly violations: string[] = [];
  readonly events: string[] = [];
  lost = false;
  status: number = this.TIMEOUT_EXPIRED;
  drawingBufferWidth = 3;
  drawingBufferHeight = 3;
  frame = Uint8Array.from({ length: 36 }, (_, i) => i * 51 + 7);
  readFBO: object | null = null;
  readSource: number = this.BACK;
  pack = new Map<number, number>([[this.PACK_ALIGNMENT, 8], [this.PACK_ROW_LENGTH, 9], [this.PACK_SKIP_PIXELS, 2], [this.PACK_SKIP_ROWS, 1]]);
  bound: BufferHandle | null = new BufferHandle(); // Renderer-owned, never ours to write, download or delete.
  private lastRead: BufferHandle | null = null;

  private illegal(message: string): never { this.violations.push(message); throw new Error(message); }
  private owned(target: number): BufferHandle {
    if (target !== this.PIXEL_PACK_BUFFER || !this.bound || this.bound.deleted || !this.buffers.includes(this.bound)) return this.illegal('foreign or absent PBO');
    return this.bound;
  }
  isContextLost = vi.fn(() => this.lost);
  getParameter = vi.fn((parameter: number): unknown => {
    if (parameter === this.READ_FRAMEBUFFER_BINDING) return this.readFBO;
    if (parameter === this.READ_BUFFER) return this.readSource;
    if (parameter === this.PIXEL_PACK_BUFFER_BINDING) return this.bound;
    if (this.pack.has(parameter)) return this.pack.get(parameter);
    return this.illegal('unexpected renderer parameter');
  });
  pixelStorei = vi.fn((parameter: number, value: number) => {
    if (!this.pack.has(parameter)) this.illegal('changed unrelated pixel storage');
    this.pack.set(parameter, value);
  });
  createBuffer = vi.fn((): BufferHandle | null => {
    this.events.push('create'); const buffer = new BufferHandle(); this.buffers.push(buffer); return buffer;
  });
  bindBuffer = vi.fn((target: number, buffer: BufferHandle | null) => {
    if (target !== this.PIXEL_PACK_BUFFER || buffer?.deleted) this.illegal('invalid target/buffer binding');
    this.bound = buffer;
  });
  bufferData = vi.fn((target: number, bytes: number, usage: number) => {
    if (usage !== this.STREAM_READ || typeof bytes !== 'number') this.illegal('wrong PBO allocation');
    this.events.push('allocate'); this.owned(target).data = new Uint8Array(bytes);
  });
  getBufferParameter = vi.fn((target: number, parameter: number) => {
    if (parameter !== this.BUFFER_SIZE) return this.illegal('unexpected buffer parameter');
    return this.owned(target).data.byteLength;
  });
  readPixels = vi.fn((x: number, y: number, w: number, h: number, format: number, type: number, offset: number) => {
    const buffer = this.owned(this.PIXEL_PACK_BUFFER);
    if (x !== 0 || y !== 0 || w !== this.drawingBufferWidth || h !== this.drawingBufferHeight || this.readFBO || this.readSource !== this.BACK
      || format !== this.RGBA || type !== this.UNSIGNED_BYTE || offset !== 0) this.illegal('not a complete default RGBA8 offset read');
    const align = this.pack.get(this.PACK_ALIGNMENT)!;
    const stride = Math.ceil((this.pack.get(this.PACK_ROW_LENGTH) || w) * 4 / align) * align;
    const start = offset + this.pack.get(this.PACK_SKIP_ROWS)! * stride + this.pack.get(this.PACK_SKIP_PIXELS)! * 4;
    if (start + (h - 1) * stride + w * 4 > buffer.data.length) this.illegal('pack overrun');
    for (let row = 0; row < h; row++) buffer.data.set(this.frame.subarray(row * w * 4, (row + 1) * w * 4), start + row * stride);
    this.events.push('readPixels'); buffer.ready = false; this.lastRead = buffer;
  });
  fenceSync = vi.fn((condition: number, flags: number): FenceHandle | null => {
    if (!this.lastRead || condition !== this.SYNC_GPU_COMMANDS_COMPLETE || flags !== 0) return this.illegal('invalid fence');
    const fence = new FenceHandle(this.lastRead); this.fences.push(fence); this.events.push('fence'); return fence;
  });
  flush = vi.fn(() => { this.events.push('flush'); });
  clientWaitSync = vi.fn((fence: FenceHandle, flags: number, timeout: number) => {
    if (!this.fences.includes(fence) || fence.deleted || flags !== 0 || timeout !== 0) this.illegal('blocking or invalid wait');
    this.events.push('wait');
    if (this.status === this.ALREADY_SIGNALED || this.status === this.CONDITION_SATISFIED) fence.buffer.ready = true;
    return this.status;
  });
  getBufferSubData = vi.fn((target: number, offset: number, destination: Uint8ClampedArray) => {
    const buffer = this.owned(target);
    if (!buffer.ready || offset !== 0 || destination.byteLength !== buffer.data.byteLength) this.illegal('early or partial download');
    this.events.push('download'); destination.set(buffer.data);
  });
  deleteSync = vi.fn((fence: FenceHandle) => {
    if (!this.fences.includes(fence) || fence.deleted) this.illegal('foreign or duplicate fence delete');
    this.events.push('deleteSync'); fence.deleted = true;
  });
  deleteBuffer = vi.fn((buffer: BufferHandle) => {
    if (!this.buffers.includes(buffer) || buffer.deleted) this.illegal('foreign or duplicate buffer delete');
    this.events.push('deleteBuffer'); buffer.deleted = true; if (this.bound === buffer) this.bound = null;
  });
  bindFramebuffer = () => this.illegal('rebound renderer framebuffer');
  readBuffer = () => this.illegal('changed renderer read buffer');
  finish = () => this.illegal('blocked on GPU');
}

const mocks: MockGL[] = [];
function context() { const gl = new MockGL(); mocks.push(gl); return gl; }
function transport(gl: MockGL) { return new VillaFrameReadback(gl as unknown as WebGL2RenderingContext); }
function fixture() { const gl = context(); return { gl, reader: transport(gl) }; }
function ready(reader: VillaFrameReadback): ImageData {
  const frame = reader.poll();
  if (frame === 'waiting' || !frame) throw new Error('Expected a completed frame');
  return frame;
}
beforeEach(() => { vi.stubGlobal('ImageData', TestImage); });
afterEach(() => {
  const violations = mocks.flatMap(gl => gl.violations);
  mocks.length = images.length = 0; vi.unstubAllGlobals(); vi.restoreAllMocks();
  expect(violations).toEqual([]);
});

describe('Villa single-flight default-framebuffer readback', () => {
  it('queues before fencing/flushing, waits with zero timeout, and flips exactly the submitted RGBA bytes', () => {
    const { gl, reader } = fixture(), previous = gl.bound, pack = new Map(gl.pack);
    const bottom = [0, 1, 255, 0, 56, 93, 202, 128, 255, 0, 61, 255];
    const middle = [8, 9, 10, 11, 250, 251, 252, 253, 1, 2, 3, 4];
    const top = [223, 77, 0, 7, 11, 99, 255, 201, 5, 6, 7, 8];
    gl.frame.set([...bottom, ...middle, ...top]);
    expect(reader.pending).toBe(false); expect(reader.poll()).toBeNull();
    expect(reader.submit(3, 3)).toBe(true); expect(reader.pending).toBe(true);
    expect(gl.events).toEqual(['create', 'allocate', 'readPixels', 'fence', 'flush']);
    expect(gl.readPixels).toHaveBeenCalledWith(0, 0, 3, 3, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    expect(gl.bound).toBe(previous); expect(gl.pack).toEqual(pack);
    expect(gl.bufferData).toHaveBeenCalledWith(gl.PIXEL_PACK_BUFFER, 36, gl.STREAM_READ);

    // The renderer can freely change the image, read target, dimensions, pack binding and layout after submission.
    gl.frame.fill(42); gl.readFBO = {}; gl.drawingBufferWidth++; gl.bound = null; gl.pack.set(gl.PACK_SKIP_ROWS, 5);
    const binds = gl.bindBuffer.mock.calls.length, stores = gl.pixelStorei.mock.calls.length;
    expect(reader.submit(4, 3)).toBe(false); expect(reader.submit(3, 3)).toBe(false);
    for (let i = 0; i < 3; i++) { expect(reader.poll()).toBe('waiting'); expect(reader.pending).toBe(true); }
    expect(gl.bindBuffer).toHaveBeenCalledTimes(binds); expect(gl.getBufferSubData).not.toHaveBeenCalled();
    expect(gl.deleteSync).not.toHaveBeenCalled(); expect(images).toHaveLength(0);
    gl.status = gl.CONDITION_SATISFIED;
    const frame = ready(reader);
    expect([frame.width, frame.height]).toEqual([3, 3]); expect([...frame.data]).toEqual([...top, ...middle, ...bottom]);
    expect(gl.events.slice(5)).toEqual(['wait', 'wait', 'wait', 'wait', 'download', 'deleteSync']);
    for (const call of gl.clientWaitSync.mock.calls) expect(call).toEqual([gl.fences[0], 0, 0]);
    expect(reader.pending).toBe(false); expect(reader.poll()).toBeNull();
    expect(gl.bound).toBeNull(); expect(gl.readFBO).not.toBeNull(); expect(gl.pack.get(gl.PACK_SKIP_ROWS)).toBe(5);
    expect(gl.pixelStorei).toHaveBeenCalledTimes(stores); expect(gl.deleteBuffer).not.toHaveBeenCalled();
    reader.dispose(); expect(gl.deleteBuffer).toHaveBeenCalledWith(gl.buffers[0]);
  });

  it('allocates one PBO/store/image at steady size, retires every fence and resizes only what changed', () => {
    const { gl, reader } = fixture(); gl.status = gl.ALREADY_SIGNALED;
    gl.pack.set(gl.PACK_ALIGNMENT, 4); gl.pack.set(gl.PACK_ROW_LENGTH, 0); gl.pack.set(gl.PACK_SKIP_PIXELS, 0); gl.pack.set(gl.PACK_SKIP_ROWS, 0);
    let first: ImageData | undefined;
    for (let i = 0; i < 20; i++) {
      gl.frame[0] = i; gl.frame[24] = 220 - i;
      expect(reader.submit(3, 3)).toBe(true);
      const frame = ready(reader); first ??= frame;
      expect(frame).toBe(first); expect(frame.data[0]).toBe(220 - i); expect(frame.data[24]).toBe(i);
    }
    expect(gl.pixelStorei).not.toHaveBeenCalled(); // No unpack changes or redundant default pack changes.
    expect(gl.createBuffer).toHaveBeenCalledTimes(1); expect(gl.bufferData).toHaveBeenCalledTimes(1);
    expect(gl.getBufferParameter).toHaveBeenCalledTimes(1); expect(images).toHaveLength(1);
    expect(new Set(gl.getBufferSubData.mock.calls.map(call => call[2])).size).toBe(1);
    expect(gl.fences).toHaveLength(20); expect(gl.fences.every(fence => fence.deleted)).toBe(true);

    gl.drawingBufferWidth = 9; gl.drawingBufferHeight = 1;
    expect(reader.submit(9, 1)).toBe(true); const wide = ready(reader);
    expect(wide).not.toBe(first); expect([wide.width, wide.height]).toEqual([9, 1]); expect([...wide.data]).toEqual([...gl.frame]);
    expect(gl.bufferData).toHaveBeenCalledTimes(1); // Same byte count with a different ImageData shape.
    gl.drawingBufferWidth = 2; gl.drawingBufferHeight = 2; gl.frame = Uint8Array.from({ length: 16 }, (_, i) => i);
    expect(reader.submit(2, 2)).toBe(true); const small = ready(reader);
    expect([...small.data]).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 0, 1, 2, 3, 4, 5, 6, 7]);
    expect(gl.createBuffer).toHaveBeenCalledTimes(1); expect(gl.bufferData.mock.calls.map(call => call[1])).toEqual([36, 16]);
    expect(images).toHaveLength(3); reader.dispose(); reader.dispose(); expect(gl.deleteBuffer).toHaveBeenCalledTimes(1);
  });

  it('refuses a non-default READ framebuffer, a disabled default read buffer, and an unknown binding', () => {
    const { gl, reader } = fixture(), foreign = gl.bound;
    gl.readFBO = {}; expect(reader.submit(3, 3)).toBe(false);
    gl.readFBO = null; gl.readSource = 0; expect(reader.submit(3, 3)).toBe(false);
    gl.readSource = gl.BACK; gl.getParameter.mockReturnValueOnce(undefined); expect(reader.submit(3, 3)).toBe(false);
    expect(reader.pending).toBe(false); expect(gl.readPixels).not.toHaveBeenCalled(); expect(gl.bindBuffer).not.toHaveBeenCalled();
    expect(gl.createBuffer).not.toHaveBeenCalled(); expect(gl.bound).toBe(foreign);
  });

  it('rejects cropping, out-of-bounds, fractional, nonfinite, oversized and overflow dimensions before allocating', () => {
    const { gl, reader } = fixture();
    for (const [w, h] of [[2, 3], [3, 4], [4, 2]]) expect(reader.submit(w, h)).toBe(false);
    for (const [w, h] of [[0, 1], [1, -1], [2.5, 1], [1, NaN], [Infinity, 3], [2 ** 53, 2 ** 53], [16_385, 1], [1, 16_385], [4096, 1025]]) {
      gl.drawingBufferWidth = w; gl.drawingBufferHeight = h; expect(reader.submit(w, h)).toBe(false);
    }
    expect(gl.events).toEqual([]); expect(gl.bindBuffer).not.toHaveBeenCalled(); expect(images).toHaveLength(0);
    gl.drawingBufferWidth = 3; gl.drawingBufferHeight = 3; expect(reader.submit(3, 3)).toBe(true); reader.cancel();
  });
});

describe('Villa readback cleanup and fallback', () => {
  it.each(['fenceSync', 'clientWaitSync', 'getBufferSubData', 'pixelStorei', 'deleteBuffer'] as const)('refuses unsupported %s before queuing work', name => {
    const gl = context(); Object.defineProperty(gl, name, { value: undefined });
    const reader = transport(gl); expect(reader.submit(3, 3)).toBe(false); expect(reader.poll()).toBeNull();
    reader.cancel(); reader.dispose(); expect(gl.events).toEqual([]);
  });

  it('handles missing CPU ImageData, and a null GL buffer allocation', () => {
    const gl = context(); vi.stubGlobal('ImageData', undefined);
    expect(transport(gl).submit(3, 3)).toBe(false); expect(gl.createBuffer).not.toHaveBeenCalled();
    vi.stubGlobal('ImageData', TestImage); const reader = transport(gl);
    gl.createBuffer.mockReturnValueOnce(null); expect(reader.submit(3, 3)).toBe(false); expect(reader.pending).toBe(false);
    expect(gl.bindBuffer).not.toHaveBeenCalled(); expect(gl.readPixels).not.toHaveBeenCalled(); expect(gl.deleteBuffer).not.toHaveBeenCalled();
  });

  it.each(['store', 'pixelStorei', 'rejected pack change', 'readPixels', 'fence', 'flush'] as const)('restores pack state and releases only owned resources after failed %s', step => {
    const { gl, reader } = fixture(), pack = new Map(gl.pack), previous = gl.bound;
    const fail = () => { throw new Error(step); };
    if (step === 'store') gl.bufferData.mockImplementationOnce(() => {}); // GL OOM need not throw; BUFFER_SIZE remains zero.
    if (step === 'pixelStorei') gl.pixelStorei.mockImplementationOnce(fail);
    if (step === 'rejected pack change') gl.pixelStorei.mockImplementationOnce(() => {});
    if (step === 'readPixels') gl.readPixels.mockImplementationOnce(fail);
    if (step === 'fence') gl.fenceSync.mockReturnValueOnce(null);
    if (step === 'flush') gl.flush.mockImplementationOnce(fail);
    expect(reader.submit(3, 3)).toBe(false); expect(reader.pending).toBe(false); expect(reader.poll()).toBeNull();
    if (step === 'store' || step === 'pixelStorei' || step === 'rejected pack change') expect(gl.readPixels).not.toHaveBeenCalled();
    expect(gl.fences).toHaveLength(step === 'flush' ? 1 : 0); expect(gl.fences.every(fence => fence.deleted)).toBe(true);
    expect(gl.bound).toBe(previous); expect(gl.pack).toEqual(pack); expect(gl.getBufferSubData).not.toHaveBeenCalled();
    expect(gl.clientWaitSync).not.toHaveBeenCalled(); expect(gl.deleteBuffer.mock.calls).toEqual([[gl.buffers[0]]]);
    expect(reader.submit(3, 3)).toBe(true); reader.cancel();
  });

  it.each(['submit', 'poll'] as const)('cannot touch the renderer-owned PBO if a stale handle silently fails to bind at %s', stage => {
    const { gl, reader } = fixture(), other = gl.bound; gl.status = gl.ALREADY_SIGNALED;
    expect(reader.submit(3, 3)).toBe(true);
    if (stage === 'submit') { ready(reader); gl.drawingBufferWidth = 2; }
    gl.bindBuffer.mockImplementationOnce(() => {}); // For example, an object invalidated by context restoration.
    if (stage === 'submit') expect(reader.submit(2, 3)).toBe(false);
    else expect(reader.poll()).toBeNull();
    expect(gl.getBufferSubData).toHaveBeenCalledTimes(stage === 'submit' ? 1 : 0);
    expect(gl.bufferData).toHaveBeenCalledTimes(1); expect(gl.readPixels).toHaveBeenCalledTimes(1);
    expect(gl.bound).toBe(other); expect(other!.data.byteLength).toBe(0); expect(gl.buffers[0].deleted).toBe(true);
    expect(reader.pending).toBe(false);
  });

  it.each(['WAIT_FAILED', 'unexpected status', 'wait throws', 'download throws', 'ImageData throws'] as const)('drops rather than publishing a frame when %s', failure => {
    const { gl, reader } = fixture(); expect(reader.submit(3, 3)).toBe(true);
    const previous = new BufferHandle(); gl.bound = previous; gl.status = gl.ALREADY_SIGNALED;
    const fail = () => { throw new Error(failure); };
    if (failure === 'WAIT_FAILED') gl.status = gl.WAIT_FAILED;
    if (failure === 'unexpected status') gl.status = 0;
    if (failure === 'wait throws') gl.clientWaitSync.mockImplementationOnce(fail);
    if (failure === 'download throws') gl.getBufferSubData.mockImplementationOnce(fail);
    if (failure === 'ImageData throws') vi.stubGlobal('ImageData', class { constructor() { fail(); } });
    expect(reader.poll()).toBeNull(); expect(reader.pending).toBe(false); expect(reader.poll()).toBeNull();
    expect(gl.getBufferSubData).toHaveBeenCalledTimes(failure === 'download throws' ? 1 : 0);
    expect(gl.deleteSync.mock.calls).toEqual([[gl.fences[0]]]); expect(gl.deleteBuffer.mock.calls).toEqual([[gl.buffers[0]]]);
    expect(gl.bound).toBe(previous); reader.cancel(); reader.dispose();
    expect(gl.deleteBuffer).toHaveBeenCalledTimes(1); expect(gl.deleteSync).toHaveBeenCalledTimes(1);
  });

  it.each(['before submit', 'during flush', 'busy submit', 'before wait', 'during wait', 'during download'] as const)('drops handles after context loss %s, then accepts a fresh frame after restore', phase => {
    const { gl, reader } = fixture(), old = gl.bound, pack = new Map(gl.pack); gl.status = gl.ALREADY_SIGNALED;
    if (phase === 'before submit') gl.lost = true;
    if (phase === 'during flush') gl.flush.mockImplementationOnce(() => { gl.lost = true; });
    if (phase === 'before submit' || phase === 'during flush') expect(reader.submit(3, 3)).toBe(false);
    else {
      expect(reader.submit(3, 3)).toBe(true);
      if (phase === 'busy submit') { gl.lost = true; expect(reader.submit(3, 3)).toBe(false); }
      else if (phase === 'before wait') gl.lost = true;
      else if (phase === 'during wait') gl.clientWaitSync.mockImplementationOnce(() => { gl.lost = true; return gl.TIMEOUT_EXPIRED; });
      else gl.getBufferSubData.mockImplementationOnce(() => { gl.lost = true; });
      expect(reader.poll()).toBeNull();
    }
    expect(reader.pending).toBe(false); expect(gl.bound).toBe(old); expect(gl.pack).toEqual(pack);
    expect(gl.buffers.every(buffer => buffer.deleted)).toBe(true); expect(gl.fences.every(fence => fence.deleted)).toBe(true);
    expect(gl.clientWaitSync).toHaveBeenCalledTimes(phase === 'during wait' || phase === 'during download' ? 1 : 0);
    expect(gl.getBufferSubData).toHaveBeenCalledTimes(phase === 'during download' ? 1 : 0);
    gl.lost = false; expect(reader.submit(3, 3)).toBe(true); expect(ready(reader).data.byteLength).toBe(36); reader.dispose();
  });

  it('cancels in-flight work without waiting, starts with a new buffer, and makes disposal terminal', () => {
    const { gl, reader } = fixture(); expect(reader.submit(3, 3)).toBe(true); expect(reader.poll()).toBe('waiting');
    const previous = new BufferHandle(); gl.bound = previous;
    reader.cancel(); reader.cancel(); expect(reader.poll()).toBeNull(); expect(reader.pending).toBe(false);
    expect(gl.events.slice(-2)).toEqual(['deleteSync', 'deleteBuffer']); expect(gl.clientWaitSync).toHaveBeenCalledTimes(1);
    expect(gl.getBufferSubData).not.toHaveBeenCalled(); expect(gl.bound).toBe(previous);
    expect(reader.submit(3, 3)).toBe(true); expect(gl.buffers[1]).not.toBe(gl.buffers[0]);
    gl.status = gl.CONDITION_SATISFIED; gl.frame.fill(199); ready(reader);
    expect(reader.submit(3, 3)).toBe(true); reader.dispose();
    const calls = [...gl.events]; reader.cancel(); reader.dispose(); expect(reader.submit(3, 3)).toBe(false); expect(reader.poll()).toBeNull();
    expect(reader.pending).toBe(false); expect(gl.events).toEqual(calls); expect(gl.bound).toBe(previous);
    expect(gl.deleteBuffer).toHaveBeenCalledTimes(2); expect(gl.deleteSync).toHaveBeenCalledTimes(3);
    expect(gl.fences.every(fence => fence.deleted)).toBe(true); expect(gl.buffers.every(buffer => buffer.deleted)).toBe(true);
  });

  it('still attempts buffer deletion if the context rejects fence cleanup', () => {
    const { gl, reader } = fixture(); expect(reader.submit(3, 3)).toBe(true);
    gl.deleteSync.mockImplementationOnce(() => { throw new Error('context already gone'); });
    reader.dispose(); reader.dispose(); expect(reader.pending).toBe(false);
    expect(gl.deleteSync).toHaveBeenCalledTimes(1); expect(gl.deleteBuffer.mock.calls).toEqual([[gl.buffers[0]]]);
  });
});
