import * as THREE from 'three';
import type { VillaModelBuilder } from './villaModel.js';
import { NatureMesh, type Collar, type P3 } from './villaNatureGeometry.js';
import { shootU, shootV } from './villaTreelineAtlas.js';

type Paint = THREE.Material;
export interface WoodlandPaint { bark: Paint; birch: Paint; dark: Paint; oak: Paint; lime: Paint; pine: Paint }

/** Curvature is part of the branch in object space. Its roll and transverse
 * axis remain the same from the bridge, from above, and from the other bank.
 * Each textured surface carries just ONE leafy shoot, not a crown silhouette. */
class Sprays {
  readonly positions: number[] = []; private readonly uv: number[] = [];
  private readonly tones: number[] = []; private readonly indices: number[] = []; private readonly bends: number[] = [];
  add(p: P3, q: P3, halfWidth: number, tile: number, roll: number, arch: number, sweep: number, tone: number, simple: boolean) {
    const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2], horiz = Math.hypot(dx, dz), len = Math.hypot(horiz, dy);
    if (len < .0001) return;
    const hx = horiz < .0001 ? 1 : dx / horiz, hz = horiz < .0001 ? 0 : dz / horiz;
    const sx = -hz, sz = hx, ux = -hx * dy / len, uy = horiz / len, uz = -hz * dy / len;
    const first = this.positions.length / 3, sections = simple ? 1 : 2;
    for (let row = 0; row <= sections; row++) {
      const t = row / sections, arc = row === 1 && sections === 2 ? 1 : 0;
      const cx = p[0] + dx * t + (arch * ux + sweep * sx) * arc, cy = p[1] + dy * t + arch * uy * arc;
      const cz = p[2] + dz * t + (arch * uz + sweep * sz) * arc;
      const a = roll * (.76 + .40 * t), co = Math.cos(a), si = Math.sin(a), width = halfWidth * (.80 + .20 * arc);
      for (const sign of [-1, 1]) {
        this.positions.push(cx + sign * width * (sx * co + ux * si), cy + sign * width * uy * si, cz + sign * width * (sz * co + uz * si));
        this.uv.push(shootU(tile, (sign + 1) / 2), shootV(tile, t)); this.tones.push(tone * (.87 + t * .18 + sign * .035));
        // A sprig has a volume of little leaves, not the uniform normal of
        // paper. Its two lit shoulders face away from the rib into that volume.
        const tilt = (t - .38) * .67;
        this.bends.push(sign * .83 * (sx * co + ux * si) + dx / len * tilt,sign * .83 * uy * si + dy / len * tilt,
          sign * .83 * (sz * co + uz * si) + dz / len * tilt);
      }
      if (row) { const j = first + (row - 1) * 2; this.indices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
    }
  }
  geometry(shaded: boolean) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2)); g.setIndex(this.indices);
    if (shaded) g.setAttribute('color', new THREE.Float32BufferAttribute(this.tones.flatMap(v => [v,v,v]), 3));
    g.computeVertexNormals();
    const normal = g.getAttribute('normal');
    for (let i = 0; i < normal.count; i++) {
      const nx = normal.getX(i) + this.bends[i * 3], ny = normal.getY(i) + this.bends[i * 3 + 1], nz = normal.getZ(i) + this.bends[i * 3 + 2];
      const d = Math.hypot(nx,ny,nz) || 1; normal.setXYZ(i,nx / d,ny / d,nz / d);
    }
    return g;
  }
}

export class TreeForm {
  private readonly wood = new Map<Paint, NatureMesh>(); private readonly foliage = new Map<Paint, Sprays>();
  tube(paint: Paint, path: Collar[], sides: number, flute = 0, phase = 0) {
    let wood = this.wood.get(paint); if (!wood) { wood = new NatureMesh(); this.wood.set(paint, wood); }
    wood.stem(path, sides, flute, phase, true);
  }
  spray(paint: Paint, p: P3, q: P3, halfWidth: number, tile: number, roll: number, arch: number, sweep: number, light: number, simple = false) {
    let part = this.foliage.get(paint); if (!part) { part = new Sprays(); this.foliage.set(paint, part); }
    part.add(p, q, halfWidth, tile, roll, arch, sweep, light, simple);
  }
  finish(b: VillaModelBuilder, scale: number, maxRadius = Infinity) {
    // Scale the complete specimen (including its scaffold), never clip a limb.
    // The surveyed foreground individuals must retain their old lateral bounds.
    const parts = [...this.wood, ...this.foliage]; let reach = 0;
    if (Number.isFinite(maxRadius)) for (const [,part] of parts) for (let i = 0; i < part.positions.length; i += 3) {
      reach = Math.max(reach, Math.hypot(part.positions[i], part.positions[i + 2]));
    }
    const spread = reach > maxRadius ? scale * maxRadius / reach : scale;
    for (const [mat, part] of parts) {
      const g = part.geometry((mat as THREE.MeshStandardMaterial).vertexColors);
      g.scale(spread, scale, spread); b.geometry(g, mat);
    }
  }
}
