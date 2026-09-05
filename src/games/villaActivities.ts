import type { VillaCollider, VillaPosition } from './villaWorld.js';

export type VillaScreenSource = 'pc' | 'ps' | 'switch';
export type VillaSeat = 'car' | 'racing' | null;
export interface VillaActivityState {
  carDoorOpen: boolean;
  seated: VillaSeat;
  screenSource: VillaScreenSource;
  displayLights: boolean;
}
export const createVillaActivities = (): VillaActivityState => ({ carDoorOpen: false, seated: null, screenSource: 'pc', displayLights: true });
export const CAR_DOOR_SECONDS = 0.65;
export const VILLA_WALK_SPEED = 2.75;
export const VILLA_RUN_SPEED = 5.8;

/** Front of the Model-3-inspired sedan points towards the open garage (+Z). */
export const VILLA_CAR = {
  center: { x: 16.2, y: 0, z: -2.6 },
  body: { minX: 15.24, maxX: 17.16, minZ: -4.96, maxZ: -0.24, minY: 0, maxY: 1.48 } satisfies VillaCollider,
  door: { x: 17.2, y: 0, z: -2.2 },
  exit: { x: 18.55, y: 0, z: -2.45 } satisfies VillaPosition,
  seat: { x: 16.63, y: 0, z: -2.55 } satisfies VillaPosition,
  eyeHeight: 1.16,
  yaw: Math.PI,
};
export const VILLA_RACING = {
  seat: { x: 9.8, y: 0, z: 6.12 } satisfies VillaPosition,
  exit: { x: 8.15, y: 0, z: 6.2 } satisfies VillaPosition,
  eyeHeight: 1.12,
  yaw: Math.PI,
  screen: { x: 9.8, y: 1.95, z: 8.56 },
};
export const VILLA_SNOOKER = {
  center: { x: 9.15, y: 0, z: -3.8 },
  width: 2.16,
  length: 4.06,
  playingWidth: 1.778,
  playingLength: 3.569,
  height: 0.86,
};
export function nextVillaScreen(source: VillaScreenSource): VillaScreenSource {
  return source === 'pc' ? 'ps' : source === 'ps' ? 'switch' : 'pc';
}
