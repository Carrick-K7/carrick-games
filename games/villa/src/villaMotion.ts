export interface VillaMotionState {
  offset: number; velocity: number; crouched: boolean; stance: number;
}
export const createVillaMotion = (): VillaMotionState => ({ offset: 0, velocity: 0, crouched: false, stance: 0 });
export const villaBodyHeight = (state: VillaMotionState) => 1.75 - state.stance * .7;
export const villaEyeHeight = (state: VillaMotionState) => 1.65 - state.stance * .75;

/** C toggles posture, but never raises the head into an occupied space. */
export function toggleVillaCrouch(state: VillaMotionState, canFit: (height: number) => boolean): boolean {
  if (state.crouched && !canFit(1.75 + state.offset)) return false;
  state.crouched = !state.crouched; return true;
}
export function jumpVillaMotion(state: VillaMotionState): boolean {
  if (state.offset > .001 || state.velocity !== 0) return false;
  state.velocity = 4.35; return true;
}
/** Gravity and swept head clearance. Ground support stays constrained to the
 * walkable house/yard: hopping never lets a visitor fall into a shaft or pool. */
export function advanceVillaMotion(state: VillaMotionState, dt: number, canFit: (height: number) => boolean): void {
  dt = Number.isFinite(dt) ? Math.max(0, Math.min(.05, dt)) : 0;
  if (!dt) return;
  const target = state.crouched ? 1 : 0;
  let stance = state.stance + (target - state.stance) * Math.min(1, dt * 16);
  if (Math.abs(stance - target) < .001) stance = target;
  if (stance >= state.stance || canFit(1.75 - stance * .7 + state.offset)) state.stance = stance;
  if (!state.velocity && !state.offset) return;
  const nextVelocity = state.velocity - 9.8 * dt;
  const next = Math.max(0, state.offset + (state.velocity + nextVelocity) * .5 * dt);
  if (next > state.offset && !canFit(villaBodyHeight(state) + next)) {
    let low = state.offset, high = next;
    for (let i = 0; i < 12; i++) {
      const mid = (low + high) / 2;
      if (canFit(villaBodyHeight(state) + mid)) low = mid; else high = mid;
    }
    state.offset = low; state.velocity = 0;
  } else {
    state.offset = next; state.velocity = next === 0 ? 0 : nextVelocity;
  }
}
