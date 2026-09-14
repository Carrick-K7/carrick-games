import type { VillaCollider, VillaPosition } from './villaWorld.js';
import { VILLA_GARAGE_BAYS, VILLA_SCOOTER_PARKING } from './villaEstateLayout.js';

export type VillaScreenSource = 'pc' | 'ps' | 'switch';
export type VillaSeat = 'car' | 'pickup' | 'racing' | 'scooter' | 'sofa' | 'lounger' | 'chair' | 'stool' | 'bed' | null;
export interface VillaActivityState {
  carDoorOpen: boolean;
  pickupDoorOpen: boolean;
  seated: VillaSeat;
  relaxSeatId?: string | null;
  relaxSeatPosition?: VillaPosition | null;
  relaxEntryPosition?: VillaPosition | null;
  screenSource: VillaScreenSource;
  displayLights: boolean;
}
export const createVillaActivities = (): VillaActivityState => ({ carDoorOpen: false, pickupDoorOpen: false, seated: null, relaxSeatId: null, relaxSeatPosition: null, relaxEntryPosition: null, screenSource: 'pc', displayLights: true });
export const CAR_DOOR_SECONDS = 0.65;
export const VILLA_WALK_SPEED = 2.75;
export const VILLA_RUN_SPEED = 5.8;

/** Front of the Model-3-inspired sedan points towards the open garage (+Z).
 *  Its anchors are offsets from the first bay, so moving the garage carries the
 *  car, its door swing and its standing exit with it. */
const sedanBay = VILLA_GARAGE_BAYS[0];
export const VILLA_CAR = {
  center: { x: sedanBay.x, y: 0, z: sedanBay.z },
  body: { minX: sedanBay.x - .96, maxX: sedanBay.x + .96, minZ: sedanBay.z - 2.36, maxZ: sedanBay.z + 2.36, minY: 0, maxY: 1.48 } satisfies VillaCollider,
  door: { x: sedanBay.x + 1, y: 0, z: sedanBay.z + .4 },
  exit: { x: sedanBay.x + 2.35, y: 0, z: sedanBay.z + .15 } satisfies VillaPosition,
  seat: { x: sedanBay.x + .43, y: 0, z: sedanBay.z + .05 } satisfies VillaPosition,
  eyeHeight: 1.16,
  yaw: Math.PI,
};
/** Park east of all four garage bays, clear of cars and the preserved lemon tree. */
export const VILLA_SCOOTER = { center: VILLA_SCOOTER_PARKING, eyeHeight: 1.44, yaw: Math.PI };
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
