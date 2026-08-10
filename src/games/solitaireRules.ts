export interface SolitaireCardLike {
  suit: number;
  rank: number;
  faceUp: boolean;
}

export function canPlaceOnTableau(card: SolitaireCardLike, destination: readonly SolitaireCardLike[]): boolean {
  if (destination.length === 0) return card.rank === 12;
  const top = destination[destination.length - 1];
  if (!top.faceUp) return false;
  return (card.suit < 2) !== (top.suit < 2) && card.rank === top.rank - 1;
}

export function canPlaceOnFoundation(card: SolitaireCardLike, foundation: readonly SolitaireCardLike[]): boolean {
  if (foundation.length === 0) return card.rank === 0;
  const top = foundation[foundation.length - 1];
  return card.suit === top.suit && card.rank === top.rank + 1;
}
