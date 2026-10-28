import type { ClassicBundle } from './classicTypes.js';
import { validateClassicBundle, classicBytes } from './classicValidation.js';
export interface ClassicSummary { id: string; label: string; mapName: string | null; theater: string | null; buildings: number; units: number; bytes: number; warnings: string[] }
export function summarizeClassic(bundle: ClassicBundle): ClassicSummary {
  return { id: bundle.id, label: bundle.label, mapName: bundle.map?.title ?? null, theater: bundle.map?.theater ?? null,
    buildings: Object.keys(bundle.buildings).length, units: Object.keys(bundle.units).length, bytes: classicBytes(bundle), warnings: bundle.warnings };
}
function validSummary(value: unknown): value is ClassicSummary {
  if (!value || typeof value !== 'object') return false;
  const item = value as ClassicSummary;
  return typeof item.id === 'string' && /^[a-f0-9]{64}$/.test(item.id) && typeof item.label === 'string' && item.label.length <= 120
    && (item.mapName === null || typeof item.mapName === 'string' && item.mapName.length <= 120)
    && (item.theater === null || typeof item.theater === 'string' && item.theater.length <= 20)
    && [item.buildings,item.units,item.bytes].every(value => Number.isSafeInteger(value) && value >= 0)
    && item.bytes <= 96 * 1024 * 1024 && Array.isArray(item.warnings) && item.warnings.length <= 512
    && item.warnings.every(value => typeof value === 'string' && value.length <= 500);
}
/** Private local assets, separate from portable city saves and immutable published game files. */
export class ClassicStorage {
  private connection: Promise<IDBDatabase> | null = null;
  private closed = false;
  private db() {
    if (this.closed) return Promise.reject(new Error('classic-storage-closed'));
    if (!this.connection) this.connection = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('cg-red-homestead-materials', 1); let rejected = false;
      request.onupgradeneeded = () => {
        for (const name of ['bundles','catalog']) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: 'id' });
      };
      request.onblocked = () => { rejected = true; this.connection = null; reject(new Error('classic-storage-blocked')); };
      request.onerror = () => { rejected = true; this.connection = null; reject(request.error ?? new Error('classic-storage-unavailable')); };
      request.onsuccess = () => {
        const db = request.result; if (rejected || this.closed) { db.close(); reject(new Error('classic-storage-closed')); return; }
        db.onversionchange = () => { db.close(); this.connection = null; }; resolve(db);
      };
    });
    return this.connection;
  }
  async list(): Promise<ClassicSummary[]> {
    const db = await this.db(); return new Promise((resolve, reject) => {
      const tx = db.transaction('catalog', 'readonly'), request = tx.objectStore('catalog').getAll();
      tx.oncomplete = () => resolve((request.result as unknown[]).filter(validSummary)); tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('classic-storage-read'));
    });
  }
  async load(id: string): Promise<ClassicBundle | null> {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('invalid-material-id');
    const db = await this.db(); return new Promise((resolve, reject) => {
      const tx = db.transaction('bundles', 'readonly'), request = tx.objectStore('bundles').get(id);
      tx.oncomplete = () => { try { const bundle = request.result ? validateClassicBundle(request.result) : null; if (bundle && bundle.id !== id) throw new Error('classic-cache-identity'); resolve(bundle); } catch (error) { reject(error); } };
      tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('classic-storage-read'));
    });
  }
  async save(value: ClassicBundle): Promise<ClassicSummary> {
    const bundle = validateClassicBundle(value), summary = summarizeClassic(bundle), db = await this.db();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['bundles','catalog'], 'readwrite'); let failure: Error | null = null;
      const catalog = tx.objectStore('catalog'), request = catalog.getAll();
      request.onsuccess = () => {
        if (!(request.result as unknown[]).every(validSummary)) { failure = new Error('classic-catalog-corrupt: export homes before repairing site storage'); tx.abort(); return; }
        const previous = (request.result as ClassicSummary[]).filter(item => item.id !== bundle.id);
        if (previous.length >= 8 || previous.reduce((sum, item) => sum + item.bytes, summary.bytes) > 192 * 1024 * 1024) {
          failure = new Error('classic-cache-full: export homes before clearing site materials'); tx.abort(); return;
        }
        tx.objectStore('bundles').put(bundle); catalog.put(summary);
      };
      tx.oncomplete = () => resolve(summary); tx.onabort = tx.onerror = () => reject(failure ?? tx.error ?? new Error('classic-storage-write'));
    });
  }
  close() { this.closed = true; const connection = this.connection; this.connection = null; if (connection) void connection.then(db => db.close(), () => undefined); }
}
