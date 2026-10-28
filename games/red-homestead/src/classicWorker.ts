import { compileClassicBundle } from './classicBundle.js';
import type { ClassicBundle, ClassicImportOptions } from './classicTypes.js';
export interface ClassicWorkerRequest { files: { name: string; bytes: ArrayBuffer }[]; options: ClassicImportOptions }
const scope = globalThis as unknown as { onmessage: ((event: MessageEvent<ClassicWorkerRequest>) => void) | null; postMessage(value: unknown, transfer?: Transferable[]): void };
scope.onmessage = ({ data }) => {
  void (async () => {
    if (!Array.isArray(data.files) || data.files.length > 12000) throw new Error('source-file-count');
    const files = new Map<string, Uint8Array>(); let total = 0;
    for (const file of data.files) {
      if (typeof file.name !== 'string' || file.name.length > 512 || !(file.bytes instanceof ArrayBuffer) || files.has(file.name)) throw new Error('invalid-source-file');
      total += file.bytes.byteLength; if (total > 256 * 1024 * 1024) throw new Error('source-input-budget');
      files.set(file.name, new Uint8Array(file.bytes));
    }
    const bundle: ClassicBundle = await compileClassicBundle(files, data.options);
    const transfer = [...new Set(Object.values(bundle.images).map(image => image.rgba.buffer as ArrayBuffer))];
    scope.postMessage({ ok: true, bundle }, transfer);
  })().catch(error => scope.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) }));
};
