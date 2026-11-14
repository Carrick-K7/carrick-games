import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, DIST, fileDigests } from '../../../scripts/workspaces.mjs';
import { canonical, fetchProductionSnapshot, installPublishedArtifact } from '../../../scripts/release-store.mjs';
import { atomicJson, buildShell } from '../../../scripts/build.mjs';

// Local QA only. This is not ci verify/publish and never mutates production.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
assert.equal(root, ROOT); assert.equal(DIST, join(root, 'dist'));
const evidence = join(root, '.ci/local-input-preparation');
const ownerFile = join(evidence, 'store-ownership.json');
await mkdir(evidence, { recursive: true });
if (existsSync(DIST)) {
  assert.ok(existsSync(ownerFile), 'Refuse to replace a store not created by this fixture');
  assert.equal(JSON.parse(await readFile(ownerFile, 'utf8')).dist, DIST);
  assert.ok(!(await lstat(DIST)).isSymbolicLink(), 'Test store cannot be a symlink');
} else {
  await writeFile(ownerFile, JSON.stringify({ root, dist: DIST, scope: 'isolated local Shell preparation QA' }, null, 2) + '\n', { flag: 'wx' });
}
const assertOwned = async path => {
  const absolute = resolve(path); assert.ok(absolute.startsWith(DIST + sep));
  for (let cursor = absolute; cursor !== root; cursor = dirname(cursor)) {
    if (existsSync(cursor)) assert.ok(!(await lstat(cursor)).isSymbolicLink(), `No symlink under owned output: ${cursor}`);
  }
  console.log(`Verified owned output target: ${absolute}`);
};
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const snapshot = await fetchProductionSnapshot();
assert.equal(snapshot.bootstrap, false);
assert.deepEqual(snapshot.catalog.games.map(game => game.id).sort(), ['cs', 'gacha', 'minesweeper', 'parking', 'red-homestead', 'texashold', 'villa']);
const inventories = [];
for (const game of snapshot.catalog.games) {
  const directory = resolve(DIST, game.assetBase.slice(1));
  await assertOwned(directory);
  // The existing release installer verifies descriptor/catalog binding and every
  // immutable payload SHA before it can become a test counterpart.
  const installed = await installPublishedArtifact(game, 'game', { dist: DIST });
  const actual = await fileDigests(installed.directory, ['game.json']);
  assert.equal(canonical(actual), canonical(installed.artifact.files));
  inventories.push({ id: game.id, version: game.version, revision: game.revision, files: Object.keys(actual).length });
}
const after = await fetchProductionSnapshot();
assert.equal(canonical(after), canonical(snapshot), 'Published counterpart changed during download; stop and replan');
await assertOwned(join(DIST, 'shell', revision));
// The base Git SHA is just a local preview address while this worktree is dirty.
// Final CI must rebuild after commit; these bytes are never a publication claim.
const candidate = await buildShell(revision);
assert.equal(candidate.version, '0.6.0');
await atomicJson(join(DIST, 'games/index.json'), snapshot.catalog);
await atomicJson(join(evidence, 'published-snapshot.json'), snapshot);
await atomicJson(join(evidence, 'pairing.json'), {
  scope: 'Local uncommitted Shell candidate + exact inventoried published games, not a formal release gate',
  preparedAt: new Date().toISOString(), root, dist: DIST,
  candidate, sourceBase: revision, dirtySource: execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }),
  publishedCounterparts: inventories, catalogGeneration: snapshot.catalog.generation,
  publishedShell: snapshot.catalog.shell,
});
console.log(`Prepared local candidate Shell ${candidate.version} with ${inventories.length} published games / ${inventories.reduce((sum, game) => sum + game.files, 0)} verified payloads`);
