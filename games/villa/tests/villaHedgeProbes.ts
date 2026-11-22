import * as THREE from 'three';

interface Level { data: Uint8Array; width: number; height: number }
/** Raycaster only intersects the supporting triangles. Sample RGBA using the
 * actual texture transform, clamp wrapping and GL linear texel centres before
 * deciding that there is a visible leaf. No foliage metadata or shape recipe. */
export function plantTexel(map: THREE.DataTexture, uv: THREE.Vector2, channel: number, level = 0) {
  map.updateMatrix(); const p = uv.clone().applyMatrix3(map.matrix);
  const { data, width, height } = (map.mipmaps?.[level] ?? map.image) as Level;
  const x = Math.max(0, Math.min(width - 1, p.x*width - .5));
  const y = Math.max(0, Math.min(height - 1, p.y*height - .5));
  const gx = Math.floor(x), gy = Math.floor(y), tx = x-gx, ty = y-gy;
  const at = (dx: number, dy: number) => data[(Math.min(gy+dy,height-1)*width + Math.min(gx+dx,width-1))*4+channel];
  return (1-ty)*((1-tx)*at(0,0)+tx*at(1,0)) + ty*((1-tx)*at(0,1)+tx*at(1,1));
}
/** Isolate one short parcel of the final, world-baked furnishing batches.
 * The aperture grid then raycasts a few hundred triangles, not the whole room. */
export function plantSection(meshes: THREE.Mesh[], x: number, z: number) {
  const local: THREE.Mesh[] = [];
  for (const mesh of meshes) {
    const source = mesh.geometry, p = source.getAttribute('position'), uv = source.getAttribute('uv');
    const xyz: number[] = [], st: number[] = [], v = new THREE.Vector3();
    for (let i = 0; i < (source.index?.count ?? p.count); i += 3) {
      const a = source.index?.getX(i) ?? i;
      v.fromBufferAttribute(p,a).applyMatrix4(mesh.matrixWorld);
      if (Math.abs(v.x-x) > .95 || Math.abs(v.z-z) > 1 || v.y < -.05 || v.y > 1.41) continue;
      for (let j=0; j<3; j++) {
        const k=source.index?.getX(i+j) ?? i+j;
        v.fromBufferAttribute(p,k).applyMatrix4(mesh.matrixWorld); xyz.push(v.x,v.y,v.z); st.push(uv.getX(k),uv.getY(k));
      }
    }
    if (!xyz.length) continue;
    const g = new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(xyz,3)).setAttribute('uv',new THREE.Float32BufferAttribute(st,2));
    local.push(new THREE.Mesh(g,mesh.material));
  }
  return local;
}
export function plantRay(meshes: THREE.Object3D[], from: [number,number,number], dir: [number,number,number], far: number, level = 0) {
  const ray = new THREE.Raycaster(new THREE.Vector3(...from), new THREE.Vector3(...dir).normalize(), 0, far);
  return ray.intersectObjects(meshes, true).find(hit => {
    const mat = (hit.object as THREE.Mesh).material as THREE.MeshStandardMaterial;
    return mat.visible && (!mat.alphaTest || !(mat.map instanceof THREE.DataTexture) ||
      !!hit.uv && plantTexel(mat.map,hit.uv,3,level)*mat.opacity >= 255*mat.alphaTest);
  });
}
