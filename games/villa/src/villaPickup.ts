import { advanceVillaDriving, createVillaDriving, isVillaVehicleCollider, registerVillaVehicleColliders, villaCarAnchors, villaCarExitClear, villaCarFootprint, villaCarOverlaps, villaCarSafeExit, villaDrivingPoseBlocked, type VillaDrivingInput, type VillaDrivingPose, type VillaDrivingProfile, type VillaDrivingState } from './villaDriving.js';
import { VILLA_GARAGE_BAYS, VILLA_PICKUP_LIMITS } from './villaEstateLayout.js';
export { VILLA_PICKUP, VILLA_PICKUP_LIMITS } from './villaEstateLayout.js';
import type { VillaCollider } from './villaWorld.js';

export type VillaPickupState = VillaDrivingState;
const bay = VILLA_GARAGE_BAYS[1];
export const VILLA_PICKUP_PROFILE: VillaDrivingProfile = {
  id: 'pickup', limits: VILLA_PICKUP_LIMITS, spawn: bay,
  seat: [.52, .37], door: [1.10, .42], exit: [2.75, -.30], acceleration: 1.75, reverseAcceleration: 1.2,
};
export const createVillaPickup = (): VillaPickupState => createVillaDriving(VILLA_PICKUP_PROFILE);
export const registerVillaPickupColliders = (colliders: readonly VillaCollider[]): void => registerVillaVehicleColliders(colliders, VILLA_PICKUP_PROFILE);
export const isVillaPickupCollider = (collider: VillaCollider): boolean => isVillaVehicleCollider(collider, VILLA_PICKUP_PROFILE);
export const villaPickupAnchors = (pose: VillaDrivingPose) => villaCarAnchors(pose, VILLA_PICKUP_PROFILE);
export const villaPickupFootprint = (pose: VillaDrivingPose) => villaCarFootprint(pose, VILLA_PICKUP_PROFILE);
export const villaPickupOverlaps = (pose: VillaDrivingPose, box: VillaCollider): boolean => villaCarOverlaps(pose, box, VILLA_PICKUP_PROFILE);
export const villaPickupPoseBlocked = (pose: VillaDrivingPose, obstacles: readonly VillaCollider[]): boolean => villaDrivingPoseBlocked(pose, obstacles, VILLA_PICKUP_PROFILE);
export const villaPickupExitClear = (pose: VillaDrivingPose, obstacles: readonly VillaCollider[], side: 1 | -1 = 1): boolean => villaCarExitClear(pose, obstacles, VILLA_PICKUP_PROFILE, side);
export const villaPickupSafeExit = (pose: VillaDrivingPose, obstacles: readonly VillaCollider[]) => villaCarSafeExit(pose, obstacles, VILLA_PICKUP_PROFILE);
export const advanceVillaPickup = (state: VillaPickupState, input: VillaDrivingInput, dt: number, obstacles: readonly VillaCollider[]): void => advanceVillaDriving(state, input, dt, obstacles, VILLA_PICKUP_PROFILE);
