import * as THREE from 'three';
import { VILLA_ROOM_BEAM, VILLA_ROOM_RETURN } from './villaInteriorDaylightData.js';
import { expandRoomField } from './villaInteriorDaylightUnpack.js';
import { indoorVolumes, roomGrid as g } from './villaInteriorDaylightGrid.js';

const f = (n: number) => Number.isInteger(n) ? n + '.0' : Number(n.toFixed(6)).toString();
const volumes = indoorVolumes.map((v, i) => `${i ? 'else ' : ''}if (p.y >= ${f(v.bottom)} && p.y < ${f(v.top)} && p.x >= ${f(v.x0)} && p.x <= ${f(v.x1)} && p.z >= ${f(v.z0)} && p.z <= ${f(v.z1)}) {
    h = p.y - ${f(v.floor)}; bank = ${f(v.bank * g.layers)}; shift = ${f(v.shift)};
  }`).join('\n');
/** Fragment functions only. Sample once *before* the directional/point/IBL
 * loops. b=1 is an indoor receiver (not "shadow"); outside is exactly neutral
 * and does not fetch this texture. Glass affects light in transit, not albedo. */
export const VILLA_INTERIOR_DAYLIGHT_GLSL = /* glsl */`
  uniform highp sampler3D villaRoomField;
  uniform vec3 villaRoomClimate;
  uniform vec3 villaApertureRadiance;
  vec3 villaRoomLight(vec3 p) {
    float h, bank, shift;
    ${volumes} else return vec3(1.0, 1.0, 0.0);
    h = clamp(h, ${f(g.low)}, ${f(g.high)}) - ${f(g.low)};
    // Store samples in the sun's basis: beams keep their slant at intervening
    // heights rather than cross-fading several disjoint shadows on the floor.
    vec2 q = p.xz + vec2(shift, 0.0) - h * vec2(${f(g.dx)}, ${f(g.dz)});
    vec3 cell = vec3((q - vec2(${f(g.x0)}, ${f(g.z0)})) / ${f(g.pitch)}, bank + h * ${f((g.layers - 1) / (g.high - g.low))});
    vec3 field = texture(villaRoomField, (cell + 0.5) / vec3(${f(g.nx)}, ${f(g.nz)}, ${f(2 * g.layers)})).rgb;
    float indirect = sqrt(field.g * field.g + villaRoomClimate.z * field.b * field.b);
    return vec3(mix(1.0, field.r, villaRoomClimate.x), indirect, 1.0);
  }
  // Scale only *indirect* irradiance, never emissive or the room-light slots.
  // The pale indoor floor/walls return more light towards a soffit than the
  // hemisphere lamp's dark garden-ground colour suggests. Sky/solar transfer
  // estimates how much is available to return; this is not a ceiling sun lamp.
  vec3 villaRoomIrradiance(vec3 room, float normalWorldY) {
    float opening = min(room.g, 1.25), down = clamp(-normalWorldY, 0.0, 1.0);
    float gain = 0.60 + opening * (1.02 + 0.66 * down);
    float warmth = villaRoomClimate.z * 0.025 * (1.0 - min(opening, 1.0));
    vec3 tint = vec3(1.0 + warmth, 1.0 + .035 * down, 1.0 - warmth + .080 * down);
    return mix(vec3(1.0), gain * tint, room.b * villaRoomClimate.y);
  }
  vec3 villaRoomIrradiance(vec3 room) { return villaRoomIrradiance(room, 0.0); }
  // Broad incoming radiance, not emissive colour or a fake punctual source.
  // The artistic scene's hemisphere was calibrated for sky over a dark garden,
  // not a pale wall seen through several bounces. Recover that lost low-frequency
  // term from measured throughput. An opening-free probe contributes ZERO.
  vec3 villaRoomReturn(vec3 room, float directionY) {
    float through = room.g / (0.43 + room.g);
    // Vertical apertures present a broad belt above the horizon; floor and
    // ceiling mostly see lit fabric by return. No fixed radial room vignette.
    float belt = 1.0 - clamp(abs(directionY - 0.12), 0.0, 1.0);
    return villaApertureRadiance * (room.b * through * (0.83 + 0.25 * belt));
  }
  // In particular, a steel kettle on software GL has almost no Lambert term
  // and no environment sampler. Give the existing GGX model a broad window
  // and darker off-axis reflected fabric, resolved towards the mean by roughness.
  vec3 villaRoomReflection(vec3 room, float directionY, float roughness) {
    float aperture = smoothstep(-0.61, 0.02, directionY) * (1.0 - smoothstep(0.22, 0.83, directionY));
    return villaRoomReturn(room, directionY) * mix(0.30 + 1.28 * aperture, 1.0, roughness);
  }
`;

/** No scene walk, readback, fetch or light allocation. The mutable uniforms and
 * texture belong to this particular Estate and survive ordinary context restore. */
export function createVillaInteriorDaylight() {
  // RGB5: beam transmission, sqrt(sky transfer), sqrt(solar interreflection).
  const data = expandRoomField(VILLA_ROOM_BEAM, VILLA_ROOM_RETURN);
  const map = new THREE.Data3DTexture(data, g.nx, g.nz, 2 * g.layers);
  map.name = 'villa/room-daylight-and-return'; map.format = THREE.RGBAFormat; map.type = THREE.UnsignedShort5551Type;
  map.minFilter = map.magFilter = THREE.LinearFilter; map.generateMipmaps = false; map.needsUpdate = true;
  const uniforms = { villaRoomField: { value: map as THREE.Data3DTexture | null }, villaRoomClimate: { value: new THREE.Vector3() },
    villaApertureRadiance: { value: new THREE.Vector3() } };
  const sat = (n: number) => Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
  function setAtmosphere(sun: number, rain: number, night: number) {
    const r = sat(rain), n = sat(night), s = Number.isFinite(sun) ? Math.max(0, Math.min(sun, 4)) : 0;
    // Home already dims/recolours the actual sun and hemisphere. Cloud softens
    // paths; near-zero daylight releases the intentional ambient/moon fill.
    const t = sat(s / .70), daylight = t * t * (3 - 2 * t);
    uniforms.villaRoomClimate.value.set(daylight * (1 - .12 * r) * (1 - .48 * n),
      daylight * (1 - .12 * r) * (1 - .76 * n), s * (1 - .73 * r) * (1 - n));
    // Invert Home's rain reduction of the direct sun: under cloud there is less
    // beam but still an outdoor sky to admit. Dusk warms the broad source, not
    // the material. Home's night/moon/room switches are left completely alone.
    const phase = sat(s / (2.9 * (1 - .58 * r))), glow = phase * (1 - .32 * r) * (1 - n);
    const dusk = sat((1 - phase) / .43) * (1 - r);
    uniforms.villaApertureRadiance.value.set(glow * (.93 + .12 * dusk), glow * (1.02 - .04 * dusk), glow * (1.12 - .20 * dusk));
  }
  setAtmosphere(2.9, 0, 0);
  return { map, uniforms, setAtmosphere, dispose() {
    if (!uniforms.villaRoomField.value) return;
    uniforms.villaRoomField.value = null; map.dispose(); map.image.data = null;
  } };
}
