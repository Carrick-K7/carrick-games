const RECORDS_KEY = 'cg-records';

export function readStoredRecords(storage: Storage = localStorage): Record<string, number> {
  try {
    const raw = storage.getItem(RECORDS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const records: Record<string, number> = {};
    for (const [gameId, score] of Object.entries(parsed)) {
      if (typeof score === 'number' && Number.isFinite(score)) records[gameId] = score;
    }
    return records;
  } catch {
    return {};
  }
}

export function getStoredRecord(gameId: string, storage: Storage = localStorage): number | null {
  return readStoredRecords(storage)[gameId] ?? null;
}

export function saveStoredRecord(
  gameId: string,
  score: number,
  storage: Storage = localStorage,
): boolean {
  if (!Number.isFinite(score)) return false;
  const records = readStoredRecords(storage);
  if (records[gameId] != null && records[gameId] >= score) return false;
  records[gameId] = score;
  try {
    storage.setItem(RECORDS_KEY, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}
