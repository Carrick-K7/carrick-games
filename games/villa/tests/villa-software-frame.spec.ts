import { villaCore } from './villaBrowserCases';
import { expect, test } from '@playwright/test';
import { gameModuleUrl } from '../../../tests/support/releases';
import { openVillaFixturePage } from './villaBrowserHost';

villaCore('software world presents the actual completed RGBA frame and its camera; an intervening action discards the pending frame',async({page})=>{
  test.setTimeout(90_000); await openVillaFixturePage(page);
  const result=await page.evaluate(async url=>{
    const { VillaGame }=await import(url);const canvas=document.createElement('canvas');document.querySelector('#gameApp')!.append(canvas);
    const game=new VillaGame({canvas,logicalWidth:400,logicalHeight:250,isDarkTheme:()=>false,isZhLang:()=>true,isPixelMode:()=>false,getRecord:()=>null,reportScore(){},requestShellRender(){}}) as any;
    try {
      game.prepare();game.start();cancelAnimationFrame(game.animationId);game.audio?.setEnabled(false);
      const s=game.scene; s.lowSpec=true; s.renderer.shadowMap.enabled=false;
      // A photo finishing its decode legitimately invalidates the old picture. Establish
      // the settled scene before comparing a ticket against the exact same synchronous bytes.
      const surfaces=await s.groundSwatches.ready;if(!['turf','gravel','timber'].every(k=>surfaces[k]==='decoded'))throw Error('Ground art did not decode');
      game.position={x:-7.46,y:0,z:1.2};game.eyeY=0;game.yaw=-.36;game.pitch=-.43;game.time=2;
      s.lastDrawAt=-Infinity;s.softwareInputFrames=0;game.renderFrame();const before=s.camera.position.toArray();
      game.position.x+=.41;game.time+=.03;s.softwareInputFrames=0;s.lastDrawAt=performance.now()-100;
      game.renderFrame();const pending=!!s.readback?.pending,shown=s.camera.position.toArray(),submitted=s.renderer.info.render.frame;
      // Read the byte-exact synchronous bridge in the same task (before the default WebGL
      // framebuffer may be cleared), independent of the asynchronous row-flip/readback path.
      const dst=document.createElement('canvas');dst.width=s.cachedFrame.width;dst.height=s.cachedFrame.height;
      const ctx=dst.getContext('2d')!;ctx.drawImage(s.renderer.domElement,0,0);const expected=ctx.getImageData(0,0,dst.width,dst.height).data;
      for(let i=0;i<80 && s.readback?.pending;i++){await new Promise(resolve=>requestAnimationFrame(resolve));game.time+=.015;game.renderFrame();}
      const actual=s.cachedFrame.getContext('2d').getImageData(0,0,dst.width,dst.height).data;
      let different=0;for(let i=0;i<actual.length;i++)if(actual[i]!==expected[i])different++;
      const presented=s.camera.position.toArray(),sameFrame=submitted===s.renderer.info.render.frame;
      game.position.x+=.09;game.time+=.03;s.softwareInputFrames=0;s.lastDrawAt=performance.now()-100;game.renderFrame();const otherPending=s.readback.pending;
      game.state.fireplace=!game.state.fireplace;game.position.x+=.19;game.time+=.02;game.renderFrame();
      return {pending,sameFrame,different,colors:new Set(expected).size,correctDisplayedEye:before.every((v:number,i:number)=>v===shown[i]),
        matchingCompletedEye:Math.abs(presented[0]-before[0]-.41)<1e-6,otherPending, freshAction:!s.readback.pending && Math.abs(s.camera.position.x-game.position.x)<1e-6};
    } finally {game.destroy();canvas.remove();}
  },gameModuleUrl('villa'));
  expect(result).toMatchObject({pending:true,sameFrame:true,different:0,correctDisplayedEye:true,matchingCompletedEye:true,otherPending:true,freshAction:true});
  expect(result.colors).toBeGreaterThan(100);
});
