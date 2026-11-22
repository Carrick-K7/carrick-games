import * as THREE from 'three';
import { VILLA_STREAM, VILLA_STREAM_SECTIONS, villaStreamBasinGeometry, villaStreamBasinRows } from './villaStream.js';
import { drift, earthFinish, saturate, sediment, smooth } from './villaRiparianGround.js';
import { currentSlopes, pondSlopes, rippleNormals, slopeHelpers, waterMotion } from './villaRiparianMotion.js';
import { fitStreamSurfaceChart } from './villaStreamSurfaceChart.js';

type Profile = { shelfDepth: number; centreDepth: number; shelfOffset: number };
/** The pond passes the measured bottom at each water vertex. The stream must
 * retain precisely two boundary vertices per station (its playable polygon).
 * Reconstruct the transverse water column from the SAME bathymetric rows as
 * the bottom rather than treating its 2.5m width as a uniform tinted ribbon. */
export function riparianWaterMaterial(profile?: Profile) {
  const pond = !profile, motion = waterMotion(pond);
  const m = new THREE.MeshStandardMaterial({ color: pond ? '#547c78' : '#678987', roughness: pond ? .22 : .25,
    metalness: 0, transparent: true, opacity: 1, depthWrite: false, normalMap: rippleNormals(pond), normalMapType: THREE.ObjectSpaceNormalMap });
  m.name = pond ? 'estate-pond-water' : 'villa-stream-flowing-water';
  m.onBeforeCompile = shader => {
    shader.uniforms.villaWaterPhase = motion.phase;
    const vars = `varying vec2 villaSurfaceMetres; ${pond ? 'varying float villaDepth; varying float villaWind;' : 'varying vec4 villaSection;'}`;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${vars}\n${pond ? 'attribute float waterColumn; attribute float waterBreeze;' : 'attribute vec4 waterSection;'}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvillaSurfaceMetres = uv; ${pond ? 'villaDepth = waterColumn; villaWind = waterBreeze;' : 'villaSection = waterSection;'}`);
    const depth = profile ? `float halfSpan = abs(villaSection.z);
      float shelf = ${profile.shelfOffset.toFixed(6)};
      float column = mix(${profile.centreDepth.toFixed(6)}, ${profile.shelfDepth.toFixed(6)}, min(1.0, halfSpan / shelf))
        * clamp((1.0 - halfSpan) / (1.0 - shelf), 0.0, 1.0);` : 'float column = villaDepth;';
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${vars}\n${slopeHelpers}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${depth}
        float absorption = clamp(column * ${pond ? '1.20' : '2.20'}, 0.0, 1.0);
        diffuseColor.rgb *= mix(vec3(1.12, 1.03, 0.88), vec3(0.46, 0.73, 0.77), absorption);
        diffuseColor.a = 0.075 + 0.60 * absorption;`)
      .replace('#include <normal_fragment_maps>', `${pond ? pondSlopes : currentSlopes}
        vec3 slope = vec3(ripple.x, 1.0, ripple.y);
        normal = normalize(normalMatrix * slope);
        roughnessFactor += 0.095 * villaWaterPhase.w;`)
      .replace('#include <opaque_fragment>', `// Forward-facing facets see sky, back-facing facets see a darker bank.
        // Use the real hemisphere (also on software GL) and keep GGX sun glints.
        float grazing = 1.0 - clamp(dot(normal, geometryViewDir), 0.0, 1.0);
        float fresnel = 0.022 + 0.978 * grazing * grazing * grazing * grazing * grazing;
        #if NUM_HEMI_LIGHTS > 0
          float up = dot(reflect(-geometryViewDir, normal), hemisphereLights[0].direction);
          vec3 reflectedBankSky = mix(hemisphereLights[0].groundColor * 0.095, hemisphereLights[0].skyColor * 0.39, smoothstep(-0.09, 0.27, up));
          outgoingLight = mix(totalDiffuse, reflectedBankSky, fresnel * 0.84 + (1.0 - fresnel) * folded * 0.14) + totalSpecular;
        #endif
        diffuseColor.a += (1.0 - diffuseColor.a) * fresnel * 0.68;
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => pond ? 'villa-pond-crosswind-column-v2' : 'villa-stream-current-column-v2';
  return { material: m, update: motion.update };
}

export function addRiparianStreamWater(root: THREE.Group, geometry: (positions: number[], indices: number[]) => THREE.BufferGeometry) {
  const bed = villaStreamBasinGeometry(), colors: number[] = [], pos: number[] = [], ids: number[] = [];
  const level = VILLA_STREAM.waterY;
  VILLA_STREAM_SECTIONS.forEach((s, i) => {
    for (let j = 0; j < bed.stride; j++) {
      const k = (i * bed.stride + j) * 3, x = bed.positions[k], y = bed.positions[k + 1], z = bed.positions[k + 2];
      const bank = (Math.abs(z - s.z) - s.halfWidth) / VILLA_STREAM.bankWidth;
      const turf = smooth((bank - .07 - .55 * drift(x * .51, z * .63)) / .29);
      const c = sediment(x, y, z, level, turf); colors.push(c.r, c.g, c.b);
    }
    pos.push(s.x, level, s.z - s.halfWidth, s.x, level, s.z + s.halfWidth);
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
  const water = geometry(pos, ids), surface = new THREE.Mesh(water, finish.material);
  surface.name = 'villa-stream-water'; surface.receiveShadow = true; root.add(surface);
  return { update: finish.update, chartFrom: (bankDetails: THREE.Group) => fitStreamSurfaceChart(water, bankDetails) };
}
