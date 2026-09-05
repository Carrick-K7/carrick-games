// Small, monochrome pictograms for catalog icons. Artwork only: game metadata
// and registration stay in games/catalog.ts. No runtime icon dependency.
const paths: Record<string, string> = {
  snake: '<path d="M5 5h11a3 3 0 0 1 0 6H8a4 4 0 0 0 0 8h10"/><path d="M5 3v4m11 10 3 2-3 2"/>',
  breakout: '<path d="M3 4h18v6H3zM9 4v6m6-6v6M8 21h8"/><circle cx="14" cy="15" r="1.5"/>',
  bubbleshooter: '<circle cx="8" cy="6" r="3"/><circle cx="16" cy="6" r="3"/><circle cx="12" cy="12" r="3"/><path d="m9 21 3-4 3 4"/>',
  tetris: '<path d="M3 3h6v6h6v6h6v6H9v-6H3zM3 9h6v6m0 0h6v6"/>',
  pong: '<path d="M4 6v12M20 6v12M12 3v3m0 3v2m0 4v2m0 3v1"/><circle cx="8" cy="13" r="1.5"/>',
  spaceshooter: '<path d="m12 3 7 16-7-4-7 4 7-16Zm0 15v3M4 4v2m16-2v2"/>',
  flappybird: '<path d="M4 13a7 7 0 0 1 14-1l3 2-4 1a7 7 0 0 1-12 2H2l2-4Z"/><path d="m7 12 4 2-3 2"/><circle cx="14.5" cy="10.5" r=".6"/>',
  asteroids: '<path d="m8 3 9 2 4 7-5 8-9 1-4-8 5-10Z"/><path d="m8 7-2 5m8 3 3-4"/>',
  minesweeper: '<circle cx="12" cy="12" r="5"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>',
  doodlejump: '<path d="M4 20h7m3-6h6M5 8h5m2 2V3m-3 3 3-3 3 3"/>',
  '2048': '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 3v18M3 12h18M6 7h3m-1.5-1.5v3M15 16h3m-3 2h3"/>',
  simon: '<path d="M10 3a9 9 0 0 0-7 7h7V3Zm4 0v7h7a9 9 0 0 0-7-7ZM3 14a9 9 0 0 0 7 7v-7H3Zm11 0v7a9 9 0 0 0 7-7h-7Z"/>',
  checkers: '<ellipse cx="9" cy="8" rx="6" ry="3"/><path d="M3 8v4c0 1.7 2.7 3 6 3m6-7v3"/><ellipse cx="15" cy="15" rx="6" ry="3"/><path d="M9 15v3c0 1.7 2.7 3 6 3s6-1.3 6-3v-3"/>',
  solitaire: '<rect x="6" y="3" width="14" height="18" rx="2"/><path d="M3 6v13a3 3 0 0 0 3 3m7-15 3 5-3 5-3-5 3-5Z"/>',
  wordle: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m7 8 2 8 3-5 3 5 2-8"/>',
  sudoku: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18m6-18v18M3 9h18M3 15h18"/>',
  chess: '<path d="M12 2v6M9 5h6M7 10h10l-3 7H10l-3-7Zm3 7-3 4h10l-3-4"/>',
  galaga: '<path d="m12 3 3 6h4l2 8-6-3-3 5-3-5-6 3 2-8h4l3-6ZM6 21v-2m12 2v-2"/>',
  stacker: '<path d="M3 16h18v5H3zM5 10h14v6H5zM8 4h11v6H8zM9 16v5m6-5v5m-3-11v6m2-12v6"/>',
  iwanna: '<path d="M3 21h18M4 21l4-7 4 7m0 0 4-7 4 7M12 8v4m-3-2 3-2 3 2"/><circle cx="12" cy="4" r="2"/>',
  texashold: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 3v4m0 10v4M3 12h4m10 0h4m-8-2h3l-3 4h3"/>',
  parking: '<path d="m5 9 2-5h10l2 5M4 9h16v9H4zM7 18v2m10-2v2M7 13h2m6 0h2"/>',
  villa: '<path d="m3 9 9-6 9 6M5 8v13h14V8M3 21h18M5 13h14M10 21v-5h4v5M8 10h1m6 0h1M8 16h1m6 0h1"/>',
  connectfour: '<rect x="3" y="3" width="18" height="16" rx="2"/><path d="M6 19v2m12-2v2"/><circle cx="8" cy="8" r="1.5"/><circle cx="16" cy="8" r="1.5"/><circle cx="8" cy="14" r="1.5"/><circle cx="16" cy="14" r="1.5"/>',
  gacha: '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M3 12h18M12 7v14m0-14C5 7 6 1 9 3l3 4Zm0 0c7 0 6-6 3-4l-3 4Z"/>',
  aimlab: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>',
  counterstrike: '<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Z"/><path d="M8 12h8m-4-4v8"/>',
};

export function renderGameIcon(icon: string): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[icon] ?? paths.gacha}</svg>`;
}
