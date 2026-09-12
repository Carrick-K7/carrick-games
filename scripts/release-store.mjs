import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { gameAssetBase, isReleaseRelativePath, parseCatalog, parseGameRelease, REVISION_PATTERN, VERSION_PATTERN } from '../packages/game-sdk/src/catalog.ts';

export const RELEASE_ORIGIN = 'https://games.carrick7.com';
const MAX_JSON = 16 * 1024 * 1024;
const MAX_FILE = 1024 * 1024 * 1024;
const MAX_FILES = 20000;
const DIGEST = /^[0-9a-f]{64}$/;
const validInteger = value => Number.isSafeInteger(value) && value >= 0;
const requireValue = (value, message) => { if (!value) throw new Error(message); };
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(item => canonical(item)).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function releaseURL(path) {
  requireValue(typeof path === 'string' && path.startsWith('/') && !path.startsWith('//'), 'Expected an origin-relative release path');
  const url = new URL(path, RELEASE_ORIGIN);
  requireValue(url.origin === RELEASE_ORIGIN && url.pathname === path && !url.search && !url.hash, 'Noncanonical or off-origin release URL');
  return url.href;
}
async function request(path, fetcher) {
  const response = await fetcher(releaseURL(path), { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30000) });
  requireValue(!response.url || new URL(response.url).origin === RELEASE_ORIGIN, 'Off-origin release response');
  return response;
}
async function responseBytes(response, maximum) {
  let size = 0;
  const blocks = [];
  for await (const value of response.body) {
    const block = Buffer.from(value);
    size += block.length;
    requireValue(size <= maximum, 'Release response exceeds size limit');
    blocks.push(block);
  }
  return Buffer.concat(blocks);
}
export async function fetchReleaseJSON(path, { fetcher = fetch, allow404 = false } = {}) {
  const response = await request(path, fetcher);
  if (allow404 && response.status === 404) { await response.body?.cancel(); return null; }
  requireValue(response.status === 200, `Release request failed: ${path} (${response.status})`);
  const value = JSON.parse((await responseBytes(response, MAX_JSON)).toString('utf8'));
  requireValue(value && typeof value === 'object' && !Array.isArray(value), `Invalid JSON object: ${path}`);
  return value;
}
function promotionState(value, label) {
  requireValue(value && validInteger(value.generation) && validInteger(value.sequence), `Invalid ${label} generation/sequence`);
  requireValue(value.handledRevision === null || REVISION_PATTERN.test(value.handledRevision ?? ''), `Invalid ${label} handled revision`);
}
export function validateProductionSnapshot(catalog, manifest) {
  requireValue(manifest?.schemaVersion === 1 && REVISION_PATTERN.test(manifest.revision ?? ''), 'Invalid production shell manifest');
  const missing = catalog === null;
  catalog ??= { schemaVersion: 1, apiVersion: 1, generation: 0, games: [] };
  requireValue(validInteger(catalog.generation), 'Invalid catalog generation');
  const parsed = parseCatalog(catalog, RELEASE_ORIGIN);
  requireValue(parsed.rejected.length === 0 && parsed.catalog.games.length === catalog.games.length, `Invalid published game catalog: ${parsed.rejected.join('; ')}`);
  for (const game of catalog.games) promotionState(game, game.id);
  if (catalog.tombstones !== undefined) {
    requireValue(catalog.tombstones && typeof catalog.tombstones === 'object' && !Array.isArray(catalog.tombstones), 'Invalid tombstones');
    for (const [id, state] of Object.entries(catalog.tombstones)) {
      requireValue(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) && !catalog.games.some(game => game.id === id), 'Invalid tombstone identity');
      promotionState(state, id);
    }
  }
  if (catalog.shell) promotionState(catalog.shell, 'shell');
  const bootstrap = !catalog.shell || catalog.shell.legacy === true;
  if (bootstrap) {
    requireValue(manifest.kind !== 'shell', 'Production shell/catalog changed during snapshot');
    requireValue(!manifest.kind, 'Invalid legacy shell manifest');
    requireValue(!catalog.shell || catalog.shell.revision === manifest.revision, 'Production shell/catalog changed during snapshot');
  } else {
    requireValue(!missing && catalog.shell.active !== false, 'Modern shell has no active catalog state');
    requireValue(manifest.kind === 'shell' && catalog.shell.revision === manifest.revision && catalog.shell.version === manifest.version, 'Production shell/catalog changed during snapshot');
    requireValue(Array.isArray(manifest.apiVersions) && manifest.apiVersions.includes(1) && canonical(manifest.apiVersions) === canonical(catalog.shell.apiVersions), 'Unsupported production shell protocol');
    requireValue(catalog.games.every(game => manifest.apiVersions.includes(game.apiVersion)), 'Live shell/game protocol mismatch');
  }
  return { catalog, manifest, bootstrap };
}
/** Retry only the catalog/current sampling race. Network, HTTP and malformed JSON errors never become a source fallback. */
export async function fetchProductionSnapshot({ fetcher = fetch } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const catalog = await fetchReleaseJSON('/games/index.json', { fetcher, allow404: true });
    const manifest = await fetchReleaseJSON('/manifest.json', { fetcher });
    try { return validateProductionSnapshot(catalog, manifest); }
    catch (error) {
      if (!String(error.message).includes('changed during snapshot') || attempt === 2) throw error;
    }
  }
  throw new Error('Unable to pin production snapshot');
}
function normalizeArtifactGame(artifact) {
  const assetBase = gameAssetBase(artifact.id, artifact.version, artifact.revision);
  const meta = structuredClone(artifact.meta);
  meta.icon = `${assetBase}${meta.icon}`;
  if (meta.cover) meta.cover.src = `${assetBase}${meta.cover.src}`;
  return parseGameRelease({ ...meta, id: artifact.id, version: artifact.version, revision: artifact.revision, apiVersion: artifact.apiVersion,
    assetBase, entry: `${assetBase}${artifact.entry}`, styles: (artifact.styles ?? []).map(path => `${assetBase}${path}`),
    generation: 0, sequence: 0, handledRevision: null }, RELEASE_ORIGIN);
}
function withoutFence(release) {
  const { generation, sequence, handledRevision, ...content } = release;
  return content;
}
export function validateArtifact(artifact, reference, kind) {
  const game = kind === 'game';
  requireValue(artifact?.schemaVersion === 1 && artifact.kind === kind && artifact.revision === reference.revision && REVISION_PATTERN.test(artifact.revision), 'Artifact identity mismatch');
  requireValue(VERSION_PATTERN.test(artifact.version ?? '') && artifact.version === reference.version, 'Artifact version mismatch');
  requireValue(artifact.files && typeof artifact.files === 'object' && !Array.isArray(artifact.files), 'Missing artifact inventory');
  const files = Object.entries(artifact.files);
  requireValue(files.length > 0 && files.length <= MAX_FILES, 'Invalid artifact file count');
  const descriptor = game ? 'game.json' : 'manifest.json';
  for (const [path, digest] of files) {
    requireValue(isReleaseRelativePath(path) && path !== descriptor && !path.split('/').some(part => part.startsWith('.')) && typeof digest === 'string' && DIGEST.test(digest), 'Invalid inventoried release file');
  }
  if (game) {
    requireValue(artifact.id === reference.id && artifact.apiVersion === 1, 'Game protocol/identity mismatch');
    requireValue(artifact.meta?.id === undefined || artifact.meta.id === artifact.id, 'Metadata identity mismatch');
    requireValue(isReleaseRelativePath(artifact.entry) && artifact.entry.endsWith('.js') && artifact.files[artifact.entry], 'Missing game entry');
    requireValue(Array.isArray(artifact.styles ?? []) && (artifact.styles ?? []).every(path => isReleaseRelativePath(path) && path.endsWith('.css') && artifact.files[path]), 'Missing game stylesheet');
    requireValue(isReleaseRelativePath(artifact.meta?.icon) && artifact.files[artifact.meta.icon], 'Missing game icon');
    if (artifact.meta?.cover) requireValue(isReleaseRelativePath(artifact.meta.cover.src) && artifact.files[artifact.meta.cover.src], 'Missing game cover');
    requireValue(canonical(withoutFence(normalizeArtifactGame(artifact))) === canonical(withoutFence(parseGameRelease(reference, RELEASE_ORIGIN))), 'Descriptor differs from pinned catalog');
  } else {
    requireValue(canonical(artifact) === canonical(reference), 'Shell descriptor differs from pinned manifest');
    requireValue(Array.isArray(artifact.apiVersions) && artifact.apiVersions.includes(1) && artifact.files['index.html'], 'Invalid shell artifact');
  }
  return artifact;
}
async function downloadFile(path, destination, expected, fetcher) {
  const response = await request(path, fetcher);
  requireValue(response.status === 200, `Immutable file missing: ${path} (${response.status})`);
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.${randomUUID()}.incoming`;
  const handle = await open(temporary, 'wx', 0o644);
  const hash = createHash('sha256');
  let size = 0;
  try {
    for await (const chunk of response.body) {
      const block = Buffer.from(chunk);
      size += block.length;
      requireValue(size <= MAX_FILE, 'Artifact file exceeds size limit');
      hash.update(block);
      await handle.writeFile(block);
    }
    requireValue(hash.digest('hex') === expected, `Immutable file checksum mismatch: ${path}`);
    await handle.close();
    await rename(temporary, destination);
  } finally {
    await handle.close();
    await rm(temporary, { force: true });
  }
}
export async function installPublishedArtifact(reference, kind, { dist, fetcher = fetch } = {}) {
  requireValue(typeof dist === 'string', 'Test store directory is required');
  const prefix = kind === 'game' ? gameAssetBase(reference.id, reference.version, reference.revision) : `/shell/${reference.revision}/`;
  requireValue(REVISION_PATTERN.test(reference.revision ?? ''), 'Invalid pinned revision');
  const descriptor = kind === 'game' ? 'game.json' : 'manifest.json';
  const artifact = validateArtifact(await fetchReleaseJSON(prefix + descriptor, { fetcher }), reference, kind);
  const directory = join(dist, prefix.slice(1));
  await rm(directory, { recursive: true, force: true });
  const files = Object.entries(artifact.files);
  let cursor = 0;
  let failed = false;
  const results = await Promise.allSettled(Array.from({ length: Math.min(6, files.length) }, async () => {
    try {
      while (!failed && cursor < files.length) {
        const [path, digest] = files[cursor++];
        await downloadFile(prefix + path, join(directory, path), digest, fetcher);
      }
    } catch (error) { failed = true; throw error; }
  }));
  const failure = results.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, descriptor), `${JSON.stringify(artifact, null, 2)}\n`);
  return { directory, artifact };
}
