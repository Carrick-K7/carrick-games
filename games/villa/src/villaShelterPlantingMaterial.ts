import * as THREE from 'three';
import { SHELTER_BARK, SHELTER_LEAF_ATLAS } from './villaShelterPlantingAtlas.js';

/** Scene-owned, ready synchronously for both Three and the offline sun survey. Palette entries
 * are straight sRGB/coverage; row zero intentionally corresponds to glTF's texture V=0. */
function botanicalMap(packed: string, width: number, height: number, name: string) {
  const s = atob(packed), rgba = new Uint8Array(width * height * 4);
  let read = 1024, write = 0;
  while (read < s.length) {
    const op = s.charCodeAt(read++), count = (op & 127) + 1, run = (op & 128) !== 0;
    const repeated = run ? s.charCodeAt(read++) : 0;
    for (let i = 0; i < count; i++) {
      const j = (run ? repeated : s.charCodeAt(read++)) * 4;
      rgba[write++] = s.charCodeAt(j); rgba[write++] = s.charCodeAt(j+1);
      rgba[write++] = s.charCodeAt(j+2); rgba[write++] = s.charCodeAt(j+3);
    }
  }
  if (read !== s.length || write !== rgba.length) throw new Error('Incomplete shelter planting map');
  const map = new THREE.DataTexture(rgba, width, height, THREE.RGBAFormat);
  map.name = name; map.colorSpace = THREE.SRGBColorSpace; map.flipY = false;
  map.generateMipmaps = true; map.minFilter = THREE.LinearMipmapLinearFilter; map.magFilter = THREE.LinearFilter;
  map.needsUpdate = true; return map;
}
export function shelterFinishes() {
  const foliage = new THREE.MeshStandardMaterial({map: botanicalMap(SHELTER_LEAF_ATLAS,1024,512,'shelter/fronds-leaves-and-shoots'),
    roughness:.95,vertexColors:true,side:THREE.DoubleSide,alphaTest:.31,depthWrite:true});
  foliage.name='shelter/leaf-cuticles';
  const map=botanicalMap(SHELTER_BARK,128,128,'shelter/fissured-branch-bark');map.wrapS=map.wrapT=THREE.RepeatWrapping;
  const bark=new THREE.MeshStandardMaterial({map,roughness:.99,vertexColors:true});bark.name='shelter/bole-and-limb-bark';
  return {foliage,bark};
}
