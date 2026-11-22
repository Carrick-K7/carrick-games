#!/usr/bin/env node
// Developer feedback only; the publisher requires the independent CI receipt.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const [tier, option, ...extra]=process.argv.slice(2);
if(!['core','outdoor','full'].includes(tier) || (option!==undefined && option!=='--list') || extra.length){
  console.error('Usage: node games/villa/tests/check-browser.mjs core|outdoor|full [--list] (from a built preview)');process.exit(2);
}
if(process.env.VILLA_MODULE_URL) throw Error('Feedback must test the catalog entry, not an alternate module');
if(process.env.CI || process.env.GITHUB_ACTIONS || process.env.GITHUB_SHA || process.env.CG_TEST_CATALOG){
  console.error('Local feedback cannot select the scope of a pinned CI run. Use the release orchestrator.');process.exit(2);
}
const root=fileURLToPath(new URL('../../../',import.meta.url)), catalog=resolve(root,'dist/games/index.json');
if(!existsSync(catalog)) throw Error('No built preview. Run npm run build or prepare the pinned Villa store first.');
const game=JSON.parse(readFileSync(catalog,'utf8')).games.find(g=>g.id==='villa');
if(!game) throw Error('The preview does not contain Villa');
console.error(`Testing built Villa ${game.version} ${game.revision}; no publish receipt will be created.`);
const listing=option==='--list';
const result=spawnSync(process.execPath,['node_modules/@playwright/test/cli.js','test','games/villa/tests/','tests/contract\\.spec\\.ts$',
  '--output',`games/villa/test-results/feedback/${tier}`,...(listing?['--list','--reporter=json']:[])],{cwd:root,encoding:'utf8',stdio:listing?['ignore','pipe','inherit']:'inherit',
  env:{...process.env,GAME_ID:'villa',VILLA_LOCAL_FEEDBACK:tier}});
if(result.error) throw result.error;process.exitCode=result.status??1;
if(listing && !process.exitCode){
  const rows=[];
  const visit=(s,path=[])=>{const names=[...path,s.title];for(const spec of s.specs??[])for(const test of spec.tests)rows.push({name:[...names,spec.title].join(' › '),run:test.expectedStatus==='passed'});for(const child of s.suites??[])visit(child,names);};
  for(const suite of JSON.parse(result.stdout).suites)visit(suite);
  const included=rows.filter(row=>row.run);console.log(included.map(row=>row.name).join('\n'));console.log(`${tier}: ${included.length} selected of ${rows.length} registered.`);
}
