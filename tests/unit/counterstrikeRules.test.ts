import { describe, expect, it } from 'vitest';
import {
  BUY_CATEGORIES,
  ECONOMY,
  ROUND,
  WEAPONS,
  applyDamage,
  buyItemsForTeam,
  clampMoney,
  computeDamage,
  lossMoney,
  matchScore,
  matchWinner,
  rollHitZone,
} from '../../src/games/counterstrikeRules';

describe('Counter-Strike 1.6 rules (fy_iceworld port)', () => {
  it('keeps the classic armored damage identities', () => {
    const armored = { armor: 100, helmet: true };
    const unarmored = { armor: 0, helmet: false };

    // AK-47 one-shot headshot through helmet, M4A1 needs two.
    expect(computeDamage(WEAPONS.ak47, 'head', armored, 0).dmg).toBeGreaterThanOrEqual(100);
    expect(computeDamage(WEAPONS.m4a1, 'head', armored, 0).dmg).toBeLessThan(100);
    expect(computeDamage(WEAPONS.m4a1, 'head', armored, 0).dmg).toBe(86);

    // AWP kills with one body shot through kevlar but not with a leg shot.
    expect(computeDamage(WEAPONS.awp, 'chest', armored, 0).dmg).toBeGreaterThanOrEqual(100);
    expect(computeDamage(WEAPONS.awp, 'legs', armored, 0).dmg).toBe(85);
    expect(computeDamage(WEAPONS.awp, 'legs', armored, 0).dmg).toBeLessThan(100);

    // Deagle one-shots a helmeted head.
    expect(computeDamage(WEAPONS.deagle, 'head', armored, 0).dmg).toBeGreaterThanOrEqual(100);

    // Without a helmet, headshots use the full unarmored damage table.
    expect(computeDamage(WEAPONS.ak47, 'head', { armor: 100, helmet: false }, 0).dmg).toBe(140);

    // Armor absorbs part of the hit and depletes.
    const hit = computeDamage(WEAPONS.ak47, 'chest', armored, 0);
    expect(hit.armorDmg).toBeGreaterThan(0);
    const applied = applyDamage(100, 100, hit);
    expect(applied.hp).toBeLessThan(100);
    expect(applied.armor).toBeLessThan(100);
    expect(applied.dead).toBe(false);
  });

  it('follows loss-streak economy and clamps money', () => {
    expect(ECONOMY.startMoney).toBe(800);
    expect(lossMoney(1)).toBe(1400);
    expect(lossMoney(2)).toBe(1900);
    expect(lossMoney(3)).toBe(2400);
    expect(lossMoney(5)).toBe(ECONOMY.lossMax);
    expect(lossMoney(9)).toBe(ECONOMY.lossMax);
    expect(clampMoney(99999)).toBe(ECONOMY.maxMoney);
    expect(clampMoney(-5)).toBe(0);
  });

  it('applies the CS 1.6 kill rewards per weapon', () => {
    expect(WEAPONS.awp.killReward).toBe(100);
    expect(WEAPONS.knife.killReward).toBe(1500);
    expect(WEAPONS.ak47.killReward).toBe(300);
    expect(WEAPONS.glock.killReward).toBe(300);
  });

  it('mirrors the team-relative buy menu numbering', () => {
    const ctHandguns = buyItemsForTeam(BUY_CATEGORIES[0], 'CT');
    const tHandguns = buyItemsForTeam(BUY_CATEGORIES[0], 'T');
    expect(ctHandguns.map((i) => i.weaponId)).toEqual(['usp', 'p228', 'deagle', 'fiveseven']);
    expect(tHandguns.map((i) => i.weaponId)).toEqual(['glock', 'p228', 'deagle', 'elite']);

    const ctRifles = buyItemsForTeam(BUY_CATEGORIES[3], 'CT');
    const tRifles = buyItemsForTeam(BUY_CATEGORIES[3], 'T');
    expect(ctRifles).toHaveLength(6);
    expect(ctRifles.map((i) => i.weaponId)).toContain('m4a1');
    expect(ctRifles.map((i) => i.weaponId)).not.toContain('ak47');
    expect(tRifles.map((i) => i.weaponId)).toContain('ak47');
    expect(tRifles.map((i) => i.weaponId)).not.toContain('m4a1');

    // Classic prices.
    expect(WEAPONS.ak47.price).toBe(2500);
    expect(WEAPONS.m4a1.price).toBe(3100);
    expect(WEAPONS.awp.price).toBe(4750);
    expect(WEAPONS.deagle.price).toBe(650);
  });

  it('keeps the CS 1.6 movement speed ladder', () => {
    expect(WEAPONS.scout.speedUnits).toBeGreaterThan(WEAPONS.knife.speedUnits);
    expect(WEAPONS.knife.speedUnits).toBe(250);
    expect(WEAPONS.ak47.speedUnits).toBe(221);
    expect(WEAPONS.awp.speedUnits).toBe(210);
    for (const id of ['mp5', 'usp', 'deagle', 'glock'] as const) {
      expect(WEAPONS[id].speedUnits).toBe(250);
    }
  });

  it('scores headshots higher and settles matches at first to three', () => {
    const zones = new Set<string>();
    for (let i = 0; i < 300; i++) zones.add(rollHitZone(false, true));
    expect(zones.size).toBeGreaterThanOrEqual(2);

    expect(matchWinner({ ctWins: ROUND.winScore, tWins: 0 })).toBe('CT');
    expect(matchWinner({ ctWins: 2, tWins: ROUND.winScore })).toBe('T');
    expect(matchWinner({ ctWins: 2, tWins: 2 })).toBeNull();
    expect(matchScore(10, 3, true)).toBe(10 * 150 + 3 * 500 + 1000);
  });
});
