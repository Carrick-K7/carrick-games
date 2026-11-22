/** Offline, CPU-only transport study. Regenerate from the repository root with
 *   node_modules/.bin/vite-node games/villa/tests/villaInteriorDaylightBake.ts --write-room-field
 * No scene, renderer, browser, runtime asset loading or random seed/time dependence. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { VILLA_GARAGE_EXTENT as G } from '../src/villaEstateLayout.js';
import { VILLA_BLOCKS, VILLA_RAMPS, villaTreadLayers } from '../src/villaWorld.js';
import { VILLA_HOME_LIGHTS } from '../src/villaHome.js';
import { indoorVolumes, roomGrid as g } from '../src/villaInteriorDaylightGrid.js';

type P = [number, number, number];
type Box = { lo: P; hi: P; rho: number; glassAxis: number };
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const sunLength = Math.hypot(g.dx, 1, g.dz), sun: P = [g.dx / sunLength, 1 / sunLength, g.dz / sunLength];
const rel = (p: P, d: P, t: number): P => [p[0] + d[0] * t, p[1] + d[1] * t, p[2] + d[2] * t];

/** Structural blocks already include the wall returns, cap/sill, glazing, and
 * BOTH cuts in each slab. Use the real stair treads: collision ramp volumes
 * would seal the open soffit. No movable door/car/animal/furniture silhouette. */
export function opticalShell() {
  const boxes: Box[] = [];
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, rho: number, glassAxis = -1) =>
    boxes.push({ lo: [x - w / 2, y - h / 2, z - d / 2], hi: [x + w / 2, y + h / 2, z + d / 2], rho, glassAxis });
  const albedo = { plaster: .72, stone: .55, oak: .43, glass: .10, bronze: .22, roof: .51 };
  for (const b of VILLA_BLOCKS) {
    if (b.assembly === 'canopy') {
      // Folded porch tray now reaches the left-hand fin; see villaEnvelope.
      const left = Math.min(...VILLA_BLOCKS.filter(v => v.assembly === 'fin').map(v => v.x - v.w / 2)) - .106;
      const right = b.x + b.w / 2 + .055;
      box((right + left) / 2, b.y, b.z, right - left, b.h, b.d, .35);
    } else box(b.x, b.y, b.z, b.w, b.h, b.d, albedo[b.material], b.material === 'glass' ? (b.w < b.d ? 0 : 2) : -1);
  }
  // This paving is built in villaPoolside, not the house's timber slab list.
  // Without it, a downward ray in the back of the garage sees sunlit earth.
  box((G.minX+G.maxX)/2,-.015,(G.minZ+G.maxZ)/2,G.maxX-G.minX,.06,G.maxZ-G.minZ,.50);
  for (const r of VILLA_RAMPS) for (let i = 0; i < 12; i++) {
    const z = r.startZ + (r.endZ - r.startZ) * (i + .5) / 12;
    const y = r.bottom + (r.top - r.bottom) * (i + 1) / 12, bottom = villaTreadLayers(y).bodyBottom;
    box((r.minX + r.maxX) / 2, (y + bottom) / 2, z, r.maxX - r.minX, y - bottom, Math.abs(r.endZ - r.startZ) / 12, .50);
  }
  for (const base of [0, 3.6]) box(1.2, base + 1.7, -6.2, 3.8, .2, 1.4, .46);
  // Fixed opaque treatments: acoustic cloth covers the north cinema window;
  // gathered linen only flanks the master/guest panes, not their clear centres.
  box(22.60, 1.56, -17.96, 9.10, 2.99, .06, .10);
  box(22.60, 1.948, -17.708, 5.57, 2.264, .082, .78);
  for (const x of [-11.05, -8.97, -5.72, -2.8]) box(x, 5.13, 8.72, .32, 2.77, .052, .68);
  for (const x of [-21.9, -14.5]) box(x, 5.13, -17.96, .43, 2.77, .052, .68);
  // Full-height fitted wardrobe backs, tops and gables; not solid boxes over
  // their aisles. These actually receive daylight entering the west window.
  for (const [x, z, width, inward] of [[-21.55, -8.52, 4.10, 1], [-18.8, -.50, 8.50, -1]]) {
    box(x, 4.92, z - inward * .28, width, 2.64, .075, .26);
    box(x, 6.19, z, width, .06, .62, .45);
    for (const side of [-1, 1]) box(x + side * width / 2, 4.92, z, .045, 2.64, .61, .45);
  }
  const shades = ['living','tea-room','east-lounge','master','guest','reading-hall','study','massage'];
  for (const r of VILLA_HOME_LIGHTS) if (r.id !== 'garden' && r.id !== 'terrace') for (const p of r.fixtures) {
    const bell = shades.includes(r.id);
    const width = bell ? .58 : r.id === 'garage' ? 2.45 : r.id === 'snooker' ? 1.9 : r.id.startsWith('gallery') ? .48 : .86;
    box(p.x, p.y + .028, p.z, width, .06, bell ? width : .23, .45);
  }
  return boxes;
}

type Node = { lo: P; hi: P; left?: Node; right?: Node; leaves?: Box[] };
function tree(parts: Box[]): Node {
  const lo: P = [Infinity,Infinity,Infinity], hi: P = [-Infinity,-Infinity,-Infinity];
  for (const b of parts) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i],b.lo[i]); hi[i] = Math.max(hi[i],b.hi[i]); }
  if (parts.length <= 5) return { lo, hi, leaves: parts };
  const ext = hi.map((t,i) => t-lo[i]), axis = ext.indexOf(Math.max(...ext));
  parts.sort((a,b) => a.lo[axis] + a.hi[axis] - b.lo[axis] - b.hi[axis]);
  const mid = parts.length >> 1; return { lo, hi, left: tree(parts.slice(0,mid)), right: tree(parts.slice(mid)) };
}

export function roomTracer(boxes = opticalShell()) {
  const root = tree([...boxes]), stack: Node[] = [];
  // Slab intersection. Track nearest ENTRY (and its outward normal); after a
  // glass crossing resume at EXIT so the two faces of a pane only filter once.
  function ray(origin: P, direction: P, limit = 160) {
    const [dx,dy,dz] = direction, ix = 1 / (dx || 1e-15), iy = 1 / (dy || 1e-15), iz = 1 / (dz || 1e-15);
    let [x,y,z] = origin, tau = 1, advanced = 0;
    for (let crossings = 0; crossings < 12; crossings++) {
      let nearest = limit - advanced, normal = 0, exit = 0, hit: Box | undefined;
      stack.length = 0; stack.push(root);
      const intersect = (b: Node | Box, leaf: boolean) => {
        const x0 = (b.lo[0]-x)*ix, x1 = (b.hi[0]-x)*ix, y0 = (b.lo[1]-y)*iy, y1 = (b.hi[1]-y)*iy, z0 = (b.lo[2]-z)*iz, z1 = (b.hi[2]-z)*iz;
        const a = Math.min(x0,x1), c = Math.min(y0,y1), e = Math.min(z0,z1);
        const enter = Math.max(a,c,e), leave = Math.min(Math.max(x0,x1), Math.max(y0,y1), Math.max(z0,z1));
        if (leave < Math.max(enter, .0001) || enter >= nearest) return false;
        if (leaf) {
          nearest = Math.max(0, enter); exit = leave; hit = b as Box;
          normal = enter === a ? (dx > 0 ? -1 : 1) : enter === c ? (dy > 0 ? -2 : 2) : (dz > 0 ? -3 : 3);
        }
        return true;
      };
      while (stack.length) {
        const n = stack.pop()!; if (!intersect(n,false)) continue;
        if (n.leaves) for (const b of n.leaves) intersect(b,true);
        else stack.push(n.left!,n.right!);
      }
      if (!hit) return { tau, surface: null, normal: 0, t: limit };
      const surface = hit as Box;
      if (surface.glassAxis < 0) return { tau, surface, normal, t: advanced + nearest };
      // Neutral solar-control glazing with stronger Fresnel loss at grazing
      // incidence. A walkable door has no pane at all.
      tau *= .81 * (1 - .93 * (1 - Math.abs(direction[surface.glassAxis])) ** 5);
      advanced += exit + .0005;
      if (advanced >= limit) return { tau, surface: null, normal: 0, t: limit };
      x = origin[0] + advanced * dx; y = origin[1] + advanced * dy; z = origin[2] + advanced * dz;
    }
    throw new Error('Unexpected glass crossing count');
  }
  const sunlight = (p: P) => { const r = ray(p,sun); return r.surface ? 0 : r.tau; };
  return { ray, sunlight };
}

type Tracer = ReturnType<typeof roomTracer>;
const N = 128, goldenTurn = .618033988749895;
const directions: P[] = Array.from({length:N}, (_,i) => {
  const y = 1 - 2*(i+.5)/N, a = Math.PI*2*((i*goldenTurn) % 1), r = Math.sqrt(1-y*y);
  return [Math.cos(a)*r, y, Math.sin(a)*r];
});
function hash(t: number) { t = Math.imul(t ^ (t >>> 16), 0x21f0aaad); t = Math.imul(t ^ (t >>> 15), 0x735a2d97); return ((t ^ (t >>> 15)) >>> 0) / 4294967296; }
// Cosine-law scattering for three diffuse returns. The angular sequence is
// shared by neighbouring probes, not independent speckle painted onto a wall.
const scatter: P[][][] = Array.from({length:3}, (_,bounce) => Array.from({length:6}, (_,axisSign) =>
  directions.map((_,i) => {
    const k = 1 + i + bounce*N + axisSign*3*N, r = Math.sqrt(hash(k)), phi = 2*Math.PI*hash(k+9999), axis = axisSign >> 1;
    const d: P = [0,0,0]; d[axis] = (axisSign % 2 ? -1 : 1)*Math.sqrt(1-r*r);
    d[(axis+1)%3] = r*Math.cos(phi); d[(axis+2)%3] = r*Math.sin(phi); return d;
  })));
export function diffuseTransfer(tracer: Tracer, origin: P) {
  let sky = 0, reflectedSun = 0;
  for (let i = 0; i < N; i++) {
    let p = origin, d = directions[i], throughput = 1;
    for (let b = 0; b <= 3; b++) {
      const t = tracer.ray(p,d); throughput *= t.tau;
      if (!t.surface) {
        // Outside earth/courtyard below the horizon returns light, not open sky.
        sky += throughput * (d[1] >= 0 ? 1 : .24);
        if (d[1] < 0) reflectedSun += throughput * .24 * sun[1];
        break;
      }
      const axis = Math.abs(t.normal)-1, sign = Math.sign(t.normal);
      p = rel(p,d,t.t); p[axis] += sign * .003;
      throughput *= t.surface.rho;
      const cosine = sun[axis] * sign;
      if (cosine > 0) reflectedSun += throughput * cosine * tracer.sunlight(p);
      if (b < 3) d = scatter[b][axis*2 + (sign < 0 ? 1 : 0)][i];
    }
  }
  return [clamp(sky/N,0,1), clamp(reflectedSun/N,0,1)] as const;
}

export function bakeRoomField() {
  const tracer = roomTracer(), words = new Uint16Array(g.nx*g.nz*2*g.layers);
  const nearest = new Float32Array(words.length).fill(Infinity), apron = g.returnStep*g.pitch+.01;
  const pitch = g.pitch * 4, probes = new Map<number, { p: P; light: readonly [number,number] }>();
  for (let vi = 0; vi < indoorVolumes.length; vi++) {
    const v = indoorVolumes[vi];
    function air(x: number, h: number, z: number): P {
      return [clamp(x,v.x0+.124,v.x1-.124), v.floor+clamp(h,g.low,g.high), clamp(z,v.z0+.124,v.z1-.124)];
    }
    function probe(ix: number, k: number, iz: number) {
      const id = (((vi*8+k)*128 + iz)*128 + ix);
      let found = probes.get(id);
      if (!found) {
        const p = air(v.x0+ix*pitch, g.low+k*(g.high-g.low)/3, v.z0+iz*pitch);
        found = { p, light: diffuseTransfer(tracer,p) }; probes.set(id,found);
      }
      return found;
    }
    for (let k = 0; k < g.layers; k++) {
      const f = k/(g.layers-1), h = g.low+f*(g.high-g.low), hy = f*3;
      const k0 = Math.min(2,Math.floor(hy)), fy = hy-k0;
      for (let iz = 0; iz < g.nz; iz++) for (let ix = 0; ix < g.nx; ix++) {
        const x = g.x0 + ix*g.pitch + g.dx*(h-g.low)-v.shift, z = g.z0 + iz*g.pitch + g.dz*(h-g.low);
        const gap = Math.max(v.x0-x,x-v.x1,v.z0-z,z-v.z1,0), index = ((v.bank*g.layers+k)*g.nz+iz)*g.nx+ix;
        if (gap > apron || gap >= nearest[index]) continue;
        nearest[index] = gap;
        // Extrapolate one diffuse texel at the silhouette, but never OVER the
        // neighbouring house or garage interior. A wall is not an outdoor probe.
        const p = air(x,h,z), cx = (p[0]-v.x0)/pitch, cz = (p[2]-v.z0)/pitch, i0 = Math.floor(cx), j0 = Math.floor(cz);
        let sky = 0, bounce = 0, sum = 0, uncutSky = 0, uncutBounce = 0;
        for (let j=0;j<2;j++) for (let n=0;n<2;n++) for (let l=0;l<2;l++) {
          const w = (j?cz-j0:1-(cz-j0))*(n?fy:1-fy)*(l?cx-i0:1-(cx-i0));
          if (w < .00001) continue;
          const a = probe(i0+l,k0+n,j0+j);
          uncutSky += w*a.light[0]; uncutBounce += w*a.light[1];
          // Reconstruct only from probes in optical contact. This retains the
          // doorway gradient without borrowing the room NEXT to a solid jamb.
          const dx = a.p[0]-p[0], dy = a.p[1]-p[1], dz = a.p[2]-p[2], length = Math.hypot(dx,dy,dz);
          if (length > .02 && tracer.ray(p,[dx/length,dy/length,dz/length],length-.003).surface) continue;
          sum += w; sky += w*a.light[0]; bounce += w*a.light[1];
        }
        sky = sum > .001 ? sky/sum : uncutSky; bounce = sum > .001 ? bounce/sum : uncutBounce;
        // Stratified coverage reduces aliasing of the 50 mm pressure caps. No
        // ray marching or shape iteration survives into an actual play frame.
        let direct = 0;
        for (const ox of [-.32,0,.32]) for (const oz of [-.32,0,.32]) direct += tracer.sunlight(air(x+ox*g.pitch,h,z+oz*g.pitch));
        const code = (t: number) => Math.round(31*clamp(t,0,1));
        words[index] = code(direct/9)<<11 | code(Math.sqrt(sky))<<6 | code(Math.sqrt(bounce))<<1 | 1;
      }
    }
  }
  return words;
}

/** Bounded word records: [n-1,little-endian literals...] or [128+n-3,
 * distanceLow,distanceHigh]. Using prior words (not a native-endian byte
 * dump) also makes decoding independent of the authoring CPU. */
export function packRoomField(src: Uint16Array, bytes: 1 | 2) {
  const out: number[] = [], last = new Map<number,number>(); let start = 0;
  const key = (i: number) => src[i]*0x100000000 + src[i+1]*0x10000 + src[i+2];
  const flush = (to: number) => { while (start < to) { const n = Math.min(128,to-start); out.push(n-1); for(let j=0;j<n;j++,start++) { out.push(src[start]&255); if (bytes === 2) out.push(src[start]>>>8); } } };
  for (let i = 0; i < src.length;) {
    let n = 0, back = 0;
    if (i+2<src.length) {
      const k = key(i), prev = last.get(k); last.set(k,i);
      if (prev !== undefined && i-prev <= 65535) {
        back = i-prev;
        while (n < 130 && i+n < src.length && src[i+n] === src[i+n-back]) n++;
      }
    }
    if (n < 3) { i++; continue; }
    flush(i); out.push(128+n-3,back&255,back>>>8);
    for(let j=1;j<n && i+j+2<src.length;j++)last.set(key(i+j),i+j);
    start=i+=n;
  }
  flush(src.length); return Buffer.from(out);
}

export const opticalFingerprint = () => createHash('sha256').update(JSON.stringify([g,indoorVolumes,opticalShell()])).digest('hex');
if (process.argv.includes('--write-room-field') || process.argv.includes('--check-room-field')) {
  const t = performance.now(), words = bakeRoomField(), s = g.returnStep;
  const beam = packRoomField(words.map(w => w>>>11),1);
  const nx = Math.ceil((g.nx-1)/s)+1, nz = Math.ceil((g.nz-1)/s)+1, returns = new Uint16Array(nx*nz*2*g.layers);
  for (let k=0;k<2*g.layers;k++) for (let z=0;z<nz;z++) for (let x=0;x<nx;x++)
    returns[(k*nz+z)*nx+x] = words[(k*g.nz+Math.min(g.nz-1,z*s))*g.nx+Math.min(g.nx-1,x*s)]>>>1 & 1023;
  const broad = packRoomField(returns,2);
  const source = `// Generated by tests/villaInteriorDaylightBake.ts --write-room-field. No live ray tracing.\n` +
    `export const VILLA_ROOM_INPUT = '${opticalFingerprint()}';\n` +
    `export const VILLA_ROOM_BEAM = '${beam.toString('base64')}';\nexport const VILLA_ROOM_RETURN = '${broad.toString('base64')}';\n`;
  const path = new URL('../src/villaInteriorDaylightData.ts',import.meta.url);
  if (process.argv.includes('--write-room-field')) await writeFile(path,source);
  else if (await readFile(path,'utf8') !== source) throw new Error('Stale interior daylight study; review the new optical geometry and regenerate');
  console.log(`Room daylight: ${words.length} texels, ${beam.length+broad.length} encoded bytes, bake ${((performance.now()-t)/1000).toFixed(1)} s`);
}
