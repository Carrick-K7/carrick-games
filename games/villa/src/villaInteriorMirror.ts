import * as THREE from 'three';
import type { VillaHomeState } from './villaHome.js';
import { VILLA_MIRROR_PLATES } from './villaMirrorPlateData.js';
import { VILLA_MIRROR_BUDGET, VILLA_MIRROR_LAYERS, VILLA_MIRROR_LIGHT, VILLA_MIRROR_ROOMS, VILLA_MIRROR_SITES, VILLA_MIRROR_SIZE, type MirrorRoom } from './villaMirrorPlateLayout.js';
import { VILLA_MIRROR_FRAGMENT, VILLA_MIRROR_LOOKUP } from './villaMirrorPlateOptics.js';
export { VILLA_MIRROR_ROOMS, VILLA_MIRROR_SITES, type MirrorRoom } from './villaMirrorPlateLayout.js';

/** Builders may batch the silver and change its display name. The role tag
 * identifies the glass, not its frame, privacy frit or other polished metal. */
export function createVillaRoomMirror(room: MirrorRoom, baseColor: THREE.ColorRepresentation = '#d5dfdc') {
  const m = new THREE.MeshStandardMaterial({ color: baseColor, roughness: .078, metalness: .72 });
  m.name = `room-mirror/${room}`; m.userData.villaMirrorRoom = room; m.envMapIntensity = .34;
  return m;
}

type MirrorHome = Pick<VillaHomeState,'darkness'|'rain'|'lightLevels'|'roomLights'>;
type Outcome = 'pending' | 'decoded' | 'failed' | 'cancelled';
const sat = (n: number) => Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
export function setVillaMirrorWeights(out: THREE.Vector4, room: MirrorRoom, home: MirrorHome) {
  const dark = sat(home.darkness), rain = sat(home.rain), lamp = VILLA_MIRROR_LIGHT[room];
  const level = sat(home.lightLevels[lamp] ?? Number(home.roomLights[lamp]));
  // Clear endpoints are actual captures. Between them Home's eased sky and
  // local lamp level are independent. Cloud reduces daylight, not lit fixtures.
  const day = (1 - dark) * (1 - .30 * rain), night = 1 - day;
  out.set(day*(1-level), day*level, night*(1-level), night*level);
}

/** Packed WebP is just transport. A 2D array keeps mip filtering confined to
 * the SAME lighting endpoint, down to 1×1. Top-down RGBA uploaded unflipped.
 * No object URL/fetch, long-lived canvas, external decoder, or module cache. */
export function decodeVillaMirrorPlate(room: MirrorRoom, encoded: string, signal: AbortSignal): Promise<THREE.DataArrayTexture | null> {
  const n = VILLA_MIRROR_SIZE, layers = VILLA_MIRROR_LAYERS.length;
  if (signal.aborted || !encoded || encoded.length > Math.ceil(VILLA_MIRROR_BUDGET.perRoomBytes / 3)*4
    || typeof Image === 'undefined' || typeof document === 'undefined') return Promise.resolve(null);
  return new Promise(resolve => {
    let image: HTMLImageElement;
    try { image = new Image(); } catch { resolve(null); return; }
    let pending = true;
    const cancel = () => finish(null);
    const finish = (t: THREE.DataArrayTexture | null) => {
      if (!pending) return;
      pending = false; signal.removeEventListener('abort', cancel); image.onload = image.onerror = null;
      image.removeAttribute('src'); resolve(t);
    };
    signal.addEventListener('abort', cancel, { once: true });
    image.onload = () => {
      if (!pending) return;
      if (image.naturalWidth !== n || image.naturalHeight !== n*layers) { finish(null); return; }
      let c: HTMLCanvasElement | undefined;
      try {
        c = document.createElement('canvas'); c.width = n; c.height = n*layers;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (!ctx) { finish(null); return; }
        ctx.drawImage(image, 0, 0);
        const rgba = ctx.getImageData(0, 0, c.width, c.height).data;
        if (rgba.length !== n*n*layers*4) { finish(null); return; }
        // A partially decoded/transparent panel is not a reflection. Intentional
        // scene cutouts and glazing were depth tested/blended in the source GL render.
        for (let i=3; i<rgba.length; i+=4) if (rgba[i] !== 255) { finish(null); return; }
        const t = new THREE.DataArrayTexture(new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength), n,n,layers);
        t.name = `room-radiance/${room}`; t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true;
        t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
        t.needsUpdate = true; finish(t);
      } catch { finish(null); } finally { if (c) c.width = c.height = 0; }
    };
    image.onerror = cancel;
    try { image.decoding = 'async'; image.src = 'data:image/webp;base64,' + encoded; } catch { finish(null); }
  });
}

function attach(m: THREE.MeshStandardMaterial, room: MirrorRoom, map: THREE.DataArrayTexture, weights: THREE.Vector4) {
  const site = VILLA_MIRROR_SITES[room], original = m.onBeforeCompile, originalKey = m.customProgramCacheKey, key = originalKey.call(m);
  const plate = { value: map as THREE.DataArrayTexture | null };
  const uniforms = { villaMirrorPlate:plate, villaMirrorWeights:{ value: weights }, villaMirrorEye:{ value:new THREE.Vector3(...site.eye) },
    villaMirrorAxis:{ value:new THREE.Vector3(...site.axis) }, villaMirrorLo:{ value:new THREE.Vector3(...site.lo) }, villaMirrorHi:{ value:new THREE.Vector3(...site.hi) } };
  const patch: typeof original = (shader, renderer) => {
    original.call(m, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + VILLA_MIRROR_LOOKUP)
      .replace('#include <opaque_fragment>', VILLA_MIRROR_FRAGMENT + '\n#include <opaque_fragment>');
  };
  const cacheKey = () => key + '|villa-finite-room-silver-1';
  m.onBeforeCompile = patch; m.customProgramCacheKey = cacheKey; m.needsUpdate = true;
  return () => {
    plate.value = null;
    if (m.onBeforeCompile === patch) m.onBeforeCompile = original;
    if (m.customProgramCacheKey === cacheKey) m.customProgramCacheKey = originalKey;
    m.needsUpdate = true;
  };
}

export interface VillaRoomMirrors {
  readonly ready: Promise<void>;
  readonly states: Readonly<Record<MirrorRoom, Outcome>>;
  update(home: MirrorHome): void;
  dispose(): void;
}
/** Install after furnishings/batches exist. Only an authenticated, decoded
 * same-room plate replaces the polished fallback. The scene owns materials;
 * this handle owns just its shader bindings and up to five array textures. */
export function installVillaRoomMirrors(scene: THREE.Object3D, onReady?: () => void): VillaRoomMirrors {
  const groups = VILLA_MIRROR_ROOMS.map(room => ({ room, materials: new Set<THREE.MeshStandardMaterial>(), weights:new THREE.Vector4(0,.57,0,.43) }));
  scene.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (m instanceof THREE.MeshStandardMaterial && m.userData.villaMirrorRoom) groups.find(g => g.room === m.userData.villaMirrorRoom)?.materials.add(m);
    }
  });
  const states = Object.fromEntries(groups.map(g => [g.room, 'pending'])) as Record<MirrorRoom, Outcome>;
  const abort = new AbortController(), release: Array<() => void> = [];
  const releaseMap = (map: THREE.DataArrayTexture) => { map.dispose(); map.image.data = null; };
  const budget = groups.reduce((n,g) => {
    const b = VILLA_MIRROR_PLATES[g.room]; return n + b.length / 4 * 3 - (b.endsWith('==') ? 2 : b.endsWith('=') ? 1 : 0);
  }, 0) <= VILLA_MIRROR_BUDGET.totalBytes;
  const ready = (async () => {
    for (const { room, materials, weights } of groups) {
      if (abort.signal.aborted) break;
      if (!budget || !materials.size) { states[room] = 'failed'; continue; }
      // Serial decodes bound scratch image/canvas memory; never hold five
      // decoder canvases at once or delay a playable first frame.
      const map = await decodeVillaMirrorPlate(room, VILLA_MIRROR_PLATES[room], abort.signal);
      if (abort.signal.aborted) { if (map) releaseMap(map); break; }
      if (!map) { states[room] = 'failed'; continue; }
      const unbind = [...materials].map(m => attach(m, room, map, weights));
      release.push(() => { unbind.forEach(f => f()); releaseMap(map); });
      states[room] = 'decoded'; onReady?.();
    }
  })();
  return { states, ready, update(home) {
    if (!abort.signal.aborted) for (const group of groups) setVillaMirrorWeights(group.weights, group.room, home);
  }, dispose() {
    if (abort.signal.aborted) return;
    abort.abort();
    for (const {room, materials} of groups) { materials.clear(); if (states[room] === 'pending') states[room] = 'cancelled'; }
    release.forEach(f => f()); release.length = 0;
  } };
}
