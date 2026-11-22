import { roomGrid as g } from './villaInteriorDaylightGrid.js';

/** Count-bounded records, not general-purpose asset decompression. Distances
 * count samples so the stored little-endian words are platform-independent. */
export function unpackRoomBand(base64: string, size: number, bytes: 1 | 2) {
  const s = atob(base64), raw = new Uint16Array(size);
  let i = 0, out = 0;
  while (i < s.length) {
    const tag = s.charCodeAt(i++), copy = tag >= 128, n = (tag & 127) + (copy ? 3 : 1);
    if (out + n > size || i + (copy ? 2 : n * bytes) > s.length) throw new Error('Invalid room daylight packet');
    if (copy) {
      const back = s.charCodeAt(i) + s.charCodeAt(i + 1) * 256; i += 2;
      if (!back || back > out) throw new Error('Invalid room daylight distance');
      for (let j = 0; j < n; j++, out++) raw[out] = raw[out - back]!;
    } else {
      for (let j = 0; j < n; j++) {
        const low = s.charCodeAt(i++);
        raw[out++] = low + (bytes === 2 ? s.charCodeAt(i++) * 256 : 0);
      }
    }
  }
  if (out !== size) throw new Error('Incomplete room daylight field');
  return raw;
}

/** Beams have door- and mullion-sized edges; bounced light varies much more
 * slowly. Reconstruct its two broad coefficients ONCE into the beam texture.
 * No second sampler, cross-storey bleed, or ongoing ray tests. */
export function expandRoomField(beam: string, broad: string) {
  const s = g.returnStep, nx = 1 + Math.ceil((g.nx-1)/s), nz = 1 + Math.ceil((g.nz-1)/s);
  const field = unpackRoomBand(beam, g.nx*g.nz*2*g.layers, 1), back = unpackRoomBand(broad, nx*nz*2*g.layers, 2);
  let i = 0;
  for (let k=0; k<2*g.layers; k++) for (let z=0; z<g.nz; z++) {
    const iz = Math.floor(z/s), z0 = (k*nz+iz)*nx, z1 = z0 + (iz+1 < nz ? nx : 0), bz = z%s, az = s-bz;
    for (let x=0; x<g.nx; x++, i++) {
      const x0 = Math.floor(x/s), x1 = Math.min(nx-1,x0+1), bx = x%s, ax = s-bx;
      const a = back[z0+x0]!, b = back[z0+x1]!, c = back[z1+x0]!, d = back[z1+x1]!;
      const sky = Math.round(((a>>5)*ax*az + (b>>5)*bx*az + (c>>5)*ax*bz + (d>>5)*bx*bz)/(s*s));
      const bounce = Math.round(((a&31)*ax*az + (b&31)*bx*az + (c&31)*ax*bz + (d&31)*bx*bz)/(s*s));
      field[i] = field[i]! << 11 | sky << 6 | bounce << 1 | 1;
    }
  }
  return field;
}
