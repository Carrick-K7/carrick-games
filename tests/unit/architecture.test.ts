import { describe, expect, it } from 'vitest';
import { clampFrameDelta, shellSnapshotKey } from '@carrick/game-sdk/game';
import { getStoredRecord, readStoredRecords, saveStoredRecord } from '@carrick/game-sdk/storage';
import { GAMES } from '../support/catalog.ts';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe('core architecture', () => {
  it('clamps invalid and background-tab frame deltas', () => {
    expect(clampFrameDelta(-1)).toBe(0);
    expect(clampFrameDelta(Number.NaN)).toBe(0);
    expect(clampFrameDelta(0.02)).toBe(0.02);
    expect(clampFrameDelta(3)).toBe(0.05);
  });

  it('ignores high-frequency telemetry in discrete shell snapshot keys', () => {
    const base = {
      totalLevels: 10, currentLevel: 1, bestLevel: 2, unlockedLevel: 3,
      selectedLevel: 1, speed: 10, maxSpeed: 50, gear: 'D', gameState: 'playing',
    };
    expect(shellSnapshotKey({ levelSelect: base })).toBe(
      shellSnapshotKey({ levelSelect: { ...base, speed: 49, gear: 'R' } }),
    );
  });

  it('keeps the registry unique, grouped, and fully ordered', () => {
    expect(new Set(GAMES.map((game) => game.id)).size).toBe(GAMES.length);
    expect(new Set(GAMES.map((game) => game.order)).size).toBe(GAMES.length);
    expect(GAMES.every((game) => game.group && game.icon)).toBe(true);
    expect(GAMES.every((game) => !('loader' in game))).toBe(true);
  });
});

describe('safe persistence', () => {
  it('recovers from malformed records and only saves higher scores', () => {
    const storage = new MemoryStorage();
    storage.setItem('cg-records', '{bad');
    expect(readStoredRecords(storage)).toEqual({});
    expect(saveStoredRecord('snake', 10, storage)).toBe(true);
    expect(saveStoredRecord('snake', 5, storage)).toBe(false);
    expect(getStoredRecord('snake', storage)).toBe(10);
  });
});
