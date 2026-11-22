import * as THREE from 'three';
import { VILLA_STREAM, VILLA_STREAM_SECTIONS, villaStreamBasinGeometry, villaStreamBasinRows } from './villaStream.js';
import { drift, earthFinish, saturate, sediment, smooth } from './villaRiparianGround.js';

/** A band-limited slope field, not a picture of white ripples. It filters down
 * to the flat normal in distant mips; one cheap lookup replaces per-pixel wave
 * synthesis. RGB is the normal in the flat surface's object-space X/Y/Z. */
function rippleNormals(pond: boolean) {
  const size = 64, pixels = new Uint8Array(size * size * 4), phase = pond ? 1.2 : 3.4;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const u = (i + .5) / size * 2 * Math.PI, v = (j + .5) / size * 2 * Math.PI;
    const curl = .72 * Math.sin(u + v + phase) + .46 * Math.sin(2 * u - v - phase);
    const a = Math.cos(4 * u - 2 * v + curl * 2), b = Math.cos(7 * u + 3 * v + 1.7 * curl), small = Math.cos(2 * u + 11 * v + curl);
    const strength = (.62 + .23 * Math.cos(u - 2 * v) + .13 * Math.sin(u + v)) * (pond ? .86 : 1);
    const x = (a * .24 + b * .094 + small * .025) * strength, z = (-a * .12 + b * .053 + small * .095) * strength, inv = 1 / Math.hypot(x, 1, z), k = (j * size + i) * 4;
    pixels[k] = Math.round((.5 + .5 * x * inv) * 255); pixels[k + 1] = Math.round((.5 + .5 * inv) * 255);
    pixels[k + 2] = Math.round((.5 + .5 * z * inv) * 255); pixels[k + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, size, size); texture.name = pond ? 'pond/wind-slopes' : 'stream/current-slopes';
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter; texture.needsUpdate = true; return texture;
}

type Profile = { shelfDepth: number; centreDepth: number; shelfOffset: number };
/** The pond passes the measured bottom at each water vertex. The stream must
 * retain precisely two boundary vertices per station (its playable polygon).
 * Reconstruct the transverse water column from the SAME bathymetric rows as
 * the bottom rather than treating its 2.5m width as a uniform tinted ribbon. */
export function riparianWaterMaterial(profile?: Profile) {
  const pond = !profile, time = { value: 0 };
  const m = new THREE.MeshStandardMaterial({ color: pond ? '#547c78' : '#678987', roughness: pond ? .22 : .25,
    metalness: 0, transparent: true, opacity: 1, depthWrite: false, normalMap: rippleNormals(pond), normalMapType: THREE.ObjectSpaceNormalMap });
  m.name = pond ? 'estate-pond-water' : 'villa-stream-flowing-water';
  m.onBeforeCompile = shader => {
    if (!pond) shader.uniforms.villaStreamTime = time;
    const vars = `varying vec2 villaStreamUV; varying vec2 villaSurfaceMetres;${pond ? ' varying float villaDepth; varying float villaWind;' : ''}`;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${vars}\n${pond ? 'attribute float waterColumn; attribute float waterBreeze;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvillaStreamUV = uv; ${pond ? 'villaSurfaceMetres = uv; villaDepth = waterColumn; villaWind = waterBreeze;' : 'villaSurfaceMetres = position.xz;'}`);
    const depth = profile ? `float halfSpan = abs(2.0 * villaStreamUV.y - 1.0);
      float shelf = ${profile.shelfOffset.toFixed(6)};
      float column = mix(${profile.centreDepth.toFixed(6)}, ${profile.shelfDepth.toFixed(6)}, min(1.0, halfSpan / shelf))
        * clamp((1.0 - halfSpan) / (1.0 - shelf), 0.0, 1.0);` : 'float column = villaDepth;';
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${vars}
      ${pond ? '' : 'uniform float villaStreamTime;'}
      vec2 villaRippleUv() { return (villaSurfaceMetres ${pond ? '' : `- vec2(villaStreamTime * ${VILLA_STREAM.flowMetresPerSecond.toFixed(2)}, 0.0)`}) / ${pond ? '3.7' : '2.9'}; }`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${depth}
        float absorption = clamp(column * ${pond ? '1.20' : '2.20'}, 0.0, 1.0);
        diffuseColor.rgb *= mix(vec3(1.12, 1.03, 0.88), vec3(0.46, 0.73, 0.77), absorption);
        diffuseColor.a = 0.075 + 0.60 * absorption;`)
      .replace('#include <normal_fragment_maps>', `vec3 slope = texture2D(normalMap, villaRippleUv()).xyz * 2.0 - 1.0;
        slope.xz *= (0.42 + 0.58 * absorption)${pond ? ' * villaWind' : ''}; normal = normalize(normalMatrix * slope);`)
      .replace('#include <opaque_fragment>', `// Real upper-sky irradiance at grazing angles, including when software GL has no environment probe.
        float grazing = 1.0 - clamp(dot(normal, geometryViewDir), 0.0, 1.0);
        float fresnel = grazing * grazing * grazing * grazing * grazing;
        #if NUM_HEMI_LIGHTS > 0
          outgoingLight = mix(outgoingLight, hemisphereLights[0].skyColor * 0.30 + totalSpecular, fresnel * 0.73);
        #endif
        diffuseColor.a += (1.0 - diffuseColor.a) * fresnel * 0.68;
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => pond ? 'villa-pond-column-sun-v1' : 'villa-stream-column-sun-v1';
  return { material: m, update(elapsedSeconds: number) { if (Number.isFinite(elapsedSeconds)) time.value = Math.max(0, elapsedSeconds); } };
}

export function addRiparianStreamWater(root: THREE.Group, geometry: (positions: number[], indices: number[]) => THREE.BufferGeometry) {
  const bed = villaStreamBasinGeometry(), colors: number[] = [], pos: number[] = [], uv: number[] = [], ids: number[] = [];
  const level = VILLA_STREAM.waterY;
  VILLA_STREAM_SECTIONS.forEach((s, i) => {
    for (let j = 0; j < bed.stride; j++) {
      const k = (i * bed.stride + j) * 3, x = bed.positions[k], y = bed.positions[k + 1], z = bed.positions[k + 2];
      const bank = (Math.abs(z - s.z) - s.halfWidth) / VILLA_STREAM.bankWidth;
      const turf = smooth((bank - .07 - .55 * drift(x * .51, z * .63)) / .29);
      const c = sediment(x, y, z, level, turf); colors.push(c.r, c.g, c.b);
    }
    pos.push(s.x, level, s.z - s.halfWidth, s.x, level, s.z + s.halfWidth); uv.push(s.x, 0, s.x, 1);
    if (i) { const k = (i - 1) * 2; ids.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  });
  // The supported outer rows end at zero; the adjoining lawn is 22mm
  // lower. Lap a sparse, ragged toe down INTO the lawn instead of leaving
  // an airborne lip or extending the collision cutout. Interior faces stay exact.
  for (const side of [-1, 1]) {
    const inner = (i: number) => i * bed.stride + (side < 0 ? 0 : bed.stride - 1);
    const extend = (i: number) => {
      const k = inner(i) * 3, x = bed.positions[k], z0 = bed.positions[k + 2], z = z0 + side * (.14 + .43 * drift(x * .76, z0));
      const c = sediment(x, 0, z, level, 1); colors.push(c.r, c.g, c.b); return bed.positions.push(x, -.032, z) / 3 - 1;
    };
    const face = (a: number, b: number, c: number) => { if (side < 0) bed.indices.push(a, b, c); else bed.indices.push(a, c, b); };
    let outer = extend(0);
    for (let i = 1; i < VILLA_STREAM_SECTIONS.length; i++) {
      face(inner(i - 1), inner(i), outer);
      if (i % 3 === 0 || i === VILLA_STREAM_SECTIONS.length - 1) { const k = extend(i); face(inner(i), k, outer); outer = k; }
    }
  }
  const g = geometry(bed.positions, bed.indices); g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const basin = new THREE.Mesh(g, earthFinish('stream/silt-clay-turf'));
  basin.name = 'villa-stream-basin-and-banks'; basin.receiveShadow = true; root.add(basin);
  const s = VILLA_STREAM_SECTIONS[0], rows = villaStreamBasinRows(s).filter(p => p.z >= s.z && p.y < level), shelf = rows[1];
  const finish = riparianWaterMaterial({ centreDepth: level - rows[0].y, shelfDepth: level - shelf.y, shelfOffset: saturate((shelf.z - s.z) / s.halfWidth) });
  const water = geometry(pos, ids); water.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const surface = new THREE.Mesh(water, finish.material); surface.name = 'villa-stream-water'; surface.receiveShadow = true; root.add(surface); return finish.update;
}
