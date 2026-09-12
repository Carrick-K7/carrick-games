/*
 * Safe pull-statistics persistence for the Gacha game.
 * Storage failures must never interrupt play.
 */

import type { GachaTierId } from './gachaData.js';

export interface GachaHistoryEntry {
  itemId: string;
  tierId: GachaTierId;
  at: number; // epoch milliseconds
}

export interface GachaStats {
  totalPulls: number;
  tierCounts: Record<GachaTierId, number>;
  itemCounts: Record<string, number>;
  history: GachaHistoryEntry[];
}

export const GACHA_STATS_STORAGE_KEY = 'gacha-stats';
export const GACHA_HISTORY_LIMIT = 50;
export const GACHA_VALID_TIER_IDS: ReadonlySet<string> = new Set([
  'milspec', 'restricted', 'classified', 'covert', 'rarespecial',
]);

export function defaultGachaStats(): GachaStats {
  return {
    totalPulls: 0,
    tierCounts: { milspec: 0, restricted: 0, classified: 0, covert: 0, rarespecial: 0 },
    itemCounts: {},
    history: [],
  };
}

function normalizeCount(value: unknown): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(Number(value))) : 0;
}

function normalizeTierCounts(value: unknown): Record<GachaTierId, number> {
  const result = defaultGachaStats().tierCounts;
  if (value && typeof value === 'object') {
    for (const [key, count] of Object.entries(value as Record<string, unknown>)) {
      if (GACHA_VALID_TIER_IDS.has(key)) {
        result[key as GachaTierId] = normalizeCount(count);
      }
    }
  }
  return result;
}

function normalizeItemCounts(value: unknown): Record<string, number> {
  const result: Record<string, number> = {};
  if (value && typeof value === 'object') {
    for (const [key, count] of Object.entries(value as Record<string, unknown>)) {
      const normalized = normalizeCount(count);
      if (key && normalized > 0) result[key] = normalized;
    }
  }
  return result;
}

function normalizeHistory(value: unknown): GachaHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: GachaHistoryEntry[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const itemId = (entry as { itemId?: unknown }).itemId;
    const tierId = (entry as { tierId?: unknown }).tierId;
    const at = (entry as { at?: unknown }).at;
    if (
      typeof itemId === 'string' && itemId &&
      typeof tierId === 'string' && GACHA_VALID_TIER_IDS.has(tierId) &&
      Number.isFinite(at)
    ) {
      entries.push({ itemId, tierId: tierId as GachaTierId, at: Number(at) });
      if (entries.length >= GACHA_HISTORY_LIMIT) break;
    }
  }
  return entries;
}

export function parseGachaStats(raw: string | null): GachaStats {
  if (!raw) return defaultGachaStats();
  try {
    const value = JSON.parse(raw) as Partial<GachaStats>;
    if (!value || typeof value !== 'object') return defaultGachaStats();
    return {
      totalPulls: normalizeCount(value.totalPulls),
      tierCounts: normalizeTierCounts(value.tierCounts),
      itemCounts: normalizeItemCounts(value.itemCounts),
      history: normalizeHistory(value.history),
    };
  } catch {
    return defaultGachaStats();
  }
}

export function loadGachaStats(storage: Storage = localStorage): GachaStats {
  try {
    return parseGachaStats(storage.getItem(GACHA_STATS_STORAGE_KEY));
  } catch {
    return defaultGachaStats();
  }
}

export function writeGachaStats(stats: GachaStats, storage: Storage = localStorage): void {
  try {
    storage.setItem(GACHA_STATS_STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // Persistence must never interrupt play.
  }
}
