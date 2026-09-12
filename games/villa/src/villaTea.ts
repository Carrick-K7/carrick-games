/** Pure tea lifecycle; durations and dt are simulation seconds, never wall-clock expiries. */
export const VILLA_TEA = { brewSeconds: 10, drinkSeconds: 2.8 } as const;
export type VillaTeaPhase = 'empty' | 'brewing' | 'ready' | 'drinking';
export interface VillaTeaState { phase: VillaTeaPhase; elapsed: number; fill: number }
export function createVillaTea(): VillaTeaState { return { phase: 'empty', elapsed: 0, fill: 0 }; }
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => { const t = clamp(v); return t * t * (3 - 2 * t); };

/** Repeated E while busy is deliberately a no-op, including elapsed/fill. */
export function interactVillaTea(state: VillaTeaState): 'brewing' | 'drinking' | 'busy' {
  if (state.phase === 'brewing' || state.phase === 'drinking') return 'busy';
  state.elapsed = 0;
  if (state.phase === 'ready') { state.phase = 'drinking'; return 'drinking'; }
  state.phase = 'brewing'; state.fill = 0; return 'brewing';
}

/** Mutates only the supplied state, returning whether a lifecycle value changed. */
export function advanceVillaTea(state: VillaTeaState, dt: number): boolean {
  if (!Number.isFinite(dt) || dt <= 0 || state.phase === 'empty' || state.phase === 'ready') return false;
  state.elapsed += dt;
  if (state.phase === 'brewing') {
    state.fill = clamp(state.elapsed / VILLA_TEA.brewSeconds);
    if (state.fill === 1) { state.phase = 'ready'; state.elapsed = 0; }
  } else {
    const progress = state.elapsed / VILLA_TEA.drinkSeconds;
    state.fill = 1 - smooth((progress - 0.27) / 0.43);
    if (progress >= 1) { state.phase = 'empty'; state.elapsed = 0; state.fill = 0; }
  }
  return true;
}

/** Render-only local pose: lift, sip/tilt with depletion, then set the empty cup down. */
export function villaTeaCupPose(state: VillaTeaState) {
  const t = state.phase === 'drinking' ? clamp(state.elapsed / VILLA_TEA.drinkSeconds) : 0;
  const raised = smooth(t / 0.25) * (1 - smooth((t - 0.76) / 0.24));
  const tilt = smooth((t - 0.2) / 0.15) * (1 - smooth((t - 0.68) / 0.13));
  return { lift: raised * 0.48, forward: raised * 0.54, tilt: tilt * 0.93, fill: clamp(state.fill) };
}
