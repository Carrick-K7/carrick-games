/** Offline art tool, never imported by the game. From the repo root, against THIS checkout's built preview:
 *   VILLA_AUDIT_BASE=http://127.0.0.1:8187 VILLA_AUDIT_REVISION=<40sha> node games/villa/tests/bake-exterior-sun.mjs --write
 *   VILLA_AUDIT_BASE=http://127.0.0.1:8187 node games/villa/tests/bake-exterior-sun.mjs --check
 * No flag means --check. Nothing in the checkout is written in check mode, even on mismatch.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const destination = new URL('../src/villaSunSurveyData.ts', import.meta.url);
const dist = new URL('../../../dist/', import.meta.url);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const revisionPattern = /^[a-f0-9]{40}$/;
const requireThat = (ok, why) => { if (!ok) throw new Error(why); };

export function bakeOptions(args, env) {
  requireThat(!args.length || (args.length === 1 && ['--check', '--write'].includes(args[0])), 'Usage: bake-exterior-sun.mjs [--check | --write]');
  const mode = args[0] ?? '--check', revision = env.VILLA_AUDIT_REVISION;
  requireThat(revision === undefined ? mode !== '--write' : revisionPattern.test(revision), 'VILLA_AUDIT_REVISION must be a full lowercase source SHA (required for --write)');
  const url = new URL(env.VILLA_AUDIT_BASE ?? 'http://127.0.0.1:8187');
  requireThat(['http:', 'https:'].includes(url.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.href === url.origin + '/', 'VILLA_AUDIT_BASE must be a loopback HTTP(S) origin only');
  return { mode, origin: url.origin, revision };
}

/** Catalog, immutable descriptor, module export and actual bytes must all describe the same build.
 * The release entry hash cannot itself be an input to the generated TS: that module is bundled into entry.js. */
export function villaRelease(catalog, version, expectedRevision) {
  const entries = catalog.games?.filter(g => g.id === 'villa');
  requireThat(catalog.schemaVersion === 1 && catalog.apiVersion === 1 && entries?.length === 1, 'Expected one visible API-1 Villa in the built catalog');
  const release = entries[0];
  requireThat(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version) && release.version === version && release.apiVersion === 1 && revisionPattern.test(release.revision), `Wrong Villa release: expected local version ${version}, found ${release.version} @ ${release.revision}`);
  requireThat(expectedRevision === undefined || expectedRevision === release.revision, `Expected Villa revision ${expectedRevision}, found ${release.revision}`);
  const base = `/games/villa/${version}/${release.revision}/`;
  requireThat(release.assetBase === base && release.entry === base + 'entry.js', 'Villa catalog does not address its own canonical immutable local entry');
  return { id: 'villa', version, revision: release.revision, apiVersion: 1, base, entry: release.entry };
}

async function previewFile(url, mime) {
  const r = await fetch(url, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30_000) });
  requireThat(r.status === 200 && r.url === url && mime.test(r.headers.get('content-type') ?? ''), `Unexpected preview response for ${url}: ${r.status} ${r.headers.get('content-type')}`);
  return Buffer.from(await r.arrayBuffer());
}

async function attest({ origin, revision }) {
  const json = /^application\/json(?:;|$)/i;
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const release = villaRelease(JSON.parse(await previewFile(origin + '/games/index.json', json)), pkg.version, revision);
  const desc = release.base + 'game.json';
  const localFile = path => readFile(new URL(path.slice(1), dist));
  const [visible, local] = await Promise.all([previewFile(origin + desc, json), localFile(desc)]);
  requireThat(visible.equals(local), `Built preview descriptor does not match this checkout's dist${desc}`);
  const d = JSON.parse(visible);
  requireThat(d.schemaVersion === 1 && d.kind === 'game' && d.meta?.id === release.id && d.id === release.id && d.apiVersion === release.apiVersion && d.version === release.version && d.revision === release.revision && d.entry === 'entry.js', 'Immutable Villa descriptor disagrees with catalog');
  const [entryBytes, diskBytes] = await Promise.all([previewFile(origin + release.entry, /^(?:application|text)\/(?:java|ecma)script(?:;|$)/i), localFile(release.entry)]);
  return { release, entrySha256: verifyEntryDigest(d.files?.[d.entry], entryBytes, diskBytes), entryBytes };
}

export function verifyEntryDigest(expected, served, local) {
  requireThat(/^[a-f0-9]{64}$/.test(expected) && sha256(served) === expected && sha256(local) === expected, 'Immutable Villa entry SHA-256 mismatch: check served entry, descriptor inventory and local dist file');
  return expected;
}

const furniture = 'Villa furnishings · oak, linen & terracotta', garden = 'Villa garden', shelter = 'villa-shelter-planting';
const batch = (...parents) => [...parents, `${parents.at(-1)}/surface`];
const shelterAtlas = 'shelter/fronds-leaves-and-shoots';
const shadeTree = [shelter, 'shelter/multi-stem-shade-tree'];
const leafPaths = [[...shadeTree, 'shelter/fixed-leaf-bearing-shoots'], ...['west-heel', 'under-the-stool', 'west-return', 'field-bank'].map(n => [shelter, `shelter/drift/${n}`])];
// Exact ownership paths (some object names themselves contain slashes). A new dynamic child under
// furnishings, the garden frame, or the house does NOT get permission to cast by inheritance.
const requiredCasters = [
  batch('villa-fabric-and-joinery'), batch('villa-stair-and-balustrades'), batch('villa-mortised-pergola'),
  batch('villa-terraces-and-pool'), batch('villa-estate-fence'), batch('villa-smart-home', 'villa-room-light-fixtures'),
  [furniture, 'Batched villa details'], batch(garden), batch('villa-driving-course', 'garden-road'),
  batch('villa-estate-additions', 'estate-landscape'), batch('villa-north-stream', 'villa-stream-bank-details'),
  batch('villa-outdoor-living', 'villa-swing-frame'), [...shadeTree, 'shelter/root-flare-forks-and-twigs'], ...leafPaths,
];
// Mounted frames only: no swing pivot/seat, portable chair, pets, vehicles, scooter, doors, rain,
// water or interactive furniture. Distant woodland explicitly disables castShadow and receiveShadow.
const orchard = ['pear', 'orange', 'cherry', 'mango', 'apple', 'lemon'];
const masks = [
  ...orchard.map(s => ({ name: `orchard/${s}-sprigs`, root: garden, width: 256, height: 256, alphaTest: .32 })),
  { name: 'kitchen-garden/leaf-lamina', root: garden, width: 256, height: 256, alphaTest: .40 },
  { name: 'estate-leaves/hornbeam-ranks', root: 'villa-driving-course', width: 256, height: 256, alphaTest: .31 },
  { name: 'estate-leaves/privet-ranks', root: furniture, width: 256, height: 256, alphaTest: .31 },
  { name: shelterAtlas, root: shelter, width: 1024, height: 512, alphaTest: .31 },
];
const grassReceivers = [
  { path: ['estate-lawn'], material: 'living-lawn' },
  { path: ['estate-turf-shoulder'], material: 'living-lawn' },
  { path: ['villa-cultivated-ground', 'garden-substrate/grass-tillers'], material: 'rooted-verge-blades' },
];
export const bakeField = { left: -48, top: -70, width: 128, depth: 256, cols: 1024, rows: 2048, minY: -2, maxY: 16, sun: [-24, 26, 24] };
const recipe = {
  format: 'villa-exterior-sun-v2', field: bakeField,
  raster: 'WebGL2/SwiftShader, RGBA8 red, bottom-up, single sample, two-sided triangles, LESS depth, no blend/dither',
  alpha: 'One ray per field texel, bilinear level 0 RGBA.a * opacity (no camera-dependent LOD, alpha-to-coverage or RGB lighting)',
  packing: { name: 'rle7-highbit-run-v1', maxPacket: 128, minRun: 3 },
  requiredCasters, masks, leafPaths, shelterAtlas, grassReceivers,
  vertex: `#version 300 es
    layout(location=0) in vec3 pos; layout(location=1) in vec2 uv;
    uniform vec4 bounds; uniform vec2 sunSlope; uniform vec2 heightRange; uniform mat4 world; uniform mat3 uvMatrix;
    out float height; out vec2 tUv;
    void main(){vec3 w=(world*vec4(pos,1.)).xyz;
      vec2 u=(w.xz-sunSlope*w.y-bounds.xy)/bounds.zw;
      height=clamp((w.y-heightRange.x)/(heightRange.y-heightRange.x),0.,1.);
      gl_Position=vec4(u*2.-1.,1.-2.*height,1.); tUv=(uvMatrix*vec3(uv,1.)).xy;}`,
  fragment: `#version 300 es
    precision highp float; in float height; in vec2 tUv;
    uniform sampler2D mask; uniform float alphaTest; uniform float opacity; out vec4 outColor;
    void main(){if(alphaTest>0. && textureLod(mask,tUv,0.).a*opacity<alphaTest)discard;
      outColor=vec4(vec3(height),1.);}`,
};

// Executed in a fresh, isolated page using the exact attested module bytes. No RAF/AI simulation.
async function survey({ release, recipe }) {
  const fail = msg => { throw new Error(msg); };
  const abi = await import(release.entry);
  if (abi.id !== release.id || abi.version !== release.version || abi.apiVersion !== release.apiVersion) fail('Wrong Villa module ABI exports');
  const game = new abi.VillaGame({ canvas: document.querySelector('#c'), logicalWidth: 256, logicalHeight: 160,
    isDarkTheme: () => false, isZhLang: () => true, isPixelMode: () => false, getRecord: () => null,
    reportScore() {}, requestShellRender() {}, assetUrl: p => release.base + p });
  let gl;
  try {
    await game.prepare();
    const owner = game.scene, scene = owner?.scene;
    if (!scene || !owner.groundSwatches?.ready) fail('Built Villa scene/ground swatches unavailable');
    const decoded = await owner.groundSwatches?.ready;
    if (!['turf', 'gravel', 'timber'].every(k => decoded?.[k] === 'decoded')) fail(`Ground swatches unavailable or only fallback paint: ${JSON.stringify(decoded)}`);
    // Current shelter atlases are synchronous DataTextures. Honour a real readiness handle if
    // introduced; absence of a promise is not proof of foliage: we validate every required mesh below.
    await owner.shelterPlanting?.ready;
    scene.updateMatrixWorld(true);
    const f = recipe.field, s = owner.sun;
    if (!s?.isDirectionalLight || s.position.toArray().some((v, i) => v - s.target.position.toArray()[i] !== f.sun[i])) fail('Daylight direction disagrees with survey field');
    const surface = document.createElement('canvas'); surface.width = f.cols; surface.height = f.rows;
    gl = surface.getContext('webgl2', { antialias: false, alpha: false, depth: true, preserveDrawingBuffer: true });
    if (!gl || gl.drawingBufferWidth !== f.cols || gl.drawingBufferHeight !== f.rows || gl.getContextAttributes().antialias || gl.getParameter(gl.RED_BITS) !== 8 || gl.getParameter(gl.DEPTH_BITS) < 16) fail('Expected single-sample Red8-capable WebGL2 authoring surface with depth');
    const gpuInfo = gl.getExtension('WEBGL_debug_renderer_info'), gpu = gpuInfo && gl.getParameter(gpuInfo.UNMASKED_RENDERER_WEBGL);
    if (!/SwiftShader/i.test(gpu)) fail(`Expected the pinned software raster path, found ${gpu}`);
    const program = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, recipe.vertex], [gl.FRAGMENT_SHADER, recipe.fragment]]) {
      const shader = gl.createShader(type); gl.shaderSource(shader, src); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) fail(gl.getShaderInfoLog(shader)); gl.attachShader(program, shader);
    }
    gl.linkProgram(program); if (!gl.getProgramParameter(program, gl.LINK_STATUS)) fail(gl.getProgramInfoLog(program)); gl.useProgram(program);
    gl.viewport(0, 0, f.cols, f.rows); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS);
    gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE); gl.disable(gl.DITHER);
    gl.clearColor(0, 0, 0, 1); gl.clearDepth(1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const loc = Object.fromEntries(['bounds', 'sunSlope', 'heightRange', 'world', 'uvMatrix', 'mask', 'alphaTest', 'opacity'].map(n => [n, gl.getUniformLocation(program, n)]));
    gl.uniform4f(loc.bounds, f.left, f.top, f.width, f.depth); gl.uniform2f(loc.sunSlope, f.sun[0]/f.sun[1], f.sun[2]/f.sun[1]); gl.uniform2f(loc.heightRange, f.minY, f.maxY);
    gl.activeTexture(gl.TEXTURE0); gl.uniform1i(loc.mask, 0);
    const white = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, white);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, Uint8Array.of(255,255,255,255)); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    const buffers = [gl.createBuffer(), gl.createBuffer(), gl.createBuffer()];
    const arrayHash = new WeakMap();
    const hash = async view => {
      if (!arrayHash.has(view)) arrayHash.set(view, Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', view)), b => b.toString(16).padStart(2, '0')).join(''));
      return arrayHash.get(view);
    };
    const textures = new Map(), usedMasks = new Set();
    async function atlas(texture, spec, material) {
      if (textures.has(texture)) return textures.get(texture);
      const { data, width, height } = texture.image ?? {};
      if (!texture.isDataTexture || !(data instanceof Uint8Array) || width !== spec.width || height !== spec.height || data.length !== width * height * 4 || texture.format !== 1023 || texture.type !== 1009 || texture.premultiplyAlpha || texture.channel !== 0) fail(`Unsupported/incomplete straight RGBA8 UV0 atlas ${spec.name}`);
      let solid = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] * material.opacity >= 255 * material.alphaTest) solid++;
      if (!solid || solid === width * height) fail(`Missing cutout or pigment in ${spec.name}`);
      if (texture.matrixAutoUpdate) texture.updateMatrix();
      const matrix = Array.from(texture.matrix.elements);
      if (!matrix.every(Number.isFinite) || Math.abs(matrix[0] * matrix[4] - matrix[1] * matrix[3]) < 1e-12) fail(`Invalid UV transform on ${spec.name}`);
      const wrap = n => ({ 1000: gl.REPEAT, 1001: gl.CLAMP_TO_EDGE, 1002: gl.MIRRORED_REPEAT })[n] ?? fail(`Unsupported texture wrap ${n} on ${spec.name}`);
      const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, texture.flipY);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap(texture.wrapS)); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap(texture.wrapT));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      // UVs/transform select the actual subcharts. Keep authored mip fingerprints too (hedges
      // reserve a white selvedge at every level); a survey ray itself samples the base level.
      const mipmaps = [];
      for (const mip of texture.mipmaps ?? []) {
        if (!(mip.data instanceof Uint8Array) || mip.data.length !== mip.width * mip.height * 4) fail(`Invalid authored mip on ${spec.name}`);
        mipmaps.push([mip.width, mip.height, await hash(mip.data)]);
      }
      const info = { name: spec.name, channel: 'map.a', width, height, sha256: await hash(data), mipmaps, matrix,
        flipY: texture.flipY, wrapS: texture.wrapS, wrapT: texture.wrapT, minFilter: texture.minFilter, magFilter: texture.magFilter, generateMipmaps: texture.generateMipmaps };
      if (mipmaps.length && (mipmaps[0][0] !== width || mipmaps[0][1] !== height || mipmaps[0][2] !== info.sha256)) fail(`Rendered mip zero disagrees with base atlas on ${spec.name}`);
      const result = { tex, info }; textures.set(texture, result); return result;
    }

    const stringKey = path => JSON.stringify(path);
    const drawn = new Map(recipe.requiredCasters.map(p => [stringKey(p), 0]));
    const maskedShelter = new Set(recipe.leafPaths.map(stringKey));
    const grass = new Map(recipe.grassReceivers.map(r => [stringKey(r.path), r.material])), seenGrass = new Set();
    const candidates = [], casters = [], counts = {};
    scene.traverseVisible(o => {
      if (!o.isMesh) return;
      const path = [];
      for (let n = o; n !== scene; n = n.parent) {
        // Three UUIDs/IDs are not stable. Distinguish identical batch names by real sibling
        // order within that name, not an index polluted by unrelated movable pets, etc.
        let ordinal = 0; for (const other of n.parent.children) { if (other === n) break; if (other.name === n.name) ordinal++; }
        path.unshift([n.name, ordinal]);
      }
      const key = stringKey(path.map(([name]) => name));
      if (grass.has(key)) {
        if (!o.receiveShadow || !o.material?.visible || o.material.name !== grass.get(key) || !(o.geometry?.getAttribute('position')?.count >= 3)) fail(`Missing real grass receiver ${key}`);
        seenGrass.add(key);
      }
      if (!o.castShadow || (!drawn.has(key) && !grass.has(key))) return;
      if (Array.isArray(o.material) || o.isInstancedMesh || o.isBatchedMesh || o.isSkinnedMesh || o.morphTargetInfluences || o.customDepthMaterial || o.material.displacementMap) fail(`Unsupported caster ${key}; review before baking`);
      if (!o.material.visible || o.material.transparent) return; // No glass, translucent water, or blended overlays.
      candidates.push({ o, path, key });
    });
    for (const key of grass.keys()) if (!seenGrass.has(key)) fail(`Missing standalone grass: ${key}`);
    for (const { o, path, key } of candidates) {
      const g = o.geometry, m = o.material, pos = g.getAttribute('position'), idx = g.index, texture = m.map;
      const packedFloat = (a, size) => a?.array instanceof Float32Array && !a.isInterleavedBufferAttribute && !a.normalized && a.itemSize === size && Number.isInteger(a.count) && a.array.length === a.count * size && a.array.every(Number.isFinite);
      if (!packedFloat(pos, 3) || pos.count < 3 || !o.matrixWorld.elements.every(Number.isFinite)) fail(`Invalid caster positions/transform: ${key}`);
      if (idx && (!(idx.array instanceof Uint32Array || idx.array instanceof Uint16Array || idx.array instanceof Uint8Array) || idx.itemSize !== 1 || idx.isInterleavedBufferAttribute || idx.normalized || idx.count !== idx.array.length || idx.array.some(i => i >= pos.count))) fail(`Invalid caster indices: ${key}`);
      const available = idx?.count ?? pos.count, start = g.drawRange.start, count = Math.min(g.drawRange.count, available - start);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(count) || start < 0 || count < 3 || start % 3 || count % 3) fail(`Invalid triangle draw range: ${key}`);
      if (!Number.isFinite(m.alphaTest) || m.alphaTest < 0 || m.alphaTest >= 1 || !(m.opacity > 0 && m.opacity <= 1) || m.alphaMap || m.alphaHash || m.wireframe || (m.vertexColors && g.getAttribute('color')?.itemSize === 4)) fail(`Unsupported material alpha/depth semantics: ${key} ${m.name}`);
      const spec = recipe.masks.find(t => t.name === texture?.name);
      if (maskedShelter.has(key) && spec?.name !== recipe.shelterAtlas) fail(`Shelter leaf geometry lost its atlas: ${key}`);
      let mask = null, uv = null;
      if (spec || m.alphaTest > 0) {
        if (!spec || spec.root !== path[0][0] || spec.alphaTest !== m.alphaTest) fail(`Wrong/missing masked asset: ${key} ${texture?.name ?? '(no map)'} alphaTest=${m.alphaTest}`);
        uv = g.getAttribute('uv');
        if (!packedFloat(uv, 2) || uv.count !== pos.count) fail(`Missing packed alpha UVs: ${key} ${spec.name}`);
        mask = await atlas(texture, spec, m);
        // A builder can supply all-zero UVs for uncharted stock. That is NOT a usable leaf chart.
        // Check transformed UVs: hornbeam/privet reserve raw U=2..3, then translate by -2.
        const a = mask.info.matrix, uvs = uv.array;
        let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity;
        for (let i = 0; i < uvs.length; i += 2) {
          const x = a[0]*uvs[i] + a[3]*uvs[i+1] + a[6], y = a[1]*uvs[i] + a[4]*uvs[i+1] + a[7];
          minU = Math.min(minU,x); maxU = Math.max(maxU,x); minV = Math.min(minV,y); maxV = Math.max(maxV,y);
        }
        if (Math.min(1,maxU) - Math.max(0,minU) < 1/spec.width || Math.min(1,maxV) - Math.max(0,minV) < 1/spec.height) fail(`Collapsed/off-atlas chart: ${spec.name} ${key}`);
        usedMasks.add(spec.name);
      }
      gl.uniform1f(loc.alphaTest, m.alphaTest); gl.uniform1f(loc.opacity, m.opacity); gl.bindTexture(gl.TEXTURE_2D, mask?.tex ?? white);
      gl.uniformMatrix3fv(loc.uvMatrix, false, mask?.info.matrix ?? [1,0,0,0,1,0,0,0,1]); gl.uniformMatrix4fv(loc.world, false, o.matrixWorld.elements);
      const attribute = (n, a) => { gl.bindBuffer(gl.ARRAY_BUFFER, buffers[n]); gl.bufferData(gl.ARRAY_BUFFER, a.array, gl.STATIC_DRAW); gl.enableVertexAttribArray(n); gl.vertexAttribPointer(n, a.itemSize, gl.FLOAT, false, 0, 0); };
      attribute(0, pos); if (uv) attribute(1, uv); else { gl.disableVertexAttribArray(1); gl.vertexAttrib2f(1, 0, 0); }
      if (idx) {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers[2]); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx.array, gl.STATIC_DRAW);
        gl.drawElements(gl.TRIANGLES, count, { 1: gl.UNSIGNED_BYTE, 2: gl.UNSIGNED_SHORT, 4: gl.UNSIGNED_INT }[idx.array.BYTES_PER_ELEMENT], start * idx.array.BYTES_PER_ELEMENT);
      } else gl.drawArrays(gl.TRIANGLES, start, count);
      const shape = async a => a ? { type: a.array.constructor.name, size: a.itemSize, count: a.count, sha256: await hash(a.array) } : null;
      casters.push({ path, world: Array.from(o.matrixWorld.elements), range: [start,count], positions: await shape(pos), index: await shape(idx), alphaUV: await shape(uv),
        material: { type: m.type, name: m.name, alphaTest: m.alphaTest, opacity: m.opacity, side: m.side, shadowSide: m.shadowSide, alphaToCoverage: m.alphaToCoverage, atlas: mask?.info ?? null } });
      drawn.set(key, (drawn.get(key) ?? 0) + 1); counts[path[0][0]] = (counts[path[0][0]] ?? 0) + 1;
    }
    const missing = [...[...drawn].filter(([, n]) => !n).map(([k]) => k), ...recipe.masks.filter(t => !usedMasks.has(t.name)).map(t => t.name)];
    if (missing.length) fail('Incomplete fixed estate; missing casters/atlases: ' + missing.join(', '));
    const buf = new Uint8Array(f.cols * f.rows * 4); gl.readPixels(0, 0, f.cols, f.rows, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const error = gl.getError(); if (error || gl.isContextLost()) fail(`Survey GL error ${error} or lost context`);
    const raw = new Uint8Array(f.cols * f.rows); let active = 0;
    for (let i = 0; i < raw.length; i++) { raw[i] = buf[4*i]; if (raw[i]) active++; }
    const house = raw[Math.floor((-10-f.top)*f.rows/f.depth)*f.cols + Math.floor((4-f.left)*f.cols/f.width)];
    if (active < .02 * raw.length || active > .98 * raw.length || house/255*(f.maxY-f.minY)+f.minY <= 6) fail(`Unusable sunlight field (active=${active}, house=${house})`);
    // Binary base64 transport only, not a UTF-8 decode. Works on older pinned local Chromium too.
    let binary = ''; for (let i = 0; i < raw.length; i += 24_000) binary += String.fromCharCode(...raw.subarray(i, i+24_000));
    return { counts, masks: [...usedMasks], casters, active, rawBase64: btoa(binary), gpu };
  } finally { gl?.getExtension('WEBGL_lose_context')?.loseContext(); await game.destroy(); }
}

export function packHeightfield(raw) {
  const { maxPacket, minRun } = recipe.packing, out = [];
  const run = i => { let j = i+1; while (j < raw.length && j-i < maxPacket && raw[j] === raw[i]) j++; return j-i; };
  for (let i = 0; i < raw.length;) {
    const n = run(i);
    if (n >= minRun) { out.push(128+n-1, raw[i]); i += n; }
    else { const start = i; i += n; while (i < raw.length && i-start < maxPacket && run(i) < minRun) i++; out.push(i-start-1, ...raw.subarray(start,i)); }
  }
  return Buffer.from(out);
}

export function surveySource(casters, packed) {
  const sourceSha256 = sha256(JSON.stringify({ recipe, casters })), encodedSha256 = sha256(packed);
  const source = `// Generated by tests/bake-exterior-sun.mjs --write. Red8 sun heights, bottom row first.\n` +
    `// SHA-256: ordered caster inputs + recipe; encoded = RLE bytes before base64.\n` +
    `export const VILLA_SUN_SOURCE_SHA256 = '${sourceSha256}';\n` +
    `export const VILLA_SUN_ENCODED_SHA256 = '${encodedSha256}';\n` +
    `export const VILLA_SUN_BYTES: string = '${packed.toString('base64')}';\n`;
  return { source, sourceSha256, encodedSha256 };
}

async function main() {
  const opt = bakeOptions(process.argv.slice(2), process.env);
  const { release, entrySha256, entryBytes } = await attest(opt);
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ serviceWorkers: 'block' }), errors = [];
    const fixture = opt.origin + '/__bake-villa';
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', async route => {
      const u = route.request().url();
      if (u === fixture) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><link rel="icon" href="data:,"><main id="gameApp"><canvas id="c"></canvas></main>' });
      // Import exactly what we hashed, even if the preview is rebuilt mid-run. Villa's current
      // art is bundled. A new networked asset/chunk needs its own attestation before it is allowed.
      if (u === opt.origin + release.entry) return route.fulfill({ contentType: 'text/javascript', body: entryBytes });
      errors.push(`Unexpected network asset: ${u}`); return route.abort();
    });
    await page.goto(fixture);
    const { rawBase64, casters, ...stats } = await page.evaluate(survey, { release, recipe });
    requireThat(!errors.length, errors.join('\n'));
    const raw = Buffer.from(rawBase64, 'base64'); requireThat(raw.length === recipe.field.cols * recipe.field.rows, 'Incomplete readback');
    const packed = packHeightfield(raw), { source, sourceSha256, encodedSha256 } = surveySource(casters, packed);
    console.log(JSON.stringify({ mode: opt.mode, version: release.version, revision: release.revision, entrySha256, sourceSha256, encodedSha256, bytes: packed.length, chromium: browser.version(), ...stats }, null, 2));
    if (opt.mode === '--write') {
      // During local iteration the same revision can be rebuilt with different dirty-worktree
      // bytes. Do not overwrite the source with an obsolete snapshot if the preview moved.
      const current = await attest(opt);
      requireThat(current.entrySha256 === entrySha256, 'Built Villa entry changed during the survey; nothing written');
      await writeFile(destination, source);
    } else requireThat(await readFile(destination, 'utf8') === source, 'Stale/inconsistent villaSunSurveyData.ts (input fingerprint, encoded bytes/digest or header); nothing written. Review the build before using --write.');
  } finally { await browser.close(); }
}

if (import.meta.main) await main();
