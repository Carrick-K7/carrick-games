import { describe, expect, it } from 'vitest';
import { gachaProgress } from '../src/gachaProgress';
import { GACHA_POOL as tiers } from '../src/gachaData';
const GACHA_POOL = Object.values(tiers).flat();
import { defaultGachaStats } from '../src/gachaStorage';

describe('gacha persistent progress', () => {
  it('starts empty and ignores unknown or non-owned entries', () => {
    const stats = defaultGachaStats();
    stats.itemCounts.unknown = 10;
    stats.itemCounts[GACHA_POOL[0].id] = 0;
    expect(gachaProgress(stats)).toEqual({ pulls: 0, collected: 0, total: GACHA_POOL.length, percent: 0 });
  });
  it('counts duplicates as pulls but never as new collection entries', () => {
    const stats = defaultGachaStats();
    stats.totalPulls = 1248;
    stats.itemCounts[GACHA_POOL[0].id] = 1248;
    expect(gachaProgress(stats)).toEqual({ pulls: 1248, collected: 1, total: GACHA_POOL.length, percent: Math.floor(1000 / GACHA_POOL.length) / 10 });
  });
  it('shows 100 percent only when the collection is complete; reset clears both', () => {
    const stats = defaultGachaStats();
    for (const item of GACHA_POOL) stats.itemCounts[item.id] = 1;
    expect(gachaProgress(stats).percent).toBe(100);
    delete stats.itemCounts[GACHA_POOL[0].id];
    expect(gachaProgress(stats).percent).toBeLessThan(100);
    expect(gachaProgress(defaultGachaStats()).percent).toBe(0);
  });
});
