/** Completely authored binary fixtures. Never ships with game public assets. */
const text = (value: string) => new TextEncoder().encode(value);
const put16 = (b: Uint8Array, at: number, value: number) => new DataView(b.buffer).setUint16(at, value, true);
const put32 = (b: Uint8Array, at: number, value: number) => new DataView(b.buffer).setUint32(at, value, true);
const b64 = (bytes: Uint8Array) => btoa(Array.from(bytes, value => String.fromCharCode(value)).join(''));
export function fixturePalette() { const bytes = new Uint8Array(768); bytes.set([63, 0, 31], 3); bytes.set([20, 35, 19], 6); bytes.set([48, 39, 10], 9); return bytes; }
export function fixtureShp(width = 16, height = 24, color = 1) {
  const bytes = new Uint8Array(32 + width * height); put16(bytes, 2, width); put16(bytes, 4, height); put16(bytes, 6, 1);
  put16(bytes, 12, width); put16(bytes, 14, height); bytes[16] = 1; put32(bytes, 28, 32); bytes.fill(color, 32); return bytes;
}
export function fixtureLargeShp() {
  const row = new Uint8Array([21,0,1,0,255,0,255,0,255,0,255,0,255,0,255,0,255,0,255,0,7]);
  const bytes = new Uint8Array(32 + row.length * 2048); put16(bytes,2,2048);put16(bytes,4,2048);put16(bytes,6,1);
  put16(bytes,12,2048);put16(bytes,14,2048);bytes[16]=3;put32(bytes,28,32);
  for(let y=0;y<2048;y++)bytes.set(row,32+y*row.length);
  return bytes;
}
export function fixtureTmp() {
  const bytes = new Uint8Array(972); put32(bytes, 0, 1); put32(bytes, 4, 1); put32(bytes, 8, 60); put32(bytes, 12, 30); put32(bytes, 16, 20);
  bytes.fill(2, 72); return bytes;
}
function overlay(section: string, entries: [number, number, number][]) {
  const raw = new Uint8Array(262144).fill(section === 'OverlayPack' ? 255 : 0); for (const [x,y,value] of entries) raw[x + y * 512] = value;
  const chunks: number[] = [];
  for (let base = 0; base < raw.length; base += 8192) {
    const commands: number[] = [];
    for (let i = base; i < base + 8192;) { let end = i + 1; while (end < base + 8192 && raw[end] === raw[i]) end++;
      commands.push(0xfe, (end-i) & 255, (end-i) >>> 8, raw[i]!); i = end; }
    commands.push(0x80); chunks.push(commands.length & 255, commands.length >>> 8, 0, 32, ...commands);
  }
  return `[${section}]\n1=${b64(new Uint8Array(chunks))}\n`;
}
export function fixtureMap() {
  const raw = new Uint8Array(4), lzo = new Uint8Array([21, ...raw, 17, 0, 0]), packed = new Uint8Array(lzo.length + 4);
  put16(packed, 0, lzo.length); put16(packed, 2, 4); packed.set(lzo, 4);
  return text(`[Basic]\nName=Authored local fixture\n[Map]\nSize=0,0,12,12\nTheater=TEMPERATE\n[IsoMapPack5]\n1=${b64(packed)}\n[Waypoints]\n0=12012\n`
    + overlay('OverlayPack', [[19,12,0],[19,13,0],[20,12,0]]) + overlay('OverlayDataPack', []));
}
export function classicFixtureFiles(includeMap = true): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>([['unittem.pal',fixturePalette()],['gapowr.shp',fixtureShp()]]);
  if (includeMap) {
    files.set('fixture.map', fixtureMap()); files.set('temperat.ini',text('[General]\nClearTile=0\n[TileSet0000]\nFileName=clear\nTilesInSet=1\n'));
    files.set('isotem.pal',fixturePalette()); files.set('clear01.tem',fixtureTmp());
    files.set('rules.ini', text('[OverlayTypes]\n0=GOLD01\n[GOLD01]\nTiberium=yes\nImage=gold01\n'));
    files.set('gold01.shp', fixtureShp(6, 6, 3));
  }
  return files;
}
