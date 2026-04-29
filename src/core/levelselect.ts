export interface LevelSelectState {
  totalLevels: number;
  currentLevel: number;
  bestLevel: number;
  unlockedLevel: number;
  speed: number;
  maxSpeed: number;
  gear: string;
  gameState: string;
  steerAngle?: number;
  maxSteerAngle?: number;
  steeringActive?: boolean;
}

export function renderLevelGridHTML(state: LevelSelectState, selectedLevel: number, zh: boolean): string {
  const cols = state.totalLevels > 50 ? 10 : 5;
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
    if (locked) badge = '<span class="lc-lock">🔒</span>';
    else if (cleared) badge = '<span class="lc-check">✓</span>';
    else badge = '';

    html += `<button class="${cls}" data-level="${i}">
      <span class="lc-num">${i + 1}</span>
      ${badge}
    </button>`;
  }
  html += `</div>`;
  return html;
}

export function renderDrivingStateHTML(state: LevelSelectState, zh: boolean): string {
  const isRacing = state.gameState === 'playing' || state.gameState === 'parked';
  if (!isRacing) return '';

  const speedRatio = Math.abs(state.speed) / state.maxSpeed;
  const gearColor = state.gear === 'R' ? '#ef4444' : state.gear === 'D' ? 'var(--accent)' : 'var(--text-secondary)';

  let html = `<div class="driving-state">`;

  // Speed gauge
  html += `<div class="ds-speed">
    <div class="ds-gauge-wrap">
      <svg viewBox="0 0 100 100" class="ds-gauge">
        <path d="M 15 85 A 40 40 0 1 1 85 85" fill="none" stroke="var(--border-strong)" stroke-width="6" stroke-linecap="round"/>
        <path id="ds-speed-arc" d="M 15 85 A 40 40 0 1 1 85 85" fill="none" stroke="var(--accent)" stroke-width="6" stroke-linecap="round"
          stroke-dasharray="${251 * speedRatio} 251" stroke-dashoffset="0"/>
      </svg>
      <div class="ds-speed-val" id="ds-speed-val">${Math.round(Math.abs(state.speed))}</div>
    </div>
    <div class="ds-speed-label">${zh ? '速度' : 'SPEED'}</div>
  </div>`;

  // Gear
  html += `<div class="ds-gear">
    <div class="ds-gear-val" id="ds-gear-val" style="color:${gearColor}">${state.gear}</div>
    <div class="ds-gear-label">${zh ? '档位' : 'GEAR'}</div>
  </div>`;

  // Level
  html += `<div class="ds-level">
    <div class="ds-level-val" id="ds-level-val">${state.currentLevel + 1}</div>
    <div class="ds-level-label">${zh ? '关卡' : 'LEVEL'}</div>
  </div>`;

  html += `</div>`;
  return html;
}

export function renderParkingSteeringHTML(state: LevelSelectState, zh: boolean): string {
  const maxSteer = state.maxSteerAngle || 1;
  const ratio = Math.max(-1, Math.min(1, (state.steerAngle || 0) / maxSteer));
  const wheelRotation = ratio * 220;
  const steerPercent = Math.round(ratio * 100);
  const activeLabel = state.steeringActive ? (zh ? '鼠标' : 'MOUSE') : (zh ? '键盘' : 'KEYS');

  return `<div class="parking-steering">
    <div class="parking-steering-title">${zh ? '方向盘' : 'STEERING'}</div>
    <div class="steering-wheel" id="parkingSteeringWheel" style="--wheel-rotation:${wheelRotation}deg">
       <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle class="steering-rim" cx="50" cy="50" r="42"/>
        <path class="steering-spoke" d="M50 50 L50 17"/>
        <path class="steering-spoke" d="M50 50 L21 70"/>
        <path class="steering-spoke" d="M50 50 L79 70"/>
        <path class="steering-grip" d="M27 28 A33 33 0 0 1 73 28"/>
      </svg>
    </div>
    <div class="steering-readout">
      <span id="parkingSteerPercent">${steerPercent}%</span>
      <span id="parkingSteerMode">${activeLabel}</span>
    </div>
  </div>`;
}

export function renderMenuHint(zh: boolean): string {
  return `<div class="ds-hint">${zh ? '点击关卡开始' : 'Click a level to start'}</div>`;
}
