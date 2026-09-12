import type { VillaPosition } from './villaWorld.js';

export type VillaTimeOfDay = 'day' | 'evening' | 'night';
export type VillaWeather = 'clear' | 'rain';
export interface VillaHomeLight {
  id: string; name: string; zh: string; floor: number;
  fixtures: readonly VillaPosition[];
}
/** Lamps are grouped by room, including all three galleries and the east garage. */
export const VILLA_HOME_LIGHTS: readonly VillaHomeLight[] = [
  { id: 'living', name: 'Living room', zh: '客厅', floor: 0, fixtures: [{ x: -7.7, y: 3.12, z: 4.1 }] },
  { id: 'kitchen', name: 'Kitchen & dining', zh: '厨房餐厅', floor: 0, fixtures: [{ x: -7.3, y: 3.1, z: -4.3 }] },
  { id: 'gaming', name: 'Gaming room', zh: '电竞房', floor: 0, fixtures: [{ x: 7.2, y: 3.1, z: 6.1 }, { x: 12.6, y: 3.1, z: 6.1 }] },
  { id: 'snooker', name: 'Snooker lounge', zh: '斯诺克厅', floor: 0, fixtures: [{ x: 9.2, y: 3.12, z: -3.8 }, { x: 13.4, y: 3.12, z: -3.8 }] },
  { id: 'garage', name: 'Garage & workshop', zh: '车库工坊', floor: 0, fixtures: [{ x: 16.2, y: 3.24, z: -2.8 }, { x: 24.1, y: 3.24, z: -2.8 }, { x: 31, y: 3.24, z: -2.8 }] },
  { id: 'gallery-0', name: 'Ground floor hall', zh: '一楼走廊', floor: 0, fixtures: [{ x: 0, y: 3.14, z: 5.8 }, { x: 0, y: 3.14, z: -8.0 }] },
  { id: 'master', name: 'Primary bedroom', zh: '主卧', floor: 1, fixtures: [{ x: -7.4, y: 6.72, z: 4.4 }] },
  { id: 'guest', name: 'Guest bedroom', zh: '次卧', floor: 1, fixtures: [{ x: -7.5, y: 6.72, z: -4.6 }] },
  { id: 'bath', name: 'Bathroom', zh: '浴室', floor: 1, fixtures: [{ x: 9.1, y: 6.72, z: -4.2 }, { x: 13.6, y: 6.72, z: -4.2 }] },
  { id: 'library', name: 'Reading lounge', zh: '书房', floor: 1, fixtures: [{ x: 7.1, y: 6.72, z: 6 }, { x: 13.4, y: 6.72, z: 6 }] },
  { id: 'gallery-1', name: 'Upstairs hall', zh: '二楼走廊', floor: 1, fixtures: [{ x: 0, y: 6.74, z: 5.8 }, { x: 0, y: 6.74, z: -8.0 }] },
  { id: 'gallery-2', name: 'Roof access', zh: '天台楼梯间', floor: 2, fixtures: [{ x: 1.06, y: 10.32, z: -2.4 }] },
  { id: 'terrace', name: 'Roof light strips', zh: '天台灯带', floor: 2, fixtures: [{ x: -6.8, y: 9.5, z: 4.2 }] },
  { id: 'garden', name: 'Garden path lights', zh: '庭院路灯', floor: 0, fixtures: [{ x: -14, y: 1.2, z: 11.3 }, { x: 1.8, y: 1.2, z: 12.2 }, { x: 29, y: 1.2, z: 8.4 }] },
];
export interface VillaSecurityCamera {
  id: string; name: string; zh: string; position: VillaPosition; target: VillaPosition;
}
export const VILLA_SECURITY_CAMERAS: readonly VillaSecurityCamera[] = [
  { id: 'entrance', name: 'South entrance', zh: '南向大门', position: { x: 2, y: 2.75, z: 9.85 }, target: { x: -4, y: .6, z: 20 } },
  { id: 'living', name: 'Living room', zh: '客厅', position: { x: -2.55, y: 2.95, z: 8.35 }, target: { x: -7.8, y: .8, z: 2.7 } },
  { id: 'garage', name: 'Garage', zh: '车库', position: { x: 33.6, y: 3.05, z: 1.5 }, target: { x: 22.7, y: .8, z: -3.8 } },
  { id: 'pool', name: 'Pool garden', zh: '泳池庭院', position: { x: -13.1, y: 3.1, z: 10 }, target: { x: -18.5, y: .3, z: -.5 } },
  { id: 'roof', name: 'Roof garden', zh: '天台', position: { x: 14.8, y: 9.3, z: 8.5 }, target: { x: 3, y: 7.7, z: 3.6 } },
  { id: 'farm', name: 'Fields & pond', zh: '田地与池塘', position: { x: -2.5, y: 5.5, z: 59 }, target: { x: -13, y: .6, z: 78 } },
  { id: 'drive', name: 'South scenic road', zh: '南侧景观道路', position: { x: 40, y: 8, z: 114 }, target: { x: 20, y: 1.5, z: 133 } },
];
export interface VillaHomeState {
  timeOfDay: VillaTimeOfDay;
  weather: VillaWeather;
  /** Blended values, never discontinuously assigned by a command. */
  darkness: number;
  rain: number;
  lightLevels: Record<string, number>;
  roomLights: Record<string, boolean>;
  lookSensitivity: number;
  /** Discrete input revision only: do not use animation time as a cache key. */
  revision: number;
}
const darknessFor = (time: VillaTimeOfDay): number => time === 'day' ? 0 : time === 'evening' ? .43 : 1;
export const VILLA_LOOK_SENSITIVITY = { min: .25, max: 3, default: 1 } as const;
export function clampVillaLookSensitivity(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(VILLA_LOOK_SENSITIVITY.min, Math.min(VILLA_LOOK_SENSITIVITY.max, value)) : VILLA_LOOK_SENSITIVITY.default;
}
export function createVillaHome(sensitivity: number = VILLA_LOOK_SENSITIVITY.default): VillaHomeState {
  return {
    timeOfDay: 'evening', weather: 'clear', darkness: .43, rain: 0,
    roomLights: Object.fromEntries(VILLA_HOME_LIGHTS.map(light => [light.id, true])),
    lightLevels: Object.fromEntries(VILLA_HOME_LIGHTS.map(light => [light.id, 1])),
    lookSensitivity: clampVillaLookSensitivity(sensitivity), revision: 0,
  };
}
export function setVillaTimeOfDay(state: VillaHomeState, value: VillaTimeOfDay): boolean {
  if (!['day', 'evening', 'night'].includes(value) || state.timeOfDay === value) return false;
  state.timeOfDay = value; state.revision++; return true;
}
export function cycleVillaTimeOfDay(state: VillaHomeState): void {
  setVillaTimeOfDay(state, state.timeOfDay === 'day' ? 'evening' : state.timeOfDay === 'evening' ? 'night' : 'day');
}
export function setVillaWeather(state: VillaHomeState, value: VillaWeather): boolean {
  if (!['clear', 'rain'].includes(value) || state.weather === value) return false;
  state.weather = value; state.revision++; return true;
}
export function setVillaRoomLight(state: VillaHomeState, id: string, on: boolean): boolean {
  if (!Object.prototype.hasOwnProperty.call(state.roomLights, id) || state.roomLights[id] === on) return false;
  state.roomLights[id] = on; state.revision++; return true;
}
export function setVillaAllLights(state: VillaHomeState, on: boolean): void {
  for (const light of VILLA_HOME_LIGHTS) setVillaRoomLight(state, light.id, on);
}
export function setVillaLookSensitivity(state: VillaHomeState, value: unknown): void {
  const next = clampVillaLookSensitivity(value);
  if (next !== state.lookSensitivity) { state.lookSensitivity = next; state.revision++; }
}
/** Stable, reversible easing. Weather takes several seconds; lamps fade faster. */
export function advanceVillaHome(state: VillaHomeState, dt: number): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  dt = Math.min(dt, .25);
  const blend = (current: number, target: number, rate: number): number => {
    const next = current + (target - current) * (1 - Math.exp(-rate * dt));
    return Math.abs(next - target) < .0005 ? target : next;
  };
  state.darkness = blend(state.darkness, darknessFor(state.timeOfDay), .62);
  state.rain = blend(state.rain, state.weather === 'rain' ? 1 : 0, .72);
  for (const light of VILLA_HOME_LIGHTS) {
    state.lightLevels[light.id] = blend(state.lightLevels[light.id] ?? 0, state.roomLights[light.id] ? 1 : 0, 6);
  }
}
/** Readable moonlight, rather than pitch-black rooms, even with all lamps off. */
export function villaAtmosphere(home: Pick<VillaHomeState, 'darkness' | 'rain'>) {
  const darkness = Math.max(0, Math.min(1, home.darkness)), rain = Math.max(0, Math.min(1, home.rain));
  const night = Math.max(0, (darkness - .43) / .57);
  return {
    darkness, rain, night, twilight: Math.max(0, 1 - Math.abs(darkness - .43) / .43),
    sun: (2.9 - darkness * 2.52) * (1 - rain * .58),
    hemisphere: .94 - darkness * .37 - rain * .13,
    ambient: .25 + darkness * .17,
    exposure: 1.02 + darkness * .09,
    lampStrength: .2 + darkness * 1.8 + rain * .35,
    fogNear: 42 - rain * 24,
    fogFar: 230 - darkness * 62 - rain * 76,
  };
}
