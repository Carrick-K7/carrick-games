import type { VillaPosition } from './villaWorld.js';
import { POOL, VILLA_WEST_WALL, VILLA_GARAGE_EXTENT } from './villaEstateLayout.js';

export type VillaTimeOfDay = 'day' | 'evening' | 'night';
export type VillaWeather = 'clear' | 'rain';
export interface VillaHomeLight {
  id: string; name: string; zh: string; floor: number;
  fixtures: readonly VillaPosition[];
}
/** Lamps are grouped by room, including all three galleries and the east garage. */
export const VILLA_HOME_LIGHTS: readonly VillaHomeLight[] = [
  // Fixtures follow the doubled plan: the west wing is a 22 m deep volume now,
  // and the four new rooms each get their own switchable light.
  { id: 'living', name: 'Living room', zh: '客厅', floor: 0, fixtures: [{ x: -18, y: 3.12, z: 4.4 }, { x: -7.7, y: 3.12, z: 4.1 }] },
  { id: 'kitchen', name: 'Kitchen & dining', zh: '厨房餐厅', floor: 0, fixtures: [{ x: -18, y: 3.1, z: -4.5 }, { x: -7.3, y: 3.1, z: -4.3 }] },
  { id: 'tea-room', name: 'Tea room', zh: '茶室', floor: 0, fixtures: [{ x: -18.6, y: 3.1, z: -13.6 }] },
  { id: 'utility', name: 'Laundry & utility', zh: '洗衣杂物间', floor: 0, fixtures: [{ x: -7.5, y: 3.1, z: -13.6 }] },
  { id: 'gaming', name: 'Gaming room', zh: '电竞房', floor: 0, fixtures: [{ x: 7.2, y: 3.1, z: 6.1 }, { x: 13.4, y: 3.1, z: 6.1 }] },
  { id: 'snooker', name: 'Snooker lounge', zh: '斯诺克厅', floor: 0, fixtures: [{ x: 9.2, y: 3.12, z: -3.8 }, { x: 13.4, y: 3.12, z: -3.8 }] },
  { id: 'gym', name: 'Gym & hobby room', zh: '健身多功能房', floor: 0, fixtures: [{ x: 11.3, y: 3.1, z: -13.6 }] },
  { id: 'cinema', name: 'Home cinema', zh: '影音室', floor: 0, fixtures: [{ x: 22.6, y: 3.1, z: -13.6 }] },
  { id: 'east-lounge', name: 'Living & media lounge', zh: '起居厅', floor: 0, fixtures: [{ x: 22.6, y: 3.1, z: -4.5 }, { x: 22.6, y: 3.1, z: 5 }] },
  { id: 'garage', name: 'Garage & workshop', zh: '车库工坊', floor: 0, fixtures: [{ x: 32.4, y: 3.24, z: -2.8 }, { x: 40, y: 3.24, z: -2.8 }, { x: 47, y: 3.24, z: -2.8 }] },
  { id: 'gallery-0', name: 'Ground floor hall', zh: '一楼走廊', floor: 0, fixtures: [{ x: 0, y: 3.14, z: 5.8 }, { x: 0, y: 3.14, z: -8.0 }, { x: 0, y: 3.14, z: -15.5 }] },
  { id: 'master', name: 'Primary bedroom', zh: '主卧', floor: 1, fixtures: [{ x: -19.5, y: 6.72, z: 3 }, { x: -9.3, y: 6.72, z: 4.8 }] },
  // Swapped west wing: the guest bedroom now owns the north strip, the dressing
  // room and ensuite share the band south of it.
  { id: 'guest', name: 'Guest bedroom', zh: '次卧', floor: 1, fixtures: [{ x: -20, y: 6.72, z: -12.2 }, { x: -9, y: 6.72, z: -14 }] },
  { id: 'wardrobe', name: 'Dressing room', zh: '衣帽间', floor: 1, fixtures: [{ x: -18.6, y: 6.72, z: -4.5 }] },
  { id: 'ensuite', name: 'Ensuite bath', zh: '主卫', floor: 1, fixtures: [{ x: -8.6, y: 6.72, z: -4.5 }] },
  { id: 'bath', name: 'Bathroom', zh: '浴室', floor: 1, fixtures: [{ x: 10, y: 6.72, z: -4.2 }, { x: 14.6, y: 6.72, z: -4.2 }] },
  { id: 'study', name: 'Study & library', zh: '书房', floor: 1, fixtures: [{ x: 12.5, y: 6.72, z: -13.6 }] },
  { id: 'massage', name: 'Massage room', zh: '按摩室', floor: 1, fixtures: [{ x: 22.6, y: 6.72, z: -13.6 }] },
  { id: 'reading-hall', name: 'Reading hall', zh: '阅读厅', floor: 1, fixtures: [{ x: 22.6, y: 6.72, z: -6.5 }, { x: 22.6, y: 6.72, z: .5 }, { x: 22.6, y: 6.72, z: 6.5 }] },
  { id: 'gallery-1', name: 'Upstairs hall', zh: '二楼走廊', floor: 1, fixtures: [{ x: 0, y: 6.74, z: 5.8 }, { x: 0, y: 6.74, z: -8.0 }, { x: 6.8, y: 6.74, z: -14 }, { x: 8, y: 6.74, z: 6 }, { x: 14, y: 6.74, z: 6 }] },
  { id: 'gallery-2', name: 'Roof access', zh: '天台楼梯间', floor: 2, fixtures: [{ x: 1.06, y: 10.32, z: -2.4 }] },
  { id: 'terrace', name: 'Roof terrace', zh: '天台', floor: 2, fixtures: [{ x: -6.8, y: 9.5, z: 4.2 }] },
  { id: 'garden', name: 'Garden path lights', zh: '庭院路灯', floor: 0, fixtures: [{ x: -14, y: 1.2, z: 11.3 }, { x: 1.8, y: 1.2, z: 12.2 }, { x: 42, y: 1.2, z: 8.4 }, { x: -2.8, y: 1.2, z: -33 }, { x: 2.8, y: 1.2, z: -43 }] },
];export interface VillaSecurityCamera {
  id: string; name: string; zh: string; position: VillaPosition; target: VillaPosition;
}
export const VILLA_SECURITY_CAMERAS: readonly VillaSecurityCamera[] = [
  { id: 'entrance', name: 'South entrance', zh: '南向大门', position: { x: 2, y: 2.75, z: 9.85 }, target: { x: -4, y: .6, z: 20 } },
  { id: 'living', name: 'Living room', zh: '客厅', position: { x: -2.55, y: 2.95, z: 8.35 }, target: { x: -7.8, y: .8, z: 2.7 } },
  { id: 'garage', name: 'Garage', zh: '车库', position: { x: VILLA_GARAGE_EXTENT.maxX - .5, y: 3.05, z: 1.3 },
    target: { x: (VILLA_GARAGE_EXTENT.minX + VILLA_GARAGE_EXTENT.maxX) / 2, y: .8, z: -4 } },
  { id: 'pool', name: 'Pool garden', zh: '泳池庭院', position: { x: VILLA_WEST_WALL.outer - .4, y: 3.1, z: 8.8 },
    target: { x: (POOL.minX + POOL.maxX) / 2, y: .3, z: (POOL.minZ + POOL.maxZ) / 2 } },
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
