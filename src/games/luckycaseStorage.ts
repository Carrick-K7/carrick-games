export interface LuckyCaseCollectionEntry {
  id: string;
  count: number;
}

export interface LuckyCaseSaveData {
  coins: number;
  collection: LuckyCaseCollectionEntry[];
  totalOpens: number;
  totalValue: number;
}

export const LUCKY_CASE_STORAGE_KEY = 'luckycase';
export const LUCKY_CASE_STARTING_COINS = 5000;

export function defaultLuckyCaseSave(): LuckyCaseSaveData {
  return { coins: LUCKY_CASE_STARTING_COINS, collection: [], totalOpens: 0, totalValue: 0 };
}

export function parseLuckyCaseSave(raw: string | null): LuckyCaseSaveData {
  if (!raw) return defaultLuckyCaseSave();
  try {
    const value = JSON.parse(raw) as Partial<LuckyCaseSaveData>;
    if (!Number.isFinite(value.coins) || !Array.isArray(value.collection)) return defaultLuckyCaseSave();
    return {
      coins: Math.max(0, Number(value.coins)),
      collection: value.collection.filter((entry): entry is LuckyCaseCollectionEntry =>
        !!entry && typeof entry.id === 'string' && Number.isFinite(entry.count) && entry.count > 0),
      totalOpens: Number.isFinite(value.totalOpens) ? Math.max(0, Number(value.totalOpens)) : 0,
      totalValue: Number.isFinite(value.totalValue) ? Math.max(0, Number(value.totalValue)) : 0,
    };
  } catch {
    return defaultLuckyCaseSave();
  }
}

export function loadLuckyCaseSave(storage: Storage = localStorage): LuckyCaseSaveData {
  try {
    return parseLuckyCaseSave(storage.getItem(LUCKY_CASE_STORAGE_KEY));
  } catch {
    return defaultLuckyCaseSave();
  }
}

export function writeLuckyCaseSave(save: LuckyCaseSaveData, storage: Storage = localStorage) {
  try {
    storage.setItem(LUCKY_CASE_STORAGE_KEY, JSON.stringify(save));
  } catch {
    // Progress persistence must never interrupt play.
  }
}
