import { describe, expect, it } from 'vitest';
import {
  ECONOMY,
  ROUND,
  WEAPONS,
  applyDamage,
  computeDamage,
  evaluateRound,
  lossMoney,
  matchScore,
  matchWinner,
} from '../../src/games/icebergRules';

describe('Iceberg CS rules', () => {
  it('models armor, helmets, and headshot damage', () => {
    const m4 = WEAPONS.m4a1;
    const body = computeDamage(m4, 'body', 4, 100, false);
    const head = computeDamage(m4, 'head', 4, 100, true);
    const legs = computeDamage(m4, 'legs', 4, 0, false);

    expect(body.armorDmg).toBeGreaterThan(0);
    expect(body.dmg).toBeLessThan(m4.dmg);
    expect(head.dmg).toBeGreaterThan(m4.dmg * 2);
    expect(legs.dmg).toBeLessThan(m4.dmg);

    const applied = applyDamage(100, 100, body.dmg, body.armorDmg);
    expect(applied.armor).toBeLessThan(100);
    expect(applied.hp).toBeLessThan(100);
    expect(applied.dead).toBe(false);
  });

  it('follows loss-streak economy and clamps money', () => {
    expect(lossMoney(0)).toBe(ECONOMY.lossBase);
    expect(lossMoney(4)).toBe(ECONOMY.lossMax);
    expect(lossMoney(9)).toBe(ECONOMY.lossMax);
  });

  it('resolves objective round endings correctly', () => {
    expect(evaluateRound({
      ctAlive: 1,
      tAlive: 4,
      bombPlanted: false,
      bombExploded: false,
      bombDefused: false,
      timeLeft: 0,
    })).toEqual({ winner: 'CT', reason: 'timeout' });
    expect(evaluateRound({
      ctAlive: 1,
      tAlive: 4,
      bombPlanted: true,
      bombExploded: false,
      bombDefused: true,
      timeLeft: 0,
    })).toEqual({ winner: 'CT', reason: 'defuse' });
    expect(evaluateRound({
      ctAlive: 0,
      tAlive: 2,
      bombPlanted: true,
      bombExploded: false,
      bombDefused: false,
      timeLeft: 20,
    })).toEqual({ winner: 'T', reason: 'hunted' });
    expect(evaluateRound({
      ctAlive: 1,
      tAlive: 2,
      bombPlanted: true,
      bombExploded: true,
      bombDefused: false,
      timeLeft: 0,
    })).toEqual({ winner: 'T', reason: 'explosion' });
  });

  it('keeps regulation match winner and score helpers deterministic', () => {
    expect(matchWinner({ ctWins: ROUND.winScore, tWins: 10, round: 22 })).toBe('CT');
    expect(matchWinner({ ctWins: 12, tWins: ROUND.winScore, round: 24 })).toBe('T');
    expect(matchWinner({ ctWins: 12, tWins: 12, round: 25 })).toBeNull();
    expect(matchScore(10, 8, true)).toBe(10 * 150 + 8 * 200 + 1500);
  });
});
