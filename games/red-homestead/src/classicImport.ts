import type { ClassicWorkerRequest } from './classicWorker.js';
import type { ClassicBundle, ClassicImportOptions } from './classicTypes.js';
import { validateClassicBundle } from './classicValidation.js';
export class ClassicImporter {
  private cancelCurrent: (() => void) | null = null;
  private sequence = 0;
  async import(files: File[], options: ClassicImportOptions): Promise<ClassicBundle> {
    this.cancel(); const sequence = this.sequence;
    if (!files.length || files.length > 12000 || files.reduce((sum, file) => sum + file.size, 0) > 256 * 1024 * 1024) throw new Error('source-input-budget: max 256 MiB / 12000 files');
    const inputs: ClassicWorkerRequest['files'] = [];
    for (const file of files) {
      if (sequence !== this.sequence) throw new Error('classic-import-cancelled');
      inputs.push({ name: file.webkitRelativePath || file.name, bytes: await file.arrayBuffer() });
    }
    if (sequence !== this.sequence) throw new Error('classic-import-cancelled');
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./classicWorker.ts', import.meta.url), { type: 'module' });
      const finish = () => { window.clearTimeout(timeout); worker.terminate(); if (sequence === this.sequence) this.cancelCurrent = null; };
      const timeout = window.setTimeout(() => { finish(); reject(new Error('classic-import-timeout')); }, 90000);
      this.cancelCurrent = () => { finish(); reject(new Error('classic-import-cancelled')); };
      worker.onmessage = event => {
        finish();
        try {
          if (sequence !== this.sequence) throw new Error('classic-import-cancelled');
          if (!event.data?.ok) throw new Error(event.data?.error ?? 'classic-import-failed');
          resolve(validateClassicBundle(event.data.bundle));
        } catch (error) { reject(error); }
      };
      worker.onerror = () => { finish(); reject(new Error('classic-worker-failed')); };
      try { worker.postMessage({ files: inputs, options }, inputs.map(file => file.bytes)); }
      catch (error) { finish(); reject(error); }
    });
  }
  cancel() { this.sequence++; this.cancelCurrent?.(); this.cancelCurrent = null; }
}
