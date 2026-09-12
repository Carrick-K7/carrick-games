import { describe, expect, it } from 'vitest';
import {
  GACHA_POOL,
  GACHA_TIERS,
  gachaOddsAreValid,
  rollGachaItem,
} from '../src/gachaData';
import { GACHA_HISTORY_LIMIT, parseGachaStats } from '../src/gachaStorage';

if (!process.env.GAME_ID || process.env.GAME_ID === 'gacha') {
  describe('safe persistence', () => {
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

    it('keeps the pool sizes at 蓝5/紫4/粉3/红2/金2 with the weapon families', () => {
      expect(GACHA_POOL.milspec).toHaveLength(5);
      expect(GACHA_POOL.restricted).toHaveLength(4);
      expect(GACHA_POOL.classified).toHaveLength(3);
      expect(GACHA_POOL.covert).toHaveLength(2);
      expect(GACHA_POOL.rarespecial).toHaveLength(2);
      // Iconic weapons per grade: gold = knives, red = snipers, pink = rifles,
      // purple = SMGs, blue = pistols.
      expect(GACHA_POOL.rarespecial.every((i) => i.kind === 'knife')).toBe(true);
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
      expect(gold.item.id).toBe('knife-karambit');
      expect(blue.item.id).toBe('glock18');
    });

    it('distributes items inside a tier by weight (gold 50/50)', () => {
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
        if (roll.item.id === 'knife-butterfly') first++;
        else if (roll.item.id === 'knife-karambit') last++;
      }
      // Weights 0.5/0.5 over the item interval: ~500/500.
      expect(first).toBeGreaterThan(440);
      expect(last).toBeGreaterThan(440);
      expect(first).toBeLessThan(560);
      expect(last).toBeLessThan(560);
    });
  });
}
