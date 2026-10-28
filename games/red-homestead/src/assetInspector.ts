import type { AssetRequest, AssetPreview } from './assetWorker.js';
/** One bounded Worker per request; cancellation and a hard timeout keep bad imports off the UI thread. */
export class AssetInspector {
  private active = new Map<Worker, (error: Error) => void>();
  decode(request: AssetRequest): Promise<AssetPreview> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./assetWorker.ts', import.meta.url), { type: 'module' });
      const finish = () => { window.clearTimeout(timeout); this.active.delete(worker); worker.terminate(); };
      const cancel = (error: Error) => { finish(); reject(error); };
      const timeout = window.setTimeout(() => cancel(new Error('decode-timeout')), 15000);
      this.active.set(worker, cancel);
      worker.onmessage = event => {
        finish(); const data = event.data as { ok: boolean; preview?: AssetPreview; error?: string };
        if (data.ok && data.preview) resolve(data.preview); else reject(new Error(data.error ?? 'decode-failed'));
      };
      worker.onerror = () => cancel(new Error('decoder-worker-failed'));
      try { worker.postMessage(request, [request.bytes, ...(request.palette ? [request.palette] : []), ...(request.animation ? [request.animation] : [])]); }
      catch (error) { cancel(error instanceof Error ? error : new Error('decode-failed')); }
    });
  }
  cancel() { for (const reject of [...this.active.values()]) reject(new Error('decode-cancelled')); }
}
