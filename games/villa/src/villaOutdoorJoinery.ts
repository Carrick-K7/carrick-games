import * as THREE from 'three';
import type { VillaModelBuilder } from './villaModel.js';
import { NatureMesh, type P3 } from './villaNatureGeometry.js';

/** Sawn member with four true corner chamfers and shorter chamfers across the
 * end grain. Dimensions are measured normal to the member, even on a rake. */
export function timberMember(b: VillaModelBuilder, start: P3, end: P3, width: number, depth: number, paint: THREE.Material, bevel = .009) {
  const a = new THREE.Vector3(...start), direction = new THREE.Vector3(...end).sub(a);
  const length = direction.length(); direction.normalize();
  const xAxis = new THREE.Vector3().crossVectors(Math.abs(direction.y) > .95 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0), direction).normalize();
  const yAxis = new THREE.Vector3().crossVectors(direction, xAxis), m = new NatureMesh(), cut = Math.min(bevel, width * .21, depth * .20, length * .05);
  const outline = (t: number, inset: number) => {
    const w = width / 2 - inset, h = depth / 2 - inset, c = cut * .72;
    return [[-w + c, -h], [w - c, -h], [w, -h + c], [w, h - c], [w - c, h], [-w + c, h], [-w, h - c], [-w, -h + c]].map(([x, y]): P3 =>
      [a.x + direction.x * t + xAxis.x * x + yAxis.x * y, a.y + direction.y * t + xAxis.y * x + yAxis.y * y, a.z + direction.z * t + xAxis.z * x + yAxis.z * y]);
  };
  m.skin([[start], outline(0, cut * .60), outline(cut, 0), outline(length - cut, 0), outline(length, cut * .60), [end]]);
  const indexed = m.geometry(), flat = indexed.toNonIndexed(); indexed.dispose(); flat.computeVertexNormals();
  const pos = flat.getAttribute('position'), normal = flat.getAttribute('normal'), uv: number[] = [];
  const v = new THREE.Vector3(), n = new THREE.Vector3(), phase = Math.sin(a.x * .57 + a.y * .48 + a.z * 3.07);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos,i).sub(a); n.fromBufferAttribute(normal,i);
    const across = v.dot(xAxis), through = v.dot(yAxis);
    if (Math.abs(n.dot(direction)) > .9) uv.push(-10 + across, through);
    else uv.push(2.0 + phase + v.dot(direction), across + through * .84 + phase * .31);
  }
  flat.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2)); b.geometry(flat, paint);
}

/** Use the local saw axis on a physically modelled plank, including cross-cut
 * faces. Sub-pixel latewood is filtered out in the distance; there is no image,
 * texture object, extra draw or per-frame upload. */
export function sawnGrain(paint: THREE.MeshStandardMaterial) {
  paint.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 villaTimberUV;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvillaTimberUV = uv;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 villaTimberUV;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 saw = villaTimberUV;
        float growth = saw.x < -5.0 ? length(vec2(saw.x + 10.03, saw.y - 0.04))
          : saw.y + 0.012 * sin(saw.x * 1.37 + saw.y * 3.1) + 0.006 * sin(saw.x * 3.13 + saw.y * 11.0);
        float phase = growth * 118.0 + 1.35 * sin(growth * 16.0);
        float grain = sin(phase) * (1.0 - smoothstep(0.35, 2.6, fwidth(phase)));
        float board = sin(growth * 31.0 + saw.x * 0.22) * (1.0 - smoothstep(0.4, 2.5, fwidth(growth * 31.0)));
        diffuseColor.rgb *= 1.0 + 0.105 * grain + 0.054 * board;
      `);
  };
  paint.customProgramCacheKey = () => 'villa-sawn-grain-v1';
}

/** A sewn panel under tension, closed along its real thickness. Both panels and
 * edge welts use the identical sampler so stitches follow the loaded canvas. */
export function fabricPanel(sample: (u: number, v: number) => P3, thickness: P3, nx = 10, ny = 6) {
  const m = new NatureMesh(), stride = nx + 1, layer = stride * (ny + 1);
  for (const underside of [false, true]) for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const p = sample(i / nx, j / ny);
    m.point(underside ? [p[0] + thickness[0], p[1] + thickness[1], p[2] + thickness[2]] : p);
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const n = j * stride + i, q = n + stride;
    // sample runs across +X, then either +Z (seat) or +Y (back).
    m.tri(n, q, n + 1); m.tri(q, q + 1, n + 1);
    m.tri(n + layer, n + 1 + layer, q + layer); m.tri(q + layer, n + 1 + layer, q + 1 + layer);
  }
  const hem = (i: number, j: number) => { m.tri(i, j, i + layer); m.tri(j, j + layer, i + layer); };
  for (let i = 0; i < nx; i++) { hem(i, i + 1); hem(ny * stride + i + 1, ny * stride + i); }
  for (let j = 0; j < ny; j++) { hem((j + 1) * stride, j * stride); hem(j * stride + nx, (j + 1) * stride + nx); }
  return m.geometry();
}
