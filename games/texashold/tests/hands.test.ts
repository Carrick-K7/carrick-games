import { describe, expect, it } from 'vitest';
import { compareHands, evaluateBestHand, explainComparison, type PokerHandValue } from '../src/texasholdHands';
import type { PokerCard } from '../src/texasholdRules';

function cards(text: string): PokerCard[] {
  return text.trim() ? text.split(/\s+/).map((card) => ({
    rank: '23456789TJQKA'.indexOf(card[0]) + 2,
    suit: 'shdc'.indexOf(card[1]),
  })) : [];
}
const hand = (text: string) => evaluateBestHand(cards(text));
const identities = (list: readonly PokerCard[]) => list.map((card) => `${card.rank}:${card.suit}`);
const ranking = ({ category, tiebreakers, label, labelZh }: PokerHandValue) => ({ category, tiebreakers, label, labelZh });

const categories = [
  { text: 'As Kh Qd 9c 7s 4h 2d', category: 0, ranks: [14, 13, 12, 9, 7], best: 'As Kh Qd 9c 7s', label: 'High Card', zh: '高牌' },
  { text: 'As Ah Kd Qc 9s 4h 2d', category: 1, ranks: [14, 13, 12, 9], best: 'As Ah Kd Qc 9s', label: 'Pair', zh: '一对' },
  { text: 'As Ah Kd Kc Qs 4h 2d', category: 2, ranks: [14, 13, 12], best: 'As Ah Kd Kc Qs', label: 'Two Pair', zh: '两对' },
  { text: 'As Ah Ad Kc Qs 4h 2d', category: 3, ranks: [14, 13, 12], best: 'As Ah Ad Kc Qs', label: 'Three of a Kind', zh: '三条' },
  { text: 'As Kh Qd Jc Ts 4h 2d', category: 4, ranks: [14], best: 'As Kh Qd Jc Ts', label: 'Straight', zh: '顺子' },
  { text: 'As Ks Qs 9s 7s 4h 2d', category: 5, ranks: [14, 13, 12, 9, 7], best: 'As Ks Qs 9s 7s', label: 'Flush', zh: '同花' },
  { text: 'As Ah Ad Kd Kc 4h 2d', category: 6, ranks: [14, 13], best: 'As Ah Ad Kd Kc', label: 'Full House', zh: '葫芦' },
  { text: 'As Ah Ad Ac Ks 4h 2d', category: 7, ranks: [14, 13], best: 'As Ah Ad Ac Ks', label: 'Four of a Kind', zh: '四条' },
  { text: 'As Ks Qs Js Ts 4h 2d', category: 8, ranks: [14], best: 'As Ks Qs Js Ts', label: 'Straight Flush', zh: '同花顺' },
];

// Frozen ranking-only reference from TexasHoldGame before extraction. Keep this
// independent of the production evaluator so later integration cannot turn the
// equivalence check into a comparison of the new evaluator with itself.
function legacyRanking(input: readonly PokerCard[]) {
  const counts = new Map<number, number>();
  for (const card of input) counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const distinct = [...new Set(input.map((card) => card.rank))].sort((a, b) => b - a);
  function straight(ranks: number[]) {
    const values = [...new Set(ranks)];
    if (values.includes(14)) values.push(1);
    values.sort((a, b) => a - b);
    let run = 1;
    let high = 0;
    for (let i = 1; i < values.length; i += 1) {
      run = values[i] === values[i - 1] + 1 ? run + 1 : 1;
      if (run >= 5) high = values[i];
    }
    return high;
  }
  const labels = [['High Card', '高牌'], ['Pair', '一对'], ['Two Pair', '两对'], ['Three of a Kind', '三条'],
    ['Straight', '顺子'], ['Flush', '同花'], ['Full House', '葫芦'], ['Four of a Kind', '四条'], ['Straight Flush', '同花顺']];
  const value = (category: number, tiebreakers: number[]) => ({ category, tiebreakers, label: labels[category][0], labelZh: labels[category][1] });
  const flushSuit = [0, 1, 2, 3].find((suit) => input.filter((card) => card.suit === suit).length >= 5);
  const flushRanks = input.filter((card) => card.suit === flushSuit).map((card) => card.rank).sort((a, b) => b - a);
  if (flushSuit !== undefined && straight(flushRanks)) return value(8, [straight(flushRanks)]);
  const four = groups.find(([, count]) => count === 4);
  if (four) return value(7, [four[0], distinct.find((rank) => rank !== four[0]) ?? 0]);
  const trips = groups.filter(([, count]) => count === 3).map(([rank]) => rank);
  const pairs = groups.filter(([, count]) => count >= 2).map(([rank]) => rank);
  if (trips.length && pairs.some((rank) => rank !== trips[0])) return value(6, [trips[0], pairs.find((rank) => rank !== trips[0]) ?? 0]);
  if (trips.length >= 2) return value(6, [trips[0], trips[1]]);
  if (flushSuit !== undefined) return value(5, flushRanks.slice(0, 5));
  if (straight(distinct)) return value(4, [straight(distinct)]);
  if (trips.length) return value(3, [trips[0], ...distinct.filter((rank) => rank !== trips[0]).slice(0, 2)]);
  const pairRanks = groups.filter(([, count]) => count === 2).map(([rank]) => rank);
  if (pairRanks.length >= 2) return value(2, [...pairRanks.slice(0, 2), distinct.find((rank) => rank !== pairRanks[0] && rank !== pairRanks[1]) ?? 0]);
  if (pairRanks.length === 1) return value(1, [pairRanks[0], ...distinct.filter((rank) => rank !== pairRanks[0]).slice(0, 3)]);
  return value(0, distinct.slice(0, 5));
}

function subsets(input: readonly PokerCard[], size = 5): PokerCard[][] {
  if (size === 0) return [[]];
  return input.flatMap((card, index) => subsets(input.slice(index + 1), size - 1).map((tail) => [card, ...tail]));
}

function* permutations(input: readonly PokerCard[]): Generator<PokerCard[]> {
  if (!input.length) { yield []; return; }
  for (let i = 0; i < input.length; i += 1) {
    for (const rest of permutations([...input.slice(0, i), ...input.slice(i + 1)])) yield [input[i], ...rest];
  }
}

function sampledHoldings(count: number, size: number): PokerCard[][] {
  let seed = 0x748ae13;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000; };
  const deck = Array.from({ length: 52 }, (_, index) => ({ rank: 2 + index % 13, suit: Math.floor(index / 13) }));
  return Array.from({ length: count }, () => {
    const shuffled = [...deck];
    for (let i = 0; i < size; i += 1) {
      const j = i + Math.floor(random() * (52 - i));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, size);
  });
}

describe('pure Hold’em hand evaluation', () => {
  it.each(categories)('selects the actual best five for $label', ({ text, category, ranks, best, label, zh }) => {
    const result = hand(text);
    expect(result).toEqual({ category, tiebreakers: ranks, label, labelZh: zh, bestFive: cards(best) });
    expect(ranking(evaluateBestHand(result.bestFive))).toEqual(ranking(result));
    expect(ranking(result)).toEqual(legacyRanking(cards(text)));
  });

  it('orders every category ahead of every lower category regardless of ranks', () => {
    const values = categories.map(({ text }) => hand(text));
    for (let high = 1; high < values.length; high += 1) {
      for (let low = 0; low < high; low += 1) {
        expect(compareHands(values[high], values[low])).toBe(high - low);
        expect(compareHands(values[low], values[high])).toBe(low - high);
      }
    }
  });

  it.each([
    ['As 2h 3d 4c 5s Kh Qd', 4, [5], '5s 4c 3d 2h As'],
    ['As 2s 3s 4s 5s Kh Qd', 8, [5], '5s 4s 3s 2s As'],
    ['As 2h 3d 4c 5s 6h Qd', 4, [6], '6h 5s 4c 3d 2h'],
    ['As 2s 3s 4s 5s 6s 7s', 8, [7], '7s 6s 5s 4s 3s'],
    ['As Ah Ad Ks Kh Kd 2c', 6, [14, 13], 'As Ah Ad Ks Kh'],
    ['2s 2h 2d As Ah Ks Kh', 6, [2, 14], '2s 2h 2d As Ah'],
    ['As Ah Ks Kh Qs Qh 2d', 2, [14, 13, 12], 'As Ah Ks Kh Qs'],
    ['As Ah Qs Qh 2s 2h Kd', 2, [14, 12, 13], 'As Ah Qs Qh Kd'],
    ['As Js 9s 8s 5s 3s 2s', 5, [14, 11, 9, 8, 5], 'As Js 9s 8s 5s'],
    ['As Ks 9s 8s 6s Qh Jd', 5, [14, 13, 9, 8, 6], 'As Ks 9s 8s 6s'],
    ['As Ah Ad Ac Ks Kh Qd', 7, [14, 13], 'As Ah Ad Ac Ks'],
    ['As Ks Qs Js 9s Th 2d', 5, [14, 13, 12, 11, 9], 'As Ks Qs Js 9s'],
  ] as const)('handles selection edge case %s', (text, category, tiebreakers, best) => {
    expect(hand(text)).toMatchObject({ category, tiebreakers: [...tiebreakers], bestFive: cards(best) });
  });

  it('does not wrap an ace through king to two, or count duplicate ranks in a straight', () => {
    expect(hand('Qs Kh As 2c 3h 7d 9s').category).toBe(0);
    expect(hand('2s 3h 3d 4c 5s Kh Qd').category).toBe(1);
    expect(hand('2s 3h 3d 4c 5s 6h Qd').tiebreakers).toEqual([6]);
  });

  it.each([
    ['', 0, [], ''], ['As', 0, [14], 'As'], ['As Kh', 0, [14, 13], 'As Kh'],
    ['Ah As', 1, [14], 'As Ah'], ['Ah As 2d', 1, [14, 2], 'As Ah 2d'],
    ['Ah As Ad', 3, [14], 'As Ah Ad'], ['Ah As Ad 2c', 3, [14, 2], 'As Ah Ad 2c'],
    ['Ah As Kh Ks', 2, [14, 13, 0], 'As Ah Ks Kh'],
    ['Ac Ad Ah As', 7, [14, 0], 'As Ah Ad Ac'],
    ['As Ks Qs Js', 0, [14, 13, 12, 11], 'As Ks Qs Js'],
    ['As 2h 3d 4c', 0, [14, 4, 3, 2], 'As 4c 3d 2h'],
  ] as const)('supports partial holding %s without inventing cards', (text, category, tiebreakers, best) => {
    expect(hand(text)).toMatchObject({ category, tiebreakers: [...tiebreakers], bestFive: cards(best) });
    expect(ranking(hand(text))).toEqual(legacyRanking(cards(text)));
  });

  it('does not mutate frozen input or its cards and returns only input card references', () => {
    const input = Object.freeze(cards('Ac Ah Ad Ks Kh Kd 2c').map((card) => Object.freeze(card)));
    const before = identities(input);
    const result = evaluateBestHand(input);
    expect(identities(input)).toEqual(before);
    expect(result.bestFive).toHaveLength(5);
    expect(new Set(result.bestFive).size).toBe(5);
    for (const card of result.bestFive) expect(input.includes(card)).toBe(true);
    result.bestFive.reverse();
    result.tiebreakers[0] = 0;
    expect(identities(input)).toEqual(before);
    expect(evaluateBestHand(input).tiebreakers).toEqual([14, 13]);
  });

  it.each([
    'As Ah Ks Kh Qs Qh 2d', 'Ac Ah Ad Ks Kh Kd 2c',
    'As 2h 3d 4c 5h 5s Qd', 'As Ah Ad Ac Kh Ks Qd',
  ])('selects identical ordered cards for all 5,040 input permutations: %s', (text) => {
    const input = cards(text);
    const expected = evaluateBestHand(input);
    for (const permutation of permutations(input)) expect(evaluateBestHand(permutation)).toEqual(expected);
  });

  it('preserves the old category, exact tiebreakers and labels on seeded legal holdings of every size', () => {
    for (let size = 0; size <= 7; size += 1) {
      for (const input of sampledHoldings(200, size)) {
        expect(ranking(evaluateBestHand(input))).toEqual(legacyRanking(input));
      }
    }
  });

  it('matches the maximum of every five-card subset for 5, 6 and 7 cards', () => {
    const inputs = [...categories.map(({ text }) => cards(text)), ...sampledHoldings(500, 7),
      ...sampledHoldings(100, 6), ...sampledHoldings(100, 5)];
    for (const input of inputs) {
      const result = evaluateBestHand(input);
      const candidates = subsets(input).map(legacyRanking);
      const best = candidates.reduce((a, b) => compareHands(a, b) >= 0 ? a : b);
      expect(ranking(result)).toEqual(best);
      expect(legacyRanking(result.bestFive)).toEqual(best);
      expect(result.bestFive).toHaveLength(5);
      expect(new Set(identities(result.bestFive)).size).toBe(5);
      expect(result.bestFive.every((card) => input.includes(card))).toBe(true);
    }
  });
});

describe('hand comparison and concise bilingual explanations', () => {
  it('explains category wins, not an unrelated ace kicker', () => {
    expect(explainComparison(hand('2s 2h 4d 7c 9s'), hand('As Kh Qd Jc 9h'))).toEqual({
      en: 'Pair beats High Card.', zh: '一对胜过高牌。',
    });
  });

  it.each([
    ['As Ah 9d 7c 3s', 'Ks Kh Qd Jc 9s', 'Higher pair', '对子点数', 'A', 'K'],
    ['As Ah Kd 7c 3s', 'Ad Ac Qh 7d 3h', 'Kicker 1', '第1张踢脚牌', 'K', 'Q'],
    ['As Ah Kd Qc 3s', 'Ad Ac Kh Jd 3h', 'Kicker 2', '第2张踢脚牌', 'Q', 'J'],
    ['As Ah Kd Qc 4s', 'Ad Ac Kh Qd 3h', 'Kicker 3', '第3张踢脚牌', '4', '3'],
    ['Ks Kh 2d 2c 3s', 'Qs Qh Jd Jc As', 'Higher top pair', '大对点数', 'K', 'Q'],
    ['As Ah Kd Kc 2s', 'Ad Ac Qh Qd Ks', 'Higher second pair', '小对点数', 'K', 'Q'],
    ['As Ah Kd Kc Qs', 'Ad Ac Kh Ks Jh', 'Kicker', '踢脚牌', 'Q', 'J'],
    ['Ks Kh Kd 2c 3s', 'Qs Qh Qd Ac Js', 'Higher trips', '三条点数', 'K', 'Q'],
    ['As Ah Ad Kc 3s', 'As Ah Ac Qd 3h', 'Kicker 1', '第1张踢脚牌', 'K', 'Q'],
    ['As Ah Ad Kc 4s', 'As Ah Ac Kd 3h', 'Kicker 2', '第2张踢脚牌', '4', '3'],
    ['2s 3h 4d 5c 6s', 'As 2h 3d 4c 5s', 'Straight high', '顺子顶张', '6', '5'],
    ['As Ks Qs 9s 7s', 'Ah Kh Jh 9h 7h', 'Flush card 3', '同花第3张', 'Q', 'J'],
    ['As Ks Qs 9s 7s', 'Ah Kh Qh 9h 6h', 'Flush card 5', '同花第5张', '7', '6'],
    ['Ks Kh Kd 2c 2s', 'Qs Qh Qd Ac As', 'Full house trips', '葫芦的三条', 'K', 'Q'],
    ['As Ah Ad Kc Ks', 'As Ah Ac Qd Qh', 'Full house pair', '葫芦的对子', 'K', 'Q'],
    ['Ks Kh Kd Kc 2s', 'Qs Qh Qd Qc As', 'Higher four of a kind', '四条点数', 'K', 'Q'],
    ['As Ah Ad Ac Ks', 'As Ah Ad Ac Qh', 'Kicker', '踢脚牌', 'K', 'Q'],
    ['2s 3s 4s 5s 6s', 'Ah 2h 3h 4h 5h', 'Straight flush high', '同花顺顶张', '6', '5'],
    ['As Kh Qd 9c 7s', 'Ah Qh Jd 9s 7h', 'High card 2', '高牌第2张', 'K', 'Q'],
    ['As Kh Qd 9c 7s', 'Ah Ks Qh 9s 6h', 'High card 5', '高牌第5张', '7', '6'],
  ])('explains the decisive rank precisely: %s vs %s', (winner, runnerUp, en, zh, left, right) => {
    const a = hand(winner);
    const b = hand(runnerUp);
    expect(compareHands(a, b)).toBeGreaterThan(0);
    expect(compareHands(b, a)).toBe(-compareHands(a, b));
    const explanation = explainComparison(a, b);
    expect(explanation).toEqual({ en: `${en}: ${left} beats ${right}.`, zh: `${zh}：${left}胜过${right}。` });
    expect(explanation.en.length).toBeLessThan(75);
    expect(explanation.zh.length).toBeLessThan(35);
    expect(explainComparison(b, a)).toEqual(explanation);
  });

  it('compares all flush ranks rather than hole cards or suits', () => {
    expect(compareHands(hand('As Ks Qs 9s 7s 4s 2s'), hand('Ah Kh Qh 9h 7h 6h 3h'))).toBe(0);
    expect(compareHands(hand('As Ks Qs 9s 8s'), hand('Ah Kh Qh 9h 7h'))).toBe(1);
  });

  it('ties when the five-card board plays, ignoring unused private cards', () => {
    const board = cards('As Kh Qd Jc Ts');
    const a = evaluateBestHand([...board, ...cards('9s 9h')]);
    const b = evaluateBestHand([...board, ...cards('2d 3c')]);
    expect(a.bestFive).toEqual(board);
    expect(b.bestFive).toEqual(board);
    expect(compareHands(a, b)).toBe(0);
    expect(explainComparison(a, b)).toEqual({ en: 'Tie: equal hand ranks. Suits do not break ties.', zh: '平手：牌力相同，花色不分大小。' });
  });

  it.each(categories)('ignores suit differences for equal $label ranks', ({ best }) => {
    const input = cards(best);
    const a = evaluateBestHand(input);
    const b = evaluateBestHand(input.map((card) => ({ rank: card.rank, suit: (card.suit + 1) % 4 })));
    expect(compareHands(a, b)).toBe(0);
    expect(explainComparison(a, b).en).toMatch(/^Tie:/);
    expect(explainComparison(a, b).zh).toContain('花色不分大小');
  });

  it('retains numeric-difference comparison and missing-rank zero behavior for partial holdings', () => {
    expect(compareHands(hand('As Ah'), hand('Ks Kh'))).toBe(1);
    expect(compareHands(hand('As Ah 2d'), hand('As Ah'))).toBe(2);
    expect(compareHands(hand(''), hand(''))).toBe(0);
    expect(explainComparison(hand('As Ah 2d'), hand('As Ah'))).toEqual({ en: 'Kicker 1: 2 beats —.', zh: '第1张踢脚牌：2胜过—。' });
  });
});
