import type { PokerCard } from './texasholdRules.js';

export interface PokerHandValue {
  category: number;
  tiebreakers: number[];
  label: string;
  labelZh: string;
  bestFive: PokerCard[];
}

const LABELS = [
  ['High Card', '高牌'], ['Pair', '一对'], ['Two Pair', '两对'],
  ['Three of a Kind', '三条'], ['Straight', '顺子'], ['Flush', '同花'],
  ['Full House', '葫芦'], ['Four of a Kind', '四条'], ['Straight Flush', '同花顺'],
] as const;

type ComparableHand = Pick<PokerHandValue, 'category' | 'tiebreakers'>;

/** Positive means a wins; suits and selected-card identities never break ties. */
export function compareHands(a: ComparableHand, b: ComparableHand): number {
  if (a.category !== b.category) return a.category - b.category;
  for (let i = 0; i < Math.max(a.tiebreakers.length, b.tiebreakers.length); i += 1) {
    const difference = (a.tiebreakers[i] ?? 0) - (b.tiebreakers[i] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function straightHigh(ranks: readonly number[]): number {
  const values = new Set(ranks);
  if (values.has(14)) values.add(1);
  for (let high = 14; high >= 5; high -= 1) {
    if ([0, 1, 2, 3, 4].every((offset) => values.has(high - offset))) return high;
  }
  return 0;
}

/**
 * For a legal, distinct 0–7 card Hold'em holding (ranks 2–14, suits 0–3).
 * Does not mutate its input. Partial holdings retain the old evaluator's ranking
 * and zero placeholders; bestFive contains only cards actually present.
 * Cards are returned in comparison order, with the ace last for a wheel.
 * Ascending numeric suit selects equivalent cards for display, not hand strength.
 */
export function evaluateBestHand(cards: readonly PokerCard[]): PokerHandValue {
  const sorted = [...cards].sort((a, b) => b.rank - a.rank || a.suit - b.suit);
  const byRank = new Map<number, PokerCard[]>();
  for (const card of sorted) {
    const group = byRank.get(card.rank) ?? [];
    group.push(card);
    byRank.set(card.rank, group);
  }
  const ranks = [...byRank.keys()];
  const groups = [...byRank.entries()].sort((a, b) => b[1].length - a[1].length || b[0] - a[0]);
  const flush = [0, 1, 2, 3].map((suit) => sorted.filter((card) => card.suit === suit))
    .find((suited) => suited.length >= 5);
  const take = (rank: number, count: number) => (byRank.get(rank) ?? []).slice(0, count);
  const singles = (values: number[]) => values.flatMap((rank) => take(rank, 1));
  const straightCards = (high: number, pool: readonly PokerCard[]) =>
    [0, 1, 2, 3, 4].map((offset) => pool.find((card) => card.rank === (high - offset === 1 ? 14 : high - offset))!);
  const value = (category: number, tiebreakers: number[], bestFive: PokerCard[]): PokerHandValue => ({
    category, tiebreakers, label: LABELS[category][0], labelZh: LABELS[category][1], bestFive,
  });

  if (flush) {
    const high = straightHigh(flush.map((card) => card.rank));
    if (high) return value(8, [high], straightCards(high, flush));
  }

  const four = groups.find(([, group]) => group.length === 4)?.[0];
  if (four !== undefined) {
    const kicker = ranks.find((rank) => rank !== four) ?? 0;
    return value(7, [four, kicker], [...take(four, 4), ...take(kicker, 1)]);
  }

  const trips = groups.filter(([, group]) => group.length === 3).map(([rank]) => rank);
  const pairs = ranks.filter((rank) => byRank.get(rank)!.length >= 2);
  if (trips.length) {
    const pair = pairs.find((rank) => rank !== trips[0]);
    if (pair !== undefined) return value(6, [trips[0], pair], [...take(trips[0], 3), ...take(pair, 2)]);
  }

  if (flush) return value(5, flush.slice(0, 5).map((card) => card.rank), flush.slice(0, 5));

  const high = straightHigh(ranks);
  if (high) return value(4, [high], straightCards(high, sorted));

  if (trips.length) {
    const kickers = ranks.filter((rank) => rank !== trips[0]).slice(0, 2);
    return value(3, [trips[0], ...kickers], [...take(trips[0], 3), ...singles(kickers)]);
  }

  if (pairs.length >= 2) {
    const topPairs = pairs.slice(0, 2);
    const kicker = ranks.find((rank) => !topPairs.includes(rank)) ?? 0;
    return value(2, [...topPairs, kicker], [...take(topPairs[0], 2), ...take(topPairs[1], 2), ...take(kicker, 1)]);
  }

  if (pairs.length === 1) {
    const kickers = ranks.filter((rank) => rank !== pairs[0]).slice(0, 3);
    return value(1, [pairs[0], ...kickers], [...take(pairs[0], 2), ...singles(kickers)]);
  }

  return value(0, ranks.slice(0, 5), singles(ranks.slice(0, 5)));
}

function rankText(rank: number | undefined): string {
  if (rank === undefined || rank === 0) return '—';
  return ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' } as Record<number, string>)[rank] ?? String(rank);
}

/** Concise rank-only explanation; also tolerates the stronger hand being second. */
export function explainComparison(winner: PokerHandValue, runnerUp: PokerHandValue): { en: string; zh: string } {
  const comparison = compareHands(winner, runnerUp);
  if (comparison === 0) {
    return { en: 'Tie: equal hand ranks. Suits do not break ties.', zh: '平手：牌力相同，花色不分大小。' };
  }
  if (comparison < 0) return explainComparison(runnerUp, winner);
  if (winner.category !== runnerUp.category) {
    return { en: `${winner.label} beats ${runnerUp.label}.`, zh: `${winner.labelZh}胜过${runnerUp.labelZh}。` };
  }

  let index = 0;
  while ((winner.tiebreakers[index] ?? 0) === (runnerUp.tiebreakers[index] ?? 0)) index += 1;
  const left = rankText(winner.tiebreakers[index]);
  const right = rankText(runnerUp.tiebreakers[index]);
  let en: string;
  let zh: string;
  switch (winner.category) {
    case 8: en = 'Straight flush high'; zh = '同花顺顶张'; break;
    case 7:
      en = index === 0 ? 'Higher four of a kind' : 'Kicker';
      zh = index === 0 ? '四条点数' : '踢脚牌';
      break;
    case 6:
      en = index === 0 ? 'Full house trips' : 'Full house pair';
      zh = index === 0 ? '葫芦的三条' : '葫芦的对子';
      break;
    case 5: en = `Flush card ${index + 1}`; zh = `同花第${index + 1}张`; break;
    case 4: en = 'Straight high'; zh = '顺子顶张'; break;
    case 3:
      en = index === 0 ? 'Higher trips' : `Kicker ${index}`;
      zh = index === 0 ? '三条点数' : `第${index}张踢脚牌`;
      break;
    case 2:
      en = ['Higher top pair', 'Higher second pair', 'Kicker'][index];
      zh = ['大对点数', '小对点数', '踢脚牌'][index];
      break;
    case 1:
      en = index === 0 ? 'Higher pair' : `Kicker ${index}`;
      zh = index === 0 ? '对子点数' : `第${index}张踢脚牌`;
      break;
    default: en = `High card ${index + 1}`; zh = `高牌第${index + 1}张`;
  }
  return { en: `${en}: ${left} beats ${right}.`, zh: `${zh}：${left}胜过${right}。` };
}
