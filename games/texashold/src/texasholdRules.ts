export interface PokerCard {
  suit: number;
  rank: number;
}

export function evaluatePreflopStrength(hole: readonly PokerCard[]): number {
  if (hole.length < 2) return 0;
  const ranks = hole.slice(0, 2).map((card) => card.rank).sort((a, b) => b - a);
  const suited = hole[0].suit === hole[1].suit;
  const pair = ranks[0] === ranks[1];
  const gap = ranks[0] - ranks[1];
  const bothBroadway = ranks[0] >= 10 && ranks[1] >= 10;

  let score = ranks[0] * 2 + ranks[1];
  if (pair) score = 38 + ranks[0] * 4;
  if (suited) score += 8;
  if (gap === 1) score += 7;
  else if (gap === 2) score += 4;
  if (bothBroadway) score += 10;
  if (ranks[0] === 14) score += 8;
  if (ranks[0] + ranks[1] >= 24) score += 8;
  return Math.max(0, Math.min(100, score));
}

export function hasFlushDraw(cards: readonly PokerCard[]): boolean {
  const suits = [0, 0, 0, 0];
  for (const card of cards) suits[card.suit] += 1;
  return suits.some((count) => count === 4);
}

export function hasStraightDraw(cards: readonly PokerCard[]): boolean {
  const values = new Set<number>();
  for (const card of cards) {
    values.add(card.rank);
    if (card.rank === 14) values.add(1);
  }
  for (let start = 1; start <= 10; start += 1) {
    let count = 0;
    for (let value = start; value < start + 5; value += 1) {
      if (values.has(value)) count += 1;
    }
    if (count === 4) return true;
  }
  return false;
}
