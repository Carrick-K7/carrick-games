import { describe, expect, it } from 'vitest';
import { clampFrameDelta, shellSnapshotKey } from '../../src/core/game';
import { getStoredRecord, readStoredRecords, saveStoredRecord } from '../../src/core/storage';
import { GAMES } from '../../src/games/catalog';
import {
  GACHA_POOL,
  GACHA_TIERS,
  gachaOddsAreValid,
  rollGachaItem,
} from '../../src/games/gachaData';
import { GACHA_HISTORY_LIMIT, defaultGachaStats, parseGachaStats } from '../../src/games/gachaStorage';
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

  it('normalizes malformed Gacha stats saves', () => {
    const fallback = parseGachaStats('{bad');
    expect(fallback.totalPulls).toBe(0);
    expect(fallback.tierCounts.milspec).toBe(0);
    expect(fallback.history).toEqual([]);

    const normalized = parseGachaStats(JSON.stringify({
      totalPulls: -4,
      tierCounts: { milspec: 3, rarespecial: 2, unknown: 9 },
      itemCounts: { knife: 1, bad: -2 },
      history: [
        { itemId: 'knife', tierId: 'rarespecial', at: 1 },
        { itemId: '', tierId: 'rarespecial', at: 2 },
        { itemId: 'ghost', tierId: 'not-a-tier', at: 3 },
        'not-an-object',
      ],
    }));
    expect(normalized.totalPulls).toBe(0);
    expect(normalized.tierCounts.milspec).toBe(3);
    expect(normalized.tierCounts.rarespecial).toBe(2);
    expect(normalized.tierCounts).not.toHaveProperty('unknown');
    expect(normalized.itemCounts).toEqual({ knife: 1 });
    expect(normalized.history).toHaveLength(1);
  });

  it('caps Gacha history at the configured limit', () => {
    const raw = JSON.stringify({
      totalPulls: 200,
      tierCounts: { milspec: 200 },
      itemCounts: {},
      history: Array.from({ length: 200 }, (_, i) =>
        ({ itemId: `item-${i}`, tierId: 'milspec', at: i })),
    });
    const parsed = parseGachaStats(raw);
    expect(parsed.history).toHaveLength(GACHA_HISTORY_LIMIT);
  });
});

describe('Gacha odds and pool', () => {
  it('defines the five CS:GO tiers with odds summing to exactly 1', () => {
    expect(GACHA_TIERS).toHaveLength(5);
    expect(gachaOddsAreValid()).toBe(true);
    expect(GACHA_TIERS.map((t) => t.odds).join(',')).toBe('0.7992,0.1598,0.032,0.0064,0.0026');
  });

  it('gives every tier at least one prize with a unique id', () => {
    const ids = new Set<string>();
    for (const tier of GACHA_TIERS) {
      expect(GACHA_POOL[tier.id].length).toBeGreaterThan(0);
      for (const item of GACHA_POOL[tier.id]) {
        expect(ids.has(item.id)).toBe(false);
        ids.add(item.id);
        expect(item.weight).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the pool sizes at 蓝15/紫8/粉5/红3/金2 with the weapon families', () => {
    expect(GACHA_POOL.milspec).toHaveLength(15);
    expect(GACHA_POOL.restricted).toHaveLength(8);
    expect(GACHA_POOL.classified).toHaveLength(5);
    expect(GACHA_POOL.covert).toHaveLength(3);
    expect(GACHA_POOL.rarespecial).toHaveLength(2);
    // Weapon families per grade: gold = knife/gloves, red = snipers,
    // pink = rifles, purple = SMGs, blue = pistols.
    expect(new Set(GACHA_POOL.rarespecial.map((i) => i.kind))).toEqual(new Set(['knife', 'gloves']));
    expect(GACHA_POOL.covert.every((i) => i.kind === 'sniper')).toBe(true);
    expect(GACHA_POOL.classified.every((i) => i.kind === 'rifle')).toBe(true);
    expect(GACHA_POOL.restricted.every((i) => i.kind === 'smg')).toBe(true);
    expect(GACHA_POOL.milspec.every((i) => i.kind === 'pistol')).toBe(true);
  });

  it('rolls gold at the top of the odds interval and blue at the bottom', () => {
    const gold = rollGachaItem(() => 0.99999);
    expect(gold.tier.id).toBe('rarespecial');
    const blue = rollGachaItem(() => 0.00001);
    expect(blue.tier.id).toBe('milspec');
    // The same constant rng also picks the item: near-1 → last of the tier,
    // near-0 → first of the tier (uniform inside the tier, weight 1).
    expect(gold.item.id).toBe('gloves-vice');
    expect(blue.item.id).toBe('glock-fade');
  });

  it('distributes items inside a tier by weight (gold 60/40)', () => {
    let first = 0;
    let last = 0;
    for (let step = 1; step <= 1000; step++) {
      // Two-phase rng: tier always at the top of the interval (gold),
      // item sweeps the whole [0,1) interval.
      const itemPos = step / 1001;
      let phase = 0;
      const twoPhase = () => {
        phase++;
        return phase === 1 ? 0.99999 : itemPos;
      };
      const roll = rollGachaItem(twoPhase);
      expect(roll.tier.id).toBe('rarespecial');
      if (roll.item.id === 'karambit-fade') first++;
      else if (roll.item.id === 'gloves-vice') last++;
    }
    // Weights 0.6/0.4 over the item interval: ~600/400.
    expect(first).toBeGreaterThan(520);
    expect(last).toBeGreaterThan(320);
    expect(first).toBeLessThan(680);
    expect(last).toBeLessThan(480);
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
