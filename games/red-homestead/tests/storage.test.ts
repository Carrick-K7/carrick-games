import { describe, it, expect } from 'vitest';
import { WorldRepository, SaveConflict, checksum, parseSave, MAX_SAVE_BYTES, type SaveBackend, type SaveEnvelope } from '../src/storage.js';
class MemoryBackend implements SaveBackend {
  rows = new Map<string, SaveEnvelope>(); backups = new Map<string, SaveEnvelope>(); fail = false;
  async list() { return [...this.rows.values()].map(x => structuredClone(x)); }
  async read(id: string, backup = false) { return structuredClone((backup ? this.backups : this.rows).get(id)); }
  async commit(value: SaveEnvelope, revision: number) {
    if (this.fail) throw new Error('quota-exceeded');
    const previous = this.rows.get(value.worldId);
    if ((previous?.revision ?? 0) !== revision) throw new SaveConflict();
    if (previous) this.backups.set(value.worldId, structuredClone(previous));
    this.rows.set(value.worldId, structuredClone(value));
  }
  close() {}
}
function validate(input: unknown): { id: string; mode: string; money: number } {
  const world = input as { id: string; mode: string; money: number };
  if (!world || typeof world.id !== 'string' || !Number.isFinite(world.money) || world.money < 0) throw new Error('invalid-world');
  return structuredClone(world);
}
const home = () => ({ id: 'home-1', mode: 'homestead', money: 1000 });
describe('local homestead storage', () => {
  it('writes immutable snapshots and increases revisions in submission order', async () => {
    const backend = new MemoryBackend(), repo = new WorldRepository(backend, validate), world = home();
    const first = repo.save(world); world.money = 500;
    const second = repo.save(world); world.money = 0;
    expect((await first).revision).toBe(1); expect((await second).revision).toBe(2);
    expect((await repo.load(world.id))?.money).toBe(500);
    expect((await repo.load(world.id, true))?.money).toBe(1000);
  });
  it('does not overwrite from another tab and preserves both last good snapshots', async () => {
    const backend = new MemoryBackend(), a = new WorldRepository(backend, validate), b = new WorldRepository(backend, validate);
    await a.save(home()); const stale = (await b.load('home-1'))!;
    await a.save({ ...home(), money: 600 });
    await expect(b.save(stale)).rejects.toBeInstanceOf(SaveConflict);
    expect((await a.load('home-1'))?.money).toBe(600);
  });
  it('reading a rejected candidate or backup never rebases a stale writer', async () => {
    const backend = new MemoryBackend(), a = new WorldRepository(backend, validate), b = new WorldRepository(backend, validate);
    await a.save(home()); await b.load('home-1'); await a.save({ ...home(), money: 600 });
    const candidate = await b.snapshot('home-1'); expect(candidate?.envelope.world.money).toBe(600);
    await b.snapshot('home-1', true);
    await expect(b.save({ ...home(), money: 900 })).rejects.toBeInstanceOf(SaveConflict);
    expect((await a.load('home-1'))?.money).toBe(600);
    b.acceptSnapshot(candidate!); expect((await b.save(candidate!.envelope.world)).revision).toBe(3);
  });
  it('retains previous data and can retry after quota failure', async () => {
    const backend = new MemoryBackend(), repo = new WorldRepository(backend, validate);
    await repo.save(home()); backend.fail = true;
    await expect(repo.save({ ...home(), money: 800 })).rejects.toThrow('quota-exceeded');
    backend.fail = false;
    expect((await repo.save({ ...home(), money: 700 })).revision).toBe(2);
  });
  it('validates checksums and forks imports instead of overwriting existing worlds', async () => {
    const backend = new MemoryBackend(), repo = new WorldRepository(backend, validate);
    await repo.save(home()); const text = repo.export(home());
    expect(repo.import(text, 'home-copy')).toEqual({ ...home(), id: 'home-copy' });
    const bad = JSON.parse(text); bad.world.money = 100000;
    expect(() => repo.import(JSON.stringify(bad), 'home-copy')).toThrow('save-checksum');
    bad.checksum = checksum(JSON.stringify(bad.world)); bad.worldId = 'other';
    expect(() => parseSave(bad, validate)).toThrow('invalid-save-world');
  });
  it('refuses session persistence, unknown versions and oversized imports', async () => {
    const repo = new WorldRepository(new MemoryBackend(), validate);
    await expect(repo.save({ ...home(), mode: 'session' })).rejects.toThrow('not-a-homestead');
    const data = JSON.parse(repo.export(home())); data.version = 2;
    expect(() => repo.import(JSON.stringify(data), 'copy')).toThrow('invalid-save');
    expect(() => repo.import('x'.repeat(MAX_SAVE_BYTES + 1), 'copy')).toThrow('invalid-import');
  });
  it('normalizes a migrated envelope checksum only after validating its original body', () => {
    const body = home();
    const value = { format: 'red-homestead', version: 1, worldId: body.id, revision: 2, savedAt: 1000, checksum: checksum(JSON.stringify(body)), world: body };
    const migrate = (input: unknown) => ({ ...validate(input), schemaVersion: 2 });
    const normalized = parseSave(value, migrate);
    expect(normalized.checksum).toBe(checksum(JSON.stringify(normalized.world)));
    expect(parseSave(normalized, migrate)).toEqual(normalized);
    expect(value.world).toEqual(body);
  });
  it('lists corrupt entries without deleting them and allows backup recovery', async () => {
    const backend = new MemoryBackend(), repo = new WorldRepository(backend, validate);
    await repo.save(home()); await repo.save({ ...home(), money: 50 });
    backend.rows.get('home-1')!.checksum = 'bad';
    expect(await repo.list()).toEqual([]); expect(backend.rows.size).toBe(1);
    expect((await repo.recoveries()).map(entry => entry.worldId)).toEqual(['home-1']);
    const recovered = (await repo.load('home-1', true))!;
    expect(recovered.money).toBe(1000);
    expect((await repo.save(recovered)).revision).toBe(3);
  });
});
