import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { canonical, fetchProductionSnapshot, installPublishedArtifact, releaseURL, validateArtifact, validateProductionSnapshot, RELEASE_ORIGIN } from '../../scripts/release-store.mjs';
import { ciSequence, componentState, counterpartFingerprint, counterpartGeneration, exactTestPath, gameIdentities, guardedTargetFence, isInitialTarget, planOutputs, requireVersionBump, sourceBaseStatus, unitTestOwners } from '../../scripts/ci.mjs';

const revision = number => number.toString(16).padStart(40, '0');
const digest = value => createHash('sha256').update(value).digest('hex');
const component = { id: 'snake', dir: 'games/snake', pkg: { name: '@carrick/game-snake', version: '1.1.0' } };
function fixture() {
  const sha = revision(1);
  const shellSha = revision(2);
  const base = `/games/snake/1.0.0/${sha}/`;
  const meta = { id: 'snake', name: 'Snake', nameZh: '贪吃蛇', desc: 'A game.', descZh: '游戏。', group: 'casual', order: 1,
    icon: 'icon.svg', canvasSize: { width: 400, height: 400 }, controls: { keyboard: [{ keys: ['Space'], action: 'Play', actionZh: '玩' }] } };
  const files = { 'entry.js': 'export const game = 1;', 'style.css': '.snake{}', 'icon.svg': '<svg/>', 'assets/late.bin': 'late' };
  const artifact = { schemaVersion: 1, kind: 'game', id: 'snake', version: '1.0.0', revision: sha, apiVersion: 1,
    entry: 'entry.js', styles: ['style.css'], meta, files: Object.fromEntries(Object.entries(files).map(([path, body]) => [path, digest(body)])) };
  const game = { ...structuredClone(meta), version: artifact.version, revision: sha, apiVersion: 1, entry: base + 'entry.js', assetBase: base,
    styles: [base + 'style.css'], icon: base + 'icon.svg', generation: 1, sequence: 1001, handledRevision: sha };
  const shellFiles = { 'index.html': `<script type="module" src="/shell/${shellSha}/assets/main.js"></script>`, 'assets/main.js': 'export const shell=1;' };
  const manifest = { schemaVersion: 1, kind: 'shell', version: '0.3.0', revision: shellSha, apiVersions: [1],
    files: Object.fromEntries(Object.entries(shellFiles).map(([path, body]) => [path, digest(body)])) };
  const catalog = { schemaVersion: 1, apiVersion: 1, generation: 2, games: [game],
    shell: { version: manifest.version, revision: shellSha, apiVersions: [1], generation: 1, sequence: 1001, handledRevision: shellSha } };
  return { sha, shellSha, base, artifact, game, files, shellFiles, manifest, catalog };
}
function fakeFetch(routes, calls = []) {
  return async (url, options) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin, RELEASE_ORIGIN);
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    calls.push(parsed.pathname);
    const value = routes[parsed.pathname];
    if (value instanceof Error) throw value;
    if (value === undefined) return new Response('missing', { status: 404 });
    return new Response(typeof value === 'string' ? value : JSON.stringify(value), { status: 200 });
  };
}
function snapshotPlan() {
  const data = fixture();
  const snapshot = validateProductionSnapshot(data.catalog, data.manifest);
  const plan = { schemaVersion: 1, revision: revision(9), mode: 'main', components: [component],
    snapshot, targets: [{ id: 'snake', version: '1.1.0', expectedGeneration: 1, runtime: true, publish: true }] };
  return { plan, snapshot, data };
}

test('CI sequence preserves workflow run order and rerun attempts', () => {
  assert.equal(ciSequence({ GITHUB_RUN_NUMBER: '32', GITHUB_RUN_ATTEMPT: '1' }), 32001);
  assert.equal(ciSequence({ GITHUB_RUN_NUMBER: '32', GITHUB_RUN_ATTEMPT: '2' }), 32002);
  for (const [run, attempt] of [['0', '1'], ['1', '0'], ['x', '1'], ['1', '1000'], ['1.5', '1']]) {
    assert.throws(() => ciSequence({ GITHUB_RUN_NUMBER: run, GITHUB_RUN_ATTEMPT: attempt }));
  }
});
test('state lookup uses active entry, tombstone, then generation zero', () => {
  const { catalog, manifest } = fixture();
  const snapshot = { catalog, manifest };
  assert.equal(componentState(snapshot, 'snake').generation, 1);
  catalog.tombstones = { villa: { generation: 2, sequence: 4001, handledRevision: null } };
  assert.equal(componentState(snapshot, 'villa').sequence, 4001);
  assert.deepEqual(componentState(snapshot, 'new-game'), { generation: 0, sequence: 0, handledRevision: null });
  assert.deepEqual(componentState(snapshot, 'constructor'), { generation: 0, sequence: 0, handledRevision: null });
  assert.equal(componentState(snapshot, 'shell').generation, 1);
});
test('null handled history is initial only for absent/failed-first targets, never active games', () => {
  const data = fixture();
  const snapshot = { catalog: data.catalog, manifest: data.manifest };
  snapshot.catalog.games[0].handledRevision = null;
  assert.equal(isInitialTarget(snapshot, 'snake'), false);
  assert.equal(isInitialTarget(snapshot, 'new-game'), true);
  snapshot.catalog.tombstones = { villa: { generation: 2, sequence: 1001, handledRevision: null } };
  assert.equal(isInitialTarget(snapshot, 'villa'), true);
  snapshot.catalog.shell.handledRevision = null;
  assert.equal(isInitialTarget(snapshot, 'shell'), false);
  snapshot.catalog.shell.legacy = true;
  assert.equal(isInitialTarget(snapshot, 'shell'), true);
});
test('known newer handled history is not confused with missing or divergent source', () => {
  const base = revision(2), candidate = revision(3);
  assert.equal(sourceBaseStatus(null, candidate, { initial: true }), 'initial');
  assert.equal(sourceBaseStatus(null, candidate, { initial: false }), 'unknown');
  assert.equal(sourceBaseStatus(base, candidate, { hasSource: () => false }), 'unknown');
  assert.equal(sourceBaseStatus(base, candidate, { hasSource: () => true, isAncestor: () => false }), 'unknown');
  assert.equal(sourceBaseStatus(base, candidate, { hasSource: () => true, isAncestor: from => from === base }), 'handled');
  assert.equal(sourceBaseStatus(base, candidate, { hasSource: () => true, isAncestor: from => from === candidate }), 'ahead');
});
test('exact browser filters cannot import another game through a shared tests path suffix', () => {
  const path = '/tmp/scope+[1]/tests/contract.spec.ts';
  const filter = new RegExp(exactTestPath(path));
  assert.equal(filter.test(path), true);
  assert.equal(filter.test('/tmp/scope+[1]/games/other/tests/contract.spec.ts'), false);
  assert.equal(filter.test(path.replace('.spec.', '-spec-')), false);
});
test('unit-test ownership includes transitive declared libraries but never another game', () => {
  const plan = { components: [{ ...component, pkg: { ...component.pkg, dependencies: { '@carrick/game-sdk': '*', '@carrick/game-villa': '*' } } },
    { id: 'villa', dir: 'games/villa', pkg: { name: '@carrick/game-villa' } }],
    libraries: [{ id: 'sdk', dir: 'packages/game-sdk', pkg: { name: '@carrick/game-sdk', dependencies: { '@carrick/helpers': '*' } } },
      { id: 'helpers', dir: 'packages/helpers', pkg: { name: '@carrick/helpers' } }] };
  assert.deepEqual(unitTestOwners(plan, 'snake').map(owner => owner.id), ['snake', 'sdk', 'helpers']);
});
test('game fences and fingerprints ignore unrelated game promotions but track shell changes', () => {
  const { catalog, manifest } = fixture();
  const snapshot = { catalog, manifest };
  const gameBefore = counterpartFingerprint(snapshot, 'snake');
  const shellBefore = counterpartFingerprint(snapshot, 'shell');
  assert.equal(counterpartGeneration(snapshot, 'snake'), 1);
  catalog.games[0].generation++;
  catalog.generation++;
  assert.equal(counterpartFingerprint(snapshot, 'snake'), gameBefore);
  assert.notEqual(counterpartFingerprint(snapshot, 'shell'), shellBefore);
  assert.equal(counterpartGeneration(snapshot, 'snake'), 1);
  assert.equal(counterpartGeneration(snapshot, 'shell'), 3);
  catalog.shell.generation++;
  assert.notEqual(counterpartFingerprint(snapshot, 'snake'), gameBefore);
});
test('bootstrap identity proof includes reused revisions and rejects missing or extra games', () => {
  const { catalog } = fixture();
  const expected = gameIdentities(catalog);
  const equivalent = structuredClone(catalog);
  equivalent.generation += 10; equivalent.games[0].generation += 10;
  assert.equal(gameIdentities(equivalent), expected);
  equivalent.games[0].revision = revision(99);
  assert.notEqual(gameIdentities(equivalent), expected);
  assert.notEqual(gameIdentities({ games: [] }), expected);
  assert.notEqual(gameIdentities({ games: [...catalog.games, { ...catalog.games[0], id: 'extra' }] }), expected);
});
test('runtime changes require independent version bump; test-only and new packages do not', () => {
  assert.equal(requireVersionBump({ runtime: true }, component, { version: '1.0.0' }), null);
  assert.match(requireVersionBump({ runtime: true }, component, { version: '1.1.0' }), /version >/);
  assert.equal(requireVersionBump({ runtime: false }, component, { version: '1.1.0' }), null);
  assert.equal(requireVersionBump({ runtime: true }, component, null), null);
  assert.match(requireVersionBump({ runtime: true }, { ...component, discoveryError: 'bad metadata' }, null), /bad metadata/);
});
test('unchanged fence does not need to infer publication/rollback history', () => {
  const { plan, snapshot } = snapshotPlan();
  assert.equal(guardedTargetFence(plan, 'snake', snapshot, { sequence: 2001, isAncestor: () => false }), 1);
});
test('queued newer automatic ancestor may acquire a fresh fence only before tests', () => {
  const { plan, snapshot } = snapshotPlan();
  Object.assign(snapshot.catalog.games[0], { generation: 2, sequence: 2001, revision: revision(3), handledRevision: revision(3) });
  assert.equal(guardedTargetFence(plan, 'snake', snapshot, { sequence: 3001, isAncestor: () => true, packageAt: () => ({ version: '1.0.1' }) }), 2);
});
test('fence refresh rejects rollback, newer sequence, unknown ancestry and non-bumped version', () => {
  for (const mode of ['rollback', 'sequence', 'ancestry', 'version']) {
    const { plan, snapshot } = snapshotPlan();
    const state = snapshot.catalog.games[0];
    Object.assign(state, { generation: 2, sequence: 2001, revision: revision(3), handledRevision: revision(3) });
    if (mode === 'rollback') state.revision = revision(1);
    assert.throws(() => guardedTargetFence(plan, 'snake', snapshot, { sequence: mode === 'sequence' ? 1001 : 3001,
      isAncestor: () => mode !== 'ancestry', packageAt: () => ({ version: mode === 'version' ? '1.1.0' : '1.0.1' }) }));
  }
});
test('an already-current successful candidate can be reverified without changing its fence', () => {
  const { plan, snapshot } = snapshotPlan();
  Object.assign(snapshot.catalog.games[0], { generation: 2, sequence: 3001, revision: plan.revision, handledRevision: plan.revision, version: '1.1.0' });
  assert.equal(guardedTargetFence(plan, 'snake', snapshot, { sequence: 3002 }), 2);
});
test('PR counterpart refresh never authorizes a deployment', () => {
  const { plan, snapshot } = snapshotPlan();
  plan.mode = 'pr';
  snapshot.catalog.games[0].generation = 9;
  assert.equal(guardedTargetFence(plan, 'snake', snapshot), 9);
});
test('release URL policy rejects other origins, traversal, queries and fragments', () => {
  assert.equal(releaseURL('/games/index.json'), `${RELEASE_ORIGIN}/games/index.json`);
  for (const path of ['https://evil.invalid/a', '//evil.invalid/a', '/a/../b', '/games/index.json?x=1', '/games/index.json#x']) assert.throws(() => releaseURL(path));
});
test('modern and validated legacy snapshots have distinct bootstrap states', () => {
  const data = fixture();
  assert.equal(validateProductionSnapshot(data.catalog, data.manifest).bootstrap, false);
  assert.equal(validateProductionSnapshot(null, { schemaVersion: 1, revision: data.sha }).bootstrap, true);
  assert.throws(() => validateProductionSnapshot(null, data.manifest));
});
test('malformed game, protocol, generation and tombstone snapshots fail closed', () => {
  for (const mutate of [data => data.catalog.games[0].apiVersion = 2,
    data => data.catalog.games[0].generation = 1.5, data => data.catalog.schemaVersion = 2,
    data => data.catalog.tombstones = { snake: { generation: 1, sequence: 1, handledRevision: null } },
    data => data.catalog.shell.handledRevision = 'unknown']) {
    const data = fixture(); mutate(data);
    assert.throws(() => validateProductionSnapshot(data.catalog, data.manifest));
  }
});
test('network and non-JSON failures never fall back to rebuilding from source', async () => {
  await assert.rejects(fetchProductionSnapshot({ fetcher: async () => { throw new Error('network down'); } }), /network down/);
  const data = fixture();
  await assert.rejects(fetchProductionSnapshot({ fetcher: fakeFetch({ '/games/index.json': '<html>fallback</html>', '/manifest.json': data.manifest }) }));
});
test('the mutable catalog/current sampling race retries a bounded fresh snapshot', async () => {
  const data = fixture();
  const other = structuredClone(data.manifest);
  other.revision = revision(3);
  let count = 0;
  const fetcher = async (url, options) => {
    const path = new URL(url).pathname;
    count++;
    return fakeFetch({ '/games/index.json': data.catalog, '/manifest.json': count === 2 ? other : data.manifest })(url, options);
  };
  const result = await fetchProductionSnapshot({ fetcher });
  assert.equal(result.manifest.revision, data.shellSha);
  assert.equal(count, 4);
});
test('snapshot retry covers bootstrap kind transitions but never accepts a missing modern catalog', async () => {
  const data = fixture();
  const seededLegacy = structuredClone(data.catalog); delete seededLegacy.shell;
  let calls = 0;
  const fetcher = (url, options) => {
    calls++;
    return fakeFetch({ '/games/index.json': calls === 1 ? seededLegacy : data.catalog, '/manifest.json': data.manifest })(url, options);
  };
  assert.equal((await fetchProductionSnapshot({ fetcher })).bootstrap, false);
  assert.equal(calls, 4);
  const requests = [];
  await assert.rejects(fetchProductionSnapshot({ fetcher: fakeFetch({ '/manifest.json': data.manifest }, requests) }));
  assert.equal(requests.length, 6);
});
test('artifact validation compares metadata, styles and file inventory to the pinned catalog', () => {
  const data = fixture();
  assert.equal(validateArtifact(data.artifact, data.game, 'game').id, 'snake');
  for (const mutate of [artifact => artifact.meta.desc = 'changed', artifact => artifact.apiVersion = 2,
    artifact => artifact.meta.id = 'other', artifact => artifact.files['../outside'] = '0'.repeat(64),
    artifact => artifact.files['game.json'] = '0'.repeat(64), artifact => artifact.styles = ['missing.css']]) {
    const artifact = structuredClone(data.artifact); mutate(artifact);
    assert.throws(() => validateArtifact(artifact, data.game, 'game'));
  }
});
test('modern inventories reject hidden files that Caddy cannot serve to a future test store', () => {
  const data = fixture();
  for (const kind of ['game', 'shell']) {
    for (const path of ['.gitkeep', 'assets/.private/image.png', '.vite/manifest.json', 'assets/.env']) {
      const artifact = structuredClone(kind === 'game' ? data.artifact : data.manifest);
      artifact.files[path] = digest('hidden');
      assert.throws(() => validateArtifact(artifact, kind === 'game' ? data.game : artifact, kind));
    }
  }
});
test('optional source metadata id is accepted only when it agrees', () => {
  const data = fixture();
  delete data.artifact.meta.id;
  assert.equal(validateArtifact(data.artifact, data.game, 'game').id, 'snake');
});
test('shell counterpart descriptor must equal the pinned complete manifest', () => {
  const data = fixture();
  assert.equal(validateArtifact(data.manifest, data.manifest, 'shell').revision, data.shellSha);
  const changed = structuredClone(data.manifest); changed.files['assets/main.js'] = '0'.repeat(64);
  assert.throws(() => validateArtifact(changed, data.manifest, 'shell'));
});
test('verified download writes complete immutable files before its descriptor', async () => {
  const data = fixture();
  const directory = await mkdtemp(join(tmpdir(), 'carrick-ci-store-'));
  const calls = [];
  const routes = { [data.base + 'game.json']: data.artifact };
  for (const [path, body] of Object.entries(data.files)) routes[data.base + path] = body;
  try {
    const result = await installPublishedArtifact(data.game, 'game', { dist: directory, fetcher: fakeFetch(routes, calls) });
    assert.equal(await readFile(join(result.directory, 'assets/late.bin'), 'utf8'), 'late');
    assert.deepEqual(JSON.parse(await readFile(join(result.directory, 'game.json'), 'utf8')), data.artifact);
    assert.equal(calls.length, Object.keys(data.files).length + 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('missing or altered counterpart bytes fail rather than produce a partial ready artifact', async () => {
  for (const failure of ['missing', 'checksum']) {
    const data = fixture();
    const directory = await mkdtemp(join(tmpdir(), 'carrick-ci-failed-'));
    const routes = { [data.base + 'game.json']: data.artifact };
    for (const [path, body] of Object.entries(data.files)) routes[data.base + path] = body;
    if (failure === 'missing') delete routes[data.base + 'style.css'];
    else routes[data.base + 'style.css'] = 'corrupted';
    try {
      await assert.rejects(installPublishedArtifact(data.game, 'game', { dist: directory, fetcher: fakeFetch(routes) }));
      await assert.rejects(readFile(join(directory, data.base.slice(1), 'game.json')));
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
});
test('canonical descriptor comparison ignores JSON key order, not content', () => {
  assert.equal(canonical({ b: 2, a: { z: 1, x: 0 } }), canonical({ a: { x: 0, z: 1 }, b: 2 }));
  assert.notEqual(canonical({ a: 1 }), canonical({ a: 2 }));
});
test('workflow outputs distinguish shell verification from shell publication', () => {
  const plan = { targets: [{ id: 'shell', publish: false }], bootstrap: false, full: false };
  assert.equal(planOutputs(plan).shell, 'true');
  assert.equal(planOutputs(plan).shell_publish, 'false');
  assert.equal(planOutputs(plan).games, 'false');
  plan.targets[0].publish = true;
  assert.equal(planOutputs(plan).shell_publish, 'true');
  plan.targets = [];
  assert.equal(planOutputs(plan).shell, 'false');
  assert.equal(planOutputs(plan).shell_publish, 'false');
});
test('workflow isolates steady-state games and shell, with only an explicit bootstrap aggregate gate', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/deploy.yml', import.meta.url), 'utf8');
  assert.match(workflow, /fail-fast: false/);
  assert.match(workflow, /npm ci --include=dev/);
  assert.match(workflow, /node scripts\/ci\.mjs verify '\$\{\{ matrix\.id \}\}'/);
  assert.match(workflow, /bootstrap-shell:[\s\S]*needs: \[plan, common, games\]/);
  const shell = workflow.slice(workflow.indexOf('\n  shell:'), workflow.indexOf('\n  bootstrap-shell:'));
  assert.match(shell, /needs: \[plan, common\]/);
  assert.match(shell, /needs\.plan\.outputs\.shell_publish == 'true'/);
  assert.doesNotMatch(shell, /needs:.*games/);
  assert.doesNotMatch(workflow, /^concurrency:/m);
  assert.doesNotMatch(workflow, /test-and-deploy-all|hash-cache/);
});
