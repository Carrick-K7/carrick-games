import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createVillaInteriorDaylight, VILLA_INTERIOR_DAYLIGHT_GLSL as glsl } from '../src/villaInteriorDaylight.js';
import { indoorVolumes, roomGrid as g } from '../src/villaInteriorDaylightGrid.js';
import { VILLA_ROOM_BEAM, VILLA_ROOM_INPUT, VILLA_ROOM_RETURN } from '../src/villaInteriorDaylightData.js';
import { unpackRoomBand } from '../src/villaInteriorDaylightUnpack.js';
import { villaAtmosphere } from '../src/villaHome.js';
import { opticalFingerprint, packRoomField, roomTracer } from './villaInteriorDaylightBake.js';

let room: ReturnType<typeof createVillaInteriorDaylight>;
beforeAll(() => { room = createVillaInteriorDaylight(); });
afterAll(() => room.dispose());

/** Independent trilinear read of the bytes delivered to WebGL. The ray queries
 * below, unlike this read, never consult the texture. Values are linear energy. */
function sample(x: number, y: number, z: number) {
  const v = indoorVolumes.find(v => x >= v.x0 && x <= v.x1 && z >= v.z0 && z <= v.z1 && y >= v.bottom && y < v.top);
  if (!v) return { direct: 1, sky: 1, bounce: 0, inside: false };
  const h = Math.max(g.low, Math.min(g.high,y-v.floor))-g.low;
  const X = (x+v.shift-g.dx*h-g.x0)/g.pitch, Z = (z-g.dz*h-g.z0)/g.pitch;
  const Y = v.bank*g.layers + h*(g.layers-1)/(g.high-g.low), data = room.map.image.data!;
  let direct = 0, sky = 0, bounce = 0;
  for (let j=0;j<2;j++) for (let k=0;k<2;k++) for (let i=0;i<2;i++) {
    const ix = Math.floor(X)+i, iy = Math.floor(Y)+j, iz = Math.floor(Z)+k;
    const weight = (1-Math.abs(ix-X))*(1-Math.abs(iy-Y))*(1-Math.abs(iz-Z));
    if (!weight) continue;
    const w = data[(iy*g.nz+iz)*g.nx+ix];
    direct += weight*(w>>>11)/31; sky += weight*((w>>>6)&31)/31; bounce += weight*((w>>>1)&31)/31;
  }
  return { direct, sky:sky*sky, bounce:bounce*bounce, inside:true };
}

describe('surveyed room daylight', () => {
  it('binds the baked study to the actual current structural/permanent optical geometry', () => {
    expect(opticalFingerprint()).toBe(VILLA_ROOM_INPUT);
  });

  it('admits the sun through the west pool doors, attenuates glazing, and stops at measured openings', () => {
    expect(sample(-23.5,.14,3.1).direct).toBeGreaterThan(.95); // waist of west living door
    expect(sample(-23.5,1.10,-3.5).direct).toBeGreaterThan(.95); // kitchen service door
    const glazed = sample(-23.5,.4,-14).direct;
    expect(glazed).toBeGreaterThan(.65); expect(glazed).toBeLessThan(.87); // tea-room insulated window
    expect(sample(-17.6,.4,-14).direct).toBeLessThan(.03); // same room, now beneath opaque storey 2
    expect(sample(-12,.08,2).direct).toBeLessThan(.03);
    expect(sample(-15.7,4.6,-17.8).direct).toBeLessThan(.03); // big NORTH bedroom window ≠ a sun source
  });

  it('casts a slanted lintel onto standing-height receivers, and respects balcony and porch soffits', () => {
    expect(sample(-23.5,1.65,3.1).direct).toBeGreaterThan(.95);
    expect(sample(-23.5,2.88,3.1).direct).toBeLessThan(.04); // same XZ, different ray through door head
    expect(sample(-17.6,.08,7.7).direct).toBeGreaterThan(.55);
    const soffit = sample(-17.6,3.34,7.7);
    expect(soffit.direct).toBeLessThan(.03); expect(soffit.bounce).toBeGreaterThan(.035);
    expect(sample(-7,.05,7.6).direct).toBeLessThan(.03); // front glass shaded by the real balcony slab
    expect(sample(.1,.1,8.7).direct).toBeGreaterThan(.5); expect(sample(-.1,2.55,8.8).direct).toBeLessThan(.03);
    // Continuous penumbra rather than switching masks at eye/desk/floor bands.
    const through = Array.from({length:96},(_,i) => sample(-23.5,1.60+i*.015,3.1).direct);
    expect(through.filter(v=>v>.10 && v<.9).length).toBeGreaterThan(5);
    expect(Math.max(...through.slice(1).map((v,i)=>Math.abs(v-through[i])))).toBeLessThan(.09);
  });

  it('communicates sky through actual cased doors and glazing, not adjacent solid wall', () => {
    const tracer = roomTracer();
    const door = tracer.ray([-10,5.05,-4.85],[-1,0,0]); // ensuite → closet door → west glass
    expect(door.surface).toBeNull(); expect(door.tau).toBeCloseTo(.81,2);
    expect(tracer.ray([-10,5.05,-6.7],[-1,0,0]).surface).not.toBeNull();
    const through = sample(-12.6,5.05,-4.85), behind = sample(-12.6,5.05,-6.7);
    expect(through.sky).toBeGreaterThan(behind.sky*2); expect(through.direct).toBe(0);
    expect(sample(-16,4.9,-9.2).sky).toBeGreaterThan(sample(-12,4.9,-9.2).sky*1.8); // guest/dressing door
    // The floor over ordinary rooms is continuous; stair and lift cuts are not sealed.
    expect(tracer.ray([-1.2,3.25,-1.4],[0,1,0],.6).surface).not.toBeNull();
    expect(tracer.ray([2.1,3.25,-1.4],[0,1,0],.6).surface).toBeNull();
    expect(tracer.ray([4.55,3.25,-5.82],[0,1,0],.6).surface).toBeNull();
  });

  it('finds bright shaded windows, covered cinema glazing, and darker far galleries and garage bays', () => {
    const north = sample(12,4.6,-17.8), deep = sample(12,4.6,-13);
    expect(north.direct).toBe(0); expect(deep.direct).toBe(0); expect(north.sky).toBeGreaterThan(deep.sky*3);
    expect(sample(27.7,1.5,-14.8).sky).toBeGreaterThan(sample(22.7,1.5,-17.5).sky*3);
    expect(sample(5.4,4.6,8).sky).toBeGreaterThan(sample(6.8,4.8,-11.8).sky*4);
    // The paving blocks the lower hemisphere: no bright 'outside ground' leaking up into rear bays.
    expect(sample(46,.23,.8).sky).toBeGreaterThan(sample(46,.8,-8.2).sky*3);
    expect(sample(-22.3,3.34,3.2).bounce).toBeGreaterThan(sample(-15,3.34,3).bounce*1.7);
  });

  it('keeps balcony, courtyard, terrace, garage roof and space beneath the floors neutral', () => {
    for (const p of [[-8,3.63,10.3],[-17,1.65,19.5],[-24.41,.6,3],[12,7.22,-4],[44,3.62,-2],[45,1.3,3],[0,-.11,2]])
      expect(sample(p[0],p[1],p[2])).toEqual({ direct:1, sky:1, bounce:0, inside:false });
    expect(sample(2.2,8.5,.65).inside).toBe(true); expect(sample(2.2,8.5,.65).direct).toBeGreaterThan(.9);
    expect(sample(2.2,10.72,.65).inside).toBe(false); // roof surface above stair pavilion
  });

  it('responds continuously to the real Home sun, rain and night without rebuilding maps', () => {
    const texture = room.map.image.data, version = room.map.version, state = room.uniforms.villaRoomClimate.value;
    const source = room.uniforms.villaApertureRadiance.value;
    const update = (darkness: number,rain: number) => { const a= villaAtmosphere({darkness,rain});room.setAtmosphere(a.sun,a.rain,a.night); };
    update(0,0); const day = source.clone(); expect(state.x).toBe(1); expect(day.z).toBeGreaterThan(day.x);
    update(.43,0); expect(source.y).toBeLessThan(day.y*.76); expect(source.x).toBeGreaterThan(source.z);
    update(0,1); expect(state.x).toBeLessThan(1); expect(state.z).toBeLessThan(.5); expect(source.y).toBeGreaterThan(day.y*.55);
    update(1,0); expect(state.x).toBeLessThan(.45); expect(state.y).toBeLessThan(.20); expect(source.length()).toBe(0);
    const t0 = performance.now();
    for (let k=0;k<10000;k++) room.setAtmosphere(2.9,k/10000,0);
    expect(performance.now()-t0).toBeLessThan(300); // uniform writes only, no CPU illumination per update
    expect(room.map.version).toBe(version); expect(room.map.image.data).toBe(texture);
    for (const [s,r,n] of [[0,0,0],[NaN,Infinity,-Infinity]]) {
      room.setAtmosphere(s,r,n); expect(state.toArray()).toEqual([0,0,0]); expect(source.length()).toBe(0);
    }
    update(0,0);
  });

  it('uses one filtered, instance-owned small texture, including diffuse and metal returns', () => {
    const t0=performance.now(), other=createVillaInteriorDaylight();
    expect(performance.now()-t0).toBeLessThan(500); // includes cold reconstruction; atlas work is bounded by size
    expect(other.map.image.data!.byteLength).toBeLessThan(800_000);
    expect(Math.max(other.map.image.width,other.map.image.height,other.map.image.depth)).toBeLessThanOrEqual(256);
    expect(Buffer.from(VILLA_ROOM_BEAM,'base64').length+Buffer.from(VILLA_ROOM_RETURN,'base64').length).toBeLessThan(60_000);
    expect(other.map.type).toBe(THREE.UnsignedShort5551Type);
    expect(other.map.magFilter).toBe(THREE.LinearFilter);expect(other.map.minFilter).toBe(THREE.LinearFilter);expect(other.map.generateMipmaps).toBe(false);
    expect(glsl.match(/\btexture\s*\(/g)).toHaveLength(1);expect(glsl).not.toMatch(/\b(?:for|while)\s*\(|PointLight|totalEmissiveRadiance/); // one fetch, never modifies lamps
    expect(glsl.indexOf('else return vec3(1.0, 1.0, 0.0)')).toBeLessThan(glsl.indexOf('texture('));
    expect(other.map !== room.map && other.map.image.data !== room.map.image.data).toBe(true);
    expect(Buffer.from((other.map.image.data as Uint16Array).buffer).equals(Buffer.from((room.map.image.data as Uint16Array).buffer))).toBe(true);
    other.setAtmosphere(0,1,1);expect(room.uniforms.villaRoomClimate.value.x).toBe(1);
    const released=vi.fn();other.map.addEventListener('dispose',released); other.dispose();other.dispose();
    expect(released).toHaveBeenCalledOnce(); expect(other.map.image.data).toBeNull(); expect(other.uniforms.villaRoomField.value).toBeNull();
    expect(room.map.image.data).not.toBeNull();
  });

  it('validates bounded, repeatable word and byte records before upload', () => {
    for (const bytes of [1,2] as const) {
      const arr=Uint16Array.from({length:570}, (_,i)=>i<129 || i>381 ? (bytes===1?22:999) : i%125);
      const packed=packRoomField(arr,bytes); expect(unpackRoomBand(packed.toString('base64'),arr.length,bytes)).toEqual(arr);
      expect(packRoomField(arr,bytes).equals(packed)).toBe(true);
    }
    for (const [p,n] of [[[128,0,0],3],[[128,1,0],3],[[0],1],[[0,5],2],[[1,4,5],1]] as const)
      expect(()=>unpackRoomBand(Buffer.from(p).toString('base64'),n,1)).toThrow();
  });
});
