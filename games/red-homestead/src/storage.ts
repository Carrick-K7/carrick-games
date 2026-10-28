/** Local world data only. Source art and archives never enter portable saves. */
export const SAVE_FORMAT = 'red-homestead';
export const MAX_SAVE_BYTES = 16 * 1024 * 1024;
export interface SaveEnvelope<T = unknown> {
  format: typeof SAVE_FORMAT; version: 1; worldId: string;
  revision: number; savedAt: number; checksum: string; world: T;
}
export interface SaveBackend {
  list(): Promise<SaveEnvelope[]>;
  read(id: string, backup?: boolean): Promise<SaveEnvelope | undefined>;
  commit(value: SaveEnvelope, expectedRevision: number): Promise<void>;
  close(): void;
}
export class SaveConflict extends Error {
  constructor() { super('save-conflict'); this.name = 'SaveConflict'; }
}
export function checksum(text: string): string {
  let n = 2166136261;
  for (let i = 0; i < text.length; i++) n = Math.imul(n ^ text.charCodeAt(i), 16777619);
  return (n >>> 0).toString(16).padStart(8, '0');
}
function validId(id: unknown): id is string {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{1,96}$/.test(id);
}
export function parseSave<T extends { id: string; mode: string }>(input: unknown, validate: (world: unknown) => T): SaveEnvelope<T> {
  if (!input || typeof input !== 'object') throw new Error('invalid-save');
  const e = input as SaveEnvelope;
  if (e.format !== SAVE_FORMAT || e.version !== 1 || !validId(e.worldId)
    || !Number.isSafeInteger(e.revision) || e.revision < 1
    || !Number.isSafeInteger(e.savedAt) || e.savedAt < 0) throw new Error('invalid-save');
  const payload = JSON.stringify(e.world);
  if (typeof payload !== 'string' || payload.length > MAX_SAVE_BYTES || checksum(payload) !== e.checksum) throw new Error('save-checksum');
  const world = validate(e.world);
  if (world.id !== e.worldId || world.mode !== 'homestead') throw new Error('invalid-save-world');
  return { format: SAVE_FORMAT, version: 1, worldId: world.id, revision: e.revision, savedAt: e.savedAt, checksum: checksum(JSON.stringify(world)), world };
}
export class WorldRepository<T extends { id: string; mode: string }> {
  private revisions = new Map<string, number>();
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private backend: SaveBackend, private validate: (value: unknown) => T) {}
  async list(): Promise<SaveEnvelope<T>[]> {
    const entries = await this.backend.list();
    const valid: SaveEnvelope<T>[] = [];
    for (const value of entries) {
      try { valid.push(parseSave(value, this.validate)); } catch { /* Bad entries remain stored for recovery; never delete on read. */ }
    }
    return valid.sort((a, b) => b.savedAt - a.savedAt);
  }
  async recoveries(): Promise<SaveEnvelope<T>[]> {
    const entries = await this.backend.list();
    const backups: SaveEnvelope<T>[] = [];
    for (const entry of entries) {
      if (!validId(entry.worldId)) continue;
      const value = await this.backend.read(entry.worldId, true);
      if (!value) continue;
      try { backups.push(parseSave(value, this.validate)); } catch { /* Keep damaged data untouched. */ }
    }
    return backups.sort((a, b) => b.savedAt - a.savedAt);
  }
  async snapshot(id: string, backup = false): Promise<{ envelope: SaveEnvelope<T>; headRevision: number } | undefined> {
    if (!validId(id)) throw new Error('invalid-world-id');
    const current = await this.backend.read(id);
    const value = backup ? await this.backend.read(id, true) : current;
    if (!value) return undefined;
    const headRevision = current?.revision ?? 0;
    if (!Number.isSafeInteger(headRevision) || headRevision < 0) throw new Error('corrupt-save-head');
    return { envelope: parseSave(value, this.validate), headRevision };
  }
  acceptSnapshot(snapshot: { envelope: SaveEnvelope<T>; headRevision: number }) {
    if (!validId(snapshot.envelope.worldId) || !Number.isSafeInteger(snapshot.headRevision) || snapshot.headRevision < 0) throw new Error('invalid-save-snapshot');
    this.revisions.set(snapshot.envelope.worldId, snapshot.headRevision);
  }
  currentRevision(id: string) { return this.revisions.get(id); }
  async load(id: string, backup = false): Promise<T | undefined> {
    const snapshot = await this.snapshot(id, backup);
    if (!snapshot) return undefined;
    this.acceptSnapshot(snapshot);
    return snapshot.envelope.world;
  }
  save(world: T): Promise<SaveEnvelope<T>> {
    const copy = this.validate(structuredClone(world));
    if (!validId(copy.id) || copy.mode !== 'homestead') return Promise.reject(new Error('not-a-homestead'));
    const payload = JSON.stringify(copy);
    if (payload.length > MAX_SAVE_BYTES) return Promise.reject(new Error('save-too-large'));
    const operation = this.queue.then(async () => {
      // Unknown heads must be explicitly loaded first. Never silently overwrite another tab.
      const expected = this.revisions.get(copy.id) ?? 0;
      const value: SaveEnvelope<T> = { format: SAVE_FORMAT, version: 1, worldId: copy.id,
        revision: expected + 1, savedAt: Date.now(), checksum: checksum(payload), world: copy };
      await this.backend.commit(value, expected);
      this.revisions.set(copy.id, value.revision);
      return value;
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }
  export(world: T): string {
    const copy = this.validate(structuredClone(world));
    if (!validId(copy.id) || copy.mode !== 'homestead') throw new Error('not-a-homestead');
    const envelope: SaveEnvelope<T> = { format: SAVE_FORMAT, version: 1, worldId: copy.id,
      revision: Math.max(1, this.revisions.get(copy.id) ?? 1), savedAt: Date.now(), checksum: checksum(JSON.stringify(copy)), world: copy };
    const text = JSON.stringify(envelope);
    if (text.length > MAX_SAVE_BYTES) throw new Error('save-too-large');
    return text;
  }
  import(text: string, newId: string): T {
    if (text.length > MAX_SAVE_BYTES || !validId(newId)) throw new Error('invalid-import');
    const value = parseSave(JSON.parse(text), this.validate);
    // Always a new world; importing never destroys an existing home.
    return this.validate({ ...value.world, id: newId });
  }
  async flush() { await this.queue; }
  async close() { await this.queue; this.backend.close(); }
}
export class IndexedDbBackend implements SaveBackend {
  private connection: Promise<IDBDatabase> | null = null;
  constructor(private factory: IDBFactory = indexedDB) {}
  private db(): Promise<IDBDatabase> {
    if (!this.connection) this.connection = new Promise((resolve, reject) => {
      const request = this.factory.open('cg-red-homestead-worlds', 1);
      request.onupgradeneeded = () => {
        for (const name of ['worlds', 'backups']) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: 'worldId' });
      };
      request.onerror = () => { this.connection = null; reject(request.error ?? new Error('storage-unavailable')); };
      request.onblocked = () => { this.connection = null; reject(new Error('storage-blocked')); };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); this.connection = null; };
        resolve(db);
      };
    });
    return this.connection;
  }
  async list(): Promise<SaveEnvelope[]> {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('worlds', 'readonly');
      const request = tx.objectStore('worlds').getAll();
      tx.oncomplete = () => resolve(request.result as SaveEnvelope[]);
      tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('storage-read-failed'));
    });
  }
  async read(id: string, backup = false): Promise<SaveEnvelope | undefined> {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const name = backup ? 'backups' : 'worlds';
      const tx = db.transaction(name, 'readonly');
      const request = tx.objectStore(name).get(id);
      tx.oncomplete = () => resolve(request.result as SaveEnvelope | undefined);
      tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('storage-read-failed'));
    });
  }
  async commit(value: SaveEnvelope, expectedRevision: number): Promise<void> {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['worlds', 'backups'], 'readwrite');
      const store = tx.objectStore('worlds');
      let conflict = false;
      const request = store.get(value.worldId);
      request.onsuccess = () => {
        const previous = request.result as SaveEnvelope | undefined;
        if ((previous?.revision ?? 0) !== expectedRevision) { conflict = true; tx.abort(); return; }
        if (previous) tx.objectStore('backups').put(previous);
        store.put(value);
      };
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(conflict ? new SaveConflict() : tx.error ?? new Error('storage-write-failed'));
    });
  }
  close() {
    const connection = this.connection;
    this.connection = null;
    if (connection) void connection.then(db => db.close(), () => undefined);
  }
}
