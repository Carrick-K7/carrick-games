import { test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { chooseVillaTier } from './villaBrowserPolicy.mjs';

const root=process.cwd(), env=process.env, read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const git=(...args:string[])=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
function policy() {
  const full=(reason:string)=>({tier:'full',proposed:'full',reason});
  if(env.VILLA_MODULE_URL && (env.CI || env.GITHUB_SHA || env.CG_TEST_CATALOG || env.VILLA_LOCAL_FEEDBACK)) throw Error('Pinned/feedback tests must import the built Villa, not a module override');
  if(env.GAME_ID!=='villa') return full('full-source or standalone run');
  if(env.VILLA_FULL_REGRESSION==='1') return full('explicit full regression');
  // Explicit quick iterations use the already-built preview. They never create
  // a release receipt and may not override a CI or pinned-counterpart run.
  if(env.VILLA_LOCAL_FEEDBACK && !env.CI && !env.GITHUB_SHA && !env.GITHUB_ACTIONS && !env.CG_TEST_CATALOG){
    if(!['core','outdoor','full'].includes(env.VILLA_LOCAL_FEEDBACK)) throw Error('Unrecognised Villa feedback tier');
    return {tier:env.VILLA_LOCAL_FEEDBACK,proposed:env.VILLA_LOCAL_FEEDBACK,reason:'local feedback only'};
  }
  // Only this checked-in Actions job consumes the canonical plan here. An
  // ad-hoc or local `verify --plan …` may have a different same-SHA plan.
  if(env.GITHUB_ACTIONS!=='true' || env.GITHUB_JOB!=='games' || !env.GITHUB_WORKFLOW_REF?.startsWith('Carrick-K7/carrick-games/.github/workflows/deploy.yml@')) return full('standalone or custom verification');
  try {
    if(!env.GITHUB_EVENT_PATH || !env.GITHUB_SHA || env.CG_TEST_CATALOG!==resolve(root,'dist/games/index.json')) return full('no pinned release');
    const head=git('rev-parse','HEAD'), plan=read(resolve(root,'.ci/plan.json')), t=plan.targets.find((v:{id:string})=>v.id==='villa');
    if(head!==env.GITHUB_SHA || head!==plan.revision || !/^[0-9a-f]{40}$/.test(t?.baseline??'')) return full('absent or stale plan');
    const event=read(env.GITHUB_EVENT_PATH), current=read(env.CG_TEST_CATALOG), shell=read(resolve(root,'dist/manifest.json'));
    const built=current.games.find((g:{id:string})=>g.id==='villa'), live=plan.snapshot.catalog.games.find((g:{id:string})=>g.id==='villa');
    const paired=built?.revision===head && built.version===t.version && current.generation===plan.snapshot.catalog.generation &&
      isDeepStrictEqual(current.shell,plan.snapshot.catalog.shell) && isDeepStrictEqual(shell,plan.snapshot.manifest) && shell.revision===current.shell.revision;
    const pr=plan.mode==='pr', before=pr?t.baseline:event.before, handled=live?.handledRevision;
    if(env.GITHUB_EVENT_NAME!==(pr?'pull_request':'push')) return full('event does not match plan');
    if(![before,handled].every(x=>typeof x==='string' && /^[0-9a-f]{40}$/.test(x))) return full('unknown history');
    if(pr && git('merge-base',event.pull_request.base.sha,head)!==before) return full('unexpected PR base');
    git('merge-base','--is-ancestor',before,head); git('merge-base','--is-ancestor',handled,before);
    // A docs-only push after a failed release must not narrow the unhandled Villa
    // candidate. Changes to unrelated games alone do not make this a different product.
    const cleanBeforeChange=!git('diff','--name-only',handled,before,'--','games/villa','packages/game-sdk','package.json','package-lock.json',
      'apps/shell','scripts','tests','playwright.config.ts','vite.config.ts','tsconfig.json','.github/workflows');
    return chooseVillaTier({plan,head,paired,cleanBeforeChange,attempt:Number(env.GITHUB_RUN_ATTEMPT??1),
      beforeAndAfter:(p:string)=>[t.baseline,head].map(sha=>JSON.parse(git('show',`${sha}:${p}`)))});
  } catch { return full('cannot prove narrow scope from matching checkout, preview and plan'); }
}
const scope=policy();
if(env.GAME_ID==='villa' && !env.TEST_WORKER_INDEX) process.stderr.write(`[Villa browser coverage] ${scope.tier} (proposal: ${scope.proposed}; ${scope.reason})\n`);

// The generic API-1 release contract remains unconditional in its own workspace.
// Use Playwright's native declarations: original source locations, timeout,
// devices, testInfo, isolation and real test bodies stay intact. Unclassified
// future tests written with ordinary `test()` also run, rather than silently skip.
export const lateVillaWebKit=env.VILLA_FULL_REGRESSION==='1' || scope.reason==='periodic full regression' || env.GITHUB_JOB==='common';
export const villaCore=test;
export const villaOutdoor=scope.tier==='core'?test.skip:test;
export const villaRegression=scope.tier==='full'?test:test.skip;
