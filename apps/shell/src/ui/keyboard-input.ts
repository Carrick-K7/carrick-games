export function normalizeKey(label: string): string {
  const aliases: Record<string, string> = {
    '←': 'ArrowLeft',
    '↑': 'ArrowUp',
    '→': 'ArrowRight',
    '↓': 'ArrowDown',
    Space: ' ',
  };
  return aliases[label] ?? (label.length === 1 ? label.toLowerCase() : label);
}
