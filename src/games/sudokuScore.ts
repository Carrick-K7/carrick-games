export function calculateSudokuScore(timerSeconds: number, mistakes: number, hints: number): number {
  return Math.max(0, Math.floor(10000 - timerSeconds * 10 - mistakes * 500 - hints * 200));
}
