import * as T from 'three';

export const BUTTERFLY_UPPER_ARM_MAX=.48;

// The viewmodel has no visible torso. Move its virtual shoulder toward the
// elbow instead of stretching the upper sleeve to a distant offscreen anchor.
// Both inputs are in the same model-local frame; the elbow seam stays fixed.
export function butterflyShoulder(elbow,requested){
  return new T.Vector3().subVectors(requested,elbow).clampLength(0,BUTTERFLY_UPPER_ARM_MAX).add(elbow);
}
