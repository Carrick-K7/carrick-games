import * as T from 'three';
import { BUTTERFLY_DEPLOY_DURATION, BUTTERFLY_INSPECT_DURATION, normalizeButterflyVariant } from './csButterflyKnife.js';

const TAU = Math.PI * 2;
const copy = pose => Object.fromEntries(Object.entries(pose).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value]));
const ease = t => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };
const wrapNear = (from, to) => Math.round((from - to) / TAU) * TAU;
const angles = ['knifeSpin', 'knifeYaw', 'butterflyBlade', 'butterflyHandle'];
const contacts = ['knifeSeat', 'knifeThumbOut', 'knifeThumbSweep', 'knifeThumbPin', 'knifeOpen', 'knifeThumb', 'knifeIndexOpen', 'knifeSplay', 'knifeFingerFan', 'knifeContact', 'knifeLowerLeft', 'knifeElbowIn', 'knifeAttack'];
function phase(state, time) {
  const deploy = state.deployProgress ?? -1, inspect = state.inspectProgress ?? -1, age = state.shotAge ?? 99;
  if (deploy >= 0 && deploy < 1) return { kind: 'draw', start: time - deploy * BUTTERFLY_DEPLOY_DURATION, variant: normalizeButterflyVariant('draw',state.butterflyDrawVariant) };
  if (age >= 0 && age < (state.knifeHeavy ? .85 : .48)) return { kind: state.knifeHeavy ? 'stab' : 'slash', start: time - age, variant: 0 };
  if (inspect >= 0 && inspect < 1 && age > .5) return { kind: 'inspect', start: time - inspect * BUTTERFLY_INSPECT_DURATION, variant: normalizeButterflyVariant('inspect',state.butterflyInspectVariant) };
  return { kind: 'idle', start: 0, variant: 0 };
}
const same = (a, b) => a.kind === b.kind && a.variant === b.variant && Math.abs(a.start - b.start) < 1e-5;
const rotation = p => new T.Quaternion().setFromEuler(new T.Euler(...p.rotation, 'XYZ'));
function discontinuous(a, b) {
  return new T.Vector3(...a.offset).distanceTo(new T.Vector3(...b.offset)) > .003
    || rotation(a).angleTo(rotation(b)) > .04
    || new T.Quaternion().fromArray(a.knifeGrip).angleTo(new T.Quaternion().fromArray(b.knifeGrip)) > .04
    || angles.some(key => Math.abs((b[key] + wrapNear(a[key], b[key])) - a[key]) > .08)
    || contacts.some(key=>Math.abs(a[key]-b[key])>.08);
}

/**
 * Butterfly-only visual continuity. The combat command, ray, damage, cooldown,
 * audio events and pure sampler are untouched. All clocks are simulation time.
 * Missing time intentionally restores the original direct/stateless sampling
 * contract used by offline geometry tools. Each rig owns only numeric poses.
 */
export function resolveButterflyPresentation(rig, raw, state) {
  const time = state.animationTime;
  if (!Number.isFinite(time)) { delete rig.butterflyPresentation; return raw; }
  const next = phase(state, time), previous = rig.butterflyPresentation;
  if (!previous || time < previous.time - 1e-8 || time - previous.time > .25 || next.kind === 'draw' && !same(next, previous.phase)) {
    rig.butterflyPresentation = { time, phase: next, displayed: copy(raw), transition: null };
    return raw;
  }
  const unchanged = same(next, previous.phase);
  if (time === previous.time && unchanged) return copy(previous.displayed);
  let transition = previous.transition;
  if (!unchanged) {
    transition = discontinuous(previous.displayed, raw) ? {
      from: copy(previous.displayed), start: time,
      duration: next.kind === 'slash' || next.kind === 'stab' ? .08 : .12,
      // Select the angle winding ONCE. Rewrapping a moving target every frame
      // could flip direction at pi and reintroduce exactly the pop being fixed.
      winding: Object.fromEntries(angles.map(key => [key, wrapNear(previous.displayed[key], raw[key])])),
    } : null;
  }
  let displayed = raw;
  if (transition && time - transition.start < transition.duration) {
    const t = ease((time - transition.start) / transition.duration), from = transition.from;
    if (t === 0) displayed = copy(from);
    else {
      displayed = copy(raw);
      displayed.offset = from.offset.map((value, index) => T.MathUtils.lerp(value, raw.offset[index], t));
      const q = rotation(from).slerp(rotation(raw), t);
      const euler = new T.Euler().setFromQuaternion(q, 'XYZ'); displayed.rotation = [euler.x, euler.y, euler.z];
      displayed.knifeGrip = new T.Quaternion().fromArray(from.knifeGrip).slerp(new T.Quaternion().fromArray(raw.knifeGrip), t).toArray();
      for (const key of angles) displayed[key] = T.MathUtils.lerp(from[key], raw[key] + transition.winding[key], t);
      for (const key of contacts) displayed[key] = T.MathUtils.lerp(from[key], raw[key], t);
      // Finish releasing/catching the loose fingers after most of the hinge
      // recovery, rather than snapping them closed over a still-moving handle.
      const catchFade = 1 - ease((t - .65) / .35);
      displayed.knifeOpen = Math.max(displayed.knifeOpen, from.knifeOpen * catchFade);
      displayed.knifeThumb = Math.max(displayed.knifeThumb, from.knifeThumb * catchFade);
    }
  } else transition = null;
  rig.butterflyPresentation = { time, phase: next, displayed: copy(displayed), transition };
  return displayed;
}
