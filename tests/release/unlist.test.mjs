import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isIntentionalDelist, validateProductionSnapshot, RELEASE_ORIGIN } from '../../scripts/release-store.mjs';
import { assertPublicationVisible, createUnlistIntent, deploymentConnection, guardedTargetFence,
  isHiddenTarget, isInitialTarget, parseUnlistIds, prepareStore, requireVersionBump, selectReleaseTargets,
  unlistCommand, unlistGames, unlistSummary, validateUnlistContext } from '../../scripts/ci.mjs';

const revision = number => number.toString(16).padStart(40, '0');
const environment = () => ({ GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: 'Carrick-K7/carrick-games',
  GITHUB_REPOSITORY_OWNER: 'Carrick-K7', GITHUB_REF: 'refs/heads/main', GITHUB_ACTOR: 'Carrick-K7',
  GITHUB_TRIGGERING_ACTOR: 'Carrick-K7', GITHUB_RUN_ATTEMPT: '1', GITHUB_SHA: revision(99), GITHUB_RUN_NUMBER: '1' });
const tombstone = (handledRevision = revision(1), extra = {}) => ({ generation: 3, sequence: 900001, handledRevision, ...extra });
function fixture(ids = ['snake', 'villa', 'sudoku']) {
  const games = ids.map((id, index) => {
    const sha = revision(index + 1);
    const base = `/games/${id}/1.0.0/${sha}/`;
    return { id, name: id, nameZh: '游戏', desc: 'A game.', descZh: '游戏。', group: 'casual', order: 1,
      canvasSize: { width: 400, height: 400 }, controls: { keyboard: [{ keys: ['Space'], action: 'Play', actionZh: '玩' }] },
      version: '1.0.0', revision: sha, apiVersion: 1, entry: base + 'entry.js', assetBase: base, styles: [], icon: base + 'icon.svg',
      generation: 5 + index, sequence: 900001 + index, handledRevision: sha };
  });
  const manifest = { schemaVersion: 1, kind: 'shell', version: '0.4.1', revision: revision(40), apiVersions: [1], files: { 'index.html': 'a'.repeat(64) } };
  const catalog = { schemaVersion: 1, apiVersion: 1, generation: 90, games, tombstones: {}, shell: {
    version: manifest.version, revision: manifest.revision, apiVersions: [1], generation: 4, sequence: 800001, handledRevision: manifest.revision } };
  return validateProductionSnapshot(catalog, manifest);
}
function hide(snapshot, id = 'snake', state = tombstone()) {
  snapshot.catalog.games = snapshot.catalog.games.filter(game => game.id !== id);
  snapshot.catalog.tombstones[id] = state;
  return snapshot;
}
const components = ['shell', 'snake', 'villa', 'sudoku'].map(id => ({ id, dir: id === 'shell' ? 'apps/shell' : `games/${id}`,
  pkg: { name: id === 'shell' ? '@carrick/shell' : `@carrick/game-${id}`, version: '1.0.0', dependencies: { '@carrick/game-sdk': '*' } } }));
const records = { components, libraries: [{ id: 'sdk', dir: 'packages/game-sdk', pkg: { name: '@carrick/game-sdk' } }] };
function selection(snapshot, options = {}) {
  return selectReleaseTargets({ ...records, snapshot, mode: 'main', triggerPaths: ['README.md'], ...options });
}
function plan(snapshot, extra = {}) {
  return { schemaVersion: 1, mode: 'main', revision: revision(99), components, snapshot,
    targets: [{ id: 'snake', version: '1.0.0', publish: true, runtime: true, expectedGeneration: 5, ...extra }] };
}
function harness({ snapshot = fixture(), command, read } = {}) {
  const calls = [];
  const writes = [];
  const live = structuredClone(snapshot);
  let catalogReads = 0;
  const apply = value => {
    const [action, id, generation, sequence, shellGeneration] = value.split(' ');
    assert.equal(action, 'remove-game');
    const state = live.catalog.games.find(game => game.id === id) ?? live.catalog.tombstones[id];
    if (Number(generation) !== state.generation || Number(sequence) <= state.sequence || Number(shellGeneration) !== live.catalog.shell.generation) return 'failed';
    live.catalog.games = live.catalog.games.filter(game => game.id !== id);
    live.catalog.tombstones[id] = { generation: state.generation + 1, sequence: Number(sequence), handledRevision: state.handledRevision, delisted: true };
    live.catalog.generation++;
    return 'ok';
  };
  const fetcher = async (url, options) => {
    assert.equal(new URL(url).origin, RELEASE_ORIGIN);
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    const path = new URL(url).pathname;
    calls.push(path);
    if (path === '/games/index.json') catalogReads++;
    const response = read?.({ path, catalogReads, calls, live, writes });
    if (response) return response;
    return new Response(JSON.stringify(path === '/games/index.json' ? live.catalog : live.manifest));
  };
  const transport = async value => {
    writes.push(value);
    return command ? command({ value, apply, live, writes }) : apply(value);
  };
  return { live, calls, writes, apply, fetcher, transport,
    run: (input = 'snake', options = {}) => unlistGames({ input, environment: environment(), checkoutRevision: revision(99), fetcher, transport, ...options }) };
}
const statuses = report => report.results.map(result => result.status);

for (const [name, state, hidden] of [
  ['absent tombstone', undefined, false],
  ['legacy successful history', tombstone(), true],
  ['failed first publish', tombstone(null), false],
  ['marked successful history', tombstone(revision(1), { delisted: true }), true],
  ['marked null history', tombstone(null, { delisted: true }), true],
]) test(`intentional delist semantic matrix: ${name}`, () => assert.equal(isIntentionalDelist(state), hidden));

test('every present marker other than literal true fails closed, including false and null', () => {
  for (const marker of [false, null, undefined, 0, 1, '', 'true', 'false', [], {}]) {
    for (const history of [null, revision(1)]) {
      const state = tombstone(history, { delisted: marker });
      assert.throws(() => isIntentionalDelist(state), /delisted marker/);
      const snapshot = hide(fixture(), 'snake', state);
      assert.throws(() => validateProductionSnapshot(snapshot.catalog, snapshot.manifest), /delisted marker/);
    }
  }
});
test('legacy history requires a valid non-null string SHA and valid safe-integer fences', () => {
  for (const value of ['', 'unknown', 'A'.repeat(40), revision(1).slice(1), [revision(1)], 1, undefined]) {
    assert.throws(() => isIntentionalDelist(tombstone(null, { handledRevision: value })));
  }
  for (const state of [null, [], {}, tombstone(null, { generation: -1 }), tombstone(null, { sequence: Number.MAX_SAFE_INTEGER + 1 })]) {
    assert.throws(() => isIntentionalDelist(state));
  }
});
test('marked-null targets are never initial; only absent and failed-first targets are initial', () => {
  const snapshot = fixture();
  assert.equal(isInitialTarget(snapshot, 'snake'), false);
  assert.equal(isInitialTarget(snapshot, 'new-game'), true);
  hide(snapshot, 'snake', tombstone(null));
  assert.equal(isInitialTarget(snapshot, 'snake'), true);
  snapshot.catalog.tombstones.snake.delisted = true;
  assert.equal(isInitialTarget(snapshot, 'snake'), false);
  assert.equal(isHiddenTarget(snapshot, 'snake'), true);
  delete snapshot.catalog.tombstones.snake.delisted;
  snapshot.catalog.tombstones.snake.handledRevision = revision(1);
  assert.equal(isInitialTarget(snapshot, 'snake'), false);
});
test('hidden pending runtime and unknown baselines do not fan out on later docs pushes', () => {
  const snapshot = hide(fixture());
  const selected = selection(snapshot, { pendingPathsById: { snake: ['packages/game-sdk/src/game.ts', 'tsconfig.json'] }, unknownBaseIds: ['snake'] });
  assert.deepEqual(selected, { targets: [], full: false });
});
test('current hidden source edits remain runtime facts but never require a bump or publish', () => {
  const selected = selection(hide(fixture()), { triggerPaths: ['games/snake/src/index.ts'], pendingPathsById: { snake: ['games/snake/src/index.ts'] } });
  assert.equal(selected.full, false);
  assert.equal(selected.targets.length, 1);
  const target = selected.targets[0];
  assert.equal(target.runtime, true);
  assert.equal(target.test, true);
  assert.equal(target.hidden, true);
  assert.equal(target.publish, false);
  assert.equal(requireVersionBump(target, components[1], { version: '1.0.0' }), null);
});
test('hidden test-only selection remains test-only with no old pending fanout', () => {
  const target = selection(hide(fixture()), { triggerPaths: ['games/snake/tests/game.test.ts'], pendingPathsById: { snake: ['tsconfig.json'] } }).targets[0];
  assert.equal(target.runtime, false);
  assert.equal(target.publish, false);
  assert.equal(target.test, true);
});
test('PR hidden runtime changes preserve coverage without forcing a hidden SemVer bump', () => {
  const selected = selection(hide(fixture()), { mode: 'pr', triggerPaths: ['games/snake/src/index.ts', 'games/villa/src/index.ts'] });
  assert.deepEqual(selected.targets.map(target => target.publish), [false, false]);
  assert.equal(requireVersionBump(selected.targets[0], components[1], { version: '1.0.0' }), null);
  assert.match(requireVersionBump(selected.targets[1], components[2], { version: '1.0.0' }), /version >/);
});
test('active targets retain pending publication and independent version gates beside hidden targets', () => {
  const selected = selection(hide(fixture()), { pendingPathsById: { snake: ['tsconfig.json'], villa: ['games/villa/src/index.ts'] } });
  assert.deepEqual(selected.targets.map(target => target.id), ['villa']);
  assert.equal(selected.targets[0].publish, true);
  assert.match(requireVersionBump(selected.targets[0], components[2], { version: '1.0.0' }), /version >/);
});
test('shared current edits still verify hidden source; failed-first targets remain publishable', () => {
  const snapshot = hide(fixture(), 'snake', tombstone(null));
  let selected = selection(snapshot, { pendingPathsById: { snake: ['games/snake/package.json'] } });
  assert.equal(selected.targets[0].publish, true);
  snapshot.catalog.tombstones.snake.delisted = true;
  selected = selection(snapshot, { triggerPaths: ['packages/game-sdk/src/game.ts'] });
  assert.equal(selected.targets.find(target => target.id === 'snake').runtime, true);
  assert.equal(selected.targets.find(target => target.id === 'snake').publish, false);
  assert.equal(selected.targets.length, components.length);
});
test('main bootstrap with intentional delists fails at planning with an explicit recovery diagnostic', () => {
  for (const state of [tombstone(), tombstone(null, { delisted: true }), tombstone(revision(1), { delisted: true })]) {
    assert.throws(() => selection(hide(fixture(), 'snake', state), { bootstrap: true }),
      /Main bootstrap with intentional delists requires explicit recovery before builds/);
  }
  const snapshot = fixture();
  snapshot.catalog.tombstones['retired-source'] = tombstone();
  assert.throws(() => selection(snapshot, { bootstrap: true }), /explicit recovery before builds/);
});
test('main bootstrap with absent or unmarked-null failed-first targets still selects their publication', () => {
  for (const failedFirst of [false, true]) {
    const snapshot = fixture();
    snapshot.catalog.games = snapshot.catalog.games.filter(game => game.id !== 'snake');
    if (failedFirst) snapshot.catalog.tombstones.snake = tombstone(null);
    const target = selection(snapshot, { bootstrap: true }).targets.find(target => target.id === 'snake');
    assert.equal(target.publish, true);
    assert.equal(target.runtime, true);
    assert.equal(target.hidden, undefined);
  }
});
test('the unsupported main bootstrap diagnostic does not block PR verification or steady-state hidden tests', () => {
  const snapshot = hide(fixture());
  const selected = selection(snapshot, { mode: 'pr', bootstrap: true, triggerPaths: ['games/snake/src/index.ts'] });
  assert.equal(selected.targets.find(target => target.id === 'snake').publish, false);
  assert.equal(selection(snapshot, { triggerPaths: ['games/snake/tests/game.test.ts'] }).targets[0].test, true);
});
test('pre-test and pre-publish guards reject newly hidden targets before equal-generation shortcuts', () => {
  for (const generation of [5, 6]) {
    for (const state of [tombstone(), tombstone(null, { delisted: true })]) {
      const snapshot = fixture();
      const original = plan(snapshot);
      hide(snapshot, 'snake', { ...state, generation });
      assert.throws(() => guardedTargetFence(original, 'snake', snapshot, { sequence: 999999 }), /intentional delist/);
      assert.throws(() => assertPublicationVisible(original, 'snake', snapshot), /intentional delist/);
    }
  }
});
test('hidden publication guard also precedes a matching identity shortcut', () => {
  const snapshot = hide(fixture(), 'snake', tombstone(revision(99), { revision: revision(99), version: '1.0.0', generation: 7 }));
  assert.throws(() => guardedTargetFence(plan(snapshot), 'snake', snapshot), /intentional delist/);
});
test('verification-only hidden targets remain testable after concurrent removal', () => {
  const snapshot = hide(fixture(), 'snake', tombstone(null, { delisted: true, generation: 8 }));
  const verification = plan(snapshot, { publish: false });
  assert.equal(guardedTargetFence(verification, 'snake', snapshot), 8);
  assert.equal(assertPublicationVisible(verification, 'snake', snapshot), true);
});
test('actual prepare entry rejects hidden publication before artifact/build access', async () => {
  const snapshot = hide(fixture(), 'snake', tombstone(revision(1), { generation: 5 }));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = harness({ snapshot }).fetcher;
  try { await assert.rejects(prepareStore(plan(snapshot), 'snake'), /intentional delist/); }
  finally { globalThis.fetch = originalFetch; }
});

test('dispatch context accepts only the owner main event at its exact checkout SHA', () => {
  assert.doesNotThrow(() => validateUnlistContext(environment(), revision(99)));
  for (const [field, values] of Object.entries({
    GITHUB_EVENT_NAME: ['push', 'pull_request', 'schedule'], GITHUB_REPOSITORY: ['fork/carrick-games', 'Carrick-K7/other'],
    GITHUB_REPOSITORY_OWNER: ['other', undefined], GITHUB_REF: ['refs/heads/feature', 'refs/tags/main'],
    GITHUB_ACTOR: ['other', 'Carrick-K7[bot]', undefined], GITHUB_TRIGGERING_ACTOR: ['other', undefined],
    GITHUB_RUN_ATTEMPT: ['2', '0', '01', '1.0', 1, undefined], GITHUB_SHA: ['', 'A'.repeat(40), revision(98)],
  })) for (const value of values) assert.throws(() => validateUnlistContext({ ...environment(), [field]: value }, revision(99)), `${field}=${value}`);
});
test('forbidden event and rerun contexts fail before reads or transport', async () => {
  const data = harness();
  for (const changes of [{ GITHUB_RUN_ATTEMPT: '2' }, { GITHUB_ACTOR: 'other' }, { GITHUB_TRIGGERING_ACTOR: 'other' }, { GITHUB_REF: 'refs/heads/other' }]) {
    await assert.rejects(data.run('snake', { environment: { ...environment(), ...changes } }));
  }
  assert.equal(data.calls.length, 0);
  assert.equal(data.writes.length, 0);
});
test('strict pinned deployment credentials keep ubuntu/2222 and the fixed production origin', () => {
  const credentials = { SSH_HOST: 'games.example.test', SSH_USER: 'ubuntu', DEPLOY_PORT: '2222', SSH_KEY: 'secret-key', DEPLOY_KNOWN_HOSTS: 'pinned-host', DEPLOY_URL: RELEASE_ORIGIN };
  assert.deepEqual(deploymentConnection(credentials, { unlist: true }), { host: 'games.example.test', user: 'ubuntu', port: '2222' });
  for (const changes of [{ SSH_USER: 'root' }, { DEPLOY_PORT: '22' }, { DEPLOY_PORT: '' }, { DEPLOY_PORT: '2222 -o x' },
    { SSH_HOST: '-oProxyCommand=x' }, { SSH_KEY: '' }, { DEPLOY_KNOWN_HOSTS: '' }, { DEPLOY_URL: undefined }, { DEPLOY_URL: 'https://other.invalid' }]) {
    assert.throws(() => deploymentConnection({ ...credentials, ...changes }, { unlist: true }));
  }
});
test('ID parsing accepts whitespace/comma separators, preserves order and deduplicates', () => {
  assert.deepEqual(parseUnlistIds(' snake, villa\n\tsnake,,sudoku '), ['snake', 'villa', 'sudoku']);
  assert.deepEqual(parseUnlistIds('a'.repeat(80)), ['a'.repeat(80)]);
});
test('empty IDs, shell, injection and noncanonical IDs fail before any read or write', async () => {
  const data = harness();
  for (const input of ['', ' ,\t\n, ', null, undefined, 'shell', 'snake shell', 'Snake', 'a'.repeat(81), '../snake', 'snake/entry',
    'snake;true', 'snake$(id)', 'snake`id`', 'snake\u0000', 'snake--id', '-oProxyCommand=x', 'snake\n--flag', 'snake_foo', 'snake|true']) {
    await assert.rejects(data.run(input, { input }));
  }
  assert.equal(data.calls.length, 0);
  assert.equal(data.writes.length, 0);
});
test('the whole mixed batch is validated before mutation, including unknown/prototype IDs', async () => {
  const data = harness();
  for (const input of ['snake unknown', 'snake constructor', 'snake toString']) await assert.rejects(data.run(input));
  assert.equal(data.writes.length, 0);
});
test('unknown known-source-only games cannot be created as production tombstones', () => {
  assert.throws(() => createUnlistIntent('not-published', fixture()), /Unknown game ID/);
});
test('the same-run tuple is deeply frozen, uses actual rollback identity and never lowers sequence high-water', () => {
  const snapshot = fixture();
  snapshot.catalog.games[0].handledRevision = revision(88);
  const intent = createUnlistIntent('snake', snapshot);
  const target = intent.targets[0];
  assert.equal(target.before.revision, revision(1));
  assert.equal(target.before.handledRevision, revision(88));
  assert.equal(target.expected.sequence, 900002);
  snapshot.catalog.games[0].sequence = 1;
  snapshot.catalog.shell.generation++;
  assert.equal(unlistCommand(target), 'remove-game snake 5 900002 4');
  assert.throws(() => target.expected.sequence = 2);
  assert.throws(() => target.before.revision = revision(3));
  assert.throws(() => intent.targets.push(target));
});
test('sequence and generation overflow in any target block the entire batch before writes', async () => {
  for (const field of ['sequence', 'generation']) {
    const snapshot = fixture();
    snapshot.catalog.games[1][field] = Number.MAX_SAFE_INTEGER;
    const data = harness({ snapshot });
    await assert.rejects(data.run('snake villa'), /fence exhausted/);
    assert.equal(data.writes.length, 0);
  }
  const snapshot = fixture();
  snapshot.catalog.games[0].sequence = Number.MAX_SAFE_INTEGER - 1;
  assert.equal(createUnlistIntent('snake', snapshot).targets[0].expected.sequence, Number.MAX_SAFE_INTEGER);
});
test('real removals reserve two safe generations for promotion and failure compensation', async () => {
  const snapshot = fixture();
  snapshot.catalog.games[1].generation = Number.MAX_SAFE_INTEGER - 1;
  const data = harness({ snapshot });
  await assert.rejects(data.run('snake villa'), /fence exhausted/);
  assert.equal(data.writes.length, 0);
  snapshot.catalog.games[1].generation = Number.MAX_SAFE_INTEGER - 2;
  assert.equal(createUnlistIntent('villa', snapshot).targets[0].expected.generation, Number.MAX_SAFE_INTEGER - 2);
});
test('already-hidden maximum sequence/generation targets succeed with zero writes and no increment', async () => {
  const snapshot = hide(fixture(), 'snake', tombstone(null, { delisted: true, sequence: Number.MAX_SAFE_INTEGER, generation: Number.MAX_SAFE_INTEGER }));
  const data = harness({ snapshot });
  const report = await data.run();
  assert.equal(report.ok, true);
  assert.deepEqual(statuses(report), ['already-unlisted']);
  assert.equal(report.results[0].expected.sequence, null);
  assert.equal(report.results[0].before.sequence, Number.MAX_SAFE_INTEGER);
  assert.equal(data.writes.length, 0);
});
test('an interruption after intent reports unknown with frozen before/fences and a final read, never zero writes', async () => {
  const data = harness();
  const report = await data.run('snake villa', { onIntent: () => { throw new Error('private unexpected failure'); } });
  assert.equal(report.phase, 'after-intent');
  assert.equal(report.ok, false);
  assert.deepEqual(statuses(report), ['unknown', 'unknown']);
  assert.equal(report.results[0].attempted, null);
  assert.equal(report.results[0].expected.sequence, 900002);
  assert.equal(report.results[0].observed.active, true);
  assert.deepEqual(data.calls, ['/games/index.json', '/manifest.json', '/games/index.json']);
  assert.doesNotMatch(JSON.stringify(report), /no operations attempted|preflight-failed|private unexpected failure/);
});
test('post-intent interruption preserves already-hidden observed truth without inventing writes', async () => {
  const data = harness({ snapshot: hide(fixture()) });
  const report = await data.run('snake villa', { onIntent: () => { throw new Error('interrupted'); } });
  assert.deepEqual(statuses(report), ['already-unlisted', 'unknown']);
  assert.equal(report.ok, false);
  assert.equal(data.writes.length, 0);
});
test('command helper refuses nonnumeric fences and ID arguments even outside the CLI', () => {
  const target = createUnlistIntent('snake', fixture()).targets[0];
  for (const id of ['snake villa', ' snake', 'snake;', 'shell']) assert.throws(() => unlistCommand({ ...target, id }));
  for (const [key, value] of [['sequence', 0], ['sequence', '900002'], ['generation', -1], ['shellGeneration', Infinity]]) {
    assert.throws(() => unlistCommand({ ...target, expected: { ...target.expected, [key]: value } }));
  }
});
test('sequential success writes one frozen remove command per deduplicated target and reports exact identities', async () => {
  const data = harness();
  const intents = [];
  const report = await data.run('snake,villa snake', { onIntent: value => { assert.equal(data.writes.length, 0); intents.push(value); } });
  assert.deepEqual(data.writes, ['remove-game snake 5 900002 4', 'remove-game villa 6 900003 4']);
  assert.deepEqual(statuses(report), ['removed', 'removed']);
  assert.equal(report.ok, true);
  assert.equal(report.results[0].before.revision, revision(1));
  assert.equal(report.results[0].before.version, '1.0.0');
  assert.equal(report.results[0].observed.delisted, true);
  assert.equal(report.results[0].observed.sequence, 900002);
  assert.equal(intents.length, 1);
  assert.equal(data.calls.filter(path => path === '/manifest.json').length, 1);
  assert.equal(data.calls.filter(path => path === '/games/index.json').length, 4); // initial + per operation + final
});
test('legacy and marked-null hidden targets validate final public state with zero writes', async () => {
  const snapshot = hide(hide(fixture(), 'snake', tombstone()), 'villa', tombstone(null, { delisted: true }));
  const data = harness({ snapshot });
  const report = await data.run('snake villa');
  assert.deepEqual(statuses(report), ['already-unlisted', 'already-unlisted']);
  assert.equal(report.ok, true);
  assert.deepEqual(data.writes, []);
  assert.deepEqual(data.calls, ['/games/index.json', '/manifest.json', '/games/index.json']);
});
test('failed first publication with null unmarked history must explicitly remove and acquire the marker', async () => {
  const data = harness({ snapshot: hide(fixture(), 'snake', tombstone(null)) });
  const report = await data.run();
  assert.deepEqual(data.writes, ['remove-game snake 3 900002 4']);
  assert.equal(report.results[0].status, 'removed');
  assert.equal(report.results[0].observed.handledRevision, null);
  assert.equal(report.results[0].observed.delisted, true);
  assert.equal(isInitialTarget(data.live, 'snake'), false);
});
test('partial failure stops before later writes and reports each target truth without retry or undo', async () => {
  const data = harness({ command: ({ value, writes, apply }) => writes.length === 2 ? 'failed' : apply(value) });
  const report = await data.run('snake villa sudoku');
  assert.deepEqual(statuses(report), ['removed', 'failed', 'not-attempted']);
  assert.equal(report.ok, false);
  assert.equal(report.stopped, true);
  assert.deepEqual(data.writes, ['remove-game snake 5 900002 4', 'remove-game villa 6 900003 4']);
  assert.equal(report.results[2].attempted, false);
  assert.equal(report.results[2].observed.active, true);
});
test('uncertain transport stays unknown even with an exact observed tombstone and stops the batch', async () => {
  const data = harness({ command: ({ value, apply }) => { apply(value); throw new Error('private transport diagnostic'); } });
  const report = await data.run('snake villa');
  assert.deepEqual(statuses(report), ['unknown', 'not-attempted']);
  assert.equal(report.results[0].transport, 'unknown');
  assert.equal(report.results[0].observed.delisted, true);
  assert.equal(report.results[0].observed.generation, 6);
  assert.equal(report.ok, false);
  assert.equal(data.writes.length, 1);
  assert.doesNotMatch(JSON.stringify(report), /private transport diagnostic/);
});
for (const outcome of ['unknown', 'failed']) test(`an exact provisional tombstone cannot upgrade ${outcome} SSH to success`, async () => {
  const data = harness({ command: ({ value, apply }) => { apply(value); return outcome; } });
  const report = await data.run();
  assert.equal(report.ok, false);
  assert.deepEqual(statuses(report), [outcome]);
  assert.deepEqual(report.results[0].observed, { active: false, version: null, revision: null,
    generation: 6, sequence: 900002, handledRevision: revision(1), delisted: true });
  assert.equal(data.writes.length, 1);
  assert.deepEqual(data.calls, ['/games/index.json', '/manifest.json', '/games/index.json']);
  // The server may still fail its synchronous public check and compensate later.
  delete data.live.catalog.tombstones.snake;
  data.live.catalog.games.push({ ...fixture().catalog.games[0], generation: 7, sequence: 900002 });
  assert.equal(report.ok, false);
});
test('unknown transport stays unknown when final state is readable but still active', async () => {
  const data = harness({ command: () => 'unknown' });
  const report = await data.run();
  assert.deepEqual(statuses(report), ['unknown']);
  assert.equal(report.results[0].observed.active, true);
  assert.equal(report.ok, false);
});
for (const [name, mutate] of [
  ['missing marker', state => delete state.delisted], ['wrong generation', state => state.generation++],
  ['wrong sequence', state => state.sequence++], ['wrong handled history', state => state.handledRevision = revision(90)],
]) test(`SSH success is not removal success: ${name}`, async () => {
  const data = harness({ command: ({ value, apply, live }) => { apply(value); mutate(live.catalog.tombstones.snake); return 'ok'; } });
  const report = await data.run('snake villa');
  assert.deepEqual(statuses(report), ['failed', 'not-attempted']);
  assert.equal(data.writes.length, 1);
  assert.equal(report.ok, false);
});
test('uncertain transport remains unknown with hidden but nonmatching observed state', async () => {
  for (const mutate of [state => state.generation++, state => state.sequence++, state => state.handledRevision = revision(90), state => delete state.delisted]) {
    const data = harness({ command: ({ value, apply, live }) => { apply(value); mutate(live.catalog.tombstones.snake); return 'unknown'; } });
    const report = await data.run('snake villa');
    assert.deepEqual(statuses(report), ['unknown', 'not-attempted']);
    assert.equal(report.ok, false);
    assert.equal(data.writes.length, 1);
  }
});
test('missing ID without a tombstone is failure, not removed', async () => {
  const data = harness({ command: ({ live }) => { live.catalog.games = live.catalog.games.filter(game => game.id !== 'snake'); return 'ok'; } });
  const report = await data.run();
  assert.deepEqual(statuses(report), ['failed']);
  assert.equal(report.results[0].observed.missing, true);
});
test('failure compensation restoring active target and advancing its generation is not success', async () => {
  const data = harness({ command: ({ live }) => { live.catalog.games[0].generation += 2; live.catalog.games[0].sequence++; return 'failed'; } });
  const report = await data.run('snake villa');
  assert.deepEqual(statuses(report), ['failed', 'not-attempted']);
  assert.equal(report.results[0].observed.generation, 7);
  assert.equal(data.writes.length, 1);
});
test('unexpected activation of a zero-write hidden target is reported failed', async () => {
  const active = fixture().catalog.games[0];
  const snapshot = hide(fixture());
  const data = harness({ snapshot, read: ({ live, catalogReads }) => {
    if (catalogReads === 2) { delete live.catalog.tombstones.snake; live.catalog.games.push(active); }
  } });
  const report = await data.run();
  assert.deepEqual(statuses(report), ['failed']);
  assert.equal(report.results[0].observed.active, true);
  assert.equal(data.writes.length, 0);
});
test('the final read can invalidate an earlier successful removal after later concurrent activation', async () => {
  const active = fixture().catalog.games[0];
  const data = harness({ read: ({ live, catalogReads }) => {
    if (catalogReads === 4) { delete live.catalog.tombstones.snake; live.catalog.games.push({ ...active, generation: 8 }); }
  } });
  const report = await data.run('snake villa');
  assert.deepEqual(statuses(report), ['failed', 'removed']);
  assert.equal(report.ok, false);
  assert.equal(data.writes.length, 2);
});
test('HTTP failure after a write stops mutation; final read remains read-only reconciliation', async () => {
  const data = harness({ read: ({ path, catalogReads }) => path === '/games/index.json' && catalogReads === 2 ? new Response('unavailable', { status: 503 }) : undefined });
  const report = await data.run('snake villa');
  assert.deepEqual(statuses(report), ['removed', 'not-attempted']);
  assert.equal(data.writes.length, 1);
  assert.equal(data.calls.length, 4);
});
test('unreadable final state reports unknown for attempted and already-hidden targets, never presumed success', async () => {
  const snapshot = hide(fixture(), 'sudoku');
  const data = harness({ snapshot, read: ({ path, catalogReads }) => path === '/games/index.json' && catalogReads >= 2 ? new Response('bad gateway', { status: 502 }) : undefined });
  const report = await data.run('snake villa sudoku');
  assert.deepEqual(statuses(report), ['unknown', 'not-attempted', 'unknown']);
  assert.equal(report.ok, false);
  assert.equal(report.results[0].observed, null);
  assert.equal(data.writes.length, 1);
});
test('invalid present final marker fails closed as unknown public state', async () => {
  const data = harness({ command: ({ value, apply, live }) => { apply(value); live.catalog.tombstones.snake.delisted = false; return 'ok'; } });
  const report = await data.run();
  assert.deepEqual(statuses(report), ['unknown']);
  assert.equal(report.ok, false);
  assert.equal(data.writes.length, 1);
});
test('initial HTTP failure or shell sampling race never refreshes intent or starts writes', async () => {
  for (const status of [404, 500]) {
    const data = harness({ read: () => new Response('no state', { status }) });
    await assert.rejects(data.run());
    assert.equal(data.calls.length, 1);
    assert.equal(data.writes.length, 0);
  }
  const data = harness({ read: ({ path, live }) => path === '/manifest.json' ? new Response(JSON.stringify({ ...live.manifest, revision: revision(8) })) : undefined });
  await assert.rejects(data.run(), /changed during snapshot/);
  assert.equal(data.calls.length, 2);
  assert.equal(data.writes.length, 0);
});
test('a shell race stops the batch without acquiring a new counterpart fence', async () => {
  const data = harness({ command: ({ value, apply, live }) => { const result = apply(value); live.catalog.shell.generation++; return result; } });
  const report = await data.run('snake villa');
  assert.deepEqual(statuses(report), ['removed', 'not-attempted']);
  assert.equal(data.writes.length, 1);
  assert.equal(report.results[1].expected.shellGeneration, 4);
});
test('a later target changing during the batch gets the original fence once, never refreshed', async () => {
  const data = harness({ command: ({ value, writes, apply, live }) => {
    const result = apply(value);
    if (writes.length === 1) { live.catalog.games.find(game => game.id === 'villa').generation++; }
    return result;
  } });
  const report = await data.run('snake villa sudoku');
  assert.deepEqual(statuses(report), ['removed', 'failed', 'not-attempted']);
  assert.equal(report.results[1].expected.generation, 6);
  assert.equal(report.results[1].observed.generation, 7);
  assert.deepEqual(data.writes, ['remove-game snake 5 900002 4', 'remove-game villa 6 900003 4']);
});
test('an unattempted target concurrently hidden by another actor is never attributed to this operation', async () => {
  const data = harness({ command: ({ live }) => { hide(live, 'villa', tombstone(revision(2), { delisted: true })); return 'failed'; } });
  const report = await data.run('snake villa');
  assert.deepEqual(statuses(report), ['failed', 'not-attempted']);
  assert.equal(report.results[1].observed.delisted, true);
});
test('report and Actions summary contain public identity/fences but no environment or transport secrets', async () => {
  const data = harness();
  const report = await data.run('snake', { environment: { ...environment(), SSH_KEY: 'privatekey-never-log', DEPLOY_KNOWN_HOSTS: 'hostkey-never-log' } });
  const summary = unlistSummary(report);
  assert.match(summary, /snake \| removed/);
  assert.match(summary, /1\.0\.0 \/ 0000000000000000000000000000000000000001/);
  assert.match(summary, /5 \/ 900002 \/ 4/);
  assert.doesNotMatch(JSON.stringify(report) + summary, /privatekey|hostkey|SSH_KEY|DEPLOY_KNOWN_HOSTS/);
});
test('CLI dispatch rejects old attempts before reading a release plan and exits nonzero with result JSON', () => {
  const result = spawnSync(process.execPath, ['scripts/ci.mjs', 'unlist'], {
    cwd: fileURLToPath(new URL('../..', import.meta.url)), encoding: 'utf8',
    env: { ...process.env, ...environment(), GITHUB_RUN_ATTEMPT: '2', GAME_IDS: 'snake', GITHUB_STEP_SUMMARY: '' },
  });
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.action, 'unlist');
  assert.deepEqual(report.results, []);
  assert.doesNotMatch(result.stderr, /plan\.json|ENOENT/);
});
test('workflow isolates dispatch, uses exact SHA/Node22 and constant unlist with env-only IDs', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/deploy.yml', import.meta.url), 'utf8');
  const job = workflow.slice(workflow.indexOf('\n  unlist:'), workflow.indexOf('\n  plan:'));
  assert.match(workflow, /workflow_dispatch:\s+inputs:\s+game_ids:[\s\S]*?required: true\s+type: string/);
  for (const restriction of ["github.event_name == 'workflow_dispatch'", "github.repository == 'Carrick-K7/carrick-games'",
    "github.ref == 'refs/heads/main'", "github.actor == 'Carrick-K7'", "github.triggering_actor == 'Carrick-K7'", 'github.run_attempt == 1']) assert.ok(job.includes(restriction), restriction);
  assert.match(job, /ref: \$\{\{ github.sha \}\}/);
  assert.match(job, /node-version: "22"/);
  assert.match(job, /timeout-minutes: 10/);
  assert.match(job, /GAME_IDS: \$\{\{ inputs.game_ids \}\}/);
  assert.match(job, /run: node scripts\/ci.mjs unlist/);
  assert.doesNotMatch(job, /npm ci|npm install|playwright|ci\.mjs (?:plan|verify|publish)|run:.*game_ids|cache: npm/);
  assert.doesNotMatch(workflow, /inputs\.action|permissions:[\s\S]*?contents: write/);
  for (const name of ['plan', 'common', 'games', 'shell', 'bootstrap-shell']) {
    const start = workflow.indexOf(`\n  ${name}:`);
    const body = workflow.slice(start, workflow.indexOf('\n    steps:', start));
    assert.ok(body.includes("github.event_name != 'workflow_dispatch'"), name);
  }
});
test('the shared full gate retains failed browser evidence without weakening verification', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/deploy.yml', import.meta.url), 'utf8');
  const common = workflow.slice(workflow.indexOf('\n  common:'), workflow.indexOf('\n  games:'));
  assert.match(common, /run: node scripts\/ci\.mjs verify all/);
  assert.match(common, /name: Preserve failed shared browser evidence\s+if: failure\(\)\s+uses: actions\/upload-artifact@v4/);
  assert.match(common, /name: shared-attempt-\$\{\{ github.run_attempt \}\}-failure\s+path: test-results\/\s+retention-days: 1\s+if-no-files-found: ignore/);
  assert.doesNotMatch(common, /continue-on-error|--update-snapshots|--retries/);
});
test('stage integration retains fresh inputs, post-test CAS/counterpart and push-only publication guards', async () => {
  const source = await readFile(new URL('../../scripts/ci.mjs', import.meta.url), 'utf8');
  const publish = source.slice(source.indexOf('export async function publish('), source.indexOf('export function validateUnlistContext('));
  assert.match(publish, /process\.env\.GITHUB_EVENT_NAME === 'push' && process\.env\.GITHUB_REF === 'refs\/heads\/main' && process\.env\.GITHUB_REPOSITORY === 'Carrick-K7\/carrick-games'/);
  assert.ok(publish.indexOf('assertPublicationVisible(plan, id, snapshot)') < publish.indexOf('if (state.revision === plan.revision'));
  assert.match(publish, /await requireFreshInputs\(plan, id\)/);
  assert.match(publish, /state\.generation === verified\.expectedGeneration && sequence > state\.sequence/);
  assert.match(publish, /counterpartFingerprint\(snapshot, id\) === verified\.counterpart/);
  assert.match(source, /StrictHostKeyChecking=yes/);
  assert.match(source, /IdentitiesOnly=yes/);
  assert.match(source, /ConnectTimeout=15/);
  assert.match(source, /ServerAliveInterval=15/);
  assert.match(source, /ServerAliveCountMax=2/);
});
