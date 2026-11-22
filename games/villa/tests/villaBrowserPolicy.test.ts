import { describe, expect, it } from 'vitest';
import { chooseVillaTier, classifyVillaInputs } from './villaBrowserPolicy.mjs';

const base='a'.repeat(40), head='b'.repeat(40);
const reason=(p:string)=>`pending:runtime:villa:games/villa/${p}`;
const old={ name:'@carrick/game-villa', version:'1.13.2', dependencies:{three:'^0.185.1'} }, next={...old,version:'1.13.3'};
const lock=(v:typeof old)=>({lockfileVersion:3,packages:{'games/villa':v,'node_modules/three':{version:'0.185.1'}}});
const docs=(p:string)=> p==='games/villa/package.json'?[old,next]:[lock(old),lock(next)];
function candidate(reasons=[reason('src/villaLawnFinish.ts')], generation=21) {
  const live={id:'villa',generation,revision:base,handledRevision:base};
  return {head,attempt:1,cleanBeforeChange:true,paired:true,beforeAndAfter:docs,plan:{schemaVersion:1,mode:'main',revision:head,full:false,bootstrap:false,sourceOnly:false,
    snapshot:{catalog:{games:[live]}},targets:[{id:'villa',full:false,expectedGeneration:generation,baseline:base,reasons}]}};
}

describe('Villa browser coverage is narrowed only by proven leaf inputs',()=>{
  it('distinguishes a cover/icon from water/lawn, with an independent version-only workspace record',()=>{
    expect(chooseVillaTier(candidate([reason('public/icon.svg')])).tier).toBe('core');
    const rs=[reason('package.json'),'pending:workspace-lock:villa',reason('public/cover.webp'),reason('src/villaPoolCirculation.ts')];
    expect(classifyVillaInputs(rs,docs)).toBe('outdoor');
    expect(classifyVillaInputs(rs,(p:string)=>p==='package-lock.json'?[lock(old),{...lock(next),lockfileVersion:4}]:docs(p))).toBe('full');
    expect(classifyVillaInputs(rs,(p:string)=>p==='games/villa/package.json'?[old,{...next,dependencies:{three:'other'}}]:docs(p))).toBe('full');
    expect(classifyVillaInputs(rs,()=>{throw Error('missing baseline');})).toBe('full');
    const meta={name:'Villa',desc:'Old',canvasSize:{width:1120,height:700}};
    expect(classifyVillaInputs([reason('game.json')],()=>[meta,{...meta,desc:'New'}])).toBe('core');
    expect(classifyVillaInputs([reason('game.json')],()=>[meta,{...meta,canvasSize:{width:360,height:640}}])).toBe('full');
  });
  it('keeps total coverage for a new file, modified tests, a shared shader, lifecycle, SDK, or uncertain reason',()=>{
    for(const r of ['trigger:test:villa:games/villa/tests/villa-ios.spec.ts','pending:runtime:game-sdk:packages/game-sdk/src/game.ts','bootstrap',reason('src/villaScene.ts'),reason('src/villaWallVisibility.ts'),reason('src/villa.ts'),reason('src/unknown.ts'),reason('public/other.webp')]){
      expect(classifyVillaInputs([r,reason('src/villaLawnFinish.ts')],docs),r).toBe('full');
    }
    expect(classifyVillaInputs([],docs)).toBe('full');expect(classifyVillaInputs([reason('package.json')],docs)).toBe('full');
  });
  it('never discounts outstanding runtime work, stale plans, a changed counterpart or retry',()=>{
    const a=candidate();for(const patch of [{head:base},{head:''},{paired:false},{attempt:2},{cleanBeforeChange:false}]) expect(chooseVillaTier({...a,...patch}).tier).toBe('full');
    for(const patch of [{full:true},{bootstrap:true},{sourceOnly:true},{mode:'unknown'},{targets:[]},{targets:[{...a.plan.targets[0],error:'stale'}]}]) expect(chooseVillaTier({...a,plan:{...a.plan,...patch}}).tier).toBe('full');
    a.plan.snapshot.catalog.games[0].revision=head;expect(chooseVillaTier(a).tier).toBe('full');
  });
  it('compares reduced proposals to full releases during rollout and at the periodic checkpoint',()=>{
    for(const g of [18,19,20,24]) expect(chooseVillaTier(candidate([reason('public/cover.webp')],g))).toMatchObject({tier:'full',proposed:'core'});
    const pr=candidate([reason('src/villaRiparianMotion.ts')],19);pr.plan.mode='pr';expect(chooseVillaTier(pr).tier).toBe('outdoor');
  });
});
