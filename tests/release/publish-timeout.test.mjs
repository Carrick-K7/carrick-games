import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PassThrough, Writable } from 'node:stream';
import {
  PUBLISH_TIMEOUT_MS,
  publishFailureDetail,
  runRestrictedPublication,
  withDeploymentSSH,
} from '../../scripts/ci.mjs';

function fakeChild() {
  const child = new EventEmitter();
  child.stdin = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  child.stderr = new PassThrough();
  child.killed = [];
  child.kill = signal => child.killed.push(signal);
  return child;
}

async function withArchive(callback) {
  const directory = await mkdtemp(join(tmpdir(), 'publish-timeout-'));
  const archive = join(directory, 'candidate.tar.gz');
  await writeFile(archive, 'archive');
  try {
    return await callback(archive);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('restricted SSH args carry the connection and keepalive timeouts', async () => {
  const runnerTemp = await mkdtemp(join(tmpdir(), 'ssh-args-'));
  try {
    const environment = {
      SSH_HOST: 'example.com',
      SSH_USER: 'deploy',
      DEPLOY_PORT: '2222',
      SSH_KEY: 'ssh-key',
      DEPLOY_KNOWN_HOSTS: 'known-hosts',
      RUNNER_TEMP: runnerTemp,
    };
    const sshArgs = await withDeploymentSSH(async args => args, { environment });
    for (const option of ['ConnectTimeout=15', 'ServerAliveInterval=15', 'ServerAliveCountMax=4']) {
      assert.ok(sshArgs.includes(option), `missing ${option}`);
    }
    assert.equal(sshArgs[sshArgs.length - 1], 'deploy@example.com');
  } finally {
    await rm(runnerTemp, { recursive: true, force: true });
  }
});

test('a stuck ssh child is killed at the deadline and reports a timeout', async () => {
  await withArchive(async archive => {
    const child = fakeChild();
    const calls = [];
    const spawnImpl = (command, args, options) => {
      calls.push({ command, args, options });
      return child;
    };
    const started = Date.now();
    const result = runRestrictedPublication({
      sshArgs: ['-p', '2222', '--', 'deploy@example.com'],
      command: 'deploy-game villa 1.11.0',
      archive,
      timeoutMs: 40,
      spawnImpl,
    });
    child.stderr.write('ssh: connecting\n');
    await assert.rejects(result, error => {
      assert.match(error.message, /Restricted publication timed out after/);
      assert.match(error.message, /ssh: connecting/);
      return true;
    });
    assert.deepEqual(child.killed, ['SIGKILL']);
    assert.equal(calls[0].command, 'ssh');
    assert.equal(calls[0].args.at(-1), 'deploy-game villa 1.11.0');
    assert.deepEqual(calls[0].options.stdio, ['pipe', 'inherit', 'pipe']);
    assert.ok(Date.now() - started < 2000);
    assert.equal(PUBLISH_TIMEOUT_MS, 600_000);
  });
});

test('nonzero exit carries the first stderr lines in the error', async () => {
  await withArchive(async archive => {
    const child = fakeChild();
    const result = runRestrictedPublication({
      sshArgs: [],
      command: 'deploy',
      archive,
      timeoutMs: 5000,
      spawnImpl: () => child,
    });
    child.stderr.write('remote: lock held\nremote: aborting\n');
    setImmediate(() => child.emit('exit', 7));
    await assert.rejects(result, error => {
      assert.match(error.message, /Restricted publication failed \(7\)/);
      assert.match(error.message, /remote: lock held/);
      assert.match(error.message, /remote: aborting/);
      return true;
    });
  });
});

test('zero exit resolves the publication', async () => {
  await withArchive(async archive => {
    const child = fakeChild();
    const result = runRestrictedPublication({
      sshArgs: [],
      command: 'deploy',
      archive,
      timeoutMs: 5000,
      spawnImpl: () => child,
    });
    setImmediate(() => child.emit('exit', 0));
    await result;
  });
});

test('publishFailureDetail is empty without stderr and keeps the first lines', () => {
  assert.equal(publishFailureDetail([]), '');
  assert.match(publishFailureDetail(['first', 'second']), /stderr:\nfirst\nsecond/);
});
