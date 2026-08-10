import { describe, expect, it } from 'vitest';
import { clampFrameDelta, shellSnapshotKey } from '../../src/core/game';
import { getStoredRecord, readStoredRecords, saveStoredRecord } from '../../src/core/storage';
import { GAMES } from '../../src/games/catalog';
import { parseLuckyCaseSave } from '../../src/games/luckycaseStorage';
import { canPlaceOnFoundation, canPlaceOnTableau } from '../../src/games/solitaireRules';
import { evaluatePreflopStrength, hasFlushDraw, hasStraightDraw } from '../../src/games/texasholdRules';

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
    expect(GAMES.every((game) => game.group && game.icon && game.loader)).toBe(true);
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

  it('normalizes malformed Lucky Case saves', () => {
    expect(parseLuckyCaseSave('{bad').coins).toBe(5000);
    expect(parseLuckyCaseSave(JSON.stringify({ coins: 20, collection: [], totalOpens: 2, totalValue: 5 })))
      .toEqual({ coins: 20, collection: [], totalOpens: 2, totalValue: 5 });
  });
});

describe('extracted game rules', () => {
  it('scores strong poker openings and detects draws', () => {
    expect(evaluatePreflopStrength([{ suit: 0, rank: 14 }, { suit: 0, rank: 14 }])).toBe(100);
    expect(hasFlushDraw([0, 1, 2, 3].map((rank) => ({ suit: 2, rank })))).toBe(true);
    expect(hasStraightDraw([2, 3, 4, 5].map((rank) => ({ suit: 0, rank })))).toBe(true);
  });

  it('enforces Solitaire tableau and foundation rules', () => {
    const redQueen = { suit: 0, rank: 11, faceUp: true };
    const blackKing = { suit: 2, rank: 12, faceUp: true };
    expect(canPlaceOnTableau(redQueen, [blackKing])).toBe(true);
    expect(canPlaceOnFoundation({ suit: 1, rank: 0, faceUp: true }, [])).toBe(true);
  });
});
