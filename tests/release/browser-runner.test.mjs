import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// ubuntu-latest moved a real runner to 26.04, which the locked Playwright rejects
// before any browser test. Pin its supported OS, rather than spoofing the platform.
test('every browser build/verification cell uses the supported Ubuntu 24.04 runner', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/deploy.yml', import.meta.url), 'utf8');
  const jobsAt = workflow.indexOf('\njobs:\n');
  assert.notEqual(jobsAt, -1);
  const jobs = workflow.slice(jobsAt + '\njobs:\n'.length);
  const starts = [...jobs.matchAll(/^  ([a-z][a-z0-9_-]*):\s*$/gm)];
  const blocks = starts.map((match, index) => ({
    name: match[1], body: jobs.slice(match.index, starts[index + 1]?.index ?? jobs.length),
  }));
  const browserCells = blocks.filter(job => job.body.includes('npx playwright install --with-deps chromium webkit'));
  assert.deepEqual(browserCells.map(job => job.name).sort(), ['bootstrap-shell', 'common', 'games', 'shell']);
  for (const job of browserCells) assert.match(job.body, /^    runs-on: ubuntu-24\.04$/m, job.name);
  assert.doesNotMatch(workflow, /PLAYWRIGHT_HOST_PLATFORM_OVERRIDE/);
});
