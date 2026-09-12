export interface LevelSelectState {
  totalLevels: number;
  currentLevel: number;
  bestLevel: number;
  unlockedLevel: number;
  selectedLevel: number;
  speed: number;
  maxSpeed: number;
  gear: string;
  gameState: string;
  steerAngle?: number;
  maxSteerAngle?: number;
  steeringActive?: boolean;
}

/** Render the compact on-demand level picker used by Parking. */
export function renderLevelGridHTML(state: LevelSelectState, selectedLevel: number, zh: boolean): string {
  void zh;
  const cols = state.totalLevels > 50 ? 8 : 5;
  const largeClass = state.totalLevels > 50 ? ' level-grid-large' : '';
  let html = `<div class="level-grid${largeClass}">`;
  for (let i = 0; i < state.totalLevels; i++) {
    const unlocked = i <= state.unlockedLevel;
    const cleared = i < state.bestLevel;
    const current = i === state.currentLevel && state.gameState !== 'menu';
    const selected = i === selectedLevel && state.gameState === 'menu';
    const locked = !unlocked;

    let cls = 'level-cell';
    if (selected) cls += ' selected';
    if (current) cls += ' current';
    if (cleared) cls += ' cleared';
    if (locked) cls += ' locked';
    if ((i % cols) === 0) cls += ' col-first';

    let badge = '';
    if (locked) {
      badge = '<span class="lc-lock" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></span>';
    } else if (cleared) {
      badge = '<span class="lc-check">✓</span>';
    }

    html += `<button class="${cls}" data-level="${i}"${locked ? ' disabled' : ''}>
      <span class="lc-num">${i + 1}</span>
      ${badge}
    </button>`;
  }
  html += '</div>';
  return html;
}
