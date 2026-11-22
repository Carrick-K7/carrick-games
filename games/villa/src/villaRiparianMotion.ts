import * as THREE from 'three';
import { VILLA_STREAM } from './villaStream.js';
import { saturate, smooth } from './villaRiparianGround.js';

// Speeds are in metres/second; each phase wraps only at a complete tile (or a
// complete turn for the gust/eddy). Never send an ever-growing float to GL.
const current = { tile: 3.84, speed: VILLA_STREAM.flowMetresPerSecond, secondTile: 2.16, secondSpeed: .108, turnSeconds: 4.5 };
const breeze = { tile: 4.32, speed: .18, secondTile: 1.92, secondSpeed: .12, turnSeconds: 14 };
export function waterMotion(pond: boolean) {
  const w = pond ? breeze : current, period = w.tile / w.speed, secondPeriod = w.secondTile / w.secondSpeed;
  const phase = { value: new THREE.Vector4(0, 0, 0, 0) };
  return { phase, update(elapsedSeconds: number, rain = 0) {
    if (!Number.isFinite(elapsedSeconds)) return;
    const t = Math.max(0, elapsedSeconds);
    phase.value.set((t % period) / period, (t % secondPeriod) / secondPeriod, (t % w.turnSeconds) / w.turnSeconds, Number.isFinite(rain) ? saturate(rain) : 0);
  } };
}

/** Bake a periodic centimetre-relief study, NOT a picture of bright water.
 * RGB is its normal along/across the water chart. A stores the narrow folded
 * tops of interrupted stream crests, where a little more skylight scatters.
 * All four channels are mip filtered together; no frame uploads or new maps. */
export function rippleNormals(pond: boolean) {
  const n = 128, heights = new Float32Array(n * n), pixels = new Uint8Array(n * n * 4), phase = pond ? 1.2 : 3.4;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const u = (i + .5) * (2 * Math.PI / n), v = (j + .5) * (2 * Math.PI / n);
    const bend = .94 * Math.sin(u + 2 * v + phase) + .57 * Math.sin(2 * u - v - phase) + .24 * Math.cos(3 * v - u);
    const packet = smooth(.49 + .37 * Math.sin(u - 2 * v + .7 * bend) + .26 * Math.cos(2 * u + v - phase));
    const top = .5 + .5 * Math.cos(5 * u - v + 1.85 * bend), fold = top ** 4 * packet;
    const k = j * n + i;
    heights[k] = pond
      ? .032 * (.38 + .62 * packet) * Math.sin(3 * u + v + 1.31 * bend) + .026 * fold + .010 * Math.sin(6 * u - 3 * v + bend) + .006 * Math.cos(2 * u + 7 * v - bend)
      : .017 * Math.sin(3 * u - 2 * v + bend) + .056 * fold + .015 * (.35 + .65 * packet) * Math.sin(7 * u + 2 * v - .74 * bend) + .007 * Math.cos(2 * u + 6 * v + bend);
    pixels[k * 4 + 3] = Math.round(smooth((fold - .32) / .68) * 255);
  }
  const invTwoTexels = .5 * n / (pond ? breeze.tile : current.tile);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = (heights[j * n + (i + n - 1) % n] - heights[j * n + (i + 1) % n]) * invTwoTexels;
    const z = (heights[((j + n - 1) % n) * n + i] - heights[((j + 1) % n) * n + i]) * invTwoTexels;
    const inv = .5 / Math.hypot(x, 1, z), k = (j * n + i) * 4;
    pixels[k] = Math.round((.5 + x * inv) * 255); pixels[k + 1] = Math.round((.5 + inv) * 255); pixels[k + 2] = Math.round((.5 + z * inv) * 255);
  }
  const t = new THREE.DataTexture(pixels, n, n); t.name = pond ? 'pond/wind-slopes' : 'stream/current-slopes';
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true; return t;
}

export const slopeHelpers = `uniform vec4 villaWaterPhase;
  vec2 villaSlopes(vec4 tap) { return (tap.rb * 2.0 - 1.0) / max(0.55, tap.g * 2.0 - 1.0); }
  vec2 villaAlong(vec2 slopes, vec2 downstream) { return downstream * slopes.x + vec2(-downstream.y, downstream.x) * slopes.y; }`;

// Blend independently transported fields in the shear zone; multiplying an
// absolute travelled distance by a lateral speed would wind a ridge into an
// infinitely fine thread. The lee mask is fixed to the banks, not advected.
export const currentSlopes = `float margin = abs(villaSection.z);
  float channel = 1.0 - smoothstep(0.40, 0.89, margin);
  float lee = villaSection.w * smoothstep(0.16, 0.65, margin);
  vec2 p = villaSurfaceMetres;
  float curl = lee * sin(4.3 * p.x - 2.7 * p.y - 6.2831853 * villaWaterPhase.z);
  p.y += 0.12 * sin(0.73 * p.x + 1.1 * p.y) + 0.19 * curl;
  vec4 run = texture2D(normalMap, p / ${current.tile} - vec2(villaWaterPhase.x, 0.0));
  vec4 shelfRun = texture2D(normalMap, vec2(p.x + 0.31 * p.y, -p.y) / ${current.secondTile} + vec2(0.37 - villaWaterPhase.y, 0.61));
  vec2 shelfSlope = villaSlopes(shelfRun);
  shelfSlope = vec2(shelfSlope.x, 0.31 * shelfSlope.x - shelfSlope.y);
  vec2 ripple = mix(shelfSlope * (0.70 + 0.42 * lee), villaSlopes(run), channel);
  ripple.y += ripple.x * 0.80 * curl;
  ripple = villaAlong(ripple, normalize(villaSection.xy)) * (0.58 + 0.76 * absorption) * (1.0 + 0.20 * villaWaterPhase.w);
  float folded = mix(shelfRun.a * (0.25 + 0.65 * lee), run.a, channel) * absorption;`;

// Broad exposed-water fetch and much finer crossing cat's-paws. The coves
// shelter the broad swells. Both normal directions turn back into world X/Z;
// scrolling two textures then adding their unrotated RGB is not a crosswind.
export const pondSlopes = `vec2 wind = vec2(0.80, 0.60), crosswind = vec2(-0.28, 0.96);
  vec2 p = villaSurfaceMetres;
  vec2 fetch = vec2(dot(p, wind), dot(p, vec2(-wind.y, wind.x)));
  vec2 catspaw = vec2(dot(p, crosswind), dot(p, vec2(-crosswind.y, crosswind.x)));
  vec4 swell = texture2D(normalMap, fetch / ${breeze.tile} - vec2(villaWaterPhase.x, 0.0));
  vec4 shortWave = texture2D(normalMap, catspaw / ${breeze.secondTile} + vec2(0.27 - villaWaterPhase.y, 0.73));
  float gust = 0.5 + 0.5 * sin(dot(p, vec2(0.91, -0.52)) - 6.2831853 * villaWaterPhase.z);
  vec2 ripple = villaAlong(villaSlopes(swell), wind) * (0.38 + 0.91 * villaWind)
    + villaAlong(villaSlopes(shortWave), crosswind) * (0.31 + 0.32 * gust + 0.33 * villaWaterPhase.w);
  // Short fetch on the enclosed pond: waves travel, but their faces stay low.
  ripple *= 0.25 * (0.44 + 0.62 * absorption) * (0.70 + 0.30 * villaWind);
  float folded = 0.0;`;
