import type { Object3D } from 'three';
import type { VillaCollider } from './villaWorld.js';

/** A sliding bath leaf and a hinged wardrobe door both expose their live collider
 * alongside their openFraction. Their stationary cabinets can share the same bounds
 * when closed; exclude only the exact object that the fitting will move. */
export function fixedVillaContactColliders(root: Object3D, candidates: readonly VillaCollider[]) {
  const moving = new Set<VillaCollider>();
  root.traverse(({ userData }) => {
    if (typeof userData.openFraction === 'number' && userData.collider) moving.add(userData.collider);
  });
  return candidates.filter(collider => !moving.has(collider));
}
