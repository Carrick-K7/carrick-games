import * as THREE from 'three';
import { VILLA_STREAM, VILLA_STREAM_BRIDGE, VILLA_STREAM_SECTIONS, villaStreamSectionAt } from './villaStream.js';
import { smooth } from './villaRiparianGround.js';

/** Sample the actual stone batch ONCE. A high cobble in (or just below) the
 * water builds a wake on its own bank, trailing downstream. Buried gravel,
 * exposed dry turf and reed tips are not obstacles in this surface chart. */
function stoneHeads(details: THREE.Group) {
  const { minX, maxX, sampleMetres: step, waterY } = VILLA_STREAM;
  const heads = new Float32Array(2 * (1 + Math.round((maxX - minX) / step)));
  for (const mesh of details.children) {
    if (!(mesh instanceof THREE.Mesh) || mesh.material.name !== 'stream/eroded-bars-and-stone') continue;
    const p = mesh.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i); if (y < waterY - .085) continue;
      const x = p.getX(i), section = villaStreamSectionAt(x); if (!section) continue;
      const across = p.getZ(i) - section.z, wet = section.halfWidth - Math.abs(across);
      if (wet <= .10) continue;
      const k = 2 * Math.round((x - minX) / step) + (across > 0 ? 1 : 0);
      heads[k] = Math.max(heads[k], smooth((wet - .10) / .19) * smooth((y - waterY + .085) / .14));
    }
  }
  return heads;
}

export function fitStreamSurfaceChart(water: THREE.BufferGeometry, details: THREE.Group) {
  const { minX, sampleMetres: step } = VILLA_STREAM, rows = VILLA_STREAM_SECTIONS;
  const heads = stoneHeads(details), uv: number[] = [], section: number[] = [];
  let arc = 0;
  for (let i = 0; i < rows.length; i++) {
    const s = rows[i], a = rows[Math.max(0, i - 1)], b = rows[Math.min(rows.length - 1, i + 1)];
    arc += Math.hypot(s.x - a.x, s.z - a.z);
    const len = Math.hypot(b.x - a.x, b.z - a.z), tx = (b.x - a.x) / len, tz = (b.z - a.z) / len;
    for (const side of [-1, 1]) {
      const d = s.halfWidth * side, south = side > 0 ? 1 : 0;
      // The two polygon vertices are at the SAME x, not on a normal cut of
      // the centreline. Project their real offsets into the local stream frame.
      uv.push(arc + tz * d, tx * d);
      // Quiet bank shear under/just beyond the timber crossing; its landward
      // abutments do not stand in the middle of the flow like bridge piers.
      let lee = .56 * smooth(1 - Math.abs(s.x - VILLA_STREAM_BRIDGE.maxX - .38) / 2.15);
      for (let j = Math.max(0, Math.ceil((s.x - 2.0 - minX) / step)); j <= Math.min(heads.length / 2 - 1, Math.floor((s.x + .48 - minX) / step)); j++) {
        const dx = s.x - (minX + j * step) - .20;
        lee = Math.max(lee, heads[2 * j + south] * smooth(1 - Math.abs(dx) / (dx < 0 ? .68 : 1.8)));
      }
      section.push(tx, tz, side, lee);
    }
  }
  water.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  water.setAttribute('waterSection', new THREE.Float32BufferAttribute(section, 4));
}
