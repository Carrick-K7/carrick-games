import { test, expect, type Page } from '@playwright/test';
import { classicFixtureFiles } from './classicFixture.js';
async function info(page:Page):Promise<any> { return page.evaluate(()=> (window as any).__GAME_VIEWPORT_DEBUG__.info()); }
async function importMaterials(page:Page, map=true) {
  await page.goto('/#red-homestead'); await page.locator('[data-rh-action="classics"]').click();
  await page.locator('[data-rh-action="classic-files"]').setInputFiles([...classicFixtureFiles(map)].map(([name,data])=>({name,mimeType:'application/octet-stream',buffer:Buffer.from(data)})));
  await page.locator('[data-rh-action="classic-import"]').click();
  await expect(page.locator('[data-rh-import-status]')).toContainText(/已保存到本机|Saved locally/);
}
async function place(page:Page,kind:string,x:number,y:number) {
  await page.locator('[data-rh-action="build"]').click(); await page.locator(`[data-rh-action="build-${kind}"]`).click();
  const s=await info(page),r=(await page.locator('#gameCanvas').boundingBox())!;
  await page.mouse.click(r.x+((x-y)*30*s.camera.zoom+s.camera.x)*r.width/s.width,r.y+((x+y+1)*15*s.camera.zoom+s.camera.y)*r.height/s.height);
  await page.keyboard.press('Escape');
}
test('imported raw terrain is playable, renders source pixels and persists its local materials',async({page})=>{
  const uploads:string[]=[];page.on('request',request=>{if(['POST','PUT'].includes(request.method()))uploads.push(request.url());});
  await importMaterials(page);
  await page.locator('[data-rh-action^="classic-home-"]').click();
  await expect.poll(async()=>(await info(page)).started).toBe(true);
  const initial=await info(page);expect(initial.originalMapIntegrated).toBe(true);expect(initial.provenance).toBe('ra2-local');expect(initial.mode).toBe('homestead');
  await page.locator('[data-rh-action="deploy"]').click(); await place(page,'power',16,12);
  await expect.poll(async()=> (await info(page)).buildings.find((b:any)=>b.kind==='power')?.progress,{timeout:20000}).toBe(1);
  const hasMagenta=await page.locator('#gameCanvas').evaluate(canvas=>{
    const ctx=(canvas as HTMLCanvasElement).getContext('2d')!,a=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    for(let i=0;i<a.length;i+=4)if(a[i]===255&&a[i+1]===0&&a[i+2]===125&&a[i+3]===255)return true;return false;
  });expect(hasMagenta).toBe(true);
  await page.locator('[data-rh-action="worlds"]').click();await expect.poll(async()=>(await info(page)).saveState).toBe('saved');
  const before=await info(page);await page.reload();await page.locator(`[data-rh-action="load-${before.worldId}"]`).click();
  await expect.poll(async()=>(await info(page)).worldId).toBe(before.worldId);
  const after=await info(page);expect(after.worldId).toBe(before.worldId);expect(after.materialsId).toBe(before.materialsId);expect(after.originalMapIntegrated).toBe(true);expect(after.time-before.time).toBeLessThan(1);
  expect(uploads).toEqual([]);
});
test('missing required material cache does not pretend to restore a source home',async({page})=>{
  await importMaterials(page);await page.locator('[data-rh-action^="classic-home-"]').click();
  await page.locator('[data-rh-action="worlds"]').click();await expect.poll(async()=>(await info(page)).saveState).toBe('saved'); const id=(await info(page)).worldId;
  await page.evaluate(()=>new Promise<void>((resolve,reject)=>{
    const open=indexedDB.open('cg-red-homestead-materials',1);open.onsuccess=()=>{const db=open.result,tx=db.transaction(['bundles','catalog'],'readwrite');tx.objectStore('bundles').clear();tx.objectStore('catalog').clear();tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};open.onerror=()=>reject(open.error);
  }));
  await page.reload();await page.locator(`[data-rh-action="load-${id}"]`).click();await expect(page.locator('[data-rh-panel-error]')).toContainText(/缺少.*素材|needs local materials/);
  expect((await info(page)).started).toBe(false);await expect(page.locator(`[data-rh-action="load-${id}"]`)).toBeVisible();
});
test('sprite-only materials affect live buildings without replacing an authored world',async({page})=>{
  await importMaterials(page,false); await page.locator('[data-rh-action^="classic-session-"]').click();
  await expect.poll(async()=>(await info(page)).started).toBe(true);
  const s=await info(page);expect(s.sourceArtIntegrated).toBe(true);expect(s.originalMapIntegrated).toBe(false);expect(s.materialsId).toMatch(/^[a-f0-9]{64}$/);
  await page.locator('[data-rh-action="deploy"]').click();await place(page,'power',10,6);expect((await info(page)).buildings.some((b:any)=>b.kind==='power')).toBe(true);
});
test('a snow map chooses its own theater instead of the sprite-only dropdown default',async({page})=>{
  const files=classicFixtureFiles();
  files.set('fixture.map',new TextEncoder().encode(new TextDecoder().decode(files.get('fixture.map')).replace('Theater=TEMPERATE','Theater=SNOW')));
  for(const [oldName,newName] of [['temperat.ini','snow.ini'],['clear01.tem','clear01.sno'],['isotem.pal','isosno.pal'],['unittem.pal','unitsno.pal']]) {files.set(newName!,files.get(oldName!)!);files.delete(oldName!);}
  await page.goto('/#red-homestead');await page.locator('[data-rh-action="classics"]').click();
  await page.locator('[data-rh-action="classic-files"]').setInputFiles([...files].map(([name,data])=>({name,mimeType:'application/octet-stream',buffer:Buffer.from(data)})));
  await page.locator('[data-rh-action="classic-import"]').click();await expect(page.locator('[data-rh-import-status]')).toContainText(/已保存到本机|Saved locally/);
  await page.locator('[data-rh-action^="classic-session-"]').click();await expect.poll(async()=>(await info(page)).started).toBe(true);
  expect((await info(page)).source.theater).toBe('SNOW');expect((await info(page)).originalMapIntegrated).toBe(true);
});

test('a failed import keeps the current city and displays the missing resource',async({page})=>{
  await page.goto('/#red-homestead');await page.locator('[data-rh-action="new-session"]').click(); const id=(await info(page)).worldId;
  await page.locator('[data-rh-action="worlds"]').click(); await page.locator('[data-rh-action="classics"]').click();
  const files=classicFixtureFiles();files.delete('clear01.tem');
  await page.locator('[data-rh-action="classic-files"]').setInputFiles([...files].map(([name,data])=>({name,mimeType:'application/octet-stream',buffer:Buffer.from(data)})));
  await page.locator('[data-rh-action="classic-import"]').click();await expect(page.locator('[data-rh-import-status]')).toContainText('clear01');
  expect((await info(page)).worldId).toBe(id);await page.locator('[data-rh-action="close-panel"]').click();expect((await info(page)).worldId).toBe(id);
});
