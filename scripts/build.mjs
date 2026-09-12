import { build } from 'vite';
import { checkBoundaries } from './check.mjs';
import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gameAssetBase, isReleaseRelativePath, parseGameMeta, parseGameRelease } from '../packages/game-sdk/src/catalog.ts';
import { DIST, ROOT, fileDigests, gameWorkspaces, json, posix, shellWorkspace, sourceRevision, workspaceTargets } from './workspaces.mjs';

const format = value => `${JSON.stringify(value, null, 2)}\n`;
export async function atomicJson(path, value) {
  await mkdir(resolve(path, '..'), { recursive: true });
  const staging = `${path}.${process.pid}.tmp`;
  await writeFile(staging, format(value));
  await rename(staging, path);
}
function requireLocalAsset(meta, files) {
  for (const path of [meta.icon, meta.cover?.src].filter(Boolean)) {
    if (!isReleaseRelativePath(path) || !files[path]) throw new Error(`${meta.id}: missing or invalid metadata asset ${path}`);
  }
}
export function catalogEntry(artifact) {
  const assetBase = gameAssetBase(artifact.id, artifact.version, artifact.revision);
  const meta = structuredClone(artifact.meta);
  meta.icon = `${assetBase}${meta.icon}`;
  if (meta.cover) meta.cover.src = `${assetBase}${meta.cover.src}`;
  return {
    ...meta, id: artifact.id, version: artifact.version, revision: artifact.revision,
    apiVersion: artifact.apiVersion, assetBase, entry: `${assetBase}${artifact.entry}`,
    styles: artifact.styles.map(path => `${assetBase}${path}`),
    generation: 0, sequence: 0, handledRevision: artifact.revision,
  };
}
export async function buildGame(workspace, revision = sourceRevision()) {
  await checkBoundaries([workspace]);
  const { id, dir, pkg } = workspace;
  const base = gameAssetBase(id, pkg.version, revision);
  const outDir = join(DIST, base.slice(1));
  await build({
    configFile: false, root: dir, base: './', publicDir: join(dir, 'public'), logLevel: 'warn',
    build: {
      outDir, emptyOutDir: true, target: 'es2020', sourcemap: false,
      lib: { entry: join(dir, 'src', 'index.ts'), formats: ['es'], fileName: () => 'entry.js' },
      rollupOptions: { output: { entryFileNames: 'entry.js', chunkFileNames: 'chunks/[name]-[hash].js', assetFileNames: 'assets/[name]-[hash][extname]' } },
    },
  });
  const files = await fileDigests(outDir, ['game.json']);
  const meta = parseGameMeta(await json(join(dir, 'game.json')));
  requireLocalAsset(meta, files);
  if (!files['entry.js']) throw new Error(`Missing built game entry: ${id}`);
  const styles = Object.keys(files).filter(path => path.endsWith('.css'));
  const artifact = { schemaVersion: 1, kind: 'game', apiVersion: 1, id, version: pkg.version, revision, entry: 'entry.js', styles, files, meta };
  parseGameRelease(catalogEntry(artifact), 'https://games.carrick7.com');
  await atomicJson(join(outDir, 'game.json'), artifact);
  console.log(`Built ${id}@${pkg.version}: ${base} (${Object.keys(files).length} files)`);
  return artifact;
}
export async function buildShell(revision = sourceRevision()) {
  const workspace = await shellWorkspace();
  await checkBoundaries([workspace]);
  const { dir, pkg } = workspace;
  const base = `/shell/${revision}/`;
  const outDir = join(DIST, 'shell', revision);
  await build({
    configFile: false, root: dir, publicDir: join(dir, 'public'), base, logLevel: 'warn',
    build: { outDir, emptyOutDir: true, target: 'es2020', sourcemap: false, manifest: false },
  });
  const html = await readFile(join(outDir, 'index.html'), 'utf8');
  const entry = html.match(/<script\b[^>]*\bsrc="([^"]+\.js)"/)?.[1];
  if (!entry?.startsWith(base)) throw new Error('Shell entry is not immutable-addressed');
  // Installation identity stays at /, while every icon belongs to this shell.
  // Root /brand is reserved for the one-time legacy-page compatibility snapshot.
  const installManifest = await json(join(outDir, 'app.webmanifest'));
  for (const icon of installManifest.icons ?? []) {
    const path = typeof icon.src === 'string' ? icon.src.replace(/^\//, '') : '';
    if (!isReleaseRelativePath(path) || !existsSync(join(outDir, path))) throw new Error(`Missing shell installation icon: ${icon.src}`);
    icon.src = `${base}${path}`;
  }
  await atomicJson(join(outDir, 'app.webmanifest'), installManifest);
  // Preserve the documented deployment compatibility entry without loading the shell twice.
  await mkdir(join(outDir, 'dist'), { recursive: true });
  await writeFile(join(outDir, 'dist', 'main.js'), `export * from ${JSON.stringify(entry)};\n`);
  const files = await fileDigests(outDir, ['manifest.json']);
  const manifest = { schemaVersion: 1, kind: 'shell', version: pkg.version, revision, apiVersions: [1], files };
  await atomicJson(join(outDir, 'manifest.json'), manifest);
  await installPreviewShell(outDir);
  console.log(`Built shell@${pkg.version}: ${base}`);
  return manifest;
}

/** This only assembles ignored local test output. Production serves the retained release directory. */
export async function installPreviewShell(source) {
  await mkdir(DIST, { recursive: true });
  for (const entry of await readdir(DIST, { withFileTypes: true })) {
    if (entry.name !== 'games' && entry.name !== 'shell') await rm(join(DIST, entry.name), { recursive: true, force: true });
  }
  for (const entry of await readdir(source, { withFileTypes: true })) {
    await cp(join(source, entry.name), join(DIST, entry.name), { recursive: true });
  }
}
export async function assembleCatalog(artifacts, replaceAll = false) {
  const path = join(DIST, 'games', 'index.json');
  const old = !replaceAll && existsSync(path) ? await json(path) : { schemaVersion: 1, apiVersion: 1, generation: 0, games: [] };
  const entries = new Map(old.games.map(game => [game.id, game]));
  for (const artifact of artifacts) entries.set(artifact.id, catalogEntry(artifact));
  const games = [...entries.values()].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const catalog = { ...old, schemaVersion: 1, apiVersion: 1, games };
  await atomicJson(path, catalog);
  return catalog;
}
async function main() {
  const args = process.argv.slice(2);
  const targets = await workspaceTargets(args);
  if (!targets.length) throw new Error('No game workspaces found');
  const revision = sourceRevision();
  const artifacts = [];
  for (const workspace of targets) {
    if (workspace.id === 'shell') await buildShell(revision);
    else artifacts.push(await buildGame(workspace, revision));
  }
  if (artifacts.length) await assembleCatalog(artifacts, !args.length || args.includes('all'));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
