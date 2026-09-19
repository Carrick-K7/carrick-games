import { advanceVillaDriving, createVillaDriving, isVillaVehicleCollider, registerVillaVehicleColliders, villaCarAnchors, villaCarDriverSide, villaCarExitClear, villaCarFootprint, villaCarOverlaps, villaCarSafeExit, villaDrivingPoseBlocked, type VillaDrivingInput, type VillaDrivingPose, type VillaDrivingProfile, type VillaDrivingState } from './villaDriving.js';
import { VILLA_GARAGE_BAYS, VILLA_SUV_LIMITS } from './villaEstateLayout.js';
export { VILLA_SUV, VILLA_SUV_LIMITS } from './villaEstateLayout.js';
import type { VillaCollider } from './villaWorld.js';

export type VillaSuvState = VillaDrivingState;
const bay = VILLA_GARAGE_BAYS[3];
const VILLA_SUV_PROFILE: VillaDrivingProfile = {
  id: 'suv', limits: VILLA_SUV_LIMITS, spawn: bay,
  seat: [.52, -.30], door: [1.08, .42], exit: [2.7, -.30], acceleration: 3.4, reverseAcceleration: 1.6,
};
export const createVillaSuv = (): VillaSuvState => createVillaDriving(VILLA_SUV_PROFILE);
export const registerVillaSuvColliders = (colliders: readonly VillaCollider[]): void => registerVillaVehicleColliders(colliders, VILLA_SUV_PROFILE);
export const isVillaSuvCollider = (collider: VillaCollider): boolean => isVillaVehicleCollider(collider, VILLA_SUV_PROFILE);
export const villaSuvAnchors = (pose: VillaDrivingPose) => villaCarAnchors(pose, VILLA_SUV_PROFILE);
export const villaSuvDriverSide = (pose: VillaDrivingPose, p: { x: number; z: number }) => villaCarDriverSide(pose, p, VILLA_SUV_PROFILE);
export const villaSuvFootprint = (pose: VillaDrivingPose) => villaCarFootprint(pose, VILLA_SUV_PROFILE);
export const villaSuvOverlaps = (pose: VillaDrivingPose, box: VillaCollider): boolean => villaCarOverlaps(pose, box, VILLA_SUV_PROFILE);
export const villaSuvPoseBlocked = (pose: VillaDrivingPose, obstacles: readonly VillaCollider[]): boolean => villaDrivingPoseBlocked(pose, obstacles, VILLA_SUV_PROFILE);
export const villaSuvExitClear = (pose: VillaDrivingPose, obstacles: readonly VillaCollider[], side: 1 | -1 = 1): boolean => villaCarExitClear(pose, obstacles, VILLA_SUV_PROFILE, side);
export const villaSuvSafeExit = (pose: VillaDrivingPose, obstacles: readonly VillaCollider[]) => villaCarSafeExit(pose, obstacles, VILLA_SUV_PROFILE);
export const advanceVillaSuv = (state: VillaSuvState, input: VillaDrivingInput, dt: number, obstacles: readonly VillaCollider[]): void => advanceVillaDriving(state, input, dt, obstacles, VILLA_SUV_PROFILE);
