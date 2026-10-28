import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const origin = 'https://games.carrick7.com';
const revision = process.env.EXPECTED_REVISION;
const version = process.env.EXPECTED_VERSION || '0.1.0';
assert.match(revision || '', /^[a-f0-9]{40}$/, 'EXPECTED_REVISION is required');
const baseline = JSON.parse(await readFile('games/red-homestead/tests/artifacts/pre-release-snapshot.json','utf8'));
const requests=[];
async function response(path) {
  const result=await fetch(new URL(path,origin),{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});
  requests.push({path,status:result.status,type:result.headers.get('content-type')});return result;
}
async function json(path) { const result=await response(path);assert.equal(result.status,200,path);assert.match(result.headers.get('content-type')||'',/application\/json/);return result.json(); }
const catalog=await json('/games/index.json'), manifest=await json('/manifest.json');
const game=catalog.games.find(g=>g.id==='red-homestead');assert.ok(game,'published game missing');
assert.equal(game.version,version);assert.equal(game.revision,revision);assert.equal(game.apiVersion,1);
assert.equal(manifest.revision,catalog.shell.revision);assert.equal(manifest.version,catalog.shell.version);
const descriptor=await json(game.assetBase+'game.json');
assert.equal(descriptor.id,'red-homestead');assert.equal(descriptor.kind,'game');assert.equal(descriptor.version,version);assert.equal(descriptor.revision,revision);assert.equal(descriptor.apiVersion,1);
assert.equal(game.entry,game.assetBase+descriptor.entry);assert.deepEqual([...game.styles].sort(),descriptor.styles.map(p=>game.assetBase+p).sort());
const types={'.js':/^(text|application)\/(javascript|ecmascript)/,'.css':/^text\/css/,'.svg':/^image\/svg\+xml/,'.webp':/^image\/webp/,'.png':/^image\/png/,'.json':/^application\/json/,'.md':/^text\/(markdown|plain)/,'.html':/^text\/html/,'.webmanifest':/^application\/(manifest\+json|json)/};
async function inventory(base,files) {
  assert.ok(files&&Object.keys(files).length);let count=0;
  for(const [path,digest] of Object.entries(files)) {
    assert.ok(!path.startsWith('/')&&!path.split('/').some(p=>p==='..'||p==='.'||p===''),'unsafe inventory path');assert.match(digest,/^[a-f0-9]{64}$/);
    const r=await response(base+path);assert.equal(r.status,200,base+path);
    const ext=path.slice(path.lastIndexOf('.')),expected=types[ext];if(expected)assert.match(r.headers.get('content-type')||'',expected,base+path);
    const bytes=Buffer.from(await r.arrayBuffer());assert.equal(createHash('sha256').update(bytes).digest('hex'),digest,base+path);count++;
  }return count;
}
const gameFiles=await inventory(game.assetBase,descriptor.files);
const shellBase=`/shell/${manifest.revision}/`, shell=await json(shellBase+'manifest.json');
assert.equal(shell.revision,manifest.revision);assert.equal(shell.version,manifest.version);assert.deepEqual(shell.files,manifest.files);
const shellFiles=await inventory(shellBase,shell.files);
const oldShellBase='/shell/831408bdee7070d459bf0190e4db8154ded6da0c/';
const oldShell=await json(oldShellBase+'manifest.json');assert.equal(oldShell.revision,'831408bdee7070d459bf0190e4db8154ded6da0c');
const retainedShellFiles=await inventory(oldShellBase,oldShell.files);
const html=await response('/');assert.equal(html.status,200);assert.match(html.headers.get('content-type')||'',/^text\/html/);assert.ok((await html.text()).includes(shellBase));
for(const prefix of [game.assetBase,shellBase,oldShellBase])assert.equal((await response(prefix+'__red_homestead_missing_probe__.js')).status,404);
const retainedGames=[];
for(const previous of baseline.catalog.games) {
  const old=await json(previous.assetBase+'game.json');assert.equal(old.revision,previous.revision);assert.equal(old.version,previous.version);
  const r=await response(previous.entry);assert.equal(r.status,200);assert.match(r.headers.get('content-type')||'',/javascript/);
  assert.equal(createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex'),old.files[old.entry]);retainedGames.push(previous.id);
}
const end=await json('/games/index.json'),endManifest=await json('/manifest.json'),active=end.games.find(g=>g.id==='red-homestead');
assert.equal(active.revision,revision);assert.equal(active.generation,game.generation);assert.equal(endManifest.revision,manifest.revision);
assert.deepEqual(end.tombstones,baseline.catalog.tombstones,'delist tombstones changed');
const unrelatedChanges=end.games.filter(g=>g.id!=='red-homestead').filter(g=>JSON.stringify(g)!==JSON.stringify(baseline.catalog.games.find(old=>old.id===g.id))).map(g=>g.id);
const report={checkedAt:new Date().toISOString(),id:'red-homestead',version,revision,targetGeneration:game.generation,catalogGeneration:catalog.generation,gameFiles,shell:{version:shell.version,revision:shell.revision,files:shellFiles},retainedShellFiles,retainedGames,unrelatedChanges,missingResource404s:3,requests};
await mkdir('games/red-homestead/tests/artifacts',{recursive:true});
await writeFile('games/red-homestead/tests/artifacts/release-audit.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,requests:requests.length},null,2));
